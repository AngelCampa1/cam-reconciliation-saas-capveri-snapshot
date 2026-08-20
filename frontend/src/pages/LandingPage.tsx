/**
 * Landing Page
 *
 * Public marketing page for unauthenticated users.
 * Shows value proposition, features, and CTAs.
 */
import {
  HeroSection,
  ValuePropositionSection,
  ROICalculator,
  HowItWorksSection,
  FeaturesGrid,
  PricingTeaser,
  CTASection,
  LandingNav,
  FAQSection,
  SocialProofStrip,
} from '@/components/landing'
import { LANDING_FAQS } from '@/components/landing/FAQSection'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { Link } from 'react-router-dom'
import { ArrowRight, Calculator } from 'lucide-react'

const landingSchemas = [
  structuredDataSchemas.organization,
  structuredDataSchemas.website,
  structuredDataSchemas.softwareApplication,
  structuredDataSchemas.howTo(
    'How to Reconcile CAM Charges',
    'Upload your GL exports and run a BOMA 2024 aligned CAM reconciliation in minutes.',
    [
      {
        name: 'Share Your Data',
        text: 'Export your GL data from Yardi, MRI, or any ERP. Upload your CSV/Excel files.',
      },
      {
        name: 'We Analyze',
        text: 'Our deterministic engine supports BOMA 2024 aligned workflows. AI-assisted extraction helps identify lease terms for review.',
      },
      {
        name: 'Review Findings',
        text: 'Results appear in minutes. See every charge reconciled against the lease, with any error flagged.',
      },
      {
        name: 'Close the Reconciliation',
        text: 'Share traceable math your tenants and auditors can verify. Subscribe only if we find meaningful savings.',
      },
    ],
    'PT5M'
  ),
  structuredDataSchemas.faqPage(
    LANDING_FAQS.map((faq) => ({ question: faq.question, answer: faq.answer }))
  ),
]

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <SEO
        title="Run CAM Reconciliation - CRE FinOps Platform"
        description="Run accurate CAM reconciliation from your Yardi or MRI exports. BOMA 2024 aligned CRE FinOps platform for commercial real estate."
        canonical="/"
        structuredData={landingSchemas}
      />
      <LandingNav />
      <HeroSection />
      <SocialProofStrip />
      <ValuePropositionSection />
      <ROICalculator />
      <HowItWorksSection />
      <FeaturesGrid />
      <FAQSection />
      <PricingTeaser />
      {/* Free Tools callout */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
            Free Tools
          </p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl mb-4">
            No-signup calculators for property controllers
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            Texas landlord? Our{' '}
            <Link
              to="/tools/hcad-tax-normalizer"
              className="text-primary underline-offset-4 hover:underline font-medium"
            >
              HCAD Tax Base Year Normalizer
            </Link>{' '}
            shows you exactly how much more tax you can recover after a
            successful ARB protest. Free, instant, no signup.
          </p>
          <Link
            to="/tools"
            className="inline-flex items-center gap-2 rounded-button bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors duration-200"
          >
            <Calculator className="h-4 w-4" />
            Browse Free Tools
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <CTASection />
      <Footer />
    </div>
  )
}
