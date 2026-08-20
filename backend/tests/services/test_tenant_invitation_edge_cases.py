"""Additional tests for TenantInvitationService edge cases.

These tests cover error paths and edge cases for additional coverage.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.exceptions.handlers import InvalidInvitationTokenError
from app.legal_terms import TERMS_HASH, TERMS_VERSION


def make_valid_tenant_invitation_data() -> dict:
    """Create valid tenant invitation data for testing."""
    valid_token = str(uuid4())  # 36 chars, alphanumeric + hyphens
    return {
        "id": str(uuid4()),
        "token": valid_token,
        "email": "tenant@example.com",
        "lease_id": str(uuid4()),
        "organization_id": str(uuid4()),
        "invited_by": str(uuid4()),
        "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        "used_at": None,
        "used_by_user_id": None,
        "revoked_at": None,
        "is_revoked": False,
        "created_at": datetime.now(UTC).isoformat(),
    }


# Valid token for tests (meets min length of 32 chars)
VALID_TEST_TOKEN = "valid-test-token-12345678901234567890"


def current_terms_kwargs() -> dict[str, str | bool]:
    """Return current legal acceptance fields for direct service calls."""
    return {
        "accepted_terms": True,
        "terms_version": TERMS_VERSION,
        "terms_hash": TERMS_HASH,
    }


@pytest.fixture
def mock_db():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def mock_admin():
    """Mock Supabase admin client."""
    return MagicMock()


@pytest.fixture
def service(mock_db, mock_admin):
    """Create TenantInvitationService with mocked dependencies."""
    from app.services.tenant_invitation import TenantInvitationService

    with patch(
        "app.services.tenant_invitation.get_supabase_admin", return_value=mock_admin
    ):
        return TenantInvitationService(db=mock_db)


class TestValidateTokenEdgeCases:
    """Edge case tests for validate_token method."""

    async def test_validate_token_with_none(self, service, mock_db) -> None:
        """Token that is None raises not_found error (line 51)."""
        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(None)
        assert exc_info.value.reason == "not_found"
        mock_db.table.assert_not_called()

    async def test_validate_token_with_non_string(self, service, mock_db) -> None:
        """Token that is not a string raises not_found error (line 51)."""
        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(12345)
        assert exc_info.value.reason == "not_found"
        mock_db.table.assert_not_called()

    async def test_validate_token_with_invalid_chars(self, service, mock_db) -> None:
        """Token with invalid characters raises not_found error (line 61)."""
        # Token with @ character (not allowed)
        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token("valid-length-token-with-invalid@chars")
        assert exc_info.value.reason == "not_found"
        mock_db.table.assert_not_called()

    async def test_validate_token_not_found_in_db(self, service, mock_db) -> None:
        """Token not found in database raises not_found error (line 68)."""
        mock_result = MagicMock()
        mock_result.data = []
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(VALID_TEST_TOKEN)
        assert exc_info.value.reason == "not_found"

    async def test_validate_token_revoked(self, service, mock_admin) -> None:
        """Revoked token raises revoked error."""
        invitation_data = make_valid_tenant_invitation_data()
        invitation_data["revoked_at"] = datetime.now(UTC).isoformat()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_admin.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(invitation_data["token"])
        assert exc_info.value.reason == "revoked"

    async def test_validate_token_already_used(self, service, mock_admin) -> None:
        """Already used token raises used error."""
        invitation_data = make_valid_tenant_invitation_data()
        invitation_data["used_at"] = datetime.now(UTC).isoformat()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_admin.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(invitation_data["token"])
        assert exc_info.value.reason == "used"

    async def test_validate_token_expired(self, service, mock_admin) -> None:
        """Expired token raises expired error."""
        invitation_data = make_valid_tenant_invitation_data()
        invitation_data["expires_at"] = (
            datetime.now(UTC) - timedelta(days=1)
        ).isoformat()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_admin.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(invitation_data["token"])
        assert exc_info.value.reason == "expired"


class TestCreateInvitationEdgeCases:
    """Edge case tests for create_invitation method."""

    async def test_create_invitation_failure(self, service, mock_admin) -> None:
        """Failed invitation creation raises HTTPException (lines 240-242)."""
        from fastapi import HTTPException

        # Mock empty result (insertion failed)
        mock_result = MagicMock()
        mock_result.data = []
        service.supabase_admin.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.create_invitation(
                email="test@example.com",
                lease_id=uuid4(),
                invited_by=uuid4(),
                organization_id=uuid4(),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to create invitation" in exc_info.value.detail

    async def test_create_invitation_success(self, service, mock_db) -> None:
        """Successful invitation creation returns invitation data."""
        invitation_data = make_valid_tenant_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        result = await service.create_invitation(
            email="test@example.com",
            lease_id=uuid4(),
            invited_by=uuid4(),
            organization_id=uuid4(),
        )

        assert result["email"] == invitation_data["email"]


class TestCompleteSignupEdgeCases:
    """Edge case tests for complete_signup method."""

    async def test_complete_signup_auth_failure(self, service, mock_admin) -> None:
        """Failed auth user creation raises HTTPException."""
        from fastapi import HTTPException

        invitation_data = make_valid_tenant_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_admin.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        # Auth user creation returns None user
        mock_auth_response = MagicMock()
        mock_auth_response.user = None
        service.supabase_admin.auth.admin.create_user = MagicMock(
            return_value=mock_auth_response
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.complete_signup(
                token=invitation_data["token"],
                password="SecurePassword123!",
                contact_name="Test User",
                **current_terms_kwargs(),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to create auth user" in exc_info.value.detail

    async def test_complete_signup_tenant_user_failure(
        self, service, mock_admin
    ) -> None:
        """Failed tenant user creation raises HTTPException."""
        from fastapi import HTTPException

        invitation_data = make_valid_tenant_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_admin.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        mock_user = MagicMock()
        mock_user.id = str(uuid4())
        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_user
        service.supabase_admin.auth.admin.create_user = MagicMock(
            return_value=mock_auth_response
        )

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "tenant_invitations":
                mock_qb.select.return_value.eq.return_value.execute.return_value = (
                    mock_result
                )
            if table_name == "tenant_users":
                # Tenant user insertion returns empty data
                mock_insert_result = MagicMock()
                mock_insert_result.data = []
                mock_qb.insert.return_value.execute.return_value = mock_insert_result
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        with pytest.raises(HTTPException) as exc_info:
            await service.complete_signup(
                token=invitation_data["token"],
                password="SecurePassword123!",
                contact_name="Test User",
                **current_terms_kwargs(),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to create tenant user" in exc_info.value.detail

    async def test_complete_signup_token_generation_failure(
        self, service, mock_admin
    ) -> None:
        """Failed token generation raises HTTPException."""
        from fastapi import HTTPException

        invitation_data = make_valid_tenant_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_admin.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        mock_user = MagicMock()
        mock_user.id = str(uuid4())
        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_user
        service.supabase_admin.auth.admin.create_user = MagicMock(
            return_value=mock_auth_response
        )

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "tenant_invitations":
                mock_qb.select.return_value.eq.return_value.execute.return_value = (
                    mock_result
                )
                mock_qb.update.return_value.eq.return_value.execute.return_value = (
                    MagicMock()
                )
            elif table_name == "tenant_users":
                mock_insert_result = MagicMock()
                mock_insert_result.data = [{"id": str(uuid4())}]
                mock_qb.insert.return_value.execute.return_value = mock_insert_result
            elif table_name == "tenant_lease_links":
                mock_qb.insert.return_value.execute.return_value = MagicMock()
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        # Sign in returns None session
        mock_signin_response = MagicMock()
        mock_signin_response.session = None
        service.supabase_admin.auth.sign_in_with_password = MagicMock(
            return_value=mock_signin_response
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.complete_signup(
                token=invitation_data["token"],
                password="SecurePassword123!",
                contact_name="Test User",
                **current_terms_kwargs(),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to generate tokens" in exc_info.value.detail

    async def test_complete_signup_rejects_concurrently_used_token(
        self, service, mock_admin
    ) -> None:
        """Signup fails if the invitation was consumed after validation."""
        invitation_data = make_valid_tenant_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]

        mock_user = MagicMock()
        mock_user.id = str(uuid4())
        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_user
        service.supabase_admin.auth.admin.create_user = MagicMock(
            return_value=mock_auth_response
        )

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "tenant_invitations":
                mock_qb.select.return_value.eq.return_value.execute.return_value = (
                    mock_result
                )
                mock_qb.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
                    data=[]
                )
            elif table_name == "tenant_users":
                mock_qb.insert.return_value.execute.return_value = MagicMock(
                    data=[
                        {
                            "id": str(uuid4()),
                            "user_id": str(mock_user.id),
                            "organization_id": invitation_data["organization_id"],
                            "contact_name": "Test User",
                            "contact_email": invitation_data["email"],
                            "created_at": datetime.now(UTC).isoformat(),
                        }
                    ]
                )
            elif table_name == "tenant_lease_links":
                mock_qb.insert.return_value.execute.return_value = MagicMock()
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.complete_signup(
                token=invitation_data["token"],
                password="SecurePassword123!",
                contact_name="Test User",
                **current_terms_kwargs(),
            )

        assert exc_info.value.reason == "used"
        service.supabase_admin.auth.sign_in_with_password.assert_not_called()
