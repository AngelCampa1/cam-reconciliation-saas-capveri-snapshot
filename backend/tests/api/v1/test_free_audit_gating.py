"""
Tests for the subscription gate in the reconciliation /calculate endpoint.

The legacy "free first audit" model is retired. Running a reconciliation now
requires full access (an active/trialing subscription or a purchased credit
pack). An expired card-less trial resolves to "paused" inside
``has_full_access`` and is locked out.

Contract for POST /api/v1/reconciliation/calculate:
- 404 when the property does not exist / is not in the org
- 402 "subscription_required" when ``has_full_access`` is False
- 422 "no_active_leases_for_period" when no active leases for the period
- 202 accepted when full access + at least one active lease

The autouse ``grant_full_access_by_default`` fixture patches ``has_full_access``
to True for the suite, so the happy-path tests get full access without DB
setup; the lock-out test patches it back to False explicitly.
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    OrganizationContext,
    get_current_user,
    get_org_scoped_context,
)
from app.main import app
from app.models.enums import UserRole
from app.models.user import User


@pytest.fixture
def test_org_id():
    return uuid4()


@pytest.fixture
def test_property_id():
    return uuid4()


@pytest.fixture
def test_user(test_org_id):
    return User(
        id=uuid4(),
        email="landlord@example.com",
        organization_id=test_org_id,
        role=UserRole.ADMIN,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def mock_supabase():
    return MagicMock()


@pytest.fixture
def test_client(test_user, test_org_id, mock_supabase):
    """Create test client with dependency overrides."""

    async def mock_get_user():
        return test_user

    async def mock_get_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=test_org_id,
            user=test_user,
        )

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context

    # raise_server_exceptions=False so background task failures don't leak
    # into gating logic tests (background task has its own error handling)
    client = TestClient(app, raise_server_exceptions=False)
    client.mock_supabase = mock_supabase

    yield client

    app.dependency_overrides.clear()


def _setup_property_exists(mock_supabase, property_id: UUID):
    """Configure mock to return property exists."""
    property_mock = MagicMock()
    property_mock.data = {"id": str(property_id)}
    mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        property_mock
    )


def _make_calculate_payload(property_id: UUID) -> dict:
    return {
        "property_id": str(property_id),
        "period_start": "2024-01-01",
        "period_end": "2024-12-31",
        "force_recalculate": False,
    }


class TestReconciliationSubscriptionGate:
    """Tests for the subscription gate in /calculate (free-audit retired)."""

    def test_calculate_returns_404_when_property_missing(
        self, test_client, test_property_id, mock_supabase
    ):
        """Unknown / cross-org property → 404 before any gate runs."""
        property_mock = MagicMock()
        property_mock.data = None
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            property_mock
        )

        response = test_client.post(
            "/api/v1/reconciliation/calculate",
            json=_make_calculate_payload(test_property_id),
        )

        assert response.status_code == 404

    @patch("app.api.v1.reconciliation.has_full_access", return_value=False)
    def test_calculate_blocked_without_full_access(
        self, _mock_has_full_access, test_client, test_property_id, mock_supabase
    ):
        """
        Property exists but the org lacks full access (expired/paused trial,
        no subscription) → 402 ``subscription_required``.
        """
        _setup_property_exists(mock_supabase, test_property_id)

        response = test_client.post(
            "/api/v1/reconciliation/calculate",
            json=_make_calculate_payload(test_property_id),
        )

        assert response.status_code == 402
        assert "subscription_required" in response.json()["detail"]

    @patch("app.api.v1.reconciliation.fetch_active_leases", return_value=[])
    def test_calculate_returns_422_when_no_active_leases(
        self, _mock_fetch_active_leases, test_client, test_property_id, mock_supabase
    ):
        """Full access (autouse) but no active leases for the period → 422."""
        _setup_property_exists(mock_supabase, test_property_id)

        response = test_client.post(
            "/api/v1/reconciliation/calculate",
            json=_make_calculate_payload(test_property_id),
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "no_active_leases_for_period"

    @patch("app.api.v1.reconciliation.fetch_active_leases", return_value=[object()])
    def test_calculate_accepted_with_full_access_and_active_leases(
        self, _mock_fetch_active_leases, test_client, test_property_id, mock_supabase
    ):
        """Full access (autouse) + at least one active lease → 202 accepted."""
        job_id = uuid4()

        def table_side_effect(table_name):
            t = MagicMock()
            if table_name == "properties":
                m = MagicMock()
                m.data = {"id": str(test_property_id)}
                t.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
                    m
                )
            elif table_name == "calculation_jobs":
                m_insert = MagicMock()
                m_insert.data = [{"id": str(job_id)}]
                t.insert.return_value.execute.return_value = m_insert
            return t

        mock_supabase.table.side_effect = table_side_effect

        response = test_client.post(
            "/api/v1/reconciliation/calculate",
            json=_make_calculate_payload(test_property_id),
        )

        assert response.status_code == 202


class TestJobStatusRecoveryTotal:
    """Tests for potential_recovery_total in job status response."""

    def test_job_response_includes_recovery_total_when_completed(
        self, test_client, mock_supabase
    ):
        """
        Completed job → potential_recovery_total summed from snapshots.
        """
        job_id = uuid4()
        snapshot_id_1 = uuid4()
        snapshot_id_2 = uuid4()

        def table_side_effect(table_name):
            t = MagicMock()
            if table_name == "calculation_jobs":
                m = MagicMock()
                m.data = {
                    "id": str(job_id),
                    "organization_id": str(uuid4()),
                    "property_id": str(uuid4()),
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "status": "completed",
                    "force_recalculate": False,
                    "total_leases": 2,
                    "processed_leases": 2,
                    "snapshot_ids": [str(snapshot_id_1), str(snapshot_id_2)],
                    "error_message": None,
                    "created_at": "2024-01-01T00:00:00",
                    "started_at": "2024-01-01T00:00:01",
                    "completed_at": "2024-01-01T00:01:00",
                }
                t.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
                    m
                )
            elif table_name == "reconciliation_snapshots":
                m = MagicMock()
                m.data = [
                    {"total_recovery": "12500.00"},
                    {"total_recovery": "8750.50"},
                ]
                t.select.return_value.in_.return_value.execute.return_value = m
            return t

        mock_supabase.table.side_effect = table_side_effect

        response = test_client.get(f"/api/v1/reconciliation/jobs/{job_id}")

        assert response.status_code == 200
        body = response.json()
        assert "potential_recovery_total" in body
        # 12500.00 + 8750.50 = 21250.50
        assert float(body["potential_recovery_total"]) == pytest.approx(21250.50)

    def test_job_response_recovery_total_none_when_pending(
        self, test_client, mock_supabase
    ):
        """
        Pending job → potential_recovery_total is None/absent.
        """
        job_id = uuid4()

        def table_side_effect(table_name):
            t = MagicMock()
            if table_name == "calculation_jobs":
                m = MagicMock()
                m.data = {
                    "id": str(job_id),
                    "organization_id": str(uuid4()),
                    "property_id": str(uuid4()),
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "status": "pending",
                    "force_recalculate": False,
                    "total_leases": None,
                    "processed_leases": 0,
                    "snapshot_ids": [],
                    "error_message": None,
                    "created_at": "2024-01-01T00:00:00",
                    "started_at": None,
                    "completed_at": None,
                }
                t.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
                    m
                )
            return t

        mock_supabase.table.side_effect = table_side_effect

        response = test_client.get(f"/api/v1/reconciliation/jobs/{job_id}")

        assert response.status_code == 200
        body = response.json()
        assert body.get("potential_recovery_total") is None
