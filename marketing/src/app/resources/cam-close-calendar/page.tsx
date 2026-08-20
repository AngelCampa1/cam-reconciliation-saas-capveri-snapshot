import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, Calendar } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "CAM Close Calendar for Commercial Portfolios: 2026 Reconciliation Timeline",
  description:
    "A month-by-month CAM close calendar for property accounting teams. Covers year-end close, reconciliation statement deadlines, true-up collection, and mid-year estimate issuance.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-close-calendar`,
  },
  openGraph: {
    title:
      "CAM Close Calendar for Commercial Portfolios: 2026 Reconciliation Timeline",
    description:
      "Month-by-month CAM close calendar covering year-end close, reconciliation statement deadlines, true-up collection, and estimate issuance.",
    url: `${SITE_URL}/resources/cam-close-calendar`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "How long do landlords have to send CAM reconciliation statements?",
    answer:
      "Most commercial leases require reconciliation statements to be delivered within 90 to 180 days after the end of the lease year. For calendar-year leases (January 1 through December 31), that means statements are due between March 31 and June 30 of the following year. Always verify the specific deadline in each lease. The deadline varies and missing it may allow tenants to argue the landlord has waived the true-up.",
  },
  {
    question:
      "What happens if a landlord misses the CAM reconciliation statement deadline?",
    answer:
      "The consequences depend on lease language. Many leases include a 'time is of the essence' clause for reconciliation statements, or state that statements delivered after the deadline are non-binding. Tenants with institutional representation will invoke these provisions to avoid paying true-up amounts on late statements. Some leases include explicit waiver language - if the landlord misses the deadline, the tenant's estimate payments are deemed final for that year.",
  },
  {
    question: "When should CAM estimate letters for the new year be sent?",
    answer:
      "Most leases require estimate letters (setting the tenant's monthly CAM payments for the upcoming year) to be delivered 30 to 60 days before the new lease year begins. For calendar-year leases, that means estimate letters should go out in November or December. Sending estimate letters late - or not at all - creates collection problems when actual CAM costs increase significantly from the prior year's estimates.",
  },
  {
    question:
      "What is a mid-year CAM estimate adjustment and when is it required?",
    answer:
      "A mid-year estimate adjustment occurs when actual year-to-date CAM expenses are tracking materially above or below the original annual estimate - typically defined as more than 10–15% variance. Some leases require the landlord to issue a revised estimate when this threshold is breached; others permit but do not require it. Proactively adjusting estimates when actuals diverge significantly reduces the true-up amount at year-end and prevents large lump-sum collections that trigger tenant disputes.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Close Calendar",
    url: `${SITE_URL}/resources/cam-close-calendar`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "CAM Close Calendar for Commercial Portfolios: 2026 Reconciliation Timeline",
  description:
    "A month-by-month CAM close calendar for property accounting teams covering year-end close, reconciliation statement deadlines, and estimate issuance.",
  url: `${SITE_URL}/resources/cam-close-calendar`,
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

type QuarterMonth = {
  month: string;
  tasks: string[];
};

const quarters: {
  label: string;
  description: string;
  months: QuarterMonth[];
}[] = [
  {
    label: "Q1: January – March",
    description:
      "The core reconciliation window for calendar-year leases. Every day in Q1 matters: books close, GL exports are prepared, reconciliations are calculated, and statements go out.",
    months: [
      {
        month: "January",
        tasks: [
          "Close the prior fiscal year books by January 31. This is a hard deadline - reconciliation statements cannot be finalized until the books are closed and all year-end journal entries are posted.",
          "Accrue any recurring CAM items not yet reflected in December (insurance final premiums, property tax year-end adjustments, utility true-ups from December billing lag).",
          "Compile the vendor invoice file for the year - all invoices supporting GL entries in the CAM pool. You will need these when tenants request backup.",
          "Verify that all capital expenditures have been reclassified out of operating accounts before the year-end GL freeze.",
        ],
      },
      {
        month: "February",
        tasks: [
          "Export the full-year GL by February 1–15. Screen the GL export for CapEx miscoding, excluded expenses, and account mapping errors before any reconciliation calculations begin.",
          "Apply gross-up calculations for any lease years where occupancy fell below the lease's gross-up threshold (commonly 90–95%). Document the gross-up methodology and the occupancy rate used.",
          "Calculate each tenant's pro-rata share for the year, verifying the denominator definition in each lease (total rentable area, occupied area, fixed, or other definition).",
          "Apply CAM caps to tenants with cumulative or non-cumulative cap protections. This is the step most likely to require manual lease review.",
          "Verify management fee calculations against the approved base (gross revenues or recoverable CAM pool) and confirm the calculated fee does not exceed the lease cap.",
        ],
      },
      {
        month: "March",
        tasks: [
          "Generate reconciliation statements for all tenants by March 31 - the 90-day deadline for most calendar-year leases. Statements generated in March can still be delivered within the window for leases with 90–180 day deadlines.",
          "For leases with a 90-day deadline (statements due March 31), all statements must be sent by March 31. Do not prioritize large-balance true-ups over small ones - missing any deadline creates waiver risk.",
          "Track delivery confirmation for each statement. Lease deadlines are typically measured from the date the statement is sent (not received), but documenting delivery protects against tenant waiver claims.",
          "Begin preparing the true-up invoice or credit memo for each tenant based on the reconciliation. Invoices for underpayments are typically due within 30 days of statement delivery; credits apply to future monthly payments.",
        ],
      },
    ],
  },
  {
    label: "Q2: April – June",
    description:
      "True-up collection, tenant dispute handling, and transition to current-year tracking.",
    months: [
      {
        month: "April",
        tasks: [
          "Collect true-up invoices. Most leases give tenants 30 days from receipt of the reconciliation statement to remit underpayments. Track collections against the reconciliation schedule.",
          "For tenants who received a credit (overpayments): apply credits to the next monthly CAM payment or issue a credit memo per the lease terms.",
          "Respond to tenant requests for reconciliation backup. Tenants have the right to request supporting documentation (GL detail, vendor invoices, insurance certificates) under most audit rights clauses. Respond promptly - delays escalate to formal dispute letters.",
        ],
      },
      {
        month: "May",
        tasks: [
          "Handle any formal CAM dispute letters received from tenants or their auditors. Log the dispute date - the response window is often contractual (30–60 days).",
          "Begin tracking current-year (FY 2026) actuals against the CAM budget established in Q4 of the prior year. Identify any line items tracking more than 15% above budget through April.",
          "Accrue recurring monthly CAM items: utility invoices with billing lags, insurance installments, property tax installments.",
        ],
      },
      {
        month: "June",
        tasks: [
          "Final deadline for statements with 180-day windows (June 30 for calendar-year leases). Any remaining calendar-year reconciliation statements not yet sent are now past the deadline under 180-day leases.",
          "Compile mid-year actuals vs. estimate variance report. Calculate year-to-date actuals as a percentage of the annual estimate to identify properties likely to require a mid-year estimate adjustment.",
        ],
      },
    ],
  },
  {
    label: "Q3: July – September",
    description:
      "Mid-year estimate review and current-year actuals monitoring. Catch variances before they become year-end surprises.",
    months: [
      {
        month: "July",
        tasks: [
          "Mid-year review: compare H1 actuals to the full-year budget for each property. If H1 actuals exceed 55% of the annual budget (suggesting full-year costs will exceed budget by more than 10%), flag for estimate adjustment.",
          "For properties with material variance (>15% above budget), prepare revised annual CAM estimate calculations. The revised estimate becomes the basis for updated monthly payments in H2.",
        ],
      },
      {
        month: "August",
        tasks: [
          "Issue revised estimate letters to tenants where the mid-year review identified material variance. Most leases permit mid-year estimate adjustments; some require them when variance exceeds a stated threshold.",
          "Update the monthly CAM payment schedule for tenants receiving revised estimates. Confirm that the property management system reflects the new monthly amounts.",
          "Continue monthly accrual of recurring CAM items. Do not let accruals slip during the summer months - a catch-up in December overstates a single period's expenses.",
        ],
      },
      {
        month: "September",
        tasks: [
          "Begin Q4 budget preparation for the following year. Pull year-to-date actuals and current-year contracts (utility rates, insurance renewals, property tax assessments) to build the FY 2027 CAM budget.",
          "Review which vendor contracts are up for renewal before year-end and may affect next year's CAM budget significantly.",
        ],
      },
    ],
  },
  {
    label: "Q4: October – December",
    description:
      "Budget finalization, estimate letter preparation, and setup for the next reconciliation cycle.",
    months: [
      {
        month: "October",
        tasks: [
          "Finalize the FY 2027 CAM budget by property. Use a bottom-up approach: actual prior-year costs + inflation + known contract changes + anticipated capital maintenance (if lease permits amortized recovery) + management fee at the budgeted rate.",
          "For properties with CAM caps: calculate whether the FY 2027 budget increase exceeds the cap rate (typically CPI + 1% to CPI + 3% for controllable expenses). Document cap calculations in the budget file.",
          "Begin lease abstractions for any new leases executed in the current year. Verify CAM cap base years, gross-up thresholds, management fee limits, and estimate deadline requirements before the new lease year begins.",
        ],
      },
      {
        month: "November",
        tasks: [
          "Generate estimate letters for all tenants for the FY 2027 year. Most leases require estimate letters to be delivered 30–60 days before the new lease year begins. For January 1 start dates, November 1 – December 1 is the target delivery window.",
          "Verify the estimate letter format required by each lease. Some leases require a breakdown of estimated expenses by category; others require only the total estimated monthly amount.",
          "For multi-tenant properties: confirm that per-tenant estimated monthly amounts reflect each tenant's current pro-rata share denominator, not a stale figure from a prior year.",
        ],
      },
      {
        month: "December",
        tasks: [
          "Final delivery of FY 2027 estimate letters for any leases requiring 30-day advance notice. Deadline: December 31 for leases with 30-day requirements.",
          "Set up monthly CAM accrual schedule for FY 2027 in the property management system.",
          "Document the prior year (FY 2026) reconciliation file: GL export, gross-up calculations, cap calculations, management fee verification, tenant pro-rata shares, statement delivery confirmation log. This file is your audit defense if a tenant invokes audit rights in 2027.",
          "Monthly task: Accrue December utility invoices (which often arrive in January), insurance installments, and property tax installments to ensure the December close is complete.",
        ],
      },
    ],
  },
];

export default function CAMCloseCalendarPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <nav className="text-sm text-muted-foreground mb-4">
            <Link
              href="/resources"
              className="hover:text-foreground transition-colors duration-200"
            >
              Resources
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">CAM Close Calendar</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            CAM Close Calendar for Commercial Portfolios: 2026 Reconciliation
            Timeline
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            A month-by-month CAM calendar for property accounting teams - from
            year-end GL close through estimate letters for the next year.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              By{" "}
              <Link
                href="/about/angel-campa"
                className="text-foreground font-medium hover:text-primary transition-colors duration-200"
              >
                Angel Campa
              </Link>
              , Founder, CapVeri
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime="2026-04-26">Updated April 2026</time>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-3xl">
        {/* Quick answer */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-10">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Quick Answer
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Most commercial leases require annual CAM reconciliation statements
            to be sent within 90–180 days after the lease year ends. For
            calendar-year leases, that means statements are due between March 31
            and June 30. Miss the deadline and tenants may argue you have waived
            the true-up. Estimate letters for the new year are typically due
            30–60 days before the new lease year begins - November or December
            for January 1 starts.
          </p>
        </div>

        {/* Quarterly calendar */}
        {quarters.map((quarter) => (
          <section key={quarter.label} className="mb-12">
            <div className="flex items-center gap-3 mb-3">
              <Calendar className="h-5 w-5 text-primary shrink-0" />
              <h2 className="text-xl font-bold text-foreground">
                {quarter.label}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              {quarter.description}
            </p>
            <div className="space-y-4">
              {quarter.months.map((m) => (
                <div
                  key={m.month}
                  className="rounded-lg border border-border overflow-hidden"
                >
                  <div className="bg-muted px-4 py-2 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">
                      {m.month}
                    </p>
                  </div>
                  <ul className="divide-y divide-border">
                    {m.tasks.map((task, i) => (
                      <li
                        key={i}
                        className="px-4 py-3 text-sm text-muted-foreground leading-relaxed"
                      >
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Monthly recurring tasks */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Monthly Recurring Tasks (Every Month)
          </h2>
          <div className="rounded-lg border border-border p-5">
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="leading-relaxed">
                <strong className="text-foreground">
                  Accrue recurring CAM items
                </strong>{" "}
                - utilities (with billing lag), insurance installments, property
                tax installments, management fee accruals. Consistent monthly
                accrual prevents December catch-up entries that spike the
                year-end GL and draw tenant scrutiny.
              </li>
              <li className="leading-relaxed">
                <strong className="text-foreground">
                  Track vendor invoices against contracts
                </strong>{" "}
                - verify that recurring vendor invoices (landscaping,
                janitorial, security) match the contracted rates. Invoice creep
                - vendors billing above contract - is common and easiest to
                catch monthly.
              </li>
              <li className="leading-relaxed">
                <strong className="text-foreground">
                  Review any new capital work orders
                </strong>{" "}
                - flag any new vendor contracts or purchase orders for work that
                may be capital in nature before the first invoice arrives in the
                GL.
              </li>
            </ul>
          </div>
        </section>

        {/* What can go wrong */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            What Can Go Wrong
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Reconciliation statements sent after the lease deadline
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A portfolio with 80 tenants sends reconciliation statements
                    in stages - the largest true-ups go first, smaller tenants
                    wait until April or May. Several leases have 90-day
                    deadlines (March 31). The late statements arrive in May.
                    Three tenants with institutional counsel refuse to pay the
                    true-up, citing the waiver provision. The landlord recovers
                    nothing on those three accounts - approximately $47,000 in
                    lost true-up revenue - because of a scheduling problem, not
                    a math problem.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    No tracking of per-tenant statement delivery dates
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A landlord sends reconciliation statements via email and
                    standard mail but does not log delivery dates. When a tenant
                    disputes the true-up and claims the statement was delivered
                    after the lease deadline, the landlord has no delivery
                    confirmation to rebut the claim. Even if the statement was
                    timely, the lack of a delivery log leaves the landlord in a
                    disadvantaged position in any subsequent dispute proceeding.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Estimate letters missed for the new year
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A property management transition in October means estimate
                    letters for the new year are not issued. The new year begins
                    with tenants continuing to pay prior-year monthly CAM
                    amounts. In a year where insurance and utility costs rose
                    18%, the undercollection compounds monthly. When the
                    year-end reconciliation reveals a large true-up, tenants
                    dispute it - arguing the landlord had an obligation to
                    update estimates and failed to do so. Some leases support
                    this argument.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                How long do landlords have to send CAM reconciliation
                statements?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Most leases require statements within 90 to 180 days after the
                lease year ends. For calendar-year leases, that is March 31 to
                June 30. The specific deadline is in each lease - always verify
                per tenant rather than assuming a portfolio-wide standard.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What happens if a landlord misses the statement deadline?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The consequence depends on lease language. Many leases treat
                late statements as waived - tenants&apos; estimate payments are
                deemed final. Tenants with institutional representation will
                invoke these provisions. Even without explicit waiver language,
                late statements create collection difficulties and invite
                dispute proceedings.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                When should CAM estimate letters be sent for the new year?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Most leases require 30–60 days&apos; advance notice before the
                new lease year. For January 1 starts: November 1 (60-day
                requirement) to December 1 (30-day requirement). Send them all
                by November 30 as a practical portfolio standard.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                When is a mid-year estimate adjustment required?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Some leases require adjustment when actuals exceed estimates by
                more than 10–15%. Others permit but do not require it. As a
                practical matter, issuing revised estimates when H1 actuals
                suggest full-year costs will exceed the budget by more than 10%
                reduces year-end true-up amounts and prevents large lump-sum
                collections.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Related Resources
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                title: "CAM Reconciliation Deadlines",
                href: "/resources/cam-reconciliation-deadlines",
                description:
                  "Lease deadline tracking and waiver risk for CAM statements",
              },
              {
                title: "CAM Close Checklist",
                href: "/resources/cam-close-checklist",
                description:
                  "Step-by-step checklist for year-end CAM reconciliation",
              },
              {
                title: "CAM Reconciliation Process",
                href: "/resources/cam-reconciliation-process",
                description:
                  "End-to-end overview of the CAM reconciliation workflow",
              },
              {
                title: "Month-End CAM Controls",
                href: "/resources/month-end-cam-controls",
                description:
                  "Controls for monthly CAM accruals and expense tracking",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Automate the CAM reconciliation calendar with deadline tracking",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <p className="font-medium group-hover:text-primary text-sm">
                  {link.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {link.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground text-background p-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            Never Miss a Reconciliation Deadline Again
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri tracks per-tenant reconciliation deadlines and estimate
            letter windows so your team knows exactly when each statement needs
            to go out - and when you are at risk of a waiver.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "cam_close_calendar_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
