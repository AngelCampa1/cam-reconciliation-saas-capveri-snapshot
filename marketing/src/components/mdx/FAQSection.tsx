export interface FAQItem {
  q: string;
  a: string;
}

interface FAQSectionProps {
  items: FAQItem[];
}

export function FAQSection({ items }: FAQSectionProps) {
  return (
    <section className="not-prose mb-10">
      <h2 className="text-2xl font-semibold mb-6">
        Frequently Asked Questions
      </h2>
      <div className="divide-y border-y">
        {items.map((faq) => (
          <details key={faq.q} className="group">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-base font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
              <span>{faq.q}</span>
              <span
                aria-hidden="true"
                className="text-muted-foreground transition-transform group-open:rotate-45 motion-reduce:transition-none"
              >
                +
              </span>
            </summary>
            <p className="pb-4 text-base text-muted-foreground">{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
