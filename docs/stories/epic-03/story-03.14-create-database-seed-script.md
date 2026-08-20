# Story 3.14: Create Database Seed Script

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Stories 3.2-3.11, 3.15-3.18 (for billing/feedback seed data)
- **Status**: `pending` (needs update for billing/feedback tables)

> **Note**: This story was initially completed but needs to be updated to include seed data for billing tables (3.15-3.16), promotions table (3.17), and feedback table (3.18). Update `supabase/seed.sql` to include sample subscriptions, invoices, and feedback entries.

## User Story
**As a** developer
**I want** seed data for local development
**So that** I can test features without manually creating data

## Acceptance Criteria
- [x] **AC1**: `supabase/seed.sql` creates:
  - 1 organization ("Demo Company")
  - 2 users (admin, member)
  - 2 properties
  - 5 leases with varied recovery profiles
  - Sample expense pools and mappings
- [x] **AC2**: `supabase db reset` runs migrations + seed
- [x] **AC3**: Seed data uses realistic values
- [x] **AC4**: Seed is idempotent (can run multiple times)

## Technical Specifications

**File to Create**:
```
supabase/
└── seed.sql
```

**Seed SQL** (excerpt):
```sql
-- Seed data for local development
-- Run with: supabase db reset

-- First, create auth users via Supabase Auth API (in seed.ts) or use raw inserts
-- This seed assumes auth users already exist

-- Organization
INSERT INTO public.organizations (id, name, subscription_status, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Demo Company',
    'active',
    '{"timezone": "America/New_York", "default_currency": "USD", "fiscal_year_end_month": 12}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Users (assumes auth.users entries exist)
-- In real setup, these would be created via Supabase Auth

-- Properties
INSERT INTO public.properties (id, organization_id, name, address_line1, city, state, postal_code, total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy)
VALUES
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Downtown Tower', '100 Main Street', 'New York', 'NY', '10001', 50000.00, 45000.00, 5000.00, 0.9500),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Suburban Office Park', '500 Corporate Drive', 'Chicago', 'IL', '60601', 75000.00, 68000.00, 7000.00, 0.9500)
ON CONFLICT (id) DO NOTHING;

-- Units for Downtown Tower
INSERT INTO public.units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
VALUES
    ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', '101', 2500.00, 2300.00, 1, 'occupied'),
    ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', '102', 3000.00, 2750.00, 1, 'occupied'),
    ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101', '201', 5000.00, 4600.00, 2, 'occupied'),
    ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000101', '202', 4000.00, 3700.00, 2, 'vacant'),
    ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000101', '301', 10000.00, 9200.00, 3, 'occupied')
ON CONFLICT (id) DO NOTHING;

-- Leases with varied recovery profiles
INSERT INTO public.leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
VALUES
    -- Lease with base year and cumulative cap
    ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201',
     'Acme Corporation', '2023-01-01', '2028-12-31', 'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.05", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb),

    -- Lease with no cap
    ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202',
     'Beta Industries', '2022-06-01', '2027-05-31', 'active',
     '{"base_year": 2022, "base_year_amount": "85000.00", "gross_up_base_year": false, "pro_rata_share": "0.06", "cap_type": "none", "cap_rate": null, "admin_fee_percentage": "0.10", "excluded_pools": ["capital"]}'::jsonb),

    -- Lease with non-cumulative cap
    ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000203',
     'Gamma LLC', '2024-01-01', '2029-12-31', 'active',
     '{"base_year": 2024, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.10", "cap_type": "non_cumulative", "cap_rate": "0.03", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Expense Pools for Downtown Tower
INSERT INTO public.expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, description)
VALUES
    ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000101', 'Operating Expenses', 'operating', true, 0.9500, 'Variable operating expenses'),
    ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000101', 'Real Estate Taxes', 'tax', false, null, 'Property taxes - not grossed up'),
    ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000101', 'Insurance', 'insurance', false, null, 'Property insurance premiums'),
    ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000101', 'Capital Reserves', 'capital', false, null, 'Capital improvement reserves')
ON CONFLICT (id) DO NOTHING;

-- Pool Mappings
INSERT INTO public.pool_mappings (id, expense_pool_id, gl_account_pattern, allocation_percentage, priority)
VALUES
    ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', '5*', 1.0000, 0),
    ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000402', '61*', 1.0000, 10),
    ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000403', '62*', 1.0000, 10),
    ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000404', '7*', 1.0000, 0)
ON CONFLICT (id) DO NOTHING;

-- Note: GL entries and reconciliation snapshots should be generated
-- via the application or separate fixture scripts for realistic data
```

## Implementation Notes
- Created comprehensive `supabase/seed.sql` with 463 lines
- Uses fixed UUIDs (00000000-...) for deterministic, reproducible seed data
- Uses `ON CONFLICT (id) DO NOTHING` for idempotency
- Includes auth.users inserts for local development (password: 'password123')
- Seed data structure:
  - **1 Organization**: Demo Company with active subscription
  - **2 Users**: Alice Admin (admin role), Bob Member (member role)
  - **2 Properties**: Downtown Tower (NYC, 50k RSF), Suburban Office Park (Chicago, 75k RSF)
  - **10 Units**: 6 in Downtown Tower, 4 in Suburban Office Park
  - **5 Leases with varied recovery profiles**:
    - Acme Corporation: cumulative cap (5% annual)
    - Beta Industries: no cap, fixed base year amount, excludes capital
    - Gamma LLC: non-cumulative cap (3% annual)
    - Delta Technologies: cumulative compounding cap (4% annual)
    - Epsilon Partners: no cap, excludes insurance
  - **8 Expense Pools**: 4 per property (Operating, Taxes, Insurance, Capital)
  - **14 Pool Mappings**: GL account patterns (5*, 61*, 62*, 7*)
- Added 24 tests to `backend/tests/test_migrations.py` (390 total migration tests)

## Definition of Done
- [x] `supabase db reset` seeds data
- [x] Data is realistic
- [x] Seed is idempotent
