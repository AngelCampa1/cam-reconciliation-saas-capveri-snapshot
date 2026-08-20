"""Tests for actual billed amounts API endpoints."""

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.database.client import get_supabase, get_supabase_admin
from app.main import app
from app.models.enums import UserRole
from app.models.user import User


class PagedQuery:
    def __init__(self, data):
        self.data = data
        self.range_calls = []
        self._range_start = None
        self._range_end = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self.range_calls.append((start, end))
        self._range_start = start
        self._range_end = end
        return self

    def execute(self):
        response = MagicMock()
        if self._range_start is None or self._range_end is None:
            response.data = self.data
        else:
            response.data = self.data[self._range_start : self._range_end + 1]
        return response


@pytest.fixture
def test_user() -> User:
    """Create a user in a test organization."""
    return User(
        id=uuid4(),
        organization_id=uuid4(),
        email="billing-user@example.com",
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def test_client(test_user: User):
    """Create a test client with auth and db dependency overrides."""
    mock_supabase = MagicMock()
    mock_supabase_admin = MagicMock()

    async def mock_get_user() -> User:
        return test_user

    def mock_get_db():
        return mock_supabase

    def mock_get_admin_db():
        return mock_supabase_admin

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_supabase] = mock_get_db
    app.dependency_overrides[get_supabase_admin] = mock_get_admin_db

    client = TestClient(app)
    client.mock_supabase = mock_supabase
    client.mock_supabase_admin = mock_supabase_admin
    yield client
    app.dependency_overrides.clear()


def test_upload_billing_file_success(test_client: TestClient):
    """Upload succeeds and stores one row per parsed item."""
    property_id = uuid4()
    parser_result = SimpleNamespace(
        success=True,
        data=[
            SimpleNamespace(
                tenant_name="Tenant A",
                billed_amount=Decimal("1234.56"),
                suite="100",
            ),
            SimpleNamespace(
                tenant_name="Tenant B",
                billed_amount=Decimal("789.00"),
                suite=None,
            ),
        ],
        source_type="csv",
        total_billed=Decimal("2023.56"),
        row_count=2,
        warnings=[],
    )

    query = MagicMock()
    query.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "row-1"}, {"id": "row-2"}]
    )
    test_client.mock_supabase_admin.table.return_value = query

    with (
        patch("app.api.v1.actual_billed.BillingParser") as parser_cls,
        patch(
            "app.api.v1.actual_billed.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ),
    ):
        parser_cls.return_value.parse.return_value = parser_result
        response = test_client.post(
            "/api/v1/actual-billed/upload",
            data={
                "property_id": str(property_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            },
            files={"file": ("billing.csv", b"tenant,billed", "text/csv")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["source_type"] == "csv"
    assert payload["row_count"] == 2
    assert Decimal(payload["total_billed"]) == Decimal("2023.56")
    query.insert.assert_called_once()
    insert_rows = query.insert.call_args[0][0]
    assert len(insert_rows) == 2
    assert insert_rows[0]["billed_amount"] == "1234.56"


def test_upload_billing_file_validates_insert_response(test_client: TestClient):
    """Upload rejects a database response that persisted fewer rows than parsed."""
    property_id = uuid4()
    parser_result = SimpleNamespace(
        success=True,
        data=[
            SimpleNamespace(
                tenant_name="Tenant A",
                billed_amount=Decimal("1234.56"),
                suite="100",
            )
        ],
        source_type="csv",
        total_billed=Decimal("1234.56"),
        row_count=1,
        warnings=[],
    )

    query = MagicMock()
    query.insert.return_value.execute.return_value = MagicMock(data=[])
    test_client.mock_supabase_admin.table.return_value = query

    with (
        patch("app.api.v1.actual_billed.BillingParser") as parser_cls,
        patch(
            "app.api.v1.actual_billed.get_supabase_admin",
            return_value=test_client.mock_supabase_admin,
        ),
    ):
        parser_cls.return_value.parse.return_value = parser_result
        response = test_client.post(
            "/api/v1/actual-billed/upload",
            data={
                "property_id": str(property_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            },
            files={"file": ("billing.csv", b"tenant,billed", "text/csv")},
        )

    assert response.status_code == 500
    assert "Failed to create all billing records" in response.json()["detail"]


def test_upload_billing_file_rejects_invalid_period(test_client: TestClient):
    """Upload rejects period ranges where start >= end."""
    response = test_client.post(
        "/api/v1/actual-billed/upload",
        data={
            "property_id": str(uuid4()),
            "period_start": "2024-12-31",
            "period_end": "2024-01-01",
        },
        files={"file": ("billing.csv", b"tenant,billed", "text/csv")},
    )

    assert response.status_code == 400
    assert "period_start must be before period_end" in response.json()["detail"]


def test_upload_billing_file_parse_failure_returns_422(test_client: TestClient):
    """Upload returns parser errors when file parsing fails."""
    parser_result = SimpleNamespace(
        success=False,
        data=[],
        source_type="unknown",
        total_billed=Decimal("0"),
        row_count=0,
        warnings=[],
        errors=["Missing billed amount column"],
    )

    with patch("app.api.v1.actual_billed.BillingParser") as parser_cls:
        parser_cls.return_value.parse.return_value = parser_result
        response = test_client.post(
            "/api/v1/actual-billed/upload",
            data={
                "property_id": str(uuid4()),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            },
            files={"file": ("billing.csv", b"tenant,billed", "text/csv")},
        )

    assert response.status_code == 422
    detail = response.json()["detail"]
    if isinstance(detail, dict):
        assert detail["message"] == "Failed to parse billing file"
        assert "Missing billed amount column" in detail["errors"]
    else:
        # FastAPI may coerce HTTPException detail to a string in some contexts.
        assert "Failed to parse billing file" in detail


def test_create_manual_billing_success(test_client: TestClient):
    """Manual billing entry is created and returned."""
    property_id = uuid4()
    record_id = uuid4()
    query = MagicMock()
    query.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": str(record_id)}]
    )
    test_client.mock_supabase_admin.table.return_value = query

    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        response = test_client.post(
            "/api/v1/actual-billed/manual",
            json={
                "property_id": str(property_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
                "total_billed": "5000.00",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == str(record_id)
    assert payload["property_id"] == str(property_id)
    assert Decimal(payload["total_billed"]) == Decimal("5000.00")
    insert_payload = query.insert.call_args[0][0]
    assert insert_payload["billed_amount"] == "5000.00"


def test_create_manual_billing_defaults_pool_id_to_null(test_client: TestClient):
    """Manual entry without a pool stores pool_id as NULL and returns it null."""
    property_id = uuid4()
    record_id = uuid4()
    query = MagicMock()
    query.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": str(record_id)}]
    )
    test_client.mock_supabase_admin.table.return_value = query

    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        response = test_client.post(
            "/api/v1/actual-billed/manual",
            json={
                "property_id": str(property_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
                "total_billed": "5000.00",
            },
        )

    assert response.status_code == 200
    assert response.json()["pool_id"] is None
    insert_payload = query.insert.call_args[0][0]
    assert insert_payload["pool_id"] is None


def test_create_manual_billing_with_pool_id_round_trips(test_client: TestClient):
    """Manual entry persists and returns a verified pool_id."""
    property_id = uuid4()
    pool_id = uuid4()
    record_id = uuid4()

    # Explicitly stub the org-scoped pool ownership lookup as a positive match so
    # the success path's verification intent is self-documenting.
    properties_query = MagicMock()
    (
        properties_query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data={"id": str(property_id)})
    pool_query = MagicMock()
    (
        pool_query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data={"id": str(pool_id)})

    def table_dispatch(name: str):
        if name == "expense_pools":
            return pool_query
        return properties_query

    test_client.mock_supabase.table.side_effect = table_dispatch

    query = MagicMock()
    query.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": str(record_id)}]
    )
    test_client.mock_supabase_admin.table.return_value = query

    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        response = test_client.post(
            "/api/v1/actual-billed/manual",
            json={
                "property_id": str(property_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
                "total_billed": "5000.00",
                "pool_id": str(pool_id),
            },
        )

    assert response.status_code == 200
    assert response.json()["pool_id"] == str(pool_id)
    insert_payload = query.insert.call_args[0][0]
    assert insert_payload["pool_id"] == str(pool_id)


def test_create_manual_billing_rejects_unknown_pool(test_client: TestClient):
    """Manual entry rejects a pool that does not belong to the property."""
    property_id = uuid4()
    pool_id = uuid4()

    properties_query = MagicMock()
    (
        properties_query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data={"id": str(property_id)})
    pool_query = MagicMock()
    (
        pool_query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data=None)

    def table_dispatch(name: str):
        if name == "expense_pools":
            return pool_query
        return properties_query

    test_client.mock_supabase.table.side_effect = table_dispatch

    response = test_client.post(
        "/api/v1/actual-billed/manual",
        json={
            "property_id": str(property_id),
            "period_start": "2024-01-01",
            "period_end": "2024-12-31",
            "total_billed": "5000.00",
            "pool_id": str(pool_id),
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Expense pool not found"
    test_client.mock_supabase_admin.table.assert_not_called()


def test_create_manual_billing_rejects_cross_org_property(test_client: TestClient):
    """Manual billing verifies property ownership before service-role insert."""
    property_id = uuid4()
    property_query = MagicMock()
    (
        property_query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data=None)
    test_client.mock_supabase.table.return_value = property_query

    response = test_client.post(
        "/api/v1/actual-billed/manual",
        json={
            "property_id": str(property_id),
            "period_start": "2024-01-01",
            "period_end": "2024-12-31",
            "total_billed": "5000.00",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Property not found"
    test_client.mock_supabase_admin.table.assert_not_called()


def test_create_manual_billing_validates_insert_response(test_client: TestClient):
    """Manual entry rejects empty and malformed insert responses."""
    query = MagicMock()
    query.insert.return_value.execute.return_value = MagicMock(data=[])
    test_client.mock_supabase_admin.table.return_value = query

    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        empty_response = test_client.post(
            "/api/v1/actual-billed/manual",
            json={
                "property_id": str(uuid4()),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
                "total_billed": "200.00",
            },
        )

    assert empty_response.status_code == 500
    assert "Failed to create billing record" in empty_response.json()["detail"]

    query.insert.return_value.execute.return_value = MagicMock(data=[12345])
    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        malformed_response = test_client.post(
            "/api/v1/actual-billed/manual",
            json={
                "property_id": str(uuid4()),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
                "total_billed": "200.00",
            },
        )

    assert malformed_response.status_code == 500
    assert "Invalid billing record response" in malformed_response.json()["detail"]


def test_get_billed_amounts_aggregates_and_filters_rows(test_client: TestClient):
    """GET endpoint sums billed amounts and skips non-dict payload rows."""
    property_id = uuid4()
    query = PagedQuery(
        [
            {"tenant_name": "Tenant A", "billed_amount": 1000},
            {"tenant_name": "Tenant B", "billed_amount": "250.25"},
            "invalid-row",
        ]
    )
    test_client.mock_supabase_admin.table.return_value = query

    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        response = test_client.get(
            f"/api/v1/actual-billed/{property_id}?period_start=2024-01-01&period_end=2024-12-31"
        )

    assert response.status_code == 200
    payload = response.json()
    assert Decimal(payload["total_billed"]) == Decimal("1250.25")
    assert len(payload["items"]) == 2


def test_get_billed_amounts_rejects_invalid_period(test_client: TestClient):
    """GET rejects period ranges where start >= end before service-role reads."""
    response = test_client.get(
        f"/api/v1/actual-billed/{uuid4()}?period_start=2024-12-31&period_end=2024-01-01"
    )

    assert response.status_code == 400
    assert "period_start must be before period_end" in response.json()["detail"]
    test_client.mock_supabase_admin.table.assert_not_called()


def test_get_billed_amounts_uses_period_overlap_semantics(test_client: TestClient):
    """GET includes exact, contained, containing, and partial overlap rows."""
    property_id = uuid4()
    query = PagedQuery(
        [
            {"tenant_name": "Exact", "billed_amount": "100.00"},
            {"tenant_name": "Contained", "billed_amount": "200.00"},
            {"tenant_name": "Containing", "billed_amount": "300.00"},
            {"tenant_name": "Left Partial", "billed_amount": "400.00"},
            {"tenant_name": "Right Partial", "billed_amount": "500.00"},
        ]
    )
    test_client.mock_supabase_admin.table.return_value = query

    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        response = test_client.get(
            f"/api/v1/actual-billed/{property_id}?period_start=2024-01-01&period_end=2024-12-31"
        )

    assert response.status_code == 200
    payload = response.json()
    assert Decimal(payload["total_billed"]) == Decimal("1500.00")
    assert len(payload["items"]) == 5


def test_get_billed_amounts_includes_second_page(test_client: TestClient):
    """GET endpoint includes rows beyond Supabase's default 1,000 row page."""
    property_id = uuid4()
    rows = [
        {"tenant_name": f"Tenant {index}", "billed_amount": "1.00"}
        for index in range(1001)
    ]
    query = PagedQuery(rows)
    test_client.mock_supabase_admin.table.return_value = query

    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        response = test_client.get(
            f"/api/v1/actual-billed/{property_id}?period_start=2024-01-01&period_end=2024-12-31"
        )

    assert response.status_code == 200
    payload = response.json()
    assert Decimal(payload["total_billed"]) == Decimal("1001.00")
    assert len(payload["items"]) == 1001


def test_delete_billed_amounts_with_period_filters(test_client: TestClient):
    """DELETE applies optional period filters using overlap semantics."""
    property_id = uuid4()
    query = MagicMock()
    (
        query.delete.return_value.eq.return_value.eq.return_value.lte.return_value.gte.return_value.execute.return_value
    ) = MagicMock(data=[])
    test_client.mock_supabase_admin.table.return_value = query

    with patch(
        "app.api.v1.actual_billed.get_supabase_admin",
        return_value=test_client.mock_supabase_admin,
    ):
        response = test_client.delete(
            f"/api/v1/actual-billed/{property_id}?period_start=2024-01-01&period_end=2024-12-31"
        )

    assert response.status_code == 200
    assert response.json()["message"] == "Billing data deleted successfully"
    query.delete.return_value.eq.return_value.eq.return_value.lte.assert_called_once_with(
        "period_start_date", "2024-12-31"
    )
    (
        query.delete.return_value.eq.return_value.eq.return_value.lte.return_value.gte
    ).assert_called_once_with("period_end_date", "2024-01-01")


def test_delete_billed_amounts_rejects_invalid_period(test_client: TestClient):
    """DELETE rejects reversed bounded periods before service-role deletes."""
    response = test_client.delete(
        f"/api/v1/actual-billed/{uuid4()}?period_start=2024-12-31&period_end=2024-01-01"
    )

    assert response.status_code == 400
    assert "period_start must be before period_end" in response.json()["detail"]
    test_client.mock_supabase_admin.table.assert_not_called()
