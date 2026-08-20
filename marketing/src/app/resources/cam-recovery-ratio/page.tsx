import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import {
  structuredDataSchemas,
  AUTHOR_ANGEL_CAMPA,
} from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "CAM Recovery Ratio Guide: Benchmarking Your Operating Expense Recovery",
  description:
    "The CAM recovery ratio measures how much of your property's operating expenses are recovered through tenant CAM charges. Here's how to calculate it, what good looks like, and how to improve it.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-recovery-ratio`,
  },
  openGraph: {
    title:
      "CAM Recovery Ratio Guide: Benchmarking Your Operating Expense Recovery",
    description:
      "The CAM recovery ratio measures how much of your property's operating expenses are recovered through tenant CAM charges. Here's how to calculate it, what good looks like, and how to improve it.",
    url: `${SITE_URL}/resources/cam-recovery-ratio`,
    type: "article",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "CAM Recovery Ratio Guide: Benchmarking Your Operating Expense Recovery",
  description:
    "The CAM recovery ratio measures how much of your property's operating expenses are recovered through tenant CAM charges.",
  url: `${SITE_URL}/resources/cam-recovery-ratio`,
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
      name: "What is a good CAM recovery ratio?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "For full NNN leases (industrial, strip retail), a healthy recovery ratio is 90–100%. For office properties with base-year or expense-stop structures, 60–80% is typical. Mixed portfolios often land between 70–85%. Recovery ratios below 60% generally indicate structural lease issues worth investigating.",
      },
    },
    {
      "@type": "Question",
      name: "What is the formula for CAM recovery ratio?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM Recovery Ratio = Total CAM Collected from Tenants ÷ Total Recoverable Operating Expenses × 100%. 'Total recoverable operating expenses' means the expenses that are billable to tenants under the lease, excluding non-recoverable items like capital expenditures and vacancy-related costs.",
      },
    },
    {
      "@type": "Question",
      name: "Why does my CAM recovery ratio drop in high-inflation years?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM caps are the most common cause. If your leases include annual CAM caps (commonly 3–5% per year), and actual expenses grew 8% due to inflation, the cap prevents you from billing tenants for the full increase. The uncapped amount becomes unrecoverable, reducing your recovery ratio. Cumulative caps that allow banking of unused cap room can partially mitigate this.",
      },
    },
    {
      "@type": "Question",
      name: "How do anchor exclusions reduce the CAM recovery ratio?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Anchor tenants often maintain their own portions of the property (parking, roof, common areas adjacent to their space). When anchor-maintained areas are excluded from the shared CAM pool, the denominator (total recoverable expenses) shrinks, but so can the pool of expenses being billed to inline tenants. The net effect on recovery ratio depends on whether the anchor's self-maintenance obligation is truly honored in practice.",
      },
    },
  ],
};

export default function CamRecoveryRatioPage() {
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
          <span className="text-foreground">CAM Recovery Ratio</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Recovery Ratio Guide: Benchmarking Your Operating Expense
            Recovery
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            The CAM recovery ratio is one of the most direct measures of how
            effectively your lease structure converts operating expenses into
            tenant billings. A low ratio is a symptom of cap erosion, structural
            lease issues, or billing errors that leave money on the table.
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
            The CAM recovery ratio is the percentage of total recoverable
            operating expenses actually collected through tenant CAM payments. A
            90%+ recovery ratio is typical for well-structured NNN leases;
            recovery ratios below 70% often indicate structural lease issues,
            cap erosion, or billing errors. The formula:{" "}
            <strong>
              Recovery Ratio = Total CAM Collected ÷ Total Recoverable Expenses
              × 100%
            </strong>
            .
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The Formula and What It Measures
          </h2>
          <div className="mb-6 rounded-lg border bg-muted/30 p-6">
            <p className="mb-2 font-mono text-lg font-semibold">
              Recovery Ratio = Total CAM Collected ÷ Total Recoverable Operating
              Expenses × 100%
            </p>
            <p className="text-sm text-muted-foreground">
              Where &ldquo;Total Recoverable Operating Expenses&rdquo; =
              expenses that are billable to tenants under the lease, after
              removing non-recoverable items.
            </p>
          </div>

          <div className="mb-6 rounded-lg border bg-muted/30 p-6">
            <h3 className="mb-4 font-semibold">Worked Example</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Total operating expenses (GL)
                    </td>
                    <td className="py-2 text-right font-mono">$850,000</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Less: Non-recoverable items (capital, vacancy costs,
                      management exclusions)
                    </td>
                    <td className="py-2 text-right font-mono text-destructive-strong">
                      ($120,000)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">
                      Total recoverable operating expenses
                    </td>
                    <td className="py-2 text-right font-mono font-medium">
                      $730,000
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Less: CAM caps (expenses above annual cap limit)
                    </td>
                    <td className="py-2 text-right font-mono text-destructive-strong">
                      ($45,000)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">
                      Total CAM billed to tenants
                    </td>
                    <td className="py-2 text-right font-mono font-medium">
                      $685,000
                    </td>
                  </tr>
                  <tr className="border-t-2">
                    <td className="py-2 font-bold">Recovery ratio</td>
                    <td className="py-2 text-right font-mono font-bold">
                      93.8% ($685K ÷ $730K)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-muted-foreground">
            Note that the denominator is total <em>recoverable</em> expenses,
            not total GL expenses. If you calculate the ratio against total GL
            expenses, you will always get a ratio that appears lower than
            reality, because it includes capital items and other non-billable
            costs that were never intended to be recovered. Use the recoverable
            pool as the denominator.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Five Factors That Reduce the Recovery Ratio
          </h2>

          <div className="space-y-6">
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">
                (a) Non-Recoverable Expense Pool
              </h3>
              <p className="text-sm text-muted-foreground">
                Capital expenditures, vacancy-related costs, and lease-specific
                exclusions reduce the billable pool before caps are even
                applied. Every dollar of non-recoverable expense in the GL is a
                dollar the landlord absorbs. The larger the non-recoverable
                pool, the lower the denominator and the lower the absolute
                dollar amount available to recover, regardless of the ratio.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">
                (b) CAM Caps in High-Inflation Years
              </h3>
              <p className="text-sm text-muted-foreground">
                CAM caps are the single most common cause of recovery ratio
                decline in recent years. A 3% annual cap in a year when
                operating costs rose 8% means the landlord absorbs the 5%
                difference on every capped tenant. On a $700,000 recoverable
                expense pool with 70% of tenants subject to caps, that can be
                $24,500 per year in unrecoverable expense, before compounding.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">
                (c) Anchor Tenant Exclusions
              </h3>
              <p className="text-sm text-muted-foreground">
                Anchor tenants in retail centers often negotiate to maintain
                their own portions of the property and exclude those areas from
                the shared CAM pool. When anchor-adjacent common areas are
                excluded, the shared pool shrinks. The recovery ratio for the
                remaining inline tenants may look healthy, but the absolute
                dollar recovery is lower than it would be under a unified pool.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">
                (d) Base Year / Expense Stop Structures
              </h3>
              <p className="text-sm text-muted-foreground">
                Office leases with base-year or expense-stop provisions only
                allow recovery of expenses above a threshold. For a 2019
                base-year lease in 2026, expenses have risen 30–40% above the
                base - but if the base was set at $12/SF and current expenses
                are $16/SF, the landlord only bills the $4 overage. The absolute
                recovery is real, but the ratio appears lower than NNN peers.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">
                (e) Gross Leases in the Portfolio Mix
              </h3>
              <p className="text-sm text-muted-foreground">
                If your portfolio includes gross-lease tenants - particularly in
                older office buildings or converted industrial space - operating
                expenses for those spaces are absorbed in base rent. There is
                nothing to recover. When calculating portfolio-level recovery
                ratios, exclude gross-lease properties from the denominator or
                segment them separately.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Target Recovery Ratios by Property Type
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">
                    Property Type
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Typical Lease Structure
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Target Recovery Ratio
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Warning Signal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3">Industrial (single-tenant)</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Absolute NNN
                  </td>
                  <td className="px-4 py-3 font-medium text-green-700">
                    95–100%
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">Below 90%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Strip / neighborhood retail</td>
                  <td className="px-4 py-3 text-muted-foreground">NNN</td>
                  <td className="px-4 py-3 font-medium text-green-700">
                    88–97%
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">Below 80%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Power center / anchored retail</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    NNN with anchor exclusions
                  </td>
                  <td className="px-4 py-3 font-medium text-yellow-700">
                    75–90%
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">Below 70%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Office (Class A/B)</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Modified gross / base year
                  </td>
                  <td className="px-4 py-3 font-medium text-yellow-700">
                    60–80%
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">Below 55%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Mixed portfolio</td>
                  <td className="px-4 py-3 text-muted-foreground">Mixed</td>
                  <td className="px-4 py-3 font-medium text-yellow-700">
                    70–85%
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">Below 65%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Benchmarks based on institutional portfolio data. Results vary
            significantly by lease vintage, cap structure, and market.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            How to Improve Your Recovery Ratio
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4 rounded-lg border p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                1
              </div>
              <div>
                <p className="font-medium">
                  Review lease exclusions at renewal
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every lease renewal is an opportunity to renegotiate
                  exclusions that were conceded in a prior market cycle. Remove
                  broad management fee caps, tighten capital expenditure
                  exclusion language, and eliminate tenant-friendly carve-outs
                  that have no current market justification.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-lg border p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                2
              </div>
              <div>
                <p className="font-medium">
                  Audit for billing errors that leave money on the table
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recovery ratio shortfalls aren&apos;t always structural.
                  Common errors such as wrong pro-rata denominator, missing
                  gross-up application, or management fee calculated on wrong
                  base reduce actual collections below what the lease would
                  support. An annual self-audit against lease terms catches
                  these before they compound.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-lg border p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                3
              </div>
              <div>
                <p className="font-medium">
                  Ensure gross-up provisions are being applied
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  If occupancy falls below the lease-specified threshold
                  (commonly 90–95%), variable expenses should be grossed up to
                  reflect what they would have been at full occupancy. When
                  gross-up is not applied in high-vacancy years, the landlord
                  effectively subsidizes the vacant space, reducing effective
                  recovery.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Calculating the ratio against total GL expenses rather than
                    recoverable expenses
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Using total GL expenses as the denominator makes the
                    recovery ratio look worse than it is, because it includes
                    capital items and non-recoverable costs that were never
                    intended to be billed to tenants. Always use the recoverable
                    pool.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating a high recovery ratio as proof of billing accuracy
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A 95% recovery ratio does not mean the reconciliation is
                    correct. It means you collected 95% of what you billed. If
                    your billing had errors that overbilled tenants, the ratio
                    looks healthy while actual exposure to dispute or clawback
                    builds.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not tracking recovery ratio year-over-year by property
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A recovery ratio that drops from 91% to 84% over three years
                    is a signal: cap erosion is accumulating, or a lease
                    exclusion is being interpreted too broadly. Without
                    year-over-year tracking by property, these trends are
                    invisible.
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
                What is a good CAM recovery ratio?
              </h3>
              <p className="text-muted-foreground">
                For full NNN leases (industrial, strip retail), a healthy
                recovery ratio is 90–100%. For office properties with base-year
                or expense-stop structures, 60–80% is typical. Mixed portfolios
                often land between 70–85%. Recovery ratios below 60% generally
                indicate structural lease issues worth investigating.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the formula for CAM recovery ratio?
              </h3>
              <p className="text-muted-foreground">
                Recovery Ratio = Total CAM Collected from Tenants ÷ Total
                Recoverable Operating Expenses × 100%. &ldquo;Total recoverable
                operating expenses&rdquo; means the expenses billable to tenants
                under the lease, excluding non-recoverable items like capital
                expenditures.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Why does my CAM recovery ratio drop in high-inflation years?
              </h3>
              <p className="text-muted-foreground">
                CAM caps are the most common cause. If your leases include
                annual caps (commonly 3–5% per year), and actual expenses grew
                8% due to inflation, the cap prevents full billing. The capped
                amount becomes unrecoverable, reducing your recovery ratio.
                Cumulative caps that allow banking of unused cap room can
                partially offset this.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How do anchor exclusions reduce the CAM recovery ratio?
              </h3>
              <p className="text-muted-foreground">
                When anchor-maintained areas are excluded from the shared CAM
                pool, the recoverable expense pool shrinks. The recovery ratio
                for remaining inline tenants may look healthy, but the absolute
                dollar recovery is lower than it would be under a unified pool.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/recoverable-vs-nonrecoverable-cam",
                title: "Recoverable vs. Non-Recoverable CAM",
                desc: "Which expenses belong in the CAM pool and which don't",
              },
              {
                href: "/resources/cam-benchmarks-by-property-type",
                title: "CAM Benchmarks by Property Type",
                desc: "Industry benchmarks for CAM per SF across property types",
              },
              {
                href: "/resources/cam-gross-up-guide",
                title: "CAM Gross-Up Guide",
                desc: "How to apply gross-up provisions to protect recovery in low-occupancy years",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How CapVeri tracks recovery ratios and flags cap erosion automatically",
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
            Find Out Where Your Recovery Ratio Is Leaking
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri analyzes your reconciliation data to identify cap erosion,
            billing errors, and gross-up gaps that are dragging down your
            recovery ratio.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_recovery_ratio_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
