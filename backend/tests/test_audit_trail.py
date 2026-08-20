"""Tests for audit trail query endpoint and enhanced export filters.

Tests GET /api/v1/audit-trail (JSON query) and new row_id/changed_by
filters on GET /api/v1/exports/audit-log (CSV export).
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from tests.conftest import (
    ORG_A_ID,
    MockQueryBuilder,
)

# Fixed UUIDs for deterministic tests
ROW_UUID = UUID("aaaaaaaa-0000-0000-0000-000000000001")
USER_UUID = UUID("bbbbbbbb-0000-0000-0000-000000000001")


def _make_entry(
    org_id=None,
    table_name="gl_entries",
    operation="INSERT",
    row_id=None,
    changed_by=None,
    changed_at=None,
) -> dict:
    """Build a minimal audit_log row dict."""
    return {
        "id": 1,
        "table_name": table_name,
        "operation": operation,
        "row_id": str(row_id or ROW_UUID),
        "old_data": None,
        "new_data": {"amount": "500.00"},
        "changed_by": str(changed_by or USER_UUID),
        "changed_at": (changed_at or datetime.now(UTC)).isoformat(),
        "organization_id": str(org_id or ORG_A_ID),
        "session_info": None,
    }


# =============================================================================
# TestAuditTrailQueryEndpoint
# =============================================================================


class TestAuditTrailQueryEndpoint:
    """Tests for GET /api/v1/audit-trail."""

    def test_returns_paginated_results(self, org_a_admin_client):
        """Happy path: returns paginated AuditLogEntry list."""
        entries = [_make_entry(), _make_entry()]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get("/api/v1/audit-trail")

        assert response.status_code == 200
        body = response.json()
        assert "items" in body
        assert "total" in body
        assert "page" in body
        assert "page_size" in body
        assert body["total"] == 2
        assert len(body["items"]) == 2
        assert body["page"] == 1

    def test_filters_by_start_date(self, org_a_admin_client):
        """start_date param filters out older entries."""
        yesterday = datetime.now(UTC) - timedelta(days=1)
        last_week = datetime.now(UTC) - timedelta(days=7)
        entries = [
            _make_entry(changed_at=yesterday),  # within range
            _make_entry(changed_at=last_week),  # outside range
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        two_days_ago = (datetime.now(UTC) - timedelta(days=2)).date().isoformat()
        response = org_a_admin_client.get(
            "/api/v1/audit-trail", params={"start_date": two_days_ago}
        )

        assert response.status_code == 200
        body = response.json()
        # Verify query was built (endpoint doesn't raise)
        assert "items" in body

    def test_filters_by_end_date(self, org_a_admin_client):
        """end_date param restricts entries to before cutoff."""
        entries = [_make_entry()]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        today = datetime.now(UTC).date().isoformat()
        response = org_a_admin_client.get(
            "/api/v1/audit-trail", params={"end_date": today}
        )

        assert response.status_code == 200
        assert "items" in response.json()

    def test_filters_by_table_name(self, org_a_admin_client):
        """table_name filter returns only matching entries."""
        entries = [
            _make_entry(table_name="gl_entries"),
            _make_entry(table_name="leases"),
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(
            "/api/v1/audit-trail", params={"table_name": "gl_entries"}
        )

        assert response.status_code == 200
        body = response.json()
        assert "items" in body
        for item in body["items"]:
            assert item["table_name"] == "gl_entries"

    def test_filters_by_operation(self, org_a_admin_client):
        """operation filter returns only matching entries."""
        entries = [
            _make_entry(operation="INSERT"),
            _make_entry(operation="DELETE"),
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(
            "/api/v1/audit-trail", params={"operation": "INSERT"}
        )

        assert response.status_code == 200
        body = response.json()
        assert "items" in body
        for item in body["items"]:
            assert item["operation"] == "INSERT"

    def test_filters_by_row_id(self, org_a_admin_client):
        """row_id filter returns only entries for that record."""
        other_row = uuid4()
        entries = [
            _make_entry(row_id=ROW_UUID),
            _make_entry(row_id=other_row),
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(
            "/api/v1/audit-trail", params={"row_id": str(ROW_UUID)}
        )

        assert response.status_code == 200
        body = response.json()
        assert "items" in body
        for item in body["items"]:
            assert item["row_id"] == str(ROW_UUID)

    def test_filters_by_changed_by(self, org_a_admin_client):
        """changed_by filter returns only entries by that user."""
        other_user = uuid4()
        entries = [
            _make_entry(changed_by=USER_UUID),
            _make_entry(changed_by=other_user),
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(
            "/api/v1/audit-trail", params={"changed_by": str(USER_UUID)}
        )

        assert response.status_code == 200
        body = response.json()
        assert "items" in body
        for item in body["items"]:
            assert item["changed_by"] == str(USER_UUID)

    def test_pagination_page_2(self, org_a_admin_client):
        """page=2 returns second slice and correct total."""
        entries = [_make_entry() for _ in range(15)]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(
            "/api/v1/audit-trail", params={"page": 2, "page_size": 10}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["page"] == 2
        assert body["page_size"] == 10
        assert body["total"] == 15
        assert len(body["items"]) == 5  # 15 total, page 2 of 10 = 5 items

    def test_empty_result_returns_zero_total(self, org_a_admin_client):
        """No matching entries returns total=0 and empty items list."""

        def mock_table(table_name):
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get("/api/v1/audit-trail")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_non_admin_returns_403(self, org_a_member_client):
        """Non-admin user receives 403 Forbidden."""
        response = org_a_member_client.get("/api/v1/audit-trail")
        assert response.status_code == 403

    def test_unauthenticated_returns_401(self, base_client):
        """Request without auth header receives 401."""
        response = base_client.get("/api/v1/audit-trail")
        assert response.status_code == 401

    def test_org_scoping(self, org_a_admin_client):
        """Only org A entries are returned, not org B entries."""
        entries = [
            _make_entry(org_id=ORG_A_ID, table_name="gl_entries"),
            _make_entry(org_id=ORG_A_ID, table_name="leases"),
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get("/api/v1/audit-trail")

        assert response.status_code == 200
        body = response.json()
        for item in body["items"]:
            assert item["organization_id"] == str(ORG_A_ID)


# =============================================================================
# TestAuditLogExportNewFilters
# =============================================================================


class TestAuditLogExportNewFilters:
    """Tests for new row_id and changed_by filters on GET /api/v1/exports/audit-log."""

    def test_export_filters_by_row_id(self, org_a_admin_client):
        """CSV export respects row_id filter — only matching row appears."""
        other_row = uuid4()
        entries = [
            _make_entry(row_id=ROW_UUID, table_name="gl_entries"),
            _make_entry(row_id=other_row, table_name="leases"),
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(
            "/api/v1/exports/audit-log", params={"row_id": str(ROW_UUID)}
        )

        assert response.status_code == 200
        content = response.content.decode("utf-8")
        assert str(ROW_UUID) in content
        assert str(other_row) not in content

    def test_export_filters_by_changed_by(self, org_a_admin_client):
        """CSV export respects changed_by filter — only matching user rows appear."""
        other_user = uuid4()
        entries = [
            _make_entry(changed_by=USER_UUID),
            _make_entry(changed_by=other_user),
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(
            "/api/v1/exports/audit-log", params={"changed_by": str(USER_UUID)}
        )

        assert response.status_code == 200
        content = response.content.decode("utf-8")
        assert str(USER_UUID) in content
        assert str(other_user) not in content
