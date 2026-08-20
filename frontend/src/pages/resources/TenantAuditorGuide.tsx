/**
 * GEO-Optimized Resource Page: What Tenant Auditors Look For
 *
 * Article schema and answer-first structure for AI search engine optimization.
 * Audience: property controllers at mid-market PMCs receiving audit notifications.
 */

import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  TrendingDown,
  FileText,
  Calculator,
  ShieldCheck,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { buildSiteUrl } from '@/lib/domains'

// ============================================================================
// Data
// ============================================================================

const auditItems = [
  {
    name: 'CapEx/OpEx misclassification',
    icon: Building2,
    summary:
      'The highest-yield finding. Full roof replacement, chiller swap, or asphalt overlay billed as operating expense instead of capital. Auditors apply IRS Publication 946 and GAAP depreciation, then verify amortization schedules.',
    table: {
      headers: ['System', 'Allowable Operating Expense', 'Capital Expenditure'],
      rows: [
        [
          'Roofing',
          'Patching leaks, annual inspection',
          'Full tear-off and membrane replacement',
        ],
        [
          'HVAC',
          'Filter changes, seasonal service',
          'Full chiller or rooftop unit replacement',
        ],
        ['Paving', 'Pothole fill, restriping', 'Complete asphalt overlay'],
        ['Interior', 'Painting between tenants', 'Full lobby renovation'],
      ],
    },
  },
  {
    name: 'Gross-up applied to fixed costs',
    icon: Calculator,
    summary:
      'Gross-up should apply only to variable costs: janitorial, trash, utilities. Property insurance, real estate taxes, and exterior landscaping are fixed and do not change with occupancy. BDO and Springbord flag this as the single most common reconciliation error. In a building at 50% occupancy with $100K in variable costs, correct gross-up to 95% yields a 10% tenant share of $9,500. Any number higher on fixed items is an immediate audit objection.',
  },
  {
    name: 'Management fee base inflation',
    icon: TrendingDown,
    summary:
      "Landlords calculate percentage fees on a base that improperly includes CapEx, taxes, or insurance. Well-negotiated leases commonly exclude these items. BDO also documents double-billing: a percentage management fee charged for overhead while the same staff's direct payroll and benefits run separately in the CAM pool.",
  },
  {
    name: 'Ownership expenses bleeding into CAM',
    icon: AlertTriangle,
    summary:
      'Baker Tilly calls this "unallowed ownership expenses." The CAM pool reimburses property operations, not entity overhead. Auditors screen for executive salaries, leasing commissions, tenant improvement allowances, entity legal fees, and regional managers without direct daily property responsibility. Property management systems rarely force a clean ledger separation.',
  },
  {
    name: 'Pro-rata denominator manipulation',
    icon: FileText,
    summary:
      "Most leases define the denominator as Gross Leasable Area (GLA): total building SF, static. If a landlord uses Leased Area instead, a major tenant vacancy shrinks the denominator and spikes every remaining tenant's share. Springbord tracks mid-year rent roll changes to catch pro-rata adjustments that were never applied.",
  },
  {
    name: 'Base year baseline errors',
    icon: TrendingDown,
    summary:
      "Tenants pay only for increases above the base year. A low base year means a larger delta every year after. Auditors reconstruct the base year ledger to find two patterns: partial-vacancy years where the landlord didn't gross-up base year variable expenses, and methodology shifts where in-house maintenance switched to outside vendors after the base year, making normal operations look like a cost spike.",
  },
  {
    name: 'Utility double-billing and sub-meter markups',
    icon: ShieldCheck,
    summary:
      'High-consumption tenants (data centers, restaurants, 24-hour retailers) drive disproportionate utility costs that land in the general pool when not billed directly. After-hours HVAC revenue must be credited back to the utility pool, or the landlord collects twice. Sub-meter rate markups are often prohibited by lease language and state PUC regulations.',
  },
]

const selfAuditSteps = [
  {
    title: 'Run the CapEx screen',
    desc: "Pull every invoice over $5,000. Apply the IRS/GAAP test: does this expense extend useful life or increase asset value? If yes, it's capital. Verify an amortization schedule exists with a defensible useful life. A 3-year amortization on a roof replacement will be challenged immediately.",
  },
  {
    title: 'Validate your gross-up arithmetic',
    desc: 'Separate variable costs (janitorial, trash, utilities) from fixed costs (taxes, insurance, landscaping contracts). Re-run the gross-up on variable costs only. Check the multiplier against actual monthly occupancy reports, not an estimate.',
  },
  {
    title: 'Reconstruct the denominator',
    desc: "Pull rent roll data from Yardi or MRI for each month of the reconciliation year. Confirm the denominator in every tenant's calculation matches the GLA definition in their lease, not occupied area.",
  },
  {
    title: 'Audit the management fee base',
    desc: 'Find the exact lease language defining what costs are included in the fee calculation base. Cross-check it against the actual figure your accounting system used. If CapEx, taxes, or insurance appear in that base, flag it.',
  },
  {
    title: 'Isolate ownership expenses',
    desc: 'Export your GL. Search for corporate overhead allocations, leasing costs, legal fees, and above-property personnel costs. Any item hitting the CAM pool needs a paper trail that establishes it as a recoverable property expense.',
  },
]

const docTableRows = [
  {
    doc: 'Invoice-to-GL reconciliation',
    proves: 'Every dollar has a source document',
    gap: "Invoices don't match GL entries",
  },
  {
    doc: 'CapEx amortization schedule',
    proves: 'Capital items are spread over useful life',
    gap: 'Full expensing in year one',
  },
  {
    doc: 'Monthly occupancy reports',
    proves: 'Gross-up applied at correct occupancy level',
    gap: 'Approximated, not actual',
  },
  {
    doc: 'Vendor contracts',
    proves: 'Distinguishes fixed vs. variable costs',
    gap: '"We always estimated it"',
  },
  {
    doc: 'Management fee base calculation',
    proves: 'Fee applied to correct expense subset',
    gap: 'Calculated on total expenses',
  },
  {
    doc: 'Property vs. entity cost allocation',
    proves: 'Ownership expenses excluded',
    gap: 'Commingled ledger',
  },
]

// ============================================================================
// Page Component
// ============================================================================

export function TenantAuditorGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="What Tenant Auditors Look For | CapVeri"
        description="Discover what tenant auditors look for in CAM reconciliation: the 7 line items they check first, and how to audit yourself before disputes start."
        canonical="/resources/tenant-auditor-guide"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline:
              "What Tenant Auditors Look For: A Landlord's Defensive Playbook",
            description:
              'Discover what tenant auditors look for in CAM reconciliation: the 7 line items they check first, and how to audit yourself before disputes start.',
            author: { '@type': 'Organization', name: 'CapVeri' },
            publisher: { '@type': 'Organization', name: 'CapVeri' },
            datePublished: '2026-02-23',
            dateModified: '2026-02-23',
            url: buildSiteUrl('/resources/tenant-auditor-guide'),
          },
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Resources', url: '/resources' },
            {
              name: 'What Tenant Auditors Look For',
              url: '/resources/tenant-auditor-guide',
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

          {/* Main Content */}
          <article className="prose  max-w-none">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
              What Tenant Auditors Look For: A Landlord&apos;s Defensive
              Playbook
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
            <p className="text-lg text-muted-foreground mb-8">
              The audit isn&apos;t coming. It&apos;s already running. When your
              year-end reconciliation reaches a tenant&apos;s desk, firms like
              Baker Tilly and Springbord have automated tools that flag
              discrepancies before a human reviews a single line. A billing
              error above 3-5% of recoverable costs isn&apos;t just a refund. In
              most leases, it triggers the landlord&apos;s obligation to pay the
              tenant&apos;s audit costs outright. That changes the math on what
              &quot;close enough&quot; really means.
            </p>

            {/* ================================================================
                Section 1: Why Tenant Auditors Are Coming For You
            ================================================================ */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Why Tenant Auditors Are Coming For You
              </h2>

              {/* Stat callout */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 mb-6 not-prose">
                <h3 className="text-base font-semibold text-primary mb-3">
                  Key numbers
                </h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <strong>40%</strong> of CAM reconciliations contain material
                    billing errors (Tango Analytics)
                  </li>
                  <li>
                    <strong>15-20%</strong> of total CAM billed is recovered on
                    average by tenant audit firms (Springbord)
                  </li>
                  <li>
                    <strong>4 hrs/lease</strong> for manual abstraction: the
                    root of systemic error at scale (Springbord)
                  </li>
                </ul>
              </div>

              <p className="text-muted-foreground mb-4">
                The error rate exists for a specific reason. Springbord
                documents it plainly: manual lease abstraction takes four hours
                per document. A 30-building portfolio with 200 leases means 800
                hours of manual work per reconciliation cycle. The mistakes
                aren&apos;t malicious. They&apos;re arithmetic.
              </p>
              <p className="text-muted-foreground mb-4">
                Springbord&apos;s analysis of CAM reconciliation errors found
                that the majority of findings trace to internal process
                failures: inconsistent expense classification, undocumented
                gross-up methodology, and missing base year records. Most of
                these are preventable before the reconciliation goes out.
              </p>
              <p className="text-muted-foreground mb-4">
                Leasecake has documented when audits get triggered: lease
                renewals, property ownership transfers, year-end NNN
                reconciliation letters, and corporate acquisitions. Those
                aren&apos;t random. They&apos;re the moments when a
                tenant&apos;s legal team reviews lease language in detail for
                the first time in years.
              </p>
              <p className="text-muted-foreground">
                ASC 842 raised the stakes further. Commercial tenants now
                recognize operating leases on their balance sheets as
                Right-of-Use (ROU) assets. An inflated CAM bill doesn&apos;t
                just hit the income statement. It distorts the ROU asset
                calculation, affecting financial ratios that matter to investors
                and lenders. That gives CFOs a second reason to care about
                reconciliation accuracy.
              </p>
            </section>

            {/* ================================================================
                Section 2: The 7 Things They Check First
            ================================================================ */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                The 7 Things They Check First
              </h2>
              <p className="text-muted-foreground mb-6">
                Auditors don&apos;t start randomly. Every firm runs a targeted
                sweep against the line items where property management
                accounting systems fail most predictably.
              </p>

              <div className="space-y-6 not-prose">
                {auditItems.map((item, index) => (
                  <div key={item.name} className="border rounded-lg p-5">
                    <div className="flex items-start gap-4 mb-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-base">{item.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.summary}
                        </p>
                      </div>
                    </div>

                    {/* CapEx/OpEx classification table for item 1 */}
                    {item.table && (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <caption className="sr-only">
                            Audit checklist details
                          </caption>
                          <thead>
                            <tr className="border-b">
                              {item.table.headers.map((h) => (
                                <th
                                  key={h}
                                  className="text-left font-semibold py-2 pr-4 text-xs uppercase tracking-wide text-muted-foreground"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {item.table.rows.map((row) => (
                              <tr
                                key={row[0]}
                                className="border-b last:border-0"
                              >
                                {row.map((cell, i) => (
                                  <td
                                    key={`${row[0]}-${i}`}
                                    className="py-2 pr-4 text-muted-foreground align-top"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ================================================================
                Section 3: How to Audit Yourself Before They Do
            ================================================================ */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                How to Audit Yourself Before They Do
              </h2>
              <p className="text-muted-foreground mb-6">
                You don&apos;t need an audit firm. Run the same screens they run
                before the reconciliation goes out.
              </p>

              <div className="space-y-4 not-prose">
                {selfAuditSteps.map((step, index) => (
                  <div key={step.title} className="flex gap-4 items-start">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{step.title}</h3>
                      <p className="text-muted-foreground text-sm mt-1">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-muted-foreground mt-6 text-sm">
                Estimate your potential exposure before sending reconciliations
                with the{''}
                <Link
                  to="/tools/cam-leakage-estimator"
                  className="text-primary hover:underline font-medium"
                >
                  CAM Billing Risk Estimator
                </Link>
                .
              </p>
            </section>

            {/* ================================================================
                Section 4: Documentation That Stops Disputes Cold
            ================================================================ */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Documentation That Stops Disputes Cold
              </h2>
              <p className="text-muted-foreground mb-6">
                A correct reconciliation that&apos;s poorly documented is harder
                to defend than a well-documented one that&apos;s slightly off.
                Audit clauses give tenants 12-36 months to request records
                retroactively. The documentation gap on closed years reopens
                disputes that should be settled.
              </p>

              <div className="not-prose overflow-x-auto">
                <table className="w-full text-sm border-collapse border rounded-lg">
                  <caption className="sr-only">
                    Dispute settlement reference
                  </caption>
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th
                        scope="col"
                        className="text-left font-semibold py-3 px-4"
                      >
                        Document
                      </th>
                      <th
                        scope="col"
                        className="text-left font-semibold py-3 px-4"
                      >
                        What It Proves
                      </th>
                      <th
                        scope="col"
                        className="text-left font-semibold py-3 px-4"
                      >
                        Common Gap
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {docTableRows.map((row) => (
                      <tr key={row.doc} className="border-b last:border-0">
                        <td className="py-3 px-4 font-medium">{row.doc}</td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {row.proves}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {row.gap}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-muted-foreground mt-4 text-sm">
                Use the{''}
                <Link
                  to="/resources/cam-presend-checklist"
                  className="text-primary hover:underline font-medium"
                >
                  CAM Pre-Send Checklist
                </Link>
                {''}
                before sending reconciliations to verify each of these is ready.
              </p>
            </section>

            {/* ================================================================
                CTA Band
            ================================================================ */}
            <section className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <p className="text-2xl font-bold mb-3">
                Reconcile it right before the auditor sees it
              </p>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                CapVeri automatically surfaces the errors in this guide against
                your actual Yardi or MRI data. Upload your CAM reconciliation
                and get a line-by-line discrepancy report before it goes out, or
                before an auditor requests your records.
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
