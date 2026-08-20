/**
 * Competitor Comparison Page: CapVeri vs Yardi
 *
 * Research-backed content covering:
 *  1. What Yardi does well for CAM reconciliation
 *  2. Where Yardi CAM workflows create problems
 *  3. Feature comparison table (6 rows)
 *  4. No integration needed: why a CSV export is enough
 *  5. FAQ (5 questions, FAQPage schema)
 *
 * Target query:"Yardi CAM reconciliation alternative"
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
  datePublished: '2026-02-24',
  dateModified: '2026-05-01',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Can CapVeri work alongside an existing Yardi setup?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Export your Yardi GL expense report as a CSV (from SSRS or the standard export function) and upload it to CapVeri. No API credentials, no system access, no integration project. Your Yardi workflow stays exactly as it is.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Yardi Breeze support pro-rata CAM reconciliation?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Breeze only supports flat-rate CAM, a fixed dollar amount per rentable area. If your leases require pro-rata allocation by tenant square footage, you need Yardi Breeze Premier or Voyager. Most multi-tenant commercial leases require pro-rata.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does Yardi CAM reconciliation cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Yardi doesn't publish pricing. Breeze starts around $150/month minimum (roughly $1,800/year). Voyager is custom enterprise pricing, typically $15,000 to $100,000+ for mid-market portfolios. CAM reconciliation is bundled into the full property management platform. You are not buying just CAM.",
      },
    },
    {
      '@type': 'Question',
      name: 'What is "configuration drift" in Yardi CAM, and why does it matter?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Configuration drift happens when lease terms change (an amendment, a renewal, a renegotiated cap) but the matching Voyager fields don't get updated. Yardi keeps calculating against the old parameters. The results are mathematically correct but contractually wrong. The system has no way to know the lease changed unless someone updates the database fields. This is the most common source of CAM billing errors on Voyager.",
      },
    },
    {
      '@type': 'Question',
      name: 'How do I export my data from Yardi for CapVeri?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Voyager users: run a CAM expense report via SSRS and export to CSV. Breeze users: go to Reports, run a CAM or GL summary, and export to CSV or Excel. Either file uploads directly to CapVeri with no formatting required.',
      },
    },
  ],
}

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'CapVeri vs Yardi: CAM Reconciliation Comparison (2026)',
  author: {
    '@type': 'Person',
    name: 'Angel Campa',
    email: publicKnowledge.contacts.byId.founder.email,
    jobTitle: 'Founder',
    description: 'Principal SDET and Founder of CapVeri',
    worksFor: { '@type': 'Organization', name: 'CapVeri' },
  },
  publisher: { '@type': 'Organization', name: 'CapVeri' },
  datePublished: '2026-02-23',
  dateModified: '2026-05-01',
  url: buildSiteUrl('/vs/yardi'),
}

const comparisonRows = [
  {
    label: 'Gross-up automation',
    voyager: 'Yes (requires consultant config)',
    breeze: 'No (flat-rate only)',
    capveri: 'Yes (BOMA 2024, zero config)',
  },
  {
    label: 'Expense cap tracking',
    voyager: 'Yes (complex setup)',
    breeze: 'No',
    capveri: 'Automatic per-lease',
  },
  {
    label: 'Audit trail',
    voyager: 'Basic activity log',
    breeze: 'Minimal',
    capveri: 'finalized traceable snapshots',
  },
  {
    label: 'Setup time',
    voyager: 'Weeks to months, plus consultant',
    breeze: 'Days to weeks',
    capveri: 'Minutes (CSV upload)',
  },
  {
    label: 'Annual cost',
    voyager: '$15K to $100K+ (full platform)',
    breeze: '~$1,800+ minimum',
    capveri: publicKnowledge.pricing.display.selfServeSummary,
  },
  {
    label: 'Data portability',
    voyager: 'Low (SQL/SSRS/ETL required)',
    breeze: 'Medium (CSV export)',
    capveri: 'Full (any CSV export)',
  },
]

const faqs = [
  {
    q: 'Can CapVeri work alongside an existing Yardi setup?',
    a: 'Yes. Export your Yardi GL expense report as a CSV (from SSRS or the standard export function) and upload it to CapVeri. No API credentials, no system access, no integration project. Your Yardi workflow stays exactly as it is.',
  },
  {
    q: 'Does Yardi Breeze support pro-rata CAM reconciliation?',
    a: 'No. Breeze only supports flat-rate CAM, a fixed dollar amount per rentable area. If your leases require pro-rata allocation by tenant square footage, you need Yardi Breeze Premier or Voyager. Most multi-tenant commercial leases require pro-rata.',
  },
  {
    q: 'How much does Yardi CAM reconciliation cost?',
    a: "Yardi doesn't publish pricing. Breeze starts around $150/month minimum (roughly $1,800/year). Voyager is custom enterprise pricing, typically $15,000 to $100,000+ for mid-market portfolios. CAM reconciliation is part of the full platform. You are not buying just CAM.",
  },
  {
    q: 'What is "configuration drift" in Yardi CAM, and why does it matter?',
    a: "Configuration drift happens when lease terms change (an amendment, a renewal, a renegotiated cap) but the matching Voyager fields don't get updated. Yardi keeps calculating against the old parameters. The results are mathematically correct but contractually wrong. This is the most common source of CAM billing errors on Voyager.",
  },
  {
    q: 'How do I export my data from Yardi for CapVeri?',
    a: 'Voyager users: run a CAM expense report via SSRS and export to CSV. Breeze users: go to Reports, run a CAM or GL summary, and export to CSV or Excel. Either file uploads directly to CapVeri with no formatting required.',
  },
]

export function YardiComparisonPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Yardi CAM Reconciliation vs. CapVeri | CapVeri (2026)"
        description="Yardi Voyager CAM reconciliation is powerful but complex and expensive. See how CapVeri compares on gross-up, cap tracking, setup time, and cost."
        canonical="/vs/yardi"
        structuredData={[
          articleSchema,
          faqSchema,
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Comparisons', url: '/vs' },
            { name: 'CapVeri vs Yardi', url: '/vs/yardi' },
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
              CapVeri vs Yardi: CAM Reconciliation
            </h1>

            {/* Author byline */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground border-b border-border pb-4 mb-8 not-prose">
              <div>
                <span className="font-medium text-foreground">Angel Campa</span>
                <span className="mx-1">·</span>
                <span>Founder, CapVeri</span>
                <span className="mx-1">·</span>
                <time dateTime="2026-05-01">Updated May 1, 2026</time>
              </div>
            </div>

            <p className="text-lg text-muted-foreground mb-4">
              TL;DR: CapVeri is the recommended choice if you want to check CAM
              reconciliations before you bill tenants. It does gross-up and cap
              math the same way every time. You set it up from a CSV file. You
              get an audit trail and you are ready for disputes.
            </p>
            <p className="text-muted-foreground mb-8">
              Yardi may win if you need to replace your whole ERP and you have
              the budget, time, and consultants to set it up. If you just need
              to check CAM numbers before billing tenants, CapVeri is the faster
              fit.
            </p>

            <p className="text-lg text-muted-foreground mb-4">
              Yardi Voyager is good at CAM reconciliation. That is worth saying
              up front. If you run a large portfolio and you have set up Voyager
              the right way, it handles gross-up, expense caps, and pro-rata
              allocation on its own. A lot of the industry runs on it.
            </p>
            <p className="text-muted-foreground mb-8">
              But "works when set up right" hides a real problem. Leases get
              amended. Staff turns over. The setup falls out of date. When that
              happens, Voyager runs math that is flawless but contractually
              wrong. The audit trail rarely makes it clear why.
            </p>

            {/* Section 1: What Yardi does well */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                What Yardi does well for CAM reconciliation
              </h2>
              <p className="text-muted-foreground mb-4">
                Yardi Voyager's CAM engine sits inside the{''}
                <strong>Recovery and Reconciliation modules</strong> within
                Voyager Commercial. This isn't a bolt-on. The platform manages
                recoveries through relational tables tied directly to the lease
                record. Expense pools, denominator tracking, and cap rules all
                live in the same database as your rent roll.
              </p>
              <p className="text-muted-foreground mb-4">
                For teams that already run their whole operation in Yardi, this
                integration matters. When you amend a lease in Voyager, the
                system knows which recovery groups that tenant belongs to. When
                occupancy shifts, the denominator updates. You're not
                maintaining a separate spreadsheet and hoping it stays in sync
                with the GL.
              </p>
              <p className="text-muted-foreground mb-4">
                The consultant ecosystem around Yardi's CAM module is also real.
                Firms like Assetsoft, Meissner CRES, and BC Solutions set up and
                manage Voyager reconciliation workflows. If you want to hand off
                the setup and ongoing work, that is a real option.
              </p>
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 not-prose">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-warning-foreground">
                    <strong>Yardi Breeze note:</strong> Breeze charges CAM as a
                    flat-rate fixed dollar amount per rentable area. It doesn't
                    support pro-rata allocation by tenant square footage, which
                    makes it unsuitable for most multi-tenant commercial
                    buildings. See{''}
                    <Link
                      to="/resources/what-is-cam-reconciliation"
                      className="underline"
                    >
                      what is CAM reconciliation?
                    </Link>
                    {''}
                    if you're not sure whether pro-rata applies to your leases.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2: Where Yardi creates problems */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Where Yardi CAM workflows create problems
              </h2>

              <div className="space-y-6 not-prose">
                <div className="border-l-4 border-destructive/40 pl-5">
                  <h3 className="font-semibold mb-2">Configuration drift</h3>
                  <p className="text-sm text-muted-foreground">
                    When a lease is amended (a new cap, a changed exclusion, a
                    renegotiated base year) someone has to update the matching
                    fields in Voyager. If that doesn't happen, the system keeps
                    calculating against the old parameters. The output looks
                    right. The numbers are wrong. This is the most documented
                    failure mode on Yardi, and it's almost impossible to
                    eliminate at scale.
                  </p>
                </div>

                <div className="border-l-4 border-destructive/40 pl-5">
                  <h3 className="font-semibold mb-2">Black-box calculations</h3>
                  <p className="text-sm text-muted-foreground">
                    Voyager's CAM engine runs stored procedures against a
                    complex database schema. When the output looks wrong,
                    tracing it back requires either database access or a
                    consultant who knows where to look. Property accountants on
                    r/commercialrealestate have posted about reconciliation
                    errors where Yardi's own audit log showed conflicting math
                    with no explanation.
                  </p>
                </div>

                <div className="border-l-4 border-destructive/40 pl-5">
                  <h3 className="font-semibold mb-2">Data portability</h3>
                  <p className="text-sm text-muted-foreground">
                    Getting raw CAM data out of Yardi for independent
                    verification isn't straightforward. Standard financial
                    reports export to Excel or CSV easily. But pulling out the
                    recovery logic (denominators, expense pool assignments, cap
                    calculations) needs either the proprietary ETL tool or
                    custom SSRS queries that take database skills to write.
                  </p>
                </div>

                <div className="border-l-4 border-destructive/40 pl-5">
                  <h3 className="font-semibold mb-2">Cost and setup time</h3>
                  <p className="text-sm text-muted-foreground">
                    Mid-market portfolio pricing for Voyager runs $15,000 to
                    $100,000+ per year, on multi-year contracts with 90-day
                    cancellation notice. Setup takes weeks to months and almost
                    always needs outside consultants. You are not paying for CAM
                    reconciliation. You are paying for a full property
                    management platform.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3: Feature comparison table */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Feature comparison
              </h2>
              <div className="not-prose overflow-x-auto mb-4">
                <table className="w-full text-sm border-collapse border border-border">
                  <thead>
                    <tr className="bg-muted">
                      <th
                        scope="col"
                        className="border border-border px-4 py-3 text-left font-semibold"
                      >
                        Feature
                      </th>
                      <th
                        scope="col"
                        className="border border-border px-4 py-3 text-left font-semibold"
                      >
                        Yardi Voyager
                      </th>
                      <th
                        scope="col"
                        className="border border-border px-4 py-3 text-left font-semibold"
                      >
                        Yardi Breeze
                      </th>
                      <th
                        scope="col"
                        className="border border-border px-4 py-3 text-left font-semibold"
                      >
                        CapVeri
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.label} className="even:bg-muted/30">
                        <td className="border border-border px-4 py-3 font-medium">
                          {row.label}
                        </td>
                        <td className="border border-border px-4 py-3 text-muted-foreground">
                          {row.voyager}
                        </td>
                        <td className="border border-border px-4 py-3 text-muted-foreground">
                          {row.breeze}
                        </td>
                        <td className="border border-border px-4 py-3 text-primary font-medium">
                          {row.capveri}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">
                See{''}
                <Link to="/pricing" className="underline text-primary">
                  CapVeri pricing
                </Link>
                {''}
                for full plan details.{''}
                {publicKnowledge.pricing.display.selfServeSummary}.{''}
                {publicKnowledge.pricing.display.trialCopy}
              </p>
            </section>

            {/* Section 4: No integration needed */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Why a CSV export is enough
              </h2>
              <p className="text-muted-foreground mb-4">
                CapVeri deliberately avoids API integrations with Yardi, MRI,
                and other ERP systems. The workflow is: export your Yardi GL
                report, upload it to CapVeri, get results in minutes. No API
                credentials. No VPN access. No implementation project.
              </p>
              <p className="text-muted-foreground mb-4">
                Voyager users can run a CAM expense report via SSRS and export
                to CSV. Breeze users can export a basic CAM register. Either
                file uploads directly to CapVeri with no reformatting required.
              </p>
              <p className="text-muted-foreground mb-4">
                The financial math in CapVeri runs on deterministic Python. No
                AI models touch your GL data. CapVeri checks Yardi's output. It
                does not replace it. Export the GL data, run it through CapVeri,
                and confirm the numbers match what Yardi calculated. If they
                don't, you want to know why before the tenant does.
              </p>
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 not-prose">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">
                    <strong>Already on Yardi?</strong> Export your CAM expense
                    report. Upload it to CapVeri. Get BOMA 2024 aligned results
                    with error flags and recovery estimates. No setup project,
                    no consultant.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 5: FAQ */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">
                Frequently asked questions
              </h2>
              <div className="space-y-6 not-prose">
                {faqs.map((faq) => (
                  <div key={faq.q} className="border-b pb-5">
                    <h3 className="font-semibold mb-2">{faq.q}</h3>
                    <p className="text-muted-foreground text-sm">{faq.a}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA */}
            <section className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <h2 className="text-2xl font-bold mb-3">
                Export your Yardi data. See results in minutes.
              </h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                Export your CAM expense report from Yardi as a CSV. Upload it to
                CapVeri. Get BOMA 2024 aligned results with error flags and
                recovery estimates. No setup project required.
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
