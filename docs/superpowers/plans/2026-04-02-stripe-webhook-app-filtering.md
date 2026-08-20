# Stripe Webhook App Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Stripe webhooks from one app (e.g. CAMAudit) from being processed by another app's backend (e.g. CapVeri) when all apps share a single Stripe account.

**Architecture:** Add an `app` key to Stripe metadata on all checkout sessions and subscriptions at creation time. In the webhook handler, check `metadata.app` early and return 200 (skip silently) if the event belongs to a different app. Also fix the `to_dict()` -> `to_dict_recursive()` bug that causes crashes on Stripe SDK v10+.

**Tech Stack:** Python / FastAPI / Stripe SDK v10+ / pytest

**Scope:** This plan covers CapVeri's codebase only (this repo). The same pattern must be replicated in Lextract, GeoLeap, SkillLedger, GatherGrove, and CAMAudit-v2 — but those are separate repos and separate tasks.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/services/billing/config.py` | Modify | Add `APP_IDENTIFIER = "capveri"` constant |
| `backend/app/services/billing/stripe_client.py` | Modify | Inject `app` into metadata on all Stripe object creation |
| `backend/app/services/billing/subscriptions.py` | Modify | Add `app` to subscription metadata |
| `backend/app/services/billing/customers.py` | Verify | Already has `"source": "capveri"` — no change needed |
| `backend/app/api/routes/webhooks.py` | Modify | (1) Fix `to_dict()` -> `to_dict_recursive()`, (2) Add app filter gate before dispatch |
| `backend/tests/unit/billing/test_webhook_app_filter.py` | Create | Tests for the app filtering logic |
| `backend/tests/test_stripe_client.py` | Modify | Verify `app` metadata is set on checkout sessions |
| `backend/tests/unit/billing/test_credit_endpoints.py` | Modify | Add `app` key to test session metadata |

---

### Task 1: Fix `to_dict()` -> `to_dict_recursive()` bug

**Files:**
- Modify: `backend/app/api/routes/webhooks.py:90-96`

- [ ] **Step 1: Write failing test**

In `backend/tests/test_webhooks.py`, add a test that exercises the StripeObject conversion path:

```python
class TestStripeObjectConversion:
    """Verify Stripe SDK objects are recursively converted to dicts."""

    @pytest.mark.asyncio
    async def test_nested_stripe_objects_converted_to_dict(self, mock_db, mock_stripe_settings):
        """Webhook handler converts nested StripeObject to plain dicts."""
        from unittest.mock import AsyncMock, MagicMock, patch
        from app.api.routes.webhooks import handle_stripe_webhook

        # Create a mock StripeObject with nested .get() that would fail
        # if not recursively converted
        mock_session = MagicMock()
        mock_session.to_dict_recursive.return_value = {
            "id": "cs_test_123",
            "mode": "subscription",
            "metadata": {"app": "capveri", "organization_id": "org-1"},
        }
        mock_session.to_dict.return_value = mock_session  # shallow — would fail

        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.id = "evt_test_recursive"
        mock_event.data.object = mock_session

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch("app.api.routes.webhooks._claim_webhook_event", new_callable=AsyncMock, return_value=True),
            patch("app.api.routes.webhooks._complete_webhook_event", new_callable=AsyncMock),
            patch("app.api.routes.webhooks.handle_checkout_session_completed", new_callable=AsyncMock) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b'{"type": "checkout.session.completed"}')
            request.headers = {"stripe-signature": "t=123,v1=abc"}

            await handle_stripe_webhook(request, mock_db)

            # Handler should receive the recursively-converted dict
            call_args = mock_handler.call_args[0][0]
            assert isinstance(call_args, dict)
            assert call_args["metadata"]["app"] == "capveri"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_webhooks.py::TestStripeObjectConversion -v`
Expected: FAIL — `to_dict_recursive` is not called yet, mock falls through to shallow conversion

- [ ] **Step 3: Fix the conversion**

In `backend/app/api/routes/webhooks.py`, change lines 90-96:

```python
        # Stripe SDK >= 5.x returns StripeObject instead of dict;
        # convert to plain dict so handlers can use .get() safely.
        event_obj = event.data.object
        event_data = cast(
            dict[str, Any],
            event_obj.to_dict_recursive()
            if hasattr(event_obj, "to_dict_recursive")
            else event_obj,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_webhooks.py::TestStripeObjectConversion -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/api/routes/webhooks.py tests/test_webhooks.py
git commit -m "fix(webhooks): use to_dict_recursive() for Stripe SDK v10+ objects

Fixes CAPVERI-BACKEND-P — shallow to_dict() left nested StripeObjects
unconverted, causing AttributeError on .get() calls."
```

---

### Task 2: Add `APP_IDENTIFIER` constant and inject `app` metadata

**Files:**
- Modify: `backend/app/services/billing/config.py`
- Modify: `backend/app/services/billing/stripe_client.py:74-113` (create_checkout_session — base method, covers subscription checkout via delegation)
- Modify: `backend/app/services/billing/stripe_client.py:204-257` (create_credit_pack_checkout_session — builds its own params)
- Modify: `backend/app/services/billing/subscriptions.py:72-84` (Subscription.create)
- Modify: `backend/app/services/billing/subscriptions.py` (all Subscription.modify calls — retroactively inject `app` on modify so legacy subscriptions get tagged)
- Modify: `backend/app/services/billing/save_offers.py` (Subscription.modify for coupon application)
- Test: `backend/tests/test_stripe_client.py`

> **Note:** Do NOT add `app` to `create_subscription_checkout_session`'s `meta` dict — it delegates to `create_checkout_session` which already injects it. Adding it in both places would be redundant.

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_stripe_client.py`:

```python
class TestAppMetadataInjection:
    """All Stripe objects must include app identifier in metadata."""

    @pytest.mark.asyncio
    async def test_checkout_session_includes_app_metadata(self, service):
        """create_checkout_session injects app='capveri' into metadata."""
        with patch("stripe.checkout.Session.create") as mock_create:
            mock_create.return_value = MagicMock(id="cs_test")
            await service.create_checkout_session(
                customer_id="cus_test",
                price_id="price_test",
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel",
            )
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["metadata"]["app"] == "capveri"
            assert call_kwargs["subscription_data"]["metadata"]["app"] == "capveri"

    @pytest.mark.asyncio
    async def test_credit_pack_checkout_includes_app_metadata(self, service):
        """create_credit_pack_checkout_session injects app='capveri'."""
        with patch("stripe.checkout.Session.create") as mock_create:
            mock_create.return_value = MagicMock(id="cs_test")
            await service.create_credit_pack_checkout_session(
                customer_id="cus_test",
                quantity=5,
                unit_price_cents=9900,
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel",
                organization_id="org-123",
            )
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["metadata"]["app"] == "capveri"
            assert call_kwargs["payment_intent_data"]["metadata"]["app"] == "capveri"
```

Add to `backend/tests/test_webhooks.py` (or a new `backend/tests/unit/billing/test_subscription_create.py` if appropriate):

```python
def test_subscription_create_includes_app_metadata():
    """stripe.Subscription.create is called with app='capveri' in metadata."""
    with patch("stripe.Subscription.create") as mock_create:
        mock_create.return_value = MagicMock(
            id="sub_test", trial_start=1700000000, trial_end=1701000000
        )
        # Call the subscription creation function
        # (adjust import/call as needed based on actual function signature)
        from app.services.billing.subscriptions import SubscriptionService
        # ... invoke create and assert metadata contains app="capveri"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_stripe_client.py::TestAppMetadataInjection -v`
Expected: FAIL — `app` key not in metadata yet

- [ ] **Step 3: Add APP_IDENTIFIER constant**

In `backend/app/services/billing/config.py`, add after imports:

```python
# Identifies this app in shared Stripe webhook events.
# Each app in the Ventora Labs Stripe account uses a unique identifier
# so webhook handlers can ignore events from other apps.
APP_IDENTIFIER = "capveri"
```

- [ ] **Step 4: Inject `app` into all checkout session metadata**

In `backend/app/services/billing/stripe_client.py`:

Add import at top:
```python
from app.services.billing.config import APP_IDENTIFIER
```

In `create_checkout_session` (line ~86), add `app` to params metadata:
```python
        params: dict[str, Any] = {
            "customer": customer_id,
            "payment_method_types": ["card"],
            "line_items": [{"price": price_id, "quantity": quantity}],
            "mode": "subscription",
            "success_url": f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": cancel_url,
            "metadata": {"app": APP_IDENTIFIER, **(metadata or {})},
            "allow_promotion_codes": True,
            "subscription_data": {
                "metadata": {"app": APP_IDENTIFIER, **(metadata or {})},
            },
        }
```

Do NOT modify `create_subscription_checkout_session` — it delegates to `create_checkout_session` which already injects `app`.

In `create_credit_pack_checkout_session` (line ~219), add to meta dict:
```python
        meta = {
            "app": APP_IDENTIFIER,
            "billing_model": "credit_pack",
            "organization_id": organization_id,
            "quantity": str(quantity),
            **(metadata or {}),
        }
```

- [ ] **Step 5: Inject `app` into direct subscription creation**

In `backend/app/services/billing/subscriptions.py`, add import:
```python
from app.services.billing.config import APP_IDENTIFIER
```

Update the `stripe.Subscription.create` call (line ~80):
```python
            metadata={
                "app": APP_IDENTIFIER,
                "organization_id": str(organization_id),
                "tier": tier_id,
            },
```

- [ ] **Step 6: Inject `app` into all Subscription.modify calls**

Add `metadata={"app": APP_IDENTIFIER}` to each of these calls (Stripe metadata merge preserves existing keys like `organization_id` and `tier`):

| File | Function | Stripe call | Accepts metadata? |
|------|----------|-------------|-------------------|
| `subscriptions.py:~144` | `upgrade_subscription` | `Subscription.modify` | Yes — add |
| `subscriptions.py:~189` | `downgrade_subscription` | `Subscription.modify` | Yes — add |
| `subscriptions.py:~222` | `cancel_subscription` (at period end) | `Subscription.modify` | Yes — add |
| `subscriptions.py:~259` | `resume_subscription` | `Subscription.modify` | Yes — add |
| `save_offers.py:~132` | `accept_offer` | `Subscription.modify` | Yes — add |
| `subscriptions.py:~232` | `cancel_subscription` (immediate) | `Subscription.delete` | **No** — skip |
| `stripe_client.py:~167` | guarantee flow | `Subscription.cancel` | **No** — skip |

The last two cannot accept metadata params. For those paths, backward-compat ("no app = process it") covers legacy subscriptions, and post-deploy subscriptions will already have `metadata.app` from creation.

**Reviewed but no change needed:**
- `stripe_client.py:create_customer` — no `customer.*` events are handled by our webhook
- `payment_methods.py:SetupIntent.create` — no `setup_intent.*` events handled
- `payment_methods.py:Customer.modify` — not a webhook-generating operation

Example pattern for each modify call:
```python
stripe.Subscription.modify(
    stripe_sub_id,
    ...,
    metadata={"app": APP_IDENTIFIER},
)
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_stripe_client.py::TestAppMetadataInjection -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/services/billing/config.py app/services/billing/stripe_client.py app/services/billing/subscriptions.py tests/test_stripe_client.py
git commit -m "feat(billing): add app='capveri' metadata to all Stripe objects

Shared Stripe account sends webhooks to all app endpoints. Each app
now tags its Stripe objects with an app identifier so webhook handlers
can ignore events from other apps."
```

---

### Task 3: Add app filter gate in webhook handler

**Files:**
- Modify: `backend/app/api/routes/webhooks.py:87-108`
- Create: `backend/tests/unit/billing/test_webhook_app_filter.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/billing/test_webhook_app_filter.py`:

```python
"""Tests for webhook app filtering — ignore events from other apps."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.billing.config import APP_IDENTIFIER


class TestWebhookAppFilter:
    """Webhook handler skips events that belong to a different app."""

    @pytest.mark.asyncio
    async def test_skips_event_from_other_app(self, mock_db, mock_stripe_settings):
        """Events with metadata.app != 'capveri' are skipped with 200."""
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_session = MagicMock()
        mock_session.to_dict_recursive.return_value = {
            "id": "cs_other",
            "mode": "payment",
            "metadata": {"app": "camaudit", "organization_id": "org-other"},
        }

        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.id = "evt_other_app"
        mock_event.data.object = mock_session

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch("app.api.routes.webhooks._claim_webhook_event", new_callable=AsyncMock, return_value=True),
            patch("app.api.routes.webhooks._complete_webhook_event", new_callable=AsyncMock) as mock_complete,
            patch("app.api.routes.webhooks.handle_checkout_session_completed", new_callable=AsyncMock) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b'{}')
            request.headers = {"stripe-signature": "t=123,v1=abc"}

            result = await handle_stripe_webhook(request, mock_db)

            assert result == {"received": True}
            mock_handler.assert_not_called()
            mock_complete.assert_called_once()  # Event should be marked complete, not released

    @pytest.mark.asyncio
    async def test_processes_event_from_own_app(self, mock_db, mock_stripe_settings):
        """Events with metadata.app == 'capveri' are processed normally."""
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_session = MagicMock()
        mock_session.to_dict_recursive.return_value = {
            "id": "cs_ours",
            "mode": "subscription",
            "metadata": {"app": "capveri", "organization_id": "org-ours"},
        }

        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.id = "evt_own_app"
        mock_event.data.object = mock_session

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch("app.api.routes.webhooks._claim_webhook_event", new_callable=AsyncMock, return_value=True),
            patch("app.api.routes.webhooks._complete_webhook_event", new_callable=AsyncMock),
            patch("app.api.routes.webhooks.handle_checkout_session_completed", new_callable=AsyncMock) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b'{}')
            request.headers = {"stripe-signature": "t=123,v1=abc"}

            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_processes_filterable_event_without_app_metadata(self, mock_db, mock_stripe_settings):
        """Legacy filterable events without metadata.app are processed (backward compat)."""
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_sub = MagicMock()
        mock_sub.to_dict_recursive.return_value = {
            "id": "sub_legacy",
            "metadata": {"organization_id": "org-legacy"},
            "customer": "cus_legacy",
            "status": "active",
            "items": {"data": []},
        }

        mock_event = MagicMock()
        mock_event.type = "customer.subscription.created"
        mock_event.id = "evt_legacy"
        mock_event.data.object = mock_sub

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch("app.api.routes.webhooks._claim_webhook_event", new_callable=AsyncMock, return_value=True),
            patch("app.api.routes.webhooks._complete_webhook_event", new_callable=AsyncMock),
            patch("app.api.routes.webhooks.handle_subscription_created", new_callable=AsyncMock) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b'{}')
            request.headers = {"stripe-signature": "t=123,v1=abc"}

            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_invoice_events_always_processed_regardless_of_app(self, mock_db, mock_stripe_settings):
        """Invoice events bypass app filter — they never carry metadata.app."""
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_invoice = MagicMock()
        mock_invoice.to_dict_recursive.return_value = {
            "id": "in_other_app",
            "metadata": {},  # Invoices never have app metadata
            "subscription": "sub_other",
            "customer": "cus_other",
            "status": "paid",
            "amount_paid": 9900,
        }

        mock_event = MagicMock()
        mock_event.type = "invoice.paid"
        mock_event.id = "evt_invoice_other"
        mock_event.data.object = mock_invoice

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch("app.api.routes.webhooks._claim_webhook_event", new_callable=AsyncMock, return_value=True),
            patch("app.api.routes.webhooks._complete_webhook_event", new_callable=AsyncMock),
            patch("app.api.routes.webhooks.handle_invoice_paid", new_callable=AsyncMock) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b'{}')
            request.headers = {"stripe-signature": "t=123,v1=abc"}

            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()  # Must be processed, not filtered

    @pytest.mark.asyncio
    async def test_handles_metadata_null_without_crash(self, mock_db, mock_stripe_settings):
        """Events with metadata: null don't crash the app filter."""
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_session = MagicMock()
        mock_session.to_dict_recursive.return_value = {
            "id": "cs_null_meta",
            "mode": "subscription",
            "metadata": None,  # Stripe can send null metadata
        }

        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.id = "evt_null_meta"
        mock_event.data.object = mock_session

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch("app.api.routes.webhooks._claim_webhook_event", new_callable=AsyncMock, return_value=True),
            patch("app.api.routes.webhooks._complete_webhook_event", new_callable=AsyncMock),
            patch("app.api.routes.webhooks.handle_checkout_session_completed", new_callable=AsyncMock) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b'{}')
            request.headers = {"stripe-signature": "t=123,v1=abc"}

            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()  # No app tag = process it
```

> **Note on fixtures:** `mock_db` and `mock_stripe_settings` are defined in the existing `backend/tests/conftest.py`. If the new test file doesn't pick them up, add the necessary imports/fixtures from conftest.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/billing/test_webhook_app_filter.py -v`
Expected: FAIL — no app filtering logic yet

- [ ] **Step 3: Add app filter to webhook handler**

In `backend/app/api/routes/webhooks.py`, add import at top:
```python
from app.services.billing.config import APP_IDENTIFIER
```

After the `to_dict_recursive` conversion (after line 96), add:

```python
        # Skip events from other apps sharing this Stripe account.
        # Each app tags its Stripe objects with metadata.app = "<app_name>".
        # Events without an app tag are processed for backward compatibility.
        # Note: _NON_FILTERABLE_EVENT_TYPES is a module-level constant (defined
        # near the top of webhooks.py).
        if event.type not in _NON_FILTERABLE_EVENT_TYPES:
            event_app = (event_data.get("metadata") or {}).get("app")
            if event_app and event_app != APP_IDENTIFIER:
                logger.info(
                    f"Skipping {event.type} from app={event_app} "
                    f"(this is {APP_IDENTIFIER})"
                )
                await _complete_webhook_event(db, event.id)
                return {"received": True}
```

Add a module-level constant near the top of `webhooks.py` (after imports):

```python
# Invoice events do NOT inherit metadata from their parent subscription,
# so we cannot filter them by app — they must always be processed.
# Using a denylist (non-filterable) rather than allowlist so that new
# event types added in the future are filtered by default.
_NON_FILTERABLE_EVENT_TYPES = {
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.created",
}
```

> **Why denylist?** If a developer adds a new event handler and forgets to update an allowlist, that event would bypass filtering and process events from other apps. With a denylist, new event types are filtered by default — safer.

> **Why `(event_data.get("metadata") or {})` instead of `.get("metadata", {})`?** Stripe can send `"metadata": null`. The `.get("metadata", {})` default only applies when the key is absent, not when it's `null`. Using `or {}` handles both cases.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/unit/billing/test_webhook_app_filter.py -v`
Expected: PASS

- [ ] **Step 5: Run full webhook test suite**

Run: `cd backend && python -m pytest tests/test_webhooks.py tests/unit/billing/test_webhook_app_filter.py tests/unit/billing/test_credit_endpoints.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/api/routes/webhooks.py tests/unit/billing/test_webhook_app_filter.py
git commit -m "feat(webhooks): skip events from other apps sharing Stripe account

Checks metadata.app on incoming webhook events. If the app tag is
present and doesn't match 'capveri', returns 200 without processing.
Events without an app tag are processed for backward compatibility."
```

---

### Task 4: Update existing tests with `app` metadata

**Files:**
- Modify: `backend/tests/unit/billing/test_credit_endpoints.py`
- Modify: `backend/tests/integration/test_billing_webhooks.py` (if session/subscription fixtures lack `app`)

- [ ] **Step 1: Update credit endpoint test fixtures**

In `backend/tests/unit/billing/test_credit_endpoints.py`, any test that builds a session dict with `metadata` should include `"app": "capveri"`. For example, the duplicate checkout test (line ~387):

```python
        session = {
            "id": "cs_dup",
            "mode": "payment",
            "metadata": {
                "app": "capveri",
                "organization_id": str(uuid4()),
                "billing_model": "credit_pack",
                "quantity": "5",
            },
            "amount_total": 5 * 699 * 100,
            "payment_intent": "pi_dup",
        }
```

Search all test files for `"metadata"` dicts in webhook-related tests and add `"app": "capveri"` where missing.

- [ ] **Step 2: Run full test suite**

Run: `cd backend && python -m pytest --tb=short`
Expected: All PASS

- [ ] **Step 3: Run coverage check**

Run: `cd backend && python -m pytest --cov=app --cov-fail-under=95`
Expected: Coverage >= 95%

- [ ] **Step 4: Format and lint**

Run: `cd backend && python -m black app tests && python -m isort app tests --profile black && python -m ruff check app tests --fix`

- [ ] **Step 5: Commit**

```bash
cd backend && git add -u
git commit -m "test(webhooks): add app metadata to webhook test fixtures"
```

---

## Known Side Effects

- **Dedup table accumulates other-app rows:** The app filter runs after `_claim_webhook_event`, so `stripe_webhook_events` will store rows for events from other apps (marked as completed). This is acceptable — it prevents Stripe retries and the existing 90-day retention policy purges old rows.

---

## Verification

1. **Unit tests pass:** `cd backend && python -m pytest --tb=short`
2. **Coverage maintained:** `cd backend && python -m pytest --cov=app --cov-fail-under=95`
3. **Manual verification:** After deploy, trigger a test checkout on CAMAudit — CapVeri's Sentry should show no new errors (the event is silently skipped with a log line)
4. **Stripe dashboard:** After deploy, CapVeri's webhook error rate should drop from 100% to 0%

---

## Cross-App Rollout (separate tasks, separate repos)

After this plan is implemented and verified on CapVeri, the same pattern must be applied to:

| App | Endpoint | APP_IDENTIFIER |
|-----|----------|---------------|
| CAMAudit (v2) | api.camaudit.io | `"camaudit"` |
| Lextract | api.lextract.io | `"lextract"` |
| GeoLeap | geoleap.app | `"geoleap"` |
| SkillLedger | skillledger.app | `"skillledger"` |
| GatherGrove | api.gathergrove.club | `"gathergrove"` |

Each app needs:
1. `APP_IDENTIFIER` constant in billing config
2. `app` key injected into all Stripe metadata at creation time
3. App filter gate in webhook handler (skip if `metadata.app` doesn't match)
4. Backward compat: process events without `metadata.app` (transition period)
