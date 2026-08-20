"""Tests for PLG onboarding API endpoints (TDD — written before implementation)."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_supabase_admin():
    """Mock admin Supabase client (service role)."""
    db = MagicMock()
    # Default: user does NOT already exist (not idempotent path)
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=None
    )
    # Default: insert succeeds
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "test-org-id"}]
    )
    # Default: update succeeds
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[{"id": "test-user-id"}])
    )
    return db


@pytest.fixture
def mock_supabase_anon():
    """Mock anon Supabase client (for auth.get_user validation)."""
    client = MagicMock()
    auth_user = MagicMock()
    auth_user.id = "aaaabbbb-1111-2222-3333-444455556666"
    auth_user.email = None  # anonymous user
    client.auth.get_user.return_value = MagicMock(user=auth_user)
    return client


@pytest.fixture
def mock_email_service():
    """Mock email service."""
    service = MagicMock()
    service.send_welcome_email = AsyncMock(return_value={"id": "email-123"})
    return service


@pytest.fixture
def client_with_mocks(mock_supabase_admin, mock_supabase_anon, mock_email_service):
    """Test client with all dependencies mocked."""
    from app.database.client import get_supabase, get_supabase_admin

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon

    yield TestClient(app)

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /api/v1/onboard/init
# ---------------------------------------------------------------------------

ANON_USER_ID = "aaaabbbb-1111-2222-3333-444455556666"
VALID_BEARER = "valid-anon-jwt-token"


def test_init_creates_org_and_user_for_anon_user(
    mock_supabase_admin, mock_supabase_anon
):
    """init endpoint creates org + user rows for a valid anonymous JWT."""
    from app.api.v1.onboard import get_onboard_email_service
    from app.database.client import get_supabase, get_supabase_admin

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon
    app.dependency_overrides[get_onboard_email_service] = lambda: MagicMock(
        send_welcome_email=AsyncMock()
    )

    client = TestClient(app)
    response = client.post(
        "/api/v1/onboard/init",
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert "organization_id" in body
    assert "user_id" in body
    assert body["already_existed"] is False

    # Verify org was inserted
    mock_supabase_admin.table.assert_any_call("organizations")
    # Verify users was inserted
    mock_supabase_admin.table.assert_any_call("users")


def test_init_is_idempotent(mock_supabase_admin, mock_supabase_anon):
    """Calling init twice returns already_existed=True on the second call."""
    existing_user = {
        "id": ANON_USER_ID,
        "organization_id": "org-uuid-existing",
        "email": f"anon+{ANON_USER_ID[:8]}@placeholder.capveri.com",
    }
    # Simulate user already exists in DB
    mock_supabase_admin.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=existing_user
    )

    from app.api.v1.onboard import get_onboard_email_service
    from app.database.client import get_supabase, get_supabase_admin

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon
    app.dependency_overrides[get_onboard_email_service] = lambda: MagicMock(
        send_welcome_email=AsyncMock()
    )

    client = TestClient(app)
    response = client.post(
        "/api/v1/onboard/init",
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["already_existed"] is True
    assert body["organization_id"] == "org-uuid-existing"
    assert body["user_id"] == ANON_USER_ID


def test_init_rejects_missing_token():
    """init without Authorization header returns 401."""
    client = TestClient(app)
    response = client.post("/api/v1/onboard/init")
    assert response.status_code == 401


def test_init_rejects_invalid_token(mock_supabase_anon):
    """init with invalid JWT returns 401."""
    mock_supabase_anon.auth.get_user.side_effect = Exception("Invalid JWT")

    from app.database.client import get_supabase

    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon

    client = TestClient(app)
    response = client.post(
        "/api/v1/onboard/init",
        headers={"Authorization": "Bearer bad-token"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 401


def test_init_rejects_auth_response_without_user(mock_supabase_anon):
    """init returns 401 when Supabase returns no user for the token."""
    mock_supabase_anon.auth.get_user.return_value = MagicMock(user=None)

    from app.database.client import get_supabase

    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon

    client = TestClient(app)
    response = client.post(
        "/api/v1/onboard/init",
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token"


class _RaceBootstrapTable:
    def __init__(self, db, table_name):
        self.db = db
        self.table_name = table_name
        self.operation = None

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def insert(self, *_args, **_kwargs):
        self.operation = "insert"
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self.table_name == "users" and self.operation == "select":
            self.db.user_select_count += 1
            if self.db.user_select_count == 1:
                return MagicMock(data=None)
            return MagicMock(data=self.db.existing_user)
        if self.table_name == "organizations" and self.operation == "insert":
            return MagicMock(data=[{"id": self.db.created_org_id}])
        if self.table_name == "users" and self.operation == "insert":
            raise Exception("duplicate key value violates unique constraint")
        if self.table_name == "organizations" and self.operation == "delete":
            self.db.deleted_org_ids.append(self.db.created_org_id)
            return MagicMock(data=[{"id": self.db.created_org_id}])
        raise AssertionError(f"Unexpected table operation: {self.table_name}")


class _RaceBootstrapAdmin:
    def __init__(self):
        self.created_org_id = "new-race-org"
        self.existing_user = {
            "id": ANON_USER_ID,
            "organization_id": "existing-race-org",
            "email": f"anon+{ANON_USER_ID[:8]}@placeholder.capveri.com",
        }
        self.user_select_count = 0
        self.deleted_org_ids = []

    def table(self, table_name):
        return _RaceBootstrapTable(self, table_name)


def test_init_recovers_from_concurrent_duplicate_user_insert(mock_supabase_anon):
    """init cleans up the new org and returns the existing user when a race wins."""
    from app.database.client import get_supabase, get_supabase_admin

    race_admin = _RaceBootstrapAdmin()

    app.dependency_overrides[get_supabase_admin] = lambda: race_admin
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon

    client = TestClient(app)
    response = client.post(
        "/api/v1/onboard/init",
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "organization_id": "existing-race-org",
        "user_id": ANON_USER_ID,
        "already_existed": True,
    }
    assert race_admin.deleted_org_ids == ["new-race-org"]


# ---------------------------------------------------------------------------
# PATCH /api/v1/onboard/upgrade
# ---------------------------------------------------------------------------


def _make_current_user_override(
    user_id: str = ANON_USER_ID,
    org_id: str = "00000000-0000-0000-0000-000000000001",
):
    """Return a User-like mock that satisfies CurrentUser dependency."""
    from datetime import UTC, datetime

    from app.models.enums import UserRole
    from app.models.user import User

    return User(
        id=user_id,  # type: ignore[arg-type]
        organization_id=org_id,  # type: ignore[arg-type]
        email=f"anon+{user_id[:8]}@placeholder.capveri.com",
        role=UserRole.OWNER,
        is_platform_admin=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def test_upgrade_updates_email_and_org_name(mock_supabase_admin, mock_email_service):
    """upgrade endpoint patches users.email and organizations.name."""
    from app.api.v1.onboard import get_onboard_email_service
    from app.auth.dependencies import get_current_user
    from app.database.client import get_supabase, get_supabase_admin

    current_user = _make_current_user_override()
    mock_supabase_anon = MagicMock()
    auth_user = MagicMock(id=str(current_user.id), email="real@example.com")
    mock_supabase_anon.auth.get_user.return_value = MagicMock(user=auth_user)

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon
    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin
    app.dependency_overrides[get_onboard_email_service] = lambda: mock_email_service

    client = TestClient(app)
    response = client.patch(
        "/api/v1/onboard/upgrade",
        json={"email": "real@example.com", "organization_name": "Acme Corp"},
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify users table was updated
    mock_supabase_admin.table.assert_any_call("users")
    mock_supabase_admin.table.assert_any_call("organizations")


def test_upgrade_sends_welcome_email(mock_supabase_admin, mock_email_service):
    """upgrade endpoint triggers welcome email after successful update."""
    from app.api.v1.onboard import get_onboard_email_service
    from app.auth.dependencies import get_current_user
    from app.database.client import get_supabase, get_supabase_admin

    current_user = _make_current_user_override()
    mock_supabase_anon = MagicMock()
    auth_user = MagicMock(id=str(current_user.id), email="real@example.com")
    mock_supabase_anon.auth.get_user.return_value = MagicMock(user=auth_user)

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon
    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin
    app.dependency_overrides[get_onboard_email_service] = lambda: mock_email_service

    client = TestClient(app)
    client.patch(
        "/api/v1/onboard/upgrade",
        json={"email": "real@example.com", "organization_name": "Acme Corp"},
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    mock_email_service.send_welcome_email.assert_awaited_once()
    call_kwargs = mock_email_service.send_welcome_email.call_args
    assert call_kwargs.kwargs.get("to_email") == "real@example.com"


def test_upgrade_requires_auth():
    """upgrade without Authorization header returns 401."""
    client = TestClient(app)
    response = client.patch(
        "/api/v1/onboard/upgrade",
        json={"email": "real@example.com"},
    )
    assert response.status_code == 401


def test_upgrade_returns_404_when_users_row_missing(mock_supabase_admin):
    """upgrade returns 404 if /onboard/init was never called for this user."""
    from app.auth.dependencies import get_current_user
    from app.database.client import get_supabase, get_supabase_admin

    current_user = _make_current_user_override()
    mock_supabase_anon = MagicMock()
    auth_user = MagicMock(id=str(current_user.id), email="real@example.com")
    mock_supabase_anon.auth.get_user.return_value = MagicMock(user=auth_user)

    # Simulate update returning empty data (no rows matched)
    mock_supabase_admin.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon
    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin

    client = TestClient(app)
    response = client.patch(
        "/api/v1/onboard/upgrade",
        json={"email": "real@example.com"},
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "init" in response.json()["detail"].lower()


def test_upgrade_falls_back_org_name_and_swallows_email_failure():
    """upgrade derives org name from email and still succeeds if email send fails."""
    from app.api.v1.onboard import get_onboard_email_service
    from app.auth.dependencies import get_current_user
    from app.database.client import get_supabase, get_supabase_admin

    current_user = _make_current_user_override()
    mock_supabase_anon = MagicMock()
    auth_user = MagicMock(id=str(current_user.id), email="fallback@example.com")
    mock_supabase_anon.auth.get_user.return_value = MagicMock(user=auth_user)
    mock_supabase_admin = MagicMock()

    def mock_table(table_name):
        mock_table_obj = MagicMock()
        if table_name == "users":
            mock_table_obj.update.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"id": str(current_user.id)}])
            )
        elif table_name == "organizations":
            mock_table_obj.update.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table_obj

    mock_supabase_admin.table.side_effect = mock_table

    mock_email_service = MagicMock()
    mock_email_service.send_welcome_email = AsyncMock(
        side_effect=Exception("Resend down")
    )

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon
    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin
    app.dependency_overrides[get_onboard_email_service] = lambda: mock_email_service

    client = TestClient(app)
    response = client.patch(
        "/api/v1/onboard/upgrade",
        json={"email": "fallback@example.com"},
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"success": True}
    mock_email_service.send_welcome_email.assert_awaited_once_with(
        to_email="fallback@example.com",
        organization_name="Fallback",
    )


def test_upgrade_rejects_email_that_does_not_match_supabase_auth_user(
    mock_supabase_admin, mock_email_service
):
    """upgrade cannot bind a local onboarding user to a different email."""
    from app.api.v1.onboard import get_onboard_email_service
    from app.auth.dependencies import get_current_user
    from app.database.client import get_supabase, get_supabase_admin

    current_user = _make_current_user_override()
    mock_supabase_anon = MagicMock()
    auth_user = MagicMock(id=str(current_user.id), email="owner@example.com")
    mock_supabase_anon.auth.get_user.return_value = MagicMock(user=auth_user)

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase_anon
    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin
    app.dependency_overrides[get_onboard_email_service] = lambda: mock_email_service

    client = TestClient(app)
    response = client.patch(
        "/api/v1/onboard/upgrade",
        json={"email": "attacker@example.com"},
        headers={"Authorization": f"Bearer {VALID_BEARER}"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert "authenticated Supabase account" in response.json()["detail"]
    mock_supabase_admin.table.return_value.update.assert_not_called()
    mock_email_service.send_welcome_email.assert_not_awaited()
