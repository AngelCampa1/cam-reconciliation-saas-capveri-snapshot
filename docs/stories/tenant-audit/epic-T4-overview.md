# Epic T4: marketing-tenant/ Scaffold

## Epic Info
- **Product**: Tenant CAM Audit
- **Estimated Hours**: 18
- **Status**: `pending`

## Overview

Stand up `marketing-tenant/`, the public-facing marketing site for the tenant CAM audit product. This site is a purpose-built fork of `marketing/` (the landlord marketing site) that shares design tokens, UI primitives, and content infrastructure but replaces all landlord-specific messaging, pricing, and page structure with tenant-oriented equivalents.

The tenant site lives at a separate subdomain (e.g., `tenant.capveri.com`) and targets commercial tenants who suspect their landlord is overcharging on CAM reconciliation statements. The primary conversion path is: Landing Page -> Upload Wizard -> Payment -> Report Delivery.

## Architectural Decisions

### Fork Strategy

**Keep from marketing/** (shared infrastructure):
- `components/ui/` -- Shadcn/UI primitives
- `components/content/` -- Content rendering components
- `components/mdx/` -- MDX rendering pipeline
- `lib/structured-data.ts` -- JSON-LD schema helpers
- `lib/content/mdx.ts` -- MDX processing utilities
- `lib/citations/` -- Citation/source infrastructure
- `generated/tokens.css` -- Design tokens
- Tailwind config, PostCSS config, tsconfig
- Vitest config and test utilities

**Strip from marketing/** (landlord-specific):
- `components/landing/` -- Landlord hero, ROI calculator, persona toggle
- `app/checkout/` -- Landlord subscription checkout
- `app/vs/` -- Competitor comparison pages
- `app/tools/` -- Landlord tools (NOI calculator, leakage estimator)
- `config/plans.ts` -- Per-building subscription pricing
- `data/faq-data.tsx` -- Landlord FAQ content
- `data/pricing-faqs.ts` -- Landlord pricing FAQ content

**Create new** (tenant-specific):
- `app/page.tsx` -- Tenant landing page
- `app/audit/[token]/page.tsx` -- Wizard + status + report (future epic)
- `app/pricing/page.tsx` -- Tenant pricing page (future epic)
- `app/how-it-works/page.tsx` -- Detailed how-it-works page (future epic)
- `app/sample-report/page.tsx` -- Sample report preview (future epic)
- `app/blog/` -- MDX blog with tenant-focused content (future epic)
- `components/wizard/` -- Wizard shell + step components (future epic)
- `components/report/` -- Report viewer components (future epic)
- `components/landing/` -- Tenant landing sections
- `config/tiers.ts` -- Tenant per-audit tier definitions
- `MarketingNav.tsx` -- Tenant navigation
- `MarketingFooter.tsx` -- Tenant footer

### Pricing Model

Tenant pricing is per-audit (one-time payment), not per-building subscription:

| Tier | Price | Includes |
|------|-------|----------|
| Standard | $49 | Pro-rata, gross-up, cap enforcement, base year |
| Detailed | $99 | Standard + admin fee, exclusions, occupancy, capital vs. operating |
| Expert | $199 | Detailed + CPA-signed letter, lease clause citations, dispute language |

### Brand Voice

- Direct, CRE-fluent, no adjective stacking
- Primary CTA: "Audit My CAM Charges"
- Stat hook: "40% of CAM reconciliations have material errors"
- Tone: Empowering (you deserve accuracy), not adversarial (your landlord is cheating)

### Schema Markup

Landing page carries four JSON-LD schemas:
- `WebApplication` -- Product metadata
- `Service` -- CAM audit service description
- `FAQPage` -- Landing page FAQ
- `Organization` -- Company info (shared with landlord site)

## Stories

| Story | Title | Hours | Dependencies |
|-------|-------|-------|--------------|
| T4.1 | Scaffold marketing-tenant/ project | 6 | None |
| T4.2 | Tenant landing page | 8 | T4.1 |
| T4.3 | Tenant nav and footer layout | 4 | T4.1 |

## Success Criteria

- `marketing-tenant/` builds and passes `npm run typecheck` with zero errors
- Landing page renders all sections (Hero, How It Works, What We Check, Pricing, FAQ, Footer)
- JSON-LD structured data validates against schema.org
- Lighthouse performance score >= 90 on landing page
- All shared components (`ui/`, `content/`, `mdx/`) work without modification
- No landlord-specific copy, pricing, or CTAs leak into the tenant site

## Out of Scope

- Wizard implementation (Epic T5)
- Payment integration (Epic T6)
- Report viewer (Epic T7)
- Blog content authoring (separate content task)
- Deployment pipeline / Vercel project setup (infrastructure task)
