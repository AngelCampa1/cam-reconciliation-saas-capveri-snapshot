# Epic T6: Content & SEO

## Epic Info
- **Product**: Tenant CAM Audit
- **Estimated Hours**: 34
- **Status**: `pending`

## Overview

Builds the content and SEO layer for `marketing-tenant/`. This epic adds structured data (JSON-LD) across all pages, publishes the first two blog posts targeting high-intent keywords, creates comparison and glossary pages, and ships a free CAM overcharge calculator as a lead-generation tool.

The content strategy targets tenants searching for CAM reconciliation information. Phase 1 (this epic) covers launch content: schema markup site-wide, two blog posts, a comparison page, a glossary, and an interactive calculator. Phase 2 (month 2-3, not in this epic) adds four more blog posts.

## Business Value

- **Organic acquisition**: Blog posts target "CAM reconciliation" (590 monthly volume) and "CAM overcharges" (140 monthly volume) -- the two highest-intent tenant queries.
- **AI-SEO optimization**: Definition blocks, FAQ sections, and structured data ensure content surfaces in AI-generated answers (ChatGPT, Perplexity, Google AI Overviews).
- **Lead generation**: The free calculator captures emails before showing results, feeding the nurture funnel.
- **Trust building**: Comparison page positions CapVeri fairly against traditional auditors. Glossary establishes domain authority.

## Content Strategy

### AI-SEO Patterns (Applied to All Content)
- Definition blocks in first paragraph (40-60 words, self-contained)
- H2/H3 headings matching query patterns
- Comparison tables with clear column structure
- FAQ sections on every page (rendered as `<FAQSection>` MDX component + FAQPage JSON-LD)
- Statistics with citations using `CitationChip` + `SourcesSection`
- `robots.txt` allowing all AI bots

### Schema Markup Plan

| Page | Schema Types |
|------|-------------|
| Landing page | WebApplication, Service, FAQPage, Organization |
| Pricing | Product (per tier), FAQPage |
| Blog posts | Article, FAQPage, BreadcrumbList |
| How it works | HowTo, FAQPage |
| Comparison page | ItemList, FAQPage |
| Sample report | CreativeWork, FAQPage |
| Glossary | DefinedTermSet |
| Free tool | WebApplication, FAQPage |

### Blog Roadmap

**Phase 1 (launch -- this epic):**
1. "What Is CAM Reconciliation? A Tenant's Guide" -- target: "CAM reconciliation" (590 vol)
2. "7 Most Common CAM Overcharges (And How to Catch Them)" -- target: "CAM overcharges" (140 vol)

**Phase 2 (month 2-3 -- future epic):**
3. "Your Rights as a Tenant: When and How to Audit CAM Charges"
4. "Understanding CAM Charges in Triple Net (NNN) Leases"
5. "CAM Reconciliation Checklist: 12 Items to Verify"
6. "How Much Does a CAM Audit Cost? Traditional vs. Automated"

## Dependencies

- T4.1 (marketing-tenant/ scaffold) -- project structure, shared components
- T4.2 (tenant landing page) -- landing page exists for schema markup
- T4.3 (tenant nav and footer) -- navigation links to blog, glossary, tools

## Stories

| Story | Title | Hours | Dependencies |
|-------|-------|-------|--------------|
| T6.1 | Schema markup implementation | 6 | T4.1, T4.2 |
| T6.2 | Blog content Phase 1 | 10 | T4.1 |
| T6.3 | Comparison and glossary pages | 10 | T4.1, T4.3 |
| T6.4 | Free CAM overcharge calculator | 8 | T4.1 |

**Total Hours**: 34

## Success Criteria

- All pages have valid JSON-LD structured data (passes Google Rich Results Test)
- Blog posts render with Article + FAQPage + BreadcrumbList schemas
- Comparison page renders a fair, balanced comparison table
- Glossary renders all terms with DefinedTermSet schema
- Calculator captures email before showing results (CalculatorUnlockGate pattern)
- Lighthouse SEO score >= 95 on all new pages
- All content passes `npm run typecheck` with zero errors

## Out of Scope

- Phase 2 blog posts (future epic)
- Link building / off-site SEO
- Google Search Console setup (infrastructure task)
- Analytics event tracking (separate instrumentation task)
- Paid search landing pages
