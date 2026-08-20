# Story 11.4: Create Column Mapping Wizard

## Story Info
- **Epic**: Data Ingestion UI
- **Estimated Hours**: 4
- **Dependencies**: Story 11.3
- **Status**: `pending`

## User Story
As a CAM analyst, I want to map columns from generic files to required fields so that I can import data from any source.

## Acceptance Criteria
- Shows sample data from file (first 5 rows)
- Drag-and-drop or dropdown column mapping
- Required fields clearly marked
- Validation prevents proceeding without required mappings
- Option to skip columns
- Preview of mapped data
- Save mapping as template for future use
- Only shown for generic/unknown sources

## Technical Specifications

See epic-11/_overview.md (Story 11.4) for detailed technical specifications including ColumnMappingWizard component implementation.

## Test Cases
- Source columns display with sample values
- Mapping dropdown works for each column
- Required fields validated before proceeding
- Auto-detection suggests initial mappings
- Skip option available for unused columns
- Save as template option works
- Validation messages clear
- Unit tests for mapping logic

## Definition of Done
- [ ] Source columns display with sample values
- [ ] Mapping dropdown works for each column
- [ ] Required fields validated before proceeding
- [ ] Auto-detection suggests initial mappings
- [ ] Skip option available for unused columns
- [ ] Save as template option works
- [ ] Validation messages clear
- [ ] Unit tests for mapping logic
