"""Tests for analysis API endpoint authentication.

Verifies that the year-over-year and available-years endpoints
require org-scoped authentication and pass the correct org ID to
the service layer.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.analysis import router
from app.auth.dependencies import OrganizationContext, get_org_scoped_context
from app.exceptions import (
    register_custom_exception_handlers,
    register_exception_handlers,
)
from app.models.user import User

SAMPLE_ORG_ID = uuid4()
SAMPLE_USER_ID = uuid4()
SAMPLE_PROPERTY_ID = uuid4()


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
    mock_chain = MagicMock()
    mock_chain.select.return_value = mock_chain
    mock_chain.eq.return_value = mock_chain
    mock_chain.execute.return_value = MagicMock(data=[])
    mock.table.return_value = mock_chain
    return mock


@pytest.fixture
def unauthenticated_client(local_app: FastAPI) -> TestClient:
    """No auth dependency override — unauthenticated requests will fail auth."""
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

    local_app.dependency_overrides[get_org_scoped_context] = _mock_org_context
    return TestClient(local_app)


class TestYearOverYearAuth:
    def test_year_over_year_requires_org_context(
        self, unauthenticated_client: TestClient
    ) -> None:
        """Unauthenticated request returns 401/403."""
        response = unauthenticated_client.post(
            "/api/v1/analysis/year-over-year",
            json={
                "property_id": str(SAMPLE_PROPERTY_ID),
                "years": [2022, 2023],
            },
        )
        assert response.status_code in (401, 403)

    def test_year_over_year_passes_org_id_to_service(
        self, authenticated_client: TestClient
    ) -> None:
        """Service is called with the authenticated org's ID, not None."""
        with patch(
            "app.api.v1.analysis.HistoricalAnalysisService.get_year_over_year",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.side_effect = ValueError("No snapshots found")
            authenticated_client.post(
                "/api/v1/analysis/year-over-year",
                json={
                    "property_id": str(SAMPLE_PROPERTY_ID),
                    "years": [2022, 2023],
                },
            )
            mock_get.assert_called_once()
            call_kwargs = mock_get.call_args.kwargs
            assert call_kwargs.get("organization_id") == SAMPLE_ORG_ID


class TestAvailableYearsAuth:
    def test_available_years_requires_org_context(
        self, unauthenticated_client: TestClient
    ) -> None:
        """Unauthenticated request returns 401/403."""
        response = unauthenticated_client.get(
            f"/api/v1/analysis/properties/{SAMPLE_PROPERTY_ID}/available-years",
        )
        assert response.status_code in (401, 403)

    def test_available_years_uses_org_scoped_table(
        self, authenticated_client: TestClient, mock_supabase: MagicMock
    ) -> None:
        """Should query via org_context.table(), not unauthenticated get_supabase()."""
        mock_chain = MagicMock()
        mock_chain.select.return_value = mock_chain
        mock_chain.eq.return_value = mock_chain
        mock_chain.execute.return_value = MagicMock(data=[])
        mock_supabase.table.return_value = mock_chain

        response = authenticated_client.get(
            f"/api/v1/analysis/properties/{SAMPLE_PROPERTY_ID}/available-years",
        )
        assert response.status_code == 200
        mock_supabase.table.assert_called_with("reconciliation_snapshots")
