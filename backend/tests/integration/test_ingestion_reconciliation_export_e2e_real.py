"""Real database E2E coverage for ingestion -> reconciliation -> export."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = [pytest.mark.integration, pytest.mark.e2e]


FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


def _seed_reconciliation_prerequisites(
    real_supabase_client,
    property_id: str,
    organization_id: str,
) -> dict[str, str]:
    unit_id = str(uuid4())
    lease_id = str(uuid4())

    real_supabase_client.table("subscriptions").upsert(
        {
            "organization_id": organization_id,
            "stripe_subscription_id": f"sub_e2e_{organization_id[-12:]}",
            "stripe_customer_id": f"cus_e2e_{organization_id[-12:]}",
            "plan": "professional",
            "status": "active",
            "current_period_start": datetime.now(UTC).isoformat(),
            "current_period_end": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
            "cancel_at_period_end": False,
        },
        on_conflict="organization_id",
    ).execute()

    real_supabase_client.table("units").insert(
        {
            "id": unit_id,
            "property_id": property_id,
            "unit_number": "E2E-100",
            "rentable_sqft": 10000,
            "usable_sqft": 9000,
            "floor": 1,
            "status": "occupied",
            "space_type": "office",
        }
    ).execute()

    real_supabase_client.table("leases").insert(
        {
            "id": lease_id,
            "property_id": property_id,
            "unit_id": unit_id,
            "tenant_name": "E2E Pipeline Tenant",
            "start_date": "2023-01-01",
            "end_date": "2027-12-31",
            "status": "active",
            "recovery_profile": {
                "base_year": None,
                "base_year_amount": None,
                "pro_rata_share": "0.10",
                "cap_type": "none",
                "cap_rate": None,
                "admin_fee_percentage": "0.15",
                "excluded_pools": [],
                "accounting_basis": "cash",
            },
        }
    ).execute()

    return {"unit_id": unit_id, "lease_id": lease_id}


def test_csv_ingestion_to_reconciliation_snapshot_to_export(
    e2e_client_org_a,
    real_supabase_client,
    seed_e2e_properties,
    e2e_user_org_a,
):
    """Exercise the real backend pipeline without mocking calculation logic."""
    property_id = seed_e2e_properties["id"]
    organization_id = e2e_user_org_a["organization_id"]
    user_id = e2e_user_org_a["id"]
    original_user = (
        real_supabase_client.table("users")
        .select("role")
        .eq("id", user_id)
        .maybe_single()
        .execute()
        .data
        or {}
    )
    original_role = original_user.get("role", "member")

    try:
        real_supabase_client.table("users").update({"role": "admin"}).eq(
            "id", user_id
        ).execute()
        _seed_reconciliation_prerequisites(
            real_supabase_client,
            property_id=str(property_id),
            organization_id=str(organization_id),
        )

        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_minimal.csv"
        upload_response = e2e_client_org_a.post(
            "/api/v1/ingestion/upload",
            files={
                "file": (
                    "gl_export_minimal.csv",
                    fixture_path.read_bytes(),
                    "text/csv",
                )
            },
            data={"property_id": str(property_id)},
        )
        assert upload_response.status_code == 200, upload_response.text
        upload_data = upload_response.json()
        assert upload_data["row_count"] > 0
        batch_id = upload_data["batch_id"]

        batch = (
            real_supabase_client.table("import_batches")
            .select("status, row_count")
            .eq("id", batch_id)
            .maybe_single()
            .execute()
            .data
        )
        assert batch["status"] == "completed"
        assert batch["row_count"] == upload_data["row_count"]

        gl_rows = (
            real_supabase_client.table("gl_entries")
            .select("id")
            .eq("import_batch_id", batch_id)
            .execute()
            .data
        )
        assert len(gl_rows) == upload_data["row_count"]

        calculate_response = e2e_client_org_a.post(
            "/api/v1/reconciliation/calculate",
            json={
                "property_id": str(property_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
                "force_recalculate": True,
            },
        )
        assert calculate_response.status_code == 202, calculate_response.text
        job_id = calculate_response.json()["job_id"]

        job_response = e2e_client_org_a.get(f"/api/v1/reconciliation/jobs/{job_id}")
        assert job_response.status_code == 200, job_response.text
        job_data = job_response.json()
        assert job_data["status"] == "completed"
        assert len(job_data["snapshot_ids"]) == 1
        snapshot_id = job_data["snapshot_ids"][0]

        snapshot_response = e2e_client_org_a.get(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}?include_trace=true"
        )
        assert snapshot_response.status_code == 200, snapshot_response.text
        snapshot_data = snapshot_response.json()
        assert snapshot_data["status"] == "draft"
        assert float(snapshot_data["total_recovery"]) > 0
        assert snapshot_data["calculation_trace"]

        finalize_response = e2e_client_org_a.post(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}/finalize"
        )
        assert finalize_response.status_code == 200, finalize_response.text
        assert finalize_response.json()["status"] == "finalized"

        export_response = e2e_client_org_a.get(
            f"/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp"
            "?format=yardi"
        )
        assert export_response.status_code == 200, export_response.text
        assert "text/csv" in export_response.headers["content-type"]
        assert "E2E Pipeline Tenant" in export_response.text
        assert str(snapshot_id) in export_response.text
    finally:
        real_supabase_client.table("users").update({"role": original_role}).eq(
            "id", user_id
        ).execute()
