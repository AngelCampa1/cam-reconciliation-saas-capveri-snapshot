"""Tests for audit requests CRUD operations with platform admin security.

Tests cover:
- Public audit request creation (no auth required)
- Platform admin access to list/get/update audit requests
- Regular org admins cannot access audit requests
- Bounty hunter fields absent from all responses
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.models.enums import UserRole
from app.models.user import User
from tests.conftest import (
    ORG_A_ID,
    ORG_A_USER_ID,
    MockQueryBuilder,
    create_test_app,
    create_test_user,
)


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


class TestPublicAuditRequestCreation:
    """Tests for public audit request creation (no auth required)."""

    @pytest.fixture
    def public_client(self, mock_supabase_client):
        """Create test client without authentication."""
        from app.database.client import get_supabase

        app = create_test_app()
        mock_supabase = mock_supabase_client

        # Configure mock to return empty for rate limit check, then return data for insert
        call_count = [0]

        def mock_table(table_name):
            call_count[0] += 1
            if call_count[0] == 1:
                # Rate limit check - return empty
                return MockQueryBuilder(data=[])
            else:
                # Insert - return the new audit request
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(uuid4()),
                            "name": "Test User",
                            "email": "test@example.com",
                            "company": "Test Company",
                            "building_count": 5,
                            "phone": None,
                            "portfolio_sqft": None,
                            "current_system": None,
                            "message": None,
                            "source": None,
                            "status": "pending",
                            "notes": None,
                            "estimated_recovery": None,
                            "assigned_to": None,
                            "organization_id": None,
                            "contacted_at": None,
                            "scheduled_at": None,
                            "completed_at": None,
                            "converted_at": None,
                            "created_at": datetime.now(UTC).isoformat(),
                            "updated_at": datetime.now(UTC).isoformat(),
                        }
                    ]
                )

        mock_supabase.table.side_effect = mock_table

        app.dependency_overrides[get_supabase] = lambda: mock_supabase

        with TestClient(app) as client:
            client.mock_supabase = mock_supabase
            yield client

        app.dependency_overrides.clear()

    def test_create_audit_request_no_auth_required(self, public_client):
        """Verify audit request creation doesn't require authentication."""
        response = public_client.post(
            "/api/v1/audit-requests",
            json={
                "name": "Test User",
                "email": "test@example.com",
                "company": "Test Company",
                "building_count": 5,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "Test User"
        assert data["status"] == "pending"
        assert "billing_type" not in data
        assert "confirmed_recovery" not in data
        assert "bounty_fee" not in data
        assert "bounty_invoice_id" not in data
        assert "recovery_confirmed_at" not in data
        assert "recovery_invoiced_at" not in data


class TestPlatformAdminAuditRequestAccess:
    """Tests for platform admin access to audit requests."""

    @pytest.fixture
    def platform_admin_client(self, mock_supabase_client):
        """Create test client authenticated as platform admin."""
        from app.auth.dependencies import (
            get_current_platform_admin,
            get_current_user,
        )
        from app.database.client import get_supabase, get_supabase_admin

        app = create_test_app()
        user = create_platform_admin_user()
        mock_supabase = mock_supabase_client

        async def mock_get_user():
            return user

        async def mock_get_platform_admin():
            return user

        app.dependency_overrides[get_current_user] = mock_get_user
        app.dependency_overrides[get_current_platform_admin] = mock_get_platform_admin
        app.dependency_overrides[get_supabase] = lambda: mock_supabase
        app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase

        with TestClient(app) as client:
            client.mock_supabase = mock_supabase
            client.user = user
            yield client

        app.dependency_overrides.clear()

    def test_list_audit_requests_platform_admin_allowed(self, platform_admin_client):
        """Verify platform admin can list all audit requests."""
        # Setup mock data - use side_effect to configure the mock
        test_data = [
            {
                "id": str(uuid4()),
                "name": "Lead 1",
                "email": "lead1@example.com",
                "company": "Company A",
                "building_count": 5,
                "phone": None,
                "portfolio_sqft": None,
                "current_system": "Yardi",
                "message": None,
                "source": None,
                "status": "pending",
                "notes": None,
                "estimated_recovery": None,
                "assigned_to": None,
                "organization_id": None,
                "contacted_at": None,
                "scheduled_at": None,
                "completed_at": None,
                "converted_at": None,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(uuid4()),
                "name": "Lead 2",
                "email": "lead2@example.com",
                "company": "Company B",
                "building_count": 10,
                "phone": "555-1234",
                "portfolio_sqft": 50000,
                "current_system": "MRI",
                "message": None,
                "source": None,
                "status": "contacted",
                "notes": None,
                "estimated_recovery": 25000,
                "assigned_to": None,
                "organization_id": None,
                "contacted_at": datetime.now(UTC).isoformat(),
                "scheduled_at": None,
                "completed_at": None,
                "converted_at": None,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
        ]
        platform_admin_client.mock_supabase.table.side_effect = (
            lambda name: MockQueryBuilder(data=test_data)
        )

        response = platform_admin_client.get("/api/v1/audit-requests")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 2
        assert data[0]["company"] == "Company A"
        assert data[1]["company"] == "Company B"
        assert "billing_type" not in data[0]
        assert "confirmed_recovery" not in data[0]
        assert "bounty_fee" not in data[0]

    def test_get_audit_request_platform_admin_allowed(self, platform_admin_client):
        """Verify platform admin can get a specific audit request."""
        request_id = uuid4()
        test_data = {
            "id": str(request_id),
            "name": "Test Lead",
            "email": "test@example.com",
            "company": "Test Company",
            "building_count": 5,
            "phone": None,
            "portfolio_sqft": None,
            "current_system": None,
            "message": None,
            "source": None,
            "status": "pending",
            "notes": None,
            "estimated_recovery": None,
            "assigned_to": None,
            "organization_id": None,
            "contacted_at": None,
            "scheduled_at": None,
            "completed_at": None,
            "converted_at": None,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
        # Use side_effect and put data in a list (single will extract first element)
        platform_admin_client.mock_supabase.table.side_effect = (
            lambda name: MockQueryBuilder(data=[test_data])
        )

        response = platform_admin_client.get(f"/api/v1/audit-requests/{request_id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Test Lead"
        assert "billing_type" not in data
        assert "confirmed_recovery" not in data
        assert "bounty_fee" not in data

    def test_update_audit_request_platform_admin_allowed(self, platform_admin_client):
        """Verify platform admin can update an audit request."""
        request_id = uuid4()
        test_data = [
            {
                "id": str(request_id),
                "name": "Test Lead",
                "email": "test@example.com",
                "company": "Test Company",
                "building_count": 5,
                "phone": None,
                "portfolio_sqft": None,
                "current_system": None,
                "message": None,
                "source": None,
                "status": "contacted",
                "notes": "Initial contact made",
                "estimated_recovery": None,
                "assigned_to": None,
                "organization_id": None,
                "contacted_at": datetime.now(UTC).isoformat(),
                "scheduled_at": None,
                "completed_at": None,
                "converted_at": None,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]
        platform_admin_client.mock_supabase.table.side_effect = (
            lambda name: MockQueryBuilder(data=test_data)
        )

        response = platform_admin_client.patch(
            f"/api/v1/audit-requests/{request_id}",
            json={
                "status": "contacted",
                "notes": "Initial contact made",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "contacted"
        assert data["notes"] == "Initial contact made"
        assert "billing_type" not in data
        assert "confirmed_recovery" not in data
        assert "bounty_fee" not in data


class TestOrgAdminCannotAccessAuditRequests:
    """Tests that regular org admins cannot access audit requests."""

    @pytest.fixture
    def org_admin_client(self, mock_supabase_client):
        """Create test client authenticated as regular org admin (not platform admin)."""
        from app.auth.dependencies import (
            get_current_admin_user,
            get_current_platform_admin,
            get_current_user,
        )
        from app.database.client import get_supabase, get_supabase_admin

        app = create_test_app()
        # Regular org owner, NOT a platform admin
        user = create_test_user(
            user_id=ORG_A_USER_ID,
            org_id=ORG_A_ID,
            role=UserRole.OWNER,
            is_platform_admin=False,
        )
        mock_supabase = mock_supabase_client

        async def mock_get_user():
            return user

        async def mock_get_admin_user():
            # This user IS an org admin
            return user

        async def mock_get_platform_admin():
            # But NOT a platform admin - should raise 403
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Platform admin privileges required",
            )

        app.dependency_overrides[get_current_user] = mock_get_user
        app.dependency_overrides[get_current_admin_user] = mock_get_admin_user
        app.dependency_overrides[get_current_platform_admin] = mock_get_platform_admin
        app.dependency_overrides[get_supabase] = lambda: mock_supabase
        app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase

        with TestClient(app) as client:
            client.mock_supabase = mock_supabase
            client.user = user
            yield client

        app.dependency_overrides.clear()

    def test_list_audit_requests_org_admin_forbidden(self, org_admin_client):
        """Verify regular org admin cannot list audit requests."""
        response = org_admin_client.get("/api/v1/audit-requests")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Platform admin" in response.json()["detail"]

    def test_get_audit_request_org_admin_forbidden(self, org_admin_client):
        """Verify regular org admin cannot get audit request."""
        request_id = uuid4()
        response = org_admin_client.get(f"/api/v1/audit-requests/{request_id}")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Platform admin" in response.json()["detail"]

    def test_update_audit_request_org_admin_forbidden(self, org_admin_client):
        """Verify regular org admin cannot update audit request."""
        request_id = uuid4()
        response = org_admin_client.patch(
            f"/api/v1/audit-requests/{request_id}",
            json={"status": "contacted"},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Platform admin" in response.json()["detail"]
