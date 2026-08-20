"""Tests for optional per-pool variance breakdowns (B1.5a).

``build_comparison_result`` gains optional pool maps. When absent, behavior is
byte-for-byte identical (``pool_breakdowns`` is ``None`` on every tenant). When
provided, each tenant carries a list of signed ``PoolVariance`` records. All
pure-math, no mocks. This plumbing is inert until B1.5b feeds real pool data.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services.comparison.engine import build_comparison_result
from app.services.comparison.models import PoolVariance, VarianceDirection

PROP_ID = uuid4()
P_START = date(2024, 1, 1)
P_END = date(2024, 12, 31)


def _build(
    correct, charged, *, correct_pools=None, charged_pools=None, pool_names=None
):
    return build_comparison_result(
        correct_by_lease=correct,
        charged_by_lease=charged,
        property_id=PROP_ID,
        period_start=P_START,
        period_end=P_END,
        correct_by_lease_and_pool=correct_pools,
        charged_by_lease_and_pool=charged_pools,
        pool_names=pool_names,
    )


class TestPoolBreakdowns:
    def test_no_pool_maps_yields_none_breakdowns(self):
        # Default call (no pool maps): pool_breakdowns is None everywhere — the
        # non-breaking guarantee. The per-tenant totals are unchanged.
        result = _build({"l1": Decimal("1000")}, {"l1": Decimal("1200")})
        assert result.tenants[0].pool_breakdowns is None
        assert result.tenants[0].variance == Decimal("200")

    def test_pool_breakdowns_signed_classified_and_sorted(self):
        # One lease, two pools: p1 600->700 (+100 overcharge), p2 400->400 (match).
        result = _build(
            {"l1": Decimal("1000")},
            {"l1": Decimal("1100")},
            correct_pools={"l1": {"p1": Decimal("600"), "p2": Decimal("400")}},
            charged_pools={"l1": {"p1": Decimal("700"), "p2": Decimal("400")}},
            pool_names={"p1": "CAM", "p2": "Insurance"},
        )
        tv = result.tenants[0]
        assert tv.pool_breakdowns is not None
        # Sorted by descending abs_variance: p1 (100) before p2 (0).
        assert [p.pool_id for p in tv.pool_breakdowns] == ["p1", "p2"]
        p1, p2 = tv.pool_breakdowns
        assert isinstance(p1, PoolVariance)
        assert p1.pool_name == "CAM"
        assert p1.capveri_correct == Decimal("600")
        assert p1.actual_charged == Decimal("700")
        assert p1.variance == Decimal("100")
        assert p1.direction is VarianceDirection.OVERCHARGE
        assert p1.abs_variance == Decimal("100")
        assert p2.direction is VarianceDirection.MATCH
        # The tenant-level totals are unaffected by the breakdown.
        assert tv.variance == Decimal("100")

    def test_charged_only_pool_is_overcharge_with_none_pct(self):
        # A pool that appears only on the charged side (no correct) is a full
        # overcharge with an undefined percentage.
        result = _build(
            {"l1": Decimal("0")},
            {"l1": Decimal("500")},
            correct_pools={"l1": {}},
            charged_pools={"l1": {"p1": Decimal("500")}},
        )
        breakdown = result.tenants[0].pool_breakdowns
        assert breakdown is not None
        p1 = breakdown[0]
        assert p1.capveri_correct == Decimal("0")
        assert p1.actual_charged == Decimal("500")
        assert p1.direction is VarianceDirection.OVERCHARGE
        assert p1.variance_pct is None

    def test_correct_only_pool_is_undercharge(self):
        # A pool present only on the correct side (nothing charged) is a full
        # undercharge.
        result = _build(
            {"l1": Decimal("800")},
            {"l1": Decimal("0")},
            correct_pools={"l1": {"p1": Decimal("800")}},
            charged_pools={"l1": {}},
        )
        p1 = result.tenants[0].pool_breakdowns[0]
        assert p1.actual_charged == Decimal("0")
        assert p1.variance == Decimal("-800")
        assert p1.direction is VarianceDirection.UNDERCHARGE
        assert p1.variance_pct == Decimal("-100")

    def test_pool_mode_active_lease_without_pool_entries_gets_empty_list(self):
        # When pool maps are supplied (pool mode), a lease with no pool entries in
        # either map gets an explicit empty list, not None — it signals "pool mode
        # on, no breakdown for this lease" distinctly from "pool mode off".
        result = _build(
            {"l1": Decimal("1000"), "l2": Decimal("500")},
            {"l1": Decimal("1000"), "l2": Decimal("500")},
            correct_pools={"l1": {"p1": Decimal("1000")}},
            charged_pools={"l1": {"p1": Decimal("1000")}},
        )
        by_lease = {t.lease_id: t for t in result.tenants}
        assert by_lease["l1"].pool_breakdowns is not None
        assert len(by_lease["l1"].pool_breakdowns) == 1
        assert by_lease["l2"].pool_breakdowns == []

    def test_only_charged_pool_map_provided_still_activates_pool_mode(self):
        # Supplying only one of the two pool maps still turns pool mode on.
        result = _build(
            {"l1": Decimal("0")},
            {"l1": Decimal("300")},
            charged_pools={"l1": {"p1": Decimal("300")}},
        )
        breakdown = result.tenants[0].pool_breakdowns
        assert breakdown is not None
        assert breakdown[0].pool_id == "p1"
        assert breakdown[0].direction is VarianceDirection.OVERCHARGE

    def test_pool_variance_pct_quantized_half_up(self):
        # 5 / 800 * 100 = 0.625 -> 0.63 (HALF_UP), same rule as the tenant level.
        result = _build(
            {"l1": Decimal("800")},
            {"l1": Decimal("805")},
            correct_pools={"l1": {"p1": Decimal("800")}},
            charged_pools={"l1": {"p1": Decimal("805")}},
        )
        p1 = result.tenants[0].pool_breakdowns[0]
        assert p1.variance_pct == Decimal("0.63")
        assert p1.variance_pct.as_tuple().exponent == -2

    def test_pool_variance_pct_half_up_is_symmetric_on_negatives(self):
        # -5 / 800 * 100 = -0.625 -> -0.63 (HALF_UP rounds away from zero on the
        # negative side too), proving the pct rule is symmetric for undercharges.
        result = _build(
            {"l1": Decimal("800")},
            {"l1": Decimal("795")},
            correct_pools={"l1": {"p1": Decimal("800")}},
            charged_pools={"l1": {"p1": Decimal("795")}},
        )
        p1 = result.tenants[0].pool_breakdowns[0]
        assert p1.variance == Decimal("-5")
        assert p1.direction is VarianceDirection.UNDERCHARGE
        assert p1.variance_pct == Decimal("-0.63")

    def test_pool_mode_activates_per_lease_from_a_single_global_map(self):
        # Pool mode is global, but each lease draws its own pools from whichever map
        # carries it: l1 only in the correct map, l2 only in the charged map. Both
        # still get a populated breakdown — mode activation is not per-map-per-lease.
        result = _build(
            {"l1": Decimal("400"), "l2": Decimal("0")},
            {"l1": Decimal("0"), "l2": Decimal("300")},
            correct_pools={"l1": {"p1": Decimal("400")}},
            charged_pools={"l2": {"p2": Decimal("300")}},
        )
        by_lease = {t.lease_id: t for t in result.tenants}
        l1 = by_lease["l1"].pool_breakdowns
        l2 = by_lease["l2"].pool_breakdowns
        assert l1 is not None and len(l1) == 1
        assert l1[0].pool_id == "p1"
        assert l1[0].direction is VarianceDirection.UNDERCHARGE
        assert l2 is not None and len(l2) == 1
        assert l2[0].pool_id == "p2"
        assert l2[0].direction is VarianceDirection.OVERCHARGE

    def test_custom_tolerance_applies_at_pool_level(self):
        # A $5 pool variance is a MATCH under a $10 tolerance, same threshold the
        # tenant level uses.
        result = build_comparison_result(
            correct_by_lease={"l1": Decimal("1000")},
            charged_by_lease={"l1": Decimal("1005")},
            property_id=PROP_ID,
            period_start=P_START,
            period_end=P_END,
            tolerance=Decimal("10"),
            correct_by_lease_and_pool={"l1": {"p1": Decimal("1000")}},
            charged_by_lease_and_pool={"l1": {"p1": Decimal("1005")}},
        )
        assert result.tenants[0].pool_breakdowns[0].direction is VarianceDirection.MATCH
