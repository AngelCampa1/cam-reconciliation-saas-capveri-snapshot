"""Tests for deterministic per-pool allocation of aggregate tenant-share results.

The allocation is LAYER-FAITHFUL (Option B): aggregate scalar results from
``calculate_tenant_share`` are redistributed back onto expense pools so that

* per-pool ``share_before_cap`` sums exactly to the aggregate before-cap share,
* the cap reduction is attributed ONLY to cap-eligible (controllable) pools
  (cap-exempt pools such as taxes/insurance keep their full pre-cap share),
* the admin fee is attributed ONLY to fee-eligible pools,
* per-pool ``total_recovery`` sums exactly to the aggregate total recovery.

Every test asserts the sum-reconciliation invariant to the cent, because the
non-negotiable contract for Module A "Produce" is that the per-pool breakdown
never changes the aggregate amount a tenant is charged.
"""

from decimal import Decimal

from app.services.calculation.pool_allocation import (
    PoolRecovery,
    allocate_pool_recoveries,
)


def _total(pools: list[PoolRecovery], field: str) -> Decimal:
    return sum((getattr(p, field) for p in pools), Decimal("0"))


def test_no_pools_returns_empty() -> None:
    """No per-pool recoverable data -> no allocation (aggregate-only fallback)."""
    pools = allocate_pool_recoveries(
        recoverable_by_pool={},
        cap_exempt_pools=set(),
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("1000.00"),
        tenant_share_after_cap=Decimal("900.00"),
        admin_fee=Decimal("45.00"),
    )
    assert pools == []


def test_all_zero_amounts_returns_empty() -> None:
    """Pools exist but contribute zero recoverable -> no meaningful weights."""
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"cam": Decimal("0"), "taxes": Decimal("0")},
        cap_exempt_pools={"taxes"},
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("0.00"),
        tenant_share_after_cap=Decimal("0.00"),
        admin_fee=Decimal("0.00"),
    )
    assert pools == []


def test_no_cap_no_admin_simple_proportional() -> None:
    """Before==after, no admin fee: shares split proportionally and reconcile."""
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"cam": Decimal("750"), "taxes": Decimal("250")},
        cap_exempt_pools={"taxes"},
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("100.00"),
        tenant_share_after_cap=Decimal("100.00"),
        admin_fee=Decimal("0.00"),
    )
    by_name = {p.pool_name: p for p in pools}
    assert by_name["cam"].share_before_cap == Decimal("75.00")
    assert by_name["taxes"].share_before_cap == Decimal("25.00")
    # No cap reduction anywhere.
    assert all(p.cap_adjustment == Decimal("0.00") for p in pools)
    assert by_name["cam"].share_after_cap == Decimal("75.00")
    assert _total(pools, "share_before_cap") == Decimal("100.00")
    assert _total(pools, "share_after_cap") == Decimal("100.00")
    assert _total(pools, "total_recovery") == Decimal("100.00")


def test_cap_reduction_hits_only_controllable_pools() -> None:
    """The cap reduction must never touch the tax/insurance (cap-exempt) pools."""
    # cam=600, taxes=300, insurance=100 -> before_cap 1000, after_cap 900 (100 cut).
    pools = allocate_pool_recoveries(
        recoverable_by_pool={
            "cam": Decimal("600"),
            "taxes": Decimal("300"),
            "insurance": Decimal("100"),
        },
        cap_exempt_pools={"taxes", "insurance"},
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("1000.00"),
        tenant_share_after_cap=Decimal("900.00"),
        admin_fee=Decimal("0.00"),
    )
    by_name = {p.pool_name: p for p in pools}
    # Controllable pool absorbs the ENTIRE 100 reduction.
    assert by_name["cam"].cap_adjustment == Decimal("-100.00")
    assert by_name["cam"].share_after_cap == Decimal("500.00")
    # Cap-exempt pools are untouched by the cap.
    assert by_name["taxes"].cap_adjustment == Decimal("0.00")
    assert by_name["taxes"].share_after_cap == by_name["taxes"].share_before_cap
    assert by_name["insurance"].cap_adjustment == Decimal("0.00")
    assert by_name["insurance"].share_after_cap == by_name["insurance"].share_before_cap
    # Eligibility flags surfaced.
    assert by_name["cam"].is_cap_eligible is True
    assert by_name["taxes"].is_cap_eligible is False
    # Reconciliation.
    assert _total(pools, "share_after_cap") == Decimal("900.00")


def test_cap_reduction_split_across_multiple_controllable_pools() -> None:
    """Reduction distributes proportionally across controllable pools only."""
    # cam=300, repairs=100 controllable; taxes=100 exempt. before 500 after 400 (-100).
    pools = allocate_pool_recoveries(
        recoverable_by_pool={
            "cam": Decimal("300"),
            "repairs": Decimal("100"),
            "taxes": Decimal("100"),
        },
        cap_exempt_pools={"taxes"},
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("500.00"),
        tenant_share_after_cap=Decimal("400.00"),
        admin_fee=Decimal("0.00"),
    )
    by_name = {p.pool_name: p for p in pools}
    # cam carries 3/4 of the 100 cut, repairs 1/4.
    assert by_name["cam"].cap_adjustment == Decimal("-75.00")
    assert by_name["repairs"].cap_adjustment == Decimal("-25.00")
    assert by_name["taxes"].cap_adjustment == Decimal("0.00")
    assert _total(pools, "share_after_cap") == Decimal("400.00")


def test_cap_spills_to_exempt_when_controllable_capacity_exhausted() -> None:
    """If the cut exceeds controllable capacity, exempt pools absorb the rest.

    This preserves the sum invariant (per-pool == aggregate) even though the
    aggregate engine capped more than the controllable total. Controllable
    pools are driven to zero first.
    """
    # cam=100 controllable, taxes=900 exempt. before 1000 after 850 (-150 cut).
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"cam": Decimal("100"), "taxes": Decimal("900")},
        cap_exempt_pools={"taxes"},
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("1000.00"),
        tenant_share_after_cap=Decimal("850.00"),
        admin_fee=Decimal("0.00"),
    )
    by_name = {p.pool_name: p for p in pools}
    # Controllable cam (share_before 100) is fully zeroed first.
    assert by_name["cam"].share_after_cap == Decimal("0.00")
    assert by_name["cam"].cap_adjustment == Decimal("-100.00")
    # Remaining 50 spills onto the exempt taxes pool.
    assert by_name["taxes"].cap_adjustment == Decimal("-50.00")
    assert by_name["taxes"].share_after_cap == Decimal("850.00")
    assert _total(pools, "share_after_cap") == Decimal("850.00")
    # No pool ever goes negative.
    assert all(p.share_after_cap >= Decimal("0") for p in pools)


def test_admin_fee_only_on_fee_eligible_pools() -> None:
    """Admin fee attaches to fee-eligible pools, never to excluded ones."""
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"cam": Decimal("600"), "taxes": Decimal("400")},
        cap_exempt_pools={"taxes"},
        admin_fee_excluded_pools={"taxes"},
        tenant_share_before_cap=Decimal("1000.00"),
        tenant_share_after_cap=Decimal("1000.00"),
        admin_fee=Decimal("60.00"),
    )
    by_name = {p.pool_name: p for p in pools}
    # All admin fee lands on cam; taxes excluded from the fee base.
    assert by_name["cam"].admin_fee == Decimal("60.00")
    assert by_name["taxes"].admin_fee == Decimal("0.00")
    assert by_name["cam"].is_admin_fee_eligible is True
    assert by_name["taxes"].is_admin_fee_eligible is False
    assert by_name["cam"].total_recovery == Decimal("660.00")
    assert by_name["taxes"].total_recovery == Decimal("400.00")
    assert _total(pools, "admin_fee") == Decimal("60.00")
    assert _total(pools, "total_recovery") == Decimal("1060.00")


def test_largest_remainder_keeps_pennies_exact() -> None:
    """Indivisible cents are assigned by largest remainder; sums stay exact."""
    # Three equal pools sharing 100.00 -> 33.34 / 33.33 / 33.33.
    pools = allocate_pool_recoveries(
        recoverable_by_pool={
            "a": Decimal("1"),
            "b": Decimal("1"),
            "c": Decimal("1"),
        },
        cap_exempt_pools=set(),
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("100.00"),
        tenant_share_after_cap=Decimal("100.00"),
        admin_fee=Decimal("0.00"),
    )
    shares = sorted((p.share_before_cap for p in pools), reverse=True)
    assert shares == [Decimal("33.34"), Decimal("33.33"), Decimal("33.33")]
    assert _total(pools, "share_before_cap") == Decimal("100.00")


def test_single_pool_carries_everything() -> None:
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"cam": Decimal("500")},
        cap_exempt_pools=set(),
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("500.00"),
        tenant_share_after_cap=Decimal("450.00"),
        admin_fee=Decimal("22.50"),
    )
    assert len(pools) == 1
    p = pools[0]
    assert p.share_before_cap == Decimal("500.00")
    assert p.cap_adjustment == Decimal("-50.00")
    assert p.share_after_cap == Decimal("450.00")
    assert p.admin_fee == Decimal("22.50")
    assert p.total_recovery == Decimal("472.50")


def test_full_stack_reconciles_with_cap_and_admin() -> None:
    """End-to-end: cap (controllable-only) + admin fee (fee-eligible) reconcile."""
    pools = allocate_pool_recoveries(
        recoverable_by_pool={
            "cam": Decimal("500"),
            "utilities": Decimal("200"),
            "taxes": Decimal("200"),
            "insurance": Decimal("100"),
        },
        cap_exempt_pools={"utilities", "taxes", "insurance"},
        admin_fee_excluded_pools={"taxes", "insurance"},
        tenant_share_before_cap=Decimal("1000.00"),
        tenant_share_after_cap=Decimal("950.00"),
        admin_fee=Decimal("38.00"),
    )
    # cam is the only controllable pool -> absorbs the full 50 cap reduction.
    by_name = {p.pool_name: p for p in pools}
    assert by_name["cam"].cap_adjustment == Decimal("-50.00")
    assert by_name["utilities"].cap_adjustment == Decimal("0.00")
    # Admin fee base = cam + utilities (taxes/insurance excluded).
    assert by_name["taxes"].admin_fee == Decimal("0.00")
    assert by_name["insurance"].admin_fee == Decimal("0.00")
    assert by_name["cam"].admin_fee + by_name["utilities"].admin_fee == Decimal("38.00")
    # Reconciliation to the cent.
    assert _total(pools, "share_before_cap") == Decimal("1000.00")
    assert _total(pools, "share_after_cap") == Decimal("950.00")
    assert _total(pools, "admin_fee") == Decimal("38.00")
    assert _total(pools, "total_recovery") == Decimal("988.00")


def test_output_preserves_input_pool_order() -> None:
    pools = allocate_pool_recoveries(
        recoverable_by_pool={
            "zeta": Decimal("100"),
            "alpha": Decimal("100"),
            "mid": Decimal("100"),
        },
        cap_exempt_pools=set(),
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("300.00"),
        tenant_share_after_cap=Decimal("300.00"),
        admin_fee=Decimal("0.00"),
    )
    assert [p.pool_name for p in pools] == ["zeta", "alpha", "mid"]
