"""
Billing and customer management endpoints.

Provides Stripe customer management and billing operations.
All endpoints require authentication and are scoped to the user's organization.
"""

import logging
import math
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import get_stripe_service
from app.auth.dependencies import OrgContext, require_org_owner
from app.config import get_settings
from app.database.client import get_supabase_admin
from app.models.cancel_attempt import CancelReason, SaveOfferType
from app.models.subscription import (
    CreditBalance,
    CreditPack,
    Subscription,
)
from app.services.billing.activation import (
    SELF_SERVE_UNIT_LIMIT,
    get_billing_activation,
    get_org_settings,
    persist_billing_activation,
)
from app.services.billing.config import get_stripe_settings
from app.services.billing.credits import (
    get_credit_balance,
    list_audit_credit_rows,
)
from app.services.billing.customers import CustomerService
from app.services.billing.entitlements import effective_subscription_status
from app.services.billing.feature_usage import list_used_features
from app.services.billing.free_audit import get_free_audit_status
from app.services.billing.generated_plan_tiers import (
    LAUNCH_OFFER,
    TRIAL_DAYS,
    SubscriptionTier,
    get_annual_total_cents,
)
from app.services.billing.guarantee import GuaranteeService
from app.services.billing.launch_phase import ActiveLaunchPhase, get_active_launch_phase
from app.services.billing.offer_tokens import extract_offer_tier_from_token
from app.services.billing.payment_methods import PaymentMethodService
from app.services.billing.plans import get_stripe_price_id_for_tier, get_tier_details
from app.services.billing.save_offers import SaveOfferService
from app.services.billing.stripe_client import StripeService
from app.services.billing.subscriptions import SubscriptionService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/launch-offer/active", response_model=ActiveLaunchPhase)
async def get_launch_offer_active() -> ActiveLaunchPhase:
    """Public endpoint - returns the currently active limited offer."""
    return await get_active_launch_phase()


# Request models
class UpgradeRequest(BaseModel):
    """Request to upgrade subscription."""

    new_plan: str


class DowngradeRequest(BaseModel):
    """Request to downgrade subscription."""

    new_plan: str


class CancelRequest(BaseModel):
    """Request to cancel subscription."""

    immediate: bool = False
    attempt_id: str | None = None  # Links cancellation to a save-offer attempt


class SaveOfferRequest(BaseModel):
    """Exit survey submission — captures why the user is canceling."""

    reason: CancelReason
    other_text: str | None = None


class SaveOfferResponse(BaseModel):
    """Save offer returned after exit survey."""

    attempt_id: str
    offer_type: SaveOfferType
    discount_percent: int | None = None  # 20 for discount offers


class FreeAuditStatusResponse(BaseModel):
    """Free-audit entitlement status for gating UI/actions."""

    has_subscription: bool
    has_paused_subscription: bool = False
    has_ever_purchased: bool = False
    credit_balance: CreditBalance = CreditBalance()
    free_audit_consumed: bool
    can_add_property: bool
    can_run_reconciliation: bool
    can_view_draft_report: bool
    can_download_reports: bool


class PlanSelectionRequest(BaseModel):
    """Persisted self-serve checkout selection before Stripe activation."""

    model_config = ConfigDict(extra="forbid")

    plan_id: str
    billing_period: Literal["annual"] = "annual"
    unit_count: int = 1
    building_count: int = 1
    launch_offer_code: str | None = None


class TrialStartRequest(PlanSelectionRequest):
    """Request to start a no-card self-serve trial."""


class PlanSelectionResponse(BaseModel):
    """Current saved checkout selection for the authenticated organization."""

    plan_id: str | None = None
    billing_period: Literal["annual"] | None = None
    unit_count: int | None = None
    building_count: int | None = None
    selected_at: str | None = None
    checkout_required: bool = False
    has_active_access: bool = False
    has_paused_subscription: bool = False
    subscription_status: str | None = None
    trial_days_remaining: int | None = None


class SubscribeRequest(BaseModel):
    """Request to create a subscription with trial."""

    tier: str = Field(
        pattern="^reconcile$",
        description="Self-serve subscription tier: reconcile",
    )
    unit_count: int = Field(
        default=25,
        ge=1,
        description="Rentable unit count for unit-based Reconcile pricing",
    )
    building_count: int = Field(
        default=1,
        ge=1,
        description="Building count retained for legacy reporting metadata",
    )
    success_url: str
    cancel_url: str


class SubscribeResponse(BaseModel):
    """Response containing the Stripe Checkout URL for subscription."""

    checkout_url: str
    tier: str
    price_annual_cents: int
    trial_days: int


def get_save_offer_service(
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
) -> SaveOfferService:
    """Dependency for SaveOfferService with proper scoping."""
    return SaveOfferService(stripe_service=stripe_service, db=ctx.client)


def get_customer_service(
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
) -> CustomerService:
    """Dependency for CustomerService with proper scoping."""
    return CustomerService(stripe_service=stripe_service, db=ctx.client)


def get_subscription_service(
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
) -> SubscriptionService:
    """Dependency for SubscriptionService with proper scoping."""
    return SubscriptionService(stripe_service=stripe_service, db=ctx.client)


def get_guarantee_service(
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
) -> GuaranteeService:
    """Dependency for GuaranteeService with proper scoping."""
    return GuaranteeService(stripe_service=stripe_service, db=ctx.client)


class GuaranteeEligibilityResponse(BaseModel):
    """Money-back guarantee eligibility status."""

    eligible: bool
    days_remaining: int
    first_invoice_amount: float | None = None
    first_invoice_currency: str


class GuaranteeClaimResponse(BaseModel):
    """Response after a successful money-back guarantee claim."""

    refund_id: str
    amount_refunded: float
    currency: str


@router.get("/guarantee/eligibility", response_model=GuaranteeEligibilityResponse)
async def get_guarantee_eligibility(
    ctx: OrgContext,
    guarantee_service: Annotated[GuaranteeService, Depends(get_guarantee_service)],
) -> GuaranteeEligibilityResponse:
    """
    Check whether the organization is eligible for the 30-day money-back guarantee.

    Returns eligibility status, days remaining in the window, and the first
    invoice amount that would be refunded.
    """
    eligibility = await guarantee_service.check_eligibility(ctx.organization_id)
    return GuaranteeEligibilityResponse(
        eligible=eligibility.eligible,
        days_remaining=eligibility.days_remaining,
        first_invoice_amount=(
            float(eligibility.first_invoice_amount)
            if eligibility.first_invoice_amount is not None
            else None
        ),
        first_invoice_currency=eligibility.first_invoice_currency,
    )


@router.post(
    "/guarantee/claim",
    response_model=GuaranteeClaimResponse,
    dependencies=[Depends(require_org_owner)],
)
async def claim_money_back_guarantee(
    ctx: OrgContext,
    guarantee_service: Annotated[GuaranteeService, Depends(get_guarantee_service)],
) -> GuaranteeClaimResponse:
    """
    Claim the 30-day money-back guarantee.

    Issues a full refund of the first invoice and cancels the subscription
    immediately (without proration) to prevent double-refund.

    Raises 409 if the guarantee is not available (outside window, already claimed,
    or no paid invoice found).
    """
    refund = await guarantee_service.claim_refund(ctx.organization_id)
    return GuaranteeClaimResponse(
        refund_id=refund.id,
        amount_refunded=refund.amount / 100,  # Stripe amounts are in cents
        currency=refund.currency,
    )


@router.get("/free-audit-status", response_model=FreeAuditStatusResponse)
async def get_free_audit_entitlement_status(ctx: OrgContext) -> FreeAuditStatusResponse:
    """Get current free-audit entitlement status for the organization."""
    status_flags = get_free_audit_status(ctx)
    return FreeAuditStatusResponse(**status_flags)


def _get_trial_days_remaining(ctx: OrgContext) -> int | None:
    """Return whole days left on a card-less trial, or None when not trialing.

    Only a local no-card trial (``status='trialing'`` with no Stripe
    subscription) reports a countdown; anything else returns None so the
    in-app banner only shows the trial countdown when one is genuinely running.
    """
    result = (
        ctx.table("subscriptions")
        .select("status,stripe_subscription_id,current_period_end")
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        return None
    row = result.data
    if str(row.get("status", "")) != "trialing" or row.get("stripe_subscription_id"):
        return None
    period_end = row.get("current_period_end")
    return _remaining_trial_days(str(period_end) if period_end else None)


def _validate_self_serve_plan_selection(
    *,
    plan_id: str,
    billing_period: str,
    unit_count: int,
    building_count: int,
) -> SubscriptionTier:
    """Validate a self-serve plan selection and return tier details."""
    if plan_id not in SELF_SERVE_PLAN_IDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan: {plan_id}. Valid plans: reconcile",
        )

    if billing_period != "annual":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Billing period must be annual",
        )

    if unit_count < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unit count must be at least 1",
        )

    if building_count < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Building count must be at least 1",
        )

    if unit_count > SELF_SERVE_UNIT_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Larger portfolios should contact sales for custom terms",
        )

    tier_details = get_tier_details(plan_id)
    max_units = tier_details["max_units"]
    if max_units is not None and unit_count > max_units:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(f"Plan {plan_id} supports up to {max_units} rentable units"),
        )

    return tier_details


def _build_reconcile_checkout_line_items(
    *,
    unit_count: int,
    annual_total_cents: int,
) -> list[dict[str, Any]]:
    """Build a single annual Reconcile subscription line item for Stripe Checkout."""
    stripe_settings = get_stripe_settings()
    base_price_id = get_stripe_price_id_for_tier("reconcile", annual=True)
    base_annual_cents = get_annual_total_cents("reconcile", 1)
    if annual_total_cents == base_annual_cents:
        return [{"price": base_price_id}]

    price_data: dict[str, Any] = {
        "currency": "usd",
        "unit_amount": annual_total_cents,
        "recurring": {"interval": "year"},
    }
    if stripe_settings.stripe_product_id_reconcile:
        price_data["product"] = stripe_settings.stripe_product_id_reconcile
    else:
        price_data["product_data"] = {
            "name": "CapVeri Reconcile",
            "description": (
                f"Annual Reconcile subscription for {unit_count} rentable units"
            ),
        }

    return [{"price_data": price_data, "quantity": 1}]


def _remaining_trial_days(period_end: str | None) -> int:
    """Return remaining whole trial days for a local no-card trial."""
    if not period_end:
        return 0

    try:
        parsed_period_end = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
    except ValueError:
        return 0

    if parsed_period_end.tzinfo is None:
        parsed_period_end = parsed_period_end.replace(tzinfo=UTC)

    remaining_seconds = (parsed_period_end - datetime.now(UTC)).total_seconds()
    if remaining_seconds <= 0:
        return 0
    return max(1, math.ceil(remaining_seconds / 86400))


def _build_plan_selection_response(
    ctx: OrgContext,
    activation: dict[str, object] | None = None,
) -> PlanSelectionResponse:
    """Build the public plan-selection response from settings + billing state."""
    # Evaluate effective status first: this lazily flips an expired card-less
    # trial to "paused" (and persists it) so the free-audit flags and the
    # reported status below reflect the lock without waiting on a webhook.
    subscription_status = effective_subscription_status(ctx) or None
    status_flags = get_free_audit_status(ctx)
    trial_days_remaining = _get_trial_days_remaining(ctx)
    resolved_activation = activation or get_billing_activation(
        get_org_settings(ctx.client, str(ctx.organization_id))
    )
    has_active_access = bool(
        status_flags["has_subscription"] or status_flags["has_ever_purchased"]
    )
    has_paused_subscription = bool(status_flags["has_paused_subscription"])
    checkout_required = not has_active_access and not has_paused_subscription
    billing_period = (
        "annual"
        if resolved_activation and resolved_activation.get("billing_period") == "annual"
        else None
    )

    return PlanSelectionResponse(
        plan_id=resolved_activation.get("plan_id") if resolved_activation else None,
        billing_period=billing_period,
        unit_count=(
            resolved_activation.get("unit_count") if resolved_activation else None
        ),
        building_count=(
            resolved_activation.get("building_count") if resolved_activation else None
        ),
        selected_at=(
            str(resolved_activation.get("selected_at"))
            if resolved_activation and resolved_activation.get("selected_at")
            else None
        ),
        checkout_required=checkout_required,
        has_active_access=has_active_access,
        has_paused_subscription=has_paused_subscription,
        subscription_status=subscription_status,
        trial_days_remaining=trial_days_remaining,
    )


@router.get("/plan-selection", response_model=PlanSelectionResponse)
async def get_plan_selection(ctx: OrgContext) -> PlanSelectionResponse:
    """Return the saved self-serve plan selection for the current organization."""
    return _build_plan_selection_response(ctx)


@router.put(
    "/plan-selection",
    response_model=PlanSelectionResponse,
    dependencies=[Depends(require_org_owner)],
)
async def save_plan_selection(
    request: PlanSelectionRequest,
    ctx: OrgContext,
) -> PlanSelectionResponse:
    """Persist the selected self-serve plan before Stripe trial activation."""
    _resolve_launch_offer_coupon(request.launch_offer_code)

    _validate_self_serve_plan_selection(
        plan_id=request.plan_id,
        billing_period=request.billing_period,
        unit_count=request.unit_count,
        building_count=request.building_count,
    )

    persisted = persist_billing_activation(
        ctx.client,
        str(ctx.organization_id),
        plan_id=request.plan_id,
        billing_period=request.billing_period,
        unit_count=request.unit_count,
        building_count=request.building_count,
        checkout_required=True,
    )
    return _build_plan_selection_response(ctx, persisted)


@router.get("/customer")
async def get_customer(
    ctx: OrgContext,
    customer_service: Annotated[CustomerService, Depends(get_customer_service)],
) -> dict[str, str | int]:
    """
    Get Stripe customer for current organization.

    Returns the Stripe customer details associated with the authenticated
    user's organization. Returns 404 if no customer exists yet.

    Args:
        ctx: Organization-scoped context with authenticated user
        customer_service: Injected CustomerService instance

    Returns:
        Customer details including ID, email, name, and creation date

    Raises:
        HTTPException: 404 if no billing customer found
    """
    customer = await customer_service.get_customer_by_organization(ctx.organization_id)

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No billing customer found for this organization",
        )

    return {
        "id": customer.id,
        "email": customer.email or "",
        "name": customer.name or "",
        "created": customer.created,
    }


@router.post(
    "/customer",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_owner)],
)
async def create_customer(
    ctx: OrgContext,
    customer_service: Annotated[CustomerService, Depends(get_customer_service)],
) -> dict[str, str | int]:
    """
    Create or get Stripe customer for current organization.

    Creates a new Stripe customer if one doesn't exist, or returns the
    existing customer. Uses organization details for customer creation.

    Args:
        ctx: Organization-scoped context with authenticated user
        customer_service: Injected CustomerService instance

    Returns:
        Customer details including ID, email, and creation date

    Raises:
        HTTPException: 404 if organization not found
    """
    # Get organization details
    org_result = (
        ctx.table("organizations")
        .select("*")
        .eq("id", str(ctx.organization_id))
        .single()
        .execute()
    )

    if not org_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    org = org_result.data

    # Use billing_email if available, otherwise use user's email
    email = org.get("billing_email") or ctx.user.email
    name = org.get("name", "")

    customer = await customer_service.get_or_create_customer(
        organization_id=ctx.organization_id,
        email=email,
        name=name,
    )

    return {
        "id": customer.id,
        "email": customer.email or "",
        "name": customer.name or "",
        "created": customer.created,
    }


@router.get("/subscription")
async def get_subscription(
    ctx: OrgContext,
    subscription_service: Annotated[
        SubscriptionService, Depends(get_subscription_service)
    ],
) -> Subscription:
    """
    Get current subscription for organization.

    Returns subscription details including plan, status, and Stripe information.

    Args:
        ctx: Organization-scoped context
        subscription_service: Injected SubscriptionService instance

    Returns:
        Subscription details

    Raises:
        HTTPException: 404 if no subscription found
    """
    subscription = await subscription_service.get_subscription(ctx.organization_id)

    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No subscription found for this organization",
        )

    return subscription


@router.post("/subscription/upgrade", dependencies=[Depends(require_org_owner)])
async def upgrade_subscription(
    request: UpgradeRequest,
    ctx: OrgContext,
    subscription_service: Annotated[
        SubscriptionService, Depends(get_subscription_service)
    ],
) -> Subscription:
    """
    Upgrade subscription to a higher plan.

    Applies prorated billing immediately.

    Args:
        request: Upgrade request with new_plan
        ctx: Organization-scoped context
        subscription_service: Injected SubscriptionService instance

    Returns:
        Updated subscription details

    Raises:
        HTTPException: 400 if upgrade fails
    """
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "Plan changes are no longer supported. Reconcile is the only active "
            "subscription; use checkout to update rentable unit count."
        ),
    )


@router.post("/subscription/downgrade", dependencies=[Depends(require_org_owner)])
async def downgrade_subscription(
    request: DowngradeRequest,
    ctx: OrgContext,
    subscription_service: Annotated[
        SubscriptionService, Depends(get_subscription_service)
    ],
) -> Subscription:
    """
    Downgrade subscription to a lower plan.

    Change takes effect at end of current billing period.

    Args:
        request: Downgrade request with new_plan
        ctx: Organization-scoped context
        subscription_service: Injected SubscriptionService instance

    Returns:
        Updated subscription details

    Raises:
        HTTPException: 400 if downgrade fails
    """
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "Plan changes are no longer supported. Reconcile is the only active "
            "subscription; use checkout to update rentable unit count."
        ),
    )


@router.post(
    "/save-offer",
    response_model=SaveOfferResponse,
    dependencies=[Depends(require_org_owner)],
)
async def submit_cancel_survey(
    request: SaveOfferRequest,
    ctx: OrgContext,
    save_offer_service: Annotated[SaveOfferService, Depends(get_save_offer_service)],
) -> SaveOfferResponse:
    """
    Submit exit survey and get a save offer.

    Records why the user is considering cancellation and returns
    an appropriate save offer (discount or feature roadmap).

    Args:
        request: Exit survey with cancel reason
        ctx: Organization-scoped context
        save_offer_service: Injected SaveOfferService instance

    Returns:
        Save offer details including offer type and any discount info
    """
    attempt = await save_offer_service.create_attempt(
        ctx.organization_id,
        request.reason,
        request.other_text,
    )

    discount_percent = None
    if attempt.offer_shown == SaveOfferType.DISCOUNT_20PCT_1INV:
        discount_percent = 20

    return SaveOfferResponse(
        attempt_id=str(attempt.id),
        offer_type=attempt.offer_shown,
        discount_percent=discount_percent,
    )


@router.post(
    "/save-offer/{attempt_id}/accept",
    response_model=Subscription,
    dependencies=[Depends(require_org_owner)],
)
async def accept_save_offer(
    attempt_id: str,
    ctx: OrgContext,
    save_offer_service: Annotated[SaveOfferService, Depends(get_save_offer_service)],
) -> Subscription:
    """
    Accept a save offer — applies the Stripe coupon to the subscription.

    Args:
        attempt_id: The cancel attempt ID from submit_cancel_survey
        ctx: Organization-scoped context
        save_offer_service: Injected SaveOfferService instance

    Returns:
        Updated subscription details

    Raises:
        HTTPException: 404 if attempt not found
        HTTPException: 400 if coupon application fails
    """
    from uuid import UUID

    try:
        return await save_offer_service.accept_offer(
            UUID(attempt_id), ctx.organization_id
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post(
    "/save-offer/{attempt_id}/decline",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_owner)],
)
async def decline_save_offer(
    attempt_id: str,
    ctx: OrgContext,
    save_offer_service: Annotated[SaveOfferService, Depends(get_save_offer_service)],
) -> None:
    """
    Decline a save offer — records that the user rejected the offer.

    Non-blocking: errors are swallowed so the user can proceed to cancel.

    Args:
        attempt_id: The cancel attempt ID from submit_cancel_survey
        ctx: Organization-scoped context
        save_offer_service: Injected SaveOfferService instance
    """
    from uuid import UUID

    await save_offer_service.mark_declined(UUID(attempt_id), ctx.organization_id)


@router.post("/subscription/cancel", dependencies=[Depends(require_org_owner)])
async def cancel_subscription(
    request: CancelRequest,
    ctx: OrgContext,
    subscription_service: Annotated[
        SubscriptionService, Depends(get_subscription_service)
    ],
    save_offer_service: Annotated[SaveOfferService, Depends(get_save_offer_service)],
) -> Subscription:
    """
    Cancel subscription.

    Default: Access until end of paid period.
    Immediate: Cancels now.

    If attempt_id is provided, marks the save offer as declined before canceling.

    Args:
        request: Cancel request with immediate flag and optional attempt_id
        ctx: Organization-scoped context
        subscription_service: Injected SubscriptionService instance
        save_offer_service: Injected SaveOfferService instance

    Returns:
        Updated subscription details

    Raises:
        HTTPException: 400 if cancellation fails
    """
    from uuid import UUID

    if request.attempt_id:
        try:
            await save_offer_service.mark_declined(
                UUID(request.attempt_id), ctx.organization_id
            )
        except Exception:
            logger.warning(
                "Failed to mark save offer declined for attempt %s", request.attempt_id
            )

    try:
        return await subscription_service.cancel_subscription(
            ctx.organization_id,
            at_period_end=not request.immediate,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/subscription/resume", dependencies=[Depends(require_org_owner)])
async def resume_subscription(
    ctx: OrgContext,
    subscription_service: Annotated[
        SubscriptionService, Depends(get_subscription_service)
    ],
) -> Subscription:
    """
    Resume a paused subscription or remove a scheduled cancellation.

    Args:
        ctx: Organization-scoped context
        subscription_service: Injected SubscriptionService instance

    Returns:
        Updated subscription details

    Raises:
        HTTPException: 400 if resume fails
    """
    try:
        return await subscription_service.resume_subscription(ctx.organization_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


def get_payment_method_service(
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
) -> PaymentMethodService:
    """Dependency for PaymentMethodService with proper scoping."""
    return PaymentMethodService(stripe_service=stripe_service, db=ctx.client)


async def _get_customer_id(ctx: OrgContext) -> str:
    """Helper to get customer_id from subscription."""
    result = (
        ctx.table("subscriptions")
        .select("stripe_customer_id")
        .eq("organization_id", str(ctx.organization_id))
        .single()
        .execute()
    )

    if not result.data or not result.data.get("stripe_customer_id"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No billing customer found",
        )

    customer_id: str = result.data["stripe_customer_id"]
    return customer_id


@router.get("/payment-methods")
async def list_payment_methods(
    ctx: OrgContext,
    payment_method_service: Annotated[
        PaymentMethodService, Depends(get_payment_method_service)
    ],
) -> list[dict[str, str | int | bool]]:
    """List all payment methods for current organization."""
    customer_id = await _get_customer_id(ctx)
    return await payment_method_service.list_payment_methods(customer_id)


@router.post("/payment-methods/setup", dependencies=[Depends(require_org_owner)])
async def create_setup_intent(
    ctx: OrgContext,
    payment_method_service: Annotated[
        PaymentMethodService, Depends(get_payment_method_service)
    ],
) -> dict[str, str]:
    """Create SetupIntent for adding a new payment method."""
    customer_id = await _get_customer_id(ctx)
    client_secret = await payment_method_service.create_setup_intent(customer_id)
    return {"client_secret": client_secret}


@router.post(
    "/payment-methods/{payment_method_id}/default",
    dependencies=[Depends(require_org_owner)],
)
async def set_default_payment_method(
    payment_method_id: str,
    ctx: OrgContext,
    payment_method_service: Annotated[
        PaymentMethodService, Depends(get_payment_method_service)
    ],
) -> dict[str, str]:
    """Set the default payment method."""
    customer_id = await _get_customer_id(ctx)
    try:
        await payment_method_service.set_default_payment_method(
            customer_id, payment_method_id
        )
        return {"status": "success"}
    except ValueError as e:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in str(e).lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete(
    "/payment-methods/{payment_method_id}",
    dependencies=[Depends(require_org_owner)],
)
async def remove_payment_method(
    payment_method_id: str,
    ctx: OrgContext,
    payment_method_service: Annotated[
        PaymentMethodService, Depends(get_payment_method_service)
    ],
) -> dict[str, str]:
    """Remove a payment method."""
    customer_id = await _get_customer_id(ctx)
    try:
        await payment_method_service.remove_payment_method(
            customer_id, payment_method_id
        )
        return {"status": "success"}
    except ValueError as e:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in str(e).lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(
            status_code=status_code,
            detail=str(e),
        )


@router.post("/portal", dependencies=[Depends(require_org_owner)])
async def create_portal_session(
    return_url: str,
    ctx: OrgContext,
    payment_method_service: Annotated[
        PaymentMethodService, Depends(get_payment_method_service)
    ],
) -> dict[str, str]:
    """Create Stripe Customer Portal session."""
    customer_id = await _get_customer_id(ctx)
    portal_url = await payment_method_service.create_portal_session(
        customer_id, return_url
    )
    return {"url": portal_url}


# Invoice History Endpoints


class InvoiceResponse(BaseModel):
    """Invoice response model."""

    id: str
    subscription_id: str | None = None
    stripe_invoice_id: str | None = None
    amount_due: float
    amount_paid: float
    currency: str
    status: str
    period_start: str | None = None
    period_end: str | None = None
    due_date: str | None = None
    paid_at: str | None = None
    pdf_url: str | None = None
    created_at: str


class InvoiceListResponse(BaseModel):
    """Paginated invoice list response."""

    invoices: list[InvoiceResponse]
    total: int
    page: int
    per_page: int
    has_more: bool


class InvoiceSummaryResponse(BaseModel):
    """Billing summary statistics."""

    total_invoices: int
    paid_invoices: int
    open_invoices: int
    total_paid: float
    currency: str


@router.get("/invoices", response_model=InvoiceListResponse)
def list_invoices(
    ctx: OrgContext,
    status: str | None = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
) -> InvoiceListResponse:
    """
    List invoices for current organization.

    Supports filtering by status and pagination.
    """
    # Build query
    query = (
        ctx.table("invoices")
        .select("*", count="exact")
        .eq("organization_id", str(ctx.organization_id))
        .order("created_at", desc=True)
    )

    if status:
        query = query.eq("status", status)

    # Apply pagination
    start = (page - 1) * per_page
    query = query.range(start, start + per_page - 1)

    result = query.execute()

    total = result.count or 0
    has_more = start + per_page < total

    return InvoiceListResponse(
        invoices=[InvoiceResponse(**inv) for inv in result.data],
        total=total,
        page=page,
        per_page=per_page,
        has_more=has_more,
    )


@router.get("/invoices/summary", response_model=InvoiceSummaryResponse)
def get_invoice_summary(
    ctx: OrgContext,
) -> InvoiceSummaryResponse:
    """Get summary of billing history."""
    result = (
        ctx.table("invoices")
        .select("status, amount_paid")
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )

    invoices = result.data or []

    total_paid = sum(
        float(inv["amount_paid"]) for inv in invoices if inv["status"] == "paid"
    )

    return InvoiceSummaryResponse(
        total_invoices=len(invoices),
        paid_invoices=len([i for i in invoices if i["status"] == "paid"]),
        open_invoices=len([i for i in invoices if i["status"] == "open"]),
        total_paid=total_paid,
        currency="usd",
    )


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: str,
    ctx: OrgContext,
) -> InvoiceResponse:
    """Get a specific invoice."""
    result = (
        ctx.table("invoices")
        .select("*")
        .eq("id", invoice_id)
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Invoice not found")

    return InvoiceResponse(**result.data[0])


@router.get("/invoices/{invoice_id}/pdf")
def get_invoice_pdf(
    invoice_id: str,
    ctx: OrgContext,
) -> RedirectResponse:
    """
    Get PDF download URL for an invoice.

    Redirects to Stripe-hosted PDF.
    """
    result = (
        ctx.table("invoices")
        .select("pdf_url")
        .eq("id", invoice_id)
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Invoice not found")

    pdf_url = result.data[0].get("pdf_url")
    if not pdf_url:
        raise HTTPException(404, "PDF not available")

    return RedirectResponse(pdf_url)


# Checkout Endpoints


class CheckoutRequest(BaseModel):
    """Checkout session request."""

    plan_id: str
    billing_period: Literal["annual"] = "annual"
    unit_count: int = 1
    building_count: int = 1
    success_url: str
    cancel_url: str
    offer_token: str | None = None
    launch_offer_code: str | None = None


SELF_SERVE_PLAN_IDS = {
    "reconcile",
}


class CheckoutResponse(BaseModel):
    """Checkout session response."""

    checkout_url: str
    session_id: str


class UsedFeature(BaseModel):
    """A feature the org has used, with its minimum required tier."""

    key: str
    label: str
    required_tier: str
    first_used_at: str | None = None
    last_used_at: str | None = None


class FeatureUsageResponse(BaseModel):
    """Feature usage summary for the authenticated org."""

    used_features: list[UsedFeature]
    current_tier: str | None = None


_CHECKOUT_PLAN_TO_SUBSCRIPTION_PLAN = {
    "reconcile": "growth_v2",
}


_OFFER_TIER_TO_COUPON_ATTR = {
    "offer_50": "stripe_free_audit_coupon_offer_50",
    "offer_free": "stripe_free_audit_coupon_offer_free",
}


def _resolve_launch_offer_coupon(launch_offer_code: str | None) -> str | None:
    """Return the Stripe coupon ID for a trusted app limited offer code."""
    if launch_offer_code is None:
        return None

    if launch_offer_code != LAUNCH_OFFER["code"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid limited offer code",
        )

    coupon_id = get_stripe_settings().stripe_80off_coupon_id
    if not coupon_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Limited offer coupon is not configured",
        )
    return coupon_id


def _resolve_coupon_and_tier(
    offer_token: str,
    organization_id: str,
) -> tuple[str, str]:
    """Validate offer token exactly once; return (coupon_id, offer_tier)."""
    settings = get_settings()
    stripe_settings = get_stripe_settings()
    now = datetime.now(UTC)
    try:
        tier = extract_offer_tier_from_token(
            offer_token=offer_token,
            organization_id=organization_id,
            secret=settings.checkout_offer_token_secret,
            now=now,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid offer token: {exc}",
        ) from exc
    coupon_attr = _OFFER_TIER_TO_COUPON_ATTR.get(tier)
    if coupon_attr is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid offer token: invalid offer tier",
        )
    return getattr(stripe_settings, coupon_attr), tier


def _do_start_trial(
    ctx: OrgContext,
    *,
    plan_id: str,
    billing_period: str,
    unit_count: int,
    building_count: int,
) -> PlanSelectionResponse:
    """Shared logic for starting a no-card trial subscription."""
    tier_details = _validate_self_serve_plan_selection(
        plan_id=plan_id,
        billing_period=billing_period,
        unit_count=unit_count,
        building_count=building_count,
    )

    sub_result = (
        ctx.table("subscriptions")
        .select("status")
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    existing_status = (
        str(sub_result.data.get("status"))
        if sub_result and isinstance(sub_result.data, dict)
        else None
    )

    if existing_status == "paused":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Your trial is paused because billing was not added before it ended. "
                "Add a payment method in billing settings to resume access."
            ),
        )

    activation = persist_billing_activation(
        ctx.client,
        str(ctx.organization_id),
        plan_id=plan_id,
        billing_period=billing_period,
        unit_count=unit_count,
        building_count=building_count,
        checkout_required=False,
    )

    if existing_status not in {"active", "trialing"}:
        now = datetime.now(UTC)
        included_units = int(tier_details["included_units"])
        unit_overage_count = max(unit_count - included_units, 0)
        ctx.table("subscriptions").upsert(
            {
                "organization_id": str(ctx.organization_id),
                "stripe_subscription_id": None,
                "stripe_customer_id": None,
                "plan": _CHECKOUT_PLAN_TO_SUBSCRIPTION_PLAN[plan_id],
                "tier": plan_id,
                "status": "trialing",
                "pricing_model": "per_unit",
                "billing_interval": billing_period,
                "building_count": building_count,
                "unit_count": unit_count,
                "included_units": included_units,
                "unit_overage_count": unit_overage_count,
                "current_period_start": now.isoformat(),
                "current_period_end": (now + timedelta(days=TRIAL_DAYS)).isoformat(),
                "cancel_at_period_end": False,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            },
            on_conflict="organization_id",
        ).execute()

    return _build_plan_selection_response(ctx, activation)


@router.post(
    "/trial/start",
    response_model=PlanSelectionResponse,
    dependencies=[Depends(require_org_owner)],
)
async def start_trial(
    request: TrialStartRequest,
    ctx: OrgContext,
) -> PlanSelectionResponse:
    """Start a no-card self-serve trial and unlock the app workspace."""
    _resolve_launch_offer_coupon(request.launch_offer_code)

    return _do_start_trial(
        ctx,
        plan_id=request.plan_id,
        billing_period=request.billing_period,
        unit_count=request.unit_count,
        building_count=request.building_count,
    )


@router.post(
    "/trial/start-default",
    response_model=PlanSelectionResponse,
    dependencies=[Depends(require_org_owner)],
)
async def start_default_trial(
    ctx: OrgContext,
) -> PlanSelectionResponse:
    """Auto-start a Reconcile trial on signup. No plan selection required."""
    return _do_start_trial(
        ctx,
        plan_id="reconcile",
        billing_period="annual",
        unit_count=25,
        building_count=1,
    )


@router.get(
    "/feature-usage",
    response_model=FeatureUsageResponse,
    dependencies=[Depends(require_org_owner)],
)
async def get_feature_usage(
    ctx: OrgContext,
) -> FeatureUsageResponse:
    """Return the features this org has used, enriched with required tier.

    Used by the billing page to warn about feature lock-out before downgrade.
    """
    admin_db = get_supabase_admin()
    used = list_used_features(admin_db, str(ctx.organization_id))

    sub_result = (
        ctx.table("subscriptions")
        .select("tier")
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    current_tier = (
        str(sub_result.data.get("tier"))
        if sub_result
        and isinstance(sub_result.data, dict)
        and sub_result.data.get("tier")
        else None
    )

    return FeatureUsageResponse(
        used_features=[UsedFeature(**f) for f in used],
        current_tier=current_tier,
    )


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    dependencies=[Depends(require_org_owner)],
)
async def create_checkout_session(
    request: CheckoutRequest,
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
) -> CheckoutResponse:
    """
    Create Stripe Checkout Session for subscription.

    Redirects user to Stripe-hosted checkout page.
    Reconcile supports self-serve annual checkout priced by rentable unit count.
    """
    if request.offer_token and request.launch_offer_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Choose either a limited offer code or winback offer token, " "not both"
            ),
        )
    coupon_id = _resolve_launch_offer_coupon(request.launch_offer_code)

    tier_details = _validate_self_serve_plan_selection(
        plan_id=request.plan_id,
        billing_period=request.billing_period,
        unit_count=request.unit_count,
        building_count=request.building_count,
    )

    # Get or create Stripe customer
    sub_result = (
        ctx.table("subscriptions")
        .select("stripe_customer_id,stripe_subscription_id,status,current_period_end")
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )

    if (
        sub_result
        and sub_result.data
        and sub_result.data.get("status") == "paused"
        and sub_result.data.get("stripe_subscription_id")
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Your trial is paused because billing was not added before it ended. "
                "Add a payment method in billing settings to resume access."
            ),
        )

    customer_id = (
        sub_result.data.get("stripe_customer_id")
        if sub_result and sub_result.data
        else None
    )

    if not customer_id:
        # Get organization details for customer creation
        org_result = (
            ctx.table("organizations")
            .select("*")
            .eq("id", str(ctx.organization_id))
            .single()
            .execute()
        )

        if not org_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )

        org = org_result.data
        email = org.get("billing_email") or ctx.user.email
        name = org.get("name", "")

        # Create new customer
        customer = await stripe_service.create_customer(
            email=email,
            name=name,
            metadata={"organization_id": str(ctx.organization_id)},
        )
        customer_id = customer.id
        if sub_result and sub_result.data:
            ctx.table("subscriptions").update({"stripe_customer_id": customer_id}).eq(
                "organization_id", str(ctx.organization_id)
            ).execute()

    saved_activation = get_billing_activation(
        get_org_settings(ctx.client, str(ctx.organization_id))
    )
    if saved_activation and saved_activation.get("checkout_required"):
        saved_payload = {
            "plan_id": saved_activation.get("plan_id"),
            "billing_period": saved_activation.get("billing_period"),
            "unit_count": saved_activation.get("unit_count"),
            "building_count": saved_activation.get("building_count"),
        }
        request_payload = {
            "plan_id": request.plan_id,
            "billing_period": request.billing_period,
            "unit_count": request.unit_count,
            "building_count": request.building_count,
        }
        if saved_payload != request_payload:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Saved checkout selection does not match this request",
            )
    else:
        persist_billing_activation(
            ctx.client,
            str(ctx.organization_id),
            plan_id=request.plan_id,
            billing_period=request.billing_period,
            unit_count=request.unit_count,
            building_count=request.building_count,
            checkout_required=True,
        )

    included_units = int(tier_details["included_units"])
    unit_overage_count = max(request.unit_count - included_units, 0)
    annual_total_cents = get_annual_total_cents(request.plan_id, request.unit_count)
    if annual_total_cents is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"No annual price configured for tier: {request.plan_id}",
        )

    line_items = _build_reconcile_checkout_line_items(
        unit_count=request.unit_count,
        annual_total_cents=annual_total_cents,
    )

    # Create checkout session
    offer_tier: str | None = None
    if request.offer_token:
        coupon_id, offer_tier = _resolve_coupon_and_tier(
            request.offer_token,
            str(ctx.organization_id),
        )
        winback_result = (
            ctx.table("free_audit_winback_offers")
            .select("redeemed_offer_tier")
            .eq("organization_id", str(ctx.organization_id))
            .maybe_single()
            .execute()
        )
        if (
            winback_result
            and winback_result.data
            and winback_result.data.get("redeemed_offer_tier")
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A winback offer has already been redeemed for this organization",  # noqa: E501
            )

    extra_metadata: dict[str, str] = {}
    if offer_tier:
        extra_metadata["offer_tier"] = offer_tier

    local_subscription_without_stripe = bool(
        sub_result
        and sub_result.data
        and sub_result.data.get("status") in {"trialing", "paused"}
        and not sub_result.data.get("stripe_subscription_id")
    )
    if local_subscription_without_stripe:
        remaining_trial_days = _remaining_trial_days(
            sub_result.data.get("current_period_end")
        )
    else:
        remaining_trial_days = TRIAL_DAYS

    session = await stripe_service.create_checkout_session(
        customer_id=customer_id,
        line_items=line_items,
        success_url=request.success_url,
        cancel_url=request.cancel_url,
        metadata={
            "organization_id": str(ctx.organization_id),
            "plan_id": request.plan_id,
            "pricing_model": "per_unit",
            "building_count": str(request.building_count),
            "unit_count": str(request.unit_count),
            "included_units": str(included_units),
            "unit_overage_count": str(unit_overage_count),
            "annual_total_cents": str(annual_total_cents),
            **extra_metadata,
        },
        trial_days=remaining_trial_days,
        coupon_id=coupon_id,
    )

    if not session.url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create checkout session",
        )

    return CheckoutResponse(
        checkout_url=session.url,
        session_id=session.id,
    )


@router.get("/checkout/success")
async def checkout_success(
    session_id: str,
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
) -> dict[str, str]:
    """
    Handle successful checkout return.

    Note: Actual subscription creation happens via webhook.
    This endpoint confirms the session and shows success UI.
    """
    import stripe

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.InvalidRequestError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session",
        )

    # Verify session belongs to this org
    metadata = cast(Any, session.metadata)
    if not metadata or metadata.get("organization_id") != str(ctx.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session does not belong to this organization",
        )

    return {
        "status": "success",
        "subscription_id": str(session.subscription) if session.subscription else "",
        "customer_id": str(session.customer) if session.customer else "",
    }


# ── Credit pack endpoints ────────────────────────────────────────────────────


@router.post(
    "/subscribe",
    response_model=SubscribeResponse,
    dependencies=[Depends(require_org_owner)],
)
async def create_subscription(
    request: SubscribeRequest,
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
    customer_service: Annotated[CustomerService, Depends(get_customer_service)],
) -> SubscribeResponse:
    """Create a Stripe Checkout session for a new subscription with trial.

    Creates a Reconcile subscription checkout with the configured free trial
    and unit-based annual pricing.
    """
    tier_details = _validate_self_serve_plan_selection(
        plan_id=request.tier,
        billing_period="annual",
        unit_count=request.unit_count,
        building_count=request.building_count,
    )

    price_cents = get_annual_total_cents(request.tier, request.unit_count)
    if price_cents is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"No annual price configured for tier: {request.tier}",
        )
    included_units = int(tier_details["included_units"])
    unit_overage_count = max(request.unit_count - included_units, 0)
    line_items = _build_reconcile_checkout_line_items(
        unit_count=request.unit_count,
        annual_total_cents=price_cents,
    )

    # Get or create Stripe customer
    org_result = (
        ctx.table("organizations")
        .select("name,billing_email")
        .eq("id", str(ctx.organization_id))
        .single()
        .execute()
    )
    if not org_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    org = org_result.data
    email = org.get("billing_email") or ctx.user.email
    name = org.get("name", "")

    customer = await customer_service.get_or_create_customer(
        organization_id=ctx.organization_id,
        email=email,
        name=name,
    )

    persist_billing_activation(
        ctx.client,
        str(ctx.organization_id),
        plan_id=request.tier,
        billing_period="annual",
        unit_count=request.unit_count,
        building_count=request.building_count,
        checkout_required=True,
    )

    sub_result = (
        ctx.table("subscriptions")
        .select("status,current_period_end,stripe_subscription_id")
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    local_subscription_without_stripe = bool(
        sub_result
        and sub_result.data
        and sub_result.data.get("status") in {"trialing", "paused"}
        and not sub_result.data.get("stripe_subscription_id")
    )
    if local_subscription_without_stripe:
        remaining_trial_days = _remaining_trial_days(
            sub_result.data.get("current_period_end")
        )
    else:
        remaining_trial_days = TRIAL_DAYS

    session = await stripe_service.create_checkout_session(
        customer_id=customer.id,
        line_items=line_items,
        trial_days=remaining_trial_days,
        success_url=request.success_url,
        cancel_url=request.cancel_url,
        metadata={
            "billing_model": "subscription",
            "organization_id": str(ctx.organization_id),
            "tier": request.tier,
            "plan_id": request.tier,
            "pricing_model": "per_unit",
            "building_count": str(request.building_count),
            "unit_count": str(request.unit_count),
            "included_units": str(included_units),
            "unit_overage_count": str(unit_overage_count),
            "annual_total_cents": str(price_cents),
        },
    )

    if not session.url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create checkout session",
        )

    return SubscribeResponse(
        checkout_url=session.url,
        tier=request.tier,
        price_annual_cents=price_cents,
        trial_days=remaining_trial_days,
    )


@router.get("/credits", response_model=CreditBalance)
async def get_credits(ctx: OrgContext) -> CreditBalance:
    """Get the organization's current credit balance."""
    balance = get_credit_balance(ctx)
    return CreditBalance(**balance)


@router.get("/credits/history", response_model=list[CreditPack])
async def get_credit_history(ctx: OrgContext) -> list[CreditPack]:
    """Get all credit pack purchases for the organization."""
    rows = list_audit_credit_rows(
        ctx,
        "*",
        order_by="purchased_at",
        desc=True,
    )
    return [CreditPack(**row) for row in rows]
