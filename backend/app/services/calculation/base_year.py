"""
Base year calculation for expense stop leases.

Base year stops allow tenants to only pay for expense increases above
a reference "base year" amount. This is the most common type of CAM
recovery in commercial real estate.

Formula:
    increase = current_expenses - base_year_amount
    recoverable_increase = max(0, increase)  # No pass-through of savings
    tenant_share = recoverable_increase * pro_rata_share
"""

import logging
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, Field

from app.models.lease_recovery_profile import BaseYearAdjustmentItem
from app.services.calculation.gross_up import (
    GrossUpConfig,
    calculate_gross_up_factor,
)
from app.services.calculation.models import (
    UNIT_RATIO,
    UNIT_TEXT,
    CalculationTrace,
)

logger = logging.getLogger(__name__)


class BaseYearInput(BaseModel):
    """Input for base year calculation."""

    current_year_expenses: Decimal = Field(
        description="Current year's total expenses for this pool"
    )
    base_year_amount: Decimal = Field(
        description="Base year expense amount (reference year)"
    )
    pro_rata_share: Decimal = Field(
        description="Tenant's proportionate share (e.g., 0.05 = 5%)"
    )
    base_year_adjustments: list[BaseYearAdjustmentItem] = Field(
        default_factory=list,
        description="Imputed costs for services introduced after the base year",
    )


class BaseYearResult(BaseModel):
    """Result of base year calculation."""

    current_expenses: Decimal = Field(description="Current year expenses")
    raw_base_year_amount: Decimal = Field(
        description="Base year reference amount before adjustments"
    )
    total_adjustments: Decimal = Field(description="Sum of all adjustment items")
    adjusted_base_year_amount: Decimal = Field(
        description="Effective base after adjustments"
    )
    adjustment_items: list[BaseYearAdjustmentItem] = Field(
        default_factory=list, description="Individual adjustment items"
    )
    increase_over_base: Decimal = Field(
        description="Increase over adjusted base (can be negative)"
    )
    pro_rata_share: Decimal = Field(description="Tenant's proportionate share")
    tenant_share: Decimal = Field(
        ge=0, description="Tenant's billable amount (always >= 0)"
    )
    is_under_base: bool = Field(
        description="True if current is below adjusted base (tenant pays $0)"
    )

    @property
    def base_year_amount(self) -> Decimal:
        """Backward-compatible alias for adjusted_base_year_amount."""
        return self.adjusted_base_year_amount


def calculate_base_year_increase(
    input_data: BaseYearInput,
    trace: CalculationTrace | None = None,
) -> BaseYearResult:
    """
    Calculate tenant's share of increase over base year.

    Formula:
        increase = max(0, current - base)
        tenant_share = increase * pro_rata_share

    If current is below base, tenant pays nothing for that pool.
    This is standard practice: landlord absorbs the benefit of lower expenses,
    tenant only pays for increases.

    Args:
        input_data: Expenses and lease terms
        trace: Optional calculation trace

    Returns:
        BaseYearResult with tenant share

    Example:
        >>> input_data = BaseYearInput(
        ...     current_year_expenses=Decimal("120000.00"),
        ...     base_year_amount=Decimal("100000.00"),
        ...     pro_rata_share=Decimal("0.05")
        ... )
        >>> result = calculate_base_year_increase(input_data)
        >>> result.tenant_share
        Decimal('1000.00')  # ($120k - $100k) * 5% = $1k
    """
    raw_base = input_data.base_year_amount
    adjustments = input_data.base_year_adjustments

    # Apply new-service adjustment items
    if trace and adjustments:
        trace.add_step(
            name="Raw base year amount",
            inputs={"raw_base_year_amount": str(raw_base)},
            operation="Starting point before new-service adjustments",
            output=raw_base,
        )

    total_adj = Decimal("0")
    for item in adjustments:
        total_adj += item.imputed_amount
        if trace:
            trace.add_step(
                name=f"Base year adjustment: {item.service_name}",
                inputs={
                    "imputed_amount": str(item.imputed_amount),
                    "justification": item.justification,
                },
                operation=f"Add imputed cost for '{item.service_name}'",
                output=item.imputed_amount,
                input_units={"justification": UNIT_TEXT},
            )

    adjusted_base = raw_base + total_adj

    if trace and adjustments:
        trace.add_step(
            name="Adjusted base year amount",
            inputs={"raw_base": str(raw_base), "total_adjustments": str(total_adj)},
            operation=f"{raw_base} + {total_adj}",
            output=adjusted_base,
        )

    # Calculate increase (can be negative)
    increase = input_data.current_year_expenses - adjusted_base
    is_under_base = increase < 0

    if trace:
        trace.add_step(
            name="Calculate increase over base",
            inputs={
                "current": input_data.current_year_expenses,
                "base": adjusted_base,
            },
            operation="current - base",
            output=increase,
            note="Under base year - no pass-through" if is_under_base else None,
        )

    # For under-base scenarios, increase is effectively 0
    # Landlord absorbs the savings, tenant doesn't get a credit
    recoverable_increase = max(increase, Decimal("0"))

    # Apply pro rata share
    tenant_share = recoverable_increase * input_data.pro_rata_share
    tenant_share = tenant_share.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name="Apply pro rata share",
            inputs={
                "increase": recoverable_increase,
                "pro_rata": input_data.pro_rata_share,
            },
            operation=f"{recoverable_increase} * {input_data.pro_rata_share}",
            output=tenant_share,
            input_units={"pro_rata": UNIT_RATIO},
        )

    return BaseYearResult(
        current_expenses=input_data.current_year_expenses,
        raw_base_year_amount=raw_base,
        total_adjustments=total_adj,
        adjusted_base_year_amount=adjusted_base,
        adjustment_items=adjustments,
        increase_over_base=increase,
        pro_rata_share=input_data.pro_rata_share,
        tenant_share=tenant_share,
        is_under_base=is_under_base,
    )


class BaseYearNormalizationInput(BaseModel):
    """Input for base year normalization."""

    raw_base_year_amount: Decimal = Field(
        description="Original base year expense amount"
    )
    # FIX EXT-4: Add upper bound validation for occupancy (can't exceed 100%)
    base_year_occupancy: Decimal = Field(
        ge=0, le=1, description="Occupancy during base year (e.g., 0.70 = 70%)"
    )
    target_occupancy: Decimal = Field(
        default=Decimal("0.95"),
        ge=0,
        le=1,
        description="Target occupancy for normalization",
    )
    should_normalize: bool = Field(
        default=False, description="Whether to normalize base year"
    )


def normalize_base_year(
    input_data: BaseYearNormalizationInput,
    trace: CalculationTrace | None = None,
) -> Decimal:
    """
    Normalize (gross up) base year if needed.

    If the base year had lower occupancy than target,
    the expenses may have been artificially low. Normalizing
    brings them to what they "would have been" at target occupancy.

    This prevents tenants from getting an unfair advantage when
    the base year had unusually low occupancy.

    Formula:
        factor = target_occupancy / base_year_occupancy
        normalized_base = raw_base * factor

    Args:
        input_data: Base year info and normalization settings
        trace: Optional calculation trace

    Returns:
        Normalized base year amount (or original if no normalization needed)

    Example:
        >>> input_data = BaseYearNormalizationInput(
        ...     raw_base_year_amount=Decimal("100000.00"),
        ...     base_year_occupancy=Decimal("0.70"),
        ...     target_occupancy=Decimal("0.95"),
        ...     should_normalize=True
        ... )
        >>> result = normalize_base_year(input_data)
        >>> result
        Decimal('135714.29')  # $100k * (0.95 / 0.70)
    """

    # Check if normalization is enabled
    if not input_data.should_normalize:
        if trace:
            trace.add_step(
                name="Base year normalization",
                inputs={"should_normalize": False},
                operation="Skip normalization (not enabled)",
                output=input_data.raw_base_year_amount,
                input_units={"should_normalize": UNIT_TEXT},
            )
        return input_data.raw_base_year_amount

    # FIX FC-4: Validate base year occupancy is non-zero and reasonable
    # Zero or near-zero occupancy cannot be normalized (would divide by zero)
    min_valid_occupancy = Decimal("0.01")  # 1% minimum

    if input_data.base_year_occupancy <= min_valid_occupancy:
        if trace:
            trace.add_step(
                name="Base year normalization",
                inputs={
                    "base_occupancy": input_data.base_year_occupancy,
                    "min_valid": min_valid_occupancy,
                },
                operation="Invalid occupancy - cannot normalize",
                output=input_data.raw_base_year_amount,
                note="WARNING: Base year occupancy too low for normalization",
                input_units={"base_occupancy": UNIT_RATIO, "min_valid": UNIT_RATIO},
            )
        # Raise an error rather than silently returning min_factor
        raise ValueError(
            f"Base year occupancy ({input_data.base_year_occupancy}) is too low "
            f"for normalization. Minimum: {min_valid_occupancy}"
        )

    # Check if normalization is needed
    # FIX EXT-7: Add warning when normalization requested but base >= target
    # This could indicate inverted values (data entry error)
    if input_data.base_year_occupancy >= input_data.target_occupancy:
        # Warn if base is significantly above target (possible value inversion)
        is_suspicious = (
            input_data.base_year_occupancy > input_data.target_occupancy
            and input_data.should_normalize
        )
        if trace:
            trace.add_step(
                name="Base year normalization",
                inputs={
                    "base_occupancy": input_data.base_year_occupancy,
                    "target": input_data.target_occupancy,
                },
                operation="No normalization needed (base >= target)",
                output=input_data.raw_base_year_amount,
                input_units={"base_occupancy": UNIT_RATIO, "target": UNIT_RATIO},
                note=(
                    (
                        "WARNING: Normalization requested but base year occupancy "
                        f"({input_data.base_year_occupancy:.1%}) exceeds target "
                        f"({input_data.target_occupancy:.1%}). "
                        "Verify values are not inverted."
                    )
                    if is_suspicious
                    else None
                ),
            )
        return input_data.raw_base_year_amount

    # Calculate gross-up factor for base year
    config = GrossUpConfig(
        target_occupancy=input_data.target_occupancy,
        min_factor=Decimal("1.0"),
    )
    factor = calculate_gross_up_factor(
        input_data.base_year_occupancy,
        config,
        trace,
    )

    # Apply factor to base year
    normalized = input_data.raw_base_year_amount * factor
    normalized = normalized.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name="Normalize base year",
            inputs={
                "raw_base": input_data.raw_base_year_amount,
                "factor": factor,
            },
            operation=f"{input_data.raw_base_year_amount} * {factor}",
            output=normalized,
            input_units={"factor": UNIT_RATIO},
            note=(
                f"Base year grossed up from "
                f"{input_data.base_year_occupancy:.1%} to "
                f"{input_data.target_occupancy:.1%}"
            ),
        )

    return normalized
