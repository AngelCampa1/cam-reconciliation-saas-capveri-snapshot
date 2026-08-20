# Story 2.14: Create Schema Sync Test

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** developer
**I want** automated tests that catch schema drift between Pydantic and Zod
**So that** frontend/backend mismatches are caught before deployment

> **Note**: This story needs to be extended to include the new billing/feedback models added in stories 2.15-2.18 (Subscription, Invoice, Promotion, Feedback). When those models are implemented, add corresponding schema sync tests.

## Acceptance Criteria

- [x] **AC1**: Test creates valid data in Python, validates in TypeScript
- [x] **AC2**: Test creates valid data in TypeScript, validates in Python
- [x] **AC3**: Test runs as part of CI pipeline
- [x] **AC4**: Covers all domain models (Property, Lease, GLEntry, etc.)
- [x] **AC5**: Fails if schemas accept different inputs
- [ ] **AC6**: Covers billing models (Subscription, Invoice) - *pending stories 2.15-2.16*
- [ ] **AC7**: Covers platform models (Promotion, Feedback) - *pending stories 2.17-2.18*

## Technical Specifications

**Files to Create**:
```
backend/tests/
└── test_schema_sync.py

frontend/src/
└── __tests__/
    └── schema-sync.test.ts
```

**Approach**:
1. Generate JSON samples from Pydantic models
2. Export as fixtures
3. Validate in TypeScript tests
4. Vice versa: TypeScript generates, Python validates

**backend/tests/test_schema_sync.py**:
```python
"""
Schema synchronization tests.
Ensures Pydantic and Zod schemas accept the same inputs.
"""
import json
from pathlib import Path
from uuid import uuid4
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.models.property import Property, PropertyCreate
from app.models.lease import Lease, LeaseCreate
from app.models.lease_recovery_profile import LeaseRecoveryProfile
from app.models.enums import CapType, LeaseStatus

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "schema_sync"

def test_property_schema_generates_valid_json():
    """Property model generates JSON that frontend can validate."""
    property_data = Property(
        id=uuid4(),
        organization_id=uuid4(),
        name="Test Property",
        address_line1="123 Main St",
        address_line2=None,
        city="New York",
        state="NY",
        postal_code="10001",
        total_rentable_sqft=Decimal("50000.00"),
        total_usable_sqft=Decimal("45000.00"),
        common_area_sqft=Decimal("5000.00"),
        target_occupancy=Decimal("0.95"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    # Export as JSON (for frontend validation)
    json_output = property_data.model_dump_json()

    # Verify it's valid JSON
    parsed = json.loads(json_output)
    assert parsed["name"] == "Test Property"
    assert float(parsed["total_rentable_sqft"]) == 50000.00

def test_lease_with_recovery_profile():
    """Lease with embedded recovery profile validates correctly."""
    recovery = LeaseRecoveryProfile(
        base_year=2023,
        base_year_amount=Decimal("100000.00"),
        gross_up_base_year=True,
        pro_rata_share=Decimal("0.05"),
        cap_type=CapType.CUMULATIVE,
        cap_rate=Decimal("0.05"),
        admin_fee_percentage=Decimal("0.15"),
        excluded_pools=[],
    )

    lease = LeaseCreate(
        property_id=uuid4(),
        tenant_name="Acme Corp",
        start_date=date(2024, 1, 1),
        end_date=date(2029, 12, 31),
        status=LeaseStatus.ACTIVE,
        recovery_profile=recovery,
    )

    json_output = lease.model_dump_json()
    parsed = json.loads(json_output)

    assert parsed["recovery_profile"]["cap_type"] == "cumulative"
    assert float(parsed["recovery_profile"]["pro_rata_share"]) == 0.05
```

**frontend/src/__tests__/schema-sync.test.ts**:
```typescript
import { describe, it, expect } from 'vitest'
import { PropertySchema } from '../types/property'
import { LeaseSchema } from '../types/lease'

describe('Schema Sync Tests', () => {
  it('should validate property data from backend', () => {
    const backendData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      organization_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Property',
      address_line1: '123 Main St',
      address_line2: null,
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      total_rentable_sqft: '50000.00',
      total_usable_sqft: '45000.00',
      common_area_sqft: '5000.00',
      target_occupancy: '0.95',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = PropertySchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })

  it('should validate lease with recovery profile from backend', () => {
    const backendData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      property_id: '550e8400-e29b-41d4-a716-446655440001',
      unit_id: null,
      tenant_name: 'Acme Corp',
      start_date: '2024-01-01',
      end_date: '2029-12-31',
      status: 'active',
      recovery_profile: {
        base_year: 2023,
        base_year_amount: '100000.00',
        gross_up_base_year: true,
        pro_rata_share: '0.05',
        cap_type: 'cumulative',
        cap_rate: '0.05',
        admin_fee_percentage: '0.15',
        excluded_pools: [],
      },
      document_url: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = LeaseSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.recovery_profile.cap_type).toBe('cumulative')
    }
  })
})
```

## Definition of Done

- [x] Tests catch schema mismatches
- [x] Covers all critical models
- [x] Runs in CI

## Estimated Time

3 hours
