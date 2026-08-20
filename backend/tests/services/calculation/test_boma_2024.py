"""
Tests for BOMA 2024 Rentable Area Calculator service.

Covers all calculation paths: load factor derivation, outdoor SF expansion,
hidden SF computation, revenue lift, asset value lift, and validation.
"""

from decimal import Decimal

import pytest

from app.services.calculation.boma_2024 import (
    BomaCalculationInput,
    calculate_boma_2024,
)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def make_inputs(**overrides) -> BomaCalculationInput:
    """Build a BomaCalculationInput with sensible defaults."""
    defaults = {
        "usable_sf": Decimal("100000"),
        "rentable_sf": Decimal("125000"),
        "balcony_sf": Decimal("5000"),
        "terrace_sf": Decimal("2000"),
        "outdoor_amenity_sf": Decimal("1000"),
        "annual_rent_per_sf": Decimal("30"),
        "cap_rate": Decimal("0.065"),
    }
    defaults.update(overrides)
    return BomaCalculationInput(**defaults)


# ---------------------------------------------------------------------------
# Load factor
# ---------------------------------------------------------------------------


class TestLoadFactor:
    def test_load_factor_correct_value(self):
        """load_factor = rentable_sf / usable_sf, quantized to 4dp."""
        # 125000 / 100000 = 1.2500
        result = calculate_boma_2024(make_inputs())
        assert result.load_factor == Decimal("1.2500")

    def test_load_factor_4_decimal_places(self):
        """load_factor is always expressed to exactly 4 decimal places."""
        result = calculate_boma_2024(make_inputs())
        assert result.load_factor.as_tuple().exponent == -4

    def test_load_factor_with_non_round_ratio(self):
        """Load factor rounds correctly for non-terminating decimals."""
        # 133333 / 100000 = 1.33333... → 1.3333
        result = calculate_boma_2024(make_inputs(rentable_sf=Decimal("133333")))
        assert result.load_factor == Decimal("1.3333")

    def test_load_factor_exactly_one(self):
        """When rentable_sf == usable_sf, load_factor == 1.0000."""
        result = calculate_boma_2024(
            make_inputs(
                usable_sf=Decimal("100000"),
                rentable_sf=Decimal("100000"),
            )
        )
        assert result.load_factor == Decimal("1.0000")


# ---------------------------------------------------------------------------
# New usable SF
# ---------------------------------------------------------------------------


class TestNewUsableSf:
    def test_new_usable_sf_sums_all_outdoor(self):
        """new_usable_sf = usable + balcony + terrace + outdoor_amenity."""
        # 100000 + 5000 + 2000 + 1000 = 108000
        result = calculate_boma_2024(make_inputs())
        assert result.new_usable_sf == Decimal("108000.00")

    def test_new_usable_sf_two_decimal_places(self):
        """new_usable_sf is quantized to 2 decimal places."""
        result = calculate_boma_2024(make_inputs())
        assert result.new_usable_sf.as_tuple().exponent == -2

    def test_new_usable_sf_no_outdoor(self):
        """With no outdoor SF, new_usable_sf equals usable_sf."""
        result = calculate_boma_2024(
            make_inputs(
                balcony_sf=Decimal("0"),
                terrace_sf=Decimal("0"),
                outdoor_amenity_sf=Decimal("0"),
            )
        )
        assert result.new_usable_sf == Decimal("100000.00")


# ---------------------------------------------------------------------------
# New rentable SF
# ---------------------------------------------------------------------------


class TestNewRentableSf:
    def test_new_rentable_sf_applies_load_factor(self):
        """new_rentable_sf = new_usable_sf * load_factor."""
        # new_usable=108000, load_factor=1.2500 → 108000*1.25 = 135000
        result = calculate_boma_2024(make_inputs())
        assert result.new_rentable_sf == Decimal("135000.00")

    def test_new_rentable_sf_two_decimal_places(self):
        result = calculate_boma_2024(make_inputs())
        assert result.new_rentable_sf.as_tuple().exponent == -2


# ---------------------------------------------------------------------------
# Hidden SF
# ---------------------------------------------------------------------------


class TestHiddenSf:
    def test_hidden_sf_correct_value(self):
        """hidden_sf = new_rentable_sf - rentable_sf when positive."""
        # 135000 - 125000 = 10000
        result = calculate_boma_2024(make_inputs())
        assert result.hidden_sf == Decimal("10000.00")

    def test_hidden_sf_is_zero_when_no_outdoor(self):
        """hidden_sf == 0 when no outdoor SF is provided."""
        result = calculate_boma_2024(
            make_inputs(
                balcony_sf=Decimal("0"),
                terrace_sf=Decimal("0"),
                outdoor_amenity_sf=Decimal("0"),
            )
        )
        assert result.hidden_sf == Decimal("0.00")

    def test_hidden_sf_never_negative(self):
        """hidden_sf is clamped to 0 (cannot be negative)."""
        # Give tiny outdoor SF that rounds to 0 net change
        result = calculate_boma_2024(
            make_inputs(
                balcony_sf=Decimal("0"),
                terrace_sf=Decimal("0"),
                outdoor_amenity_sf=Decimal("0"),
            )
        )
        assert result.hidden_sf >= Decimal("0")

    def test_hidden_sf_two_decimal_places(self):
        result = calculate_boma_2024(make_inputs())
        assert result.hidden_sf.as_tuple().exponent == -2


# ---------------------------------------------------------------------------
# Percentage increase
# ---------------------------------------------------------------------------


class TestPctIncrease:
    def test_pct_increase_correct_value(self):
        """pct_increase = hidden_sf / rentable_sf * 100."""
        # 10000 / 125000 * 100 = 8.0000
        result = calculate_boma_2024(make_inputs())
        assert result.pct_increase == Decimal("8.0000")

    def test_pct_increase_zero_when_no_outdoor(self):
        result = calculate_boma_2024(
            make_inputs(
                balcony_sf=Decimal("0"),
                terrace_sf=Decimal("0"),
                outdoor_amenity_sf=Decimal("0"),
            )
        )
        assert result.pct_increase == Decimal("0.0000")

    def test_pct_increase_4_decimal_places(self):
        result = calculate_boma_2024(make_inputs())
        assert result.pct_increase.as_tuple().exponent == -4


# ---------------------------------------------------------------------------
# Revenue lift
# ---------------------------------------------------------------------------


class TestRevenueLift:
    def test_revenue_lift_correct_value(self):
        """revenue_lift = hidden_sf * annual_rent_per_sf."""
        # 10000 * 30 = 300000
        result = calculate_boma_2024(make_inputs())
        assert result.revenue_lift == Decimal("300000.00")

    def test_revenue_lift_zero_when_no_outdoor(self):
        result = calculate_boma_2024(
            make_inputs(
                balcony_sf=Decimal("0"),
                terrace_sf=Decimal("0"),
                outdoor_amenity_sf=Decimal("0"),
            )
        )
        assert result.revenue_lift == Decimal("0.00")

    def test_revenue_lift_two_decimal_places(self):
        result = calculate_boma_2024(make_inputs())
        assert result.revenue_lift.as_tuple().exponent == -2


# ---------------------------------------------------------------------------
# Asset value lift
# ---------------------------------------------------------------------------


class TestAssetValueLift:
    def test_asset_value_lift_correct_value(self):
        """asset_value_lift = revenue_lift / cap_rate (whole dollars)."""
        # 300000 / 0.065 = 4615384.615... → 4615385
        result = calculate_boma_2024(make_inputs())
        assert result.asset_value_lift == Decimal("4615385")

    def test_asset_value_lift_whole_dollars(self):
        """asset_value_lift is quantized to 0 decimal places (integer dollars)."""
        result = calculate_boma_2024(make_inputs())
        assert result.asset_value_lift.as_tuple().exponent == 0

    def test_asset_value_lift_with_different_cap_rate(self):
        """Different cap rate produces correct result."""
        # 300000 / 0.07 = 4285714.285... → 4285714
        result = calculate_boma_2024(make_inputs(cap_rate=Decimal("0.07")))
        assert result.asset_value_lift == Decimal("4285714")

    def test_asset_value_lift_zero_when_no_outdoor(self):
        result = calculate_boma_2024(
            make_inputs(
                balcony_sf=Decimal("0"),
                terrace_sf=Decimal("0"),
                outdoor_amenity_sf=Decimal("0"),
            )
        )
        assert result.asset_value_lift == Decimal("0")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


class TestValidation:
    def test_rentable_sf_less_than_usable_sf_raises_value_error(self):
        """rentable_sf < usable_sf is invalid (load factor < 1)."""
        with pytest.raises(ValueError, match="load factor"):
            calculate_boma_2024(
                make_inputs(
                    usable_sf=Decimal("125000"),
                    rentable_sf=Decimal("100000"),
                )
            )

    def test_usable_sf_zero_raises_validation_error(self):
        """usable_sf <= 0 is rejected by Pydantic."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            BomaCalculationInput(
                usable_sf=Decimal("0"),
                rentable_sf=Decimal("100000"),
                annual_rent_per_sf=Decimal("30"),
            )

    def test_rentable_sf_zero_raises_validation_error(self):
        """rentable_sf <= 0 is rejected by Pydantic."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            BomaCalculationInput(
                usable_sf=Decimal("100000"),
                rentable_sf=Decimal("0"),
                annual_rent_per_sf=Decimal("30"),
            )

    def test_cap_rate_above_one_raises_validation_error(self):
        """cap_rate > 1 is rejected by Pydantic."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            BomaCalculationInput(
                usable_sf=Decimal("100000"),
                rentable_sf=Decimal("125000"),
                annual_rent_per_sf=Decimal("30"),
                cap_rate=Decimal("1.5"),
            )

    def test_cap_rate_zero_raises_validation_error(self):
        """cap_rate == 0 is rejected by Pydantic (must be > 0)."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            BomaCalculationInput(
                usable_sf=Decimal("100000"),
                rentable_sf=Decimal("125000"),
                annual_rent_per_sf=Decimal("30"),
                cap_rate=Decimal("0"),
            )

    def test_negative_balcony_sf_raises_validation_error(self):
        """Negative outdoor SF is rejected by Pydantic."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            BomaCalculationInput(
                usable_sf=Decimal("100000"),
                rentable_sf=Decimal("125000"),
                annual_rent_per_sf=Decimal("30"),
                balcony_sf=Decimal("-100"),
            )


# ---------------------------------------------------------------------------
# Large values
# ---------------------------------------------------------------------------


class TestLargeValues:
    def test_large_sf_values_handled_correctly(self):
        """Very large SF values don't overflow or lose precision."""
        result = calculate_boma_2024(
            make_inputs(
                usable_sf=Decimal("10000000"),
                rentable_sf=Decimal("12500000"),
                balcony_sf=Decimal("500000"),
                terrace_sf=Decimal("200000"),
                outdoor_amenity_sf=Decimal("100000"),
                annual_rent_per_sf=Decimal("50"),
            )
        )
        # load_factor = 12500000/10000000 = 1.2500
        # new_usable = 10800000
        # new_rentable = 13500000
        # hidden_sf = 1000000
        # revenue_lift = 1000000 * 50 = 50000000
        assert result.load_factor == Decimal("1.2500")
        assert result.hidden_sf == Decimal("1000000.00")
        assert result.revenue_lift == Decimal("50000000.00")
