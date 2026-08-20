"""Tests for LeaseRecoveryProfile domain models.

These tests verify that the Pydantic models correctly validate
lease recovery profile data, including conditional validation
for cap_rate when cap_type is not NONE.
"""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models.enums import BomaStandardVersion, CapType, PoolType
from app.models.lease_recovery_profile import (
    BaseYearAdjustmentItem,
    LeaseRecoveryProfile,
    LeaseRecoveryProfileCreate,
    LeaseRecoveryProfileUpdate,
)


def make_valid_profile_data() -> dict:
    """Create valid lease recovery profile data for testing."""
    return {
        "base_year": 2023,
        "base_year_amount": Decimal("50000.00"),
        "gross_up_base_year": True,
        "pro_rata_share": Decimal("0.05"),
        "cap_type": CapType.NONE,
        "cap_rate": None,
        "admin_fee_percentage": Decimal("0.15"),
        "excluded_pools": [],
    }


class TestBaseYearFields:
    """Tests for base year related fields."""

    def test_base_year_optional(self) -> None:
        """Base year is optional."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.base_year is None

    def test_base_year_valid_range(self) -> None:
        """Base year must be between 1990 and 2100."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"), base_year=2023)
        assert profile.base_year == 2023

    def test_base_year_minimum(self) -> None:
        """Base year must be at least 1990."""
        with pytest.raises(ValidationError) as exc_info:
            LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"), base_year=1989)
        assert "1990" in str(exc_info.value)

    def test_base_year_maximum(self) -> None:
        """Base year must be at most 2100."""
        with pytest.raises(ValidationError) as exc_info:
            LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"), base_year=2101)
        assert "2100" in str(exc_info.value)

    def test_base_year_at_bounds(self) -> None:
        """Base year at boundaries is valid."""
        profile_1990 = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"), base_year=1990
        )
        assert profile_1990.base_year == 1990

        profile_2100 = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"), base_year=2100
        )
        assert profile_2100.base_year == 2100

    def test_base_year_amount_optional(self) -> None:
        """Base year amount is optional."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.base_year_amount is None

    def test_base_year_amount_non_negative(self) -> None:
        """Base year amount must be non-negative."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                base_year_amount=Decimal("-100"),
            )

    def test_base_year_amount_zero_valid(self) -> None:
        """Base year amount of zero is valid."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            base_year_amount=Decimal("0"),
        )
        assert profile.base_year_amount == Decimal("0")

    def test_gross_up_base_year_default_false(self) -> None:
        """Gross up base year defaults to False."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.gross_up_base_year is False

    def test_gross_up_base_year_can_be_true(self) -> None:
        """Gross up base year can be set to True."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            gross_up_base_year=True,
        )
        assert profile.gross_up_base_year is True


class TestProRataShare:
    """Tests for pro rata share field."""

    def test_pro_rata_share_required(self) -> None:
        """Pro rata share is required."""
        with pytest.raises(ValidationError) as exc_info:
            LeaseRecoveryProfile()  # type: ignore[call-arg]
        assert "pro_rata_share" in str(exc_info.value)

    def test_pro_rata_share_valid_range(self) -> None:
        """Pro rata share between 0 and 1 is valid."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.pro_rata_share == Decimal("0.05")

    def test_pro_rata_share_minimum(self) -> None:
        """Pro rata share can be 0."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0"))
        assert profile.pro_rata_share == Decimal("0")

    def test_pro_rata_share_maximum(self) -> None:
        """Pro rata share can be 1."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("1"))
        assert profile.pro_rata_share == Decimal("1")

    def test_pro_rata_share_below_zero(self) -> None:
        """Pro rata share below 0 is invalid."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(pro_rata_share=Decimal("-0.01"))

    def test_pro_rata_share_above_one(self) -> None:
        """Pro rata share above 1 is invalid."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(pro_rata_share=Decimal("1.01"))

    def test_pro_rata_share_precision(self) -> None:
        """Pro rata share maintains decimal precision."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.123456"))
        assert profile.pro_rata_share == Decimal("0.123456")


class TestCapFields:
    """Tests for cap type and cap rate fields."""

    def test_cap_type_defaults_to_none(self) -> None:
        """Cap type defaults to NONE."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.cap_type == CapType.NONE

    def test_cap_type_non_cumulative(self) -> None:
        """Non-cumulative cap type is valid."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.NON_CUMULATIVE,
            cap_rate=Decimal("0.05"),
        )
        assert profile.cap_type == CapType.NON_CUMULATIVE

    def test_cap_type_cumulative(self) -> None:
        """Cumulative cap type is valid."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.03"),
        )
        assert profile.cap_type == CapType.CUMULATIVE

    def test_cap_type_cumulative_compounding(self) -> None:
        """Cumulative compounding cap type is valid."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.CUMULATIVE_COMPOUNDING,
            cap_rate=Decimal("0.04"),
        )
        assert profile.cap_type == CapType.CUMULATIVE_COMPOUNDING

    def test_cap_rate_required_when_cap_type_not_none(self) -> None:
        """Cap rate is required when cap type is not NONE."""
        with pytest.raises(ValidationError) as exc_info:
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                cap_type=CapType.NON_CUMULATIVE,
                # cap_rate not provided
            )
        assert "cap_rate is required" in str(exc_info.value)

    def test_cap_rate_optional_when_cap_type_none(self) -> None:
        """Cap rate is optional when cap type is NONE."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.NONE,
            # cap_rate not provided
        )
        assert profile.cap_rate is None

    def test_cap_rate_allowed_when_cap_type_none(self) -> None:
        """Cap rate can be provided even when cap type is NONE."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.NONE,
            cap_rate=Decimal("0.05"),
        )
        assert profile.cap_rate == Decimal("0.05")

    def test_cap_rate_valid_range(self) -> None:
        """Cap rate must be between 0 and 1."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.NON_CUMULATIVE,
            cap_rate=Decimal("0.05"),
        )
        assert profile.cap_rate == Decimal("0.05")

    def test_cap_rate_below_zero(self) -> None:
        """Cap rate below 0 is invalid."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                cap_type=CapType.NON_CUMULATIVE,
                cap_rate=Decimal("-0.01"),
            )

    def test_cap_rate_above_one(self) -> None:
        """Cap rate above 1 is invalid."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                cap_type=CapType.NON_CUMULATIVE,
                cap_rate=Decimal("1.01"),
            )


class TestAdminFee:
    """Tests for admin fee percentage field."""

    def test_admin_fee_defaults_to_zero(self) -> None:
        """Admin fee defaults to 0."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.admin_fee_percentage == Decimal("0")

    def test_admin_fee_valid_range(self) -> None:
        """Admin fee between 0 and 0.20 is valid."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            admin_fee_percentage=Decimal("0.15"),
        )
        assert profile.admin_fee_percentage == Decimal("0.15")

    def test_admin_fee_maximum(self) -> None:
        """Admin fee of 0.20 (20%) is valid."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            admin_fee_percentage=Decimal("0.20"),
        )
        assert profile.admin_fee_percentage == Decimal("0.20")

    def test_admin_fee_above_maximum(self) -> None:
        """Admin fee above 0.20 is invalid."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                admin_fee_percentage=Decimal("0.21"),
            )

    def test_admin_fee_below_zero(self) -> None:
        """Admin fee below 0 is invalid."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                admin_fee_percentage=Decimal("-0.01"),
            )


class TestExcludedPools:
    """Tests for excluded pools field."""

    def test_excluded_pools_defaults_to_empty(self) -> None:
        """Excluded pools defaults to empty list."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.excluded_pools == []

    def test_excluded_pools_single_pool(self) -> None:
        """Single excluded pool is valid."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            excluded_pools=[PoolType.CAPITAL],
        )
        assert profile.excluded_pools == [PoolType.CAPITAL]

    def test_excluded_pools_multiple_pools(self) -> None:
        """Multiple excluded pools are valid."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            excluded_pools=[PoolType.CAPITAL, PoolType.TAX, PoolType.OTHER],
        )
        assert len(profile.excluded_pools) == 3
        assert PoolType.CAPITAL in profile.excluded_pools
        assert PoolType.TAX in profile.excluded_pools
        assert PoolType.OTHER in profile.excluded_pools

    def test_excluded_pools_all_types(self) -> None:
        """All pool types can be excluded."""
        all_pools = [
            PoolType.OPERATING,
            PoolType.TAX,
            PoolType.INSURANCE,
            PoolType.CAPITAL,
            PoolType.OTHER,
        ]
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            excluded_pools=all_pools,
        )
        assert len(profile.excluded_pools) == 5


class TestLeaseRecoveryProfileCreate:
    """Tests for LeaseRecoveryProfileCreate DTO."""

    def test_create_minimal(self) -> None:
        """Profile can be created with minimal required fields."""
        profile = LeaseRecoveryProfileCreate(pro_rata_share=Decimal("0.10"))
        assert profile.pro_rata_share == Decimal("0.10")
        assert profile.cap_type == CapType.NONE
        assert profile.admin_fee_percentage == Decimal("0")

    def test_create_full(self) -> None:
        """Profile can be created with all fields."""
        profile = LeaseRecoveryProfileCreate(
            base_year=2023,
            base_year_amount=Decimal("50000"),
            gross_up_base_year=True,
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
            admin_fee_percentage=Decimal("0.15"),
            excluded_pools=[PoolType.CAPITAL],
        )
        assert profile.base_year == 2023
        assert profile.cap_type == CapType.CUMULATIVE
        assert len(profile.excluded_pools) == 1

    def test_create_validates_cap_rate_required(self) -> None:
        """Create validates cap_rate requirement."""
        with pytest.raises(ValidationError) as exc_info:
            LeaseRecoveryProfileCreate(
                pro_rata_share=Decimal("0.05"),
                cap_type=CapType.NON_CUMULATIVE,
            )
        assert "cap_rate is required" in str(exc_info.value)


class TestLeaseRecoveryProfileUpdate:
    """Tests for LeaseRecoveryProfileUpdate DTO."""

    def test_all_fields_optional(self) -> None:
        """Update DTO can be created with no fields."""
        update = LeaseRecoveryProfileUpdate()
        assert update.pro_rata_share is None
        assert update.cap_type is None
        assert update.excluded_pools is None

    def test_partial_update_pro_rata(self) -> None:
        """Only pro_rata_share can be updated."""
        update = LeaseRecoveryProfileUpdate(pro_rata_share=Decimal("0.08"))
        assert update.pro_rata_share == Decimal("0.08")
        assert update.cap_type is None

    def test_partial_update_cap_fields(self) -> None:
        """Cap fields can be updated together."""
        update = LeaseRecoveryProfileUpdate(
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.04"),
        )
        assert update.cap_type == CapType.CUMULATIVE
        assert update.cap_rate == Decimal("0.04")

    def test_update_validations_apply(self) -> None:
        """Field validations apply on update."""
        # Pro rata share out of range
        with pytest.raises(ValidationError):
            LeaseRecoveryProfileUpdate(pro_rata_share=Decimal("1.5"))

        # Admin fee out of range
        with pytest.raises(ValidationError):
            LeaseRecoveryProfileUpdate(admin_fee_percentage=Decimal("0.25"))


class TestSerialization:
    """Tests for model serialization."""

    def test_to_dict(self) -> None:
        """Profile serializes to dict correctly."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            base_year=2023,
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
            excluded_pools=[PoolType.CAPITAL],
        )
        result = profile.model_dump()
        assert result["pro_rata_share"] == Decimal("0.05")
        assert result["base_year"] == 2023
        assert result["cap_type"] == CapType.CUMULATIVE
        assert len(result["excluded_pools"]) == 1

    def test_to_json(self) -> None:
        """Profile serializes to JSON correctly."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.NONE,
        )
        json_str = profile.model_dump_json()
        assert "0.05" in json_str
        assert "none" in json_str

    def test_from_attributes(self) -> None:
        """Profile can be created from ORM attributes."""

        class MockORM:
            def __init__(self) -> None:
                self.base_year = 2023
                self.base_year_amount = Decimal("50000")
                self.gross_up_base_year = True
                self.pro_rata_share = Decimal("0.05")
                self.cap_type = CapType.NONE
                self.cap_rate = None
                self.admin_fee_percentage = Decimal("0.15")
                self.excluded_pools = [PoolType.CAPITAL]

        orm_obj = MockORM()
        profile = LeaseRecoveryProfile.model_validate(orm_obj)
        assert profile.base_year == 2023
        assert profile.pro_rata_share == Decimal("0.05")


class TestRsfMeasurementFields:
    """Tests for BOMA 2024 RSF measurement standard fields on LeaseRecoveryProfile."""

    def test_rsf_measurement_standard_optional(self) -> None:
        """rsf_measurement_standard is optional and defaults to None."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.rsf_measurement_standard is None

    def test_rsf_measurement_date_optional(self) -> None:
        """rsf_measurement_date is optional and defaults to None."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.05"))
        assert profile.rsf_measurement_date is None

    def test_rsf_measurement_standard_accepts_all_versions(self) -> None:
        """rsf_measurement_standard accepts all BomaStandardVersion values."""
        for version in BomaStandardVersion:
            profile = LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                rsf_measurement_standard=version,
            )
            assert profile.rsf_measurement_standard == version

    def test_rsf_measurement_standard_accepts_string(self) -> None:
        """rsf_measurement_standard accepts string value."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            rsf_measurement_standard="2017",
        )
        assert profile.rsf_measurement_standard == BomaStandardVersion.V2017

    def test_rsf_measurement_date_accepts_date(self) -> None:
        """rsf_measurement_date accepts a date value."""
        from datetime import date

        measurement_date = date(2024, 6, 1)
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            rsf_measurement_date=measurement_date,
        )
        assert profile.rsf_measurement_date == measurement_date

    def test_rsf_fields_in_create_dto(self) -> None:
        """RSF measurement fields work in LeaseRecoveryProfileCreate."""
        from datetime import date

        profile = LeaseRecoveryProfileCreate(
            pro_rata_share=Decimal("0.10"),
            rsf_measurement_standard=BomaStandardVersion.V2024,
            rsf_measurement_date=date(2024, 1, 1),
        )
        assert profile.rsf_measurement_standard == BomaStandardVersion.V2024
        assert profile.rsf_measurement_date is not None

    def test_rsf_fields_in_update_dto(self) -> None:
        """RSF measurement fields work in LeaseRecoveryProfileUpdate."""
        update = LeaseRecoveryProfileUpdate(
            rsf_measurement_standard=BomaStandardVersion.V2017,
        )
        assert update.rsf_measurement_standard == BomaStandardVersion.V2017
        assert update.rsf_measurement_date is None

    def test_rsf_fields_all_optional_in_update(self) -> None:
        """RSF measurement fields are optional in update DTO."""
        update = LeaseRecoveryProfileUpdate()
        assert update.rsf_measurement_standard is None
        assert update.rsf_measurement_date is None

    def test_rsf_fields_in_serialization(self) -> None:
        """RSF measurement fields appear in serialized output."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            rsf_measurement_standard=BomaStandardVersion.V2024,
        )
        result = profile.model_dump()
        assert result["rsf_measurement_standard"] == BomaStandardVersion.V2024
        assert result["rsf_measurement_date"] is None


class TestBaseYearAdjustmentItem:
    """Tests for BaseYearAdjustmentItem model."""

    def test_adjustment_item_valid(self) -> None:
        """Valid adjustment item stores all fields."""
        item = BaseYearAdjustmentItem(
            service_name="24/7 Security",
            imputed_amount=Decimal("18000.00"),
            justification="Added July 2023; annualized as if in 2021 base year",
        )
        assert item.service_name == "24/7 Security"
        assert item.imputed_amount == Decimal("18000.00")

    def test_adjustment_item_rejects_negative_amount(self) -> None:
        """Negative imputed_amount must be rejected."""
        with pytest.raises(ValidationError):
            BaseYearAdjustmentItem(
                service_name="Security",
                imputed_amount=Decimal("-1.00"),
                justification="test",
            )

    def test_adjustment_item_rejects_empty_service_name(self) -> None:
        """Empty service_name must be rejected."""
        with pytest.raises(ValidationError):
            BaseYearAdjustmentItem(
                service_name="",
                imputed_amount=Decimal("1000.00"),
                justification="test",
            )

    def test_adjustment_item_rejects_whitespace_service_name(self) -> None:
        """Whitespace-only service_name must be rejected."""
        with pytest.raises(ValidationError):
            BaseYearAdjustmentItem(
                service_name="   ",
                imputed_amount=Decimal("1000.00"),
                justification="test",
            )

    def test_adjustment_item_allows_zero_amount(self) -> None:
        """Zero imputed_amount is valid."""
        item = BaseYearAdjustmentItem(
            service_name="Security",
            imputed_amount=Decimal("0.00"),
            justification="No cost yet",
        )
        assert item.imputed_amount == Decimal("0.00")


class TestBaseYearAdjustmentsOnProfile:
    """Tests for base_year_adjustments field on LeaseRecoveryProfile."""

    def test_recovery_profile_base_year_adjustments_defaults_empty(self) -> None:
        """base_year_adjustments defaults to empty list."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type="none",
            cap_rate=None,
            admin_fee_percentage=Decimal("0"),
            excluded_pools=[],
        )
        assert profile.base_year_adjustments == []

    def test_recovery_profile_stores_multiple_adjustments(self) -> None:
        """Multiple adjustment items are stored correctly."""
        items = [
            BaseYearAdjustmentItem(
                service_name="Security",
                imputed_amount=Decimal("18000.00"),
                justification="Added 2023",
            ),
            BaseYearAdjustmentItem(
                service_name="HVAC Monitoring",
                imputed_amount=Decimal("6000.00"),
                justification="Added 2022",
            ),
        ]
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type="none",
            cap_rate=None,
            admin_fee_percentage=Decimal("0"),
            excluded_pools=[],
            base_year_adjustments=items,
        )
        assert len(profile.base_year_adjustments) == 2
        assert profile.base_year_adjustments[0].service_name == "Security"
        assert profile.base_year_adjustments[1].service_name == "HVAC Monitoring"

    def test_recovery_profile_adjustment_in_create_dto(self) -> None:
        """LeaseRecoveryProfileCreate also accepts base_year_adjustments."""
        item = BaseYearAdjustmentItem(
            service_name="Security",
            imputed_amount=Decimal("12000.00"),
            justification="Added 2022",
        )
        profile = LeaseRecoveryProfileCreate(
            pro_rata_share=Decimal("0.05"),
            base_year_adjustments=[item],
        )
        assert len(profile.base_year_adjustments) == 1

    def test_recovery_profile_adjustment_in_update_dto(self) -> None:
        """LeaseRecoveryProfileUpdate accepts base_year_adjustments as optional list."""
        item = BaseYearAdjustmentItem(
            service_name="Security",
            imputed_amount=Decimal("12000.00"),
            justification="Added 2022",
        )
        update = LeaseRecoveryProfileUpdate(base_year_adjustments=[item])
        assert update.base_year_adjustments is not None
        assert len(update.base_year_adjustments) == 1

    def test_recovery_profile_update_adjustments_defaults_none(self) -> None:
        """LeaseRecoveryProfileUpdate base_year_adjustments defaults to None (not empty list)."""
        update = LeaseRecoveryProfileUpdate()
        assert update.base_year_adjustments is None


class TestImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """LeaseRecoveryProfile can be imported from app.models."""
        from app.models import (
            LeaseRecoveryProfile,
            LeaseRecoveryProfileCreate,
            LeaseRecoveryProfileUpdate,
        )

        assert LeaseRecoveryProfile is not None
        assert LeaseRecoveryProfileCreate is not None
        assert LeaseRecoveryProfileUpdate is not None
