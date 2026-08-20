/**
 * About Page
 *
 * Company information and mission statement
 */
import { Link } from 'react-router-dom'
import {
  Target,
  Lightbulb,
  Shield,
  Lock,
  FileText,
  Bot,
  Activity,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { buildSiteUrl } from '@/lib/domains'

const values = [
  {
    icon: Target,
    title: 'Deterministic Accuracy',
    description:
      'Every dollar is traceable. Our calculation engine uses hard-coded logic, not probabilistic AI, ensuring 100% auditable results.',
  },
  {
    icon: Lightbulb,
    title: 'No integration needed',
    description:
      'We work with the data you already have. No expensive ERP integrations, no API fees, no implementation consultants.',
  },
  {
    icon: Shield,
    title: 'Data Security First',
    description:
      'CapVeri protects customer data with encryption, organization-scoped access controls, and audit logging for financial record changes.',
  },
]

const securityClaims = [
  {
    icon: Lock,
    title: 'Encryption in transit and at rest',
    description:
      'Customer data is protected with encryption in transit and at rest.',
  },
  {
    icon: Shield,
    title: 'Row-level multi-tenant isolation',
    description:
      'Every data table is partitioned by organization. PostgreSQL RLS enforces boundaries at the database layer.',
  },
  {
    icon: FileText,
    title: 'Financial record retention',
    description:
      'Retention policies are designed for financial recordkeeping workflows and operational data lifecycle needs.',
  },
  {
    icon: Target,
    title: 'Append-only audit log',
    description:
      'Every change to GL entries, reconciliation snapshots, and leases is captured in an append-only audit log with before/after state and timestamp.',
  },
  {
    icon: Bot,
    title: 'AI with mandatory human review',
    description:
      'AI is used only to extract lease terms from PDFs. Every extraction requires human review before it affects any calculation.',
  },
  {
    icon: Activity,
    title: 'Enterprise-Grade Reliability',
    description:
      "Built for reliability — with health monitoring, failover architecture, and disaster recovery designed for year-end CRE FinOps workflows when downtime isn't an option.",
  },
]

const aboutSchemas = [
  structuredDataSchemas.organization,
  {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'About CapVeri',
    description:
      'CapVeri is the CRE FinOps platform for commercial real estate landlords and property managers. Deterministic BOMA 2024 calculations, no ERP integrations needed.',
    url: buildSiteUrl('/about'),
    datePublished: '2024-01-01',
    dateModified: '2026-02-23',
    publisher: {
      '@type': 'Organization',
      name: 'CapVeri',
      url: buildSiteUrl('/'),
    },
    inLanguage: 'en-US',
  },
  structuredDataSchemas.breadcrumbList([
    { name: 'Home', url: '/' },
    { name: 'About', url: '/about' },
  ]),
]

export function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="About CapVeri - CRE FinOps Platform"
        description="CapVeri is the CRE FinOps platform for commercial real estate landlords and property managers. Deterministic BOMA 2024 calculations, no ERP integrations needed."
        canonical="/about"
        structuredData={aboutSchemas}
      />
      <LandingNav variant="light" />

      {/* Header */}
      <div className="border-b bg-muted pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground">
            About CapVeri
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Accurate CAM reconciliation for commercial landlords
          </p>
        </div>
      </div>

      {/* Mission */}
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-6">
            Our Mission
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            CapVeri was built because the loss is real: commercial landlords
            miss 3&ndash;5% of their operating expense recoveries every year,
            mostly to calculation errors and reconciliation work that falls
            through the cracks &mdash;{' '}
            <a
              href="https://www.boma.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              per BOMA industry research
            </a>
            .
          </p>
          <p className="text-lg text-muted-foreground mb-6">
            Our deterministic calculation engine, powered by BOMA 2024
            standards, automates what property accountants do manually - but
            faster, more accurately, and without the risk of human error.
          </p>
          <p className="text-lg text-muted-foreground">
            We believe property managers should not need to replace their entire
            tech stack for accurate CRE financial operations. CapVeri works with
            simple CSV exports from any ERP - Yardi, MRI, AppFolio, or Excel.
          </p>
        </div>
      </div>

      {/* Values */}
      <div className="bg-muted py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-8 text-center">
            Our Values
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => (
              <Card key={value.title} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <value.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {value.title}
                  </h3>
                  <p className="text-muted-foreground">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Security & Compliance */}
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-3">
            Security &amp; Compliance
          </h2>
          <p className="text-muted-foreground mb-8">
            Built for property managers and CFOs who need to demonstrate due
            diligence to their own stakeholders.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {securityClaims.map((claim) => (
              <Card key={claim.title} className="border shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <claim.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">
                    {claim.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {claim.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              to="/compliance/ai-transparency"
              className="text-primary hover:underline font-medium"
            >
              AI Transparency Statement
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link
              to="/privacy"
              className="text-primary hover:underline font-medium"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 p-12 text-center">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-4">
            Ready to Reconcile CAM the Right Way?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Start your free trial. See your first CAM reconciliation in minutes.
          </p>
          <Button asChild size="lg">
            <Link to="/auth/register">
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <Footer />
    </div>
  )
}
