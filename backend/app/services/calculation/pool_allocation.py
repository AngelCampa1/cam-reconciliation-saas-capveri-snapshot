"""Deterministic per-pool allocation of aggregate tenant-share results.

``calculate_tenant_share`` collapses every recovery layer (exclusions, base-year
stop / pro-rata, proration, cap, admin fee) into a handful of *aggregate* scalar
amounts. For Module B "Compare" to check a charge pool-by-pool, and for a
landlord to see *which* pool drove a recovery, those aggregates must be pushed
back down onto the individual expense pools.

This module does exactly that, deterministically and with no LLM involvement
(financial math is Python-only). The allocation is **layer-faithful** (Option B):

* ``share_before_cap`` is split across pools in proportion to each pool's
  recoverable contribution;
* the cap reduction is attributed **only to cap-eligible (controllable) pools** —
  taxes, insurance, and other cap-exempt pools keep their full pre-cap share,
  because a CAM cap legally applies to controllable expenses only. Spreading a
  cap reduction across tax/insurance would misstate exactly the pools an
  opposing system or auditor checks first;
* the admin fee is attributed **only to fee-eligible pools**.

The non-negotiable contract: the per-pool numbers always **sum exactly** to the
aggregate amounts they came from (to the cent). Indivisible pennies are placed
by the largest-remainder method so nothing is silently dropped or double-counted.

Cap-eligibility and fee-eligibility are decided by the *caller* (lease scope
first, then pool type, then the controllable convention) and passed in as plain
name sets — this module is pure arithmetic.
"""

from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, Field

_CENTS = Decimal("0.01")


class PoolRecovery(BaseModel):
    """One expense pool's share of a tenant's recovery, after every layer."""

    pool_name: str = Field(description="Expense pool name (allocation key)")
    recoverable_amount: Decimal = Field(
        description=(
            "Pool's recoverable contribution used to weight the split. This is the "
            "clamped (>= 0) weighting basis, NOT necessarily the raw input amount: a "
            "negative input contribution is surfaced here as 0 because negative "
            "weights cannot drive a proportional share."
        )
    )
    is_cap_eligible: bool = Field(
        description="Whether the expense cap applies to this pool (controllable)"
    )
    is_admin_fee_eligible: bool = Field(
        description="Whether this pool is part of the admin-fee base"
    )
    share_before_cap: Decimal = Field(description="Pool share before the cap")
    cap_adjustment: Decimal = Field(
        description="Cap reduction attributed to this pool (<= 0)"
    )
    share_after_cap: Decimal = Field(description="Pool share after the cap")
    admin_fee: Decimal = Field(description="Admin fee attributed to this pool")
    total_recovery: Decimal = Field(
        description="Pool total recovery (share_after_cap + admin_fee)"
    )


def _to_cents(amount: Decimal) -> int:
    """Convert a money Decimal to an integer number of cents (half-up)."""
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def _from_cents(cents: int) -> Decimal:
    """Convert an integer number of cents back to a 2dp money Decimal."""
    return (Decimal(cents) / 100).quantize(_CENTS, rounding=ROUND_HALF_UP)


def _largest_remainder(total_cents: int, weights: list[Decimal]) -> list[int]:
    """Split ``total_cents`` across ``weights`` so the parts sum EXACTLY to it.

    Each part is the floor of its proportional share; the leftover cents are
    handed to the largest fractional remainders (ties broken by lowest index)
    so the result is deterministic and conserves every penny. Non-negative
    ``total_cents`` only. Zero/empty weights split the total evenly.
    """
    n = len(weights)
    if n == 0:
        return []
    if total_cents == 0:
        return [0] * n

    total_weight = sum(weights, Decimal("0"))
    if total_weight <= 0:
        # No meaningful weights: treat all pools equally.
        weights = [Decimal("1")] * n
        total_weight = Decimal(n)

    exact = [Decimal(total_cents) * w / total_weight for w in weights]
    floors = [int(e) for e in exact]  # e >= 0, so int() == floor()
    remainder = total_cents - sum(floors)

    # Hand out the leftover cents to the largest fractional parts.
    order = sorted(range(n), key=lambda i: (-(exact[i] - floors[i]), i))
    for k in range(remainder):
        floors[order[k]] += 1
    return floors


def allocate_pool_recoveries(
    *,
    recoverable_by_pool: dict[str, Decimal],
    cap_exempt_pools: set[str],
    admin_fee_excluded_pools: set[str],
    tenant_share_before_cap: Decimal,
    tenant_share_after_cap: Decimal,
    admin_fee: Decimal,
) -> list[PoolRecovery]:
    """Allocate aggregate tenant-share results back onto expense pools.

    Args:
        recoverable_by_pool: Included pools only (name -> recoverable amount).
            The caller removes excluded pools and applies any expense-stop /
            synthetic adjustments before building this map. Pool order is
            preserved in the output.
        cap_exempt_pools: Lowercased names of pools the cap does NOT apply to
            (taxes, insurance, utilities, ... — lease scope decides).
        admin_fee_excluded_pools: Lowercased names of pools excluded from the
            admin-fee base.
        tenant_share_before_cap: Aggregate tenant share before the cap.
        tenant_share_after_cap: Aggregate tenant share after the cap.
        admin_fee: Aggregate admin fee.

    Returns:
        One ``PoolRecovery`` per included pool whose per-pool amounts sum
        exactly to the aggregate inputs. Returns ``[]`` when there is no
        meaningful per-pool data (no pools, or every pool contributes zero),
        signalling the caller to fall back to aggregate-only reporting.
    """
    names = list(recoverable_by_pool.keys())
    # Clamp negative contributions to zero for weighting purposes.
    amounts = [max(Decimal("0"), recoverable_by_pool[name]) for name in names]
    if not names or sum(amounts, Decimal("0")) <= 0:
        return []

    cap_exempt = {p.lower() for p in cap_exempt_pools}
    admin_excluded = {p.lower() for p in admin_fee_excluded_pools}
    is_cap_eligible = [name.lower() not in cap_exempt for name in names]
    is_fee_eligible = [name.lower() not in admin_excluded for name in names]

    before_cents = _to_cents(tenant_share_before_cap)
    after_cents = _to_cents(tenant_share_after_cap)

    # Layer 1: split the pre-cap share proportionally to recoverable amounts.
    share_before = _largest_remainder(before_cents, amounts)

    # Layer 2: attribute the cap reduction to controllable pools first.
    reduction = max(0, before_cents - after_cents)
    cap_adj = [0] * len(names)
    if reduction > 0:
        eligible_idx = [i for i in range(len(names)) if is_cap_eligible[i]]
        eligible_capacity = sum(share_before[i] for i in eligible_idx)
        if reduction <= eligible_capacity:
            alloc = _largest_remainder(
                reduction, [Decimal(share_before[i]) for i in eligible_idx]
            )
            for pos, i in enumerate(eligible_idx):
                cap_adj[i] = -alloc[pos]
        else:
            # Controllable pools cannot absorb the whole cut: zero them out,
            # then spill the remainder onto cap-exempt pools so the per-pool
            # total still reconciles to the (already-capped) aggregate.
            for i in eligible_idx:
                cap_adj[i] = -share_before[i]
            spill = reduction - eligible_capacity
            exempt_idx = [i for i in range(len(names)) if not is_cap_eligible[i]]
            alloc = _largest_remainder(
                spill, [Decimal(share_before[i]) for i in exempt_idx]
            )
            for pos, i in enumerate(exempt_idx):
                cap_adj[i] = -alloc[pos]

    share_after = [share_before[i] + cap_adj[i] for i in range(len(names))]

    # Layer 3: attribute the admin fee to fee-eligible pools only.
    #
    # Attribution is WEIGHT-BASED: the exact aggregate ``admin_fee`` is distributed
    # across fee-eligible pools in proportion to each pool's post-cap share. This is
    # deliberately distinct from however the caller *sized* the aggregate fee (e.g. a
    # dollar-weighted inclusion ratio over original pool amounts): the fee follows the
    # actual recovered dollars per pool. The split always sums EXACTLY to the
    # aggregate ``admin_fee`` (sum invariant preserved), but the per-pool attribution
    # may diverge from the base ratio when excluded pools differ in weight from the
    # post-cap share distribution. That is intended and sum-faithful.
    admin_cents = _to_cents(admin_fee)
    admin_alloc = [0] * len(names)
    if admin_cents != 0:
        fee_idx = [i for i in range(len(names)) if is_fee_eligible[i]]
        if not fee_idx:
            # Degenerate: no eligible base but a fee exists. Preserve the sum
            # invariant by spreading across all pools rather than dropping it.
            fee_idx = list(range(len(names)))
        alloc = _largest_remainder(
            admin_cents, [Decimal(share_after[i]) for i in fee_idx]
        )
        for pos, i in enumerate(fee_idx):
            admin_alloc[i] = alloc[pos]

    pools: list[PoolRecovery] = []
    for i, name in enumerate(names):
        after = _from_cents(share_after[i])
        fee = _from_cents(admin_alloc[i])
        pools.append(
            PoolRecovery(
                pool_name=name,
                recoverable_amount=amounts[i],
                is_cap_eligible=is_cap_eligible[i],
                is_admin_fee_eligible=is_fee_eligible[i],
                share_before_cap=_from_cents(share_before[i]),
                cap_adjustment=_from_cents(cap_adj[i]),
                share_after_cap=after,
                admin_fee=fee,
                total_recovery=(after + fee).quantize(_CENTS, rounding=ROUND_HALF_UP),
            )
        )
    return pools
