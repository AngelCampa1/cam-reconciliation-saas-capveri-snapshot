"""
API integration tests for the Demand Letter generation endpoint.

Tests cover:
- Successful PDF generation for TX and CA
- Dispute context inclusion
- Guard: zero total_recovery -> 400
- Guard: non-finalized snapshot -> 400
- Guard: unknown snapshot -> 404
- Unauthenticated access -> 401/403
- Content-Disposition attachment header
- Invalid state value -> 422
"""

from datetime import datetime
from uuid import uuid4

from tests.conftest import ORG_A_ID, ORG_A_PROPERTY_ID

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ENDPOINT = "/api/v1/demand-letter/generate"

BASE_PAYLOAD = {
    "state": "TX",
    "landlord_name": "Jane Smith",
    "landlord_title": "Property Manager",
    "landlord_company": "Skyline Properties LLC",
    "landlord_address": "200 Congress Ave, Austin, TX 78701",
    "landlord_phone": "512-555-0100",
    "landlord_email": "jane@skyline.com",
    "payment_deadline_days": 30,
}


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _setup_data(
    client,
    snapshot_data,
    org_a_property,
    lease_id: str,
    tenant_name: str = "Test Tenant 101",
) -> None:
    client.mock_supabase._test_data["reconciliation_snapshots"] = [snapshot_data]
    client.mock_supabase._test_data["organizations"] = [
        {"id": str(ORG_A_ID), "name": "Test Org"}
    ]
    client.mock_supabase._test_data["properties"] = [org_a_property]
    client.mock_supabase._test_data["leases"] = [
        {
            "id": lease_id,
            "property_id": str(ORG_A_PROPERTY_ID),
            "organization_id": str(ORG_A_ID),
            "tenant_name": tenant_name,
        }
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestDemandLetterGenerate:
    def test_generate_tx_returns_pdf(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _setup_data(
            org_a_member_client,
            sample_snapshot_data,
            org_a_property,
            sample_snapshot_data["lease_id"],
        )

        payload = {
            **BASE_PAYLOAD,
            "snapshot_id": sample_snapshot_data["id"],
            "state": "TX",
        }
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"

    def test_generate_ca_returns_pdf(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _setup_data(
            org_a_member_client,
            sample_snapshot_data,
            org_a_property,
            sample_snapshot_data["lease_id"],
        )

        payload = {
            **BASE_PAYLOAD,
            "snapshot_id": sample_snapshot_data["id"],
            "state": "CA",
        }
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"

    def test_generate_with_dispute_context(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _setup_data(
            org_a_member_client,
            sample_snapshot_data,
            org_a_property,
            sample_snapshot_data["lease_id"],
        )

        payload = {
            **BASE_PAYLOAD,
            "snapshot_id": sample_snapshot_data["id"],
            "dispute_id": str(uuid4()),
            "dispute_filed_date": "2025-01-15",
        }
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"

    def test_generate_zero_amount_returns_400(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)
        sample_snapshot_data["total_recovery"] = "0.00"

        _setup_data(
            org_a_member_client,
            sample_snapshot_data,
            org_a_property,
            sample_snapshot_data["lease_id"],
        )

        payload = {**BASE_PAYLOAD, "snapshot_id": sample_snapshot_data["id"]}
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 400

    def test_generate_draft_snapshot_returns_400(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        sample_snapshot_data["status"] = "draft"
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _setup_data(
            org_a_member_client,
            sample_snapshot_data,
            org_a_property,
            sample_snapshot_data["lease_id"],
        )

        payload = {**BASE_PAYLOAD, "snapshot_id": sample_snapshot_data["id"]}
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 400

    def test_generate_snapshot_not_found_returns_404(self, org_a_member_client):
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = []

        payload = {**BASE_PAYLOAD, "snapshot_id": str(uuid4())}
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 404

    def test_generate_requires_auth(self, base_client):
        payload = {**BASE_PAYLOAD, "snapshot_id": str(uuid4())}
        response = base_client.post(ENDPOINT, json=payload)

        assert response.status_code in (401, 403)

    def test_generate_has_content_disposition(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _setup_data(
            org_a_member_client,
            sample_snapshot_data,
            org_a_property,
            sample_snapshot_data["lease_id"],
        )

        payload = {**BASE_PAYLOAD, "snapshot_id": sample_snapshot_data["id"]}
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 200
        assert "attachment" in response.headers.get("content-disposition", "")

    def test_generate_uses_tenant_name_in_download_filename(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _setup_data(
            org_a_member_client,
            sample_snapshot_data,
            org_a_property,
            sample_snapshot_data["lease_id"],
            tenant_name="Test Tenant 101",
        )

        payload = {**BASE_PAYLOAD, "snapshot_id": sample_snapshot_data["id"]}
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 200
        assert (
            response.headers["content-disposition"]
            == 'attachment; filename="demand-letter-Test Tenant 101.pdf"'
        )

    def test_generate_invalid_state_returns_422(
        self, org_a_member_client, sample_snapshot_data
    ):
        payload = {
            **BASE_PAYLOAD,
            "snapshot_id": sample_snapshot_data["id"],
            "state": "NY",
        }
        response = org_a_member_client.post(ENDPOINT, json=payload)

        assert response.status_code == 422
