"""Document domain model for OCR pipeline.

Documents represent uploaded files (PDFs, images) that are processed
through the OCR pipeline for data extraction.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.models.enums import DocumentStatus, DocumentType


class Document(BaseModel):
    """Full document model from database.

    Represents an uploaded document stored in object storage and tracked
    through the OCR processing pipeline.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID = Field(description="Organization that owns this document")
    property_id: UUID = Field(description="Property this document is associated with")
    filename: str = Field(
        ..., min_length=1, max_length=255, description="Original filename"
    )
    storage_key: str = Field(
        ...,
        min_length=1,
        max_length=1024,
        description="Object storage key",
        validation_alias=AliasChoices("storage_key", "s3_key"),
    )
    storage_bucket: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Object storage bucket name",
        validation_alias=AliasChoices("storage_bucket", "s3_bucket"),
    )
    content_type: str = Field(
        default="application/pdf", max_length=100, description="MIME type"
    )
    file_size_bytes: int = Field(..., ge=0, description="File size in bytes")
    document_type: DocumentType = Field(
        default=DocumentType.LEASE, description="Type of document"
    )
    status: DocumentStatus = Field(
        default=DocumentStatus.PENDING, description="Processing status"
    )
    reader_job_id: str | None = Field(
        None,
        max_length=255,
        description="Document reader job identifier",
        validation_alias=AliasChoices("reader_job_id", "textract_job_id"),
    )
    extraction_result: dict[str, Any] | None = Field(
        None, description="Extracted data as JSONB"
    )
    error_message: str | None = Field(
        None, max_length=2000, description="Error details if failed"
    )
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None = Field(
        None, description="When OCR processing completed"
    )
    # Verification fields (HITL workflow)
    verified_by: UUID | None = Field(
        None, description="User who approved the extraction"
    )
    verified_at: datetime | None = Field(
        None, description="When the extraction was verified and approved"
    )
    edit_history: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Array of edit actions made during verification",
    )
    lease_id: UUID | None = Field(
        None, description="Lease record created/updated from this extraction"
    )


class DocumentCreate(BaseModel):
    """DTO for creating a document record.

    Used when uploading a new document to the system.
    """

    property_id: UUID
    filename: str = Field(..., min_length=1, max_length=255)
    storage_key: str = Field(
        ...,
        min_length=1,
        max_length=1024,
    )
    storage_bucket: str = Field(
        ...,
        min_length=1,
        max_length=255,
    )
    content_type: str = Field(default="application/pdf", max_length=100)
    file_size_bytes: int = Field(..., ge=0)
    document_type: DocumentType = Field(default=DocumentType.LEASE)


class DocumentUpdate(BaseModel):
    """DTO for updating a document record.

    Used to update processing status and results.
    """

    status: DocumentStatus | None = None
    reader_job_id: str | None = Field(
        None,
        max_length=255,
    )
    extraction_result: dict[str, Any] | None = None
    error_message: str | None = Field(None, max_length=2000)
    processed_at: datetime | None = None
    # Verification fields
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    edit_history: list[dict[str, Any]] | None = None
    lease_id: UUID | None = None


class DocumentResponse(BaseModel):
    """Response model for document API endpoints.

    Includes all document fields for client display.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    property_id: UUID
    filename: str
    content_type: str
    file_size_bytes: int
    document_type: DocumentType
    status: DocumentStatus
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None = None


class DocumentUploadResponse(BaseModel):
    """Response model for successful document upload.

    Returns the document ID for status tracking.
    """

    document_id: UUID
    status: DocumentStatus = DocumentStatus.PENDING
    message: str = "Document uploaded successfully"
