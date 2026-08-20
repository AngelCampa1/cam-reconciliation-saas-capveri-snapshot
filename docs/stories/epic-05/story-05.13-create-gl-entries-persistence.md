# Story 5.13: Create GL Entries Persistence

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Not Started
**Estimated Time**: 3 hours

---

## User Story

**As a** system
**I want** to persist parsed GL entries to the database
**So that** imported data is available for calculations

---

## Acceptance Criteria

- [ ] **AC1**: Batch insert from DataFrame
- [ ] **AC2**: Raw row data preserved in JSONB
- [ ] **AC3**: Foreign keys validated
- [ ] **AC4**: Performance acceptable (5000 rows < 5s)
- [ ] **AC5**: Rollback on error

---

## Technical Specifications

### Files to Create

```
backend/app/services/ingestion/
└── persistence.py
```

### Implementation Details

**persistence.py**:
```python
"""
GL Entry persistence layer.
"""
from typing import List
from uuid import UUID

import pandas as pd

from app.database.client import get_supabase_admin


async def persist_gl_entries(
    df: pd.DataFrame,
    batch_id: UUID,
    property_id: UUID,
    chunk_size: int = 500,
) -> int:
    """
    Persist GL entries from DataFrame to database.

    Uses batch inserts for performance.

    Args:
        df: DataFrame with normalized GL entries
        batch_id: Import batch ID
        property_id: Property these entries belong to
        chunk_size: Rows per insert batch

    Returns:
        Number of rows inserted
    """
    client = get_supabase_admin()

    # Prepare records
    required_columns = [
        'account_code', 'account_description', 'amount',
        'transaction_date', 'period_year', 'period_month',
        'vendor_name', 'description', 'raw_row_data'
    ]

    # Ensure all required columns exist
    for col in required_columns:
        if col not in df.columns:
            df[col] = None

    # Add batch and property IDs
    df['import_batch_id'] = str(batch_id)
    df['property_id'] = str(property_id)

    # Convert to records
    records = df[required_columns + ['import_batch_id', 'property_id']].to_dict('records')

    # Convert types for JSON serialization
    for record in records:
        # Convert date to ISO string
        if record['transaction_date'] is not None:
            if hasattr(record['transaction_date'], 'isoformat'):
                record['transaction_date'] = record['transaction_date'].isoformat()
            else:
                record['transaction_date'] = str(record['transaction_date'])

        # Ensure amount is float
        if record['amount'] is not None:
            record['amount'] = float(record['amount'])

        # Ensure periods are int
        if record['period_year'] is not None:
            record['period_year'] = int(record['period_year'])
        if record['period_month'] is not None:
            record['period_month'] = int(record['period_month'])

        # Ensure raw_row_data is dict
        if record['raw_row_data'] is None:
            record['raw_row_data'] = {}

    # Insert in chunks
    total_inserted = 0
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i + chunk_size]
        result = client.table('gl_entries').insert(chunk).execute()
        total_inserted += len(result.data)

    return total_inserted


async def delete_batch_entries(batch_id: UUID) -> int:
    """Delete all GL entries for a batch (for reprocessing)."""
    client = get_supabase_admin()

    result = client.table('gl_entries') \
        .delete() \
        .eq('import_batch_id', str(batch_id)) \
        .execute()

    return len(result.data)
```

---

## Definition of Done

- [ ] Batch insert works
- [ ] Raw data preserved
- [ ] Performance acceptable
- [ ] Rollback works

---

## Notes

Chunked batch inserts are critical for performance. Inserting 5000 rows one-by-one would take minutes; chunked batch inserts complete in seconds. The `raw_row_data` JSONB column preserves the original data for audit purposes.
