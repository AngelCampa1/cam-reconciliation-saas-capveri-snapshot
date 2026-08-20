/**
 * FAQ Section Component
 *
 * Accordion-style FAQ for the landing page.
 * Exports LANDING_FAQS constant for reuse in FAQPage JSON-LD schema.
 */

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { publicKnowledge } from '@/generated/public-knowledge'
import { cn } from '@/lib/utils'

export interface FAQ {
  question: string
  answer: string
}

export const LANDING_FAQS: FAQ[] = publicKnowledge.marketing.landingFaqs.map(
  (item) => ({
    question: item.question,
    answer: item.answer,
  })
)

interface FAQItemProps {
  faq: FAQ
  isOpen: boolean
  onToggle: () => void
}

function FAQItem({ faq, isOpen, onToggle }: FAQItemProps) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-5 text-left text-base font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={isOpen}
      >
        <span>{faq.question}</span>
        <ChevronDown
          className={cn(
            'ml-4 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <div
          className="pb-5 text-muted-foreground leading-relaxed"
          style={{ animation: 'fadeInUp 200ms ease-out' }}
        >
          {faq.answer}
        </div>
      )}
    </div>
  )
}

export interface FAQSectionProps {
  className?: string
}

export function FAQSection({ className }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section id="faq" className={cn('bg-background py-20', className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 text-center">
            <h2 className="text-fluid-3xl font-bold tracking-tight text-foreground">
              Common Questions
            </h2>
          </div>
          <div className="divide-y divide-border/50 rounded-lg border border-border/50 px-6">
            {LANDING_FAQS.map((faq, index) => (
              <FAQItem
                key={index}
                faq={faq}
                isOpen={openIndex === index}
                onToggle={() => handleToggle(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
