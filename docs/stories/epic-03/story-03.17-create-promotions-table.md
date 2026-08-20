# Story 3.17: Create Promotions Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 3
- **Dependencies**: Story 3.1 (Supabase Config), Story 3.2 (Organizations)
- **Status**: `completed`

## User Story
**As a** marketing administrator
**I want** promotions and redemptions tracked in the database
**So that** I can manage discount campaigns and track usage

## Acceptance Criteria
- [x] **AC1**: `promotions` table created with fields:
  - `id`, `code` (unique, uppercase)
  - `name`, `description`
  - `discount_type` (enum: percentage, fixed_amount, free_trial_extension)
  - `discount_value` (NUMERIC)
  - `duration_months` (nullable)
  - `max_redemptions`, `current_redemptions`
  - `valid_from`, `valid_until` (TIMESTAMPTZ)
  - `eligibility_rules` (JSONB)
  - `stripe_coupon_id` (nullable)
  - `status` (enum: active, expired, exhausted, disabled)
  - Timestamps
- [x] **AC2**: `promotion_redemptions` table created with fields:
  - `id`, `promotion_id` (FK), `organization_id` (FK)
  - `redeemed_at`, `stripe_discount_id`
  - Unique constraint on (promotion_id, organization_id)
- [x] **AC3**: RLS: promotions readable by all authenticated, redemptions org-scoped
- [x] **AC4**: Index on code for fast lookups
- [x] **AC5**: Trigger to auto-update promotion status when exhausted

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000014_create_promotions.sql
```

**Migration SQL**:
```sql
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
COMMENT ON TABLE public.promotion_redemptions IS 'Tracking of promotion usage by organization';
COMMENT ON COLUMN public.promotions.eligibility_rules IS 'JSONB rules: first_n_users, plan_restriction, new_customers_only';
```

## Eligibility Rules Schema

```json
{
  "first_n_users": 100,
  "plan_restriction": ["professional", "enterprise"],
  "new_customers_only": true,
  "one_per_organization": true
}
```

## Definition of Done
- [x] Promotions table created with all fields
- [x] Redemptions table with unique constraint
- [x] Auto-uppercase trigger for code
- [x] Auto-exhausted status trigger
- [x] RLS: promotions public read, redemptions org-scoped

## Implementation Notes
- Code is auto-uppercased via trigger
- Redemption count auto-increments via trigger
- Status auto-updates to 'exhausted' when max reached
- Eligibility rules stored as flexible JSONB
- Percentage validation prevents >100% discounts
