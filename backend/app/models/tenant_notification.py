"""Tenant notification models for in-app and email notifications."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import NotificationType


class TenantNotificationBase(BaseModel):
    """Base fields for TenantNotification."""

    tenant_user_id: UUID = Field(description="Tenant user ID")
    notification_type: NotificationType = Field(description="Type of notification")
    title: str = Field(
        max_length=255,
        description="Notification title",
    )
    message: str = Field(
        max_length=1000,
        description="Notification message content",
    )
    link_url: str | None = Field(
        default=None,
        max_length=500,
        description="Optional URL to link to from notification",
    )
    related_entity_id: UUID | None = Field(
        default=None,
        description="Optional related entity ID (e.g., statement_id, dispute_id)",
    )


class TenantNotification(TenantNotificationBase):
    """Full tenant notification model from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique notification identifier")
    read_at: datetime | None = Field(
        default=None,
        description="When notification was marked as read",
    )
    created_at: datetime = Field(description="When notification was created")


class TenantEmailPreferencesBase(BaseModel):
    """Base fields for TenantEmailPreferences."""

    new_statement_emails: bool = Field(
        default=True,
        description="Receive emails for new statements",
    )
    dispute_update_emails: bool = Field(
        default=True,
        description="Receive emails for dispute updates",
    )
    reminder_emails: bool = Field(
        default=True,
        description="Receive reminder emails",
    )
    marketing_emails: bool = Field(
        default=False,
        description="Receive marketing emails",
    )


class TenantEmailPreferencesUpdate(BaseModel):
    """DTO for updating email preferences."""

    new_statement_emails: bool | None = None
    dispute_update_emails: bool | None = None
    reminder_emails: bool | None = None
    marketing_emails: bool | None = None


class TenantEmailPreferences(TenantEmailPreferencesBase):
    """Full tenant email preferences model from database."""

    model_config = ConfigDict(from_attributes=True)

    tenant_user_id: UUID = Field(description="Tenant user ID")
    updated_at: datetime = Field(description="When preferences were last updated")


class EmailLog(BaseModel):
    """Email log model for rate limiting."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique email log identifier")
    tenant_user_id: UUID = Field(description="Tenant user ID")
    email_type: str = Field(
        max_length=100,
        description="Type of email sent",
    )
    recipient_email: EmailStr = Field(description="Recipient email address")
    sent_at: datetime = Field(description="When email was sent")
