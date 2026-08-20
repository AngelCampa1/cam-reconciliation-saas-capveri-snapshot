"""
Payment method management service.
"""

import logging
from typing import Any, cast

import stripe

from app.database.client import SupabaseDB
from app.services.billing.stripe_client import StripeService

logger = logging.getLogger(__name__)


class PaymentMethodService:
    """Manages customer payment methods."""

    def __init__(self, stripe_service: StripeService, db: SupabaseDB):
        self.stripe = stripe_service
        self.db = db

    async def list_payment_methods(
        self,
        customer_id: str,
    ) -> list[dict[str, Any]]:
        """List all payment methods for a customer."""
        methods = cast(
            Any,
            stripe.PaymentMethod.list(
                customer=customer_id,
                type="card",
            ),
        )

        default_pm = self._get_default_payment_method(customer_id)

        result = []
        for pm in methods.data:
            if pm.card:
                result.append(
                    {
                        "id": pm.id,
                        "brand": pm.card.brand,
                        "last4": pm.card.last4,
                        "exp_month": pm.card.exp_month,
                        "exp_year": pm.card.exp_year,
                        "is_default": pm.id == default_pm,
                    }
                )
        return result

    async def create_setup_intent(
        self,
        customer_id: str,
    ) -> str:
        """
        Create a SetupIntent for adding a new payment method.

        Returns client_secret for Stripe Elements.
        """
        setup_intent = cast(
            Any,
            stripe.SetupIntent.create(
                customer=customer_id,
                payment_method_types=["card"],
            ),
        )
        client_secret = setup_intent.client_secret
        if not client_secret:
            raise ValueError("Failed to create setup intent")
        return str(client_secret)

    async def set_default_payment_method(
        self,
        customer_id: str,
        payment_method_id: str,
    ) -> None:
        """Set the default payment method for a customer."""
        self._ensure_payment_method_belongs_to_customer(customer_id, payment_method_id)
        stripe.Customer.modify(
            customer_id,
            invoice_settings={
                "default_payment_method": payment_method_id,
            },
        )

    async def remove_payment_method(
        self,
        customer_id: str,
        payment_method_id: str,
    ) -> None:
        """
        Remove a payment method.

        Raises error if it's the only payment method.
        """
        self._ensure_payment_method_belongs_to_customer(customer_id, payment_method_id)
        methods = await self.list_payment_methods(customer_id)

        if len(methods) <= 1:
            raise ValueError("Cannot remove the only payment method")

        stripe.PaymentMethod.detach(payment_method_id)

    async def create_portal_session(
        self,
        customer_id: str,
        return_url: str,
    ) -> str:
        """
        Create Stripe Customer Portal session.

        Returns URL to redirect user to.
        """
        session = await self.stripe.create_billing_portal_session(
            customer_id=customer_id,
            return_url=return_url,
        )
        return session.url

    def _get_default_payment_method(self, customer_id: str) -> str | None:
        """Get the default payment method ID."""
        customer = cast(Any, stripe.Customer.retrieve(customer_id))
        if not customer.invoice_settings:
            return None
        pm = customer.invoice_settings.default_payment_method
        return str(pm) if pm else None

    def _ensure_payment_method_belongs_to_customer(
        self,
        customer_id: str,
        payment_method_id: str,
    ) -> None:
        """Reject payment method mutations outside the current Stripe customer."""
        payment_method = cast(Any, stripe.PaymentMethod.retrieve(payment_method_id))
        payment_method_customer = getattr(payment_method, "customer", None)
        payment_method_customer_id = (
            payment_method_customer
            if isinstance(payment_method_customer, str)
            else getattr(payment_method_customer, "id", None)
        )
        if payment_method_customer_id != customer_id:
            raise ValueError("Payment method not found for customer")
