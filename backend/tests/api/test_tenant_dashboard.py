"""Tests for tenant dashboard API endpoint."""

from datetime import datetime
from unittest.mock import MagicMock
from uuid import uuid4


def test_get_dashboard_returns_empty_for_no_leases(tenant_client):
    """Should return empty arrays when tenant has no leases."""
    # Mock empty lease links
    tenant_client.mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )

    response = tenant_client.get("/api/v1/tenant/dashboard")

    assert response.status_code == 200
    data = response.json()
    assert data["leases"] == []
    assert data["statements"] == []
    assert data["unread_notifications"] == 0


def test_get_dashboard_returns_leases_and_statements(tenant_client):
    """Should return leases, statements, and notification count."""
    # Mock lease links
    lease_id = "aaaa3333-3333-3333-3333-333333333333"
    property_id = "aaaa4444-4444-4444-4444-444444444444"
    unit_id = "aaaa5555-5555-5555-5555-555555555555"

    # Mock each table separately
    def table_handler(table_name):
        mock_table = MagicMock()

        if table_name == "tenant_lease_links":
            # tenant_lease_links table
            mock_select = MagicMock()
            mock_select.eq.return_value.execute.return_value = MagicMock(
                data=[{"lease_id": lease_id}]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "leases":
            # leases table
            mock_select = MagicMock()
            mock_select.in_.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": lease_id,
                        "start_date": "2024-01-01",
                        "end_date": "2024-12-31",
                        "base_year": 2023,
                        "recovery_profile": {"pro_rata_share": "0.05"},
                        "property": {
                            "id": property_id,
                            "name": "Test Building",
                            "address_line1": "123 Main St",
                            "city": "San Francisco",
                            "state": "CA",
                            "postal_code": "94105",
                        },
                        "unit": {
                            "id": unit_id,
                            "unit_number": "Suite 100",
                            "rentable_sqft": "1000.00",
                        },
                    }
                ]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "reconciliation_snapshots":
            # reconciliation_snapshots table
            mock_select = MagicMock()
            mock_select.in_.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "property": {"name": "Test Building"},
                        "period_start_date": "2024-01-01",
                        "period_end_date": "2024-12-31",
                        "tenant_share_after_cap": "5000.00",
                        "status": "finalized",
                        "created_at": "2024-01-15T00:00:00",
                        "property_id": property_id,
                    }
                ]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "disputes":
            # No active disputes -> statement stays PENDING
            mock_select = MagicMock()
            mock_select.in_.return_value.in_.return_value.execute.return_value = (
                MagicMock(data=[])
            )
            mock_table.select.return_value = mock_select

        elif table_name == "tenant_notifications":
            # tenant_notifications table
            mock_select = MagicMock()
            mock_select.eq.return_value.is_.return_value.execute.return_value = (
                MagicMock(data=[], count=3)
            )
            mock_table.select.return_value = mock_select

        return mock_table

    tenant_client.mock_supabase.table.side_effect = table_handler

    response = tenant_client.get("/api/v1/tenant/dashboard")

    assert response.status_code == 200
    data = response.json()

    # Verify leases structure
    assert len(data["leases"]) == 1
    lease = data["leases"][0]
    assert lease["id"] == lease_id
    assert lease["property"]["name"] == "Test Building"
    assert lease["unit"]["unit_number"] == "Suite 100"
    assert lease["start_date"] == "2024-01-01"
    assert lease["end_date"] == "2024-12-31"
    assert float(lease["pro_rata_share"]) == 0.05

    # Verify statements structure
    assert len(data["statements"]) == 1
    statement = data["statements"][0]
    assert "id" in statement
    assert statement["property_name"] == "Test Building"
    assert statement["status"] == "pending"
    assert (
        statement["pdf_url"]
        == "/api/v1/tenant/statements/11111111-1111-1111-1111-111111111111/pdf"
    )

    # Verify notification count
    assert data["unread_notifications"] == 3


def test_get_dashboard_marks_statement_disputed_with_active_dispute(tenant_client):
    """A finalized statement with an active dispute surfaces as DISPUTED (F-060)."""
    lease_id = "aaaa3333-3333-3333-3333-333333333333"
    property_id = "aaaa4444-4444-4444-4444-444444444444"
    unit_id = "aaaa5555-5555-5555-5555-555555555555"
    statement_id = "11111111-1111-1111-1111-111111111111"

    def table_handler(table_name):
        mock_table = MagicMock()

        if table_name == "tenant_lease_links":
            mock_select = MagicMock()
            mock_select.eq.return_value.execute.return_value = MagicMock(
                data=[{"lease_id": lease_id}]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "leases":
            mock_select = MagicMock()
            mock_select.in_.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": lease_id,
                        "start_date": "2024-01-01",
                        "end_date": "2024-12-31",
                        "base_year": 2023,
                        "recovery_profile": {"pro_rata_share": "0.05"},
                        "property": {
                            "id": property_id,
                            "name": "Test Building",
                            "address_line1": "123 Main St",
                            "city": "San Francisco",
                            "state": "CA",
                            "postal_code": "94105",
                        },
                        "unit": {
                            "id": unit_id,
                            "unit_number": "Suite 100",
                            "rentable_sqft": "1000.00",
                        },
                    }
                ]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "reconciliation_snapshots":
            mock_select = MagicMock()
            mock_select.in_.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": statement_id,
                        "property": {"name": "Test Building"},
                        "period_start_date": "2024-01-01",
                        "period_end_date": "2024-12-31",
                        "tenant_share_after_cap": "5000.00",
                        "status": "finalized",
                        "created_at": "2024-01-15T00:00:00",
                        "property_id": property_id,
                    }
                ]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "disputes":
            # An active (under_review) dispute references this statement
            mock_select = MagicMock()
            mock_select.in_.return_value.in_.return_value.execute.return_value = (
                MagicMock(
                    data=[{"statement_id": statement_id, "status": "under_review"}]
                )
            )
            mock_table.select.return_value = mock_select

        elif table_name == "tenant_notifications":
            mock_select = MagicMock()
            mock_select.eq.return_value.is_.return_value.execute.return_value = (
                MagicMock(data=[], count=0)
            )
            mock_table.select.return_value = mock_select

        return mock_table

    tenant_client.mock_supabase.table.side_effect = table_handler

    response = tenant_client.get("/api/v1/tenant/dashboard")

    assert response.status_code == 200
    data = response.json()
    assert len(data["statements"]) == 1
    assert data["statements"][0]["status"] == "disputed"
    # PDF URL still available for finalized statements regardless of dispute.
    assert (
        data["statements"][0]["pdf_url"]
        == f"/api/v1/tenant/statements/{statement_id}/pdf"
    )


def test_get_dashboard_requires_authentication(base_client):
    """Should return 401 when not authenticated."""
    response = base_client.get("/api/v1/tenant/dashboard")
    assert response.status_code == 401


def test_tenant_statement_pdf_download_streams_pdf(tenant_client):
    """Tenant can download a finalized statement PDF for a linked lease."""
    lease_id = "aaaa3333-3333-3333-3333-333333333333"
    statement_id = "11111111-1111-1111-1111-111111111111"
    property_id = "aaaa4444-4444-4444-4444-444444444444"

    def table_handler(table_name):
        mock_table = MagicMock()

        if table_name == "tenant_lease_links":
            mock_select = MagicMock()
            mock_select.eq.return_value.execute.return_value = MagicMock(
                data=[{"lease_id": lease_id}]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "reconciliation_snapshots":
            mock_select = MagicMock()
            mock_select.eq.return_value.in_.return_value.execute.return_value = (
                MagicMock(
                    data=[
                        {
                            "id": statement_id,
                            "organization_id": str(
                                tenant_client.tenant_user.organization_id
                            ),
                            "property_id": property_id,
                            "lease_id": lease_id,
                            "period_start_date": "2024-01-01",
                            "period_end_date": "2024-12-31",
                            "status": "finalized",
                            "finalized_at": datetime.now().isoformat(),
                            "total_operating_expenses": "150000.00",
                            "grossed_up_expenses": "157895.00",
                            "base_year_amount": "140000.00",
                            "tenant_share_before_cap": "39473.75",
                            "tenant_share_after_cap": "38289.54",
                            "admin_fee": "5743.43",
                            "total_recovery": "44032.97",
                            "calculation_trace": [],
                            "created_at": datetime.now().isoformat(),
                            "updated_at": datetime.now().isoformat(),
                        }
                    ]
                )
            )
            mock_table.select.return_value = mock_select

        elif table_name == "leases":
            mock_select = MagicMock()
            mock_select.eq.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": lease_id,
                        "property_id": property_id,
                        "tenant_name": "Test Tenant LLC",
                    }
                ]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "properties":
            mock_select = MagicMock()
            mock_select.eq.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": property_id,
                        "name": "Test Building",
                        "address_line1": "123 Main St",
                        "city": "San Francisco",
                        "state": "CA",
                        "postal_code": "94105",
                    }
                ]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "organizations":
            mock_select = MagicMock()
            mock_select.eq.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": str(tenant_client.tenant_user.organization_id),
                        "name": "Test Org",
                    }
                ]
            )
            mock_table.select.return_value = mock_select

        return mock_table

    tenant_client.mock_supabase.table.side_effect = table_handler

    response = tenant_client.get(f"/api/v1/tenant/statements/{statement_id}/pdf")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]


def test_tenant_statement_pdf_download_returns_404_without_linked_leases(
    tenant_client,
):
    """Tenant without linked leases cannot download statement PDFs."""
    statement_id = uuid4()

    links_table = MagicMock()
    links_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    tenant_client.mock_supabase.table.return_value = links_table

    response = tenant_client.get(f"/api/v1/tenant/statements/{statement_id}/pdf")

    assert response.status_code == 404


def test_tenant_statement_pdf_download_returns_404_for_unlinked_statement(
    tenant_client,
):
    """Tenant cannot download a statement outside their linked leases."""
    linked_lease_id = "aaaa3333-3333-3333-3333-333333333333"
    statement_id = uuid4()

    links_table = MagicMock()
    links_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"lease_id": linked_lease_id}]
    )

    snapshots_select = MagicMock()
    snapshots_select.eq.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[]
    )
    snapshots_table = MagicMock()
    snapshots_table.select.return_value = snapshots_select

    def table_handler(table_name):
        if table_name == "tenant_lease_links":
            return links_table
        if table_name == "reconciliation_snapshots":
            return snapshots_table
        return MagicMock()

    tenant_client.mock_supabase.table.side_effect = table_handler

    response = tenant_client.get(f"/api/v1/tenant/statements/{statement_id}/pdf")

    assert response.status_code == 404
    snapshots_select.eq.return_value.in_.assert_called_once_with(
        "lease_id", [linked_lease_id]
    )


def test_tenant_statement_pdf_download_returns_404_for_draft_statement(
    tenant_client,
):
    """Tenant cannot download a statement until it is finalized."""
    lease_id = "aaaa3333-3333-3333-3333-333333333333"
    statement_id = str(uuid4())

    def table_handler(table_name):
        mock_table = MagicMock()

        if table_name == "tenant_lease_links":
            mock_select = MagicMock()
            mock_select.eq.return_value.execute.return_value = MagicMock(
                data=[{"lease_id": lease_id}]
            )
            mock_table.select.return_value = mock_select

        elif table_name == "reconciliation_snapshots":
            mock_select = MagicMock()
            mock_select.eq.return_value.in_.return_value.execute.return_value = (
                MagicMock(
                    data=[
                        {
                            "id": statement_id,
                            "lease_id": lease_id,
                            "status": "draft",
                        }
                    ]
                )
            )
            mock_table.select.return_value = mock_select

        return mock_table

    tenant_client.mock_supabase.table.side_effect = table_handler

    response = tenant_client.get(f"/api/v1/tenant/statements/{statement_id}/pdf")

    assert response.status_code == 404
    assert not response.content.startswith(b"%PDF")
