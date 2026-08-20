# Story 10.3: Create Property Form

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 3
- **Dependencies**: Story 10.1 (Property list)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to create or edit a property so that I can add new buildings to the system.

## Acceptance Criteria
- Form for create and edit modes
- Fields: name, code, address, city, state, zip
- BOMA area fields: total rentable sqft, load factor
- Target occupancy percentage
- Validation on all required fields
- Save button with loading state
- Cancel returns to previous page
- Success redirects to property detail

## Technical Specifications
Implement PropertyFormPage at `frontend/src/pages/properties/PropertyFormPage.tsx`:
- React Hook Form with Zod schema validation
- Create and edit mode handling
- Property data loading for edit mode
- React Query mutations for create/update
- Form validation with inline error display
- Loading states on submit
- Success/error toast notifications
- Breadcrumb navigation

Form sections:
- Property Information (name, code, address, city, state, zip)
- BOMA Area Information (total rentable sqft, common area, load factor, target occupancy)

Validation:
- Property name: 2+ characters
- Property code: 1-20 characters
- Address: required
- City: required
- State: 2-letter code
- ZIP: 5-digit or 5+4 format
- Total rentable sqft: positive number
- Load factor: 1.0-2.0
- Target occupancy: 0-100

## Test Cases
- Create form works and saves new property
- Edit form loads existing data
- All validations work correctly
- Loading states display correctly
- Success redirects to detail page
- Cancel returns to previous page
- Error messages display for validation
- Unit tests for form validation

## Definition of Done
- [ ] Create form works and saves new property
- [ ] Edit form loads existing data
- [ ] All validations work correctly
- [ ] Loading states display correctly
- [ ] Success redirects to detail page
- [ ] Cancel returns to previous page
- [ ] Error messages display for validation
- [ ] Unit tests for form validation
