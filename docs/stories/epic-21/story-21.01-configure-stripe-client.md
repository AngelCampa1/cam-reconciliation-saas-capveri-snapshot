# Story 21.1: Configure Stripe Client

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 2
- **Dependencies**: Epic 4 (Backend Foundation)
- **Status**: `pending`

## User Story
**As a** developer
**I want** a configured Stripe client available in the backend
**So that** I can interact with Stripe APIs for billing operations

## Acceptance Criteria
- [ ] **AC1**: Stripe Python SDK installed and configured
- [ ] **AC2**: Environment variables for Stripe keys documented
- [ ] **AC3**: Async-compatible Stripe client wrapper created
- [ ] **AC4**: Test mode vs live mode toggle based on environment
- [ ] **AC5**: Stripe client available as FastAPI dependency

## Technical Specifications

**Files to Create**:
```
backend/app/services/billing/
├── __init__.py
├── stripe_client.py
└── config.py
```

**backend/app/services/billing/config.py**:
```python
"""
Stripe billing configuration.
"""
from pydantic_settings import BaseSettings


class StripeSettings(BaseSettings):
    """Stripe configuration from environment."""
    stripe_secret_key: str
    stripe_publishable_key: str
    stripe_webhook_secret: str
    stripe_price_id_reconcile_annual: str = ""
    stripe_price_id_control_annual: str = ""
    stripe_price_id_defend_annual: str = ""
    stripe_price_id_enterprise: str = ""

    @property
    def is_test_mode(self) -> bool:
        """Check if using Stripe test mode."""
        return self.stripe_secret_key.startswith("sk_test_")

    class Config:
        env_file = ".env"


stripe_settings = StripeSettings()
```

**backend/app/services/billing/stripe_client.py**:
```python
"""
Stripe client wrapper with async support.
"""
import stripe
from functools import lru_cache

from .config import stripe_settings


@lru_cache()
def get_stripe_client() -> stripe:
    """
    Get configured Stripe client.

    Returns cached client instance configured with API key.

    API Version Notes:
    - 2024-12-18.acacia is the current stable version (as of Dec 2024)
    - Check https://docs.stripe.com/changelog for latest versions
    - Older version 2023-10-16 is still supported but lacks newer features
    """
    stripe.api_key = stripe_settings.stripe_secret_key
    stripe.api_version = "2024-12-18.acacia"  # Current stable API version
    return stripe


class StripeService:
    """
    Async-friendly Stripe service wrapper.

    Wraps synchronous Stripe SDK calls for use in async contexts.
    Consider using stripe-python's async support when available.
    """

    def __init__(self):
        self.stripe = get_stripe_client()

    async def create_customer(
        self,
        email: str,
        name: str | None = None,
        metadata: dict | None = None,
    ) -> stripe.Customer:
        """Create a new Stripe customer."""
        return self.stripe.Customer.create(
            email=email,
            name=name,
            metadata=metadata or {},
        )

    async def get_customer(self, customer_id: str) -> stripe.Customer:
        """Retrieve a Stripe customer."""
        return self.stripe.Customer.retrieve(customer_id)

    async def create_checkout_session(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        trial_period_days: int | None = 14,
    ) -> stripe.checkout.Session:
        """Create a Stripe Checkout session."""
        params = {
            "customer": customer_id,
            "line_items": [{"price": price_id, "quantity": 1}],
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
        }

        if trial_period_days:
            params["subscription_data"] = {
                "trial_period_days": trial_period_days
            }

        return self.stripe.checkout.Session.create(**params)

    async def create_billing_portal_session(
        self,
        customer_id: str,
        return_url: str,
    ) -> stripe.billing_portal.Session:
        """Create a Stripe Billing Portal session."""
        return self.stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )

    def verify_webhook_signature(
        self,
        payload: bytes,
        sig_header: str,
    ) -> stripe.Event:
        """
        Verify webhook signature and parse event.

        Raises stripe.error.SignatureVerificationError if invalid.
        """
        return self.stripe.Webhook.construct_event(
            payload,
            sig_header,
            stripe_settings.stripe_webhook_secret,
        )
```

**FastAPI Dependency**:
```python
# backend/app/api/deps.py
from app.services.billing.stripe_client import StripeService


def get_stripe_service() -> StripeService:
    """FastAPI dependency for Stripe service."""
    return StripeService()
```

**Environment Variables** (.env.example):
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (from Stripe Dashboard)
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_...
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_...
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...
```

## Test Cases

```python
# backend/tests/test_stripe_client.py
import pytest
from unittest.mock import patch, MagicMock

from app.services.billing.stripe_client import StripeService


def test_stripe_client_uses_secret_key():
    """Verify Stripe client is configured with secret key."""
    with patch('app.services.billing.stripe_client.stripe_settings') as mock:
        mock.stripe_secret_key = "sk_test_example"
        service = StripeService()
        assert service.stripe.api_key == "sk_test_example"


def test_is_test_mode_detection():
    """Verify test mode detection works."""
    from app.services.billing.config import StripeSettings

    test_settings = StripeSettings(
        stripe_secret_key="sk_test_123",
        stripe_publishable_key="pk_test_123",
        stripe_webhook_secret="whsec_123",
    )
    assert test_settings.is_test_mode is True

    live_settings = StripeSettings(
        stripe_secret_key="sk_live_123",
        stripe_publishable_key="pk_live_123",
        stripe_webhook_secret="whsec_123",
    )
    assert live_settings.is_test_mode is False
```

## Definition of Done
- [ ] Stripe SDK installed in requirements
- [ ] Configuration loads from environment
- [ ] Test mode detection works
- [ ] StripeService available as dependency
- [ ] Webhook signature verification works
- [ ] Unit tests pass
