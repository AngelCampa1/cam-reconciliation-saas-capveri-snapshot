# Story 10.2: Create Property Detail Page

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 4
- **Dependencies**: Story 10.1 (Property list), Epic 1 (Design system)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to view property details with tabs for related data so that I can manage all aspects of a property.

## Acceptance Criteria
- Master-detail layout: property info at top, tabs below
- Tabs: Overview, Units, Leases, Imports, Reconciliations
- Overview shows property stats and BOMA area info
- Edit button opens property form
- Delete button with confirmation
- Breadcrumb navigation
- Loading state for each tab

## Technical Specifications
Implement PropertyDetailPage at `frontend/src/pages/properties/PropertyDetailPage.tsx`:
- React Query for property data fetching
- Tabs component for section organization
- Stats cards showing key metrics
- PropertyOverviewTab, UnitsTab, LeasesTab, ImportsTab components
- Delete confirmation dialog
- Breadcrumb navigation
- Edit/Delete buttons in header

Stats cards display:
- Total Rentable Sqft
- Unit Count
- Active Lease Count
- Occupancy Rate

Tabs:
- Overview: Property stats, BOMA info
- Units: Units table with add/edit/delete
- Leases: Leases table with recovery profile
- Imports: Import history
- Reconciliations: Reconciliation results

## Test Cases
- Property header displays name and address
- Stats cards show key metrics
- All tabs render correctly
- Tab content loads data on activation
- Edit button navigates to edit form
- Delete shows confirmation and works
- Breadcrumb navigation works
- Loading state displays correctly
- Unit tests for component logic

## Definition of Done
- [ ] Property header displays name and address
- [ ] Stats cards show key metrics
- [ ] All tabs render correctly
- [ ] Tab content loads data on activation
- [ ] Edit button navigates to edit form
- [ ] Delete shows confirmation and works
- [ ] Breadcrumb navigation works
- [ ] Loading state displays correctly
- [ ] Unit tests for component logic
