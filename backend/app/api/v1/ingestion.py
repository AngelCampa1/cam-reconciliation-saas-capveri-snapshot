"""
Data ingestion endpoints.

Provides endpoints for uploading and processing CSV/Excel files
from property management systems like Yardi and MRI.
"""

import csv
import json
import logging
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pandas.errors import ParserError
from pydantic import BaseModel

from app.api.v1.property_access import verify_property_belongs_to_org
from app.auth.dependencies import (
    OrgContext,
    require_full_access,
    require_org_admin,
    require_org_editor,
)
from app.schemas.ingestion import (
    ColumnMappingListResponse,
    ColumnMappingResponse,
    CreateColumnMappingRequest,
    RetryBatchResponse,
)
from app.services.ingestion.batch import (
    check_duplicate,
    compute_file_hash,
    create_batch,
    update_batch_status,
)
from app.services.ingestion.dispatcher import get_dispatcher
from app.services.ingestion.persistence import delete_batch_entries, persist_gl_entries
from app.services.ingestion.schemas import ParseResult
from app.services.pools.auto_setup import auto_setup_pools_from_gl

logger = logging.getLogger(__name__)

router = APIRouter()


class GlDateRangeResponse(BaseModel):
    """Response model for GL date range detection."""

    min_date: str
    max_date: str
    year: int


class UploadResponse(BaseModel):
    """Response model for file upload endpoint."""

    batch_id: UUID
    source_system: str
    source_confidence: float
    row_count: int
    error_count: int
    warnings: list[str]
    detected_columns: list[str]


class BatchListResponse(BaseModel):
    """Response model for batch list endpoint."""

    batches: list[dict[str, Any]]


PREVIEW_ENTRY_LIMIT = 50


def _serialize_preview_entry(entry: dict[str, Any]) -> dict[str, Any]:
    amount = Decimal(str(entry.get("amount") or "0"))
    debit = amount if amount > 0 else None
    credit = abs(amount) if amount < 0 else None

    return {
        "id": entry["id"],
        "transaction_date": entry["transaction_date"],
        "account_code": entry["account_code"],
        "account_description": entry["account_description"],
        "description": entry.get("description"),
        "debit": str(debit) if debit is not None else None,
        "credit": str(credit) if credit is not None else None,
        "balance": str(amount),
    }


def _parse_or_fail(
    parser: Any,
    file: Any,
    file_name: str,
    property_id: UUID,
    batch_id: UUID,
    organization_id: UUID,
    column_mapping: dict[str, str] | None = None,
) -> ParseResult:
    """Run a parser, marking the batch failed and raising 422 on any error.

    Generic (Phase 2) parsing requires ``column_mapping``; the Yardi/MRI
    parsers do not accept it, so it is only passed through when provided.
    """
    try:
        if column_mapping is not None:
            result = parser.parse(
                file,
                file_name,
                str(property_id),
                column_mapping=column_mapping,
            )
        else:
            result = parser.parse(file, file_name, str(property_id))
    except (ParserError, UnicodeDecodeError, ValueError, csv.Error) as e:
        error_message = str(e)
        update_batch_status(
            batch_id,
            organization_id,
            "failed",
            error_count=1,
            error_log=[{"message": error_message}],
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Failed to parse file",
                "errors": [error_message],
            },
        )

    if not result.success:
        error_log = [{"message": e} for e in result.errors]
        update_batch_status(
            batch_id,
            organization_id,
            "failed",
            error_count=result.error_count,
            error_log=error_log,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Failed to parse file",
                "errors": result.errors,
            },
        )

    # ``parser`` is typed ``Any`` because only the generic parser's ``parse``
    # accepts ``column_mapping``; cast keeps the declared ParseResult return.
    return cast(ParseResult, result)


def _persist_and_complete_batch(
    batch_id: UUID,
    organization_id: UUID,
    property_id: UUID,
    result: ParseResult,
    source_system: str,
    source_confidence: float,
) -> UploadResponse:
    """Persist parsed GL entries, run validation, set up pools, mark completed.

    Shared by the non-generic upload path and the generic apply-mapping path.
    Raises 422 when validation filters out every row.
    """
    warnings = list(result.warnings)

    persistence_result = persist_gl_entries(
        df=result.data,
        batch_id=batch_id,
        property_id=property_id,
        organization_id=organization_id,
    )

    rows_imported = result.row_count
    validation_result = None
    if isinstance(persistence_result, tuple):
        rows_imported, validation_result = persistence_result
    else:
        rows_imported = persistence_result

    if validation_result is not None:
        validation_errors = [
            {
                "message": error.message,
                "row_index": error.row_index,
            }
            for error in validation_result.errors
        ]
        if not validation_result.is_valid:
            update_batch_status(
                batch_id,
                organization_id,
                "failed",
                error_count=validation_result.invalid_count,
                error_log=validation_errors,
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "No valid GL entries found",
                    "errors": [error["message"] for error in validation_errors],
                    "rows_processed": result.row_count,
                    "rows_imported": rows_imported,
                    "rows_failed": validation_result.invalid_count,
                },
            )
        if validation_result.invalid_count:
            warnings.extend(
                f"Row {error.row_index}: {error.message}"
                for error in validation_result.errors
            )

    # Auto-create expense pools from GL account descriptions
    try:
        auto_setup_pools_from_gl(
            property_id=property_id,
            batch_id=batch_id,
            organization_id=organization_id,
        )
    except Exception as pool_err:
        logger.warning(
            "Auto-setup pools failed for batch %s: %s",
            batch_id,
            pool_err,
        )

    error_count = (
        result.error_count
        if validation_result is None
        else validation_result.invalid_count
    )

    update_batch_status(
        batch_id,
        organization_id,
        "completed",
        row_count=rows_imported,
        error_count=error_count,
    )

    return UploadResponse(
        batch_id=batch_id,
        source_system=source_system,
        source_confidence=source_confidence,
        row_count=rows_imported,
        error_count=error_count,
        warnings=warnings,
        detected_columns=(list(result.data.columns) if result.data is not None else []),
    )


@router.post(
    "/upload",
    response_model=UploadResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def upload_file(
    ctx: OrgContext,
    file: UploadFile = File(...),
    property_id: UUID = Form(...),
    source_override: str | None = Form(None),
) -> UploadResponse:
    """
    Upload a file for ingestion.

    AC1: POST /api/v1/ingestion/upload accepts multipart file
    AC2: Returns batch ID and row count on success
    AC3: Source detection reported to user
    AC4: Duplicate files return 409 with details
    AC5: Large files handled (up to 50MB)

    Args:
        ctx: Organization-scoped context with authenticated user
        file: The uploaded file (CSV or Excel)
        property_id: UUID of the property this import belongs to
        source_override: Optional manual source system override

    Returns:
        UploadResponse with batch ID, source detection, and row count
    """
    # Validate file size (50MB limit)
    max_file_size = 50 * 1024 * 1024  # 50MB
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to start

    if file_size > max_file_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "message": "File exceeds maximum size limit",
                "max_size_mb": 50,
                "actual_size_mb": round(file_size / (1024 * 1024), 2),
            },
        )

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "File is empty"},
        )

    verify_property_belongs_to_org(property_id, ctx)

    # Compute hash for deduplication
    file_hash = compute_file_hash(file.file)

    # Check for duplicate (synchronous call - no await)
    existing = check_duplicate(
        ctx.organization_id,
        file_hash,
        allow_failed_reimport=False,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "File has already been imported",
                "existing_batch_id": str(existing.id),
                "imported_at": (
                    existing.created_at.isoformat() if existing.created_at else None
                ),
            },
        )

    # Get appropriate parser via fingerprinting
    dispatcher = get_dispatcher()
    parser, fingerprint = dispatcher.get_parser(
        file.file,
        file.filename or "unknown",
        source_override,
    )

    # Generic files require a user-supplied column mapping before they can be
    # persisted (the parser cannot infer account/amount columns). Detect this
    # from the resolved parser, not the fingerprint, so generic-fallback files
    # are handled correctly too.
    needs_mapping = parser.source_system == "generic"
    batch_source_system = "generic" if needs_mapping else fingerprint.source_system

    # Create batch record (synchronous call - no await)
    batch = create_batch(
        organization_id=ctx.organization_id,
        property_id=property_id,
        file_name=file.filename or "unknown",
        file_hash=file_hash,
        source_system=batch_source_system,
    )

    if needs_mapping:
        # FIX F-040: Do NOT persist generic files at upload time. A Phase-1
        # parse surfaces the raw columns for the mapping wizard; the batch is
        # left 'pending' and the frontend then re-sends the file together with
        # the column mapping to POST /batches/{batch_id}/apply-mapping.
        result = _parse_or_fail(
            parser,
            file.file,
            file.filename or "unknown",
            property_id,
            batch.id,
            ctx.organization_id,
        )
        return UploadResponse(
            batch_id=batch.id,
            source_system="generic",
            source_confidence=fingerprint.confidence,
            row_count=result.row_count,
            error_count=0,
            warnings=list(result.warnings),
            detected_columns=(
                list(result.data.columns) if result.data is not None else []
            ),
        )

    try:
        # Update status to processing (synchronous call - no await)
        update_batch_status(batch.id, ctx.organization_id, "processing")

        result = _parse_or_fail(
            parser,
            file.file,
            file.filename or "unknown",
            property_id,
            batch.id,
            ctx.organization_id,
        )

        return _persist_and_complete_batch(
            batch_id=batch.id,
            organization_id=ctx.organization_id,
            property_id=property_id,
            result=result,
            source_system=fingerprint.source_system,
            source_confidence=fingerprint.confidence,
        )

    except HTTPException:
        raise
    except Exception as e:
        # Synchronous call - no await
        update_batch_status(
            batch.id,
            ctx.organization_id,
            "failed",
            error_log=[{"message": str(e)}],
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {str(e)}",
        )


@router.post(
    "/batches/{batch_id}/apply-mapping",
    response_model=UploadResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def apply_batch_mapping(
    batch_id: UUID,
    ctx: OrgContext,
    file: UploadFile = File(...),
    mapping_config: str = Form(...),
) -> UploadResponse:
    """Apply a user-supplied column mapping to a pending generic import.

    FIX F-040: Generic GL files are uploaded without a mapping, leaving the
    batch in 'pending' with nothing persisted. The frontend mapping wizard
    then re-sends the same file together with the column mapping. We verify the
    file matches the original upload, re-parse it with the mapping applied
    (Phase 2), persist the GL entries, and mark the batch completed.

    Args:
        batch_id: UUID of the pending generic import batch
        ctx: Organization-scoped context with authenticated user
        file: The same file that was originally uploaded
        mapping_config: JSON object mapping standard field names to source
            columns, e.g. {"account_code": "Acct", "amount": "Debit"}

    Returns:
        UploadResponse with the persisted row count and any warnings
    """
    # Parse and validate the mapping payload
    try:
        parsed_mapping = json.loads(mapping_config)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "mapping_config must be valid JSON"},
        )

    if not isinstance(parsed_mapping, dict) or not parsed_mapping:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "mapping_config must be a non-empty object"},
        )

    mapping: dict[str, str] = {}
    for key, value in parsed_mapping.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "mapping_config must map strings to strings"},
            )
        mapping[key] = value

    required_targets = {"account_code", "amount"}
    missing_targets = required_targets - set(mapping.keys())
    if missing_targets:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": ("mapping_config must include 'account_code' and 'amount'"),
                "missing": sorted(missing_targets),
            },
        )

    # Validate file size (50MB limit) and non-empty
    max_file_size = 50 * 1024 * 1024  # 50MB
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > max_file_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "message": "File exceeds maximum size limit",
                "max_size_mb": 50,
                "actual_size_mb": round(file_size / (1024 * 1024), 2),
            },
        )
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "File is empty"},
        )

    # Fetch the batch and verify ownership + state
    batch_result = (
        ctx.table("import_batches")
        .select("*")
        .eq("id", str(batch_id))
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    if not batch_result or not batch_result.data:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch = cast(dict[str, Any], batch_result.data)

    if batch.get("source_system") != "generic":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Column mapping can only be applied to generic imports.",
        )
    if batch.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Column mapping can only be applied to pending batches. "
                f"Current status: {batch.get('status')}"
            ),
        )

    # Integrity: the re-sent file must match the originally uploaded file
    file_hash = compute_file_hash(file.file)
    if file_hash != batch.get("file_hash"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file does not match the original import.",
        )

    property_id = UUID(str(batch["property_id"]))

    dispatcher = get_dispatcher()
    parser, _ = dispatcher.get_parser(
        file.file,
        file.filename or str(batch.get("file_name") or "unknown"),
        "generic",
    )

    try:
        update_batch_status(batch_id, ctx.organization_id, "processing")

        result = _parse_or_fail(
            parser,
            file.file,
            file.filename or "unknown",
            property_id,
            batch_id,
            ctx.organization_id,
            column_mapping=mapping,
        )

        return _persist_and_complete_batch(
            batch_id=batch_id,
            organization_id=ctx.organization_id,
            property_id=property_id,
            result=result,
            source_system="generic",
            source_confidence=1.0,
        )

    except HTTPException:
        raise
    except Exception as e:
        update_batch_status(
            batch_id,
            ctx.organization_id,
            "failed",
            error_log=[{"message": str(e)}],
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Mapping failed: {str(e)}",
        )


@router.get("/batches", response_model=BatchListResponse)
async def list_import_batches(ctx: OrgContext) -> BatchListResponse:
    """
    List all import batches for the organization.

    Returns the history of file imports with status and summary.

    Args:
        ctx: Organization-scoped context with authenticated user

    Returns:
        List of import batches with status and record counts
    """
    result = (
        ctx.table("import_batches")
        .select(
            "id, file_name, source_system, status, row_count, error_count, created_at"
        )
        .eq("organization_id", str(ctx.organization_id))
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )

    return BatchListResponse(batches=result.data or [])


@router.get("/batches/{batch_id}")
async def get_import_batch(batch_id: UUID, ctx: OrgContext) -> dict[str, Any]:
    """
    Get details of an import batch.

    Returns the full details of an import including any errors.

    Args:
        batch_id: UUID of the import batch
        ctx: Organization-scoped context with authenticated user

    Returns:
        Import batch details with error breakdown
    """
    result = (
        ctx.table("import_batches")
        .select("*")
        .eq("id", str(batch_id))
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found",
        )

    preview_result = (
        ctx.table("gl_entries")
        .select(
            "id, transaction_date, account_code, "
            "account_description, description, amount"
        )
        .eq("import_batch_id", str(batch_id))
        .order("transaction_date")
        .order("account_code")
        .order("id")
        .limit(PREVIEW_ENTRY_LIMIT)
        .execute()
    )

    batch_data = cast(dict[str, Any], result.data)
    batch_data["preview_entries"] = [
        _serialize_preview_entry(entry)
        for entry in cast(list[dict[str, Any]], preview_result.data or [])
    ]

    return batch_data


@router.post(
    "/batches/{batch_id}/retry",
    response_model=RetryBatchResponse,
    dependencies=[Depends(require_org_admin), Depends(require_full_access)],
)
async def retry_import_batch(batch_id: UUID, ctx: OrgContext) -> RetryBatchResponse:
    """
    Retry a failed import batch.

    Re-processes a batch that had errors.
    Requires admin privileges.

    Args:
        batch_id: UUID of the import batch
        ctx: Organization-scoped context with authenticated user

    Returns:
        Retry status and message
    """
    # Fetch batch
    batch_result = (
        ctx.table("import_batches")
        .select("*")
        .eq("id", str(batch_id))
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )

    if not batch_result or not batch_result.data:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch = batch_result.data

    # Validate status
    if batch["status"] != "failed":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only failed batches can be retried. "
                f"Current status: {batch['status']}"
            ),
        )

    # Delete previous GL entries
    deleted_count = delete_batch_entries(batch_id, ctx.organization_id)

    # Reset batch status
    ctx.table("import_batches").update(
        {
            "status": "pending",
            "error_count": 0,
            "error_log": [],
        }
    ).eq("id", str(batch_id)).eq("organization_id", str(ctx.organization_id)).execute()

    return RetryBatchResponse(
        success=True,
        batch_id=batch_id,
        status="pending",
        message=f"Batch reset to pending. Deleted {deleted_count} GL entries.",
    )


@router.delete(
    "/batches/{batch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_admin), Depends(require_full_access)],
)
async def delete_import_batch(batch_id: UUID, ctx: OrgContext) -> None:
    """
    Delete an import batch and its records.

    Removes all GL entries from the batch. Cannot delete if
    entries are used in finalized reconciliations.
    Requires admin privileges.

    Args:
        batch_id: UUID of the import batch
        ctx: Organization-scoped context with authenticated user
    """
    # Fetch batch to verify it exists and get its property_id for the finalized check
    batch_result = (
        ctx.table("import_batches")
        .select("id, property_id")
        .eq("id", str(batch_id))
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    if not batch_result or not batch_result.data:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch = batch_result.data

    # Check if GL entries from this batch are used in any finalized snapshots
    # for the same property — do not block deletions for unrelated properties.
    gl_entries_result = (
        ctx.table("gl_entries")
        .select("id")
        .eq("import_batch_id", str(batch_id))
        .limit(1)
        .execute()
    )

    if gl_entries_result.data:
        finalized_check = (
            ctx.table("reconciliation_snapshots")
            .select("id")
            .eq("property_id", str(batch["property_id"]))
            .eq("organization_id", str(ctx.organization_id))
            .eq("status", "finalized")
            .limit(1)
            .execute()
        )

        if finalized_check.data:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Cannot delete - GL entries may be used in "
                    "finalized reconciliations for this property. Please verify no "
                    "finalized reconciliations depend on this batch."
                ),
            )

    # Delete GL entries
    delete_batch_entries(batch_id, ctx.organization_id)

    # Delete batch
    ctx.table("import_batches").delete().eq("id", str(batch_id)).eq(
        "organization_id", str(ctx.organization_id)
    ).execute()


@router.get("/mappings", response_model=ColumnMappingListResponse)
async def list_column_mappings(
    ctx: OrgContext,
    source_system: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> ColumnMappingListResponse:
    """
    List saved column mappings.

    Returns custom column mappings for generic file imports.

    Args:
        ctx: Organization-scoped context with authenticated user
        source_system: Optional filter by source system (yardi, mri, generic)
        skip: Number of records to skip (pagination)
        limit: Maximum number of records to return

    Returns:
        List of saved column mappings with pagination info
    """
    query = ctx.table("column_mappings").select("*", count="exact")

    # Apply filter if specified
    if source_system:
        query = query.eq("source_system", source_system)

    # Single query: paginated data + exact total count
    result = (
        query.order("created_at", desc=True).range(skip, skip + limit - 1).execute()
    )

    total = result.count if result.count is not None else len(result.data or [])

    # Convert to response models
    mappings = [ColumnMappingResponse(**m) for m in (result.data or [])]

    return ColumnMappingListResponse(mappings=mappings, total=total)


@router.post(
    "/mappings",
    response_model=ColumnMappingResponse,
    status_code=201,
    dependencies=[Depends(require_org_admin), Depends(require_full_access)],
)
async def create_column_mapping(
    request: CreateColumnMappingRequest,
    ctx: OrgContext,
) -> ColumnMappingResponse:
    """
    Create a new column mapping.

    Saves a custom column mapping for reuse with generic imports.
    Requires admin privileges.

    Args:
        request: Column mapping configuration
        ctx: Organization-scoped context with authenticated user

    Returns:
        Created column mapping
    """
    # Validate mapping_config has required keys
    required_keys = {"account_code", "amount", "transaction_date"}
    missing_keys = required_keys - set(request.mapping_config.keys())
    if missing_keys:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required mapping keys: {', '.join(missing_keys)}",
        )

    # Check for duplicate mapping name + source_system
    existing = (
        ctx.table("column_mappings")
        .select("id")
        .eq("name", request.name)
        .eq("source_system", request.source_system)
        .execute()
    )

    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Mapping with name '{request.name}' and source system "
                f"'{request.source_system}' already exists"
            ),
        )

    # Create mapping
    result = (
        ctx.table("column_mappings")
        .insert(
            {
                "organization_id": str(ctx.organization_id),
                "name": request.name,
                "description": request.description,
                "source_system": request.source_system,
                "mapping_config": request.mapping_config,
                "created_by": str(ctx.user.id),
            }
        )
        .execute()
    )

    return ColumnMappingResponse(**result.data[0])


@router.get(
    "/gl-date-range/{property_id}",
    response_model=GlDateRangeResponse,
)
async def get_gl_date_range(
    property_id: UUID,
    ctx: OrgContext,
) -> GlDateRangeResponse:
    """
    Get the date range of GL entries for a property.

    Returns the min and max transaction dates and the primary year of the data.
    Used by the frontend to determine the correct reconciliation period
    rather than assuming currentYear - 1.

    Args:
        property_id: UUID of the property
        ctx: Organization-scoped context with authenticated user

    Returns:
        GlDateRangeResponse with min/max dates and primary year

    Raises:
        HTTPException: 404 if no GL entries found
    """
    result = (
        ctx.table("gl_entries")
        .select("transaction_date")
        .eq("property_id", str(property_id))
        .order("transaction_date")
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No GL entries found for this property",
        )

    min_date = result.data[0]["transaction_date"]

    result_max = (
        ctx.table("gl_entries")
        .select("transaction_date")
        .eq("property_id", str(property_id))
        .order("transaction_date", desc=True)
        .limit(1)
        .execute()
    )

    max_date = result_max.data[0]["transaction_date"]

    # Determine primary year from the max date (most recent GL entry)
    year = int(max_date[:4])

    return GlDateRangeResponse(
        min_date=min_date,
        max_date=max_date,
        year=year,
    )
