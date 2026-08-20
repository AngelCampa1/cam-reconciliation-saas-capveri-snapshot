# Story 7.1: Create Calculate Reconciliation Endpoint

## Story Info
- **Epic**: Reconciliation API
- **Estimated Hours**: 4
- **Dependencies**: Epic 6 (Calculation engine), Epic 4 (API skeleton and auth patterns), Epic 3 (Database schema)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to trigger a reconciliation calculation for a property and period so that I can generate draft results for review.

## Acceptance Criteria
- POST `/api/v1/reconciliation/calculate` accepts property_id, period_start, period_end
- Validates property exists and user has access
- Calls calculation engine orchestrator
- Creates draft ReconciliationSnapshot records (one per lease)
- Returns list of snapshot IDs with summary data
- Handles calculation errors gracefully with detailed error messages
- Long calculations return 202 Accepted with job_id for polling

## Technical Specifications
Implement the calculation endpoint in `backend/app/api/v1/reconciliation.py` with:
- Request validation using Pydantic models (CalculateRequest)
- Background task processing with FastAPI BackgroundTasks
- Job status tracking in CalculationJob model
- Conflict handling for existing draft snapshots
- Comprehensive error handling with CalculationError mapping

See epic file for full code specifications including:
- Calculate endpoint with background job processing
- Job status polling endpoint
- ReconciliationSnapshot model persistence
- Database models for calculation_jobs table

## Test Cases
- Successful calculation with valid property and date range
- Rejected request for non-existent property (404)
- Conflict error when draft snapshots already exist
- Forced recalculation with force_recalculate flag
- Job status endpoint returns correct states (pending, running, completed, failed)
- Calculation errors captured in job record with detailed messages
- Background task completes successfully
- Multiple concurrent calculations handled correctly

## Definition of Done
- [ ] Calculate endpoint accepts valid requests and returns job_id
- [ ] Background task runs calculation correctly
- [ ] Job status endpoint returns current status
- [ ] Draft snapshots created for all active leases
- [ ] Existing drafts handled per force_recalculate flag
- [ ] Calculation errors captured in job record
- [ ] Unit tests cover success, conflict, and error paths
- [ ] Integration test verifies full calculation flow
