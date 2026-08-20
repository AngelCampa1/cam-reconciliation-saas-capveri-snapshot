# System Architecture

> CapVeri — CRE FinOps SaaS for CAM reconciliation. Last updated: 2026-06-17.
>
> **This is a working engineering doc, dated to a point mid-build (2026-06-17); the system moved on
> after this was written.** For the architecture as it stood at code freeze, verified against the
> final source tree, see [`portfolio/ARCHITECTURE.md`](../../portfolio/ARCHITECTURE.md) — that
> document is the authoritative one.

---

## System Overview

CapVeri automates Common Area Maintenance (CAM) reconciliation for commercial landlords. It ingests GL exports (CSV/Excel) and lease PDFs from legacy property management systems (Yardi, MRI, RealPage), runs deterministic financial calculations, and produces tenant-facing reconciliation packets. The core architectural principle is **Anti-Integration** — no API connections to source systems, only file imports.

```
                         ┌─────────────────────────────────────────┐
                         │              Browsers                   │
                         └──────┬──────────┬──────────┬────────────┘
                                │          │          │
                    ┌───────────▼──┐  ┌────▼────┐  ┌─▼──────────────┐
                    │ www.capveri  │  │  app.   │  │  Tenant Portal │
                    │    .io       │  │capveri │  │ (app.capveri  │
                    │  (Next.js)   │  │  .io    │  │   .io/tenant)  │
                    │   Cloudflare     │  │(React)  │  │   (React)      │
                    └──────────────┘  │ Cloudflare  │  └───────┬────────┘
                                      └────┬────┘          │
                                           │               │
                                      ┌────▼───────────────▼────┐
                                      │    api.capveri.com      │
                                      │ Cloudflare Worker API    │
                                      └────┬──┬──┬──┬──┬────────┘
                                           │  │  │  │  │
                          ┌────────────────┘  │  │  │  └─────────────┐
                          ▼                   ▼  │  ▼               ▼
                     Supabase             Stripe  │  Resend       Sentry
                    (Postgres              │    │
                     + Auth               AWS    Claude 3.5
                     + Storage)        document reader   Sonnet (ZDR)
```

---

## Deployment Topology

| Service | URL | Host | Deploy |
|---------|-----|------|--------|
| Marketing site | `www.capveri.com` | Cloudflare Worker `capveri-marketing` | `cd marketing && npm run deploy:cf` |
| App frontend | `app.capveri.com` | Cloudflare Worker `capveri-app` | `cd frontend && npm run deploy:cf` |
| Backend API | `api.capveri.com` | Cloudflare Worker `capveri-api` | `cd cloudflare-backend && npx wrangler deploy --env production` |
| Database | Supabase-managed | Supabase | Migrations in `supabase/migrations/` |

No deploy branches. Marketing, frontend, and backend API deploy through Wrangler to Cloudflare Workers. Railway is retired and is not a CapVeri production deploy target.

---

## Backend

### Entry Point & Middleware

Production API traffic is served by `cloudflare-backend/` on Cloudflare Worker `capveri-api`.
The Python FastAPI tree in `backend/` remains a legacy reference and test surface while parity work is retained.

`backend/app/main.py` — legacy `create_app()` factory. The middleware stack executes in this order per request:

```
Request → CorrelationIdMiddleware → RateLimitMiddleware → CORSMiddleware → SecurityHeaders → Endpoint
```

**Rate limits** (production): 100 req/min per authenticated user (JWT `sub`), 20 req/min per IP (unauthenticated). Exempt paths: `/health`, `/webhooks/*`, `/docs`, `/openapi.json`.

**Security headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `HSTS: max-age=31536000; includeSubDomains`.

**CORS**: Dev allows any `localhost:*`. Production whitelist: `capveri.com`, `app.capveri.com`, `www.capveri.com`.

### Authentication

Supabase Auth issues JWTs. FastAPI dependencies validate the token and resolve the user:

```python
CurrentUser        = Annotated[User,                Depends(get_current_user)]
CurrentActiveUser  = Annotated[User,                Depends(get_current_active_user)]
CurrentAdminUser   = Annotated[User,                Depends(get_current_admin_user)]
CurrentPlatformAdmin = Annotated[User,              Depends(get_current_platform_admin)]
CurrentTenantUser  = Annotated[TenantUser,          Depends(get_current_tenant_user)]
OrgContext         = Annotated[OrganizationContext,  Depends(get_org_scoped_context)]
```

The dependency chain: validate Bearer JWT via `supabase.auth.get_user(token)` → set `supabase.postgrest.auth(token)` so RLS `auth.uid()` works → fetch user profile from `users` table → return typed user object.

`OrgContext` bundles the authenticated Supabase client, `organization_id`, and `user` into a single injectable. It provides `.table(name)` and `.filter_by_org(query)` helpers.

Five roles: **Owner**, **Admin**, **Member**, **Viewer** (landlord portal), **Tenant** (tenant portal). See [rbac-permissions.md](./rbac-permissions.md) for the full permission matrix.

### Database Client

`SupabaseClientManager` manages two singleton clients:

- **Anon client** — respects RLS, used for all user-authenticated requests. The JWT is passed via `.postgrest.auth(token)` so Postgres sees the real user.
- **Service role client** — bypasses RLS, used for admin/cross-tenant operations only (webhooks, background jobs).

Both are reset on app startup via the lifespan hook.

### API Routers

40+ routers mounted under `/api/v1` in `backend/app/api/v1/__init__.py`. Key groups:

| Domain | Prefix | Description |
|--------|--------|-------------|
| **Auth** | `/auth` | Login, token validation |
| **Properties** | `/properties` | CRUD, nested `/units`, `/expense-pools`, `/pool-mappings` |
| **Leases** | `/leases` | CRUD, term versions, upload |
| **Ingestion** | `/ingestion` | CSV/Excel upload, batch management |
| **Reconciliation** | `/reconciliation` | Calculate, snapshot, finalize |
| **Campaigns** | `/campaigns` | Reconciliation campaign workflow |
| **Analysis** | `/analysis` | YoY comparison, trend analysis |
| **Extraction** | `/extractions` | OCR job management |
| **Documents** | `/documents` | S3 document storage |
| **Billing** | `/billing` | Stripe subscriptions, payment methods |
| **Exports** | `/exports`, `/export` | PDF, Excel, ERP, CSV exports |
| **Portfolio** | `/portfolio` | Portfolio-level summary, pipeline |
| **Disputes** | `/disputes` | Admin dispute management |
| **Tenant Portal** | (various) | Dashboard, disputes, notifications, invitations, signup |
| **Team** | (various) | Team member invitations, signup |
| **Compliance** | `/compliance/sb1103` | California SB 1103 export |
| **Other** | Various | Leakage, demand letters, tax protest, rent roll, warranty, tools, leads, onboard, audit trail, feedback |

Webhooks (`/webhooks/stripe`, `/webhooks/resend`) are registered at the app root, outside `/api/v1`.

### Service Domains

Services live in `backend/app/services/` and follow domain separation:

| Directory | Responsibility | Key Patterns |
|-----------|---------------|--------------|
| `calculation/` | All financial math: gross-up, caps (non-cumulative, cumulative linear, cumulative compounding), base year, occupancy, tenant share, expense stops, leakage, NOI impact, BOMA 2024 load factors | Orchestrator coordinates steps. All `Decimal`, never float. Every step produces a serialized **calculation trace** stored in snapshot JSONB. |
| `ingestion/` | CSV/Excel parsing from Yardi, MRI, and generic sources. Fingerprinting, dedup, column mapping, validation, chunked bulk insert. | Strategy pattern — `dispatcher.py` reads first 1KB to detect source system, selects parser. SHA256 dedup prevents re-import. |
| `extraction/` | AI document processing: OCR lease PDFs, extract structured "Financial DNA" | Pipeline: document reader async → Claude 3.5 Sonnet structured extraction → confidence scoring → HITL verification gate before commit. |
| `billing/` | Stripe integration: package subscriptions, no-card trial activation, payment methods, entitlement gates, churn prevention (save offers, winback), and 80OFF checkout coupons | Reconcile unit-based annual subscription driven by `plan-tiers.json`; legacy tier rows remain compatibility-only. |
| `email/` | Transactional email via Resend | Jinja2 templates with design tokens auto-generated from `design-tokens.json`. |
| `analysis/` | YoY anomaly detection, multi-year trending, Claude-powered GL narrative analysis | Claude is used for **advisory narrative only**, never financial math. Fuzzy pool matching (0.65 Levenshtein threshold) for YoY comparisons. |
| `tenant/` | Tenant-facing features: dispute state machine, notifications | Rate-limited notifications (10/hour/tenant). See [tenant-portal-architecture.md](./tenant-portal-architecture.md). |
| `pools/` | Expense pool management: auto-setup from GL, cross-property copy, templates | See [pool-allocation-flow.md](./pool-allocation-flow.md). |
| `compliance/` | California SB 1103 compliance export | |
| `warranty/` | E&O warranty certificates, PDF generation | |
| `tax_protest/` | Tax protest data packaging, deadline calculation | |
| `campaigns/` | Reconciliation campaign state transitions | |
| `legal/` | AI-generated demand letters | |
| `reports/` | Historical Excel/PDF reports, denominator change reports | |
| `export/` | GL category CSV, variance PDF | |
| `apollo/` | Apollo CRM integration for outreach/lead enrichment | |

### Models & Schemas

- `backend/app/models/` — Pydantic v2 domain models (one file per entity: `property.py`, `lease.py`, `gl_entry.py`, `reconciliation_snapshot.py`, etc.)
- `backend/app/schemas/` — Request/response DTOs, separate from domain models for API boundary clarity.

---

## Database

**Supabase Postgres** with 95 migrations in `supabase/migrations/`.

### Key Tables

| Group | Tables |
|-------|--------|
| **Core** | `organizations`, `users`, `properties`, `units`, `leases`, `lease_term_versions` |
| **Financial** | `gl_entries` (immutable), `import_batches`, `expense_pools`, `pool_mappings`, `pool_allocations`, `reconciliation_snapshots` (immutable on finalize), `actual_billed`, `reconciliation_campaigns` |
| **Extraction** | `documents`, `ocr_results`, `extraction_results`, `calculation_jobs` |
| **Billing** | `subscriptions`, `invoices`, `stripe_webhook_events` (idempotency), `cancel_attempts` |
| **Tenant** | `tenant_profiles`, `tenant_lease_access`, `tenant_notifications`, `disputes`, `dispute_comments`, `dispute_attachments` |
| **Audit** | `audit_log` (3 triggers via pgAudit), `capex_flags` |
| **Other** | `feedback`, `content_leads`, `warranty_certificates`, `sb1103_requests`, `gl_analysis_results`, `pool_templates`, `promotions` |

### RLS Pattern

Every table has RLS enabled. The central helper function `get_user_organization_id()` resolves the calling user's org from their JWT. All SELECT/INSERT/UPDATE policies use:

```sql
organization_id = get_user_organization_id()
```

DELETE policies additionally check `role IN ('owner', 'admin')`. For service-role operations, `set_organization_context(org_id)` sets a transaction-scoped session variable.

54 RLS negative tests verify cross-org isolation.

### Immutability Rules

- `gl_entries` — immutable after import (delete batch to remove)
- `reconciliation_snapshots` — immutable after finalization (no edits to finalized snapshots)
- `audit_log` — append-only, no UPDATE/DELETE policies

---

## Frontend (App)

React 19 + Vite + TypeScript (strict) at `app.capveri.com`.

### Provider Stack

```
TooltipProvider → AuthProvider → BrowserRouter → AppContent
```

`AppContent` conditionally renders the app shell (Sidebar + Header + BottomNav) for authenticated landlord users. The shell is hidden for:
- PLG onboarding flow (`/onboard`)
- Tenant portal users (`/tenant/*`)

Global elements always present: `ScrollToTop`, `OfflineIndicator`, `Toaster` (sonner), `FeedbackWidget`.

### Key Feature Modules

| Feature | Location | Description |
|---------|----------|-------------|
| Reconciliation | `features/reconciliation/` | TanStack Virtual grid with editable cells, optimistic updates, keyboard navigation, expense pool grouping, calculation trace drawer |
| HITL Verification | `features/verification/` | Split-screen PDF viewer with bounding box overlay, confidence indicators, field-to-PDF linking, approve/reject workflow |
| PLG Onboarding | `features/plg/` | Anonymous Supabase session → wizard → account upgrade. Context-driven state via `OnboardFlowContext` |
| Tenant Portal | `features/tenant-portal/` | Separate layout (`TenantLayout`) with dashboard, disputes, notifications, preferences |
| Analysis | `features/analysis/` | YoY comparison charts, trend analysis (Recharts) |
| Export | `features/export/` | PDF/Excel/ERP export options, batch PDF, export history |
| Pools | `features/pools/` | Pool hierarchy UI, split allocation, template selector, cross-property copy |

### API Client

Auto-generated from the backend's OpenAPI spec using `@hey-api/openapi-ts`:

```
backend/openapi.json → openapi-ts → frontend/src/api/generated/
```

Generates three files:
- `types.gen.ts` — TypeScript interfaces
- `sdk.gen.ts` — Typed fetch functions
- `schemas.gen.ts` — Zod schemas

Frontend calls the generated SDK via TanStack Query hooks. The API client is configured once in `src/api/client.ts` with the Supabase JWT as the Bearer token.

### State Management

- **Server state**: TanStack Query (no global store like Redux)
- **Form state**: React Hook Form + Zod validation
- **UI state**: Local component state, React Context for feature-scoped state (onboarding, verification)
- **Auth state**: `AuthProvider` context wrapping the entire app

### RBAC in UI

`ProtectedRoute` component gates pages by `requiredRoles`. The `useUserRole` hook exposes derived permissions: `canEdit`, `canDelete`, `canManageUsers`, `isReadOnly`.

---

## Marketing Site

Next.js 15 (App Router) + Tailwind + Shadcn/UI at `www.capveri.com`, deployed on Cloudflare.

### Layout

Root layout (`marketing/src/app/layout.tsx`) renders:
- GTM + GA4 scripts (conditional on env vars)
- JSON-LD structured data (Organization + Website schemas)
- `MarketingNav` → `{children}` → `MarketingFooter`
- `FeedbackWidget`
- `ThemeProvider` (light-theme-only, light-only toggle)

### Key Pages

| Route | Purpose |
|-------|---------|
| `/` | Homepage — Hero, Features, How It Works, Social Proof, ROI Calculator, FAQ, Pricing Teaser |
| `/pricing` | Full pricing table (driven by `plan-tiers.json`) |
| `/blog/[slug]` | MDX blog posts (`next-mdx-remote` + `gray-matter`) |
| `/tools` | Free public tools |
| `/glossary` | CAM terminology |
| `/vs` | Competitor comparison pages |
| `/sample-report` | Sample reconciliation report |
| `/docs`, `/help`, `/resources` | Documentation, help center, lead magnets |
| `/privacy`, `/terms`, `/cookies` | Legal |

SEO automation via `robots.ts` and `sitemap.ts` (auto-generated).

---

## Cross-Cutting Concerns

### Auth Flow (end-to-end)

```
Browser → Supabase Auth (login/register) → JWT issued
       → Frontend stores JWT in Supabase client
       → API requests include Bearer JWT
       → FastAPI dependency validates JWT via Supabase
       → Sets postgrest.auth(token) → Postgres RLS sees auth.uid()
       → OrgContext resolves organization_id from users table
       → RLS policy enforces organization_id = get_user_organization_id()
```

Three enforcement layers for every operation: **Postgres RLS**, **FastAPI dependency injection**, **React conditional rendering**.

### AI Boundaries

| Use Case | Tool | Constraint |
|----------|------|-----------|
| Lease PDF OCR | document reader | Async job submission, table/cell extraction |
| Lease data extraction | Claude 3.5 Sonnet | Structured JSON output, confidence scoring, **requires HITL verification before commit** |
| GL narrative analysis | Claude 3.5 Sonnet | Advisory markdown only, **never used for financial math** |
| Demand letters | Claude 3.5 Sonnet | AI-generated legal text with human review |

**Zero Data Retention (ZDR)** is configured with Anthropic — API data is not stored or used for training.

### Design Token Pipeline

```
design-tokens.json (root, source of truth)
        │
        ▼  node ../style-dictionary.config.js
        │
    ┌───┴───────────────────┬──────────────────────┐
    ▼                       ▼                      ▼
frontend/src/         backend/app/services/   marketing/src/
generated/tokens.css  email/tokens.py         generated/tokens.css
(CSS custom props)    (Python constants)      (CSS custom props)
```

Run: `cd frontend && npm run tokens` (or `cd marketing && npm run tokens`).

Marketing site's `tailwind.config.ts` must be updated manually if token values change.

### Pricing Configuration

`plan-tiers.json` (root) defines the current self-serve subscription:

| Plan | Annual list price | 80OFF annual price | Features |
|------|-------------------|-----------------------|----------|
| Reconcile | Starts at $4,990/year for up to 25 rentable units; 26-150 units add $179 each, 151-500 add $169 each, 501-2500 add $159 each, and 2501+ add $149 each | Starts at $998/year | GL import, CAM reconciliation, leakage summary, expense pools, lease/rent roll setup, reports, CSV export, portfolio controls, tenant portal workflows, AI-assisted review, and custom support terms |

Self-serve pricing is annual only and customers choose their rentable unit count during signup. New customers get a 30-day free trial and the first annual payment is covered by a 30-day money-back guarantee.

Both the marketing pricing page and backend billing service read this file. Run `npm run plans:generate` in either `frontend/` or `marketing/` after changes.

### Observability

- **Error tracking**: Sentry (backend + frontend)
- **Structured logging**: JSON format in production, text in dev. Log scrubbing for PII. Correlation IDs on every request.
- **Analytics**: GA4 and PostHog on marketing, `usePageTracking` hook on frontend
- **Audit trail**: pgAudit triggers on key tables, queryable via `/api/v1/audit-trail`

### Security

- OWASP security headers on every response
- Rate limiting (100/min authenticated, 20/min anonymous)
- RLS on every table + 54 negative tests
- 47 dedicated security tests in `backend/tests/security/`
- SHA256 file dedup prevents re-processing
- Stripe webhook idempotency via `stripe_webhook_events` table
- Data retention policy with scheduled purge

---

## Related Architecture Docs

| Document | Covers |
|----------|--------|
| [rbac-permissions.md](./rbac-permissions.md) | Full 5-role permission matrix, enforcement layers, code examples |
| [third-party-dependency-map.md](./third-party-dependency-map.md) | Cross-repo and external dependency ownership for Sequencer, Postiz, Ventora Ads, CRM, Email Marketing, and Ventora Platform |
| [reconciliation-architecture.md](./reconciliation-architecture.md) | Five-phase reconciliation pipeline (technical) |
| [reconciliation-ux-flow.md](./reconciliation-ux-flow.md) | Reconciliation from the user's perspective |
| [billing-per-building-architecture.md](./billing-per-building-architecture.md) | Legacy per-building Stripe billing notes; current flow is package checkout in `../guides/01-infrastructure/BILLING_FLOW_SUMMARY.md` |
| [tenant-portal-architecture.md](./tenant-portal-architecture.md) | Tenant isolation, auth flow, dispute workflow |
| [anomaly-detection.md](./anomaly-detection.md) | Variance detection, MAD-based Z-score, ARIMA trending |
| [pool-allocation-flow.md](./pool-allocation-flow.md) | Pool hierarchy, split allocations, templates, cross-property copy |
| [hitl-state-management.md](./hitl-state-management.md) | HITL verification UI state machine (React Context + Reducer) |
| [mobile-responsiveness-audit.md](./mobile-responsiveness-audit.md) | Breakpoints, responsive infrastructure |

---

## Project Structure

```
capveri/
├── backend/
│   ├── app/
│   │   ├── api/v1/           # 40+ REST endpoint routers
│   │   ├── auth/             # Auth dependencies (CurrentUser, OrgContext, etc.)
│   │   ├── core/             # Logging, rate limiting, Sentry, circuit breakers
│   │   ├── database/         # Supabase client manager (anon + service role)
│   │   ├── middleware/       # Correlation ID, rate limiting
│   │   ├── models/           # Pydantic v2 domain models
│   │   ├── schemas/          # Request/response DTOs
│   │   └── services/         # Business logic (see Service Domains above)
│   └── tests/                # pytest, 95%+ coverage, security suite, benchmarks
├── frontend/
│   ├── src/
│   │   ├── api/generated/    # Auto-generated from OpenAPI (types, SDK, Zod)
│   │   ├── components/       # Shadcn/UI + domain components
│   │   ├── features/         # Self-contained feature modules
│   │   ├── hooks/            # Custom React hooks
│   │   ├── pages/            # Route components
│   │   └── types/            # Shared TypeScript types
│   └── e2e/                  # Playwright tests
├── marketing/
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   ├── components/       # Marketing components + Shadcn/UI
│   │   └── lib/              # Utilities, structured data
│   └── e2e/                  # Playwright tests
├── supabase/migrations/      # 95 SQL migrations
├── docs/                     # Architecture, guides, stories
├── design-tokens.json        # Brand token source of truth
├── plan-tiers.json           # Pricing plan definitions
└── style-dictionary.config.js # Token generation pipeline
```
