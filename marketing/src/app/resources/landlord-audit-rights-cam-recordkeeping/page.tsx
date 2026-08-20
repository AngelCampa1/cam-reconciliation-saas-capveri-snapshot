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
  title:
    "Landlord Audit Rights and CAM Recordkeeping: What You're Required to Keep",
  description:
    "What records must landlords maintain to defend a CAM audit? Covers the standard documentation landlords are required to produce, retention periods, and how to organize your audit defense packet.",
  alternates: {
    canonical: `${SITE_URL}/resources/landlord-audit-rights-cam-recordkeeping`,
  },
  openGraph: {
    title:
      "Landlord Audit Rights and CAM Recordkeeping: What You're Required to Keep",
    description:
      "What records must landlords maintain to defend a CAM audit? Covers the standard documentation landlords are required to produce, retention periods, and how to organize your audit defense packet.",
    url: `${SITE_URL}/resources/landlord-audit-rights-cam-recordkeeping`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What records must a landlord produce in a CAM audit?",
    answer:
      "Most commercial leases require landlords to produce, at minimum: the annual GL extract for the property, vendor invoices for material line items (commonly those above $5,000), the management fee calculation workbook, the pro-rata share schedule showing all tenant denominators, property tax and insurance bills, and any CAM cap bank workbook if caps apply. Some leases also require the gross-up calculation worksheet. The specific list depends on the audit clause language in each lease.",
  },
  {
    question: "How long must landlords retain CAM records?",
    answer:
      "Most leases specify a retention period through the audit window plus an additional 12 months. The audit window is typically 12 months from the date of statement delivery, though some leases allow 18 or 24 months. Practical minimum: retain all CAM-related records for 3 years from the close of the reconciliation period, which covers the audit window, any dispute resolution period, and one year of buffer.",
  },
  {
    question:
      "What is the typical audit window for commercial CAM reconciliation?",
    answer:
      "The most common audit window in commercial leases is 12 months from the date the reconciliation statement is delivered to the tenant. Some retail leases (particularly those with major national tenants) specify 18 or 24 months. After the audit window closes, the landlord's statement is typically deemed final and binding, and the tenant forfeits the right to contest it.",
  },
  {
    question: "How should landlords organize CAM records for audit defense?",
    answer:
      "Organize records by property, then by lease year, with a master index that lists every document in the packet and its corresponding line item or calculation step. The audit defense packet should be producible within 5 business days of receiving an audit demand letter - which means the organization work happens before the audit request, not after. Store records in a named folder structure: Property > Lease Year > [GL Extract, Invoices, Management Fee, Pro-Rata Schedule, Tax Bills, Insurance, CAP Bank].",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Landlord Audit Rights and CAM Recordkeeping",
    url: `${SITE_URL}/resources/landlord-audit-rights-cam-recordkeeping`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "Landlord Audit Rights and CAM Recordkeeping: What You're Required to Keep",
  description:
    "What records must landlords maintain to defend a CAM audit? Covers the standard documentation landlords are required to produce, retention periods, and how to organize your audit defense packet.",
  url: `${SITE_URL}/resources/landlord-audit-rights-cam-recordkeeping`,
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

const documentationSet = [
  {
    item: "Annual GL export for the property",
    detail:
      "The full GL extract for the reconciliation period, filtered to the property and the recoverable expense account codes. This is the primary document in any audit. Produce it in the format your ERP generates. Do not reformat or summarize. If the tenant's auditor requests it in a different format, provide both the original export and any reformatted version.",
    note: "Required in virtually every audit clause. Produce in original ERP format.",
  },
  {
    item: "Vendor invoices for material line items",
    detail:
      "Most leases establish a materiality threshold for invoice production, commonly $5,000 per invoice or $10,000 per vendor per year. Below the threshold, the GL entry is typically sufficient. Above it, the underlying invoice must be producible. Retain invoices as PDFs organized by vendor, not by GL entry date. A $40,000 HVAC invoice is more easily found by vendor name than by the date it was entered.",
    note: "Common threshold: $5,000 per invoice or $10,000 per vendor per year.",
  },
  {
    item: "Management fee calculation workbook",
    detail:
      "The management fee is one of the most commonly contested CAM line items. Retain the calculation workbook that shows the fee basis (gross revenues, eligible expenses, or flat amount), the agreed rate, and the monthly fee for each period. If the property management agreement was amended mid-year, retain both the original agreement and the amendment, with the fee calculation split by applicable period.",
    note: "Required when management fee is in the CAM pool. Retain both the calculation and the management agreement.",
  },
  {
    item: "Pro-rata share schedule",
    detail:
      "A spreadsheet or report showing every tenant in the building, their leased square footage, their denominator, and their resulting pro-rata percentage for the reconciliation period. When denominators change mid-year (due to tenant expansions, contractions, or amendments), the schedule should show the effective dates of each denominator version. A pro-rata schedule that cannot explain why Tenant A's denominator is different from Tenant B's is one of the fastest audit escalation paths.",
    note: "Version the schedule. Document every denominator change with its effective date.",
  },
  {
    item: "Property tax bills",
    detail:
      "The actual tax assessor bills for all property tax payments included in the CAM pool. Verify the tax period matches the allocation period. Many jurisdictions bill in arrears, creating timing differences between when tax is assessed, when it is paid, and when it is allocated to tenants. Retain the bills (not just GL entries) because auditors will verify amounts and periods against public records.",
    note: "Retain original bills, not just GL entries. Note fiscal vs. calendar year differences.",
  },
  {
    item: "Insurance policies and premium allocations",
    detail:
      "The declarations page for each property insurance policy included in CAM, with the premium amount and policy period. If the policy period spans two calendar years, retain the proration calculation showing how the premium was allocated to each CAM period. For umbrella policies that cover multiple properties, retain the allocation methodology.",
    note: "Required for policies that span multiple CAM periods. Retain declarations pages.",
  },
  {
    item: "CAM cap bank workbook",
    detail:
      "If any lease in the property has a CAM cap (particularly a cumulative cap), retain the full cap bank history from lease commencement. The cap bank workbook should show, for each reconciliation year: actual tenant CAM obligation, cap ceiling, amount applied, and unused cap capacity carried forward. Without this history, you cannot defend the current year's cap calculation if the tenant's auditor challenges the base amount.",
    note: "Required for cumulative caps. Retain from lease commencement, not just the current year.",
  },
  {
    item: "Gross-up calculation worksheet",
    detail:
      "When gross-up is applied, retain the calculation showing actual occupancy percentage, the variable expense list, the actual variable amount, the gross-up threshold, and the resulting grossed-up expense figure. If occupancy changed materially during the year, the worksheet should reflect the occupancy used for each period. Some leases require gross-up to use average occupancy; others require point-in-time occupancy.",
    note: "Required when gross-up is applied. Document the occupancy rate and calculation method.",
  },
];

const errorPatterns = [
  {
    title: "Purging records before the audit window closes",
    detail:
      "A property manager destroyed paper vendor invoices as part of an office move 14 months after delivering the 2023 reconciliation statement. The lease allowed a 24-month audit window. When a national retail tenant filed an audit demand 18 months after statement delivery, the landlord could not produce $340,000 in vendor invoices covering the contested line items. The landlord settled for a $95,000 credit - not because the invoices were wrong, but because they could not be produced. The records retention policy had not accounted for the lease's 24-month audit window.",
  },
  {
    title: "Missing vendor invoices for capital items that were contested",
    detail:
      "A tenant's auditor flagged $180,000 in repairs and maintenance entries as potential capital expenditures. The landlord could produce the GL entries and the contractor invoices, but the invoices described the work as 'roof replacement' - the exact language the tenant used to argue that the expense should have been capitalized and amortized rather than expensed in a single year. The invoices were retained, but they contained the evidence that supported the tenant's position. Retain invoices, but also retain any supporting documentation (engineering reports, contractor scopes of work) that establishes the operating vs. capital nature of the work.",
  },
  {
    title:
      "Pro-rata schedule not versioned so changes over time cannot be explained",
    detail:
      "A tenant received reconciliation statements for three consecutive years in which their pro-rata percentage changed from 8.2% to 9.1% to 8.7%. When their auditor requested the pro-rata schedule, the landlord could only produce the current schedule - not the historical versions. Without documentation of when each denominator change took effect and why, the landlord could not explain the year-over-year fluctuations. The auditor characterized the changes as inconsistent methodology rather than lease-driven adjustments, and the dispute required outside counsel to resolve.",
  },
];

export default function LandlordAuditRightsCamRecordkeepingPage() {
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
          <span className="text-foreground">
            Landlord Audit Rights and CAM Recordkeeping
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Landlord Audit Rights and CAM Recordkeeping: What You&apos;re
            Required to Keep
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            When a tenant invokes their audit right, what you can produce in the
            first five days determines whether the dispute is resolved quickly
            or escalates to litigation.
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

        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            When a tenant invokes their audit right, landlords are typically
            required to produce the GL extract, vendor invoices for material
            line items, the management fee calculation, the pro-rata share
            schedule, and (if applicable) the CAM cap bank workbook and gross-up
            calculation. Most leases require a 2–3 year retention period for CAM
            records. The practical minimum: retain everything for 3 years from
            the close of the reconciliation period.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What Lease Audit Clauses Typically Require
          </h2>
          <p className="mb-4 text-muted-foreground">
            Not all commercial leases specify the records a landlord must
            maintain. Some audit clauses simply grant the tenant the right to
            audit without enumerating the required documentation. Where the
            lease is silent, the landlord is generally expected to produce
            whatever records a reasonable audit of the CAM statement would
            require.
          </p>
          <p className="mb-4 text-muted-foreground">
            More sophisticated leases (particularly those negotiated by national
            retail tenants or REITs) specify the document set explicitly,
            including the format (original ERP export vs. summary report), the
            retention period, and the deadline for production after an audit
            demand is delivered. If the landlord cannot produce required records
            within the specified deadline, some leases deem the tenant&apos;s
            audit findings to be correct.
          </p>
          <p className="text-muted-foreground">
            The documentation set below represents the standard that experienced
            tenant auditors expect to see, regardless of whether the lease
            specifies it explicitly.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Standard Documentation Set for CAM Audit Defense
          </h2>
          <div className="space-y-5">
            {documentationSet.map((doc, index) => (
              <div key={doc.item} className="rounded-lg border p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-2 font-semibold text-foreground">
                      {doc.item}
                    </h3>
                    <p className="mb-2 text-sm text-muted-foreground leading-relaxed">
                      {doc.detail}
                    </p>
                    <p className="text-xs text-muted-foreground bg-muted/60 rounded px-3 py-1.5 inline-block">
                      {doc.note}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Typical Audit Windows and Retention Periods
          </h2>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Provision
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Most Common
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Sometimes Seen
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Practical Minimum Retention
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Audit window after statement delivery
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">12 months</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    18–24 months
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Audit window + 12 months
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Record retention period
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    3 years from reconciliation close
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Lease term + 2 years
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    3 years from reconciliation close
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Document production after audit demand
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    10–15 business days
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    5–30 business days
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Prepare before demand arrives
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How to Organize Records for Audit Defense
          </h2>
          <p className="mb-4 text-muted-foreground">
            The audit defense packet should be assembled before an audit demand
            arrives, not in response to one. Property teams that wait until they
            receive an audit demand letter to start gathering records spend the
            first 30 days of the audit window on document retrieval rather than
            on substantive review, giving the tenant&apos;s auditor time to
            build a case before the landlord&apos;s response is ready.
          </p>
          <div className="rounded-lg border bg-muted/40 p-5 mb-4">
            <p className="font-medium text-foreground mb-2">
              Recommended folder structure (per property, per lease year)
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                <span className="font-mono">
                  /[Property Code]/[YYYY] CAM Reconciliation/
                </span>
              </li>
              <li className="ml-4">
                <span className="font-mono">01_GL_Export_[YYYY].csv</span>
              </li>
              <li className="ml-4">
                <span className="font-mono">02_Vendor_Invoices/</span> (one PDF
                per invoice, named by vendor and amount)
              </li>
              <li className="ml-4">
                <span className="font-mono">
                  03_Management_Fee_Calculation_[YYYY].xlsx
                </span>
              </li>
              <li className="ml-4">
                <span className="font-mono">
                  04_ProRata_Schedule_[YYYY].xlsx
                </span>{" "}
                (versioned with effective dates)
              </li>
              <li className="ml-4">
                <span className="font-mono">05_Tax_Bills/</span> (one PDF per
                bill)
              </li>
              <li className="ml-4">
                <span className="font-mono">06_Insurance_Declarations/</span>
              </li>
              <li className="ml-4">
                <span className="font-mono">07_CAP_Bank_[Tenant_ID].xlsx</span>{" "}
                (one per capped tenant)
              </li>
              <li className="ml-4">
                <span className="font-mono">
                  08_GrossUp_Calculation_[YYYY].xlsx
                </span>
              </li>
              <li className="ml-4">
                <span className="font-mono">00_Index.xlsx</span> (master index
                listing all documents and corresponding line items)
              </li>
            </ul>
          </div>
          <p className="text-muted-foreground">
            CapVeri generates the GL extract, pro-rata schedule, gross-up
            calculation, and CAP bank workbook automatically from your exported
            files. The remaining documents (vendor invoices, tax bills,
            insurance declarations) should be stored in a consistent folder
            structure in your document management system.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            {errorPatterns.map((pattern) => (
              <div
                key={pattern.title}
                className="rounded-lg border border-destructive/20 bg-destructive/5 p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive-strong">
                      {pattern.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pattern.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "What records must a landlord produce in a CAM audit?",
                a: "Most commercial leases require: the annual GL extract for the property, vendor invoices for material line items (commonly above $5,000), the management fee calculation, the pro-rata share schedule showing all tenant denominators, property tax and insurance bills, and any CAM cap bank workbook. The specific list depends on the audit clause language in each lease.",
              },
              {
                q: "How long must landlords retain CAM records?",
                a: "Most leases specify retention through the audit window plus an additional 12 months. The audit window is typically 12 months from statement delivery, though some leases allow 18 or 24 months. Practical minimum: retain all CAM-related records for 3 years from the close of the reconciliation period.",
              },
              {
                q: "What is the typical audit window for commercial CAM reconciliation?",
                a: "The most common audit window is 12 months from the date the reconciliation statement is delivered to the tenant. Some retail leases (particularly those with major national tenants) specify 18 or 24 months. After the window closes, the landlord's statement is typically deemed final and binding.",
              },
              {
                q: "How should landlords organize CAM records for audit defense?",
                a: "Organize records by property, then by lease year, with a master index that lists every document and its corresponding line item or calculation step. The audit defense packet should be producible within 5 business days of receiving an audit demand letter. That means organizing before the audit request arrives, not after.",
              },
            ].map((item) => (
              <div key={item.q}>
                <h3 className="mb-2 font-semibold text-foreground">{item.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/what-is-a-cam-audit-landlord",
                title: "What Is a CAM Audit? (Landlord's Guide)",
                desc: "How tenant-initiated CAM audits work, what triggers them, and how to prepare.",
              },
              {
                href: "/resources/audit-defense-packet",
                title: "Building Your Audit Defense Packet",
                desc: "Step-by-step guide to assembling the documentation set before an audit demand arrives.",
              },
              {
                href: "/resources/tenant-cam-audit-landlord-side",
                title: "Responding to a Tenant CAM Audit",
                desc: "How to manage the audit response process from demand letter to resolution.",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How software can help generate audit-ready workbooks automatically.",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <p className="font-medium group-hover:text-primary">
                  {link.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {link.desc}
                </p>
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <Link
              href="/cam-reconciliation-software"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <CheckCircle className="h-4 w-4" />
              CAM Reconciliation Software Guide
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Generate Audit-Ready Workbooks Automatically
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri produces the GL extract, pro-rata schedule, gross-up
            calculation, and CAP bank workbook from your ERP export. Everything
            is ready the day an audit demand arrives.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "audit_rights_recordkeeping_cta",
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
