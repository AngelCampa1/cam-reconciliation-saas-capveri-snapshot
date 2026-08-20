"""Tests for lease term version API endpoints."""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1.lease_term_versions import router
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

SAMPLE_ORG_ID = uuid4()
SAMPLE_USER_ID = uuid4()
SAMPLE_LEASE_ID = uuid4()
SAMPLE_VERSION_ID = uuid4()


def create_test_user(role: str = "member") -> User:
    return User(
        id=SAMPLE_USER_ID,
        organization_id=SAMPLE_ORG_ID,
        email="test@example.com",
        full_name="Test User",
        role=role,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def create_sample_version_row(
    version_id: UUID = SAMPLE_VERSION_ID,
    lease_id: UUID = SAMPLE_LEASE_ID,
    version_number: int = 1,
) -> dict:
    return {
        "id": str(version_id),
        "lease_id": str(lease_id),
        "version_number": version_number,
        "effective_date": "2025-01-01",
        "base_year": 2024,
        "base_year_amount": "50000.00",
        "gross_up_base_year": False,
        "pro_rata_share": "0.05000000",
        "cap_type": "non_cumulative",
        "cap_rate": "0.05000000",
        "admin_fee_percentage": "0.15000000",
        "excluded_pools": [],
        "rsf_measurement_standard": None,
        "rsf_measurement_date": None,
        "amendment_reason": "Initial terms",
        "amendment_document_url": None,
        "created_by": str(SAMPLE_USER_ID),
        "created_at": "2025-01-01T00:00:00+00:00",
    }


@pytest.fixture
def mock_supabase():
    return MagicMock()


@pytest.fixture
def client(mock_supabase):
    app = FastAPI()
    app.include_router(router, prefix="/leases")
    register_exception_handlers(app)
    register_custom_exception_handlers(app)

    mock_user = create_test_user()
    mock_ctx = OrganizationContext(
        user=mock_user,
        organization_id=SAMPLE_ORG_ID,
        client=mock_supabase,
    )

    app.dependency_overrides[get_org_scoped_context] = lambda: mock_ctx
    app.dependency_overrides[get_current_admin_user] = lambda: mock_user

    return TestClient(app)


class TestListVersions:
    """GET /leases/{id}/term-versions"""

    def test_returns_versions(self, client, mock_supabase):
        """Lists all versions for a lease."""
        mock_result = MagicMock()
        mock_result.data = [create_sample_version_row()]
        (
            mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        ) = mock_result

        response = client.get(f"/leases/{SAMPLE_LEASE_ID}/term-versions")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["version_number"] == 1

    def test_empty_list(self, client, mock_supabase):
        """No versions → empty list."""
        mock_result = MagicMock()
        mock_result.data = []
        (
            mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        ) = mock_result

        response = client.get(f"/leases/{SAMPLE_LEASE_ID}/term-versions")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []


class TestGetEffective:
    """GET /leases/{id}/term-versions/effective?as_of=DATE"""

    def test_returns_effective_version(self, client, mock_supabase):
        """Returns the version effective on a given date."""
        mock_result = MagicMock()
        mock_result.data = [create_sample_version_row()]
        (
            mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value
        ) = mock_result

        response = client.get(
            f"/leases/{SAMPLE_LEASE_ID}/term-versions/effective",
            params={"as_of": "2025-06-15"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["version_number"] == 1

    def test_returns_404_when_none_effective(self, client, mock_supabase):
        """Returns 404 when no version is effective on the given date."""
        mock_result = MagicMock()
        mock_result.data = []
        (
            mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value
        ) = mock_result

        response = client.get(
            f"/leases/{SAMPLE_LEASE_ID}/term-versions/effective",
            params={"as_of": "2020-01-01"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestCreateVersion:
    """POST /leases/{id}/term-versions"""

    def test_creates_version(self, client, mock_supabase):
        """Creates a new term version."""
        # Mock: max version number
        max_result = MagicMock()
        max_result.data = [{"version_number": 1}]
        (
            mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value
        ) = max_result

        # Mock: insert
        new_row = create_sample_version_row(version_number=2)
        insert_result = MagicMock()
        insert_result.data = [new_row]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = (
            insert_result
        )

        response = client.post(
            f"/leases/{SAMPLE_LEASE_ID}/term-versions",
            json={
                "effective_date": "2025-07-01",
                "pro_rata_share": "0.08",
                "cap_type": "none",
                "amendment_reason": "Expansion",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["amendment_reason"] == "Initial terms"


class TestDeleteVersion:
    """DELETE /leases/{id}/term-versions/{vid}"""

    def test_delete_blocked_by_finalized(self, client, mock_supabase):
        """Cannot delete a version referenced by finalized snapshots."""
        # Mock: version exists
        version_result = MagicMock()
        version_result.data = [create_sample_version_row()]

        # Mock: finalized snapshots
        snap_result = MagicMock()
        snap_result.data = [{"id": str(uuid4())}]

        table_mock = MagicMock()
        mock_supabase.table.return_value = table_mock
        select_chain = MagicMock()
        table_mock.select.return_value = select_chain
        eq_chain = MagicMock()
        select_chain.eq.return_value = eq_chain
        eq_chain.execute.return_value = version_result
        eq_chain2 = MagicMock()
        eq_chain.eq.return_value = eq_chain2
        eq_chain2.execute.return_value = snap_result

        response = client.delete(
            f"/leases/{SAMPLE_LEASE_ID}/term-versions/{SAMPLE_VERSION_ID}"
        )

        assert response.status_code == status.HTTP_409_CONFLICT
