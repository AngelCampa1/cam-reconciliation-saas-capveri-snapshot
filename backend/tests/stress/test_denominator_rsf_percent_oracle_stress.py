"""Penny-exact oracle for the RSF-delta-percent figure of the denominator report.

``DenominatorChangeService.generate_report`` (denominator_change.py:153-160) reports
how the total rentable square footage shifted between two reconciliation periods:

    rsf_delta         = c_rsf - p_rsf                          # raw, exact subtraction
    rsf_delta_percent = (rsf_delta / p_rsf * Decimal("100"))   # divide THEN multiply
                          .quantize(Decimal("0.01"), ROUND_HALF_UP)
                        if p_rsf != Decimal("0") else Decimal("0")

The seam is the **divide → multiply-by-100 → THEN quantize-once** order. The ratio
``rsf_delta / p_rsf`` is evaluated at full Decimal precision, multiplied by 100, and
the whole product is quantized HALF_UP in a single call. Quantizing the ratio first
(e.g. ``1/30`` → ``0.03`` → ``*100`` → ``3.00``) would diverge from the correct
``3.33``. ``test_denominator_change_stress.py`` only FORMAT-checks
``rsf_delta_percent == rsf_delta_percent.quantize(_CENT)`` (self-referential) — it
never recomputes the absolute value independently with ``==``.

This drives the real async ``generate_report`` through a minimal in-memory fake DB
(period selection is real; only the network boundary is faked), supplying the RSF
totals as explicit overrides, and re-derives ``rsf_delta`` / ``rsf_delta_percent``
with ``==`` (no tolerance), including the ``p_rsf == 0`` zero-guard branch.

Run standalone:
    pytest tests/stress/test_denominator_rsf_percent_oracle_stress.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.analysis.denominator_change import DenominatorChangeService

STRESS = settings(max_examples=300, deadline=None)

_Q = Decimal("0.01")
_PROP_ID = uuid4()
_PRIOR_START = date(2023, 1, 1)
_PRIOR_END = date(2023, 12, 31)
_CURRENT_START = date(2024, 1, 1)
_CURRENT_END = date(2024, 12, 31)


def _q(value: Decimal) -> Decimal:
    return value.quantize(_Q, rounding=ROUND_HALF_UP)


class _FakeQuery:
    """Chainable PostgREST stand-in that applies eq/gte/lte/lt to in-memory rows."""

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


def _snapshot(*, current: bool) -> dict[str, Any]:
    start, end = (
        (_CURRENT_START, _CURRENT_END) if current else (_PRIOR_START, _PRIOR_END)
    )
    return {
        "lease_id": str(uuid4()),
        "property_id": str(_PROP_ID),
        "status": "finalized",
        "period_start_date": start.isoformat(),
        "period_end_date": end.isoformat(),
        "lease_terms_snapshot": {
            "tenant_name": "Acme",
            "pro_rata_share": "0.5",
            "rentable_square_feet": "1000",
            "excluded_pools": [],
            "rsf_measurement_standard": None,
        },
        "total_recovery": "1000.00",
    }


def _run(prior_rsf: Decimal, current_rsf: Decimal):
    svc = DenominatorChangeService()
    db = _FakeDB(
        [_snapshot(current=False), _snapshot(current=True)],
        {"id": str(_PROP_ID), "name": "P", "total_rentable_sqft": "0"},
    )

    async def _go():
        return await svc.generate_report(
            property_id=_PROP_ID,
            current_period_start=_CURRENT_START,
            current_period_end=_CURRENT_END,
            prior_period_start=_PRIOR_START,
            prior_period_end=_PRIOR_END,
            prior_total_rsf=prior_rsf,
            current_total_rsf=current_rsf,
            db=db,
            organization_id=None,
        )

    return asyncio.run(_go())


_rsf = st.decimals(
    min_value=Decimal("1"),
    max_value=Decimal("2000000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


@STRESS
@given(prior_rsf=_rsf, current_rsf=_rsf)
def test_rsf_delta_percent_round_trips_exactly(prior_rsf, current_rsf):
    report = _run(prior_rsf, current_rsf)

    rsf_delta = current_rsf - prior_rsf
    expected_pct = _q(rsf_delta / prior_rsf * Decimal("100"))

    assert report.rsf_delta == rsf_delta
    assert report.rsf_delta_percent == expected_pct


def test_anchor_one_in_thirty_rounds_to_3_33():
    """+1 on a 30 base is 3.333...% -> 3.33 (not 3.00 from a quantize-first error)."""
    report = _run(Decimal("30.00"), Decimal("31.00"))
    assert report.rsf_delta == Decimal("1.00")
    assert report.rsf_delta_percent == Decimal("3.33")


def test_anchor_clean_ten_percent_increase():
    """100000 -> 110000 is exactly a 10.00% increase."""
    report = _run(Decimal("100000.00"), Decimal("110000.00"))
    assert report.rsf_delta_percent == Decimal("10.00")


def test_anchor_decrease_is_signed_negative():
    """A drop reports a negative percent: 1000 -> 750 = -25.00%."""
    report = _run(Decimal("1000.00"), Decimal("750.00"))
    assert report.rsf_delta == Decimal("-250.00")
    assert report.rsf_delta_percent == Decimal("-25.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
