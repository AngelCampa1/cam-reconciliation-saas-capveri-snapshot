# CapVeri Marketing and Sales Funnel System Map

_Last updated: 2026-07-01_

This is the operator map for keeping product, marketing, SEO, sales, and
lifecycle copy aligned. Use it before adding pages, moving URLs, changing CTAs,
or publishing claims about what CapVeri can do.

## Authority Stack

Use this order when files disagree:

1. `plan-tiers.json` for pricing, trial length, offer codes, offer dates, and
   package contents.
2. `knowledge/source/product.ts` for approved public claims, CTAs, personas,
   AI/math guardrails, support contacts, and capability language.
3. Generated public knowledge in `marketing/src/generated/public-knowledge.ts`
   and sibling generated files. Regenerate these. Do not edit them by hand.
4. `.agents/product-marketing.md` for active positioning and skill context.
5. `docs/feature-inventory/product-marketing-context.md` for older skills that
   still read the docs path.
6. Domain feature files under `docs/feature-inventory/` for product detail.
7. Dated plans, campaign docs, fundraising docs, and historical SEO handoffs.
   Treat them as snapshots, not current truth.

## Funnel Spine

Every public surface should connect to one next step.

| Step | Job | Main routes and files | Next step |
| --- | --- | --- | --- |
| Traffic | Bring in landlords, property teams, controllers, CFOs, and related operators | `marketing/content/linkedin`, `marketing/content/blog`, `marketing/content/resources`, `marketing/src/app/resources/*`, `marketing/src/app/tools/*`, founder-led posts | Teach one useful thing or route to a tool/resource |
| Education | Help readers understand the CAM problem and the check sequence | `/resources`, `/blog`, `/glossary`, `/cam-charges`, `/cam-reconciliation-guide` | Move to workflow, software, calculator, or role fit |
| Fit | Show whether CapVeri fits the buyer's role, workflow, system, or property type | `/for`, `/solutions`, `/integrations`, `/alternatives`, `/switch`, `/vs` | Move to product proof, sample report, or pricing |
| Product proof | Show what the product checks and what output the buyer gets | `/product-tour`, `/product/features`, `/sample-report`, `/cam-reconciliation-software` | Start trial or view pricing |
| Conversion | Start Reconcile trial and set billing expectations | `/pricing`, `/checkout`, app signup and billing selection | Create account, start trial, add billing before trial ends |
| Activation | Get the user to first product value | frontend onboarding, checkout handoff, GL upload, reconciliation result, lifecycle email | Upload files, review checks, understand support packet |
| Retention | Keep the account moving after first value | app workflows, lifecycle email, support, tenant workflows | Add billing, expand usage, resolve disputes, repeat checks |

## Page Families

Add new pages where the intent belongs. Do not create a new family just because
the slug is available.

| Family | Where it lives | Best for | Governance |
| --- | --- | --- | --- |
| Core commercial pages | `marketing/src/app/page.tsx`, `/pricing`, `/product-tour`, `/product/features`, `/sample-report`, `/cam-reconciliation-software` | Product proof, pricing, and trial conversion | Must use generated pricing/CTA knowledge |
| Resources hub and static guides | `marketing/src/app/resources/*` and `marketing/content/resources/*.mdx` | Durable education, compliance guides, workflows, and explainers | Must have sources, internal links, and clear next step |
| Programmatic resource families | `marketing/data/*.json` plus dynamic routes under `marketing/src/app/resources/*/[slug]` | States, markets, property types, roles, workflows, calendar, calculations, disputes, lease types, templates, expenses, BOMA, software | Add the item to the right JSON file and verify sitemap/internal link coverage |
| Tools | `marketing/src/app/tools/*` plus `marketing/src/lib/lead-magnets/*` when capture/download is involved | Calculators, templates, worksheets, and value-before-payment assets | Tool result must lead to a save, send, product proof, or trial step |
| Comparison and switch pages | `marketing/data/comparisons.json`, `alternatives.json`, `integrations.json`, `switch.json`, `solutions.json` | Vendor alternatives, migration questions, and buying decisions | Related links must resolve and keep CapVeri's caveats clear |
| Blog | `marketing/content/blog/*.mdx` | Timely commentary, founder POV, and search topics that do not need a dedicated route family | Use only known blog categories and author metadata |
| AI-readable files | `marketing/public/llms.txt`, `marketing/public/llms-full.txt`, `marketing/data/seo/llms-sections.json` | LLM discovery and clean source routing | Regenerate or check with the llms script |
| Sales and lifecycle | `backend/app/services/email`, `cloudflare-backend/src/http/auth-lifecycle-routes.ts`, sales docs under `docs/business` | Follow-up after signup, lead capture, support, and sales handoff | Must not contradict pricing, trial, or capability sources |

## SEO Governance Files

Use these files as the routing system for future SEO work:

- `marketing/data/seo/indexed-page-governance.json` lists priority indexed
  pages, funnel stage, canonical topic, primary CTA, next step, and parent/child
  links.
- `marketing/data/seo/content-governance.json` keeps retained and demoted slugs
  for overlapping families.
- `marketing/src/lib/seo/resource-organization.ts` defines the resource hub
  groups shown in navigation.
- `marketing/src/lib/seo/resources-megamenu.ts` defines the five Resources
  megamenu pillars.
- `marketing/scripts/internal-link-registry.mjs` discovers route families,
  generated hub links, broken links, orphan pages, and resource family coverage.
- `marketing/src/app/sitemap.ts` controls indexable route output.
- `marketing/next.config.ts` controls redirects. If a public URL moves, add the
  redirect here and verify redirect destinations.

Resources megamenu pillars:

- `/resources/cam-guides`
- `/resources/tools-calculators`
- `/resources/compliance-leases`
- `/resources/solutions`
- `/resources/blog-research`

Promoted indexed route families:

- `/alternatives`
- `/integrations`
- `/solutions`
- `/switch`
- `/roi`
- `/product-tour`
- `/best/cam-reconciliation-software`
- `/sample-report`

## When to Add a New Page

Add a page only when at least one condition is true:

- The buyer has a distinct search intent that existing pages do not answer.
- A sales objection needs a shareable answer.
- A product workflow needs proof that is too specific for a generic page.
- A tool gives value before payment and naturally leads to trial.
- A route family has a real coverage gap in sitemap, llms, resources, or
  comparison pages.

Do not add a page when the topic is only a synonym of an owned canonical topic.
Improve the canonical page, add an FAQ, or add an internal link instead.

## How to Add a Page

1. Read `docs/business/canonical-gtm-source-of-truth.md`,
   `.agents/product-marketing.md`, this file, and the relevant domain file under
   `docs/feature-inventory/`.
2. Pick the route family from the Page Families table.
3. Check `marketing/data/seo/content-governance.json` for retained or demoted
   overlap.
4. If the page should become a priority page, add it to
   `marketing/data/seo/indexed-page-governance.json` with one `nextStepHref`,
   parent links, child links, owner, reviewer, and source status.
5. Add or update internal links in the relevant hub, data file, or content map.
6. If a URL moves, add a permanent redirect in `marketing/next.config.ts`.
7. If the page should appear in AI-readable inventory, update
   `marketing/data/seo/llms-sections.json` and run the llms check.
8. Run the gates listed below.

## Capability Claim Rules

Safe current wording:

- "Works from CSV, Excel, and lease PDF exports."
- "No ERP API integration needed for the core workflow."
- "Financial math is deterministic and traceable."
- "AI-assisted extraction suggests lease terms for human review."
- "BOMA 2024 aligned workflows."
- "Keep your ERP as the system of record."

Do not publish:

- "BOMA certified" or "BOMA compliant."
- "AI calculates CAM."
- "Guaranteed recovery" or exact customer savings without an approved source.
- "Only" or "#1" category claims without current research.
- "Start Free Audit" as the primary CTA.
- "Audit credits" or "credit packs" as current packaging.
- "No integrations" when the precise claim should be about ERP API integrations.
- Fake customers, fake testimonials, fake revenue, or stale traction snapshots.

## Gates

Run impacted checks sequentially:

1. `node scripts/generate-public-knowledge.mjs` if source knowledge or pricing
   changed.
2. `node scripts/check-public-knowledge.mjs` if generated knowledge should stay
   in sync.
3. `node scripts/marketing-copy-gate.mjs` before public copy changes.
4. `node scripts/funnel-coherence-gate.mjs` or `npm run funnel:check` from
   `marketing/`.
5. `npm test -- --run src/__tests__/route-integrity.test.ts
   src/__tests__/internal-link-graph.test.ts src/__tests__/content-quality.test.ts`
   from `marketing/` for route, link, and SEO copy governance.
6. `npm run typecheck` from `marketing/`.
7. `npm run llms:check` from `marketing/` when llms inventory changes.
8. `npm run indexer:urls:check` or `npm run indexer:urls:net-new:check` when
   indexer handoff files are in scope.

Before release, run the broader impacted marketing gate and then verify the
deployed Worker reaches 100 percent current version per
`docs/guides/agent-operations.md`.

## Review Checklist

- Does every page have one clear next step?
- Does every product claim trace to `knowledge/source/product.ts` or a feature
  inventory file?
- Does every price, trial, offer, or unit count trace to `plan-tiers.json` or
  generated public knowledge?
- Does every moved public URL have a redirect?
- Does the sitemap include only canonical, retained pages?
- Are demoted duplicate pages absent from sitemap and internal links?
- Are AI-readable files current when priority pages changed?
- Did changed public copy pass humanizer, third-grade-copy, zero-lie review, and
  whole-context fit?
