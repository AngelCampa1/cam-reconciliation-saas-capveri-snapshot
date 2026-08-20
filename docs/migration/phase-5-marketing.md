# Phase 5: Marketing Site

**Depends on**: Phase 1 (config settled)
**Blocks**: Phase 8 (finalize)
**Can run in parallel with**: Phases 2, 3, 6
**Est. files**: ~100
**Est. occurrences**: ~800

## Goal

Update the entire Next.js marketing site under `marketing/` — structured data,
layout metadata, all app pages, MDX blog and resource content, components,
Tailwind config, and public assets. After this phase, `www.capveri.com` should
display the correct brand throughout.

---

## Critical CAM Rule for Marketing

Marketing content is heavily educational about CAM reconciliation. The following strings
must NOT be changed even though they contain "CAM":

- "CAM charges", "CAM reconciliation", "CAM pool", "CAM audit", "CAM caps"
- "CAM expense", "CAM report", "CAM estimate"
- "understanding CAM", "review your CAM", "verify CAM"

Only change `CAMAudit` (the brand name) and `capveri.com` (the domain).

---

## Structured Data & Metadata

### `marketing/src/lib/structured-data.ts`
**What to change**:
- `Organization.name`: `"CAMAudit"` → `"CapVeri"`
- `Organization.url`: `"https://www.capveri.com"` → `"https://www.capveri.com"`
- `Organization.logo.url`
- `WebSite.url`
- `WebSite.name`
- `sameAs` social profile URLs if they reference the old brand handle
- `contactPoint.email`

**Replacement rules**: All rules 1–16.

---

### `marketing/src/app/layout.tsx`
**What to change**:
- `metadata.title.default`: `"CAMAudit"` → `"CapVeri"`
- `metadata.title.template`: e.g., `"%s | CAMAudit"` → `"%s | CapVeri"`
- `metadata.description`
- `metadata.metadataBase`: `new URL("https://www.capveri.com")` → `"https://www.capveri.com"`
- `metadata.openGraph.siteName`
- `metadata.openGraph.url`
- `metadata.twitter.site` handle (if it contains the brand)
- Footer copyright text
- Any `canonical` link

**Replacement rules**: 4–8, 14–15.

---

## App Pages

### `marketing/src/app/page.tsx` (Homepage)
**What to change**:
- `<title>` / `metadata.title`
- All brand name occurrences in headings and copy
- CTA button `href` values: `app.capveri.com` → `app.capveri.com`
- Any `<a>` hrefs or `<Link>` hrefs with old domain
- Social proof copy mentioning brand

**Replacement rules**: 4–8, 14–15. Skip "CAM" as concept.

---

### `marketing/src/app/about/page.tsx`
**What to change**:
- Brand name throughout
- Mission statement
- Company domain reference
- Team/contact email addresses

**Replacement rules**: 1–8, 14–15.

---

### `marketing/src/app/pricing/page.tsx`
**What to change**:
- Brand name in headings and plan descriptions
- CTA links: `app.capveri.com` → `app.capveri.com`
- FAQ copy with brand name
- Plan name strings if they contain `CAMAudit`

**Replacement rules**: 4–8, 14–15.

---

### `marketing/src/app/contact/page.tsx`
**What to change**:
- Contact email recipient
- Brand name in contact copy

**Replacement rules**: 1–8, 14–15.

---

### `marketing/src/app/docs/page.tsx`
**What to change**:
- Brand name in docs hub headings
- Any links to `app.capveri.com` docs

**Replacement rules**: 4–8, 14–15.

---

### `marketing/src/app/help/page.tsx`
**What to change**:
- Brand name in help center copy
- Support email address

**Replacement rules**: 1–8, 14–15.

---

### `marketing/src/app/checkout/page.tsx`
**What to change**:
- Brand name in checkout flow copy
- Success/cancel redirect URLs

**Replacement rules**: 4–8, 14–15.

---

### `marketing/src/app/vs/*.tsx` (all competitor comparison pages, ~5 files)
**What to change**:
- Brand name throughout (headings, feature tables, CTAs)
- CTA links
- Testimonial attribution to brand

**Replacement rules**: 4–8, 14–15.

**Edge case**: Comparisons discuss CAM reconciliation features — leave "CAM" as-is in those contexts.

---

### `marketing/src/app/tools/*.tsx` (all tool pages, ~8 files)
**What to change**:
- Brand name in tool page headings and descriptions
- CTA links
- Share/embed links with old domain

**Replacement rules**: 4–8, 14–15.

**Edge case**: Tool pages for CAM calculators use "CAM" extensively as a concept. Do NOT change those.

---

### `marketing/src/app/blog/page.tsx`
**What to change**:
- Brand name in blog index heading or description

**Replacement rules**: 14–15.

---

### `marketing/src/app/blog/[slug]/page.tsx`
**What to change**:
- Default OG image URL
- Author attribution if it references brand email
- Related links or CTAs with old domain

**Replacement rules**: 4–8, 14–15.

---

### `marketing/src/app/resources/*.tsx` (all resource pages, ~4 files)
**What to change**:
- Brand name in resource hub headings
- CTA links

**Replacement rules**: 4–8, 14–15.

---

### Other Pages
Run a sweep:
```bash
grep -r "camaudit" marketing/src/app/ --include="*.tsx" --include="*.ts" -l
```
Update any files returned not covered above.

---

## MDX Content

### `marketing/content/blog/*.mdx` (all blog posts, ~8 files)
**What to change**:
- Frontmatter `author` email or `canonical` URL if they reference old domain
- In-article brand mentions: `CAMAudit` → `CapVeri`
- CTA links in article body: `app.capveri.com` → `app.capveri.com`

**Do NOT change**:
- "CAM charges", "CAM reconciliation", "CAM pool", "CAM caps" — these are the educational topic

**Replacement rules**: 1–8, 14–15 (carefully).

---

### `marketing/content/resources/*.mdx` (all resource docs, ~15 files)
**What to change**:
- Same pattern as blog posts above
- Brand name in resource headings or intro paragraphs
- CTA links in resource body

**Do NOT change**:
- All CAM financial terminology — these articles are educational guides about CAM reconciliation

**Replacement rules**: 1–8, 14–15 (carefully — inspect each hit before replacing).

---

## Components

### `marketing/src/components/*.tsx` (all shared components, ~12 files)

Common components to check:
- `Navbar.tsx` / `Header.tsx`: logo alt, brand name, nav links
- `Footer.tsx`: copyright, domain links, email
- `CTA.tsx` / `CTASection.tsx`: links to `app.capveri.com`
- `FAQ.tsx`: any brand name in FAQ copy
- `ROICalculator.tsx`: brand name in results copy
- `Testimonials.tsx`: brand attribution
- `PricingCard.tsx`: brand name in card copy
- `HeroSection.tsx`: brand name in hero heading/subheading
- `FeatureSection.tsx`: brand name in feature copy

For each component:
**Replacement rules**: 1–8, 14–15. Skip "CAM" as concept.

---

## Public Assets

### `marketing/public/robots.txt`
**What to change**:
- Sitemap URL: `https://www.capveri.com/sitemap.xml` → `https://www.capveri.com/sitemap.xml`

---

### `marketing/public/sitemap.xml` (if static)
**What to change**:
- All `<loc>` entries with old domain

If sitemap is generated dynamically (via `next-sitemap` or similar), update the config file instead.

---

### `marketing/next.config.ts` (or `next.config.js`)
**What to change**:
- `images.domains` or `images.remotePatterns` if they contain `capveri.com`
- `async redirects()` entries with old domain
- `async rewrites()` entries
- `env` constants

---

### `marketing/tailwind.config.ts`
**What to change**:
- Any comments or class names referencing the brand (unlikely but verify)

Note: Marketing has its own Tailwind config — do NOT run `npm run tokens` here.
The marketing site manages its own design tokens.

---

## Edge Cases

1. **MDX "CAM audit" vs "CAMAudit"**: "CAM audit" (two words, lowercase) in educational content means performing an audit of CAM charges — do NOT change. Only `CAMAudit` (one word, camelcase brand name) should be changed.

2. **Blog post dates and author bios**: Do not change dates or author names. Only change brand/domain strings.

3. **Structured data JSON-LD**: Ensure the `@type: Organization` block gets a complete update — partial updates will break SEO validation.

4. **Next.js metadata API vs `<Head>`**: The marketing site uses Next.js App Router `metadata` exports. Ensure all `metadata` objects in every `page.tsx` and `layout.tsx` are updated, not just the root layout.

5. **OG image generation**: If there's a dynamic OG image route (e.g., `app/og/route.tsx`), update brand name there too.

---

## Verification

```bash
# Check no camaudit remains in marketing source
grep -r "camaudit" marketing/src/ marketing/content/ marketing/public/ \
  --include="*.ts" --include="*.tsx" --include="*.mdx" --include="*.md" \
  --include="*.json" --include="*.txt" --include="*.xml"

# Run marketing type check
cd marketing && npm run typecheck

# Run formatting and lint
cd marketing && npm run format && npm run lint:fix
```

Expected: zero `camaudit` hits; type check clean.
