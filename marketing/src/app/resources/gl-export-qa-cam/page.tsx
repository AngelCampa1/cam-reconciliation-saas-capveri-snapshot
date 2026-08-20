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
  title: "GL Export QA for CAM Reconciliation: A Pre-Reconciliation Checklist",
  description:
    "Before running your CAM reconciliation, verify your GL export. This checklist covers the 12 QA steps that catch the most common coding errors before they become tenant disputes.",
  alternates: {
    canonical: `${SITE_URL}/resources/gl-export-qa-cam`,
  },
  openGraph: {
    title:
      "GL Export QA for CAM Reconciliation: A Pre-Reconciliation Checklist",
    description:
      "Before running your CAM reconciliation, verify your GL export. This checklist covers the 12 QA steps that catch the most common coding errors before they become tenant disputes.",
    url: `${SITE_URL}/resources/gl-export-qa-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What should I check in a GL export before CAM reconciliation?",
    answer:
      "At minimum: verify the date range matches the lease year (not the calendar year if the lease runs on a fiscal year), confirm all expected recurring vendors appear, flag single repair/maintenance transactions above $10,000 as potential CapEx, and verify that management fees match the agreed calculation basis. A full 12-step QA pass takes 30–60 minutes and prevents most tenant disputes.",
  },
  {
    question: "How do missing December accruals affect CAM reconciliation?",
    answer:
      "December accruals that are reversed in January create a mismatch: the expense appears in the December GL but is reversed out in the January GL. If you export only the calendar year, the December accrual may be included but its January reversal is not captured. The net effect is overstating expenses by the reversal amount. Always reconcile accruals against corresponding cash entries.",
  },
  {
    question: "How do I identify CapEx in a GL export?",
    answer:
      "Search for capital indicator keywords in line-item descriptions: 'replacement,' 'install,' 'new,' 'upgrade,' 'renovate,' 'retrofit.' Also flag any single transaction above $10,000 in repair and maintenance accounts for manual review. CapEx items in the operating expense pool inflate tenant CAM obligations and create audit exposure.",
  },
  {
    question:
      "What is the difference between a lease year and a calendar year for CAM?",
    answer:
      "Most leases reconcile CAM on a calendar year (January through December). However, fiscal-year leases (common in retail and some office) may reconcile on a non-calendar year (e.g., July 1 through June 30). If your GL is on a calendar year but the lease reconciles on a fiscal year, you need to export the correct date range and prorate shared months. Misalignment between the GL export period and the lease year is the most common source of date-range errors.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "GL Export QA for CAM",
    url: `${SITE_URL}/resources/gl-export-qa-cam`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "GL Export QA for CAM Reconciliation: A Pre-Reconciliation Checklist",
  description:
    "Before running your CAM reconciliation, verify your GL export. This checklist covers the 12 QA steps that catch the most common coding errors before they become tenant disputes.",
  url: `${SITE_URL}/resources/gl-export-qa-cam`,
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

const checklistItems = [
  {
    step: 1,
    title: "Verify the export date range matches the lease year",
    detail:
      "Most leases reconcile on a calendar year, but fiscal-year leases (common in retail) run on non-calendar periods. Confirm the GL export start and end dates match the lease year exactly, not just the accounting year your ERP defaults to. For a July 1 through June 30 lease year, an export of January 1 through December 31 will include expenses outside the lease period and miss others.",
  },
  {
    step: 2,
    title: "Confirm all expected recurring vendors appear",
    detail:
      "Pull a vendor list from the prior-year reconciliation and compare it to the current export. A missing vendor almost always means a missing invoice. Either it was not posted yet or it was coded to the wrong property. Common misses: landscaping, parking lot sweeping, elevator maintenance contracts, and fire system testing.",
  },
  {
    step: 3,
    title: "Flag single transactions >$10,000 in repair/maintenance accounts",
    detail:
      "Any single transaction above $10,000 in accounts 6200–6299 (or your equivalent repair/maintenance codes) should be individually reviewed before it enters the CAM pool. HVAC repairs above $10,000 frequently cross the capital threshold depending on your accounting policy and lease terms. A $45,000 chiller repair may need to be capitalized and amortized rather than expensed.",
  },
  {
    step: 4,
    title: "Search for capital indicator keywords in descriptions",
    detail:
      "Run a text filter on the description field for: 'replacement,' 'install,' 'new,' 'upgrade,' 'renovate,' 'retrofit,' 'demolition,' and 'expansion.' These terms signal that a line item may be a capital project that was miscoded to an operating account. Even $8,000 parking lot line items described as 'new asphalt installation' should be reviewed.",
  },
  {
    step: 5,
    title: "Verify no duplicate journal entries",
    detail:
      "Sort the export by vendor + amount + date. Any combination appearing twice is a potential duplicate. Common cause: an invoice was entered manually and then also processed through the AP batch feed. A $15,000 HVAC invoice entered twice inflates the CAM pool by $15,000 and creates immediate audit exposure.",
  },
  {
    step: 6,
    title: "Check that management fee matches the agreed calculation",
    detail:
      "Many leases cap management fees at 3–5% of gross revenues or of eligible expenses. Recalculate the fee from the agreed basis and compare to what is in the GL. If the property management agreement was amended mid-year, verify that the fee calculation reflects the correct rate for each period.",
  },
  {
    step: 7,
    title: "Confirm property tax lines match actual tax bills",
    detail:
      "Export property tax entries and match them to the actual tax assessor bills. Verify the payment period (fiscal tax year vs. calendar year) is correctly allocated to the lease year. Some jurisdictions bill in arrears; if you accrued taxes in 2025 that will be billed in 2026, confirm the accrual amount and that no double-counting occurs with the 2026 cash payment.",
  },
  {
    step: 8,
    title: "Verify insurance premiums match the policy year and proration",
    detail:
      "Pull the insurance certificates for each policy and confirm the premium amounts match the GL entries. For policies that span two calendar years (e.g., policy runs July–June), verify that only the portion allocable to the lease year is included. The common error is including the full annual premium in a single year's CAM pool.",
  },
  {
    step: 9,
    title: "Confirm utilities are metered at the property level",
    detail:
      "Verify that utility charges in the export are billed at the individual property address, not allocated from a corporate master account or estimated from a square footage proration. Corporate utility allocations are not typically recoverable as CAM and are frequently challenged in tenant audits.",
  },
  {
    step: 10,
    title: "Check for accruals without corresponding cash entries",
    detail:
      "Find every debit entry coded as an accrual and confirm there is a corresponding cash-basis credit in the same or subsequent period. Orphaned accruals - entries that were recorded but never reversed or paid - inflate the expense pool without representing a real expense. This is especially common with year-end accruals for vendor invoices that were never received.",
  },
  {
    step: 11,
    title: "Validate that excluded expenses are not in the export",
    detail:
      "Review the lease's exclusion list and search the GL for any of the excluded categories. Capital improvements, financing costs, leasing commissions, tenant improvement allowances, and owner-specific costs should not appear in the operating expense pool. Even one exclusion in the pool can trigger a full tenant audit.",
  },
  {
    step: 12,
    title: "Confirm the total is within expected variance of budget",
    detail:
      "Compare the export total to your approved budget and to the prior year actual. A total that is more than 15% above budget or prior year warrants line-by-line review before proceeding. Common causes: an emergency repair was miscoded as recurring maintenance, a multi-year insurance premium was expensed in a single year, or the wrong date range was exported.",
  },
];

const errorPatterns = [
  {
    title: "Fiscal year mismatch between lease year and GL export period",
    detail:
      "A lease year that runs October 1 through September 30 requires a GL export for that exact period. Exporting October 1 through December 31 of one year and January 1 through September 30 of the following year often produces errors because some GL systems cut periods at month-end, not mid-month. An ERP export defaulting to the calendar year misses Q4 of the lease year and includes Q4 of the wrong year.",
  },
  {
    title: "Missing December accruals reversed in January",
    detail:
      "Year-end accruals posted in December are often reversed in January when the actual invoice is received. If your GL export includes December but treats the January reversal as outside scope, you double-count the expense. For a December 31 accrual of $22,000 in elevator maintenance that was reversed January 2 when the actual invoice came in at $19,500, including the December accrual without the reversal overstates expenses by $22,000.",
  },
  {
    title: "Corporate overhead allocations included in property-level GL",
    detail:
      "Some ERPs push corporate overhead - IT costs, HR, executive compensation allocations - to property-level GL codes via automated journal entries. These allocations are not recoverable CAM expenses under virtually any commercial lease, but they appear in operating expense accounts alongside legitimate property costs. Without a QA pass specifically searching for inter-company allocation codes, they flow into the CAM pool undetected.",
  },
];

export default function GlExportQaCamPage() {
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
          <span className="text-foreground">GL Export QA for CAM</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            GL Export QA for CAM Reconciliation: A Pre-Reconciliation Checklist
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            The 12 steps that catch coding errors in your GL export before they
            become tenant disputes.
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
            Most CAM billing errors trace back to the GL export - wrong account
            codes, CapEx in the OpEx pool, duplicated entries, or missing
            accruals. A pre-reconciliation QA pass on your GL export takes 30–60
            minutes and can prevent months of dispute resolution. The 12 checks
            below cover the patterns that show up most often in tenant audits.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 12-Step GL Export QA Checklist
          </h2>
          <div className="space-y-6">
            {checklistItems.map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {item.step}
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="mb-1 font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
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
          <h2 className="mb-4 text-2xl font-semibold">
            When to Run This Checklist
          </h2>
          <p className="mb-4 text-muted-foreground">
            Run the full 12-step QA before you finalize any reconciliation
            statement. Ideal timing: immediately after you export the GL for the
            reconciliation period and before you apply gross-up, pro-rata
            allocation, or CAM cap calculations. Errors caught at the GL stage
            are corrected with a single journal entry. Errors caught after
            statements are delivered require credit memos, revised statements,
            and (if a tenant has already filed an audit) a formal dispute
            resolution process.
          </p>
          <p className="text-muted-foreground">
            For portfolios with more than 10 properties, consider running a
            subset of these checks (steps 3, 4, 5, and 11) as a first-pass
            screen across all properties, then running the full checklist only
            on properties where the first-pass flags something. CapVeri runs
            steps 3 through 12 automatically from standard{" "}
            <Link
              href="/resources/export-based-verification-layer"
              className="text-primary hover:underline"
            >
              GL exports from supported systems
            </Link>
            .
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "What should I check in a GL export before CAM reconciliation?",
                a: "At minimum: verify the date range matches the lease year, confirm all expected recurring vendors appear, flag single repair/maintenance transactions above $10,000 as potential CapEx, and verify that management fees match the agreed calculation basis. The full 12-step checklist above takes 30–60 minutes and prevents most tenant disputes.",
              },
              {
                q: "How do missing December accruals affect CAM reconciliation?",
                a: "December accruals that are reversed in January create a mismatch: the expense appears in the December GL but the reversal is not captured if you only export the calendar year. The net effect is overstating expenses by the reversal amount. Always reconcile accruals against corresponding cash entries before finalizing your expense pool.",
              },
              {
                q: "How do I identify CapEx in a GL export?",
                a: "Search description fields for capital indicator keywords: 'replacement,' 'install,' 'new,' 'upgrade,' 'renovate,' 'retrofit.' Also flag any single transaction above $10,000 in repair and maintenance accounts for manual review. CapEx items in the operating expense pool inflate tenant CAM obligations and create audit exposure.",
              },
              {
                q: "What is the difference between a lease year and a calendar year for CAM?",
                a: "Most leases reconcile on a calendar year. Fiscal-year leases (common in retail) reconcile on a non-calendar period. If your GL defaults to a calendar year but the lease reconciles on a fiscal year, you need to export the correct date range. Misalignment between the GL export period and the lease year is one of the most common and most preventable CAM errors.",
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
                href: "/resources/detect-capex-in-gl-export",
                title: "How to Detect CapEx in a GL Export",
                desc: "A detailed guide to identifying capital projects miscoded as operating expenses.",
              },
              {
                href: "/resources/why-erps-still-leak-cam-revenue",
                title: "Why ERPs Still Leak CAM Revenue",
                desc: "The five categories of ERP gaps that let billing errors through.",
              },
              {
                href: "/resources/cam-reconciliation-process",
                title: "CAM Reconciliation Process Guide",
                desc: "End-to-end walkthrough of the reconciliation process from GL export to statement delivery.",
              },
              {
                href: "/resources/export-based-verification-layer",
                title: "Export-Based Verification Layer",
                desc: "How a verification layer catches errors without an ERP integration project.",
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
            Automate the GL QA Checklist
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri runs these 12 checks automatically from your GL export. It
            flags CapEx risk, duplicate entries, and excluded expenses before
            you run a single calculation.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "gl_export_qa_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
