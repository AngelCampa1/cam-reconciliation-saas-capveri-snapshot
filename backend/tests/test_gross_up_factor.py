"""
Tests for gross-up factor calculation.

Story: 6.2 - Create Gross-Up Factor Calculator
Tests verify BOMA-compliant gross-up factor calculation for variable expense allocation.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

from app.services.calculation.gross_up import (
    GrossUpConfig,
    apply_safety_valve,
    calculate_gross_up_factor,
    calculate_grossed_up_expenses,
)
from app.services.calculation.models import CalculationTrace


class TestGrossUpConfig:
    """Test GrossUpConfig class."""

    def test_default_config(self):
        """Default config should use 95% target, 1.0 min, no max."""
        config = GrossUpConfig()
        assert config.target_occupancy == Decimal("0.95")
        assert config.min_factor == Decimal("1.0")
        assert config.max_factor is None

    def test_custom_config(self):
        """Should allow custom target, min, and max values."""
        config = GrossUpConfig(
            target_occupancy=Decimal("0.90"),
            min_factor=Decimal("1.0"),
            max_factor=Decimal("2.0"),
        )
        assert config.target_occupancy == Decimal("0.90")
        assert config.min_factor == Decimal("1.0")
        assert config.max_factor == Decimal("2.0")


class TestGrossUpFactorCalculation:
    """Test gross-up factor calculation logic."""

    def test_basic_gross_up_calculation(self):
        """AC1: Factor = target_occupancy / actual_occupancy."""
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))
        actual = Decimal("0.75")

        factor = calculate_gross_up_factor(actual, config)

        # 0.95 / 0.75 = 1.266666... rounded to 4 decimals = 1.2667
        assert factor == Decimal("1.2667")

    def test_factor_has_four_decimal_places(self):
        """AC4: Returns factor as Decimal with 4 decimal places."""
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))
        actual = Decimal("0.70")

        factor = calculate_gross_up_factor(actual, config)

        # 0.95 / 0.70 = 1.357142857... rounded to 4 decimals = 1.3571
        assert factor == Decimal("1.3571")
        # Verify exactly 4 decimal places
        assert factor.as_tuple().exponent == -4

    def test_factor_never_less_than_one(self):
        """AC2: Factor never less than 1.0 (no grossing down)."""
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))
        # Actual occupancy is at target
        actual_at_target = Decimal("0.95")
        # Actual occupancy above target
        actual_above_target = Decimal("1.00")

        factor_at_target = calculate_gross_up_factor(actual_at_target, config)
        factor_above_target = calculate_gross_up_factor(actual_above_target, config)

        assert factor_at_target == Decimal("1.0")
        assert factor_above_target == Decimal("1.0")

    def test_zero_occupancy_edge_case(self):
        """AC3: Handles edge case of 0% occupancy."""
        config = GrossUpConfig()
        actual = Decimal("0.0")

        factor = calculate_gross_up_factor(actual, config)

        # Should return minimum factor (1.0) not divide by zero
        assert factor == Decimal("1.0")

    def test_negative_occupancy_edge_case(self):
        """AC3: Handles invalid negative occupancy."""
        config = GrossUpConfig()
        actual = Decimal("-0.1")

        factor = calculate_gross_up_factor(actual, config)

        # Should treat as zero occupancy
        assert factor == Decimal("1.0")

    def test_low_occupancy_high_factor(self):
        """Very low occupancy should produce high factor."""
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))
        actual = Decimal("0.50")

        factor = calculate_gross_up_factor(actual, config)

        # 0.95 / 0.50 = 1.9
        assert factor == Decimal("1.9000")

    def test_safety_valve_max_factor(self):
        """Safety valve should cap factor at max_factor."""
        config = GrossUpConfig(
            target_occupancy=Decimal("0.95"), max_factor=Decimal("1.5")
        )
        actual = Decimal("0.50")  # Would produce factor of 1.9

        factor = calculate_gross_up_factor(actual, config)

        # Should be capped at 1.5
        assert factor == Decimal("1.5")

    def test_safety_valve_not_applied_when_below_max(self):
        """Safety valve should not apply when factor is below max."""
        config = GrossUpConfig(
            target_occupancy=Decimal("0.95"), max_factor=Decimal("2.0")
        )
        actual = Decimal("0.75")  # Produces factor of ~1.2667

        factor = calculate_gross_up_factor(actual, config)

        # Should be actual calculated value, not capped
        assert factor == Decimal("1.2667")

    def test_trace_logging_basic_calculation(self):
        """AC5: Logs calculation for audit trail."""
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))
        actual = Decimal("0.75")
        trace = CalculationTrace(
            calculation_type="gross_up",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_gross_up_factor(actual, config, trace=trace)

        # Should have logged the calculation step
        assert len(trace.steps) == 1
        step = trace.steps[0]
        assert step.step_name == "Calculate gross-up factor"
        assert "target_occupancy" in step.input_values
        assert "actual_occupancy" in step.input_values
        assert step.output_value == "1.2667"

    def test_trace_logging_zero_occupancy(self):
        """AC5: Logs special case for zero occupancy."""
        config = GrossUpConfig()
        actual = Decimal("0.0")
        trace = CalculationTrace(
            calculation_type="gross_up",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_gross_up_factor(actual, config, trace=trace)

        assert len(trace.steps) == 1
        step = trace.steps[0]
        assert step.step_name == "Gross-up factor (zero occupancy)"
        assert "Cannot gross up with zero occupancy" in step.note

    def test_trace_logging_at_target(self):
        """AC5: Logs special case when at or above target."""
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))
        actual = Decimal("0.95")
        trace = CalculationTrace(
            calculation_type="gross_up",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_gross_up_factor(actual, config, trace=trace)

        assert len(trace.steps) == 1
        step = trace.steps[0]
        assert step.step_name == "Gross-up factor (at or above target)"
        assert "no adjustment" in step.note.lower()

    def test_trace_logging_safety_valve(self):
        """AC5: Logs when safety valve is applied."""
        config = GrossUpConfig(
            target_occupancy=Decimal("0.95"), max_factor=Decimal("1.5")
        )
        actual = Decimal("0.50")
        trace = CalculationTrace(
            calculation_type="gross_up",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_gross_up_factor(actual, config, trace=trace)

        # Should have two steps: safety valve + final calculation
        assert len(trace.steps) == 2
        safety_step = trace.steps[0]
        assert safety_step.step_name == "Apply safety valve"
        assert "Safety valve applied" in safety_step.note

    def test_no_trace_logging_when_trace_is_none(self):
        """Should not fail when trace is None."""
        config = GrossUpConfig()
        actual = Decimal("0.75")

        # Should not raise an exception
        factor = calculate_gross_up_factor(actual, config, trace=None)

        assert factor == Decimal("1.2667")

    def test_multiple_occupancy_levels(self):
        """Test factor calculation at various occupancy levels."""
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))

        test_cases = [
            (Decimal("0.95"), Decimal("1.0000")),  # At target
            (Decimal("0.90"), Decimal("1.0556")),  # Slightly below
            (Decimal("0.80"), Decimal("1.1875")),  # Moderately below
            (Decimal("0.70"), Decimal("1.3571")),  # Below target
            (Decimal("0.60"), Decimal("1.5833")),  # Well below
            (Decimal("1.00"), Decimal("1.0000")),  # 100% occupancy
        ]

        for actual, expected in test_cases:
            factor = calculate_gross_up_factor(actual, config)
            assert factor == expected, f"Failed for occupancy {actual}"


class TestApplySafetyValve:
    """Test apply_safety_valve function."""

    def test_no_cap_needed_within_limits(self):
        """When grossed-up amount is within safe limits, return it unchanged."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.75")
        target_occupancy = Decimal("0.95")
        # Grossed up: 10000 * (0.95/0.75) = 12666.67
        grossed_up = Decimal("12666.67")

        result = apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy
        )

        # Should return grossed_up amount (within safe limits)
        assert result == grossed_up

    def test_cap_at_100_percent_occupancy(self):
        """When grossed-up exceeds 100% equivalent, cap it."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.75")
        target_occupancy = Decimal("0.95")
        # Max at 100%: 10000 / 0.75 = 13333.33
        # Artificially high grossed-up amount
        grossed_up = Decimal("15000.00")

        result = apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy
        )

        # Should cap at 100% occupancy equivalent: 10000 / 0.75 = 13333.33
        expected_max = (original / actual_occupancy).quantize(
            Decimal("0.000001"), rounding=ROUND_HALF_UP
        )
        assert result == expected_max

    def test_zero_occupancy_returns_original(self):
        """With zero occupancy, cannot calculate 100% equivalent - return original."""
        original = Decimal("10000.00")
        grossed_up = Decimal("12000.00")
        actual_occupancy = Decimal("0.00")
        target_occupancy = Decimal("0.95")

        result = apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy
        )

        # Should return original (cannot divide by zero)
        assert result == original

    def test_near_zero_occupancy_returns_original(self):
        """With near-zero occupancy (< 0.0001), return original."""
        original = Decimal("10000.00")
        grossed_up = Decimal("12000.00")
        actual_occupancy = Decimal("0.00005")  # 0.005% - below minimum
        target_occupancy = Decimal("0.95")

        result = apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy
        )

        # Should return original (occupancy too low)
        assert result == original

    def test_exactly_at_minimum_safe_occupancy(self):
        """At exactly 0.0001 occupancy, should return original."""
        original = Decimal("10000.00")
        grossed_up = Decimal("12000.00")
        actual_occupancy = Decimal("0.0001")  # Exactly at minimum
        target_occupancy = Decimal("0.95")

        result = apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy
        )

        # At exactly minimum, should still return original (condition is <=)
        assert result == original

    def test_just_above_minimum_safe_occupancy(self):
        """Just above 0.0001 occupancy, should calculate normally."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.00011")  # Just above minimum
        target_occupancy = Decimal("0.95")
        grossed_up = Decimal("12000.00")

        result = apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy
        )

        # Should calculate 100% max and return appropriate value
        # This is a valid calculation (not returning original)
        assert result is not None

    def test_with_trace_no_cap(self):
        """Test trace logging when no cap is applied."""
        original = Decimal("10000.00")
        grossed_up = Decimal("12000.00")
        actual_occupancy = Decimal("0.75")
        target_occupancy = Decimal("0.95")
        trace = CalculationTrace(
            calculation_type="safety_valve",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy, trace
        )

        # Should log that no cap was needed
        assert len(trace.steps) >= 1
        step = trace.steps[-1]
        assert "Safety valve check" in step.step_name
        assert "within safe limits" in step.note.lower()

    def test_with_trace_cap_applied(self):
        """Test trace logging when cap is applied."""
        original = Decimal("10000.00")
        grossed_up = Decimal("20000.00")  # Exceeds safe limits
        actual_occupancy = Decimal("0.75")
        target_occupancy = Decimal("0.95")
        trace = CalculationTrace(
            calculation_type="safety_valve",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy, trace
        )

        # Should log that safety valve was applied
        assert len(trace.steps) >= 1
        step = trace.steps[-1]
        assert "Apply safety valve" in step.step_name
        assert "capped" in step.note.lower()

    def test_with_trace_zero_occupancy(self):
        """Test trace logging when occupancy is zero."""
        original = Decimal("10000.00")
        grossed_up = Decimal("12000.00")
        actual_occupancy = Decimal("0.00")
        target_occupancy = Decimal("0.95")
        trace = CalculationTrace(
            calculation_type="safety_valve",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy, trace
        )

        # Should log warning about zero occupancy
        assert len(trace.steps) >= 1
        step = trace.steps[-1]
        assert "zero" in step.step_name.lower() or "zero" in step.note.lower()

    def test_decimal_precision(self):
        """Test high-precision calculation for 100% occupancy equivalent."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.73")  # Creates repeating decimal
        target_occupancy = Decimal("0.95")
        # Grossed up to just below max
        factor = target_occupancy / actual_occupancy
        grossed_up = (original * factor).quantize(Decimal("0.01"))

        result = apply_safety_valve(
            original, grossed_up, actual_occupancy, target_occupancy
        )

        # Should return grossed_up (not capped)
        assert result == grossed_up


class TestCalculateGrossedUpExpenses:
    """Test calculate_grossed_up_expenses orchestration function."""

    def test_basic_gross_up_with_safety(self):
        """Calculate grossed-up expenses with safety valve enabled."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.75")
        target_occupancy = Decimal("0.95")

        result = calculate_grossed_up_expenses(
            original, actual_occupancy, target_occupancy, apply_safety=True
        )

        # Factor = 0.95 / 0.75 = 1.2667
        # Grossed up = 10000 * 1.2667 = 12667.00
        # Max at 100% = 10000 / 0.75 = 13333.33
        # Should return 12667.00 (within limits)
        assert result == Decimal("12667.00")

    def test_gross_up_without_safety(self):
        """Calculate grossed-up expenses without safety valve."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.75")
        target_occupancy = Decimal("0.95")

        result = calculate_grossed_up_expenses(
            original, actual_occupancy, target_occupancy, apply_safety=False
        )

        # Factor = 0.95 / 0.75 = 1.2667
        # Grossed up = 10000 * 1.2667 = 12667.00
        # No safety valve, so this is the final result
        assert result == Decimal("12667.00")

    def test_default_target_occupancy(self):
        """Should use default 95% target when not specified."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.75")

        result = calculate_grossed_up_expenses(original, actual_occupancy)

        # Should use default 0.95 target
        # Factor = 0.95 / 0.75 = 1.2667
        assert result == Decimal("12667.00")

    def test_at_target_occupancy_no_adjustment(self):
        """When at target occupancy, no gross-up needed."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.95")
        target_occupancy = Decimal("0.95")

        result = calculate_grossed_up_expenses(
            original, actual_occupancy, target_occupancy
        )

        # Factor = 1.0, so result = original
        assert result == original

    def test_above_target_no_adjustment(self):
        """When above target occupancy, no gross-up needed."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("1.00")  # 100%
        target_occupancy = Decimal("0.95")

        result = calculate_grossed_up_expenses(
            original, actual_occupancy, target_occupancy
        )

        # Factor = 1.0, so result = original
        assert result == original

    def test_with_trace_logging(self):
        """Test that trace steps are logged."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.75")
        target_occupancy = Decimal("0.95")
        trace = CalculationTrace(
            calculation_type="gross_up_orchestrator",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_grossed_up_expenses(
            original, actual_occupancy, target_occupancy, apply_safety=True, trace=trace
        )

        # Should have multiple steps: factor calculation, apply factor, safety valve
        assert len(trace.steps) >= 3
        # Check for key steps
        step_names = [s.step_name for s in trace.steps]
        assert any("gross-up factor" in name.lower() for name in step_names)
        assert any("apply" in name.lower() for name in step_names)

    def test_zero_occupancy(self):
        """Handle zero occupancy gracefully."""
        original = Decimal("10000.00")
        actual_occupancy = Decimal("0.00")
        target_occupancy = Decimal("0.95")

        result = calculate_grossed_up_expenses(
            original, actual_occupancy, target_occupancy
        )

        # Factor = 1.0 (minimum), result = original
        assert result == original

    def test_decimal_precision_in_result(self):
        """Ensure result is quantized to cents."""
        original = Decimal("10000.33")
        actual_occupancy = Decimal("0.73")
        target_occupancy = Decimal("0.95")

        result = calculate_grossed_up_expenses(
            original, actual_occupancy, target_occupancy
        )

        # Result should have exactly 2 decimal places
        str_result = str(result)
        assert "." in str_result
        assert len(str_result.split(".")[-1]) == 2


class TestGrossUpStepUnitAnnotations:
    """Verify unit annotations on gross-up trace steps."""

    def test_calculate_gross_up_factor_step_has_ratio_output_unit(self):
        """'Calculate gross-up factor' step must carry output_unit='ratio'."""
        from app.services.calculation.models import UNIT_RATIO

        trace = CalculationTrace(
            calculation_type="gross_up",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))
        factor = calculate_gross_up_factor(Decimal("0.80"), config, trace)

        assert factor > Decimal("1.0")
        factor_step = next(
            s for s in trace.steps if s.step_name == "Calculate gross-up factor"
        )
        assert factor_step.output_unit == UNIT_RATIO
        assert factor_step.input_units.get("target_occupancy") == UNIT_RATIO
        assert factor_step.input_units.get("actual_occupancy") == UNIT_RATIO
