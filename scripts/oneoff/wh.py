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

from app.database import get_supabase_admin
from app.database.client import SupabaseDB
from app.services.billing.config import get_stripe_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def handle_stripe_webhook(
    request: Request,
    db: SupabaseDB = Depends(get_supabase_admin),
) -> dict[str, bool]:
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

    # Dispatch to handler based on event type
    handlers = {
        "customer.subscription.created": handle_subscription_created,
        "customer.subscription.updated": handle_subscription_updated,
        "customer.subscription.deleted": handle_subscription_deleted,
        "invoice.paid": handle_invoice_paid,
        "invoice.payment_failed": handle_invoice_payment_failed,
        "invoice.created": handle_invoice_created,
    }

    handler = handlers.get(event.type)
    if handler:
        logger.info(f"Dispatching to handler for {event.type}")
        event_data = cast(dict[str, Any], event.data.object)
        await handler(event_data, db)
        logger.info(f"Successfully processed {event.type}")
    else:
        logger.warning(f"No handler for event type: {event.type}")

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

    # Extract building_count from subscription item quantity
    items = sub.get("items", {})
    items_data = items.get("data", []) if isinstance(items, dict) else []
    building_count = items_data[0].get("quantity", 1) if items_data else 1
    price = items_data[0].get("price", {}) if items_data else {}
    price_id = price.get("id") if isinstance(price, dict) else None

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
                "plan": _map_price_to_plan(price_id) if price_id else "growth",
                "status": _map_subscription_status(sub.get("status")),
                "building_count": building_count,
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


async def handle_subscription_updated(sub: dict[str, Any], db: SupabaseDB) -> None:
    """Handle subscription updates (plan, status, quantity changes, etc.)."""
    # Extract building_count from subscription item quantity
    items = sub.get("items", {})
    items_data = items.get("data", []) if isinstance(items, dict) else []
    building_count = items_data[0].get("quantity", 1) if items_data else 1
    price = items_data[0].get("price", {}) if items_data else {}
    price_id = price.get("id") if isinstance(price, dict) else None

    # Access period timestamps - use fallbacks
    period_start = (
        sub.get("current_period_start") or sub.get("start_date") or sub.get("created")
    )
    period_end = sub.get("current_period_end") or sub.get("billing_cycle_anchor")

    # Build update dict - only include period fields if they exist
    update_data: dict[str, Any] = {
        "plan": _map_price_to_plan(price_id) if price_id else "growth",
        "status": _map_subscription_status(sub.get("status")),
        "building_count": building_count,
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


async def handle_subscription_deleted(sub: dict[str, Any], db: SupabaseDB) -> None:
    """Handle subscription cancellation/deletion."""
    db.table("subscriptions").update(
        {
            "status": "canceled",
            "updated_at": datetime.now(UTC).isoformat(),
        }
    ).eq("stripe_subscription_id", sub.get("id")).execute()


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

    # Check if this is a bounty invoice by looking at metadata
    metadata = invoice.get("metadata", {})
    audit_request_id = metadata.get("audit_request_id")

    if audit_request_id:
        # This is a bounty invoice - handle it specially
        await _handle_bounty_invoice_paid(invoice, audit_request_id, amount_paid, db)
        return

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


async def _handle_bounty_invoice_paid(
    invoice: dict[str, Any],
    audit_request_id: str,
    amount_paid: float,
    db: SupabaseDB,
) -> None:
    """Handle bounty invoice payment - update audit request to 'paid' status."""
    stripe_invoice_id = invoice.get("id")
    logger.info(
        f"Processing bounty invoice payment: {stripe_invoice_id} "
        f"for audit request {audit_request_id}"
    )

    # Find our invoice record by stripe_invoice_id
    result = (
        db.table("invoices")
        .select("id, audit_request_id")
        .eq("stripe_invoice_id", stripe_invoice_id)
        .execute()
    )

    if not result.data:
        logger.warning(f"Bounty invoice not found in DB: {stripe_invoice_id}")
        # Invoice might not exist yet - this shouldn't happen for bounty invoices
        # since we create them locally first, but log and return
        return

    invoice_data = cast(dict[str, Any], result.data[0])
    now = datetime.now(UTC).isoformat()

    # Update invoice status
    db.table("invoices").update(
        {
            "status": "paid",
            "amount_paid": amount_paid,
            "paid_at": now,
            "pdf_url": invoice.get("invoice_pdf"),
            "updated_at": now,
        }
    ).eq("stripe_invoice_id", stripe_invoice_id).execute()

    # Update audit request to 'paid'
    db_audit_request_id = invoice_data.get("audit_request_id") or audit_request_id
    if db_audit_request_id:
        db.table("audit_requests").update(
            {
                "status": "paid",
                "updated_at": now,
            }
        ).eq("id", db_audit_request_id).execute()

        logger.info(
            f"Bounty paid for audit request {db_audit_request_id}: " f"${amount_paid}"
        )


async def handle_invoice_payment_failed(
    invoice: dict[str, Any], db: SupabaseDB
) -> None:
    """Handle failed invoice payment."""
    logger.info(f"Processing invoice.payment_failed: {invoice.get('id')}")

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
    """Map Stripe price ID to plan name."""
    settings = get_stripe_settings()
    price_map = {
        settings.stripe_price_id_growth_annual: "growth_v2",
        settings.stripe_price_id_reconcile_annual: "growth_v2",
        settings.stripe_price_id_control_annual: "growth_v2",
        settings.stripe_price_id_defend_annual: "growth_v2",
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


@router.post("/resend")
async def handle_resend_webhook(
    request: Request,
    db: SupabaseDB = Depends(get_supabase_admin),
) -> dict[str, bool]:
    """Handle Resend inbound email webhook.

    Receives inbound emails and forwards them to the configured admin contact.

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

    from app.config import get_settings

    settings = get_settings()
    capveri_domain = settings.marketing_base_url.split("//", 1)[-1].removeprefix("www.")

    for recipient in recipients:
        if isinstance(recipient, str):
            # Extract domain from email address
            if "@" in recipient:
                domain = recipient.split("@")[-1].lower()
                if domain == capveri_domain:
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

    from app.config import get_settings
    from app.services.email.resend_service import EmailService

    settings = get_settings()
    email_service = EmailService(
        api_key=settings.resend_api_key,
        from_address=settings.resend_from_address,
    )

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

    # Forward to the configured admin notification email.
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
