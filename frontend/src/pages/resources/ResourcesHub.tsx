/**
 * Resources Hub (/resources)
 *
 * Index of CAM reconciliation guides and reference articles for property managers.
 */
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { buildSiteUrl } from '@/lib/domains'

const RESOURCES = [
  {
    slug: 'what-is-cam-reconciliation',
    title: 'What is CAM Reconciliation?',
    description:
      'How CAM reconciliation works: charge structures, gross-up mechanics, caps, and audit rights. Written for the people running the process.',
    href: '/resources/what-is-cam-reconciliation',
    buttonText: 'Understand the Basics',
    dateModified: '2026-02-23',
  },
  {
    slug: 'boma-2024-changes',
    title: 'BOMA 2024 Changes',
    description:
      "BOMA updated its measurement standards in 2024. Here's what changed and how it affects CAM expense allocation.",
    href: '/resources/boma-2024-changes',
    buttonText: 'See What Changed',
    dateModified: '2026-02-23',
  },
  {
    slug: 'cam-presend-checklist',
    title: 'CAM Presend Checklist',
    description:
      'What to verify before the statement goes out. Catches the errors that generate the most tenant pushback.',
    href: '/resources/cam-presend-checklist',
    buttonText: 'Get the Checklist',
    dateModified: '2026-02-23',
  },
  {
    slug: 'tenant-auditor-guide',
    title: 'What Tenant Auditors Look For',
    description:
      'What to expect when a tenant exercises audit rights, from the first documentation request to final resolution.',
    href: '/resources/tenant-auditor-guide',
    buttonText: 'Know Their Playbook',
    dateModified: '2026-02-23',
  },
  {
    slug: 'gl-coding-guide',
    title: 'GL Coding Guide',
    description:
      'How GL coding decisions determine which expenses flow into CAM pools. A reference for controllers managing the ledger.',
    href: '/resources/gl-coding-guide',
    buttonText: 'Fix Coding Errors',
    dateModified: '2026-02-23',
  },
  {
    slug: 'cam-reconciliation-errors',
    title: 'CAM Reconciliation Errors',
    description:
      'The most common and costly errors in CAM statements: gross-up mistakes, cap rate typos, occupancy miscalculations, and admin fee logic flaws.',
    href: '/resources/cam-reconciliation-errors',
    buttonText: 'Spot These Errors',
    dateModified: '2026-02-23',
  },
  {
    slug: 'export-guide',
    title: 'How to Export from Yardi, MRI, AppFolio & RealPage',
    description:
      'Step-by-step instructions for exporting Rent Rolls, GL data, and CAM reconciliation reports from the four major property management systems.',
    href: '/resources/export-guide',
    buttonText: 'Get the Export Steps',
    dateModified: '2026-02-24',
  },
  {
    slug: 'harris-county-gross-up',
    title: 'Harris County CAM Gross-Up Calculation',
    description:
      'Why HCAD retroactive adjustments are breaking reconciliations in Houston, plus the step-by-step fix for Energy Corridor and Galleria portfolios.',
    href: '/resources/harris-county-gross-up',
    buttonText: 'Fix Your Gross-Up',
    dateModified: '2026-02-24',
  },
  {
    slug: 'sb-1103-compliance',
    title: 'SB 1103 CAM Reconciliation Compliance',
    description:
      'What California landlords must produce within 30 days of a tenant documentation request, plus the 5 gaps that create treble-damage liability.',
    href: '/resources/sb-1103-compliance',
    buttonText: 'Read Compliance Guide',
    dateModified: '2026-02-24',
  },
]

// Derive the hub's dateModified from the freshest resource so the WebPage
// schema stays accurate as articles are added or updated (no manual bump).
const RESOURCES_LAST_MODIFIED = RESOURCES.reduce(
  (latest, r) => (r.dateModified > latest ? r.dateModified : latest),
  ''
)

export function ResourcesHub() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="CAM Reconciliation Resources"
        description="Guides for property managers working through CAM reconciliations. Covers reconciliation basics, BOMA 2024 changes, presend checklists, tenant audit rights, and GL coding."
        canonical="/resources"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'CAM Reconciliation Resources',
          url: buildSiteUrl('/resources'),
          author: { '@type': 'Organization', name: 'CapVeri' },
          dateModified: RESOURCES_LAST_MODIFIED,
          breadcrumb: structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: '/' },
            { name: 'Resources', url: '/resources' },
          ]),
        }}
      />
      <LandingNav />

      {/* Hero */}
      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            CAM Reconciliation Resources
          </h1>
          <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            Guides for property managers working through CAM reconciliations. No
            fluff, no vendor spin.
          </p>
        </div>
      </section>

      {/* Resource cards */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            {RESOURCES.map((resource) => (
              <div
                key={resource.slug}
                className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <BookOpen className="h-3 w-3" />
                    Article
                  </span>
                </div>
                <h2 className="text-xl font-semibold mb-2">{resource.title}</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  {resource.description}
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link to={resource.href} aria-label={resource.title}>
                    {resource.buttonText}
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
          <p className="text-lg text-background/80 mb-4">
            Still reconciling manually?
          </p>
          <Button asChild size="lg" variant="secondary">
            <Link to="/auth/register">
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  )
}
