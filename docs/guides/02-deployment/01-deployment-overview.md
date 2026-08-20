# Deployment Overview

This guide provides a high-level overview of CapVeri's production architecture and deployment strategy.

## Architecture Diagram

```
                                    ┌─────────────────┐
                                    │   DNS (Your     │
                                    │   Provider)     │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
           ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
           │ app.capveri  │        │ api.capveri  │        │ Supabase      │
           │     .io       │        │     .io       │        │ (*.supabase   │
           │               │        │               │        │     .co)      │
           └───────┬───────┘        └───────┬───────┘        └───────┬───────┘
                   │                        │                        │
                   ▼                        ▼                        ▼
           ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
           │   Vercel      │        │   Railway     │        │   Supabase    │
           │  (Frontend)   │        │  (Backend)    │        │   (Hosted)    │
           │               │        │               │        │               │
           │  React + Vite │        │  FastAPI      │        │  PostgreSQL   │
           │  Static CDN   │        │  Python 3.11  │        │  Auth         │
           └───────────────┘        └───────┬───────┘        │  Storage      │
                                            │                └───────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
           ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
           │     AWS       │        │   Anthropic   │        │    Stripe     │
           │  S3 + document reader│        │   Claude API  │        │   Billing     │
           │               │        │               │        │               │
           │  OCR Pipeline │        │  AI Extraction│        │  Payments     │
           └───────────────┘        └───────────────┘        └───────────────┘
```

## Component Overview

### Frontend (Cloudflare Worker)

| Item | Value |
|------|-------|
| **URL** | `https://app.capveri.com` |
| **Framework** | React 18 + Vite |
| **Build** | Static site (SPA) |
| **CDN** | Cloudflare Workers Static Assets |
| **SSL** | Automatic (Let's Encrypt) |

**Responsibilities:**
- User interface
- Client-side routing
- API calls to backend
- Supabase Auth integration

### Backend API (Cloudflare Worker)

| Item | Value |
|------|-------|
| **URL** | `https://api.capveri.com` |
| **Framework** | Hono / TypeScript (`cloudflare-backend/`) |
| **Server** | Cloudflare Workers |
| **Scaling** | Cloudflare Workers / Queues / Workflows |
| **SSL** | Automatic |

**Responsibilities:**
- REST API endpoints
- Business logic (calculations)
- External service orchestration
- Webhook handling

### Database (Supabase)

| Item | Value |
|------|-------|
| **URL** | `https://<project>.supabase.co` |
| **Database** | PostgreSQL 15 |
| **Auth** | Supabase Auth (JWT) |
| **Storage** | Supabase Storage (S3-backed) |
| **Security** | Row Level Security (RLS) |

**Responsibilities:**
- Data persistence
- User authentication (OAuth)
- Multi-tenant isolation
- File storage (backup)

### External Services

| Service | Purpose | Provider |
|---------|---------|----------|
| **OCR** | Document text extraction | document reader |
| **Storage** | Document storage | AWS S3 |
| **AI** | Lease data extraction | Anthropic Claude |
| **Billing** | Subscriptions, payments | Stripe |
| **Email** | Transactional email | Resend |

## Deployment Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT FLOW                            │
└──────────────────────────────────────────────────────────────────┘

1. CODE PUSH
   Developer pushes to GitHub main branch
   └─> GitHub triggers CI/CD

2. CI CHECKS (GitHub Actions)
   ├─> Run backend tests (pytest)
   ├─> Run frontend tests (vitest)
   ├─> Type checking (mypy, TypeScript)
   └─> Lint checks (ruff, ESLint)

3. DEPLOYMENT (Manual Wrangler deploy after checks)
   ├─> Cloudflare: Deploys app frontend Worker
   ├─> Cloudflare: Deploys marketing Worker
   └─> Cloudflare: Deploys backend API Worker

4. DATABASE MIGRATIONS (Manual)
   └─> Run via Supabase CLI: supabase db push

5. HEALTH CHECKS
   ├─> Cloudflare Worker deployment status: 100% current version
   ├─> API: GET /health
   └─> Supabase: Dashboard monitoring
```

## Environment Structure

| Environment | Frontend | Backend | Database |
|-------------|----------|---------|----------|
| **Local** | localhost:5173 | localhost:8000 | localhost:54322 |
| **Staging** | staging.capveri.com | api-staging.capveri.com | Separate Supabase project |
| **Production** | app.capveri.com | api.capveri.com | Production Supabase project |

## Prerequisites

Before deploying, ensure you have:

### Accounts Required

- [ ] **GitHub** - Source code hosting
- [ ] **Cloudflare** - Frontend, marketing, backend API, queues, workflows, and R2
- [ ] **Supabase** - Database (free tier available)
- [ ] **AWS** - S3 + document reader
- [ ] **Anthropic** - Claude API
- [ ] **Stripe** - Billing
- [ ] **Resend** - Email

### Local Tools Required

- [ ] Node.js 18+ and npm
- [ ] Python 3.11+
- [ ] Supabase CLI
- [ ] Git

## Deployment Order

Follow this order for initial deployment:

1. **Infrastructure Setup** (External Services)
   - [AWS Setup](../01-infrastructure/01-aws-setup.md) - S3 bucket + document reader
   - [Anthropic Setup](../01-infrastructure/02-anthropic-setup.md) - API key
   - [Stripe Setup](../01-infrastructure/03-stripe-setup.md) - Products + webhooks
   - [Resend Setup](../01-infrastructure/04-resend-setup.md) - Domain verification

2. **Platform Deployment**
   - [Supabase Setup](./02-supabase-production-setup.md) - Database + Auth
   - Backend API: `cd cloudflare-backend && npx wrangler deploy --env production`
   - Frontend Deployment: `cd frontend && npm run deploy:cf`
   - Marketing Deployment: `cd marketing && npm run deploy:cf`

3. **Configuration**
   - [Environment Variables](./05-environment-variables-reference.md) - All config
   - [Domain & SSL](./06-domain-and-ssl-configuration.md) - Custom domains

4. **Security & Monitoring**
   - [Security Checklist](../security/01-security-checklist.md)
   - [Monitoring Setup](../monitoring/01-logging-and-observability.md)

5. **Go-Live**
   - [Pre-Launch Checklist](../go-live/00-pre-launch-checklist.md)
   - [Launch Day Runbook](../go-live/01-launch-day-runbook.md)

## Cost Estimate (Small Deployment)

Monthly costs for <100 organizations:

| Service | Tier | Est. Cost |
|---------|------|-----------|
| **Cloudflare Workers/R2/Queues** | Usage-based | $5-50 |
| **Supabase** | Free/Pro | $0-25 |
| **AWS (S3)** | Usage-based | $5-25 |
| **AWS (document reader)** | Usage-based | $50-150 |
| **Anthropic** | Usage-based | $20-50 |
| **Stripe** | 2.9% + $0.30 | Variable |
| **Resend** | Free | $0 |
| **Domain** | Annual | ~$1/month |
| **Total** | | **~$100-300/month** |

Costs scale with usage. Enterprise deployments may be higher.

## Security Overview

### Data Protection

- **Encryption at rest**: Supabase (PostgreSQL), S3
- **Encryption in transit**: HTTPS everywhere
- **Multi-tenancy**: Row Level Security (RLS)

### Authentication

- **Provider**: Supabase Auth
- **Methods**: Email/password, Google OAuth
- **Tokens**: JWT with automatic refresh

### Access Control

- **RLS**: All database queries filtered by organization_id
- **RBAC**: Owner, Admin, Member, Viewer roles
- **API**: Bearer token authentication

## High Availability

### Current Architecture (Small Scale)

- **Frontend**: Cloudflare Worker `capveri-app`
- **Backend API**: Cloudflare Worker `capveri-api`
- **Database**: Supabase managed (single region)

### Future Scaling

When needed:
- Cloudflare Workers, Queues, and Workflows scaling
- Supabase Pro with connection pooling
- Multi-region deployment
- Redis caching layer

## Next Steps

Start with:
1. [Supabase Production Setup](./02-supabase-production-setup.md)
2. [Environment Variables Reference](./05-environment-variables-reference.md)
