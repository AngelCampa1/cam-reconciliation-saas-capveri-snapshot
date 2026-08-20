# Tenant CAM Audit — Design

> Last updated: 2026-02-28

## Overview

The tenant CAM audit product at capveri.com lets commercial tenants upload their lease and CAM reconciliation statement, pay a one-time fee, and receive a PDF report showing whether their landlord's math is correct. The product flow is a 6-step wizard: land → upload → details → pay → process → report.

---

## Product Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Landing │───▶│  Upload  │───▶│ Details  │───▶│ Checkout │───▶│Processing│───▶│  Report  │
│   Page   │    │  Files   │    │  Form    │    │ (Stripe) │    │  Status  │    │  Viewer  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │                                                                              │
     │                         ┌──────────┐                                         │
     └────────────────────────▶│  Blog /  │◀────────────────────────────────────────┘
                               │ Content  │   (SEO pages drive traffic to wizard)
                               └──────────┘
```

### Step-by-step

1. **Landing page** — value prop, social proof, CTA "Audit My CAM Charges"
2. **Upload files** — drag-and-drop for lease PDF + CAM reconciliation statement PDF
3. **Details form** — email, property name, tenant name, suite number, tier selection
4. **Checkout** — Stripe hosted checkout (one-time payment)
5. **Processing** — real-time status page with progress indicators (extracting → calculating → generating report)
6. **Report** — in-browser HTML report + PDF download link, emailed to tenant

---

## UX Wireframes

### Landing Page

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo: CapVeri]                    [How It Works] [Pricing]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│     Is Your Landlord Overcharging You?                          │
│     40% of CAM reconciliations have material errors.            │
│     Upload your lease + CAM statement. We'll check the math.   │
│                                                                 │
│     [Audit My CAM Charges →]                                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  HOW IT WORKS                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 1.Upload │  │ 2. Pay   │  │ 3. We    │  │ 4. Get   │       │
│  │ your     │  │ one-time │  │ verify   │  │ your     │       │
│  │ docs     │  │ fee      │  │ the math │  │ report   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
├─────────────────────────────────────────────────────────────────┤
│  WHAT WE CHECK                                                  │
│  ☑ Pro-rata share calculation     ☑ Gross-up accuracy           │
│  ☑ Cap enforcement                ☑ Base year stops             │
│  ☑ Admin fee compliance           ☑ Excluded expense categories │
│  ☑ Occupancy adjustments          ☑ Capital vs. operating split │
├─────────────────────────────────────────────────────────────────┤
│  PRICING                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Standard    │  │  Detailed    │  │  Expert      │         │
│  │  $49         │  │  $99         │  │  $199        │         │
│  │  Math check  │  │  + line-item │  │  + dispute   │         │
│  │  + summary   │  │  analysis    │  │  letter draft│         │
│  │  [Start →]   │  │  [Start →]   │  │  [Start →]   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│  FAQ                                                            │
│  ▸ What documents do I need?                                    │
│  ▸ How long does it take?                                       │
│  ▸ What if no errors are found?                                 │
│  ▸ Is my data secure?                                           │
├─────────────────────────────────────────────────────────────────┤
│  [Logo]  [Terms] [Privacy] [Contact]        © 2026 CapVeri    │
└─────────────────────────────────────────────────────────────────┘
```

### Upload Step

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1 of 4: Upload Documents                                  │
│  ─────────────────────────────────────────                      │
│  ● Upload  ○ Details  ○ Pay  ○ Processing                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────┐                              │
│  │                               │                              │
│  │   📄 Lease Agreement          │                              │
│  │                               │                              │
│  │   Drag & drop your lease PDF  │                              │
│  │   or [browse files]           │                              │
│  │                               │                              │
│  │   ✓ lease-acme-2024.pdf       │  (after upload)              │
│  │     2.4 MB                    │                              │
│  └───────────────────────────────┘                              │
│                                                                 │
│  ┌───────────────────────────────┐                              │
│  │                               │                              │
│  │   📄 CAM Reconciliation       │                              │
│  │      Statement                │                              │
│  │                               │                              │
│  │   Drag & drop your CAM        │                              │
│  │   statement PDF               │                              │
│  │   or [browse files]           │                              │
│  └───────────────────────────────┘                              │
│                                                                 │
│  What's a CAM reconciliation statement? [Learn more]            │
│                                                                 │
│                                      [Continue →]               │
└─────────────────────────────────────────────────────────────────┘
```

### Details Step

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 2 of 4: Audit Details                                     │
│  ─────────────────────────────────────────                      │
│  ○ Upload  ● Details  ○ Pay  ○ Processing                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Email *          [________________________]                    │
│  (We'll send your report here)                                  │
│                                                                 │
│  Property Name    [________________________]                    │
│  Tenant Name      [________________________]                    │
│  Suite Number     [________________________]                    │
│                                                                 │
│  ── Select Your Plan ──────────────────────                     │
│                                                                 │
│  ○ Standard ($49)                                               │
│     Math verification + summary report                          │
│                                                                 │
│  ● Detailed ($99)  ← MOST POPULAR                              │
│     Line-item analysis + detailed report with citations         │
│                                                                 │
│  ○ Expert ($199)                                                │
│     Everything in Detailed + dispute letter draft                │
│                                                                 │
│                              [← Back]  [Continue to Payment →]  │
└─────────────────────────────────────────────────────────────────┘
```

### Processing Step

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 4 of 4: Processing Your Audit                             │
│  ─────────────────────────────────────────                      │
│  ○ Upload  ○ Details  ○ Pay  ● Processing                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  We're verifying your CAM charges now.                          │
│  This usually takes 2-5 minutes.                                │
│                                                                 │
│  ✓ Payment received                                             │
│  ✓ Extracting lease terms                                       │
│  ✓ Extracting CAM statement                                     │
│  ● Calculating correct amounts...                               │
│  ○ Generating report                                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────┐           │
│  │  ████████████████████░░░░░░░░░░  65%             │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                 │
│  We'll email your report to tenant@acme.com                     │
│  when it's ready. You can also wait here.                       │
│                                                                 │
│  Bookmark this page to check back anytime:                      │
│  capveri.com/audit/abc123-def456                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Report Viewer

```
┌─────────────────────────────────────────────────────────────────┐
│  CAM Audit Report — Galleria Tower III                          │
│  Tenant: Acme Corp | Suite 450 | Audit Date: Feb 28, 2026      │
│                                                     [Download PDF]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SUMMARY                                                │    │
│  │                                                         │    │
│  │  Total Overcharge Found:  $4,287.33                     │    │
│  │  Discrepancies:           3 of 8 categories             │    │
│  │  Confidence:              High (92%)                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  DETAILED FINDINGS                                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Category          │ Landlord │ Correct  │ Difference   │    │
│  │───────────────────│──────────│──────────│──────────────│    │
│  │ Gross-Up          │ $12,450  │ $11,230  │ -$1,220  ⚠  │    │
│  │ CAM Cap           │ $45,200  │ $42,130  │ -$3,070  ⚠  │    │
│  │ Pro-Rata Share    │ 12.5%    │ 12.5%    │ $0       ✓  │    │
│  │ Admin Fee         │ $6,780   │ $6,783   │ +$3      ✓  │    │
│  │ Base Year Stop    │ N/A      │ N/A      │ $0       ✓  │    │
│  │ Excl. Expenses    │ $0       │ $0       │ $0       ✓  │    │
│  │ Occupancy Adj.    │ $38,900  │ $38,900  │ $0       ✓  │    │
│  │ Capital/Operating │ $0       │ $0       │ $0       ✓  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  DISCREPANCY #1: Gross-Up Calculation                           │
│  ───────────────────────────────────                            │
│  Your landlord applied a gross-up factor of 1.33x to all       │
│  expense categories. Per your lease (Section 8.2), gross-up    │
│  should only apply to variable expenses (janitorial, utilities)│
│  at a target occupancy of 95%. The correct factor for variable │
│  expenses is 1.27x. Fixed expenses (taxes, insurance) should   │
│  not be grossed up.                                            │
│  Impact: $1,220 overcharge                                      │
│                                                                 │
│  (... more discrepancies ...)                                   │
│                                                                 │
│  NEXT STEPS                                                     │
│  1. Share this report with your property manager                │
│  2. Reference specific lease sections cited in each finding     │
│  3. Request a revised reconciliation statement                  │
│  [Expert tier: Dispute letter draft included below]             │
│                                                                 │
│  ── Methodology ──                                              │
│  This audit was performed by CapVeri's automated verification  │
│  engine. Lease terms were extracted via OCR + AI with human-    │
│  grade accuracy. All calculations use deterministic financial   │
│  math (no AI for numbers). Confidence scores reflect extraction │
│  certainty — calculations themselves are exact.                 │
│                                                                 │
│  ── Disclaimer ──                                               │
│  This report is for informational purposes only and does not    │
│  constitute legal or financial advice. ...                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## PDF Report Design

### Report Sections

| Section | Description | All Tiers | Detailed+ | Expert Only |
|---------|-------------|:---------:|:---------:|:-----------:|
| **Executive Summary** | Total overcharge, discrepancy count, confidence | Yes | Yes | Yes |
| **Lease Terms Summary** | Extracted lease terms used in calculations | Yes | Yes | Yes |
| **CAM Statement Summary** | What the landlord charged | Yes | Yes | Yes |
| **Discrepancy Table** | Category-by-category comparison | Yes | Yes | Yes |
| **Detailed Findings** | Per-discrepancy explanation with lease citations | - | Yes | Yes |
| **Calculation Trace** | Step-by-step math showing correct amounts | - | Yes | Yes |
| **Confidence Report** | Per-field extraction confidence scores | - | Yes | Yes |
| **Dispute Letter Draft** | Template letter to landlord with findings | - | - | Yes |
| **Methodology** | How the audit was performed | Yes | Yes | Yes |
| **Disclaimer** | Legal disclaimer | Yes | Yes | Yes |

### PDF Layout

- **Paper**: Letter (8.5" x 11"), portrait
- **Header**: CapVeri logo, audit date, property name
- **Footer**: Page numbers, "Generated by CapVeri"
- **Colors**: Brand palette from design-tokens.json
- **Typography**: Inter (body), monospace for numbers/calculations
- **Tables**: Alternating row colors, right-aligned numbers
- **Charts**: None in v1 (keeps ReportLab complexity low)

---

## Pricing Tiers

| | Standard | Detailed | Expert |
|--|----------|----------|--------|
| **Price** | $49 | $99 | $199 |
| **Tagline** | "Quick math check" | "Full analysis" | "Dispute-ready" |
| **Includes** | | | |
| Math verification | Yes | Yes | Yes |
| Summary report | Yes | Yes | Yes |
| Discrepancy table | Yes | Yes | Yes |
| Line-item analysis | - | Yes | Yes |
| Calculation trace | - | Yes | Yes |
| Confidence scoring | - | Yes | Yes |
| Dispute letter draft | - | - | Yes |
| **Target buyer** | Curious tenant | Tenant with suspicion | Tenant ready to dispute |
| **Expected mix** | 20% | 55% | 25% |

### Pricing Rationale

- Traditional CAM audit firms charge $5,000–$15,000+ or 33% of recovery on contingency
- Even the Expert tier at $199 is 97% cheaper than traditional audits
- The Detailed tier at $99 is the sweet spot: enough value to justify the price, low enough that tenants don't need approval from anyone
- Average overcharge found: ~$4,200/year (based on product-marketing-context proof points)
- ROI for tenant: $4,200 recovery / $99 cost = 42x return

---

## Landing Page Messaging

### Headline Options (A/B test)

1. "Is Your Landlord Overcharging You?" (problem-aware)
2. "Verify Your CAM Charges in Minutes" (solution-aware)
3. "40% of CAM Reconciliations Have Errors. Is Yours One?" (stat-led)

### Proof-Promise-Plan Framework

**Proof**: "40% of CAM reconciliations contain material errors. The average commercial tenant overpays $4,200/year in CAM charges."

**Promise**: "Upload your lease and CAM statement. We'll verify every calculation — pro-rata share, gross-up, caps, admin fees, exclusions — and tell you exactly where the math doesn't add up."

**Plan**:
1. Upload your lease + CAM reconciliation statement
2. Pay a one-time fee ($49–$199)
3. Get your audit report in minutes

### Key Objection Handling

| Objection | Response |
|-----------|----------|
| "I don't know if I'm being overcharged" | "That's exactly why this exists. 40% of reconciliations have errors." |
| "Traditional audits cost thousands" | "We automated the math. Same verification, 97% less cost." |
| "What if no errors are found?" | "Then you have peace of mind. The report confirms your charges are correct." |
| "Is this legally valid?" | "The report shows the math. Your attorney can use it as evidence in a dispute." |
| "Can I trust AI with my lease?" | "AI extracts text. All financial calculations are deterministic math — no AI involved in the numbers." |

---

## SEO Strategy

### Primary Keywords

| Keyword | Monthly Volume | Difficulty | Intent | Priority |
|---------|:-------------:|:----------:|--------|:--------:|
| CAM audit | 720 | Medium | Commercial | P0 |
| CAM reconciliation | 590 | Medium | Informational/Commercial | P0 |
| common area maintenance audit | 320 | Low | Commercial | P0 |
| CAM charges audit | 210 | Low | Commercial | P1 |
| tenant CAM audit | 170 | Low | Commercial | P1 |
| CAM overcharges | 140 | Low | Problem-aware | P1 |
| how to audit CAM charges | 110 | Low | Informational | P2 |
| CAM reconciliation errors | 90 | Low | Problem-aware | P2 |
| triple net lease audit | 260 | Medium | Commercial | P1 |
| NNN lease CAM charges | 180 | Low | Informational | P2 |
| commercial lease audit | 480 | Medium | Commercial | P0 |
| lease audit services | 390 | Medium | Commercial | P0 |

### Page-Level SEO Plan

| URL | Target Keyword | Page Type | Title Tag |
|-----|---------------|-----------|-----------|
| `/` | CAM audit | Landing | CAM Audit for Commercial Tenants - Verify Your Charges |
| `/how-it-works` | how to audit CAM charges | Explainer | How to Audit Your CAM Charges in 3 Steps |
| `/pricing` | CAM audit cost | Pricing | CAM Audit Pricing - From $49 per Audit |
| `/blog/what-is-cam-reconciliation` | CAM reconciliation | Blog | What Is CAM Reconciliation? A Tenant's Guide |
| `/blog/cam-overcharges-common-errors` | CAM overcharges | Blog | 7 Most Common CAM Overcharges (And How to Catch Them) |
| `/blog/tenant-rights-cam-audit` | tenant CAM audit rights | Blog | Your Rights as a Tenant: When and How to Audit CAM Charges |
| `/blog/triple-net-lease-cam` | triple net lease CAM | Blog | Understanding CAM Charges in Triple Net (NNN) Leases |
| `/blog/cam-reconciliation-checklist` | CAM reconciliation checklist | Blog | CAM Reconciliation Checklist: 12 Items to Verify |
| `/vs/traditional-auditors` | CAM audit vs auditor | Comparison | CapVeri vs. Traditional CAM Audit Firms |
| `/glossary` | CAM terms | Reference | CAM Glossary: Common Area Maintenance Terms Explained |
| `/sample-report` | CAM audit report | Trust | Sample CAM Audit Report |
| `/tools/cam-overcharge-calculator` | CAM overcharge calculator | Tool | Free CAM Overcharge Calculator |

### Content Strategy

**Phase 1 (Launch):** Landing page, how-it-works, pricing, sample report, 2 blog posts
**Phase 2 (Month 2-3):** 4 blog posts targeting long-tail keywords, comparison page, glossary
**Phase 3 (Month 4-6):** Free tool (CAM overcharge calculator), 4 more blog posts, guest posts

### Technical SEO

- Server-side rendered (Next.js App Router)
- Sitemap.xml auto-generated
- robots.txt allows all AI bots (GPTBot, PerplexityBot, ClaudeBot, Google-Extended)
- Canonical URLs on all pages
- Open Graph + Twitter Card meta tags
- Inter-page internal linking strategy

---

## AI-SEO Strategy

### Goal

Get capveri.com cited when AI systems answer queries like:
- "How do I audit my CAM charges?"
- "What is a CAM reconciliation?"
- "How much does a CAM audit cost?"
- "Common CAM overcharges in commercial leases"
- "Best CAM audit services for tenants"

### Content Structure for AI Extractability

Every content page follows these patterns:

1. **Definition block** in first paragraph (40-60 words, self-contained answer)
2. **H2/H3 headings that match query patterns** (e.g., "What is CAM reconciliation?" not "About reconciliation")
3. **Comparison tables** for evaluation queries (us vs. traditional, tier comparison)
4. **FAQ sections** with natural-language questions at bottom of every page
5. **Statistics with citations** — every claim backed by a source with date
6. **Step-by-step numbered lists** for process content

### Schema Markup Plan

| Page | Schema Types |
|------|-------------|
| Landing page | `WebApplication`, `Service`, `FAQPage`, `Organization` |
| Pricing | `Product` (one per tier), `FAQPage` |
| Blog posts | `Article`, `FAQPage`, `BreadcrumbList` |
| How it works | `HowTo`, `FAQPage` |
| Comparison page | `ItemList`, `FAQPage` |
| Sample report | `CreativeWork`, `FAQPage` |
| Glossary | `DefinedTermSet` |
| Free tool | `WebApplication`, `FAQPage` |

### Authority Building

1. **Original data** — publish quarterly "State of CAM Charges" reports using anonymized aggregate data from audits performed
2. **Expert attribution** — author bios with CRE credentials on all blog posts
3. **Citation-worthy stats** — format key stats as extractable blocks:
   - "40% of CAM reconciliations contain material errors" (Source: Tango Analytics, 2023)
   - "The average commercial tenant overpays $4,200/year in CAM charges"
   - "Traditional CAM audit firms charge $5,000–$15,000 per audit"
4. **Third-party presence** — contribute to CRE subreddits, answer Quora questions, seek mentions in industry publications

### AI Bot Access

```
# robots.txt — allow all AI crawlers
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /
```

### Content Patterns for AI Citation

Each blog post uses `CitationChip` and `SourcesSection` components (already built in marketing/) to ensure every claim has a verifiable source. This aligns with the Princeton GEO research finding that cited sources boost AI visibility by 40%.

Example extractable block:

```markdown
## How Much Does a CAM Audit Cost?

A traditional CAM audit from a consulting firm typically costs $5,000–$15,000 per
property, or 33% of any savings recovered on a contingency basis
(Source: National Lease Advisors, 2024). Automated CAM audit services like
CapVeri offer the same mathematical verification starting at $49 per audit —
a 97% cost reduction compared to traditional audit firms.
```

This block is:
- Self-contained (works without surrounding context)
- Specific (dollar amounts, percentages)
- Sourced (named source with date)
- Answering a real query ("how much does a CAM audit cost")
- 60 words (optimal extraction length)

---

## Competitive Positioning

### vs. Traditional CAM Audit Firms

| | Traditional Firm | CapVeri |
|--|-----------------|-------------|
| Cost | $5,000–$15,000 | $49–$199 |
| Timeline | 4–8 weeks | Minutes |
| Minimum lease size | $50K+ annual CAM | None |
| Contingency model | 33% of recovery | No contingency — flat fee |
| Scope | Manual review | Automated math verification |
| Expert review | CPA/consultant reviews | AI extraction + deterministic math |
| Dispute letter | Included | Expert tier only |
| Ideal for | Large portfolios, complex disputes | Any tenant wanting quick verification |

### vs. DIY (Spreadsheet)

| | DIY Spreadsheet | CapVeri |
|--|----------------|-------------|
| Time | Hours to days | Minutes |
| Expertise needed | CRE accounting knowledge | None |
| Error risk | High (manual calculations) | None (automated engine) |
| Lease term extraction | Manual reading | Automated OCR + AI |
| Cost | "Free" (but your time) | $49–$199 |
| Credibility | Self-prepared | Third-party verification |
