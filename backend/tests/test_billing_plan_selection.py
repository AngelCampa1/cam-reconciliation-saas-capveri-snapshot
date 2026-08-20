"""Tests for persisted billing activation / plan selection routes."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, status

from app.api.v1.billing import (
    CheckoutRequest,
    FeatureUsageResponse,
    PlanSelectionRequest,
    TrialStartRequest,
    _remaining_trial_days,
    _resolve_coupon_and_tier,
    _resolve_launch_offer_coupon,
    _validate_self_serve_plan_selection,
    create_checkout_session,
    get_feature_usage,
    get_plan_selection,
    save_plan_selection,
    start_default_trial,
    start_trial,
)
from app.models.user import User


@pytest.fixture
def mock_org_context():
    org_id = uuid4()
    user = User(
        id=uuid4(),
        email="user@example.com",
        organization_id=org_id,
        role="admin",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    ctx = MagicMock()
    ctx.organization_id = org_id
    ctx.user = user
    ctx.client = MagicMock()
    ctx.table = MagicMock(side_effect=lambda name: ctx.client.table(name))
    return ctx


def _single_result(data):
    return SimpleNamespace(data=data)


class TestPlanSelectionRoutes:
    @pytest.mark.asyncio
    async def test_get_plan_selection_requires_checkout_by_default(
        self, mock_org_context
    ):
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {"settings": {}}
        )
        mock_org_context.client.table.side_effect = lambda name: organizations_table

        with (
            patch(
                "app.api.v1.billing.get_free_audit_status",
                return_value={
                    "has_subscription": False,
                    "has_paused_subscription": False,
                    "has_ever_purchased": False,
                },
            ),
            patch(
                "app.api.v1.billing.effective_subscription_status", return_value=None
            ),
        ):
            response = await get_plan_selection(mock_org_context)

        assert response.checkout_required is True
        assert response.has_active_access is False
        assert response.plan_id is None

    @pytest.mark.asyncio
    async def test_save_plan_selection_persists_activation_state(
        self, mock_org_context
    ):
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {"settings": {}}
        )
        organizations_table.update.return_value.eq.return_value.execute.return_value = (
            _single_result({"id": str(mock_org_context.organization_id)})
        )
        mock_org_context.client.table.side_effect = lambda name: organizations_table

        with (
            patch(
                "app.api.v1.billing.get_free_audit_status",
                return_value={
                    "has_subscription": False,
                    "has_paused_subscription": False,
                    "has_ever_purchased": False,
                },
            ),
            patch(
                "app.api.v1.billing.effective_subscription_status", return_value=None
            ),
        ):
            response = await save_plan_selection(
                PlanSelectionRequest(
                    plan_id="reconcile",
                    billing_period="annual",
                    unit_count=120,
                    building_count=12,
                ),
                mock_org_context,
            )

        saved_settings = organizations_table.update.call_args.args[0]["settings"]
        assert saved_settings["billing_activation"]["plan_id"] == "reconcile"
        assert saved_settings["billing_activation"]["billing_period"] == "annual"
        assert saved_settings["billing_activation"]["unit_count"] == 120
        assert response.checkout_required is True

    @pytest.mark.asyncio
    async def test_get_plan_selection_requires_checkout_when_access_is_inactive(
        self, mock_org_context
    ):
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {
                "settings": {
                    "billing_activation": {
                        "plan_id": "reconcile",
                        "billing_period": "annual",
                        "unit_count": 25,
                        "building_count": 2,
                        "checkout_required": False,
                    }
                }
            }
        )
        mock_org_context.client.table.side_effect = lambda name: organizations_table

        with (
            patch(
                "app.api.v1.billing.get_free_audit_status",
                return_value={
                    "has_subscription": False,
                    "has_paused_subscription": False,
                    "has_ever_purchased": False,
                },
            ),
            patch(
                "app.api.v1.billing.effective_subscription_status",
                return_value="canceled",
            ),
        ):
            response = await get_plan_selection(mock_org_context)

        assert response.checkout_required is True
        assert response.has_active_access is False
        assert response.subscription_status == "canceled"
        assert response.plan_id == "reconcile"

    @pytest.mark.asyncio
    async def test_checkout_rejects_mismatch_with_saved_selection(
        self, mock_org_context
    ):
        subscription_table = MagicMock()
        subscription_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            {"stripe_customer_id": "cus_existing", "status": "incomplete"}
        )
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {
                "settings": {
                    "billing_activation": {
                        "plan_id": "reconcile",
                        "billing_period": "annual",
                        "unit_count": 25,
                        "building_count": 2,
                        "checkout_required": True,
                    }
                }
            }
        )

        mock_org_context.client.table.side_effect = [
            subscription_table,
            organizations_table,
        ]

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(
                CheckoutRequest(
                    plan_id="reconcile",
                    billing_period="annual",
                    unit_count=120,
                    building_count=12,
                    success_url="http://localhost:5173/checkout/success",
                    cancel_url="http://localhost:5173/checkout",
                ),
                mock_org_context,
                MagicMock(),
            )

        assert exc_info.value.status_code == status.HTTP_409_CONFLICT
        assert "Saved checkout selection" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_checkout_for_local_trial_creates_customer_and_preserves_remaining_trial(
        self, mock_org_context
    ):
        period_end = datetime.now(UTC) + timedelta(days=9, hours=3)
        subscription_table = MagicMock()
        subscription_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            {
                "stripe_customer_id": None,
                "stripe_subscription_id": None,
                "status": "trialing",
                "current_period_end": period_end.isoformat(),
            }
        )
        subscription_table.update.return_value.eq.return_value.execute.return_value = (
            _single_result({"id": "sub-local-trial"})
        )
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {
                "name": "Acme Properties",
                "billing_email": "billing@example.com",
                "settings": {
                    "billing_activation": {
                        "plan_id": "reconcile",
                        "billing_period": "annual",
                        "unit_count": 120,
                        "building_count": 12,
                        "checkout_required": False,
                    }
                },
            }
        )
        organizations_table.update.return_value.eq.return_value.execute.return_value = (
            _single_result({"id": str(mock_org_context.organization_id)})
        )

        def table_for(name):
            if name == "subscriptions":
                return subscription_table
            if name == "organizations":
                return organizations_table
            raise AssertionError(f"Unexpected table: {name}")

        mock_org_context.client.table.side_effect = table_for
        stripe_service = MagicMock()
        stripe_service.create_customer = AsyncMock(
            return_value=SimpleNamespace(id="cus_new")
        )
        stripe_service.create_checkout_session = AsyncMock(
            return_value=SimpleNamespace(
                id="cs_local_trial",
                url="https://checkout.stripe.com/cs_local_trial",
            )
        )

        response = await create_checkout_session(
            CheckoutRequest(
                plan_id="reconcile",
                billing_period="annual",
                unit_count=120,
                building_count=12,
                success_url="http://localhost:5173/checkout/success",
                cancel_url="http://localhost:5173/settings/billing",
            ),
            mock_org_context,
            stripe_service,
        )

        stripe_service.create_customer.assert_awaited_once_with(
            email="billing@example.com",
            name="Acme Properties",
            metadata={"organization_id": str(mock_org_context.organization_id)},
        )
        subscription_table.update.assert_any_call({"stripe_customer_id": "cus_new"})
        checkout_kwargs = stripe_service.create_checkout_session.await_args.kwargs
        assert checkout_kwargs["customer_id"] == "cus_new"
        assert checkout_kwargs["trial_days"] == 10
        assert response.checkout_url == "https://checkout.stripe.com/cs_local_trial"

    @pytest.mark.asyncio
    async def test_start_trial_creates_no_card_trial_and_clears_gate(
        self, mock_org_context
    ):
        subscription_table = MagicMock()
        subscription_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            None
        )
        subscription_table.upsert.return_value.execute.return_value = _single_result(
            [{"id": "sub-local-trial"}]
        )
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {"settings": {}}
        )
        organizations_table.update.return_value.eq.return_value.execute.return_value = (
            _single_result({"id": str(mock_org_context.organization_id)})
        )

        def table_for(name):
            if name == "subscriptions":
                return subscription_table
            if name == "organizations":
                return organizations_table
            raise AssertionError(f"Unexpected table: {name}")

        mock_org_context.client.table.side_effect = table_for

        with (
            patch(
                "app.api.v1.billing.get_free_audit_status",
                return_value={
                    "has_subscription": True,
                    "has_paused_subscription": False,
                    "has_ever_purchased": False,
                },
            ),
            patch(
                "app.api.v1.billing.effective_subscription_status",
                return_value="trialing",
            ),
        ):
            response = await start_trial(
                TrialStartRequest(
                    plan_id="reconcile",
                    billing_period="annual",
                    unit_count=120,
                    building_count=12,
                ),
                mock_org_context,
            )

        trial_row = subscription_table.upsert.call_args.args[0]
        saved_settings = organizations_table.update.call_args.args[0]["settings"]
        assert trial_row["organization_id"] == str(mock_org_context.organization_id)
        assert trial_row["plan"] == "growth_v2"
        assert trial_row["tier"] == "reconcile"
        assert trial_row["status"] == "trialing"
        assert trial_row["billing_interval"] == "annual"
        assert trial_row["stripe_subscription_id"] is None
        assert trial_row["stripe_customer_id"] is None
        assert trial_row["unit_count"] == 120
        assert trial_row["building_count"] == 12
        assert trial_row["unit_overage_count"] == 95
        assert saved_settings["billing_activation"]["checkout_required"] is False
        assert response.checkout_required is False
        assert response.has_active_access is True
        assert response.subscription_status == "trialing"

    @pytest.mark.asyncio
    async def test_checkout_for_expired_local_trial_collects_payment_without_new_trial(
        self, mock_org_context
    ):
        period_end = datetime.now(UTC) - timedelta(days=1)
        subscription_table = MagicMock()
        subscription_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            {
                "stripe_customer_id": None,
                "stripe_subscription_id": None,
                "status": "paused",
                "current_period_end": period_end.isoformat(),
            }
        )
        subscription_table.update.return_value.eq.return_value.execute.return_value = (
            _single_result({"id": "sub-local-paused"})
        )
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {
                "name": "Acme Properties",
                "billing_email": "billing@example.com",
                "settings": {
                    "billing_activation": {
                        "plan_id": "reconcile",
                        "billing_period": "annual",
                        "unit_count": 120,
                        "building_count": 12,
                        "checkout_required": False,
                    }
                },
            }
        )
        organizations_table.update.return_value.eq.return_value.execute.return_value = (
            _single_result({"id": str(mock_org_context.organization_id)})
        )

        def table_for(name):
            if name == "subscriptions":
                return subscription_table
            if name == "organizations":
                return organizations_table
            raise AssertionError(f"Unexpected table: {name}")

        mock_org_context.client.table.side_effect = table_for
        stripe_service = MagicMock()
        stripe_service.create_customer = AsyncMock(
            return_value=SimpleNamespace(id="cus_paused")
        )
        stripe_service.create_checkout_session = AsyncMock(
            return_value=SimpleNamespace(
                id="cs_local_paused",
                url="https://checkout.stripe.com/cs_local_paused",
            )
        )

        response = await create_checkout_session(
            CheckoutRequest(
                plan_id="reconcile",
                billing_period="annual",
                unit_count=120,
                building_count=12,
                success_url="http://localhost:5173/checkout/success",
                cancel_url="http://localhost:5173/settings/billing",
            ),
            mock_org_context,
            stripe_service,
        )

        checkout_kwargs = stripe_service.create_checkout_session.await_args.kwargs
        assert checkout_kwargs["customer_id"] == "cus_paused"
        assert checkout_kwargs["trial_days"] == 0
        assert response.checkout_url == "https://checkout.stripe.com/cs_local_paused"

    @pytest.mark.asyncio
    async def test_start_trial_rejects_paused_subscription(self, mock_org_context):
        subscription_table = MagicMock()
        subscription_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            {"status": "paused"}
        )
        mock_org_context.client.table.side_effect = lambda name: subscription_table

        with pytest.raises(HTTPException) as exc_info:
            await start_trial(
                TrialStartRequest(
                    plan_id="reconcile",
                    billing_period="annual",
                    unit_count=120,
                    building_count=12,
                ),
                mock_org_context,
            )

        assert exc_info.value.status_code == status.HTTP_409_CONFLICT
        assert "resume access" in exc_info.value.detail.lower()
        subscription_table.upsert.assert_not_called()


class TestGetBillingActivationHelper:
    def test_returns_empty_dict_when_settings_is_none(self):
        from app.services.billing.activation import get_billing_activation

        assert get_billing_activation(None) == {}

    def test_returns_empty_dict_when_settings_is_string(self):
        from app.services.billing.activation import get_billing_activation

        assert get_billing_activation("not a dict") == {}  # type: ignore[arg-type]

    def test_returns_activation_when_present(self):
        from app.services.billing.activation import get_billing_activation

        settings = {
            "billing_activation": {"plan_id": "reconcile", "billing_period": "annual"}
        }
        result = get_billing_activation(settings)
        assert result == {"plan_id": "reconcile", "billing_period": "annual"}


class TestStartDefaultTrial:
    @pytest.mark.asyncio
    async def test_start_default_trial_uses_reconcile_tier(self, mock_org_context):
        subscription_table = MagicMock()
        subscription_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            None
        )
        subscription_table.upsert.return_value.execute.return_value = _single_result(
            [{"id": "sub-default-trial"}]
        )
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {"settings": {}}
        )
        organizations_table.update.return_value.eq.return_value.execute.return_value = (
            _single_result({"id": str(mock_org_context.organization_id)})
        )

        def table_for(name):
            if name == "subscriptions":
                return subscription_table
            if name == "organizations":
                return organizations_table
            raise AssertionError(f"Unexpected table: {name}")

        mock_org_context.client.table.side_effect = table_for

        with (
            patch(
                "app.api.v1.billing.get_free_audit_status",
                return_value={
                    "has_subscription": True,
                    "has_paused_subscription": False,
                    "has_ever_purchased": False,
                },
            ),
            patch(
                "app.api.v1.billing.effective_subscription_status",
                return_value="trialing",
            ),
        ):
            response = await start_default_trial(mock_org_context)

        trial_row = subscription_table.upsert.call_args.args[0]
        saved_settings = organizations_table.update.call_args.args[0]["settings"]
        assert trial_row["tier"] == "reconcile"
        assert trial_row["billing_interval"] == "annual"
        assert trial_row["unit_count"] == 25
        assert trial_row["building_count"] == 1
        assert trial_row["status"] == "trialing"
        assert trial_row["stripe_subscription_id"] is None
        assert saved_settings["billing_activation"]["checkout_required"] is False
        assert response.checkout_required is False
        assert response.has_active_access is True

    @pytest.mark.asyncio
    async def test_start_default_trial_skips_upsert_when_already_trialing(
        self, mock_org_context
    ):
        subscription_table = MagicMock()
        subscription_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            {"status": "trialing"}
        )
        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = _single_result(
            {"settings": {}}
        )
        organizations_table.update.return_value.eq.return_value.execute.return_value = (
            _single_result({"id": str(mock_org_context.organization_id)})
        )

        def table_for(name):
            if name == "subscriptions":
                return subscription_table
            if name == "organizations":
                return organizations_table
            raise AssertionError(f"Unexpected table: {name}")

        mock_org_context.client.table.side_effect = table_for

        with (
            patch(
                "app.api.v1.billing.get_free_audit_status",
                return_value={
                    "has_subscription": True,
                    "has_paused_subscription": False,
                    "has_ever_purchased": False,
                },
            ),
            patch(
                "app.api.v1.billing.effective_subscription_status",
                return_value="trialing",
            ),
        ):
            await start_default_trial(mock_org_context)

        subscription_table.upsert.assert_not_called()

    @pytest.mark.asyncio
    async def test_start_default_trial_rejects_paused_subscription(
        self, mock_org_context
    ):
        subscription_table = MagicMock()
        subscription_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            {"status": "paused"}
        )
        mock_org_context.client.table.side_effect = lambda name: subscription_table

        with pytest.raises(HTTPException) as exc_info:
            await start_default_trial(mock_org_context)

        assert exc_info.value.status_code == status.HTTP_409_CONFLICT
        assert "resume access" in exc_info.value.detail.lower()
        subscription_table.upsert.assert_not_called()


class TestGetFeatureUsage:
    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_usage(self, mock_org_context):
        sub_table = MagicMock()
        sub_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            {"tier": "reconcile"}
        )
        mock_org_context.client.table.side_effect = lambda name: sub_table

        with (
            patch("app.api.v1.billing.get_supabase_admin") as mock_admin,
            patch("app.api.v1.billing.list_used_features", return_value=[]),
        ):
            mock_admin.return_value = MagicMock()
            response = await get_feature_usage(mock_org_context)

        assert isinstance(response, FeatureUsageResponse)
        assert response.used_features == []
        assert response.current_tier == "reconcile"

    @pytest.mark.asyncio
    async def test_returns_used_features_with_tier(self, mock_org_context):
        sub_table = MagicMock()
        sub_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            {"tier": "reconcile"}
        )
        mock_org_context.client.table.side_effect = lambda name: sub_table

        used = [
            {
                "key": "tenant_portal",
                "label": "Tenant self-serve portal",
                "required_tier": "reconcile",
                "first_used_at": "2026-01-01T00:00:00+00:00",
                "last_used_at": "2026-02-01T00:00:00+00:00",
            }
        ]
        with (
            patch("app.api.v1.billing.get_supabase_admin") as mock_admin,
            patch("app.api.v1.billing.list_used_features", return_value=used),
        ):
            mock_admin.return_value = MagicMock()
            response = await get_feature_usage(mock_org_context)

        assert len(response.used_features) == 1
        assert response.used_features[0].key == "tenant_portal"
        assert response.used_features[0].required_tier == "reconcile"
        assert response.current_tier == "reconcile"

    @pytest.mark.asyncio
    async def test_current_tier_is_none_when_no_subscription(self, mock_org_context):
        sub_table = MagicMock()
        sub_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = _single_result(
            None
        )
        mock_org_context.client.table.side_effect = lambda name: sub_table

        with (
            patch("app.api.v1.billing.get_supabase_admin") as mock_admin,
            patch("app.api.v1.billing.list_used_features", return_value=[]),
        ):
            mock_admin.return_value = MagicMock()
            response = await get_feature_usage(mock_org_context)

        assert response.current_tier is None


class TestRemainingTrialDays:
    """Edge-case branches of the in-app trial countdown helper."""

    def test_returns_zero_when_period_end_missing(self):
        assert _remaining_trial_days(None) == 0
        assert _remaining_trial_days("") == 0

    def test_returns_zero_for_unparseable_period_end(self):
        # Invalid ISO string hits the ValueError guard.
        assert _remaining_trial_days("not-a-real-date") == 0

    def test_treats_naive_period_end_as_utc_and_counts_days(self):
        # A naive (tz-less) ISO timestamp is assumed UTC, not rejected.
        naive_future = (
            (datetime.now(UTC) + timedelta(days=10)).replace(tzinfo=None).isoformat()
        )
        assert _remaining_trial_days(naive_future) >= 1

    def test_returns_zero_when_period_end_in_past(self):
        past = (datetime.now(UTC) - timedelta(days=2)).isoformat()
        assert _remaining_trial_days(past) == 0

    def test_floors_remaining_at_one_day_while_active(self):
        # A trial that ends in a few hours still reports at least one day left.
        soon = (datetime.now(UTC) + timedelta(hours=3)).isoformat()
        assert _remaining_trial_days(soon) == 1


class TestValidateSelfServePlanSelection:
    """Validation guards a paused/expired-trial user hits when choosing a plan."""

    def _details(self, max_units=None):
        return {"max_units": max_units}

    def test_rejects_unknown_plan(self):
        with pytest.raises(HTTPException) as exc:
            _validate_self_serve_plan_selection(
                plan_id="bogus",
                billing_period="annual",
                unit_count=10,
                building_count=1,
            )
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid plan" in exc.value.detail

    def test_rejects_non_annual_billing_period(self):
        with pytest.raises(HTTPException) as exc:
            _validate_self_serve_plan_selection(
                plan_id="reconcile",
                billing_period="monthly",
                unit_count=10,
                building_count=1,
            )
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "annual" in exc.value.detail

    def test_rejects_zero_unit_count(self):
        with pytest.raises(HTTPException) as exc:
            _validate_self_serve_plan_selection(
                plan_id="reconcile",
                billing_period="annual",
                unit_count=0,
                building_count=1,
            )
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Unit count" in exc.value.detail

    def test_rejects_zero_building_count(self):
        with pytest.raises(HTTPException) as exc:
            _validate_self_serve_plan_selection(
                plan_id="reconcile",
                billing_period="annual",
                unit_count=10,
                building_count=0,
            )
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Building count" in exc.value.detail

    def test_rejects_portfolio_above_self_serve_limits(self):
        with pytest.raises(HTTPException) as exc:
            _validate_self_serve_plan_selection(
                plan_id="reconcile",
                billing_period="annual",
                unit_count=100001,
                building_count=1,
            )
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "custom terms" in exc.value.detail

    def test_rejects_unit_count_above_plan_tier_max(self):
        with patch(
            "app.api.v1.billing.get_tier_details",
            return_value=self._details(max_units=5),
        ):
            with pytest.raises(HTTPException) as exc:
                _validate_self_serve_plan_selection(
                    plan_id="reconcile",
                    billing_period="annual",
                    unit_count=10,
                    building_count=1,
                )
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "rentable units" in exc.value.detail

    def test_returns_tier_details_for_valid_selection(self):
        with patch(
            "app.api.v1.billing.get_tier_details",
            return_value=self._details(max_units=500),
        ):
            details = _validate_self_serve_plan_selection(
                plan_id="reconcile",
                billing_period="annual",
                unit_count=10,
                building_count=1,
            )
        assert details["max_units"] == 500


class TestResolveLaunchOfferCoupon:
    """Trusted limited-offer code resolves to the Stripe coupon."""

    def test_returns_none_when_no_code_supplied(self):
        assert _resolve_launch_offer_coupon(None) is None

    def test_rejects_unknown_launch_offer_code(self):
        with pytest.raises(HTTPException) as exc:
            _resolve_launch_offer_coupon("NOTREAL")
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid limited offer code" in exc.value.detail

    def test_errors_when_coupon_not_configured(self):
        with patch(
            "app.api.v1.billing.get_stripe_settings",
            return_value=SimpleNamespace(stripe_80off_coupon_id=""),
        ):
            with pytest.raises(HTTPException) as exc:
                _resolve_launch_offer_coupon("80OFF")
        assert exc.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "not configured" in exc.value.detail

    def test_returns_configured_coupon_for_valid_code(self):
        with patch(
            "app.api.v1.billing.get_stripe_settings",
            return_value=SimpleNamespace(stripe_80off_coupon_id="coupon_80off"),
        ):
            assert _resolve_launch_offer_coupon("80OFF") == "coupon_80off"


class TestResolveCouponAndTier:
    """Signed offer-token → (coupon_id, tier) resolution."""

    def _patches(self, *, tier_side_effect=None, tier_return=None):
        settings = SimpleNamespace(checkout_offer_token_secret="secret")
        stripe_settings = SimpleNamespace(
            stripe_free_audit_coupon_offer_50="cpn_50",
            stripe_free_audit_coupon_offer_free="cpn_free",
        )
        token_patch = patch(
            "app.api.v1.billing.extract_offer_tier_from_token",
            side_effect=tier_side_effect,
            return_value=tier_return,
        )
        return settings, stripe_settings, token_patch

    def test_rejects_token_that_fails_validation(self):
        settings, stripe_settings, token_patch = self._patches(
            tier_side_effect=ValueError("expired")
        )
        with (
            patch("app.api.v1.billing.get_settings", return_value=settings),
            patch(
                "app.api.v1.billing.get_stripe_settings", return_value=stripe_settings
            ),
            token_patch,
        ):
            with pytest.raises(HTTPException) as exc:
                _resolve_coupon_and_tier("bad.token", "org-1")
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid offer token" in exc.value.detail

    def test_rejects_token_with_unmapped_tier(self):
        settings, stripe_settings, token_patch = self._patches(tier_return="offer_xyz")
        with (
            patch("app.api.v1.billing.get_settings", return_value=settings),
            patch(
                "app.api.v1.billing.get_stripe_settings", return_value=stripe_settings
            ),
            token_patch,
        ):
            with pytest.raises(HTTPException) as exc:
                _resolve_coupon_and_tier("token", "org-1")
        assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid offer tier" in exc.value.detail

    def test_returns_coupon_and_tier_for_valid_token(self):
        settings, stripe_settings, token_patch = self._patches(tier_return="offer_50")
        with (
            patch("app.api.v1.billing.get_settings", return_value=settings),
            patch(
                "app.api.v1.billing.get_stripe_settings", return_value=stripe_settings
            ),
            token_patch,
        ):
            coupon_id, tier = _resolve_coupon_and_tier("token", "org-1")
        assert coupon_id == "cpn_50"
        assert tier == "offer_50"
