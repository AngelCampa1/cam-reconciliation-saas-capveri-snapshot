"""Paywall gate tests — require_full_access on mutating endpoints.

Each test class covers one changed module. For each module we verify:
1. An org WITHOUT a subscription → mutating POST/PUT/PATCH/DELETE returns 402.
2. An org WITH an active subscription → gate passes (reaches normal logic).
3. At least one GET/read route stays open (returns 200/404, not 402).

The test strategy mirrors the existing test_export_v2.py pattern:
- Seed subscriptions via mock_supabase._test_data["subscriptions"].
- Empty subscriptions list → has_full_access returns False → 402.
- Non-empty active subscription → has_full_access returns True → passes gate.
"""

import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import status

from tests.conftest import _HAS_FULL_ACCESS_TARGETS, ORG_A_ID, ORG_A_PROPERTY_ID

# This suite verifies the real paywall: it seeds/clears subscriptions and asserts
# 402s, so it must run against the real has_full_access (not the autouse patch).
pytestmark = pytest.mark.real_entitlements

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

PROPERTY_ID = str(ORG_A_PROPERTY_ID)


def _seed_active_subscription(client) -> None:
    """Seed an active subscription so require_full_access passes."""
    client.mock_supabase._test_data["subscriptions"] = [
        {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "plan": "professional",
            "status": "active",
            "stripe_subscription_id": "sub_test_gate",
        }
    ]


def _clear_subscription(client) -> None:
    """Remove subscriptions so require_full_access blocks (returns 402)."""
    client.mock_supabase._test_data["subscriptions"] = []


def _seed_finalized_snapshot(client) -> str:
    """Seed one finalized snapshot; returns its id."""
    snap_id = str(uuid4())
    lease_id = str(uuid4())
    client.mock_supabase._test_data["reconciliation_snapshots"] = [
        {
            "id": snap_id,
            "organization_id": str(ORG_A_ID),
            "property_id": PROPERTY_ID,
            "lease_id": lease_id,
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "status": "finalized",
            "finalized_at": datetime.now(UTC).isoformat(),
            "finalized_by_user_id": str(uuid4()),
            "total_operating_expenses": "150000.00",
            "grossed_up_expenses": "157895.00",
            "base_year_amount": "140000.00",
            "tenant_share_before_cap": "39473.75",
            "tenant_share_after_cap": "38289.54",
            "admin_fee": "5743.43",
            "total_recovery": "44032.97",
            "calculation_trace": [],
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
    ]
    client.mock_supabase._test_data["organizations"] = [
        {"id": str(ORG_A_ID), "name": "Test Org"}
    ]
    client.mock_supabase._test_data["properties"] = [
        {
            "id": PROPERTY_ID,
            "organization_id": str(ORG_A_ID),
            "name": "Test Property",
            "address_line1": "100 Main St",
            "city": "San Francisco",
            "state": "CA",
            "postal_code": "94102",
        }
    ]
    client.mock_supabase._test_data["leases"] = [
        {"id": lease_id, "property_id": PROPERTY_ID, "tenant_name": "Acme Inc"}
    ]
    return snap_id


# ---------------------------------------------------------------------------
# export.py (POST /api/v1/export/pdf/preview and friends)
# ---------------------------------------------------------------------------


class TestExportV2PaywallGate:
    """POST /api/v1/export/pdf/preview is gated; GET /export/history stays open."""

    def test_pdf_preview_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/export/pdf/preview",
            json={"property_id": PROPERTY_ID, "year": 2024},
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_pdf_preview_passes_when_subscribed(self, org_a_member_client):
        _seed_finalized_snapshot(org_a_member_client)
        _seed_active_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/export/pdf/preview",
            json={"property_id": PROPERTY_ID, "year": 2024},
        )
        # Gate passes; result depends on data — not 402
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED

    def test_export_history_get_stays_open_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.get(
            "/api/v1/export/history",
            params={"property_id": PROPERTY_ID},
        )
        # GET is not gated — should not return 402
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# reports.py (POST /api/v1/reports/historical/pdf)
# ---------------------------------------------------------------------------


class TestReportsPaywallGate:
    """POST /api/v1/reports/historical/pdf is gated."""

    def test_historical_pdf_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/reports/historical/pdf",
            json={"property_id": PROPERTY_ID, "years": [2023, 2024]},
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_historical_pdf_passes_when_subscribed(self, org_a_member_client):
        _seed_active_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/reports/historical/pdf",
            json={"property_id": PROPERTY_ID, "years": [2023, 2024]},
        )
        # Gate passes; service may 400/500 due to missing data, but not 402
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED

    def test_historical_excel_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/reports/historical/excel",
            json={"property_id": PROPERTY_ID, "years": [2023, 2024]},
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# analysis.py (POST /api/v1/analysis/year-over-year)
# ---------------------------------------------------------------------------


class TestAnalysisPaywallGate:
    """POST /api/v1/analysis/year-over-year is gated;
    GET /analysis/properties/{id}/available-years stays open."""

    def test_year_over_year_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/analysis/year-over-year",
            json={
                "property_id": PROPERTY_ID,
                "years": [2023, 2024],
                "use_fuzzy_matching": False,
            },
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_year_over_year_passes_when_subscribed(self, org_a_member_client):
        _seed_active_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/analysis/year-over-year",
            json={
                "property_id": PROPERTY_ID,
                "years": [2023, 2024],
                "use_fuzzy_matching": False,
            },
        )
        # Gate passes; upstream service may still 400/500 without real data
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED

    def test_available_years_get_stays_open_when_unsubscribed(
        self, org_a_member_client
    ):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.get(
            f"/api/v1/analysis/properties/{PROPERTY_ID}/available-years"
        )
        # GET is not gated
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# cross_doc_analysis.py (POST trigger)
# ---------------------------------------------------------------------------


class TestCrossDocAnalysisPaywallGate:
    """POST /api/v1/properties/{id}/cross-doc-analysis is gated;
    GET same route stays open."""

    def test_trigger_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            f"/api/v1/properties/{PROPERTY_ID}/cross-doc-analysis",
            json={"period_year": 2024},
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_trigger_passes_when_subscribed(self, org_a_member_client):
        _seed_active_subscription(org_a_member_client)
        # Property must exist for org check inside the handler
        org_a_member_client.mock_supabase._test_data["properties"] = [
            {
                "id": PROPERTY_ID,
                "organization_id": str(ORG_A_ID),
                "name": "Test Property",
            }
        ]
        org_a_member_client.mock_supabase._test_data["cross_doc_analyses"] = []
        response = org_a_member_client.post(
            f"/api/v1/properties/{PROPERTY_ID}/cross-doc-analysis",
            json={"period_year": 2024},
        )
        # Gate passes — endpoint may still 404/422/500 without real docs
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED

    def test_get_cross_doc_analysis_stays_open(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        org_a_member_client.mock_supabase._test_data["cross_doc_analyses"] = []
        response = org_a_member_client.get(
            f"/api/v1/properties/{PROPERTY_ID}/cross-doc-analysis/2024"
        )
        # GET is not gated (returns 404 for missing data, not 402)
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# demand_letter.py (POST /api/v1/demand-letter/generate)
# ---------------------------------------------------------------------------


class TestDemandLetterPaywallGate:
    """POST /api/v1/demand-letter/generate is gated."""

    _payload = {
        "snapshot_id": str(uuid4()),
        "state": "TX",
        "landlord_name": "Jane Smith",
        "payment_deadline_days": 30,
    }

    def test_generate_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/demand-letter/generate",
            json=self._payload,
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_generate_passes_when_subscribed(self, org_a_member_client):
        _seed_active_subscription(org_a_member_client)
        snap_id = _seed_finalized_snapshot(org_a_member_client)
        payload = {**self._payload, "snapshot_id": snap_id}
        response = org_a_member_client.post(
            "/api/v1/demand-letter/generate",
            json=payload,
        )
        # Gate passes — may 200 or fail on downstream logic, not 402
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# compliance.py (POST /api/v1/compliance/sb1103)
# ---------------------------------------------------------------------------


class TestCompliancePaywallGate:
    """POST /api/v1/compliance/sb1103 and PATCH are gated;
    GET list stays open."""

    def test_create_sb1103_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/compliance/sb1103",
            json={
                "property_id": PROPERTY_ID,
                "lease_id": str(uuid4()),
                "requested_by_name": "Alice",
                "requested_by_email": "alice@example.com",
                "request_date": "2024-06-01",
            },
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_create_sb1103_passes_when_subscribed(self, org_a_member_client):
        _seed_active_subscription(org_a_member_client)
        lease_id = str(uuid4())
        org_a_member_client.mock_supabase._test_data["properties"] = [
            {"id": PROPERTY_ID, "organization_id": str(ORG_A_ID), "name": "Prop"}
        ]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {"id": lease_id, "property_id": PROPERTY_ID}
        ]
        response = org_a_member_client.post(
            "/api/v1/compliance/sb1103",
            json={
                "property_id": PROPERTY_ID,
                "lease_id": lease_id,
                "requested_by_name": "Alice",
                "requested_by_email": "alice@example.com",
                "request_date": "2024-06-01",
            },
        )
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED

    def test_list_sb1103_stays_open_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        org_a_member_client.mock_supabase._test_data["sb1103_requests"] = []
        response = org_a_member_client.get("/api/v1/compliance/sb1103")
        # GET is not gated
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# disputes.py (PUT /{id}/status is gated; GET list stays open)
# ---------------------------------------------------------------------------


class TestDisputesPaywallGate:
    """PUT /api/v1/disputes/{id}/status is gated; GET list stays open."""

    def test_update_status_blocked_when_unsubscribed(self, org_a_admin_client):
        _clear_subscription(org_a_admin_client)
        dispute_id = str(uuid4())
        response = org_a_admin_client.put(
            f"/api/v1/disputes/{dispute_id}/status",
            json={"status": "under_review"},
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_update_status_passes_when_subscribed(self, org_a_admin_client):
        _seed_active_subscription(org_a_admin_client)
        dispute_id = str(uuid4())
        response = org_a_admin_client.put(
            f"/api/v1/disputes/{dispute_id}/status",
            json={"status": "under_review"},
        )
        # Gate passes — may 404 for unknown dispute, not 402
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED

    def test_list_disputes_stays_open_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        org_a_member_client.mock_supabase._test_data["disputes"] = []
        response = org_a_member_client.get("/api/v1/disputes")
        # GET is not gated
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# extraction.py (POST /{id}/process is gated; GET list stays open)
# ---------------------------------------------------------------------------


class TestExtractionPaywallGate:
    """POST /api/v1/extractions/{id}/process is gated;
    GET /api/v1/extractions stays open."""

    def test_process_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        doc_id = str(uuid4())
        response = org_a_member_client.post(f"/api/v1/extractions/{doc_id}/process")
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_process_passes_when_subscribed(self, org_a_member_client):
        _seed_active_subscription(org_a_member_client)
        doc_id = str(uuid4())
        response = org_a_member_client.post(f"/api/v1/extractions/{doc_id}/process")
        # Gate passes — may 404 (document not found), not 402
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED

    def test_list_extractions_stays_open_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        org_a_member_client.mock_supabase._test_data["documents"] = []
        response = org_a_member_client.get("/api/v1/extractions")
        # GET is not gated
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# properties.py (POST/PUT/DELETE gated; GET list stays open). The legacy
# free-audit "add property" gate is retired in favor of require_full_access.
# ---------------------------------------------------------------------------


class TestPropertiesPaywallGate:
    """Property create/update/delete are gated; GET list stays open."""

    _create_payload = {
        "name": "New Building",
        "address_line1": "123 Main St",
        "city": "San Francisco",
        "state": "CA",
        "postal_code": "94102",
        "total_rentable_sqft": 5000,
        "total_usable_sqft": 4000,
        "common_area_sqft": 1000,
    }

    def test_create_property_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/properties", json=self._create_payload
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_create_property_passes_when_subscribed(self, org_a_member_client):
        _seed_active_subscription(org_a_member_client)
        org_a_member_client.mock_supabase._test_data["properties"] = []
        response = org_a_member_client.post(
            "/api/v1/properties", json=self._create_payload
        )
        # Gate passes — downstream may still 4xx/5xx, but not the 402 paywall
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED

    def test_update_property_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.put(
            f"/api/v1/properties/{PROPERTY_ID}", json={"name": "Renamed"}
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED

    def test_list_properties_stays_open_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        org_a_member_client.mock_supabase._test_data["properties"] = []
        response = org_a_member_client.get("/api/v1/properties")
        # GET is not gated
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# ingestion.py (GL import). upload/apply-mapping (editor) and
# retry/delete/create-mapping (admin) are gated; GET batches stays open.
# ---------------------------------------------------------------------------


class TestIngestionPaywallGate:
    """GL-import mutations are gated; GET /ingestion/batches stays open."""

    def test_upload_blocked_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        response = org_a_member_client.post(
            "/api/v1/ingestion/upload",
            data={"property_id": PROPERTY_ID},
            files={"file": ("gl.csv", b"date,amount\n2024-01-01,100\n", "text/csv")},
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_create_mapping_blocked_when_unsubscribed(self, org_a_admin_client):
        _clear_subscription(org_a_admin_client)
        response = org_a_admin_client.post(
            "/api/v1/ingestion/mappings",
            json={
                "source_system": "yardi",
                "name": "My Mapping",
                "column_mappings": {"date": "gl_date"},
            },
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "subscription_required" in response.json()["detail"]

    def test_list_batches_stays_open_when_unsubscribed(self, org_a_member_client):
        _clear_subscription(org_a_member_client)
        org_a_member_client.mock_supabase._test_data["import_batches"] = []
        response = org_a_member_client.get("/api/v1/ingestion/batches")
        # GET is not gated
        assert response.status_code != status.HTTP_402_PAYMENT_REQUIRED


# ---------------------------------------------------------------------------
# Conftest drift guard
# ---------------------------------------------------------------------------


def test_full_access_patch_targets_cover_all_direct_importers() -> None:
    """The autouse ``grant_full_access_by_default`` fixture patches the bound
    names in ``_HAS_FULL_ACCESS_TARGETS``. ``require_full_access`` reaches the
    gate via a lazy import (covered by the ``entitlements`` target), but a router
    that imports ``has_full_access`` at module level and calls it directly would
    silently bypass the patch and break unrelated endpoint tests. Fail loudly if
    such an importer is added without updating the targets list."""
    api_dir = Path(__file__).parent.parent / "app" / "api" / "v1"
    pattern = re.compile(
        r"from app\.services\.billing\.entitlements import [^\n]*\bhas_full_access\b"
    )
    missing: list[str] = []
    for module_path in api_dir.glob("*.py"):
        if pattern.search(module_path.read_text()):
            bound_name = f"app.api.v1.{module_path.stem}.has_full_access"
            if bound_name not in _HAS_FULL_ACCESS_TARGETS:
                missing.append(bound_name)
    assert not missing, (
        "These modules import has_full_access directly but are not in "
        f"conftest._HAS_FULL_ACCESS_TARGETS: {missing}. Add them so the autouse "
        "full-access patch keeps working."
    )
