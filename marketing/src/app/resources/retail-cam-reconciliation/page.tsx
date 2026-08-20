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
    "CAM Reconciliation for Retail Centers: Anchors, Exclusions, and the Denominator Problem",
  description:
    "Retail CAM reconciliation is complicated by anchor exclusions, percentage rent tenants, and BOMA 2024 measurement changes. Here's how to reconcile correctly and avoid the most common retail-specific errors.",
  alternates: {
    canonical: `${SITE_URL}/resources/retail-cam-reconciliation`,
  },
  openGraph: {
    title:
      "CAM Reconciliation for Retail Centers: Anchors, Exclusions, and the Denominator Problem",
    description:
      "Retail CAM reconciliation is complicated by anchor exclusions, percentage rent tenants, and BOMA 2024 measurement changes. Here's how to reconcile correctly and avoid the most common retail-specific errors.",
    url: `${SITE_URL}/resources/retail-cam-reconciliation`,
    type: "article",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "CAM Reconciliation for Retail Centers: Anchors, Exclusions, and the Denominator Problem",
  description:
    "Retail CAM reconciliation challenges: anchor exclusions, exterior vs. interior cost allocation, inline tenant denominator mechanics, and BOMA 2024 impacts.",
  url: `${SITE_URL}/resources/retail-cam-reconciliation`,
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
      name: "What is the CAM denominator problem in retail centers with anchor tenants?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Anchor tenants often exclude their square footage from the CAM denominator while still contributing to shared areas. If the anchor occupies 120,000 SF of a 200,000 SF center and is excluded from the denominator, inline tenants (80,000 SF) pay a larger share of the shared CAM pool. The denominator shrinks but the expense pool may not, resulting in a higher effective CAM rate for inline tenants. Some leases specifically cap inline tenant CAM shares to prevent this.",
      },
    },
    {
      "@type": "Question",
      name: "What is included in retail CAM charges?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Retail CAM is primarily exterior: parking lot maintenance (repaving, striping, lighting), landscaping, snow removal, exterior common area cleaning, shared HVAC for enclosed mall common areas, center management/security, and exterior utilities. Unlike office, janitorial within leased spaces is rarely included. Tenants handle their own suite cleaning.",
      },
    },
    {
      "@type": "Question",
      name: "How does anchor self-management affect retail CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When an anchor tenant manages its own parking area, rooftop, or exterior maintenance, those areas may be excluded from the shared CAM pool. The landlord's recoverable expense pool covers only the inline tenant common areas. Reconciliation must clearly identify which portions of the center are in the shared pool vs. anchor-managed, and the denominator must match the pool definition.",
      },
    },
    {
      "@type": "Question",
      name: "How do seasonal expenses like snow removal affect retail CAM estimates?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Seasonal expenses create significant reconciliation variance. A property in the Midwest may spend $80,000 in a heavy snow year and $25,000 in a mild year. Monthly estimates are typically set at a smoothed annual average, meaning true-up amounts can be large in heavy-weather years. Some leases allow landlords to reconcile snow removal on an actual-cost basis rather than the estimate average.",
      },
    },
  ],
};

export default function RetailCamReconciliationPage() {
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
          <span className="text-foreground">Retail CAM Reconciliation</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Reconciliation for Retail Centers: Anchors, Exclusions, and the
            Denominator Problem
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Retail CAM reconciliation is the most structurally complex of any
            property type. Anchor exclusions shrink the denominator, lease
            structures vary across tenants, and the exterior-dominated expense
            profile shifts significantly by season and market.
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
            Retail CAM is more complex than office or industrial because of
            anchor exclusions (which shrink the denominator without always
            shrinking the expense pool), HVAC shared between common areas and
            inline tenants in enclosed centers, and the patchwork of lease
            structures across anchor, mini-anchor, and inline tenants, each with
            different CAM pools and exclusions.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Retail Property Types and CAM Profiles
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Primary CAM Expenses
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Typical CAM/SF
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Key Complexity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3 font-medium">Strip mall</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Parking, landscaping, signage lighting
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">$3–6</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Simple; few anchor complications
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Neighborhood / community center
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Parking, landscaping, exterior lighting, cleaning
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">$3–5</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Grocery anchor exclusions
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Power center / big-box
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Large parking lot, drive aisles, landscaping
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">$2–4</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Multiple anchors, each self-maintaining
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Lifestyle / mixed-use center
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Amenities, event programming, security, landscaping
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">$4–7</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    BOMA 2024 outdoor area classification
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Enclosed mall</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Interior common area HVAC, janitorial, security, food court
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">$6–12+</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Interior + exterior split; anchor bespoke leases
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The Anchor Exclusion and Denominator Problem
          </h2>
          <p className="mb-4 text-muted-foreground">
            Anchor exclusions are the most structurally significant issue in
            retail CAM reconciliation. When a major anchor (grocery, department
            store, big-box) negotiates to exclude its GLA from the shared CAM
            denominator, the remaining inline tenants bear a larger pro-rata
            share of the shared expense pool.
          </p>
          <div className="rounded-lg border bg-muted/30 p-6 mb-4">
            <h3 className="mb-4 font-semibold">
              Worked Example: Anchor Exclusion Impact
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left font-medium"></th>
                    <th className="pb-2 text-right font-medium">
                      Without Exclusion
                    </th>
                    <th className="pb-2 text-right font-medium">
                      With Anchor Excluded
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Total center GLA
                    </td>
                    <td className="py-2 text-right font-mono">200,000 SF</td>
                    <td className="py-2 text-right font-mono">200,000 SF</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Anchor GLA (excluded)
                    </td>
                    <td className="py-2 text-right font-mono"> - </td>
                    <td className="py-2 text-right font-mono">120,000 SF</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">CAM denominator</td>
                    <td className="py-2 text-right font-mono font-medium">
                      200,000 SF
                    </td>
                    <td className="py-2 text-right font-mono font-medium">
                      80,000 SF
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Shared CAM pool
                    </td>
                    <td className="py-2 text-right font-mono">$400,000</td>
                    <td className="py-2 text-right font-mono">$400,000</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Inline tenant share (2,000 SF tenant)
                    </td>
                    <td className="py-2 text-right font-mono">1% → $4,000</td>
                    <td className="py-2 text-right font-mono text-destructive-strong">
                      2.5% → $10,000
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The inline tenant pays 2.5x more per SF when the anchor is
              excluded from the denominator, even though the anchor benefits
              from the same parking lot and common area maintenance. This is why
              anchor exclusion negotiation matters so much at lease execution.
            </p>
          </div>
          <p className="text-muted-foreground">
            See the{" "}
            <Link
              href="/resources/anchor-exclusion-denominator-risk"
              className="text-primary underline"
            >
              anchor exclusion denominator risk guide
            </Link>{" "}
            for a complete treatment of this issue, including how to identify it
            in existing lease portfolios and what to negotiate at renewal.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Exterior vs. Interior CAM: The Retail Distinction
          </h2>
          <p className="mb-4 text-muted-foreground">
            Retail CAM is predominantly exterior: parking lots, landscaping,
            exterior lighting, drive aisles, and signage. This contrasts with
            office (predominantly interior) and makes retail reconciliation
            subject to different cost drivers: weather, seasonal variation,
            parking lot condition cycles, and municipal requirements.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold text-sm">
                Exterior (recoverable in most retail leases)
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Parking lot maintenance (sweeping, sealing, striping)</li>
                <li>• Landscaping and irrigation</li>
                <li>• Exterior lighting (parking, signage)</li>
                <li>• Snow removal and ice management</li>
                <li>• Exterior common area cleaning</li>
                <li>• Storm drain and utility maintenance</li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold text-sm">
                Interior (recoverable only in enclosed mall leases)
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Mall common area HVAC</li>
                <li>• Interior corridor janitorial</li>
                <li>• Food court maintenance</li>
                <li>• Interior security (malls)</li>
                <li>• Interior signage and lighting</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Inline vs. Anchor Lease Structures
          </h2>
          <p className="mb-4 text-muted-foreground">
            A typical anchored retail center has three different lease
            structures operating simultaneously:
          </p>
          <ol className="space-y-3 text-muted-foreground">
            <li>
              <strong>1. Anchor leases:</strong> Bespoke, heavily negotiated.
              Often include their own CAM pool (the anchor maintains its pad and
              contributes a fixed amount to shared areas) or full
              self-maintenance. May have a separate reconciliation process or no
              reconciliation at all.
            </li>
            <li>
              <strong>2. Mini-anchor / junior anchor leases:</strong> Mid-size
              tenants (10,000–40,000 SF) with negotiated caps, sometimes an
              exclusion from the main CAM pool, and defined carve-outs for
              anchor maintenance areas.
            </li>
            <li>
              <strong>3. Inline tenant leases:</strong> Standard form leases
              with full pro-rata participation in the shared CAM pool. Subject
              to standard annual caps and standard gross-up provisions.
            </li>
          </ol>
          <p className="mt-4 text-muted-foreground">
            When reconciling, each lease type must be treated according to its
            actual terms. Using a single reconciliation template that ignores
            anchor carve-outs systematically miscalculates inline tenant shares.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            BOMA 2024 and Retail Measurement
          </h2>
          <p className="mb-4 text-muted-foreground">
            BOMA 2024 introduced new measurement standards that affect how
            outdoor amenity areas in lifestyle and mixed-use centers are
            classified. Areas previously excluded from RSF calculations may now
            be includable, which affects both the total GLA and the pro-rata
            denominators for CAM reconciliation.
          </p>
          <p className="text-muted-foreground">
            If your center was measured under pre-2024 BOMA standards, review
            whether a re-measurement under BOMA 2024 would change any
            tenant&apos;s pro-rata share. Lease-specific measurement provisions
            control. Many leases specify the measurement standard to be used.
            See the{" "}
            <Link
              href="/resources/boma-2024-cam-reconciliation"
              className="text-primary underline"
            >
              BOMA 2024 CAM reconciliation guide
            </Link>{" "}
            for the specific changes and how to assess impact on existing
            leases.
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
                    Using total center GLA as the denominator when anchor leases
                    exclude anchor GLA
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If anchor leases specify that anchor GLA is excluded from
                    the denominator, using total center GLA underbills all
                    inline tenants. The reconciliation needs to use the
                    contractually correct denominator for each tenant, which may
                    differ across the lease portfolio.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Including anchor-maintained area costs in the shared CAM
                    pool
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When an anchor manages its own parking lot or exterior
                    maintenance, those costs should not appear in the shared CAM
                    pool billed to inline tenants. If maintenance charges for
                    anchor-maintained areas flow through the landlord&apos;s GL
                    and into the reconciliation without being excluded, inline
                    tenants are overbilled.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not reconciling snow removal and seasonal costs at actual
                    vs. estimated amounts
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Monthly estimates for snow removal are set at an annual
                    average. In a heavy snow year, actual costs may be 3–4x the
                    estimate. The true-up amount is correct and fully
                    recoverable. If the reconciliation uses the estimate rather
                    than actuals, recoverable revenue is left behind.
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
                What is the CAM denominator problem in retail centers with
                anchor tenants?
              </h3>
              <p className="text-muted-foreground">
                When an anchor tenant excludes its GLA from the CAM denominator,
                inline tenants pay a larger pro-rata share of the shared expense
                pool. A 120,000 SF anchor excluding from an 80,000 SF inline
                tenant pool means inline tenants pay 2.5x more per SF than they
                would if the anchor were included.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is included in retail CAM charges?
              </h3>
              <p className="text-muted-foreground">
                Retail CAM is primarily exterior: parking lot maintenance,
                landscaping, exterior lighting, snow removal, exterior cleaning,
                and center management/security. Interior costs are only included
                for enclosed malls with common area HVAC and janitorial.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How does anchor self-management affect retail CAM
                reconciliation?
              </h3>
              <p className="text-muted-foreground">
                When an anchor manages its own maintenance, those costs are
                excluded from the shared CAM pool. The landlord&apos;s expense
                pool covers only inline tenant common areas. Reconciliation must
                clearly identify which areas are in the shared pool.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How do seasonal expenses affect retail CAM estimates?
              </h3>
              <p className="text-muted-foreground">
                Seasonal expenses like snow removal create large reconciliation
                variances. A heavy snow year may produce actual costs 3–4x above
                the annual estimate. The true-up is fully recoverable, but only
                if the reconciliation uses actual costs rather than smoothed
                estimates.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/anchor-exclusion-denominator-risk",
                title: "Anchor Exclusion Denominator Risk",
                desc: "Full analysis of how anchor exclusions impact inline tenant CAM rates",
              },
              {
                href: "/resources/cam-benchmarks-by-property-type",
                title: "CAM Benchmarks by Property Type",
                desc: "Retail CAM per SF benchmarks by center type",
              },
              {
                href: "/resources/pro-rata-share-validation",
                title: "Pro-Rata Share Validation",
                desc: "How to verify denominator calculations across a retail lease portfolio",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How CapVeri handles anchor exclusions and multiple CAM pools",
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
            Stop Anchor Exclusions From Undercharging Inline Tenants
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri validates pro-rata denominators against your lease terms -
            flagging anchor exclusion mismatches before they become tenant audit
            findings.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "retail_cam_reconciliation_cta",
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
