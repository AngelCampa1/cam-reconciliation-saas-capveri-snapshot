"""Dispute-related Pydantic models."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DisputeCategory, DisputeStatus

# Re-export for backwards compatibility
__all__ = [
    "DisputeCategory",
    "DisputeStatus",
    "DisputeBase",
    "Dispute",
    "DisputeComment",
    "DisputeCommentDTO",
    "DisputeDetailDTO",
    "DisputeSummaryDTO",
    "AddCommentRequest",
    "UpdateStatusRequest",
    "DisputeAttachmentDTO",
    "RateLimitError",
]


# Base models
class DisputeBase(BaseModel):
    """Base fields for a dispute."""

    tenant_user_id: UUID = Field(description="Tenant user who created the dispute")
    statement_id: UUID = Field(description="Reconciliation snapshot being disputed")
    organization_id: UUID = Field(description="Organization that owns this dispute")
    category: DisputeCategory = Field(description="Category of the dispute")
    description: str = Field(
        max_length=5000, description="Detailed description of the issue"
    )
    status: DisputeStatus = Field(
        default=DisputeStatus.OPEN, description="Current status of the dispute"
    )


class Dispute(DisputeBase):
    """Full dispute model from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique dispute identifier")
    assigned_to: UUID | None = Field(
        default=None, description="User assigned to resolve this dispute"
    )
    resolution_summary: str | None = Field(
        default=None, max_length=5000, description="Summary of the resolution"
    )
    resolved_at: datetime | None = Field(
        default=None, description="When the dispute was resolved"
    )
    resolved_by: UUID | None = Field(
        default=None, description="User who resolved the dispute"
    )
    created_at: datetime = Field(description="When the dispute was created")
    updated_at: datetime = Field(description="When the dispute was last updated")


class DisputeCommentBase(BaseModel):
    """Base fields for a dispute comment."""

    dispute_id: UUID = Field(description="Dispute this comment belongs to")
    author_id: UUID = Field(description="User who wrote the comment")
    content: str = Field(max_length=5000, description="Comment content")
    is_internal: bool = Field(
        default=False,
        description="Whether this comment is internal (hidden from tenant)",
    )


class DisputeComment(DisputeCommentBase):
    """Full dispute comment model from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique comment identifier")
    created_at: datetime = Field(description="When the comment was created")


class DisputeAttachmentBase(BaseModel):
    """Base fields for a dispute attachment."""

    dispute_id: UUID = Field(description="Dispute this attachment belongs to")
    uploaded_by: UUID = Field(description="User who uploaded the file")
    filename: str = Field(max_length=255, description="Original filename")
    storage_path: str = Field(max_length=500, description="Path in storage bucket")
    file_size: int = Field(description="File size in bytes")
    mime_type: str = Field(max_length=100, description="MIME type of the file")


class DisputeAttachment(DisputeAttachmentBase):
    """Full dispute attachment model from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique attachment identifier")
    created_at: datetime = Field(description="When the attachment was uploaded")


# DTOs for API requests/responses
class CreateDisputeRequest(BaseModel):
    """Request to create a new dispute."""

    statement_id: UUID = Field(description="Reconciliation snapshot being disputed")
    category: DisputeCategory = Field(description="Category of the dispute")
    description: str = Field(
        min_length=10, max_length=5000, description="Detailed description of the issue"
    )


class DisputeSummaryDTO(BaseModel):
    """Summary DTO for dispute list views."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category: DisputeCategory
    status: DisputeStatus
    description: str
    created_at: datetime
    statement_id: UUID


class DisputeDetailDTO(BaseModel):
    """Detailed DTO including comments and attachments."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_user_id: UUID
    statement_id: UUID
    organization_id: UUID
    category: DisputeCategory
    description: str
    status: DisputeStatus
    assigned_to: UUID | None
    resolution_summary: str | None
    resolved_at: datetime | None
    resolved_by: UUID | None
    created_at: datetime
    updated_at: datetime
    comments: list[DisputeCommentDTO] = []
    attachments: list[DisputeAttachmentDTO] = []


class DisputeCommentDTO(BaseModel):
    """DTO for dispute comment responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dispute_id: UUID
    author_id: UUID
    author_name: str = "Unknown"
    content: str
    is_internal: bool
    created_at: datetime


class DisputeAttachmentDTO(BaseModel):
    """DTO for dispute attachment responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    file_url: str
    file_size_bytes: int
    content_type: str
    created_at: datetime


class AddCommentRequest(BaseModel):
    """Request to add a comment to a dispute."""

    content: str = Field(min_length=1, max_length=5000, description="Comment content")
    is_internal: bool = Field(
        default=False, description="Whether this comment is internal"
    )


class UpdateStatusRequest(BaseModel):
    """Request to update dispute status (admin only)."""

    status: DisputeStatus = Field(description="New status")
    resolution_summary: str | None = Field(
        default=None, max_length=5000, description="Resolution summary if resolving"
    )


# Error classes
class RateLimitError(Exception):
    """Raised when rate limit is exceeded."""

    pass
