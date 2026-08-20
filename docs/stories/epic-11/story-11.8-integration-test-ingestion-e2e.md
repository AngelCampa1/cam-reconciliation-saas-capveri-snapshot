# Story 11.8: Integration Test - Ingestion E2E

## Story Info
- **Epic**: Data Ingestion UI
- **Estimated Hours**: 4
- **Dependencies**: Stories 11.1-11.7
- **Status**: `pending`

## User Story
As a developer, I need end-to-end tests for the ingestion flow so that I can verify file upload and processing works correctly.

## Acceptance Criteria
- Test: Upload Yardi CSV → Detect source → Skip mapping → See imported entries
- Test: Upload generic CSV → Map columns → Complete import
- Test: Upload invalid file → See error display
- Tests use real backend with test fixtures

## Technical Specifications

See epic-11/_overview.md (Story 11.8) for detailed technical specifications including Playwright E2E tests.

## Test Cases
- Yardi upload test passes
- Generic with mapping test passes
- Error display test passes
- File size validation test passes
- Tests run in CI pipeline
- Tests use test fixtures from Epic 8

## Definition of Done
- [ ] Yardi upload test passes
- [ ] Generic with mapping test passes
- [ ] Error display test passes
- [ ] File size validation test passes
- [ ] Tests run in CI pipeline
- [ ] Tests use test fixtures from Epic 8
