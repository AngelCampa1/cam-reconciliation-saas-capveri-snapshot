import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  FileText,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "What Are CAM Charges? The Landlord's Complete Guide (2026)",
  description:
    "CAM charges explained for commercial landlords and property managers. Covers what's recoverable, how they're calculated, the reconciliation cycle, and common billing errors.",
  alternates: { canonical: `${SITE_URL}/resources/what-are-cam-charges` },
  openGraph: {
    title: "What Are CAM Charges? The Landlord's Complete Guide (2026)",
    description:
      "CAM charges explained for commercial landlords and property managers. Covers what's recoverable, how they're calculated, the reconciliation cycle, and common billing errors.",
    url: `${SITE_URL}/resources/what-are-cam-charges`,
    type: "article",
  },
};

const howToSchema = structuredDataSchemas.howTo(
  "How CAM Charges Are Billed to Tenants",
  "The three-stage process commercial landlords use to estimate, collect, and reconcile CAM charges under NNN and modified gross leases.",
  [
    {
      name: "Set the annual estimate and collect monthly payments",
      text: "At the start of each lease year the landlord projects total operating expenses for the property, calculates each tenant's pro-rata share, and bills monthly CAM estimates alongside base rent. These estimates are based on prior-year actuals plus a reasonable escalation factor (typically 3–5%).",
      url: `${SITE_URL}/resources/how-to-calculate-cam-charges`,
    },
    {
      name: "Close the books and run the GL report",
      text: "After the fiscal year ends (usually by January 31 for calendar-year properties), the landlord pulls a full general ledger report, classifies each line item as recoverable or non-recoverable per each lease's exclusion clause, and totals the recoverable expense pool.",
      url: `${SITE_URL}/resources/common-area-maintenance-reconciliation-explained`,
    },
    {
      name: "Issue reconciliation statements and collect true-ups",
      text: "The landlord sends each tenant a CAM reconciliation statement showing actual recoverable expenses, the tenant's pro-rata share, any gross-up or cap adjustments, and the net true-up amount owed (or credit due). True-up amounts are typically due within 30 days of the reconciliation statement.",
      url: `${SITE_URL}/resources/cam-reconciliation-process`,
    },
  ],
  "PT1H",
);

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What are CAM charges in a commercial lease?",
    answer:
      "CAM charges (Common Area Maintenance charges) are the landlord's pass-through of operating expenses for shared building areas (lobbies, parking lots, landscaping, HVAC systems, insurance, and property taxes) to tenants on NNN and modified gross leases. Tenants pay a pro-rata share based on their leased square footage divided by the building's total rentable area.",
  },
  {
    question: "What is typically included in CAM charges?",
    answer:
      "Recoverable CAM expenses typically include janitorial and cleaning, landscaping, parking lot maintenance, exterior lighting, security services, property insurance premiums, real estate taxes, common area utilities, snow removal, property management fees (capped by lease), elevator maintenance, and routine repairs. Capital improvements are usually excluded unless the lease allows amortization.",
  },
  {
    question: "What is excluded from CAM charges?",
    answer:
      "Common CAM exclusions include: capital improvements and replacements, ground lease payments, financing costs and mortgage interest, leasing commissions and tenant improvement allowances, income and franchise taxes, depreciation, above-market management fees, costs specifically attributable to a single tenant, and any costs the lease explicitly carves out. The specific exclusion list varies by lease.",
  },
  {
    question: "How often are CAM charges reconciled?",
    answer:
      "Most commercial leases require annual CAM reconciliation, typically issued within 60–120 days after the fiscal year closes. Q1 (January–April) is the peak CAM reconciliation season for calendar-year properties. Some leases allow quarterly interim statements, but the binding true-up is annual. Landlords who miss the reconciliation deadline specified in the lease may forfeit their right to collect underpayments.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "What Are CAM Charges?",
    url: `${SITE_URL}/resources/what-are-cam-charges`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "What Are CAM Charges? The Landlord's Complete Guide (2026)",
  description:
    "CAM charges explained for commercial landlords and property managers. Covers what's recoverable, how they're calculated, the reconciliation cycle, and common billing errors.",
  url: `${SITE_URL}/resources/what-are-cam-charges`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1200,
});

export default function WhatAreCamChargesPage() {
  return (
    <>
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <main className="mx-auto max-w-4xl px-4 py-12 pb-24 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link href="/resources" className="hover:text-foreground">
            Resources
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-foreground">What Are CAM Charges?</span>
        </nav>

        {/* Header */}
        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            What Are CAM Charges? The Landlord&apos;s Complete Guide
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            CAM charges are how commercial landlords recover the cost of
            operating shared building areas from tenants. Understanding what is
            recoverable and what is not is the foundation of accurate
            reconciliation.
          </p>
          <p className="text-sm text-muted-foreground">
            By{" "}
            <Link
              href="/about/angel-campa"
              className="text-foreground hover:underline"
            >
              Angel Campa, Founder, CapVeri
            </Link>
            {""}· Updated April 2026
          </p>
        </header>

        {/* Featured snippet / quick answer box */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">
            Quick Answer: What Are CAM Charges?
          </h2>
          <p className="text-muted-foreground">
            CAM (Common Area Maintenance) charges are the landlord's
            pass-through of operating expenses for shared building areas to
            tenants under NNN and modified gross leases. Tenants pay a pro-rata
            share (their leased square footage divided by the building's total
            rentable area) of the recoverable expense pool. Landlords collect
            estimated payments monthly throughout the year and reconcile against
            actual costs annually.
          </p>
        </div>

        {/* What CAM Charges Cover */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What CAM Charges Cover
          </h2>
          <p className="mb-6 text-muted-foreground">
            CAM charges originate from expenses that benefit all tenants in a
            building or complex, not the private space any single tenant
            occupies. The specific list of recoverable expenses is defined by
            the lease, but most NNN and modified gross leases include a similar
            core set of operating costs.
          </p>
          <p className="mb-6 text-muted-foreground">
            In a 100,000 SF office building running $12/SF in annual operating
            expenses, the total CAM pool would be approximately $1.2 million per
            year. A tenant occupying 10,000 SF with a 10% pro-rata share would
            receive a CAM bill of roughly $120,000/year, collected as
            $10,000/month in estimated payments and trued up after year end.
          </p>

          {/* CAM line items table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Expense Category
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Typical Line Items
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Recoverable?
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  [
                    "Janitorial & Cleaning",
                    "Common area cleaning, window washing, pressure washing",
                    "Typically Recoverable",
                  ],
                  [
                    "Landscaping & Grounds",
                    "Lawn maintenance, irrigation, seasonal plantings, snow removal",
                    "Typically Recoverable",
                  ],
                  [
                    "Parking & Exterior",
                    "Lot striping, asphalt patching, lighting, drainage",
                    "Typically Recoverable",
                  ],
                  [
                    "Property Insurance",
                    "General liability, property, umbrella policies",
                    "Typically Recoverable",
                  ],
                  [
                    "Real Estate Taxes",
                    "Annual property tax assessments, special assessments",
                    "Typically Recoverable (often a separate pass-through)",
                  ],
                  [
                    "Property Management Fee",
                    "Management company fee, usually 3–6% of gross revenues",
                    "Typically Recoverable (subject to lease cap)",
                  ],
                  [
                    "Common Area Utilities",
                    "Shared HVAC, lobby/corridor lighting, elevator power",
                    "Typically Recoverable",
                  ],
                  [
                    "Security",
                    "Guard service, access control systems, CCTV monitoring",
                    "Typically Recoverable",
                  ],
                  [
                    "Elevator & Mechanical",
                    "Preventive maintenance contracts, minor repairs",
                    "Typically Recoverable",
                  ],
                  [
                    "Capital Improvements",
                    "Roof replacement, HVAC unit replacement, parking lot resurfacing",
                    "Often Excluded (or amortized over useful life)",
                  ],
                  [
                    "Mortgage Interest & Debt",
                    "Financing costs, ground lease payments, debt service",
                    "Often Excluded",
                  ],
                  [
                    "Leasing Costs",
                    "Broker commissions, tenant improvement allowances, free rent",
                    "Often Excluded",
                  ],
                  [
                    "Income & Franchise Taxes",
                    "Corporate taxes on landlord income",
                    "Often Excluded",
                  ],
                  [
                    "Tenant-Specific Costs",
                    "Buildout work, dedicated HVAC for a single tenant",
                    "Often Excluded",
                  ],
                ].map(([category, items, status]) => (
                  <tr key={category} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground align-top">
                      {category}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {items}
                    </td>
                    <td
                      className={`px-4 py-3 align-top text-sm font-medium ${
                        status.startsWith("Often Excluded")
                          ? "text-destructive-strong"
                          : "text-green-700"
                      }`}
                    >
                      {status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Always verify the specific exclusion list in each lease. The table
            above reflects market norms. Individual leases frequently negotiate
            broader or narrower exclusion lists.
          </p>
        </section>

        {/* The Estimate-to-Reconciliation Cycle */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The Estimate-to-Reconciliation Cycle
          </h2>
          <p className="mb-6 text-muted-foreground">
            CAM charges flow through a two-phase annual cycle: monthly estimates
            collected in advance, followed by an annual reconciliation that
            trues up actual versus estimated costs. Landlords who understand
            this cycle avoid the most common billing disputes.
          </p>
          <div className="space-y-4">
            {[
              {
                step: "1",
                title:
                  "Budget and set the estimate (January, lease year start)",
                body: "Using prior-year actuals and vendor contract renewals, the landlord calculates projected recoverable expenses for the upcoming year. Each tenant receives an updated monthly CAM estimate, usually issued alongside the lease year renewal or 60 days before the new year begins.",
              },
              {
                step: "2",
                title: "Collect monthly estimates throughout the year",
                body: "Tenants pay their estimated CAM amount with each month's base rent payment. These are advance payments, not the final bill. Collecting $8,500/month from a tenant whose annual true-up will be $102,000 is routine. The estimate is intentionally set close to the expected actual.",
              },
              {
                step: "3",
                title:
                  "Close the books and classify GL entries (January–February)",
                body: "After December 31, the property's accountant runs the full GL report, reviews each line item against the lease's recoverable expense definition, and backs out any non-recoverable costs. This step is where most billing errors originate. Misclassifying a capital replacement as a maintenance expense is a common example.",
              },
              {
                step: "4",
                title: "Apply gross-up, caps, and base year adjustments",
                body: "If the lease contains gross-up provisions, variable expenses are normalized to the lease's occupancy threshold. CAM caps are applied to limit the tenant's year-over-year obligation increase. For base-year leases, only expenses above the base year amount are charged.",
              },
              {
                step: "5",
                title: "Send reconciliation statements (February–April)",
                body: "The landlord issues a CAM reconciliation statement to each tenant showing the full calculation: actual recoverable expenses, pro-rata share percentage, adjustments, total obligation, estimated payments already collected, and the net true-up amount owed or credit due.",
              },
              {
                step: "6",
                title: "Collect true-ups and set next year's estimate",
                body: "Tenants pay any amount owed (or receive credits) within the lease's cure period, typically 30 days. The reconciled actual expenses then form the basis for the next year's estimate, with a reasonable escalation factor.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {item.step}
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="mb-1 font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What Can Go Wrong section */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Misclassifying Capital Replacements as Operating Maintenance
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Replacing a chiller or resurfacing an entire parking lot is
                    a capital improvement under most leases, not a recoverable
                    operating expense. If these costs flow through the GL as
                    &quot;repairs and maintenance&quot; and get included in the
                    CAM pool, tenants are overbilled for costs they
                    contractually don&apos;t owe. This is one of the most common
                    findings in tenant CAM audits, and it creates credits with
                    interest when caught.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using the Wrong Denominator for Pro-Rata Calculations
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Different leases in the same building may define the
                    denominator differently. One tenant's lease uses total
                    rentable area (say, 120,000 SF), while another's uses total
                    leasable area (95,000 SF after common area deductions).
                    Applying a single building-wide denominator to all tenants
                    without checking each lease overcharges tenants with smaller
                    denominator definitions and undercharges others.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Ignoring Lease-Specific Exclusions When Pooling Expenses
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A tenant may have negotiated an exclusion for management
                    fees above 3%, while the landlord is billing at 5%. Or a
                    tenant&apos;s lease excludes insurance for earthquake
                    coverage in a California building. When those line items are
                    included in the building-wide CAM pool without being
                    excluded per that tenant&apos;s lease, the tenant receives
                    an overbilling statement that any competent audit firm will
                    immediately flag.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ section */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-lg font-medium">
                What are CAM charges in a commercial lease?
              </h3>
              <p className="text-muted-foreground">
                CAM charges are the landlord&apos;s pass-through of operating
                expenses for shared building areas to tenants under NNN and
                modified gross leases. Tenants pay a pro-rata share (their
                leased SF divided by the building's total rentable area) of
                recoverable operating costs including cleaning, landscaping,
                insurance, property taxes, and management fees.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is typically included in CAM charges?
              </h3>
              <p className="text-muted-foreground">
                Recoverable CAM expenses typically include janitorial and
                cleaning, landscaping, parking lot maintenance, exterior
                lighting, security services, property insurance premiums, real
                estate taxes, common area utilities, snow removal, property
                management fees (subject to a lease cap), elevator maintenance,
                and routine repairs. Capital improvements are usually excluded
                unless the lease permits amortization.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is excluded from CAM charges?
              </h3>
              <p className="text-muted-foreground">
                Common exclusions include capital improvements and replacements,
                ground lease payments, financing and mortgage interest, leasing
                commissions, tenant improvement allowances, income and franchise
                taxes, depreciation, management fees above the contractual cap,
                and any costs attributable to a specific tenant. The exact list
                depends on each lease's exclusion clause. Always verify per
                tenant.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                How often are CAM charges reconciled?
              </h3>
              <p className="text-muted-foreground">
                Most commercial leases require annual CAM reconciliation, issued
                within 60–120 days after the fiscal year closes. For
                calendar-year properties, Q1 (January–April) is peak
                reconciliation season. Landlords who miss the deadline specified
                in the lease may lose the right to collect underpayments for
                that year, a provision many tenants actively monitor.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/how-to-calculate-cam-charges"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    How to Calculate CAM Charges
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Formula, gross-up, caps, and worked examples with real
                    numbers.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/common-area-maintenance-reconciliation-explained"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Reconciliation Explained
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The 6-step reconciliation cycle from GL export to true-up
                    billing.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-reconciliation-process"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Reconciliation Process Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Timeline, checklists, and documentation requirements.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/tools/cam-gross-up-calculator"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Gross-Up Calculator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Model gross-up across multiple occupancy thresholds.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Find CAM Billing Errors Before Tenants Do
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri audits your CAM reconciliations automatically. It catches
            misclassified capital items, wrong denominators, and missed lease
            exclusions from your Yardi or MRI export. No integration required.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "what_are_cam_charges_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
