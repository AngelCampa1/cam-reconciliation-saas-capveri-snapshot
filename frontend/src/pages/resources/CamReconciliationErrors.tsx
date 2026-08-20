/**
 * CAM Reconciliation Errors. /resources/cam-reconciliation-errors
 *
 * Authoritative guide to the 7 most costly CAM billing errors, sourced
 * directly from the calculation service logic (gross_up.py, caps.py,
 * occupancy.py, tenant_share.py, base_year.py).
 */

/* eslint-disable react-refresh/only-export-components */

import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import type { FAQ } from '@/components/landing/FAQSection'
import { buildSiteUrl } from '@/lib/domains'

// ============================================================================
// FAQ Data
// ============================================================================

export const CAM_ERRORS_FAQS: FAQ[] = [
  {
    question: 'What is the most common CAM reconciliation error?',
    answer:
      "Two data-entry mistakes show up more than anything else: gross-up applied to a building that's already at target occupancy, and cap rates typed as whole numbers (5 instead of 0.05). Billing systems accept both without complaint. The first over-bills tenants on every reconciliation where actual occupancy meets the target. The second makes the cap meaningless.",
  },
  {
    question: 'How do I know if my CAM statement has a gross-up error?',
    answer:
      'Divide your target occupancy by actual occupancy. If actual is at or above target, the result should be exactly 1.0. Any factor above 1.0 in that situation is wrong. On a $200,000 pool, even a factor of 1.03 adds $6,000 in charges that should not exist.',
  },
  {
    question: 'Can a tenant dispute a CAM reconciliation error?',
    answer:
      'Yes, within the audit window. That is typically 12 to 36 months from when the statement was delivered. Tenants can request supporting documentation and dispute specific charges. Gross-up and cap errors are among the most common issues raised. Once the window closes, the right to challenge prior-year statements is usually gone.',
  },
  {
    question: 'What is a cumulative CAM cap and how does the cap bank work?',
    answer:
      "When actual CAM growth comes in below the cap limit, the difference carries forward as a bank. If the cap is 5% but expenses only grew 2%, the landlord banks 3%. In a later year with 8% growth, the landlord can draw from the bank and pass through more than the base cap would allow. Once drawn, the banked capacity is gone. Landlords sometimes treat it as indefinitely accumulating; tenants sometimes don't know it exists. Both create disputes.",
  },
  {
    question: 'How does CapVeri detect these errors automatically?',
    answer:
      'Upload your GL export and CapVeri runs each of the seven checks against your lease terms: gross-up factor vs. actual occupancy, cap rate format, zero prior-year traps, overlapping and reversed lease dates, admin fee sequence, and base year anomalies. Each issue gets a dollar-impact estimate, not just a flag.',
  },
]

// ============================================================================
// Page Component
// ============================================================================

export function CamReconciliationErrorsPage() {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '7 CAM Reconciliation Errors That Cost Landlords the Most',
    description:
      'The most common and costly CAM reconciliation errors (gross-up mistakes, cap rate typos, occupancy miscalculations, and admin fee logic flaws) with dollar impacts and fixes.',
    author: { '@type': 'Organization', name: 'CapVeri' },
    publisher: { '@type': 'Organization', name: 'CapVeri' },
    datePublished: '2026-02-23',
    dateModified: '2026-02-23',
    url: buildSiteUrl('/resources/cam-reconciliation-errors'),
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="7 CAM Reconciliation Errors That Cost Property Managers the Most | CapVeri"
        description="The most common CAM reconciliation errors (gross-up mistakes, cap rate typos, zero prior year traps, and admin fee logic flaws) with dollar impacts and fixes for property managers."
        canonical="/resources/cam-reconciliation-errors"
        ogType="article"
        structuredData={[
          articleSchema,
          structuredDataSchemas.faqPage(CAM_ERRORS_FAQS),
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Resources', url: '/resources' },
            {
              name: 'CAM Reconciliation Errors',
              url: '/resources/cam-reconciliation-errors',
            },
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
            aria-label="Back to Resources"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Resources
          </Link>

          {/* Main Content */}
          <article className="prose  max-w-none">
            <header>
              <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
                7 CAM Reconciliation Errors That Cost Landlords the Most
              </h1>

              {/* Byline */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground mb-6 not-prose">
                <span>
                  By{''}
                  <strong className="font-medium text-foreground">
                    CapVeri
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <time dateTime="2026-02-23">Updated February 23, 2026</time>
              </div>

              {/* Quick Answer Box */}
              <div
                data-testid="quick-answer"
                className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-5 mb-8 not-prose"
                aria-label="Quick summary"
              >
                <p className="text-sm font-semibold text-primary mb-1">
                  Quick Answer
                </p>
                <p className="text-sm text-muted-foreground">
                  Seven specific errors cause most of the dollar damage in CAM
                  reconciliations: gross-up applied to a building already at
                  target occupancy, cap rates typed as whole numbers instead of
                  decimals, a zero prior-year that zeroes out the cap entirely,
                  the cumulative cap bank treated as unlimited, occupancy
                  records thrown off by overlapping or reversed lease dates,
                  admin fees calculated before the cap reduces the tenant's
                  share, and a base year set during an anomaly year. Most go
                  unnoticed for years.
                </p>
              </div>
            </header>

            {/* ----------------------------------------------------------------
                Error 1: Gross-Up When Building Is Already Full
            ---------------------------------------------------------------- */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-3">
                1. Applying Gross-Up When the Building Is Already Full
              </h2>
              <p className="text-muted-foreground mb-3">
                The gross-up adjustment normalizes CAM expenses to what they
                would be at full occupancy. Tenants in a half-empty building
                should not benefit from artificially low costs. They pay based
                on what the building would cost to run when fully occupied. The
                formula is:
              </p>
              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-3">
                factor = target_occupancy / actual_occupancy
              </div>
              <p className="text-muted-foreground mb-3">
                The error is straightforward: when actual occupancy already
                meets or exceeds the target, the formula produces a factor above
                1.0. That means expenses are grossed up past what they would be
                at 100% occupancy, which is not possible. No gross-up should
                apply when actual occupancy ≥ target.
              </p>
              <p className="text-muted-foreground">
                On a $200,000 CAM pool, a factor of 1.03 adds $6,000 in charges
                that should not be there. Tenants who eventually audit will
                demand that back, sometimes with interest.
              </p>
            </section>

            {/* ----------------------------------------------------------------
                Error 2: Cap Rate as Percentage Instead of Decimal
            ---------------------------------------------------------------- */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-3">
                2. Cap Rate Entered as a Percentage Instead of a Decimal
              </h2>
              <p className="text-muted-foreground mb-3">
                Lease abstracts say things like "5% annual cap." The calculation
                engine wants{''}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  0.05
                </code>
                , not{''}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">5</code>.
                Entering{''}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">5</code>
                {''}
                sets a 500% cap, which is no cap at all.
              </p>
              <p className="text-muted-foreground mb-3">
                The inverse also happens: entering{''}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  105
                </code>
                {''}
                instead of{''}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  1.05
                </code>
                . Some systems read cap rates above 1.0 as "105% of prior year."
                Others reject the value outright. Either way, the result is
                wrong.
              </p>
              <p className="text-muted-foreground">
                Pull your cap rates from the billing system and check them
                against the leases. A value above 2.0 is almost certainly a data
                entry error. A value of exactly 5 or 10 is the textbook version
                of this mistake.
              </p>
            </section>

            {/* ----------------------------------------------------------------
                Error 3: Zero Prior Year Locking Tenants Out
            ---------------------------------------------------------------- */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-3">
                3. Zero Prior Year Locking Tenants Out of CAM Charges
              </h2>
              <p className="text-muted-foreground mb-3">
                Non-cumulative cap calculations determine the maximum allowed
                charge as:
              </p>
              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-3">
                max_allowed = prior_year_cam × (1 + cap_rate)
              </div>
              <p className="text-muted-foreground mb-3">
                New tenants have no prior year. Prior year CAM = $0, so
                max_allowed = $0. The tenant owes nothing regardless of actual
                CAM expenses. Mathematically correct. Economically nonsensical.
                The intent was to cap growth from a starting baseline, not to
                set the entire cap at zero.
              </p>
              <p className="text-muted-foreground">
                When prior year CAM is $0, skip the cap and bill the full
                pro-rata share. The cap should only apply starting Year 2. Many
                billing systems handle this wrong and will not tell you.
              </p>
            </section>

            {/* ----------------------------------------------------------------
                Error 4: Cumulative Cap Bank Misunderstanding
            ---------------------------------------------------------------- */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-3">
                4. Misunderstanding the Cumulative Cap Bank
              </h2>
              <p className="text-muted-foreground mb-3">
                A cumulative cap lets landlords bank the difference between
                actual growth and the cap limit. Spend less than the cap allows
                and the difference carries forward. Here is what that looks like
                over three years with a 5% cap and a $100,000 starting base:
              </p>
              <div className="overflow-x-auto rounded-lg border mb-3">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    CAM reconciliation errors reference
                  </caption>
                  <thead>
                    <tr className="bg-muted/50">
                      <th
                        scope="col"
                        className="text-left px-4 py-2 font-semibold"
                      >
                        Year
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-2 font-semibold"
                      >
                        Actual Growth
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-2 font-semibold"
                      >
                        Cap Limit
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-2 font-semibold"
                      >
                        Bank Balance
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-2 font-semibold"
                      >
                        Amount Billed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-background">
                      <td className="px-4 py-2">Year 1</td>
                      <td className="px-4 py-2">2%</td>
                      <td className="px-4 py-2">5%</td>
                      <td className="px-4 py-2">+3% banked</td>
                      <td className="px-4 py-2">$102,000</td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className="px-4 py-2">Year 2</td>
                      <td className="px-4 py-2">3%</td>
                      <td className="px-4 py-2">5%</td>
                      <td className="px-4 py-2">+5% banked (8% total)</td>
                      <td className="px-4 py-2">$105,060</td>
                    </tr>
                    <tr className="bg-background">
                      <td className="px-4 py-2">Year 3</td>
                      <td className="px-4 py-2">10%</td>
                      <td className="px-4 py-2">5% + 8% bank = 13%</td>
                      <td className="px-4 py-2">−8% drawn; $0 balance</td>
                      <td className="px-4 py-2">$116,617</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground">
                Once the bank is drawn, it is gone. Landlords who think it
                accumulates indefinitely will over-collect when expenses spike.
                Tenants who do not understand the bank will dispute a Year 3
                bill that looks like a 10% increase when the cap said 5%.
              </p>
            </section>

            {/* ----------------------------------------------------------------
                Error 5: Occupancy Miscalculations
            ---------------------------------------------------------------- */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-3">
                5. Occupancy Miscalculations from Overlapping or Reversed Lease
                Dates
              </h2>
              <p className="text-muted-foreground mb-3">
                Pro-rata calculations start with occupancy. Get occupancy wrong
                and every tenant's share is wrong. Two data entry mistakes do
                this without any error message:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-3">
                <li>
                  <strong>Overlapping leases:</strong> two tenants recorded in
                  the same space during the same period. Building occupancy
                  exceeds 100%, which breaks the denominator for every tenant,
                  not just the two with the conflict.
                </li>
                <li>
                  <strong>Reversed dates:</strong> end date before start date.
                  Most billing systems silently skip these leases. Enough
                  skipped leases and the building looks nearly vacant, sending
                  the gross-up factor to extreme values.
                </li>
              </ul>
              <p className="text-muted-foreground">
                Before every reconciliation, total the active lease square
                footage for each billing period. It should never exceed the
                building's rentable area. Any lease where end date ≤ start date
                needs fixing before the numbers touch a reconciliation.
              </p>
            </section>

            {/* ----------------------------------------------------------------
                Error 6: Admin Fee Before Caps
            ---------------------------------------------------------------- */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-3">
                6. Admin Fee Calculated Before Caps Are Applied
              </h2>
              <p className="text-muted-foreground mb-3">
                Admin fees (typically 10% to 15%) cover the landlord's cost of
                managing common areas. They should apply to what the tenant
                actually owes after cap reduction, not to the full expense pool
                before any cap is applied.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-3 space-y-1">
                <p className="text-destructive-strong">
                  ✗ Wrong: admin_fee = expense_pool × 0.15
                </p>
                <p className="text-success-strong">
                  ✓ Correct: admin_fee = tenant_share_after_cap × 0.15
                </p>
              </div>
              <p className="text-muted-foreground">
                Say the cap reduces a tenant's share from $30,000 to $22,000.
                Admin fee on the gross pool: $4,500. Admin fee on the capped
                share: $3,300. That $1,200 error repeats every year, across
                every capped tenant in the building. Most leases are explicit
                that admin fees apply to the reconciled share, not the pool.
              </p>
            </section>

            {/* ----------------------------------------------------------------
                Error 7: Base Year During Anomaly Year
            ---------------------------------------------------------------- */}
            <section className="mb-10 not-prose">
              <h2 className="text-2xl font-semibold mb-3">
                7. Base Year Selected During an Anomaly Year
              </h2>
              <p className="text-muted-foreground mb-3">
                In a base-year lease, the tenant pays only for CAM increases
                above the base. Set the base during a year with 20% to 30%
                vacancy and you have locked in an artificially low floor. Every
                subsequent year, normal occupancy-level expenses look like a
                large spike.
              </p>
              <p className="text-muted-foreground mb-3">
                A tenant who signed in 2021 with a 2021 base might have base
                year CAM of $8/SF. By 2025, fully occupied, the building runs
                $12/SF. The tenant pays $4/SF more than they should every year,
                not because anything grew abnormally but because the floor was
                wrong from the start.
              </p>
              <p className="text-muted-foreground">
                The fix is base-year normalization: gross up the base year
                expenses to what they would have been at target occupancy, then
                use that as the baseline. Leases negotiated during vacancy-heavy
                years should spell this out explicitly. Many do not. The
                landlord collects the difference until the tenant audits.
              </p>
            </section>

            {/* ----------------------------------------------------------------
                FAQ Section
            ---------------------------------------------------------------- */}
            <section className="mb-10 not-prose" id="faq">
              <h2 className="text-2xl font-semibold mb-6">
                Frequently Asked Questions
              </h2>
              <div className="divide-y divide-border rounded-lg border border-border px-6">
                {CAM_ERRORS_FAQS.map((faq, index) => (
                  <div key={index} className="py-5">
                    <h3 className="text-base font-medium text-foreground mb-2">
                      {faq.question}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA */}
            <footer className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <h2 className="text-2xl font-bold mb-3">
                Find These Errors in Your CAM Statements
              </h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                Upload your GL export and CapVeri checks all seven of these
                patterns against your lease terms. You get a variance report
                with dollar figures attached. No spreadsheets. No ERP
                integration.
              </p>
              <Button asChild size="lg">
                <Link to="/auth/register">
                  Start Free Trial
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
