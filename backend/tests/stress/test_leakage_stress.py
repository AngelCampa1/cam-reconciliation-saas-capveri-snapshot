"""Property-based stress for the recovery-leakage calculation.

``calculate_leakage`` (calculation/leakage.py) compares what CapVeri calculated a
tenant *should* have been billed (reconciliation snapshots) against what was
*actually* billed (actual_billed_amounts), and surfaces the gap as recovery
opportunity. It is the headline "money left on the table" number a landlord acts
on, so its aggregation must be exact: leakage == calculated - billed, summed per
tenant, with a per-tenant breakdown that omits zero-difference tenants and sorts
by the largest gap. A rounding slip or a sign error would mis-state real dollars.

The whole service is DB-driven, so it is exercised through a faithful in-memory
fake Supabase client (the only external boundary) that applies the same
eq/lte/gte/in/limit/range filters the real PostgREST chain would. Money values are
generated as adversarial-but-valid 2dp decimals.

Invariants:
  * **total**: never raises across the money/percent division + formatting paths;
  * **exact sums**: capveri_calculated == Σ snapshot total_recovery, actual_billed
    == Σ billed_amount, both exact Decimal (no float drift);
  * **leakage identity**: leakage == capveri_calculated - actual_billed exactly;
  * **percent guard**: leakage_pct is 0.0 iff calculated == 0, else the float ratio;
  * **breakdown faithful**: one row per tenant with a non-zero difference, each
    difference == calc - billed, sorted by descending |difference|;
  * **data flags**: has_billing_data iff any billed rows; has_reconciliation_data
    iff any snapshots.

Run standalone:
    pytest tests/stress/test_leakage_stress.py -q
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
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_ORG_ID = uuid4()
_PROP_ID = uuid4()
_START = date(2024, 1, 1)
_END = date(2024, 12, 31)


class _FakeQuery:
    """Chainable PostgREST stand-in that applies eq filters to in-memory rows."""

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


def _money() -> st.SearchStrategy[Decimal]:
    return st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("1000000"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


@st.composite
def _scenario(draw: Any) -> dict[str, Any]:
    n_tenants = draw(st.integers(0, 5))
    tenants = [f"Tenant {i}" for i in range(n_tenants)]

    snapshots = []
    billed = []
    leases = []
    for i, name in enumerate(tenants):
        lease_id = str(uuid4())
        leases.append({"id": lease_id, "tenant_name": name})
        # Each tenant may have a calculated amount, a billed amount, or both.
        if draw(st.booleans()):
            snapshots.append(
                {
                    "lease_id": lease_id,
                    "total_recovery": str(draw(_money())),
                    "period_start_date": _START.isoformat(),
                    "period_end_date": _END.isoformat(),
                    "status": "finalized",
                }
            )
        if draw(st.booleans()):
            billed.append(
                {
                    "tenant_name": name,
                    "billed_amount": str(draw(_money())),
                    "period_start_date": _START.isoformat(),
                    "period_end_date": _END.isoformat(),
                }
            )
    return {
        "snapshots": snapshots,
        "billed": billed,
        "leases": leases,
    }


@STRESS
@given(scenario=_scenario())
def test_leakage_aggregation_invariants(scenario: dict[str, Any]) -> None:
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

    expected_calc = sum(
        (Decimal(s["total_recovery"]) for s in scenario["snapshots"]), Decimal("0")
    )
    expected_billed = sum(
        (Decimal(b["billed_amount"]) for b in scenario["billed"]), Decimal("0")
    )

    # Exact sums and the leakage identity — no float drift, correct sign.
    assert result.capveri_calculated == expected_calc
    assert result.actual_billed == expected_billed
    assert result.leakage == expected_calc - expected_billed

    # Percent guard: 0.0 exactly when nothing was calculated.
    if expected_calc > 0:
        assert result.leakage_pct == float(
            (expected_calc - expected_billed) / expected_calc * 100
        )
    else:
        assert result.leakage_pct == 0.0

    # Data flags.
    assert result.has_billing_data is (len(scenario["billed"]) > 0)
    assert result.has_reconciliation_data is (len(scenario["snapshots"]) > 0)

    # Breakdown: every row has a non-zero diff == calc - billed, sorted by |diff|.
    diffs = [abs(b.difference) for b in result.breakdown]
    assert diffs == sorted(diffs, reverse=True)
    for row in result.breakdown:
        assert row.difference != 0
        assert row.difference == row.calculated_amount - row.billed_amount


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
