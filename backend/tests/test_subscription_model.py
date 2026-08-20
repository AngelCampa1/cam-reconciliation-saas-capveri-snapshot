"""Tests for Subscription domain models.

Validates BillingSubscriptionStatus, SubscriptionPlan enums, and all
Subscription Pydantic models for correct validation and serialization.

Current package IDs live in subscription metadata. The legacy plan enum keeps
growth_v2 for self-serve compatibility and enterprise for custom pricing.
"""

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.subscription import (
    BillingSubscriptionStatus,
    Subscription,
    SubscriptionCreate,
    SubscriptionPlan,
    SubscriptionSummary,
    SubscriptionUpdate,
)

# =============================================================================
# BillingSubscriptionStatus Enum Tests
# =============================================================================


class TestBillingSubscriptionStatusEnum:
    """Tests for BillingSubscriptionStatus enumeration."""

    def test_trialing_value(self) -> None:
        """Trialing status has correct value."""
        assert BillingSubscriptionStatus.TRIALING.value == "trialing"

    def test_active_value(self) -> None:
        """Active status has correct value."""
        assert BillingSubscriptionStatus.ACTIVE.value == "active"

    def test_past_due_value(self) -> None:
        """Past due status has correct value."""
        assert BillingSubscriptionStatus.PAST_DUE.value == "past_due"

    def test_canceled_value(self) -> None:
        """Canceled status has correct value."""
        assert BillingSubscriptionStatus.CANCELED.value == "canceled"

    def test_paused_value(self) -> None:
        """Paused status has correct value."""
        assert BillingSubscriptionStatus.PAUSED.value == "paused"

    def test_has_five_statuses(self) -> None:
        """Enum has exactly five status values."""
        assert len(BillingSubscriptionStatus) == 5

    def test_enum_is_string_subclass(self) -> None:
        """BillingSubscriptionStatus is a str subclass for JSON serialization."""
        assert issubclass(BillingSubscriptionStatus, str)

    def test_can_compare_with_string(self) -> None:
        """Enum values can be compared with string literals."""
        assert BillingSubscriptionStatus.ACTIVE == "active"
        assert BillingSubscriptionStatus.TRIALING == "trialing"

    def test_all_values_are_lowercase(self) -> None:
        """All enum values are lowercase."""
        for status in BillingSubscriptionStatus:
            assert status.value == status.value.lower()


# =============================================================================
# SubscriptionPlan Enum Tests
# =============================================================================


class TestSubscriptionPlanEnum:
    """Tests for SubscriptionPlan enumeration."""

    def test_growth_value(self) -> None:
        """Growth plan has correct value."""
        assert SubscriptionPlan.GROWTH.value == "growth"

    def test_essentials_value(self) -> None:
        """Essentials plan has correct value."""
        assert SubscriptionPlan.ESSENTIALS.value == "essentials"

    def test_professional_value(self) -> None:
        """Professional plan has correct value."""
        assert SubscriptionPlan.PROFESSIONAL.value == "professional"

    def test_has_current_and_legacy_plans(self) -> None:
        """Enum has all legacy flat-tier plans plus current per-building plans."""
        legacy_per_building = {"essentials", "professional", "growth"}
        legacy_flat_tier = {"starter", "pro", "business"}
        current = {"growth_v2", "portfolio", "enterprise"}
        all_values = {p.value for p in SubscriptionPlan}
        assert legacy_per_building.issubset(all_values)
        assert legacy_flat_tier.issubset(all_values)
        assert current.issubset(all_values)

    def test_enum_is_string_subclass(self) -> None:
        """SubscriptionPlan is a str subclass for JSON serialization."""
        assert issubclass(SubscriptionPlan, str)

    def test_can_compare_with_string(self) -> None:
        """Enum values can be compared with string literals."""
        assert SubscriptionPlan.GROWTH == "growth"
        assert SubscriptionPlan.ESSENTIALS == "essentials"

    def test_all_values_are_lowercase(self) -> None:
        """All enum values are lowercase."""
        for plan in SubscriptionPlan:
            assert plan.value == plan.value.lower()


# =============================================================================
# SubscriptionCreate Model Tests
# =============================================================================


class TestSubscriptionCreateModel:
    """Tests for SubscriptionCreate DTO."""

    def test_minimal_create(self) -> None:
        """Create with only required fields."""
        org_id = uuid4()
        create = SubscriptionCreate(
            organization_id=org_id,
            plan=SubscriptionPlan.GROWTH,
        )
        assert create.organization_id == org_id
        assert create.plan == SubscriptionPlan.GROWTH
        assert create.status == BillingSubscriptionStatus.TRIALING  # Default
        assert create.building_count == 1  # Default
        assert create.stripe_subscription_id is None
        assert create.stripe_customer_id is None

    def test_create_with_all_fields(self) -> None:
        """Create with all fields populated."""
        org_id = uuid4()
        create = SubscriptionCreate(
            organization_id=org_id,
            plan=SubscriptionPlan.PROFESSIONAL,
            status=BillingSubscriptionStatus.ACTIVE,
            building_count=75,
            stripe_subscription_id="sub_1234567890",
            stripe_customer_id="cus_0987654321",
        )
        assert create.status == BillingSubscriptionStatus.ACTIVE
        assert create.building_count == 75
        assert create.stripe_subscription_id == "sub_1234567890"
        assert create.stripe_customer_id == "cus_0987654321"

    def test_create_requires_organization_id(self) -> None:
        """Organization ID is required."""
        with pytest.raises(ValidationError) as exc_info:
            SubscriptionCreate(plan=SubscriptionPlan.GROWTH)  # type: ignore
        assert "organization_id" in str(exc_info.value)

    def test_create_requires_plan(self) -> None:
        """Plan is required."""
        with pytest.raises(ValidationError) as exc_info:
            SubscriptionCreate(organization_id=uuid4())  # type: ignore
        assert "plan" in str(exc_info.value)

    def test_create_rejects_invalid_plan(self) -> None:
        """Invalid plan value is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            SubscriptionCreate(
                organization_id=uuid4(),
                plan="invalid_plan",  # type: ignore
            )
        assert "plan" in str(exc_info.value)

    def test_create_rejects_invalid_status(self) -> None:
        """Invalid status value is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            SubscriptionCreate(
                organization_id=uuid4(),
                plan=SubscriptionPlan.GROWTH,
                status="invalid_status",  # type: ignore
            )
        assert "status" in str(exc_info.value)

    def test_create_rejects_zero_building_count(self) -> None:
        """Building count must be at least 1."""
        with pytest.raises(ValidationError) as exc_info:
            SubscriptionCreate(
                organization_id=uuid4(),
                plan=SubscriptionPlan.GROWTH,
                building_count=0,
            )
        assert "building_count" in str(exc_info.value)

    def test_create_serializes_to_json(self) -> None:
        """SubscriptionCreate serializes to JSON correctly."""
        create = SubscriptionCreate(
            organization_id=uuid4(),
            plan=SubscriptionPlan.GROWTH,
            status=BillingSubscriptionStatus.TRIALING,
            building_count=5,
        )
        json_str = create.model_dump_json()
        data = json.loads(json_str)
        assert data["plan"] == "growth"
        assert data["status"] == "trialing"
        assert data["building_count"] == 5


# =============================================================================
# SubscriptionUpdate Model Tests
# =============================================================================


class TestSubscriptionUpdateModel:
    """Tests for SubscriptionUpdate DTO."""

    def test_empty_update(self) -> None:
        """Update with no fields is valid."""
        update = SubscriptionUpdate()
        assert update.plan is None
        assert update.status is None
        assert update.building_count is None
        assert update.stripe_subscription_id is None
        assert update.cancel_at_period_end is None

    def test_update_plan_only(self) -> None:
        """Update only the plan."""
        update = SubscriptionUpdate(plan=SubscriptionPlan.PROFESSIONAL)
        assert update.plan == SubscriptionPlan.PROFESSIONAL
        assert update.status is None

    def test_update_status_only(self) -> None:
        """Update only the status."""
        update = SubscriptionUpdate(status=BillingSubscriptionStatus.CANCELED)
        assert update.status == BillingSubscriptionStatus.CANCELED
        assert update.plan is None

    def test_update_building_count(self) -> None:
        """Update building count."""
        update = SubscriptionUpdate(building_count=25)
        assert update.building_count == 25

    def test_update_cancel_at_period_end(self) -> None:
        """Update cancel_at_period_end flag."""
        update = SubscriptionUpdate(cancel_at_period_end=True)
        assert update.cancel_at_period_end is True

    def test_update_stripe_subscription_id(self) -> None:
        """Update Stripe subscription ID."""
        update = SubscriptionUpdate(stripe_subscription_id="sub_new123")
        assert update.stripe_subscription_id == "sub_new123"

    def test_update_multiple_fields(self) -> None:
        """Update multiple fields at once."""
        update = SubscriptionUpdate(
            plan=SubscriptionPlan.PROFESSIONAL,
            status=BillingSubscriptionStatus.ACTIVE,
            building_count=60,
            cancel_at_period_end=False,
        )
        assert update.plan == SubscriptionPlan.PROFESSIONAL
        assert update.status == BillingSubscriptionStatus.ACTIVE
        assert update.building_count == 60
        assert update.cancel_at_period_end is False

    def test_update_rejects_invalid_plan(self) -> None:
        """Invalid plan value is rejected."""
        with pytest.raises(ValidationError):
            SubscriptionUpdate(plan="bad_plan")  # type: ignore

    def test_update_rejects_invalid_status(self) -> None:
        """Invalid status value is rejected."""
        with pytest.raises(ValidationError):
            SubscriptionUpdate(status="bad_status")  # type: ignore


# =============================================================================
# Subscription Model Tests
# =============================================================================


class TestSubscriptionModel:
    """Tests for full Subscription model."""

    @pytest.fixture
    def valid_subscription_data(self) -> dict:
        """Provide valid subscription data."""
        now = datetime.now(UTC)
        return {
            "id": uuid4(),
            "organization_id": uuid4(),
            "plan": SubscriptionPlan.GROWTH,
            "status": BillingSubscriptionStatus.ACTIVE,
            "building_count": 10,
            "stripe_subscription_id": "sub_abc123",
            "stripe_customer_id": "cus_xyz789",
            "current_period_start": now,
            "current_period_end": now,
            "cancel_at_period_end": False,
            "created_at": now,
            "updated_at": now,
        }

    def test_create_full_subscription(self, valid_subscription_data: dict) -> None:
        """Create subscription with all fields."""
        subscription = Subscription(**valid_subscription_data)
        assert subscription.id == valid_subscription_data["id"]
        assert (
            subscription.organization_id == valid_subscription_data["organization_id"]
        )
        assert subscription.plan == SubscriptionPlan.GROWTH
        assert subscription.status == BillingSubscriptionStatus.ACTIVE
        assert subscription.building_count == 10
        assert subscription.stripe_subscription_id == "sub_abc123"
        assert subscription.stripe_customer_id == "cus_xyz789"
        assert subscription.cancel_at_period_end is False

    def test_subscription_without_stripe_ids(self) -> None:
        """Create subscription without Stripe IDs (trial or manual)."""
        now = datetime.now(UTC)
        subscription = Subscription(
            id=uuid4(),
            organization_id=uuid4(),
            plan=SubscriptionPlan.GROWTH,
            status=BillingSubscriptionStatus.TRIALING,
            building_count=5,
            stripe_subscription_id=None,
            stripe_customer_id=None,
            current_period_start=now,
            current_period_end=now,
            cancel_at_period_end=False,
            created_at=now,
            updated_at=now,
        )
        assert subscription.stripe_subscription_id is None
        assert subscription.stripe_customer_id is None

    def test_subscription_requires_id(self, valid_subscription_data: dict) -> None:
        """Subscription requires ID."""
        del valid_subscription_data["id"]
        with pytest.raises(ValidationError) as exc_info:
            Subscription(**valid_subscription_data)
        assert "id" in str(exc_info.value)

    def test_subscription_requires_organization_id(
        self, valid_subscription_data: dict
    ) -> None:
        """Subscription requires organization_id."""
        del valid_subscription_data["organization_id"]
        with pytest.raises(ValidationError) as exc_info:
            Subscription(**valid_subscription_data)
        assert "organization_id" in str(exc_info.value)

    def test_subscription_building_count_defaults_to_one(
        self, valid_subscription_data: dict
    ) -> None:
        """Subscription building_count defaults to 1 if not provided."""
        del valid_subscription_data["building_count"]
        subscription = Subscription(**valid_subscription_data)
        assert subscription.building_count == 1

    def test_subscription_requires_period_dates(
        self, valid_subscription_data: dict
    ) -> None:
        """Subscription requires period start and end dates."""
        del valid_subscription_data["current_period_start"]
        with pytest.raises(ValidationError) as exc_info:
            Subscription(**valid_subscription_data)
        assert "current_period_start" in str(exc_info.value)

    def test_subscription_requires_timestamps(
        self, valid_subscription_data: dict
    ) -> None:
        """Subscription requires created_at and updated_at."""
        del valid_subscription_data["created_at"]
        with pytest.raises(ValidationError) as exc_info:
            Subscription(**valid_subscription_data)
        assert "created_at" in str(exc_info.value)

    def test_subscription_serializes_to_json(
        self, valid_subscription_data: dict
    ) -> None:
        """Subscription serializes to JSON correctly."""
        subscription = Subscription(**valid_subscription_data)
        json_str = subscription.model_dump_json()
        data = json.loads(json_str)
        assert data["plan"] == "growth"
        assert data["status"] == "active"
        assert data["building_count"] == 10
        assert data["cancel_at_period_end"] is False
        assert "id" in data
        assert "organization_id" in data

    def test_subscription_from_attributes(self, valid_subscription_data: dict) -> None:
        """Subscription supports from_attributes for ORM mode."""

        # Simulate ORM object with attributes
        class MockORM:
            pass

        mock = MockORM()
        for key, value in valid_subscription_data.items():
            setattr(mock, key, value)

        subscription = Subscription.model_validate(mock)
        assert subscription.plan == SubscriptionPlan.GROWTH
        assert subscription.status == BillingSubscriptionStatus.ACTIVE
        assert subscription.building_count == 10


# =============================================================================
# SubscriptionSummary Model Tests
# =============================================================================


class TestSubscriptionSummaryModel:
    """Tests for SubscriptionSummary model."""

    def test_create_summary(self) -> None:
        """Create subscription summary with all fields."""
        now = datetime.now(UTC)
        summary = SubscriptionSummary(
            id=uuid4(),
            organization_id=uuid4(),
            plan=SubscriptionPlan.GROWTH,
            status=BillingSubscriptionStatus.TRIALING,
            building_count=5,
            current_period_end=now,
            cancel_at_period_end=False,
        )
        assert summary.plan == SubscriptionPlan.GROWTH
        assert summary.status == BillingSubscriptionStatus.TRIALING
        assert summary.building_count == 5
        assert summary.cancel_at_period_end is False

    def test_summary_requires_all_fields(self) -> None:
        """Summary requires all fields."""
        with pytest.raises(ValidationError):
            SubscriptionSummary(
                id=uuid4(),
                organization_id=uuid4(),
                plan=SubscriptionPlan.GROWTH,
                # Missing status, building_count, current_period_end, cancel_at_period_end
            )

    def test_summary_serializes_to_json(self) -> None:
        """Summary serializes to JSON correctly."""
        now = datetime.now(UTC)
        summary = SubscriptionSummary(
            id=uuid4(),
            organization_id=uuid4(),
            plan=SubscriptionPlan.PROFESSIONAL,
            status=BillingSubscriptionStatus.ACTIVE,
            building_count=100,
            current_period_end=now,
            cancel_at_period_end=True,
        )
        json_str = summary.model_dump_json()
        data = json.loads(json_str)
        assert data["plan"] == "professional"
        assert data["status"] == "active"
        assert data["building_count"] == 100
        assert data["cancel_at_period_end"] is True


# =============================================================================
# Cross-Model Consistency Tests
# =============================================================================


class TestSubscriptionModelConsistency:
    """Tests for consistency across subscription models."""

    def test_all_plans_in_create_and_update(self) -> None:
        """All plan values work in both Create and Update."""
        for plan in SubscriptionPlan:
            create = SubscriptionCreate(organization_id=uuid4(), plan=plan)
            assert create.plan == plan

            update = SubscriptionUpdate(plan=plan)
            assert update.plan == plan

    def test_all_statuses_in_create_and_update(self) -> None:
        """All status values work in both Create and Update."""
        for status in BillingSubscriptionStatus:
            create = SubscriptionCreate(
                organization_id=uuid4(),
                plan=SubscriptionPlan.GROWTH,
                status=status,
            )
            assert create.status == status

            update = SubscriptionUpdate(status=status)
            assert update.status == status

    def test_json_round_trip(self) -> None:
        """Subscription survives JSON round-trip."""
        now = datetime.now(UTC)
        original = Subscription(
            id=uuid4(),
            organization_id=uuid4(),
            plan=SubscriptionPlan.PROFESSIONAL,
            status=BillingSubscriptionStatus.ACTIVE,
            building_count=75,
            stripe_subscription_id="sub_test",
            stripe_customer_id="cus_test",
            current_period_start=now,
            current_period_end=now,
            cancel_at_period_end=False,
            created_at=now,
            updated_at=now,
        )
        json_str = original.model_dump_json()
        restored = Subscription.model_validate_json(json_str)
        assert restored.plan == original.plan
        assert restored.status == original.status
        assert restored.building_count == original.building_count
        assert restored.stripe_subscription_id == original.stripe_subscription_id
