"""Tests for GL narrative analysis API endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    OrganizationContext,
    get_current_user,
    get_org_scoped_context,
)
from app.main import app
from app.models.enums import UserRole
from app.models.gl_analysis import GLAnalysisResult
from app.models.user import User


def _make_user(org_id):
    return User(
        id=uuid4(),
        email="controller@example.com",
        organization_id=org_id,
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _make_result(property_id, period_year, org_id):
    now = datetime.now(UTC)
    return GLAnalysisResult(
        id=uuid4(),
        organization_id=org_id,
        property_id=property_id,
        period_year=period_year,
        analysis_markdown="## CAM GL Analysis\n\n### Summary\nNo issues found.",
        token_input=900,
        token_output=0,
        ran_at=now,
        ran_by_user_id=uuid4(),
        dismissed_at=None,
        dismissed_by_user_id=None,
        created_at=now,
    )


@pytest.fixture
def test_org_id():
    return uuid4()


@pytest.fixture
def test_user(test_org_id):
    return _make_user(test_org_id)


@pytest.fixture
def mock_supabase():
    return MagicMock()


@pytest.fixture
def test_client(test_user, test_org_id, mock_supabase):
    """Test client with auth dependency overrides."""

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

    client = TestClient(app)
    client.mock_supabase = mock_supabase
    client.test_user = test_user
    client.test_org_id = test_org_id

    yield client

    app.dependency_overrides.clear()


class TestPostGLNarrative:
    """Tests for POST /api/v1/analysis/gl-narrative."""

    def test_post_gl_narrative_returns_200_with_markdown(self, test_client) -> None:
        """Should return 200 with analysis result containing markdown."""
        property_id = uuid4()
        period_year = 2024
        result = _make_result(property_id, period_year, test_client.test_org_id)

        with patch("app.api.v1.analysis.GLAnalysisService") as MockService:
            mock_svc = MagicMock()
            # run_analysis returns (GLAnalysisResult, gl_entry_count)
            mock_svc.run_analysis = AsyncMock(return_value=(result, 42))
            MockService.return_value = mock_svc

            response = test_client.post(
                "/api/v1/analysis/gl-narrative",
                json={
                    "property_id": str(property_id),
                    "period_year": period_year,
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "result" in data
        assert "analysis_markdown" in data["result"]
        assert "CAM GL Analysis" in data["result"]["analysis_markdown"]

    def test_post_gl_narrative_requires_auth(self) -> None:
        """Should return 401 when no auth token is provided."""
        client = TestClient(app)
        response = client.post(
            "/api/v1/analysis/gl-narrative",
            json={"property_id": str(uuid4()), "period_year": 2024},
        )
        assert response.status_code == 401

    def test_post_gl_narrative_validates_period_year(self, test_client) -> None:
        """Should return 422 for invalid period_year."""
        response = test_client.post(
            "/api/v1/analysis/gl-narrative",
            json={"property_id": str(uuid4()), "period_year": 1900},
        )
        assert response.status_code == 422

    def test_post_gl_narrative_returns_404_when_property_not_found(
        self, test_client
    ) -> None:
        """Should return 404 when the property doesn't exist or belongs to another org."""
        property_id = uuid4()

        with patch("app.api.v1.analysis.GLAnalysisService") as MockService:
            mock_svc = MagicMock()
            mock_svc.run_analysis = AsyncMock(
                side_effect=ValueError(f"Property {property_id} not found")
            )
            MockService.return_value = mock_svc

            response = test_client.post(
                "/api/v1/analysis/gl-narrative",
                json={"property_id": str(property_id), "period_year": 2024},
            )

        assert response.status_code == 404

    def test_post_gl_narrative_reports_unexpected_error(self, test_client) -> None:
        property_id = uuid4()
        err = RuntimeError("OpenRouter timeout")

        with (
            patch("app.api.v1.analysis.GLAnalysisService") as MockService,
            patch("app.api.v1.analysis.capture_unexpected_exception") as capture,
        ):
            mock_svc = MagicMock()
            mock_svc.run_analysis = AsyncMock(side_effect=err)
            MockService.return_value = mock_svc

            response = test_client.post(
                "/api/v1/analysis/gl-narrative",
                json={"property_id": str(property_id), "period_year": 2024},
            )

        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to run GL analysis"
        assert "OpenRouter timeout" not in response.json()["detail"]
        capture.assert_called_once()
        assert capture.call_args.args[0] is err
        assert capture.call_args.kwargs["operation"] == "analysis.gl_narrative.run"


class TestGetGLNarrative:
    """Tests for GET /api/v1/analysis/gl-narrative/{property_id}/{period_year}."""

    def test_get_gl_narrative_returns_latest_result(self, test_client) -> None:
        """Should return 200 with the latest saved analysis result."""
        property_id = uuid4()
        period_year = 2024
        result = _make_result(property_id, period_year, test_client.test_org_id)

        with patch("app.api.v1.analysis.GLAnalysisService") as MockService:
            mock_svc = MagicMock()
            mock_svc.get_latest_analysis = AsyncMock(return_value=result)
            MockService.return_value = mock_svc

            response = test_client.get(
                f"/api/v1/analysis/gl-narrative/{property_id}/{period_year}",
            )

        assert response.status_code == 200
        data = response.json()
        assert data["period_year"] == period_year

    def test_get_gl_narrative_returns_200_null_when_none(self, test_client) -> None:
        """Should return 200 with a null body when no analysis exists.

        Absence of a narrative is a normal state on reconciliation detail
        pages (none has been run yet), not a client error, so the endpoint
        returns 200/null rather than 404 to keep page loads clean.
        """
        property_id = uuid4()
        period_year = 2024

        with patch("app.api.v1.analysis.GLAnalysisService") as MockService:
            mock_svc = MagicMock()
            mock_svc.get_latest_analysis = AsyncMock(return_value=None)
            MockService.return_value = mock_svc

            response = test_client.get(
                f"/api/v1/analysis/gl-narrative/{property_id}/{period_year}",
            )

        assert response.status_code == 200
        assert response.json() is None

    def test_get_gl_narrative_validates_period_year(self, test_client) -> None:
        """Should return 422 for period_year out of valid range."""
        property_id = uuid4()
        response = test_client.get(
            f"/api/v1/analysis/gl-narrative/{property_id}/1800",
        )
        assert response.status_code == 422


class TestDismissGLNarrative:
    """Tests for POST /api/v1/analysis/gl-narrative/{analysis_id}/dismiss."""

    def test_dismiss_gl_narrative_returns_200(self, test_client) -> None:
        """Should return 200 with dismissed result."""
        analysis_id = uuid4()
        property_id = uuid4()
        now = datetime.now(UTC)
        dismissed_result = GLAnalysisResult(
            id=analysis_id,
            organization_id=test_client.test_org_id,
            property_id=property_id,
            period_year=2024,
            analysis_markdown="## Analysis",
            token_input=500,
            token_output=0,
            ran_at=now,
            ran_by_user_id=uuid4(),
            dismissed_at=now,
            dismissed_by_user_id=test_client.test_user.id,
            created_at=now,
        )

        with patch("app.api.v1.analysis.GLAnalysisService") as MockService:
            mock_svc = MagicMock()
            mock_svc.dismiss_analysis = AsyncMock(return_value=dismissed_result)
            MockService.return_value = mock_svc

            response = test_client.post(
                f"/api/v1/analysis/gl-narrative/{analysis_id}/dismiss",
            )

        assert response.status_code == 200
        data = response.json()
        assert data["dismissed_at"] is not None

    def test_dismiss_gl_narrative_returns_404_when_not_found(self, test_client) -> None:
        """Should return 404 when analysis ID does not exist (or belongs to another org)."""
        analysis_id = uuid4()

        with patch("app.api.v1.analysis.GLAnalysisService") as MockService:
            mock_svc = MagicMock()
            mock_svc.dismiss_analysis = AsyncMock(
                side_effect=ValueError(f"Analysis {analysis_id} not found")
            )
            MockService.return_value = mock_svc

            response = test_client.post(
                f"/api/v1/analysis/gl-narrative/{analysis_id}/dismiss",
            )

        assert response.status_code == 404
