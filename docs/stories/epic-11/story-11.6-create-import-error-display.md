# Story 11.6: Create Import Error Display

## Story Info
- **Epic**: Data Ingestion UI
- **Estimated Hours**: 3
- **Dependencies**: Story 11.4
- **Status**: `pending`

## User Story
As a CAM analyst, I want to see detailed errors from failed imports so that I can fix the source data.

## Acceptance Criteria
- Error summary with total count
- List of errors with row/column context
- Original value shown with expected format
- Download error report option
- Ability to re-upload corrected file
- Clear indication of which rows were imported vs failed

## Technical Specifications

See epic-11/_overview.md (Story 11.6) for detailed technical specifications including ImportErrorDisplay component implementation.

## Test Cases
- Error summary displays correctly
- Errors grouped by type
- Error table shows row/column context
- Download report button works
- Retry button available
- Truncated for large error lists
- Unit tests for error display

## Definition of Done
- [ ] Error summary displays correctly
- [ ] Errors grouped by type
- [ ] Error table shows row/column context
- [ ] Download report button works
- [ ] Retry button available
- [ ] Truncated for large error lists
- [ ] Unit tests for error display
