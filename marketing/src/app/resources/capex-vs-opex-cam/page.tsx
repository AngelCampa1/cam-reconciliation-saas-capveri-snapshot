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
    "CapEx vs. OpEx Classification for CAM QA: How to Categorize Building Expenses",
  description:
    "The CapEx vs. OpEx distinction is the most common source of CAM overbilling. This guide explains the classification tests, applies them to common building expenses, and shows how to build a QA process.",
  alternates: {
    canonical: `${SITE_URL}/resources/capex-vs-opex-cam`,
  },
  openGraph: {
    title:
      "CapEx vs. OpEx Classification for CAM QA: How to Categorize Building Expenses",
    description:
      "CapEx vs. OpEx misclassification is the most common CAM overbilling error. Learn the three classification tests, a 20-item reference table, and a QA process for catching errors before reconciliation.",
    url: `${SITE_URL}/resources/capex-vs-opex-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "What is the difference between CapEx and OpEx in commercial real estate CAM?",
    answer:
      "Operating expenses (OpEx) maintain the property in its current condition and are typically recoverable as CAM. Capital expenditures (CapEx) improve, extend the life of, or replace building systems and are generally not directly recoverable as CAM - though some may be recoverable on an amortized basis per the lease. The classification determines what tenants must pay.",
  },
  {
    question: "Is replacing an HVAC unit CapEx or OpEx for CAM purposes?",
    answer:
      "Replacing a full HVAC unit is CapEx because it replaces a major building system, extending its useful life beyond one year. Repairing an HVAC component (motor, belt, capacitor) that does not extend useful life is OpEx. The threshold: if the work materially extends the asset's life or upgrades it beyond its original condition, classify as CapEx.",
  },
  {
    question:
      "What dollar threshold should be used to flag potential CapEx in a CAM GL review?",
    answer:
      "A common threshold is $10,000 per invoice or work order. Expenses at or above this level warrant additional review to confirm they are operating rather than capital in nature. The threshold can be adjusted based on property size - a $10,000 threshold is appropriate for most commercial properties but larger institutional properties may use $25,000+.",
  },
  {
    question: "Is parking lot sealcoating CapEx or OpEx?",
    answer:
      "Parking lot sealcoating is OpEx - it maintains the existing surface in its current condition without extending useful life materially. Full parking lot reconstruction (removing and replacing the base and asphalt) is CapEx because it replaces the asset. A thin overlay or crack repair is OpEx; a mill-and-overlay replacing the full surface layer falls in a gray zone and may be classified as CapEx depending on the extent of the work.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CapEx vs. OpEx Classification for CAM QA",
    url: `${SITE_URL}/resources/capex-vs-opex-cam`,
  },
]);

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "CapEx vs. OpEx Classification for CAM QA: How to Categorize Building Expenses",
  description:
    "Three classification tests for CapEx vs. OpEx, a 20-item expense table, and a QA process for catching misclassifications before CAM reconciliation.",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
  dateModified: "2026-04-01",
  url: `${SITE_URL}/resources/capex-vs-opex-cam`,
};

export default function CapexVsOpexPage() {
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
          <span className="text-foreground">CapEx vs. OpEx Classification</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CapEx vs. OpEx Classification for CAM QA: How to Categorize Building
            Expenses
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Misclassifying a capital expenditure as an operating expense is the
            most common CAM overbilling error, and the finding tenants defend
            most easily in an audit. This guide provides three classification
            tests, a 20-item reference table, and a QA process for catching
            misclassifications before your reconciliation statement goes out.
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

        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            Operating expenses (OpEx) maintain the property in its current
            condition and are typically recoverable as CAM. Capital expenditures
            (CapEx) improve, extend, or replace building systems and are
            generally not directly recoverable (though some are amortizable per
            the lease). Apply all three tests below; if any indicates CapEx,
            classify as CapEx.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The Three Classification Tests
          </h2>
          <p className="mb-4 text-muted-foreground">
            Apply all three tests to any building expense you are uncertain
            about. A single "CapEx indicator" from any test is sufficient to
            classify the expense as capital. When there is ambiguity, default to
            CapEx. Tenant auditors will.
          </p>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">Test 1: The Useful-Life Test</p>
              <p className="mb-2 text-sm text-muted-foreground">
                Does the expenditure create a benefit that extends beyond one
                year?
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-green-700">
                    OpEx indicator:
                  </span>
                  {""}
                  Benefit is consumed within the current period (cleaning
                  supplies, pest control service, landscaping maintenance).
                </li>
                <li>
                  <span className="font-medium text-red-700">
                    CapEx indicator:
                  </span>
                  {""}
                  Benefit extends beyond one year (new roof, replaced HVAC unit,
                  new parking surface).
                </li>
              </ul>
            </div>
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">Test 2: The Restoration Test</p>
              <p className="mb-2 text-sm text-muted-foreground">
                Does the expenditure restore a materially deteriorated asset, or
                merely maintain it?
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-green-700">
                    OpEx indicator:
                  </span>
                  {""}
                  Routine maintenance to keep a functioning asset in working
                  condition (HVAC filter replacement, exterior re-caulking,
                  paint touch-up).
                </li>
                <li>
                  <span className="font-medium text-red-700">
                    CapEx indicator:
                  </span>
                  {""}
                  Work that restores an asset that has deteriorated to a
                  significantly impaired state (rebuilding a failed structural
                  element, replacing a severely deteriorated roof deck).
                </li>
              </ul>
            </div>
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">Test 3: The Improvement Test</p>
              <p className="mb-2 text-sm text-muted-foreground">
                Does the expenditure upgrade the asset to a condition better
                than its original state?
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-green-700">
                    OpEx indicator:
                  </span>
                  {""}
                  Replaces like-for-like with no material upgrade in capacity,
                  efficiency, or quality.
                </li>
                <li>
                  <span className="font-medium text-red-700">
                    CapEx indicator:
                  </span>
                  {""}
                  Upgrades the asset to a meaningfully better state (converting
                  single-zone HVAC to multi-zone, adding a green roof where none
                  existed, installing EV charging infrastructure).
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            20-Item CapEx / OpEx Classification Reference Table
          </h2>
          <p className="mb-4 text-muted-foreground">
            The table below applies the three tests to common building expenses.
            Use this as a reference during your GL review. Facts and
            circumstances always matter; this table does not replace a
            case-by-case review.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 pr-4 text-left font-medium">Expense</th>
                  <th className="pb-2 pr-4 text-left font-medium">
                    Classification
                  </th>
                  <th className="pb-2 text-left font-medium">
                    Determining Test
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  [
                    "HVAC repair (motor, belt, capacitor)",
                    "OpEx",
                    "Useful-life: no extension",
                  ],
                  [
                    "HVAC unit replacement (full system)",
                    "CapEx",
                    "Useful-life: 15–20 years",
                  ],
                  [
                    "Roof patch / spot repair",
                    "OpEx",
                    "Restoration: maintains current condition",
                  ],
                  [
                    "Full roof replacement",
                    "CapEx",
                    "Useful-life: 20–27.5 years",
                  ],
                  [
                    "Interior paint touch-up",
                    "OpEx",
                    "Restoration: routine maintenance",
                  ],
                  [
                    "Full interior renovation",
                    "CapEx",
                    "Improvement: upgrades condition",
                  ],
                  [
                    "Parking lot sealcoat / crack fill",
                    "OpEx",
                    "Restoration: maintains surface",
                  ],
                  [
                    "Parking lot reconstruction",
                    "CapEx",
                    "Useful-life: replaces asset",
                  ],
                  [
                    "Plumbing repair (leak, fixture)",
                    "OpEx",
                    "Useful-life: no extension",
                  ],
                  [
                    "Plumbing system replacement",
                    "CapEx",
                    "Useful-life: extends system life",
                  ],
                  [
                    "Elevator maintenance contract",
                    "OpEx",
                    "Routine: keeps asset in service",
                  ],
                  [
                    "Elevator cab replacement",
                    "CapEx",
                    "Improvement: replaces major component",
                  ],
                  [
                    "Landscaping maintenance",
                    "OpEx",
                    "Recurring: no asset creation",
                  ],
                  [
                    "Landscaping redesign / installation",
                    "CapEx",
                    "Improvement: creates new asset",
                  ],
                  [
                    "Janitorial supplies",
                    "OpEx",
                    "Useful-life: consumed within period",
                  ],
                  [
                    "Window cleaning service",
                    "OpEx",
                    "Useful-life: consumed within period",
                  ],
                  [
                    "Window replacement (glazing)",
                    "CapEx",
                    "Useful-life: 20+ years",
                  ],
                  [
                    "Security guard service",
                    "OpEx",
                    "Useful-life: service, not asset",
                  ],
                  [
                    "Security system installation",
                    "CapEx",
                    "Useful-life: equipment > 1 year",
                  ],
                  [
                    "LED lighting retrofit",
                    "CapEx*",
                    "Useful-life: 10–15 years (may be amortizable)",
                  ],
                ].map(([expense, classification, test]) => (
                  <tr key={expense} className="border-b last:border-0">
                    <td className="py-2 pr-4">{expense}</td>
                    <td
                      className={`py-2 pr-4 font-medium ${
                        classification.startsWith("CapEx")
                          ? "text-red-700"
                          : "text-green-700"
                      }`}
                    >
                      {classification}
                    </td>
                    <td className="py-2">{test}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            * LED retrofit may qualify as expense-reduction capital under the
            amortization exception in many leases. Confirm lease language before
            including annual amortization in CAM.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Building the QA Process: Three-Layer Check
          </h2>
          <p className="mb-4 text-muted-foreground">
            A practical QA process for catching CapEx before it appears in a CAM
            reconciliation uses three detection layers applied in order:
          </p>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">
                Layer 1: Dollar-Threshold Filter
              </p>
              <p className="text-sm text-muted-foreground">
                Flag all GL entries at or above $10,000 per transaction for
                manual review. Capital expenditures almost always exceed this
                threshold. This single filter catches the majority of serious
                CapEx-in-CAM errors. For large properties (500,000+ SF), adjust
                the threshold to $25,000.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">Layer 2: Vendor Red-List Check</p>
              <p className="text-sm text-muted-foreground">
                Maintain a list of vendor types whose work is typically capital:
                roofing contractors, structural engineers, HVAC equipment
                suppliers, electrical contractors performing system work,
                concrete and asphalt contractors. Any large transaction with a
                vendor on this list should be reviewed regardless of how it was
                coded in the GL.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">
                Layer 3: Description Keyword Scan
              </p>
              <p className="text-sm text-muted-foreground">
                Scan GL entry descriptions for capital-indicator keywords:
                "replacement," "install," "new system," "rebuild," "retrofit,"
                "renovation," "upgrade," "construction." Any match should be
                reviewed using the three classification tests above. OpEx
                descriptions typically use "repair," "service," "maintenance,"
                "cleaning," or "inspection."
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Coding a full HVAC replacement to a maintenance GL account
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This is the classic error: a large invoice from an HVAC
                    contractor gets coded to "HVAC Maintenance" instead of a
                    capital account because it&apos;s convenient. A $75,000 HVAC
                    replacement included in CAM maintenance generates a clear
                    overbilling finding in any tenant audit.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying OpEx classification to project invoices below the
                    capitalization threshold without verifying the work
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Breaking a large capital project into multiple smaller
                    invoices to stay below the GL capitalization threshold does
                    not change the CAM classification. Tenants audit at the
                    project level, not the invoice level. Aggregate related
                    invoices to determine the true classification.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating an improvement as maintenance because the asset
                    eventually failed
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    &quot;We had to replace it because it failed, not because we
                    wanted to improve the property.&quot; This is a common
                    landlord argument, but it does not change the
                    classification. A failed roof that gets a full replacement
                    creates a new long-lived asset (CapEx), regardless of
                    whether the failure was unexpected.
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
                What is the difference between CapEx and OpEx in commercial real
                estate CAM?
              </h3>
              <p className="text-muted-foreground">
                OpEx maintains the property in its current condition and is
                recoverable as CAM. CapEx improves, extends, or replaces
                building systems and is generally not directly recoverable. Some
                may be amortized per the lease over the asset&apos;s useful
                life.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Is replacing an HVAC unit CapEx or OpEx?
              </h3>
              <p className="text-muted-foreground">
                Full HVAC unit replacement is CapEx because it creates a
                long-lived asset. Repairing a component (motor, belt, capacitor)
                without extending useful life is OpEx. The key question: does
                the work extend the asset&apos;s life materially beyond one
                year?
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What dollar threshold should be used to flag potential CapEx?
              </h3>
              <p className="text-muted-foreground">
                A $10,000 threshold is appropriate for most commercial
                properties. Flag any single invoice or work order at or above
                this level for manual review. Larger institutional properties
                may use $25,000+.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Is parking lot sealcoating CapEx or OpEx?
              </h3>
              <p className="text-muted-foreground">
                Sealcoating is OpEx: it maintains the existing surface. Full
                parking lot reconstruction is CapEx because it replaces the
                asset. A mill-and-overlay may be CapEx depending on the scope.
                Evaluate it using the restoration and useful-life tests.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/capital-expenditures-recoverable-in-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">Which CapEx Is Recoverable in CAM?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Amortized CapEx recovery: what qualifies and how to calculate
                it.
              </p>
            </Link>
            <Link
              href="/resources/detect-capex-in-gl-export"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">Detect CapEx in GL Exports</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Automated methods for finding misclassified capital items in
                your GL data.
              </p>
            </Link>
            <Link
              href="/resources/recoverable-vs-nonrecoverable-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">
                Recoverable vs. Non-Recoverable CAM Expenses
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete framework for identifying which expenses belong in CAM.
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Reconciliation Software</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Automate CapEx vs. OpEx classification QA with CapVeri.
              </p>
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Automate the CapEx / OpEx QA Check
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri applies all three classification tests to every GL line item
            in your CAM pool, flagging potential CapEx before it reaches your
            reconciliation statement and creating a documented audit trail.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "capex_vs_opex_cam_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
