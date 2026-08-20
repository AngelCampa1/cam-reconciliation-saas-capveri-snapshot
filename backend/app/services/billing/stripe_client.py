"""
Stripe client wrapper with async support.
"""

from functools import lru_cache
from typing import Any

import pybreaker
import stripe

from app.core.circuit_breakers import get_stripe_breaker
from app.exceptions import ServiceUnavailableError

from .config import APP_IDENTIFIER, get_stripe_settings


@lru_cache
def get_stripe_client() -> Any:
    """
    Get configured Stripe client.

    Configures global Stripe client with API key.
    """
    settings = get_stripe_settings()
    stripe.api_key = settings.stripe_secret_key
    stripe.api_version = "2023-10-16"  # Pin API version
    return stripe


class StripeService:
    """
    Async-friendly Stripe service wrapper.

    Wraps synchronous Stripe SDK calls for use in async contexts.
    Consider using stripe-python's async support when available.
    """

    def __init__(self) -> None:
        get_stripe_client()  # Ensure Stripe is configured

    async def create_customer(
        self,
        email: str,
        name: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> stripe.Customer:
        """Create a new Stripe customer."""
        try:
            result: Any = get_stripe_breaker().call(
                lambda: stripe.Customer.create(
                    email=email,
                    name=name or "",
                    metadata=metadata or {},
                )
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e
        return result  # type: ignore[no-any-return]

    async def get_customer(self, customer_id: str) -> stripe.Customer:
        """Retrieve a Stripe customer."""
        try:
            result: Any = get_stripe_breaker().call(
                lambda: stripe.Customer.retrieve(customer_id)
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e
        return result  # type: ignore[no-any-return]

    async def create_checkout_session(
        self,
        customer_id: str,
        success_url: str,
        cancel_url: str,
        price_id: str | None = None,
        line_items: list[dict[str, Any]] | None = None,
        quantity: int = 1,
        metadata: dict[str, str] | None = None,
        trial_days: int = 0,
        coupon_id: str | None = None,
    ) -> stripe.checkout.Session:
        """Create a Stripe Checkout session for subscription pricing."""
        if not price_id and not line_items:
            raise ValueError("Either price_id or line_items must be provided")

        resolved_line_items = (
            line_items
            if line_items is not None
            else [{"price": price_id, "quantity": quantity}]
        )
        params: dict[str, Any] = {
            "customer": customer_id,
            "payment_method_types": ["card"],
            "payment_method_collection": "if_required",
            "line_items": resolved_line_items,
            "mode": "subscription",
            "success_url": f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": cancel_url,
            "metadata": {**(metadata or {}), "app": APP_IDENTIFIER},
            "subscription_data": {
                "metadata": {**(metadata or {}), "app": APP_IDENTIFIER},
            },
        }

        if trial_days > 0:
            params["subscription_data"]["trial_period_days"] = trial_days
            params["subscription_data"]["trial_settings"] = {
                "end_behavior": {
                    "missing_payment_method": "pause",
                }
            }
        if coupon_id:
            params["discounts"] = [{"coupon": coupon_id}]
        else:
            params["allow_promotion_codes"] = True

        try:
            result: Any = get_stripe_breaker().call(
                lambda: stripe.checkout.Session.create(**params)
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e
        return result  # type: ignore[no-any-return]

    async def create_billing_portal_session(
        self,
        customer_id: str,
        return_url: str,
    ) -> stripe.billing_portal.Session:
        """Create a Stripe Billing Portal session."""
        try:
            result: Any = get_stripe_breaker().call(
                lambda: stripe.billing_portal.Session.create(
                    customer=customer_id,
                    return_url=return_url,
                )
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e
        return result  # type: ignore[no-any-return]

    async def retrieve_invoice(self, invoice_id: str) -> stripe.Invoice:
        """Retrieve a Stripe Invoice."""
        try:
            result: Any = get_stripe_breaker().call(
                lambda: stripe.Invoice.retrieve(invoice_id)
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e
        return result  # type: ignore[no-any-return]

    async def create_refund(self, payment_intent_id: str) -> stripe.Refund:
        """Create a full refund for the given payment intent."""
        try:
            result: Any = get_stripe_breaker().call(
                lambda: stripe.Refund.create(payment_intent=payment_intent_id)
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e
        return result  # type: ignore[no-any-return]

    async def cancel_subscription_now(
        self,
        subscription_id: str,
        prorate: bool = False,
        invoice_now: bool = False,
    ) -> stripe.Subscription:
        """Cancel a Stripe subscription immediately."""
        try:
            result: Any = get_stripe_breaker().call(
                lambda: stripe.Subscription.cancel(
                    subscription_id,
                    prorate=prorate,
                    invoice_now=invoice_now,
                )
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e
        return result  # type: ignore[no-any-return]

    async def create_subscription_checkout_session(
        self,
        customer_id: str,
        price_id: str,
        trial_days: int,
        success_url: str,
        cancel_url: str,
        organization_id: str,
        metadata: dict[str, str] | None = None,
    ) -> stripe.checkout.Session:
        """Create a Stripe Checkout session for a subscription with trial."""
        meta = {
            "billing_model": "subscription",
            "organization_id": organization_id,
            **(metadata or {}),
        }
        return await self.create_checkout_session(
            customer_id=customer_id,
            price_id=price_id,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=meta,
            trial_days=trial_days,
        )

    async def create_credit_pack_checkout_session(
        self,
        customer_id: str,
        quantity: int,
        unit_price_cents: int,
        success_url: str,
        cancel_url: str,
        organization_id: str,
        metadata: dict[str, str] | None = None,
    ) -> stripe.checkout.Session:
        """Create a one-time Stripe Checkout session for an audit credit pack.

        Uses ``mode: "payment"`` (not subscription) so credits are paid once.
        The unit_price_cents is passed as a custom amount via price_data.
        """
        meta = {
            "billing_model": "credit_pack",
            "organization_id": organization_id,
            "quantity": str(quantity),
            **(metadata or {}),
            "app": APP_IDENTIFIER,
        }
        params: dict[str, Any] = {
            "customer": customer_id,
            "payment_method_types": ["card"],
            "line_items": [
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": unit_price_cents,
                        "product_data": {
                            "name": f"CapVeri Credits ({quantity} audit{'s' if quantity != 1 else ''})",  # noqa: E501
                            "description": "Prepaid audit credits — never expire",
                        },
                    },
                    "quantity": quantity,
                }
            ],
            "mode": "payment",
            "success_url": f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": cancel_url,
            "metadata": meta,
            "payment_intent_data": {"metadata": meta},
            "allow_promotion_codes": True,
        }

        try:
            result: Any = get_stripe_breaker().call(
                lambda: stripe.checkout.Session.create(**params)
            )
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Stripe", original_error=e, retry_after=60
            ) from e
        return result  # type: ignore[no-any-return]

    def verify_webhook_signature(
        self,
        payload: bytes,
        sig_header: str,
    ) -> stripe.Event:
        """
        Verify webhook signature and parse event.

        Raises stripe.error.SignatureVerificationError if invalid.
        """
        settings = get_stripe_settings()
        result: Any = stripe.Webhook.construct_event(  # type: ignore[no-untyped-call]
            payload,
            sig_header,
            settings.stripe_webhook_secret,
        )
        return result  # type: ignore[no-any-return]
