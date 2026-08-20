"""
GL Entry persistence layer.

Provides functions to persist, retrieve, and delete GL entries
from the database. Uses chunked batch inserts for performance.

Supports optional validation before persistence (Filter & Warn strategy):
- Invalid rows are filtered out, not inserted
- Valid rows proceed to database
- Validation warnings are returned for user visibility
"""

import logging
import time
from typing import Any, cast
from uuid import UUID

import pandas as pd

from app.database.client import get_supabase_admin
from app.services.ingestion.validation import (
    GLValidationResult,
    validate_gl_dataframe,
)

logger = logging.getLogger(__name__)

IMPORT_BATCH_FK_CONSTRAINT = "gl_entries_import_batch_id_fkey"
IMPORT_BATCH_RETRY_ATTEMPTS = 20
IMPORT_BATCH_RETRY_DELAY_SECONDS = 0.5


def _verify_batch_context(
    client: Any,
    batch_id: UUID,
    organization_id: UUID,
    property_id: UUID | None = None,
) -> None:
    query = (
        client.table("import_batches")
        .select("id")
        .eq("id", str(batch_id))
        .eq("organization_id", str(organization_id))
    )
    if property_id is not None:
        query = query.eq("property_id", str(property_id))
    result = query.limit(1).execute()
    if not result.data:
        raise ValueError("Import batch not found for organization/property context")


def persist_gl_entries(
    df: pd.DataFrame,
    batch_id: UUID,
    property_id: UUID,
    organization_id: UUID,
    chunk_size: int = 500,
    validate: bool = True,
) -> int | tuple[int, GLValidationResult]:
    """
    Persist GL entries from DataFrame to database.

    Uses batch inserts for performance. Handles type conversions
    for dates, decimals, and periods.

    When validate=True (default), invalid rows are filtered out before
    insertion and a GLValidationResult is returned with details.

    AC1: Batch insert from DataFrame
    AC2: Raw row data preserved in JSONB
    AC4: Performance acceptable (5000 rows < 5s via chunking)

    Args:
        df: DataFrame with normalized GL entries
        batch_id: Import batch ID
        property_id: Property these entries belong to
        organization_id: Organization ID for RLS context (required for
            service role inserts)
        chunk_size: Rows per insert batch (default 500)
        validate: If True, validate rows and filter invalid ones (default True)

    Returns:
        If validate=False: Number of rows inserted (int)
        If validate=True: Tuple of (rows_inserted, GLValidationResult)

    Example:
        ```python
        # With validation (default)
        rows, validation = persist_gl_entries(df, batch_id, property_id)
        if validation.invalid_count > 0:
            print(f"Filtered {validation.invalid_count} invalid rows")

        # Without validation (legacy behavior)
        rows = persist_gl_entries(df, batch_id, property_id, validate=False)
        ```
    """
    # Handle empty DataFrame
    if df.empty:
        if validate:
            return 0, GLValidationResult(valid_count=0, invalid_count=0)
        return 0

    # Validate and filter if requested
    validation_result: GLValidationResult | None = None
    if validate:
        df, validation_result = validate_gl_dataframe(df)
        if df.empty:
            # All rows were invalid
            return 0, validation_result

    client = get_supabase_admin()

    # Set organization context for RLS policy validation
    # This allows the service role to insert GL entries by providing
    # organization context that RLS policies can validate against
    from app.database.client import set_organization_context

    set_organization_context(client, str(organization_id))
    _verify_batch_context(client, batch_id, organization_id, property_id)

    # Required columns for GL entries
    required_columns = [
        "account_code",
        "account_description",
        "amount",
        "transaction_date",
        "accrual_date",
        "period_year",
        "period_month",
        "vendor_name",
        "description",
        "raw_row_data",
    ]

    # Ensure all required columns exist
    df = df.copy()
    for col in required_columns:
        if col not in df.columns:
            df[col] = None

    # Add batch and property IDs (organization_id not in gl_entries schema)
    df["import_batch_id"] = str(batch_id)
    df["property_id"] = str(property_id)

    # Convert to records
    records = df[required_columns + ["import_batch_id", "property_id"]].to_dict(
        "records"
    )

    # Convert types for JSON serialization
    for record in records:
        # Convert date/datetime to ISO string
        # FIX: Check for NaT/NaN before conversion - PostgreSQL rejects "NaT" string
        if record["transaction_date"] is not None and not pd.isna(
            record["transaction_date"]
        ):
            if hasattr(record["transaction_date"], "isoformat"):
                record["transaction_date"] = record["transaction_date"].isoformat()
            else:
                record["transaction_date"] = str(record["transaction_date"])
        else:
            record["transaction_date"] = None

        # Convert accrual_date (same pattern as transaction_date)
        if record.get("accrual_date") is not None and not pd.isna(
            record["accrual_date"]
        ):
            if hasattr(record["accrual_date"], "isoformat"):
                record["accrual_date"] = record["accrual_date"].isoformat()
            else:
                record["accrual_date"] = str(record["accrual_date"])
        else:
            record["accrual_date"] = None

        # Serialize amount as string to preserve Decimal precision
        if record["amount"] is not None:
            record["amount"] = str(record["amount"])

        # Ensure periods are int (handles float from pandas)
        # FIX: Guard against NaN like the date fields above. A row with a valid
        # transaction_date but no derivable period leaves a float NaN in an
        # otherwise-int column; int(NaN) raises and would kill the whole batch.
        if record["period_year"] is not None and not pd.isna(record["period_year"]):
            record["period_year"] = int(record["period_year"])
        else:
            record["period_year"] = None
        if record["period_month"] is not None and not pd.isna(record["period_month"]):
            record["period_month"] = int(record["period_month"])
        else:
            record["period_month"] = None

        # Ensure raw_row_data is dict (not None)
        if record["raw_row_data"] is None:
            record["raw_row_data"] = {}

    # Insert in chunks for performance
    # NOTE: Supabase Python client is synchronous - do NOT add await
    # FIX DI-6: Add transaction-like rollback on error
    # If any chunk fails, delete all previously inserted entries for this batch
    total_inserted = 0
    try:
        for i in range(0, len(records), chunk_size):
            chunk = records[i : i + chunk_size]
            attempt = 0
            while True:
                try:
                    result = (
                        client.table("gl_entries")
                        .insert(cast(list[dict[str, Any]], chunk))
                        .execute()
                    )
                    break
                except Exception as insert_error:
                    attempt += 1
                    is_transient_fk = IMPORT_BATCH_FK_CONSTRAINT in str(insert_error)
                    if not is_transient_fk or attempt >= IMPORT_BATCH_RETRY_ATTEMPTS:
                        raise
                    time.sleep(IMPORT_BATCH_RETRY_DELAY_SECONDS)
            inserted_count = len(result.data or [])
            if inserted_count != len(chunk):
                raise RuntimeError(
                    "Inserted GL entry count did not match requested chunk size"
                )
            total_inserted += inserted_count
    except Exception as e:
        # FIX DI-6: Rollback - delete entries already inserted for this batch
        if total_inserted > 0:
            try:
                client.table("gl_entries").delete().eq(
                    "import_batch_id", str(batch_id)
                ).execute()
            except Exception:
                # If rollback also fails, log but still raise original error
                pass
        raise RuntimeError(
            f"Failed to insert GL entries at chunk {i // chunk_size + 1}. "
            f"Rolled back {total_inserted} previously inserted entries. "
            f"Original error: {e}"
        ) from e

    if validate and validation_result is not None:
        return total_inserted, validation_result
    return total_inserted


def delete_batch_entries(batch_id: UUID, organization_id: UUID) -> int:
    """
    Delete all GL entries for a batch (for reprocessing).

    AC5: Rollback on error - enables reprocessing by deleting
    entries and re-importing.

    Args:
        batch_id: Import batch ID

    Returns:
        Number of rows deleted
    """
    client = get_supabase_admin()
    _verify_batch_context(client, batch_id, organization_id)

    # NOTE: Supabase Python client is synchronous - do NOT add await
    result = (
        client.table("gl_entries")
        .delete()
        .eq("import_batch_id", str(batch_id))
        .execute()
    )

    return len(result.data)


def get_batch_entries(batch_id: UUID, organization_id: UUID) -> list[dict[str, Any]]:
    """
    Retrieve all GL entries for a batch.

    Uses pagination to fetch all rows since Supabase/PostgREST has a server-side
    limit of 1000 rows per request.

    Args:
        batch_id: Import batch ID

    Returns:
        List of GL entry records
    """
    client = get_supabase_admin()
    _verify_batch_context(client, batch_id, organization_id)

    # Fetch in pages of 1000 rows to handle server-side limit
    all_data = []
    page_size = 1000
    offset = 0

    while True:
        # NOTE: Supabase Python client is synchronous - do NOT add await
        result = (
            client.table("gl_entries")
            .select("*")
            .eq("import_batch_id", str(batch_id))
            .range(offset, offset + page_size - 1)
            .execute()
        )

        if not result.data:
            break

        all_data.extend(result.data)

        # If we got less than a full page, we're done
        if len(result.data) < page_size:
            break

        offset += page_size

    return cast(list[dict[str, Any]], all_data)
