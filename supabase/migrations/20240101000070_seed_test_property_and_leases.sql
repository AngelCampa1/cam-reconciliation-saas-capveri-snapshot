-- Seed a property and leases for the E2E test user's organization.
-- Guard: only runs when the test organization exists (local/staging environments).
-- In production this org is absent, so the block is silently skipped.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000000001'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.properties (id, organization_id, name, address_line1, city, state, postal_code, total_rentable_sqft, total_usable_sqft, common_area_sqft)
  VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'E2E Test Building',
    '123 Main Street',
    'Austin', 'TX', '78701',
    50000, 45000, 5000
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.leases (id, organization_id, property_id, tenant_name, start_date, end_date, status, recovery_profile)
  VALUES
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010',
     'Tenant Alpha Corp', '2023-01-01', '2027-12-31', 'active',
     '{"base_year": 2023, "pro_rata_share": "0.06238", "cap_type": "cumulative", "cap_rate": "0.05", "admin_fee_percentage": "0.15", "gross_up_base_year": true, "base_year_amount": null, "excluded_pools": []}'),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010',
     'Tenant Beta LLC', '2023-06-01', '2028-05-31', 'active',
     '{"base_year": 2023, "pro_rata_share": "0.07074", "cap_type": "non_cumulative", "cap_rate": "0.03", "admin_fee_percentage": "0.10", "gross_up_base_year": false, "base_year_amount": null, "excluded_pools": []}'),
    ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010',
     'Tenant Gamma Inc', '2024-01-01', '2029-12-31', 'draft',
     '{"base_year": 2024, "pro_rata_share": "0.05500", "cap_type": "cumulative", "cap_rate": "0.04", "admin_fee_percentage": "0.15", "gross_up_base_year": true, "base_year_amount": null, "excluded_pools": []}')
  ON CONFLICT (id) DO NOTHING;
END $$;
