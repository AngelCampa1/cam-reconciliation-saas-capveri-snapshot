"""
Import batch tracking and deduplication.

Tracks import batches with status and deduplication to prevent
accidental duplicate imports of the same file.
"""

import hashlib
import logging
from datetime import datetime
from enum import Enum
from typing import Any, BinaryIO, cast
from uuid import UUID, uuid4

import sentry_sdk
from pydantic import BaseModel, Field

from app.database.client import get_supabase_admin

logger = logging.getLogger(__name__)


class BatchStatus(str, Enum):
    """Import batch status values."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportBatch(BaseModel):
    """Import batch record."""

    id: UUID
    organization_id: UUID
    property_id: UUID
    file_name: str
    file_hash: str
    source_system: str
    status: str = "pending"
    row_count: int = 0
    error_count: int = 0
    error_log: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


def compute_file_hash(file: BinaryIO) -> str:
    """
    Compute SHA256 hash of file contents.

    AC1: SHA256 hash computed for uploaded files.

    Args:
        file: File-like object to hash

    Returns:
        64-character hexadecimal SHA256 hash
    """
    sha256 = hashlib.sha256()
    file.seek(0)
    for chunk in iter(lambda: file.read(8192), b""):
        sha256.update(chunk)
    file.seek(0)  # Reset position for subsequent reads
    return sha256.hexdigest()


def check_duplicate(
    organization_id: UUID,
    file_hash: str,
    allow_failed_reimport: bool = True,
) -> ImportBatch | None:
    """
    Check if file has already been successfully imported.

    AC2: Duplicate files rejected with clear message.

    FIX DI-13: Only considers completed/processing imports as duplicates.
    Failed imports can be re-uploaded by default.

    Args:
        organization_id: Organization UUID
        file_hash: SHA256 hash of the file
        allow_failed_reimport: If True, failed imports don't block re-upload

    Returns:
        ImportBatch if duplicate found, None otherwise
    """
    client = get_supabase_admin()

    # FIX DI-13: Only block if previous import succeeded or is in progress
    # Failed imports should be allowed to retry
    blocking_statuses = [BatchStatus.COMPLETED.value, BatchStatus.PROCESSING.value]
    if not allow_failed_reimport:
        blocking_statuses.extend([BatchStatus.FAILED.value, BatchStatus.PENDING.value])

    # NOTE: Supabase Python client is synchronous - do NOT add await
    result = (
        client.table("import_batches")
        .select("*")
        .eq("organization_id", str(organization_id))
        .eq("file_hash", file_hash)
        .in_("status", blocking_statuses)
        .execute()
    )

    if result.data:
        data_list = cast(list[dict[str, Any]], result.data)
        return ImportBatch(**data_list[0])
    return None


def create_batch(
    organization_id: UUID,
    property_id: UUID,
    file_name: str,
    file_hash: str,
    source_system: str,
) -> ImportBatch:
    """
    Create a new import batch record with race condition protection.

    AC5: Batch ID returned for status polling.

    FIX DI-14: Uses optimistic locking to prevent duplicate batches from
    concurrent requests. After inserting, checks for duplicates and rolls
    back if another batch was created first.

    Args:
        organization_id: Organization UUID
        property_id: Property UUID
        file_name: Original file name
        file_hash: SHA256 hash of the file
        source_system: Source ERP system identifier

    Returns:
        Created ImportBatch with ID for polling

    Raises:
        DuplicateFileError: If concurrent request created duplicate batch
    """
    client = get_supabase_admin()

    batch_id = uuid4()

    data = {
        "id": str(batch_id),
        "organization_id": str(organization_id),
        "property_id": str(property_id),
        "file_name": file_name,
        "file_hash": file_hash,
        "source_system": source_system,
        "status": "pending",
    }

    # NOTE: Supabase Python client is synchronous - do NOT add await
    result = client.table("import_batches").insert(data).execute()
    data_list = cast(list[dict[str, Any]], result.data)
    created_batch = ImportBatch(**data_list[0])

    # FIX DI-14: Check for race condition after insert
    # If another batch with same hash was created concurrently, rollback ours
    all_batches = (
        client.table("import_batches")
        .select("id, created_at")
        .eq("organization_id", str(organization_id))
        .eq("file_hash", file_hash)
        .in_("status", [BatchStatus.PENDING.value, BatchStatus.PROCESSING.value])
        .order("created_at", desc=False)
        .execute()
    )

    # If more than one batch exists, keep only the first one (oldest)
    if len(all_batches.data) > 1:
        batch_list = cast(list[dict[str, Any]], all_batches.data)
        first_batch_id = batch_list[0]["id"]
        if str(batch_id) != first_batch_id:
            # We're not the first - rollback our batch
            try:
                client.table("import_batches").delete().eq(
                    "id", str(batch_id)
                ).execute()
            except Exception:
                pass  # Best effort rollback
            # Return the existing batch (or raise error)
            existing = check_duplicate(organization_id, file_hash)
            if existing:
                raise DuplicateFileError(existing)

    sentry_sdk.metrics.count(
        "cam.import.batch.started",
        1.0,
        attributes={"source_system": source_system},
    )
    return created_batch


def update_batch_status(
    batch_id: UUID,
    organization_id: UUID,
    status: str,
    row_count: int | None = None,
    error_count: int | None = None,
    error_log: list[dict[str, Any]] | None = None,
) -> ImportBatch:
    """
    Update batch status and counts.

    AC3: Status tracked (pending, processing, completed, failed).
    AC4: Error log stored for failed imports.

    Args:
        batch_id: Batch UUID
        organization_id: Organization UUID
        status: New status (pending, processing, completed, failed)
        row_count: Number of rows processed
        error_count: Number of errors encountered
        error_log: List of error messages

    Returns:
        Updated ImportBatch
    """
    if status not in {item.value for item in BatchStatus}:
        raise ValueError(f"Invalid import batch status: {status}")

    client = get_supabase_admin()

    update_data: dict[str, Any] = {"status": status}

    if row_count is not None:
        update_data["row_count"] = row_count
    if error_count is not None:
        update_data["error_count"] = error_count
    if error_log is not None:
        update_data["error_log"] = error_log

    # NOTE: Supabase Python client is synchronous - do NOT add await
    result = (
        client.table("import_batches")
        .update(update_data)
        .eq("id", str(batch_id))
        .eq("organization_id", str(organization_id))
        .execute()
    )

    data_list = cast(list[dict[str, Any]], result.data)
    if not data_list:
        raise ValueError("Import batch not found for organization")
    if status in (BatchStatus.COMPLETED.value, BatchStatus.FAILED.value):
        sentry_sdk.metrics.count(
            "cam.import.batch.finished",
            1.0,
            attributes={"status": status},
        )
    return ImportBatch(**data_list[0])


class DuplicateFileError(Exception):
    """
    File has already been imported.

    AC2: Duplicate files rejected with clear message.
    """

    def __init__(self, existing_batch: ImportBatch):
        self.existing_batch = existing_batch
        super().__init__(
            f"File was already imported on {existing_batch.created_at} "
            f"(batch {existing_batch.id})"
        )
