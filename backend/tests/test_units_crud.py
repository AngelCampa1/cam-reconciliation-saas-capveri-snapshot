"""Tests for Unit CRUD endpoints.

Tests cover all CRUD operations for units including:
- List units with pagination (nested under property)
- Get single unit
- Create unit
- Update unit
- Delete unit
- Property access verification
- Unique constraint on unit_number within property
- Validation errors
- 404 handling
"""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1.units import router
from app.auth.dependencies import (
    OrganizationContext,
    get_current_user,
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
SAMPLE_UNIT_ID = uuid4()


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


def create_sample_unit(
    unit_id: UUID = SAMPLE_UNIT_ID,
    property_id: UUID = SAMPLE_PROPERTY_ID,
    unit_number: str = "101",
) -> dict:
    """Create a sample unit data dict."""
    return {
        "id": str(unit_id),
        "property_id": str(property_id),
        "unit_number": unit_number,
        "rentable_sqft": "1000.00",
        "usable_sqft": "850.00",
        "floor": 1,
        "status": "vacant",
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

    def __init__(
        self, data=None, count=None, raise_on_insert=False, raise_on_update=False
    ):
        # Store data as-is, don't convert None to []
        self._original_data = data
        self._data = data if data is not None else []
        self._count = count
        self._is_single = False
        self._raise_on_insert = raise_on_insert
        self._raise_on_update = raise_on_update

    def select(self, *args, **kwargs):
        return self

    def insert(self, data):
        if self._raise_on_insert:
            raise Exception("duplicate key value violates unique constraint")
        # For insert, we need to return the full unit data with generated fields
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
        if self._raise_on_update:
            raise Exception("duplicate key value violates unique constraint")
        return self

    def delete(self):
        return self

    def eq(self, field, value):
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


class TableTracker:
    """Track which tables are queried to return different mocks."""

    def __init__(self):
        self.property_data = None
        self.unit_data = None
        self.unit_count = None
        self.raise_on_insert = False
        self.raise_on_update = False

    def table(self, name):
        if name == "properties":
            return MockQueryBuilder(self.property_data)
        elif name == "units":
            return MockQueryBuilder(
                self.unit_data,
                self.unit_count,
                raise_on_insert=self.raise_on_insert,
                raise_on_update=self.raise_on_update,
            )
        return MockQueryBuilder()


@pytest.fixture
def app():
    """Create test FastAPI app with units router."""
    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    # Units router is nested under properties
    app.include_router(
        router,
        prefix="/api/v1/properties/{property_id}/units",
        tags=["Units"],
    )
    return app


@pytest.fixture
def table_tracker():
    """Create a table tracker for managing mock responses."""
    return TableTracker()


@pytest.fixture
def authenticated_client(app, table_tracker):
    """Create test client with authenticated user."""
    test_user = create_test_user(role="member")

    def mock_org_context():
        # Create mock client with table method configured
        mock_client = MagicMock()
        mock_client.table = table_tracker.table

        ctx = OrganizationContext(
            client=mock_client,
            organization_id=SAMPLE_ORG_ID,
            user=test_user,
        )
        return ctx

    app.dependency_overrides[get_org_scoped_context] = mock_org_context

    return TestClient(app)


class TestListUnits:
    """Tests for GET /api/v1/properties/{property_id}/units endpoint."""

    def test_list_units_returns_paginated_data(
        self, authenticated_client, table_tracker
    ):
        """Should return paginated list of units for a property."""
        # Property exists
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        # Two units exist
        units = [
            create_sample_unit(uuid4(), SAMPLE_PROPERTY_ID, "101"),
            create_sample_unit(uuid4(), SAMPLE_PROPERTY_ID, "102"),
        ]
        table_tracker.unit_data = units
        table_tracker.unit_count = 2

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data
        assert "count" in data
        assert "has_more" in data
        assert data["count"] == 2
        assert data["has_more"] is False

    def test_list_units_with_pagination(self, authenticated_client, table_tracker):
        """Should respect skip and limit parameters."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        units = [create_sample_unit()]
        table_tracker.unit_data = units
        table_tracker.unit_count = 50  # Total count indicates more exist

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units?skip=0&limit=10"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] == 50
        assert data["has_more"] is True

    def test_list_units_empty_property(self, authenticated_client, table_tracker):
        """Should return empty list for property with no units."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = []
        table_tracker.unit_count = 0

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["data"] == []
        assert data["count"] == 0
        assert data["has_more"] is False

    def test_list_units_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None  # Property not found

        missing_property_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/properties/{missing_property_id}/units"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Property" in data["message"]

    def test_list_units_limit_validation(self, authenticated_client, table_tracker):
        """Should reject limit > 100."""
        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units?limit=200"
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_list_units_skip_validation(self, authenticated_client, table_tracker):
        """Should reject negative skip."""
        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units?skip=-1"
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestGetUnit:
    """Tests for GET /api/v1/properties/{property_id}/units/{unit_id} endpoint."""

    def test_get_unit_success(self, authenticated_client, table_tracker):
        """Should return unit by ID."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        unit_data = create_sample_unit()
        table_tracker.unit_data = unit_data

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(SAMPLE_UNIT_ID)
        assert data["unit_number"] == "101"

    def test_get_unit_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent unit."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = None  # Unit not found

        missing_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{missing_id}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Unit" in data["message"]

    def test_get_unit_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None  # Property not found

        missing_property_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/properties/{missing_property_id}/units/{SAMPLE_UNIT_ID}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Property" in data["message"]

    def test_get_unit_invalid_uuid(self, authenticated_client):
        """Should return 422 for invalid UUID."""
        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/not-a-uuid"
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestCreateUnit:
    """Tests for POST /api/v1/properties/{property_id}/units endpoint."""

    def test_create_unit_success(self, authenticated_client, table_tracker):
        """Should create unit and return 201."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        created_unit = create_sample_unit()
        table_tracker.unit_data = [created_unit]

        payload = {
            "unit_number": "201",
            "rentable_sqft": "1200.00",
            "usable_sqft": "1000.00",
            "floor": 2,
            "status": "vacant",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "id" in data

    def test_create_unit_minimal_fields(self, authenticated_client, table_tracker):
        """Should create unit with minimal required fields."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        created_unit = create_sample_unit()
        table_tracker.unit_data = [created_unit]

        payload = {
            "unit_number": "301",
            "rentable_sqft": "800",
            "usable_sqft": "700",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_create_unit_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        payload = {
            "unit_number": "101",
            "rentable_sqft": "1000",
            "usable_sqft": "850",
        }

        missing_property_id = uuid4()
        response = authenticated_client.post(
            f"/api/v1/properties/{missing_property_id}/units",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_unit_duplicate_number_conflict(
        self, authenticated_client, table_tracker
    ):
        """Should return 409 for duplicate unit number in property."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.raise_on_insert = True  # Simulate unique constraint violation

        payload = {
            "unit_number": "101",  # Already exists
            "rentable_sqft": "1000",
            "usable_sqft": "850",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        data = response.json()
        # The detailed message is in the 'detail' field, not 'message'
        assert "101" in data["detail"]
        assert "already exists" in data["detail"]

    def test_create_unit_missing_required_field(
        self, authenticated_client, table_tracker
    ):
        """Should return 422 for missing required field."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "unit_number": "101",
            # Missing rentable_sqft, usable_sqft
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_unit_usable_exceeds_rentable(
        self, authenticated_client, table_tracker
    ):
        """Should return 422 when usable sqft > rentable sqft."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "unit_number": "101",
            "rentable_sqft": "1000",
            "usable_sqft": "1200",  # Greater than rentable
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        # Model validation raises ValueError which may be 400 or 422
        assert response.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    def test_create_unit_negative_sqft(self, authenticated_client, table_tracker):
        """Should return 422 for negative square footage."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "unit_number": "101",
            "rentable_sqft": "-1000",  # Negative
            "usable_sqft": "850",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_unit_invalid_status(self, authenticated_client, table_tracker):
        """Should return 422 for invalid status value."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "unit_number": "101",
            "rentable_sqft": "1000",
            "usable_sqft": "850",
            "status": "invalid_status",  # Not a valid enum value
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_unit_database_failure(self, app, table_tracker):
        """Should return 500 when database insert fails (covers lines 164-168)."""
        from unittest.mock import MagicMock

        # Create a custom mock for this test
        test_user = create_test_user(role="member")

        # Create mock client where insert returns None
        def mock_org_context():
            mock_client = MagicMock()

            # Property check succeeds
            property_result = MagicMock()
            property_result.data = {"id": str(SAMPLE_PROPERTY_ID)}
            property_query = MagicMock()
            property_query.execute.return_value = property_result

            # Unit insert fails (returns None data)
            unit_insert_result = MagicMock()
            unit_insert_result.data = None  # Simulate database failure
            unit_insert_query = MagicMock()
            unit_insert_query.execute.return_value = unit_insert_result

            def table_side_effect(table_name):
                if table_name == "properties":
                    mock_table = MagicMock()
                    mock_table.select.return_value.eq.return_value.maybe_single.return_value = (
                        property_query
                    )
                    return mock_table
                elif table_name == "units":
                    mock_table = MagicMock()
                    mock_table.insert.return_value = unit_insert_query
                    return mock_table
                return MagicMock()

            mock_client.table.side_effect = table_side_effect

            ctx = OrganizationContext(
                client=mock_client,
                organization_id=SAMPLE_ORG_ID,
                user=test_user,
            )
            return ctx

        app.dependency_overrides[get_org_scoped_context] = mock_org_context
        app.dependency_overrides[get_current_user] = lambda: test_user

        client = TestClient(app)

        payload = {
            "unit_number": "201",
            "rentable_sqft": "1200.00",
            "usable_sqft": "1000.00",
            "floor": 2,
            "status": "vacant",
        }

        response = client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        # Clean up
        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Failed to create unit" in response.json()["detail"]


class TestUpdateUnit:
    """Tests for PUT /api/v1/properties/{property_id}/units/{unit_id} endpoint."""

    def test_update_unit_success(self, authenticated_client, table_tracker):
        """Should update unit fields."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        updated_unit = create_sample_unit()
        updated_unit["unit_number"] = "102"
        table_tracker.unit_data = [updated_unit]

        payload = {"unit_number": "102"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["unit_number"] == "102"

    def test_update_unit_partial(self, authenticated_client, table_tracker):
        """Should update only provided fields."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        updated_unit = create_sample_unit()
        table_tracker.unit_data = [updated_unit]

        payload = {"floor": 5}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_unit_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent unit."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = []  # Empty result

        missing_id = uuid4()
        payload = {"unit_number": "Updated"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{missing_id}",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_unit_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        payload = {"unit_number": "Updated"}

        missing_property_id = uuid4()
        response = authenticated_client.put(
            f"/api/v1/properties/{missing_property_id}/units/{SAMPLE_UNIT_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_unit_empty_payload(self, authenticated_client, table_tracker):
        """Should return 400 for empty update payload."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}",
            json={},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "No fields to update" in data["detail"]

    def test_update_unit_duplicate_number_conflict(
        self, authenticated_client, table_tracker
    ):
        """Should return 409 when updating to existing unit number."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.raise_on_update = True  # Simulate unique constraint violation

        payload = {"unit_number": "102"}  # Already exists

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_409_CONFLICT

    def test_update_unit_invalid_uuid(self, authenticated_client):
        """Should return 422 for invalid UUID."""
        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/not-a-uuid",
            json={"unit_number": "Test"},
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestDeleteUnit:
    """Tests for DELETE /api/v1/properties/{property_id}/units/{unit_id} endpoint."""

    def test_delete_unit_success(self, authenticated_client, table_tracker):
        """Should delete unit and return 204."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        deleted_unit = create_sample_unit()
        table_tracker.unit_data = [deleted_unit]

        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_unit_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent unit."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = []

        missing_id = uuid4()
        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{missing_id}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_unit_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        missing_property_id = uuid4()
        response = authenticated_client.delete(
            f"/api/v1/properties/{missing_property_id}/units/{SAMPLE_UNIT_ID}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_unit_invalid_uuid(self, authenticated_client):
        """Should return 422 for invalid UUID."""
        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/not-a-uuid"
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestUnitSchemas:
    """Tests for unit schema validation."""

    def test_unit_list_response_schema(self):
        """Should validate UnitListResponse schema."""
        from app.schemas.unit import UnitListResponse

        response = UnitListResponse(
            data=[],
            count=0,
            has_more=False,
        )

        assert response.count == 0
        assert response.has_more is False
        assert response.data == []

    def test_unit_create_validation(self):
        """Should validate UnitCreate schema."""
        from app.schemas.unit import UnitCreate

        valid_data = {
            "unit_number": "101",
            "rentable_sqft": "1000",
            "usable_sqft": "850",
            "floor": 1,
            "status": "vacant",
        }

        unit_create = UnitCreate(**valid_data)
        assert unit_create.unit_number == "101"
        assert unit_create.rentable_sqft == Decimal("1000")

    def test_unit_create_default_status(self):
        """Should default status to vacant."""
        from app.schemas.unit import UnitCreate

        valid_data = {
            "unit_number": "101",
            "rentable_sqft": "1000",
            "usable_sqft": "850",
        }

        unit_create = UnitCreate(**valid_data)
        assert unit_create.status.value == "vacant"

    def test_unit_update_all_optional(self):
        """Should allow UnitUpdate with no fields."""
        from app.schemas.unit import UnitUpdate

        # All fields are optional
        unit_update = UnitUpdate()
        assert unit_update.unit_number is None

    def test_unit_response_from_dict(self):
        """Should create UnitResponse from database dict."""
        from app.schemas.unit import UnitResponse

        unit_data = {
            "id": str(uuid4()),
            "property_id": str(uuid4()),
            "unit_number": "101",
            "rentable_sqft": "1000",
            "usable_sqft": "850",
            "floor": 1,
            "status": "vacant",
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        response = UnitResponse(**unit_data)
        assert response.unit_number == "101"


class TestEndpointRouting:
    """Tests for endpoint routing and HTTP methods."""

    def test_units_base_route(self, authenticated_client, table_tracker):
        """Should handle GET on base route."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = []
        table_tracker.unit_count = 0

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_units_post_route(self, authenticated_client, table_tracker):
        """Should handle POST on base route."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = [create_sample_unit()]

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json={
                "unit_number": "101",
                "rentable_sqft": "1000",
                "usable_sqft": "850",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_units_id_route(self, authenticated_client, table_tracker):
        """Should handle GET on ID route."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = create_sample_unit()

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_units_put_route(self, authenticated_client, table_tracker):
        """Should handle PUT on ID route."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = [create_sample_unit()]

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}",
            json={"unit_number": "Updated"},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_units_delete_route(self, authenticated_client, table_tracker):
        """Should handle DELETE on ID route."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = [create_sample_unit()]

        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT


class TestJsonResponse:
    """Tests for JSON response format."""

    def test_list_response_json_format(self, authenticated_client, table_tracker):
        """Should return proper JSON structure for list."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        units = [create_sample_unit()]
        table_tracker.unit_data = units
        table_tracker.unit_count = 1

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units"
        )

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert isinstance(data["data"], list)
        assert isinstance(data["count"], int)
        assert isinstance(data["has_more"], bool)

    def test_single_response_json_format(self, authenticated_client, table_tracker):
        """Should return proper JSON structure for single unit."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = create_sample_unit()

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{SAMPLE_UNIT_ID}"
        )

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert "id" in data
        assert "unit_number" in data
        assert "property_id" in data

    def test_error_response_json_format(self, authenticated_client, table_tracker):
        """Should return proper JSON structure for errors."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = None

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{uuid4()}"
        )

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert "status_code" in data
        assert "message" in data


class TestPropertyFKEnforcement:
    """Tests verifying property FK is enforced."""

    def test_unit_created_with_property_id(self, authenticated_client, table_tracker):
        """Should set property_id when creating unit."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = [create_sample_unit()]

        payload = {
            "unit_number": "101",
            "rentable_sqft": "1000",
            "usable_sqft": "850",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["property_id"] == str(SAMPLE_PROPERTY_ID)

    def test_cannot_access_unit_from_wrong_property(
        self, authenticated_client, table_tracker
    ):
        """Unit access requires correct property_id in path."""
        # First verify property exists
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        # But unit is not in this property (returns None)
        table_tracker.unit_data = None

        other_unit_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/units/{other_unit_id}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
