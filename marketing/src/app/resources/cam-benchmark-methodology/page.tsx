import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "How to Use CAM Benchmarks Without Overfitting: A Data Methodology Guide",
  description:
    "Industry CAM benchmarks are useful context, not universal targets. This guide explains how to interpret expense ranges, control for market factors, and build your own portfolio benchmarks.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-benchmark-methodology`,
  },
  openGraph: {
    title:
      "How to Use CAM Benchmarks Without Overfitting: A Data Methodology Guide",
    description:
      "Industry CAM benchmarks are useful context, not universal targets. This guide explains how to interpret expense ranges, control for market factors, and build your own portfolio benchmarks.",
    url: `${SITE_URL}/resources/cam-benchmark-methodology`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What are the main sources of CAM benchmark data?",
    answer:
      "The primary sources for commercial real estate operating expense benchmarks are: (1) BOMA Experience Exchange Report (BOMA EER) - the most widely cited source, covering office buildings by class, size, and metro area; (2) CBRE and JLL annual market reports - broad coverage but less granular on expense line items; (3) IREM Income/Expense Analysis (OEMA) - strong on apartment and retail, weaker on industrial; (4) CoStar/RCA proprietary data - useful for transactions but not detailed on operating costs. Each source has coverage biases: BOMA EER skews toward institutional-quality office; IREM covers smaller commercial portfolios better.",
  },
  {
    question: "Can I use a CAM benchmark to dispute a reconciliation?",
    answer:
      "Benchmarks can support a dispute investigation but should not be the primary basis for a dispute. A lease governs what is recoverable, not what is typical. A landlord can lawfully bill above benchmark if the lease permits it and the expenses are legitimate. The right use of benchmarks in a dispute is to flag specific line items for closer examination, then trace those line items back to the lease language, invoices, and GL to determine whether they are actually improperly billed.",
  },
  {
    question: "How do I build a portfolio benchmark across different markets?",
    answer:
      "To build a defensible portfolio benchmark: (1) segment by property type (office, retail, industrial) - do not mix types; (2) apply a market cost index to each property to normalize for labor and construction cost differences; (3) normalize all figures to cost per rentable SF; (4) apply a vintage adjustment (pre-2000 vs. 2000-2015 vs. 2015+) to control for building age; (5) identify outliers at the portfolio level by looking at properties that are more than 1.5 standard deviations from the adjusted mean. Investigate outliers rather than targeting the mean.",
  },
  {
    question: "How often should I update my portfolio benchmarks?",
    answer:
      "At minimum, update benchmarks annually using prior-year actuals. For expense categories with high year-over-year volatility (insurance premiums, utility rates, janitorial contracts), track monthly to catch mid-year deviations. In 2025-2026, insurance premiums for commercial properties in coastal markets have increased 15-30% year-over-year in some cases; a benchmark anchored on 2022 actuals will systematically flag legitimate expense increases as anomalies.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: "/" },
  { name: "Resources", url: "/resources" },
  {
    name: "CAM Benchmark Methodology",
    url: "/resources/cam-benchmark-methodology",
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "How to Use CAM Benchmarks Without Overfitting: A Data Methodology Guide",
  description:
    "Industry CAM benchmarks are useful context, not universal targets. This guide explains how to interpret expense ranges, control for market factors, and build your own portfolio benchmarks.",
  url: `${SITE_URL}/resources/cam-benchmark-methodology`,
  datePublished: "2026-01-15",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  wordCount: 1300,
  articleSection: "Methodology",
});

export default function CamBenchmarkMethodologyPage() {
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
          <span className="text-foreground">CAM Benchmark Methodology</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            How to Use CAM Benchmarks Without Overfitting: A Data Methodology
            Guide
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Industry CAM benchmarks are useful for identifying outliers in your
            portfolio - but treating them as performance targets or budget
            ceilings leads to bad decisions. This guide explains where benchmark
            data comes from, what it actually measures, and how to build your
            own portfolio-specific reference points.
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
            CAM benchmarks provide useful context for identifying outliers in
            your portfolio but should not be used as performance targets. Too
            many property-specific factors drive legitimate variation: building
            vintage, local labor costs, amenity level, and lease structure all
            create differences that have nothing to do with whether the
            reconciliation is accurate. The right use of benchmarks is to
            trigger investigation of specific line items. Do not accept or
            reject a reconciliation based on whether total CAM falls within a
            published range.
          </p>
        </div>

        {/* Sources of benchmark data */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Sources of CAM Benchmark Data and Their Limitations
          </h2>
          <p className="mb-4 text-muted-foreground">
            Understanding where published benchmark data comes from is essential
            to interpreting it correctly. The major sources each have structural
            biases that limit their applicability in specific contexts.
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-lg font-semibold">
                BOMA Experience Exchange Report (BOMA EER)
              </h3>
              <p className="text-muted-foreground">
                The most widely cited source for commercial office operating
                expense benchmarks. Published annually, the BOMA EER covers
                hundreds of office buildings and breaks down expenses by
                category (janitorial, HVAC, security, administration, management
                fee, insurance, taxes) and by building class and size cohort.
              </p>
              <p className="mt-2 text-muted-foreground">
                <strong className="text-foreground">Key limitations:</strong>{" "}
                Self-reported data from participating buildings. Properties that
                choose not to participate (often those with anomalous expense
                profiles) are excluded. Coverage skews toward
                institutional-grade office in major markets. The survey captures
                total operating expenses, not just CAM-recoverable expenses, so
                comparison to a specific lease&apos;s CAM pool requires
                adjustment.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-semibold">
                CBRE and JLL Annual Market Reports
              </h3>
              <p className="text-muted-foreground">
                Brokerage market reports provide broad coverage across property
                types and markets but are less granular on individual expense
                line items. They are more useful for directional market context
                (overall operating expense trends, market rent levels) than for
                specific CAM category benchmarking.
              </p>
              <p className="mt-2 text-muted-foreground">
                <strong className="text-foreground">Key limitations:</strong>{" "}
                Methodology varies year-to-year; figures may represent median,
                mean, or market survey responses. Not audited. Better for
                macroeconomic context than property-level CAM comparison.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-semibold">
                IREM Income/Expense Analysis (OEMA)
              </h3>
              <p className="text-muted-foreground">
                The Institute of Real Estate Management publishes operating
                expense data across property types, with particularly strong
                coverage of apartment and smaller commercial properties. Useful
                for retail and smaller office portfolios.
              </p>
              <p className="mt-2 text-muted-foreground">
                <strong className="text-foreground">Key limitations:</strong>{" "}
                Less coverage of Class A institutional office and large
                industrial portfolios. Useful for community retail and strip
                centers; less useful for regional malls or large distribution
                centers.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Survivor bias note:</strong>{" "}
                All self-reported benchmark surveys share a structural
                limitation: properties with unusual expense profiles (very high
                or very low) are less likely to participate. The published
                ranges describe properties that opted in to the survey, which
                tends to be better-managed, institutional-quality stock. Your
                1972 building with deferred HVAC maintenance may legitimately
                sit outside the reported range for reasons having nothing to do
                with overbilling.
              </p>
            </div>
          </div>
        </section>

        {/* Building your own portfolio benchmarks */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Building Your Own Portfolio Benchmarks
          </h2>
          <p className="mb-4 text-muted-foreground">
            The most actionable benchmarks for detecting CAM errors are
            portfolio-internal. Compare your own properties against each other
            after controlling for the factors that drive legitimate variation.
            Here is a practical methodology:
          </p>

          <ol className="space-y-4 text-muted-foreground">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </span>
              <div>
                <p className="font-medium text-foreground">
                  Normalize to cost per rentable SF
                </p>
                <p className="mt-1 text-sm">
                  Convert all expense figures to $/RSF/year. This eliminates
                  size as a confounding variable. A $2M CAM pool in a 200,000 SF
                  building ($10/SF) is not directly comparable to a $500,000 CAM
                  pool in a 100,000 SF building ($5/SF) without this step.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </span>
              <div>
                <p className="font-medium text-foreground">
                  Segment by property type and vintage
                </p>
                <p className="mt-1 text-sm">
                  Do not mix office and industrial in the same benchmark group.
                  Within office, separate pre-2000, 2000–2015, and 2015+ vintage
                  cohorts. Building age is a strong predictor of HVAC, roofing,
                  and elevator maintenance costs. Mixing vintages creates
                  misleading averages.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                3
              </span>
              <div>
                <p className="font-medium text-foreground">
                  Apply a market cost index
                </p>
                <p className="mt-1 text-sm">
                  Adjust each property&apos;s expenses by a market-level labor
                  cost index before comparing across geographies. CBRE and JLL
                  publish market cost indices; alternatively, use Bureau of
                  Labor Statistics regional wage data for building maintenance
                  occupations. Without this step, a San Francisco building will
                  always look expensive compared to a comparable Dallas building
                  regardless of management quality.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                4
              </span>
              <div>
                <p className="font-medium text-foreground">
                  Identify outliers, then investigate
                </p>
                <p className="mt-1 text-sm">
                  Flag properties that are more than 20–25% above the adjusted
                  group mean for specific expense categories. Investigate
                  outliers by drilling to the GL detail rather than accepting or
                  rejecting the variance based on the benchmark alone. The goal
                  is to understand whether the variance has a structural
                  explanation (the building has a loading dock that others do
                  not) or a process explanation (an expense was miscoded).
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* When to use benchmarks */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            When to Use Benchmarks and When Not To
          </h2>
          <p className="mb-4 text-muted-foreground">
            <strong className="text-foreground">
              Use benchmarks to flag outliers for deeper review.
            </strong>{" "}
            If your insurance expense is running 3x the benchmark for comparable
            properties, that is a signal to investigate, not a conclusion that
            you have overbilled tenants. The investigation might reveal that
            your building is in a wind/flood zone and legitimately carries
            higher premiums, or it might reveal that the renewal was not
            competitively bid.
          </p>
          <p className="mb-4 text-muted-foreground">
            <strong className="text-foreground">
              Do not use benchmarks as a budget ceiling.
            </strong>{" "}
            Telling your property manager that janitorial "should be" $1.20/SF
            because the benchmark is $1.20/SF ignores the specific service level
            required by your tenant leases. A lease that requires twice-daily
            cleaning of common areas will produce a janitorial expense above
            benchmark. That cost is fully recoverable.
          </p>
          <p className="mb-4 text-muted-foreground">
            <strong className="text-foreground">
              Do not use benchmarks as a substitute for lease review.
            </strong>{" "}
            A reconciliation is accurate or inaccurate based on whether it
            complies with the lease, not based on whether expenses fall within a
            published range. The benchmark is the starting point for questions,
            not the ending point for conclusions.
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
                    Comparing a 1985-vintage building to a Class A benchmark
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A property manager who benchmarks a 40-year-old building
                    against BOMA Class A EER data will conclude that every
                    maintenance category is over-budget. Older buildings have
                    higher HVAC maintenance costs, more frequent elevator
                    callbacks, higher plumbing repair frequency, and less energy
                    efficiency. These are structural characteristics of the
                    asset, not evidence of expense mismanagement. The correct
                    benchmark for a 1985 building is a cohort of
                    comparable-vintage buildings in the same market.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating the benchmark as a budget limit rather than an
                    outlier flag
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When property management teams are evaluated against
                    benchmark targets rather than outlier detection, they have
                    an incentive to defer legitimate maintenance to stay within
                    budget or to negotiate contracts that appear below benchmark
                    while delivering lower service quality. Benchmarks work well
                    as investigation triggers; they create perverse incentives
                    when used as performance targets.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using a single-market benchmark for a national portfolio
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A national portfolio that uses a single benchmark (often
                    pulled from the largest market in the portfolio) creates
                    systematic comparison errors for every other market. A
                    Denver office property benchmarked against New York BOMA
                    data will always look lean; a Phoenix property benchmarked
                    against San Francisco data will always look expensive. Build
                    market-specific reference ranges or apply explicit
                    geographic adjustments before drawing any conclusions.
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
                What are the main sources of CAM benchmark data?
              </h3>
              <p className="text-sm text-muted-foreground">
                The primary sources are: (1) BOMA Experience Exchange Report,
                the most widely cited, covering office buildings by class and
                metro area; (2) CBRE and JLL annual market reports, broad
                coverage and less granular; (3) IREM OEMA, strong on retail and
                smaller commercial. Each source has coverage biases: BOMA EER
                skews toward institutional-quality office; IREM covers smaller
                commercial portfolios better.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can I use a CAM benchmark to dispute a reconciliation?
              </h3>
              <p className="text-sm text-muted-foreground">
                Benchmarks can support a dispute investigation but should not be
                the primary basis. A lease governs what is recoverable, not what
                is typical. A landlord can lawfully bill above benchmark if the
                lease permits it and the expenses are legitimate. Use benchmarks
                to flag specific line items for closer examination, then trace
                those back to the lease language, invoices, and GL.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How do I build a portfolio benchmark across different markets?
              </h3>
              <p className="text-sm text-muted-foreground">
                Segment by property type, normalize to cost per RSF, apply a
                market cost index for labor, and group by building vintage
                cohort (pre-2000, 2000–2015, 2015+). Identify outliers at more
                than 20–25% above the adjusted group mean for specific
                categories. Investigate outliers by drilling to GL detail rather
                than accepting or rejecting based on the benchmark alone.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How often should I update my portfolio benchmarks?
              </h3>
              <p className="text-sm text-muted-foreground">
                At minimum, update benchmarks annually using prior-year actuals.
                For high-volatility categories (insurance premiums, utility
                rates, janitorial contracts), track monthly to catch mid-year
                deviations. In 2025-2026, commercial property insurance in
                coastal markets has increased 15-30% year-over-year in some
                cases. A benchmark anchored on 2022 actuals will flag legitimate
                increases as anomalies.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-benchmarks-by-property-type"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">CAM Benchmarks by Property Type</p>
              <p className="mt-1 text-sm text-muted-foreground">
                2026 operating expense ranges for office, retail, and industrial
              </p>
            </Link>
            <Link
              href="/resources/gl-export-qa-cam"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">GL Export QA for CAM</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to validate your GL export before building a reconciliation
              </p>
            </Link>
            <Link
              href="/resources/why-erps-still-leak-cam-revenue"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">Why ERPs Still Leak CAM Revenue</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The structural reasons Yardi and MRI export reconciliations
                contain errors
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">CAM Reconciliation Software</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How CapVeri automates reconciliation and finds billing errors
              </p>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Turn Benchmarks Into Actionable Findings
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri compares your CAM expense pool against property-type and
            market benchmarks, then traces outliers back to specific GL entries
            so you can see exactly which line items warrant investigation.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "cam_benchmark_methodology_cta",
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
