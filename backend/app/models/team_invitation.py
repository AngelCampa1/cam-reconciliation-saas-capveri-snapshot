"""Team member invitation models for organization access.

Team member invitations allow admins to invite new users to join their
existing organization with specific roles (admin, member, viewer).
Unlike tenant invitations, team members get full organization access.
"""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# Allowed roles for team invitations (owner is excluded)
TeamInviteRole = Literal["admin", "member", "viewer"]


class TeamMemberInvitationBase(BaseModel):
    """Base fields for TeamMemberInvitation."""

    email: EmailStr = Field(
        description="Email address to send invitation to",
    )
    role: TeamInviteRole = Field(
        default="member",
        description="Role to assign to invited user (admin, member, viewer)",
    )


class TeamMemberInvitationCreateRequest(TeamMemberInvitationBase):
    """API request schema for creating a team member invitation.

    Only contains user-provided fields. Token, expiration, and
    organization context are added by the service.
    """

    pass


class TeamMemberInvitationCreate(TeamMemberInvitationBase):
    """DTO for creating a team member invitation.

    The token and expiration are generated automatically by the service.
    """

    invited_by: UUID = Field(
        description="User ID of the person sending the invitation",
    )
    organization_id: UUID = Field(
        description="Organization ID the user is being invited to",
    )


class TeamMemberInvitation(TeamMemberInvitationBase):
    """Full team member invitation model from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique invitation identifier")
    token: str = Field(
        max_length=64,
        description="Secure token for invitation link (URL-safe)",
    )
    invited_by: UUID = Field(description="User ID of the person who sent invitation")
    organization_id: UUID = Field(
        description="Organization ID the user is being invited to"
    )
    expires_at: datetime = Field(description="When this invitation expires")
    used_at: datetime | None = Field(
        None,
        description="When invitation was used (null if unused)",
    )
    used_by_user_id: UUID | None = Field(
        None,
        description="User ID of the user who accepted the invitation",
    )
    revoked_at: datetime | None = Field(
        None,
        description="When invitation was revoked (null if not revoked)",
    )
    created_at: datetime = Field(description="When invitation was created")

    @property
    def is_valid(self) -> bool:
        """Check if invitation is still valid."""
        return (
            self.revoked_at is None
            and self.used_at is None
            and self.expires_at > datetime.now(UTC)
        )

    @property
    def is_expired(self) -> bool:
        """Check if invitation has expired."""
        return self.expires_at <= datetime.now(UTC)

    @property
    def is_revoked(self) -> bool:
        """Check if invitation has been revoked."""
        return self.revoked_at is not None
