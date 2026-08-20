# Story 7.2: Create Get Snapshot Endpoint

## Story Info
- **Epic**: Reconciliation API
- **Estimated Hours**: 3
- **Dependencies**: Story 7.1 (snapshots must be created first)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to retrieve a reconciliation snapshot with its full calculation trace so that I can review and audit the calculations.

## Acceptance Criteria
- GET `/api/v1/reconciliation/snapshots/{id}` returns full snapshot data
- Includes all calculated fields (gross-up, caps, tenant_share, etc.)
- Includes full calculation_trace with step-by-step breakdown
- Returns 404 if snapshot doesn't exist or user lacks access
- Optional `include_trace=false` query param to exclude trace (lighter response)

## Technical Specifications
Implement in `backend/app/api/v1/reconciliation.py`:
- Get snapshot endpoint with organization scoping
- Optional calculation trace inclusion
- ReconciliationSnapshotResponse model
- CalculationTraceStep model for detailed trace steps
- Decimal serialization for monetary values

Response includes:
- Snapshot metadata (id, lease_id, property_id, period)
- Area and share calculations
- Expense totals with gross-up adjustments
- Base year comparisons
- Cap type and applied cap amounts
- Final billable amounts including admin fee
- Optional detailed calculation trace with formula documentation

## Test Cases
- Retrieve full snapshot with calculation trace
- Retrieve snapshot without trace (lighter response)
- Trace excluded correctly with include_trace=false
- 404 returned for non-existent snapshot
- 404 returned for inaccessible snapshot (different org)
- All Decimal fields properly serialized as strings
- Calculation trace includes all steps in correct order
- Formula field documents calculation logic

## Definition of Done
- [ ] Endpoint returns full snapshot data
- [ ] Calculation trace included when requested
- [ ] Trace excluded when include_trace=false
- [ ] 404 returned for non-existent or inaccessible snapshots
- [ ] All Decimal fields properly serialized
- [ ] Unit tests cover all response scenarios
- [ ] Response matches OpenAPI schema
