# Story 11.5: Create Import History List

## Story Info
- **Epic**: Data Ingestion UI
- **Estimated Hours**: 3
- **Dependencies**: Story 11.1
- **Status**: `pending`

## User Story
As a CAM analyst, I want to see all past imports for a property so that I can track what data has been loaded.

## Acceptance Criteria
- Table showing: filename, date, source, row count, status
- Filter by status (all, success, failed, processing)
- Status updates in real-time during processing
- Click to view import details
- Re-upload option for failed imports
- Delete import option (with confirmation)

## Technical Specifications

See epic-11/_overview.md (Story 11.5) for detailed technical specifications including ImportsTab component implementation.

## Test Cases
- Import history table displays correctly
- Status filter works
- Processing status updates in real-time
- Delete with confirmation works
- Empty state shows new import CTA
- Row counts and errors display
- Unit tests for component

## Definition of Done
- [ ] Import history table displays correctly
- [ ] Status filter works
- [ ] Processing status updates in real-time
- [ ] Delete with confirmation works
- [ ] Empty state shows new import CTA
- [ ] Row counts and errors display
- [ ] Unit tests for component
