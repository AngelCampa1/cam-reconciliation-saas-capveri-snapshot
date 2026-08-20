# Story 6.14: Create Calculation Trace Logger

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)
**Dependencies**: Story 6.1 (CalculationTrace model)

---

## User Story
**As an** auditor
**I want** every calculation step logged
**So that** I can verify how numbers were derived

---

## Acceptance Criteria

- [ ] **AC1**: Every step has input, operation, output
- [ ] **AC2**: Steps are numbered sequentially
- [ ] **AC3**: Notes explain business context
- [ ] **AC4**: Trace is JSON-serializable
- [ ] **AC5**: Trace stored in `reconciliation_snapshots.calculation_trace` JSONB column
- [ ] **AC6**: Trace is attached when snapshot is created (before finalization)
- [ ] **AC7**: Human-readable export format available for audit reports
- [ ] **AC8**: Trace retrieval returns fully hydrated CalculationTrace object

---

## Technical Specifications

The `CalculationTrace` model from Story 6.1 handles this. This story adds persistence and retrieval.

**Database Schema** (added to `reconciliation_snapshots` table in Epic 3):
```sql
-- Column already defined in Epic 3.11
ALTER TABLE reconciliation_snapshots
ADD COLUMN IF NOT EXISTS calculation_trace JSONB DEFAULT '[]'::jsonb;

-- Index for trace queries (optional, for searching by step name)
CREATE INDEX IF NOT EXISTS idx_snapshots_trace_gin
ON reconciliation_snapshots USING GIN (calculation_trace);
```

**Files to Create**:
```
backend/app/services/calculation/
└── trace_persistence.py
```

**trace_persistence.py**:
```python
"""
Persistence for calculation traces.
"""
from typing import Optional
from uuid import UUID

from app.database.client import get_supabase_admin
from app.services.calculation.models import CalculationTrace


async def save_trace_to_snapshot(
    snapshot_id: UUID,
    trace: CalculationTrace,
) -> None:
    """
    Save calculation trace to a reconciliation snapshot.

    Args:
        snapshot_id: ID of the reconciliation snapshot
        trace: Complete calculation trace
    """
    client = get_supabase_admin()

    # Convert trace to JSON
    trace_json = [step.model_dump() for step in trace.steps]

    await client.table('reconciliation_snapshots') \
        .update({'calculation_trace': trace_json}) \
        .eq('id', str(snapshot_id)) \
        .execute()


async def get_trace_from_snapshot(
    snapshot_id: UUID,
) -> Optional[CalculationTrace]:
    """
    Retrieve calculation trace from a snapshot.

    Args:
        snapshot_id: ID of the reconciliation snapshot

    Returns:
        CalculationTrace or None if not found
    """
    client = get_supabase_admin()

    result = await client.table('reconciliation_snapshots') \
        .select('calculation_trace, property_id, period_start_date, period_end_date') \
        .eq('id', str(snapshot_id)) \
        .single() \
        .execute()

    if not result.data:
        return None

    trace = CalculationTrace(
        calculation_type='reconciliation',
        property_id=UUID(result.data['property_id']),
        period_start=result.data['period_start_date'],
        period_end=result.data['period_end_date'],
    )

    for step_data in result.data.get('calculation_trace', []):
        trace.steps.append(CalculationStep(**step_data))

    return trace


def trace_to_readable_format(trace: CalculationTrace) -> str:
    """
    Convert trace to human-readable format for export.
    """
    lines = [
        f"Calculation Trace: {trace.calculation_type}",
        f"Period: {trace.period_start} to {trace.period_end}",
        "-" * 60,
    ]

    for step in trace.steps:
        lines.append(f"\n{step.step_order}. {step.step_name}")
        lines.append(f"   Inputs: {step.input_values}")
        lines.append(f"   Operation: {step.operation}")
        lines.append(f"   Result: {step.output_value}")
        if step.note:
            lines.append(f"   Note: {step.note}")

    return "\n".join(lines)
```

---

## Definition of Done
- [ ] Trace saves to database
- [ ] Trace retrieves correctly
- [ ] JSON-serializable
- [ ] Human-readable export

---

## Estimated Time: 3 hours
