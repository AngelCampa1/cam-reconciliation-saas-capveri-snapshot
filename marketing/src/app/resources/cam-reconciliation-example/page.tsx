import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  DollarSign,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation Example: Worked Step-by-Step (2026)",
  description:
    "Complete CAM reconciliation example with real numbers - 3-tenant retail strip center, gross-up at 82% occupancy, 5% cap, and a $21,910 net true-up. Shows 2 common billing errors found.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-reconciliation-example`,
  },
  openGraph: {
    title: "CAM Reconciliation Example: Worked Step-by-Step (2026)",
    description:
      "Complete CAM reconciliation example with real numbers - 3-tenant retail strip center, gross-up at 82% occupancy, 5% cap, and a $21,910 net true-up.",
    url: `${SITE_URL}/resources/cam-reconciliation-example`,
    type: "article",
  },
};

const articleSchema = structuredDataSchemas.article({
  headline: "CAM Reconciliation Example: Worked Step-by-Step (2026)",
  description:
    "Complete CAM reconciliation example with real numbers - 3-tenant retail strip center, gross-up at 82% occupancy, 5% cap, and a $21,910 net true-up. Shows 2 common billing errors found.",
  url: `${SITE_URL}/resources/cam-reconciliation-example`,
  datePublished: "2026-03-21",
  dateModified: "2026-03-21",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
});

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What does a CAM reconciliation look like in practice?",
    answer:
      "A CAM reconciliation compares actual building operating expenses for the year to the estimated amounts tenants paid monthly. The landlord calculates each tenant's pro-rata share of actual expenses (adjusting for gross-up and caps per the lease), then compares to payments received. Tenants owe a true-up if actuals exceed estimates, or receive a credit if estimates were too high.",
  },
  {
    question: "What is a typical CAM reconciliation true-up amount?",
    answer:
      "True-up amounts vary widely by building, market, and expense volatility. A mid-size retail center might see true-ups of $0.50–$2.00 per SF per year for most tenants. Landlords who haven't reconciled in multiple years or who have significant billing errors may face much larger true-ups or credits.",
  },
  {
    question: "What are common errors found in a CAM reconciliation?",
    answer:
      "The most common CAM reconciliation errors are: (1) incorrect gross-up application - grossing up fixed expenses that shouldn't be grossed up, or using the wrong occupancy threshold; (2) wrong denominator - using occupied SF instead of total leasable SF; (3) non-recoverable expenses included in the pool; (4) CAM cap misapplication - applying non-cumulative cap logic to a cumulative cap lease.",
  },
  {
    question: "How long does a CAM reconciliation take?",
    answer:
      "Manual CAM reconciliation for a single property typically takes 4–8 hours per tenant when done in Excel - pulling GL data, categorizing expenses, applying gross-up and cap formulas, and preparing the statement. CapVeri automates this to under 15 minutes per property by ingesting the GL export directly.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Reconciliation Example",
    url: `${SITE_URL}/resources/cam-reconciliation-example`,
  },
]);

// Example building data
const BUILDING = {
  name: "Westgate Retail Center",
  totalRSF: 48000,
  denominator: 48000,
  occupancy: 0.82, // 82%
  grossUpThreshold: 0.95, // 95%
  reconciliationYear: "2025",
};

const EXPENSES = [
  {
    category: "Property Taxes",
    type: "Fixed" as const,
    amount: 142800,
    recoverable: 142800,
  },
  {
    category: "Property Insurance",
    type: "Fixed" as const,
    amount: 28400,
    recoverable: 28400,
  },
  {
    category: "Landscaping & Grounds",
    type: "Variable" as const,
    amount: 36200,
    recoverable: 36200,
  },
  {
    category: "Parking Lot Maintenance",
    type: "Variable" as const,
    amount: 18600,
    recoverable: 18600,
  },
  {
    category: "Cleaning & Janitorial",
    type: "Variable" as const,
    amount: 24300,
    recoverable: 24300,
  },
  {
    category: "Utilities (Common Area)",
    type: "Variable" as const,
    amount: 31500,
    recoverable: 31500,
  },
  {
    category: "General & Admin (Mgmt Fee)",
    type: "Fixed" as const,
    amount: 22000,
    recoverable: 22000,
  },
  {
    category: "Roof Repair (Capital)",
    type: "Fixed" as const,
    amount: 15000,
    recoverable: 0,
    note: "Capital exclusion per lease §8.3",
  },
];

const totalFixed = EXPENSES.filter(
  (e) => e.type === "Fixed" && e.recoverable > 0,
).reduce((s, e) => s + e.recoverable, 0);
const totalVariable = EXPENSES.filter((e) => e.type === "Variable").reduce(
  (s, e) => s + e.recoverable,
  0,
);
// Gross-up: variable ÷ 0.82 × 0.95
const grossedUpVariable = Math.round(
  (totalVariable / BUILDING.occupancy) * BUILDING.grossUpThreshold,
);
const totalPool = totalFixed + grossedUpVariable;

const TENANTS = [
  {
    name: "Coffee & Co.",
    rsf: 1800,
    estMonthly: 650,
    priorYearCam: 7200,
    cap: 0.05,
    capType: "non-cumulative" as const,
  },
  {
    name: "Ridgeline Fitness",
    rsf: 8500,
    estMonthly: 2900,
    priorYearCam: 32400,
    cap: null,
    capType: null,
  },
  {
    name: "Metro Dental",
    rsf: 4200,
    estMonthly: 1400,
    priorYearCam: 16200,
    cap: 0.04,
    capType: "cumulative" as const,
  },
];

function calcTenant(tenant: (typeof TENANTS)[0]) {
  const proRata = tenant.rsf / BUILDING.denominator;
  const grossObligation = Math.round(totalPool * proRata);
  let cappedObligation = grossObligation;
  let capApplied = false;

  if (tenant.cap !== null && tenant.priorYearCam > 0) {
    const capCeiling = Math.round(tenant.priorYearCam * (1 + tenant.cap));
    if (grossObligation > capCeiling) {
      cappedObligation = capCeiling;
      capApplied = true;
    }
  }

  const estimatedPaid = tenant.estMonthly * 12;
  const trueUp = cappedObligation - estimatedPaid;

  return {
    proRata,
    grossObligation,
    cappedObligation,
    capApplied,
    estimatedPaid,
    trueUp,
  };
}

const tenantResults = TENANTS.map((t) => ({ ...t, ...calcTenant(t) }));
const totalTrueUp = tenantResults.reduce((s, t) => s + t.trueUp, 0);

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
function pct(n: number) {
  return (n * 100).toFixed(2) + "%";
}

export default function CamReconciliationExamplePage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={articleSchema} />
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
            <span className="text-foreground">CAM Reconciliation Example</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            CAM Reconciliation Example: Step-by-Step with Real Numbers
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            A complete worked example for a 3-tenant retail strip center. Covers
            GL expenses to tenant true-ups, including gross-up at 82% occupancy
            and a 5% CAM cap.
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
        {/* Building overview */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            The Building: {BUILDING.name}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {[
              {
                label: "Total Rentable SF",
                value: BUILDING.totalRSF.toLocaleString() + " SF",
              },
              {
                label: "Actual Occupancy (2025)",
                value: BUILDING.occupancy * 100 + "%",
              },
              {
                label: "Gross-Up Threshold",
                value: BUILDING.grossUpThreshold * 100 + "%",
              },
              { label: "Tenants in Example", value: "3" },
              { label: "Lease Structure", value: "NNN" },
              {
                label: "Reconciliation Year",
                value: BUILDING.reconciliationYear,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="text-xs text-muted-foreground mb-1">
                  {item.label}
                </div>
                <div className="text-base font-semibold text-foreground">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This example uses a 48,000 SF retail center with 3 occupied tenants.
            The building was 82% occupied in 2025 (one unit vacant for 7
            months), triggering gross-up for variable expenses. Two tenants have
            CAM caps; one does not.
          </p>
        </section>

        {/* Step 1: Expense pool */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
              1
            </div>
            <h2 className="text-xl font-bold text-foreground">
              Build the Recoverable Expense Pool
            </h2>
          </div>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs">
                    Expense
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs">
                    Type
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-foreground text-xs">
                    Actual
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-foreground text-xs">
                    Recoverable
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {EXPENSES.map((e) => (
                  <tr
                    key={e.category}
                    className={
                      e.recoverable === 0
                        ? "bg-destructive/5"
                        : "hover:bg-muted/30"
                    }
                  >
                    <td className="px-3 py-2.5 font-medium text-foreground text-xs">
                      {e.category}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {e.type}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground text-xs">
                      {fmt(e.amount)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right text-xs font-medium ${e.recoverable === 0 ? "text-destructive-strong" : "text-foreground"}`}
                    >
                      {e.recoverable === 0 ? " - " : fmt(e.recoverable)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground italic">
                      {e.note ?? ""}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted font-bold">
                  <td colSpan={2} className="px-3 py-2.5 text-xs">
                    Total Recoverable
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    {fmt(EXPENSES.reduce((s, e) => s + e.amount, 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    {fmt(totalFixed + totalVariable)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">$15K capital excluded</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              <strong>Error found:</strong> The original GL included a $15,000
              roof repair as a recoverable expense. Lease §8.3 excludes capital
              improvements. Removing it reduces the pool by $15,000 - which
              would have been billed improperly to all three tenants.
            </p>
          </div>
        </section>

        {/* Step 2: Gross-up */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
              2
            </div>
            <h2 className="text-xl font-bold text-foreground">
              Apply Gross-Up (82% → 95%)
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            The building was only 82% occupied in 2025. The leases require
            gross-up of variable expenses to 95%. Fixed expenses (taxes,
            insurance, management fee) are <strong>not</strong> grossed up.
          </p>
          <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border mb-4 space-y-1">
            <div className="text-muted-foreground">
              Variable expenses (actual): {fmt(totalVariable)}
            </div>
            <div className="text-muted-foreground">
              Gross-up: {fmt(totalVariable)} ÷ 0.82 × 0.95
            </div>
            <div className="text-foreground font-bold">
              Grossed-up variable: {fmt(grossedUpVariable)}
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <div className="text-muted-foreground">
                Fixed expenses (unchanged): {fmt(totalFixed)}
              </div>
              <div className="text-foreground font-bold">
                Total grossed-up pool: {fmt(totalPool)}
              </div>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <DollarSign className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              Gross-up adds{" "}
              <strong>{fmt(grossedUpVariable - totalVariable)}</strong> to the
              recoverable pool. Without gross-up, each tenant would have
              underpaid for shared variable services that don&apos;t scale down
              proportionally with vacancy.
            </p>
          </div>
        </section>

        {/* Step 3: Tenant calculations */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
              3
            </div>
            <h2 className="text-xl font-bold text-foreground">
              Calculate Each Tenant&apos;s True-Up
            </h2>
          </div>
          <div className="space-y-6">
            {tenantResults.map((tenant, i) => (
              <div
                key={tenant.name}
                className="rounded-lg border border-border bg-card p-5"
              >
                <h3 className="font-semibold text-foreground mb-3">
                  Tenant {i + 1}: {tenant.name} ({tenant.rsf.toLocaleString()}{" "}
                  SF)
                </h3>
                <div className="font-mono text-xs bg-muted rounded p-3 space-y-1 mb-3">
                  <div className="text-muted-foreground">
                    Pro-rata %: {tenant.rsf.toLocaleString()} ÷{" "}
                    {BUILDING.denominator.toLocaleString()} ={" "}
                    <strong>{pct(tenant.proRata)}</strong>
                  </div>
                  <div className="text-muted-foreground">
                    Gross CAM obligation: {fmt(totalPool)} ×{" "}
                    {pct(tenant.proRata)} ={" "}
                    <strong>{fmt(tenant.grossObligation)}</strong>
                  </div>
                  {tenant.capApplied && (
                    <div className="text-warning-foreground">
                      Cap applied (
                      {tenant.cap !== null
                        ? tenant.cap * 100 + "% " + tenant.capType
                        : ""}
                      ): ceiling = {fmt(tenant.priorYearCam)} ×{" "}
                      {tenant.cap !== null ? 1 + tenant.cap : ""} ={" "}
                      <strong>{fmt(tenant.cappedObligation)}</strong>
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    Estimates paid (12 × {fmt(tenant.estMonthly)}):{" "}
                    {fmt(tenant.estimatedPaid)}
                  </div>
                  <div
                    className={`font-bold mt-1 ${tenant.trueUp >= 0 ? "text-foreground" : "text-primary"}`}
                  >
                    True-up:{" "}
                    {tenant.trueUp >= 0
                      ? fmt(tenant.trueUp) + " owed by tenant"
                      : fmt(Math.abs(tenant.trueUp)) + " credit to tenant"}
                  </div>
                </div>
                {tenant.capApplied && (
                  <div className="flex items-start gap-2 text-xs text-warning-foreground">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      CAM cap applies - landlord absorbs{" "}
                      {fmt(tenant.grossObligation - tenant.cappedObligation)}{" "}
                      shortfall.
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Summary */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
              4
            </div>
            <h2 className="text-xl font-bold text-foreground">
              Reconciliation Summary
            </h2>
          </div>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground text-xs">
                    Tenant
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-foreground text-xs">
                    CAM Obligation
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-foreground text-xs">
                    Est. Paid
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-foreground text-xs">
                    True-Up
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tenantResults.map((t) => (
                  <tr key={t.name} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground text-xs">
                      {t.name}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                      {fmt(t.cappedObligation)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                      {fmt(t.estimatedPaid)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right text-xs font-semibold ${t.trueUp >= 0 ? "text-foreground" : "text-primary"}`}
                    >
                      {t.trueUp >= 0 ? "+" : ""}
                      {fmt(t.trueUp)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted font-bold">
                  <td className="px-4 py-3 text-xs">Total</td>
                  <td className="px-4 py-3 text-right text-xs">
                    {fmt(
                      tenantResults.reduce((s, t) => s + t.cappedObligation, 0),
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {fmt(
                      tenantResults.reduce((s, t) => s + t.estimatedPaid, 0),
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {fmt(totalTrueUp)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Errors found summary */}
          <h3 className="text-base font-bold text-foreground mb-3">
            Errors Found in This Reconciliation
          </h3>
          <div className="space-y-3">
            <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  Capital expense included in recoverable pool
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  $15,000 roof repair was included in the original
                  reconciliation. Lease §8.3 explicitly excludes capital
                  improvements. Impact: tenants would have been overbilled a
                  combined{" "}
                  {fmt(
                    tenantResults.reduce(
                      (s, t) => s + Math.round(15000 * t.proRata),
                      0,
                    ),
                  )}
                  .
                </div>
              </div>
            </div>
            <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  Gross-up correctly applied to variable expenses only
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  Variable expenses were grossed up; fixed expenses (taxes,
                  insurance, management fee) were excluded from gross-up. A
                  common error is applying gross-up to the entire expense pool,
                  which overstates recoveries.
                </div>
              </div>
            </div>
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
                q: "What does a CAM reconciliation look like in practice?",
                a: "A CAM reconciliation compares actual building operating expenses for the year to the estimated amounts tenants paid monthly. The landlord calculates each tenant's pro-rata share of actual expenses (adjusting for gross-up and caps per the lease), then compares to payments received. Tenants owe a true-up if actuals exceed estimates, or receive a credit if estimates were too high.",
              },
              {
                q: "What is a typical CAM reconciliation true-up amount?",
                a: "True-up amounts vary widely by building, market, and expense volatility. A mid-size retail center might see true-ups of $0.50–$2.00 per SF per year for most tenants. Landlords who haven't reconciled in multiple years or who have significant billing errors may face much larger true-ups or credits.",
              },
              {
                q: "What are common errors found in a CAM reconciliation?",
                a: "The most common errors are: (1) incorrect gross-up application - grossing up fixed expenses that shouldn't be grossed up, or using the wrong occupancy threshold; (2) wrong denominator - using occupied SF instead of total leasable SF; (3) non-recoverable expenses included in the pool; (4) CAM cap misapplication.",
              },
              {
                q: "How long does a CAM reconciliation take?",
                a: "Manual CAM reconciliation for a single property typically takes 4 to 8 hours per tenant when done in Excel. CapVeri automates this to under 15 minutes per property by ingesting the GL export directly.",
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
        <section className="mb-10">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Need the lease data before you can reconcile?{" "}
            <a
              href="https://www.lextract.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Lextract.io
            </a>{" "}
            extracts pro-rata share, gross-up thresholds, and CAM caps from
            lease PDFs.
          </p>
        </section>

        {/* Related */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Related Resources
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                title: "How to Calculate CAM Charges",
                href: "/resources/how-to-calculate-cam-charges",
              },
              {
                title: "CAM Reconciliation Guide",
                href: "/cam-reconciliation-guide",
              },
              {
                title: "CAM Reconciliation Template",
                href: "/tools/cam-reconciliation-template",
              },
              {
                title: "CAM Gross-Up Calculator",
                href: "/tools/cam-gross-up-calculator",
              },
              {
                title: "CAM Cap Calculator",
                href: "/tools/cam-cap-calculator",
              },
              { title: "See a Real CapVeri Report", href: "/sample-report" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors duration-200"
              >
                <ArrowRight className="h-4 w-4 flex-shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground text-background p-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            Run This Calculation on Your Own Portfolio
          </h2>
          <p className="text-background/70 mb-6 text-sm max-w-md mx-auto">
            Upload your GL export from Yardi or MRI and CapVeri will run the
            full reconciliation - gross-up, pro-rata, caps, and true-up - in
            minutes.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "recon_example_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
