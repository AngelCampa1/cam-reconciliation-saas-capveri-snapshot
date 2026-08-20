"""
Tests for cumulative expense cap calculations.

Story: 6.7 - Create Cumulative Cap
Tests verify cumulative cap logic with bank carry-forward.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.calculation.caps import (
    calculate_cumulative_cap,
)
from app.services.calculation.models import CalculationTrace


class TestCalculateCumulativeCap:
    """Test cumulative cap calculation with bank carry-forward."""

    def test_year_1_no_bank(self):
        """AC1: Year 1 has no bank (no prior years)."""
        # Base: $100k, Year 1: $103k, Cap: 5%
        # Max allowed: 100k * 1.05 = 105k
        # No bank because year 1
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
        # Headroom shows unused capacity this year
        assert result.cap_headroom == Decimal("2000.00")

    def test_year_2_under_cap_accumulates_bank(self):
        """AC1: Year 2 spending under cap accumulates to bank."""
        # Base: $100k, Cap: 5%
        # Year 1: Spent $102k (under $105k max)
        # Year 2: Current $104k
        # Cumulative max after 2 years: 100k * 1.10 = 110k
        # Cumulative actual: 102k + 104k = 206k
        # Year 1 bank: 105k - 102k = 3k
        # Max this year: 102k + 5k (annual) + 3k (bank) = 110k
        result = calculate_cumulative_cap(
            current_amount=Decimal("104000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("102000.00")],
        )

        assert result.original_amount == Decimal("104000.00")
        assert result.capped_amount == Decimal("104000.00")
        assert result.cap_applied is False
        # Remaining bank + unused this year: 3k + 6k = 9k total headroom
        assert result.cap_headroom == Decimal("6000.00")

    def test_year_3_uses_bank_when_over_annual_limit(self):
        """AC2: Bank capacity used when expenses exceed annual limit."""
        # Base: $100k, Cap: 5%
        # Year 1: Spent $102k (bank $3k)
        # Year 2: Spent $104k (bank now $6k total)
        # Year 3: Current $115k
        # Annual limit: $5k
        # Reference (Year 2 actual): $104k
        # Max this year: 104k + 5k (annual) + 6k (bank) = 115k
        # Can spend up to $115k by using the $6k bank
        result = calculate_cumulative_cap(
            current_amount=Decimal("115000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[
                Decimal("102000.00"),
                Decimal("104000.00"),
            ],
        )

        assert result.original_amount == Decimal("115000.00")
        assert result.capped_amount == Decimal("115000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        # Used entire bank, no headroom left
        assert result.cap_headroom == Decimal("0.00")

    def test_year_3_over_limit_even_with_bank(self):
        """AC4: Cannot exceed max even with banked capacity."""
        # Base: $100k, Cap: 5%
        # Year 1: Spent $102k (bank $3k)
        # Year 2: Spent $104k (bank $6k total)
        # Year 3: Current $120k
        # Max allowed: 104k + 5k + 6k = 115k
        # $120k exceeds max, so cap to $115k
        result = calculate_cumulative_cap(
            current_amount=Decimal("120000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[
                Decimal("102000.00"),
                Decimal("104000.00"),
            ],
        )

        assert result.original_amount == Decimal("120000.00")
        assert result.capped_amount == Decimal("115000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("5000.00")
        assert result.cap_headroom == Decimal("0")

    def test_multi_year_accumulation_scenario(self):
        """AC3: Multi-year test verifies bank accumulation and usage."""
        # Base: $100k, Cap: 5% ($5k/year)
        # Year 1: Spend $102k, Max $105k, Bank $3k
        # Year 2: Spend $103k, Max $110k cumulative, Bank increases to $7k
        # Year 3: Spend $108k, Max $115k cumulative, Bank increases to $9k
        # Year 4: Spend $120k, Max $113k (108k + 5k + 9k bank) -> capped to $122k

        # Year 1
        result_y1 = calculate_cumulative_cap(
            current_amount=Decimal("102000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
        )
        assert result_y1.capped_amount == Decimal("102000.00")

        # Year 2
        result_y2 = calculate_cumulative_cap(
            current_amount=Decimal("103000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("102000.00")],
        )
        assert result_y2.capped_amount == Decimal("103000.00")
        # Bank after year 2: (105k - 102k) + (110k cumulative - (102k + 103k)) = 3k + 5k = 7k headroom
        assert result_y2.cap_headroom == Decimal("7000.00")

        # Year 3
        result_y3 = calculate_cumulative_cap(
            current_amount=Decimal("108000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[
                Decimal("102000.00"),
                Decimal("103000.00"),
            ],
        )
        assert result_y3.capped_amount == Decimal("108000.00")
        # Headroom: max (103k + 5k + 7k = 115k) - 108k = 7k
        assert result_y3.cap_headroom == Decimal("7000.00")

        # Year 4 - try to spend $120k
        result_y4 = calculate_cumulative_cap(
            current_amount=Decimal("120000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=4,
            prior_year_amounts=[
                Decimal("102000.00"),
                Decimal("103000.00"),
                Decimal("108000.00"),
            ],
        )
        # Max: 108k + 5k + 7k = 120k exactly
        assert result_y4.capped_amount == Decimal("120000.00")
        assert result_y4.cap_applied is False

    def test_fixed_dollar_cap(self):
        """AC6: Supports fixed dollar caps."""
        # Base: $100k, Cap: +$5k/year
        # Year 1: Max $105k, Spend $103k, Bank $2k
        # Year 2: Max $110k cumulative, Spend $108k
        result_y1 = calculate_cumulative_cap(
            current_amount=Decimal("103000.00"),
            base_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),
            years_since_base=1,
            prior_year_amounts=[],
        )
        assert result_y1.capped_amount == Decimal("103000.00")
        assert result_y1.cap_headroom == Decimal("2000.00")

        result_y2 = calculate_cumulative_cap(
            current_amount=Decimal("108000.00"),
            base_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),
            years_since_base=2,
            prior_year_amounts=[Decimal("103000.00")],
        )
        assert result_y2.capped_amount == Decimal("108000.00")
        # Max: 103k + 5k + 2k = 110k, headroom = 2k
        assert result_y2.cap_headroom == Decimal("2000.00")

    def test_high_year_1_spending_no_bank_to_carry(self):
        """Year 1 at cap limit means no bank for year 2."""
        # Base: $100k, Cap: 5%
        # Year 1: Spend $105k (exactly at max), Bank $0
        # Year 2: Spend $110k
        result_y1 = calculate_cumulative_cap(
            current_amount=Decimal("105000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
        )
        assert result_y1.capped_amount == Decimal("105000.00")
        assert result_y1.cap_headroom == Decimal("0")

        result_y2 = calculate_cumulative_cap(
            current_amount=Decimal("110000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("105000.00")],
        )
        # Max: 105k + 5k + 0 (no bank) = 110k
        assert result_y2.capped_amount == Decimal("110000.00")
        assert result_y2.cap_applied is False

    def test_year_1_over_cap_uses_cap_not_bank(self):
        """Year 1 over cap gets capped, no bank exists yet."""
        # Base: $100k, Cap: 5%
        # Year 1: Try to spend $110k, Max $105k
        result = calculate_cumulative_cap(
            current_amount=Decimal("110000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
        )
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("5000.00")
        assert result.cap_headroom == Decimal("0")

    def test_trace_shows_bank_balance(self):
        """AC5: Trace shows bank calculation and balance."""
        trace = CalculationTrace(
            calculation_type="cumulative_cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        # Year 2 with bank
        calculate_cumulative_cap(
            current_amount=Decimal("104000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("102000.00")],
            trace=trace,
        )

        # Should have steps for:
        # 1. Calculate cumulative cap
        # 2. Calculate cap bank
        # 3. Calculate max allowed this year
        # 4. Apply cumulative cap
        assert len(trace.steps) == 4

        # Verify bank calculation step
        bank_step = trace.steps[1]
        assert bank_step.step_name == "Calculate cap bank (simulation)"
        assert "3000" in bank_step.output_value  # $3k bank
        assert "Banked capacity" in bank_step.note

        # Verify final step shows remaining bank
        final_step = trace.steps[3]
        assert final_step.step_name == "Apply cumulative cap"
        assert "Bank remaining" in final_step.note

    def test_trace_year_1_no_bank_note(self):
        """AC5: Trace for year 1 shows no bank."""
        trace = CalculationTrace(
            calculation_type="cumulative_cap_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        calculate_cumulative_cap(
            current_amount=Decimal("103000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
            trace=trace,
        )

        # Find bank step
        bank_step = trace.steps[1]
        assert bank_step.step_name == "Calculate cap bank"
        assert "First year" in bank_step.note or "no prior" in bank_step.note.lower()

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

    def test_decimal_precision(self):
        """Ensure proper decimal rounding."""
        # Base: $100k, Cap: 3.333%
        # Year 1: Max = 100k * 1.03333 = 103,333.00
        result = calculate_cumulative_cap(
            current_amount=Decimal("103500.555"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.03333"),
            years_since_base=1,
            prior_year_amounts=[],
        )

        # All amounts should be rounded to 2 decimals
        assert result.capped_amount.as_tuple().exponent == -2

    def test_zero_base_amount(self):
        """Handle edge case of zero base amount."""
        # Base: $0, Year 1: $5k, Cap: 5%
        # Max: 0 * 1.05 = 0
        result = calculate_cumulative_cap(
            current_amount=Decimal("5000.00"),
            base_amount=Decimal("0"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
        )

        assert result.capped_amount == Decimal("0.00")
        assert result.cap_applied is True

    def test_decreasing_expenses_still_accumulates_bank(self):
        """If expenses decrease, bank grows significantly."""
        # Base: $100k, Cap: 5%
        # Year 1: Spend $95k (under max $105k), Bank $10k
        # Year 2: Spend $90k
        result_y1 = calculate_cumulative_cap(
            current_amount=Decimal("95000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],
        )
        assert result_y1.capped_amount == Decimal("95000.00")
        assert result_y1.cap_headroom == Decimal("10000.00")

        result_y2 = calculate_cumulative_cap(
            current_amount=Decimal("90000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("95000.00")],
        )
        # Max: 95k + 5k + 10k = 110k
        # Current: 90k
        # Headroom: 20k
        assert result_y2.capped_amount == Decimal("90000.00")
        assert result_y2.cap_headroom == Decimal("20000.00")
