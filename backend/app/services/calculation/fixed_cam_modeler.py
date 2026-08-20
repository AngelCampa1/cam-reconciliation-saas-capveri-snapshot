"""
Fixed CAM vs Traditional Reconciliation Modeler.

Compares year-by-year recovery under traditional CAM reconciliation
vs a Fixed CAM structure (flat $/SF + annual escalator). Shows landlords
the economic impact of switching to Fixed CAM.

All calculations use Decimal for precision with ROUND_HALF_UP.
"""

from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, Field

TWO_PLACES = Decimal("0.01")


class FixedCamYearInput(BaseModel):
    """Per-year input data for the modeler."""

    year: int = Field(description="Calendar year")
    total_operating_expenses: Decimal = Field(
        ge=0, description="Total building operating expenses for the year"
    )
    rentable_sf: Decimal = Field(
        gt=0, description="Total building rentable square footage"
    )


class FixedCamModelerInput(BaseModel):
    """Input for the Fixed CAM vs Traditional comparison."""

    years: list[FixedCamYearInput] = Field(
        description="Per-year expense data (3-5 years)"
    )
    fixed_cam_rate_per_sf: Decimal = Field(
        gt=0, description="Fixed CAM rate per SF per year (e.g. 8.50)"
    )
    annual_escalation_pct: Decimal = Field(
        ge=0, description="Annual escalation percentage (e.g. 3.0 for 3%)"
    )
    tenant_sqft: Decimal = Field(description="Tenant's leased square footage")
    pro_rata_share: Decimal = Field(
        ge=0,
        le=100,
        description="Tenant's pro-rata share as percentage",
    )


class FixedCamYearResult(BaseModel):
    """Per-year comparison result."""

    year: int
    total_operating_expenses: Decimal
    expense_per_sf: Decimal
    traditional_recovery: Decimal
    fixed_cam_revenue: Decimal
    delta: Decimal = Field(
        description="traditional - fixed_cam (positive = traditional wins)"
    )
    cumulative_delta: Decimal
    escalated_rate_per_sf: Decimal


class FixedCamModelerResult(BaseModel):
    """Full modeler output."""

    years: list[FixedCamYearResult]
    total_traditional_recovery: Decimal
    total_fixed_cam_revenue: Decimal
    total_delta: Decimal
    avg_annual_delta: Decimal


def calculate_fixed_cam_model(
    input: FixedCamModelerInput,
) -> FixedCamModelerResult:
    """
    Calculate Fixed CAM vs Traditional Reconciliation comparison.

    Traditional recovery is derived from total_operating_expenses *
    pro_rata_share / 100. Expense per SF is derived from
    total_operating_expenses / rentable_sf.

    Args:
        input: Year data, fixed rate, escalation, and tenant info.

    Returns:
        FixedCamModelerResult with year-by-year and aggregate comparison.

    Raises:
        ValueError: If inputs fail validation.
    """
    year_count = len(input.years)
    if not (3 <= year_count <= 5):
        raise ValueError("Number of years must be between 3 and 5")

    if input.annual_escalation_pct < Decimal("0"):
        raise ValueError("annual_escalation_pct must be non-negative")

    if input.annual_escalation_pct > Decimal("15"):
        raise ValueError("annual_escalation_pct must not exceed 15%")

    if input.tenant_sqft <= Decimal("0"):
        raise ValueError("tenant_sqft must be positive")

    sorted_years = sorted(input.years, key=lambda y: y.year)

    escalation_rate = Decimal("1") + input.annual_escalation_pct / Decimal("100")
    pro_rata_factor = input.pro_rata_share / Decimal("100")
    cumulative_delta = Decimal("0")
    total_traditional = Decimal("0")
    total_fixed = Decimal("0")
    year_results: list[FixedCamYearResult] = []

    for i, year_data in enumerate(sorted_years):
        expense_per_sf = (
            year_data.total_operating_expenses / year_data.rentable_sf
        ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        traditional_recovery = (
            year_data.total_operating_expenses * pro_rata_factor
        ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        escalated_rate = (input.fixed_cam_rate_per_sf * escalation_rate**i).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )

        fixed_cam_revenue = (
            input.fixed_cam_rate_per_sf * escalation_rate**i * input.tenant_sqft
        ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        delta = (traditional_recovery - fixed_cam_revenue).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )
        cumulative_delta += delta

        total_traditional += traditional_recovery
        total_fixed += fixed_cam_revenue

        year_results.append(
            FixedCamYearResult(
                year=year_data.year,
                total_operating_expenses=year_data.total_operating_expenses,
                expense_per_sf=expense_per_sf,
                traditional_recovery=traditional_recovery,
                fixed_cam_revenue=fixed_cam_revenue,
                delta=delta,
                cumulative_delta=cumulative_delta,
                escalated_rate_per_sf=escalated_rate,
            )
        )

    total_delta = (total_traditional - total_fixed).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )
    avg_annual_delta = (total_delta / Decimal(str(year_count))).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )

    return FixedCamModelerResult(
        years=year_results,
        total_traditional_recovery=total_traditional,
        total_fixed_cam_revenue=total_fixed,
        total_delta=total_delta,
        avg_annual_delta=avg_annual_delta,
    )
