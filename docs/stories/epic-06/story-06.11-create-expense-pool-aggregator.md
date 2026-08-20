# Story 6.11: Create Expense Pool Aggregator

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** calculation engine
**I want** GL entries aggregated by expense pool
**So that** I can calculate totals for gross-up and allocation

---

## Acceptance Criteria

- [ ] **AC1**: Sums GL entries matching pool patterns
- [ ] **AC2**: Supports wildcard patterns (5*, 51?)
- [ ] **AC3**: Handles allocation percentages for split accounts
- [ ] **AC4**: Returns pool totals and breakdown
- [ ] **AC5**: Performance acceptable for large datasets

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
└── pool_aggregator.py
```

**pool_aggregator.py**:
```python
"""
Expense pool aggregation from GL entries.
"""
import re
from decimal import Decimal
from typing import List, Dict, Optional
from uuid import UUID

from pydantic import BaseModel

from app.services.calculation.models import CalculationTrace


class GLEntry(BaseModel):
    """Minimal GL entry for aggregation."""
    id: UUID
    account_code: str
    amount: Decimal


class PoolMapping(BaseModel):
    """Pool mapping configuration."""
    pool_id: UUID
    pool_name: str
    pattern: str
    allocation_percentage: Decimal = Decimal('1.0')
    priority: int = 0


class PoolTotal(BaseModel):
    """Total for a single pool."""
    pool_id: UUID
    pool_name: str
    total_amount: Decimal
    entry_count: int
    matched_accounts: List[str]


def pattern_to_regex(pattern: str) -> str:
    """Convert wildcard pattern to regex.

    * matches any characters
    ? matches single character
    """
    # Escape regex special chars except * and ?
    escaped = re.escape(pattern)
    # Convert wildcards
    escaped = escaped.replace(r'\*', '.*')
    escaped = escaped.replace(r'\?', '.')
    return f'^{escaped}$'


def aggregate_by_pools(
    entries: List[GLEntry],
    mappings: List[PoolMapping],
    trace: Optional[CalculationTrace] = None,
) -> Dict[UUID, PoolTotal]:
    """
    Aggregate GL entries by expense pool.

    For each entry, finds matching pool(s) based on account patterns.
    If multiple patterns match, uses highest priority.
    Applies allocation percentage for split accounts.

    Args:
        entries: GL entries to aggregate
        mappings: Pool mapping configurations
        trace: Optional calculation trace

    Returns:
        Dictionary of pool ID to totals
    """
    # Compile patterns
    compiled_mappings = [
        (mapping, re.compile(pattern_to_regex(mapping.pattern), re.IGNORECASE))
        for mapping in mappings
    ]

    # Sort by priority (higher first)
    compiled_mappings.sort(key=lambda x: x[0].priority, reverse=True)

    # Initialize pool totals
    pool_totals: Dict[UUID, PoolTotal] = {}
    for mapping in mappings:
        if mapping.pool_id not in pool_totals:
            pool_totals[mapping.pool_id] = PoolTotal(
                pool_id=mapping.pool_id,
                pool_name=mapping.pool_name,
                total_amount=Decimal('0'),
                entry_count=0,
                matched_accounts=[],
            )

    # Aggregate entries
    unmatched_entries = []

    for entry in entries:
        matched = False

        for mapping, regex in compiled_mappings:
            if regex.match(entry.account_code):
                pool = pool_totals[mapping.pool_id]

                # Apply allocation percentage
                allocated_amount = entry.amount * mapping.allocation_percentage

                pool.total_amount += allocated_amount
                pool.entry_count += 1

                if entry.account_code not in pool.matched_accounts:
                    pool.matched_accounts.append(entry.account_code)

                matched = True

                # If 100% allocation, don't check other patterns
                if mapping.allocation_percentage >= Decimal('1'):
                    break

        if not matched:
            unmatched_entries.append(entry)

    if trace:
        for pool_id, pool in pool_totals.items():
            trace.add_step(
                name=f'Aggregate pool: {pool.pool_name}',
                inputs={
                    'entry_count': pool.entry_count,
                    'unique_accounts': len(pool.matched_accounts),
                },
                operation='Sum matching GL entries',
                output=pool.total_amount,
            )

        if unmatched_entries:
            trace.add_step(
                name='Unmatched entries',
                inputs={'count': len(unmatched_entries)},
                operation='Entries not matching any pool',
                output=sum(e.amount for e in unmatched_entries),
                note='Consider adding pool mappings for these accounts',
            )

    return pool_totals
```

---

## Definition of Done
- [ ] Pattern matching works
- [ ] Wildcards supported
- [ ] Allocation percentage applied
- [ ] Performance tested

---

## Estimated Time: 3 hours
