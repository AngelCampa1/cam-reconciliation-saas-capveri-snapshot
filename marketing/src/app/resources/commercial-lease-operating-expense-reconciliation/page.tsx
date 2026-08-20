import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "Commercial Lease Operating Expense Reconciliation: Step-by-Step Guide (2026)",
  description:
    "How to reconcile operating expenses in a commercial lease. Covers NNN, gross, and modified gross structures, the annual reconciliation timeline, and the most common billing errors.",
  alternates: {
    canonical: `${SITE_URL}/resources/commercial-lease-operating-expense-reconciliation`,
  },
  openGraph: {
    title:
      "Commercial Lease Operating Expense Reconciliation: Step-by-Step Guide",
    description:
      "How to reconcile operating expenses in a commercial lease. NNN, gross, and modified gross structures, the annual timeline, and common billing errors.",
    url: `${SITE_URL}/resources/commercial-lease-operating-expense-reconciliation`,
    type: "article",
  },
};

const howToSchema = structuredDataSchemas.howTo(
  "How to Reconcile Operating Expenses in a Commercial Lease",
  "Annual process for comparing actual operating expenses to estimated tenant payments and generating true-up invoices or credits.",
  [
    {
      name: "Close the fiscal year books",
      text: "By January 31, close the accounting books for the prior fiscal year. Ensure all operating expense invoices are posted. Accruals for expenses incurred but not yet invoiced (utilities, insurance adjustments) must be booked before closing.",
      url: `${SITE_URL}/resources/commercial-lease-operating-expense-reconciliation`,
    },
    {
      name: "Run the GL export and classify expenses",
      text: "By February 15, export the general ledger for the reconciliation period. Classify each line item as recoverable or non-recoverable per each tenant's lease. Flag capital expenditures, owner-specific expenses, and management fee amounts that exceed the lease cap.",
      url: `${SITE_URL}/resources/recoverable-vs-nonrecoverable-cam`,
    },
    {
      name: "Apply gross-up and calculate each tenant's share",
      text: "For leases with gross-up provisions, adjust variable expenses to the occupancy threshold defined in the lease (typically 90–95%). Calculate each tenant's pro-rata share using the denominator definition in their lease.",
      url: `${SITE_URL}/tools/cam-gross-up-calculator`,
    },
    {
      name: "Send reconciliation statements",
      text: "By March 31 (or by the deadline in each lease - often 90–180 days after fiscal year end), send a complete reconciliation statement to each tenant showing the expense pool, their pro-rata share, prior estimated payments, and the resulting true-up amount owed or credit due.",
      url: `${SITE_URL}/resources/commercial-lease-operating-expense-reconciliation`,
    },
    {
      name: "Collect true-up payments or issue credits",
      text: "By April 30, collect outstanding true-up invoices. Issue credits to tenants who overpaid. Update the estimated monthly payment amount for the current year based on the reconciled actual expenses.",
      url: `${SITE_URL}/resources/commercial-lease-operating-expense-reconciliation`,
    },
  ],
  "PT8H",
);

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is operating expense reconciliation in a commercial lease?",
    answer:
      "Operating expense reconciliation is the annual process of comparing the actual operating expenses incurred at a property to the estimated amounts collected from tenants throughout the year. If actual expenses exceed estimates, tenants owe a true-up payment. If estimates exceeded actuals, tenants receive a credit. This applies to NNN, NN, and modified gross leases where tenants share operating costs.",
  },
  {
    question:
      "How does NNN reconciliation differ from gross lease reconciliation?",
    answer:
      "In a triple net (NNN) lease, tenants pay their pro-rata share of all operating expenses (taxes, insurance, CAM) directly. Reconciliation compares actual expenses to the estimated monthly payments. In a gross or modified gross lease, the tenant pays a fixed base rent that includes some or all operating expenses. Reconciliation applies only to the expense categories above the base year or expense stop - not the entire operating expense pool.",
  },
  {
    question:
      "What happens if the landlord misses the reconciliation deadline in the lease?",
    answer:
      "Most leases include a reconciliation deadline (often 90–180 days after fiscal year end) and a cure period. Missing the deadline may waive the landlord's right to collect the true-up for that year. Some leases are silent on the consequence of missing the deadline - in those cases, the landlord may still have a legal right to bill, but the practical collection risk increases substantially. Always track reconciliation deadlines per lease.",
  },
  {
    question:
      "What data sources are needed for operating expense reconciliation?",
    answer:
      "You need: (1) the GL export for the reconciliation period, filtered by recoverable expense codes; (2) each tenant's lease abstract showing their pro-rata denominator, exclusion carve-outs, gross-up provisions, and CAM cap terms; (3) the prior year reconciliation statement to establish the base year or prior year CAM for cap calculations; and (4) the rent roll showing each tenant's leased square footage and estimated payment history.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Commercial Lease Operating Expense Reconciliation",
    url: `${SITE_URL}/resources/commercial-lease-operating-expense-reconciliation`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "Commercial Lease Operating Expense Reconciliation: Step-by-Step Guide",
  description:
    "How to reconcile operating expenses in a commercial lease. NNN, gross, and modified gross structures, the annual timeline, and common billing errors.",
  url: `${SITE_URL}/resources/commercial-lease-operating-expense-reconciliation`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
});

export default function CommercialLeaseOEReconciliationPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={articleSchema} />
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      {/* Header */}
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
            <span className="text-foreground">
              Operating Expense Reconciliation
            </span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Commercial Lease Operating Expense Reconciliation: Step-by-Step
            Guide
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            The annual reconciliation cycle from closing your books to
            collecting true-up payments, for NNN, modified gross, and gross
            leases.
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
        {/* Featured snippet box */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-10">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Quick Answer
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Operating expense reconciliation in a commercial lease is the
            process of comparing actual annual expenses to the estimated amounts
            collected from tenants, generating either a true-up invoice (tenant
            owes more) or a credit (tenant overpaid). It applies to all lease
            structures where tenants share operating costs: NNN, modified gross,
            and full-service leases with expense stops or base years.
          </p>
        </div>

        {/* Lease structure differences */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            How Lease Structure Affects Reconciliation
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Lease Type
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    What Tenant Pays
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Reconciliation Scope
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Key Complexity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground align-top">
                    Triple Net (NNN)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    All operating expenses: taxes, insurance, CAM
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    Full recoverable expense pool vs. estimated payments
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    Gross-up, capital exclusions, CAM caps
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground align-top">
                    Modified Gross
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    Selected expense categories (e.g., utilities only, or taxes
                    only)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    Only the expense categories specified in the lease
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    Identifying which categories apply per each lease
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground align-top">
                    Full Gross / Full Service
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    Fixed gross rent; landlord absorbs all operating costs
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    Expenses above base year or expense stop only
                  </td>
                  <td className="px-4 py-3 text-muted-foreground align-top">
                    Establishing the base year expense level accurately
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Annual timeline */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            The Annual Reconciliation Timeline
          </h2>
          <div className="space-y-4">
            {[
              {
                date: "Jan 31",
                milestone: "Close fiscal year books",
                detail:
                  "Post all operating expense invoices for the prior year. Book accruals for expenses incurred but not yet invoiced (utilities, insurance premium adjustments, property tax refunds). Do not leave the books open past this date or the GL export will be incomplete.",
              },
              {
                date: "Feb 15",
                milestone: "Run GL export and classify expenses",
                detail:
                  "Export the full GL for the reconciliation period. Classify each line item as recoverable or non-recoverable per each tenant's lease exclusion schedule. Flag capital expenditures, owner-specific costs, and management fees exceeding the lease cap. This classification step is where most reconciliation errors originate.",
              },
              {
                date: "Mar 1",
                milestone: "Apply gross-up and calculate pro-rata shares",
                detail:
                  "For leases with gross-up provisions, normalize variable expenses to the occupancy threshold defined in each lease. Calculate each tenant's pro-rata share using the denominator in their specific lease. Apply CAM caps where applicable. Verify that the prior year base is correct before calculating any cap ceiling.",
              },
              {
                date: "Mar 31",
                milestone: "Send reconciliation statements",
                detail:
                  "Send a complete reconciliation package to each tenant: the expense pool detail, their pro-rata share calculation, prior estimated payments, and the resulting true-up balance. Check each lease for the specific deadline. Many leases require delivery within 90 or 120 days of fiscal year end. Missing this deadline can waive your right to collect.",
              },
              {
                date: "Apr 30",
                milestone: "Collect true-up payments and update estimates",
                detail:
                  "Collect outstanding true-up invoices. Issue credits to tenants who overpaid. Update each tenant's monthly estimated CAM payment for the current year based on the reconciled prior year actuals, typically increasing by 3–7% as a forward estimate.",
              },
            ].map((item) => (
              <div
                key={item.date}
                className="flex gap-4 rounded-lg border border-border p-4"
              >
                <div className="flex-shrink-0">
                  <div className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-bold whitespace-nowrap">
                    {item.date}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {item.milestone}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Key data sources */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Key Data Sources for Reconciliation
          </h2>
          <div className="space-y-3">
            {[
              {
                source: "General Ledger (GL) Export",
                detail:
                  "The primary data source. Export from Yardi, MRI, or your accounting system filtered by property and expense account codes. Confirm the export covers the full fiscal year. Partial-year exports are a common source of errors.",
              },
              {
                source: "Tenant Lease Abstracts",
                detail:
                  "Each lease defines the recoverable expense categories, exclusion carve-outs, denominator SF, gross-up threshold, and CAM cap terms. Abstracts must be current, since mid-lease amendments frequently change these terms.",
              },
              {
                source: "Prior Year Reconciliation Statements",
                detail:
                  "Required to establish the base year expense level for leases with base year OE structures, and to calculate the prior year CAM figure for cap ceiling calculations.",
              },
              {
                source: "Rent Roll and Estimated Payment History",
                detail:
                  "Confirms each tenant's leased square footage and the total estimated CAM payments collected during the year. Discrepancies between the rent roll SF and the lease abstract SF must be resolved before calculating pro-rata shares.",
              },
            ].map((item) => (
              <div
                key={item.source}
                className="rounded-lg border border-border bg-muted/30 p-4"
              >
                <p className="text-sm font-semibold text-foreground mb-1">
                  {item.source}
                </p>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Base year vs. current year */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Separating Base Year Expenses from Current Year Actuals
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            For full-service and modified gross leases with expense stop or base
            year structures, reconciliation requires calculating two figures:
          </p>
          <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border mb-4">
            <div className="text-muted-foreground mb-2">
              Base year / expense stop reconciliation formula:
            </div>
            <div>Current Year Actual Operating Expenses: $850,000</div>
            <div>
              Base Year Operating Expenses (from Year 1 lease): $720,000
            </div>
            <div>Excess Above Base: $850,000 − $720,000 = $130,000</div>
            <div className="mt-2">Tenant Pro-Rata Share: 8.50%</div>
            <div>
              Tenant&apos;s Expense Stop Obligation: $130,000 × 8.50% ={" "}
              <strong>$11,050</strong>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The base year figure must be fixed at the level established when the
            lease was executed. A common error is recalculating or adjusting the
            base year. Once locked in a lease, the base year amount cannot be
            changed without a lease amendment.
          </p>
        </section>

        {/* What Can Go Wrong */}
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
                    Missing lease-specific exclusions in GL classification
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Applying a single exclusion list to all tenants when
                    different leases have different carve-outs. Tenant A&apos;s
                    lease may exclude management fees; Tenant B&apos;s may not.
                    Running a single reconciliation template without
                    lease-specific filtering is the most common source of
                    overbilling and the first thing an auditor checks.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Sending reconciliation statements past the lease deadline
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Many leases specify that if the landlord does not deliver a
                    reconciliation statement within 120 or 180 days of year end,
                    the tenant&apos;s obligation to pay the true-up is waived
                    for that year. At $15,000 per tenant × 20 tenants, missing
                    the deadline costs $300,000 in permanent, unrecoverable
                    leakage.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not separating base year expenses from current year in
                    expense-stop leases
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Billing the full operating expense pool instead of only the
                    excess above the base year on full-service or modified gross
                    leases. Tenants in these leases are only responsible for
                    increases above their contractual base. Billing the full
                    pool without the base year offset results in overbilling,
                    often by 80–90% of what was invoiced.
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
                What is operating expense reconciliation in a commercial lease?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Operating expense reconciliation compares actual annual expenses
                to estimated tenant payments, generating a true-up invoice or
                credit. It applies to all lease structures where tenants share
                operating costs: NNN, modified gross, and full-service leases
                with expense stops.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                How does NNN reconciliation differ from gross lease
                reconciliation?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                NNN tenants pay their pro-rata share of all operating expenses.
                Reconciliation compares actual expenses to monthly estimates for
                the full recoverable pool. In a gross or modified gross lease,
                reconciliation applies only to expenses above the base year or
                expense stop, not the entire pool.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What happens if the landlord misses the reconciliation deadline?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Many leases include a strict deadline (typically 90–180 days
                after fiscal year end) with a waiver provision if missed.
                Missing the deadline may permanently waive the landlord&apos;s
                right to collect the true-up for that year.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What data sources are needed for operating expense
                reconciliation?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You need: (1) the GL export for the reconciliation period; (2)
                each tenant&apos;s lease abstract with exclusion carve-outs and
                pro-rata denominator; (3) prior year reconciliation statements
                for base year and cap calculations; and (4) the rent roll and
                estimated payment history.
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
                title: "CAM Reconciliation Explained",
                href: "/resources/common-area-maintenance-reconciliation-explained",
                description: "Overview of CAM reconciliation mechanics",
              },
              {
                title: "CAM Reconciliation Process",
                href: "/resources/cam-reconciliation-process",
                description: "Detailed workflow from GL to true-up",
              },
              {
                title: "What Are CAM Charges?",
                href: "/resources/what-are-cam-charges",
                description: "Foundational guide to CAM charges",
              },
              {
                title: "CAM Gross-Up Calculator",
                href: "/tools/cam-gross-up-calculator",
                description:
                  "Model gross-up adjustments at multiple occupancy thresholds",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Automate the full reconciliation cycle from GL export to statements",
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
            Run Your Reconciliation in Hours, Not Weeks
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri processes your GL export, applies each tenant&apos;s lease
            exclusions, and generates reconciliation statements with no manual
            classification required.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "opex_reconciliation_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
