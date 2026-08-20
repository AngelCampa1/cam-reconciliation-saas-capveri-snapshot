"""
Tests for cumulative compounding cap calculations.

Story 6.8: Create Cumulative Compounding Cap

The cumulative compounding cap is like the cumulative cap (6.7) but with
EXPONENTIAL growth instead of linear growth:
- Cumulative: max = base + (rate * base * years) - LINEAR
- Compounding: max = base * (1 + rate)^years - EXPONENTIAL

Key differences over time (5% cap, $100k base):
Year 1: Linear $105k vs Compound $105k (same)
Year 3: Linear $115k vs Compound $115.76k (+$760)
Year 5: Linear $125k vs Compound $127.63k (+$2.63k)
Year 10: Linear $150k vs Compound $162.89k (+$12.89k)

Bank still accumulates when spending is below the compounded max.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest

from app.services.calculation.caps import calculate_cumulative_compounding_cap
from app.services.calculation.models import CalculationTrace


class TestCalculateCumulativeCompoundingCap:
    """Test cumulative compounding cap calculations."""

    def test_year_1_equals_simple_cap(self):
        """AC1: Year 1 compounding = linear (both are base * 1.05)."""
        # Base: $100k, Cap: 5%
        # Year 1 Linear: $105k
        # Year 1 Compound: $100k * 1.05^1 = $105k
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("102000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
        )

        # Max allowed = $100k * 1.05^1 = $105k
        assert result.capped_amount == Decimal("102000.00")
        assert result.cap_applied is False
        assert result.cap_headroom == Decimal("3000.00")  # $105k - $102k

    def test_year_3_exponential_growth(self):
        """AC2: Year 3 shows exponential growth via formula."""
        # Base: $100k, Cap: 5%
        # Year 3 Linear: $100k + (3 * $5k) = $115k
        # Year 3 Compound: $100k * 1.05^3 = $115,762.50
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("115500.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[
                Decimal("102000.00"),  # Year 1
                Decimal("107000.00"),  # Year 2
            ],
        )

        # Max allowed = $100k * 1.05^3 = $115,762.50
        assert result.capped_amount == Decimal("115500.00")
        assert result.cap_applied is False
        # Max with no bank would be $115,762.50
        # We have bank because we spent under max in years 1 and 2

    def test_5_year_compound_growth(self):
        """AC3: 5-year test shows significant compounding effect."""
        # Base: $100k, Cap: 5%
        # Year 5 Linear: $100k + (5 * $5k) = $125k
        # Year 5 Compound: $100k * 1.05^5 = $127,628.16
        # Difference: $2,628.16 (2.1% more than linear)
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("127000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=5,
            prior_year_amounts=[
                Decimal("105000.00"),  # Year 1: at max
                Decimal("110250.00"),  # Year 2: at max
                Decimal("115762.50"),  # Year 3: at max
                Decimal("121550.63"),  # Year 4: at max
            ],
        )

        # Max allowed = $100k * 1.05^5 = $127,628.16
        # Current = $127k < max, so not capped
        assert result.capped_amount == Decimal("127000.00")
        assert result.cap_applied is False
        assert result.cap_headroom > Decimal("0")  # Has headroom

    def test_bank_accumulates_when_under_cap(self):
        """AC4: Bank still accumulates with compounding caps."""
        # Year 1: Spend $102k, max $105k, bank $3k
        # Year 2: Spend $104k, max $110.25k + $3k bank
        # Bank grows because we're under compounded max each year
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("112000.00"),  # Current year
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[
                Decimal("102000.00"),  # Year 1: $3k under max
            ],
        )

        # Year 2 compounded max: $100k * 1.05^2 = $110,250
        # Year 1 compounded max: $100k * 1.05^1 = $105,000
        # Bank from year 1: $105k - $102k = $3k
        # Effective max year 2: $110,250 + $3k = $113,250
        # Current $112k < $113,250, so not capped
        assert result.capped_amount == Decimal("112000.00")
        assert result.cap_applied is False

    def test_bank_used_when_over_annual_compounded_max(self):
        """AC4: Bank can be used to exceed year's compounded max."""
        # Year 1: Spent $100k (under $105k max, bank $5k)
        # Year 2: Want to spend $113k
        # Year 2 compounded max: $110.25k
        # With bank: $110.25k + $5k = $115.25k
        # Can spend $113k using the bank
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("113000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[
                Decimal("100000.00"),  # Year 1: $5k under max
            ],
        )

        # Year 2 max: $110,250
        # Bank: $5k
        # Effective max: $115,250
        # Current $113k < effective max
        assert result.capped_amount == Decimal("113000.00")
        assert result.cap_applied is False

    def test_cap_applied_when_over_max_with_bank(self):
        """AC4: Cap applies when amount exceeds compounded max + bank."""
        # Year 2: Max $110.25k, no bank, try to spend $120k
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("120000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[
                Decimal("105000.00"),  # Year 1: at max, no bank
            ],
        )

        # Year 2 compounded max: $110,250
        # No bank (spent exactly max last year)
        # Current $120k > $110,250, capped
        assert result.capped_amount == Decimal("110250.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("9750.00")
        assert result.cap_headroom == Decimal("0.00")

    def test_trace_shows_compounding_calculation(self):
        """AC5: Trace includes compound formula and factor."""
        trace = CalculationTrace(
            calculation_type="cap_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_cumulative_compounding_cap(
            current_amount=Decimal("115000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[
                Decimal("105000.00"),
                Decimal("110250.00"),
            ],
            trace=trace,
        )

        # Should have compounding calculation step
        steps = trace.steps
        assert len(steps) >= 1

        # Find the compounding step
        compound_step = next(
            (s for s in steps if "compounding cap" in s.step_name.lower()), None
        )
        assert compound_step is not None
        assert (
            "1 + 0.05" in compound_step.operation or "1.05" in compound_step.operation
        )
        assert "^3" in compound_step.operation or "** 3" in compound_step.operation

        # Should show compound factor in note
        assert compound_step.note is not None
        assert "compound factor" in compound_step.note.lower()

    def test_fixed_dollar_cap(self):
        """AC6: Fixed dollar caps use additive compounding."""
        # Fixed $5k cap means: Year N = base + (N * $5k)
        # This is actually linear for fixed dollar (same as cumulative)
        # Year 3: $100k + (3 * $5k) = $115k
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("114000.00"),
            base_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),
            years_since_base=3,
            prior_year_amounts=[
                Decimal("105000.00"),  # Year 1
                Decimal("110000.00"),  # Year 2
            ],
        )

        # Max = $100k + (3 * $5k) = $115k
        assert result.capped_amount == Decimal("114000.00")
        assert result.cap_applied is False

    def test_10_year_exponential_growth(self):
        """Demonstrate long-term exponential effect (10 years)."""
        # Base: $100k, Cap: 5%
        # Year 10 Linear: $100k + (10 * $5k) = $150k
        # Year 10 Compound: $100k * 1.05^10 = $162,889.46
        # Difference: $12,889.46 (8.6% more than linear)
        prior_amounts = [
            Decimal("105000.00"),  # Year 1
            Decimal("110250.00"),  # Year 2
            Decimal("115762.50"),  # Year 3
            Decimal("121550.63"),  # Year 4
            Decimal("127628.16"),  # Year 5
            Decimal("134009.56"),  # Year 6
            Decimal("140710.04"),  # Year 7
            Decimal("147745.54"),  # Year 8
            Decimal("155132.82"),  # Year 9
        ]

        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("162000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=10,
            prior_year_amounts=prior_amounts,
        )

        # Max = $100k * 1.05^10 ≈ $162,889.46
        # Current $162k < max
        assert result.capped_amount == Decimal("162000.00")
        assert result.cap_applied is False

    def test_missing_cap_parameters_raises_error(self):
        """Must provide either cap_rate or cap_fixed_amount."""
        with pytest.raises(ValueError, match="cap_rate or cap_fixed_amount"):
            calculate_cumulative_compounding_cap(
                current_amount=Decimal("110000.00"),
                base_amount=Decimal("100000.00"),
                years_since_base=2,
            )

    def test_decimal_precision(self):
        """Results quantized to 2 decimal places."""
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("115762.505"),  # 3 decimals
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
        )

        # Should round to 2 decimals
        assert result.capped_amount == Decimal("115762.51")
        assert str(result.capped_amount).count(".") == 1
        assert len(str(result.capped_amount).split(".")[-1]) == 2

    def test_zero_base_amount(self):
        """Edge case: zero base amount."""
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("5000.00"),
            base_amount=Decimal("0.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
        )

        # With zero base, compounded max is 0
        # So current is capped to 0
        assert result.capped_amount == Decimal("0.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("5000.00")

    def test_high_year_1_no_bank_to_carry(self):
        """Year 1 at or over cap has no bank to carry forward."""
        # Year 1: Spend $105k (at max)
        # Year 2: Max is $110.25k, no bank
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("110000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[
                Decimal("105000.00"),  # Year 1 at max, no bank
            ],
        )

        # Year 2 max: $110,250
        # No bank
        # Current $110k < max
        assert result.capped_amount == Decimal("110000.00")
        assert result.cap_applied is False

    def test_trace_shows_bank_addition(self):
        """AC5: Trace shows bank being added to max."""
        trace = CalculationTrace(
            calculation_type="cap_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_cumulative_compounding_cap(
            current_amount=Decimal("112000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[
                Decimal("102000.00"),  # Under max, creates bank
            ],
            trace=trace,
        )

        # Should have bank addition step
        bank_step = next(
            (s for s in trace.steps if "bank" in s.step_name.lower()), None
        )
        assert bank_step is not None
        assert "max_allowed + bank" in bank_step.operation or "+" in bank_step.operation

    def test_year_1_with_no_prior_amounts(self):
        """Year 1: prior_year_amounts is empty or None."""
        result_none = calculate_cumulative_compounding_cap(
            current_amount=Decimal("104000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=None,
        )

        result_empty = calculate_cumulative_compounding_cap(
            current_amount=Decimal("104000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
        )

        # Both should give same result
        # Year 1 max: $105k
        assert result_none.capped_amount == Decimal("104000.00")
        assert result_empty.capped_amount == Decimal("104000.00")
        assert result_none.cap_applied is False
        assert result_empty.cap_applied is False
