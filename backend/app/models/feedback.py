"""Feedback domain model for user bug reports and feature requests.

This module defines the Feedback entity for collecting user feedback,
including bug reports, feature requests, and general comments.
Supports screenshot attachments and rich metadata for debugging.
"""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FeedbackType(str, Enum):
    """Type of feedback submitted.

    Categorizes the nature of user feedback.
    """

    BUG = "bug"
    FEATURE_REQUEST = "feature_request"
    GENERAL = "general"


class FeedbackStatus(str, Enum):
    """Current status of feedback item.

    Tracks the lifecycle of feedback through review process.
    """

    NEW = "new"
    REVIEWED = "reviewed"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class FeedbackBase(BaseModel):
    """Base feedback fields shared across DTOs.

    Contains core feedback information required for all operations.
    """

    type: FeedbackType = Field(
        ...,
        description="Category of feedback",
    )
    message: str = Field(
        ...,
        min_length=10,
        max_length=5000,
        description="Detailed feedback message",
    )
    page_url: str = Field(
        ...,
        max_length=2000,
        description="URL where feedback was submitted",
    )


class FeedbackCreate(FeedbackBase):
    """DTO for creating new feedback.

    Used when users submit feedback from the application.
    """

    screenshot_url: str | None = Field(
        default=None,
        description="URL to uploaded screenshot image",
    )
    user_agent: str | None = Field(
        default=None,
        max_length=500,
        description="Browser user agent string",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional context (browser, viewport, errors)",
    )


class FeedbackUpdate(BaseModel):
    """DTO for updating feedback (admin only).

    All fields are optional - only provided fields are updated.
    """

    status: FeedbackStatus | None = Field(
        default=None,
        description="New status for the feedback",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Updated metadata",
    )


class Feedback(FeedbackBase):
    """Full feedback model with all fields.

    Represents a complete feedback record as stored in the database.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(
        ...,
        description="Unique feedback identifier",
    )
    user_id: UUID = Field(
        ...,
        description="User who submitted the feedback",
    )
    organization_id: UUID = Field(
        ...,
        description="Organization the user belongs to",
    )
    status: FeedbackStatus = Field(
        default=FeedbackStatus.NEW,
        description="Current review status",
    )
    screenshot_url: str | None = Field(
        default=None,
        description="URL to uploaded screenshot image",
    )
    user_agent: str | None = Field(
        default=None,
        description="Browser user agent string",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional context (browser, viewport, errors)",
    )
    created_at: datetime = Field(
        ...,
        description="When the feedback was submitted",
    )
    updated_at: datetime = Field(
        ...,
        description="When the feedback was last updated",
    )


class FeedbackSummary(BaseModel):
    """Lightweight feedback view for listings.

    Contains essential feedback info for admin dashboards.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique feedback identifier")
    type: FeedbackType = Field(description="Category of feedback")
    status: FeedbackStatus = Field(description="Current review status")
    message: str = Field(description="Feedback message (may be truncated)")
    page_url: str = Field(description="URL where feedback was submitted")
    created_at: datetime = Field(description="When submitted")
