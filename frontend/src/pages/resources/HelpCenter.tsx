/**
 * Help Center Page
 *
 * FAQ-style help center with common questions
 */
import { Link } from 'react-router-dom'
import { ChevronDown, Search } from 'lucide-react'
import { EmptyStateNoSearchResults } from '@/components/EmptyState'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { cn } from '@/lib/utils'
import { publicKnowledge } from '@/generated/public-knowledge'
import { TRIAL_COPY } from '@/lib/domains'

const faqs = [
  {
    category: 'Getting Started',
    questions: [
      {
        q: 'What is CapVeri?',
        a: 'CapVeri is a CRE FinOps and compliance platform for commercial real estate. We help property managers run CAM checks and spot billing gaps. CapVeri uses set BOMA 2024 math steps.',
      },
      {
        q: 'How does the free trial work?',
        a:
          publicKnowledge.pricing.pricingFaqs.find(
            (faq) => faq.question === 'Is there a free trial?'
          )?.answer ?? publicKnowledge.pricing.display.trialCopy,
      },
      {
        q: 'What file formats do you accept?',
        a: 'We accept CSV and Excel (.xlsx) exports from any property management system. We have optimized parsers for Yardi Voyager and MRI, but any standard GL export will work.',
      },
    ],
  },
  {
    category: 'Pricing & Billing',
    questions: [
      {
        q: 'How much does CapVeri cost?',
        a: publicKnowledge.pricing.display.annualSummary,
      },
      {
        q: 'Is there a free trial?',
        a: `Yes. Every self-serve plan includes a ${TRIAL_COPY} with no credit card required to start. Add billing before the trial ends to keep access. If no payment method is on file when the trial ends, access pauses until billing is added.`,
      },
      {
        q: 'How should I think about value?',
        a: `Use the modeled range as a planning aid, not a promise. For a 200,000 SF office-like building, benchmark assumptions produce roughly $5.9K-$35.3K in annual billing variance. Compare that range against ${publicKnowledge.pricing.launchOffer.code} for ${publicKnowledge.pricing.display.launchOfferTerms}`,
      },
    ],
  },
  {
    category: 'Features & Capabilities',
    questions: [
      {
        q: 'Does CapVeri integrate with my ERP?',
        a: 'No integration needed. Instead of setting up an API connection, CapVeri works with the CSV and Excel files you already export. No implementation consultants needed.',
      },
      {
        q: 'What calculations does CapVeri support?',
        a: 'CapVeri supports gross-up calculations, base year analysis, expense caps, pro-rata share calculations, and admin fee calculations through BOMA 2024 aligned workflows.',
      },
      {
        q: 'Can CapVeri extract lease terms from PDFs?',
        a: 'Yes. AI-assisted extraction can identify key lease terms from PDF lease documents. Your team reviews extracted values before they affect reconciliation outputs.',
      },
    ],
  },
  {
    category: 'Security & Privacy',
    questions: [
      {
        q: 'Is my data secure?',
        a: 'Yes. CapVeri protects customer data with encryption, organization-scoped access controls, and audit logging for financial record changes. We do not sell customer data.',
      },
      {
        q: 'Do you use my data to train AI?',
        a: 'GL calculations are deterministic and are not sent to AI providers for financial math. AI-assisted processing is limited to OCR text extracted from uploaded lease PDF documents for lease-term review.',
      },
    ],
  },
]

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-border">
      <button
        className="flex w-full items-center justify-between px-6 py-6 text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-medium text-foreground">{question}</span>
        <ChevronDown
          className={cn(
            'ml-4 h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <div className="px-6 pb-6 text-muted-foreground">
          <p>{answer}</p>
        </div>
      )}
    </div>
  )
}

const faqStructuredData = {
  ...structuredDataSchemas.faqPage(
    faqs.flatMap((category) =>
      category.questions.map((q) => ({ question: q.q, answer: q.a }))
    )
  ),
  author: { '@type': 'Organization', name: 'CapVeri' },
  dateModified: '2026-04-22',
}

export function HelpCenterPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredFaqs = faqs
    .map((category) => ({
      ...category,
      questions: category.questions.filter(
        (q) =>
          q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.a.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((category) => category.questions.length > 0)

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Help Center - CapVeri"
        description="Find answers to common questions about CapVeri: pricing, features, security, and getting started with CRE FinOps and compliance."
        canonical="/help"
        structuredData={faqStructuredData}
      />
      <LandingNav variant="light" />

      <div className="border-b bg-muted pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-xl font-bold text-foreground md:text-2xl lg:text-3xl">
            Help Center
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Find answers to common questions
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <time dateTime="2026-04-22">Updated April 22, 2026</time>
          </p>

          <div className="relative mt-6 max-w-md">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="search"
              autoComplete="off"
              aria-label="Search help articles"
              placeholder="Search for answers..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          {filteredFaqs.map((category) => (
            <div key={category.category} className="mb-10">
              <h2 className="mb-4 text-base font-bold text-foreground md:text-lg lg:text-xl">
                {category.category}
              </h2>
              <div className="rounded-lg border border-border">
                {category.questions.map((faq, index) => (
                  <FAQItem key={index} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </div>
          ))}

          {filteredFaqs.length === 0 && searchQuery && (
            <EmptyStateNoSearchResults query={searchQuery} size="sm" />
          )}
        </div>

        <div className="mt-12 max-w-3xl rounded-lg bg-muted p-8 text-center">
          <h2 className="mb-2 text-base font-bold text-foreground md:text-lg lg:text-xl">
            Still have questions?
          </h2>
          <p className="mb-4 text-muted-foreground">
            Can't find what you're looking for? Our team is here to help.
          </p>
          <Button asChild>
            <Link to="/contact">Contact Support</Link>
          </Button>
        </div>
      </div>

      <Footer />
    </div>
  )
}
