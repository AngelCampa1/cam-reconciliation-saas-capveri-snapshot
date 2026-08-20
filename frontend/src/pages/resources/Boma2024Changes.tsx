import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { buildSiteUrl } from '@/lib/domains'

// ============================================================================
// Data
// ============================================================================

const tableRows = [
  {
    change: 'Ground-level outdoor amenities',
    boma2017: 'Excluded from RSF',
    boma2024: 'Patios, terraces, courtyards now included',
    impact: 'Expands RSF pool; raises billable denominator',
  },
  {
    change: 'Balconies & rooftop terraces',
    boma2017: 'Load factor penalty applied',
    boma2024: 'Penalty eliminated; measured at 100%',
    impact: 'Eliminates RSF discount on premium amenity space',
  },
  {
    change: 'Base building circulation (Method B)',
    boma2017: 'Complex multi-step allocation',
    boma2024: 'Simplified proportional floor allocation',
    impact: 'Reduces disputes; typical RSF increase per floor',
  },
  {
    change: 'Tenant storage areas',
    boma2017: 'Multiple classification buckets',
    boma2024: 'Single streamlined category',
    impact: 'Fewer CAM exclusions; cleaner pro-rata allocation',
  },
  {
    change: 'Single-tenant equipment shafts',
    boma2017: 'Excluded or ambiguous',
    boma2024: 'Explicitly billable RSF',
    impact: 'Incremental NOI recovery on previously excluded space',
  },
]

const actionItems = [
  <>
    <strong>Pull your current BOMA measurement report.</strong> Confirm 2017 vs.
    2024 and the last certification date. If the report is more than three years
    old, the number in your billing system may not reflect actual certified RSF.
  </>,
  <>
    <strong>Reconcile lease RSF vs. measured RSF for every tenant.</strong> Flag
    gaps greater than 1%. Anything above that threshold is material in a
    reconciliation dispute.
  </>,
  <>
    <strong>Audit billing system denominators.</strong> Your system is almost
    certainly running frozen lease-execution RSF, not current certified RSF.
    Identify which leases allow re-measurement and which lock in the
    execution-date figure.
  </>,
  <>
    <strong>Run the numbers before you make any move.</strong> The{''}
    <Link
      to="/tools/cam-leakage-estimator"
      className="text-primary underline underline-offset-2 hover:no-underline"
    >
      CAM Billing Risk Estimator
    </Link>
    {''}
    calculates dollar exposure across your tenant roster. Three inputs. One
    clear number.
  </>,
  <>
    <strong>Get lease counsel sign-off before re-measuring.</strong> BOMA 2024
    adoption usually requires a lease amendment or formal notice. Switching the
    method on your own creates the exact dispute you wanted to prevent.
  </>,
]

// ============================================================================
// Page Component
// ============================================================================

export function Boma2024ChangesPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="BOMA 2024 vs 2017: CAM Billing Changes | CapVeri"
        description="BOMA 2024 vs 2017 changes CAM billing denominators in ways most controllers haven't modeled. Here's what to check before your next reconciliation."
        canonical="/resources/boma-2024-changes"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'BOMA 2024 vs 2017: What Changed and What It Costs You',
            description:
              "BOMA 2024 vs 2017 changes CAM billing denominators in ways most controllers haven't modeled. Here's what to check before your next reconciliation.",
            author: { '@type': 'Organization', name: 'CapVeri' },
            publisher: { '@type': 'Organization', name: 'CapVeri' },
            datePublished: '2026-02-23',
            dateModified: '2026-02-23',
            url: buildSiteUrl('/resources/boma-2024-changes'),
          },
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Resources', url: '/resources' },
            { name: 'BOMA 2024 Changes', url: '/resources/boma-2024-changes' },
          ]),
        ]}
      />
      <LandingNav variant="light" />

      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          {/* Back Navigation */}
          <Link
            to="/resources"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Resources
          </Link>

          {/* Main Content */}
          <article className="prose  max-w-none">
            <header>
              <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
                BOMA 2024 vs 2017: What Changed and What It Costs You
              </h1>

              {/* Byline */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
                <span>
                  By{''}
                  <strong className="font-medium text-foreground">
                    CapVeri
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <time dateTime="2026-02-23">Updated February 23, 2026</time>
              </div>

              <p className="text-lg text-muted-foreground mb-8">
                On a 250,000 RSF office building, adopting BOMA 2024 produced an
                added $445,500 in annual NOI. No new tenants. No capex. No rent
                bumps. Just different math. For property controllers, wrong
                denominators produce wrong tenant bills. Wrong bills produce
                disputes and clawbacks.
              </p>
            </header>

            {/* Comparison Table */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-4">
                What Changed: BOMA 2017 vs. BOMA 2024
              </h2>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    BOMA 2024 changes summary
                  </caption>
                  <thead>
                    <tr className="bg-muted/50">
                      <th
                        scope="col"
                        className="text-left px-4 py-3 font-semibold"
                      >
                        What Changed
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-3 font-semibold"
                      >
                        BOMA 2017
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-3 font-semibold"
                      >
                        BOMA 2024
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-3 font-semibold"
                      >
                        Financial Impact
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, i) => (
                      <tr
                        key={row.change}
                        className={
                          i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                        }
                      >
                        <td className="px-4 py-3 font-medium">{row.change}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.boma2017}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.boma2024}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.impact}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                Net effect across a typical portfolio:{''}
                <strong>2% to 5% RSF increase per building.</strong>
              </p>
            </section>

            {/* Pro-Rata Section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                What This Means for Your Pro-Rata Calculations
              </h2>

              <p className="text-muted-foreground mb-4">
                A larger RSF denominator changes every tenant&apos;s pro-rata
                share, even if the CAM pool itself doesn&apos;t grow. Two
                tenants with identical leases can end up with different bills if
                one lease was signed under 2017 measurements and the other under
                2024 measurements. That gap isn&apos;t a rounding error;
                it&apos;s a structural mismatch baked into your billing system.
              </p>

              <p className="text-muted-foreground mb-4">
                Mixed-vintage lease books are the real landmine. When you have
                2017-era leases sitting beside tenants whose space was certified
                under 2024 methodology, you&apos;re running two different
                denominators in the same pool without realizing it. That
                mismatch compounds every reconciliation cycle. Year one
                it&apos;s a rounding issue. Year three it&apos;s a dispute. Year
                five it&apos;s an audit demand from counsel.
              </p>

              <p className="text-muted-foreground">
                The place this surfaces earliest is GL coding. If your expense
                categories don&apos;t map cleanly to your measurement standard,
                controllers end up manually reconciling line items that should
                close automatically. Before you re-measure or renegotiate, lock
                down your coding discipline first. See the{''}
                <Link
                  to="/resources/gl-coding-guide"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  GL Coding Guide
                </Link>
                {''}
                for the specific categories where 2024 changes the
                inclusion/exclusion calculus.
              </p>
            </section>

            {/* Action Items Section */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-4">
                What You Need to Do Now
              </h2>

              <ol className="space-y-4">
                {actionItems.map((item, i) => (
                  <li key={i} className="flex gap-4 items-start">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                      {i + 1}
                    </span>
                    <p className="text-muted-foreground pt-1">{item}</p>
                  </li>
                ))}
              </ol>
            </section>

            {/* Calculator CTA */}
            <section className="mb-10 not-prose">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 space-y-3">
                <h3 className="font-semibold text-lg">
                  Calculate Your Hidden SF, Free
                </h3>
                <p className="text-sm text-muted-foreground">
                  Use the BOMA 2024 Rentable Area Calculator to see exactly how
                  many additional billable square feet your building gains under
                  the 2024 standard.
                </p>
                <Button asChild>
                  <Link to="/tools/boma-2024-calculator">
                    Try the Free Calculator
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </section>

            {/* CTA */}
            <footer className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <h2 className="text-2xl font-bold mb-3">
                See Where Your CAM Denominators Stand
              </h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                CapVeri runs your CAM statements against current BOMA 2024
                standards, flags denominator mismatches, and calculates your
                exposure before it becomes a dispute.
              </p>
              <Button asChild size="lg">
                <Link to="/auth/register">
                  Run your first reconciliation free
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </footer>
          </article>
        </div>
      </div>

      <Footer />
    </div>
  )
}
