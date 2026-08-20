# Story 10.1: Create Property List Page

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 3
- **Dependencies**: Epic 1 (Design system), Epic 4 (Backend CRUD APIs), Epic 9 (Protected routes)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to see a list of all properties in my organization so that I can select one to work on.

## Acceptance Criteria
- Table displays: name, address, total sqft, unit count, status
- Search by property name or address
- Sort by any column (default: name asc)
- Pagination with configurable page size
- Empty state with "Add your first property" CTA
- Click row navigates to property detail
- "Add Property" button in header
- Loading skeleton while fetching

## Technical Specifications
Implement PropertyListPage at `frontend/src/pages/properties/PropertyListPage.tsx`:
- React Query for data fetching and caching
- DataTable component for displaying results
- Search input with debouncing
- Column sorting capability
- Pagination with page size selector
- PropertyTableSkeleton for loading state
- EmptyState component for no results
- Row click navigation

Table columns:
- Property Name (with code subtextl)
- Address (with city, state, zip)
- Total Rentable Sqft (formatted with commas)
- Unit Count
- Status badge (active/inactive styling)

Search and filtering:
- Search property name or address
- Debounced search (300ms)
- Pagination from query results

## Test Cases
- Table renders with all columns
- Search filters results
- Sorting works on all columns
- Pagination works correctly
- Empty state displays when no properties
- Row click navigates to detail
- Add button navigates to form
- Loading skeleton displays
- Unit tests for table component
- Performance with 1000+ properties

## Definition of Done
- [ ] Table renders with all columns
- [ ] Search filters results
- [ ] Sorting works on all columns
- [ ] Pagination works correctly
- [ ] Empty state displays when no properties
- [ ] Row click navigates to detail
- [ ] Add button navigates to form
- [ ] Loading skeleton displays
- [ ] Unit tests for table component
- [ ] Handles 1000+ properties without lag
