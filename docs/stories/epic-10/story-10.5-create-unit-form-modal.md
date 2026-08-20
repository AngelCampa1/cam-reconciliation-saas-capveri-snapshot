# Story 10.5: Create Unit Form Modal

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 2
- **Dependencies**: Story 10.4 (Unit list)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to add or edit a unit in a modal so that I can quickly manage units without leaving the property page.

## Acceptance Criteria
- Modal dialog for create/edit
- Fields: unit number, rentable sqft, usable sqft
- Validation on all fields
- Save closes modal and refreshes list
- Cancel closes without saving
- Loading state on save button

## Technical Specifications
Implement UnitFormModal component at `frontend/src/components/properties/UnitFormModal.tsx`:
- React Hook Form with Zod schema validation
- Dialog component from UI library
- Create and edit mode handling
- React Query mutations
- Modal state management
- Loading states

Form fields:
- Unit Number (required, string)
- Rentable Sqft (required, positive number)
- Usable Sqft (optional, positive number)

## Test Cases
- Modal opens for create and edit
- Form validates all fields
- Save creates/updates unit
- Modal closes on success
- Loading state on save button
- Unit tests for form logic

## Definition of Done
- [ ] Modal opens for create and edit
- [ ] Form validates all fields
- [ ] Save creates/updates unit
- [ ] Modal closes on success
- [ ] Loading state on save button
- [ ] Unit tests for form logic
