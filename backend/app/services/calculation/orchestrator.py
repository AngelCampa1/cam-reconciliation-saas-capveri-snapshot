"""
Reconciliation calculation orchestrator.

Coordinates all calculation components to produce
complete reconciliation snapshots for a property/period.

Usage:
    # Fetch required data first
    leases = fetch_active_leases(property_id, period_start, period_end)
    pool_summaries = fetch_pool_summaries(property_id, period_start, period_end)

    # Run reconciliation
    result = await run_property_reconciliation(input_data, leases, pool_summaries)
"""

import json
import logging
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

import sentry_sdk
from pydantic import BaseModel, Field

from app.core.versioning import get_engine_version
from app.database.client import SupabaseDB
from app.models.enums import NATA_SPACE_TYPES, BomaStandardVersion
from app.services.calculation.data_fetcher import fetch_all_tenant_cap_histories
from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.expense_stop import apply_expense_stops
from app.services.calculation.gross_up_orchestrator import (
    GrossUpInput,
    calculate_full_gross_up,
)
from app.services.calculation.models import (
    UNIT_COUNT,
    UNIT_RATIO,
    UNIT_TEXT,
    CalculationTrace,
)
from app.services.calculation.occupancy import LeaseOccupancy
from app.services.calculation.pool_allocation import PoolRecovery
from app.services.calculation.tenant_share import (
    LeaseTerms,
    TenantShareInput,
    calculate_tenant_share,
)
from app.services.extraction.cross_doc_models import (
    CrossDocFinding,
    TermOverrideSuggestion,
)

logger = logging.getLogger(__name__)


_APPLICABLE_OVERRIDE_FIELDS = {
    "pro_rata_share",
    "admin_fee_percentage",
    "management_fee_percentage",
    "admin_fee_cap",
    "admin_fee_excludes_tax_insurance",
    "admin_fee_excluded_pools",
    "tenant_sqft",
    "expense_stops",
    "base_year",
    "base_year_amount",
    "cap_type",
    "cap_rate",
    "excluded_pools",
    "start_date",
    "end_date",
    "unit_space_type",
    "rsf_measurement_standard",
    "proration_factor",
    "accounting_basis",
    "base_year_adjustments",
}


def _parse_override_value(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _apply_cross_doc_overrides(
    leases: list[LeaseTerms],
    overrides: list[TermOverrideSuggestion] | None,
    trace: CalculationTrace,
) -> list[LeaseTerms]:
    if not overrides:
        return leases

    leases_by_id = {str(lease.lease_id): lease for lease in leases}
    updates_by_lease: dict[str, dict[str, Any]] = {}

    for override in overrides:
        lease = leases_by_id.get(override.lease_id)
        if lease is None or override.field_name not in _APPLICABLE_OVERRIDE_FIELDS:
            trace.add_step(
                name="Cross-Doc Term Override Skipped",
                inputs={
                    "lease_id": override.lease_id,
                    "field_name": override.field_name,
                },
                operation="Validate accepted cross-document override",
                output=Decimal("0"),
                input_units={"lease_id": UNIT_TEXT, "field_name": UNIT_TEXT},
                note=(
                    "Accepted override did not match an active lease or supported "
                    "calculation field."
                ),
            )
            continue
        updates_by_lease.setdefault(override.lease_id, {})[override.field_name] = (
            _parse_override_value(override.suggested_value)
        )

    if not updates_by_lease:
        return leases

    applied: list[LeaseTerms] = []
    for lease in leases:
        updates = updates_by_lease.get(str(lease.lease_id))
        if not updates:
            applied.append(lease)
            continue
        updated_terms = LeaseTerms.model_validate(
            lease.model_dump(mode="python") | updates
        )
        trace.add_step(
            name=f"Cross-Doc Term Overrides Applied - {lease.tenant_name}",
            inputs={
                "lease_id": str(lease.lease_id),
                "fields": ", ".join(sorted(updates)),
            },
            operation="Apply accepted cross-document lease-term overrides",
            output=Decimal("0"),
            input_units={"lease_id": UNIT_TEXT, "fields": UNIT_TEXT},
            note=(
                "Accepted reviewer overrides were applied before reconciliation "
                "calculation."
            ),
        )
        applied.append(updated_terms)

    return applied


class ReconciliationInput(BaseModel):
    """Input for full property reconciliation."""

    property_id: UUID
    period_start: date
    period_end: date
    total_rentable_sqft: Decimal
    target_occupancy: Decimal = Decimal("0.95")
    boma_standard_version: BomaStandardVersion = BomaStandardVersion.V2024


class TenantReconciliation(BaseModel):
    """Reconciliation result for a single tenant."""

    lease_id: UUID
    tenant_name: str
    pro_rata_share: Decimal
    total_operating_expenses: Decimal
    grossed_up_expenses: Decimal
    base_year_amount: Decimal | None
    tenant_share_before_cap: Decimal
    tenant_share_after_cap: Decimal
    admin_fee: Decimal
    total_recovery: Decimal
    trace: CalculationTrace

    # Layer-faithful per-pool recovery split (Module A "Produce"). Empty when no
    # per-pool input exists, or when a cap reduced the share but pool
    # classification was unavailable so the breakdown was deliberately withheld.
    # When populated, per-pool amounts reconcile exactly to total_recovery.
    pool_breakdowns: list[PoolRecovery] = Field(default_factory=list)

    # Lease term versioning — frozen terms for audit
    lease_terms_snapshot: dict[str, object] | None = None
    term_version_id: UUID | None = None


class PropertyReconciliation(BaseModel):
    """Complete reconciliation for a property/period."""

    property_id: UUID
    period_start: date
    period_end: date

    # Property-level totals
    total_rentable_sqft: Decimal
    actual_occupancy: Decimal
    target_occupancy: Decimal
    gross_up_factor: Decimal

    total_operating_expenses: Decimal
    total_grossed_up_expenses: Decimal
    total_recovery: Decimal

    # Per-tenant results
    tenant_reconciliations: list[TenantReconciliation] = Field(default_factory=list)

    # Master trace
    property_trace: CalculationTrace


async def run_property_reconciliation(
    input_data: ReconciliationInput,
    leases: list[LeaseTerms],
    pool_summaries: dict[UUID, ExpensePoolSummary],
    supabase_client: SupabaseDB | None = None,
    pool_summaries_by_basis: dict[str, dict[UUID, ExpensePoolSummary]] | None = None,
    cross_doc_advisories: list[CrossDocFinding] | None = None,
    cross_doc_overrides: list[TermOverrideSuggestion] | None = None,
) -> PropertyReconciliation:
    """
    Run complete reconciliation for a property/period.

    Steps:
    1. Calculate gross-up from pool summaries and lease occupancy
    2. For each tenant:
       - Apply expense stops (if configured)
       - Calculate tenant share with lease terms
       - Apply caps
       - Add admin fee
    3. Return complete result with full trace

    Args:
        input_data: Property and period info
        leases: Active leases with full recovery terms
        pool_summaries: Expense pool summaries with totals and gross-up metadata
        supabase_client: Optional Supabase client for fetching historical cap data
        pool_summaries_by_basis: Per-basis pool summaries for mixed-basis
            properties. Keys are "cash" or "accrual". When provided,
            each lease uses the pool summaries matching its accounting
            basis instead of the default pool_summaries.

    Returns:
        PropertyReconciliation with all tenants and complete audit trail
    """
    property_trace = CalculationTrace(
        calculation_type="property_reconciliation",
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
        engine_version=get_engine_version(),
    )

    leases = _apply_cross_doc_overrides(leases, cross_doc_overrides, property_trace)

    # Step 1: Convert LeaseTerms to LeaseOccupancy for gross-up calculation
    # FIX RO-1: Use actual lease dates, clamped to reconciliation period bounds
    # This ensures partial-period leases only contribute proportional occupancy
    lease_occupancy_data = [
        LeaseOccupancy(
            lease_id=str(lease.lease_id),
            tenant_name=lease.tenant_name,
            sqft=lease.tenant_sqft or Decimal("0"),
            # Clamp lease start to period start (can't count before period begins)
            start_date=max(
                lease.start_date or input_data.period_start, input_data.period_start
            ),
            # Clamp lease end to period end (can't count after period ends)
            end_date=min(
                lease.end_date or input_data.period_end, input_data.period_end
            ),
        )
        for lease in leases
        if lease.tenant_sqft  # Only include leases with sqft data
    ]

    # Step 2: Calculate gross-up
    gross_up_result = calculate_full_gross_up(
        GrossUpInput(
            property_id=input_data.property_id,
            period_start=input_data.period_start,
            period_end=input_data.period_end,
            total_rentable_sqft=input_data.total_rentable_sqft,
            target_occupancy=input_data.target_occupancy,
        ),
        leases=lease_occupancy_data,
        pool_totals=pool_summaries,
    )

    # Merge gross-up trace into property trace
    for step in gross_up_result.trace.steps:
        property_trace.steps.append(step)

    # Step 2b: BOMA 2024 compliance warnings (non-blocking)
    # Warning A — pre-2024 building measurement
    if input_data.boma_standard_version != BomaStandardVersion.V2024:
        property_trace.add_step(
            name="BOMA Standard Version Warning",
            inputs={"boma_standard_version": str(input_data.boma_standard_version)},
            operation="Check building measurement standard",
            output=Decimal("0"),
            input_units={"boma_standard_version": UNIT_TEXT},
            note=(
                f"WARNING: Building RSF is certified under BOMA "
                f"{input_data.boma_standard_version}. "
                "BOMA 2024 typically uncovers 2-5% additional rentable area. "
                "Ground-floor patios, tenant storage, and single-tenant shafts "
                "may be excluded from your current denominator."
            ),
        )

    # Warning B — NATA units without load-factor documentation
    for lease in leases:
        if lease.unit_space_type in NATA_SPACE_TYPES:
            property_trace.add_step(
                name=f"BOMA 2024 NATA Space — {lease.tenant_name}",
                inputs={
                    "space_type": str(lease.unit_space_type),
                    "pro_rata_share": str(lease.pro_rata_share),
                },
                operation="Check NATA load-factor compliance",
                output=Decimal("0"),
                input_units={"space_type": UNIT_TEXT, "pro_rata_share": UNIT_RATIO},
                note=(
                    f"WARNING: Tenant has {lease.unit_space_type.value} space. "
                    "Per BOMA 2024, NATA areas must have zero load factor in "
                    "pro-rata calculations. Verify pro_rata_share was computed "
                    "without a load factor applied to this space."
                ),
            )

    # Warning C — mixed-vintage lease book
    lease_standards = {
        lease.rsf_measurement_standard
        for lease in leases
        if lease.rsf_measurement_standard is not None
    }
    if len(lease_standards) > 1:
        sorted_standards = sorted(str(s) for s in lease_standards)
        property_trace.add_step(
            name="Mixed-Vintage RSF Warning",
            inputs={"standards_found": str(sorted_standards)},
            operation="Check RSF measurement consistency",
            output=Decimal("0"),
            input_units={"standards_found": UNIT_TEXT},
            note=(
                f"WARNING: Leases in this property were certified under different "
                f"BOMA versions: {sorted_standards}. Mixed denominators cause "
                "systematic pro-rata errors. Review tenants against current "
                "building RSF."
            ),
        )

    # Step 2c: Inject cross-document advisory findings into trace (non-blocking)
    if cross_doc_advisories:
        for advisory in cross_doc_advisories:
            property_trace.add_step(
                name=f"Cross-Doc: {advisory.title}",
                inputs={
                    "category": advisory.category.value,
                    "severity": advisory.severity.value,
                },
                operation="Cross-document analysis finding",
                output=advisory.financial_impact_estimate or Decimal("0"),
                input_units={"category": UNIT_TEXT, "severity": UNIT_TEXT},
                note=advisory.detail,
            )

    # Step 3: Calculate each tenant's share
    tenant_results = []
    total_recovery = Decimal("0")

    # Batch fetch cap histories for all leases to avoid N+1 queries
    # Instead of fetching cap history inside the loop (N queries),
    # fetch all at once (1 query) before the loop
    lease_ids = [lease.lease_id for lease in leases]
    all_cap_histories = fetch_all_tenant_cap_histories(
        lease_ids=lease_ids,
        current_period_start=input_data.period_start,
        base_year=None,  # Will use lease-specific base_year below
        client=supabase_client,
    )

    for lease in leases:
        tenant_trace = CalculationTrace(
            calculation_type=f"tenant_{lease.tenant_name}",
            property_id=input_data.property_id,
            period_start=input_data.period_start,
            period_end=input_data.period_end,
            engine_version=get_engine_version(),
        )

        # Accounting basis warning — when not specified, default to cash + warn
        if lease.accounting_basis is None:
            tenant_trace.add_step(
                name="Accounting Basis Warning",
                inputs={
                    "lease_id": str(lease.lease_id),
                    "tenant_name": lease.tenant_name,
                },
                operation="Check accounting basis configuration",
                output=Decimal("0"),
                input_units={"lease_id": UNIT_TEXT, "tenant_name": UNIT_TEXT},
                note=(
                    f"WARNING: Accounting basis not specified for tenant "
                    f"'{lease.tenant_name}'. Defaulting to cash basis. "
                    f"Verify lease terms and set accounting_basis "
                    f"to suppress this warning."
                ),
            )

        # Select pool summaries for this lease's accounting basis
        lease_basis = lease.accounting_basis or "cash"
        routed_to_basis_specific = False
        if pool_summaries_by_basis and lease_basis in pool_summaries_by_basis:
            lease_pool_summaries = pool_summaries_by_basis[lease_basis]
            # Did routing actually pick a DIFFERENT pool set than the top-level
            # one used for the property gross-up? (Identity check — the single-
            # basis fast path passes the same object as the default.)
            routed_to_basis_specific = lease_pool_summaries is not pool_summaries
        else:
            lease_pool_summaries = pool_summaries

        # FIX NEW-RW-2: Build pool breakdown with grossed-up amounts for variable
        # pools. Exclusion calculations need grossed-up amounts, not original.
        # Otherwise, excluding a variable pool leaves "phantom" gross-up in total.
        # Example: If utilities ($60k) is grossed to $72k, and utilities excluded,
        # we should exclude $72k, not $60k, from the $112k grossed total.
        pool_breakdown = {
            pool.pool_name: (
                pool.total_amount * gross_up_result.gross_up_factor
                if pool.is_gross_up_applicable
                else pool.total_amount
            )
            for pool in lease_pool_summaries.values()
        }

        # FIX NEW-FC-1: Preserve original pool breakdown before expense stops
        # Expense stops create synthetic pool values (above_stop / pro_rata_share),
        # which are correct for tenant share calculation but wrong for exclusions.
        # We pass the original values for exclusion/admin fee calculations.
        original_pool_breakdown = None

        # FIX MB-1: A lease routed to a basis-specific pool set (mixed cash/accrual
        # property) must recover off THAT basis's grossed total — the sum of its own
        # pool_breakdown — not the top-level gross-up total, which the API builds
        # from the cash basis alone (reconciliation.py: pool_summaries =
        # pool_summaries_by_basis["cash"]). Without this, an accrual tenant with no
        # expense stops was billed off cash totals. The gross-up FACTOR is building-
        # occupancy based (basis-independent), so reusing it on the basis pools is
        # correct. The single-basis fast path keeps routed_to_basis_specific=False,
        # so its recoverable base is byte-identical to before.
        total_recoverable_for_tenant = gross_up_result.total_after_gross_up
        if routed_to_basis_specific:
            total_recoverable_for_tenant = sum(pool_breakdown.values(), Decimal("0"))
        # Apply expense stops if configured
        if lease.expense_stops and lease.tenant_sqft:
            # Save original before modification
            original_pool_breakdown = dict(pool_breakdown)
            pool_breakdown = apply_expense_stops(
                pool_breakdown=pool_breakdown,
                expense_stops=lease.expense_stops,
                tenant_sqft=lease.tenant_sqft,
                pro_rata_share=lease.pro_rata_share,
                trace=tenant_trace,
            )
            # Recompute total from stopped pools so tenant share uses reduced amounts
            total_recoverable_for_tenant = sum(pool_breakdown.values(), Decimal("0"))

        # FIX NEW-RW-1: Get historical cap data for this lease from batch fetch
        # This enables proper cap calculations for multi-year tenants
        # NOTE: We batch-fetched all cap histories before the loop to avoid N+1 queries
        cap_history = all_cap_histories.get(lease.lease_id)
        if not cap_history:
            # Should not happen since batch fetch creates entries for all leases
            # But add safety check just in case
            from app.services.calculation.data_fetcher import TenantCapHistory

            cap_history = TenantCapHistory(
                prior_year_amount=None, all_prior_amounts=[], cap_base_year_amount=None
            )

        # Calculate tenant share with historical data for caps
        tenant_input = TenantShareInput(
            lease_terms=lease,
            total_recoverable_expenses=total_recoverable_for_tenant,
            pool_breakdown=pool_breakdown,
            # FIX NEW-FC-1: Pass original pool breakdown for exclusion calculations
            original_pool_breakdown=original_pool_breakdown,
            # Pool types let the per-pool recovery breakdown attribute the cap to
            # controllable pools only (taxes/insurance/capital are cap-exempt).
            pool_types={
                pool.pool_name: pool.pool_type for pool in lease_pool_summaries.values()
            },
            current_year=input_data.period_end.year,
            # Pass historical cap data
            prior_year_amount=cap_history.prior_year_amount,
            all_prior_amounts=cap_history.all_prior_amounts,
            cap_base_year_amount=cap_history.cap_base_year_amount,
        )

        tenant_result = calculate_tenant_share(tenant_input, tenant_trace)

        # Build tenant reconciliation result with frozen term snapshot
        tenant_recon = TenantReconciliation(
            lease_id=lease.lease_id,
            tenant_name=lease.tenant_name,
            pro_rata_share=lease.pro_rata_share,
            total_operating_expenses=gross_up_result.total_operating_expenses,
            grossed_up_expenses=gross_up_result.total_after_gross_up,
            base_year_amount=lease.base_year_amount,
            tenant_share_before_cap=tenant_result.tenant_share_before_cap,
            tenant_share_after_cap=tenant_result.tenant_share_after_cap,
            admin_fee=tenant_result.admin_fee,
            total_recovery=tenant_result.total_recovery,
            trace=tenant_trace,
            pool_breakdowns=tenant_result.pool_breakdowns,
            lease_terms_snapshot=lease.model_dump(mode="json"),
            term_version_id=lease.term_version_id,
        )

        tenant_results.append(tenant_recon)
        total_recovery += tenant_result.total_recovery

    # Add final summary step to property trace
    property_trace.add_step(
        name="Total property recovery",
        inputs={"tenant_count": len(tenant_results)},
        operation="Sum of all tenant recoveries",
        output=total_recovery,
        input_units={"tenant_count": UNIT_COUNT},
    )

    sentry_sdk.metrics.count("cam.reconciliation.run", 1.0)
    sentry_sdk.metrics.distribution(
        "cam.reconciliation.tenant_count",
        float(len(tenant_results)),
        unit="none",
    )
    return PropertyReconciliation(
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
        total_rentable_sqft=input_data.total_rentable_sqft,
        actual_occupancy=gross_up_result.actual_occupancy,
        target_occupancy=input_data.target_occupancy,
        gross_up_factor=gross_up_result.gross_up_factor,
        total_operating_expenses=gross_up_result.total_operating_expenses,
        total_grossed_up_expenses=gross_up_result.total_after_gross_up,
        total_recovery=total_recovery,
        tenant_reconciliations=tenant_results,
        property_trace=property_trace,
    )
