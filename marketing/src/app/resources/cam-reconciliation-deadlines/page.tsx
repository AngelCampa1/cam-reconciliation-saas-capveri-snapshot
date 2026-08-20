import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  FileText,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import {
  structuredDataSchemas,
  AUTHOR_ANGEL_CAMPA,
} from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "CAM Reconciliation Deadlines and Notice Windows: What Landlords Risk by Missing Them",
  description:
    "Missing CAM reconciliation statement deadlines can cost landlords their right to collect true-up payments. Here are the critical deadlines, how to track them, and what happens when they're missed.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-reconciliation-deadlines`,
  },
  openGraph: {
    title:
      "CAM Reconciliation Deadlines and Notice Windows: What Landlords Risk by Missing Them",
    description:
      "Missing CAM reconciliation statement deadlines can cost landlords their right to collect true-up payments. Here are the critical deadlines, how to track them, and what happens when they're missed.",
    url: `${SITE_URL}/resources/cam-reconciliation-deadlines`,
    type: "article",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "CAM Reconciliation Deadlines and Notice Windows: What Landlords Risk by Missing Them",
  description:
    "Missing CAM reconciliation statement deadlines can cost landlords their right to collect true-up payments.",
  url: `${SITE_URL}/resources/cam-reconciliation-deadlines`,
  datePublished: "2026-04-01",
  dateModified: "2026-04-26",
  author: AUTHOR_ANGEL_CAMPA,
  publisher: structuredDataSchemas.organization,
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What happens if a landlord misses the CAM reconciliation statement deadline?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "If the lease includes an explicit deadline with a waiver provision, missing it can extinguish the landlord's right to collect that year's true-up entirely. Courts in several jurisdictions have enforced these waivers strictly. Even without an explicit waiver clause, extreme delays of multiple years have led courts to find constructive waiver. The safest outcome of missing a deadline is a tenant dispute; the worst is losing the receivable.",
      },
    },
    {
      "@type": "Question",
      name: "How do I find the CAM statement deadline in my lease?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Search your lease for these clause headings: 'Expense Statement,' 'Annual Statement,' 'Reconciliation Statement,' 'Operating Expense Statement,' or 'Year-End Statement.' The deadline is typically expressed as a number of days after the lease year ends (e.g., 'within 120 days after the end of each calendar year'). Some leases also include a waiver provision in the same clause.",
      },
    },
    {
      "@type": "Question",
      name: "Does a tenant's audit right expire?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Most commercial leases give tenants 12 to 24 months from the date the reconciliation statement is delivered to exercise their audit right. After that window closes, the tenant typically loses the contractual right to audit, though they may still raise disputes based on fraud or material misrepresentation.",
      },
    },
    {
      "@type": "Question",
      name: "What is the typical deadline for sending CAM estimate letters for the new lease year?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most leases require the estimate letter to be sent 30 to 60 days before the start of the new lease year. If the landlord misses this deadline, tenants may argue they can continue paying the prior year's estimate rate, or in some leases, withhold estimate payments entirely until a compliant estimate letter is delivered.",
      },
    },
  ],
};

export default function CamReconciliationDeadlinesPage() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
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
          <span className="text-foreground">CAM Reconciliation Deadlines</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Reconciliation Deadlines and Notice Windows: What Landlords Risk
            by Missing Them
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Most commercial leases require CAM statements within 90–180 days of
            the lease year end. Missing this window can permanently waive your
            right to collect. Most property management teams do not track these
            dates systematically.
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
            Most commercial leases require CAM reconciliation statements within
            90 to 180 days after the lease year ends. Missing this deadline may
            constitute a waiver of the landlord&apos;s right to collect a
            true-up payment, depending on lease language and jurisdiction. The
            risk is real, measurable, and entirely avoidable with a systematic
            deadline-tracking process.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The 4 Critical CAM Deadlines
          </h2>
          <p className="mb-6 text-muted-foreground">
            A CAM reconciliation year has four distinct deadline events. Each
            one creates specific contractual risk if missed. The first is the
            most dangerous.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">
                    Deadline
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Typical Window
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Risk if Missed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Reconciliation statement delivery
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    90–180 days after lease year end
                  </td>
                  <td className="px-4 py-3 text-destructive-strong">
                    Waiver of true-up collection right
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    True-up payment due date
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    30–60 days after statement delivery
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Late payment fees; tenant dispute window opens
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Tenant audit right window
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    12–24 months after statement delivery
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Tenant loses contractual audit right
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Estimate letter for new lease year
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    30–60 days before new lease year starts
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Tenant may withhold estimates or continue prior rate
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 space-y-8">
            <div>
              <h3 className="mb-3 text-xl font-semibold">
                1. Reconciliation Statement Deadline: The Waiver Risk
              </h3>
              <p className="mb-4 text-muted-foreground">
                This is the deadline most landlords underestimate. If your lease
                says the reconciliation statement must be delivered &quot;within
                120 days after the end of each calendar year,&quot; that means
                April 30 for a December 31 lease year, not &quot;sometime in
                Q2.&quot;
              </p>
              <p className="mb-4 text-muted-foreground">
                Waiver provisions vary significantly by lease. Some are
                explicit: &quot;If Landlord fails to deliver the statement
                within the required period, Landlord shall be deemed to have
                waived its right to collect any deficiency for that year.&quot;
                Others are implicit: the lease states a deadline without a
                stated consequence, but courts have still found waiver when
                delays were extreme.
              </p>
              <p className="text-muted-foreground">
                The stakes depend on your portfolio. A $50,000 average true-up
                across 30 tenants equals $1.5M in annual receivables. Missing
                the statement deadline on even five of those tenants (because a
                portfolio manager was tracking dates in a spreadsheet that
                broke) can cost $250,000 in a single year.
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-xl font-semibold">
                2. True-Up Payment Due Date: Late Fees and Dispute Windows
              </h3>
              <p className="mb-4 text-muted-foreground">
                Once the statement is delivered, the tenant typically has 30 to
                60 days to pay the true-up amount. This deadline matters less
                for waiver risk, but it determines when late payment interest
                begins to accrue and when you can treat non-payment as a lease
                default.
              </p>
              <p className="text-muted-foreground">
                Many leases also specify that a tenant must raise any dispute
                within this payment window (or within a few weeks of it). If you
                deliver the statement late, the tenant&apos;s dispute window
                shifts accordingly, giving them more time to prepare a
                challenge.
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-xl font-semibold">
                3. Tenant Audit Right Window: The Clock Runs Both Ways
              </h3>
              <p className="mb-4 text-muted-foreground">
                Tenant audit rights expire. Most leases give tenants 12 to 24
                months from the date the reconciliation statement is delivered
                to exercise the right to audit. Delivering your statement on
                time starts the clock. That works in your favor.
              </p>
              <p className="text-muted-foreground">
                If you delay delivering the statement, you delay the expiration
                of the audit window. A tenant who receives a statement 9 months
                late gets to audit that year&apos;s expenses well into year
                three. Timely delivery compresses the dispute exposure period.
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-xl font-semibold">
                4. Estimate Letter Deadline: The Upfront Cash Flow Risk
              </h3>
              <p className="mb-4 text-muted-foreground">
                Before the new lease year starts, landlords must send an
                estimate letter specifying the monthly CAM estimate for the
                coming year. Most leases require this 30 to 60 days before the
                new year begins. For a January 1 lease year, that means the
                letter goes out in November or early December.
              </p>
              <p className="text-muted-foreground">
                If you miss this deadline, some leases allow the tenant to
                continue paying the prior year&apos;s estimate rate. Others
                grant the tenant the right to withhold estimates entirely until
                a compliant letter is delivered. Either way, you&apos;re
                carrying the gap.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            How to Read Your Lease for Deadlines
          </h2>
          <p className="mb-4 text-muted-foreground">
            CAM deadline provisions are buried in operating expense clauses, not
            in a dedicated &quot;deadlines&quot; section. Here is what to search
            for in your lease abstract or full document:
          </p>
          <div className="space-y-3">
            {[
              {
                term: "Expense Statement",
                context:
                  "The most common clause heading for reconciliation statement delivery requirements",
              },
              {
                term: "Annual Statement",
                context:
                  "Used interchangeably with Expense Statement in many retail and industrial leases",
              },
              {
                term: "Reconciliation Statement",
                context:
                  "More explicit language - also look for the word 'reconcile' within operating expense sections",
              },
              {
                term: "Operating Expense Statement",
                context:
                  "Common in office leases, particularly those using base-year or expense-stop structures",
              },
              {
                term: "Estimate Notice",
                context:
                  "Look for this when tracking the estimate letter requirement for the new lease year",
              },
            ].map(({ term, context }) => (
              <div
                key={term}
                className="flex items-start gap-3 rounded-lg border p-4"
              >
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">&ldquo;{term}&rdquo;</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {context}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-muted-foreground">
            Once you find the relevant clause, capture three things: (1) the
            number of days allowed after lease year end, (2) whether there is an
            explicit waiver provision, and (3) whether the tenant&apos;s
            response or dispute window is tied to statement delivery date.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Waiver by Delay: The Legal Landscape
          </h2>
          <p className="mb-4 text-muted-foreground">
            Courts in several jurisdictions, including California and New York,
            have enforced CAM statement waiver provisions strictly when leases
            contain explicit deadline-and-waiver language. The principle is
            straightforward: if the landlord negotiated a provision into the
            lease and then failed to comply with it, they cannot claim the
            benefit it was designed to protect.
          </p>
          <p className="mb-4 text-muted-foreground">
            Even without explicit waiver language, extreme delays have created
            problems. Courts have applied equitable doctrines (estoppel, laches)
            when landlords attempted to collect true-ups several years after the
            fact. A landlord who sends a 2022 CAM statement in 2025 may face a
            credible argument that the tenant adjusted their financial planning
            in reliance on the landlord&apos;s inaction.
          </p>
          <p className="text-muted-foreground">
            The law varies substantially by state and by lease. This is not
            legal advice. Consult your attorney about the specific provisions in
            your leases and how your jurisdiction treats waiver. The operational
            point is: do not rely on the law being forgiving. Track your
            deadlines and hit them.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Managing Deadlines Across a Multi-Tenant Portfolio
          </h2>
          <p className="mb-4 text-muted-foreground">
            A 50-tenant portfolio does not have 50 deadlines. It has many more.
            Each tenant may have a different lease year end date, a different
            statement delivery window, a different audit right window, and a
            different estimate letter timing. The result is a rolling calendar
            of obligations that repeats every year.
          </p>

          <div className="rounded-lg border bg-muted/30 p-6">
            <h3 className="mb-4 font-semibold">
              Example: Three Tenants, Three Deadline Profiles
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left font-medium">Tenant</th>
                    <th className="pb-2 text-left font-medium">
                      Lease Year End
                    </th>
                    <th className="pb-2 text-left font-medium">
                      Statement Due
                    </th>
                    <th className="pb-2 text-left font-medium">Audit Window</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2">Tenant A</td>
                    <td className="py-2">December 31</td>
                    <td className="py-2">March 31 (90 days)</td>
                    <td className="py-2">24 months from delivery</td>
                  </tr>
                  <tr>
                    <td className="py-2">Tenant B</td>
                    <td className="py-2">June 30</td>
                    <td className="py-2">October 31 (120 days)</td>
                    <td className="py-2">12 months from delivery</td>
                  </tr>
                  <tr>
                    <td className="py-2">Tenant C</td>
                    <td className="py-2">March 31</td>
                    <td className="py-2">September 30 (180 days)</td>
                    <td className="py-2">18 months from delivery</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-muted-foreground">
            A spreadsheet can manage this at five properties. At fifty, it
            becomes a liability. Leases get amended. Lease year end dates
            change. Teams turn over. The spreadsheet stops being maintained and
            someone misses April 30 because they thought it was June 30.
          </p>
          <p className="mt-4 text-muted-foreground">
            The systematic solution is to abstract every lease&apos;s deadline
            data during onboarding, store it in a single source of truth, and
            generate deadline alerts automatically from the lease terms, not
            from calendar reminders.
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
                    Tracking statement deadlines in lease summaries that are
                    never reviewed
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Most property management systems store lease data but do not
                    actively surface upcoming CAM deadlines. A lease abstract
                    sitting in a file drawer does not generate alerts. Teams
                    miss deadlines not because they don&apos;t know the rules
                    but because no system is monitoring them.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Assuming all leases use calendar-year lease years
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Many retail tenants have fiscal year lease years ending June
                    30 or September 30. If your reconciliation workflow is built
                    around January 1 year-ends, you may be systematically late
                    on every non-calendar lease year without realizing it.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Delivering statements by email without confirming delivery
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If your lease requires delivery by certified mail or
                    overnight courier, an email does not meet the notice
                    requirement, even if the tenant reads it. Confirming
                    delivery method per lease notice provisions is a checklist
                    step that is frequently skipped.
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
                What happens if a landlord misses the CAM reconciliation
                statement deadline?
              </h3>
              <p className="text-muted-foreground">
                If the lease includes an explicit deadline with a waiver
                provision, missing it can extinguish the landlord&apos;s right
                to collect that year&apos;s true-up entirely. Courts in several
                jurisdictions have enforced these waivers strictly. Even without
                an explicit waiver clause, extreme delays have led courts to
                find constructive waiver. The safest outcome of missing a
                deadline is a tenant dispute; the worst is losing the
                receivable.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How do I find the CAM statement deadline in my lease?
              </h3>
              <p className="text-muted-foreground">
                Search your lease for these clause headings: &quot;Expense
                Statement,&quot; &quot;Annual Statement,&quot;
                &quot;Reconciliation Statement,&quot; &quot;Operating Expense
                Statement,&quot; or &quot;Year-End Statement.&quot; The deadline
                is typically expressed as a number of days after the lease year
                ends. Some leases also include a waiver provision in the same
                clause.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Does a tenant&apos;s audit right expire?
              </h3>
              <p className="text-muted-foreground">
                Yes. Most commercial leases give tenants 12 to 24 months from
                the date the reconciliation statement is delivered to exercise
                their audit right. After that window closes, the tenant
                typically loses the contractual right to audit, though they may
                still raise disputes based on fraud or material
                misrepresentation.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the typical deadline for sending CAM estimate letters
                for the new lease year?
              </h3>
              <p className="text-muted-foreground">
                Most leases require the estimate letter to be sent 30 to 60 days
                before the start of the new lease year. If the landlord misses
                this deadline, tenants may argue they can continue paying the
                prior year&apos;s estimate rate, or in some leases, withhold
                estimate payments entirely until a compliant estimate letter is
                delivered.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/cam-reconciliation-process",
                title: "CAM Reconciliation Process",
                desc: "The full 7-step workflow from GL export to true-up collection",
              },
              {
                href: "/resources/cam-close-calendar",
                title: "CAM Close Calendar",
                desc: "Month-by-month timeline for year-end reconciliation",
              },
              {
                href: "/resources/cam-demand-letter-workflow",
                title: "CAM Demand Letter Workflow",
                desc: "How to collect past-due true-up payments without losing the tenant",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How CapVeri tracks deadlines and automates statement delivery",
              },
            ].map(({ href, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Stop Tracking Deadlines in Spreadsheets
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri abstracts deadline data from your leases and generates
            alerts before each statement window closes so you never miss a
            reconciliation deadline.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_deadlines_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
