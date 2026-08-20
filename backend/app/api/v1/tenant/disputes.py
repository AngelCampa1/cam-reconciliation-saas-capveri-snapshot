"""Tenant dispute API endpoints."""

import logging
from typing import Annotated, Any, cast
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.api.v1.uploads import read_upload_with_limit
from app.auth.dependencies import CurrentTenantUser
from app.config import settings
from app.database.client import SupabaseDB, get_supabase
from app.models.dispute import (
    AddCommentRequest,
    CreateDisputeRequest,
    DisputeAttachmentDTO,
    DisputeCommentDTO,
    DisputeDetailDTO,
    DisputeStatus,
    DisputeSummaryDTO,
    RateLimitError,
)
from app.services.analytics.posthog import capture_backend_event
from app.services.email import build_email_service
from app.services.extraction import StorageClient, StorageError, get_storage_client
from app.services.tenant.dispute_service import DisputeService
from app.services.tenant.notification_service import TenantNotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenant/disputes", tags=["tenant-disputes"])


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


def _file_size_bucket(size_bytes: int) -> str:
    size_mb = size_bytes / (1024 * 1024)
    if size_mb < 1:
        return "<1mb"
    if size_mb < 5:
        return "1-5mb"
    if size_mb < 10:
        return "5-10mb"
    if size_mb < 25:
        return "10-25mb"
    if size_mb <= 50:
        return "25-50mb"
    return "50mb+"


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


@router.post("", response_model=DisputeSummaryDTO, status_code=201)
async def create_dispute(
    request: CreateDisputeRequest,
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    dispute_service: DisputeService = Depends(get_dispute_service),
) -> DisputeSummaryDTO:
    """Create a new dispute for a reconciliation statement.

    RLS policies automatically enforce that the tenant can only dispute
    statements for leases they are linked to.

    Args:
        request: Dispute creation request
        current_tenant: Authenticated tenant user
        db: Supabase client
        dispute_service: Dispute service instance

    Returns:
        Created dispute summary

    Raises:
        HTTPException: 429 if rate limit exceeded, 404 if statement not found,
            403 if tenant not linked to statement's lease
    """
    try:
        dispute = await dispute_service.create_dispute(
            tenant_user_id=current_tenant.id,
            statement_id=request.statement_id,
            category=request.category,
            description=request.description,
            db=db,
        )
        await _capture_dispute_event(
            "tenant_dispute_created",
            organization_id=str(current_tenant.organization_id),
            user_id=str(current_tenant.user_id),
            distinct_id=f"user:{current_tenant.user_id}",
            properties={
                "dispute_id": dispute["id"],
                "statement_id": dispute["statement_id"],
                "category": dispute["category"],
                "status": dispute["status"],
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
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.get("", response_model=list[DisputeSummaryDTO])
async def list_disputes(
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    status: DisputeStatus | None = Query(None, description="Filter by dispute status"),
    skip: int = Query(0, ge=0, description="Number of disputes to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum disputes to return"),
) -> list[DisputeSummaryDTO]:
    """List tenant's disputes with optional status filter.

    RLS policies automatically filter disputes to only those belonging
    to this tenant's linked leases.

    Args:
        current_tenant: Authenticated tenant user
        db: Supabase client
        status: Optional status filter
        skip: Number of disputes to skip for pagination
        limit: Maximum number of disputes to return

    Returns:
        List of dispute summaries ordered by creation time (newest first)
    """
    # Query disputes for this tenant
    query = (
        db.table("disputes")
        .select("id, statement_id, category, status, description, created_at")
        .eq("tenant_user_id", str(current_tenant.id))
        .order("created_at", desc=True)
    )

    # Apply status filter if provided
    if status:
        query = query.eq("status", status.value)

    # Apply pagination
    result = query.range(skip, skip + limit - 1).execute()

    # Cast JSON results to dicts for type safety
    return [
        DisputeSummaryDTO(
            id=UUID(d["id"]),
            statement_id=UUID(d["statement_id"]),
            category=d["category"],
            status=d["status"],
            description=d["description"],
            created_at=d["created_at"],
        )
        for d in cast(list[dict[str, Any]], result.data)
    ]


@router.get("/{dispute_id}", response_model=DisputeDetailDTO)
async def get_dispute(
    dispute_id: UUID,
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    storage_client: StorageClient = Depends(get_storage_client),
) -> DisputeDetailDTO:
    """Get dispute details including comments and attachments.

    RLS policies automatically verify that the tenant has access to this dispute
    through their linked leases.

    Args:
        dispute_id: Dispute ID to retrieve
        current_tenant: Authenticated tenant user
        db: Supabase client

    Returns:
        Dispute details with comments and attachments

    Raises:
        HTTPException: 404 if dispute not found or tenant doesn't have access
    """
    # Query dispute (RLS will enforce access)
    dispute_result = (
        db.table("disputes")
        .select("*")
        .eq("id", str(dispute_id))
        .eq("tenant_user_id", str(current_tenant.id))
        .maybe_single()
        .execute()
    )

    if not dispute_result or not dispute_result.data:
        raise HTTPException(
            status_code=404,
            detail=f"Dispute {dispute_id} not found or you don't have access to it",
        )

    # Cast JSON result to dict for type safety
    dispute = cast(dict[str, Any], dispute_result.data)

    # Query comments (exclude internal comments for tenants)
    # Join with users table to get author names
    comments_result = (
        db.table("dispute_comments")
        .select(
            """
            id, dispute_id, content, author_id, is_internal, created_at,
            author:users!author_id(full_name)
        """
        )
        .eq("dispute_id", str(dispute_id))
        .eq("is_internal", False)
        .order("created_at", desc=False)
        .execute()
    )

    # Query attachments
    attachments_result = (
        db.table("dispute_attachments")
        .select("id, filename, storage_path, file_size, mime_type, created_at")
        .eq("dispute_id", str(dispute_id))
        .order("created_at", desc=False)
        .execute()
    )

    return DisputeDetailDTO(
        id=UUID(dispute["id"]),
        tenant_user_id=UUID(dispute["tenant_user_id"]),
        statement_id=UUID(dispute["statement_id"]),
        organization_id=UUID(dispute["organization_id"]),
        category=dispute["category"],
        status=dispute["status"],
        description=dispute["description"],
        assigned_to=(
            UUID(dispute["assigned_to"]) if dispute.get("assigned_to") else None
        ),
        resolution_summary=dispute.get("resolution_summary"),
        resolved_at=dispute.get("resolved_at"),
        resolved_by=(
            UUID(dispute["resolved_by"]) if dispute.get("resolved_by") else None
        ),
        created_at=dispute["created_at"],
        updated_at=dispute["updated_at"],
        # Cast JSON results to dicts for type safety
        comments=[
            DisputeCommentDTO(
                id=UUID(c["id"]),
                dispute_id=UUID(c["dispute_id"]),
                content=c["content"],
                author_id=UUID(c["author_id"]),
                author_name=(c.get("author") or {}).get("full_name") or "Unknown",
                is_internal=c["is_internal"],
                created_at=c["created_at"],
            )
            for c in cast(list[dict[str, Any]], comments_result.data)
        ],
        # Cast JSON results to dicts for type safety
        attachments=[
            DisputeAttachmentDTO(
                id=UUID(a["id"]),
                filename=a["filename"],
                file_url=_presign_attachment(storage_client, a["storage_path"]),
                file_size_bytes=a["file_size"],
                content_type=a["mime_type"],
                created_at=a["created_at"],
            )
            for a in cast(list[dict[str, Any]], attachments_result.data)
        ],
    )


@router.post(
    "/{dispute_id}/comments", response_model=DisputeCommentDTO, status_code=201
)
async def add_comment(
    dispute_id: UUID,
    request: AddCommentRequest,
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    dispute_service: DisputeService = Depends(get_dispute_service),
) -> DisputeCommentDTO:
    """Add a comment to a dispute.

    RLS policies automatically verify that the tenant has access to this dispute.
    Tenants cannot create internal comments (is_internal forced to False).

    Args:
        dispute_id: Dispute ID to comment on
        request: Comment request
        current_tenant: Authenticated tenant user
        db: Supabase client
        dispute_service: Dispute service instance

    Returns:
        Created comment

    Raises:
        HTTPException: 404 if dispute not found or tenant doesn't have access
    """
    try:
        comment = await dispute_service.add_comment(
            dispute_id=dispute_id,
            author_id=current_tenant.user_id,
            content=request.content,
            is_internal=False,  # Tenants cannot create internal comments
            db=db,
        )
        await _capture_dispute_event(
            "tenant_dispute_comment_added",
            organization_id=str(current_tenant.organization_id),
            user_id=str(current_tenant.user_id),
            distinct_id=f"user:{current_tenant.user_id}",
            properties={
                "dispute_id": comment["dispute_id"],
                "is_internal": comment["is_internal"],
            },
        )
        return DisputeCommentDTO(
            id=UUID(comment["id"]),
            dispute_id=UUID(comment["dispute_id"]),
            content=comment["content"],
            author_id=UUID(comment["author_id"]),
            # The commenter IS the authenticated tenant, so resolve the display
            # name from the tenant record instead of the "Unknown" default (the
            # GET path resolves it via a users join) (F-059).
            author_name=current_tenant.contact_name or "Unknown",
            is_internal=comment["is_internal"],
            created_at=comment["created_at"],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/{dispute_id}/attachments", response_model=DisputeAttachmentDTO, status_code=201
)
async def upload_attachment(
    dispute_id: UUID,
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    file: UploadFile = File(
        ..., description="File to attach (PDF, JPG, PNG, max 10MB)"
    ),
    storage_client: StorageClient = Depends(get_storage_client),
) -> DisputeAttachmentDTO:
    """Upload an attachment to a dispute.

    RLS policies automatically verify that the tenant has access to this dispute.

    Supported formats: PDF, JPG, PNG
    Maximum file size: 10MB

    Args:
        dispute_id: Dispute ID to attach file to
        current_tenant: Authenticated tenant user
        db: Supabase client
        file: File to upload
        storage_client: Object storage client for file storage

    Returns:
        Created attachment metadata

    Raises:
        HTTPException: 400 if file invalid, 404 if dispute not found
    """
    # Verify dispute exists and belongs to tenant
    dispute_result = (
        db.table("disputes")
        .select("id, organization_id")
        .eq("id", str(dispute_id))
        .eq("tenant_user_id", str(current_tenant.id))
        .maybe_single()
        .execute()
    )

    if not dispute_result or not dispute_result.data:
        raise HTTPException(
            status_code=404,
            detail=f"Dispute {dispute_id} not found or you don't have access to it",
        )

    # Cast JSON result to dict for type safety
    dispute = cast(dict[str, Any], dispute_result.data)

    # Validate file type
    allowed_types = {"application/pdf", "image/jpeg", "image/png"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid file type. Allowed: PDF, JPG, PNG. "
                f"Got: {file.content_type}"
            ),
        )

    # Validate file size (10MB)
    max_size = 10 * 1024 * 1024  # 10MB in bytes
    file_content = await read_upload_with_limit(
        file,
        max_size=max_size,
        too_large_detail="File too large. Maximum size: 10MB.",
    )

    # Generate object storage key for dispute attachment
    filename = file.filename or "attachment"
    storage_key = (
        f"{dispute['organization_id']}/disputes/{dispute_id}/{uuid4().hex}/{filename}"
    )

    # Upload to object storage
    try:
        storage_client.upload_document(
            key=storage_key,
            content=file_content,
            content_type=file.content_type or "application/octet-stream",
            metadata={
                "organization_id": dispute["organization_id"],
                "dispute_id": str(dispute_id),
                "tenant_user_id": str(current_tenant.id),
                "original_filename": filename,
            },
        )
    except StorageError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file to storage: {e.message}",
        )

    # Create database record
    attachment_data = {
        "dispute_id": str(dispute_id),
        "uploaded_by": str(current_tenant.user_id),
        "filename": filename,
        "storage_path": storage_key,
        "file_size": len(file_content),
        "mime_type": file.content_type,
    }

    result = (
        db.table("dispute_attachments")
        .insert(cast(dict[str, Any], attachment_data))
        .execute()
    )

    if not result.data:
        # Cleanup object storage on database failure
        try:
            storage_client.delete_document(storage_key)
        except StorageError:
            logger.warning(
                "Failed to cleanup stored attachment after DB insert failure. "
                f"Storage key: {storage_key}. File may be orphaned.",
                exc_info=True,
            )

        raise HTTPException(
            status_code=500,
            detail="Failed to create attachment record",
        )

    # Cast JSON result to dict for type safety
    attachment = cast(dict[str, Any], result.data[0])
    file_size = int(attachment["file_size"])

    await _capture_dispute_event(
        "tenant_dispute_attachment_added",
        organization_id=str(dispute["organization_id"]),
        user_id=str(current_tenant.user_id),
        distinct_id=f"user:{current_tenant.user_id}",
        properties={
            "dispute_id": str(dispute_id),
            "attachment_file_type": attachment["mime_type"],
            "attachment_file_size_bucket": _file_size_bucket(file_size),
        },
    )

    return DisputeAttachmentDTO(
        id=UUID(attachment["id"]),
        filename=attachment["filename"],
        file_url=attachment["storage_path"],
        file_size_bytes=file_size,
        content_type=attachment["mime_type"],
        created_at=attachment["created_at"],
    )
