# Security overview

**CapVeri** | Last updated: 2026-05-28 | Questions: angel.campa@capveri.com

---

This document covers the security controls built into CapVeri. It is intended for IT and security reviewers, CFOs, and property management admins evaluating the platform.

---

## Identity and access control

Authentication is handled by Supabase Auth using JWT tokens. Sessions expire and rotate on re-authentication.

Access is controlled by five roles:

| Role | What they can do |
|------|-----------------|
| Owner | Full organization access, billing |
| Admin | All data operations, team management |
| Member | Upload, reconcile, view |
| Viewer | Read-only access to reconciliation results |
| Tenant | Read-only access to their own lease data via tenant portal |

Every API request resolves to an organization context via the `CurrentUser` dependency. There is no way to reach another organization's data through the API — the org boundary is enforced at the function-call level before any database query runs.

---

## Row-level security

Every table in the database has PostgreSQL Row-Level Security (RLS) enabled. The core predicate is:

```sql
organization_id = get_user_organization_id()
```

This runs at the database layer. Even if an application bug constructs a bad query, the database refuses to return rows from other organizations.

Finalized reconciliation snapshots are immutable: the UPDATE policy on `reconciliation_snapshots` blocks changes to finalized records, preventing retroactive modification of reported numbers.

---

## Audit trail

An append-only `audit_log` table captures every INSERT, UPDATE, and DELETE on:

- `gl_entries` — general ledger imports
- `reconciliation_snapshots` — CAM reconciliation results
- `leases` — lease term changes (which affect how recoveries are calculated)

Each log entry records:

- The user ID (`auth.uid()`)
- The organization
- The action (INSERT / UPDATE / DELETE)
- A before-snapshot and after-snapshot in JSONB
- A UTC timestamp

The audit log has no UPDATE or DELETE policy — rows cannot be modified after creation. Admin-only read access is enforced by RLS.

---

## Encryption

- **In transit**: HTTPS/TLS, terminated by Cloudflare and other service providers. The application sets the `Strict-Transport-Security` header with `max-age=31536000; includeSubDomains`, which instructs browsers to use HTTPS only.
- **At rest**: Encryption provided by Supabase managed PostgreSQL (AWS) and Cloudflare R2, using each provider's default at-rest encryption.

---

## Data retention

Financial records are retained for **10 years** per IRS § 6001 and Rev. Proc. 98-25. The 21 financial tables (GL entries, reconciliations, leases, invoices, audit log, and others) are never automatically deleted.

Operational records (tenant accounts, invitations, feedback) are retained 2–3 years. Transient records (job queues, sent email logs, read notifications, webhook event deduplication) are automatically purged weekly via `pg_cron`. Unread notifications are never purged.

For the full table-by-table breakdown, see [Data Retention Policy](./data-retention-policy.md).

---

## API security

The following HTTP response headers are set on every response:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

CORS is configured with an explicit whitelist of allowed origins. Wildcard origins (`*`) are not permitted.

All request bodies are validated with Pydantic v2 before reaching any business logic.

---

## Webhook security

Inbound webhooks from Stripe and Resend are verified using HMAC signatures before processing. Replay attacks are blocked via an idempotency table (`stripe_webhook_events`) that deduplicates events by ID.

---

## Secrets management

Credentials are stored in Cloudflare Worker secrets/vars and provider dashboards. Nothing sensitive is committed to the git repository. GitHub secret scanning is enabled.

High-sensitivity keys (Stripe secret, Supabase service role) rotate on a 90-day schedule.

---

## Infrastructure

| Component | Provider |
|-----------|----------|
| Database + Auth | Supabase (PostgreSQL on AWS) |
| Object storage (document PDFs) | Cloudflare R2 |
| Backend API | Cloudflare Workers |
| Frontend / Marketing | Cloudflare Workers |
| AI model gateway | OpenRouter (routes to Google Gemini, Moonshot Kimi, OpenAI GPT, Z.ai GLM) |
| Bot protection | Cloudflare Turnstile |
| Product analytics | PostHog |
| Billing | Stripe |
| Email | Resend |

Each provider maintains independent security certifications. CapVeri does not operate its own physical infrastructure.

---

## Multi-tenancy

Every data table is partitioned by `organization_id`. The database enforces the boundary — it is not an application-level check. Background jobs (retention purge, calculation workers) run under a service role with access restricted to specific functions; they cannot read arbitrary organization data.

---

## What we do not claim

- **No SOC 2 audit report.** Controls are designed to SOC 2 principles, but no third-party audit has been conducted.
- **No HIPAA scope.** CapVeri processes commercial real estate financial data, not health information.
- **No field-level encryption** beyond what Supabase provides by default.

For questions, email angel.campa@capveri.com.
