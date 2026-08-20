/**
 * Resource Page: How to Export from Yardi, MRI, AppFolio & RealPage
 *
 * SEO-targeted guide for users searching how to pull the right files from
 * their property management system. Deep-links from onboarding export-guide
 * banners also land here.
 */

import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { buildSiteUrl } from '@/lib/domains'

const SEO_TITLE = 'How to Export from Yardi, MRI, AppFolio & RealPage | CapVeri'
const SEO_DESCRIPTION =
  'Step-by-step export instructions for Rent Rolls, GL data, and CAM reconciliation reports from Yardi Voyager, MRI Commercial, AppFolio, and RealPage.'

// ─── Section data ─────────────────────────────────────────────────────────────

interface SystemContent {
  id: string
  label: string
  steps: string[]
  columns: string
}

interface Section {
  id: string
  heading: string
  intro: string
  systems: SystemContent[]
}

const SECTIONS: Section[] = [
  {
    id: 'rent-roll',
    heading: 'Rent Roll Export',
    intro:
      'CapVeri uses the rent roll to build your tenant roster, set square footage allocations, and calculate pro-rata shares. You need columns for unit, tenant name, square footage, market rent, monthly rent, and lease start/end dates.',
    systems: [
      {
        id: 'yardi-rent-roll',
        label: 'Yardi',
        steps: [
          'In Yardi Voyager, go to Leasing → Reports → Rent Roll with Lease Charges.',
          'Set the report month using the "As of" date field.',
          'Click Submit to generate the report.',
          'Use the Export to Excel icon (spreadsheet icon in the toolbar).',
          'In Excel, choose File → Save As and select CSV (Comma delimited).',
        ],
        columns:
          'Unit, Tenant Name, SF, Market Rent, Monthly Rent, Lease Start, Lease End',
      },
      {
        id: 'mri-rent-roll',
        label: 'MRI',
        steps: [
          'In MRI Commercial, go to Commercial → Reporting → Rent Roll.',
          'Select your property and reporting date.',
          'Click Run Report.',
          'Hit the export button in the report viewer and select CSV. If prompted for a filename, type one ending in .csv.',
        ],
        columns:
          'Suite Number, Tenant Name, Square Footage, Market Rent, Monthly Rent',
      },
      {
        id: 'appfolio-rent-roll',
        label: 'AppFolio',
        steps: [
          'In AppFolio, go to Reports → Property and Unit Reports → Rent Roll.',
          'Click Customize (or the column selector) to ensure Unit, Sq. Ft., Market Rent, and Lease Dates are enabled.',
          'Set the date and property filter.',
          'Click Actions → Export as CSV.',
        ],
        columns:
          'Unit, Sq. Ft., Market Rent, Monthly Rent, Lease Start, Lease End',
      },
      {
        id: 'realpage-rent-roll',
        label: 'RealPage',
        steps: [
          'In RealPage OneSite, go to Reports → Rent Roll.',
          'Set the property and period.',
          'Once the report loads, look for the Excel/CSV export icon in the toolbar.',
          'Export with unit, tenant name, and lease term columns selected.',
        ],
        columns: 'Unit, Tenant Name, Lease Start, Lease End, Monthly Rent',
      },
    ],
  },
  {
    id: 'gl',
    heading: 'GL Export',
    intro:
      'The General Ledger export tells CapVeri which expenses are in your CAM pool for the reconciliation year. You need a full-year export (Jan 1 to Dec 31) with account code, description, date, and amount columns.',
    systems: [
      {
        id: 'yardi-gl',
        label: 'Yardi',
        steps: [
          'In Yardi Voyager, go to Accounting → General Ledger Analytics.',
          'Select your property and set the date range to Jan 1 to Dec 31 of the reconciliation year.',
          'Click Submit.',
          'Use the spreadsheet icon to export to Excel.',
          'In Excel, choose File → Save As → CSV (Comma Delimited).',
        ],
        columns: 'Account Code, Description, Date, Debit, Credit',
      },
      {
        id: 'mri-gl',
        label: 'MRI',
        steps: [
          'In MRI Commercial, go to Commercial → Financials → General Ledger.',
          'Select your property and set the date range (full calendar year).',
          'Click Run.',
          'Export the report. If it prompts for a filename, type one ending in .csv to force comma-delimited output.',
        ],
        columns: 'Account, Description, Date, Amount',
      },
      {
        id: 'appfolio-gl',
        label: 'AppFolio',
        steps: [
          'In AppFolio, go to Reports → Financial Transactions → General Ledger.',
          'Set the date range and property filter.',
          'Click Actions → Export as CSV.',
        ],
        columns: 'Account Code, Description, Date, Debit, Credit',
      },
      {
        id: 'realpage-gl',
        label: 'RealPage',
        steps: [
          'In RealPage, go to Accounting → Reports → General Ledger.',
          'Filter by property and date range.',
          'Run the report.',
          'Use the CSV export icon in the toolbar.',
        ],
        columns: 'Account, Description, Date, Amount',
      },
    ],
  },
  {
    id: 'cam-billed',
    heading: 'CAM Billed Export',
    intro:
      'The CAM billed report shows what you charged tenants in prior years. CapVeri checks it against what each lease allows. It flags bill rows to review. You need tenant name, suite, and total CAM billed columns.',
    systems: [
      {
        id: 'yardi-cam-billed',
        label: 'Yardi',
        steps: [
          'In Yardi Voyager, go to Commercial → CAM Reconciliation.',
          'Open the prior-year reconciliation for your property.',
          'Export to Excel using the spreadsheet icon.',
          'In Excel, save as CSV (File → Save As → CSV Comma Delimited).',
        ],
        columns: 'Tenant, Suite, Total CAM Billed',
      },
      {
        id: 'mri-cam-billed',
        label: 'MRI',
        steps: [
          'In MRI Commercial, go to Commercial → Retail Recoveries → CAM Reconciliation.',
          'Select the prior year and your property.',
          'Run the reconciliation report.',
          "Use Rapid Reports' export to download as CSV.",
        ],
        columns: 'Tenant, Suite, Total CAM Billed',
      },
      {
        id: 'appfolio-cam-billed',
        label: 'AppFolio',
        steps: [
          'In AppFolio, go to Reports → Owner Reports → CAM Reconciliation (available on plans that include CAM).',
          'Click Actions → Export as CSV.',
          'If you do not have a reconciliation report, use Reports → CAM Charges instead.',
        ],
        columns: 'Tenant, Unit, CAM Billed',
      },
      {
        id: 'realpage-cam-billed',
        label: 'RealPage',
        steps: [
          'In RealPage Commercial, go to Reports → CAM Reconciliation Summary.',
          'Set the prior year period and your property.',
          'Export to CSV from the toolbar.',
          'Confirm the export includes the total CAM charged per tenant column.',
        ],
        columns: 'Tenant, Suite, Total CAM Charged',
      },
    ],
  },
]

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionBlock({ section }: { section: Section }) {
  return (
    <section id={section.id} className="mb-14 scroll-mt-20">
      <h2 className="text-2xl font-semibold mb-3">{section.heading}</h2>
      <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
        {section.intro}
      </p>

      <Tabs defaultValue={section.systems[0]!.id}>
        <TabsList className="mb-4 flex-wrap h-auto">
          {section.systems.map((sys) => (
            <TabsTrigger key={sys.id} value={sys.id}>
              {sys.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {section.systems.map((sys) => (
          <TabsContent
            key={sys.id}
            value={sys.id}
            id={sys.id}
            className="scroll-mt-20"
          >
            <div className="rounded-lg border bg-card p-5">
              <ol className="space-y-2 mb-4">
                {sys.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Required columns:{''}
                  </span>
                  {sys.columns}
                </p>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function ExportGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={SEO_TITLE}
        description={SEO_DESCRIPTION}
        canonical="/resources/export-guide"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: SEO_TITLE,
            description: SEO_DESCRIPTION,
            author: { '@type': 'Organization', name: 'CapVeri' },
            publisher: { '@type': 'Organization', name: 'CapVeri' },
            datePublished: '2026-02-24',
            dateModified: '2026-02-24',
            url: buildSiteUrl('/resources/export-guide'),
          },
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Resources', url: '/resources' },
            { name: 'Export Guide', url: '/resources/export-guide' },
          ]),
        ]}
      />
      <LandingNav variant="light" />

      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-sm text-muted-foreground mb-8"
          >
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
            <span className="text-foreground">Export Guide</span>
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
            <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
              How to Export from Yardi, MRI, AppFolio & RealPage
            </h1>

            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
              <span>
                By{''}
                <strong className="font-medium text-foreground">CapVeri</strong>
              </span>
              <span aria-hidden="true">·</span>
              <time dateTime="2026-02-24">Updated February 24, 2026</time>
            </div>

            <p className="text-lg text-muted-foreground mb-10">
              Getting the right file out of your property management system is
              the first hurdle in any CAM reconciliation. This guide covers Rent
              Roll, GL, and CAM billed exports for the four major systems, step
              by step.
            </p>

            {SECTIONS.map((section) => (
              <SectionBlock key={section.id} section={section} />
            ))}

            {/* CTA */}
            <section className="not-prose mt-8">
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center">
                <h2 className="text-2xl font-bold mb-3">
                  Ready to Run Your Reconciliation?
                </h2>
                <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                  Upload your files. CapVeri parses them and flags miscoded
                  rows. Review bill issues before statements go out.
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
