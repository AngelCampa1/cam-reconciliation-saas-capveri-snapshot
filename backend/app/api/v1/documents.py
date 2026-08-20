"""
Document management endpoints for OCR pipeline.

Provides upload, retrieval, and status endpoints for lease documents
that are processed through the document-reader pipeline.
"""

import logging
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.api.v1.uploads import read_upload_with_limit
from app.auth.dependencies import OrgContext, require_org_editor
from app.exceptions import NotFoundError
from app.models.document import (
    DocumentResponse,
    DocumentUploadResponse,
)
from app.models.enums import DocumentStatus, DocumentType
from app.services.extraction import StorageClient, StorageError, get_storage_client

router = APIRouter()
logger = logging.getLogger(__name__)


# Maximum file size: 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024


def _extract_supabase_error_payload(result: Any) -> Any:
    """Best-effort extraction of structured Supabase error details for logs."""
    for attr in ("error", "errors", "message"):
        value = getattr(result, attr, None)
        if value:
            return value
    if isinstance(result, dict):
        for key in ("error", "errors", "message"):
            if result.get(key):
                return result[key]
    return None


class DocumentListResponse:
    """Response model for document list."""

    def __init__(self, data: list[dict[str, Any]], count: int, has_more: bool):
        self.data = data
        self.count = count
        self.has_more = has_more


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor)],
)
async def upload_document(
    property_id: UUID,
    ctx: OrgContext,
    file: UploadFile = File(...),
    document_type: DocumentType = DocumentType.LEASE,
    lease_id: UUID | None = None,
    storage_client: StorageClient = Depends(get_storage_client),
) -> DocumentUploadResponse:
    """
    Upload a PDF document for OCR processing.

    Accepts PDF files up to 50MB, validates file type, uploads to object storage
    with server-side encryption, and creates a database record for tracking.

    Args:
        property_id: UUID of the property this document belongs to
        ctx: Organization-scoped context with authenticated user
        file: PDF file to upload
        document_type: Type of document (lease, amendment, etc.)
        storage_client: Object storage client for file storage

    Returns:
        Document ID and status for tracking

    Raises:
        HTTPException 400: Invalid file type or size
        HTTPException 500: Upload or database error
    """
    # Validate content type
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted. Received: "
            + (file.content_type or "unknown"),
        )

    content = await read_upload_with_limit(
        file,
        max_size=MAX_FILE_SIZE,
        too_large_detail=(
            f"File exceeds maximum size of {MAX_FILE_SIZE // (1024 * 1024)}MB"
        ),
    )

    # Validate PDF magic bytes
    if not storage_client.validate_pdf(content):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File does not appear to be a valid PDF (invalid magic bytes)",
        )

    # Generate storage key
    filename = file.filename or "document.pdf"
    storage_key = storage_client.generate_storage_key(
        organization_id=ctx.organization_id,
        property_id=property_id,
        filename=filename,
    )

    # Verify property exists and belongs to organization
    property_result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .maybe_single()
        .execute()
    )

    if not property_result or not property_result.data:
        raise NotFoundError("Property", str(property_id))

    # Validate lease_id belongs to this property (RLS enforces org isolation)
    if lease_id is not None:
        lease_result = (
            ctx.table("leases")
            .select("id")
            .eq("id", str(lease_id))
            .eq("property_id", str(property_id))
            .maybe_single()
            .execute()
        )
        if not lease_result or not lease_result.data:
            raise NotFoundError("Lease", str(lease_id))

    # Upload to object storage
    try:
        upload_result = storage_client.upload_document(
            key=storage_key,
            content=content,
            content_type="application/pdf",
            metadata={
                "organization_id": str(ctx.organization_id),
                "property_id": str(property_id),
                "original_filename": filename,
            },
        )
    except StorageError as e:
        logger.exception(
            "Document storage upload failed",
            extra={
                "organization_id": str(ctx.organization_id),
                "property_id": str(property_id),
                "lease_id": str(lease_id) if lease_id else None,
                "storage_key": storage_key,
                "document_filename": filename,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload document to storage: {e.message}",
        ) from e

    # Create database record
    document_data = {
        "organization_id": str(ctx.organization_id),
        "property_id": str(property_id),
        "filename": filename,
        "storage_key": storage_key,
        "storage_bucket": upload_result["bucket"],
        "content_type": "application/pdf",
        "file_size_bytes": len(content),
        "document_type": document_type.value,
        "status": DocumentStatus.PENDING.value,
        "lease_id": str(lease_id) if lease_id else None,
    }

    result = ctx.table("documents").insert(document_data).execute()

    if not result.data:
        logger.error(
            "Document record insert failed after storage upload",
            extra={
                "organization_id": str(ctx.organization_id),
                "property_id": str(property_id),
                "lease_id": str(lease_id) if lease_id else None,
                "storage_key": storage_key,
                "storage_bucket": upload_result["bucket"],
                "document_filename": filename,
                "supabase_error": _extract_supabase_error_payload(result),
            },
        )
        # Cleanup object storage on database failure
        try:
            storage_client.delete_document(storage_key)
        except StorageError:
            logger.warning(
                "Failed to cleanup stored document after DB insert failure. "
                f"Storage key: {storage_key}. Document may be orphaned.",
                exc_info=True,
            )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create document record",
        )

    return DocumentUploadResponse(
        document_id=result.data[0]["id"],
        status=DocumentStatus.PENDING,
        message="Document uploaded successfully and queued for processing",
    )


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    ctx: OrgContext,
    property_id: Annotated[
        UUID | None, Query(description="Filter by property ID")
    ] = None,
    status_filter: Annotated[
        DocumentStatus | None, Query(alias="status", description="Filter by status")
    ] = None,
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum records to return")
    ] = 20,
) -> list[dict[str, Any]]:
    """
    List documents for the organization.

    Returns documents filtered by optional property_id and status.
    Results are paginated and sorted by creation date (newest first).

    Args:
        ctx: Organization-scoped context with authenticated user
        property_id: Optional filter by property
        status_filter: Optional filter by processing status
        skip: Number of records to skip
        limit: Maximum records to return

    Returns:
        List of document records
    """
    query = ctx.table("documents").select("*").order("created_at", desc=True)

    if property_id:
        query = query.eq("property_id", str(property_id))

    if status_filter:
        query = query.eq("status", status_filter.value)

    result = query.range(skip, skip + limit - 1).execute()

    return cast(list[dict[str, Any]], result.data)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    ctx: OrgContext,
) -> dict[str, Any]:
    """
    Get a document by ID.

    Retrieves document metadata and processing status.

    Args:
        document_id: UUID of the document
        ctx: Organization-scoped context with authenticated user

    Returns:
        Document details including processing status
    """
    result = (
        ctx.table("documents")
        .select("*")
        .eq("id", str(document_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise NotFoundError("Document", str(document_id))

    return cast(dict[str, Any], result.data)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_editor)],
)
async def delete_document(
    document_id: UUID,
    ctx: OrgContext,
    storage_client: StorageClient = Depends(get_storage_client),
) -> None:
    """
    Delete a document.

    Removes the document from both database and object storage.
    Only documents in 'pending' or 'failed' status can be deleted.

    Args:
        document_id: UUID of the document to delete
        ctx: Organization-scoped context with authenticated user
        storage_client: Object storage client for file deletion
    """
    # Get document first to check status and get storage key
    doc_result = (
        ctx.table("documents")
        .select("*")
        .eq("id", str(document_id))
        .maybe_single()
        .execute()
    )

    if not doc_result or not doc_result.data:
        raise NotFoundError("Document", str(document_id))

    doc = doc_result.data

    # Only allow deletion of pending or failed documents
    if doc["status"] not in [DocumentStatus.PENDING.value, DocumentStatus.FAILED.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete document with status '{doc['status']}'. "
            "Only pending or failed documents can be deleted.",
        )

    storage_key = doc.get("storage_key") or doc.get("s3_key")

    # Delete from database first so RLS failures do not remove object storage.
    delete_result = (
        ctx.table("documents")
        .delete()
        .eq("id", str(document_id))
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )
    if not delete_result.data:
        raise NotFoundError("Document", str(document_id))

    try:
        if storage_key:
            storage_client.delete_document(storage_key)
    except StorageError:
        logger.warning(
            "Failed to delete document from object storage after DB delete. "
            "Storage key: %s. File may be orphaned.",
            storage_key,
            exc_info=True,
        )

    return None
