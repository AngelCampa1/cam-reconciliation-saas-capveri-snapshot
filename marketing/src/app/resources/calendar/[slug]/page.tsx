import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  CalendarDays,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { JsonLd } from "@/components/JsonLd";
import {
  getAllCalendarEntries,
  getCalendarEntry,
} from "@/lib/content/pseo-data";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const entries = await getAllCalendarEntries();
  return entries.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getCalendarEntry(slug);
  if (!entry) notFound();

  const url = `${SITE_URL}/resources/calendar/${entry.slug}`;

  return {
    title: entry.metaTitle,
    description: entry.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: entry.metaTitle,
      description: entry.metaDescription,
      url,
      type: "article",
    },
  };
}

export default async function CalendarDetailPage({ params }: Props) {
  const { slug } = await params;
  const entry = await getCalendarEntry(slug);
  if (!entry) notFound();

  const url = `${SITE_URL}/resources/calendar/${entry.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.headline,
    description: entry.overview,
    url,
    datePublished: entry.lastUpdated,
    dateModified: entry.lastUpdated,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
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
        name: "Calendar & Seasonal Guides",
        item: `${SITE_URL}/resources/calendar`,
      },
      { "@type": "ListItem", position: 4, name: entry.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={entry.name}
      backHref="/resources/calendar"
      backLabel="Calendar & Seasonal Guides"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Seasonal Guide
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {entry.headline}
          </h1>
          <p className="text-lg text-muted-foreground">{entry.subheadline}</p>
        </div>

        {/* Overview */}
        <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
          <p className="text-foreground">{entry.overview}</p>
        </div>

        {/* Key Dates */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Key Dates ({entry.keyDates.length})
          </h2>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold w-1/3">
                    Date / Timeframe
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">
                    What Happens
                  </th>
                </tr>
              </thead>
              <tbody>
                {entry.keyDates.map((kd, i) => (
                  <tr
                    key={i}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                  >
                    <td className="px-4 py-3 font-medium text-primary">
                      {kd.date}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {kd.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Checklist */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-6">
            Phase Checklist ({entry.checklist.length} items)
          </h2>
          <div className="space-y-2">
            {entry.checklist.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border p-4"
              >
                <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                <span className="text-sm text-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Common Mistakes */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Common Mistakes
          </h2>
          <div className="space-y-3">
            {entry.commonMistakes.map((mistake, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4"
              >
                <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-warning/20 text-warning-foreground text-xs font-bold">
                  {i + 1}
                </span>
                <span className="text-sm text-warning-foreground">{mistake}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CapVeri Role */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-8">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Where CapVeri Fits</h2>
              <p className="text-muted-foreground">{entry.capveriRole}</p>
            </div>
          </div>
        </div>

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          links={entry.relatedResources.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* Related Tools */}
        <RelatedContent
          title="Free Tools for This Phase"
          links={entry.relatedTools.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Catch Errors Before They Become Disputes
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Upload your GL export and CapVeri independently recalculates every
            tenant&apos;s reconciliation. It flags errors before statements go
            out. {TRIAL_COPY}, no credit card required.
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
