"""Property-based invariants for the leakage (recovery-opportunity) aggregator.

``calculation/leakage.py`` compares what CapVeri *calculated* should be billed
(reconciliation snapshots) against what was *actually* billed (billed-amount rows),
surfacing the gap as recovery opportunity. The money rollup — per-tenant grouping,
the calculated/billed sums, the ``leakage = calculated - billed`` difference, and the
per-tenant breakdown (nonzero diffs only, sorted by magnitude) — is pure aggregation
behind a Supabase read boundary. A mistake here silently understates a landlord's
recovery, so the arithmetic must be exact on arbitrary snapshot/billed mixes.

Only the Supabase boundary is mocked (``get_supabase_admin`` plus the two paginated
fetch helpers). The aggregation logic under test runs for real.

Invariants pinned here:

  * **Sum conservation** — ``capveri_calculated`` is the exact Decimal sum of snapshot
    recoveries; ``actual_billed`` the exact sum of billed amounts; ``leakage`` their
    difference, to the cent (Decimal, never float drift).
  * **Per-tenant totals reconcile** — summing the per-tenant calculated and billed
    sub-totals reproduces the grand totals, so the breakdown loses no money.
  * **Breakdown is the nonzero-diff set** — a tenant appears in the breakdown iff its
    calculated total differs from its billed total; each row's ``difference`` equals
    ``calculated - billed``.
  * **Breakdown ordering** — rows are sorted by descending absolute difference.
  * **Percentage sign & guard** — ``leakage_pct`` is 0.0 when nothing was calculated,
    else carries the sign of ``leakage``; the same guard holds per row.

Run standalone:
    pytest tests/stress/test_leakage_aggregation_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.calculation import leakage as leakage_mod
from app.services.calculation.leakage import calculate_leakage

STRESS = settings(max_examples=200, deadline=None)

# Fixed lease -> tenant map; snapshots reference these ids (plus an unmapped/None id
# that must fall back to "Unknown", exercising the same path the module takes).
_LEASE_MAP = {"L0": "Alpha", "L1": "Beta", "L2": "Gamma"}
_LEASES_ROWS = [{"id": k, "tenant_name": v} for k, v in _LEASE_MAP.items()]

_money = st.decimals(
    min_value=Decimal("0"),
    max_value=Decimal("100000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

_snapshots = st.lists(
    st.fixed_dictionaries(
        {
            "lease_id": st.sampled_from(["L0", "L1", "L2", "LX", None]),
            "total_recovery": _money,
        }
    ),
    max_size=12,
)
_billed = st.lists(
    st.fixed_dictionaries(
        {
            "tenant_name": st.sampled_from(["Alpha", "Beta", "Gamma", "Delta", None]),
            "billed_amount": _money,
        }
    ),
    max_size=12,
)


class _Chain:
    """Minimal chainable Supabase query stub; any builder call returns self, and
    ``execute()`` yields a result carrying a real list ``data`` payload."""

    def __init__(self, data: list[dict[str, object]]):
        self._data = data

    def __getattr__(self, _name: str):
        def _builder(*_args: object, **_kwargs: object) -> _Chain:
            return self

        return _builder

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._data)


def _fake_supabase():
    """A supabase whose ``table()`` returns truthy rows for the property existence
    check and import-batch (GL) check; the snapshot/billed reads go through the
    patched pagination helpers instead."""

    def _table(name: str) -> _Chain:
        if name in ("properties", "import_batches"):
            return _Chain([{"id": "present"}])
        return _Chain([])

    return SimpleNamespace(table=_table)


def _expected_tenant_for_snapshot(lease_id: object) -> str:
    return _LEASE_MAP.get(lease_id, "Unknown") if lease_id else "Unknown"


@STRESS
@given(snapshots=_snapshots, billed=_billed)
def test_leakage_sums_and_breakdown_are_exact(snapshots, billed):
    period_start = date(2024, 1, 1)
    period_end = date(2024, 12, 31)

    with (
        patch.object(leakage_mod, "get_supabase_admin", return_value=_fake_supabase()),
        patch.object(
            leakage_mod,
            "fetch_all_pages",
            side_effect=[list(snapshots), list(billed)],
        ),
        patch.object(
            leakage_mod, "fetch_all_pages_chunked_in", return_value=_LEASES_ROWS
        ),
    ):
        result = calculate_leakage(
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=period_start,
            period_end=period_end,
        )

    # --- Expected aggregation, computed independently of the module ---
    exp_calc = sum((Decimal(str(s["total_recovery"])) for s in snapshots), Decimal("0"))
    exp_billed = sum((Decimal(str(b["billed_amount"])) for b in billed), Decimal("0"))

    calc_by_tenant: dict[str, Decimal] = {}
    for s in snapshots:
        tenant = _expected_tenant_for_snapshot(s["lease_id"])
        calc_by_tenant[tenant] = calc_by_tenant.get(tenant, Decimal("0")) + Decimal(
            str(s["total_recovery"])
        )
    billed_by_tenant: dict[str, Decimal] = {}
    for b in billed:
        raw = b["tenant_name"]
        tenant = raw if isinstance(raw, str) else "Unknown"
        billed_by_tenant[tenant] = billed_by_tenant.get(tenant, Decimal("0")) + Decimal(
            str(b["billed_amount"])
        )

    # Sum conservation (exact Decimal).
    assert result.capveri_calculated == exp_calc
    assert result.actual_billed == exp_billed
    assert result.leakage == exp_calc - exp_billed

    # Per-tenant totals reconcile to the grand totals (no money lost in grouping).
    assert sum(calc_by_tenant.values(), Decimal("0")) == exp_calc
    assert sum(billed_by_tenant.values(), Decimal("0")) == exp_billed

    # Percentage guard & sign.
    if exp_calc > 0:
        assert result.leakage_pct == pytest.approx(
            float(result.leakage / exp_calc * 100)
        )
        assert (result.leakage_pct > 0) == (result.leakage > 0)
        assert (result.leakage_pct < 0) == (result.leakage < 0)
    else:
        assert result.leakage_pct == 0.0

    # Breakdown is exactly the set of tenants whose calc != billed.
    all_tenants = set(calc_by_tenant) | set(billed_by_tenant)
    expected_diff_tenants = {
        t
        for t in all_tenants
        if calc_by_tenant.get(t, Decimal("0")) != billed_by_tenant.get(t, Decimal("0"))
    }
    assert {row.tenant_name for row in result.breakdown} == expected_diff_tenants

    for row in result.breakdown:
        exp_row_calc = calc_by_tenant.get(row.tenant_name, Decimal("0"))
        exp_row_billed = billed_by_tenant.get(row.tenant_name, Decimal("0"))
        assert row.calculated_amount == exp_row_calc
        assert row.billed_amount == exp_row_billed
        assert row.difference == exp_row_calc - exp_row_billed
        assert row.difference != 0

    # Sorted by descending absolute difference.
    mags = [abs(row.difference) for row in result.breakdown]
    assert mags == sorted(mags, reverse=True)


def test_unknown_property_short_circuits_to_zero_anchor():
    """When the property does not belong to the org, every figure is zero and no
    snapshot/billed read is attempted."""
    empty_supabase = SimpleNamespace(table=lambda _name: _Chain([]))
    with patch.object(leakage_mod, "get_supabase_admin", return_value=empty_supabase):
        result = calculate_leakage(
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
    assert result.capveri_calculated == Decimal("0")
    assert result.actual_billed == Decimal("0")
    assert result.leakage == Decimal("0")
    assert result.leakage_pct == 0.0
    assert result.has_reconciliation_data is False
    assert result.has_gl_data is False
    assert result.has_billing_data is False
    assert result.breakdown == []


def test_breakdown_sort_and_nonzero_filter_anchor():
    """Two tenants differ by different magnitudes and one matches exactly; only the
    differing tenants appear, largest gap first."""
    snapshots = [
        {"lease_id": "L0", "total_recovery": Decimal("1000.00")},  # Alpha
        {"lease_id": "L1", "total_recovery": Decimal("500.00")},  # Beta
        {"lease_id": "L2", "total_recovery": Decimal("300.00")},  # Gamma (matches)
    ]
    billed = [
        {"tenant_name": "Alpha", "billed_amount": Decimal("100.00")},  # diff 900
        {"tenant_name": "Beta", "billed_amount": Decimal("450.00")},  # diff 50
        {"tenant_name": "Gamma", "billed_amount": Decimal("300.00")},  # diff 0
    ]
    with (
        patch.object(leakage_mod, "get_supabase_admin", return_value=_fake_supabase()),
        patch.object(leakage_mod, "fetch_all_pages", side_effect=[snapshots, billed]),
        patch.object(
            leakage_mod, "fetch_all_pages_chunked_in", return_value=_LEASES_ROWS
        ),
    ):
        result = calculate_leakage(
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
    assert result.capveri_calculated == Decimal("1800.00")
    assert result.actual_billed == Decimal("850.00")
    assert result.leakage == Decimal("950.00")
    assert [row.tenant_name for row in result.breakdown] == ["Alpha", "Beta"]
    assert result.breakdown[0].difference == Decimal("900.00")
    assert result.breakdown[1].difference == Decimal("50.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
