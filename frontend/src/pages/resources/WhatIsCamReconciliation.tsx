/**
 * GEO-Optimized Resource Page: What is CAM Reconciliation
 *
 * Answer-first content structure for AI search engine optimization
 */

import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Calculator,
  FileText,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { faqData } from './cam-reconciliation-data'
import { buildSiteUrl } from '@/lib/domains'

// ============================================================================
// Page Component
// ============================================================================

export function WhatIsCamReconciliationPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="What is CAM Reconciliation? Complete Guide for Property Managers"
        description="What is CAM reconciliation and how does it work? A practical guide for property managers and landlords covering CAM charges, gross-up calculations, caps, and reconciliation best practices."
        canonical="/resources/what-is-cam-reconciliation"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline:
              'What is CAM Reconciliation? A Complete Guide for Property Managers',
            description:
              'What is CAM reconciliation and how does it work? A practical guide for property managers and landlords covering CAM charges, gross-up calculations, caps, and reconciliation best practices.',
            author: { '@type': 'Organization', name: 'CapVeri' },
            publisher: { '@type': 'Organization', name: 'CapVeri' },
            datePublished: '2026-02-23',
            dateModified: '2026-02-23',
            url: buildSiteUrl('/resources/what-is-cam-reconciliation'),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqData.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          },
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Resources', url: '/resources' },
            {
              name: 'What is CAM Reconciliation',
              url: '/resources/what-is-cam-reconciliation',
            },
          ]),
        ]}
      />
      <LandingNav variant="light" />

      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          {/* Back Navigation */}
          <Link
            to="/resources"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Resources
          </Link>

          {/* Main Content */}
          <article className="prose  max-w-none">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
              What is CAM Reconciliation? A Complete Guide for Property Managers
            </h1>

            {/* Byline */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
              <span>
                By{''}
                <strong className="font-medium text-foreground">CapVeri</strong>
              </span>
              <span aria-hidden="true">·</span>
              <time dateTime="2026-02-23">Updated February 23, 2026</time>
            </div>

            {/* TL;DR Section (Answer-First) */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 mb-8 not-prose">
              <h2 className="text-lg font-semibold text-primary mb-2 flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Quick Answer
              </h2>
              <p className="text-foreground">
                CAM reconciliation is the annual process of comparing estimated
                common area maintenance charges to actual expenses. As a
                commercial tenant, you pay monthly estimates throughout the
                year, then receive a reconciliation statement showing whether
                you owe additional money or are due a refund based on actual
                costs.
              </p>
            </div>

            {/* Introduction */}
            <p className="text-lg text-muted-foreground mb-8">
              Common Area Maintenance (CAM) charges are a significant expense
              for commercial tenants. Understanding how CAM reconciliation works
              is essential for managing your occupancy costs and ensuring
              you&apos;re not overcharged. This guide explains everything you
              need to know about the CAM reconciliation process.
            </p>

            {/* What is CAM? */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                What Are Common Area Maintenance (CAM) Charges?
              </h2>
              <p className="text-muted-foreground mb-4">
                CAM charges are the tenant&apos;s proportionate share of
                operating expenses for maintaining common areas in commercial
                properties. These areas include lobbies, hallways, parking lots,
                landscaping, and shared facilities that benefit all tenants.
              </p>

              <div className="grid md:grid-cols-2 gap-4 not-prose mb-6">
                <div className="bg-card border rounded-lg p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Typically Included
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Property taxes</li>
                    <li>• Property insurance</li>
                    <li>• Maintenance & repairs</li>
                    <li>• Landscaping & snow removal</li>
                    <li>• Security services</li>
                    <li>• Common area utilities</li>
                  </ul>
                </div>

                <div className="bg-card border rounded-lg p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-warning" />
                    Often Excluded
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Capital improvements</li>
                    <li>• Leasing commissions</li>
                    <li>• Legal fees for disputes</li>
                    <li>• Marketing costs</li>
                    <li>• Above-market mgmt fees</li>
                    <li>• Owner-specific expenses</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* How Reconciliation Works */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                How Does CAM Reconciliation Work?
              </h2>

              <div className="space-y-4 not-prose mb-6">
                {[
                  {
                    title: 'Monthly Estimates',
                    desc: "You pay estimated CAM charges monthly based on the landlord's budget projection.",
                  },
                  {
                    title: 'Year-End Calculation',
                    desc: 'Landlord tallies actual operating expenses at year end.',
                  },
                  {
                    title: 'Pro-Rata Allocation',
                    desc: 'Your share is calculated based on your rentable square footage percentage.',
                  },
                  {
                    title: 'Reconciliation Statement',
                    desc: 'Statement shows estimated vs. actual, with adjustment amount.',
                  },
                  {
                    title: 'Settlement',
                    desc: 'You either pay the shortfall or receive a credit/refund for overpayment.',
                  },
                ].map((step, index) => (
                  <div key={step.title} className="flex gap-4 items-start">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{step.title}</h3>
                      <p className="text-muted-foreground text-sm">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Why It Matters */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Why Is CAM Reconciliation Important for Tenants?
              </h2>

              <ul className="space-y-3 not-prose">
                {[
                  'CAM charges can represent 20-40% of total occupancy costs',
                  'Billing errors in CAM statements are common. Overcharges go uncontested when no one reviews the math',
                  'Understanding reconciliation helps you budget accurately',
                  'You have legal rights to audit and dispute charges',
                  'Proper tracking prevents overpayment year after year',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Common Issues */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                What Are Common CAM Reconciliation Issues?
              </h2>

              <div className="grid gap-4 not-prose">
                {[
                  {
                    icon: Calculator,
                    title: 'Calculation Errors',
                    desc: 'Incorrect pro rata shares, math errors, or wrong base year figures.',
                  },
                  {
                    icon: FileText,
                    title: 'Improper Inclusions',
                    desc: 'Capital expenses or excluded items charged as operating expenses.',
                  },
                  {
                    icon: TrendingUp,
                    title: 'Gross-Up Mistakes',
                    desc: 'Incorrect occupancy percentages or applying gross-up to non-variable expenses.',
                  },
                  {
                    icon: AlertTriangle,
                    title: 'CAM Cap Violations',
                    desc: 'Exceeding contractual caps or miscalculating cap application.',
                  },
                ].map((issue) => (
                  <div
                    key={issue.title}
                    className="flex gap-4 p-4 border rounded-lg"
                  >
                    <issue.icon className="w-6 h-6 text-primary flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold">{issue.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {issue.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* FAQ Section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">
                Frequently Asked Questions
              </h2>

              <div className="space-y-6 not-prose">
                {faqData.map((faq) => (
                  <div key={faq.question} className="border-b pb-4">
                    <h3 className="font-semibold mb-2">{faq.question}</h3>
                    <p className="text-muted-foreground text-sm">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA Section */}
            <section className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <h2 className="text-2xl font-bold mb-3">
                Automate Your CAM Reconciliation Review
              </h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                CapVeri uses BOMA 2024 standards to automatically analyze your
                CAM statements, identify errors, and calculate potential
                recovery amounts.
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
