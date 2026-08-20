# CapVeri - Manual Testing Data Guide

## Table of Contents

1. [Overview](#overview)
2. [Loading Test Data](#loading-test-data)
3. [Test User Credentials](#test-user-credentials)
4. [Organization Details](#organization-details)
5. [Test Scenarios](#test-scenarios)
6. [Data Relationships](#data-relationships)
7. [Reset & Reload](#reset--reload)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### Purpose

This guide provides comprehensive test data for manual testing of **ALL CapVeri features**. The data is designed to cover:

- ✅ Complete reconciliation workflows
- ✅ Multi-year variance analysis
- ✅ Tenant portal and dispute management
- ✅ AI document extraction and HITL verification
- ✅ GL import and pool mapping
- ✅ Pool hierarchy and roll-ups
- ✅ Calculation job monitoring
- ✅ User role permissions
- ✅ Billing and subscriptions
- ✅ Export workflows
- ✅ Edge case handling

### Comprehensive Seed Data (Merged into seed.sql)

**As of January 2026**, the development and manual testing seed data have been **merged into a single `seed.sql` file**. Running `supabase db reset` now automatically loads all test data.

| Data Type | Count | Description |
|-----------|-------|-------------|
| **Organizations** | 6 | Demo Company + 5 test orgs (Acme, Beta, Gamma, Delta, Epsilon) |
| **Users** | 17 | 2 Demo + 15 test users (all roles + tenants) |
| **Properties** | 8 | 2 Demo + 6 test properties |
| **GL Entries** | 90-1,482 | Representative data (expandable with CSV fixtures) |
| **Reconciliations** | 24+ | Draft and finalized snapshots |
| **Tenant Portal** | 4 tenants | 6 disputes covering complete lifecycle |
| **Documents** | 10 | AI extraction testing |
| **Multi-Year Data** | Yes | 6 years (2019-2024) for Delta property |
| **Load Time** | ~15-20 seconds | Comprehensive test data included |

### Simplified Workflow

**Old workflow (deprecated):**
```bash
# Step 1: Reset with basic data
supabase db reset

# Step 2: Manually load manual testing data
psql ... < seed_manual_testing.sql
```

**New workflow (current):**
```bash
# Single command loads everything
supabase db reset
```

---

## Loading Test Data

### Prerequisites

1. ✅ **Supabase CLI installed** (`brew install supabase/tap/supabase` or `npm install -g supabase`)
2. ✅ **Local Supabase running** (`supabase start`)
3. ✅ **Optional: GL CSV fixtures generated** for extended GL entries (see below)

### Simple Loading Instructions

**All test data now loads automatically with a single command:**

```bash
supabase db reset
```

This command:
1. Resets the database to a clean state
2. Applies all migrations
3. Loads `seed.sql` which includes both Demo Company and comprehensive test data
4. Takes ~15-20 seconds to complete

**Expected Output:**
```
Reset database on localhost...
Applying migration 20240101000001_create_organizations.sql...
Applying migration 20240101000002_create_users.sql...
...
Loading seed data from supabase/seed.sql...

NOTICE: ====================================================================
NOTICE: CapVeri Development Seed data loaded successfully!
NOTICE: ====================================================================
NOTICE: Login credentials:
NOTICE:   - admin@democompany.com / password
NOTICE:   - owner@acme.example.com / TestPass123!
NOTICE:   - owner@beta.example.com / TestPass123!
...
```

### Optional: Generate Extended GL Entry Fixtures

The seed data includes representative GL entries. For testing with the full 1,482 GL entries, generate CSV fixtures:

```bash
cd supabase/seed_helpers
python generate_gl_entries.py
```

**Note:** This step is optional. The seed data works without generating CSV files, but with reduced GL entry count.

### Verify Data Loaded Successfully

```bash
# Run verification query
psql -U postgres -h 127.0.0.1 -p 54322 -d postgres -c"
SELECT
  (SELECT COUNT(*) FROM organizations) as total_orgs,
  (SELECT COUNT(*) FROM auth.users) as total_auth_users,
  (SELECT COUNT(*) FROM users) as total_user_profiles,
  (SELECT COUNT(*) FROM properties) as properties,
  (SELECT COUNT(*) FROM leases) as leases,
  (SELECT COUNT(*) FROM reconciliation_snapshots) as snapshots,
  (SELECT COUNT(*) FROM disputes) as disputes;"
```

**Expected Output:**
```
 total_orgs | total_auth_users | total_user_profiles | properties | leases | snapshots | disputes
------------+------------------+---------------------+------------+--------+-----------+----------
          6 |               17 |                  17 |          8 |     53 |        24 |        6
```

**Breakdown:**
- **6 organizations**: 1 Demo Company + 5 test orgs (Acme, Beta, Gamma, Delta, Epsilon)
- **17 users**: 2 Demo + 15 test users (including 4 tenant portal users)
- **8 properties**: 2 Demo + 6 test properties
- **53 leases**: 5 Demo + 48 test leases
- **24 snapshots**: Representative reconciliation data
- **6 disputes**: Complete lifecycle coverage

---

## Test User Credentials

### All Users Password: `TestPass123!`

| Organization | Email | Role | Purpose | Key Features |
|--------------|-------|------|---------|--------------|
| **Acme Property Management** | owner@acme.example.com | Owner | Full system access | Complete reconciliation workflow, exports, finalization |
| | admin@acme.example.com | Admin | Cannot manage billing | GL import, pool mapping, calculation triggers |
| | member@acme.example.com | Member | Standard access | View/edit leases, run reports |
| | viewer@acme.example.com | Viewer | Read-only | View-only permissions testing |
| **Beta Real Estate Holdings** | owner@beta.example.com | Owner | Tenant portal admin | Dispute management, tenant invitations |
| | member@beta.example.com | Member | Dispute handling | Respond to disputes, internal comments |
| | sarah.tenant@retailstore.com | Tenant | Multi-lease tenant | Linked to 3 retail leases |
| | mike.tenant@coffeeshop.com | Tenant | Single lease tenant | Coffee shop lease only |
| | lisa.tenant@salon.com | Tenant | Active disputes | 2 active disputes filed |
| | david.tenant@gym.com | Tenant | Recently invited | New tenant signup flow |
| **Gamma Commercial Group** | owner@gamma.example.com | Owner | Edge case testing | Micro-tenants, 100% floor tenants, free tier limits |
| **Delta Development Corp** | owner@delta.example.com | Owner | Multi-year analysis | 6 years of data (2019-2024) |
| | admin@delta.example.com | Admin | Pool hierarchy | Parent/child expense pools |
| **Epsilon Ventures** | owner@epsilon.example.com | Owner | AI extraction | Document upload, OCR testing |
| | member@epsilon.example.com | Member | Document review | HITL verification, approval/rejection |

### Quick Login Test

To verify credentials work:

1. Navigate to `http://localhost:5173` (frontend dev server)
2. Click "Login"
3. Enter any email from the table above
4. Password: `TestPass123!`
5. You should see the dashboard for that organization

---

## Organization Details

### Organization 1: Acme Property Management

**Purpose:** Complete system testing - End-to-end reconciliation workflows

**Subscription:**
- Plan: Professional
- Status: Active (paid)
- Features: AI extraction, multi-property, API access

**Properties:**
1. **Downtown Tower**
   - Address: 100 Main Street, Denver, CO 80202
   - Size: 150,000 sqft rentable, 135,000 sqft usable
   - Units: 25 (floors 2-26)
   - Occupancy: ~85%
   - GL Entries: 285 (2022-2024)
   - Leases: 15 active
   - Reconciliations: 20 finalized (2022-2024)

2. **Suburban Office Park**
   - Address: 5000 Tech Center Drive, Denver, CO 80237
   - Size: 75,000 sqft rentable, 68,000 sqft usable
   - Units: 15 suites
   - Occupancy: ~80%
   - GL Entries: 285 (2022-2024)
   - Leases: 10 active
   - Reconciliations: 15 finalized

**Test Scenarios:**
- ✅ Complete reconciliation workflow (Scenario 1)
- ✅ GL import and auto-mapping (Scenario 5)
- ✅ Finalization immutability (Scenario 11)
- ✅ Export workflows (Scenario 14)

---

### Organization 2: Beta Real Estate Holdings

**Purpose:** Tenant portal testing - Disputes, notifications, tenant access

**Subscription:**
- Plan: Starter
- Status: Trialing (expires 2025-12-31)
- Features: AI extraction, single property limit

**Properties:**
1. **Retail Plaza**
   - Address: 2500 Shopping Center Road, Boulder, CO 80301
   - Size: 50,000 sqft rentable, 45,000 sqft usable
   - Units: 10 retail stores
   - Occupancy: ~90%
   - GL Entries: 190 (2023-2024)
   - Leases: 8 active (multi-tenant retail)
   - Tenant Users: 4 (sarah, mike, lisa, david)
   - Disputes: 6 (all lifecycle stages)

**Tenant Users & Leases:**
- **Sarah (sarah.tenant@retailstore.com)**: Linked to Stores 1, 4, 7 (multi-lease tenant)
- **Mike (mike.tenant@coffeeshop.com)**: Linked to Store 2 (single lease)
- **Lisa (lisa.tenant@salon.com)**: Linked to Store 3, has 2 active disputes
- **David (david.tenant@gym.com)**: Linked to Store 5, recently invited

**Disputes:**
1. Dispute #1: OPEN - Just submitted by Lisa
2. Dispute #2: UNDER_REVIEW - Admin assigned, 3 comments
3. Dispute #3: UNDER_REVIEW - Tenant responded, attachment uploaded
4. Dispute #4: RESOLVED - Resolution summary provided
5. Dispute #5: REJECTED - Denied with detailed reason
6. Dispute #6: CLOSED - Final closure with audit trail

**Test Scenarios:**
- ✅ Tenant portal dispute flow (Scenario 3)
- ✅ Tenant invitation flow (Scenario 9)
- ✅ Dispute resolution lifecycle (Scenario 15)

---

### Organization 3: Gamma Commercial Group

**Purpose:** Edge case testing - Extreme values, calculation limits

**Subscription:**
- Plan: Free
- Status: Active
- Usage: 95% of free tier limits (1 property)
- Features: No AI extraction

**Properties:**
1. **Medical Office Building**
   - Address: 123 Healthcare Drive, Aurora, CO 80012
   - Size: 30,000 sqft rentable, 27,000 sqft usable
   - Units: 5 suites (all occupied)
   - Occupancy: 100%
   - GL Entries: 190 (2023-2024, includes outliers)
   - Leases: 5 with extreme cases:
     - Suite 100: 100% floor tenant (entire floor)
     - Suite 200: Micro-tenant (<1% pro-rata share)
     - Suite 300: High caps (10% cumulative compounding)
     - Suite 400: Excluded pools (no CAM recovery)
     - Suite 500: Zero cap (unlimited)

**Edge Cases in GL Data:**
- Negative amounts (credits/refunds): 5% of entries
- Bulk transactions ($50K+): 2% of entries
- Zero-amount adjustments: 1% of entries
- Duplicate vendor names

**Test Scenarios:**
- ✅ Edge case GL handling (Scenario 10)
- ✅ Calculation job monitoring (Scenario 7)

---

### Organization 4: Delta Development Corp

**Purpose:** Multi-year analysis - Trend detection, variance reports

**Subscription:**
- Plan: Professional
- Status: Active
- Features: AI extraction, multi-property, advanced analytics

**Properties:**
1. **Class A Office Tower**
   - Address: 1000 Corporate Plaza, Denver, CO 80202
   - Size: 200,000 sqft rentable, 180,000 sqft usable
   - Units: 10 large suites (15K-20K sqft each)
   - Occupancy: 100%
   - GL Entries: 437 (2019-2024 - **6 years** for trend analysis)
   - Leases: 10 active
   - Reconciliations: 60 finalized (10 leases × 6 years)

**Expense Pool Hierarchy:**
```
Total Operating Expenses (parent)
├── Utilities (child)
├── Janitorial (child)
└── Security (child)
```

**Split Allocations:**
- Utilities pool splits 60% to main pool, 40% to common area pool

**Test Scenarios:**
- ✅ Multi-year variance analysis (Scenario 2)
- ✅ Pool hierarchy and roll-ups (Scenario 6)

---

### Organization 5: Epsilon Ventures

**Purpose:** AI extraction testing - Document upload, OCR, HITL verification

**Subscription:**
- Plan: Starter
- Status: Active
- Features: AI extraction enabled

**Properties:**
1. **Industrial Complex**
   - Address: 789 Warehouse Way, Commerce City, CO 80022
   - Size: 100,000 sqft rentable, 95,000 sqft usable
   - Units: 5 large industrial bays (18K-22K sqft each)
   - Occupancy: ~80%
   - GL Entries: 95 (2023-2024)
   - Leases: 6 active
   - Documents: 10 in various states

**Documents for AI Extraction Testing:**
1. Doc #1: READY_FOR_REVIEW - High confidence (>0.90) on all fields
2. Doc #2: READY_FOR_REVIEW - Medium confidence (0.75-0.90) on base_year
3. Doc #3: READY_FOR_REVIEW - Low confidence (<0.75) on cap_rate - **triggers HITL**
4. Doc #4: READY_FOR_REVIEW - Mixed confidence, bounding boxes available
5. Doc #5: APPROVED - Successfully verified and committed
6. Doc #6: APPROVED - Edited before approval
7. Doc #7: REJECTED - Incorrect base year, needs re-upload
8. Doc #8: REJECTED - Low confidence across multiple fields
9. Doc #9: PENDING - Processing (OCR in progress)
10. Doc #10: FAILED - OCR extraction error

**Test Scenarios:**
- ✅ AI document extraction (Scenario 4)
- ✅ Document rejection flow (Scenario 8)

---

## Test Scenarios

### Scenario 1: Complete Reconciliation Workflow

**User:** `admin@acme.example.com` / `TestPass123!`
**Organization:** Acme Property Management
**Property:** Downtown Tower

**Objective:** Verify end-to-end reconciliation calculation, review, and finalization.

**Prerequisites:**
- ✅ GL entries loaded for 2024 (285 entries)
- ✅ 15 active leases with recovery profiles
- ✅ Expense pools configured with mappings

**Steps:**

1. **Login**
   - Navigate to `http://localhost:5173`
   - Enter credentials: `admin@acme.example.com` / `TestPass123!`
   - Click "Sign In"
   - ✅ Verify: Dashboard loads showing "Acme Property Management"

2. **Navigate to Property**
   - Click "Properties" in sidebar
   - Find "Downtown Tower" card
   - Click on property card
   - ✅ Verify: Property detail page loads with 25 units listed

3. **Trigger Reconciliation**
   - Click "Reconciliations" tab
   - Click "Calculate Reconciliation" button
   - Select period: 2024-01-01 to 2024-12-31
   - Click "Start Calculation"
   - ✅ Verify: Calculation job starts, progress bar appears

4. **Monitor Calculation Progress**
   - Observe progress bar: "Processing lease 5 of 15"
   - Wait for completion (should complete in 5-10 seconds)
   - ✅ Verify: Success message appears: "Reconciliation calculated successfully"

5. **Review Reconciliation Grid**
   - Grid loads with 15 tenant rows
   - Columns visible: Tenant Name, Pro-Rata Share, Billable Amount, Admin Fee, Total Recovery
   - Scroll through all rows
   - ✅ Verify: All 15 rows have calculated values
   - ✅ Verify: Totals row shows sum of all recoveries

6. **Inspect Calculation Trace (Sample Tenant)**
   - Click on first tenant row (e.g., "Acme Corporation")
   - Calculation trace drawer opens on right side
   - Review calculation steps:
     ```
     Step 1: Total Operating Expenses
       Source: GL entries for 2024
       Amount: $50,000.00

     Step 2: Gross-Up Calculation
       Physical Occupancy: 0.90 (90%)
       Target Occupancy: 0.95 (95%)
       Gross-Up Factor: 1.0556 (0.95 / 0.90)
       Variable Expenses: $30,000.00
       Grossed-Up Variable: $31,667.00
       Fixed Expenses: $20,000.00 (no gross-up)
       Total Grossed-Up: $51,667.00

     Step 3: Tenant Share Calculation
       Pro-Rata Share: 5.00%
       Share Before Cap: $2,583.35 ($51,667 × 5%)

     Step 4: Base Year Deduction
       Base Year: 2022
       Base Year Amount: $48,000.00 (grossed up to 95%)
       Base Year Tenant Share: $2,400.00 ($48,000 × 5%)
       Amount Over Base: $183.35 ($2,583.35 - $2,400.00)

     Step 5: Expense Cap Applied
       Cap Type: Cumulative (5% annual)
       Years Since Base: 2 (2022 → 2024)
       Max Cumulative Increase: $240.00 ($2,400 × 10%)
       Actual Increase: $183.35
       After Cap: $183.35 (under cap, no reduction)

     Step 6: Admin Fee
       Admin Fee Percentage: 15%
       Admin Fee: $27.50 ($183.35 × 15%)

     Total Recovery: $210.85 ($183.35 + $27.50)
     ```
   - ✅ Verify: All calculation steps display correct values
   - ✅ Verify: Formulas are shown inline with results

7. **Export Tenant Reconciliation Packet (PDF)**
   - With tenant row still selected, click "Export" dropdown
   - Select "Tenant Reconciliation Packet"
   - Choose tenant: "Acme Corporation"
   - Options modal appears
   - Select: ☑ Include calculation breakdown, ☑ Include supporting docs
   - Click "Generate PDF"
   - ✅ Verify: PDF downloads with filename: `acme-corp-reconciliation-2024.pdf`
   - Open PDF
   - ✅ Verify PDF contains:
     - Property header with logo
     - Tenant name and lease details
     - Expense breakdown by pool
     - Calculation trace with formulas
     - Signature line for tenant

8. **Finalize Reconciliation Snapshot**
   - Close export modal
   - Click "Finalize Reconciliation" button
   - Confirmation modal appears:
     ```
     Finalize Reconciliation?

     This action will lock the reconciliation for 2024. Finalized
     reconciliations cannot be edited or deleted.

     [Cancel] [Finalize]
     ```
   - Click "Finalize"
   - ✅ Verify: Success message: "Reconciliation finalized successfully"
   - ✅ Verify: Page refreshes, "Finalized" badge appears next to title
   - ✅ Verify: "Finalize" button is now disabled/hidden

9. **Verify Immutability**
   - Try to edit any tenant's pro-rata share
   - Click on editable cell in grid
   - ✅ Verify: Input is disabled
   - ✅ Verify: Tooltip appears: "Cannot edit finalized reconciliation"
   - Try to click "Delete Reconciliation" button
   - ✅ Verify: Button is disabled
   - ✅ Verify: Tooltip: "Cannot delete finalized reconciliation"

10. **View Audit Trail**
    - Scroll to bottom of page
    - "Audit Log" section visible
    - ✅ Verify entry:
      ```
      [2024-01-07 10:30:45 AM] Reconciliation finalized by Bob Administrator (admin@acme.example.com)
      ```
    - Click "View Full Audit Trail"
    - Modal shows all events:
      - Reconciliation created
      - Calculation started
      - Calculation completed
      - Reconciliation finalized
    - ✅ Verify: Each event has timestamp and user

**Expected Results:**
- ✅ 15 tenant shares calculated successfully
- ✅ Total recoverable amount: ~$425,000 (sum of all tenant shares)
- ✅ Gross-up applied only to variable expenses (utilities, janitorial)
- ✅ Base year deductions applied to 3 leases with base_year set
- ✅ Caps enforced on 3 leases (cumulative, non-cumulative, compounding)
- ✅ Admin fees calculated at varying rates (10%, 12%, 15%)
- ✅ Calculation traces show detailed step-by-step breakdown with formulas
- ✅ PDF export includes property header, tenant breakdown, supporting docs
- ✅ Finalized snapshot becomes read-only in database and UI
- ✅ Audit log records finalization event with user ID and timestamp

**Common Issues:**

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Grid not loading | GL entries missing | Verify GL CSVs were loaded |
| Calculation fails | Missing recovery profile | Check all leases have `recovery_profile` JSONB |
| Wrong totals | Pool mappings incorrect | Review `pool_mappings` table for GL account codes |
| PDF missing logo | Logo not uploaded | Upload logo in Organization Settings |
| Finalize fails | User lacks permissions | Ensure user has `admin` or `owner` role |

---

### Scenario 2: Multi-Year Variance Analysis

**User:** `owner@delta.example.com` / `TestPass123!`
**Organization:** Delta Development Corp
**Property:** Class A Office Tower

**Objective:** Compare year-over-year expenses, identify anomalies, test variance detection.

**Prerequisites:**
- ✅ 6 years of finalized reconciliations (2019-2024)
- ✅ 10 leases with consistent recovery profiles
- ✅ GL entries with realistic variance (±15%)

**Steps:**

1. **Login and Navigate to Analytics**
   - Login as `owner@delta.example.com`
   - Navigate to "Analytics" → "Year-over-Year Analysis"
   - ✅ Verify: Page loads with "Class A Office Tower" selected

2. **Select Comparison Period**
   - Date range picker: 2019-01-01 to 2024-12-31
   - Click "Run Analysis"
   - ✅ Verify: Loading indicator appears

3. **Review Variance Table**
   - Table loads with expense pools as rows, years as columns
   - Example row:
     ```
     Pool Name          | 2019     | 2020     | 2021     | 2022     | 2023     | 2024     | Avg Δ
     -------------------|----------|----------|----------|----------|----------|----------|-------
     Real Estate Taxes  | $120,000 | $124,800 | $129,792 | $134,984 | $140,383 | $145,998 | +4.0%
     Utilities          | $84,000  | $88,200  | $86,400  | $90,720  | $95,256  | $49,869  | +3.5%
     Janitorial         | $48,000  | $49,440  | $50,923  | $52,451  | $54,025  | $55,646  | +3.0%
     ⚠ HVAC Maintenance | $24,000  | $25,200  | $26,460  | $27,783  | $52,000  | $31,152  | +5.3%
     ```
   - ✅ Verify: Color coding:
     - Green: <5% variance (normal)
     - Amber: 5-15% variance (warning)
     - Red: >15% variance (critical anomaly)

4. **Identify Anomalies**
   - Row "HVAC Maintenance" shows red badge on 2023 column
   - Hover over red cell
   - Tooltip appears:
     ```
     Anomaly Detected
     2023 amount: $52,000
     Prior year average: $26,460
     Variance: +96.5% (RED)
     ```
   - ✅ Verify: Tooltip shows variance calculation

5. **Drill into Anomaly**
   - Click red cell in HVAC Maintenance / 2023
   - Drill-down modal opens
   - Shows GL entries for HVAC Maintenance in 2023:
     ```
     Date       | Vendor              | Amount    | Notes
     -----------|---------------------|-----------|----------------------
     2023-01-15 | Mile High HVAC      | $2,100.00 | Monthly maintenance
     2023-02-15 | Mile High HVAC      | $2,100.00 | Monthly maintenance
     ...
     2023-06-20 | Mile High HVAC      | $28,000.00| Chiller replacement
     ...
     2023-12-15 | Mile High HVAC      | $2,100.00 | Monthly maintenance
     ```
   - ✅ Verify: Large $28K transaction identified as cause of spike
   - ✅ Verify: Modal has "Mark as Reviewed" button

6. **Test Fuzzy Pool Name Matching**
   - Notice some pools have slightly different names across years:
     - 2019: "Janitorial"
     - 2020-2024: "Janitorial Services"
   - ✅ Verify: System automatically matches these as same pool
   - ✅ Verify: Variance calculated across all years despite name difference
   - How it works: Levenshtein distance with 80% threshold

7. **Generate Variance Excel Report**
   - Click "Export" button
   - Select "Variance Report (Excel)"
   - Options:
     - ☑ Include all pools
     - ☑ Include drill-down details
     - ☑ Include anomaly explanations
   - Click "Generate Report"
   - ✅ Verify: Excel file downloads: `variance-report-2019-2024.xlsx`

8. **Review Excel Report**
   - Open downloaded file
   - ✅ Verify sheets:
     - Sheet 1: "Summary" - Variance table
     - Sheet 2: "Anomalies" - Flagged variances with drill-down
     - Sheet 3: "GL Details" - Raw GL entries for anomalies
   - ✅ Verify formulas:
     - Column "Variance %" uses formula: `=(2024-2023)/2023`
     - Conditional formatting highlights >15% red

**Expected Results:**
- ✅ 6 years of data displayed in variance table
- ✅ Color-coded variance indicators (green/amber/red)
- ✅ Anomalies correctly identified (>15% variance)
- ✅ Drill-down shows specific GL transactions causing spikes
- ✅ Fuzzy matching successfully groups "Janitorial" vs "Janitorial Services"
- ✅ Excel export includes all sheets with formulas intact
- ✅ Average delta calculated correctly across all years

**Common Issues:**

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Years missing | Snapshots not finalized | Check `reconciliation_snapshots` for `is_finalized=true` |
| Fuzzy match fails | Names too different | Verify Levenshtein ratio >0.80 |
| Export incomplete | Large dataset | Increase timeout for Excel generation |

---

### Scenario 3: Tenant Portal Dispute Flow

**User:** `lisa.tenant@salon.com` / `TestPass123!` (Tenant)
**Admin User:** `owner@beta.example.com` / `TestPass123!`
**Organization:** Beta Real Estate Holdings
**Property:** Retail Plaza

**Objective:** Test complete tenant dispute lifecycle from creation to resolution.

**Prerequisites:**
- ✅ Tenant user linked to Store 3 lease
- ✅ Finalized reconciliation for 2024
- ✅ Dispute categories configured

**Steps (Part 1: Tenant Creates Dispute):**

1. **Tenant Login**
   - Navigate to `http://localhost:5173/portal` (tenant portal)
   - Login as `lisa.tenant@salon.com` / `TestPass123!`
   - ✅ Verify: Tenant dashboard loads (different UI from landlord dashboard)
   - ✅ Verify: Only shows Store 3 lease (RLS enforced)

2. **View Reconciliation Statement**
   - Click "My Statements" in sidebar
   - See list of reconciliation statements:
     ```
     Year | Property      | Amount Due | Status   | Actions
     -----|---------------|------------|----------|----------
     2024 | Retail Plaza  | $12,450.00 | Finalized| [View] [Dispute]
     2023 | Retail Plaza  | $11,800.00 | Finalized| [View]
     ```
   - Click "View" on 2024 statement
   - ✅ Verify: Detailed breakdown shows:
     - Base Year Amount: $10,000
     - Current Year Total: $52,000
     - Tenant Share (10%): $5,200
     - Over Base: $5,200 - $1,000 = $4,200
     - Admin Fee (15%): $630
     - **Total Due: $4,830**

3. **Create Dispute**
   - Click "Dispute This Statement" button
   - Dispute creation form appears
   - Fill in fields:
     - **Category:** Calculation Error (dropdown)
     - **Description:**
       ```
       I believe the base year amount is incorrect. My lease states
       the base year is 2022 ($48,000 total expenses), but the
       statement shows $50,000 as base year expenses.

       This results in an overcharge of:
       ($50,000 - $48,000) × 10% = $200.00

       Please review and adjust.
       ```
     - **Attachment:** Upload `lease-page-5.pdf` (base year clause)
   - Click "Submit Dispute"
   - ✅ Verify: Success message: "Dispute submitted. Tracking ID: #DSP-001"
   - ✅ Verify: Dispute appears in "My Disputes" list with status: OPEN

**Steps (Part 2: Admin Reviews and Responds):**

4. **Admin Login**
   - Logout as tenant
   - Login as `owner@beta.example.com` / `TestPass123!`
   - Navigate to "Disputes" in sidebar
   - ✅ Verify: Dispute #DSP-001 appears in list with "NEW" badge

5. **Assign Dispute**
   - Click on dispute #DSP-001
   - Dispute detail page opens
   - Shows tenant's description and attachment
   - Click "Assign to Me" button
   - ✅ Verify: Status changes to "UNDER_REVIEW"
   - ✅ Verify: "Assigned to: Eve Beta" appears

6. **Download and Review Attachment**
   - Click "Download" on `lease-page-5.pdf`
   - ✅ Verify: PDF opens showing lease base year clause
   - Confirms tenant is correct: base year expenses should be $48,000

7. **Add Internal Comment**
   - Click "Add Comment" button
   - Toggle: "Internal Note" (tenant won't see this)
   - Comment:
     ```
     INTERNAL NOTE: Verified lease page 5. Tenant is correct.
     Base year amount in our system: $50,000
     Actual base year per lease: $48,000
     Overcharge: $200.00

     Action items:
     1. Update lease recovery profile in database
     2. Recalculate reconciliation for Store 3
     3. Issue credit memo for $200.00
     ```
   - Click "Save Comment"
   - ✅ Verify: Comment saved with "Internal" badge

8. **Add Public Response**
   - Click "Add Comment" button
   - Toggle: "Public Response" (tenant will see this)
   - Comment:
     ```
     Thank you for bringing this to our attention. We've reviewed
     your lease and confirmed that the base year expenses should
     be $48,000, not $50,000.

     We will:
     1. Correct the base year amount in our system
     2. Recalculate your 2024 reconciliation
     3. Issue a credit of $200.00 to your account

     Please allow 5 business days for the adjustment to appear.
     ```
   - Click "Save Comment"
   - ✅ Verify: Comment saved without "Internal" badge

9. **Resolve Dispute**
   - Click "Resolve Dispute" button
   - Resolution modal appears:
     - **Resolution Type:** Adjusted (dropdown: Adjusted, No Action Needed, Denied)
     - **Credit Amount:** $200.00
     - **Resolution Summary:**
       ```
       Base year expenses corrected from $50,000 to $48,000 per
       lease agreement. Credit of $200.00 issued to tenant account.
       ```
   - Click "Save Resolution"
   - ✅ Verify: Status changes to "RESOLVED"
   - ✅ Verify: "Resolved by: Eve Beta" and timestamp appear

**Steps (Part 3: Tenant Views Resolution):**

10. **Tenant Views Resolution**
    - Logout as admin
    - Login as `lisa.tenant@salon.com` / `TestPass123!`
    - Navigate to "My Disputes"
    - ✅ Verify: Dispute #DSP-001 shows status "RESOLVED"
    - Click on dispute
    - ✅ Verify: Can see public comment from admin
    - ✅ Verify: Cannot see internal note
    - ✅ Verify: Resolution summary is visible
    - Click "Accept Resolution" button
    - ✅ Verify: Status changes to "CLOSED"

**Expected Results:**
- ✅ Tenant can only see own leases (RLS enforced)
- ✅ Dispute created successfully with attachment
- ✅ Admin receives notification of new dispute
- ✅ Internal comments hidden from tenant
- ✅ Public comments visible to tenant
- ✅ Dispute status transitions: OPEN → UNDER_REVIEW → RESOLVED → CLOSED
- ✅ Audit trail records all actions with timestamps and users
- ✅ Attachment uploaded to Supabase Storage and accessible

**Common Issues:**

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Tenant sees wrong leases | RLS policy error | Check `tenant_lease_links` table |
| Attachment upload fails | Storage bucket permissions | Verify Supabase Storage policies |
| Internal comment visible | Toggle not set | Ensure `is_internal=true` in DB |
| Notification not sent | Email service down | Check Resend API status |

---

## Additional Scenarios (4-15)

Due to space constraints, scenarios 4-15 follow the same detailed format:

**Scenario 4:** AI Document Extraction (Epsilon - Suite 402)
**Scenario 5:** GL Import & Auto-Mapping (Acme - Suburban Office)
**Scenario 6:** Pool Hierarchy & Roll-Ups (Delta - Class A Tower)
**Scenario 7:** Calculation Job Monitoring (Gamma - Medical Building)
**Scenario 8:** Document Rejection Flow (Epsilon - Suite 305)
**Scenario 9:** Tenant Invitation Flow (Beta - New Tenant)
**Scenario 10:** Edge Case GL Handling (Gamma - Medical Building)
**Scenario 11:** Finalization Immutability (Acme - Downtown 2022)
**Scenario 12:** User Role Permissions (All Organizations)
**Scenario 13:** Billing & Subscription (Acme, Beta, Gamma)
**Scenario 14:** Export Workflows (Acme - Downtown Tower)
**Scenario 15:** Dispute Resolution Lifecycle (Beta - All 6 Disputes)

_Full details for scenarios 4-15 available in complete guide._

---

## Data Relationships

### Entity Relationship Diagram

```
organizations
├── users (15)
├── properties (6)
│   ├── units (70)
│   ├── leases (48)
│   │   ├── tenant_lease_links → tenant_users (4)
│   │   └── reconciliation_snapshots (94)
│   │       └── disputes (6)
│   │           ├── dispute_comments (24)
│   │           └── dispute_attachments (4)
│   ├── expense_pools (30+)
│   │   ├── pool_mappings (70+)
│   │   └── pool_allocations (split configs)
│   ├── import_batches (15)
│   │   └── gl_entries (1,482)
│   └── calculation_jobs (8)
├── documents (10)
└── subscriptions (5)
    └── invoices (15+)
```

### Fixed UUID Patterns

All test data uses deterministic UUIDs for repeatability:

- Organizations: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000X` (X = 1-5)
- Users: `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb0XX` (XX = 01-15)
- Properties: `cccccccc-cccc-cccc-cccc-ccccccccc00X` (X = 1-6)
- Leases: `dddddddd-dddd-dddd-dddd-ddddddddd0XX`
- Pools: `eeeeeeee-eeee-eeee-eeee-eeeeeeeee0XX`

This allows for predictable queries and easy data identification.

---

## Reset & Reload

### Full Reset and Reload

**All data (Demo + Test) is now loaded with a single command:**

```bash
supabase db reset
```

This command:
1. Drops and recreates the database
2. Applies all migrations
3. Loads all seed data from `seed.sql` (Demo Company + test organizations)
4. Takes ~15-20 seconds

### Partial Reset (Specific Organizations)

If you only want to reset specific test organizations without a full database reset:

```sql
-- Example: Reset only Beta Real Estate Holdings (keeps Demo Company and other test orgs)
DELETE FROM organizations WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002';
-- Cascading deletes will remove all related data for this organization
```

### Verify Data Loaded

```bash
psql -U postgres -h 127.0.0.1 -p 54322 -d postgres -c"
SELECT
  (SELECT COUNT(*) FROM organizations) as total_orgs,
  (SELECT COUNT(*) FROM auth.users) as total_users;"
```

**Expected After Reset:**
```
 total_orgs | total_users
------------+-------------
          6 |          17
```

- **6 organizations**: 1 Demo Company + 5 test orgs
- **17 users**: 2 Demo + 15 test users

---

## Troubleshooting

### Issue: Login Fails with "Invalid credentials"

**Symptoms:**
- Cannot login with test user emails
- Error message: "Invalid email or password"

**Possible Causes:**
1. Auth users not created in `auth.users` table
2. Password hash incorrect
3. Email not confirmed

**Solutions:**

```sql
-- Check if auth user exists
SELECT id, email, email_confirmed_at
FROM auth.users
WHERE email = 'owner@acme.example.com';

-- If missing, re-run seed script
supabase db reset

-- If exists but email_confirmed_at is NULL, update it
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'owner@acme.example.com';
```

---

### Issue: Tenant Can See Other Tenants' Leases

**Symptoms:**
- Tenant user sees leases they shouldn't have access to
- RLS not enforcing multi-tenancy

**Possible Causes:**
1. `tenant_lease_links` missing or incorrect
2. RLS policies disabled
3. Using service_role key instead of anon key

**Solutions:**

```sql
-- Check tenant lease links
SELECT tll.tenant_user_id, tll.lease_id, l.tenant_name
FROM tenant_lease_links tll
JOIN leases l ON l.id = tll.lease_id
WHERE tll.tenant_user_id IN (
    SELECT id FROM tenant_users WHERE email = 'lisa.tenant@salon.com'
);

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'leases';
-- Should show rowsecurity = true

-- Check active policies
SELECT * FROM pg_policies WHERE tablename = 'leases';
```

---

### Issue: GL Entries Not Showing in Property

**Symptoms:**
- Property shows 0 GL entries
- Import batches list is empty

**Possible Causes:**
1. CSV files not generated
2. Import batches not created
3. Wrong `property_id` in GL entries

**Solutions:**

```bash
# Verify CSV files exist
ls backend/tests/fixtures/seed_data/*.csv

# Should show:
# yardi_gl_downtown_tower_2022_2024.csv
# yardi_gl_suburban_office_2022_2024.csv
# ... (6 total)

# If missing, regenerate
cd supabase/seed_helpers
python generate_gl_entries.py
```

```sql
-- Check import batches
SELECT id, file_name, row_count, status, property_id
FROM import_batches
WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001';

-- Check GL entries for property
SELECT COUNT(*) as entry_count
FROM gl_entries
WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001';
-- Should show ~285 for Downtown Tower
```

---

### Issue: Reconciliation Calculation Fails

**Symptoms:**
- "Calculation failed" error message
- Missing recovery profile

**Possible Causes:**
1. Leases missing `recovery_profile` JSONB
2. Expense pools not configured
3. Pool mappings missing for GL accounts

**Solutions:**

```sql
-- Check leases have recovery profiles
SELECT id, tenant_name, recovery_profile
FROM leases
WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'
  AND recovery_profile IS NULL;
-- Should return 0 rows

-- Check expense pools exist
SELECT COUNT(*) as pool_count
FROM expense_pools
WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001';
-- Should show 5-8 pools

-- Check pool mappings cover GL accounts
SELECT DISTINCT account_code
FROM gl_entries
WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'
  AND account_code NOT IN (
      SELECT UNNEST(regexp_matches(gl_account_pattern, '\d+'))::text
      FROM pool_mappings pm
      JOIN expense_pools ep ON ep.id = pm.expense_pool_id
      WHERE ep.property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'
  );
-- Should return 0 rows (all accounts mapped)
```

---

### Issue: Dispute Comments Not Saving

**Symptoms:**
- "Save Comment" fails
- Comment doesn't appear in list

**Possible Causes:**
1. User lacks permissions
2. Dispute in closed status
3. Character limit exceeded

**Solutions:**

```sql
-- Check dispute status
SELECT id, status, resolved_at
FROM disputes
WHERE id = 'dispute-uuid-here';
-- If status='closed', cannot add comments

-- Check comment length
-- Max length: 5000 characters

-- Verify user permissions
SELECT role FROM users WHERE id = current_user_id;
-- Admin/Owner can comment, Tenant can only comment on own disputes
```

---

### Issue: PDF Export Empty or Corrupt

**Symptoms:**
- Downloaded PDF won't open
- PDF missing expected sections

**Possible Causes:**
1. Missing logo in organization settings
2. Calculation trace not generated
3. PDF generation timeout

**Solutions:**

```bash
# Check backend logs for PDF generation errors
tail -f backend/logs/app.log | grep "PDF"

# Verify calculation trace exists
SELECT calculation_trace
FROM reconciliation_snapshots
WHERE id = 'snapshot-uuid-here';
-- Should return non-null JSONB array
```

---

### Getting Help

If you encounter an issue not covered here:

1. **Check Database Logs:**
   ```bash
   docker logs supabase_db_capveri
   ```

2. **Check Backend API Logs:**
   ```bash
   cd backend
   tail -f logs/app.log
   ```

3. **Verify Supabase is Running:**
   ```bash
   supabase status
   ```

4. **Reset and Reload:**
   ```bash
   psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_helpers/reset_manual_testing.sql
   psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_manual_testing.sql
   ```

5. **Report Issue:**
   - Include error messages
   - Include relevant SQL queries
   - Include browser console errors (F12)

---

## Appendix

### Quick Reference: All Credentials

| Email | Password | Role | Organization |
|-------|----------|------|--------------|
| owner@acme.example.com | TestPass123! | Owner | Acme |
| admin@acme.example.com | TestPass123! | Admin | Acme |
| member@acme.example.com | TestPass123! | Member | Acme |
| viewer@acme.example.com | TestPass123! | Viewer | Acme |
| owner@beta.example.com | TestPass123! | Owner | Beta |
| member@beta.example.com | TestPass123! | Member | Beta |
| sarah.tenant@retailstore.com | TestPass123! | Tenant | Beta |
| mike.tenant@coffeeshop.com | TestPass123! | Tenant | Beta |
| lisa.tenant@salon.com | TestPass123! | Tenant | Beta |
| david.tenant@gym.com | TestPass123! | Tenant | Beta |
| owner@gamma.example.com | TestPass123! | Owner | Gamma |
| owner@delta.example.com | TestPass123! | Owner | Delta |
| admin@delta.example.com | TestPass123! | Admin | Delta |
| owner@epsilon.example.com | TestPass123! | Owner | Epsilon |
| member@epsilon.example.com | TestPass123! | Member | Epsilon |

### Quick Reference: Data Counts

| Entity | Expected Count |
|--------|----------------|
| Organizations | 5 |
| Users | 15 |
| Properties | 6 |
| Units | 70 |
| Leases | 48 |
| GL Entries | 1,482 |
| Reconciliation Snapshots | 94 |
| Expense Pools | 30+ |
| Pool Mappings | 70+ |
| Disputes | 6 |
| Tenant Users | 4 |
| Documents | 10 |

---

**Last Updated:** 2026-01-07
**Version:** 1.0
**Maintainer:** CapVeri Team
