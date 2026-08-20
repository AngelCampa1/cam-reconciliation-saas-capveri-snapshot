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
    "Common Area Maintenance Reconciliation Explained for Commercial Landlords",
  description:
    "A complete walkthrough of the CAM reconciliation process: from GL export to tenant true-up billing. Covers the timeline, common errors, and how to automate verification.",
  alternates: {
    canonical: `${SITE_URL}/resources/common-area-maintenance-reconciliation-explained`,
  },
  openGraph: {
    title:
      "Common Area Maintenance Reconciliation Explained for Commercial Landlords",
    description:
      "A complete walkthrough of the CAM reconciliation process: from GL export to tenant true-up billing. Covers the timeline, common errors, and how to automate verification.",
    url: `${SITE_URL}/resources/common-area-maintenance-reconciliation-explained`,
    type: "article",
  },
};

const howToSchema = structuredDataSchemas.howTo(
  "How to Complete a CAM Reconciliation",
  "The 6-step process for completing an annual common area maintenance reconciliation for a commercial property, from closing the books to collecting tenant true-up payments.",
  [
    {
      name: "Close the books and pull the GL export",
      text: "After the fiscal year ends, export the full general ledger for the property. Most property management systems (Yardi, MRI, AppFolio) can produce a GL summary by account code. Download all expense accounts for the reconciliation period - usually January 1 through December 31.",
      url: `${SITE_URL}/resources/what-are-cam-charges`,
    },
    {
      name: "Classify each GL line item as recoverable or non-recoverable",
      text: "Review each expense line against the recoverable expense definitions in your leases. Flag capital items, financing costs, management fees above the lease cap, and any lease-specific exclusions. The remaining items form the recoverable expense pool.",
      url: `${SITE_URL}/resources/how-to-calculate-cam-charges`,
    },
    {
      name: "Apply gross-up adjustments for occupancy below the lease threshold",
      text: "If actual occupancy fell below the gross-up threshold in any tenant's lease (typically 90–95%), normalize variable expenses upward to that threshold. Fixed expenses like property taxes and insurance are not grossed up - only variable costs like utilities and janitorial that scale with occupancy.",
      url: `${SITE_URL}/tools/cam-gross-up-calculator`,
    },
    {
      name: "Apply CAM caps and calculate each tenant's net obligation",
      text: "For leases with CAM caps, calculate the maximum allowable obligation for each tenant based on their cap type (cumulative or non-cumulative), base year amount, and the current year's gross obligation. The capped amount is the tenant's binding obligation for the year.",
    },
    {
      name: "Prepare and send reconciliation statements",
      text: "Draft a reconciliation statement for each tenant showing: total recoverable expenses, the tenant's pro-rata share percentage, gross-up and cap adjustments, total annual obligation, estimated payments already collected, and the net true-up amount owed or credit due. Most leases require statements within 90–120 days of year end.",
    },
    {
      name: "Collect true-up payments and update the next year's estimate",
      text: "Send demand letters or credit memos depending on the true-up direction. Update each tenant's monthly estimate for the coming year based on reconciled actuals plus a reasonable escalation assumption. Document all adjustments in the reconciliation file.",
    },
  ],
  "PT3H",
);

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is CAM reconciliation?",
    answer:
      "CAM reconciliation is the annual (or periodic) process of comparing actual operating expenses incurred at a commercial property to the estimated CAM payments collected from tenants throughout the year. The result is a true-up: tenants owe additional payment if actual expenses exceeded estimates, or receive a credit if the landlord overcollected.",
  },
  {
    question: "When must CAM reconciliation statements be sent?",
    answer:
      "Most commercial leases require CAM reconciliation statements within 90–120 days after the fiscal year ends - typically March 31 to April 30 for calendar-year properties. Missing the lease's stated deadline can forfeit the landlord's right to collect underpayments for that year. Some leases have a shorter 60-day window, so always verify the specific lease requirement.",
  },
  {
    question:
      "What is included in the recoverable expense pool for CAM reconciliation?",
    answer:
      "The recoverable expense pool includes all operating costs allowable under each tenant's lease: property taxes, insurance, janitorial, landscaping, utilities for common areas, security, elevator maintenance, parking lot upkeep, management fees (capped per lease), and routine repairs. Capital improvements, financing costs, leasing commissions, and tenant-specific costs are typically excluded.",
  },
  {
    question: "What is a CAM true-up?",
    answer:
      "A CAM true-up is the net settlement payment (or credit) resulting from the annual reconciliation. If actual recoverable expenses exceeded the estimates collected from a tenant, the tenant owes the difference - the true-up amount. If the landlord overcollected, the tenant receives a credit applied to future CAM payments or returned directly, depending on lease terms.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Reconciliation Explained",
    url: `${SITE_URL}/resources/common-area-maintenance-reconciliation-explained`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "Common Area Maintenance Reconciliation Explained for Commercial Landlords",
  description:
    "A complete walkthrough of the CAM reconciliation process: from GL export to tenant true-up billing. Covers the timeline, common errors, and how to automate verification.",
  url: `${SITE_URL}/resources/common-area-maintenance-reconciliation-explained`,
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

export default function CamReconciliationExplainedPage() {
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
          <span className="text-foreground">CAM Reconciliation Explained</span>
        </nav>

        {/* Header */}
        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Common Area Maintenance Reconciliation Explained
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            CAM reconciliation is the annual process that turns 12 months of
            estimated payments into a binding true-up. Understanding the
            mechanics and where errors enter is essential for every commercial
            landlord managing NNN leases.
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
            What Is CAM Reconciliation?
          </h2>
          <p className="text-muted-foreground">
            CAM reconciliation is the annual (or periodic) process of comparing
            actual operating expenses to the estimated payments collected from
            tenants during the year, resulting in a true-up billing or credit.
            Landlords collect estimated CAM monthly throughout the year, then
            reconcile against actual GL data after the books close. The
            difference owed by the tenant or credited by the landlord is the
            true-up.
          </p>
        </div>

        {/* Why Reconciliation Matters */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Why CAM Reconciliation Matters
          </h2>
          <p className="mb-4 text-muted-foreground">
            For a 50,000 SF building with $8/SF in annual operating expenses,
            the total CAM pool is $400,000/year. If tenants are paying estimates
            based on the prior year and actual costs increased by 6%, the
            landlord is leaving $24,000 uncollected per year, every year the
            reconciliation is skipped or delayed. Multiply that across a
            portfolio of ten buildings and the leakage exceeds $240,000
            annually.
          </p>
          <p className="mb-4 text-muted-foreground">
            Conversely, landlords who overcollect without proper reconciliation
            create audit exposure. Tenants under NNN leases typically have 12–18
            months from the date of the reconciliation statement to invoke their
            audit right. An error caught by a tenant auditor carries interest
            charges and can trigger broader scrutiny of prior years.
          </p>
          <p className="text-muted-foreground">
            Accurate, timely reconciliation protects both sides: the landlord
            recovers legitimate costs, and the tenant pays exactly what the
            lease requires - no more, no less.
          </p>
        </section>

        {/* The 6-Step Reconciliation Cycle */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 6-Step CAM Reconciliation Cycle
          </h2>
          <div className="space-y-5">
            {[
              {
                step: "1",
                title: "Close the books and pull the GL export (January)",
                body: "Export the full general ledger for the property covering the reconciliation period. In Yardi, this is a GL Summary by Account report. In MRI, export the Account Ledger. The export should include account codes, descriptions, and period totals for all expense accounts. Keep a copy of the raw export as your audit trail.",
              },
              {
                step: "2",
                title:
                  "Classify expenses as recoverable or non-recoverable (January–February)",
                body: "Map each GL account code to its recoverable status under each tenant's lease. A single account (say, 5400 Repairs & Maintenance) may contain both recoverable repairs and a non-recoverable capital replacement. Line-by-line review is the standard required to defend your reconciliation. Back out capital items, financing charges, and any lease-specific exclusions.",
              },
              {
                step: "3",
                title: "Apply gross-up adjustments (February)",
                body: "For properties that fell below the gross-up threshold during the year, normalize variable expenses upward. Variable expenses (utilities, janitorial, security) scale with occupancy and must be grossed up. Fixed expenses (property taxes, insurance) do not. If your building averaged 82% occupancy against a 95% gross-up threshold, variable expenses of $180,000 gross up to $208,537 ($180,000 ÷ 0.82 × 0.95) before applying pro-rata shares.",
              },
              {
                step: "4",
                title:
                  "Calculate each tenant's pro-rata obligation and apply caps (February–March)",
                body: "For each tenant: multiply the recoverable (and grossed-up) expense pool by their pro-rata share percentage. Apply any CAM cap from the lease. Check whether the cap is cumulative or non-cumulative, and whether it applies only to controllable expenses. Document the cap bank balance if cumulative. The result is each tenant's capped annual CAM obligation.",
              },
              {
                step: "5",
                title:
                  "Prepare and send reconciliation statements (March–April)",
                body: "Draft a reconciliation statement for each tenant showing the full calculation: total recoverable expenses, pro-rata share %, gross-up adjustment, cap adjustment (if any), total annual obligation, estimated payments already collected, and the net true-up balance. Most leases require statements within 90–120 days of year end. Missing the deadline can forfeit underpayment recovery rights.",
              },
              {
                step: "6",
                title:
                  "Collect true-ups and reset estimates for the coming year (April–May)",
                body: "Issue invoices for tenants who owe true-up amounts, and credit memos or checks for tenants who overpaid. Set the new monthly estimate for each tenant based on reconciled actuals plus expected expense growth. Update the reconciliation file with all adjustments and keep it available for the 3–5 year audit window typical in commercial leases.",
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

        {/* Q1 Timeline */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Typical Q1 Reconciliation Timeline for Calendar-Year Properties
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Target Date
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Milestone
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Owner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  [
                    "Jan 31",
                    "Books closed; GL export pulled from Yardi/MRI",
                    "Controller",
                  ],
                  [
                    "Feb 15",
                    "GL line items classified; non-recoverable items backed out",
                    "Controller / PM",
                  ],
                  [
                    "Feb 28",
                    "Gross-up adjustments calculated; cap banks reviewed",
                    "Controller",
                  ],
                  [
                    "Mar 15",
                    "Draft reconciliation statements prepared for all tenants",
                    "Controller",
                  ],
                  [
                    "Mar 31",
                    "Statements reviewed, approved, and sent to tenants",
                    "AM / PM",
                  ],
                  [
                    "Apr 30",
                    "True-up payments due from tenants (per most lease terms)",
                    "PM / Leasing",
                  ],
                  [
                    "May 15",
                    "Updated monthly estimates set for remainder of current year",
                    "Controller",
                  ],
                ].map(([date, milestone, owner]) => (
                  <tr key={date} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {date}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {milestone}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                    GL Export Misclassifications That Inflate the Expense Pool
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a single GL account like &quot;5400 – Property
                    Maintenance&quot; contains both routine recoverable repairs
                    ($45,000) and a non-recoverable HVAC unit replacement
                    ($78,000), pulling the account total without line-level
                    review overstates the recoverable pool by $78,000. In a
                    building with 20 tenants at an average 5% pro-rata share,
                    each tenant is overbilled $3,900, a $78,000 aggregate
                    exposure that a tenant auditor will find on day one.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using Incorrect Occupancy for Gross-Up Calculations
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Gross-up requires using actual average occupancy for the
                    reconciliation period, not the occupancy at a single point
                    in time. If a building started the year at 75% occupancy and
                    ended at 92%, the average is approximately 83.5%. Using the
                    year-end figure of 92% results in a lower gross-up
                    multiplier and under-recovers variable expenses by the
                    difference. On $200,000 of variable costs, this calculation
                    error alone reduces recovery by $18,700.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Cap Bank Miscalculation on Cumulative CAM Caps
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cumulative caps bank unused cap capacity from years when
                    actual expense growth was below the cap rate. A tenant with
                    a 5% cumulative cap whose actual CAM grew 2% in Year 1 and
                    3% in Year 2 has banked 5% (3% unused in Year 1, 2% unused
                    in Year 2). In Year 3, the landlord can recover up to 10%
                    growth (5% cap + 5% banked). Failing to track the cap bank
                    means the landlord either bills below what they could
                    legitimately recover, or bills above the tenant&apos;s
                    actual cap ceiling. Both errors are discoverable in an
                    audit.
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
                What is CAM reconciliation?
              </h3>
              <p className="text-muted-foreground">
                CAM reconciliation is the annual process of comparing actual
                property operating expenses to estimated CAM payments collected
                from tenants, resulting in a true-up billing or credit.
                Landlords collect estimated payments monthly, reconcile against
                actual GL data after year end, and issue statements showing the
                net amount owed or credited.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                When must CAM reconciliation statements be sent?
              </h3>
              <p className="text-muted-foreground">
                Most commercial leases require CAM reconciliation statements
                within 90–120 days after the fiscal year ends (typically March
                31 to April 30 for calendar-year properties). Missing the
                lease&apos;s stated deadline can forfeit the landlord&apos;s
                right to collect underpayments. Some leases have shorter 60-day
                windows, so always verify the specific lease requirement before
                assuming the standard timeline applies.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is included in the recoverable expense pool?
              </h3>
              <p className="text-muted-foreground">
                The recoverable pool includes all operating costs allowable
                under each tenant&apos;s lease: property taxes, insurance,
                janitorial, landscaping, common area utilities, security,
                elevator maintenance, parking upkeep, management fees (capped
                per lease), and routine repairs. Capital improvements, financing
                costs, leasing commissions, and tenant-specific costs are
                typically excluded.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is a CAM true-up?
              </h3>
              <p className="text-muted-foreground">
                A CAM true-up is the net settlement resulting from the annual
                reconciliation. If actual recoverable expenses exceeded the
                estimates collected from a tenant, the tenant owes the
                difference. If the landlord overcollected, the tenant receives a
                credit applied to future payments or returned directly. True-up
                amounts are typically due within 30 days of the reconciliation
                statement.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/how-to-calculate-cam-charges"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    How to Calculate CAM Charges
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pro-rata formula, gross-up, cap calculations with worked
                    examples.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/what-are-cam-charges"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    What Are CAM Charges?
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recoverable vs. excluded expenses and the
                    estimate-to-reconciliation cycle.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-reconciliation-process"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Reconciliation Process Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Detailed checklists and documentation requirements.
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
                    Model gross-up at 85%, 90%, 95%, and 100% occupancy
                    thresholds.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Automate Your CAM Reconciliation
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri works from your Yardi or MRI GL export and runs the full
            reconciliation: GL classification, gross-up, cap enforcement, and
            tenant statements. No integration required. Typical reconciliation
            time drops from days to hours.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "cam_reconciliation_explained_cta",
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
