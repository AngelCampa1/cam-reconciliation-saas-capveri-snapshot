import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  FileText,
  Scale,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Dispute Response Playbook for Landlords",
  description:
    "A landlord's step-by-step playbook for responding to CAM disputes. Covers how to triage disputes, what to concede vs. defend, how to document your position, and when to escalate.",
  alternates: { canonical: `${SITE_URL}/resources/cam-dispute-response` },
  openGraph: {
    title: "CAM Dispute Response Playbook for Landlords",
    description:
      "A landlord's step-by-step playbook for responding to CAM disputes. Covers how to triage disputes, what to concede vs. defend, how to document your position, and when to escalate.",
    url: `${SITE_URL}/resources/cam-dispute-response`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "How long do I have to respond to a CAM dispute?",
    answer:
      "Most leases require a landlord response within 30–60 days of receiving a written dispute notice. Check the notice provisions in the lease carefully - some leases treat non-response as admission of the tenant's position. Calendar the response deadline immediately upon receiving a dispute letter.",
  },
  {
    question:
      "Should I concede a dispute if I know I made a calculation error?",
    answer:
      "Yes. Promptly conceding a clear calculation error and issuing the credit - ideally before the tenant escalates - is the professional approach and usually cheaper than litigation. Document the correction in writing, explaining what the error was and how you recalculated. Conceding an error you actually made is not a precedent that hurts you; refusing to concede it is what creates precedent for bad-faith disputes.",
  },
  {
    question:
      "What is the difference between a methodology dispute and a calculation dispute?",
    answer:
      "A calculation dispute is a math error - you grossed up the wrong number, applied the wrong pro-rata percentage, or used the wrong denominator. These are binary: you're right or wrong. A methodology dispute is about how the lease should be interpreted - whether a specific expense is recoverable, whether gross-up applies, what the denominator should include. Methodology disputes require applying the lease language and, if the language is ambiguous, negotiation.",
  },
  {
    question: "When should I escalate a CAM dispute to legal counsel?",
    answer:
      "Escalate when: (1) the tenant has sent a formal demand letter or notice of arbitration; (2) the tenant is using the dispute to withhold CAM payments; (3) the disputed amount exceeds your legal cost threshold; or (4) the dispute involves a legal question about lease interpretation that your property management team cannot resolve authoritatively.",
  },
  {
    question:
      "Can a CAM dispute affect future lease renewals or tenant relationships?",
    answer:
      "Yes. A protracted CAM dispute handled poorly - slow responses, poor documentation, refusal to correct clear errors - is a common reason tenants choose not to renew. Conversely, landlords who respond promptly, document their position clearly, and settle legitimate disputes quickly often convert disputes into trust-building moments. The quality of your dispute response signals the quality of your management.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Dispute Response Playbook",
    url: `${SITE_URL}/resources/cam-dispute-response`,
  },
]);

export default function CamDisputeResponsePage() {
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
          <span className="text-foreground">CAM Dispute Response Playbook</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Dispute Response Playbook for Landlords
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            A step-by-step framework for triaging, documenting, negotiating, and
            resolving CAM billing disputes. Respond from a position of strength
            rather than panic.
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
            A CAM dispute response has 4 phases: (1) <strong>triage</strong>: is
            the dispute actually valid? (2){" "}
            <strong>document your position</strong>: build a written response
            memo with lease citations. (3) <strong>negotiate</strong>: offer a
            walkthrough, consider partial concessions on genuine gray areas. (4){" "}
            <strong>resolve or escalate</strong>: settle in writing if resolved,
            send a formal demand or involve counsel if not.
          </p>
        </div>

        {/* Overview */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Why a Structured Response Matters
          </h2>
          <p className="mb-4 text-muted-foreground">
            Most CAM disputes arrive as a brief email or letter claiming an
            overcharge, often without specifics. Landlords who treat disputes as
            nuisances (responding with a denial and no documentation) reliably
            escalate minor billing questions into formal audit demands and,
            eventually, litigation. Landlords who respond quickly with organized
            evidence resolve 80% of disputes without escalation.
          </p>
          <p className="mb-4 text-muted-foreground">
            The goal of this playbook is not to &ldquo;win&rdquo; disputes. It
            is to close them quickly, correctly, and with the tenant
            relationship intact. That means being willing to concede clear
            errors and being equally clear about what you will not concede.
          </p>
          <p className="text-muted-foreground">
            Before applying this playbook, run a self-audit on the disputed
            reconciliation. Finding your own errors before responding puts you
            in control of the narrative. Discovering them after the tenant has
            already built their case puts you on the defensive.
          </p>
        </section>

        {/* Phase 1 */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Phase 1: Triage. Is the Dispute Valid?
          </h2>
          <p className="mb-4 text-muted-foreground">
            Before drafting a response, categorize the dispute. This
            categorization determines your entire response strategy.
          </p>
          <div className="space-y-4">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium text-green-700">
                    Category A: Calculation Error (Fix It)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You applied the wrong pro-rata percentage, made an
                    arithmetic error in the gross-up, or used an incorrect
                    denominator. These are objective and verifiable. Pull the
                    reconciliation workbook, run the math, and if the tenant is
                    right, issue a corrected statement and credit within the
                    lease&apos;s required timeframe. Do not negotiate a
                    calculation error. Correct it.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-start gap-3">
                <Scale className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-700">
                    Category B: Classification Dispute (Apply the Lease)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The tenant objects that a specific expense is not
                    recoverable under their lease. For example, a lobby
                    renovation they characterize as capital, or a management fee
                    they claim exceeds the lease cap. Pull the lease and apply
                    the relevant clause. If the expense is clearly permitted,
                    document it with a lease citation. If the lease is
                    ambiguous, treat this as a methodology dispute.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-700">
                    Category C: Methodology Dispute (Negotiate)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The lease language is genuinely ambiguous. Both
                    interpretations are defensible. These disputes require
                    negotiation, often with a partial concession or a
                    prospective change in methodology. Document both
                    parties&apos; interpretations, the basis for each, and agree
                    in writing on the going-forward treatment.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Category D: Bad-Faith Dispute (Escalate to Counsel)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The tenant is disputing correctly calculated, clearly
                    permitted charges to delay payment or gain advantage in an
                    unrelated negotiation (e.g., rent renewal). Signs include
                    vague objections that cannot be substantiated with specific
                    lease language, disputing the same items that were settled
                    in prior years, or linking the dispute explicitly to a lease
                    renewal negotiation. Involve legal counsel promptly.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-lg border p-4">
            <p className="text-sm font-medium">Triage Checklist</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                &rarr; Review the tenant&apos;s objection. Does it identify
                specific line items and dollar amounts?
              </li>
              <li>
                &rarr; Pull the reconciliation workbook and the tenant&apos;s
                lease
              </li>
              <li>&rarr; Re-run the disputed calculations independently</li>
              <li>
                &rarr; Identify the relevant lease clause for each disputed item
              </li>
              <li>
                &rarr; Assign each disputed item to Category A, B, C, or D
              </li>
            </ul>
          </div>
        </section>

        {/* Phase 2 */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Phase 2: Document Your Position
          </h2>
          <p className="mb-4 text-muted-foreground">
            For every item you are defending, create a written dispute response
            memo. This document is your evidentiary record and, if the dispute
            escalates, the foundation for your legal position.
          </p>

          <h3 className="mb-3 text-lg font-medium">
            Structure of a Dispute Response Memo
          </h3>
          <div className="mb-6 space-y-3">
            <div className="rounded-lg border p-4">
              <p className="font-medium">
                1. Statement of the Tenant&apos;s Position
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Quote the tenant&apos;s objection verbatim. Do not paraphrase.
                If the dispute letter is vague, send a clarification request
                asking the tenant to identify the specific line items and lease
                provisions they are relying on.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="font-medium">
                2. Statement of the Landlord&apos;s Position
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                State clearly and specifically what you are claiming and why.
                Reference the lease section (article, section, and page number)
                that permits the charge.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="font-medium">3. Supporting Lease Language</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Quote the exact lease language. Do not summarize it. Attach the
                relevant lease pages as exhibits. If there are multiple lease
                amendments, identify which amendment controls.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="font-medium">4. Calculation Shown Step by Step</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Show every number: the gross expense pool, the variable/fixed
                split, the occupancy data used for gross-up, the denominator,
                the tenant&apos;s RSF, and the resulting pro-rata share. If
                there is a cap, show the prior year base and the cap bank
                balance. Attach the reconciliation workbook as an exhibit.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="font-medium">5. Supporting Invoices and GL Data</p>
              <p className="mt-1 text-sm text-muted-foreground">
                For each disputed expense category, include the vendor invoices,
                contracts, or GL account detail that substantiate the charge.
                This is the most time-consuming part. It is also what closes
                legitimate disputes.
              </p>
            </div>
          </div>

          <p className="text-muted-foreground">
            Send the response memo via certified mail to the notice address
            specified in the lease, with a copy by email to the tenant&apos;s
            property contact. Keep the signed delivery confirmation.
          </p>
        </section>

        {/* Phase 3 */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Phase 3: Negotiate</h2>
          <p className="mb-4 text-muted-foreground">
            After delivering the response memo, offer a call to walk through the
            calculations together. Tenants (and their auditors) often back down
            quickly when a landlord demonstrates organized, documented
            positions. A 45-minute walkthrough with a property manager and the
            reconciliation workbook resolves more disputes than lengthy written
            exchanges.
          </p>

          <h3 className="mb-3 text-lg font-medium">What to Concede</h3>
          <ul className="mb-6 space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                Clear calculation errors: math mistakes, wrong percentage
                applied, incorrect denominator
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                Expenses that your own review confirms are not recoverable under
                this tenant&apos;s lease
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                Genuinely ambiguous lease language where the tenant&apos;s
                interpretation is reasonable. Offer a partial concession or a
                prospective method change
              </span>
            </li>
          </ul>

          <h3 className="mb-3 text-lg font-medium">What Not to Concede</h3>
          <ul className="mb-4 space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Correctly calculated charges where you have clear lease support.
                Conceding these creates a precedent that will cost you more in
                future years
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Expenses that are clearly recoverable but that the tenant simply
                does not want to pay. Document your position and hold it
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Any concession without a written settlement agreement. Verbal
                settlements create future disputes about what was agreed
              </span>
            </li>
          </ul>
        </section>

        {/* Phase 4 */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Phase 4: Resolve or Escalate
          </h2>

          <h3 className="mb-3 text-lg font-medium">If Resolved</h3>
          <p className="mb-4 text-muted-foreground">
            Document the settlement in writing. Send a brief letter or email
            stating: the disputed items, the agreed resolution (credit amount,
            revised billing, or reaffirmation of the original charge), and that
            the resolution is in full and final satisfaction of the dispute.
            Both parties should sign or confirm in writing. Update the
            reconciliation system to reflect any credits issued.
          </p>

          <h3 className="mb-3 text-lg font-medium">If Not Resolved</h3>
          <p className="mb-4 text-muted-foreground">
            If the tenant rejects your documented position without a substantive
            counter-argument, issue a formal demand letter confirming your
            position, citing the supporting lease provisions, and stating that
            the charge stands. If the tenant is withholding payment based on the
            dispute, review the lease&apos;s payment obligation provisions -
            most leases require payment of undisputed amounts while disputes are
            pending.
          </p>
          <p className="text-muted-foreground">
            Escalate to legal counsel when the dispute has not resolved within
            the lease&apos;s negotiation period, when the tenant sends a demand
            letter or notice of legal action, or when the tenant begins
            withholding rent or other lease payments in connection with the
            dispute.
          </p>
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
                    Responding Without Looking at the Lease
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The most common mistake is responding to a dispute with a
                    generic denial (&ldquo;our calculations are correct&rdquo;)
                    without pulling the actual lease and verifying the charge is
                    permitted. If the tenant then hires an auditor who finds a
                    genuine error, you have already created a credibility
                    problem and potentially a precedent for the tenant to
                    escalate aggressively.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Conceding Under Pressure Without Checking Whether
                    You&apos;re Right
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some landlords concede disputes to preserve the tenant
                    relationship without verifying the merits. If the charge was
                    correct, you have now set a precedent that you will credit
                    disputed items without substantiation. That creates an
                    incentive for the tenant (and their auditor) to dispute
                    aggressively every year.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Missing the Audit Window or Response Deadline
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Many leases specify that a tenant dispute must be raised
                    within 12–24 months of receiving the reconciliation
                    statement, and that the landlord must respond within 30–60
                    days. Missing the landlord response deadline can be treated
                    as an admission or can trigger a dispute resolution process
                    that defaults in the tenant&apos;s favor.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Settling Verbally Without Written Confirmation
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A verbal agreement to credit a tenant $3,000 on a CAM
                    dispute becomes a dispute about what was agreed when
                    personnel change on either side. Every settlement, however
                    small, should be confirmed in a brief written exchange that
                    states the disputed amount, the agreed resolution, and that
                    the matter is closed.
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
                How long do I have to respond to a CAM dispute?
              </h3>
              <p className="text-muted-foreground">
                Most leases require a landlord response within 30 to 60 days of
                receiving a written dispute notice. Check the notice provisions
                carefully. Some leases treat non-response as admission of the
                tenant&apos;s position. Calendar the response deadline
                immediately upon receiving a dispute letter.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Should I concede if I know I made a calculation error?
              </h3>
              <p className="text-muted-foreground">
                Yes, and promptly. Issue the credit, document what the error was
                and how you recalculated it, and send a corrected reconciliation
                statement. Conceding an error you actually made is the
                professional response; refusing to concede it is what creates
                escalation and litigation.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is the difference between a methodology dispute and a
                calculation dispute?
              </h3>
              <p className="text-muted-foreground">
                A calculation dispute is a math error: wrong percentage,
                incorrect denominator, arithmetic mistake. These are binary. One
                side is right. A methodology dispute is about lease
                interpretation, such as whether an expense is recoverable,
                whether gross-up applies, or how the denominator is defined.
                Methodology disputes require applying the lease language and, if
                ambiguous, negotiation.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                When should I escalate to legal counsel?
              </h3>
              <p className="text-muted-foreground">
                Escalate when the tenant has sent a formal demand letter or
                notice of arbitration, when the tenant is withholding CAM
                payments, when the disputed amount exceeds your cost-benefit
                threshold for counsel involvement, or when the dispute involves
                a legal question about lease interpretation your team cannot
                resolve authoritatively.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Can a poorly handled CAM dispute affect lease renewal?
              </h3>
              <p className="text-muted-foreground">
                Yes. A protracted CAM dispute handled with slow responses, poor
                documentation, or refusal to correct clear errors is a common
                reason tenants choose not to renew. Landlords who respond
                promptly with organized documentation and settle legitimate
                disputes quickly often turn disputes into trust-building moments
                that support renewal.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-dispute-trends-2026"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Dispute Trends 2026
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The dispute types landlords are seeing most often this year.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/audit-defense-packet"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Audit Defense Packet Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    What to include in your pre-audit documentation package.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-demand-letter-workflow"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Demand Letter Workflow
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How to respond to formal tenant demand letters.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/what-is-a-cam-audit-landlord"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    What Is a CAM Audit? Landlord&apos;s Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Understanding what tenants can demand and how to prepare.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-overbilling-landlord-liability"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Overbilling: Landlord Liability
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Legal and financial exposure from CAM billing errors.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Reconciliation Software
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Automated reconciliation verification for landlords.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Reconcile it right before tenants see it
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri runs the same checks professional audit firms use: GL
            classification, pro-rata denominator, management fee cap, gross-up,
            and CAM cap. It runs those checks against your Yardi or MRI export.
            Reconciling before a dispute starts is the fastest way to respond
            from a position of strength.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_dispute_response_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
