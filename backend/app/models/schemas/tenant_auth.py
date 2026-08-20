"""
Tenant authentication and invitation schemas.

Models for tenant portal signup flow, including invitation validation
and signup requests.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.legal_terms import TERMS_HASH, TERMS_VERSION


class InvitationValidationResponse(BaseModel):
    """Response for GET /tenant/invitations/{token}/validate."""

    valid: bool
    email: str | None = None
    lease_id: UUID | None = None
    organization_id: UUID | None = None
    expires_at: datetime | None = None
    error_reason: Literal["expired", "used", "revoked", "not_found"] | None = None


class TenantSignupRequest(BaseModel):
    """Request payload for POST /tenant/signup."""

    token: str = Field(min_length=32, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    contact_name: str = Field(min_length=1, max_length=200)
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


class TenantSignupResponse(BaseModel):
    """Response for POST /tenant/signup."""

    success: bool
    user_id: UUID
    access_token: str
    refresh_token: str
    tenant_user: dict[
        str, Any
    ]  # TenantUserResponse - will type properly when that model exists


class TenantUserResponse(BaseModel):
    """Tenant user information in signup response."""

    id: UUID
    user_id: UUID
    organization_id: UUID
    contact_name: str
    contact_email: str
    created_at: datetime
