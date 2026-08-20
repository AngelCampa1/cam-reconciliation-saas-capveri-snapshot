-- Add annual renewal discount offer type for save-offer flow.
-- Uses DO block to handle the case where save_offer_type was not yet created
-- on instances where 20260224000002 was recorded before save_offer_type was added.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'save_offer_type') THEN
        CREATE TYPE save_offer_type AS ENUM (
            'discount_20pct_3mo',
            'feature_roadmap',
            'none',
            'discount_20pct_1inv'
        );
    ELSE
        ALTER TYPE save_offer_type ADD VALUE IF NOT EXISTS 'discount_20pct_1inv';
    END IF;
END$$;
