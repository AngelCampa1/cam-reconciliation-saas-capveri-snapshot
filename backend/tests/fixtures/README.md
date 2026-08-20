# Test Fixtures

This directory contains test fixtures for CapVeri.

## Directory Structure

- `yardi/` - Yardi Voyager GL export fixtures
- `expected/` - Expected values for test assertions
- `generators/` - Fixture generation scripts
- `csv/` - CSV exports from ERP systems (Yardi, MRI) [Future]
- `pdf/` - Sample lease documents for OCR testing [Future]
- `json/` - Expected calculation outputs for assertion [Future]

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

### Yardi Voyager GL Export

**Standard Fixture** (`yardi/gl_export_standard.csv`):
- 513+ realistic GL transaction rows
- 19 unique account codes (5100-5700 range)
- 12-month date range
- All expense categories: Taxes, Insurance, Utilities, CAM, R&M, Management Fee
- Both debit and credit transactions
- Includes Yardi-specific header format for fingerprint detection
- Expected values: `expected/yardi_gl_standard.json`

**Malformed Fixture** (`yardi/gl_export_malformed.csv`):
- For testing error handling
- Missing Yardi fingerprint markers
- Invalid dates, amounts, and account codes
- Empty rows and missing required fields

**Generator** (`generators/yardi_generator.py`):
- Generates both standard and malformed fixtures
- Uses Faker library for realistic data
- Configurable row count, date range, and property details
- Run with: `python tests/fixtures/generators/yardi_generator.py`

**Tests** (`tests/test_yardi_fixtures.py`):
- 16 comprehensive test cases
- Validates fixture characteristics
- Tests parser integration
- Ensures data quality requirements are met

### MRI Rent Roll Export

**Standard Fixture** (`mri/rent_roll_standard.csv`):
- 60 realistic rent roll unit rows
- MRI-specific columns: PERIOD, REF NUM, SOURCE, UNIT, TENANT, SQFT, STATUS, DEBIT, CREDIT
- Mixed occupancy: 46 occupied, 14 vacant units (77% occupancy rate)
- Various lease statuses: Active, Expired, Pending, Vacant
- Realistic square footage range (800-5000 sqft)
- Rent calculated at $25-45 PSF annually
- Includes MRI-specific header format for fingerprint detection
- Expected values: `expected/mri_rent_roll_standard.json`

**Large Property Fixture** (`mri/rent_roll_large.csv`):
- 240 units for performance testing
- 90% occupancy rate (217 occupied, 23 vacant)
- Same data quality and structure as standard fixture
- Expected values: `expected/mri_rent_roll_large.json`

**Generator** (`generators/mri_generator.py`):
- Generates both standard and large property fixtures
- Uses Faker library for realistic tenant names
- Configurable floors, units per floor, occupancy rate
- Realistic lease date generation based on status
- Run with: `python tests/fixtures/generators/mri_generator.py`

**Tests** (`tests/test_mri_fixtures.py`):
- 19 comprehensive test cases
- Validates fixture characteristics and MRI-specific columns
- Tests parser integration with both fixtures
- Ensures occupancy rates, rent calculations, and data quality requirements are met

### Commercial Lease PDFs

**Standard Lease PDF** (`leases/sample_commercial_lease.pdf`):
- Professional multi-page commercial lease document (text-based, not image)
- Complete lease structure with 5 articles:
  - Article 1: Parties (Landlord and Tenant)
  - Article 2: Premises (with BOMA 2024 standards)
  - Article 3: Term (5-year lease, 2025-2029)
  - Article 4: Base Rent (monthly/annual with PSF calculation)
  - Article 5: Operating Expenses and Additional Rent (Critical Financial DNA section)
- All Financial DNA fields clearly documented:
  - **Base Year**: 2024 (expense stop reference year)
  - **Pro-Rata Share**: 3.12% (tenant's proportionate share)
  - **Expense Cap**: Cumulative 5% annual cap on expense increases
  - **Gross-Up Provision**: 95% occupancy target for variable expenses
  - **Administrative Fee**: 15% fee on operating expenses
- Realistic property details:
  - Property: Metroplex Office Tower, Suite 401
  - Rentable SF: 2,500 | Usable SF: 2,250 | Load Factor: 1.1111
  - Monthly Rent: $6,250.00 | Annual Rent: $75,000.00 | PSF: $30.00
- Includes Schedule A lease summary table for quick reference
- Expected values: `expected/sample_commercial_lease_expected.json`

**Expected Values JSON** (`expected/sample_commercial_lease_expected.json`):
- Complete extraction target for OCR/AI pipeline validation
- Structured sections: lease_terms, premises, rent, dates, extraction_confidence
- Used for test assertions and AI extraction accuracy measurement

**Generator** (`generators/lease_pdf_generator.py`):
- `LeaseDocumentGenerator` class using ReportLab library
- Generates professional commercial lease PDFs with custom styling
- Configurable parameters: property details, rent, Financial DNA fields
- Methods:
  - `generate_standard_lease()` - Creates sample_commercial_lease.pdf
  - `generate_expected_extraction_values()` - Creates expected values JSON
- Custom ParagraphStyle objects for professional formatting
- Multi-page document with proper sections and table layouts
- Run with: `python tests/fixtures/generators/lease_pdf_generator.py`

**Tests** (`tests/test_lease_fixtures.py`):
- 18 comprehensive validation test cases
- PDF quality tests: existence, readability, text extraction, page count
- Content validation: all articles, sections, and Financial DNA fields
- Field-specific tests for each Financial DNA element:
  - Base year documentation and value presence
  - Pro-rata share percentage validation
  - Expense cap type (cumulative) and rate (5%)
  - Gross-up target occupancy (95%)
  - Administrative fee percentage (15%)
- Additional validations:
  - Square footage (rentable and usable)
  - Rent amounts (monthly, annual, PSF)
  - Lease dates (commencement and expiration)
  - BOMA compliance mention
  - Load factor documentation
  - Summary table presence
- Expected values JSON structure validation

### Expected Calculation Outputs

**Purpose**: Hand-calculated expected results for calculation engine validation. All values verified by domain expert with formulas documented.

**Gross-Up Scenarios** (3 scenarios):
- `expected_grossup_basic.json` - 90% occupancy to 95% target
  - Gross-up factor: 0.95 / 0.90 = 1.055556
  - Variable expenses: $10,000 × 1.055556 = $10,555.56
  - Safety valve check: Within 100% occupancy cap
- `expected_grossup_high_occupancy.json` - 97% occupancy (no gross-up)
  - Factor would be 0.979, but minimum is 1.0 (never gross down)
  - Variable expenses unchanged: $10,000
- `expected_grossup_safety_valve.json` - 50% occupancy with cap
  - Gross-up factor: 1.90
  - Safety valve: Cannot exceed 100% occupancy cost ($20,000)
  - Grossed amount: $19,000 (within safety valve)

**Expense Cap Scenarios** (3 cap types, 4-year period each):
- `expected_cap_non_cumulative.json` - Each year compared to prior year only
  - Year 1: $100,000 (base)
  - Year 2: $105,000 (capped at 5% increase)
  - Year 3: $106,000 (under cap, unused $4,250 is LOST)
  - Year 4: $111,300 (capped, cannot use Year 3 unused capacity)
  - Total landlord absorbed: $5,180
- `expected_cap_cumulative.json` - Unused capacity carries forward linearly
  - Base grows linearly: Year N = Base × (1 + rate × N)
  - Year 3 banks $4,000 unused capacity
  - Year 4 uses banked capacity: All $114,480 billable
  - Final bank balance: $4,520
- `expected_cap_cumulative_compounding.json` - Base grows exponentially
  - Base grows exponentially: Year N = Base × (1.05^N)
  - Year 3 banks $4,250 unused capacity
  - Year 4: Cap is $115,762.50 (Base × 1.05³)
  - Final bank balance: $5,532.50

**Base Year Scenarios** (3 scenarios):
- `expected_base_year_standard.json` - Standard expense increase
  - Base year: $100,000
  - Current year: $115,000
  - Increase: $15,000
  - Tenant share (3.12%): $468.00
- `expected_base_year_decrease.json` - Expenses below base (zero charge)
  - Current: $95,000 (below $100,000 base)
  - No credit for decrease - tenant pays $0
  - Base year stop: Tenant never gets credit for decreases
- `expected_base_year_normalization.json` - Base year normalized for low occupancy
  - Original base: $60k variable + $40k fixed = $100k at 70% occupancy
  - Normalized: $81,428.58 variable + $40k = $121,428.58 (grossed to 95%)
  - Current year: $115,000 (below normalized base)
  - Tenant share: $0 (after zero floor)

**Full Reconciliation** (1 complete scenario):
- `expected_full_reconciliation.json` - All adjustments in sequence
  - Step 1: Raw expenses ($120k variable + $80k fixed = $200k)
  - Step 2: Gross-up (88% to 95% = $209,545.45)
  - Step 3: Cap application (within $210k cumulative cap)
  - Step 4: Base year ($9,545.45 increase over $200k base)
  - Step 5: Admin fee ($1,431.82 = 15% of increase)
  - Step 6: Pro-rata share ($342.49 = 3.12% of $10,977.27)
  - Final tenant billable: $342.49 ($0.14/sqft)

**Edge Cases** (4 scenarios):
- `expected_edge_first_year.json` - First year establishes base
  - No base year comparison available
  - Current year becomes base: $115,000
  - Tenant charge: $0 (first year)
- `expected_edge_full_occupancy.json` - 100% occupancy (no gross-up)
  - Actual occupancy: 100%
  - Gross-up factor: 1.0 (never gross down)
  - No adjustment to variable expenses
- `expected_edge_zero_prorate.json` - Configuration error
  - Pro-rata share: 0.00
  - Expected behavior: ValidationError
  - System should reject during lease creation
- `expected_edge_negative_variance.json` - Tenant overpayment (credit due)
  - Paid on estimate: $3,744
  - Actual owed: $3,432
  - Credit due to tenant: $312

**Generator** (`generators/calculation_expected_generator.py`):
- `CalculationExpectedGenerator` class
- All values hand-calculated and verified
- Each scenario includes:
  - Inputs (starting values)
  - Calculation steps with formulas
  - Expected output (final results)
  - Documentation and notes
- Run with: `python tests/fixtures/generators/calculation_expected_generator.py`
- Generates 14 JSON files total

**Tests** (`tests/test_calculation_expected.py`):
- 28 comprehensive validation test cases
- Gross-up tests (6 tests):
  - Structure validation
  - Input verification
  - Calculation accuracy (to 2 decimal places)
  - Documentation completeness
  - Safety valve verification
- Cap tests (7 tests):
  - All three cap type structures
  - Year-by-year validation
  - Banking mechanism verification
  - Linear vs exponential growth
- Base year tests (4 tests):
  - Standard increase calculation
  - Zero floor for decreases
  - Normalization for low occupancy
- Full reconciliation tests (4 tests):
  - All calculation steps present
  - Gross-up accuracy
  - Admin fee calculation
  - Final tenant amount
- Edge case tests (4 tests):
  - First year zero charge
  - Full occupancy handling
  - Error case documentation
  - Negative variance (credits)
- Completeness tests (3 tests):
  - All 14 files present
  - Valid JSON structure
  - Required fields present

### Multi-Property Fixture Set

**Purpose**: Coordinated fixture set spanning 3 properties for end-to-end reconciliation testing. All data is synchronized through a master manifest with seeded random generation for reproducibility.

**Properties** (3 total):
- `PROP001` - Parkview Office Tower (Class A Office, 100k sqft, 95% target occupancy)
  - Cap type: Cumulative (5% annual)
  - Base year: 2024
  - Tenants: 4
- `PROP002` - Metro Business Center (Class B Office, 75k sqft, 92% target occupancy)
  - Cap type: Non-cumulative (4% annual)
  - Base year: 2024
  - Tenants: 3
- `PROP003` - Harbor Industrial Park (Industrial, 200k sqft, 90% target occupancy)
  - Cap type: Cumulative-compounding (3% annual)
  - Base year: 2024
  - Tenants: 5

**Generated Files** (per property):
- GL exports: `yardi/gl_export_prop00X_2025.csv` (Yardi format)
- Rent rolls: `mri/rent_roll_prop00X.csv` (MRI format)
- Lease PDFs: `leases/lease_prop00X-tYY.pdf` (one per tenant)
- Expected extraction: `expected/lease_prop00X-tYY_expected.json` (one per tenant)
- Expected reconciliation: Embedded in manifest under each tenant

**Master Manifest** (`multi_property_manifest.json`):
- Links all files for coordinated testing
- Contains property definitions with financial terms
- Contains tenant definitions with expected reconciliation outputs
- Includes pro-rata share calculations and expense projections
- Seeded with random seed 42 for reproducibility

**Generator** (`generators/multi_property_generator.py`):
- `MultiPropertyFixtureSet` class orchestrates generation
- Uses existing generators: Yardi, MRI, LeaseDocumentGenerator
- Generates coordinated data:
  * GL exports with realistic expense transactions
  * Rent rolls with matching tenant data
  * Lease PDFs with property-specific Financial DNA
  * Expected extraction values for each lease
  * Expected reconciliation calculations for validation
- Run with: `python tests/fixtures/generators/multi_property_generator.py`
- Generates 41+ files total (3 GL + 3 RR + 12 PDFs + 12 expected + manifest)

**Tests** (`tests/test_multi_property_fixtures.py`):
- 32 comprehensive validation test cases
- Manifest structure tests (6 tests):
  * Manifest existence and structure
  * Seed verification (42)
  * Property count (3)
  * Tenant count (12)
  * Square footage totals (375,000 sqft)
- Property definition tests (4 tests):
  * Property IDs and names
  * Property classes (Class A, Class B, Industrial)
  * Occupancy rates
- Financial terms tests (5 tests):
  * All properties have complete financial terms
  * Base year consistency (2024)
  * Different cap types across properties
  * Cap rates in realistic range (3-5%)
  * Gross-up targets in realistic range (90-95%)
- File existence tests (4 tests):
  * All GL exports exist
  * All rent rolls exist
  * All lease PDFs exist (12 total)
  * All expected extraction files exist (12 total)
- Tenant data tests (4 tests):
  * All tenant IDs are unique
  * Tenant IDs follow naming convention (PROPXXX-TYY)
  * Tenant square footage in reasonable ranges
  * Tenant rents are positive
- Rent roll coordination tests (2 tests):
  * Tenant counts match between manifest and rent rolls
  * Square footage totals match
- Expected reconciliation tests (2 tests):
  * All reconciliation outputs have required structure
  * Pro-rata shares sum close to 100% per property
- Completeness tests (5 tests):
  * All subdirectories exist
  * Correct file counts in each directory

**E2E Tests** (`tests/test_multi_property_e2e.py`):
- 3 end-to-end workflow tests
- Base year calculation E2E:
  * Loads manifest for all 3 properties
  * Verifies GL exports and rent rolls exist
  * Validates tenant coordination across files
  * Verifies Financial DNA extraction consistency
  * Validates pro-rata share calculations (within 0.01%)
  * Verifies expense increase calculations
  * Validates billable amount structures
- Portfolio rollup E2E:
  * Aggregates data across all 3 properties
  * Verifies portfolio totals (12 tenants, 375k sqft)
  * Calculates total billable amounts across portfolio
- Different cap types E2E:
  * Verifies all 3 cap types are represented
  * Ensures proper cap type assignment per property

**Usage Example**:
```python
import json
from pathlib import Path

# Load manifest
manifest_path = Path("tests/fixtures/multi_property_manifest.json")
with open(manifest_path) as f:
    manifest = json.load(f)

# Iterate through properties
for prop in manifest["properties"]:
    # Get GL export path
    gl_path = Path("tests/fixtures") / prop["files"]["gl_export"]

    # Get rent roll path
    rr_path = Path("tests/fixtures") / prop["files"]["rent_roll"]

    # Process each tenant
    for tenant in prop["tenants"]:
        lease_path = Path("tests/fixtures") / tenant["lease_pdf"]
        expected_recon = tenant["expected_reconciliation"]
        # Use for test assertions
```

### Real-World Document Sets

**Purpose**: Real commercial lease documents from SEC EDGAR and GSA, with matching hand-crafted GL exports and rent rolls. These exercise the extraction and ingestion pipelines against authentic document variation.

**Location**: `real-world/`

**Client Sets** (6 total):

| Set | Property Type | Key Features |
|-----|---------------|-------------|
| `oaks-retail` | Shopping center (NNN) | 15% admin fee, formula-based pro rata, no cap |
| `research-park-office` | Single-tenant office/R&D | 100% pro rata, capital excluded, GAAP amortization |
| `generation-net-lease` | NNN standalone retail | Triple-net, REA-based sharing, 10% admin fee |
| `houston-commercial` | Multi-tenant shopping center | 5% non-cumulative cap, 63.54% pro rata, controllable vs non-controllable |
| `kissimmee-office` | Small condo office | 0% admin fee (excluded), extensive capital/other exclusions, cash basis |
| `gsa-government` | Government building | CPI escalation, federal accounting standards, capital excluded |

**Each set contains**:
- `leases/` - Real lease document (HTM from SEC EDGAR or PDF from GSA)
- `gl/` - Hand-crafted Yardi-format GL export matching lease terms
- `rent-roll/` - Hand-crafted MRI-format rent roll matching property
- `expected/` - Hand-annotated expected extraction values with confidence scores and notes
- `README.md` - Source documentation, property details, what the set tests

**Provenance**: See `real-world/MANIFEST.md` for source URLs and legal basis (all public domain).
