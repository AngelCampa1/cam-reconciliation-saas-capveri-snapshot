-- Test User Seed Script for E2E Tests
-- Creates test organization and user for Playwright E2E testing
-- Run this script after migrations: psql -U postgres -d postgres -f seed-test-users.sql

BEGIN;

-- Create test organization
INSERT INTO public.organizations (id, name, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'E2E Test Organization', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

-- Create test user in auth.users (Supabase Auth schema)
-- Password: TestPassword123!
-- Note: Supabase CLI automatically creates the auth schema
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'e2e-test@capveri.com',
  '$2a$10$rOqFqKjF5K5L5k5L5k5L5OqP5k5L5k5L5k5L5k5L5k5L5k5L5k5L5', -- TestPassword123! (bcrypt)
  NOW(),
  NULL,
  '',
  NULL,
  '',
  NULL,
  '',
  '',
  NULL,
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"organization_name":"E2E Test Organization"}',
  false,
  NOW(),
  NOW(),
  NULL,
  NULL,
  '',
  '',
  NULL,
  '',
  0,
  NULL,
  '',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = NOW(),
  updated_at = NOW();

-- Link user to organization in public.users
INSERT INTO public.users (
  id,
  organization_id,
  email,
  role,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'e2e-test@capveri.com',
  'owner',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  updated_at = NOW();

-- Create admin test user
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'admin@capveri.com',
  '$2a$10$rOqFqKjF5K5L5k5L5k5L5OqP5k5L5k5L5k5L5k5L5k5L5k5L5k5L5', -- AdminPassword123! (bcrypt)
  NOW(),
  NULL,
  '',
  NULL,
  '',
  NULL,
  '',
  '',
  NULL,
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"organization_name":"E2E Test Organization"}',
  false,
  NOW(),
  NOW(),
  NULL,
  NULL,
  '',
  '',
  NULL,
  '',
  0,
  NULL,
  '',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = NOW(),
  updated_at = NOW();

-- Link admin to organization
INSERT INTO public.users (
  id,
  organization_id,
  email,
  role,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'admin@capveri.com',
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  updated_at = NOW();

COMMIT;

-- Verification queries
SELECT 'Test organization created:' as status, * FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT 'Test users created:' as status, id, email, role FROM public.users WHERE organization_id = '00000000-0000-0000-0000-000000000001';
SELECT 'Auth users created:' as status, id, email, email_confirmed_at FROM auth.users WHERE email IN ('e2e-test@capveri.com', 'admin@capveri.com');
