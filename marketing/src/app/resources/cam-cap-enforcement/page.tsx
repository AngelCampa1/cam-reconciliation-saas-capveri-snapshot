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
  title: "CAM Cap Enforcement Guide: Cumulative and Non-Cumulative Caps",
  description:
    "How to correctly apply CAM caps, including cumulative cap bank calculations, non-cumulative resets, and controllable-only cap structures. With worked examples and common enforcement errors.",
  alternates: { canonical: `${SITE_URL}/resources/cam-cap-enforcement` },
  openGraph: {
    title:
      "CAM Cap Enforcement Guide: Applying Cumulative and Non-Cumulative Caps",
    description:
      "How to correctly apply CAM caps, including cumulative cap bank calculations, non-cumulative resets, and controllable-only cap structures. With worked examples and common enforcement errors.",
    url: `${SITE_URL}/resources/cam-cap-enforcement`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a CAM cap?",
    answer:
      "A CAM cap limits the year-over-year increase in a tenant's CAM obligation. The cap is expressed as a percentage of the prior year's actual CAM charge. If the cap is 5% and the tenant paid $50,000 last year, their CAM obligation this year cannot exceed $52,500 regardless of actual expense increases, unless the lease contains exceptions for non-controllable expenses like property taxes and insurance.",
  },
  {
    question:
      "What is the difference between a cumulative and non-cumulative CAM cap?",
    answer:
      "A non-cumulative cap resets each year. Unused capacity from years where actual increases were below the cap is permanently lost. A cumulative cap banks unused capacity, allowing it to carry forward to future years where the cap can be applied against a larger increase. Cumulative caps can significantly increase landlord recovery in high-inflation years following a low-inflation period.",
  },
  {
    question: "What are controllable vs. non-controllable CAM expenses?",
    answer:
      "Controllable expenses are those within the landlord's management discretion: janitorial, security staffing, landscaping contracts, administrative costs, and management fees. Non-controllable expenses are outside landlord control: property taxes, building insurance, utilities (which are subject to utility company pricing), and sometimes snow removal. Many CAM caps apply only to controllable expenses, leaving non-controllable expenses uncapped and recoverable in full.",
  },
  {
    question: "How is the CAM cap base year established?",
    answer:
      "The cap base year is typically the first full lease year of CAM charges. For a lease that commences mid-year, the first full year may be the second calendar year of the lease. Some leases reset the base year when the cap is modified by amendment. Always check whether the base year is defined in the lease or implied by context.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Cap Enforcement Guide",
    url: `${SITE_URL}/resources/cam-cap-enforcement`,
  },
]);

export default function CamCapEnforcementPage() {
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
          <span className="text-foreground">CAM Cap Enforcement</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Cap Enforcement Guide: Applying Cumulative and Non-Cumulative
            Caps
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            A technical guide to correctly applying CAM caps, including
            cumulative cap bank calculations, non-cumulative resets,
            controllable-only structures, and the three most common enforcement
            failures that trigger tenant disputes.
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

        {/* Quick Answer */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            A CAM cap limits the year-over-year increase in a tenant&apos;s CAM
            obligation. <strong>Non-cumulative caps</strong> reset each year -
            unused capacity is permanently lost.{""}
            <strong>Cumulative caps</strong> bank unused capacity and allow
            larger increases in future years if the cap was not fully used. Most
            caps apply only to controllable expenses (janitorial, security,
            management fee); property taxes and insurance are typically excluded
            and recoverable in full regardless of the cap.
          </p>
        </div>

        {/* Non-Cumulative Cap */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Non-Cumulative CAM Cap Mechanics
          </h2>
          <p className="mb-4 text-muted-foreground">
            A non-cumulative cap sets a maximum percentage increase from one
            year to the next. If actual expenses increase less than the cap, the
            difference is permanently lost. It cannot be recovered in subsequent
            years.
          </p>

          <h3 className="mb-3 text-lg font-medium">Worked Example</h3>
          <div className="mb-4 rounded-lg border p-4">
            <p className="mb-2 font-medium text-sm">
              Lease terms: 5% non-cumulative cap; Base year CAM = $50,000
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-semibold">Year</th>
                    <th className="p-2 text-right font-semibold">
                      Prior Year Base
                    </th>
                    <th className="p-2 text-right font-semibold">
                      5% Cap Limit
                    </th>
                    <th className="p-2 text-right font-semibold">
                      Actual Expenses
                    </th>
                    <th className="p-2 text-right font-semibold">
                      Tenant Owes
                    </th>
                    <th className="p-2 text-right font-semibold">
                      Unused Capacity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="p-2">Year 1</td>
                    <td className="p-2 text-right">$50,000</td>
                    <td className="p-2 text-right">$52,500</td>
                    <td className="p-2 text-right">$51,500</td>
                    <td className="p-2 text-right font-medium">$51,500</td>
                    <td className="p-2 text-right text-destructive-strong">
                      $1,000 lost
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Year 2</td>
                    <td className="p-2 text-right">$51,500</td>
                    <td className="p-2 text-right">$54,075</td>
                    <td className="p-2 text-right">$56,000</td>
                    <td className="p-2 text-right font-medium">$54,075</td>
                    <td className="p-2 text-right text-muted-foreground">
                      Cap applied
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Year 3</td>
                    <td className="p-2 text-right">$54,075</td>
                    <td className="p-2 text-right">$56,779</td>
                    <td className="p-2 text-right">$54,800</td>
                    <td className="p-2 text-right font-medium">$54,800</td>
                    <td className="p-2 text-right text-destructive-strong">
                      $1,979 lost
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            In Year 1, actual expenses were $1,000 below the cap limit. Under a
            non-cumulative cap, that $1,000 of unused capacity disappears. The
            Year 2 cap base is the actual Year 1 charge ($51,500), not the Year
            1 cap limit ($52,500). This ratchet effect means non-cumulative caps
            tend to compound in the tenant&apos;s favor in low-inflation years.
          </p>
        </section>

        {/* Cumulative Cap */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Cumulative CAM Cap Bank Mechanics
          </h2>
          <p className="mb-4 text-muted-foreground">
            A cumulative cap allows unused capacity (years where actual
            increases were below the cap limit) to carry forward as a bank
            balance. In future years where actual increases exceed the annual
            cap, the landlord can draw on the bank to allow a larger recovery.
          </p>

          <h3 className="mb-3 text-lg font-medium">Worked Example</h3>
          <div className="mb-4 rounded-lg border p-4">
            <p className="mb-2 font-medium text-sm">
              Lease terms: 5% cumulative cap; Base year CAM = $50,000
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-semibold">Year</th>
                    <th className="p-2 text-right font-semibold">Prior Base</th>
                    <th className="p-2 text-right font-semibold">
                      Annual 5% Allowance
                    </th>
                    <th className="p-2 text-right font-semibold">
                      Bank Balance
                    </th>
                    <th className="p-2 text-right font-semibold">
                      Max Allowed
                    </th>
                    <th className="p-2 text-right font-semibold">Actual</th>
                    <th className="p-2 text-right font-semibold">
                      Tenant Owes
                    </th>
                    <th className="p-2 text-right font-semibold">New Bank</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs">
                  <tr>
                    <td className="p-2">Year 1</td>
                    <td className="p-2 text-right">$50,000</td>
                    <td className="p-2 text-right">$2,500</td>
                    <td className="p-2 text-right">$0</td>
                    <td className="p-2 text-right">$52,500</td>
                    <td className="p-2 text-right">$51,500</td>
                    <td className="p-2 text-right font-medium">$51,500</td>
                    <td className="p-2 text-right text-green-600">$1,000</td>
                  </tr>
                  <tr>
                    <td className="p-2">Year 2</td>
                    <td className="p-2 text-right">$51,500</td>
                    <td className="p-2 text-right">$2,575</td>
                    <td className="p-2 text-right">$1,000</td>
                    <td className="p-2 text-right">$55,075</td>
                    <td className="p-2 text-right">$53,200</td>
                    <td className="p-2 text-right font-medium">$53,200</td>
                    <td className="p-2 text-right text-green-600">$1,875</td>
                  </tr>
                  <tr>
                    <td className="p-2">Year 3</td>
                    <td className="p-2 text-right">$53,200</td>
                    <td className="p-2 text-right">$2,660</td>
                    <td className="p-2 text-right">$1,875</td>
                    <td className="p-2 text-right">$57,735</td>
                    <td className="p-2 text-right">$58,000</td>
                    <td className="p-2 text-right font-medium">$57,735</td>
                    <td className="p-2 text-right text-muted-foreground">$0</td>
                  </tr>
                  <tr>
                    <td className="p-2">Year 4</td>
                    <td className="p-2 text-right">$57,735</td>
                    <td className="p-2 text-right">$2,887</td>
                    <td className="p-2 text-right">$0</td>
                    <td className="p-2 text-right">$60,622</td>
                    <td className="p-2 text-right">$59,800</td>
                    <td className="p-2 text-right font-medium">$59,800</td>
                    <td className="p-2 text-right text-green-600">$822</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="mb-2 text-sm text-muted-foreground">
            In Year 3, actual expenses ($58,000) exceeded both the annual 5%
            allowance ($2,660) and the prior bank balance ($1,875). The combined
            allowed maximum was $57,735, so the cap applied and the bank was
            fully drawn down. Without the cumulative bank, the cap would have
            limited recovery to $55,860 (5% of $53,200 = $2,660 + $53,200).
          </p>
          <p className="text-sm text-muted-foreground">
            The cumulative cap allowed the landlord to recover an additional
            $1,875 in Year 3 that a non-cumulative cap would have forfeited.
            Over a 10-year lease with consistent below-cap years followed by
            high-inflation years, cumulative bank recovery can be material.
          </p>
        </section>

        {/* Controllable vs Non-Controllable */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Controllable vs. Non-Controllable Expenses
          </h2>
          <p className="mb-4 text-muted-foreground">
            Most CAM caps apply only to controllable expenses (those within the
            landlord&apos;s management discretion). Non-controllable expenses
            are recovered in full, without any cap limitation, because they are
            driven by third-party pricing the landlord cannot control.
          </p>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="mb-2 font-semibold text-blue-700">
                Controllable (Typically Capped)
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Janitorial services</li>
                <li>Security staffing</li>
                <li>Landscaping and grounds</li>
                <li>Management fees</li>
                <li>Administrative expenses</li>
                <li>Common area repairs (routine)</li>
                <li>Waste removal contracts</li>
                <li>Pest control</li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="mb-2 font-semibold text-amber-700">
                Non-Controllable (Typically Uncapped)
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Property taxes and assessments</li>
                <li>Building insurance premiums</li>
                <li>Utility charges (electric, gas, water)</li>
                <li>Snow and ice removal</li>
                <li>Elevator maintenance contracts</li>
                <li>Life safety / fire suppression inspections</li>
                <li>Government-mandated expenses</li>
                <li>Casualty and liability insurance</li>
              </ul>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            The exact definition of controllable vs. non-controllable varies by
            lease. Some leases define these terms explicitly; others rely on
            judicial interpretation. If the lease does not define the
            distinction, common practice in your jurisdiction and property type
            applies. When in doubt, request confirmation in a lease amendment.
          </p>
        </section>

        {/* Tracking Spreadsheet */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How to Maintain a Cap Bank Tracking Spreadsheet
          </h2>
          <p className="mb-4 text-muted-foreground">
            For cumulative caps, a multi-year tracking spreadsheet is essential.
            Maintain one sheet per tenant with a cap provision. Minimum columns:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-semibold">Column</th>
                  <th className="p-3 text-left font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-3 font-medium">Year</td>
                  <td className="p-3 text-muted-foreground">
                    Reconciliation year
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Prior Year Base</td>
                  <td className="p-3 text-muted-foreground">
                    Actual amount paid by tenant in prior year (not prior year
                    cap limit)
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Annual Cap Allowance</td>
                  <td className="p-3 text-muted-foreground">
                    Cap % &times; Prior Year Base
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Opening Bank Balance</td>
                  <td className="p-3 text-muted-foreground">
                    Unused capacity carried forward from prior years
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Maximum Allowed</td>
                  <td className="p-3 text-muted-foreground">
                    Prior Year Base + Annual Allowance + Bank Balance
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Actual Controllable CAM</td>
                  <td className="p-3 text-muted-foreground">
                    Actual controllable expenses for the year
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Cap Applied?</td>
                  <td className="p-3 text-muted-foreground">
                    Yes if Actual &gt; Maximum Allowed
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Tenant Obligation</td>
                  <td className="p-3 text-muted-foreground">
                    Min(Actual, Maximum Allowed) + Non-Controllable CAM
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Closing Bank Balance</td>
                  <td className="p-3 text-muted-foreground">
                    If cap not applied: Opening Bank + Annual Allowance &minus;
                    Actual Increase. If cap applied: $0 (fully drawn)
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
                    Resetting a Cumulative Cap Bank Mid-Lease
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some property managers reset the cap bank to zero at the
                    start of each calendar year, treating a cumulative cap as a
                    non-cumulative one. This eliminates the tenant&apos;s
                    contractual bank balance. This billing error may not be
                    discovered until a high-inflation year when the bank would
                    have been valuable. The bank resets only when the lease
                    explicitly provides for it (typically at renewal or after a
                    specified draw event).
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying the Cap to Non-Controllable Expenses
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Applying the controllable-only cap to property taxes or
                    insurance, which the lease says is fully recoverable,
                    creates an undercharge that the landlord cannot correct in
                    future years (since the error has already closed). This
                    error favors the tenant, but when caught during an internal
                    review, it also creates a reconciliation adjustment that
                    surprises tenants who expected the same level of billing.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not Applying the Cap at All
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The most damaging error: billing the tenant for actual
                    expenses in a year where the cap limited recovery. This
                    results in a clear overbilling that tenants will find during
                    any audit, and that carries interest from the date of the
                    overpayment. In a 5% cap lease year where actual expenses
                    increased 12%, the tenant may have overpaid thousands of
                    dollars for every year the cap was ignored.
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
              <h3 className="mb-2 text-lg font-medium">What is a CAM cap?</h3>
              <p className="text-muted-foreground">
                A CAM cap limits the year-over-year increase in a tenant&apos;s
                CAM obligation. Expressed as a percentage of the prior year
                charge, it prevents the tenant&apos;s share from growing faster
                than the cap, unless exceptions apply for non-controllable
                expenses.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is the difference between a cumulative and non-cumulative
                cap?
              </h3>
              <p className="text-muted-foreground">
                A non-cumulative cap resets every year. Unused capacity from
                low-inflation years is permanently lost. A cumulative cap banks
                that unused capacity and allows larger catch-up increases in
                future high-inflation years. Cumulative caps are significantly
                more landlord-favorable in volatile cost environments.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What are controllable vs. non-controllable expenses?
              </h3>
              <p className="text-muted-foreground">
                Controllable expenses are within landlord discretion:
                janitorial, security, management fees. Non-controllable expenses
                are third-party driven: property taxes, insurance, utilities.
                Most CAM caps apply only to controllable expenses.
                Non-controllable expenses are recoverable in full regardless of
                the cap.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                How is the CAM cap base year established?
              </h3>
              <p className="text-muted-foreground">
                The cap base year is typically the first full lease year of CAM
                charges. For mid-year commencements, this may be the second
                calendar year. Check the specific lease language. The base year
                definition controls the entire cap calculation for the lease
                term.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cumulative-cam-cap-bank"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Cumulative CAM Cap Bank Explained
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    5-year worked example and tracking methodology.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-gross-up-guide"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Gross-Up Calculation Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Formula, variable/fixed classification, and common errors.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/lease-clauses-that-change-cam-outcomes"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Lease Clauses That Change CAM Outcomes
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How cap, gross-up, and exclusion clauses interact.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/tools/cam-cap-calculator"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Cap Calculator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Calculate cumulative and non-cumulative cap limits.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Verify Your Cap Calculations Automatically
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri checks every tenant&apos;s CAM cap, including cumulative
            bank balance, non-controllable exclusions, and application against
            actual expenses, against the lease terms in your Yardi or MRI
            export. Find cap failures before they become dispute letters.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_cap_enforcement_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
