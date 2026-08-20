import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Ruler,
  AlertTriangle,
  DollarSign,
  FileText,
  GitCompareArrows,
  Calculator,
  BookOpen,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { JsonLd } from "@/components/JsonLd";
import { getAllBomaTopics, getBomaTopic } from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ topic: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const topics = await getAllBomaTopics();
  return topics.map((topic) => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic: topicSlug } = await params;
  const topic = await getBomaTopic(topicSlug);
  if (!topic) notFound();

  const title = `${topic.title} - BOMA Standards Guide | CapVeri`;
  const description = `${topic.description} Includes a 2017 vs 2024 comparison, worked example, common errors, and financial impact analysis.`;
  const url = `${SITE_URL}/resources/boma/${topic.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
    },
  };
}

export default async function BomaTopicPage({ params }: Props) {
  const { topic: topicSlug } = await params;
  const topic = await getBomaTopic(topicSlug);
  if (!topic) notFound();

  const url = `${SITE_URL}/resources/boma/${topic.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: topic.title,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    datePublished: "2026-03-17",
    dateModified: "2026-05-08",
    url,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Resources",
        item: `${SITE_URL}/resources`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "BOMA Standards",
        item: `${SITE_URL}/resources/boma`,
      },
      { "@type": "ListItem", position: 4, name: topic.title, item: url },
    ],
  };

  const sections = [
    {
      icon: BookOpen,
      title: "Methodology",
      content: topic.methodology,
    },
    {
      icon: GitCompareArrows,
      title: "BOMA 2017 vs 2024",
      content: topic.comparison2017vs2024,
    },
    {
      icon: Calculator,
      title: "Worked Example",
      content: topic.workedExample,
    },
    {
      icon: DollarSign,
      title: "Financial Impact",
      content: topic.financialImpact,
    },
    {
      icon: FileText,
      title: "Lease Implications",
      content: topic.leaseImplications,
    },
  ];

  return (
    <ContentPageLayout
      pageName={topic.title}
      backHref="/resources/boma"
      backLabel="BOMA Standards"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Ruler className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              BOMA Standards Deep Dive
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">{topic.title}</h1>
          <p className="text-lg text-muted-foreground">{topic.description}</p>
        </div>

        {/* Content Sections */}
        <div className="not-prose space-y-6 mb-10">
          {sections.map((section) => {
            if (!section.content) return null;
            const Icon = section.icon;
            return (
              <div key={section.title} className="rounded-lg border p-5">
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <h2 className="font-semibold mb-2">{section.title}</h2>
                    <p className="text-foreground whitespace-pre-line">
                      {section.content}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Common Errors */}
        {topic.commonErrors.length > 0 && (
          <div className="not-prose rounded-lg border border-destructive/30 bg-destructive/10 p-5 mb-10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-semibold mb-3">Common Errors</h2>
                <ul className="space-y-2">
                  {topic.commonErrors.map((error) => (
                    <li key={error} className="flex items-start gap-2 text-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive/100 mt-1.5 flex-shrink-0" />
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 2026 Review Controls */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <h2 className="text-xl font-bold mb-3">
            2026 Review Controls for BOMA-Driven CAM Math
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            BOMA measurement changes affect CAM only when the lease, rent roll,
            or reconciliation denominator accepts the measured area. Confirm the
            measurement source before changing tenant shares.
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              Record the BOMA standard version used for the rent roll and lease
              abstract.
            </li>
            <li>
              Compare tenant RSF, building RSF, and load factor against the
              reconciliation denominator.
            </li>
            <li>
              Flag non-allocated tenant areas separately so they are not loaded
              twice.
            </li>
            <li>
              Keep the measurement certificate or architect worksheet with the
              CAM support file.
            </li>
            <li>
              Document whether the lease allows remeasurement to change existing
              tenant shares.
            </li>
          </ul>
        </div>

        {/* Notes */}
        {topic.notes && (
          <div className="not-prose mb-10">
            <h2 className="text-xl font-bold mb-3">Additional Context</h2>
            <p className="text-muted-foreground">{topic.notes}</p>
          </div>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          links={
            topic.relatedResources && topic.relatedResources.length > 0
              ? [
                  ...topic.relatedResources.map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                  ...(topic.relatedTools ?? []).map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                ]
              : [
                  {
                    href: "/tools/boma-2024-calculator",
                    label: "BOMA 2024 Area Calculator",
                  },
                  {
                    href: "/tools/boma-remeasurement-impact",
                    label: "Remeasurement Impact Estimator",
                  },
                  {
                    href: "/blog/boma-2024-changes",
                    label: "BOMA 2024 Standard Changes",
                  },
                  {
                    href: "/tools/cam-gross-up-calculator",
                    label: "CAM Gross-Up Calculator",
                  },
                ]
          }
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Catch Measurement Errors in Your Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri validates pro-rata shares, load factors, and BOMA
            measurement consistency. It flags errors before tenants or auditors
            find them.
          </p>
          <Link
            href="/pricing"
            className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </article>
    </ContentPageLayout>
  );
}
