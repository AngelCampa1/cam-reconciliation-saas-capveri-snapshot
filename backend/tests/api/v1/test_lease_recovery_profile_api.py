"""Tests for lease recovery profile PUT endpoint — base_year_adjustments."""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.leases import router
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

SAMPLE_ORG_ID = uuid4()
SAMPLE_USER_ID = uuid4()
SAMPLE_LEASE_ID = uuid4()


def make_user() -> User:
    return User(
        id=SAMPLE_USER_ID,
        organization_id=SAMPLE_ORG_ID,
        email="test@example.com",
        full_name="Test User",
        role="admin",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def base_recovery_profile() -> dict:
    """Minimal valid recovery_profile JSONB row."""
    return {
        "pro_rata_share": "0.05",
        "cap_type": "none",
        "cap_rate": None,
        "admin_fee_percentage": "0",
        "excluded_pools": [],
        "base_year": 2021,
        "base_year_amount": "100000.00",
        "gross_up_base_year": False,
        "base_year_adjustments": [],
        "rsf_measurement_standard": None,
        "rsf_measurement_date": None,
    }


def make_lease_row(recovery_profile: dict | None = None) -> dict:
    return {
        "id": str(SAMPLE_LEASE_ID),
        "property_id": str(uuid4()),
        "unit_id": str(uuid4()),
        "tenant_name": "Acme Corp",
        "status": "active",
        "start_date": "2020-01-01",
        "end_date": "2030-12-31",
        "recovery_profile": recovery_profile or base_recovery_profile(),
        "organization_id": str(SAMPLE_ORG_ID),
        "created_at": "2020-01-01T00:00:00+00:00",
        "updated_at": "2020-01-01T00:00:00+00:00",
    }


@pytest.fixture
def mock_supabase():
    return MagicMock()


@pytest.fixture
def client(mock_supabase):
    app = FastAPI()
    app.include_router(router, prefix="/leases")
    register_exception_handlers(app)
    register_custom_exception_handlers(app)

    mock_user = make_user()
    mock_ctx = OrganizationContext(
        user=mock_user,
        organization_id=SAMPLE_ORG_ID,
        client=mock_supabase,
    )
    app.dependency_overrides[get_org_scoped_context] = lambda: mock_ctx
    app.dependency_overrides[get_current_admin_user] = lambda: mock_user
    return TestClient(app)


def _mock_get_existing(mock_supabase: MagicMock, profile: dict | None = None) -> None:
    """Wire mock_supabase so the GET-existing-profile call returns profile data."""
    get_result = MagicMock()
    get_result.data = {"recovery_profile": profile or base_recovery_profile()}
    (
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = get_result


def _mock_update(mock_supabase: MagicMock, updated_row: dict) -> None:
    """Wire mock_supabase so the UPDATE call returns updated_row."""
    update_result = MagicMock()
    update_result.data = [updated_row]
    (
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value
    ) = update_result


def _mock_term_service(mock_supabase: MagicMock) -> None:
    """Wire mock_supabase so the term version INSERT call does not raise."""
    insert_result = MagicMock()
    insert_result.data = [{"id": str(uuid4())}]
    mock_supabase.table.return_value.insert.return_value.execute.return_value = (
        insert_result
    )


class TestPutRecoveryProfileAdjustments:
    """PUT /{lease_id}/recovery-profile — base_year_adjustments field."""

    def test_put_adds_adjustment_items(self, client, mock_supabase):
        """Adjustment items are accepted and stored in recovery_profile."""
        existing_profile = base_recovery_profile()
        _mock_get_existing(mock_supabase, existing_profile)

        expected_profile = {
            **existing_profile,
            "base_year_adjustments": [
                {
                    "service_name": "24/7 Security",
                    "imputed_amount": "18000.00",
                    "justification": "Added July 2023",
                }
            ],
        }
        _mock_update(mock_supabase, make_lease_row(expected_profile))
        _mock_term_service(mock_supabase)

        payload = {
            "base_year_adjustments": [
                {
                    "service_name": "24/7 Security",
                    "imputed_amount": "18000.00",
                    "justification": "Added July 2023",
                }
            ]
        }
        resp = client.put(f"/leases/{SAMPLE_LEASE_ID}/recovery-profile", json=payload)
        assert resp.status_code == 200

    def test_put_rejects_negative_adjustment(self, client, mock_supabase):
        """Negative imputed_amount is rejected (4xx error)."""
        _mock_get_existing(mock_supabase, base_recovery_profile())

        payload = {
            "base_year_adjustments": [
                {
                    "service_name": "Bad",
                    "imputed_amount": "-100.00",
                    "justification": "Should fail",
                }
            ]
        }
        resp = client.put(f"/leases/{SAMPLE_LEASE_ID}/recovery-profile", json=payload)
        assert resp.status_code >= 400

    def test_put_rejects_empty_service_name(self, client, mock_supabase):
        """Empty service_name is rejected (4xx error)."""
        _mock_get_existing(mock_supabase, base_recovery_profile())

        payload = {
            "base_year_adjustments": [
                {
                    "service_name": "",
                    "imputed_amount": "10000.00",
                    "justification": "test",
                }
            ]
        }
        resp = client.put(f"/leases/{SAMPLE_LEASE_ID}/recovery-profile", json=payload)
        assert resp.status_code >= 400

    def test_put_empty_list_clears_adjustments(self, client, mock_supabase):
        """Sending empty list clears existing adjustments."""
        existing_profile = {
            **base_recovery_profile(),
            "base_year_adjustments": [
                {
                    "service_name": "Security",
                    "imputed_amount": "18000.00",
                    "justification": "Added 2023",
                }
            ],
        }
        _mock_get_existing(mock_supabase, existing_profile)

        expected_profile = {**existing_profile, "base_year_adjustments": []}
        _mock_update(mock_supabase, make_lease_row(expected_profile))
        _mock_term_service(mock_supabase)

        payload = {"base_year_adjustments": []}
        resp = client.put(f"/leases/{SAMPLE_LEASE_ID}/recovery-profile", json=payload)
        assert resp.status_code == 200
