# CapVeri Go-Live Guide

Complete documentation for deploying and operating CapVeri in production.

## Quick Start

**First time deploying?** Follow this path:

1. [Infrastructure Setup](#infrastructure) → Set up external services
2. [Deployment](#deployment) → Deploy to Supabase + Cloudflare
3. [Security](#security) → Verify security configuration
4. [Go-Live](#go-live) → Launch checklist and runbook

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CapVeri Stack                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐   │
│   │ Cloudflare  │    │ Cloudflare  │    │      Supabase       │   │
│   │  Frontend   │───▶│ Backend API │───▶│  Database + Auth    │   │
│   │  React/Vite │    │ Worker API  │    │    PostgreSQL       │   │
│   └─────────────┘    └──────┬──────┘    └─────────────────────┘   │
│                             │                                       │
│         ┌───────────────────┼───────────────────┐                  │
│         │                   │                   │                  │
│         ▼                   ▼                   ▼                  │
│   ┌───────────┐      ┌───────────┐      ┌───────────┐             │
│   │    AWS    │      │ Anthropic │      │  Stripe   │             │
│   │ S3+document reader│      │  Claude   │      │  Billing  │             │
│   └───────────┘      └───────────┘      └───────────┘             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

| Component | Purpose | Provider |
|-----------|---------|----------|
| Frontend | React SPA | Cloudflare Worker `capveri-app` |
| Backend API | Hono/TypeScript API | Cloudflare Worker `capveri-api` |
| Database | PostgreSQL + Auth | Supabase |
| OCR | Document text extraction | document reader |
| Storage | Document storage | AWS S3 |
| AI | Lease data extraction | Anthropic Claude |
| Billing | Subscriptions | Stripe |
| Email | Transactional email | Resend |

---

## Documentation Index

### Infrastructure

Set up external services before deployment.

| Guide | Description | Time |
|-------|-------------|------|
| [AWS Setup](./01-infrastructure/01-aws-setup.md) | S3 bucket + document reader IAM | 30 min |
| [Anthropic Setup](./01-infrastructure/02-anthropic-setup.md) | Claude API key + config | 15 min |
| [Stripe Setup](./01-infrastructure/03-stripe-setup.md) | Products, prices, webhooks | 45 min |
| [Stripe Dashboard Quickstart](./01-infrastructure/STRIPE_DASHBOARD_QUICKSTART.md) | ⚡ Step-by-step Stripe setup | 15 min |
| [Stripe Local Testing](./01-infrastructure/STRIPE_LOCAL_TEST_QUICKSTART.md) | ⚡ Test billing locally | 10 min |
| [Billing Flow Summary](./01-infrastructure/BILLING_FLOW_SUMMARY.md) | Package checkout, no-card trial, and 80OFF flow | 5 min |
| [Resend Setup](./01-infrastructure/04-resend-setup.md) | Domain verification, API key | 30 min |

### Deployment

Deploy the application to production.

| Guide | Description | Time |
|-------|-------------|------|
| [Deployment Overview](./02-deployment/01-deployment-overview.md) | Architecture and flow | 10 min |
| [Supabase Setup](./02-deployment/02-supabase-production-setup.md) | Database, auth, storage | 45 min |
| Backend API (`cloudflare-backend/`) | Cloudflare Worker deployment | 15 min |
| Frontend (`frontend/`) | Cloudflare Worker deployment | 20 min |
| [Environment Variables](./02-deployment/05-environment-variables-reference.md) | Complete env var reference | Reference |
| [Domains & SSL](./02-deployment/06-domain-and-ssl-configuration.md) | Custom domains, certificates | 30 min |

### Security

Verify security before launch.

| Guide | Description | Time |
|-------|-------------|------|
| [Security Checklist](./security/01-security-checklist.md) | Pre-launch verification | 30 min |
| [RLS Verification](./security/02-supabase-rls-verification.md) | Test row-level security | 45 min |
| [Secrets Management](./security/03-secrets-management.md) | Key rotation, storage | 20 min |
| [Headers & CORS](./security/04-security-headers-and-cors.md) | HTTP security headers | 15 min |

### Monitoring

Set up observability and alerting.

| Guide | Description | Time |
|-------|-------------|------|
| [Logging](./monitoring/01-logging-and-observability.md) | Structured logging, correlation IDs | 20 min |
| [Error Tracking](./monitoring/02-error-tracking-setup.md) | Sentry, error handling | 30 min |
| [Uptime Monitoring](./monitoring/03-uptime-monitoring.md) | Health checks, alerts | 20 min |
| [Database Monitoring](./monitoring/04-database-monitoring.md) | Supabase metrics | 15 min |

### Operations

Day-to-day operations and incident response.

| Guide | Description | Time |
|-------|-------------|------|
| [Common Issues Runbook](./operations/01-runbook-common-issues.md) | Troubleshooting guide | Reference |
| [Backup & Recovery](./operations/02-database-backup-and-recovery.md) | Backup procedures | 30 min |
| [Incident Response](./operations/03-incident-response-playbook.md) | Incident handling | Reference |
| [Scaling Guide](./operations/04-scaling-guide.md) | Growth planning | Reference |

### Go-Live

Launch preparation and execution.

| Guide | Description | Time |
|-------|-------------|------|
| [Pre-Launch Checklist](./go-live/00-pre-launch-checklist.md) | Final verification | 2 hours |
| [Launch Day Runbook](./go-live/01-launch-day-runbook.md) | Step-by-step launch | Launch day |

---

## Deployment Checklist (Quick Reference)

### Phase 1: Infrastructure (Day 1)
- [ ] Create AWS account, S3 bucket, IAM user
- [ ] Create Anthropic account, get API key
- [ ] Create Stripe account, products, webhooks
- [ ] Create Resend account, verify domain

### Phase 2: Platform (Day 2)
- [ ] Create Supabase project, run migrations
- [ ] Deploy backend API to Cloudflare Worker `capveri-api`
- [ ] Deploy frontend to Cloudflare Worker `capveri-app`
- [ ] Configure custom domains

### Phase 3: Security (Day 3)
- [ ] Verify RLS policies
- [ ] Rotate all API keys from dev
- [ ] Test authentication flows
- [ ] Verify security headers

### Phase 4: Launch (Day 4)
- [ ] Complete pre-launch checklist
- [ ] Set up monitoring
- [ ] Execute launch runbook
- [ ] Monitor for 4 hours post-launch

---

## Cost Estimate

### Small Scale (< 100 organizations)

| Service | Monthly Cost |
|---------|-------------|
| Supabase (Free) | $0 |
| Cloudflare Workers/R2/Queues | $5-50 |
| AWS (S3 + document reader) | $50-150 |
| Anthropic | $20-50 |
| Stripe | 2.9% + $0.30/txn |
| Resend (Free) | $0 |
| **Total** | **~$100-250/month** |

---

## Support Resources

### Documentation
- [CLAUDE.md](../../CLAUDE.md) - Development standards
- [Architecture](../Architecture%20for%20CapVeri.md) - System design
- [OAuth Setup](../configuration/oauth-setup.md) - Google auth

### External
- [Supabase Docs](https://supabase.com/docs)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Stripe Docs](https://stripe.com/docs)

### Emergency Contacts
| Service | Contact |
|---------|---------|
| Supabase | support@supabase.io |
| Cloudflare | Dashboard support |
| AWS | Console support |
| Stripe | Dashboard support |

---

## Contributing

To update these guides:

1. Edit the relevant markdown file
2. Test any commands/procedures
3. Update this README if adding new guides
4. Commit with descriptive message

---

*Last updated: June 2026*
