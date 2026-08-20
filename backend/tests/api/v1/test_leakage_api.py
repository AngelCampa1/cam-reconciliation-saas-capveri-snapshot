"""Tests for leakage API endpoints."""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.main import app
from app.models.enums import UserRole
from app.models.user import User


class PagedQuery:
    def __init__(self, table_name, rows_by_table, recorded_queries=None):
        self.table_name = table_name
        self.rows_by_table = rows_by_table
        self.recorded_queries = recorded_queries
        self.eq_calls = []
        self.in_calls = []
        self._range_start = None
        self._range_end = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        self.eq_calls.append((field, value))
        return self

    def in_(self, field, values):
        self.in_calls.append((field, values))
        return self

    def range(self, start, end):
        self._range_start = start
        self._range_end = end
        return self

    def execute(self):
        if (
            self.recorded_queries is not None
            and self.table_name == "reconciliation_snapshots"
        ):
            self.recorded_queries.append(self)
        rows = self.rows_by_table.get(self.table_name, [])
        response = MagicMock()
        if self._range_start is None or self._range_end is None:
            response.data = rows
        else:
            response.data = rows[self._range_start : self._range_end + 1]
        return response


def paged_table(rows_by_table, recorded_queries=None):
    return lambda table_name: PagedQuery(table_name, rows_by_table, recorded_queries)


@pytest.fixture
def test_org_id():
    """Test organization ID."""
    return uuid4()


@pytest.fixture
def test_user(test_org_id):
    """Test regular user."""
    return User(
        id=uuid4(),
        email="user@example.com",
        organization_id=test_org_id,
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def mock_db_client():
    """Mock Supabase client for this test module."""
    return MagicMock()


@pytest.fixture
def test_client(test_user, mock_db_client):
    """Create test client with user dependency overrides."""
    from app.database.client import get_supabase, get_supabase_admin

    mock_supabase_admin = MagicMock()

    async def mock_get_user():
        return test_user

    def mock_get_db():
        return mock_db_client

    def mock_get_admin_db():
        return mock_supabase_admin

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_supabase] = mock_get_db
    app.dependency_overrides[get_supabase_admin] = mock_get_admin_db

    client = TestClient(app)
    client.mock_db = mock_db_client
    client.mock_supabase_admin = mock_supabase_admin
    yield client

    app.dependency_overrides.clear()


class TestGetLeakageSummary:
    """Tests for GET /api/v1/leakage/summary endpoint."""

    def test_returns_org_wide_recovery_opportunity(self, test_client, test_org_id):
        """Should return total recovery opportunity across all properties."""
        property1_id = uuid4()
        property2_id = uuid4()

        properties = [
            {"id": str(property1_id), "name": "Property 1"},
            {"id": str(property2_id), "name": "Property 2"},
        ]

        snapshots = [
            {
                "property_id": str(property1_id),
                "total_recovery": 50000,
                "status": "finalized",
            },
            {
                "property_id": str(property2_id),
                "total_recovery": 75000,
                "status": "finalized",
            },
        ]

        billed = [
            {
                "property_id": str(property1_id),
                "billed_amount": 40000,
            },
            {
                "property_id": str(property2_id),
                "billed_amount": 60000,
            },
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": properties,
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": billed,
            }
        )

        with patch(
            "app.api.v1.leakage.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/leakage/summary")

        assert response.status_code == 200
        data = response.json()

        # Property 1: 50000 - 40000 = 10000 leakage
        # Property 2: 75000 - 60000 = 15000 leakage
        # Total leakage = 25000
        # Note: Decimal is serialized as string in JSON
        assert Decimal(data["total_recovery_opportunity"]) == Decimal("25000")
        assert data["properties_with_leakage"] == 2
        assert data["has_billing_data"] is True
        assert "total_confirmed_recovery" not in data
        assert "pending_claims_amount" not in data

    def test_returns_zero_when_no_leakage(self, test_client, test_org_id):
        """Should return zero recovery opportunity when billing equals calculated."""
        property_id = uuid4()

        snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": 50000,
                "status": "finalized",
            }
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Property 1"}],
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": [
                    {"property_id": str(property_id), "billed_amount": 50000}
                ],
            }
        )

        with patch(
            "app.api.v1.leakage.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/leakage/summary")

        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["total_recovery_opportunity"]) == Decimal("0")
        assert data["properties_with_leakage"] == 0

    def test_returns_no_billing_data_flag_when_empty(self, test_client, test_org_id):
        """Should indicate when no billing data exists."""
        property_id = uuid4()

        snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": 50000,
                "status": "finalized",
            }
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Property 1"}],
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": [],
            }
        )

        with patch(
            "app.api.v1.leakage.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/leakage/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["has_billing_data"] is False

    def test_snapshot_queries_are_scoped_to_org(self, test_client, test_org_id):
        """Admin snapshot reads should still carry an explicit organization filter."""
        property_id = uuid4()
        snapshot_queries = []

        mock_admin = MagicMock()
        mock_admin.table.side_effect = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Property 1"}],
                "reconciliation_snapshots": [],
                "actual_billed_amounts": [],
            },
            snapshot_queries,
        )

        with patch(
            "app.api.v1.leakage.get_supabase_admin",
            return_value=mock_admin,
        ):
            response = test_client.get("/api/v1/leakage/summary")

        assert response.status_code == 200
        assert len(snapshot_queries) == 2
        for query in snapshot_queries:
            assert ("organization_id", str(test_org_id)) in query.eq_calls

    def test_handles_no_properties(self, test_client, test_org_id):
        """Should handle organization with no properties."""
        test_client.mock_supabase_admin.table = paged_table({"properties": []})

        with patch(
            "app.api.v1.leakage.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/leakage/summary")

        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["total_recovery_opportunity"]) == Decimal("0")
        assert data["properties_with_leakage"] == 0
        assert data["has_billing_data"] is False

    def test_summary_includes_second_page_rows(self, test_client, test_org_id):
        """Summary includes paged properties, snapshots, drafts, and billed rows."""
        property_ids = [uuid4() for _ in range(1001)]
        properties = [
            {"id": str(property_id), "name": f"Property {index}"}
            for index, property_id in enumerate(property_ids)
        ]
        snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": "10.00",
                "status": "finalized",
            }
            for property_id in property_ids
        ]
        draft_snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": "3.00",
                "status": "draft",
            }
            for property_id in property_ids
        ]
        billed = [
            {"property_id": str(property_id), "billed_amount": "7.00"}
            for property_id in property_ids
        ]

        class StatusAwareQuery(PagedQuery):
            def eq(self, field, value):
                super().eq(field, value)
                if field == "status":
                    self.rows_by_table = {
                        **self.rows_by_table,
                        "reconciliation_snapshots": (
                            draft_snapshots if value == "draft" else snapshots
                        ),
                    }
                return self

        test_client.mock_supabase_admin.table = lambda table_name: StatusAwareQuery(
            table_name,
            {
                "properties": properties,
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": billed,
            },
        )

        with patch(
            "app.api.v1.leakage.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/leakage/summary")

        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["total_recovery_opportunity"]) == Decimal("3003.00")
        assert Decimal(data["draft_recovery"]) == Decimal("3003.00")
        assert data["draft_property_count"] == 1001
        assert data["properties_with_leakage"] == 1001


class TestGetLeakage:
    """Tests for GET /api/v1/leakage/{property_id} endpoint."""

    def test_returns_leakage_calculation(self, test_client, test_org_id):
        """Should return leakage data for a property."""
        from app.services.calculation.leakage import LeakageBreakdown, LeakageResult

        property_id = uuid4()

        mock_result = LeakageResult(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            capveri_calculated=Decimal("50000"),
            actual_billed=Decimal("40000"),
            leakage=Decimal("10000"),
            leakage_pct=20.0,
            has_reconciliation_data=True,
            has_gl_data=True,
            has_billing_data=True,
            breakdown=[
                LeakageBreakdown(
                    tenant_name="Tenant A",
                    calculated_amount=Decimal("50000"),
                    billed_amount=Decimal("40000"),
                    difference=Decimal("10000"),
                    difference_pct=20.0,
                )
            ],
        )

        with patch(
            "app.api.v1.leakage.calculate_leakage",
            return_value=mock_result,
        ):
            response = test_client.get(
                f"/api/v1/leakage/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["leakage"]) == Decimal("10000")
        assert data["has_reconciliation_data"] is True
        assert data["has_billing_data"] is True
        assert len(data["breakdown"]) == 1
        assert data["breakdown"][0]["tenant_name"] == "Tenant A"

    def test_returns_400_when_period_start_equals_end(self, test_client, test_org_id):
        """Should return 400 when period_start equals period_end."""
        property_id = uuid4()

        response = test_client.get(
            f"/api/v1/leakage/{property_id}",
            params={
                "period_start": "2024-01-01",
                "period_end": "2024-01-01",
            },
        )

        assert response.status_code == 400
        assert "period_start must be before period_end" in response.json()["detail"]

    def test_returns_400_when_period_start_after_end(self, test_client, test_org_id):
        """Should return 400 when period_start is after period_end."""
        property_id = uuid4()

        response = test_client.get(
            f"/api/v1/leakage/{property_id}",
            params={
                "period_start": "2024-12-31",
                "period_end": "2024-01-01",
            },
        )

        assert response.status_code == 400
        assert "period_start must be before period_end" in response.json()["detail"]

    def test_include_drafts_query_param_passthrough(self, test_client, test_org_id):
        """Should pass include_drafts=True to service layer."""
        from app.services.calculation.leakage import LeakageResult

        property_id = uuid4()

        mock_result = LeakageResult(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            capveri_calculated=Decimal("10000"),
            actual_billed=Decimal("0"),
            leakage=Decimal("10000"),
            leakage_pct=100.0,
            has_reconciliation_data=True,
            has_gl_data=True,
            has_billing_data=False,
            breakdown=[],
        )

        with patch(
            "app.api.v1.leakage.calculate_leakage",
            return_value=mock_result,
        ) as mock_calc:
            response = test_client.get(
                f"/api/v1/leakage/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                    "include_drafts": "true",
                },
            )

        assert response.status_code == 200
        mock_calc.assert_called_once_with(
            organization_id=test_org_id,
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            include_drafts=True,
        )

    def test_include_drafts_defaults_to_false(self, test_client, test_org_id):
        """Should default include_drafts to False when not provided."""
        from app.services.calculation.leakage import LeakageResult

        property_id = uuid4()

        mock_result = LeakageResult(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            capveri_calculated=Decimal("50000"),
            actual_billed=Decimal("40000"),
            leakage=Decimal("10000"),
            leakage_pct=20.0,
            has_reconciliation_data=True,
            has_gl_data=True,
            has_billing_data=True,
            breakdown=[],
        )

        with patch(
            "app.api.v1.leakage.calculate_leakage",
            return_value=mock_result,
        ) as mock_calc:
            response = test_client.get(
                f"/api/v1/leakage/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                },
            )

        assert response.status_code == 200
        mock_calc.assert_called_once_with(
            organization_id=test_org_id,
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            include_drafts=False,
        )

    def test_no_leakage_scenario(self, test_client, test_org_id):
        """Should return zero leakage when billing equals calculated."""
        from app.services.calculation.leakage import LeakageResult

        property_id = uuid4()

        mock_result = LeakageResult(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            capveri_calculated=Decimal("50000"),
            actual_billed=Decimal("50000"),
            leakage=Decimal("0"),
            leakage_pct=0.0,
            has_reconciliation_data=True,
            has_gl_data=False,
            has_billing_data=True,
            breakdown=[],
        )

        with patch(
            "app.api.v1.leakage.calculate_leakage",
            return_value=mock_result,
        ):
            response = test_client.get(
                f"/api/v1/leakage/{property_id}",
                params={
                    "period_start": "2024-01-01",
                    "period_end": "2024-12-31",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["leakage"]) == Decimal("0")
        assert data["has_gl_data"] is False
