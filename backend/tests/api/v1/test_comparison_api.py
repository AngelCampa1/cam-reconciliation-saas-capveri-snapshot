"""Tests for the bidirectional comparison API (B1.4 + B1.3).

The Supabase/auth boundary is mocked (same convention as the leakage API tests);
the real comparison engine math runs end-to-end so the endpoint's over/under/match
classification, totals, and ``variance_pct`` serialization are exercised for real.
"""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.main import app
from app.models.enums import UserRole
from app.models.user import User


class PagedQuery:
    """Minimal paging-aware Supabase query stub (mirrors the leakage API tests)."""

    def __init__(self, table_name, rows_by_table):
        self.table_name = table_name
        self.rows_by_table = rows_by_table
        self._filters = []  # (op, field, value)
        self._range_start = None
        self._range_end = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        self._filters.append(("eq", field, value))
        return self

    def in_(self, field, values):
        self._filters.append(("in", field, values))
        return self

    def lte(self, _field, _value):
        return self

    def gte(self, _field, _value):
        return self

    def limit(self, _count):
        return self

    def range(self, start, end):
        self._range_start = start
        self._range_end = end
        return self

    def _apply_filters(self, rows):
        filtered = rows
        for op, field, value in self._filters:
            if op == "eq":
                filtered = [r for r in filtered if r.get(field) == value]
            elif op == "in":
                filtered = [r for r in filtered if r.get(field) in value]
        return filtered

    def execute(self):
        rows = self._apply_filters(self.rows_by_table.get(self.table_name, []))
        response = MagicMock()
        if self._range_start is None or self._range_end is None:
            response.data = rows
        else:
            response.data = rows[self._range_start : self._range_end + 1]
        return response


def paged_table(rows_by_table):
    return lambda table_name: PagedQuery(table_name, rows_by_table)


@pytest.fixture
def test_org_id():
    return uuid4()


@pytest.fixture
def test_user(test_org_id):
    return User(
        id=uuid4(),
        email="user@example.com",
        organization_id=test_org_id,
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def test_client(test_user):
    from app.database.client import get_supabase, get_supabase_admin

    mock_supabase_admin = MagicMock()
    mock_db_client = MagicMock()

    async def mock_get_user():
        return test_user

    def mock_get_db():
        return mock_db_client

    def mock_get_admin_db():
        return mock_supabase_admin

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_supabase] = mock_get_db
    app.dependency_overrides[get_supabase_admin] = mock_get_admin_db

    client = TestClient(app)
    client.mock_supabase_admin = mock_supabase_admin
    yield client

    app.dependency_overrides.clear()


def _scope(org_id, property_id):
    return {"organization_id": str(org_id), "property_id": str(property_id)}


def _snapshot(scope, lease_id, recovery, status_value="finalized"):
    return {
        **scope,
        "lease_id": lease_id,
        "total_recovery": recovery,
        "period_start_date": "2024-01-01",
        "period_end_date": "2024-12-31",
        "status": status_value,
    }


def _billed(scope, tenant_name, amount, row_id=None):
    row = {
        **scope,
        "tenant_name": tenant_name,
        "billed_amount": amount,
        "period_start_date": "2024-01-01",
        "period_end_date": "2024-12-31",
    }
    if row_id is not None:
        row["id"] = row_id
    return row


class TestGetComparison:
    """GET /api/v1/comparison/{property_id} — default actual_billed source."""

    def test_happy_path_over_under_match_and_totals(self, test_client, test_org_id):
        property_id = uuid4()
        lease_over = str(uuid4())
        lease_under = str(uuid4())
        lease_match = str(uuid4())
        scope = _scope(test_org_id, property_id)

        rows = {
            "properties": [
                {"id": str(property_id), "organization_id": str(test_org_id)}
            ],
            "reconciliation_snapshots": [
                _snapshot(scope, lease_over, "1000.00"),
                _snapshot(scope, lease_under, "1000.00"),
                _snapshot(scope, lease_match, "1000.00"),
            ],
            "leases": [
                {**scope, "id": lease_over, "tenant_name": "Over Co"},
                {**scope, "id": lease_under, "tenant_name": "Under Co"},
                {**scope, "id": lease_match, "tenant_name": "Match Co"},
            ],
            "actual_billed_amounts": [
                _billed(scope, "Over Co", "1200.00"),  # +200 overcharge
                _billed(scope, "Under Co", "800.00"),  # -200 undercharge
                _billed(scope, "Match Co", "1000.00"),  # match
            ],
        }
        test_client.mock_supabase_admin.table = paged_table(rows)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get(
                f"/api/v1/comparison/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["total_capveri_correct"]) == Decimal("3000.00")
        assert Decimal(data["total_actual_charged"]) == Decimal("3000.00")
        assert Decimal(data["total_net_variance"]) == Decimal("0.00")
        assert Decimal(data["total_overcharge"]) == Decimal("200.00")
        assert Decimal(data["total_undercharge"]) == Decimal("200.00")
        assert data["overcharge_count"] == 1
        assert data["undercharge_count"] == 1
        assert data["match_count"] == 1

        by_lease = {t["lease_id"]: t for t in data["tenants"]}
        assert by_lease[lease_over]["direction"] == "overcharge"
        assert by_lease[lease_under]["direction"] == "undercharge"
        assert by_lease[lease_match]["direction"] == "match"
        # Decimal precision preserved (string, not lossy float).
        assert by_lease[lease_over]["variance"] == "200.00"

    def test_tolerance_param_classifies_match(self, test_client, test_org_id):
        property_id = uuid4()
        lease_a = str(uuid4())
        scope = _scope(test_org_id, property_id)

        rows = {
            "properties": [
                {"id": str(property_id), "organization_id": str(test_org_id)}
            ],
            "reconciliation_snapshots": [_snapshot(scope, lease_a, "1000.00")],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [_billed(scope, "Acme Corp", "1005.00")],
        }
        test_client.mock_supabase_admin.table = paged_table(rows)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get(
                f"/api/v1/comparison/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "tolerance": "10",
                },
            )

        assert response.status_code == 200
        data = response.json()
        # A $5 variance is within a $10 tolerance => MATCH, not overcharge.
        assert data["match_count"] == 1
        assert data["overcharge_count"] == 0
        assert data["tenants"][0]["direction"] == "match"
        assert Decimal(data["tolerance"]) == Decimal("10")

    def test_include_drafts_respected(self, test_client, test_org_id):
        property_id = uuid4()
        lease_a = str(uuid4())
        scope = _scope(test_org_id, property_id)

        rows = {
            "properties": [
                {"id": str(property_id), "organization_id": str(test_org_id)}
            ],
            "reconciliation_snapshots": [
                _snapshot(scope, lease_a, "1000.00", status_value="draft")
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Draft Tenant"}],
            "actual_billed_amounts": [],
        }
        test_client.mock_supabase_admin.table = paged_table(rows)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get(
                f"/api/v1/comparison/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "include_drafts": "true",
                },
            )

        assert response.status_code == 200
        data = response.json()
        # Draft snapshot counted as correct; no charge => full undercharge.
        assert Decimal(data["total_capveri_correct"]) == Decimal("1000.00")
        assert data["undercharge_count"] == 1

    def test_variance_pct_none_serializes_as_null(self, test_client, test_org_id):
        property_id = uuid4()
        scope = _scope(test_org_id, property_id)

        rows = {
            "properties": [
                {"id": str(property_id), "organization_id": str(test_org_id)}
            ],
            "reconciliation_snapshots": [],
            "leases": [],
            # Charged with no correct counterpart => correct=0 => variance_pct None.
            "actual_billed_amounts": [_billed(scope, "Ghost Tenant", "750.00")],
        }
        test_client.mock_supabase_admin.table = paged_table(rows)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get(
                f"/api/v1/comparison/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                },
            )

        assert response.status_code == 200
        data = response.json()
        tenant = data["tenants"][0]
        assert tenant["variance_pct"] is None
        assert tenant["direction"] == "overcharge"
        assert Decimal(tenant["actual_charged"]) == Decimal("750.00")

    def test_cross_org_property_returns_empty(self, test_client, test_org_id):
        property_id = uuid4()
        other_org_id = uuid4()
        rows = {
            # Property belongs to a different org => filtered out, empty result.
            "properties": [
                {"id": str(property_id), "organization_id": str(other_org_id)}
            ],
            "reconciliation_snapshots": [],
            "leases": [],
            "actual_billed_amounts": [],
        }
        test_client.mock_supabase_admin.table = paged_table(rows)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get(
                f"/api/v1/comparison/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["tenants"] == []
        assert Decimal(data["total_capveri_correct"]) == Decimal("0")
        assert Decimal(data["total_actual_charged"]) == Decimal("0")

    def test_returns_400_when_period_start_equals_end(self, test_client):
        property_id = uuid4()
        response = test_client.get(
            f"/api/v1/comparison/{property_id}",
            params={
                "period_start": "2024-01-01",
                "period_end": "2024-01-01",
            },
        )
        assert response.status_code == 400
        assert "period_start must be before period_end" in response.json()["detail"]

    def test_returns_400_when_period_start_after_end(self, test_client):
        property_id = uuid4()
        response = test_client.get(
            f"/api/v1/comparison/{property_id}",
            params={
                "period_start": "2024-12-31",
                "period_end": "2024-01-01",
            },
        )
        assert response.status_code == 400
        assert "period_start must be before period_end" in response.json()["detail"]


class TestPostComparison:
    """POST /api/v1/comparison/{property_id} — explicit charged set (B1.3)."""

    def test_explicit_charges_produce_variances_without_actual_billed(
        self, test_client, test_org_id
    ):
        property_id = uuid4()
        lease_over = str(uuid4())
        lease_under = str(uuid4())
        scope = _scope(test_org_id, property_id)

        # actual_billed_amounts is intentionally NON-empty to prove it is ignored:
        # if the endpoint read it, totals would differ from the explicit set.
        rows = {
            "properties": [
                {"id": str(property_id), "organization_id": str(test_org_id)}
            ],
            "reconciliation_snapshots": [
                _snapshot(scope, lease_over, "1000.00"),
                _snapshot(scope, lease_under, "1000.00"),
            ],
            "leases": [
                {**scope, "id": lease_over, "tenant_name": "Over Co"},
                {**scope, "id": lease_under, "tenant_name": "Under Co"},
            ],
            "actual_billed_amounts": [
                _billed(scope, "Over Co", "99999.00", row_id=str(uuid4())),
            ],
        }
        test_client.mock_supabase_admin.table = paged_table(rows)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.post(
                f"/api/v1/comparison/{property_id}",
                json={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "charges": [
                        {"tenant_name": "Over Co", "amount": "1300.00"},
                        {"tenant_name": "Under Co", "amount": "700.00"},
                    ],
                },
            )

        assert response.status_code == 200
        data = response.json()
        # Totals reflect the explicit set (1300 + 700), NOT the 99999 billed row.
        assert Decimal(data["total_actual_charged"]) == Decimal("2000.00")
        assert Decimal(data["total_overcharge"]) == Decimal("300.00")
        assert Decimal(data["total_undercharge"]) == Decimal("300.00")
        by_lease = {t["lease_id"]: t for t in data["tenants"]}
        assert by_lease[lease_over]["direction"] == "overcharge"
        assert by_lease[lease_under]["direction"] == "undercharge"

    def test_explicit_blank_name_charges_stay_separate(self, test_client, test_org_id):
        property_id = uuid4()
        rows = {
            "properties": [
                {"id": str(property_id), "organization_id": str(test_org_id)}
            ],
            "reconciliation_snapshots": [],
            "leases": [],
            "actual_billed_amounts": [],
        }
        test_client.mock_supabase_admin.table = paged_table(rows)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.post(
                f"/api/v1/comparison/{property_id}",
                json={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "charges": [
                        {"amount": "200.00"},
                        {"tenant_name": "   ", "amount": "300.00"},
                    ],
                },
            )

        assert response.status_code == 200
        data = response.json()
        # Two blank-name charges must NOT merge: two distinct overcharge findings.
        assert data["overcharge_count"] == 2
        assert Decimal(data["total_actual_charged"]) == Decimal("500.00")
        keys = {t["lease_id"] for t in data["tenants"]}
        assert keys == {"id::explicit::0", "id::explicit::1"}

    def test_post_cross_org_property_returns_empty(self, test_client, test_org_id):
        property_id = uuid4()
        other_org_id = uuid4()
        rows = {
            "properties": [
                {"id": str(property_id), "organization_id": str(other_org_id)}
            ],
            "reconciliation_snapshots": [],
            "leases": [],
            "actual_billed_amounts": [],
        }
        test_client.mock_supabase_admin.table = paged_table(rows)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.post(
                f"/api/v1/comparison/{property_id}",
                json={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "charges": [{"tenant_name": "Acme Corp", "amount": "500.00"}],
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["tenants"] == []
        assert Decimal(data["total_actual_charged"]) == Decimal("0")

    def test_post_returns_400_on_invalid_period(self, test_client):
        property_id = uuid4()
        response = test_client.post(
            f"/api/v1/comparison/{property_id}",
            json={
                "period_start": "2024-12-31",
                "period_end": "2024-01-01",
                "charges": [{"tenant_name": "Acme Corp", "amount": "500.00"}],
            },
        )
        assert response.status_code == 400
        assert "period_start must be before period_end" in response.json()["detail"]


class _RunStoreQuery:
    """Insert/select/delete-capable Supabase stub for the persistence layer."""

    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._mode = "select"
        self._filters = []
        self._order = None
        self._range = None
        self._limit = None
        self._insert_rows = None

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
            inserted = []
            for i, row in enumerate(self._insert_rows or []):
                stored = dict(row)
                stored.setdefault("id", str(uuid4()))
                stored.setdefault("created_at", f"2026-06-01T00:00:{i:02d}+00:00")
                table_rows.append(stored)
                inserted.append(dict(stored))
            return MagicMock(data=inserted)
        if self._mode == "delete":
            self._store[self._table] = [r for r in table_rows if not self._matches(r)]
            return MagicMock(data=[])
        rows = [dict(r) for r in table_rows if self._matches(r)]
        if self._order is not None:
            field, desc = self._order
            rows.sort(key=lambda r: r.get(field), reverse=desc)
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        if self._limit is not None:
            rows = rows[: self._limit]
        return MagicMock(data=rows)


class _RunStore:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _RunStoreQuery(self.store, name)


class TestComparisonRuns:
    """POST/GET /api/v1/comparison/.../runs — persisted audit runs (B1.6)."""

    def _seed_rows(self, test_org_id, property_id):
        lease_over = str(uuid4())
        lease_under = str(uuid4())
        scope = _scope(test_org_id, property_id)
        rows = {
            "properties": [
                {"id": str(property_id), "organization_id": str(test_org_id)}
            ],
            "reconciliation_snapshots": [
                _snapshot(scope, lease_over, "1000.00"),
                _snapshot(scope, lease_under, "1000.00"),
            ],
            "leases": [
                {**scope, "id": lease_over, "tenant_name": "Over Co"},
                {**scope, "id": lease_under, "tenant_name": "Under Co"},
            ],
            "actual_billed_amounts": [
                _billed(scope, "Over Co", "1200.00"),
                _billed(scope, "Under Co", "800.00"),
            ],
        }
        return rows

    def test_create_run_persists_and_returns_stored_run(self, test_client, test_org_id):
        property_id = uuid4()
        rows = self._seed_rows(test_org_id, property_id)
        test_client.mock_supabase_admin.table = paged_table(rows)
        run_store = _RunStore()

        with (
            patch(
                "app.services.comparison.engine.get_supabase_admin",
                return_value=test_client.mock_supabase_admin,
            ),
            patch(
                "app.services.comparison.persistence.get_supabase_admin",
                return_value=run_store,
            ),
        ):
            response = test_client.post(
                f"/api/v1/comparison/{property_id}/runs",
                json={"period_start": "2024-01-01", "period_end": "2024-12-31"},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["source"] == "actual_billed"
        assert Decimal(data["total_overcharge"]) == Decimal("200.00")
        assert Decimal(data["total_undercharge"]) == Decimal("200.00")
        assert len(data["findings"]) == 2
        assert "id" in data and "created_at" in data
        # Actually persisted: one header + two findings.
        assert len(run_store.store["comparison_runs"]) == 1
        assert len(run_store.store["comparison_findings"]) == 2

    def test_create_run_with_explicit_charges_sets_source_explicit(
        self, test_client, test_org_id
    ):
        property_id = uuid4()
        rows = self._seed_rows(test_org_id, property_id)
        test_client.mock_supabase_admin.table = paged_table(rows)
        run_store = _RunStore()

        with (
            patch(
                "app.services.comparison.engine.get_supabase_admin",
                return_value=test_client.mock_supabase_admin,
            ),
            patch(
                "app.services.comparison.persistence.get_supabase_admin",
                return_value=run_store,
            ),
        ):
            response = test_client.post(
                f"/api/v1/comparison/{property_id}/runs",
                json={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "charges": [
                        {"tenant_name": "Over Co", "amount": "1300.00"},
                        {"tenant_name": "Under Co", "amount": "700.00"},
                    ],
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["source"] == "explicit"
        # Totals reflect the explicit set, not the billed rows.
        assert Decimal(data["total_actual_charged"]) == Decimal("2000.00")

    def test_create_run_invalid_period_returns_400(self, test_client):
        property_id = uuid4()
        response = test_client.post(
            f"/api/v1/comparison/{property_id}/runs",
            json={"period_start": "2024-12-31", "period_end": "2024-01-01"},
        )
        assert response.status_code == 400

    def test_list_then_get_run_round_trip(self, test_client, test_org_id):
        property_id = uuid4()
        rows = self._seed_rows(test_org_id, property_id)
        test_client.mock_supabase_admin.table = paged_table(rows)
        run_store = _RunStore()

        with (
            patch(
                "app.services.comparison.engine.get_supabase_admin",
                return_value=test_client.mock_supabase_admin,
            ),
            patch(
                "app.services.comparison.persistence.get_supabase_admin",
                return_value=run_store,
            ),
        ):
            created = test_client.post(
                f"/api/v1/comparison/{property_id}/runs",
                json={"period_start": "2024-01-01", "period_end": "2024-12-31"},
            )
            run_id = created.json()["id"]

            listed = test_client.get(f"/api/v1/comparison/{property_id}/runs")
            detail = test_client.get(f"/api/v1/comparison/runs/{run_id}")

        assert listed.status_code == 200
        summaries = listed.json()
        assert len(summaries) == 1
        assert summaries[0]["id"] == run_id
        # The list view is summary-only (no findings key on the summary model).
        assert "findings" not in summaries[0]

        assert detail.status_code == 200
        assert detail.json()["id"] == run_id
        assert len(detail.json()["findings"]) == 2

    def test_get_missing_run_returns_404(self, test_client):
        run_store = _RunStore()
        with patch(
            "app.services.comparison.persistence.get_supabase_admin",
            return_value=run_store,
        ):
            response = test_client.get(f"/api/v1/comparison/runs/{uuid4()}")
        assert response.status_code == 404

    def test_list_runs_empty_for_unknown_property(self, test_client):
        property_id = uuid4()
        run_store = _RunStore()
        with patch(
            "app.services.comparison.persistence.get_supabase_admin",
            return_value=run_store,
        ):
            response = test_client.get(f"/api/v1/comparison/{property_id}/runs")
        assert response.status_code == 200
        assert response.json() == []
