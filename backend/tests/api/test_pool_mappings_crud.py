"""Tests for Pool Mapping CRUD endpoints.

Tests cover all CRUD operations for pool mappings including:
- List mappings for a property
- Create mapping with GL pattern
- Update mapping
- Delete mapping
- Validate GL pattern format
- Property access verification
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
SAMPLE_MAPPING_ID = uuid4()


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
) -> dict:
    """Create a sample expense pool data dict."""
    return {
        "id": str(pool_id),
        "property_id": str(property_id),
        "name": "Operating Expenses",
        "pool_type": "operating",
        "is_gross_up_applicable": True,
        "gross_up_target": "0.95",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def create_sample_mapping(
    mapping_id: UUID = SAMPLE_MAPPING_ID,
    pool_id: UUID = SAMPLE_POOL_ID,
    pattern: str = "51*",
) -> dict:
    """Create a sample pool mapping data dict."""
    return {
        "id": str(mapping_id),
        "expense_pool_id": str(pool_id),
        "gl_account_pattern": pattern,
        "allocation_percentage": "1.0",
        "priority": 0,
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
        if self._is_single and self._original_data is None:
            return MockSupabaseResponse(None, self._count)
        data = self._data if self._data is not None else []
        return MockSupabaseResponse(data, self._count)


class TableTracker:
    """Track which tables are queried to return different mocks."""

    def __init__(self):
        self.property_data = None
        self.pool_data = None
        self.mapping_data = None
        self.mapping_count = None
        self.raise_on_insert = False
        self.raise_on_update = False

    def table(self, name):
        if name == "properties":
            return MockQueryBuilder(self.property_data)
        elif name == "expense_pools":
            return MockQueryBuilder(self.pool_data)
        elif name == "pool_mappings":
            return MockQueryBuilder(
                self.mapping_data,
                self.mapping_count,
                raise_on_insert=self.raise_on_insert,
                raise_on_update=self.raise_on_update,
            )
        return MockQueryBuilder()


@pytest.fixture
def app():
    """Create test FastAPI app with pool mappings router."""
    from app.api.v1.pool_mappings import router

    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    app.include_router(
        router,
        prefix="/api/v1/properties/{property_id}/pool-mappings",
        tags=["Pool Mappings"],
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


class TestListPoolMappings:
    """Tests for GET /api/v1/properties/{property_id}/pool-mappings endpoint."""

    def test_list_mappings_success(self, authenticated_client, table_tracker):
        """Should return list of mappings for property."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = [{"id": str(SAMPLE_POOL_ID)}]
        mappings = [
            create_sample_mapping(uuid4(), SAMPLE_POOL_ID, "51*"),
            create_sample_mapping(uuid4(), SAMPLE_POOL_ID, "52*"),
        ]
        table_tracker.mapping_data = mappings
        table_tracker.mapping_count = 2

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data
        assert "count" in data
        assert data["count"] == 2

    def test_list_mappings_empty(self, authenticated_client, table_tracker):
        """Should return empty list when no pools exist."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = []

        response = authenticated_client.get(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["data"] == []
        assert data["count"] == 0

    def test_list_mappings_property_not_found(
        self, authenticated_client, table_tracker
    ):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        missing_property_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/properties/{missing_property_id}/pool-mappings"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestCreatePoolMapping:
    """Tests for POST /api/v1/properties/{property_id}/pool-mappings endpoint."""

    def test_create_mapping_success(self, authenticated_client, table_tracker):
        """Should create mapping with valid GL pattern."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = create_sample_pool()
        created_mapping = create_sample_mapping()
        table_tracker.mapping_data = [created_mapping]

        payload = {
            "expense_pool_id": str(SAMPLE_POOL_ID),
            "gl_account_pattern": "51*",
            "allocation_percentage": "1.0",
            "priority": 0,
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "id" in data
        assert data["gl_account_pattern"] == "51*"

    def test_create_mapping_with_question_marks(
        self, authenticated_client, table_tracker
    ):
        """Should accept ? wildcard pattern."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = create_sample_pool()
        created_mapping = create_sample_mapping(pattern="51??")
        table_tracker.mapping_data = [created_mapping]

        payload = {
            "expense_pool_id": str(SAMPLE_POOL_ID),
            "gl_account_pattern": "51??",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_create_mapping_with_range(self, authenticated_client, table_tracker):
        """Should accept hyphenated range pattern."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = create_sample_pool()
        created_mapping = create_sample_mapping(pattern="5100-5199")
        table_tracker.mapping_data = [created_mapping]

        payload = {
            "expense_pool_id": str(SAMPLE_POOL_ID),
            "gl_account_pattern": "5100-5199",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings",
            json=payload,
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_create_mapping_invalid_pattern(self, authenticated_client, table_tracker):
        """Should reject invalid GL pattern characters."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = create_sample_pool()

        payload = {
            "expense_pool_id": str(SAMPLE_POOL_ID),
            "gl_account_pattern": "51abc",  # Letters not allowed
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_mapping_pool_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when expense pool doesn't exist."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = None  # Pool not found

        payload = {
            "expense_pool_id": str(uuid4()),
            "gl_account_pattern": "51*",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_mapping_pool_different_property(
        self, authenticated_client, table_tracker
    ):
        """Should return 400 when pool belongs to different property."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        # Pool belongs to different property
        other_property_pool = create_sample_pool(property_id=uuid4())
        table_tracker.pool_data = other_property_pool

        payload = {
            "expense_pool_id": str(SAMPLE_POOL_ID),
            "gl_account_pattern": "51*",
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings",
            json=payload,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_mapping_property_not_found(
        self, authenticated_client, table_tracker
    ):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        payload = {
            "expense_pool_id": str(SAMPLE_POOL_ID),
            "gl_account_pattern": "51*",
        }

        missing_property_id = uuid4()
        response = authenticated_client.post(
            f"/api/v1/properties/{missing_property_id}/pool-mappings",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_mapping_invalid_allocation_percentage(
        self, authenticated_client, table_tracker
    ):
        """Should reject allocation_percentage > 1."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.pool_data = create_sample_pool()

        payload = {
            "expense_pool_id": str(SAMPLE_POOL_ID),
            "gl_account_pattern": "51*",
            "allocation_percentage": "1.5",  # > 1 is invalid
        }

        response = authenticated_client.post(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings",
            json=payload,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestUpdatePoolMapping:
    """Tests for PUT /api/v1/properties/{property_id}/pool-mappings/{mapping_id}."""

    def test_update_mapping_success(self, authenticated_client, table_tracker):
        """Should update mapping fields."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        updated_mapping = create_sample_mapping()
        updated_mapping["gl_account_pattern"] = "52*"
        table_tracker.mapping_data = [updated_mapping]

        payload = {"gl_account_pattern": "52*"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings/{SAMPLE_MAPPING_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["gl_account_pattern"] == "52*"

    def test_update_mapping_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent mapping."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.mapping_data = []

        missing_id = uuid4()
        payload = {"gl_account_pattern": "52*"}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings/{missing_id}",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_mapping_empty_payload(self, authenticated_client, table_tracker):
        """Should return 400 for empty update payload."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        response = authenticated_client.put(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings/{SAMPLE_MAPPING_ID}",
            json={},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestDeletePoolMapping:
    """Tests for DELETE /api/v1/properties/{property_id}/pool-mappings/{mapping_id}."""

    def test_delete_mapping_success(self, authenticated_client, table_tracker):
        """Should delete mapping and return 204."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        deleted_mapping = create_sample_mapping()
        table_tracker.mapping_data = [deleted_mapping]

        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings/{SAMPLE_MAPPING_ID}"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_mapping_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent mapping."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.mapping_data = []

        missing_id = uuid4()
        response = authenticated_client.delete(
            f"/api/v1/properties/{SAMPLE_PROPERTY_ID}/pool-mappings/{missing_id}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_mapping_property_not_found(
        self, authenticated_client, table_tracker
    ):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        missing_property_id = uuid4()
        response = authenticated_client.delete(
            f"/api/v1/properties/{missing_property_id}/pool-mappings/{SAMPLE_MAPPING_ID}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestPoolMappingPatternMatching:
    """Tests for GL pattern matching validation."""

    def test_pattern_asterisk_wildcard(self):
        """Should match asterisk wildcard patterns."""
        from app.models.pool_mapping import matches_gl_pattern

        assert matches_gl_pattern("5100", "51*")
        assert matches_gl_pattern("51", "51*")
        assert matches_gl_pattern("5199", "51*")
        assert not matches_gl_pattern("6100", "51*")

    def test_pattern_question_wildcard(self):
        """Should match question mark wildcard patterns."""
        from app.models.pool_mapping import matches_gl_pattern

        assert matches_gl_pattern("5100", "51??")
        assert matches_gl_pattern("5199", "51??")
        assert not matches_gl_pattern("51", "51??")  # Too short
        assert not matches_gl_pattern("51000", "51??")  # Too long

    def test_pattern_validation(self):
        """Should validate GL pattern format."""
        from app.models.pool_mapping import is_valid_gl_pattern

        # Valid patterns
        assert is_valid_gl_pattern("51*")
        assert is_valid_gl_pattern("51??")
        assert is_valid_gl_pattern("5100-5199")
        assert is_valid_gl_pattern("5100")

        # Invalid patterns
        assert not is_valid_gl_pattern("")
        assert not is_valid_gl_pattern("51abc")
        assert not is_valid_gl_pattern("51 00")  # Space not allowed
