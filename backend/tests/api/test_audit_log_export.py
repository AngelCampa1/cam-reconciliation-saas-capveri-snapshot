"""Tests for audit log export API endpoint.

Tests GET /api/v1/exports/audit-log for admin users.
"""

from datetime import UTC, datetime, timedelta

from tests.conftest import ORG_A_ID, MockQueryBuilder


class TestAuditLogExport:
    """Tests for GET /api/v1/exports/audit-log endpoint."""

    def test_export_audit_log_returns_csv(self, org_a_admin_client):
        """GET audit-log returns CSV format."""
        # Arrange: Set up mock audit log entries
        audit_entries = [
            {
                "id": 1,
                "table_name": "reconciliation_snapshots",
                "operation": "INSERT",
                "row_id": "123e4567-e89b-12d3-a456-426614174000",
                "old_data": None,
                "new_data": {"status": "draft"},
                "changed_by": "user-123",
                "changed_at": datetime.now(UTC).isoformat(),
                "organization_id": str(ORG_A_ID),
                "session_info": {},
            },
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=audit_entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_admin_client.get("/api/v1/exports/audit-log")

        # Assert
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert "attachment" in response.headers.get("content-disposition", "")

    def test_export_audit_log_requires_admin_role(self, org_a_member_client):
        """GET audit-log returns 403 for non-admin users."""
        # Act
        response = org_a_member_client.get("/api/v1/exports/audit-log")

        # Assert
        assert response.status_code == 403
        assert "Admin privileges required" in response.json()["detail"]

    def test_export_audit_log_filters_by_date_range(self, org_a_admin_client):
        """GET audit-log respects start_date and end_date filters."""
        # Arrange
        now = datetime.now(UTC)
        yesterday = now - timedelta(days=1)
        audit_entries = [
            {
                "id": 1,
                "table_name": "leases",
                "operation": "UPDATE",
                "row_id": "123e4567-e89b-12d3-a456-426614174000",
                "old_data": {"status": "draft"},
                "new_data": {"status": "finalized"},
                "changed_by": "user-123",
                "changed_at": yesterday.isoformat(),
                "organization_id": str(ORG_A_ID),
                "session_info": {},
            },
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=audit_entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_admin_client.get(
            "/api/v1/exports/audit-log",
            params={
                "start_date": (now - timedelta(days=7)).date().isoformat(),
                "end_date": now.date().isoformat(),
            },
        )

        # Assert
        assert response.status_code == 200

    def test_export_audit_log_filters_by_table_name(self, org_a_admin_client):
        """GET audit-log respects table_name filter."""
        # Arrange
        audit_entries = [
            {
                "id": 1,
                "table_name": "gl_entries",
                "operation": "INSERT",
                "row_id": "123e4567-e89b-12d3-a456-426614174000",
                "old_data": None,
                "new_data": {"amount": "1000.00"},
                "changed_by": "user-123",
                "changed_at": datetime.now(UTC).isoformat(),
                "organization_id": str(ORG_A_ID),
                "session_info": {},
            },
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=audit_entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_admin_client.get(
            "/api/v1/exports/audit-log",
            params={"table_name": "gl_entries"},
        )

        # Assert
        assert response.status_code == 200

    def test_export_audit_log_includes_csv_headers(self, org_a_admin_client):
        """CSV export includes all expected column headers."""
        # Arrange
        audit_entries = [
            {
                "id": 1,
                "table_name": "reconciliation_snapshots",
                "operation": "UPDATE",
                "row_id": "123e4567-e89b-12d3-a456-426614174000",
                "old_data": {"status": "draft"},
                "new_data": {"status": "finalized"},
                "changed_by": "user-123",
                "changed_at": datetime.now(UTC).isoformat(),
                "organization_id": str(ORG_A_ID),
                "session_info": {},
            },
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=audit_entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_admin_client.get("/api/v1/exports/audit-log")

        # Assert
        assert response.status_code == 200
        content = response.content.decode("utf-8")
        # Check CSV headers are present
        assert "table_name" in content
        assert "operation" in content
        assert "row_id" in content
        assert "changed_at" in content

    def test_export_audit_log_caps_default_row_count(self, org_a_admin_client):
        """CSV export applies a default row cap to avoid unbounded downloads."""
        audit_entries = [
            {
                "id": i,
                "table_name": "reconciliation_snapshots",
                "operation": "UPDATE",
                "row_id": "123e4567-e89b-12d3-a456-426614174000",
                "old_data": {"status": "draft"},
                "new_data": {"status": "finalized"},
                "changed_by": "user-123",
                "changed_at": datetime.now(UTC).isoformat(),
                "organization_id": str(ORG_A_ID),
                "session_info": {},
            }
            for i in range(1005)
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=audit_entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get("/api/v1/exports/audit-log")

        assert response.status_code == 200
        rows = response.content.decode("utf-8").strip().splitlines()
        assert len(rows) == 1001

    def test_export_audit_log_honors_limit(self, org_a_admin_client):
        """CSV export allows a smaller caller-provided limit."""
        audit_entries = [
            {
                "id": i,
                "table_name": "leases",
                "operation": "UPDATE",
                "row_id": "123e4567-e89b-12d3-a456-426614174000",
                "old_data": {"status": "draft"},
                "new_data": {"status": "finalized"},
                "changed_by": "user-123",
                "changed_at": datetime.now(UTC).isoformat(),
                "organization_id": str(ORG_A_ID),
                "session_info": {},
            }
            for i in range(10)
        ]

        def mock_table(table_name):
            if table_name == "audit_log":
                return MockQueryBuilder(data=audit_entries)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get("/api/v1/exports/audit-log?limit=3")

        assert response.status_code == 200
        rows = response.content.decode("utf-8").strip().splitlines()
        assert len(rows) == 4
