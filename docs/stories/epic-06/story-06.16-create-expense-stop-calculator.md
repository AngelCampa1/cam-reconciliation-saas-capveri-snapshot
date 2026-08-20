# Story 6.16: Create Expense Stop Calculator

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)
**Dependencies**: Story 6.13 (Tenant Share Calculator)
**Estimated Time**: 3 hours

---

## User Story
**As a** tenant with an expense stop
**I want** my share calculated above the stop threshold
**So that** I only pay for expenses exceeding the per-sqft stop

---

## Acceptance Criteria

- [ ] **AC1**: Calculates stop threshold as stop_per_sqft * tenant_sqft
- [ ] **AC2**: Tenant pays max(0, pool_share - threshold)
- [ ] **AC3**: Handles per-pool stops (different stops for taxes vs operating)
- [ ] **AC4**: Works with base year (stop OR base year, not both)
- [ ] **AC5**: Trace shows stop calculation

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
└── expense_stop.py
```

**expense_stop.py**:
```python
"""
Expense stop calculation for leases with per-sqft thresholds.

An expense stop is a per-square-foot amount that the landlord absorbs.
The tenant only pays for expenses above this threshold.

Example: Tenant has 10,000 sqft with a $5.00/sqft operating expense stop.
- Stop threshold = 10,000 * $5.00 = $50,000
- If tenant's share of operating expenses is $60,000, they pay $10,000
- If tenant's share is $45,000, they pay $0
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Dict

from pydantic import BaseModel

from app.services.calculation.models import CalculationTrace


class ExpenseStopInput(BaseModel):
    """Input for expense stop calculation."""
    pool_amount: Decimal  # Total pool amount
    stop_per_sqft: Decimal  # e.g., 5.00 for $5/sqft
    tenant_sqft: Decimal  # Tenant's rentable square feet
    pro_rata_share: Decimal  # Tenant's share (e.g., 0.10 for 10%)


class ExpenseStopResult(BaseModel):
    """Result of expense stop calculation."""
    pool_amount: Decimal
    tenant_share_before_stop: Decimal
    threshold: Decimal
    above_stop: Decimal
    stop_applied: bool


def calculate_expense_stop(
    input_data: ExpenseStopInput,
    trace: Optional[CalculationTrace] = None,
) -> ExpenseStopResult:
    """
    Calculate tenant's expense above their stop threshold.

    Formula:
    threshold = stop_per_sqft * tenant_sqft
    tenant_share = pool_amount * pro_rata_share
    above_stop = max(0, tenant_share - threshold)

    Args:
        input_data: Pool amount and stop configuration
        trace: Optional calculation trace

    Returns:
        ExpenseStopResult with amount above stop
    """
    # Calculate threshold
    threshold = input_data.stop_per_sqft * input_data.tenant_sqft
    threshold = threshold.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name='Calculate expense stop threshold',
            inputs={
                'stop_per_sqft': input_data.stop_per_sqft,
                'tenant_sqft': input_data.tenant_sqft,
            },
            operation=f'{input_data.stop_per_sqft} * {input_data.tenant_sqft}',
            output=threshold,
            note=f'Tenant absorbs first ${threshold} of expenses',
        )

    # Calculate tenant's share
    tenant_share = input_data.pool_amount * input_data.pro_rata_share
    tenant_share = tenant_share.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name='Calculate tenant pool share',
            inputs={
                'pool_amount': input_data.pool_amount,
                'pro_rata_share': input_data.pro_rata_share,
            },
            operation=f'{input_data.pool_amount} * {input_data.pro_rata_share}',
            output=tenant_share,
        )

    # Calculate amount above stop
    above_stop = max(Decimal('0'), tenant_share - threshold)
    stop_applied = tenant_share > threshold

    if trace:
        trace.add_step(
            name='Apply expense stop',
            inputs={
                'tenant_share': tenant_share,
                'threshold': threshold,
            },
            operation='max(0, tenant_share - threshold)',
            output=above_stop,
            note='Under stop - tenant pays $0' if not stop_applied else f'Above stop by ${above_stop}',
        )

    return ExpenseStopResult(
        pool_amount=input_data.pool_amount,
        tenant_share_before_stop=tenant_share,
        threshold=threshold,
        above_stop=above_stop,
        stop_applied=stop_applied,
    )


def apply_expense_stops(
    pool_breakdown: Dict[str, Decimal],
    expense_stops: Dict[str, Decimal],
    tenant_sqft: Decimal,
    pro_rata_share: Decimal,
    trace: Optional[CalculationTrace] = None,
) -> Dict[str, Decimal]:
    """
    Apply expense stops to multiple pools.

    Args:
        pool_breakdown: Pool name -> amount mapping
        expense_stops: Pool name -> per_sqft_stop mapping
        tenant_sqft: Tenant's rentable square feet
        pro_rata_share: Tenant's share percentage
        trace: Optional calculation trace

    Returns:
        Modified pool breakdown with stopped amounts
    """
    result = dict(pool_breakdown)

    for pool_name, stop_per_sqft in expense_stops.items():
        if pool_name in result:
            stop_result = calculate_expense_stop(
                ExpenseStopInput(
                    pool_amount=result[pool_name],
                    stop_per_sqft=stop_per_sqft,
                    tenant_sqft=tenant_sqft,
                    pro_rata_share=pro_rata_share,
                ),
                trace,
            )
            # Replace pool amount with above-stop amount
            # Note: This adjusts the pool to the recoverable portion
            result[pool_name] = stop_result.above_stop / pro_rata_share if pro_rata_share > 0 else Decimal('0')

    return result
```

---

## Definition of Done
- [ ] Expense stop calculation works correctly
- [ ] Per-pool stops handled
- [ ] Zero result when under stop
- [ ] Tests with realistic examples
- [ ] Trace captures calculation
