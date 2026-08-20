# Story 10.4: Create Unit List Component

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 3
- **Dependencies**: Story 10.2 (Property detail tabs)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to see and manage units within a property so that I can track individual spaces.

## Acceptance Criteria
- Table within property detail Units tab
- Columns: unit number, sqft, status, tenant (if leased)
- Inline status toggle (active/inactive)
- Add unit button opens modal
- Edit/delete actions per row
- Optimistic updates for status changes
- Empty state when no units

## Technical Specifications
Implement UnitsTab component at `frontend/src/components/properties/UnitsTab.tsx`:
- React Query for units data fetching
- DataTable component for unit listing
- UnitFormModal for create/edit
- Optimistic updates with rollback
- Status toggle with switch component
- Dropdown menu for edit/delete actions
- Empty state component

Table columns:
- Unit Number
- Rentable Sqft (formatted)
- Usable Sqft (formatted)
- Current Tenant (if leased)
- Active status (toggle switch)
- Actions menu (edit, delete)

Optimistic updates:
- Update UI immediately
- Cancel previous queries
- Snapshot previous state
- Rollback on error
- Invalidate queries on success

## Test Cases
- Unit table displays all columns
- Status toggle updates optimistically
- Add unit opens modal
- Edit unit opens modal with data
- Delete shows confirmation
- Empty state displays when no units
- Unit tests for optimistic updates

## Definition of Done
- [ ] Unit table displays all columns
- [ ] Status toggle updates optimistically
- [ ] Add unit opens modal
- [ ] Edit unit opens modal with data
- [ ] Delete shows confirmation
- [ ] Empty state displays when no units
- [ ] Unit tests for optimistic updates
