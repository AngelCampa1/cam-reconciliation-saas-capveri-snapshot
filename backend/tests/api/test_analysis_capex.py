"""Tests for CapEx classification API endpoints.

Verifies endpoint contracts: auth requirements, request validation,
response serialization, and error mapping for all 5 CapEx endpoints.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.analysis import router
from app.auth.dependencies import (
    OrganizationContext,
    get_current_user,
    get_org_scoped_context,
)
from app.exceptions import (
    register_custom_exception_handlers,
    register_exception_handlers,
)
from app.models.user import User

SAMPLE_ORG_ID = uuid4()
SAMPLE_USER_ID = uuid4()
SAMPLE_PROPERTY_ID = uuid4()
SAMPLE_FLAG_ID = uuid4()


def _make_test_user() -> User:
    return User(
        id=SAMPLE_USER_ID,
        organization_id=SAMPLE_ORG_ID,
        email="test@example.com",
        full_name="Test User",
        role="member",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def local_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    app.include_router(router, prefix="/api/v1/analysis", tags=["Analysis"])
    return app


@pytest.fixture
def mock_supabase() -> MagicMock:
    mock = MagicMock()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.in_.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    mock.table.return_value = chain
    return mock


@pytest.fixture
def unauthenticated_client(local_app: FastAPI) -> TestClient:
    return TestClient(local_app, raise_server_exceptions=False)


@pytest.fixture
def authenticated_client(local_app: FastAPI, mock_supabase: MagicMock) -> TestClient:
    user = _make_test_user()

    def _mock_org_context() -> OrganizationContext:
        return OrganizationContext(
            client=mock_supabase,
            organization_id=SAMPLE_ORG_ID,
            user=user,
        )

    def _mock_current_user() -> User:
        return user

    local_app.dependency_overrides[get_org_scoped_context] = _mock_org_context
    local_app.dependency_overrides[get_current_user] = _mock_current_user
    return TestClient(local_app)


# ---------------------------------------------------------------------------
# POST /capex-classify
# ---------------------------------------------------------------------------


class TestCapExClassifyEndpoint:
    def test_requires_auth(self, unauthenticated_client: TestClient) -> None:
        response = unauthenticated_client.post(
            "/api/v1/analysis/capex-classify",
            json={
                "property_id": str(SAMPLE_PROPERTY_ID),
                "period_year": 2024,
            },
        )
        assert response.status_code in (401, 403)

    def test_returns_run_response(self, authenticated_client: TestClient) -> None:
        with patch(
            "app.api.v1.analysis.CapExClassifierService.run_classification",
            new_callable=AsyncMock,
        ) as mock_run:
            from app.models.capex_flag import CapExRunResponse

            mock_run.return_value = CapExRunResponse(
                flags_created=3,
                gl_entries_scanned=50,
                property_id=SAMPLE_PROPERTY_ID,
                period_year=2024,
            )
            response = authenticated_client.post(
                "/api/v1/analysis/capex-classify",
                json={
                    "property_id": str(SAMPLE_PROPERTY_ID),
                    "period_year": 2024,
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["flags_created"] == 3
            assert data["gl_entries_scanned"] == 50

    def test_validates_period_year(self, authenticated_client: TestClient) -> None:
        response = authenticated_client.post(
            "/api/v1/analysis/capex-classify",
            json={
                "property_id": str(SAMPLE_PROPERTY_ID),
                "period_year": 1900,
            },
        )
        assert response.status_code == 422

    def test_reports_unexpected_service_error(
        self, authenticated_client: TestClient
    ) -> None:
        err = RuntimeError("database connection lost")
        with (
            patch(
                "app.api.v1.analysis.CapExClassifierService.run_classification",
                new_callable=AsyncMock,
                side_effect=err,
            ),
            patch("app.api.v1.analysis.capture_unexpected_exception") as capture,
        ):
            response = authenticated_client.post(
                "/api/v1/analysis/capex-classify",
                json={
                    "property_id": str(SAMPLE_PROPERTY_ID),
                    "period_year": 2024,
                },
            )

        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to run CapEx classification"
        assert "database connection lost" not in response.json()["detail"]
        capture.assert_called_once()
        assert capture.call_args.args[0] is err
        assert capture.call_args.kwargs["operation"] == "analysis.capex.run"


# ---------------------------------------------------------------------------
# GET /capex-flags/{property_id}/{period_year}
# ---------------------------------------------------------------------------


class TestGetCapExFlagsEndpoint:
    def test_requires_auth(self, unauthenticated_client: TestClient) -> None:
        response = unauthenticated_client.get(
            f"/api/v1/analysis/capex-flags/{SAMPLE_PROPERTY_ID}/2024",
        )
        assert response.status_code in (401, 403)

    def test_returns_empty_list(self, authenticated_client: TestClient) -> None:
        with patch(
            "app.api.v1.analysis.CapExClassifierService.get_flags",
            new_callable=AsyncMock,
            return_value=[],
        ):
            response = authenticated_client.get(
                f"/api/v1/analysis/capex-flags/{SAMPLE_PROPERTY_ID}/2024",
            )
            assert response.status_code == 200
            assert response.json() == []

    def test_invalid_disposition_rejected(
        self, authenticated_client: TestClient
    ) -> None:
        """Invalid disposition values should return 422, not silently filter."""
        response = authenticated_client.get(
            f"/api/v1/analysis/capex-flags/{SAMPLE_PROPERTY_ID}/2024",
            params={"disposition": "invalid_value"},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /capex-summary/{property_id}/{period_year}
# ---------------------------------------------------------------------------


class TestGetCapExSummaryEndpoint:
    def test_requires_auth(self, unauthenticated_client: TestClient) -> None:
        response = unauthenticated_client.get(
            f"/api/v1/analysis/capex-summary/{SAMPLE_PROPERTY_ID}/2024",
        )
        assert response.status_code in (401, 403)

    def test_returns_summary(self, authenticated_client: TestClient) -> None:
        with patch(
            "app.api.v1.analysis.CapExClassifierService.get_summary",
            new_callable=AsyncMock,
        ) as mock_summary:
            from decimal import Decimal

            mock_summary.return_value = {
                "total": 5,
                "pending": 3,
                "confirmed_capex": 1,
                "dismissed": 1,
                "total_flagged_amount": Decimal("195000.00"),
            }
            response = authenticated_client.get(
                f"/api/v1/analysis/capex-summary/{SAMPLE_PROPERTY_ID}/2024",
            )
            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 5
            assert data["pending"] == 3
            assert float(data["total_flagged_amount"]) == 195000.00


# ---------------------------------------------------------------------------
# POST /capex-flags/{flag_id}/review
# ---------------------------------------------------------------------------


class TestReviewCapExFlagEndpoint:
    def test_requires_auth(self, unauthenticated_client: TestClient) -> None:
        response = unauthenticated_client.post(
            f"/api/v1/analysis/capex-flags/{SAMPLE_FLAG_ID}/review",
            json={"disposition": "confirmed_capex"},
        )
        assert response.status_code in (401, 403)

    def test_rejects_pending_disposition(
        self, authenticated_client: TestClient
    ) -> None:
        """Disposition 'pending' is not allowed for review requests."""
        response = authenticated_client.post(
            f"/api/v1/analysis/capex-flags/{SAMPLE_FLAG_ID}/review",
            json={"disposition": "pending"},
        )
        assert response.status_code == 422

    def test_not_found_returns_404(self, authenticated_client: TestClient) -> None:
        with patch(
            "app.api.v1.analysis.CapExClassifierService.review_flag",
            new_callable=AsyncMock,
            side_effect=ValueError("not found"),
        ):
            response = authenticated_client.post(
                f"/api/v1/analysis/capex-flags/{SAMPLE_FLAG_ID}/review",
                json={"disposition": "dismissed"},
            )
            assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /capex-flags/bulk-review
# ---------------------------------------------------------------------------


class TestBulkReviewCapExFlagsEndpoint:
    def test_requires_auth(self, unauthenticated_client: TestClient) -> None:
        response = unauthenticated_client.post(
            "/api/v1/analysis/capex-flags/bulk-review",
            json={
                "flag_ids": [str(uuid4())],
                "disposition": "dismissed",
            },
        )
        assert response.status_code in (401, 403)

    def test_missing_flags_returns_404(
        self, authenticated_client: TestClient, mock_supabase: MagicMock
    ) -> None:
        """Should return 404 before updating any flags if IDs don't exist."""
        missing_id = uuid4()
        # Mock the validation query to return empty
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.in_.return_value = chain
        chain.execute.return_value = MagicMock(data=[])
        mock_supabase.table.return_value = chain

        response = authenticated_client.post(
            "/api/v1/analysis/capex-flags/bulk-review",
            json={
                "flag_ids": [str(missing_id)],
                "disposition": "dismissed",
            },
        )
        assert response.status_code == 404
        assert str(missing_id) in response.json()["detail"]

    def test_reports_unexpected_validation_error(
        self, authenticated_client: TestClient, mock_supabase: MagicMock
    ) -> None:
        err = RuntimeError("database connection lost")
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.in_.return_value = chain
        chain.execute.side_effect = err
        mock_supabase.table.return_value = chain

        with patch("app.api.v1.analysis.capture_unexpected_exception") as capture:
            response = authenticated_client.post(
                "/api/v1/analysis/capex-flags/bulk-review",
                json={
                    "flag_ids": [str(SAMPLE_FLAG_ID)],
                    "disposition": "dismissed",
                },
            )

        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to review CapEx flags"
        assert "database connection lost" not in response.json()["detail"]
        capture.assert_called_once()
        assert capture.call_args.args[0] is err
        assert capture.call_args.kwargs["operation"] == "analysis.capex.bulk_review"
