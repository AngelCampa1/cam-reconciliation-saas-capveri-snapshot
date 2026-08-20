"""User domain models for authentication and authorization.

Users are linked to organizations and have roles that determine
their permissions within the system. The User.id matches the
Supabase auth.users.id for seamless authentication integration.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class UserBase(BaseModel):
    """Base fields for User."""

    email: EmailStr = Field(description="User's email address (must be unique)")
    full_name: str | None = Field(
        None,
        max_length=255,
        description="User's full display name",
    )
    role: UserRole = Field(
        default=UserRole.MEMBER,
        description="User's role within the organization",
    )


class UserCreate(UserBase):
    """DTO for creating a user.

    Requires organization_id since users cannot exist without
    being linked to an organization.
    """

    organization_id: UUID = Field(
        description="Organization this user belongs to",
    )


class UserUpdate(BaseModel):
    """DTO for updating a user (all fields optional).

    Email cannot be updated through this DTO - that requires
    a separate verification flow through Supabase Auth.
    """

    full_name: str | None = Field(
        None,
        max_length=255,
        description="User's full display name",
    )
    role: UserRole | None = Field(
        None,
        description="User's role within the organization",
    )


class User(UserBase):
    """Full user model from database.

    The id field matches auth.users.id from Supabase Auth,
    enabling seamless integration with the authentication system.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(
        description="Unique user identifier (matches Supabase auth.users.id)"
    )
    organization_id: UUID = Field(description="Organization this user belongs to")
    is_platform_admin: bool = Field(
        default=False,
        description="Platform-level admin flag for accessing all organizations' data",
    )
    is_anonymous: bool = Field(
        default=False,
        description=(
            "True for anonymous PLG onboarding sessions. Not persisted; derived "
            "from the Supabase auth user at request time. Anonymous onboarding "
            "orgs have no subscription, so this flag lets the entitlement gate "
            "exempt the allowlisted onboarding routes."
        ),
    )
    created_at: datetime = Field(description="When user was created")
    updated_at: datetime = Field(description="When user was last modified")

    @property
    def is_admin(self) -> bool:
        """Check if user has admin privileges (owner or admin role)."""
        return self.role in (UserRole.OWNER, UserRole.ADMIN)

    @property
    def is_owner(self) -> bool:
        """Check if user is organization owner."""
        return self.role == UserRole.OWNER


class UserWithOrg(User):
    """User with organization details for context.

    Used in API responses where organization context is needed
    without a separate query.
    """

    organization_name: str = Field(description="Name of the user's organization")
