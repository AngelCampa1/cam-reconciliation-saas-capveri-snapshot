import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";
import { buildTrialLink } from "@/lib/auditLink";
import {
  getAllComparisons,
  getComparison,
  getVideoForPlacement,
} from "@/lib/content/pseo-data";
import { VideoEmbed } from "@/components/VideoEmbed";
import { structuredDataSchemas } from "@/lib/structured-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import {
  filterByRetainedSlugs,
  RETAINED_COMPARISON_SLUGS,
} from "@/lib/seo/content-governance";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildSiteUrl } from "@/lib/site";

export const dynamicParams = false;

export async function generateStaticParams() {
  const comparisons = filterByRetainedSlugs(
    await getAllComparisons(),
    RETAINED_COMPARISON_SLUGS,
  );
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getComparison(slug);
  if (!data) return {};
  const url = buildSiteUrl(`/vs/${data.slug}`);
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
            `/api/og?title=${encodeURIComponent(data.metaTitle)}&category=Comparison`,
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

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getComparison(slug);
  if (!data) notFound();

  // Only `vs-spreadsheets` is wired in videos.json today; other slugs resolve to
  // null and render no video. Add a `vs-<slug>` placement to wire more.
  const video = await getVideoForPlacement(`vs-${slug}`);

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
    url: buildSiteUrl(`/vs/${data.slug}`),
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
        name: "Comparisons",
        item: buildSiteUrl("/vs/"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `CapVeri vs ${data.competitorShortName}`,
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
            href="/vs"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Comparisons
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

            {/* Watch band */}
            {video && (
              <div className="mb-10 not-prose">
                <JsonLd
                  data={structuredDataSchemas.videoObject({
                    name: video.title,
                    description: video.description,
                    youtubeId: video.youtubeId,
                    uploadDate: video.uploadDate,
                    durationSeconds: video.durationSeconds,
                    thumbnailUrl: video.thumbnailUrl,
                  })}
                />
                <VideoEmbed
                  youtubeId={video.youtubeId}
                  title={video.title}
                  thumbnailUrl={video.thumbnailUrl}
                />
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  {video.description}
                </p>
              </div>
            )}

            {/* Definition blocks */}
            <div className="grid sm:grid-cols-2 gap-4 mb-8 not-prose">
              <div
                data-testid="definition-block"
                className="bg-muted/30 border border-border rounded-lg p-4"
              >
                <h2 className="text-base font-semibold mb-2">
                  What is {data.competitorName}?
                </h2>
                <p className="text-sm text-muted-foreground">
                  {data.competitorDefinition}
                </p>
              </div>
              <div
                data-testid="definition-block"
                className="bg-primary/5 border border-primary/10 rounded-lg p-4"
              >
                <h2 className="text-base font-semibold mb-2">
                  What is CapVeri?
                </h2>
                <p className="text-sm text-muted-foreground">
                  {data.capveriDefinition}
                </p>
              </div>
            </div>

            {/* Verdict block */}
            <section className="mb-10 rounded-lg border border-primary/10 bg-primary/5 p-5 not-prose">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Winner: {data.winnerLabel}
              </p>
              <p className="mt-3 text-base font-medium text-foreground">
                {data.winnerSummary}
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <h2 className="text-sm font-semibold text-foreground">
                    Best for CapVeri
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {data.bestForCapveri}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <h2 className="text-sm font-semibold text-foreground">
                    Best for {data.competitorShortName}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {data.bestForCompetitor}
                  </p>
                </div>
              </div>
            </section>

            {/* Strengths section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                {data.strengths.heading}
              </h2>
              {data.strengths.paragraphs.map((p, i) => (
                <p key={i} className="text-muted-foreground mb-4">
                  {p}
                </p>
              ))}
              {data.strengths.callout && (
                <div className="bg-warning/5 border border-warning/30 rounded-lg p-4 not-prose">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-warning-foreground">
                      {data.strengths.callout.text}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Pain points section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                {data.painPoints.heading}
              </h2>
              <div className="space-y-6 not-prose">
                {data.painPoints.items.map((item) => (
                  <div
                    key={item.title}
                    className="border-l-4 border-destructive/40 pl-5"
                  >
                    <h3 className="font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Known limitations (Yardi only) */}
            {data.knownLimitations && (
              <section className="mb-10">
                <h2 className="text-2xl font-semibold mb-4">
                  {data.knownLimitations.heading}
                </h2>
                <p className="text-muted-foreground mb-4">
                  {data.knownLimitations.intro}
                </p>
                <div className="space-y-4 not-prose">
                  {data.knownLimitations.items.map((item) => (
                    <div
                      key={item.title}
                      className="border border-border rounded-lg p-4"
                    >
                      <h3 className="font-semibold text-sm mb-1">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Comparison table */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Feature Comparison
              </h2>
              {/* Desktop: side-by-side table */}
              <div className="not-prose hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full text-sm border-collapse border border-border">
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
                          const isLabel = col.key === "label" || col.key === "";
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
                    (c) =>
                      c.key === "label" || c.key === "feature" || c.key === "",
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

            {/* File-import explainer section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                {data.antiIntegration.heading}
              </h2>
              {data.antiIntegration.paragraphs.map((p, i) => (
                <p key={i} className="text-muted-foreground mb-4">
                  {p}
                </p>
              ))}
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 not-prose">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">
                    <strong>Already using {data.competitorShortName}?</strong>
                    {" "}
                    Export your GL expense report as a CSV. Upload it to
                    CapVeri. Get BOMA 2024 aligned results with error flags and
                    recovery estimates. No implementation or consultant
                    required.
                  </p>
                </div>
              </div>
            </section>

            {/* Migration section (optional) */}
            {data.migration && (
              <section className="mb-10">
                <h2 className="text-2xl font-semibold mb-4">
                  {data.migration.heading}
                </h2>
                {data.migration.paragraphs.map((p, i) => (
                  <p key={i} className="text-muted-foreground mb-4">
                    {p}
                  </p>
                ))}
              </section>
            )}

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
                Related comparisons
              </h2>
              <div className="grid sm:grid-cols-3 gap-4 not-prose">
                {data.relatedComparisons.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/vs/${item.slug}`}
                    className="border rounded-lg p-4 hover:border-primary/50 transition-colors duration-200 no-underline"
                  >
                    <h3 className="font-semibold text-sm mb-1">
                      CapVeri vs {item.title.replace("CapVeri vs", "")}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
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
                <Link href={buildTrialLink({ content: "u_cta" })}>
                  Start free trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}
