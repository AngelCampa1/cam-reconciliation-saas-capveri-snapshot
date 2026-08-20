"""
Leakage Calculation Service.

Compares CapVeri's calculated recovery amounts against what users
actually billed tenants to identify leakage (recovery opportunity).
"""

from datetime import date
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from pydantic import BaseModel, Field

from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages, fetch_all_pages_chunked_in


def _to_row(item: Any) -> dict[str, Any] | None:
    """Normalize Supabase row payloads to dictionaries."""
    if isinstance(item, dict):
        return cast(dict[str, Any], item)
    return None


class LeakageBreakdown(BaseModel):
    """Breakdown of leakage by tenant."""

    tenant_name: str
    calculated_amount: Decimal
    billed_amount: Decimal
    difference: Decimal
    difference_pct: float


class LeakageResult(BaseModel):
    """Result of leakage calculation."""

    property_id: UUID
    period_start: date
    period_end: date
    capveri_calculated: Decimal = Field(
        description="What CapVeri calculated should be billed"
    )
    actual_billed: Decimal = Field(description="What was actually billed to tenants")
    leakage: Decimal = Field(
        description="Difference: calculated - actual (recovery opportunity)"
    )
    leakage_pct: float = Field(description="Leakage as percentage of calculated amount")
    has_reconciliation_data: bool = Field(
        description="Whether reconciliation data exists"
    )
    has_gl_data: bool = Field(
        description="Whether GL data (import batches) exists for this property"
    )
    has_billing_data: bool = Field(description="Whether actual billed data exists")
    breakdown: list[LeakageBreakdown] = Field(
        default_factory=list, description="Per-tenant breakdown if data available"
    )


def calculate_leakage(
    organization_id: UUID,
    property_id: UUID,
    period_start: date,
    period_end: date,
    include_drafts: bool = False,
) -> LeakageResult:
    """
    Calculate leakage by comparing CapVeri calculations vs actual billed.

    Args:
        organization_id: Organization context
        property_id: Property to analyze
        period_start: Start of analysis period
        period_end: End of analysis period

    Returns:
        LeakageResult with comparison and recovery opportunity
    """
    supabase = get_supabase_admin()

    property_result = (
        supabase.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(organization_id))
        .limit(1)
        .execute()
    )
    if not property_result.data:
        return LeakageResult(
            property_id=property_id,
            period_start=period_start,
            period_end=period_end,
            capveri_calculated=Decimal("0"),
            actual_billed=Decimal("0"),
            leakage=Decimal("0"),
            leakage_pct=0.0,
            has_reconciliation_data=False,
            has_gl_data=False,
            has_billing_data=False,
            breakdown=[],
        )

    # Fetch reconciliation snapshots (what SHOULD be billed)
    recon_query = (
        supabase.table("reconciliation_snapshots")
        .select("lease_id, total_recovery, period_start_date, period_end_date")
        .eq("organization_id", str(organization_id))
        .eq("property_id", str(property_id))
        .lte("period_start_date", period_end.isoformat())
        .gte("period_end_date", period_start.isoformat())
    )
    if include_drafts:
        recon_query = recon_query.in_("status", ["finalized", "draft"])
    else:
        recon_query = recon_query.eq("status", "finalized")
    recon_data = fetch_all_pages(lambda: recon_query)
    has_reconciliation_data = len(recon_data) > 0

    # Check for import batches (GL data uploaded but not yet reconciled)
    import_batches_result = (
        supabase.table("import_batches")
        .select("id")
        .eq("organization_id", str(organization_id))
        .eq("property_id", str(property_id))
        .limit(1)
        .execute()
    )
    has_gl_data = len(import_batches_result.data or []) > 0 or has_reconciliation_data

    # Collect unique lease_ids to lookup tenant names
    lease_ids: list[str] = []
    for raw_snapshot in recon_data:
        snapshot = _to_row(raw_snapshot)
        if snapshot is None:
            continue
        lease_id = snapshot.get("lease_id")
        if isinstance(lease_id, str):
            lease_ids.append(lease_id)

    # Fetch tenant names from leases table
    lease_tenant_map: dict[str, str] = {}
    if lease_ids:
        leases_data = fetch_all_pages_chunked_in(
            # NOTE: leases has no organization_id column; org scoping is via
            # property_id (these lease_ids come from org-scoped snapshots).
            lambda chunk: supabase.table("leases")
            .select("id, tenant_name")
            .eq("property_id", str(property_id))
            .in_("id", chunk),
            lease_ids,
        )
        for raw_lease in leases_data:
            lease = _to_row(raw_lease)
            if lease is None:
                continue
            lease_id = lease.get("id")
            if not isinstance(lease_id, str):
                continue
            tenant_name = lease.get("tenant_name")
            lease_tenant_map[lease_id] = (
                tenant_name if isinstance(tenant_name, str) else "Unknown"
            )

    # Sum up calculated recoveries
    capveri_calculated = Decimal("0")
    calculated_by_tenant: dict[str, Decimal] = {}

    for raw_snapshot in recon_data:
        snapshot = _to_row(raw_snapshot)
        if snapshot is None:
            continue
        amount = Decimal(str(snapshot.get("total_recovery", 0)))
        capveri_calculated += amount
        # Get tenant name from our lookup map
        lease_id = snapshot.get("lease_id")
        tenant_name = (
            lease_tenant_map.get(lease_id, "Unknown") if lease_id else "Unknown"
        )
        calculated_by_tenant[tenant_name] = (
            calculated_by_tenant.get(tenant_name, Decimal("0")) + amount
        )

    # Fetch actual billed amounts (what WAS billed)
    billed_data = fetch_all_pages(
        lambda: supabase.table("actual_billed_amounts")
        .select("tenant_name, billed_amount")
        .eq("organization_id", str(organization_id))
        .eq("property_id", str(property_id))
        .lte("period_start_date", period_end.isoformat())
        .gte("period_end_date", period_start.isoformat())
    )
    has_billing_data = len(billed_data) > 0

    # Sum up actual billed
    actual_billed = Decimal("0")
    billed_by_tenant: dict[str, Decimal] = {}

    for raw_record in billed_data:
        record = _to_row(raw_record)
        if record is None:
            continue
        amount = Decimal(str(record.get("billed_amount", 0)))
        actual_billed += amount
        tenant_name_raw = record.get("tenant_name")
        tenant_name = tenant_name_raw if isinstance(tenant_name_raw, str) else "Unknown"
        billed_by_tenant[tenant_name] = (
            billed_by_tenant.get(tenant_name, Decimal("0")) + amount
        )

    # Calculate leakage
    leakage = capveri_calculated - actual_billed
    leakage_pct = (
        float(leakage / capveri_calculated * 100) if capveri_calculated > 0 else 0.0
    )

    # Build per-tenant breakdown
    breakdown: list[LeakageBreakdown] = []
    all_tenants = set(calculated_by_tenant.keys()) | set(billed_by_tenant.keys())

    for tenant in sorted(all_tenants):
        calc = calculated_by_tenant.get(tenant, Decimal("0"))
        billed = billed_by_tenant.get(tenant, Decimal("0"))
        diff = calc - billed
        diff_pct = float(diff / calc * 100) if calc > 0 else 0.0

        if diff != 0:  # Only include tenants with differences
            breakdown.append(
                LeakageBreakdown(
                    tenant_name=tenant,
                    calculated_amount=calc,
                    billed_amount=billed,
                    difference=diff,
                    difference_pct=diff_pct,
                )
            )

    # Sort by largest difference first
    breakdown.sort(key=lambda x: abs(x.difference), reverse=True)

    return LeakageResult(
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        capveri_calculated=capveri_calculated,
        actual_billed=actual_billed,
        leakage=leakage,
        leakage_pct=leakage_pct,
        has_reconciliation_data=has_reconciliation_data,
        has_gl_data=has_gl_data,
        has_billing_data=has_billing_data,
        breakdown=breakdown,
    )
