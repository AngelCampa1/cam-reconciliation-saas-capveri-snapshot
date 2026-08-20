-- Test Property Seed Script for E2E Tests
-- Creates sample property, unit, and lease for read-only test scenarios
-- Run this script after test user seeding
-- Note: Uses fixed UUIDs for predictable test data

BEGIN;

-- Create sample property
INSERT INTO public.properties (
  id,
  organization_id,
  name,
  address_line1,
  city,
  state,
  postal_code,
  total_rentable_sqft,
  total_usable_sqft,
  common_area_sqft,
  created_at,
  updated_at
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001', -- E2E Test Organization
  'Sample Plaza',
  '456 Sample St',
  'Los Angeles',
  'CA',
  '90001',
  25000.00,
  22500.00,
  2500.00,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  postal_code = EXCLUDED.postal_code,
  total_rentable_sqft = EXCLUDED.total_rentable_sqft,
  total_usable_sqft = EXCLUDED.total_usable_sqft,
  common_area_sqft = EXCLUDED.common_area_sqft,
  updated_at = NOW();

-- Create sample unit
INSERT INTO public.units (
  id,
  property_id,
  unit_number,
  rentable_sqft,
  usable_sqft,
  floor,
  status,
  created_at,
  updated_at
)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Suite 200',
  1250.00,
  1125.00,
  2,
  'occupied',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  unit_number = EXCLUDED.unit_number,
  rentable_sqft = EXCLUDED.rentable_sqft,
  usable_sqft = EXCLUDED.usable_sqft,
  floor = EXCLUDED.floor,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Create sample lease with recovery profile
INSERT INTO public.leases (
  id,
  property_id,
  unit_id,
  tenant_name,
  start_date,
  end_date,
  status,
  recovery_profile,
  created_at,
  updated_at
)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Sample Tenant Inc',
  '2024-01-01',
  '2029-12-31',
  'active',
  '{
    "cap_rate": "0.03",
    "cap_type": "cumulative",
    "base_year": 2024,
    "excluded_pools": [],
    "pro_rata_share": "0.05",
    "base_year_amount": null,
    "gross_up_base_year": false,
    "admin_fee_percentage": "0.15"
  }'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  tenant_name = EXCLUDED.tenant_name,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  status = EXCLUDED.status,
  recovery_profile = EXCLUDED.recovery_profile,
  updated_at = NOW();

COMMIT;

-- Verification queries
SELECT 'Sample property created:' as status, id, name, city, state, total_rentable_sqft FROM public.properties WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT 'Sample unit created:' as status, id, unit_number, rentable_sqft, status FROM public.units WHERE id = '20000000-0000-0000-0000-000000000001';
SELECT 'Sample lease created:' as status, id, property_id, unit_id, tenant_name, status FROM public.leases WHERE id = '30000000-0000-0000-0000-000000000001';
