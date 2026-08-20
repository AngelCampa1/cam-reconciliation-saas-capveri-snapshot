import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import {
  structuredDataSchemas,
  AUTHOR_ANGEL_CAMPA,
} from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "Operating Expense Reconciliation in Commercial Leases: A Practical Handbook",
  description:
    "Operating expense reconciliation is more than CAM. It covers property taxes, insurance, and management fees under various lease structures. Here's how to reconcile them all correctly.",
  alternates: {
    canonical: `${SITE_URL}/resources/operating-expense-reconciliation-commercial-lease`,
  },
  openGraph: {
    title:
      "Operating Expense Reconciliation in Commercial Leases: A Practical Handbook",
    description:
      "Operating expense reconciliation is more than CAM. It covers property taxes, insurance, and management fees under various lease structures. Here's how to reconcile them all correctly.",
    url: `${SITE_URL}/resources/operating-expense-reconciliation-commercial-lease`,
    type: "article",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Operating Expense Reconciliation in Commercial Leases: A Practical Handbook",
  description:
    "How to reconcile CAM, property taxes, insurance, and management fees correctly under various commercial lease structures.",
  url: `${SITE_URL}/resources/operating-expense-reconciliation-commercial-lease`,
  datePublished: "2026-04-01",
  dateModified: "2026-04-26",
  author: AUTHOR_ANGEL_CAMPA,
  publisher: structuredDataSchemas.organization,
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the difference between CAM and operating expenses in a commercial lease?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM (Common Area Maintenance) is one component of operating expenses. Full operating expenses include CAM plus property taxes, building insurance, and management fees. Some leases bundle all four under the label 'CAM'; others separate them as distinct NNN components. The reconciliation mechanics differ for each category.",
      },
    },
    {
      "@type": "Question",
      name: "How often are operating expenses reconciled in commercial leases?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Annual reconciliation is standard across most commercial lease types. Tenants pay monthly estimates throughout the year, and a reconciliation statement is delivered after year-end to settle the difference between estimates and actuals. Some retail leases allow quarterly estimates with annual reconciliation; monthly reconciliation is rare except in very short-term arrangements.",
      },
    },
    {
      "@type": "Question",
      name: "How are property taxes reconciled differently from CAM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Property tax reconciliation is driven by actual tax bills rather than GL expense entries. Because tax bills are issued by the taxing authority on their own schedule - often quarterly or semi-annually, sometimes in arrears - the reconciliation must confirm that the tax year and the lease year align correctly, that supplemental assessments are included, and that any tax appeal refunds are credited back to tenants.",
      },
    },
    {
      "@type": "Question",
      name: "Can a landlord recover management fees through CAM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, if the lease permits it. Most NNN leases allow management fee recovery, typically calculated as a percentage of gross revenues (2–4% is common) or base rent. Some leases cap the recoverable management fee, require the fee to match the rate charged to third-party clients, or exclude it entirely. The recoverability and calculation method must be confirmed per lease before including management fees in the reconciliation.",
      },
    },
  ],
};

export default function OperatingExpenseReconciliationPage() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <main className="mx-auto max-w-4xl px-4 py-12 pb-24 sm:px-6 lg:px-8">
        <nav className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link href="/resources" className="hover:text-foreground">
            Resources
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-foreground">
            Operating Expense Reconciliation
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Operating Expense Reconciliation in Commercial Leases: A Practical
            Handbook
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Operating expense reconciliation covers all four recoverable cost
            categories: CAM, property taxes, insurance, and management fees.
            Each has distinct billing mechanics, different data sources, and
            different error patterns. Treating them all as "CAM" is where
            reconciliation errors begin.
          </p>
          <p className="text-sm text-muted-foreground">
            By{" "}
            <Link
              href="/about/angel-campa"
              className="text-foreground hover:underline"
            >
              Angel Campa, Founder, CapVeri
            </Link>{" "}
            · Updated April 2026
          </p>
        </header>

        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            Operating expense (OE) reconciliation covers all
            landlord-recoverable costs in a commercial lease: CAM, property
            taxes, insurance, and management fees. The reconciliation process
            must reflect each category&apos;s unique billing mechanics. The
            pro-rata share may be the same, but data sources and base
            calculations differ by category.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            How Leases Structure Operating Expense Recovery
          </h2>
          <p className="mb-4 text-muted-foreground">
            Commercial leases handle the four OE categories in two main ways:
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Bundled "CAM"</h3>
              <p className="text-sm text-muted-foreground">
                Some leases use "CAM" as an umbrella term that includes all four
                categories. A single annual estimate and reconciliation covers
                everything. Common in older retail leases and some industrial
                leases. The simplicity is appealing but can obscure error
                patterns within individual categories.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Separated NNN Components</h3>
              <p className="text-sm text-muted-foreground">
                NNN leases (and many modern retail leases) separate the three
                "nets" (property taxes, insurance, CAM) into distinct line
                items, each with its own estimate and reconciliation. Management
                fees may be included in CAM or billed separately. This structure
                provides transparency but requires four reconciliation
                calculations per tenant.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The Four OE Categories: Mechanics and Differences
          </h2>

          <div className="space-y-8">
            <div>
              <h3 className="mb-3 text-xl font-semibold">
                1. CAM (Common Area Maintenance)
              </h3>
              <p className="mb-3 text-muted-foreground">
                CAM covers the operating costs of maintaining shared building
                systems and common areas: janitorial, utilities for common
                spaces, landscaping, parking lot maintenance, security, and HVAC
                for common areas. Reconciled against the GL expense ledger for
                the lease year.
              </p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Key adjustments applied to CAM:</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>
                    • Gross-up to full occupancy if vacancy exceeds lease
                    threshold
                  </li>
                  <li>
                    • Annual or cumulative CAM cap limits on billable increase
                  </li>
                  <li>
                    • Management fee calculated on top of (or within) the CAM
                    pool
                  </li>
                  <li>
                    • Removal of capital items and non-recoverable exclusions
                  </li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xl font-semibold">2. Property Taxes</h3>
              <p className="mb-3 text-muted-foreground">
                Property tax reconciliation is driven by actual tax bills from
                the taxing authority, not GL entries alone. The reconciliation
                must confirm that all installments for the lease year are
                included, that supplemental bills from reassessments are
                captured, and that any tax appeal refunds are credited back to
                the appropriate tenants.
              </p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium">
                  Three common property tax reconciliation complications:
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>
                    <strong>Tax year vs. lease year misalignment:</strong>{" "}
                    Property tax bills may cover a fiscal year (e.g., July 1 –
                    June 30) while the lease year is calendar. Prorate the tax
                    bill to match the lease year.
                  </li>
                  <li>
                    <strong>Supplemental assessments:</strong> Post-sale or
                    post-improvement supplemental bills arrive late and must be
                    reconciled into the year they cover.
                  </li>
                  <li>
                    <strong>Tax appeals:</strong> If the landlord successfully
                    appealed the assessment and received a refund, tenants are
                    entitled to their pro-rata share.
                  </li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xl font-semibold">
                3. Building Insurance
              </h3>
              <p className="mb-3 text-muted-foreground">
                Insurance premiums are typically paid annually on a policy
                renewal date that may not align with the lease year. The
                reconciliation prorate the premium to the lease year and
                allocates the tenant&apos;s pro-rata share. For properties
                covered under a blanket portfolio policy, the landlord must
                allocate the building&apos;s share of the portfolio premium.
              </p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium">
                  Insurance reconciliation checkpoints:
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>
                    • Policy dates vs. lease year: prorate to cover only the
                    lease year period
                  </li>
                  <li>
                    • Blanket policy allocation: use square footage or insured
                    value allocation. Confirm which method the lease requires
                  </li>
                  <li>
                    • Exclusions: tenant improvement coverage and liability
                    insurance for tenant spaces are generally not recoverable
                  </li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xl font-semibold">4. Management Fees</h3>
              <p className="mb-3 text-muted-foreground">
                Management fee recoverability is lease-specific and highly
                negotiated. The most common structures are (a) a percentage of
                gross revenues (2–4%), (b) a percentage of CAM expenses
                collected, or (c) a flat per-SF rate. The lease should specify
                the calculation base and any cap on the recoverable amount.
              </p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium">
                  Common management fee reconciliation disputes:
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>
                    • Fee calculated on gross revenues that include categories
                    the lease excludes (e.g., percentage rent)
                  </li>
                  <li>
                    • Fee applied to the grossed-up CAM pool rather than actual
                    expenses
                  </li>
                  <li>
                    • Rate charged to the property does not match the
                    arm&apos;s-length rate required by the lease
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Sample OE Reconciliation: 3-Tenant Office Building
          </h2>
          <p className="mb-4 text-muted-foreground">
            This example illustrates how the four categories combine in a
            reconciliation statement for a 30,000 RSF Class B office building
            with three tenants, each occupying roughly equal space.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">
                    OE Category
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Total Building
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Tenant A Share (33%)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Annual Estimates Paid
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    True-Up
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-2">CAM (grossed up)</td>
                  <td className="px-4 py-2 text-right font-mono">$180,000</td>
                  <td className="px-4 py-2 text-right font-mono">$59,400</td>
                  <td className="px-4 py-2 text-right font-mono">$55,200</td>
                  <td className="px-4 py-2 text-right font-mono text-destructive-strong">
                    +$4,200
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Property taxes</td>
                  <td className="px-4 py-2 text-right font-mono">$96,000</td>
                  <td className="px-4 py-2 text-right font-mono">$31,680</td>
                  <td className="px-4 py-2 text-right font-mono">$30,000</td>
                  <td className="px-4 py-2 text-right font-mono text-destructive-strong">
                    +$1,680
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Insurance</td>
                  <td className="px-4 py-2 text-right font-mono">$24,000</td>
                  <td className="px-4 py-2 text-right font-mono">$7,920</td>
                  <td className="px-4 py-2 text-right font-mono">$8,400</td>
                  <td className="px-4 py-2 text-right font-mono text-green-700">
                    ($480)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Management fee (3% of CAM)</td>
                  <td className="px-4 py-2 text-right font-mono">$5,400</td>
                  <td className="px-4 py-2 text-right font-mono">$1,782</td>
                  <td className="px-4 py-2 text-right font-mono">$1,680</td>
                  <td className="px-4 py-2 text-right font-mono text-destructive-strong">
                    +$102
                  </td>
                </tr>
                <tr className="border-t-2 bg-muted/30">
                  <td className="px-4 py-2 font-bold">Total</td>
                  <td className="px-4 py-2 text-right font-mono font-bold">
                    $305,400
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold">
                    $100,782
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold">
                    $95,280
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold text-destructive-strong">
                    +$5,502
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Example figures for illustration purposes. Tenant A owes a $5,502
            true-up primarily driven by higher-than-estimated CAM and property
            taxes, partially offset by a small insurance credit.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using a calendar-year property tax amount for a June 30
                    lease year
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the property tax bill covers January–December and the
                    lease year is July–June, you need to prorate the tax between
                    two calendar years. Using the full calendar-year amount
                    either over- or under-bills the tenant depending on which
                    year&apos;s tax was higher.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Including the landlord&apos;s own insurance deductible in
                    the recoverable pool
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some GL entries include insurance deductible payments after
                    a claim. Most leases do not permit recovery of deductible
                    amounts. Only the premium is recoverable. Including
                    deductibles inflates the insurance recovery and is a common
                    tenant audit finding.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying the same pro-rata denominator to all four
                    categories when the lease specifies different denominators
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some leases use gross leasable area for CAM but taxable
                    floor area for property taxes. Using a single denominator
                    for all four categories when the lease specifies otherwise
                    creates a systematic error that may affect every tenant in
                    the building.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">
                What is the difference between CAM and operating expenses in a
                commercial lease?
              </h3>
              <p className="text-muted-foreground">
                CAM is one component of operating expenses. Full operating
                expenses include CAM plus property taxes, building insurance,
                and management fees. Some leases bundle all four under "CAM";
                others separate them as distinct NNN components.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How often are operating expenses reconciled in commercial
                leases?
              </h3>
              <p className="text-muted-foreground">
                Annual reconciliation is standard. Tenants pay monthly estimates
                throughout the year, and a reconciliation statement is delivered
                after year-end to settle the difference. Some retail leases
                allow quarterly estimates with annual reconciliation.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How are property taxes reconciled differently from CAM?
              </h3>
              <p className="text-muted-foreground">
                Property tax reconciliation is driven by actual tax bills rather
                than GL entries. The reconciliation must confirm that the tax
                year and lease year align correctly, that supplemental
                assessments are included, and that any tax appeal refunds are
                credited to tenants.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can a landlord recover management fees through CAM?
              </h3>
              <p className="text-muted-foreground">
                Yes, if the lease permits it. Most NNN leases allow management
                fee recovery, typically calculated as a percentage of gross
                revenues (2–4% is common) or base rent. Some leases cap the fee
                or exclude it entirely.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/cam-reconciliation-process",
                title: "CAM Reconciliation Process",
                desc: "The full step-by-step workflow for annual CAM reconciliation",
              },
              {
                href: "/resources/nnn-reconciliation",
                title: "NNN Reconciliation Guide",
                desc: "How triple-net lease components are reconciled separately",
              },
              {
                href: "/resources/recoverable-vs-nonrecoverable-cam",
                title: "Recoverable vs. Non-Recoverable CAM",
                desc: "Which expenses belong in each category of the OE pool",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How CapVeri reconciles all four OE categories from a single GL export",
              },
            ].map(({ href, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Reconcile All Four OE Categories From One GL Export
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri handles CAM, property taxes, insurance, and management fees
            in a single reconciliation workflow. No separate spreadsheets for
            each category.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "opex_reconciliation_handbook_cta",
              })}
            >
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
