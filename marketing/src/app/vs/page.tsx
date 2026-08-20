import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { getAllComparisons } from "@/lib/content/pseo-data";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";
import {
  filterByRetainedSlugs,
  RETAINED_COMPARISON_SLUGS,
} from "@/lib/seo/content-governance";

const VS_TITLE =
  "CapVeri vs ERP and Manual CAM Reconciliation | Independent Verification";
const VS_DESC =
  "Compare CapVeri's export-based CAM reconciliation verification layer with ERP-native workflows and manual spreadsheets. Built for commercial landlords who keep their existing ERP.";

export const metadata: Metadata = {
  title: { absolute: VS_TITLE },
  description: VS_DESC,
  alternates: { canonical: buildSiteUrl("/vs") },
  openGraph: {
    title: VS_TITLE,
    description: VS_DESC,
    url: buildSiteUrl("/vs"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CapVeri vs ERP and Manual CAM Reconciliation")}&category=Comparison`,
        ),
        width: 1200,
        height: 630,
        alt: VS_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: VS_TITLE,
    description: VS_DESC,
  },
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
    },
  ],
};

async function ComparisonHubPage() {
  const comparisons = filterByRetainedSlugs(
    await getAllComparisons(),
    RETAINED_COMPARISON_SLUGS,
  );

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CapVeri Competitor Comparisons",
    description:
      "Detailed comparisons between CapVeri and the landlord-side systems that most often shape CAM buying decisions.",
    itemListElement: comparisons.map((comparison, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `CapVeri vs ${comparison.competitorName}`,
      url: buildSiteUrl(`/vs/${comparison.slug}`),
    })),
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={itemListSchema} />
      <JsonLd data={breadcrumbSchema} />
      <div className="pt-16">
        <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>

          <h1 className="mt-8 text-3xl font-bold md:text-4xl">
            Independent CAM Verification vs ERP and Manual Workflows
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            CapVeri is CAM reconciliation software for commercial landlords and
            property teams. It checks lease math before tenant packages go out.
            It works alongside Yardi, MRI, RealPage, AppFolio, and spreadsheets.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href={buildTrialLink({ content: "vs_index_primary" })}>
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>

          <div className="mt-12">
            <h2 className="text-xl font-semibold">
              At a Glance: CAM Reconciliation Approaches
            </h2>
            {(() => {
              const glanceRows = [
                {
                  dimension: "Role",
                  capveri:
                    "Independent verification layer over exported CAM and GL data",
                  erp: "System of record for accounting, leases, charges, and reporting",
                  manual:
                    "Analyst-built review model maintained outside the system of record",
                },
                {
                  dimension: "Data source",
                  capveri:
                    "CSV or Excel exports from supported property management systems",
                  erp: "Native ERP data and configured report outputs",
                  manual:
                    "Exports copied into workbooks, often combined with lease abstracts",
                },
                {
                  dimension: "Best use",
                  capveri:
                    "Pre-send checks, portfolio consistency review, and tenant audit support",
                  erp: "Day-to-day accounting operations and official ledger activity",
                  manual:
                    "Ad hoc investigation when volume is low or rules are unusual",
                },
                {
                  dimension: "Review trail",
                  capveri:
                    "Issue queue tied to source lines, lease rules, and calculation context",
                  erp: "Depends on report setup, audit logs, and local configuration",
                  manual:
                    "Depends on workbook controls, versioning, and reviewer discipline",
                },
                {
                  dimension: "Implementation motion",
                  capveri:
                    "Upload exports and confirm mappings; no ERP replacement required",
                  erp: "Uses the existing system and configuration already in place",
                  manual:
                    "Build or maintain spreadsheet templates and reconciliation checks",
                },
              ];
              return (
                <>
                  {/* Desktop: side-by-side table */}
                  <div className="hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mt-4">
                    <table className="w-full border-collapse border border-border text-sm">
                      <caption className="sr-only">
                        CAM reconciliation approach comparison at a glance
                      </caption>
                      <thead>
                        <tr className="bg-muted">
                          <th
                            scope="col"
                            className="border border-border p-3 text-left font-medium"
                          >
                            Dimension
                          </th>
                          <th
                            scope="col"
                            className="border border-border p-3 text-left font-medium text-primary"
                          >
                            CapVeri export verification
                          </th>
                          <th
                            scope="col"
                            className="border border-border p-3 text-left font-medium"
                          >
                            Existing ERP workflow
                          </th>
                          <th
                            scope="col"
                            className="border border-border p-3 text-left font-medium"
                          >
                            Manual spreadsheet review
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {glanceRows.map((row) => (
                          <tr key={row.dimension} className="even:bg-muted/30">
                            <td className="border border-border p-3 font-medium">
                              {row.dimension}
                            </td>
                            <td className="border border-border p-3 align-top font-medium text-primary">
                              {row.capveri}
                            </td>
                            <td className="border border-border p-3 align-top">
                              {row.erp}
                            </td>
                            <td className="border border-border p-3 align-top">
                              {row.manual}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile: stacked cards per dimension */}
                  <div className="md:hidden mt-4 space-y-4">
                    {glanceRows.map((row) => (
                      <div
                        key={row.dimension}
                        className="rounded-lg border border-border bg-card p-4"
                      >
                        <p className="text-base font-semibold text-foreground mb-3">
                          {row.dimension}
                        </p>
                        <dl className="space-y-2">
                          <div className="flex flex-col gap-0.5">
                            <dt className="text-xs font-medium uppercase tracking-wide text-primary">
                              CapVeri export verification
                            </dt>
                            <dd className="text-base text-primary font-medium">
                              {row.capveri}
                            </dd>
                          </div>
                          <div className="flex flex-col gap-0.5 border-t border-border/60 pt-2">
                            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Existing ERP workflow
                            </dt>
                            <dd className="text-base text-foreground">
                              {row.erp}
                            </dd>
                          </div>
                          <div className="flex flex-col gap-0.5 border-t border-border/60 pt-2">
                            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Manual spreadsheet review
                            </dt>
                            <dd className="text-base text-foreground">
                              {row.manual}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>

          <h2 className="mt-12 text-xl font-semibold">Detailed Comparisons</h2>
          <div className="mt-4 space-y-6">
            {comparisons.map((comparison) => (
              <Link
                key={comparison.slug}
                href={`/vs/${comparison.slug}`}
                className="group block rounded-lg border p-6 transition-colors duration-200 hover:border-primary/50"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold transition-colors duration-200 group-hover:text-primary">
                      {comparison.headline}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {comparison.metaDescription}
                    </p>
                    <div className="mt-4 rounded-lg border border-primary/10 bg-primary/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Winner: {comparison.winnerLabel}
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {comparison.winnerSummary}
                      </p>
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <p className="font-medium text-foreground">
                            Best for CapVeri
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {comparison.bestForCapveri}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            Best for {comparison.competitorShortName}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {comparison.bestForCompetitor}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComparisonHubPage;
