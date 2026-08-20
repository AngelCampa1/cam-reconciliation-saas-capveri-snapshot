-- ==============================================================================
-- CapVeri.com - PRODUCTION TEST Seed Data
-- ==============================================================================
--
-- ██╗    ██╗ █████╗ ██████╗ ███╗   ██╗██╗███╗   ██╗ ██████╗
-- ██║    ██║██╔══██╗██╔══██╗████╗  ██║██║████╗  ██║██╔════╝
-- ██║ █╗ ██║███████║██████╔╝██╔██╗ ██║██║██╔██╗ ██║██║  ███╗
-- ██║███╗██║██╔══██║██╔══██╗██║╚██╗██║██║██║╚██╗██║██║   ██║
-- ╚███╔███╔╝██║  ██║██║  ██║██║ ╚████║██║██║ ╚████║╚██████╔╝
--  ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═══╝ ╚═════╝
--
-- THIS SCRIPT IS FOR PRODUCTION TESTING ONLY!
--
-- SAFETY FEATURES:
-- - All organization/property names prefixed with [PROD-TEST]
-- - All user emails use prodtest+... pattern
-- - All UUIDs use ffffffff-... pattern (easily identifiable)
-- - All Stripe IDs use prodtest_ prefix
-- - Transaction-wrapped (rolls back on error)
--
-- TO RUN:
--   psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" \
--     -f supabase/seeds/seed_production_test.sql
--
-- TO CLEANUP:
--   psql "..." -f supabase/seeds/cleanup_production_test.sql
--
-- ==============================================================================

BEGIN;

-- Safety check: Warn if running in production
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  PRODUCTION TEST DATA SEED SCRIPT                            ║';
    RAISE NOTICE '║  All data will be prefixed with [PROD-TEST]                  ║';
    RAISE NOTICE '║  Run cleanup_production_test.sql to remove when done         ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
END $$;

-- Disable triggers temporarily for faster insertion
SET session_replication_role = replica;

-- ==============================================================================
-- SECTION 1: ORGANIZATIONS (6 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[1/14] Creating 6 [PROD-TEST] organizations...';
END $$;

INSERT INTO organizations (id, name, subscription_status, settings, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, '[PROD-TEST] Demo Company', 'active',
     '{"plan": "professional", "features": {"ai_extraction": true, "multi_property": true}}'::jsonb,
     NOW() - INTERVAL '1 year', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, '[PROD-TEST] Acme Property Management', 'active',
     '{"plan": "professional", "features": {"ai_extraction": true, "multi_property": true, "api_access": true}}'::jsonb,
     NOW() - INTERVAL '2 years', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, '[PROD-TEST] Beta Real Estate Holdings', 'trial',
     '{"plan": "starter", "trial_ends_at": "2025-12-31", "features": {"ai_extraction": true, "multi_property": false}}'::jsonb,
     NOW() - INTERVAL '30 days', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff0004'::uuid, '[PROD-TEST] Gamma Commercial Group', 'active',
     '{"plan": "free", "usage": {"properties": 1, "limit": 1}, "features": {"ai_extraction": false}}'::jsonb,
     NOW() - INTERVAL '6 months', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff0005'::uuid, '[PROD-TEST] Delta Development Corp', 'active',
     '{"plan": "professional", "features": {"ai_extraction": true, "multi_property": true, "advanced_analytics": true}}'::jsonb,
     NOW() - INTERVAL '5 years', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff0006'::uuid, '[PROD-TEST] Epsilon Ventures', 'active',
     '{"plan": "starter", "features": {"ai_extraction": true, "multi_property": false}}'::jsonb,
     NOW() - INTERVAL '1 year', NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 2: AUTH USERS (17 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[2/14] Creating 17 auth users...';
END $$;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
    -- Demo Company Users (2)
    ('ffffffff-ffff-ffff-ffff-ffffffff1001'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+admin@democompany.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1002'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+member@democompany.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    -- Acme Users (4)
    ('ffffffff-ffff-ffff-ffff-ffffffff1003'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+owner@acme.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1004'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+admin@acme.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1005'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+member@acme.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1006'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+viewer@acme.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    -- Beta Users (6 including 4 tenants)
    ('ffffffff-ffff-ffff-ffff-ffffffff1007'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+owner@beta.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1008'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+member@beta.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1009'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+sarah.tenant@retailstore.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1010'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+mike.tenant@coffeeshop.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1011'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+lisa.tenant@salon.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1012'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+david.tenant@gym.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    -- Other orgs (5)
    ('ffffffff-ffff-ffff-ffff-ffffffff1013'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+owner@gamma.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1014'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+owner@delta.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1015'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+admin@delta.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1016'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+owner@epsilon.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
    ('ffffffff-ffff-ffff-ffff-ffffffff1017'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prodtest+member@epsilon.example.com', crypt('TestPass123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT
    id::text,
    id,
    jsonb_build_object(
        'sub', id::text,
        'email', email,
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    id::text,
    NOW(),
    NOW(),
    NOW()
FROM auth.users
WHERE email LIKE 'prodtest+%'
ON CONFLICT (provider, provider_id) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    updated_at = NOW();

-- ==============================================================================
-- SECTION 3: PUBLIC USERS (17 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[3/14] Creating 17 user profiles...';
END $$;

INSERT INTO users (id, organization_id, email, full_name, role, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffff1001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, 'prodtest+admin@democompany.com', '[PROD-TEST] Demo Admin', 'admin', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, 'prodtest+member@democompany.com', '[PROD-TEST] Demo Member', 'member', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, 'prodtest+owner@acme.example.com', '[PROD-TEST] Alice Acme', 'owner', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1004'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, 'prodtest+admin@acme.example.com', '[PROD-TEST] Bob Administrator', 'admin', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, 'prodtest+member@acme.example.com', '[PROD-TEST] Charlie Member', 'member', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1006'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, 'prodtest+viewer@acme.example.com', '[PROD-TEST] Diana Viewer', 'viewer', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1007'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, 'prodtest+owner@beta.example.com', '[PROD-TEST] Eve Beta', 'owner', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1008'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, 'prodtest+member@beta.example.com', '[PROD-TEST] Frank Member', 'member', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1009'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, 'prodtest+sarah.tenant@retailstore.com', '[PROD-TEST] Sarah Retailer', 'tenant', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1010'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, 'prodtest+mike.tenant@coffeeshop.com', '[PROD-TEST] Mike Coffee', 'tenant', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1011'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, 'prodtest+lisa.tenant@salon.com', '[PROD-TEST] Lisa Stylist', 'tenant', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1012'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, 'prodtest+david.tenant@gym.com', '[PROD-TEST] David Fitness', 'tenant', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1013'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0004'::uuid, 'prodtest+owner@gamma.example.com', '[PROD-TEST] Grace Gamma', 'owner', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1014'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0005'::uuid, 'prodtest+owner@delta.example.com', '[PROD-TEST] Henry Delta', 'owner', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1015'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0005'::uuid, 'prodtest+admin@delta.example.com', '[PROD-TEST] Iris Administrator', 'admin', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1016'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0006'::uuid, 'prodtest+owner@epsilon.example.com', '[PROD-TEST] Jack Epsilon', 'owner', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff1017'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0006'::uuid, 'prodtest+member@epsilon.example.com', '[PROD-TEST] Karen Member', 'member', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 4: PROPERTIES (8 Total)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[4/14] Creating 8 [PROD-TEST] properties...';
END $$;

INSERT INTO properties (id, organization_id, name, address_line1, address_line2, city, state, postal_code, total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, '[PROD-TEST] Downtown Tower', '123 Main Street', 'Suite 1000', 'San Francisco', 'CA', '94102', 95000.00, 85000.00, 10000.00, 0.9500, NOW() - INTERVAL '1 year', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff2002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, '[PROD-TEST] Suburban Office Park', '456 Oak Avenue', 'Building A', 'Palo Alto', 'CA', '94301', 71000.00, 64000.00, 7000.00, 0.9500, NOW() - INTERVAL '6 months', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, '[PROD-TEST] Acme Downtown Tower', '100 Main Street', NULL, 'Denver', 'CO', '80202', 150000.00, 135000.00, 15000.00, 0.95, NOW() - INTERVAL '2 years', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff2004'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, '[PROD-TEST] Acme Suburban Office', '5000 Tech Center Drive', NULL, 'Denver', 'CO', '80237', 75000.00, 68000.00, 7000.00, 0.95, NOW() - INTERVAL '2 years', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, '[PROD-TEST] Retail Plaza', '2500 Shopping Center Road', NULL, 'Boulder', 'CO', '80301', 50000.00, 45000.00, 5000.00, 0.92, NOW() - INTERVAL '1 year', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff2006'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0004'::uuid, '[PROD-TEST] Medical Office Building', '123 Healthcare Drive', NULL, 'Aurora', 'CO', '80012', 30000.00, 27000.00, 3000.00, 0.90, NOW() - INTERVAL '6 months', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff2007'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0005'::uuid, '[PROD-TEST] Class A Office Tower', '1000 Corporate Plaza', NULL, 'Denver', 'CO', '80202', 200000.00, 180000.00, 20000.00, 0.95, NOW() - INTERVAL '5 years', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff2008'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0006'::uuid, '[PROD-TEST] Industrial Complex', '789 Warehouse Way', NULL, 'Commerce City', 'CO', '80022', 100000.00, 95000.00, 5000.00, 0.90, NOW() - INTERVAL '1 year', NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 5: UNITS
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[5/14] Creating units...';
END $$;

INSERT INTO units (id, property_id, unit_number, floor, rentable_sqft, usable_sqft, status, created_at, updated_at)
VALUES
    -- Demo Downtown Tower Units (5)
    ('ffffffff-ffff-ffff-ffff-ffffffff3001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, '101', 1, 5000.00, 4600.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, '102', 1, 5000.00, 4600.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, '201', 2, 5000.00, 4600.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3004'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, '202', 2, 5000.00, 4600.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, '301', 3, 5000.00, 4600.00, 'vacant', NOW(), NOW()),
    -- Acme Downtown Tower Units (5)
    ('ffffffff-ffff-ffff-ffff-ffffffff3006'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, '0201', 2, 6000.00, 5400.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3007'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, '0301', 3, 6000.00, 5400.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3008'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, '0401', 4, 6000.00, 5400.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3009'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, '0501', 5, 6000.00, 5400.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3010'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, '0601', 6, 6000.00, 5400.00, 'vacant', NOW(), NOW()),
    -- Beta Retail Plaza Units (4)
    ('ffffffff-ffff-ffff-ffff-ffffffff3011'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'Store 1', 1, 5000.00, 4500.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3012'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'Store 2', 1, 4000.00, 3600.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3013'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'Store 3', 1, 3500.00, 3150.00, 'occupied', NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff3014'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'Store 4', 1, 6000.00, 5400.00, 'occupied', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 6: LEASES
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[6/14] Creating leases...';
END $$;

INSERT INTO leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at, updated_at)
VALUES
    -- Demo Company Leases (4)
    ('ffffffff-ffff-ffff-ffff-ffffffff4001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3001'::uuid,
     '[PROD-TEST] Acme Corporation', '2023-01-01', '2028-12-31', 'active',
     '{"base_year": 2023, "pro_rata_share": "0.05", "admin_fee_percent": "0.15", "gross_up_target": "0.95", "cap_type": "cumulative", "cap_rate": "0.05"}'::jsonb,
     NOW() - INTERVAL '1 year', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3002'::uuid,
     '[PROD-TEST] Beta Industries', '2023-06-01', '2028-05-31', 'active',
     '{"base_year": 2023, "pro_rata_share": "0.05", "admin_fee_percent": "0.15", "gross_up_target": "0.95", "cap_type": "non_cumulative", "cap_rate": "0.04"}'::jsonb,
     NOW() - INTERVAL '1 year', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3003'::uuid,
     '[PROD-TEST] Gamma LLC', '2024-01-01', '2029-12-31', 'active',
     '{"base_year": 2024, "pro_rata_share": "0.05", "admin_fee_percent": "0.15", "gross_up_target": "0.95", "cap_type": "none"}'::jsonb,
     NOW() - INTERVAL '6 months', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4004'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3004'::uuid,
     '[PROD-TEST] Delta Technologies', '2024-03-01', '2027-02-28', 'active',
     '{"base_year": 2024, "pro_rata_share": "0.05", "admin_fee_percent": "0.15", "gross_up_target": "0.95", "cap_type": "cumulative_compounding", "cap_rate": "0.05"}'::jsonb,
     NOW() - INTERVAL '3 months', NOW()),
    -- Acme Downtown Tower Leases (4)
    ('ffffffff-ffff-ffff-ffff-ffffffff4005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3006'::uuid,
     '[PROD-TEST] TechCorp Inc', '2023-01-01', '2028-12-31', 'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.05", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15"}'::jsonb,
     NOW() - INTERVAL '2 years', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4006'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3007'::uuid,
     '[PROD-TEST] FinanceGroup LLC', '2022-06-01', '2027-05-31', 'active',
     '{"base_year": 2022, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.048", "cap_type": "cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15"}'::jsonb,
     NOW() - INTERVAL '2.5 years', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4007'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3008'::uuid,
     '[PROD-TEST] Legal Associates', '2023-03-01', '2028-02-28', 'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.042", "cap_type": "non_cumulative", "cap_rate": "0.06", "admin_fee_percentage": "0.15"}'::jsonb,
     NOW() - INTERVAL '21 months', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4008'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3009'::uuid,
     '[PROD-TEST] Consulting Partners', '2024-01-01', '2029-12-31', 'active',
     '{"base_year": 2024, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.045", "cap_type": "none", "cap_rate": null, "admin_fee_percentage": "0.15"}'::jsonb,
     NOW() - INTERVAL '12 months', NOW()),
    -- Beta Retail Plaza Leases (4 - linked to tenant users)
    ('ffffffff-ffff-ffff-ffff-ffffffff4009'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3011'::uuid,
     '[PROD-TEST] Sarah''s Retail Store', '2023-01-01', '2028-12-31', 'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.10", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15"}'::jsonb,
     NOW() - INTERVAL '1 year', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4010'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3012'::uuid,
     '[PROD-TEST] Mike''s Coffee Shop', '2023-02-01', '2028-01-31', 'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.08", "cap_type": "non_cumulative", "cap_rate": "0.06", "admin_fee_percentage": "0.15"}'::jsonb,
     NOW() - INTERVAL '11 months', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4011'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3013'::uuid,
     '[PROD-TEST] Lisa''s Hair Salon', '2023-03-01', '2028-02-28', 'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.07", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15"}'::jsonb,
     NOW() - INTERVAL '10 months', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff4012'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff3014'::uuid,
     '[PROD-TEST] David''s Fitness Center', '2023-04-01', '2028-03-31', 'active',
     '{"base_year": 2023, "base_year_amount": null, "gross_up_base_year": true, "pro_rata_share": "0.12", "cap_type": "cumulative_compounding", "cap_rate": "0.05", "admin_fee_percentage": "0.15"}'::jsonb,
     NOW() - INTERVAL '9 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 7: EXPENSE POOLS
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[7/14] Creating expense pools...';
END $$;

INSERT INTO expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffff5001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, 'Operating Expenses', 'operating', true, 0.95, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff5002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, 'Real Estate Taxes', 'tax', false, NULL, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff5003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid, 'Insurance', 'insurance', false, NULL, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff5004'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, 'Operating Expenses', 'operating', true, 0.95, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff5005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid, 'Real Estate Taxes', 'tax', false, NULL, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff5006'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'CAM Expenses', 'operating', true, 0.92, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff5007'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid, 'Real Estate Taxes', 'tax', false, NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 8: POOL MAPPINGS
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[8/14] Creating pool mappings...';
END $$;

INSERT INTO pool_mappings (id, expense_pool_id, gl_account_pattern, allocation_percentage, priority, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffff6001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff5001'::uuid, '5*', 1.0000, 0, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff6002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff5002'::uuid, '61*', 1.0000, 0, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff6003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff5003'::uuid, '62*', 1.0000, 0, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff6004'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff5004'::uuid, '5*', 1.0000, 0, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff6005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff5005'::uuid, '61*', 1.0000, 0, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff6006'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff5006'::uuid, '5*', 1.0000, 0, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff6007'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff5007'::uuid, '61*', 1.0000, 0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 9: IMPORT BATCHES (required for GL entries)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[9/14] Creating import batches...';
END $$;

INSERT INTO import_batches (id, organization_id, property_id, file_name, file_hash, source_system, status, row_count, error_count, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '[PROD-TEST] gl_export_2024.csv', 'ffffffff0000000000000000000000000000000000000000000000000000001a', 'yardi', 'completed', 10, 0, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff8002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid,
     '[PROD-TEST] acme_gl_2024.csv', 'ffffffff0000000000000000000000000000000000000000000000000000002b', 'yardi', 'completed', 5, 0, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff8003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid,
     '[PROD-TEST] beta_gl_2024.csv', 'ffffffff0000000000000000000000000000000000000000000000000000003c', 'mri', 'completed', 5, 0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 10: GL ENTRIES
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[10/14] Creating GL entries...';
END $$;

INSERT INTO gl_entries (id, import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, description, raw_row_data, created_at)
VALUES
    -- Demo Downtown Tower entries
    ('ffffffff-ffff-ffff-ffff-ffffffff7001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '5100', 'Janitorial Services', 12500.00, '2024-01-15', 2024, 1, 'ABC Cleaning', '[PROD-TEST] Monthly janitorial', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '5200', 'Utilities - Electric', 18750.00, '2024-01-20', 2024, 1, 'PG&E', '[PROD-TEST] January electric', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '5300', 'HVAC Maintenance', 8500.00, '2024-01-25', 2024, 1, 'Cool Air Inc', '[PROD-TEST] HVAC service', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7004'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '6100', 'Property Taxes Q1', 45000.00, '2024-02-01', 2024, 2, 'SF County', '[PROD-TEST] Q1 property taxes', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7005'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '6200', 'Insurance Premium', 22000.00, '2024-02-15', 2024, 2, 'State Farm', '[PROD-TEST] Annual premium', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7006'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '5100', 'Janitorial Services', 12500.00, '2024-02-15', 2024, 2, 'ABC Cleaning', '[PROD-TEST] Monthly janitorial', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7007'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '5200', 'Utilities - Electric', 17500.00, '2024-02-20', 2024, 2, 'PG&E', '[PROD-TEST] February electric', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7008'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '5400', 'Security Services', 15000.00, '2024-03-01', 2024, 3, 'SecureGuard', '[PROD-TEST] Monthly security', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7009'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '5100', 'Janitorial Services', 12500.00, '2024-03-15', 2024, 3, 'ABC Cleaning', '[PROD-TEST] Monthly janitorial', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7010'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2001'::uuid,
     '5200', 'Utilities - Electric', 16250.00, '2024-03-20', 2024, 3, 'PG&E', '[PROD-TEST] March electric', '{}'::jsonb, NOW()),
    -- Acme Downtown Tower entries
    ('ffffffff-ffff-ffff-ffff-ffffffff7011'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid,
     '5100', 'Janitorial Services', 25000.00, '2024-01-15', 2024, 1, 'CleanCo', '[PROD-TEST] Monthly janitorial', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7012'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid,
     '5200', 'Utilities - Electric', 35000.00, '2024-01-20', 2024, 1, 'Xcel Energy', '[PROD-TEST] January electric', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7013'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid,
     '6100', 'Property Taxes Q1', 85000.00, '2024-02-01', 2024, 2, 'Denver County', '[PROD-TEST] Q1 taxes', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7014'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid,
     '6200', 'Insurance Premium', 42000.00, '2024-02-15', 2024, 2, 'Travelers', '[PROD-TEST] Annual premium', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7015'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8002'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2003'::uuid,
     '5100', 'Janitorial Services', 25000.00, '2024-02-15', 2024, 2, 'CleanCo', '[PROD-TEST] Monthly janitorial', '{}'::jsonb, NOW()),
    -- Beta Retail Plaza entries
    ('ffffffff-ffff-ffff-ffff-ffffffff7016'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid,
     '5100', 'CAM - Common Area', 8500.00, '2024-01-15', 2024, 1, 'Retail Maint Co', '[PROD-TEST] CAM', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7017'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid,
     '5200', 'Utilities - Electric', 6500.00, '2024-01-20', 2024, 1, 'Xcel Energy', '[PROD-TEST] January electric', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7018'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid,
     '6100', 'Property Taxes Q1', 28000.00, '2024-02-01', 2024, 2, 'Boulder County', '[PROD-TEST] Q1 taxes', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7019'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid,
     '6200', 'Insurance Premium', 15000.00, '2024-02-15', 2024, 2, 'Allstate', '[PROD-TEST] Annual premium', '{}'::jsonb, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffff7020'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff8003'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff2005'::uuid,
     '5100', 'CAM - Common Area', 8500.00, '2024-02-15', 2024, 2, 'Retail Maint Co', '[PROD-TEST] CAM', '{}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 11: TENANT USERS
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[11/14] Creating tenant users...';
END $$;

INSERT INTO tenant_users (id, user_id, organization_id, contact_name, contact_email, created_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffffffa1'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff1009'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, '[PROD-TEST] Sarah Retailer', 'prodtest+sarah.tenant@retailstore.com', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffa2'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff1010'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, '[PROD-TEST] Mike Coffee', 'prodtest+mike.tenant@coffeeshop.com', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffa3'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff1011'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, '[PROD-TEST] Lisa Stylist', 'prodtest+lisa.tenant@salon.com', NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffa4'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff1012'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, '[PROD-TEST] David Fitness', 'prodtest+david.tenant@gym.com', NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 12: TENANT LEASE LINKS
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[12/14] Creating tenant lease links...';
END $$;

INSERT INTO tenant_lease_links (tenant_user_id, lease_id, created_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffffffa1'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff4009'::uuid, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffa2'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff4010'::uuid, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffa3'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff4011'::uuid, NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffa4'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff4012'::uuid, NOW())
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- SECTION 13: SUBSCRIPTIONS (Billing)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '[13/14] Creating subscriptions...';
END $$;

INSERT INTO subscriptions (id, organization_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, building_count, created_at, updated_at)
VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffffffc1'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, 'sub_prodtest_demo001', 'cus_prodtest_demo001', 'growth', 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', false, 2, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffc2'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid, 'sub_prodtest_acme001', 'cus_prodtest_acme001', 'growth', 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', false, 2, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffc3'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0003'::uuid, 'sub_prodtest_beta002', 'cus_prodtest_beta002', 'growth', 'trialing', NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', false, 1, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffc4'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0004'::uuid, NULL, NULL, 'growth', 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', false, 1, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffc5'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0005'::uuid, 'sub_prodtest_delta004', 'cus_prodtest_delta004', 'growth', 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', false, 1, NOW(), NOW()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffc6'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0006'::uuid, 'sub_prodtest_epsilon005', 'cus_prodtest_epsilon005', 'growth', 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', false, 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 14: FINALIZATION
-- ==============================================================================

-- Re-enable triggers
SET session_replication_role = DEFAULT;

DO $$
DECLARE
    org_count INTEGER;
    user_count INTEGER;
    property_count INTEGER;
    lease_count INTEGER;
    gl_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations WHERE name LIKE '[PROD-TEST]%';
    SELECT COUNT(*) INTO user_count FROM users WHERE email LIKE 'prodtest+%';
    SELECT COUNT(*) INTO property_count FROM properties WHERE name LIKE '[PROD-TEST]%';
    SELECT COUNT(*) INTO lease_count FROM leases WHERE tenant_name LIKE '[PROD-TEST]%';
    SELECT COUNT(*) INTO gl_count FROM gl_entries WHERE id::text LIKE 'ffffffff-ffff-ffff-ffff-ffffffff7%';

    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  PRODUCTION TEST DATA SEEDED SUCCESSFULLY                    ║';
    RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║  Organizations: %', LPAD(org_count::text, 3);
    RAISE NOTICE '║  Users:         %', LPAD(user_count::text, 3);
    RAISE NOTICE '║  Properties:    %', LPAD(property_count::text, 3);
    RAISE NOTICE '║  Leases:        %', LPAD(lease_count::text, 3);
    RAISE NOTICE '║  GL Entries:    %', LPAD(gl_count::text, 3);
    RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║  Password for all users: TestPass123!                        ║';
    RAISE NOTICE '║  To cleanup: Run cleanup_production_test.sql                 ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
END $$;

COMMIT;
