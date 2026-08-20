# Story 25.4: Fix N+1 Query Issues

**Epic**: 25 - Production Readiness & Polish
**Estimated Hours**: 1 hour
**Dependencies**: None
**Status**: `pending`
**Priority**: P2

---

## User Story

As a **platform user**, I want **API endpoints to load quickly even with many properties/leases** so that **the application feels responsive**.

---

## Acceptance Criteria

- [ ] Properties list endpoint loads in <200ms for 100 properties
- [ ] Reconciliation list endpoint loads in <300ms for 50 snapshots
- [ ] All N+1 query issues identified via EXPLAIN ANALYZE
- [ ] Eager loading implemented for nested relationships
- [ ] API P95 latency remains <500ms after optimization
- [ ] No performance regression in existing endpoints

---

## Technical Specifications

### What is N+1 Query Problem?

**Problem**: Fetching a list triggers 1 query for the list + N queries for related data

**Example**:
```python
# BAD - N+1 queries
properties = db.query(Property).all()  # 1 query
for prop in properties:
    units = prop.units  # N queries (1 per property)
    leases = prop.leases  # N more queries
# Total: 1 + N + N = 201 queries for 100 properties

# GOOD - 3 queries total
properties = (
    db.query(Property)
    .options(joinedload(Property.units))
    .options(joinedload(Property.leases))
    .all()
)
# Total: 3 queries (property + units + leases joined)
```

### Identifying N+1 Issues

**Method 1: Enable query logging**
```python
# backend/app/core/database.py
import logging
logging.basicConfig()
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
```

**Method 2: Use SQLAlchemy profiling**
```python
from sqlalchemy import event
from sqlalchemy.engine import Engine
import time

@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault('query_start_time', []).append(time.time())
    print(f"Query: {statement}")

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    total = time.time() - conn.info['query_start_time'].pop(-1)
    print(f"Query time: {total:.4f}s")
```

**Method 3: Use EXPLAIN ANALYZE**
```sql
EXPLAIN ANALYZE
SELECT * FROM properties WHERE organization_id = '...';
```

### Likely N+1 Locations

**1. Properties list endpoint** (`backend/app/api/v1/properties.py`)
```python
# BEFORE (suspected N+1)
@router.get("/", response_model=PropertyListResponse)
def list_properties(ctx: OrgContext):
    result = ctx.table("properties").select("*").execute()
    properties = result.data

    # Each property might trigger separate queries for:
    # - units count
    # - leases count
    # - recent reconciliations
```

**Fix**:
```python
# AFTER (optimized with joined loads)
from sqlalchemy.orm import joinedload, selectinload

properties = (
    db.query(Property)
    .filter(Property.organization_id == org_id)
    .options(
        selectinload(Property.units),
        selectinload(Property.leases),
        selectinload(Property.reconciliation_snapshots)
    )
    .all()
)
```

**2. Reconciliation snapshots endpoint** (`backend/app/api/v1/reconciliation.py`)
```python
# BEFORE (suspected N+1)
snapshots = ctx.table("reconciliation_snapshots").select("*").execute()
# Each snapshot might trigger:
# - property details
# - tenant details
# - calculation trace
```

**Fix**:
```python
snapshots = (
    db.query(ReconciliationSnapshot)
    .filter(ReconciliationSnapshot.organization_id == org_id)
    .options(
        joinedload(ReconciliationSnapshot.property),
        selectinload(ReconciliationSnapshot.tenant_shares)
    )
    .all()
)
```

### Optimization Strategies

**Strategy 1: Use `joinedload` for one-to-one relationships**
```python
# Use when: Each parent has exactly one related child
.options(joinedload(Property.address))
```

**Strategy 2: Use `selectinload` for one-to-many relationships**
```python
# Use when: Each parent has multiple children (avoids cartesian product)
.options(selectinload(Property.units))
```

**Strategy 3: Use `subqueryload` for complex relationships**
```python
# Use when: Nested relationships need optimization
.options(subqueryload(Property.leases).selectinload(Lease.tenant))
```

**Strategy 4: Add database indexes**
```sql
-- If foreign key lookups are slow
CREATE INDEX idx_units_property_id ON units(property_id);
CREATE INDEX idx_leases_property_id ON leases(property_id);
CREATE INDEX idx_reconciliation_snapshots_property_id ON reconciliation_snapshots(property_id);
```

---

## Implementation Plan

### Step 1: Profile Current Performance (15 min)

```python
# Add temporary profiling to identify N+1 queries
import cProfile
import pstats

def profile_endpoint():
    profiler = cProfile.Profile()
    profiler.enable()

    # Make API request
    response = client.get("/api/v1/properties")

    profiler.disable()
    stats = pstats.Stats(profiler)
    stats.sort_stats('cumulative')
    stats.print_stats(20)
```

**Capture baseline**:
```bash
# Count queries for properties list
curl http://localhost:8000/api/v1/properties | wc -l
# Expected: 1 + N queries (bad)
```

### Step 2: Fix Properties Endpoint (20 min)

**File**: `backend/app/api/v1/properties.py`

```python
# Add eager loading for related data
from sqlalchemy.orm import selectinload

properties = (
    db.query(Property)
    .filter(Property.organization_id == org_id)
    .options(
        selectinload(Property.units),
        selectinload(Property.leases),
    )
    .all()
)
```

### Step 3: Fix Reconciliation Endpoint (15 min)

**File**: `backend/app/api/v1/reconciliation.py`

```python
snapshots = (
    db.query(ReconciliationSnapshot)
    .filter(ReconciliationSnapshot.organization_id == org_id)
    .options(
        joinedload(ReconciliationSnapshot.property),
        selectinload(ReconciliationSnapshot.tenant_shares),
    )
    .order_by(ReconciliationSnapshot.created_at.desc())
    .all()
)
```

### Step 4: Verify Performance Improvement (10 min)

```bash
# After optimization - should see 3-5 queries max (good)
curl http://localhost:8000/api/v1/properties | wc -l
```

**Benchmark results**:
```
BEFORE:
- Properties (100 items): 201 queries, 1200ms
- Reconciliations (50 items): 151 queries, 800ms

AFTER:
- Properties (100 items): 3 queries, 150ms (8x faster)
- Reconciliations (50 items): 4 queries, 120ms (6.6x faster)
```

---

## Test Cases

### Performance Tests

Create `backend/tests/performance/test_n_plus_one.py`:
```python
def test_properties_list_query_count(db_session, seed_100_properties):
    """Verify properties list uses <5 queries regardless of count."""
    from sqlalchemy import event

    query_count = 0

    def count_queries(conn, cursor, statement, *args):
        nonlocal query_count
        query_count += 1

    event.listen(db_session.bind, "before_cursor_execute", count_queries)

    response = client.get("/api/v1/properties")

    assert response.status_code == 200
    assert len(response.json()["items"]) == 100
    assert query_count <= 5, f"Too many queries: {query_count} (N+1 issue)"


def test_properties_list_response_time(seed_100_properties):
    """Verify properties list responds in <200ms for 100 properties."""
    import time

    start = time.time()
    response = client.get("/api/v1/properties")
    elapsed = time.time() - start

    assert response.status_code == 200
    assert elapsed < 0.2, f"Too slow: {elapsed:.3f}s"
```

### Regression Tests

- [ ] All existing API tests still pass
- [ ] Response data structure unchanged
- [ ] Pagination still works correctly
- [ ] Filtering still works correctly

---

## Definition of Done

- [ ] N+1 queries identified and documented
- [ ] Eager loading implemented for properties endpoint
- [ ] Eager loading implemented for reconciliations endpoint
- [ ] Performance tests added and passing
- [ ] Query count reduced from O(N) to O(1)
- [ ] Response time <200ms for properties, <300ms for reconciliations
- [ ] All existing tests still pass
- [ ] Story marked as `completed` in STORY_TRACKER.md

---

## Files to Modify

1. `backend/app/api/v1/properties.py` - Add `selectinload` for units/leases
2. `backend/app/api/v1/reconciliation.py` - Add `joinedload`/`selectinload` for relationships
3. `backend/tests/performance/test_n_plus_one.py` - Create performance regression tests

---

## Notes

**Scope**:
- Only fix the 2 most critical endpoints (properties, reconciliations)
- Other endpoints can be optimized in future stories if needed

**Future enhancements** (out of scope):
- Add query caching for frequently accessed data
- Implement GraphQL to let frontend specify exact fields needed
- Add database connection pooling optimization
- Implement read replicas for heavy read operations
