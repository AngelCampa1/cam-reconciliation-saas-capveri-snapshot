"""
Seed script to create test data for leakage demonstration.

Run with: python -m scripts.seed_leakage_data
"""

import uuid
from datetime import UTC, datetime

from app.database.client import get_supabase_admin


def main():
    """Seed leakage test data for Test Property GL Fix."""
    supabase = get_supabase_admin()

    org_id = "79b015fb-d583-4e75-aa77-c43ed4439d6a"
    property_id = "381f573f-e8ed-4986-b398-0efa43d0367b"

    # Generate UUIDs
    unit1_id = str(uuid.uuid4())
    unit2_id = str(uuid.uuid4())
    unit3_id = str(uuid.uuid4())
    lease1_id = str(uuid.uuid4())
    lease2_id = str(uuid.uuid4())
    lease3_id = str(uuid.uuid4())

    print(f"Seeding leakage test data for property {property_id}")

    # 1. Check if units exist, skip if so
    existing_units = (
        supabase.table("units")
        .select("id,unit_number")
        .eq("property_id", property_id)
        .execute()
    )
    if existing_units.data:
        print(f"Units already exist ({len(existing_units.data)}), skipping")
        # Use existing IDs
        unit_map = {u["unit_number"]: u["id"] for u in existing_units.data}
        unit1_id = unit_map.get("Suite 101", unit1_id)
        unit2_id = unit_map.get("Suite 201", unit2_id)
        unit3_id = unit_map.get("Suite 301", unit3_id)
    else:
        units = [
            {
                "id": unit1_id,
                "property_id": property_id,
                "unit_number": "Suite 101",
                "floor": 1,
                "rentable_sqft": 15000,
                "usable_sqft": 13500,
                "status": "occupied",
            },
            {
                "id": unit2_id,
                "property_id": property_id,
                "unit_number": "Suite 201",
                "floor": 2,
                "rentable_sqft": 25000,
                "usable_sqft": 22500,
                "status": "occupied",
            },
            {
                "id": unit3_id,
                "property_id": property_id,
                "unit_number": "Suite 301",
                "floor": 3,
                "rentable_sqft": 20000,
                "usable_sqft": 18000,
                "status": "occupied",
            },
        ]
        result = supabase.table("units").insert(units).execute()
        print(f"Created {len(result.data)} units")

    # 2. Check if leases exist, skip if so
    existing_leases = (
        supabase.table("leases")
        .select("id,tenant_name")
        .eq("property_id", property_id)
        .execute()
    )
    if existing_leases.data:
        print(f"Leases already exist ({len(existing_leases.data)}), skipping")
        lease_map = {ls["tenant_name"]: ls["id"] for ls in existing_leases.data}
        lease1_id = lease_map.get("Metro Coffee Co", lease1_id)
        lease2_id = lease_map.get("Pinnacle Financial", lease2_id)
        lease3_id = lease_map.get("HealthFirst Clinic", lease3_id)
    else:
        leases = [
            {
                "id": lease1_id,
                "property_id": property_id,
                "unit_id": unit1_id,
                "tenant_name": "Metro Coffee Co",
                "start_date": "2025-01-01",
                "end_date": "2029-12-31",
                "status": "active",
                "recovery_profile": {"base_year": 2024, "pro_rata_share": 0.25},
            },
            {
                "id": lease2_id,
                "property_id": property_id,
                "unit_id": unit2_id,
                "tenant_name": "Pinnacle Financial",
                "start_date": "2025-01-01",
                "end_date": "2028-12-31",
                "status": "active",
                "recovery_profile": {"base_year": 2024, "pro_rata_share": 0.42},
            },
            {
                "id": lease3_id,
                "property_id": property_id,
                "unit_id": unit3_id,
                "tenant_name": "HealthFirst Clinic",
                "start_date": "2025-01-01",
                "end_date": "2030-12-31",
                "status": "active",
                "recovery_profile": {"base_year": 2024, "pro_rata_share": 0.33},
            },
        ]
        result = supabase.table("leases").insert(leases).execute()
        print(f"Created {len(result.data)} leases")

    # 3. Check if reconciliation snapshots exist for this period
    existing_snapshots = (
        supabase.table("reconciliation_snapshots")
        .select("id")
        .eq("property_id", property_id)
        .eq("period_start_date", "2025-01-01")
        .eq("period_end_date", "2025-12-31")
        .execute()
    )
    if existing_snapshots.data:
        count = len(existing_snapshots.data)
        print(f"Reconciliation snapshots already exist ({count}), skipping")
    else:
        # 3. Create reconciliation snapshots (what SHOULD be billed = $127,500)
        now = datetime.now(UTC).isoformat()
        snapshots = [
            {
                "organization_id": org_id,
                "property_id": property_id,
                "lease_id": lease1_id,
                "period_start_date": "2025-01-01",
                "period_end_date": "2025-12-31",
                "status": "finalized",
                "total_operating_expenses": 180000,
                "grossed_up_expenses": 185000,
                "base_year_amount": 0,
                "tenant_share_before_cap": 46250,
                "tenant_share_after_cap": 46250,
                "admin_fee": 1250,
                "total_recovery": 32500,
                "calculation_trace": [
                    {"step": "pro_rata", "tenant": "Metro Coffee Co"}
                ],
                "finalized_at": now,
            },
            {
                "organization_id": org_id,
                "property_id": property_id,
                "lease_id": lease2_id,
                "period_start_date": "2025-01-01",
                "period_end_date": "2025-12-31",
                "status": "finalized",
                "total_operating_expenses": 180000,
                "grossed_up_expenses": 190000,
                "base_year_amount": 0,
                "tenant_share_before_cap": 79800,
                "tenant_share_after_cap": 79800,
                "admin_fee": 2200,
                "total_recovery": 55000,
                "calculation_trace": [
                    {"step": "pro_rata", "tenant": "Pinnacle Financial"}
                ],
                "finalized_at": now,
            },
            {
                "organization_id": org_id,
                "property_id": property_id,
                "lease_id": lease3_id,
                "period_start_date": "2025-01-01",
                "period_end_date": "2025-12-31",
                "status": "finalized",
                "total_operating_expenses": 180000,
                "grossed_up_expenses": 188000,
                "base_year_amount": 0,
                "tenant_share_before_cap": 62040,
                "tenant_share_after_cap": 62040,
                "admin_fee": 1960,
                "total_recovery": 40000,
                "calculation_trace": [
                    {"step": "pro_rata", "tenant": "HealthFirst Clinic"}
                ],
                "finalized_at": now,
            },
        ]

        result = supabase.table("reconciliation_snapshots").insert(snapshots).execute()
        count = len(result.data)
        print(f"Created {count} reconciliation snapshots (total: $127,500)")

    # 4. Delete existing billed amounts for this property/period
    supabase.table("actual_billed_amounts").delete().eq("property_id", property_id).eq(
        "period_start_date", "2025-01-01"
    ).eq("period_end_date", "2025-12-31").execute()
    print("Deleted old billed amounts")

    # 5. Create actual billed amounts (what WAS billed = $85,000)
    billed = [
        {
            "organization_id": org_id,
            "property_id": property_id,
            "lease_id": lease1_id,
            "tenant_name": "Metro Coffee Co",
            "billed_amount": 22000,
            "period_start_date": "2025-01-01",
            "period_end_date": "2025-12-31",
            "source_type": "manual",
        },
        {
            "organization_id": org_id,
            "property_id": property_id,
            "lease_id": lease2_id,
            "tenant_name": "Pinnacle Financial",
            "billed_amount": 38000,
            "period_start_date": "2025-01-01",
            "period_end_date": "2025-12-31",
            "source_type": "manual",
        },
        {
            "organization_id": org_id,
            "property_id": property_id,
            "lease_id": lease3_id,
            "tenant_name": "HealthFirst Clinic",
            "billed_amount": 25000,
            "period_start_date": "2025-01-01",
            "period_end_date": "2025-12-31",
            "source_type": "manual",
        },
    ]

    result = supabase.table("actual_billed_amounts").insert(billed).execute()
    print(f"Created {len(result.data)} actual billed records (total: $85,000)")

    print("\n=== LEAKAGE SUMMARY ===")
    print("CapVeri Calculated: $127,500")
    print("Actually Billed:     $85,000")
    print("Recovery Opportunity: $42,500 (33.3%)")
    print("======================")


if __name__ == "__main__":
    main()
