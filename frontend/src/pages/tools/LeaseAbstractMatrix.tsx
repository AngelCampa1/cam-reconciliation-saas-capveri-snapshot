/**
 * Lease Abstract Discrepancy Matrix — /tools/lease-abstract-matrix
 *
 * Gated download page. Email gate via LeadCaptureForm.
 */
import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { ToolPageLayout } from '@/components/content/ToolPageLayout'
import { LeadCaptureForm } from '@/components/lead-capture/LeadCaptureForm'
import { trackEvent } from '@/lib/analytics'
import { buildSiteUrl } from '@/lib/domains'

const BENEFITS = [
  'One row per tenant — NNN, gross, and modified gross structures',
  'Auto-flags missing CAM caps, stale reconciliations (12+ months), and inconsistent data',
  'Works for inherited portfolios with no existing lease abstracts',
  'Excel-based, formula-driven — no proprietary software required',
]

export function LeaseAbstractMatrix() {
  const navigate = useNavigate()

  useEffect(() => {
    trackEvent('tool_page_view', { slug: 'lease-abstract-matrix' })
    trackEvent('lead_form_view', { slug: 'lease-abstract-matrix' })
  }, [])

  const handleSuccess = () => {
    navigate('/tools/lease-abstract-matrix/thank-you', {
      state: { leadCaptured: true },
    })
  }

  return (
    <ToolPageLayout
      title="Free Lease Abstract Discrepancy Matrix | CapVeri"
      description="Track CAM caps, expense stops, and admin fee carve-outs across your portfolio. Excel tool that auto-flags missing caps and stale reconciliations."
      canonical={buildSiteUrl('/tools/lease-abstract-matrix')}
      toolName="Lease Abstract Matrix"
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Lease Abstract Discrepancy Matrix
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Track CAM caps, expense stops, and admin fee carve-outs across
              your portfolio.
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
                    Built for inherited portfolios.
                  </strong>{' '}
                  Works even if you don&apos;t have existing lease abstracts —
                  just enter what you know and let the flags guide you.
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
                to automate CAM reconciliation across your portfolio.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free matrix
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="lease-abstract-matrix"
                ctaLabel="Download Free Matrix"
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
