"""Tests for Dashboard API endpoint.

Tests cover the landlord dashboard summary endpoint including:
- Aggregate counts (properties, units, leases)
- Pending verifications count
- Recent activity feed
- Alert generation
- Empty organization handling
- Authentication requirements
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1.dashboard import router
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


def create_test_user(
    user_id=SAMPLE_USER_ID,
    org_id=SAMPLE_ORG_ID,
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


class MockSupabaseResponse:
    """Mock Supabase response object."""

    def __init__(self, data=None, count=None):
        self.data = data if data is not None else []
        self.count = count


class MockQueryBuilder:
    """Mock Supabase query builder for chaining."""

    def __init__(self, data=None, count=None):
        self._data = data if data is not None else []
        self._count = count
        self._range_start = None
        self._range_end = None

    def select(self, *args, **kwargs):
        return self

    def eq(self, field, value):
        return self

    def order(self, field, desc=False):
        return self

    def limit(self, n):
        return self

    def range(self, start, end):
        self._range_start = start
        self._range_end = end
        return self

    def execute(self):
        data = self._data
        if self._range_start is not None:
            data = data[self._range_start : self._range_end + 1]
        return MockSupabaseResponse(data, self._count)


class MockTableDispatcher:
    """Mock table dispatcher that returns different data per table."""

    def __init__(self, table_data: dict):
        """
        Args:
            table_data: Dict mapping table names to (data, count) tuples
        """
        self._table_data = table_data

    def __call__(self, table_name: str):
        data, count = self._table_data.get(table_name, ([], 0))
        return MockQueryBuilder(data, count)


@pytest.fixture
def app():
    """Create test FastAPI app with dashboard router."""
    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    app.include_router(router, prefix="/api/v1/dashboard", tags=["Dashboard"])
    return app


@pytest.fixture
def mock_supabase():
    """Create mock Supabase client."""
    return MagicMock()


@pytest.fixture
def authenticated_client(app, mock_supabase):
    """Create test client with authenticated user."""
    test_user = create_test_user()

    def mock_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=SAMPLE_ORG_ID,
            user=test_user,
        )

    app.dependency_overrides[get_org_scoped_context] = mock_org_context
    return TestClient(app)


class TestGetDashboardSummary:
    """Tests for GET /api/v1/dashboard endpoint."""

    def test_dashboard_returns_all_counts(self, authenticated_client, mock_supabase):
        """Should return counts for properties, units, and leases."""
        # Setup mock to return different counts per table
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 5),
                "units": ([], 12),
                "leases": ([], 8),
                "gl_entries": ([], 42),
                "documents": ([], 2),
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["property_count"] == 5
        assert data["unit_count"] == 12
        assert data["lease_count"] == 8
        assert data["gl_entry_count"] == 42
        assert data["pending_verifications"] == 2

    def test_dashboard_gl_entry_count_zero_when_no_gl_uploaded(
        self, authenticated_client, mock_supabase
    ):
        """Should report gl_entry_count=0 when no GL entries exist."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 1),
                "units": ([], 1),
                "leases": ([], 1),
                "documents": ([], 0),
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["gl_entry_count"] == 0

    def test_dashboard_empty_organization(self, authenticated_client, mock_supabase):
        """Should return zeros for new organization with no data."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 0),
                "units": ([], 0),
                "leases": ([], 0),
                "documents": ([], 0),
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["property_count"] == 0
        assert data["unit_count"] == 0
        assert data["lease_count"] == 0
        assert data["pending_verifications"] == 0
        assert data["recent_activity"] == []

    def test_dashboard_includes_add_property_alert_when_empty(
        self, authenticated_client, mock_supabase
    ):
        """Should include 'add first property' alert when no properties exist."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 0),
                "units": ([], 0),
                "leases": ([], 0),
                "documents": ([], 0),
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        alerts = data["alerts"]
        assert len(alerts) >= 1
        assert any(a["id"] == "no-properties" for a in alerts)

    def test_dashboard_includes_verification_alert_when_pending(
        self, authenticated_client, mock_supabase
    ):
        """Should include verification alert when documents need review."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 1),
                "units": ([], 2),
                "leases": ([], 1),
                "documents": ([], 3),
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        alerts = data["alerts"]
        verification_alert = next(
            (a for a in alerts if a["id"] == "pending-verifications"), None
        )
        assert verification_alert is not None
        assert verification_alert["count"] == 3

    def test_dashboard_no_alerts_when_all_good(
        self, authenticated_client, mock_supabase
    ):
        """Should return no alerts when organization has data and no pending items."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 3),
                "units": ([], 10),
                "leases": ([], 5),
                "documents": ([], 0),  # No pending verifications
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["alerts"] == []

    def test_dashboard_recent_activity_format(
        self, authenticated_client, mock_supabase
    ):
        """Should return recent activity with correct format."""
        property_id = str(uuid4())
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": (
                    [
                        {
                            "id": property_id,
                            "name": "Test Property",
                            "created_at": "2024-01-15T10:30:00Z",
                        }
                    ],
                    1,
                ),
                "units": ([], 0),
                "leases": ([], 0),
                "documents": ([], 0),
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        activities = data["recent_activity"]
        assert len(activities) == 1
        assert activities[0]["type"] == "property"
        assert activities[0]["title"] == "Property added"
        assert activities[0]["description"] == "Test Property"
        assert activities[0]["href"] == f"/properties/{property_id}"

    def test_dashboard_counts_draft_snapshots_as_pending_reconciliations(
        self, authenticated_client, mock_supabase
    ):
        """pending_reconciliations reflects draft reconciliation snapshot count."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 3),
                "units": ([], 10),
                "leases": ([], 5),
                "documents": ([], 0),
                "reconciliation_snapshots": ([], 4),  # 4 drafts
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == 200
        assert response.json()["pending_reconciliations"] == 4

    def test_dashboard_response_schema(self, authenticated_client, mock_supabase):
        """Should return response matching DashboardSummary schema."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 1),
                "units": ([], 2),
                "leases": ([], 1),
                "documents": ([], 0),
            }
        )

        response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Verify all expected fields exist
        assert "property_count" in data
        assert "unit_count" in data
        assert "lease_count" in data
        assert "gl_entry_count" in data
        assert "pending_reconciliations" in data
        assert "pending_verifications" in data
        assert "recent_activity" in data
        assert "alerts" in data

        # Verify types
        assert isinstance(data["property_count"], int)
        assert isinstance(data["recent_activity"], list)
        assert isinstance(data["alerts"], list)

    def test_dashboard_includes_total_recovery_finalized(
        self, authenticated_client, mock_supabase
    ):
        """total_recovery_finalized sums total_recovery from finalized snapshots."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 1),
                "units": ([], 2),
                "leases": ([], 1),
                "documents": ([], 0),
                "reconciliation_snapshots": ([], 0),
            }
        )

        from unittest.mock import patch

        mock_admin = MagicMock()
        mock_admin.table = MockTableDispatcher(
            {
                "reconciliation_snapshots": (
                    [{"total_recovery": 50000}, {"total_recovery": 75000}],
                    2,
                )
            }
        )

        with patch(
            "app.api.v1.dashboard.get_supabase_admin",
            return_value=mock_admin,
        ):
            response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == 200
        data = response.json()
        assert "total_recovery_finalized" in data
        assert float(data["total_recovery_finalized"]) == 125000.0

    def test_dashboard_total_recovery_includes_page_two(
        self, authenticated_client, mock_supabase
    ):
        """total_recovery_finalized includes finalized snapshots past page one."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 1),
                "units": ([], 2),
                "leases": ([], 1),
                "documents": ([], 0),
                "reconciliation_snapshots": ([], 0),
            }
        )

        from unittest.mock import patch

        mock_admin = MagicMock()
        mock_admin.table = MockTableDispatcher(
            {
                "reconciliation_snapshots": (
                    [{"total_recovery": 1} for _ in range(1000)]
                    + [{"total_recovery": 25}],
                    1001,
                )
            }
        )

        with patch(
            "app.api.v1.dashboard.get_supabase_admin",
            return_value=mock_admin,
        ):
            response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == 200
        assert float(response.json()["total_recovery_finalized"]) == 1025.0

    def test_dashboard_total_recovery_defaults_to_zero_on_error(
        self, authenticated_client, mock_supabase
    ):
        """total_recovery_finalized defaults to 0 when admin query fails."""
        mock_supabase.table = MockTableDispatcher(
            {
                "properties": ([], 1),
                "units": ([], 2),
                "leases": ([], 1),
                "documents": ([], 0),
                "reconciliation_snapshots": ([], 0),
            }
        )

        from unittest.mock import patch

        with patch(
            "app.api.v1.dashboard.get_supabase_admin",
            side_effect=Exception("connection failed"),
        ):
            response = authenticated_client.get("/api/v1/dashboard")

        assert response.status_code == 200
        assert float(response.json()["total_recovery_finalized"]) == 0.0


class TestDashboardSchemas:
    """Tests for dashboard schema validation."""

    def test_activity_item_schema(self):
        """Should validate ActivityItem schema."""
        from app.schemas.dashboard import ActivityItem

        activity = ActivityItem(
            id=uuid4(),
            type="property_created",
            title="Property added",
            description="Test Property",
            timestamp=datetime.now(UTC),
            href="/properties/123",
        )

        assert activity.type == "property_created"
        assert activity.href == "/properties/123"

    def test_alert_item_schema(self):
        """Should validate AlertItem schema."""
        from app.schemas.dashboard import AlertItem

        alert = AlertItem(
            id="test-alert",
            type="warning",
            title="Test Alert",
            description="This is a test",
            href="/test",
            count=5,
        )

        assert alert.type == "warning"
        assert alert.count == 5

    def test_alert_item_optional_count(self):
        """Should allow AlertItem without count."""
        from app.schemas.dashboard import AlertItem

        alert = AlertItem(
            id="test-alert",
            type="action",
            title="Test Alert",
            description="This is a test",
            href="/test",
        )

        assert alert.count is None

    def test_dashboard_summary_schema(self):
        """Should validate DashboardSummary schema."""
        from app.schemas.dashboard import DashboardSummary

        summary = DashboardSummary(
            property_count=5,
            unit_count=10,
            lease_count=8,
            gl_entry_count=12,
            pending_reconciliations=0,
            pending_verifications=2,
            recent_activity=[],
            alerts=[],
        )

        assert summary.property_count == 5
        assert summary.pending_verifications == 2

    def test_dashboard_summary_rejects_negative_counts(self):
        """Should reject negative counts in DashboardSummary."""
        from pydantic import ValidationError

        from app.schemas.dashboard import DashboardSummary

        with pytest.raises(ValidationError):
            DashboardSummary(
                property_count=-1,  # Invalid
                unit_count=0,
                lease_count=0,
                pending_reconciliations=0,
                pending_verifications=0,
            )

    def test_dashboard_summary_default_lists(self):
        """Should default to empty lists for activity and alerts."""
        from app.schemas.dashboard import DashboardSummary

        summary = DashboardSummary(
            property_count=0,
            unit_count=0,
            lease_count=0,
            gl_entry_count=0,
            pending_reconciliations=0,
            pending_verifications=0,
        )

        assert summary.recent_activity == []
        assert summary.alerts == []


class TestDashboardSB1103Alerts:
    """Tests for SB 1103 deadline alerts in the dashboard."""

    def test_sb1103_alert_appears_when_approaching_deadline(self):
        """SB 1103 requests near deadline should appear as dashboard alerts."""
        from datetime import date, timedelta
        from unittest.mock import patch

        from app.api.v1.dashboard import _build_alerts
        from app.models.sb1103 import SB1103DeadlineAlert

        ctx = MagicMock()
        alert = SB1103DeadlineAlert(
            request_id=uuid4(),
            property_id=uuid4(),
            property_name="Downtown Tower",
            tenant_name="Acme Corp",
            response_deadline=date.today() + timedelta(days=5),
            days_remaining=5,
            status="pending",
        )

        with patch(
            "app.api.v1.dashboard.get_deadline_alerts",
            return_value=[alert],
        ):
            alerts = _build_alerts(
                property_count=1,
                pending_verifications=0,
                ctx=ctx,
            )

        sb1103_alert = next((a for a in alerts if "sb1103" in a.id), None)
        assert sb1103_alert is not None
        assert sb1103_alert.type == "warning"
        assert "Acme Corp" in sb1103_alert.description
        assert "Downtown Tower" in sb1103_alert.description

    def test_sb1103_overdue_alert_mentions_rescission(self):
        """Overdue SB 1103 requests should warn about lease rescission."""
        from datetime import date, timedelta
        from unittest.mock import patch

        from app.api.v1.dashboard import _build_alerts
        from app.models.sb1103 import SB1103DeadlineAlert

        ctx = MagicMock()
        alert = SB1103DeadlineAlert(
            request_id=uuid4(),
            property_id=uuid4(),
            property_name="Downtown Tower",
            tenant_name="Acme Corp",
            response_deadline=date.today() - timedelta(days=3),
            days_remaining=-3,
            status="overdue",
        )

        with patch(
            "app.api.v1.dashboard.get_deadline_alerts",
            return_value=[alert],
        ):
            alerts = _build_alerts(
                property_count=1,
                pending_verifications=0,
                ctx=ctx,
            )

        sb1103_alert = next((a for a in alerts if "sb1103" in a.id), None)
        assert sb1103_alert is not None
        assert "rescind" in sb1103_alert.description.lower()

    def test_sb1103_alert_not_present_when_no_deadlines(self):
        """No SB 1103 alerts when there are no approaching deadlines."""
        from unittest.mock import patch

        from app.api.v1.dashboard import _build_alerts

        ctx = MagicMock()

        with patch(
            "app.api.v1.dashboard.get_deadline_alerts",
            return_value=[],
        ):
            alerts = _build_alerts(
                property_count=1,
                pending_verifications=0,
                ctx=ctx,
            )

        sb1103_alerts = [a for a in alerts if "sb1103" in a.id]
        assert sb1103_alerts == []
