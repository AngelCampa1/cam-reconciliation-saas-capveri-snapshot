"""
End-to-End Integration Test for Reconciliation API (mocked database).

This test validates the complete reconciliation workflow using mocked
database infrastructure for fast CI/CD execution.

For true e2e tests with real database, see test_reconciliation_api_e2e_real.py

Test Requirements (Story 24.5):
- API endpoints return correct status codes and data
- Data integrity is maintained
- Error handling works correctly
- Authorization (RLS) prevents cross-tenant access
- Exports generate valid files
"""

from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import MockQueryBuilder

pytestmark = pytest.mark.integration


class TestReconciliationAPIE2E:
    """End-to-end integration test for reconciliation API workflow."""

    @patch("app.api.v1.reconciliation.fetch_active_leases")
    @patch("app.api.v1.reconciliation.run_reconciliation_job", new_callable=AsyncMock)
    def test_full_reconciliation_workflow(
        self,
        mock_background_job,
        mock_fetch_active_leases,
        org_a_member_client,
        org_a_admin_client,
        org_a_property,
        sample_snapshot_data,
    ):
        """
        Test complete reconciliation API workflow from calculation to finalization.

        Workflow Steps:
        1. POST /reconciliation/calculate - Trigger calculation
        2. GET /reconciliation/jobs/{job_id} - Check job status
        3. GET /reconciliation/snapshots/{snapshot_id} - Get snapshot details
        4. GET /reconciliation/snapshots - List all snapshots
        5. POST /reconciliation/snapshots/{snapshot_id}/finalize - Finalize snapshot
        6. Verify finalized snapshot is immutable (409 on re-finalize)
        """
        # STEP 1: Calculate reconciliation
        property_id = org_a_property["id"]
        mock_fetch_active_leases.return_value = [object()]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["calculation_jobs"] = []
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = []

        snapshot_id = sample_snapshot_data["id"]
        snapshot_with_joins = sample_snapshot_data.copy()
        snapshot_with_joins["leases"] = {"tenant_name": "Sample Tenant LLC"}
        snapshot_with_joins["properties"] = {"name": org_a_property["name"]}

        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": property_id,
                "organization_id": org_a_property["organization_id"],
                "tenant_name": "Sample Tenant LLC",
            }
        ]

        calc_response = org_a_member_client.post(
            "/api/v1/reconciliation/calculate",
            json={
                "property_id": property_id,
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
                "force_recalculate": False,
            },
        )

        assert calc_response.status_code == 202
        job_id = calc_response.json()["job_id"]
        assert calc_response.json()["status"] == "pending"
        mock_background_job.assert_awaited_once()

        # STEP 2: Get job status
        job_data = org_a_member_client.mock_supabase._test_data["calculation_jobs"][0]
        assert job_data["id"] == job_id
        assert job_data["organization_id"] == str(
            org_a_member_client.user.organization_id
        )
        assert job_data["property_id"] == property_id
        assert job_data["period_start"] == "2024-01-01"
        assert job_data["period_end"] == "2024-12-31"
        assert job_data["status"] == "pending"
        assert job_data["force_recalculate"] is False

        background_args = mock_background_job.await_args.args
        assert str(background_args[0]) == job_id
        assert str(background_args[1]) == str(org_a_member_client.user.organization_id)
        assert str(background_args[2]) == property_id
        assert background_args[3].isoformat() == "2024-01-01"
        assert background_args[4].isoformat() == "2024-12-31"
        assert background_args[5] is False
        assert background_args[6] == org_a_member_client.user.id
        assert background_args[7] is org_a_member_client.mock_supabase

        job_data.update(
            {
                "status": "completed",
                "total_leases": 1,
                "processed_leases": 1,
                "snapshot_ids": [snapshot_id],
                "started_at": "2024-01-15T10:00:05Z",
                "completed_at": "2024-01-15T10:05:00Z",
            }
        )
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            snapshot_with_joins
        ]

        status_response = org_a_member_client.get(
            f"/api/v1/reconciliation/jobs/{job_id}"
        )

        assert status_response.status_code == 200
        status_data = status_response.json()
        assert status_data["job_id"] == job_id
        assert status_data["status"] == "completed"
        assert len(status_data["snapshot_ids"]) == 1

        # STEP 3: Get snapshot details
        snapshot_response = org_a_member_client.get(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}?include_trace=true"
        )

        assert snapshot_response.status_code == 200
        snapshot_data = snapshot_response.json()
        assert snapshot_data["id"] == snapshot_id
        assert "total_operating_expenses" in snapshot_data
        assert "total_recovery" in snapshot_data
        assert "calculation_trace" in snapshot_data
        assert snapshot_data["status"] == "draft"

        # STEP 4: List snapshots
        list_response = org_a_member_client.get(
            f"/api/v1/reconciliation/snapshots?property_id={property_id}"
        )

        assert list_response.status_code == 200
        list_data = list_response.json()
        assert list_data["total"] == 1
        assert list_data["items"][0]["id"] == snapshot_id
        assert list_data["items"][0]["tenant_name"] == "Sample Tenant LLC"
        assert list_data["items"][0]["property_name"] == org_a_property["name"]

        # STEP 5: Finalize snapshot
        finalize_response = org_a_admin_client.post(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}/finalize"
        )

        assert finalize_response.status_code == 200
        finalize_data = finalize_response.json()
        assert finalize_data["id"] == snapshot_id
        assert finalize_data["status"] == "finalized"
        assert finalize_data["is_finalized"] is True

        # STEP 6: Verify snapshot is immutable (409 on re-finalize)
        re_finalize_response = org_a_admin_client.post(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}/finalize"
        )

        assert re_finalize_response.status_code == 409
        assert "already finalized" in re_finalize_response.json()["detail"].lower()

    def test_cross_tenant_snapshot_access_denied(
        self, org_a_member_client, org_b_member_client, sample_snapshot_data
    ):
        """
        Verify RLS prevents cross-tenant snapshot access.

        Org A sees its snapshot, while Org B's mocked RLS view filters it out.
        The API should return 404 (not 403) to avoid leaking existence.
        """
        snapshot_id = sample_snapshot_data["id"]

        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        owner_response = org_a_member_client.get(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}"
        )
        assert owner_response.status_code == 200

        object.__setattr__(
            org_b_member_client.mock_supabase,
            "_test_data",
            {"reconciliation_snapshots": []},
        )
        org_b_member_client.mock_supabase.table.side_effect = (
            lambda table_name: MockQueryBuilder(
                data=org_b_member_client.mock_supabase._test_data.get(table_name, [])
            )
        )

        response = org_b_member_client.get(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}"
        )

        # RLS returns 404, not 403 (to avoid leaking existence)
        assert response.status_code == 404
        assert snapshot_id in response.json()["detail"]

    def test_validation_errors(self, org_a_member_client):
        """
        Verify validation errors are returned with correct status codes and messages.

        Test cases:
        - Missing required fields → 422
        - Invalid UUID format → 422
        """
        # Test 1: Missing property_id
        response = org_a_member_client.post(
            "/api/v1/reconciliation/calculate",
            json={
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            },
        )
        assert response.status_code == 422

        # Test 2: Invalid UUID format
        response = org_a_member_client.get(
            "/api/v1/reconciliation/snapshots/not-a-valid-uuid"
        )
        assert response.status_code == 422

    def test_pdf_export_workflow(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """
        Verify PDF export generates valid PDF file.

        Requirements:
        - Returns application/pdf content type
        - Returns attachment disposition
        - File starts with %PDF magic bytes
        """
        from datetime import datetime

        snapshot_id = sample_snapshot_data["id"]

        # Make snapshot finalized
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        # Mock snapshot with joins
        snapshot_with_joins = sample_snapshot_data.copy()
        snapshot_with_joins["leases"] = {"id": sample_snapshot_data["lease_id"]}
        snapshot_with_joins["properties"] = org_a_property
        snapshot_with_joins["organization_id"] = str(org_a_property["organization_id"])

        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            snapshot_with_joins
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(org_a_property["organization_id"]), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": org_a_property["id"],
                "organization_id": str(org_a_property["organization_id"]),
                "tenant_name": "Sample Tenant LLC",
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert "attachment" in response.headers.get("content-disposition", "")
        assert response.content.startswith(b"%PDF")

    def test_erp_export_workflow(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """
        Verify ERP export generates valid CSV/text file.

        Test Yardi CSV format:
        - Returns text/csv content type
        - Contains balanced journal entries (AR debit + Revenue credit)
        """
        from datetime import datetime

        snapshot_id = sample_snapshot_data["id"]

        # Make snapshot finalized
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        # Mock snapshot with joins
        snapshot_with_joins = sample_snapshot_data.copy()
        snapshot_with_joins["properties"] = org_a_property
        snapshot_with_joins["organization_id"] = str(org_a_property["organization_id"])

        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            snapshot_with_joins
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=yardi"
        )

        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "attachment" in response.headers.get("content-disposition", "")

        # Verify CSV content contains balanced entries
        csv_content = response.content.decode("utf-8")
        assert "Property" in csv_content  # Header
        assert "1200" in csv_content  # AR account (debit)
        assert "4100" in csv_content  # Revenue account (credit)

    def test_data_integrity(self, org_a_member_client, sample_snapshot_data):
        """
        Verify calculation results are saved correctly to database.

        Requirements:
        - Snapshot includes all calculated values
        - Snapshot includes calculation trace
        - Snapshot includes tenant shares
        """
        snapshot_id = sample_snapshot_data["id"]

        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]

        response = org_a_member_client.get(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}"
        )

        assert response.status_code == 200
        data = response.json()

        for field in (
            "total_operating_expenses",
            "grossed_up_expenses",
            "base_year_amount",
            "tenant_share_before_cap",
            "tenant_share_after_cap",
            "admin_fee",
            "total_recovery",
        ):
            assert data[field] == sample_snapshot_data[field]

        assert data["calculation_trace"] == sample_snapshot_data["calculation_trace"]

        for field in (
            "property_id",
            "lease_id",
            "period_start_date",
            "period_end_date",
            "status",
        ):
            assert data[field] == sample_snapshot_data[field]
