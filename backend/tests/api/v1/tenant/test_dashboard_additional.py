"""Additional branch coverage for tenant dashboard endpoint logic."""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.tenant.dashboard import get_tenant_dashboard
from app.models.tenant import TenantUser


def _tenant_user() -> TenantUser:
    """Create a valid tenant user object for tests."""
    return TenantUser(
        id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        contact_name="Tenant Contact",
        contact_email="tenant@example.com",
        created_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_dashboard_returns_empty_when_lease_links_response_invalid() -> None:
    """Should short-circuit to empty dashboard when lease_links query is invalid."""
    tenant = _tenant_user()
    db = MagicMock()

    links_qb = MagicMock()
    links_qb.select.return_value.eq.return_value.execute.return_value = None

    db.table.return_value = links_qb

    result = await get_tenant_dashboard(current_tenant=tenant, db=db)
    assert result.leases == []
    assert result.statements == []
    assert result.unread_notifications == 0


@pytest.mark.asyncio
async def test_dashboard_handles_missing_leases_statements_and_notifications() -> None:
    """Should handle missing leases/statements/notifications responses gracefully."""
    tenant = _tenant_user()
    lease_id = uuid4()
    db = MagicMock()

    links_qb = MagicMock()
    links_qb.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"lease_id": str(lease_id)}]
    )

    leases_qb = MagicMock()
    leases_qb.select.return_value.in_.return_value.execute.return_value = None

    def table_side_effect(name: str) -> object:
        return {
            "tenant_lease_links": links_qb,
            "leases": leases_qb,
        }.get(name, MagicMock())

    db.table.side_effect = table_side_effect

    result = await get_tenant_dashboard(current_tenant=tenant, db=db)
    assert result.leases == []
    assert result.statements == []
    assert result.unread_notifications == 0


@pytest.mark.asyncio
async def test_dashboard_returns_only_finalized_statements_and_unread_count() -> None:
    """Should expose tenant statements only after landlord finalization."""
    tenant = _tenant_user()
    lease_id = uuid4()
    property_id = uuid4()
    unit_id = uuid4()
    db = MagicMock()

    links_qb = MagicMock()
    links_qb.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"lease_id": str(lease_id)}]
    )

    leases_qb = MagicMock()
    leases_qb.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": str(lease_id),
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "recovery_profile": {"pro_rata_share": "0.15", "base_year": 2023},
                "property": {
                    "id": str(property_id),
                    "name": "Office Tower",
                    "address_line1": "123 Main",
                    "city": "Austin",
                    "state": "TX",
                    "postal_code": "78701",
                },
                "unit": {
                    "id": str(unit_id),
                    "unit_number": "100",
                    "rentable_sqft": "1500",
                },
            }
        ]
    )

    statements_qb = MagicMock()
    finalized_statement_id = uuid4()
    (
        statements_qb.select.return_value.in_.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value
    ) = MagicMock(
        data=[
            {
                "id": str(finalized_statement_id),
                "property": {"name": "Office Tower"},
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "tenant_share_after_cap": "1100.00",
                "status": "finalized",
                "created_at": "2024-02-02T00:00:00",
            },
        ]
    )

    disputes_qb = MagicMock()
    (
        disputes_qb.select.return_value.in_.return_value.in_.return_value.execute.return_value
    ) = MagicMock(data=[])

    notifications_qb = MagicMock()
    (
        notifications_qb.select.return_value.eq.return_value.is_.return_value.execute.return_value
    ) = MagicMock(count=3)

    def table_side_effect(name: str) -> object:
        return {
            "tenant_lease_links": links_qb,
            "leases": leases_qb,
            "reconciliation_snapshots": statements_qb,
            "disputes": disputes_qb,
            "tenant_notifications": notifications_qb,
        }[name]

    db.table.side_effect = table_side_effect

    result = await get_tenant_dashboard(current_tenant=tenant, db=db)
    assert len(result.leases) == 1
    assert len(result.statements) == 1
    # No active dispute -> statement remains PENDING (F-060).
    assert result.statements[0].status.value == "pending"
    assert (
        result.statements[0].pdf_url
        == f"/api/v1/tenant/statements/{finalized_statement_id}/pdf"
    )
    statements_qb.select.return_value.in_.return_value.eq.assert_called_once_with(
        "status", "finalized"
    )
    assert result.unread_notifications == 3


@pytest.mark.asyncio
async def test_dashboard_raises_http_500_on_unexpected_error() -> None:
    """Should wrap unexpected exceptions in HTTPException 500."""
    tenant = _tenant_user()
    db = MagicMock()
    db.table.side_effect = RuntimeError("database offline")

    with pytest.raises(HTTPException) as exc_info:
        await get_tenant_dashboard(current_tenant=tenant, db=db)

    assert exc_info.value.status_code == 500
    # The error detail must NOT leak internal exception text to the client.
    assert "RuntimeError" not in exc_info.value.detail
    assert "database offline" not in exc_info.value.detail
    assert exc_info.value.detail == "Unable to load dashboard data. Please try again."


@pytest.mark.asyncio
async def test_dashboard_handles_building_wide_lease_and_null_property_embed() -> None:
    """Building-wide leases (null unit) and a null statement property embed.

    A lease with unit_id NULL is a legitimate building-wide lease, and the
    tenant's RLS grant can leave the statement's embedded property null. The
    dashboard must render unit=None and fall back to the lease-derived property
    name instead of crashing (F-294).
    """
    tenant = _tenant_user()
    lease_id = uuid4()
    property_id = uuid4()
    statement_id = uuid4()
    db = MagicMock()

    links_qb = MagicMock()
    links_qb.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"lease_id": str(lease_id)}]
    )

    leases_qb = MagicMock()
    leases_qb.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": str(lease_id),
                "start_date": "2023-01-01",
                "end_date": "2028-12-31",
                "recovery_profile": {"pro_rata_share": "0.0485"},
                "property": {
                    "id": str(property_id),
                    "name": "Test Plaza Shopping Center",
                    "address_line1": "123 Test Street",
                    "city": "Test City",
                    "state": "CA",
                    "postal_code": "90210",
                },
                # Building-wide lease: no unit linked.
                "unit": None,
            }
        ]
    )

    statements_qb = MagicMock()
    (
        statements_qb.select.return_value.in_.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value
    ) = MagicMock(
        data=[
            {
                "id": str(statement_id),
                # Embedded property comes back null under tenant RLS.
                "property": None,
                "property_id": str(property_id),
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "2500.00",
                "status": "finalized",
                "created_at": "2026-06-04T00:00:00",
            },
        ]
    )

    disputes_qb = MagicMock()
    (
        disputes_qb.select.return_value.in_.return_value.in_.return_value.execute.return_value
    ) = MagicMock(data=[])

    notifications_qb = MagicMock()
    (
        notifications_qb.select.return_value.eq.return_value.is_.return_value.execute.return_value
    ) = MagicMock(count=0)

    def table_side_effect(name: str) -> object:
        return {
            "tenant_lease_links": links_qb,
            "leases": leases_qb,
            "reconciliation_snapshots": statements_qb,
            "disputes": disputes_qb,
            "tenant_notifications": notifications_qb,
        }[name]

    db.table.side_effect = table_side_effect

    result = await get_tenant_dashboard(current_tenant=tenant, db=db)

    assert len(result.leases) == 1
    # Building-wide lease renders with no unit.
    assert result.leases[0].unit is None
    assert len(result.statements) == 1
    # Null embed falls back to the lease-derived property name, not a crash.
    assert result.statements[0].property_name == "Test Plaza Shopping Center"
