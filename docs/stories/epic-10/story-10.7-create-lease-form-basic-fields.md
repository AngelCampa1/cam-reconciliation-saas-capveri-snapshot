# Story 10.7: Create Lease Form (Basic Fields)

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 3
- **Dependencies**: Story 10.6 (Lease list)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to create or edit basic lease information so that I can establish tenant agreements.

## Acceptance Criteria
- Form for basic lease fields
- Fields: tenant name, unit (select), start date, end date, status
- Unit dropdown shows available units
- Date pickers for lease dates
- Validation: end date > start date
- Separate story for recovery profile (10.8)

## Technical Specifications
Implement LeaseFormPage at `frontend/src/pages/leases/LeaseFormPage.tsx` (partial):
- React Hook Form with Zod schema validation
- Tenant name input
- Unit dropdown (select from available units)
- Date picker components for lease dates
- Status dropdown (pending, active, expired, terminated)
- Validation for date range

Form schema:
- tenantName: required, 2+ characters
- unitId: required UUID
- leaseStart: required date
- leaseEnd: required date > start
- status: required enum

## Test Cases
- Basic lease form renders
- Unit dropdown shows property units
- Date pickers work correctly
- Validation prevents end < start
- All fields save correctly
- Unit tests for validation

## Definition of Done
- [ ] Basic lease form renders
- [ ] Unit dropdown shows property units
- [ ] Date pickers work correctly
- [ ] Validation prevents end < start
- [ ] All fields save correctly
- [ ] Unit tests for validation
