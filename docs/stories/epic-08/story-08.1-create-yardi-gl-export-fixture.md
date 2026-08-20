# Story 8.1: Create Yardi GL Export Fixture

## Story Info
- **Epic**: Test Fixture Generation
- **Estimated Hours**: 4
- **Dependencies**: None (foundational test data)
- **Status**: `completed` ✓
- **Completion Date**: 2025-12-30
- **Verification**: All 16 tests passing, no placeholders, all acceptance criteria met

## User Story
As a developer, I need realistic Yardi Voyager GL export files so that I can test the Yardi parser with production-like data.

## Acceptance Criteria
- CSV file at `tests/fixtures/yardi/gl_export_standard.csv` with 500+ rows
- Includes Yardi-specific formatting: merged property headers, account hierarchy
- Contains all expense categories: Taxes, Insurance, Utilities, R&M, Management Fee, CAM
- Includes realistic account codes (4xxx series for revenue, 5xxx-6xxx for expenses)
- Has both positive (debit) and negative (credit) amounts
- Contains date range spanning 12 months
- File fingerprint matches Yardi detection regex
- Create malformed variant for error handling tests

## Technical Specifications
Create `tests/fixtures/generators/yardi_generator.py` with:
- YardiGLFixtureGenerator class
- Realistic Yardi account structure (5100-5700 range)
- Vendor list for transaction descriptions
- Monthly distribution algorithm with realistic variation
- Debit and credit transaction generation
- Running balance calculations

Generate:
- Header rows matching Yardi format (property code, date range)
- Data rows with account, date, description, vendor, debit/credit amounts
- Balanced expense categories with realistic ranges
- Credit memos for occasional refunds
- Expected values JSON with row count and net expenses

**Implementation Approach**:
- Language: Python 3.11+
- Dependencies: `pandas>=2.3.0`, `faker>=20.0.0` (for generating realistic data)
- Generator class: Inherits from `BaseFixtureGenerator` (if exists) or standalone class
- Output: CSV file matching Yardi GL Export format

## Test Cases
- Fixture file created with correct number of rows
- File is valid CSV and parseable
- Yardi detection regex matches file header
- Expected values file created with correct data
- Malformed fixture tests parser error handling
- Account codes are in valid Yardi range
- Dates span full calendar year
- Amounts are realistic and in expected ranges
- Running balance calculated correctly
- Both debits and credits included

## Definition of Done
- [x] Standard fixture has 500+ realistic rows (513 rows ✓)
- [x] All expense categories represented (6 categories: Taxes, Insurance, Utilities, CAM, R&M, Management Fee ✓)
- [x] File fingerprint matches Yardi detection (test passes ✓)
- [x] Expected values JSON created for assertions (yardi_gl_standard.json ✓)
- [x] Malformed fixture tests error handling (gl_export_malformed.csv ✓)
- [x] Fixtures documented in README (README.md complete ✓)
- [x] Parser successfully processes standard fixture (3 integration tests pass ✓)
