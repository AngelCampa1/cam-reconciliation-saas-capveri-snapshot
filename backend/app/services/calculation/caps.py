"""
Expense cap calculations.

Three types of caps:
1. Non-cumulative: Caps increase each year, unused capacity lost
2. Cumulative: Unused capacity carries forward
3. Cumulative Compounding: Base amount grows each year
"""

import logging
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, Field

from app.services.calculation.models import (
    UNIT_COUNT,
    UNIT_RATIO,
    UNIT_TEXT,
    CalculationTrace,
)

logger = logging.getLogger(__name__)


class CapType:
    """Cap type constants."""

    NONE = "none"
    NON_CUMULATIVE = "non_cumulative"
    CUMULATIVE = "cumulative"
    CUMULATIVE_COMPOUNDING = "cumulative_compounding"


class CapResult(BaseModel):
    """Result of cap calculation."""

    original_amount: Decimal = Field(ge=0, description="Original uncapped amount")
    capped_amount: Decimal = Field(ge=0, description="Amount after applying cap")
    cap_applied: bool = Field(description="Whether cap was applied")
    savings_from_cap: Decimal = Field(
        ge=0, description="Amount saved due to cap (original - capped)"
    )
    cap_headroom: Decimal = Field(
        ge=0,
        description="Unused capacity (for cumulative: carries forward; for non-cumulative: lost)",  # noqa: E501
    )


def calculate_non_cumulative_cap(
    current_amount: Decimal,
    prior_amount: Decimal | None,
    cap_rate: Decimal | None = None,
    cap_fixed_amount: Decimal | None = None,
    trace: CalculationTrace | None = None,
) -> CapResult:
    """
    Calculate non-cumulative cap.

    Supports two modes:
    1. Percentage cap: max_allowed = prior_year * (1 + cap_rate)
    2. Fixed dollar cap: max_allowed = prior_year + cap_fixed_amount

    Year 1: No cap (no prior year to base on)

    Args:
        current_amount: This year's calculated expense
        prior_amount: Last year's expense (None for year 1)
        cap_rate: Annual cap rate (e.g., 0.05 for 5%) - use this OR cap_fixed_amount
        cap_fixed_amount: Fixed dollar max increase (e.g., 5000 for $5k) - use this OR cap_rate
        trace: Optional calculation trace

    Returns:
        CapResult with capped amount

    Raises:
        ValueError: If neither cap_rate nor cap_fixed_amount is provided
    """
    # Year 1: No cap
    if prior_amount is None:
        if trace:
            trace.add_step(
                name="Non-cumulative cap (Year 1)",
                inputs={"current_amount": current_amount},
                operation="No cap - first year",
                output=current_amount,
                note="No prior year to base cap on",
            )
        return CapResult(
            original_amount=current_amount,
            capped_amount=current_amount,
            cap_applied=False,
            savings_from_cap=Decimal("0"),
            cap_headroom=Decimal("0"),
        )

    # FIX CAP-4: Zero prior year cannot be used as cap baseline
    # When prior_amount=0, max_allowed would be 0*1.05=0, locking tenant to $0 forever
    # Treat like Year 1 - no meaningful baseline exists for percentage-based caps
    if prior_amount == Decimal("0"):
        if trace:
            trace.add_step(
                name="Non-cumulative cap (zero prior year)",
                inputs={"current_amount": current_amount, "prior_amount": prior_amount},
                operation="No cap - zero prior year has no meaningful baseline",
                output=current_amount,
                note="FIX CAP-4: Zero prior year cannot establish cap baseline",
            )
        return CapResult(
            original_amount=current_amount,
            capped_amount=current_amount,
            cap_applied=False,
            savings_from_cap=Decimal("0"),
            cap_headroom=Decimal("0"),
        )

    # Calculate maximum allowed increase
    if cap_fixed_amount is not None:
        # FIX FC-6: Validate cap_fixed_amount is non-negative
        if cap_fixed_amount < Decimal("0"):
            raise ValueError("cap_fixed_amount must be non-negative")
        # Fixed dollar cap: max increase is a fixed amount
        max_increase = cap_fixed_amount
        operation_desc = f"{prior_amount} + {cap_fixed_amount}"
    elif cap_rate is not None:
        # FIX FC-6: Validate cap_rate is non-negative
        if cap_rate < Decimal("0"):
            raise ValueError("cap_rate must be non-negative")
        # FIX CAP-5: Validate cap_rate magnitude
        # Cap rates >100% are likely data entry errors (e.g., 5 instead of 0.05)
        max_cap_rate = Decimal("1.0")  # 100%
        if cap_rate > max_cap_rate:
            raise ValueError(
                f"cap_rate {cap_rate} exceeds maximum {max_cap_rate} (100%). "
                f"Did you mean {cap_rate / 100}? Cap rates should be decimals (0.05 = 5%)."
            )
        # Percentage cap: max increase is percentage of prior
        max_increase = prior_amount * cap_rate
        operation_desc = f"{prior_amount} * (1 + {cap_rate})"
    else:
        raise ValueError("Either cap_rate or cap_fixed_amount must be provided")

    max_allowed = prior_amount + max_increase
    max_allowed = max_allowed.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        inputs_dict: dict[str, str | int | float | Decimal | date] = {
            "prior_amount": prior_amount,
        }
        input_units_dict: dict[str, str] = {}
        if cap_rate is not None:
            inputs_dict["cap_rate"] = cap_rate
            input_units_dict["cap_rate"] = UNIT_RATIO
        if cap_fixed_amount is not None:
            inputs_dict["cap_fixed_amount"] = cap_fixed_amount
        trace.add_step(
            name="Calculate max allowed",
            inputs=inputs_dict,
            operation=operation_desc,
            output=max_allowed,
            input_units=input_units_dict if input_units_dict else None,
        )

    # Apply cap
    if current_amount <= max_allowed:
        # Under cap
        capped = current_amount
        cap_applied = False
        savings = Decimal("0")
        headroom = max_allowed - current_amount
    else:
        # Over cap - limit to max
        capped = max_allowed
        cap_applied = True
        savings = current_amount - max_allowed
        headroom = Decimal("0")

    # Quantize savings to 2 decimal places
    savings = savings.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    headroom = headroom.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name="Apply non-cumulative cap",
            inputs={
                "current_amount": current_amount,
                "max_allowed": max_allowed,
            },
            operation="min(current, max_allowed)",
            output=capped,
            note="Cap applied" if cap_applied else "Within cap limit",
        )

    return CapResult(
        original_amount=current_amount,
        capped_amount=capped,
        cap_applied=cap_applied,
        savings_from_cap=savings,
        cap_headroom=headroom,
    )


def calculate_cumulative_cap(
    current_amount: Decimal,
    base_amount: Decimal,
    cap_rate: Decimal | None = None,
    cap_fixed_amount: Decimal | None = None,
    years_since_base: int = 1,
    prior_year_amounts: list[Decimal] | None = None,
    trace: CalculationTrace | None = None,
) -> CapResult:
    """
    Calculate cumulative cap with carry-forward.

    The cumulative cap allows unused capacity to be banked:
    - Each year, max increase is base * cap_rate (non-compounding)
    - Total max after N years: base + (base * cap_rate * N)
    - If actual is below max, difference is "banked"
    - Bank can be used in years where actual exceeds annual limit

    Example over 3 years (5% cap, $100k base):
    Year 1: Max=$105k, Actual=$102k, Bank=$3k
    Year 2: Max=$110k, Actual=$108k, Bank=$5k total
    Year 3: Max=$115k, Actual=$120k, Use $5k bank, Pay=$115k

    Args:
        current_amount: This year's calculated expense
        base_amount: Base year amount (year 0)
        cap_rate: Annual cap rate
        cap_fixed_amount: Fixed dollar max increase per year
        years_since_base: Years since base year
        prior_year_amounts: All prior year actual amounts
        trace: Optional calculation trace

    Returns:
        CapResult with capped amount and bank info
    """
    if prior_year_amounts is None:
        prior_year_amounts = []

    # Calculate theoretical max (what could have been spent cumulatively)
    if cap_fixed_amount is not None:
        # FIX FC-6: Validate cap_fixed_amount is non-negative
        if cap_fixed_amount < Decimal("0"):
            raise ValueError("cap_fixed_amount must be non-negative")
        # Fixed dollar cap: linear growth by fixed amount
        cumulative_max = base_amount + (cap_fixed_amount * years_since_base)
        annual_increase_limit = cap_fixed_amount
    elif cap_rate is not None:
        # FIX FC-6: Validate cap_rate is non-negative
        if cap_rate < Decimal("0"):
            raise ValueError("cap_rate must be non-negative")
        # FIX CAP-5: Validate cap_rate magnitude
        # Cap rates >100% are likely data entry errors (e.g., 5 instead of 0.05)
        max_cap_rate = Decimal("1.0")  # 100%
        if cap_rate > max_cap_rate:
            raise ValueError(
                f"cap_rate {cap_rate} exceeds maximum {max_cap_rate} (100%). "
                f"Did you mean {cap_rate / 100}? Cap rates should be decimals (0.05 = 5%)."
            )
        # Percentage cap: linear growth by percentage of base
        cumulative_max = base_amount * (Decimal("1") + (cap_rate * years_since_base))
        annual_increase_limit = base_amount * cap_rate
    else:
        raise ValueError("Either cap_rate or cap_fixed_amount must be provided")

    cumulative_max = cumulative_max.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    annual_increase_limit = annual_increase_limit.quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    if trace:
        operation_str = (
            f"{base_amount} + ({cap_fixed_amount} * {years_since_base})"
            if cap_fixed_amount
            else f"{base_amount} * (1 + {cap_rate} * {years_since_base})"
        )
        trace.add_step(
            name="Calculate cumulative cap",
            inputs={
                "base_amount": base_amount,
                "cap_rate": cap_rate if cap_rate else "N/A",
                "cap_fixed_amount": cap_fixed_amount if cap_fixed_amount else "N/A",
                "years_since_base": years_since_base,
            },
            operation=operation_str,
            output=cumulative_max,
            input_units={"cap_rate": UNIT_RATIO, "years_since_base": UNIT_COUNT},
        )

    # Calculate bank (unused capacity from prior years)
    # Year 1 has no bank - no prior years to accumulate from
    if years_since_base <= 1 or not prior_year_amounts:
        bank = Decimal("0")
        if trace:
            trace.add_step(
                name="Calculate cap bank",
                inputs={"years_since_base": years_since_base},
                operation="Year 1 - no prior years",
                output=bank,
                note="First year has no banked capacity",
                input_units={"years_since_base": UNIT_COUNT},
            )
    else:
        # Simulation approach - CORRECT per industry standards
        # Bank is a RUNNING BALANCE that gets consumed when used
        # See: Lexology, Lowndes Law, CRE Wisdoms for verification
        # Example (5% cap, $100k base):
        #   Year 1: Max=$105k, Actual=$102k, Bank=$3k (unused)
        #   Year 2: Max=$102k+$5k+$3k=$110k, Actual=$108k, Bank=$2k
        #   Year 3: If Actual=$115k, tenant pays $110k (108+5+2=115 max - consumed bank)
        running_reference = base_amount
        running_bank = Decimal("0")

        for actual in prior_year_amounts:
            # Each year, max is reference + annual increase + any banked capacity
            year_max = running_reference + annual_increase_limit + running_bank
            # Bank = what wasn't spent (running balance that can be consumed)
            running_bank = year_max - actual
            # Reference moves to actual for next year
            running_reference = actual

        bank = max(running_bank, Decimal("0"))  # Bank cannot be negative
        bank = bank.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        if trace:
            trace.add_step(
                name="Calculate cap bank (simulation)",
                inputs={
                    "prior_years": len(prior_year_amounts),
                    "prior_amounts_str": ", ".join(str(a) for a in prior_year_amounts),
                    "annual_increase_limit": annual_increase_limit,
                },
                operation="Simulate year-by-year bank accumulation",
                output=bank,
                note=f"Banked capacity: ${bank} (running balance)",
                input_units={"prior_years": UNIT_COUNT, "prior_amounts_str": UNIT_TEXT},
            )

    # Max allowed this year = prior_actual + annual_increase + bank
    # - prior_actual is the reference point (what was actually spent last year)
    # - annual_increase is the allowed growth this year
    # - bank is unused capacity from prior years (running balance)
    reference = prior_year_amounts[-1] if prior_year_amounts else base_amount
    max_allowed = reference + annual_increase_limit + bank
    max_allowed = max_allowed.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name="Calculate max allowed this year",
            inputs={
                "reference": reference,
                "annual_limit": annual_increase_limit,
                "bank": bank,
            },
            operation=f"{reference} + {annual_increase_limit} + {bank}",
            output=max_allowed,
            note="Industry standard: max = prior_actual + annual_increase + bank",
        )

    # Apply cap
    if current_amount <= max_allowed:
        capped = current_amount
        cap_applied = False
        savings = Decimal("0")
        remaining_bank = max_allowed - current_amount
    else:
        capped = max_allowed
        cap_applied = True
        savings = current_amount - max_allowed
        remaining_bank = Decimal("0")

    # Quantize
    savings = savings.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    remaining_bank = remaining_bank.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name="Apply cumulative cap",
            inputs={
                "current_amount": current_amount,
                "max_allowed": max_allowed,
            },
            operation="min(current, max_allowed)",
            output=capped,
            note=f'Cap {"applied" if cap_applied else "not needed"}, Bank remaining: ${remaining_bank}',
        )

    return CapResult(
        original_amount=current_amount,
        capped_amount=capped,
        cap_applied=cap_applied,
        savings_from_cap=savings,
        cap_headroom=remaining_bank,
    )


def calculate_cumulative_compounding_cap(
    current_amount: Decimal,
    base_amount: Decimal,
    cap_rate: Decimal | None = None,
    cap_fixed_amount: Decimal | None = None,
    years_since_base: int = 1,
    prior_year_amounts: list[Decimal] | None = None,
    trace: CalculationTrace | None = None,
) -> CapResult:
    """
    Calculate cumulative compounding cap.

    Like cumulative cap, but the base grows exponentially:
    max_year_N = base * (1 + cap_rate)^N

    Example (5% cap, $100k base):
    Year 1: Max = $100k * 1.05 = $105.0k
    Year 2: Max = $100k * 1.05^2 = $110.25k
    Year 3: Max = $100k * 1.05^3 = $115.76k

    This differs from cumulative (linear growth):
    Year 3 Linear: $100k + (3 * $5k) = $115k
    Year 3 Compound: $100k * 1.05^3 = $115.76k (+$760)

    Args:
        current_amount: This year's calculated expense
        base_amount: Base year amount
        cap_rate: Annual cap rate (for exponential growth)
        cap_fixed_amount: Fixed dollar max increase per year (linear)
        years_since_base: Years since base year
        prior_year_amounts: All prior year actual amounts
        trace: Optional calculation trace

    Returns:
        CapResult with capped amount

    Raises:
        ValueError: If neither cap_rate nor cap_fixed_amount is provided
    """
    if prior_year_amounts is None:
        prior_year_amounts = []

    # FIX FC-2: Bounds check years_since_base to prevent integer overflow
    # Very large exponents can cause astronomically large numbers and memory issues
    max_years = 50  # 50 years is reasonable max for commercial leases
    if years_since_base > max_years:
        years_since_base = max_years  # Cap at maximum to prevent overflow

    # Calculate compounded max
    if cap_fixed_amount is not None:
        # For fixed dollar caps, use additive: base + N * fixed
        # This is linear (same as cumulative for fixed dollar)
        max_allowed = base_amount + (cap_fixed_amount * years_since_base)
        compound_factor = (
            Decimal("1") + (cap_fixed_amount * years_since_base / base_amount)
            if base_amount > 0
            else Decimal("1")
        )
    elif cap_rate is not None:
        # FIX FC-2: Validate cap_rate is non-negative to prevent nonsensical results
        if cap_rate < Decimal("0"):
            raise ValueError("cap_rate must be non-negative")
        # FIX CAP-5: Validate cap_rate magnitude to prevent numeric overflow
        # Cap rates >100% are likely data entry errors (e.g., 5 instead of 0.05)
        # Even at 100% (doubling each year), (1+1.0)^50 = 2^50 = 10^15 which is huge
        # Commercial lease caps are typically 3-10%, rarely exceeding 15%
        max_cap_rate = Decimal("1.0")  # 100% - generous limit to catch errors
        if cap_rate > max_cap_rate:
            raise ValueError(
                f"cap_rate {cap_rate} exceeds maximum {max_cap_rate} (100%). "
                f"Did you mean {cap_rate / 100}? Cap rates should be decimals (0.05 = 5%)."
            )
        # Exponential growth: base * (1 + rate)^years
        compound_factor = (Decimal("1") + cap_rate) ** years_since_base
        max_allowed = base_amount * compound_factor
    else:
        raise ValueError("Either cap_rate or cap_fixed_amount must be provided")

    max_allowed = max_allowed.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        if cap_fixed_amount:
            operation_str = f"{base_amount} + ({cap_fixed_amount} * {years_since_base})"
        else:
            operation_str = f"{base_amount} * (1 + {cap_rate})^{years_since_base}"

        trace.add_step(
            name="Calculate compounding cap",
            inputs={
                "base_amount": base_amount,
                "cap_rate": cap_rate if cap_rate else "N/A",
                "cap_fixed_amount": cap_fixed_amount if cap_fixed_amount else "N/A",
                "years": years_since_base,
            },
            operation=operation_str,
            output=max_allowed,
            note=f"Compound factor: {compound_factor:.4f}",
            input_units={"cap_rate": UNIT_RATIO, "years": UNIT_COUNT},
        )

    # Calculate bank from prior years
    # Bank = cumulative_max_prior - cumulative_actual_prior
    cumulative_actual_prior = Decimal(sum(prior_year_amounts))

    if cap_fixed_amount is not None:
        # Sum of linear growth: base + fixed, base + 2*fixed, ..., base + (N-1)*fixed
        cumulative_max_prior = Decimal(
            sum(
                base_amount + (cap_fixed_amount * y) for y in range(1, years_since_base)
            )
        )
    elif cap_rate is not None:
        # Sum of exponential growth: base * 1.05^1, base * 1.05^2, ..., base * 1.05^(N-1)
        cumulative_max_prior = Decimal(
            sum(
                base_amount * ((Decimal("1") + cap_rate) ** y)
                for y in range(1, years_since_base)
            )
        )
    else:
        # Should not reach here due to earlier validation, but mypy needs narrowing
        cumulative_max_prior = Decimal("0")

    bank = cumulative_max_prior - cumulative_actual_prior
    bank = max(bank, Decimal("0"))
    bank = bank.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # This year's max includes any banked amount
    effective_max = max_allowed + bank
    effective_max = effective_max.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name="Add banked capacity",
            inputs={
                "max_allowed": max_allowed,
                "bank": bank,
            },
            operation="max_allowed + bank",
            output=effective_max,
        )

    # Apply cap
    if current_amount <= effective_max:
        capped = current_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        cap_applied = False
        savings = Decimal("0")
        remaining_bank = effective_max - current_amount
    else:
        capped = effective_max
        cap_applied = True
        savings = current_amount - effective_max
        remaining_bank = Decimal("0")

    # Quantize
    savings = savings.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    remaining_bank = remaining_bank.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name="Apply compounding cap",
            inputs={
                "current_amount": current_amount,
                "effective_max": effective_max,
            },
            operation="min(current, effective_max)",
            output=capped,
            note=f'{"Capped" if cap_applied else "Under cap"}',
        )

    return CapResult(
        original_amount=current_amount,
        capped_amount=capped,
        cap_applied=cap_applied,
        savings_from_cap=savings,
        cap_headroom=remaining_bank,
    )


class CapInput(BaseModel):
    """Input for cap calculation router."""

    cap_type: str = Field(
        description="Type of cap (none, non_cumulative, cumulative, cumulative_compounding)"
    )
    current_year_amount: Decimal = Field(
        ge=0, description="This year's calculated expense"
    )
    prior_year_amount: Decimal | None = Field(
        None, description="Last year's amount (for non-cumulative)"
    )
    base_year_amount: Decimal | None = Field(
        None, description="Base year amount (for cumulative caps)"
    )
    cap_rate: Decimal | None = Field(
        None, description="Annual cap rate (e.g., 0.05 for 5%)"
    )
    cap_fixed_amount: Decimal | None = Field(
        None, description="Fixed dollar cap amount"
    )
    all_prior_amounts: list[Decimal] | None = Field(
        None, description="All prior year amounts (for cumulative caps)"
    )


def apply_cap(
    cap_input: CapInput,
    trace: CalculationTrace | None = None,
) -> CapResult:
    """
    Apply the appropriate cap type.

    Router function that calls the correct cap calculator based on cap_type.

    Args:
        cap_input: Cap input parameters
        trace: Optional calculation trace

    Returns:
        CapResult from the appropriate cap calculator

    Raises:
        ValueError: If cap_type is unknown
    """
    if cap_input.cap_type == CapType.NONE:
        return CapResult(
            original_amount=cap_input.current_year_amount,
            capped_amount=cap_input.current_year_amount,
            cap_applied=False,
            savings_from_cap=Decimal("0"),
            cap_headroom=Decimal("0"),
        )

    elif cap_input.cap_type == CapType.NON_CUMULATIVE:
        return calculate_non_cumulative_cap(
            current_amount=cap_input.current_year_amount,
            prior_amount=cap_input.prior_year_amount,
            cap_rate=cap_input.cap_rate,
            cap_fixed_amount=cap_input.cap_fixed_amount,
            trace=trace,
        )

    elif cap_input.cap_type == CapType.CUMULATIVE:
        if cap_input.base_year_amount is None:
            raise ValueError("base_year_amount is required for cumulative cap type")
        return calculate_cumulative_cap(
            current_amount=cap_input.current_year_amount,
            base_amount=cap_input.base_year_amount,
            cap_rate=cap_input.cap_rate,
            cap_fixed_amount=cap_input.cap_fixed_amount,
            years_since_base=len(cap_input.all_prior_amounts or []) + 1,
            prior_year_amounts=cap_input.all_prior_amounts or [],
            trace=trace,
        )

    elif cap_input.cap_type == CapType.CUMULATIVE_COMPOUNDING:
        if cap_input.base_year_amount is None:
            raise ValueError(
                "base_year_amount is required for cumulative_compounding cap type"
            )
        return calculate_cumulative_compounding_cap(
            current_amount=cap_input.current_year_amount,
            base_amount=cap_input.base_year_amount,
            cap_rate=cap_input.cap_rate,
            cap_fixed_amount=cap_input.cap_fixed_amount,
            years_since_base=len(cap_input.all_prior_amounts or []) + 1,
            prior_year_amounts=cap_input.all_prior_amounts or [],
            trace=trace,
        )

    else:
        raise ValueError(f"Unknown cap type: {cap_input.cap_type}")
