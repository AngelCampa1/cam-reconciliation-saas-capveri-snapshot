"""Tests for TeamInvitationService.

These tests verify team member invitation token validation and signup flow,
including all error cases and the complete signup process.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.exceptions.handlers import InvalidInvitationTokenError
from app.legal_terms import TERMS_HASH, TERMS_VERSION


def make_valid_team_invitation_data() -> dict:
    """Create valid team invitation data for testing."""
    # Use UUID-format token to pass length/format validation
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
    """Create TeamInvitationService with mocked dependencies."""
    from app.services.team_invitation import TeamInvitationService

    with patch(
        "app.services.team_invitation.get_supabase_admin", return_value=mock_admin
    ):
        return TeamInvitationService(db=mock_db)


class TestValidateToken:
    """Tests for validate_token method."""

    async def test_valid_token_success(self, service, mock_db) -> None:
        """Valid token passes validation and returns invitation with org name."""
        invitation_data = make_valid_team_invitation_data()
        org_data = {"id": invitation_data["organization_id"], "name": "Test Org"}

        # Mock invitation lookup
        mock_inv_result = MagicMock()
        mock_inv_result.data = [invitation_data]

        # Mock organization lookup for name
        mock_org_result = MagicMock()
        mock_org_result.data = [org_data]

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "team_member_invitations":
                mock_qb.select.return_value.eq.return_value.execute.return_value = (
                    mock_inv_result
                )
            elif table_name == "organizations":
                mock_qb.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                    mock_org_result
                )
            return mock_qb

        mock_db.table.side_effect = mock_table

        result = await service.validate_token(invitation_data["token"])

        assert result["email"] == invitation_data["email"]
        assert result["role"] == invitation_data["role"]
        mock_db.table.assert_any_call("team_member_invitations")

    async def test_valid_token_success_when_invitation_is_hidden_by_rls(
        self, service, mock_db
    ) -> None:
        """Valid public invite tokens are looked up server-side despite RLS."""
        invitation_data = make_valid_team_invitation_data()
        org_data = {"id": invitation_data["organization_id"], "name": "Test Org"}

        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        def mock_admin_table(table_name):
            mock_qb = MagicMock()
            if table_name == "team_member_invitations":
                mock_qb.select.return_value.eq.return_value.execute.return_value = (
                    MagicMock(data=[invitation_data])
                )
            elif table_name == "organizations":
                mock_qb.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                    data=org_data
                )
            return mock_qb

        service.supabase_admin.table.side_effect = mock_admin_table

        result = await service.validate_token(invitation_data["token"])

        assert result["email"] == invitation_data["email"]
        assert result["organization_name"] == "Test Org"
        service.supabase_admin.table.assert_any_call("team_member_invitations")

    async def test_token_not_found(self, service, mock_db) -> None:
        """Token not found raises error."""
        mock_result = MagicMock()
        mock_result.data = []
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(VALID_TEST_TOKEN)
        assert exc_info.value.reason == "not_found"

    async def test_token_revoked(self, service, mock_db) -> None:
        """Revoked token raises error."""
        invitation_data = make_valid_team_invitation_data()
        invitation_data["revoked_at"] = datetime.now(UTC).isoformat()
        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(invitation_data["token"])
        assert exc_info.value.reason == "revoked"

    async def test_token_already_used(self, service, mock_db) -> None:
        """Already used token raises error."""
        invitation_data = make_valid_team_invitation_data()
        invitation_data["used_at"] = datetime.now(UTC).isoformat()
        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(invitation_data["token"])
        assert exc_info.value.reason == "used"

    async def test_token_expired(self, service, mock_db) -> None:
        """Expired token raises error."""
        invitation_data = make_valid_team_invitation_data()
        invitation_data["expires_at"] = (
            datetime.now(UTC) - timedelta(days=7)
        ).isoformat()
        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(invitation_data["token"])
        assert exc_info.value.reason == "expired"

    async def test_token_too_short_returns_not_found(self, service, mock_db) -> None:
        """Token shorter than minimum length returns not_found (DoS prevention)."""
        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token("short")
        assert exc_info.value.reason == "not_found"
        # Verify no database call was made
        mock_db.table.assert_not_called()

    async def test_token_too_long_returns_not_found(self, service, mock_db) -> None:
        """Token longer than maximum length returns not_found (DoS prevention)."""
        long_token = "a" * 200
        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(long_token)
        assert exc_info.value.reason == "not_found"
        mock_db.table.assert_not_called()

    async def test_token_invalid_chars_returns_not_found(
        self, service, mock_db
    ) -> None:
        """Token with invalid characters returns not_found (DoS prevention)."""
        invalid_token = "valid-token-with-invalid-chars!@#$%^"
        with pytest.raises(InvalidInvitationTokenError) as exc_info:
            await service.validate_token(invalid_token)
        assert exc_info.value.reason == "not_found"
        mock_db.table.assert_not_called()


class TestCreateInvitation:
    """Tests for create_invitation method."""

    async def test_creates_invitation_with_default_member_role(
        self, service, mock_admin
    ) -> None:
        """Create invitation defaults to member role."""
        email = "newmember@example.com"
        invited_by = uuid4()
        organization_id = uuid4()

        created_data = {
            "id": str(uuid4()),
            "email": email,
            "role": "member",
            "token": "generated-token-123",
            "organization_id": str(organization_id),
            "invited_by": str(invited_by),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
        }

        mock_result = MagicMock()
        mock_result.data = [created_data]
        service.supabase_admin.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        result = await service.create_invitation(
            email=email,
            role="member",
            invited_by=invited_by,
            organization_id=organization_id,
        )

        assert result["email"] == email
        assert result["role"] == "member"
        service.supabase_admin.table.assert_called_with("team_member_invitations")

    async def test_creates_invitation_with_admin_role(
        self, service, mock_admin
    ) -> None:
        """Create invitation with admin role."""
        email = "newadmin@example.com"
        invited_by = uuid4()
        organization_id = uuid4()

        created_data = {
            "id": str(uuid4()),
            "email": email,
            "role": "admin",
            "token": "generated-token-456",
            "organization_id": str(organization_id),
            "invited_by": str(invited_by),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
        }

        mock_result = MagicMock()
        mock_result.data = [created_data]
        service.supabase_admin.table.return_value.insert.return_value.execute.return_value = (
            mock_result
        )

        result = await service.create_invitation(
            email=email,
            role="admin",
            invited_by=invited_by,
            organization_id=organization_id,
        )

        assert result["role"] == "admin"

    async def test_generates_secure_token(self, service, mock_admin) -> None:
        """Create invitation generates secure URL-safe token."""
        # Capture the inserted data to verify token
        captured_data = {}

        def capture_insert(data):
            captured_data.update(data)
            mock_result = MagicMock()
            mock_result.data = [data]
            return MagicMock(execute=lambda: mock_result)

        service.supabase_admin.table.return_value.insert.side_effect = capture_insert

        await service.create_invitation(
            email="test@example.com",
            role="member",
            invited_by=uuid4(),
            organization_id=uuid4(),
        )

        # Token should be at least 32 chars and URL-safe
        token = captured_data.get("token", "")
        assert len(token) >= 32
        # URL-safe tokens contain only alphanumeric, hyphens, underscores
        import re

        assert re.match(r"^[a-zA-Z0-9_-]+$", token)

    async def test_sets_7_day_expiration(self, service, mock_admin) -> None:
        """Create invitation sets 7-day expiration."""
        now = datetime.now(UTC)
        captured_data = {}

        def capture_insert(data):
            captured_data.update(data)
            mock_result = MagicMock()
            mock_result.data = [data]
            return MagicMock(execute=lambda: mock_result)

        service.supabase_admin.table.return_value.insert.side_effect = capture_insert

        await service.create_invitation(
            email="test@example.com",
            role="member",
            invited_by=uuid4(),
            organization_id=uuid4(),
        )

        expires_at_str = captured_data.get("expires_at", "")
        expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        expected = now + timedelta(days=7)

        # Should be within 1 minute of expected
        assert abs((expires_at - expected).total_seconds()) < 60


class TestCompleteSignup:
    """Tests for complete_signup method."""

    async def test_creates_user_in_existing_organization(
        self, service, mock_db, mock_admin
    ) -> None:
        """Signup creates user in the invited organization (not new org)."""
        invitation_data = make_valid_team_invitation_data()
        org_id = invitation_data["organization_id"]

        # Mock validate_token
        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        # Mock auth user creation
        mock_user = MagicMock()
        mock_user.id = str(uuid4())
        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_user
        service.supabase_admin.auth.admin.create_user = MagicMock(
            return_value=mock_auth_response
        )

        # Track what gets upserted into users table
        captured_user_data = {}

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "users":

                def capture_upsert(data):
                    captured_user_data.update(data)
                    mock_upsert_result = MagicMock()
                    mock_upsert_result.data = [data]
                    return MagicMock(execute=lambda: mock_upsert_result)

                mock_qb.upsert.side_effect = capture_upsert
            elif table_name == "team_member_invitations":
                mock_update_result = MagicMock()
                mock_update_result.data = [invitation_data]
                mock_qb.update.return_value.eq.return_value.execute.return_value = (
                    mock_update_result
                )
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        # Mock sign in
        mock_session = MagicMock()
        mock_session.access_token = "access_token_123"
        mock_session.refresh_token = "refresh_token_456"
        mock_signin_response = MagicMock()
        mock_signin_response.session = mock_session
        service.supabase_admin.auth.sign_in_with_password = MagicMock(
            return_value=mock_signin_response
        )

        await service.complete_signup(
            token=invitation_data["token"],
            password="SecurePassword123!",
            full_name="New Team Member",
            **current_terms_kwargs(),
        )

        # Verify user was created in the EXISTING organization
        assert captured_user_data["organization_id"] == org_id

    async def test_assigns_invited_role(self, service, mock_db, mock_admin) -> None:
        """Signup assigns the role from the invitation."""
        invitation_data = make_valid_team_invitation_data()
        invitation_data["role"] = "admin"  # Invited as admin

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

        captured_user_data = {}

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "users":

                def capture_upsert(data):
                    captured_user_data.update(data)
                    mock_upsert_result = MagicMock()
                    mock_upsert_result.data = [data]
                    return MagicMock(execute=lambda: mock_upsert_result)

                mock_qb.upsert.side_effect = capture_upsert
            elif table_name == "team_member_invitations":
                mock_update_result = MagicMock()
                mock_update_result.data = [invitation_data]
                mock_qb.update.return_value.eq.return_value.execute.return_value = (
                    mock_update_result
                )
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        mock_session = MagicMock()
        mock_session.access_token = "access_token"
        mock_session.refresh_token = "refresh_token"
        mock_signin_response = MagicMock()
        mock_signin_response.session = mock_session
        service.supabase_admin.auth.sign_in_with_password = MagicMock(
            return_value=mock_signin_response
        )

        await service.complete_signup(
            token=invitation_data["token"],
            password="SecurePassword123!",
            full_name="New Admin",
            **current_terms_kwargs(),
        )

        # Verify role was assigned from invitation
        assert captured_user_data["role"] == "admin"

    async def test_marks_invitation_used(self, service, mock_db, mock_admin) -> None:
        """Signup marks the invitation as used."""
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

        captured_update_data = {}

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "users":
                mock_upsert_result = MagicMock()
                mock_upsert_result.data = [{"id": str(mock_user.id)}]
                mock_qb.upsert.return_value.execute.return_value = mock_upsert_result
            elif table_name == "team_member_invitations":

                def capture_update(data):
                    captured_update_data.update(data)
                    mock_update_result = MagicMock()
                    mock_update_result.data = [invitation_data]
                    return MagicMock(
                        eq=lambda *args: MagicMock(execute=lambda: mock_update_result)
                    )

                mock_qb.update.side_effect = capture_update
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        mock_session = MagicMock()
        mock_session.access_token = "access_token"
        mock_session.refresh_token = "refresh_token"
        mock_signin_response = MagicMock()
        mock_signin_response.session = mock_session
        service.supabase_admin.auth.sign_in_with_password = MagicMock(
            return_value=mock_signin_response
        )

        await service.complete_signup(
            token=invitation_data["token"],
            password="SecurePassword123!",
            full_name="New Member",
            **current_terms_kwargs(),
        )

        # Verify invitation was marked as used
        assert "used_at" in captured_update_data
        assert "used_by_user_id" in captured_update_data

    async def test_returns_auth_tokens(self, service, mock_db, mock_admin) -> None:
        """Signup returns access and refresh tokens."""
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

        mock_session = MagicMock()
        mock_session.access_token = "my_access_token"
        mock_session.refresh_token = "my_refresh_token"
        mock_signin_response = MagicMock()
        mock_signin_response.session = mock_session
        service.supabase_admin.auth.sign_in_with_password = MagicMock(
            return_value=mock_signin_response
        )

        user_data, access_token, refresh_token = await service.complete_signup(
            token=invitation_data["token"],
            password="SecurePassword123!",
            full_name="New Member",
            **current_terms_kwargs(),
        )

        assert access_token == "my_access_token"
        assert refresh_token == "my_refresh_token"
        assert user_data is not None

    async def test_upserts_public_user_created_by_auth_trigger(
        self, service, mock_db
    ) -> None:
        """Signup updates the public user row if the auth trigger created it."""
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

        captured_user_data = {}

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "users":

                def capture_upsert(data):
                    captured_user_data.update(data)
                    mock_upsert_result = MagicMock()
                    mock_upsert_result.data = [data]
                    return MagicMock(execute=lambda: mock_upsert_result)

                mock_qb.upsert.side_effect = capture_upsert
            elif table_name == "team_member_invitations":
                mock_update_result = MagicMock()
                mock_update_result.data = [invitation_data]
                mock_qb.update.return_value.eq.return_value.execute.return_value = (
                    mock_update_result
                )
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        mock_session = MagicMock()
        mock_session.access_token = "access_token"
        mock_session.refresh_token = "refresh_token"
        mock_signin_response = MagicMock()
        mock_signin_response.session = mock_session
        service.supabase_admin.auth.sign_in_with_password = MagicMock(
            return_value=mock_signin_response
        )

        await service.complete_signup(
            token=invitation_data["token"],
            password="SecurePassword123!",
            full_name="New Member",
            **current_terms_kwargs(),
        )

        assert captured_user_data["id"] == str(mock_user.id)
        assert (
            captured_user_data["organization_id"] == invitation_data["organization_id"]
        )
        service.supabase_admin.table("users").insert.assert_not_called()

    async def test_invalid_token_raises_error(self, service, mock_db) -> None:
        """Signup with invalid token raises error."""
        mock_result = MagicMock()
        mock_result.data = []
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(InvalidInvitationTokenError):
            await service.complete_signup(
                token=VALID_TEST_TOKEN,
                password="SecurePassword123!",
                full_name="New Member",
                **current_terms_kwargs(),
            )


class TestServiceInitialization:
    """Tests for service initialization."""

    def test_service_initialization(self, mock_db, mock_admin) -> None:
        """Service initializes with db and admin clients."""
        from app.services.team_invitation import TeamInvitationService

        with patch(
            "app.services.team_invitation.get_supabase_admin", return_value=mock_admin
        ):
            service = TeamInvitationService(db=mock_db)
            assert service.db == mock_db
            assert service.supabase_admin == mock_admin


class TestAcceptForExistingUser:
    """Tests for accept_for_existing_user method."""

    async def test_accept_existing_user_success(self, service, mock_db) -> None:
        invitation_data = make_valid_team_invitation_data()
        user_id = uuid4()

        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        user_row = {
            "id": str(user_id),
            "organization_id": invitation_data["organization_id"],
            "email": invitation_data["email"],
            "role": "member",
        }

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "users":
                mock_qb.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
                    data=user_row
                )
                mock_qb.update.return_value.eq.return_value.execute.return_value = (
                    MagicMock(data=[user_row])
                )
            elif table_name == "team_member_invitations":
                mock_qb.update.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
                    data=[invitation_data]
                )
            return mock_qb

        service.supabase_admin.table.side_effect = mock_table

        message = await service.accept_for_existing_user(
            token=invitation_data["token"],
            user_id=user_id,
            user_email=invitation_data["email"],
        )

        assert "accepted" in message.lower()

    async def test_accept_existing_user_rejects_email_mismatch(
        self, service, mock_db
    ) -> None:
        invitation_data = make_valid_team_invitation_data()
        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        with pytest.raises(ValueError, match="email_mismatch"):
            await service.accept_for_existing_user(
                token=invitation_data["token"],
                user_id=uuid4(),
                user_email="different@example.com",
            )
