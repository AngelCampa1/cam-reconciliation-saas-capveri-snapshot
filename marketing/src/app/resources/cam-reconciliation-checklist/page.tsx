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
  title: "CAM Reconciliation Checklist: 35 Steps for a Clean Year-End Close",
  description:
    "A 35-item CAM reconciliation checklist for property accounting teams. Organized by phase: GL prep, expense classification, calculation review, statement generation, and true-up collection.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-reconciliation-checklist`,
  },
  openGraph: {
    title: "CAM Reconciliation Checklist: 35 Steps for a Clean Year-End Close",
    description:
      "A 35-item CAM reconciliation checklist for property accounting teams. Organized by phase: GL prep, expense classification, calculation review, statement generation, and true-up collection.",
    url: `${SITE_URL}/resources/cam-reconciliation-checklist`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "What data sources are needed before starting a CAM reconciliation?",
    answer:
      "You need five sources: the full-year general ledger (from Yardi, MRI, or your property management system), executed lease agreements for each tenant, the prior-year CAM reconciliation file, original vendor invoices for material line items, and the annual property tax bills and insurance policies.",
  },
  {
    question: "How many items should a CAM reconciliation checklist have?",
    answer:
      "A comprehensive CAM reconciliation checklist covers 30–40 items organized across five phases: GL preparation, expense classification, calculation review, statement generation, and delivery and collection. Fewer than 25 items typically means key steps are being combined in ways that create blind spots.",
  },
  {
    question: "What is the most commonly missed item in a CAM reconciliation?",
    answer:
      "The most commonly missed items are the pro-rata denominator verification and the cap bank balance carry-forward. Most teams verify expense totals carefully but forget to confirm that the denominator matches the lease definition, especially when a new tenant was added mid-year or when an anchor exclusion applies.",
  },
  {
    question:
      "Who should review the CAM reconciliation before statements go out?",
    answer:
      "The reconciliation should have at least two reviewers: the property accountant who prepared it and a senior property manager or controller who can verify lease compliance. For high-value tenants or tenants with complex cap structures, a third reviewer with lease administration expertise is warranted.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Reconciliation Checklist",
    url: `${SITE_URL}/resources/cam-reconciliation-checklist`,
  },
]);

const phases = [
  {
    number: 1,
    title: "GL Preparation",
    items: [
      "1. Verify the GL date range exactly matches the reconciliation period (e.g., Jan 1–Dec 31). A single day off creates an unbridgeable gap.",
      "2. Confirm all expected vendor invoices are present: check landscaping, janitorial, utilities, and property tax against your vendor roster.",
      "3. Run a duplicate-entry check on the full GL export. Voided and re-entered invoices in Yardi and MRI can appear twice.",
      "4. Confirm the management fee line is present and calculated at the correct contracted rate on the correct base.",
      "5. Verify property tax and insurance lines are fully booked for the entire year, not just the payment dates.",
      "6. Check that all December accruals are posted. Late-arriving December invoices are the most common source of GL incompleteness.",
      "7. Confirm there are no corporate-level allocations or inter-company transfers in the property GL.",
    ],
  },
  {
    number: 2,
    title: "Expense Classification",
    items: [
      "8. Apply all non-recoverable exclusions per each tenant's lease. Confirm these are documented with lease section references.",
      "9. Remove capital items from the recoverable pool. Flag every line above your capital threshold ($5,000–$10,000) and verify it is operating expense, not CapEx.",
      "10. Cap the management fee at the per-lease maximum. Verify each tenant's lease for management fee cap language.",
      "11. Split controllable and non-controllable expenses if any lease uses a controllable CAM cap structure.",
      "12. Apply lease-specific exclusions beyond standard non-recoverables (e.g., some leases exclude parking lot maintenance; others exclude roofing).",
      "13. For expense-stop leases, identify the base year expense amount against which the tenant's obligations are measured.",
      "14. Remove excluded anchor tenant expenses from the shared pool if any leases contain anchor exclusion provisions.",
    ],
  },
  {
    number: 3,
    title: "Calculation Review",
    items: [
      "15. Confirm gross-up was applied at the correct occupancy threshold (typically 90–95%) if actual occupancy fell below the threshold.",
      "16. Verify the variable/fixed expense split used in the gross-up is consistent with lease language. Fixed expenses (taxes, insurance) are not grossed up.",
      "17. Confirm the pro-rata denominator matches the definition in each tenant's lease. This varies: some leases use total building RSF, others use occupied RSF, others exclude anchors.",
      "18. Verify the CAM cap type (cumulative vs. non-cumulative) for each capped tenant and apply the correct calculation method.",
      "19. For cumulative caps, use the correct prior-year cap bank balance. Verify it matches the prior-year reconciliation file.",
      "20. Confirm all tenant-specific lease amendments are reflected in the calculation. Amendments often change exclusions, cap bases, or denominators.",
      "21. Cross-check all per-tenant calculations for arithmetic consistency. The sum of all tenant shares should equal 100% of the allocated pool.",
    ],
  },
  {
    number: 4,
    title: "Statement Generation",
    items: [
      "22. Attach the full supporting schedule showing expenses by recoverable category to each tenant statement.",
      "23. Clearly show the prior-year estimates collected and reconcile to the tenant ledger. The amount shown must match what was actually billed and collected.",
      "24. Confirm all tenants are included. Verify the statement count against the active tenant roster as of year-end.",
      "25. Include a calculation audit trail (gross-up workbook, cap calculation, management fee calc) as an exhibit to each statement.",
      "26. Show the management fee calculation explicitly. Management fee disputes are the second most common audit trigger after capital items.",
      "27. Clearly state the net true-up amount as owed-by-tenant or credit-due-to-tenant. Ambiguous statement formats drive unnecessary inquiries.",
      "28. Include a due date on every true-up invoice. Statements without a due date routinely go unpaid.",
    ],
  },
  {
    number: 5,
    title: "Delivery and Collection",
    items: [
      "29. Send statements by the lease-mandated deadline. Confirm the exact date per each lease. Deadlines range from 60 to 120 days post-year-end.",
      "30. Obtain delivery confirmation for each tenant (certified mail receipt, email read receipt, or tenant portal confirmation).",
      "31. Schedule payment reminder outreach for 25 days after delivery, before the typical 30-day payment deadline.",
      "32. Open a dispute tracking log on the day statements go out. Log every tenant inquiry with date, question, and response.",
      "33. For tenants receiving credits, apply the credit against the next monthly estimate payment per the lease provisions.",
      "34. Respond to all tenant questions within the SLA specified in your lease (typically 15–30 business days).",
      "35. Archive the complete reconciliation file (GL export, calculations, statements, delivery confirmations, and all correspondence) for the minimum period required by your leases (typically 3–5 years).",
    ],
  },
];

export default function CamReconciliationChecklistPage() {
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
          <span className="text-foreground">CAM Reconciliation Checklist</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Reconciliation Checklist: 35 Steps for a Clean Year-End Close
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            A phase-by-phase checklist for property accounting teams completing
            annual CAM reconciliations. Use this to catch errors before
            statements reach tenants. Not after.
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
            What This Checklist Covers
          </h2>
          <p className="text-muted-foreground">
            A CAM reconciliation requires verifying data from 5 sources (GL,
            leases, prior-year reconciliation, vendor invoices, and
            tax/insurance bills) and checking 35 specific items before
            statements go out. The checklist is organized into 5 phases: GL
            Preparation (items 1–7), Expense Classification (8–14), Calculation
            Review (15–21), Statement Generation (22–28), and Delivery and
            Collection (29–35).
          </p>
        </div>

        {/* Data sources */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            5 Data Sources You Need Before Starting
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: "Full-year GL export",
                desc: "From Yardi, MRI, or your PMS: all property expense accounts",
              },
              {
                label: "Executed leases",
                desc: "Including all amendments. Verify the latest executed version",
              },
              {
                label: "Prior-year reconciliation",
                desc: "Cap bank balances, prior estimates, and any carryforward credits",
              },
              {
                label: "Vendor invoices",
                desc: "Original invoices for all material items ($5,000+) for audit support",
              },
              {
                label: "Tax bills and insurance policies",
                desc: "Source documents (not just GL entries) for the reconciliation year",
              },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border p-4">
                <p className="font-medium">{s.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The 35-item checklist */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 35-Item CAM Reconciliation Checklist
          </h2>
          <div className="space-y-8">
            {phases.map((phase) => (
              <div key={phase.number}>
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {phase.number}
                  </span>
                  Phase {phase.number}: {phase.title}
                </h3>
                <div className="space-y-2 rounded-lg border p-4">
                  {phase.items.map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <p className="text-sm text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
                    Skipping the amendment review
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Lease amendments frequently change CAM exclusions, cap
                    structures, or pro-rata definitions. Teams that pull the
                    original lease without checking for amendments apply the
                    wrong rules, and face disputes the moment a tenant&apos;s
                    attorney compares the statement to the amended lease.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using the wrong prior-year estimate balance
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The prior-year estimate amount on the reconciliation must
                    match what was actually billed and collected, not what was
                    budgeted. Teams that pull the budgeted estimate instead of
                    the actual collected amount produce a statement that
                    disagrees with the tenant&apos;s own payment records, which
                    triggers immediate disputes.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Statements without a due date
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    True-up invoices that omit a payment due date create
                    collection ambiguity. Tenants routinely delay payment when
                    no deadline is stated, and the landlord loses the ability to
                    claim a default without first issuing a separate demand
                    letter, adding 30–45 days to the collection cycle.
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
                What data sources are needed before starting a CAM
                reconciliation?
              </h3>
              <p className="text-muted-foreground">
                You need five sources: the full-year GL, executed lease
                agreements (including amendments), the prior-year reconciliation
                file, original vendor invoices for material items, and the
                annual property tax bills and insurance policies.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How many items should a CAM reconciliation checklist have?
              </h3>
              <p className="text-muted-foreground">
                A comprehensive checklist covers 30–40 items across five phases.
                Fewer than 25 typically means key steps are being combined in
                ways that create blind spots, especially in calculation review
                and cap verification.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the most commonly missed item in a CAM reconciliation?
              </h3>
              <p className="text-muted-foreground">
                The pro-rata denominator verification and the cap bank balance
                carry-forward. Most teams verify expense totals carefully but
                forget to confirm the denominator matches the lease definition,
                especially when a new tenant was added mid-year or an anchor
                exclusion applies.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Who should review the CAM reconciliation before statements go
                out?
              </h3>
              <p className="text-muted-foreground">
                At minimum: the property accountant who prepared it and a senior
                property manager or controller. For high-value tenants or
                tenants with complex cap structures, add a third reviewer with
                lease administration expertise.
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
              href="/resources/cam-close-checklist"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Close Checklist
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Monthly and year-end close procedures for property controllers.
              </p>
            </Link>
            <Link
              href="/resources/cam-pre-send-packet-checklist"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                Pre-Send Packet Checklist
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The final 20-item review before statements go out to tenants.
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
                How CapVeri automates the 35-step reconciliation process.
              </p>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Run the Checklist Automatically
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri runs all 35 checklist items automatically against your Yardi
            or MRI export, flagging errors before they become tenant disputes.
            Free to start, no integration required.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "cam_reconciliation_checklist_cta",
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
