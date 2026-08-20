import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Q1 2026 Office Vacancy Rates and CAM Gross-Up Implications",
  description:
    "Office vacancy hit 19.8% nationally in Q1 2026 (CBRE). Here is what that means for CAM gross-up calculations, expense pools, and how landlords can prevent revenue leakage.",
  alternates: {
    canonical: `${SITE_URL}/resources/q1-2026-office-vacancy-cam-gross-up`,
  },
  openGraph: {
    title: "Q1 2026 Office Vacancy Rates and CAM Gross-Up Implications",
    description:
      "Office vacancy hit 19.8% nationally in Q1 2026 (CBRE). Here is what that means for CAM gross-up calculations, expense pools, and how landlords can prevent revenue leakage.",
    url: `${SITE_URL}/resources/q1-2026-office-vacancy-cam-gross-up`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "Does high office vacancy automatically trigger the gross-up provision?",
    answer:
      "Only if occupancy drops below the gross-up threshold stated in the lease (typically 90% or 95%). At 19-20% national vacancy, many buildings are below threshold, but you must verify each lease individually. If the threshold is 90% and the building is 81% occupied, gross-up applies. If the threshold is 80%, it does not.",
  },
  {
    question:
      "Which expenses should be grossed up in a high-vacancy office building?",
    answer:
      "Only variable expenses (costs that increase with occupancy) should be grossed up. In an office building these include: janitorial (varies by occupied SF), HVAC operating costs (usage-driven), and trash removal. Fixed costs like property insurance premiums, security system monitoring fees, and roof repairs should never be grossed up. The misclassification of fixed costs as variable is one of the most common errors in high-vacancy gross-up scenarios.",
  },
  {
    question:
      "How does the gross-up denominator change when vacancy is elevated?",
    answer:
      "The denominator in the gross-up calculation (the RSF figure used to convert total expenses to a per-SF rate) should be the total rentable SF of the building, not the occupied SF. At 75% occupancy, dividing actual variable expenses by 75% of RSF and then multiplying by a tenant's pro-rata share still results in underrecovery unless the numerator is also grossed up. Both numerator (expense) and denominator treatment must be internally consistent with the lease definition.",
  },
  {
    question:
      "If a major anchor tenant vacated mid-year, how does that affect the gross-up calculation?",
    answer:
      "Mid-year vacancy changes require a time-weighted average occupancy calculation for the gross-up. If the building was 92% occupied from January through June and dropped to 74% occupied July through December when the anchor vacated, the full-year average is approximately 83%. That may or may not breach the lease threshold depending on the specific language. Some leases use end-of-year occupancy rather than average; check the lease definition carefully.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: "/" },
  { name: "Resources", url: "/resources" },
  {
    name: "Q1 2026 Office Vacancy and CAM Gross-Up",
    url: "/resources/q1-2026-office-vacancy-cam-gross-up",
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "Q1 2026 Office Vacancy Rates and CAM Gross-Up Implications",
  description:
    "Office vacancy hit 19.8% nationally in Q1 2026 (CBRE). Here is what that means for CAM gross-up calculations, expense pools, and how landlords can prevent revenue leakage.",
  url: `${SITE_URL}/resources/q1-2026-office-vacancy-cam-gross-up`,
  datePublished: "2026-04-01",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  wordCount: 1200,
  articleSection: "Market Analysis",
});

export default function OfficeVacancyGrossUpPage() {
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
            Q1 2026 Office Vacancy and CAM Gross-Up
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Q1 2026 Office Vacancy Rates and CAM Gross-Up Implications
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            National office vacancy reached approximately 19.8% in Q1 2026. Here
            is what elevated vacancy means for gross-up calculations, variable
            expense classification, and how to avoid silent revenue leakage on
            your reconciliation.
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
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            With national office vacancy averaging approximately 19–20% in early
            2026, landlords with gross-up provisions in their leases must apply
            those provisions carefully. The higher the vacancy, the larger the
            gap between actual variable expenses and what the lease entitles you
            to recover. The two critical tasks: correctly classify which
            expenses are truly variable (not just "feel" variable), and confirm
            your lease&apos;s gross-up threshold is actually breached before
            applying the adjustment. Misapplying gross-up to fixed expenses, or
            failing to apply it to variable ones, creates exposure on both sides
            of the reconciliation.
          </p>
        </div>

        {/* Market context */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Where Office Vacancy Stands in Q1 2026
          </h2>
          <p className="mb-4 text-muted-foreground">
            Office market conditions heading into 2026 remain under structural
            pressure from hybrid work adoption and lease expirations that began
            accumulating in 2022. National vacancy is tracking near 20%, the
            highest level in several decades, and the distribution is uneven.
            Suburban office has fared somewhat better in select Sun Belt
            markets, while CBD vacancy in gateway cities like San Francisco,
            Chicago, and parts of Manhattan remains elevated well above 20% in
            certain submarkets.
          </p>
          <p className="mb-4 text-muted-foreground">
            For CAM purposes, the absolute vacancy number matters less than one
            specific comparison: whether your building&apos;s occupancy is below
            the gross-up threshold specified in each tenant&apos;s lease. Most
            office leases written in the 2000s through mid-2010s used a 90% or
            95% gross-up threshold. A building at 78% occupied is well below
            either threshold. A building at 88% occupied may be below a 90%
            threshold but above an 85% one.
          </p>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <strong>Data methodology:</strong> Office vacancy figures referenced
            on this page are sourced from the CBRE Q1 2026 North America Office
            Figures report. Individual market, submarket, and building-class
            data varies significantly from national averages. Figures cited here
            are approximate and should not be used as the sole basis for any
            financial calculation or lease decision.
          </div>
        </section>

        {/* What elevated vacancy means for gross-up math */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What Elevated Vacancy Does to the Gross-Up Calculation
          </h2>
          <p className="mb-4 text-muted-foreground">
            The gross-up provision exists to protect landlords from
            vacancy-driven expense underrecovery. When a building is partially
            occupied, variable expenses (janitorial, HVAC operating costs, some
            utilities) are lower than they would be at full occupancy. Without
            gross-up, the landlord recovers only a fraction of what expenses
            would be at the threshold occupancy level.
          </p>
          <p className="mb-4 text-muted-foreground">
            At 19-20% national vacancy, the gap between actual expenses and
            grossed-up expenses is large enough to move the needle materially.
            Consider a 100,000 RSF office building at 75% occupied (25,000 SF
            vacant) with variable operating expenses of $400,000 per year. A
            gross-up to 90% occupancy would adjust those expenses to
            approximately $480,000, an increase of $80,000 in the recoverable
            pool. Distributed across the occupied tenants on a pro-rata basis,
            that is $0.80/SF in additional recovery per year. Over a five-year
            lease, that is $4.00/SF, or $80,000 for a 20,000 SF tenant. Failing
            to apply the gross-up does not reduce the landlord&apos;s cost; it
            simply shifts that cost to unrecovered NOI.
          </p>

          {/* Worked example */}
          <div className="mb-6 rounded-xl border p-6">
            <div className="mb-3 flex items-center gap-2">
              <BarChart className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">
                Worked Example: 75% Occupied Building, 90% Gross-Up Threshold
              </h3>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="grid grid-cols-2 gap-x-4 border-b pb-2">
                <span>Building RSF</span>
                <span className="font-medium text-foreground">100,000 SF</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 border-b pb-2">
                <span>Actual occupancy</span>
                <span className="font-medium text-foreground">
                  75% (75,000 SF occupied)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 border-b pb-2">
                <span>Gross-up threshold (per lease)</span>
                <span className="font-medium text-foreground">90%</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 border-b pb-2">
                <span>Actual variable expenses</span>
                <span className="font-medium text-foreground">$400,000</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 border-b pb-2">
                <span>Grossed-up variable expenses (÷ 0.75 × 0.90)</span>
                <span className="font-medium text-foreground">$480,000</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 border-b pb-2">
                <span>Fixed expenses (not grossed up)</span>
                <span className="font-medium text-foreground">$200,000</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 pt-2">
                <span className="font-semibold text-foreground">
                  Total recoverable pool
                </span>
                <span className="font-semibold text-foreground">$680,000</span>
              </div>
            </div>
          </div>
        </section>

        {/* Variable vs. fixed classification */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Determining Variable vs. Fixed Expenses at High Vacancy
          </h2>
          <p className="mb-4 text-muted-foreground">
            Variable expense classification becomes more consequential when
            vacancy is elevated because the gross-up adjustment is
            proportionally larger. A common error is to use the same
            variable/fixed split that was established when the building was 95%
            occupied, when the distinction was effectively academic.
          </p>
          <p className="mb-4 text-muted-foreground">
            At 75% occupancy, you must revisit each expense category:
          </p>
          <ul className="mb-4 space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <TrendingUp className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  Janitorial and cleaning:
                </strong>{" "}
                Variable. Costs scale with occupied SF and frequency of use.
                Grossing up is appropriate.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TrendingUp className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  HVAC operating and maintenance:
                </strong>{" "}
                Partially variable. Operating costs scale with occupied zones;
                capital maintenance and preventative contracts are fixed. Split
                carefully.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TrendingUp className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  Property insurance premiums:
                </strong>{" "}
                Fixed. The premium is assessed on the insured value of the
                structure, not on occupancy. Never gross up insurance.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TrendingUp className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  Security and access control:
                </strong>{" "}
                Typically fixed. A monitoring contract does not change when half
                the building is dark.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TrendingUp className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  Common area utilities (lobbies, corridors):
                </strong>{" "}
                Fixed. These spaces are maintained regardless of occupancy.
              </span>
            </li>
          </ul>
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
                    Gross-up applied to fixed utility base charges
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some landlords gross up the entire utility line (including
                    the fixed demand charges, meter fees, and common area
                    allocations) rather than only the occupancy-driven
                    consumption component. In a high-vacancy building, this
                    error can overstate the grossed-up expense pool by
                    $0.30–$0.60/SF, creating tenant dispute exposure when the
                    reconciliation is audited.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Variable classification based on prior year when building
                    was 95% occupied
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A property manager who established the variable/fixed split
                    when the building was near-fully occupied may not revisit
                    that classification after a major tenant departure. Expenses
                    like cleaning contracts may have been renegotiated to a flat
                    fee once the occupied area shrank, making them effectively
                    fixed, while still being grossed up as variable. The
                    classification should be reviewed each reconciliation year.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Gross-up threshold wrong in multi-tenant building with
                    anchor vacancy
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In a multi-tenant building, individual leases may have
                    different gross-up thresholds negotiated at different market
                    cycles. If the anchor tenant that vacated held 30% of the
                    building, the building occupancy may now sit at 70%, below
                    every threshold. A property manager applying a single
                    building-wide gross-up threshold (pulled from the most
                    recent lease) rather than checking each tenant&apos;s
                    individual threshold is applying the wrong standard to some
                    tenants.
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
                Does high office vacancy automatically trigger the gross-up
                provision?
              </h3>
              <p className="text-sm text-muted-foreground">
                Only if occupancy drops below the gross-up threshold stated in
                the lease (typically 90% or 95%). At 19-20% national vacancy,
                many buildings are below threshold, but you must verify each
                lease individually. If the threshold is 90% and the building is
                81% occupied, gross-up applies. If the threshold is 80%, it does
                not.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Which expenses should be grossed up in a high-vacancy office
                building?
              </h3>
              <p className="text-sm text-muted-foreground">
                Only variable expenses (costs that increase with occupancy).
                These include janitorial, HVAC operating costs, and
                occupancy-driven utilities. Fixed costs like property insurance
                premiums, security system monitoring fees, and roof repairs
                should never be grossed up. Misclassifying fixed costs as
                variable is one of the most common errors in high-vacancy
                gross-up scenarios.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How does the gross-up denominator change when vacancy is
                elevated?
              </h3>
              <p className="text-sm text-muted-foreground">
                The denominator in the gross-up calculation (the RSF figure used
                to convert total expenses to a per-SF rate) should be the total
                rentable SF of the building, not the occupied SF. At 75%
                occupancy, dividing actual variable expenses by 75% of RSF and
                then multiplying by a tenant&apos;s pro-rata share still results
                in underrecovery unless the numerator is also grossed up. Both
                numerator and denominator treatment must be internally
                consistent with the lease definition.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                If a major anchor tenant vacated mid-year, how does that affect
                the gross-up calculation?
              </h3>
              <p className="text-sm text-muted-foreground">
                Mid-year vacancy changes require a time-weighted average
                occupancy calculation for the gross-up. If the building was 92%
                occupied from January through June and dropped to 74% occupied
                July through December when the anchor vacated, the full-year
                average is approximately 83%. That may or may not breach the
                lease threshold depending on the specific lease language. Some
                leases use end-of-year occupancy rather than average; always
                check the lease definition.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/gross-up-clause-explained"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">Gross-Up Clause Explained</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How gross-up provisions work and what to check in the lease
                language
              </p>
            </Link>
            <Link
              href="/resources/cam-gross-up-guide"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">CAM Gross-Up Guide</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Step-by-step methodology for calculating gross-up correctly
              </p>
            </Link>
            <Link
              href="/resources/office-cam-reconciliation"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">Office CAM Reconciliation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete guide to office property CAM reconciliation
              </p>
            </Link>
            <Link
              href="/tools/cam-gross-up-calculator"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">CAM Gross-Up Calculator</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Free tool to model gross-up at any occupancy level
              </p>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Is Your Gross-Up Calculation Right for 2026?
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri cross-checks your gross-up workpaper against each
            tenant&apos;s lease. It verifies variable classification, threshold
            occupancy, and denominator consistency. Upload your Yardi or MRI
            export and get findings in minutes.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "q1_2026_office_vacancy_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
