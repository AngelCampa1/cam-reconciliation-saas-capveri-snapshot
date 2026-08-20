# Story 6.3: Create Variable Expense Filter

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** calculation engine
**I want** to identify which expenses are variable
**So that** only appropriate expenses are grossed up

---

## Acceptance Criteria

- [ ] **AC1**: Identifies variable vs fixed expenses
- [ ] **AC2**: Taxes are NOT grossed up
- [ ] **AC3**: Insurance is NOT grossed up
- [ ] **AC4**: Uses pool configuration for categorization
- [ ] **AC5**: Logs which pools were grossed up

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
└── expense_filter.py
```

**expense_filter.py**:
```python
"""
Filter expenses by gross-up applicability.
"""
from decimal import Decimal
from typing import List, Dict, Optional
from uuid import UUID

from pydantic import BaseModel


class ExpensePoolSummary(BaseModel):
    """Summary of expenses in a pool."""
    pool_id: UUID
    pool_name: str
    pool_type: str
    total_amount: Decimal
    is_gross_up_applicable: bool
    gross_up_target: Optional[Decimal] = None


class FilteredExpenses(BaseModel):
    """Expenses split by gross-up applicability."""
    gross_up_expenses: Decimal  # Total to be grossed up
    fixed_expenses: Decimal  # Total NOT grossed up
    pool_breakdown: List[ExpensePoolSummary]


def filter_expenses_for_gross_up(
    pool_totals: Dict[UUID, ExpensePoolSummary],
) -> FilteredExpenses:
    """
    Split expenses into gross-up eligible and fixed.

    Fixed expenses (not grossed up):
    - Real estate taxes
    - Insurance
    - Any pool with is_gross_up_applicable = False

    Variable expenses (grossed up):
    - Operating expenses
    - Utilities
    - Maintenance
    - Any pool with is_gross_up_applicable = True

    Args:
        pool_totals: Dictionary of pool ID to expense summary

    Returns:
        FilteredExpenses with totals and breakdown
    """
    gross_up_total = Decimal('0')
    fixed_total = Decimal('0')
    breakdown = []

    for pool_id, summary in pool_totals.items():
        breakdown.append(summary)

        if summary.is_gross_up_applicable:
            gross_up_total += summary.total_amount
        else:
            fixed_total += summary.total_amount

    return FilteredExpenses(
        gross_up_expenses=gross_up_total,
        fixed_expenses=fixed_total,
        pool_breakdown=breakdown,
    )


# Standard pool types and their default gross-up applicability
DEFAULT_POOL_SETTINGS = {
    'operating': True,
    'utility': True,
    'maintenance': True,
    'management': True,
    'tax': False,
    'insurance': False,
    'capital': False,  # Usually excluded
}


def get_default_gross_up_setting(pool_type: str) -> bool:
    """Get default gross-up setting for a pool type."""
    return DEFAULT_POOL_SETTINGS.get(pool_type.lower(), True)
```

---

## Definition of Done
- [ ] Variable vs fixed identified
- [ ] Taxes/Insurance excluded
- [ ] Pool config respected
- [ ] Breakdown returned

---

## Estimated Time: 2 hours
