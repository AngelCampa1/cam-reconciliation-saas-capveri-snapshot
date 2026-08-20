import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Scale,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "SB 1103 CAM Disclosure Guide for California Commercial Landlords",
  description:
    "California SB 1103 (effective January 1, 2025) imposes new CAM disclosure requirements on commercial leases with qualified tenants. Here's what landlords must disclose, when, and how.",
  alternates: {
    canonical: `${SITE_URL}/resources/california-sb-1103-cam-guide`,
  },
  openGraph: {
    title: "SB 1103 CAM Disclosure Guide for California Commercial Landlords",
    description:
      "California SB 1103 (effective January 1, 2025) imposes new CAM disclosure requirements on commercial leases with qualified tenants. Here's what landlords must disclose, when, and how.",
    url: `${SITE_URL}/resources/california-sb-1103-cam-guide`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Does SB 1103 apply to all California commercial tenants?",
    answer:
      "No. SB 1103 applies only to 'qualified commercial tenants', a specific category defined by THREE conditions that must ALL be met: (1) the tenant's annual gross receipts are $250 million or less, (2) the tenant leases 10,000 SF or less of commercial space, AND (3) the building is 100,000 SF or less in total. A large national retailer with $300M in revenues, a 12,000 SF tenant, or any tenant in a building over 100,000 SF does not qualify. All three conditions must be satisfied.",
  },
  {
    question: "What must California landlords disclose under SB 1103?",
    answer:
      "For qualified commercial tenants, landlords must provide: (1) an itemized list of all CAM charges, (2) the basis for each charge including the formula and pro-rata share calculation, (3) any increases from the prior period, and (4) contact information for questions. The initial disclosure is due within 90 days of lease commencement; annual disclosures are due within 90 days of the end of each reconciliation period.",
  },
  {
    question: "What are the penalties for non-compliance with SB 1103?",
    answer:
      "For willful violations affecting qualified commercial tenants (those meeting ALL THREE criteria: (1) annual gross receipts of $250M or less, (2) leasing 10,000 SF or less, AND (3) in a building of 100,000 SF or less), penalties include actual damages plus treble (3x) damages. Penalties apply only to qualified commercial tenants as defined; non-qualified tenants are not covered by SB 1103's damage provisions.",
  },
  {
    question:
      "Does SB 1103 override the lease? Can tenants use it to renegotiate CAM terms?",
    answer:
      "No. SB 1103 adds a disclosure floor. It requires landlords to provide itemized CAM information but does not override the lease terms governing what expenses are recoverable, how pro-rata shares are calculated, or the amount tenants owe. Tenants cannot use SB 1103 to challenge the substantive CAM charges, only to obtain the disclosure they are entitled to under the statute.",
  },
  {
    question:
      "If a tenant's revenues drop below $250M mid-lease, do they become a qualified tenant?",
    answer:
      "The statute measures annual gross receipts, but it does not specify the timing for re-evaluation. The most conservative interpretation is to re-evaluate tenant qualification annually at the start of each reconciliation period. Consult qualified California real estate counsel for guidance on mid-lease changes in tenant revenue or size.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "SB 1103 CAM Disclosure Guide",
    url: `${SITE_URL}/resources/california-sb-1103-cam-guide`,
  },
]);

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "SB 1103 CAM Disclosure Guide for California Commercial Landlords",
  description:
    "California SB 1103 qualified tenant definition, disclosure requirements, timing, and compliance checklist for California commercial landlords.",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
  dateModified: "2026-04-01",
  url: `${SITE_URL}/resources/california-sb-1103-cam-guide`,
};

export default function CaliforniaSb1103CamGuidePage() {
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
          <span className="text-foreground">SB 1103 CAM Disclosure Guide</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            SB 1103 CAM Disclosure Guide for California Commercial Landlords
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            California SB 1103 (Cal. Civil Code §827.1), effective January 1,
            2025, imposes itemized CAM disclosure obligations on commercial
            landlords with qualified commercial tenants. This guide explains
            exactly who qualifies, what must be disclosed, when, and the penalty
            structure for non-compliance.
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

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              <span className="font-medium">Legal note:</span> This guide is for
              informational purposes only and does not constitute legal advice.
              SB 1103 compliance involves fact-specific determinations; consult
              qualified California real estate counsel for guidance on your
              specific lease portfolio.
            </p>
          </div>
        </div>

        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            SB 1103 (Cal. Civil Code §827.1) requires California commercial
            landlords to provide itemized CAM disclosures to{""}
            <strong>qualified commercial tenants</strong> - those meeting ALL
            THREE conditions: (1) annual gross receipts of $250 million or less,
            (2) leasing 10,000 SF or less, AND (3) in a building of 100,000 SF
            or less. Initial disclosure is due within 90 days of lease
            commencement; annual disclosure within 90 days of the reconciliation
            period end.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Who Is a "Qualified Commercial Tenant"?
          </h2>
          <p className="mb-4 text-muted-foreground">
            The SB 1103 disclosure obligations and the treble damages penalty
            provision apply only to qualified commercial tenants. ALL THREE of
            the following conditions must be met simultaneously:
          </p>

          <div className="mb-6 rounded-xl border-2 border-primary/30 bg-primary/5 p-6">
            <p className="mb-4 font-semibold text-primary">
              All Three Conditions Must Be Met
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  1
                </div>
                <div>
                  <p className="font-medium">
                    Annual gross receipts ≤ $250 million
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The tenant&apos;s total annual gross receipts from all
                    sources must be $250 million or less. A national retailer,
                    franchisee of a large chain, or subsidiary of a larger
                    corporation may exceed this threshold.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  2
                </div>
                <div>
                  <p className="font-medium">
                    Leases ≤ 10,000 SF of commercial space
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The tenant&apos;s leased space must be 10,000 SF or less. A
                    12,000 SF tenant in a small building does not qualify
                    regardless of revenues or building size.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  3
                </div>
                <div>
                  <p className="font-medium">Building is ≤ 100,000 SF total</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The building in which the tenant leases space must be
                    100,000 SF or less in total. A small tenant in a large
                    office tower or regional mall does not qualify.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 pr-4 text-left font-medium">Scenario</th>
                  <th className="pb-2 pr-4 text-left font-medium">Revenues</th>
                  <th className="pb-2 pr-4 text-left font-medium">Tenant SF</th>
                  <th className="pb-2 pr-4 text-left font-medium">
                    Building SF
                  </th>
                  <th className="pb-2 text-left font-medium">Qualified?</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  ["Small coffee shop", "$1M", "1,500 SF", "40,000 SF", "YES"],
                  ["Regional law firm", "$80M", "8,000 SF", "75,000 SF", "YES"],
                  [
                    "National retailer",
                    "$500M",
                    "8,000 SF",
                    "50,000 SF",
                    "NO - revenues exceed $250M",
                  ],
                  [
                    "Small tenant, large building",
                    "$5M",
                    "3,000 SF",
                    "250,000 SF",
                    "NO - building exceeds 100,000 SF",
                  ],
                  [
                    "Mid-size tenant, small building",
                    "$50M",
                    "15,000 SF",
                    "60,000 SF",
                    "NO - tenant SF exceeds 10,000",
                  ],
                ].map(
                  ([scenario, revenues, tenantSf, buildingSf, qualified]) => (
                    <tr key={scenario} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{scenario}</td>
                      <td className="py-2 pr-4">{revenues}</td>
                      <td className="py-2 pr-4">{tenantSf}</td>
                      <td className="py-2 pr-4">{buildingSf}</td>
                      <td
                        className={`py-2 font-medium ${
                          qualified === "YES"
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {qualified}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What SB 1103 Requires Landlords to Disclose
          </h2>
          <p className="mb-4 text-muted-foreground">
            For each qualified commercial tenant, landlords must provide an
            itemized CAM disclosure that includes:
          </p>

          <ul className="mb-4 space-y-3 text-muted-foreground">
            <li className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <div>
                <span className="font-medium text-foreground">
                  Itemized list of all CAM charges
                </span>
                {""}: each operating expense category with the actual amount for
                the reconciliation period
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <div>
                <span className="font-medium text-foreground">
                  Basis for each charge
                </span>
                {""}: the formula used, the pro-rata share percentage, the
                denominator (total building RSF), and the numerator (tenant RSF)
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <div>
                <span className="font-medium text-foreground">
                  Year-over-year comparison
                </span>
                {""}: any increases from the prior reconciliation period with
                the amount of the increase for each line item
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <div>
                <span className="font-medium text-foreground">
                  Contact information
                </span>
                {""}: a designated contact (name, phone, email) for questions
                about the disclosure
              </div>
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Timing Requirements</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-semibold">Initial Disclosure</p>
              <p className="text-sm text-muted-foreground">
                Due within <strong>90 days</strong> of lease commencement for
                any qualified commercial tenant. This means the first CAM
                disclosure must be delivered even before the first annual
                reconciliation period ends.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-semibold">Annual Disclosure</p>
              <p className="text-sm text-muted-foreground">
                Due within <strong>90 days</strong> after the end of each
                reconciliation period. For most calendar-year reconciliations,
                this means the annual CAM statement must be delivered by March
                31.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Penalty Structure: Treble Damages Apply Only to Qualified Tenants
          </h2>
          <p className="mb-4 text-muted-foreground">
            SB 1103 imposes significant penalties for willful non-compliance.
            The treble damages provision applies exclusively to qualified
            commercial tenants meeting ALL THREE conditions (revenues ≤ $250M,
            space ≤ 10,000 SF, building ≤ 100,000 SF). Willful violations of the
            disclosure obligation can result in:
          </p>
          <ul className="mb-4 space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                Actual damages:
              </span>
              {""}
              The financial harm the tenant suffered from the non-disclosure
              (e.g., costs of a self-funded audit to obtain the information)
            </li>
            <li>
              <span className="font-medium text-foreground">
                Treble damages:
              </span>
              {""}
              Three times actual damages, available only against willful
              violations affecting qualified commercial tenants as defined above
            </li>
          </ul>
          <p className="text-muted-foreground">
            Non-willful failures (administrative oversight, missed deadlines)
            may not trigger treble damages, but the statute is recent and courts
            have not yet interpreted the willfulness standard extensively. The
            conservative approach is to treat all disclosure deadlines as
            mandatory for any tenant who might meet the qualified tenant
            criteria.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            SB 1103 Compliance Checklist for California Landlords
          </h2>
          <div className="space-y-3">
            {[
              "Identify all tenants in buildings ≤ 100,000 SF in California",
              "For each such tenant, confirm whether leased SF is ≤ 10,000 SF",
              "For tenants meeting conditions 1 and 2, verify annual gross receipts are ≤ $250M (obtain tenant certification if needed)",
              "Flag all qualified commercial tenants in lease management system",
              "Set a 90-day clock from lease commencement for initial CAM disclosure",
              "Set an annual 90-day deadline from reconciliation period end for each qualified tenant",
              "Prepare itemized CAM disclosure template with pro-rata formula, prior year comparison, and contact information fields",
              "Maintain records of each disclosure delivered (date, method, recipient) for at least the audit rights window",
            ].map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3"
              >
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p className="text-sm text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How SB 1103 Interacts with Existing Lease Terms
          </h2>
          <p className="mb-4 text-muted-foreground">
            SB 1103 adds a statutory disclosure floor. It requires landlords to
            provide certain information regardless of what the lease says.
            However, SB 1103 does not override lease terms governing what
            expenses are recoverable, how pro-rata shares are calculated, or the
            total amount tenants owe.
          </p>
          <p className="text-muted-foreground">
            A tenant cannot use SB 1103 to challenge the amount of CAM charges,
            only to obtain the disclosure they are entitled to. If the lease
            says management fees up to 5% are recoverable and the landlord
            charges 4.5%, SB 1103 does not give the tenant grounds to dispute
            that charge. It gives the tenant the right to receive an itemized
            statement showing the 4.5% management fee, its calculation basis,
            and any year-over-year change.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying SB 1103 obligations to all tenants without
                    verifying qualification
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Over-complying by applying SB 1103 disclosures to all
                    tenants is administratively burdensome but not harmful.
                    However, the reverse error - assuming that most tenants
                    don&apos;t qualify when many do - creates real exposure.
                    Systematically verify all three qualification criteria for
                    every tenant in buildings at or below 100,000 SF.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Missing the 90-day disclosure window
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    For a calendar-year reconciliation, the 90-day window closes
                    March 31. Landlords who send reconciliation statements in
                    April or later - common in larger portfolios - may be
                    violating SB 1103 for qualified tenants even if the
                    reconciliation is otherwise accurate.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Providing a summary rather than itemized disclosure
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sending a reconciliation letter that shows"Total CAM:
                    $45,000" without itemizing each expense category and its
                    basis does not satisfy SB 1103. The statute requires
                    itemization - individual line items with the formula for
                    each. A summary total is insufficient.
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
                Does SB 1103 apply to all California commercial tenants?
              </h3>
              <p className="text-muted-foreground">
                No. SB 1103 applies only to qualified commercial tenants - those
                meeting ALL THREE conditions: (1) annual gross receipts of $250
                million or less, (2) leasing 10,000 SF or less, AND (3) in a
                building of 100,000 SF or less. All three conditions must be
                satisfied simultaneously.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What must California landlords disclose under SB 1103?
              </h3>
              <p className="text-muted-foreground">
                An itemized list of all CAM charges, the basis (formula and
                pro-rata calculation) for each charge, any year-over-year
                increases, and a contact for questions. The disclosure must be
                itemized - a summary total does not comply.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What are the penalties for SB 1103 non-compliance?
              </h3>
              <p className="text-muted-foreground">
                Willful violations affecting qualified commercial tenants -
                those meeting ALL THREE conditions (revenues ≤ $250M, space ≤
                10,000 SF, building ≤ 100,000 SF) - can result in actual damages
                plus treble (3x) damages. The treble damages provision applies
                only to qualified tenants as defined.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Does SB 1103 override lease terms on what expenses are
                recoverable?
              </h3>
              <p className="text-muted-foreground">
                No. SB 1103 adds a disclosure floor but does not change what
                expenses are recoverable or the amount tenants owe under the
                lease. Tenants cannot use SB 1103 to challenge the substantive
                CAM charges - only to obtain the itemized disclosure.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the deadline for annual SB 1103 CAM disclosures?
              </h3>
              <p className="text-muted-foreground">
                Within 90 days after the end of each reconciliation period. For
                calendar-year reconciliations, this means by March 31 of the
                following year.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-overbilling-landlord-liability"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Overbilling Landlord Liability</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When CAM errors create legal liability and how to mitigate
                exposure.
              </p>
            </Link>
            <Link
              href="/resources/commercial-tenant-cam-disclosure-by-state"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Disclosure by State</p>
              <p className="mt-1 text-sm text-muted-foreground">
                50-state guide to commercial CAM disclosure obligations and
                market standards.
              </p>
            </Link>
            <Link
              href="/resources/states/california/cam-compliance"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">California CAM Compliance</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete overview of California commercial lease CAM
                requirements.
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Reconciliation Software</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Automate SB 1103 disclosure tracking and itemized CAM statement
                generation with CapVeri.
              </p>
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Meet the SB 1103 90-Day Deadline for Every Qualified Tenant
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri generates itemized CAM disclosure statements with formula
            documentation and year-over-year comparisons - meeting SB 1103
            requirements automatically for every qualified commercial tenant in
            your California portfolio.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "sb_1103_cam_guide_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
