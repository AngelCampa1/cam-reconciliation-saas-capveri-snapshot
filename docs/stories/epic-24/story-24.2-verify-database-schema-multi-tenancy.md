# Story 24.2: Verify Database Schema & Multi-Tenancy (Epics 2-3)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 5 hours
**Status**: `pending`
**Dependencies**: Epics 2, 3

---

## User Story

As a **platform administrator**,
I want to **verify that the database schema is complete and RLS policies prevent cross-tenant data access**,
So that **customer data is secure and compliant with multi-tenancy requirements**.

---

## Acceptance Criteria

### Schema Completeness (Epic 2)
- [ ] All Pydantic models have corresponding database tables
- [ ] All TypeScript Zod schemas match Pydantic models
- [ ] All foreign key relationships are correctly defined
- [ ] All indexes are created for query performance
- [ ] All JSONB columns have GIN indexes where appropriate

### Multi-Tenancy (Epic 3)
- [ ] Every table has `organization_id` column (except auth.users)
- [ ] Every table has RLS policies enabled
- [ ] RLS policies prevent cross-tenant data access
- [ ] RLS policies allow same-tenant data access
- [ ] Service role bypasses RLS when needed

### Data Integrity
- [ ] All constraints are enforced (NOT NULL, CHECK, UNIQUE)
- [ ] All triggers function correctly (audit logging, auto-updates)
- [ ] All enums match between Python, TypeScript, and PostgreSQL
- [ ] Immutability is enforced where required (e.g., finalized snapshots)

### Migration Quality
- [ ] All migrations apply cleanly on fresh database
- [ ] All migrations are reversible (have `down` migrations)
- [ ] Migration order is correct (dependencies)
- [ ] Seed data creates valid test records

---

## Technical Specifications

### Database Verification Script

Create a comprehensive verification script:

```sql
-- backend/tests/test_schema_verification.sql

-- Verify all tables have organization_id
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name NOT IN ('audit_log', 'spatial_ref_sys')
  AND table_name NOT IN (
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'organization_id'
  );
-- Should return 0 rows

-- Verify all tables have RLS enabled
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('audit_log')
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = pg_tables.tablename
  );
-- Should return 0 rows

-- Verify all foreign keys are valid
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace;
-- Should return all FK relationships

-- Verify all indexes exist
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
-- Should include indexes on all foreign keys and query-heavy columns
```

### RLS Negative Test Suite

Verify RLS prevents cross-tenant access:

```python
# backend/tests/test_rls_verification.py
import pytest
from app.core.database import get_supabase_client

async def test_rls_prevents_cross_tenant_property_access():
    """Verify user from Org A cannot read property from Org B."""
    client_org_a = get_supabase_client(user_id="org_a_user")
    client_org_b = get_supabase_client(user_id="org_b_user")

    # Org A creates property
    property_a = await client_org_a.table("properties").insert({
        "organization_id": "org_a",
        "name": "Org A Property",
        "address": "123 Main St"
    }).execute()

    # Org B should NOT see Org A's property
    result = await client_org_b.table("properties").select("*").eq(
        "id", property_a.data[0]["id"]
    ).execute()

    assert len(result.data) == 0, "RLS failed: cross-tenant read succeeded"

# Repeat for all tables: organizations, users, properties, units, leases,
# gl_entries, expense_pools, pool_mappings, reconciliation_snapshots,
# import_batches, subscriptions, invoices, promotions, feedback
```

### Schema-Pydantic Sync Test

```python
# backend/tests/test_schema_pydantic_sync.py
import pytest
from app.models import (
    Organization, User, Property, Unit, Lease,
    GLEntry, ExpensePool, PoolMapping, ReconciliationSnapshot
)
from app.core.database import get_supabase_client

async def test_all_pydantic_fields_match_db_schema():
    """Verify Pydantic models match database schema."""
    models = [Organization, User, Property, Unit, Lease, GLEntry, ExpensePool, PoolMapping, ReconciliationSnapshot]

    for model in models:
        # Get Pydantic fields
        pydantic_fields = set(model.model_fields.keys())

        # Get database columns
        client = get_supabase_client()
        db_columns = await client.rpc("get_table_columns", {
            "table_name": model.__tablename__
        }).execute()
        db_fields = set(col["column_name"] for col in db_columns.data)

        # Compare
        missing_in_db = pydantic_fields - db_fields
        missing_in_pydantic = db_fields - pydantic_fields

        assert not missing_in_db, f"{model.__name__}: fields in Pydantic but not in DB: {missing_in_db}"
        assert not missing_in_pydantic, f"{model.__name__}: fields in DB but not in Pydantic: {missing_in_pydantic}"
```

### Migration Test

```bash
# Test fresh migration
supabase db reset  # Drops and recreates database
supabase db push   # Applies all migrations

# Should complete with no errors
# Should create all tables
# Should enable all RLS policies
# Should insert seed data
```

### Performance Test

```python
# backend/tests/test_db_performance.py
import pytest
import time
from app.core.database import get_supabase_client

async def test_query_performance_with_indexes():
    """Verify indexes improve query performance."""
    client = get_supabase_client()

    # Create 10,000 GL entries
    entries = [{"organization_id": "test_org", "account_number": f"{i:06d}", "amount": 100.00} for i in range(10000)]
    await client.table("gl_entries").insert(entries).execute()

    # Query by account_number (should use index)
    start = time.time()
    result = await client.table("gl_entries").select("*").eq("account_number", "005000").execute()
    duration = time.time() - start

    assert duration < 0.1, f"Query took {duration}s, expected <0.1s (index may be missing)"
```

---

## Files to Audit

### Backend Models (Epic 2)
- `backend/app/models/organization.py`
- `backend/app/models/user.py`
- `backend/app/models/property.py`
- `backend/app/models/unit.py`
- `backend/app/models/lease.py`
- `backend/app/models/gl_entry.py`
- `backend/app/models/expense_pool.py`
- `backend/app/models/pool_mapping.py`
- `backend/app/models/reconciliation_snapshot.py`
- `backend/app/models/calculation_step.py`
- `backend/app/models/subscription.py`
- `backend/app/models/invoice.py`
- `backend/app/models/promotion.py`
- `backend/app/models/feedback.py`

### Frontend Schemas (Epic 2)
- `frontend/src/types/*.ts`
- `frontend/src/schemas/*.ts`

### Database Migrations (Epic 3)
- `supabase/migrations/20240101000001_create_organizations_table.sql`
- `supabase/migrations/20240101000002_create_users_table.sql`
- ... (all migrations)
- `supabase/migrations/seed.sql`

### Tests (Epic 3)
- `backend/tests/test_rls_negative.py`
- `frontend/tests/schema-sync.test.ts`

---

## Definition of Done

- [ ] All Pydantic models match database schema
- [ ] All TypeScript schemas match Pydantic models
- [ ] All migrations apply cleanly on fresh database
- [ ] All RLS policies prevent cross-tenant access (negative tests pass)
- [ ] All indexes exist and improve query performance
- [ ] All constraints are enforced
- [ ] All triggers function correctly
- [ ] Seed data creates valid test records
- [ ] Schema verification script passes
- [ ] Performance tests meet benchmarks (<0.1s for indexed queries)
- [ ] Any issues found are documented and fixed

---

## Notes

- This story is **critical for security** - RLS failures could leak customer data
- Run RLS tests with **real user sessions**, not service role
- Verify **immutability constraints** (e.g., finalized snapshots cannot be updated)
- Test with **large datasets** to verify index performance
- Document any schema changes needed to fix issues found

---

*Created: 2025-12-30*
*Status: pending*
