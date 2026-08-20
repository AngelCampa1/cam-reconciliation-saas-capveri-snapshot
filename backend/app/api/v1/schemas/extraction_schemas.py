"""Pydantic schemas for extraction API endpoints.

Request and response models for extraction approval and verification workflows.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import DocumentStatus
from app.models.lease_recovery_profile import LeaseRecoveryProfile


class EditAction(BaseModel):
    """Represents a single edit action during verification.

    Tracks what field was changed, from what value to what value, and when.
    """

    field: str = Field(..., description="Name of the field that was edited")
    old_value: str | None = Field(None, description="Original value before edit")
    new_value: str | None = Field(None, description="New value after edit")
    timestamp: str = Field(..., description="ISO timestamp when edit was made")


class ApproveExtractionRequest(BaseModel):
    """Request body for approving an extraction.

    Contains the verified lease recovery profile and the edit history
    for audit trail purposes.
    """

    profile: LeaseRecoveryProfile = Field(
        ..., description="Verified lease recovery profile to commit"
    )
    edit_history: list[EditAction] = Field(
        default_factory=list,
        description="List of all edits made during verification",
    )
    lease_id: UUID | None = Field(
        default=None,
        description="Lease ID override — required when document has no lease linked",
    )


class ApproveExtractionResponse(BaseModel):
    """Response after successfully approving an extraction."""

    success: bool = Field(..., description="Whether approval was successful")
    lease_id: UUID = Field(..., description="ID of the lease that was created/updated")


class SaveDraftRequest(BaseModel):
    """Request body for saving a draft during verification."""

    profile: dict[str, Any] = Field(..., description="Current draft profile state")


class SaveDraftResponse(BaseModel):
    """Response after saving a draft."""

    success: bool = Field(..., description="Whether save was successful")
    message: str = Field(default="Draft saved successfully")


class RejectExtractionRequest(BaseModel):
    """Request body for rejecting an extraction.

    Contains the rejection reason and optional notes for audit trail.
    """

    reason: str = Field(..., description="Rejection reason code")
    notes: str | None = Field(None, description="Additional notes about rejection")
    requeue: bool = Field(
        default=False, description="Whether to requeue for reprocessing"
    )


class RejectExtractionResponse(BaseModel):
    """Response after successfully rejecting an extraction."""

    success: bool = Field(..., description="Whether rejection was successful")
    message: str = Field(default="Extraction rejected successfully")


class ExtractionListItem(BaseModel):
    """Summary of an extraction for list view."""

    id: UUID = Field(..., description="Document ID")
    filename: str = Field(..., description="Original filename")
    status: DocumentStatus = Field(..., description="Processing status")
    created_at: datetime = Field(..., description="Upload timestamp")
    processed_at: datetime | None = Field(
        None, description="Processing completion time"
    )
    verified_at: datetime | None = Field(None, description="Verification timestamp")
    average_confidence: float | None = Field(
        None, ge=0.0, le=1.0, description="Average confidence score across all fields"
    )
    low_confidence_count: int = Field(
        default=0, ge=0, description="Number of fields with confidence < 0.7"
    )


class ExtractionDetail(BaseModel):
    """Full details of an extraction for verification page."""

    id: UUID = Field(..., description="Document ID")
    filename: str = Field(..., description="Original filename")
    status: DocumentStatus = Field(..., description="Processing status")
    storage_bucket: str = Field(..., description="Object storage bucket name")
    storage_key: str = Field(..., description="Object storage key")
    document_url: str = Field(..., description="Presigned URL for document access")
    content_type: str = Field(..., description="MIME type")
    file_size_bytes: int = Field(..., description="File size in bytes")
    extraction_result: dict[str, Any] | None = Field(
        None, description="Extracted data including OCR results and profile"
    )
    created_at: datetime = Field(..., description="Upload timestamp")
    processed_at: datetime | None = Field(
        None, description="Processing completion time"
    )
    verified_at: datetime | None = Field(None, description="Verification timestamp")
    verified_by: UUID | None = Field(None, description="User who verified")
    property_id: UUID = Field(..., description="Property this document belongs to")
    lease_id: UUID | None = Field(None, description="Associated lease ID")
    edit_history: list[dict[str, Any]] = Field(
        default_factory=list, description="Edit history from verification"
    )


class ExtractionListResponse(BaseModel):
    """Paginated list of extractions."""

    items: list[ExtractionListItem] = Field(..., description="List of extractions")
    total: int = Field(..., ge=0, description="Total number of extractions")
    page: int = Field(..., ge=1, description="Current page number")
    page_size: int = Field(..., ge=1, le=100, description="Items per page")
    has_next: bool = Field(..., description="Whether there are more pages")


class ExtractionProcessResponse(BaseModel):
    """Response from processing an extraction."""

    success: bool = Field(..., description="Whether processing was successful")
    document_id: UUID = Field(..., description="ID of the processed document")
    job_id: UUID | None = Field(None, description="Background extraction job ID")
    status: DocumentStatus = Field(..., description="Current document status")
    message: str = Field(..., description="Processing result message")
    extraction_result: dict[str, Any] | None = Field(
        None, description="Extracted data including OCR and profile"
    )
    tokens_used: int | None = Field(None, description="Number of LLM tokens used")
    processing_time_seconds: float | None = Field(
        None, description="Total processing time in seconds"
    )
