"""
Tests for expense cap calculations.

Story: 6.6 - Create Non-Cumulative Cap
Tests verify non-cumulative cap logic with percentage and fixed dollar caps.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.calculation.caps import (
    CapInput,
    CapType,
    apply_cap,
    calculate_cumulative_cap,
    calculate_cumulative_compounding_cap,
    calculate_non_cumulative_cap,
)
from app.services.calculation.models import CalculationTrace


class TestCalculateNonCumulativeCap:
    """Test non-cumulative cap calculation."""

    def test_year_1_no_cap(self):
        """AC2: Year 1 has no cap (no prior year)."""
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("100000.00"),
            prior_amount=None,
            cap_rate=Decimal("0.05"),
        )

        assert result.original_amount == Decimal("100000.00")
        assert result.capped_amount == Decimal("100000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == Decimal("0")

    def test_percentage_cap_under_limit(self):
        """AC1: Percentage cap when under limit."""
        # Prior: $100k, Current: $103k, Cap: 5%
        # Max allowed: 100k * 1.05 = 105k
        # 103k < 105k, so no cap applied
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("103000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
        )

        assert result.original_amount == Decimal("103000.00")
        assert result.capped_amount == Decimal("103000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        # AC3: Headroom = max_allowed - current = 105k - 103k = 2k
        assert result.cap_headroom == Decimal("2000.00")

    def test_percentage_cap_over_limit(self):
        """AC1: Percentage cap when over limit."""
        # Prior: $100k, Current: $110k, Cap: 5%
        # Max allowed: 100k * 1.05 = 105k
        # 110k > 105k, so cap to 105k
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("110000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
        )

        # AC4: Returns both capped and uncapped amounts
        assert result.original_amount == Decimal("110000.00")
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("5000.00")
        # AC3: No headroom when over cap
        assert result.cap_headroom == Decimal("0")

    def test_percentage_cap_exactly_at_limit(self):
        """AC1: Percentage cap when exactly at limit."""
        # Prior: $100k, Current: $105k, Cap: 5%
        # Max allowed: 100k * 1.05 = 105k
        # 105k == 105k, no cap needed
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("105000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
        )

        assert result.original_amount == Decimal("105000.00")
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == Decimal("0")

    def test_fixed_dollar_cap_under_limit(self):
        """AC6: Fixed dollar cap when under limit."""
        # Prior: $100k, Current: $103k, Cap: +$5k
        # Max allowed: 100k + 5k = 105k
        # 103k < 105k, so no cap applied
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("103000.00"),
            prior_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),
        )

        assert result.original_amount == Decimal("103000.00")
        assert result.capped_amount == Decimal("103000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == Decimal("2000.00")

    def test_fixed_dollar_cap_over_limit(self):
        """AC6: Fixed dollar cap when over limit."""
        # Prior: $100k, Current: $110k, Cap: +$5k
        # Max allowed: 100k + 5k = 105k
        # 110k > 105k, so cap to 105k
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("110000.00"),
            prior_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),
        )

        assert result.original_amount == Decimal("110000.00")
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("5000.00")
        assert result.cap_headroom == Decimal("0")

    def test_high_percentage_cap(self):
        """AC1: Higher percentage cap (10%)."""
        # Prior: $100k, Current: $109k, Cap: 10%
        # Max allowed: 100k * 1.10 = 110k
        # 109k < 110k, so no cap applied
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("109000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.10"),
        )

        assert result.original_amount == Decimal("109000.00")
        assert result.capped_amount == Decimal("109000.00")
        assert result.cap_applied is False
        assert result.cap_headroom == Decimal("1000.00")

    def test_small_percentage_cap(self):
        """AC1: Small percentage cap (3%)."""
        # Prior: $100k, Current: $105k, Cap: 3%
        # Max allowed: 100k * 1.03 = 103k
        # 105k > 103k, so cap to 103k
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("105000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.03"),
        )

        assert result.original_amount == Decimal("105000.00")
        assert result.capped_amount == Decimal("103000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("2000.00")

    def test_trace_year_1(self):
        """AC5: Trace shows cap calculation for year 1."""
        trace = CalculationTrace(
            calculation_type="cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_non_cumulative_cap(
            current_amount=Decimal("100000.00"),
            prior_amount=None,
            cap_rate=Decimal("0.05"),
            trace=trace,
        )

        assert len(trace.steps) == 1
        step = trace.steps[0]
        assert step.step_name == "Non-cumulative cap (Year 1)"
        assert step.operation == "No cap - first year"
        assert step.output_value == "100000.00"

    def test_trace_with_cap_applied(self):
        """AC5: Trace shows cap calculation when cap is applied."""
        trace = CalculationTrace(
            calculation_type="cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_non_cumulative_cap(
            current_amount=Decimal("110000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            trace=trace,
        )

        assert len(trace.steps) == 2

        # Step 1: Calculate max allowed
        assert trace.steps[0].step_name == "Calculate max allowed"
        assert trace.steps[0].output_value == "105000.00"

        # Step 2: Apply cap
        assert trace.steps[1].step_name == "Apply non-cumulative cap"
        assert trace.steps[1].output_value == "105000.00"
        assert "Cap applied" in trace.steps[1].note

    def test_trace_with_no_cap_needed(self):
        """AC5: Trace shows calculation when no cap needed."""
        trace = CalculationTrace(
            calculation_type="cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_non_cumulative_cap(
            current_amount=Decimal("103000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            trace=trace,
        )

        assert len(trace.steps) == 2

        # Step 2: Shows within cap limit
        assert trace.steps[1].step_name == "Apply non-cumulative cap"
        assert trace.steps[1].output_value == "103000.00"
        assert "Within cap limit" in trace.steps[1].note

    def test_trace_with_fixed_dollar_cap(self):
        """AC5: Trace shows fixed dollar cap calculation."""
        trace = CalculationTrace(
            calculation_type="cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_non_cumulative_cap(
            current_amount=Decimal("110000.00"),
            prior_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),
            trace=trace,
        )

        assert len(trace.steps) == 2

        # Step 1: Should show fixed dollar operation
        assert trace.steps[0].step_name == "Calculate max allowed"
        assert trace.steps[0].output_value == "105000.00"

    def test_missing_cap_parameters_raises_error(self):
        """Should raise error if neither cap_rate nor cap_fixed_amount provided."""
        with pytest.raises(
            ValueError, match="Either cap_rate or cap_fixed_amount must be provided"
        ):
            calculate_non_cumulative_cap(
                current_amount=Decimal("110000.00"),
                prior_amount=Decimal("100000.00"),
            )

    def test_cap_rate_magnitude_validation(self):
        """FIX CAP-5: Reject cap rates >100% (likely data entry errors)."""
        # User likely meant 5% (0.05) but entered 5
        with pytest.raises(ValueError, match="cap_rate .* exceeds maximum"):
            calculate_non_cumulative_cap(
                current_amount=Decimal("110000.00"),
                prior_amount=Decimal("100000.00"),
                cap_rate=Decimal("5"),  # 500% - likely meant 0.05
            )

    def test_cap_rate_100_percent_allowed(self):
        """FIX CAP-5: 100% cap rate (doubling) should be allowed."""
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("250000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("1.0"),  # 100% - max allowed
        )
        # Max = 100k * 2 = 200k, current = 250k, so capped to 200k
        assert result.capped_amount == Decimal("200000.00")
        assert result.cap_applied is True

    def test_decimal_precision(self):
        """Ensure proper decimal rounding."""
        # Prior: $100k, Current: $105,500.555, Cap: 5%
        # Max allowed: 100k * 1.05 = 105,000.00
        # Should round to 2 decimals
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("105500.555"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
        )

        assert result.capped_amount == Decimal("105000.00")
        assert result.savings_from_cap == Decimal("500.56")  # Rounded difference

    def test_zero_prior_amount(self):
        """Handle edge case of zero prior amount - FIX CAP-4.

        Zero prior year cannot establish a meaningful baseline for percentage caps.
        Would lock tenant to $0 forever (0 * 1.05 = 0).
        Treat like Year 1 - allow full amount.
        """
        # Prior: $0, Current: $100k, Cap: 5%
        # FIX CAP-4: Zero prior year has no meaningful baseline
        # Should allow full amount (like Year 1)
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("100000.00"),
            prior_amount=Decimal("0"),
            cap_rate=Decimal("0.05"),
        )

        # FIX CAP-4: No cap applied when prior year is zero
        assert result.capped_amount == Decimal("100000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")

    def test_zero_prior_amount_with_trace(self):
        """FIX CAP-4: Trace documents zero prior year handling."""
        trace = CalculationTrace(
            calculation_type="cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_non_cumulative_cap(
            current_amount=Decimal("100000.00"),
            prior_amount=Decimal("0"),
            cap_rate=Decimal("0.05"),
            trace=trace,
        )

        assert len(trace.steps) == 1
        step = trace.steps[0]
        assert step.step_name == "Non-cumulative cap (zero prior year)"
        assert "zero prior year" in step.operation.lower()
        assert "CAP-4" in step.note

    def test_decreasing_expenses(self):
        """AC3: When expenses decrease, no cap needed."""
        # Prior: $100k, Current: $95k, Cap: 5%
        # Max allowed: 100k * 1.05 = 105k
        # 95k < 105k, and expenses went down, so no cap
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("95000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
        )

        assert result.capped_amount == Decimal("95000.00")
        assert result.cap_applied is False
        assert result.cap_headroom == Decimal("10000.00")


class TestCalculateCumulativeCap:
    """Test cumulative cap calculation with bank carry-forward."""

    def test_year_1_no_bank(self):
        """Year 1 has no bank (no prior years to accumulate from)."""
        # Base: $100k, Current: $103k, Cap: 5%, Year 1
        # Max allowed: 100k + (100k * 5%) = 105k
        # Bank: 0 (no prior years)
        # 103k < 105k, no cap, bank = 2k for next year
        result = calculate_cumulative_cap(
            current_amount=Decimal("103000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
        )

        assert result.original_amount == Decimal("103000.00")
        assert result.capped_amount == Decimal("103000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        # Headroom = max - current = 105k - 103k = 2k
        assert result.cap_headroom == Decimal("2000.00")

    def test_year_2_builds_bank(self):
        """Year 2 under limit builds bank."""
        # Base: $100k, Year 1 actual: $102k, Year 2 current: $105k
        # Cap: 5% per year
        # Year 2 max from base: 100k + (5k * 2) = 110k
        # Bank from year 1: (105k max year 1) - (102k actual) = 3k
        # Max allowed year 2: 102k + 5k + 3k = 110k
        # 105k < 110k, no cap, builds bank
        result = calculate_cumulative_cap(
            current_amount=Decimal("105000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("102000.00")],
        )

        assert result.original_amount == Decimal("105000.00")
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        # Bank = 110k - 105k = 5k
        assert result.cap_headroom == Decimal("5000.00")

    def test_year_3_uses_bank(self):
        """Year 3 over annual limit uses bank."""
        # Base: $100k, Cap: 5%
        # Year 1 actual: $102k (banked 3k)
        # Year 2 actual: $105k (banked 5k total)
        # Year 3 current: $112k
        # Annual limit: 5k, Bank: 5k, Max: 105k + 5k + 5k = 115k
        # 112k < 115k, no cap needed, uses some bank
        result = calculate_cumulative_cap(
            current_amount=Decimal("112000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[Decimal("102000.00"), Decimal("105000.00")],
        )

        assert result.original_amount == Decimal("112000.00")
        assert result.capped_amount == Decimal("112000.00")
        assert result.cap_applied is False

    def test_over_limit_cap_applied(self):
        """Cap is applied when current exceeds max + bank."""
        # Base: $100k, Cap: 5%
        # Year 1 actual: $102k (banked 3k)
        # Year 2 current: $120k
        # Max year 2: 102k + 5k + 3k = 110k
        # 120k > 110k, cap to 110k, save 10k
        result = calculate_cumulative_cap(
            current_amount=Decimal("120000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("102000.00")],
        )

        assert result.original_amount == Decimal("120000.00")
        assert result.capped_amount == Decimal("110000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("10000.00")
        assert result.cap_headroom == Decimal("0")

    def test_fixed_dollar_cap(self):
        """Fixed dollar cap mode (linear growth)."""
        # Base: $100k, Fixed cap: $5k/year, Year 2
        # Max: 100k + (5k * 2) = 110k
        # Current: $108k
        result = calculate_cumulative_cap(
            current_amount=Decimal("108000.00"),
            base_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),
            years_since_base=2,
            prior_year_amounts=[Decimal("103000.00")],
        )

        assert result.capped_amount == Decimal("108000.00")
        assert result.cap_applied is False

    def test_trace_logging(self):
        """Trace logs cumulative cap steps."""
        trace = CalculationTrace(
            calculation_type="cumulative_cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_cumulative_cap(
            current_amount=Decimal("105000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("102000.00")],
            trace=trace,
        )

        # Should have at least 3 steps:
        # 1. Calculate cumulative cap
        # 2. Calculate cap bank
        # 3. Calculate max allowed this year
        # 4. Apply cumulative cap
        assert len(trace.steps) >= 3
        assert any("cumulative cap" in step.step_name.lower() for step in trace.steps)

    def test_missing_cap_parameters_raises_error(self):
        """Should raise error if neither cap_rate nor cap_fixed_amount provided."""
        with pytest.raises(
            ValueError, match="Either cap_rate or cap_fixed_amount must be provided"
        ):
            calculate_cumulative_cap(
                current_amount=Decimal("110000.00"),
                base_amount=Decimal("100000.00"),
                years_since_base=1,
            )


class TestCalculateCumulativeCompoundingCap:
    """Test cumulative compounding cap calculation."""

    def test_exponential_growth_year_1(self):
        """Year 1 with exponential growth."""
        # Base: $100k, Cap: 5%, Year 1
        # Max: 100k * (1.05)^1 = 105k
        # Current: $103k
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("103000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
        )

        assert result.original_amount == Decimal("103000.00")
        # Compounded: 100k * 1.05 = 105k
        assert result.capped_amount == Decimal("103000.00")
        assert result.cap_applied is False

    def test_exponential_growth_year_3(self):
        """Year 3 shows exponential growth difference."""
        # Base: $100k, Cap: 5%, Year 3
        # Compounded max: 100k * (1.05)^3 = 115,762.50
        # Linear would be: 100k + (5k * 3) = 115,000
        # Difference: $762.50
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("115000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[Decimal("103000.00"), Decimal("107000.00")],
        )

        # Max = 100k * 1.05^3 = 115,762.50
        # Current = 115k < max, so no cap
        assert result.capped_amount == Decimal("115000.00")
        assert result.cap_applied is False

    def test_with_bank_carry_forward(self):
        """Bank calculation with cumulative max."""
        # Base: $100k, Cap: 5%
        # Year 1 max: 105k, actual: 102k, bank: 3k
        # Year 2 max: 110.25k, current: 112k
        # With bank: 110.25k + 3k = 113.25k
        # 112k < 113.25k, no cap
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("112000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("102000.00")],
        )

        assert result.capped_amount == Decimal("112000.00")
        assert result.cap_applied is False

    def test_over_limit_with_compounding(self):
        """Cap applied when over compounded limit."""
        # Base: $100k, Cap: 5%, Year 2
        # Max: 100k * 1.05^2 = 110,250
        # Current: $115k
        # 115k > 110.25k, cap to 110.25k
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("115000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("103000.00")],
        )

        # Should be capped at 110,250 + bank
        assert result.cap_applied is True
        assert result.capped_amount < Decimal("115000.00")

    def test_fixed_dollar_mode(self):
        """Fixed dollar mode uses linear growth (same as cumulative)."""
        # Base: $100k, Fixed: $5k/year, Year 2
        # Max: 100k + (5k * 2) = 110k
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("108000.00"),
            base_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),
            years_since_base=2,
            prior_year_amounts=[Decimal("103000.00")],
        )

        assert result.capped_amount == Decimal("108000.00")
        assert result.cap_applied is False

    def test_trace_logging(self):
        """Trace logs compounding cap steps."""
        trace = CalculationTrace(
            calculation_type="compounding_cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_cumulative_compounding_cap(
            current_amount=Decimal("105000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
            trace=trace,
        )

        assert len(trace.steps) >= 2
        assert any("compounding" in step.step_name.lower() for step in trace.steps)

    def test_missing_cap_parameters_raises_error(self):
        """Should raise error if neither cap_rate nor cap_fixed_amount provided."""
        with pytest.raises(
            ValueError, match="Either cap_rate or cap_fixed_amount must be provided"
        ):
            calculate_cumulative_compounding_cap(
                current_amount=Decimal("110000.00"),
                base_amount=Decimal("100000.00"),
                years_since_base=1,
            )

    def test_cap_rate_magnitude_validation(self):
        """FIX CAP-5: Reject cap rates >100% to prevent numeric overflow.

        Without this check, cap_rate=5 over 50 years would compute:
        (1 + 5)^50 = 6^50 ≈ 8 × 10^38 - causing overflow issues.
        """
        with pytest.raises(ValueError, match="cap_rate .* exceeds maximum"):
            calculate_cumulative_compounding_cap(
                current_amount=Decimal("110000.00"),
                base_amount=Decimal("100000.00"),
                cap_rate=Decimal("5"),  # 500% - would overflow at 50 years
                years_since_base=10,
            )


class TestApplyCap:
    """Test the apply_cap router function."""

    def test_cap_type_none(self):
        """CapType.NONE returns original amount unchanged."""
        cap_input = CapInput(
            cap_type=CapType.NONE,
            current_year_amount=Decimal("110000.00"),
        )

        result = apply_cap(cap_input)

        assert result.original_amount == Decimal("110000.00")
        assert result.capped_amount == Decimal("110000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == Decimal("0")

    def test_cap_type_non_cumulative(self):
        """CapType.NON_CUMULATIVE routes to non-cumulative cap function."""
        cap_input = CapInput(
            cap_type=CapType.NON_CUMULATIVE,
            current_year_amount=Decimal("110000.00"),
            prior_year_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
        )

        result = apply_cap(cap_input)

        # Should be capped at 105k (100k * 1.05)
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("5000.00")

    def test_cap_type_cumulative(self):
        """CapType.CUMULATIVE routes to cumulative cap function."""
        cap_input = CapInput(
            cap_type=CapType.CUMULATIVE,
            current_year_amount=Decimal("110000.00"),
            base_year_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            all_prior_amounts=[Decimal("102000.00")],
        )

        result = apply_cap(cap_input)

        # Should use cumulative logic with bank
        assert result.original_amount == Decimal("110000.00")
        # Capped amount depends on bank calculation
        assert isinstance(result.capped_amount, Decimal)

    def test_cap_type_cumulative_compounding(self):
        """CapType.CUMULATIVE_COMPOUNDING routes to compounding cap function."""
        cap_input = CapInput(
            cap_type=CapType.CUMULATIVE_COMPOUNDING,
            current_year_amount=Decimal("115000.00"),
            base_year_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            all_prior_amounts=[Decimal("103000.00")],
        )

        result = apply_cap(cap_input)

        # Should use exponential compounding logic
        assert result.original_amount == Decimal("115000.00")
        assert isinstance(result.capped_amount, Decimal)

    def test_unknown_cap_type_raises_error(self):
        """Unknown cap type raises ValueError."""
        cap_input = CapInput(
            cap_type="invalid_cap_type",
            current_year_amount=Decimal("110000.00"),
        )

        with pytest.raises(ValueError, match="Unknown cap type"):
            apply_cap(cap_input)
