-- ==============================================================================
-- CapVeri.com - Leakage Test Data
-- ==============================================================================
--
-- PURPOSE: Creates test data for leakage calculation demonstration
--
-- USAGE:
--   psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seeds/seed_leakage_test.sql
--
-- ==============================================================================

BEGIN;

-- Organization and Property IDs for pm-test-456 user
-- (These were created during onboarding)
DO $$
DECLARE
    v_org_id UUID := 'de64f2e9-36f8-4e3c-9b76-780a1ef13bc7';
    v_property_id UUID := '854a6c61-8c26-422c-ac0f-f9f7aeabcd54';
    v_unit1_id UUID := gen_random_uuid();
    v_unit2_id UUID := gen_random_uuid();
    v_unit3_id UUID := gen_random_uuid();
    v_lease1_id UUID := gen_random_uuid();
    v_lease2_id UUID := gen_random_uuid();
    v_lease3_id UUID := gen_random_uuid();
    v_batch_id UUID := gen_random_uuid();
    v_snapshot1_id UUID := gen_random_uuid();
    v_snapshot2_id UUID := gen_random_uuid();
    v_snapshot3_id UUID := gen_random_uuid();
BEGIN
    RAISE NOTICE 'Seeding leakage test data for org % and property %', v_org_id, v_property_id;

    -- ==============================================================================
    -- UNITS (3 units for Sunrise Plaza)
    -- ==============================================================================
    INSERT INTO public.units (id, property_id, unit_number, floor, rentable_sqft, usable_sqft, status, created_at, updated_at)
    VALUES
        (v_unit1_id, v_property_id, 'Suite 100', 1, 25000.00, 22500.00, 'occupied', NOW(), NOW()),
        (v_unit2_id, v_property_id, 'Suite 200', 2, 50000.00, 45000.00, 'occupied', NOW(), NOW()),
        (v_unit3_id, v_property_id, 'Suite 300', 3, 50000.00, 45000.00, 'occupied', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created 3 units';

    -- ==============================================================================
    -- LEASES (3 tenants with different recovery profiles)
    -- ==============================================================================
    INSERT INTO public.leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at, updated_at)
    VALUES
        (
            v_lease1_id, v_property_id, v_unit1_id,
            'Acme Corporation',
            '2024-01-01', '2029-12-31', 'active',
            '{"base_year": 2024, "pro_rata_share": 0.20, "expense_caps": {"operating": null, "tax": null, "insurance": null}, "exclusions": [], "gross_up_enabled": true}'::jsonb,
            NOW(), NOW()
        ),
        (
            v_lease2_id, v_property_id, v_unit2_id,
            'TechStart Inc',
            '2024-01-01', '2028-12-31', 'active',
            '{"base_year": 2024, "pro_rata_share": 0.40, "expense_caps": {"operating": 50000, "tax": null, "insurance": null}, "exclusions": [], "gross_up_enabled": true}'::jsonb,
            NOW(), NOW()
        ),
        (
            v_lease3_id, v_property_id, v_unit3_id,
            'Global Services LLC',
            '2024-01-01', '2027-12-31', 'active',
            '{"base_year": 2024, "pro_rata_share": 0.40, "expense_caps": {"operating": null, "tax": null, "insurance": null}, "exclusions": ["capital"], "gross_up_enabled": true}'::jsonb,
            NOW(), NOW()
        )
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created 3 leases';

    -- ==============================================================================
    -- IMPORT BATCH (for GL entries)
    -- ==============================================================================
    INSERT INTO public.import_batches (id, organization_id, property_id, file_name, file_hash, source_system, status, row_count, created_at, updated_at)
    VALUES
        (v_batch_id, v_org_id, v_property_id, 'sunrise_plaza_gl_2025.csv', 'hash_leakage_test_' || v_batch_id::text, 'yardi', 'completed', 12, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created import batch';

    -- ==============================================================================
    -- GL ENTRIES (operating expenses for 2025)
    -- ==============================================================================
    INSERT INTO public.gl_entries (import_batch_id, property_id, account_code, account_description, amount, transaction_date, period_year, period_month, vendor_name, created_at)
    VALUES
        -- Q1 2025 Operating Expenses
        (v_batch_id, v_property_id, '5200', 'Electric Service', 15000.00, '2025-01-15', 2025, 1, 'City Power & Light', NOW()),
        (v_batch_id, v_property_id, '5210', 'Gas Service', 4500.00, '2025-01-20', 2025, 1, 'Metro Gas Company', NOW()),
        (v_batch_id, v_property_id, '5300', 'Janitorial Services', 12000.00, '2025-02-01', 2025, 2, 'CleanPro Services', NOW()),
        (v_batch_id, v_property_id, '5500', 'Security Services', 8000.00, '2025-02-15', 2025, 2, 'SecureGuard Inc', NOW()),
        -- Taxes
        (v_batch_id, v_property_id, '5100', 'Property Tax', 65000.00, '2025-01-05', 2025, 1, 'County Tax Assessor', NOW()),
        (v_batch_id, v_property_id, '6100', 'Real Estate Tax', 32000.00, '2025-04-01', 2025, 4, 'City Tax Collector', NOW()),
        -- Insurance
        (v_batch_id, v_property_id, '5110', 'Property Insurance', 22000.00, '2025-01-01', 2025, 1, 'National Insurance Co', NOW()),
        (v_batch_id, v_property_id, '5120', 'Liability Insurance', 11000.00, '2025-01-01', 2025, 1, 'Acme Insurance Group', NOW()),
        -- Maintenance
        (v_batch_id, v_property_id, '5400', 'HVAC Maintenance', 18000.00, '2025-03-15', 2025, 3, 'CoolAir Systems', NOW()),
        (v_batch_id, v_property_id, '5410', 'Elevator Maintenance', 14000.00, '2025-04-20', 2025, 4, 'Otis Elevator', NOW()),
        (v_batch_id, v_property_id, '5600', 'Landscaping', 6000.00, '2025-05-10', 2025, 5, 'Green Thumb Landscaping', NOW()),
        (v_batch_id, v_property_id, '5700', 'Common Area Repairs', 8500.00, '2025-06-05', 2025, 6, 'BuildRight Contractors', NOW())
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Created 12 GL entries totaling $216,000';

    -- ==============================================================================
    -- RECONCILIATION SNAPSHOTS (finalized - what tenants SHOULD pay)
    -- Total recovery: $125,000 (calculated CAM charges)
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
            216000.00, 221000.00, 0.00,
            44200.00, 44200.00, 800.00, 25000.00,
            '[{"step": "pro_rata", "tenant_name": "Acme Corporation"}]'::jsonb,
            NOW(), NOW(), NOW()
        ),
        (
            v_snapshot2_id, v_org_id, v_property_id, v_lease2_id,
            '2025-01-01', '2025-12-31', 'finalized',
            216000.00, 224000.00, 0.00,
            89600.00, 50000.00, 0.00, 50000.00,
            '[{"step": "pro_rata", "tenant_name": "TechStart Inc", "cap_applied": true}]'::jsonb,
            NOW(), NOW(), NOW()
        ),
        (
            v_snapshot3_id, v_org_id, v_property_id, v_lease3_id,
            '2025-01-01', '2025-12-31', 'finalized',
            216000.00, 226000.00, 0.00,
            90400.00, 90400.00, 0.00, 50000.00,
            '[{"step": "pro_rata", "tenant_name": "Global Services LLC"}]'::jsonb,
            NOW(), NOW(), NOW()
        )
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created 3 finalized reconciliation snapshots (total_recovery: $125,000)';

    -- ==============================================================================
    -- ACTUAL BILLED AMOUNTS (what was actually billed - LESS than calculated)
    -- Total billed: $98,500 (leaving $26,500 on the table!)
    -- ==============================================================================
    INSERT INTO public.actual_billed_amounts (
        id, organization_id, property_id, lease_id,
        tenant_name, billed_amount,
        period_start_date, period_end_date,
        source_type, created_at, updated_at
    )
    VALUES
        (
            gen_random_uuid(), v_org_id, v_property_id, v_lease1_id,
            'Acme Corporation', 20000.00,  -- Should be $25,000 (missed $5,000)
            '2025-01-01', '2025-12-31',
            'csv_import', NOW(), NOW()
        ),
        (
            gen_random_uuid(), v_org_id, v_property_id, v_lease2_id,
            'TechStart Inc', 38500.00,  -- Should be $50,000 (missed $11,500)
            '2025-01-01', '2025-12-31',
            'csv_import', NOW(), NOW()
        ),
        (
            gen_random_uuid(), v_org_id, v_property_id, v_lease3_id,
            'Global Services LLC', 40000.00,  -- Should be $50,000 (missed $10,000)
            '2025-01-01', '2025-12-31',
            'csv_import', NOW(), NOW()
        )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Created 3 actual billed records (total: $98,500)';
    RAISE NOTICE '';
    RAISE NOTICE '=== LEAKAGE SUMMARY ===';
    RAISE NOTICE 'CapVeri Calculated: $125,000';
    RAISE NOTICE 'Actually Billed:     $98,500';
    RAISE NOTICE 'Recovery Opportunity: $26,500 (21.2%%)';
    RAISE NOTICE '======================';

END $$;

COMMIT;
