"""
30-day money-back guarantee service.

Handles eligibility checks and refund claims for first-time subscribers
within 30 days of their first paid invoice.
"""

import logging
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

import stripe
from fastapi import HTTPException, status
from pydantic import BaseModel

from app.database.client import SupabaseDB
from app.models.subscription import BillingSubscriptionStatus
from app.services.billing.stripe_client import StripeService

logger = logging.getLogger(__name__)

GUARANTEE_WINDOW_DAYS = 30


class GuaranteeEligibility(BaseModel):
    """Result of an eligibility check for the money-back guarantee."""

    eligible: bool
    days_remaining: int
    first_invoice_amount: Decimal | None
    first_invoice_currency: str


class GuaranteeService:
    """Manages the 30-day money-back guarantee lifecycle."""

    def __init__(self, stripe_service: StripeService, db: SupabaseDB) -> None:
        self.stripe = stripe_service
        self.db = db

    async def check_eligibility(self, org_id: UUID) -> GuaranteeEligibility:
        """
        Check whether the organization is eligible to claim the guarantee.

        Eligibility rules:
        - Must have at least one paid invoice
        - First paid invoice must have been paid within the last 30 days
        - Guarantee must not have already been claimed
        """
        # 1. Find the first paid invoice
        invoice_result = (
            self.db.table("invoices")
            .select("id, stripe_invoice_id, amount_paid, currency, paid_at")
            .eq("organization_id", str(org_id))
            .eq("status", "paid")
            .order("paid_at", desc=False)
            .limit(1)
            .execute()
        )

        if not invoice_result.data:
            return GuaranteeEligibility(
                eligible=False,
                days_remaining=0,
                first_invoice_amount=None,
                first_invoice_currency="usd",
            )

        first_invoice = invoice_result.data[0]
        paid_at_raw = first_invoice.get("paid_at")
        if not paid_at_raw:
            return GuaranteeEligibility(
                eligible=False,
                days_remaining=0,
                first_invoice_amount=None,
                first_invoice_currency="usd",
            )

        paid_at = datetime.fromisoformat(paid_at_raw.replace("Z", "+00:00"))
        if paid_at.tzinfo is None:
            paid_at = paid_at.replace(tzinfo=UTC)

        now = datetime.now(UTC)
        days_since = (now - paid_at).days

        # 2. Check time window
        if days_since >= GUARANTEE_WINDOW_DAYS:
            return GuaranteeEligibility(
                eligible=False,
                days_remaining=0,
                first_invoice_amount=None,
                first_invoice_currency="usd",
            )

        # 3. Check whether already claimed
        sub_result = (
            self.db.table("subscriptions")
            .select("money_back_claimed_at")
            .eq("organization_id", str(org_id))
            .maybe_single()
            .execute()
        )

        if (
            sub_result
            and sub_result.data
            and sub_result.data.get("money_back_claimed_at")
        ):
            return GuaranteeEligibility(
                eligible=False,
                days_remaining=0,
                first_invoice_amount=None,
                first_invoice_currency="usd",
            )

        amount_paid = first_invoice.get("amount_paid") or 0
        currency = first_invoice.get("currency") or "usd"

        return GuaranteeEligibility(
            eligible=True,
            days_remaining=GUARANTEE_WINDOW_DAYS - days_since,
            first_invoice_amount=Decimal(str(amount_paid)),
            first_invoice_currency=currency,
        )

    async def claim_refund(self, org_id: UUID) -> stripe.Refund:
        """
        Process the money-back guarantee claim.

        Steps:
        1. Verify eligibility (raises 409 if not eligible)
        2. Retrieve first paid invoice from DB
        3. Look up Stripe payment intent from the invoice
        4. Issue a full refund via Stripe
        5. Record the claim in DB (before cancelling — prevents double-refund)
        6. Cancel subscription immediately with prorate=False, invoice_now=False
        7. Update subscription status to canceled in DB
        """
        eligibility = await self.check_eligibility(org_id)
        if not eligibility.eligible:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Not eligible for money-back guarantee",
            )

        # Fetch first paid invoice
        invoice_result = (
            self.db.table("invoices")
            .select("id, stripe_invoice_id, amount_paid")
            .eq("organization_id", str(org_id))
            .eq("status", "paid")
            .order("paid_at", desc=False)
            .limit(1)
            .execute()
        )

        if not invoice_result.data:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="No paid invoice found — cannot process refund",
            )

        first_invoice = invoice_result.data[0]
        stripe_invoice_id = first_invoice.get("stripe_invoice_id")

        if not stripe_invoice_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invoice has no Stripe reference — cannot process refund",
            )

        # Retrieve Stripe invoice to get the payment intent
        stripe_invoice = cast(
            Any, await self.stripe.retrieve_invoice(stripe_invoice_id)
        )
        payment_intent_id = stripe_invoice.get("payment_intent")

        if not payment_intent_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Stripe invoice has no payment intent — cannot process refund",
            )

        # Issue full refund (no amount param = full charge)
        refund = await self.stripe.create_refund(payment_intent_id)

        now_iso = datetime.now(UTC).isoformat()

        # Record the claim BEFORE cancelling to prevent double-refund on crash
        self.db.table("subscriptions").update(
            {
                "money_back_claimed_at": now_iso,
                "money_back_refund_id": refund.id,
            }
        ).eq("organization_id", str(org_id)).execute()

        # Fetch subscription to get Stripe subscription ID
        sub_result = (
            self.db.table("subscriptions")
            .select("stripe_subscription_id")
            .eq("organization_id", str(org_id))
            .maybe_single()
            .execute()
        )

        stripe_sub_id = (
            sub_result.data.get("stripe_subscription_id")
            if sub_result and sub_result.data
            else None
        )

        if stripe_sub_id:
            # Cancel with prorate=False, invoice_now=False to prevent double-refund.
            # Do NOT use SubscriptionService.cancel_subscription(at_period_end=False)
            # because that calls stripe.Subscription.delete() which generates a
            # prorated credit that can trigger a second automatic refund.
            await self.stripe.cancel_subscription_now(
                stripe_sub_id,
                prorate=False,
                invoice_now=False,
            )

            # Update subscription status in DB
            self.db.table("subscriptions").update(
                {
                    "status": BillingSubscriptionStatus.CANCELED.value,
                    "cancel_at_period_end": False,
                    "updated_at": now_iso,
                }
            ).eq("organization_id", str(org_id)).execute()

        logger.info(
            "Money-back guarantee claimed for org %s, refund %s",
            org_id,
            refund.id,
        )

        return refund
