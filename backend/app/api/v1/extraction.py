"""
Extraction API endpoints for OCR and document processing.

Provides health check and document analysis endpoints for the
Cloudflare R2 + OpenRouter document pipeline.
"""

import logging
from datetime import UTC, datetime
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest import CountMethod

from app.api.v1.schemas.extraction_schemas import (
    ApproveExtractionRequest,
    ApproveExtractionResponse,
    ExtractionDetail,
    ExtractionListItem,
    ExtractionListResponse,
    ExtractionProcessResponse,
    RejectExtractionRequest,
    RejectExtractionResponse,
    SaveDraftRequest,
    SaveDraftResponse,
)
from app.auth.dependencies import (
    get_current_user,
    require_full_access,
    require_org_editor,
)
from app.config import settings
from app.database.client import SupabaseDB, get_supabase, get_supabase_admin
from app.models.document import Document
from app.models.enums import DocumentStatus, DocumentType, ExtractionJobPriority
from app.models.user import User
from app.services.billing.feature_usage import record_feature_use
from app.services.extraction import StorageClient, get_storage_client
from app.services.extraction.job_queue import (
    ExtractionJob,
    ExtractionJobCreate,
    create_extraction_job,
    get_extraction_job,
    retry_extraction_job,
)
from app.services.extraction.openrouter_client import (
    OpenRouterClient,
    get_openrouter_client,
)

logger = logging.getLogger(__name__)

router = APIRouter()

LEASE_EXTRACTION_DOCUMENT_TYPES = [DocumentType.LEASE, DocumentType.AMENDMENT]
LEASE_EXTRACTION_DOCUMENT_TYPE_VALUES = {
    doc_type.value for doc_type in LEASE_EXTRACTION_DOCUMENT_TYPES
}


def _ensure_lease_extraction_document(
    document_or_type: Document | DocumentType | str | None,
) -> None:
    document_type = (
        document_or_type.document_type
        if isinstance(document_or_type, Document)
        else document_or_type
    )

    if document_type in LEASE_EXTRACTION_DOCUMENT_TYPES:
        return

    if document_type in LEASE_EXTRACTION_DOCUMENT_TYPE_VALUES:
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Extraction workflow is only available for lease or amendment documents",
    )


@router.get("", response_model=ExtractionListResponse)
async def list_extractions(
    status: DocumentStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    supabase: SupabaseDB = Depends(get_supabase),
    current_user: User = Depends(get_current_user),
) -> ExtractionListResponse:
    """
    List all extractions for the current user's organization.

    Supports filtering by document status and pagination.

    Args:
        status: Optional status filter (e.g., READY_FOR_REVIEW, VERIFIED)
        page: Page number (1-indexed)
        page_size: Number of items per page (max 100)
        supabase: Supabase client for database operations
        current_user: Authenticated user (for organization filtering)

    Returns:
        ExtractionListResponse with paginated list of extractions

    Raises:
        HTTPException 400: Invalid pagination parameters
    """
    # Validate pagination
    if page < 1:
        raise HTTPException(status_code=400, detail="Page must be >= 1")
    if page_size < 1 or page_size > 100:
        raise HTTPException(status_code=400, detail="Page size must be 1-100")

    # Build query for documents
    query = (
        supabase.table("documents")
        .select("*", count=CountMethod.exact)
        .eq("organization_id", str(current_user.organization_id))
        .in_(
            "document_type",
            [doc_type.value for doc_type in LEASE_EXTRACTION_DOCUMENT_TYPES],
        )
        .order("created_at", desc=True)
    )

    # Apply status filter if provided
    if status:
        query = query.eq("status", status.value)

    # Calculate pagination offset
    offset = (page - 1) * page_size

    # Execute query with pagination
    response = query.range(offset, offset + page_size - 1).execute()

    if not response.data:
        return ExtractionListResponse(
            items=[], total=0, page=page, page_size=page_size, has_next=False
        )

    # Calculate confidence scores from extraction_result
    items: list[ExtractionListItem] = []
    for doc_data in response.data:
        doc = Document.model_validate(doc_data)

        # Extract confidence scores if available
        average_confidence = None
        low_confidence_count = 0

        if doc.extraction_result and "confidence_scores" in doc.extraction_result:
            scores = doc.extraction_result["confidence_scores"]
            if scores:
                confidence_values = [
                    v for v in scores.values() if isinstance(v, int | float)
                ]
                if confidence_values:
                    # Scores are already on 0-1.0 scale (normalized when saved)
                    average_confidence = sum(confidence_values) / len(confidence_values)
                    # Low confidence is < 0.7 on 0-1.0 scale
                    low_confidence_count = sum(1 for v in confidence_values if v < 0.7)

        items.append(
            ExtractionListItem(
                id=doc.id,
                filename=doc.filename,
                status=doc.status,
                created_at=doc.created_at,
                processed_at=doc.processed_at,
                verified_at=doc.verified_at,
                average_confidence=average_confidence,
                low_confidence_count=low_confidence_count,
            )
        )

    # Determine if there are more pages
    total = response.count or 0
    has_next = (offset + page_size) < total

    return ExtractionListResponse(
        items=items, total=total, page=page, page_size=page_size, has_next=has_next
    )


@router.get("/health")
async def document_reader_health_check(
    storage_client: StorageClient = Depends(get_storage_client),
    document_reader_client: OpenRouterClient = Depends(get_openrouter_client),
) -> dict[str, Any]:
    """Check object storage and document-reader connectivity.

    Returns the health status of the active extraction stack.

    Returns:
        Dict with:
        - healthy: bool indicating service reachability
        - storage: Object storage health payload
        - document_reader: Document reader health payload
        - message: Status message or error details
    """
    storage_health = storage_client.check_health()
    configured_api_key = bool(
        settings.openrouter_api_key
        or getattr(document_reader_client, "api_key", None)
        or document_reader_client
    )
    document_reader_health = {
        "healthy": configured_api_key,
        "provider": "openrouter",
        "primary_model": settings.extraction_primary_model,
        "sibling_model": settings.extraction_sibling_model,
        "message": (
            "Document reader configured"
            if configured_api_key
            else "OPENROUTER_API_KEY is not configured"
        ),
    }
    return {
        "healthy": storage_health["healthy"] and document_reader_health["healthy"],
        "storage": storage_health,
        "document_reader": document_reader_health,
        "message": (
            "Document extraction stack is reachable"
            if storage_health["healthy"] and document_reader_health["healthy"]
            else "Document extraction stack is degraded"
        ),
    }


@router.post(
    "/{document_id}/process",
    response_model=ExtractionProcessResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def process_extraction(
    document_id: UUID,
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    supabase_admin: Annotated[SupabaseDB, Depends(get_supabase_admin)],
    current_user: Annotated[User, Depends(get_current_user)],
    storage_client: Annotated[StorageClient, Depends(get_storage_client)],
) -> ExtractionProcessResponse:
    """Queue extraction processing for a PENDING/FAILED document."""
    _ = storage_client
    doc_response = (
        supabase.table("documents")
        .select("*")
        .eq("id", str(document_id))
        .eq("organization_id", str(current_user.organization_id))
        .maybe_single()
        .execute()
    )

    if not doc_response or not doc_response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or you don't have access to it",
        )
    raw_document = cast(dict[str, Any], doc_response.data)
    _ensure_lease_extraction_document(raw_document.get("document_type"))

    storage_bucket = raw_document.get("storage_bucket") or raw_document.get("s3_bucket")
    storage_key = raw_document.get("storage_key") or raw_document.get("s3_key")

    if not storage_bucket or not storage_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document missing object storage location information",
        )

    document = Document.model_validate(raw_document)
    if document.status not in [DocumentStatus.PENDING, DocumentStatus.FAILED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Document must be in PENDING or FAILED status. "
                f"Current status: {document.status.value}"
            ),
        )
    processing_update = (
        supabase_admin.table("documents")
        .update(
            {
                "status": DocumentStatus.PROCESSING.value,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )
        .eq("id", str(document_id))
        .eq("organization_id", str(current_user.organization_id))
        .execute()
    )
    if not processing_update.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or you don't have access to it",
        )
    try:
        job = await create_extraction_job(
            ExtractionJobCreate(
                document_id=document_id,
                organization_id=current_user.organization_id,
                priority=ExtractionJobPriority.NORMAL,
            )
        )
    except Exception as exc:
        supabase_admin.table("documents").update(
            {
                "status": DocumentStatus.FAILED.value,
                "error_message": f"Failed to enqueue extraction job: {exc}",
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ).eq("id", str(document_id)).eq(
            "organization_id", str(current_user.organization_id)
        ).execute()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to enqueue extraction job",
        ) from exc
    record_feature_use(
        supabase_admin, str(current_user.organization_id), "ai_lease_extraction"
    )
    return ExtractionProcessResponse(
        success=True,
        document_id=document_id,
        job_id=job.id,
        status=DocumentStatus.PROCESSING,
        message="Extraction job queued",
    )


@router.get("/{document_id}", response_model=ExtractionDetail)
async def get_extraction_detail(
    document_id: UUID,
    supabase: SupabaseDB = Depends(get_supabase),
    current_user: User = Depends(get_current_user),
    storage_client: StorageClient = Depends(get_storage_client),
) -> ExtractionDetail:
    """
    Get full details of an extraction for the verification page.

    Returns the document with OCR results, extracted profile, and source references,
    and all metadata needed for the HITL verification UI.

    Args:
        document_id: UUID of the document to retrieve
        supabase: Supabase client for database operations
        current_user: Authenticated user (for authorization)

    Returns:
        ExtractionDetail with full document details

    Raises:
        HTTPException 404: Document not found or access denied
    """
    # Fetch document with RLS enforcement via organization_id match
    response = (
        supabase.table("documents")
        .select("*")
        .eq("id", str(document_id))
        .eq("organization_id", str(current_user.organization_id))
        .maybe_single()
        .execute()
    )

    # BUG #7 FIX: Defensive check for RLS block or non-existent resource
    if not response or not response.data:
        raise HTTPException(
            status_code=404,
            detail="Document not found or you don't have access to it",
        )

    doc = Document.model_validate(response.data)
    _ensure_lease_extraction_document(doc)

    # Generate presigned URL for document access (1 hour expiration)
    document_url = storage_client.get_document_url(doc.storage_key, expires_in=3600)

    return ExtractionDetail(
        id=doc.id,
        filename=doc.filename,
        status=doc.status,
        storage_bucket=doc.storage_bucket,
        storage_key=doc.storage_key,
        document_url=document_url,
        content_type=doc.content_type,
        file_size_bytes=doc.file_size_bytes,
        extraction_result=doc.extraction_result,
        created_at=doc.created_at,
        processed_at=doc.processed_at,
        verified_at=doc.verified_at,
        verified_by=doc.verified_by,
        property_id=doc.property_id,
        lease_id=doc.lease_id,
        edit_history=doc.edit_history,
    )


@router.put(
    "/{document_id}/approve",
    response_model=ApproveExtractionResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def approve_extraction(
    document_id: UUID,
    request: ApproveExtractionRequest,
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    supabase_admin: Annotated[SupabaseDB, Depends(get_supabase_admin)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApproveExtractionResponse:
    """
    Commit verified extraction to the database.

    This endpoint implements the approval workflow for the Human-in-the-Loop
    verification UI. It:
    1. Validates the document exists and hasn't been verified already
    2. Updates the associated lease with the verified recovery profile
    3. Marks the document as verified
    4. Logs the verification action with edit history
    5. Returns the updated lease ID

    Args:
        document_id: UUID of the document/extraction to approve
        request: Approval request with verified profile and edit history
        supabase: Supabase client for database operations
        current_user: Authenticated user performing the approval

    Returns:
        ApproveExtractionResponse with success status and lease_id

    Raises:
        HTTPException 404: Document not found
        HTTPException 400: Document already verified or missing lease_id
        HTTPException 500: Database operation failed
    """
    # Fetch the document
    response = (
        supabase.table("documents")
        .select("*")
        .eq("id", str(document_id))
        .eq("organization_id", str(current_user.organization_id))
        .maybe_single()
        .execute()
    )

    # BUG #7 FIX: Defensive check for RLS block or non-existent resource
    if not response or not response.data:
        raise HTTPException(status_code=404, detail="Document not found")

    document = Document.model_validate(response.data)
    _ensure_lease_extraction_document(document)

    # Validate document hasn't been verified already
    if document.status == DocumentStatus.VERIFIED:
        raise HTTPException(
            status_code=400, detail="Document has already been verified"
        )

    # Resolve effective lease_id: document field takes priority, body as fallback
    effective_lease_id: str | None = (
        str(document.lease_id)
        if document.lease_id
        else (str(request.lease_id) if request.lease_id else None)
    )
    if not effective_lease_id:
        raise HTTPException(
            status_code=400,
            detail="Document must be linked to a lease before approval",
        )

    lease_check = (
        supabase.table("leases")
        .select("id, property_id")
        .eq("id", effective_lease_id)
        .eq("property_id", str(document.property_id))
        .maybe_single()
        .execute()
    )
    if not lease_check or not lease_check.data:
        raise HTTPException(
            status_code=400,
            detail="Lease does not belong to this document's property",
        )

    # FIX API-2: Use supabase_admin with explicit org_id filter instead of raw asyncpg
    # This ensures the lease belongs to the same organization as the document
    lease_update: dict[str, Any] = {
        "recovery_profile": request.profile.model_dump(mode="json"),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    # Update the lease - RLS policies validate org access through property FK
    # Note: leases table has no organization_id column;
    # org validation happens via property
    lease_response = (
        supabase_admin.table("leases")
        .update(lease_update)
        .eq("id", effective_lease_id)
        .eq("property_id", str(document.property_id))
        .execute()
    )

    if not lease_response.data:
        raise HTTPException(
            status_code=404,
            detail="Lease not found or does not belong to your organization",
        )

    # Mark document as verified; persist lease_id when it came from the request body
    document_update: dict[str, Any] = {
        "status": DocumentStatus.VERIFIED.value,
        "verified_by": str(current_user.id),
        "verified_at": datetime.now(UTC).isoformat(),
        "edit_history": [action.model_dump() for action in request.edit_history],
        "updated_at": datetime.now(UTC).isoformat(),
    }
    if not document.lease_id and request.lease_id:
        document_update["lease_id"] = effective_lease_id

    doc_response = (
        supabase.table("documents")
        .update(document_update)
        .eq("id", str(document_id))
        .execute()
    )

    if not doc_response.data:
        raise HTTPException(
            status_code=500, detail="Failed to mark document as verified"
        )

    return ApproveExtractionResponse(success=True, lease_id=UUID(effective_lease_id))


@router.put(
    "/{document_id}/draft",
    response_model=SaveDraftResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def save_draft(
    document_id: UUID,
    request: SaveDraftRequest,
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SaveDraftResponse:
    """
    Save a draft of the extraction during verification.

    Auto-save functionality to prevent data loss during the verification process.
    Stores the current draft state in the document's extraction_result field.

    Args:
        document_id: UUID of the document being verified
        request: Draft state to save
        supabase: Supabase client for database operations
        current_user: Authenticated user (for authorization)

    Returns:
        SaveDraftResponse with success status

    Raises:
        HTTPException 404: Document not found
        HTTPException 500: Database operation failed
    """
    # Verify document exists and belongs to user's organization
    response = (
        supabase.table("documents")
        .select("*")
        .eq("id", str(document_id))
        .eq("organization_id", str(current_user.organization_id))
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found")

    document = Document.model_validate(response.data)
    _ensure_lease_extraction_document(document)

    # Get current extraction_result to merge with
    doc_response = (
        supabase.table("documents")
        .select("extraction_result")
        .eq("id", str(document_id))
        .eq("organization_id", str(current_user.organization_id))
        .single()
        .execute()
    )

    # Merge draft with existing extraction_result
    doc_data = cast(dict[str, Any], doc_response.data)
    current_result: dict[str, Any] = doc_data.get("extraction_result") or {}
    updated_result: dict[str, Any] = {
        **current_result,
        "draft_profile": request.profile,  # Already a dict
        "last_saved_at": datetime.now(UTC).isoformat(),
    }

    # Save draft to extraction_result
    draft_update: dict[str, Any] = {
        "extraction_result": updated_result,
        "updated_at": datetime.now(UTC).isoformat(),
    }

    update_response = (
        supabase.table("documents")
        .update(draft_update)
        .eq("id", str(document_id))
        .eq("organization_id", str(current_user.organization_id))
        .execute()
    )

    if not update_response.data:
        raise HTTPException(status_code=500, detail="Failed to save draft")

    return SaveDraftResponse(success=True)


@router.put(
    "/{document_id}/reject",
    response_model=RejectExtractionResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def reject_extraction(
    document_id: UUID,
    request: RejectExtractionRequest,
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> RejectExtractionResponse:
    """
    Reject an extraction and optionally requeue for reprocessing.

    This endpoint implements the rejection workflow for the Human-in-the-Loop
    verification UI. It:
    1. Validates the document exists and hasn't been verified already
    2. Marks the document as REJECTED
    3. Logs the rejection reason and notes
    4. Optionally requeues the document
       (deferred to Story 15.7 - Extraction Retry Logic)

    Args:
        document_id: UUID of the document/extraction to reject
        request: Rejection request with reason, notes, and requeue flag
        supabase: Supabase client for database operations
        current_user: Authenticated user performing the rejection

    Returns:
        RejectExtractionResponse with success status and message

    Raises:
        HTTPException 404: Document not found
        HTTPException 400: Document already verified or rejected
        HTTPException 500: Database operation failed
    """
    # Fetch the document
    response = (
        supabase.table("documents")
        .select("*")
        .eq("id", str(document_id))
        .eq("organization_id", str(current_user.organization_id))
        .maybe_single()
        .execute()
    )

    # BUG #7 FIX: Defensive check for RLS block or non-existent resource
    if not response or not response.data:
        raise HTTPException(status_code=404, detail="Document not found")

    document = Document.model_validate(response.data)
    _ensure_lease_extraction_document(document)

    # Validate document hasn't been finalized already
    if document.status == DocumentStatus.VERIFIED:
        raise HTTPException(status_code=400, detail="Cannot reject a verified document")

    if document.status == DocumentStatus.REJECTED:
        raise HTTPException(
            status_code=400, detail="Document has already been rejected"
        )

    now = datetime.now(UTC).isoformat()

    # Mark document as rejected, or return it to processing when a retry is queued.
    document_update = {
        "status": (
            DocumentStatus.PROCESSING.value
            if request.requeue
            else DocumentStatus.REJECTED.value
        ),
        "error_message": (
            f"Rejected: {request.reason}. Notes: {request.notes or 'None'}"
        ),
        "rejected_by": str(current_user.id),
        "rejected_at": now,
        "rejection_reason": request.reason,
        "rejection_notes": request.notes,
        "updated_at": now,
    }

    doc_response = (
        supabase.table("documents")
        .update(document_update)
        .eq("id", str(document_id))
        .execute()
    )

    if not doc_response.data:
        raise HTTPException(
            status_code=500, detail="Failed to mark document as rejected"
        )

    # Handle requeue request
    if request.requeue:
        # Create extraction job for retry
        job = await create_extraction_job(
            ExtractionJobCreate(
                document_id=document_id,
                organization_id=current_user.organization_id,
                priority=ExtractionJobPriority.NORMAL,
            )
        )

        return RejectExtractionResponse(
            success=True,
            message=f"Extraction rejected and queued for retry. Job ID: {job.id}",
        )

    return RejectExtractionResponse(
        success=True,
        message=(
            "Extraction rejected successfully. "
            "Re-upload to retry with different settings."
        ),
    )


@router.get("/jobs/{job_id}", response_model=ExtractionJob)
async def get_job_status(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
) -> ExtractionJob:
    """
    Get extraction job status.

    Retrieves the current status of an extraction job by ID.
    Useful for polling job progress.

    Args:
        job_id: UUID of the extraction job
        current_user: Authenticated user

    Returns:
        ExtractionJob with current status and details

    Raises:
        404: Job not found
    """
    job = await get_extraction_job(job_id, organization_id=current_user.organization_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@router.post(
    "/jobs/{job_id}/retry",
    response_model=ExtractionJob,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def retry_job(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
) -> ExtractionJob:
    """
    Manually retry a failed extraction job.

    Queues a failed job for retry with exponential backoff.
    Job must be in FAILED status and have retries remaining.

    Args:
        job_id: UUID of the extraction job to retry
        current_user: Authenticated user

    Returns:
        Updated ExtractionJob with RETRYING status

    Raises:
        404: Job not found
        400: Job cannot be retried (wrong status or max retries reached)
    """
    job = await get_extraction_job(job_id, organization_id=current_user.organization_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        result = await retry_extraction_job(
            job_id, organization_id=current_user.organization_id
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
