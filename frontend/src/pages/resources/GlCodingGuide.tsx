/**
 * Resource Page: GL Coding Guide for CAM Recoverable Expenses
 *
 * Authoritative desk-reference for property accountants covering recoverable
 * costs, capital exclusions, gray-area disputes, and compounding risk analysis.
 */

import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { buildSiteUrl } from '@/lib/domains'

const SEO_TITLE = 'GL Coding Guide: CAM Recoverable Expenses | CapVeri'
const SEO_DESCRIPTION =
  'GL coding guide for CAM recoverable expenses: categorized reference for property accountants covering recoverable costs, capital exclusions, and gray-area disputes.'

// ============================================================================
// Data
// ============================================================================

const recoverableRows = [
  {
    code: '6110',
    category: 'R&M: Roof',
    examples: 'Patching, flashing repair, gutter clearing',
    standard: 'IRS §162 routine maintenance',
  },
  {
    code: '6120',
    category: 'R&M: HVAC',
    examples:
      'Annual PM contracts, coil cleaning, single RTU in multi-unit system',
    standard:
      'IRS Routine Maintenance Safe Harbor (UOP doctrine: one of several units)',
  },
  {
    code: '6130',
    category: 'R&M: Parking Lot',
    examples: 'Sealcoating, restriping, pothole fill, crack seal',
    standard: 'IRS §162',
  },
  {
    code: '6140',
    category: 'Landscaping',
    examples: 'Mowing, weeds, seasonal annuals, mulch, irrigation PM',
    standard: 'Industry standard / BOMA EER',
  },
  {
    code: '6150',
    category: 'Security Services',
    examples: 'Guard wages, monthly monitoring, alarm response fees',
    standard: 'BOMA EER',
  },
  {
    code: '6510',
    category: 'Real Estate Taxes',
    examples: 'Municipal property taxes, special assessments',
    standard: 'NNN lease standard; uncontrollable',
  },
  {
    code: '6520',
    category: 'Property Insurance',
    examples: 'Hazard, fire, liability premiums',
    standard: 'NNN lease standard; uncontrollable',
  },
  {
    code: '6530',
    category: 'Common Area Utilities',
    examples: 'Lobby/lot electricity, water, gas',
    standard: 'NNN lease standard; uncontrollable',
  },
  {
    code: '6810',
    category: 'Amortized Cost-Saving CapEx',
    examples: 'Annual fraction of LED retrofit or efficient HVAC replacement',
    standard: 'BOMA exception: cost-saving capital, amortized over useful life',
  },
]

const nonRecoverableRows = [
  {
    code: '1510',
    category: 'Roof & Structural Replacements',
    examples: 'Full tear-off, new membrane, structural overhaul',
    reason: 'IRS §263(a): Restoration of major building component',
  },
  {
    code: '1520',
    category: 'HVAC Capital',
    examples:
      'Sole-chiller replacement, complete ductwork overhaul, all RTUs replaced simultaneously',
    reason: 'IRS §263(a): Restoration of HVAC UOP',
  },
  {
    code: '1530',
    category: 'Land & Parking Improvements',
    examples: 'Mill-and-overlay, full-depth repave, new parking structure',
    reason: 'IRS §263(a): Betterment/Restoration; RioCan precedent',
  },
  {
    code: '1540',
    category: 'Security Hardware',
    examples: 'CCTV network, biometric turnstiles, access control wiring',
    reason: 'Long-term fixed asset (MACRS 7 yr); not a service',
  },
  {
    code: '1550',
    category: 'Major Landscape Redesign',
    examples: 'New irrigation system, mature trees, retaining walls, hardscape',
    reason: 'Adaptation to new use (IRS BRA test)',
  },
  {
    code: '7110',
    category: 'Leasing Commissions',
    examples: 'Broker fees, TI allowances, marketing',
    reason: 'Landlord cost; no operating benefit to tenants',
  },
  {
    code: '7120',
    category: 'Software Subscriptions',
    examples: 'Yardi/MRI SaaS, corporate IT',
    reason: 'Admin overhead unless lease explicitly permits',
  },
  {
    code: '7130',
    category: 'Off-Site Management Payroll',
    examples: 'Executive salaries, corporate accounting staff',
    reason: 'Landlord overhead; double-dip risk with admin fee',
  },
]

const grayAreaRows = [
  {
    expense: 'Roof work',
    recoverable: '6110 if localized repair: patching, flashing, gutter clear',
    nonRecoverable: '1510 if full membrane replacement or structural scope',
    defaultCode: '6110 / 1510',
  },
  {
    expense: 'HVAC work',
    recoverable: '6120 if single component in multi-unit system; routine PM',
    nonRecoverable:
      '1520 if only chiller replaced or all units replaced simultaneously',
    defaultCode: '6120 / 1520',
  },
  {
    expense: 'Parking lot',
    recoverable: '6130 if sealcoat, restripe, potholes, crack seal',
    nonRecoverable: '1530 if mill-and-overlay or sub-base excavation',
    defaultCode: '6130 / 1530',
  },
  {
    expense: 'Landscaping',
    recoverable: '6140 if routine mowing, planting, mulch, irrigation PM',
    nonRecoverable:
      '1550 if new irrigation system, hardscape redesign, or mature trees installed',
    defaultCode: '6140 / 1550',
  },
  {
    expense: 'Security',
    recoverable: '6150 if monthly monitoring contracts or guard wages',
    nonRecoverable: '1540 if initial hardware purchase and installation',
    defaultCode: '6150 / 1540',
  },
  {
    expense: 'PropTech / SaaS',
    recoverable:
      '6530 variant if lease explicitly lists "technology infrastructure"',
    nonRecoverable:
      '7120 if no explicit lease language (default non-recoverable)',
    defaultCode: '7120',
  },
  {
    expense: 'Admin overhead',
    recoverable:
      '6140 to 6150 range for on-site maintenance/engineer wages, direct mgmt fee (3% to 5%)',
    nonRecoverable:
      '7130 if charging admin fee AND exec salaries simultaneously (double-dip)',
    defaultCode: '6140 to 7130',
  },
]

// ============================================================================
// Sub-components
// ============================================================================

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">GL coding reference table</caption>
        {children}
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b bg-muted px-4 py-3 text-left font-semibold text-muted-foreground"
    >
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="border-b px-4 py-3 text-muted-foreground align-top last:border-b-0">
      {children}
    </td>
  )
}

function CodeBadge({ code }: { code: string }) {
  return (
    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">
      {code}
    </span>
  )
}

// ============================================================================
// Page Component
// ============================================================================

export function GlCodingGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={SEO_TITLE}
        description={SEO_DESCRIPTION}
        canonical="/resources/gl-coding-guide"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: SEO_TITLE,
            description: SEO_DESCRIPTION,
            author: { '@type': 'Organization', name: 'CapVeri' },
            publisher: { '@type': 'Organization', name: 'CapVeri' },
            datePublished: '2026-02-23',
            dateModified: '2026-02-23',
            url: buildSiteUrl('/resources/gl-coding-guide'),
          },
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Resources', url: '/resources' },
            { name: 'GL Coding Guide', url: '/resources/gl-coding-guide' },
          ]),
        ]}
      />
      <LandingNav variant="light" />

      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
            <Link
              to="/"
              className="hover:text-foreground transition-colors duration-200"
            >
              Home
            </Link>
            <span>/</span>
            <Link
              to="/resources"
              className="hover:text-foreground transition-colors duration-200"
            >
              Resources
            </Link>
            <span>/</span>
            <span className="text-foreground">GL Coding Guide</span>
          </nav>

          {/* Back link */}
          <Link
            to="/resources"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Resources
          </Link>

          <article className="prose  max-w-none">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
              GL Coding Guide for CAM Recoverable Expenses
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

            {/* Lead */}
            <p className="text-lg text-muted-foreground mb-8">
              The GL code is your first and last line of defense in a CAM
              dispute. One wrong account code can turn a routine invoice into a
              multi-year liability.
            </p>

            {/* Quick-reference callout */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 mb-10 not-prose">
              <h2 className="text-lg font-semibold text-primary mb-2 flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                How to Use This Guide
              </h2>
              <p className="text-foreground text-sm">
                Three sections: <strong>Clearly Recoverable</strong>
                {''}
                (6000-series), <strong>Non-Recoverable Capital</strong>
                {''}
                (1000/7000-series), and <strong>Gray-Area</strong> with decision
                rules. The governing standard cited for each row is the fastest
                path to audit defense. When in doubt, default to
                non-recoverable. The burden of proof sits with the landlord.
              </p>
            </div>

            {/* ── Section 1: Clearly Recoverable ── */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold mb-2">
                1. Clearly Recoverable Operating Expenses
              </h2>
              <p className="text-muted-foreground mb-6 text-sm">
                These expenses pass through to tenants under a standard NNN
                lease. They survive the IRS §162 / BOMA EER test because they
                keep the property in its ordinary operating condition without
                extending its designed useful life.
              </p>

              <TableWrapper>
                <thead>
                  <tr>
                    <Th>GL Code</Th>
                    <Th>Expense Category</Th>
                    <Th>Typical Examples</Th>
                    <Th>Governing Standard</Th>
                  </tr>
                </thead>
                <tbody>
                  {recoverableRows.map((row) => (
                    <tr key={row.code} className="hover:bg-muted/30">
                      <Td>
                        <CodeBadge code={row.code} />
                      </Td>
                      <Td>
                        <span className="font-medium text-foreground">
                          {row.category}
                        </span>
                      </Td>
                      <Td>{row.examples}</Td>
                      <Td>{row.standard}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>

              <div className="mt-4 p-4 bg-warning/5 border border-warning/30 rounded-lg">
                <p className="text-sm text-warning-strong">
                  <strong>Note:</strong> Items 6100 to 6150 are controllable and
                  often subject to tenant-negotiated annual caps (3% to 5%).
                  Items 6500 to 6530 are uncontrollable and pass through
                  uncapped. Never commingle these in the same parent account.
                </p>
              </div>
            </section>

            {/* ── Section 2: Non-Recoverable Capital ── */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold mb-2">
                2. Clearly Non-Recoverable Capital Expenses
              </h2>
              <p className="text-muted-foreground mb-6 text-sm">
                These must post to 1000-series asset accounts or 7000-series
                non-recoverable accounts. Under IRS §263(a), they represent a
                Betterment, Restoration, or Adaptation (BRA) to the Unit of
                Property, which means they are capitalized, not expensed.
              </p>

              <TableWrapper>
                <thead>
                  <tr>
                    <Th>GL Code</Th>
                    <Th>Expense Category</Th>
                    <Th>Typical Examples</Th>
                    <Th>Why It&apos;s Capital</Th>
                  </tr>
                </thead>
                <tbody>
                  {nonRecoverableRows.map((row) => (
                    <tr key={row.code} className="hover:bg-muted/30">
                      <Td>
                        <CodeBadge code={row.code} />
                      </Td>
                      <Td>
                        <span className="font-medium text-foreground">
                          {row.category}
                        </span>
                      </Td>
                      <Td>{row.examples}</Td>
                      <Td>{row.reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>

              <div className="mt-4 p-4 bg-destructive/5 border border-destructive/30 rounded-lg">
                <p className="text-sm text-destructive-strong">
                  <strong>Rule:</strong> These must never land in a 6000-series
                  recoverable pool. If they appear there, they are a
                  misclassification. It is the most common finding in contested
                  CAM audits.
                </p>
              </div>
            </section>

            {/* ── Section 3: Gray-Area ── */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold mb-2">
                3. Gray-Area Expenses
              </h2>
              <p className="text-muted-foreground mb-6 text-sm">
                Classification depends on the scope of work and the IRS Unit of
                Property (UOP) doctrine. The same category of work can be
                operating or capital depending on magnitude and intent.
              </p>

              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Expense</Th>
                    <Th>Recoverable If…</Th>
                    <Th>Non-Recoverable If…</Th>
                    <Th>Default GL Code</Th>
                  </tr>
                </thead>
                <tbody>
                  {grayAreaRows.map((row) => (
                    <tr key={row.expense} className="hover:bg-muted/30">
                      <Td>
                        <span className="font-medium text-foreground">
                          {row.expense}
                        </span>
                      </Td>
                      <Td>{row.recoverable}</Td>
                      <Td>{row.nonRecoverable}</Td>
                      <Td>
                        <CodeBadge code={row.defaultCode} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>

              <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-sm text-primary">
                  <strong>Default rule:</strong> When in doubt, classify as
                  non-recoverable. In a contested audit the burden of proof sits
                  with the landlord, not the tenant.
                </p>
              </div>
            </section>

            {/* ── Section 4: How Miscoding Snowballs ── */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-destructive" />
                How Miscoding Snowballs
              </h2>

              <div className="space-y-6 not-prose">
                {[
                  {
                    year: 'Year 1',
                    text: 'An $80,000 HVAC chiller replacement posts to 6120 R&M instead of 1520 Capital. It flows into the CAM pool. Tenant gets billed their pro-rata share.',
                  },
                  {
                    year: 'Years 2 to 4',
                    text: 'Tenant pays without protest. The misclassified line is now embedded in prior-year actuals, forming the base against which cumulative CAM caps compound. Each year the landlord marks up from a fraudulently inflated base.',
                  },
                  {
                    year: 'Year 5',
                    text: 'Tenant exercises audit rights (lease typically allows a 1 to 3 year lookback). The auditor pulls the original invoice, sees the HVAC model number, checks the capital asset life, and calls it capital. A flag is raised.',
                  },
                  {
                    year: 'Dispute mechanics',
                    text: "Landlord now owes: (a) principal refund for all open audit years, (b) interest on overbilled amounts, (c) tenant's audit costs if the lease so provides, and (d) attorney's fees if it goes to litigation.",
                  },
                  {
                    year: 'Statute of limitations trap',
                    text: 'Many jurisdictions allow claims 3 to 6 years back. A single bad code in Year 1 can create exposure through Year 6. The longer it compounds undetected, the larger the bleed.',
                  },
                  {
                    year: 'The admin fee amplifier',
                    text: 'If a 15% administrative fee was applied on top of the misfiled expense, every dollar of principal error generated $1.15 of billed overcharge. Courts in litigated audits award the inflated amount back, including the markup.',
                  },
                  {
                    year: 'The double-dip corollary',
                    text: 'Landlords who simultaneously charge a 15% admin fee and include off-site management salaries in the CAM pool face findings of double-billing (RioCan). Courts strike both lines and may award costs.',
                  },
                ].map((item) => (
                  <div
                    key={item.year}
                    className="flex gap-4 p-4 border rounded-lg"
                  >
                    <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground">
                        {item.year}:{''}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {item.text}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-5 bg-primary/5 border border-primary/15 rounded-lg not-prose">
                <p className="text-sm text-foreground">
                  <strong>Prevention:</strong> A clean chart of accounts stops
                  all downstream compounding. Keep strict 1000/6000/7000
                  separation with no exceptions at invoice entry. One minute of
                  correct GL coding at posting time costs nothing. Correcting it
                  in Year 5 of litigation does not.
                </p>
              </div>
            </section>

            {/* ── CTA Section ── */}
            <section className="not-prose">
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                <Link
                  to="/resources/cam-presend-checklist"
                  className="group flex items-center justify-between p-5 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors duration-200"
                >
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Next resource
                    </p>
                    <p className="font-semibold group-hover:text-primary transition-colors duration-200">
                      CAM Pre-Send Checklist
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Before sending this year&apos;s reconciliation
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors duration-200 flex-shrink-0" />
                </Link>

                <Link
                  to="/tools/cam-leakage-estimator"
                  className="group flex items-center justify-between p-5 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors duration-200"
                >
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Free tool
                    </p>
                    <p className="font-semibold group-hover:text-primary transition-colors duration-200">
                      CAM Billing Risk Estimator
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Estimate your property&apos;s exposure
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors duration-200 flex-shrink-0" />
                </Link>
              </div>

              <div className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center">
                <h2 className="text-2xl font-bold mb-3">
                  Catch Misclassifications Before They Compound
                </h2>
                <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                  CapVeri cross-references every GL line against BOMA 2024
                  standards and IRS §263(a) rules to flag capital expenses
                  hiding in your recoverable pool.
                </p>
                <Button asChild size="lg">
                  <Link to="/auth/register">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </section>
          </article>
        </div>
      </div>

      <Footer />
    </div>
  )
}
