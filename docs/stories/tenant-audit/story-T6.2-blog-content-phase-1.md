# Story T6.2: Blog Content Phase 1

## Story Info
- **Epic**: T6 -- Content & SEO
- **Estimated Hours**: 10
- **Dependencies**: T4.1 (scaffold), T6.1 (schema markup helpers)
- **Status**: `pending`

## User Story
As a commercial tenant searching for CAM reconciliation information, I want authoritative blog content that explains CAM reconciliation and common overcharges so that I can understand whether my landlord's charges are accurate and decide whether to get an audit.

## Acceptance Criteria
- Blog index page at `/blog` lists all published posts with title, excerpt, date, and category
- Post 1 ("What Is CAM Reconciliation? A Tenant's Guide") publishes at `/blog/cam-reconciliation-guide`
- Post 2 ("7 Most Common CAM Overcharges (And How to Catch Them)") publishes at `/blog/common-cam-overcharges`
- Both posts use the MDX content pipeline from `marketing/` (frontmatter, FAQSection, CitationChip, SourcesSection, CTABox)
- Each post includes Article + FAQPage + BreadcrumbList JSON-LD (via T6.1 helpers)
- Each post opens with a 40-60 word definition block in the first paragraph
- H2/H3 headings match target query patterns
- Each post has 5-6 FAQ items in an `<FAQSection>` component
- Statistics use `CitationChip` with a `SourcesSection` at the bottom
- Each post ends with a `<CTABox>` driving to the audit wizard
- Blog index has proper `<meta>` tags and canonical URLs

## Technical Specifications

### Blog Infrastructure

MDX files go in `content/blog/` following the same pattern as `marketing/content/blog/`:

```
marketing-tenant/
  content/
    blog/
      cam-reconciliation-guide.mdx
      common-cam-overcharges.mdx
  src/
    app/
      blog/
        page.tsx          # Blog index
        [slug]/
          page.tsx        # Individual post
```

### Post 1: "What Is CAM Reconciliation? A Tenant's Guide"

**File**: `content/blog/cam-reconciliation-guide.mdx`

**Target keyword**: "CAM reconciliation" (590 monthly search volume)

**Frontmatter**:
```yaml
---
title: "What Is CAM Reconciliation? A Tenant's Guide"
description: "CAM reconciliation explained for commercial tenants. Learn what CAM charges cover, how reconciliation works, what to look for in your statement, and when to request an audit."
excerpt: "CAM reconciliation explained for commercial tenants. Learn what CAM charges cover, how reconciliation works, what to look for in your statement, and when to request an audit."
datePublished: "2026-03-01"
dateModified: "2026-03-01"
author: "Angel Campa"
category: "cam-basics"
faq:
  - q: "What is CAM reconciliation?"
    a: "CAM reconciliation is the annual process where a commercial landlord compares estimated CAM charges collected from tenants during the year against actual operating expenses incurred. The difference results in either a refund to the tenant or an additional charge."
  - q: "When does CAM reconciliation happen?"
    a: "Most leases require reconciliation within 90 to 180 days after the fiscal year ends. If your year-end is December 31, expect a reconciliation statement between April and June. Some landlords are slower — your lease specifies the deadline and your rights if they miss it."
  - q: "What should I look for in a CAM reconciliation statement?"
    a: "Check five things: your pro-rata share percentage matches your lease, excluded expenses (like capital improvements) are not included, the gross-up calculation is correct if the building has vacancy, any cap on increases is properly applied, and the admin/management fee percentage matches your lease terms."
  - q: "Can I dispute my CAM reconciliation?"
    a: "Yes. Most commercial leases include an audit rights clause giving tenants 12 to 36 months to dispute charges. You can request supporting documentation — general ledger detail, vendor invoices, occupancy records — and challenge specific line items."
  - q: "How much does a CAM audit cost?"
    a: "Traditional CPA-led CAM audits cost $5,000 to $25,000 depending on property size and complexity. Automated tools like CapVeri start at $49 for a standard check and go up to $199 for an expert-level audit with a CPA-signed letter."
  - q: "What percentage of CAM reconciliations have errors?"
    a: "Industry data indicates approximately 40% of CAM reconciliations contain material errors. Common issues include gross-up miscalculations, capital expense misclassification, and admin fee overcharges."
---
```

**Content Outline**:

```
Opening paragraph (40-60 word definition block):
CAM reconciliation is the annual process where... [self-contained definition]

## What Are CAM Charges?
- Definition of Common Area Maintenance
- Types of expenses included (maintenance, utilities, insurance, taxes, management fees)
- What is excluded (capital improvements, landlord-specific costs)
- How CAM charges relate to triple net (NNN) leases

## How CAM Reconciliation Works
- Estimated vs. actual: the two-step billing process
- Timeline: when to expect your reconciliation statement
- The reconciliation calculation (with simple example)
- Pro-rata share: how your portion is calculated

## What to Check on Your CAM Statement
- Pro-rata share percentage vs. lease terms
- Excluded expense categories (CapEx, above-standard tenant improvements)
- Gross-up calculation (if building has vacancy)
- Cap enforcement (annual or cumulative)
- Admin/management fee percentage and base

## Red Flags That Signal Overcharges
- Year-over-year increase exceeds cap in your lease
- Expenses that look like capital improvements (roof replacement, HVAC system)
- Pro-rata share changed without explanation
- Admin fee calculated on gross expenses instead of net tenant share
- StatGrid with key statistics + CitationChips

## Your Audit Rights as a Tenant
- Audit clause basics (what most leases say)
- Typical audit windows (12-36 months)
- What documentation you can request
- When to hire an auditor vs. self-review

## How CapVeri Helps
- Upload reconciliation statement + lease
- Automated checks across 8 categories
- Three pricing tiers (Standard $49, Detailed $99, Expert $199)
- Results in 24-48 hours

<FAQSection items={faq} />

<CTABox
  title="Not Sure If Your CAM Charges Are Accurate?"
  description="Upload your reconciliation statement and lease. CapVeri checks pro-rata share, gross-up, caps, admin fees, and exclusions -- and shows you the dollar impact of any errors."
  buttonText="Audit My CAM Charges"
  utmContent="blog_cam_recon_guide_cta"
/>

## Sources
[CitationChip references + SourcesSection]
```

### Post 2: "7 Most Common CAM Overcharges (And How to Catch Them)"

**File**: `content/blog/common-cam-overcharges.mdx`

**Target keyword**: "CAM overcharges" (140 monthly search volume)

**Frontmatter**:
```yaml
---
title: "7 Most Common CAM Overcharges (And How to Catch Them)"
description: "The seven CAM overcharges tenants encounter most often — capital expense misclassification, gross-up errors, admin fee double-billing, and more — with detection methods and dollar impact estimates."
excerpt: "The seven CAM overcharges tenants encounter most often — capital expense misclassification, gross-up errors, admin fee double-billing, and more — with detection methods and dollar impact estimates."
datePublished: "2026-03-01"
dateModified: "2026-03-01"
author: "Angel Campa"
category: "cam-errors"
faq:
  - q: "What is the most common CAM overcharge?"
    a: "Capital expense misclassification is the most common and highest-dollar CAM overcharge. A full roof replacement or HVAC system billed as an operating expense instead of a capital improvement can add $50,000 or more to the CAM pool in a single year. Most leases explicitly exclude capital improvements from CAM."
  - q: "How do I know if I'm being overcharged on CAM?"
    a: "Compare your reconciliation statement against your lease terms. Check that excluded expenses are not in the pool, your pro-rata share matches your lease, any caps are applied correctly, and the gross-up factor is reasonable given building occupancy. A year-over-year increase that exceeds your lease cap is the most obvious signal."
  - q: "Can a landlord charge tenants for capital improvements through CAM?"
    a: "Generally no, unless your lease specifically allows it. Most triple net leases exclude capital improvements from operating expenses. Some leases allow amortization of capital improvements over their useful life — meaning the landlord can pass through a portion each year rather than the full cost."
  - q: "What is a typical CAM audit recovery for tenants?"
    a: "Industry data shows tenant auditors typically recover 15-20% of billed CAM charges when material errors are found. On a $50,000 annual CAM bill, that represents $7,500 to $10,000 in potential overcharges."
  - q: "How far back can I audit CAM charges?"
    a: "Most commercial leases allow audits going back 12 to 36 months from when the reconciliation statement was delivered. Some leases have shorter windows. Check your lease's audit rights clause for the specific deadline — once it passes, you typically lose the right to challenge that year's charges."
---
```

**Content Outline**:

```
Opening paragraph (40-60 word definition block):
CAM overcharges are billing errors in Common Area Maintenance reconciliation statements
that cause tenants to pay more than their lease requires... [self-contained definition]

<Alert type="info" title="Quick Answer">
Seven overcharges account for most tenant recoveries: capital expense misclassification,
gross-up applied at full occupancy, admin fee double-billing, non-CAM expenses in the pool,
cap violations, pro-rata share miscalculation, and base year manipulation.
</Alert>

<StatGrid stats={[
  { value: "40%", caption: "CAM reconciliations with material errors" },
  { value: "15-20%", caption: "Typical recovery rate when errors are found" },
  { value: "$7,500-$10K", caption: "Average recovery on a $50K annual CAM bill" }
]} />

## 1. Capital Expense Misclassification
- Definition: CapEx billed as OpEx
- Common examples: roof replacement, HVAC system, parking lot repaving
- Dollar impact: $20K-$100K+ per incident
- How to catch: look for single large line items, compare against prior years
- Lease clause to check: exclusions section

## 2. Gross-Up Applied When Building Is at Target Occupancy
- How gross-up works (brief recap)
- The error: factor > 1.0 when actual occupancy >= target
- Dollar impact: 3-10% overcharge on variable expenses
- How to catch: request occupancy data, calculate factor yourself

## 3. Admin Fee Double-Billing
- Management fee as percentage + direct management staff salaries in pool
- Dollar impact: 10-15% on affected expenses
- How to catch: look for both a percentage fee line and management salary line items

## 4. Non-CAM Expenses Included in the Pool
- Examples: landlord legal fees, leasing commissions, above-standard TI
- Lease exclusions vs. actual statement line items
- How to catch: compare every line item category against lease exclusion list

## 5. Cap Violations
- Annual cap exceeded without disclosure
- Cumulative cap bank miscalculated
- Dollar impact: varies by cap rate and expense growth
- How to catch: calculate year-over-year growth, compare against lease cap

## 6. Pro-Rata Share Miscalculation
- RSF changed without re-measurement notice
- Denominator changed (building re-measured, anchor vacated)
- Dollar impact: proportional to the share error
- How to catch: verify your SF and building total SF against lease

## 7. Base Year Manipulation
- Base year set during anomaly (high vacancy, major repair year)
- Artificially low floor inflates every subsequent year's charges
- Dollar impact: compounds annually
- How to catch: compare base year expenses to market norms

## What to Do If You Find an Overcharge
- Step 1: Document the specific discrepancy
- Step 2: Reference your lease clause
- Step 3: Send written notice within audit window
- Step 4: Request supporting documentation
- Step 5: Escalate or audit if unresolved

<FAQSection items={faq} />

<CTABox
  title="Think You're Being Overcharged on CAM?"
  description="Upload your reconciliation statement and lease. CapVeri checks all seven overcharge categories and shows you the exact dollar impact."
  buttonText="Check My CAM Charges"
  utmContent="blog_cam_overcharges_cta"
/>

## Sources
[CitationChip references + SourcesSection]
```

### Blog Index Page (`app/blog/page.tsx`)

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/content/mdx";

export const metadata: Metadata = {
  title: "CAM Audit Blog | Tenant Guides & Resources | CapVeri",
  description:
    "Guides for commercial tenants on CAM reconciliation, common overcharges, audit rights, and how to verify your landlord's charges.",
  alternates: {
    canonical: "https://tenant.capveri.com/blog",
  },
};

export default async function BlogIndex() {
  const posts = await getAllPosts();

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">CAM Audit Blog</h1>
      <p className="text-muted-foreground mb-8">
        Guides for commercial tenants on CAM reconciliation, overcharges, and audit rights.
      </p>
      <div className="space-y-8">
        {posts.map((post) => (
          <article key={post.slug} className="border-b pb-6">
            <Link href={`/blog/${post.slug}`}>
              <h2 className="text-xl font-semibold hover:text-primary">
                {post.title}
              </h2>
            </Link>
            <p className="text-sm text-muted-foreground mt-1">
              {post.datePublished} &middot; {post.category}
            </p>
            <p className="mt-2">{post.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
```

## Test Cases
- Blog index page renders at `/blog` with both posts listed
- Post 1 renders at `/blog/cam-reconciliation-guide` with correct title and content
- Post 2 renders at `/blog/common-cam-overcharges` with correct title and content
- Each post page includes 3 JSON-LD script tags (Article, FAQPage, BreadcrumbList)
- Article schema `headline` matches post title from frontmatter
- Article schema `datePublished` is a valid ISO 8601 date
- BreadcrumbList has 3 items: Home, Blog, Post Title
- FAQPage schema `mainEntity` length matches frontmatter FAQ count
- `<FAQSection>` renders all FAQ items with correct question/answer text
- `<CTABox>` renders with correct `buttonText` and `utmContent`
- First paragraph of each post is 40-60 words (definition block)
- H2 headings contain target keyword variations
- `<CitationChip>` references resolve to entries in `<SourcesSection>`
- Blog index shows posts sorted by `datePublished` descending
- Each post has a valid canonical URL in metadata

## Definition of Done
- [ ] Blog index page renders at `/blog` listing both posts
- [ ] Post 1 MDX file created with full content (not placeholder)
- [ ] Post 2 MDX file created with full content (not placeholder)
- [ ] Both posts include FAQSection, CitationChip, SourcesSection, CTABox components
- [ ] Both posts include Article + FAQPage + BreadcrumbList JSON-LD
- [ ] First paragraph of each post is a self-contained 40-60 word definition
- [ ] All H2/H3 headings match query patterns for target keywords
- [ ] Blog post layout handles MDX rendering and frontmatter parsing
- [ ] `npm run typecheck` passes with zero errors
- [ ] All blog-related tests pass
