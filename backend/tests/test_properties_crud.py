"""Tests for Property CRUD endpoints.

Tests cover all CRUD operations for properties including:
- List properties with pagination
- Get single property
- Create property
- Update property
- Delete property (admin only)
- Authentication requirements
- Validation errors
- 404 handling
"""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1.properties import router
from app.auth.dependencies import (
    OrganizationContext,
    get_current_admin_user,
    get_org_scoped_context,
)
from app.exceptions import (
    register_custom_exception_handlers,
    register_exception_handlers,
)
from app.models.user import User

# Test data fixtures
SAMPLE_ORG_ID = uuid4()
SAMPLE_USER_ID = uuid4()
SAMPLE_PROPERTY_ID = uuid4()


def create_test_user(
    user_id: UUID = SAMPLE_USER_ID,
    org_id: UUID = SAMPLE_ORG_ID,
    role: str = "member",
) -> User:
    """Create a test user."""
    return User(
        id=user_id,
        organization_id=org_id,
        email="test@example.com",
        full_name="Test User",
        role=role,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def create_sample_property(
    property_id: UUID = SAMPLE_PROPERTY_ID,
    org_id: UUID = SAMPLE_ORG_ID,
) -> dict:
    """Create a sample property data dict."""
    return {
        "id": str(property_id),
        "organization_id": str(org_id),
        "name": "Test Property",
        "address_line1": "123 Main St",
        "address_line2": "Suite 100",
        "city": "San Francisco",
        "state": "CA",
        "postal_code": "94102",
        "total_rentable_sqft": "10000.00",
        "total_usable_sqft": "8500.00",
        "common_area_sqft": "1500.00",
        "target_occupancy": "0.95",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


class MockSupabaseResponse:
    """Mock Supabase response object."""

    def __init__(self, data=None, count=None):
        # Keep data as-is, including None for not found scenarios
        self.data = data
        self.count = count


class MockQueryBuilder:
    """Mock Supabase query builder for chaining."""

    def __init__(self, data=None, count=None):
        # Store data as-is, don't convert None to []
        self._original_data = data
        self._data = data if data is not None else []
        self._count = count
        self._is_single = False

    def select(self, *args, **kwargs):
        return self

    def insert(self, data):
        # For insert, we need to return the full property data with generated fields
        if isinstance(data, dict):
            # Add generated fields for the response
            result = dict(data)
            if "id" not in result:
                result["id"] = str(uuid4())
            if "created_at" not in result:
                result["created_at"] = datetime.now(UTC).isoformat()
            if "updated_at" not in result:
                result["updated_at"] = datetime.now(UTC).isoformat()
            self._data = [result]
            self._original_data = [result]
        else:
            self._data = data
            self._original_data = data
        return self

    def update(self, data):
        return self

    def delete(self):
        return self

    def eq(self, field, value):
        return self

    def in_(self, field, values):
        return self

    def range(self, start, end):
        return self

    def order(self, field, desc=False):
        return self

    def maybe_single(self):
        self._is_single = True
        return self

    def single(self):
        self._is_single = True
        return self

    def execute(self):
        # For single queries (maybe_single), return None if original data was None
        if self._is_single and self._original_data is None:
            return MockSupabaseResponse(None, self._count)
        # For list queries, ensure we return a list (not None)
        data = self._data if self._data is not None else []
        return MockSupabaseResponse(data, self._count)


@pytest.fixture
def app():
    """Create test FastAPI app with properties router."""
    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    app.include_router(router, prefix="/api/v1/properties", tags=["Properties"])
    return app


@pytest.fixture
def mock_supabase():
    """Create mock Supabase client."""
    client = MagicMock()
    return client


@pytest.fixture
def authenticated_client(app, mock_supabase):
    """Create test client with authenticated user (member role)."""
    from unittest.mock import AsyncMock, patch

    test_user = create_test_user(role="member")

    def mock_org_context():
        ctx = OrganizationContext(
            client=mock_supabase,
            organization_id=SAMPLE_ORG_ID,
            user=test_user,
        )
        return ctx

    app.dependency_overrides[get_org_scoped_context] = mock_org_context

    # Mock building sync to avoid subscription queries in property tests
    patcher = patch(
        "app.services.billing.building_sync.BuildingSyncService.sync_building_count",
        new_callable=AsyncMock,
    )
    patcher.start()

    client = TestClient(app)

    yield client

    patcher.stop()


@pytest.fixture
def admin_client(app, mock_supabase):
    """Create test client with admin user."""
    from unittest.mock import AsyncMock, patch

    admin_user = create_test_user(role="admin")

    def mock_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=SAMPLE_ORG_ID,
            user=admin_user,
        )

    def mock_admin_user():
        return admin_user

    app.dependency_overrides[get_org_scoped_context] = mock_org_context
    app.dependency_overrides[get_current_admin_user] = mock_admin_user

    # Mock building sync to avoid subscription queries in property tests
    patcher = patch(
        "app.services.billing.building_sync.BuildingSyncService.sync_building_count",
        new_callable=AsyncMock,
    )
    patcher.start()

    client = TestClient(app)

    yield client

    patcher.stop()


class TestListProperties:
    """Tests for GET /api/v1/properties endpoint."""

    def test_list_properties_returns_paginated_data(
        self, authenticated_client, mock_supabase
    ):
        """Should return paginated list of properties."""
        properties = [create_sample_property(), create_sample_property(uuid4())]
        mock_supabase.table.return_value = MockQueryBuilder(properties, count=2)

        response = authenticated_client.get("/api/v1/properties")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data
        assert "count" in data
        assert "has_more" in data
        assert data["count"] == 2
        assert data["has_more"] is False

    def test_list_properties_with_pagination(self, authenticated_client, mock_supabase):
        """Should respect skip and limit parameters."""
        properties = [create_sample_property()]
        mock_supabase.table.return_value = MockQueryBuilder(properties, count=50)

        response = authenticated_client.get("/api/v1/properties?skip=0&limit=10")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] == 50
        assert data["has_more"] is True

    def test_list_properties_empty_org(self, authenticated_client, mock_supabase):
        """Should return empty list for org with no properties."""
        mock_supabase.table.return_value = MockQueryBuilder([], count=0)

        response = authenticated_client.get("/api/v1/properties")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["data"] == []
        assert data["count"] == 0
        assert data["has_more"] is False

    def test_list_properties_limit_validation(
        self, authenticated_client, mock_supabase
    ):
        """Should reject limit > 100."""
        response = authenticated_client.get("/api/v1/properties?limit=200")

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_list_properties_skip_validation(self, authenticated_client, mock_supabase):
        """Should reject negative skip."""
        response = authenticated_client.get("/api/v1/properties?skip=-1")

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestGetProperty:
    """Tests for GET /api/v1/properties/{property_id} endpoint."""

    def test_get_property_success(self, authenticated_client, mock_supabase):
        """Should return property by ID."""
        property_data = create_sample_property()
        mock_supabase.table.return_value = MockQueryBuilder(property_data)

        response = authenticated_client.get(f"/api/v1/properties/{SAMPLE_PROPERTY_ID}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(SAMPLE_PROPERTY_ID)
        assert data["name"] == "Test Property"

    def test_get_property_not_found(self, authenticated_client, mock_supabase):
        """Should return 404 for non-existent property."""
        mock_supabase.table.return_value = MockQueryBuilder(None)

        missing_id = uuid4()
        response = authenticated_client.get(f"/api/v1/properties/{missing_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Property" in data["message"]

    def test_get_property_invalid_uuid(self, authenticated_client):
        """Should return 422 for invalid UUID."""
        response = authenticated_client.get("/api/v1/properties/not-a-uuid")

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestCreateProperty:
    """Tests for POST /api/v1/properties endpoint."""

    def test_create_property_success(self, authenticated_client, mock_supabase):
        """Should create property and return 201."""
        created_property = create_sample_property()
        mock_supabase.table.return_value = MockQueryBuilder([created_property])

        payload = {
            "name": "New Property",
            "address_line1": "456 Oak Ave",
            "city": "Los Angeles",
            "state": "CA",
            "postal_code": "90001",
            "total_rentable_sqft": 15000.00,
            "total_usable_sqft": 12000.00,
            "common_area_sqft": 3000.00,
        }

        response = authenticated_client.post(
            "/api/v1/properties",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "id" in data

    def test_create_property_persists_tax_protest_fields(
        self, authenticated_client, mock_supabase
    ):
        """F-009: tax_protest fields sent on create must reach the DB insert.

        Regression guard: previously PropertyCreate did not declare these
        fields, so they were silently dropped before the insert.
        """
        # The mock insert echoes the inserted payload back as the created row,
        # so the response body reflects exactly what was sent to the DB.
        builder = MockQueryBuilder()
        mock_supabase.table.return_value = builder

        payload = {
            "name": "Tax Protest Property",
            "address_line1": "456 Oak Ave",
            "city": "Houston",
            "state": "TX",
            "postal_code": "77002",
            "total_rentable_sqft": 15000.00,
            "total_usable_sqft": 12000.00,
            "common_area_sqft": 3000.00,
            "tax_protest_county": "Harris",
            "tax_protest_deadline_override": "2026-04-15",
        }

        response = authenticated_client.post("/api/v1/properties", json=payload)

        assert response.status_code == status.HTTP_201_CREATED
        # Persisted to the insert payload (regression guard for the drop bug)...
        inserted = builder._original_data[0]
        assert inserted["tax_protest_county"] == "Harris"
        assert inserted["tax_protest_deadline_override"] == "2026-04-15"
        # ...and surfaced on the typed create response.
        data = response.json()
        assert data["tax_protest_county"] == "Harris"
        assert data["tax_protest_deadline_override"] == "2026-04-15"

    def test_create_property_minimal_fields(self, authenticated_client, mock_supabase):
        """Should create property with minimal required fields."""
        created_property = create_sample_property()
        mock_supabase.table.return_value = MockQueryBuilder([created_property])

        payload = {
            "name": "Minimal Property",
            "address_line1": "789 Elm St",
            "city": "Seattle",
            "state": "WA",
            "postal_code": "98101",
            "total_rentable_sqft": 5000,
            "total_usable_sqft": 4000,
            "common_area_sqft": 1000,
        }

        response = authenticated_client.post(
            "/api/v1/properties",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_create_property_missing_required_field(
        self, authenticated_client, mock_supabase
    ):
        """Should return 422 for missing required field."""
        payload = {
            "name": "Missing Fields",
            # Missing address_line1, city, state, postal_code, sqft fields
        }

        response = authenticated_client.post(
            "/api/v1/properties",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_property_invalid_state_code(
        self, authenticated_client, mock_supabase
    ):
        """Should return 422 for invalid state code."""
        payload = {
            "name": "Invalid State",
            "address_line1": "123 Main St",
            "city": "Somewhere",
            "state": "CALIFORNIA",  # Too long
            "postal_code": "12345",
            "total_rentable_sqft": "5000",
            "total_usable_sqft": "4000",
            "common_area_sqft": "1000",
        }

        response = authenticated_client.post(
            "/api/v1/properties",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_property_usable_exceeds_rentable(
        self, authenticated_client, mock_supabase
    ):
        """Should return 422 when usable sqft > rentable sqft."""
        payload = {
            "name": "Invalid Areas",
            "address_line1": "123 Main St",
            "city": "Somewhere",
            "state": "CA",
            "postal_code": "12345",
            "total_rentable_sqft": "5000",
            "total_usable_sqft": "6000",  # Greater than rentable
            "common_area_sqft": "1000",
        }

        response = authenticated_client.post(
            "/api/v1/properties",
            json=payload,
        )

        # Model validation raises ValueError which is handled as 422 or 400
        # The exact code depends on whether it's caught during Pydantic validation
        assert response.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    def test_create_property_negative_sqft(self, authenticated_client, mock_supabase):
        """Should return 422 for negative square footage."""
        payload = {
            "name": "Negative Area",
            "address_line1": "123 Main St",
            "city": "Somewhere",
            "state": "CA",
            "postal_code": "12345",
            "total_rentable_sqft": "-5000",  # Negative
            "total_usable_sqft": "4000",
            "common_area_sqft": "1000",
        }

        response = authenticated_client.post(
            "/api/v1/properties",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_property_database_failure(
        self, authenticated_client, mock_supabase
    ):
        """Should return 500 when database insert fails (line 125)."""

        # Create a mock query builder that returns None for insert
        def table_side_effect(table_name):
            mock_table = MockQueryBuilder()
            # Override execute to return None for data
            original_execute = mock_table.execute

            def mock_execute_with_none():
                result = original_execute()
                result.data = None  # Simulate database failure
                return result

            mock_table.execute = mock_execute_with_none
            return mock_table

        mock_supabase.table.side_effect = table_side_effect

        payload = {
            "name": "Test Property",
            "address_line1": "123 Main St",
            "city": "Somewhere",
            "state": "CA",
            "postal_code": "12345",
            "total_rentable_sqft": "5000",
            "total_usable_sqft": "4000",
            "common_area_sqft": "1000",
        }

        response = authenticated_client.post("/api/v1/properties", json=payload)

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Failed to create property" in response.json()["detail"]

    @pytest.mark.real_entitlements
    @patch("app.services.billing.entitlements.has_full_access", return_value=False)
    def test_create_property_blocked_without_full_access(
        self, _mock_has_full_access, authenticated_client, mock_supabase
    ):
        """Read-only lock: an expired/paused trial cannot create a property.

        The legacy free-audit gate is retired; ``require_full_access`` now blocks
        the create path with a 402 ``subscription_required`` when the org lacks
        full access.
        """
        payload = {
            "name": "Blocked Property",
            "address_line1": "123 Main St",
            "city": "Somewhere",
            "state": "CA",
            "postal_code": "12345",
            "total_rentable_sqft": 5000,
            "total_usable_sqft": 4000,
            "common_area_sqft": 1000,
        }

        response = authenticated_client.post("/api/v1/properties", json=payload)
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]


class TestUpdateProperty:
    """Tests for PUT /api/v1/properties/{property_id} endpoint."""

    def test_update_property_success(self, authenticated_client, mock_supabase):
        """Should update property fields."""
        updated_property = create_sample_property()
        updated_property["name"] = "Updated Name"
        mock_supabase.table.return_value = MockQueryBuilder([updated_property])

        payload = {"name": "Updated Name"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Updated Name"

    def test_update_property_partial(self, authenticated_client, mock_supabase):
        """Should update only provided fields."""
        updated_property = create_sample_property()
        mock_supabase.table.return_value = MockQueryBuilder([updated_property])

        payload = {"city": "New York"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_property_not_found(self, authenticated_client, mock_supabase):
        """Should return 404 for non-existent property."""
        mock_supabase.table.return_value = MockQueryBuilder([])

        missing_id = uuid4()
        payload = {"name": "Updated Name"}

        response = authenticated_client.put(
            f"/api/v1/properties/{missing_id}",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_property_empty_payload(self, authenticated_client, mock_supabase):
        """Should return 400 for empty update payload."""
        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}",
            json={},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "No fields to update" in data["detail"]

    def test_update_property_invalid_uuid(self, authenticated_client):
        """Should return 422 for invalid UUID."""
        response = authenticated_client.put(
            "/api/v1/properties/not-a-uuid",
            json={"name": "Test"},
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestDeleteProperty:
    """Tests for DELETE /api/v1/properties/{property_id} endpoint."""

    def test_delete_property_admin_success(self, admin_client, mock_supabase):
        """Should delete property for admin user."""
        deleted_property = create_sample_property()
        mock_supabase.table.return_value = MockQueryBuilder([deleted_property])

        response = admin_client.delete(f"/api/v1/properties/{SAMPLE_PROPERTY_ID}")

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_property_not_found(self, admin_client, mock_supabase):
        """Should return 404 for non-existent property."""
        mock_supabase.table.return_value = MockQueryBuilder([])

        missing_id = uuid4()
        response = admin_client.delete(f"/api/v1/properties/{missing_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_property_non_admin_forbidden(self, app, mock_supabase):
        """Should return 403 for non-admin users."""
        from app.auth.dependencies import get_current_user

        # Create a member user (not admin)
        member_user = create_test_user(role="member")

        def mock_org_context():
            return OrganizationContext(
                client=mock_supabase,
                organization_id=SAMPLE_ORG_ID,
                user=member_user,
            )

        def mock_current_user():
            return member_user

        # Override dependencies to return member user
        app.dependency_overrides[get_org_scoped_context] = mock_org_context
        app.dependency_overrides[get_current_user] = mock_current_user
        # Remove admin override if it exists to let it fail with 403
        if get_current_admin_user in app.dependency_overrides:
            del app.dependency_overrides[get_current_admin_user]

        client = TestClient(app)
        response = client.delete(f"/api/v1/properties/{SAMPLE_PROPERTY_ID}")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_property_invalid_uuid(self, admin_client):
        """Should return 422 for invalid UUID."""
        response = admin_client.delete("/api/v1/properties/not-a-uuid")

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestPropertySchemas:
    """Tests for property schema validation."""

    def test_property_list_response_schema(self):
        """Should validate PropertyListResponse schema."""
        from app.schemas.property import PropertyListResponse

        response = PropertyListResponse(
            data=[],
            count=0,
            has_more=False,
        )

        assert response.count == 0
        assert response.has_more is False
        assert response.data == []

    def test_property_create_validation(self):
        """Should validate PropertyCreate schema."""
        from app.schemas.property import PropertyCreate

        valid_data = {
            "name": "Test Property",
            "address_line1": "123 Main St",
            "city": "San Francisco",
            "state": "CA",
            "postal_code": "94102",
            "total_rentable_sqft": "10000",
            "total_usable_sqft": "8500",
            "common_area_sqft": "1500",
        }

        property_create = PropertyCreate(**valid_data)
        assert property_create.name == "Test Property"
        assert property_create.state == "CA"
        assert property_create.target_occupancy == Decimal("0.95")

    def test_property_update_all_optional(self):
        """Should allow PropertyUpdate with no fields."""
        from app.schemas.property import PropertyUpdate

        # All fields are optional
        property_update = PropertyUpdate()
        assert property_update.name is None

    def test_property_response_from_dict(self):
        """Should create PropertyResponse from database dict."""
        from app.schemas.property import PropertyResponse

        property_data = {
            "id": str(uuid4()),
            "organization_id": str(uuid4()),
            "name": "Test",
            "address_line1": "123 Main",
            "address_line2": None,
            "city": "SF",
            "state": "CA",
            "postal_code": "94102",
            "total_rentable_sqft": "10000",
            "total_usable_sqft": "8500",
            "common_area_sqft": "1500",
            "target_occupancy": "0.95",
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        response = PropertyResponse(**property_data)
        assert response.name == "Test"


class TestEndpointRouting:
    """Tests for endpoint routing and HTTP methods."""

    def test_properties_base_route(self, authenticated_client, mock_supabase):
        """Should handle GET on base route."""
        mock_supabase.table.return_value = MockQueryBuilder([], count=0)

        response = authenticated_client.get("/api/v1/properties")
        assert response.status_code == status.HTTP_200_OK

    def test_properties_post_route(self, authenticated_client, mock_supabase):
        """Should handle POST on base route."""
        mock_supabase.table.return_value = MockQueryBuilder([create_sample_property()])

        response = authenticated_client.post(
            "/api/v1/properties",
            json={
                "name": "Test",
                "address_line1": "123 Main",
                "city": "SF",
                "state": "CA",
                "postal_code": "94102",
                "total_rentable_sqft": 10000,
                "total_usable_sqft": 8500,
                "common_area_sqft": 1500,
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_properties_id_route(self, authenticated_client, mock_supabase):
        """Should handle GET on ID route."""
        mock_supabase.table.return_value = MockQueryBuilder(create_sample_property())

        response = authenticated_client.get(f"/api/v1/properties/{SAMPLE_PROPERTY_ID}")
        assert response.status_code == status.HTTP_200_OK

    def test_properties_put_route(self, authenticated_client, mock_supabase):
        """Should handle PUT on ID route."""
        mock_supabase.table.return_value = MockQueryBuilder([create_sample_property()])

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}",
            json={"name": "Updated"},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_properties_delete_route(self, admin_client, mock_supabase):
        """Should handle DELETE on ID route."""
        mock_supabase.table.return_value = MockQueryBuilder([create_sample_property()])

        response = admin_client.delete(f"/api/v1/properties/{SAMPLE_PROPERTY_ID}")
        assert response.status_code == status.HTTP_204_NO_CONTENT


class TestJsonResponse:
    """Tests for JSON response format."""

    def test_list_response_json_format(self, authenticated_client, mock_supabase):
        """Should return proper JSON structure for list."""
        properties = [create_sample_property()]
        mock_supabase.table.return_value = MockQueryBuilder(properties, count=1)

        response = authenticated_client.get("/api/v1/properties")

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert isinstance(data["data"], list)
        assert isinstance(data["count"], int)
        assert isinstance(data["has_more"], bool)

    def test_single_response_json_format(self, authenticated_client, mock_supabase):
        """Should return proper JSON structure for single property."""
        mock_supabase.table.return_value = MockQueryBuilder(create_sample_property())

        response = authenticated_client.get(f"/api/v1/properties/{SAMPLE_PROPERTY_ID}")

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert "id" in data
        assert "name" in data
        assert "organization_id" in data

    def test_error_response_json_format(self, authenticated_client, mock_supabase):
        """Should return proper JSON structure for errors."""
        mock_supabase.table.return_value = MockQueryBuilder(None)

        response = authenticated_client.get(f"/api/v1/properties/{uuid4()}")

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert "status_code" in data
        assert "message" in data


class TestListPropertyImports:
    """Tests for GET /api/v1/properties/{property_id}/imports endpoint."""

    def test_list_imports_with_status_filter_all(
        self, authenticated_client, mock_supabase
    ):
        """Should return all imports when status_filter='all' (covers line 251)."""
        property_id = uuid4()

        # Mock property exists check
        property_query = MockQueryBuilder({"id": str(property_id)})

        # Mock imports query (should not have .eq("status") called when status="all")
        import_batch = {
            "id": str(uuid4()),
            "property_id": str(property_id),
            "filename": "test.csv",
            "status": "completed",
            "parser_type": "yardi",
            "rows_processed": 100,
            "rows_imported": 98,
            "rows_failed": 2,
            "created_at": "2024-01-01T00:00:00Z",
            "completed_at": "2024-01-01T00:01:00Z",
            "error_message": None,
        }
        imports_query = MockQueryBuilder([import_batch], count=1)

        def table_side_effect(table_name):
            if table_name == "properties":
                return property_query
            return imports_query

        mock_supabase.table.side_effect = table_side_effect

        response = authenticated_client.get(
            f"/api/v1/properties/{property_id}/imports?status=all"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["imports"]) == 1

    def test_list_imports_with_status_filter_completed(
        self, authenticated_client, mock_supabase
    ):
        """Should filter by status when status_filter is provided (covers line 252)."""
        property_id = uuid4()

        # Mock property exists check
        property_query = MockQueryBuilder({"id": str(property_id)})

        # Mock imports query with status filter
        import_batch = {
            "id": str(uuid4()),
            "property_id": str(property_id),
            "filename": "test.csv",
            "status": "completed",
            "parser_type": "yardi",
            "rows_processed": 100,
            "rows_imported": 100,
            "rows_failed": 0,
            "created_at": "2024-01-01T00:00:00Z",
            "completed_at": "2024-01-01T00:01:00Z",
            "error_message": None,
        }
        imports_query = MockQueryBuilder([import_batch], count=1)

        def table_side_effect(table_name):
            if table_name == "properties":
                return property_query
            return imports_query

        mock_supabase.table.side_effect = table_side_effect

        response = authenticated_client.get(
            f"/api/v1/properties/{property_id}/imports?status=completed"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["imports"][0]["status"] == "completed"

    def test_list_imports_no_status_filter(self, authenticated_client, mock_supabase):
        """Should return all imports when no status_filter provided."""
        property_id = uuid4()

        # Mock property exists check
        property_query = MockQueryBuilder({"id": str(property_id)})

        # Mock imports query
        imports_query = MockQueryBuilder([], count=0)

        def table_side_effect(table_name):
            if table_name == "properties":
                return property_query
            return imports_query

        mock_supabase.table.side_effect = table_side_effect

        response = authenticated_client.get(f"/api/v1/properties/{property_id}/imports")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["imports"] == []

    def test_list_imports_maps_ingestion_column_names(
        self, authenticated_client, mock_supabase
    ):
        """Should map file_name/source_system/row_count style rows correctly."""
        property_id = uuid4()

        property_query = MockQueryBuilder({"id": str(property_id)})
        import_batch = {
            "id": str(uuid4()),
            "property_id": str(property_id),
            "file_name": "yardi_export.csv",
            "status": "completed",
            "source_system": "yardi",
            "row_count": 100,
            "error_count": 2,
            "created_at": "2024-01-01T00:00:00Z",
        }
        imports_query = MockQueryBuilder([import_batch], count=1)

        def table_side_effect(table_name):
            if table_name == "properties":
                return property_query
            return imports_query

        mock_supabase.table.side_effect = table_side_effect

        response = authenticated_client.get(f"/api/v1/properties/{property_id}/imports")

        assert response.status_code == 200
        data = response.json()
        assert data["imports"][0]["filename"] == "yardi_export.csv"
        assert data["imports"][0]["parser_type"] == "yardi"
        assert data["imports"][0]["rows_processed"] == 100
        assert data["imports"][0]["rows_failed"] == 2
        assert data["imports"][0]["rows_imported"] == 98
