-- ==============================================================================
-- CapVeri.com - Onboarding Test Data (Positive Leakage)
-- ==============================================================================
-- Creates test data for the onboarding-test user to demonstrate leakage
--
-- Property: Test Property GL Fix (381f573f-e8ed-4986-b398-0efa43d0367b)
-- Org: 79b015fb-d583-4e75-aa77-c43ed4439d6a
--
-- USAGE:
--   psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seeds/seed_onboarding_test.sql
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_org_id UUID := '79b015fb-d583-4e75-aa77-c43ed4439d6a';
    v_property_id UUID := '381f573f-e8ed-4986-b398-0efa43d0367b';
    v_unit1_id UUID := gen_random_uuid();
    v_unit2_id UUID := gen_random_uuid();
    v_unit3_id UUID := gen_random_uuid();
    v_lease1_id UUID := gen_random_uuid();
    v_lease2_id UUID := gen_random_uuid();
    v_lease3_id UUID := gen_random_uuid();
    v_snapshot1_id UUID := gen_random_uuid();
    v_snapshot2_id UUID := gen_random_uuid();
    v_snapshot3_id UUID := gen_random_uuid();
BEGIN
    RAISE NOTICE 'Seeding leakage test data for Test Property GL Fix';

    -- ==============================================================================
    -- UNITS (3 units)
    -- ==============================================================================
    INSERT INTO public.units (id, property_id, unit_number, floor, rentable_sqft, usable_sqft, status, created_at, updated_at)
    VALUES
        (v_unit1_id, v_property_id, 'Suite 101', 1, 15000.00, 13500.00, 'occupied', NOW(), NOW()),
        (v_unit2_id, v_property_id, 'Suite 201', 2, 25000.00, 22500.00, 'occupied', NOW(), NOW()),
        (v_unit3_id, v_property_id, 'Suite 301', 3, 20000.00, 18000.00, 'occupied', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created 3 units';

    -- ==============================================================================
    -- LEASES (3 tenants)
    -- ==============================================================================
    INSERT INTO public.leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at, updated_at)
    VALUES
        (
            v_lease1_id, v_property_id, v_unit1_id,
            'Metro Coffee Co',
            '2025-01-01', '2029-12-31', 'active',
            '{"base_year": 2024, "pro_rata_share": 0.25, "expense_caps": {}, "exclusions": [], "gross_up_enabled": true}'::jsonb,
            NOW(), NOW()
        ),
        (
            v_lease2_id, v_property_id, v_unit2_id,
            'Pinnacle Financial',
            '2025-01-01', '2028-12-31', 'active',
            '{"base_year": 2024, "pro_rata_share": 0.42, "expense_caps": {}, "exclusions": [], "gross_up_enabled": true}'::jsonb,
            NOW(), NOW()
        ),
        (
            v_lease3_id, v_property_id, v_unit3_id,
            'HealthFirst Clinic',
            '2025-01-01', '2030-12-31', 'active',
            '{"base_year": 2024, "pro_rata_share": 0.33, "expense_caps": {}, "exclusions": [], "gross_up_enabled": true}'::jsonb,
            NOW(), NOW()
        )
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created 3 leases';

    -- ==============================================================================
    -- RECONCILIATION SNAPSHOTS (finalized - what tenants SHOULD pay)
    -- Total calculated recovery: $127,500
    -- ==============================================================================
    INSERT INTO public.reconciliation_snapshots (
        id, organization_id, property_id, lease_id,
        period_start_date, period_end_date, status,
        total_operating_expenses, grossed_up_expenses, base_year_amount,
        tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
        calculation_trace, created_at, updated_at, finalized_at
    )
    VALUES
        (
            v_snapshot1_id, v_org_id, v_property_id, v_lease1_id,
            '2025-01-01', '2025-12-31', 'finalized',
            180000.00, 185000.00, 0.00,
            46250.00, 46250.00, 1250.00, 32500.00,
            '[{"step": "pro_rata", "tenant_name": "Metro Coffee Co", "share": 0.25}]'::jsonb,
            NOW(), NOW(), NOW()
        ),
        (
            v_snapshot2_id, v_org_id, v_property_id, v_lease2_id,
            '2025-01-01', '2025-12-31', 'finalized',
            180000.00, 190000.00, 0.00,
            79800.00, 79800.00, 2200.00, 55000.00,
            '[{"step": "pro_rata", "tenant_name": "Pinnacle Financial", "share": 0.42}]'::jsonb,
            NOW(), NOW(), NOW()
        ),
        (
            v_snapshot3_id, v_org_id, v_property_id, v_lease3_id,
            '2025-01-01', '2025-12-31', 'finalized',
            180000.00, 188000.00, 0.00,
            62040.00, 62040.00, 1960.00, 40000.00,
            '[{"step": "pro_rata", "tenant_name": "HealthFirst Clinic", "share": 0.33}]'::jsonb,
            NOW(), NOW(), NOW()
        )
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created 3 finalized reconciliation snapshots';
    RAISE NOTICE 'Total calculated recovery: $127,500';

    -- ==============================================================================
    -- ACTUAL BILLED AMOUNTS (what was actually billed - LESS than calculated)
    -- Total billed: $85,000 (leaving $42,500 on the table = 33% leakage!)
    -- ==============================================================================
    -- First, delete any existing billed amounts for this property/period
    DELETE FROM public.actual_billed_amounts
    WHERE property_id = v_property_id
    AND period_start_date = '2025-01-01'
    AND period_end_date = '2025-12-31';

    INSERT INTO public.actual_billed_amounts (
        id, organization_id, property_id, lease_id,
        tenant_name, billed_amount,
        period_start_date, period_end_date,
        source_type, created_at, updated_at
    )
    VALUES
        (
            gen_random_uuid(), v_org_id, v_property_id, v_lease1_id,
            'Metro Coffee Co', 22000.00,  -- Should be $32,500 (missed $10,500)
            '2025-01-01', '2025-12-31',
            'manual_entry', NOW(), NOW()
        ),
        (
            gen_random_uuid(), v_org_id, v_property_id, v_lease2_id,
            'Pinnacle Financial', 38000.00,  -- Should be $55,000 (missed $17,000)
            '2025-01-01', '2025-12-31',
            'manual_entry', NOW(), NOW()
        ),
        (
            gen_random_uuid(), v_org_id, v_property_id, v_lease3_id,
            'HealthFirst Clinic', 25000.00,  -- Should be $40,000 (missed $15,000)
            '2025-01-01', '2025-12-31',
            'manual_entry', NOW(), NOW()
        )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Created 3 actual billed records';
    RAISE NOTICE '';
    RAISE NOTICE '=== LEAKAGE SUMMARY ===';
    RAISE NOTICE 'CapVeri Calculated: $127,500';
    RAISE NOTICE 'Actually Billed:     $85,000';
    RAISE NOTICE 'Recovery Opportunity: $42,500 (33.3%%)';
    RAISE NOTICE '======================';

END $$;

COMMIT;
