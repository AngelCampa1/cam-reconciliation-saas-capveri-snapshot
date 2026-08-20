import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle,
  ChevronRight,
  FileText,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Pro-Rata Share Validation Guide for CRE Teams",
  description:
    "How to validate pro-rata share calculations across a multi-tenant portfolio. Covers denominator verification, anchor exclusion checks, cross-tenant consistency tests, and common errors.",
  alternates: { canonical: `${SITE_URL}/resources/pro-rata-share-validation` },
  openGraph: {
    title: "Pro-Rata Share Validation Guide for CRE Teams",
    description:
      "How to validate pro-rata share calculations across a multi-tenant portfolio. Covers denominator verification, anchor exclusion checks, cross-tenant consistency tests, and common errors.",
    url: `${SITE_URL}/resources/pro-rata-share-validation`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a pro-rata share in a commercial lease?",
    answer:
      "A tenant's pro-rata share is the percentage of building operating expenses they are obligated to pay under their lease. It is calculated as the tenant's rentable square footage divided by the denominator defined in the lease - typically the building's total rentable area, though some leases use a different denominator that excludes anchor tenants or certain spaces.",
  },
  {
    question:
      "Why do pro-rata share errors persist for years without detection?",
    answer:
      "Pro-rata errors are systematic - once an incorrect percentage is entered into a property management system, it applies to every year's reconciliation until someone catches it. There is no automatic cross-check that flags when a tenant's stated pro-rata differs from the calculation implied by their lease. A 5% error in a large tenant's pro-rata share can represent tens of thousands of dollars per year in overbilling or underbilling.",
  },
  {
    question: "Should all tenant pro-rata shares sum to 100%?",
    answer:
      "Not necessarily. If anchor tenants are excluded from the recoverable pool and denominator, the sum of all inline tenant pro-rata shares will be less than 100%. The correct test is whether the sum of all tenant pro-rata shares equals the recoverable percentage of the building. If the anchor occupies 25% of RSF and is fully excluded, the maximum recoverable pro-rata pool is 75%, and inline tenant shares should sum to approximately 75% - not 100%.",
  },
  {
    question: "How often should pro-rata shares be re-validated?",
    answer:
      "Re-validate whenever: (1) a tenant expands or contracts their space; (2) a new tenant executes a lease; (3) a major tenant vacates; (4) a lease amendment changes the denominator definition; or (5) the building undergoes a remeasurement. Annual re-validation as part of the reconciliation preparation process is a best practice even without triggering events.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Pro-Rata Share Validation Guide",
    url: `${SITE_URL}/resources/pro-rata-share-validation`,
  },
]);

export default function ProRataShareValidationPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />
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
          <span className="text-foreground">Pro-Rata Share Validation</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Pro-Rata Share Validation Guide for CRE Teams
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            How to verify pro-rata share calculations across a multi-tenant
            portfolio: denominator confirmation, anchor exclusion checks,
            cross-tenant consistency tests, and the most common errors that
            survive undetected for years.
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

        {/* Quick Answer */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            Pro-rata share validation is a 4-step process: (1){" "}
            <strong>confirm the denominator definition</strong> for each tenant
            per their specific lease; (2){" "}
            <strong>verify the tenant&apos;s RSF</strong> against the lease
            exhibit or most recent remeasurement; (3){" "}
            <strong>calculate the expected percentage</strong> and compare to
            what is in the billing system; (4){" "}
            <strong>cross-check that all tenant percentages sum to</strong> the
            recoverable pool percentage - not necessarily 100% if any tenants
            are excluded.
          </p>
        </div>

        {/* Why Validation Matters */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Why Pro-Rata Validation Matters
          </h2>
          <p className="mb-4 text-muted-foreground">
            Pro-rata errors are the most costly category of CAM billing error
            because they are systematic. A tenant with an incorrect pro-rata
            percentage in your property management system carries that error
            into every year&apos;s reconciliation and every estimated payment
            invoice until someone explicitly corrects it.
          </p>
          <p className="mb-4 text-muted-foreground">
            Gross-up or cap errors vary in magnitude from year to year. A
            pro-rata error produces the same percentage overcharge or
            undercharge every year. A 5% error in a tenant occupying 50,000 SF
            of a 400,000 SF building (correct share: 12.5%) means every year the
            tenant is billed at 13.125% instead. That is a compounding liability
            that accumulates across the audit window.
          </p>
          <p className="text-muted-foreground">
            Pro-rata errors are also hard to spot from inside the system.
            Property management software accepts any percentage you enter; it
            does not verify the entry against the lease. The only way to find
            errors is to audit the calculation manually.
          </p>
        </section>

        {/* 4-Step Process */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 4-Step Validation Process
          </h2>

          <div className="space-y-6">
            <div className="rounded-lg border p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  1
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">
                    Confirm the Denominator Definition for Each Lease
                  </h3>
                  <p className="mb-2 text-sm text-muted-foreground">
                    Pull the lease for each tenant and locate the pro-rata share
                    definition, typically in the definitions section and again
                    in the operating expense article. Identify:
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>
                      &rarr; Is the denominator total building RSF, or only a
                      defined portion?
                    </li>
                    <li>
                      &rarr; Are any tenants explicitly excluded from the
                      denominator (anchor exclusions)?
                    </li>
                    <li>
                      &rarr; Does the denominator change if the building is
                      expanded or if major tenants vacate?
                    </li>
                    <li>
                      &rarr; Is the denominator fixed at commencement, or does
                      it float with actual occupancy?
                    </li>
                  </ul>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Note: Different tenants in the same building may have
                    different denominator definitions depending on when they
                    signed and what they negotiated.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  2
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">
                    Verify the Tenant&apos;s Rentable Square Footage
                  </h3>
                  <p className="mb-2 text-sm text-muted-foreground">
                    The RSF in your billing system should match the RSF in the
                    lease exhibit (the space measurement schedule, floor plan
                    exhibit, or commencement certificate). Confirm:
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>
                      &rarr; Is the SF the original lease RSF or a remeasured
                      figure?
                    </li>
                    <li>
                      &rarr; Has the tenant expanded or contracted? Are lease
                      amendments reflected?
                    </li>
                    <li>
                      &rarr; If BOMA 2024 was applied to the building, was the
                      tenant&apos;s RSF updated?
                    </li>
                    <li>
                      &rarr; Is the RSF in the billing system an integer
                      approximation that differs from the exact lease SF?
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  3
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">
                    Calculate the Expected Percentage and Compare
                  </h3>
                  <p className="mb-2 text-sm text-muted-foreground">
                    Calculate the tenant&apos;s correct pro-rata percentage from
                    scratch:
                  </p>
                  <div className="mb-2 rounded bg-muted/50 p-3 font-mono text-sm">
                    Pro-Rata % = Tenant RSF &divide; Denominator RSF &times; 100
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Compare the calculated result to what is in your billing
                    system. A variance of more than 0.01 percentage points
                    (rounding aside) indicates a data entry error that should be
                    investigated and corrected. Even small rounding differences
                    compound over time and over a multi-tenant building.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  4
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">
                    Cross-Check the Portfolio Sum
                  </h3>
                  <p className="mb-2 text-sm text-muted-foreground">
                    After validating each tenant individually, sum all tenant
                    pro-rata shares and compare to the expected recoverable
                    percentage. The logic:
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>
                      &rarr; If no tenants are excluded from the pool: shares
                      should sum to 100% (or close, accounting for vacant
                      suites)
                    </li>
                    <li>
                      &rarr; If anchor tenants are excluded: shares should sum
                      to the non-anchor percentage of total RSF
                    </li>
                    <li>
                      &rarr; If shares sum to more than 100%: you are
                      over-recovering. This is an immediate billing error
                    </li>
                    <li>
                      &rarr; If shares sum significantly less than 100%: you may
                      be under-recovering, or some tenants have exclusions you
                      have not accounted for
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Common Denominator Definitions */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Common Denominator Definitions
          </h2>
          <p className="mb-4 text-muted-foreground">
            The denominator is the most variable element of the pro-rata
            calculation. Different lease vintages and property types use
            different definitions. Always confirm which applies before
            calculating.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-semibold">
                    Denominator Type
                  </th>
                  <th className="p-3 text-left font-semibold">How It Works</th>
                  <th className="p-3 text-left font-semibold">Common In</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-3 font-medium">Total Building RSF</td>
                  <td className="p-3 text-muted-foreground">
                    All rentable square footage in the building, including
                    vacant suites
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Office, industrial
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Occupied or Leased RSF</td>
                  <td className="p-3 text-muted-foreground">
                    Only SF that is leased (or occupied); denominator floats
                    with vacancies
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Older office leases, tenant-favorable net leases
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">
                    Total Less Anchor Exclusion
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Total building RSF minus anchor tenant(s) excluded per lease
                    agreement
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Retail centers, power centers
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Fixed at Commencement</td>
                  <td className="p-3 text-muted-foreground">
                    A fixed SF figure locked at lease signing; does not update
                    with building changes
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Older leases, negotiated for large tenants
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Project-Wide</td>
                  <td className="p-3 text-muted-foreground">
                    Spans multiple buildings or phases in a campus development
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Office parks, mixed-use, phased developments
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Validation Spreadsheet */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Building a Pro-Rata Validation Spreadsheet
          </h2>
          <p className="mb-4 text-muted-foreground">
            A validation spreadsheet does not need to be complex. The minimum
            viable version has one row per tenant and these columns:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-semibold">Column</th>
                  <th className="p-3 text-left font-semibold">Source</th>
                  <th className="p-3 text-left font-semibold">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-3 font-medium">Tenant Name</td>
                  <td className="p-3 text-muted-foreground">Lease</td>
                  <td className="p-3 text-muted-foreground">Identification</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Tenant RSF</td>
                  <td className="p-3 text-muted-foreground">
                    Lease exhibit / remeasurement
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Numerator for % calculation
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Denominator Type</td>
                  <td className="p-3 text-muted-foreground">
                    Lease definitions section
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Which denominator to apply
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Denominator SF</td>
                  <td className="p-3 text-muted-foreground">
                    Per denominator type
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Denominator value used in calculation
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Calculated %</td>
                  <td className="p-3 text-muted-foreground">
                    RSF &divide; Denominator &times; 100
                  </td>
                  <td className="p-3 text-muted-foreground">
                    What the share should be
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">System-Stated %</td>
                  <td className="p-3 text-muted-foreground">
                    Property management system
                  </td>
                  <td className="p-3 text-muted-foreground">
                    What is actually being billed
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Variance</td>
                  <td className="p-3 text-muted-foreground">
                    Calculated minus System-Stated
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Flag for investigation if &gt; 0.01%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Add a sum row at the bottom of the Calculated % and System-Stated %
            columns to run the portfolio sum test. The sum should equal your
            expected recoverable pool percentage.
          </p>
        </section>

        {/* Anchor Exclusion */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Anchor Exclusion Validation
          </h2>
          <p className="mb-4 text-muted-foreground">
            Anchor exclusions deserve their own validation step because they
            affect the denominator used for all non-excluded tenants. For each
            anchor exclusion:
          </p>
          <ul className="mb-4 space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                Confirm which tenants are excluded - this is specified in the
                inline tenants&apos; leases, not just the anchor&apos;s lease
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                Confirm whether the anchor is excluded from the{" "}
                <em>expense pool</em>, the <em>denominator</em>, or both. Each
                has a different financial impact on inline tenants
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                If the anchor has vacated, verify whether the exclusion clause
                in inline leases still applies. Some clauses tie the exclusion
                to the anchor&apos;s occupancy
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                Recalculate the denominator after accounting for exclusions and
                confirm the inline tenant shares are calculated on the correct
                (reduced) denominator
              </span>
            </li>
          </ul>
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
                    Pro-Rata Percentage Entered at Commencement and Never
                    Updated
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The most common pro-rata error: the percentage was correctly
                    calculated when the lease was first set up, but the building
                    was subsequently remeasured (BOMA 2024, for example), the
                    tenant expanded, or another tenant vacated and changed the
                    denominator. The billing system percentage was never
                    updated. In a large portfolio, tracking which tenants have
                    denominator-sensitive leases requires systematic review.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Total Tenant Shares Summing to More Than 100%
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When total pro-rata shares exceed 100%, the landlord is
                    over-recovering, billing tenants for more than the total
                    expense pool. This is usually caused by a data entry error
                    (e.g., the building RSF denominator was entered too low) or
                    by failing to update the denominator after a tenant
                    expansion increased their RSF without increasing the total
                    building SF. Any sum exceeding 100% requires immediate
                    investigation.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying the Same Denominator to All Tenants When Leases
                    Specify Different Denominators
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In buildings with diverse lease vintages, some tenants may
                    have project-wide denominators, others building-only
                    denominators, and others denominators that exclude specific
                    spaces. Applying a single building denominator to all
                    tenants overbills tenants with larger contractual
                    denominators and underbills tenants with smaller ones.
                    Tenant auditors routinely compare denominators across
                    tenants. Inconsistency is one of the first things they look
                    for.
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
              <h3 className="mb-2 text-lg font-medium">
                What is a pro-rata share in a commercial lease?
              </h3>
              <p className="text-muted-foreground">
                A tenant&apos;s pro-rata share is the percentage of building
                operating expenses they pay under their lease: their rentable
                square footage divided by the denominator defined in the lease.
                Different tenants in the same building can have different
                denominators depending on their lease terms.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Why do pro-rata errors persist for years?
              </h3>
              <p className="text-muted-foreground">
                Pro-rata errors are systematic - once an incorrect percentage is
                in the billing system, it applies to every reconciliation until
                corrected. Property management software accepts any percentage
                you enter; it does not validate against the lease. The only way
                to find errors is a manual audit against the actual lease
                documents.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Should all tenant pro-rata shares sum to 100%?
              </h3>
              <p className="text-muted-foreground">
                Not necessarily. If anchor tenants are excluded from the
                recoverable pool and denominator, the sum of inline tenant
                shares should equal the non-anchor percentage of the building.
                The correct test: shares should sum to the recoverable pool
                percentage, not automatically 100%.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                How often should pro-rata shares be re-validated?
              </h3>
              <p className="text-muted-foreground">
                Re-validate whenever a tenant expands, contracts, or signs; when
                a major tenant vacates; when a lease amendment changes the
                denominator; or when the building is remeasured. Annual
                re-validation as part of reconciliation preparation is a best
                practice regardless of triggering events.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/pro-rata-denominator-explained"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Pro-Rata Denominator Explained
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How denominator definitions vary by lease type and property.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/anchor-exclusion-denominator-risk"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Anchor Exclusion and Denominator Risk
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How anchor exclusions affect inline tenant pro-rata shares.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-gross-up-guide"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Gross-Up Calculation Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Formula, examples, and variable/fixed classification.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/tools/pro-rata-calculator"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Pro-Rata Calculator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Calculate and validate pro-rata shares for any denominator.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Validate Every Pro-Rata Share in Your Portfolio
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri cross-checks every tenant&apos;s pro-rata percentage against
            the denominator definition in their lease - finding systematic
            billing errors that have persisted undetected for years. Works with
            Yardi and MRI exports.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "pro_rata_validation_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
