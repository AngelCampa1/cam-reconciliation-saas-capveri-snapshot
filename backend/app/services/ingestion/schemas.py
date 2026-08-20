"""Data schemas for ingestion output.

These schemas define the standardized format that all ingestion parsers
must output, regardless of the source ERP system (Yardi, MRI, etc.).
"""

from datetime import date
from decimal import Decimal
from typing import Any

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, field_validator


class GLEntryRow(BaseModel):
    """Schema for a single GL entry row after parsing.

    This is the normalized format that all parsers must produce.
    Each row represents one general ledger transaction.
    """

    model_config = ConfigDict(strict=True)

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


class ParseResult(BaseModel):
    """Result of parsing an ingestion file.

    Contains the parsed DataFrame along with metadata about the parse
    operation including error counts and warnings.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    success: bool = Field(description="True if parsing completed without fatal errors")
    source_system: str = Field(
        ..., description="Detected source system (yardi, mri, generic)"
    )
    data: pd.DataFrame = Field(
        ..., description="Parsed data as pandas DataFrame with standardized columns"
    )
    row_count: int = Field(..., ge=0, description="Number of valid rows parsed")
    error_count: int = Field(
        default=0, ge=0, description="Number of rows that failed validation"
    )
    errors: list[str] = Field(
        default_factory=list, description="List of error messages"
    )
    warnings: list[str] = Field(
        default_factory=list, description="List of warning messages"
    )


class IngestionMetadata(BaseModel):
    """Metadata about a parsed file.

    Used for tracking and reporting on ingestion operations.
    """

    source_system: str = Field(
        ..., description="Detected source system (yardi, mri, generic)"
    )
    file_name: str = Field(..., description="Original file name")
    row_count: int = Field(..., ge=0, description="Number of rows parsed")
    error_count: int = Field(default=0, ge=0, description="Number of rows with errors")
    warnings: list[str] = Field(
        default_factory=list, description="Warning messages from parsing"
    )


# ---------------------------------------------------------------------------
# Rent Roll Schemas
# ---------------------------------------------------------------------------


class RentRollRow(BaseModel):
    """Schema for a single rent roll row after parsing.

    Represents one unit/suite from a rent roll export.
    Optional fields support both occupied and vacant units.
    """

    model_config = ConfigDict(strict=True)

    # Required unit information
    unit_number: str = Field(..., min_length=1, max_length=50)
    rentable_sqft: Decimal = Field(..., description="Total rentable square footage")

    # Optional unit details
    usable_sqft: Decimal | None = Field(None, description="Usable square footage")
    floor: int | None = Field(None, description="Floor number")

    # Optional tenant/lease information (None for vacant units)
    tenant_name: str | None = Field(None, max_length=255)
    lease_start: date | None = Field(None, description="Lease commencement date")
    lease_end: date | None = Field(None, description="Lease expiration date")
    base_rent: Decimal | None = Field(None, description="Monthly or annual base rent")
    cam_share: Decimal | None = Field(
        None, description="CAM/pro-rata share as decimal (e.g., 0.05 = 5%)"
    )

    # Raw data for debugging
    raw_row_data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("rentable_sqft")
    @classmethod
    def positive_rentable_sqft(cls, v: Decimal) -> Decimal:
        """Validate that rentable_sqft is positive."""
        if v <= 0:
            raise ValueError(f"Rentable sqft must be positive, got {v}")
        return v

    @field_validator("usable_sqft")
    @classmethod
    def positive_usable_sqft(cls, v: Decimal | None) -> Decimal | None:
        """Validate that usable_sqft is positive if provided."""
        if v is not None and v <= 0:
            raise ValueError(f"Usable sqft must be positive, got {v}")
        return v


class PropertyMetadata(BaseModel):
    """Property metadata extracted from rent roll header or filename.

    All fields are optional since detection may be partial.
    """

    name: str | None = Field(None, max_length=255)
    address_line1: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=2)
    postal_code: str | None = Field(None, max_length=20)


class RentRollParseResult(BaseModel):
    """Result of parsing a rent roll file.

    Contains property metadata, unit/lease data, and parse statistics.
    Used for preview before import and for the actual import operation.
    """

    success: bool = Field(description="True if parsing completed without fatal errors")
    source_system: str = Field(
        ..., description="Detected source system (yardi_rent_roll, mri_rent_roll, etc.)"
    )
    property_metadata: PropertyMetadata = Field(
        ..., description="Extracted property information"
    )
    units: list[RentRollRow] = Field(..., description="Parsed unit/lease data")
    row_count: int = Field(..., ge=0, description="Number of valid rows parsed")
    error_count: int = Field(
        default=0, ge=0, description="Number of rows that failed validation"
    )
    errors: list[str] = Field(
        default_factory=list, description="List of error messages"
    )
    warnings: list[str] = Field(
        default_factory=list, description="List of warning messages"
    )
