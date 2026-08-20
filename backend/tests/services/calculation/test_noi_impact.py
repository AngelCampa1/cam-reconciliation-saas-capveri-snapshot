"""Tests for NOI impact calculation service."""

from decimal import Decimal

import pytest

from app.services.calculation.noi_impact import (
    NOIImpactInput,
    NOIImpactResult,
    calculate_noi_impact,
)


class TestCalculateNOIImpact:
    def test_standard_recovery_at_seven_percent(self):
        """$25,000 recovery at 7% cap rate = $357,142.86 asset value."""
        result = calculate_noi_impact(
            NOIImpactInput(
                recovery_amount=Decimal("25000.00"),
                cap_rate=Decimal("0.07"),
            )
        )
        assert isinstance(result, NOIImpactResult)
        assert result.recovery_amount == Decimal("25000.00")
        assert result.noi_lift == Decimal("25000.00")
        assert result.asset_value_lift == Decimal("357142.86")
        assert result.cap_rate == Decimal("0.07")

    def test_zero_recovery_returns_zero_lift(self):
        """Zero recovery means zero NOI and asset lift."""
        result = calculate_noi_impact(
            NOIImpactInput(
                recovery_amount=Decimal("0.00"),
                cap_rate=Decimal("0.07"),
            )
        )
        assert result.noi_lift == Decimal("0.00")
        assert result.asset_value_lift == Decimal("0.00")

    def test_high_cap_rate_lowers_asset_value(self):
        """Higher cap rate → lower asset value for same NOI."""
        result = calculate_noi_impact(
            NOIImpactInput(
                recovery_amount=Decimal("100000.00"),
                cap_rate=Decimal("0.10"),
            )
        )
        assert result.asset_value_lift == Decimal("1000000.00")

    def test_low_cap_rate_raises_asset_value(self):
        """4% cap rate → $2.5M asset lift on $100K recovery."""
        result = calculate_noi_impact(
            NOIImpactInput(
                recovery_amount=Decimal("100000.00"),
                cap_rate=Decimal("0.04"),
            )
        )
        assert result.asset_value_lift == Decimal("2500000.00")

    def test_result_uses_round_half_up_two_decimal_places(self):
        """Asset value rounds to 2 decimal places using ROUND_HALF_UP."""
        result = calculate_noi_impact(
            NOIImpactInput(
                recovery_amount=Decimal("10000.00"),
                cap_rate=Decimal("0.07"),
            )
        )
        # 10000 / 0.07 = 142857.142857... → rounds to 142857.14
        assert result.asset_value_lift == Decimal("142857.14")

    def test_cap_rate_below_one_percent_raises(self):
        """Cap rate below 1% should raise ValueError."""
        with pytest.raises(ValueError, match="cap_rate must be between 1% and 25%"):
            calculate_noi_impact(
                NOIImpactInput(
                    recovery_amount=Decimal("25000.00"),
                    cap_rate=Decimal("0.009"),
                )
            )

    def test_cap_rate_above_twenty_five_percent_raises(self):
        """Cap rate above 25% should raise ValueError."""
        with pytest.raises(ValueError, match="cap_rate must be between 1% and 25%"):
            calculate_noi_impact(
                NOIImpactInput(
                    recovery_amount=Decimal("25000.00"),
                    cap_rate=Decimal("0.251"),
                )
            )

    def test_cap_rate_at_boundary_one_percent_is_valid(self):
        """1% cap rate is a valid boundary value."""
        result = calculate_noi_impact(
            NOIImpactInput(
                recovery_amount=Decimal("10000.00"),
                cap_rate=Decimal("0.01"),
            )
        )
        assert result.asset_value_lift == Decimal("1000000.00")

    def test_cap_rate_at_boundary_twenty_five_percent_is_valid(self):
        """25% cap rate is a valid boundary value."""
        result = calculate_noi_impact(
            NOIImpactInput(
                recovery_amount=Decimal("10000.00"),
                cap_rate=Decimal("0.25"),
            )
        )
        assert result.asset_value_lift == Decimal("40000.00")

    def test_noi_lift_equals_recovery_amount(self):
        """NOI lift is always equal to the recovery amount (CAM recovery IS additional NOI)."""
        recovery = Decimal("44032.97")
        result = calculate_noi_impact(
            NOIImpactInput(
                recovery_amount=recovery,
                cap_rate=Decimal("0.065"),
            )
        )
        assert result.noi_lift == result.recovery_amount
