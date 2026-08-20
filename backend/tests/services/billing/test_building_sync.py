"""Tests for subscription usage synchronization service."""

from datetime import datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.models.subscription import (
    BillingSubscriptionStatus,
    Subscription,
    SubscriptionPlan,
)
from app.services.billing.building_sync import (
    BillingStatus,
    BuildingSyncService,
)


class TestBuildingSyncService:
    """Test suite for BuildingSyncService."""

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase database client."""
        return MagicMock()

    @pytest.fixture
    def mock_stripe(self):
        """Create mock Stripe service."""
        return MagicMock()

    @pytest.fixture
    def service(self, mock_stripe, mock_db):
        """Create BuildingSyncService instance."""
        return BuildingSyncService(stripe_service=mock_stripe, db=mock_db)

    @pytest.fixture
    def org_id(self) -> UUID:
        """Sample organization ID."""
        return uuid4()

    @pytest.fixture
    def legacy_subscription_data(self, org_id) -> dict[str, Any]:
        """Legacy per-building subscription fixture."""
        now = datetime.now()
        return {
            "id": str(uuid4()),
            "organization_id": str(org_id),
            "stripe_customer_id": "cus_123",
            "stripe_subscription_id": "sub_123",
            "pricing_model": "per_building",
            "building_count": 5,
            "status": BillingSubscriptionStatus.ACTIVE,
            "plan": SubscriptionPlan.PROFESSIONAL,
            "current_period_start": now,
            "current_period_end": now + timedelta(days=30),
            "cancel_at_period_end": False,
            "created_at": now,
            "updated_at": now,
        }

    @pytest.fixture
    def unit_subscription_data(self, org_id) -> dict[str, Any]:
        """Hybrid per-unit subscription fixture."""
        now = datetime.now()
        return {
            "id": str(uuid4()),
            "organization_id": str(org_id),
            "stripe_customer_id": "cus_456",
            "stripe_subscription_id": "sub_456",
            "pricing_model": "per_unit",
            "plan": SubscriptionPlan.GROWTH_V2,
            "building_count": 4,
            "unit_count": 75,
            "included_units": 50,
            "unit_overage_count": 25,
            "status": BillingSubscriptionStatus.ACTIVE,
            "current_period_start": now,
            "current_period_end": now + timedelta(days=30),
            "cancel_at_period_end": False,
            "created_at": now,
            "updated_at": now,
        }

    @pytest.mark.asyncio
    async def test_get_building_count_with_properties(self, service, mock_db, org_id):
        """Test getting building count when properties exist."""
        mock_result = MagicMock()
        mock_result.count = 3

        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_result
        mock_chain.eq.return_value = mock_chain
        mock_chain.select.return_value = mock_chain
        mock_db.table.return_value = mock_chain

        count = await service.get_building_count(org_id)

        assert count == 3
        mock_db.table.assert_called_once_with("properties")
        mock_chain.eq.assert_called_once_with("organization_id", str(org_id))

    @pytest.mark.asyncio
    async def test_get_billable_unit_count_filters_non_rentable_spaces(
        self, service, mock_db, org_id
    ):
        """Unit counts exclude archived/common-area style placeholders."""
        properties_result = MagicMock()
        properties_result.data = [{"id": str(uuid4())}, {"id": str(uuid4())}]

        properties_chain = MagicMock()
        properties_chain.execute.return_value = properties_result
        properties_chain.eq.return_value = properties_chain
        properties_chain.select.return_value = properties_chain

        units_result = MagicMock()
        units_result.count = 42

        units_chain = MagicMock()
        units_chain.execute.return_value = units_result
        units_chain.neq.return_value = units_chain
        units_chain.eq.return_value = units_chain
        units_chain.in_.return_value = units_chain
        units_chain.select.return_value = units_chain

        mock_db.table.side_effect = [properties_chain, units_chain]

        count = await service.get_billable_unit_count(org_id)

        assert count == 42
        assert mock_db.table.call_args_list == [
            (("properties",), {}),
            (("units",), {}),
        ]
        properties_chain.eq.assert_called_once_with("organization_id", str(org_id))
        units_chain.in_.assert_called_once_with(
            "property_id",
            [item["id"] for item in properties_result.data],
        )
        units_chain.neq.assert_any_call("space_type", "outdoor_amenity")
        units_chain.neq.assert_any_call("space_type", "equipment_shaft")

    @pytest.mark.asyncio
    async def test_get_billable_unit_count_returns_zero_without_properties(
        self, service, mock_db, org_id
    ):
        """Organizations without properties have no billable units."""
        properties_result = MagicMock()
        properties_result.data = []

        properties_chain = MagicMock()
        properties_chain.execute.return_value = properties_result
        properties_chain.eq.return_value = properties_chain
        properties_chain.select.return_value = properties_chain
        mock_db.table.return_value = properties_chain

        count = await service.get_billable_unit_count(org_id)

        assert count == 0
        mock_db.table.assert_called_once_with("properties")

    @pytest.mark.asyncio
    async def test_get_subscription_found(
        self, service, mock_db, org_id, legacy_subscription_data
    ):
        """Test getting subscription when it exists."""
        mock_result = MagicMock()
        mock_result.data = legacy_subscription_data

        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_result
        mock_chain.maybe_single.return_value = mock_chain
        mock_chain.eq.return_value = mock_chain
        mock_chain.select.return_value = mock_chain
        mock_db.table.return_value = mock_chain

        subscription = await service.get_subscription(org_id)

        assert subscription is not None
        assert subscription.organization_id == org_id
        assert subscription.stripe_subscription_id == "sub_123"
        assert subscription.building_count == 5
        mock_db.table.assert_called_once_with("subscriptions")

    @pytest.mark.asyncio
    async def test_update_stripe_quantity_updates_legacy_building_count(
        self, service, mock_db, org_id, legacy_subscription_data
    ):
        """Legacy per-building subscriptions still sync first item quantity."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**legacy_subscription_data)
        )

        mock_stripe_sub = {
            "id": "sub_123",
            "items": {"data": [{"id": "si_123", "quantity": 5}]},
        }

        with (
            patch("stripe.Subscription.retrieve") as mock_retrieve,
            patch("stripe.SubscriptionItem.modify") as mock_modify,
        ):
            mock_retrieve.return_value = mock_stripe_sub

            mock_chain = MagicMock()
            mock_chain.execute.return_value = MagicMock()
            mock_chain.eq.return_value = mock_chain
            mock_chain.update.return_value = mock_chain
            mock_db.table.return_value = mock_chain

            await service.update_stripe_quantity(org_id, 10)

            mock_modify.assert_called_once_with(
                "si_123", quantity=10, proration_behavior="create_prorations"
            )
            mock_chain.update.assert_called_once_with({"building_count": 10})

    @pytest.mark.asyncio
    async def test_update_stripe_quantity_requires_positive_count(
        self, service, org_id
    ):
        """Legacy building counts cannot drop below one."""
        with pytest.raises(ValueError, match="at least 1"):
            await service.update_stripe_quantity(org_id, 0)

    @pytest.mark.asyncio
    async def test_update_stripe_quantity_requires_subscription(self, service, org_id):
        """Updating legacy counts requires an existing subscription."""
        service.get_subscription = AsyncMock(return_value=None)

        with pytest.raises(ValueError, match="No subscription found"):
            await service.update_stripe_quantity(org_id, 3)

    @pytest.mark.asyncio
    async def test_update_stripe_quantity_requires_subscription_id(
        self, service, org_id, legacy_subscription_data
    ):
        """Legacy subscriptions need a Stripe subscription id to sync usage."""
        subscription = Subscription(
            **{**legacy_subscription_data, "stripe_subscription_id": None}
        )
        service.get_subscription = AsyncMock(return_value=subscription)

        with pytest.raises(ValueError, match="No Stripe subscription ID found"):
            await service.update_stripe_quantity(org_id, 3)

    @pytest.mark.asyncio
    async def test_update_stripe_quantity_requires_subscription_items(
        self, service, org_id, legacy_subscription_data
    ):
        """The Stripe subscription must expose at least one item."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**legacy_subscription_data)
        )

        with patch("stripe.Subscription.retrieve") as mock_retrieve:
            mock_retrieve.return_value = {"items": {"data": []}}

            with pytest.raises(ValueError, match="No subscription items found"):
                await service.update_stripe_quantity(org_id, 3)

    @pytest.mark.asyncio
    async def test_update_stripe_quantity_requires_item_id(
        self, service, org_id, legacy_subscription_data
    ):
        """The first Stripe item needs an identifier for quantity sync."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**legacy_subscription_data)
        )

        with patch("stripe.Subscription.retrieve") as mock_retrieve:
            mock_retrieve.return_value = {"items": {"data": [{}]}}

            with pytest.raises(ValueError, match="missing ID"):
                await service.update_stripe_quantity(org_id, 3)

    @pytest.mark.asyncio
    async def test_update_unit_overage_quantity_updates_second_item(
        self, service, mock_db, org_id, unit_subscription_data
    ):
        """Per-unit subscriptions sync the overage item quantity instead of base item."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**unit_subscription_data)
        )

        mock_stripe_sub = {
            "id": "sub_456",
            "items": {
                "data": [
                    {"id": "si_base", "price": {"id": "price_growth_base_annual"}},
                    {"id": "si_overage", "price": {"id": "price_unit_overage_annual"}},
                ]
            },
        }

        with (
            patch("stripe.Subscription.retrieve") as mock_retrieve,
            patch("stripe.SubscriptionItem.modify") as mock_modify,
        ):
            mock_retrieve.return_value = mock_stripe_sub

            mock_chain = MagicMock()
            mock_chain.execute.return_value = MagicMock()
            mock_chain.eq.return_value = mock_chain
            mock_chain.update.return_value = mock_chain
            mock_db.table.return_value = mock_chain

            await service.update_unit_overage_quantity(org_id, 70)

            mock_modify.assert_called_once_with(
                "si_overage", quantity=70, proration_behavior="create_prorations"
            )
            mock_chain.update.assert_called_once_with(
                {"unit_count": 120, "unit_overage_count": 70}
            )

    @pytest.mark.asyncio
    async def test_update_unit_overage_quantity_rejects_negative_counts(
        self, service, org_id
    ):
        """Per-unit overage quantities cannot be negative."""
        with pytest.raises(ValueError, match="cannot be negative"):
            await service.update_unit_overage_quantity(org_id, -1)

    @pytest.mark.asyncio
    async def test_update_unit_overage_quantity_requires_subscription(
        self, service, org_id
    ):
        """Per-unit usage sync requires an existing subscription."""
        service.get_subscription = AsyncMock(return_value=None)

        with pytest.raises(ValueError, match="No subscription found"):
            await service.update_unit_overage_quantity(org_id, 1)

    @pytest.mark.asyncio
    async def test_update_unit_overage_quantity_requires_subscription_id(
        self, service, org_id, unit_subscription_data
    ):
        """Per-unit subscriptions need a Stripe subscription id to sync overages."""
        subscription = Subscription(
            **{**unit_subscription_data, "stripe_subscription_id": None}
        )
        service.get_subscription = AsyncMock(return_value=subscription)

        with pytest.raises(ValueError, match="No Stripe subscription ID found"):
            await service.update_unit_overage_quantity(org_id, 1)

    @pytest.mark.asyncio
    async def test_update_unit_overage_quantity_requires_subscription_items(
        self, service, org_id, unit_subscription_data
    ):
        """The Stripe subscription must expose an overage item."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**unit_subscription_data)
        )

        with patch("stripe.Subscription.retrieve") as mock_retrieve:
            mock_retrieve.return_value = {"items": {"data": []}}

            with pytest.raises(ValueError, match="No subscription items found"):
                await service.update_unit_overage_quantity(org_id, 1)

    @pytest.mark.asyncio
    async def test_update_unit_overage_quantity_updates_single_reconcile_item(
        self, service, org_id, unit_subscription_data
    ):
        """New Reconcile subscriptions update the primary item price."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**unit_subscription_data)
        )

        with (
            patch("stripe.Subscription.retrieve") as mock_retrieve,
            patch("stripe.SubscriptionItem.modify") as mock_modify,
        ):
            mock_retrieve.return_value = {
                "items": {
                    "data": [
                        MagicMock(),
                        {"id": "si_base", "price": {"id": "price_growth_base_annual"}},
                    ]
                }
            }

            await service.update_unit_overage_quantity(org_id, 70)

        mock_modify.assert_called_once_with(
            "si_base",
            price_data={
                "currency": "usd",
                "unit_amount": 2199500,
                "recurring": {"interval": "year"},
                "product_data": {
                    "name": "CapVeri Reconcile",
                    "description": "Annual Reconcile subscription for 120 rentable units",
                },
            },
            quantity=1,
            proration_behavior="create_prorations",
        )

    @pytest.mark.asyncio
    async def test_update_unit_overage_quantity_reverts_to_base_price(
        self, service, org_id, unit_subscription_data
    ):
        """Returning to included units uses the configured base Reconcile price."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**unit_subscription_data)
        )

        with (
            patch("stripe.Subscription.retrieve") as mock_retrieve,
            patch("stripe.SubscriptionItem.modify") as mock_modify,
        ):
            mock_retrieve.return_value = {
                "items": {
                    "data": [
                        {"id": "si_base", "price": {"id": "price_dynamic_reconcile"}}
                    ]
                }
            }

            await service.update_unit_overage_quantity(org_id, 0)

        mock_modify.assert_called_once_with(
            "si_base",
            price="price_reconcile_annual",
            quantity=1,
            proration_behavior="create_prorations",
        )

    @pytest.mark.asyncio
    async def test_check_billing_status_current_for_per_unit(
        self, service, org_id, unit_subscription_data
    ):
        """Per-unit subscriptions compare actual units to subscribed unit count."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**unit_subscription_data)
        )
        service.get_billable_unit_count = AsyncMock(return_value=70)

        status = await service.check_billing_status(org_id)

        assert status == BillingStatus.CURRENT

    @pytest.mark.asyncio
    async def test_check_billing_status_over_limit_for_per_unit(
        self, service, org_id, unit_subscription_data
    ):
        """Per-unit subscriptions report over-limit when actual units exceed paid units."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**unit_subscription_data)
        )
        service.get_billable_unit_count = AsyncMock(return_value=90)

        status = await service.check_billing_status(org_id)

        assert status == BillingStatus.OVER_LIMIT

    @pytest.mark.asyncio
    async def test_check_billing_status_without_subscription(self, service, org_id):
        """Organizations without subscriptions report no-subscription billing status."""
        service.get_subscription = AsyncMock(return_value=None)

        status = await service.check_billing_status(org_id)

        assert status == BillingStatus.NO_SUBSCRIPTION

    @pytest.mark.asyncio
    async def test_check_billing_status_current_for_legacy_subscription(
        self, service, org_id, legacy_subscription_data
    ):
        """Per-building subscriptions still compare against property count."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**legacy_subscription_data)
        )
        service.get_building_count = AsyncMock(return_value=5)

        status = await service.check_billing_status(org_id)

        assert status == BillingStatus.CURRENT

    @pytest.mark.asyncio
    async def test_sync_building_count_with_change_for_legacy_subscription(
        self, service, org_id, legacy_subscription_data
    ):
        """Property changes still sync per-building subscriptions."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**legacy_subscription_data)
        )
        service.get_building_count = AsyncMock(return_value=8)
        service.update_stripe_quantity = AsyncMock()

        result = await service.sync_building_count(org_id)

        assert result["old_count"] == 5
        assert result["new_count"] == 8
        assert result["status"] == "synced"
        service.update_stripe_quantity.assert_called_once_with(org_id, 8)

    @pytest.mark.asyncio
    async def test_sync_building_count_ignores_per_unit_subscriptions(
        self, service, org_id, unit_subscription_data
    ):
        """Per-unit subscriptions do not sync the legacy building quantity."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**unit_subscription_data)
        )
        service.get_building_count = AsyncMock(return_value=9)

        result = await service.sync_building_count(org_id)

        assert result == {"old_count": 4, "new_count": 9, "status": "ignored"}

    @pytest.mark.asyncio
    async def test_sync_unit_count_with_change_for_per_unit_subscription(
        self, service, org_id, unit_subscription_data
    ):
        """Unit changes sync the overage quantity for per-unit subscriptions."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**unit_subscription_data)
        )
        service.get_billable_unit_count = AsyncMock(return_value=120)
        service.update_unit_overage_quantity = AsyncMock()

        result = await service.sync_unit_count(org_id)

        assert result["old_count"] == 75
        assert result["new_count"] == 120
        assert result["status"] == "synced"
        service.update_unit_overage_quantity.assert_called_once_with(org_id, 70)

    @pytest.mark.asyncio
    async def test_sync_unit_count_ignores_per_building_subscriptions(
        self, service, org_id, legacy_subscription_data
    ):
        """Legacy subscriptions keep unit sync disabled."""
        service.get_subscription = AsyncMock(
            return_value=Subscription(**legacy_subscription_data)
        )
        service.get_billable_unit_count = AsyncMock(return_value=120)

        result = await service.sync_unit_count(org_id)

        assert result == {"old_count": 0, "new_count": 120, "status": "ignored"}

    @pytest.mark.asyncio
    async def test_sync_building_count_skips_credit_pack_orgs(
        self, service, mock_db, org_id
    ):
        """Credit pack orgs skip Stripe sync."""
        mock_result = MagicMock()
        mock_result.data = {"billing_model": "credit_pack"}

        props_result = MagicMock()
        props_result.count = 7

        def table_side_effect(name: str):
            mock = MagicMock()
            if name == "subscriptions":
                mock.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
                    mock_result
                )
            elif name == "properties":
                mock.select.return_value.eq.return_value.execute.return_value = (
                    props_result
                )
            return mock

        mock_db.table.side_effect = table_side_effect

        result = await service.sync_building_count(org_id)

        assert result["status"] == "skipped_credit_pack"
        assert result["old_count"] == result["new_count"]


class TestBillingStatus:
    """Test suite for BillingStatus enum."""

    def test_billing_status_values(self):
        """Test BillingStatus enum values."""
        assert BillingStatus.CURRENT == "current"
        assert BillingStatus.OVER_LIMIT == "over_limit"
        assert BillingStatus.NO_SUBSCRIPTION == "no_subscription"

    def test_billing_status_is_string(self):
        """Test that BillingStatus values are strings."""
        assert isinstance(BillingStatus.CURRENT.value, str)
        assert isinstance(BillingStatus.OVER_LIMIT.value, str)
        assert isinstance(BillingStatus.NO_SUBSCRIPTION.value, str)
