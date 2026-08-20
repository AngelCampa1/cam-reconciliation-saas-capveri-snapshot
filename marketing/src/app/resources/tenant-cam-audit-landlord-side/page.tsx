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
  title: "Tenant CAM Audit Requests: How Landlords Should Respond",
  description:
    "A step-by-step landlord playbook for responding to tenant CAM audit requests. Covers documentation requirements, audit scope, dispute resolution, and preemptive self-audit.",
  alternates: {
    canonical: `${SITE_URL}/resources/tenant-cam-audit-landlord-side`,
  },
  openGraph: {
    title: "Tenant CAM Audit Requests: How Landlords Should Respond",
    description:
      "A step-by-step landlord playbook for responding to tenant CAM audit requests. Covers documentation requirements, audit scope, dispute resolution, and preemptive self-audit.",
    url: `${SITE_URL}/resources/tenant-cam-audit-landlord-side`,
    type: "article",
  },
};

const howToSchema = structuredDataSchemas.howTo(
  "How to Respond to a Tenant CAM Audit Request",
  "The step-by-step process a commercial landlord should follow when a tenant invokes their CAM audit right, from initial acknowledgment through findings resolution.",
  [
    {
      name: "Acknowledge the audit notice and review the lease",
      text: "Within 5 business days of receiving an audit notice, send a written acknowledgment. Simultaneously, pull the tenant's lease and locate the audit rights clause. Note the exact window for your document production obligation, any auditor qualification requirements (CPA-only, no contingency fee), confidentiality obligations, and the scope of documents the tenant can request. The lease terms (not the auditor's demand letter) define your obligations.",
      url: `${SITE_URL}/resources/what-is-a-cam-audit-landlord`,
    },
    {
      name: "Assemble the documentation packet",
      text: "Gather: (1) the GL export for the audited year, organized by account code with descriptions; (2) vendor invoices for all line items over $5,000; (3) the management fee calculation showing the fee basis, rate, and lease cap; (4) the pro-rata share schedule listing all tenants, their square footage, and the denominator used; (5) the gross-up calculation showing actual occupancy and the occupancy threshold; (6) the CAM cap bank worksheet if applicable; and (7) the original reconciliation statement. Organize everything by expense category.",
    },
    {
      name: "Self-audit your reconciliation before the auditor arrives",
      text: "Run your own review (or use CapVeri) to verify your reconciliation against each lease's specific requirements before producing documents. Check: GL line items against the exclusion list, denominator definition per the lease, management fee cap compliance, gross-up applied only to variable expenses, and cap bank accuracy. Correcting errors before producing documents positions you to offer a settlement rather than defend a disputed statement under audit pressure.",
      url: `${SITE_URL}/cam-reconciliation-software`,
    },
    {
      name: "Produce documents and manage the audit process",
      text: "Provide documents in organized, readable format. Do not provide raw GL dumps that require hours of reformatting. Have a single point of contact for auditor questions. Respond to information requests within 5 business days. Keep records of every document produced and every question answered. If the auditor requests documents outside the audit scope (e.g., other tenants' lease terms or CAM statements), politely decline citing the confidentiality clause.",
    },
    {
      name: "Review preliminary findings and respond with documentation",
      text: "When the auditor issues preliminary findings, review each item against your documentation and the lease terms. For items you agree with, acknowledge promptly. For disputed items, prepare a written response citing the specific GL account, the supporting invoice or contract, and the lease provision that makes the expense recoverable. Avoid oral-only responses. Everything should be in writing.",
    },
    {
      name: "Negotiate settlement and close the audit",
      text: "Most CAM audits are resolved through negotiation. Items with clear documentary support are typically withdrawn by the auditor. Gray-area items are negotiated based on the reasonableness of the landlord's methodology and the strength of the documentation. Items the landlord cannot support should be settled with a credit or refund, including interest from the date of overbilling per the lease terms. Get the settlement in writing before issuing credits.",
    },
  ],
  "PT4H",
);

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What should a landlord do when a tenant requests a CAM audit?",
    answer:
      "When a tenant invokes their audit right, the landlord should: (1) acknowledge the notice in writing within 5 business days, (2) review the lease's audit rights clause for document production timeline and auditor qualification requirements, (3) self-audit the reconciliation to find and correct errors before the auditor arrives, (4) assemble the documentation packet (GL, invoices, management fee calc, pro-rata schedule, gross-up calculation, cap bank), and (5) produce documents in organized, category-by-category format within the lease-specified window.",
  },
  {
    question: "What documentation must a landlord produce in a CAM audit?",
    answer:
      "Standard CAM audit documentation includes: the general ledger for the audited year with account descriptions, vendor invoices for significant line items, the property management fee calculation and its basis, the pro-rata share schedule showing all tenants and the denominator used, the gross-up calculation with actual occupancy data, the CAM cap bank worksheet for cumulative cap leases, and the original reconciliation statement. Some leases require additional documentation; review the audit rights clause for the specific document list.",
  },
  {
    question: "What does a professional CAM audit firm look for?",
    answer:
      "Professional audit firms systematically check: GL line item classification against the lease's exclusion list (looking for capital items in operating accounts), the pro-rata denominator definition versus what the lease specifies, management fee calculation compliance with the lease cap, gross-up methodology (variable vs. fixed expense split), cumulative cap bank accuracy, and vendor invoice support for large charges. Landlords who self-audit using the same checklist before producing documents significantly reduce the scope and duration of findings.",
  },
  {
    question:
      "How much can landlords save by self-auditing before a tenant CAM audit?",
    answer:
      "Correcting errors before your auditor arrives eliminates interest accrual from the original overbilling date, which can run 12–24 months before an audit is complete. It also prevents triggering lease provisions that shift audit costs to the landlord when overcharges exceed 3–5% of total CAM billed. On a $400,000 annual CAM bill, the fee-shifting threshold is $12,000–$20,000. A single large capital-in-operating misclassification can breach it.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Tenant CAM Audit Requests: Landlord Response Guide",
    url: `${SITE_URL}/resources/tenant-cam-audit-landlord-side`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "Tenant CAM Audit Requests: How Landlords Should Respond",
  description:
    "A step-by-step landlord playbook for responding to tenant CAM audit requests. Covers documentation requirements, audit scope, dispute resolution, and preemptive self-audit.",
  url: `${SITE_URL}/resources/tenant-cam-audit-landlord-side`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1500,
});

export default function TenantCamAuditLandlordSidePage() {
  return (
    <>
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <main className="mx-auto max-w-4xl px-4 py-12 pb-24 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link href="/resources" className="hover:text-foreground">
            Resources
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-foreground">
            Tenant CAM Audit Requests: Landlord Response
          </span>
        </nav>

        {/* Header */}
        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Tenant CAM Audit Requests: How Landlords Should Respond
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            When a tenant invokes their CAM audit right, the response strategy
            you adopt in the first two weeks determines whether the audit
            becomes a brief administrative exercise or a months-long dispute.
            Here is the landlord playbook.
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

        {/* Featured snippet */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">
            Quick Answer: What Should a Landlord Do When a Tenant Requests a CAM
            Audit?
          </h2>
          <p className="text-muted-foreground">
            When a tenant invokes their audit right, landlords should
            acknowledge within the lease-specified window, review the audit
            rights clause to define the exact scope of the obligation,
            self-audit the reconciliation to find and correct errors before the
            auditor arrives, assemble a complete documentation packet, and
            produce documents in organized format. Landlords who self-audit
            first consistently resolve audits faster and with lower total credit
            exposure than those who produce documents and wait for findings.
          </p>
        </div>

        {/* Step-by-Step Response Workflow */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Step-by-Step Landlord Response Workflow
          </h2>
          <div className="space-y-5">
            {[
              {
                step: "1",
                title:
                  "Acknowledge the audit notice and review the lease (Days 1–5)",
                body: "Send written acknowledgment of the audit notice within 5 business days. Immediately pull the tenant's lease and locate the audit rights clause (the specific executed lease including all addenda, not the standard form). Note: the exact document production deadline, auditor qualification requirements (CPA-only clauses are common), any confidentiality obligations the auditor must sign, and the specific list of documents the tenant is entitled to request. These lease terms control, not the auditor's demand letter.",
              },
              {
                step: "2",
                title:
                  "Self-audit your reconciliation before assembling documents (Days 5–15)",
                body: "Before producing a single document, run your own review of the reconciliation being audited. Check every GL line item against the lease's recoverable expense definition and exclusion list. Verify the pro-rata denominator matches the lease definition. Confirm the management fee was calculated on the correct basis and didn't exceed the lease cap. Verify gross-up was applied only to variable expenses and used weighted average occupancy. Review the cap bank for accuracy. This step is the highest-ROI activity in the entire audit process.",
              },
              {
                step: "3",
                title:
                  "Correct any errors found before producing documents (Days 15–20)",
                body: "If the self-audit reveals errors, issue corrected reconciliation statements and credits before providing documents. This is proactive compliance that eliminates interest accrual, may prevent audit fee-shifting, and demonstrates good faith. It is not an admission of broad culpability. Attach a cover letter explaining the correction. Auditors who receive a corrected statement alongside the documentation packet typically narrow their scope significantly.",
              },
              {
                step: "4",
                title:
                  "Assemble and organize the documentation packet (Days 15–25)",
                body: "Prepare the documentation packet in category-by-category order: (1) GL export with account descriptions; (2) vendor invoices for line items over $5,000; (3) management fee calculation worksheet; (4) pro-rata share schedule for all tenants; (5) gross-up calculation with occupancy data; (6) CAM cap bank worksheet; and (7) original and corrected reconciliation statements. Create an index page listing every document included. Well-organized production signals competence and limits the audit's scope.",
              },
              {
                step: "5",
                title:
                  "Produce documents and manage auditor access (Days 25–35)",
                body: "Produce documents within the lease-specified window (typically 30–60 days after the audit notice). Designate a single point of contact for all auditor questions. Respond to follow-up document requests within 5 business days. Keep a log of every document produced and every question answered. If the auditor requests items outside the defined audit scope (other tenants' lease economics, rent rolls, or documents not listed in the audit rights clause), politely decline in writing and cite the specific lease provision.",
              },
              {
                step: "6",
                title:
                  "Review preliminary findings and negotiate resolution (Days 60–90+)",
                body: "When preliminary findings arrive, review each item carefully. For findings you agree with: acknowledge in writing and offer a credit or refund with interest. For findings you dispute: prepare a written response citing the GL account number, supporting invoice, and the specific lease provision making the expense recoverable. Avoid verbal-only responses. Gray-area items (where your methodology was reasonable even if imperfect) are negotiated based on documentation quality. Get any settlement agreement in writing before issuing credits.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {item.step}
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="mb-1 font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What Documentation to Produce */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Documentation Packet: What to Include
          </h2>
          <p className="mb-4 text-muted-foreground">
            The documentation packet is your primary defense. Landlords who
            produce complete, well-organized packets resolve audits faster and
            with fewer sustained findings than those who provide raw data dumps
            or partial responses.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Document
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    What It Shows
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Format Tip
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  [
                    "GL Export (by account code)",
                    "All operating expense transactions for the year; the primary audit evidence",
                    "Export from Yardi/MRI with account code, description, date, vendor, and amount. Group by account.",
                  ],
                  [
                    "Vendor Invoices",
                    "Invoice-level support for every significant charge; validates GL amounts",
                    "Organize by GL account. Include all invoices over $5,000; bundle smaller invoices by vendor.",
                  ],
                  [
                    "Management Fee Calculation",
                    "Fee basis, rate applied, and lease cap; proves fee is within contractual limit",
                    "Show: gross revenue basis, fee rate, calculated fee, lease cap amount, and the lower of the two.",
                  ],
                  [
                    "Pro-Rata Share Schedule",
                    "All tenants, their SF, the denominator, and each tenant's pro-rata %",
                    "Confirm denominator definition matches the auditing tenant's lease. Flag anchor exclusions.",
                  ],
                  [
                    "Gross-Up Calculation",
                    "Occupancy for the year, gross-up threshold, variable vs. fixed expense split",
                    "Show monthly or quarterly occupancy data used to calculate weighted average. Flag the threshold.",
                  ],
                  [
                    "CAM Cap Bank Worksheet",
                    "Prior-year base, cap rate, prior-year actual, banked amount, current-year ceiling",
                    "Show the full cap bank history from the cap base year. Note whether cap is cumulative or not.",
                  ],
                  [
                    "Reconciliation Statement",
                    "The original statement issued to the tenant; starting point of all findings",
                    "Include both the original and any corrected versions with a cover letter explaining revisions.",
                  ],
                ].map(([doc, shows, tip]) => (
                  <tr key={doc} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground align-top">
                      {doc}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {shows}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {tip}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* How Professional Audit Firms Work */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How Professional CAM Audit Firms Approach Reconciliations
          </h2>
          <p className="mb-4 text-muted-foreground">
            Understanding the audit methodology helps landlords anticipate
            exactly what will be scrutinized. Professional audit firms
            (representing institutional tenants in large commercial leases)
            follow a systematic process that mirrors how property controllers
            should be reviewing their own work.
          </p>
          <div className="space-y-3">
            {[
              {
                phase: "Phase 1: Preliminary Review",
                body: "The auditor reads the lease front-to-back, flags the CAM definition, exclusion list, denominator definition, gross-up provision, management fee cap, and audit rights clause. They build a checklist of every lease-specific requirement before looking at a single GL transaction.",
              },
              {
                phase: "Phase 2: GL Classification Audit",
                body: "Every expense account in the GL is tested against the recoverable expense definition. The auditor pulls the 5–10 largest line items in each account and requests invoices. They specifically look for capital items in maintenance accounts, a common sign of property management software that doesn't enforce asset vs. operating expense distinctions.",
              },
              {
                phase: "Phase 3: Pro-Rata and Gross-Up Verification",
                body: "The denominator is verified against the lease definition. Occupancy data is checked against the rent roll. The auditor verifies that fixed expenses (taxes, insurance) were not grossed up, which is a common error that inflates the recoverable pool. They also check for consistency across tenant reconciliations if they represent multiple tenants in the building.",
              },
              {
                phase: "Phase 4: Management Fee Analysis",
                body: "The fee rate, the basis (gross revenue vs. base rent), and the lease cap are all cross-checked. The auditor verifies whether reimbursements were excluded from the fee base as required. This phase often surfaces the highest-dollar findings in suburban office and retail reconciliations.",
              },
            ].map((item) => (
              <div key={item.phase} className="rounded-lg border p-4">
                <h3 className="mb-1 font-semibold text-foreground">
                  {item.phase}
                </h3>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cost Savings from Self-Audit */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The Financial Case for Self-Auditing First
          </h2>
          <p className="mb-4 text-muted-foreground">
            Any error you find and correct before your auditor arrives
            eliminates interest accrual from the date of overbilling. On a
            $30,000 overbilling finding, interest at prime + 2% (approximately
            9.5% in early 2026) accruing for 18 months (the typical audit
            duration) adds $4,275 to the total credit due. Find and correct it
            before the audit starts and you pay $30,000, not $34,275.
          </p>
          <p className="mb-4 text-muted-foreground">
            The fee-shifting threshold is the other major consideration. Most
            commercial leases require the landlord to pay the tenant&apos;s
            audit costs when total overcharges exceed 3–5% of annual CAM billed.
            In a building billing $500,000/year in CAM, that threshold is
            $15,000–$25,000. A single capital-in-operating misclassification of
            $20,000 breaches the threshold and adds the auditor&apos;s
            $8,000–$15,000 fee to the landlord&apos;s tab. Catching and
            correcting the $20,000 error before the audit eliminates the
            $8,000–$15,000 audit cost exposure.
          </p>
          <p className="text-muted-foreground">
            Landlords who self-audit every reconciliation, not just when a
            tenant audit notice arrives, eliminate the reactive component
            entirely and operate with confidence that their statements will
            withstand scrutiny.
          </p>
        </section>

        {/* What Can Go Wrong section */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Missing the Lease&apos;s Response Window Waives Cure Rights
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Many landlords treat the document production deadline as a
                    soft target, a best-effort window rather than a hard
                    obligation. It is a hard obligation under most leases. If
                    the lease requires document production within 30 days and
                    the landlord produces documents on Day 45, they may have
                    waived their right to contest specific audit findings or
                    lost procedural rights that the lease grants as conditional
                    on timely response. Acknowledge the notice immediately,
                    calendar the deadline, and meet it.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Providing an Incomplete GL That Triggers a Full
                    Invoice-Level Review
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When the landlord produces a high-level GL summary (account
                    totals without line-level transactions), experienced
                    auditors treat it as a signal that the underlying data may
                    not support the totals and immediately request the full
                    transaction-level detail plus invoices for every account.
                    The result is an audit that is 3–4x more intensive than if
                    the landlord had provided the transaction-level GL upfront.
                    A complete, well-organized GL with account descriptions and
                    vendor names is consistently the fastest path to audit
                    closure.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Management Fee Presented Without the Gross Revenue Basis
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When the documentation packet includes only the management
                    fee dollar amount without the calculation showing the fee
                    basis, the rate applied, and a comparison to the lease cap,
                    auditors assume the worst and request the underlying revenue
                    data. This gives them visibility into the property&apos;s
                    full revenue picture, something most landlords would prefer
                    to keep scoped to the audit. Providing a complete management
                    fee worksheet up front limits the discovery scope and closes
                    this line of inquiry in the first document production.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ section */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-lg font-medium">
                What should a landlord do when a tenant requests a CAM audit?
              </h3>
              <p className="text-muted-foreground">
                Acknowledge the audit notice in writing within 5 business days.
                Review the lease&apos;s audit rights clause to define the exact
                document production obligation, timeline, and auditor
                qualification requirements. Self-audit your reconciliation to
                find and correct errors before the auditor arrives. Assemble a
                complete, organized documentation packet. Produce documents
                within the lease-specified window (typically 30–60 days).
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What documentation must a landlord produce in a CAM audit?
              </h3>
              <p className="text-muted-foreground">
                Standard CAM audit documentation includes: the GL export for the
                audited year with account descriptions, vendor invoices for
                significant line items, the management fee calculation and its
                basis, the pro-rata share schedule showing all tenants and the
                denominator used, the gross-up calculation with occupancy data,
                the CAM cap bank worksheet for cumulative cap leases, and the
                original reconciliation statement. The specific list is defined
                by the lease&apos;s audit rights clause. Review it before
                producing documents.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What does a professional CAM audit firm look for?
              </h3>
              <p className="text-muted-foreground">
                Professional audit firms systematically check: GL classification
                against each lease&apos;s exclusion list (specifically looking
                for capital items in operating accounts), the pro-rata
                denominator vs. lease definition, management fee compliance with
                the lease cap, gross-up methodology (variable vs. fixed expense
                split), cumulative cap bank accuracy, and vendor invoice support
                for large charges. Landlords who self-audit using the same
                checklist before producing documents significantly reduce the
                scope and duration of findings.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                How much can landlords save by self-auditing before a tenant CAM
                audit?
              </h3>
              <p className="text-muted-foreground">
                Self-auditing eliminates interest accrual from the date of any
                overbilling found. On a $30,000 error, that saves $4,275 in
                interest over an 18-month audit at 9.5% per year. It also
                prevents triggering fee-shifting provisions that require the
                landlord to pay the tenant&apos;s audit costs when overcharges
                exceed 3–5% of total CAM billed. In a $500,000/year CAM
                building, a single $20,000 capital misclassification can trigger
                $8,000–$15,000 in audit cost exposure, all preventable with a
                preemptive self-audit.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/what-is-a-cam-audit-landlord"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    What Is a CAM Audit?
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Audit rights clauses, windows, and what auditors look for.
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
                    How to build and maintain a preemptive audit documentation
                    package.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-dispute-response"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Dispute Response Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Responding to demand letters and negotiating settlements.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-reconciliation-process"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Reconciliation Process Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The full reconciliation cycle with checklists and timelines.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Self-Audit Every Reconciliation Before Sending It
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri runs the same systematic checks professional audit firms
            use: GL classification, denominator verification, management fee
            compliance, gross-up methodology, and cap bank accuracy, against
            your actual lease terms and Yardi or MRI export. Build the habit of
            self-auditing before every reconciliation statement goes out.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "tenant_cam_audit_landlord_cta",
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
