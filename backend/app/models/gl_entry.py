"""GLEntry domain model for general ledger entries.

The GLEntry model stores normalized general ledger entries imported from
CSV/Excel files. Amounts are stored as signed decimals (positive=debit,
negative=credit) to simplify aggregation.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GLEntry(BaseModel):
    """Full GL entry model from database.

    Stores normalized general ledger data with the original raw row
    preserved as JSONB for audit purposes.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    import_batch_id: UUID = Field(description="Links to the import batch")
    property_id: UUID = Field(description="Property this entry belongs to")
    account_code: str = Field(
        ..., min_length=1, max_length=50, description="GL account number"
    )
    account_description: str = Field(..., max_length=255)
    amount: Decimal = Field(
        ..., description="Signed amount: positive=debit, negative=credit"
    )
    transaction_date: date = Field(description="Date of the transaction")
    accrual_date: date | None = Field(
        None, description="Invoice/service date for accrual-basis filtering"
    )
    period_year: int = Field(..., ge=1990, le=2100, description="Fiscal year")
    period_month: int = Field(..., ge=1, le=12, description="Fiscal month (1-12)")
    vendor_name: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=1000)
    raw_row_data: dict[str, Any] = Field(
        default_factory=dict, description="Original CSV row as JSONB"
    )
    created_at: datetime


class GLEntryCreate(BaseModel):
    """DTO for creating a GL entry from parser output.

    Used by ingestion parsers to create normalized GL entries.
    """

    import_batch_id: UUID
    property_id: UUID
    account_code: str = Field(..., min_length=1, max_length=50)
    account_description: str = Field(..., max_length=255)
    amount: Decimal = Field(
        ..., description="Signed amount: positive=debit, negative=credit"
    )
    transaction_date: date
    accrual_date: date | None = None
    period_year: int = Field(..., ge=1990, le=2100)
    period_month: int = Field(..., ge=1, le=12)
    vendor_name: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=1000)
    raw_row_data: dict[str, Any] = Field(default_factory=dict)


class GLEntryUpdate(BaseModel):
    """DTO for updating a GL entry.

    Limited update capability - most fields are immutable after import.
    Only description and vendor_name can be corrected.
    """

    vendor_name: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=1000)


class GLEntrySummary(BaseModel):
    """Aggregated GL entries for reporting.

    Used for displaying expense pool totals and account summaries.
    """

    model_config = ConfigDict(from_attributes=True)

    account_code: str
    account_description: str
    total_amount: Decimal = Field(description="Sum of all entry amounts")
    entry_count: int = Field(..., ge=0, description="Number of entries aggregated")
