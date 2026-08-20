import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckCircle2,
  RefreshCw,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";
import { buildTrialLink } from "@/lib/auditLink";
import { getAllSwitchGuides, getSwitchGuide } from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { buildSiteUrl } from "@/lib/site";

export const dynamicParams = false;

export async function generateStaticParams() {
  const guides = await getAllSwitchGuides();
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getSwitchGuide(slug);
  if (!data) return {};
  const url = buildSiteUrl(`/switch/${data.slug}`);
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
            `/api/og?title=${encodeURIComponent(data.metaTitle)}&category=Migration`,
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

export default async function SwitchGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getSwitchGuide(slug);
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

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to Switch from ${data.fromName} to CapVeri`,
    description: data.metaDescription,
    totalTime: `PT${parseInt(data.totalTime)}M`,
    step: data.migrationSteps.map((s) => ({
      "@type": "HowToStep",
      position: s.step,
      name: s.title,
      text: s.description,
    })),
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
        name: "Switch to CapVeri",
        item: buildSiteUrl("/switch/"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `Switch from ${data.fromName}`,
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
      <JsonLd data={howToSchema} />
      <JsonLd data={breadcrumbSchema} />
      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          <Link
            href="/switch"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Migration Guides
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
                Why Switch from {data.fromName}?
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
                    <p className="text-base text-muted-foreground">
                      {reason.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Migration Steps */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">Migration Steps</h2>
              <div className="space-y-6 not-prose">
                {data.migrationSteps.map((step) => (
                  <div key={step.step} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {step.step}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold">{step.title}</h3>
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3" />
                          {step.timeEstimate}
                        </span>
                      </div>
                      <p className="text-base text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total time callout */}
              <div className="mt-6 bg-primary/5 border border-primary/10 rounded-lg p-4 flex items-center gap-3 not-prose">
                <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                <div>
                  <span className="font-semibold">Total time:</span>
                  {" "}
                  <span className="text-muted-foreground">
                    {data.totalTime}
                  </span>
                </div>
              </div>
            </section>

            {/* What Changes vs What Stays */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">
                What Changes vs. What Stays
              </h2>
              <div className="grid sm:grid-cols-2 gap-6 not-prose">
                <div className="border border-border rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <RefreshCw className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">What Changes</h3>
                  </div>
                  <ul className="space-y-2">
                    {data.whatChanges.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-base"
                      >
                        <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border border-border rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Minus className="w-5 h-5 text-muted-foreground" />
                    <h3 className="font-semibold">What Stays the Same</h3>
                  </div>
                  <ul className="space-y-2">
                    {data.whatStays.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-base"
                      >
                        <Minus
                          className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
                    content: `switch-${slug}`,
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
