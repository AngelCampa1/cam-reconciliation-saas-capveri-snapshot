"""Tests for portfolio summary API endpoint."""

from datetime import UTC, datetime
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


class TestGetPortfolioSummary:
    """Tests for GET /api/v1/portfolio/summary endpoint."""

    def test_returns_zeros_when_no_properties(self, test_client, test_org_id):
        """Empty org returns zeros, period_year=None, empty properties list."""
        test_client.mock_supabase_admin.table = paged_table({"properties": []})

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["period_year"] is None
        assert Decimal(data["total_recoverable_cam"]) == Decimal("0")
        assert Decimal(data["total_leakage"]) == Decimal("0")
        assert data["recovery_rate"] is None
        assert data["properties_with_leakage"] == 0
        assert data["has_billing_data"] is False
        assert data["properties"] == []

    def test_returns_zeros_when_no_finalized_snapshots(self, test_client, test_org_id):
        """Org with properties but no finalized snapshots returns empty state."""
        property_id = uuid4()

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Test Property"}],
                "reconciliation_snapshots": [],
            }
        )

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["period_year"] is None
        assert Decimal(data["total_recoverable_cam"]) == Decimal("0")
        assert Decimal(data["total_leakage"]) == Decimal("0")
        assert data["recovery_rate"] is None
        assert data["properties_with_leakage"] == 0
        assert data["has_billing_data"] is False
        assert data["properties"] == []

    def test_single_property_no_billing_data(self, test_client, test_org_id):
        """Single property with finalized snapshots but no billing data."""
        property_id = uuid4()

        snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": 120000,
                "period_start_date": "2024-01-01",
            }
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Main Street Plaza"}],
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": [],
            }
        )

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["period_year"] == 2024
        assert Decimal(data["total_recoverable_cam"]) == Decimal("120000")
        assert data["recovery_rate"] is None
        assert data["has_billing_data"] is False
        assert len(data["properties"]) == 1
        assert data["properties"][0]["recovery_rate"] is None

    def test_single_property_with_billing_data(self, test_client, test_org_id):
        """Single property with finalized snapshots and billing data computes leakage."""
        property_id = uuid4()

        snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": 100000,
                "period_start_date": "2024-01-01",
            }
        ]

        billed = [
            {
                "property_id": str(property_id),
                "billed_amount": 80000,
                "period_start_date": "2024-01-01",
            }
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Harbor View Tower"}],
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": billed,
            }
        )

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["period_year"] == 2024
        assert Decimal(data["total_recoverable_cam"]) == Decimal("100000")
        assert Decimal(data["total_leakage"]) == Decimal("20000")
        assert data["recovery_rate"] == pytest.approx(80.0)
        assert data["has_billing_data"] is True
        assert data["properties_with_leakage"] == 1

        prop = data["properties"][0]
        assert Decimal(prop["total_recoverable"]) == Decimal("100000")
        assert Decimal(prop["total_billed"]) == Decimal("80000")
        assert Decimal(prop["leakage"]) == Decimal("20000")
        assert prop["recovery_rate"] == pytest.approx(80.0)
        assert prop["property_name"] == "Harbor View Tower"

    def test_snapshot_query_is_scoped_to_org(self, test_client, test_org_id):
        """Admin snapshot reads should still carry an explicit organization filter."""
        property_id = uuid4()
        snapshot_queries = []

        mock_admin = MagicMock()
        mock_admin.table.side_effect = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Test Property"}],
                "reconciliation_snapshots": [
                    {
                        "property_id": str(property_id),
                        "total_recovery": 100000,
                        "period_start_date": "2024-01-01",
                    }
                ],
                "actual_billed_amounts": [],
            },
            snapshot_queries,
        )

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=mock_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        assert len(snapshot_queries) == 1
        assert ("organization_id", str(test_org_id)) in snapshot_queries[0].eq_calls

    def test_multiple_properties_sorted_by_leakage_desc(self, test_client, test_org_id):
        """Multiple properties are sorted by leakage descending."""
        prop1_id = uuid4()
        prop2_id = uuid4()
        prop3_id = uuid4()

        properties = [
            {"id": str(prop1_id), "name": "Small Leakage Building"},
            {"id": str(prop2_id), "name": "Largest Leakage Building"},
            {"id": str(prop3_id), "name": "Medium Leakage Building"},
        ]

        snapshots = [
            {
                "property_id": str(prop1_id),
                "total_recovery": 50000,
                "period_start_date": "2024-01-01",
            },
            {
                "property_id": str(prop2_id),
                "total_recovery": 200000,
                "period_start_date": "2024-01-01",
            },
            {
                "property_id": str(prop3_id),
                "total_recovery": 100000,
                "period_start_date": "2024-01-01",
            },
        ]

        billed = [
            {
                "property_id": str(prop1_id),
                "billed_amount": 45000,
                "period_start_date": "2024-01-01",
            },  # leakage 5000
            {
                "property_id": str(prop2_id),
                "billed_amount": 130000,
                "period_start_date": "2024-01-01",
            },  # leakage 70000
            {
                "property_id": str(prop3_id),
                "billed_amount": 70000,
                "period_start_date": "2024-01-01",
            },  # leakage 30000
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": properties,
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": billed,
            }
        )

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        data = response.json()

        # Total: recoverable=350000, billed=245000, leakage=105000
        assert Decimal(data["total_recoverable_cam"]) == Decimal("350000")
        assert Decimal(data["total_leakage"]) == Decimal("105000")
        assert data["properties_with_leakage"] == 3

        props = data["properties"]
        assert len(props) == 3
        # Sorted by leakage DESC: 70000, 30000, 5000
        leakages = [Decimal(p["leakage"]) for p in props]
        assert leakages == [Decimal("70000"), Decimal("30000"), Decimal("5000")]
        assert props[0]["property_name"] == "Largest Leakage Building"

    def test_auto_year_detection_uses_most_recent(self, test_client, test_org_id):
        """When snapshots exist for multiple years, the most recent year is used."""
        property_id = uuid4()

        snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": 80000,
                "period_start_date": "2023-01-01",
            },
            {
                "property_id": str(property_id),
                "total_recovery": 95000,
                "period_start_date": "2024-01-01",
            },
        ]

        billed = [
            # Only 2024 billing data
            {
                "property_id": str(property_id),
                "billed_amount": 75000,
                "period_start_date": "2024-01-01",
            }
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Test Building"}],
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": billed,
            }
        )

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        data = response.json()
        # Should use 2024 (most recent year)
        assert data["period_year"] == 2024
        # total_recovery for 2024 is 95000, billed 75000
        assert Decimal(data["total_recoverable_cam"]) == Decimal("95000")
        assert Decimal(data["total_leakage"]) == Decimal("20000")

    def test_total_recovery_all_years_sums_across_years(self, test_client, test_org_id):
        """total_recovery_all_years sums total_recovery across ALL finalized snapshots."""
        property_id = uuid4()

        snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": 80000,
                "period_start_date": "2023-01-01",
            },
            {
                "property_id": str(property_id),
                "total_recovery": 95000,
                "period_start_date": "2024-01-01",
            },
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": [{"id": str(property_id), "name": "Test Building"}],
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": [],
            }
        )

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        data = response.json()
        # total_recovery_all_years = 80000 (2023) + 95000 (2024) = 175000
        assert Decimal(data["total_recovery_all_years"]) == Decimal("175000")

    def test_summary_includes_second_page_rows(self, test_client, test_org_id):
        """Portfolio summary includes properties, snapshots, and billed rows past 1,000."""
        property_ids = [uuid4() for _ in range(1001)]
        properties = [
            {"id": str(property_id), "name": f"Property {index}"}
            for index, property_id in enumerate(property_ids)
        ]
        snapshots = [
            {
                "property_id": str(property_id),
                "total_recovery": "10.00",
                "period_start_date": "2024-01-01",
            }
            for property_id in property_ids
        ]
        billed = [
            {
                "property_id": str(property_id),
                "billed_amount": "7.00",
                "period_start_date": "2024-01-01",
            }
            for property_id in property_ids
        ]

        test_client.mock_supabase_admin.table = paged_table(
            {
                "properties": properties,
                "reconciliation_snapshots": snapshots,
                "actual_billed_amounts": billed,
            }
        )

        with patch(
            "app.api.v1.portfolio.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ):
            response = test_client.get("/api/v1/portfolio/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["period_year"] == 2024
        assert Decimal(data["total_recoverable_cam"]) == Decimal("10010.00")
        assert Decimal(data["total_leakage"]) == Decimal("3003.00")
        assert Decimal(data["total_recovery_all_years"]) == Decimal("10010.00")
        assert len(data["properties"]) == 1001
