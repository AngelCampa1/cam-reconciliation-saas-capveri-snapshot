# Story 7.3: Create List Snapshots Endpoint

## Story Info
- **Epic**: Reconciliation API
- **Estimated Hours**: 3
- **Dependencies**: Story 7.1 (snapshots must be created)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to list reconciliation snapshots with filtering and pagination so that I can find specific calculations.

## Acceptance Criteria
- GET `/api/v1/reconciliation/snapshots` returns paginated list
- Filters: property_id, lease_id, period_start, period_end, is_finalized
- Sorting: by created_at, tenant_name, tenant_share (default: created_at desc)
- Pagination: page/size or cursor-based
- Summary response (no calculation_trace in list view)

## Technical Specifications
Implement in `backend/app/api/v1/reconciliation.py`:
- List endpoint with dynamic filtering
- Flexible sorting on supported columns
- Offset-based pagination with configurable page size
- ReconciliationSnapshotSummary lightweight model
- Organization scoping for all results

Query construction handles:
- Optional filter combination
- Dynamic column sorting
- Count queries for pagination metadata
- Result limit enforcement (max 100 per page)

## Test Cases
- List all snapshots without filters
- Filter by property_id only
- Filter by lease_id only
- Filter by finalized status
- Filter by date range (period_start and period_end)
- Multiple filters combined correctly
- Sorting by created_at (default descending)
- Sorting by tenant_name (ascending/descending)
- Sorting by tenant_share (numeric sorting)
- Pagination: first page
- Pagination: subsequent pages
- Pagination: last page with fewer results
- Results are organization-scoped
- Performance acceptable for 1000+ snapshots

## Definition of Done
- [ ] Endpoint returns paginated list of snapshots
- [ ] All filters work correctly
- [ ] Sorting works for all supported columns
- [ ] Pagination calculates correctly
- [ ] Only organization-scoped data returned
- [ ] Unit tests cover filter combinations
- [ ] Performance acceptable for 1000+ snapshots
