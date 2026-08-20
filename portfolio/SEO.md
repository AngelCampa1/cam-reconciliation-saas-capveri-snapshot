# The marketing site as a build system

`marketing/` is a Next.js App Router application on its own Cloudflare Worker, and it is the second
largest piece of engineering in this repository after the reconciliation engine. It is here as a
separate document because organic search was the only acquisition channel, which made the site's
architecture a product decision rather than a content decision.

The short version: **729 pages built, none of them stored in a CMS.** 581 of those come out of an
MDX file or a JSON data file at build time, which means most of the site is type-checked, diffable,
reviewable, and testable in the same pass as the application code.

| | Pages |
|---|---:|
| MDX articles (125 blog, 150 resources) | 275 |
| Generated from data files, across 22 route templates | 306 |
| Hand-authored pages and hubs | 148 |
| **Built** | **729** |
| Retired to permanent redirects by governance, so never built | 76 |

For corroboration, a snapshot of the live sitemap taken from production holds 715 URLs, which is the
729 above less the pages deliberately kept out of the index.

---

## Pages as data

Twenty-two JSON files under [`marketing/data/`](../marketing/data) drive twenty-two route
templates. Each is a `[param]` route with `generateStaticParams`, and each sets
`dynamicParams = false`, so a slug that is not in the data file returns 404 rather than rendering an
empty page on demand.

| Data file | Route | Built |
|---|---|---:|
| `states.json` | `/resources/states/[state]/cam-compliance` | 50 |
| `metros.json` | `/resources/markets/[metro]/cam-guide` | 43 |
| `publicKnowledge.productFeatures` | `/product/features/[slug]` | 24 |
| `lease-clauses.json` | `/resources/lease-clauses/[clause]` | 20 |
| `property-types.json` | `/resources/property-types/[type]/cam-guide` | 18 |
| `expenses.json` | `/resources/expenses/[category]` | 15 |
| `comparisons.json` | `/vs/[slug]` | 13 of 32 |
| `glossary-terms.json` | `/glossary/[term]` | 13 of 55 |
| `workflows.json` | `/resources/workflows/[workflow]` | 13 |
| `boma-topics.json` | `/resources/boma/[topic]` | 12 |
| `templates.json` | `/resources/templates/[slug]` | 10 |
| `cam-calculations.json`, `lease-types.json` | calculations, lease-type guides | 8 each |
| `alternatives.json`, `software.json` | `/alternatives/[slug]`, `/resources/software/[product]/cam-setup` | 7 each |
| `switch.json`, `roles.json`, `personas.json`, `cam-dispute.json` | four templates | 6 each |
| `solutions.json`, `calendar.json` | two templates | 5 each |
| `integrations.json` | `/integrations/[slug]` | 4 |
| `BlogCategory` enum | `/blog/category/[category]` | 7 |

Fifty state pages exist because a landlord searches for CAM rules in their state. They are the same
component with different data, which is exactly what a programmatic SEO page is, and the honest
engineering question about that pattern is not how to generate them. It is how to stop.

## The part worth reading: pages that retire themselves

Programmatic pages are cheap to create and expensive to own. Generate 55 glossary terms and most of
them will never rank, will dilute the ones that could, and will still be there in a year.

[`marketing/data/seo/content-governance.json`](../marketing/data/seo/content-governance.json)
holds the retained slugs, and nothing else:

```json
{ "retainedSoftwareGuideSlugs": [7 slugs],
  "retainedComparisonSlugs":    [13 slugs],
  "retainedGlossaryTermSlugs":  [13 slugs],
  "demotedBlogSlugs":           [1 slug],
  "demotedResourceSlugs":       [4 slugs] }
```

Three things read that one file, and this is what makes it a system rather than a list:

1. **`generateStaticParams` filters on it**, so a retired page is never built. See
   [`vs/[slug]/page.tsx:30`](../marketing/src/app/vs/[slug]/page.tsx#L30) and
   [`glossary/[term]/page.tsx:34`](../marketing/src/app/glossary/[term]/page.tsx#L34).
2. **`next.config.ts` derives the redirects** by diffing the full slug list in the data file against
   the retained list, then emitting a permanent 301 from each retired slug to its parent hub
   (`subtractRetainedSlugs` at
   [`marketing/next.config.ts:56`](../marketing/next.config.ts#L56)). 15 software guides, 19
   comparisons, and 42 glossary terms, so 76 redirects that nobody typed by hand and nobody can
   forget to add.
3. **`sitemap.ts` filters on it too**, so the sitemap cannot disagree with what was built.

Retiring a page is therefore one edit to one array. Removing a slug deletes the page, redirects its
URL, and drops it from the sitemap in the same build. Adding it back reverses all three.

Demotion is the softer tool. Demoted blog and resource articles are still built and still crawlable,
but return `robots: { index: false, follow: true }` and drop their self-canonical, which is the
correct combination for a page you want to pass link equity without competing in the index. It is
asserted in
[`noindex-metadata.test.ts`](../marketing/src/app/__tests__/noindex-metadata.test.ts), because a
`noindex` that silently stops being emitted is invisible until traffic disappears.

## Structured data from one module

[`marketing/src/lib/structured-data.ts`](../marketing/src/lib/structured-data.ts) exports fifteen
schema builders and is called from 245 sites across the app. Fourteen of the fifteen are used;
`person` is only reached indirectly through `article.author`.

Emitted schema.org types, counting nested ones, come to 22: `Organization`, `SoftwareApplication`,
`WebSite`, `Service`, `Article`, `FAQPage`, `Question`, `Answer`, `HowTo`, `HowToStep`,
`BreadcrumbList`, `ListItem`, `ItemList`, `DefinedTerm`, `DefinedTermSet`, `Product`, `Person`,
`ContactPoint`, `Country`, `ImageObject`, `VideoObject`, and `SpeakableSpecification`. `/pricing`
emits an `@graph` combining three of them.

Rendering goes through a twelve-line component,
[`JsonLd.tsx`](../marketing/src/components/JsonLd.tsx), so there is one place where the script tag
is written and one place where the payload is shaped.

## Internal linking is a data structure

Three separate mechanisms, all declarative:

- [`clusters.ts`](../marketing/src/lib/seo/clusters.ts) defines topic clusters, each with a hub
  page, a product page, priority routes, and slug match patterns. This is the hub-and-spoke map, in
  code, where it can be asserted against.
- [`contextual-links.ts`](../marketing/src/lib/seo/contextual-links.ts) holds base links keyed by
  funnel stage and additional links keyed by content tag (`gross-up`, `pro-rata`, `cap-math`,
  `yardi`), so an article about gross-up gets gross-up links without anyone remembering to add them.
- [`indexed-page-governance.json`](../marketing/data/seo/indexed-page-governance.json) declares
  explicit parent and child links per priority page, plus `canonicalTopic`, `author`, `reviewer`,
  and `updated`.

Breadcrumbs are emitted twice, once as UI and once as `BreadcrumbList` JSON-LD, and
[`breadcrumb-coverage.test.tsx`](../marketing/src/app/__tests__/breadcrumb-coverage.test.tsx)
checks that page types actually carry them.

## Crawl surface

**Sitemap.** One file, [`sitemap.ts`](../marketing/src/app/sitemap.ts), 419 lines,
`dynamic = "force-static"`. It aggregates the MDX collections, all 22 data-driven collections through
the governance filter, and the static routes, then deduplicates by URL. It is not split into a
sitemap index, which is a reasonable call at this scale and would not be at ten times it.

`lastmod` comes from two places. Data-driven collections read the `lastUpdated` field of their own
JSON file, so touching the data updates the date. Static routes read a hand-maintained map in
[`sitemap-dates.ts`](../marketing/src/lib/seo/sitemap-dates.ts), which is the weakest part of the
setup: a hand-maintained date is a date that goes stale quietly.

**robots.** [`robots.ts`](../marketing/src/app/robots.ts) makes an editorial decision rather than a
default one. `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `anthropic-ai`,
and `Google-Extended` are allowed. `CCBot` and `Bytespider` are not. The line drawn is between
crawlers that send traffic or answer questions about the product and crawlers that only harvest, and
it is covered by a test.

**llms.txt.** [`generate-llms.mjs`](../marketing/scripts/generate-llms.mjs) builds `/llms.txt` and
`/llms-full.txt` from a sections file plus the generated pricing and product-feature knowledge, and
`npm run llms:check` fails the build when the committed output has drifted from its sources. The
pattern matters more than the file: the site's machine-readable summary is generated from the same
single source of truth the application uses, so it cannot describe a product that no longer exists.

**Submission.** [`indexnow-submit.mjs`](../marketing/scripts/indexnow-submit.mjs) fetches the live
sitemap and posts every URL to IndexNow. `export-prod-indexer-urls.mjs` snapshots the production
sitemap into [`docs/seo/prod-indexer-urls.txt`](../docs/seo/prod-indexer-urls.txt) with a check mode that
requires a minimum count of net-new URLs before it will pass.

## Copy gates

Three scripts stand between a draft and production, and none of them checks grammar. They check that
the site is not lying and not talking to itself.

[`scripts/marketing-copy-gate.mjs`](../scripts/marketing-copy-gate.mjs) bans internal vocabulary
from reader-visible text: the project codename, "lead magnet", "buyer persona", "funnel stage", and
the TOFU/MOFU/BOFU acronyms. The acronym rule has a carve-out for files where those strings are
legitimate identifiers rather than prose, listed explicitly, because a linter that cannot be right
gets disabled.

[`scripts/funnel-coherence-gate.mjs`](../scripts/funnel-coherence-gate.mjs) is the more useful one.
It scans for **retired claims**: superseded pricing, a discontinued offer, absolute guarantee
language, and any suggestion that the product integrates with Yardi through an API, which it never
did. Twenty named checks. A marketing site accumulates untrue sentences the way a codebase
accumulates dead code, and this is the only mechanism in the repository that treats that as a build
failure.

The generated pricing knowledge closes the same loop from the other direction: prices are never typed
into a page, so a price change cannot leave a stale number behind on page 40.

## Rendering

Static by default, everywhere. No `revalidate` call exists anywhere in `src/app`, so there is no ISR
and no time-based invalidation. Cache behaviour is set once in `next.config.ts` as
`s-maxage=3600, stale-while-revalidate=86400` on everything outside `/api` and `/_next`, alongside
the full security header set including CSP and a two-year HSTS with preload.

Open graph images are generated per page at request time by
[`app/api/og/route.tsx`](../marketing/src/app/api/og/route.tsx) using `next/og`, with the category
colour-coded, rather than several hundred committed PNGs.

## Loose ends

- **[`meta-templates.ts`](../marketing/src/lib/seo/meta-templates.ts) is dead code.** Sixty-five
  lines of title and description helpers, imported by nothing. Metadata is instead built inline in
  each of the 25 `generateMetadata` functions. It works, and it is duplication that a shared helper
  was written to remove and then never adopted.
- **MDX frontmatter has no runtime validation.** `types.ts` declares the interfaces and
  [`mdx.ts:52`](../marketing/src/lib/content/mdx.ts#L52) does `data as BlogFrontmatter`, a type
  assertion over `gray-matter` output. Zod is used elsewhere in this application for form input but
  not here. A malformed date in an article's frontmatter reaches the sitemap unchallenged.
- **One page's JSON-LD bypasses the shared module.** The state compliance template builds `Article`
  and `BreadcrumbList` objects inline instead of calling it, which is the drift the shared module
  exists to prevent.
- **Single locale.** No hreflang, no i18n routing.
- **The competitive audit under [`docs/seo/2026-04-audit/`](../docs/seo/2026-04-audit/) is a static
  export**, pasted in from an external keyword tool rather than something this codebase produces or
  refreshes.
