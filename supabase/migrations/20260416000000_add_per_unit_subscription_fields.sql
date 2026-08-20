-- Migration: 20260416000000_add_per_unit_subscription_fields.sql
-- Adds hybrid per-unit subscription fields while preserving legacy per-building
-- subscriptions and existing credit-pack billing.

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS pricing_model TEXT
    CHECK (pricing_model IN ('per_building', 'per_unit', 'credit_pack'));

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS unit_count INTEGER
    CHECK (unit_count >= 0);

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS included_units INTEGER
    CHECK (included_units >= 0);

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS unit_overage_count INTEGER
    CHECK (unit_overage_count >= 0);

UPDATE public.subscriptions
SET pricing_model = CASE
        WHEN billing_model = 'credit_pack' THEN 'credit_pack'
        ELSE 'per_building'
    END
WHERE pricing_model IS NULL;

UPDATE public.subscriptions
SET unit_count = building_count
WHERE unit_count IS NULL
  AND pricing_model = 'per_building';

UPDATE public.subscriptions
SET included_units = 0
WHERE included_units IS NULL
  AND pricing_model = 'per_building';

UPDATE public.subscriptions
SET unit_overage_count = 0
WHERE unit_overage_count IS NULL
  AND pricing_model = 'per_building';

ALTER TABLE public.subscriptions
    ALTER COLUMN pricing_model SET DEFAULT 'per_building';

ALTER TABLE public.subscriptions
    ALTER COLUMN pricing_model SET NOT NULL;

COMMENT ON COLUMN public.subscriptions.pricing_model IS
    'per_building = grandfathered recurring subscriptions; per_unit = hybrid self-serve pricing; credit_pack = prepaid audit credits';

COMMENT ON COLUMN public.subscriptions.unit_count IS
    'Snapshot of total covered rentable units for the current subscription.';

COMMENT ON COLUMN public.subscriptions.included_units IS
    'Rentable units included in the platform fee for hybrid per-unit subscriptions.';

COMMENT ON COLUMN public.subscriptions.unit_overage_count IS
    'Billable unit quantity above the included unit threshold.';
