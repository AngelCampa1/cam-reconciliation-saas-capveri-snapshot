"""
Stripe webhook handlers.

These endpoints receive events from Stripe and update local database state.
All handlers must be idempotent - processing the same event twice should
produce the same result.
"""

import logging
from datetime import UTC, datetime
from typing import Any, cast

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import get_settings
from app.database import get_supabase_admin
from app.database.client import SupabaseDB
from app.services.admin_notifications import AdminNotificationService
from app.services.analytics.posthog import BillingEventName, capture_billing_event
from app.services.billing.activation import mark_checkout_complete
from app.services.billing.config import APP_IDENTIFIER, get_stripe_settings
from app.services.billing.generated_plan_tiers import (
    TIERS,
    TRIAL_DAYS,
    get_launch_offer_annual_cents,
)
from app.services.billing.plans import get_annual_total_cents_for_tier
from app.services.email import build_email_service

logger = logging.getLogger(__name__)

# Invoice events do NOT inherit metadata from their parent subscription,
# so we cannot filter them by app — they must always be processed.
# Using a denylist (non-filterable) rather than allowlist so that new
# event types added in the future are filtered by default.
_NON_FILTERABLE_EVENT_TYPES = {
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.created",
}

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_CHECKOUT_PLAN_TO_SUBSCRIPTION_PLAN = {
    "reconcile": "growth_v2",
    "control": "growth_v2",
    "defend": "growth_v2",
    "growth": "growth_v2",
    "enterprise": "enterprise",
}


class _ServiceCtx:
    """Minimal org-scoped context adapter for billing service functions called from webhooks."""  # noqa: E501

    def __init__(self, organization_id: str, db: SupabaseDB) -> None:
        self.organization_id = organization_id
        self._db = db

    def table(self, name: str) -> Any:
        return self._db.table(name)


@router.post("/stripe")
async def handle_stripe_webhook(
    request: Request,
    db: SupabaseDB = Depends(get_supabase_admin),
) -> dict[str, Any]:
    """
    Handle incoming Stripe webhook events.

    Verifies signature and dispatches to appropriate handler.
    """
    # Get raw body for signature verification
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(400, "Missing stripe-signature header")

    settings = get_stripe_settings()

    try:
        event = stripe.Webhook.construct_event(  # type: ignore[no-untyped-call]
            payload,
            sig_header,
            settings.stripe_webhook_secret,
        )
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    # Log received webhook event
    logger.info(f"Received Stripe webhook: {event.type} (id: {event.id})")

    # Deduplicate: claim event atomically before dispatch
    claimed = await _claim_webhook_event(db, event.id, event.type)
    if not claimed:
        logger.info(f"Duplicate webhook event {event.id} skipped")
        return {"received": True}

    # Dispatch to handler based on event type
    handlers = {
        "customer.subscription.created": handle_subscription_created,
        "customer.subscription.trial_will_end": handle_subscription_trial_will_end,
        "customer.subscription.updated": handle_subscription_updated,
        "customer.subscription.deleted": handle_subscription_deleted,
        "invoice.paid": handle_invoice_paid,
        "invoice.payment_failed": handle_invoice_payment_failed,
        "invoice.created": handle_invoice_created,
        "checkout.session.completed": handle_checkout_session_completed,
    }

    handler = handlers.get(event.type)
    if handler:
        logger.info(f"Dispatching to handler for {event.type}")
        # Stripe SDK >= 5.x returns StripeObject instead of dict;
        # convert to plain dict so handlers can use .get() safely.
        event_obj = event.data.object
        event_data = cast(
            dict[str, Any],
            (
                event_obj.to_dict_recursive()
                if hasattr(event_obj, "to_dict_recursive")
                else event_obj
            ),
        )
        event_data["__event_id"] = event.id
        event_data["__previous_attributes"] = getattr(
            event.data, "previous_attributes", {}
        )
        # Skip events from other apps sharing this Stripe account.
        if event.type not in _NON_FILTERABLE_EVENT_TYPES:
            event_app = (event_data.get("metadata") or {}).get("app")
            if event_app and event_app != APP_IDENTIFIER:
                logger.info(
                    f"Skipping {event.type} from app={event_app} "
                    f"(this is {APP_IDENTIFIER})"
                )
                await _complete_webhook_event(db, event.id)
                return {"received": True}

        try:
            await handler(event_data, db)
            await _complete_webhook_event(db, event.id)
            logger.info(f"Successfully processed {event.type}")
        except Exception:
            await _release_webhook_event(db, event.id)
            raise
    else:
        logger.warning(f"No handler for event type: {event.type}")
        await _complete_webhook_event(db, event.id)

    return {"received": True}


async def handle_subscription_created(sub: dict[str, Any], db: SupabaseDB) -> None:
    """Handle new subscription creation."""
    logger.info(f"Processing subscription.created: {sub.get('id')}")
    logger.info(f"Subscription metadata: {sub.get('metadata', {})}")
    logger.info(f"Customer ID: {sub.get('customer')}")

    org_id = sub.get("metadata", {}).get("organization_id")
    logger.info(f"Org ID from metadata: {org_id}")

    if not org_id:
        # Try to find org by customer ID
        customer_id = sub.get("customer")
        if customer_id:
            org_id = await _get_org_by_customer(str(customer_id), db)
        logger.info(f"Org ID from customer lookup: {org_id}")

    if not org_id:
        logger.warning(
            f"Cannot link subscription {sub.get('id')} - no organization found"
        )
        return  # Cannot link subscription without org

    metadata = sub.get("metadata", {}) or {}

    # Extract building_count from subscription item quantity
    items = sub.get("items", {})
    items_data = items.get("data", []) if isinstance(items, dict) else []
    building_count = items_data[0].get("quantity", 1) if items_data else 1
    price = items_data[0].get("price", {}) if items_data else {}
    price_id = price.get("id") if isinstance(price, dict) else None
    pricing_model = metadata.get("pricing_model", "per_building")
    if pricing_model == "per_unit":
        building_count = int(metadata.get("building_count", building_count))
    unit_count = int(metadata["unit_count"]) if metadata.get("unit_count") else None
    included_units = (
        int(metadata["included_units"]) if metadata.get("included_units") else None
    )
    unit_overage_count = (
        int(metadata["unit_overage_count"])
        if metadata.get("unit_overage_count")
        else None
    )
    resolved_plan = _CHECKOUT_PLAN_TO_SUBSCRIPTION_PLAN.get(
        str(metadata.get("plan_id", ""))
    ) or (_map_price_to_plan(price_id) if price_id else "growth_v2")
    resolved_tier = str(metadata.get("plan_id") or "defend")

    logger.info(
        f"Creating subscription for org {org_id}: "
        f"plan={price_id}, buildings={building_count}"
    )
    logger.info(f"Subscription keys: {list(sub.keys())}")

    # Access period timestamps - use start_date and billing_cycle_anchor as fallbacks
    # In subscription.created event, current_period fields may not be set yet
    period_start = (
        sub.get("current_period_start") or sub.get("start_date") or sub.get("created")
    )
    period_end = sub.get("current_period_end") or sub.get("billing_cycle_anchor")
    logger.info(
        f"current_period_start: {period_start}, current_period_end: {period_end}"
    )

    # Use upsert for idempotency
    result = (
        db.table("subscriptions")
        .upsert(
            {
                "organization_id": org_id,
                "stripe_subscription_id": sub.get("id"),
                "stripe_customer_id": sub.get("customer"),
                "plan": resolved_plan,
                "tier": resolved_tier,
                "status": _map_subscription_status(sub.get("status")),
                "pricing_model": pricing_model,
                "building_count": building_count,
                "unit_count": unit_count,
                "included_units": included_units,
                "unit_overage_count": unit_overage_count,
                "current_period_start": (
                    datetime.fromtimestamp(int(period_start), tz=UTC).isoformat()
                    if period_start
                    else datetime.now(UTC).isoformat()
                ),
                "current_period_end": (
                    datetime.fromtimestamp(int(period_end), tz=UTC).isoformat()
                    if period_end
                    else datetime.now(UTC).isoformat()
                ),
                "cancel_at_period_end": sub.get("cancel_at_period_end", False),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            on_conflict="organization_id",
        )
        .execute()
    )

    logger.info(f"Subscription created successfully: {result.data}")
    mark_checkout_complete(db, str(org_id))
    await capture_billing_event(
        "subscription_started",
        organization_id=str(org_id),
        properties={
            "stripe_subscription_id": sub.get("id"),
            "stripe_customer_id": sub.get("customer"),
            "plan": resolved_plan,
            "tier": resolved_tier,
            "subscription_status": _map_subscription_status(sub.get("status")),
            "pricing_model": pricing_model,
            "building_count": building_count,
            "unit_count": unit_count,
            "included_units": included_units,
            "unit_overage_count": unit_overage_count,
            "cancel_at_period_end": sub.get("cancel_at_period_end", False),
        },
    )

    # Notify admin of new real-user subscription — fire and forget
    try:
        user_row = (
            db.table("users")
            .select("email, full_name")
            .eq("organization_id", org_id)
            .eq("role", "admin")
            .limit(1)
            .single()
            .execute()
        )
        org_row = (
            db.table("organizations").select("name").eq("id", org_id).single().execute()
        )
        settings = get_settings()
        email_service = build_email_service(settings)
        admin_svc = AdminNotificationService(
            email_service, settings.admin_notification_email
        )
        await admin_svc.notify_subscription_started(
            user_email=user_row.data["email"],
            org_name=org_row.data.get("name", org_id),
            plan=resolved_plan,
            building_count=building_count,
        )
    except Exception as e:
        logger.warning("Admin subscription notification failed: %s", e, exc_info=True)

    if _map_subscription_status(sub.get("status")) == "trialing":
        await _send_trial_lifecycle_email(
            db=db,
            sub=sub,
            email_type="trial_started",
            organization_id=str(org_id),
        )


async def handle_subscription_updated(sub: dict[str, Any], db: SupabaseDB) -> None:
    """Handle subscription updates (plan, status, quantity changes, etc.)."""
    metadata = sub.get("metadata", {}) or {}
    # Extract building_count from subscription item quantity
    items = sub.get("items", {})
    items_data = items.get("data", []) if isinstance(items, dict) else []
    building_count = items_data[0].get("quantity", 1) if items_data else 1
    price = items_data[0].get("price", {}) if items_data else {}
    price_id = price.get("id") if isinstance(price, dict) else None
    pricing_model = metadata.get("pricing_model", "per_building")
    if pricing_model == "per_unit":
        building_count = int(metadata.get("building_count", building_count))
    unit_count = int(metadata["unit_count"]) if metadata.get("unit_count") else None
    included_units = (
        int(metadata["included_units"]) if metadata.get("included_units") else None
    )
    unit_overage_count = (
        int(metadata["unit_overage_count"])
        if metadata.get("unit_overage_count")
        else None
    )
    resolved_plan = _CHECKOUT_PLAN_TO_SUBSCRIPTION_PLAN.get(
        str(metadata.get("plan_id", ""))
    ) or (_map_price_to_plan(price_id) if price_id else "growth_v2")
    resolved_tier = str(metadata.get("plan_id") or "defend")

    # Access period timestamps - use fallbacks
    period_start = (
        sub.get("current_period_start") or sub.get("start_date") or sub.get("created")
    )
    period_end = sub.get("current_period_end") or sub.get("billing_cycle_anchor")

    # Build update dict - only include period fields if they exist
    update_data: dict[str, Any] = {
        "plan": resolved_plan,
        "tier": resolved_tier,
        "status": _map_subscription_status(sub.get("status")),
        "pricing_model": pricing_model,
        "building_count": building_count,
        "unit_count": unit_count,
        "included_units": included_units,
        "unit_overage_count": unit_overage_count,
        "cancel_at_period_end": sub.get("cancel_at_period_end", False),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    if period_start:
        update_data["current_period_start"] = datetime.fromtimestamp(
            int(period_start), tz=UTC
        ).isoformat()
    if period_end:
        update_data["current_period_end"] = datetime.fromtimestamp(
            int(period_end), tz=UTC
        ).isoformat()

    # Find by stripe_subscription_id and update
    db.table("subscriptions").update(update_data).eq(
        "stripe_subscription_id", sub.get("id")
    ).execute()
    org_id = metadata.get("organization_id")
    if not org_id:
        customer_id = sub.get("customer")
        if customer_id:
            org_id = await _get_org_by_customer(str(customer_id), db)
    if org_id:
        mark_checkout_complete(db, str(org_id))
        previous_attributes = sub.get("__previous_attributes") or {}
        capture_event: BillingEventName | None = None
        if (
            sub.get("cancel_at_period_end") is True
            and previous_attributes.get("cancel_at_period_end") is False
        ):
            capture_event = "subscription_cancel_scheduled"
        elif (
            sub.get("cancel_at_period_end") is False
            and previous_attributes.get("cancel_at_period_end") is True
        ):
            capture_event = "subscription_reactivated"

        if capture_event:
            await capture_billing_event(
                capture_event,
                organization_id=str(org_id),
                properties={
                    "stripe_subscription_id": sub.get("id"),
                    "stripe_customer_id": sub.get("customer"),
                    "plan": resolved_plan,
                    "tier": resolved_tier,
                    "subscription_status": _map_subscription_status(sub.get("status")),
                    "pricing_model": pricing_model,
                    "building_count": building_count,
                    "unit_count": unit_count,
                    "included_units": included_units,
                    "unit_overage_count": unit_overage_count,
                    "cancel_at_period_end": sub.get("cancel_at_period_end", False),
                },
            )

    if _map_subscription_status(sub.get("status")) == "paused":
        await _send_trial_lifecycle_email(
            db=db,
            sub=sub,
            email_type="trial_paused",
        )


async def handle_subscription_trial_will_end(
    sub: dict[str, Any], db: SupabaseDB
) -> None:
    """Send the 3-day reminder before a trial converts."""
    org_id = sub.get("metadata", {}).get("organization_id")
    if not org_id:
        customer_id = sub.get("customer")
        if customer_id:
            org_id = await _get_org_by_customer(str(customer_id), db)

    await _send_trial_lifecycle_email(
        db=db,
        sub=sub,
        email_type="trial_ending_soon",
        organization_id=str(org_id) if org_id else None,
    )


async def handle_subscription_deleted(sub: dict[str, Any], db: SupabaseDB) -> None:
    """Handle subscription cancellation/deletion."""
    db.table("subscriptions").update(
        {
            "status": "canceled",
            "updated_at": datetime.now(UTC).isoformat(),
        }
    ).eq("stripe_subscription_id", sub.get("id")).execute()
    metadata = sub.get("metadata", {}) or {}
    org_id = metadata.get("organization_id")
    if not org_id:
        customer_id = sub.get("customer")
        if customer_id:
            org_id = await _get_org_by_customer(str(customer_id), db)
    if org_id:
        await capture_billing_event(
            "subscription_cancelled",
            organization_id=str(org_id),
            properties={
                "stripe_subscription_id": sub.get("id"),
                "stripe_customer_id": sub.get("customer"),
                "subscription_status": "canceled",
                "cancel_at_period_end": sub.get("cancel_at_period_end", False),
            },
        )


async def handle_invoice_created(invoice: dict[str, Any], db: SupabaseDB) -> None:
    """Handle new invoice creation."""
    logger.info(f"Processing invoice.created: {invoice.get('id')}")

    customer_id = invoice.get("customer")
    org_id = None
    if customer_id:
        org_id = await _get_org_by_customer(str(customer_id), db)
    if not org_id:
        logger.warning(
            f"Cannot link invoice {invoice.get('id')} - no organization found"
        )
        return

    subscription_id = invoice.get("subscription")
    sub_id = None
    if subscription_id:
        sub_id = await _get_sub_id(str(subscription_id), db)

    # Extract amounts with safe defaults
    amount_due_cents = invoice.get("amount_due", 0)
    amount_due = int(amount_due_cents) / 100 if amount_due_cents else 0
    amount_paid_cents = invoice.get("amount_paid", 0)
    amount_paid = int(amount_paid_cents) / 100 if amount_paid_cents else 0

    # Extract timestamps - use line item periods if invoice period is invalid
    period_start = invoice.get("period_start")
    period_end = invoice.get("period_end")
    due_date = invoice.get("due_date")

    # If invoice-level periods are invalid, try to get from line items
    if period_start and period_end and period_start >= period_end:
        lines = invoice.get("lines", {}).get("data", [])
        if lines and lines[0].get("period"):
            line_period = lines[0]["period"]
            period_start = line_period.get("start")
            period_end = line_period.get("end")
            logger.info(f"Using line item period for invoice {invoice.get('id')}")

    # Skip invoices with invalid periods
    if not period_start or not period_end or period_start >= period_end:
        logger.warning(f"Skipping invoice {invoice.get('id')} - invalid billing period")
        return

    invoice_data = {
        "organization_id": org_id,
        "subscription_id": sub_id,
        "stripe_invoice_id": invoice.get("id"),
        "amount_due": amount_due,
        "amount_paid": amount_paid,
        "currency": invoice.get("currency", "usd"),
        "status": invoice.get("status", "draft"),
        "period_start": datetime.fromtimestamp(int(period_start), tz=UTC).isoformat(),
        "period_end": datetime.fromtimestamp(int(period_end), tz=UTC).isoformat(),
        "due_date": (
            datetime.fromtimestamp(int(due_date), tz=UTC).isoformat()
            if due_date
            else None
        ),
        "pdf_url": invoice.get("invoice_pdf"),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    # Check if invoice already exists
    existing = (
        db.table("invoices")
        .select("id")
        .eq("stripe_invoice_id", invoice.get("id"))
        .execute()
    )

    if existing.data:
        # Update existing invoice
        db.table("invoices").update(invoice_data).eq(
            "stripe_invoice_id", invoice.get("id")
        ).execute()
        logger.info(f"Updated existing invoice: {invoice.get('id')}")
    else:
        # Insert new invoice
        db.table("invoices").insert(invoice_data).execute()
        logger.info(f"Created new invoice: {invoice.get('id')}")

    logger.info(f"Invoice created successfully: {invoice.get('id')}")


async def handle_invoice_paid(invoice: dict[str, Any], db: SupabaseDB) -> None:
    """Handle successful invoice payment."""
    logger.info(f"Processing invoice.paid: {invoice.get('id')}")

    amount_paid_cents = invoice.get("amount_paid", 0)
    amount_paid = int(amount_paid_cents) / 100 if amount_paid_cents else 0

    # Check if invoice exists first - if not, create it
    existing = (
        db.table("invoices")
        .select("id")
        .eq("stripe_invoice_id", invoice.get("id"))
        .execute()
    )

    if not existing.data:
        # Invoice doesn't exist yet, create it first
        logger.info(f"Invoice {invoice.get('id')} doesn't exist, creating it first")
        await handle_invoice_created(invoice, db)

    # Update payment status
    db.table("invoices").update(
        {
            "status": "paid",
            "amount_paid": amount_paid,
            "paid_at": datetime.now(UTC).isoformat(),
            "pdf_url": invoice.get("invoice_pdf"),
            "updated_at": datetime.now(UTC).isoformat(),
        }
    ).eq("stripe_invoice_id", invoice.get("id")).execute()

    logger.info(f"Invoice marked as paid: {invoice.get('id')}")
    customer_id = invoice.get("customer")
    org_id = (
        await _get_org_by_customer(customer_id, db)
        if isinstance(customer_id, str) and customer_id
        else None
    )
    if org_id:
        await capture_billing_event(
            "invoice_paid",
            organization_id=str(org_id),
            properties={
                "stripe_invoice_id": invoice.get("id"),
                "stripe_subscription_id": invoice.get("subscription"),
                "stripe_customer_id": customer_id,
                "amount_paid_cents": amount_paid_cents,
                "currency": invoice.get("currency", "usd"),
            },
        )


async def handle_invoice_payment_failed(
    invoice: dict[str, Any], db: SupabaseDB
) -> None:
    """Handle failed invoice payment."""
    logger.info(f"Processing invoice.payment_failed: {invoice.get('id')}")

    existing = (
        db.table("invoices")
        .select("id")
        .eq("stripe_invoice_id", invoice.get("id"))
        .execute()
    )
    if not existing.data:
        logger.info(f"Invoice {invoice.get('id')} doesn't exist, creating it first")
        await handle_invoice_created(invoice, db)

    # Update invoice status
    db.table("invoices").update(
        {
            "status": "open",  # Remains open/unpaid
            "updated_at": datetime.now(UTC).isoformat(),
        }
    ).eq("stripe_invoice_id", invoice.get("id")).execute()

    # Update subscription to past_due
    subscription_id = invoice.get("subscription")
    if subscription_id:
        db.table("subscriptions").update(
            {
                "status": "past_due",
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ).eq("stripe_subscription_id", subscription_id).execute()
        logger.info(f"Subscription marked as past_due: {subscription_id}")

    logger.warning(f"Invoice payment failed: {invoice.get('id')}")
    customer_id = invoice.get("customer")
    org_id = (
        await _get_org_by_customer(customer_id, db)
        if isinstance(customer_id, str) and customer_id
        else None
    )
    if org_id:
        await capture_billing_event(
            "invoice_payment_failed",
            organization_id=str(org_id),
            properties={
                "stripe_invoice_id": invoice.get("id"),
                "stripe_subscription_id": subscription_id,
                "stripe_customer_id": customer_id,
                "amount_due_cents": invoice.get("amount_due"),
                "currency": invoice.get("currency", "usd"),
            },
        )


async def handle_checkout_session_completed(
    session: dict[str, Any], db: SupabaseDB
) -> None:
    """Route checkout.session.completed based on session mode.

    - mode='payment'      → credit pack purchase; add credits to org
    - mode='subscription' → legacy winback offer redemption recording
    """
    session_mode = session.get("mode")

    if session_mode == "payment":
        await _handle_credit_pack_checkout_completed(session, db)
    else:
        await _handle_subscription_checkout_completed(session, db)


async def _handle_credit_pack_checkout_completed(
    session: dict[str, Any], db: SupabaseDB
) -> None:
    """Process a successful credit pack one-time payment."""
    from app.services.billing.credits import (
        DuplicateCreditPackError,
    )
    from app.services.billing.credits import add_credits as _add_credits

    metadata = session.get("metadata") or {}
    org_id = metadata.get("organization_id")
    if not org_id:
        logger.warning("credit_pack checkout missing organization_id in metadata")
        return

    quantity_str = metadata.get("quantity", "0")
    try:
        quantity = int(quantity_str)
    except ValueError:
        logger.error(f"Invalid quantity in credit pack metadata: {quantity_str!r}")
        return

    if quantity < 1:
        logger.error(f"Credit pack quantity must be >= 1, got {quantity}")
        return

    checkout_session_id = session.get("id")
    payment_intent_id = session.get("payment_intent")
    amount_total = session.get("amount_total") or 0
    # Store effective paid price per audit (after discounts), not list price.
    # For comped/test purchases, amount_total may be 0 — the constraint allows >= 0.
    unit_price_cents = amount_total // quantity if quantity else 0

    ctx = _ServiceCtx(org_id, db)

    try:
        pack_id = _add_credits(
            ctx,
            quantity=quantity,
            unit_price_cents=unit_price_cents,
            stripe_checkout_session_id=checkout_session_id,
            stripe_payment_intent_id=(
                str(payment_intent_id) if payment_intent_id else None
            ),
        )
        logger.info(f"Added {quantity} audit credits for org {org_id} (pack={pack_id})")
    except DuplicateCreditPackError:
        # Expected for Stripe retries — already processed, no action needed.
        logger.info(
            f"Duplicate checkout session {checkout_session_id} for org {org_id} — skipping"
        )
    except Exception as exc:
        logger.exception(f"Failed to add credits for org {org_id}: {exc}")
        raise


async def _handle_subscription_checkout_completed(
    session: dict[str, Any], db: SupabaseDB
) -> None:
    """Record which winback offer tier was redeemed after a subscription checkout."""
    metadata = session.get("metadata") or {}
    org_id = metadata.get("organization_id")
    offer_tier = metadata.get("offer_tier")

    if not org_id or not offer_tier:
        return

    db.table("free_audit_winback_offers").update(
        {
            "redeemed_offer_tier": offer_tier,
            "redeemed_at": datetime.now(UTC).isoformat(),
        }
    ).eq("organization_id", org_id).is_("redeemed_offer_tier", "null").execute()


async def _send_trial_lifecycle_email(
    db: SupabaseDB,
    sub: dict[str, Any],
    email_type: str,
    organization_id: str | None = None,
) -> None:
    org_id = organization_id or sub.get("metadata", {}).get("organization_id")
    subscription_id = sub.get("id")

    if not org_id:
        customer_id = sub.get("customer")
        if customer_id:
            org_id = await _get_org_by_customer(str(customer_id), db)

    if not org_id or not subscription_id:
        logger.warning("Skipping %s email - missing org or subscription id", email_type)
        return

    claimed = await _claim_subscription_email(
        db=db,
        organization_id=str(org_id),
        subscription_id=str(subscription_id),
        email_type=email_type,
        stripe_event_id=sub.get("__event_id"),
    )
    if not claimed:
        logger.info(
            "Skipping duplicate %s email for subscription %s",
            email_type,
            subscription_id,
        )
        return

    try:
        recipient = _get_trial_email_recipient(db, str(org_id))
        if not recipient:
            raise RuntimeError(f"No billing contact found for org {org_id}")

        organization_name, to_email = recipient
        trial_start, charge_date = _get_trial_dates(sub)
        charge_amount_formatted = _format_trial_charge_amount(sub)
        app_settings = get_settings()
        email_service = build_email_service(app_settings)
        billing_url = f"{app_settings.app_base_url.rstrip('/')}/settings/billing"

        if email_type == "trial_started":
            response = await email_service.send_trial_started_email(
                to_email=to_email,
                organization_name=organization_name,
                trial_days=TRIAL_DAYS,
                trial_start=trial_start,
                charge_date=charge_date,
                charge_amount_formatted=charge_amount_formatted,
                billing_url=billing_url,
            )
        elif email_type == "trial_ending_soon":
            response = await email_service.send_trial_ending_soon_email(
                to_email=to_email,
                organization_name=organization_name,
                trial_start=trial_start,
                charge_date=charge_date,
                charge_amount_formatted=charge_amount_formatted,
                billing_url=billing_url,
            )
        else:
            response = await email_service.send_trial_paused_email(
                to_email=to_email,
                organization_name=organization_name,
                charge_date=charge_date,
                charge_amount_formatted=charge_amount_formatted,
                billing_url=billing_url,
            )
    except Exception:
        await _release_subscription_email(db, str(subscription_id), email_type)
        raise

    try:
        await _complete_subscription_email(
            db=db,
            subscription_id=str(subscription_id),
            email_type=email_type,
            provider_message_id=response.get("id"),
        )
    except Exception:
        logger.exception(
            "Failed finalizing %s email for subscription %s; keeping claim row to avoid duplicate sends",
            email_type,
            subscription_id,
        )
        raise


def _get_trial_email_recipient(
    db: SupabaseDB, organization_id: str
) -> tuple[str, str] | None:
    org_result = (
        db.table("organizations")
        .select("name,billing_email")
        .eq("id", organization_id)
        .single()
        .execute()
    )
    if not org_result.data:
        return None

    organization_name = org_result.data.get("name") or "CapVeri customer"
    billing_email = org_result.data.get("billing_email")
    if billing_email:
        return organization_name, str(billing_email)

    user_result = (
        db.table("users")
        .select("email")
        .eq("organization_id", organization_id)
        .in_("role", ["owner", "admin"])
        .limit(1)
        .execute()
    )
    if user_result.data:
        first_user = cast(list[dict[str, Any]], user_result.data)[0]
        if first_user.get("email"):
            return organization_name, str(first_user["email"])

    return None


def _get_trial_dates(sub: dict[str, Any]) -> tuple[datetime, datetime]:
    trial_start_ts = (
        sub.get("trial_start") or sub.get("current_period_start") or sub.get("created")
    )
    trial_end_ts = (
        sub.get("trial_end")
        or sub.get("current_period_end")
        or sub.get("billing_cycle_anchor")
    )
    now = datetime.now(UTC)

    trial_start = (
        datetime.fromtimestamp(int(trial_start_ts), tz=UTC) if trial_start_ts else now
    )
    charge_date = (
        datetime.fromtimestamp(int(trial_end_ts), tz=UTC) if trial_end_ts else now
    )
    return trial_start, charge_date


def _format_trial_charge_amount(sub: dict[str, Any]) -> str:
    metadata = sub.get("metadata", {}) or {}
    unit_count_raw = metadata.get("unit_count")
    plan_id = str(metadata.get("plan_id") or "")

    try:
        unit_count = int(unit_count_raw) if unit_count_raw is not None else None
    except (TypeError, ValueError):
        unit_count = None

    if plan_id and unit_count is not None:
        total_cents = get_annual_total_cents_for_tier(plan_id, unit_count)
        if total_cents is not None:
            return f"${total_cents / 100:,.2f}/year"

    items = sub.get("items", {})
    items_data = items.get("data", []) if isinstance(items, dict) else []
    amount_cents = 0
    for item in items_data:
        price = item.get("price", {})
        unit_amount = price.get("unit_amount") if isinstance(price, dict) else None
        quantity = int(item.get("quantity") or 1)
        if unit_amount is not None:
            amount_cents += int(unit_amount) * quantity

    if amount_cents > 0:
        interval = price.get("recurring", {}).get("interval")
        suffix = "/year" if interval == "year" else ""
        return f"${amount_cents / 100:,.2f}{suffix}"

    fallback_tier_id = next(
        (tier["id"] for tier in TIERS if tier["base_annual"] is not None), None
    )
    fallback_cents = (
        get_launch_offer_annual_cents(fallback_tier_id) if fallback_tier_id else None
    )
    if fallback_cents is not None:
        return f"${fallback_cents / 100:,.2f}/year"
    return "Custom pricing"


# Helper functions


async def _get_org_by_customer(customer_id: str, db: SupabaseDB) -> str | None:
    """Get organization ID by Stripe customer ID."""
    result = (
        db.table("subscriptions")
        .select("organization_id")
        .eq("stripe_customer_id", customer_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        return None
    data = cast(list[dict[str, Any]], result.data)
    org_id = data[0].get("organization_id") if data else None
    return str(org_id) if org_id else None


async def _get_sub_id(stripe_sub_id: str, db: SupabaseDB) -> str | None:
    """Get local subscription UUID by Stripe subscription ID."""
    result = (
        db.table("subscriptions")
        .select("id")
        .eq("stripe_subscription_id", stripe_sub_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        return None
    data = cast(list[dict[str, Any]], result.data)
    sub_id = data[0].get("id") if data else None
    return str(sub_id) if sub_id else None


def _map_price_to_plan(price_id: str) -> str:
    """Map Stripe price ID to plan name.

    Returns the plan string written to the ``subscriptions.plan`` column.
    Current price IDs map to growth_v2 for the legacy ``plan`` column. The
    canonical package is stored in the ``tier`` column from checkout metadata.
    Portfolio price IDs are no longer mapped; Stripe events for existing
    portfolio subscribers fall through to the growth_v2 default. Entitlements
    preserve legacy self-serve subscriptions with Reconcile-equivalent access.
    Non-annual price IDs are intentionally ignored by this mapping.
    """
    settings = get_stripe_settings()
    price_map: dict[str, str] = {
        settings.stripe_price_id_reconcile_annual: "growth_v2",
        settings.stripe_price_id_control_annual: "growth_v2",
        settings.stripe_price_id_defend_annual: "growth_v2",
        settings.stripe_price_id_growth_base_annual: "growth_v2",
        settings.stripe_price_id_unit_overage_annual: "growth_v2",
        # Legacy per-building price IDs preserved for webhook back-compat
        settings.stripe_price_id_growth_v2_annual: "growth_v2",
        # Legacy growth tier alias (deprecated) — kept for webhook back-compat
        settings.stripe_price_id_growth_annual: "professional",
    }
    return price_map.get(price_id, "growth_v2")


def _map_subscription_status(status: Any) -> str:
    """Map Stripe subscription status to our status enum."""
    status_map = {
        "trialing": "trialing",
        "active": "active",
        "past_due": "past_due",
        "canceled": "canceled",
        "unpaid": "past_due",
        "paused": "paused",
    }
    return status_map.get(str(status) if status else "", "active")


async def _claim_webhook_event(db: SupabaseDB, event_id: str, event_type: str) -> bool:
    """Atomically claim a webhook event.

    Returns True if claimed, False if already seen.
    """
    result = (
        db.table("stripe_webhook_events")
        .upsert(
            {
                "stripe_event_id": event_id,
                "event_type": event_type,
                "status": "processing",
                "created_at": datetime.now(UTC).isoformat(),
            },
            ignore_duplicates=True,
        )
        .execute()
    )
    return bool(result.data)


async def _complete_webhook_event(db: SupabaseDB, event_id: str) -> None:
    """Mark a claimed event as successfully processed."""
    try:
        db.table("stripe_webhook_events").update(
            {"status": "succeeded", "processed_at": datetime.now(UTC).isoformat()}
        ).eq("stripe_event_id", event_id).execute()
    except Exception:
        logger.exception(
            "Failed to complete webhook event %s — record stuck in 'processing'",
            event_id,
        )


async def _release_webhook_event(db: SupabaseDB, event_id: str) -> None:
    """Release a claimed event on failure so Stripe can retry it."""
    try:
        db.table("stripe_webhook_events").delete().eq(
            "stripe_event_id", event_id
        ).execute()
    except Exception:
        logger.exception(
            "Failed to release webhook event %s — event stuck in 'processing'",
            event_id,
        )


async def _claim_subscription_email(
    db: SupabaseDB,
    organization_id: str,
    subscription_id: str,
    email_type: str,
    stripe_event_id: str | None,
) -> bool:
    result = (
        db.table("subscription_email_events")
        .upsert(
            {
                "organization_id": organization_id,
                "stripe_subscription_id": subscription_id,
                "email_type": email_type,
                "status": "processing",
                "stripe_event_id": stripe_event_id,
                "created_at": datetime.now(UTC).isoformat(),
            },
            ignore_duplicates=True,
        )
        .execute()
    )
    return bool(result.data)


async def _complete_subscription_email(
    db: SupabaseDB,
    subscription_id: str,
    email_type: str,
    provider_message_id: str | None,
) -> None:
    db.table("subscription_email_events").update(
        {
            "status": "sent",
            "provider_message_id": provider_message_id,
            "sent_at": datetime.now(UTC).isoformat(),
        }
    ).eq("stripe_subscription_id", subscription_id).eq(
        "email_type", email_type
    ).execute()


async def _release_subscription_email(
    db: SupabaseDB,
    subscription_id: str,
    email_type: str,
) -> None:
    db.table("subscription_email_events").delete().eq(
        "stripe_subscription_id", subscription_id
    ).eq("email_type", email_type).execute()


# Allowed domains for this webhook handler
CAPVERI_DOMAINS = {"capveri.com"}


@router.post("/resend")
async def handle_resend_webhook(
    request: Request,
    db: SupabaseDB = Depends(get_supabase_admin),
) -> dict[str, bool]:
    """Handle Resend inbound email webhook.

    Receives inbound emails and forwards them to the configured admin inbox.

    Resend Webhook Documentation:
    https://resend.com/docs/webhooks/event-types

    Security:
    - Verifies webhook signature using HMAC SHA-256
    - Rejects requests with invalid or missing signatures

    Returns:
        {"received": True} - Always return success to prevent retries
    """
    import hashlib
    import hmac
    import json

    from app.config import get_settings

    settings = get_settings()

    # Get raw body and signature
    payload = await request.body()
    signature = request.headers.get("svix-signature")

    if not signature:
        logger.warning("Resend webhook missing svix-signature header")
        raise HTTPException(
            status_code=400,
            detail="Missing svix-signature header",
        )

    # Verify signature (Resend uses Svix for webhooks)
    # Svix signature format: "t=timestamp v1=signature_hash"
    # We need to verify using timestamp + . + payload
    try:
        # Parse Svix signature header
        sig_parts = {}
        for part in signature.split(" "):
            if "=" in part:
                key, value = part.split("=", 1)
                sig_parts[key] = value

        timestamp = sig_parts.get("t")
        signature_hash = sig_parts.get("v1")

        if not timestamp or not signature_hash:
            raise ValueError("Invalid signature format")

        # Construct signed payload: timestamp.payload
        signed_payload = f"{timestamp}.{payload.decode('utf-8')}"

        # Compute expected signature
        expected_signature = hmac.new(
            settings.resend_webhook_secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        # Compare signatures
        if not hmac.compare_digest(expected_signature, signature_hash):
            raise ValueError("Signature mismatch")

    except Exception as e:
        logger.error("Resend webhook signature verification failed: %s", e)
        raise HTTPException(
            status_code=400,
            detail="Invalid webhook signature",
        )

    # Parse event
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        logger.error("Resend webhook invalid JSON payload")
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON payload",
        )

    event_type = event.get("type")
    logger.info(f"Received Resend webhook event: {event_type}")

    # Handle email.received event
    if event_type == "email.received":
        await handle_inbound_email(event.get("data"), db)
    else:
        logger.info(f"Ignoring Resend webhook event type: {event_type}")

    return {"received": True}


def _is_capveri_recipient(to_field: Any) -> bool:
    """Check if any recipient is a CapVeri domain."""
    if not to_field:
        return False

    # Handle both string and list formats
    recipients = [to_field] if isinstance(to_field, str) else to_field

    for recipient in recipients:
        if isinstance(recipient, str):
            # Extract domain from email address
            if "@" in recipient:
                domain = recipient.split("@")[-1].lower()
                if domain in CAPVERI_DOMAINS:
                    return True
    return False


async def handle_inbound_email(data: dict[str, Any] | None, db: SupabaseDB) -> None:
    """Handle inbound email event from Resend.

    Args:
        data: Event data from Resend webhook
        db: Database client (unused for simple forwarding)
    """
    if not data:
        logger.warning("Inbound email event missing data")
        return

    from app.services.email import build_email_service

    email_service = build_email_service()

    # Extract email details
    original_from: str | None = data.get("from")
    original_to: str | None = data.get("to")
    subject = data.get("subject", "(No Subject)")
    html = data.get("html")
    text = data.get("text")

    # Filter: only process emails to CapVeri domains
    if not _is_capveri_recipient(original_to):
        logger.debug(f"Ignoring email to non-CapVeri domain: {original_to}")
        return

    logger.info(f"Processing inbound email from {original_from} to {original_to}")

    settings = get_settings()
    try:
        await email_service.forward_inbound_email(
            to_email=settings.admin_notification_email,
            original_from=original_from or "unknown@unknown.com",
            original_to=original_to or "unknown@unknown.com",
            subject=subject,
            html=html,
            text=text,
        )
        logger.info(f"Successfully forwarded email from {original_from}")
    except Exception as e:
        logger.error(
            f"Failed to forward inbound email from {original_from}: {e}",
            exc_info=True,
        )
        # Don't raise - return success to avoid Resend retries
