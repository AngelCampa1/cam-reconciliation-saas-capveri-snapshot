# Story 6.13: Create Tenant Share Calculator

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** tenant
**I want** my share calculated with all lease terms applied
**So that** I pay exactly what my lease requires

---

## Acceptance Criteria

- [ ] **AC1**: Applies pro_rata_share correctly
- [ ] **AC2**: Applies admin_fee_percentage
- [ ] **AC3**: Respects excluded_pools
- [ ] **AC4**: Combines all calculations into final amount
- [ ] **AC5**: Complete trace for audit
- [ ] **AC6**: Respects admin_fee_cap (max dollar amount)
- [ ] **AC7**: Handles admin_fee_excludes_tax_insurance
- [ ] **AC8**: Uses cap_base_year_amount for cumulative caps

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
└── tenant_share.py
```

**tenant_share.py**:
```python
"""
Calculate tenant's share of recoverable expenses.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Dict
from uuid import UUID

from pydantic import BaseModel

from app.services.calculation.models import CalculationTrace
from app.services.calculation.base_year import (
    BaseYearInput,
    calculate_base_year_increase,
)
from app.services.calculation.caps import CapInput, apply_cap, CapType


class LeaseTerms(BaseModel):
    """Lease recovery terms for calculation."""
    lease_id: UUID
    tenant_name: str
    pro_rata_share: Decimal
    admin_fee_percentage: Decimal = Decimal('0')
    admin_fee_cap: Optional[Decimal] = None  # Max dollar amount for admin fee
    admin_fee_excludes_tax_insurance: bool = False  # Exclude T&I pools from admin fee
    admin_fee_excluded_pools: List[str] = []  # Configurable pools to exclude from admin fee base
    tenant_sqft: Optional[Decimal] = None  # Needed for expense stops
    expense_stops: Optional[Dict[str, Decimal]] = None  # pool_name: per_sqft_stop
    base_year: Optional[int] = None
    base_year_amount: Optional[Decimal] = None
    cap_type: str = CapType.NONE
    cap_rate: Optional[Decimal] = None
    excluded_pools: List[str] = []


class TenantShareInput(BaseModel):
    """Input for tenant share calculation."""
    lease_terms: LeaseTerms
    total_recoverable_expenses: Decimal
    pool_breakdown: Dict[str, Decimal]  # pool_name: amount
    prior_year_amount: Optional[Decimal] = None
    all_prior_amounts: Optional[List[Decimal]] = None
    cap_base_year_amount: Optional[Decimal] = None  # Original base for cumulative caps
    current_year: int


class TenantShareResult(BaseModel):
    """Result of tenant share calculation."""
    tenant_name: str
    gross_recoverable: Decimal
    excluded_amount: Decimal
    net_recoverable: Decimal
    base_year_amount: Optional[Decimal]
    increase_over_base: Decimal
    tenant_share_before_cap: Decimal
    cap_applied: bool
    tenant_share_after_cap: Decimal
    admin_fee: Decimal
    total_recovery: Decimal
    trace: CalculationTrace


def calculate_tenant_share(
    input_data: TenantShareInput,
    trace: Optional[CalculationTrace] = None,
) -> TenantShareResult:
    """
    Calculate a tenant's share of recoverable expenses.

    Steps:
    1. Remove excluded pools
    2. Apply base year stop
    3. Apply pro-rata share
    4. Apply cap
    5. Add admin fee

    Args:
        input_data: Expense totals and lease terms
        trace: Optional calculation trace

    Returns:
        TenantShareResult with complete breakdown
    """
    if trace is None:
        trace = CalculationTrace(
            calculation_type='tenant_share',
            property_id=UUID(int=0),  # Would be set by caller
            period_start=None,
            period_end=None,
        )

    terms = input_data.lease_terms

    # Step 1: Remove excluded pools
    excluded_amount = Decimal('0')
    for pool_name in terms.excluded_pools:
        if pool_name in input_data.pool_breakdown:
            excluded_amount += input_data.pool_breakdown[pool_name]

    net_recoverable = input_data.total_recoverable_expenses - excluded_amount

    trace.add_step(
        name='Exclude pools',
        inputs={
            'total': input_data.total_recoverable_expenses,
            'excluded_pools': terms.excluded_pools,
        },
        operation='total - excluded',
        output=net_recoverable,
        note=f'Excluded: {terms.excluded_pools}' if terms.excluded_pools else 'No exclusions',
    )

    # Step 2: Apply base year stop
    if terms.base_year and terms.base_year_amount:
        base_result = calculate_base_year_increase(
            BaseYearInput(
                current_year_expenses=net_recoverable,
                base_year_amount=terms.base_year_amount,
                pro_rata_share=Decimal('1'),  # Apply pro-rata later
            ),
            trace,
        )
        increase = base_result.increase_over_base
        base_year_applied = terms.base_year_amount
    else:
        increase = net_recoverable
        base_year_applied = None
        trace.add_step(
            name='Base year check',
            inputs={'has_base_year': False},
            operation='No base year - full amount recoverable',
            output=increase,
        )

    # Step 3: Apply pro-rata share
    tenant_share_before_cap = increase * terms.pro_rata_share
    tenant_share_before_cap = tenant_share_before_cap.quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    trace.add_step(
        name='Apply pro-rata share',
        inputs={
            'increase': increase,
            'pro_rata': terms.pro_rata_share,
        },
        operation=f'{increase} * {terms.pro_rata_share}',
        output=tenant_share_before_cap,
    )

    # Step 4: Apply cap
    cap_input = CapInput(
        cap_type=terms.cap_type,
        cap_rate=terms.cap_rate or Decimal('0'),
        current_year_amount=tenant_share_before_cap,
        prior_year_amount=input_data.prior_year_amount,
        # For cumulative caps, use original base year amount (not prior year)
        base_year_amount=input_data.cap_base_year_amount or input_data.prior_year_amount or tenant_share_before_cap,
        all_prior_amounts=input_data.all_prior_amounts,
    )
    cap_result = apply_cap(cap_input, trace)
    tenant_share_after_cap = cap_result.capped_amount

    # Step 5: Calculate admin fee
    # Step 5a: Determine admin fee base (may exclude specified pools)
    # Use configurable excluded pools list; fallback to default T&I pools if flag is set
    excluded_from_admin = set(p.lower() for p in terms.admin_fee_excluded_pools)
    if terms.admin_fee_excludes_tax_insurance and not excluded_from_admin:
        # Default T&I pools when flag is set but no explicit list provided
        excluded_from_admin = {'taxes', 'insurance', 'real_estate_taxes', 'property_insurance',
                               'tax', 'property_tax', 'building_insurance'}

    if excluded_from_admin:
        admin_base = sum(
            amt for pool, amt in input_data.pool_breakdown.items()
            if pool.lower() not in excluded_from_admin
        ) * terms.pro_rata_share
        # Don't exceed the capped tenant share
        admin_base = min(admin_base, tenant_share_after_cap)
        trace.add_step(
            name='Exclude pools from admin fee base',
            inputs={'excluded_pools': list(excluded_from_admin)},
            operation='Sum non-excluded pools * pro_rata_share',
            output=admin_base,
            note=f'Pools excluded from admin fee: {sorted(excluded_from_admin)}',
        )
    else:
        admin_base = tenant_share_after_cap

    # Step 5b: Calculate and optionally cap admin fee
    admin_fee = admin_base * terms.admin_fee_percentage
    if terms.admin_fee_cap is not None:
        admin_fee = min(admin_fee, terms.admin_fee_cap)
    admin_fee = admin_fee.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    trace.add_step(
        name='Calculate admin fee',
        inputs={
            'admin_base': admin_base,
            'fee_rate': terms.admin_fee_percentage,
            'fee_cap': terms.admin_fee_cap,
        },
        operation=f'{admin_base} * {terms.admin_fee_percentage}' +
                  (f', capped at {terms.admin_fee_cap}' if terms.admin_fee_cap else ''),
        output=admin_fee,
    )

    total_recovery = tenant_share_after_cap + admin_fee

    trace.add_step(
        name='Total recovery',
        inputs={
            'share': tenant_share_after_cap,
            'admin_fee': admin_fee,
        },
        operation='share + admin_fee',
        output=total_recovery,
    )

    return TenantShareResult(
        tenant_name=terms.tenant_name,
        gross_recoverable=input_data.total_recoverable_expenses,
        excluded_amount=excluded_amount,
        net_recoverable=net_recoverable,
        base_year_amount=base_year_applied,
        increase_over_base=increase if base_year_applied else Decimal('0'),
        tenant_share_before_cap=tenant_share_before_cap,
        cap_applied=cap_result.cap_applied,
        tenant_share_after_cap=tenant_share_after_cap,
        admin_fee=admin_fee,
        total_recovery=total_recovery,
        trace=trace,
    )
```

---

## Definition of Done
- [ ] All lease terms applied
- [ ] Admin fee calculated
- [ ] Exclusions respected
- [ ] Complete trace

---

## Estimated Time: 3 hours
