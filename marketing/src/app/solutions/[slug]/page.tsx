import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Shield,
  Clock,
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Zap,
  Search,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";
import { buildTrialLink } from "@/lib/auditLink";
import { publicKnowledge } from "@/generated/public-knowledge";
import { getAllSolutions, getSolution } from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { buildSiteUrl } from "@/lib/site";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Calculator,
  Shield,
  Clock,
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Zap,
  Search,
  BarChart3,
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const solutions = await getAllSolutions();
  return solutions.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getSolution(slug);
  if (!data) return {};
  const url = buildSiteUrl(`/solutions/${data.slug}`);
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
            `/api/og?title=${encodeURIComponent(data.metaTitle)}&category=Solutions`,
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

export default async function SolutionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getSolution(slug);
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
    url: buildSiteUrl(`/solutions/${data.slug}`),
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
        name: "Solutions",
        item: buildSiteUrl("/solutions/"),
      },
      { "@type": "ListItem", position: 3, name: data.name },
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
            href="/solutions"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Solutions
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

            <p className="text-lg text-muted-foreground mb-8">
              {data.subheadline}
            </p>

            {/* Problem section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                {data.problem.heading}
              </h2>
              {data.problem.paragraphs.map((p, i) => (
                <p key={i} className="text-muted-foreground mb-4">
                  {p}
                </p>
              ))}
            </section>

            {/* Solution section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                {data.solution.heading}
              </h2>
              {data.solution.paragraphs.map((p, i) => (
                <p key={i} className="text-muted-foreground mb-4">
                  {p}
                </p>
              ))}
            </section>

            {/* Feature cards - 2x2 grid */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">Key Features</h2>
              <div className="grid sm:grid-cols-2 gap-4 not-prose">
                {data.features.map((feature) => {
                  const Icon = ICON_MAP[feature.icon] ?? FileText;
                  return (
                    <div
                      key={feature.title}
                      className="border border-border rounded-lg p-5"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <h3 className="font-semibold">{feature.title}</h3>
                      </div>
                      <p className="text-base text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Metrics strip */}
            <section className="mb-10 not-prose">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-primary/5 border border-primary/10 rounded-lg p-6">
                {data.metrics.map((metric) => (
                  <div key={metric.label} className="text-center">
                    <div className="text-2xl md:text-3xl font-bold text-primary">
                      {metric.value}
                    </div>
                    <div className="text-xs md:text-sm text-muted-foreground mt-1">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* How It Works - numbered steps */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">How It Works</h2>
              <div className="space-y-6 not-prose">
                {data.howItWorks.map((step) => (
                  <div key={step.step} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {step.step}
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{step.title}</h3>
                      <p className="text-base text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
                    <p className="text-muted-foreground text-base">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Related solutions */}
            {data.relatedSolutions.length > 0 && (
              <section className="mb-10">
                <h2 className="text-2xl font-semibold mb-4">
                  Related Solutions
                </h2>
                <div className="grid sm:grid-cols-2 gap-4 not-prose">
                  {data.relatedSolutions.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/solutions/${item.slug}`}
                      className="border rounded-lg p-4 hover:border-primary/50 transition-colors duration-200 no-underline"
                    >
                      <h3 className="font-semibold text-sm">{item.title}</h3>
                    </Link>
                  ))}
                </div>
              </section>
            )}

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
                    content: `solutions-${slug}`,
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
