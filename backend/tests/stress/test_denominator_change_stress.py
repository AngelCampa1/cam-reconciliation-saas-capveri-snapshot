"""Property-based stress test for the denominator-change audit report
(`DenominatorChangeService.generate_report`).

This report is audit-facing: it tells a landlord (and ultimately a tenant)
exactly how the CAM denominator shifted between two reconciliation periods and
what that did to each tenant's pro-rata share and estimated recovery. A wrong
delta here is a defensibility problem in a real audit, so the invariants are
tight.

The whole service is driven in-memory through a faithful fake Supabase client
(`_FakeDB`) that applies the same eq/gte/lte/lt filters the real PostgREST
query chain would, so the period-selection logic is exercised for real — only
the network/DB boundary is faked.

Invariants asserted for ANY generated pair of periods:
  * the call never raises (adversarial-but-valid decimals through the
    money/percent string formatting + division paths);
  * rsf_delta == current_rsf - prior_rsf (exact);
  * rsf_delta_percent is quantized to 2dp;
  * every tenant impact is for a CONTINUING tenant (present in both periods);
  * recovery_delta == current_recovery - prior_recovery (exact, no rounding);
  * share_delta_pct_points is quantized to 2dp;
  * an impact is emitted only when share OR recovery actually changed, and it
    is flagged with SHARE_RECALCULATION whenever the share moved;
  * impacts never outnumber the continuing tenants.

Run standalone:
    pytest tests/stress/test_denominator_change_stress.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.denominator_change import DenominatorChangeType
from app.services.analysis.denominator_change import DenominatorChangeService

STRESS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_CENT = Decimal("0.01")
_PROP_ID = uuid4()

_PRIOR_START = date(2023, 1, 1)
_PRIOR_END = date(2023, 12, 31)
_CURRENT_START = date(2024, 1, 1)
_CURRENT_END = date(2024, 12, 31)

_BOMA = [None, "BOMA 1996", "BOMA 2010", "BOMA 2017", "BOMA 2024"]
_POOLS = ["CAM", "Taxes", "Insurance", "Capital", "Utilities"]


class _FakeQuery:
    """Chainable stand-in for a PostgREST query builder that records filters
    and applies them to an in-memory row list, so period selection is real."""

    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = list(rows)
        self._filters: list[tuple[str, str, str]] = []
        self._single = False
        self._range: tuple[int, int] | None = None

    def select(self, *_a: Any, **_k: Any) -> _FakeQuery:
        return self

    def eq(self, field: str, value: Any) -> _FakeQuery:
        self._filters.append(("eq", field, str(value)))
        return self

    def gte(self, field: str, value: Any) -> _FakeQuery:
        self._filters.append(("gte", field, str(value)))
        return self

    def lte(self, field: str, value: Any) -> _FakeQuery:
        self._filters.append(("lte", field, str(value)))
        return self

    def lt(self, field: str, value: Any) -> _FakeQuery:
        self._filters.append(("lt", field, str(value)))
        return self

    def single(self) -> _FakeQuery:
        self._single = True
        return self

    def range(self, start: int, end: int) -> _FakeQuery:
        self._range = (start, end)
        return self

    def _apply(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for row in self._rows:
            keep = True
            for op, field, val in self._filters:
                rv = str(row.get(field))
                if op == "eq" and rv != val:
                    keep = False
                elif op == "gte" and not rv >= val:
                    keep = False
                elif op == "lte" and not rv <= val:
                    keep = False
                elif op == "lt" and not rv < val:
                    keep = False
                if not keep:
                    break
            if keep:
                out.append(row)
        return out

    def execute(self) -> SimpleNamespace:
        rows = self._apply()
        if self._single:
            return SimpleNamespace(data=rows[0] if rows else None)
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        return SimpleNamespace(data=rows)


class _FakeDB:
    def __init__(self, snapshots: list[dict[str, Any]], prop: dict[str, Any]):
        self._snapshots = snapshots
        self._prop = prop

    def table(self, name: str) -> _FakeQuery:
        if name == "reconciliation_snapshots":
            return _FakeQuery(self._snapshots)
        if name == "properties":
            return _FakeQuery([self._prop])
        return _FakeQuery([])


def money(min_v: str, max_v: str) -> st.SearchStrategy[Decimal]:
    return st.decimals(
        min_value=Decimal(min_v),
        max_value=Decimal(max_v),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


def share() -> st.SearchStrategy[Decimal]:
    return st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("1"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    )


@st.composite
def _tenant_terms(draw: Any) -> dict[str, Any]:
    return {
        "tenant_name": draw(st.text(min_size=1, max_size=10)),
        "pro_rata_share": str(draw(share())),
        "rentable_square_feet": str(draw(money("0", "1000000"))),
        "excluded_pools": draw(
            st.lists(st.sampled_from(_POOLS), max_size=3, unique=True)
        ),
        "rsf_measurement_standard": draw(st.sampled_from(_BOMA)),
    }


def _snapshot(
    lease_id: UUID, terms: dict[str, Any], recovery: Decimal, *, current: bool
) -> dict[str, Any]:
    start, end = (
        (_CURRENT_START, _CURRENT_END) if current else (_PRIOR_START, _PRIOR_END)
    )
    return {
        "lease_id": str(lease_id),
        "property_id": str(_PROP_ID),
        "status": "finalized",
        "period_start_date": start.isoformat(),
        "period_end_date": end.isoformat(),
        "lease_terms_snapshot": terms,
        "total_recovery": str(recovery),
    }


@st.composite
def _scenario(draw: Any) -> dict[str, Any]:
    """A prior+current pair of finalized snapshot sets with overlapping,
    added, and removed tenants, plus a property RSF."""
    n_common = draw(st.integers(min_value=0, max_value=4))
    n_added = draw(st.integers(min_value=0, max_value=2))
    n_removed = draw(st.integers(min_value=0, max_value=2))

    snapshots: list[dict[str, Any]] = []
    common_ids: list[UUID] = []

    for _ in range(n_common):
        lid = uuid4()
        common_ids.append(lid)
        snapshots.append(
            _snapshot(
                lid, draw(_tenant_terms()), draw(money("0", "5000000")), current=False
            )
        )
        snapshots.append(
            _snapshot(
                lid, draw(_tenant_terms()), draw(money("0", "5000000")), current=True
            )
        )

    for _ in range(n_removed):  # prior only
        lid = uuid4()
        snapshots.append(
            _snapshot(
                lid, draw(_tenant_terms()), draw(money("0", "5000000")), current=False
            )
        )

    for _ in range(n_added):  # current only
        lid = uuid4()
        snapshots.append(
            _snapshot(
                lid, draw(_tenant_terms()), draw(money("0", "5000000")), current=True
            )
        )

    return {
        "snapshots": snapshots,
        "common_ids": {str(i) for i in common_ids},
        "prior_rsf": draw(money("1", "2000000")),
        "current_rsf": draw(money("1", "2000000")),
    }


def _run(scenario: dict[str, Any]):
    svc = DenominatorChangeService()
    db = _FakeDB(
        scenario["snapshots"],
        {"id": str(_PROP_ID), "name": "P", "total_rentable_sqft": "0"},
    )

    async def _go():
        return await svc.generate_report(
            property_id=_PROP_ID,
            current_period_start=_CURRENT_START,
            current_period_end=_CURRENT_END,
            prior_period_start=_PRIOR_START,
            prior_period_end=_PRIOR_END,
            prior_total_rsf=scenario["prior_rsf"],
            current_total_rsf=scenario["current_rsf"],
            db=db,
            organization_id=None,
        )

    return asyncio.run(_go())


@STRESS
@given(scenario=_scenario())
def test_denominator_report_invariants(scenario: dict[str, Any]) -> None:
    # Need at least one current snapshot and one prior snapshot, else the
    # service raises NoComparableSnapshotsError (an expected, tested state).
    has_current = any(
        s["period_start_date"] == _CURRENT_START.isoformat()
        for s in scenario["snapshots"]
    )
    has_prior = any(
        s["period_start_date"] == _PRIOR_START.isoformat()
        for s in scenario["snapshots"]
    )
    if not (has_current and has_prior):
        return

    report = _run(scenario)

    # RSF delta is exact; percent is quantized to 2dp.
    assert report.rsf_delta == scenario["current_rsf"] - scenario["prior_rsf"]
    assert report.rsf_delta_percent == report.rsf_delta_percent.quantize(_CENT)
    assert report.prior_total_rsf == scenario["prior_rsf"]
    assert report.current_total_rsf == scenario["current_rsf"]

    common_ids = scenario["common_ids"]
    assert len(report.tenant_impacts) <= len(common_ids)

    for impact in report.tenant_impacts:
        lid = str(impact.lease_id)
        # Impacts only ever cover continuing tenants.
        assert lid in common_ids
        # Recovery delta is exact (no rounding allowed on a dollar figure).
        assert impact.recovery_delta == (
            impact.current_estimated_recovery - impact.prior_estimated_recovery
        )
        # Share delta is quantized to 2dp.
        assert impact.share_delta_pct_points == impact.share_delta_pct_points.quantize(
            _CENT
        )
        # An impact is only emitted when something actually moved.
        moved_share = impact.prior_pro_rata_share != impact.current_pro_rata_share
        moved_recovery = (
            impact.prior_estimated_recovery != impact.current_estimated_recovery
        )
        assert moved_share or moved_recovery
        # A moved share must be attributed to a share recalculation.
        if moved_share:
            assert (
                DenominatorChangeType.SHARE_RECALCULATION in impact.contributing_changes
            )


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
