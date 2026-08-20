# Marketing Site and Tools
> Last updated: 2026-06-25 - Marketing funnel coherence pass aligned public CTAs on homepage/product/resources/switch/vs pages to the 30-day free trial, removed retired free-audit/free-run wording, added `/switch` and `/vs` CTA E2E assertions, and introduced `scripts/funnel-coherence-gate.mjs` with `npm run funnel:check` package entries.
> Last updated: 2026-06-29 - Public calendar booking links are retired. Public CTAs route to self-serve trial, pricing, contact, resources, or email; AI SDR/AI CS product contexts keep `meetingLinks` as an empty compatibility field and must not expose external booking hosts.
> Last updated: 2026-06-24 - P0-A post-result worksheet capture. The CAM Billing Error Estimator now waits until `lead_form_result_seen` has fired before rendering its email form, then offers to send the estimator worksheet from the result card with source `cam_billing_error_estimator_result`. Lead-capture `lead_form_view` events now include the same safe source/location metadata as later form events.
> Last updated: 2026-06-24 - P0-A result-first free-check slice. The CAM Billing Error Estimator now frames the modeled result as over-bill/under-bill billing mistakes before statements are sent, emits `lead_form_result_seen` alongside the legacy `tool_result_viewed` event after enough inputs produce a modeled estimate, and suppresses the global exit-intent email popup on the estimator route so the first value moment is not interrupted by an email gate.
> Last updated: 2026-06-20 - Re-embedded the CapVeri AI-SDR sales widget on high-intent marketing pages (`/pricing`, `/sample-report`, `/contact`, `/roi`, `/product-tour`, `/tools` and nested routes) via `AiSdrSalesWidget`. The widget loads the worker-hosted global script pinned to client `v0.3.7` with a Subresource Integrity hash and `crossOrigin="anonymous"`, so the browser refuses any build whose bytes differ from the pinned client. CSP `script-src`/`connect-src` allow the worker origin only because of that SRI pin; the old mutable `widgets.ventoralabs.com` feedback host stays banned. Browser calls to the worker's `/v1/*` endpoints are authenticated by a same-origin BFF at `/api/ai-sdr/sign` (holds `AI_SDR_CLIENT_ASSERTION_SECRET`, shared with the worker) that mints an HMAC client assertion; the marketing `stableJson` canonicalization is byte-identical to the worker's `@ventora/ai-assistant-contracts` (default UTF-16 key sort, drop undefined) so signatures verify across services. Distinct from the worker→marketing product-context handoff (`AI_SDR_CONTEXT_SECRET`).
> Previous: 2026-06-15 - Superseded. Public booking links were briefly added to marketing, app, and AI contexts, then retired on 2026-06-29. Do not restore external calendar CTAs without a new product decision.
> Last updated: 2026-06-12 - BOMA calculator revenue-lift money precision (F-443): the app-side BOMA 2024 calculator's headline "Annual Revenue Lift" rendered via `formatCurrency(parseFloat(result.revenue_lift))` — the F-430 float round-trip on the backend's exact decimal string. `revenue_lift` now parses directly through the canonical `formatMoney` with whole-dollar options (matching the tool's existing `maximumFractionDigits: 0` presentation), so the figure keeps every digit; a regression asserts a magnitude beyond `Number.MAX_SAFE_INTEGER` renders exactly. The local `formatCurrency` stays for the cap-rate-derived asset value lift (a computed number, not an exact decimal string).
> Last updated: 2026-06-08 - Free calculator input UX hardening (F-374/F-375/F-376): the BOMA load-factor calculator debounces its calculate request (350ms) so it no longer fires a backend call on every keystroke, and shows an inline alert when rentable area is smaller than usable area instead of silently clearing the result; the CAM Leakage Estimator keeps the typed CAM-per-SF value visible and shows an inline alert for 0/negative entries instead of silently snapping the field back, while the estimate retains the last valid number.
> Last updated: 2026-06-01 - Marketing form analytics now track privacy-safe started/attempted/failed/Turnstile-missing events across contact, gated-download, and calculator-unlock forms; marketing PostHog context is sanitized after UTM/first-touch merge, malformed email domains are dropped, and page taxonomy now segments comparison, alternative, switch-guide, solution, integration, best-page, and product-feature routes.
> Last updated: 2026-06-01 - Marketing analytics now sanitize PostHog properties recursively before capture; CAM Leakage Estimator result tracking waits for meaningful portfolio input and emits the shared `tool_result_viewed` event with bucketed SF/result values; lead capture, calculator unlock, and PLG signup lead endpoints also emit backend-confirmed PostHog events after successful persistence without raw email/name/company values.
> Last updated: 2026-05-29 - Tools hub now links all interactive calculators including the CAM Audit Risk Score quiz and CAM Leakage Estimator (previously routed but unlinked); the BOMA calculator sends the current cap rate without re-fetching on cap-rate change; the CAM Leakage Estimator benchmark footnote matches its modeled 0.25%-1.5% rates; the download thank-you page redirects direct visitors who did not complete the lead form; and the MRI/AppFolio comparison bylines render "By CapVeri" with a proper middot separator (fixed run-together text and a garbled character).
> Last updated: 2026-05-28 - Public feedback now uses honeypot, Turnstile, and endpoint rate limiting; lead capture and free-audit request emails are canonicalized before rate-limit checks and persistence.
> Last updated: 2026-05-22 - Removed the browser-side Ventora AI SDR worker script from the marketing shell and CSP so mutable third-party JavaScript is no longer trusted on public pages.
> Last updated: 2026-05-20 - Lead-capture and calculator-unlock gates now fire conversion events and unlock only after a real success; a 429 (already requested) shows a check-your-inbox message instead of a phantom conversion. The contact form's "Number of Buildings" field is shown only for audit requests, matching the other audit-only fields.
> Last updated: 2026-05-20 - Public contact, audit request, gated-download, and calculator-unlock forms now send Cloudflare Turnstile tokens plus hidden honeypot fields; backend verification fails closed in production.
> Last updated: 2026-05-13 - Marketing API callers now share a canonical API base URL helper with `https://api.capveri.com` fallback, calculator unlock state is slug-scoped, and public knowledge/source content is guarded against mojibake.
> Last updated: 2026-05-01 - Comparison and alternatives pages now include explicit CapVeri-wins verdict messaging for landlord-side CAM verification, current Reconcile/Control/Defend pricing, and above-the-fold winner summaries on `/vs` pages.

> Last updated: 2026-04-23 - Marketing `/help` is now a task hub with beginner cards for start here, uploads, CAM basics, problem solving, and tenant questions; main nav includes Help

> Previous: 2026-04-10 - CSP fixes: added Cloudflare beacon (static.cloudflareinsights.com) to script-src and www.googletagmanager.com to connect-src; removed duplicate "| CapVeri" suffix from 9 page title metadata entries (layout template adds it automatically)

> Previous: 2026-03-18 - Contact form now POSTs all inquiry types to backend (/api/v1/contact-requests for non-audit, /api/v1/audit-requests for audit); bug fixes: CORS validator, invalid ARIA role on pricing page, FeedbackWidget type error display, Select label association

> Previous: 2026-03-02 - CapEx detection row added to vs/yardi and vs/excel comparison tables; plan-tiers label updated to "AI GL analysis + CapEx screening"; new resource page capex-detection-cam.mdx

> Previous: 2026-02-27 - CRO copy fixes: pricing headline → "Stop Leaving CAM Recovery on the Table"; Essentials CTA → "Run My Free Audit"; controller subheadline typo "CapVeri" → "CapVeri"

## Overview

Next.js 15 App Router marketing site deployed to Vercel at www.capveri.com. Features a catalog of free calculators and templates for lead generation, an SEO-optimized resource center with structured data, competitor comparison pages, and exit-intent lead capture. The site targets commercial real estate controllers and CFOs with persona-aware messaging.

## Features

### Homepage

- Route: `/` (via `marketing/src/app/page.tsx`)
- Hero section with primary CTA ("Start Free Trial").
- `SocialProofStrip` — trust badges and client logos.
- `ValuePropositionSection` — problem/solution framing.
- `ROICalculator` — interactive calculator showing potential recovery.
- `HowItWorksSection` — 4-step process explanation.
- `FeaturesGrid` — feature cards with icons.
- `PricingTeaser` — pricing summary with link to full pricing page.
- `FAQSection` — expandable FAQ accordion.
- `CTASection` — bottom-of-page conversion CTA.
- `PersonaToggle` — switches messaging between Controller and CFO audiences.
- Security trust messaging appears in Hero micro-copy, How It Works step 2 guardrail language, CTA trust indicators, and FAQ safety answer.
- All components in `marketing/src/components/landing/`.

### Pricing Page

- Route: `/pricing` (via `marketing/src/app/pricing/`).
- Pricing UI derives from canonical plan metadata generated from root `plan-tiers.json` (`marketing/src/generated/plan-tiers.ts` and `marketing/src/config/plans.ts`).
- Annual-only pricing with 80OFF limited offer prices.
- Building count slider (1-200).
- Three self-serve plan cards: Reconcile ($998/year with 80OFF), Control ($998/year with 80OFF), and Defend ($998/year with 80OFF), plus Enterprise for larger portfolios.
- Feature comparison table sourced from canonical feature keys/labels to keep pricing claims consistent with frontend/backend.
- Enterprise CTA for portfolios above self-serve limits.
- FAQ section specific to pricing.
- Shared pricing logic in `marketing/src/components/PricingContent.tsx` and `marketing/src/config/plans.ts` (generated-plan backed).

### Free Tools and Calculators

- Route pattern: `/tools/[slug]` (via `marketing/src/app/tools/`).
- Each tool has a dedicated page component and thank-you/download page.

1. **HCAD Tax Base Year Normalizer** (`hcad-tax-normalizer/`) - Texas ARB protest amount -> tax recovery per tenant. Frontend: `HcadTaxNormalizer.tsx`.
2. **BOMA 2024 Rentable Area Calculator** (`boma-2024-calculator/`) - Existing SF + outdoor space -> new SF per BOMA 2024 standard. Frontend: `Boma2024Calculator.tsx`.
3. **CAM Gross-Up Scenario Calculator** (`cam-gross-up-calculator/`) - Excel download, models 85-100% occupancy for 10 tenants. Frontend: `CamGrossUpCalculator.tsx`.
4. **Lease Abstract Discrepancy Matrix** (`lease-abstract-matrix/`) - Excel download, tracks caps/stops/admin fees across leases. Frontend: `LeaseAbstractMatrix.tsx`.
5. **CAM Leakage Estimator** (`cam-leakage-estimator/`) - Building SF + expenses + occupancy -> estimated recoverable CAM. Frontend: `CamLeakageEstimator.tsx`.
6. **CAM Overcharge Calculator** (`cam-overcharge-calculator/`) - Tenant-side annual CAM amount + lease size + cap terms -> probable overcharge range and category breakdown. Frontend: `CamOverchargeCalculatorClient.tsx`.
7. **Audit Risk Quiz** (`audit-risk-quiz/`) - Interactive 5-10 questions -> risk score + recommendations. Quiz data in `quiz-data.ts`. Frontend: `AuditRiskQuiz.tsx`.

- Tools hub page: `/tools` (`ToolsHub.tsx` / `marketing/src/app/tools/page.tsx`).
- Thank-you page with lead capture: `DownloadThankYou.tsx`.
- Legacy route `/tools/noi-impact-calculator` is permanently redirected to `/tools`.
- Layout wrapper: `ToolPageLayout.tsx` in `marketing/src/components/content/`.

### Resource Center

- Route pattern: `/resources/[slug]` (via `marketing/src/app/resources/`).
- Hub page: `/resources` (`marketing/src/app/resources/page.tsx`).
- Public help route `/help` leads with task cards before FAQ search, covering first setup steps, file uploads, CAM basics, troubleshooting, and tenant questions.
- Marketing navigation includes `Help`; footer company links continue to point to the same help center.
- Articles:
  - `what-is-cam-reconciliation/` — Educational top-of-funnel.
  - `harris-county-gross-up/` — HCAD retroactive assessment handling, 8-step walkthrough.
  - `deterministic-vs-ai-cam/` — Thought leadership, court defensibility argument.
  - `sb-1103-compliance/` — California QCT law guide.
  - `boma-2024-changes/` — BOMA CAM expense guide.
  - `cam-presend-checklist/` — CAM audit pre-send checklist.
  - `cam-reconciliation-errors/` — 10+ error types with detection methods.
  - `tenant-auditor-guide/` — Lease audit rights guide.
  - `export-guide/` — Export format documentation.
  - `gl-coding-guide/` — GL account coding guide.
- Each article uses `ContentPageLayout.tsx` with `CitationChip.tsx` and `SourcesSection.tsx`.
- Structured data: FAQPage, HowTo, BreadcrumbList schemas via `JsonLd.tsx`.

### Comparison Pages

- Route pattern: `/vs/[competitor]` (via `marketing/src/app/vs/`).
- Hub page: `/vs` (`marketing/src/app/vs/page.tsx`).
- Comparison data includes `winnerLabel`, `winnerSummary`, `bestForCapveri`, and `bestForCompetitor` so every comparison page states the recommended choice without hiding the competitor's best-fit use case.
- Competitor pages:
  - `/vs/yardi` — Yardi Voyager CAM module comparison.
  - `/vs/mri` — MRI Software comparison.
  - `/vs/appfolio` — AppFolio comparison.
  - `/vs/tenant-auditors` — Traditional auditor services comparison.
- Feature matrix, pricing comparison, implementation timeline, and verdict messaging.

### Sample Report Page

- Route: `/sample-report` (via `marketing/src/app/sample-report/`).
- Summary cards: recoverable revenue, errors found, ROI.
- Redacted sample findings table. 10+ audit checks listed.
- Frontend page: `frontend/src/pages/SampleReport.tsx` (app-side).

### Lead Capture

- `LeadCaptureForm.tsx` — Name + email form for gated content downloads.
- `CalculatorUnlockGate.tsx` — Gate calculator results behind lead capture.
- Exit-intent modal on signup pages — offers free CAM Gross-Up Calculator download.
- Suppressed during active form fill. One per session.
- Leads stored in `content_leads` table with UTM tracking fields.
- Backend lead capture canonicalizes email casing before suppression checks, duplicate-download rate limits, persistence, email delivery, and Sequencer enrollment.
- Backend-confirmed PostHog events fire only after successful lead persistence for gated downloads (`lead_form_submit`), calculator unlocks (`calculator_unlock_completed`), and PLG email capture (`plg_signup_lead_captured`). Distinct IDs use a salted domain/hash pattern and properties include safe lead metadata such as `lead_email_domain`, lead type, asset/source, UTM fields, and bucketed calculator values. Lead-form view events include safe source/location metadata so result-first tools can distinguish post-result capture from page-level lead gates.
- Nurture integration via Lemlist.

### SEO Infrastructure

- Schema.org structured data via `JsonLd.tsx` component.
- `robots.ts` — Dynamic robots.txt generation.
- `sitemap.ts` — Dynamic XML sitemap generation.
- `llms.txt` at `marketing/public/llms.txt` for AI crawler instructions.
- Canonical URLs, Open Graph cards, breadcrumbs with BreadcrumbList schema.
- Marketing PostHog capture sanitizes nested properties before sending so raw email/name/company/phone/message-like values are dropped while safe derived values such as `lead_email_domain` remain available.
- Marketing PostHog context is sanitized after merging caller properties, UTM parameters, latest-touch parameters, and first-touch attribution, so campaign URLs cannot leak raw email/phone-like values into event payloads.
- Page taxonomy segments `/vs/*`, `/alternatives/*`, `/switch/*`, `/solutions/*`, `/integrations/*`, `/best/*`, `/product/features/*`, and major product-feature SEO routes for acquisition and decision-stage analysis.

### Form Friction Analytics

- Contact, gated-download, and calculator-unlock forms emit `form_started`, `form_submit_attempted`, `form_submit_failed`, and `turnstile_required_missing` with safe metadata only.
- Form failure payloads use `error_type`, `status_bucket`, `form_type`, `location`, `asset_slug`, `lead_type`, `turnstile_configured`, `email_domain`, and bucketed building counts rather than raw form values or backend error detail.

### Checkout Flow

- `/checkout` (via `marketing/src/app/checkout/`) — Redirect to the app's canonical authenticated checkout route while preserving plan-selection query params.
- `/checkout/success` — Redirect to the app's authenticated post-checkout confirmation route.

## Database Tables

### content_leads
- `id` UUID PK, `first_name` TEXT, `email` TEXT, `company` TEXT
- `asset_slug` TEXT (which tool/content generated the lead), `source` TEXT
- `utm_source`, `utm_medium`, `utm_campaign` TEXT
- `created_at` TIMESTAMPTZ
- RLS: `anon` can INSERT (public form submissions). `service_role` has full access.
- Indexes on `email` and `asset_slug`.

### feedback
- User feedback with screenshots (stored in `feedback_screenshots` storage bucket).
- Public marketing feedback requires Turnstile verification, silently ignores honeypot-filled bot submissions, and applies a dedicated IP throttle before sending admin notification email.
- Created via migration `20240101000015_create_feedback.sql`.

## Key Files

- `marketing/src/app/` — page.tsx (homepage), pricing/, tools/, resources/, vs/, sample-report/, checkout/, robots.ts, sitemap.ts
- `marketing/src/components/landing/` — HeroSection, ValuePropositionSection, ROICalculator, HowItWorksSection, FeaturesGrid, PricingTeaser, CTASection, FAQSection, SocialProofStrip, PersonaToggle
- `marketing/src/components/content/` — ContentPageLayout, ToolPageLayout, CitationChip, SourcesSection
- `marketing/src/components/lead-capture/` — LeadCaptureForm, CalculatorUnlockGate
- `marketing/src/components/` — MarketingNav, MarketingFooter, PricingContent, JsonLd, ContactForm, ThemeToggle
- `marketing/public/llms.txt` — AI crawler instructions
- `frontend/src/pages/tools/` — App-side calculator pages
- `frontend/src/pages/SampleReport.tsx` — App-side sample report
- `supabase/migrations/20260223222130_create_content_leads_table.sql`
