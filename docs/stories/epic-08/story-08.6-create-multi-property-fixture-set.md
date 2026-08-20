# Story 8.6: Create Multi-Property Fixture Set

## Story Info
- **Epic**: Test Fixture Generation
- **Estimated Hours**: 4
- **Dependencies**: Stories 8.1-8.5 (all fixture types)
- **Status**: `pending`

## User Story
As a developer, I need a comprehensive multi-property fixture set so that I can test end-to-end scenarios across the full data flow.

## Acceptance Criteria
- 3 properties with different characteristics
- 10+ tenants across all properties
- Full GL data for 12-month period
- Matching rent roll data
- Sample lease PDFs for each tenant
- Expected calculation outputs for each tenant
- Single script generates all coordinated fixtures

## Technical Specifications
Create `tests/fixtures/generators/multi_property_generator.py` with:
- MultiPropertyFixtureSet class
- Three properties with different characteristics:
  - Parkview Office Tower: Class A, 100k sqft, 95% target occupancy
  - Metro Business Center: Class B, 75k sqft, 92% target occupancy
  - Harbor Industrial Park: Industrial, 200k sqft, 90% target occupancy

For each property:
- Generate GL export with realistic expenses
- Generate rent roll with matched units
- Generate tenant lease PDFs
- Calculate expected reconciliation outputs
- Track all in coordinated manifest

Manifest includes:
- Generated date and year
- Property metadata and summary statistics
- List of files for each property
- Tenant information with lease files and expected results
- Cross-references for end-to-end testing

Fixture coordination:
- Tenant sqft distributed across building
- Pro-rata shares sum to 100% (with vacancy)
- GL expenses match rent roll period
- All data points reference consistent IDs
- Seeded random for reproducibility

## Test Cases
- 3 properties generated with correct characteristics
- GL and rent roll data coordinated and consistent
- Tenant fixtures created for each property
- Expected reconciliation outputs calculated
- Master manifest correctly links all files
- Fixture set reproducible (seeded random)
- Full E2E test successfully uses fixture set
- All cross-references valid
- File paths correctly documented

## Definition of Done
- [ ] 3 properties generated with full data
- [ ] GL and rent roll data coordinated
- [ ] Tenant lease PDFs created
- [ ] Expected reconciliation outputs calculated
- [ ] Master manifest links all files
- [ ] Full E2E test can use fixture set
- [ ] Fixtures reproduce consistently (seeded random)
