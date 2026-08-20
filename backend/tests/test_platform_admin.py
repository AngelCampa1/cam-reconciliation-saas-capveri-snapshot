"""Tests for platform admin authentication and authorization.

Tests cover:
- Platform admin dependency allows platform admin users
- Platform admin dependency rejects regular org admins/owners
- Bounty endpoints require platform admin privileges
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException, status

from app.models.enums import UserRole
from app.models.user import User
from tests.conftest import create_test_user


def create_platform_admin_user(
    user_id=None,
    org_id=None,
    is_platform_admin=True,
) -> User:
    """Create a test user with platform admin privileges."""
    return User(
        id=user_id or uuid4(),
        organization_id=org_id or uuid4(),
        email="platform-admin@capveri.com",
        full_name="Platform Admin",
        role=UserRole.OWNER,
        is_platform_admin=is_platform_admin,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


class TestPlatformAdminDependency:
    """Tests for get_current_platform_admin dependency."""

    @pytest.mark.asyncio
    async def test_platform_admin_allows_platform_admin_user(self):
        """Verify platform admin dependency allows users with is_platform_admin=True."""
        from app.auth.dependencies import get_current_platform_admin

        platform_admin = create_platform_admin_user(is_platform_admin=True)

        result = await get_current_platform_admin(platform_admin)

        assert result == platform_admin
        assert result.is_platform_admin is True

    @pytest.mark.asyncio
    async def test_platform_admin_rejects_regular_owner(self):
        """Verify platform admin dependency rejects regular org owners."""
        from app.auth.dependencies import get_current_platform_admin

        regular_owner = create_test_user(role=UserRole.OWNER)
        # Explicitly set is_platform_admin=False (should be default)
        regular_owner.is_platform_admin = False

        with pytest.raises(HTTPException) as exc_info:
            await get_current_platform_admin(regular_owner)

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Platform admin privileges required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_platform_admin_rejects_regular_admin(self):
        """Verify platform admin dependency rejects regular org admins."""
        from app.auth.dependencies import get_current_platform_admin

        regular_admin = create_test_user(role=UserRole.ADMIN)
        regular_admin.is_platform_admin = False

        with pytest.raises(HTTPException) as exc_info:
            await get_current_platform_admin(regular_admin)

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Platform admin privileges required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_platform_admin_rejects_member(self):
        """Verify platform admin dependency rejects regular members."""
        from app.auth.dependencies import get_current_platform_admin

        member = create_test_user(role=UserRole.MEMBER)
        member.is_platform_admin = False

        with pytest.raises(HTTPException) as exc_info:
            await get_current_platform_admin(member)

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
