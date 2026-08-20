/**
 * Download Thank You — /tools/:slug/thank-you
 *
 * Post-download confirmation page. noindex — no SEO value.
 */
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolPageLayout } from '@/components/content/ToolPageLayout'
import { buildSiteUrl } from '@/lib/domains'

const ASSET_DISPLAY_NAMES: Record<string, string> = {
  'cam-gross-up-calculator': 'CAM Gross-Up Scenario Calculator',
  'lease-abstract-matrix': 'Lease Abstract Discrepancy Matrix',
}

export function DownloadThankYou() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const leadCaptured =
    (location.state as { leadCaptured?: boolean } | null)?.leadCaptured === true
  const assetName = (slug && ASSET_DISPLAY_NAMES[slug]) ?? 'your resource'

  // Guard: this confirmation page is only meaningful after completing the lead
  // form. Visitors who arrive directly (bookmark, refresh, shared link) are
  // sent to the gated tool page so they can submit the form.
  if (!leadCaptured) {
    const target =
      slug && ASSET_DISPLAY_NAMES[slug] ? `/tools/${slug}` : '/tools'
    return <Navigate to={target} replace />
  }

  return (
    <ToolPageLayout
      title="Check Your Email | CapVeri"
      description="Your download link is on its way."
      canonical={buildSiteUrl(`/tools/${slug ?? ''}/thank-you`)}
      toolName="Download"
    >
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-lg">
          <div className="flex justify-center mb-6">
            <CheckCircle className="h-16 w-16 text-primary" />
          </div>

          <h1 className="text-3xl font-bold mb-4">Check your email</h1>

          <p className="text-muted-foreground mb-8">
            Your download link for the{' '}
            <strong className="text-foreground">{assetName}</strong> is on its
            way. Check your inbox (and spam folder) within a few minutes.
          </p>

          <div className="rounded-lg border border-border bg-muted/40 p-6 text-left mb-8">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">
                See how CapVeri automates this calculation entirely →
              </strong>{' '}
              No more Excel — upload your GL export and get a verified
              reconciliation in minutes.
            </p>
          </div>

          <Button asChild size="lg">
            <Link to="/auth/register">
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </ToolPageLayout>
  )
}
