import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  DollarSign,
  AlertTriangle,
  Scale,
  ListChecks,
  TrendingUp,
  ShieldX,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { JsonLd } from "@/components/JsonLd";
import {
  getAllPropertyTypes,
  getPropertyType,
  getReitBenchmark,
} from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ type: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const propertyTypes = await getAllPropertyTypes();
  return propertyTypes.map((type) => ({ type: type.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type: typeSlug } = await params;
  const pt = await getPropertyType(typeSlug);
  if (!pt) notFound();

  const title = `${pt.name} CAM Reconciliation Guide for Landlords | CapVeri`;
  const description = `${pt.name} CAM guide: typical expense pools, gross-up applicability, common billing errors, BOMA standards, and benchmark costs per SF. Landlord reference.`;
  const url = `${SITE_URL}/resources/property-types/${pt.slug}/cam-guide`;

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

export default async function PropertyTypeCamGuidePage({ params }: Props) {
  const { type: typeSlug } = await params;
  const pt = await getPropertyType(typeSlug);
  if (!pt) notFound();
  const benchmark = await getReitBenchmark(typeSlug);

  const url = `${SITE_URL}/resources/property-types/${pt.slug}/cam-guide`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${pt.name} CAM Reconciliation Guide for Landlords`,
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
        name: "Property Types",
        item: `${SITE_URL}/resources/property-types`,
      },
      { "@type": "ListItem", position: 4, name: pt.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={`${pt.name} CAM Guide`}
      backHref="/resources/property-types"
      backLabel="Property Types"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {pt.name} CAM Reconciliation Guide for Landlords
          </h1>
          <p className="text-lg text-muted-foreground">
            Typical CAM pools, billing errors, gross-up mechanics, and BOMA
            standards for {pt.name.toLowerCase()} properties.
          </p>
        </div>

        {/* Benchmark Cost */}
        <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-1">
                Benchmark CAM per SF
              </h2>
              <p className="font-medium text-lg">
                ${pt.benchmarkCamPerSF.low.toFixed(2)} &ndash; $
                {pt.benchmarkCamPerSF.high.toFixed(2)} / SF
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Source: {pt.benchmarkCamPerSF.source}
              </p>
            </div>
          </div>
        </div>

        {/* Gross-Up Applicability */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-8">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Gross-Up Applicability</h2>
              <p className="text-muted-foreground">{pt.grossUpApplicability}</p>
            </div>
          </div>
        </div>

        {/* Typical CAM Pools */}
        <div className="not-prose rounded-lg border p-5 mb-6">
          <div className="flex items-start gap-3">
            <ListChecks className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Typical CAM Pools</h2>
              <ul className="space-y-1">
                {pt.typicalCamPools.map((pool) => (
                  <li key={pool} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                    {pool}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Standard Exclusions */}
        <div className="not-prose rounded-lg border p-5 mb-6">
          <div className="flex items-start gap-3">
            <ShieldX className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Standard Exclusions</h2>
              <ul className="space-y-1">
                {pt.standardExclusions.map((excl) => (
                  <li key={excl} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive/70 flex-shrink-0" />
                    {excl}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Common Lease Structures */}
        <div className="not-prose rounded-lg border p-5 mb-6">
          <div className="flex items-start gap-3">
            <Scale className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Common Lease Structures</h2>
              <div className="flex flex-wrap gap-2">
                {pt.commonLeaseStructures.map((structure) => (
                  <span
                    key={structure}
                    className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium"
                  >
                    {structure}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Common Billing Errors */}
        <div className="not-prose rounded-lg border border-destructive/30 bg-destructive/10 p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Common Billing Errors</h2>
              <ul className="space-y-2">
                {pt.commonBillingErrors.map((error) => (
                  <li key={error} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive/100 mt-1.5 flex-shrink-0" />
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* BOMA Standards */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Relevant BOMA Standards</h2>
              <ul className="space-y-1">
                {pt.relevantBomaStandards.map((standard) => (
                  <li
                    key={standard}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                    {standard}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Notes */}
        {pt.notes && (
          <div className="not-prose mb-10">
            <h2 className="text-xl font-bold mb-3">{pt.name} CAM Context</h2>
            <p className="text-muted-foreground">{pt.notes}</p>
          </div>
        )}

        {/* Industry Benchmarks */}
        {benchmark && (
          <section className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Industry Benchmarks</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Avg Occupancy (2025)
                </div>
                <div className="text-2xl font-bold text-primary">
                  {benchmark.averageOccupancy2025}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Public REIT average
                </div>
              </div>
              {benchmark.medianOpexPerSF !== null && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Median OpEx/SF
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    ${benchmark.medianOpexPerSF.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Annual operating expenses
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Typical Recovery Ratio
                </div>
                <div className="text-2xl font-bold text-primary">
                  {benchmark.typicalRecoveryRatio}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {benchmark.typicalRecoveryRatioNote}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Source: Public REIT 10-K filings (FY 2025), BOMA EER (2025
              edition). Data compiled March 2026.
            </p>
          </section>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          links={
            pt.relatedResources && pt.relatedResources.length > 0
              ? [
                  ...pt.relatedResources.map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                  ...(pt.relatedTools ?? []).map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                ]
              : [
                  {
                    href: "/resources/expenses/administrative-overhead",
                    label: "Administrative Expenses Guide",
                  },
                  {
                    href: "/resources/boma/boma-2024-adoption-roadmap",
                    label: "BOMA 2024 Standard",
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
            Validate Your {pt.name} Reconciliations
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri applies property-type-specific rules to catch gross-up
            errors, cap violations, and billing mistakes. Works from your Yardi
            or MRI exports.
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
