"""Tests for team invitation API endpoints.

Tests POST /api/v1/team/invitations for creating new team member invitations,
GET /{token}/validate for validating tokens, and POST /team/signup for signup.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.database.client import get_supabase_admin
from tests.conftest import ORG_A_ID, MockQueryBuilder


def _team_member_row(
    *,
    user_id: str | None = None,
    organization_id: str = str(ORG_A_ID),
    email: str = "member@example.com",
    full_name: str | None = "Team Member",
    role: str = "member",
) -> dict:
    now = datetime.now(UTC).isoformat()
    return {
        "id": user_id or str(uuid4()),
        "organization_id": organization_id,
        "email": email,
        "full_name": full_name,
        "role": role,
        "created_at": now,
        "updated_at": now,
        "is_platform_admin": False,
    }


def _mock_users_table(rows: list[dict]) -> MagicMock:
    def mock_table(table_name):
        if table_name == "users":
            return MockQueryBuilder(data=rows)
        return MockQueryBuilder(data=[])

    return MagicMock(side_effect=mock_table)


def _mock_users_table_sequence(*row_sets: list[dict]) -> MagicMock:
    calls = list(row_sets)

    def mock_table(table_name):
        if table_name == "users" and calls:
            return MockQueryBuilder(data=calls.pop(0))
        return MockQueryBuilder(data=[])

    return MagicMock(side_effect=mock_table)


class TestCreateTeamInvitation:
    """Tests for POST /api/v1/team/invitations endpoint."""

    def test_create_invitation_returns_201_with_valid_data(self, org_a_admin_client):
        """POST invitation returns 201 with valid email and role."""
        # Mock the created invitation
        created_invitation = {
            "id": str(uuid4()),
            "email": "newmember@example.com",
            "role": "member",
            "token": "test-secure-token-12345678901234",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(org_a_admin_client.user.id),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
            "used_at": None,
            "revoked_at": None,
        }

        def mock_table(table_name):
            if table_name == "team_member_invitations":
                return MockQueryBuilder(data=[created_invitation])
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Mock supabase_admin for the service
        mock_admin_client = MagicMock()
        mock_admin_client.table.side_effect = mock_table

        # Mock organization lookup for email
        mock_org_result = MagicMock()
        mock_org_result.data = {"id": str(ORG_A_ID), "name": "Test Org"}

        # Mock email service
        with (
            patch(
                "app.api.v1.team.invitations.get_email_service"
            ) as mock_email_service,
            patch(
                "app.services.team_invitation.get_supabase_admin",
                return_value=mock_admin_client,
            ),
        ):
            mock_service = MagicMock()
            mock_service.send_team_invitation = AsyncMock(
                return_value={"status": "sent", "id": "email-123"}
            )
            mock_email_service.return_value = mock_service

            response = org_a_admin_client.post(
                "/api/v1/team/invitations",
                json={"email": "newmember@example.com", "role": "member"},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newmember@example.com"
        assert data["role"] == "member"
        assert "token" in data
        assert "expires_at" in data

    def test_create_invitation_requires_admin_role(self, org_a_member_client):
        """POST invitation returns 403 for non-admin users."""
        response = org_a_member_client.post(
            "/api/v1/team/invitations",
            json={"email": "newmember@example.com", "role": "member"},
        )

        assert response.status_code == 403
        assert "Admin privileges required" in response.json()["detail"]

    def test_create_invitation_rejects_owner_role(self, org_a_admin_client):
        """POST invitation returns 422 when trying to invite as owner."""
        response = org_a_admin_client.post(
            "/api/v1/team/invitations",
            json={"email": "newowner@example.com", "role": "owner"},
        )

        assert response.status_code == 422  # Validation error

    def test_create_invitation_validates_email_format(self, org_a_admin_client):
        """POST invitation returns 422 for invalid email format."""
        response = org_a_admin_client.post(
            "/api/v1/team/invitations",
            json={"email": "invalid-email", "role": "member"},
        )

        assert response.status_code == 422  # Validation error

    def test_create_invitation_validates_role(self, org_a_admin_client):
        """POST invitation returns 422 for invalid role."""
        response = org_a_admin_client.post(
            "/api/v1/team/invitations",
            json={"email": "valid@example.com", "role": "superadmin"},
        )

        assert response.status_code == 422  # Validation error

    def test_create_invitation_sets_7_day_expiration(self, org_a_admin_client):
        """POST invitation sets expiration to 7 days from now."""
        now = datetime.now(UTC)

        created_invitation = {
            "id": str(uuid4()),
            "email": "newmember@example.com",
            "role": "member",
            "token": "test-token-12345678901234567890",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(org_a_admin_client.user.id),
            "expires_at": (now + timedelta(days=7)).isoformat(),
            "created_at": now.isoformat(),
            "used_at": None,
            "revoked_at": None,
        }

        def mock_table(table_name):
            if table_name == "team_member_invitations":
                return MockQueryBuilder(data=[created_invitation])
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        mock_admin_client = MagicMock()
        mock_admin_client.table.side_effect = mock_table

        with (
            patch(
                "app.api.v1.team.invitations.get_email_service"
            ) as mock_email_service,
            patch(
                "app.services.team_invitation.get_supabase_admin",
                return_value=mock_admin_client,
            ),
        ):
            mock_service = MagicMock()
            mock_service.send_team_invitation = AsyncMock(
                return_value={"status": "sent", "id": "email-123"}
            )
            mock_email_service.return_value = mock_service

            response = org_a_admin_client.post(
                "/api/v1/team/invitations",
                json={"email": "newmember@example.com", "role": "member"},
            )

        assert response.status_code == 201
        data = response.json()
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        expected_expiry = now + timedelta(days=7)
        # Should be within 1 minute tolerance
        assert abs((expires_at - expected_expiry).total_seconds()) < 60

    @pytest.mark.asyncio
    async def test_create_invitation_uses_default_org_name_when_lookup_fails(self):
        """Email falls back to default org label if org lookup fails."""
        from fastapi import BackgroundTasks

        from app.api.v1.team.invitations import create_team_invitation
        from app.models.team_invitation import TeamMemberInvitationCreateRequest

        request = TeamMemberInvitationCreateRequest(
            email="newmember@example.com",
            role="member",
        )
        ctx = MagicMock()
        ctx.organization_id = ORG_A_ID
        ctx.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = Exception(
            "org lookup failed"
        )
        user = MagicMock()
        user.id = uuid4()
        user.full_name = "Admin User"
        db = MagicMock()
        email_service = MagicMock()
        email_service.send_team_invitation = AsyncMock(return_value={"id": "email-123"})
        invitation = {
            "id": str(uuid4()),
            "email": "newmember@example.com",
            "role": "member",
            "token": "test-secure-token-12345678901234",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(user.id),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
            "used_at": None,
            "revoked_at": None,
        }

        background_tasks = BackgroundTasks()
        with patch(
            "app.api.v1.team.invitations.TeamInvitationService.create_invitation",
            new=AsyncMock(return_value=invitation),
        ):
            result = await create_team_invitation(
                request=request,
                background_tasks=background_tasks,
                ctx=ctx,
                user=user,
                db=db,
                email_service=email_service,
            )

        assert result.email == "newmember@example.com"
        # The email send is scheduled as a background task; the response is
        # returned before it runs (F-144). Execute the queued task to verify it
        # still calls the email service with the expected arguments.
        email_service.send_team_invitation.assert_not_awaited()
        await background_tasks()
        email_service.send_team_invitation.assert_awaited_once()
        assert (
            email_service.send_team_invitation.call_args.kwargs["organization_name"]
            == "your organization"
        )


class TestValidateTeamInvitation:
    """Tests for GET /api/v1/team/invitations/{token}/validate endpoint."""

    def test_returns_valid_for_good_token(self, org_a_admin_client):
        """Valid token returns valid=True with invitation details."""
        token = str(uuid4())
        invitation_data = {
            "id": str(uuid4()),
            "token": token,
            "email": "invited@example.com",
            "role": "member",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(uuid4()),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "used_at": None,
            "revoked_at": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
        org_data = {"id": str(ORG_A_ID), "name": "Test Organization"}

        def mock_table(table_name):
            if table_name == "team_member_invitations":
                return MockQueryBuilder(data=[invitation_data])
            elif table_name == "organizations":
                # For single(), return the org_data directly
                mock_qb = MagicMock()
                mock_result = MagicMock()
                mock_result.data = org_data
                mock_qb.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                    mock_result
                )
                return mock_qb
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(f"/api/v1/team/invitations/{token}/validate")

        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["email"] == "invited@example.com"
        assert data["role"] == "member"

    def test_returns_200_for_invalid_token(self, org_a_admin_client):
        """Invalid token returns HTTP 200 (not 404) to prevent enumeration."""

        def mock_table(table_name):
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(
            "/api/v1/team/invitations/invalid-token-12345678901234/validate"
        )

        # Should return 200, not 404 (non-enumerable)
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert data["error_reason"] == "not_found"

    def test_returns_not_valid_for_expired_token(self, org_a_admin_client):
        """Expired token returns valid=False with error_reason=expired."""
        token = str(uuid4())
        invitation_data = {
            "id": str(uuid4()),
            "token": token,
            "email": "invited@example.com",
            "role": "member",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(uuid4()),
            "expires_at": (
                datetime.now(UTC) - timedelta(days=1)
            ).isoformat(),  # Expired
            "used_at": None,
            "revoked_at": None,
            "created_at": datetime.now(UTC).isoformat(),
        }

        def mock_table(table_name):
            if table_name == "team_member_invitations":
                return MockQueryBuilder(data=[invitation_data])
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get(f"/api/v1/team/invitations/{token}/validate")

        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert data["error_reason"] == "expired"

    def test_returns_429_with_retry_after_when_rate_limit_exceeded(
        self, org_a_admin_client
    ):
        """Validation endpoint returns 429 with Retry-After when throttled."""
        token = str(uuid4())

        with (
            patch("app.api.v1.team.invitations.moving_window.hit", return_value=False),
            patch(
                "app.api.v1.team.invitations.moving_window.get_window_stats",
                return_value=MagicMock(reset_time=150.0),
            ),
            patch("app.api.v1.team.invitations.time.time", return_value=120.0),
            patch("app.api.v1.team.invitations.TeamInvitationService") as service,
        ):
            response = org_a_admin_client.get(
                f"/api/v1/team/invitations/{token}/validate"
            )

        assert response.status_code == 429
        assert response.headers["Retry-After"] == "30"
        assert (
            response.json()["detail"] == "Rate limit exceeded. Retry after 30 seconds."
        )
        service.return_value.validate_token.assert_not_called()


class TestListTeamInvitations:
    """Tests for GET /api/v1/team/invitations endpoint."""

    def test_list_invitations_admin_only(self, org_a_member_client):
        """List invitations returns 403 for non-admin users."""
        response = org_a_member_client.get("/api/v1/team/invitations")

        assert response.status_code == 403

    def test_list_invitations_returns_org_invitations(self, org_a_admin_client):
        """List invitations returns invitations for the organization."""
        invitations = [
            {
                "id": str(uuid4()),
                "email": "member1@example.com",
                "role": "member",
                "token": "token-1",
                "organization_id": str(ORG_A_ID),
                "invited_by": str(org_a_admin_client.user.id),
                "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
                "used_at": None,
                "revoked_at": None,
                "created_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(uuid4()),
                "email": "member2@example.com",
                "role": "admin",
                "token": "token-2",
                "organization_id": str(ORG_A_ID),
                "invited_by": str(org_a_admin_client.user.id),
                "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
                "used_at": None,
                "revoked_at": None,
                "created_at": datetime.now(UTC).isoformat(),
            },
        ]

        def mock_table(table_name):
            if table_name == "team_member_invitations":
                return MockQueryBuilder(data=invitations)
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.get("/api/v1/team/invitations")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2


class TestTeamMembers:
    """Tests for current team member management endpoints."""

    def test_list_members_admin_only(self, org_a_member_client):
        response = org_a_member_client.get("/api/v1/team/members")

        assert response.status_code == 403

    def test_list_members_returns_current_org_members(self, org_a_admin_client):
        current_user = org_a_admin_client.user
        other_member = _team_member_row(
            email="analyst@example.com",
            full_name="Analyst User",
            role="viewer",
        )
        users = [
            _team_member_row(
                user_id=str(current_user.id),
                email=current_user.email,
                full_name="Admin User",
                role=current_user.role.value,
            ),
            other_member,
            _team_member_row(
                organization_id=str(uuid4()),
                email="outside@example.com",
            ),
            _team_member_row(
                email="tenant@example.com",
                role="tenant",
            ),
        ]
        org_a_admin_client.mock_supabase.table = _mock_users_table(users)

        response = org_a_admin_client.get("/api/v1/team/members")

        assert response.status_code == 200
        data = response.json()
        assert [member["email"] for member in data] == [
            current_user.email,
            "analyst@example.com",
        ]
        assert data[0]["is_current_user"] is True
        assert data[1]["is_current_user"] is False
        assert "tenant@example.com" not in [member["email"] for member in data]

    def test_update_member_role_rejects_self_and_owner_role(self, org_a_admin_client):
        self_response = org_a_admin_client.patch(
            f"/api/v1/team/members/{org_a_admin_client.user.id}",
            json={"role": "viewer"},
        )
        owner_response = org_a_admin_client.patch(
            f"/api/v1/team/members/{uuid4()}",
            json={"role": "owner"},
        )

        assert self_response.status_code == 400
        assert "own role" in self_response.json()["detail"]
        assert owner_response.status_code == 422

    def test_update_member_role_updates_non_owner_org_member(self, org_a_admin_client):
        target_id = str(uuid4())
        users = [
            _team_member_row(
                user_id=target_id,
                email="analyst@example.com",
                role="member",
            )
        ]
        org_a_admin_client.mock_supabase.table = _mock_users_table(users)
        admin_supabase = MagicMock()
        admin_supabase.table = _mock_users_table(list(users))
        org_a_admin_client.app.dependency_overrides[get_supabase_admin] = (
            lambda: admin_supabase
        )

        response = org_a_admin_client.patch(
            f"/api/v1/team/members/{target_id}",
            json={"role": "admin"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == target_id
        assert data["role"] == "admin"
        admin_supabase.table.assert_called_with("users")

    def test_update_member_role_rejects_owner_target(self, org_a_admin_client):
        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table(
            [_team_member_row(user_id=target_id, role="owner")]
        )

        response = org_a_admin_client.patch(
            f"/api/v1/team/members/{target_id}",
            json={"role": "viewer"},
        )

        assert response.status_code == 400
        assert "owner" in response.json()["detail"].lower()

    def test_update_member_role_rejects_tenant_target(self, org_a_admin_client):
        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table(
            [_team_member_row(user_id=target_id, role="tenant")]
        )

        response = org_a_admin_client.patch(
            f"/api/v1/team/members/{target_id}",
            json={"role": "viewer"},
        )

        assert response.status_code == 404

    def test_update_member_role_handles_missing_write_result(self, org_a_admin_client):
        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table_sequence(
            [_team_member_row(user_id=target_id, role="member")],
            [],
        )

        response = org_a_admin_client.patch(
            f"/api/v1/team/members/{target_id}",
            json={"role": "admin"},
        )

        assert response.status_code == 404

    def test_update_member_role_rechecks_role_on_write(self, org_a_admin_client):
        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table_sequence(
            [_team_member_row(user_id=target_id, role="member")],
            [_team_member_row(user_id=target_id, role="owner")],
        )

        response = org_a_admin_client.patch(
            f"/api/v1/team/members/{target_id}",
            json={"role": "admin"},
        )

        assert response.status_code == 404

    def test_remove_member_rejects_self_and_owner_target(self, org_a_admin_client):
        self_response = org_a_admin_client.delete(
            f"/api/v1/team/members/{org_a_admin_client.user.id}"
        )

        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table(
            [_team_member_row(user_id=target_id, role="owner")]
        )
        owner_response = org_a_admin_client.delete(f"/api/v1/team/members/{target_id}")

        assert self_response.status_code == 400
        assert "own account" in self_response.json()["detail"]
        assert owner_response.status_code == 400
        assert "owner" in owner_response.json()["detail"].lower()

    def test_remove_member_rejects_tenant_target(self, org_a_admin_client):
        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table(
            [_team_member_row(user_id=target_id, role="tenant")]
        )

        response = org_a_admin_client.delete(f"/api/v1/team/members/{target_id}")

        assert response.status_code == 404

    def test_remove_member_handles_missing_write_result(self, org_a_admin_client):
        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table_sequence(
            [_team_member_row(user_id=target_id, role="viewer")],
            [],
        )

        response = org_a_admin_client.delete(f"/api/v1/team/members/{target_id}")

        assert response.status_code == 404

    def test_remove_member_rechecks_role_on_write(self, org_a_admin_client):
        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table_sequence(
            [_team_member_row(user_id=target_id, role="viewer")],
            [_team_member_row(user_id=target_id, role="tenant")],
        )

        response = org_a_admin_client.delete(f"/api/v1/team/members/{target_id}")

        assert response.status_code == 404

    def test_remove_member_deletes_non_owner_org_member(self, org_a_admin_client):
        target_id = str(uuid4())
        org_a_admin_client.mock_supabase.table = _mock_users_table(
            [_team_member_row(user_id=target_id, role="viewer")]
        )

        response = org_a_admin_client.delete(f"/api/v1/team/members/{target_id}")

        assert response.status_code == 200
        assert response.json() == {"status": "removed", "member_id": target_id}


class TestRevokeTeamInvitation:
    """Tests for DELETE /api/v1/team/invitations/{invitation_id} endpoint."""

    def test_revoke_invitation_admin_only(self, org_a_member_client):
        """Revoke invitation returns 403 for non-admin users."""
        invitation_id = str(uuid4())
        response = org_a_member_client.delete(
            f"/api/v1/team/invitations/{invitation_id}"
        )

        assert response.status_code == 403

    def test_revoke_invitation_success(self, org_a_admin_client):
        """Revoke invitation returns 200 on success."""
        invitation_id = str(uuid4())
        invitation_data = {
            "id": invitation_id,
            "email": "member@example.com",
            "role": "member",
            "token": "test-token",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(org_a_admin_client.user.id),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "used_at": None,
            "revoked_at": None,
            "created_at": datetime.now(UTC).isoformat(),
        }

        # Updated invitation data after revoke
        revoked_invitation = invitation_data.copy()
        revoked_invitation["revoked_at"] = datetime.now(UTC).isoformat()

        def mock_table(table_name):
            if table_name == "team_member_invitations":
                return MockQueryBuilder(data=[invitation_data])
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Mock supabase_admin for the update operation
        mock_admin = MagicMock()
        mock_update_result = MagicMock()
        mock_update_result.data = [revoked_invitation]
        mock_admin.table.return_value.update.return_value.eq.return_value.execute.return_value = (
            mock_update_result
        )

        with patch(
            "app.services.team_invitation.get_supabase_admin",
            return_value=mock_admin,
        ):
            response = org_a_admin_client.delete(
                f"/api/v1/team/invitations/{invitation_id}"
            )

        assert response.status_code == 200


class TestTeamMemberSignup:
    """Tests for POST /api/v1/team/signup endpoint."""

    def test_signup_creates_user_returns_tokens(self):
        """Successful signup creates user and returns auth tokens."""
        from starlette.testclient import TestClient

        from app.database.client import get_supabase
        from tests.conftest import create_test_app

        token = "secure_test_token_with_sufficient_length_1234"
        user_id = str(uuid4())
        invitation_data = {
            "id": str(uuid4()),
            "token": token,
            "email": "newmember@example.com",
            "role": "member",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(uuid4()),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "used_at": None,
            "revoked_at": None,
            "created_at": datetime.now(UTC).isoformat(),
        }

        # Create mock db client for get_supabase dependency
        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [invitation_data]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        # Create mock admin client for service operations
        mock_admin = MagicMock()

        # Mock auth user creation
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_auth_response = MagicMock()
        mock_auth_response.user = mock_user
        mock_admin.auth.admin.create_user = MagicMock(return_value=mock_auth_response)

        # Mock user upsert - return full user data
        mock_upsert_result = MagicMock()
        mock_upsert_result.data = [
            {
                "id": user_id,
                "email": "newmember@example.com",
                "role": "member",
                "organization_id": str(ORG_A_ID),
                "full_name": "New Team Member",
            }
        ]
        mock_admin.table.return_value.upsert.return_value.execute.return_value = (
            mock_upsert_result
        )
        mock_admin.table.return_value.update.return_value.eq.return_value.execute.return_value = (
            mock_result
        )

        # Mock sign in response with tokens
        mock_session = MagicMock()
        mock_session.access_token = "access_token_123"
        mock_session.refresh_token = "refresh_token_456"
        mock_signin_response = MagicMock()
        mock_signin_response.session = mock_session
        mock_admin.auth.sign_in_with_password = MagicMock(
            return_value=mock_signin_response
        )

        # Create app with proper dependency overrides
        app = create_test_app()
        app.dependency_overrides[get_supabase] = lambda: mock_db

        # Mock email service
        mock_email_service = MagicMock()
        mock_email_service.send_team_welcome = AsyncMock(
            return_value={"status": "sent", "id": "email-123"}
        )

        with (
            patch(
                "app.services.team_invitation.get_supabase_admin",
                return_value=mock_admin,
            ),
            patch(
                "app.api.v1.team.signup.get_email_service",
                return_value=mock_email_service,
            ),
        ):
            with TestClient(app) as client:
                response = client.post(
                    "/api/v1/team/signup",
                    json={
                        "token": token,
                        "password": "SecurePassword123!",
                        "full_name": "New Team Member",
                        "accepted_terms": True,
                        "terms_version": "2026-06-03",
                        "terms_hash": "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a",
                    },
                )

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "access_token" in data
        assert "refresh_token" in data
        assert "user_id" in data

    def test_signup_validates_password_strength(self, base_client):
        """Signup returns 422 for weak password."""
        token = str(uuid4())

        response = base_client.post(
            "/api/v1/team/signup",
            json={
                "token": token,
                "password": "weak",  # Too short
                "full_name": "New Member",
            },
        )

        assert response.status_code == 422  # Validation error

    def test_signup_requires_current_terms_acceptance(self, base_client):
        """Signup requires affirmative assent to the current terms."""
        valid_payload = {
            "token": "secure_test_token_with_sufficient_length_1234",
            "password": "SecurePassword123!",
            "full_name": "New Member",
            "accepted_terms": True,
            "terms_version": "2026-06-03",
            "terms_hash": "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a",
        }

        for payload in (
            {k: v for k, v in valid_payload.items() if k != "accepted_terms"},
            {**valid_payload, "accepted_terms": False},
            {**valid_payload, "terms_version": "2026-01-01"},
            {**valid_payload, "terms_hash": "sha256:stale"},
        ):
            response = base_client.post("/api/v1/team/signup", json=payload)

            assert response.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_signup_returns_410_for_invalid_invitation_token(self):
        """Invalid invitation token errors become HTTP 410 responses."""
        from app.api.v1.team.signup import team_member_signup
        from app.exceptions.handlers import InvalidInvitationTokenError
        from app.models.schemas.team_auth import TeamMemberSignupRequest

        request = TeamMemberSignupRequest(
            token="secure_test_token_with_sufficient_length_1234",
            password="SecurePassword123!",
            full_name="New Team Member",
            accepted_terms=True,
            terms_version="2026-06-03",
            terms_hash="sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a",
        )

        with patch(
            "app.api.v1.team.signup.TeamInvitationService.complete_signup",
            new=AsyncMock(side_effect=InvalidInvitationTokenError(reason="expired")),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await team_member_signup(
                    request=request,
                    db=MagicMock(),
                    email_service=MagicMock(),
                )

        assert exc_info.value.status_code == 410
        assert exc_info.value.detail == {
            "message": "Invalid invitation token",
            "reason": "expired",
        }


class TestAcceptTeamInvitation:
    """Tests for POST /api/v1/team/invitations/accept."""

    def test_accept_invitation_success(self, org_a_admin_client):
        token = "secure_test_token_with_sufficient_length_1234"
        invitation_data = {
            "id": str(uuid4()),
            "token": token,
            "email": org_a_admin_client.user.email,
            "role": "member",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(uuid4()),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "used_at": None,
            "revoked_at": None,
            "created_at": datetime.now(UTC).isoformat(),
        }

        def mock_table(table_name):
            if table_name == "team_member_invitations":
                return MockQueryBuilder(data=[invitation_data])
            if table_name == "users":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(org_a_admin_client.user.id),
                            "organization_id": str(ORG_A_ID),
                            "email": org_a_admin_client.user.email,
                            "role": "admin",
                        }
                    ]
                )
            if table_name == "organizations":
                return MockQueryBuilder(
                    data=[{"id": str(ORG_A_ID), "name": "Test Org"}]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        mock_admin = MagicMock()
        mock_admin.table.side_effect = mock_table
        with patch(
            "app.services.team_invitation.get_supabase_admin",
            return_value=mock_admin,
        ):
            response = org_a_admin_client.post(
                "/api/v1/team/invitations/accept",
                json={"token": token, "user_id": str(org_a_admin_client.user.id)},
            )

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_accept_invitation_rejects_user_mismatch(self, org_a_admin_client):
        response = org_a_admin_client.post(
            "/api/v1/team/invitations/accept",
            json={
                "token": "secure_test_token_with_sufficient_length_1234",
                "user_id": str(uuid4()),
            },
        )

        assert response.status_code == 403
