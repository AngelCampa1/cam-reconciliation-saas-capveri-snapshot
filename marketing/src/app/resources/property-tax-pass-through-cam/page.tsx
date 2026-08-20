import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "Property Tax Pass-Throughs in CAM Reconciliation: What Landlords Must Document",
  description:
    "Property taxes are one of the largest CAM line items and one of the most audited. Here is how to document, prorate, and reconcile property tax pass-throughs correctly.",
  alternates: {
    canonical: `${SITE_URL}/resources/property-tax-pass-through-cam`,
  },
  openGraph: {
    title:
      "Property Tax Pass-Throughs in CAM Reconciliation: What Landlords Must Document",
    description:
      "Property taxes are one of the largest CAM line items and one of the most audited. Here is how to document, prorate, and reconcile property tax pass-throughs correctly.",
    url: `${SITE_URL}/resources/property-tax-pass-through-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Are property taxes subject to CAM caps?",
    answer:
      "In most leases, property taxes are classified as non-controllable expenses and are therefore excluded from CAM caps. Review the lease carefully. Some leases define controllable and non-controllable expenses differently. When in doubt, assume property taxes are non-controllable unless the lease explicitly subjects them to a cap.",
  },
  {
    question:
      "How do I prorate property taxes when the tax year and lease year don't align?",
    answer:
      "You must prorate two partial-year tax bills. For example, if your lease year runs July 1 through June 30 and the tax year is calendar year, you prorate 50% of the current calendar year's bill (July–December) and 50% of the prior year's bill (January–June). Use actual assessed values for each year, not estimates.",
  },
  {
    question:
      "If a property tax appeal reduces the assessment, do I have to credit tenants?",
    answer:
      "Yes, in virtually all well-drafted NNN leases. If an appeal results in a reduced assessment (whether in the current year or as a refund for a prior year), the credit must be passed back to tenants on a pro-rata basis. Some leases specify that the landlord may deduct reasonable appeal costs before distributing the refund.",
  },
  {
    question: "Are special assessments recoverable as part of property taxes?",
    answer:
      "Special assessments (for street improvements, utility districts, public improvement districts) are generally not included in 'real estate taxes' unless the lease explicitly includes them in the definition. Most well-drafted leases separately define special assessments and either include them with explicit language or exclude them. Review the lease definition carefully before billing special assessments.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Property Tax Pass-Throughs in CAM",
    url: `${SITE_URL}/resources/property-tax-pass-through-cam`,
  },
]);

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Property Tax Pass-Throughs in CAM Reconciliation: What Landlords Must Document",
  description:
    "How to document, prorate, and reconcile property tax pass-throughs in commercial leases. Covers fiscal year misalignment, tax appeals, and special assessments.",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: {
    "@type": "Organization",
    name: "CapVeri",
    url: SITE_URL,
  },
  dateModified: "2026-04-01",
  url: `${SITE_URL}/resources/property-tax-pass-through-cam`,
};

export default function PropertyTaxPassThroughPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
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
            Property Tax Pass-Throughs in CAM
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Property Tax Pass-Throughs in CAM Reconciliation: What Landlords
            Must Document
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Property taxes are typically the largest single line item in a
            commercial CAM reconciliation, often exceeding maintenance and
            insurance combined. They are also among the most audited. This guide
            covers the documentation requirements, the proration problem, tax
            appeals, and special assessments.
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
            Property tax pass-throughs are typically non-controllable CAM
            expenses. Most leases do not subject them to CAM caps. They must be
            documented with actual tax bills for the reconciliation period.
            Proration by lease year is critical and frequently done incorrectly.
            When fiscal tax years and lease years do not align, you must prorate
            two partial-year bills to avoid over- or under-billing.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How Property Taxes Work in NNN Leases
          </h2>
          <p className="mb-4 text-muted-foreground">
            In a triple-net (NNN) lease, tenants pay their pro-rata share of
            real estate taxes, property insurance, and maintenance. For property
            taxes, the typical pass-through mechanism is:
          </p>
          <ol className="mb-4 space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1.</span> The
              landlord pays the tax bill directly to the county assessor.
            </li>
            <li>
              <span className="font-medium text-foreground">2.</span> The
              landlord includes actual taxes paid (or accrued per the lease) in
              the annual CAM reconciliation.
            </li>
            <li>
              <span className="font-medium text-foreground">3.</span> Each
              tenant pays their pro-rata share (the tenant&apos;s leased SF
              divided by the total rentable SF of the building or applicable tax
              parcel).
            </li>
          </ol>
          <p className="mb-4 text-muted-foreground">
            In some full-NNN structures, particularly for single-tenant
            properties and ground leases, the tenant may pay property taxes
            directly to the taxing authority. In that case, the landlord&apos;s
            role is limited to ensuring the tenant provides proof of payment and
            timely filing.
          </p>
          <p className="text-muted-foreground">
            In modified gross or gross-plus leases, property taxes above a base
            year amount (or above an expense stop) are passed through. The
            documentation requirements are the same (actual tax bills), but the
            calculation involves comparing current-year taxes against the base
            year amount.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The Proration Problem: Fiscal Years vs. Lease Years
          </h2>
          <p className="mb-4 text-muted-foreground">
            The most common property tax reconciliation error is billing the
            wrong year&apos;s taxes. Fiscal tax years rarely align with lease
            years, and the mismatch requires careful proration.
          </p>

          <div className="mb-6 rounded-lg border bg-muted/40 p-5">
            <p className="mb-3 font-medium">
              Worked Example: Texas Calendar-Year Assessment, July-June Lease
              Year
            </p>
            <p className="mb-3 text-sm text-muted-foreground">
              Texas property taxes are assessed January 1 for the calendar year
              and typically paid in the following December. For a lease year
              running July 1, 2025 through June 30, 2026:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 pr-4 text-left font-medium">Period</th>
                    <th className="pb-2 pr-4 text-left font-medium">
                      Tax Bill Used
                    </th>
                    <th className="pb-2 text-left font-medium">Months</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2 pr-4">Jul 1 – Dec 31, 2025</td>
                    <td className="py-2 pr-4">2025 calendar-year tax bill</td>
                    <td className="py-2">6 of 12 months = 50%</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Jan 1 – Jun 30, 2026</td>
                    <td className="py-2 pr-4">2026 calendar-year tax bill</td>
                    <td className="py-2">6 of 12 months = 50%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-1 text-sm text-muted-foreground">
              <p>
                2025 annual tax bill: $180,000 × 50% = $90,000 allocated to this
                lease year
              </p>
              <p>
                2026 annual tax bill: $196,000 × 50% = $98,000 allocated to this
                lease year
              </p>
              <p className="font-medium text-foreground">
                Total taxes for the lease year: $188,000
              </p>
              <p className="text-xs mt-2">
                Note: Do not simply use the $180,000 or $196,000 full-year bill.
                Doing so would over- or under-charge by the difference in
                assessed values.
              </p>
            </div>
          </div>

          <p className="text-muted-foreground">
            Different states have different assessment and payment schedules.
            California taxes are due in two installments (November and February
            for a July–June fiscal year). Florida uses a calendar year with
            discounts for early payment. Always confirm the actual payment dates
            and proration methodology for the jurisdiction.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Assessment vs. Actual Payment: What to Use for Reconciliation
          </h2>
          <p className="mb-4 text-muted-foreground">
            Most leases specify whether the landlord bills based on actual taxes
            paid, accrued taxes, or the assessed amount for the period. These
            differ when:
          </p>
          <ul className="mb-4 space-y-2 text-muted-foreground">
            <li>
              A tax appeal is pending (actual payment may differ from assessed
              amount)
            </li>
            <li>Taxes are paid in installments across calendar years</li>
            <li>
              A supplemental assessment is issued mid-year (common in California
              after a sale)
            </li>
          </ul>
          <p className="mb-4 text-muted-foreground">
            The safest approach, and the one most consistent with standard lease
            language, is to use the actual taxes paid (or accrued on a cash
            basis per the lease) during the reconciliation period, prorated as
            described above. If a tax appeal is pending, some landlords bill the
            assessed amount and later credit the reduction when received.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Tax Appeals: Crediting Tenants for Reductions
          </h2>
          <p className="mb-4 text-muted-foreground">
            When a property tax appeal succeeds, the reduction or refund must be
            passed back to tenants in most NNN lease structures. The mechanics
            depend on the lease:
          </p>
          <ul className="mb-4 space-y-3 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                Current-year reduction:
              </span>{" "}
              Bill the reduced amount in the reconciliation. No separate credit
              needed unless estimates were already sent.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Refund for a prior year:
              </span>{" "}
              Allocate the refund to the lease year(s) to which it relates and
              issue credits to tenants who were in occupancy during those
              periods, including tenants who may have since vacated.
            </li>
            <li>
              <span className="font-medium text-foreground">Appeal costs:</span>{" "}
              Most leases allow the landlord to deduct reasonable appeal costs
              (legal fees, appraisal fees) from the refund before distributing
              credits. The lease language controls. Some leases cap deductible
              appeal costs at a percentage of the refund.
            </li>
          </ul>
          <p className="text-muted-foreground">
            Texas landlords face additional complexity under the HCAD (Harris
            County Appraisal District) process, where property tax protests must
            be filed annually by May 15. The two-year lookback period on refunds
            means credits may be owed to tenants for prior lease years.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Special Assessments: Usually Not Included
          </h2>
          <p className="mb-4 text-muted-foreground">
            Special assessments (charges for public improvements like street
            widening, utility districts, public improvement districts (PIDs), or
            municipal utility districts (MUDs)) are not automatically included
            in "real estate taxes" or "property taxes" under most leases.
          </p>
          <p className="mb-4 text-muted-foreground">
            The lease definition of "real estate taxes" controls. Many leases
            specifically list what is included: "all real property taxes,
            personal property taxes, and general and special assessments levied
            against the Property." If the word "assessments" appears in this
            definition, special assessments may be recoverable. If the
            definition is limited to "real property taxes and governmental
            impositions," special assessments may be excluded.
          </p>
          <p className="text-muted-foreground">
            PIDs and MUDs are common in Texas suburban commercial developments
            and can be significant line items ($5–$15/SF annually in some
            districts). Verify the lease definition before billing these as
            property taxes.
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
                    Billing the wrong tax year without proration
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Using a full calendar-year tax bill for a non-calendar-year
                    lease period overbills tenants when the current year&apos;s
                    assessment is higher, or underbills when it is lower. Always
                    prorate two partial-year bills when the fiscal tax year and
                    lease year do not align.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Failing to credit tenants when a tax appeal succeeds
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a property tax assessment is reduced (whether through a
                    formal appeal or an informal correction), the reduction must
                    be credited back to tenants who paid based on the original
                    higher amount. Retaining the refund creates overbilling
                    liability.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Including special assessments without explicit lease
                    authority
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    PID and MUD assessments can be substantial, and including
                    them as "real estate taxes" when the lease definition
                    doesn&apos;t cover them creates a tenant audit exposure.
                    Review the lease definition of real estate taxes before
                    adding any special assessment line items.
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
                Are property taxes subject to CAM caps?
              </h3>
              <p className="text-muted-foreground">
                In most leases, property taxes are non-controllable expenses and
                are excluded from CAM caps. Some leases define controllable and
                non-controllable separately. Verify the lease before applying
                any cap to the tax line item.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How do I prorate property taxes when the tax year and lease year
                don&apos;t align?
              </h3>
              <p className="text-muted-foreground">
                Prorate two partial-year tax bills based on the months each tax
                year overlaps with the lease year. For a July–June lease year in
                a calendar-tax-year state, you use 50% of the prior
                calendar-year bill and 50% of the current calendar-year bill.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                If a property tax appeal reduces the assessment, do I have to
                credit tenants?
              </h3>
              <p className="text-muted-foreground">
                Yes. In virtually all NNN leases, tax refunds from successful
                appeals must be passed back to tenants pro-rata. The landlord
                may typically deduct reasonable appeal costs before distributing
                credits, but only if the lease permits it.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Are special assessments recoverable as part of property taxes?
              </h3>
              <p className="text-muted-foreground">
                Only if the lease definition of "real estate taxes" explicitly
                includes special assessments. Review the lease definition
                carefully. PIDs, MUDs, and similar district assessments can be
                significant in some markets and are often contested when billed
                without clear lease authority.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/recoverable-vs-nonrecoverable-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">
                Recoverable vs. Non-Recoverable CAM Expenses
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete guide to which operating expenses can be passed through
                to tenants.
              </p>
            </Link>
            <Link
              href="/resources/cam-reconciliation-checklist"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Reconciliation Checklist</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Step-by-step checklist for preparing and reviewing CAM
                reconciliation statements.
              </p>
            </Link>
            <Link
              href="/resources/cam-cap-enforcement"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Cap Enforcement</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to apply lease caps correctly, including controllable vs.
                non-controllable separation.
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Reconciliation Software</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Automate property tax proration and reconciliation with CapVeri.
              </p>
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Eliminate Property Tax Proration Errors
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri automatically prorates property taxes across fiscal year
            boundaries and flags missing tax bill documentation before your
            reconciliation goes out.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "property_tax_pass_through_cta",
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
