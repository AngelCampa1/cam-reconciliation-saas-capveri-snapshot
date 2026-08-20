"""Ingestion request/response schemas for API endpoints.

These schemas define the API contract for import batch operations.
They build on the domain models but add API-specific concerns.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ImportBatchSummary(BaseModel):
    """Summary of an import batch for list view.

    Used in list endpoints to provide key import batch information
    without full details.

    Attributes:
        id: Unique batch identifier
        filename: Original filename of imported file
        status: Import status (pending, processing, completed, failed)
        parser_type: Parser used (yardi, mri, generic)
        rows_processed: Total rows read from file
        rows_imported: Successfully imported rows
        rows_failed: Failed rows (validation errors, duplicates, etc.)
        created_at: Import start timestamp (ISO 8601)
        completed_at: Import completion timestamp (ISO 8601), None if in progress
        error_message: Error description if failed, None otherwise
    """

    id: UUID = Field(..., description="Unique batch identifier")
    filename: str = Field(..., description="Original filename")
    status: str = Field(..., description="Import status")
    parser_type: str = Field(..., description="Parser type used")
    rows_processed: int = Field(..., description="Total rows processed", ge=0)
    rows_imported: int = Field(..., description="Successfully imported rows", ge=0)
    rows_failed: int = Field(..., description="Failed rows", ge=0)
    created_at: str = Field(..., description="Import start timestamp")
    completed_at: str | None = Field(None, description="Import completion timestamp")
    error_message: str | None = Field(None, description="Error description if failed")

    class Config:
        """Pydantic model configuration."""

        from_attributes = True  # Allow creation from ORM models
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "filename": "yardi_export_2024_q1.csv",
                "status": "completed",
                "parser_type": "yardi",
                "rows_processed": 1547,
                "rows_imported": 1547,
                "rows_failed": 0,
                "created_at": "2024-01-15T10:30:00Z",
                "completed_at": "2024-01-15T10:32:15Z",
                "error_message": None,
            }
        }


class ImportListResponse(BaseModel):
    """Paginated response for import batch listing.

    Used for list endpoints to provide pagination metadata
    alongside the import batch data.

    Attributes:
        imports: List of import batch summaries
        total: Total number of import batches matching filters
    """

    imports: list[ImportBatchSummary] = Field(
        ..., description="List of import batch summaries"
    )
    total: int = Field(..., description="Total number of batches", ge=0)

    class Config:
        """Pydantic model configuration."""

        json_schema_extra = {
            "example": {
                "imports": [
                    {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "filename": "yardi_export_2024_q1.csv",
                        "status": "completed",
                        "parser_type": "yardi",
                        "rows_processed": 1547,
                        "rows_imported": 1547,
                        "rows_failed": 0,
                        "created_at": "2024-01-15T10:30:00Z",
                        "completed_at": "2024-01-15T10:32:15Z",
                        "error_message": None,
                    }
                ],
                "total": 25,
            }
        }


class ColumnMappingResponse(BaseModel):
    """Response schema for column mapping."""

    id: UUID = Field(..., description="Unique mapping identifier")
    name: str = Field(..., description="User-defined mapping name")
    description: str | None = Field(None, description="Optional description")
    source_system: str = Field(..., description="Source system (yardi, mri, generic)")
    mapping_config: dict[str, str] = Field(..., description="Column name mappings")
    created_by: UUID = Field(..., description="User who created this mapping")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        """Pydantic model configuration."""

        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "Yardi GL Template",
                "description": "Standard Yardi Voyager GL export format",
                "source_system": "yardi",
                "mapping_config": {
                    "account_code": "GL Account",
                    "amount": "Amount",
                    "transaction_date": "Date",
                    "description": "Description",
                },
                "created_by": "7a3e8400-e29b-41d4-a716-446655440000",
                "created_at": "2024-01-15T10:30:00Z",
                "updated_at": "2024-01-15T10:30:00Z",
            }
        }


class ColumnMappingListResponse(BaseModel):
    """Paginated response for column mapping listing."""

    mappings: list[ColumnMappingResponse] = Field(
        ..., description="List of column mappings"
    )
    total: int = Field(..., description="Total number of mappings", ge=0)

    class Config:
        """Pydantic model configuration."""

        json_schema_extra = {
            "example": {
                "mappings": [
                    {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "name": "Yardi GL Template",
                        "description": "Standard format",
                        "source_system": "yardi",
                        "mapping_config": {
                            "account_code": "GL Account",
                            "amount": "Amount",
                            "transaction_date": "Date",
                        },
                        "created_by": "7a3e8400-e29b-41d4-a716-446655440000",
                        "created_at": "2024-01-15T10:30:00Z",
                        "updated_at": "2024-01-15T10:30:00Z",
                    }
                ],
                "total": 5,
            }
        }


class CreateColumnMappingRequest(BaseModel):
    """Request schema for creating a column mapping."""

    name: str = Field(..., min_length=1, max_length=255, description="Mapping name")
    description: str | None = Field(
        None, max_length=1000, description="Optional description"
    )
    source_system: str = Field(
        ..., pattern="^(yardi|mri|generic)$", description="Source system type"
    )
    mapping_config: dict[str, str] = Field(
        ..., description="Column name mappings (internal_field -> csv_column)"
    )

    class Config:
        """Pydantic model configuration."""

        json_schema_extra = {
            "example": {
                "name": "Yardi GL Template",
                "description": "Standard Yardi Voyager GL export format",
                "source_system": "yardi",
                "mapping_config": {
                    "account_code": "GL Account",
                    "amount": "Amount",
                    "transaction_date": "Date",
                    "description": "Description",
                },
            }
        }


class RetryBatchResponse(BaseModel):
    """Response schema for batch retry operation."""

    success: bool = Field(..., description="Whether retry was successful")
    batch_id: UUID = Field(..., description="Batch identifier")
    status: str = Field(..., description="New batch status")
    message: str = Field(..., description="Human-readable message")

    class Config:
        """Pydantic model configuration."""

        json_schema_extra = {
            "example": {
                "success": True,
                "batch_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "pending",
                "message": "Batch reset to pending. Deleted 1547 GL entries.",
            }
        }
