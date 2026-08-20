# Story 11.7: Create GL Entry Preview

## Story Info
- **Epic**: Data Ingestion UI
- **Estimated Hours**: 3
- **Dependencies**: Story 11.4
- **Status**: `pending`

## User Story
As a CAM analyst, I want to preview imported GL entries so that I can verify the data was parsed correctly.

## Acceptance Criteria
- Paginated table of imported GL entries
- Columns: date, account, description, debit, credit, balance
- Search by account or description
- Sort by any column
- Filter by date range
- Export to CSV option
- Link back to source import batch

## Technical Specifications

See epic-11/_overview.md (Story 11.7) for detailed technical specifications including GLEntryPreview component implementation.

## Test Cases
- GL entry table displays correctly
- Search by account/description works
- Date range filter works
- Pagination works
- Sort by columns works
- Export to CSV works
- Debit/credit formatting correct
- Unit tests for component

## Definition of Done
- [ ] GL entry table displays correctly
- [ ] Search by account/description works
- [ ] Date range filter works
- [ ] Pagination works
- [ ] Sort by columns works
- [ ] Export to CSV works
- [ ] Debit/credit formatting correct
- [ ] Unit tests for component
