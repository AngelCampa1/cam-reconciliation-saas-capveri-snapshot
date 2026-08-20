# Story T1.3: Stripe Webhook Handler

## Story Info
- **Epic**: T1 — Backend Payment & Data Model
- **Estimated Hours**: 4
- **Dependencies**: T1.1 (Tenant Audit Data Model), T1.2 (Stripe One-Time Payment)
- **Status**: `pending`

## User Story
As a platform engineer, I want a Stripe webhook handler that processes `checkout.session.completed` events so that tenant audits automatically transition to `paid` status and trigger background processing after successful payment.

## Acceptance Criteria
- POST `/api/v1/tenant-audits/webhooks/stripe` receives Stripe webhook events
- Webhook signature is verified using `stripe_tenant_audit_webhook_secret`
- `checkout.session.completed` event transitions audit from `payment_pending` to `paid`
- Payment intent ID and amount paid are recorded on the audit record
- Audit event log records the `paid` event with Stripe session and payment details
- Duplicate webhook deliveries are handled idempotently (same session ID does not re-process)
- Unknown event types return 200 OK (acknowledged but ignored)
- Invalid signatures return 400 Bad Request
- Missing or malformed `tenant_audit_access_token` in metadata is logged and returns 200 (no retry)
- Auto-refund is triggered when processing fails (transition from `failed` to `refunded`)
- No rate limiting on webhook endpoint (Stripe manages delivery)
- Webhook triggers background processing task after payment confirmation

## Technical Specifications

### Webhook Endpoint

```python
# backend/app/api/v1/tenant_audit_webhooks.py
import logging
from typing import Any

import stripe
from fastapi import APIRouter, Header, HTTPException, Request, status

from app.services.billing.stripe_client import get_stripe_client
from app.services.tenant_audit.config import get_tenant_audit_stripe_settings
from app.services.tenant_audit.webhook_handler import TenantAuditWebhookHandler

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/tenant-audits/webhooks",
    tags=["tenant-audit-webhooks"],
)


@router.post(
    "/stripe",
    status_code=status.HTTP_200_OK,
    include_in_schema=False,  # Hide from OpenAPI — not a user-facing endpoint
)
async def handle_stripe_webhook(
    request: Request,
    stripe_signature: str = Header(alias="Stripe-Signature"),
    handler: TenantAuditWebhookHandler = Depends(get_webhook_handler),
):
    """
    Receive and process Stripe webhook events for tenant audits.

    This endpoint is called by Stripe, not by users. It verifies the
    webhook signature and delegates to the appropriate handler.
    """
    payload = await request.body()
    settings = get_tenant_audit_stripe_settings()

    # Verify webhook signature
    try:
        get_stripe_client()  # Ensure configured
        event = stripe.Webhook.construct_event(
            payload,
            stripe_signature,
            settings.stripe_tenant_audit_webhook_secret,
        )
    except ValueError:
        logger.warning("Webhook: invalid payload")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload",
        )
    except stripe.error.SignatureVerificationError:
        logger.warning("Webhook: invalid signature")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature",
        )

    # Dispatch by event type
    try:
        await handler.handle_event(event)
    except Exception:
        # Log but return 200 to prevent Stripe retries for application errors.
        # The event is logged in tenant_audit_events for manual review.
        logger.exception(
            "Webhook handler error for event %s (type: %s)",
            event.id,
            event.type,
        )

    return {"status": "ok"}
```

### Webhook Handler Service

```python
# backend/app/services/tenant_audit/webhook_handler.py
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

import stripe

from app.models.tenant_audit import TenantAuditStatus
from .payment import TenantAuditPaymentService
from .repository import TenantAuditRepository

logger = logging.getLogger(__name__)


class TenantAuditWebhookHandler:
    """
    Process Stripe webhook events for tenant audit payments.

    Handles:
    - checkout.session.completed: Payment confirmed -> start processing
    - checkout.session.expired: Checkout abandoned -> revert to created
    """

    def __init__(
        self,
        repository: TenantAuditRepository,
        payment_service: TenantAuditPaymentService,
    ) -> None:
        self.repository = repository
        self.payment_service = payment_service

    async def handle_event(self, event: stripe.Event) -> None:
        """Route event to the appropriate handler method."""
        handlers: dict[str, Any] = {
            "checkout.session.completed": self._handle_checkout_completed,
            "checkout.session.expired": self._handle_checkout_expired,
        }

        handler = handlers.get(event.type)
        if handler is None:
            logger.info(
                "Ignoring unhandled event type: %s (id: %s)",
                event.type,
                event.id,
            )
            return

        await handler(event)

    async def _handle_checkout_completed(
        self, event: stripe.Event
    ) -> None:
        """
        Handle successful checkout completion.

        1. Extract access_token from session metadata.
        2. Validate audit exists and is in payment_pending status.
        3. Record payment details (payment_intent_id, amount_paid).
        4. Transition to 'paid' status.
        5. Log event.
        6. Trigger background processing.
        """
        session = event.data.object
        metadata = session.get("metadata", {})

        access_token_str = metadata.get("tenant_audit_access_token")
        if not access_token_str:
            logger.error(
                "checkout.session.completed missing tenant_audit_access_token "
                "in metadata. Session: %s",
                session.get("id"),
            )
            return  # Acknowledge but skip — nothing to correlate

        try:
            access_token = UUID(access_token_str)
        except ValueError:
            logger.error(
                "Invalid access_token UUID in metadata: %s", access_token_str
            )
            return

        audit = await self.repository.get_by_access_token(access_token)
        if audit is None:
            logger.error(
                "Tenant audit not found for access_token: %s", access_token
            )
            return

        # Idempotency: if already paid or beyond, skip
        if audit.status in (
            TenantAuditStatus.PAID,
            TenantAuditStatus.PROCESSING,
            TenantAuditStatus.COMPLETED,
        ):
            logger.info(
                "Duplicate webhook: audit %s already in status '%s'. Skipping.",
                audit.id,
                audit.status.value,
            )
            return

        if audit.status != TenantAuditStatus.PAYMENT_PENDING:
            logger.warning(
                "Unexpected status '%s' for audit %s on checkout.completed. "
                "Expected 'payment_pending'.",
                audit.status.value,
                audit.id,
            )
            return

        # Extract payment details
        payment_intent_id = session.get("payment_intent")
        amount_total = session.get("amount_total")  # In cents

        # Transition: payment_pending -> paid
        await self.repository.update_status(
            audit_id=audit.id,
            current_status=TenantAuditStatus.PAYMENT_PENDING,
            new_status=TenantAuditStatus.PAID,
            extra_fields={
                "payment_intent_id": payment_intent_id,
                "amount_paid_cents": amount_total,
                "paid_at": datetime.utcnow().isoformat(),
            },
        )

        await self.repository.log_event(
            audit_id=audit.id,
            event_type="paid",
            event_data={
                "stripe_event_id": event.id,
                "checkout_session_id": session.get("id"),
                "payment_intent_id": payment_intent_id,
                "amount_cents": amount_total,
                "customer_email": session.get("customer_email"),
            },
        )

        logger.info(
            "Tenant audit %s marked as paid. Payment intent: %s, Amount: %d cents.",
            audit.id,
            payment_intent_id,
            amount_total or 0,
        )

        # Trigger background processing (Epic T2 will implement the processor)
        await self._enqueue_processing(audit.id, access_token)

    async def _handle_checkout_expired(
        self, event: stripe.Event
    ) -> None:
        """
        Handle checkout session expiration.

        Reverts audit from payment_pending back to created so the
        tenant can try again.
        """
        session = event.data.object
        metadata = session.get("metadata", {})

        access_token_str = metadata.get("tenant_audit_access_token")
        if not access_token_str:
            return

        try:
            access_token = UUID(access_token_str)
        except ValueError:
            return

        audit = await self.repository.get_by_access_token(access_token)
        if audit is None or audit.status != TenantAuditStatus.PAYMENT_PENDING:
            return

        await self.repository.update_status(
            audit_id=audit.id,
            current_status=TenantAuditStatus.PAYMENT_PENDING,
            new_status=TenantAuditStatus.CREATED,
            extra_fields={
                "checkout_session_id": None,  # Clear expired session
            },
        )

        await self.repository.log_event(
            audit_id=audit.id,
            event_type="checkout_expired",
            event_data={
                "stripe_event_id": event.id,
                "checkout_session_id": session.get("id"),
            },
        )

        logger.info(
            "Checkout expired for tenant audit %s. Reverted to 'created'.",
            audit.id,
        )

    async def _enqueue_processing(
        self, audit_id: UUID, access_token: UUID
    ) -> None:
        """
        Enqueue the audit for background processing.

        Placeholder for Epic T2 — will call the extraction + calculation
        pipeline. For now, logs that processing should start.
        """
        raise NotImplementedError(
            "Background processing not yet implemented. "
            "See docs/stories/tenant-audit/epic-T2-overview.md"
        )
```

### Auto-Refund on Processing Failure

```python
# backend/app/services/tenant_audit/processing_callback.py
import logging
from uuid import UUID

from app.models.tenant_audit import TenantAuditStatus
from .payment import TenantAuditPaymentService
from .repository import TenantAuditRepository

logger = logging.getLogger(__name__)


async def handle_processing_failure(
    audit_id: UUID,
    access_token: UUID,
    error_message: str,
    error_code: str,
    repository: TenantAuditRepository,
    payment_service: TenantAuditPaymentService,
) -> None:
    """
    Called when audit processing fails. Records the failure and
    automatically issues a refund.

    Steps:
    1. Transition processing -> failed (with error details)
    2. Log failure event
    3. Trigger auto-refund (failed -> refunded)
    """
    # 1. Mark as failed
    await repository.update_status(
        audit_id=audit_id,
        current_status=TenantAuditStatus.PROCESSING,
        new_status=TenantAuditStatus.FAILED,
        extra_fields={
            "error_message": error_message,
            "error_code": error_code,
            "failed_at": "now()",
        },
    )

    await repository.log_event(
        audit_id=audit_id,
        event_type="processing_failed",
        event_data={
            "error_message": error_message,
            "error_code": error_code,
        },
    )

    logger.error(
        "Tenant audit %s processing failed: [%s] %s. Initiating auto-refund.",
        audit_id,
        error_code,
        error_message,
    )

    # 2. Auto-refund
    try:
        refund = await payment_service.handle_refund(access_token)
        logger.info(
            "Auto-refund issued for tenant audit %s. Refund ID: %s",
            audit_id,
            refund.id,
        )
    except Exception:
        logger.exception(
            "Auto-refund FAILED for tenant audit %s. Manual intervention required.",
            audit_id,
        )
        # Log the refund failure for manual follow-up
        await repository.log_event(
            audit_id=audit_id,
            event_type="auto_refund_failed",
            event_data={"error": "See application logs for details"},
        )
```

## Test Cases
- Valid `checkout.session.completed` event transitions audit from `payment_pending` to `paid`
- `payment_intent_id` and `amount_paid_cents` are recorded from the session object
- `paid_at` timestamp is set on the audit record
- Event log records `paid` event with Stripe event ID, session ID, and amount
- Duplicate `checkout.session.completed` for an already-paid audit is skipped (idempotent)
- Missing `tenant_audit_access_token` in metadata logs error and returns 200
- Invalid UUID in `tenant_audit_access_token` logs error and returns 200
- Nonexistent audit for a valid access token logs error and returns 200
- Audit in unexpected status (e.g., `created`) logs warning and returns 200
- `checkout.session.expired` reverts audit from `payment_pending` to `created`
- `checkout.session.expired` clears the `checkout_session_id`
- Unknown event types are acknowledged (200) but not processed
- Invalid webhook signature returns 400 Bad Request
- Invalid payload returns 400 Bad Request
- `handle_processing_failure` transitions `processing` -> `failed` -> `refunded`
- Auto-refund failure logs error and creates `auto_refund_failed` event
- Webhook handler catches application exceptions and returns 200 (prevents Stripe retries)

## Definition of Done
- [ ] Webhook endpoint at `/api/v1/tenant-audits/webhooks/stripe`
- [ ] Stripe signature verification using dedicated webhook secret
- [ ] `checkout.session.completed` handler transitions to `paid` status
- [ ] Payment intent ID and amount recorded from session
- [ ] Idempotent: duplicate events do not re-process
- [ ] `checkout.session.expired` handler reverts to `created`
- [ ] Unknown event types acknowledged with 200
- [ ] Invalid signature/payload returns 400
- [ ] Application errors caught and logged (200 returned to Stripe)
- [ ] Auto-refund triggered on processing failure
- [ ] Auto-refund failure logged for manual intervention
- [ ] Event log entries created for paid, checkout_expired, processing_failed, refunded, auto_refund_failed
- [ ] Unit tests cover all event types and edge cases with mocked Stripe
- [ ] Coverage maintained at >= 95%
