import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Clock,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Month-End CAM Controls for Property Accounting Teams",
  description:
    "The 12 monthly controls that prevent CAM calculation errors from compounding across a reconciliation year. Designed for property accounting teams managing multi-tenant commercial portfolios.",
  alternates: {
    canonical: `${SITE_URL}/resources/month-end-cam-controls`,
  },
  openGraph: {
    title: "Month-End CAM Controls for Property Accounting Teams",
    description:
      "The 12 monthly controls that prevent CAM calculation errors from compounding across a reconciliation year. Designed for property accounting teams managing multi-tenant commercial portfolios.",
    url: `${SITE_URL}/resources/month-end-cam-controls`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Why do month-end CAM controls matter?",
    answer:
      "Monthly CAM controls catch errors when they are easy and cheap to fix - before they compound into year-end reconciliation problems. An accrual error caught in February costs 15 minutes to fix. The same error discovered in March during reconciliation season costs hours to investigate, may require restated statements, and can trigger tenant disputes.",
  },
  {
    question: "How long do month-end CAM controls take per property?",
    answer:
      "For a property with 10–20 tenants, the 12 monthly controls take approximately 1.5–2.5 hours per month when run routinely. Teams that skip controls and try to do them all at year-end typically spend 8–12 hours per property in January and February - and still miss errors that a monthly cadence would have caught.",
  },
  {
    question: "What is a year-to-date actual vs. estimate tracker?",
    answer:
      "A year-to-date actual vs. estimate tracker compares cumulative actual recoverable expenses against the cumulative estimated CAM payments collected from tenants through the same period. A widening gap indicates the property will have a large true-up at year-end - in either direction. Tracking this monthly allows landlords to adjust next-year estimates before the gap becomes a surprise.",
  },
  {
    question:
      "What should happen when a tenant is more than 30 days past due on estimates?",
    answer:
      "At 30 days past due on a CAM estimate payment, issue a written payment notice and escalate to the property manager. Many leases allow the landlord to assess late fees on past-due estimate payments. If the arrearage continues past 60 days, send a formal demand letter. Do not wait until year-end reconciliation to address estimate arrearages - they compound and are harder to collect alongside a true-up payment.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Month-End CAM Controls",
    url: `${SITE_URL}/resources/month-end-cam-controls`,
  },
]);

type ControlCategory = {
  number: number;
  title: string;
  controls: {
    id: number;
    name: string;
    detail: string;
    time: string;
  }[];
};

const categories: ControlCategory[] = [
  {
    number: 1,
    title: "Expense Tracking",
    controls: [
      {
        id: 1,
        name: "Verify all recurring vendor invoices received",
        detail:
          "Check that landscaping, janitorial, security, elevator maintenance, and utility invoices for the month are in hand and coded. Flag any vendor that did not invoice - a missing invoice is more often a lost invoice than no service performed.",
        time: "20 min",
      },
      {
        id: 2,
        name: "Confirm no capital items in operating expense accounts",
        detail:
          "Review all repair and maintenance postings for the month. Any single item above your capitalization threshold (typically $5,000–$10,000) requires explicit sign-off that it is operating expense, not a capital improvement.",
        time: "15 min",
      },
      {
        id: 3,
        name: "Accrue management fee at correct rate",
        detail:
          "Post the month's management fee accrual at the contracted rate on the correct base. Verify the base amount matches the lease definition - some leases compute the fee on controllable expenses only; others use total recoverable expenses.",
        time: "10 min",
      },
    ],
  },
  {
    number: 2,
    title: "Tenant Estimates",
    controls: [
      {
        id: 4,
        name: "Reconcile estimated payments received against tenant ledger",
        detail:
          "Verify that every tenant's monthly CAM estimate payment posted to the correct account. Misapplied payments - applied to base rent instead of CAM, or to the wrong tenant - create errors in the year-end true-up calculation.",
        time: "20 min",
      },
      {
        id: 5,
        name: "Flag tenants more than 30 days past due on estimates",
        detail:
          "Pull the current aging for CAM estimate receivables. Any tenant past 30 days should receive a written payment notice. Letting estimate arrearages compound makes year-end collection significantly harder - a tenant 6 months behind on estimates will receive a true-up bill on top of the arrearage.",
        time: "10 min",
      },
      {
        id: 6,
        name: "Update year-to-date actual vs. estimate tracking",
        detail:
          "Compare cumulative actual recoverable expenses through the month against cumulative estimated payments collected. If actual expenses are running 10% or more above estimates, consider whether mid-year estimate adjustments are warranted or whether year-end true-ups will be unusually large.",
        time: "15 min",
      },
    ],
  },
  {
    number: 3,
    title: "GL Integrity",
    controls: [
      {
        id: 7,
        name: "No corporate allocations in the property GL",
        detail:
          "Confirm no corporate overhead allocations, inter-company charges, or non-property items were posted to the property GL during the month. These items are not recoverable and must be removed before the year-end export - it is easier to remove them monthly than to hunt for them in December.",
        time: "10 min",
      },
      {
        id: 8,
        name: "Confirm property tax and insurance match payment schedule",
        detail:
          "Verify that property tax and insurance postings for the month match the annual payment schedule. A missed accrual month for property taxes - which may be billed quarterly or semi-annually - creates a year-end accrual adjustment that is easy to forget.",
        time: "10 min",
      },
      {
        id: 9,
        name: "Review repair and maintenance for capital misclassification",
        detail:
          "Beyond the threshold check (control 2), review the descriptions of repair and maintenance postings for any work that sounds like a capital project - roof replacement, parking lot resurfacing, HVAC system replacement. These sometimes appear in multiple smaller invoices designed to stay below the capital threshold.",
        time: "15 min",
      },
    ],
  },
  {
    number: 4,
    title: "Documentation",
    controls: [
      {
        id: 10,
        name: "Invoice filing complete and current",
        detail:
          "All vendor invoices processed in the month should be filed - either physically or digitally - in an organized system accessible for the year-end reconciliation. Invoices retrieved from email inboxes in March are a common source of version inconsistencies.",
        time: "10 min",
      },
      {
        id: 11,
        name: "Lease amendment register updated",
        detail:
          "If any lease amendments were executed during the month, update the lease amendment register with the amendment date, the lease section(s) affected, and the impact on CAM calculations (if any). This register is the reference document for the year-end reconciliation.",
        time: "5 min",
      },
      {
        id: 12,
        name: "Prior-month reconciliation issues resolved",
        detail:
          "Any open items from the prior month's controls - disputed invoices, unapproved repair items, missing accruals - should be resolved before the current month's close. Open items that persist across multiple months compound into material reconciliation discrepancies by year-end.",
        time: "10 min",
      },
    ],
  },
];

export default function MonthEndCamControlsPage() {
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
          <span className="text-foreground">Month-End CAM Controls</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Month-End CAM Controls for Property Accounting Teams
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            The 12 monthly controls that prevent CAM calculation errors from
            compounding across a reconciliation year. Designed for property
            accounting teams managing multi-tenant commercial portfolios.
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
            Why Monthly Controls Beat Year-End Scrambles
          </h2>
          <p className="text-muted-foreground">
            Monthly CAM controls catch errors when they are easy to fix, before
            they compound. The 12 controls below take approximately 2 hours per
            property per month and prevent the most common year-end
            reconciliation surprises: capital items in the expense pool, missing
            accruals, uncollected estimate arrearages, and GL integrity issues
            that take days to untangle in January.
          </p>
        </div>

        {/* Time summary */}
        <div className="mb-10 flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
          <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Estimated time per property per month:
            </span>{" "}
            ~2 hours for 12 controls. Teams that run these monthly spend
            significantly less time on year-end close.
          </p>
        </div>

        {/* The 12 controls */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 12 Monthly Controls
          </h2>
          <div className="space-y-8">
            {categories.map((cat) => (
              <div key={cat.number}>
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {cat.number}
                  </span>
                  Category {cat.number} - {cat.title}
                </h3>
                <div className="space-y-4">
                  {cat.controls.map((ctrl) => (
                    <div key={ctrl.id} className="rounded-lg border p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                          <p className="font-medium">
                            Control {ctrl.id}: {ctrl.name}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          ~{ctrl.time}
                        </span>
                      </div>
                      <p className="ml-6 text-sm text-muted-foreground">
                        {ctrl.detail}
                      </p>
                    </div>
                  ))}
                </div>
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
                    Estimate arrearages left unaddressed for months
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A tenant who is 3 months behind on CAM estimates will
                    receive a year-end reconciliation statement that includes
                    both a large true-up and the outstanding estimate arrearage.
                    Presenting both at once makes collection significantly
                    harder - tenants dispute the combined total and use the
                    dispute to delay both obligations. Address estimate
                    arrearages the month they appear.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Split-invoice capital projects bypass the threshold check
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Contractors sometimes split a capital project across
                    multiple invoices - each below your capitalization threshold
                    - to avoid the capital approval process. Monthly controls
                    that only check per-invoice amounts miss this pattern.
                    Control 9 (reviewing repair descriptions for
                    capital-sounding work) catches these when each invoice
                    arrives rather than when the full project total is visible
                    at year-end.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Lease amendment not reflected until year-end
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A lease amendment executed in March that changes the CAM
                    exclusion list or pro-rata definition should affect
                    calculations starting in March. If the amendment register is
                    only reviewed at year-end, the reconciliation applies the
                    wrong parameters for 9 months - creating a restatement that
                    affects multiple tenants.
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
                Why do month-end CAM controls matter?
              </h3>
              <p className="text-muted-foreground">
                Monthly controls catch errors when they are easy and cheap to
                fix, before they compound. An accrual error caught in February
                takes 15 minutes to fix. The same error discovered during
                reconciliation season costs hours to investigate, may require
                restated statements, and can trigger tenant disputes.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How long do month-end CAM controls take per property?
              </h3>
              <p className="text-muted-foreground">
                For a property with 10–20 tenants, the 12 controls take
                approximately 1.5–2.5 hours per month when run routinely. Teams
                that skip controls and try to catch up at year-end typically
                spend 8–12 hours per property in January and February - and
                still miss errors.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is a year-to-date actual vs. estimate tracker?
              </h3>
              <p className="text-muted-foreground">
                A YTD tracker compares cumulative actual recoverable expenses
                against cumulative estimated payments collected through the same
                period. A widening gap signals a large year-end true-up -
                tracking monthly allows landlords to adjust next-year estimates
                before the gap becomes a surprise.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What should happen when a tenant is 30+ days past due on
                estimates?
              </h3>
              <p className="text-muted-foreground">
                Issue a written payment notice and escalate to the property
                manager. Most leases allow late fees on past-due estimate
                payments. If the arrearage continues past 60 days, send a formal
                demand letter. Do not wait until year-end - estimate arrearages
                compound and are harder to collect alongside a true-up bill.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-close-checklist"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Close Checklist
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Monthly and year-end close procedures for property controllers.
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
              href="/resources/cam-estimate-letter-qa"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                How to QA a CAM Estimate Letter
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                15-step QA process for catching errors before estimate letters
                go out.
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
                How CapVeri automates monthly controls and year-end
                reconciliation.
              </p>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Run Monthly Controls Automatically
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri monitors your Yardi or MRI GL and flags capital items,
            missing accruals, and estimate arrearages as they happen, not just
            at year-end.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "month_end_cam_controls_cta",
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
