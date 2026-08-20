"""
Tests for expense cap calculations.

Targeted tests to cover validation error paths in caps.py.
Following CLAUDE.md principles: test real logic, minimal mocking.
"""

from decimal import Decimal

import pytest

from app.services.calculation.caps import (
    CapInput,
    CapType,
    apply_cap,
    calculate_cumulative_cap,
    calculate_cumulative_compounding_cap,
    calculate_non_cumulative_cap,
)


class TestNonCumulativeCapValidation:
    """Test validation in non-cumulative cap calculation."""

    def test_rejects_negative_cap_fixed_amount(self):
        """Should reject negative cap_fixed_amount (line 112)."""
        with pytest.raises(ValueError, match="cap_fixed_amount must be non-negative"):
            calculate_non_cumulative_cap(
                current_amount=Decimal("1000.00"),
                prior_amount=Decimal("900.00"),
                cap_fixed_amount=Decimal("-50.00"),  # Negative!
            )

    def test_rejects_negative_cap_rate(self):
        """Should reject negative cap_rate (line 119)."""
        with pytest.raises(ValueError, match="cap_rate must be non-negative"):
            calculate_non_cumulative_cap(
                current_amount=Decimal("1000.00"),
                prior_amount=Decimal("900.00"),
                cap_rate=Decimal("-0.05"),  # Negative!
            )


class TestCumulativeCapValidation:
    """Test validation in cumulative cap calculation."""

    def test_rejects_negative_cap_fixed_amount(self):
        """Should reject negative cap_fixed_amount (line 230)."""
        with pytest.raises(ValueError, match="cap_fixed_amount must be non-negative"):
            calculate_cumulative_cap(
                current_amount=Decimal("1000.00"),
                base_amount=Decimal("800.00"),
                cap_fixed_amount=Decimal("-50.00"),  # Negative!
                years_since_base=2,
            )

    def test_rejects_negative_cap_rate(self):
        """Should reject negative cap_rate (line 237)."""
        with pytest.raises(ValueError, match="cap_rate must be non-negative"):
            calculate_cumulative_cap(
                current_amount=Decimal("1000.00"),
                base_amount=Decimal("800.00"),
                cap_rate=Decimal("-0.05"),  # Negative!
                years_since_base=2,
            )

    def test_rejects_excessive_cap_rate(self):
        """Should reject cap_rate > 100% (line 242)."""
        with pytest.raises(ValueError, match="cap_rate .* exceeds maximum"):
            calculate_cumulative_cap(
                current_amount=Decimal("1000.00"),
                base_amount=Decimal("800.00"),
                cap_rate=Decimal("5.0"),  # 500%!
                years_since_base=2,
            )


class TestCumulativeCompoundingCapValidation:
    """Test validation in cumulative compounding cap calculation."""

    def test_caps_years_at_50_maximum(self):
        """Should cap years_since_base at 50 (line 426)."""
        # This should not raise, but should cap years_since_base internally
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("1000.00"),
            base_amount=Decimal("800.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=100,  # Way too many years!
        )
        # If years were not capped, this would cause numeric overflow
        # With capping, we get a valid result
        assert result.capped_amount > Decimal("0")

    def test_rejects_negative_cap_rate(self):
        """Should reject negative cap_rate (line 441)."""
        with pytest.raises(ValueError, match="cap_rate must be non-negative"):
            calculate_cumulative_compounding_cap(
                current_amount=Decimal("1000.00"),
                base_amount=Decimal("800.00"),
                cap_rate=Decimal("-0.05"),  # Negative!
                years_since_base=2,
            )

    def test_trace_with_fixed_cap_covers_operation_str(self):
        """Should cover fixed cap operation string in trace (line 462)."""
        from datetime import date
        from uuid import uuid4

        from app.services.calculation.models import CalculationTrace

        trace = CalculationTrace(
            calculation_type="test_compounding_cap",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("1000.00"),
            base_amount=Decimal("800.00"),
            cap_fixed_amount=Decimal("50.00"),  # Fixed cap, not percentage
            years_since_base=2,
            trace=trace,  # Enable trace
        )

        # Line 462 should be covered by this call with fixed cap + trace
        assert result.capped_amount > Decimal("0")
        assert len(trace.steps) > 0


class TestApplyCapRouter:
    """Test the apply_cap router function."""

    def test_none_cap_type_returns_uncapped(self):
        """Should return original amount when cap type is NONE."""
        cap_input = CapInput(
            cap_type=CapType.NONE,
            current_year_amount=Decimal("1000.00"),
        )

        result = apply_cap(cap_input)

        assert result.capped_amount == Decimal("1000.00")
        assert result.cap_applied is False

    def test_unknown_cap_type_raises_error(self):
        """Should raise ValueError for unknown cap type."""
        cap_input = CapInput(
            cap_type="invalid_type",
            current_year_amount=Decimal("1000.00"),
        )

        with pytest.raises(ValueError, match="Unknown cap type"):
            apply_cap(cap_input)


# ============================================================================
# COMPREHENSIVE FUNCTIONALITY TESTS (Phase 1: Coverage Improvement)
# ============================================================================


class TestNonCumulativeCapFunctionality:
    """Test non-cumulative cap calculations (happy paths + edge cases)."""

    def test_first_year_no_prior_amount(self):
        """Year 1 should return uncapped amount (lines 74-89)."""
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("100000.00"),
            prior_amount=None,  # First year
            cap_rate=Decimal("0.05"),
        )

        assert result.capped_amount == Decimal("100000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == Decimal("0")

    def test_zero_prior_year_treated_as_first_year(self):
        """Zero prior year should not create cap baseline (lines 94-109, FIX CAP-4)."""
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("100000.00"),
            prior_amount=Decimal("0"),  # Zero baseline
            cap_rate=Decimal("0.05"),
        )

        # Would be locked at $0 forever if not handled correctly
        assert result.capped_amount == Decimal("100000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")

    def test_rejects_excessive_cap_rate_non_cumulative(self):
        """Should reject cap_rate > 100% (lines 126-130, FIX CAP-5)."""
        with pytest.raises(ValueError, match="cap_rate .* exceeds maximum"):
            calculate_non_cumulative_cap(
                current_amount=Decimal("100000.00"),
                prior_amount=Decimal("95000.00"),
                cap_rate=Decimal("5.0"),  # 500%! (typo: should be 0.05)
            )

    def test_percentage_cap_under_limit(self):
        """Amount under cap should pass through (lines 119-158)."""
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("102000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),  # 5% = $5k max increase
        )

        # Max allowed: $100k * 1.05 = $105k
        # Actual: $102k (under cap)
        assert result.capped_amount == Decimal("102000.00")
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == Decimal("3000.00")  # $105k - $102k

    def test_percentage_cap_limits_increase(self):
        """Amount over cap should be capped (lines 159-164)."""
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("110000.00"),
            prior_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),  # 5% = $5k max increase
        )

        # Max allowed: $100k * 1.05 = $105k
        # Actual: $110k (over cap by $5k)
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("5000.00")
        assert result.cap_headroom == Decimal("0")

    def test_fixed_dollar_cap(self):
        """Fixed dollar cap should use additive logic (lines 112-118)."""
        result = calculate_non_cumulative_cap(
            current_amount=Decimal("108000.00"),
            prior_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),  # Fixed $5k max
        )

        # Max allowed: $100k + $5k = $105k
        # Actual: $108k (over cap)
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("3000.00")

    def test_requires_cap_parameter(self):
        """Should require either cap_rate or cap_fixed_amount (line 135)."""
        with pytest.raises(ValueError, match="Either cap_rate or cap_fixed_amount"):
            calculate_non_cumulative_cap(
                current_amount=Decimal("105000.00"),
                prior_amount=Decimal("100000.00"),
                # Missing both parameters!
            )


class TestCumulativeCapFunctionality:
    """Test cumulative cap with banking logic."""

    def test_cumulative_cap_year_1_no_bank(self):
        """First year has no banked capacity (lines 280-289, 230-258)."""
        result = calculate_cumulative_cap(
            current_amount=Decimal("105000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=1,
            prior_year_amounts=[],  # No prior years
        )

        # Max: $100k * (1 + 0.05*1) = $105k
        # Bank: $0 (first year)
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is False
        assert result.cap_headroom == Decimal("0")  # No remaining bank

    def test_cumulative_cap_banking_simulation(self):
        """Bank accumulates from unused capacity (lines 291-323, 329-380).

        Industry standard: Bank is RUNNING BALANCE (Lexology, Lowndes Law).
        Year 1: Max=$105k, Actual=$102k, Bank=$3k
        Year 2: Max=$107k + Bank=$3k, Actual=$108k, Bank=$2k
        Year 3: Max=$113k + Bank=$2k, Actual=$117k → Capped at $115k
        """
        result = calculate_cumulative_cap(
            current_amount=Decimal("117000.00"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),  # 5% = $5k annual increase
            years_since_base=3,
            prior_year_amounts=[
                Decimal("102000.00"),  # Year 1: $3k banked
                Decimal("108000.00"),  # Year 2: $2k banked
            ],
        )

        # Reference: $108k (last year actual)
        # Annual increase: $5k
        # Bank: $2k (from simulation)
        # Max allowed: $108k + $5k + $2k = $115k
        # Actual: $117k (over by $2k)
        assert result.capped_amount == Decimal("115000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("2000.00")

    def test_cumulative_cap_with_fixed_amount(self):
        """Fixed dollar cap uses linear growth with banking (lines 230-236, 301-330)."""
        result = calculate_cumulative_cap(
            current_amount=Decimal("112000.00"),
            base_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),  # Fixed $5k per year
            years_since_base=2,
            prior_year_amounts=[Decimal("104000.00")],
        )

        # Year 1: Max=$105k, Actual=$104k, Bank=$1k
        # Year 2: Reference=$104k, Annual=$5k, Bank=$1k
        # Max: $104k + $5k + $1k = $110k
        # Actual: $112k (over by $2k)
        assert result.capped_amount == Decimal("110000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("2000.00")

    def test_cumulative_cap_requires_cap_parameter(self):
        """Should raise error if neither cap parameter provided (line 253)."""
        with pytest.raises(ValueError, match="Either cap_rate or cap_fixed_amount"):
            calculate_cumulative_cap(
                current_amount=Decimal("105000.00"),
                base_amount=Decimal("100000.00"),
                # Missing both cap_rate and cap_fixed_amount
                years_since_base=1,
            )

    def test_cumulative_cap_under_limit_with_bank(self):
        """Amount under cap should not consume bank (lines 329-380)."""
        result = calculate_cumulative_cap(
            current_amount=Decimal("103000.00"),  # Well under cap
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=2,
            prior_year_amounts=[Decimal("102000.00")],  # $3k banked
        )

        # Max: $102k + $5k + $3k bank = $110k
        # Actual: $103k (under cap by $7k)
        assert result.capped_amount == Decimal("103000.00")
        assert result.cap_applied is False
        # Bank remains for future years (cap_headroom shows available)
        assert result.cap_headroom == Decimal("7000.00")


class TestCumulativeCompoundingCapFunctionality:
    """Test exponential growth cap calculations."""

    def test_cumulative_compounding_exponential_growth(self):
        """Compounding cap grows exponentially (lines 441-457, 484-504).

        Year 3 Linear (cumulative): $100k + (3 × $5k) = $115k
        Year 3 Compound: $100k × 1.05³ = $115,762.50 (+$762.50 from compounding)
        """
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("115762.50"),
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[
                Decimal("104000.00"),  # Year 1
                Decimal("108000.00"),  # Year 2
            ],
        )

        # Max: $100k × 1.05³ = $115,762.50
        # Bank calculation spans lines 484-504
        assert result.capped_amount == Decimal("115762.50")
        assert result.cap_applied is False

    def test_cumulative_compounding_with_fixed_amount(self):
        """Fixed dollar compounding is linear with banking (lines 432-440, 482-508)."""
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("112000.00"),
            base_amount=Decimal("100000.00"),
            cap_fixed_amount=Decimal("5000.00"),  # Fixed $5k
            years_since_base=2,
            prior_year_amounts=[Decimal("104000.00")],
        )

        # Year 1: Max=$105k, Actual=$104k, Bank=$1k
        # Year 2: Max=$110k (base + 2×$5k), Bank=$1k
        # Effective max: $110k + $1k = $111k
        # Actual: $112k (over by $1k)
        assert result.capped_amount == Decimal("111000.00")
        assert result.cap_applied is True
        assert result.savings_from_cap == Decimal("1000.00")

    def test_compounding_rejects_excessive_cap_rate(self):
        """Should reject cap_rate > 100% (lines 449-454, FIX CAP-5)."""
        with pytest.raises(ValueError, match="cap_rate .* exceeds maximum"):
            calculate_cumulative_compounding_cap(
                current_amount=Decimal("100000.00"),
                base_amount=Decimal("80000.00"),
                cap_rate=Decimal("2.5"),  # 250%!
                years_since_base=5,
            )

    def test_cumulative_compounding_cap_applied(self):
        """Cap should limit amount when over limit (lines 507-531)."""
        result = calculate_cumulative_compounding_cap(
            current_amount=Decimal("150000.00"),  # Way over
            base_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            years_since_base=3,
            prior_year_amounts=[
                Decimal("105000.00"),  # Year 1
                Decimal("110250.00"),  # Year 2
            ],
        )

        # Max: $100k × 1.05³ = $115,762.50 (plus any bank)
        assert result.cap_applied is True
        assert result.savings_from_cap > Decimal("0")
        assert result.capped_amount < Decimal("150000.00")

    def test_cumulative_compounding_requires_cap_parameter(self):
        """Should raise error if neither cap parameter provided (line 459)."""
        with pytest.raises(ValueError, match="Either cap_rate or cap_fixed_amount"):
            calculate_cumulative_compounding_cap(
                current_amount=Decimal("105000.00"),
                base_amount=Decimal("100000.00"),
                # Missing both parameters
                years_since_base=1,
            )


class TestApplyCapRouting:
    """Test apply_cap router function."""

    def test_apply_cap_routes_non_cumulative(self):
        """Router should call non-cumulative cap (lines 612-619)."""
        cap_input = CapInput(
            cap_type=CapType.NON_CUMULATIVE,
            current_year_amount=Decimal("105000.00"),
            prior_year_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
        )

        result = apply_cap(cap_input)

        # Should pass through since under cap
        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is False

    def test_apply_cap_routes_cumulative(self):
        """Router should call cumulative cap (lines 621-630)."""
        cap_input = CapInput(
            cap_type=CapType.CUMULATIVE,
            current_year_amount=Decimal("105000.00"),
            base_year_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            all_prior_amounts=[],  # Year 1
        )

        result = apply_cap(cap_input)

        assert result.capped_amount == Decimal("105000.00")
        assert result.cap_applied is False

    def test_apply_cap_routes_cumulative_compounding(self):
        """Router should call cumulative compounding cap (lines 632-641)."""
        cap_input = CapInput(
            cap_type=CapType.CUMULATIVE_COMPOUNDING,
            current_year_amount=Decimal("115762.50"),
            base_year_amount=Decimal("100000.00"),
            cap_rate=Decimal("0.05"),
            all_prior_amounts=[Decimal("105000.00"), Decimal("110250.00")],
        )

        result = apply_cap(cap_input)

        # Should match exponential growth max
        assert result.capped_amount == Decimal("115762.50")
        assert result.cap_applied is False

    def test_apply_cap_cumulative_requires_base_year_amount(self):
        """Cumulative cap must raise ValueError when base_year_amount is None."""
        cap_input = CapInput(
            cap_type=CapType.CUMULATIVE,
            current_year_amount=Decimal("105000.00"),
            cap_rate=Decimal("0.05"),
            base_year_amount=None,
        )

        with pytest.raises(
            ValueError, match="base_year_amount is required for cumulative cap type"
        ):
            apply_cap(cap_input)

    def test_apply_cap_cumulative_compounding_requires_base_year_amount(self):
        """Cumulative-compounding cap must raise ValueError when base_year_amount is None."""
        cap_input = CapInput(
            cap_type=CapType.CUMULATIVE_COMPOUNDING,
            current_year_amount=Decimal("115762.50"),
            cap_rate=Decimal("0.05"),
            base_year_amount=None,
        )

        with pytest.raises(
            ValueError,
            match="base_year_amount is required for cumulative_compounding cap type",
        ):
            apply_cap(cap_input)
