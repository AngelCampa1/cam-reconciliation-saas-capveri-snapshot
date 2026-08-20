import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, MapPin, TrendingUp } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllMetros } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation by Metro Market: Market Context Overview",
  description:
    "Overview of metro-level vacancy, tax, and operating expense conditions that influence CAM reconciliation risk for landlords.",
  alternates: { canonical: `${SITE_URL}/resources/markets` },
  openGraph: {
    title: "CAM Reconciliation by Metro Market",
    description:
      "Overview of metro-level vacancy, tax, and operating expense conditions that influence CAM reconciliation risk.",
    url: `${SITE_URL}/resources/markets`,
    type: "website",
  },
};

function getVacancyColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 20) return "text-destructive-strong";
  if (rate >= 12) return "text-warning-foreground";
  return "text-success-strong";
}

export default async function MarketsHubPage() {
  const metros = await getAllMetros();

  const overviewSchema = structuredDataSchemas.webPage({
    name: "CAM Reconciliation by Metro Market",
    url: `${SITE_URL}/resources/markets`,
    description:
      "Overview of metro-level vacancy, tax, and market conditions that affect CAM reconciliation.",
    pageType: "CollectionPage",
    dateModified: "2026-04-17",
  });

  if (metros.length === 0) {
    return (
      <ContentPageLayout pageName="Metro Markets">
        <div className="prose prose-gray max-w-none">
          <h1 className="mb-4 text-3xl font-bold not-prose">
            CAM Reconciliation by Metro Market
          </h1>
          <p className="text-muted-foreground">
            Metro market guidance is being consolidated into the retained
            resource library.
          </p>
        </div>
      </ContentPageLayout>
    );
  }

  return (
    <ContentPageLayout pageName="Metro Markets">
      <JsonLd data={overviewSchema} />
      <div className="prose prose-gray max-w-none">
        <h1 className="mb-4 text-3xl font-bold not-prose md:text-4xl">
          CAM Reconciliation by Metro Market
        </h1>
        <p className="mb-8 text-lg text-muted-foreground not-prose">
          Vacancy rates drive gross-up calculations. Property tax systems vary
          by county. Operating expense benchmarks differ by market and property
          type. This hub keeps the market signals that matter without sending
          users into thin city pages.
        </p>

        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5 not-prose">
          <p className="text-sm text-muted-foreground">
            Metro-specific child pages were retired. Market context now feeds
            into the retained reconciliation guides instead of living on
            duplicate city templates.
          </p>
          <Link
            href="/resources"
            className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Go to the retained resource library
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 not-prose sm:grid-cols-2">
          {metros
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((metro) => (
              <div
                key={metro.slug}
                className="flex flex-col rounded-lg border p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{metro.name}</span>
                </div>
                {metro.vacancyRates.office !== null && (
                  <div className="mb-2 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Office:</span>
                      <span
                        className={`font-medium ${getVacancyColor(metro.vacancyRates.office)}`}
                      >
                        {metro.vacancyRates.office}%
                      </span>
                    </div>
                    {metro.vacancyRates.industrial !== null && (
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Industrial:
                        </span>
                        <span className="font-medium">
                          {metro.vacancyRates.industrial}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <p
                  className="line-clamp-2 text-xs text-muted-foreground"
                  title={metro.marketSpecificIssues[0]}
                >
                  {metro.marketSpecificIssues[0]}
                </p>
              </div>
            ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS.markets}
        />

        <div className="mt-12 rounded-lg border border-primary/20 bg-primary/5 p-6 not-prose">
          <h2 className="mb-2 text-lg font-bold">
            Use market context without inheriting market-page sprawl
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            CapVeri lets teams validate occupancy-driven gross-up and tax timing
            risk from the same retained guides they use to close the audit file.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </ContentPageLayout>
  );
}
