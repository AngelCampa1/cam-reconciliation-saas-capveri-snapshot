# Story 6.15: Create Reconciliation Orchestrator

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** property accountant
**I want** one function that runs the full reconciliation
**So that** I get complete results in one call

---

## Acceptance Criteria

- [ ] **AC1**: Coordinates all calculation components
- [ ] **AC2**: Calculates for all tenants in property
- [ ] **AC3**: Creates complete reconciliation snapshot
- [ ] **AC4**: Full trace for every tenant
- [ ] **AC5**: End-to-end test with fixture data
- [ ] **AC6**: Applies expense stops before tenant share calculation

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
└── orchestrator.py
```

**orchestrator.py**:
```python
"""
Reconciliation calculation orchestrator.

Coordinates all calculation components to produce
complete reconciliation snapshots for a property/period.

Usage:
    # Fetch required data first
    leases = await fetch_active_leases(property_id, period_start, period_end)
    gl_entries = await fetch_gl_entries(property_id, period_start, period_end)
    pool_mappings = await fetch_pool_mappings(property_id)

    # Run reconciliation
    result = await run_property_reconciliation(input_data, leases, gl_entries, pool_mappings)
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel

from app.services.calculation.models import CalculationTrace
from app.services.calculation.gross_up_orchestrator import (
    GrossUpInput,
    calculate_full_gross_up,
)
from app.services.calculation.tenant_share import (
    LeaseTerms,
    TenantShareInput,
    calculate_tenant_share,
)
from app.services.calculation.pool_aggregator import aggregate_by_pools
from app.services.calculation.expense_stop import (
    ExpenseStopInput,
    apply_expense_stops,
)


class ReconciliationInput(BaseModel):
    """Input for full property reconciliation."""
    property_id: UUID
    period_start: date
    period_end: date
    total_rentable_sqft: Decimal
    target_occupancy: Decimal = Decimal('0.95')


class TenantReconciliation(BaseModel):
    """Reconciliation result for a single tenant."""
    lease_id: UUID
    tenant_name: str
    pro_rata_share: Decimal
    total_operating_expenses: Decimal
    grossed_up_expenses: Decimal
    base_year_amount: Optional[Decimal]
    tenant_share_before_cap: Decimal
    tenant_share_after_cap: Decimal
    admin_fee: Decimal
    total_recovery: Decimal
    trace: CalculationTrace


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
    tenant_reconciliations: List[TenantReconciliation]

    # Master trace
    property_trace: CalculationTrace


async def run_property_reconciliation(
    input_data: ReconciliationInput,
    # These would typically be fetched from DB
    leases: List[LeaseTerms],
    gl_entries: List,
    pool_mappings: List,
) -> PropertyReconciliation:
    """
    Run complete reconciliation for a property/period.

    Steps:
    1. Aggregate GL entries by pool
    2. Calculate gross-up
    3. For each tenant:
       - Apply lease terms
       - Calculate share
       - Apply cap
       - Add admin fee
    4. Return complete result

    Args:
        input_data: Property and period info
        leases: Active leases with terms
        gl_entries: GL entries for the period
        pool_mappings: Pool mapping configurations

    Returns:
        PropertyReconciliation with all tenants
    """
    property_trace = CalculationTrace(
        calculation_type='property_reconciliation',
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
    )

    # Step 1: Aggregate by pools
    pool_totals = aggregate_by_pools(gl_entries, pool_mappings, property_trace)

    # Step 2: Calculate gross-up using actual lease occupancy data
    # Convert LeaseTerms to occupancy data for gross-up calculation
    lease_occupancy_data = [
        {
            'lease_id': lease.lease_id,
            'occupied_sqft': lease.tenant_sqft or Decimal('0'),
            'start_date': None,  # Would be populated from full lease record
            'end_date': None,
        }
        for lease in leases
    ]

    gross_up_result = calculate_full_gross_up(
        GrossUpInput(
            property_id=input_data.property_id,
            period_start=input_data.period_start,
            period_end=input_data.period_end,
            total_rentable_sqft=input_data.total_rentable_sqft,
            target_occupancy=input_data.target_occupancy,
        ),
        leases=lease_occupancy_data,
        pool_totals={p.pool_id: p for p in pool_totals.values()},
    )

    # Merge gross-up trace
    for step in gross_up_result.trace.steps:
        property_trace.steps.append(step)

    # Step 3: Calculate each tenant's share
    tenant_results = []
    total_recovery = Decimal('0')

    for lease in leases:
        tenant_trace = CalculationTrace(
            calculation_type=f'tenant_{lease.tenant_name}',
            property_id=input_data.property_id,
            period_start=input_data.period_start,
            period_end=input_data.period_end,
        )

        pool_breakdown = {
            pool.pool_name: pool.total_amount
            for pool in pool_totals.values()
        }

        # Apply expense stops if configured
        if lease.expense_stops and lease.tenant_sqft:
            pool_breakdown = apply_expense_stops(
                pool_breakdown=pool_breakdown,
                expense_stops=lease.expense_stops,
                tenant_sqft=lease.tenant_sqft,
                pro_rata_share=lease.pro_rata_share,
                trace=tenant_trace,
            )

        tenant_input = TenantShareInput(
            lease_terms=lease,
            total_recoverable_expenses=gross_up_result.total_after_gross_up,
            pool_breakdown=pool_breakdown,
            current_year=input_data.period_end.year,
        )

        tenant_result = calculate_tenant_share(tenant_input, tenant_trace)

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
        )

        tenant_results.append(tenant_recon)
        total_recovery += tenant_result.total_recovery

    property_trace.add_step(
        name='Total property recovery',
        inputs={'tenant_count': len(tenant_results)},
        operation='Sum of all tenant recoveries',
        output=total_recovery,
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
```

**Helper functions for data fetching** (in `backend/app/services/calculation/data_fetcher.py`):
```python
"""Helper functions to fetch data needed by the orchestrator."""
from datetime import date
from typing import List
from uuid import UUID

from app.database.client import get_supabase_client
from app.services.calculation.tenant_share import LeaseTerms


async def fetch_active_leases(
    property_id: UUID,
    period_start: date,
    period_end: date,
) -> List[LeaseTerms]:
    """
    Fetch all leases active during the reconciliation period.

    A lease is active if:
    - lease.start_date <= period_end AND
    - (lease.end_date IS NULL OR lease.end_date >= period_start)
    """
    client = get_supabase_client()

    result = await client.table('leases') \
        .select('*, units!inner(property_id, rentable_sqft)') \
        .eq('units.property_id', str(property_id)) \
        .lte('start_date', period_end.isoformat()) \
        .or_(f'end_date.is.null,end_date.gte.{period_start.isoformat()}') \
        .execute()

    return [
        LeaseTerms(
            lease_id=UUID(row['id']),
            tenant_name=row['tenant_name'],
            pro_rata_share=Decimal(str(row['recovery_profile'].get('pro_rata_share', 0))),
            admin_fee_percentage=Decimal(str(row['recovery_profile'].get('admin_fee_percent', 0.15))),
            tenant_sqft=Decimal(str(row['units']['rentable_sqft'])),
            base_year=row['recovery_profile'].get('base_year'),
            base_year_amount=Decimal(str(row['recovery_profile'].get('base_year_amount', 0)))
                if row['recovery_profile'].get('base_year_amount') else None,
            cap_type=row['recovery_profile'].get('cap_type', 'none'),
            cap_rate=Decimal(str(row['recovery_profile'].get('cap_rate', 0)))
                if row['recovery_profile'].get('cap_rate') else None,
            excluded_pools=row['recovery_profile'].get('excluded_pools', []),
        )
        for row in result.data
    ]
```

---

## Definition of Done
- [ ] Full orchestration works
- [ ] All tenants calculated
- [ ] Traces complete
- [ ] End-to-end test passes
- [ ] Data fetching helper functions implemented

---

## Estimated Time: 4 hours
