# Self-Serve Funnel Redesign

**Date:** 2026-02-21
**Goal:** Fix broken funnel so boutique/small PMCs can reach the product through a fully self-serve path — register → onboarding → see leakage → convert.

---

## Problem

The product works end-to-end (leakage API is fully implemented) but the funnel is broken in three places:

1. `/auth/register` returns 404 — no one can sign up
2. Email registration redirects to `/dashboard` instead of `/onboarding` — skips the activation experience
3. All "Request Free Audit" CTAs point to a generic contact form — the self-serve path is invisible

---

## Design

### Section 1: Funnel Architecture

All entry points converge on `/auth/register`, which then routes to `/onboarding`.

**Before:**
```
"Request Free Audit" → /contact (generic form)
"Get Started"        → /register → 404
Email signup         → /dashboard (skips onboarding)
Social signup        → /onboarding
```

**After:**
```
"Request Free Audit" → /auth/register?intent=audit → /onboarding
"Get Started"        → /auth/register              → /onboarding
Email signup         → /onboarding  (fixed)
Social signup        → /onboarding  (unchanged)
```

The `?intent=audit` query param is passed through to onboarding to optionally adjust welcome copy ("Let's find your leakage" vs generic "Get started"). Same steps either way.

**Code changes:**
- Fix 404 on `/auth/register` (Vercel routing config)
- `RegisterPage.tsx` line 85: change redirect from `/dashboard` to `/onboarding`

---

### Section 2: CTA Unification

Every CTA on the marketing site that implies starting an audit points to `/auth/register`.

| Page | CTA | Old destination | New destination |
|------|-----|-----------------|-----------------|
| Homepage hero | "Request Free Audit" | `/contact?source=hero&type=audit` (blank) | `/auth/register?intent=audit` |
| Homepage ROI calculator | "Get Started" | `/register` (404) | `/auth/register` |
| Nav | "Request Audit" | `/contact?source=nav` | `/auth/register?intent=audit` |
| Pricing page | "Request Free Audit" | `/contact?source=pricing-bounty` | `/auth/register?intent=audit` |
| Pricing page | "Get Started" slider | `/register?plan=growth&buildings=5` (404) | `/auth/register?plan=growth&buildings=5` |

**Contact page changes:**
- Remove the "Free Revenue Audit" sidebar card (implies manual audit path)
- Keep the general contact form for support/sales only

---

### Section 3: Onboarding Leakage Step Fix

The leakage step (step 5) requires a finalized reconciliation snapshot. New users who just uploaded GL data in step 4 have no snapshot, so the step shows nothing.

**Fix:** Auto-trigger a background reconciliation job immediately after GL upload succeeds in step 4. Step 5 polls for the result.

**New leakage step state machine:**

```
[Processing]
  "Analyzing your CAM data... usually takes 30-60 seconds"
  Polls GET /api/v1/leakage/{propertyId} every 5s
  Shows animated progress indicator
       ↓
[Missing billing data]  (if has_reconciliation_data=true but has_billing_data=false)
  "Upload what you actually billed tenants to calculate your leakage"
  Inline billing upload / manual entry (already built)
       ↓
[Results]  (if leakage > 0)
  "$34,200 in recoverable leakage found"
  "Claim Recovery (20% fee)" CTA
  "Subscribe for ongoing monitoring" secondary CTA
       ↓
[No leakage found]  (if leakage = 0)
  "Your CAM billing looks accurate — no errors found"
  "Subscribe to monitor future reconciliations" CTA

[Timeout fallback]  (if no result after 90s)
  "We're still processing your data. We'll email you results within 10 minutes."
  Advances to completion step automatically
```

**New backend endpoint needed:**
`POST /api/v1/reconciliation/auto-run` — accepts `property_id` + `import_batch_id`, triggers a reconciliation job in the background, returns a `job_id` for polling. This keeps the heavy computation async and doesn't block the UI.

**Polling:**
Frontend polls `GET /api/v1/leakage/{propertyId}` every 5s. When `has_reconciliation_data` flips to `true`, transition out of processing state.

---

## Out of Scope

- Redesigning onboarding wizard steps 1-4 (they work)
- Changing pricing or plan structure
- Building a pre-auth audit intake (Option C — future)
- Adding social proof / testimonials to marketing site (separate task)

---

## Success Criteria

1. A new user can click "Request Free Audit" on the homepage, create an account, complete onboarding, and see a real leakage number — without any manual intervention from the CapVeri team
2. `/auth/register` returns 200
3. Email signup lands on `/onboarding`
4. No CTA on the marketing site points to the contact form as an audit entry point
5. Leakage step shows a processing state instead of blank when reconciliation is running
