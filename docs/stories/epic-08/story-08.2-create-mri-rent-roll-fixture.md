# Story 8.2: Create MRI Rent Roll Fixture

## Story Info
- **Epic**: Test Fixture Generation
- **Estimated Hours**: 3
- **Dependencies**: None (foundational test data)
- **Status**: `completed` ✓
- **Completion Date**: 2025-12-30
- **Verification**: All 19 tests passing, no placeholders, all acceptance criteria met

## User Story
As a developer, I need realistic MRI rent roll export files so that I can test the MRI parser with production-like data.

## Acceptance Criteria
- CSV file at `tests/fixtures/mri/rent_roll_standard.csv` with 50+ units
- Includes MRI-specific columns: PERIOD, REF, SOURCE, ENTITY
- Contains realistic tenant data: names, suite numbers, square footage, rents
- Includes various lease statuses: active, expired, pending
- Has both vacant and occupied units
- File fingerprint matches MRI detection regex
- Create variant with different MRI report format

## Technical Specifications
Create `tests/fixtures/generators/mri_generator.py` with:
- MRIRentRollGenerator class
- Tenant name list and suite prefix options
- Unit generation with floor/suite numbering
- Occupancy probability (85% default)
- Realistic square footage range (800-5000 sqft)
- Market rent calculation ($25-45 PSF annually)
- Lease date generation with realistic ranges

Generate:
- 50+ units with varied floor numbers
- MRI-specific column set
- Mixed occupancy status (occupied/vacant)
- Various lease statuses (active, expired, pending)
- Expected values JSON with occupancy rate and unit count
- Large property variant (200+ units) for performance testing

## Test Cases
- Fixture file created with correct number of units
- File is valid CSV and parseable
- MRI detection regex matches file header
- Expected values file created with correct data
- Occupancy rate calculated correctly
- All lease statuses included
- Mix of occupied and vacant units
- Square footage in realistic ranges
- Rents calculated per PSF formula
- Large property variant performs well
- Parser successfully processes fixture

## Definition of Done
- [x] Standard fixture has 50+ units (60 units ✓)
- [x] All MRI-specific columns present (PERIOD, REF NUM, SOURCE, UNIT, TENANT, SQFT, STATUS, DEBIT, CREDIT ✓)
- [x] Mix of occupied/vacant units (46 occupied, 14 vacant = 77% occupancy ✓)
- [x] Various lease statuses included (Active, Expired, Pending, Vacant ✓)
- [x] Expected values JSON created (mri_rent_roll_standard.json & mri_rent_roll_large.json ✓)
- [x] Parser successfully processes fixture (4 integration tests pass ✓)
- [x] Large property variant for performance testing (240 units ✓)
