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
  title: "CAM Close Checklist for Property Controllers: Month-End and Year-End",
  description:
    "A property controller's checklist for monthly CAM close and year-end CAM reconciliation prep. Covers accruals, GL verification, estimate tracking, and documentation requirements.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-close-checklist`,
  },
  openGraph: {
    title:
      "CAM Close Checklist for Property Controllers: Month-End and Year-End",
    description:
      "A property controller's checklist for monthly CAM close and year-end CAM reconciliation prep. Covers accruals, GL verification, estimate tracking, and documentation requirements.",
    url: `${SITE_URL}/resources/cam-close-checklist`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is the monthly CAM close process?",
    answer:
      "The monthly CAM close is a set of accounting controls run each month to ensure the property GL is complete and accurate before the books are closed. It includes accruing recurring expenses, verifying vendor invoices, reconciling the property tax escrow, and updating the tenant estimate tracker. Completing this monthly prevents year-end surprises.",
  },
  {
    question: "What should be reviewed during the year-end CAM close?",
    answer:
      "The year-end close adds to the monthly checklist: freezing the GL after final accruals, running the full-year GL export, verifying opening and closing balances, completing the CapEx review, generating the final management fee calculation, and archiving original invoices for all material items.",
  },
  {
    question:
      "How far in advance should property controllers start the year-end CAM close?",
    answer:
      "Most property controllers begin year-end close procedures in mid-December for calendar-year properties - before the year ends. This means chasing any missing vendor invoices while there is still time to accrue them in the correct year, rather than scrambling in January.",
  },
  {
    question: "What is a CapEx review and why does it matter for CAM close?",
    answer:
      "A CapEx review examines all repair and maintenance expenses over your capitalization threshold (typically $5,000–$10,000) to determine whether they should be capitalized rather than expensed. Items that are capitalized cannot be included in the recoverable CAM pool. Missing this review puts capital items into the pool - the most common trigger for tenant audit disputes.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Close Checklist",
    url: `${SITE_URL}/resources/cam-close-checklist`,
  },
]);

const monthlyItems = [
  "Accrue all recurring utility expenses for the month, even if invoices have not arrived yet.",
  "Accrue the management fee at the contracted rate for the month.",
  "Verify all landscaping and janitorial invoices have been received and coded to the correct accounts.",
  "Reconcile the property tax escrow account. Confirm the escrow balance matches the accrual schedule.",
  "Update the insurance proration for the month, particularly if the policy renewed during the year.",
  "Reconcile all repair and maintenance charges to approved purchase orders. Flag any unapproved items.",
  "Verify no capital items were coded to operating expense accounts. Review any single item above your capitalization threshold.",
  "Update the tenant estimate tracker: reconcile estimated CAM payments received against each tenant's ledger balance.",
  "Flag any tenants more than 30 days past due on CAM estimate payments. Escalate before the arrearage compounds.",
  "Update year-to-date actual vs. estimate tracking to identify whether you are trending to over- or under-collect.",
  "Confirm no corporate-level allocations landed in the property GL during the month.",
  "Review the repair/maintenance aging for any items approved as operating that should be capital.",
  "Confirm property tax payments match the scheduled payment dates and the full annual accrual is on track.",
  "Reconcile insurance premium disbursements against the annual policy schedule.",
  "Archive all vendor invoices processed in the month, organized by account code and vendor.",
];

const yearEndItems = [
  "Complete all December accruals before freezing the GL. Chase missing vendor invoices proactively in mid-December.",
  "Freeze the GL after final December accruals are posted. No adjustments after the freeze without explicit sign-off.",
  "Run the full-year GL export and verify the opening balance equals the prior year's closing balance.",
  "Verify the closing balance on the expense accounts reconciles to the sum of all monthly postings.",
  "Complete the full CapEx review: all repair/maintenance items above the capitalization threshold reviewed and classified.",
  "Generate the final management fee calculation. Use the year-end amount, not just the monthly accrual.",
  "Prepare the expense schedule by recoverable category (utilities, janitorial, landscaping, taxes, insurance, repairs, management fee, other).",
  "Cross-reference original vendor invoices for all material items (greater than $5,000) and attach them to the reconciliation file.",
  "Verify the property tax bill matches the GL accrual. Any difference must be explained and adjusted.",
  "Verify insurance premium disbursements match the policy certificates for the full year.",
  "Confirm management fee cap compliance. Verify the fee does not exceed any per-lease maximum.",
  "Pull the final tenant estimate tracker. The year-end total estimated payments per tenant becomes the prior-year estimate figure in each reconciliation statement.",
  "Verify all lease amendments from the reconciliation year are in the lease file and reflected in the reconciliation parameters.",
  "Complete the CapEx review memo. Document every item reviewed and the classification decision.",
  "Confirm prior-year reconciliation credits have been applied against tenant estimates per the prior-year settlement.",
  "Prepare the final occupancy schedule for the year. This is needed for gross-up calculations.",
  "Confirm no duplicate invoices appear in the full-year GL export.",
  "Prepare the vendor invoice index: a master list of all material invoices with vendor, date, amount, and GL account.",
  "Archive the complete year-end GL export with the reconciliation file. Keep a frozen, timestamped copy.",
  "Sign off on the year-end close package. Get property accountant, controller, and property manager signatures before reconciliation begins.",
];

export default function CamCloseChecklistPage() {
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
          <span className="text-foreground">CAM Close Checklist</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Close Checklist for Property Controllers: Month-End and Year-End
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Two checklists in one. The 15-item monthly close keeps the property
            GL clean throughout the year. The 20-item year-end close prepares
            you for reconciliation season.
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
            Monthly vs. Year-End Close
          </h2>
          <p className="text-muted-foreground">
            The CAM close has two cycles. Monthly: accrue recurring expenses,
            verify vendor invoices, update estimate tracking. This takes roughly
            2 to 3 hours per property. Year-end: complete GL export prep, verify
            annual totals, complete CapEx review, prepare reconciliation
            statements. This takes 8 to 12 hours per property. Teams that run
            the monthly close well spend far less time on the year-end close.
          </p>
        </div>

        {/* Monthly close */}
        <section className="mb-10">
          <h2 className="mb-2 text-2xl font-semibold">
            Monthly CAM Close Checklist
          </h2>
          <p className="mb-6 text-muted-foreground">
            Run these 15 items every month, typically within the first 5
            business days after month-end. Completing this monthly prevents
            year-end surprises and keeps tenant estimate tracking current.
          </p>
          <div className="space-y-2 rounded-lg border p-6">
            {monthlyItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{i + 1}. </span>
                  {item}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Year-end close */}
        <section className="mb-10">
          <h2 className="mb-2 text-2xl font-semibold">
            Year-End CAM Close Checklist
          </h2>
          <p className="mb-6 text-muted-foreground">
            The year-end close builds on the monthly close. Start this process
            in mid-December for calendar-year properties, before the year ends,
            so you can chase missing invoices while there is still time to
            accrue them in the correct year.
          </p>
          <div className="space-y-2 rounded-lg border p-6">
            {yearEndItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{i + 1}. </span>
                  {item}
                </p>
              </div>
            ))}
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
                    December invoices accrued in the wrong year
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vendor invoices for December services often arrive in
                    January. If they are booked to the new year instead of
                    accrued to the reconciliation year, expenses are
                    understated. The landlord cannot retroactively add them to
                    the prior-year pool once statements are issued.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    CapEx review skipped or incomplete
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Capital items left in the operating expense accounts flow
                    directly into the recoverable pool. HVAC replacements, roof
                    repairs above threshold, and parking lot resurfacing are the
                    most common examples. Tenant auditors look for these first
                    because they are the highest-dollar easy finds.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    GL frozen before all December accruals are posted
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Freezing the GL too early, before all December accruals are
                    confirmed, results in a reconciliation based on incomplete
                    data. If corrections must be made after the freeze,
                    reopening the GL creates a version control problem that can
                    invalidate statements already in progress.
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
                What is the monthly CAM close process?
              </h3>
              <p className="text-muted-foreground">
                The monthly CAM close is a set of accounting controls run each
                month to ensure the property GL is complete and accurate. It
                includes accruing recurring expenses, verifying vendor invoices,
                reconciling the property tax escrow, and updating the tenant
                estimate tracker. Completing this monthly prevents year-end
                surprises.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What should be reviewed during the year-end CAM close?
              </h3>
              <p className="text-muted-foreground">
                Beyond the monthly items, the year-end close adds: freezing the
                GL after final accruals, running the full-year export,
                completing the CapEx review, generating the final management fee
                calculation, and archiving original invoices for all material
                items.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How far in advance should property controllers start year-end
                close?
              </h3>
              <p className="text-muted-foreground">
                Most property controllers begin year-end close procedures in
                mid-December for calendar-year properties, before the year ends.
                This gives time to chase missing vendor invoices and accrue them
                in the correct year rather than scrambling in January.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is a CapEx review and why does it matter?
              </h3>
              <p className="text-muted-foreground">
                A CapEx review examines all repair and maintenance expenses
                above your capitalization threshold to determine if they should
                be capitalized. Items that are capitalized cannot enter the
                recoverable CAM pool. Missing this review puts capital items
                into the pool. That is the most common trigger for tenant audit
                disputes.
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
                The complete phase-by-phase checklist for year-end
                reconciliation.
              </p>
            </Link>
            <Link
              href="/resources/cam-reconciliation-process"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Reconciliation Process Guide
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The 7-phase process from year-end close to audit defense.
              </p>
            </Link>
            <Link
              href="/resources/month-end-cam-controls"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                Month-End CAM Controls
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The 12 monthly controls that prevent errors from compounding.
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Reconciliation Software
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                How CapVeri automates close verification and calculation.
              </p>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Automate Your CAM Close Process
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri validates your GL export against all 35 checklist items
            automatically. It flags missing accruals, capital items in the
            expense pool, and duplicate entries before reconciliation begins.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_close_checklist_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
