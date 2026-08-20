"""Tests for authentication dependencies."""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from supabase_auth.errors import AuthApiError

from app.auth.dependencies import (
    AuthenticationError,
    CurrentActiveUser,
    CurrentAdminUser,
    CurrentTenantUser,
    CurrentUser,
    OrganizationContext,
    OrgContext,
    get_current_active_user,
    get_current_admin_user,
    get_current_tenant_user,
    get_current_user,
    get_org_scoped_context,
    require_full_access,
    security,
)
from app.models.enums import UserRole
from app.models.tenant import TenantUser
from app.models.user import User


def make_request(method: str, path: str) -> MagicMock:
    request = MagicMock()
    request.method = method
    request.url.path = path
    return request


class TestAuthenticationError:
    """Test suite for AuthenticationError exception."""

    def test_default_message(self) -> None:
        """Test that default message is 'Authentication required'."""
        error = AuthenticationError()

        assert error.detail == "Authentication required"
        assert error.status_code == status.HTTP_401_UNAUTHORIZED

    def test_custom_message(self) -> None:
        """Test that custom message can be provided."""
        error = AuthenticationError("Token expired")

        assert error.detail == "Token expired"
        assert error.status_code == status.HTTP_401_UNAUTHORIZED

    def test_www_authenticate_header(self) -> None:
        """Test that WWW-Authenticate header is set to Bearer."""
        error = AuthenticationError()

        assert error.headers == {"WWW-Authenticate": "Bearer"}


class TestSecurityScheme:
    """Test suite for the security scheme configuration."""

    def test_security_is_http_bearer(self) -> None:
        """Test that security scheme is HTTPBearer."""
        from fastapi.security import HTTPBearer

        assert isinstance(security, HTTPBearer)

    def test_security_auto_error_disabled(self) -> None:
        """Test that auto_error is disabled for custom handling."""
        # auto_error=False means we handle missing auth ourselves
        assert security.auto_error is False


class TestGetCurrentUser:
    """Test suite for get_current_user dependency."""

    @pytest.fixture
    def mock_user_data(self) -> dict:
        """Sample user data from database."""
        return {
            "id": str(uuid4()),
            "organization_id": str(uuid4()),
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "member",
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

    @pytest.mark.asyncio
    async def test_missing_credentials_raises_401(self) -> None:
        """Test that missing credentials raises AuthenticationError."""
        mock_supabase = MagicMock()

        with pytest.raises(AuthenticationError) as exc_info:
            await get_current_user(
                credentials=None,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/properties"),
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Authorization header required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_invalid_token_raises_401(self) -> None:
        """Test that invalid token raises AuthenticationError."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="invalid-token"
        )
        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)

        with pytest.raises(AuthenticationError) as exc_info:
            await get_current_user(
                credentials=credentials,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/properties"),
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Invalid token" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_valid_token_returns_user(self, mock_user_data: dict) -> None:
        """Test that valid token returns User model."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="valid-token"
        )

        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_user_data["id"]

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = MagicMock(user=mock_auth_user)

        # Mock the chained table query
        mock_execute = MagicMock()
        mock_execute.data = mock_user_data
        mock_single = MagicMock()
        mock_single.execute.return_value = mock_execute
        mock_eq = MagicMock()
        mock_eq.single.return_value = mock_single
        mock_select = MagicMock()
        mock_select.eq.return_value = mock_eq
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table

        user = await get_current_user(
            credentials=credentials,
            supabase=mock_supabase,
            request=make_request("GET", "/api/v1/properties"),
        )

        assert isinstance(user, User)
        assert str(user.id) == mock_user_data["id"]
        assert user.email == mock_user_data["email"]
        assert user.full_name == mock_user_data["full_name"]

    @pytest.mark.asyncio
    async def test_anonymous_user_allowed_only_for_onboarding_subset(
        self, mock_user_data: dict
    ) -> None:
        """Anonymous PLG sessions must not become full protected app sessions."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="anon-token"
        )

        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_user_data["id"]
        mock_auth_user.email = None
        mock_auth_user.is_anonymous = True

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = MagicMock(user=mock_auth_user)

        mock_execute = MagicMock()
        mock_execute.data = mock_user_data
        mock_single = MagicMock()
        mock_single.execute.return_value = mock_execute
        mock_eq = MagicMock()
        mock_eq.single.return_value = mock_single
        mock_select = MagicMock()
        mock_select.eq.return_value = mock_eq
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table

        user = await get_current_user(
            credentials=credentials,
            supabase=mock_supabase,
            request=make_request("POST", "/api/v1/properties"),
        )

        assert isinstance(user, User)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(
                credentials=credentials,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/team/members"),
            )

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Anonymous onboarding sessions" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_user_not_in_database_raises_401(self) -> None:
        """Test that user not found in database raises AuthenticationError."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="valid-token"
        )

        mock_auth_user = MagicMock()
        mock_auth_user.id = str(uuid4())

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = MagicMock(user=mock_auth_user)

        # Mock database returning no data
        mock_execute = MagicMock()
        mock_execute.data = None
        mock_single = MagicMock()
        mock_single.execute.return_value = mock_execute
        mock_eq = MagicMock()
        mock_eq.single.return_value = mock_single
        mock_select = MagicMock()
        mock_select.eq.return_value = mock_eq
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table

        with pytest.raises(AuthenticationError) as exc_info:
            await get_current_user(
                credentials=credentials,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/properties"),
            )

        assert "User profile not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_expired_token_raises_401(self) -> None:
        """Test that expired token raises AuthenticationError."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="expired-token"
        )

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.side_effect = AuthApiError(
            "Token expired", 401, None
        )

        with pytest.raises(AuthenticationError) as exc_info:
            await get_current_user(
                credentials=credentials,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/properties"),
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "expired" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_supabase_error_raises_401(self) -> None:
        """Test that Supabase errors are converted to AuthenticationError."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="some-token"
        )

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.side_effect = AuthApiError(
            "Network error", 500, None
        )

        with pytest.raises(AuthenticationError) as exc_info:
            await get_current_user(
                credentials=credentials,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/properties"),
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Authentication failed" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_unexpected_error_propagates_as_500_not_401(self) -> None:
        """Unexpected errors (TypeError, KeyError) must not be masked as 401."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="valid-token"
        )

        mock_auth_user = MagicMock()
        mock_auth_user.id = str(uuid4())

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = MagicMock(user=mock_auth_user)
        # Simulate a code bug during DB query (e.g., schema change)
        mock_supabase.table.side_effect = TypeError("unexpected NoneType")

        # Should NOT be caught as AuthenticationError — should propagate as TypeError
        with pytest.raises(TypeError, match="unexpected NoneType"):
            await get_current_user(
                credentials=credentials,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/properties"),
            )

    @pytest.mark.asyncio
    async def test_calls_supabase_get_user(self) -> None:
        """Test that get_user is called with the token."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="my-token-123"
        )

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)

        with pytest.raises(AuthenticationError):
            await get_current_user(
                credentials=credentials,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/properties"),
            )

        mock_supabase.auth.get_user.assert_called_once_with("my-token-123")

    @pytest.mark.asyncio
    async def test_queries_users_table(self, mock_user_data: dict) -> None:
        """Test that users table is queried with correct user ID."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="valid-token"
        )

        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_user_data["id"]

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = MagicMock(user=mock_auth_user)

        mock_execute = MagicMock()
        mock_execute.data = mock_user_data
        mock_single = MagicMock()
        mock_single.execute.return_value = mock_execute
        mock_eq = MagicMock()
        mock_eq.single.return_value = mock_single
        mock_select = MagicMock()
        mock_select.eq.return_value = mock_eq
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table

        await get_current_user(
            credentials=credentials,
            supabase=mock_supabase,
            request=make_request("GET", "/api/v1/properties"),
        )

        mock_supabase.table.assert_called_once_with("users")
        mock_select.eq.assert_called_once_with("id", mock_user_data["id"])


class TestGetCurrentActiveUser:
    """Test suite for get_current_active_user dependency."""

    @pytest.fixture
    def sample_user(self) -> User:
        """Create a sample user for testing."""
        return User(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            full_name="Test User",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    @pytest.mark.asyncio
    async def test_returns_user(self, sample_user: User) -> None:
        """Test that active user check returns the user."""
        result = await get_current_active_user(sample_user)

        assert result is sample_user

    @pytest.mark.asyncio
    async def test_preserves_user_data(self, sample_user: User) -> None:
        """Test that user data is preserved through the dependency."""
        result = await get_current_active_user(sample_user)

        assert result.id == sample_user.id
        assert result.email == sample_user.email
        assert result.organization_id == sample_user.organization_id


class TestGetCurrentAdminUser:
    """Test suite for get_current_admin_user dependency."""

    @pytest.fixture
    def admin_user(self) -> User:
        """Create an admin user for testing."""
        return User(
            id=uuid4(),
            organization_id=uuid4(),
            email="admin@example.com",
            full_name="Admin User",
            role=UserRole.ADMIN,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    @pytest.fixture
    def owner_user(self) -> User:
        """Create an owner user for testing."""
        return User(
            id=uuid4(),
            organization_id=uuid4(),
            email="owner@example.com",
            full_name="Owner User",
            role=UserRole.OWNER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    @pytest.fixture
    def member_user(self) -> User:
        """Create a member user for testing."""
        return User(
            id=uuid4(),
            organization_id=uuid4(),
            email="member@example.com",
            full_name="Member User",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    @pytest.fixture
    def viewer_user(self) -> User:
        """Create a viewer user for testing."""
        return User(
            id=uuid4(),
            organization_id=uuid4(),
            email="viewer@example.com",
            full_name="Viewer User",
            role=UserRole.VIEWER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    @pytest.mark.asyncio
    async def test_admin_user_passes(self, admin_user: User) -> None:
        """Test that admin user passes the check."""
        result = await get_current_admin_user(admin_user)

        assert result is admin_user

    @pytest.mark.asyncio
    async def test_owner_user_passes(self, owner_user: User) -> None:
        """Test that owner user passes the check."""
        result = await get_current_admin_user(owner_user)

        assert result is owner_user

    @pytest.mark.asyncio
    async def test_member_user_raises_403(self, member_user: User) -> None:
        """Test that member user raises 403 Forbidden."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin_user(member_user)

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Admin privileges required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_viewer_user_raises_403(self, viewer_user: User) -> None:
        """Test that viewer user raises 403 Forbidden."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin_user(viewer_user)

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN


class TestUserModelProperties:
    """Test suite for User model is_admin and is_owner properties."""

    def test_owner_is_admin(self) -> None:
        """Test that owner is considered admin."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="owner@example.com",
            role=UserRole.OWNER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        assert user.is_admin is True
        assert user.is_owner is True

    def test_admin_is_admin(self) -> None:
        """Test that admin is considered admin but not owner."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="admin@example.com",
            role=UserRole.ADMIN,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        assert user.is_admin is True
        assert user.is_owner is False

    def test_member_is_not_admin(self) -> None:
        """Test that member is not admin."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="member@example.com",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        assert user.is_admin is False
        assert user.is_owner is False

    def test_viewer_is_not_admin(self) -> None:
        """Test that viewer is not admin."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="viewer@example.com",
            role=UserRole.VIEWER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        assert user.is_admin is False
        assert user.is_owner is False


class TestTypeAliases:
    """Test suite for type aliases."""

    def test_current_user_alias_exists(self) -> None:
        """Test that CurrentUser type alias is defined."""
        assert CurrentUser is not None

    def test_current_active_user_alias_exists(self) -> None:
        """Test that CurrentActiveUser type alias is defined."""
        assert CurrentActiveUser is not None

    def test_current_admin_user_alias_exists(self) -> None:
        """Test that CurrentAdminUser type alias is defined."""
        assert CurrentAdminUser is not None


class TestModuleImports:
    """Test suite for module imports and exports."""

    def test_can_import_from_auth_module(self) -> None:
        """Test that all exports are importable from auth module."""
        from app.auth import (
            AuthenticationError,
            CurrentActiveUser,
            CurrentAdminUser,
            CurrentUser,
            get_current_active_user,
            get_current_admin_user,
            get_current_user,
        )

        assert AuthenticationError is not None
        assert CurrentUser is not None
        assert CurrentActiveUser is not None
        assert CurrentAdminUser is not None
        assert get_current_user is not None
        assert get_current_active_user is not None
        assert get_current_admin_user is not None

    def test_module_all_exports(self) -> None:
        """Test that __all__ contains expected exports."""
        from app import auth

        expected_exports = [
            "AuthenticationError",
            "CurrentUser",
            "CurrentActiveUser",
            "CurrentAdminUser",
            "OrgContext",
            "OrganizationContext",
            "get_current_user",
            "get_current_active_user",
            "get_current_admin_user",
            "get_org_scoped_context",
        ]
        for export in expected_exports:
            assert export in auth.__all__


class TestOrganizationContext:
    """Test suite for OrganizationContext dataclass."""

    @pytest.fixture
    def sample_user(self) -> User:
        """Create a sample user for testing."""
        return User(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            full_name="Test User",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create a mock Supabase client."""
        return MagicMock()

    def test_organization_context_creation(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test that OrganizationContext can be created."""
        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        assert ctx.client is mock_client
        assert ctx.organization_id == sample_user.organization_id
        assert ctx.user is sample_user

    def test_table_method_returns_table_reference(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test that table() method returns Supabase table reference."""
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        result = ctx.table("properties")

        mock_client.table.assert_called_once_with("properties")
        assert result is mock_table

    def test_table_method_with_different_tables(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test that table() works with different table names."""
        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        ctx.table("properties")
        ctx.table("leases")
        ctx.table("units")

        assert mock_client.table.call_count == 3
        mock_client.table.assert_any_call("properties")
        mock_client.table.assert_any_call("leases")
        mock_client.table.assert_any_call("units")

    def test_filter_by_org_adds_eq_filter(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test that filter_by_org adds organization_id filter."""
        mock_query = MagicMock()
        mock_filtered = MagicMock()
        mock_query.eq.return_value = mock_filtered

        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        result = ctx.filter_by_org(mock_query)

        mock_query.eq.assert_called_once_with(
            "organization_id", str(sample_user.organization_id)
        )
        assert result is mock_filtered

    def test_organization_id_is_uuid(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test that organization_id is a UUID."""
        from uuid import UUID

        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        assert isinstance(ctx.organization_id, UUID)


class TestGetOrgScopedContext:
    """Test suite for get_org_scoped_context dependency."""

    @pytest.fixture
    def sample_user(self) -> User:
        """Create a sample user for testing."""
        return User(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            full_name="Test User",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    @pytest.fixture
    def mock_supabase(self) -> MagicMock:
        """Create a mock Supabase client."""
        return MagicMock()

    @pytest.mark.asyncio
    async def test_returns_organization_context(
        self, sample_user: User, mock_supabase: MagicMock
    ) -> None:
        """Test that get_org_scoped_context returns OrganizationContext."""
        result = await get_org_scoped_context(
            current_user=sample_user, supabase=mock_supabase
        )

        assert isinstance(result, OrganizationContext)

    @pytest.mark.asyncio
    async def test_context_has_correct_organization_id(
        self, sample_user: User, mock_supabase: MagicMock
    ) -> None:
        """Test that context has correct organization_id."""
        result = await get_org_scoped_context(
            current_user=sample_user, supabase=mock_supabase
        )

        assert result.organization_id == sample_user.organization_id

    @pytest.mark.asyncio
    async def test_context_has_user(
        self, sample_user: User, mock_supabase: MagicMock
    ) -> None:
        """Test that context contains the user."""
        result = await get_org_scoped_context(
            current_user=sample_user, supabase=mock_supabase
        )

        assert result.user is sample_user

    @pytest.mark.asyncio
    async def test_context_has_supabase_client(
        self, sample_user: User, mock_supabase: MagicMock
    ) -> None:
        """Test that context contains the Supabase client."""
        result = await get_org_scoped_context(
            current_user=sample_user, supabase=mock_supabase
        )

        assert result.client is mock_supabase

    @pytest.mark.asyncio
    async def test_context_client_can_query(
        self, sample_user: User, mock_supabase: MagicMock
    ) -> None:
        """Test that context client can be used for queries."""
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table

        result = await get_org_scoped_context(
            current_user=sample_user, supabase=mock_supabase
        )

        # Use the context to query
        result.table("properties")

        mock_supabase.table.assert_called_once_with("properties")


class TestOrgContextTypeAlias:
    """Test suite for OrgContext type alias."""

    def test_org_context_alias_exists(self) -> None:
        """Test that OrgContext type alias is defined."""
        assert OrgContext is not None

    def test_can_import_org_context_from_module(self) -> None:
        """Test that OrgContext can be imported from auth module."""
        from app.auth import OrgContext as ImportedOrgContext

        assert ImportedOrgContext is not None

    def test_can_import_organization_context_from_module(self) -> None:
        """Test that OrganizationContext can be imported from auth module."""
        from app.auth import OrganizationContext as ImportedOrgCtx

        assert ImportedOrgCtx is not None

    def test_can_import_get_org_scoped_context_from_module(self) -> None:
        """Test that get_org_scoped_context can be imported from auth module."""
        from app.auth import get_org_scoped_context as imported_func

        assert imported_func is not None


class TestOrgContextUsagePatterns:
    """Test suite for common OrgContext usage patterns."""

    @pytest.fixture
    def sample_user(self) -> User:
        """Create a sample user for testing."""
        return User(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            full_name="Test User",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create a mock Supabase client."""
        return MagicMock()

    def test_select_all_from_table(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test pattern: ctx.table("name").select("*").execute()."""
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_execute = MagicMock()
        mock_execute.data = [{"id": "1", "name": "Property 1"}]

        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_select
        mock_select.execute.return_value = mock_execute

        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        result = ctx.table("properties").select("*").execute()

        assert result.data == [{"id": "1", "name": "Property 1"}]

    def test_insert_with_organization_id(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test pattern: insert with organization_id from context."""
        mock_table = MagicMock()
        mock_insert = MagicMock()
        mock_execute = MagicMock()
        mock_execute.data = [{"id": "new-id", "name": "New Property"}]

        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_insert
        mock_insert.execute.return_value = mock_execute

        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        result = (
            ctx.table("properties")
            .insert(
                {
                    "organization_id": str(ctx.organization_id),
                    "name": "New Property",
                }
            )
            .execute()
        )

        mock_table.insert.assert_called_once()
        call_args = mock_table.insert.call_args[0][0]
        assert call_args["organization_id"] == str(sample_user.organization_id)
        assert result.data == [{"id": "new-id", "name": "New Property"}]

    def test_select_with_org_filter(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test pattern: explicit org filtering with filter_by_org."""
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_execute = MagicMock()
        mock_execute.data = []

        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_select
        mock_select.eq.return_value = mock_eq
        mock_eq.execute.return_value = mock_execute

        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        query = ctx.table("properties").select("*")
        filtered = ctx.filter_by_org(query)
        result = filtered.execute()

        mock_select.eq.assert_called_once_with(
            "organization_id", str(sample_user.organization_id)
        )
        assert result.data == []

    def test_user_properties_accessible(
        self, mock_client: MagicMock, sample_user: User
    ) -> None:
        """Test that user properties are accessible through context."""
        ctx = OrganizationContext(
            client=mock_client,
            organization_id=sample_user.organization_id,
            user=sample_user,
        )

        assert ctx.user.id == sample_user.id
        assert ctx.user.email == sample_user.email
        assert ctx.user.role == sample_user.role
        assert ctx.user.is_admin == sample_user.is_admin


class TestGetCurrentTenantUser:
    """Test suite for get_current_tenant_user dependency."""

    @pytest.fixture
    def mock_tenant_data(self) -> dict:
        """Sample tenant user data from database."""
        tenant_user_id = uuid4()
        auth_user_id = uuid4()
        org_id = uuid4()

        return {
            "id": str(tenant_user_id),
            "user_id": str(auth_user_id),
            "organization_id": str(org_id),
            "contact_name": "John Tenant",
            "contact_email": "tenant@example.com",
            "created_at": datetime.now(UTC).isoformat(),
        }

    @pytest.mark.asyncio
    async def test_valid_tenant_token_returns_tenant_user(
        self, mock_tenant_data: dict
    ) -> None:
        """Test that valid tenant token returns TenantUser model."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="valid-tenant-token"
        )

        mock_supabase = MagicMock()

        # Mock auth.get_user() - returns tenant user
        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_tenant_data["user_id"]
        mock_auth_user.email = mock_tenant_data["contact_email"]

        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_auth_user
        mock_supabase.auth.get_user.return_value = mock_auth_response

        # Mock users table query - returns tenant role user
        mock_user_result = MagicMock()
        mock_user_result.data = {
            "id": mock_tenant_data["user_id"],
            "organization_id": mock_tenant_data["organization_id"],
            "email": mock_tenant_data["contact_email"],
            "full_name": mock_tenant_data["contact_name"],
            "role": UserRole.TENANT.value,
            "created_at": mock_tenant_data["created_at"],
            "updated_at": mock_tenant_data["created_at"],
        }

        mock_users_query = MagicMock()
        mock_users_query.execute.return_value = mock_user_result
        mock_users_table = MagicMock()
        mock_users_table.select.return_value.eq.return_value.single.return_value = (
            mock_users_query
        )

        # Mock tenant_users table query
        mock_tenant_result = MagicMock()
        mock_tenant_result.data = mock_tenant_data

        mock_tenant_query = MagicMock()
        mock_tenant_query.execute.return_value = mock_tenant_result

        # Chain the table method calls
        def table_side_effect(table_name: str):
            if table_name == "users":
                return mock_users_table
            elif table_name == "tenant_users":
                mock_tenant_table = MagicMock()
                mock_tenant_table.select.return_value.eq.return_value.maybe_single.return_value = (
                    mock_tenant_query
                )
                return mock_tenant_table
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        # Call the dependency
        result = await get_current_tenant_user(
            credentials, mock_supabase, make_request("GET", "/api/v1/tenant/dashboard")
        )

        # Assertions
        assert isinstance(result, TenantUser)
        assert str(result.id) == mock_tenant_data["id"]
        assert str(result.user_id) == mock_tenant_data["user_id"]
        assert str(result.organization_id) == mock_tenant_data["organization_id"]
        assert result.contact_name == mock_tenant_data["contact_name"]
        assert result.contact_email == mock_tenant_data["contact_email"]

    @pytest.mark.asyncio
    async def test_missing_credentials_raises_401(self) -> None:
        """Test that missing credentials raises AuthenticationError."""
        mock_supabase = MagicMock()

        with pytest.raises(AuthenticationError) as exc_info:
            await get_current_tenant_user(
                credentials=None,
                supabase=mock_supabase,
                request=make_request("GET", "/api/v1/tenant/dashboard"),
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_non_tenant_user_raises_403(self) -> None:
        """Test that user without tenant role raises 403."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="admin-token"
        )

        mock_supabase = MagicMock()

        # Mock auth.get_user() - returns admin user
        mock_auth_user = MagicMock()
        mock_auth_user.id = str(uuid4())
        mock_auth_user.email = "admin@example.com"

        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_auth_user
        mock_supabase.auth.get_user.return_value = mock_auth_response

        # Mock users table query - returns ADMIN role
        mock_user_result = MagicMock()
        mock_user_result.data = {
            "id": str(mock_auth_user.id),
            "organization_id": str(uuid4()),
            "email": "admin@example.com",
            "full_name": "Admin User",
            "role": UserRole.ADMIN.value,  # NOT TENANT
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_users_query = MagicMock()
        mock_users_query.execute.return_value = mock_user_result

        mock_users_table = MagicMock()
        mock_users_table.select.return_value.eq.return_value.single.return_value = (
            mock_users_query
        )

        mock_supabase.table.return_value = mock_users_table

        # Should raise 403 Forbidden
        with pytest.raises(HTTPException) as exc_info:
            await get_current_tenant_user(
                credentials,
                mock_supabase,
                make_request("GET", "/api/v1/tenant/dashboard"),
            )

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Tenant access required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_owner_user_raises_403(self) -> None:
        """Test that OWNER role user raises 403."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="owner-token"
        )

        mock_supabase = MagicMock()

        mock_auth_user = MagicMock()
        mock_auth_user.id = str(uuid4())
        mock_auth_user.email = "owner@example.com"

        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_auth_user
        mock_supabase.auth.get_user.return_value = mock_auth_response

        mock_user_result = MagicMock()
        mock_user_result.data = {
            "id": str(mock_auth_user.id),
            "organization_id": str(uuid4()),
            "email": "owner@example.com",
            "full_name": "Owner User",
            "role": UserRole.OWNER.value,  # OWNER not TENANT
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_users_query = MagicMock()
        mock_users_query.execute.return_value = mock_user_result

        mock_users_table = MagicMock()
        mock_users_table.select.return_value.eq.return_value.single.return_value = (
            mock_users_query
        )

        mock_supabase.table.return_value = mock_users_table

        with pytest.raises(HTTPException) as exc_info:
            await get_current_tenant_user(
                credentials,
                mock_supabase,
                make_request("GET", "/api/v1/tenant/dashboard"),
            )

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.asyncio
    async def test_tenant_role_but_no_profile_raises_404(
        self, mock_tenant_data: dict
    ) -> None:
        """Test that tenant role user without tenant_users profile raises 404."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="valid-token"
        )

        mock_supabase = MagicMock()

        # Mock auth.get_user()
        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_tenant_data["user_id"]
        mock_auth_user.email = mock_tenant_data["contact_email"]

        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_auth_user
        mock_supabase.auth.get_user.return_value = mock_auth_response

        # Mock users table - returns TENANT role
        mock_user_result = MagicMock()
        mock_user_result.data = {
            "id": mock_tenant_data["user_id"],
            "organization_id": mock_tenant_data["organization_id"],
            "email": mock_tenant_data["contact_email"],
            "full_name": "Tenant Without Profile",
            "role": UserRole.TENANT.value,  # HAS TENANT ROLE
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_users_query = MagicMock()
        mock_users_query.execute.return_value = mock_user_result
        mock_users_table = MagicMock()
        mock_users_table.select.return_value.eq.return_value.single.return_value = (
            mock_users_query
        )

        # Mock tenant_users table - NO DATA (profile not found)
        mock_tenant_result = MagicMock()
        mock_tenant_result.data = None  # NO TENANT PROFILE

        mock_tenant_query = MagicMock()
        mock_tenant_query.execute.return_value = mock_tenant_result

        def table_side_effect(table_name: str):
            if table_name == "users":
                return mock_users_table
            elif table_name == "tenant_users":
                mock_tenant_table = MagicMock()
                mock_tenant_table.select.return_value.eq.return_value.maybe_single.return_value = (
                    mock_tenant_query
                )
                return mock_tenant_table
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        # Should raise 404 Not Found
        with pytest.raises(HTTPException) as exc_info:
            await get_current_tenant_user(
                credentials,
                mock_supabase,
                make_request("GET", "/api/v1/tenant/dashboard"),
            )

        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        assert "Tenant user profile not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_rls_token_set_on_client(self, mock_tenant_data: dict) -> None:
        """Test that JWT token is set on client for RLS enforcement."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="tenant-token-12345"
        )

        mock_supabase = MagicMock()

        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_tenant_data["user_id"]
        mock_auth_user.email = mock_tenant_data["contact_email"]

        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_auth_user
        mock_supabase.auth.get_user.return_value = mock_auth_response

        mock_user_result = MagicMock()
        mock_user_result.data = {
            "id": mock_tenant_data["user_id"],
            "organization_id": mock_tenant_data["organization_id"],
            "email": mock_tenant_data["contact_email"],
            "full_name": mock_tenant_data["contact_name"],
            "role": UserRole.TENANT.value,
            "created_at": mock_tenant_data["created_at"],
            "updated_at": mock_tenant_data["created_at"],
        }

        mock_users_query = MagicMock()
        mock_users_query.execute.return_value = mock_user_result
        mock_users_table = MagicMock()
        mock_users_table.select.return_value.eq.return_value.single.return_value = (
            mock_users_query
        )

        mock_tenant_result = MagicMock()
        mock_tenant_result.data = mock_tenant_data
        mock_tenant_query = MagicMock()
        mock_tenant_query.execute.return_value = mock_tenant_result

        def table_side_effect(table_name: str):
            if table_name == "users":
                return mock_users_table
            elif table_name == "tenant_users":
                mock_tenant_table = MagicMock()
                mock_tenant_table.select.return_value.eq.return_value.maybe_single.return_value = (
                    mock_tenant_query
                )
                return mock_tenant_table
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        await get_current_tenant_user(
            credentials,
            mock_supabase,
            make_request("GET", "/api/v1/tenant/dashboard"),
        )

        # Verify RLS token was set
        mock_supabase.postgrest.auth.assert_called_once_with("tenant-token-12345")

    def test_current_tenant_user_type_alias_exists(self) -> None:
        """Test that CurrentTenantUser type alias is available."""
        assert CurrentTenantUser is not None
        # Type aliases are annotations, so we just verify import worked

    @pytest.mark.asyncio
    async def test_tenant_user_fields_populated_correctly(
        self, mock_tenant_data: dict
    ) -> None:
        """Test that all TenantUser fields are populated from database."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="valid-token"
        )

        mock_supabase = MagicMock()

        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_tenant_data["user_id"]
        mock_auth_user.email = mock_tenant_data["contact_email"]

        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_auth_user
        mock_supabase.auth.get_user.return_value = mock_auth_response

        mock_user_result = MagicMock()
        mock_user_result.data = {
            "id": mock_tenant_data["user_id"],
            "organization_id": mock_tenant_data["organization_id"],
            "email": mock_tenant_data["contact_email"],
            "full_name": mock_tenant_data["contact_name"],
            "role": UserRole.TENANT.value,
            "created_at": mock_tenant_data["created_at"],
            "updated_at": mock_tenant_data["created_at"],
        }

        mock_users_query = MagicMock()
        mock_users_query.execute.return_value = mock_user_result
        mock_users_table = MagicMock()
        mock_users_table.select.return_value.eq.return_value.single.return_value = (
            mock_users_query
        )

        mock_tenant_result = MagicMock()
        mock_tenant_result.data = mock_tenant_data
        mock_tenant_query = MagicMock()
        mock_tenant_query.execute.return_value = mock_tenant_result

        def table_side_effect(table_name: str):
            if table_name == "users":
                return mock_users_table
            elif table_name == "tenant_users":
                mock_tenant_table = MagicMock()
                mock_tenant_table.select.return_value.eq.return_value.maybe_single.return_value = (
                    mock_tenant_query
                )
                return mock_tenant_table
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        result = await get_current_tenant_user(
            credentials,
            mock_supabase,
            make_request("GET", "/api/v1/tenant/dashboard"),
        )

        # Verify all fields
        assert result.id is not None
        assert result.user_id is not None
        assert result.organization_id is not None
        assert result.contact_name == "John Tenant"
        assert result.contact_email == "tenant@example.com"
        assert result.created_at is not None


class TestGetCurrentUserSetsIsAnonymous:
    """Test that get_current_user propagates the is_anonymous flag correctly."""

    @pytest.fixture
    def mock_user_data(self) -> dict:
        """Sample user data from database."""
        return {
            "id": str(uuid4()),
            "organization_id": str(uuid4()),
            "email": "normal@example.com",
            "full_name": "Normal User",
            "role": "member",
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

    def _build_supabase_mock(self, mock_user_data: dict) -> MagicMock:
        mock_execute = MagicMock()
        mock_execute.data = mock_user_data
        mock_single = MagicMock()
        mock_single.execute.return_value = mock_execute
        mock_eq = MagicMock()
        mock_eq.single.return_value = mock_single
        mock_select = MagicMock()
        mock_select.eq.return_value = mock_eq
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_supabase = MagicMock()
        mock_supabase.table.return_value = mock_table
        return mock_supabase

    @pytest.mark.asyncio
    async def test_normal_user_is_anonymous_false(self, mock_user_data: dict) -> None:
        """is_anonymous is False for a regular (non-anonymous) auth user."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="normal-token"
        )
        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_user_data["id"]
        mock_auth_user.is_anonymous = False

        mock_supabase = self._build_supabase_mock(mock_user_data)
        mock_supabase.auth.get_user.return_value = MagicMock(user=mock_auth_user)

        user = await get_current_user(
            credentials=credentials,
            supabase=mock_supabase,
            request=make_request("GET", "/api/v1/properties"),
        )

        assert user.is_anonymous is False

    @pytest.mark.asyncio
    async def test_anonymous_user_is_anonymous_true(self, mock_user_data: dict) -> None:
        """is_anonymous is True when the Supabase auth user is anonymous."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="anon-token"
        )
        mock_auth_user = MagicMock()
        mock_auth_user.id = mock_user_data["id"]
        mock_auth_user.is_anonymous = True

        mock_supabase = self._build_supabase_mock(mock_user_data)
        mock_supabase.auth.get_user.return_value = MagicMock(user=mock_auth_user)

        # Use an allowlisted anonymous route so the request is not rejected
        user = await get_current_user(
            credentials=credentials,
            supabase=mock_supabase,
            request=make_request("POST", "/api/v1/properties"),
        )

        assert user.is_anonymous is True


class TestRequireFullAccess:
    """Tests for the require_full_access entitlement gate."""

    def _make_ctx(self, is_anonymous: bool = False) -> OrganizationContext:
        """Build a minimal OrganizationContext with the given is_anonymous flag."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="user@example.com",
            role=UserRole.MEMBER,
            is_anonymous=is_anonymous,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        return OrganizationContext(
            client=MagicMock(),
            organization_id=user.organization_id,
            user=user,
        )

    @pytest.mark.asyncio
    async def test_anonymous_user_is_exempt_from_gate(self) -> None:
        """Anonymous PLG sessions pass require_full_access without any subscription."""
        ctx = self._make_ctx(is_anonymous=True)
        # Should not raise — no has_full_access check is performed
        result = await require_full_access(ctx)
        assert result is None

    @pytest.mark.asyncio
    async def test_non_anonymous_without_subscription_raises_402(self) -> None:
        """Non-anonymous user without a subscription gets 402."""
        ctx = self._make_ctx(is_anonymous=False)
        with patch(
            "app.services.billing.entitlements.has_full_access", return_value=False
        ) as mock_hfa:
            with pytest.raises(HTTPException) as exc_info:
                await require_full_access(ctx)
            mock_hfa.assert_called_once_with(ctx)

        assert exc_info.value.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_non_anonymous_with_subscription_passes(self) -> None:
        """Non-anonymous user with full access passes the gate."""
        ctx = self._make_ctx(is_anonymous=False)
        with patch(
            "app.services.billing.entitlements.has_full_access", return_value=True
        ):
            result = await require_full_access(ctx)
        assert result is None
