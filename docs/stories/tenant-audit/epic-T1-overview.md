# Epic T1: Backend Payment & Data Model

## Purpose

Establishes the standalone data model and Stripe one-time payment flow for the tenant CAM audit product. This epic creates the `tenant_audits` table (no FK to existing platform tables), the Stripe Checkout integration for one-time payments across three pricing tiers, and the public API endpoints that power the tenant audit wizard. The architecture is fully decoupled from the landlord SaaS product so it can operate as an independent acquisition channel.

## Business Value

Enables commercial tenants to upload their CAM reconciliation statement and lease, pay a one-time fee, and receive an independent audit report -- all without requiring a platform account. This creates a new revenue stream, drives tenant-side awareness, and serves as a lead-generation funnel for landlord subscriptions.

## Architecture Decisions

- **No FKs to existing tables**: `tenant_audits` is fully standalone. No references to `organizations`, `users`, `properties`, or `leases`. This keeps the product decoupled and deployable independently.
- **UUID access tokens**: Each audit gets a UUID `access_token` used as the public identifier in URLs. No authentication required -- the token IS the credential.
- **JSONB for results**: Extraction and calculation results are stored as JSONB columns, not normalized tables. This keeps the schema simple and avoids schema migrations as the AI extraction output evolves.
- **Stripe one-time Checkout Sessions**: Not subscriptions. Three tiers: Standard ($49), Detailed ($99), Expert ($199). Each tier maps to a Stripe Price ID configured via environment variables.
- **State machine**: Audits follow a strict status progression: `created` -> `payment_pending` -> `paid` -> `processing` -> `completed` | `failed` | `refunded`.
- **Auto-refund on failure**: If processing fails after payment, the system automatically issues a full refund via Stripe.
- **RLS with service_role bypass**: The table has RLS enabled but all access goes through the API using `service_role` key. No direct client-side Supabase access.

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| POST /api/v1/tenant-audits/ (create) | 5 per hour per IP |
| GET /api/v1/tenant-audits/{access_token} (status) | 60 per minute per IP |
| POST /api/v1/tenant-audits/{access_token}/pay | 10 per hour per IP |
| POST /api/v1/tenant-audits/webhooks/stripe | No limit (Stripe signature verified) |

## Dependencies

- Stripe account with one-time Price IDs for each tier
- Supabase project with service_role key
- S3 bucket for file storage (or Supabase Storage)
- Existing `backend/app/services/billing/stripe_client.py` for Stripe SDK wrapper

## Stories in This Epic

| ID | Story | Hours | Status |
|---|---|---|---|
| T1.1 | Tenant Audit Data Model | 4 | pending |
| T1.2 | Stripe One-Time Payment | 5 | pending |
| T1.3 | Stripe Webhook Handler | 4 | pending |
| T1.4 | Tenant Audit API Endpoints | 6 | pending |

**Total Hours**: 19

## Status State Machine

```
                ┌──────────┐
                │ created  │ <-- Upload files, provide email
                └────┬─────┘
                     │
                     │ Files validated
                     v
           ┌─────────────────┐
           │ payment_pending  │ <-- Waiting for Stripe Checkout
           └────────┬────────┘
                    │
                    │ checkout.session.completed
                    v
              ┌──────────┐
              │   paid   │ <-- Payment confirmed
              └────┬─────┘
                   │
                   │ Background processing starts
                   v
            ┌─────────────┐
            │ processing  │ <-- AI extraction + calculation
            └──────┬──────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        v                     v
  ┌───────────┐        ┌──────────┐
  │ completed │        │  failed  │
  └───────────┘        └────┬─────┘
                            │
                            │ Auto-refund issued
                            v
                      ┌──────────┐
                      │ refunded │
                      └──────────┘
```
