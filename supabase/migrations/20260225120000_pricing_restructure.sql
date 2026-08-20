-- Pricing restructure: Essentials ($35) + Professional ($99, intro $49)
-- Replaces Growth ($250) tier with two new tiers.
--
-- New pricing model:
--   Essentials: $35/bldg/mo ($29/bldg/mo annual) — GL import, reconciliation, leakage
--   Professional: $99/bldg/mo ($75/bldg/mo annual) — everything
--     Intro: $49/bldg/mo ($39/bldg/mo annual) — time-limited
--   Enterprise: custom (contact sales) — unchanged

-- Add new plan enum values
-- Note: the UPDATE using the new values is in 20260225120001_pricing_restructure_migrate.sql
-- because PostgreSQL does not allow using a newly added enum value in the same transaction.
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'essentials';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'professional';

COMMENT ON TYPE subscription_plan IS
  'Subscription tiers: essentials ($35/bldg/mo), professional ($99/bldg/mo), enterprise (custom). '
  'growth is deprecated — migrated to professional.';
