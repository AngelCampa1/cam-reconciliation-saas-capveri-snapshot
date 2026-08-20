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
  title: "CAM Demand Letter Workflow for Landlords: From True-Up to Collection",
  description:
    "After sending CAM reconciliation statements, landlords need a disciplined collection workflow. Here's how to structure CAM demand letters, track responses, and escalate unpaid true-ups.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-demand-letter-workflow`,
  },
  openGraph: {
    title:
      "CAM Demand Letter Workflow for Landlords: From True-Up to Collection",
    description:
      "After sending CAM reconciliation statements, landlords need a disciplined collection workflow. Here's how to structure CAM demand letters, track responses, and escalate unpaid true-ups.",
    url: `${SITE_URL}/resources/cam-demand-letter-workflow`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a CAM true-up demand letter?",
    answer:
      "A CAM true-up demand letter is a formal written notice to a tenant who has not paid their annual CAM reconciliation balance after the initial true-up invoice was issued. It references the lease obligation, the amount due, the original invoice date, and a cure period - typically 10 business days - after which the landlord may invoke the lease default remedies.",
  },
  {
    question:
      "What is the difference between a tenant disputing a CAM charge and a tenant not paying?",
    answer:
      "A dispute is a substantive objection to the calculation - the tenant is contesting the amount. Non-payment is a collection issue - the tenant owes the amount but has not paid. These must be handled on separate tracks. For a tenant who disputes but owes an undisputed portion, the landlord should demand payment of the undisputed amount while the dispute is being resolved. For pure non-payment with no dispute, proceed directly to demand letters.",
  },
  {
    question: "Can a landlord offset unpaid CAM true-ups against future rent?",
    answer:
      "It depends on the lease. Some leases explicitly authorize the landlord to offset unpaid CAM balances against the next rent payment after a demand period expires. Other leases treat rent and CAM as separate obligations and do not allow offset. Review the lease's remedies section and the CAM provisions before attempting an offset - doing it without lease authority can create a rent default claim by the tenant.",
  },
  {
    question:
      "How should a landlord respond when a tenant invokes their audit right during the collection period?",
    answer:
      "A tenant who invokes audit rights during the collection period is typically entitled to suspend payment of the disputed amount pending the audit outcome. The landlord should: (1) acknowledge the audit request in writing within the lease-specified period, (2) confirm whether the full amount or a disputed portion is subject to the audit, (3) continue collecting any undisputed portion, and (4) begin assembling the audit defense packet.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Demand Letter Workflow",
    url: `${SITE_URL}/resources/cam-demand-letter-workflow`,
  },
]);

export default function CamDemandLetterWorkflowPage() {
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
          <span className="text-foreground">CAM Demand Letter Workflow</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Demand Letter Workflow for Landlords: From True-Up to Collection
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Sending the reconciliation statement is only the beginning. A
            disciplined 4-stage collection workflow (from initial invoice to
            legal escalation) ensures true-up balances get collected without
            creating lease default disputes.
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
            The 4-Stage CAM Collection Workflow
          </h2>
          <p className="text-muted-foreground">
            The CAM demand letter workflow has 4 stages: (1) send the initial
            true-up invoice with the reconciliation statement, (2) issue a
            30-day payment reminder, (3) send a formal demand letter at 45–60
            days, and (4) escalate to legal action or rent offset at Day 60+.
            Running a consistent process across all tenants protects the
            landlord from selective enforcement claims and creates a clear audit
            trail.
          </p>
        </div>

        {/* Dispute vs. non-payment distinction */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Dispute vs. Non-Payment: Handle These Separately
          </h2>
          <p className="mb-4 text-muted-foreground">
            Before running the collection workflow, classify each tenant into
            one of two tracks. Mixing the tracks leads to waived collection
            rights and lease enforcement problems.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold text-foreground">
                Dispute Track
              </h3>
              <p className="text-sm text-muted-foreground">
                The tenant objects to the calculation. They believe the amount
                is wrong. Do not immediately proceed to demand letters. Instead,
                respond to the substantive objection, provide supporting
                documentation, and separate the undisputed portion from the
                disputed portion. Demand payment of the undisputed amount while
                the dispute is resolved.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold text-foreground">
                Non-Payment Track
              </h3>
              <p className="text-muted-foreground text-sm">
                The tenant has not objected to the amount but has not paid. This
                is a pure collection matter. Proceed through the 4-stage
                workflow below without waiting for a response to substantive
                questions. Non-response is not a dispute. It does not pause the
                collection clock.
              </p>
            </div>
          </div>
        </section>

        {/* The 4 stages */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 4-Stage Collection Workflow
          </h2>
          <div className="space-y-6">
            {/* Stage 1 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  1
                </span>
                <div>
                  <h3 className="font-semibold text-lg">
                    Initial True-Up Invoice
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    Day 0: Delivered with the reconciliation statement
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  The true-up invoice should be delivered simultaneously with
                  the reconciliation statement. Sending the statement without an
                  attached invoice leaves the payment obligation ambiguous and
                  allows tenants to claim they were unaware a payment was due.
                </p>
                <div className="rounded-md bg-muted/40 p-4">
                  <p className="text-sm font-medium mb-2">
                    Cover letter should include:
                  </p>
                  <ul className="space-y-1">
                    {[
                      "Clear statement that the reconciliation is complete and payment is due",
                      "The net true-up amount (owed by tenant) or credit amount (owed to tenant)",
                      "The payment due date (typically 30 days after delivery)",
                      "Payment instructions (check payable to, wire instructions, or portal link)",
                      "Contact information for questions (not an invitation to dispute, but a resource for clarification)",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Supporting docs to attach:
                  </span>{" "}
                  Expense schedule, management fee calculation, pro-rata share
                  schedule, gross-up workbook (if applicable), cap bank schedule
                  (if applicable). Attaching them upfront reduces follow-up
                  requests by 60–70%.
                </p>
              </div>
            </div>

            {/* Stage 2 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  2
                </span>
                <div>
                  <h3 className="font-semibold text-lg">Payment Reminder</h3>
                  <span className="text-sm text-muted-foreground">
                    Day 25 to 30: Before the payment deadline
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  Send a payment reminder 5 days before the payment deadline -
                  not after it. Tenants who have not yet paid sometimes simply
                  forgot; a pre-deadline reminder closes the collection loop
                  without requiring a formal demand letter.
                </p>
                <div className="rounded-md bg-muted/40 p-4">
                  <p className="text-sm font-medium mb-2">
                    Reminder email language:
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    &quot;This is a courtesy reminder that your CAM
                    reconciliation true-up payment of $[AMOUNT] for the period
                    ending December 31, [YEAR] is due on [DATE]. If payment has
                    already been sent, please disregard this notice. If you have
                    questions about the reconciliation statement, please contact
                    [NAME] at [EMAIL].&quot;
                  </p>
                </div>
                <ul className="space-y-1">
                  {[
                    "Reference the original invoice number and date",
                    "State the outstanding amount and the due date",
                    "Confirm mailing address if payment is by check",
                    "Include a link to the original statement for reference",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Stage 3 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  3
                </span>
                <div>
                  <h3 className="font-semibold text-lg">
                    Formal Demand Letter
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    Day 45 to 60: After payment deadline passes without payment
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  The formal demand letter is a legal document that begins the
                  cure period clock. It must reference the lease section that
                  creates the payment obligation and state the consequences of
                  continued non-payment.
                </p>
                <div className="rounded-md bg-muted/40 p-4">
                  <p className="text-sm font-medium mb-2">Required elements:</p>
                  <ul className="space-y-1">
                    {[
                      "Reference the lease section creating the CAM payment obligation (e.g., Section 5.3, Additional Rent)",
                      "State the amount due, the original due date, and the number of days past due",
                      "Specify the cure period (typically 10 business days from receipt)",
                      "State the consequences of non-cure: default, interest at the lease rate, right to offset against rent, or escalation to counsel",
                      "Send via the notice method specified in the lease (certified mail, overnight courier, or a combination)",
                      "Retain proof of delivery",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  Have the formal demand letter reviewed by your property
                  counsel before sending, especially the first time for a
                  property or lease. Cure period language must match the
                  lease&apos;s default section exactly.
                </p>
              </div>
            </div>

            {/* Stage 4 */}
            <div className="rounded-lg border p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  4
                </span>
                <div>
                  <h3 className="font-semibold text-lg">Escalation</h3>
                  <span className="text-sm text-muted-foreground">
                    Day 60 or later: After cure period expires without payment
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  If the cure period expires without payment, the landlord has
                  several options. The right choice depends on lease language,
                  the tenant relationship, and the size of the balance.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      title: "Rent offset",
                      desc: "If the lease permits, offset the unpaid CAM balance against the next rent payment. Requires explicit lease authority. Do not attempt without confirming the provision exists.",
                    },
                    {
                      title: "Collections counsel",
                      desc: "Engage property counsel to send a final demand and pursue collection through court action if needed. Appropriate for balances above $5,000–$10,000.",
                    },
                    {
                      title: "Commercial collections",
                      desc: "For smaller balances, a commercial collections firm may be more cost-effective than litigation. Confirm the lease allows assignment of the claim.",
                    },
                  ].map((opt) => (
                    <div key={opt.title} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{opt.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {opt.desc}
                      </p>
                    </div>
                  ))}
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
                    Sending the demand letter without tracking prior notice
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the landlord cannot produce delivery confirmation for the
                    original statement and reminder notices, the tenant can
                    argue the demand period never started. Courts routinely
                    dismiss collection claims where the landlord cannot prove
                    when notice was delivered. Document every delivery at every
                    stage.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating a dispute as non-payment
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sending a formal demand letter to a tenant who has raised a
                    good-faith dispute and has not received a substantive
                    response can be characterized as harassment or bad faith
                    dealing. It also strengthens the tenant&apos;s litigation
                    position. Separate the dispute response from the collection
                    workflow and do not escalate to demand letters while a
                    substantive response is pending.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Cure period language that does not match the lease
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the formal demand letter states a 10-day cure period but
                    the lease requires a 15-day cure period, the demand is
                    technically defective. A tenant with counsel will use this
                    to restart the clock and delay collection by another month.
                    Always extract the cure period from the lease&apos;s default
                    section and use the exact number of days specified.
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
                What is a CAM true-up demand letter?
              </h3>
              <p className="text-muted-foreground">
                A formal written notice to a tenant who has not paid their CAM
                reconciliation balance. It references the lease obligation, the
                amount due, and gives a cure period (typically 10 business days)
                after which the landlord may invoke lease default remedies.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the difference between a dispute and non-payment?
              </h3>
              <p className="text-muted-foreground">
                A dispute is a substantive objection to the calculation.
                Non-payment is a collection issue where the amount is correct
                but unpaid. These must be handled on separate tracks. For
                disputes, respond to the substance and demand payment of the
                undisputed portion. For non-payment with no dispute, proceed
                directly through the 4-stage collection workflow.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can a landlord offset unpaid CAM true-ups against future rent?
              </h3>
              <p className="text-muted-foreground">
                It depends on the lease. Some leases explicitly authorize
                offset; others treat rent and CAM as separate obligations.
                Review the lease&apos;s remedies section before attempting an
                offset. Doing it without lease authority can create a rent
                default claim by the tenant.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How should a landlord respond when a tenant invokes audit rights
                during the collection period?
              </h3>
              <p className="text-muted-foreground">
                Acknowledge the audit request in writing within the
                lease-specified period. Confirm whether the full amount or only
                a disputed portion is subject to the audit. Continue collecting
                any undisputed portion. Begin assembling the audit defense
                packet. The landlord who has documentation ready wins the audit.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
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
              href="/resources/cam-dispute-response"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Dispute Response Guide
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to respond to tenant CAM disputes without conceding money
                you are owed.
              </p>
            </Link>
            <Link
              href="/resources/audit-defense-packet"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Audit Defense Packet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                What to prepare before the auditor arrives. Covers the 8
                required documents.
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
                How CapVeri tracks delivery, disputes, and true-up collections.
              </p>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Close the Loop from Statement to Collection
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri tracks delivery confirmations, payment deadlines, dispute
            statuses, and collection escalations. You get a single dashboard for
            every open true-up across your portfolio.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_demand_letter_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
