"""Tenant notification API endpoints."""

import logging
from datetime import UTC, datetime
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import CurrentTenantUser
from app.database.client import SupabaseDB, get_supabase
from app.models.tenant_notification import (
    TenantEmailPreferences,
    TenantEmailPreferencesUpdate,
    TenantNotification,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenant/notifications", tags=["tenant-notifications"])


@router.get("", response_model=list[TenantNotification])
async def list_notifications(
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    unread_only: bool = Query(False, description="Only return unread notifications"),
    skip: int = Query(0, ge=0, description="Number of notifications to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum notifications to return"),
) -> list[TenantNotification]:
    """List notifications for current tenant.

    RLS policies automatically enforce data isolation, ensuring tenants
    can only see their own notifications.

    Args:
        current_tenant: Authenticated tenant user
        db: Supabase client
        unread_only: If True, only return unread notifications
        skip: Number of notifications to skip for pagination
        limit: Maximum number of notifications to return

    Returns:
        List of tenant notifications ordered by creation time (newest first)
    """
    # Build query
    query = (
        db.table("tenant_notifications")
        .select("*")
        .eq("tenant_user_id", str(current_tenant.id))
        .order("created_at", desc=True)
    )

    # Filter by unread if requested
    if unread_only:
        query = query.is_("read_at", "null")

    # Apply pagination
    result = query.range(skip, skip + limit - 1).execute()

    rows = cast(list[dict[str, Any]], result.data)
    return [TenantNotification(**n) for n in rows]


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: UUID,
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
) -> dict[str, str]:
    """Mark a single notification as read.

    RLS policies automatically verify that the tenant has access to this notification.

    Args:
        notification_id: Notification ID to mark as read
        current_tenant: Authenticated tenant user
        db: Supabase client

    Returns:
        Success status

    Raises:
        HTTPException: 404 if notification not found or tenant doesn't have access
    """
    # Update notification with current timestamp
    result = (
        db.table("tenant_notifications")
        .update({"read_at": datetime.now(UTC).isoformat()})
        .eq("id", str(notification_id))
        .eq("tenant_user_id", str(current_tenant.id))
        .execute()
    )

    rows = cast(list[dict[str, Any]], result.data)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"Notification {notification_id} not found or already read",
        )

    return {"status": "ok"}


@router.post("/read-all")
async def mark_all_notifications_read(
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
) -> dict[str, int]:
    """Mark all notifications as read for current tenant.

    Updates all unread notifications for the authenticated tenant by setting
    their read_at timestamp to the current time.

    Args:
        current_tenant: Authenticated tenant user
        db: Supabase client

    Returns:
        Number of notifications marked as read
    """
    # Update all unread notifications for this tenant
    result = (
        db.table("tenant_notifications")
        .update({"read_at": datetime.now(UTC).isoformat()})
        .eq("tenant_user_id", str(current_tenant.id))
        .is_("read_at", "null")
        .execute()
    )

    rows = cast(list[dict[str, Any]], result.data)
    marked_count = len(rows) if rows else 0

    return {"marked_read": marked_count}


@router.get("/preferences", response_model=TenantEmailPreferences)
async def get_email_preferences(
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
) -> TenantEmailPreferences:
    """Get current email notification preferences.

    If no preferences exist yet, returns default preferences
    (all enabled except marketing).

    Args:
        current_tenant: Authenticated tenant user
        db: Supabase client

    Returns:
        Email preferences for current tenant
    """
    # Query existing preferences
    result = (
        db.table("tenant_email_preferences")
        .select("*")
        .eq("tenant_user_id", str(current_tenant.id))
        .maybe_single()
        .execute()
    )

    # If preferences exist, return them
    if result and result.data:
        row = cast(dict[str, Any], result.data)
        return TenantEmailPreferences(**row)

    # Return default preferences if none exist
    return TenantEmailPreferences(
        tenant_user_id=current_tenant.id,
        new_statement_emails=True,
        dispute_update_emails=True,
        reminder_emails=True,
        marketing_emails=False,
        updated_at=datetime.now(UTC),
    )


@router.put("/preferences", response_model=TenantEmailPreferences)
async def update_email_preferences(
    preferences: TenantEmailPreferencesUpdate,
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
) -> TenantEmailPreferences:
    """Update email notification preferences.

    Only updates fields that are provided (non-None) in the request.
    Creates new preferences record if none exists for this tenant.

    Args:
        preferences: Preference updates (only non-None fields will be updated)
        current_tenant: Authenticated tenant user
        db: Supabase client

    Returns:
        Updated email preferences
    """
    # Build update dict with only non-None fields
    update_data: dict[str, Any] = {
        "tenant_user_id": str(current_tenant.id),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    if preferences.new_statement_emails is not None:
        update_data["new_statement_emails"] = preferences.new_statement_emails
    if preferences.dispute_update_emails is not None:
        update_data["dispute_update_emails"] = preferences.dispute_update_emails
    if preferences.reminder_emails is not None:
        update_data["reminder_emails"] = preferences.reminder_emails
    if preferences.marketing_emails is not None:
        update_data["marketing_emails"] = preferences.marketing_emails

    # Check if preferences exist
    existing = (
        db.table("tenant_email_preferences")
        .select("*")
        .eq("tenant_user_id", str(current_tenant.id))
        .maybe_single()
        .execute()
    )

    existing_row = cast(dict[str, Any] | None, existing.data) if existing else None
    if existing_row:
        # Update existing preferences
        result = (
            db.table("tenant_email_preferences")
            .update(update_data)
            .eq("tenant_user_id", str(current_tenant.id))
            .execute()
        )
    else:
        # Insert new preferences with defaults for unspecified fields
        update_data.setdefault("new_statement_emails", True)
        update_data.setdefault("dispute_update_emails", True)
        update_data.setdefault("reminder_emails", True)
        update_data.setdefault("marketing_emails", False)

        result = db.table("tenant_email_preferences").insert(update_data).execute()

    rows = cast(list[dict[str, Any]], result.data)
    if not rows:
        raise HTTPException(
            status_code=500,
            detail="Failed to update email preferences",
        )

    return TenantEmailPreferences(**rows[0])
