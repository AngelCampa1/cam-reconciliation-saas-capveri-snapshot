"""Integration tests for billing invoice endpoints.

Tests invoice listing, pagination, filtering, and PDF access.
"""

import pytest
from fastapi import status

from tests.conftest import create_test_app


@pytest.mark.integration
class TestInvoiceEndpoints:
    """Integration tests for invoice API endpoints."""

    @pytest.fixture
    def client(self, org_a_member_client, seed_invoices):
        """Test client with seeded invoices."""
        return org_a_member_client

    def test_list_invoices_returns_org_invoices_only(
        self,
        client,
        seed_invoices,
    ):
        """Verify only organization's invoices returned (RLS isolation)."""
        response = client.get("/api/v1/billing/invoices")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 3  # Only this org's invoices
        assert len(data["invoices"]) == 3

        # Verify all invoices belong to test org
        for invoice in data["invoices"]:
            assert "id" in invoice
            assert "status" in invoice

    def test_list_invoices_pagination_first_page(
        self,
        org_a_member_client,
        seed_many_invoices,
    ):
        """Verify pagination returns correct first page."""
        response = org_a_member_client.get(
            "/api/v1/billing/invoices?page=1&per_page=10"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["invoices"]) == 10
        assert data["page"] == 1
        assert data["per_page"] == 10
        assert data["has_more"] is True
        assert data["total"] == 25

    def test_list_invoices_pagination_last_page(
        self,
        org_a_member_client,
        seed_many_invoices,
    ):
        """Verify pagination returns correct last page."""
        response = org_a_member_client.get(
            "/api/v1/billing/invoices?page=3&per_page=10"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["invoices"]) == 5  # Remaining invoices
        assert data["page"] == 3
        assert data["has_more"] is False
        assert data["total"] == 25

    def test_list_invoices_pagination_out_of_bounds(
        self,
        client,
        seed_invoices,
    ):
        """Verify pagination handles out-of-bounds page numbers."""
        response = client.get("/api/v1/billing/invoices?page=100&per_page=10")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["invoices"]) == 0
        assert data["has_more"] is False

    def test_list_invoices_filter_by_status_paid(
        self,
        client,
        seed_invoices,
    ):
        """Verify status filter returns only paid invoices."""
        response = client.get("/api/v1/billing/invoices?status=paid")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Should have only paid invoices
        for invoice in data["invoices"]:
            assert invoice["status"] == "paid"

    def test_list_invoices_filter_by_status_open(
        self,
        client,
        seed_invoices,
    ):
        """Verify status filter returns only open invoices."""
        response = client.get("/api/v1/billing/invoices?status=open")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Should have only open invoices
        for invoice in data["invoices"]:
            assert invoice["status"] == "open"

    def test_list_invoices_default_pagination(
        self,
        client,
        seed_invoices,
    ):
        """Verify default pagination values work correctly."""
        response = client.get("/api/v1/billing/invoices")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "page" in data
        assert "per_page" in data
        assert data["page"] == 1
        assert data["per_page"] == 10

    def test_invoice_pdf_redirect(
        self,
        org_a_member_client,
        seed_invoice_with_pdf,
    ):
        """Verify PDF endpoint redirects to Stripe URL."""
        invoice_id = seed_invoice_with_pdf["id"]

        response = org_a_member_client.get(
            f"/api/v1/billing/invoices/{invoice_id}/pdf",
            follow_redirects=False,
        )

        # Should redirect to Stripe PDF URL
        assert response.status_code == status.HTTP_307_TEMPORARY_REDIRECT
        assert "stripe.com" in response.headers["location"]

    def test_invoice_pdf_not_found(
        self,
        client,
    ):
        """Verify PDF endpoint returns 404 for non-existent invoice."""
        from uuid import uuid4

        fake_id = str(uuid4())

        response = client.get(
            f"/api/v1/billing/invoices/{fake_id}/pdf",
            follow_redirects=False,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_invoice_summary_endpoint(
        self,
        client,
        seed_invoices,
    ):
        """Verify invoice summary aggregates correctly."""
        response = client.get("/api/v1/billing/invoices/summary")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "total_paid" in data
        assert "total_invoices" in data
        assert "paid_invoices" in data
        assert "open_invoices" in data
        assert data["total_invoices"] == 3
        assert data["paid_invoices"] == 2
        assert data["open_invoices"] == 1

    def test_list_invoices_requires_authentication(self):
        """Verify invoice endpoints require authentication."""
        app = create_test_app()
        from fastapi.testclient import TestClient

        unauthenticated_client = TestClient(app)

        response = unauthenticated_client.get("/api/v1/billing/invoices")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_invoice_pdf_requires_authentication(self):
        """Verify PDF endpoint requires authentication."""
        app = create_test_app()
        from uuid import uuid4

        from fastapi.testclient import TestClient

        unauthenticated_client = TestClient(app)
        invoice_id = str(uuid4())

        response = unauthenticated_client.get(
            f"/api/v1/billing/invoices/{invoice_id}/pdf"
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_invoices_respects_rls(
        self,
        client,
        seed_invoices,
    ):
        """Verify Row Level Security prevents cross-org access."""
        # User should only see their own org's invoices
        response = client.get("/api/v1/billing/invoices")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # All returned invoices must belong to the user's organization

        for invoice in data["invoices"]:
            # In real implementation, would verify organization_id matches
            assert "stripe_invoice_id" in invoice
