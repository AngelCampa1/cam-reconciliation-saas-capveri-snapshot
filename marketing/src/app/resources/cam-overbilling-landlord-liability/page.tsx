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
  title: "CAM Overbilling and Landlord Liability: What the Lease Says",
  description:
    "What happens when a CAM reconciliation overstates tenant charges? Covers landlord liability, cure periods, interest on credits, and the California SB 1103 qualified commercial tenant rules.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-overbilling-landlord-liability`,
  },
  openGraph: {
    title: "CAM Overbilling and Landlord Liability: What the Lease Says",
    description:
      "What happens when a CAM reconciliation overstates tenant charges? Covers landlord liability, cure periods, interest on credits, and the California SB 1103 qualified commercial tenant rules.",
    url: `${SITE_URL}/resources/cam-overbilling-landlord-liability`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is CAM overbilling?",
    answer:
      "CAM overbilling occurs when a landlord's reconciliation statement charges a tenant more than their actual pro-rata share of recoverable operating expenses under the lease. Common causes include GL misclassification (including non-recoverable capital items in the expense pool), using the wrong denominator for pro-rata calculations, applying gross-up to fixed expenses, and billing for items explicitly excluded under the tenant's lease addendum.",
  },
  {
    question: "What are a tenant's remedies when overbilled for CAM?",
    answer:
      "When a tenant discovers overbilling, their typical lease remedies include: a credit applied to future CAM payments or a direct refund of the overpaid amount; interest on the overbilled amount from the date of overbilling (often at prime rate + 1-2% per lease terms); and recovery of audit costs if the overcharge exceeds the lease's fee-shifting threshold (commonly 3-5% of total CAM billed). Landlords must comply within the cure period specified in the lease, typically 30-60 days.",
  },
  {
    question:
      "Does California SB 1103 create treble damage liability for CAM overbilling?",
    answer:
      "California SB 1103 (effective January 1, 2025) created enhanced protections for qualified commercial tenants - defined as tenants with gross receipts of $250 million or less, leasing 10,000 square feet or less, in buildings of 100,000 square feet or less. For these specifically-defined tenants, landlords who fail to comply with SB 1103's disclosure and reconciliation requirements may face enhanced remedies. The treble damages provision is limited to qualified commercial tenants meeting all three size thresholds - it does not apply to large tenants, large spaces, or large buildings.",
  },
  {
    question:
      "How should a landlord handle overbilling discovered after statements are sent?",
    answer:
      "When a landlord discovers an overbilling error before the tenant's auditor finds it, the best practice is to issue a corrected reconciliation statement promptly, apply a credit to the tenant's account (or issue a refund), and document the correction with the original and corrected calculations. Proactive disclosure before audit invocation typically prevents fee-shifting, reduces interest exposure, and preserves the landlord-tenant relationship.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Overbilling and Landlord Liability",
    url: `${SITE_URL}/resources/cam-overbilling-landlord-liability`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "CAM Overbilling and Landlord Liability: What the Lease Says",
  description:
    "What happens when a CAM reconciliation overstates tenant charges? Covers landlord liability, cure periods, interest on credits, and the California SB 1103 qualified commercial tenant rules.",
  url: `${SITE_URL}/resources/cam-overbilling-landlord-liability`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1400,
});

export default function CamOverbillingLandlordLiabilityPage() {
  return (
    <>
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
            CAM Overbilling and Landlord Liability
          </span>
        </nav>

        {/* Header */}
        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Overbilling and Landlord Liability: What the Lease Says
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            CAM overbilling creates real financial liability: credits with
            interest, audit cost shifting, and in California, enhanced remedies
            for qualified commercial tenants under SB 1103.
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

        {/* Featured snippet */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">
            Quick Answer: What Is CAM Overbilling?
          </h2>
          <p className="text-muted-foreground">
            CAM overbilling occurs when a landlord&apos;s reconciliation
            statement charges a tenant more than their actual pro-rata share of
            recoverable expenses under the lease. Common causes: including
            capital items in the operating expense pool, using the wrong
            pro-rata denominator, applying gross-up to fixed expenses, and
            billing for items excluded in the tenant&apos;s lease addendum. When
            When overbilling is discovered (by the tenant&apos;s auditor or the
            landlord&apos;s own review), the lease specifies the remedies and
            timeline.
          </p>
        </div>

        {/* Common Causes */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Common Causes of CAM Overbilling
          </h2>
          <p className="mb-4 text-muted-foreground">
            Most CAM overbilling is not intentional. It results from process
            errors that compound across multiple tenants and multiple years.
            Understanding the root causes is the first step to prevention.
          </p>
          <div className="space-y-4">
            {[
              {
                title:
                  "GL Misclassification: Capital Items Coded as Operating Expenses",
                body: "When a chiller replacement ($85,000), roof resurfacing ($120,000), or parking lot reconstruction ($200,000) flows through the GL as &quot;repairs and maintenance&quot; instead of a capital account, the entire amount enters the recoverable expense pool. At a 10% pro-rata share, the tenant is overbilled $8,500, $12,000, or $20,000 respectively per year, compounding if the error persists across reconciliation cycles.",
              },
              {
                title: "Wrong Pro-Rata Denominator",
                body: "A tenant whose lease defines the denominator as total leasable area (TLA) at 95,000 SF has a materially different pro-rata share than if the landlord uses total rentable area (TRA) at 115,000 SF for the same building. Using TRA when the lease requires TLA increases the tenant&apos;s denominator, lowers their pro-rata %, and underbills. Using TLA when TRA is required does the opposite. In either case, one or more tenants in the building is being billed incorrectly.",
              },
              {
                title: "Management Fee Calculation Errors",
                body: "Property management fees are typically capped in leases at 3–5% of gross revenues, with &quot;gross revenues&quot; defined specifically. When management companies calculate fees on a base that includes tenant reimbursements (CAM, tax, insurance pass-throughs), the fee basis is inflated beyond what the lease permits. On a building collecting $2M/year in base rent plus $800,000 in pass-throughs, applying a 4% fee to the full $2.8M instead of just base rent overbills the management fee by $32,000/year across all tenants.",
              },
              {
                title: "Lease-Specific Exclusion Violations",
                body: "Negotiated lease addenda frequently carve out specific expenses that would otherwise be recoverable. Earthquake insurance for a California property, signage maintenance for a specific tenant&apos;s monument sign, or above-market management fee caps negotiated at lease execution: these exclusions are often tracked in the lease but not reflected in the property management software&apos;s billing setup. When the system runs reconciliation without tenant-specific exclusion filters, every tenant gets billed under the same template.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border p-4">
                <h3 className="mb-1 font-semibold text-foreground">
                  {item.title}
                </h3>
                <p
                  className="text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: item.body }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Tenant Remedies */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Tenant Remedies Under the Lease
          </h2>
          <p className="mb-4 text-muted-foreground">
            Commercial leases typically specify the following remedies when a
            tenant establishes that they have been overbilled:
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Remedy
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Typical Lease Terms
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Landlord Obligation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  [
                    "Credit or Refund",
                    "Applied to next CAM payment(s) or direct refund if tenant has paid in full",
                    "Issue credit memo or wire refund within 30–60 days of validated finding",
                  ],
                  [
                    "Interest on Overbilled Amount",
                    "Prime rate + 1–2% per year from date of overpayment; some leases specify a flat rate",
                    "Calculate interest from the date of each monthly payment through the credit date",
                  ],
                  [
                    "Audit Cost Reimbursement",
                    "If overcharge exceeds 3–5% of total annual CAM billed, landlord pays tenant's audit fees",
                    "Pay auditor invoice; triggering threshold varies by lease. Confirm before assuming.",
                  ],
                  [
                    "Corrected Reconciliation",
                    "Landlord must issue an amended statement reflecting the corrected figures",
                    "Restate the reconciliation with corrected line items and re-run the calculation",
                  ],
                ].map(([remedy, terms, obligation]) => (
                  <tr key={remedy} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground align-top">
                      {remedy}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {terms}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {obligation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* California SB 1103 */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            California SB 1103: Enhanced Protections for Qualified Commercial
            Tenants
          </h2>
          <p className="mb-4 text-muted-foreground">
            California SB 1103, effective January 1, 2025, created enhanced
            protections for a specific category of commercial tenant: the{""}
            <strong>&quot;qualified commercial tenant.&quot;</strong> Landlords
            with California properties must understand this definition
            precisely. The enhanced remedies apply only to tenants who meet{""}
            <em>all three</em> of the following criteria:
          </p>
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-50/50 p-4">
            <h3 className="mb-3 font-semibold text-foreground">
              SB 1103 Qualified Commercial Tenant Definition
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <strong className="text-foreground">Gross receipts:</strong>
                  {""}
                  The tenant has annual gross receipts of{""}
                  <strong>$250 million or less</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <strong className="text-foreground">Leased space:</strong> The
                  tenant leases <strong>10,000 square feet or less</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <strong className="text-foreground">Building size:</strong>
                  {""}
                  The leased space is in a building of{""}
                  <strong>100,000 square feet or less</strong>
                </span>
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              A national retailer leasing 8,000 SF with $500M in annual gross
              receipts is <strong>not</strong> a qualified commercial tenant. A
              50,000 SF office building&apos;s small tenant may or may not
              qualify depending on their gross receipts. The burden is on the
              landlord to determine qualification status for California
              properties.
            </p>
          </div>
          <p className="mb-4 text-muted-foreground">
            SB 1103 requires landlords to provide qualified commercial tenants
            with enhanced CAM disclosures and reconciliation statement detail.
            Landlords who fail to comply with the statute&apos;s requirements -
            or who are found to have overbilled a qualified commercial tenant -
            face statutory remedies beyond what the lease provides. Consult
            California real estate counsel for the current interpretation of SB
            1103 remedies as case law develops.
          </p>
          <p className="text-muted-foreground">
            For most California landlords with mid-to-large tenants (over 10,000
            SF) or tenants in larger buildings (over 100,000 SF), SB 1103 does
            not apply - but standard lease remedies for overbilling still do.
          </p>
        </section>

        {/* Self-Audit as Prevention */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Self-Audit as Overbilling Prevention
          </h2>
          <p className="mb-4 text-muted-foreground">
            The most cost-effective way to manage overbilling liability is to
            find and correct errors before tenants invoke their audit rights.
            Proactive correction eliminates interest accrual from the date of
            overbilling, avoids audit cost shifting, and preserves tenant
            relationships.
          </p>
          <p className="mb-4 text-muted-foreground">
            A self-audit for a 20-tenant building might identify $45,000 in
            misclassified capital expenses, a management fee calculation that
            exceeds the 4% cap by $8,200, and a denominator error that has been
            overstating two tenants&apos; charges by 1.2% for three years. Total
            overbilling exposure: approximately $67,000. With interest at prime
            +2% (roughly 9.5% in early 2026) accruing for 18 months, the total
            liability if found in audit would approach $82,000, plus audit costs
            if the threshold is breached.
          </p>
          <p className="text-muted-foreground">
            Self-auditing before sending reconciliation statements, or
            immediately after, converts a potential $82,000 dispute into a
            $67,000 credit and often preserves the landlord-tenant relationship
            in the process.
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
                    Rounding Errors That Compound Over Multi-Year Cumulative
                    Caps
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a cap bank is maintained in a spreadsheet with rounding
                    at each step, small errors compound annually. A cumulative
                    5% cap calculated with improper rounding can drift
                    $800–$1,200 per tenant over a 5-year lease term. That error
                    is small in isolation. Across 15 tenants in a building, the
                    landlord has either over-recovered $18,000 or
                    under-recovered the same amount, depending on the direction
                    of the rounding. Auditors specifically look for this because
                    it&apos;s a signature of spreadsheet-based reconciliation.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Vendor Invoices Billed with Management Fee Markup
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some property management companies add a markup (3–10%) to
                    vendor invoices before passing them through as recoverable
                    operating expenses. If the lease defines the management fee
                    as the sole management compensation and separately defines
                    recoverable vendor expenses at actual cost, a markup on
                    invoices constitutes a second management fee, an overbilling
                    that most lease exclusion clauses prohibit. In a $400,000
                    operating expense pool with a 5% markup, tenants are
                    collectively overbilled $20,000 on top of the management fee
                    they&apos;re already paying.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Incorrect Occupancy Rate Used for Gross-Up Creates
                    Systematic Overbilling
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Gross-up is calculated using actual average occupancy for
                    the period. When a property management system defaults to
                    year-end occupancy or point-in-time occupancy rather than
                    the weighted average, the gross-up multiplier is wrong. In a
                    building that was 70% occupied for the first half of the
                    year and 90% for the second half, the correct average is 80%
                    not 90%. Grossing up to 95% using 90% as the divisor instead
                    of 80% raises the variable expense pool by 12.5%,
                    overbilling every tenant&apos;s share accordingly.
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
                What is CAM overbilling?
              </h3>
              <p className="text-muted-foreground">
                CAM overbilling occurs when a landlord&apos;s reconciliation
                statement charges a tenant more than their actual pro-rata share
                of recoverable operating expenses permitted under the lease.
                Common causes include GL misclassification, wrong pro-rata
                denominators, gross-up applied to fixed expenses, and billing
                for items excluded in the tenant&apos;s lease addendum.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What are a tenant&apos;s remedies when overbilled for CAM?
              </h3>
              <p className="text-muted-foreground">
                Tenants who establish overbilling are typically entitled to: a
                credit or refund of the overpaid amount, interest from the date
                of overbilling (often prime rate + 1–2% per lease terms), and
                audit cost reimbursement if the overcharge exceeds the
                lease&apos;s fee-shifting threshold (commonly 3–5% of total CAM
                billed). Landlords must comply within the lease&apos;s cure
                period, typically 30–60 days.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Does California SB 1103 create treble damage liability for CAM
                overbilling?
              </h3>
              <p className="text-muted-foreground">
                California SB 1103 (effective January 1, 2025) created enhanced
                protections specifically for{""}
                <strong>qualified commercial tenants</strong> (defined as
                tenants with gross receipts of $250 million or less, leasing
                10,000 square feet or less, in buildings of 100,000 square feet
                or less). Enhanced remedies under SB 1103 apply only to tenants
                who meet all three of those size thresholds. Large tenants,
                large spaces, and large buildings are not covered by SB 1103,
                though standard lease remedies still apply.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                How should a landlord handle overbilling discovered after
                statements are sent?
              </h3>
              <p className="text-muted-foreground">
                Proactive disclosure before the tenant&apos;s auditor finds the
                error is always preferable. Issue a corrected reconciliation
                statement, apply a credit (or refund) immediately, and document
                the correction. Proactive correction before audit invocation
                prevents fee-shifting, stops interest accrual, and preserves the
                landlord-tenant relationship. Once an auditor is already
                engaged, the same remedies apply but the dynamic shifts in the
                tenant&apos;s favor.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/recoverable-vs-nonrecoverable-cam"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Recoverable vs. Non-Recoverable CAM
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How to classify expenses for accurate reconciliation.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/california-sb-1103-cam-guide"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    California SB 1103 CAM Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Compliance requirements for qualified commercial tenant
                    properties.
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
                    Automate reconciliation and prevent overbilling errors.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Reconcile Overbilling Out Before It Becomes a Dispute
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri reconciles every line item in your CAM statement against
            your actual lease terms: GL classification, management fee caps,
            pro-rata denominators, gross-up, and CAM caps. Get every charge
            right before interest starts accruing.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_overbilling_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
