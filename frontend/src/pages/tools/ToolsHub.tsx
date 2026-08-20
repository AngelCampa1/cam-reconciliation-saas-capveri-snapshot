/**
 * Tools Hub — /tools
 *
 * Index of free tools for property controllers and CAM reconciliation teams.
 */
import { Link } from 'react-router-dom'
import { ArrowRight, Calculator, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolPageLayout } from '@/components/content/ToolPageLayout'
import { buildSiteUrl } from '@/lib/domains'

interface Tool {
  slug: string
  title: string
  description: string
  tag: string
  href: string
  isDownload: boolean
  buttonText: string
  icon?: 'calculator'
}

const TOOLS: Tool[] = [
  {
    slug: 'hcad-tax-normalizer',
    title: 'HCAD Tax Base Year Normalizer',
    description:
      'Texas landlords: won an ARB protest? See the tax adjustment and lease-cap effect before you bill.',
    tag: 'Texas · Calculator',
    href: '/tools/hcad-tax-normalizer',
    isDownload: false,
    buttonText: 'Calculate Tax Adjustment',
    icon: 'calculator',
  },
  {
    slug: 'boma-2024-calculator',
    title: 'BOMA 2024 Rentable Area Calculator',
    description:
      'See hidden billable SF from BOMA 2024. Enter measurements and outdoor spaces. Get SF impact before email.',
    tag: 'BOMA 2024',
    href: '/tools/boma-2024-calculator',
    isDownload: false,
    buttonText: 'Calculate My BOMA Impact',
  },
  {
    slug: 'audit-risk-quiz',
    title: 'CAM Audit Risk Score',
    description:
      "Answer 10 questions about your reconciliation process and get an instant risk score. See exactly where you're exposed to a tenant audit — and what to fix first.",
    tag: 'Quiz · Calculator',
    href: '/tools/audit-risk-quiz',
    isDownload: false,
    buttonText: 'Get My Risk Score',
    icon: 'calculator',
  },
  {
    slug: 'cam-leakage-estimator',
    title: 'CAM Billing Risk Estimator',
    description:
      'Model CAM bill risk across your portfolio. Enter your numbers and see the range before email.',
    tag: 'Calculator',
    href: '/tools/cam-leakage-estimator',
    isDownload: false,
    buttonText: 'See Bill Risk',
    icon: 'calculator',
  },
  {
    slug: 'cam-gross-up-calculator',
    title: 'CAM Gross-Up Scenario Calculator',
    description:
      'Model gross-up expenses across 85%, 90%, 95%, and 100% occupancy thresholds. Separates fixed vs. variable expenses with per-tenant pro-rata allocation for up to 10 tenants.',
    tag: 'Excel Download',
    href: '/tools/cam-gross-up-calculator',
    isDownload: true,
    buttonText: 'Download the Template',
  },
  {
    slug: 'lease-abstract-matrix',
    title: 'Lease Abstract Discrepancy Matrix',
    description:
      'Track CAM caps, expense stops, and admin fee carve-outs across your portfolio. Auto-flags missing caps, stale reconciliations, and inconsistent data.',
    tag: 'Excel Download',
    href: '/tools/lease-abstract-matrix',
    isDownload: true,
    buttonText: 'Download the Matrix',
  },
]

export function ToolsHub() {
  return (
    <ToolPageLayout
      title="CAM Reconciliation Tools for Commercial Real Estate | CapVeri"
      description="Free Excel tools for property controllers and CAM reconciliation teams. Built for gross-up calculations, lease abstract tracking, and portfolio compliance."
      canonical={buildSiteUrl('/tools')}
      toolName="Tools"
    >
      {/* Hero */}
      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Free Tools for Property Controllers
          </h1>
          <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            Built for CAM reconciliation teams. No signup required.
          </p>
        </div>
      </section>

      {/* Tool cards */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            {TOOLS.map((tool) => (
              <div
                key={tool.slug}
                className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {tool.icon === 'calculator' ? (
                      <Calculator className="h-3 w-3" />
                    ) : (
                      tool.isDownload && <Download className="h-3 w-3" />
                    )}
                    {tool.tag}
                  </span>
                </div>
                <h2 className="text-xl font-semibold mb-2">{tool.title}</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  {tool.description}
                </p>
                <Button asChild className="w-full">
                  <Link to={tool.href}>
                    {tool.buttonText}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-foreground text-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-lg text-background/80 mb-4">
            Still reconciling manually?
          </h2>
          <Button asChild size="lg" variant="secondary">
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
