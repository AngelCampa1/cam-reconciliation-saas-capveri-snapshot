"""Independent oracle for per-tenant leakage breakdown values + difference_pct.

``calculate_leakage`` (leakage.py:62-255) groups reconciliation recoveries by tenant
NAME (snapshot lease_id -> leases.tenant_name), groups actual-billed by tenant name,
then per tenant emits a breakdown row (only when the difference is non-zero):

    calc       = Σ snapshot total_recovery for that tenant       # grouped by name
    billed     = Σ actual_billed for that tenant                 # grouped by name
    diff       = calc - billed                                   # exact Decimal
    diff_pct   = float(diff / calc * 100) if calc > 0 else 0.0   # Decimal math -> float, no quantize
    # rows with diff == 0 are dropped; the list is sorted by abs(diff) DESC.

``test_leakage_stress.py`` pins the exact sums / leakage identity and a VERBATIM copy
of the ``leakage_pct`` float formula, but (1) it never asserts per-row
``difference_pct`` at all, and (2) it gives each tenant at most ONE snapshot, so the
per-name **accumulation** path (several snapshots collapsing onto one tenant name) is
never exercised against an independent per-tenant grouping.

This drives the real ``calculate_leakage`` (only the Supabase boundary mocked) with a
scenario that deliberately collides multiple leases/snapshots onto a SMALL pool of
tenant names, and re-derives — from the raw input records, NOT from any production
intermediate — each tenant's grouped ``calculated_amount`` / ``billed_amount``, the
``difference``, the inclusion filter, the sort, and ``difference_pct`` with ``==``.

Run standalone:
    pytest tests/stress/test_leakage_breakdown_pct_oracle_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from unittest import mock
from uuid import uuid4

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation import leakage as leakage_mod
from app.services.calculation.leakage import calculate_leakage

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_ORG_ID = uuid4()
_PROP_ID = uuid4()
_START = date(2024, 1, 1)
_END = date(2024, 12, 31)

# A SMALL name pool forces accumulation: several leases/snapshots collapse onto the
# same tenant name, exercising the grouped-sum path the existing stress never hits.
_NAMES = ["Acme", "Beta", "Gamma"]
_money = st.decimals(
    min_value=Decimal("0"),
    max_value=Decimal("1000000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


class _FakeQuery:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = list(rows)
        self._range: tuple[int, int] | None = None

    def select(self, *_a: Any, **_k: Any) -> _FakeQuery:
        return self

    def eq(self, *_a: Any, **_k: Any) -> _FakeQuery:
        return self

    def lte(self, *_a: Any, **_k: Any) -> _FakeQuery:
        return self

    def gte(self, *_a: Any, **_k: Any) -> _FakeQuery:
        return self

    def in_(self, field: str, values: list[Any]) -> _FakeQuery:
        self._rows = [r for r in self._rows if r.get(field) in set(values)]
        return self

    def limit(self, _n: int) -> _FakeQuery:
        return self

    def range(self, start: int, end: int) -> _FakeQuery:
        self._range = (start, end)
        return self

    def execute(self) -> SimpleNamespace:
        rows = self._rows
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        return SimpleNamespace(data=rows)


class _FakeDB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]):
        self._tables = tables

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._tables.get(name, []))


@st.composite
def _scenario(draw: Any) -> dict[str, Any]:
    """Snapshots (each tied to a lease -> tenant name) and billed rows, drawn from a
    small name pool so names collide and amounts accumulate."""
    snapshots: list[dict[str, Any]] = []
    leases: list[dict[str, Any]] = []
    billed: list[dict[str, Any]] = []

    n_snap = draw(st.integers(min_value=0, max_value=6))
    for _ in range(n_snap):
        name = draw(st.sampled_from(_NAMES))
        lease_id = str(uuid4())
        leases.append({"id": lease_id, "tenant_name": name})
        snapshots.append(
            {
                "lease_id": lease_id,
                "total_recovery": str(draw(_money)),
                "period_start_date": _START.isoformat(),
                "period_end_date": _END.isoformat(),
                "status": "finalized",
            }
        )

    n_bill = draw(st.integers(min_value=0, max_value=6))
    for _ in range(n_bill):
        billed.append(
            {
                "tenant_name": draw(st.sampled_from(_NAMES)),
                "billed_amount": str(draw(_money)),
                "period_start_date": _START.isoformat(),
                "period_end_date": _END.isoformat(),
            }
        )

    return {"snapshots": snapshots, "leases": leases, "billed": billed}


@STRESS
@given(scenario=_scenario())
def test_leakage_breakdown_values_round_trip_exactly(scenario):
    tables = {
        "properties": [{"id": str(_PROP_ID)}],
        "reconciliation_snapshots": scenario["snapshots"],
        "import_batches": [],
        "leases": scenario["leases"],
        "actual_billed_amounts": scenario["billed"],
    }
    fake = _FakeDB(tables)
    with mock.patch.object(leakage_mod, "get_supabase_admin", return_value=fake):
        result = calculate_leakage(_ORG_ID, _PROP_ID, _START, _END)

    # Independent grouping from raw records (NOT from any production intermediate).
    lease_name = {ls["id"]: ls["tenant_name"] for ls in scenario["leases"]}
    calc_by: dict[str, Decimal] = {}
    for s in scenario["snapshots"]:
        name = lease_name.get(s["lease_id"], "Unknown")
        calc_by[name] = calc_by.get(name, Decimal("0")) + Decimal(s["total_recovery"])
    billed_by: dict[str, Decimal] = {}
    for b in scenario["billed"]:
        name = b["tenant_name"]
        billed_by[name] = billed_by.get(name, Decimal("0")) + Decimal(
            b["billed_amount"]
        )

    expected: dict[str, tuple[Decimal, Decimal, Decimal, float]] = {}
    for name in set(calc_by) | set(billed_by):
        calc = calc_by.get(name, Decimal("0"))
        billed = billed_by.get(name, Decimal("0"))
        diff = calc - billed
        if diff == 0:
            continue
        diff_pct = float(diff / calc * 100) if calc > Decimal("0") else 0.0
        expected[name] = (calc, billed, diff, diff_pct)

    # Same set of breakdown rows (zero-diff tenants dropped).
    assert {row.tenant_name for row in result.breakdown} == set(expected.keys())

    for row in result.breakdown:
        exp_calc, exp_billed, exp_diff, exp_pct = expected[row.tenant_name]
        assert row.calculated_amount == exp_calc
        assert row.billed_amount == exp_billed
        assert row.difference == exp_diff
        assert row.difference_pct == exp_pct  # exact float of the Decimal expression

    # Sorted by descending absolute difference.
    diffs = [abs(row.difference) for row in result.breakdown]
    assert diffs == sorted(diffs, reverse=True)


def test_anchor_difference_pct_one_third():
    """calc 300, billed 200 -> diff 100 -> 100/300*100 = 33.33...% as a raw float."""
    lease_id = str(uuid4())
    tables = {
        "properties": [{"id": str(_PROP_ID)}],
        "reconciliation_snapshots": [
            {
                "lease_id": lease_id,
                "total_recovery": "300.00",
                "period_start_date": _START.isoformat(),
                "period_end_date": _END.isoformat(),
                "status": "finalized",
            }
        ],
        "import_batches": [],
        "leases": [{"id": lease_id, "tenant_name": "Acme"}],
        "actual_billed_amounts": [
            {
                "tenant_name": "Acme",
                "billed_amount": "200.00",
                "period_start_date": _START.isoformat(),
                "period_end_date": _END.isoformat(),
            }
        ],
    }
    with mock.patch.object(
        leakage_mod, "get_supabase_admin", return_value=_FakeDB(tables)
    ):
        result = calculate_leakage(_ORG_ID, _PROP_ID, _START, _END)
    assert len(result.breakdown) == 1
    row = result.breakdown[0]
    assert row.difference == Decimal("100.00")
    assert row.difference_pct == float(Decimal("100.00") / Decimal("300.00") * 100)


def test_anchor_billed_only_tenant_has_zero_pct_guard():
    """A tenant billed but never calculated has calc==0 -> diff_pct guarded to 0.0."""
    tables = {
        "properties": [{"id": str(_PROP_ID)}],
        "reconciliation_snapshots": [],
        "import_batches": [],
        "leases": [],
        "actual_billed_amounts": [
            {
                "tenant_name": "Beta",
                "billed_amount": "500.00",
                "period_start_date": _START.isoformat(),
                "period_end_date": _END.isoformat(),
            }
        ],
    }
    with mock.patch.object(
        leakage_mod, "get_supabase_admin", return_value=_FakeDB(tables)
    ):
        result = calculate_leakage(_ORG_ID, _PROP_ID, _START, _END)
    assert len(result.breakdown) == 1
    row = result.breakdown[0]
    assert row.calculated_amount == Decimal("0")
    assert row.difference == Decimal("-500.00")
    assert row.difference_pct == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
