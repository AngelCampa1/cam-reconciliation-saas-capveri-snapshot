/**
 * Competitor Comparison Page: CapVeri vs AppFolio
 *
 * Honest, balanced comparison for high-intent SEO traffic.
 * Target query:"AppFolio commercial CAM reconciliation"
 */

import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { publicKnowledge } from '@/generated/public-knowledge'
import { buildSiteUrl } from '@/lib/domains'

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  author: { '@type': 'Organization', name: 'CapVeri' },
  datePublished: '2026-02-23',
  dateModified: '2026-05-01',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Does AppFolio support commercial CAM reconciliation?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'AppFolio includes basic CAM tracking and reconciliation. However, it is a residential-first platform and lacks documented support for BOMA gross-up or complex NNN lease CAM structures.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the difference between AppFolio and a dedicated CAM tool?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'AppFolio is a full property management platform designed primarily for residential portfolios with commercial features added over time. CapVeri is a CRE FinOps and compliance platform purpose-built for commercial NNN lease landlords with BOMA 2024 gross-up, cap tracking, and pro-rata validation.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can CapVeri work with AppFolio?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Yes. Export billing or expense data from AppFolio's reporting module as CSV and upload it to CapVeri. No API integration or AppFolio credentials required.",
      },
    },
  ],
}

export function AppFolioComparisonPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="CapVeri vs AppFolio: Commercial CAM Reconciliation Comparison (2026)"
        description="AppFolio is a residential-first property management platform. CapVeri is a CRE FinOps and compliance platform purpose-built for commercial landlords with BOMA 2024 gross-up, cap enforcement, and SB 1103 compliance."
        canonical="/vs/appfolio"
        structuredData={[
          faqSchema,
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Comparisons', url: '/vs' },
            { name: 'CapVeri vs AppFolio', url: '/vs/appfolio' },
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
              CapVeri vs AppFolio: CAM Reconciliation for Commercial Properties
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
              get an audit trail and you are ready for disputes. AppFolio may
              fit residential-first teams or simple mixed portfolios with basic
              commercial CAM needs.
            </p>

            {/* TL;DR */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                TL;DR: Key Differences
              </h2>
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 not-prose">
                <ul className="space-y-3">
                  {[
                    'AppFolio is a residential-first platform. Commercial features were added over time, not designed from the ground up.',
                    "AppFolio's commercial CAM tracking lacks documented support for BOMA gross-up or complex NNN lease structures.",
                    'CapVeri is purpose-built for commercial: BOMA 2024 gross-up, pro-rata validation, cap tracking, and AI lease extraction with mandatory human review.',
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
                        AppFolio Core
                      </th>
                      <th
                        scope="col"
                        className="border border-border px-4 py-3 text-left font-semibold"
                      >
                        AppFolio Max
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: 'Built for commercial',
                        capveri: 'Yes',
                        core: 'No (residential-first)',
                        max: 'No (residential-first)',
                      },
                      {
                        label: 'CAM gross-up',
                        capveri: 'BOMA 2024, fixed/variable split',
                        core: 'Not documented',
                        max: 'Not documented',
                      },
                      {
                        label: 'NNN lease depth',
                        capveri: 'Purpose-built',
                        core: 'Limited',
                        max: 'Limited',
                      },
                      {
                        label: 'Pricing',
                        capveri:
                          publicKnowledge.pricing.display.selfServeSummary,
                        core: '$1.50/unit/mo ($298 min)',
                        max: '$5.00/unit/mo',
                      },
                      {
                        label: 'No integration needed',
                        capveri: 'Yes, any CSV export',
                        core: 'N/A',
                        max: 'N/A',
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
                          {row.core}
                        </td>
                        <td className="border border-border px-4 py-3 text-muted-foreground">
                          {row.max}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Commercial CAM depth */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Commercial CAM Reconciliation Depth
              </h2>
              <p className="text-muted-foreground mb-4">
                AppFolio includes CAM tracking and basic reconciliation at the
                Core tier. For simple portfolios (a small strip center or a few
                commercial suites next to residential) this may be enough.
              </p>
              <p className="text-muted-foreground mb-4">
                As portfolios get more complex (more tenant types, NNN leases
                with different exclusions, BOMA gross-up needs, cap structures)
                the residential-first design starts to strain. Industry analysis
                notes that "managing a commercial portfolio with
                residential-first software creates predictable problems: missed
                rent reviews, manual CAM reconciliations, and lease data
                scattered across PDFs."
              </p>
              <div className="grid gap-4 not-prose mb-4">
                {[
                  {
                    title: 'AppFolio strength: residential simplicity',
                    desc: 'AppFolio is genuinely excellent for residential portfolios. Intuitive, affordable, with great mobile support and tenant communication tools.',
                    warn: false,
                  },
                  {
                    title: 'AppFolio limitation: commercial CAM complexity',
                    desc: "Limited BOMA gross-up depth. No pro-rata denominator validation. Users report accounting errors, confusing payment workflows, and CAM setup gotchas. One example: expenses that don't show up during reconciliation because the GL account wasn't added to a GL group.",
                    warn: true,
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-4 p-4 border rounded-lg"
                  >
                    {item.warn ? (
                      <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h3 className="font-semibold text-sm">{item.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Gross-up and BOMA */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Gross-Up and BOMA Standards
              </h2>
              <p className="text-muted-foreground mb-4">
                BOMA 2024 gross-up requires bifurcating CAM expenses into fixed
                and variable components. Variable expenses are grossed up to
                reflect what costs would have been at full occupancy, with a
                multiplier capped at 1.0. This prevents landlords from
                over-recovering during low-occupancy periods.
              </p>
              <p className="text-muted-foreground mb-4">
                AppFolio advertises CAM reconciliation and does support pro-rata
                allocation by square footage, but does not document BOMA
                gross-up methodology in public materials. The depth needed for
                NNN lease gross-up (fixed/variable split, occupancy adjustment
                capped at 1.0) is not available. CapVeri does BOMA 2024 gross-up
                with deterministic Python. No AI does the financial math, and
                every result can be defended in an audit.
              </p>
              <p className="text-muted-foreground mb-4">
                Industry research shows 40% of CAM reconciliations contain
                material errors (Tango Analytics). For portfolios with BOMA
                gross-up obligations, using a tool without that capability
                creates direct exposure.
              </p>
            </section>

            {/* Pricing */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">Pricing</h2>
              <div className="grid md:grid-cols-2 gap-4 not-prose">
                <div className="border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">CapVeri</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• {publicKnowledge.pricing.display.trialCopy}</li>
                    <li>
                      •{''}
                      {
                        publicKnowledge.pricing.display.tierPriceLabels
                          .reconcile
                      }
                    </li>
                    <li>
                      •{''}
                      {publicKnowledge.pricing.display.launchOfferTerms}
                    </li>
                    <li>• Unit count selected before billing details</li>
                    <li>
                      • {publicKnowledge.pricing.display.launchOfferTerms}
                    </li>
                  </ul>
                </div>
                <div className="border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">AppFolio</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Core: $1.50/unit/month ($298 minimum)</li>
                    <li>• Plus: $3.20/unit/month</li>
                    <li>• Max: $5.00/unit/month</li>
                    <li>• CAM features at Core tier</li>
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
                      'Your portfolio is primarily commercial NNN leases',
                      'You need BOMA 2024 gross-up and cap tracking',
                      'You want to audit reconciliations from any ERP via CSV',
                      'Accuracy and audit-defensibility are non-negotiable',
                    ].map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">Choose AppFolio if…</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {[
                      'You primarily manage residential with a few commercial units',
                      'You value ease of use and mobile-first design',
                      'Your commercial CAM needs are straightforward',
                      'Budget is a primary constraint',
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
                    q: 'Does AppFolio support commercial CAM reconciliation?',
                    a: 'Yes. AppFolio advertises CAM reconciliation and supports pro-rata allocation by square footage. However, BOMA gross-up depth is limited, setup has known gotchas (GL accounts must be added to GL groups or expenses will not appear in reconciliation), and user reviews consistently flag accounting errors and cumbersome workflows for commercial portfolios.',
                  },
                  {
                    q: 'What is the difference between AppFolio and a dedicated CAM tool?',
                    a: 'AppFolio is a full property management platform designed primarily for residential, with commercial features added over time. CapVeri is a CRE FinOps and compliance platform purpose-built for commercial landlords with BOMA 2024 gross-up, pro-rata denominator validation, and cap tracking.',
                  },
                  {
                    q: 'Can CapVeri work with AppFolio?',
                    a: "Yes. Export billing or expense data from AppFolio's reporting module as CSV and upload it to CapVeri. No API integration or AppFolio credentials required.",
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
                Already Using AppFolio? Add Commercial CAM Depth.
              </h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                Export billing data from AppFolio as CSV and run CAM audits in
                CapVeri. Get BOMA 2024 gross-up, cap tracking, and pro-rata
                validation without switching platforms.
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
