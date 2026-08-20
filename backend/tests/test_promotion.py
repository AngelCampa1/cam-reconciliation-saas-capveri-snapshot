"""Tests for Promotion domain models.

These tests verify that the Pydantic models correctly validate
promotion data, including discount types, percentage validation,
code uppercasing, and redemption tracking.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.promotion import (
    DiscountType,
    Promotion,
    PromotionCreate,
    PromotionRedemption,
    PromotionStatus,
    PromotionSummary,
    PromotionUpdate,
)


def make_valid_promotion_data() -> dict:
    """Create valid promotion data for testing."""
    now = datetime.now(UTC)
    return {
        "code": "SUMMER2024",
        "name": "Summer Sale",
        "description": "20% off for summer",
        "discount_type": DiscountType.PERCENTAGE,
        "discount_value": Decimal("20"),
        "duration_months": 3,
        "max_redemptions": 100,
        "valid_from": now,
        "valid_until": now + timedelta(days=90),
        "eligibility_rules": {"new_customers_only": True},
    }


class TestDiscountType:
    """Tests for DiscountType enum."""

    def test_enum_values(self) -> None:
        """DiscountType has correct values."""
        assert DiscountType.PERCENTAGE.value == "percentage"
        assert DiscountType.FIXED_AMOUNT.value == "fixed_amount"
        assert DiscountType.FREE_TRIAL_EXTENSION.value == "free_trial_extension"


class TestPromotionStatus:
    """Tests for PromotionStatus enum."""

    def test_enum_values(self) -> None:
        """PromotionStatus has correct values."""
        assert PromotionStatus.ACTIVE.value == "active"
        assert PromotionStatus.EXPIRED.value == "expired"
        assert PromotionStatus.EXHAUSTED.value == "exhausted"
        assert PromotionStatus.DISABLED.value == "disabled"


class TestPromotionBase:
    """Tests for PromotionBase validation."""

    def test_valid_promotion_data(self) -> None:
        """Valid promotion data is accepted."""
        data = make_valid_promotion_data()
        promo = PromotionCreate(**data)
        assert promo.code == "SUMMER2024"
        assert promo.name == "Summer Sale"
        assert promo.discount_value == Decimal("20")

    def test_code_uppercased(self) -> None:
        """Promotion code is automatically uppercased."""
        data = make_valid_promotion_data()
        data["code"] = "lowercase"
        promo = PromotionCreate(**data)
        assert promo.code == "LOWERCASE"

    def test_code_min_length(self) -> None:
        """Code must be at least 3 characters."""
        data = make_valid_promotion_data()
        data["code"] = "AB"
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**data)
        assert "at least 3" in str(exc_info.value)

    def test_code_max_length(self) -> None:
        """Code cannot exceed 50 characters."""
        data = make_valid_promotion_data()
        data["code"] = "x" * 51
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**data)
        assert "50" in str(exc_info.value)

    def test_name_required(self) -> None:
        """Name field is required."""
        data = make_valid_promotion_data()
        del data["name"]
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**data)
        assert "name" in str(exc_info.value)

    def test_description_optional(self) -> None:
        """Description is optional."""
        data = make_valid_promotion_data()
        del data["description"]
        promo = PromotionCreate(**data)
        assert promo.description is None

    def test_discount_value_must_be_positive(self) -> None:
        """Discount value must be greater than 0."""
        data = make_valid_promotion_data()
        data["discount_value"] = Decimal("0")
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**data)
        assert "greater than 0" in str(exc_info.value)

    def test_percentage_cannot_exceed_100(self) -> None:
        """Percentage discount cannot exceed 100%."""
        data = make_valid_promotion_data()
        data["discount_type"] = DiscountType.PERCENTAGE
        data["discount_value"] = Decimal("150")
        with pytest.raises(ValueError) as exc_info:
            PromotionCreate(**data)
        assert "cannot exceed 100" in str(exc_info.value)

    def test_percentage_at_100_is_valid(self) -> None:
        """Percentage discount at exactly 100% is valid."""
        data = make_valid_promotion_data()
        data["discount_type"] = DiscountType.PERCENTAGE
        data["discount_value"] = Decimal("100")
        promo = PromotionCreate(**data)
        assert promo.discount_value == Decimal("100")

    def test_fixed_amount_can_exceed_100(self) -> None:
        """Fixed amount discounts can exceed 100."""
        data = make_valid_promotion_data()
        data["discount_type"] = DiscountType.FIXED_AMOUNT
        data["discount_value"] = Decimal("500")
        promo = PromotionCreate(**data)
        assert promo.discount_value == Decimal("500")

    def test_duration_months_range(self) -> None:
        """Duration months must be between 1 and 36."""
        data = make_valid_promotion_data()

        # Below minimum
        data["duration_months"] = 0
        with pytest.raises(ValidationError):
            PromotionCreate(**data)

        # Above maximum
        data["duration_months"] = 37
        with pytest.raises(ValidationError):
            PromotionCreate(**data)

        # At bounds
        data["duration_months"] = 1
        promo = PromotionCreate(**data)
        assert promo.duration_months == 1

        data["duration_months"] = 36
        promo = PromotionCreate(**data)
        assert promo.duration_months == 36

    def test_max_redemptions_optional(self) -> None:
        """max_redemptions is optional (unlimited)."""
        data = make_valid_promotion_data()
        del data["max_redemptions"]
        promo = PromotionCreate(**data)
        assert promo.max_redemptions is None

    def test_max_redemptions_must_be_positive(self) -> None:
        """max_redemptions must be at least 1."""
        data = make_valid_promotion_data()
        data["max_redemptions"] = 0
        with pytest.raises(ValidationError):
            PromotionCreate(**data)

    def test_valid_from_required(self) -> None:
        """valid_from is required."""
        data = make_valid_promotion_data()
        del data["valid_from"]
        with pytest.raises(ValidationError):
            PromotionCreate(**data)

    def test_valid_until_optional(self) -> None:
        """valid_until is optional."""
        data = make_valid_promotion_data()
        del data["valid_until"]
        promo = PromotionCreate(**data)
        assert promo.valid_until is None

    def test_eligibility_rules_defaults_to_empty(self) -> None:
        """eligibility_rules defaults to empty dict."""
        data = make_valid_promotion_data()
        del data["eligibility_rules"]
        promo = PromotionCreate(**data)
        assert promo.eligibility_rules == {}


class TestPromotionCreate:
    """Tests for PromotionCreate DTO."""

    def test_create_with_stripe(self) -> None:
        """Promotion can be created with Stripe coupon ID."""
        data = make_valid_promotion_data()
        promo = PromotionCreate(stripe_coupon_id="stripe_123", **data)
        assert promo.stripe_coupon_id == "stripe_123"

    def test_create_without_stripe(self) -> None:
        """Promotion can be created without Stripe integration."""
        data = make_valid_promotion_data()
        promo = PromotionCreate(**data)
        assert promo.stripe_coupon_id is None


class TestPromotionUpdate:
    """Tests for PromotionUpdate DTO."""

    def test_all_fields_optional(self) -> None:
        """All fields are optional in update."""
        update = PromotionUpdate()
        assert update.name is None
        assert update.description is None
        assert update.status is None

    def test_partial_update_name(self) -> None:
        """Only name can be updated."""
        update = PromotionUpdate(name="New Name")
        assert update.name == "New Name"
        assert update.description is None

    def test_partial_update_status(self) -> None:
        """Only status can be updated."""
        update = PromotionUpdate(status=PromotionStatus.DISABLED)
        assert update.status == PromotionStatus.DISABLED
        assert update.name is None

    def test_update_validations_apply(self) -> None:
        """Field validations apply to update."""
        # Name too short
        with pytest.raises(ValidationError):
            PromotionUpdate(name="")

        # Name too long
        with pytest.raises(ValidationError):
            PromotionUpdate(name="x" * 101)


class TestPromotion:
    """Tests for full Promotion model."""

    def test_full_promotion(self) -> None:
        """Promotion model includes all fields."""
        promo_id = uuid4()
        now = datetime.now(UTC)
        data = make_valid_promotion_data()
        promo = Promotion(
            id=promo_id,
            current_redemptions=15,
            stripe_coupon_id="stripe_123",
            status=PromotionStatus.ACTIVE,
            created_at=now,
            updated_at=now,
            **data,
        )
        assert promo.id == promo_id
        assert promo.current_redemptions == 15
        assert promo.status == PromotionStatus.ACTIVE

    def test_defaults(self) -> None:
        """Promotion has correct defaults."""
        now = datetime.now(UTC)
        data = make_valid_promotion_data()
        promo = Promotion(
            id=uuid4(),
            created_at=now,
            updated_at=now,
            **data,
        )
        assert promo.current_redemptions == 0
        assert promo.status == PromotionStatus.ACTIVE

    def test_from_attributes(self) -> None:
        """Promotion can be created from ORM attributes."""

        class MockORM:
            def __init__(self) -> None:
                self.id = uuid4()
                self.code = "TESTCODE"
                self.name = "Test Promotion"
                self.description = "Test description"
                self.discount_type = "percentage"
                self.discount_value = Decimal("25")
                self.duration_months = 6
                self.max_redemptions = 50
                self.valid_from = datetime.now(UTC)
                self.valid_until = datetime.now(UTC) + timedelta(days=180)
                self.eligibility_rules = {}
                self.current_redemptions = 10
                self.stripe_coupon_id = None
                self.status = "active"
                self.created_at = datetime.now(UTC)
                self.updated_at = datetime.now(UTC)

        orm_obj = MockORM()
        promo = Promotion.model_validate(orm_obj)
        assert promo.code == "TESTCODE"
        assert promo.current_redemptions == 10


class TestPromotionRedemption:
    """Tests for PromotionRedemption model."""

    def test_redemption_creation(self) -> None:
        """Redemption can be created with required fields."""
        redemption = PromotionRedemption(
            id=uuid4(),
            promotion_id=uuid4(),
            organization_id=uuid4(),
            redeemed_at=datetime.now(UTC),
        )
        assert redemption.stripe_discount_id is None

    def test_redemption_with_stripe(self) -> None:
        """Redemption can include Stripe discount ID."""
        redemption = PromotionRedemption(
            id=uuid4(),
            promotion_id=uuid4(),
            organization_id=uuid4(),
            redeemed_at=datetime.now(UTC),
            stripe_discount_id="stripe_discount_123",
        )
        assert redemption.stripe_discount_id == "stripe_discount_123"


class TestPromotionSummary:
    """Tests for PromotionSummary model."""

    def test_summary_fields(self) -> None:
        """Summary contains essential fields."""
        summary = PromotionSummary(
            id=uuid4(),
            code="SALE50",
            name="50% Off Sale",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("50"),
            status=PromotionStatus.ACTIVE,
            current_redemptions=25,
            max_redemptions=100,
            valid_until=datetime.now(UTC) + timedelta(days=30),
        )
        assert summary.code == "SALE50"
        assert summary.current_redemptions == 25

    def test_summary_unlimited_redemptions(self) -> None:
        """Summary handles unlimited redemptions."""
        summary = PromotionSummary(
            id=uuid4(),
            code="UNLIMITED",
            name="Unlimited Promo",
            discount_type=DiscountType.FIXED_AMOUNT,
            discount_value=Decimal("10"),
            status=PromotionStatus.ACTIVE,
            current_redemptions=500,
            max_redemptions=None,
            valid_until=None,
        )
        assert summary.max_redemptions is None
        assert summary.valid_until is None


class TestImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """Promotion models can be imported from app.models."""
        from app.models import (
            DiscountType,
            Promotion,
            PromotionCreate,
            PromotionRedemption,
            PromotionStatus,
            PromotionSummary,
            PromotionUpdate,
        )

        assert Promotion is not None
        assert PromotionCreate is not None
        assert PromotionUpdate is not None
        assert PromotionRedemption is not None
        assert PromotionSummary is not None
        assert DiscountType is not None
        assert PromotionStatus is not None
