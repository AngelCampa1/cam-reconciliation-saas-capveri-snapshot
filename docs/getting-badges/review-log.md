# Review Log

Date: May 15, 2026

This log records the review passes run over the submission copy on that date. It is accurate about
what was reviewed. It is also the record of what the review missed: it verified the copy against
repo files and platform rules, and never checked that `capveri.com` resolved or that the two named
screenshots showed this product. Neither was true. See the header of
[README.md](./README.md).

## Source Verification

Verified platform requirements from public pages:

- SaaSHub submission page: accepts SaaS/software, rejects unreleased products, waitlist-only pages, free subdomains, non-English products, and agencies. Recommends categories, competitors, and domain email verification.
- AlternativeTo public pages: profiles are account and crowd-sourced, with platform, license, application type, screenshots, features, tags, and alternatives.
- Product Hunt launch guide: URL, product name, max 60-character tagline, max 500-character description, up to 3 launch tags, 240 x 240 thumbnail under 3MB, 2+ gallery images at 1270 x 760, optional YouTube video, pricing, promo fields, makers, first comment, scheduling, and no direct upvote asks.
- G2 research and product information docs: B2B only, no duplicates, no extensions/integrations as standalone products, category inclusion criteria, Lease Administration critical-date requirement, Real Estate Activities Management mismatch, profile logo at least 400px, SVG grid logo under 5MB, banner size and file limits, up to 500-word overview.
- BetaList criteria, terms, and support: authorized submitter, own-domain working website, technology startup, recently launched or early-access preference, prior-feature limits, signup/access path, editorial discretion, paid priority as optional.

Verified CapVeri facts from repo files:

- `plan-tiers.json`: 30-day trial, Limited offer, tier prices, feature list.
- `frontend/src/pages/company/About.tsx`: CRE FinOps positioning, deterministic math, anti-integration framing, security claims, BOMA 2024 reference, CSV export workflow.
- `marketing/content/resources/cam-software-comparison-hub.mdx`: standalone CAM reconciliation positioning, Yardi/MRI/RealPage/AppFolio/Excel context, no API project, audit trail, dispute readiness, pricing language.
- `marketing/src/lib/structured-data.ts` and tests: website, organization, founder, LinkedIn, and contact references.
- Asset dimensions checked with `file`.

## Humanizer Pass

Edits applied:

- Removed generic phrases such as "all-in-one", "revolutionary", "game-changing", and "powerful platform".
- Kept copy specific to commercial real estate, CAM reconciliation, lease terms, GL exports, property accountants, controllers, and tenant audits.
- Removed direct hype and awards language.
- Used simple, direct sentences and avoided inflated claims.
- Avoided long dash punctuation in generated docs.

## Platform-Fit Pass

- SaaSHub copy includes categories and competitors because the platform says missing competitors slows review.
- AlternativeTo copy is alternative-led and includes platforms, license, features, tags, and related apps.
- Product Hunt copy keeps the tagline and description within published limits and includes a first maker comment.
- G2 copy uses category-creation evidence and guards against unsupported existing-category requests.
- BetaList copy flags the launch-recency risk instead of forcing eligibility.

## Consistency Pass

- Product name is `CapVeri` everywhere.
- Website URL is `https://www.capveri.com` everywhere.
- Pricing matches `plan-tiers.json`.
- Competitor set is consistent across platforms.
- Copy varies by platform so listings do not read as duplicate spam.

## Review Agent Fix Pass

- Removed CRM and broad property-management category recommendations that conflicted with CapVeri's reconciliation positioning.
- Reworked G2 guidance around category creation and guarded Lease Administration behind custom critical date alarm evidence.
- Added Product Hunt same-product relaunch and BetaList prior-feature checks.
- Fixed AlternativeTo pricing from freemium/free-trial language to paid with free trial.
- Split support and founder/escalation email contacts to match the product knowledge source.
- Aligned the master feature list with `plan-tiers.json` labels.
- Replaced the oversized requirements table with per-platform sections for easier future review.

## Remaining Owner Checks

- Confirm Product Hunt maker username.
- Confirm Product Hunt launch date and time.
- Confirm CapVeri has not launched on Product Hunt in the last six months.
- Confirm any `80OFF` expiration date before using Product Hunt promo fields.
- Confirm G2 legal seller details if requested.
- Confirm G2 category evidence, especially custom critical date alarms if requesting Lease Administration.
- Confirm BetaList launch-recency eligibility.
- Confirm whether CapVeri has already been featured on BetaList.
