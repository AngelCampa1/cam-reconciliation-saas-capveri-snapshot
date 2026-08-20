"""
Tests for cap bank ledger API endpoint.

GET /api/v1/reconciliation/leases/{lease_id}/cap-bank-ledger
TDD: Written before implementation.
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from tests.conftest import ORG_A_ID


@pytest.fixture
def lease_id():
    return uuid4()


@pytest.fixture
def property_id():
    return uuid4()


@pytest.fixture
def seed_lease_with_cumulative_cap(mock_supabase_client, lease_id, property_id):
    """Seed a lease with cumulative cap and finalized snapshots."""
    lease_data = {
        "id": str(lease_id),
        "property_id": str(property_id),
        "organization_id": str(ORG_A_ID),
        "tenant_name": "Acme Corp",
        "start_date": "2022-01-01",
        "end_date": "2027-12-31",
        "status": "active",
        "recovery_profile": {
            "pro_rata_share": "0.15",
            "admin_fee_percentage": "0.15",
            "cap_type": "cumulative",
            "cap_rate": "0.05",
            "base_year": 2022,
            "base_year_amount": "100000.00",
        },
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    snapshots = [
        {
            "id": str(uuid4()),
            "property_id": str(property_id),
            "organization_id": str(ORG_A_ID),
            "lease_id": str(lease_id),
            "period_start_date": "2023-01-01",
            "period_end_date": "2023-12-31",
            "status": "finalized",
            "finalized_at": "2024-02-15T00:00:00Z",
            "lease_terms_snapshot": {
                "cap_type": "cumulative",
                "cap_rate": "0.05",
                "base_year_amount": "100000.00",
            },
            "tenant_share_before_cap": "102000.00",
            "tenant_share_after_cap": "102000.00",
            "created_at": datetime.now(UTC).isoformat(),
        },
        {
            "id": str(uuid4()),
            "property_id": str(property_id),
            "organization_id": str(ORG_A_ID),
            "lease_id": str(lease_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "status": "finalized",
            "finalized_at": "2025-02-15T00:00:00Z",
            "lease_terms_snapshot": {
                "cap_type": "cumulative",
                "cap_rate": "0.05",
                "base_year_amount": "100000.00",
            },
            "tenant_share_before_cap": "108000.00",
            "tenant_share_after_cap": "108000.00",
            "created_at": datetime.now(UTC).isoformat(),
        },
    ]

    if not hasattr(mock_supabase_client, "_test_data"):
        mock_supabase_client._test_data = {}
    mock_supabase_client._test_data["leases"] = [lease_data]
    mock_supabase_client._test_data["reconciliation_snapshots"] = snapshots

    return lease_data, snapshots


@pytest.fixture
def seed_lease_without_cumulative_cap(mock_supabase_client, lease_id, property_id):
    """Seed a lease with no cumulative cap."""
    lease_data = {
        "id": str(lease_id),
        "property_id": str(property_id),
        "organization_id": str(ORG_A_ID),
        "tenant_name": "Beta Inc",
        "start_date": "2022-01-01",
        "end_date": "2027-12-31",
        "status": "active",
        "recovery_profile": {
            "pro_rata_share": "0.10",
            "admin_fee_percentage": "0.15",
            "cap_type": "none",
            "cap_rate": None,
            "base_year": None,
            "base_year_amount": None,
        },
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    if not hasattr(mock_supabase_client, "_test_data"):
        mock_supabase_client._test_data = {}
    mock_supabase_client._test_data["leases"] = [lease_data]
    mock_supabase_client._test_data["reconciliation_snapshots"] = []

    return lease_data


@pytest.fixture
def seed_lease_with_fixed_dollar_cap(mock_supabase_client, lease_id, property_id):
    """Seed a lease with cumulative cap using fixed dollar amount."""
    lease_data = {
        "id": str(lease_id),
        "property_id": str(property_id),
        "organization_id": str(ORG_A_ID),
        "tenant_name": "Delta LLC",
        "start_date": "2022-01-01",
        "end_date": "2027-12-31",
        "status": "active",
        "recovery_profile": {
            "pro_rata_share": "0.15",
            "admin_fee_percentage": "0.15",
            "cap_type": "cumulative",
            "cap_rate": None,
            "cap_fixed_amount": "5000.00",
            "base_year": 2022,
            "base_year_amount": "100000.00",
        },
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    snapshots = [
        {
            "id": str(uuid4()),
            "property_id": str(property_id),
            "organization_id": str(ORG_A_ID),
            "lease_id": str(lease_id),
            "period_start_date": "2023-01-01",
            "period_end_date": "2023-12-31",
            "status": "finalized",
            "finalized_at": "2024-02-15T00:00:00Z",
            "lease_terms_snapshot": {
                "cap_type": "cumulative",
                "cap_fixed_amount": "5000.00",
                "base_year_amount": "100000.00",
            },
            "tenant_share_before_cap": "102000.00",
            "tenant_share_after_cap": "102000.00",
            "created_at": datetime.now(UTC).isoformat(),
        },
    ]

    if not hasattr(mock_supabase_client, "_test_data"):
        mock_supabase_client._test_data = {}
    mock_supabase_client._test_data["leases"] = [lease_data]
    mock_supabase_client._test_data["reconciliation_snapshots"] = snapshots

    return lease_data, snapshots


class TestGetCapBankLedger:
    """Tests for GET /api/v1/reconciliation/leases/{lease_id}/cap-bank-ledger."""

    def test_returns_ledger_for_cumulative_cap_lease(
        self, org_a_member_client, lease_id, seed_lease_with_cumulative_cap
    ):
        response = org_a_member_client.get(
            f"/api/v1/reconciliation/leases/{lease_id}/cap-bank-ledger"
        )
        assert response.status_code == 200

        data = response.json()
        assert data["lease_id"] == str(lease_id)
        assert data["tenant_name"] == "Acme Corp"
        assert data["cap_type"] == "cumulative"
        assert data["cap_rate"] == "0.05"
        assert len(data["entries"]) == 2

        # Verify bank simulation values
        e1 = data["entries"][0]
        assert Decimal(e1["actual_expense"]) == Decimal("102000.00")
        assert Decimal(e1["bank_opening"]) == Decimal("0")
        assert Decimal(e1["bank_closing"]) == Decimal("3000.00")

    def test_returns_empty_entries_for_non_cumulative_lease(
        self, org_a_member_client, lease_id, seed_lease_without_cumulative_cap
    ):
        response = org_a_member_client.get(
            f"/api/v1/reconciliation/leases/{lease_id}/cap-bank-ledger"
        )
        assert response.status_code == 200

        data = response.json()
        assert data["entries"] == []
        assert data["current_bank_balance"] == "0"

    def test_returns_ledger_for_fixed_dollar_cap_lease(
        self, org_a_member_client, lease_id, seed_lease_with_fixed_dollar_cap
    ):
        response = org_a_member_client.get(
            f"/api/v1/reconciliation/leases/{lease_id}/cap-bank-ledger"
        )
        assert response.status_code == 200

        data = response.json()
        assert data["tenant_name"] == "Delta LLC"
        assert len(data["entries"]) == 1

        e1 = data["entries"][0]
        assert Decimal(e1["cap_threshold"]) == Decimal("105000.00")
        assert Decimal(e1["bank_closing"]) == Decimal("3000.00")

    def test_returns_404_for_nonexistent_lease(self, org_a_member_client):
        fake_id = uuid4()
        response = org_a_member_client.get(
            f"/api/v1/reconciliation/leases/{fake_id}/cap-bank-ledger"
        )
        assert response.status_code == 404
