import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "How to Detect CapEx in a GL Export Before It Becomes a CAM Dispute",
  description:
    "Landlords frequently miss capital expenditures in their GL exports before including them in CAM reconciliations. Here's what to look for and how to flag CapEx coding errors.",
  alternates: {
    canonical: `${SITE_URL}/resources/detect-capex-in-gl-export`,
  },
  openGraph: {
    title: "How to Detect CapEx in a GL Export Before It Becomes a CAM Dispute",
    description:
      "Capital expenditures coded to operating GL accounts are a leading cause of CAM overbilling. A detection checklist for your pre-reconciliation GL review.",
    url: `${SITE_URL}/resources/detect-capex-in-gl-export`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Why does CapEx appear in operating GL accounts?",
    answer:
      "Capital expenditures are coded to operating accounts for several reasons: rushed GL coding at month-end when a vendor invoice arrives without clear categorization, property manager discretion in distinguishing repair vs. replacement, ERP account code designs that co-mingle repair and replacement in a single account, and vendor invoices that straddle the repair/replace line (e.g., a partial roof replacement billed as a maintenance job). The result is CapEx that flows into the CAM pool and gets billed to tenants.",
  },
  {
    question: "What is the IRS useful-life test and how does it apply to CAM?",
    answer:
      "The IRS useful-life test classifies an expenditure as capital if the resulting asset has a useful life of one year or more. In CAM reconciliation, this test provides a practical bright line: if an item improves or replaces a building component and will provide benefit for more than 12 months, it is a capital expenditure that should not appear in the recoverable CAM pool (absent lease language authorizing amortized capital recovery). The IRS MACRS schedules provide specific useful-life classifications for common building systems.",
  },
  {
    question: "What dollar threshold triggers a CapEx review?",
    answer:
      "For CAM pre-reconciliation review purposes, a common screening threshold is $10,000 per transaction. Most operating maintenance tasks (filter replacement, light fixture repairs, routine pest control) come in well below this threshold. Single transactions above $10,000 in maintenance or repair accounts deserve manual review of the supporting invoice to verify whether the work is truly a repair (operating) or a replacement/improvement (capital). Some portfolios use $5,000 for higher-risk account codes.",
  },
  {
    question: "Can a pre-reconciliation GL review be automated?",
    answer:
      "Yes. The five detection signals - high-value transactions, capital-associated vendor names, description keywords, mixed-use account codes, and cumulative invoice patterns - can all be screened programmatically from a GL export. A rules-based screen applied before the reconciliation run identifies the line items that require manual review, significantly reducing the time it takes to verify the expense pool before sending reconciliation statements.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Detect CapEx in GL Export",
    url: `${SITE_URL}/resources/detect-capex-in-gl-export`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "How to Detect CapEx in a GL Export Before It Becomes a CAM Dispute",
  description:
    "Capital expenditures coded to operating GL accounts are a leading cause of CAM overbilling. A pre-reconciliation GL review checklist.",
  url: `${SITE_URL}/resources/detect-capex-in-gl-export`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1450,
});

const detectionSignals = [
  {
    number: "1",
    title: "High-value single transactions in maintenance or repair accounts",
    detail:
      "Any transaction above $10,000 in accounts coded as maintenance, repairs, or building services warrants a manual review of the supporting invoice. A $12,500 HVAC repair could be a large but legitimate service call, or it could be the first invoice on a phased equipment replacement that should be capitalized. Flag every transaction above this threshold and verify the underlying invoice before including the line in the reconciliation.",
  },
  {
    number: "2",
    title: "Contractor and vendor names associated with major building systems",
    detail:
      "Vendor names are a high-signal indicator. HVAC manufacturers and their authorized dealers (Carrier, Trane, Johnson Controls), roofing contractors, elevator maintenance companies (Otis, KONE, Schindler), and parking structure specialists rarely appear for routine operating maintenance. When these vendor names appear in operating GL accounts, the transaction almost always requires review. Build a standing list of capital-associated vendor names and screen every GL export against it.",
  },
  {
    number: "3",
    title:
      "Description keywords indicating replacement, installation, or construction",
    detail:
      'The invoice description field in a GL export is often the fastest classification signal. Keywords like"replacement,""install,""upgrade,""new,""construction,""retrofit," and"overhaul" in a transaction description indicate the work may be capital in nature. Contrast with operating descriptors like"service,""maintenance,""inspection,""repair," and"cleaning." A systematic keyword scan of the description field catches miscoded items that dollar-value thresholds alone miss.',
  },
  {
    number: "4",
    title: "GL accounts that mix repair and replacement",
    detail:
      'Older chart-of-accounts designs - common in Yardi and MRI implementations that pre-date FASB ASC 840 clarity - sometimes route both repair and replacement costs to the same GL account (e.g., a single"HVAC - Maintenance & Repair" account). When an account has historically received only small transactions and then receives a $75,000 entry in the current year, the account code alone does not distinguish operating from capital. These mixed-use accounts require line-by-line review.',
  },
  {
    number: "5",
    title: "Same vendor with multiple invoices summing to a capital threshold",
    detail:
      "A capital project billed in phases can appear as multiple smaller transactions that individually fall below a CapEx detection threshold. A roofing contractor might issue three invoices of $28,000 each over a 90-day period for what is effectively a $84,000 roof replacement project. Grouping transactions by vendor within a period and reviewing the total - not just individual transactions - catches this pattern. In Yardi, this is visible by filtering the GL export by vendor and sorting by date.",
  },
];

export default function DetectCapexInGLExportPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <nav className="text-sm text-muted-foreground mb-4">
            <Link
              href="/resources"
              className="hover:text-foreground transition-colors duration-200"
            >
              Resources
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Detect CapEx in GL Export</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            How to Detect CapEx in a GL Export Before It Becomes a CAM Dispute
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            Five signals to screen your GL export for capital expenditures
            before they flow into the recoverable CAM pool.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              By{" "}
              <Link
                href="/about/angel-campa"
                className="text-foreground font-medium hover:text-primary transition-colors duration-200"
              >
                Angel Campa
              </Link>
              , Founder, CapVeri
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime="2026-04-26">Updated April 2026</time>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-3xl">
        {/* Quick answer */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-10">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Quick Answer
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Capital expenditures coded to operating GL accounts are one of the
            leading causes of CAM overbilling. Before running a CAM
            reconciliation, screen your GL export for vendor names, transaction
            sizes, and account codes that indicate capital projects. A
            pre-reconciliation review takes less time than responding to a
            tenant audit demand.
          </p>
        </div>

        {/* Why CapEx appears in OpEx accounts */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Why Capital Expenditures End Up in Operating Accounts
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            CapEx miscoding is not usually intentional. It is the predictable
            result of four structural pressures in property accounting:
          </p>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Rushed GL coding at month-end
              </p>
              <p className="text-sm text-muted-foreground">
                A $40,000 contractor invoice arrives on the 28th. The property
                accountant codes it to the closest matching operating account to
                close the month: &quot;Building Maintenance,&quot;
                &quot;Repairs,&quot; or &quot;Common Area Expenses,&quot; with
                the intention of reclassifying later. Later rarely comes.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Vendor invoices that straddle the repair/replace line
              </p>
              <p className="text-sm text-muted-foreground">
                A roofing contractor replaces a 3,000 square foot section of
                membrane (clearly capital) but also performs repairs on two
                other sections (potentially operating). The single invoice
                covers both. The property manager codes the whole amount to
                maintenance rather than splitting it between capital and
                operating accounts.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Property manager discretion in repair vs. replacement calls
              </p>
              <p className="text-sm text-muted-foreground">
                When an HVAC unit fails and the property manager replaces it
                with a comparable unit, is it a repair (restoring function) or a
                replacement (capital asset)? Most accounting standards and lease
                language treat equipment replacement as capital. But many
                property managers code these events to operating accounts
                because &quot;it is just replacing what was there before.&quot;
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                ERP account code design
              </p>
              <p className="text-sm text-muted-foreground">
                Older Yardi and MRI chart-of-accounts configurations sometimes
                use a single account for both repair and replacement work on a
                given building system. The system architecture does not enforce
                the capital vs. operating distinction. The accountant must apply
                it manually on each transaction.
              </p>
            </div>
          </div>
        </section>

        {/* The 5 detection signals */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Five Detection Signals in a GL Export
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Apply these five screens to your GL export before running the
            reconciliation. Each one targets a distinct CapEx miscoding pattern.
          </p>
          <div className="space-y-4">
            {detectionSignals.map((signal) => (
              <div
                key={signal.number}
                className="rounded-lg border border-border p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-background text-xs font-bold">
                    {signal.number}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">
                      {signal.title}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {signal.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* IRS useful-life test */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            The IRS Useful-Life Test as a Practical Guide
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            When you flag a transaction for manual review, the IRS useful-life
            test provides a defensible classification standard: if the resulting
            asset or improvement has a useful life of{""}
            <strong>one year or more</strong>, it is a capital expenditure.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            In practice, this means:
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Work Type
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    IRS Classification
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    CAM Treatment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  [
                    "HVAC filter replacement",
                    "Operating (consumable)",
                    "Recoverable",
                  ],
                  [
                    "HVAC preventive maintenance contract",
                    "Operating",
                    "Recoverable",
                  ],
                  [
                    "HVAC rooftop unit replacement",
                    "Capital (15–20 yr useful life)",
                    "Not recoverable (unless amortized per lease)",
                  ],
                  [
                    "Roof membrane patching (<5% of area)",
                    "Operating repair",
                    "Recoverable",
                  ],
                  [
                    "Roof section replacement (≥5% of area)",
                    "Capital (20–27.5 yr useful life)",
                    "Not recoverable (unless amortized)",
                  ],
                  [
                    "Parking lot crack sealing",
                    "Operating repair",
                    "Recoverable",
                  ],
                  [
                    "Parking lot full resurfacing",
                    "Capital (15 yr useful life)",
                    "Not recoverable (unless amortized)",
                  ],
                  [
                    "LED lighting retrofit / full replacement",
                    "Capital (improvement)",
                    "Not recoverable (unless amortized)",
                  ],
                  [
                    "LED bulb replacement",
                    "Operating (consumable)",
                    "Recoverable",
                  ],
                ].map(([work, irs, cam]) => (
                  <tr key={work} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground text-xs">
                      {work}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {irs}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          cam === "Recoverable"
                            ? "text-green-700  font-medium"
                            : "text-destructive-strong font-medium"
                        }
                      >
                        {cam}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            The IRS MACRS depreciation schedule provides specific useful-life
            guidance for building components. IRS Publication 946 classifies
            nonresidential real property components at 15 years (land
            improvements) and 39 years (building structure). When in doubt,
            verify against the specific asset category in MACRS.
          </p>
        </section>

        {/* Pre-reconciliation checklist */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Building a Pre-Reconciliation GL Review Checklist
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Formalize the CapEx detection process as a standing checklist run
            before every reconciliation cycle. A practical checklist for a
            mid-size commercial portfolio:
          </p>
          <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
            <li className="leading-relaxed">
              Export the full-year GL to a spreadsheet. Include: account code,
              account name, transaction date, vendor name, description, and
              amount.
            </li>
            <li className="leading-relaxed">
              Filter to operating expense accounts (CAM-eligible account range
              in your COA). Exclude accounts already designated as capital or
              reserve accounts.
            </li>
            <li className="leading-relaxed">
              Sort by transaction amount, descending. Flag all transactions
              above $10,000 for manual invoice review.
            </li>
            <li className="leading-relaxed">
              Run a keyword search on the Description column for:{""}
              <em>
                replacement, install, installed, upgrade, new, construction,
                retrofit, overhaul, demolish, demolition
              </em>
              . Flag all matches.
            </li>
            <li className="leading-relaxed">
              Filter by Vendor Name and compare against your capital-vendor
              watchlist (major HVAC OEMs, roofing contractors, elevator
              companies, structural engineers). Flag any appearance of these
              vendors in operating accounts.
            </li>
            <li className="leading-relaxed">
              Group by Vendor and sum transactions within the fiscal year. Flag
              any vendor where cumulative transactions exceed $20,000. Review
              for phased capital billing.
            </li>
            <li className="leading-relaxed">
              For all flagged transactions: pull the underlying invoice and
              apply the IRS useful-life test. Recode capital items to a capital
              account before running the reconciliation.
            </li>
          </ol>
        </section>

        {/* What can go wrong */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            What Can Go Wrong
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    HVAC equipment replacement billed as maintenance, repeatedly
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A portfolio replaces 3–4 rooftop HVAC units per year across
                    its properties, each unit costing $18,000–$25,000. All are
                    coded to the &quot;HVAC Maintenance&quot; account. Over five
                    years, $400,000+ in capital equipment flows into the CAM
                    pool. When a sophisticated retail tenant audits, they
                    recover credits plus interest going back three to five
                    years: the full audit rights window.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Phased capital project billed across multiple invoice lines
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A parking lot resurfacing project totaling $120,000 is
                    invoiced in four installments of $30,000 each over three
                    months. Each individual invoice falls below any
                    single-transaction threshold. No individual line flags as
                    unusual. But the cumulative vendor total, only visible by
                    grouping, reveals the capital project. Without the
                    vendor-grouping check, all $120,000 flows into the
                    recoverable CAM pool.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Tenant improvement costs coded to common area accounts
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Buildout costs for a new tenant (flooring, partitions, HVAC
                    tie-ins) are coded to general building accounts rather than
                    a tenant-specific capital account. These costs are both
                    non-recoverable (as capital) and tenant-specific (excluded
                    from the CAM pool). They require a separate account
                    structure to prevent them from flowing into other
                    tenants&apos; CAM bills.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Why does CapEx appear in operating GL accounts?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The most common causes are rushed month-end coding, vendor
                invoices that straddle the repair/replace line, property manager
                discretion, and ERP account designs that co-mingle repair and
                replacement in a single account.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What is the IRS useful-life test?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An expenditure is capital if the resulting asset has a useful
                life of one year or more. This test provides a consistent
                classification standard for borderline repair vs. replacement
                decisions. IRS Publication 946 and MACRS schedules list specific
                useful lives for common building components.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What dollar threshold should I use for GL review?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                $10,000 per transaction is a practical starting threshold for
                most commercial portfolios. Higher-risk account codes (HVAC,
                roofing, structural) may warrant a lower threshold of $5,000.
                The threshold should be reviewed annually. Replace costs change
                with inflation, and a threshold set in 2018 may miss items that
                would have been flagged then.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Can this GL review process be automated?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Yes. All five detection signals are rule-based and can be
                applied programmatically to a GL export. CAM reconciliation
                software can run these screens automatically and surface flagged
                items for human review before any reconciliation calculation
                runs.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Related Resources
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                title: "CapEx vs. OpEx in CAM",
                href: "/resources/capex-vs-opex-cam",
                description:
                  "Framework for classifying capital vs. operating expenses",
              },
              {
                title: "Capital Expenditures Recoverable in CAM",
                href: "/resources/capital-expenditures-recoverable-in-cam",
                description:
                  "When amortized capital recovery is permitted by lease",
              },
              {
                title: "GL Export QA for CAM",
                href: "/resources/gl-export-qa-cam",
                description:
                  "Quality assurance checklist for GL exports before reconciliation",
              },
              {
                title: "Recoverable vs. Non-Recoverable CAM",
                href: "/resources/recoverable-vs-nonrecoverable-cam",
                description:
                  "Which operating costs can be passed through to tenants",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Automate CapEx detection and GL screening before reconciliation",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <p className="font-medium group-hover:text-primary text-sm">
                  {link.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {link.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground text-background p-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            Screen Every GL Line Before It Reaches Tenants
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri runs automated CapEx detection on your GL export, flagging
            high-value transactions, capital vendor names, and description
            keywords before the reconciliation calculation runs.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "detect_capex_gl_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
