import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  ChevronRight,
  FileText,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Gross-Up Calculation Guide: Formula, Examples & Common Errors",
  description:
    "A complete guide to CAM gross-up for landlords. Covers the formula, variable vs. fixed expense classification, multiple worked examples, and the 5 errors most likely to trigger a dispute.",
  alternates: { canonical: `${SITE_URL}/resources/cam-gross-up-guide` },
  openGraph: {
    title:
      "CAM Gross-Up Calculation Guide for Landlords: Formula, Examples, and Common Errors",
    description:
      "A complete guide to CAM gross-up for landlords. Covers the formula, variable vs. fixed expense classification, multiple worked examples, and the 5 errors most likely to trigger a dispute.",
    url: `${SITE_URL}/resources/cam-gross-up-guide`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is CAM gross-up and why does it exist?",
    answer:
      "CAM gross-up is a lease provision that adjusts variable operating expenses upward to what they would be if the building were occupied at a defined threshold - typically 90% or 95%. It exists because many operating expenses (cleaning, utilities, security) scale with occupancy. Without gross-up, tenants in a half-occupied building would pay artificially low CAM charges based on a fraction of the building's variable costs, creating a windfall at the landlord's expense during lease-up periods.",
  },
  {
    question: "Which expenses can be grossed up?",
    answer:
      "Only variable expenses (those that increase or decrease based on building occupancy) can be grossed up. Typical variable expenses include janitorial services, utilities, security, and waste removal. Fixed expenses such as property taxes, insurance premiums, roof repair contracts, and management fees (if fixed) cannot be grossed up. Grossing up a fixed expense is one of the most common CAM billing errors and a frequent source of tenant audit findings.",
  },
  {
    question: "What occupancy percentage should be used for gross-up?",
    answer:
      "The gross-up percentage is set by the lease, typically 90% or 95% of rentable square footage actually occupied (not leased). Some leases define occupancy as 'leased or occupied,' which includes vacant suites held under letter of intent. Always use the occupancy definition from the specific lease, not a building-wide standard. Using the wrong occupancy figure (for example, using percent leased when the lease says percent occupied) is a common gross-up error.",
  },
  {
    question:
      "Should the actual occupancy be calendar-year average or lease-year?",
    answer:
      "Most leases specify calendar-year occupancy (January through December), but some use the tenant's lease year if it differs from the calendar year. Mixing these is a frequent error. A tenant whose lease year is July through June and whose reconciliation covers that period should have the gross-up calculated on the occupancy during that specific period, not the calendar year. Check the lease definition before running the gross-up.",
  },
  {
    question:
      "What happens if actual occupancy exceeds the gross-up threshold?",
    answer:
      "If actual occupancy is already above the gross-up threshold (for example, the building is 96% occupied when the threshold is 95%), no gross-up is applied. The actual expenses are used as-is. Gross-up only increases the expense pool; it never decreases it below actual.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Gross-Up Calculation Guide",
    url: `${SITE_URL}/resources/cam-gross-up-guide`,
  },
]);

export default function CamGrossUpGuidePage() {
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
          <span className="text-foreground">CAM Gross-Up Guide</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Gross-Up Calculation Guide for Landlords: Formula, Examples, and
            Common Errors
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            A complete technical reference for calculating CAM gross-up
            correctly: the formula, variable vs. fixed expense classification,
            worked examples at different occupancy levels, and the five errors
            most likely to trigger a tenant dispute.
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
            CAM gross-up adjusts variable operating expenses to what they would
            be at a defined occupancy threshold, typically 90–95%. This prevents
            tenants from underpaying CAM during low-occupancy periods by
            ensuring the variable expense pool reflects what it <em>would</em>{" "}
            cost to operate a fully occupied building, not the artificially low
            costs of a partially occupied one. Only variable expenses are
            grossed up; fixed expenses are included as-is.
          </p>
        </div>

        {/* Why Gross-Up Exists */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Why Gross-Up Exists</h2>
          <p className="mb-4 text-muted-foreground">
            Operating expenses in a commercial building are not purely fixed.
            Janitorial services cost more when 40 suites are occupied than when
            10 are. Security staffing is heavier with more tenants. Common area
            utilities increase with foot traffic. In a building that is 60%
            occupied, these variable costs might total $300,000. At 95%
            occupancy, they might total $475,000.
          </p>
          <p className="mb-4 text-muted-foreground">
            Without gross-up, tenants who sign leases during lease-up get a
            structural discount: they pay their pro-rata share of a smaller
            expense pool than they will pay when the building fills up. That
            discount is funded by the landlord, who absorbs costs that increase
            as new tenants move in. The gross-up clause eliminates this
            imbalance by normalizing variable expenses to what they would be at
            the defined occupancy threshold.
          </p>
          <p className="text-muted-foreground">
            Gross-up only applies when a lease contains a gross-up provision -
            many older leases and some net leases do not. Never apply gross-up
            if the lease does not authorize it.
          </p>
        </section>

        {/* Formula */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">The Gross-Up Formula</h2>
          <div className="mb-6 rounded-xl border bg-muted/40 p-6 font-mono text-sm">
            <p className="mb-3 font-bold">Step 1: Gross Up Variable Expenses</p>
            <p className="mb-4 text-muted-foreground">
              Grossed-Up Variable Expenses = Actual Variable Expenses &divide;
              Actual Occupancy % &times; Gross-Up Threshold %
            </p>
            <p className="mb-3 font-bold">
              Step 2: Add Fixed Expenses Unchanged
            </p>
            <p className="mb-4 text-muted-foreground">
              Total Grossed-Up Expense Pool = Grossed-Up Variable Expenses +
              Actual Fixed Expenses
            </p>
            <p className="mb-3 font-bold">Step 3: Calculate Tenant Share</p>
            <p className="text-muted-foreground">
              Tenant Share = Total Grossed-Up Expense Pool &times; (Tenant RSF
              &divide; Denominator RSF)
            </p>
          </div>
          <p className="text-muted-foreground">
            The gross-up threshold is specified in the lease. Most commercial
            leases use 90% or 95%. The actual occupancy should be calculated as
            the average occupancy percentage over the reconciliation period,
            weighted by days or months, using the definition (occupied vs.
            leased) specified in the lease.
          </p>
        </section>

        {/* Worked Example 1 */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Worked Example 1: Office Building at 80% Occupancy
          </h2>
          <div className="mb-4 rounded-lg border p-4">
            <p className="mb-3 font-medium">Given:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Total building RSF: 200,000 SF</li>
              <li>Actual occupancy: 80% (160,000 SF occupied)</li>
              <li>Gross-up threshold: 90%</li>
              <li>Total operating expenses: $500,000</li>
              <li>Variable expenses: 60% of total = $300,000</li>
              <li>Fixed expenses: 40% of total = $200,000</li>
              <li>Tenant RSF: 20,000 SF</li>
              <li>Denominator: 200,000 SF (whole building)</li>
            </ul>
          </div>

          <div className="mb-4 rounded-xl border bg-muted/40 p-6 font-mono text-sm">
            <p className="mb-2 font-bold">Step 1: Gross up variable expenses</p>
            <p className="mb-4 text-muted-foreground">
              $300,000 &divide; 0.80 &times; 0.90 = $337,500
            </p>
            <p className="mb-2 font-bold">Step 2: Total grossed-up pool</p>
            <p className="mb-4 text-muted-foreground">
              $337,500 (variable, grossed up) + $200,000 (fixed, unchanged) =
              $537,500
            </p>
            <p className="mb-2 font-bold">Step 3: Tenant share</p>
            <p className="mb-4 text-muted-foreground">
              $537,500 &times; (20,000 &divide; 200,000) = $537,500 &times; 10%
              = $53,750
            </p>
            <p className="mb-2 font-bold">Without gross-up (for comparison):</p>
            <p className="text-muted-foreground">
              $500,000 &times; 10% = $50,000
            </p>
          </div>

          <p className="text-muted-foreground">
            The gross-up adds $37,500 to the expense pool, resulting in the
            tenant paying $3,750 more than they would have without gross-up. At
            scale - a 100,000 SF tenant in this building - the difference would
            be $18,750 for the year.
          </p>
        </section>

        {/* Worked Example 2 */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Worked Example 2: Office Building at 65% Occupancy (High-Vacancy
            Scenario)
          </h2>
          <div className="mb-4 rounded-lg border p-4">
            <p className="mb-3 font-medium">Given:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Total building RSF: 300,000 SF</li>
              <li>Actual occupancy: 65%</li>
              <li>Gross-up threshold: 95%</li>
              <li>Total operating expenses: $800,000</li>
              <li>Variable expenses: 70% of total = $560,000</li>
              <li>Fixed expenses: 30% of total = $240,000</li>
              <li>Tenant RSF: 30,000 SF</li>
              <li>Denominator: 300,000 SF</li>
            </ul>
          </div>

          <div className="mb-4 rounded-xl border bg-muted/40 p-6 font-mono text-sm">
            <p className="mb-2 font-bold">Step 1: Gross up variable expenses</p>
            <p className="mb-4 text-muted-foreground">
              $560,000 &divide; 0.65 &times; 0.95 = $818,462 (rounded)
            </p>
            <p className="mb-2 font-bold">Step 2: Total grossed-up pool</p>
            <p className="mb-4 text-muted-foreground">
              $818,462 + $240,000 = $1,058,462
            </p>
            <p className="mb-2 font-bold">Step 3: Tenant share (10%)</p>
            <p className="mb-4 text-muted-foreground">
              $1,058,462 &times; 10% = $105,846
            </p>
            <p className="mb-2 font-bold">Without gross-up:</p>
            <p className="text-muted-foreground">
              $800,000 &times; 10% = $80,000
            </p>
          </div>

          <p className="text-muted-foreground">
            At 65% occupancy with a 95% gross-up threshold, the gross-up adds
            $258,462 to the expense pool, a 32% increase. The tenant pays
            $25,846 more than they would without gross-up. This amplification
            effect is why gross-up provisions are most significant in
            high-vacancy or lease-up scenarios, and why the variable/fixed
            classification matters so much: every dollar misclassified as
            variable increases the gross-up amplification.
          </p>
        </section>

        {/* Variable vs Fixed Table */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Variable vs. Fixed Expense Classification
          </h2>
          <p className="mb-4 text-muted-foreground">
            The variable/fixed split is the most consequential input in the
            gross-up calculation and the one most often applied incorrectly.
            Below is a reference classification for common operating expense
            categories.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-semibold">
                    Expense Category
                  </th>
                  <th className="p-3 text-center font-semibold">
                    Classification
                  </th>
                  <th className="p-3 text-left font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-3">Janitorial services</td>
                  <td className="p-3 text-center font-medium text-amber-600">
                    Variable
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Scales with occupied SF
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Common area electricity</td>
                  <td className="p-3 text-center font-medium text-amber-600">
                    Variable
                  </td>
                  <td className="p-3 text-muted-foreground">
                    HVAC load varies with occupancy
                  </td>
                </tr>
                <tr>
                  <td className="p-3">HVAC maintenance</td>
                  <td className="p-3 text-center font-medium text-amber-600">
                    Variable
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Run-time correlates with occupancy
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Security staffing</td>
                  <td className="p-3 text-center font-medium text-amber-600">
                    Variable
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Headcount often occupancy-driven
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Waste removal</td>
                  <td className="p-3 text-center font-medium text-amber-600">
                    Variable
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Volume scales with tenants
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Landscaping</td>
                  <td className="p-3 text-center font-medium text-blue-600">
                    Fixed
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Contract-based, not occupancy-driven
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Property taxes</td>
                  <td className="p-3 text-center font-medium text-blue-600">
                    Fixed
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Tax bill does not change with occupancy
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Building insurance</td>
                  <td className="p-3 text-center font-medium text-blue-600">
                    Fixed
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Premium is independent of occupancy
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Roof maintenance</td>
                  <td className="p-3 text-center font-medium text-blue-600">
                    Fixed
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Condition-driven, not occupancy-driven
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Elevator maintenance</td>
                  <td className="p-3 text-center font-medium text-blue-600">
                    Fixed
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Contract-based; often fixed rate
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Management fee (% of rent)</td>
                  <td className="p-3 text-center font-medium text-amber-600">
                    Variable
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Scales with collected rent, which tracks occupancy
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Management fee (fixed)</td>
                  <td className="p-3 text-center font-medium text-blue-600">
                    Fixed
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Does not vary with occupancy
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Parking lot maintenance</td>
                  <td className="p-3 text-center font-medium text-blue-600">
                    Fixed
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Paving and striping independent of occupancy
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Pest control</td>
                  <td className="p-3 text-center font-medium text-blue-600">
                    Fixed
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Contract-based; not occupancy-driven
                  </td>
                </tr>
                <tr>
                  <td className="p-3">Common area repairs</td>
                  <td className="p-3 text-center font-medium text-amber-600">
                    Variable
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Wear correlates with foot traffic
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Some expense categories are mixed (for example, utilities that
            include both a demand charge (fixed) and a usage charge (variable)).
            When a category contains both components, split it or classify based
            on the primary driver. Document your classification rationale in the
            reconciliation workbook.
          </p>
        </section>

        {/* 5 Common Errors */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            5 Common Gross-Up Errors That Trigger Disputes
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    1. Including Fixed Expenses in the Gross-Up
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Grossing up property taxes, insurance, or a fixed management
                    fee inflates the expense pool with expenses that do not
                    actually vary with occupancy. This is the single most
                    contested gross-up error in tenant audits and is almost
                    always an automatic credit when found.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    2. Using Calendar-Year Occupancy When the Lease Specifies
                    Lease-Year
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A tenant with a July–June lease year should have the
                    gross-up calculated on July–June occupancy, not the January–
                    December calendar year. If the building had high occupancy
                    in Q1 but low occupancy in Q3–Q4 (which fall in the tenant's
                    lease year), using calendar-year occupancy will understate
                    the gross-up adjustment.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    3. Applying Gross-Up When the Lease Does Not Require It
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Older leases, modified gross leases, and some net leases do
                    not contain gross-up provisions. Applying gross-up without
                    lease authorization is a billing error that must be reversed
                    in full. Always confirm the gross-up clause exists and note
                    its exact language before running the calculation.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    4. Using Gross Revenue Occupancy Instead of RSF Occupancy
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some property managers calculate occupancy as percent of
                    gross potential revenue collected, rather than as percent of
                    rentable square footage physically occupied. If the building
                    has several free-rent periods or below-market leases, these
                    two figures can diverge significantly. The gross-up clause
                    almost always specifies RSF occupancy, not revenue
                    occupancy.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    5. Not Updating the Variable/Fixed Split When Building
                    Operations Change
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If a building replaced its HVAC system with a fixed-cost
                    maintenance contract, or switched from per-cleaning
                    janitorial to a flat monthly contract, the variable/fixed
                    split may have changed materially. Using the same split from
                    three years ago without reviewing current contract
                    structures is a common source of inaccuracy that auditors
                    flag.
                  </p>
                </div>
              </div>
            </div>
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
                    Gross-Up Amplification at Low Occupancy Can Exceed Actual
                    Costs
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In extreme low-occupancy scenarios (below 50%), the gross-up
                    formula can produce a theoretical expense pool that
                    substantially exceeds what it would actually cost to run the
                    building fully occupied. Some leases cap the gross-up
                    adjustment; others do not. If yours does not, tenants may
                    dispute the gross-up as unreasonable, and some courts have
                    agreed.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    No Documentation of the Variable/Fixed Determination
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If your reconciliation workbook does not document how each
                    expense category was classified as variable or fixed,
                    auditors will demand justification for every classification.
                    Without documented rationale, you are defending arbitrary
                    decisions under pressure, which usually results in
                    concessions.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Inconsistent Gross-Up Methodology Across Tenants in the Same
                    Building
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Using different variable/fixed splits or different occupancy
                    definitions across tenants in the same building creates
                    internal inconsistency. If two tenants compare their CAM
                    reconciliations (which experienced auditors routinely do),
                    inconsistent methodology becomes an immediate dispute item
                    for both tenants.
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
                What is CAM gross-up and why does it exist?
              </h3>
              <p className="text-muted-foreground">
                CAM gross-up is a lease provision that adjusts variable
                operating expenses upward to what they would be at a defined
                occupancy threshold, typically 90–95%. It prevents tenants from
                benefiting from artificially low costs during low-occupancy
                periods by ensuring every tenant pays their share of what the
                building would cost to operate fully occupied.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Which expenses can be grossed up?
              </h3>
              <p className="text-muted-foreground">
                Only variable expenses (those that increase or decrease based on
                occupancy) can be grossed up. Fixed expenses (property taxes,
                insurance, fixed contracts) cannot. Grossing up a fixed expense
                is one of the most common and most-cited tenant audit findings.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What occupancy percentage is used for gross-up?
              </h3>
              <p className="text-muted-foreground">
                The occupancy percentage is set by the lease, typically 90% or
                95% of rentable square footage actually occupied. The lease also
                defines whether to use actual occupancy or &ldquo;leased or
                occupied&rdquo; occupancy. Always use the definition from the
                specific tenant&apos;s lease; do not assume a building-wide
                standard applies.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What happens if actual occupancy exceeds the gross-up threshold?
              </h3>
              <p className="text-muted-foreground">
                If actual occupancy is already above the gross-up threshold (the
                building is 96% occupied when the threshold is 95%), no gross-up
                is applied. Actual expenses are used as-is. Gross-up only
                increases the expense pool; it never reduces it below actual.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Should calendar-year or lease-year occupancy be used?
              </h3>
              <p className="text-muted-foreground">
                Most leases specify calendar-year occupancy, but some specify
                the tenant&apos;s lease year. Check the gross-up provision
                specifically, not just the definition section of the lease.
                Using calendar-year occupancy for a tenant with a July–June
                lease year can produce a materially different gross-up
                adjustment.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/gross-up-clause-explained"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Gross-Up Clause Explained
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How to read and interpret gross-up language in commercial
                    leases.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/pro-rata-share-validation"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Pro-Rata Share Validation Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How to verify pro-rata calculations across a multi-tenant
                    portfolio.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-cap-enforcement"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Cap Enforcement Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How to apply cumulative and non-cumulative CAM caps
                    correctly.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/tools/cam-gross-up-calculator"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Gross-Up Calculator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Verify your gross-up math in seconds.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Verify Your Gross-Up Before Tenants Audit It
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri checks your gross-up calculation against the lease: correct
            variable/fixed classification, accurate occupancy figures, and
            proper threshold application, using your Yardi or MRI export. Catch
            errors before they become dispute letters.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_gross_up_guide_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
