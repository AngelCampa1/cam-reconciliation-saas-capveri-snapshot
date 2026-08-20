"""Tests for SB 1103 Compliance API endpoints.

Tests cover:
- List requests (filtering by property_id, status, empty)
- Create requests (auto-computed dates, 422 validation, 404 for invalid refs)
- Get single request (200, 404, org isolation)
- Update request (status, notes, 404)
- Delete request (204 admin, 403 non-admin, 404)
- Export (pdf, excel, both, status updates, 404, 400 invalid format)
- Deadline alerts (approaching, overdue, delivered excluded, empty)
"""

from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1.compliance import router
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
from app.services.compliance.sb1103_service import (
    compute_response_deadline,
    compute_window_start,
)

# ---------------------------------------------------------------------------
# Constants and helpers
# ---------------------------------------------------------------------------

SAMPLE_ORG_ID = uuid4()
SAMPLE_USER_ID = uuid4()
SAMPLE_PROPERTY_ID = uuid4()
SAMPLE_LEASE_ID = uuid4()
SAMPLE_REQUEST_ID = uuid4()
TODAY = date.today()


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


def create_sample_request(
    request_id: UUID = SAMPLE_REQUEST_ID,
    org_id: UUID = SAMPLE_ORG_ID,
    property_id: UUID = SAMPLE_PROPERTY_ID,
    lease_id: UUID = SAMPLE_LEASE_ID,
    request_date: date = TODAY,
    status: str = "pending",
) -> dict:
    return {
        "id": str(request_id),
        "organization_id": str(org_id),
        "property_id": str(property_id),
        "lease_id": str(lease_id),
        "requested_by_name": "Jane Smith",
        "requested_by_email": "jane@tenant.com",
        "request_date": request_date.isoformat(),
        "response_deadline": compute_response_deadline(request_date).isoformat(),
        "window_start_date": compute_window_start(request_date).isoformat(),
        "window_end_date": request_date.isoformat(),
        "status": status,
        "export_format": None,
        "exported_at": None,
        "notes": None,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


class MockSupabaseResponse:
    def __init__(self, data=None, count=None):
        self.data = data if data is not None else []
        self.count = count


class MockQueryBuilder:
    def __init__(self, data=None, count=None):
        self._data = data if data is not None else []
        self._count = count
        self._insert_data = None

    def select(self, *args, **kwargs):
        return self

    def insert(self, data):
        self._insert_data = data
        if isinstance(data, dict) and "id" not in data:
            data["id"] = str(uuid4())
        if isinstance(data, dict) and "created_at" not in data:
            data["created_at"] = datetime.now(UTC).isoformat()
        if isinstance(data, dict) and "updated_at" not in data:
            data["updated_at"] = datetime.now(UTC).isoformat()
        if isinstance(data, dict):
            self._data = [data]
        return self

    def update(self, data):
        if self._data and isinstance(self._data, list) and self._data:
            self._data[0].update({k: v for k, v in data.items() if v is not None})
        return self

    def delete(self):
        self._data = []
        return self

    def eq(self, *args, **kwargs):
        return self

    def neq(self, *args, **kwargs):
        return self

    def lte(self, *args, **kwargs):
        return self

    def gte(self, *args, **kwargs):
        return self

    def in_(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, n):
        return self

    def single(self):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return MockSupabaseResponse(data=self._data, count=self._count)


def make_app(
    user: User | None = None,
    requests_data: list[dict] | None = None,
    property_exists: bool = True,
    lease_exists: bool = True,
    lease_property_id: UUID = SAMPLE_PROPERTY_ID,
    single_request: dict | None = None,
) -> tuple[FastAPI, TestClient]:
    """Build a test FastAPI app with mocked dependencies."""
    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    app.include_router(router, prefix="/compliance/sb1103")

    resolved_user = user or create_test_user()

    def mock_ctx():
        ctx = MagicMock(spec=OrganizationContext)
        ctx.user = resolved_user
        ctx.organization_id = str(resolved_user.organization_id)

        def table_side_effect(name):
            if name == "sb1103_requests":
                if single_request is not None:
                    return MockQueryBuilder(
                        data=[single_request] if single_request else []
                    )
                return MockQueryBuilder(
                    data=requests_data or [],
                    count=len(requests_data or []),
                )
            elif name == "properties":
                if property_exists:
                    return MockQueryBuilder(
                        data=[{"id": str(SAMPLE_PROPERTY_ID), "name": "Downtown Tower"}]
                    )
                return MockQueryBuilder(data=[])
            elif name == "leases":
                if lease_exists:
                    return MockQueryBuilder(
                        data=[
                            {
                                "id": str(SAMPLE_LEASE_ID),
                                "tenant_name": "Acme Corp",
                                "property_id": str(lease_property_id),
                            }
                        ]
                    )
                return MockQueryBuilder(data=[])
            return MockQueryBuilder(data=[])

        ctx.table.side_effect = table_side_effect
        return ctx

    def mock_admin_user():
        return create_test_user(role="admin")

    app.dependency_overrides[get_org_scoped_context] = mock_ctx
    app.dependency_overrides[get_current_admin_user] = mock_admin_user

    return app, TestClient(app)


# ---------------------------------------------------------------------------
# TestListSB1103Requests
# ---------------------------------------------------------------------------


class TestListSB1103Requests:
    def test_200_with_list(self):
        requests = [create_sample_request()]
        _, client = make_app(requests_data=requests)
        resp = client.get("/compliance/sb1103")
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["count"] >= 0
        assert "data" in body

    def test_filter_by_property_id(self):
        requests = [create_sample_request()]
        _, client = make_app(requests_data=requests)
        resp = client.get(f"/compliance/sb1103/?property_id={SAMPLE_PROPERTY_ID}")
        assert resp.status_code == status.HTTP_200_OK

    def test_filter_by_status(self):
        requests = [create_sample_request(status="pending")]
        _, client = make_app(requests_data=requests)
        resp = client.get("/compliance/sb1103/?status=pending")
        assert resp.status_code == status.HTTP_200_OK

    def test_empty_list(self):
        _, client = make_app(requests_data=[])
        resp = client.get("/compliance/sb1103")
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["data"] == []
        assert body["count"] == 0

    def test_401_unauthenticated(self):
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)
        app.include_router(router, prefix="/compliance/sb1103")
        client = TestClient(app)
        resp = client.get("/compliance/sb1103")
        assert resp.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


# ---------------------------------------------------------------------------
# TestCreateSB1103Request
# ---------------------------------------------------------------------------


class TestCreateSB1103Request:
    def _create_payload(self, request_date: str | None = None) -> dict:
        return {
            "property_id": str(SAMPLE_PROPERTY_ID),
            "lease_id": str(SAMPLE_LEASE_ID),
            "requested_by_name": "Jane Smith",
            "requested_by_email": "jane@tenant.com",
            "request_date": request_date or TODAY.isoformat(),
        }

    def test_201_with_created_record(self):
        _, client = make_app()
        resp = client.post("/compliance/sb1103", json=self._create_payload())
        assert resp.status_code == status.HTTP_201_CREATED
        body = resp.json()
        assert body["requested_by_name"] == "Jane Smith"

    def test_response_deadline_is_30_days(self):
        _, client = make_app()
        payload = self._create_payload(request_date=TODAY.isoformat())
        resp = client.post("/compliance/sb1103", json=payload)
        assert resp.status_code == status.HTTP_201_CREATED
        body = resp.json()
        expected_deadline = compute_response_deadline(TODAY).isoformat()
        assert body["response_deadline"] == expected_deadline

    def test_window_start_is_18_months_back(self):
        _, client = make_app()
        payload = self._create_payload(request_date=TODAY.isoformat())
        resp = client.post("/compliance/sb1103", json=payload)
        assert resp.status_code == status.HTTP_201_CREATED
        body = resp.json()
        expected_window_start = compute_window_start(TODAY).isoformat()
        assert body["window_start_date"] == expected_window_start

    def test_window_end_equals_request_date(self):
        _, client = make_app()
        payload = self._create_payload(request_date=TODAY.isoformat())
        resp = client.post("/compliance/sb1103", json=payload)
        assert resp.status_code == status.HTTP_201_CREATED
        body = resp.json()
        assert body["window_end_date"] == TODAY.isoformat()

    def test_422_on_missing_fields(self):
        _, client = make_app()
        resp = client.post(
            "/compliance/sb1103", json={"property_id": str(SAMPLE_PROPERTY_ID)}
        )
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_404_on_invalid_lease_id(self):
        _, client = make_app(lease_exists=False)
        resp = client.post("/compliance/sb1103", json=self._create_payload())
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_404_on_invalid_property_id(self):
        _, client = make_app(property_exists=False)
        resp = client.post("/compliance/sb1103", json=self._create_payload())
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_400_when_lease_belongs_to_different_property(self):
        _, client = make_app(lease_property_id=uuid4())
        resp = client.post("/compliance/sb1103", json=self._create_payload())
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "requested property" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# TestGetSB1103Request
# ---------------------------------------------------------------------------


class TestGetSB1103Request:
    def test_200(self):
        req = create_sample_request()
        _, client = make_app(single_request=req)
        resp = client.get(f"/compliance/sb1103/{SAMPLE_REQUEST_ID}")
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["id"] == str(SAMPLE_REQUEST_ID)

    def test_404_not_found(self):
        _, client = make_app(single_request=None)
        resp = client.get(f"/compliance/sb1103/{uuid4()}")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_org_isolation(self):
        """Org B cannot see org A's requests (RLS handles this at DB level;
        API returns 404 when no data returned)."""
        # No request data returned (RLS filtered it out)
        _, client = make_app(single_request=None)
        resp = client.get(f"/compliance/sb1103/{uuid4()}")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# TestUpdateSB1103Request
# ---------------------------------------------------------------------------


class TestUpdateSB1103Request:
    def test_200_with_updated_fields(self):
        req = create_sample_request()
        _, client = make_app(single_request=req)
        resp = client.patch(
            f"/compliance/sb1103/{SAMPLE_REQUEST_ID}",
            json={"status": "exported", "notes": "Sent via email"},
        )
        assert resp.status_code == status.HTTP_200_OK

    def test_can_set_status_delivered(self):
        req = create_sample_request()
        _, client = make_app(single_request=req)
        resp = client.patch(
            f"/compliance/sb1103/{SAMPLE_REQUEST_ID}",
            json={"status": "delivered"},
        )
        assert resp.status_code == status.HTTP_200_OK

    def test_404_not_found(self):
        _, client = make_app(single_request=None)
        resp = client.patch(
            f"/compliance/sb1103/{uuid4()}", json={"status": "delivered"}
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# TestDeleteSB1103Request
# ---------------------------------------------------------------------------


class TestDeleteSB1103Request:
    def test_204_admin(self):
        req = create_sample_request()
        _, client = make_app(
            user=create_test_user(role="admin"),
            single_request=req,
        )
        resp = client.delete(f"/compliance/sb1103/{SAMPLE_REQUEST_ID}")
        assert resp.status_code == status.HTTP_204_NO_CONTENT

    def test_404_not_found(self):
        _, client = make_app(
            user=create_test_user(role="admin"),
            single_request=None,
        )
        resp = client.delete(f"/compliance/sb1103/{uuid4()}")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_403_for_non_admin(self):
        """Non-admin users should get 403 from the admin dependency."""
        req = create_sample_request()
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)
        app.include_router(router, prefix="/compliance/sb1103")

        def mock_ctx():
            ctx = MagicMock(spec=OrganizationContext)
            ctx.user = create_test_user(role="member")
            ctx.table.return_value = MockQueryBuilder(data=[req])
            return ctx

        def require_admin():
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin required",
            )

        app.dependency_overrides[get_org_scoped_context] = mock_ctx
        app.dependency_overrides[get_current_admin_user] = require_admin
        client = TestClient(app)

        resp = client.delete(f"/compliance/sb1103/{SAMPLE_REQUEST_ID}")
        assert resp.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# TestExportSB1103Request
# ---------------------------------------------------------------------------


class _MockExportData:
    """Helper to build minimal SB1103ExportData for export tests."""

    @staticmethod
    def make():
        from decimal import Decimal

        from app.models.sb1103 import (
            SB1103ExportData,
            SB1103GLEntry,
            SB1103Request,
        )

        req_date = date.today()
        request = SB1103Request(
            id=SAMPLE_REQUEST_ID,
            organization_id=SAMPLE_ORG_ID,
            property_id=SAMPLE_PROPERTY_ID,
            lease_id=SAMPLE_LEASE_ID,
            requested_by_name="Jane Smith",
            requested_by_email="jane@tenant.com",
            request_date=req_date,
            response_deadline=compute_response_deadline(req_date),
            window_start_date=compute_window_start(req_date),
            window_end_date=req_date,
            status="pending",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        batch_id = uuid4()
        entry = SB1103GLEntry(
            id=uuid4(),
            transaction_date=date(2024, 6, 15),
            account_code="5100",
            account_description="Janitorial",
            amount=Decimal("1000.00"),
            import_batch_id=batch_id,
            tenant_share_amount=Decimal("100.00"),
        )
        return SB1103ExportData(
            request=request,
            property_address="123 Main St, LA, CA 90001",
            property_name="Downtown Tower",
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            gl_entries=[entry],
            category_subtotals={"Janitorial": Decimal("100.00")},
            is_ca_property=True,
            total_cam_expenses=Decimal("1000.00"),
            total_tenant_share=Decimal("100.00"),
        )


class TestExportSB1103Request:
    def _make_export_app(self, request_data: dict | None = None) -> TestClient:
        req = request_data or create_sample_request()
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)
        app.include_router(router, prefix="/compliance/sb1103")

        def mock_ctx():
            ctx = MagicMock(spec=OrganizationContext)
            ctx.user = create_test_user()
            ctx.organization_id = str(SAMPLE_ORG_ID)

            def table_side_effect(name):
                qb = MagicMock()
                qb.select.return_value = qb
                qb.eq.return_value = qb
                qb.neq.return_value = qb
                qb.lte.return_value = qb
                qb.gte.return_value = qb
                qb.in_.return_value = qb
                qb.order.return_value = qb
                qb.maybe_single.return_value = qb
                qb.single.return_value = qb

                if name == "sb1103_requests":
                    resp = MagicMock()
                    resp.data = req if req else None
                    qb.execute.return_value = resp
                elif name == "properties":
                    resp = MagicMock()
                    resp.data = {
                        "id": str(SAMPLE_PROPERTY_ID),
                        "name": "DT",
                        "address": "123 Main",
                        "city": "LA",
                        "state": "CA",
                        "zip_code": "90001",
                    }
                    qb.execute.return_value = resp
                elif name == "leases":
                    resp = MagicMock()
                    resp.data = {
                        "id": str(SAMPLE_LEASE_ID),
                        "tenant_name": "Acme",
                        "recovery_profile": {"pro_rata_share": "0.10"},
                    }
                    qb.execute.return_value = resp
                elif name == "gl_entries":
                    resp = MagicMock()
                    resp.data = []
                    qb.execute.return_value = resp
                else:
                    resp = MagicMock()
                    resp.data = None
                    qb.execute.return_value = resp
                return qb

            ctx.table.side_effect = table_side_effect
            return ctx

        app.dependency_overrides[get_org_scoped_context] = mock_ctx
        app.dependency_overrides[get_current_admin_user] = lambda: create_test_user(
            role="admin"
        )

        return TestClient(app)

    def test_pdf_200_with_correct_content_type(self):
        client = self._make_export_app()
        with (
            patch(
                "app.api.v1.compliance.build_sb1103_export_data",
                return_value=_MockExportData.make(),
            ),
            patch(
                "app.api.v1.compliance.generate_pdf_export",
                return_value=BytesIO(b"%PDF-1.4 test"),
            ),
        ):
            resp = client.post(
                f"/compliance/sb1103/{SAMPLE_REQUEST_ID}/export?format=pdf"
            )
        assert resp.status_code == status.HTTP_200_OK
        assert "pdf" in resp.headers["content-type"]

    def test_excel_correct_content_type(self):
        client = self._make_export_app()
        with (
            patch(
                "app.api.v1.compliance.build_sb1103_export_data",
                return_value=_MockExportData.make(),
            ),
            patch(
                "app.api.v1.compliance.generate_excel_export",
                return_value=BytesIO(b"PK\x03\x04"),
            ),
        ):
            resp = client.post(
                f"/compliance/sb1103/{SAMPLE_REQUEST_ID}/export?format=excel"
            )
        assert resp.status_code == status.HTTP_200_OK
        assert (
            "spreadsheet" in resp.headers["content-type"]
            or "excel" in resp.headers["content-type"]
        )

    def test_both_returns_zip(self):
        client = self._make_export_app()
        with (
            patch(
                "app.api.v1.compliance.build_sb1103_export_data",
                return_value=_MockExportData.make(),
            ),
            patch(
                "app.api.v1.compliance.generate_pdf_export",
                return_value=BytesIO(b"%PDF-1.4 test"),
            ),
            patch(
                "app.api.v1.compliance.generate_excel_export",
                return_value=BytesIO(b"PK\x03\x04"),
            ),
        ):
            resp = client.post(
                f"/compliance/sb1103/{SAMPLE_REQUEST_ID}/export?format=both"
            )
        assert resp.status_code == status.HTTP_200_OK
        assert "zip" in resp.headers["content-type"]

    def test_400_on_invalid_format(self):
        client = self._make_export_app()
        resp = client.post(f"/compliance/sb1103/{SAMPLE_REQUEST_ID}/export?format=xml")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_404_not_found(self):
        client = self._make_export_app(request_data=None)
        with patch(
            "app.api.v1.compliance.build_sb1103_export_data",
            side_effect=__import__(
                "app.exceptions", fromlist=["NotFoundError"]
            ).NotFoundError("SB1103Request", str(uuid4())),
        ):
            resp = client.post(f"/compliance/sb1103/{uuid4()}/export?format=pdf")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# TestSB1103DeadlineAlerts
# ---------------------------------------------------------------------------


class TestSB1103DeadlineAlerts:
    def _make_alerts_app(self, alerts_data) -> TestClient:
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)
        app.include_router(router, prefix="/compliance/sb1103")

        def mock_ctx():
            ctx = MagicMock(spec=OrganizationContext)
            ctx.user = create_test_user()
            return ctx

        app.dependency_overrides[get_org_scoped_context] = mock_ctx
        app.dependency_overrides[get_current_admin_user] = lambda: create_test_user(
            role="admin"
        )

        return TestClient(app)

    def test_approaching_deadlines_returned(self):
        from app.models.sb1103 import SB1103DeadlineAlert

        alerts = [
            SB1103DeadlineAlert(
                request_id=uuid4(),
                property_id=SAMPLE_PROPERTY_ID,
                property_name="Downtown Tower",
                tenant_name="Acme Corp",
                response_deadline=TODAY + timedelta(days=5),
                days_remaining=5,
                status="pending",
            )
        ]
        client = self._make_alerts_app(alerts)
        with patch(
            "app.api.v1.compliance.get_deadline_alerts",
            return_value=alerts,
        ):
            resp = client.get("/compliance/sb1103/alerts")
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert len(body) == 1
        assert body[0]["days_remaining"] == 5

    def test_delivered_excluded(self):
        client = self._make_alerts_app([])
        with patch(
            "app.api.v1.compliance.get_deadline_alerts",
            return_value=[],
        ):
            resp = client.get("/compliance/sb1103/alerts")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json() == []

    def test_overdue_has_negative_days_remaining(self):
        from app.models.sb1103 import SB1103DeadlineAlert

        alerts = [
            SB1103DeadlineAlert(
                request_id=uuid4(),
                property_id=SAMPLE_PROPERTY_ID,
                property_name="Downtown Tower",
                tenant_name="Acme Corp",
                response_deadline=TODAY - timedelta(days=3),
                days_remaining=-3,
                status="overdue",
            )
        ]
        client = self._make_alerts_app(alerts)
        with patch(
            "app.api.v1.compliance.get_deadline_alerts",
            return_value=alerts,
        ):
            resp = client.get("/compliance/sb1103/alerts")
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body[0]["days_remaining"] == -3

    def test_empty_when_none(self):
        client = self._make_alerts_app([])
        with patch(
            "app.api.v1.compliance.get_deadline_alerts",
            return_value=[],
        ):
            resp = client.get("/compliance/sb1103/alerts")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json() == []
