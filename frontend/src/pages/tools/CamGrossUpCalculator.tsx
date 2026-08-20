/**
 * CAM Gross-Up Scenario Calculator — /tools/cam-gross-up-calculator
 *
 * Gated download page. Email gate via LeadCaptureForm.
 * Navigates to /tools/cam-gross-up-calculator/thank-you on success.
 */
import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { ToolPageLayout } from '@/components/content/ToolPageLayout'
import { LeadCaptureForm } from '@/components/lead-capture/LeadCaptureForm'
import { trackEvent } from '@/lib/analytics'
import { buildSiteUrl } from '@/lib/domains'

const STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'FinanceApplication',
    applicationSubCategory: 'Calculator',
    name: 'CAM Gross-Up Scenario Calculator',
    description:
      'Model CAM gross-up expenses across 85%, 90%, 95%, and 100% occupancy thresholds. Separates fixed vs. variable expenses with per-tenant pro-rata allocation.',
    operatingSystem: 'Windows, macOS (Microsoft Excel 2016+, Google Sheets)',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: buildSiteUrl('/tools/cam-gross-up-calculator'),
  },
  {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Model CAM Gross-Up Scenarios',
    description:
      'Download and use the free CAM Gross-Up Scenario Calculator to model expenses across occupancy thresholds.',
    totalTime: 'PT10M',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Enter your email',
        text: 'Submit your email address to receive the download link instantly.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Download the calculator',
        text: 'Open the Excel file in Microsoft Excel 2016+ or Google Sheets.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Input your expense data',
        text: 'Enter your fixed and variable CAM expenses in the designated worksheet cells.',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Review gross-up scenarios',
        text: 'Compare gross-up amounts across 85%, 90%, 95%, and 100% occupancy thresholds and review per-tenant pro-rata allocations.',
      },
    ],
  },
]

const BENEFITS = [
  'Models gross-up across 85%, 90%, 95%, and 100% occupancy thresholds',
  'Separates fixed vs. variable expenses — shows exactly what landlords can inflate',
  'Per-tenant pro-rata allocation table for up to 10 tenants',
  'Works in Excel 2016+ and Google Sheets — no macros, no VBA',
]

export function CamGrossUpCalculator() {
  const navigate = useNavigate()

  useEffect(() => {
    trackEvent('tool_page_view', { slug: 'cam-gross-up-calculator' })
    trackEvent('lead_form_view', { slug: 'cam-gross-up-calculator' })
  }, [])

  const handleSuccess = () => {
    navigate('/tools/cam-gross-up-calculator/thank-you', {
      state: { leadCaptured: true },
    })
  }

  return (
    <ToolPageLayout
      title="Free CAM Gross-Up Scenario Calculator | CapVeri"
      description="Model gross-up expenses across occupancy thresholds. Excel calculator for property controllers — separates fixed vs. variable expenses with per-tenant allocation."
      canonical={buildSiteUrl('/tools/cam-gross-up-calculator')}
      toolName="CAM Gross-Up Calculator"
      structuredData={STRUCTURED_DATA}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free CAM Gross-Up Scenario Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Model gross-up expenses across occupancy thresholds. Download
              free.
            </p>
          </div>
        </div>
      </section>

      {/* Two-column layout */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 max-w-5xl">
            {/* Left: benefits */}
            <div>
              <h2 className="text-xl font-semibold mb-6">What&apos;s inside</h2>
              <ul className="space-y-4">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">
                    Used by property controllers
                  </strong>{' '}
                  at property management companies running portfolios of 10–200+
                  tenants.
                </p>
              </div>

              <p className="mt-6 text-xs text-muted-foreground">
                Already have an account?{' '}
                <Link
                  to="/auth/login"
                  className="underline hover:text-foreground"
                >
                  Log in
                </Link>{' '}
                to automate this calculation entirely.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free calculator
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="cam-gross-up-calculator"
                ctaLabel="Download Free Calculator"
                onSuccess={handleSuccess}
                source="tools-page"
              />
            </div>
          </div>
        </div>
      </section>
    </ToolPageLayout>
  )
}
