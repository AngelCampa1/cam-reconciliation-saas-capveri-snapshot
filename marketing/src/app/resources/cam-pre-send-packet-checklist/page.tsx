import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  FileText,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "CAM Pre-Send Packet Checklist: What to Verify Before Statements Go Out",
  description:
    "Before sending annual CAM reconciliation statements, verify these 20 items. A pre-send checklist that catches the errors most likely to trigger tenant disputes and audit requests.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-pre-send-packet-checklist`,
  },
  openGraph: {
    title:
      "CAM Pre-Send Packet Checklist: What to Verify Before Statements Go Out",
    description:
      "Before sending annual CAM reconciliation statements, verify these 20 items. A pre-send checklist that catches the errors most likely to trigger tenant disputes and audit requests.",
    url: `${SITE_URL}/resources/cam-pre-send-packet-checklist`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "What should be included in a CAM reconciliation statement packet?",
    answer:
      "A complete CAM reconciliation statement packet includes: the reconciliation statement itself (showing the expense pool, gross-up, cap adjustments, pro-rata share, prior estimates, and net true-up), an expense schedule by recoverable category, the management fee calculation, the pro-rata share schedule for all tenants, the gross-up workbook (if applicable), and the cap bank schedule (if a cumulative cap applies).",
  },
  {
    question: "How do you verify the pro-rata denominator is correct?",
    answer:
      "Pull the definition of the denominator from each tenant's lease. It varies. Some leases use total building RSF, some use occupied RSF, some exclude anchor tenants, and some use a fixed number specified in the lease. Compare the denominator used in your calculation to the lease definition. If new tenants were added or space was vacated during the year, the denominator may have changed mid-year, requiring a weighted average.",
  },
  {
    question: "What is the most common error caught in a pre-send review?",
    answer:
      "The most common error caught at the pre-send stage is a management fee that exceeds the per-lease cap. Management fees are frequently calculated at the property level and then allocated to tenants, but individual leases may cap the management fee at a lower rate than the property-level rate. This discrepancy is easy to miss when calculations are done in bulk.",
  },
  {
    question: "Who should do the pre-send review?",
    answer:
      "The pre-send review should be done by someone who did not prepare the reconciliation (ideally a senior property manager, controller, or lease administrator). Self-review catches arithmetic errors but misses systematic calculation errors that the preparer would make consistently.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Pre-Send Packet Checklist",
    url: `${SITE_URL}/resources/cam-pre-send-packet-checklist`,
  },
]);

type ChecklistGroup = {
  number: number;
  title: string;
  items: { id: number; text: string }[];
};

const groups: ChecklistGroup[] = [
  {
    number: 1,
    title: "Expense Pool",
    items: [
      {
        id: 1,
        text: "Non-recoverable expenses are excluded: confirm the exclusion list matches the specific lease, not a generic template.",
      },
      {
        id: 2,
        text: "Capital items are removed: confirm every item above your capitalization threshold was reviewed and classified.",
      },
      {
        id: 3,
        text: "Management fee is capped: verify the management fee in the pool does not exceed the per-lease maximum for each tenant.",
      },
      {
        id: 4,
        text: "Controllable/non-controllable split is applied where required: confirm the split percentages match the lease definitions.",
      },
      {
        id: 5,
        text: "Lease-specific exclusions are applied: check beyond standard exclusions for any special carve-outs in each lease.",
      },
    ],
  },
  {
    number: 2,
    title: "Calculations",
    items: [
      {
        id: 6,
        text: "Gross-up is applied (if applicable): confirm occupancy was measured using the method specified in the lease and the variable pool was normalized correctly.",
      },
      {
        id: 7,
        text: "Occupancy threshold is correctly calculated: verify the occupancy percentage used matches actual occupied RSF over total leasable RSF for the measurement period.",
      },
      {
        id: 8,
        text: "Pro-rata denominator matches the lease: pull the denominator definition from the lease and confirm it was used, not a default system value.",
      },
      {
        id: 9,
        text: "Cap type is correctly applied: cumulative caps use a bank balance carry-forward; non-cumulative caps reset each year. Confirm which applies for each tenant.",
      },
      {
        id: 10,
        text: "Prior-year cap bank balance is used (if cumulative): verify the bank balance in this year's calculation matches the closing balance from last year's reconciliation.",
      },
    ],
  },
  {
    number: 3,
    title: "Statement Format",
    items: [
      {
        id: 11,
        text: "Tenant name and lease reference are correct: verify against the executed lease, not the tenant ledger, which may have name discrepancies.",
      },
      {
        id: 12,
        text: "Reconciliation period is explicitly stated: the start and end date of the reconciliation year should appear on the face of the statement.",
      },
      {
        id: 13,
        text: "Prior-year estimates are clearly shown: the total estimated payments collected must match the tenant ledger exactly.",
      },
      {
        id: 14,
        text: "True-up amount is unambiguous: state clearly whether the tenant owes money or is receiving a credit, and the exact dollar amount.",
      },
      {
        id: 15,
        text: "Due date is on the true-up invoice: every statement with an amount due must have a payment deadline stated. No deadline means no enforceable payment date.",
      },
    ],
  },
  {
    number: 4,
    title: "Supporting Documentation",
    items: [
      {
        id: 16,
        text: "Expense schedule is attached: a line-by-line or category-level breakdown of recoverable expenses that ties to the total on the statement.",
      },
      {
        id: 17,
        text: "Management fee calculation is attached: show the base, the rate, and the result. Tenants routinely request this separately; include it upfront.",
      },
      {
        id: 18,
        text: "Pro-rata share schedule is attached: the full table of all tenants, their RSF, the denominator, and each tenant's percentage.",
      },
      {
        id: 19,
        text: "Gross-up calculation is attached (if applicable): the workbook showing occupancy, threshold, variable pool, and normalized amount.",
      },
      {
        id: 20,
        text: "Cap bank schedule is attached (if cumulative cap applies): the year-by-year table showing base year, annual cap increases, and remaining capacity.",
      },
    ],
  },
];

export default function CamPreSendPacketChecklistPage() {
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
          <span className="text-foreground">CAM Pre-Send Packet Checklist</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Pre-Send Packet Checklist: What to Verify Before Statements Go
            Out
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            The pre-send packet review is the last quality gate before CAM
            reconciliation statements reach tenants. These 20 items catch the
            errors most likely to generate a dispute: wrong denominator,
            management fee over cap, capital in the expense pool.
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

        {/* Quick answer */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">
            Why the Pre-Send Review Matters
          </h2>
          <p className="text-muted-foreground">
            Once a CAM reconciliation statement is delivered, errors become
            disputes. A tenant who receives a statement with a wrong denominator
            or a management fee above their lease cap will hold payment, request
            an audit, and demand a corrected statement. That adds months to the
            collection cycle and creates legal exposure. The pre-send review is
            cheaper and faster than correcting issued statements.
          </p>
        </div>

        {/* Downloadable resource note */}
        <div className="mb-10 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <p className="text-sm text-muted-foreground">
            This checklist is also available as a downloadable PDF formatted for
            print-and-sign review workflows. Get the{""}
            <Link
              href="/tools/cam-pre-send-packet-checklist-download"
              className="text-foreground underline hover:no-underline"
            >
              CAM Pre-Send Packet Checklist PDF
            </Link>
            {""}
            to use with your team.
          </p>
        </div>

        {/* The 20-item checklist */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 20-Item Pre-Send Checklist
          </h2>
          <p className="mb-6 text-muted-foreground">
            Complete all 20 items before any statement packet leaves your
            office. The checklist is organized into 4 groups: Expense Pool
            (items 1–5), Calculations (6–10), Statement Format (11–15), and
            Supporting Documentation (16–20).
          </p>
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.number}>
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {group.number}
                  </span>
                  Group {group.number}: {group.title}
                </h3>
                <div className="space-y-3 rounded-lg border p-5">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {item.id}.{""}
                        </span>
                        {item.text}
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
                    Management fee exceeds the per-lease cap
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Management fees are often calculated at the property level
                    and then allocated to tenants. But individual leases may cap
                    the management fee at a lower rate than the property-level
                    rate (e.g., 5% of controllable expenses vs. the property
                    standard of 8%). This discrepancy is the most common
                    calculation error caught at the pre-send stage, and the most
                    embarrassing to correct after delivery.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Prior-year estimate amount does not match the tenant ledger
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the prior-year estimate on the statement does not match
                    what the tenant actually paid (because estimates were
                    adjusted mid-year, a credit was applied, or a payment was
                    disputed), the true-up amount will be wrong. Tenants compare
                    the statement to their own payment records immediately upon
                    receipt. A discrepancy here delays payment for every tenant
                    affected.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Missing supporting documentation creates audit requests
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Statements sent without expense schedules, management fee
                    calculations, or pro-rata share documentation generate a
                    predictable wave of follow-up requests. Each missing
                    document costs 30–60 minutes to produce and deliver on
                    demand. Across a 20-tenant building, that&apos;s a full day
                    of avoidable work. Include all supporting schedules with the
                    initial delivery.
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
                What should be included in a CAM reconciliation statement
                packet?
              </h3>
              <p className="text-muted-foreground">
                A complete packet includes: the reconciliation statement,
                expense schedule by category, management fee calculation,
                pro-rata share schedule, gross-up workbook (if applicable), and
                cap bank schedule (if a cumulative cap applies). Delivering all
                of these upfront dramatically reduces post-delivery inquiries.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How do you verify the pro-rata denominator is correct?
              </h3>
              <p className="text-muted-foreground">
                Pull the denominator definition from each tenant&apos;s lease.
                Some leases use total building RSF, some use occupied RSF, some
                exclude anchors, and some specify a fixed number. Compare the
                denominator in your calculation to the lease definition. If
                tenants were added or space vacated mid-year, you may need a
                weighted-average denominator.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the most common error caught in a pre-send review?
              </h3>
              <p className="text-muted-foreground">
                Management fees that exceed the per-lease cap. Management fees
                are frequently calculated at the property level and allocated to
                tenants, but individual leases may cap the fee at a lower rate.
                This discrepancy is easy to miss when calculations are done in
                bulk.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Who should do the pre-send review?
              </h3>
              <p className="text-muted-foreground">
                Someone who did not prepare the reconciliation (ideally a senior
                property manager, controller, or lease administrator).
                Self-review catches arithmetic errors but misses systematic
                calculation errors that the preparer makes consistently.
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
                The complete year-end reconciliation checklist by phase.
              </p>
            </Link>
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
              href="/cam-reconciliation-software"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Reconciliation Software
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                How CapVeri runs the pre-send checklist automatically.
              </p>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Run the Pre-Send Checklist in Minutes, Not Hours
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri checks all 20 pre-send items automatically against your
            lease data and GL export. It flags management fee cap violations,
            wrong denominators, and missing documentation before any statement
            goes out.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_pre_send_packet_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
