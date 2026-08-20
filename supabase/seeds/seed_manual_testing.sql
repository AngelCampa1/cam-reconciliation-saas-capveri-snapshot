-- ==============================================================================
-- CapVeri.com - Comprehensive Manual Testing Seed Data
-- ==============================================================================
--
-- This script creates comprehensive test data for manual testing of ALL
-- CapVeri.com features, including:
--
-- - 5 Organizations (covering all subscription tiers and feature sets)
-- - 15 Users (all roles: Owner, Admin, Member, Viewer, Tenant)
-- - 6 Properties (varied BOMA configurations)
-- - 60+ Units (mixed statuses)
-- - 45+ Leases (all cap types, varied recovery profiles)
-- - 30+ Expense Pools (including parent/child hierarchy)
-- - 70+ Pool Mappings (realistic GL patterns)
-- - 1,482 GL Entries (loaded from generated CSV files)
-- - 90+ Reconciliation Snapshots (draft + finalized)
-- - 8 Calculation Jobs (all states)
-- - 4 Tenant Portal Users
-- - 6 Disputes (complete lifecycle)
-- - 10 Documents (AI extraction testing)
-- - Billing Data (subscriptions, invoices)
--
-- IMPORTANT NOTES:
-- - This seed data is SEPARATE from the development seed.sql
-- - Uses fixed UUIDs for repeatability (aaaaaaaa-... pattern)
-- - All INSERT statements use ON CONFLICT DO NOTHING (idempotent)
-- - All test users use password: TestPass123!
-- - Designed for comprehensive manual QA testing
--
-- Usage:
--   Prerequisites:
--     1. Local Supabase running (supabase start)
--     2. GL CSV files generated (python supabase/seed_helpers/generate_gl_entries.py)
--
--   Load Data:
--     psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_manual_testing.sql
--
--   Reset Data (optional, to reload):
--     psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_helpers/reset_manual_testing.sql
--
-- Documentation:
--   See docs/MANUAL_TESTING_GUIDE.md for credentials, test scenarios, and usage
--
-- ==============================================================================

BEGIN;

-- Disable triggers temporarily for faster insertion
SET session_replication_role = replica;

-- Print header
DO $$
BEGIN
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'LOADING COMPREHENSIVE MANUAL TESTING SEED DATA';
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE '';
END $$;

-- ==============================================================================
-- SECTION 1: ORGANIZATIONS (5 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[1/23] Creating 5 test organizations...';
END $$;

INSERT INTO organizations (id, name, subscription_status, settings, created_at, updated_at)
VALUES
    -- Organization 1: Acme Property Management (Complete System Testing)
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
        'Acme Property Management',
        'active',
        '{"plan": "professional", "features": {"ai_extraction": true, "multi_property": true, "api_access": true}}'::jsonb,
        NOW() - INTERVAL '2 years',
        NOW()
    ),
    -- Organization 2: Beta Real Estate Holdings (Tenant Portal Focus)
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid,
        'Beta Real Estate Holdings',
        'trial',
        '{"plan": "starter", "trial_ends_at": "2025-12-31", "features": {"ai_extraction": true, "multi_property": false}}'::jsonb,
        NOW() - INTERVAL '30 days',
        NOW()
    ),
    -- Organization 3: Gamma Commercial Group (Edge Cases)
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
        'Gamma Commercial Group',
        'active',
        '{"plan": "free", "usage": {"properties": 1, "limit": 1}, "features": {"ai_extraction": false}}'::jsonb,
        NOW() - INTERVAL '6 months',
        NOW()
    ),
    -- Organization 4: Delta Development Corp (Multi-Year Analysis)
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004'::uuid,
        'Delta Development Corp',
        'active',
        '{"plan": "professional", "features": {"ai_extraction": true, "multi_property": true, "advanced_analytics": true}}'::jsonb,
        NOW() - INTERVAL '5 years',
        NOW()
    ),
    -- Organization 5: Epsilon Ventures (AI Extraction & Documents)
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid,
        'Epsilon Ventures',
        'active',
        '{"plan": "starter", "features": {"ai_extraction": true, "multi_property": false}}'::jsonb,
        NOW() - INTERVAL '1 year',
        NOW()
    )
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 5 organizations';
END $$;

-- ==============================================================================
-- SECTION 2: AUTH USERS (15 Total - Supabase Auth)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[2/23] Creating 15 auth users (Supabase Auth)...';
END $$;

-- Note: In a real scenario, these would be created via Supabase Auth API
-- For local testing, we'll insert directly into auth.users
-- Password for all users: TestPass123! (hashed)

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
    -- Acme Property Management Users (4)
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@acme.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@acme.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@acme.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@acme.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),

    -- Beta Real Estate Holdings Users (6 - including 4 tenants)
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@beta.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb006'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@beta.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah.tenant@retailstore.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb008'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mike.tenant@coffeeshop.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lisa.tenant@salon.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'david.tenant@gym.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),

    -- Gamma Commercial Group Users (1)
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb011'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@gamma.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),

    -- Delta Development Corp Users (2)
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb012'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@delta.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@delta.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),

    -- Epsilon Ventures Users (2)
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb014'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@epsilon.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb015'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@epsilon.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 15 auth users';
    RAISE NOTICE '   Password for all users: TestPass123!';
END $$;

-- ==============================================================================
-- SECTION 3: PUBLIC USERS (15 Total - User Profiles)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[3/23] Creating 15 user profiles...';
END $$;

INSERT INTO users (id, organization_id, email, full_name, role, created_at, updated_at)
VALUES
    -- Acme Property Management Users
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'owner@acme.example.com', 'Alice Acme', 'owner', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'admin@acme.example.com', 'Bob Administrator', 'admin', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'member@acme.example.com', 'Charlie Member', 'member', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'viewer@acme.example.com', 'Diana Viewer', 'viewer', NOW(), NOW()),

    -- Beta Real Estate Holdings Users (landlords)
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid, 'owner@beta.example.com', 'Eve Beta', 'owner', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb006'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid, 'member@beta.example.com', 'Frank Member', 'member', NOW(), NOW()),

    -- Beta Real Estate Holdings - Tenant Users
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid, 'sarah.tenant@retailstore.com', 'Sarah Retailer', 'tenant', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb008'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid, 'mike.tenant@coffeeshop.com', 'Mike Coffee', 'tenant', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid, 'lisa.tenant@salon.com', 'Lisa Stylist', 'tenant', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid, 'david.tenant@gym.com', 'David Fitness', 'tenant', NOW(), NOW()),

    -- Gamma Commercial Group Users
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb011'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid, 'owner@gamma.example.com', 'Grace Gamma', 'owner', NOW(), NOW()),

    -- Delta Development Corp Users
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb012'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004'::uuid, 'owner@delta.example.com', 'Henry Delta', 'owner', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004'::uuid, 'admin@delta.example.com', 'Iris Administrator', 'admin', NOW(), NOW()),

    -- Epsilon Ventures Users
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb014'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid, 'owner@epsilon.example.com', 'Jack Epsilon', 'owner', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb015'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid, 'member@epsilon.example.com', 'Karen Member', 'member', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 15 user profiles';
END $$;

-- ==============================================================================
-- SECTION 4: PROPERTIES (6 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[4/23] Creating 6 properties...';
END $$;

INSERT INTO properties (id, organization_id, name, address_line1, city, state, postal_code, total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy, created_at, updated_at)
VALUES
    -- Acme Property Management Properties (2)
    (
        'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
        'Downtown Tower',
        '100 Main Street',
        'Denver',
        'CO',
        '80202',
        150000.00,  -- 150K sqft rentable
        135000.00,  -- 135K sqft usable
        15000.00,   -- 15K sqft common area
        0.95,       -- 95% target occupancy
        NOW() - INTERVAL '2 years',
        NOW()
    ),
    (
        'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
        'Suburban Office Park',
        '5000 Tech Center Drive',
        'Denver',
        'CO',
        '80237',
        75000.00,   -- 75K sqft rentable
        68000.00,   -- 68K sqft usable
        7000.00,    -- 7K sqft common area
        0.95,
        NOW() - INTERVAL '2 years',
        NOW()
    ),

    -- Beta Real Estate Holdings Property (1)
    (
        'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid,
        'Retail Plaza',
        '2500 Shopping Center Road',
        'Boulder',
        'CO',
        '80301',
        50000.00,   -- 50K sqft rentable
        45000.00,   -- 45K sqft usable
        5000.00,    -- 5K sqft common area
        0.92,       -- 92% target (retail)
        NOW() - INTERVAL '1 year',
        NOW()
    ),

    -- Gamma Commercial Group Property (1)
    (
        'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
        'Medical Office Building',
        '123 Healthcare Drive',
        'Aurora',
        'CO',
        '80012',
        30000.00,   -- 30K sqft rentable
        27000.00,   -- 27K sqft usable
        3000.00,    -- 3K sqft common area
        0.90,       -- 90% target (medical)
        NOW() - INTERVAL '6 months',
        NOW()
    ),

    -- Delta Development Corp Property (1)
    (
        'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004'::uuid,
        'Class A Office Tower',
        '1000 Corporate Plaza',
        'Denver',
        'CO',
        '80202',
        200000.00,  -- 200K sqft rentable (large Class A)
        180000.00,  -- 180K sqft usable
        20000.00,   -- 20K sqft common area
        0.95,
        NOW() - INTERVAL '5 years',
        NOW()
    ),

    -- Epsilon Ventures Property (1)
    (
        'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid,
        'Industrial Complex',
        '789 Warehouse Way',
        'Commerce City',
        'CO',
        '80022',
        100000.00,  -- 100K sqft rentable (industrial)
        95000.00,   -- 95K sqft usable
        5000.00,    -- 5K sqft common area
        0.90,       -- 90% target (industrial)
        NOW() - INTERVAL '1 year',
        NOW()
    )
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 6 properties';
END $$;

-- ==============================================================================
-- SECTION 5: UNITS (60+ Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[5/23] Creating 60+ units across properties...';
END $$;

-- Downtown Tower Units (25)
INSERT INTO units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
    floor_num || LPAD(unit_num::text, 2, '0'),
    rentable_sqft,
    rentable_sqft * 0.90,  -- Usable is 90% of rentable (ensures usable <= rentable)
    floor_num,
    CASE
        WHEN random() < 0.85 THEN 'occupied'
        WHEN random() < 0.95 THEN 'vacant'
        ELSE 'under_renovation'
    END,
    NOW(),
    NOW()
FROM (
    SELECT floor_num, unit_num, (5000 + (random() * 2000)::int) as rentable_sqft
    FROM generate_series(2, 26) floor_num,
         generate_series(1, 1) unit_num
) subquery
ON CONFLICT DO NOTHING;

-- Suburban Office Park Units (15)
INSERT INTO units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
    'Suite ' || (100 + series)::text,
    rentable_sqft,
    rentable_sqft * 0.90,
    series / 5 + 1,
    CASE
        WHEN random() < 0.80 THEN 'occupied'
        ELSE 'vacant'
    END,
    NOW(),
    NOW()
FROM (
    SELECT series, (4000 + (random() * 2000)::int) as rentable_sqft
    FROM generate_series(1, 15) series
) subquery
ON CONFLICT DO NOTHING;

-- Retail Plaza Units (10)
INSERT INTO units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
    'Store ' || series::text,
    rentable_sqft,
    rentable_sqft * 0.90,
    1,  -- Retail is typically single-floor
    CASE
        WHEN random() < 0.90 THEN 'occupied'
        ELSE 'vacant'
    END,
    NOW(),
    NOW()
FROM (
    SELECT series, (3000 + (random() * 4000)::int) as rentable_sqft
    FROM generate_series(1, 10) series
) subquery
ON CONFLICT DO NOTHING;

-- Medical Office Building Units (5)
INSERT INTO units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
    'Suite ' || (series * 100)::text,
    rentable_sqft,
    rentable_sqft * 0.90,
    series,
    'occupied',  -- All occupied for edge case testing
    NOW(),
    NOW()
FROM (
    SELECT series, (5000 + (random() * 1000)::int) as rentable_sqft
    FROM generate_series(1, 5) series
) subquery
ON CONFLICT DO NOTHING;

-- Class A Office Tower Units (10)
INSERT INTO units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
    floor_num || LPAD('01', 2, '0'),
    rentable_sqft,
    rentable_sqft * 0.90,
    floor_num,
    'occupied',
    NOW(),
    NOW()
FROM (
    SELECT floor_num, (15000 + (random() * 5000)::int) as rentable_sqft
    FROM generate_series(10, 19) floor_num
) subquery
ON CONFLICT DO NOTHING;

-- Industrial Complex Units (5)
INSERT INTO units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
    'Bay ' || series::text,
    rentable_sqft,
    rentable_sqft * 0.95,  -- Industrial has higher usable ratio
    1,
    CASE
        WHEN random() < 0.80 THEN 'occupied'
        ELSE 'vacant'
    END,
    NOW(),
    NOW()
FROM (
    SELECT series, (18000 + (random() * 4000)::int) as rentable_sqft
    FROM generate_series(1, 5) series
) subquery
ON CONFLICT DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 70 units (25+15+10+5+10+5)';
END $$;
-- ==============================================================================
-- SECTION 6: LEASES (48 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[6/23] Creating 48 leases with varied recovery profiles...';
END $$;

-- Downtown Tower Leases (15 total) - Acme Property Management
-- Cumulative caps (5), Non-cumulative caps (5), Cumulative compounding (3), No caps (2)

INSERT INTO leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at, updated_at)
VALUES
    -- Cumulative caps (leases 001-005)
    ('dddddddd-dddd-dddd-dddd-ddddddddd001'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '0201' LIMIT 1),
     'TechCorp Inc',
     '2023-01-01'::date,
     '2028-12-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.05", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '2 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd002'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '0301' LIMIT 1),
     'FinanceGroup LLC',
     '2022-06-01'::date,
     '2027-05-31'::date,
     'active',
     '{"base_year": 2022, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.048", "cap_type": "cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '2.5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd003'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '0401' LIMIT 1),
     'Legal Associates',
     '2023-03-01'::date,
     '2028-02-28'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.042", "cap_type": "cumulative", "cap_rate": "0.06", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '21 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd004'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '0501' LIMIT 1),
     'Marketing Pro Agency',
     '2023-07-01'::date,
     '2028-06-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.038", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '18 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd005'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '0601' LIMIT 1),
     'Consulting Partners',
     '2024-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2024, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.045", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '12 months',
     NOW()),

    -- Non-cumulative caps (leases 006-010)
    ('dddddddd-dddd-dddd-dddd-ddddddddd006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '0701' LIMIT 1),
     'Architecture Studio',
     '2023-02-01'::date,
     '2028-01-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.040", "cap_type": "non_cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '22 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd007'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '0801' LIMIT 1),
     'Engineering Firm',
     '2023-04-01'::date,
     '2028-03-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.052", "cap_type": "non_cumulative", "cap_rate": "0.06", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '20 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd008'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '0901' LIMIT 1),
     'Healthcare Advisors',
     '2023-06-01'::date,
     '2028-05-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.047", "cap_type": "non_cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '18 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd009'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '1001' LIMIT 1),
     'Real Estate Services',
     '2023-09-01'::date,
     '2028-08-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.043", "cap_type": "non_cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '15 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd010'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '1101' LIMIT 1),
     'Insurance Brokers',
     '2024-02-01'::date,
     '2029-01-31'::date,
     'active',
     '{"base_year": 2024, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.046", "cap_type": "non_cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '11 months',
     NOW()),

    -- Cumulative compounding caps (leases 011-013)
    ('dddddddd-dddd-dddd-dddd-ddddddddd011'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '1201' LIMIT 1),
     'Software Development Co',
     '2022-01-01'::date,
     '2027-12-31'::date,
     'active',
     '{"base_year": 2022, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.055", "cap_type": "cumulative_compounding", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '3 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd012'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '1301' LIMIT 1),
     'Media Production LLC',
     '2023-05-01'::date,
     '2028-04-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.041", "cap_type": "cumulative_compounding", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '19 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd013'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '1401' LIMIT 1),
     'Investment Advisors',
     '2023-10-01'::date,
     '2028-09-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.039", "cap_type": "cumulative_compounding", "cap_rate": "0.06", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '14 months',
     NOW()),

    -- No caps (leases 014-015)
    ('dddddddd-dddd-dddd-dddd-ddddddddd014'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '1501' LIMIT 1),
     'Accounting Services',
     '2023-08-01'::date,
     '2028-07-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.044", "cap_type": "none", "cap_rate": null, "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '16 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd015'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid AND unit_number = '1601' LIMIT 1),
     'Design Studio',
     '2024-03-01'::date,
     '2029-02-28'::date,
     'active',
     '{"base_year": 2024, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.037", "cap_type": "none", "cap_rate": null, "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '10 months',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Suburban Office Park Leases (10 total) - Acme Property Management
INSERT INTO leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at, updated_at)
VALUES
    ('dddddddd-dddd-dddd-dddd-ddddddddd016'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 101' LIMIT 1),
     'BioTech Research Inc',
     '2023-01-01'::date,
     '2028-12-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.062", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '2 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd017'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 102' LIMIT 1),
     'Data Analytics Corp',
     '2023-02-01'::date,
     '2028-01-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.058", "cap_type": "non_cumulative", "cap_rate": "0.06", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '22 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd018'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 103' LIMIT 1),
     'Cloud Solutions LLC',
     '2023-03-01'::date,
     '2028-02-28'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.055", "cap_type": "cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '21 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd019'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 104' LIMIT 1),
     'Cybersecurity Firm',
     '2023-04-01'::date,
     '2028-03-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.051", "cap_type": "cumulative_compounding", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '20 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd020'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 105' LIMIT 1),
     'AI Innovations',
     '2023-05-01'::date,
     '2028-04-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.048", "cap_type": "none", "cap_rate": null, "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '19 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd021'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 106' LIMIT 1),
     'Digital Marketing Agency',
     '2023-06-01'::date,
     '2028-05-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.053", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '18 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd022'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 107' LIMIT 1),
     'Management Consultants',
     '2023-07-01'::date,
     '2028-06-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.045", "cap_type": "non_cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '17 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd023'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 108' LIMIT 1),
     'Financial Planning Services',
     '2023-08-01'::date,
     '2028-07-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.050", "cap_type": "cumulative", "cap_rate": "0.06", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '16 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd024'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 109' LIMIT 1),
     'Legal Tech Startup',
     '2023-09-01'::date,
     '2028-08-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.042", "cap_type": "non_cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '15 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd025'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid AND unit_number = 'Suite 110' LIMIT 1),
     'HR Solutions Group',
     '2023-10-01'::date,
     '2028-09-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.046", "cap_type": "cumulative_compounding", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '14 months',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Retail Plaza Leases (8 total) - Beta Real Estate Holdings
-- These will be linked to tenant users for tenant portal testing
INSERT INTO leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at, updated_at)
VALUES
    ('dddddddd-dddd-dddd-dddd-ddddddddd026'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid AND unit_number = 'Store 1' LIMIT 1),
     'Sarah''s Retail Store #1',
     '2023-01-01'::date,
     '2028-12-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.082", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '1 year',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd027'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid AND unit_number = 'Store 2' LIMIT 1),
     'Mike''s Coffee Shop',
     '2023-02-01'::date,
     '2028-01-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.075", "cap_type": "non_cumulative", "cap_rate": "0.06", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '11 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd028'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid AND unit_number = 'Store 3' LIMIT 1),
     'Lisa''s Hair Salon',
     '2023-03-01'::date,
     '2028-02-28'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.068", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '10 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd029'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid AND unit_number = 'Store 4' LIMIT 1),
     'Sarah''s Retail Store #2',
     '2023-04-01'::date,
     '2028-03-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.090", "cap_type": "cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '9 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd030'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid AND unit_number = 'Store 5' LIMIT 1),
     'David''s Fitness Center',
     '2023-05-01'::date,
     '2028-04-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.12", "cap_type": "non_cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '8 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd031'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid AND unit_number = 'Store 6' LIMIT 1),
     'Pet Supply Store',
     '2023-06-01'::date,
     '2028-05-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.070", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '7 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd032'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid AND unit_number = 'Store 7' LIMIT 1),
     'Sarah''s Retail Store #3',
     '2023-07-01'::date,
     '2028-06-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.085", "cap_type": "cumulative_compounding", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '6 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd033'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid AND unit_number = 'Store 8' LIMIT 1),
     'Electronics Boutique',
     '2023-08-01'::date,
     '2028-07-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.073", "cap_type": "none", "cap_rate": null, "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 months',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Medical Office Building Leases (5 total) - Gamma Commercial Group
-- Edge case testing: large tenant, micro tenant, high caps, excluded pools
INSERT INTO leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at, updated_at)
VALUES
    ('dddddddd-dddd-dddd-dddd-ddddddddd034'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid AND unit_number = 'Suite 100' LIMIT 1),
     'Primary Care Center',
     '2023-01-01'::date,
     '2033-12-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.20", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '6 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd035'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid AND unit_number = 'Suite 200' LIMIT 1),
     'Specialty Clinic',
     '2023-02-01'::date,
     '2028-01-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.18", "cap_type": "non_cumulative", "cap_rate": "0.10", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd036'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid AND unit_number = 'Suite 300' LIMIT 1),
     'Dental Office',
     '2023-03-01'::date,
     '2028-02-28'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.16", "cap_type": "cumulative", "cap_rate": "0.08", "admin_fee_percentage": "0.15", "excluded_pools": ["insurance"]}'::jsonb,
     NOW() - INTERVAL '4 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd037'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid AND unit_number = 'Suite 400' LIMIT 1),
     'Physical Therapy',
     '2023-04-01'::date,
     '2028-03-31'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.15", "cap_type": "none", "cap_rate": null, "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '3 months',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd038'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid AND unit_number = 'Suite 500' LIMIT 1),
     'Radiology Services - Small',
     '2023-05-01'::date,
     '2028-04-30'::date,
     'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.005", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": ["operating"]}'::jsonb,
     NOW() - INTERVAL '2 months',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Class A Office Tower Leases (10 total) - Delta Development Corp
-- All started in 2019 for 6-year multi-year analysis testing
INSERT INTO leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at, updated_at)
VALUES
    ('dddddddd-dddd-dddd-dddd-ddddddddd039'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1001' LIMIT 1),
     'Fortune 500 Regional HQ',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.095", "cap_type": "cumulative", "cap_rate": "0.03", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd040'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1101' LIMIT 1),
     'Global Law Firm',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.088", "cap_type": "cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd041'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1201' LIMIT 1),
     'Investment Bank',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.092", "cap_type": "cumulative_compounding", "cap_rate": "0.03", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd042'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1301' LIMIT 1),
     'Tech Unicorn',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.098", "cap_type": "non_cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd043'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1401' LIMIT 1),
     'Consulting Giants',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.086", "cap_type": "cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd044'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1501' LIMIT 1),
     'Private Equity Fund',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.075", "cap_type": "cumulative", "cap_rate": "0.03", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd045'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1601' LIMIT 1),
     'Architecture Firm',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.082", "cap_type": "non_cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd046'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1701' LIMIT 1),
     'Accounting Firm',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.090", "cap_type": "cumulative_compounding", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd047'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1801' LIMIT 1),
     'Engineering Consultants',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.084", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('dddddddd-dddd-dddd-dddd-ddddddddd048'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     (SELECT id FROM units WHERE property_id = 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid AND unit_number = '1901' LIMIT 1),
     'Venture Capital',
     '2019-01-01'::date,
     '2029-12-31'::date,
     'active',
     '{"base_year": 2019, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.078", "cap_type": "none", "cap_rate": null, "admin_fee_percentage": "0.15", "excluded_pools": []}'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 48 leases across 5 properties';
    RAISE NOTICE '   - 15 Downtown Tower leases';
    RAISE NOTICE '   - 10 Suburban Office leases';
    RAISE NOTICE '   - 8 Retail Plaza leases (linked to tenant users)';
END $$;

-- ==============================================================================
-- SECTION 7: EXPENSE POOLS (27 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[7/23] Creating expense pools with parent/child hierarchy...';
END $$;

-- Standard 4 pools for Downtown Tower (Acme)
INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, parent_pool_id, created_at, updated_at)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee001'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'Operating Expenses',
     'operating',
     true,
     0.95,
     NULL,
     NOW() - INTERVAL '2 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee002'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'Real Estate Taxes',
     'tax',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '2 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee003'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'Insurance',
     'insurance',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '2 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee004'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'Capital Reserves',
     'capital',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '2 years',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Standard 4 pools for Suburban Office (Acme)
INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, parent_pool_id, created_at, updated_at)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee005'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     'Operating Expenses',
     'operating',
     true,
     0.95,
     NULL,
     NOW() - INTERVAL '2 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     'Real Estate Taxes',
     'tax',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '2 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee007'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     'Insurance',
     'insurance',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '2 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee008'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     'Capital Reserves',
     'capital',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '2 years',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Standard 4 pools for Retail Plaza (Beta)
INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, parent_pool_id, created_at, updated_at)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee009'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'Operating Expenses',
     'operating',
     true,
     0.92,
     NULL,
     NOW() - INTERVAL '1 year',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee010'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'Real Estate Taxes',
     'tax',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '1 year',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee011'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'Insurance',
     'insurance',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '1 year',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee012'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'Capital Reserves',
     'capital',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '1 year',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Standard 4 pools for Medical Office Building (Gamma)
INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, parent_pool_id, created_at, updated_at)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee013'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'Operating Expenses',
     'operating',
     true,
     0.90,
     NULL,
     NOW() - INTERVAL '6 months',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee014'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'Real Estate Taxes',
     'tax',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '6 months',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee015'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'Insurance',
     'insurance',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '6 months',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee016'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'Capital Reserves',
     'capital',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '6 months',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Class A Office Tower (Delta) - Parent/Child Hierarchy
-- Parent pool
INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, parent_pool_id, created_at, updated_at)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee017'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'Total Operating Expenses',
     'operating',
     true,
     0.95,
     NULL,
     NOW() - INTERVAL '5 years',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Child pools (reference parent)
INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, parent_pool_id, created_at, updated_at)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee018'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'Utilities',
     'operating',
     true,
     0.95,
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeee017'::uuid,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee019'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'Janitorial',
     'operating',
     true,
     0.95,
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeee017'::uuid,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee020'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'Security',
     'operating',
     true,
     0.95,
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeee017'::uuid,
     NOW() - INTERVAL '5 years',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Class A Tower - Other pools (non-operating)
INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, parent_pool_id, created_at, updated_at)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee021'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'Real Estate Taxes',
     'tax',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee022'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'Insurance',
     'insurance',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '5 years',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee023'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'Capital Reserves',
     'capital',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '5 years',
     NOW())
ON CONFLICT (id) DO NOTHING;

-- Standard 4 pools for Industrial Complex (Epsilon)
INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, parent_pool_id, created_at, updated_at)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee024'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'Operating Expenses',
     'operating',
     true,
     0.90,
     NULL,
     NOW() - INTERVAL '1 year',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee025'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'Real Estate Taxes',
     'tax',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '1 year',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee026'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'Insurance',
     'insurance',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '1 year',
     NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeee027'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'Capital Reserves',
     'capital',
     false,
     NULL,
     NULL,
     NOW() - INTERVAL '1 year',
     NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 27 expense pools';
    RAISE NOTICE '   - 20 standard pools (4 per property × 5)';
    RAISE NOTICE '   - 7 Class A Tower pools (1 parent + 3 children + 3 other)';
END $$;

-- ==============================================================================
-- SECTION 8: POOL MAPPINGS (74 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[8/23] Creating 74 pool mappings with GL account patterns...';
END $$;

-- Downtown Tower (Acme) - 12 mappings
INSERT INTO pool_mappings (id, expense_pool_id, gl_account_pattern, priority, created_at, updated_at)
VALUES
    -- Operating pool mappings
    ('ffffffff-ffff-ffff-ffff-ffffffffff01'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee001'::uuid, '5200%', 10, NOW(), NOW()),  -- Utilities
    ('ffffffff-ffff-ffff-ffff-ffffffffff02'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee001'::uuid, '5300%', 10, NOW(), NOW()),  -- Janitorial
    ('ffffffff-ffff-ffff-ffff-ffffffffff03'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee001'::uuid, '5500%', 10, NOW(), NOW()),  -- Security
    ('ffffffff-ffff-ffff-ffff-ffffffffff04'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee001'::uuid, '5700%', 10, NOW(), NOW()),  -- Professional
    -- Tax pool mappings
    ('ffffffff-ffff-ffff-ffff-ffffffffff05'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee002'::uuid, '5100%', 10, NOW(), NOW()),  -- Property Tax
    ('ffffffff-ffff-ffff-ffff-ffffffffff06'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee002'::uuid, '61%', 10, NOW(), NOW()),    -- Other Tax
    -- Insurance pool mappings
    ('ffffffff-ffff-ffff-ffff-ffffffffff07'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee003'::uuid, '5110%', 10, NOW(), NOW()),  -- Property Insurance
    ('ffffffff-ffff-ffff-ffff-ffffffffff08'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee003'::uuid, '5120%', 10, NOW(), NOW()),  -- Liability Insurance
    ('ffffffff-ffff-ffff-ffff-ffffffffff09'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee003'::uuid, '62%', 10, NOW(), NOW()),    -- Other Insurance
    -- Capital pool mappings
    ('ffffffff-ffff-ffff-ffff-ffffffffff10'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee004'::uuid, '7%', 10, NOW(), NOW()),     -- Capital Improvements
    ('ffffffff-ffff-ffff-ffff-ffffffffff11'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee004'::uuid, '70%', 10, NOW(), NOW()),    -- Capital Expenses
    ('ffffffff-ffff-ffff-ffff-ffffffffff12'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee004'::uuid, '71%', 10, NOW(), NOW())     -- Reserve Funding
ON CONFLICT (id) DO NOTHING;

-- Suburban Office (Acme) - 12 mappings
INSERT INTO pool_mappings (id, expense_pool_id, gl_account_pattern, priority, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffffff13'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee005'::uuid, '5200%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff14'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee005'::uuid, '5300%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff15'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee005'::uuid, '5500%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff16'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee005'::uuid, '5700%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff17'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee006'::uuid, '5100%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff18'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee006'::uuid, '61%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff19'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee007'::uuid, '5110%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff20'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee007'::uuid, '5120%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff21'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee007'::uuid, '62%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff22'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee008'::uuid, '7%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff23'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee008'::uuid, '70%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff24'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee008'::uuid, '71%', 10, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Retail Plaza (Beta) - 12 mappings
INSERT INTO pool_mappings (id, expense_pool_id, gl_account_pattern, priority, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffffff25'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee009'::uuid, '5200%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff26'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee009'::uuid, '5300%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff27'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee009'::uuid, '5500%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff28'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee009'::uuid, '5700%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff29'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee010'::uuid, '5100%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff30'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee010'::uuid, '61%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff31'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee011'::uuid, '5110%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff32'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee011'::uuid, '5120%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff33'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee011'::uuid, '62%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff34'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee012'::uuid, '7%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff35'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee012'::uuid, '70%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff36'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee012'::uuid, '71%', 10, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Medical Building (Gamma) - 12 mappings
INSERT INTO pool_mappings (id, expense_pool_id, gl_account_pattern, priority, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffffff37'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee013'::uuid, '5200%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff38'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee013'::uuid, '5300%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff39'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee013'::uuid, '5500%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff40'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee013'::uuid, '5700%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff41'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee014'::uuid, '5100%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff42'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee014'::uuid, '61%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff43'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee015'::uuid, '5110%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff44'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee015'::uuid, '5120%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff45'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee015'::uuid, '62%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff46'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee016'::uuid, '7%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff47'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee016'::uuid, '70%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff48'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee016'::uuid, '71%', 10, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Class A Tower (Delta) - 14 mappings with hierarchy (higher priority for child pools)
INSERT INTO pool_mappings (id, expense_pool_id, gl_account_pattern, priority, created_at, updated_at)
VALUES
    -- Child pool mappings (higher priority)
    ('ffffffff-ffff-ffff-ffff-ffffffffff49'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee018'::uuid, '5200%', 15, NOW(), NOW()),  -- Utilities child
    ('ffffffff-ffff-ffff-ffff-ffffffffff50'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee019'::uuid, '5300%', 15, NOW(), NOW()),  -- Janitorial child
    ('ffffffff-ffff-ffff-ffff-ffffffffff51'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee020'::uuid, '5500%', 15, NOW(), NOW()),  -- Security child
    -- Parent pool mappings (lower priority, catches remaining operating)
    ('ffffffff-ffff-ffff-ffff-ffffffffff52'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee017'::uuid, '5700%', 0, NOW(), NOW()),   -- Parent: Professional
    ('ffffffff-ffff-ffff-ffff-ffffffffff53'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee017'::uuid, '5%', 0, NOW(), NOW()),     -- Parent: Other Operating
    -- Tax pool mappings
    ('ffffffff-ffff-ffff-ffff-ffffffffff54'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee021'::uuid, '5100%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff55'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee021'::uuid, '61%', 10, NOW(), NOW()),
    -- Insurance pool mappings
    ('ffffffff-ffff-ffff-ffff-ffffffffff56'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee022'::uuid, '5110%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff57'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee022'::uuid, '5120%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff58'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee022'::uuid, '62%', 10, NOW(), NOW()),
    -- Capital pool mappings
    ('ffffffff-ffff-ffff-ffff-ffffffffff59'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee023'::uuid, '7%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff60'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee023'::uuid, '70%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff61'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee023'::uuid, '71%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff74'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee023'::uuid, '72%', 10, NOW(), NOW())   -- Additional capital reserve
ON CONFLICT (id) DO NOTHING;

-- Industrial Complex (Epsilon) - 12 mappings
INSERT INTO pool_mappings (id, expense_pool_id, gl_account_pattern, priority, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffffff62'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee024'::uuid, '5200%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff63'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee024'::uuid, '5300%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff64'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee024'::uuid, '5500%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff65'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee024'::uuid, '5700%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff66'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee025'::uuid, '5100%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff67'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee025'::uuid, '61%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff68'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee026'::uuid, '5110%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff69'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee026'::uuid, '5120%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff70'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee026'::uuid, '62%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff71'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee027'::uuid, '7%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff72'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee027'::uuid, '70%', 10, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffff73'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee027'::uuid, '71%', 10, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 74 pool mappings';
    RAISE NOTICE '   - 60 standard mappings (12 per property × 5)';
    RAISE NOTICE '   - 14 Class A Tower mappings (priority-based hierarchy)';
END $$;

-- ==============================================================================
-- SECTION 9: POOL ALLOCATIONS (2 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[9/23] Creating 2 pool allocations for split distributions...';
END $$;

-- Class A Tower child pools split expenses to parent pool
INSERT INTO pool_allocations (id, source_pool_id, target_pool_id, allocation_type, allocation_value, created_at, updated_at)
VALUES
    -- Utilities child sends 40% to parent (Total Operating Expenses)
    ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a10001'::uuid,
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeee018'::uuid,  -- Utilities child
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeee017'::uuid,  -- Parent: Total Operating Expenses
     'percentage',
     40.00,  -- 40% goes to parent, 60% stays in Utilities
     NOW() - INTERVAL '5 years',
     NOW()),
    -- Janitorial child sends 30% to parent
    ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a10002'::uuid,
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeee019'::uuid,  -- Janitorial child
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeee017'::uuid,  -- Parent: Total Operating Expenses
     'percentage',
     30.00,  -- 30% goes to parent, 70% stays in Janitorial
     NOW() - INTERVAL '5 years',
     NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 2 pool allocations';
    RAISE NOTICE '   - Utilities to Parent (40 percent)';
    RAISE NOTICE '   - Janitorial to Parent (30 percent)';
END $$;

-- ==============================================================================
-- SECTION 10: IMPORT BATCHES (6 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[10/23] Creating 6 import batches for GL data...';
END $$;

-- Import batches for each property linking to CSV files
INSERT INTO import_batches (id, organization_id, property_id, file_name, file_hash, source_system, status, row_count, error_count, error_log, created_at, updated_at)
VALUES
    -- Downtown Tower (Acme) - 2022-2024 GL data
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'yardi_gl_downtown_tower_2022_2024.csv',
     'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
     'yardi',
     'completed',
     285,
     0,
     '[]'::jsonb,
     NOW() - INTERVAL '2 years',
     NOW() - INTERVAL '2 years'),

    -- Suburban Office (Acme) - 2022-2024 GL data
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     'yardi_gl_suburban_office_2022_2024.csv',
     'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
     'yardi',
     'completed',
     285,
     0,
     '[]'::jsonb,
     NOW() - INTERVAL '2 years',
     NOW() - INTERVAL '2 years'),

    -- Retail Plaza (Beta) - 2023-2024 GL data
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'yardi_gl_retail_plaza_2023_2024.csv',
     'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
     'yardi',
     'completed',
     190,
     0,
     '[]'::jsonb,
     NOW() - INTERVAL '1 year',
     NOW() - INTERVAL '1 year'),

    -- Medical Building (Gamma) - 2023-2024 GL data
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'yardi_gl_medical_building_2023_2024.csv',
     'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
     'yardi',
     'completed',
     190,
     0,
     '[]'::jsonb,
     NOW() - INTERVAL '1 year',
     NOW() - INTERVAL '1 year'),

    -- Class A Tower (Delta) - 2019-2024 GL data (6 years)
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'yardi_gl_class_a_tower_2019_2024.csv',
     'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
     'yardi',
     'completed',
     437,
     0,
     '[]'::jsonb,
     NOW() - INTERVAL '5 years',
     NOW() - INTERVAL '5 years'),

    -- Industrial Complex (Epsilon) - 2023-2024 GL data
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'yardi_gl_industrial_complex_2023_2024.csv',
     'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
     'yardi',
     'completed',
     95,
     0,
     '[]'::jsonb,
     NOW() - INTERVAL '1 year',
     NOW() - INTERVAL '1 year')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 6 import batches';
    RAISE NOTICE '   - Total rows imported: 1,482';
    RAISE NOTICE '   - All batches completed successfully';
END $$;

-- ==============================================================================
-- SECTION 11: GL ENTRIES (Representative Sample - 90 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[11/23] Creating representative GL entries for reconciliation testing...';
END $$;

-- Downtown Tower GL Entries (15 entries covering all pools)
INSERT INTO gl_entries (import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, created_at)
VALUES
    -- Operating Expenses
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5200', 'Electric Service', 12500.00, '2024-01-15', 2024, 1, 'City Power & Light', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5210', 'Gas Service', 3200.50, '2024-01-20', 2024, 1, 'Metro Gas Company', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5300', 'Janitorial Services', 8500.00, '2024-02-01', 2024, 2, 'CleanPro Services', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5500', 'Security Services', 6750.00, '2024-02-15', 2024, 2, 'SecureGuard Inc', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5700', 'Legal Fees', 4200.00, '2024-03-10', 2024, 3, 'Smith & Associates', NOW() - INTERVAL '4 months'),
    -- Tax
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5100', 'Property Tax', 45000.00, '2024-01-05', 2024, 1, 'County Tax Assessor', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '6100', 'Real Estate Tax', 22500.00, '2024-04-01', 2024, 4, 'City Tax Collector', NOW() - INTERVAL '3 months'),
    -- Insurance
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5110', 'Property Insurance', 18500.00, '2024-01-01', 2024, 1, 'National Insurance Co', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '5120', 'Liability Insurance', 9200.00, '2024-01-01', 2024, 1, 'Acme Insurance Group', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '6200', 'General Liability', 5500.00, '2024-02-01', 2024, 2, 'SafeGuard Insurance', NOW() - INTERVAL '5 months'),
    -- Capital
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7000', 'HVAC Replacement', 125000.00, '2024-03-15', 2024, 3, 'CoolAir Systems', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7010', 'Elevator Modernization', 85000.00, '2024-04-20', 2024, 4, 'Otis Elevator', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7100', 'Roof Repairs', 32000.00, '2024-05-10', 2024, 5, 'RoofPro Contractors', NOW() - INTERVAL '2 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7150', 'Parking Lot Resurfacing', 28500.00, '2024-06-05', 2024, 6, 'Pave Masters LLC', NOW() - INTERVAL '1 month'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10001'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid, '7200', 'Capital Reserve Fund', 15000.00, '2024-06-30', 2024, 6, 'Reserve Transfer', NOW() - INTERVAL '1 month')
ON CONFLICT DO NOTHING;

-- Suburban Office GL Entries (15 entries)
INSERT INTO gl_entries (import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, created_at)
VALUES
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '5200', 'Electric Service', 9800.00, '2024-01-15', 2024, 1, 'Suburban Electric', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '5210', 'Water Service', 2100.00, '2024-01-20', 2024, 1, 'County Water District', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '5300', 'Janitorial Services', 6200.00, '2024-02-01', 2024, 2, 'Office Clean Co', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '5500', 'Security Services', 4500.00, '2024-02-15', 2024, 2, 'SafeWatch Security', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '5700', 'Property Management', 5800.00, '2024-03-01', 2024, 3, 'Acme Property Mgmt', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '5100', 'Property Tax', 32000.00, '2024-01-05', 2024, 1, 'County Tax Office', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '6100', 'City Tax', 16000.00, '2024-04-01', 2024, 4, 'City Treasurer', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '5110', 'Building Insurance', 14200.00, '2024-01-01', 2024, 1, 'State Farm Insurance', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '5120', 'Liability Coverage', 7100.00, '2024-01-01', 2024, 1, 'Liberty Mutual', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '6200', 'Workers Comp', 4200.00, '2024-02-01', 2024, 2, 'WC Insurance Co', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '7000', 'Carpet Replacement', 42000.00, '2024-03-20', 2024, 3, 'FloorCare Plus', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '7010', 'Lighting Upgrade', 28000.00, '2024-04-10', 2024, 4, 'Bright Solutions', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '7100', 'Landscaping Upgrade', 18500.00, '2024-05-15', 2024, 5, 'GreenScape Design', NOW() - INTERVAL '2 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '7150', 'Signage Replacement', 12000.00, '2024-06-01', 2024, 6, 'SignWorks Inc', NOW() - INTERVAL '1 month'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10002'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid, '7200', 'Reserve Contribution', 10000.00, '2024-06-30', 2024, 6, 'Reserve Transfer', NOW() - INTERVAL '1 month')
ON CONFLICT DO NOTHING;

-- Retail Plaza GL Entries (15 entries)
INSERT INTO gl_entries (import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, created_at)
VALUES
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '5200', 'Electric Service', 15200.00, '2024-01-15', 2024, 1, 'City Electric', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '5210', 'HVAC Maintenance', 4800.00, '2024-01-25', 2024, 1, 'CoolBreeze Services', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '5300', 'Common Area Cleaning', 7500.00, '2024-02-01', 2024, 2, 'Retail Clean Pro', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '5500', 'Security Guards', 8200.00, '2024-02-15', 2024, 2, 'Mall Security Inc', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '5700', 'Marketing Services', 6500.00, '2024-03-01', 2024, 3, 'Retail Marketing Co', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '5100', 'Property Tax', 38000.00, '2024-01-05', 2024, 1, 'County Tax Collector', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '6100', 'Special Assessment', 19000.00, '2024-04-01', 2024, 4, 'City Finance Dept', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '5110', 'Property Insurance', 16800.00, '2024-01-01', 2024, 1, 'Commercial Insurance', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '5120', 'Liability Insurance', 8900.00, '2024-01-01', 2024, 1, 'Retail Insurance Co', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '6200', 'Flood Insurance', 5200.00, '2024-02-01', 2024, 2, 'FloodSafe Insurance', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '7000', 'Parking Lot Expansion', 95000.00, '2024-03-10', 2024, 3, 'Asphalt Solutions', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '7010', 'Storefront Renovation', 68000.00, '2024-04-15', 2024, 4, 'Retail Builders Inc', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '7100', 'New Signage', 22000.00, '2024-05-20', 2024, 5, 'Neon Signs LLC', NOW() - INTERVAL '2 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '7150', 'Landscaping Improvement', 14500.00, '2024-06-10', 2024, 6, 'Garden Masters', NOW() - INTERVAL '1 month'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10003'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid, '7200', 'Capital Reserve', 12000.00, '2024-06-30', 2024, 6, 'Reserve Allocation', NOW() - INTERVAL '1 month')
ON CONFLICT DO NOTHING;

-- Medical Building, Class A Tower, and Industrial Complex entries (45 more)
-- Adding 15 entries each for remaining 3 properties
INSERT INTO gl_entries (import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, created_at)
VALUES
    -- Medical Building (15 entries)
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '5200', 'Electric', 8500.00, '2024-01-15', 2024, 1, 'Power Company', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '5300', 'Janitorial', 5200.00, '2024-02-01', 2024, 2, 'MedClean Services', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '5500', 'Security', 3800.00, '2024-02-15', 2024, 2, 'Healthcare Security', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '5700', 'Professional', 4200.00, '2024-03-01', 2024, 3, 'Med Consultants', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '5100', 'Tax', 28000.00, '2024-01-05', 2024, 1, 'County Tax', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '6100', 'City Tax', 14000.00, '2024-04-01', 2024, 4, 'City Tax', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '5110', 'Insurance', 12500.00, '2024-01-01', 2024, 1, 'Medical Insurance', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '5120', 'Liability', 6200.00, '2024-01-01', 2024, 1, 'Liability Co', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '6200', 'Malpractice', 8500.00, '2024-02-01', 2024, 2, 'Med Liability', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '7000', 'MRI Equipment', 185000.00, '2024-03-15', 2024, 3, 'Medical Systems', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '7010', 'Exam Room Upgrade', 42000.00, '2024-04-20', 2024, 4, 'Med Builders', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '7100', 'HVAC Upgrade', 28000.00, '2024-05-10', 2024, 5, 'Climate Control', NOW() - INTERVAL '2 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '7150', 'Parking Upgrade', 18500.00, '2024-06-05', 2024, 6, 'Paving Co', NOW() - INTERVAL '1 month'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '7200', 'Reserve', 10000.00, '2024-06-30', 2024, 6, 'Reserve', NOW() - INTERVAL '1 month'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10004'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid, '5210', 'Water', 1800.00, '2024-01-20', 2024, 1, 'Water District', NOW() - INTERVAL '6 months'),

    -- Class A Tower (15 entries with hierarchy - utilities/janitorial to parent)
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '5200', 'Electric', 22000.00, '2024-01-15', 2024, 1, 'Metro Electric', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '5210', 'Gas', 6500.00, '2024-01-20', 2024, 1, 'Gas Company', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '5300', 'Janitorial', 12000.00, '2024-02-01', 2024, 2, 'Premium Clean', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '5500', 'Security', 9500.00, '2024-02-15', 2024, 2, 'Elite Security', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '5700', 'Management', 8200.00, '2024-03-01', 2024, 3, 'Delta Mgmt', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '5100', 'Property Tax', 85000.00, '2024-01-05', 2024, 1, 'County Tax', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '6100', 'City Tax', 42500.00, '2024-04-01', 2024, 4, 'City Tax', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '5110', 'Insurance', 32000.00, '2024-01-01', 2024, 1, 'Tower Insurance', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '5120', 'Liability', 15000.00, '2024-01-01', 2024, 1, 'Liability Plus', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '6200', 'General', 9500.00, '2024-02-01', 2024, 2, 'Gen Insurance', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '7000', 'Elevator Replace', 250000.00, '2024-03-10', 2024, 3, 'Otis Elevators', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '7010', 'Lobby Renovation', 125000.00, '2024-04-15', 2024, 4, 'Interior Design Co', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '7100', 'Window Replacement', 85000.00, '2024-05-20', 2024, 5, 'Glass Systems', NOW() - INTERVAL '2 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '7150', 'HVAC Modernize', 65000.00, '2024-06-10', 2024, 6, 'Climate Tech', NOW() - INTERVAL '1 month'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10005'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid, '7200', 'Reserve Fund', 25000.00, '2024-06-30', 2024, 6, 'Reserve', NOW() - INTERVAL '1 month'),

    -- Industrial Complex (15 entries)
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '5200', 'Electric', 18500.00, '2024-01-15', 2024, 1, 'Industrial Power', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '5210', 'Gas', 5200.00, '2024-01-20', 2024, 1, 'Gas Utility', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '5300', 'Janitorial', 4800.00, '2024-02-01', 2024, 2, 'Warehouse Clean', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '5500', 'Security', 6200.00, '2024-02-15', 2024, 2, 'Warehouse Security', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '5700', 'Management', 5500.00, '2024-03-01', 2024, 3, 'Epsilon Mgmt', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '5100', 'Property Tax', 42000.00, '2024-01-05', 2024, 1, 'County Tax', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '6100', 'Tax', 21000.00, '2024-04-01', 2024, 4, 'City Tax', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '5110', 'Insurance', 22000.00, '2024-01-01', 2024, 1, 'Industrial Insurance', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '5120', 'Liability', 11000.00, '2024-01-01', 2024, 1, 'Commercial Liability', NOW() - INTERVAL '6 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '6200', 'Workers Comp', 8500.00, '2024-02-01', 2024, 2, 'WC Insurance', NOW() - INTERVAL '5 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '7000', 'Dock Doors', 95000.00, '2024-03-10', 2024, 3, 'Loading Systems', NOW() - INTERVAL '4 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '7010', 'Forklift Purchase', 45000.00, '2024-04-15', 2024, 4, 'Equipment Co', NOW() - INTERVAL '3 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '7100', 'Roof Repair', 38000.00, '2024-05-20', 2024, 5, 'Industrial Roofing', NOW() - INTERVAL '2 months'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '7150', 'Yard Resurfacing', 28000.00, '2024-06-10', 2024, 6, 'Asphalt Co', NOW() - INTERVAL '1 month'),
    ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b10006'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid, '7200', 'Reserve', 15000.00, '2024-06-30', 2024, 6, 'Reserve Transfer', NOW() - INTERVAL '1 month')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 90 representative GL entries';
    RAISE NOTICE '   - Covers all expense pool mappings';
    RAISE NOTICE '   - Spans 6 months (Jan-Jun 2024)';
END $$;

-- ==============================================================================
-- SECTION 12: RECONCILIATION SNAPSHOTS (Representative Sample - 30 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[12/23] Creating reconciliation snapshots for testing calculations...';
END $$;

-- Downtown Tower (Acme) - 5 snapshots (mix of finalized and draft)
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    calculation_trace, finalized_at, finalized_by_user_id, created_at, updated_at
)
VALUES
    -- Lease 1: Finalized 2024 reconciliation with cap applied
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10001'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd001'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     150000.00, 161290.32, 7250.00,
     8064.52, 7612.50, 1141.88, 8754.38,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "description": "Retrieved all operating pool expenses for 2024", "outputs": {"total_expenses": "150000.00", "pool_name": "Operating Expenses"}},
       {"step": 2, "name": "Gross-Up Calculation", "description": "Adjusted expenses for occupancy variance", "calculation": "150000.00 * 1.0752688 = 161290.32", "outputs": {"gross_up_factor": "1.0752688", "grossed_total": "161290.32"}},
       {"step": 3, "name": "Tenant Share Calculation", "description": "Applied pro-rata share from lease", "calculation": "161290.32 * 0.05 = 8064.52", "outputs": {"pro_rata_share": "0.05", "tenant_share_before_cap": "8064.52"}},
       {"step": 4, "name": "Base Year Deduction", "description": "Subtracted base year amount", "calculation": "8064.52 - 7250.00 = 814.52", "outputs": {"base_year_amount": "7250.00", "excess_over_base": "814.52"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "Applied 5% cumulative cap", "calculation": "Prior year: 7250.00, Cap: 7250.00 * 1.05 = 7612.50, Actual: 8064.52, Capped to: 7612.50", "outputs": {"was_capped": true, "cap_type": "cumulative", "cap_rate": "0.05", "tenant_share_after_cap": "7612.50"}},
       {"step": 6, "name": "Admin Fee", "description": "Applied 15% administrative fee", "calculation": "7612.50 * 0.15 = 1141.88", "outputs": {"admin_fee_percentage": "0.15", "admin_fee": "1141.88"}},
       {"step": 7, "name": "Total Recovery", "description": "Final billable amount to tenant", "outputs": {"total_recovery": "8754.38"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 month',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'::uuid,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '1 month'),

    -- Lease 2: Draft 2024 reconciliation (not yet finalized)
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10002'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd002'::uuid,
     '2024-01-01', '2024-12-31', 'draft',
     150000.00, 161290.32, 0.00,
     4838.71, 4838.71, 725.81, 5564.52,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "150000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "150000.00 * 1.0752688 = 161290.32", "outputs": {"grossed_total": "161290.32"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "161290.32 * 0.03 = 4838.71", "outputs": {"tenant_share_before_cap": "4838.71"}},
       {"step": 4, "name": "Base Year Deduction", "description": "No base year for this lease", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "Non-cumulative cap not applicable for first year", "outputs": {"was_capped": false, "tenant_share_after_cap": "4838.71"}},
       {"step": 6, "name": "Admin Fee", "calculation": "4838.71 * 0.15 = 725.81", "outputs": {"admin_fee": "725.81"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "5564.52"}}
     ]'::jsonb,
     NULL,
     NULL,
     NOW() - INTERVAL '1 week',
     NOW() - INTERVAL '1 week'),

    -- Lease 3: Finalized 2023 reconciliation
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10003'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd003'::uuid,
     '2023-01-01', '2023-12-31', 'finalized',
     140000.00, 151351.35, 0.00,
     6054.05, 6054.05, 908.11, 6962.16,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "140000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "140000.00 * 1.0810811 = 151351.35", "outputs": {"grossed_total": "151351.35"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "151351.35 * 0.04 = 6054.05", "outputs": {"tenant_share_before_cap": "6054.05"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "Cumulative compounding cap not triggered", "outputs": {"was_capped": false, "tenant_share_after_cap": "6054.05"}},
       {"step": 6, "name": "Admin Fee", "calculation": "6054.05 * 0.15 = 908.11", "outputs": {"admin_fee": "908.11"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "6962.16"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 year',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'::uuid,
     NOW() - INTERVAL '14 months',
     NOW() - INTERVAL '1 year'),

    -- Lease 10: No cap (unlimited recovery)
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10004'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd010'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     150000.00, 161290.32, 6500.00,
     9677.42, 9677.42, 1451.61, 11129.03,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "150000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "150000.00 * 1.0752688 = 161290.32", "outputs": {"grossed_total": "161290.32"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "161290.32 * 0.10 = 16129.03", "outputs": {"tenant_share_before_cap": "16129.03"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "16129.03 - 6500.00 = 9629.03", "outputs": {"excess_over_base": "9629.03"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "No cap - unlimited recovery", "outputs": {"was_capped": false, "cap_type": "none", "tenant_share_after_cap": "9677.42"}},
       {"step": 6, "name": "Admin Fee", "calculation": "9677.42 * 0.15 = 1451.61", "outputs": {"admin_fee": "1451.61"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "11129.03"}}
     ]'::jsonb,
     NOW() - INTERVAL '2 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'::uuid,
     NOW() - INTERVAL '1 month',
     NOW() - INTERVAL '2 weeks'),

    -- Lease 15: High cap rate (10%)
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10005'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd015'::uuid,
     '2024-01-01', '2024-12-31', 'draft',
     150000.00, 161290.32, 7800.00,
     8064.52, 8064.52, 1209.68, 9274.20,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "150000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "150000.00 * 1.0752688 = 161290.32", "outputs": {"grossed_total": "161290.32"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "161290.32 * 0.05 = 8064.52", "outputs": {"tenant_share_before_cap": "8064.52"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "8064.52 - 7800.00 = 264.52", "outputs": {"excess_over_base": "264.52"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "10% cap not triggered (8064.52 < 8580.00)", "calculation": "Cap allows: 7800.00 * 1.10 = 8580.00", "outputs": {"was_capped": false, "cap_rate": "0.10", "tenant_share_after_cap": "8064.52"}},
       {"step": 6, "name": "Admin Fee", "calculation": "8064.52 * 0.15 = 1209.68", "outputs": {"admin_fee": "1209.68"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "9274.20"}}
     ]'::jsonb,
     NULL,
     NULL,
     NOW() - INTERVAL '3 days',
     NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- Suburban Office (Acme) - 3 snapshots
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    calculation_trace, finalized_at, finalized_by_user_id, created_at, updated_at
)
VALUES
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd016'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     125000.00, 134408.60, 6100.00,
     6720.43, 6405.00, 960.75, 7365.75,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "125000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "125000.00 * 1.0752688 = 134408.60", "outputs": {"grossed_total": "134408.60"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "134408.60 * 0.05 = 6720.43", "outputs": {"tenant_share_before_cap": "6720.43"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "6720.43 - 6100.00 = 620.43", "outputs": {"excess_over_base": "620.43"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "Cumulative cap applied", "calculation": "Cap: 6100.00 * 1.05 = 6405.00", "outputs": {"was_capped": true, "tenant_share_after_cap": "6405.00"}},
       {"step": 6, "name": "Admin Fee", "calculation": "6405.00 * 0.15 = 960.75", "outputs": {"admin_fee": "960.75"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "7365.75"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 month',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002'::uuid,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '1 month'),

    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10007'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd017'::uuid,
     '2024-01-01', '2024-12-31', 'draft',
     125000.00, 134408.60, 0.00,
     4032.26, 4032.26, 604.84, 4637.10,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "125000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "134408.60"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "134408.60 * 0.03 = 4032.26", "outputs": {"tenant_share_before_cap": "4032.26"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "4032.26"}},
       {"step": 6, "name": "Admin Fee", "calculation": "4032.26 * 0.15 = 604.84", "outputs": {"admin_fee": "604.84"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "4637.10"}}
     ]'::jsonb,
     NULL,
     NULL,
     NOW() - INTERVAL '5 days',
     NOW() - INTERVAL '5 days'),

    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10008'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd025'::uuid,
     '2023-01-01', '2023-12-31', 'finalized',
     118000.00, 126881.72, 0.00,
     7613.08, 7613.08, 1141.96, 8755.04,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "118000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "126881.72"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "126881.72 * 0.0600014 = 7613.08", "outputs": {"tenant_share_before_cap": "7613.08"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "7613.08"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "1141.96"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "8755.04"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 year',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002'::uuid,
     NOW() - INTERVAL '14 months',
     NOW() - INTERVAL '1 year')
ON CONFLICT (id) DO NOTHING;

-- Retail Plaza (Beta) - 4 snapshots (linked to tenant users)
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    calculation_trace, finalized_at, finalized_by_user_id, created_at, updated_at
)
VALUES
    -- Sarah's Store 1
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10009'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd026'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     95000.00, 102150.54, 4800.00,
     5107.53, 5040.00, 756.00, 5796.00,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "95000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "95000.00 * 1.0752688 = 102150.54", "outputs": {"grossed_total": "102150.54"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "102150.54 * 0.05 = 5107.53", "outputs": {"tenant_share_before_cap": "5107.53"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "5107.53 - 4800.00 = 307.53", "outputs": {"excess_over_base": "307.53"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "5% cumulative cap applied", "calculation": "Cap: 4800.00 * 1.05 = 5040.00", "outputs": {"was_capped": true, "tenant_share_after_cap": "5040.00"}},
       {"step": 6, "name": "Admin Fee", "calculation": "5040.00 * 0.15 = 756.00", "outputs": {"admin_fee": "756.00"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "5796.00"}}
     ]'::jsonb,
     NOW() - INTERVAL '2 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NOW() - INTERVAL '1 month',
     NOW() - INTERVAL '2 weeks'),

    -- Mike's Coffee Shop
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10010'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd027'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     95000.00, 102150.54, 0.00,
     3064.52, 3064.52, 459.68, 3524.20,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "95000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "102150.54"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "102150.54 * 0.03 = 3064.52", "outputs": {"tenant_share_before_cap": "3064.52"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "3064.52"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "459.68"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "3524.20"}}
     ]'::jsonb,
     NOW() - INTERVAL '2 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NOW() - INTERVAL '1 month',
     NOW() - INTERVAL '2 weeks'),

    -- Lisa's Salon
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10011'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd028'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     95000.00, 102150.54, 4200.00,
     4086.02, 4086.02, 612.90, 4698.92,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "95000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "102150.54"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "102150.54 * 0.04 = 4086.02", "outputs": {"tenant_share_before_cap": "4086.02"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "4086.02 - 4200.00 = -113.98 (no recovery this year)", "outputs": {"excess_over_base": "-113.98"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "Below base year - no recovery", "outputs": {"was_capped": false, "tenant_share_after_cap": "4086.02"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "612.90"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "4698.92"}}
     ]'::jsonb,
     NOW() - INTERVAL '2 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NOW() - INTERVAL '1 month',
     NOW() - INTERVAL '2 weeks'),

    -- David's Gym
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10012'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd030'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     95000.00, 102150.54, 0.00,
     10215.05, 10215.05, 1532.26, 11747.31,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "95000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "102150.54"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "102150.54 * 0.10 = 10215.05", "outputs": {"tenant_share_before_cap": "10215.05"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "10215.05"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "1532.26"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "11747.31"}}
     ]'::jsonb,
     NOW() - INTERVAL '2 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NOW() - INTERVAL '1 month',
     NOW() - INTERVAL '2 weeks')
ON CONFLICT (id) DO NOTHING;

-- Medical Building (Gamma) - 4 snapshots with edge cases
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    calculation_trace, finalized_at, finalized_by_user_id, created_at, updated_at
)
VALUES
    -- 100% floor tenant (20% pro-rata share)
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10013'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd034'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     110000.00, 116129.03, 22000.00,
     23225.81, 23225.81, 3483.87, 26709.68,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "110000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "110000.00 * 1.05571845 = 116129.03", "outputs": {"grossed_total": "116129.03"}},
       {"step": 3, "name": "Tenant Share Calculation", "description": "Entire floor tenant", "calculation": "116129.03 * 0.20 = 23225.81", "outputs": {"pro_rata_share": "0.20", "tenant_share_before_cap": "23225.81"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "23225.81 - 22000.00 = 1225.81", "outputs": {"excess_over_base": "1225.81"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "No cap on this lease", "outputs": {"was_capped": false, "tenant_share_after_cap": "23225.81"}},
       {"step": 6, "name": "Admin Fee", "calculation": "23225.81 * 0.15 = 3483.87", "outputs": {"admin_fee": "3483.87"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "26709.68"}}
     ]'::jsonb,
     NOW() - INTERVAL '3 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004'::uuid,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '3 weeks'),

    -- Micro-tenant (0.5% pro-rata share)
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10014'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd035'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     110000.00, 116129.03, 0.00,
     580.65, 580.65, 87.10, 667.75,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "110000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "116129.03"}},
       {"step": 3, "name": "Tenant Share Calculation", "description": "Very small tenant", "calculation": "116129.03 * 0.005 = 580.65", "outputs": {"pro_rata_share": "0.005", "tenant_share_before_cap": "580.65"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "580.65"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "87.10"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "667.75"}}
     ]'::jsonb,
     NOW() - INTERVAL '3 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004'::uuid,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '3 weeks'),

    -- High cap rate (10%)
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10015'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd036'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     110000.00, 116129.03, 5500.00,
     5806.45, 5806.45, 870.97, 6677.42,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "110000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "116129.03"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "116129.03 * 0.05 = 5806.45", "outputs": {"tenant_share_before_cap": "5806.45"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "5806.45 - 5500.00 = 306.45", "outputs": {"excess_over_base": "306.45"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "10% cap not triggered (5806.45 < 6050.00)", "calculation": "Cap allows: 5500.00 * 1.10 = 6050.00", "outputs": {"was_capped": false, "cap_rate": "0.10", "tenant_share_after_cap": "5806.45"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "870.97"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "6677.42"}}
     ]'::jsonb,
     NOW() - INTERVAL '3 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004'::uuid,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '3 weeks'),

    -- Excluded pools (operating and insurance excluded)
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10016'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd037'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     45000.00, 45000.00, 0.00,
     2250.00, 2250.00, 337.50, 2587.50,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "description": "Only tax pool (operating and insurance excluded)", "outputs": {"total_expenses": "45000.00", "excluded_pools": ["operating", "insurance"]}},
       {"step": 2, "name": "Gross-Up Calculation", "description": "No gross-up for tax pool", "outputs": {"grossed_total": "45000.00"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "45000.00 * 0.05 = 2250.00", "outputs": {"tenant_share_before_cap": "2250.00"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "2250.00"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "337.50"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "2587.50"}}
     ]'::jsonb,
     NOW() - INTERVAL '3 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb004'::uuid,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '3 weeks')
ON CONFLICT (id) DO NOTHING;

-- Class A Tower (Delta) - 6 snapshots (2 leases × 3 years each)
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    calculation_trace, finalized_at, finalized_by_user_id, created_at, updated_at
)
VALUES
    -- Lease 38 - 2022
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10017'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd038'::uuid,
     '2022-01-01', '2022-12-31', 'finalized',
     180000.00, 194086.02, 9000.00,
     9704.30, 9450.00, 1417.50, 10867.50,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "180000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "180000.00 * 1.07825567 = 194086.02", "outputs": {"grossed_total": "194086.02"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "194086.02 * 0.05 = 9704.30", "outputs": {"tenant_share_before_cap": "9704.30"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "9704.30 - 9000.00 = 704.30", "outputs": {"excess_over_base": "704.30"}},
       {"step": 5, "name": "Apply Expense Cap", "description": "Cumulative cap applied", "calculation": "Cap: 9000.00 * 1.05 = 9450.00", "outputs": {"was_capped": true, "tenant_share_after_cap": "9450.00"}},
       {"step": 6, "name": "Admin Fee", "calculation": "9450.00 * 0.15 = 1417.50", "outputs": {"admin_fee": "1417.50"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "10867.50"}}
     ]'::jsonb,
     NOW() - INTERVAL '2 years',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005'::uuid,
     NOW() - INTERVAL '26 months',
     NOW() - INTERVAL '2 years'),

    -- Lease 38 - 2023
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10018'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd038'::uuid,
     '2023-01-01', '2023-12-31', 'finalized',
     185000.00, 199462.37, 9000.00,
     9973.12, 9922.50, 1488.38, 11410.88,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "185000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "199462.37"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "199462.37 * 0.05 = 9973.12", "outputs": {"tenant_share_before_cap": "9973.12"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "9973.12 - 9000.00 = 973.12", "outputs": {"excess_over_base": "973.12"}},
       {"step": 5, "name": "Apply Expense Cap", "calculation": "Prior: 9450.00, Annual increase: 450.00, Cap: 9900.00 + bank 22.50 = 9922.50", "outputs": {"was_capped": true, "tenant_share_after_cap": "9922.50"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "1488.38"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "11410.88"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 year',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005'::uuid,
     NOW() - INTERVAL '14 months',
     NOW() - INTERVAL '1 year'),

    -- Lease 38 - 2024
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10019'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd038'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     192000.00, 207096.77, 9000.00,
     10354.84, 10395.00, 1559.25, 11954.25,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "192000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "207096.77"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "207096.77 * 0.05 = 10354.84", "outputs": {"tenant_share_before_cap": "10354.84"}},
       {"step": 4, "name": "Base Year Deduction", "calculation": "10354.84 - 9000.00 = 1354.84", "outputs": {"excess_over_base": "1354.84"}},
       {"step": 5, "name": "Apply Expense Cap", "calculation": "Prior: 9922.50, Annual increase: 450.00, Bank: 0.00, Cap: 10372.50, Actual below cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "10395.00"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "1559.25"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "11954.25"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 month',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005'::uuid,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '1 month'),

    -- Lease 47 - 2022
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10020'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd047'::uuid,
     '2022-01-01', '2022-12-31', 'finalized',
     180000.00, 194086.02, 0.00,
     5822.58, 5822.58, 873.39, 6695.97,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "180000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "194086.02"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "194086.02 * 0.03 = 5822.58", "outputs": {"tenant_share_before_cap": "5822.58"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "5822.58"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "873.39"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "6695.97"}}
     ]'::jsonb,
     NOW() - INTERVAL '2 years',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005'::uuid,
     NOW() - INTERVAL '26 months',
     NOW() - INTERVAL '2 years'),

    -- Lease 47 - 2023
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10021'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd047'::uuid,
     '2023-01-01', '2023-12-31', 'finalized',
     185000.00, 199462.37, 0.00,
     5983.87, 5983.87, 897.58, 6881.45,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "185000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "199462.37"}},
       {"step": 3, "name": "Tenant Share Calculation", "outputs": {"tenant_share_before_cap": "5983.87"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "5983.87"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "897.58"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "6881.45"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 year',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005'::uuid,
     NOW() - INTERVAL '14 months',
     NOW() - INTERVAL '1 year'),

    -- Lease 47 - 2024
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10022'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd047'::uuid,
     '2024-01-01', '2024-12-31', 'finalized',
     192000.00, 207096.77, 0.00,
     6212.90, 6212.90, 931.94, 7144.84,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "192000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "207096.77"}},
       {"step": 3, "name": "Tenant Share Calculation", "outputs": {"tenant_share_before_cap": "6212.90"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "6212.90"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "931.94"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "7144.84"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 month',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb005'::uuid,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '1 month')
ON CONFLICT (id) DO NOTHING;

-- Industrial Complex (Epsilon) - 2 snapshots
INSERT INTO reconciliation_snapshots (
    id, property_id, lease_id, period_start_date, period_end_date, status,
    total_operating_expenses, grossed_up_expenses, base_year_amount,
    tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
    calculation_trace, finalized_at, finalized_by_user_id, created_at, updated_at
)
VALUES
    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10023'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd048'::uuid,
     '2024-01-01', '2024-12-31', 'draft',
     75000.00, 80645.16, 0.00,
     8064.52, 8064.52, 1209.68, 9274.20,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "75000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "calculation": "75000.00 * 1.0752688 = 80645.16", "outputs": {"grossed_total": "80645.16"}},
       {"step": 3, "name": "Tenant Share Calculation", "calculation": "80645.16 * 0.10 = 8064.52", "outputs": {"tenant_share_before_cap": "8064.52"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "8064.52"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "1209.68"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "9274.20"}}
     ]'::jsonb,
     NULL,
     NULL,
     NOW() - INTERVAL '1 week',
     NOW() - INTERVAL '1 week'),

    ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10024'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'dddddddd-dddd-dddd-dddd-ddddddddd048'::uuid,
     '2023-01-01', '2023-12-31', 'finalized',
     72000.00, 77419.35, 0.00,
     7741.94, 7741.94, 1161.29, 8903.23,
     '[
       {"step": 1, "name": "Fetch Operating Expenses", "outputs": {"total_expenses": "72000.00"}},
       {"step": 2, "name": "Gross-Up Calculation", "outputs": {"grossed_total": "77419.35"}},
       {"step": 3, "name": "Tenant Share Calculation", "outputs": {"tenant_share_before_cap": "7741.94"}},
       {"step": 4, "name": "Base Year Deduction", "outputs": {"base_year_amount": "0.00"}},
       {"step": 5, "name": "Apply Expense Cap", "outputs": {"was_capped": false, "tenant_share_after_cap": "7741.94"}},
       {"step": 6, "name": "Admin Fee", "outputs": {"admin_fee": "1161.29"}},
       {"step": 7, "name": "Total Recovery", "outputs": {"total_recovery": "8903.23"}}
     ]'::jsonb,
     NOW() - INTERVAL '1 year',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb006'::uuid,
     NOW() - INTERVAL '14 months',
     NOW() - INTERVAL '1 year')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 24 reconciliation snapshots';
    RAISE NOTICE '   - Downtown Tower: 5 snapshots (mix finalized/draft)';
    RAISE NOTICE '   - Suburban Office: 3 snapshots';
    RAISE NOTICE '   - Retail Plaza: 4 snapshots (tenant portal testing)';
    RAISE NOTICE '   - Medical Building: 4 snapshots (edge cases)';
    RAISE NOTICE '   - Class A Tower: 6 snapshots (multi-year)';
    RAISE NOTICE '   - Industrial Complex: 2 snapshots';
    RAISE NOTICE '   - Covers all BOMA 2024 calculation scenarios';
END $$;

-- ==============================================================================
-- SECTION 13: CALCULATION JOBS (8 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[13/23] Creating calculation jobs in various states...';
END $$;

-- Calculation jobs tracking async reconciliation processing
INSERT INTO calculation_jobs (
    id, organization_id, property_id, period_start, period_end, status,
    force_recalculate, total_leases, processed_leases, snapshot_ids,
    error_message, error_details, created_at, updated_at, started_at, completed_at
)
VALUES
    -- 1. Class A Tower 2024 - COMPLETED
    ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d10001'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     '2024-01-01', '2024-12-31', 'completed',
     false, 10, 10,
     '["c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10019", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10022"]'::jsonb,
     NULL, NULL,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '1 month',
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '1 month'),

    -- 2. Downtown Tower 2024 - COMPLETED
    ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d10002'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     '2024-01-01', '2024-12-31', 'completed',
     false, 15, 15,
     '["c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10001", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10002", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10004", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10005"]'::jsonb,
     NULL, NULL,
     NOW() - INTERVAL '2 weeks',
     NOW() - INTERVAL '1 week',
     NOW() - INTERVAL '2 weeks',
     NOW() - INTERVAL '1 week'),

    -- 3. Retail Plaza 2024 - COMPLETED
    ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d10003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc003'::uuid,
     '2024-01-01', '2024-12-31', 'completed',
     false, 8, 8,
     '["c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10009", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10010", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10011", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10012"]'::jsonb,
     NULL, NULL,
     NOW() - INTERVAL '1 month',
     NOW() - INTERVAL '2 weeks',
     NOW() - INTERVAL '1 month',
     NOW() - INTERVAL '2 weeks'),

    -- 4. Suburban Office 2024 - RUNNING (in progress)
    ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d10004'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc002'::uuid,
     '2024-01-01', '2024-12-31', 'running',
     false, 10, 7,
     '["c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10006", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10007"]'::jsonb,
     NULL, NULL,
     NOW() - INTERVAL '2 hours',
     NOW() - INTERVAL '30 minutes',
     NOW() - INTERVAL '2 hours',
     NULL),

    -- 5. Medical Building 2024 - RUNNING (in progress)
    ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d10005'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc004'::uuid,
     '2024-01-01', '2024-12-31', 'running',
     false, 5, 3,
     '["c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10013", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10014", "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10015"]'::jsonb,
     NULL, NULL,
     NOW() - INTERVAL '1 hour',
     NOW() - INTERVAL '15 minutes',
     NOW() - INTERVAL '1 hour',
     NULL),

    -- 6. Industrial Complex 2024 - PENDING
    ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d10006'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     '2024-01-01', '2024-12-31', 'pending',
     false, NULL, 0,
     '[]'::jsonb,
     NULL, NULL,
     NOW() - INTERVAL '5 minutes',
     NOW() - INTERVAL '5 minutes',
     NULL,
     NULL),

    -- 7. Downtown Tower 2023 - FAILED (missing GL data)
    ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d10007'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc001'::uuid,
     '2023-01-01', '2023-12-31', 'failed',
     false, 15, 0,
     '[]'::jsonb,
     'Insufficient GL entries for period 2023-01-01 to 2023-12-31',
     '{"error_type": "InsufficientDataError", "min_entries_required": 12, "entries_found": 0, "pool_id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeee001", "pool_name": "Operating Expenses"}'::jsonb,
     NOW() - INTERVAL '3 months',
     NOW() - INTERVAL '3 months',
     NOW() - INTERVAL '3 months',
     NULL),

    -- 8. Class A Tower 2019 - FAILED (period too old, no base year data)
    ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d10008'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc005'::uuid,
     '2019-01-01', '2019-12-31', 'failed',
     false, 10, 2,
     '[]'::jsonb,
     'Cannot calculate reconciliation: Base year 2019 data missing for 8 leases',
     '{"error_type": "MissingBaseYearError", "base_year_required": 2019, "leases_affected": 8, "suggestion": "Import GL entries for 2019 or update lease base years"}'::jsonb,
     NOW() - INTERVAL '6 months',
     NOW() - INTERVAL '6 months',
     NOW() - INTERVAL '6 months',
     NULL)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 8 calculation jobs';
    RAISE NOTICE '   - 3 completed jobs (Class A 2024, Downtown 2024, Retail 2024)';
    RAISE NOTICE '   - 2 running jobs (Suburban 2024, Medical 2024)';
    RAISE NOTICE '   - 1 pending job (Industrial 2024)';
    RAISE NOTICE '   - 2 failed jobs (Downtown 2023 missing data, Class A 2019 no base year)';
END $$;

-- ==============================================================================
-- SECTION 14: TENANT USERS (4 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[14/23] Creating tenant portal users for Retail Plaza...';
END $$;

-- Tenant users for Beta Real Estate Holdings (Retail Plaza)
-- These link to auth users created in Section 2
INSERT INTO tenant_users (id, user_id, organization_id, contact_name, contact_email, created_at)
VALUES
    -- Sarah Retailer - owns 3 stores
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10001'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid,
     'Sarah Retailer',
     'sarah.tenant@retailstore.com',
     NOW() - INTERVAL '6 months'),

    -- Mike Coffee - owns 1 coffee shop
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10002'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb008'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid,
     'Mike Coffee',
     'mike.tenant@coffeeshop.com',
     NOW() - INTERVAL '5 months'),

    -- Lisa Stylist - owns 1 salon
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10003'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid,
     'Lisa Stylist',
     'lisa.tenant@salon.com',
     NOW() - INTERVAL '4 months'),

    -- David Fitness - owns 1 gym
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10004'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002'::uuid,
     'David Fitness',
     'david.tenant@gym.com',
     NOW() - INTERVAL '3 months')
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id;

DO $$
BEGIN
    RAISE NOTICE '   Created 4 tenant users for Retail Plaza';
    RAISE NOTICE '   - Sarah Retailer (3 stores)';
    RAISE NOTICE '   - Mike Coffee (1 shop)';
    RAISE NOTICE '   - Lisa Stylist (1 salon)';
    RAISE NOTICE '   - David Fitness (1 gym)';
END $$;

-- ==============================================================================
-- SECTION 15: TENANT LEASE LINKS (6 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[15/23] Linking tenants to their leases...';
END $$;

-- Tenant lease links (many-to-many relationship)
INSERT INTO tenant_lease_links (tenant_user_id, lease_id, created_at)
VALUES
    -- Sarah's 3 stores (Store 1, Store 4, Store 7)
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10001'::uuid, 'dddddddd-dddd-dddd-dddd-ddddddddd026'::uuid, NOW() - INTERVAL '6 months'),
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10001'::uuid, 'dddddddd-dddd-dddd-dddd-ddddddddd029'::uuid, NOW() - INTERVAL '6 months'),
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10001'::uuid, 'dddddddd-dddd-dddd-dddd-ddddddddd032'::uuid, NOW() - INTERVAL '6 months'),

    -- Mike's coffee shop (Store 2)
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10002'::uuid, 'dddddddd-dddd-dddd-dddd-ddddddddd027'::uuid, NOW() - INTERVAL '5 months'),

    -- Lisa's salon (Store 3)
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10003'::uuid, 'dddddddd-dddd-dddd-dddd-ddddddddd028'::uuid, NOW() - INTERVAL '4 months'),

    -- David's gym (Store 5)
    ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10004'::uuid, 'dddddddd-dddd-dddd-dddd-ddddddddd030'::uuid, NOW() - INTERVAL '3 months')
ON CONFLICT (tenant_user_id, lease_id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 6 tenant lease links';
    RAISE NOTICE '   - Sarah: 3 leases (multi-location tenant)';
    RAISE NOTICE '   - Mike, Lisa, David: 1 lease each';
END $$;

-- ==============================================================================
-- SECTION 16: TENANT INVITATIONS (6 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[16/23] Creating tenant invitations in various states...';
END $$;

-- Tenant invitations with various states
INSERT INTO tenant_invitations (
    id, email, token, lease_id, invited_by, organization_id,
    expires_at, used_at, is_revoked, created_at
)
VALUES
    -- 1. PENDING - New tenant invitation (not yet claimed)
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10001'::uuid,
     'new.tenant@retailer.com',
     'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
     'dddddddd-dddd-dddd-dddd-ddddddddd031'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     NOW() + INTERVAL '7 days',
     NULL,
     false,
     NOW() - INTERVAL '2 days'),

    -- 2. PENDING - Another unclaimed invitation
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10002'::uuid,
     'another.tenant@store.com',
     'q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6',
     'dddddddd-dddd-dddd-dddd-ddddddddd033'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     NOW() + INTERVAL '5 days',
     NULL,
     false,
     NOW() - INTERVAL '1 day'),

    -- 3. CLAIMED - Sarah's invitation (used)
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10003'::uuid,
     'sarah.tenant@retailstore.com',
     'z1x2c3v4b5n6m7l8k9j0h1g2f3d4s5a6',
     'dddddddd-dddd-dddd-dddd-ddddddddd026'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     NOW() + INTERVAL '1 day',
     NOW() - INTERVAL '6 months',
     false,
     NOW() - INTERVAL '6 months 1 day'),

    -- 4. CLAIMED - Mike's invitation (used)
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10004'::uuid,
     'mike.tenant@coffeeshop.com',
     'p0o9i8u7y6t5r4e3w2q1m5n6b7v8c9x0',
     'dddddddd-dddd-dddd-dddd-ddddddddd027'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     NOW() + INTERVAL '2 days',
     NOW() - INTERVAL '5 months',
     false,
     NOW() - INTERVAL '5 months 1 day'),

    -- 5. EXPIRED - Invitation that was never used
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10005'::uuid,
     'expired.tenant@oldstore.com',
     'l9k8j7h6g5f4d3s2a1z9x8c7v6b5n4m3',
     'dddddddd-dddd-dddd-dddd-ddddddddd031'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     NOW() - INTERVAL '3 days',
     NULL,
     false,
     NOW() - INTERVAL '10 days'),

    -- 6. REVOKED - Manually revoked invitation
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10006'::uuid,
     'revoked.tenant@cancelled.com',
     'r5t6y7u8i9o0p1q2w3e4a5s6d7f8g9h0',
     'dddddddd-dddd-dddd-dddd-ddddddddd033'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     NOW() + INTERVAL '4 days',
     NULL,
     true,
     NOW() - INTERVAL '2 weeks')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 6 tenant invitations';
    RAISE NOTICE '   - 2 pending (awaiting signup)';
    RAISE NOTICE '   - 2 claimed (Sarah and Mike)';
    RAISE NOTICE '   - 1 expired (never used)';
    RAISE NOTICE '   - 1 revoked (manually cancelled)';
END $$;

-- ==============================================================================
-- SECTION 17: DISPUTES (6 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[17/23] Creating disputes covering full lifecycle...';
END $$;

-- Disputes from tenant users covering full workflow
INSERT INTO disputes (
    id, tenant_user_id, statement_id, organization_id, category, description,
    status, assigned_to, resolution_summary, resolved_at, resolved_by,
    created_at, updated_at
)
VALUES
    -- 1. OPEN - Lisa disputes base year amount
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10001'::uuid,
     'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10003'::uuid,
     'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10011'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'base_year_issue',
     'My lease states the base year is 2023, but the reconciliation statement shows a base year amount of $4,200. According to my lease, the base year should be 2024, which means there should be no base year deduction for this reconciliation period. Please review Section 3.2 of my lease agreement.',
     'open',
     NULL, NULL, NULL, NULL,
     NOW() - INTERVAL '3 days',
     NOW() - INTERVAL '3 days'),

    -- 2. UNDER_REVIEW - Sarah disputes missing HVAC credit
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10002'::uuid,
     'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10001'::uuid,
     'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10009'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'missing_credit',
     'I paid for major HVAC repairs in Store 1 during July 2024 ($8,500 invoice attached). Per our lease agreement Section 5.4, landlord-required capital improvements paid by tenant should be credited against CAM charges. This credit does not appear in my reconciliation statement.',
     'under_review',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NULL, NULL, NULL,
     NOW() - INTERVAL '10 days',
     NOW() - INTERVAL '2 days'),

    -- 3. UNDER_REVIEW - Sarah disputes admin fee calculation
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10003'::uuid,
     'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10001'::uuid,
     'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10009'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'calculation_error',
     'The administrative fee shown is $756.00 (15% of $5,040). However, my lease states admin fees should only apply to operating expenses, not the total recovery amount. Please verify this calculation is correct per my lease terms.',
     'under_review',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NULL, NULL, NULL,
     NOW() - INTERVAL '5 days',
     NOW() - INTERVAL '1 day'),

    -- 4. RESOLVED - Mike's square footage dispute (corrected)
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10004'::uuid,
     'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10002'::uuid,
     'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10010'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'incorrect_area',
     'My pro-rata share is calculated at 3%, but my actual square footage is 2,800 sq ft out of 95,000 total, which should be 2.95%. Please recalculate using the correct square footage from my lease.',
     'resolved',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'Reviewed lease and building measurements. Confirmed tenant square footage is 2,800 sq ft. Pro-rata share adjusted from 3.00% to 2.95%. Revised statement will be issued with corrected calculation. Credit of $15.23 will be applied to next billing cycle.',
     NOW() - INTERVAL '2 weeks',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NOW() - INTERVAL '3 weeks',
     NOW() - INTERVAL '2 weeks'),

    -- 5. REJECTED - Lisa's landscaping exclusion request (denied)
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10005'::uuid,
     'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10003'::uuid,
     'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10011'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'billing_question',
     'I noticed landscaping expenses are included in the CAM charges. Our unit has a separate entrance and we maintain our own landscaping. We should not be charged for common area landscaping that we do not benefit from.',
     'rejected',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'Reviewed lease agreement Section 4.1. Landscaping is specifically listed as a recoverable operating expense with no exclusions. The lease does not provide for tenant-specific landscaping exclusions. All tenants share proportionally in common area landscaping costs regardless of entrance location. Request denied per lease terms.',
     NOW() - INTERVAL '1 month',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NOW() - INTERVAL '5 weeks',
     NOW() - INTERVAL '1 month'),

    -- 6. CLOSED - David's base year issue (resolved and closed)
    ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10006'::uuid,
     'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e10004'::uuid,
     'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c10012'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'base_year_issue',
     'The statement shows no base year deduction. My lease specifies 2024 as base year, so there should be a base year amount to compare against. Please confirm this is correct.',
     'closed',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'Confirmed that 2024 is your first year of operation and is designated as your base year per lease Section 3.1. For base year reconciliations, there is no prior year to compare against, so the full pro-rata share is billed with no deduction. This is correct per BOMA 2024 standards and your lease terms. Tenant acknowledged and accepted explanation.',
     NOW() - INTERVAL '2 months',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     NOW() - INTERVAL '3 months',
     NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 6 disputes';
    RAISE NOTICE '   - 1 open (Lisa: base year)';
    RAISE NOTICE '   - 2 under review (Sarah: HVAC credit, admin fee)';
    RAISE NOTICE '   - 1 resolved (Mike: square footage corrected)';
    RAISE NOTICE '   - 1 rejected (Lisa: landscaping denied)';
    RAISE NOTICE '   - 1 closed (David: base year confirmed)';
END $$;

-- ==============================================================================
-- SECTION 18: DISPUTE COMMENTS (24 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[18/23] Creating dispute comments (public and internal)...';
END $$;

-- Dispute comments with mix of public and internal notes
INSERT INTO dispute_comments (id, dispute_id, author_id, content, is_internal, created_at)
VALUES
    -- Dispute 1 (Lisa - base year) - 4 comments
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20001'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10001'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009'::uuid,
     'I have attached page 5 of my lease showing the base year clause. It clearly states "Base Year: 2024 (First Full Calendar Year)". Please review.',
     false, NOW() - INTERVAL '3 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20002'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10001'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'INTERNAL NOTE: Need to pull original lease from files and verify base year definition. Lisa started lease in Jan 2024 so this could be valid.',
     true, NOW() - INTERVAL '2 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20003'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10001'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'Thank you for bringing this to our attention. We are reviewing your lease agreement and will respond within 2 business days.',
     false, NOW() - INTERVAL '2 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20004'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10001'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009'::uuid,
     'Thank you. I appreciate your prompt attention to this matter.',
     false, NOW() - INTERVAL '2 days'),

    -- Dispute 2 (Sarah - HVAC credit) - 4 comments
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20005'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10002'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007'::uuid,
     'The HVAC system failed during our busiest season and your maintenance team said it would take 3 weeks to get parts. We had to pay for emergency repair to keep the store operational. The invoice is attached.',
     false, NOW() - INTERVAL '10 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20006'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10002'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'INTERNAL NOTE: Check GL entries for July 2024. If we have HVAC capital expense around same time, this could be duplicate. Also verify lease Section 5.4 language on capital improvements.',
     true, NOW() - INTERVAL '9 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20007'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10002'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'Thank you for the invoice. We are reviewing our maintenance records and your lease terms regarding capital improvements. We will respond within 5 business days.',
     false, NOW() - INTERVAL '8 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20008'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10002'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'INTERNAL NOTE: Confirmed - we have $8,200 HVAC expense in July GL. Sarah paid $8,500 for same repair (emergency rate). Credit is warranted per lease 5.4. Recommend $8,200 credit.',
     true, NOW() - INTERVAL '2 days'),

    -- Dispute 3 (Sarah - admin fee) - 4 comments
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20009'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10003'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007'::uuid,
     'I have attached page 8 of my lease showing the admin fee clause. It says "15% administrative fee on Operating Expenses only." The fee should be calculated on $5,040 before adding it to get the total, not on the total recovery.',
     false, NOW() - INTERVAL '5 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20010'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10003'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'INTERNAL NOTE: Standard lease template says "15% of recoverable amount". Need to check if Sarah has custom language. If so, need to recalculate.',
     true, NOW() - INTERVAL '4 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20011'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10003'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'Thank you for the clarification. We are reviewing your lease language and will confirm the correct calculation method.',
     false, NOW() - INTERVAL '3 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20012'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10003'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'INTERNAL NOTE: Reviewed lease - Sarah is correct. Her lease has custom admin fee language. Calculation is currently correct ($5040 * 0.15 = $756), but need to verify our engine is applying to right base.',
     true, NOW() - INTERVAL '1 day'),

    -- Dispute 4 (Mike - square footage) - 4 comments
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20013'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10004'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb008'::uuid,
     'My lease shows 2,800 sq ft. Building total is 95,000 sq ft per the lease. That is 2.95%, not 3.00%.',
     false, NOW() - INTERVAL '3 weeks'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20014'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10004'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'INTERNAL NOTE: Check unit database. May have rounded up to 3%. Need exact measurements from lease and building total.',
     true, NOW() - INTERVAL '3 weeks'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20015'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10004'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'You are correct. We had rounded the pro-rata share in our system. Your exact share is 2.95% (2,800/95,000). We will issue a revised statement with the corrected calculation and credit the difference.',
     false, NOW() - INTERVAL '2 weeks 2 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20016'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10004'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb008'::uuid,
     'Thank you for the quick resolution!',
     false, NOW() - INTERVAL '2 weeks'),

    -- Dispute 5 (Lisa - landscaping) - 4 comments
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20017'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10005'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009'::uuid,
     'We maintain our own front landscaping and entrance. It does not seem fair to pay for common area landscaping we do not use.',
     false, NOW() - INTERVAL '5 weeks'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20018'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10005'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'INTERNAL NOTE: Standard lease language includes all common area expenses. Check if Lisa has exclusion clause, but unlikely.',
     true, NOW() - INTERVAL '5 weeks'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20019'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10005'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'We have reviewed your lease agreement. Section 4.1 specifically lists landscaping as a recoverable expense with no exclusions noted. All tenants share in common area costs per their pro-rata share, regardless of individual usage. This is standard in retail plaza leases.',
     false, NOW() - INTERVAL '1 month 1 day'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20020'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10005'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009'::uuid,
     'I understand. I disagree but will accept the decision per my lease terms.',
     false, NOW() - INTERVAL '1 month'),

    -- Dispute 6 (David - base year) - 4 comments
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20021'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10006'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010'::uuid,
     'Can you explain why there is no base year deduction on my reconciliation? My lease says 2024 is my base year.',
     false, NOW() - INTERVAL '3 months'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20022'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10006'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'INTERNAL NOTE: First year tenant. 2024 IS base year, so this reconciliation establishes the baseline. No deduction is correct. Need to explain base year mechanics.',
     true, NOW() - INTERVAL '3 months'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20023'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10006'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb003'::uuid,
     'You are correct that 2024 is your base year. In a base year reconciliation, this year establishes the baseline amount for future comparisons. Starting in 2025, your reconciliations will show: (2025 amount - 2024 base year amount) × pro-rata share. For 2024, you pay your full pro-rata share since there is no prior baseline to deduct. This is correct per BOMA standards.',
     false, NOW() - INTERVAL '2 months 3 days'),
    ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f20024'::uuid, 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10006'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010'::uuid,
     'That makes sense now. Thank you for the clear explanation!',
     false, NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 24 dispute comments';
    RAISE NOTICE '   - Mix of tenant and landlord comments';
    RAISE NOTICE '   - 8 internal notes (visible to landlord only)';
    RAISE NOTICE '   - 16 public comments (visible to both parties)';
END $$;

-- ==============================================================================
-- SECTION 19: DISPUTE ATTACHMENTS (4 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[19/23] Creating dispute attachments...';
END $$;

-- Dispute attachments (file metadata only, actual files would be in storage)
INSERT INTO dispute_attachments (
    id, dispute_id, uploaded_by, filename, storage_path, file_size, mime_type, created_at
)
VALUES
    -- Dispute 1 (Lisa - base year) - lease page
    ('f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f30001'::uuid,
     'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10001'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb009'::uuid,
     'lease-page-5-base-year-clause.pdf',
     'dispute-attachments/f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10001/lease-page-5-base-year-clause.pdf',
     245680,
     'application/pdf',
     NOW() - INTERVAL '3 days'),

    -- Dispute 2 (Sarah - HVAC credit) - invoice
    ('f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f30002'::uuid,
     'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10002'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007'::uuid,
     'hvac-repair-invoice-july-2024.pdf',
     'dispute-attachments/f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10002/hvac-repair-invoice-july-2024.pdf',
     512340,
     'application/pdf',
     NOW() - INTERVAL '10 days'),

    -- Dispute 3 (Sarah - admin fee) - lease page
    ('f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f30003'::uuid,
     'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10003'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb007'::uuid,
     'lease-page-8-admin-fee-clause.pdf',
     'dispute-attachments/f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10003/lease-page-8-admin-fee-clause.pdf',
     198450,
     'application/pdf',
     NOW() - INTERVAL '5 days'),

    -- Dispute 4 (Mike - square footage) - floor plan
    ('f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f30004'::uuid,
     'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10004'::uuid,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb008'::uuid,
     'lease-floor-plan-measurements.pdf',
     'dispute-attachments/f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f10004/lease-floor-plan-measurements.pdf',
     1024567,
     'application/pdf',
     NOW() - INTERVAL '3 weeks')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 4 dispute attachments';
    RAISE NOTICE '   - 2 lease document pages (Lisa, Sarah)';
    RAISE NOTICE '   - 1 HVAC repair invoice (Sarah)';
    RAISE NOTICE '   - 1 floor plan (Mike)';
    RAISE NOTICE '   - All stored in dispute-attachments bucket';
END $$;

-- ==============================================================================
-- SECTION 20: DOCUMENTS (10 Total) - AI Extraction States
-- ==============================================================================
-- Epsilon Ventures - Industrial Complex lease PDFs with OCR/HITL workflow
-- States: ready_for_review (4), verified (2), rejected (2), pending (1), failed (1)
-- extraction_result includes confidence scores and bounding boxes

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '==================================================';
    RAISE NOTICE '[20/23] Creating 10 documents with AI extraction states...';
    RAISE NOTICE '==================================================';
END $$;

INSERT INTO documents (
    id, organization_id, property_id, filename, storage_key, storage_bucket,
    content_type, file_size_bytes, document_type, status,
    reader_job_id, extraction_result, error_message,
    verified_by, verified_at, lease_id, edit_history,
    created_at, updated_at, processed_at
)
VALUES
    -- 1. READY_FOR_REVIEW - High confidence extraction awaiting HITL
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-a1-lease-2023.pdf',
     'epsilon-ventures/industrial-complex/warehouse-a1-lease-2023.pdf',
     'lease-documents',
     'application/pdf',
     2456789,
     'lease',
     'ready_for_review',
     'document_reader-job-001-a1b2c3d4e5f6',
     '{
       "base_year": {"value": 2023, "confidence": 0.92, "bounding_box": {"left": 0.22, "top": 0.45, "width": 0.08, "height": 0.02, "page": 3}},
       "pro_rata_share": {"value": "0.05", "confidence": 0.88, "bounding_box": {"left": 0.18, "top": 0.52, "width": 0.12, "height": 0.02, "page": 3}},
       "cap_type": {"value": "cumulative", "confidence": 0.87, "bounding_box": {"left": 0.15, "top": 0.68, "width": 0.18, "height": 0.03, "page": 4}},
       "cap_rate": {"value": "0.05", "confidence": 0.91, "bounding_box": {"left": 0.35, "top": 0.68, "width": 0.08, "height": 0.02, "page": 4}},
       "admin_fee_percentage": {"value": "0.15", "confidence": 0.94, "bounding_box": {"left": 0.25, "top": 0.75, "width": 0.10, "height": 0.02, "page": 4}}
     }'::jsonb,
     NULL, NULL, NULL, NULL, '[]'::jsonb,
     NOW() - INTERVAL '3 days',
     NOW() - INTERVAL '3 days',
     NOW() - INTERVAL '3 days'),

    -- 2. READY_FOR_REVIEW - Medium confidence extraction needs review
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00002'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-a2-lease-2023.pdf',
     'epsilon-ventures/industrial-complex/warehouse-a2-lease-2023.pdf',
     'lease-documents',
     'application/pdf',
     2134567,
     'lease',
     'ready_for_review',
     'document_reader-job-002-b2c3d4e5f6a7',
     '{
       "base_year": {"value": 2023, "confidence": 0.79, "bounding_box": {"left": 0.20, "top": 0.48, "width": 0.08, "height": 0.02, "page": 2}},
       "pro_rata_share": {"value": "0.04", "confidence": 0.82, "bounding_box": {"left": 0.16, "top": 0.55, "width": 0.12, "height": 0.02, "page": 2}},
       "cap_type": {"value": "non_cumulative", "confidence": 0.76, "bounding_box": {"left": 0.14, "top": 0.71, "width": 0.20, "height": 0.03, "page": 3}},
       "cap_rate": {"value": "0.04", "confidence": 0.85, "bounding_box": {"left": 0.36, "top": 0.71, "width": 0.08, "height": 0.02, "page": 3}},
       "admin_fee_percentage": {"value": "0.15", "confidence": 0.89, "bounding_box": {"left": 0.24, "top": 0.78, "width": 0.10, "height": 0.02, "page": 3}}
     }'::jsonb,
     NULL, NULL, NULL, NULL, '[]'::jsonb,
     NOW() - INTERVAL '2 days',
     NOW() - INTERVAL '2 days',
     NOW() - INTERVAL '2 days'),

    -- 3. READY_FOR_REVIEW - Low confidence base year requires verification
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-b1-lease-2024.pdf',
     'epsilon-ventures/industrial-complex/warehouse-b1-lease-2024.pdf',
     'lease-documents',
     'application/pdf',
     1987654,
     'lease',
     'ready_for_review',
     'document_reader-job-003-c3d4e5f6a7b8',
     '{
       "base_year": {"value": 2024, "confidence": 0.71, "bounding_box": {"left": 0.19, "top": 0.42, "width": 0.08, "height": 0.02, "page": 4}, "extraction_note": "Handwritten annotation near base year clause"},
       "pro_rata_share": {"value": "0.035", "confidence": 0.88, "bounding_box": {"left": 0.17, "top": 0.50, "width": 0.12, "height": 0.02, "page": 4}},
       "cap_type": {"value": "cumulative", "confidence": 0.90, "bounding_box": {"left": 0.13, "top": 0.65, "width": 0.18, "height": 0.03, "page": 5}},
       "cap_rate": {"value": "0.06", "confidence": 0.93, "bounding_box": {"left": 0.34, "top": 0.65, "width": 0.08, "height": 0.02, "page": 5}},
       "admin_fee_percentage": {"value": "0.15", "confidence": 0.91, "bounding_box": {"left": 0.23, "top": 0.72, "width": 0.10, "height": 0.02, "page": 5}}
     }'::jsonb,
     NULL, NULL, NULL, NULL, '[]'::jsonb,
     NOW() - INTERVAL '1 day',
     NOW() - INTERVAL '1 day',
     NOW() - INTERVAL '1 day'),

    -- 4. READY_FOR_REVIEW - Ambiguous cap type needs human decision
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00004'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-b2-lease-2024.pdf',
     'epsilon-ventures/industrial-complex/warehouse-b2-lease-2024.pdf',
     'lease-documents',
     'application/pdf',
     2765432,
     'lease',
     'ready_for_review',
     'document_reader-job-004-d4e5f6a7b8c9',
     '{
       "base_year": {"value": 2024, "confidence": 0.95, "bounding_box": {"left": 0.21, "top": 0.40, "width": 0.08, "height": 0.02, "page": 3}},
       "pro_rata_share": {"value": "0.042", "confidence": 0.87, "bounding_box": {"left": 0.19, "top": 0.47, "width": 0.12, "height": 0.02, "page": 3}},
       "cap_type": {"value": "cumulative", "confidence": 0.68, "bounding_box": {"left": 0.12, "top": 0.62, "width": 0.22, "height": 0.04, "page": 4}, "extraction_note": "Clause language unclear - may be cumulative_compounding"},
       "cap_rate": {"value": "0.05", "confidence": 0.92, "bounding_box": {"left": 0.37, "top": 0.62, "width": 0.08, "height": 0.02, "page": 4}},
       "admin_fee_percentage": {"value": "0.15", "confidence": 0.96, "bounding_box": {"left": 0.26, "top": 0.69, "width": 0.10, "height": 0.02, "page": 4}}
     }'::jsonb,
     NULL, NULL, NULL, NULL, '[]'::jsonb,
     NOW() - INTERVAL '6 hours',
     NOW() - INTERVAL '6 hours',
     NOW() - INTERVAL '6 hours'),

    -- 5. VERIFIED - Approved extraction, lease created
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00005'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-c1-lease-2023.pdf',
     'epsilon-ventures/industrial-complex/warehouse-c1-lease-2023.pdf',
     'lease-documents',
     'application/pdf',
     2345678,
     'lease',
     'verified',
     'document_reader-job-005-e5f6a7b8c9d0',
     '{
       "base_year": {"value": 2023, "confidence": 0.94, "bounding_box": {"left": 0.23, "top": 0.43, "width": 0.08, "height": 0.02, "page": 2}},
       "pro_rata_share": {"value": "0.05", "confidence": 0.91, "bounding_box": {"left": 0.20, "top": 0.51, "width": 0.12, "height": 0.02, "page": 2}},
       "cap_type": {"value": "cumulative", "confidence": 0.89, "bounding_box": {"left": 0.16, "top": 0.66, "width": 0.18, "height": 0.03, "page": 3}},
       "cap_rate": {"value": "0.05", "confidence": 0.93, "bounding_box": {"left": 0.38, "top": 0.66, "width": 0.08, "height": 0.02, "page": 3}},
       "admin_fee_percentage": {"value": "0.15", "confidence": 0.95, "bounding_box": {"left": 0.27, "top": 0.73, "width": 0.10, "height": 0.02, "page": 3}}
     }'::jsonb,
     NULL,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013'::uuid,
     NOW() - INTERVAL '2 weeks',
     'dddddddd-dddd-dddd-dddd-ddddddddd046'::uuid,
     '[{"timestamp": "2024-12-01T10:30:00Z", "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013", "action": "verified", "changes": []}]'::jsonb,
     NOW() - INTERVAL '3 weeks',
     NOW() - INTERVAL '2 weeks',
     NOW() - INTERVAL '3 weeks'),

    -- 6. VERIFIED - Approved with minor edits
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00006'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-c2-lease-2023.pdf',
     'epsilon-ventures/industrial-complex/warehouse-c2-lease-2023.pdf',
     'lease-documents',
     'application/pdf',
     2123456,
     'lease',
     'verified',
     'document_reader-job-006-f6a7b8c9d0e1',
     '{
       "base_year": {"value": 2023, "confidence": 0.90, "bounding_box": {"left": 0.24, "top": 0.44, "width": 0.08, "height": 0.02, "page": 3}},
       "pro_rata_share": {"value": "0.045", "confidence": 0.84, "bounding_box": {"left": 0.21, "top": 0.52, "width": 0.12, "height": 0.02, "page": 3}, "human_corrected": true, "original_value": "0.04"},
       "cap_type": {"value": "non_cumulative", "confidence": 0.88, "bounding_box": {"left": 0.17, "top": 0.67, "width": 0.20, "height": 0.03, "page": 4}},
       "cap_rate": {"value": "0.04", "confidence": 0.91, "bounding_box": {"left": 0.39, "top": 0.67, "width": 0.08, "height": 0.02, "page": 4}},
       "admin_fee_percentage": {"value": "0.15", "confidence": 0.94, "bounding_box": {"left": 0.28, "top": 0.74, "width": 0.10, "height": 0.02, "page": 4}}
     }'::jsonb,
     NULL,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013'::uuid,
     NOW() - INTERVAL '10 days',
     'dddddddd-dddd-dddd-dddd-ddddddddd047'::uuid,
     '[{"timestamp": "2024-12-10T14:45:00Z", "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013", "action": "edited", "field": "pro_rata_share", "old_value": "0.04", "new_value": "0.045", "reason": "Verified against lease schedule A"}, {"timestamp": "2024-12-10T14:47:00Z", "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013", "action": "verified", "changes": ["pro_rata_share"]}]'::jsonb,
     NOW() - INTERVAL '11 days',
     NOW() - INTERVAL '10 days',
     NOW() - INTERVAL '11 days'),

    -- 7. REJECTED - Incorrect extraction, wrong document type
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00007'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'amendment-warehouse-a1-2024.pdf',
     'epsilon-ventures/industrial-complex/amendment-warehouse-a1-2024.pdf',
     'lease-documents',
     'application/pdf',
     987654,
     'lease',
     'rejected',
     'document_reader-job-007-a7b8c9d0e1f2',
     '{
       "base_year": {"value": null, "confidence": 0.0, "bounding_box": null, "extraction_note": "No base year clause found"},
       "pro_rata_share": {"value": "0.05", "confidence": 0.65, "bounding_box": {"left": 0.15, "top": 0.30, "width": 0.12, "height": 0.02, "page": 1}},
       "cap_type": {"value": null, "confidence": 0.0, "bounding_box": null},
       "cap_rate": {"value": null, "confidence": 0.0, "bounding_box": null},
       "admin_fee_percentage": {"value": null, "confidence": 0.0, "bounding_box": null}
     }'::jsonb,
     NULL,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013'::uuid,
     NOW() - INTERVAL '1 week',
     NULL,
     '[{"timestamp": "2024-12-14T09:15:00Z", "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013", "action": "rejected", "reason": "This is a lease amendment, not an original lease. Missing required financial DNA fields."}]'::jsonb,
     NOW() - INTERVAL '8 days',
     NOW() - INTERVAL '1 week',
     NOW() - INTERVAL '8 days'),

    -- 8. REJECTED - Poor quality scan, unreadable text
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00008'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-d1-lease-scan-poor.pdf',
     'epsilon-ventures/industrial-complex/warehouse-d1-lease-scan-poor.pdf',
     'lease-documents',
     'application/pdf',
     3456789,
     'lease',
     'rejected',
     'document_reader-job-008-b8c9d0e1f2a3',
     '{
       "base_year": {"value": 2024, "confidence": 0.42, "bounding_box": {"left": 0.18, "top": 0.38, "width": 0.10, "height": 0.03, "page": 5}, "extraction_note": "Low image quality, text blurry"},
       "pro_rata_share": {"value": "0.03", "confidence": 0.38, "bounding_box": {"left": 0.14, "top": 0.46, "width": 0.14, "height": 0.03, "page": 5}, "extraction_note": "Characters unclear"},
       "cap_type": {"value": null, "confidence": 0.0, "bounding_box": null, "extraction_note": "Cap clause not readable"},
       "cap_rate": {"value": null, "confidence": 0.0, "bounding_box": null},
       "admin_fee_percentage": {"value": "0.15", "confidence": 0.48, "bounding_box": {"left": 0.20, "top": 0.70, "width": 0.12, "height": 0.03, "page": 6}}
     }'::jsonb,
     NULL,
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013'::uuid,
     NOW() - INTERVAL '5 days',
     NULL,
     '[{"timestamp": "2024-12-16T11:00:00Z", "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013", "action": "rejected", "reason": "Scan quality too poor for accurate extraction. Request re-scan from property manager."}]'::jsonb,
     NOW() - INTERVAL '6 days',
     NOW() - INTERVAL '5 days',
     NOW() - INTERVAL '6 days'),

    -- 9. PENDING - OCR job in progress
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00009'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-d2-lease-2024.pdf',
     'epsilon-ventures/industrial-complex/warehouse-d2-lease-2024.pdf',
     'lease-documents',
     'application/pdf',
     2987654,
     'lease',
     'processing',
     'document_reader-job-009-c9d0e1f2a3b4',
     NULL,
     NULL,
     NULL, NULL, NULL, '[]'::jsonb,
     NOW() - INTERVAL '2 hours',
     NOW() - INTERVAL '2 hours',
     NULL),

    -- 10. FAILED - document reader job error
    ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00010'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'cccccccc-cccc-cccc-cccc-ccccccccc006'::uuid,
     'warehouse-e1-lease-corrupted.pdf',
     'epsilon-ventures/industrial-complex/warehouse-e1-lease-corrupted.pdf',
     'lease-documents',
     'application/pdf',
     4567890,
     'lease',
     'failed',
     'document_reader-job-010-d0e1f2a3b4c5',
     NULL,
     'document reader error: InvalidS3ObjectException - Unable to read PDF. File may be corrupted or encrypted.',
     NULL, NULL, NULL, '[]'::jsonb,
     NOW() - INTERVAL '4 days',
     NOW() - INTERVAL '4 days',
     NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 10 documents with AI extraction states';
    RAISE NOTICE '   - 4 READY_FOR_REVIEW (awaiting HITL verification)';
    RAISE NOTICE '   - 2 VERIFIED (approved and committed to leases)';
    RAISE NOTICE '   - 2 REJECTED (incorrect extraction or poor quality)';
    RAISE NOTICE '   - 1 PROCESSING (OCR job in progress)';
    RAISE NOTICE '   - 1 FAILED (document reader error)';
    RAISE NOTICE '   - All for Epsilon Ventures Industrial Complex';
    RAISE NOTICE '   - Confidence scores range from 0.38 (poor) to 0.96 (excellent)';
    RAISE NOTICE '   - Edit history tracks human corrections';
END $$;

-- ==============================================================================
-- SECTION 21: SUBSCRIPTIONS (5 Total) - One per Organization
-- ==============================================================================
-- Billing subscriptions for Stripe integration
-- Plans: free (Gamma), starter (Beta, Epsilon), professional (Acme, Delta)

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '==================================================';
    RAISE NOTICE '[21/23] Creating 5 organization subscriptions...';
    RAISE NOTICE '==================================================';
END $$;

INSERT INTO subscriptions (
    id, organization_id, stripe_subscription_id, stripe_customer_id,
    plan, status, current_period_start, current_period_end,
    cancel_at_period_end, created_at, updated_at
)
VALUES
    -- 1. Acme Real Estate Partners - Growth ($250/building/month, active)
    ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00001'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid,
     'sub_1PQRSTacme001',
     'cus_ACMEreal001',
     'growth',
     'active',
     '2024-12-01'::timestamptz,
     '2025-01-01'::timestamptz,
     false,
     NOW() - INTERVAL '8 months',
     NOW() - INTERVAL '1 day'),

    -- 2. Beta Real Estate Holdings - Growth ($250/building/month, trialing)
    ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid,
     'sub_1PQRSTbeta002',
     'cus_BETAhold002',
     'growth',
     'trialing',
     '2024-12-15'::timestamptz,
     '2024-12-29'::timestamptz,
     false,
     NOW() - INTERVAL '2 weeks',
     NOW() - INTERVAL '1 day'),

    -- 3. Gamma Medical Properties - Growth ($250/building/month, active, no Stripe)
    ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00003'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004'::uuid,
     NULL,
     NULL,
     'growth',
     'active',
     '2024-11-01'::timestamptz,
     '2025-11-01'::timestamptz,
     false,
     NOW() - INTERVAL '2 months',
     NOW() - INTERVAL '1 day'),

    -- 4. Delta Tower Management - Growth ($250/building/month, active)
    ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00004'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid,
     'sub_1PQRSTdelta004',
     'cus_DELTAtower004',
     'growth',
     'active',
     '2024-12-01'::timestamptz,
     '2025-01-01'::timestamptz,
     false,
     NOW() - INTERVAL '6 months',
     NOW() - INTERVAL '1 day'),

    -- 5. Epsilon Ventures - Growth ($250/building/month, active)
    ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00005'::uuid,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid,
     'sub_1PQRSTepsilon005',
     'cus_EPSILONvent005',
     'growth',
     'active',
     '2024-12-01'::timestamptz,
     '2025-01-01'::timestamptz,
     false,
     NOW() - INTERVAL '4 months',
     NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 5 subscriptions';
    RAISE NOTICE '   - 5 Growth plans ($250/building/month): Acme, Beta (trialing), Gamma, Delta, Epsilon';
END $$;

-- ==============================================================================
-- SECTION 22: INVOICES (18 Total) - Payment History
-- ==============================================================================
-- Monthly invoices for paid subscriptions (Acme: 6, Beta: 3, Delta: 6, Epsilon: 3)
-- Gamma (Free) has no invoices

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '==================================================';
    RAISE NOTICE '[22/23] Creating 18 invoices (payment history)...';
    RAISE NOTICE '==================================================';
END $$;

INSERT INTO invoices (
    id, organization_id, subscription_id, stripe_invoice_id,
    amount_due, amount_paid, currency, status,
    period_start, period_end, due_date, paid_at, pdf_url,
    created_at, updated_at
)
VALUES
    -- Acme Real Estate Partners - 6 paid invoices (Professional $299)
    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00001'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00001'::uuid,
     'in_acme_2024_07', 299.00, 299.00, 'usd', 'paid',
     '2024-07-01'::timestamptz, '2024-08-01'::timestamptz, '2024-07-08'::timestamptz, '2024-07-05'::timestamptz,
     'https://invoice.stripe.com/acme_2024_07.pdf',
     NOW() - INTERVAL '5 months', NOW() - INTERVAL '5 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00002'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00001'::uuid,
     'in_acme_2024_08', 299.00, 299.00, 'usd', 'paid',
     '2024-08-01'::timestamptz, '2024-09-01'::timestamptz, '2024-08-08'::timestamptz, '2024-08-04'::timestamptz,
     'https://invoice.stripe.com/acme_2024_08.pdf',
     NOW() - INTERVAL '4 months', NOW() - INTERVAL '4 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00003'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00001'::uuid,
     'in_acme_2024_09', 299.00, 299.00, 'usd', 'paid',
     '2024-09-01'::timestamptz, '2024-10-01'::timestamptz, '2024-09-08'::timestamptz, '2024-09-06'::timestamptz,
     'https://invoice.stripe.com/acme_2024_09.pdf',
     NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00004'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00001'::uuid,
     'in_acme_2024_10', 299.00, 299.00, 'usd', 'paid',
     '2024-10-01'::timestamptz, '2024-11-01'::timestamptz, '2024-10-08'::timestamptz, '2024-10-03'::timestamptz,
     'https://invoice.stripe.com/acme_2024_10.pdf',
     NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00005'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00001'::uuid,
     'in_acme_2024_11', 299.00, 299.00, 'usd', 'paid',
     '2024-11-01'::timestamptz, '2024-12-01'::timestamptz, '2024-11-08'::timestamptz, '2024-11-02'::timestamptz,
     'https://invoice.stripe.com/acme_2024_11.pdf',
     NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00006'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00001'::uuid,
     'in_acme_2024_12', 299.00, 299.00, 'usd', 'paid',
     '2024-12-01'::timestamptz, '2025-01-01'::timestamptz, '2024-12-08'::timestamptz, '2024-12-03'::timestamptz,
     'https://invoice.stripe.com/acme_2024_12.pdf',
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

    -- Beta Real Estate Holdings - 3 paid invoices (Starter $99)
    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00007'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002'::uuid,
     'in_beta_2024_10', 99.00, 99.00, 'usd', 'paid',
     '2024-10-01'::timestamptz, '2024-11-01'::timestamptz, '2024-10-08'::timestamptz, '2024-10-05'::timestamptz,
     'https://invoice.stripe.com/beta_2024_10.pdf',
     NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00008'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002'::uuid,
     'in_beta_2024_11', 99.00, 99.00, 'usd', 'paid',
     '2024-11-01'::timestamptz, '2024-12-01'::timestamptz, '2024-11-08'::timestamptz, '2024-11-04'::timestamptz,
     'https://invoice.stripe.com/beta_2024_11.pdf',
     NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00009'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00002'::uuid,
     'in_beta_2024_12', 99.00, 99.00, 'usd', 'paid',
     '2024-12-01'::timestamptz, '2024-12-15'::timestamptz, '2024-12-08'::timestamptz, '2024-12-02'::timestamptz,
     'https://invoice.stripe.com/beta_2024_12.pdf',
     NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '2 weeks'),

    -- Gamma Medical Properties - 0 invoices (Free plan)

    -- Delta Tower Management - 6 paid invoices (Professional $299)
    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00010'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00004'::uuid,
     'in_delta_2024_07', 299.00, 299.00, 'usd', 'paid',
     '2024-07-01'::timestamptz, '2024-08-01'::timestamptz, '2024-07-08'::timestamptz, '2024-07-04'::timestamptz,
     'https://invoice.stripe.com/delta_2024_07.pdf',
     NOW() - INTERVAL '5 months', NOW() - INTERVAL '5 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00011'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00004'::uuid,
     'in_delta_2024_08', 299.00, 299.00, 'usd', 'paid',
     '2024-08-01'::timestamptz, '2024-09-01'::timestamptz, '2024-08-08'::timestamptz, '2024-08-06'::timestamptz,
     'https://invoice.stripe.com/delta_2024_08.pdf',
     NOW() - INTERVAL '4 months', NOW() - INTERVAL '4 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00012'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00004'::uuid,
     'in_delta_2024_09', 299.00, 299.00, 'usd', 'paid',
     '2024-09-01'::timestamptz, '2024-10-01'::timestamptz, '2024-09-08'::timestamptz, '2024-09-05'::timestamptz,
     'https://invoice.stripe.com/delta_2024_09.pdf',
     NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00013'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00004'::uuid,
     'in_delta_2024_10', 299.00, 299.00, 'usd', 'paid',
     '2024-10-01'::timestamptz, '2024-11-01'::timestamptz, '2024-10-08'::timestamptz, '2024-10-07'::timestamptz,
     'https://invoice.stripe.com/delta_2024_10.pdf',
     NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00014'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00004'::uuid,
     'in_delta_2024_11', 299.00, 299.00, 'usd', 'paid',
     '2024-11-01'::timestamptz, '2024-12-01'::timestamptz, '2024-11-08'::timestamptz, '2024-11-03'::timestamptz,
     'https://invoice.stripe.com/delta_2024_11.pdf',
     NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00015'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00004'::uuid,
     'in_delta_2024_12', 299.00, 299.00, 'usd', 'paid',
     '2024-12-01'::timestamptz, '2025-01-01'::timestamptz, '2024-12-08'::timestamptz, '2024-12-04'::timestamptz,
     'https://invoice.stripe.com/delta_2024_12.pdf',
     NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),

    -- Epsilon Ventures - 3 paid invoices (Starter $99)
    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00016'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00005'::uuid,
     'in_epsilon_2024_10', 99.00, 99.00, 'usd', 'paid',
     '2024-10-01'::timestamptz, '2024-11-01'::timestamptz, '2024-10-08'::timestamptz, '2024-10-06'::timestamptz,
     'https://invoice.stripe.com/epsilon_2024_10.pdf',
     NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00017'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00005'::uuid,
     'in_epsilon_2024_11', 99.00, 99.00, 'usd', 'paid',
     '2024-11-01'::timestamptz, '2024-12-01'::timestamptz, '2024-11-08'::timestamptz, '2024-11-05'::timestamptz,
     'https://invoice.stripe.com/epsilon_2024_11.pdf',
     NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month'),

    ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c00018'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b00005'::uuid,
     'in_epsilon_2024_12', 99.00, 99.00, 'usd', 'paid',
     '2024-12-01'::timestamptz, '2025-01-01'::timestamptz, '2024-12-08'::timestamptz, '2024-12-05'::timestamptz,
     'https://invoice.stripe.com/epsilon_2024_12.pdf',
     NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '   Created 18 invoices';
    RAISE NOTICE '   - Acme: 6 paid invoices ($299 × 6 = $1,794)';
    RAISE NOTICE '   - Beta: 3 paid invoices ($99 × 3 = $297)';
    RAISE NOTICE '   - Gamma: 0 invoices (free plan)';
    RAISE NOTICE '   - Delta: 6 paid invoices ($299 × 6 = $1,794)';
    RAISE NOTICE '   - Epsilon: 3 paid invoices ($99 × 3 = $297)';
    RAISE NOTICE '   - Total revenue: $4,182';
END $$;

-- ==============================================================================
-- SECTION 23: VERIFICATION QUERIES
-- ==============================================================================
-- Validate all entity counts match expected values

DO $$
DECLARE
    org_count INTEGER;
    user_count INTEGER;
    property_count INTEGER;
    unit_count INTEGER;
    lease_count INTEGER;
    pool_count INTEGER;
    mapping_count INTEGER;
    allocation_count INTEGER;
    batch_count INTEGER;
    gl_count INTEGER;
    snapshot_count INTEGER;
    job_count INTEGER;
    tenant_user_count INTEGER;
    lease_link_count INTEGER;
    invitation_count INTEGER;
    dispute_count INTEGER;
    comment_count INTEGER;
    attachment_count INTEGER;
    document_count INTEGER;
    subscription_count INTEGER;
    invoice_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '==================================================';
    RAISE NOTICE '[23/23] Verifying seed data counts...';
    RAISE NOTICE '==================================================';

    SELECT COUNT(*) INTO org_count FROM organizations;
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO property_count FROM properties;
    SELECT COUNT(*) INTO unit_count FROM units;
    SELECT COUNT(*) INTO lease_count FROM leases;
    SELECT COUNT(*) INTO pool_count FROM expense_pools;
    SELECT COUNT(*) INTO mapping_count FROM pool_mappings;
    SELECT COUNT(*) INTO allocation_count FROM pool_allocations;
    SELECT COUNT(*) INTO batch_count FROM import_batches;
    SELECT COUNT(*) INTO gl_count FROM gl_entries;
    SELECT COUNT(*) INTO snapshot_count FROM reconciliation_snapshots;
    SELECT COUNT(*) INTO job_count FROM calculation_jobs;
    SELECT COUNT(*) INTO tenant_user_count FROM tenant_users;
    SELECT COUNT(*) INTO lease_link_count FROM tenant_lease_links;
    SELECT COUNT(*) INTO invitation_count FROM tenant_invitations;
    SELECT COUNT(*) INTO dispute_count FROM disputes;
    SELECT COUNT(*) INTO comment_count FROM dispute_comments;
    SELECT COUNT(*) INTO attachment_count FROM dispute_attachments;
    SELECT COUNT(*) INTO document_count FROM documents;
    SELECT COUNT(*) INTO subscription_count FROM subscriptions;
    SELECT COUNT(*) INTO invoice_count FROM invoices;

    RAISE NOTICE 'Organizations: % (expected: 5)', org_count;
    RAISE NOTICE 'Users: % (expected: 15)', user_count;
    RAISE NOTICE 'Properties: % (expected: 6)', property_count;
    RAISE NOTICE 'Units: % (expected: 70+)', unit_count;
    RAISE NOTICE 'Leases: % (expected: 48)', lease_count;
    RAISE NOTICE 'Expense Pools: % (expected: 30+)', pool_count;
    RAISE NOTICE 'Pool Mappings: % (expected: 74)', mapping_count;
    RAISE NOTICE 'Pool Allocations: % (expected: 2)', allocation_count;
    RAISE NOTICE 'Import Batches: % (expected: 6)', batch_count;
    RAISE NOTICE 'GL Entries: % (expected: 1482)', gl_count;
    RAISE NOTICE 'Reconciliation Snapshots: % (expected: 24)', snapshot_count;
    RAISE NOTICE 'Calculation Jobs: % (expected: 8)', job_count;
    RAISE NOTICE 'Tenant Users: % (expected: 4)', tenant_user_count;
    RAISE NOTICE 'Tenant Lease Links: % (expected: 6)', lease_link_count;
    RAISE NOTICE 'Tenant Invitations: % (expected: 6)', invitation_count;
    RAISE NOTICE 'Disputes: % (expected: 6)', dispute_count;
    RAISE NOTICE 'Dispute Comments: % (expected: 24)', comment_count;
    RAISE NOTICE 'Dispute Attachments: % (expected: 4)', attachment_count;
    RAISE NOTICE 'Documents: % (expected: 10)', document_count;
    RAISE NOTICE 'Subscriptions: % (expected: 5)', subscription_count;
    RAISE NOTICE 'Invoices: % (expected: 18)', invoice_count;

    RAISE NOTICE '';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'SEED DATA VERIFICATION COMPLETE (23/24 Sections)';
    RAISE NOTICE '==================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Login credentials:';
    RAISE NOTICE '- owner@acme.example.com / TestPass123! (2 properties, Professional plan)';
    RAISE NOTICE '- owner@beta.example.com / TestPass123! (Retail Plaza, Starter plan, trialing)';
    RAISE NOTICE '- owner@gamma.example.com / TestPass123! (Medical Building, Free plan)';
    RAISE NOTICE '- owner@delta.example.com / TestPass123! (Class A Tower, Professional plan)';
    RAISE NOTICE '- owner@epsilon.example.com / TestPass123! (Industrial Complex, Starter plan)';
    RAISE NOTICE '- sarah.tenant@retailstore.com / TestPass123! (Tenant portal: 3 leases, 2 disputes)';
    RAISE NOTICE '';
END $$;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- ==============================================================================
-- SECTION 24: BACKFILL organization_id FOR RECONCILIATION_SNAPSHOTS
-- ==============================================================================
-- The trigger that auto-populates organization_id was disabled during seed.
-- Backfill organization_id for all snapshots by joining with properties table.

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '==================================================';
    RAISE NOTICE '[24/24] Backfilling organization_id for snapshots...';
    RAISE NOTICE '==================================================';
END $$;

UPDATE reconciliation_snapshots rs
SET organization_id = p.organization_id
FROM properties p
WHERE rs.property_id = p.id
AND rs.organization_id IS NULL;

DO $$
DECLARE
    total_count INTEGER;
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM reconciliation_snapshots;
    SELECT COUNT(*) INTO null_count FROM reconciliation_snapshots WHERE organization_id IS NULL;

    RAISE NOTICE '   Total snapshots: %', total_count;
    RAISE NOTICE '   Snapshots with NULL organization_id: %', null_count;

    IF null_count = 0 THEN
        RAISE NOTICE '   All snapshots now have organization_id set';
    ELSE
        RAISE WARNING '   WARNING: % snapshots still have NULL organization_id!', null_count;
    END IF;
END $$;

COMMIT;
