/**
 * Sample Report Page
 *
 * Static page showing a redacted demo CAM reconciliation report.
 * Serves visitors who need more information before registering.
 */
import { Link } from 'react-router-dom'
import { ArrowRight, FileText, CheckCircle, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SEO } from '@/components/SEO'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { TRIAL_COPY } from '@/lib/domains'
import { buildSiteUrl } from '@/lib/domains'

export function SampleReportPage() {
  return (
    <div className="min-h-screen">
      <SEO
        title="Sample CAM Reconciliation Report"
        description="See a sample CAM reconciliation report from CapVeri. Understand how we check tenant billing, lease terms, and statement support before delivery."
        canonical="/sample-report"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Sample CAM Reconciliation Report',
          url: buildSiteUrl('/sample-report'),
          description:
            'See a sample CAM reconciliation report from CapVeri. See how we check tenant billing, lease terms, and statement support before delivery.',
          datePublished: '2026-02-23',
        }}
      />
      <LandingNav variant="light" />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary/80 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              Sample Report
            </Badge>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-primary-foreground mb-4">
              Sample CAM Reconciliation Report
            </h1>
            <p className="text-lg text-primary-foreground/90 max-w-2xl mx-auto">
              Here's a sample CAM reconciliation CapVeri ran for a 12-building
              mixed-use portfolio. Names and addresses are redacted. The numbers
              shown are examples.
            </p>
          </div>
        </div>
      </section>

      {/* Summary Cards */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 max-w-4xl mx-auto">
            <Card className="text-center">
              <CardContent className="pt-6">
                <Scale className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold text-foreground font-mono tabular-nums">
                  $312,450
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Billing exposure checked
                </p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <FileText className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold">47</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Items flagged across 12 buildings
                </p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold text-primary">12</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Statement packets prepared
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Sample Findings Table */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-center">
              Top Findings by Building
            </h2>

            <Card className="overflow-hidden">
              <CardHeader className="bg-muted/50">
                <div className="grid grid-cols-2 md:grid-cols-4 text-sm font-semibold text-muted-foreground">
                  <span>Building</span>
                  <span>Issue Type</span>
                  <span>Impact</span>
                  <span>Status</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {sampleFindings.map((finding, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-2 md:grid-cols-4 items-center px-6 py-4 border-b last:border-b-0 text-sm"
                  >
                    <span className="font-medium text-muted-foreground">
                      {finding.building}
                    </span>
                    <span>{finding.issueType}</span>
                    <span className="font-semibold text-foreground font-mono tabular-nums">
                      {finding.impact}
                    </span>
                    <Badge variant="secondary" className="w-fit">
                      {finding.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Redaction notice */}
            <p className="text-xs text-muted-foreground text-center mt-4">
              * Building identifiers, tenant names, and lease amounts are
              redacted for confidentiality.
            </p>

            {/* Fine-print verification disclaimer */}
            <p className="text-xs text-muted-foreground text-center mt-2">
              This is a sample report with the real numbers hidden. Real results
              change by property. The numbers here are examples only, not
              financial or legal advice.
            </p>
          </div>
        </div>
      </section>

      {/* What we check */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold mb-8 text-center">
              What CapVeri Checks in Every Reconciliation
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {auditChecks.map((check, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  <span className="text-sm">{check}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-gradient-to-br from-primary to-primary/80">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-primary-foreground mb-4">
              Reconcile Your Portfolio
            </h2>
            <p className="text-primary-foreground/90 mb-8">
              Upload your GL exports. CapVeri runs the reconciliation and gives
              you a tenant-ready statement to review. Free, in minutes.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="min-w-full sm:min-w-[260px]"
            >
              <Link to="/auth/register">
                Reconcile My Portfolio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-sm text-primary-foreground/60 mt-3">
              {TRIAL_COPY} on all plans
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

const sampleFindings = [
  {
    building: 'Building A',
    issueType: 'Gross-up math over-billed tenants',
    impact: '$42,300',
    status: 'Review before sending',
  },
  {
    building: 'Building B',
    issueType: 'Excluded expense included',
    impact: '$18,750',
    status: 'Remove from packet',
  },
  {
    building: 'Building C',
    issueType: 'Occupancy percent mismatch',
    impact: '$31,200',
    status: 'Check lease basis',
  },
  {
    building: 'Building D',
    issueType: 'Cap applied incorrectly',
    impact: '$27,900',
    status: 'Check billing amount',
  },
  {
    building: 'Building E',
    issueType: 'Admin fee exceeds lease limit',
    impact: '$8,400',
    status: 'Adjust statement',
  },
  {
    building: 'Building F',
    issueType: 'Base year stop not applied',
    impact: '$15,600',
    status: 'Check support',
  },
]

const auditChecks = [
  'Gross-up calculations per BOMA 2024',
  'Expense cap compliance by tenant',
  'Admin fee limits per lease clause',
  'Base year stop and expense stop provisions',
  'Occupancy percentage accuracy',
  'Excluded expense categories',
  'Pro-rata share calculations',
  'Year-over-year variance analysis',
  'Lease commencement/expiration dates',
  'Operating expense reconciliation',
]
