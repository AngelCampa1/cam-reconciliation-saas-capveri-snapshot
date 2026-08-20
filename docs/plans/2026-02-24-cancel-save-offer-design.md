# Cancel Subscription Save Offer — Design

**Date:** 2026-02-24
**Branch:** feat/cancel-save-offer

## Problem

The old cancel flow was a single confirmation dialog. Every cancellation attempt converted to churn at 100%. Industry benchmarks show a cancel flow with targeted save offers recovers 20–35% of cancellations.

## Flow

```
[Cancel Subscription button]
        |
        v
  ┌─────────────┐
  │  Step 1:    │
  │  Survey     │  ← "Why are you canceling?" (6 reasons)
  └──────┬──────┘
         |
         v
  ┌──────────────────────────────────────────────────┐
  │  Offer mapping:                                  │
  │  too_expensive       → discount by billing interval │
  │  not_using_enough    → discount by billing interval │
  │  missing_feature     → feature_roadmap           │
  │  switching_competitor → discount by billing interval │
  │  business_closed     → none (skip to confirm)   │
  │  other               → discount by billing interval │
  └──────┬───────────────────────────────────────────┘
         |
    ┌────┴──────────────┐
    |                   |
    v                   v
┌─────────┐     ┌──────────────┐     ┌──────────┐
│ Step 2a │     │   Step 2b    │     │ Step 2c  │
│ Discount│     │   Feature    │     │  (skip)  │
│ 20% 3mo │     │   Roadmap    │     │          │
└────┬────┘     └──────┬───────┘     └────┬─────┘
     |                 |                  |
     | Accept          | Stay             | (direct)
     v                 v                  |
 [Apply coupon     [Close wizard]         |
  → close wizard]                         |
     |                                    |
     | Decline                            |
     v                                    v
  ┌─────────────────────────────────────────────┐
  │  Step 3: Confirm cancellation               │
  │  "Cancel your subscription?"                │
  │  [Keep my subscription] [Yes, cancel]       │
  └─────────────────────────────────────────────┘
```

## Offer-to-Reason Mapping

| Reason | Offer | Rationale |
|--------|-------|-----------|
| too_expensive | 20% off next annual renewal invoice | Direct price relief without over-discounting annual plans |
| not_using_enough | 20% off next annual renewal invoice | Lower cost reduces "not worth it" feeling |
| missing_feature | Feature roadmap | Show what's coming, buy time |
| switching_competitor | 20% off next annual renewal invoice | Make switching economically harder |
| business_closed | None | No point — they're leaving regardless |
| other | 20% off next annual renewal invoice | Default to price relief |

## DB Schema

```sql
CREATE TYPE cancel_reason AS ENUM (
    'too_expensive', 'not_using_enough', 'missing_feature',
    'switching_competitor', 'business_closed', 'other'
);

CREATE TYPE save_offer_type AS ENUM (
    'discount_20pct_1inv', 'feature_roadmap', 'none'
);

CREATE TABLE public.cancel_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cancel_reason cancel_reason NOT NULL,
    other_text TEXT,
    offer_shown save_offer_type NOT NULL DEFAULT 'none',
    offer_accepted BOOLEAN,
    stripe_coupon_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## API Contracts

### POST /api/v1/billing/save-offer
Submit exit survey, get offer back.

**Request:**
```json
{ "reason": "too_expensive", "other_text": null }
```

**Response:**
```json
{
  "attempt_id": "uuid",
  "offer_type": "discount_20pct_1inv",
  "discount_percent": 20
}
```

### POST /api/v1/billing/save-offer/{attempt_id}/accept
Apply the discount coupon to Stripe subscription.

**Response:** Full `Subscription` object.

### POST /api/v1/billing/subscription/cancel (modified)
Now accepts optional `attempt_id` to mark the attempt as declined.

**Request:**
```json
{ "immediate": false, "attempt_id": "uuid-or-null" }
```

## UI Wireframes (ASCII)

### Step 1 — Survey
```
┌─────────────────────────────────────────┐
│ Before you go, help us understand why.  │
│ Your feedback helps us improve.         │
│                                         │
│  ○ It costs more than I'm getting       │
│  ○ I'm not logging in enough            │
│  ○ Something I need isn't there yet     │
│  ○ I'm switching to a different tool    │
│  ○ We're shutting down or downsizing    │
│  ○ Something else                       │
│                                         │
│  [Keep my subscription]    [Continue →] │
└─────────────────────────────────────────┘
```

### Step 2a — Discount Offer
```
┌─────────────────────────────────────────┐
│ How about 20% off for 3 months?         │
│                                         │
│ Keep everything you have, and pay 20%   │
│ less for the next 3 months.             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ What you get:                       │ │
│ │ • Full access to all features       │ │
│ │ • 20% off your next 3 invoices      │ │
│ │ • Cancel anytime after              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│  [No thanks, keep canceling]            │
│                          [Apply discount]│
└─────────────────────────────────────────┘
```

### Step 2b — Feature Roadmap
```
┌─────────────────────────────────────────┐
│ That feature is on the way.             │
│ Shipping in the next 90 days:           │
│                                         │
│ → Automated lease abstraction from PDFs │
│ → Direct Yardi and MRI data sync        │
│ → Multi-property batch reconciliation   │
│ → Tenant-facing audit reports           │
│                                         │
│  [No thanks, keep canceling]            │
│                   [Stay and see what ships]│
└─────────────────────────────────────────┘
```

### Step 3 — Confirm
```
┌─────────────────────────────────────────┐
│ ⚠ Cancel your subscription?             │
│                                         │
│ Your access continues through the end   │
│ of your billing period. You can         │
│ reactivate anytime before then.         │
│                                         │
│ [Keep my subscription]  [Yes, cancel]   │
└─────────────────────────────────────────┘
```

## Stripe Setup (pre-requisite)

Before going live, create in Stripe Dashboard:
- **Type**: Percentage discount
- **Percent off**: 20%
- **Annual Coupon ID**: `SAVE20_1INV_ANNUAL`
- **Duration**: Once, applied to the next annual invoice
- **Type**: Percentage discount
- **Percent off**: 20%
- **Duration**: Once (next renewal invoice only)

## Metrics to Track

Query `cancel_attempts` table weekly:

```sql
-- Save rate
SELECT
  COUNT(*) FILTER (WHERE offer_accepted = true) AS saved,
  COUNT(*) FILTER (WHERE offer_accepted = false) AS declined,
  COUNT(*) FILTER (WHERE offer_accepted IS NULL) AS abandoned,
  COUNT(*) TOTAL
FROM cancel_attempts;

-- Acceptance by reason
SELECT cancel_reason, AVG(offer_accepted::int) as acceptance_rate
FROM cancel_attempts
WHERE offer_shown != 'none'
GROUP BY cancel_reason;
```
