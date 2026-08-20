import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  TrendingUp,
  MapPin,
  DollarSign,
  Scale,
  AlertTriangle,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { JsonLd } from "@/components/JsonLd";
import { getAllMetros, getMetro } from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ metro: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const metros = await getAllMetros();
  return metros.map((metro) => ({ metro: metro.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { metro: metroSlug } = await params;
  const metro = await getMetro(metroSlug);
  if (!metro) notFound();

  const title = `${metro.name} CAM Reconciliation Guide - Vacancy, Taxes & Benchmarks | CapVeri`;
  const description = `CAM reconciliation guide for ${metro.name} commercial landlords. Office vacancy ${metro.vacancyRates.office ?? "N/A"}%, property tax system, operating expense benchmarks, and market-specific billing issues.`;
  const url = `${SITE_URL}/resources/markets/${metro.slug}/cam-guide`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article" },
  };
}

function VacancyBadge({ label, rate }: { label: string; rate: number | null }) {
  if (rate === null) return null;
  const color =
    rate >= 20
      ? "text-destructive-strong bg-destructive/10"
      : rate >= 12
        ? "text-warning bg-warning/10"
        : "text-success-strong bg-success/10";

  return (
    <div className={`rounded-lg p-4 ${color}`}>
      <div className="text-2xl font-bold">{rate}%</div>
      <div className="text-xs font-medium mt-1">{label} Vacancy</div>
    </div>
  );
}

export default async function MetroMarketPage({ params }: Props) {
  const { metro: metroSlug } = await params;
  const metro = await getMetro(metroSlug);
  if (!metro) notFound();

  const url = `${SITE_URL}/resources/markets/${metro.slug}/cam-guide`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${metro.name} CAM Reconciliation Guide for Landlords`,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    datePublished: "2026-03-17",
    dateModified: "2026-03-17",
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
        name: "Metro Markets",
        item: `${SITE_URL}/resources/markets`,
      },
      { "@type": "ListItem", position: 4, name: metro.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={`${metro.name} CAM Guide`}
      backHref="/resources/markets"
      backLabel="Metro Markets"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="h-4 w-4" />
            <span>{metro.state}</span>
            <span>·</span>
            <span>Data as of {metro.vacancyRates.asOf}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {metro.name} CAM Reconciliation Guide
          </h1>
          <p className="text-lg text-muted-foreground">
            Vacancy rates, property tax system, operating expense benchmarks,
            and market-specific CAM billing considerations for {metro.name}
            {" "}
            commercial landlords.
          </p>
        </div>

        {/* Vacancy Rates */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Current Vacancy Rates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <VacancyBadge label="Office" rate={metro.vacancyRates.office} />
            <VacancyBadge label="Retail" rate={metro.vacancyRates.retail} />
            <VacancyBadge
              label="Industrial"
              rate={metro.vacancyRates.industrial}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Source: {metro.vacancyRates.source}
          </p>
        </div>

        {/* CAM Benchmarks */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Average CAM per Square Foot
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                { label: "Office", value: metro.avgCamPerSF.office },
                { label: "Retail", value: metro.avgCamPerSF.retail },
                {
                  label: "Industrial",
                  value: metro.avgCamPerSF.industrial,
                },
              ] as const
            ).map(
              (item) =>
                item.value !== null && (
                  <div key={item.label} className="rounded-lg border p-4">
                    <div className="text-2xl font-bold">
                      ${item.value.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {item.label} /SF/yr
                    </div>
                  </div>
                ),
            )}
          </div>
        </div>

        {/* Property Tax */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Property Tax System
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Assessment Authority
              </div>
              <p className="font-medium">{metro.taxAssessmentAuthority}</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Protest Procedure
              </div>
              <p>{metro.taxProtestProcedure}</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Effective Tax Rate
              </div>
              <p className="font-medium">{metro.propertyTaxRate}</p>
            </div>
          </div>
        </div>

        {/* Key Submarkets */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Key Submarkets
          </h2>
          <div className="flex flex-wrap gap-2">
            {metro.keySubmarkets.map((sub) => (
              <span key={sub} className="rounded-full border px-3 py-1 text-sm">
                {sub}
              </span>
            ))}
          </div>
        </div>

        {/* Market-Specific Issues */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            CAM Billing Considerations
          </h2>
          <ul className="space-y-3">
            {metro.marketSpecificIssues.map((issue) => (
              <li
                key={issue}
                className="flex items-start gap-3 rounded-lg border p-4"
              >
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <span className="text-sm">{issue}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* BOMA Chapter */}
        {metro.localBomaChapter && (
          <div className="not-prose rounded-lg border p-4 mb-10">
            <div className="text-sm font-medium text-muted-foreground mb-1">
              Local BOMA Chapter
            </div>
            <p className="font-medium">{metro.localBomaChapter}</p>
          </div>
        )}

        {/* Notes */}
        {metro.notes && (
          <div className="not-prose mb-10">
            <h2 className="text-xl font-bold mb-3">Market Context</h2>
            <p className="text-muted-foreground">{metro.notes}</p>
          </div>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          links={
            metro.relatedResources && metro.relatedResources.length > 0
              ? [
                  ...metro.relatedResources.map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                  ...(metro.relatedTools ?? []).map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                ]
              : [
                  {
                    href: "/resources/property-types/class-a-office/cam-guide",
                    label: "Office Property CAM Guide",
                  },
                  {
                    href: "/resources/property-types/neighborhood-retail/cam-guide",
                    label: "Retail Property CAM Guide",
                  },
                  {
                    href: "/blog/cam-reconciliation-errors",
                    label: "Common CAM Reconciliation Errors",
                  },
                  {
                    href: "/tools/cam-gross-up-calculator",
                    label: "CAM Gross-Up Calculator",
                  },
                  {
                    href: "/tools/pro-rata-calculator",
                    label: "Pro Rata Share Calculator",
                  },
                ]
          }
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Reconcile {metro.name} Properties
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri accounts for market-specific vacancy, local tax timing, and
            property-type-specific expense pools in your reconciliation.
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
