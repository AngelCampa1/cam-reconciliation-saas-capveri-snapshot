import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "Q1 2026 Industrial Vacancy and CAM Estimates: What Landlords Need to Know",
  description:
    "Industrial vacancy rose to 7.2% in Q1 2026 after years of sub-4% tightness. Here is how to update CAM estimates, review gross-up thresholds, and avoid over-collecting from tenants.",
  alternates: {
    canonical: `${SITE_URL}/resources/q1-2026-industrial-vacancy-cam-estimates`,
  },
  openGraph: {
    title:
      "Q1 2026 Industrial Vacancy and CAM Estimates: What Landlords Need to Know",
    description:
      "Industrial vacancy rose to 7.2% in Q1 2026 after years of sub-4% tightness. Here is how to update CAM estimates, review gross-up thresholds, and avoid over-collecting from tenants.",
    url: `${SITE_URL}/resources/q1-2026-industrial-vacancy-cam-estimates`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "Does rising industrial vacancy change what I can recover in CAM?",
    answer:
      "Not directly. The recoverable expense pool is determined by your leases, not by market vacancy. However, rising vacancy can push your building's occupancy below the gross-up threshold in some leases, which changes how expenses are presented on the reconciliation. For triple-net industrial leases, tenants pay their pro-rata share of actual expenses regardless of occupancy. Gross-up provisions are less common but do exist, particularly in newer leases.",
  },
  {
    question:
      "My 2026 CAM estimate letter was issued in November 2025 when the market was tighter. Do I need to reissue it?",
    answer:
      "If occupancy at your property has dropped below your gross-up threshold since the estimate was issued, the estimate may be understating what you are entitled to recover for 2026. Most leases do not require mid-year estimate revisions unless the variance exceeds a threshold (often 10-15%). However, you should document the variance now so the 2026 reconciliation settlement is accurate and defensible.",
  },
  {
    question:
      "What is the difference between a triple-net and modified gross industrial lease for CAM purposes?",
    answer:
      "In a triple-net (NNN) industrial lease, tenants pay their proportionate share of actual operating expenses directly. The landlord passes through all costs with minimal markup. In a modified gross or gross lease, the landlord includes a fixed CAM charge in the base rent and absorbs the variance from actual expenses. CAM estimate accuracy matters more in NNN leases because underpayment must be collected via reconciliation settlement, while a modified gross lease shifts the risk of expense variance to the landlord.",
  },
  {
    question:
      "A tenant vacated 40% of a flex industrial building in March. How does that affect the remaining tenants' CAM?",
    answer:
      "If the vacated space is not re-leased, the remaining tenants' pro-rata shares will increase. Each tenant now owns a larger percentage of the building's total RSF. This happens automatically if the lease uses the standard pro-rata calculation (tenant RSF / total building RSF). However, if the denominator is fixed in the lease (a specific RSF figure rather than a dynamic calculation), the remaining tenants' shares do not change. Review the lease language for each tenant before issuing revised bills.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: "/" },
  { name: "Resources", url: "/resources" },
  {
    name: "Q1 2026 Industrial Vacancy and CAM Estimates",
    url: "/resources/q1-2026-industrial-vacancy-cam-estimates",
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "Q1 2026 Industrial Vacancy and CAM Estimates: What Landlords Need to Know",
  description:
    "Industrial vacancy rose to 7.2% in Q1 2026 after years of sub-4% tightness. Here is how to update CAM estimates, review gross-up thresholds, and avoid over-collecting from tenants.",
  url: `${SITE_URL}/resources/q1-2026-industrial-vacancy-cam-estimates`,
  datePublished: "2026-04-01",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  wordCount: 1150,
  articleSection: "Market Analysis",
});

export default function IndustrialVacancyCamEstimatesPage() {
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
            Q1 2026 Industrial Vacancy and CAM Estimates
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Q1 2026 Industrial Vacancy and CAM Estimates: What Landlords Need to
            Know
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Industrial vacancy climbed to approximately 7% in Q1 2026, nearly
            double the historic lows of 3–4% that defined 2021–2023. For
            landlords who issued CAM estimate letters during the tight market,
            here is what needs to be reviewed before year-end reconciliation.
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
            Industrial CAM estimate letters issued in Q4 2025 for the 2026
            estimate period may have assumed occupancy levels from 2023–2024
            when vacancy was at historic lows. With rising vacancy, landlords
            should review whether gross-up thresholds are now triggered at their
            specific properties and update estimates accordingly. For properties
            where occupancy has dropped below the gross-up threshold since the
            estimate was issued, the current estimate may understate 2026
            recovery entitlement, creating a larger-than-expected reconciliation
            settlement at year-end.
          </p>
        </div>

        {/* Market context */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The Industrial Market Shift: From Historic Tightness to Rising
            Availability
          </h2>
          <p className="mb-4 text-muted-foreground">
            The industrial sector spent much of 2021–2023 at vacancy rates below
            4% nationally. During that period, CAM gross-up provisions were
            largely academic, since buildings were over-subscribed and gross-up
            thresholds were not being breached. Many landlords issued estimate
            letters in late 2024 and 2025 projecting occupancy levels consistent
            with that tight market.
          </p>
          <p className="mb-4 text-muted-foreground">
            The picture has changed. Supply that was started during the peak
            demand years has been delivering into a market where absorption has
            slowed. National industrial vacancy hit approximately 7% in Q1 2026,
            with markets like the Inland Empire (below 1% vacancy in 2022) now
            experiencing meaningfully higher availability. Chicago, Dallas, and
            Phoenix are also showing increased availability as new supply has
            outpaced net absorption.
          </p>
          <p className="mb-4 text-muted-foreground">
            For individual industrial properties, the question is not the market
            average but the specific occupancy of your building. A building that
            was 100% occupied through 2024 and lost a tenant in Q1 2026 may now
            sit at 65% occupancy, well below the gross-up threshold in leases
            that were written assuming sustained tightness.
          </p>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <strong>Data methodology:</strong> Industrial vacancy figures
            referenced here are based on market data from multiple commercial
            real estate research sources including CBRE and JLL Q1 2026 reports.
            Market-level figures represent directional trends; individual
            submarket and property-level vacancy will differ. These figures
            should not be used as the basis for specific lease or financial
            calculations.
          </div>
        </section>

        {/* How rising vacancy changes the estimate math */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How Rising Vacancy Changes the CAM Estimate Math
          </h2>
          <p className="mb-4 text-muted-foreground">
            CAM estimates are prospective. They represent what the landlord
            expects to recover in the current year, billed in equal monthly
            installments. For a triple-net industrial lease, those estimates are
            based on the tenant&apos;s pro-rata share of projected operating
            expenses.
          </p>
          <p className="mb-4 text-muted-foreground">
            When occupancy drops below the gross-up threshold, the math changes
            in two ways:
          </p>
          <ul className="mb-4 space-y-3 text-muted-foreground">
            <li className="flex items-start gap-2">
              <TrendingUp className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  Variable expenses must be grossed up in the estimate:
                </strong>{" "}
                Rather than projecting actual expenses at current occupancy, the
                estimate should reflect what variable expenses would be at the
                gross-up threshold. For an industrial building, the primary
                variable expense is typically janitorial/cleaning of occupied
                bays. At 65% occupancy vs. a 90% gross-up threshold, janitorial
                must be scaled up by a factor of roughly 1.38 in the grossed-up
                projection.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TrendingUp className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">
                  The pro-rata denominator may have changed:
                </strong>{" "}
                If the vacated space is being taken out of the denominator (some
                leases define pro-rata as tenant SF / occupied SF rather than
                tenant SF / total building SF), each remaining tenant&apos;s
                share has increased. An estimate that used the old pro-rata
                share is underbilling.
              </span>
            </li>
          </ul>

          {/* NNN vs. modified gross */}
          <h3 className="mb-3 text-xl font-semibold">
            Triple-Net vs. Modified Gross: Why the Distinction Matters Here
          </h3>
          <p className="mb-4 text-muted-foreground">
            In a pure triple-net industrial lease, the tenant pays actual
            expenses at their pro-rata share. No gross-up provision is typical,
            and the reconciliation reflects reality. In this structure, rising
            vacancy reduces the recoverable pool because actual variable
            expenses are genuinely lower when fewer bays are occupied. The
            landlord absorbs the unrecovered variable costs from vacant space.
          </p>
          <p className="mb-4 text-muted-foreground">
            In a modified gross industrial lease (more common in multi-tenant
            flex buildings), the landlord includes a fixed CAM charge in base
            rent. Rising vacancy may push actual expenses above the fixed
            charge, exposing the landlord to unrecovered cost increases. Some
            modified gross leases include expense stop provisions that cap the
            landlord&apos;s CAM absorption; others do not.
          </p>
          <p className="mb-4 text-muted-foreground">
            The practical takeaway: gross-up provisions are more likely in
            leases that were specifically negotiated to address occupancy risk -
            typically in multi-tenant industrial or flex buildings, and in
            leases written during softer markets. Review each lease individually
            rather than assuming all industrial leases follow the same
            structure.
          </p>
        </section>

        {/* Reviewing 2026 estimate letters */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Reviewing Your 2026 CAM Estimate Letters Now
          </h2>
          <p className="mb-4 text-muted-foreground">
            If your building&apos;s occupancy has changed materially since you
            issued 2026 estimate letters, a mid-year review is worth running
            even if you cannot or do not reissue the letters. The review serves
            two purposes: (1) it documents the variance for the year-end
            reconciliation, and (2) it tells you how large the settlement
            adjustment will be so you are not surprised.
          </p>
          <p className="mb-4 text-muted-foreground">
            For each affected property, compare: (a) the occupancy assumed in
            the estimate letter, (b) the actual current occupancy, (c) the
            gross-up threshold in each tenant&apos;s lease, and (d) whether that
            threshold is now breached. If it is, recalculate projected recovery
            at the grossed-up expense level and note the variance from what is
            currently being billed.
          </p>
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
                    Estimate letters that do not account for gross-up triggering
                    mid-year
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A property manager who issued estimates in November 2025
                    assuming 100% occupancy may not update the estimate when a
                    tenant departs in February 2026 and occupancy drops below
                    the gross-up threshold. The monthly billings continue at the
                    lower actual-expense level throughout the year, and at
                    year-end reconciliation the landlord issues a larger
                    settlement than tenants expected, often triggering disputes
                    and sometimes audit requests.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Underestimating actual expenses in a rising-cost environment
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Industrial properties are seeing above-inflation increases
                    in insurance premiums, dock door maintenance, and
                    landscaping costs in 2025–2026. Estimate letters that
                    anchored on 2023 or 2024 actuals without inflation
                    adjustments may understate 2026 actual expenses by 8–15% in
                    some markets. The combination of higher actual expenses and
                    a larger gross-up adjustment (from lower occupancy) creates
                    a compounded underrecovery that resolves into a large
                    reconciliation bill.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not updating the denominator when a tenant vacated partial
                    space
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In multi-tenant industrial buildings where a tenant
                    surrenders a portion of their space (expanding another
                    tenant&apos;s relative share), the denominator used in
                    pro-rata calculations must be reviewed. If a lease defines
                    the denominator dynamically (total occupied SF), each
                    remaining tenant&apos;s share increases when the partial
                    surrender occurs. Estimates that continue using the
                    pre-surrender denominator underbill the remaining tenants
                    for the rest of the year and create an awkward settlement
                    conversation.
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
                Does rising industrial vacancy change what I can recover in CAM?
              </h3>
              <p className="text-sm text-muted-foreground">
                Not directly. The recoverable expense pool is determined by your
                leases, not by market vacancy. However, rising vacancy can push
                your building&apos;s occupancy below the gross-up threshold in
                some leases, which changes how expenses are presented on the
                reconciliation. For pure triple-net industrial leases, tenants
                pay their pro-rata share of actual expenses regardless of
                occupancy. Gross-up provisions are less common but do exist,
                particularly in newer or multi-tenant flex leases.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                My 2026 CAM estimate letter was issued in November 2025 when the
                market was tighter. Do I need to reissue it?
              </h3>
              <p className="text-sm text-muted-foreground">
                If occupancy at your property has dropped below your gross-up
                threshold since the estimate was issued, the estimate may
                understate what you are entitled to recover for 2026. Most
                leases do not require mid-year estimate revisions unless the
                variance exceeds a stated threshold (often 10–15%). However, you
                should document the variance now so the 2026 reconciliation
                settlement is accurate and defensible.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the difference between a triple-net and modified gross
                industrial lease for CAM purposes?
              </h3>
              <p className="text-sm text-muted-foreground">
                In a triple-net (NNN) industrial lease, tenants pay their
                proportionate share of actual operating expenses directly. The
                landlord passes through all costs. In a modified gross lease,
                the landlord includes a fixed CAM charge in base rent and
                absorbs variance from actual expenses. CAM estimate accuracy
                matters more in NNN leases because underpayment must be
                collected via reconciliation settlement.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                A tenant vacated 40% of a flex industrial building in March. How
                does that affect the remaining tenants&apos; CAM?
              </h3>
              <p className="text-sm text-muted-foreground">
                If the vacated space is not re-leased, the remaining
                tenants&apos; pro-rata shares will increase if the lease uses a
                dynamic denominator (tenant RSF / total occupied RSF). If the
                denominator is fixed in the lease (a specific RSF figure), the
                remaining tenants&apos; shares do not change automatically.
                Review the lease language for each tenant before issuing revised
                bills.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-estimate-letter-qa"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">CAM Estimate Letter Q&A</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to draft, review, and defend CAM estimate letters
              </p>
            </Link>
            <Link
              href="/resources/industrial-cam-reconciliation"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">Industrial CAM Reconciliation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete guide to industrial property CAM reconciliation
              </p>
            </Link>
            <Link
              href="/resources/gross-up-clause-explained"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">Gross-Up Clause Explained</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How gross-up provisions work and what to verify in the lease
              </p>
            </Link>
            <Link
              href="/tools/cam-gross-up-calculator"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">CAM Gross-Up Calculator</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Model gross-up at any occupancy level for free
              </p>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Review Your 2026 Industrial CAM Estimates Before Year-End
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri checks whether your 2026 estimates reflect current
            occupancy, correct gross-up thresholds, and accurate denominators -
            so reconciliation settlements do not come as a surprise to your
            tenants.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "q1_2026_industrial_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
