# Billing Package Architecture

This document used to describe the retired per-building billing model. CapVeri now uses annual-only Reconcile billing for self-serve customers.

## Current Self-Serve Package

| Package | Annual list price | 80OFF annual price | Included capacity |
|---------|-------------------|-----------------------|-------------------|
| Reconcile | $4,990/year | $998/year | Up to 25 rentable units |

Extra annual unit pricing is progressive: units 26-150 at $179/unit, 151-500 at $169/unit, 501-2500 at $159/unit, and 2501+ at $149/unit.

Self-serve billing is annual only. CapVeri offers a 30-day free trial with no credit card required and a 30-day money-back guarantee after the first annual payment.

## Source of Truth

- Canonical package metadata: `plan-tiers.json`
- Backend Stripe settings: `backend/app/services/billing/config.py`
- Generated backend tiers: `backend/app/services/billing/generated_plan_tiers.py`
- Generated frontend tiers: `frontend/src/generated/plan-tiers.ts`
- Generated marketing tiers: `marketing/src/generated/plan-tiers.ts`

Run `npm run plans:generate` in `frontend/` or `marketing/` after changing `plan-tiers.json`.

## Checkout Flow

1. User starts a 30-day no-card trial from package selection.
2. Trial selection stores package, active rentable unit count, building count, and `billing_period="annual"`.
3. When billing is added, Stripe Checkout uses the annual package price ID.
4. 80OFF is applied when the limited offer is valid.
5. If no payment method is added by the end of the trial, access pauses until billing is added.

## Legacy Compatibility

Older Stripe subscriptions and database rows may still use legacy tier names such as `growth_v2`. Webhook handling keeps those records compatible, but new self-serve checkout should only create Reconcile unit-based annual subscriptions.

Do not add monthly self-serve price IDs or monthly checkout branches. Monthly tenant CAM billing remains a lease/accounting concept, not a CapVeri subscription option.
