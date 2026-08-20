# Story 0.8: Create Test Fixture Directory

## Story Info
- **Epic**: Developer Foundation & Tooling
- **Estimated Hours**: 1
- **Dependencies**: Story 0.1
- **Status**: `completed`

## User Story
**As a** developer
**I want** a well-organized test fixture directory with documentation
**So that** synthetic test data has a consistent home and format expectations are clear

## Acceptance Criteria
- [ ] **AC1**: `backend/tests/fixtures/` directory exists
- [ ] **AC2**: `README.md` in fixtures directory explains:
  - Purpose of each fixture type
  - Naming conventions
  - How to add new fixtures
- [ ] **AC3**: Subdirectories created for different fixture types:
  - `csv/` - for Yardi, MRI CSV samples
  - `pdf/` - for lease document samples
  - `json/` - for expected calculation outputs
- [ ] **AC4**: `.gitkeep` files preserve empty directories
- [ ] **AC5**: Sample fixture file exists as template

## Technical Specifications
**Files to Create**:
```
backend/tests/fixtures/
├── README.md
├── csv/
│   └── .gitkeep
├── pdf/
│   └── .gitkeep
└── json/
    └── .gitkeep
```

**README.md Content**:
```markdown
# Test Fixtures

This directory contains test fixtures for CapVeri.

## Directory Structure

- `csv/` - CSV exports from ERP systems (Yardi, MRI)
- `pdf/` - Sample lease documents for OCR testing
- `json/` - Expected calculation outputs for assertion

## Naming Conventions

- CSV files: `{source}_{type}_{scenario}.csv`
  - Example: `yardi_gl_basic.csv`, `mri_rentroll_multiperiod.csv`
- PDF files: `lease_{scenario}.pdf`
  - Example: `lease_full_terms.pdf`, `lease_no_caps.pdf`
- JSON files: `expected_{calculation}_{scenario}.json`
  - Example: `expected_grossup_basic.json`

## Adding New Fixtures

1. Place file in appropriate subdirectory
2. Use descriptive scenario name
3. Document any special characteristics in this README
4. Reference in tests using `pathlib.Path(__file__).parent / "fixtures"`

## Current Fixtures

_None yet - fixtures will be added in Epic 8_
```

## Definition of Done
- [ ] Directory structure created
- [ ] README clearly documents conventions
- [ ] New developer can understand where to put test data
