# Story 10.10: Integration Test - Property CRUD E2E

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 4
- **Dependencies**: All property/lease stories (10.1-10.9)
- **Status**: `pending`

## User Story
As a developer, I need end-to-end tests for property management so that I can verify the full CRUD workflow works correctly.

## Acceptance Criteria
- Test: Create property → Verify in list
- Test: Add unit to property → Verify in units tab
- Test: Create lease → Verify in leases tab
- Test: Edit property → Verify changes saved
- Test: Delete property → Verify removed from list
- Tests run against real backend

## Technical Specifications
Implement E2E tests with Playwright at `frontend/e2e/properties.spec.ts`:
- Test setup with login before each test
- Property creation flow
- Unit addition flow
- Lease creation flow
- Property editing flow
- Property deletion flow
- All tests navigate and verify results

Each test flow:
- Navigate to relevant page
- Fill in required form fields
- Submit form
- Verify success message/navigation
- Verify results in list or table
- Clean up if needed

## Test Cases
- Create property test passes
- Add unit test passes
- Create lease test passes
- Edit property test passes
- Delete property test passes
- Tests run in CI pipeline
- Tests clean up after themselves

## Definition of Done
- [ ] Create property test passes
- [ ] Add unit test passes
- [ ] Create lease test passes
- [ ] Edit property test passes
- [ ] Delete property test passes
- [ ] Tests run in CI pipeline
- [ ] Tests clean up after themselves
