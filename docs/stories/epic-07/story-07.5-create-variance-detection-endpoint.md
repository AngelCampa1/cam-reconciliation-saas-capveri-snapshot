# Story 7.5: Create Variance Detection Endpoint

## Story Info
- **Epic**: Reconciliation API
- **Estimated Hours**: 4
- **Dependencies**: Story 7.2 (need snapshot retrieval), Story 7.1 (need multiple snapshots)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to compare current calculations to prior finalized snapshots so that I can identify significant changes requiring review.

## Acceptance Criteria
- GET `/api/v1/reconciliation/snapshots/{id}/variance` compares to prior period
- Returns line-by-line variance analysis
- Flags variances exceeding configurable threshold (default 5%)
- Includes variance reason hints (new expense category, rate change, etc.)
- Returns 404 if no prior period exists

## Technical Specifications
Implement in `backend/app/api/v1/reconciliation.py`:
- Variance analysis endpoint
- Prior period lookup logic (assumes annual periods)
- Variance calculation and comparison
- Reason hint generation based on field changes
- VarianceAnalysis and VarianceItem models
- Threshold parameterization

Variance detection handles:
- Comparison fields: total_property_expenses, grossed_up_expenses, gross_up_amount, capped_amount, admin_fee_amount, tenant_share
- Percentage change calculation
- Threshold exceedance flagging
- Reason hints for common variance causes
- Graceful handling of missing prior period

Reason hint generation detects:
- Gross-up factor changes
- Cap rate or cap application changes
- Pro-rata share changes
- New expense categories in current period

## Test Cases
- Compare snapshot to prior period with variances exceeding threshold
- Compare snapshot to prior period with no significant variances
- Variances below threshold marked correctly
- Variances above threshold marked correctly
- Reason hints generated for gross-up changes
- Reason hints generated for cap changes
- Reason hints generated for pro-rata changes
- No prior period returns gracefully (has_prior=false)
- Threshold parameter affects flagging
- Percentage calculations accurate
- Edge case: zero base year values handled
- Edge case: negative variances (decrease in expenses)
- Summary includes count of significant variances

## Definition of Done
- [ ] Variance endpoint returns comparison data
- [ ] Threshold filtering works correctly
- [ ] Reason hints generated for common variance causes
- [ ] No prior period handled gracefully
- [ ] Decimal precision maintained in calculations
- [ ] Unit tests cover variance calculations
- [ ] Edge cases (zero values, new fields) handled
