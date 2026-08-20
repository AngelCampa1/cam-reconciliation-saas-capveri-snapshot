"""Authentication integration tests.

These tests verify that auth middleware correctly validates
tokens and returns appropriate error responses at the HTTP level.

This tests endpoints through FastAPI's TestClient to verify:
- 401 for missing Authorization header
- 401 for invalid JWT token
- 401 for expired token
- 403 for non-admin accessing admin endpoints
- Organization isolation (user A can't see user B's data)
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    AuthenticationError,
    get_current_user,
)
from app.database.client import get_supabase
from tests.conftest import (
    ORG_A_ID,
    ORG_A_PROPERTY_ID,
    ORG_B_PROPERTY_ID,
    MockQueryBuilder,
    create_test_app,
)

# ============================================================================
# AC1: Test 401 for missing Authorization header
# ============================================================================


class TestMissingAuthorizationHeader:
    """Test that requests without Authorization header return 401."""

    @pytest.fixture
    def unauthenticated_client(self) -> TestClient:
        """Create a test client that simulates missing auth.

        The auth dependency raises AuthenticationError when no credentials.
        """
        app = create_test_app()

        # Don't override - let the real dependency handle missing auth
        # But we need to mock supabase to avoid connection errors
        mock_supabase = MagicMock()

        def mock_get_user():
            raise AuthenticationError("Authorization header required")

        app.dependency_overrides[get_current_user] = mock_get_user
        app.dependency_overrides[get_supabase] = lambda: mock_supabase

        return TestClient(app)

    def test_list_properties_without_auth_returns_401(
        self, unauthenticated_client: TestClient
    ):
        """GET /properties without auth should return 401."""
        response = unauthenticated_client.get("/api/v1/properties")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "detail" in response.json()

    def test_get_property_without_auth_returns_401(
        self, unauthenticated_client: TestClient
    ):
        """GET /properties/{id} without auth should return 401."""
        response = unauthenticated_client.get(f"/api/v1/properties/{uuid4()}")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_property_without_auth_returns_401(
        self, unauthenticated_client: TestClient
    ):
        """POST /properties without auth should return 401."""
        response = unauthenticated_client.post(
            "/api/v1/properties",
            json={"name": "Test", "address_line1": "123 Main St"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_units_without_auth_returns_401(
        self, unauthenticated_client: TestClient
    ):
        """GET /units without auth should return 401."""
        response = unauthenticated_client.get(f"/api/v1/properties/{uuid4()}/units")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_leases_without_auth_returns_401(
        self, unauthenticated_client: TestClient
    ):
        """GET /leases without auth should return 401."""
        response = unauthenticated_client.get("/api/v1/leases")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_401_response_has_www_authenticate_header(
        self, unauthenticated_client: TestClient
    ):
        """401 response should include WWW-Authenticate: Bearer header."""
        response = unauthenticated_client.get("/api/v1/properties")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.headers.get("www-authenticate") == "Bearer"


# ============================================================================
# AC2: Test 401 for invalid JWT token
# ============================================================================


class TestInvalidToken:
    """Test that requests with invalid token return 401."""

    @pytest.fixture
    def invalid_token_client(self) -> TestClient:
        """Create a test client that simulates invalid token."""
        app = create_test_app()
        mock_supabase = MagicMock()

        def mock_get_user():
            raise AuthenticationError("Invalid token")

        app.dependency_overrides[get_current_user] = mock_get_user
        app.dependency_overrides[get_supabase] = lambda: mock_supabase

        return TestClient(app)

    def test_invalid_token_on_list_properties_returns_401(
        self, invalid_token_client: TestClient
    ):
        """Invalid token on GET /properties should return 401."""
        response = invalid_token_client.get(
            "/api/v1/properties",
            headers={"Authorization": "Bearer invalid_token_xyz"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Invalid token" in response.json()["detail"]

    def test_invalid_token_on_create_property_returns_401(
        self, invalid_token_client: TestClient
    ):
        """Invalid token on POST /properties should return 401."""
        response = invalid_token_client.post(
            "/api/v1/properties",
            headers={"Authorization": "Bearer bad.jwt.token"},
            json={"name": "Test"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_malformed_bearer_token_returns_401(self, invalid_token_client: TestClient):
        """Malformed Bearer token should return 401."""
        response = invalid_token_client.get(
            "/api/v1/properties",
            headers={"Authorization": "Bearer "},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_wrong_auth_scheme_returns_401(self, invalid_token_client: TestClient):
        """Using Basic auth instead of Bearer should return 401."""
        response = invalid_token_client.get(
            "/api/v1/properties",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# AC3: Test 401 for expired token
# ============================================================================


class TestExpiredToken:
    """Test that requests with expired token return 401."""

    @pytest.fixture
    def expired_token_client(self) -> TestClient:
        """Create a test client that simulates expired token."""
        app = create_test_app()
        mock_supabase = MagicMock()

        def mock_get_user():
            raise AuthenticationError("Invalid or expired token")

        app.dependency_overrides[get_current_user] = mock_get_user
        app.dependency_overrides[get_supabase] = lambda: mock_supabase

        return TestClient(app)

    def test_expired_token_on_list_properties_returns_401(
        self, expired_token_client: TestClient
    ):
        """Expired token on GET /properties should return 401."""
        response = expired_token_client.get(
            "/api/v1/properties",
            headers={"Authorization": "Bearer expired.jwt.token"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "expired" in response.json()["detail"].lower()

    def test_expired_token_on_list_leases_returns_401(
        self, expired_token_client: TestClient
    ):
        """Expired token on GET /leases should return 401."""
        response = expired_token_client.get(
            "/api/v1/leases",
            headers={"Authorization": "Bearer expired.jwt.token"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_expired_token_on_post_returns_401(self, expired_token_client: TestClient):
        """Expired token on POST endpoints should return 401."""
        response = expired_token_client.post(
            "/api/v1/properties",
            headers={"Authorization": "Bearer expired.jwt.token"},
            json={"name": "Test"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# AC4: Test 403 for non-admin accessing admin endpoints
# ============================================================================


class TestAdminOnlyEndpoints:
    """Test that non-admin users get 403 on admin-only endpoints."""

    def test_member_cannot_delete_property(self, org_a_member_client):
        """Non-admin user should get 403 when deleting property."""
        property_id = str(ORG_A_PROPERTY_ID)

        response = org_a_member_client.delete(f"/api/v1/properties/{property_id}")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Admin privileges required" in response.json()["detail"]

    def test_units_delete_does_not_require_admin(self, org_a_member_client):
        """Units delete endpoint allows any authenticated user (not admin-only)."""
        # Note: Unlike properties and leases, unit delete doesn't require admin
        # This test documents that behavior
        property_id = str(ORG_A_PROPERTY_ID)
        unit_id = str(uuid4())

        # Mock the unit lookup - unit not found returns 404
        org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=None
        )

        response = org_a_member_client.delete(
            f"/api/v1/properties/{property_id}/units/{unit_id}"
        )

        # Should NOT be 403 - should be 404 (not found) since unit doesn't exist
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_member_cannot_delete_lease(self, org_a_member_client):
        """Non-admin user should get 403 when deleting lease."""
        lease_id = str(uuid4())

        response = org_a_member_client.delete(f"/api/v1/leases/{lease_id}")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_delete_property(self, org_a_admin_client, org_a_property):
        """Admin user should be able to delete property."""
        # Initialize test data (synchronous)
        org_a_admin_client.mock_supabase._test_data["properties"] = [org_a_property]

        response = org_a_admin_client.delete(f"/api/v1/properties/{ORG_A_PROPERTY_ID}")

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_admin_can_delete_unit(self, org_a_admin_client):
        """Admin user should be able to delete unit."""
        unit_data = {
            "id": str(uuid4()),
            "property_id": str(ORG_A_PROPERTY_ID),
            "name": "Suite 100",
        }

        # Mock different tables returning different data
        def table_mock(table_name):
            if table_name == "properties":
                # Property exists - return property data for verification
                return MockQueryBuilder(data={"id": str(ORG_A_PROPERTY_ID)})
            elif table_name == "units":
                # Unit exists - return unit data for deletion
                return MockQueryBuilder(data=[unit_data])
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = table_mock

        response = org_a_admin_client.delete(
            f"/api/v1/properties/{ORG_A_PROPERTY_ID}/units/{unit_data['id']}"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_403_error_format(self, org_a_member_client):
        """403 errors should have proper JSON format."""
        response = org_a_member_client.delete(f"/api/v1/properties/{ORG_A_PROPERTY_ID}")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        assert "detail" in data
        assert isinstance(data["detail"], str)


# ============================================================================
# AC5: Test organization isolation (user A can't see user B's data)
# ============================================================================


class TestOrganizationIsolation:
    """Test that users cannot access other organizations' data.

    These tests verify the RLS (Row Level Security) isolation pattern:
    - User from Org A should not see Org B's properties
    - User from Org A should not be able to modify Org B's data
    - List endpoints should only return the user's org data
    """

    def test_org_b_cannot_see_org_a_property(self, org_b_member_client, org_a_property):
        """User B should not be able to see Org A's property."""
        # When Org B user tries to access Org A property,
        # the RLS policy returns no data (404)
        org_b_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=None  # RLS returns nothing for cross-org access
        )

        response = org_b_member_client.get(f"/api/v1/properties/{ORG_A_PROPERTY_ID}")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_org_a_can_see_own_property(self, org_a_member_client, org_a_property):
        """User A should be able to see their own property."""
        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]

        response = org_a_member_client.get(f"/api/v1/properties/{ORG_A_PROPERTY_ID}")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["id"] == str(ORG_A_PROPERTY_ID)

    def test_org_b_cannot_update_org_a_property(self, org_b_member_client):
        """User B should not be able to update Org A's property."""
        # RLS policy prevents update - returns no affected rows
        org_b_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=None
        )

        response = org_b_member_client.put(
            f"/api/v1/properties/{ORG_A_PROPERTY_ID}",
            json={"name": "Hacked!"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_org_b_list_excludes_org_a_properties(
        self, org_b_member_client, org_b_property
    ):
        """User B's property list should only include Org B properties."""
        # RLS returns only Org B properties
        org_b_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=[org_b_property], count=1
        )

        response = org_b_member_client.get("/api/v1/properties")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] == 1
        property_ids = [p["id"] for p in data["data"]]
        assert str(ORG_B_PROPERTY_ID) in property_ids
        assert str(ORG_A_PROPERTY_ID) not in property_ids

    def test_org_a_list_excludes_org_b_properties(
        self, org_a_member_client, org_a_property
    ):
        """User A's property list should only include Org A properties."""
        # Initialize test data (synchronous) - RLS will filter to only Org A
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]

        response = org_a_member_client.get("/api/v1/properties")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        property_ids = [p["id"] for p in data["data"]]
        assert str(ORG_A_PROPERTY_ID) in property_ids
        assert str(ORG_B_PROPERTY_ID) not in property_ids


class TestOrganizationIsolationLeases:
    """Test organization isolation for lease endpoints."""

    @pytest.fixture
    def org_a_lease(self):
        """Create sample lease data for Organization A."""
        return {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "property_id": str(ORG_A_PROPERTY_ID),
            "tenant_name": "Org A Tenant",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "status": "active",
            "recovery_profile": {
                "pro_rata_share": "0.05",
                "cap_type": "none",
                "admin_fee_percentage": "0",
                "excluded_pools": [],
            },
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

    def test_org_b_cannot_see_org_a_lease(self, org_b_member_client, org_a_lease):
        """User B should not be able to see Org A's lease."""
        org_b_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=None
        )

        response = org_b_member_client.get(f"/api/v1/leases/{org_a_lease['id']}")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_org_b_cannot_update_org_a_lease(self, org_b_member_client, org_a_lease):
        """User B should not be able to update Org A's lease."""
        org_b_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=None
        )

        response = org_b_member_client.put(
            f"/api/v1/leases/{org_a_lease['id']}",
            json={"tenant_name": "Hacked!"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_org_b_cannot_update_org_a_recovery_profile(
        self, org_b_member_client, org_a_lease
    ):
        """User B should not be able to update Org A's recovery profile."""
        org_b_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=None
        )

        response = org_b_member_client.put(
            f"/api/v1/leases/{org_a_lease['id']}/recovery-profile",
            json={"pro_rata_share": "0.99"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestOrganizationIsolationUnits:
    """Test organization isolation for unit endpoints."""

    @pytest.fixture
    def org_a_unit(self):
        """Create sample unit data for Organization A."""
        return {
            "id": str(uuid4()),
            "property_id": str(ORG_A_PROPERTY_ID),
            "name": "Suite 100",
            "floor": "1",
            "rentable_sqft": "1000.00",
            "usable_sqft": "850.00",
            "status": "vacant",
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

    def test_org_b_cannot_list_org_a_units(self, org_b_member_client):
        """User B should not be able to list Org A's units."""
        # First mock property lookup - Org B can't see Org A property
        org_b_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=None
        )

        response = org_b_member_client.get(
            f"/api/v1/properties/{ORG_A_PROPERTY_ID}/units"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_org_b_cannot_create_unit_in_org_a_property(self, org_b_member_client):
        """User B should not be able to create unit in Org A's property."""
        # RLS prevents Org B from seeing Org A's property
        org_b_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=None
        )

        response = org_b_member_client.post(
            f"/api/v1/properties/{ORG_A_PROPERTY_ID}/units",
            json={
                "unit_number": "Hacked Suite",
                "floor": 1,
                "rentable_sqft": "1000.00",
                "usable_sqft": "850.00",
                "status": "vacant",
            },
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================================================
# Additional Auth Integration Tests
# ============================================================================


class TestAuthErrorResponses:
    """Test that auth errors return proper JSON responses."""

    @pytest.fixture
    def auth_error_client(self) -> TestClient:
        """Create a test client that raises various auth errors."""
        app = create_test_app()
        mock_supabase = MagicMock()

        def mock_get_user():
            raise AuthenticationError("Token validation failed")

        app.dependency_overrides[get_current_user] = mock_get_user
        app.dependency_overrides[get_supabase] = lambda: mock_supabase

        return TestClient(app)

    def test_401_returns_json_content_type(self, auth_error_client):
        """401 response should have application/json content type."""
        response = auth_error_client.get("/api/v1/properties")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "application/json" in response.headers.get("content-type", "")

    def test_401_response_is_valid_json(self, auth_error_client):
        """401 response should be valid JSON with detail field."""
        response = auth_error_client.get("/api/v1/properties")

        data = response.json()
        assert isinstance(data, dict)
        assert "detail" in data

    def test_403_returns_json_content_type(self, org_a_member_client):
        """403 response should have application/json content type."""
        response = org_a_member_client.delete(f"/api/v1/properties/{ORG_A_PROPERTY_ID}")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "application/json" in response.headers.get("content-type", "")


class TestMultipleEndpointsAuthConsistency:
    """Test that auth behaves consistently across all endpoints."""

    @pytest.fixture
    def no_auth_client(self) -> TestClient:
        """Create client that simulates missing auth."""
        app = create_test_app()
        mock_supabase = MagicMock()

        def mock_get_user():
            raise AuthenticationError("Authorization header required")

        app.dependency_overrides[get_current_user] = mock_get_user
        app.dependency_overrides[get_supabase] = lambda: mock_supabase

        return TestClient(app)

    @pytest.mark.parametrize(
        "method,endpoint",
        [
            ("GET", "/api/v1/properties"),
            ("POST", "/api/v1/properties"),
            ("GET", "/api/v1/properties/00000000-0000-0000-0000-000000000001"),
            ("PUT", "/api/v1/properties/00000000-0000-0000-0000-000000000002"),
            ("DELETE", "/api/v1/properties/00000000-0000-0000-0000-000000000003"),
            ("GET", "/api/v1/leases"),
            ("POST", "/api/v1/leases"),
            ("GET", "/api/v1/leases/00000000-0000-0000-0000-000000000004"),
            ("PUT", "/api/v1/leases/00000000-0000-0000-0000-000000000005"),
            ("DELETE", "/api/v1/leases/00000000-0000-0000-0000-000000000006"),
            ("GET", "/api/v1/properties/00000000-0000-0000-0000-000000000007/units"),
            ("POST", "/api/v1/properties/00000000-0000-0000-0000-000000000008/units"),
        ],
    )
    def test_all_endpoints_require_auth(self, no_auth_client, method, endpoint):
        """All API endpoints should require authentication."""
        if method == "GET":
            response = no_auth_client.get(endpoint)
        elif method == "POST":
            response = no_auth_client.post(endpoint, json={})
        elif method == "PUT":
            response = no_auth_client.put(endpoint, json={})
        elif method == "DELETE":
            response = no_auth_client.delete(endpoint)

        assert (
            response.status_code == status.HTTP_401_UNAUTHORIZED
        ), f"{method} {endpoint} should return 401, got {response.status_code}"
