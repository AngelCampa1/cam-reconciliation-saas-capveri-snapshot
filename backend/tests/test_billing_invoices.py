"""
Tests for billing invoice history endpoints.
"""

from collections.abc import Generator
from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as api_v1_router
from app.auth.dependencies import OrganizationContext, User, get_org_scoped_context
from app.database import get_supabase
from app.exceptions import (
    register_custom_exception_handlers,
    register_exception_handlers,
)


def create_test_app() -> FastAPI:
    """Create test app with routers."""
    app = FastAPI()
    app.include_router(api_v1_router, prefix="/api/v1")
    register_custom_exception_handlers(app)
    register_exception_handlers(app)
    return app


@pytest.fixture
def authenticated_client() -> Generator[tuple[TestClient, MagicMock], None, None]:
    """Create an authenticated test client with mocked database."""
    app = create_test_app()

    org_id = uuid4()
    user = User(
        id=uuid4(),
        organization_id=org_id,
        email="test@example.com",
        full_name="Test User",
        role="owner",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_client = MagicMock()

    ctx = OrganizationContext(
        client=mock_client,
        organization_id=org_id,
        user=user,
    )

    async def mock_get_org_context():
        return ctx

    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context
    app.dependency_overrides[get_supabase] = lambda: mock_client

    with TestClient(app) as client:
        yield client, mock_client


class TestListInvoices:
    """Test invoice listing endpoint."""

    def test_list_invoices_returns_org_invoices(self, authenticated_client):
        """Verify only organization invoices returned."""
        client, mock_client = authenticated_client
        # Mock database response
        mock_result = MagicMock()
        mock_result.data = [
            {
                "id": str(uuid4()),
                "subscription_id": str(uuid4()),
                "stripe_invoice_id": "in_test123",
                "amount_due": 99.00,
                "amount_paid": 99.00,
                "currency": "usd",
                "status": "paid",
                "period_start": "2024-01-01T00:00:00Z",
                "period_end": "2024-01-31T23:59:59Z",
                "due_date": "2024-02-01T00:00:00Z",
                "paid_at": "2024-01-15T10:00:00Z",
                "pdf_url": "https://stripe.com/invoice.pdf",
                "created_at": "2024-01-01T00:00:00Z",
            }
        ]
        mock_result.count = 1

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain = mock_chain.eq.return_value.order.return_value
        mock_chain.range.return_value.execute.return_value = mock_result

        response = client.get("/api/v1/billing/invoices")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["invoices"]) == 1
        assert data["invoices"][0]["stripe_invoice_id"] == "in_test123"

    def test_list_invoices_pagination(self, authenticated_client):
        """Verify pagination works correctly."""
        client, mock_client = authenticated_client
        # Create 25 mock invoices
        invoices = []
        for i in range(10):
            invoices.append(
                {
                    "id": str(uuid4()),
                    "subscription_id": str(uuid4()),
                    "stripe_invoice_id": f"in_test{i}",
                    "amount_due": 99.00,
                    "amount_paid": 99.00,
                    "currency": "usd",
                    "status": "paid",
                    "period_start": "2024-01-01T00:00:00Z",
                    "period_end": "2024-01-31T23:59:59Z",
                    "due_date": None,
                    "paid_at": "2024-01-15T10:00:00Z",
                    "pdf_url": "https://stripe.com/invoice.pdf",
                    "created_at": "2024-01-01T00:00:00Z",
                }
            )

        mock_result = MagicMock()
        mock_result.data = invoices
        mock_result.count = 25  # Total count

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain = mock_chain.eq.return_value.order.return_value
        mock_chain.range.return_value.execute.return_value = mock_result

        # Query page 1, per_page 10
        response = client.get("/api/v1/billing/invoices?page=1&per_page=10")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 25
        assert data["page"] == 1
        assert data["per_page"] == 10
        assert data["has_more"] is True
        assert len(data["invoices"]) == 10

    def test_list_invoices_status_filter(self, authenticated_client):
        """Verify status filter works."""
        client, mock_client = authenticated_client
        # Mock only paid invoices returned
        mock_result = MagicMock()
        mock_result.data = [
            {
                "id": str(uuid4()),
                "subscription_id": str(uuid4()),
                "stripe_invoice_id": "in_paid1",
                "amount_due": 99.00,
                "amount_paid": 99.00,
                "currency": "usd",
                "status": "paid",
                "period_start": "2024-01-01T00:00:00Z",
                "period_end": "2024-01-31T23:59:59Z",
                "due_date": None,
                "paid_at": "2024-01-15T10:00:00Z",
                "pdf_url": "https://stripe.com/invoice.pdf",
                "created_at": "2024-01-01T00:00:00Z",
            }
        ]
        mock_result.count = 1

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain = mock_chain.eq.return_value.order.return_value.eq.return_value
        mock_chain.range.return_value.execute.return_value = mock_result

        response = client.get("/api/v1/billing/invoices?status=paid")

        assert response.status_code == 200
        data = response.json()
        assert len(data["invoices"]) == 1
        assert data["invoices"][0]["status"] == "paid"


class TestGetInvoice:
    """Test single invoice retrieval."""

    def test_get_invoice_returns_invoice(self, authenticated_client):
        """Verify single invoice retrieval works."""
        client, mock_client = authenticated_client
        invoice_id = str(uuid4())
        mock_result = MagicMock()
        mock_result.data = [
            {
                "id": invoice_id,
                "subscription_id": str(uuid4()),
                "stripe_invoice_id": "in_test123",
                "amount_due": 99.00,
                "amount_paid": 99.00,
                "currency": "usd",
                "status": "paid",
                "period_start": "2024-01-01T00:00:00Z",
                "period_end": "2024-01-31T23:59:59Z",
                "due_date": None,
                "paid_at": "2024-01-15T10:00:00Z",
                "pdf_url": "https://stripe.com/invoice.pdf",
                "created_at": "2024-01-01T00:00:00Z",
            }
        ]

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain.eq.return_value.eq.return_value.execute.return_value = mock_result

        response = client.get(f"/api/v1/billing/invoices/{invoice_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == invoice_id
        assert data["stripe_invoice_id"] == "in_test123"

    def test_get_invoice_not_found(self, authenticated_client):
        """Verify 404 when invoice not found."""
        client, mock_client = authenticated_client
        invoice_id = str(uuid4())
        mock_result = MagicMock()
        mock_result.data = []

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain.eq.return_value.eq.return_value.execute.return_value = mock_result

        response = client.get(f"/api/v1/billing/invoices/{invoice_id}")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestInvoicePDF:
    """Test PDF download endpoint."""

    def test_invoice_pdf_redirect(self, authenticated_client):
        """Verify PDF endpoint redirects to Stripe."""
        client, mock_client = authenticated_client
        invoice_id = str(uuid4())
        pdf_url = "https://stripe.com/invoice.pdf"

        mock_result = MagicMock()
        mock_result.data = [{"pdf_url": pdf_url}]

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain.eq.return_value.eq.return_value.execute.return_value = mock_result

        response = client.get(
            f"/api/v1/billing/invoices/{invoice_id}/pdf", follow_redirects=False
        )

        assert response.status_code == 307  # Redirect status
        assert response.headers["location"] == pdf_url

    def test_invoice_pdf_not_available(self, authenticated_client):
        """Verify 404 when PDF not available."""
        client, mock_client = authenticated_client
        invoice_id = str(uuid4())
        mock_result = MagicMock()
        mock_result.data = [{"pdf_url": None}]

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain.eq.return_value.eq.return_value.execute.return_value = mock_result

        response = client.get(f"/api/v1/billing/invoices/{invoice_id}/pdf")

        assert response.status_code == 404
        assert "not available" in response.json()["detail"].lower()


class TestInvoiceSummary:
    """Test invoice summary endpoint."""

    def test_invoice_summary_returns_correct_totals(self, authenticated_client):
        """Verify summary endpoint returns correct totals."""
        client, mock_client = authenticated_client
        mock_result = MagicMock()
        mock_result.data = [
            {"status": "paid", "amount_paid": 99.00},
            {"status": "paid", "amount_paid": 49.00},
            {"status": "open", "amount_paid": 0.00},
            {"status": "open", "amount_paid": 0.00},
        ]

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain.eq.return_value.execute.return_value = mock_result

        response = client.get("/api/v1/billing/invoices/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total_invoices"] == 4
        assert data["paid_invoices"] == 2
        assert data["open_invoices"] == 2
        assert data["total_paid"] == 148.00
        assert data["currency"] == "usd"

    def test_invoice_summary_empty(self, authenticated_client):
        """Verify summary works with no invoices."""
        client, mock_client = authenticated_client
        mock_result = MagicMock()
        mock_result.data = []

        mock_chain = mock_client.table.return_value.select.return_value
        mock_chain.eq.return_value.execute.return_value = mock_result

        response = client.get("/api/v1/billing/invoices/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total_invoices"] == 0
        assert data["paid_invoices"] == 0
        assert data["open_invoices"] == 0
        assert data["total_paid"] == 0.0
