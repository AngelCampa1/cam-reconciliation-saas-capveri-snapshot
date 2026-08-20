-- Migration: Create Promotions and Promotion Redemptions Tables
-- Description: Discount promotions and coupon codes with redemption tracking
-- Dependencies: 20240101000001_create_organizations.sql

-- Create discount type enum
CREATE TYPE public.discount_type AS ENUM (
    'percentage',
    'fixed_amount',
    'free_trial_extension'
);

-- Create promotion status enum
CREATE TYPE public.promotion_status AS ENUM (
    'active',
    'expired',
    'exhausted',
    'disabled'
);

-- Create promotions table
CREATE TABLE public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    discount_type public.discount_type NOT NULL,
    discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
    duration_months INTEGER CHECK (duration_months IS NULL OR (duration_months >= 1 AND duration_months <= 36)),
    max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions >= 1),
    current_redemptions INTEGER NOT NULL DEFAULT 0 CHECK (current_redemptions >= 0),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    eligibility_rules JSONB NOT NULL DEFAULT '{}',
    stripe_coupon_id VARCHAR(255),
    status public.promotion_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: valid_until must be after valid_from
    CONSTRAINT promotion_dates_valid
        CHECK (valid_until IS NULL OR valid_until > valid_from),
    -- Constraint: percentage cannot exceed 100
    CONSTRAINT percentage_max_100
        CHECK (discount_type != 'percentage' OR discount_value <= 100)
);

-- Uppercase code trigger
CREATE OR REPLACE FUNCTION public.uppercase_promotion_code()
RETURNS TRIGGER AS $$
BEGIN
    NEW.code = UPPER(NEW.code);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER promotion_code_uppercase
    BEFORE INSERT OR UPDATE ON public.promotions
    FOR EACH ROW
    EXECUTE FUNCTION public.uppercase_promotion_code();

-- Create promotion redemptions table
CREATE TABLE public.promotion_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stripe_discount_id VARCHAR(255),

    -- One redemption per organization per promotion
    CONSTRAINT unique_org_promotion UNIQUE (promotion_id, organization_id)
);

-- Function to update promotion status when exhausted
CREATE OR REPLACE FUNCTION public.update_promotion_status_on_redemption()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment redemption count
    UPDATE public.promotions
    SET current_redemptions = current_redemptions + 1,
        status = CASE
            WHEN max_redemptions IS NOT NULL
                 AND current_redemptions + 1 >= max_redemptions
            THEN 'exhausted'::public.promotion_status
            ELSE status
        END
    WHERE id = NEW.promotion_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER increment_redemption_count
    AFTER INSERT ON public.promotion_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_promotion_status_on_redemption();

-- Indexes
CREATE UNIQUE INDEX idx_promotions_code ON public.promotions(code);
CREATE INDEX idx_promotions_status ON public.promotions(status);
CREATE INDEX idx_promotions_valid_dates ON public.promotions(valid_from, valid_until);
CREATE INDEX idx_promotions_stripe_coupon_id ON public.promotions(stripe_coupon_id)
    WHERE stripe_coupon_id IS NOT NULL;
CREATE INDEX idx_promotion_redemptions_org ON public.promotion_redemptions(organization_id);
CREATE INDEX idx_promotion_redemptions_promotion ON public.promotion_redemptions(promotion_id);

-- Updated_at trigger for promotions
CREATE TRIGGER update_promotions_updated_at
    BEFORE UPDATE ON public.promotions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for promotions (readable by all authenticated users)
CREATE POLICY "Active promotions are viewable by all authenticated users"
    ON public.promotions
    FOR SELECT
    USING (status = 'active' AND (valid_until IS NULL OR valid_until > NOW()));

-- Only admins/service role can manage promotions
CREATE POLICY "Promotions are manageable by service role"
    ON public.promotions
    FOR ALL
    USING (FALSE);  -- Deny direct access, use service role

-- RLS Policies for redemptions (org-scoped)
CREATE POLICY "Redemptions are viewable by organization members"
    ON public.promotion_redemptions
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- Redemptions are created via service role (during checkout)
CREATE POLICY "Redemptions are insertable by service role"
    ON public.promotion_redemptions
    FOR INSERT
    WITH CHECK (FALSE);  -- Use service role

-- Grant permissions
GRANT SELECT ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
GRANT SELECT ON public.promotion_redemptions TO authenticated;
GRANT ALL ON public.promotion_redemptions TO service_role;

COMMENT ON TABLE public.promotions IS 'Discount promotions and coupon codes';
COMMENT ON COLUMN public.promotions.id IS 'Primary key UUID';
COMMENT ON COLUMN public.promotions.code IS 'Unique promotion code (auto-uppercased)';
COMMENT ON COLUMN public.promotions.name IS 'Human-readable promotion name';
COMMENT ON COLUMN public.promotions.description IS 'Detailed description of the promotion';
COMMENT ON COLUMN public.promotions.discount_type IS 'Type of discount: percentage, fixed_amount, or free_trial_extension';
COMMENT ON COLUMN public.promotions.discount_value IS 'Discount value (percentage or amount)';
COMMENT ON COLUMN public.promotions.duration_months IS 'How many months the discount applies';
COMMENT ON COLUMN public.promotions.max_redemptions IS 'Maximum number of times this can be redeemed (NULL = unlimited)';
COMMENT ON COLUMN public.promotions.current_redemptions IS 'Current redemption count';
COMMENT ON COLUMN public.promotions.valid_from IS 'When the promotion becomes valid';
COMMENT ON COLUMN public.promotions.valid_until IS 'When the promotion expires (NULL = never)';
COMMENT ON COLUMN public.promotions.eligibility_rules IS 'JSONB rules: first_n_users, plan_restriction, new_customers_only';
COMMENT ON COLUMN public.promotions.stripe_coupon_id IS 'Corresponding Stripe coupon ID';
COMMENT ON COLUMN public.promotions.status IS 'Promotion status: active, expired, exhausted, disabled';
COMMENT ON TABLE public.promotion_redemptions IS 'Tracking of promotion usage by organization';
COMMENT ON COLUMN public.promotion_redemptions.promotion_id IS 'FK to promotions';
COMMENT ON COLUMN public.promotion_redemptions.organization_id IS 'FK to organizations';
COMMENT ON COLUMN public.promotion_redemptions.redeemed_at IS 'When the promotion was redeemed';
COMMENT ON COLUMN public.promotion_redemptions.stripe_discount_id IS 'Stripe discount ID (di_xxx)';
COMMENT ON TYPE public.discount_type IS 'Types of discounts: percentage, fixed_amount, free_trial_extension';
COMMENT ON TYPE public.promotion_status IS 'Promotion lifecycle states';
