"""Tests for comparison run persistence (Module B / B1.6).

The Supabase boundary is the only thing mocked: a small in-memory fake that
behaves like the PostgREST query builder for the operations this layer uses
(``insert`` with server-generated ``id``/``created_at``, ``select`` + ``eq`` +
``order`` + ``range`` + ``limit``, and ``delete`` + ``eq``). The real persistence
serialization, org-scoping, and round-trip parsing run end-to-end so the stored
values, Decimal precision, JSONB pool round-trip, and rollback-on-failure are all
exercised for real (no mock-only assertions).
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.comparison import persistence
from app.services.comparison.engine import build_comparison_result
from app.services.comparison.models import (
    ComparisonSource,
    StoredComparisonRun,
    StoredComparisonRunSummary,
    VarianceDirection,
)


class _FakeResponse:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    """In-memory stand-in for a Supabase/PostgREST query builder."""

    def __init__(self, store, table, *, fail_insert_tables=None):
        self._store = store
        self._table = table
        self._fail_insert_tables = fail_insert_tables or set()
        self._mode = "select"
        self._filters: list[tuple[str, object]] = []
        self._order: tuple[str, bool] | None = None
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None
        self._insert_rows: list[dict] | None = None

    def select(self, *_a, **_k):
        self._mode = "select"
        return self

    def insert(self, rows):
        self._mode = "insert"
        self._insert_rows = rows if isinstance(rows, list) else [rows]
        return self

    def delete(self):
        self._mode = "delete"
        return self

    def eq(self, field, value):
        self._filters.append((field, value))
        return self

    def order(self, field, desc=False):
        self._order = (field, desc)
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, count):
        self._limit = count
        return self

    def _matches(self, row):
        return all(row.get(f) == v for f, v in self._filters)

    def execute(self):
        table_rows = self._store.setdefault(self._table, [])
        if self._mode == "insert":
            if self._table in self._fail_insert_tables:
                raise RuntimeError(f"simulated insert failure on {self._table}")
            inserted = []
            for i, row in enumerate(self._insert_rows or []):
                stored = dict(row)
                stored.setdefault("id", str(uuid4()))
                # Deterministic, monotonic-ish created_at so ordering is testable.
                stored.setdefault("created_at", f"2026-06-01T00:00:{i:02d}+00:00")
                table_rows.append(stored)
                inserted.append(dict(stored))
            return _FakeResponse(inserted)

        if self._mode == "delete":
            kept = [r for r in table_rows if not self._matches(r)]
            removed = [r for r in table_rows if self._matches(r)]
            self._store[self._table] = kept
            return _FakeResponse(removed)

        # select
        rows = [dict(r) for r in table_rows if self._matches(r)]
        if self._order is not None:
            field, desc = self._order
            rows.sort(key=lambda r: r.get(field), reverse=desc)
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        if self._limit is not None:
            rows = rows[: self._limit]
        return _FakeResponse(rows)


class _FakeSupabase:
    def __init__(self, *, fail_insert_tables=None):
        self.store: dict[str, list[dict]] = {}
        self._fail_insert_tables = fail_insert_tables or set()

    def table(self, name):
        return _FakeQuery(self.store, name, fail_insert_tables=self._fail_insert_tables)


@pytest.fixture
def fake_db(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(persistence, "get_supabase_admin", lambda: fake)
    return fake


def _result(property_id, *, pools=False):
    """Build a realistic ComparisonResult via the real engine."""
    lease_over = str(uuid4())
    lease_under = str(uuid4())
    lease_match = str(uuid4())
    correct = {
        lease_over: Decimal("1000.00"),
        lease_under: Decimal("1000.00"),
        lease_match: Decimal("1000.00"),
    }
    charged = {
        lease_over: Decimal("1200.00"),
        lease_under: Decimal("800.00"),
        lease_match: Decimal("1000.00"),
    }
    names = {
        lease_over: "Over Co",
        lease_under: "Under Co",
        lease_match: "Match Co",
    }
    kwargs = {}
    if pools:
        kwargs = {
            "correct_by_lease_and_pool": {
                lease_over: {"cam": Decimal("600.00"), "tax": Decimal("400.00")}
            },
            "charged_by_lease_and_pool": {
                lease_over: {"cam": Decimal("750.00"), "tax": Decimal("450.00")}
            },
            "pool_names": {"cam": "CAM", "tax": "Taxes"},
        }
    return build_comparison_result(
        correct,
        charged,
        property_id,
        date(2024, 1, 1),
        date(2024, 12, 31),
        tolerance=Decimal("0.01"),
        tenant_names=names,
        **kwargs,
    )


def test_save_then_get_round_trips_header_and_findings(fake_db):
    org_id = uuid4()
    user_id = uuid4()
    property_id = uuid4()
    result = _result(property_id)

    run_id = persistence.save_comparison_run(
        result, org_id, ComparisonSource.ACTUAL_BILLED, created_by=user_id
    )

    # Two tables written: one run header, three findings.
    assert len(fake_db.store["comparison_runs"]) == 1
    assert len(fake_db.store["comparison_findings"]) == 3

    stored = persistence.get_comparison_run(org_id, run_id)
    assert isinstance(stored, StoredComparisonRun)
    assert stored.id == run_id
    assert stored.property_id == property_id
    assert stored.source == ComparisonSource.ACTUAL_BILLED
    assert stored.created_by == user_id
    assert stored.total_capveri_correct == Decimal("3000.00")
    assert stored.total_actual_charged == Decimal("3000.00")
    assert stored.total_overcharge == Decimal("200.00")
    assert stored.total_undercharge == Decimal("200.00")
    assert stored.overcharge_count == 1
    assert stored.undercharge_count == 1
    assert stored.match_count == 1

    # Findings come back sorted by descending abs_variance; Decimal preserved.
    directions = {f.tenant_name: f.direction for f in stored.findings}
    assert directions["Over Co"] == VarianceDirection.OVERCHARGE
    assert directions["Under Co"] == VarianceDirection.UNDERCHARGE
    assert directions["Match Co"] == VarianceDirection.MATCH
    assert stored.findings[0].abs_variance >= stored.findings[-1].abs_variance
    # No pool maps => pool_breakdowns stays None through the JSONB round-trip.
    assert all(f.pool_breakdowns is None for f in stored.findings)


def test_pool_breakdowns_survive_jsonb_round_trip(fake_db):
    org_id = uuid4()
    property_id = uuid4()
    result = _result(property_id, pools=True)

    run_id = persistence.save_comparison_run(result, org_id, ComparisonSource.EXPLICIT)
    stored = persistence.get_comparison_run(org_id, run_id)
    assert stored is not None
    assert stored.source == ComparisonSource.EXPLICIT
    # created_by omitted => None.
    assert stored.created_by is None

    over = next(f for f in stored.findings if f.tenant_name == "Over Co")
    assert over.pool_breakdowns is not None
    pools = {p.pool_id: p for p in over.pool_breakdowns}
    assert pools["cam"].variance == Decimal("150.00")
    assert pools["cam"].direction == VarianceDirection.OVERCHARGE
    assert pools["cam"].pool_name == "CAM"
    # The other leases are in pool mode but have no pool data => empty list, not None.
    others = [f for f in stored.findings if f.tenant_name != "Over Co"]
    assert all(f.pool_breakdowns == [] for f in others)


def test_list_returns_summaries_newest_first_and_scoped(fake_db):
    org_id = uuid4()
    other_org = uuid4()
    property_id = uuid4()

    first = persistence.save_comparison_run(
        _result(property_id), org_id, ComparisonSource.ACTUAL_BILLED
    )
    second = persistence.save_comparison_run(
        _result(property_id), org_id, ComparisonSource.ACTUAL_BILLED
    )
    # A run for the same property but a different org must not leak in.
    persistence.save_comparison_run(
        _result(property_id), other_org, ComparisonSource.ACTUAL_BILLED
    )

    runs = persistence.list_comparison_runs(org_id, property_id)
    assert all(isinstance(r, StoredComparisonRunSummary) for r in runs)
    assert {r.id for r in runs} == {first, second}
    # Newest first: created_at descending.
    assert runs[0].created_at >= runs[1].created_at


def test_list_respects_limit_and_offset(fake_db):
    org_id = uuid4()
    property_id = uuid4()
    ids = [
        persistence.save_comparison_run(
            _result(property_id), org_id, ComparisonSource.ACTUAL_BILLED
        )
        for _ in range(3)
    ]
    assert len(ids) == 3

    page = persistence.list_comparison_runs(org_id, property_id, limit=1, offset=0)
    assert len(page) == 1
    page2 = persistence.list_comparison_runs(org_id, property_id, limit=1, offset=1)
    assert len(page2) == 1
    assert page[0].id != page2[0].id


def test_get_other_org_returns_none(fake_db):
    org_id = uuid4()
    other_org = uuid4()
    property_id = uuid4()
    run_id = persistence.save_comparison_run(
        _result(property_id), org_id, ComparisonSource.ACTUAL_BILLED
    )
    assert persistence.get_comparison_run(other_org, run_id) is None


def test_get_missing_run_returns_none(fake_db):
    assert persistence.get_comparison_run(uuid4(), uuid4()) is None


def test_get_recomputes_stored_variance_pct_from_current_contract(fake_db):
    org_id = uuid4()
    property_id = uuid4()
    run_id = persistence.save_comparison_run(
        _result(property_id), org_id, ComparisonSource.ACTUAL_BILLED
    )
    stale = fake_db.store["comparison_findings"][0]
    stale.update(
        {
            "tenant_name": "Credit Tenant",
            "capveri_correct": "-100.00",
            "actual_charged": "0.00",
            "variance": "100.00",
            "abs_variance": "100.00",
            "direction": "overcharge",
            # Historical rows used a signed denominator and stored the wrong sign.
            "variance_pct": "-100.00",
        }
    )

    stored = persistence.get_comparison_run(org_id, run_id)
    assert stored is not None
    credit = next(f for f in stored.findings if f.tenant_name == "Credit Tenant")
    assert credit.variance_pct == Decimal("100.00")


def test_get_recomputes_zero_correct_variance_pct_as_none(fake_db):
    org_id = uuid4()
    property_id = uuid4()
    run_id = persistence.save_comparison_run(
        _result(property_id), org_id, ComparisonSource.ACTUAL_BILLED
    )
    zero = fake_db.store["comparison_findings"][0]
    zero.update(
        {
            "tenant_name": "Unidentified Credit",
            "capveri_correct": "0.00",
            "actual_charged": "25.00",
            "variance": "25.00",
            "abs_variance": "25.00",
            "direction": "overcharge",
            "variance_pct": "999.00",
        }
    )

    stored = persistence.get_comparison_run(org_id, run_id)
    assert stored is not None
    finding = next(f for f in stored.findings if f.tenant_name == "Unidentified Credit")
    assert finding.variance_pct is None


def test_findings_failure_rolls_back_run_header(monkeypatch):
    fake = _FakeSupabase(fail_insert_tables={"comparison_findings"})
    monkeypatch.setattr(persistence, "get_supabase_admin", lambda: fake)
    org_id = uuid4()
    property_id = uuid4()

    with pytest.raises(RuntimeError, match="rolled back run"):
        persistence.save_comparison_run(
            _result(property_id), org_id, ComparisonSource.ACTUAL_BILLED
        )

    # The orphaned run header must have been deleted (all-or-nothing audit trail).
    assert fake.store.get("comparison_runs") == []


def test_save_raises_when_header_insert_returns_no_row(monkeypatch):
    class _NoRowSupabase(_FakeSupabase):
        def table(self, name):
            q = super().table(name)
            if name == "comparison_runs":
                original = q.execute

                def _empty():
                    original()
                    return _FakeResponse([])

                q.execute = _empty  # type: ignore[method-assign]
            return q

    fake = _NoRowSupabase()
    monkeypatch.setattr(persistence, "get_supabase_admin", lambda: fake)
    with pytest.raises(RuntimeError, match="run header"):
        persistence.save_comparison_run(
            _result(uuid4()), uuid4(), ComparisonSource.ACTUAL_BILLED
        )
