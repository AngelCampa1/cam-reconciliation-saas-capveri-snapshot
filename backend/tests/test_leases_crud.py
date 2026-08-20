"""Tests for Lease CRUD endpoints.

Tests cover all CRUD operations for leases including:
- List leases with pagination and filtering
- Get single lease
- Create lease with property/unit validation
- Update lease (excluding recovery profile)
- Delete lease (admin only)
- Get recovery profile
- Update recovery profile with merge logic
- Date validation (end > start)
- Recovery profile JSONB validation
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1.leases import router
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
SAMPLE_UNIT_ID = uuid4()
SAMPLE_LEASE_ID = uuid4()


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


def create_sample_recovery_profile() -> dict:
    """Create a sample recovery profile dict."""
    return {
        "base_year": 2024,
        "base_year_amount": None,
        "gross_up_base_year": False,
        "pro_rata_share": "0.05",
        "cap_type": "none",
        "cap_rate": None,
        "admin_fee_percentage": "0.15",
        "excluded_pools": [],
    }


def create_sample_lease(
    lease_id: UUID = SAMPLE_LEASE_ID,
    property_id: UUID = SAMPLE_PROPERTY_ID,
    unit_id: UUID | None = None,
    tenant_name: str = "Acme Corp",
    start_date: str = "2024-01-01",
    end_date: str = "2029-01-01",
) -> dict:
    """Create a sample lease data dict."""
    return {
        "id": str(lease_id),
        "property_id": str(property_id),
        "unit_id": str(unit_id) if unit_id else None,
        "tenant_name": tenant_name,
        "start_date": start_date,
        "end_date": end_date,
        "status": "active",
        "recovery_profile": create_sample_recovery_profile(),
        "document_url": None,
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
            raise Exception("insert failed")
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
            raise Exception("update failed")
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
        if self._is_single:
            if self._original_data is None:
                return MockSupabaseResponse(None, self._count)
            # For single queries, return first item if data is a list
            if isinstance(self._original_data, list):
                if len(self._original_data) > 0:
                    return MockSupabaseResponse(self._original_data[0], self._count)
                return MockSupabaseResponse(None, self._count)
            return MockSupabaseResponse(self._original_data, self._count)
        # For list queries, ensure we return a list
        data = self._data if self._data is not None else []
        return MockSupabaseResponse(data, self._count)


class TableTracker:
    """Track which tables are queried to return different mocks."""

    def __init__(self):
        self.property_data = None
        self.unit_data = None
        self.lease_data = None
        self.lease_count = None
        self.raise_on_insert = False
        self.raise_on_update = False

    def table(self, name):
        if name == "properties":
            return MockQueryBuilder(self.property_data)
        elif name == "units":
            return MockQueryBuilder(self.unit_data)
        elif name == "leases":
            return MockQueryBuilder(
                self.lease_data,
                self.lease_count,
                raise_on_insert=self.raise_on_insert,
                raise_on_update=self.raise_on_update,
            )
        return MockQueryBuilder()


@pytest.fixture
def app():
    """Create test FastAPI app with leases router."""
    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    app.include_router(router, prefix="/api/v1/leases", tags=["Leases"])
    return app


@pytest.fixture
def table_tracker():
    """Create a table tracker for managing mock responses."""
    return TableTracker()


@pytest.fixture
def authenticated_client(app, table_tracker):
    """Create test client with authenticated user (member role)."""
    test_user = create_test_user(role="member")

    def mock_org_context():
        mock_client = MagicMock()
        mock_client.table = table_tracker.table
        return OrganizationContext(
            client=mock_client,
            organization_id=SAMPLE_ORG_ID,
            user=test_user,
        )

    def mock_admin_user_forbidden():
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    app.dependency_overrides[get_org_scoped_context] = mock_org_context
    app.dependency_overrides[get_current_admin_user] = mock_admin_user_forbidden
    return TestClient(app)


@pytest.fixture
def admin_client(app, table_tracker):
    """Create test client with admin user."""
    admin_user = create_test_user(role="admin")

    def mock_org_context():
        mock_client = MagicMock()
        mock_client.table = table_tracker.table
        return OrganizationContext(
            client=mock_client,
            organization_id=SAMPLE_ORG_ID,
            user=admin_user,
        )

    def mock_admin_user():
        return admin_user

    app.dependency_overrides[get_org_scoped_context] = mock_org_context
    app.dependency_overrides[get_current_admin_user] = mock_admin_user
    return TestClient(app)


class TestListLeases:
    """Tests for GET /api/v1/leases endpoint."""

    def test_list_leases_returns_paginated_data(
        self, authenticated_client, table_tracker
    ):
        """Should return paginated list of leases."""
        leases = [
            create_sample_lease(uuid4(), SAMPLE_PROPERTY_ID),
            create_sample_lease(uuid4(), SAMPLE_PROPERTY_ID),
        ]
        table_tracker.lease_data = leases
        table_tracker.lease_count = 2

        response = authenticated_client.get("/api/v1/leases")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "data" in data
        assert "count" in data
        assert "has_more" in data
        assert data["count"] == 2
        assert data["has_more"] is False

    def test_list_leases_with_pagination(self, authenticated_client, table_tracker):
        """Should respect skip and limit parameters."""
        leases = [create_sample_lease()]
        table_tracker.lease_data = leases
        table_tracker.lease_count = 50

        response = authenticated_client.get("/api/v1/leases?skip=0&limit=10")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] == 50
        assert data["has_more"] is True

    def test_list_leases_filter_by_property(self, authenticated_client, table_tracker):
        """Should filter leases by property_id."""
        leases = [create_sample_lease()]
        table_tracker.lease_data = leases
        table_tracker.lease_count = 1

        response = authenticated_client.get(
            f"/api/v1/leases?property_id={SAMPLE_PROPERTY_ID}"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] == 1

    def test_list_leases_filter_by_status(self, authenticated_client, table_tracker):
        """Should filter leases by status."""
        leases = [create_sample_lease()]
        table_tracker.lease_data = leases
        table_tracker.lease_count = 1

        response = authenticated_client.get("/api/v1/leases?status=active")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] == 1

    def test_list_leases_empty(self, authenticated_client, table_tracker):
        """Should return empty list when no leases exist."""
        table_tracker.lease_data = []
        table_tracker.lease_count = 0

        response = authenticated_client.get("/api/v1/leases")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["data"] == []
        assert data["count"] == 0

    def test_list_leases_limit_validation(self, authenticated_client):
        """Should reject limit > 100."""
        response = authenticated_client.get("/api/v1/leases?limit=200")

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_list_leases_skip_validation(self, authenticated_client):
        """Should reject negative skip."""
        response = authenticated_client.get("/api/v1/leases?skip=-1")

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestGetLease:
    """Tests for GET /api/v1/leases/{lease_id} endpoint."""

    def test_get_lease_success(self, authenticated_client, table_tracker):
        """Should return lease by ID."""
        lease_data = create_sample_lease()
        table_tracker.lease_data = lease_data

        response = authenticated_client.get(f"/api/v1/leases/{SAMPLE_LEASE_ID}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(SAMPLE_LEASE_ID)
        assert data["tenant_name"] == "Acme Corp"
        assert "recovery_profile" in data

    def test_get_lease_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent lease."""
        table_tracker.lease_data = None

        missing_id = uuid4()
        response = authenticated_client.get(f"/api/v1/leases/{missing_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Lease" in data["message"]

    def test_get_lease_invalid_uuid(self, authenticated_client):
        """Should return 422 for invalid UUID."""
        response = authenticated_client.get("/api/v1/leases/not-a-uuid")

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestCreateLease:
    """Tests for POST /api/v1/leases endpoint."""

    def test_create_lease_success(self, authenticated_client, table_tracker):
        """Should create lease and return 201."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        created_lease = create_sample_lease()
        table_tracker.lease_data = [created_lease]

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "tenant_name": "Acme Corp",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {
                "pro_rata_share": "0.05",
            },
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "id" in data

    def test_create_lease_with_unit(self, authenticated_client, table_tracker):
        """Should create lease with unit association."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = {"id": str(SAMPLE_UNIT_ID)}
        created_lease = create_sample_lease(unit_id=SAMPLE_UNIT_ID)
        table_tracker.lease_data = [created_lease]

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "unit_id": str(SAMPLE_UNIT_ID),
            "tenant_name": "Acme Corp",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {
                "pro_rata_share": "0.05",
            },
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_201_CREATED

    def test_create_lease_property_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when property doesn't exist."""
        table_tracker.property_data = None

        payload = {
            "property_id": str(uuid4()),
            "tenant_name": "Acme Corp",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {
                "pro_rata_share": "0.05",
            },
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Property" in data["message"]

    def test_create_lease_unit_not_found(self, authenticated_client, table_tracker):
        """Should return 404 when unit doesn't exist."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = None  # Unit not found

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "unit_id": str(uuid4()),
            "tenant_name": "Acme Corp",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {
                "pro_rata_share": "0.05",
            },
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Unit" in data["message"]

    def test_create_lease_end_before_start(self, authenticated_client, table_tracker):
        """Should return 422 when end_date is before start_date."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "tenant_name": "Acme Corp",
            "start_date": "2024-01-01",
            "end_date": "2023-01-01",  # Before start
            "recovery_profile": {
                "pro_rata_share": "0.05",
            },
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        # Pydantic model validator can return 400 or 422
        assert response.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    def test_create_lease_missing_tenant_name(
        self, authenticated_client, table_tracker
    ):
        """Should return 422 for missing tenant_name."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            # Missing tenant_name
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {
                "pro_rata_share": "0.05",
            },
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_lease_with_cap_requires_rate(
        self, authenticated_client, table_tracker
    ):
        """Should return 422 when cap_type is not none but cap_rate missing."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "tenant_name": "Acme Corp",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {
                "pro_rata_share": "0.05",
                "cap_type": "cumulative",  # Requires cap_rate
                # cap_rate missing
            },
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        # Pydantic model validator can return 400 or 422
        assert response.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    def test_create_lease_with_valid_cap(self, authenticated_client, table_tracker):
        """Should create lease with valid cap configuration."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        created_lease = create_sample_lease()
        created_lease["recovery_profile"]["cap_type"] = "cumulative"
        created_lease["recovery_profile"]["cap_rate"] = "0.05"
        table_tracker.lease_data = [created_lease]

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "tenant_name": "Acme Corp",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {
                "pro_rata_share": "0.05",
                "cap_type": "cumulative",
                "cap_rate": "0.05",
            },
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_201_CREATED


class TestUpdateLease:
    """Tests for PUT /api/v1/leases/{lease_id} endpoint."""

    def test_update_lease_success(self, authenticated_client, table_tracker):
        """Should update lease fields."""
        updated_lease = create_sample_lease()
        updated_lease["tenant_name"] = "Updated Corp"
        table_tracker.lease_data = [updated_lease]

        payload = {"tenant_name": "Updated Corp"}

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["tenant_name"] == "Updated Corp"

    def test_update_lease_partial(self, authenticated_client, table_tracker):
        """Should update only provided fields."""
        updated_lease = create_sample_lease()
        updated_lease["status"] = "expired"
        table_tracker.lease_data = [updated_lease]

        payload = {"status": "expired"}

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_lease_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent lease."""
        table_tracker.lease_data = []

        missing_id = uuid4()
        payload = {"tenant_name": "Updated"}

        response = authenticated_client.put(
            f"/api/v1/leases/{missing_id}",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_lease_empty_payload(self, authenticated_client, table_tracker):
        """Should return 400 for empty update payload."""
        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}",
            json={},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "No fields to update" in data["detail"]

    def test_update_lease_excludes_recovery_profile(
        self, authenticated_client, table_tracker
    ):
        """Should not update recovery_profile via this endpoint."""
        updated_lease = create_sample_lease()
        table_tracker.lease_data = [updated_lease]

        # Try to update recovery_profile - should be ignored
        payload = {
            "tenant_name": "Updated",
            "recovery_profile": {"pro_rata_share": "0.99"},
        }

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK
        # Recovery profile should NOT be updated (original value retained)
        data = response.json()
        assert data["recovery_profile"]["pro_rata_share"] == "0.05"

    def test_update_lease_with_unit_id_validates(
        self, authenticated_client, table_tracker
    ):
        """Should validate unit_id when updating - unit not in property returns 404."""
        # First lookup returns the lease with its property_id
        existing_lease = create_sample_lease()
        table_tracker.lease_data = existing_lease

        # Unit lookup returns None (unit not found in property)
        table_tracker.unit_data = None

        payload = {"unit_id": str(SAMPLE_UNIT_ID)}

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}",
            json=payload,
        )

        # Unit validation should fail with 404
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestGetRecoveryProfile:
    """Tests for GET /api/v1/leases/{lease_id}/recovery-profile endpoint."""

    def test_get_recovery_profile_success(self, authenticated_client, table_tracker):
        """Should return recovery profile for lease."""
        lease_data = create_sample_lease()
        table_tracker.lease_data = lease_data

        response = authenticated_client.get(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}/recovery-profile"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "pro_rata_share" in data
        assert data["base_year"] == 2024

    def test_get_recovery_profile_not_found(self, authenticated_client, table_tracker):
        """Should return 404 for non-existent lease."""
        table_tracker.lease_data = None

        missing_id = uuid4()
        response = authenticated_client.get(
            f"/api/v1/leases/{missing_id}/recovery-profile"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestUpdateRecoveryProfile:
    """Tests for PUT /api/v1/leases/{lease_id}/recovery-profile endpoint."""

    def test_update_recovery_profile_success(self, authenticated_client, table_tracker):
        """Should update recovery profile fields."""
        # Setup: both lookup and update return the lease data
        updated_lease = create_sample_lease()
        updated_lease["recovery_profile"]["pro_rata_share"] = "0.10"
        table_tracker.lease_data = [updated_lease]

        payload = {"pro_rata_share": "0.10"}

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}/recovery-profile",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_recovery_profile_merge_existing(
        self, authenticated_client, table_tracker
    ):
        """Should merge updates with existing profile fields."""
        # Setup: lease with existing base_year
        updated_lease = create_sample_lease()
        updated_lease["recovery_profile"]["base_year"] = 2023
        updated_lease["recovery_profile"]["admin_fee_percentage"] = "0.10"
        table_tracker.lease_data = [updated_lease]

        payload = {"admin_fee_percentage": "0.10"}

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}/recovery-profile",
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_recovery_profile_not_found(
        self, authenticated_client, table_tracker
    ):
        """Should return 404 for non-existent lease."""
        table_tracker.lease_data = None

        missing_id = uuid4()
        payload = {"pro_rata_share": "0.10"}

        response = authenticated_client.put(
            f"/api/v1/leases/{missing_id}/recovery-profile",
            json=payload,
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_recovery_profile_validates_merged(
        self, authenticated_client, table_tracker
    ):
        """Should validate merged profile (cap_rate required with cap_type)."""
        existing_lease = create_sample_lease()
        existing_lease["recovery_profile"]["cap_type"] = "none"
        existing_lease["recovery_profile"]["cap_rate"] = None
        table_tracker.lease_data = existing_lease

        # Try to set cap_type without cap_rate
        payload = {"cap_type": "cumulative"}

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}/recovery-profile",
            json=payload,
        )

        # Should fail validation because merged profile has cap_type=cumulative but no cap_rate
        assert response.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class TestDeleteLease:
    """Tests for DELETE /api/v1/leases/{lease_id} endpoint."""

    def test_delete_lease_admin_success(self, admin_client, table_tracker):
        """Should delete lease when admin."""
        deleted_lease = create_sample_lease()
        table_tracker.lease_data = [deleted_lease]

        response = admin_client.delete(f"/api/v1/leases/{SAMPLE_LEASE_ID}")

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_lease_not_found(self, admin_client, table_tracker):
        """Should return 404 for non-existent lease."""
        table_tracker.lease_data = []

        missing_id = uuid4()
        response = admin_client.delete(f"/api/v1/leases/{missing_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_lease_member_forbidden(self, authenticated_client, table_tracker):
        """Should return 403 for non-admin user."""
        # authenticated_client has member role, not admin
        response = authenticated_client.delete(f"/api/v1/leases/{SAMPLE_LEASE_ID}")

        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestLeaseSchemas:
    """Tests for lease schema validation."""

    def test_lease_list_response_schema(self):
        """Should validate LeaseListResponse schema."""
        from app.schemas.lease import LeaseListResponse

        response = LeaseListResponse(
            data=[],
            count=0,
            has_more=False,
        )

        assert response.count == 0
        assert response.has_more is False
        assert response.data == []

    def test_lease_create_date_validation(self):
        """Should validate end_date > start_date."""
        from app.schemas.lease import LeaseCreate

        with pytest.raises(ValueError, match="End date must be after start date"):
            LeaseCreate(
                property_id=uuid4(),
                tenant_name="Test",
                start_date=date(2024, 1, 1),
                end_date=date(2023, 1, 1),  # Before start
                recovery_profile={
                    "pro_rata_share": Decimal("0.05"),
                },
            )

    def test_lease_create_valid(self):
        """Should create valid LeaseCreate."""
        from app.schemas.lease import LeaseCreate

        lease = LeaseCreate(
            property_id=uuid4(),
            tenant_name="Test Corp",
            start_date=date(2024, 1, 1),
            end_date=date(2029, 1, 1),
            recovery_profile={
                "pro_rata_share": Decimal("0.05"),
            },
        )

        assert lease.tenant_name == "Test Corp"
        assert lease.start_date == date(2024, 1, 1)

    def test_recovery_profile_cap_validation(self):
        """Should validate cap_rate required when cap_type is not none."""
        from app.schemas.lease import LeaseRecoveryProfile

        with pytest.raises(ValueError, match="cap_rate is required"):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                cap_type="cumulative",
                # cap_rate missing
            )

    def test_recovery_profile_valid_with_cap(self):
        """Should allow valid cap configuration."""
        from app.schemas.lease import LeaseRecoveryProfile

        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.05"),
            cap_type="cumulative",
            cap_rate=Decimal("0.05"),
        )

        assert profile.cap_type.value == "cumulative"
        assert profile.cap_rate == Decimal("0.05")


class TestEndpointRouting:
    """Tests for endpoint routing and HTTP methods."""

    def test_leases_base_route(self, authenticated_client, table_tracker):
        """Should handle GET on base route."""
        table_tracker.lease_data = []
        table_tracker.lease_count = 0

        response = authenticated_client.get("/api/v1/leases")
        assert response.status_code == status.HTTP_200_OK

    def test_leases_post_route(self, authenticated_client, table_tracker):
        """Should handle POST on base route."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.lease_data = [create_sample_lease()]

        response = authenticated_client.post(
            "/api/v1/leases",
            json={
                "property_id": str(SAMPLE_PROPERTY_ID),
                "tenant_name": "Test",
                "start_date": "2024-01-01",
                "end_date": "2029-01-01",
                "recovery_profile": {"pro_rata_share": "0.05"},
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_leases_id_route(self, authenticated_client, table_tracker):
        """Should handle GET on ID route."""
        table_tracker.lease_data = create_sample_lease()

        response = authenticated_client.get(f"/api/v1/leases/{SAMPLE_LEASE_ID}")
        assert response.status_code == status.HTTP_200_OK

    def test_leases_put_route(self, authenticated_client, table_tracker):
        """Should handle PUT on ID route."""
        table_tracker.lease_data = [create_sample_lease()]

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}",
            json={"tenant_name": "Updated"},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_recovery_profile_get_route(self, authenticated_client, table_tracker):
        """Should handle GET on recovery-profile route."""
        table_tracker.lease_data = create_sample_lease()

        response = authenticated_client.get(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}/recovery-profile"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_recovery_profile_put_route(self, authenticated_client, table_tracker):
        """Should handle PUT on recovery-profile route."""
        existing_lease = create_sample_lease()
        table_tracker.lease_data = existing_lease

        updated_lease = create_sample_lease()
        table_tracker.lease_data = [updated_lease]

        response = authenticated_client.put(
            f"/api/v1/leases/{SAMPLE_LEASE_ID}/recovery-profile",
            json={"admin_fee_percentage": "0.10"},
        )
        assert response.status_code == status.HTTP_200_OK


class TestJsonResponse:
    """Tests for JSON response format."""

    def test_list_response_json_format(self, authenticated_client, table_tracker):
        """Should return proper JSON structure for list."""
        leases = [create_sample_lease()]
        table_tracker.lease_data = leases
        table_tracker.lease_count = 1

        response = authenticated_client.get("/api/v1/leases")

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert isinstance(data["data"], list)
        assert isinstance(data["count"], int)
        assert isinstance(data["has_more"], bool)

    def test_single_response_json_format(self, authenticated_client, table_tracker):
        """Should return proper JSON structure for single lease."""
        table_tracker.lease_data = create_sample_lease()

        response = authenticated_client.get(f"/api/v1/leases/{SAMPLE_LEASE_ID}")

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert "id" in data
        assert "tenant_name" in data
        assert "recovery_profile" in data

    def test_error_response_json_format(self, authenticated_client, table_tracker):
        """Should return proper JSON structure for errors."""
        table_tracker.lease_data = None

        response = authenticated_client.get(f"/api/v1/leases/{uuid4()}")

        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert "status_code" in data
        assert "message" in data


class TestPropertyUnitValidation:
    """Tests for property and unit validation."""

    def test_create_lease_validates_property(self, authenticated_client, table_tracker):
        """Should validate property exists before creating lease."""
        table_tracker.property_data = None  # Property not found

        payload = {
            "property_id": str(uuid4()),
            "tenant_name": "Test",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {"pro_rata_share": "0.05"},
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Property" in response.json()["message"]

    def test_create_lease_validates_unit_belongs_to_property(
        self, authenticated_client, table_tracker
    ):
        """Should validate unit belongs to the specified property."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}
        table_tracker.unit_data = None  # Unit not found in this property

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "unit_id": str(uuid4()),  # Unit from different property
            "tenant_name": "Test",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": {"pro_rata_share": "0.05"},
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Unit" in response.json()["message"]


class TestRecoveryProfileJSONB:
    """Tests for recovery profile JSONB handling."""

    def test_recovery_profile_stored_as_jsonb(
        self, authenticated_client, table_tracker
    ):
        """Should properly serialize recovery profile."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        recovery_profile = {
            "base_year": 2024,
            "pro_rata_share": "0.05",
            "cap_type": "none",
            "admin_fee_percentage": "0.15",
            "excluded_pools": [],
        }

        created_lease = create_sample_lease()
        created_lease["recovery_profile"] = recovery_profile
        table_tracker.lease_data = [created_lease]

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "tenant_name": "Test",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": recovery_profile,
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["recovery_profile"]["base_year"] == 2024

    def test_recovery_profile_with_excluded_pools(
        self, authenticated_client, table_tracker
    ):
        """Should handle excluded_pools array in recovery profile."""
        table_tracker.property_data = {"id": str(SAMPLE_PROPERTY_ID)}

        # PoolType enum values are: operating, tax, insurance, capital, other
        recovery_profile = {
            "pro_rata_share": "0.05",
            "excluded_pools": ["tax", "insurance"],
        }

        created_lease = create_sample_lease()
        created_lease["recovery_profile"]["excluded_pools"] = ["tax", "insurance"]
        table_tracker.lease_data = [created_lease]

        payload = {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "tenant_name": "Test",
            "start_date": "2024-01-01",
            "end_date": "2029-01-01",
            "recovery_profile": recovery_profile,
        }

        response = authenticated_client.post("/api/v1/leases", json=payload)

        assert response.status_code == status.HTTP_201_CREATED
