"""Tests for tenant portal models."""

from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app.models.tenant import (
    TenantInvitation,
    TenantInvitationCreate,
    TenantLeaseLink,
    TenantLeaseLinkCreate,
    TenantUser,
    TenantUserCreate,
)


class TestTenantUserCreate:
    """Tests for TenantUserCreate DTO."""

    def test_valid_tenant_user_create(self) -> None:
        """Test creating a valid tenant user DTO."""
        data = TenantUserCreate(
            contact_name="John Tenant",
            contact_email="john@tenant.com",
            user_id=uuid4(),
            organization_id=uuid4(),
        )
        assert data.contact_name == "John Tenant"
        assert data.contact_email == "john@tenant.com"

    def test_email_validation(self) -> None:
        """Test email validation for tenant user."""
        with pytest.raises(ValueError):
            TenantUserCreate(
                contact_name="John Tenant",
                contact_email="invalid-email",
                user_id=uuid4(),
                organization_id=uuid4(),
            )


class TestTenantUser:
    """Tests for TenantUser model."""

    def test_valid_tenant_user(self) -> None:
        """Test creating a valid tenant user."""
        user = TenantUser(
            id=uuid4(),
            contact_name="John Tenant",
            contact_email="john@tenant.com",
            user_id=uuid4(),
            organization_id=uuid4(),
            created_at=datetime.utcnow(),
        )
        assert user.contact_name == "John Tenant"
        assert user.contact_email == "john@tenant.com"


class TestTenantLeaseLinkCreate:
    """Tests for TenantLeaseLinkCreate DTO."""

    def test_valid_tenant_lease_link_create(self) -> None:
        """Test creating a valid tenant lease link DTO."""
        data = TenantLeaseLinkCreate(
            tenant_user_id=uuid4(),
            lease_id=uuid4(),
        )
        assert data.tenant_user_id is not None
        assert data.lease_id is not None


class TestTenantLeaseLink:
    """Tests for TenantLeaseLink model."""

    def test_valid_tenant_lease_link(self) -> None:
        """Test creating a valid tenant lease link."""
        link = TenantLeaseLink(
            tenant_user_id=uuid4(),
            lease_id=uuid4(),
            created_at=datetime.utcnow(),
        )
        assert link.tenant_user_id is not None
        assert link.lease_id is not None
        assert link.created_at is not None


class TestTenantInvitationCreate:
    """Tests for TenantInvitationCreate DTO."""

    def test_valid_tenant_invitation_create(self) -> None:
        """Test creating a valid tenant invitation DTO."""
        data = TenantInvitationCreate(
            email="tenant@example.com",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
        )
        assert data.email == "tenant@example.com"
        assert data.lease_id is not None

    def test_email_validation(self) -> None:
        """Test email validation for invitation."""
        with pytest.raises(ValueError):
            TenantInvitationCreate(
                email="not-an-email",
                lease_id=uuid4(),
                invited_by=uuid4(),
                organization_id=uuid4(),
            )


class TestTenantInvitation:
    """Tests for TenantInvitation model."""

    def test_valid_invitation(self) -> None:
        """Test creating a valid tenant invitation."""
        invitation = TenantInvitation(
            id=uuid4(),
            email="tenant@example.com",
            token="secure-token-123",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
            expires_at=datetime.utcnow() + timedelta(days=7),
            used_at=None,
            is_revoked=False,
            created_at=datetime.utcnow(),
        )
        assert invitation.email == "tenant@example.com"
        assert invitation.token == "secure-token-123"

    def test_is_valid_unused_not_expired(self) -> None:
        """Test is_valid returns True for unused, non-expired invitation."""
        invitation = TenantInvitation(
            id=uuid4(),
            email="tenant@example.com",
            token="token",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
            expires_at=datetime.utcnow() + timedelta(days=7),
            used_at=None,
            is_revoked=False,
            created_at=datetime.utcnow(),
        )
        assert invitation.is_valid is True

    def test_is_valid_expired(self) -> None:
        """Test is_valid returns False for expired invitation."""
        invitation = TenantInvitation(
            id=uuid4(),
            email="tenant@example.com",
            token="token",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
            expires_at=datetime.utcnow() - timedelta(days=1),
            used_at=None,
            is_revoked=False,
            created_at=datetime.utcnow(),
        )
        assert invitation.is_valid is False

    def test_is_valid_revoked(self) -> None:
        """Test is_valid returns False for revoked invitation."""
        invitation = TenantInvitation(
            id=uuid4(),
            email="tenant@example.com",
            token="token",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
            expires_at=datetime.utcnow() + timedelta(days=7),
            used_at=None,
            is_revoked=True,
            created_at=datetime.utcnow(),
        )
        assert invitation.is_valid is False

    def test_is_valid_used(self) -> None:
        """Test is_valid returns False for used invitation."""
        invitation = TenantInvitation(
            id=uuid4(),
            email="tenant@example.com",
            token="token",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
            expires_at=datetime.utcnow() + timedelta(days=7),
            used_at=datetime.utcnow(),
            is_revoked=False,
            created_at=datetime.utcnow(),
        )
        assert invitation.is_valid is False

    def test_is_expired(self) -> None:
        """Test is_expired returns True for expired invitation."""
        invitation = TenantInvitation(
            id=uuid4(),
            email="tenant@example.com",
            token="token",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
            expires_at=datetime.utcnow() - timedelta(hours=1),
            used_at=None,
            is_revoked=False,
            created_at=datetime.utcnow(),
        )
        assert invitation.is_expired is True

    def test_is_not_expired(self) -> None:
        """Test is_expired returns False for non-expired invitation."""
        invitation = TenantInvitation(
            id=uuid4(),
            email="tenant@example.com",
            token="token",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
            expires_at=datetime.utcnow() + timedelta(days=7),
            used_at=None,
            is_revoked=False,
            created_at=datetime.utcnow(),
        )
        assert invitation.is_expired is False
