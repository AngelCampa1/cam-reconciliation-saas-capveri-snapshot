"""OCR Result domain model for storing parsed extraction results."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TextBlockData(BaseModel):
    """Serializable text block for JSONB storage.

    Contains the essential data from a parsed text block
    suitable for database persistence.
    """

    model_config = ConfigDict(frozen=True)

    text: str = Field(description="Extracted text content")
    block_type: str = Field(description="Type of block: LINE, WORD")
    confidence: float = Field(ge=0, le=100, description="Confidence score 0-100")
    left: float = Field(ge=0, le=1, description="Left position (normalized 0-1)")
    top: float = Field(ge=0, le=1, description="Top position (normalized 0-1)")
    width: float = Field(ge=0, le=1, description="Width (normalized 0-1)")
    height: float = Field(ge=0, le=1, description="Height (normalized 0-1)")


class KeyValueData(BaseModel):
    """Serializable key-value pair for JSONB storage.

    Contains form field extractions from KEY_VALUE_SET blocks.
    """

    model_config = ConfigDict(frozen=True)

    key: str = Field(description="Field label/key")
    value: str = Field(description="Field value")
    confidence: float = Field(ge=0, le=100, description="Confidence score 0-100")


class TableData(BaseModel):
    """Serializable table for JSONB storage.

    Contains extracted table data as rows of dictionaries
    with headers as keys.
    """

    model_config = ConfigDict(frozen=True)

    headers: list[str] = Field(default_factory=list, description="Column headers")
    rows: list[dict[str, str]] = Field(
        default_factory=list, description="Data rows as dicts"
    )
    row_count: int = Field(ge=0, description="Number of data rows")
    column_count: int = Field(ge=0, description="Number of columns")


class OCRResult(BaseModel):
    """Full OCR result model from database.

    Represents parsed OCR results for a single page of a document.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID = Field(description="Source document reference")
    organization_id: UUID = Field(description="Organization that owns this result")
    page_number: int = Field(ge=1, description="Page number (1-indexed)")
    text_blocks: list[dict[str, Any]] = Field(
        default_factory=list, description="Parsed text blocks with coordinates"
    )
    tables: list[dict[str, Any]] = Field(
        default_factory=list, description="Extracted tables as row data"
    )
    key_value_pairs: list[dict[str, Any]] = Field(
        default_factory=list, description="Form key-value pairs"
    )
    full_text: str = Field(default="", description="Full text for search")
    reader_job_id: str = Field(
        ...,
        max_length=255,
        description="Document reader job identifier",
    )
    extracted_at: datetime = Field(description="When extraction was performed")
    created_at: datetime
    updated_at: datetime


class OCRResultCreate(BaseModel):
    """DTO for creating an OCR result record.

    Used when persisting parsed extraction results.
    """

    document_id: UUID
    organization_id: UUID
    page_number: int = Field(ge=1)
    text_blocks: list[dict[str, Any]] = Field(default_factory=list)
    tables: list[dict[str, Any]] = Field(default_factory=list)
    key_value_pairs: list[dict[str, Any]] = Field(default_factory=list)
    full_text: str = Field(default="")
    reader_job_id: str = Field(
        ...,
        max_length=255,
    )
    extracted_at: datetime | None = None


class OCRResultResponse(BaseModel):
    """Response model for OCR result API endpoints.

    Returns OCR result data for client display.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    page_number: int
    text_blocks: list[dict[str, Any]]
    tables: list[dict[str, Any]]
    key_value_pairs: list[dict[str, Any]]
    full_text: str
    extracted_at: datetime
    created_at: datetime


class OCRResultSummary(BaseModel):
    """Summary model for OCR results list views.

    Lightweight representation without full content.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    page_number: int
    text_block_count: int = Field(ge=0)
    table_count: int = Field(ge=0)
    key_value_count: int = Field(ge=0)
    extracted_at: datetime


class DocumentOCRSummary(BaseModel):
    """Summary of all OCR results for a document.

    Aggregates page-level results for document overview.
    """

    document_id: UUID
    total_pages: int = Field(default=0, ge=0)
    total_text_blocks: int = Field(default=0, ge=0)
    total_tables: int = Field(default=0, ge=0)
    total_key_values: int = Field(default=0, ge=0)
    pages: list[OCRResultSummary] = Field(default_factory=list)
