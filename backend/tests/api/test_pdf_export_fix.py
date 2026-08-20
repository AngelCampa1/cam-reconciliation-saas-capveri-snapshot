"""Tests for PDF export endpoint fix.

Tests GET /api/v1/exports/reconciliation/snapshots/{id}/export/pdf
"""

from uuid import uuid4

from tests.conftest import ORG_A_ID, MockQueryBuilder


class TestPDFExportFix:
    """Tests for PDF export endpoint."""

    def test_pdf_export_returns_200_for_finalized_snapshot(self, org_a_member_client):
        """PDF export succeeds for finalized snapshot."""
        snapshot_id = str(uuid4())
        lease_id = str(uuid4())
        property_id = str(uuid4())

        # Mock data
        snapshot_data = {
            "id": snapshot_id,
            "lease_id": lease_id,
            "property_id": property_id,
            "status": "finalized",
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "total_operating_expenses": "100000.00",
            "grossed_up_expenses": "105000.00",
            "base_year_amount": "90000.00",
            "tenant_share_before_cap": "15000.00",
            "tenant_share_after_cap": "15000.00",
            "admin_fee": "2250.00",
            "total_recovery": "17250.00",
            "calculation_trace": [],
            "organization_id": str(ORG_A_ID),
        }

        lease_data = {
            "id": lease_id,
            "property_id": property_id,
        }

        property_data = {
            "id": property_id,
            "organization_id": str(ORG_A_ID),
            "name": "Test Property",
            "address": "123 Main St",
        }

        org_data = {
            "id": str(ORG_A_ID),
            "name": "Test Organization",
        }

        def mock_table(table_name):
            if table_name == "reconciliation_snapshots":
                return MockQueryBuilder(data=[snapshot_data])
            elif table_name == "leases":
                return MockQueryBuilder(data=[lease_data])
            elif table_name == "properties":
                return MockQueryBuilder(data=[property_data])
            elif table_name == "organizations":
                return MockQueryBuilder(data=[org_data])
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        # Assert
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert "attachment" in response.headers.get("content-disposition", "")

    def test_pdf_export_returns_404_for_missing_snapshot(self, org_a_member_client):
        """PDF export returns 404 for non-existent snapshot."""
        snapshot_id = str(uuid4())

        def mock_table(table_name):
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        # Assert
        assert response.status_code == 404

    def test_pdf_export_requires_finalized_by_default(self, org_a_member_client):
        """PDF export returns 400 for draft snapshot without allow_draft."""
        snapshot_id = str(uuid4())
        lease_id = str(uuid4())
        property_id = str(uuid4())

        snapshot_data = {
            "id": snapshot_id,
            "lease_id": lease_id,
            "property_id": property_id,
            "status": "draft",  # Draft status
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "total_operating_expenses": "100000.00",
            "grossed_up_expenses": "105000.00",
            "base_year_amount": "90000.00",
            "tenant_share_before_cap": "15000.00",
            "tenant_share_after_cap": "15000.00",
            "admin_fee": "2250.00",
            "total_recovery": "17250.00",
            "calculation_trace": [],
            "organization_id": str(ORG_A_ID),
        }

        property_data = {
            "id": property_id,
            "organization_id": str(ORG_A_ID),
        }

        def mock_table(table_name):
            if table_name == "reconciliation_snapshots":
                return MockQueryBuilder(data=[snapshot_data])
            if table_name == "properties":
                return MockQueryBuilder(data=[property_data])
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        # Assert
        assert response.status_code == 400
        assert "draft" in response.json()["detail"].lower()

    def test_pdf_export_allows_draft_with_flag(self, org_a_member_client):
        """PDF export succeeds for draft snapshot with allow_draft=true."""
        snapshot_id = str(uuid4())
        lease_id = str(uuid4())
        property_id = str(uuid4())

        snapshot_data = {
            "id": snapshot_id,
            "lease_id": lease_id,
            "property_id": property_id,
            "status": "draft",
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "total_operating_expenses": "100000.00",
            "grossed_up_expenses": "105000.00",
            "base_year_amount": "90000.00",
            "tenant_share_before_cap": "15000.00",
            "tenant_share_after_cap": "15000.00",
            "admin_fee": "2250.00",
            "total_recovery": "17250.00",
            "calculation_trace": [],
            "organization_id": str(ORG_A_ID),
        }

        lease_data = {"id": lease_id, "property_id": property_id}
        property_data = {
            "id": property_id,
            "organization_id": str(ORG_A_ID),
            "name": "Test Property",
            "address": "123 Main St",
        }
        org_data = {"id": str(ORG_A_ID), "name": "Test Organization"}

        def mock_table(table_name):
            if table_name == "reconciliation_snapshots":
                return MockQueryBuilder(data=[snapshot_data])
            elif table_name == "leases":
                return MockQueryBuilder(data=[lease_data])
            elif table_name == "properties":
                return MockQueryBuilder(data=[property_data])
            elif table_name == "organizations":
                return MockQueryBuilder(data=[org_data])
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf",
            params={"allow_draft": "true"},
        )

        # Assert
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
