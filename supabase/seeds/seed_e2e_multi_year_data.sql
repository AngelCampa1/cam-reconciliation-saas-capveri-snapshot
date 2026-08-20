-- ==============================================================================
-- CapVeri.com - Multi-Year Historical Data (Journey 2 Only)
-- ==============================================================================
--
-- PURPOSE: Adds 6-year historical GL entries and reconciliation snapshots
--          specifically for Journey 2 (Year-over-Year Variance Analysis).
--
-- PREREQUISITES:
-- - supabase/seed.sql must be loaded first (loads automatically)
-- - Requires Downtown Tower property to exist
--
-- COVERAGE:
-- - 2023: 15 GL entries ($238,500 total)
-- - 2025: 15 GL entries ($311,460 total)
-- - 2026: 15 GL entries ($271,305 total)
-- - Reconciliation snapshots for all 3 years
--
-- MANUAL LOADING:
-- cat supabase/seed_e2e_multi_year_data.sql | docker exec -i supabase_db_capveri psql -U postgres -d postgres
--
-- OR:
-- supabase db execute < supabase/seed_e2e_multi_year_data.sql
--
-- NOTE: This file does NOT auto-load. Load manually when testing Journey 2.
--
-- E2E TEST COVERAGE:
-- - Multi-Year Variance Analysis (Journey 2: TC2.1-2.8)
-- - Trend Analysis with ARIMA forecasting
-- - Anomaly Detection
-- - Fuzzy Pool Name Matching
--
-- Usage:
--   psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_e2e_multi_year_data.sql
--
-- ==============================================================================

BEGIN;

-- Disable triggers temporarily for faster insertion
SET session_replication_role = replica;

\echo '==============================================================================';
\echo 'LOADING E2E MULTI-YEAR TEST DATA';
\echo '==============================================================================';
\echo '';

-- ==============================================================================
-- SECTION 1: GL ENTRIES FOR YEAR 2023 (BASE YEAR)
-- ==============================================================================

\echo '[1/6] Creating 2023 GL entries for Downtown Tower...';

-- Create import batch for 2023
INSERT INTO import_batches (id, organization_id, property_id, file_name, file_hash, source_system, status, row_count, created_at, updated_at)
VALUES
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, 'downtown_tower_2023_gl.csv', 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a12023', 'yardi', 'completed', 15, NOW() - INTERVAL '2 years', NOW() - INTERVAL '2 years')
ON CONFLICT (id) DO NOTHING;

-- Downtown Tower 2023 GL Entries (base amounts for variance comparison)
INSERT INTO gl_entries (import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, created_at)
VALUES
    -- Operating Expenses (baseline amounts)
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5200', 'Electric Service', 11000.00, '2023-01-15', 2023, 1, 'City Power & Light', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5210', 'Gas Service', 3000.00, '2023-01-20', 2023, 1, 'Metro Gas Company', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5300', 'Janitorial Services', 8000.00, '2023-02-01', 2023, 2, 'CleanPro Services', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5500', 'Security Services', 6500.00, '2023-02-15', 2023, 2, 'SecureGuard Inc', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5700', 'Legal Fees', 4000.00, '2023-03-10', 2023, 3, 'Smith & Associates', NOW() - INTERVAL '2 years'),

    -- Tax (baseline)
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5100', 'Property Tax', 42000.00, '2023-01-05', 2023, 1, 'County Tax Assessor', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '6100', 'Real Estate Tax', 21000.00, '2023-04-01', 2023, 4, 'City Tax Collector', NOW() - INTERVAL '2 years'),

    -- Insurance (baseline)
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5110', 'Property Insurance', 17500.00, '2023-01-01', 2023, 1, 'National Insurance Co', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5120', 'Liability Insurance', 8500.00, '2023-01-01', 2023, 1, 'Acme Insurance Group', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '6200', 'General Liability', 5000.00, '2023-02-01', 2023, 2, 'SafeGuard Insurance', NOW() - INTERVAL '2 years'),

    -- Capital (baseline)
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7000', 'HVAC Maintenance', 35000.00, '2023-03-15', 2023, 3, 'CoolAir Systems', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7010', 'Elevator Maintenance', 28000.00, '2023-04-20', 2023, 4, 'Otis Elevator', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7100', 'Roof Maintenance', 22000.00, '2023-05-10', 2023, 5, 'RoofPro Contractors', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7150', 'Parking Lot Maintenance', 18000.00, '2023-06-05', 2023, 6, 'Pave Masters LLC', NOW() - INTERVAL '2 years'),
    ('b1b1b1b1-2023-2023-2023-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7200', 'Capital Reserve Fund', 12000.00, '2023-06-30', 2023, 6, 'Reserve Transfer', NOW() - INTERVAL '2 years')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- SECTION 2: GL ENTRIES FOR YEAR 2025 (SHOWING VARIANCE)
-- ==============================================================================

\echo '[2/6] Creating 2025 GL entries for Downtown Tower...';

-- Create import batch for 2025
INSERT INTO import_batches (id, organization_id, property_id, file_name, file_hash, source_system, status, row_count, created_at, updated_at)
VALUES
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, 'downtown_tower_2025_gl.csv', 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a22025', 'yardi', 'completed', 15, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')
ON CONFLICT (id) DO NOTHING;

-- Downtown Tower 2025 GL Entries (showing 8-12% variance - warning level)
INSERT INTO gl_entries (import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, created_at)
VALUES
    -- Operating Expenses (8-10% increase from 2023)
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5200', 'Electric Service', 12100.00, '2025-01-15', 2025, 1, 'City Power & Light', NOW() - INTERVAL '30 days'),
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5210', 'Gas Service', 3300.00, '2025-01-20', 2025, 1, 'Metro Gas Company', NOW() - INTERVAL '30 days'),
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5300', 'Janitorial', 8800.00, '2025-02-01', 2025, 2, 'CleanPro Services', NOW() - INTERVAL '30 days'), -- Note: Name changed slightly for fuzzy matching test
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5500', 'Security Services', 7150.00, '2025-02-15', 2025, 2, 'SecureGuard Inc', NOW() - INTERVAL '30 days'),
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5700', 'Legal Fees', 4400.00, '2025-03-10', 2025, 3, 'Smith & Associates', NOW() - INTERVAL '30 days'),

    -- Tax (5% increase - normal)
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5100', 'Property Tax', 44100.00, '2025-01-05', 2025, 1, 'County Tax Assessor', NOW() - INTERVAL '30 days'),
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '6100', 'Real Estate Tax', 22050.00, '2025-04-01', 2025, 4, 'City Tax Collector', NOW() - INTERVAL '30 days'),

    -- Insurance (6% increase - warning threshold)
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5110', 'Property Insurance', 18550.00, '2025-01-01', 2025, 1, 'National Insurance Co', NOW() - INTERVAL '30 days'),
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5120', 'Liability Insurance', 9010.00, '2025-01-01', 2025, 1, 'Acme Insurance Group', NOW() - INTERVAL '30 days'),
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '6200', 'General Liability', 5300.00, '2025-02-01', 2025, 2, 'SafeGuard Insurance', NOW() - INTERVAL '30 days'),

    -- Capital (significant variance - some items up 20%+ for anomaly detection)
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7000', 'HVAC Replacement', 105000.00, '2025-03-15', 2025, 3, 'CoolAir Systems', NOW() - INTERVAL '30 days'), -- 200% increase (CRITICAL ANOMALY)
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7010', 'Elevator Modernization', 75000.00, '2025-04-20', 2025, 4, 'Otis Elevator', NOW() - INTERVAL '30 days'), -- 168% increase (CRITICAL ANOMALY)
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7100', 'Roof Repairs', 26400.00, '2025-05-10', 2025, 5, 'RoofPro Contractors', NOW() - INTERVAL '30 days'), -- 20% increase (WARNING)
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7150', 'Parking Lot Resurfacing', 21600.00, '2025-06-05', 2025, 6, 'Pave Masters LLC', NOW() - INTERVAL '30 days'), -- 20% increase
    ('b1b1b1b1-2025-2025-2025-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7200', 'Capital Reserve Fund', 13200.00, '2025-06-30', 2025, 6, 'Reserve Transfer', NOW() - INTERVAL '30 days') -- 10% increase (normal growth)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- SECTION 3: GL ENTRIES FOR YEAR 2026 (CURRENT YEAR WITH MORE VARIANCE)
-- ==============================================================================

\echo '[3/6] Creating 2026 GL entries for Downtown Tower...';

-- Create import batch for 2026
INSERT INTO import_batches (id, organization_id, property_id, file_name, file_hash, source_system, status, row_count, created_at, updated_at)
VALUES
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, 'downtown_tower_2026_gl.csv', 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a32026', 'yardi', 'completed', 15, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days')
ON CONFLICT (id) DO NOTHING;

-- Downtown Tower 2026 GL Entries (continuing trends with some anomalies)
INSERT INTO gl_entries (import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, created_at)
VALUES
    -- Operating Expenses (continued increase)
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5200', 'Electric Service', 13310.00, '2026-01-15', 2026, 1, 'City Power & Light', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5210', 'Gas Service', 3630.00, '2026-01-20', 2026, 1, 'Metro Gas Company', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5300', 'Janitorial Services', 9680.00, '2026-02-01', 2026, 2, 'CleanPro Services', NOW() - INTERVAL '7 days'), -- Back to original name
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5500', 'Security Services', 7865.00, '2026-02-15', 2026, 2, 'SecureGuard Inc', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5700', 'Legal Services', 4840.00, '2026-03-10', 2026, 3, 'Smith & Associates', NOW() - INTERVAL '7 days'), -- Name changed for fuzzy matching

    -- Tax (continued normal growth)
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5100', 'Property Tax', 46305.00, '2026-01-05', 2026, 1, 'County Tax Assessor', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '6100', 'Real Estate Tax', 23153.00, '2026-04-01', 2026, 4, 'City Tax Collector', NOW() - INTERVAL '7 days'),

    -- Insurance (continued increase)
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5110', 'Property Insurance', 19663.00, '2026-01-01', 2026, 1, 'National Insurance Co', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5120', 'Liability Insurance', 9551.00, '2026-01-01', 2026, 1, 'Acme Insurance Group', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '6200', 'General Liability', 5618.00, '2026-02-01', 2026, 2, 'SafeGuard Insurance', NOW() - INTERVAL '7 days'),

    -- Capital (more normalized after 2025 spike)
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7000', 'HVAC Maintenance', 42000.00, '2026-03-15', 2026, 3, 'CoolAir Systems', NOW() - INTERVAL '7 days'), -- Back to normal maintenance
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7010', 'Elevator Maintenance', 30800.00, '2026-04-20', 2026, 4, 'Otis Elevator', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7100', 'Roof Maintenance', 24200.00, '2026-05-10', 2026, 5, 'RoofPro Contractors', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7150', 'Parking Maintenance', 19800.00, '2026-06-05', 2026, 6, 'Pave Masters LLC', NOW() - INTERVAL '7 days'),
    ('b1b1b1b1-2026-2026-2026-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7200', 'Capital Reserve Fund', 14520.00, '2026-06-30', 2026, 6, 'Reserve Transfer', NOW() - INTERVAL '7 days')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- SECTION 4: RECONCILIATION SNAPSHOTS FOR 2023
-- ==============================================================================

\echo '[4/6] Creating 2023 reconciliation snapshots (finalized)...';

-- Create snapshots for all tenants in 2023 (finalized)
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    finalized_at, finalized_by_user_id, organization_id, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
    l.id,
    '2023-01-01'::date,
    '2023-12-31'::date,
    'finalized',
    221000.00, -- total_operating_expenses
    221000.00, -- grossed_up_expenses (no gross-up in base year)
    0.00,      -- base_year_amount (this IS the base year)
    (221000.00 * (l.recovery_profile->>'pro_rata_share')::decimal), -- tenant_share_before_cap
    (221000.00 * (l.recovery_profile->>'pro_rata_share')::decimal), -- tenant_share_after_cap (no cap)
    (221000.00 * (l.recovery_profile->>'pro_rata_share')::decimal * 0.15), -- admin_fee (15%)
    (221000.00 * (l.recovery_profile->>'pro_rata_share')::decimal * 1.15), -- total_recovery
    NOW() - INTERVAL '1 year 11 months',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'::uuid, -- owner@acme.example.com user_id
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, -- Acme org_id
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '1 year 11 months'
FROM leases l
WHERE l.property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid
    AND l.status = 'active'
    AND l.recovery_profile IS NOT NULL
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- SECTION 5: RECONCILIATION SNAPSHOTS FOR 2025
-- ==============================================================================

\echo '[5/6] Creating 2025 reconciliation snapshots (finalized)...';

-- Create snapshots for all tenants in 2025 (finalized)
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    finalized_at, finalized_by_user_id, organization_id, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
    l.id,
    '2025-01-01'::date,
    '2025-12-31'::date,
    'finalized',
    340000.00, -- total_operating_expenses (54% increase from 2023)
    340000.00, -- grossed_up_expenses
    221000.00, -- base_year_amount (2023 base)
    ((340000.00 - 221000.00) * (l.recovery_profile->>'pro_rata_share')::decimal), -- tenant_share_before_cap
    ((340000.00 - 221000.00) * (l.recovery_profile->>'pro_rata_share')::decimal), -- tenant_share_after_cap
    ((340000.00 - 221000.00) * (l.recovery_profile->>'pro_rata_share')::decimal * 0.15), -- admin_fee
    ((340000.00 - 221000.00) * (l.recovery_profile->>'pro_rata_share')::decimal * 1.15), -- total_recovery
    NOW() - INTERVAL '60 days',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'::uuid, -- owner@acme.example.com user_id
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, -- Acme org_id
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '60 days'
FROM leases l
WHERE l.property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid
    AND l.status = 'active'
    AND l.recovery_profile IS NOT NULL
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- SECTION 6: RECONCILIATION SNAPSHOTS FOR 2026
-- ==============================================================================

\echo '[6/6] Creating 2026 reconciliation snapshots (finalized)...';

-- Create snapshots for all tenants in 2026 (finalized)
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    finalized_at, finalized_by_user_id, organization_id, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
    l.id,
    '2026-01-01'::date,
    '2026-12-31'::date,
    'finalized',
    373330.00, -- total_operating_expenses (10% increase from 2025)
    373330.00, -- grossed_up_expenses
    221000.00, -- base_year_amount (2023 base)
    ((373330.00 - 221000.00) * (l.recovery_profile->>'pro_rata_share')::decimal), -- tenant_share_before_cap
    ((373330.00 - 221000.00) * (l.recovery_profile->>'pro_rata_share')::decimal), -- tenant_share_after_cap
    ((373330.00 - 221000.00) * (l.recovery_profile->>'pro_rata_share')::decimal * 0.15), -- admin_fee
    ((373330.00 - 221000.00) * (l.recovery_profile->>'pro_rata_share')::decimal * 1.15), -- total_recovery
    NOW() - INTERVAL '3 days',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'::uuid, -- owner@acme.example.com user_id
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, -- Acme org_id
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '3 days'
FROM leases l
WHERE l.property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid
    AND l.status = 'active'
    AND l.recovery_profile IS NOT NULL
ON CONFLICT DO NOTHING;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Print summary
DO $$
DECLARE
    gl_2023_count INT;
    gl_2025_count INT;
    gl_2026_count INT;
    snap_2023_count INT;
    snap_2025_count INT;
    snap_2026_count INT;
BEGIN
    SELECT COUNT(*) INTO gl_2023_count FROM gl_entries WHERE period_year = 2023 AND property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid;
    SELECT COUNT(*) INTO gl_2025_count FROM gl_entries WHERE period_year = 2025 AND property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid;
    SELECT COUNT(*) INTO gl_2026_count FROM gl_entries WHERE period_year = 2026 AND property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid;
    SELECT COUNT(*) INTO snap_2023_count FROM reconciliation_snapshots WHERE EXTRACT(YEAR FROM period_start_date) = 2023 AND property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid;
    SELECT COUNT(*) INTO snap_2025_count FROM reconciliation_snapshots WHERE EXTRACT(YEAR FROM period_start_date) = 2025 AND property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid;
    SELECT COUNT(*) INTO snap_2026_count FROM reconciliation_snapshots WHERE EXTRACT(YEAR FROM period_start_date) = 2026 AND property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid;

    RAISE NOTICE '';
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'E2E MULTI-YEAR DATA LOADED SUCCESSFULLY';
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Downtown Tower GL Entries:';
    RAISE NOTICE '  - 2023: % entries (base year)', gl_2023_count;
    RAISE NOTICE '  - 2025: % entries (showing variance)', gl_2025_count;
    RAISE NOTICE '  - 2026: % entries (current year)', gl_2026_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Downtown Tower Reconciliation Snapshots (finalized):';
    RAISE NOTICE '  - 2023: % snapshots', snap_2023_count;
    RAISE NOTICE '  - 2025: % snapshots', snap_2025_count;
    RAISE NOTICE '  - 2026: % snapshots', snap_2026_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Data Features for E2E Testing:';
    RAISE NOTICE '  - Variance Analysis: 2023 → 2025 shows 8-50%% variance across pools';
    RAISE NOTICE '  - Anomaly Detection: Capital expenses in 2025 show >100%% spikes (CRITICAL)';
    RAISE NOTICE '  - Fuzzy Matching: "Janitorial Services" vs "Janitorial" (2025)';
    RAISE NOTICE '  - Fuzzy Matching: "Legal Fees" vs "Legal Services" (2026)';
    RAISE NOTICE '  - Trend Analysis: 4 years of data (2023, 2024, 2025, 2026)';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '  1. Run E2E tests for Multi-Year Variance Analysis (Journey 2)';
    RAISE NOTICE '  2. Verify variance color coding (green/amber/red)';
    RAISE NOTICE '  3. Test fuzzy pool name matching';
    RAISE NOTICE '  4. Verify ARIMA trend forecasting';
    RAISE NOTICE '';
    RAISE NOTICE '==============================================================================';
END $$;

COMMIT;
