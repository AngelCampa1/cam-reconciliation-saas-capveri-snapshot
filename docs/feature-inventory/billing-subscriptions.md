# Billing and Subscriptions

> Last updated: 2026-07-01 - New signup and SSO flows auto-start the no-card Reconcile trial and route first-time users to `/onboard?demo=1&source=first-login`; `/checkout` and billing settings are for adding billing, preserving selected units, or changing plan selection after account creation.
> Last updated: 2026-06-25 - Authenticated pricing-to-billing handoff preserves selected rentable units for no-card trial checkout, but active Stripe-backed subscriptions ignore `intent=select-plan` checkout URLs and stay on the billing portal path. Billing settings can also render a checkout-capable Reconcile plan picker for `?intent=select-plan` users who do not yet have a local subscription row, preventing the PLG completion loop.
> Last updated: 2026-06-25 - Self-serve pricing no longer has a Contact Sales/unit-count wall. The Worker no longer rejects portfolios above 100,000 rentable units, the checkout/pricing pages no longer cap typed unit counts or route pricing questions to a sales CTA, and generated public knowledge now asks buyers to enter their unit count to see the annual price before checkout.
> Last updated: 2026-06-25 - The 80OFF launch offer has a hard server-side deadline at `2026-07-04T07:00:00Z`: the active-offer endpoint returns exhausted after the cutoff, plan selection and selected no-card trial start reject `80OFF` with `offer_expired`, and Stripe Checkout refuses the expired coupon before any Stripe call is made.
> Last updated: 2026-06-04 - Settings billing summary copy polish: the pricing-model row now reads "Per building" instead of "Legacy per-building" so active per-building customers don't see their plan framed as deprecated (F-165c), and a muted plan tagline now renders under the plan name (sourced from the canonical generated `plan-tiers` data, not new copy) so a plan label like "Defend" carries its meaning (F-166).
> Last updated: 2026-06-04 - The frontend `FreeAuditStatus.credit_balance` type now matches the backend response shape — an object `{total_purchased, total_used, total_remaining}` (from `services/billing/credits.py get_credit_balance`) rather than a scalar `number`, so any consumer reading it renders the real remaining-credit value instead of `[object Object]`/NaN (F-125). The settings invoice type badge is documented as intentionally a single "Subscription" type until the API gains a non-subscription invoice type (F-119).
> Last updated: 2026-06-03 - Anonymous PLG onboarding sessions are now exempt from the entitlement paywall on the onboarding allowlist. A freshly bootstrapped anonymous org has no subscription, so `require_full_access` and the reconciliation gate previously raised 402 and broke the pre-signup leakage preview. `User` now carries a server-derived `is_anonymous` flag (set in `get_current_user` from the Supabase auth session via `_is_anonymous_auth_user`, never client-settable — overwritten server-side before `User(**user_data)`); `require_full_access` returns early for anonymous users and `calculate_reconciliation` gates on `not is_anonymous and not has_full_access`. Anonymous users remain hard-gated to the onboarding route allowlist in `get_current_user` BEFORE the exemption applies, so this is not an entitlement bypass for real product routes (F-141).
> Last updated: 2026-06-03 - Settings Billing/Team/Organization/Invoices/Certificates pages now fail open on data-query errors (`throwOnError:false` on useSubscription/useOrganizationUsage/useFeatureUsage/useTeamMembers/useTeamInvitations/useOrganization/useInvoices/useCertificates/useCertificate) instead of escalating a single transient first-load failure to the global ErrorBoundary and white-screening the whole app (F-133). Billing.tsx (previously had no error state) and OrganizationPage now render an inline error + Retry on load failure.
> Last updated: 2026-06-03 - Card-less trial expiry is now self-enforcing without a cron. A local trialing subscription (no `stripe_subscription_id`) whose `current_period_end` is in the past is treated as `paused` the moment the org touches any gated endpoint: `effective_subscription_status` in `entitlements.py` computes this lazily and best-effort persists the flip, so `has_full_access`, `get_current_tier`, and `has_feature_access` all report no access once the trial lapses. The reconciliation server gate moved off the retired free-audit demo to `has_full_access`. A new `require_full_access` dependency (402 `subscription_required`) is a read-only lock applied to every mutating/product-consuming endpoint (properties, units, ingestion, exports, analysis, extraction, compliance, disputes, demand letters, warranty, cross-doc); GET/read routes stay open so existing data remains viewable after the trial ends. Billing status reports `trial_days_remaining` and `subscription_status` for an escalating in-app trial banner; a 402 on an action routes the user to plan selection. Billing reminders are in-app only — the dead `day_14_add_billing` / `day_24_keep_access` nurture rows were removed and email never asks for money. Expired card-less trials reuse the existing `paused` state (no new status enum).
> Last updated: 2026-05-29 - Default full-feature trial auto-start is now resilient and consistent across every signup entry point (email registration, SSO callback, and SSO onboarding completion) via a shared `startDefaultTrial` helper that awaits the call and surfaces backend failures (including the paused-subscription 409 detail) without blocking the user from reaching the dashboard; SSO onboarding completion previously skipped trial provisioning entirely (F-003). Billing "Resume Subscription" now guards against double-submit and surfaces the backend error detail.
> Last updated: 2026-05-28 - `/api/v1/auth/welcome` now creates the app-owned `signup_email_events` nurture schedule; stale references to a removed free-audit winback processor were clarified.
> Last updated: 2026-05-28 - Legacy `POST /api/v1/billing/subscribe` now accepts current self-serve tier ids only, and legacy credit-pack balance/history reads page through all audit credit rows.
> Last updated: 2026-05-28 - Payment method default and detach mutations now verify the Stripe payment method belongs to the organization's Stripe customer before making changes.
> Last updated: 2026-05-20 - Billing settings cancellation coverage now verifies the scheduled-cancellation state, resume action, and cancellation wizard entry point.

> Last updated: 2026-05-09 - Winback `offer_token` checkout links now take precedence over 80OFF, and trial-start request models reject unexpected offer-token fields instead of silently dropping them.

> Last updated: 2026-05-07 - Signup auto-started a full-access trial (no checkout step), plan selection moved to billing page with tier comparison and downgrade warnings, and feature usage events tracked which gate-able features each org had actually used.

> Last updated: 2026-05-05 - Signup now sends a receipt-style account confirmation immediately and schedules app-owned nurture emails that stop before sending when the organization becomes paid active.

> Last updated: 2026-05-02 - Server-side quota enforcement now blocks self-serve orgs above package unit limits or the 50-building Enterprise threshold, and billing mutations require organization owner access.

> Last updated: 2026-04-28 - no-card trial activation now creates local trial access first, then routes trialing or locally paused users through Stripe Checkout to add billing

## Overview

Stripe-powered subscription billing with a 30-day free trial and one self-serve Reconcile subscription. Client-facing surfaces show Reconcile with a rentable-unit selector before Stripe checkout. New landlord accounts auto-start a Reconcile trial immediately on signup. `/checkout` preserves inbound marketing links while normalizing legacy plan parameters to Reconcile. Plan definitions come from the canonical root file (`plan-tiers.json`) and generated backend/frontend/marketing artifacts. Stripe webhooks remain the source of truth once a Stripe checkout/subscription exists.

## Features

### Self-Serve Unit Pricing

- **Reconcile**: $4,990/year list price for up to 25 rentable units; $998/year with 80OFF.
- Extra annual unit pricing is progressive: units 26-150 at $179/unit, 151-500 at $169/unit, 501-2500 at $159/unit, and 2501+ at $149/unit.
- 80OFF expires at `2026-07-04T07:00:00Z`; after that cutoff the active-offer endpoint hides it, plan selection and selected no-card trial start reject it, and Stripe Checkout does not send an expired coupon to Stripe.
- Account creation happens first, then the app auto-starts the no-card Reconcile trial and sends first-time users to `/onboard?demo=1&source=first-login`. `/checkout` and billing settings handle billing setup or unit selection after the account exists.
- `POST /api/v1/billing/trial/start` starts local 30-day trial access without collecting a card and stores the Reconcile plan, unit count, building count, and annual billing period.
- Stripe Checkout is used later when a trialing or locally paused no-card user adds billing; trialing users keep their remaining trial days, while locally paused users enter paid checkout without starting a fresh trial.
- Users are told to add billing before the trial ends to keep access.
- If the trial ends without billing, product access is paused until billing is added. Stripe-backed paused subscriptions resume through the Stripe portal/resume path; local no-card paused subscriptions open Stripe Checkout directly.
- Feature access is Reconcile-based for active subscriptions and trials.
- Backend quota enforcement uses the selected rentable-unit count stored with the billing activation.
- Paid self-serve organizations use Reconcile with published unit-band pricing for every rentable unit count.
- Rent roll imports preflight parsed property/unit counts before creating records and sync billing usage after successful import.
- Canonical plan source: `plan-tiers.json` at repo root.
- Generator: `scripts/generate-plan-tiers.mjs`.
- Generated artifacts: `backend/app/services/billing/generated_plan_tiers.py`, `frontend/src/generated/plan-tiers.ts`, `marketing/src/generated/plan-tiers.ts`.
- Legacy Growth, Portfolio, Professional, Control, and Defend tier ids continue to resolve to Reconcile-equivalent entitlements for grandfathered subscriptions.
- New checkout sessions send the Reconcile package ID and webhook handlers store the package ID in subscription metadata while mapping the legacy `plan` column to `growth_v2`.
- Subscription, checkout, customer, payment method, portal, trial, and save-offer mutation endpoints require the organization owner role.

### Auto-Start Reconcile Trial on Signup

- `POST /api/v1/billing/trial/start-default` — Auto-starts a full-access Reconcile trial (25 units, 1 building, annual) immediately after email/SSO signup. No plan selection required.
- Called fire-and-forget from `RegisterPage.tsx` and `AuthCallback.tsx` immediately after successful authentication.
- After the auto-start, `checkout_required` is `false` and the user lands on `/dashboard` with no gating.
- `ProtectedRoute` no longer redirects to `/checkout` when `checkout_required` is true.
- Service: reuses `start_trial` logic in `backend/app/api/v1/billing.py`.

### Billing Settings Checkout

- The billing settings page (`/settings/billing`) shows a collapsible "Choose your plan" card when the org is trialing without a Stripe subscription, or when `?intent=select-plan` is in the URL.
- The plan picker renders Reconcile with the annual price, included units, extra-unit pricing, and feature list.
- Confirming calls the existing `/api/v1/billing/checkout` to start Stripe Checkout.
- Components: `frontend/src/components/billing/PlanComparison.tsx`, `frontend/src/components/billing/ConfirmPlanDialog.tsx`.

### Feature Usage Tracking

- `feature_usage_events` table: tracks `(organization_id, feature_key)` pairs with `first_used_at`, `last_used_at`, and `usage_count`. Unique constraint on `(organization_id, feature_key)`. RLS: org-scoped read, service-role write.
- `record_feature_use(db_admin, organization_id, feature_key)` — upserts the row, increments count, silently swallows exceptions. Called on the success path of each gate-able endpoint.
- Instrumented endpoints: `aiLeaseExtraction`, `tenantPortal`, `disputeSystem`, `capBankTracking`, `pdfExports`, `excelExports`, `warrantyCoi`, `noiImpactCalculator`, `sb1103ComplianceExport`, `demandLetters`, `auditDefensePackage`, `taxProtest`, `aiGlNarrativeAnalysis`.
- `GET /api/v1/billing/feature-usage` — returns `{ used_features: [...], current_tier }`.
- Frontend hook: `useFeatureUsage()` in `frontend/src/hooks/use-feature-usage.ts` (TanStack Query, 5-min cache).
- Service: `backend/app/services/billing/feature_usage.py`.
- Migration: `supabase/migrations/20260507000000_create_feature_usage_events.sql`.

### Subscription Management

- `GET /api/v1/billing/subscription` — Current subscription details.
- `POST /api/v1/billing/subscription/upgrade` — Prorated upgrade (immediate).
- `POST /api/v1/billing/subscription/downgrade` — Downgrade at end of billing period.
- `POST /api/v1/billing/subscription/cancel` — Cancel at period end (default) or immediate. Accepts optional `attempt_id` to link save offer.
- `POST /api/v1/billing/subscription/resume` — Resume a paused subscription after billing is added, or remove a scheduled cancellation.
- Billing settings shows the scheduled-cancellation state with a `Canceling` badge, no upcoming invoice, the period-end date, and a `Resume Subscription` action instead of another cancel action.
- Service: `backend/app/services/billing/subscriptions.py`.

### Building Sync

- Enforces building count against subscription limits.
- Syncs count between Stripe quantity and local property count.
- Service: `backend/app/services/billing/building_sync.py`.

### Customer Management

- `GET /api/v1/billing/customer` — Get Stripe customer for org.
- `POST /api/v1/billing/customer` — Create or get Stripe customer (uses billing_email or user email).
- Service: `backend/app/services/billing/customers.py`.

### Payment Methods

- `GET /api/v1/billing/payment-methods` — List all payment methods.
- `POST /api/v1/billing/payment-methods/setup` — Create SetupIntent for adding a card.
- `POST /api/v1/billing/payment-methods/{id}/default` — Set default payment method.
- `DELETE /api/v1/billing/payment-methods/{id}` — Remove a payment method.
- `POST /api/v1/billing/portal` — Create Stripe Customer Portal session.
- Default and remove mutations retrieve the target Stripe payment method and reject IDs that are not attached to the organization's Stripe customer.
- Service: `backend/app/services/billing/payment_methods.py`.

### 30-Day Money-Back Guarantee

- `GET /api/v1/billing/guarantee/eligibility` — Check if org is eligible for a refund (within 30 days of first paid invoice and not already claimed).
- `POST /api/v1/billing/guarantee/claim` — Issue full refund on first invoice via Stripe and immediately cancel subscription (prorate=False, invoice_now=False to prevent double-refund from prorated credit).
- Eligibility rules: first paid invoice must be within 30 days, `money_back_claimed_at` must be NULL.
- Claim sequence: record `money_back_claimed_at` + `money_back_refund_id` in DB _before_ calling `stripe.Subscription.cancel` (crash-safe, prevents double-claim).
- Frontend: `CancelSubscriptionWizard` shows `GuaranteeStep` as step 0 when eligible (auto-derived via `useQuery`). "Skip" advances to exit survey; "Claim my refund" issues refund and closes wizard.
- Buyer-facing copy: app pricing, app checkout, marketing pricing, marketing pricing teaser, generated public knowledge, and pricing FAQs disclose the 30-day money-back guarantee before paid access.
- Copy source: guarded public pricing surfaces use `publicKnowledge.claims.byId["money-back-guarantee"]` so the guarantee stays tied to canonical public knowledge.
- Service: `backend/app/services/billing/guarantee.py`.

### Cancellation Flow with Save Offers

- `POST /api/v1/billing/save-offer` — Submit exit survey (cancel reason) and receive a save offer.
- `POST /api/v1/billing/save-offer/{attempt_id}/accept` — Apply Stripe coupon to subscription.
- `POST /api/v1/billing/save-offer/{attempt_id}/decline` — Record rejection (non-blocking).
- Offer mapping by reason in `OFFER_MAPPING` dict:
  - `too_expensive`, `not_using_enough`, `switching_competitor`, `other` -> `DISCOUNT_20PCT_1INV` for annual subscribers.
  - `missing_feature` -> `FEATURE_ROADMAP`.
  - `business_closed` -> `NONE`.
- Annual subscribers get `DISCOUNT_20PCT_1INV` (checked via Stripe subscription interval).
- Service: `backend/app/services/billing/save_offers.py`.

### Checkout

- `POST /api/v1/billing/checkout` - Create Stripe Checkout Session. Request: `plan_id`, `billing_period` (`annual` only), `unit_count`, `building_count`, `success_url`, `cancel_url`.
- `GET /api/v1/billing/checkout/success` - Confirm session (actual subscription creation via webhook).
- Validates plan, unit count, and building count, creates/fetches Stripe customer before session, and enforces `SELF_SERVE_PLAN_IDS = {"reconcile"}` for app self-serve checkout.
- App self-serve checkout only permits the `reconcile` tier id on the client. Retired tier deep-links and manual tier overrides are redirected to the active Reconcile checkout path.
- Subscription checkout explicitly sets `payment_method_collection="if_required"` so a $0 trial start can complete without collecting a card up front.
- Trial sessions also set `subscription_data.trial_settings.end_behavior.missing_payment_method="pause"` so trial access pauses cleanly when billing is missing at the end of the 30 days.
- If the org already has a Stripe-backed paused subscription, checkout rejects the request and the app sends the user to billing settings / Stripe portal to add a payment method and resume access.
- If the org has a local no-card trial subscription with no Stripe subscription id, checkout creates or reuses a Stripe customer and creates the first Stripe subscription. Existing local trial users keep only their remaining trial days; expired local trials collect payment without granting another free trial.
- `POST /api/v1/billing/subscription/resume` now handles both scheduled-cancellation resumes and Stripe `paused` subscriptions that need to be reactivated after billing is added.
- Winback `offer_token` links are mutually exclusive with 80OFF: `/checkout` and billing settings preserve the token and omit `launch_offer_code`, while backend request validation rejects unexpected offer-token fields on trial-start requests.

### Trial Lifecycle Emails

- Signup confirmation sends immediately after account creation and points users to `/checkout`; email delivery failures do not block signup or product flow.
- Signup nurture emails are scheduled for day 1, 3, 7, 14, and 24 through the app-owned `signup_email_events` table and sent by the internal cron endpoint only while the organization is not paid active.
- Signup nurture emails use marketing unsubscribe headers and one-click unsubscribe links. The immediate account confirmation is transactional and does not include marketing unsubscribe headers.
- Trial start email sends when Stripe `customer.subscription.created` produces a CapVeri `trialing` subscription.
- 3-day reminder email sends on Stripe `customer.subscription.trial_will_end`.
- Paused-trial email sends when Stripe updates the subscription to `paused` because the trial ended without a payment method.
- Both email types are idempotent per subscription via `subscription_email_events`.
- Email service templates:
  - `trial_started`
  - `trial_ending_soon`
  - `trial_paused`
- Trial messaging now standardizes on: 30-day free trial, no credit card required, add billing before trial ends to keep access.
- Email payload includes trial start date, trial end date, billing/settings link, and paused-state reactivation guidance when applicable.

### Invoices

- `GET /api/v1/billing/invoices` — Paginated invoice list with status filter.
- `GET /api/v1/billing/invoices/summary` — Billing summary (total/paid/open counts, total paid amount).
- `GET /api/v1/billing/invoices/{id}` — Single invoice detail.
- `GET /api/v1/billing/invoices/{id}/pdf` — Redirect to Stripe-hosted PDF.
- Invoices are immutable financial records; INSERT/UPDATE restricted to service_role.

### Stripe Webhooks

- Webhook events stored in `stripe_webhook_events` with idempotency via UNIQUE `stripe_event_id`.
- Service-role only access (RLS policy denies all user access).
- Handles subscription lifecycle events, payment success/failure, invoice creation.
- Includes `customer.subscription.trial_will_end` handling for the 3-day trial reminder email.
- Treats Stripe `paused` status as a first-class subscription state so local access gating and billing surfaces can prompt the user to add billing and resume.
- Billing activation state also exposes a paused-subscription flag so gated screens can route paused users to billing settings instead of showing a fresh trial-start CTA.

## Database Tables

### subscriptions

- `id` UUID PK, `organization_id` UUID UNIQUE FK, `stripe_subscription_id` VARCHAR(255), `stripe_customer_id` VARCHAR(255)
- `plan` subscription_plan ENUM (free/starter/professional/enterprise), `status` subscription_status ENUM (trialing/active/past_due/canceled/paused)
- `current_period_start` TIMESTAMPTZ, `current_period_end` TIMESTAMPTZ, `cancel_at_period_end` BOOLEAN
- `money_back_claimed_at` TIMESTAMPTZ (NULL = not yet claimed), `money_back_refund_id` TEXT (Stripe rf_xxx)
- RLS: SELECT by org members. INSERT by owner only. UPDATE by org members. No DELETE (soft cancel only).
- INSERT/UPDATE also granted to service_role for webhook-driven mutations.

### invoices

- `id` UUID PK, `organization_id` FK, `subscription_id` FK (nullable), `stripe_invoice_id` VARCHAR(255) UNIQUE
- `amount_due` NUMERIC(12,2) >= 0, `amount_paid` NUMERIC(12,2) >= 0, `currency` CHAR(3) default 'usd'
- `status` invoice_status ENUM (draft/open/paid/void/uncollectible)
- `period_start`, `period_end` TIMESTAMPTZ, `due_date`, `paid_at`, `pdf_url` TEXT
- Constraints: `amount_paid <= amount_due`, `period_end > period_start`
- RLS: SELECT by org members. INSERT/UPDATE by service_role only. No DELETE (immutable).

### cancel_attempts

- `id` UUID PK, `organization_id` FK, `cancel_reason` cancel_reason ENUM, `other_text` TEXT
- `offer_shown` save_offer_type ENUM (discount_20pct_1inv/feature_roadmap/none)
- `offer_accepted` BOOLEAN, `stripe_coupon_id` TEXT, `created_at` TIMESTAMPTZ
- RLS: SELECT by org members, full access for service_role.

### stripe_webhook_events

- `id` UUID PK, `stripe_event_id` VARCHAR(255) UNIQUE, `event_type` VARCHAR(100)
- `status` VARCHAR(20) CHECK (processing/succeeded), `created_at`, `processed_at`
- RLS: service_role only (user policy: `USING (false)`).

### subscription_email_events

- `id` UUID PK, `organization_id` UUID FK, `stripe_subscription_id` TEXT, `email_type` TEXT, `status` TEXT
- `stripe_event_id` TEXT, `provider_message_id` TEXT, `created_at` TIMESTAMPTZ, `sent_at` TIMESTAMPTZ
- Unique constraint per subscription and email type: `(stripe_subscription_id, email_type)`
- Email types: `trial_started`, `trial_ending_soon`, `trial_paused`
- Status values: `processing`, `sent`
- RLS: service_role only (authenticated users denied)

### promotions

- Discount/offer codes for marketing campaigns.
- Created via migration `20240101000014_create_promotions.sql`.

## Key Files

- `backend/app/api/v1/billing.py` — All billing endpoints (customer, subscription, payment methods, checkout, invoices, save offers)
- `backend/app/services/billing/plans.py` — `PLANS` dict, `PlanDetails`, `PlanFeatures`, feature gating functions
- `backend/app/services/billing/subscriptions.py` — Subscription CRUD with Stripe
- `backend/app/services/billing/customers.py` — Stripe customer management
- `backend/app/services/billing/payment_methods.py` — Payment method + portal sessions
- `backend/app/services/billing/save_offers.py` — `SaveOfferService`, `OFFER_MAPPING`, coupon application
- `backend/app/services/billing/free_audit.py` - Legacy free-audit eligibility code retained for compatibility; current acquisition uses the no-card trial flow above
- `backend/app/services/billing/offer_tokens.py` - Deprecated signed free-audit offer token handling retained for historical checkout links
- `backend/app/services/billing/building_sync.py` — Building count enforcement
- `backend/app/services/billing/stripe_client.py` - Stripe API wrapper
- `backend/app/services/billing/config.py` - Stripe settings (coupon IDs, price IDs)
- `backend/app/api/routes/webhooks.py` - Stripe webhook handlers including trial lifecycle email dispatch
- `backend/app/services/email/resend_service.py` - Trial lifecycle email send methods
- `backend/app/services/email/templates/trial_started.html` - Trial start confirmation template
- `backend/app/services/email/templates/trial_ending_soon.html` - Trial ends in 3 days reminder template
- `backend/app/services/email/templates/trial_paused.html` - Trial paused because billing was not added before the end date
- `backend/app/models/cancel_attempt.py` - `CancelAttempt`, `CancelReason`, `SaveOfferType`
- `backend/app/models/subscription.py` - `Subscription`, `SubscriptionPlan` (includes money_back_claimed_at, money_back_refund_id)
- `backend/app/services/billing/guarantee.py` - `GuaranteeService`, `GuaranteeEligibility`
- `frontend/src/pages/settings/Billing.tsx` — Plan display, upgrade/downgrade/cancel buttons
- `frontend/src/features/plg/steps/PaywallStep.tsx` - Legacy compatibility redirect that forwards `/onboard/unlock` traffic to the canonical `/checkout` route
- `frontend/src/pages/settings/Invoices.tsx` — Invoice list with PDF download
- `frontend/src/pages/Checkout.tsx` — Package selection, 80OFF offer handling, Stripe payment
- `frontend/src/pages/CheckoutSuccess.tsx` — Post-checkout confirmation
- `frontend/src/hooks/use-free-audit-status.ts` - Client hook for free-audit eligibility/status
- `frontend/src/components/billing/FreeAuditUpgradeModal.tsx` - Upgrade modal with free-audit messaging
- `frontend/src/pages/resources/HelpCenter.tsx` - Public FAQ copy that now matches the no-card trial and paused-access lifecycle
- `supabase/migrations/20240101000012_create_subscriptions.sql`
- `supabase/migrations/20240101000013_create_invoices.sql`
- `supabase/migrations/20260224000002_create_cancel_attempts.sql`
- `supabase/migrations/20240101000066_create_stripe_webhook_events.sql`
- `supabase/migrations/20260225120000_pricing_restructure.sql`
- `supabase/migrations/20260226010000_create_free_audit_winback_offers.sql`
- `supabase/migrations/20260227000000_add_money_back_columns.sql`
- `supabase/migrations/20260420010000_create_subscription_email_events.sql`
- `frontend/src/components/billing/CancelSubscriptionWizard.tsx` - GuaranteeStep (step 0 when eligible)

## 2026-02-28 Update Notes

### Deprecated Per-Audit Credit Pack Model

Historical model only. New customers use the subscription trial flow above; do not use audit credits in current product or marketing copy.

**Current replacement**: 30-day free trial with no credit card required, self-serve subscription pricing, and "add billing before trial ends to keep access."

**Database**:

- `audit_credits` table: credit pack purchases per org. Generated `credits_remaining` column.
- `credit_consumption_log`: immutable audit trail, one row per audit run.
- `subscriptions.billing_model TEXT DEFAULT 'subscription'` CHECK `('subscription','credit_pack')`.

**Backend**:

- `backend/app/services/billing/credits.py` — `get_credit_balance()`, `consume_credit()` (optimistic concurrency), `add_credits()`, `has_ever_purchased()`.
- `backend/app/services/billing/plans.py` — `VOLUME_TIERS`, `get_unit_price_cents()`, `get_total_price_cents()`.
- `backend/app/services/billing/stripe_client.py` — `create_credit_pack_checkout_session()` with `mode: "payment"`.
- `backend/app/api/v1/billing.py` — `POST /checkout/credits`, `GET /credits`, `GET /credits/history`.
- `backend/app/api/routes/webhooks.py` — routes `checkout.session.completed` on `session.mode == "payment"`.
- `backend/app/services/billing/entitlements.py` — `has_full_access = has_subscription OR has_ever_purchased`.
- `backend/app/services/billing/building_sync.py` — guards on `billing_model == "credit_pack"`.
- `supabase/migrations/20260304000001_add_credit_pack_billing.sql`.

**Frontend**:

- `frontend/src/hooks/use-credit-balance.ts` — TanStack Query hook for `GET /api/v1/billing/credits`.
- `frontend/src/pages/settings/Billing.tsx` — credit balance card: shows `{total_remaining} credits remaining` + "Buy More Credits" CTA when org has purchased credits.
- `frontend/src/pages/CheckoutSuccess.tsx` — copy updated: "your audit credits have been added" (was "subscription is now active").
- `frontend/src/pages/Checkout.tsx` — quantity selector replaces plan/building-count params.
- `frontend/src/components/billing/CheckoutDialog.tsx` — calls `/checkout/credits`.
- `frontend/src/types/subscription.ts` — `CreditBalance`, `CreditPack`, `CreditCheckoutRequest/Response` types.

**Marketing**:

- `marketing/src/config/plans.ts` — `VOLUME_TIERS`, `getUnitPrice()`, `getTotalPrice()`.
- `marketing/src/components/PricingContent.tsx` — full rewrite: volume pricing table + estimator + all-features-included list.
- `marketing/src/components/landing/PricingTeaser.tsx` — full rewrite: volume tier table + feature list.
- `marketing/src/data/pricing-faqs.ts` — credit model FAQs.

---

## 2026-02-27 Update Notes

- Added 30-day money-back guarantee: GuaranteeService, two billing endpoints, GuaranteeStep in cancel wizard, and marketing trust badge on PricingContent + PricingTeaser.
- DB columns `money_back_claimed_at` and `money_back_refund_id` added to subscriptions.

## 2026-02-26 Update Notes

- Added free-audit winback offer flow across backend billing services and frontend upgrade prompts.
- Added signed offer token support and free-audit winback persistence migration.
- Added `ANTHROPIC_MODEL=claude-sonnet-4-0` usage path so Sonnet tracks Anthropic alias instead of a dated model snapshot.
