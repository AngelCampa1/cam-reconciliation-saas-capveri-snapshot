"""Tenant portal user models for restricted lease access.

Tenant users are special users who can only view their specific leases.
They are invited via email token and have restricted permissions compared
to organization users.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TenantUserBase(BaseModel):
    """Base fields for TenantUser."""

    contact_name: str = Field(
        max_length=255,
        description="Tenant contact person's full name",
    )
    contact_email: EmailStr = Field(
        description="Tenant contact email (must be unique)",
    )


class TenantUserCreate(TenantUserBase):
    """DTO for creating a tenant user.

    Requires user_id and organization_id since tenant users are
    linked to both auth users and organizations.
    """

    user_id: UUID = Field(
        description="User ID from auth.users (Supabase)",
    )
    organization_id: UUID = Field(
        description="Organization this tenant belongs to",
    )


class TenantUser(TenantUserBase):
    """Full tenant user model from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique tenant user identifier")
    user_id: UUID = Field(description="User ID from auth.users (Supabase)")
    organization_id: UUID = Field(description="Organization this tenant belongs to")
    created_at: datetime = Field(description="When tenant user was created")


class TenantLeaseLinkBase(BaseModel):
    """Base fields for TenantLeaseLink."""

    tenant_user_id: UUID = Field(description="Tenant user ID")
    lease_id: UUID = Field(description="Lease ID this tenant can access")


class TenantLeaseLinkCreate(TenantLeaseLinkBase):
    """DTO for creating a tenant lease link."""

    pass


class TenantLeaseLink(TenantLeaseLinkBase):
    """Full tenant lease link model from database."""

    model_config = ConfigDict(from_attributes=True)

    created_at: datetime = Field(description="When this link was created")


class TenantInvitationBase(BaseModel):
    """Base fields for TenantInvitation."""

    email: EmailStr = Field(
        description="Email address to send invitation to",
    )
    lease_id: UUID = Field(
        description="Lease ID the tenant will have access to",
    )


class TenantInvitationCreateRequest(TenantInvitationBase):
    """API request schema for creating a tenant invitation.

    Only contains user-provided fields. Token, expiration, and
    organization context are added by the service.
    """

    pass


class TenantInvitationCreate(TenantInvitationBase):
    """DTO for creating a tenant invitation.

    The token and expiration are generated automatically by the service.
    """

    invited_by: UUID = Field(
        description="User ID of the person sending the invitation",
    )
    organization_id: UUID = Field(
        description="Organization ID for multi-tenancy",
    )


class TenantInvitation(TenantInvitationBase):
    """Full tenant invitation model from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique invitation identifier")
    token: str = Field(
        max_length=64,
        description="Secure token for invitation link (URL-safe)",
    )
    invited_by: UUID = Field(description="User ID of the person who sent invitation")
    organization_id: UUID = Field(description="Organization ID for multi-tenancy")
    expires_at: datetime = Field(description="When this invitation expires")
    used_at: datetime | None = Field(
        None,
        description="When invitation was used (null if unused)",
    )
    is_revoked: bool = Field(
        default=False,
        description="Whether invitation has been revoked",
    )
    created_at: datetime = Field(description="When invitation was created")

    @property
    def is_valid(self) -> bool:
        """Check if invitation is still valid."""
        return (
            not self.is_revoked
            and self.used_at is None
            and self.expires_at > datetime.utcnow()
        )

    @property
    def is_expired(self) -> bool:
        """Check if invitation has expired."""
        return self.expires_at <= datetime.utcnow()
