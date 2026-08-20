# Story 10.8: Create Recovery Profile Editor

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 4
- **Dependencies**: Story 10.7 (Lease form)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to configure the lease recovery profile so that calculations use the correct terms from the lease.

## Acceptance Criteria
- Section within lease form for recovery profile
- Fields organized by category: Base Year, Caps, Gross-Up, Admin Fee
- Cap fields only show when cap type != none
- Base year field only shows when base year method selected
- Gross-up checkbox enables gross-up fields
- Admin fee percentage input
- Validation on all numeric fields
- Tooltips explain each field

## Technical Specifications
Implement RecoveryProfileEditor component at `frontend/src/components/leases/RecoveryProfileEditor.tsx`:
- React Hook Form integration
- Conditional field rendering
- Tooltip components for field explanations
- Card-based layout for sections
- Switch component for toggles
- Select component for dropdown options
- Input validation (numeric ranges)

Sections:
- Pro-Rata Share (percentage)
- Base Year Stop (toggle + year + amount)
- Expense Cap (type select + rate + applies-to)
- Gross-Up (toggle + target occupancy)
- Admin Fee (percentage)

Conditional logic:
- Show cap rate/applies-to only when cap != none
- Show base year amount only when base year enabled
- Show gross-up target only when gross-up enabled

Field tooltips:
- Pro-Rata: percentage of building expenses
- Base Year: tenant only pays increases over base
- Cap Rate: maximum increase percentage
- Gross-Up: adjust for target occupancy
- Admin Fee: landlord administration costs

## Test Cases
- All recovery profile fields render
- Conditional fields show/hide correctly
- Cap fields appear when cap type selected
- Base year fields appear when enabled
- Gross-up fields appear when enabled
- Tooltips explain each field
- Validation on numeric inputs
- Unit tests for conditional rendering

## Definition of Done
- [ ] All recovery profile fields render
- [ ] Conditional fields show/hide correctly
- [ ] Cap fields appear when cap type selected
- [ ] Base year fields appear when enabled
- [ ] Gross-up fields appear when enabled
- [ ] Tooltips explain each field
- [ ] Validation on numeric inputs
- [ ] Unit tests for conditional rendering
