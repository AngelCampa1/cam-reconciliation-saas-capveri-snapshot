"""Tests for denominator change analysis API endpoint."""

from datetime import UTC, datetime
from decimal import Decimal
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
from app.models.denominator_change import (
    DenominatorChange,
    DenominatorChangeReport,
    DenominatorChangeType,
    TenantShareImpact,
)
from app.models.enums import UserRole
from app.models.user import User
from app.services.analysis.denominator_change import NoComparableSnapshotsError


def _make_report(changes: int = 1, impacts: int = 0) -> DenominatorChangeReport:
    return DenominatorChangeReport(
        property_id=uuid4(),
        property_name="Oakwood Plaza",
        prior_period="2023-01-01 to 2023-12-31",
        current_period="2024-01-01 to 2024-12-31",
        prior_total_rsf=Decimal("100000"),
        current_total_rsf=Decimal("105000"),
        rsf_delta=Decimal("5000"),
        rsf_delta_percent=Decimal("5.00"),
        changes=[
            DenominatorChange(
                change_type=DenominatorChangeType.RSF_REMEASUREMENT,
                description="Building re-measured",
                prior_value="100,000 RSF",
                current_value="105,000 RSF",
                impact_description="5% increase",
            )
        ][:changes],
        tenant_impacts=[
            TenantShareImpact(
                lease_id=uuid4(),
                tenant_name="Tenant A",
                prior_pro_rata_share=Decimal("0.10"),
                current_pro_rata_share=Decimal("0.12"),
                share_delta_pct_points=Decimal("2.00"),
                prior_estimated_recovery=Decimal("50000"),
                current_estimated_recovery=Decimal("60000"),
                recovery_delta=Decimal("10000"),
                contributing_changes=[DenominatorChangeType.RSF_REMEASUREMENT],
            )
        ][:impacts],
        summary="Test summary",
        generated_at=datetime.now(UTC),
    )


@pytest.fixture
def test_org_id():
    return uuid4()


@pytest.fixture
def test_user(test_org_id):
    return User(
        id=uuid4(),
        email="test@example.com",
        organization_id=test_org_id,
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def test_client(test_user, test_org_id):
    mock_supabase = MagicMock()

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
    yield client
    app.dependency_overrides.clear()


class TestDenominatorChangeEndpoint:
    def test_valid_request_returns_report(self, test_client):
        report = _make_report(changes=1, impacts=1)
        with patch("app.api.v1.analysis.DenominatorChangeService") as MockService:
            MockService.return_value.generate_report = AsyncMock(return_value=report)
            resp = test_client.post(
                "/api/v1/analysis/denominator-change",
                json={
                    "property_id": str(uuid4()),
                    "current_period_start": "2024-01-01",
                    "current_period_end": "2024-12-31",
                    "prior_period_start": "2023-01-01",
                    "prior_period_end": "2023-12-31",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["property_name"] == "Oakwood Plaza"
        assert len(data["changes"]) == 1
        assert len(data["tenant_impacts"]) == 1

    def test_missing_property_id_returns_422(self, test_client):
        resp = test_client.post(
            "/api/v1/analysis/denominator-change",
            json={
                "current_period_start": "2024-01-01",
                "current_period_end": "2024-12-31",
            },
        )
        assert resp.status_code == 422

    def test_no_current_snapshots_returns_200_with_comparison_unavailable(
        self, test_client
    ):
        """Missing current-period snapshots: 200 with comparison_available=False."""
        with patch("app.api.v1.analysis.DenominatorChangeService") as MockService:
            MockService.return_value.generate_report = AsyncMock(
                side_effect=NoComparableSnapshotsError(
                    "current",
                    "No finalized snapshots found for current period 2024-01-01 to 2024-12-31",
                )
            )
            resp = test_client.post(
                "/api/v1/analysis/denominator-change",
                json={
                    "property_id": str(uuid4()),
                    "current_period_start": "2024-01-01",
                    "current_period_end": "2024-12-31",
                    "prior_period_start": "2023-01-01",
                    "prior_period_end": "2023-12-31",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["comparison_available"] is False
        assert data["missing_period"] == "current"
        assert data["changes"] == []
        assert data["tenant_impacts"] == []

    def test_no_prior_snapshots_returns_200_with_comparison_unavailable(
        self, test_client
    ):
        """Missing prior-period snapshots: 200 with comparison_available=False."""
        with patch("app.api.v1.analysis.DenominatorChangeService") as MockService:
            MockService.return_value.generate_report = AsyncMock(
                side_effect=NoComparableSnapshotsError(
                    "prior",
                    "No finalized snapshots found for prior period",
                )
            )
            resp = test_client.post(
                "/api/v1/analysis/denominator-change",
                json={
                    "property_id": str(uuid4()),
                    "current_period_start": "2024-01-01",
                    "current_period_end": "2024-12-31",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["comparison_available"] is False
        assert data["missing_period"] == "prior"
        assert data["changes"] == []
        assert data["tenant_impacts"] == []

    def test_invalid_params_still_returns_400(self, test_client):
        """Genuine invalid params (plain ValueError) still return 400."""
        with patch("app.api.v1.analysis.DenominatorChangeService") as MockService:
            MockService.return_value.generate_report = AsyncMock(
                side_effect=ValueError("Invalid parameter: bad value")
            )
            resp = test_client.post(
                "/api/v1/analysis/denominator-change",
                json={
                    "property_id": str(uuid4()),
                    "current_period_start": "2024-01-01",
                    "current_period_end": "2024-12-31",
                    "prior_period_start": "2023-01-01",
                    "prior_period_end": "2023-12-31",
                },
            )
        assert resp.status_code == 400

    def test_auto_detect_prior_period(self, test_client):
        report = _make_report()
        with patch("app.api.v1.analysis.DenominatorChangeService") as MockService:
            MockService.return_value.generate_report = AsyncMock(return_value=report)
            resp = test_client.post(
                "/api/v1/analysis/denominator-change",
                json={
                    "property_id": str(uuid4()),
                    "current_period_start": "2024-01-01",
                    "current_period_end": "2024-12-31",
                },
            )
        assert resp.status_code == 200
