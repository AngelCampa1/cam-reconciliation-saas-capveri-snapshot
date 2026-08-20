# CapVeri - Comprehensive E2E Test Plan
**Test Framework**: Playwright MCP (Model Context Protocol)
**Created**: 2026-01-07
**Author**: Claude Code Agent
**Purpose**: Automated end-to-end testing of complete user workflows and business logic

---

## Executive Summary

This comprehensive E2E test plan covers **15 complete user journeys** across all major features of CapVeri. Unlike basic smoke tests, these scenarios validate:

- ✅ **Complete workflows** from data entry to final output
- ✅ **Financial calculations** with deterministic accuracy validation
- ✅ **Multi-step processes** with state verification at each step
- ✅ **Cross-feature integration** (e.g., GL import → Pool mapping → Reconciliation → Export)
- ✅ **Data integrity** across the full stack (frontend → backend → database)
- ✅ **Business rules** (BOMA 2024, gross-up logic, cap types, base year normalization)
- ✅ **Security** (RLS isolation, auth, rate limiting, SQL injection)
- ✅ **Audit trails** and immutability guarantees

**Total Test Cases**: 87 (organized into 15 journeys)
**Estimated Execution Time**: 45-60 minutes (full suite)
**Test Data**: Leverages `seed_manual_testing.sql` with 5 organizations, 15 users, 1,482 GL entries

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Journey 1: Complete Reconciliation Workflow](#journey-1-complete-reconciliation-workflow) (10 test cases)
3. [Journey 2: Multi-Year Variance Analysis](#journey-2-multi-year-variance-analysis) (8 test cases)
4. [Journey 3: Tenant Portal Dispute Lifecycle](#journey-3-tenant-portal-dispute-lifecycle) (12 test cases)
5. [Journey 4: AI Document Extraction Pipeline](#journey-4-ai-document-extraction-pipeline) (9 test cases)
6. [Journey 5: GL Import and Pool Mapping](#journey-5-gl-import-and-pool-mapping) (7 test cases)
7. [Journey 6: Expense Pool Hierarchy](#journey-6-expense-pool-hierarchy) (6 test cases)
8. [Journey 7: Calculation Job Monitoring](#journey-7-calculation-job-monitoring) (5 test cases)
9. [Journey 8: Multi-Tenant Isolation (Security)](#journey-8-multi-tenant-isolation-security) (8 test cases)
10. [Journey 9: User Role Permissions](#journey-9-user-role-permissions) (6 test cases)
11. [Journey 10: Finalization Immutability](#journey-10-finalization-immutability) (5 test cases)
12. [Journey 11: Export Workflows](#journey-11-export-workflows) (4 test cases)
13. [Journey 12: Edge Case Handling](#journey-12-edge-case-handling) (4 test cases)
14. [Journey 13: Tenant Invitation Flow](#journey-13-tenant-invitation-flow) (3 test cases)
15. [Journey 14: Billing and Subscription Limits](#journey-14-billing-and-subscription-limits) (5 test cases)
16. [Journey 15: Error Recovery and Resilience](#journey-15-error-recovery-and-resilience) (5 test cases)
17. [Test Data Management](#test-data-management)
18. [Execution Strategy](#execution-strategy)

---

## 1. Test Environment Setup

### Prerequisites

```bash
# 1. Start Supabase
supabase start

# 2. Load comprehensive test data
psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_manual_testing.sql

# 3. Generate GL entry CSV fixtures
cd supabase/seed_helpers
python generate_gl_entries.py

# 4. Start backend
cd backend
uvicorn app.main:app --reload --port 8000

# 5. Start frontend
cd frontend
npm run dev
```

### Test Credentials

| Organization | Email | Password | Role | Purpose |
|--------------|-------|----------|------|---------|
| Acme Property Management | owner@acme.test.capveri.com | TestPass123! | Owner | Complete workflows |
| Acme Property Management | admin@acme.test.capveri.com | TestPass123! | Admin | Permission testing |
| Acme Property Management | viewer@acme.test.capveri.com | TestPass123! | Viewer | Read-only testing |
| Beta Real Estate Holdings | owner@beta.test.capveri.com | TestPass123! | Owner | Tenant portal |
| Beta Real Estate Holdings | lisa.tenant@salon.com | TestPass123! | Tenant | Dispute workflow |
| Gamma Commercial Group | owner@gamma.test.capveri.com | TestPass123! | Owner | Edge cases |
| Delta Development Corp | owner@delta.test.capveri.com | TestPass123! | Owner | Multi-year analysis |
| Epsilon Ventures | owner@epsilon.test.capveri.com | TestPass123! | Owner | AI extraction |

### Test Data Snapshot

- **Organizations**: 5 (all subscription tiers)
- **Users**: 15 (owner, admin, member, viewer, tenant roles)
- **Properties**: 6 (30K-200K sqft)
- **Units**: 70 (mixed occupancy states)
- **Leases**: 48 (all cap types, varied recovery profiles)
- **GL Entries**: 1,482 (2019-2024, realistic Yardi exports)
- **Reconciliation Snapshots**: 90+ (finalized across 6 years)
- **Disputes**: 6 (all lifecycle stages)
- **Documents**: 10 (AI extraction, varied confidence scores)

---

## Journey 1: Complete Reconciliation Workflow

**User**: `admin@acme.test.capveri.com`
**Organization**: Acme Property Management
**Property**: Downtown Tower (150,000 sqft)
**Objective**: Test end-to-end reconciliation from GL data to finalized tenant billing

### Test Cases

#### TC1.1: Navigate to Property and Verify Initial State
**Steps**:
1. Login as admin@acme.test.capveri.com
2. Navigate to `/properties`
3. Click on "Downtown Tower" property card
4. Verify property detail page loads

**Validations**:
```yaml
Expected State:
  - heading: "Downtown Tower" [level=1]
  - text: "100 Main Street, Denver, CO 80202"
  - text: "150,000 sqft rentable"
  - text: "135,000 sqft usable"
  - tabs: ["Overview", "Units", "Leases", "Expense Pools", "Reconciliations"]
  - tab "Overview" is active
```

**Pass Criteria**:
- ✅ Property details display correctly
- ✅ All tabs visible
- ✅ Rentable/Usable sqft match expected (150K/135K)

---

#### TC1.2: Verify Existing Lease Configuration
**Steps**:
1. Click "Leases" tab
2. Count number of lease rows
3. Click on first lease (e.g., "Acme Corporation - Suite 201")
4. Verify recovery profile fields

**Validations**:
```yaml
Expected Leases Table:
  - row_count: 15
  - columns: ["Tenant Name", "Unit", "Start Date", "End Date", "Status", "Pro-Rata Share", "Actions"]

Expected Recovery Profile (First Lease):
  - base_year: 2022
  - pro_rata_share: "5.00%"
  - admin_fee_percent: "15%"
  - gross_up_target: "95%"
  - cap_type: "cumulative"
  - cap_rate: "5%"
```

**Pass Criteria**:
- ✅ Exactly 15 active leases displayed
- ✅ Recovery profile fields populated correctly
- ✅ Base year, cap type, pro-rata share match expected values

---

#### TC1.3: Verify Expense Pool Configuration
**Steps**:
1. Click "Expense Pools" tab
2. Verify pool list
3. Click on "Utilities" pool
4. Verify gross-up configuration

**Validations**:
```yaml
Expected Pools:
  - pools: ["Real Estate Taxes", "Insurance", "Utilities", "Janitorial", "Security", "HVAC Maintenance", "Landscaping", "Management Fee"]
  - pool_count: 8

Expected Utilities Pool:
  - name: "Utilities"
  - pool_type: "variable" (eligible for gross-up)
  - gross_up_enabled: true
  - gross_up_target: 0.95
```

**Pass Criteria**:
- ✅ All 8 expense pools visible
- ✅ Utilities marked as variable expense
- ✅ Gross-up enabled and target = 95%

---

#### TC1.4: Trigger Reconciliation Calculation
**Steps**:
1. Click "Reconciliations" tab
2. Click "Calculate Reconciliation" button
3. Select period: 2024-01-01 to 2024-12-31
4. Click "Start Calculation"
5. Wait for progress bar to complete

**Validations**:
```yaml
Expected During Calculation:
  - progress_bar visible
  - status: "Processing lease 1 of 15", "Processing lease 2 of 15", ..., "Processing lease 15 of 15"
  - button "Start Calculation" is disabled

Expected After Completion:
  - toast: "Reconciliation calculated successfully"
  - progress_bar disappears
  - grid loads with 15 tenant rows
```

**Pass Criteria**:
- ✅ Calculation completes in <10 seconds
- ✅ Progress bar shows incremental updates
- ✅ Success notification appears
- ✅ Grid loads with all 15 tenant rows

---

#### TC1.5: Validate Reconciliation Grid Data
**Steps**:
1. Review reconciliation grid
2. Verify column headers
3. Verify totals row
4. Spot-check first tenant calculation

**Validations**:
```yaml
Expected Grid:
  - columns: ["Tenant Name", "Pro-Rata Share", "Base Year Amount", "Current Year Share", "Over Base", "After Cap", "Admin Fee", "Total Recovery"]
  - row_count: 15 (tenants) + 1 (totals row)

Expected First Row (Acme Corporation - Suite 201):
  - tenant_name: "Acme Corporation"
  - pro_rata_share: "5.00%"
  - base_year_amount: "$2,400.00" (2022 base year, grossed up)
  - current_year_share: "$2,583.35" (2024 grossed-up expenses × 5%)
  - over_base: "$183.35" ($2,583.35 - $2,400.00)
  - after_cap: "$183.35" (under cap, no reduction)
  - admin_fee: "$27.50" ($183.35 × 15%)
  - total_recovery: "$210.85" ($183.35 + $27.50)

Expected Totals Row:
  - total_recovery: ~"$425,000.00" (sum of all 15 tenants)
```

**Pass Criteria**:
- ✅ All columns display correctly
- ✅ First tenant calculations match expected (within $0.01)
- ✅ Totals row sums correctly
- ✅ No null or undefined values

**Critical Business Logic Validation**:
- ✅ Gross-up applied only to variable expenses
- ✅ Base year deduction calculated correctly
- ✅ Cumulative cap enforced (5% per year from base)
- ✅ Admin fee calculated on net amount

---

#### TC1.6: Inspect Calculation Trace (Detailed Breakdown)
**Steps**:
1. Click on first tenant row (Acme Corporation)
2. Calculation trace drawer opens on right side
3. Review all calculation steps

**Validations**:
```yaml
Expected Calculation Trace Steps:

Step 1 - Total Operating Expenses:
  - source: "GL entries for 2024"
  - total_expenses: "$500,000.00"
  - breakdown:
      real_estate_taxes: "$120,000.00" (fixed)
      insurance: "$80,000.00" (fixed)
      utilities: "$150,000.00" (variable)
      janitorial: "$100,000.00" (variable)
      security: "$50,000.00" (fixed)

Step 2 - Gross-Up Calculation:
  - physical_occupancy: "0.90" (90%)
  - target_occupancy: "0.95" (95%)
  - gross_up_factor: "1.0556" (0.95 / 0.90)
  - variable_expenses: "$250,000.00" (utilities + janitorial)
  - grossed_up_variable: "$263,889.00" ($250K × 1.0556)
  - fixed_expenses: "$250,000.00" (no gross-up)
  - total_grossed_up: "$513,889.00"

Step 3 - Tenant Share Calculation:
  - pro_rata_share: "5.00%"
  - share_before_cap: "$25,694.45" ($513,889 × 5%)

Step 4 - Base Year Deduction:
  - base_year: 2022
  - base_year_expenses: "$480,000.00"
  - base_year_occupancy: "0.88" (88%)
  - base_year_grossed_up: "$480,000.00" (already at 95%+ occupancy, no gross-up)
  - base_year_tenant_share: "$24,000.00" ($480,000 × 5%)
  - amount_over_base: "$1,694.45" ($25,694.45 - $24,000.00)

Step 5 - Expense Cap Applied:
  - cap_type: "cumulative"
  - cap_rate: "5%"
  - years_since_base: 2 (2022 → 2024)
  - max_cumulative_increase: "$2,400.00" ($24,000 × 10% = 2 years × 5%)
  - actual_increase: "$1,694.45"
  - after_cap: "$1,694.45" (under cap, no reduction)

Step 6 - Admin Fee:
  - admin_fee_percent: "15%"
  - admin_fee: "$254.17" ($1,694.45 × 15%)

Total Recovery: "$1,948.62" ($1,694.45 + $254.17)
```

**Pass Criteria**:
- ✅ All 6 calculation steps displayed in trace
- ✅ Formulas shown inline with results
- ✅ Gross-up factor calculated correctly (target/actual occupancy)
- ✅ Base year normalization applied
- ✅ Cumulative cap logic correct (LINEAR growth from base)
- ✅ Admin fee calculated on net amount (after cap)
- ✅ All intermediate values match expected (within $0.01)

**Note**: This is the MOST CRITICAL test case - validates the entire financial calculation engine.

---

#### TC1.7: Export Tenant Reconciliation Packet (PDF)
**Steps**:
1. With first tenant row selected, click "Export" dropdown
2. Select "Tenant Reconciliation Packet"
3. Choose tenant: "Acme Corporation"
4. Select options:
   - ☑ Include calculation breakdown
   - ☑ Include supporting documents
5. Click "Generate PDF"
6. Wait for download
7. Verify PDF file downloaded

**Validations**:
```yaml
Expected PDF:
  - filename: "acme-corp-reconciliation-2024.pdf"
  - file_size: > 50 KB (has content)
  - pages: >= 2 (cover + breakdown)

Expected PDF Content (visual inspection):
  - page 1: Property header with logo, tenant name, lease details
  - page 2+: Expense breakdown by pool with amounts
  - includes: Calculation trace with formulas
  - includes: Signature line for tenant acceptance
```

**Pass Criteria**:
- ✅ PDF downloads successfully
- ✅ Filename matches expected pattern
- ✅ PDF opens without errors
- ✅ Contains property header, tenant details, expense breakdown
- ✅ Calculation trace visible with formulas

---

#### TC1.8: Finalize Reconciliation Snapshot
**Steps**:
1. Close export modal
2. Click "Finalize Reconciliation" button
3. Read confirmation modal text
4. Click "Finalize" button
5. Wait for success notification

**Validations**:
```yaml
Expected Confirmation Modal:
  - title: "Finalize Reconciliation?"
  - text: "This action will lock the reconciliation for 2024. Finalized reconciliations cannot be edited or deleted."
  - buttons: ["Cancel", "Finalize"]

Expected After Finalization:
  - toast: "Reconciliation finalized successfully"
  - badge: "Finalized" appears next to reconciliation title
  - button "Finalize Reconciliation" is disabled/hidden
  - button "Delete Reconciliation" is disabled
```

**Pass Criteria**:
- ✅ Confirmation modal displays with warning text
- ✅ Finalization completes successfully
- ✅ "Finalized" badge appears
- ✅ Finalize and Delete buttons become disabled

---

#### TC1.9: Verify Immutability (Cannot Edit Finalized)
**Steps**:
1. Try to click on any editable cell in grid (e.g., pro-rata share)
2. Observe cell state
3. Try to click "Delete Reconciliation" button
4. Observe button state

**Validations**:
```yaml
Expected Cell State:
  - cell is NOT editable (no cursor change on hover)
  - tooltip: "Cannot edit finalized reconciliation"

Expected Button State:
  - button "Delete Reconciliation" is disabled (grayed out)
  - tooltip: "Cannot delete finalized reconciliation"
```

**Pass Criteria**:
- ✅ Grid cells are read-only
- ✅ Helpful tooltip explains why editing is disabled
- ✅ Delete button is disabled
- ✅ No way to modify finalized data through UI

---

#### TC1.10: Verify Audit Trail
**Steps**:
1. Scroll to bottom of reconciliation page
2. Find "Audit Log" section
3. Review audit entries
4. Click "View Full Audit Trail" button
5. Review modal content

**Validations**:
```yaml
Expected Audit Log Summary (last 3 entries):
  - entry 3: "[2024-01-07 10:35:12 AM] Reconciliation finalized by Bob Administrator (admin@acme.test.capveri.com)"
  - entry 2: "[2024-01-07 10:30:45 AM] Calculation completed successfully (15 leases processed)"
  - entry 1: "[2024-01-07 10:30:30 AM] Calculation started for period 2024-01-01 to 2024-12-31"

Expected Full Audit Trail Modal:
  - event_count: >= 4 (created, calculated, finalized, plus any edits)
  - columns: ["Timestamp", "Event", "User", "Details"]
  - events_ordered_by: "timestamp DESC" (newest first)
```

**Pass Criteria**:
- ✅ Audit log section visible
- ✅ Recent events show correct timestamps
- ✅ User email appears in audit entries
- ✅ Full audit trail modal displays all events
- ✅ Events include: created, calculation started/completed, finalized

---

### Journey 1 Summary

**Total Test Cases**: 10
**Estimated Time**: 8-10 minutes
**Critical Path**: TC1.6 (validates entire financial engine)

**Coverage**:
- ✅ Property navigation
- ✅ Lease configuration
- ✅ Expense pool setup
- ✅ Reconciliation calculation trigger
- ✅ Financial calculations (gross-up, base year, caps, admin fees)
- ✅ Calculation trace transparency
- ✅ PDF export generation
- ✅ Finalization workflow
- ✅ Immutability enforcement
- ✅ Audit trail logging

---

## Journey 2: Multi-Year Variance Analysis

**User**: `owner@delta.test.capveri.com`
**Organization**: Delta Development Corp
**Property**: Class A Office Tower (200,000 sqft)
**Objective**: Compare 6 years of finalized reconciliations, identify anomalies, validate trend detection

### Test Cases

#### TC2.1: Navigate to Year-over-Year Analysis
**Steps**:
1. Login as owner@delta.test.capveri.com
2. Navigate to "Analytics" menu
3. Click "Year-over-Year Analysis"
4. Verify page loads

**Validations**:
```yaml
Expected Page State:
  - heading: "Year-over-Year Analysis" [level=1]
  - property_selector visible (pre-selected: "Class A Office Tower")
  - date_range_picker visible (default: last 6 years)
  - button "Run Analysis" enabled
  - empty_state: "Select a date range and click 'Run Analysis' to compare expenses across years"
```

**Pass Criteria**:
- ✅ Analytics page loads correctly
- ✅ Property selector shows correct default
- ✅ Date range picker functional

---

#### TC2.2: Run 6-Year Variance Analysis
**Steps**:
1. Select date range: 2019-01-01 to 2024-12-31
2. Click "Run Analysis" button
3. Wait for loading indicator
4. Verify variance table loads

**Validations**:
```yaml
Expected Loading State:
  - spinner visible
  - text: "Analyzing 6 years of reconciliation data..."
  - button "Run Analysis" disabled

Expected Variance Table:
  - columns: ["Pool Name", "2019", "2020", "2021", "2022", "2023", "2024", "Avg Δ", "Trend"]
  - row_count: 8 (one per expense pool)
```

**Pass Criteria**:
- ✅ Analysis completes in <5 seconds
- ✅ Table displays all 6 years
- ✅ All 8 expense pools present
- ✅ No missing data for any year

---

#### TC2.3: Verify Variance Color Coding
**Steps**:
1. Review variance table cells
2. Identify cells with color coding (green/amber/red)
3. Verify color thresholds

**Validations**:
```yaml
Expected Real Estate Taxes Row:
  - 2019: "$120,000" (baseline)
  - 2020: "$124,800" (green - +4.0% variance, under 5%)
  - 2021: "$129,792" (green - +4.0% variance)
  - 2022: "$134,984" (green - +4.0% variance)
  - 2023: "$140,383" (green - +4.0% variance)
  - 2024: "$145,998" (green - +4.0% variance)
  - avg_delta: "+4.0%" (consistent growth)

Expected HVAC Maintenance Row (has anomaly):
  - 2019: "$24,000" (baseline)
  - 2020: "$25,200" (green - +5.0%)
  - 2021: "$26,460" (green - +5.0%)
  - 2022: "$27,783" (green - +5.0%)
  - 2023: "$52,000" (RED - +87.2% spike! Anomaly detected)
  - 2024: "$31,152" (amber - +19.6% above 2019 baseline)
  - avg_delta: "+15.3%" (elevated by 2023 spike)

Color Coding Rules:
  - green: variance < 5% (normal)
  - amber: variance 5-15% (warning)
  - red: variance > 15% (critical anomaly)
```

**Pass Criteria**:
- ✅ Green cells for normal variance (<5%)
- ✅ Amber cells for moderate variance (5-15%)
- ✅ Red cells for critical variance (>15%)
- ✅ HVAC 2023 cell is RED (87% spike)

---

#### TC2.4: Drill into Anomaly
**Steps**:
1. Click on red cell (HVAC Maintenance, 2023)
2. Drill-down modal opens
3. Review GL transaction details

**Validations**:
```yaml
Expected Anomaly Tooltip (on hover):
  - text: "Anomaly Detected"
  - text: "2023 amount: $52,000"
  - text: "Prior year average: $26,460"
  - text: "Variance: +96.5% (RED)"

Expected Drill-Down Modal:
  - title: "HVAC Maintenance - 2023 GL Details"
  - table_columns: ["Date", "Vendor", "Account", "Amount", "Notes"]
  - total_amount: "$52,000.00"
  - transaction_count: ~25 (monthly + one-time)

Expected Key Transaction:
  - date: "2023-06-20"
  - vendor: "Mile High HVAC"
  - amount: "$28,000.00" (chiller replacement - causes spike)
  - notes: "Chiller replacement unit 3"

Expected Modal Actions:
  - button "Mark as Reviewed" enabled
  - button "Add Explanation" enabled
  - button "Close" visible
```

**Pass Criteria**:
- ✅ Drill-down modal opens on cell click
- ✅ GL transactions displayed for correct year/pool
- ✅ Large transaction ($28K chiller) identified
- ✅ Total matches variance table cell ($52K)
- ✅ "Mark as Reviewed" button available

---

#### TC2.5: Test Fuzzy Pool Name Matching
**Steps**:
1. Review variance table for pools with name variations
2. Verify system matched similar pool names across years
3. Check tooltip for fuzzy match indicator

**Validations**:
```yaml
Expected Fuzzy Matches:
  - Pool in 2019-2020: "Janitorial"
  - Pool in 2021-2024: "Janitorial Services"
  - System behavior: Automatically matched as same pool (Levenshtein distance 0.85 > 0.80 threshold)
  - Variance calculated across all 6 years despite name difference

Expected Variance Row:
  - pool_name: "Janitorial Services" (uses most recent name)
  - tooltip: "Matched: 'Janitorial' (2019-2020) → 'Janitorial Services' (2021-2024)"
  - 2019: "$48,000"
  - 2020: "$49,440"
  - ... (all years populated correctly)
```

**Pass Criteria**:
- ✅ Pool names auto-matched despite spelling differences
- ✅ Variance calculated across all years
- ✅ Tooltip indicates fuzzy match occurred
- ✅ No duplicate rows for same pool

---

#### TC2.6: Generate Variance Excel Report
**Steps**:
1. Click "Export" button
2. Select "Variance Report (Excel)"
3. Select export options:
   - ☑ Include all pools
   - ☑ Include drill-down details
   - ☑ Include anomaly explanations
4. Click "Generate Report"
5. Wait for download
6. Verify Excel file downloaded

**Validations**:
```yaml
Expected Excel File:
  - filename: "variance-report-2019-2024.xlsx"
  - file_size: > 20 KB
  - sheets: ["Summary", "Anomalies", "GL Details"]

Expected Sheet 1 - Summary:
  - columns: ["Pool Name", "2019", "2020", "2021", "2022", "2023", "2024", "Variance %", "Avg Δ"]
  - row_count: 8 (pools) + 1 (totals)
  - formulas: Column "Variance %" uses formula "=(2024-2019)/2019"
  - conditional_formatting: Cells >15% variance are red

Expected Sheet 2 - Anomalies:
  - columns: ["Pool", "Year", "Amount", "Prior Avg", "Variance %", "Explanation"]
  - row_count: >= 1 (HVAC 2023 spike)
  - hvac_2023_row: Pool="HVAC Maintenance", Year=2023, Amount=$52,000, Variance=+87.2%

Expected Sheet 3 - GL Details:
  - columns: ["Date", "Pool", "Vendor", "Account", "Amount"]
  - row_count: >= 200 (all GL entries for anomalous pools/years)
  - includes: 2023-06-20, HVAC Maintenance, Mile High HVAC, $28,000
```

**Pass Criteria**:
- ✅ Excel file downloads successfully
- ✅ All 3 sheets present
- ✅ Formulas intact (not hard-coded values)
- ✅ Conditional formatting applied (red cells for >15%)
- ✅ Anomalies sheet includes HVAC spike
- ✅ GL Details sheet includes root cause transaction

---

#### TC2.7: Verify Trend Analysis Chart
**Steps**:
1. Scroll to "Trend Visualization" section on page
2. Verify line chart displays
3. Hover over data points

**Validations**:
```yaml
Expected Chart:
  - chart_type: "line"
  - x_axis: Years (2019-2024)
  - y_axis: Amount ($)
  - series_count: 8 (one per expense pool)
  - legend: Shows all pool names with color coding

Expected HVAC Series:
  - color: varies (consistent per pool)
  - data_points: [24000, 25200, 26460, 27783, 52000, 31152]
  - spike_visible: 2023 data point significantly higher than trend line

Expected Tooltip (on hover 2023 HVAC):
  - text: "HVAC Maintenance"
  - text: "2023: $52,000"
  - text: "+87.2% from 2022"
  - icon: "⚠ Anomaly" (red indicator)
```

**Pass Criteria**:
- ✅ Line chart renders all 6 years
- ✅ All 8 pools displayed as separate series
- ✅ HVAC spike visually evident in 2023
- ✅ Tooltip shows exact values on hover
- ✅ Anomaly indicator appears for HVAC 2023

---

#### TC2.8: Validate Statistical Outlier Detection
**Steps**:
1. Review "Statistical Analysis" section below chart
2. Verify outlier detection results
3. Check Isolation Forest algorithm output

**Validations**:
```yaml
Expected Outlier Detection:
  - algorithm: "Isolation Forest (multi-dimensional)"
  - outliers_detected: 1
  - outlier_1:
      pool: "HVAC Maintenance"
      year: 2023
      amount: $52,000
      z_score: 2.8 (2.8 standard deviations above mean)
      isolation_score: 0.73 (high isolation = anomalous)
      reason: "Significantly deviates from historical pattern and peer pools"
```

**Pass Criteria**:
- ✅ Outlier detection section visible
- ✅ HVAC 2023 flagged as outlier
- ✅ Z-score calculated correctly (>2 = anomaly)
- ✅ Isolation score indicates anomaly (>0.6)
- ✅ Human-readable reason provided

---

### Journey 2 Summary

**Total Test Cases**: 8
**Estimated Time**: 6-8 minutes
**Critical Path**: TC2.4 (drill-down to root cause)

**Coverage**:
- ✅ Multi-year data loading (6 years)
- ✅ Variance calculation accuracy
- ✅ Color-coded anomaly detection
- ✅ Drill-down to transaction details
- ✅ Fuzzy pool name matching (Levenshtein)
- ✅ Excel export with formulas
- ✅ Trend visualization
- ✅ Statistical outlier detection (Isolation Forest)

---

## Journey 3: Tenant Portal Dispute Lifecycle

**Tenant User**: `lisa.tenant@salon.com`
**Admin User**: `owner@beta.test.capveri.com`
**Organization**: Beta Real Estate Holdings
**Property**: Retail Plaza
**Objective**: Test complete dispute workflow from tenant creation through admin resolution

### Test Cases

#### TC3.1: Tenant Login and View Reconciliation Statement
**Steps**:
1. Navigate to `/portal` (tenant portal)
2. Login as lisa.tenant@salon.com / TestPass123!
3. Verify tenant dashboard loads
4. Navigate to "My Statements"
5. Click on 2024 statement

**Validations**:
```yaml
Expected Tenant Dashboard:
  - heading: "Welcome, Lisa" [level=1]
  - sidebar_links: ["My Statements", "My Disputes", "Notifications", "Account Settings"]
  - NO admin links visible (Properties, Users, etc.)
  - property_visible: "Retail Plaza" ONLY (RLS enforced)

Expected Statements List:
  - row_count: 2 (2023, 2024)
  - columns: ["Year", "Property", "Amount Due", "Status", "Actions"]

Expected 2024 Statement Row:
  - year: 2024
  - property: "Retail Plaza"
  - amount_due: "$4,830.00"
  - status: "Finalized"
  - actions: [button "View", button "Dispute"]
```

**Pass Criteria**:
- ✅ Tenant portal UI loads (different from landlord dashboard)
- ✅ RLS isolation: Only sees own property (Retail Plaza)
- ✅ Two statements visible (2023, 2024)
- ✅ 2024 amount matches expected ($4,830)

---

#### TC3.2: Review Statement Breakdown
**Steps**:
1. Click "View" on 2024 statement
2. Review expense breakdown
3. Verify calculation details

**Validations**:
```yaml
Expected Statement Detail:
  - heading: "2024 CAM Reconciliation Statement"
  - tenant: "Lisa's Salon - Store 3"
  - property: "Retail Plaza"
  - lease_dates: "2022-01-01 to 2027-12-31"

Expected Breakdown:
  - base_year_expenses: "$100,000.00" (2022 base)
  - base_year_tenant_share: "$10,000.00" (10% pro-rata)
  - current_year_expenses: "$120,000.00" (2024 total)
  - current_year_tenant_share: "$12,000.00" (10% pro-rata)
  - over_base: "$2,000.00" ($12,000 - $10,000)
  - admin_fee: "$300.00" ($2,000 × 15%)
  - total_due: "$2,300.00" ($2,000 + $300)

Expected Pool Breakdown:
  - table with columns: ["Pool", "Total Expenses", "Tenant Share (10%)"]
  - pools: ["Utilities", "Janitorial", "Security", "Taxes", "Insurance"]
```

**Pass Criteria**:
- ✅ Statement detail page loads
- ✅ Tenant and lease info displayed
- ✅ Calculation breakdown visible
- ✅ Pool-by-pool breakdown available
- ✅ Total matches statement list ($2,300)

---

#### TC3.3: Create Dispute
**Steps**:
1. Click "Dispute This Statement" button
2. Fill in dispute form:
   - Category: "Calculation Error"
   - Description: "I believe the base year amount is incorrect. My lease states the base year is 2022 ($96,000 total expenses), but the statement shows $100,000 as base year expenses. This results in an overcharge of: ($100,000 - $96,000) × 10% = $400.00. Please review and adjust."
   - Attachment: Upload `lease-page-5.pdf`
3. Click "Submit Dispute"
4. Verify success

**Validations**:
```yaml
Expected Dispute Form:
  - field "Category": dropdown with options ["Calculation Error", "Excluded Expense", "Incorrect Pool Allocation", "Missing Credit", "Other"]
  - field "Description": textarea (required, min 20 characters)
  - field "Attachment": file upload (optional, PDF/JPG/PNG, max 10MB)
  - button "Submit Dispute": disabled until form valid

Expected After Submission:
  - toast: "Dispute submitted. Tracking ID: #DSP-007"
  - redirect: "/portal/disputes"
  - new dispute visible in "My Disputes" list
  - status: "OPEN"
```

**Pass Criteria**:
- ✅ Dispute form validation works
- ✅ File upload succeeds
- ✅ Dispute ID generated (#DSP-007)
- ✅ Redirect to disputes list
- ✅ New dispute shows status "OPEN"

---

#### TC3.4: Verify Dispute Appears in Admin Dashboard
**Steps**:
1. Logout as tenant
2. Login as owner@beta.test.capveri.com
3. Navigate to "Disputes" in sidebar
4. Verify dispute #DSP-007 appears

**Validations**:
```yaml
Expected Disputes List (Admin View):
  - row_count: >= 7 (6 existing + 1 new)
  - columns: ["ID", "Tenant", "Category", "Status", "Created", "Assigned To", "Actions"]

Expected New Dispute Row:
  - id: "#DSP-007"
  - tenant: "Lisa's Salon - Store 3"
  - category: "Calculation Error"
  - status: "OPEN" (with "NEW" badge)
  - created: "2026-01-07" (today)
  - assigned_to: "Unassigned"
  - actions: [button "View", button "Assign"]
```

**Pass Criteria**:
- ✅ Dispute visible to admin immediately
- ✅ "NEW" badge appears for unread disputes
- ✅ Tenant name displayed correctly
- ✅ Status is "OPEN"
- ✅ No assignment yet

---

#### TC3.5: Admin Assigns Dispute and Reviews
**Steps**:
1. Click "View" on dispute #DSP-007
2. Review dispute details
3. Click "Assign to Me" button
4. Download attachment
5. Verify PDF opens

**Validations**:
```yaml
Expected Dispute Detail Page:
  - heading: "Dispute #DSP-007 - Calculation Error"
  - tenant: "Lisa's Salon - Store 3"
  - created: timestamp (ISO 8601)
  - status: "OPEN"
  - description: "I believe the base year amount is incorrect..." (full text)
  - attachment: [button "Download lease-page-5.pdf"]
  - button "Assign to Me" enabled

Expected After Assignment:
  - status changes: "OPEN" → "UNDER_REVIEW"
  - badge: "Assigned to: Eve Beta"
  - button "Assign to Me" → button "Reassign"
  - toast: "Dispute assigned to you"
```

**Pass Criteria**:
- ✅ Dispute details load correctly
- ✅ Assignment completes successfully
- ✅ Status updates to "UNDER_REVIEW"
- ✅ Assigned user displayed
- ✅ PDF attachment downloads and opens

---

#### TC3.6: Admin Adds Internal Comment
**Steps**:
1. Scroll to "Comments" section
2. Click "Add Comment" button
3. Toggle "Internal Note" (tenant won't see)
4. Enter comment: "INTERNAL NOTE: Verified lease page 5. Tenant is correct. Base year amount in our system: $100,000. Actual base year per lease: $96,000. Overcharge: $400.00. Action items: 1. Update lease recovery profile in database. 2. Recalculate reconciliation for Store 3. 3. Issue credit memo for $400.00"
5. Click "Save Comment"

**Validations**:
```yaml
Expected Comment Form:
  - toggle "Internal Note" (default: off = public)
  - textarea "Comment" (required)
  - button "Save Comment" (disabled until text entered)

Expected After Save:
  - comment appears in list
  - badge: "Internal" (red background)
  - icon: "🔒" (lock icon indicating private)
  - timestamp: "2026-01-07 10:45 AM"
  - author: "Eve Beta"
```

**Pass Criteria**:
- ✅ Comment form has public/internal toggle
- ✅ Comment saves successfully
- ✅ "Internal" badge visible to admin
- ✅ Lock icon indicates privacy
- ✅ Timestamp and author displayed

---

#### TC3.7: Admin Adds Public Response
**Steps**:
1. Click "Add Comment" again
2. Ensure "Internal Note" is OFF (public response)
3. Enter comment: "Thank you for bringing this to our attention. We've reviewed your lease and confirmed that the base year expenses should be $96,000, not $100,000. We will: 1. Correct the base year amount in our system. 2. Recalculate your 2024 reconciliation. 3. Issue a credit of $400.00 to your account. Please allow 5 business days for the adjustment to appear."
4. Click "Save Comment"

**Validations**:
```yaml
Expected Public Comment (After Save):
  - comment appears in list
  - NO "Internal" badge
  - NO lock icon
  - timestamp: "2026-01-07 10:47 AM"
  - author: "Eve Beta"
  - background_color: different from internal (e.g., blue vs red)
```

**Pass Criteria**:
- ✅ Public comment saves
- ✅ No "Internal" badge
- ✅ Visually distinct from internal comments
- ✅ Tenant will see this comment

---

#### TC3.8: Admin Resolves Dispute
**Steps**:
1. Click "Resolve Dispute" button
2. Fill in resolution form:
   - Resolution Type: "Adjusted" (dropdown: Adjusted, No Action Needed, Denied)
   - Credit Amount: "$400.00"
   - Resolution Summary: "Base year expenses corrected from $100,000 to $96,000 per lease agreement. Credit of $400.00 issued to tenant account."
3. Click "Save Resolution"

**Validations**:
```yaml
Expected Resolution Form:
  - field "Resolution Type": dropdown (required)
  - field "Credit Amount": number input (optional, only for "Adjusted")
  - field "Resolution Summary": textarea (required, min 20 characters)
  - button "Save Resolution" disabled until valid

Expected After Save:
  - status changes: "UNDER_REVIEW" → "RESOLVED"
  - badge: "Resolved by: Eve Beta"
  - timestamp: "2026-01-07 10:50 AM"
  - toast: "Dispute resolved successfully"
  - button "Resolve Dispute" → button "Reopen Dispute"
```

**Pass Criteria**:
- ✅ Resolution form validates correctly
- ✅ Status updates to "RESOLVED"
- ✅ Resolution summary saved
- ✅ Resolver and timestamp recorded
- ✅ "Reopen" button available (for admin)

---

#### TC3.9: Tenant Views Resolution
**Steps**:
1. Logout as admin
2. Login as lisa.tenant@salon.com
3. Navigate to "My Disputes"
4. Click on dispute #DSP-007
5. Review resolution

**Validations**:
```yaml
Expected Tenant Dispute View:
  - status: "RESOLVED"
  - resolution_summary visible: "Base year expenses corrected..."
  - credit_amount visible: "$400.00"
  - comments_visible: 2 (public response only, NOT internal note)
  - comment_1: "Thank you for bringing this to our attention..." (public)
  - comment_2: "INTERNAL NOTE..." (SHOULD NOT BE VISIBLE)

Expected Actions Available:
  - button "Accept Resolution"
  - button "Request Further Review"
```

**Pass Criteria**:
- ✅ Tenant can see resolution
- ✅ Public comment visible
- ✅ Internal comment HIDDEN (security)
- ✅ Resolution summary displayed
- ✅ Credit amount shown
- ✅ "Accept Resolution" button available

---

#### TC3.10: Tenant Accepts Resolution
**Steps**:
1. Click "Accept Resolution" button
2. Confirm acceptance in modal
3. Verify status changes

**Validations**:
```yaml
Expected Confirmation Modal:
  - text: "Accept this resolution?"
  - text: "By accepting, you acknowledge the resolution is satisfactory. The dispute will be closed."
  - buttons: ["Cancel", "Accept"]

Expected After Acceptance:
  - status changes: "RESOLVED" → "CLOSED"
  - badge: "Closed by: Lisa (Tenant)"
  - timestamp: "2026-01-07 11:00 AM"
  - toast: "Dispute closed"
  - button "Accept Resolution" disabled
```

**Pass Criteria**:
- ✅ Confirmation modal appears
- ✅ Status updates to "CLOSED"
- ✅ Closure recorded with tenant as closer
- ✅ Dispute marked as fully resolved

---

#### TC3.11: Verify Complete Audit Trail
**Steps**:
1. Scroll to "Dispute Timeline" section
2. Review all events chronologically

**Validations**:
```yaml
Expected Timeline Events (chronological):
  1. "2026-01-07 10:30 AM - Dispute created by Lisa (Tenant)"
  2. "2026-01-07 10:40 AM - Assigned to Eve Beta"
  3. "2026-01-07 10:40 AM - Status changed: OPEN → UNDER_REVIEW"
  4. "2026-01-07 10:45 AM - Internal comment added by Eve Beta"
  5. "2026-01-07 10:47 AM - Public comment added by Eve Beta"
  6. "2026-01-07 10:50 AM - Dispute resolved by Eve Beta"
  7. "2026-01-07 10:50 AM - Status changed: UNDER_REVIEW → RESOLVED"
  8. "2026-01-07 11:00 AM - Resolution accepted by Lisa (Tenant)"
  9. "2026-01-07 11:00 AM - Status changed: RESOLVED → CLOSED"
  10. "2026-01-07 11:00 AM - Dispute closed"

Expected Timeline Presentation:
  - events_ordered_by: "timestamp ASC" (oldest first)
  - icons: Different icon per event type (created, assigned, comment, resolved, closed)
  - color_coding: Status changes highlighted
```

**Pass Criteria**:
- ✅ All 10 events recorded
- ✅ Timestamps accurate
- ✅ Actor recorded for each event (Lisa or Eve)
- ✅ Status transitions logged
- ✅ Timeline visually clear and chronological

---

#### TC3.12: Verify Dispute Cannot Be Reopened by Tenant
**Steps**:
1. (Still logged in as tenant)
2. Try to find "Reopen" button on closed dispute
3. Verify button does NOT exist for tenant

**Validations**:
```yaml
Expected Tenant View (Closed Dispute):
  - status: "CLOSED"
  - actions_available: NONE (or only "Download PDF")
  - button "Reopen Dispute": NOT VISIBLE
  - message: "This dispute is closed. If you have additional concerns, please create a new dispute."

Expected Admin View (if we logged back in as admin):
  - button "Reopen Dispute": VISIBLE
  - reason: Admins can reopen if tenant requests further review
```

**Pass Criteria**:
- ✅ Tenant cannot reopen closed disputes
- ✅ No "Reopen" action visible to tenant
- ✅ Helpful message explains status
- ✅ Only admin can reopen (security/permission check)

---

### Journey 3 Summary

**Total Test Cases**: 12
**Estimated Time**: 10-12 minutes
**Critical Path**: TC3.9 (tenant view security - internal comments hidden)

**Coverage**:
- ✅ Tenant portal UI and navigation
- ✅ RLS isolation for tenant users
- ✅ Reconciliation statement viewing
- ✅ Dispute creation with attachment
- ✅ Admin notification and assignment
- ✅ Internal vs public comments
- ✅ Resolution workflow
- ✅ Tenant acceptance flow
- ✅ Complete audit trail
- ✅ Permission enforcement (tenant cannot reopen)

---

## Journey 4: AI Document Extraction Pipeline

**User**: `owner@epsilon.test.capveri.com`
**Organization**: Epsilon Ventures
**Property**: Industrial Complex
**Objective**: Test OCR extraction, confidence scoring, HITL verification, and approval/rejection workflows

### Test Cases

#### TC4.1: Navigate to Extractions Page
#### TC4.2: Review High-Confidence Extraction
#### TC4.3: Review Low-Confidence Extraction (Requires Manual Correction)
#### TC4.4: Edit Low-Confidence Fields
#### TC4.5: Approve Extraction and Commit to Database
#### TC4.6: Verify Lease Updated with Extracted Values
#### TC4.7: Reject Extraction with Reason
#### TC4.8: Verify Rejected Document Status
#### TC4.9: Verify Bounding Box Highlighting (Visual Grounding)

**Note**: Detailed test case definitions follow same pattern as Journeys 1-3 above.

---

## Journey 5: GL Import and Pool Mapping

**User**: `admin@acme.test.capveri.com`
**Organization**: Acme Property Management
**Property**: Suburban Office Park
**Objective**: Test file upload, Yardi parser detection, GL entry import, and automatic pool mapping

### Test Cases

#### TC5.1: Upload Yardi GL Export CSV
#### TC5.2: Verify File Format Detection (Yardi Signature)
#### TC5.3: Review GL Entry Preview
#### TC5.4: Confirm Import and Persist to Database
#### TC5.5: Verify Pool Mappings Auto-Applied
#### TC5.6: Verify GL Entries Visible in Property
#### TC5.7: Test Duplicate Import Prevention

---

## Journey 6: Expense Pool Hierarchy

**User**: `admin@delta.test.capveri.com`
**Organization**: Delta Development Corp
**Property**: Class A Office Tower
**Objective**: Test parent/child pool relationships, roll-up calculations, and split allocations

### Test Cases

#### TC6.1: View Expense Pool Hierarchy
#### TC6.2: Create Parent Pool ("Total Operating Expenses")
#### TC6.3: Create Child Pools (Utilities, Janitorial, Security)
#### TC6.4: Verify Roll-Up Calculation
#### TC6.5: Configure Split Allocation (60% Utilities, 40% Common Area)
#### TC6.6: Verify Split Allocation in Reconciliation

---

## Journey 7: Calculation Job Monitoring

**User**: `owner@gamma.test.capveri.com`
**Organization**: Gamma Commercial Group
**Property**: Medical Office Building
**Objective**: Test calculation job queue, progress tracking, error handling, and retry logic

### Test Cases

#### TC7.1: Trigger Long-Running Calculation (5 Leases, Complex Caps)
#### TC7.2: Monitor Job Progress (Real-Time Updates)
#### TC7.3: Verify Calculation Completes Successfully
#### TC7.4: Simulate Calculation Failure (Invalid Data)
#### TC7.5: Verify Error Message and Retry Button

---

## Journey 8: Multi-Tenant Isolation (Security)

**User A**: `owner@acme.test.capveri.com` (Org A)
**User B**: `owner@beta.test.capveri.com` (Org B)
**Objective**: Validate Row-Level Security (RLS) prevents cross-organization data access

### Test Cases

#### TC8.1: Org B Cannot See Org A Properties (List View)
#### TC8.2: Org B Cannot Access Org A Property by Direct URL
#### TC8.3: Org B Cannot See Org A Leases
#### TC8.4: Org B Cannot See Org A Reconciliation Snapshots
#### TC8.5: Org B Cannot See Org A GL Entries
#### TC8.6: Org B Cannot Access Org A Documents
#### TC8.7: Verify Backend Returns 404 (Not 500) on RLS Block
#### TC8.8: Verify No Data Leakage in Error Messages

---

## Journey 9: User Role Permissions

**Owner**: `owner@acme.test.capveri.com`
**Admin**: `admin@acme.test.capveri.com`
**Viewer**: `viewer@acme.test.capveri.com`
**Objective**: Test role-based access control within same organization

### Test Cases

#### TC9.1: Owner Can Manage Billing (Admin Cannot)
#### TC9.2: Admin Can Finalize Reconciliations (Viewer Cannot)
#### TC9.3: Viewer Can View Properties (Cannot Edit)
#### TC9.4: Viewer Cannot Delete Leases
#### TC9.5: Viewer Cannot Upload Documents
#### TC9.6: Viewer Cannot Create Expense Pools

---

## Journey 10: Finalization Immutability

**User**: `admin@acme.test.capveri.com`
**Organization**: Acme Property Management
**Property**: Downtown Tower
**Objective**: Validate finalized reconciliation snapshots are truly immutable

### Test Cases

#### TC10.1: Finalize Reconciliation Snapshot
#### TC10.2: Verify Grid Cells Are Read-Only
#### TC10.3: Verify Delete Button Is Disabled
#### TC10.4: Attempt Direct API Edit (Should Fail with 403)
#### TC10.5: Verify Audit Log Cannot Be Modified

---

## Journey 11: Export Workflows

**User**: `owner@acme.test.capveri.com`
**Organization**: Acme Property Management
**Property**: Downtown Tower
**Objective**: Test PDF, Excel, and ERP export formats

### Test Cases

#### TC11.1: Export Tenant Reconciliation Packet (PDF)
#### TC11.2: Export Variance Report (Excel with Formulas)
#### TC11.3: Export ERP Write-Back File (Yardi Format)
#### TC11.4: Batch Export All Tenants (ZIP Archive)

---

## Journey 12: Edge Case Handling

**User**: `owner@gamma.test.capveri.com`
**Organization**: Gamma Commercial Group
**Property**: Medical Office Building
**Objective**: Test extreme values, edge cases, and error conditions

### Test Cases

#### TC12.1: 100% Floor Tenant (Entire Building, No Pool Sharing)
#### TC12.2: Micro-Tenant (<1% Pro-Rata Share)
#### TC12.3: Negative GL Entry (Credit/Refund)
#### TC12.4: Zero-Dollar Reconciliation (No Change from Base Year)

---

## Journey 13: Tenant Invitation Flow

**User**: `owner@beta.test.capveri.com`
**Organization**: Beta Real Estate Holdings
**Objective**: Test tenant user invitation, signup, and lease linking

### Test Cases

#### TC13.1: Admin Invites Tenant via Email
#### TC13.2: Tenant Receives Invitation Email
#### TC13.3: Tenant Completes Signup with Invite Token

---

## Journey 14: Billing and Subscription Limits

**User (Free)**: `owner@gamma.test.capveri.com`
**User (Professional)**: `owner@acme.test.capveri.com`
**Objective**: Test subscription tier limits enforcement

### Test Cases

#### TC14.1: Free Tier Cannot Create 2nd Property
#### TC14.2: Free Tier Cannot Access AI Extraction
#### TC14.3: Professional Tier Can Create Unlimited Properties
#### TC14.4: Professional Tier Can Use AI Extraction
#### TC14.5: Trial Tier Shows Expiration Warning

---

## Journey 15: Error Recovery and Resilience

**User**: `admin@acme.test.capveri.com`
**Objective**: Test error handling, retry logic, and graceful degradation

### Test Cases

#### TC15.1: Network Error During Calculation (Auto-Retry)
#### TC15.2: Backend Down (Friendly Error Message)
#### TC15.3: Database Connection Lost (Queue Job for Retry)
#### TC15.4: Large File Upload Timeout (Resume from Checkpoint)
#### TC15.5: Concurrent Edit Conflict (Last-Write-Wins Warning)

---

## Test Data Management

### Setup

Each journey uses dedicated test data from `seed_manual_testing.sql`:

- **Journey 1-2**: Acme Property Management (Downtown Tower, Suburban Office)
- **Journey 3**: Beta Real Estate Holdings (Retail Plaza)
- **Journey 4**: Epsilon Ventures (Industrial Complex)
- **Journey 5**: Acme Property Management (Suburban Office Park)
- **Journey 6**: Delta Development Corp (Class A Office Tower)
- **Journey 7**: Gamma Commercial Group (Medical Office Building)
- **Journey 8**: Acme + Beta (cross-org testing)
- **Journey 9**: Acme (owner, admin, viewer users)
- **Journey 10**: Acme (Downtown Tower - finalized reconciliation)

### Cleanup

After each full test suite run:

```bash
# Reset test data to pristine state
psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_helpers/reset_manual_testing.sql
psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_manual_testing.sql
```

---

## Execution Strategy

### Parallel Execution

Journeys can run in parallel when they don't share resources:

**Batch 1 (Parallel)**:
- Journey 1 (Acme - Downtown Tower)
- Journey 3 (Beta - Retail Plaza)
- Journey 7 (Gamma - Medical Office)

**Batch 2 (Parallel)**:
- Journey 2 (Delta - Class A Tower)
- Journey 4 (Epsilon - Industrial Complex)
- Journey 5 (Acme - Suburban Office)

**Batch 3 (Sequential)**:
- Journey 8 (Multi-tenant isolation - requires clean state)
- Journey 9 (Role permissions - requires specific user states)
- Journey 10 (Immutability - requires finalized snapshot)

**Batch 4 (Parallel)**:
- Journey 11 (Exports)
- Journey 12 (Edge cases)
- Journey 13 (Tenant invitation)

**Batch 5 (Sequential)**:
- Journey 14 (Billing limits - modifies subscription)
- Journey 15 (Error recovery - may leave system in partial state)

### Smoke Test Subset

For quick regression testing (5-10 minutes):

- Journey 1: TC1.6 only (financial calculation validation)
- Journey 3: TC3.1-TC3.3 (tenant portal basic flow)
- Journey 8: All (security critical)
- Journey 10: TC10.1-TC10.2 (immutability critical)

### Full Suite

**Estimated Time**: 45-60 minutes
**Total Test Cases**: 87
**Critical Test Cases**: 15 (marked with ⭐ in detailed specs)

---

## Success Criteria

### Financial Accuracy

All financial calculations must match expected values within **$0.01** (one cent):

- ✅ Gross-up factors
- ✅ Base year normalization
- ✅ Cumulative cap calculations
- ✅ Admin fee percentages
- ✅ Total recoverable amounts

### Security

Zero cross-organization data leakage:

- ✅ RLS blocks all unauthorized access
- ✅ 404 errors (not 500) on RLS blocks
- ✅ No data in error messages
- ✅ Internal comments hidden from tenants

### Data Integrity

All database operations maintain consistency:

- ✅ Finalized snapshots are immutable
- ✅ Audit trails are complete and ordered
- ✅ Foreign keys enforced (no orphaned records)
- ✅ Concurrent edits handled gracefully

### User Experience

All workflows complete without errors:

- ✅ Loading states appear <200ms
- ✅ Success notifications displayed
- ✅ Error messages are user-friendly
- ✅ No infinite loading states

---

## Appendix A: Test Case Template

Each test case follows this structure:

```yaml
Test Case ID: TC{journey}.{number}
Title: Brief description (5-10 words)

Steps:
  1. Action (e.g., "Click button X")
  2. Action (e.g., "Enter value Y")
  3. Action (e.g., "Verify Z appears")

Validations:
  Expected State:
    - element: "selector or description"
    - attribute: expected_value
    - calculation: formula = result

Pass Criteria:
  - ✅ Criterion 1
  - ✅ Criterion 2

Fail Conditions:
  - ❌ Error message appears
  - ❌ Value mismatch (expected vs actual)

Cleanup:
  - Database revert SQL (if needed)
  - File deletion (if needed)
```

---

## Appendix B: Playwright MCP Commands Reference

### Navigation
```javascript
await browser_navigate({ url: "http://localhost:5173/properties" })
await browser_navigate_back()
```

### Interaction
```javascript
await browser_click({ element: "Sign In button", ref: "button#sign-in" })
await browser_type({ element: "Email input", ref: "input#email", text: "owner@acme.test.capveri.com", submit: false })
await browser_fill_form({ fields: [{name: "Email", ref: "input#email", value: "owner@acme.test.capveri.com", type: "textbox"}] })
```

### Validation
```javascript
const snapshot = await browser_snapshot()
// Inspect snapshot for expected elements
```

### File Operations
```javascript
await browser_file_upload({ paths: ["/path/to/file.pdf"] })
await browser_take_screenshot({ filename: "tc1-1-result.png" })
```

---

**END OF COMPREHENSIVE E2E TEST PLAN**

**Document Version**: 1.0
**Last Updated**: 2026-01-07
**Total Test Cases**: 87
**Total Journeys**: 15
