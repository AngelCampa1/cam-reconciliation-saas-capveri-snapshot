# Story T6.3: Comparison and Glossary Pages

## Story Info
- **Epic**: T6 -- Content & SEO
- **Estimated Hours**: 10
- **Dependencies**: T4.1 (scaffold), T4.3 (nav and footer), T6.1 (schema markup helpers)
- **Status**: `pending`

## User Story
As a commercial tenant evaluating whether to hire a traditional auditor or use an automated tool, I want a fair comparison of CapVeri vs. traditional CAM auditors so that I can make an informed decision. As a tenant unfamiliar with CRE terminology, I want a glossary of CAM terms so that I can understand my reconciliation statement.

## Acceptance Criteria
- Comparison page renders at `/vs/traditional-auditors` with a structured comparison table
- Comparison page includes ItemList + FAQPage JSON-LD
- Comparison is fair and balanced -- acknowledges where traditional auditors are better
- Glossary page renders at `/glossary` with all CAM terms
- Glossary page includes DefinedTermSet JSON-LD
- Each glossary term is linkable via anchor (e.g., `/glossary#pro-rata-share`)
- Both pages include FAQ sections
- Both pages are linked from the site navigation

## Technical Specifications

### Comparison Page (`app/vs/traditional-auditors/page.tsx`)

**URL**: `/vs/traditional-auditors`

**JSON-LD (ItemList + FAQPage)**:

```typescript
const COMPARISON_SCHEMAS = [
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CAM Audit Methods Comparison",
    description:
      "Comparison of automated CAM audit (CapVeri) vs. traditional CPA-led CAM audit for commercial tenants.",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "CapVeri (Automated)",
        description:
          "AI-powered CAM reconciliation audit. Upload documents, receive report in 24-48 hours. $49-$199 per audit.",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Traditional CPA Audit",
        description:
          "Manual review by a CPA or forensic accountant. On-site document review, 4-12 week turnaround. $5,000-$25,000+ per engagement.",
      },
    ],
  },
  buildFAQPageSchema(COMPARISON_FAQS),
];
```

**Comparison Table Structure**:

```tsx
interface ComparisonRow {
  category: string;
  capveri: string;
  traditional: string;
  winner: "capveri" | "traditional" | "tie";
}

const COMPARISON_DATA: ComparisonRow[] = [
  {
    category: "Cost",
    capveri: "$49 - $199 per audit",
    traditional: "$5,000 - $25,000+ per engagement",
    winner: "capveri",
  },
  {
    category: "Turnaround time",
    capveri: "24 - 48 hours",
    traditional: "4 - 12 weeks",
    winner: "capveri",
  },
  {
    category: "Checks performed",
    capveri:
      "8 automated checks: pro-rata, gross-up, caps, admin fees, exclusions, occupancy, CapEx/OpEx, base year",
    traditional:
      "Comprehensive manual review of all charges, invoices, and contracts",
    winner: "traditional",
  },
  {
    category: "Document access",
    capveri: "Works from reconciliation statement + lease only",
    traditional:
      "Can request and review underlying invoices, contracts, GL detail",
    winner: "traditional",
  },
  {
    category: "Legal weight",
    capveri:
      "Expert tier includes CPA-signed letter with lease clause citations",
    traditional: "CPA-signed report, expert witness testimony available",
    winner: "traditional",
  },
  {
    category: "Accessibility",
    capveri: "Any tenant, any lease size — no minimum",
    traditional: "Typically requires $100K+ annual CAM to justify cost",
    winner: "capveri",
  },
  {
    category: "Repeat audits",
    capveri: "Run each year for $49-$199 — easy annual check",
    traditional: "Full re-engagement at $5K+ each time",
    winner: "capveri",
  },
  {
    category: "Dispute support",
    capveri:
      "Expert tier: dispute language + lease clause citations. No negotiation.",
    traditional: "Full dispute support, negotiation, landlord correspondence",
    winner: "traditional",
  },
  {
    category: "Best for",
    capveri:
      "Annual screening, smaller leases, quick verification, first-pass before hiring a CPA",
    traditional:
      "Large leases ($500K+ CAM), complex portfolios, active litigation, formal disputes",
    winner: "tie",
  },
];
```

**Page Content Outline**:

```
<h1>CapVeri vs. Traditional CAM Auditors</h1>

Opening paragraph (definition block):
A CAM audit is an independent review of a landlord's Common Area Maintenance
reconciliation statement to verify that charges comply with the lease terms...

## Side-by-Side Comparison
[Comparison table rendered from COMPARISON_DATA]

## When CapVeri Is the Better Choice
- Annual screening for any lease size
- Quick verification before committing to a full audit
- Leases under $100K annual CAM (where traditional audit cost is disproportionate)
- Multi-property tenants who need to check every location every year

## When a Traditional Auditor Is the Better Choice
- Active litigation or formal dispute requiring expert witness
- Complex multi-building or portfolio leases
- Need for on-site invoice review
- Annual CAM over $500K where recovery potential justifies the cost

## Using Both Together
- Use CapVeri as a first-pass screen ($49-$199)
- If material errors found, hire a traditional auditor for the full engagement
- CapVeri's Expert tier report provides the evidence needed to justify the traditional audit cost

<FAQSection items={COMPARISON_FAQS} />

<CTABox
  title="Start with an Automated Check"
  description="Run a CapVeri first. If we find material errors, you'll have the evidence to justify a full traditional audit."
  buttonText="Audit My CAM Charges"
  utmContent="vs_traditional_cta"
/>
```

**FAQ Items**:

```typescript
const COMPARISON_FAQS = [
  {
    question: "Is an automated CAM audit as thorough as a traditional CPA audit?",
    answer:
      "No. A traditional CPA audit reviews underlying invoices, contracts, and GL detail that an automated tool cannot access. CapVeri checks 8 specific calculation and classification categories using the reconciliation statement and lease. It catches the most common errors but cannot verify vendor pricing or contract compliance.",
  },
  {
    question: "Can I use CapVeri instead of hiring a CPA?",
    answer:
      "For annual screening and smaller leases, yes. For leases with $500K+ in annual CAM, active disputes, or litigation, a traditional auditor provides deeper analysis and legal credibility. Many tenants use CapVeri as a first-pass screen and hire a CPA only when material errors are found.",
  },
  {
    question: "Will a landlord accept a CapVeri report in a dispute?",
    answer:
      "The Expert tier includes a CPA-signed letter with lease clause citations and dispute language. For formal disputes, this carries more weight than the Standard or Detailed reports. For litigation, a traditional auditor who can serve as an expert witness is typically required.",
  },
  {
    question: "How does CapVeri pricing compare to traditional audit fees?",
    answer:
      "CapVeri costs $49-$199 per audit, one-time. Traditional CPA-led CAM audits typically cost $5,000-$25,000+ per engagement. The cost difference makes CapVeri viable for annual checks on any lease size, while traditional audits are usually reserved for large leases where recovery potential exceeds the audit cost.",
  },
];
```

### Glossary Page (`app/glossary/page.tsx`)

**URL**: `/glossary`

**JSON-LD (DefinedTermSet)**:

```typescript
interface GlossaryTerm {
  term: string;
  slug: string;
  definition: string;
}

const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    term: "Base Year",
    slug: "base-year",
    definition:
      "The first year of a lease used as the benchmark for CAM expenses. Tenants pay only the increase above the base year amount in subsequent years. If the base year had abnormally low expenses (due to vacancy or construction), every future year looks like a large increase.",
  },
  {
    term: "BOMA Standards",
    slug: "boma-standards",
    definition:
      "Measurement standards published by the Building Owners and Managers Association (BOMA) that define how rentable square footage is calculated. BOMA standards determine the denominator in pro-rata share calculations and affect every tenant's CAM bill.",
  },
  {
    term: "CAM (Common Area Maintenance)",
    slug: "cam",
    definition:
      "Operating expenses for shared spaces in a commercial property — lobbies, hallways, parking lots, landscaping, elevators, and restrooms. Tenants pay a pro-rata share of CAM based on their leased square footage relative to the building's total rentable area.",
  },
  {
    term: "CAM Cap",
    slug: "cam-cap",
    definition:
      "A lease clause limiting the annual increase in CAM charges. A 5% non-cumulative cap means charges cannot grow more than 5% year-over-year. A cumulative cap banks unused capacity for future years.",
  },
  {
    term: "CAM Reconciliation",
    slug: "cam-reconciliation",
    definition:
      "The annual process where a landlord compares estimated CAM charges collected during the year against actual expenses incurred. The difference results in either a credit to the tenant or an additional charge.",
  },
  {
    term: "Capital Expense (CapEx)",
    slug: "capex",
    definition:
      "A large expenditure that improves or extends the life of a building asset — roof replacement, HVAC system, parking lot repaving. Most leases exclude capital expenses from CAM. Misclassifying CapEx as operating expense is the highest-dollar CAM overcharge category.",
  },
  {
    term: "Controllable Expenses",
    slug: "controllable-expenses",
    definition:
      "Operating expenses the landlord can influence through management decisions — janitorial, landscaping, security, maintenance contracts. Some leases cap controllable expenses separately from uncontrollable expenses like taxes and insurance.",
  },
  {
    term: "Cumulative Cap",
    slug: "cumulative-cap",
    definition:
      "A CAM cap that banks unused capacity from low-growth years. If the cap is 5% but expenses only grew 2%, the landlord banks 3%. In a future year with 8% growth, the landlord can draw from the bank to pass through more than the base cap percentage.",
  },
  {
    term: "Gross-Up",
    slug: "gross-up",
    definition:
      "An adjustment that normalizes variable operating expenses to a target occupancy level (typically 90-95%). Prevents tenants in a half-empty building from subsidizing vacant space. The formula: variable_expenses x (target_occupancy / actual_occupancy).",
  },
  {
    term: "Management Fee",
    slug: "management-fee",
    definition:
      "A fee (typically 3-6% of collected rents or a flat fee) charged by the property manager for administering common areas. Usually included in the CAM pool. Double-billing occurs when the percentage fee is charged alongside direct management staff salaries already in the pool.",
  },
  {
    term: "NNN (Triple Net) Lease",
    slug: "nnn-lease",
    definition:
      "A lease structure where the tenant pays base rent plus their pro-rata share of three categories of operating expenses: property taxes, insurance, and CAM. The most common commercial lease type. Tenants bear the risk of expense increases.",
  },
  {
    term: "Non-Cumulative Cap",
    slug: "non-cumulative-cap",
    definition:
      "A CAM cap that limits year-over-year growth without banking unused capacity. A 5% non-cumulative cap means charges cannot grow more than 5% over the prior year, period. Any unused cap capacity is lost.",
  },
  {
    term: "Operating Expense (OpEx)",
    slug: "opex",
    definition:
      "Day-to-day costs of running a commercial property — utilities, janitorial, landscaping, repairs, security, management fees. Operating expenses are recoverable through CAM. Distinguished from capital expenses, which improve or extend asset life.",
  },
  {
    term: "Pro-Rata Share",
    slug: "pro-rata-share",
    definition:
      "A tenant's proportional share of building expenses, calculated as: tenant_rsf / building_total_rsf. A tenant leasing 5,000 SF in a 50,000 SF building has a 10% pro-rata share. Changes when the building is re-measured or an anchor tenant vacates.",
  },
  {
    term: "Reconciliation Statement",
    slug: "reconciliation-statement",
    definition:
      "The document a landlord sends tenants after year-end showing actual CAM expenses vs. estimated charges collected. Lists expense categories, the tenant's pro-rata share, adjustments (gross-up, caps), and the net amount owed or credited.",
  },
  {
    term: "Rentable Square Footage (RSF)",
    slug: "rsf",
    definition:
      "The total leasable area of a building as measured under BOMA standards, including the tenant's usable space plus a proportional allocation of common areas. RSF determines the denominator in pro-rata share calculations.",
  },
  {
    term: "Tenant Audit Rights",
    slug: "tenant-audit-rights",
    definition:
      "A lease clause granting the tenant the right to review the landlord's books and records supporting CAM charges. Typically allows 12-36 months from statement delivery to exercise. Some leases require the audit to be performed by a CPA.",
  },
];

// JSON-LD schema
const GLOSSARY_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: "CAM Glossary — Common Area Maintenance Terms for Tenants",
  description:
    "Definitions of Common Area Maintenance (CAM) terms that commercial tenants encounter in reconciliation statements and lease agreements.",
  url: "https://tenant.capveri.com/glossary",
  definedTerm: GLOSSARY_TERMS.map((t) => ({
    "@type": "DefinedTerm",
    name: t.term,
    description: t.definition,
    url: `https://tenant.capveri.com/glossary#${t.slug}`,
  })),
};
```

**Page Layout**:

```tsx
export default function GlossaryPage() {
  return (
    <>
      <JsonLd data={GLOSSARY_SCHEMA} />
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">CAM Glossary</h1>
        <p className="text-muted-foreground mb-8">
          Common Area Maintenance terms explained for commercial tenants.
        </p>

        {/* Alphabetical jump links */}
        <nav aria-label="Glossary navigation" className="mb-8 flex flex-wrap gap-2">
          {uniqueLetters.map((letter) => (
            <a key={letter} href={`#letter-${letter}`} className="text-primary hover:underline text-sm font-medium">
              {letter}
            </a>
          ))}
        </nav>

        {/* Terms grouped by first letter */}
        {groupedTerms.map(([letter, terms]) => (
          <section key={letter} id={`letter-${letter}`} className="mb-8">
            <h2 className="text-lg font-semibold border-b pb-1 mb-4">{letter}</h2>
            <dl className="space-y-6">
              {terms.map((t) => (
                <div key={t.slug} id={t.slug}>
                  <dt className="font-medium text-foreground">{t.term}</dt>
                  <dd className="mt-1 text-muted-foreground">{t.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <CTABox
          title="Understand Your CAM Statement"
          description="Upload your reconciliation statement and lease. CapVeri identifies errors and explains each finding in plain language."
          buttonText="Audit My CAM Charges"
          utmContent="glossary_cta"
        />
      </div>
    </>
  );
}
```

## Test Cases
- Comparison page renders at `/vs/traditional-auditors`
- Comparison table renders all 9 rows with correct `category`, `capveri`, and `traditional` values
- Winner indicator is shown for each row (visual badge or icon)
- "When a Traditional Auditor Is the Better Choice" section exists (fairness check)
- Comparison page includes ItemList + FAQPage JSON-LD
- ItemList schema has 2 `itemListElement` entries
- FAQPage schema has 4 `mainEntity` entries matching `COMPARISON_FAQS`
- Glossary page renders at `/glossary`
- All 17 glossary terms render with `<dt>` / `<dd>` markup
- Each term has a working anchor link (e.g., `/glossary#pro-rata-share`)
- Alphabetical jump navigation renders and links to correct letter sections
- DefinedTermSet JSON-LD includes all 17 `definedTerm` entries
- Each `definedTerm` has `name`, `description`, and `url` properties
- Glossary page metadata includes canonical URL
- Both pages include a `<CTABox>` component
- Both pages are accessible via navigation links

## Definition of Done
- [ ] Comparison page renders at `/vs/traditional-auditors`
- [ ] Comparison table has 9 rows covering all evaluation categories
- [ ] Comparison acknowledges where traditional auditors are superior (checks, legal weight, dispute support)
- [ ] "Using Both Together" section positions CapVeri as complementary, not replacement
- [ ] Comparison page includes ItemList + FAQPage JSON-LD
- [ ] Glossary page renders at `/glossary` with 17+ CAM terms
- [ ] Each glossary term has a linkable anchor
- [ ] Glossary includes DefinedTermSet JSON-LD
- [ ] Both pages are linked from site navigation
- [ ] `npm run typecheck` passes with zero errors
- [ ] All related tests pass
