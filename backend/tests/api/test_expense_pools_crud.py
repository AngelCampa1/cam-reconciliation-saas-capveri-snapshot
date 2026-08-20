"""Tests for Expense Pool CRUD endpoints.

Tests cover all CRUD operations for expense pools including:
- List pools with hierarchical structure
- Get single pool
- Create parent pool
- Create child pool
- Reject 3rd level pool (max depth = 2)
- Update pool
- Delete pool
- Property access verification
- Unique constraint on pool name within property
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    OrganizationContext,
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
SAMPLE_POOL_ID = uuid4()
SAMPLE_PARENT_POOL_ID = uuid4()


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
    pool_id: UUID = SAMPLE_POOL_ID,
    property_id: UUID = SAMPLE_PROPERTY_ID,
    name: str = "Operating Expenses",
    pool_type: str = "operating",
    parent_pool_id: UUID | None = None,
) -> dict:
    """Create a sample expense pool data dict."""
    return {
        "id": str(pool_id),
        "property_id": str(property_id),
        "name": name,
        "pool_type": pool_type,
        "is_gross_up_applicable": True,
        "gross_up_target": "0.95",
        "description": "Test pool description",
        "parent_pool_id": str(parent_pool_id) if parent_pool_id else None,
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

    def __init__(
        self, data=None, count=None, raise_on_insert=False, raise_on_update=False
    ):
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
        if isinstance(data, dict):
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

    def is_(self, field, value):
        return self

    def neq(self, field, value):
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
        if self._is_single:
            if self._original_data is None:
                return MockSupabaseResponse(None, self._count)
            # For maybe_single/single, return single item from list
            if isinstance(self._data, list) and len(self._data) > 0:
                return MockSupabaseResponse(self._data[0], self._count)
            return MockSupabaseResponse(self._data, self._count)
        data = self._data if self._data is not None else []
        return MockSupabaseResponse(data, self._count)


class TableTracker:
    """Track which tables are queried to return different mocks."""

    def __init__(self):
        self.property_data = None
        self.pool_data = None
        self.pool_count = None
        self.parent_pool_data = None
        self.raise_on_insert = False
        self.raise_on_update = False

    def table(self, name):
        if name == "properties":
            return MockQueryBuilder(self.property_data)
        elif name == "expense_pools":
            return MockQueryBuilder(
                self.pool_data,
                self.pool_count,
                raise_on_insert=self.raise_on_insert,
                raise_on_update=self.raise_on_update,
            )
        return MockQueryBuilder()


@pytest.fixture
def app():
    """Create test FastAPI app with expense pools router."""
    from app.api.v1.expense_pools import router

    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    app.include_router(
        router,
        prefix="/api/v1/properties/{property_id}/expense-pools",
        tags=["Expense Pools"],
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


class TestListExpensePools:
    """Tests for GET /api/v1/properties/{property_id}/expense-pools endpoint."""

    def test_list_pools_returns_flat_list(self, authenticated_client, table_tracker):
        """Should return flat list of pools when include_children=false."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        pools = [
            create_sample_pool(uuid4(), SAMPLE_PROPERTY_ID, "Operating"),
            create_sample_pool(uuid4(), SAMPLE_PROPERTY_ID, "Taxes"),
        ]
        table_tracker.pool_data = pools
        table_tracker.pool_count = 2

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools?include_children=false"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data
        assert "count" in data
        assert data["count"] == 2

    def test_list_pools_returns_hierarchy(self, authenticated_client, table_tracker):
        """Should return hierarchical structure by default."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        parent_id = uuid4()
        child_id = uuid4()
        pools = [
            create_sample_pool(parent_id, SAMPLE_PROPERTY_ID, "Operating"),
            create_sample_pool(
                child_id, SAMPLE_PROPERTY_ID, "Janitorial", "operating", parent_id
            ),
        ]
        table_tracker.pool_data = pools
        table_tracker.pool_count = 2

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data

    def test_list_pools_empty_property(self, authenticated_client, table_tracker):
        """Should return empty list for property with no pools."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = []
        table_tracker.pool_count = 0

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["data"] == []
        assert data["count"] == 0

    def test_list_pools_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        missing_property_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/properties/{missing_property_id}/expense-pools"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Property" in data["message"]


class TestGetExpensePool:
    """Tests for GET /api/v1/properties/{property_id}/expense-pools/{pool_id}."""

    def test_get_pool_success(self, authenticated_client, table_tracker):
        """Should return pool by ID."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        pool_data = create_sample_pool()
        table_tracker.pool_data = pool_data

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{SAMPLE_POOL_ID}"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(SAMPLE_POOL_ID)
        assert data["name"] == "Operating Expenses"

    def test_get_pool_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent pool."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = None

        missing_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{missing_id}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Expense Pool" in data["message"]

    def test_get_pool_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        missing_property_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/properties/{missing_property_id}/expense-pools/{SAMPLE_POOL_ID}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Property" in data["message"]


class TestCreateExpensePool:
    """Tests for POST /api/v1/properties/{property_id}/expense-pools endpoint."""

    def test_create_parent_pool_success(self, authenticated_client, table_tracker):
        """Should create a top-level pool."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        created_pool = create_sample_pool()
        table_tracker.pool_data = [created_pool]

        payload = {
            "name": "Operating Expenses",
            "pool_type": "operating",
            "is_gross_up_applicable": True,
            "gross_up_target": "0.95",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "id" in data
        assert data["name"] == "Operating Expenses"

    def test_create_child_pool_success(self, authenticated_client, table_tracker):
        """Should create a child pool with parent reference."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        # Parent exists and has no parent (valid for child)
        parent_pool = create_sample_pool(SAMPLE_PARENT_POOL_ID)
        table_tracker.pool_data = [parent_pool]

        payload = {
            "name": "Janitorial",
            "pool_type": "operating",
            "parent_pool_id": str(SAMPLE_PARENT_POOL_ID),
            "is_gross_up_applicable": True,
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["parent_pool_id"] == str(SAMPLE_PARENT_POOL_ID)

    def test_create_grandchild_pool_fails(self, authenticated_client, table_tracker):
        """Should reject 3rd level pool (max depth = 2)."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        # Parent already has a parent (making this a grandchild)
        grandparent_id = uuid4()
        parent_pool = create_sample_pool(
            SAMPLE_PARENT_POOL_ID,
            parent_pool_id=grandparent_id,  # Parent has a parent
        )
        table_tracker.pool_data = parent_pool

        payload = {
            "name": "Sub-Janitorial",
            "pool_type": "operating",
            "parent_pool_id": str(SAMPLE_PARENT_POOL_ID),
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert (
            "depth" in data["detail"].lower() or "hierarchy" in data["detail"].lower()
        )

    def test_create_pool_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        payload = {
            "name": "Test Pool",
            "pool_type": "operating",
        }

        missing_property_id = uuid4()
        response = authenticated_client.post(
            f"/api/v1/properties/{missing_property_id}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_pool_duplicate_name_conflict(
        self, authenticated_client, table_tracker
    ):
        """Should return 409 for duplicate pool name in property."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.raise_on_insert = True

        payload = {
            "name": "Operating Expenses",  # Already exists
            "pool_type": "operating",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_409_CONFLICT

    def test_create_pool_missing_required_field(
        self, authenticated_client, table_tracker
    ):
        """Should return 422 for missing required field."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "name": "Test Pool",
            # Missing pool_type
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_pool_invalid_pool_type(self, authenticated_client, table_tracker):
        """Should return 422 for invalid pool_type value."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "name": "Test Pool",
            "pool_type": "invalid_type",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_pool_invalid_gross_up_target(
        self, authenticated_client, table_tracker
    ):
        """Should return 422 for gross_up_target > 1."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "name": "Test Pool",
            "pool_type": "operating",
            "gross_up_target": "1.5",  # > 1 is invalid
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_fixed_pool_no_gross_up(self, authenticated_client, table_tracker):
        """Should create pool without gross-up for tax/insurance."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        created_pool = create_sample_pool()
        created_pool["is_gross_up_applicable"] = False
        created_pool["gross_up_target"] = None
        table_tracker.pool_data = [created_pool]

        payload = {
            "name": "Property Taxes",
            "pool_type": "tax",
            "is_gross_up_applicable": False,
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED


class TestUpdateExpensePool:
    """Tests for PUT /api/v1/properties/{property_id}/expense-pools/{pool_id}."""

    def test_update_pool_success(self, authenticated_client, table_tracker):
        """Should update pool fields."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        updated_pool = create_sample_pool()
        updated_pool["name"] = "Updated Name"
        table_tracker.pool_data = [updated_pool]

        payload = {"name": "Updated Name"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{SAMPLE_POOL_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Updated Name"

    def test_update_pool_partial(self, authenticated_client, table_tracker):
        """Should update only provided fields."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        updated_pool = create_sample_pool()
        table_tracker.pool_data = [updated_pool]

        payload = {"description": "Updated description"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{SAMPLE_POOL_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_pool_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent pool."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = []

        missing_id = uuid4()
        payload = {"name": "Updated"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{missing_id}",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_pool_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        payload = {"name": "Updated"}

        missing_property_id = uuid4()
        response = authenticated_client.put(
            f"/api/v1/properties/{missing_property_id}/expense-pools/{SAMPLE_POOL_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_pool_empty_payload(self, authenticated_client, table_tracker):
        """Should return 400 for empty update payload."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{SAMPLE_POOL_ID}",
            json={},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_pool_duplicate_name_conflict(
        self, authenticated_client, table_tracker
    ):
        """Should return 409 when updating to existing pool name."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.raise_on_update = True

        payload = {"name": "Existing Pool"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{SAMPLE_POOL_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_409_CONFLICT


class TestDeleteExpensePool:
    """Tests for DELETE /api/v1/properties/{property_id}/expense-pools/{pool_id}."""

    def test_delete_pool_success(self, authenticated_client, table_tracker):
        """Should delete pool and return 204."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        deleted_pool = create_sample_pool()
        table_tracker.pool_data = [deleted_pool]

        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{SAMPLE_POOL_ID}"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_pool_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent pool."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = []

        missing_id = uuid4()
        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{missing_id}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_pool_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        missing_property_id = uuid4()
        response = authenticated_client.delete(
            f"/api/v1/properties/{missing_property_id}/expense-pools/{SAMPLE_POOL_ID}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_parent_pool_cascades_children(
        self, authenticated_client, table_tracker
    ):
        """Deleting parent pool should cascade to children (DB constraint)."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        # Parent pool with children
        parent_pool = create_sample_pool(SAMPLE_PARENT_POOL_ID, name="Parent")
        table_tracker.pool_data = [parent_pool]

        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/expense-pools/{SAMPLE_PARENT_POOL_ID}"
        )

        # Should succeed - DB handles cascade
        assert response.status_code == status.HTTP_204_NO_CONTENT


class TestExpensePoolSchemas:
    """Tests for expense pool schema validation."""

    def test_expense_pool_create_validation(self):
        """Should validate ExpensePoolCreate schema."""
        from app.schemas.expense_pool import ExpensePoolCreate

        valid_data = {
            "name": "Test Pool",
            "pool_type": "operating",
            "is_gross_up_applicable": True,
            "gross_up_target": "0.95",
        }

        pool_create = ExpensePoolCreate(**valid_data)
        assert pool_create.name == "Test Pool"
        assert pool_create.pool_type == "operating"

    def test_expense_pool_update_all_optional(self):
        """Should allow ExpensePoolUpdate with no fields."""
        from app.schemas.expense_pool import ExpensePoolUpdate

        pool_update = ExpensePoolUpdate()
        assert pool_update.name is None

    def test_list_response_schema(self):
        """Should validate ExpensePoolListResponse schema."""
        from app.schemas.expense_pool import ExpensePoolListResponse

        response = ExpensePoolListResponse(
            data=[],
            count=0,
            has_more=False,
        )

        assert response.count == 0
        assert response.has_more is False
