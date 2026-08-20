"""
NOI Impact Calculator.

Translates a CAM recovery amount into NOI lift and asset valuation lift
using cap rate math. All calculations use Decimal for precision.

Formula:
    NOI lift = recovery_amount  (CAM recovery IS additional permanent NOI)
    Asset value lift = NOI lift / cap_rate
"""

from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, Field


class NOIImpactInput(BaseModel):
    """Input for NOI impact calculation."""

    recovery_amount: Decimal = Field(
        ge=0, description="Total CAM recovery amount in dollars"
    )
    cap_rate: Decimal = Field(
        gt=0, description="Capitalization rate as decimal (e.g. 0.07 for 7%)"
    )


class NOIImpactResult(BaseModel):
    """Result of NOI impact calculation."""

    recovery_amount: Decimal = Field(description="Original CAM recovery amount")
    noi_lift: Decimal = Field(
        description="Additional annual NOI (equals recovery_amount)"
    )
    asset_value_lift: Decimal = Field(
        description="Increase in asset valuation = NOI lift / cap_rate"
    )
    cap_rate: Decimal = Field(description="Cap rate used in calculation")


def calculate_noi_impact(input: NOIImpactInput) -> NOIImpactResult:
    """
    Calculate asset valuation lift from a CAM recovery amount.

    CAM recovery is permanent additional NOI. Dividing by the cap rate
    converts that income stream into an asset value increase.

    Args:
        input: Recovery amount and cap rate assumption.

    Returns:
        NOIImpactResult with noi_lift and asset_value_lift.

    Raises:
        ValueError: If cap_rate is outside the valid range [1%, 25%].
    """
    min_cap = Decimal("0.01")
    max_cap = Decimal("0.25")
    if not (min_cap <= input.cap_rate <= max_cap):
        raise ValueError("cap_rate must be between 1% and 25%")

    noi_lift = input.recovery_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    asset_value_lift = (noi_lift / input.cap_rate).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    return NOIImpactResult(
        recovery_amount=input.recovery_amount,
        noi_lift=noi_lift,
        asset_value_lift=asset_value_lift,
        cap_rate=input.cap_rate,
    )
