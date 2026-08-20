# Story 5.12: Create Import Batch Tracking

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Not Started
**Estimated Time**: 3 hours

---

## User Story

**As a** system
**I want** to track import batches with status and deduplication
**So that** users can't accidentally import the same file twice

---

## Acceptance Criteria

- [ ] **AC1**: SHA256 hash computed for uploaded files
- [ ] **AC2**: Duplicate files rejected with clear message
- [ ] **AC3**: Status tracked (pending, processing, completed, failed)
- [ ] **AC4**: Error log stored for failed imports
- [ ] **AC5**: Batch ID returned for status polling

---

## Technical Specifications

### Files to Create

```
backend/app/services/ingestion/
└── batch.py
```

### Implementation Details

**batch.py**:
```python
"""
Import batch tracking and deduplication.
"""
import hashlib
from datetime import datetime
from typing import BinaryIO, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel

from app.database.client import get_supabase_admin


class ImportBatch(BaseModel):
    """Import batch record."""
    id: UUID
    organization_id: UUID
    property_id: UUID
    file_name: str
    file_hash: str
    source_system: str
    status: str = 'pending'
    row_count: int = 0
    error_count: int = 0
    error_log: list = []
    created_at: datetime = None
    updated_at: datetime = None


def compute_file_hash(file: BinaryIO) -> str:
    """Compute SHA256 hash of file contents."""
    sha256 = hashlib.sha256()
    file.seek(0)
    for chunk in iter(lambda: file.read(8192), b''):
        sha256.update(chunk)
    file.seek(0)
    return sha256.hexdigest()


async def check_duplicate(
    organization_id: UUID,
    file_hash: str,
) -> Optional[ImportBatch]:
    """Check if file has already been imported."""
    client = get_supabase_admin()

    result = client.table('import_batches') \
        .select('*') \
        .eq('organization_id', str(organization_id)) \
        .eq('file_hash', file_hash) \
        .execute()

    if result.data:
        return ImportBatch(**result.data[0])
    return None


async def create_batch(
    organization_id: UUID,
    property_id: UUID,
    file_name: str,
    file_hash: str,
    source_system: str,
) -> ImportBatch:
    """Create a new import batch record."""
    client = get_supabase_admin()

    batch_id = uuid4()

    data = {
        'id': str(batch_id),
        'organization_id': str(organization_id),
        'property_id': str(property_id),
        'file_name': file_name,
        'file_hash': file_hash,
        'source_system': source_system,
        'status': 'pending',
    }

    result = client.table('import_batches').insert(data).execute()
    return ImportBatch(**result.data[0])


async def update_batch_status(
    batch_id: UUID,
    status: str,
    row_count: int = None,
    error_count: int = None,
    error_log: list = None,
) -> ImportBatch:
    """Update batch status and counts."""
    client = get_supabase_admin()

    update_data = {'status': status}

    if row_count is not None:
        update_data['row_count'] = row_count
    if error_count is not None:
        update_data['error_count'] = error_count
    if error_log is not None:
        update_data['error_log'] = error_log

    result = client.table('import_batches') \
        .update(update_data) \
        .eq('id', str(batch_id)) \
        .execute()

    return ImportBatch(**result.data[0])


class DuplicateFileError(Exception):
    """File has already been imported."""
    def __init__(self, existing_batch: ImportBatch):
        self.existing_batch = existing_batch
        super().__init__(
            f"File was already imported on {existing_batch.created_at} "
            f"(batch {existing_batch.id})"
        )
```

---

## Definition of Done

- [ ] Hash computation works
- [ ] Duplicates rejected
- [ ] Status updates work
- [ ] Error log stored

---

## Notes

Batch tracking prevents duplicate imports and provides audit trail. SHA256 hashing ensures that even if a file is renamed, we can detect it's the same content. Status tracking enables progress indicators in the UI.
