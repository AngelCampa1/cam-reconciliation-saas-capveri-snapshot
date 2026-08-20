import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Audit Defense Packet: What to Prepare Before the Auditor Arrives",
  description:
    "When a tenant invokes their audit right, the landlord who has their documentation packet ready wins. Here's exactly what goes in a CAM audit defense packet and how to organize it.",
  alternates: {
    canonical: `${SITE_URL}/resources/audit-defense-packet`,
  },
  openGraph: {
    title:
      "CAM Audit Defense Packet: What to Prepare Before the Auditor Arrives",
    description:
      "When a tenant invokes their audit right, the landlord who has their documentation packet ready wins. Here's exactly what goes in a CAM audit defense packet and how to organize it.",
    url: `${SITE_URL}/resources/audit-defense-packet`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a CAM audit defense packet?",
    answer:
      "A CAM audit defense packet is the complete set of documentation a landlord prepares to respond to a tenant's formal CAM audit request. It includes the GL export, vendor invoice index, management fee calculation, pro-rata share schedule, gross-up workbook, cap bank schedule, original tax and insurance documents, and the lease amendment register. Landlords who pre-build this packet respond to audits in 30 minutes. Those who assemble it on demand spend 4-8 hours and introduce version inconsistencies.",
  },
  {
    question: "What do tenant auditors look for first?",
    answer:
      "Experienced tenant auditors start with management fees and capital items. These are the highest-dollar, most consistent errors. They compare the management fee to the lease cap (looking for overcharges), then review the expense detail for items that appear to be capital improvements coded as operating expenses. After those two checks, they examine the pro-rata denominator and the gross-up calculation.",
  },
  {
    question:
      "How long does a landlord have to respond to a tenant audit request?",
    answer:
      "Most commercial leases specify a response period of 30-60 days after the audit request is received. The response period starts the clock on when the landlord must produce documentation. Some leases specify a longer period but require an acknowledgment within 10-15 business days. Review the exact audit provision in each lease. Failing to acknowledge within the acknowledgment period can be treated as a waiver of the documentation obligation.",
  },
  {
    question: "Can a landlord refuse a tenant audit request?",
    answer:
      "If the tenant's lease grants audit rights, the landlord generally cannot refuse to respond without breaching the lease. However, landlords can require that audits be conducted during normal business hours, that auditors sign a confidentiality agreement, that audit costs be borne by the tenant (unless errors exceed a threshold, typically 5%), and that audit requests be made within the lease's stated audit window (typically 1-2 years after the reconciliation statement is delivered).",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Audit Defense Packet",
    url: `${SITE_URL}/resources/audit-defense-packet`,
  },
]);

const documents = [
  {
    id: 1,
    title: "GL Export",
    subtitle: "Full-year, property-level, with account codes",
    detail:
      "The full general ledger export for the property for the entire reconciliation year. Must include: every transaction line with date, vendor/description, account code, and amount. The export should be the final, frozen version used to prepare the reconciliation, not a re-run that could differ due to subsequent adjustments. Include the account code legend so the auditor can map codes to expense categories without requesting a separate document.",
    auditorNote:
      "Auditors use the GL to verify the expense total and to identify any items that do not belong in the recoverable pool.",
  },
  {
    id: 2,
    title: "Vendor Invoice Index",
    subtitle:
      "All material invoices >$5,000 with vendor, date, amount, account",
    detail:
      "A master index listing every vendor invoice above your materiality threshold (typically $5,000), including: vendor name, invoice date, invoice number, amount, and the GL account it was posted to. Organize by expense category and alphabetically within each category. The index should cross-reference to the underlying invoice (stored in the archive) so the auditor can pull originals for any item they want to examine.",
    auditorNote:
      "The invoice index is where auditors look for capital items - HVAC, roofing, and parking lot work coded as operating expense. A well-organized index shows them you already reviewed it.",
  },
  {
    id: 3,
    title: "Management Fee Calculation",
    subtitle: "Base, rate, and result - step by step",
    detail:
      "A standalone document showing: (1) the management fee rate per the lease, (2) the expense base on which the fee is calculated, (3) the calculation result, (4) any per-lease management fee cap, and (5) confirmation that the calculated fee does not exceed the cap. If different tenants have different management fee caps, produce a separate calculation for each or a comparison table showing all tenants.",
    auditorNote:
      "Management fee overcharges are the most commonly disputed item in CAM audits. Producing a pre-built management fee workbook signals that you already verified compliance - and makes the auditor's job easier, which shortens the audit.",
  },
  {
    id: 4,
    title: "Pro-Rata Share Schedule",
    subtitle: "All tenants, their RSF, the denominator, and their percentage",
    detail:
      "A table showing every tenant in the building with: their rentable square footage (RSF), the denominator used in their pro-rata calculation, their resulting pro-rata share percentage, and the source of the denominator (lease section reference). Include a note explaining any unusual denominator features - anchor exclusions, vacant space exclusions, or lease-specified fixed denominators.",
    auditorNote:
      "The auditing tenant is verifying their own share - and implicitly verifying that other tenants are not being undercharged at their expense. A clear, documented pro-rata schedule ends this inquiry quickly.",
  },
  {
    id: 5,
    title: "Gross-Up Calculation Workbook",
    subtitle:
      "Occupancy, threshold, variable pool, and normalized amount (if applicable)",
    detail:
      "If gross-up was applied: the workbook showing (1) actual occupancy during the year, (2) the gross-up threshold per the lease, (3) the split of expenses into variable and fixed categories, (4) the gross-up factor applied to variable expenses, and (5) the normalized expense pool after gross-up. If gross-up was not applicable because occupancy was above the threshold, include a one-page memo stating the actual occupancy percentage and the threshold.",
    auditorNote:
      "Gross-up calculations are complex and frequently challenged. If you did not gross up, document why. If you did, show every step.",
  },
  {
    id: 6,
    title: "CAM Cap Bank Schedule",
    subtitle:
      "Base year, annual cap, and remaining capacity (if cumulative cap applies)",
    detail:
      "For tenants with cumulative CAM caps: a year-by-year table showing the base year amount, the annual cap amount (base × (1 + annual increase %)), the actual CAM obligation for each year, the difference (capped vs. uncapped), and the cumulative unused cap bank balance carried forward into each year. This document must reconcile to the prior-year reconciliation file - the bank balance cannot differ.",
    auditorNote:
      "Cumulative cap bank errors are the single most valuable audit finding for tenant auditors - they compound year over year and can represent 5–15% of total CAM obligations. Pre-building this schedule and reconciling it annually is essential.",
  },
  {
    id: 7,
    title: "Property Tax and Insurance Source Documents",
    subtitle: "Actual tax bills and insurance policies or certificates",
    detail:
      "The original property tax assessment and payment confirmations for the reconciliation year, and the insurance policy declarations page (or certificate of insurance) showing the annual premium. These source documents verify that the amounts in the GL match what was actually assessed and billed - not just what was accrued. For properties with multiple tax parcels, include each parcel's bill.",
    auditorNote:
      "Property tax and insurance are typically the largest line items in the CAM pool. Auditors verify them against source documents first - having originals ready eliminates a common document request.",
  },
  {
    id: 8,
    title: "Lease Amendment Register",
    subtitle: "All amendments affecting CAM terms with dates",
    detail:
      "A chronological list of all lease amendments for the auditing tenant, including: amendment date, the sections amended, and the impact on CAM calculations (change to exclusions, cap structure, management fee rate, pro-rata definition, or audit rights). The register should reference the specific amendment document filed in the lease archive. If there have been no amendments, include a one-line confirmation stating the original lease is unmodified.",
    auditorNote:
      "Tenant auditors check amendments to find provisions the landlord may have applied incorrectly or missed entirely. A complete amendment register shows you already reviewed them.",
  },
];

export default function AuditDefensePacketPage() {
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
          <span className="text-foreground">CAM Audit Defense Packet</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Audit Defense Packet: What to Prepare Before the Auditor Arrives
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            When a tenant invokes their audit right, the landlord who has their
            documentation packet ready wins. Here&apos;s exactly what goes in a
            CAM audit defense packet, how to organize it, and why pre-building
            it annually is worth the 2 hours it takes.
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
            Pre-Built vs. On-Demand Assembly
          </h2>
          <p className="text-muted-foreground">
            A CAM audit defense packet is the complete documentation set a
            landlord needs to respond to a tenant audit request. It takes 4–8
            hours to assemble if you haven&apos;t pre-built it - and 30 minutes
            if you have. The landlord who responds within a week of the audit
            request, with a complete and organized packet, signals that the
            reconciliation was done correctly. The landlord who takes 45 days to
            produce piecemeal documents signals the opposite.
          </p>
        </div>

        {/* Time comparison */}
        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-destructive" />
              <p className="font-semibold text-destructive-strong">
                On-Demand Assembly
              </p>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>4–8 hours per audit request</li>
              <li>Version control risk (GL re-exports may differ)</li>
              <li>
                Documents scattered across email, shared drives, accounting
                systems
              </li>
              <li>Slow response signals weak position to auditor</li>
            </ul>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-green-600" />
              <p className="font-semibold text-green-700">Pre-Built Packet</p>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>~30 minutes to respond to an audit request</li>
              <li>Frozen documents consistent with issued statements</li>
              <li>Organized, indexed, and ready to share</li>
              <li>Signals thorough, defensible reconciliation</li>
            </ul>
          </div>
        </div>

        {/* Downloadable resource note */}
        <div className="mb-10 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <p className="text-sm text-muted-foreground">
            This page pairs with the downloadable{""}
            <Link
              href="/tools/audit-defense-packet-builder"
              className="text-foreground underline hover:no-underline"
            >
              Audit Defense Packet Builder PDF
            </Link>
            {""}, a fill-in template for organizing and indexing your packet
            documents for each reconciliation year.
          </p>
        </div>

        {/* The 8 documents */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 8 Required Documents
          </h2>
          <p className="mb-6 text-muted-foreground">
            A complete audit defense packet contains these 8 documents. Each is
            described in detail below - what to include, how to organize it, and
            what the auditor will use it to verify.
          </p>
          <div className="space-y-6">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-lg border p-6">
                <div className="mb-1 flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {doc.id}
                  </span>
                  <div>
                    <h3 className="font-semibold text-lg">{doc.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {doc.subtitle}
                    </p>
                  </div>
                </div>
                <p className="mt-3 ml-10 text-sm text-muted-foreground">
                  {doc.detail}
                </p>
                <div className="mt-3 ml-10 flex items-start gap-2 rounded-md bg-muted/40 p-3">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Auditor&apos;s perspective:{""}
                    </span>
                    {doc.auditorNote}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Folder structure */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How to Organize the Packet
          </h2>
          <p className="mb-4 text-muted-foreground">
            Organize the audit defense packet as a single folder (physical or
            digital) with a numbered index page. The index should match the
            document numbering above so the auditor can find any document
            instantly.
          </p>
          <div className="rounded-lg border bg-muted/20 p-5 font-mono text-sm">
            <p className="mb-2 font-sans font-semibold">
              Recommended folder structure:
            </p>
            <div className="space-y-1 text-muted-foreground">
              <p>📁 CAM Audit Defense - [Property Name] - [Year]</p>
              <p className="ml-4">📄 00 - Index.pdf</p>
              <p className="ml-4">📄 01 - GL Export.xlsx</p>
              <p className="ml-4">📄 02 - Vendor Invoice Index.xlsx</p>
              <p className="ml-4">📄 03 - Management Fee Calculation.xlsx</p>
              <p className="ml-4">📄 04 - Pro-Rata Share Schedule.xlsx</p>
              <p className="ml-4">📄 05 - Gross-Up Workbook.xlsx</p>
              <p className="ml-4">📄 06 - CAM Cap Bank Schedule.xlsx</p>
              <p className="ml-4">📁 07 - Tax and Insurance</p>
              <p className="ml-8">📄 07a - Property Tax Bill.pdf</p>
              <p className="ml-8">📄 07b - Insurance Declaration.pdf</p>
              <p className="ml-4">📄 08 - Lease Amendment Register.pdf</p>
              <p className="ml-4">📁 09 - Underlying Invoices</p>
              <p className="ml-8 text-xs">
                (organized by vendor, for on-request production)
              </p>
            </div>
          </div>
        </section>

        {/* What auditors look for first */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What Auditors Look For First
          </h2>
          <p className="mb-4 text-muted-foreground">
            Experienced tenant auditors follow a consistent review sequence.
            Knowing the sequence helps landlords anticipate questions and
            organize documentation accordingly.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    Review order
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    What auditors check
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Packet document
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  {
                    order: "1st",
                    check: "Management fee vs. lease cap",
                    doc: "Doc 3 - Management Fee Calculation",
                  },
                  {
                    order: "2nd",
                    check: "Capital items coded as operating expense",
                    doc: "Doc 2 - Vendor Invoice Index",
                  },
                  {
                    order: "3rd",
                    check: "Pro-rata denominator vs. lease definition",
                    doc: "Doc 4 - Pro-Rata Share Schedule",
                  },
                  {
                    order: "4th",
                    check: "Gross-up calculation accuracy",
                    doc: "Doc 5 - Gross-Up Workbook",
                  },
                  {
                    order: "5th",
                    check: "CAM cap bank balance accuracy",
                    doc: "Doc 6 - CAM Cap Bank Schedule",
                  },
                  {
                    order: "6th",
                    check: "Lease-specific exclusions applied",
                    doc: "Doc 8 - Lease Amendment Register",
                  },
                ].map((row) => (
                  <tr key={row.order}>
                    <td className="px-4 py-3 font-medium">{row.order}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.check}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.doc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                    Re-exporting the GL after a subsequent adjustment
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If you re-run the GL export for audit purposes months after
                    the reconciliation was completed, subsequent journal entries
                    (accrual reversals, reclassifications, period corrections)
                    will appear in the new export and differ from the export
                    used to prepare the reconciliation. The auditor will notice
                    the discrepancy and use it to question the entire
                    reconciliation. Always use the frozen GL export from
                    reconciliation time.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Cap bank schedule that does not reconcile to prior-year file
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the cumulative cap bank schedule you provide shows a
                    different opening balance than the closing balance in the
                    prior-year reconciliation file, the auditor will demand an
                    explanation. In most cases this means the prior year&apos;s
                    calculation was wrong - which opens up every prior year to
                    re-examination. Reconcile the cap bank schedule backward to
                    the original base year before the audit starts.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Missing invoices for material expense items
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the vendor invoice index references invoices that cannot
                    be produced - because they were not filed, were lost in a
                    system migration, or the vendor no longer exists - the
                    auditor will treat those line items as unsubstantiated. In
                    jurisdictions that follow strict documentation standards,
                    unsubstantiated expenses may be disallowed, creating a
                    credit obligation for the landlord.
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
                What is a CAM audit defense packet?
              </h3>
              <p className="text-muted-foreground">
                The complete documentation set a landlord prepares to respond to
                a tenant audit request. It includes the GL export, vendor
                invoice index, management fee calculation, pro-rata schedule,
                gross-up workbook, cap bank schedule, tax and insurance source
                documents, and lease amendment register.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What do tenant auditors look for first?
              </h3>
              <p className="text-muted-foreground">
                Management fees and capital items. These are the highest-dollar,
                most consistent errors. After those, auditors examine the
                pro-rata denominator and the gross-up calculation. A landlord
                who can immediately produce clean documentation for all four
                typically ends the audit within the first day of review.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How long does a landlord have to respond to a tenant audit
                request?
              </h3>
              <p className="text-muted-foreground">
                Most commercial leases specify 30-60 days to produce
                documentation. Some leases require an acknowledgment within
                10-15 business days. Review the exact audit provision in each
                lease. Failing to acknowledge within the acknowledgment period
                can be treated as a waiver.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can a landlord refuse a tenant audit request?
              </h3>
              <p className="text-muted-foreground">
                Not if the lease grants audit rights. However, landlords can
                require audits during normal business hours, auditor
                confidentiality agreements, tenant-borne audit costs (unless
                errors exceed 5%), and timely requests within the lease&apos;s
                audit window (typically 1–2 years after statement delivery).
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/landlord-audit-rights-cam-recordkeeping"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                Landlord Audit Rights and CAM Recordkeeping
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                What landlords must retain and for how long to respond to audit
                requests.
              </p>
            </Link>
            <Link
              href="/resources/tenant-cam-audit-landlord-side"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Audit: The Landlord&apos;s Side
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to manage a tenant-initiated CAM audit from start to finish.
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
              href="/resources/what-is-a-cam-audit-landlord"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                What Is a CAM Audit? (Landlord Guide)
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                An overview of the CAM audit process from the landlord&apos;s
                perspective.
              </p>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Reconcile Once. Get the Whole Packet.
          </h2>
          <p className="mb-6 text-background/80">
            Run your reconciliation in CapVeri. It builds all 8 audit defense
            documents for you. That includes the GL export, management fee
            workbook, pro-rata schedule, gross-up calculation, and cap bank
            schedule. They are organized and ready to share in 30 minutes.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "audit_defense_packet_cta" })}>
              Start free trial{" "}
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
