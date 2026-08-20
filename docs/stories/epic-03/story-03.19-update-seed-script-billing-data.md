# Story 3.19: Update Seed Script with Billing Data

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Stories 3.14-3.18 (Seed Script + New Tables)
- **Status**: `completed`

## User Story
**As a** developer
**I want** seed data for subscriptions, invoices, promotions, and feedback
**So that** I can test billing and feedback features locally

## Acceptance Criteria
- [x] **AC1**: Seed data creates subscriptions for each demo organization:
  - Org A: Professional plan, active status
  - Org B: Starter plan, trialing status
  - Org C: Free plan, active status
- [x] **AC2**: Seed data creates sample invoices for Org A:
  - 3 paid invoices for past months
  - 1 open invoice for current month
- [x] **AC3**: Seed data creates sample promotions:
  - `WELCOME20`: 20% off, active, unlimited redemptions
  - `FIRST100`: Free trial extension, first 100 users
  - `SUMMER2024`: Fixed $50 credit, expired
- [x] **AC4**: Seed data creates sample feedback:
  - Bug report from User A
  - Feature request from User B
  - General feedback (resolved)
- [x] **AC5**: Seed script is idempotent (can run multiple times)

## Technical Specifications

**File to Update**:
```
supabase/seed.sql
```

**SQL to Add** (append to existing seed.sql):

```sql
-- ============================================================================
-- BILLING SEED DATA
-- ============================================================================

-- Subscriptions for demo organizations
-- Note: Using organization IDs from existing seed data

INSERT INTO public.subscriptions (
    id, organization_id, stripe_subscription_id, stripe_customer_id,
    plan, status, current_period_start, current_period_end, cancel_at_period_end
) VALUES
    -- Acme Properties: Professional, Active
    (
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000001',
        'sub_demo_acme_pro',
        'cus_demo_acme',
        'professional',
        'active',
        NOW() - INTERVAL '15 days',
        NOW() + INTERVAL '15 days',
        FALSE
    ),
    -- Beta Management: Starter, Trialing
    (
        '00000000-0000-0000-0000-000000000102',
        '00000000-0000-0000-0000-000000000002',
        NULL,
        NULL,
        'starter',
        'trialing',
        NOW(),
        NOW() + INTERVAL '14 days',
        FALSE
    ),
    -- Gamma Holdings: Free, Active
    (
        '00000000-0000-0000-0000-000000000103',
        '00000000-0000-0000-0000-000000000003',
        NULL,
        NULL,
        'free',
        'active',
        NOW() - INTERVAL '30 days',
        NOW() + INTERVAL '30 days',
        FALSE
    )
ON CONFLICT (organization_id) DO UPDATE SET
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    updated_at = NOW();

-- Invoices for Acme Properties (paid history + current open)
INSERT INTO public.invoices (
    id, organization_id, subscription_id, stripe_invoice_id,
    amount_due, amount_paid, currency, status,
    period_start, period_end, due_date, paid_at, pdf_url
) VALUES
    -- Paid invoice: 3 months ago
    (
        '00000000-0000-0000-0000-000000000201',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000101',
        'in_demo_001',
        99.00, 99.00, 'usd', 'paid',
        NOW() - INTERVAL '90 days', NOW() - INTERVAL '60 days',
        NOW() - INTERVAL '75 days', NOW() - INTERVAL '80 days',
        'https://invoice.stripe.com/i/demo/001'
    ),
    -- Paid invoice: 2 months ago
    (
        '00000000-0000-0000-0000-000000000202',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000101',
        'in_demo_002',
        99.00, 99.00, 'usd', 'paid',
        NOW() - INTERVAL '60 days', NOW() - INTERVAL '30 days',
        NOW() - INTERVAL '45 days', NOW() - INTERVAL '50 days',
        'https://invoice.stripe.com/i/demo/002'
    ),
    -- Paid invoice: Last month
    (
        '00000000-0000-0000-0000-000000000203',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000101',
        'in_demo_003',
        99.00, 99.00, 'usd', 'paid',
        NOW() - INTERVAL '30 days', NOW(),
        NOW() - INTERVAL '15 days', NOW() - INTERVAL '20 days',
        'https://invoice.stripe.com/i/demo/003'
    ),
    -- Open invoice: Current month
    (
        '00000000-0000-0000-0000-000000000204',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000101',
        'in_demo_004',
        99.00, 0.00, 'usd', 'open',
        NOW(), NOW() + INTERVAL '30 days',
        NOW() + INTERVAL '15 days', NULL,
        NULL
    )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PROMOTIONS SEED DATA
-- ============================================================================

INSERT INTO public.promotions (
    id, code, name, description,
    discount_type, discount_value, duration_months,
    max_redemptions, current_redemptions,
    valid_from, valid_until, eligibility_rules,
    stripe_coupon_id, status
) VALUES
    -- Active: 20% off for 3 months
    (
        '00000000-0000-0000-0000-000000000301',
        'WELCOME20',
        'Welcome Discount',
        'Get 20% off your first 3 months',
        'percentage', 20.00, 3,
        NULL, 5,  -- Unlimited, 5 already used
        NOW() - INTERVAL '30 days', NOW() + INTERVAL '365 days',
        '{"new_customers_only": true}',
        'coupon_welcome20',
        'active'
    ),
    -- Active: First 100 users get extended trial
    (
        '00000000-0000-0000-0000-000000000302',
        'FIRST100',
        'Early Adopter Bonus',
        'Extended 60-day trial for first 100 users',
        'free_trial_extension', 46.00, NULL,  -- 46 extra days (60 - 14)
        100, 42,  -- Max 100, 42 used
        NOW() - INTERVAL '60 days', NULL,
        '{"first_n_users": 100}',
        NULL,
        'active'
    ),
    -- Expired: Summer 2024 credit
    (
        '00000000-0000-0000-0000-000000000303',
        'SUMMER2024',
        'Summer 2024 Special',
        '$50 credit toward your subscription',
        'fixed_amount', 50.00, 1,
        200, 187,
        '2024-06-01'::TIMESTAMPTZ, '2024-08-31'::TIMESTAMPTZ,
        '{}',
        'coupon_summer2024',
        'expired'
    ),
    -- Disabled: Old promo
    (
        '00000000-0000-0000-0000-000000000304',
        'BETA2023',
        'Beta Tester Discount',
        'Thank you for being a beta tester!',
        'percentage', 50.00, 12,
        50, 50,
        '2023-01-01'::TIMESTAMPTZ, '2023-12-31'::TIMESTAMPTZ,
        '{}',
        NULL,
        'exhausted'
    )
ON CONFLICT (code) DO UPDATE SET
    status = EXCLUDED.status,
    current_redemptions = EXCLUDED.current_redemptions,
    updated_at = NOW();

-- Sample promotion redemptions
INSERT INTO public.promotion_redemptions (
    id, promotion_id, organization_id, redeemed_at, stripe_discount_id
) VALUES
    (
        '00000000-0000-0000-0000-000000000401',
        '00000000-0000-0000-0000-000000000301',  -- WELCOME20
        '00000000-0000-0000-0000-000000000001',  -- Acme Properties
        NOW() - INTERVAL '45 days',
        'di_demo_001'
    )
ON CONFLICT (promotion_id, organization_id) DO NOTHING;

-- ============================================================================
-- FEEDBACK SEED DATA
-- ============================================================================

INSERT INTO public.feedback (
    id, user_id, organization_id,
    type, status, message,
    screenshot_url, page_url, user_agent, metadata
) VALUES
    -- Bug report from User A
    (
        '00000000-0000-0000-0000-000000000501',
        '00000000-0000-0000-0000-000000000011',  -- Demo user from Acme
        '00000000-0000-0000-0000-000000000001',
        'bug', 'new',
        'The reconciliation grid is not loading properly when I have more than 50 tenants. It shows a blank screen for about 5 seconds before rendering.',
        NULL,
        '/properties/123/reconciliation',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0',
        '{"browser": "Chrome 120", "os": "Windows 11", "viewport": {"width": 1920, "height": 1080}}'
    ),
    -- Feature request from User B
    (
        '00000000-0000-0000-0000-000000000502',
        '00000000-0000-0000-0000-000000000012',  -- Another demo user
        '00000000-0000-0000-0000-000000000001',
        'feature_request', 'reviewed',
        'It would be great to have an export to Excel feature for the reconciliation summary. Currently I have to copy-paste data into spreadsheets.',
        NULL,
        '/properties/123/reconciliation/summary',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        '{"browser": "Safari 17", "os": "macOS Sonoma"}'
    ),
    -- General feedback (resolved)
    (
        '00000000-0000-0000-0000-000000000503',
        '00000000-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000000001',
        'general', 'resolved',
        'The new dashboard design looks great! Much easier to navigate than before. One suggestion: could you add a Light-Only Mode option?',
        NULL,
        '/dashboard',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0',
        '{}'
    )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- VERIFY SEED DATA
-- ============================================================================

DO $$
DECLARE
    sub_count INTEGER;
    inv_count INTEGER;
    promo_count INTEGER;
    feedback_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO sub_count FROM public.subscriptions;
    SELECT COUNT(*) INTO inv_count FROM public.invoices;
    SELECT COUNT(*) INTO promo_count FROM public.promotions;
    SELECT COUNT(*) INTO feedback_count FROM public.feedback;

    RAISE NOTICE 'Seed data verification:';
    RAISE NOTICE '  Subscriptions: %', sub_count;
    RAISE NOTICE '  Invoices: %', inv_count;
    RAISE NOTICE '  Promotions: %', promo_count;
    RAISE NOTICE '  Feedback: %', feedback_count;
END $$;
```

## Definition of Done
- [x] Subscription seed data for all demo organizations
- [x] Invoice history for at least one organization
- [x] Active, expired, and exhausted promotions created
- [x] Feedback samples of each type created
- [x] Seed script remains idempotent

## Implementation Notes
- Uses deterministic UUIDs for repeatability
- ON CONFLICT clauses ensure idempotency
- References existing organization/user IDs from original seed
- Verification block confirms data was inserted
- Timestamps use relative dates (NOW()) for realistic data
