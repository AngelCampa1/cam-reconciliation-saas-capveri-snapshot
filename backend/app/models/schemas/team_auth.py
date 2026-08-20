"""
Team member authentication and invitation schemas.

Models for team member signup flow, including invitation validation
and signup requests. Different from tenant auth in that team members
get full organization access with assigned roles.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.legal_terms import TERMS_HASH, TERMS_VERSION


class TeamInvitationValidationResponse(BaseModel):
    """Response for GET /team/invitations/{token}/validate."""

    valid: bool
    email: str | None = None
    organization_name: str | None = None
    role: str | None = None
    expires_at: datetime | None = None
    error_reason: Literal["expired", "used", "revoked", "not_found"] | None = None


class TeamMemberSignupRequest(BaseModel):
    """Request payload for POST /team/signup."""

    token: str = Field(min_length=32, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    accepted_terms: bool
    terms_version: str
    terms_hash: str

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Enforce password complexity (upper + lower + digit)."""
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)

        if not (has_upper and has_lower and has_digit):
            raise ValueError("Password must contain uppercase, lowercase, and digit")
        return v

    @field_validator("accepted_terms")
    @classmethod
    def validate_terms_accepted(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("You must accept the current Terms of Service")
        return v

    @field_validator("terms_version")
    @classmethod
    def validate_terms_version(cls, v: str) -> str:
        if v != TERMS_VERSION:
            raise ValueError("Terms version is stale")
        return v

    @field_validator("terms_hash")
    @classmethod
    def validate_terms_hash(cls, v: str) -> str:
        if v != TERMS_HASH:
            raise ValueError("Terms hash is stale")
        return v


class TeamMemberSignupResponse(BaseModel):
    """Response for POST /team/signup."""

    success: bool
    user_id: UUID
    access_token: str
    refresh_token: str
    user: dict[str, Any]


class TeamMemberResponse(BaseModel):
    """Team member information in responses."""

    id: UUID
    organization_id: UUID
    email: str
    full_name: str | None
    role: str
    created_at: datetime


class TeamInvitationAcceptRequest(BaseModel):
    """Request payload for POST /team/invitations/accept."""

    token: str = Field(min_length=32, max_length=128)
    user_id: UUID


class TeamInvitationAcceptResponse(BaseModel):
    """Response for POST /team/invitations/accept."""

    success: bool
    message: str | None = None
