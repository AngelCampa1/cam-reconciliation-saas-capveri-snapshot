"""Tests for Fixed CAM vs Traditional Reconciliation Modeler."""

from decimal import Decimal

import pytest

from app.services.calculation.fixed_cam_modeler import (
    FixedCamModelerInput,
    FixedCamModelerResult,
    FixedCamYearInput,
    calculate_fixed_cam_model,
)


def _year(year: int, expenses: str, sf: str = "100000") -> FixedCamYearInput:
    return FixedCamYearInput(
        year=year,
        total_operating_expenses=Decimal(expenses),
        rentable_sf=Decimal(sf),
    )


def _input(
    years: list[FixedCamYearInput],
    rate: str = "8.50",
    escalation: str = "3.0",
    tenant_sqft: str = "5000",
    pro_rata: str = "5.0",
) -> FixedCamModelerInput:
    return FixedCamModelerInput(
        years=years,
        fixed_cam_rate_per_sf=Decimal(rate),
        annual_escalation_pct=Decimal(escalation),
        tenant_sqft=Decimal(tenant_sqft),
        pro_rata_share=Decimal(pro_rata),
    )


class TestFixedCamModeler:
    def test_three_year_standard_comparison(self):
        """3 years, 3% escalation, correct year-by-year + totals."""
        years = [
            _year(2024, "1000000"),
            _year(2025, "1050000"),
            _year(2026, "1100000"),
        ]
        result = calculate_fixed_cam_model(_input(years))

        assert isinstance(result, FixedCamModelerResult)
        assert len(result.years) == 3

        # Year 0: traditional=1000000*5%=50000, rate=8.50, fixed=42500
        assert result.years[0].expense_per_sf == Decimal("10.00")
        assert result.years[0].traditional_recovery == Decimal("50000.00")
        assert result.years[0].escalated_rate_per_sf == Decimal("8.50")
        assert result.years[0].fixed_cam_revenue == Decimal("42500.00")
        assert result.years[0].delta == Decimal("7500.00")

        # Year 1: traditional=1050000*5%=52500, rate=8.755->8.76
        assert result.years[1].expense_per_sf == Decimal("10.50")
        assert result.years[1].traditional_recovery == Decimal("52500.00")
        assert result.years[1].escalated_rate_per_sf == Decimal("8.76")
        assert result.years[1].fixed_cam_revenue == Decimal("43775.00")
        assert result.years[1].delta == Decimal("8725.00")

        # Year 2: traditional=1100000*5%=55000, rate=9.01765->9.02
        assert result.years[2].expense_per_sf == Decimal("11.00")
        assert result.years[2].traditional_recovery == Decimal("55000.00")
        assert result.years[2].escalated_rate_per_sf == Decimal("9.02")
        assert result.years[2].fixed_cam_revenue == Decimal("45088.25")
        assert result.years[2].delta == Decimal("9911.75")

        assert result.total_traditional_recovery == Decimal("157500.00")
        assert result.total_fixed_cam_revenue == Decimal("131363.25")
        assert result.total_delta == Decimal("26136.75")

    def test_five_year_high_inflation_trad_wins(self):
        """High expense growth outpaces fixed escalation — traditional wins."""
        years = [
            _year(2024, "1000000"),
            _year(2025, "1100000"),
            _year(2026, "1210000"),
            _year(2027, "1331000"),
            _year(2028, "1464100"),
        ]
        result = calculate_fixed_cam_model(_input(years, escalation="3.0"))

        # Traditional grows ~10%/yr, fixed only 3%/yr — traditional recovers more
        assert result.total_delta > 0  # positive = traditional wins

    def test_fixed_cam_wins_low_inflation(self):
        """Fixed CAM recovers more when expenses are flat/declining."""
        years = [
            _year(2024, "1000000"),
            _year(2025, "980000"),
            _year(2026, "960000"),
        ]
        result = calculate_fixed_cam_model(
            _input(years, rate="10.00", escalation="3.0")
        )

        # traditional: 50000+49000+48000=147000
        # fixed: 50000+51500+53045=154545  -> fixed wins
        assert result.total_delta < 0  # negative = fixed CAM wins

    def test_zero_escalation(self):
        """Fixed rate stays constant when escalation is 0%."""
        years = [
            _year(2024, "1000000"),
            _year(2025, "1050000"),
            _year(2026, "1100000"),
        ]
        result = calculate_fixed_cam_model(_input(years, escalation="0"))

        for yr in result.years:
            assert yr.escalated_rate_per_sf == Decimal("8.50")
            assert yr.fixed_cam_revenue == Decimal("42500.00")

    def test_escalation_compounds(self):
        """rate * (1.03)^n not rate * (1 + n*0.03)."""
        years = [
            _year(2024, "1000000"),
            _year(2025, "1000000"),
            _year(2026, "1000000"),
        ]
        result = calculate_fixed_cam_model(
            _input(years, rate="10.00", escalation="3.0")
        )

        # Compounding: 10 * 1.03^2 = 10.609 -> 10.61
        # Linear would be: 10 * (1 + 2*0.03) = 10.60
        assert result.years[2].escalated_rate_per_sf == Decimal("10.61")

    def test_cumulative_delta_tracks(self):
        """Running sum of deltas is accurate."""
        years = [
            _year(2024, "1000000"),
            _year(2025, "1050000"),
            _year(2026, "1100000"),
        ]
        result = calculate_fixed_cam_model(_input(years))

        running = Decimal("0")
        for yr in result.years:
            running += yr.delta
            assert yr.cumulative_delta == running

    def test_fewer_than_three_years_raises(self):
        """ValueError for < 3 years."""
        years = [
            _year(2024, "1000000"),
            _year(2025, "1050000"),
        ]
        with pytest.raises(ValueError, match="between 3 and 5"):
            calculate_fixed_cam_model(_input(years))

    def test_more_than_five_years_raises(self):
        """ValueError for > 5 years."""
        years = [_year(2024 + i, "1000000") for i in range(6)]
        with pytest.raises(ValueError, match="between 3 and 5"):
            calculate_fixed_cam_model(_input(years))

    def test_negative_escalation_raises(self):
        """ValueError for negative escalation."""
        years = [_year(2024 + i, "1000000") for i in range(3)]
        with pytest.raises(ValueError, match="escalation"):
            calculate_fixed_cam_model(_input(years, escalation="-1"))

    def test_escalation_above_fifteen_pct_raises(self):
        """ValueError for escalation > 15%."""
        years = [_year(2024 + i, "1000000") for i in range(3)]
        with pytest.raises(ValueError, match="escalation"):
            calculate_fixed_cam_model(_input(years, escalation="16"))

    def test_zero_tenant_sqft_raises(self):
        """ValueError for zero tenant sqft."""
        years = [_year(2024 + i, "1000000") for i in range(3)]
        with pytest.raises(ValueError, match="tenant_sqft"):
            calculate_fixed_cam_model(_input(years, tenant_sqft="0"))

    def test_decimal_precision(self):
        """2-decimal quantization with ROUND_HALF_UP."""
        years = [
            _year(2024, "999999"),
            _year(2025, "999999"),
            _year(2026, "999999"),
        ]
        result = calculate_fixed_cam_model(
            _input(years, rate="7.77", escalation="3.3", pro_rata="3.33")
        )

        for yr in result.years:
            assert yr.fixed_cam_revenue == yr.fixed_cam_revenue.quantize(
                Decimal("0.01")
            )
            assert yr.delta == yr.delta.quantize(Decimal("0.01"))
            assert yr.expense_per_sf == yr.expense_per_sf.quantize(Decimal("0.01"))
            assert yr.traditional_recovery == (
                yr.traditional_recovery.quantize(Decimal("0.01"))
            )

    def test_expense_per_sf_computed(self):
        """expense_per_sf = total_operating_expenses / rentable_sf."""
        years = [
            _year(2024, "1000000", sf="80000"),
            _year(2025, "1050000", sf="80000"),
            _year(2026, "1100000", sf="80000"),
        ]
        result = calculate_fixed_cam_model(_input(years))

        assert result.years[0].expense_per_sf == Decimal("12.50")
        assert result.years[1].expense_per_sf == Decimal("13.13")
        assert result.years[2].expense_per_sf == Decimal("13.75")
