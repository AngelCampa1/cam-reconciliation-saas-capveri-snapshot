"""
Calculate tenant's share of recoverable expenses.

This module applies all lease terms to determine the final
amount a tenant owes:
1. Exclude non-recoverable pools
2. Apply base year stop
3. Apply pro-rata share
4. Apply expense cap
5. Add admin fee (with optional exclusions and cap)
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import AccountingBasis, BomaStandardVersion, SpaceType
from app.models.lease_recovery_profile import BaseYearAdjustmentItem
from app.services.calculation.base_year import (
    BaseYearInput,
    calculate_base_year_increase,
)
from app.services.calculation.caps import CapInput, CapType, apply_cap
from app.services.calculation.models import (
    UNIT_COUNT,
    UNIT_RATIO,
    UNIT_TEXT,
    CalculationTrace,
)
from app.services.calculation.pool_allocation import (
    PoolRecovery,
    _from_cents,
    _largest_remainder,
    _to_cents,
    allocate_pool_recoveries,
)

# Pool types a CAM cap does NOT apply to by convention (controllable-only caps).
# Taxes, insurance, and capital expenses are cap-exempt unless the lease says
# otherwise. This default is overridable per lease via
# ``LeaseTerms.cap_excluded_pools`` and is intentionally type-based, not
# name-based guessing.
_CAP_EXEMPT_POOL_TYPES = {"tax", "insurance", "capital"}

# Substring (lowercased) that identifies the property-level management-fee pool
# among operating-type pools. ``pools/auto_setup.py`` names this pool
# "Management Fee" when it maps GL lines like "management fee"/"admin"/"office
# expense". This is a name-based heuristic: a custom or renamed pool will not be
# recognized. See docs/goal-local-e2e/BUGS.md (BUG-14 follow-up) for adding a
# durable pool subtype so the cap no longer relies on the pool name.
_MANAGEMENT_FEE_POOL_MARKER = "management fee"


class LeaseTerms(BaseModel):
    """Lease recovery terms for calculation."""

    lease_id: UUID = Field(description="Lease ID")
    tenant_name: str = Field(description="Tenant name")
    # FIX NEW-FC-5: Validate pro_rata_share is in valid range (0-1)
    pro_rata_share: Decimal = Field(
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Pro-rata share percentage (e.g., 0.10 = 10%)",
    )
    admin_fee_percentage: Decimal = Field(
        default=Decimal("0"), description="Admin fee percentage"
    )
    management_fee_percentage: Decimal | None = Field(
        default=None,
        ge=Decimal("0"),
        description="Management fee percentage, distinct from admin fee",
    )
    admin_fee_cap: Decimal | None = Field(
        default=None, description="Max dollar amount for admin fee"
    )
    admin_fee_excludes_tax_insurance: bool = Field(
        default=False, description="Exclude T&I pools from admin fee"
    )
    admin_fee_excluded_pools: list[str] = Field(
        default_factory=list,
        description="Configurable pools to exclude from admin fee base",
    )
    tenant_sqft: Decimal | None = Field(default=None, description="Tenant square feet")
    expense_stops: dict[str, Decimal] | None = Field(
        default=None, description="Pool name to per-sqft stop"
    )
    base_year: int | None = Field(default=None, description="Base year")
    base_year_amount: Decimal | None = Field(
        default=None, description="Base year amount"
    )
    cap_type: str = Field(default=CapType.NONE, description="Cap type")
    cap_rate: Decimal | None = Field(default=None, description="Cap rate")
    excluded_pools: list[str] = Field(
        default_factory=list, description="Pools excluded from recovery"
    )
    cap_excluded_pools: list[str] = Field(
        default_factory=list,
        description=(
            "Pool names the expense cap does NOT apply to (lease override of "
            "the controllable-only cap convention)"
        ),
    )
    # FIX RO-1: Add lease dates for accurate occupancy calculation
    start_date: date | None = Field(
        default=None, description="Lease start date for occupancy calculation"
    )
    end_date: date | None = Field(
        default=None, description="Lease end date for occupancy calculation"
    )
    # BOMA 2024 compliance fields
    unit_space_type: SpaceType | None = Field(
        default=None,
        description="BOMA 2024 space type of the unit (None = unknown/legacy)",
    )
    rsf_measurement_standard: BomaStandardVersion | None = Field(
        default=None,
        description="BOMA standard used to derive this tenant's pro_rata_share",
    )
    term_version_id: UUID | None = Field(
        default=None,
        description="ID of the lease_term_version used for this calculation",
    )
    proration_factor: Decimal = Field(
        default=Decimal("1"),
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Active-days factor for partial-period lease terms",
    )
    accounting_basis: AccountingBasis | None = Field(
        default=None,
        description="Cash or accrual basis for GL date filtering",
    )
    base_year_adjustments: list[BaseYearAdjustmentItem] = Field(
        default_factory=list,
        description="Imputed costs for services introduced after the base year",
    )


class TenantShareInput(BaseModel):
    """Input for tenant share calculation."""

    lease_terms: LeaseTerms = Field(description="Lease terms")
    total_recoverable_expenses: Decimal = Field(description="Total expenses")
    pool_breakdown: dict[str, Decimal] = Field(
        description="Pool name to amount breakdown"
    )
    # FIX NEW-FC-1: Track original pool amounts before expense stops
    # When expense stops modify pool_breakdown with synthetic values,
    # we need the original amounts for exclusion and admin fee calculations.
    original_pool_breakdown: dict[str, Decimal] | None = Field(
        default=None,
        description="Original pool amounts before expense stops (for exclusions)",
    )
    prior_year_amount: Decimal | None = Field(
        default=None, description="Prior year amount for cap"
    )
    all_prior_amounts: list[Decimal] | None = Field(
        default=None, description="All prior amounts for cumulative cap"
    )
    cap_base_year_amount: Decimal | None = Field(
        default=None, description="Original base for cumulative caps"
    )
    pool_types: dict[str, str] | None = Field(
        default=None,
        description=(
            "Pool name to pool_type (operating/tax/insurance/capital/other). "
            "Used to classify cap-eligible (controllable) pools for the "
            "per-pool recovery breakdown. When absent and a cap reduces the "
            "share, the per-pool breakdown is withheld rather than guessed."
        ),
    )
    current_year: int = Field(description="Current year")


class TenantShareResult(BaseModel):
    """Result of tenant share calculation."""

    tenant_name: str = Field(description="Tenant name")
    gross_recoverable: Decimal = Field(
        description="Gross recoverable before exclusions"
    )
    excluded_amount: Decimal = Field(description="Amount excluded from recovery")
    net_recoverable: Decimal = Field(description="Net recoverable after exclusions")
    base_year_amount: Decimal | None = Field(
        default=None, description="Base year amount if applicable"
    )
    increase_over_base: Decimal = Field(
        description="Increase over base year (or 0 if no base)"
    )
    tenant_share_before_cap: Decimal = Field(
        description="Tenant share before cap applied"
    )
    cap_applied: bool = Field(description="Whether cap was applied")
    tenant_share_after_cap: Decimal = Field(description="Tenant share after cap")
    admin_fee: Decimal = Field(description="Admin fee amount")
    total_recovery: Decimal = Field(description="Total recovery amount")
    pool_breakdowns: list[PoolRecovery] = Field(
        default_factory=list,
        description=(
            "Per-pool split of this recovery (cap attributed to controllable "
            "pools only). Empty when no per-pool data is available or when a "
            "cap reduction could not be classified to controllable pools."
        ),
    )
    trace: CalculationTrace = Field(description="Calculation trace")


def _reduce_pools_to_cap(
    breakdown: dict[str, Decimal],
    pool_names: set[str],
    cap: Decimal,
) -> None:
    """Scale the given pools down so their combined amount equals ``cap``.

    Mutates ``breakdown`` in place. With a single matched pool this simply sets
    it to ``cap``. With multiple matched pools the reduction is distributed
    pro-rata by booked amount using largest-remainder cent allocation, so the
    matched pools sum to exactly ``cap`` AND every pool stays non-negative — a
    naive "last pool absorbs the remainder" split can drive that pool a cent
    negative when the earlier pro-rata roundings accumulate past the cap. No-op
    when the matched pools are already at or below ``cap`` (or sum to zero).
    """
    present = [name for name in sorted(pool_names) if name in breakdown]
    if not present:
        return
    current_total = sum((breakdown[name] for name in present), Decimal("0"))
    if current_total <= cap or current_total <= Decimal("0"):
        return
    weights = [breakdown[name] for name in present]
    parts = _largest_remainder(_to_cents(cap), weights)
    for name, part in zip(present, parts):
        breakdown[name] = _from_cents(part)


def _apply_management_fee_cap(
    *,
    pool_breakdown: dict[str, Decimal],
    original_pool_breakdown: dict[str, Decimal] | None,
    pool_types: dict[str, str] | None,
    management_fee_percentage: Decimal | None,
    trace: CalculationTrace,
) -> tuple[dict[str, Decimal], dict[str, Decimal] | None, Decimal]:
    """Cap the recoverable management-fee pool before any tenant-level math.

    The lease's ``management_fee_percentage`` is a CAP, not an add-on (contrast
    with ``admin_fee_percentage``, which is a surcharge on top of the CAM total).
    Per the extraction contract (``extraction/prompts.py``) and detection Rule 3,
    it limits the recoverable management fee to a percentage of operating
    expenses **excluding the management fee itself** (preventing fee-on-fee
    circularity). Taxes, insurance, and capital pools are not part of the base.

    Any GL-booked management fee above ``rate * operating_base_excl_fee`` is
    non-recoverable: the management-fee pool(s) are reduced to the cap here, so
    the excess never reaches exclusions, base-year, pro-rata, cap, or admin-fee
    steps. The cap is applied at the property-pool level (parameterized per lease)
    because the management-fee pool is property-level while the cap lives on the
    lease recovery profile.

    Returns ``(pool_breakdown, original_pool_breakdown, excess)`` with adjusted
    copies; the inputs are never mutated. ``excess`` is the dollar amount removed
    from the recoverable total (``Decimal("0")`` when no reduction applies).
    """
    rate = management_fee_percentage
    if rate is None or rate == Decimal("0"):
        return pool_breakdown, original_pool_breakdown, Decimal("0")

    if not pool_types:
        # Without pool types we cannot identify the operating base or the
        # management-fee pool. Skip rather than guess (consistent with how the
        # per-pool allocation withholds output when classification is missing).
        trace.add_step(
            name="Management fee cap skipped",
            inputs={"rate": rate, "pool_types": "unavailable"},
            operation="skip - pool classification unavailable",
            output=Decimal("0"),
            input_units={"rate": UNIT_RATIO, "pool_types": UNIT_TEXT},
            note=(
                "Management fee cap not applied: pool types unavailable, cannot "
                "identify the operating base or the management-fee pool"
            ),
        )
        return pool_breakdown, original_pool_breakdown, Decimal("0")

    # Identify the management-fee pool(s) by name (mirrors pools/auto_setup.py).
    # Match regardless of pool_type so a fee pool is never silently left uncapped
    # (the cap base below is still restricted to operating-type pools).
    mgmt_fee_pools = {
        name for name in pool_types if _MANAGEMENT_FEE_POOL_MARKER in name.lower()
    }
    if not mgmt_fee_pools:
        trace.add_step(
            name="Management fee cap skipped",
            inputs={"rate": rate},
            operation="skip - no management-fee pool found",
            output=Decimal("0"),
            input_units={"rate": UNIT_RATIO},
            note=(
                "Management fee cap not applied: no pool named like "
                "'Management Fee' in this property's breakdown"
            ),
        )
        return pool_breakdown, original_pool_breakdown, Decimal("0")

    # The cap is a function of the REAL (pre-expense-stop) booked dollars. When a
    # lease has expense stops, ``pool_breakdown`` carries synthetic per-pool values
    # (above_stop / pro_rata_share) while ``original_pool_breakdown`` carries the
    # real grossed-up amounts (FIX NEW-FC-1). Compute the base, the booked fee, and
    # the cap from that real basis so an over-booked fee is caught even on
    # expense-stop leases. (A management-fee pool does not itself carry an expense
    # stop in practice, so its real and synthetic values coincide and the reduction
    # below stays consistent with the scalar total.)
    basis = (
        original_pool_breakdown
        if original_pool_breakdown is not None
        else pool_breakdown
    )

    # Cap base = operating-type pools EXCLUDING the management-fee pool(s).
    operating_base = sum(
        (
            amount
            for name, amount in basis.items()
            if (pool_types.get(name) or "").lower() == "operating"
            and name not in mgmt_fee_pools
        ),
        Decimal("0"),
    )
    # Floor at zero: a net-negative operating base (GL reversals/credits) must not
    # produce a negative cap that would over-remove the fee.
    cap = max(
        Decimal("0"),
        (rate * operating_base).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
    )

    booked_fee = sum(
        (basis.get(name, Decimal("0")) for name in mgmt_fee_pools),
        Decimal("0"),
    )
    if booked_fee <= cap:
        trace.add_step(
            name="Management fee cap check",
            inputs={
                "rate": rate,
                "operating_base_excl_fee": operating_base,
                "cap": cap,
                "booked_fee": booked_fee,
            },
            operation="booked_fee <= cap -> no reduction",
            output=booked_fee,
            input_units={"rate": UNIT_RATIO},
            note="Management fee within cap; fully recoverable",
        )
        return pool_breakdown, original_pool_breakdown, Decimal("0")

    excess = booked_fee - cap

    adjusted = dict(pool_breakdown)
    _reduce_pools_to_cap(adjusted, mgmt_fee_pools, cap)

    adjusted_original = original_pool_breakdown
    if original_pool_breakdown is not None:
        # Cap the original (pre-expense-stop) breakdown's fee pool(s) at the same
        # cap so exclusion and admin-fee ratios use the recoverable amount.
        adjusted_original = dict(original_pool_breakdown)
        _reduce_pools_to_cap(adjusted_original, mgmt_fee_pools, cap)

    trace.add_step(
        name="Apply management fee cap",
        inputs={
            "rate": rate,
            "operating_base_excl_fee": operating_base,
            "cap": cap,
            "booked_fee": booked_fee,
        },
        operation=f"min(booked_fee, {rate} * operating_base_excl_fee)",
        output=cap,
        input_units={"rate": UNIT_RATIO},
        note=(
            f"Management fee reduced from {booked_fee} to {cap}; "
            f"excess {excess} excluded from recovery"
        ),
    )
    return adjusted, adjusted_original, excess


def calculate_tenant_share(
    input_data: TenantShareInput,
    trace: CalculationTrace | None = None,
) -> TenantShareResult:
    """
    Calculate a tenant's share of recoverable expenses.

    Steps:
    1. Remove excluded pools
    2. Apply base year stop
    3. Apply pro-rata share
    4. Apply cap
    5. Add admin fee

    Args:
        input_data: Expense totals and lease terms
        trace: Optional calculation trace

    Returns:
        TenantShareResult with complete breakdown

    Example:
        >>> terms = LeaseTerms(
        ...     lease_id=UUID("..."),
        ...     tenant_name="Acme Corp",
        ...     pro_rata_share=Decimal("0.10"),
        ... )
        >>> input_data = TenantShareInput(
        ...     lease_terms=terms,
        ...     total_recoverable_expenses=Decimal("100000"),
        ...     pool_breakdown={},
        ...     current_year=2024,
        ... )
        >>> result = calculate_tenant_share(input_data)
        >>> result.total_recovery
        Decimal('10000.00')
    """
    if trace is None:
        from datetime import date

        trace = CalculationTrace(
            calculation_type="tenant_share",
            property_id=UUID(int=0),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

    terms = input_data.lease_terms

    # Step 0: Apply the management fee cap before any tenant-level math.
    # ``management_fee_percentage`` is a CAP on the recoverable management-fee
    # pool (% of operating expenses excluding the fee itself), not an add-on. Any
    # excess over the cap is non-recoverable and removed from the pools here so it
    # never reaches exclusions, base-year, pro-rata, cap, or admin-fee steps.
    pool_breakdown, original_pool_breakdown, mgmt_fee_excess = (
        _apply_management_fee_cap(
            pool_breakdown=input_data.pool_breakdown,
            original_pool_breakdown=input_data.original_pool_breakdown,
            pool_types=input_data.pool_types,
            management_fee_percentage=terms.management_fee_percentage,
            trace=trace,
        )
    )
    total_recoverable_expenses = input_data.total_recoverable_expenses - mgmt_fee_excess

    # FIX NEW-FC-1: Use original pool breakdown for exclusion calculations
    # When expense stops are applied, pool_breakdown contains synthetic values
    # (above_stop / pro_rata_share). For exclusions, we need original pool amounts.
    exclusion_pool_breakdown = (
        original_pool_breakdown
        if original_pool_breakdown is not None
        else pool_breakdown
    )

    # Step 1: Remove excluded pools
    excluded_amount = Decimal("0")
    for pool_name in terms.excluded_pools:
        if pool_name in exclusion_pool_breakdown:
            excluded_amount += exclusion_pool_breakdown[pool_name]

    net_recoverable = total_recoverable_expenses - excluded_amount

    trace.add_step(
        name="Exclude pools",
        inputs={
            "total": total_recoverable_expenses,
            "excluded_pools": (
                str(terms.excluded_pools) if terms.excluded_pools else "None"
            ),
        },
        operation="total - excluded",
        output=net_recoverable,
        input_units={"excluded_pools": UNIT_TEXT},
        note=(
            f"Excluded: {terms.excluded_pools}"
            if terms.excluded_pools
            else "No exclusions"
        ),
    )

    # Step 2: Apply base year stop (delegates to calculate_base_year_increase
    # to avoid duplicating adjustment trace logic)
    if terms.base_year and terms.base_year_amount:
        by_result = calculate_base_year_increase(
            BaseYearInput(
                current_year_expenses=net_recoverable,
                base_year_amount=terms.base_year_amount,
                pro_rata_share=terms.pro_rata_share,
                base_year_adjustments=terms.base_year_adjustments,
            ),
            trace=trace,
        )
        # Pro-rata already applied inside calculate_base_year_increase()
        tenant_share_before_cap = by_result.tenant_share
        base_year_applied = by_result.adjusted_base_year_amount
        # Recoverable increase (clamped to 0) for the result
        base_year_increase = max(Decimal("0"), by_result.increase_over_base)
    else:
        base_year_applied = None
        base_year_increase = Decimal("0")
        trace.add_step(
            name="Base year check",
            inputs={"has_base_year": False},
            operation="No base year - full amount recoverable",
            output=net_recoverable,
            input_units={"has_base_year": UNIT_TEXT},
        )

        # Step 3: Apply pro-rata share (only when no base year stop)
        tenant_share_before_cap = (net_recoverable * terms.pro_rata_share).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        trace.add_step(
            name="Apply pro-rata share",
            inputs={
                "increase": net_recoverable,
                "pro_rata": terms.pro_rata_share,
            },
            operation=f"{net_recoverable} * {terms.pro_rata_share}",
            output=tenant_share_before_cap,
            input_units={"pro_rata": UNIT_RATIO},
        )

    if terms.proration_factor != Decimal("1"):
        unprorated_share = tenant_share_before_cap
        tenant_share_before_cap = (
            tenant_share_before_cap * terms.proration_factor
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        trace.add_step(
            name="Apply day-based proration",
            inputs={
                "tenant_share_before_proration": unprorated_share,
                "proration_factor": terms.proration_factor,
            },
            operation=(f"{unprorated_share} * {terms.proration_factor}"),
            output=tenant_share_before_cap,
            input_units={"proration_factor": UNIT_RATIO},
        )

    # A net-credit period (GL credits exceed charges) can drive the tenant's
    # pre-cap share negative. Recoveries are floored at zero here — a credit is
    # never billed as a negative recovery, and caps are undefined on negative
    # amounts — mirroring the per-pool PoolRecovery >= 0 clamp. Without this, a
    # net-negative pool would crash the run on the CapInput `ge=0` validator.
    if tenant_share_before_cap < 0:
        trace.add_step(
            name="Clamp negative recovery to zero",
            inputs={"raw_tenant_share_before_cap": tenant_share_before_cap},
            operation="max(0, tenant_share_before_cap)",
            output=Decimal("0"),
            note="Net GL credits drove the pre-cap share negative; floored to 0.",
        )
        tenant_share_before_cap = Decimal("0")

    # Step 4: Apply cap
    # FIX FC-7: Don't use current year as base for cumulative caps
    # For cumulative caps, a proper base year is required for meaningful calculations.
    # If no historical data exists, log warning and skip cap for first year.
    is_cumulative_cap = terms.cap_type in (
        CapType.CUMULATIVE,
        CapType.CUMULATIVE_COMPOUNDING,
    )
    has_valid_base = (
        input_data.cap_base_year_amount is not None
        or input_data.prior_year_amount is not None
    )

    if is_cumulative_cap and not has_valid_base:
        # First year for cumulative cap - cannot apply cap without historical base
        trace.add_step(
            name="Cumulative cap check",
            inputs={
                "cap_type": terms.cap_type,
                "has_base_year": False,
            },
            operation="Skip cap - first year with no historical base",
            output=tenant_share_before_cap,
            input_units={"cap_type": UNIT_TEXT, "has_base_year": UNIT_TEXT},
            note="WARNING: Cumulative cap requires historical base year data. "
            "Cap will apply from next year using this year as the base.",
        )
        cap_input = CapInput(
            cap_type=CapType.NONE,  # Skip cap for first year
            cap_rate=Decimal("0"),
            current_year_amount=tenant_share_before_cap,
            prior_year_amount=None,
            base_year_amount=tenant_share_before_cap,
            all_prior_amounts=None,
            cap_fixed_amount=None,
        )
    else:
        # Normal cap calculation with valid base
        cap_input = CapInput(
            cap_type=terms.cap_type,
            cap_rate=terms.cap_rate or Decimal("0"),
            current_year_amount=tenant_share_before_cap,
            prior_year_amount=input_data.prior_year_amount,
            # For cumulative caps, use original base year amount (not prior year).
            # Use an explicit None check (not ``or``): a genuine $0.00 base is a
            # valid base — ``has_valid_base`` above already admits it via
            # ``is not None`` — and a truthiness fallthrough would send it to
            # prior_year_amount (None) and crash apply_cap (FIX: bug #17).
            base_year_amount=(
                input_data.cap_base_year_amount
                if input_data.cap_base_year_amount is not None
                else input_data.prior_year_amount
            ),
            all_prior_amounts=input_data.all_prior_amounts,
            cap_fixed_amount=None,
        )
    cap_result = apply_cap(cap_input, trace)
    tenant_share_after_cap = cap_result.capped_amount

    # Step 5: Calculate admin fee
    # Step 5a: Determine admin fee base (may exclude specified pools)
    # Use configurable excluded pools list; fallback to default T&I pools if flag is set
    excluded_from_admin = {p.lower() for p in terms.admin_fee_excluded_pools}
    if terms.admin_fee_excludes_tax_insurance and not excluded_from_admin:
        # Default T&I pools when flag is set but no explicit list provided
        excluded_from_admin = {
            "taxes",
            "insurance",
            "real_estate_taxes",
            "property_insurance",
            "tax",
            "property_tax",
            "building_insurance",
        }

    # FIX NEW-FC-2: Calculate admin fee base correctly
    # Admin fee should be based on tenant_share_after_cap (which accounts for
    # base year and caps), not a fresh calculation from raw pool amounts.
    # If certain pools are excluded from admin fee, calculate the ratio of
    # non-excluded pools to total pools, then apply that ratio to the tenant share.
    # FIX NEW-FC-1: Use original pool breakdown for admin fee exclusion ratio
    # When expense stops are applied, pool_breakdown contains synthetic values.
    if excluded_from_admin:
        total_pool_amount = sum(exclusion_pool_breakdown.values())
        excluded_pool_amount = sum(
            amt
            for pool, amt in exclusion_pool_breakdown.items()
            if pool.lower() in excluded_from_admin
        )

        if total_pool_amount > 0:
            # Calculate what portion of expenses are included (not excluded)
            included_pool_amount = max(
                Decimal("0"), total_pool_amount - excluded_pool_amount
            )
            inclusion_ratio = Decimal(str(included_pool_amount / total_pool_amount))

            # Apply ratio to tenant's actual share (after base year and caps)
            admin_base = max(
                Decimal("0"),
                (tenant_share_after_cap * inclusion_ratio).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                ),
            )
        else:
            admin_base = Decimal("0")

        trace.add_step(
            name="Exclude pools from admin fee base",
            inputs={
                "excluded_pools": str(sorted(excluded_from_admin)),
                "inclusion_ratio": (
                    inclusion_ratio if total_pool_amount > 0 else Decimal("0")
                ),
            },
            operation="tenant_share_after_cap * (non_excluded_pools / total_pools)",
            output=admin_base,
            input_units={"excluded_pools": UNIT_TEXT, "inclusion_ratio": UNIT_RATIO},
            note=f"Pools excluded from admin fee: {sorted(excluded_from_admin)}",
        )
    else:
        admin_base = tenant_share_after_cap

    # Step 5b: Calculate and optionally cap admin fee
    admin_fee = admin_base * terms.admin_fee_percentage
    if terms.admin_fee_cap is not None:
        admin_fee = min(admin_fee, terms.admin_fee_cap)
    admin_fee = admin_fee.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    trace.add_step(
        name="Calculate admin fee",
        inputs={
            "admin_base": admin_base,
            "fee_rate": terms.admin_fee_percentage,
            "fee_cap": (
                terms.admin_fee_cap if terms.admin_fee_cap is not None else Decimal("0")
            ),
        },
        operation=f"{admin_base} * {terms.admin_fee_percentage}"
        + (f", capped at {terms.admin_fee_cap}" if terms.admin_fee_cap else ""),
        output=admin_fee,
        input_units={"fee_rate": UNIT_RATIO},
    )

    total_recovery = tenant_share_after_cap + admin_fee

    trace.add_step(
        name="Total recovery",
        inputs={
            "share": tenant_share_after_cap,
            "admin_fee": admin_fee,
        },
        operation="share + admin_fee",
        output=total_recovery,
    )

    # Per-pool allocation (Module A "Produce"): push the aggregate layer results
    # back onto the expense pools so Module B can compare pool-by-pool. The cap
    # reduction is attributed to controllable pools only. We WITHHOLD the
    # breakdown when a cap reduced the share but we lack pool classification,
    # because guessing which pools are controllable would misstate the
    # tax/insurance pools an opposing system checks first.
    pool_breakdowns: list[PoolRecovery] = []
    excluded_lower = {p.lower() for p in terms.excluded_pools}
    recoverable_by_pool = {
        name: amount
        for name, amount in pool_breakdown.items()
        if name.lower() not in excluded_lower
    }
    cap_reduction = tenant_share_before_cap - tenant_share_after_cap
    classification_available = bool(input_data.pool_types) or bool(
        terms.cap_excluded_pools
    )
    if recoverable_by_pool and (
        cap_reduction == Decimal("0") or classification_available
    ):
        cap_exempt_pools = {p.lower() for p in terms.cap_excluded_pools}
        pool_types = input_data.pool_types or {}
        for name in recoverable_by_pool:
            pool_type = pool_types.get(name)
            if pool_type and pool_type.lower() in _CAP_EXEMPT_POOL_TYPES:
                cap_exempt_pools.add(name.lower())
        pool_breakdowns = allocate_pool_recoveries(
            recoverable_by_pool=recoverable_by_pool,
            cap_exempt_pools=cap_exempt_pools,
            admin_fee_excluded_pools=excluded_from_admin,
            tenant_share_before_cap=tenant_share_before_cap,
            tenant_share_after_cap=tenant_share_after_cap,
            admin_fee=admin_fee,
        )
        trace.add_step(
            name="Allocate recovery to pools",
            inputs={
                "pool_count": len(pool_breakdowns),
                "cap_exempt_pools": (
                    str(sorted(cap_exempt_pools)) if cap_exempt_pools else "None"
                ),
            },
            operation="layer-faithful per-pool split (cap -> controllable only)",
            output=total_recovery,
            input_units={"pool_count": UNIT_COUNT, "cap_exempt_pools": UNIT_TEXT},
            note="Per-pool breakdown reconciles to total recovery",
        )
    elif cap_reduction != Decimal("0") and recoverable_by_pool:
        trace.add_step(
            name="Skip per-pool allocation",
            inputs={"cap_reduction": cap_reduction},
            operation="withheld - pool classification unavailable",
            output=total_recovery,
            note=(
                "Per-pool breakdown withheld: cannot attribute the cap to "
                "controllable pools without pool types"
            ),
        )

    return TenantShareResult(
        tenant_name=terms.tenant_name,
        gross_recoverable=total_recoverable_expenses,
        excluded_amount=excluded_amount,
        net_recoverable=net_recoverable,
        base_year_amount=base_year_applied,
        increase_over_base=base_year_increase,
        tenant_share_before_cap=tenant_share_before_cap,
        cap_applied=cap_result.cap_applied,
        tenant_share_after_cap=tenant_share_after_cap,
        admin_fee=admin_fee,
        total_recovery=total_recovery,
        pool_breakdowns=pool_breakdowns,
        trace=trace,
    )
