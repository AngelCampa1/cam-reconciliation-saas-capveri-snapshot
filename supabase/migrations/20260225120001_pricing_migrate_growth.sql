-- Migrate existing growth subscribers to professional
-- (they keep all features they had, at new pricing going forward)
-- Split from 20260225120000 because Postgres cannot use newly-added enum
-- values in the same transaction as ALTER TYPE ADD VALUE.

UPDATE subscriptions SET plan = 'professional' WHERE plan = 'growth';

COMMENT ON TYPE subscription_plan IS
  'Subscription tiers: essentials ($35/bldg/mo), professional ($49/bldg/mo). '
  'growth is deprecated — migrated to professional.';
