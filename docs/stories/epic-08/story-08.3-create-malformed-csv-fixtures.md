# Story 8.3: Create Malformed CSV Fixtures

## Story Info
- **Epic**: Test Fixture Generation
- **Estimated Hours**: 3
- **Dependencies**: None (foundational test data)
- **Status**: `pending`

## User Story
As a developer, I need malformed CSV files with common real-world errors so that I can test parser error handling and recovery.

## Acceptance Criteria
- Encoding errors: UTF-8 BOM, Windows-1252, mixed encodings
- Structural errors: missing columns, extra columns, inconsistent row lengths
- Data errors: invalid dates, non-numeric amounts, special characters
- Format errors: merged cells represented as blanks, footer rows, page breaks
- Each error type in separate fixture for isolated testing
- Comprehensive fixture combining multiple error types

## Technical Specifications
Create `tests/fixtures/generators/malformed_generator.py` with:
- MalformedFixtureGenerator class
- Generate individual error type fixtures
- Generate comprehensive multi-error fixture
- Document expected errors in JSON

Error types to generate:
- Encoding: UTF-8 with BOM, Windows-1252, mixed encoding
- Structural: missing columns, extra columns, inconsistent rows, empty file, headers only
- Data: invalid dates, non-numeric amounts, special characters, quoted fields
- Format: merged cells, footer rows, page breaks, repeated headers

Each fixture paired with expected_errors.json documenting:
- Whether file is parseable
- Expected warnings or errors
- Number of valid vs invalid rows
- Recommended handling

## Test Cases
- All encoding error fixtures created
- All structural error fixtures created
- All data error fixtures created
- All format error fixtures created
- Comprehensive fixture combines multiple errors
- Expected errors JSON documents expected behavior
- Parsers handle all fixtures gracefully (no crashes)
- Parser generates appropriate warnings
- Parser skips or corrects invalid rows where possible
- Parser provides clear error messages

## Definition of Done
- [ ] All encoding error fixtures created
- [ ] All structural error fixtures created
- [ ] All data error fixtures created
- [ ] All format error fixtures created
- [ ] Comprehensive fixture combines multiple errors
- [ ] Expected errors JSON documents expected behavior
- [ ] Parsers handle all fixtures gracefully (no crashes)
