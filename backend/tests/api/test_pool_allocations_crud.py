"""Tests for Pool Allocation CRUD endpoints."""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.auth.dependencies import OrganizationContext, get_org_scoped_context
from app.exceptions import (
    register_custom_exception_handlers,
    register_exception_handlers,
)
from app.models.user import User

SAMPLE_ORG_ID = uuid4()
SAMPLE_USER_ID = uuid4()
SAMPLE_PROPERTY_ID = uuid4()
SOURCE_POOL_ID = uuid4()
TARGET_POOL_ID = uuid4()
OTHER_PROPERTY_POOL_ID = uuid4()
ALLOCATION_ID = uuid4()


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


def create_sample_pool(
    pool_id: UUID,
    property_id: UUID = SAMPLE_PROPERTY_ID,
    name: str = "Operating Expenses",
) -> dict:
    """Create a sample expense pool row."""
    return {
        "id": str(pool_id),
        "property_id": str(property_id),
        "name": name,
        "pool_type": "operating",
        "is_gross_up_applicable": True,
        "gross_up_target": "0.95",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def create_sample_allocation(
    allocation_id: UUID = ALLOCATION_ID,
    source_pool_id: UUID = SOURCE_POOL_ID,
    target_pool_id: UUID = TARGET_POOL_ID,
) -> dict:
    """Create a sample pool allocation row."""
    return {
        "id": str(allocation_id),
        "source_pool_id": str(source_pool_id),
        "target_pool_id": str(target_pool_id),
        "allocation_type": "percentage",
        "allocation_value": "60.0",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


class MockSupabaseResponse:
    """Mock Supabase response object."""

    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class MockQueryBuilder:
    """Mock Supabase query builder for chaining."""

    def __init__(self, data=None, count=None, raise_on_insert=False):
        self._original_data = data
        self._data = data if data is not None else []
        self._count = count
        self._is_single = False
        self._raise_on_insert = raise_on_insert
        self.inserted_data = None

    def select(self, *args, **kwargs):
        return self

    def insert(self, data):
        if self._raise_on_insert:
            raise Exception("duplicate key value violates unique constraint")
        self.inserted_data = data
        result = dict(data)
        result.setdefault("id", str(uuid4()))
        result.setdefault("created_at", datetime.now(UTC).isoformat())
        result.setdefault("updated_at", datetime.now(UTC).isoformat())
        self._data = [result]
        self._original_data = [result]
        return self

    def update(self, data):
        result = dict(self._data[0] if isinstance(self._data, list) else self._data)
        result.update(data)
        self._data = [result]
        self._original_data = [result]
        return self

    def delete(self):
        return self

    def eq(self, field, value):
        if isinstance(self._data, list):
            self._data = [
                row for row in self._data if str(row.get(field)) == str(value)
            ]
        elif isinstance(self._data, dict) and str(self._data.get(field)) != str(value):
            self._data = []
        return self

    def in_(self, field, values):
        value_set = {str(value) for value in values}
        if isinstance(self._data, list):
            self._data = [row for row in self._data if str(row.get(field)) in value_set]
        return self

    def range(self, start, end):
        return self

    def order(self, field, desc=False):
        return self

    def maybe_single(self):
        self._is_single = True
        return self

    def execute(self):
        if self._is_single:
            if self._data is None:
                return MockSupabaseResponse(None, self._count)
            if isinstance(self._data, list) and self._data:
                return MockSupabaseResponse(self._data[0], self._count)
            if isinstance(self._data, dict):
                return MockSupabaseResponse(self._data, self._count)
            return MockSupabaseResponse(None, self._count)
        return MockSupabaseResponse(self._data or [], self._count)


class TableTracker:
    """Track table-specific mock data."""

    def __init__(self):
        self.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        self.pool_data = [
            create_sample_pool(SOURCE_POOL_ID),
            create_sample_pool(TARGET_POOL_ID, name="Janitorial"),
        ]
        self.allocation_data = [create_sample_allocation()]
        self.allocation_count = 1
        self.raise_on_insert = False
        self.pool_insert_query = None

    def table(self, name):
        if name == "properties":
            return MockQueryBuilder(self.property_data)
        if name == "expense_pools":
            return MockQueryBuilder(self.pool_data)
        if name == "pool_allocations":
            query = MockQueryBuilder(
                self.allocation_data,
                self.allocation_count,
                raise_on_insert=self.raise_on_insert,
            )
            self.pool_insert_query = query
            return query
        return MockQueryBuilder()


@pytest.fixture
def app():
    """Create test FastAPI app with pool allocations router."""
    from app.api.v1.pool_allocations import router

    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    app.include_router(
        router,
        prefix="/api/v1/properties/{property_id}/pool-allocations",
        tags=["Pool Allocations"],
    )
    return app


@pytest.fixture
def table_tracker():
    """Create table tracker."""
    return TableTracker()


@pytest.fixture
def authenticated_client(app, table_tracker):
    """Create test client with authenticated user."""
    test_user = create_test_user()

    def mock_org_context():
        mock_client = MagicMock()
        mock_client.table = table_tracker.table
        return OrganizationContext(
            client=mock_client,
            organization_id=SAMPLE_ORG_ID,
            user=test_user,
        )

    app.dependency_overrides[get_org_scoped_context] = mock_org_context
    return TestClient(app)


def test_list_pool_allocations_returns_property_allocations(
    authenticated_client, table_tracker
):
    """List returns allocations whose source pool belongs to the property."""
    response = authenticated_client.get(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations"
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["count"] == 1
    assert data["data"][0]["source_pool_id"] == str(SOURCE_POOL_ID)
    assert data["data"][0]["target_pool_id"] == str(TARGET_POOL_ID)


def test_create_pool_allocation_rejects_cross_property_target(
    authenticated_client, table_tracker
):
    """Source and target pools must both belong to the route property."""
    table_tracker.pool_data = [
        create_sample_pool(SOURCE_POOL_ID),
        create_sample_pool(OTHER_PROPERTY_POOL_ID, property_id=uuid4()),
    ]

    response = authenticated_client.post(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations",
        json={
            "source_pool_id": str(SOURCE_POOL_ID),
            "target_pool_id": str(OTHER_PROPERTY_POOL_ID),
            "allocation_type": "percentage",
            "allocation_value": "50",
        },
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "same property" in response.json()["detail"]


def test_create_pool_allocation_rejects_self_allocation(authenticated_client):
    """A pool cannot split into itself."""
    response = authenticated_client.post(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations",
        json={
            "source_pool_id": str(SOURCE_POOL_ID),
            "target_pool_id": str(SOURCE_POOL_ID),
            "allocation_type": "percentage",
            "allocation_value": "50",
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "must be different" in response.json()["detail"]


def test_create_pool_allocation_rejects_percentage_total_over_100(
    authenticated_client, table_tracker
):
    """Percentage allocations for the same source pool cannot exceed 100%."""
    table_tracker.allocation_data = [
        create_sample_allocation(target_pool_id=uuid4()),
    ]

    response = authenticated_client.post(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations",
        json={
            "source_pool_id": str(SOURCE_POOL_ID),
            "target_pool_id": str(TARGET_POOL_ID),
            "allocation_type": "percentage",
            "allocation_value": "50",
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "exceed 100%" in response.json()["detail"]


def test_create_pool_allocation_scopes_percentage_total_to_source_pool(
    authenticated_client, table_tracker
):
    """Existing allocations on another source pool do not block this source."""
    other_source_pool_id = uuid4()
    table_tracker.pool_data.append(create_sample_pool(other_source_pool_id))
    table_tracker.allocation_data = [
        create_sample_allocation(
            source_pool_id=other_source_pool_id,
            target_pool_id=uuid4(),
        ),
    ]

    response = authenticated_client.post(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations",
        json={
            "source_pool_id": str(SOURCE_POOL_ID),
            "target_pool_id": str(TARGET_POOL_ID),
            "allocation_type": "percentage",
            "allocation_value": "50",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["source_pool_id"] == str(SOURCE_POOL_ID)
    assert data["target_pool_id"] == str(TARGET_POOL_ID)


def test_delete_pool_allocation_rejects_cross_property_source_pool(
    authenticated_client, table_tracker
):
    """Delete only allows allocations whose source pool belongs to the property."""
    table_tracker.allocation_data = [
        create_sample_allocation(source_pool_id=OTHER_PROPERTY_POOL_ID),
    ]

    response = authenticated_client.delete(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations/{ALLOCATION_ID}"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_list_pool_allocations_rejects_cross_property_source_filter(
    authenticated_client,
):
    """List rejects a source_pool_id outside the route property."""
    response = authenticated_client.get(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations",
        params={"source_pool_id": str(OTHER_PROPERTY_POOL_ID)},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "same property" in response.json()["detail"]


def test_list_pool_allocations_returns_empty_when_property_has_no_pools(
    authenticated_client, table_tracker
):
    """List returns an empty page when no pools exist for the property."""
    table_tracker.pool_data = []

    response = authenticated_client.get(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"data": [], "count": 0, "has_more": False}


def test_create_pool_allocation_rejects_fixed_amount(authenticated_client):
    """Only percentage allocations are exposed because reconciliation supports them."""
    response = authenticated_client.post(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations",
        json={
            "source_pool_id": str(SOURCE_POOL_ID),
            "target_pool_id": str(TARGET_POOL_ID),
            "allocation_type": "fixed_amount",
            "allocation_value": "50",
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "Only percentage" in response.json()["detail"]


def test_create_pool_allocation_rejects_duplicate_source_target(
    authenticated_client, table_tracker
):
    """Duplicate source/target pairs surface as conflicts."""
    table_tracker.allocation_data = []
    table_tracker.raise_on_insert = True

    response = authenticated_client.post(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations",
        json={
            "source_pool_id": str(SOURCE_POOL_ID),
            "target_pool_id": str(TARGET_POOL_ID),
            "allocation_type": "percentage",
            "allocation_value": "50",
        },
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert "already exists" in response.json()["detail"]


def test_update_pool_allocation_changes_percentage(authenticated_client):
    """Update returns the modified allocation when it belongs to the property."""
    response = authenticated_client.put(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations/{ALLOCATION_ID}",
        json={"allocation_value": "70"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["allocation_value"] == "70"


def test_update_pool_allocation_rejects_cross_property_target(
    authenticated_client, table_tracker
):
    """Update validates a replacement target pool belongs to the property."""
    table_tracker.pool_data = [
        create_sample_pool(SOURCE_POOL_ID),
        create_sample_pool(OTHER_PROPERTY_POOL_ID, property_id=uuid4()),
    ]

    response = authenticated_client.put(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations/{ALLOCATION_ID}",
        json={"target_pool_id": str(OTHER_PROPERTY_POOL_ID)},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "same property" in response.json()["detail"]


def test_update_pool_allocation_rejects_self_allocation(authenticated_client):
    """Update rejects a target pool equal to the existing source pool."""
    response = authenticated_client.put(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations/{ALLOCATION_ID}",
        json={"target_pool_id": str(SOURCE_POOL_ID)},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "must be different" in response.json()["detail"]


@pytest.mark.parametrize("value", ["0", "-1"])
def test_update_pool_allocation_rejects_invalid_percentage_value(
    authenticated_client, value
):
    """Partial percentage value updates validate before reaching the database."""
    response = authenticated_client.put(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations/{ALLOCATION_ID}",
        json={"allocation_value": value},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "greater than 0" in response.json()["detail"]


def test_update_pool_allocation_rejects_empty_payload(authenticated_client):
    """Update requires at least one field."""
    response = authenticated_client.put(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations/{ALLOCATION_ID}",
        json={},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "No fields" in response.json()["detail"]


def test_update_pool_allocation_returns_not_found(authenticated_client, table_tracker):
    """Update returns 404 when the allocation does not exist."""
    table_tracker.allocation_data = []

    response = authenticated_client.put(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations/{ALLOCATION_ID}",
        json={"allocation_value": "70"},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_delete_pool_allocation_success(authenticated_client):
    """Delete removes an allocation whose source pool belongs to the property."""
    response = authenticated_client.delete(
        f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-allocations/{ALLOCATION_ID}"
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
