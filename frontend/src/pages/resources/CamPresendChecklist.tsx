/**
 * Resource Page: CAM Reconciliation Pre-Send Checklist
 *
 * Desk-reference for property controllers. 12 checks before sending
 * any CAM reconciliation statement.
 */

import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckSquare, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { buildSiteUrl } from '@/lib/domains'

// ============================================================================
// Checklist data
// ============================================================================

const CHECKLIST_ITEMS = [
  {
    number: 1,
    title: 'GL Exclusion Scrub',
    subtitle: 'Remove CapEx from the recoverable pool',
    why: 'CapEx inclusions drive 30% of all CAM disputes (BOMA International). One roof replacement coded to the wrong account poisons the entire statement.',
    verify:
      'Lease exclusions clause; property CapEx schedule for the fiscal year.',
  },
  {
    number: 2,
    title: 'Variable vs. Fixed Expense Classification',
    subtitle:
      'Separate variable expenses from fixed before running any gross-up',
    why: 'Gross-up can only legally apply to variable expenses. Applying it to fixed costs (landscaping, property taxes, insurance) breaks IREM standards and is the first thing a forensic auditor checks.',
    verify:
      'IREM expense definitions; lease gross-up clause expense categories.',
  },
  {
    number: 3,
    title: 'Gross-Up Calculation Audit',
    subtitle:
      'Variable expenses only, correct occupancy %, correct target from lease',
    why: 'A misapplied gross-up either contaminates the base year or inflates tenant bills. Both are recoverable by audit firms.',
    verify:
      'Gross-up clause target occupancy % (typically 95% or 100%); actual move-in/move-out occupancy log for the fiscal year.',
  },
  {
    number: 4,
    title: 'Pro-Rata Denominator Reconciliation',
    subtitle:
      'Confirm building RSF basis matches the standard cited in the lease',
    why: 'Denominator errors compound across every line item. A wrong denominator creates 5% to 10% systemic variance across the entire rent roll.',
    verify:
      'BOMA standard cited in lease (1996 / 2010 / 2017 / 2024); most recent measurement certificate.',
  },
  {
    number: 5,
    title: 'Mid-Year Occupancy Adjustment',
    subtitle:
      'Time-weight all SF changes for tenants who moved, expanded, or contracted',
    why: 'Applying year-end SF to the full 12-month period is a contractual breach. Audit firms find this in the first 30 minutes of any review.',
    verify:
      'Lease amendment execution dates; PM software tenant SF history report.',
  },
  {
    number: 6,
    title: 'Pro-Rata Share Math',
    subtitle: 'Confirm all shares sum to ≤100%',
    why: 'Shares above 100% means double-collecting. Shares below 100% means revenue leakage. Both are structural errors that surface immediately in any competent audit.',
    verify: 'Sum of all tenant RSF ÷ building RSF denominator = ≤1.00.',
  },
  {
    number: 7,
    title: 'Tenant-Specific Lease Exclusions',
    subtitle: 'Remove exclusions before calculating, not after',
    why: 'Billing even one excluded expense invites a full forensic audit of the entire GL. The exposure is not limited to the single line item.',
    verify:
      'Lease abstract exclusions clause per tenant; Yardi/MRI recovery pool configuration per tenant ledger.',
  },
  {
    number: 8,
    title: 'Cap Structure Verification',
    subtitle:
      'Apply the correct cap logic: cumulative vs. non-cumulative, controllable only',
    why: 'Misapplying a cumulative cap as non-cumulative (or the reverse) creates 5% to 15% billing errors. Tenants with sophisticated lease administrators will catch this immediately.',
    verify:
      'Cap clause language (base period, cumulative vs. non-cumulative, cap %); prior-year CAM actuals as the base.',
  },
  {
    number: 9,
    title: 'Controllable vs. Uncontrollable Segregation',
    subtitle: 'Taxes, insurance, and snow removal bypass the cap',
    why: 'Applying caps to uncontrollable expenses is a lease violation. Missing the carve-out for taxes and insurance is a landlord undercharge.',
    verify:
      'Lease cap clause definition of "controllable"; GL account mapping for taxes (GL 6XXX) vs. controllable maintenance.',
  },
  {
    number: 10,
    title: 'Management Fee and Administrative Markup Audit',
    subtitle:
      'One fee, one calculation base, no corporate overhead in the pool',
    why: 'Duplicative management fee structures have produced $9M recoveries in single-lease audits. In Texas, undisclosed fee methods violate Property Code §93.012, rendering the entire assessment invalid.',
    verify:
      'Lease management fee clause (calculation base + % ceiling); GL management fee account contains only the third-party PM fee.',
  },
  {
    number: 11,
    title: 'Vendor Invoice Completeness',
    subtitle: 'Close AP before the statement closes. Chase stragglers now',
    why: 'A December invoice posted in February cannot be back-billed in most leases. The landlord absorbs the shortfall permanently.',
    verify:
      'AP aging report filtered to prior fiscal year; active vendor contracts vs. posted invoices; year-end accruals.',
  },
  {
    number: 12,
    title: 'Statement Delivery Deadline Verification',
    subtitle: 'Know your billing window per tenant before you send anything',
    why: 'Missing the contractual billing window permanently forfeits the true-up balance. Sophisticated tenants will refuse payment citing landlord breach.',
    verify:
      'Reconciliation clause deadline per lease; delivery schedule sorted by earliest deadline across the rent roll.',
  },
]

// ============================================================================
// Page Component
// ============================================================================

export function CamPresendChecklistPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="CAM Reconciliation Pre-Send Checklist | CapVeri"
        description="The CAM reconciliation pre-send checklist for property controllers: 12 actionable checks covering GL scrubs, pro-rata math, cap structures, and gross-ups."
        canonical="/resources/cam-presend-checklist"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'CAM Reconciliation Pre-Send Checklist',
            description:
              '12 checks property controllers must run before sending any CAM reconciliation statement.',
            author: { '@type': 'Organization', name: 'CapVeri' },
            publisher: { '@type': 'Organization', name: 'CapVeri' },
            datePublished: '2026-02-23',
            dateModified: '2026-02-23',
            url: buildSiteUrl('/resources/cam-presend-checklist'),
          },
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Resources', url: '/resources' },
            {
              name: 'CAM Pre-Send Checklist',
              url: '/resources/cam-presend-checklist',
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
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Resources
          </Link>

          <article className="prose  max-w-none">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
              CAM Reconciliation Pre-Send Checklist
            </h1>

            {/* Byline */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
              <span>
                By{''}
                <strong className="font-medium text-foreground">CapVeri</strong>
              </span>
              <span aria-hidden="true">·</span>
              <time dateTime="2026-02-23">Updated February 23, 2026</time>
            </div>

            {/* Intro */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 mb-8 not-prose">
              <h2 className="text-lg font-semibold text-primary mb-2 flex items-center gap-2">
                <CheckSquare className="w-5 h-5" />
                12 checks before you send anything
              </h2>
              <p className="text-foreground">
                Disputes rarely come from bad intentions. They come from a
                December invoice that never got posted, a gross-up formula
                applied to the wrong accounts, or a BOMA denominator that
                hasn&apos;t been touched since 2017. Run this list before you
                send anything.
              </p>
            </div>

            {/* Checklist Items */}
            <section className="mb-10 not-prose space-y-4">
              {CHECKLIST_ITEMS.map((item) => (
                <div
                  key={item.number}
                  className="border rounded-lg p-5 bg-card"
                >
                  <div className="flex gap-4">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                      {item.number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base mb-0.5">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {item.subtitle}
                      </p>
                      <dl className="space-y-1.5 text-sm">
                        <div>
                          <dt className="inline font-medium text-foreground">
                            Why:{''}
                          </dt>
                          <dd className="inline text-muted-foreground">
                            {item.why}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-foreground">
                            Verify against:{''}
                          </dt>
                          <dd className="inline text-muted-foreground">
                            {item.verify}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* Cross-links */}
            <section className="mb-10 not-prose">
              <h2 className="text-xl font-semibold mb-4">Related Resources</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Link
                  to="/resources/tenant-auditor-guide"
                  className="flex items-start gap-3 p-4 border rounded-lg hover:border-primary transition-colors duration-200"
                >
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">
                      What Tenant Auditors Look For
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      The other side of this checklist
                    </div>
                  </div>
                </Link>
                <Link
                  to="/tools/cam-leakage-estimator"
                  className="flex items-start gap-3 p-4 border rounded-lg hover:border-primary transition-colors duration-200"
                >
                  <CheckSquare className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">
                      CAM Billing Risk Estimator
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Quantify your exposure before you send
                    </div>
                  </div>
                </Link>
              </div>
            </section>

            {/* CTA */}
            <section className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <h2 className="text-2xl font-bold mb-3">
                Automate Checks 1 to 9 in Minutes
              </h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                CapVeri runs GL scrub, gross-up validation, pro-rata math, and
                cap structure checks automatically, using your own GL export and
                lease abstracts.
              </p>
              <Button asChild size="lg">
                <Link to="/auth/register">
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </section>
          </article>
        </div>
      </div>

      <Footer />
    </div>
  )
}
