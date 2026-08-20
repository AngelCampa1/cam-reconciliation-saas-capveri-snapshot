import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "CAM Reconciliation Process for Commercial Landlords: A Step-by-Step Guide",
  description:
    "The complete CAM reconciliation process from year-end close to true-up collection. Covers GL export, expense classification, gross-up calculations, statement generation, and dispute resolution.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-reconciliation-process`,
  },
  openGraph: {
    title:
      "CAM Reconciliation Process for Commercial Landlords: A Step-by-Step Guide",
    description:
      "The complete CAM reconciliation process from year-end close to true-up collection. Covers GL export, expense classification, gross-up calculations, statement generation, and dispute resolution.",
    url: `${SITE_URL}/resources/cam-reconciliation-process`,
    type: "article",
  },
};

const howToSchema = structuredDataSchemas.howTo(
  "CAM Reconciliation Process: 7 Steps for Commercial Landlords",
  "The complete 7-phase process for completing an annual CAM reconciliation, from closing the books to defending tenant audits.",
  [
    {
      name: "Close the books",
      text: "Verify all vendor invoices are accrued, confirm property tax and insurance are booked, and reconcile bank statements for the full lease year before exporting anything.",
    },
    {
      name: "Export and clean the GL",
      text: "Export the full-year general ledger for the property. Verify the date range matches the lease year exactly, remove any non-property corporate allocations, and run a duplicate-entry check.",
    },
    {
      name: "Classify expenses",
      text: "Review every GL line to identify non-recoverable expenses, flag capital items for removal, and apply lease-specific exclusions per each tenant's lease.",
    },
    {
      name: "Apply adjustments",
      text: "Gross up variable expenses if occupancy fell below the lease threshold, apply CAM caps (cumulative or non-cumulative), and calculate the management fee at the contracted rate.",
    },
    {
      name: "Generate reconciliation statements",
      text: "Produce a per-tenant calculation showing the recoverable pool, gross-up, cap adjustments, pro-rata share, prior estimates collected, and net true-up amount. Attach all supporting schedules.",
    },
    {
      name: "Send statements and collect true-ups",
      text: "Deliver statements to tenants per the lease deadline. Track delivery confirmation, monitor payment due dates, and issue demand letters for unpaid true-ups.",
    },
    {
      name: "Respond to tenant inquiries and audit requests",
      text: "Respond to tenant questions within the lease's stated SLA. For formal audit requests, assemble the audit defense packet: GL export, invoice index, management fee calculation, and pro-rata schedule.",
    },
  ],
  "PT8H",
);

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "How long does the CAM reconciliation process take?",
    answer:
      "For a single property with 10–20 tenants, the full reconciliation process typically takes 20–40 hours spread over 4–6 weeks. Most of that time is spent on GL classification and per-tenant calculations. Properties with complex gross-up or cumulative cap structures take longer. Software that automates GL classification and calculation can reduce this to 4–8 hours.",
  },
  {
    question: "What is the CAM reconciliation deadline in most leases?",
    answer:
      "Most commercial leases require the landlord to deliver CAM reconciliation statements within 90–120 days after the lease year ends. For calendar-year properties, that means statements are due March 31 to April 30. Missing the deadline can forfeit the landlord's right to collect underpayments for that year under many lease forms.",
  },
  {
    question: "What expenses are typically non-recoverable in a CAM pool?",
    answer:
      "Standard non-recoverable expenses include capital improvements, ground rent, financing costs (mortgage interest, loan fees), depreciation, leasing commissions, tenant improvement costs, advertising and marketing, and income taxes. Many leases also exclude costs for anchor tenants or exclude the landlord's own occupied space from the denominator.",
  },
  {
    question: "What is a CAM true-up and how is it calculated?",
    answer:
      "A CAM true-up is the difference between what a tenant actually owes based on the year's reconciled expenses and what they paid in monthly estimates throughout the year. If actual expenses were higher than estimated, the tenant owes the difference. If lower, the landlord owes a credit. True-up = (actual recoverable expenses × pro-rata share) − (monthly estimates × 12).",
  },
  {
    question:
      "Can a landlord charge a tenant after the reconciliation deadline passes?",
    answer:
      "It depends on the lease language. Many leases include a 'time is of the essence' provision for reconciliation statements. If the landlord misses the deadline, they forfeit the right to collect underpayments for that reconciliation year. Some leases allow late delivery but cap the collection period. Landlords should always track their per-property deadline dates.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Reconciliation Process",
    url: `${SITE_URL}/resources/cam-reconciliation-process`,
  },
]);

export default function CamReconciliationProcessPage() {
  return (
    <>
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />
      <main className="mx-auto max-w-4xl px-4 py-12 pb-24 sm:px-6 lg:px-8">
        <nav className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/"
            className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-foreground"
          >
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link
            href="/resources"
            className="inline-flex min-h-11 items-center hover:text-foreground"
          >
            Resources
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-foreground">CAM Reconciliation Process</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Reconciliation Process for Commercial Landlords: A Step-by-Step
            Guide
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            The complete 7-phase process for completing an annual CAM
            reconciliation, from closing the books to defending tenant audits.
            Use this as your operations playbook each year-end.
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

        {/* Quick answer */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">
            The 7 Phases of CAM Reconciliation
          </h2>
          <p className="text-muted-foreground">
            The CAM reconciliation process has 7 phases: (1) close the books,
            (2) export the GL, (3) classify expenses, (4) apply gross-up and
            caps, (5) generate statements, (6) bill true-ups, and (7) defend
            audits. Most landlords complete phases 1–5 between January and March
            for calendar-year leases, with true-up collection running April
            through June.
          </p>
        </div>

        {/* Phase-by-phase breakdown */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 7-Phase CAM Reconciliation Process
          </h2>

          <div className="space-y-8">
            {/* Phase 1 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  1
                </span>
                <h3 className="text-xl font-semibold">Close the Books</h3>
              </div>
              <p className="mb-4 text-muted-foreground">
                Before exporting anything, the GL must be complete and accurate
                for the full reconciliation year. Incomplete accruals are the
                most common source of restatements and tenant disputes.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Verify all vendor invoices for the year are received and
                  accrued - especially December invoices that arrive in January.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Confirm property tax and insurance premiums are fully booked
                  to the correct accounts for the entire year.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Reconcile bank statements to confirm no property-level
                  disbursements are missing from the GL.
                </li>
              </ul>
            </div>

            {/* Phase 2 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  2
                </span>
                <h3 className="text-xl font-semibold">
                  Export and Clean the GL
                </h3>
              </div>
              <p className="mb-4 text-muted-foreground">
                Export the full general ledger for the property from your
                property management system. The raw export almost always
                requires cleaning before it can be used for reconciliation
                calculations.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Confirm the date range exactly matches the lease year. A
                  single day off creates an irreconcilable gap.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Remove corporate-level allocations, inter-company transfers,
                  and any non-property items that landed in the property GL.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Run a duplicate-entry check. Yardi and MRI both have known
                  edge cases where voided-and-re-entered invoices can appear
                  twice.
                </li>
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                See the full{" "}
                <Link
                  href="/resources/gl-export-qa-cam"
                  className="text-foreground underline hover:no-underline"
                >
                  GL export QA checklist
                </Link>{" "}
                for a complete list of checks.
              </p>
            </div>

            {/* Phase 3 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  3
                </span>
                <h3 className="text-xl font-semibold">Classify Expenses</h3>
              </div>
              <p className="mb-4 text-muted-foreground">
                Expense classification is where most reconciliation errors
                originate. Every GL line must be evaluated against the lease
                before it enters the recoverable pool.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Identify non-recoverable expenses: capital improvements,
                  financing costs, depreciation, leasing commissions, and
                  tenant-specific work.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Flag repair and maintenance items above your capital threshold
                  (typically $5,000 to $10,000) for review. They may be
                  capitalized and therefore excluded.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Apply lease-specific exclusions for each tenant. Some leases
                  exclude management fees; others exclude landscaping or
                  security.
                </li>
              </ul>
            </div>

            {/* Phase 4 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  4
                </span>
                <h3 className="text-xl font-semibold">Apply Adjustments</h3>
              </div>
              <p className="mb-4 text-muted-foreground">
                After classifying expenses, three adjustments may apply before
                you can calculate each tenant&apos;s share: gross-up, CAM caps,
                and management fee calculation.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  If occupancy fell below the gross-up threshold (typically
                  90–95%), normalize the variable portion of recoverable
                  expenses to the threshold occupancy level.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Apply CAM caps. Determine whether each cap is cumulative or
                  non-cumulative and calculate the maximum allowable obligation
                  for each capped tenant.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Calculate the management fee at the contracted rate on the
                  correct base, and verify it does not exceed any per-lease
                  management fee cap.
                </li>
              </ul>
            </div>

            {/* Phase 5 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  5
                </span>
                <h3 className="text-xl font-semibold">
                  Generate Reconciliation Statements
                </h3>
              </div>
              <p className="mb-4 text-muted-foreground">
                Each tenant gets a reconciliation statement showing how their
                share was calculated, what they paid in estimates, and the net
                true-up amount.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Produce a per-tenant calculation showing: total recoverable
                  pool, gross-up adjustment, cap adjustment, pro-rata share
                  percentage, gross obligation, prior-year estimates collected,
                  and net true-up.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Attach supporting schedules: expense detail by category,
                  management fee calculation, pro-rata share schedule, and
                  gross-up workbook (if applicable).
                </li>
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                Use the{" "}
                <Link
                  href="/resources/cam-pre-send-packet-checklist"
                  className="text-foreground underline hover:no-underline"
                >
                  pre-send packet checklist
                </Link>{" "}
                before delivering statements to tenants.
              </p>
            </div>

            {/* Phase 6 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  6
                </span>
                <h3 className="text-xl font-semibold">
                  Send Statements and Collect True-Ups
                </h3>
              </div>
              <p className="mb-4 text-muted-foreground">
                Delivery triggers the tenant&apos;s payment obligation. From
                this point, the reconciliation process becomes a collections and
                dispute management workflow.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Deliver statements via the method required by each lease
                  (certified mail, email, or tenant portal), and document
                  delivery confirmation.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Track payment deadlines per tenant. Most leases give 30 days
                  to pay after statement delivery.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Monitor for tenant disputes. A tenant questioning the
                  statement is different from a tenant not paying; handle each
                  track separately.
                </li>
              </ul>
            </div>

            {/* Phase 7 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  7
                </span>
                <h3 className="text-xl font-semibold">
                  Respond to Tenant Inquiries and Audit Requests
                </h3>
              </div>
              <p className="mb-4 text-muted-foreground">
                Most tenants will ask clarifying questions. Some will invoke
                their audit rights. A well-organized reconciliation file makes
                both situations manageable.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Answer general questions about expense categories and
                  calculations within the SLA specified in your lease (typically
                  15–30 business days).
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  For formal audit requests, assemble the audit defense packet:
                  GL export, vendor invoice index, management fee workbook,
                  pro-rata schedule, and cap bank schedule.
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  Track all open inquiries and document every response. This
                  paper trail is essential if a dispute escalates to litigation.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Timeline table */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Typical CAM Reconciliation Timeline
          </h2>
          <p className="mb-4 text-muted-foreground">
            For calendar-year properties (January 1 – December 31 lease year),
            the reconciliation calendar typically looks like this:
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    Deadline
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Phase</th>
                  <th className="px-4 py-3 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3 font-medium">Jan 31</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Close the books
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Final accruals posted; GL frozen for reconciliation
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Feb 15</td>
                  <td className="px-4 py-3 text-muted-foreground">GL export</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Cleaned and validated GL export ready for classification
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Feb 28</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Classification
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    All expenses classified; recoverable pool finalized
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Mar 15</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Adjustments
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Gross-up, caps, and management fee calculations complete
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Mar 31</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Statements
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    All tenant reconciliation statements delivered (90-day
                    deadline)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Apr 30</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    True-ups due
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    30-day payment window closes; demand letters issued for
                    unpaid balances
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Ongoing</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Audit defense
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Respond to tenant inquiries; most leases allow 1–2 years to
                    invoke audit rights
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* What Can Go Wrong */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Missing the reconciliation deadline
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Many leases include &quot;time is of the essence&quot;
                    language for CAM statements. Missing the 90- or 120-day
                    deadline can permanently forfeit the right to collect
                    underpayments from tenants for that year, a direct hit to
                    NOI with no recourse.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Capital items left in the recoverable pool
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    HVAC replacements, roof work, and parking lot resurfacing
                    frequently appear in operating expense accounts. If not
                    caught before statements go out, tenants will dispute them -
                    often successfully, and demand refunds plus interest.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Wrong pro-rata denominator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Using the wrong rentable area denominator (for example,
                    total building square footage instead of the denominator
                    specified in the lease) affects every tenant&apos;s share.
                    Some leases define a specific denominator that excludes
                    anchor tenants or vacant space; using the wrong number
                    overbills occupied tenants.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying the wrong cap type
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cumulative caps carry an unused cap bank forward year to
                    year; non-cumulative caps reset. Treating a cumulative cap
                    as non-cumulative overbills the tenant in years where the
                    bank has accrued. This is the error most likely to be caught
                    by an experienced tenant auditor.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">
                How long does the CAM reconciliation process take?
              </h3>
              <p className="text-muted-foreground">
                For a single property with 10–20 tenants, the full
                reconciliation process typically takes 20–40 hours spread over
                4–6 weeks. Properties with complex gross-up or cumulative cap
                structures take longer. Software that automates GL
                classification and calculation can reduce this to 4–8 hours.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the CAM reconciliation deadline in most leases?
              </h3>
              <p className="text-muted-foreground">
                Most commercial leases require statements within 90–120 days
                after the lease year ends. For calendar-year properties, that
                means statements are due March 31 to April 30. Missing the
                deadline can forfeit the right to collect underpayments for that
                year.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What expenses are typically non-recoverable?
              </h3>
              <p className="text-muted-foreground">
                Standard non-recoverable expenses include capital improvements,
                ground rent, financing costs, depreciation, leasing commissions,
                tenant improvement costs, advertising, and income taxes. Many
                leases also exclude anchor tenant costs from the pool or exclude
                the landlord&apos;s own occupied space from the denominator.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is a CAM true-up and how is it calculated?
              </h3>
              <p className="text-muted-foreground">
                A CAM true-up is the difference between what a tenant actually
                owes based on reconciled expenses and what they paid in monthly
                estimates. True-up = (actual recoverable expenses × pro-rata
                share) − (monthly estimates × 12). If positive, the tenant owes
                the difference. If negative, the landlord issues a credit.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can a landlord charge a tenant after the reconciliation deadline
                passes?
              </h3>
              <p className="text-muted-foreground">
                It depends on the lease language. Many leases include a
                &quot;time is of the essence&quot; provision. If the landlord
                misses the deadline, they forfeit the right to collect
                underpayments for that year. Some leases allow late delivery but
                cap the collection period. Always track per-property deadline
                dates.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-reconciliation-checklist"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Reconciliation Checklist: 35 Steps
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The complete checklist for a clean year-end close, organized by
                phase.
              </p>
            </Link>
            <Link
              href="/resources/cam-close-checklist"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Close Checklist for Property Controllers
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Monthly and year-end close procedures for property accounting
                teams.
              </p>
            </Link>
            <Link
              href="/resources/cam-pre-send-packet-checklist"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                Pre-Send Packet Checklist
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                20 items to verify before reconciliation statements go out to
                tenants.
              </p>
            </Link>
            <Link
              href="/resources/gl-export-qa-cam"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                GL Export QA for CAM Reconciliation
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to validate a Yardi or MRI GL export before using it for
                reconciliation.
              </p>
            </Link>
            <Link
              href="/resources/common-area-maintenance-reconciliation-explained"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Reconciliation Explained
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Foundational overview of what CAM reconciliation is and why it
                matters.
              </p>
            </Link>
            <Link
              href="/resources/cam-estimate-letter-qa"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                How to QA a CAM Estimate Letter
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                15-step QA process for catching errors before estimate letters
                reach tenants.
              </p>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Automate Your CAM Reconciliation Process
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri uploads your Yardi or MRI GL export and runs every phase of
            the reconciliation process automatically: classification, gross-up,
            caps, per-tenant statements. Every charge is reconciled before
            statements go out.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "cam_reconciliation_process_cta",
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
