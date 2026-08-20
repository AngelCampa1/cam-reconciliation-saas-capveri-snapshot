"""Tests for audit requests API endpoints (Bounty Hunter GTM)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_platform_admin, get_current_user
from app.main import app
from app.models.enums import UserRole
from app.models.user import User


@pytest.fixture(autouse=True)
def bypass_turnstile():
    """Bypass Turnstile verification by default so endpoint tests stay
    deterministic and never make a real network call (the local .env may set
    TURNSTILE_SECRET_KEY). Tests asserting the fail-closed path override this
    with their own patch."""
    with patch(
        "app.api.v1.audit_requests.verify_turnstile",
        new_callable=AsyncMock,
        return_value=True,
    ):
        yield


@pytest.fixture
def test_org_id():
    """Test organization ID."""
    return uuid4()


@pytest.fixture
def test_admin(test_org_id):
    """Test platform admin user."""
    return User(
        id=uuid4(),
        email="admin@example.com",
        organization_id=test_org_id,
        role=UserRole.ADMIN,
        is_platform_admin=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def public_client(mock_supabase):
    """Create test client without authentication (public access)."""
    from app.database.client import get_supabase

    def mock_get_db():
        return mock_supabase

    # Only override the database dependency, not auth
    app.dependency_overrides[get_supabase] = mock_get_db

    client = TestClient(app)
    client.mock_supabase = mock_supabase
    yield client

    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(test_admin, mock_supabase):
    """Create test client with platform admin user dependency overrides."""
    from app.database.client import get_supabase

    async def mock_get_admin():
        return test_admin

    def mock_get_db():
        return mock_supabase

    app.dependency_overrides[get_current_user] = mock_get_admin
    app.dependency_overrides[get_current_platform_admin] = mock_get_admin
    app.dependency_overrides[get_supabase] = mock_get_db

    client = TestClient(app)
    client.mock_supabase = mock_supabase
    yield client

    app.dependency_overrides.clear()


class TestCreateAuditRequest:
    """Tests for POST /api/v1/audit-requests endpoint (public)."""

    def test_create_audit_request_success(self, public_client):
        """Should create audit request successfully."""
        mock_supabase = public_client.mock_supabase

        # Mock rate limit check - no recent requests
        rate_limit_response = MagicMock()
        rate_limit_response.count = 0
        rate_limit_response.data = []

        # Mock insert response
        insert_response = MagicMock()
        insert_response.data = [
            {
                "id": str(uuid4()),
                "name": "John Doe",
                "email": "john@example.com",
                "company": "ACME Properties",
                "building_count": 25,
                "phone": "+1-555-0123",
                "current_system": "Yardi",
                "message": "Interested in a free audit",
                "status": "pending",
                "source": "utm_source=google",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        # Setup mock chain
        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "audit_requests":
                # For rate limit check
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    rate_limit_response
                )
                # For insert
                mock_table.insert.return_value.execute.return_value = insert_response
            return mock_table

        mock_supabase.table.side_effect = table_side_effect

        response = public_client.post(
            "/api/v1/audit-requests",
            json={
                "name": "John Doe",
                "email": "john@example.com",
                "company": "ACME Properties",
                "building_count": 25,
                "phone": "+1-555-0123",
                "current_system": "Yardi",
                "message": "Interested in a free audit",
                "source": "utm_source=google",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "John Doe"
        assert data["email"] == "john@example.com"
        assert data["building_count"] == 25
        assert data["status"] == "pending"

    def test_create_audit_request_canonicalizes_email(self, public_client):
        """Mixed-case request emails use the same canonical rate-limit key."""
        mock_supabase = public_client.mock_supabase

        rate_limit_response = MagicMock()
        rate_limit_response.count = 0
        rate_limit_response.data = []
        insert_response = MagicMock()
        insert_response.data = [
            {
                "id": str(uuid4()),
                "name": "John Doe",
                "email": "john@example.com",
                "company": "ACME Properties",
                "building_count": 25,
                "status": "pending",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
            rate_limit_response
        )
        mock_table.insert.return_value.execute.return_value = insert_response
        mock_supabase.table.return_value = mock_table

        response = public_client.post(
            "/api/v1/audit-requests",
            json={
                "name": "John Doe",
                "email": "John@Example.com",
                "company": "ACME Properties",
                "building_count": 25,
            },
        )

        assert response.status_code == 201
        mock_table.select.return_value.eq.assert_called_once_with(
            "email", "john@example.com"
        )
        insert_payload = mock_table.insert.call_args.args[0]
        assert insert_payload["email"] == "john@example.com"

    def test_create_audit_request_minimal(self, public_client):
        """Should create audit request with minimal required fields."""
        mock_supabase = public_client.mock_supabase

        rate_limit_response = MagicMock()
        rate_limit_response.count = 0
        rate_limit_response.data = []

        insert_response = MagicMock()
        insert_response.data = [
            {
                "id": str(uuid4()),
                "name": "Jane Smith",
                "email": "jane@example.com",
                "company": "Smith LLC",
                "building_count": 5,
                "phone": None,
                "current_system": None,
                "message": None,
                "status": "pending",
                "source": None,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "audit_requests":
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    rate_limit_response
                )
                mock_table.insert.return_value.execute.return_value = insert_response
            return mock_table

        mock_supabase.table.side_effect = table_side_effect

        response = public_client.post(
            "/api/v1/audit-requests",
            json={
                "name": "Jane Smith",
                "email": "jane@example.com",
                "company": "Smith LLC",
                "building_count": 5,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Jane Smith"
        assert data["phone"] is None

    def test_create_audit_request_rate_limit(self, public_client):
        """Should return 429 when rate limit exceeded."""
        mock_supabase = public_client.mock_supabase

        # Mock rate limit check - 3 recent requests
        rate_limit_response = MagicMock()
        rate_limit_response.count = 3
        rate_limit_response.data = [{"id": str(uuid4())} for _ in range(3)]

        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
            rate_limit_response
        )
        mock_supabase.table.return_value = mock_table

        response = public_client.post(
            "/api/v1/audit-requests",
            json={
                "name": "Spam User",
                "email": "spam@example.com",
                "company": "Spam Inc",
                "building_count": 10,
            },
        )

        assert response.status_code == 429
        assert "Rate limit exceeded" in response.json()["detail"]

    def test_create_audit_request_invalid_email(self, public_client):
        """Should return 422 for invalid email."""
        response = public_client.post(
            "/api/v1/audit-requests",
            json={
                "name": "Test User",
                "email": "not-an-email",
                "company": "Test Co",
                "building_count": 5,
            },
        )

        assert response.status_code == 422

    def test_create_audit_request_invalid_building_count(self, public_client):
        """Should return 422 for invalid building count."""
        response = public_client.post(
            "/api/v1/audit-requests",
            json={
                "name": "Test User",
                "email": "test@example.com",
                "company": "Test Co",
                "building_count": 0,  # Must be > 0
            },
        )

        assert response.status_code == 422


class TestListAuditRequests:
    """Tests for GET /api/v1/audit-requests endpoint (platform admin only)."""

    def test_list_audit_requests_as_admin(self, admin_client):
        """Should list all audit requests for admin users."""
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "name": "Lead 1",
                "email": "lead1@example.com",
                "company": "Company 1",
                "building_count": 10,
                "status": "pending",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(uuid4()),
                "name": "Lead 2",
                "email": "lead2@example.com",
                "company": "Company 2",
                "building_count": 25,
                "status": "contacted",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
        ]

        mock_table = MagicMock()
        mock_table.select.return_value.order.return_value.range.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase.table.return_value = mock_table

        response = admin_client.get("/api/v1/audit-requests")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_list_audit_requests_with_status_filter(self, admin_client):
        """Should filter audit requests by status."""
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "name": "Pending Lead",
                "email": "pending@example.com",
                "company": "Pending Co",
                "building_count": 15,
                "status": "pending",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_response

        mock_eq = MagicMock()
        mock_eq.range.return_value = mock_chain

        mock_order = MagicMock()
        mock_order.eq.return_value = mock_eq

        mock_select = MagicMock()
        mock_select.order.return_value = mock_order

        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table

        response = admin_client.get("/api/v1/audit-requests?status=pending")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "pending"


class TestUpdateAuditRequest:
    """Tests for PATCH /api/v1/audit-requests/{id} endpoint (platform admin only)."""

    def test_update_audit_request_status(self, admin_client):
        """Should update audit request status."""
        mock_supabase = admin_client.mock_supabase
        request_id = uuid4()

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(request_id),
                "name": "Updated Lead",
                "email": "lead@example.com",
                "company": "Lead Co",
                "building_count": 20,
                "status": "contacted",
                "notes": "Called on Monday",
                "contacted_at": datetime.now(UTC).isoformat(),
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_table = MagicMock()
        mock_table.update.return_value.eq.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase.table.return_value = mock_table

        response = admin_client.patch(
            f"/api/v1/audit-requests/{request_id}",
            json={
                "status": "contacted",
                "notes": "Called on Monday",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "contacted"
        assert data["notes"] == "Called on Monday"

    def test_update_audit_request_not_found(self, admin_client):
        """Should return 404 when request doesn't exist."""
        mock_supabase = admin_client.mock_supabase
        request_id = uuid4()

        mock_response = MagicMock()
        mock_response.data = []

        mock_table = MagicMock()
        mock_table.update.return_value.eq.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase.table.return_value = mock_table

        response = admin_client.patch(
            f"/api/v1/audit-requests/{request_id}",
            json={"status": "contacted"},
        )

        assert response.status_code == 404


VALID_CREATE_PAYLOAD = {
    "name": "John Doe",
    "email": "john@example.com",
    "company": "ACME Properties",
    "building_count": 25,
}


class TestAuditRequestHoneypotAndTurnstile:
    """Tests for bot-protection on the public create endpoint."""

    def test_honeypot_returns_synthetic_success_no_db_insert(self, public_client):
        """Honeypot filled returns success-shaped response with no DB insert."""
        mock_supabase = public_client.mock_supabase

        response = public_client.post(
            "/api/v1/audit-requests",
            json={**VALID_CREATE_PAYLOAD, "company_website": "http://spam.example"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "John Doe"
        assert data["status"] == "pending"
        # DB insert must NOT have been called
        mock_supabase.table.return_value.insert.assert_not_called()

    def test_turnstile_failure_returns_403_no_db_insert(self, public_client):
        """Turnstile verification failure returns 403 with no DB insert."""
        mock_supabase = public_client.mock_supabase

        with patch(
            "app.api.v1.audit_requests.verify_turnstile",
            new=AsyncMock(return_value=False),
        ):
            response = public_client.post(
                "/api/v1/audit-requests",
                json=VALID_CREATE_PAYLOAD,
            )

        assert response.status_code == 403
        mock_supabase.table.return_value.insert.assert_not_called()
