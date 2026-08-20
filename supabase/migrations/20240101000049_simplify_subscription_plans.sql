-- Migration: Simplify Subscription Plans
-- Description: Reduce to 2 tiers (Growth, Enterprise) and add building_count for per-building billing
-- Dependencies: 20240101000012_create_subscriptions.sql

-- 1. Add building_count column for per-building billing
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS building_count INTEGER NOT NULL DEFAULT 1;

-- Add comment for new column
COMMENT ON COLUMN public.subscriptions.building_count IS 'Number of buildings in subscription (for per-building pricing)';

-- 2. Create index for building_count queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_building_count
    ON public.subscriptions(building_count);

-- 3. Create new enum type with simplified tiers
-- Note: PostgreSQL doesn't allow direct enum modification, so we create a new type
CREATE TYPE public.subscription_plan_v2 AS ENUM (
    'growth',
    'enterprise'
);

-- 4. Add new column with new enum type
ALTER TABLE public.subscriptions
ADD COLUMN plan_new public.subscription_plan_v2;

-- 5. Migrate existing data to new column
-- Map: free, starter, professional, portfolio -> growth
-- Map: enterprise -> enterprise
UPDATE public.subscriptions
SET plan_new = CASE
    WHEN plan::text = 'enterprise' THEN 'enterprise'::public.subscription_plan_v2
    ELSE 'growth'::public.subscription_plan_v2
END;

-- 6. Make new column NOT NULL after data migration
ALTER TABLE public.subscriptions
ALTER COLUMN plan_new SET NOT NULL;

-- 7. Set default for new column
ALTER TABLE public.subscriptions
ALTER COLUMN plan_new SET DEFAULT 'growth'::public.subscription_plan_v2;

-- 8. Drop old column
ALTER TABLE public.subscriptions
DROP COLUMN plan;

-- 9. Rename new column to plan
ALTER TABLE public.subscriptions
RENAME COLUMN plan_new TO plan;

-- 10. Drop old enum type
DROP TYPE public.subscription_plan;

-- 11. Rename new enum type to original name
ALTER TYPE public.subscription_plan_v2 RENAME TO subscription_plan;

-- 12. Update comment on type
COMMENT ON TYPE public.subscription_plan IS 'Available subscription plan tiers: growth (1-50 buildings), enterprise (51+ buildings, custom pricing)';

-- 13. Update comment on column
COMMENT ON COLUMN public.subscriptions.plan IS 'Subscription plan tier: growth ($250/building/month), enterprise (custom pricing)';
