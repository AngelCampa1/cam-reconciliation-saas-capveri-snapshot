-- Remove enterprise tier from subscription_plan enum.
-- Enterprise was a "contact sales" placeholder with no Stripe integration
-- or real customers. Keeping essentials, professional, growth (deprecated compat).
--
-- Pattern: create new type, migrate column, drop old type (same as 20240101000049).

-- 1. Create new enum type without enterprise
CREATE TYPE public.subscription_plan_v3 AS ENUM (
    'essentials',
    'professional',
    'growth'
);

-- 2. Add new column with new enum type
ALTER TABLE public.subscriptions
ADD COLUMN plan_new public.subscription_plan_v3;

-- 3. Migrate existing data — map enterprise to professional
UPDATE public.subscriptions
SET plan_new = CASE
    WHEN plan::text = 'enterprise' THEN 'professional'::public.subscription_plan_v3
    ELSE plan::text::public.subscription_plan_v3
END;

-- 4. Make new column NOT NULL after data migration
ALTER TABLE public.subscriptions
ALTER COLUMN plan_new SET NOT NULL;

-- 5. Set default for new column
ALTER TABLE public.subscriptions
ALTER COLUMN plan_new SET DEFAULT 'essentials'::public.subscription_plan_v3;

-- 6. Drop old column
ALTER TABLE public.subscriptions
DROP COLUMN plan;

-- 7. Rename new column to plan
ALTER TABLE public.subscriptions
RENAME COLUMN plan_new TO plan;

-- 8. Drop old enum type
DROP TYPE public.subscription_plan;

-- 9. Rename new enum type to original name
ALTER TYPE public.subscription_plan_v3 RENAME TO subscription_plan;

-- 10. Update comment on type
COMMENT ON TYPE public.subscription_plan IS
  'Subscription tiers: essentials ($35/bldg/mo), professional ($99/bldg/mo). '
  'growth is deprecated — migrated to professional.';
