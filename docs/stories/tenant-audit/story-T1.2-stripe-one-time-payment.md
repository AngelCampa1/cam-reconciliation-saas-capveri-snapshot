# Story T1.2: Stripe One-Time Payment

## Story Info
- **Epic**: T1 — Backend Payment & Data Model
- **Estimated Hours**: 5
- **Dependencies**: T1.1 (Tenant Audit Data Model)
- **Status**: `pending`

## User Story
As a commercial tenant, I want to pay a one-time fee for my CAM audit so that I can receive an independent analysis without subscribing to a platform.

## Acceptance Criteria
- Three pricing tiers are available: Standard ($49), Detailed ($99), Expert ($199)
- Each tier maps to a Stripe Price ID configured via environment variables
- POST to `/api/v1/tenant-audits/{access_token}/pay` creates a Stripe Checkout Session in `payment` mode (not `subscription`)
- The Checkout Session includes the audit `access_token` in metadata for webhook correlation
- Success and cancel URLs redirect back to the tenant audit status page
- Audit status transitions from `created` to `payment_pending` when checkout is initiated
- Rate limited to 10 payment attempts per hour per IP
- Invalid access tokens return 404
- Audits already paid return 409 Conflict

## Technical Specifications

### Stripe Configuration

```python
# backend/app/services/tenant_audit/config.py
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class TenantAuditStripeSettings(BaseSettings):
    """Stripe Price IDs for one-time tenant audit payments."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # One-time Price IDs (created in Stripe Dashboard)
    stripe_price_tenant_audit_standard: str = "price_tenant_audit_standard"
    stripe_price_tenant_audit_detailed: str = "price_tenant_audit_detailed"
    stripe_price_tenant_audit_expert: str = "price_tenant_audit_expert"

    # Webhook secret (separate from subscription webhook)
    stripe_tenant_audit_webhook_secret: str = "whsec_tenant_audit"

    # Frontend URLs for redirect
    tenant_audit_frontend_url: str = "https://www.capveri.com/audit"


@lru_cache
def get_tenant_audit_stripe_settings() -> TenantAuditStripeSettings:
    """Get tenant audit Stripe settings from environment."""
    return TenantAuditStripeSettings()  # type: ignore[call-arg]
```

### Tier-to-Price Mapping

```python
# backend/app/services/tenant_audit/pricing.py
from app.models.tenant_audit import TenantAuditTier, TIER_PRICES_CENTS
from .config import get_tenant_audit_stripe_settings


def get_stripe_price_id(tier: TenantAuditTier) -> str:
    """Map a tenant audit tier to its Stripe Price ID."""
    settings = get_tenant_audit_stripe_settings()
    tier_to_price: dict[TenantAuditTier, str] = {
        TenantAuditTier.STANDARD: settings.stripe_price_tenant_audit_standard,
        TenantAuditTier.DETAILED: settings.stripe_price_tenant_audit_detailed,
        TenantAuditTier.EXPERT: settings.stripe_price_tenant_audit_expert,
    }
    price_id = tier_to_price.get(tier)
    if not price_id:
        raise ValueError(f"No Stripe Price ID configured for tier: {tier.value}")
    return price_id


def get_tier_price_cents(tier: TenantAuditTier) -> int:
    """Get the price in cents for a given tier."""
    return TIER_PRICES_CENTS[tier]
```

### Payment Service

```python
# backend/app/services/tenant_audit/payment.py
from datetime import datetime
from typing import Any
from uuid import UUID

import stripe

from app.core.circuit_breakers import get_stripe_breaker
from app.exceptions import ServiceUnavailableError
from app.models.tenant_audit import TenantAuditStatus, validate_status_transition
from app.services.billing.stripe_client import get_stripe_client

from .config import get_tenant_audit_stripe_settings
from .pricing import get_stripe_price_id
from .repository import TenantAuditRepository

import pybreaker


class TenantAuditPaymentService:
    """Handle Stripe one-time payments for tenant audits."""

    def __init__(self, repository: TenantAuditRepository) -> None:
        self.repository = repository
        get_stripe_client()  # Ensure Stripe is configured

    async def create_checkout_session(
        self, access_token: UUID
    ) -> stripe.checkout.Session:
        """
        Create a Stripe Checkout Session for one-time payment.

        Transitions audit status from 'created' to 'payment_pending'.
        Returns the Checkout Session (caller uses session.url for redirect).
        """
        audit = await self.repository.get_by_access_token(access_token)
        if audit is None:
            raise LookupError(f"Tenant audit not found: {access_token}")

        # Only allow payment from 'created' or 'payment_pending' (retry)
        if audit.status not in (
            TenantAuditStatus.CREATED,
            TenantAuditStatus.PAYMENT_PENDING,
        ):
            raise ValueError(
                f"Audit is in status '{audit.status.value}' and cannot "
                f"accept payment. Expected 'created' or 'payment_pending'."
            )

        settings = get_tenant_audit_stripe_settings()
        price_id = get_stripe_price_id(audit.tier)

        try:
            session: Any = get_stripe_breaker().call(
                lambda: stripe.checkout.Session.create(
                    mode="payment",  # One-time, NOT subscription
                    payment_method_types=["card"],
                    line_items=[{"price": price_id, "quantity": 1}],
                    customer_email=audit.email,
                    metadata={
                        "tenant_audit_access_token": str(audit.access_token),
                        "tenant_audit_id": str(audit.id),
                        "tier": audit.tier.value,
                    },
                    success_url=(
                        f"{settings.tenant_audit_frontend_url}"
                        f"/{audit.access_token}/status"
                        f"?payment=success&session_id={{CHECKOUT_SESSION_ID}}"
                    ),
                    cancel_url=(
                        f"{settings.tenant_audit_frontend_url}"
                        f"/{audit.access_token}/status"
                        f"?payment=cancelled"
                    ),
                    expires_after=1800,  # 30 minutes
                )
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e

        # Transition to payment_pending (idempotent if already pending)
        if audit.status == TenantAuditStatus.CREATED:
            await self.repository.update_status(
                audit_id=audit.id,
                current_status=TenantAuditStatus.CREATED,
                new_status=TenantAuditStatus.PAYMENT_PENDING,
                extra_fields={
                    "checkout_session_id": session.id,
                },
            )
        else:
            # Re-attempt: update checkout session ID
            await self.repository.update_status(
                audit_id=audit.id,
                current_status=TenantAuditStatus.PAYMENT_PENDING,
                new_status=TenantAuditStatus.PAYMENT_PENDING,
                extra_fields={
                    "checkout_session_id": session.id,
                },
            )

        await self.repository.log_event(
            audit_id=audit.id,
            event_type="payment_initiated",
            event_data={
                "checkout_session_id": session.id,
                "tier": audit.tier.value,
                "amount_cents": audit.amount_cents,
            },
        )

        return session  # type: ignore[no-any-return]

    async def handle_refund(self, access_token: UUID) -> stripe.Refund:
        """
        Issue a full refund for a failed audit.

        Transitions status from 'failed' to 'refunded'.
        """
        audit = await self.repository.get_by_access_token(access_token)
        if audit is None:
            raise LookupError(f"Tenant audit not found: {access_token}")

        if audit.status != TenantAuditStatus.FAILED:
            raise ValueError(
                f"Cannot refund audit in status '{audit.status.value}'. "
                f"Only 'failed' audits can be refunded."
            )

        if not audit.payment_intent_id:
            raise ValueError(
                "Cannot refund: no payment_intent_id recorded."
            )

        try:
            refund: Any = get_stripe_breaker().call(
                lambda: stripe.Refund.create(
                    payment_intent=audit.payment_intent_id,
                    metadata={
                        "tenant_audit_id": str(audit.id),
                        "reason": "processing_failure",
                    },
                )
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e

        await self.repository.update_status(
            audit_id=audit.id,
            current_status=TenantAuditStatus.FAILED,
            new_status=TenantAuditStatus.REFUNDED,
            extra_fields={
                "refund_id": refund.id,
                "refunded_at": datetime.utcnow().isoformat(),
            },
        )

        await self.repository.log_event(
            audit_id=audit.id,
            event_type="refunded",
            event_data={
                "refund_id": refund.id,
                "payment_intent_id": audit.payment_intent_id,
                "amount_cents": audit.amount_paid_cents,
                "reason": "processing_failure",
            },
        )

        return refund  # type: ignore[no-any-return]
```

### API Endpoint

```python
# Excerpt from backend/app/api/v1/tenant_audits.py (pay endpoint)
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status

from app.models.tenant_audit import TenantAuditStatus
from app.schemas.tenant_audit import PaymentSessionResponse


@router.post(
    "/{access_token}/pay",
    response_model=PaymentSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment_session(
    access_token: UUID,
    request: Request,
    payment_service: TenantAuditPaymentService = Depends(get_payment_service),
):
    """Create a Stripe Checkout Session for one-time audit payment."""
    try:
        session = await payment_service.create_checkout_session(access_token)
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    return PaymentSessionResponse(
        checkout_url=session.url,
        session_id=session.id,
        expires_at=session.expires_at,
    )
```

### Response Schema

```python
# Addition to backend/app/schemas/tenant_audit.py
from datetime import datetime


class PaymentSessionResponse(BaseModel):
    """Response containing the Stripe Checkout URL."""

    checkout_url: str
    session_id: str
    expires_at: int  # Unix timestamp
```

### Environment Variables

```bash
# .env additions for tenant audit Stripe
STRIPE_PRICE_TENANT_AUDIT_STANDARD=price_xxx_standard
STRIPE_PRICE_TENANT_AUDIT_DETAILED=price_xxx_detailed
STRIPE_PRICE_TENANT_AUDIT_EXPERT=price_xxx_expert
STRIPE_TENANT_AUDIT_WEBHOOK_SECRET=whsec_xxx
TENANT_AUDIT_FRONTEND_URL=https://www.capveri.com/audit
```

## Test Cases
- `create_checkout_session` creates a Stripe session in `payment` mode (not `subscription`)
- Checkout session metadata includes `tenant_audit_access_token` and `tenant_audit_id`
- Audit status transitions from `created` to `payment_pending` on session creation
- Re-creating a session when already `payment_pending` updates `checkout_session_id` (idempotent retry)
- Attempting payment on a `paid` audit raises `ValueError` (409 Conflict)
- Attempting payment on a `completed` audit raises `ValueError`
- Nonexistent `access_token` raises `LookupError` (404)
- `get_stripe_price_id` maps each tier to the correct environment variable
- `get_stripe_price_id` raises `ValueError` for unknown tier
- `handle_refund` transitions `failed` -> `refunded` and creates Stripe Refund
- `handle_refund` raises `ValueError` when audit is not in `failed` status
- `handle_refund` raises `ValueError` when `payment_intent_id` is missing
- Circuit breaker wraps all Stripe calls; `CircuitBreakerError` maps to `ServiceUnavailableError`
- Success URL includes `access_token` and `session_id` template
- Cancel URL includes `access_token` and `payment=cancelled` param
- Event log records `payment_initiated` with checkout session ID and amount
- Event log records `refunded` with refund ID and reason
- API endpoint returns 201 with `checkout_url`, `session_id`, `expires_at`
- API endpoint returns 404 for unknown access token
- API endpoint returns 409 for already-paid audit

## Definition of Done
- [ ] `TenantAuditStripeSettings` reads Price IDs from environment
- [ ] `get_stripe_price_id()` maps all 3 tiers to Price IDs
- [ ] `TenantAuditPaymentService.create_checkout_session()` creates one-time Checkout Session
- [ ] Checkout Session uses `mode="payment"` (not subscription)
- [ ] Metadata includes access_token and audit ID for webhook correlation
- [ ] Status transitions from `created` to `payment_pending`
- [ ] Idempotent retry when already `payment_pending`
- [ ] `handle_refund()` issues full refund and transitions to `refunded`
- [ ] All Stripe calls wrapped with circuit breaker
- [ ] Event log entries created for payment_initiated and refunded
- [ ] API endpoint returns proper HTTP status codes (201, 404, 409)
- [ ] Unit tests cover all payment flows with mocked Stripe
- [ ] Coverage maintained at >= 95%
