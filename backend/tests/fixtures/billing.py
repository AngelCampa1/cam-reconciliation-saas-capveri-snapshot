"""Test fixtures for billing integration tests.

Provides seeded subscription, invoice, and payment data for testing
the complete billing workflow.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest

from tests.conftest import ORG_A_ID, MockQueryBuilder


@pytest.fixture
def seed_subscription(mock_supabase_client):
    """Seed a growth subscription for testing.

    Returns:
        dict: Seeded subscription data
    """
    subscription_data = {
        "id": str(uuid4()),
        "organization_id": str(ORG_A_ID),
        "stripe_subscription_id": "sub_test123",
        "stripe_customer_id": "cus_test123",
        "plan": "growth",
        "status": "active",
        "current_period_start": datetime.now(UTC).isoformat(),
        "current_period_end": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        "cancel_at_period_end": False,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    # Configure mock to create a new QueryBuilder for each table() call
    # but share the same data list so updates persist
    subscription_list = [subscription_data]

    def create_mock_table(table_name):
        return MockQueryBuilder(data=subscription_list)

    mock_supabase_client.table.side_effect = create_mock_table

    return subscription_data


@pytest.fixture
def seed_subscription_canceling(mock_supabase_client):
    """Seed a subscription scheduled for cancellation.

    Returns:
        dict: Seeded subscription data with cancel_at_period_end=True
    """
    subscription_data = {
        "id": str(uuid4()),
        "organization_id": str(ORG_A_ID),
        "stripe_subscription_id": "sub_cancel123",
        "stripe_customer_id": "cus_test123",
        "plan": "professional",
        "status": "active",
        "current_period_start": datetime.now(UTC).isoformat(),
        "current_period_end": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        "cancel_at_period_end": True,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    # Configure mock to create a new QueryBuilder for each table() call
    # but share the same data list so updates persist
    subscription_list = [subscription_data]

    def create_mock_table(table_name):
        return MockQueryBuilder(data=subscription_list)

    mock_supabase_client.table.side_effect = create_mock_table

    return subscription_data


@pytest.fixture
def seed_invoices(mock_supabase_client, seed_subscription):
    """Seed multiple invoices for testing list/filter operations.

    Returns:
        list[dict]: List of seeded invoice data
    """
    invoices = []
    for i, status in enumerate(["paid", "paid", "open"]):
        invoice_data = {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "subscription_id": seed_subscription["id"],
            "stripe_invoice_id": f"in_test{i}",
            "amount_due": Decimal("99.00"),
            "amount_paid": Decimal("99.00") if status == "paid" else Decimal("0"),
            "currency": "usd",
            "status": status,
            "period_start": datetime.now(UTC).isoformat(),
            "period_end": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
            "pdf_url": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
        invoices.append(invoice_data)

    mock_supabase_client.table.return_value = MockQueryBuilder(
        data=invoices, count=len(invoices)
    )

    return invoices


@pytest.fixture
def seed_many_invoices(mock_supabase_client, seed_subscription):
    """Seed 25 invoices for pagination testing.

    Returns:
        list[dict]: List of 25 seeded invoice data
    """
    invoices = []
    for i in range(25):
        invoice_data = {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "subscription_id": seed_subscription["id"],
            "stripe_invoice_id": f"in_test{i}",
            "amount_due": Decimal("99.00"),
            "amount_paid": Decimal("99.00"),
            "currency": "usd",
            "status": "paid",
            "period_start": (datetime.now(UTC) - timedelta(days=30 * i)).isoformat(),
            "period_end": (
                datetime.now(UTC) - timedelta(days=30 * (i - 1))
            ).isoformat(),
            "pdf_url": f"https://stripe.com/invoice{i}.pdf",
            "created_at": (datetime.now(UTC) - timedelta(days=30 * i)).isoformat(),
        }
        invoices.append(invoice_data)

    mock_supabase_client.table.return_value = MockQueryBuilder(
        data=invoices, count=len(invoices)
    )

    return invoices


@pytest.fixture
def seed_invoice_with_pdf(mock_supabase_client, seed_subscription):
    """Seed a single invoice with PDF URL for download testing.

    Returns:
        dict: Seeded invoice with PDF URL
    """
    invoice_data = {
        "id": str(uuid4()),
        "organization_id": str(ORG_A_ID),
        "subscription_id": seed_subscription["id"],
        "stripe_invoice_id": "in_test_pdf",
        "amount_due": Decimal("99.00"),
        "amount_paid": Decimal("99.00"),
        "currency": "usd",
        "status": "paid",
        "period_start": datetime.now(UTC).isoformat(),
        "period_end": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        "pdf_url": "https://invoice.stripe.com/test.pdf",
        "created_at": datetime.now(UTC).isoformat(),
    }

    mock_supabase_client.table.return_value = MockQueryBuilder(data=[invoice_data])

    return invoice_data
