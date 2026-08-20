import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "How to Calculate CAM Charges: Formula, Example & Calculator (2026)",
  description:
    "Step-by-step guide to calculating CAM charges for commercial leases in 2026. Covers pro-rata share formula, gross-up, CAM caps, and worked examples with real numbers.",
  alternates: {
    canonical: `${SITE_URL}/resources/how-to-calculate-cam-charges`,
  },
  openGraph: {
    title: "How to Calculate CAM Charges: Formula & Worked Examples",
    description:
      "Step-by-step guide to calculating CAM charges for commercial leases. Covers pro-rata share formula, gross-up, CAM caps, and worked examples with real numbers.",
    url: `${SITE_URL}/resources/how-to-calculate-cam-charges`,
    type: "article",
  },
};

const howToSchema = structuredDataSchemas.howTo(
  "How to Calculate CAM Charges",
  "Calculate tenant CAM charges for a commercial lease using the pro-rata share formula, with adjustments for gross-up, CAM caps, and non-recoverable exclusions.",
  [
    {
      name: "Determine the total recoverable CAM expense pool",
      text: "Add up all operating expenses that are recoverable under the lease for the reconciliation period. Exclude non-recoverable items specifically carved out by the lease (e.g., capital improvements, management fees above the cap, owner-specific expenses). This is your Total Recoverable Expenses.",
      url: `${SITE_URL}/resources/expenses`,
    },
    {
      name: "Apply gross-up if occupancy is below the threshold",
      text: "If the lease requires gross-up (most NNN leases do), adjust variable expenses to what they would be at the occupancy threshold (typically 90–95%). Formula: Grossed-Up Variable Expenses = Actual Variable Expenses ÷ Actual Occupancy % × Gross-Up Threshold %. Add grossed-up variable expenses back to fixed expenses to get the grossed-up expense pool.",
      url: `${SITE_URL}/tools/cam-gross-up-calculator`,
    },
    {
      name: "Calculate the tenant's pro-rata share percentage",
      text: "Divide the tenant's leased square footage by the building's denominator square footage. The denominator is defined in the lease - it may be total rentable area, total leasable area, or a fixed number. Pro-Rata % = Tenant RSF ÷ Denominator RSF × 100.",
      url: `${SITE_URL}/tools/pro-rata-calculator`,
    },
    {
      name: "Calculate the tenant's gross CAM obligation",
      text: "Multiply the (grossed-up) recoverable expense pool by the tenant's pro-rata percentage: Tenant Gross CAM = Total Recoverable Expenses × Pro-Rata %. This is the tenant's full share before any cap is applied.",
    },
    {
      name: "Apply any CAM cap if specified in the lease",
      text: "If the lease includes a CAM cap, calculate the maximum allowable increase over the base year or prior year. Cap limits vary: cumulative caps compound unused capacity; non-cumulative caps reset each year. Tenant's Capped CAM = min(Tenant Gross CAM, Base × (1 + Cap%)^years) for cumulative caps.",
      url: `${SITE_URL}/tools/cam-cap-calculator`,
    },
    {
      name: "Subtract estimated payments to calculate the true-up",
      text: "Subtract the tenant's total estimated (monthly) CAM payments made during the year. If the result is positive, the tenant owes a true-up. If negative, the tenant receives a credit. True-Up = Tenant's Capped CAM − Total Estimated Payments Made.",
    },
  ],
  "PT2H",
);

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is the formula for calculating CAM charges?",
    answer:
      "The basic CAM charge formula is: Tenant CAM = Total Recoverable Expenses × (Tenant RSF ÷ Denominator RSF). For leases with gross-up, variable expenses are first adjusted upward to a defined occupancy threshold (usually 90–95%) before applying the pro-rata percentage.",
  },
  {
    question: "How do you calculate a tenant's pro-rata share for CAM?",
    answer:
      "Pro-rata share is the tenant's leased square footage divided by the building's total denominator square footage as defined in the lease. For example, if a tenant leases 5,000 SF in a 50,000 SF building, their pro-rata share is 10%. The denominator definition matters - some leases use total rentable area, others use occupied area or a fixed number.",
  },
  {
    question: "What is gross-up in a CAM calculation?",
    answer:
      "Gross-up adjusts variable operating expenses (utilities, cleaning, maintenance) to what they would be at a defined occupancy threshold - typically 90% or 95% - regardless of actual occupancy. If the building is 80% occupied, variable expenses are divided by 0.80 and multiplied by 0.95 to gross up to 95%. This prevents tenants from underpaying when a building has vacancies.",
  },
  {
    question: "What expenses are excluded from CAM calculations?",
    answer:
      "Common CAM exclusions include: capital improvements (unless amortized per lease terms), financing costs and mortgage interest, leasing commissions and tenant improvement allowances, income and franchise taxes, depreciation, management fees above the contractual cap, and costs related to other tenants (e.g., specific tenant buildouts). Always verify exclusions against the specific lease.",
  },
  {
    question: "How does a CAM cap affect the calculation?",
    answer:
      "A CAM cap limits year-over-year increases. A 5% non-cumulative cap means the tenant's CAM contribution cannot increase more than 5% over the prior year, regardless of actual expense growth. A cumulative cap allows unused cap capacity to bank forward - if expenses only grew 2% one year, the landlord can recover up to 8% (3% unused + 5%) in a subsequent year.",
  },
  {
    question: "What is the difference between a fixed and variable CAM charge?",
    answer:
      "Fixed CAM charges are set at a flat dollar amount (or per-SF amount) for the lease term with only CPI or flat annual escalators. They require no annual reconciliation. Variable (or traditional) CAM charges are based on actual building operating expenses and require annual reconciliation where tenants true-up against actual costs.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "How to Calculate CAM Charges",
    url: `${SITE_URL}/resources/how-to-calculate-cam-charges`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "How to Calculate CAM Charges: Formula & Worked Examples",
  description:
    "Step-by-step guide to calculating CAM charges for commercial leases. Covers pro-rata share formula, gross-up, CAM caps, and worked examples with real numbers.",
  url: `${SITE_URL}/resources/how-to-calculate-cam-charges`,
  datePublished: "2026-03-21",
  dateModified: "2026-03-21",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
});

export default function HowToCalculateCamChargesPage() {
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
              How to Calculate CAM Charges
            </span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            How to Calculate CAM Charges
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            Step-by-step formula, worked examples, and common errors. For
            landlords, property controllers, and asset managers.
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
            <time dateTime="2026-03-21">Updated March 21, 2026</time>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-3xl">
        {/* Featured snippet answer */}
        <p className="text-base text-muted-foreground leading-relaxed mb-8">
          To calculate CAM charges: (1) identify total recoverable operating
          expenses for the property, (2) apply gross-up to variable expenses if
          occupancy is below the lease threshold, (3) multiply the expense pool
          by the tenant&apos;s pro-rata share (tenant SF ÷ denominator SF), (4)
          apply any CAM cap from the lease, and (5) subtract the tenant&apos;s
          estimated payments to get the true-up amount owed.
        </p>

        {/* Quick answer */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-10">
          <h2 className="text-base font-semibold text-foreground mb-2">
            The CAM Charge Formula
          </h2>
          <div className="font-mono text-sm bg-background/70 rounded-lg p-4 border border-border mb-3">
            <div className="text-muted-foreground mb-1">Basic formula:</div>
            <div className="text-foreground font-medium">
              Tenant CAM = Total Recoverable Expenses × (Tenant SF ÷ Denominator
              SF)
            </div>
          </div>
          <div className="font-mono text-sm bg-background/70 rounded-lg p-4 border border-border">
            <div className="text-muted-foreground mb-1">With gross-up:</div>
            <div className="text-foreground font-medium">
              Grossed-Up Variable = Actual Variable ÷ Actual Occ% × Threshold%
            </div>
            <div className="text-foreground font-medium mt-1">
              Tenant CAM = (Fixed + Grossed-Up Variable) × Pro-Rata%
            </div>
          </div>
        </div>

        {/* Key variables */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Key Variables Defined
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Variable
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Definition
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Where to Find It
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  [
                    "Total Recoverable Expenses",
                    "All operating costs the landlord can pass through to tenants, net of exclusions",
                    "GL report, filtered by recoverable expense codes",
                  ],
                  [
                    "Tenant RSF",
                    "Rentable square footage leased by the tenant",
                    "Lease agreement, BOMA measurement",
                  ],
                  [
                    "Denominator RSF",
                    "Building-wide SF used as the base for pro-rata math",
                    "Lease definition (total rentable area, total leasable area, or fixed number)",
                  ],
                  [
                    "Gross-Up Threshold",
                    "The occupancy % at which variable expenses are normalized (typically 90–95%)",
                    "Lease clause (gross-up provision)",
                  ],
                  [
                    "Actual Occupancy %",
                    "Actual leased SF ÷ total leasable SF during the period",
                    "Leasing schedule or rent roll",
                  ],
                  [
                    "CAM Cap %",
                    "Maximum allowable year-over-year increase in tenant CAM obligation",
                    "Lease clause (escalation cap)",
                  ],
                  [
                    "Estimated Payments",
                    "Monthly CAM payments already collected from tenant during the year",
                    "Accounts receivable / rent roll",
                  ],
                ].map(([variable, definition, source]) => (
                  <tr key={variable} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground align-top">
                      {variable}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {definition}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Step by step */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            Step-by-Step Calculation Process
          </h2>
          <div className="space-y-6">
            {[
              {
                step: 1,
                title: "Determine total recoverable CAM expenses",
                content: (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Start with your GL report for the reconciliation year. Sum
                    all operating expense line items that are recoverable under
                    the lease. Remove any non-recoverable exclusions defined in
                    the lease (capital improvements, financing costs, management
                    fees above the cap, etc.). The result is your{" "}
                    <strong>Total Recoverable Expense Pool</strong>.
                  </p>
                ),
              },
              {
                step: 2,
                title: "Apply gross-up if occupancy is below the threshold",
                content: (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Most NNN leases require variable expenses to be grossed up
                      to a threshold (usually 90% or 95%) when actual occupancy
                      falls below that level. Fixed expenses (like property
                      taxes and insurance) are not grossed up.
                    </p>
                    <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border">
                      <div className="text-muted-foreground mb-2">
                        Example: Building is 82% occupied, gross-up to 95%
                      </div>
                      <div>Actual Variable Expenses: $120,000</div>
                      <div>
                        Grossed-Up Variable: $120,000 ÷ 0.82 × 0.95 ={" "}
                        <strong>$138,963</strong>
                      </div>
                      <div className="mt-2">
                        Fixed Expenses: $80,000 (unchanged)
                      </div>
                      <div>
                        Total Pool After Gross-Up: $80,000 + $138,963 ={" "}
                        <strong>$218,963</strong>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Use the{" "}
                      <Link
                        href="/tools/cam-gross-up-calculator"
                        className="text-primary hover:underline"
                      >
                        CAM Gross-Up Calculator
                      </Link>{" "}
                      to model multiple occupancy scenarios side by side.
                    </p>
                  </div>
                ),
              },
              {
                step: 3,
                title: "Calculate the tenant's pro-rata share percentage",
                content: (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Divide the tenant&apos;s leased RSF by the denominator
                      defined in the lease. The denominator matters - verify
                      whether it&apos;s total rentable area (TRA), total
                      leasable area (TLA), or a fixed number. Anchor exclusions
                      can also reduce the denominator.
                    </p>
                    <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border">
                      <div className="text-muted-foreground mb-2">Example:</div>
                      <div>Tenant RSF: 8,500 SF</div>
                      <div>Building Denominator: 75,000 SF</div>
                      <div>
                        Pro-Rata %: 8,500 ÷ 75,000 = <strong>11.33%</strong>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                step: 4,
                title: "Calculate tenant's gross CAM obligation",
                content: (
                  <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border">
                    <div className="text-muted-foreground mb-2">
                      Continuing the example:
                    </div>
                    <div>Total Pool (grossed-up): $218,963</div>
                    <div>Pro-Rata %: 11.33%</div>
                    <div>
                      Tenant Gross CAM: $218,963 × 0.1133 ={" "}
                      <strong>$24,809</strong>
                    </div>
                  </div>
                ),
              },
              {
                step: 5,
                title: "Apply CAM cap if applicable",
                content: (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      If the lease has a CAM cap, calculate the maximum
                      allowable obligation based on the cap structure.
                      Non-cumulative caps reset each year; cumulative caps bank
                      unused capacity.
                    </p>
                    <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border">
                      <div className="text-muted-foreground mb-2">
                        Example: 5% non-cumulative cap, prior year CAM was
                        $22,500
                      </div>
                      <div>
                        Cap Ceiling: $22,500 × 1.05 = <strong>$23,625</strong>
                      </div>
                      <div>Tenant Gross CAM: $24,809</div>
                      <div className="mt-2 font-bold">
                        Capped CAM: $23,625 (cap applies - tenant saves $1,184)
                      </div>
                      <div className="text-muted-foreground mt-2">
                        Landlord absorbs the $1,184 shortfall.
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                step: 6,
                title: "Subtract estimated payments - calculate the true-up",
                content: (
                  <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border">
                    <div className="text-muted-foreground mb-2">
                      Continuing:
                    </div>
                    <div>Annual Capped CAM: $23,625</div>
                    <div>Estimated Payments Made (12 × $1,800): $21,600</div>
                    <div className="mt-2 font-bold text-foreground">
                      True-Up Owed by Tenant: $23,625 − $21,600 ={" "}
                      <strong>$2,025</strong>
                    </div>
                  </div>
                ),
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {item.step}
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="font-semibold text-foreground mb-2">
                    {item.title}
                  </h3>
                  {item.content}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Common errors */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Common CAM Calculation Errors
          </h2>
          <div className="space-y-3">
            {[
              {
                error: "Applying gross-up to fixed expenses",
                impact:
                  "Overstates recoveries - fixed costs don't vary with occupancy",
              },
              {
                error:
                  "Wrong denominator (using occupied SF instead of total RSF)",
                impact: "Pro-rata calculations are inconsistent across tenants",
              },
              {
                error: "Misapplying cumulative vs. non-cumulative cap logic",
                impact:
                  "Either under-recovers (wrong cap ceiling) or bills tenants over their cap limit",
              },
              {
                error: "Including non-recoverable expenses in the pool",
                impact:
                  "Tenant audit exposure - tenants can demand credits with interest",
              },
              {
                error:
                  "Using wrong gross-up threshold (e.g., 90% instead of 95%)",
                impact:
                  "Under-recovers variable expenses in low-occupancy years",
              },
              {
                error:
                  "Failing to reconcile when lease expired during the year",
                impact:
                  "Tenant owes partial-year CAM; missing the bill forfeits the recovery",
              },
            ].map((item) => (
              <div
                key={item.error}
                className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4"
              >
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {item.error}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {item.impact}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Calculation methods comparison */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Three CAM Calculation Methods Compared
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Method
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    How It Works
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Common In
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Reconciliation Required?
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Pro-Rata (Traditional)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Actual expenses × tenant SF ÷ denominator SF
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    NNN, NN leases
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Yes - annual true-up
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Fixed CAM ($/SF)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Flat rate per SF with annual escalator (e.g., 3% per year)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Retail, net leases
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    No - locked in
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Base Year / Expense Stop
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Tenant pays expenses above a base year or fixed stop amount
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Full-service, gross leases
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Yes - reconcile excess
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Use the{" "}
            <Link
              href="/tools/fixed-cam-vs-traditional"
              className="text-primary hover:underline"
            >
              Fixed CAM vs. Traditional Modeler
            </Link>{" "}
            to compare recovery under each method over a 3–5 year lease term.
          </p>
        </section>

        {/* Tools */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Free Calculators for Each Step
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                title: "CAM Gross-Up Calculator",
                description:
                  "Model gross-up across 85%, 90%, 95%, and 100% occupancy thresholds with per-tenant allocation.",
                href: "/tools/cam-gross-up-calculator",
              },
              {
                title: "Pro-Rata Share Calculator",
                description:
                  "Model pro-rata allocations with anchor exclusions, gross-up adjustments, and vacancy handling.",
                href: "/tools/pro-rata-calculator",
              },
              {
                title: "CAM Cap Calculator",
                description:
                  "Compare cumulative vs. non-cumulative caps with carry-forward tracking over 5-year terms.",
                href: "/tools/cam-cap-calculator",
              },
              {
                title: "CAM Billing Error Estimator",
                description:
                  "Estimate billing errors from building area, expense totals, and occupancy assumptions.",
                href: "/tools/cam-billing-error-estimator",
              },
            ].map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start gap-3">
                  <Calculator className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-foreground group-hover:text-primary transition-colors duration-200 text-sm">
                      {tool.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {tool.description}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "What is the formula for calculating CAM charges?",
                a: "The basic formula: Tenant CAM = Total Recoverable Expenses × (Tenant RSF ÷ Denominator RSF). For leases with gross-up, variable expenses are first adjusted upward to the occupancy threshold before applying the pro-rata percentage.",
              },
              {
                q: "How do you calculate a tenant's pro-rata share for CAM?",
                a: "Divide the tenant's leased square footage by the building's total denominator square footage as defined in the lease. For example, if a tenant leases 5,000 SF in a 50,000 SF building, their pro-rata share is 10%. The denominator definition varies by lease - verify whether it's total rentable area, total leasable area, or a fixed number.",
              },
              {
                q: "What is gross-up in a CAM calculation?",
                a: "Gross-up adjusts variable operating expenses to what they would be at a defined occupancy threshold (typically 90% or 95%), regardless of actual occupancy. If a building is 80% occupied, variable expenses are divided by 0.80 and multiplied by 0.95 to normalize to 95%. This prevents tenants from underpaying when there are vacancies in the building.",
              },
              {
                q: "What expenses are excluded from CAM calculations?",
                a: "Common exclusions include: capital improvements (unless amortized per lease terms), financing costs and mortgage interest, leasing commissions and tenant improvement allowances, income taxes, depreciation, management fees above the contractual cap, and costs specific to other tenants. Always verify the specific exclusion language in each lease.",
              },
              {
                q: "How does a CAM cap affect the calculation?",
                a: "A CAM cap limits year-over-year increases in tenant CAM obligations. A 5% non-cumulative cap means the tenant's contribution cannot increase more than 5% over the prior year. A cumulative cap allows unused cap capacity to bank forward - if expenses only grew 2% one year, the landlord may be able to recover up to 8% in a subsequent year.",
              },
              {
                q: "What is the difference between fixed and variable CAM charges?",
                a: "Fixed CAM charges are set at a flat dollar or per-SF amount for the lease term, with only CPI or flat annual escalators - no annual reconciliation required. Variable (traditional) CAM charges are based on actual building operating expenses and require annual reconciliation where tenants true-up against actual costs.",
              },
            ].map((item) => (
              <div key={item.q}>
                <h3 className="font-semibold text-foreground mb-2 text-sm">
                  {item.q}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Related Tools */}
        <section className="mb-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            The variables in these calculations (CAM cap, pro-rata share, base
            year) come from your lease - extract them automatically with{" "}
            <a
              href="https://www.lextract.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Lextract.io
            </a>
            .
          </p>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Related Resources
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                title: "CAM Reconciliation Guide",
                href: "/cam-reconciliation-guide",
              },
              { title: "What Are CAM Charges?", href: "/cam-charges" },
              {
                title: "CAM Gross-Up: Complete Guide",
                href: "/resources/calculations/gross-up-adjustment",
              },
              {
                title: "CAM Cap Calculations",
                href: "/resources/calculations/cam-cap-ceiling",
              },
              {
                title: "Pro-Rata Share Denominator Guide",
                href: "/resources/calculations/proration-by-sqft",
              },
              { title: "CAM Expense Categories", href: "/resources/expenses" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors duration-200"
              >
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground text-background p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Skip the Manual Math</h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri automates every step from your GL export: gross-up,
            pro-rata, caps, and true-up calculations. No ERP integration
            required.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "how_to_calculate_cam_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
