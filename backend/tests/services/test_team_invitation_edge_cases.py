"""Additional tests for TeamInvitationService edge cases.

These tests cover error paths and edge cases for additional coverage.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.exceptions.handlers import InvalidInvitationTokenError
from app.legal_terms import TERMS_HASH, TERMS_VERSION


def make_valid_team_invitation_data() -> dict:
    """Create valid team invitation data for testing."""
    valid_token = str(uuid4())  # 36 chars, alphanumeric + hyphens
    return {
        "id": str(uuid4()),
        "token": valid_token,
        "email": "newmember@example.com",
        "role": "member",
        "organization_id": str(uuid4()),
        "invited_by": str(uuid4()),
        "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        "used_at": None,
        "used_by_user_id": None,
        "revoked_at": None,
        "created_at": datetime.now(UTC).isoformat(),
    }


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
    """Create TeamInvitationService with mocked dependencies."""
    from app.services.team_invitation import TeamInvitationService

    with patch(
        "app.services.team_invitation.get_supabase_admin", return_value=mock_admin
    ):
        return TeamInvitationService(db=mock_db)


class TestValidateTokenEdgeCases:
    """Edge case tests for validate_token method."""

    async def test_validate_token_with_none(self, service, mock_db) -> None:
        """Token that is None raises not_found error (line 50)."""
        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(None)
        assert exc_info.value.reason == "not_found"
        mock_db.table.assert_not_called()

    async def test_validate_token_with_non_string(self, service, mock_db) -> None:
        """Token that is not a string raises not_found error (line 50)."""
        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(12345)
        assert exc_info.value.reason == "not_found"
        mock_db.table.assert_not_called()

    async def test_validate_token_org_lookup_failure(self, service, mock_db) -> None:
        """Organization lookup failure does not fail validation (lines 92-98)."""
        invitation_data = make_valid_team_invitation_data()

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "team_member_invitations":
                mock_result = MagicMock()
                mock_result.data = [invitation_data]
                mock_qb.select.return_value.eq.return_value.execute.return_value = (
                    mock_result
                )
            elif table_name == "organizations":
                # Organization lookup raises an exception
                mock_qb.select.return_value.eq.return_value.single.return_value.execute.side_effect = Exception(
                    "DB error"
                )
            return mock_qb

        mock_db.table.side_effect = mock_table

        result = await service.validate_token(invitation_data["token"])

        # Should still return invitation, just with org_name as None
        assert result["email"] == invitation_data["email"]
        assert result.get("organization_name") is None


class TestCreateInvitationEdgeCases:
    """Edge case tests for create_invitation method."""

    async def test_create_invitation_failure(self, service, mock_admin) -> None:
        """Failed invitation creation raises HTTPException (lines 149-151)."""
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
                role="member",
                invited_by=uuid4(),
                organization_id=uuid4(),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to create invitation" in exc_info.value.detail


class TestCompleteSignupEdgeCases:
    """Edge case tests for complete_signup method."""

    async def test_complete_signup_auth_user_creation_failure(
        self, service, mock_db, mock_admin
    ) -> None:
        """Failed auth user creation raises HTTPException (line 205)."""
        from fastapi import HTTPException

        invitation_data = make_valid_team_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
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
                full_name="Test User",
                **current_terms_kwargs(),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to create auth user" in exc_info.value.detail

    async def test_complete_signup_user_record_creation_failure(
        self, service, mock_db, mock_admin
    ) -> None:
        """Failed user record creation raises HTTPException (line 223)."""
        from fastapi import HTTPException

        invitation_data = make_valid_team_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
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
            if table_name == "users":
                # User upsert returns empty data
                mock_upsert_result = MagicMock()
                mock_upsert_result.data = []
                mock_qb.upsert.return_value.execute.return_value = mock_upsert_result
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        with pytest.raises(HTTPException) as exc_info:
            await service.complete_signup(
                token=invitation_data["token"],
                password="SecurePassword123!",
                full_name="Test User",
                **current_terms_kwargs(),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to create user record" in exc_info.value.detail

    async def test_complete_signup_token_generation_failure(
        self, service, mock_db, mock_admin
    ) -> None:
        """Failed token generation raises HTTPException (line 242)."""
        from fastapi import HTTPException

        invitation_data = make_valid_team_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
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
            if table_name == "users":
                mock_upsert_result = MagicMock()
                mock_upsert_result.data = [{"id": str(mock_user.id)}]
                mock_qb.upsert.return_value.execute.return_value = mock_upsert_result
            elif table_name == "team_member_invitations":
                mock_update_result = MagicMock()
                mock_update_result.data = [invitation_data]
                mock_qb.update.return_value.eq.return_value.execute.return_value = (
                    mock_update_result
                )
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
                full_name="Test User",
                **current_terms_kwargs(),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to generate tokens" in exc_info.value.detail

    async def test_complete_signup_rejects_concurrently_used_token(
        self, service, mock_db, mock_admin
    ) -> None:
        """Signup fails if the invitation was consumed after validation."""
        invitation_data = make_valid_team_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
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
            if table_name == "users":
                mock_qb.upsert.return_value.execute.return_value = MagicMock(
                    data=[{"id": str(mock_user.id)}]
                )
            elif table_name == "team_member_invitations":
                mock_qb.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
                    data=[]
                )
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.complete_signup(
                token=invitation_data["token"],
                password="SecurePassword123!",
                full_name="Test User",
                **current_terms_kwargs(),
            )

        assert exc_info.value.reason == "used"
        service.supabase_admin.auth.sign_in_with_password.assert_not_called()


class TestListInvitationsEdgeCases:
    """Edge case tests for list_invitations method."""

    async def test_list_invitations_default(self, service, mock_db) -> None:
        """List invitations excludes used/revoked by default (lines 271-275)."""
        org_id = uuid4()
        invitation_data = make_valid_team_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
            mock_result
        )

        result = await service.list_invitations(org_id, include_used=False)

        assert len(result) == 1
        mock_db.table.assert_called_with("team_member_invitations")

    async def test_list_invitations_include_used(self, service, mock_db) -> None:
        """List invitations includes used when requested (lines 271-275)."""
        org_id = uuid4()
        invitation_data = make_valid_team_invitation_data()
        invitation_data["used_at"] = datetime.now(UTC).isoformat()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
            mock_result
        )

        result = await service.list_invitations(org_id, include_used=True)

        assert len(result) == 1


class TestRevokeInvitationEdgeCases:
    """Edge case tests for revoke_invitation method."""

    async def test_revoke_invitation_not_found(self, service, mock_db) -> None:
        """Revoke non-existent invitation raises 404 (line 309)."""
        from fastapi import HTTPException

        mock_result = MagicMock()
        mock_result.data = []
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.revoke_invitation(uuid4(), uuid4())
        assert exc_info.value.status_code == 404
        assert "Invitation not found" in exc_info.value.detail

    async def test_revoke_invitation_already_used(self, service, mock_db) -> None:
        """Revoke used invitation raises 400 (line 314)."""
        from fastapi import HTTPException

        invitation_data = make_valid_team_invitation_data()
        invitation_data["used_at"] = datetime.now(UTC).isoformat()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.revoke_invitation(
                uuid4(),
                UUID(invitation_data["organization_id"]),
            )
        assert exc_info.value.status_code == 400
        assert "already been used" in exc_info.value.detail

    async def test_revoke_invitation_already_revoked(self, service, mock_db) -> None:
        """Revoke already-revoked invitation raises 400 (line 316)."""
        from fastapi import HTTPException

        invitation_data = make_valid_team_invitation_data()
        invitation_data["revoked_at"] = datetime.now(UTC).isoformat()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.revoke_invitation(
                uuid4(),
                UUID(invitation_data["organization_id"]),
            )
        assert exc_info.value.status_code == 400
        assert "already been revoked" in exc_info.value.detail

    async def test_revoke_invitation_update_failure(
        self, service, mock_db, mock_admin
    ) -> None:
        """Failed revocation update raises 500 (line 327)."""
        from fastapi import HTTPException

        invitation_data = make_valid_team_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        # Update returns empty data
        mock_update_result = MagicMock()
        mock_update_result.data = []
        service.supabase_admin.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_update_result
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.revoke_invitation(
                UUID(invitation_data["id"]),
                UUID(invitation_data["organization_id"]),
            )
        assert exc_info.value.status_code == 500
        assert "Failed to revoke invitation" in exc_info.value.detail

    async def test_revoke_invitation_success(
        self, service, mock_db, mock_admin
    ) -> None:
        """Successful revocation returns updated invitation."""
        invitation_data = make_valid_team_invitation_data()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        updated_invitation = dict(invitation_data)
        updated_invitation["revoked_at"] = datetime.now(UTC).isoformat()
        mock_update_result = MagicMock()
        mock_update_result.data = [updated_invitation]
        service.supabase_admin.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_update_result
        )

        result = await service.revoke_invitation(
            UUID(invitation_data["id"]),
            UUID(invitation_data["organization_id"]),
        )

        assert result["revoked_at"] is not None
