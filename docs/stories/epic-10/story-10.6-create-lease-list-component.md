# Story 10.6: Create Lease List Component

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 2
- **Dependencies**: Story 10.2 (Property detail tabs)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to see all leases for a property so that I can manage tenant agreements.

## Acceptance Criteria
- Table within property detail Leases tab
- Columns: tenant name, unit, dates, status, pro-rata share
- Status shown with color-coded badge
- Click row navigates to lease detail
- Add lease button
- Filter by status (all, active, expired)
- Empty state when no leases

## Technical Specifications
Implement LeasesTab component at `frontend/src/components/properties/LeasesTab.tsx`:
- React Query for leases data fetching
- DataTable component for lease listing
- Status filter dropdown
- Color-coded status badges
- Row click navigation
- Empty state component

Table columns:
- Tenant Name (with unit subtextl)
- Start Date (formatted)
- End Date (formatted)
- Pro-Rata Share (percentage)
- Status badge (color-coded)

Status colors:
- Active: green/success
- Expired: gray/muted
- Pending: yellow/warning
- Terminated: red/destructive

Filtering:
- All statuses
- Active only
- Expired only
- Pending only

## Test Cases
- Lease table displays all columns
- Status filter works
- Status badges color-coded
- Row click navigates to detail
- Add button navigates to form
- Empty state displays correctly
- Unit tests for component

## Definition of Done
- [ ] Lease table displays all columns
- [ ] Status filter works
- [ ] Status badges color-coded
- [ ] Row click navigates to detail
- [ ] Add button navigates to form
- [ ] Empty state displays correctly
- [ ] Unit tests for component
