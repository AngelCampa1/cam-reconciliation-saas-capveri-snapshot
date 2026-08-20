# Story 11.3: Create Source Detection Display

## Story Info
- **Epic**: Data Ingestion UI
- **Estimated Hours**: 2
- **Dependencies**: Story 11.1
- **Status**: `pending`

## User Story
As a CAM analyst, I want to see what system the file was detected as so that I can confirm or override the detection.

## Acceptance Criteria
- Display detected source system (Yardi, MRI, Generic)
- Show confidence level (high, medium, low)
- Allow manual override via dropdown
- Show detection reasoning/hints
- Proceed button enabled after confirmation
- Different UI for high confidence vs low confidence

## Technical Specifications

See epic-11/_overview.md (Story 11.3) for detailed technical specifications including SourceDetection component implementation.

## Test Cases
- Detected source displays correctly
- Confidence badge shows appropriate color
- Hints/reasoning displayed
- Override dropdown works
- Low confidence shows warning
- Continue button works
- Unit tests for component

## Definition of Done
- [ ] Detected source displays correctly
- [ ] Confidence badge shows appropriate color
- [ ] Hints/reasoning displayed
- [ ] Override dropdown works
- [ ] Low confidence shows warning
- [ ] Continue button works
- [ ] Unit tests for component
