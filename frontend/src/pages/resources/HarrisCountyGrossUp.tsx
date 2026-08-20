/* eslint-disable react-refresh/only-export-components */
import { Link } from 'react-router-dom'
import { ContentPageLayout } from '@/components/content/ContentPageLayout'
import { buildSiteUrl } from '@/lib/domains'

export interface FaqItem {
  question: string
  answer: string
}

export const faqData: FaqItem[] = [
  {
    question:
      'Does the gross-up clause apply to all Houston commercial leases?',
    answer:
      'No. Gross-up provisions must be written into the lease. Most Class A office leases in Houston signed after 2015 include them. Older leases (common in Greenspoint and the Northwest Freeway corridor) often do not. If your lease has no gross-up provision, you cannot apply one on your own. Review the "Operating Expenses" and "Additional Rent" definitions in your lease before you calculate anything.',
  },
  {
    question:
      'Can landlords include HCAD tax protest attorney fees in the CAM pool?',
    answer:
      'Under Medic Pharmacy, LLC v. AVK Properties, LLC (2022), no, unless the lease specifically permits recovery of tax protest costs. Standard leases let property taxes pass through, but legal and consulting fees to contest those taxes are usually landlord expenses. Check your lease\'s definition of "Operating Expenses" for language like "costs of contesting assessments" before including these.',
  },
  {
    question: 'How do we handle a mid-year HCAD supplemental assessment?',
    answer:
      'If HCAD issues a supplemental tax bill mid-year (common when property ownership transfers or improvements are completed), add it to the fixed expense bucket in the period it is incurred. If the reconciliation has already been sent, issue an amended statement. Do not gross it up. It is a fixed expense regardless of timing.',
  },
  {
    question: 'What occupancy percentage should we use: leased or occupied?',
    answer:
      'Most Houston leases specify "leased and occupied" or just "leased." If your lease is silent, BOMA and Texas courts generally apply the "leased" percentage. That means tenants who have signed leases but have not yet moved in still count toward the occupancy figure. This matters a lot during high-sublease periods like the current Energy Corridor market.',
  },
  {
    question:
      'We received an HCAD refund for a closed reconciliation year. Do we owe tenants money?',
    answer:
      'Almost certainly yes, if the lease defines operating expenses on an actual-cost basis and includes reconciliation provisions. Issue amended CAM statements for the affected year crediting the refund on a pro-rata basis. The refund applies only to the fixed expense (tax) line; do not adjust the grossed-up variable expense calculation for that year.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
}

const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Calculate CAM Gross-Up for a Partially Occupied Harris County Building',
  description:
    'Step-by-step gross-up calculation for Houston commercial leases with HCAD tax adjustment handling.',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Pull the full operating expense register',
      position: 1,
      text: 'Obtain the complete CAM pool from your accounting system. Every line item must be coded and categorized before any calculation begins.',
    },
    {
      '@type': 'HowToStep',
      name: 'Bifurcate expenses into Fixed, Variable, and Semi-Variable',
      position: 2,
      text: 'Separate every line item into Fixed (taxes, insurance), Variable (utilities, janitorial), or Semi-Variable (management fees) using your GL coding guide.',
    },
    {
      '@type': 'HowToStep',
      name: 'Calculate the gross-up multiplier (threshold ÷ actual occupancy)',
      position: 3,
      text: 'Divide the lease gross-up threshold percentage by the actual occupancy percentage. For example, 95% ÷ 68% = 1.3971.',
    },
    {
      '@type': 'HowToStep',
      name: 'Apply multiplier only to variable expenses',
      position: 4,
      text: 'Multiply the variable expense total by the gross-up multiplier. Do not apply the multiplier to fixed or semi-variable expenses.',
    },
    {
      '@type': 'HowToStep',
      name: 'Apply partial multiplier to semi-variable expenses',
      position: 5,
      text: 'Apply the gross-up multiplier only to the documented variable portion of semi-variable costs (typically 40% to 60% of management fees). The remainder passes through at actual cost.',
    },
    {
      '@type': 'HowToStep',
      name: 'Add fixed expenses at actual cost',
      position: 6,
      text: 'Add the fixed expense total at its actual incurred amount. Do not apply any gross-up multiplier to fixed costs.',
    },
    {
      '@type': 'HowToStep',
      name: 'Apply HCAD adjustments to fixed bucket only, after gross-up',
      position: 7,
      text: 'If HCAD issued a retroactive tax credit or supplemental assessment, apply it only to the fixed expense (property tax) line item after gross-up calculation is complete.',
    },
    {
      '@type': 'HowToStep',
      name: 'Calculate tenant pro-rata share',
      position: 8,
      text: "Divide the tenant's leased square footage by the building's total rentable square footage, then multiply by the final grossed-up pool to arrive at the tenant's CAM obligation.",
    },
  ],
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: buildSiteUrl('/'),
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Resources',
      item: buildSiteUrl('/resources'),
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'Harris County CAM Gross-Up',
      item: buildSiteUrl('/resources/harris-county-gross-up'),
    },
  ],
}

export function HarrisCountyGrossUpPage() {
  return (
    <ContentPageLayout
      title="Harris County CAM Gross-Up Calculation"
      description="Master the Harris County commercial lease gross up calculation. Fix HCAD retroactive adjustment errors and bifurcate fixed vs. variable expenses correctly."
      canonical="/resources/harris-county-gross-up"
      pageName="Harris County CAM Gross-Up"
      structuredData={[faqSchema, howToSchema, breadcrumbSchema]}
    >
      <article className="prose prose-gray max-w-none">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Harris County CAM Gross-Up: Why HCAD Adjustments Are Breaking
          Reconciliations (And How to Fix It)
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Updated: February 2026 &middot; For controllers and accounting
          managers at Houston-area commercial PMCs
        </p>

        {/* TL;DR */}
        <div className="mt-6 rounded-lg bg-primary/5 p-4 text-sm leading-relaxed text-primary/90">
          <strong>TL;DR:</strong> Houston&apos;s 26.3% office vacancy rate means
          most Energy Corridor and Galleria leases trigger gross-up clauses. But
          HCAD&apos;s retroactive assessment corrections and bad fixed/variable
          splits are creating systematic overcharges. This guide walks through
          the math, the legal exposure, and the correct calculation order.
        </div>

        {/* Section 1 */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          1. The Houston Gross-Up Problem in Plain Numbers
        </h2>
        <p>
          Take a 100,000-square-foot Class A building in the Energy Corridor.
          Current occupancy sits at 73%, which is not unusual given the
          submarket&apos;s 22.9% vacancy. The lease&apos;s gross-up clause kicks
          in at 95% occupancy.
        </p>
        <p>Here&apos;s where most property managers get it wrong.</p>

        <div className="my-4 rounded border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-semibold text-destructive-strong">
            Incorrect approach (what most systems do):
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-destructive-strong/80">
            {`Total variable operating expenses:    $850,000\nGross-up to 95%:   $850,000 × (95 ÷ 73) = $1,106,164`}
          </pre>
        </div>

        <div className="my-4 rounded border border-success/30 bg-success/5 p-4">
          <p className="font-semibold text-success-strong">
            Correct approach (proper bifurcation first):
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-success-strong/80">
            {`Step 1: Separate expense categories:\n  Truly variable (utilities, janitorial):  $620,000\n  Step-function (management fees at 4%):   $125,000\n  Fixed (taxes, insurance, security):      $105,000\n                                      ──────────────\n  Total:                                   $850,000\n\nStep 2: Gross-up only the variable portion:\n  $620,000 × (95 ÷ 73) =                  $806,849\n\nStep 3: Add step-function costs unchanged:\n  $806,849 + $125,000 =                    $931,849\n\nFinal grossed-up pool:                   $931,849`}
          </pre>
        </div>

        <p>
          <strong>The delta:</strong> $1,106,164 − $931,849 ={' '}
          <strong className="text-destructive-strong">
            $174,315 tenant overcharge
          </strong>{' '}
          on a single building in a single year. Multiply that across a
          10-property portfolio and you have seven-figure exposure.
        </p>
        <p>
          Houston&apos;s current market conditions make this calculation
          non-negotiable. With Greenspoint at 49.1% vacancy and FM 1960 at
          37.8%, gross-up provisions are triggering on nearly every lease in the
          MSA. Controllers who haven&apos;t audited their gross-up methodology
          recently have almost certainly been calculating incorrectly.
        </p>

        {/* Section 2 */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          2. How HCAD Retroactive Adjustments Break Standard Gross-Up Formulas
        </h2>
        <p>
          Harris County Appraisal District operates on a timeline that
          doesn&apos;t align with CAM reconciliation cycles. Here&apos;s the
          collision that breaks most accounting systems:
        </p>
        <ul className="list-none space-y-2">
          <li>
            <strong>March 2024:</strong> You close the 2023 CAM reconciliation.
            Tenant&apos;s pro-rata share of property taxes: $125,000. Statement
            sent.
          </li>
          <li>
            <strong>August 2024:</strong> Landlord files a Section 25.25 protest
            on the 2023 assessed value.
          </li>
          <li>
            <strong>November 2024:</strong> HCAD reduces the 2023 assessed value
            by $2.1M. Tax refund to landlord: $47,200.
          </li>
        </ul>
        <p>
          The question your lease probably doesn&apos;t answer clearly: does
          that $47,200 refund reduce the tenant&apos;s 2023 CAM obligation?
        </p>
        <p>
          Most standard NNN leases say expenses are calculated on an "incurred"
          basis. The tax was incurred in 2023 at $125,000. But the landlord
          received a refund in 2024.{' '}
          <em>Medic Pharmacy, LLC v. AVK Properties, LLC</em> (Harris County
          District Court, 2022) established that landlords bear the burden of
          proving their expense ledgers are properly bifurcated and that tax
          protest costs cannot be folded into the CAM pool.
        </p>
        <p>
          <strong>The gross-up contamination problem:</strong> When accounting
          systems receive the HCAD credit, they often apply it as a negative
          expense in the CAM pool before gross-up is applied. The correct
          treatment: property tax adjustments must be applied to the fixed
          expense bucket <em>after</em> gross-up calculation, with documentation
          showing the HCAD notice number and effective period.
        </p>

        {/* Section 3 */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          3. Fixed vs. Variable Bifurcation: The Calculation Most Managers Get
          Wrong
        </h2>

        <h3 className="mt-6 text-xl font-medium text-foreground">
          Fixed Expenses (excluded from gross-up)
        </h3>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">
            Fixed expenses excluded from gross-up
          </caption>
          <thead>
            <tr className="border-b bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Expense Category
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Why It&apos;s Fixed
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Common GL Codes
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              [
                'Ad valorem property taxes',
                'Assessed on building value, not occupancy',
                '7100 to 7150',
              ],
              [
                'Property and liability insurance',
                'Premium set annually by risk profile',
                '6900 to 6950',
              ],
              [
                'Landscaping and exterior maintenance',
                'Contract-based, building-wide',
                '6400 to 6450',
              ],
              [
                'Security services',
                'Staffed at full-building level',
                '6500 to 6550',
              ],
              [
                'Structural repairs',
                'Capital/reserve; occupancy-independent',
                '8100 to 8200',
              ],
            ].map(([cat, why, gl]) => (
              <tr key={cat} className="border-b">
                <td className="px-3 py-2">{cat}</td>
                <td className="px-3 py-2 text-muted-foreground">{why}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {gl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt-6 text-xl font-medium text-foreground">
          Variable Expenses (subject to gross-up)
        </h3>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">
            Variable expenses subject to gross-up
          </caption>
          <thead>
            <tr className="border-b bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Expense Category
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Variability Driver
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Typical Range
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              [
                'Utilities (electric, gas, water)',
                'Direct function of occupancy',
                '60% to 80% variable',
              ],
              [
                'Janitorial services',
                'Per-occupied-floor contracts',
                '90% to 100% variable',
              ],
              ['Trash removal', 'Volume-based', '80% to 90% variable'],
              [
                'HVAC maintenance (occupied floors)',
                'Usage-driven',
                '50% to 70% variable',
              ],
            ].map(([cat, driver, range]) => (
              <tr key={cat} className="border-b">
                <td className="px-3 py-2">{cat}</td>
                <td className="px-3 py-2 text-muted-foreground">{driver}</td>
                <td className="px-3 py-2 text-muted-foreground">{range}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-4">
          <strong>Management fees</strong> present the trickiest case. A 4%
          management fee on a building with $2M in gross revenues doesn&apos;t
          linearly scale with occupancy. Bill Brownfield&apos;s{' '}
          <em>Escalation Handbook for Office Buildings</em> (3rd ed.) recommends
          applying gross-up only to the portion of the management fee directly
          tied to tenant services, typically 40% to 60%.
        </p>

        {/* Section 4 */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          4. Step-by-Step: Correct Gross-Up Calculation for a Partially Occupied
          Harris County Building
        </h2>
        <p>
          <strong>Scenario:</strong> 85,000 RSF Galleria-area office. Current
          occupancy: 68%. Lease gross-up threshold: 95%.
        </p>
        <ol className="mt-4 list-decimal space-y-4 pl-6">
          <li>
            <strong>Pull the full operating expense register.</strong> Get every
            line item coded and categorized before calculating anything.
          </li>
          <li>
            <strong>Bifurcate the expense pool.</strong>
            <pre className="mt-2 rounded bg-muted p-3 text-sm">
              {`Fixed expenses total:        $412,000\nVariable expenses total:     $538,000\nSemi-variable (mgmt fees):    $84,000\n─────────────────────────────────────\nTotal operating expenses:  $1,034,000`}
            </pre>
          </li>
          <li>
            <strong>Calculate the gross-up multiplier.</strong>
            <pre className="mt-2 rounded bg-muted p-3 text-sm">
              {`Multiplier = 95% ÷ 68% = 1.3971`}
            </pre>
          </li>
          <li>
            <strong>Apply multiplier only to variable expenses.</strong>
            <pre className="mt-2 rounded bg-muted p-3 text-sm">
              {`$538,000 × 1.3971 = $751,640`}
            </pre>
          </li>
          <li>
            <strong>Apply partial multiplier to semi-variable.</strong>
            <pre className="mt-2 rounded bg-muted p-3 text-sm">
              {`Variable portion (50%): $42,000 × 1.3971 = $58,678\nFixed portion (50%):   $42,000 × 1.0000 = $42,000\nSubtotal:                                  $100,678`}
            </pre>
          </li>
          <li>
            <strong>Add fixed expenses at actual cost.</strong>
            <pre className="mt-2 rounded bg-muted p-3 text-sm">
              {`$751,640 + $100,678 + $412,000 = $1,264,318`}
            </pre>
          </li>
          <li>
            <strong>
              Apply HCAD adjustments to fixed bucket only, after gross-up.
            </strong>
            <pre className="mt-2 rounded bg-muted p-3 text-sm">
              {`HCAD credit: ($31,400)\nAdjusted fixed: $412,000 − $31,400 = $380,600\nFinal pool: $751,640 + $100,678 + $380,600 = $1,232,918`}
            </pre>
          </li>
          <li>
            <strong>Calculate tenant pro-rata share.</strong>
            <pre className="mt-2 rounded bg-muted p-3 text-sm">
              {`Tenant: 12,500 SF ÷ 85,000 SF = 14.71%\nTenant CAM: $1,232,918 × 14.71% = $181,362`}
            </pre>
          </li>
        </ol>

        {/* FAQ Section */}
        <h2 className="mt-12 text-2xl font-semibold text-foreground">
          Frequently Asked Questions
        </h2>
        <dl className="mt-6 space-y-8">
          {faqData.map((faq) => (
            <div key={faq.question}>
              <dt className="text-base font-semibold text-foreground">
                {faq.question}
              </dt>
              <dd className="mt-2 text-base text-muted-foreground">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>

        {/* CTA */}
        <div className="mt-12 rounded-xl bg-primary p-8 text-center text-primary-foreground">
          <p className="text-lg font-semibold">
            Check your Harris County gross-up in minutes
          </p>
          <p className="mt-1 text-sm text-primary-foreground/80">
            Automated bifurcation, HCAD adjustment tracking, and audit-ready
            output.
          </p>
          <Link
            to="/auth/register"
            className="mt-4 inline-flex items-center rounded-button bg-background px-6 py-3 text-sm font-semibold text-primary shadow hover:bg-primary/5 transition-colors duration-200"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Related links */}
        <div className="mt-8 flex flex-wrap gap-4 border-t pt-6 text-sm">
          <span className="text-muted-foreground">Related:</span>
          <Link
            to="/resources/what-is-cam-reconciliation"
            className="text-primary hover:underline"
          >
            What Is CAM Reconciliation?
          </Link>
          <Link
            to="/tools/cam-gross-up-calculator"
            className="text-primary hover:underline"
          >
            CAM Gross-Up Calculator
          </Link>
        </div>
      </article>
    </ContentPageLayout>
  )
}
