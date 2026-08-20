# Epic 21: Billing & Subscriptions

## Purpose
Full Stripe integration for subscription billing, payment management, and invoice tracking. This epic enables CapVeri's monetization through SaaS subscription tiers.

## Business Value
Billing infrastructure allows the platform to generate revenue through tiered subscriptions. Features include self-service upgrades/downgrades, automatic payment processing, and transparent invoice history for customers.

## Dependencies
- Epic 4 (Backend API Foundation) - Auth and API structure
- Epic 3.15-3.16 (Billing Database Tables) - Subscriptions and Invoices tables
- Epic 1 (Design System) - UI components for pricing and checkout

## Stories in This Epic

| ID | Story | Hours | Status |
|---|---|---|---|
| 21.1 | Configure Stripe Client | 2 | pending |
| 21.2 | Create Subscription Plans | 2 | pending |
| 21.3 | Create Customer Management | 3 | pending |
| 21.4 | Create Subscription Lifecycle Endpoints | 4 | pending |
| 21.5 | Create Payment Method Management | 3 | pending |
| 21.6 | Create Stripe Webhook Handlers | 4 | pending |
| 21.7 | Create Billing History Endpoints | 2 | pending |
| 21.8 | Create Pricing Page | 3 | pending |
| 21.9 | Create Checkout Flow | 4 | pending |
| 21.10 | Create Billing Dashboard | 3 | pending |
| 21.11 | Create Invoice Display | 2 | pending |
| 21.12 | Integration Test - Billing E2E | 3 | pending |

**Total Hours**: 35

## Key Technical Details

### Stripe Integration
- Use `stripe` Python SDK with async support
- Webhook signature verification for security
- Idempotency keys for payment operations
- Test mode for development, live mode for production

### Subscription Lifecycle
```
trial → active → past_due → canceled
                     ↓
                  paused
```

### Plan Tiers
| Plan | Monthly | Features |
|------|---------|----------|
| Free | $0 | 1 property, basic reconciliation |
| Starter | $49 | 5 properties, full reconciliation |
| Professional | $49 | Unlimited properties, all features |
| Enterprise | Custom | White-label, dedicated support |

### Stripe Customer Portal
- Self-service subscription management
- Payment method updates
- Invoice history access
- Configured via Stripe Dashboard
