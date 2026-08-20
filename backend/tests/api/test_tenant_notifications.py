"""Tests for tenant notification API endpoints."""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi import status
from starlette.testclient import TestClient


def test_list_notifications_returns_notifications(tenant_client: TestClient) -> None:
    """Test that list_notifications returns notifications from database."""
    notification_id = uuid4()

    # Mock database response
    tenant_client.mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": str(notification_id),
                "tenant_user_id": str(tenant_client.tenant_user.id),
                "notification_type": "new_statement",
                "title": "New Statement Available",
                "message": "Your reconciliation statement is ready",
                "read_at": None,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]
    )

    response = tenant_client.get("/api/v1/tenant/notifications")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["id"] == str(notification_id)
    assert data[0]["notification_type"] == "new_statement"
    assert data[0]["read_at"] is None


def test_list_notifications_returns_empty_for_no_notifications(
    tenant_client: TestClient,
) -> None:
    """Test that list_notifications returns empty list when no notifications exist."""
    # Mock empty database response
    tenant_client.mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
        data=[]
    )

    response = tenant_client.get("/api/v1/tenant/notifications")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0


def test_list_notifications_filters_unread_only(tenant_client: TestClient) -> None:
    """Test that list_notifications filters by unread when unread_only=true."""
    # Mock database response for unread notifications
    tenant_client.mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.is_.return_value.range.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": str(uuid4()),
                "tenant_user_id": str(tenant_client.tenant_user.id),
                "notification_type": "dispute_update",
                "title": "Dispute Updated",
                "message": "Your dispute has been reviewed",
                "read_at": None,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]
    )

    response = tenant_client.get("/api/v1/tenant/notifications?unread_only=true")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["read_at"] is None


def test_mark_notification_read_updates_timestamp(tenant_client: TestClient) -> None:
    """Test that mark_notification_read sets read_at timestamp."""
    notification_id = uuid4()

    # Mock successful update
    tenant_client.mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(notification_id), "read_at": datetime.now(UTC).isoformat()}]
    )

    response = tenant_client.post(
        f"/api/v1/tenant/notifications/{notification_id}/read"
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data == {"status": "ok"}


def test_mark_notification_read_returns_404_for_nonexistent(
    tenant_client: TestClient,
) -> None:
    """Test that mark_notification_read returns 404 for nonexistent notification."""
    notification_id = uuid4()

    # Mock empty response (notification not found)
    tenant_client.mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )

    response = tenant_client.post(
        f"/api/v1/tenant/notifications/{notification_id}/read"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_mark_all_notifications_read_updates_all_unread(
    tenant_client: TestClient,
) -> None:
    """Test that mark_all_notifications_read updates all unread notifications."""
    # Mock batch update response (3 notifications marked as read)
    tenant_client.mock_supabase.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
        data=[
            {"id": str(uuid4()), "read_at": datetime.now(UTC).isoformat()},
            {"id": str(uuid4()), "read_at": datetime.now(UTC).isoformat()},
            {"id": str(uuid4()), "read_at": datetime.now(UTC).isoformat()},
        ]
    )

    response = tenant_client.post("/api/v1/tenant/notifications/read-all")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "marked_read" in data
    assert data["marked_read"] == 3


def test_mark_all_notifications_read_returns_zero_when_none_unread(
    tenant_client: TestClient,
) -> None:
    """Test that mark_all_notifications_read returns 0 when no unread notifications."""
    # Mock empty response (no unread notifications)
    tenant_client.mock_supabase.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
        data=[]
    )

    response = tenant_client.post("/api/v1/tenant/notifications/read-all")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["marked_read"] == 0


def test_get_email_preferences_returns_existing_preferences(
    tenant_client: TestClient,
) -> None:
    """Test that get_email_preferences returns existing preferences from database."""
    # Mock existing preferences
    tenant_client.mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={
            "tenant_user_id": str(tenant_client.tenant_user.id),
            "new_statement_emails": False,
            "dispute_update_emails": True,
            "reminder_emails": False,
            "marketing_emails": True,
            "updated_at": datetime.now(UTC).isoformat(),
        }
    )

    response = tenant_client.get("/api/v1/tenant/notifications/preferences")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["new_statement_emails"] is False
    assert data["dispute_update_emails"] is True
    assert data["reminder_emails"] is False
    assert data["marketing_emails"] is True


def test_get_email_preferences_returns_defaults_when_not_found(
    tenant_client: TestClient,
) -> None:
    """Test that get_email_preferences returns default values when no preferences exist."""
    # Mock no preferences found
    tenant_client.mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=None
    )

    response = tenant_client.get("/api/v1/tenant/notifications/preferences")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    # Default values per implementation
    assert data["new_statement_emails"] is True
    assert data["dispute_update_emails"] is True
    assert data["reminder_emails"] is True
    assert data["marketing_emails"] is False


def test_update_email_preferences_creates_new_preferences(
    tenant_client: TestClient,
) -> None:
    """Test that update_email_preferences creates new preferences if none exist."""
    # Mock no existing preferences
    tenant_client.mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=None
    )

    # Mock successful insert
    tenant_client.mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "tenant_user_id": str(tenant_client.tenant_user.id),
                "new_statement_emails": False,
                "dispute_update_emails": True,
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]
    )

    response = tenant_client.put(
        "/api/v1/tenant/notifications/preferences",
        json={"new_statement_emails": False},
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["new_statement_emails"] is False


def test_update_email_preferences_updates_existing_preferences(
    tenant_client: TestClient,
) -> None:
    """Test that update_email_preferences updates existing preferences."""
    # Mock existing preferences
    tenant_client.mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={
            "tenant_user_id": str(tenant_client.tenant_user.id),
            "new_statement_emails": True,
            "dispute_update_emails": True,
            "reminder_emails": True,
            "marketing_emails": False,
        }
    )

    # Mock successful update
    tenant_client.mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "tenant_user_id": str(tenant_client.tenant_user.id),
                "new_statement_emails": True,
                "dispute_update_emails": True,
                "reminder_emails": False,
                "marketing_emails": True,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]
    )

    response = tenant_client.put(
        "/api/v1/tenant/notifications/preferences",
        json={"reminder_emails": False, "marketing_emails": True},
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["reminder_emails"] is False
    assert data["marketing_emails"] is True


def test_notifications_require_authentication(base_client: TestClient) -> None:
    """Test that all notification endpoints require authentication."""
    # Test list notifications
    response = base_client.get("/api/v1/tenant/notifications")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # Test mark notification read
    notification_id = uuid4()
    response = base_client.post(f"/api/v1/tenant/notifications/{notification_id}/read")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # Test mark all read
    response = base_client.post("/api/v1/tenant/notifications/read-all")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # Test get preferences
    response = base_client.get("/api/v1/tenant/notifications/preferences")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # Test update preferences
    response = base_client.put(
        "/api/v1/tenant/notifications/preferences",
        json={"new_statement_emails": False},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
