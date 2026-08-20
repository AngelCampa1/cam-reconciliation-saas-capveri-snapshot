"""
Dispute management endpoints for landlord admins.

Provides dispute resolution workflow for landlords to review, respond to,
and resolve tenant disputes about reconciliation statements.
All endpoints require admin authentication and are scoped to the organization.
"""

import logging
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import (
    OrgContext,
    get_current_admin_user,
    require_full_access,
)
from app.config import settings
from app.database.client import SupabaseDB, get_supabase, get_supabase_admin
from app.models.dispute import (
    AddCommentRequest,
    DisputeCommentDTO,
    DisputeDetailDTO,
    DisputeStatus,
    DisputeSummaryDTO,
    UpdateStatusRequest,
)
from app.models.user import User
from app.services.analytics.posthog import capture_backend_event
from app.services.billing.feature_usage import record_feature_use
from app.services.email import build_email_service
from app.services.extraction import StorageClient, StorageError, get_storage_client
from app.services.tenant.dispute_service import DisputeService
from app.services.tenant.notification_service import TenantNotificationService

logger = logging.getLogger(__name__)

router = APIRouter()


def get_dispute_service(db: SupabaseDB = Depends(get_supabase)) -> DisputeService:
    """Get DisputeService instance with dependencies."""
    email_service = build_email_service(settings)
    notification_service = TenantNotificationService(email_service, db)
    return DisputeService(notification_service)


def _presign_attachment(storage_client: StorageClient, storage_path: str) -> str:
    """Return a presigned GET URL for an attachment.

    Falls back to the raw storage key on StorageError so a single broken
    attachment never 500s the whole dispute fetch.
    """
    try:
        return storage_client.get_document_url(storage_path)
    except StorageError:
        logger.warning(
            "Failed to generate presigned URL for attachment %r; "
            "falling back to raw path.",
            storage_path,
            exc_info=True,
        )
        return storage_path


async def _capture_dispute_event(
    event: str,
    *,
    organization_id: str | None,
    user_id: str | None,
    distinct_id: str | None = None,
    properties: dict[str, Any] | None = None,
) -> None:
    try:
        await capture_backend_event(
            event,
            organization_id=organization_id,
            user_id=user_id,
            distinct_id=distinct_id,
            properties=properties,
        )
    except Exception:
        logger.warning("Dispute analytics capture failed for %s", event, exc_info=True)


@router.get("", response_model=list[DisputeSummaryDTO])
async def list_organization_disputes(
    ctx: OrgContext,
    status_filter: Annotated[
        DisputeStatus | None,
        Query(alias="status", description="Filter by dispute status"),
    ] = None,
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum records to return")
    ] = 50,
) -> list[DisputeSummaryDTO]:
    """
    List all disputes for the organization.

    Returns all disputes for the authenticated user's organization,
    optionally filtered by status. Results are ordered by creation time
    (newest first) and paginated.

    Args:
        ctx: Organization-scoped context with authenticated user
        status_filter: Optional status filter
        skip: Number of records to skip for pagination
        limit: Maximum number of records to return

    Returns:
        List of dispute summaries
    """
    query = ctx.table("disputes").select("*")

    if status_filter:
        query = query.eq("status", status_filter.value)

    query = query.order("created_at", desc=True).range(skip, skip + limit - 1)

    result = query.execute()

    return [
        DisputeSummaryDTO(
            id=UUID(row["id"]),
            statement_id=UUID(row["statement_id"]),
            category=row["category"],
            status=row["status"],
            description=row["description"],
            created_at=row["created_at"],
        )
        for row in result.data
    ]


@router.get("/{dispute_id}", response_model=DisputeDetailDTO)
async def get_dispute(
    dispute_id: UUID,
    ctx: OrgContext,
    storage_client: StorageClient = Depends(get_storage_client),
) -> DisputeDetailDTO:
    """
    Get dispute details including all comments and attachments.

    Returns full dispute information for landlord admins. Unlike the tenant
    endpoint, this includes internal comments visible only to landlord staff.

    Args:
        dispute_id: Dispute ID to retrieve
        ctx: Organization-scoped context with authenticated user

    Returns:
        Dispute details with comments (including internal) and attachments

    Raises:
        HTTPException: 404 if dispute not found
    """
    # Get dispute
    dispute_result = (
        ctx.table("disputes").select("*").eq("id", str(dispute_id)).execute()
    )

    if not dispute_result.data:
        raise HTTPException(status_code=404, detail="Dispute not found")

    dispute = dispute_result.data[0]

    # Get all comments (including internal ones for landlord)
    # Join with users table to get author names
    comments_result = (
        ctx.table("dispute_comments")
        .select(
            """
            id, dispute_id, content, author_id, is_internal, created_at,
            author:users!author_id(full_name)
        """
        )
        .eq("dispute_id", str(dispute_id))
        .order("created_at")
        .execute()
    )

    comments = [
        DisputeCommentDTO(
            id=UUID(row["id"]),
            dispute_id=UUID(row["dispute_id"]),
            author_id=UUID(row["author_id"]),
            author_name=(row.get("author") or {}).get("full_name") or "Unknown",
            content=row["content"],
            is_internal=row["is_internal"],
            created_at=row["created_at"],
        )
        for row in comments_result.data
    ]

    # Get attachments
    attachments_result = (
        ctx.table("dispute_attachments")
        .select("*")
        .eq("dispute_id", str(dispute_id))
        .order("created_at")
        .execute()
    )

    from app.models.dispute import DisputeAttachmentDTO

    attachments = [
        DisputeAttachmentDTO(
            id=UUID(row["id"]),
            filename=row["filename"],
            file_url=_presign_attachment(
                storage_client, row.get("file_url") or row["storage_path"]
            ),
            file_size_bytes=row.get("file_size_bytes") or row["file_size"],
            content_type=row.get("content_type") or row["mime_type"],
            created_at=row["created_at"],
        )
        for row in attachments_result.data
    ]

    return DisputeDetailDTO(
        id=UUID(dispute["id"]),
        tenant_user_id=UUID(dispute["tenant_user_id"]),
        statement_id=UUID(dispute["statement_id"]),
        organization_id=UUID(dispute["organization_id"]),
        category=dispute["category"],
        description=dispute["description"],
        status=dispute["status"],
        assigned_to=UUID(dispute["assigned_to"]) if dispute["assigned_to"] else None,
        resolution_summary=dispute.get("resolution_summary"),
        resolved_at=dispute.get("resolved_at"),
        resolved_by=(
            UUID(dispute["resolved_by"]) if dispute.get("resolved_by") else None
        ),
        created_at=dispute["created_at"],
        updated_at=dispute["updated_at"],
        comments=comments,
        attachments=attachments,
    )


@router.put(
    "/{dispute_id}/status",
    response_model=DisputeSummaryDTO,
    dependencies=[Depends(require_full_access)],
)
async def update_dispute_status(
    dispute_id: UUID,
    request: UpdateStatusRequest,
    ctx: OrgContext,
    user: Annotated[User, Depends(get_current_admin_user)],
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    dispute_service: Annotated[DisputeService, Depends(get_dispute_service)],
) -> DisputeSummaryDTO:
    """
    Update dispute status (admin only).

    Allows landlord admins to transition dispute through the workflow:
    OPEN → UNDER_REVIEW → RESOLVED/REJECTED → CLOSED

    When resolving or rejecting, a resolution summary is required.

    Args:
        dispute_id: Dispute ID to update
        request: Status update request with new status and optional resolution summary
        ctx: Organization-scoped context
        user: Current admin user
        db: Supabase client
        dispute_service: Dispute service instance

    Returns:
        Updated dispute summary

    Raises:
        HTTPException: 404 if dispute not found, 400 if invalid state transition
    """
    try:
        dispute = await dispute_service.update_status(
            dispute_id=dispute_id,
            new_status=request.status,
            resolution_summary=request.resolution_summary,
            resolved_by=user.id,
            db=db,
        )

        record_feature_use(
            get_supabase_admin(), str(ctx.organization_id), "dispute_system"
        )
        await _capture_dispute_event(
            "landlord_dispute_status_changed",
            organization_id=str(ctx.organization_id),
            user_id=str(user.id),
            distinct_id=f"user:{user.id}",
            properties={
                "dispute_id": dispute["id"],
                "statement_id": dispute["statement_id"],
                "category": dispute["category"],
                "new_status": dispute["status"],
            },
        )

        return DisputeSummaryDTO(
            id=UUID(dispute["id"]),
            statement_id=UUID(dispute["statement_id"]),
            category=dispute["category"],
            status=dispute["status"],
            description=dispute["description"],
            created_at=dispute["created_at"],
        )
    except ValueError as e:
        if str(e) == "Dispute not found":
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{dispute_id}/comments",
    response_model=DisputeCommentDTO,
    status_code=201,
    dependencies=[Depends(require_full_access)],
)
async def add_admin_comment(
    dispute_id: UUID,
    request: AddCommentRequest,
    ctx: OrgContext,
    user: Annotated[User, Depends(get_current_admin_user)],
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    dispute_service: Annotated[DisputeService, Depends(get_dispute_service)],
) -> DisputeCommentDTO:
    """
    Add a comment to a dispute (admin can mark as internal).

    Landlord admins can add both public and internal comments.
    Internal comments are visible only to landlord staff and hidden from tenants.

    Args:
        dispute_id: Dispute ID to comment on
        request: Comment request with content and internal flag
        ctx: Organization-scoped context
        user: Current admin user
        db: Supabase client
        dispute_service: Dispute service instance

    Returns:
        Created comment

    Raises:
        HTTPException: 404 if dispute not found
    """
    try:
        comment = await dispute_service.add_comment(
            dispute_id=dispute_id,
            author_id=user.id,
            content=request.content,
            is_internal=request.is_internal,
            db=db,
        )
        await _capture_dispute_event(
            "landlord_dispute_comment_added",
            organization_id=str(ctx.organization_id),
            user_id=str(user.id),
            distinct_id=f"user:{user.id}",
            properties={
                "dispute_id": comment["dispute_id"],
                "is_internal": comment["is_internal"],
            },
        )

        return DisputeCommentDTO(
            id=UUID(comment["id"]),
            dispute_id=UUID(comment["dispute_id"]),
            author_id=UUID(comment["author_id"]),
            # The commenter IS the authenticated request user, so resolve the
            # display name from `user` instead of leaving it as the "Unknown"
            # default (the GET path resolves it via a users join) (F-059).
            author_name=user.full_name or "Unknown",
            content=comment["content"],
            is_internal=comment["is_internal"],
            created_at=comment["created_at"],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
