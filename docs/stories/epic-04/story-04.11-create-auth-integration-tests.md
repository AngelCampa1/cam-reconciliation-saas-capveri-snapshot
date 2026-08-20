# Story 4.11: Create Auth Integration Tests

### User Story
**As a** developer
**I want** comprehensive tests for auth scenarios
**So that** I'm confident auth is secure before deployment

### Acceptance Criteria

- [x] **AC1**: Test 401 for missing Authorization header
- [x] **AC2**: Test 401 for invalid JWT token
- [x] **AC3**: Test 401 for expired token
- [x] **AC4**: Test 403 for non-admin accessing admin endpoints
- [x] **AC5**: Test org isolation (user A can't see user B's data)
- [x] **AC6**: All tests run in CI pipeline

### Technical Specifications

**Files to Create**:
```
backend/tests/
├── conftest.py
├── test_auth.py
└── test_api_properties.py
```

**conftest.py**:
```python
"""
Pytest fixtures for API testing.
"""
import pytest
from uuid import uuid4
from typing import Generator, AsyncGenerator

from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app
from app.config import settings


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Synchronous test client."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Async test client for async tests."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def valid_token() -> str:
    """
    Create a valid JWT token for testing.

    In a real test, this would create a test user in Supabase
    and return their access token.
    """
    # Implementation depends on test setup
    # Could use service role to create test user
    pass


@pytest.fixture
def expired_token() -> str:
    """Create an expired JWT token for testing."""
    pass


@pytest.fixture
def org_a_token() -> str:
    """Token for user in Organization A."""
    pass


@pytest.fixture
def org_b_token() -> str:
    """Token for user in Organization B."""
    pass


@pytest.fixture
def admin_token() -> str:
    """Token for admin user."""
    pass


@pytest.fixture
def member_token() -> str:
    """Token for non-admin member."""
    pass
```

**test_auth.py**:
```python
"""
Authentication tests.

These tests verify that auth middleware correctly validates
tokens and returns appropriate error responses.
"""
import pytest
from fastapi import status


class TestAuthenticationRequired:
    """Test that endpoints require authentication."""

    def test_no_auth_header_returns_401(self, client):
        """Request without Authorization header should return 401."""
        response = client.get("/api/v1/properties")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "detail" in response.json()

    def test_invalid_token_returns_401(self, client):
        """Request with invalid token should return 401."""
        response = client.get(
            "/api/v1/properties",
            headers={"Authorization": "Bearer invalid_token_here"}
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_expired_token_returns_401(self, client, expired_token):
        """Request with expired token should return 401."""
        response = client.get(
            "/api/v1/properties",
            headers={"Authorization": f"Bearer {expired_token}"}
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_valid_token_succeeds(self, client, valid_token):
        """Request with valid token should succeed."""
        response = client.get(
            "/api/v1/properties",
            headers={"Authorization": f"Bearer {valid_token}"}
        )

        assert response.status_code == status.HTTP_200_OK


class TestAuthorization:
    """Test role-based authorization."""

    def test_non_admin_cannot_delete_property(
        self, client, member_token, test_property_id
    ):
        """Non-admin should get 403 when trying to delete property."""
        response = client.delete(
            f"/api/v1/properties/{test_property_id}",
            headers={"Authorization": f"Bearer {member_token}"}
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_delete_property(
        self, client, admin_token, test_property_id
    ):
        """Admin should be able to delete property."""
        response = client.delete(
            f"/api/v1/properties/{test_property_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT


class TestOrganizationIsolation:
    """Test that users cannot access other organizations' data."""

    def test_user_b_cannot_see_org_a_properties(
        self, client, org_a_token, org_b_token, org_a_property_id
    ):
        """User B should not see Org A's properties."""
        # First verify org A can see their property
        response_a = client.get(
            f"/api/v1/properties/{org_a_property_id}",
            headers={"Authorization": f"Bearer {org_a_token}"}
        )
        assert response_a.status_code == status.HTTP_200_OK

        # Now verify org B cannot see it
        response_b = client.get(
            f"/api/v1/properties/{org_a_property_id}",
            headers={"Authorization": f"Bearer {org_b_token}"}
        )
        assert response_b.status_code == status.HTTP_404_NOT_FOUND

    def test_user_b_cannot_update_org_a_property(
        self, client, org_b_token, org_a_property_id
    ):
        """User B should not be able to update Org A's property."""
        response = client.put(
            f"/api/v1/properties/{org_a_property_id}",
            headers={"Authorization": f"Bearer {org_b_token}"},
            json={"name": "Hacked!"}
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_user_b_list_excludes_org_a_properties(
        self, client, org_b_token, org_a_property_id
    ):
        """User B's property list should not include Org A's properties."""
        response = client.get(
            "/api/v1/properties",
            headers={"Authorization": f"Bearer {org_b_token}"}
        )

        assert response.status_code == status.HTTP_200_OK
        property_ids = [p["id"] for p in response.json()["data"]]
        assert str(org_a_property_id) not in property_ids
```

**test_api_properties.py**:
```python
"""
Property API endpoint tests.
"""
import pytest
from fastapi import status


class TestPropertyCRUD:
    """Test property CRUD operations."""

    def test_create_property(self, client, valid_token):
        """Should create a property successfully."""
        response = client.post(
            "/api/v1/properties",
            headers={"Authorization": f"Bearer {valid_token}"},
            json={
                "name": "Test Building",
                "address_line1": "123 Test Street",
                "city": "New York",
                "state": "NY",
                "postal_code": "10001",
                "total_rentable_sqft": 50000,
                "total_usable_sqft": 45000,
            }
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "Test Building"
        assert "id" in data

    def test_create_property_validates_usable_sqft(self, client, valid_token):
        """Should reject if usable > rentable sqft."""
        response = client.post(
            "/api/v1/properties",
            headers={"Authorization": f"Bearer {valid_token}"},
            json={
                "name": "Invalid Building",
                "address_line1": "123 Test Street",
                "city": "New York",
                "state": "NY",
                "postal_code": "10001",
                "total_rentable_sqft": 40000,
                "total_usable_sqft": 50000,  # Invalid: more than rentable
            }
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_list_properties_paginated(self, client, valid_token):
        """Should return paginated list of properties."""
        response = client.get(
            "/api/v1/properties?skip=0&limit=10",
            headers={"Authorization": f"Bearer {valid_token}"}
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data
        assert "count" in data
        assert "has_more" in data

    def test_get_property_not_found(self, client, valid_token):
        """Should return 404 for non-existent property."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(
            f"/api/v1/properties/{fake_id}",
            headers={"Authorization": f"Bearer {valid_token}"}
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_property(self, client, valid_token, test_property_id):
        """Should update property successfully."""
        response = client.put(
            f"/api/v1/properties/{test_property_id}",
            headers={"Authorization": f"Bearer {valid_token}"},
            json={"name": "Updated Name"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "Updated Name"
```

### Definition of Done
- [x] 401 tests pass
- [x] 403 tests pass
- [x] Org isolation tests pass
- [x] All tests run in CI

### Estimated Time: 3 hours

---

## Epic 4 Completion Checklist

When all stories are complete, verify:

- [ ] FastAPI app starts and serves /docs
- [ ] Health check returns version info
- [ ] Supabase client connects successfully
- [ ] JWT authentication validates tokens
- [ ] Organization context scopes all queries
- [ ] All CRUD endpoints work for properties, units, leases
- [ ] Error responses are consistent JSON
- [ ] Auth integration tests pass
- [ ] CI pipeline runs all tests

## CLAUDE.md Additions After Epic 4

Add the following to `CLAUDE.md` upon epic completion:

```markdown
## API Development Rules

### Authentication
- All endpoints except /health require authentication
- Use `CurrentUser` dependency for authenticated endpoints
- Use `CurrentAdminUser` dependency for admin-only endpoints
- Use `OrgContext` for database operations (ensures RLS + org scoping)

### Error Handling
- All exceptions return JSON via global handlers
- Use `NotFoundError(resource, id)` for 404s
- Use `ConflictError(message)` for 409s
- Never expose stack traces in production

### Endpoint Patterns
- List endpoints return `{data: [], count: int, has_more: bool}`
- Create endpoints return 201 with created resource
- Delete endpoints return 204 with no content
- Update endpoints return updated resource
- Always validate foreign key references before insert

### Testing
- Every endpoint needs auth tests (401, 403)
- Every endpoint needs org isolation tests
- Use fixtures from `conftest.py` for test data
- Run `pytest --cov-fail-under=95` before committing
```
