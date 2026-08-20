/**
 * Competitor Comparison Page: CapVeri vs MRI Software
 *
 * Honest, balanced comparison for high-intent SEO traffic.
 * Target query:"MRI Software CAM reconciliation alternative"
 */

import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { publicKnowledge } from '@/generated/public-knowledge'
import { TRIAL_COPY } from '@/lib/domains'
import { buildSiteUrl } from '@/lib/domains'

const selfServePlans = publicKnowledge.pricing.tiers
const pricingSummary = selfServePlans
  .map((tier) => `${tier.name} ${tier.display.annualLabel}`)
  .join(';')
const offerTerms = publicKnowledge.pricing.display.launchOfferTerms

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  author: { '@type': 'Organization', name: 'CapVeri' },
  datePublished: '2026-02-23',
  dateModified: '2026-05-01',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Does MRI Software do CAM reconciliation?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. MRI Commercial Management and the MRI Angus module both include CAM recovery and reconciliation features for commercial properties.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does MRI Software cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MRI Software does not publish public pricing. Commercial management modules typically start around $10,000/year, with enterprise and global deployments reaching five to six figures. Professional services for implementation are additional.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can CapVeri work with MRI exports?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Export CAM expense data from MRI using Rapid Reports (CSV or XLS) and upload it directly to CapVeri. No API integration or MRI credentials required.',
      },
    },
  ],
}

export function MriComparisonPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="CapVeri vs MRI Software: CAM Reconciliation Comparison (2026)"
        description="MRI Software is an enterprise property management platform with powerful CAM recovery features. CapVeri is a purpose-built audit tool that requires no implementation consultant."
        canonical="/vs/mri"
        structuredData={[
          faqSchema,
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Comparisons', url: '/vs' },
            { name: 'CapVeri vs MRI', url: '/vs/mri' },
          ]),
        ]}
      />
      <LandingNav variant="light" />

      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          <article className="prose  max-w-none">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
              CapVeri vs MRI Software: CAM Reconciliation
            </h1>

            {/* Byline */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
              <span>
                By{' '}
                <strong className="font-medium text-foreground">CapVeri</strong>
              </span>
              <span aria-hidden="true">·</span>
              <time dateTime="2026-05-01">Updated May 1, 2026</time>
            </div>

            <p className="text-lg text-muted-foreground mb-8">
              TL;DR: CapVeri is the recommended choice if you want to check CAM
              reconciliations before you bill tenants. It does gross-up and cap
              math the same way every time. You set it up from a CSV file. You
              get an audit trail and you are ready for disputes. MRI may win if
              you need to replace your whole ERP with an enterprise platform,
              managed services, and a months-long setup.
            </p>

            {/* TL;DR */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                TL;DR: Key Differences
              </h2>
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 not-prose">
                <ul className="space-y-3">
                  {[
                    'MRI handles your full property operation at enterprise scale. CapVeri handles CRE FinOps and compliance: reconciliation, cap enforcement, SB 1103, and demand letters.',
                    'MRI\'s own G2 users note: "Some setup can be difficult to do without MRI assistance, but the cost is pretty high." CapVeri is self-serve from day one.',
                    'Using MRI already? Export CAM expense data via Rapid Reports to CSV and check it in CapVeri. No credentials needed.',
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-foreground text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Comparison Table */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">At a Glance</h2>
              <div className="not-prose overflow-x-auto">
                <table className="w-full text-sm border-collapse border border-border">
                  <thead>
                    <tr className="bg-muted">
                      <th
                        scope="col"
                        className="border border-border px-4 py-3 text-left font-semibold"
                      >
                        &nbsp;
                      </th>
                      <th
                        scope="col"
                        className="border border-border px-4 py-3 text-left font-semibold"
                      >
                        CapVeri
                      </th>
                      <th
                        scope="col"
                        className="border border-border px-4 py-3 text-left font-semibold"
                      >
                        MRI Commercial Management
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: 'Purpose',
                        capveri: 'CAM audit & reconciliation',
                        mri: 'Full property management',
                      },
                      {
                        label: 'Setup',
                        capveri: 'Self-serve, CSV upload',
                        mri: 'Professional services required',
                      },
                      {
                        label: 'Starting price',
                        capveri: `${pricingSummary}. ${offerTerms}`,
                        mri: '~$10,000/year',
                      },
                      {
                        label: 'Lease abstraction',
                        capveri: 'AI + mandatory human verify',
                        mri: 'AI + human verify',
                      },
                      {
                        label: 'No integration needed',
                        capveri: 'Yes, any CSV export',
                        mri: 'N/A',
                      },
                    ].map((row) => (
                      <tr key={row.label} className="even:bg-muted/30">
                        <td className="border border-border px-4 py-3 font-medium">
                          {row.label}
                        </td>
                        <td className="border border-border px-4 py-3 text-primary font-medium">
                          {row.capveri}
                        </td>
                        <td className="border border-border px-4 py-3 text-muted-foreground">
                          {row.mri}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Setup Complexity */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Setup Complexity and Cost
              </h2>
              <p className="text-muted-foreground mb-4">
                MRI is widely considered the most implementation-intensive of
                the major CRE platforms. Professional services for initial
                configuration are standard practice, not optional. G2 reviewers
                note that complex setups, including CAM pools and recovery
                groups, need either MRI Professional Services or a certified MRI
                partner.
              </p>
              <p className="text-muted-foreground mb-4">
                CapVeri requires no implementation. Upload a CSV export of your
                CAM expense data and receive a BOMA 2024 aligned reconciliation
                in minutes.
              </p>
              <blockquote className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground text-sm not-prose">
                "Some setup can be difficult to do without MRI assistance, but
                the cost is pretty high." MRI Software user, G2 Reviews
              </blockquote>
            </section>

            {/* CAM Capabilities */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                CAM Reconciliation Capabilities
              </h2>
              <p className="text-muted-foreground mb-4">
                MRI Commercial Management supports sophisticated CAM recovery:
                expense pools, escalation groups, occupancy adjustments, and
                tenant-level overrides. MRI Angus markets itself as offering
                "the easiest CAM reconciliations you'll ever do." User reviews
                suggest the reality is more mixed.
              </p>
              <p className="text-muted-foreground mb-4">
                MRI also offers a managed services option. That means MRI's team
                handles reconciliation for you. This is a real plus for
                operators who want to hand off the work.
              </p>
              <div className="grid md:grid-cols-2 gap-4 not-prose mb-4">
                <div className="bg-card border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">MRI Strengths</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Complex retail CAM pools</li>
                    <li>• Managed services (outsourced)</li>
                    <li>• Enterprise-scale portfolios</li>
                    <li>• Global deployments</li>
                    <li>• Deep ERP integration</li>
                  </ul>
                </div>
                <div className="bg-card border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">MRI Pain Points</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• High implementation cost</li>
                    <li>• Expert help required for setup</li>
                    <li>• Slow performance on large datasets</li>
                    <li>• Steep learning curve</li>
                    <li>• Bank reconciliation can take minutes</li>
                  </ul>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                CapVeri uses deterministic Python for the math. No AI does the
                financial math. No setup is required. Every result can be
                reproduced and defended in an audit.
              </p>
            </section>

            {/* Pricing */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">Pricing</h2>
              <div className="grid md:grid-cols-2 gap-4 not-prose">
                <div className="border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">CapVeri</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• {TRIAL_COPY}, no credit card required</li>
                    {selfServePlans.map((tier) => (
                      <li key={tier.id}>
                        • {tier.name} {tier.display.annualLabel}
                      </li>
                    ))}
                    <li>• {offerTerms}</li>
                    <li>• No professional services fee</li>
                  </ul>
                </div>
                <div className="border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">MRI Software</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Commercial modules from ~$10,000/year</li>
                    <li>• Enterprise deployments: five to six figures</li>
                    <li>• Professional services billed separately</li>
                    <li>• No public pricing page</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Who it's for */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Who Each Tool Is Best For
              </h2>
              <div className="grid md:grid-cols-2 gap-4 not-prose">
                <div className="border border-primary/30 rounded-lg p-5">
                  <h3 className="font-semibold mb-3 text-primary">
                    Choose CapVeri if…
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {[
                      'You want to verify a MRI-generated reconciliation',
                      'You need BOMA 2024 gross-up without a consultant',
                      'You manage commercial leases without needing full PM',
                      'You want to get started in minutes, not months',
                    ].map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">Choose MRI if…</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {[
                      'You manage complex retail CAM pools at enterprise scale',
                      'You want a single platform for full property operations',
                      'You want to outsource CAM processing entirely (managed services)',
                      'You have budget for multi-month implementation',
                    ].map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* FAQ */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-6 not-prose">
                {[
                  {
                    q: 'Does MRI Software do CAM reconciliation?',
                    a: 'Yes. MRI Commercial Management and the MRI Angus module both include CAM recovery and reconciliation. MRI also offers a managed services option where MRI handles reconciliation on your behalf.',
                  },
                  {
                    q: 'How much does MRI Software cost?',
                    a: 'MRI does not publish pricing. Commercial management typically starts around $10,000/year; global enterprise deployments reach five to six figures. Professional services for implementation are billed separately.',
                  },
                  {
                    q: 'Can CapVeri work with MRI exports?',
                    a: 'Yes. Export CAM expense data from MRI using Rapid Reports (CSV or XLS format) and upload it directly to CapVeri. No API integration or MRI credentials required.',
                  },
                ].map((faq) => (
                  <div key={faq.q} className="border-b pb-4">
                    <h3 className="font-semibold mb-2">{faq.q}</h3>
                    <p className="text-muted-foreground text-sm">{faq.a}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA */}
            <section className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <h2 className="text-2xl font-bold mb-3">
                Already Using MRI? Verify Your CAM in 60 Seconds.
              </h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                Export CAM expense data from MRI via Rapid Reports. Upload the
                CSV to CapVeri. Get BOMA 2024 aligned results with error flags
                and recovery estimates. No professional services required.
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
