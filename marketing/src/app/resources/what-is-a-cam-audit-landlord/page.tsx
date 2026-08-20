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
  title: "What Is a CAM Audit? A Landlord's Guide to Tenant Audit Requests",
  description:
    "Understand CAM audit rights, what tenants can demand, and how landlords should prepare. Covers audit windows, documentation requirements, and dispute resolution.",
  alternates: {
    canonical: `${SITE_URL}/resources/what-is-a-cam-audit-landlord`,
  },
  openGraph: {
    title: "What Is a CAM Audit? A Landlord's Guide to Tenant Audit Requests",
    description:
      "Understand CAM audit rights, what tenants can demand, and how landlords should prepare. Covers audit windows, documentation requirements, and dispute resolution.",
    url: `${SITE_URL}/resources/what-is-a-cam-audit-landlord`,
    type: "article",
  },
};

const howToSchema = structuredDataSchemas.howTo(
  "How to Prepare for a Tenant CAM Audit",
  "The steps a commercial landlord should take when a tenant invokes their CAM audit right, from reviewing the lease to responding to audit findings.",
  [
    {
      name: "Review the audit rights clause in the tenant's lease",
      text: "Locate the audit rights provision in the lease. Note the audit window (typically 12–18 months from the reconciliation statement date), any notice requirements, restrictions on who may conduct the audit (e.g., CPA-only clause), and any confidentiality obligations. The audit rights clause defines the exact scope of what the tenant can demand.",
      url: `${SITE_URL}/resources/lease-clauses`,
    },
    {
      name: "Assemble the documentation packet",
      text: "Gather all documents needed to support your reconciliation: the GL export for the audited year, vendor invoices for significant line items, the management fee calculation basis, pro-rata share schedule for all tenants, the cap bank worksheet if applicable, and the original reconciliation statement. Organize by expense category for efficient auditor review.",
    },
    {
      name: "Self-audit your own reconciliation before the auditor arrives",
      text: "Run CapVeri or a manual review on your own reconciliation to find errors before the tenant's auditor does. Check GL classifications against each lease's exclusion list, verify the denominator matches the lease definition, confirm gross-up was applied to variable expenses only, and validate the cap calculation. Correcting errors proactively positions you to offer a settlement rather than defend a disputed statement.",
      url: `${SITE_URL}/cam-reconciliation-software`,
    },
    {
      name: "Respond to audit findings with supporting documentation",
      text: "When the auditor issues findings, respond item by item with documentary support. For each disputed line item: cite the GL account, the invoices or contracts supporting the charge, and the lease provision making it recoverable. Findings you cannot support should be settled promptly - sustained disputes with interest can compound quickly.",
    },
  ],
  "PT2H",
);

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a CAM audit?",
    answer:
      "A CAM audit is a tenant's contractual right to review and verify the landlord's operating expense calculations, typically permitted within 12–18 months of receiving the annual CAM reconciliation statement. The tenant (or their hired CPA firm) examines the landlord's GL, invoices, management fee calculations, pro-rata denominator, and any cap or gross-up adjustments to verify the charges are accurate and permitted under the lease.",
  },
  {
    question: "What can a tenant demand in a CAM audit?",
    answer:
      "Under a standard audit rights clause, a tenant can typically demand: the full general ledger for the audited year, supporting invoices for significant expense items, the management fee calculation and basis, the pro-rata share schedule showing all tenants and the denominator used, the gross-up calculation and occupancy data, and the CAM cap bank worksheet. Some leases limit the audit to specific expense categories or require that auditors sign confidentiality agreements before receiving building-wide data.",
  },
  {
    question: "How long does a CAM audit take?",
    answer:
      "A typical commercial CAM audit takes 2–6 weeks from the time the landlord provides documentation to the time the auditor issues preliminary findings. Complex portfolios with multiple properties, large expense pools, or cumulative cap histories can take 3–4 months. Landlords who self-audit and correct obvious errors before the auditor arrives significantly reduce the audit duration and the scope of findings.",
  },
  {
    question: "What happens if a CAM audit finds errors?",
    answer:
      "When a tenant auditor finds overcharges, they typically issue a written demand letter listing each error and the requested credit amount, often with interest from the date of overbilling. Most lease audit clauses require the landlord to credit the tenant's account or issue a refund within 30–60 days of a validated finding. If the landlord disputes the findings, most leases provide a good-faith negotiation period before either party can pursue legal remedies.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "What Is a CAM Audit?",
    url: `${SITE_URL}/resources/what-is-a-cam-audit-landlord`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "What Is a CAM Audit? A Landlord's Guide to Tenant Audit Requests",
  description:
    "Understand CAM audit rights, what tenants can demand, and how landlords should prepare. Covers audit windows, documentation requirements, and dispute resolution.",
  url: `${SITE_URL}/resources/what-is-a-cam-audit-landlord`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1300,
});

export default function WhatIsACamAuditLandlordPage() {
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
          <span className="text-foreground">What Is a CAM Audit?</span>
        </nav>

        {/* Header */}
        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            What Is a CAM Audit? A Landlord&apos;s Guide to Tenant Audit
            Requests
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Most NNN leases give tenants the right to audit your CAM
            reconciliations. Understanding what auditors look for and getting
            there first is the difference between a quick resolution and a
            prolonged dispute.
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
            Quick Answer: What Is a CAM Audit?
          </h2>
          <p className="text-muted-foreground">
            A CAM audit is a tenant's contractual right to review and verify the
            landlord's operating expense calculations, typically permitted
            within 12–18 months of receiving the annual reconciliation
            statement. The tenant or their hired CPA firm examines the
            landlord's GL, invoices, management fee calculations, pro-rata
            denominator, and any gross-up or cap adjustments to verify the
            charges are accurate and permitted under the lease.
          </p>
        </div>

        {/* Audit Rights Clauses */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What Lease Audit Rights Clauses Typically Say
          </h2>
          <p className="mb-4 text-muted-foreground">
            Audit rights are usually found in the CAM reconciliation section of
            the lease, labeled &quot;Audit Right,&quot; &quot;Tenant
            Audit,&quot; or &quot;Right to Examine Records.&quot; Most clauses
            specify:
          </p>
          <ul className="mb-6 space-y-3 text-muted-foreground">
            <li className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Audit window:</strong> The
                tenant must invoke the audit right within a specified period
                after receiving the reconciliation statement - typically 12
                months, though some leases allow 18–24 months. Statements that
                are never disputed become final after the window closes.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  Auditor qualifications:
                </strong>{" "}
                Many leases require the audit be conducted by a licensed CPA or
                designated accounting firm. &quot;Contingency fee auditors&quot;
                (firms paid a percentage of any recovery) are explicitly
                prohibited in some leases.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Confidentiality:</strong>{" "}
                Building-wide expense data is commercially sensitive. Most
                leases require auditors to sign confidentiality agreements
                before accessing documents showing other tenants&apos; square
                footage or payments.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  Document production window:
                </strong>{" "}
                The landlord typically has 30–60 days after receiving an audit
                notice to produce the requested documentation.
              </span>
            </li>
          </ul>
        </section>

        {/* What Auditors Look At */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What Professional Audit Firms Examine
          </h2>
          <p className="mb-4 text-muted-foreground">
            Professional CAM audit firms follow a systematic checklist.
            Landlords who understand the methodology can verify their own work
            before the auditor arrives.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Audit Focus Area
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    What the Auditor Checks
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Common Finding
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  [
                    "GL Classification",
                    "Each expense line vs. lease exclusion list",
                    "Capital items coded as repairs/maintenance",
                  ],
                  [
                    "Pro-Rata Denominator",
                    "Denominator used vs. lease definition",
                    "Wrong SF basis (TRA vs. TLA vs. fixed)",
                  ],
                  [
                    "Management Fee",
                    "Fee amount vs. lease cap; calculation basis",
                    "Fee based on gross revenues incl. tenant reimbursements",
                  ],
                  [
                    "Gross-Up Calculation",
                    "Occupancy used; which expenses were grossed up",
                    "Fixed expenses incorrectly included in gross-up",
                  ],
                  [
                    "CAM Cap",
                    "Cap type (cumulative vs. non-cumulative); cap bank",
                    "Cap calculated on all expenses vs. controllable-only",
                  ],
                  [
                    "Invoice Support",
                    "Large charges traced to vendor invoices",
                    "Vendor invoices include services for other properties",
                  ],
                  [
                    "Lease Exclusions",
                    "Tenant-specific exclusions per lease addenda",
                    "Below-market management fee cap from negotiated addendum ignored",
                  ],
                ].map(([area, check, finding]) => (
                  <tr key={area} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground align-top">
                      {area}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {check}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {finding}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Typical Dispute Outcomes */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Typical CAM Audit Dispute Outcomes
          </h2>
          <p className="mb-4 text-muted-foreground">
            Most CAM audits are resolved through negotiation rather than
            litigation. The typical process after an auditor issues findings:
          </p>
          <div className="space-y-4">
            {[
              {
                title: "Landlord concedes supported findings",
                body: "For findings supported by clear documentation (a capital item in the GL, a management fee above the lease cap) the landlord typically issues a credit or refund with interest calculated from the date of overbilling. Most leases specify the interest rate (often prime rate + 2%).",
              },
              {
                title: "Parties negotiate disputed findings",
                body: "Gray-area items (whether a parking lot repair constitutes a capital improvement, or whether a multi-property insurance policy was allocated fairly) are negotiated. Landlords with complete documentation and a reasonable allocation methodology fare significantly better.",
              },
              {
                title: "Auditor fees shift on large overcharges",
                body: "Some leases require the landlord to pay the tenant's audit costs if the audit reveals overcharges exceeding a threshold (commonly 3–5% of total CAM billed). On a $500,000 annual CAM bill, that threshold is $15,000–$25,000. Landlords who self-audit first and correct errors in advance rarely trigger the fee-shifting provision.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border p-4">
                <h3 className="mb-1 font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
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
                    Audit Window Misread: Statement Already Final
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A tenant who invokes an audit right after the lease&apos;s
                    12-month window has closed has lost their audit right for
                    that statement year. Landlords who miss this defense
                    routinely produce documentation and negotiate credits for
                    years they were never obligated to defend. Review audit
                    window language at the time you receive the audit notice -
                    not after you&apos;ve already produced three years of GL
                    exports.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Incomplete GL Triggers a Deeper Invoice-Level Audit
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a landlord produces a GL summary without line-level
                    detail, experienced auditors request the underlying invoices
                    for every significant account. Providing a complete,
                    well-organized GL with expense descriptions and vendor names
                    up front limits the audit scope and demonstrates that you
                    have nothing to hide. Producing an incomplete GL signals the
                    opposite and escalates the audit into a full invoice review,
                    which takes months longer.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Inconsistent Pro-Rata Denominator Across Tenants in the Same
                    Building
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the building has 80,000 SF total rentable area but one
                    tenant&apos;s lease uses 75,000 SF (excluding the anchor
                    tenant&apos;s space) and another uses 80,000 SF, applying a
                    single denominator to all tenants is a billing error under
                    at least one lease. Auditors who represent multiple tenants
                    in the same building coordinate their findings. When they
                    compare denominators across tenant reconciliations,
                    inconsistencies become immediately visible.
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
              <h3 className="mb-2 text-lg font-medium">What is a CAM audit?</h3>
              <p className="text-muted-foreground">
                A CAM audit is a tenant&apos;s contractual right to review the
                landlord&apos;s operating expense calculations, typically
                permitted within 12–18 months of receiving the annual
                reconciliation statement. The tenant or their auditor examines
                GL data, invoices, and lease compliance to verify the charges
                match what the lease permits.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What can a tenant demand in a CAM audit?
              </h3>
              <p className="text-muted-foreground">
                Under a standard audit rights clause, tenants can typically
                request the full general ledger for the audited year, vendor
                invoices for significant line items, the management fee
                calculation basis, the pro-rata share schedule, gross-up
                occupancy data, and the CAM cap bank worksheet. Some leases
                restrict the audit scope to specific categories or require
                auditor confidentiality agreements before building-wide data is
                shared.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                How long does a CAM audit take?
              </h3>
              <p className="text-muted-foreground">
                A typical CAM audit takes 2–6 weeks from documentation
                production to preliminary findings. Complex properties with
                large expense pools or multi-year cumulative cap histories can
                take 3–4 months. Landlords who self-audit, organize
                documentation in advance, and correct obvious errors before the
                auditor arrives significantly reduce both the duration and the
                scope of findings.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What happens if a CAM audit finds errors?
              </h3>
              <p className="text-muted-foreground">
                When the auditor finds overcharges, they issue a written demand
                for credits with interest from the date of overbilling. Most
                leases require the landlord to credit or refund validated
                findings within 30–60 days. If the landlord disputes the
                findings, most leases provide a negotiation period before either
                party can pursue legal action. Some leases also shift the
                tenant's audit costs to the landlord when overcharges exceed a
                defined threshold.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/tenant-cam-audit-landlord-side"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    How to Respond to Tenant CAM Audits
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Step-by-step landlord playbook for audit responses.
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
                    How to respond to tenant demand letters and negotiate
                    settlements.
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
              href="/tools/cam-gross-up-calculator"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Gross-Up Calculator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Verify your gross-up math before the auditor does.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Self-Audit Before the Tenant&apos;s Auditor Does
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri runs the same checks professional audit firms use: GL
            classification, pro-rata denominator, management fee cap, gross-up,
            and CAM cap. Run it against your Yardi or MRI export. Find and
            correct errors before they become tenant disputes.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "what_is_cam_audit_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
