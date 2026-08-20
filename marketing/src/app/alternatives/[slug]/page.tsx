import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";
import { buildTrialLink } from "@/lib/auditLink";
import { getAllAlternatives, getAlternative } from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildSiteUrl } from "@/lib/site";

export const dynamicParams = false;

export async function generateStaticParams() {
  const alternatives = await getAllAlternatives();
  return alternatives.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getAlternative(slug);
  if (!data) return {};
  const url = buildSiteUrl(`/alternatives/${data.slug}`);
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url,
      type: "article",
      publishedTime: data.datePublished,
      modifiedTime: data.dateModified,
      images: [
        {
          url: buildSiteUrl(
            `/api/og?title=${encodeURIComponent(data.metaTitle)}&category=Alternatives`,
          ),
          width: 1200,
          height: 630,
          alt: data.metaTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: data.metaTitle,
      description: data.metaDescription,
    },
  };
}

export default async function AlternativePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getAlternative(slug);
  if (!data) notFound();

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    author: { "@type": "Organization", name: "CapVeri" },
    datePublished: data.datePublished,
    dateModified: data.dateModified,
    mainEntity: data.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: data.headline,
    author: {
      "@type": "Person",
      name: "Angel Campa",
      email: publicKnowledge.contacts.byId.founder.email,
      jobTitle: "Founder",
      description: "Founder, CapVeri",
      worksFor: { "@type": "Organization", name: "CapVeri" },
    },
    publisher: { "@type": "Organization", name: "CapVeri" },
    datePublished: data.datePublished,
    dateModified: data.dateModified,
    url: buildSiteUrl(`/alternatives/${data.slug}`),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: buildSiteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Alternatives",
        item: buildSiteUrl("/alternatives/"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${data.competitorName} Alternatives`,
      },
    ],
  };

  const publishedDate = new Date(data.datePublished).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );

  const modifiedDate = new Date(data.dateModified).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const showUpdated = data.dateModified !== data.datePublished;

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={faqSchema} />
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />
      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          <Link
            href="/alternatives"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Alternatives
          </Link>

          <article className="prose  max-w-none">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
              {data.headline}
            </h1>

            {/* Author byline */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground border-b border-border pb-4 mb-8 not-prose">
              <div>
                <span className="font-medium text-foreground">Angel Campa</span>
                <span className="mx-1">&middot;</span>
                <span>Founder, CapVeri</span>
                <span className="mx-1">&middot;</span>
                {showUpdated ? (
                  <time dateTime={data.dateModified}>
                    Updated {modifiedDate}
                  </time>
                ) : (
                  <time dateTime={data.datePublished}>
                    Published {publishedDate}
                  </time>
                )}
              </div>
            </div>

            {/* Intro paragraphs */}
            {data.introParagraphs.map((p, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "text-lg text-muted-foreground mb-4"
                    : "text-muted-foreground mb-8"
                }
              >
                {p}
              </p>
            ))}

            {/* Why Switch section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Why People Switch From {data.competitorName}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4 not-prose">
                {data.whySwitch.map((reason) => (
                  <div
                    key={reason.title}
                    className="border border-border rounded-lg p-4"
                  >
                    <h3 className="font-semibold text-sm mb-2">
                      {reason.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {reason.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Alternatives list */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Top {data.competitorName} Alternatives
              </h2>
              <div className="space-y-6 not-prose">
                {data.alternatives.map((alt, idx) => (
                  <div
                    key={alt.name}
                    className={`border rounded-lg p-6 ${idx === 0 ? "border-primary/50 bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold">
                        {idx + 1}. {alt.name}
                      </h3>
                      {idx === 0 && (
                        <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      {alt.description}
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Pros
                        </h4>
                        <ul className="space-y-1">
                          {alt.pros.map((pro) => (
                            <li
                              key={pro}
                              className="flex items-start gap-2 text-sm"
                            >
                              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                              <span>{pro}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Cons
                        </h4>
                        <ul className="space-y-1">
                          {alt.cons.map((con) => (
                            <li
                              key={con}
                              className="flex items-start gap-2 text-sm"
                            >
                              <XCircle className="w-4 h-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                              <span>{con}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm border-t border-border pt-3">
                      <div>
                        <span className="font-medium">Best for:</span>
                        {" "}
                        <span className="text-muted-foreground">
                          {alt.bestFor}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">Pricing:</span>
                        {" "}
                        <span className="text-muted-foreground">
                          {alt.pricing}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Comparison table */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Feature Comparison
              </h2>
              {/* Desktop: side-by-side table */}
              <div className="not-prose hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full text-sm border-collapse border border-border">
                  <caption className="sr-only">Feature comparison</caption>
                  <thead>
                    <tr className="bg-muted">
                      {data.comparisonTable.columns.map((col) => (
                        <th
                          key={col.key}
                          className="border border-border px-4 py-3 text-left font-semibold"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.comparisonTable.rows.map((row, i) => (
                      <tr key={i} className="even:bg-muted/30">
                        {data.comparisonTable.columns.map((col) => {
                          const isCapveri = col.key === "capveri";
                          const isLabel =
                            col.key === "feature" || col.key === "label";
                          return (
                            <td
                              key={col.key}
                              className={`border border-border px-4 py-3 ${isLabel ? "font-medium" : isCapveri ? "text-primary font-medium" : "text-muted-foreground"}`}
                            >
                              {row[col.key] ?? ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile: stacked cards per feature row */}
              <div className="not-prose md:hidden space-y-4">
                {data.comparisonTable.rows.map((row, i) => {
                  const labelCol = data.comparisonTable.columns.find(
                    (c) => c.key === "feature" || c.key === "label",
                  );
                  const valueCols = data.comparisonTable.columns.filter(
                    (c) => c !== labelCol,
                  );
                  const rowTitle = labelCol
                    ? row[labelCol.key]
                    : `Row ${i + 1}`;
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <p className="text-base font-semibold text-foreground mb-3">
                        {rowTitle}
                      </p>
                      <dl className="space-y-2">
                        {valueCols.map((col) => {
                          const isCapveri = col.key === "capveri";
                          return (
                            <div
                              key={col.key}
                              className="flex flex-col gap-0.5 border-t border-border/60 pt-2 first:border-t-0 first:pt-0"
                            >
                              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {col.label}
                              </dt>
                              <dd
                                className={`text-base ${isCapveri ? "text-primary font-medium" : "text-foreground"}`}
                              >
                                {row[col.key] ?? ""}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* CapVeri pitch */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                {data.capveriPitch.heading}
              </h2>
              {data.capveriPitch.paragraphs.map((p, i) => (
                <p key={i} className="text-muted-foreground mb-4">
                  {p}
                </p>
              ))}
            </section>

            {/* FAQ section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-6 not-prose">
                {data.faqs.map((faq) => (
                  <div key={faq.question} className="border-b pb-4">
                    <h3 className="font-semibold mb-2">{faq.question}</h3>
                    <p className="text-muted-foreground text-sm">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Related comparisons */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Related Comparisons
              </h2>
              <div className="grid sm:grid-cols-3 gap-4 not-prose">
                {data.relatedComparisons.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/vs/${item.slug}`}
                    className="border rounded-lg p-4 hover:border-primary/50 transition-colors duration-200 no-underline"
                  >
                    <h3 className="font-semibold text-sm">{item.title}</h3>
                  </Link>
                ))}
              </div>
            </section>

            {/* Related resources */}
            {data.relatedResources.length > 0 && (
              <section className="mb-10">
                <RelatedContent
                  title="Related Resources"
                  links={data.relatedResources.map((resource) => ({
                    href: resource.href,
                    label: resource.title,
                  }))}
                />
              </section>
            )}

            {/* CTA */}
            <section className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <h2 className="text-2xl font-bold mb-3">{data.ctaHeading}</h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                {data.ctaDescription}
              </p>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <a
                  href={buildTrialLink({
                    content: `alternatives-${slug}`,
                  })}
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}
