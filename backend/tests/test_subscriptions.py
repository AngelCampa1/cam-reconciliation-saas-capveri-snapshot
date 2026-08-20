"""
Tests for subscription lifecycle management service.
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.models.subscription import (
    BillingSubscriptionStatus,
    Subscription,
    SubscriptionPlan,
)
from app.services.billing.subscriptions import SubscriptionService


@pytest.fixture
def mock_db():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def mock_stripe_service():
    """Mock StripeService."""
    return MagicMock()


@pytest.fixture
def subscription_service(mock_stripe_service, mock_db):
    """SubscriptionService instance with mocked dependencies."""
    return SubscriptionService(stripe_service=mock_stripe_service, db=mock_db)


@pytest.fixture
def sample_subscription():
    """Sample subscription data."""
    return Subscription(
        id=uuid4(),
        organization_id=uuid4(),
        plan=SubscriptionPlan.GROWTH,
        status=BillingSubscriptionStatus.ACTIVE,
        stripe_customer_id="cus_test123",
        stripe_subscription_id="sub_test456",
        current_period_start=datetime.now(UTC),
        current_period_end=datetime.now(UTC),
        cancel_at_period_end=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


class TestPlanToTierId:
    """Test the _plan_to_tier_id helper."""

    def test_enterprise_plan_maps_to_reconcile(self):
        from app.models.subscription import SubscriptionPlan
        from app.services.billing.subscriptions import _plan_to_tier_id

        assert _plan_to_tier_id(SubscriptionPlan.ENTERPRISE) == "reconcile"

    def test_growth_plan_maps_to_reconcile(self):
        from app.models.subscription import SubscriptionPlan
        from app.services.billing.subscriptions import _plan_to_tier_id

        assert _plan_to_tier_id(SubscriptionPlan.GROWTH) == "reconcile"

    def test_professional_plan_maps_to_reconcile(self):
        from app.models.subscription import SubscriptionPlan
        from app.services.billing.subscriptions import _plan_to_tier_id

        assert _plan_to_tier_id(SubscriptionPlan.PROFESSIONAL) == "reconcile"


class TestGetSubscription:
    """Test get_subscription method."""

    @pytest.mark.asyncio
    async def test_get_subscription_success(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify subscription is retrieved correctly."""
        org_id = sample_subscription.organization_id

        # Mock database response
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = sample_subscription.model_dump(
            mode="json"
        )

        # Execute
        result = await subscription_service.get_subscription(org_id)

        # Verify
        assert result is not None
        assert result.organization_id == org_id
        assert result.plan == SubscriptionPlan.GROWTH
        mock_db.table.assert_called_with("subscriptions")

    @pytest.mark.asyncio
    async def test_get_subscription_not_found(self, subscription_service, mock_db):
        """Verify None returned when subscription not found."""
        org_id = uuid4()

        # Mock database response - no data
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            None
        )

        # Execute
        result = await subscription_service.get_subscription(org_id)

        # Verify
        assert result is None


class TestCreateTrialSubscription:
    """Test create_trial_subscription method."""

    @pytest.mark.asyncio
    async def test_creates_stripe_subscription_with_trial(
        self, subscription_service, mock_db
    ):
        """Verify Stripe subscription is created with 30-day trial."""
        org_id = uuid4()
        now = datetime.now(UTC)
        trial_start_ts = int(now.timestamp())
        trial_end_ts = trial_start_ts + (30 * 86400)

        stripe_sub_response = {
            "id": "sub_new_trial_123",
            "trial_start": trial_start_ts,
            "trial_end": trial_end_ts,
        }

        # Mock DB insert response
        mock_db.table.return_value.insert.return_value.execute.return_value.data = [
            {
                "id": str(uuid4()),
                "organization_id": str(org_id),
                "plan": "growth_v2",
                "status": "trialing",
                "stripe_subscription_id": "sub_new_trial_123",
                "stripe_customer_id": "cus_test_999",
                "current_period_start": now.isoformat(),
                "current_period_end": now.isoformat(),
                "cancel_at_period_end": False,
                "building_count": 1,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
        ]

        with patch(
            "stripe.Subscription.create", return_value=stripe_sub_response
        ) as mock_create:
            result = await subscription_service.create_trial_subscription(
                organization_id=org_id,
                tier_id="reconcile",
                stripe_customer_id="cus_test_999",
            )

            # Verify Stripe called correctly
            mock_create.assert_called_once()
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["customer"] == "cus_test_999"
            assert call_kwargs["trial_period_days"] == 30
            assert call_kwargs["items"] == [{"price": "price_reconcile_annual"}]
            assert call_kwargs["metadata"]["tier"] == "reconcile"
            assert call_kwargs["metadata"]["organization_id"] == str(org_id)

        # Verify DB insert
        insert_call = mock_db.table.return_value.insert.call_args[0][0]
        assert insert_call["organization_id"] == str(org_id)
        assert insert_call["tier"] == "reconcile"
        assert insert_call["plan"] == "growth_v2"
        assert insert_call["status"] == "trialing"
        assert insert_call["stripe_subscription_id"] == "sub_new_trial_123"
        assert insert_call["billing_model"] == "subscription"

        assert result is not None
        assert result.status == BillingSubscriptionStatus.TRIALING

    @pytest.mark.asyncio
    async def test_rejects_legacy_trial_tier(self, subscription_service):
        """Verify legacy tier inputs are rejected."""
        org_id = uuid4()
        with pytest.raises(ValueError, match="only active subscription tier"):
            await subscription_service.create_trial_subscription(
                organization_id=org_id,
                tier_id="growth",
                stripe_customer_id="cus_growth_v2",
            )


class TestUpgradeSubscription:
    """Test upgrade_subscription method."""

    @pytest.mark.asyncio
    async def test_upgrade_applies_proration(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify legacy plan upgrades no longer mutate Stripe prices."""
        org_id = sample_subscription.organization_id
        new_plan = SubscriptionPlan.PROFESSIONAL

        with (
            patch("stripe.Subscription.retrieve") as mock_retrieve,
            patch("stripe.Subscription.modify") as mock_modify,
        ):
            with pytest.raises(
                ValueError, match="Plan changes are no longer supported"
            ):
                await subscription_service.upgrade_subscription(org_id, new_plan)

            mock_retrieve.assert_not_called()
            mock_modify.assert_not_called()

    @pytest.mark.asyncio
    async def test_upgrade_no_subscription_raises_error(
        self, subscription_service, mock_db
    ):
        """Verify error when no subscription exists."""
        org_id = uuid4()

        with pytest.raises(ValueError, match="Plan changes are no longer supported"):
            await subscription_service.upgrade_subscription(
                org_id, SubscriptionPlan.PROFESSIONAL
            )

    @pytest.mark.asyncio
    async def test_upgrade_free_plan_raises_error(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify error when upgrading from free plan."""
        org_id = sample_subscription.organization_id

        with pytest.raises(ValueError, match="Plan changes are no longer supported"):
            await subscription_service.upgrade_subscription(
                org_id, SubscriptionPlan.GROWTH
            )


class TestDowngradeSubscription:
    """Test downgrade_subscription method."""

    @pytest.mark.asyncio
    async def test_downgrade_no_proration(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify legacy plan downgrades no longer mutate Stripe prices."""
        org_id = sample_subscription.organization_id
        new_plan = SubscriptionPlan.GROWTH

        with (
            patch("stripe.Subscription.retrieve") as mock_retrieve,
            patch("stripe.Subscription.modify") as mock_modify,
        ):
            with pytest.raises(
                ValueError, match="Plan changes are no longer supported"
            ):
                await subscription_service.downgrade_subscription(org_id, new_plan)

            mock_retrieve.assert_not_called()
            mock_modify.assert_not_called()

    @pytest.mark.asyncio
    async def test_downgrade_no_subscription_raises_error(
        self, subscription_service, mock_db
    ):
        """Verify error when no active subscription."""
        org_id = uuid4()

        with pytest.raises(ValueError, match="Plan changes are no longer supported"):
            await subscription_service.downgrade_subscription(
                org_id, SubscriptionPlan.GROWTH
            )


class TestCancelSubscription:
    """Test cancel_subscription method."""

    @pytest.mark.asyncio
    async def test_cancel_at_period_end(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify cancel at period end schedules cancellation."""
        org_id = sample_subscription.organization_id

        # Mock get_subscription
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = sample_subscription.model_dump(
            mode="json"
        )

        with patch("stripe.Subscription.modify") as mock_modify:
            # Execute
            await subscription_service.cancel_subscription(org_id, at_period_end=True)

            # Verify Stripe modify called with cancel_at_period_end
            mock_modify.assert_called_once_with(
                "sub_test456",
                cancel_at_period_end=True,
                metadata={"app": "capveri"},
            )

        # Verify database updated
        update_call = mock_db.table.return_value.update.call_args[0][0]
        assert update_call["cancel_at_period_end"] is True

    @pytest.mark.asyncio
    async def test_cancel_immediately(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify immediate cancellation."""
        org_id = sample_subscription.organization_id

        # Mock get_subscription
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = sample_subscription.model_dump(
            mode="json"
        )

        with patch("stripe.Subscription.delete") as mock_delete:
            # Execute
            await subscription_service.cancel_subscription(org_id, at_period_end=False)

            # Verify Stripe delete called
            mock_delete.assert_called_once_with("sub_test456")

        # Verify database updated with CANCELED status
        update_call = mock_db.table.return_value.update.call_args[0][0]
        assert update_call["status"] == BillingSubscriptionStatus.CANCELED.value
        assert update_call["cancel_at_period_end"] is False

    @pytest.mark.asyncio
    async def test_cancel_no_subscription_raises_error(
        self, subscription_service, mock_db
    ):
        """Verify error when no subscription exists (line 138)."""
        org_id = uuid4()

        # Mock get_subscription returning None
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            None
        )

        # Execute and verify exception
        with pytest.raises(ValueError, match="No active subscription found"):
            await subscription_service.cancel_subscription(org_id, at_period_end=True)


class TestResumeSubscription:
    """Test resume_subscription method."""

    @pytest.mark.asyncio
    async def test_resume_scheduled_cancellation(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify resume works for scheduled cancellations."""
        org_id = sample_subscription.organization_id

        # Mock subscription with cancel_at_period_end
        sub_data = sample_subscription.model_dump(mode="json")
        sub_data["cancel_at_period_end"] = True
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            sub_data
        )

        with patch("stripe.Subscription.modify") as mock_modify:
            # Execute
            await subscription_service.resume_subscription(org_id)

            # Verify Stripe modify called to remove cancellation
            mock_modify.assert_called_once_with(
                "sub_test456",
                cancel_at_period_end=False,
                metadata={"app": "capveri"},
            )

        # Verify database updated
        update_call = mock_db.table.return_value.update.call_args[0][0]
        assert update_call["cancel_at_period_end"] is False

    @pytest.mark.asyncio
    async def test_resume_paused_subscription(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify paused subscriptions resume through Stripe's resume API."""
        org_id = sample_subscription.organization_id

        paused_data = sample_subscription.model_dump(mode="json")
        paused_data["status"] = BillingSubscriptionStatus.PAUSED.value
        resumed_start = int(datetime(2026, 4, 22, tzinfo=UTC).timestamp())
        resumed_end = int(datetime(2026, 5, 22, tzinfo=UTC).timestamp())

        execute_results = [
            MagicMock(data=paused_data),
            MagicMock(
                data={
                    **paused_data,
                    "status": BillingSubscriptionStatus.ACTIVE.value,
                    "current_period_start": datetime.fromtimestamp(
                        resumed_start, tz=UTC
                    ).isoformat(),
                    "current_period_end": datetime.fromtimestamp(
                        resumed_end, tz=UTC
                    ).isoformat(),
                }
            ),
        ]
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = (
            execute_results
        )

        with patch("stripe.Subscription.resume") as mock_resume:
            mock_resume.return_value = {
                "status": "active",
                "cancel_at_period_end": False,
                "current_period_start": resumed_start,
                "current_period_end": resumed_end,
            }

            result = await subscription_service.resume_subscription(org_id)

            mock_resume.assert_called_once_with(
                "sub_test456",
                billing_cycle_anchor="now",
            )

        update_call = mock_db.table.return_value.update.call_args[0][0]
        assert update_call["status"] == BillingSubscriptionStatus.ACTIVE.value
        assert update_call["cancel_at_period_end"] is False
        assert result.status == BillingSubscriptionStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_resume_not_scheduled_raises_error(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify error when subscription not scheduled for cancellation."""
        org_id = sample_subscription.organization_id

        # Mock subscription without cancel_at_period_end
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = sample_subscription.model_dump(
            mode="json"
        )

        # Execute and verify exception
        with pytest.raises(
            ValueError, match="Subscription is not paused or scheduled for cancellation"
        ):
            await subscription_service.resume_subscription(org_id)

    @pytest.mark.asyncio
    async def test_resume_no_subscription_raises_error(
        self, subscription_service, mock_db
    ):
        """Verify error when no subscription exists (line 170)."""
        org_id = uuid4()

        # Mock get_subscription returning None
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            None
        )

        # Execute and verify exception
        with pytest.raises(ValueError, match="No subscription found"):
            await subscription_service.resume_subscription(org_id)


class TestEdgeCases:
    """Test edge cases where get_subscription returns None after update."""

    @pytest.mark.asyncio
    async def test_upgrade_returns_none_after_update(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify error when get_subscription returns None after upgrade (line 97)."""
        org_id = sample_subscription.organization_id
        original_data = sample_subscription.model_dump(mode="json")

        # Track execute() calls and return different data
        execute_call_count = [0]

        def execute_side_effect():
            execute_call_count[0] += 1
            result = MagicMock()
            if execute_call_count[0] == 1:
                result.data = original_data
            else:
                result.data = None  # Second call returns None
            return result

        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = (
            execute_side_effect
        )

        with (
            patch("stripe.Subscription.retrieve") as mock_retrieve,
            patch("stripe.Subscription.modify"),
        ):
            mock_stripe_sub = MagicMock()
            mock_stripe_sub.__getitem__.side_effect = lambda key: {
                "items": {"data": [{"id": "si_test789"}]}
            }.get(key)
            mock_retrieve.return_value = mock_stripe_sub

            with pytest.raises(
                ValueError, match="Plan changes are no longer supported"
            ):
                await subscription_service.upgrade_subscription(
                    org_id, SubscriptionPlan.PROFESSIONAL
                )

    @pytest.mark.asyncio
    async def test_downgrade_returns_none_after_update(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify error when get_subscription returns None after downgrade (line 134)."""
        org_id = sample_subscription.organization_id
        original_data = sample_subscription.model_dump(mode="json")

        execute_call_count = [0]

        def execute_side_effect():
            execute_call_count[0] += 1
            result = MagicMock()
            if execute_call_count[0] == 1:
                result.data = original_data
            else:
                result.data = None
            return result

        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = (
            execute_side_effect
        )

        with (
            patch("stripe.Subscription.retrieve") as mock_retrieve,
            patch("stripe.Subscription.modify"),
        ):
            mock_stripe_sub = MagicMock()
            mock_stripe_sub.__getitem__.side_effect = lambda key: {
                "items": {"data": [{"id": "si_test789"}]}
            }.get(key)
            mock_retrieve.return_value = mock_stripe_sub

            with pytest.raises(
                ValueError, match="Plan changes are no longer supported"
            ):
                await subscription_service.downgrade_subscription(
                    org_id, SubscriptionPlan.GROWTH
                )

    @pytest.mark.asyncio
    async def test_cancel_returns_none_after_update(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify error when get_subscription returns None after cancel (line 175)."""
        org_id = sample_subscription.organization_id
        original_data = sample_subscription.model_dump(mode="json")

        execute_call_count = [0]

        def execute_side_effect():
            execute_call_count[0] += 1
            result = MagicMock()
            if execute_call_count[0] == 1:
                result.data = original_data
            else:
                result.data = None
            return result

        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = (
            execute_side_effect
        )

        with patch("stripe.Subscription.modify"):
            with pytest.raises(
                ValueError, match="Failed to retrieve updated subscription"
            ):
                await subscription_service.cancel_subscription(
                    org_id, at_period_end=True
                )

    @pytest.mark.asyncio
    async def test_resume_returns_none_after_update(
        self, subscription_service, mock_db, sample_subscription
    ):
        """Verify error when get_subscription returns None after resume (line 202)."""
        org_id = sample_subscription.organization_id
        original_data = sample_subscription.model_dump(mode="json")
        original_data["cancel_at_period_end"] = True

        execute_call_count = [0]

        def execute_side_effect():
            execute_call_count[0] += 1
            result = MagicMock()
            if execute_call_count[0] == 1:
                result.data = original_data
            else:
                result.data = None
            return result

        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = (
            execute_side_effect
        )

        with patch("stripe.Subscription.modify"):
            with pytest.raises(
                ValueError, match="Failed to retrieve updated subscription"
            ):
                await subscription_service.resume_subscription(org_id)
