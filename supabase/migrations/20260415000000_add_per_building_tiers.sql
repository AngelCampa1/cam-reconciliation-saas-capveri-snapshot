-- Migration: 20260415000000_add_per_building_tiers.sql
-- Adds per-building pricing tiers (growth_v2, portfolio, enterprise) to the
-- subscription_plan enum and enforces building_count NOT NULL with default 1.
-- Also adds billing_interval column for monthly/annual tracking.
--
-- IMPORTANT: Existing enum values are NEVER dropped — rows referencing legacy
-- flat-tier plans (starter, pro, business) and legacy per-building plans
-- (essentials, professional, growth) remain valid.

-- ------------------------------------------------------------
-- 1. Add new enum values (idempotent via EXCEPTION handler)
-- ------------------------------------------------------------

DO $$ BEGIN
  ALTER TYPE subscription_plan ADD VALUE 'growth_v2';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE subscription_plan ADD VALUE 'portfolio';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE subscription_plan ADD VALUE 'enterprise';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2. Ensure building_count is NOT NULL with default 1
--    (column already exists from 20240101000049_simplify_subscription_plans.sql)
-- ------------------------------------------------------------

ALTER TABLE subscriptions
  ALTER COLUMN building_count SET DEFAULT 1;

UPDATE subscriptions
  SET building_count = 1
  WHERE building_count IS NULL;

ALTER TABLE subscriptions
  ALTER COLUMN building_count SET NOT NULL;

-- ------------------------------------------------------------
-- 3. Add billing_interval column (monthly / annual)
-- ------------------------------------------------------------

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text
  CHECK (billing_interval IN ('monthly', 'annual'))
  DEFAULT 'monthly';

UPDATE subscriptions
  SET billing_interval = 'monthly'
  WHERE billing_interval IS NULL;

ALTER TABLE subscriptions
  ALTER COLUMN billing_interval SET NOT NULL;

-- ------------------------------------------------------------
-- 4. Document the pricing model on the table
-- ------------------------------------------------------------

COMMENT ON TABLE subscriptions IS
  'Organization subscription and billing status. Per-building model: growth_v2=$50/bldg/mo (1-10 bldgs), portfolio=$35/bldg/mo (11-50 bldgs), enterprise=custom (50+ bldgs). Legacy flat tiers (starter/pro/business) kept for backward compat.';
