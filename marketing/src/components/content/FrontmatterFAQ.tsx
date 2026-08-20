interface FrontmatterFAQProps {
  faqs?: Array<{ q: string; a: string }>;
}

export function FrontmatterFAQ({ faqs }: FrontmatterFAQProps) {
  if (!faqs || faqs.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="frontmatter-faq-heading"
      className="not-prose mt-10 mb-8"
    >
      <h2 id="frontmatter-faq-heading" className="text-2xl font-semibold mb-6">
        Frequently asked questions
      </h2>
      <div className="divide-y border-y">
        {faqs.map((faq) => (
          <details key={faq.q} className="group">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-base font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
              <h3 className="text-base font-semibold">{faq.q}</h3>
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
