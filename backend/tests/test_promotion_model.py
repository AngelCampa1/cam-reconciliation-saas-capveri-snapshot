"""Tests for Promotion domain models.

Tests cover DiscountType enum, PromotionStatus enum, and all Pydantic models
for promotional codes and coupon redemptions.
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


class TestDiscountTypeEnum:
    """Tests for DiscountType enum."""

    def test_discount_type_values(self):
        """Should have correct enum values."""
        assert DiscountType.PERCENTAGE == "percentage"
        assert DiscountType.FIXED_AMOUNT == "fixed_amount"
        assert DiscountType.FREE_TRIAL_EXTENSION == "free_trial_extension"

    def test_discount_type_member_count(self):
        """Should have exactly 3 members."""
        assert len(DiscountType) == 3

    def test_discount_type_is_string_enum(self):
        """Should be usable as string."""
        assert DiscountType.PERCENTAGE.value == "percentage"
        assert DiscountType.FIXED_AMOUNT == "fixed_amount"  # str Enum comparison


class TestPromotionStatusEnum:
    """Tests for PromotionStatus enum."""

    def test_promotion_status_values(self):
        """Should have correct enum values."""
        assert PromotionStatus.ACTIVE == "active"
        assert PromotionStatus.EXPIRED == "expired"
        assert PromotionStatus.EXHAUSTED == "exhausted"
        assert PromotionStatus.DISABLED == "disabled"

    def test_promotion_status_member_count(self):
        """Should have exactly 4 members."""
        assert len(PromotionStatus) == 4

    def test_promotion_status_is_string_enum(self):
        """Should be usable as string."""
        assert PromotionStatus.ACTIVE.value == "active"
        assert PromotionStatus.DISABLED == "disabled"  # str Enum comparison


class TestPromotionCreate:
    """Tests for PromotionCreate model."""

    @pytest.fixture
    def valid_data(self):
        """Return valid promotion creation data."""
        return {
            "code": "SAVE20",
            "name": "Save 20%",
            "discount_type": DiscountType.PERCENTAGE,
            "discount_value": Decimal("20"),
            "valid_from": datetime.now(UTC),
        }

    def test_create_valid_promotion(self, valid_data):
        """Should create promotion with valid data."""
        promo = PromotionCreate(**valid_data)
        assert promo.code == "SAVE20"
        assert promo.name == "Save 20%"
        assert promo.discount_type == DiscountType.PERCENTAGE
        assert promo.discount_value == Decimal("20")

    def test_code_uppercase_transformation(self, valid_data):
        """Should convert code to uppercase."""
        valid_data["code"] = "summer2024"
        promo = PromotionCreate(**valid_data)
        assert promo.code == "SUMMER2024"

    def test_code_minimum_length(self, valid_data):
        """Should reject code shorter than 3 characters."""
        valid_data["code"] = "AB"
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "code" in str(exc_info.value)

    def test_code_maximum_length(self, valid_data):
        """Should reject code longer than 50 characters."""
        valid_data["code"] = "A" * 51
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "code" in str(exc_info.value)

    def test_name_minimum_length(self, valid_data):
        """Should reject empty name."""
        valid_data["name"] = ""
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "name" in str(exc_info.value)

    def test_name_maximum_length(self, valid_data):
        """Should reject name longer than 100 characters."""
        valid_data["name"] = "A" * 101
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "name" in str(exc_info.value)

    def test_description_optional(self, valid_data):
        """Should allow None description."""
        promo = PromotionCreate(**valid_data)
        assert promo.description is None

    def test_description_provided(self, valid_data):
        """Should accept description."""
        valid_data["description"] = "Limited time offer"
        promo = PromotionCreate(**valid_data)
        assert promo.description == "Limited time offer"

    def test_description_maximum_length(self, valid_data):
        """Should reject description longer than 500 characters."""
        valid_data["description"] = "A" * 501
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "description" in str(exc_info.value)

    def test_percentage_cannot_exceed_100(self, valid_data):
        """Should reject percentage discount greater than 100."""
        valid_data["discount_type"] = DiscountType.PERCENTAGE
        valid_data["discount_value"] = Decimal("101")
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "100" in str(exc_info.value)

    def test_percentage_at_100_valid(self, valid_data):
        """Should accept 100% discount."""
        valid_data["discount_type"] = DiscountType.PERCENTAGE
        valid_data["discount_value"] = Decimal("100")
        promo = PromotionCreate(**valid_data)
        assert promo.discount_value == Decimal("100")

    def test_fixed_amount_can_exceed_100(self, valid_data):
        """Should accept fixed amount greater than 100."""
        valid_data["discount_type"] = DiscountType.FIXED_AMOUNT
        valid_data["discount_value"] = Decimal("500")
        promo = PromotionCreate(**valid_data)
        assert promo.discount_value == Decimal("500")

    def test_discount_value_must_be_positive(self, valid_data):
        """Should reject zero or negative discount value."""
        valid_data["discount_value"] = Decimal("0")
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "discount_value" in str(exc_info.value)

    def test_duration_months_optional(self, valid_data):
        """Should allow None duration_months."""
        promo = PromotionCreate(**valid_data)
        assert promo.duration_months is None

    def test_duration_months_valid_range(self, valid_data):
        """Should accept duration_months between 1 and 36."""
        valid_data["duration_months"] = 12
        promo = PromotionCreate(**valid_data)
        assert promo.duration_months == 12

    def test_duration_months_minimum(self, valid_data):
        """Should reject duration_months less than 1."""
        valid_data["duration_months"] = 0
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "duration_months" in str(exc_info.value)

    def test_duration_months_maximum(self, valid_data):
        """Should reject duration_months greater than 36."""
        valid_data["duration_months"] = 37
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "duration_months" in str(exc_info.value)

    def test_max_redemptions_optional(self, valid_data):
        """Should allow None max_redemptions (unlimited)."""
        promo = PromotionCreate(**valid_data)
        assert promo.max_redemptions is None

    def test_max_redemptions_valid(self, valid_data):
        """Should accept positive max_redemptions."""
        valid_data["max_redemptions"] = 100
        promo = PromotionCreate(**valid_data)
        assert promo.max_redemptions == 100

    def test_max_redemptions_minimum(self, valid_data):
        """Should reject max_redemptions less than 1."""
        valid_data["max_redemptions"] = 0
        with pytest.raises(ValidationError) as exc_info:
            PromotionCreate(**valid_data)
        assert "max_redemptions" in str(exc_info.value)

    def test_valid_until_optional(self, valid_data):
        """Should allow None valid_until (no expiration)."""
        promo = PromotionCreate(**valid_data)
        assert promo.valid_until is None

    def test_valid_until_provided(self, valid_data):
        """Should accept valid_until date."""
        future = datetime.now(UTC) + timedelta(days=30)
        valid_data["valid_until"] = future
        promo = PromotionCreate(**valid_data)
        assert promo.valid_until == future

    def test_eligibility_rules_default_empty(self, valid_data):
        """Should default eligibility_rules to empty dict."""
        promo = PromotionCreate(**valid_data)
        assert promo.eligibility_rules == {}

    def test_eligibility_rules_with_values(self, valid_data):
        """Should accept eligibility rules."""
        valid_data["eligibility_rules"] = {
            "new_customers_only": True,
            "first_n_users": 100,
        }
        promo = PromotionCreate(**valid_data)
        assert promo.eligibility_rules["new_customers_only"] is True
        assert promo.eligibility_rules["first_n_users"] == 100

    def test_stripe_coupon_id_optional(self, valid_data):
        """Should allow None stripe_coupon_id."""
        promo = PromotionCreate(**valid_data)
        assert promo.stripe_coupon_id is None

    def test_stripe_coupon_id_provided(self, valid_data):
        """Should accept stripe_coupon_id."""
        valid_data["stripe_coupon_id"] = "coup_abc123"
        promo = PromotionCreate(**valid_data)
        assert promo.stripe_coupon_id == "coup_abc123"

    def test_free_trial_extension_type(self, valid_data):
        """Should accept free trial extension discount type."""
        valid_data["discount_type"] = DiscountType.FREE_TRIAL_EXTENSION
        valid_data["discount_value"] = Decimal("14")  # 14 days
        promo = PromotionCreate(**valid_data)
        assert promo.discount_type == DiscountType.FREE_TRIAL_EXTENSION
        assert promo.discount_value == Decimal("14")


class TestPromotionUpdate:
    """Tests for PromotionUpdate model."""

    def test_all_fields_optional(self):
        """Should allow empty update."""
        update = PromotionUpdate()
        assert update.name is None
        assert update.description is None
        assert update.max_redemptions is None
        assert update.valid_until is None
        assert update.status is None
        assert update.eligibility_rules is None

    def test_update_name(self):
        """Should update name."""
        update = PromotionUpdate(name="New Name")
        assert update.name == "New Name"

    def test_update_name_validation(self):
        """Should validate name length."""
        with pytest.raises(ValidationError):
            PromotionUpdate(name="")

    def test_update_description(self):
        """Should update description."""
        update = PromotionUpdate(description="Updated description")
        assert update.description == "Updated description"

    def test_update_max_redemptions(self):
        """Should update max_redemptions."""
        update = PromotionUpdate(max_redemptions=50)
        assert update.max_redemptions == 50

    def test_update_valid_until(self):
        """Should update valid_until."""
        future = datetime.now(UTC) + timedelta(days=60)
        update = PromotionUpdate(valid_until=future)
        assert update.valid_until == future

    def test_update_status(self):
        """Should update status."""
        update = PromotionUpdate(status=PromotionStatus.DISABLED)
        assert update.status == PromotionStatus.DISABLED

    def test_update_eligibility_rules(self):
        """Should update eligibility_rules."""
        update = PromotionUpdate(eligibility_rules={"new_customers_only": False})
        assert update.eligibility_rules == {"new_customers_only": False}


class TestPromotion:
    """Tests for Promotion model."""

    @pytest.fixture
    def valid_data(self):
        """Return valid full promotion data."""
        now = datetime.now(UTC)
        return {
            "id": uuid4(),
            "code": "WELCOME50",
            "name": "Welcome Discount",
            "description": "50% off for new customers",
            "discount_type": DiscountType.PERCENTAGE,
            "discount_value": Decimal("50"),
            "duration_months": 3,
            "max_redemptions": 1000,
            "current_redemptions": 250,
            "valid_from": now,
            "valid_until": now + timedelta(days=90),
            "eligibility_rules": {"new_customers_only": True},
            "stripe_coupon_id": "coup_welcome50",
            "status": PromotionStatus.ACTIVE,
            "created_at": now,
            "updated_at": now,
        }

    def test_create_full_promotion(self, valid_data):
        """Should create promotion with all fields."""
        promo = Promotion(**valid_data)
        assert promo.id == valid_data["id"]
        assert promo.code == "WELCOME50"
        assert promo.name == "Welcome Discount"
        assert promo.discount_type == DiscountType.PERCENTAGE
        assert promo.discount_value == Decimal("50")
        assert promo.current_redemptions == 250
        assert promo.status == PromotionStatus.ACTIVE

    def test_current_redemptions_default(self, valid_data):
        """Should default current_redemptions to 0."""
        del valid_data["current_redemptions"]
        promo = Promotion(**valid_data)
        assert promo.current_redemptions == 0

    def test_current_redemptions_non_negative(self, valid_data):
        """Should reject negative current_redemptions."""
        valid_data["current_redemptions"] = -1
        with pytest.raises(ValidationError) as exc_info:
            Promotion(**valid_data)
        assert "current_redemptions" in str(exc_info.value)

    def test_status_default(self, valid_data):
        """Should default status to ACTIVE."""
        del valid_data["status"]
        promo = Promotion(**valid_data)
        assert promo.status == PromotionStatus.ACTIVE

    def test_from_attributes_config(self, valid_data):
        """Should have from_attributes=True for ORM compatibility."""
        assert Promotion.model_config.get("from_attributes") is True


class TestPromotionRedemption:
    """Tests for PromotionRedemption model."""

    @pytest.fixture
    def valid_data(self):
        """Return valid redemption data."""
        return {
            "id": uuid4(),
            "promotion_id": uuid4(),
            "organization_id": uuid4(),
            "redeemed_at": datetime.now(UTC),
            "stripe_discount_id": None,
        }

    def test_create_redemption(self, valid_data):
        """Should create redemption record."""
        redemption = PromotionRedemption(**valid_data)
        assert redemption.id == valid_data["id"]
        assert redemption.promotion_id == valid_data["promotion_id"]
        assert redemption.organization_id == valid_data["organization_id"]
        assert redemption.redeemed_at == valid_data["redeemed_at"]
        assert redemption.stripe_discount_id is None

    def test_redemption_with_stripe_discount(self, valid_data):
        """Should accept stripe_discount_id."""
        valid_data["stripe_discount_id"] = "di_abc123"
        redemption = PromotionRedemption(**valid_data)
        assert redemption.stripe_discount_id == "di_abc123"

    def test_from_attributes_config(self, valid_data):
        """Should have from_attributes=True for ORM compatibility."""
        assert PromotionRedemption.model_config.get("from_attributes") is True


class TestPromotionSummary:
    """Tests for PromotionSummary model."""

    @pytest.fixture
    def valid_data(self):
        """Return valid summary data."""
        return {
            "id": uuid4(),
            "code": "FLASH25",
            "name": "Flash Sale",
            "discount_type": DiscountType.PERCENTAGE,
            "discount_value": Decimal("25"),
            "status": PromotionStatus.ACTIVE,
            "current_redemptions": 50,
            "max_redemptions": 100,
            "valid_until": datetime.now(UTC) + timedelta(days=7),
        }

    def test_create_summary(self, valid_data):
        """Should create summary with essential fields."""
        summary = PromotionSummary(**valid_data)
        assert summary.id == valid_data["id"]
        assert summary.code == "FLASH25"
        assert summary.name == "Flash Sale"
        assert summary.discount_type == DiscountType.PERCENTAGE
        assert summary.discount_value == Decimal("25")
        assert summary.status == PromotionStatus.ACTIVE
        assert summary.current_redemptions == 50
        assert summary.max_redemptions == 100

    def test_summary_nullable_fields(self, valid_data):
        """Should accept None for optional fields."""
        valid_data["max_redemptions"] = None
        valid_data["valid_until"] = None
        summary = PromotionSummary(**valid_data)
        assert summary.max_redemptions is None
        assert summary.valid_until is None

    def test_from_attributes_config(self, valid_data):
        """Should have from_attributes=True for ORM compatibility."""
        assert PromotionSummary.model_config.get("from_attributes") is True


class TestPromotionEdgeCases:
    """Edge case tests for Promotion models."""

    def test_percentage_exactly_100(self):
        """Should accept exactly 100% discount."""
        promo = PromotionCreate(
            code="FREE100",
            name="100% Off",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("100"),
            valid_from=datetime.now(UTC),
        )
        assert promo.discount_value == Decimal("100")

    def test_very_small_percentage(self):
        """Should accept small percentage discounts."""
        promo = PromotionCreate(
            code="TINY",
            name="Tiny Discount",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("0.01"),
            valid_from=datetime.now(UTC),
        )
        assert promo.discount_value == Decimal("0.01")

    def test_large_fixed_amount(self):
        """Should accept large fixed amount discounts."""
        promo = PromotionCreate(
            code="BIG",
            name="Big Discount",
            discount_type=DiscountType.FIXED_AMOUNT,
            discount_value=Decimal("10000.00"),
            valid_from=datetime.now(UTC),
        )
        assert promo.discount_value == Decimal("10000.00")

    def test_code_with_special_characters(self):
        """Should uppercase codes with mixed case."""
        promo = PromotionCreate(
            code="SuMmEr-2024",
            name="Summer Sale",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("15"),
            valid_from=datetime.now(UTC),
        )
        assert promo.code == "SUMMER-2024"

    def test_eligibility_rules_with_plan_restriction(self):
        """Should accept plan_restriction in eligibility rules."""
        promo = PromotionCreate(
            code="PROONLY",
            name="Pro Only",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("20"),
            valid_from=datetime.now(UTC),
            eligibility_rules={"plan_restriction": ["essentials", "professional"]},
        )
        assert promo.eligibility_rules["plan_restriction"] == [
            "essentials",
            "professional",
        ]

    def test_eligibility_rules_one_per_organization(self):
        """Should accept one_per_organization rule."""
        promo = PromotionCreate(
            code="ONCE",
            name="One Time Only",
            discount_type=DiscountType.FIXED_AMOUNT,
            discount_value=Decimal("100"),
            valid_from=datetime.now(UTC),
            eligibility_rules={"one_per_organization": True},
        )
        assert promo.eligibility_rules["one_per_organization"] is True

    def test_all_status_values_valid(self):
        """Should accept all status values in update."""
        for status in PromotionStatus:
            update = PromotionUpdate(status=status)
            assert update.status == status

    def test_duration_months_boundary_values(self):
        """Should accept boundary duration values."""
        # Minimum
        promo_min = PromotionCreate(
            code="MIN",
            name="Minimum Duration",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            valid_from=datetime.now(UTC),
            duration_months=1,
        )
        assert promo_min.duration_months == 1

        # Maximum
        promo_max = PromotionCreate(
            code="MAX",
            name="Maximum Duration",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            valid_from=datetime.now(UTC),
            duration_months=36,
        )
        assert promo_max.duration_months == 36
