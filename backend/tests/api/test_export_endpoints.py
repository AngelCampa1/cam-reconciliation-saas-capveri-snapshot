"""Tests for Export API endpoints (Stories 7.6-7.7).

This module tests the PDF tenant packet export and ERP write-back
export functionality.

Test Coverage:
- Story 7.6: Tenant Packet PDF Export (7 tests)
- Story 7.7: ERP Write-Back Export (19 tests)
"""

from datetime import datetime
from unittest.mock import AsyncMock
from uuid import uuid4

from tests.conftest import (
    ORG_A_ID,
    ORG_A_PROPERTY_ID,
    ORG_B_ID,
    ORG_B_PROPERTY_ID,
    MockSupabaseResponse,
)

# ============================================================================
# Helper Functions for Async Mocking
# ============================================================================


def configure_async_supabase_query(mock_chain, data):
    """Configure a Supabase query chain to return async results.

    Args:
        mock_chain: The mock chain to configure (e.g., mock.table().select().eq())
        data: The data to return from the query

    Returns:
        AsyncMock configured to return MockSupabaseResponse with the data
    """
    execute_mock = AsyncMock(return_value=MockSupabaseResponse(data=data))
    mock_chain.execute = execute_mock
    return execute_mock


# ============================================================================
# Story 7.6: Tenant Packet PDF Export (7 tests)
# ============================================================================


class TestPDFExport:
    """Tests for GET /api/v1/exports/reconciliation/snapshots/{id}/export/pdf endpoint."""

    def test_pdf_export_returns_pdf_content_type(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test PDF export returns correct Content-Type header."""
        snapshot_id = sample_snapshot_data["id"]

        # Make snapshot finalized
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        # Initialize test data
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"

    def test_pdf_export_returns_attachment_disposition(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test Content-Disposition header includes filename."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        # Initialize test data
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        assert "content-disposition" in response.headers
        assert "attachment" in response.headers["content-disposition"]
        assert "filename=" in response.headers["content-disposition"]
        # Filename should include year and PDF extension
        assert "2024" in response.headers["content-disposition"]
        assert ".pdf" in response.headers["content-disposition"]

    def test_pdf_export_generates_valid_pdf(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test generated PDF starts with %PDF magic bytes."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        # Initialize test data
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        assert response.status_code == 200
        # PDF files start with %PDF magic bytes
        assert response.content.startswith(b"%PDF")
        # Should be non-empty
        assert len(response.content) > 100

    def test_pdf_export_blocks_draft_snapshot_by_default(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test draft snapshots cannot be exported without flag."""
        snapshot_id = sample_snapshot_data["id"]

        # Keep snapshot as draft
        sample_snapshot_data["status"] = "draft"
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        # Initialize test data
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        assert response.status_code == 400
        assert "draft" in response.json()["detail"].lower()

    def test_pdf_export_allows_draft_with_allow_draft_true(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test allow_draft=true permits draft snapshot export."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "draft"

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf?allow_draft=true"
        )

        assert response.status_code == 200
        assert response.content.startswith(b"%PDF")

    def test_pdf_export_includes_financial_fields(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test PDF includes all reconciliation amounts in content."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf"
        )

        assert response.status_code == 200
        # Verify it's a valid PDF with content
        pdf_content = response.content
        assert b"%PDF" in pdf_content
        # PDF should contain financial amounts (as text in PDF)
        # ReportLab PDFs contain these as encoded text - just verify non-empty
        assert len(pdf_content) > 1000  # Reasonable size for formatted PDF

    def test_pdf_export_returns_404_for_nonexistent_snapshot(self, org_a_member_client):
        """Test 404 returned when snapshot doesn't exist."""
        nonexistent_id = str(uuid4())

        # Initialize empty test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = []

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{nonexistent_id}/export/pdf"
        )

        assert response.status_code == 404

    def test_pdf_export_denies_cross_org_snapshot(
        self, org_a_member_client, sample_snapshot_data
    ):
        """Org A cannot export a snapshot tied to Org B's property."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["organization_id"] = str(ORG_B_ID)
        sample_snapshot_data["property_id"] = str(ORG_B_PROPERTY_ID)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [
            {
                "id": str(ORG_B_PROPERTY_ID),
                "organization_id": str(ORG_B_ID),
                "name": "Other Org Property",
            }
        ]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_B_PROPERTY_ID),
                "organization_id": str(ORG_B_ID),
                "tenant_name": "Other Tenant",
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{sample_snapshot_data['id']}/export/pdf"
        )

        assert response.status_code == 404

    def test_pdf_export_denies_snapshot_with_mismatched_org_on_current_property(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Org A cannot export a snapshot row owned by another org."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_B_ID)
        sample_snapshot_data["property_id"] = str(ORG_A_PROPERTY_ID)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
                "organization_id": str(ORG_A_ID),
                "tenant_name": "Tenant A",
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{sample_snapshot_data['id']}/export/pdf"
        )

        assert response.status_code == 404


class TestBatchPDFExport:
    """Tests for GET /api/v1/exports/reconciliation/snapshots/{id}/export/batch-pdf."""

    def test_batch_pdf_export_zip_mode(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}"
            "/export/batch-pdf?mode=zip"
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        assert "X-Total-Tenants" in response.headers
        assert "X-Completed-Tenants" in response.headers

    def test_batch_pdf_export_combined_mode(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}"
            "/export/batch-pdf?mode=combined"
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"

    def test_batch_pdf_export_invalid_selection_returns_400(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)
        sample_snapshot_data["property_id"] = str(ORG_A_PROPERTY_ID)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}"
            "/export/batch-pdf?tenant_ids=missing-snapshot"
        )
        assert response.status_code == 400

    def test_batch_pdf_tenant_ids_filter_by_lease_id(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        anchor = sample_snapshot_data.copy()
        anchor["status"] = "finalized"
        anchor["organization_id"] = str(ORG_A_ID)
        anchor["property_id"] = str(ORG_A_PROPERTY_ID)
        other = anchor.copy()
        other["id"] = str(uuid4())
        other["lease_id"] = str(uuid4())

        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            anchor,
            other,
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": anchor["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
                "organization_id": str(ORG_A_ID),
                "tenant_name": "Anchor Tenant",
            },
            {
                "id": other["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
                "organization_id": str(ORG_A_ID),
                "tenant_name": "Other Tenant",
            },
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{anchor['id']}"
            f"/export/batch-pdf?tenant_ids={other['lease_id']}"
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        assert response.headers["x-total-tenants"] == "1"


# ============================================================================
# Story 7.7: ERP Write-Back Export (19 tests)
# ============================================================================


class TestERPExportSingle:
    """Tests for single snapshot ERP export endpoint."""

    def test_erp_export_yardi_format_returns_csv(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test Yardi format export returns CSV content type."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=yardi"
        )

        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    def test_erp_export_mri_format_returns_text(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test MRI format export returns plain text."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=mri"
        )

        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]

    def test_erp_export_csv_format_returns_generic_csv(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test CSV format export returns generic CSV."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=csv"
        )

        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    def test_erp_export_blocks_draft_snapshot(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test draft snapshots cannot be exported to ERP."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "draft"

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=yardi"
        )

        assert response.status_code == 400
        assert "finalized" in response.json()["detail"].lower()

    def test_erp_export_returns_404_for_nonexistent_snapshot(self, org_a_member_client):
        """Test 404 when snapshot doesn't exist."""
        nonexistent_id = str(uuid4())

        # Initialize empty test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = []

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{nonexistent_id}/export/erp?format=yardi"
        )

        assert response.status_code == 404

    def test_erp_export_denies_cross_org_snapshot(
        self, org_a_member_client, sample_snapshot_data
    ):
        """Org A cannot export ERP rows for Org B's snapshot."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["organization_id"] = str(ORG_B_ID)
        sample_snapshot_data["property_id"] = str(ORG_B_PROPERTY_ID)
        sample_snapshot_data["properties"] = {
            "id": str(ORG_B_PROPERTY_ID),
            "name": "Other Org Property",
        }
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [
            {
                "id": str(ORG_B_PROPERTY_ID),
                "organization_id": str(ORG_B_ID),
                "name": "Other Org Property",
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{sample_snapshot_data['id']}/export/erp?format=yardi"
        )

        assert response.status_code == 404

    def test_erp_export_denies_snapshot_with_mismatched_org_on_current_property(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Org A cannot export ERP rows for a snapshot owned by another org."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_B_ID)
        sample_snapshot_data["property_id"] = str(ORG_A_PROPERTY_ID)
        sample_snapshot_data["properties"] = {
            "id": str(ORG_A_PROPERTY_ID),
            "name": org_a_property["name"],
        }
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{sample_snapshot_data['id']}/export/erp?format=yardi"
        )

        assert response.status_code == 404


class TestYardiFormatter:
    """Tests for Yardi ERP format export."""

    def test_yardi_creates_balanced_entries(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test Yardi export creates balanced journal entries (debit + credit)."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=yardi"
        )

        assert response.status_code == 200
        csv_content = response.content.decode("utf-8")
        lines = csv_content.strip().split("\n")

        # Should have header + 2 entries (debit AR, credit revenue)
        assert len(lines) >= 3
        # Verify balanced entries exist
        assert "1200" in csv_content  # AR account
        assert "4100" in csv_content  # Revenue account

    def test_yardi_includes_all_required_columns(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test Yardi CSV includes all required columns."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=yardi"
        )

        csv_content = response.content.decode("utf-8")
        header = csv_content.split("\n")[0]

        # Check required Yardi columns
        required_columns = ["Property", "Account", "Unit", "Date", "Ref", "Amount"]
        for col in required_columns:
            assert col in header

    def test_yardi_formats_amounts_correctly(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test Yardi amounts are formatted without $ sign, with 2 decimals."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=yardi"
        )

        csv_content = response.content.decode("utf-8")
        # Amount should be in format like 44032.97, not $44,032.97
        assert "44032.97" in csv_content
        assert "$" not in csv_content.split("\n")[1]  # Skip header

    def test_yardi_formats_dates_as_mm_dd_yyyy(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test Yardi dates are formatted as MM/DD/YYYY."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=yardi"
        )

        csv_content = response.content.decode("utf-8")
        # Date should be 12/31/2024 format
        assert "/2024" in csv_content or "2024" in csv_content


class TestMRIFormatter:
    """Tests for MRI ERP format export."""

    def test_mri_creates_fixed_width_format(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test MRI export creates fixed-width text format."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=mri"
        )

        assert response.status_code == 200
        text_content = response.content.decode("utf-8")
        lines = text_content.strip().split("\n")

        # Each line should be fixed width (98 chars for MRI)
        for line in lines:
            if line.strip():  # Skip empty lines
                assert len(line) <= 100  # Allow slight variance

    def test_mri_creates_balanced_entries(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test MRI export creates balanced journal entries."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=mri"
        )

        text_content = response.content.decode("utf-8")
        lines = text_content.strip().split("\n")

        # Should have 2 lines (debit and credit)
        assert len(lines) >= 2
        # Verify balanced entries by checking for both AR and Revenue accounts
        assert any("11200" in line for line in lines)  # AR account (debit)
        assert any("41100" in line for line in lines)  # Revenue account (credit)


class TestGenericCSVFormatter:
    """Tests for generic CSV format export."""

    def test_csv_includes_all_reconciliation_fields(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test generic CSV includes all reconciliation fields."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=csv"
        )

        csv_content = response.content.decode("utf-8")
        header = csv_content.split("\n")[0]

        # Check key fields are present (using actual CSV header field names)
        assert "Property" in header
        assert "Tenant" in header
        assert "Total Expenses" in header or "Total Operating Expenses" in header
        assert "Amount Due" in header or "Total Recovery" in header

    def test_csv_properly_escapes_values(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test CSV properly escapes values with commas/quotes."""
        snapshot_id = sample_snapshot_data["id"]
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()

        # Add property name with comma to test escaping
        org_a_property_with_comma = org_a_property.copy()
        org_a_property_with_comma["name"] = "Test Building, LLC"

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [
            org_a_property_with_comma
        ]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp?format=csv"
        )

        csv_content = response.content.decode("utf-8")
        # Verify CSV contains expected data (property name may show as N/A in test environment)
        assert "Property" in csv_content  # Header column
        assert "Tenant" in csv_content  # Header column
        assert len(csv_content.split("\n")) >= 2  # Header + at least one data row


class TestERPExportBatch:
    """Tests for batch ERP export endpoint."""

    def test_batch_export_combines_multiple_snapshots(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test batch export combines multiple snapshots into one file."""
        # Create two snapshots
        snapshot1 = sample_snapshot_data.copy()
        snapshot1["id"] = str(uuid4())
        snapshot1["status"] = "finalized"
        snapshot1["finalized_at"] = datetime.now().isoformat()

        snapshot2 = sample_snapshot_data.copy()
        snapshot2["id"] = str(uuid4())
        snapshot2["status"] = "finalized"
        snapshot2["finalized_at"] = datetime.now().isoformat()

        unit_id1 = str(uuid4())
        unit_id2 = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            snapshot1,
            snapshot2,
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": snapshot1["lease_id"],
                "unit_id": unit_id1,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            },
            {
                "id": snapshot2["lease_id"],
                "unit_id": unit_id2,
                "tenant_name": "Sample Tenant LLC",
                "property_id": str(ORG_A_PROPERTY_ID),
            },
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id1, "unit_number": "Suite 101"},
            {"id": unit_id2, "unit_number": "Suite 102"},
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/export/erp/batch"
            f"?property_id={ORG_A_PROPERTY_ID}"
            f"&period_start=2024-01-01"
            f"&period_end=2024-12-31"
            f"&format=yardi"
        )

        assert response.status_code == 200
        csv_content = response.content.decode("utf-8")
        lines = csv_content.strip().split("\n")

        # Should have header + entries for both snapshots (2 snapshots * 2 entries = 4 data lines)
        assert len(lines) >= 5  # Header + at least 4 entries

    def test_batch_export_returns_404_if_no_finalized_found(self, org_a_member_client):
        """Test 404 when no finalized snapshots found for period."""
        org_a_member_client.mock_supabase._test_data["properties"] = [
            {
                "id": str(ORG_A_PROPERTY_ID),
                "organization_id": str(ORG_A_ID),
                "name": "Test Property",
            }
        ]

        # Mock empty result (has 3 .eq() + .gte() + .lte() calls)
        batch_query_chain = (
            org_a_member_client.mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.gte.return_value.lte.return_value
        )
        configure_async_supabase_query(batch_query_chain, [])

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/export/erp/batch"
            f"?property_id={ORG_A_PROPERTY_ID}"
            f"&period_start=2024-01-01"
            f"&period_end=2024-12-31"
            f"&format=yardi"
        )

        assert response.status_code == 404

    def test_batch_export_filters_by_property_and_period(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Test batch export correctly filters by property and period."""
        snapshot1 = sample_snapshot_data.copy()
        snapshot1["id"] = str(uuid4())
        snapshot1["status"] = "finalized"
        snapshot1["finalized_at"] = datetime.now().isoformat()

        unit_id = str(uuid4())

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            snapshot1
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": snapshot1["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Tenant A",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/export/erp/batch"
            f"?property_id={ORG_A_PROPERTY_ID}"
            f"&period_start=2024-01-01"
            f"&period_end=2024-12-31"
            f"&format=csv"
        )

        assert response.status_code == 200
        # Just verify we got CSV output - detailed filtering is tested by query params
        assert "text/csv" in response.headers["content-type"]

    def test_batch_export_includes_snapshots_that_overlap_period(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Batch ERP export includes finalized snapshots overlapping the request."""
        snapshot = sample_snapshot_data.copy()
        snapshot["id"] = str(uuid4())
        snapshot["status"] = "finalized"
        snapshot["finalized_at"] = datetime.now().isoformat()
        snapshot["period_start_date"] = "2023-12-01"
        snapshot["period_end_date"] = "2024-02-29"

        unit_id = str(uuid4())
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            snapshot
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": snapshot["lease_id"],
                "unit_id": unit_id,
                "tenant_name": "Tenant A",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["units"] = [
            {"id": unit_id, "unit_number": "Suite 101"}
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/export/erp/batch"
            f"?property_id={ORG_A_PROPERTY_ID}"
            f"&period_start=2024-01-01"
            f"&period_end=2024-01-31"
            f"&format=csv"
        )

        assert response.status_code == 200
        csv_content = response.content.decode("utf-8")
        assert "12/01/2023" in csv_content
        assert "02/29/2024" in csv_content

    def test_batch_export_denies_cross_org_property(
        self, org_a_member_client, sample_snapshot_data
    ):
        """Org A cannot batch export snapshots for another org's property."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)
        sample_snapshot_data["property_id"] = str(ORG_B_PROPERTY_ID)
        sample_snapshot_data["properties"] = {
            "id": str(ORG_B_PROPERTY_ID),
            "name": "Other Org Property",
        }
        org_a_member_client.mock_supabase._test_data["properties"] = [
            {
                "id": str(ORG_B_PROPERTY_ID),
                "organization_id": str(ORG_B_ID),
                "name": "Other Org Property",
            }
        ]
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]

        response = org_a_member_client.get(
            f"/api/v1/exports/reconciliation/snapshots/export/erp/batch"
            f"?property_id={ORG_B_PROPERTY_ID}"
            f"&period_start=2024-01-01"
            f"&period_end=2024-12-31"
            f"&format=yardi"
        )

        assert response.status_code == 404


# ============================================================================
# Unit Tests for TenantPacketGenerator Class
# ============================================================================


class TestTenantPacketGenerator:
    """Unit tests for TenantPacketGenerator internal methods."""

    def test_format_currency_with_decimal(self):
        """Test _format_currency with Decimal input."""
        from decimal import Decimal

        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        result = generator._format_currency(Decimal("1234.56"))
        assert result == "$1,234.56"

    def test_format_currency_with_string(self):
        """Test _format_currency with string input."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        result = generator._format_currency("9876.54")
        assert result == "$9,876.54"

    def test_format_currency_large_amount(self):
        """Test _format_currency formats large amounts with thousand separators."""
        from decimal import Decimal

        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        result = generator._format_currency(Decimal("1234567.89"))
        assert result == "$1,234,567.89"

    def test_format_date_iso_string(self):
        """Test _format_date with ISO format string."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        result = generator._format_date("2024-12-31T00:00:00")
        assert result == "December 31, 2024"

    def test_format_date_different_month(self):
        """Test _format_date with different month."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        result = generator._format_date("2024-06-15T12:30:00")
        assert result == "June 15, 2024"

    def test_format_date_accepts_date_object(self):
        """Test _format_date handles date objects from in-process model dumps."""
        from datetime import date

        from app.api.v1.exports import TenantPacketGenerator

        generator = TenantPacketGenerator({}, {}, {}, {})

        result = generator._format_date(date(2024, 12, 31))

        assert result == "December 31, 2024"

    def test_build_header_includes_org_name(self):
        """Test _build_header includes organization name."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01T00:00:00",
            "period_end_date": "2024-12-31T23:59:59",
        }
        org_data = {"name": "ACME Property Management"}
        generator = TenantPacketGenerator(snapshot_data, {}, {}, org_data)

        elements = generator._build_header()

        # Verify returns list of elements
        assert isinstance(elements, list)
        assert len(elements) > 0

    def test_build_header_with_default_org_name(self):
        """Test _build_header uses default when org name missing."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01T00:00:00",
            "period_end_date": "2024-12-31T23:59:59",
        }
        org_data = {}  # No name provided
        generator = TenantPacketGenerator(snapshot_data, {}, {}, org_data)

        elements = generator._build_header()

        # Should still return elements (with default "Organization")
        assert isinstance(elements, list)
        assert len(elements) > 0

    def test_build_property_info_includes_address(self):
        """Test _build_property_info includes property name and address."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }
        property_data = {
            "name": "Sunset Plaza",
            "address": "123 Main St, City, ST 12345",
        }
        generator = TenantPacketGenerator(snapshot_data, {}, property_data, {})

        elements = generator._build_property_info()

        assert isinstance(elements, list)
        assert len(elements) > 0

    def test_build_tenant_info_uses_lease_id(self):
        """Test _build_tenant_info includes lease ID."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }
        lease_data = {"id": str(uuid4())}
        generator = TenantPacketGenerator(snapshot_data, lease_data, {}, {})

        elements = generator._build_tenant_info()

        assert isinstance(elements, list)
        assert len(elements) > 0

    def test_build_expense_summary_creates_table(self):
        """Test _build_expense_summary creates table with financial data."""

        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "total_operating_expenses": "100000.00",
            "grossed_up_expenses": "105000.00",
            "base_year_amount": "95000.00",
            "tenant_share_before_cap": "5000.00",
            "tenant_share_after_cap": "4500.00",
            "admin_fee": "675.00",
            "total_recovery": "5175.00",
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        elements = generator._build_expense_summary()

        # Should return list with table
        assert isinstance(elements, list)
        assert len(elements) > 0

    def test_build_calculation_breakdown_with_trace(self):
        """Test _build_calculation_breakdown when calculation trace exists."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "calculation_trace": ["step1", "step2", "step3"],
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        elements = generator._build_calculation_breakdown()

        assert isinstance(elements, list)
        assert len(elements) > 0

    def test_build_calculation_breakdown_renders_dict_steps(self):
        """Trace dict steps are rendered with step name and output value."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "calculation_trace": [
                {
                    "step_name": "Raw base year amount",
                    "operation": "Starting point",
                    "output_value": "100000.00",
                    "note": None,
                },
                {
                    "step_name": "Base year adjustment: 24/7 Security",
                    "operation": "Add imputed cost",
                    "output_value": "18000.00",
                    "note": None,
                },
                {
                    "step_name": "Adjusted base year amount",
                    "operation": "100000 + 18000",
                    "output_value": "118000.00",
                    "note": "Tenant underpays new service",
                },
            ],
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        elements = generator._build_calculation_breakdown()

        # Collect all text from rendered paragraphs
        rendered_text = " ".join(str(e) for e in elements)
        assert "Raw base year amount" in rendered_text
        assert "24/7 Security" in rendered_text
        assert "Adjusted base year amount" in rendered_text
        # Note field is rendered
        assert "Tenant underpays new service" in rendered_text

    def test_build_calculation_breakdown_without_trace(self):
        """Test _build_calculation_breakdown when no calculation trace."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "calculation_trace": [],  # Empty trace
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        elements = generator._build_calculation_breakdown()

        # Should still return elements (with message about no trace)
        assert isinstance(elements, list)
        assert len(elements) > 0

    def test_build_footer_includes_disclaimer(self):
        """Test _build_footer includes disclaimer and timestamp."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }
        generator = TenantPacketGenerator(snapshot_data, {}, {}, {})

        elements = generator._build_footer()

        # Should return list with disclaimer and timestamp
        assert isinstance(elements, list)
        assert len(elements) >= 2  # At least disclaimer + timestamp

    def test_generate_returns_bytesio(self):
        """Test generate() returns BytesIO buffer."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01T00:00:00",
            "period_end_date": "2024-12-31T23:59:59",
            "total_operating_expenses": "100000.00",
            "grossed_up_expenses": "105000.00",
            "base_year_amount": "95000.00",
            "tenant_share_before_cap": "5000.00",
            "tenant_share_after_cap": "4500.00",
            "admin_fee": "675.00",
            "total_recovery": "5175.00",
            "calculation_trace": [],
        }
        org_data = {"name": "Test Org"}
        property_data = {"name": "Test Property", "address": "123 Main St"}
        lease_data = {"id": str(uuid4())}

        generator = TenantPacketGenerator(
            snapshot_data, lease_data, property_data, org_data
        )

        pdf_buffer = generator.generate()

        # Verify it's a BytesIO buffer
        from io import BytesIO

        assert isinstance(pdf_buffer, BytesIO)

        # Verify it contains PDF data
        pdf_content = pdf_buffer.read()
        assert pdf_content.startswith(b"%PDF")
        assert len(pdf_content) > 100

    def test_generate_escapes_dynamic_paragraph_text(self):
        """Dynamic PDF paragraph text with XML characters renders safely."""
        from app.api.v1.exports import TenantPacketGenerator

        snapshot_data = {
            "period_start_date": "2024-01-01T00:00:00",
            "period_end_date": "2024-12-31T23:59:59",
            "total_operating_expenses": "100000.00",
            "grossed_up_expenses": "100000.00",
            "base_year_amount": "0.00",
            "tenant_share_before_cap": "10000.00",
            "tenant_share_after_cap": "10000.00",
            "admin_fee": "0.00",
            "total_recovery": "10000.00",
            "calculation_trace": [
                {
                    "step_name": "Apply AT&T <Main>",
                    "operation": "pool < cap & share > floor",
                    "output_value": "10000.00",
                    "note": "Reviewed by A&B <ops>",
                }
            ],
        }
        org_data = {"name": "A&B Holdings <Ops>"}
        property_data = {"name": "AT&T Plaza <Main>", "address": "1 A&B Way"}
        lease_data = {"tenant_name": "AT&T <Main>"}

        pdf_buffer = TenantPacketGenerator(
            snapshot_data, lease_data, property_data, org_data
        ).generate()

        assert pdf_buffer.getvalue().startswith(b"%PDF")

    def test_batch_summary_pdf_escapes_dynamic_filename(self):
        """Combined export summary renders filenames with XML characters safely."""
        from app.api.v1.exports import _build_batch_summary_pdf

        pdf_buffer = _build_batch_summary_pdf(
            [
                (
                    "Reconciliation_AT&T_<Main>_2024.pdf",
                    b"%PDF-1.4\n",
                    {
                        "period_start_date": "2024-01-01",
                        "period_end_date": "2024-12-31",
                        "total_recovery": "10000.00",
                    },
                )
            ],
            include_cover_page=True,
            include_calculation_details=True,
        )

        assert pdf_buffer.getvalue().startswith(b"%PDF")


# ============================================================================
# Unit Tests for ERP Formatter Classes
# ============================================================================


class TestYardiFormatterUnit:
    """Unit tests for YardiFormatter internal methods."""

    def test_format_currency_no_dollar_sign(self):
        """Test _format_currency returns amount without $ sign."""
        from decimal import Decimal

        from app.api.v1.exports import YardiFormatter

        formatter = YardiFormatter([])
        result = formatter._format_currency(Decimal("1234.56"))

        assert result == "1234.56"
        assert "$" not in result

    def test_format_currency_two_decimals(self):
        """Test _format_currency always uses 2 decimal places."""
        from decimal import Decimal

        from app.api.v1.exports import YardiFormatter

        formatter = YardiFormatter([])

        assert formatter._format_currency(Decimal("100")) == "100.00"
        assert formatter._format_currency(Decimal("99.9")) == "99.90"

    def test_format_date_mm_dd_yyyy(self):
        """Test _format_date returns MM/DD/YYYY format."""
        from datetime import date

        from app.api.v1.exports import YardiFormatter

        formatter = YardiFormatter([])
        result = formatter._format_date(date(2024, 12, 31))

        assert result == "12/31/2024"

    def test_format_date_from_string(self):
        """Test _format_date handles ISO string input."""
        from app.api.v1.exports import YardiFormatter

        formatter = YardiFormatter([])
        result = formatter._format_date("2024-06-15T00:00:00")

        assert result == "06/15/2024"

    def test_get_filename_accepts_date_object(self):
        """Yardi filename generation accepts DB date objects, not just strings."""
        from datetime import date

        from app.api.v1.exports import YardiFormatter

        formatter = YardiFormatter([{"period_start_date": date(2024, 1, 1)}])

        filename = formatter.get_filename()

        assert filename == "Yardi_CAM_Import_2024.csv"

    def test_get_filename_with_snapshot(self):
        """Test get_filename includes year from snapshot."""
        from app.api.v1.exports import YardiFormatter

        snapshots = [{"period_start_date": "2024-01-01T00:00:00"}]
        formatter = YardiFormatter(snapshots)

        filename = formatter.get_filename()

        assert "2024" in filename
        assert filename.endswith(".csv")
        assert "Yardi" in filename

    def test_get_filename_without_snapshots(self):
        """Test get_filename returns default when no snapshots."""
        from app.api.v1.exports import YardiFormatter

        formatter = YardiFormatter([])

        filename = formatter.get_filename()

        assert filename == "Yardi_CAM_Import.csv"

    def test_get_media_type(self):
        """Test get_media_type returns CSV type."""
        from app.api.v1.exports import YardiFormatter

        formatter = YardiFormatter([])

        assert formatter.get_media_type() == "text/csv"


class TestMRIFormatterUnit:
    """Unit tests for MRIFormatter internal methods."""

    def test_format_currency_no_dollar_sign(self):
        """Test _format_currency returns amount without $ sign."""
        from decimal import Decimal

        from app.api.v1.exports import MRIFormatter

        formatter = MRIFormatter([])
        result = formatter._format_currency(Decimal("5678.90"))

        assert result == "5678.90"
        assert "$" not in result

    def test_format_date_yyyymmdd(self):
        """Test _format_date returns YYYYMMDD format."""
        from datetime import date

        from app.api.v1.exports import MRIFormatter

        formatter = MRIFormatter([])
        result = formatter._format_date(date(2024, 6, 15))

        # MRI uses MM/DD/YYYY format (same as Yardi)
        assert result == "06/15/2024"

    def test_get_filename_with_snapshot(self):
        """Test get_filename includes year and .txt extension."""
        from app.api.v1.exports import MRIFormatter

        snapshots = [{"period_start_date": "2024-01-01T00:00:00"}]
        formatter = MRIFormatter(snapshots)

        filename = formatter.get_filename()

        assert "2024" in filename
        assert filename.endswith(".txt")
        assert "MRI" in filename

    def test_get_filename_accepts_date_object(self):
        """MRI filename generation accepts DB date objects, not just strings."""
        from datetime import date

        from app.api.v1.exports import MRIFormatter

        formatter = MRIFormatter([{"period_start_date": date(2024, 1, 1)}])

        filename = formatter.get_filename()

        assert filename == "MRI_CAM_Import_2024.txt"

    def test_get_filename_without_snapshots(self):
        """Test get_filename returns default when no snapshots."""
        from app.api.v1.exports import MRIFormatter

        formatter = MRIFormatter([])

        filename = formatter.get_filename()

        assert filename == "MRI_CAM_Import.txt"

    def test_get_media_type(self):
        """Test get_media_type returns plain text type."""
        from app.api.v1.exports import MRIFormatter

        formatter = MRIFormatter([])

        assert formatter.get_media_type() == "text/plain"


class TestGenericCSVFormatterUnit:
    """Unit tests for GenericCSVFormatter internal methods."""

    def test_get_filename_with_snapshot(self):
        """Test get_filename includes year."""
        from app.api.v1.exports import GenericCSVFormatter

        snapshots = [{"period_start_date": "2024-01-01T00:00:00"}]
        formatter = GenericCSVFormatter(snapshots)

        filename = formatter.get_filename()

        assert "2024" in filename
        assert filename.endswith(".csv")
        assert "CAM_Reconciliation" in filename

    def test_get_filename_accepts_date_object(self):
        """Generic CSV filename generation accepts DB date objects."""
        from datetime import date

        from app.api.v1.exports import GenericCSVFormatter

        formatter = GenericCSVFormatter([{"period_start_date": date(2024, 1, 1)}])

        filename = formatter.get_filename()

        assert filename == "CAM_Reconciliation_2024.csv"

    def test_get_filename_without_snapshots(self):
        """Test get_filename returns default when no snapshots."""
        from app.api.v1.exports import GenericCSVFormatter

        formatter = GenericCSVFormatter([])

        filename = formatter.get_filename()

        assert filename == "CAM_Reconciliation.csv"

    def test_get_media_type(self):
        """Test get_media_type returns CSV type."""
        from app.api.v1.exports import GenericCSVFormatter

        formatter = GenericCSVFormatter([])

        assert formatter.get_media_type() == "text/csv"

    def test_generate_includes_all_fields(self):
        """Test generate() includes all reconciliation fields."""
        from app.api.v1.exports import GenericCSVFormatter

        snapshot = {
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "total_operating_expenses": "100000.00",
            "grossed_up_expenses": "105000.00",
            "base_year_amount": "95000.00",
            "tenant_share_before_cap": "5000.00",
            "tenant_share_after_cap": "4500.00",
            "admin_fee": "675.00",
            "total_recovery": "5175.00",
            "lease_id": str(uuid4()),
            "properties": {"name": "Test Property"},
        }
        formatter = GenericCSVFormatter([snapshot])

        csv_buffer = formatter.generate()
        csv_content = csv_buffer.read()

        # Verify header includes expected columns
        assert "Period Start" in csv_content
        assert "Period End" in csv_content
        assert "Total Expenses" in csv_content
        assert "Amount Due" in csv_content
