"""
BOMA 2024 Rentable Area Calculator.

Computes how much additional billable rentable SF a building gains by
adopting BOMA 2024 measurement standards, which allow outdoor amenity
spaces (balconies, terraces, courtyard areas) to be included in
usable SF before the load factor is applied.

All math uses Decimal with ROUND_HALF_UP — no float arithmetic.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, Field


class BomaCalculationInput(BaseModel):
    """Inputs for the BOMA 2024 rentable area calculation."""

    usable_sf: Decimal = Field(gt=0, description="Existing usable SF (BOMA 2017 basis)")
    rentable_sf: Decimal = Field(
        gt=0, description="Existing rentable SF (BOMA 2017 basis)"
    )
    balcony_sf: Decimal = Field(
        ge=0,
        default=Decimal("0"),
        description="Balcony SF newly included under BOMA 2024",
    )
    terrace_sf: Decimal = Field(
        ge=0,
        default=Decimal("0"),
        description="Terrace SF newly included under BOMA 2024",
    )
    outdoor_amenity_sf: Decimal = Field(
        ge=0,
        default=Decimal("0"),
        description="Other outdoor amenity SF included under BOMA 2024",
    )
    annual_rent_per_sf: Decimal = Field(gt=0, description="Annual rent per SF ($/year)")
    cap_rate: Decimal = Field(
        gt=Decimal("0"),
        le=Decimal("1"),
        default=Decimal("0.065"),
        description="Capitalization rate for asset value calculation (0–1)",
    )


class BomaCalculationResult(BaseModel):
    """Results of the BOMA 2024 rentable area calculation."""

    load_factor: Decimal  # 4 decimal places
    new_usable_sf: Decimal  # 2 decimal places
    new_rentable_sf: Decimal  # 2 decimal places
    hidden_sf: Decimal  # 2 decimal places (min 0)
    pct_increase: Decimal  # 4 decimal places
    revenue_lift: Decimal  # 2 decimal places
    asset_value_lift: Decimal  # 0 decimal places (whole dollars)


def calculate_boma_2024(inputs: BomaCalculationInput) -> BomaCalculationResult:
    """
    Calculate hidden billable SF and financial impact under BOMA 2024.

    Derives the existing load factor from the provided usable/rentable SF,
    then applies it to the expanded usable SF (including outdoor spaces) to
    determine how much additional rentable SF BOMA 2024 unlocks.

    Args:
        inputs: Validated BomaCalculationInput

    Returns:
        BomaCalculationResult with all Decimal fields quantized appropriately

    Raises:
        ValueError: If rentable_sf < usable_sf (implies load factor < 1, invalid)
    """
    if inputs.rentable_sf < inputs.usable_sf:
        raise ValueError(
            "rentable_sf must be >= usable_sf (load factor < 1 is invalid)"
        )

    # Derive existing load factor from current measurements (4 decimal places)
    load_factor = (inputs.rentable_sf / inputs.usable_sf).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )

    # New usable SF includes outdoor spaces newly measurable under BOMA 2024
    new_usable_sf = (
        inputs.usable_sf
        + inputs.balcony_sf
        + inputs.terrace_sf
        + inputs.outdoor_amenity_sf
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Apply existing load factor to expanded usable SF
    new_rentable_sf = (new_usable_sf * load_factor).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    # Hidden SF = additional billable area (never negative)
    hidden_sf = max(Decimal("0"), new_rentable_sf - inputs.rentable_sf).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    # Percentage increase over existing rentable SF
    pct_increase = (hidden_sf / inputs.rentable_sf * Decimal("100")).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )

    # Annual revenue lift from newly billable SF
    revenue_lift = (hidden_sf * inputs.annual_rent_per_sf).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    # Asset value lift = revenue lift capitalized at cap rate
    asset_value_lift = (revenue_lift / inputs.cap_rate).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )

    return BomaCalculationResult(
        load_factor=load_factor,
        new_usable_sf=new_usable_sf,
        new_rentable_sf=new_rentable_sf,
        hidden_sf=hidden_sf,
        pct_increase=pct_increase,
        revenue_lift=revenue_lift,
        asset_value_lift=asset_value_lift,
    )
