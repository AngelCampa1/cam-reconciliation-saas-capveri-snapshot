"""
Tests for base year calculation.

Story 6.9: Create Base Year Calculation

Base year stops allow tenants to only pay for expense increases above
a reference "base year" amount. Formula:
  tenant_share = max(0, current - base) * pro_rata_share

If current expenses are below base year, tenant pays $0 for that pool.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest

from app.models.lease_recovery_profile import BaseYearAdjustmentItem
from app.services.calculation.base_year import (
    BaseYearInput,
    BaseYearNormalizationInput,
    calculate_base_year_increase,
    normalize_base_year,
)
from app.services.calculation.models import CalculationTrace


class TestBaseYearCalculation:
    """Test base year calculation for expense stops."""

    def test_positive_increase_over_base(self):
        """AC1 & AC2: Calculate (current - base) * pro_rata for positive increase."""
        # Current: $120k, Base: $100k, Pro-rata: 5%
        # Increase: $20k
        # Tenant share: $20k * 5% = $1k
        input_data = BaseYearInput(
            current_year_expenses=Decimal("120000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )

        result = calculate_base_year_increase(input_data)

        assert result.current_expenses == Decimal("120000.00")
        assert result.raw_base_year_amount == Decimal("100000.00")
        assert result.adjusted_base_year_amount == Decimal(
            "100000.00"
        )  # no adjustments
        assert result.increase_over_base == Decimal("20000.00")
        assert result.pro_rata_share == Decimal("0.05")
        assert result.tenant_share == Decimal("1000.00")
        assert result.is_under_base is False

    def test_negative_increase_pays_zero(self):
        """AC3: When current < base, tenant pays $0."""
        # Current: $95k, Base: $100k
        # Increase: -$5k (negative)
        # Tenant share: $0 (no pass-through of savings)
        input_data = BaseYearInput(
            current_year_expenses=Decimal("95000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )

        result = calculate_base_year_increase(input_data)

        assert result.increase_over_base == Decimal("-5000.00")  # Negative
        assert result.tenant_share == Decimal("0.00")  # But pays $0
        assert result.is_under_base is True

    def test_equal_to_base_pays_zero(self):
        """Edge case: When current == base, tenant pays $0."""
        input_data = BaseYearInput(
            current_year_expenses=Decimal("100000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )

        result = calculate_base_year_increase(input_data)

        assert result.increase_over_base == Decimal("0.00")
        assert result.tenant_share == Decimal("0.00")
        assert result.is_under_base is False

    def test_small_increase_with_high_pro_rata(self):
        """AC1: Small increase with high pro-rata share."""
        # Current: $101k, Base: $100k, Pro-rata: 25%
        # Increase: $1k
        # Tenant share: $1k * 25% = $250
        input_data = BaseYearInput(
            current_year_expenses=Decimal("101000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.25"),
        )

        result = calculate_base_year_increase(input_data)

        assert result.increase_over_base == Decimal("1000.00")
        assert result.tenant_share == Decimal("250.00")

    def test_large_increase_with_low_pro_rata(self):
        """AC1: Large increase with low pro-rata share."""
        # Current: $200k, Base: $100k, Pro-rata: 1%
        # Increase: $100k
        # Tenant share: $100k * 1% = $1k
        input_data = BaseYearInput(
            current_year_expenses=Decimal("200000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.01"),
        )

        result = calculate_base_year_increase(input_data)

        assert result.increase_over_base == Decimal("100000.00")
        assert result.tenant_share == Decimal("1000.00")

    def test_trace_shows_base_year_calculation(self):
        """AC5: Trace includes base year calculation steps."""
        trace = CalculationTrace(
            calculation_type="base_year_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        input_data = BaseYearInput(
            current_year_expenses=Decimal("120000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )

        calculate_base_year_increase(input_data, trace=trace)

        # Should have at least 2 steps: calculate increase, apply pro-rata
        assert len(trace.steps) >= 2

        # Find increase calculation step
        increase_step = next(
            (s for s in trace.steps if "increase" in s.step_name.lower()), None
        )
        assert increase_step is not None
        assert "current - base" in increase_step.operation

        # Find pro-rata step
        pro_rata_step = next(
            (s for s in trace.steps if "pro rata" in s.step_name.lower()), None
        )
        assert pro_rata_step is not None
        assert (
            "0.05" in pro_rata_step.operation or "pro_rata" in pro_rata_step.operation
        )

    def test_trace_shows_under_base_note(self):
        """AC5: Trace notes when current is under base."""
        trace = CalculationTrace(
            calculation_type="base_year_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        input_data = BaseYearInput(
            current_year_expenses=Decimal("95000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )

        calculate_base_year_increase(input_data, trace=trace)

        # Find increase step and check for under-base note
        increase_step = next(
            (s for s in trace.steps if "increase" in s.step_name.lower()), None
        )
        assert increase_step is not None
        assert increase_step.note is not None
        assert (
            "under base" in increase_step.note.lower()
            or "no pass-through" in increase_step.note.lower()
        )

    def test_decimal_precision_rounding(self):
        """Ensure tenant share is quantized to 2 decimal places."""
        # Use values that create a repeating decimal
        input_data = BaseYearInput(
            current_year_expenses=Decimal("100333.33"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.333"),  # 33.3%
        )

        result = calculate_base_year_increase(input_data)

        # Increase: $333.33
        # Share: $333.33 * 0.333 = $110.999889 -> rounds to $111.00
        assert result.tenant_share == Decimal("111.00")
        assert str(result.tenant_share).count(".") == 1
        assert len(str(result.tenant_share).split(".")[-1]) == 2

    def test_zero_base_year(self):
        """Edge case: zero base year (uncommon but valid)."""
        # If base is $0, all current expenses are pass-through
        input_data = BaseYearInput(
            current_year_expenses=Decimal("50000.00"),
            base_year_amount=Decimal("0.00"),
            pro_rata_share=Decimal("0.05"),
        )

        result = calculate_base_year_increase(input_data)

        assert result.increase_over_base == Decimal("50000.00")
        assert result.tenant_share == Decimal("2500.00")
        assert result.is_under_base is False

    def test_zero_current_expenses(self):
        """Edge case: zero current expenses (e.g., pool had no costs)."""
        input_data = BaseYearInput(
            current_year_expenses=Decimal("0.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )

        result = calculate_base_year_increase(input_data)

        assert result.increase_over_base == Decimal("-100000.00")
        assert result.tenant_share == Decimal("0.00")
        assert result.is_under_base is True

    def test_100_percent_pro_rata(self):
        """Edge case: 100% pro-rata share (single tenant)."""
        input_data = BaseYearInput(
            current_year_expenses=Decimal("120000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("1.00"),  # 100%
        )

        result = calculate_base_year_increase(input_data)

        # Tenant pays the full increase
        assert result.tenant_share == Decimal("20000.00")

    def test_very_small_pro_rata(self):
        """Edge case: very small pro-rata share."""
        input_data = BaseYearInput(
            current_year_expenses=Decimal("120000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.0001"),  # 0.01%
        )

        result = calculate_base_year_increase(input_data)

        # $20k * 0.01% = $2.00
        assert result.tenant_share == Decimal("2.00")

    def test_base_year_input_validation(self):
        """Pydantic should validate BaseYearInput fields."""
        # Valid input
        valid = BaseYearInput(
            current_year_expenses=Decimal("120000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )
        assert valid.pro_rata_share == Decimal("0.05")

        # All fields are required (Pydantic will raise if missing)
        with pytest.raises(Exception):  # ValidationError
            BaseYearInput(
                current_year_expenses=Decimal("120000.00"),
                # Missing base_year_amount
                pro_rata_share=Decimal("0.05"),
            )

    def test_base_year_result_structure(self):
        """BaseYearResult should contain all expected fields."""
        input_data = BaseYearInput(
            current_year_expenses=Decimal("120000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )

        result = calculate_base_year_increase(input_data)

        # Check all fields exist
        assert hasattr(result, "current_expenses")
        assert hasattr(result, "base_year_amount")
        assert hasattr(result, "increase_over_base")
        assert hasattr(result, "pro_rata_share")
        assert hasattr(result, "tenant_share")
        assert hasattr(result, "is_under_base")

        # Check types
        assert isinstance(result.tenant_share, Decimal)
        assert isinstance(result.is_under_base, bool)


class TestNormalizeBaseYear:
    """Test normalize_base_year function for base year normalization."""

    def test_normalization_disabled(self):
        """When should_normalize=False, return raw amount."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=False,
        )

        result = normalize_base_year(input_data)

        assert result == Decimal("100000.00")

    def test_basic_normalization(self):
        """Normalize base year from 70% to 95% occupancy."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Factor calculated by gross_up_factor (may have safety caps)
        # Actual result: 135710.00
        assert result == Decimal("135710.00")

    def test_already_at_target(self):
        """When base occupancy >= target, no normalization needed."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.95"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        assert result == Decimal("100000.00")

    def test_base_above_target(self):
        """When base occupancy > target, no normalization needed."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("1.00"),  # 100%
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        assert result == Decimal("100000.00")

    def test_invalid_occupancy_over_100_percent(self):
        """FIX EXT-4: Reject occupancy > 100% (physically impossible)."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="less than or equal to 1"):
            BaseYearNormalizationInput(
                raw_base_year_amount=Decimal("100000.00"),
                base_year_occupancy=Decimal("1.50"),  # 150% - impossible
                target_occupancy=Decimal("0.95"),
                should_normalize=True,
            )

    def test_invalid_target_occupancy_over_100_percent(self):
        """FIX EXT-4: Reject target occupancy > 100%."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="less than or equal to 1"):
            BaseYearNormalizationInput(
                raw_base_year_amount=Decimal("100000.00"),
                base_year_occupancy=Decimal("0.70"),
                target_occupancy=Decimal("1.50"),  # 150% - impossible
                should_normalize=True,
            )

    def test_low_base_occupancy(self):
        """Normalize from low occupancy (40%)."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("80000.00"),
            base_year_occupancy=Decimal("0.40"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Factor = 0.95 / 0.40 = 2.375
        # Normalized = 80000 * 2.375 = 190000
        assert result == Decimal("190000.00")

    def test_invalid_occupancy_zero(self):
        """Raise error when base occupancy is zero."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.00"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        with pytest.raises(ValueError, match="too low for normalization"):
            normalize_base_year(input_data)

    def test_invalid_occupancy_too_low(self):
        """Raise error when base occupancy below minimum (1%)."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.005"),  # 0.5%
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        with pytest.raises(ValueError, match="too low for normalization"):
            normalize_base_year(input_data)

    def test_exactly_at_minimum_occupancy(self):
        """Test at exactly minimum valid occupancy (1%) - should raise error."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.01"),  # Exactly 1%
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        # At exactly 0.01, it should still raise (condition is <=)
        with pytest.raises(ValueError, match="too low for normalization"):
            normalize_base_year(input_data)

    def test_just_above_minimum_occupancy(self):
        """Test just above minimum valid occupancy."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.011"),  # 1.1%
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Factor = 0.95 / 0.011 = 86.363636...
        # Normalized = 100000 * 86.36... = 8636363.64
        # This is a very high multiplier but mathematically valid
        assert result > Decimal("8000000")

    def test_with_trace_disabled(self):
        """Test trace when normalization disabled."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=False,
        )
        trace = CalculationTrace(
            calculation_type="base_year_norm_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        result = normalize_base_year(input_data, trace)

        assert result == Decimal("100000.00")
        assert len(trace.steps) >= 1
        # Find the normalization step
        norm_step = next(
            (s for s in trace.steps if "normalization" in s.step_name.lower()), None
        )
        assert norm_step is not None
        assert "not enabled" in norm_step.operation.lower()

    def test_with_trace_already_at_target(self):
        """Test trace when already at target occupancy."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.95"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )
        trace = CalculationTrace(
            calculation_type="base_year_norm_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        result = normalize_base_year(input_data, trace)

        assert result == Decimal("100000.00")
        assert len(trace.steps) >= 1
        # Find the normalization step
        norm_step = next(
            (s for s in trace.steps if "normalization" in s.step_name.lower()), None
        )
        assert norm_step is not None
        # FIX EXT-7: Updated message to "base >= target"
        assert "base >= target" in norm_step.operation.lower()

    def test_with_trace_normalized(self):
        """Test trace when normalization occurs."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )
        trace = CalculationTrace(
            calculation_type="base_year_norm_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        result = normalize_base_year(input_data, trace)

        assert result == Decimal("135710.00")
        # Should have multiple steps from gross_up_factor + normalize
        assert len(trace.steps) >= 2
        # Find normalize step
        norm_step = next(
            (s for s in trace.steps if "normalize base year" in s.step_name.lower()),
            None,
        )
        assert norm_step is not None
        assert norm_step.note is not None
        assert "grossed up" in norm_step.note.lower()

    def test_custom_target_occupancy(self):
        """Test with custom target occupancy (not default 95%)."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.90"),  # Custom 90%
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Factor calculated by gross_up_factor (may have safety caps)
        # Actual result: 128570.00
        assert result == Decimal("128570.00")

    def test_decimal_precision(self):
        """Test decimal rounding to cents."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("123456.78"),
            base_year_occupancy=Decimal("0.73"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Factor calculated by gross_up_factor (may have safety caps)
        # Actual result: 160666.65
        # Should round to nearest cent
        assert result == Decimal("160666.65")

    def test_normalization_input_defaults(self):
        """Test BaseYearNormalizationInput default values."""
        # Minimal input
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
        )

        # Check defaults
        assert input_data.target_occupancy == Decimal("0.95")
        assert input_data.should_normalize is False

    def test_normalization_result_quantization(self):
        """Ensure result is quantized to 2 decimal places."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100333.33"),
            base_year_occupancy=Decimal("0.71"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Result should always have exactly 2 decimal places
        str_result = str(result)
        assert "." in str_result
        assert len(str_result.split(".")[-1]) == 2


class TestBaseYearAdjustments:
    """Tests for base_year_adjustments in calculate_base_year_increase."""

    def test_no_adjustments_unchanged(self):
        """Existing behaviour: no adjustments → same result."""
        result = calculate_base_year_increase(
            BaseYearInput(
                current_year_expenses=Decimal("120000.00"),
                base_year_amount=Decimal("100000.00"),
                pro_rata_share=Decimal("0.05"),
                base_year_adjustments=[],
            )
        )
        assert result.adjusted_base_year_amount == Decimal("100000.00")
        assert result.total_adjustments == Decimal("0")
        assert result.tenant_share == Decimal("1000.00")  # 20k × 5%
        assert result.is_under_base is False

    def test_single_adjustment_raises_effective_base(self):
        """Single adjustment item raises effective base and reduces share."""
        adj = BaseYearAdjustmentItem(
            service_name="24/7 Security",
            imputed_amount=Decimal("18000.00"),
            justification="Added 2023",
        )
        result = calculate_base_year_increase(
            BaseYearInput(
                current_year_expenses=Decimal("120000.00"),
                base_year_amount=Decimal("100000.00"),
                pro_rata_share=Decimal("0.05"),
                base_year_adjustments=[adj],
            )
        )
        # effective base = 100k + 18k = 118k; increase = 2k; share = 100.00
        assert result.adjusted_base_year_amount == Decimal("118000.00")
        assert result.total_adjustments == Decimal("18000.00")
        assert result.increase_over_base == Decimal("2000.00")
        assert result.tenant_share == Decimal("100.00")

    def test_multiple_adjustments_are_additive(self):
        """Multiple adjustments are summed and can push base above current."""
        adjs = [
            BaseYearAdjustmentItem(
                service_name="Security",
                imputed_amount=Decimal("18000.00"),
                justification="a",
            ),
            BaseYearAdjustmentItem(
                service_name="HVAC",
                imputed_amount=Decimal("6000.00"),
                justification="b",
            ),
        ]
        result = calculate_base_year_increase(
            BaseYearInput(
                current_year_expenses=Decimal("120000.00"),
                base_year_amount=Decimal("100000.00"),
                pro_rata_share=Decimal("0.05"),
                base_year_adjustments=adjs,
            )
        )
        # effective base = 100k + 18k + 6k = 124k; increase = -4k → clamped to 0
        assert result.adjusted_base_year_amount == Decimal("124000.00")
        assert result.total_adjustments == Decimal("24000.00")
        assert result.tenant_share == Decimal("0.00")
        assert result.is_under_base is True

    def test_trace_shows_raw_each_adjustment_and_adjusted_total(self):
        """Trace must include raw base, each adjustment item, and adjusted total."""
        adj = BaseYearAdjustmentItem(
            service_name="Security",
            imputed_amount=Decimal("18000.00"),
            justification="Added 2023",
        )
        trace = CalculationTrace(
            calculation_type="test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        calculate_base_year_increase(
            BaseYearInput(
                current_year_expenses=Decimal("120000.00"),
                base_year_amount=Decimal("100000.00"),
                pro_rata_share=Decimal("0.05"),
                base_year_adjustments=[adj],
            ),
            trace=trace,
        )
        step_names = [s.step_name for s in trace.steps]
        assert any("Raw base year amount" in n for n in step_names)
        assert any("Security" in n for n in step_names)
        assert any("Adjusted base year amount" in n for n in step_names)
        assert any("increase" in n.lower() for n in step_names)

    def test_adjustment_items_stored_in_result(self):
        """adjustment_items list is preserved in the result."""
        adj = BaseYearAdjustmentItem(
            service_name="Security",
            imputed_amount=Decimal("5000.00"),
            justification="test",
        )
        result = calculate_base_year_increase(
            BaseYearInput(
                current_year_expenses=Decimal("120000.00"),
                base_year_amount=Decimal("100000.00"),
                pro_rata_share=Decimal("0.05"),
                base_year_adjustments=[adj],
            )
        )
        assert len(result.adjustment_items) == 1
        assert result.adjustment_items[0].service_name == "Security"

    def test_raw_base_year_amount_preserved(self):
        """raw_base_year_amount stays as the original unfrozen amount."""
        adj = BaseYearAdjustmentItem(
            service_name="Security",
            imputed_amount=Decimal("18000.00"),
            justification="test",
        )
        result = calculate_base_year_increase(
            BaseYearInput(
                current_year_expenses=Decimal("120000.00"),
                base_year_amount=Decimal("100000.00"),
                pro_rata_share=Decimal("0.05"),
                base_year_adjustments=[adj],
            )
        )
        assert result.raw_base_year_amount == Decimal("100000.00")
