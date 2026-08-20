"""
Tests for base year normalization.

Story 6.10: Create Base Year Normalization

Base year normalization prevents tenants from getting an unfair advantage
when the base year had low occupancy. If occupancy was below target during
the base year, the base amount is grossed up to what it "would have been"
at target occupancy.

Formula:
    normalized_base = raw_base * (target_occupancy / base_year_occupancy)

Only applied when:
1. should_normalize = True
2. base_year_occupancy < target_occupancy
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.services.calculation.base_year import (
    BaseYearNormalizationInput,
    normalize_base_year,
)
from app.services.calculation.models import CalculationTrace


class TestBaseYearNormalization:
    """Test base year normalization for low occupancy scenarios."""

    def test_normalizes_when_below_target_and_enabled(self):
        """AC1 & AC2: Normalize base year when occupancy < target and flag is true."""
        # Base year: $100k at 70% occupancy
        # Target: 95%
        # Normalized: $100k * (0.95 / 0.70) = $135,714.29
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Factor: 0.95 / 0.70 = 1.357142857... (quantized to 1.3571 - 4 decimals)
        # $100k * 1.3571 = $135,710.00
        assert result == Decimal("135710.00")

    def test_skips_normalization_when_flag_false(self):
        """
        AC3: Don't normalize when should_normalize = False,
        even if occupancy is low.
        """
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.60"),  # Very low!
            target_occupancy=Decimal("0.95"),
            should_normalize=False,  # Flag is false
        )

        result = normalize_base_year(input_data)

        # Returns original amount unchanged
        assert result == Decimal("100000.00")

    def test_skips_normalization_when_at_target(self):
        """AC1: Don't normalize when occupancy >= target, even if flag is true."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.95"),  # At target
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # No normalization needed
        assert result == Decimal("100000.00")

    def test_skips_normalization_when_above_target(self):
        """AC1: Don't normalize when occupancy > target."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.98"),  # Above target
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # No normalization needed (already above target)
        assert result == Decimal("100000.00")

    def test_very_low_occupancy_high_factor(self):
        """AC2: Handle very low occupancy with high gross-up factor."""
        # Base year: $50k at 40% occupancy
        # Target: 95%
        # Factor: 0.95 / 0.40 = 2.375
        # Normalized: $50k * 2.375 = $118,750.00
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("50000.00"),
            base_year_occupancy=Decimal("0.40"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        assert result == Decimal("118750.00")

    def test_custom_target_occupancy(self):
        """AC1: Support custom target occupancy (not default 95%)."""
        # Base year: $100k at 75% occupancy
        # Target: 90% (custom)
        # Factor: 0.90 / 0.75 = 1.20
        # Normalized: $100k * 1.20 = $120,000.00
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.75"),
            target_occupancy=Decimal("0.90"),  # Custom target
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        assert result == Decimal("120000.00")

    def test_trace_shows_normalization(self):
        """AC4: Trace shows normalization step with factor."""
        trace = CalculationTrace(
            calculation_type="base_year_norm_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        normalize_base_year(input_data, trace=trace)

        # Should have steps showing normalization
        assert len(trace.steps) > 0

        # Find normalization step
        norm_step = next(
            (s for s in trace.steps if "normalize" in s.step_name.lower()),
            None,
        )
        assert norm_step is not None
        assert "100000" in norm_step.operation or "raw_base" in str(norm_step.inputs)

    def test_trace_preserves_original_base(self):
        """AC5: Trace preserves original base year amount."""
        trace = CalculationTrace(
            calculation_type="base_year_norm_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        normalize_base_year(input_data, trace=trace)

        # Find normalization step
        norm_step = next(
            (s for s in trace.steps if "normalize" in s.step_name.lower()),
            None,
        )
        assert norm_step is not None

        # Should preserve original in input_values
        inputs = norm_step.input_values
        assert "raw_base" in inputs or "100000.00" in inputs.values()

    def test_trace_shows_skip_when_flag_false(self):
        """AC4: Trace shows skip message when normalization is disabled."""
        trace = CalculationTrace(
            calculation_type="base_year_norm_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.60"),
            target_occupancy=Decimal("0.95"),
            should_normalize=False,  # Disabled
        )

        normalize_base_year(input_data, trace=trace)

        # Should have step showing skip
        assert len(trace.steps) >= 1
        step = trace.steps[0]
        assert (
            "skip" in step.operation.lower() or "not enabled" in step.operation.lower()
        )

    def test_trace_shows_skip_when_at_target(self):
        """AC4: Trace shows skip message when occupancy >= target."""
        trace = CalculationTrace(
            calculation_type="base_year_norm_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.95"),  # At target
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        normalize_base_year(input_data, trace=trace)

        # Should have step showing no normalization needed
        assert len(trace.steps) >= 1
        step = trace.steps[0]
        assert (
            "no normalization" in step.operation.lower()
            or "at target" in step.operation.lower()
        )

    def test_decimal_precision_rounding(self):
        """Ensure normalized amount is quantized to 2 decimal places."""
        # Use values that create a repeating decimal
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("99999.99"),
            base_year_occupancy=Decimal("0.666"),  # Creates repeating decimal
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Factor: 0.95 / 0.666 = 1.426426426... (quantized to 1.4264 - 4 decimals)
        # Result: $99,999.99 * 1.4264 = $142,639.99
        assert result == Decimal("142639.99")
        assert str(result).count(".") == 1
        assert len(str(result).split(".")[-1]) == 2

    def test_zero_base_year_amount(self):
        """Edge case: zero base year amount (uncommon but valid)."""
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("0.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # $0 * factor = $0
        assert result == Decimal("0.00")

    def test_input_validation(self):
        """Pydantic should validate BaseYearNormalizationInput fields."""
        # Valid input
        valid = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )
        assert valid.should_normalize is True

        # Default target should be 0.95
        default_target = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            should_normalize=True,
        )
        assert default_target.target_occupancy == Decimal("0.95")

        # Default should_normalize should be False
        default_flag = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.70"),
            target_occupancy=Decimal("0.95"),
        )
        assert default_flag.should_normalize is False

    def test_integration_with_gross_up_formula(self):
        """AC2: Verify normalization uses same gross-up formula as current year."""
        # This test verifies the formula matches gross_up.calculate_gross_up_factor
        # Formula: target / actual
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.80"),
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        result = normalize_base_year(input_data)

        # Expected factor: 0.95 / 0.80 = 1.1875
        # Expected result: $100k * 1.1875 = $118,750.00
        assert result == Decimal("118750.00")

    def test_trace_logs_warning_for_invalid_occupancy(self):
        """Edge case: Trace logs WARNING when occupancy is too low to normalize (line 204)."""
        trace = CalculationTrace(
            calculation_type="base_year_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        # Occupancy of 0.005 (0.5%) is below min_valid_occupancy of 0.01 (1%)
        input_data = BaseYearNormalizationInput(
            raw_base_year_amount=Decimal("100000.00"),
            base_year_occupancy=Decimal("0.005"),  # 0.5% - too low
            target_occupancy=Decimal("0.95"),
            should_normalize=True,
        )

        # Function should raise ValueError for invalid occupancy
        try:
            normalize_base_year(input_data, trace=trace)
            assert False, "Should have raised ValueError for invalid occupancy"
        except ValueError as e:
            assert "occupancy" in str(e).lower()

        # Verify trace logged the warning before raising error
        assert len(trace.steps) > 0
        warning_step = trace.steps[0]
        assert "WARNING" in warning_step.note
        assert "too low" in warning_step.note.lower()
        assert "cannot normalize" in warning_step.operation.lower()
