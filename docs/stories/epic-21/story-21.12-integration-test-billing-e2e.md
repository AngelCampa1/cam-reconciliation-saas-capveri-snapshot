# Story 21.12: Integration Test - Billing E2E

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 3
- **Dependencies**: Stories 21.1-21.11 (All prior billing stories)
- **Status**: `pending`

## User Story
**As a** developer
**I want** comprehensive integration tests for the billing system
**So that** I can verify the complete billing workflow functions correctly

## Acceptance Criteria
- [ ] **AC1**: Test complete checkout flow (plan selection → payment → activation)
- [ ] **AC2**: Test subscription lifecycle (upgrade, downgrade, cancel, resume)
- [ ] **AC3**: Test webhook processing for all event types
- [ ] **AC4**: Test payment method management
- [ ] **AC5**: Test invoice generation and retrieval
- [ ] **AC6**: Test plan limits enforcement
- [ ] **AC7**: All tests use Stripe test mode

## Technical Specifications

**Test Configuration**:

```python
# backend/tests/conftest.py (additions for billing tests)
import pytest
import stripe
from unittest.mock import patch, MagicMock

from app.services.billing.stripe_client import StripeService, StripeSettings


@pytest.fixture
def stripe_test_settings():
    """Stripe test mode configuration."""
    return StripeSettings(
        stripe_secret_key="sk_test_mock",
        stripe_publishable_key="pk_test_mock",
        stripe_webhook_secret="whsec_test_mock",
        stripe_price_id_reconcile_annual="price_reconcile_annual_test",
        stripe_price_id_control_annual="price_control_annual_test",
        stripe_price_id_defend_annual="price_defend_annual_test",
        stripe_price_id_enterprise="price_enterprise_test",
    )


@pytest.fixture
def mock_stripe_service(stripe_test_settings):
    """Mock Stripe service for unit tests."""
    with patch('stripe.Customer') as mock_customer, \
         patch('stripe.Subscription') as mock_sub, \
         patch('stripe.checkout.Session') as mock_session, \
         patch('stripe.PaymentMethod') as mock_pm:

        mock_customer.create.return_value = MagicMock(id="cus_test123")
        mock_sub.create.return_value = MagicMock(
            id="sub_test123",
            status="active",
            current_period_start=1704067200,
            current_period_end=1706745600,
        )
        mock_session.create.return_value = MagicMock(
            id="cs_test123",
            url="https://checkout.stripe.com/test",
        )

        yield StripeService(stripe_test_settings)


@pytest.fixture
def sample_webhook_payload():
    """Factory for creating webhook event payloads."""
    def _create(event_type: str, data: dict):
        return {
            "id": f"evt_test_{event_type}",
            "type": event_type,
            "data": {"object": data},
        }
    return _create
```

**Integration Tests - Checkout Flow**:

```python
# backend/tests/integration/test_billing_checkout.py
import pytest
from httpx import AsyncClient

from app.main import app


@pytest.mark.integration
class TestCheckoutFlow:
    """Integration tests for the checkout flow."""

    async def test_checkout_creates_session(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        mock_stripe_service,
    ):
        """Verify checkout session created successfully."""
        response = await async_client.post(
            "/api/billing/checkout",
            json={
                "plan_id": "control",
                "billing_period": "annual",
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "checkout_url" in data
        assert "session_id" in data

    async def test_checkout_rejects_non_self_serve_plan(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """Verify non-self-serve plan cannot be checked out."""
        response = await async_client.post(
            "/api/billing/checkout",
            json={
                "plan_id": "free",
                "billing_period": "annual",
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "invalid" in response.json()["detail"].lower()

    async def test_checkout_rejects_invalid_plan(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """Verify invalid plan rejected."""
        response = await async_client.post(
            "/api/billing/checkout",
            json={
                "plan_id": "nonexistent",
                "billing_period": "annual",
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
            headers=auth_headers,
        )

        assert response.status_code == 400

    async def test_checkout_success_verifies_session(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        mock_stripe_service,
    ):
        """Verify success endpoint validates session ownership."""
        response = await async_client.get(
            "/api/billing/checkout/success?session_id=cs_test123",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "success"
```

**Integration Tests - Subscription Lifecycle**:

```python
# backend/tests/integration/test_billing_subscription.py
import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestSubscriptionLifecycle:
    """Integration tests for subscription lifecycle operations."""

    async def test_get_subscription_returns_current(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_subscription,
    ):
        """Verify GET /subscription returns current subscription."""
        response = await async_client.get(
            "/api/billing/subscription",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["plan"] == "control"
        assert data["status"] == "active"

    async def test_upgrade_subscription(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_subscription,
        mock_stripe_service,
    ):
        """Verify upgrade changes plan immediately with proration."""
        response = await async_client.post(
            "/api/billing/subscription/upgrade",
            json={"new_plan": "enterprise"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["plan"] == "enterprise"

    async def test_downgrade_subscription(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_subscription,
        mock_stripe_service,
    ):
        """Verify downgrade schedules for period end."""
        response = await async_client.post(
            "/api/billing/subscription/downgrade",
            json={"new_plan": "reconcile"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        # Plan change scheduled, not immediate

    async def test_cancel_subscription_at_period_end(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_subscription,
        mock_stripe_service,
    ):
        """Verify cancel sets cancel_at_period_end."""
        response = await async_client.post(
            "/api/billing/subscription/cancel",
            json={"immediate": False},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["cancel_at_period_end"] is True

    async def test_resume_canceled_subscription(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_subscription_canceling,
        mock_stripe_service,
    ):
        """Verify resume removes cancellation."""
        response = await async_client.post(
            "/api/billing/subscription/resume",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["cancel_at_period_end"] is False
```

**Integration Tests - Webhooks**:

```python
# backend/tests/integration/test_billing_webhooks.py
import pytest
import hmac
import hashlib
import time
from httpx import AsyncClient


@pytest.mark.integration
class TestStripeWebhooks:
    """Integration tests for Stripe webhook processing."""

    def _sign_webhook(self, payload: bytes, secret: str) -> str:
        """Generate Stripe webhook signature."""
        timestamp = int(time.time())
        signed_payload = f"{timestamp}.{payload.decode()}"
        signature = hmac.new(
            secret.encode(),
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        return f"t={timestamp},v1={signature}"

    async def test_webhook_rejects_invalid_signature(
        self,
        async_client: AsyncClient,
    ):
        """Verify invalid signature rejected."""
        response = await async_client.post(
            "/api/webhooks/stripe",
            content=b'{"type": "test"}',
            headers={"stripe-signature": "invalid"},
        )

        assert response.status_code == 400

    async def test_webhook_subscription_created(
        self,
        async_client: AsyncClient,
        sample_webhook_payload,
        stripe_test_settings,
        db_session,
    ):
        """Verify subscription.created updates database."""
        payload = sample_webhook_payload(
            "customer.subscription.created",
            {
                "id": "sub_new123",
                "customer": "cus_existing123",
                "status": "active",
                "current_period_start": 1704067200,
                "current_period_end": 1706745600,
                "items": {"data": [{"price": {"id": "price_control_annual_test"}}]},
                "metadata": {"organization_id": "org_test123"},
            },
        )

        import json
        payload_bytes = json.dumps(payload).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        response = await async_client.post(
            "/api/webhooks/stripe",
            content=payload_bytes,
            headers={
                "stripe-signature": signature,
                "content-type": "application/json",
            },
        )

        assert response.status_code == 200
        assert response.json()["received"] is True

        # Verify database updated
        sub = await db_session.table('subscriptions') \
            .select('*') \
            .eq('stripe_subscription_id', 'sub_new123') \
            .single() \
            .execute()

        assert sub.data is not None
        assert sub.data["status"] == "active"

    async def test_webhook_invoice_paid(
        self,
        async_client: AsyncClient,
        sample_webhook_payload,
        stripe_test_settings,
        seeded_invoice,
    ):
        """Verify invoice.paid updates invoice status."""
        payload = sample_webhook_payload(
            "invoice.paid",
            {
                "id": seeded_invoice.stripe_invoice_id,
                "amount_paid": 9900,
                "invoice_pdf": "https://stripe.com/invoice.pdf",
            },
        )

        import json
        payload_bytes = json.dumps(payload).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        response = await async_client.post(
            "/api/webhooks/stripe",
            content=payload_bytes,
            headers={
                "stripe-signature": signature,
                "content-type": "application/json",
            },
        )

        assert response.status_code == 200

    async def test_webhook_idempotency(
        self,
        async_client: AsyncClient,
        sample_webhook_payload,
        stripe_test_settings,
    ):
        """Verify same event can be processed multiple times safely."""
        payload = sample_webhook_payload(
            "customer.subscription.updated",
            {
                "id": "sub_test123",
                "customer": "cus_test123",
                "status": "active",
                "current_period_start": 1704067200,
                "current_period_end": 1706745600,
                "items": {"data": [{"price": {"id": "price_control_annual_test"}}]},
            },
        )

        import json
        payload_bytes = json.dumps(payload).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        headers = {
            "stripe-signature": signature,
            "content-type": "application/json",
        }

        # Process same event twice
        response1 = await async_client.post(
            "/api/webhooks/stripe",
            content=payload_bytes,
            headers=headers,
        )
        response2 = await async_client.post(
            "/api/webhooks/stripe",
            content=payload_bytes,
            headers=headers,
        )

        assert response1.status_code == 200
        assert response2.status_code == 200
```

**Integration Tests - Invoices**:

```python
# backend/tests/integration/test_billing_invoices.py
import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestInvoiceEndpoints:
    """Integration tests for invoice endpoints."""

    async def test_list_invoices_returns_org_invoices_only(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_invoices,
    ):
        """Verify only organization's invoices returned."""
        response = await async_client.get(
            "/api/billing/invoices",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3  # Only this org's invoices
        assert len(data["invoices"]) == 3

    async def test_list_invoices_pagination(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_many_invoices,  # 25 invoices
    ):
        """Verify pagination works correctly."""
        # First page
        response = await async_client.get(
            "/api/billing/invoices?page=1&per_page=10",
            headers=auth_headers,
        )

        data = response.json()
        assert len(data["invoices"]) == 10
        assert data["page"] == 1
        assert data["has_more"] is True

        # Third page
        response = await async_client.get(
            "/api/billing/invoices?page=3&per_page=10",
            headers=auth_headers,
        )

        data = response.json()
        assert len(data["invoices"]) == 5
        assert data["has_more"] is False

    async def test_list_invoices_status_filter(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_invoices,
    ):
        """Verify status filter works."""
        response = await async_client.get(
            "/api/billing/invoices?status=paid",
            headers=auth_headers,
        )

        data = response.json()
        for invoice in data["invoices"]:
            assert invoice["status"] == "paid"

    async def test_invoice_pdf_redirect(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        seeded_invoice_with_pdf,
    ):
        """Verify PDF endpoint redirects to Stripe URL."""
        response = await async_client.get(
            f"/api/billing/invoices/{seeded_invoice_with_pdf.id}/pdf",
            headers=auth_headers,
            follow_redirects=False,
        )

        assert response.status_code == 307  # Redirect
        assert "stripe.com" in response.headers["location"]
```

**Frontend E2E Tests**:

```typescript
// frontend/src/__tests__/e2e/billing.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Billing Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user
    await page.goto('/login')
    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'testpassword')
    await page.click('button[type="submit"]')
    await page.waitForURL('/dashboard')
  })

  test('pricing page displays all plans', async ({ page }) => {
    await page.goto('/pricing')

    await expect(page.getByText('Reconcile')).toBeVisible()
    await expect(page.getByText('Control')).toBeVisible()
    await expect(page.getByText('Defend')).toBeVisible()
    await expect(page.getByText('Enterprise')).toBeVisible()
  })

  test('pricing is annual only', async ({ page }) => {
    await page.goto('/pricing')

    await expect(page.getByText('$4,990/year')).toBeVisible()
    await expect(page.getByText('$4,990/year')).toBeVisible()
    await expect(page.getByText('$4,990/year')).toBeVisible()
    await expect(page.getByText(/monthly/i)).not.toBeVisible()
  })

  test('checkout redirects to Stripe', async ({ page }) => {
    await page.goto('/checkout?plan=reconcile&units=25')

    await page.click('text=Continue to Payment')

    // Should redirect to Stripe (in test mode)
    await page.waitForURL(/checkout\.stripe\.com/)
  })

  test('billing dashboard shows subscription details', async ({ page }) => {
    await page.goto('/settings/billing')

    await expect(page.getByText('Current Plan')).toBeVisible()
    await expect(page.getByText('Payment Method')).toBeVisible()
    await expect(page.getByText('Usage This Period')).toBeVisible()
  })

  test('invoices page lists billing history', async ({ page }) => {
    await page.goto('/settings/billing/invoices')

    await expect(page.getByText('Invoices')).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
  })
})
```

## Test Fixtures

```python
# backend/tests/fixtures/billing.py
import pytest
from datetime import datetime, timedelta
from decimal import Decimal


@pytest.fixture
async def seeded_subscription(db_session, test_organization):
    """Seed a control subscription."""
    result = await db_session.table('subscriptions').insert({
        'organization_id': str(test_organization.id),
        'stripe_subscription_id': 'sub_test123',
        'stripe_customer_id': 'cus_test123',
        'plan': 'control',
        'status': 'active',
        'current_period_start': datetime.utcnow().isoformat(),
        'current_period_end': (datetime.utcnow() + timedelta(days=30)).isoformat(),
        'cancel_at_period_end': False,
    }).execute()
    return result.data[0]


@pytest.fixture
async def seeded_subscription_canceling(db_session, test_organization):
    """Seed a subscription scheduled for cancellation."""
    result = await db_session.table('subscriptions').insert({
        'organization_id': str(test_organization.id),
        'stripe_subscription_id': 'sub_cancel123',
        'stripe_customer_id': 'cus_test123',
        'plan': 'control',
        'status': 'active',
        'current_period_start': datetime.utcnow().isoformat(),
        'current_period_end': (datetime.utcnow() + timedelta(days=30)).isoformat(),
        'cancel_at_period_end': True,
    }).execute()
    return result.data[0]


@pytest.fixture
async def seeded_invoices(db_session, test_organization, seeded_subscription):
    """Seed multiple invoices."""
    invoices = []
    for i, status in enumerate(['paid', 'paid', 'open']):
        result = await db_session.table('invoices').insert({
            'organization_id': str(test_organization.id),
            'subscription_id': seeded_subscription['id'],
            'stripe_invoice_id': f'in_test{i}',
            'amount_due': 99.00,
            'amount_paid': 99.00 if status == 'paid' else 0,
            'currency': 'usd',
            'status': status,
            'period_start': datetime.utcnow().isoformat(),
            'period_end': (datetime.utcnow() + timedelta(days=30)).isoformat(),
        }).execute()
        invoices.append(result.data[0])
    return invoices
```

## Definition of Done
- [ ] All checkout flow tests pass
- [ ] All subscription lifecycle tests pass
- [ ] All webhook tests pass (with signature verification)
- [ ] All invoice tests pass
- [ ] Frontend E2E tests pass
- [ ] Tests use Stripe test mode
- [ ] Webhook idempotency verified
- [ ] 95%+ code coverage for billing module
