"""Tests for cross-document analysis API endpoints."""

from datetime import UTC, datetime
from types import SimpleNamespace
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
from app.models.user import User
from app.services.extraction.cross_doc_models import CrossDocAnalysisResult

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org_id():
    return uuid4()


@pytest.fixture
def user(org_id):
    return User(
        id=uuid4(),
        email="auditor@example.com",
        organization_id=org_id,
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def mock_supabase():
    return MagicMock()


@pytest.fixture
def client(user, org_id, mock_supabase):
    async def mock_user():
        return user

    async def mock_org():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=org_id,
            user=user,
        )

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_org_scoped_context] = mock_org

    tc = TestClient(app)
    tc.mock_supabase = mock_supabase
    yield tc
    app.dependency_overrides.clear()


def _valid_result(property_id, period_year=2024) -> dict:
    return {
        "property_id": str(property_id),
        "period_year": period_year,
        "findings": [],
        "lease_term_overrides": [],
        "overall_risk_score": 5,
        "analysis_summary": "No significant issues.",
        "documents_analyzed": {"leases": 2, "gl_accounts": 30},
        "token_usage": 900,
    }


def _table_chain(data):
    chain = MagicMock()
    chain.select.return_value = chain
    chain.update.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute.return_value = SimpleNamespace(data=data)
    return chain


# ---------------------------------------------------------------------------
# POST /properties/{property_id}/cross-doc-analysis
# ---------------------------------------------------------------------------


class TestTriggerAnalysis:
    def test_trigger_success(self, client, org_id) -> None:
        from types import SimpleNamespace

        prop_id = uuid4()
        result = CrossDocAnalysisResult(**_valid_result(prop_id))

        # Configure ownership check on the fixture's shared mock_supabase
        db = client.mock_supabase
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
            data={"id": str(prop_id)}
        )

        with (
            patch("app.api.v1.cross_doc_analysis.CrossDocOrchestrator") as MockOrch,
            patch("app.api.v1.cross_doc_analysis.OpenRouterClient"),
        ):
            MockOrch.return_value.run_analysis = AsyncMock(return_value=result)
            resp = client.post(
                f"/api/v1/properties/{prop_id}/cross-doc-analysis",
                json={"period_year": 2024},
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["overall_risk_score"] == 5
        assert data["period_year"] == 2024
        # Verify property ownership check was performed against the DB
        db.table.assert_any_call("properties")

    def test_trigger_insufficient_data_returns_422(self, client) -> None:
        from app.services.extraction.cross_doc_orchestrator import (
            CrossDocInsufficientDataError,
        )

        prop_id = uuid4()
        client.mock_supabase.table.return_value = _table_chain({"id": str(prop_id)})
        with (
            patch("app.api.v1.cross_doc_analysis.CrossDocOrchestrator") as MockOrch,
            patch("app.api.v1.cross_doc_analysis.OpenRouterClient"),
        ):
            MockOrch.return_value.run_analysis = AsyncMock(
                side_effect=CrossDocInsufficientDataError("No verified leases")
            )
            resp = client.post(
                f"/api/v1/properties/{prop_id}/cross-doc-analysis",
                json={"period_year": 2024},
            )

        assert resp.status_code == 422
        assert "verified leases" in resp.json()["detail"].lower()

    def test_trigger_analysis_rejects_wrong_org(self, client, org_id) -> None:
        """Property belonging to org A is not accessible to an org-B user (404)."""
        prop_id = uuid4()

        client.mock_supabase.table.return_value = _table_chain(None)

        resp = client.post(
            f"/api/v1/properties/{prop_id}/cross-doc-analysis",
            json={"period_year": 2024},
        )

        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_trigger_invalid_period_year_returns_422(self, client) -> None:
        """period_year outside [1900, 2100] is rejected before the DB is hit."""
        prop_id = uuid4()
        resp = client.post(
            f"/api/v1/properties/{prop_id}/cross-doc-analysis",
            json={"period_year": 1800},
        )
        assert resp.status_code == 422

    def test_trigger_claude_error_returns_502(self, client) -> None:
        from app.services.extraction.cross_doc_orchestrator import (
            CrossDocValidationError,
        )

        prop_id = uuid4()
        client.mock_supabase.table.return_value = _table_chain({"id": str(prop_id)})
        with (
            patch("app.api.v1.cross_doc_analysis.CrossDocOrchestrator") as MockOrch,
            patch("app.api.v1.cross_doc_analysis.OpenRouterClient"),
        ):
            MockOrch.return_value.run_analysis = AsyncMock(
                side_effect=CrossDocValidationError("bad json")
            )
            resp = client.post(
                f"/api/v1/properties/{prop_id}/cross-doc-analysis",
                json={"period_year": 2024},
            )

        assert resp.status_code == 502


# ---------------------------------------------------------------------------
# GET /properties/{property_id}/cross-doc-analysis/{period_year}
# ---------------------------------------------------------------------------


class TestGetAnalysis:
    def test_get_returns_latest_row(self, client, org_id) -> None:
        prop_id = uuid4()
        mock_row = {
            "id": str(uuid4()),
            "property_id": str(prop_id),
            "period_year": 2024,
            "status": "pending",
            "findings": _valid_result(prop_id),
            "finding_decisions": {},
            "token_usage": 900,
        }

        client.mock_supabase.table.return_value = _table_chain([mock_row])

        resp = client.get(f"/api/v1/properties/{prop_id}/cross-doc-analysis/2024")

        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    def test_get_returns_404_when_not_found(self, client) -> None:
        prop_id = uuid4()
        client.mock_supabase.table.return_value = _table_chain([])

        resp = client.get(f"/api/v1/properties/{prop_id}/cross-doc-analysis/2024")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /cross-doc-analysis/{analysis_id}/findings/{finding_id}
# ---------------------------------------------------------------------------


class TestDecideFinding:
    def test_accept_finding_success(self, client, org_id) -> None:
        analysis_id = uuid4()
        finding_id = str(uuid4())

        with patch(
            "app.api.v1.cross_doc_analysis.update_finding_decision", new=AsyncMock()
        ):
            client.mock_supabase.table.return_value = _table_chain(
                data={"id": str(analysis_id), "organization_id": str(org_id)}
            )

            resp = client.patch(
                f"/api/v1/cross-doc-analysis/{analysis_id}/findings/{finding_id}",
                json={"decision": "accepted", "reason": "Confirmed by senior auditor"},
            )

        assert resp.status_code == 200
        assert resp.json()["decision"] == "accepted"

    def test_invalid_decision_returns_422(self, client) -> None:
        # Pydantic rejects "maybe" before the DB is ever queried — no mock needed.
        analysis_id = uuid4()
        finding_id = str(uuid4())
        resp = client.patch(
            f"/api/v1/cross-doc-analysis/{analysis_id}/findings/{finding_id}",
            json={"decision": "maybe", "reason": "not sure"},
        )
        assert resp.status_code == 422

    def test_wrong_org_returns_403(self, client) -> None:
        analysis_id = uuid4()
        finding_id = str(uuid4())
        different_org = uuid4()

        client.mock_supabase.table.return_value = _table_chain(
            {"id": str(analysis_id), "organization_id": str(different_org)}
        )

        resp = client.patch(
            f"/api/v1/cross-doc-analysis/{analysis_id}/findings/{finding_id}",
            json={"decision": "accepted", "reason": "x"},
        )

        assert resp.status_code == 403

    def test_not_found_analysis_returns_404(self, client) -> None:
        analysis_id = uuid4()
        finding_id = str(uuid4())

        client.mock_supabase.table.return_value = _table_chain(None)

        resp = client.patch(
            f"/api/v1/cross-doc-analysis/{analysis_id}/findings/{finding_id}",
            json={"decision": "accepted", "reason": "x"},
        )

        assert resp.status_code == 404

    def test_non_uuid_finding_id_returns_422(self, client) -> None:
        """Non-UUID finding_id in path is rejected by FastAPI before DB is hit."""
        analysis_id = uuid4()
        resp = client.patch(
            f"/api/v1/cross-doc-analysis/{analysis_id}/findings/not-a-uuid",
            json={"decision": "accepted", "reason": "x"},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Generic 500 handler in trigger endpoint
# ---------------------------------------------------------------------------


class TestTriggerGenericError:
    def test_trigger_generic_exception_returns_500(self, client) -> None:
        prop_id = uuid4()
        client.mock_supabase.table.return_value = _table_chain({"id": str(prop_id)})
        with (
            patch("app.api.v1.cross_doc_analysis.CrossDocOrchestrator") as MockOrch,
            patch("app.api.v1.cross_doc_analysis.OpenRouterClient"),
        ):
            MockOrch.return_value.run_analysis = AsyncMock(
                side_effect=RuntimeError("Unexpected failure")
            )
            resp = client.post(
                f"/api/v1/properties/{prop_id}/cross-doc-analysis",
                json={"period_year": 2024},
            )

        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# Auditor config / overrides endpoints
# ---------------------------------------------------------------------------


class TestAuditorConfigEndpoints:
    def test_update_auditor_config_success(self, client, org_id) -> None:
        client.mock_supabase.table.return_value = _table_chain([])

        resp = client.patch(
            f"/api/v1/organizations/{org_id}/auditor-config",
            json={"market": "NYC", "custom_rules": ["No admin fee on admin fee"]},
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_update_auditor_config_wrong_org_returns_403(self, client) -> None:
        different_org = uuid4()
        resp = client.patch(
            f"/api/v1/organizations/{different_org}/auditor-config",
            json={"market": "Chicago"},
        )
        assert resp.status_code == 403

    def test_update_auditor_overrides_success(self, client) -> None:
        prop_id = uuid4()
        client.mock_supabase.table.return_value = _table_chain({"id": str(prop_id)})

        resp = client.patch(
            f"/api/v1/properties/{prop_id}/auditor-overrides",
            json={"suppressed_finding_categories": ["billing_anomaly"]},
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_update_auditor_overrides_property_not_found_returns_404(
        self, client
    ) -> None:
        """update_auditor_overrides returns 404 when property doesn't belong to org."""
        prop_id = uuid4()
        client.mock_supabase.table.return_value = _table_chain(None)

        resp = client.patch(
            f"/api/v1/properties/{prop_id}/auditor-overrides",
            json={"suppressed_finding_categories": []},
        )

        assert resp.status_code == 404

    def test_update_auditor_config_invalid_body_returns_422(
        self, client, org_id
    ) -> None:
        """Non-string field values in AuditorContext body → 422 from Pydantic."""
        resp = client.patch(
            f"/api/v1/organizations/{org_id}/auditor-config",
            json={"custom_rules": "should-be-a-list"},  # custom_rules expects list[str]
        )
        assert resp.status_code == 422

    def test_update_auditor_overrides_invalid_body_returns_422(self, client) -> None:
        """Non-list suppressed_finding_categories → 422 from Pydantic."""
        prop_id = uuid4()
        resp = client.patch(
            f"/api/v1/properties/{prop_id}/auditor-overrides",
            json={"suppressed_finding_categories": 99},  # expects list[str]
        )
        assert resp.status_code == 422
