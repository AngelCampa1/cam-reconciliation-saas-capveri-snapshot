"use client";

import { useId, useState, useRef } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFAQCount } from "@/data/faq-data";
import { LANDING_FAQS, type FAQ } from "@/data/landing-faqs";
export { LANDING_FAQS } from "@/data/landing-faqs";
export type { FAQ } from "@/data/landing-faqs";

interface FAQItemProps {
  faq: FAQ;
  isOpen: boolean;
  onToggle: () => void;
}

function FAQItem({ faq, isOpen, onToggle }: FAQItemProps) {
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const panelId = `${baseId}-panel`;
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        id={triggerId}
        onClick={onToggle}
        className="flex min-h-[44px] w-full items-center justify-between py-5 text-left text-base font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span>{faq.question}</span>
        <ChevronDown
          className={cn(
            "ml-4 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        inert={!isOpen}
        className={cn(
          "grid transition-all duration-200 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-5 text-base text-muted-foreground leading-relaxed">
            {faq.answer}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface FAQSectionProps {
  className?: string;
}

export function FAQSection({ className }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      ref={sectionRef}
      id="faq"
      className={cn("bg-background py-12 sm:py-16 lg:py-20", className)}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 sm:mb-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Common questions
            </h2>
          </div>
          <div className="divide-y divide-border/50 rounded-lg border border-border/50 px-4 sm:px-6">
            {LANDING_FAQS.map((faq, index) => (
              <div
                key={index}
                className="animate-on-scroll"
                data-delay={String(Math.min(index * 100, 400))}
              >
                <FAQItem
                  faq={faq}
                  isOpen={openIndex === index}
                  onToggle={() => handleToggle(index)}
                />
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/help"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary transition-colors duration-200 hover:text-primary/80"
            >
              View all {getFAQCount()}+ FAQs
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
