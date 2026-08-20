import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ArrowRight, CheckCircle } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllLeaseTypes } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Commercial Lease Type CAM Guides - NNN, Gross, Modified Gross & More",
  description:
    "CAM reconciliation guides for all major commercial lease types: Triple Net (NNN), Gross, Modified Gross, Full Service, Double Net, Percentage, Ground, and Industrial Gross. Formulas, worked examples, and common billing errors for each.",
  alternates: { canonical: `${SITE_URL}/resources/lease-types` },
  openGraph: {
    title: "Commercial Lease Type CAM Guides",
    description:
      "CAM reconciliation formulas, worked examples, and billing rules for every major commercial lease type.",
    url: `${SITE_URL}/resources/lease-types`,
    type: "website",
  },
};

export default async function LeaseTypesHubPage() {
  const leaseTypes = await getAllLeaseTypes();

  const itemListSchema = structuredDataSchemas.itemList({
    name: "Commercial Lease Type CAM Reconciliation Guides",
    description:
      "CAM reconciliation guides for all major commercial lease types including NNN, Gross, Modified Gross, Full Service, and more.",
    items: leaseTypes.map((lt) => ({
      name: lt.name,
      url: `/resources/lease-types/${lt.slug}/cam-guide`,
    })),
  });

  return (
    <ContentPageLayout pageName="Lease Types">
      <JsonLd data={itemListSchema} />
      <div className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          Commercial Lease Type CAM Reconciliation Guides
        </h1>
        <p className="text-lg text-muted-foreground mb-8 not-prose">
          CAM billing rules differ significantly across lease structures. Each
          guide covers who bears operating expenses, whether reconciliation is
          required, how gross-up and caps apply, and the most common calculation
          mistakes for that lease type, with formulas and worked examples.
        </p>

        {/* Summary stats */}
        <div className="grid grid-cols-1 gap-4 mb-12 not-prose sm:grid-cols-3">
          <div className="rounded-lg border bg-primary/5 border-primary/20 p-4">
            <div className="text-3xl font-bold text-primary">
              {leaseTypes.length}
            </div>
            <div className="font-medium text-sm mt-1">Lease Types</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              With CAM reconciliation rules
            </div>
          </div>
          <div className="rounded-lg border bg-success/10 border-success/30 p-4">
            <div className="text-3xl font-bold text-success-strong">
              {leaseTypes.filter((lt) => lt.reconciliationRequired).length}
            </div>
            <div className="font-medium text-sm mt-1">
              Require Reconciliation
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Annual settlement required
            </div>
          </div>
          <div className="rounded-lg border bg-warning/10 border-warning/30 p-4">
            <div className="text-3xl font-bold text-warning-foreground">
              {leaseTypes.filter((lt) => lt.grossUpApplicable).length}
            </div>
            <div className="font-medium text-sm mt-1">Gross-Up Applicable</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Variable expense normalization
            </div>
          </div>
        </div>

        {/* Lease type cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 not-prose">
          {leaseTypes.map((lt) => (
            <Link
              key={lt.slug}
              href={`/resources/lease-types/${lt.slug}/cam-guide`}
              className="flex items-start gap-3 rounded-lg border p-4 transition-colors duration-200 hover:bg-muted/50"
            >
              <div className="flex-shrink-0 mt-0.5">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{lt.name}</span>
                  {lt.abbreviation && lt.abbreviation !== "GL" && (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono text-muted-foreground">
                      {lt.abbreviation}
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  {lt.camIncluded ? (
                    <span className="text-xs text-success-strong flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> CAM pass-through
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No CAM pass-through
                    </span>
                  )}
                  {lt.reconciliationRequired && (
                    <span className="text-xs text-muted-foreground">
                      · Reconciliation required
                    </span>
                  )}
                </div>
                <p
                  className="text-sm text-muted-foreground mt-1 line-clamp-2"
                  title={lt.subheadline}
                >
                  {lt.subheadline}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["lease-types"]}
        />

        {/* CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 mt-12 not-prose">
          <h2 className="text-lg font-bold mb-2">
            Reconcile Any Lease Type Accurately
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri applies the correct gross-up, cap, and pro-rata rules for
            your specific lease type automatically. It extracts the terms from
            your lease PDF and calculates audit-defensible CAM charges against
            your GL export.
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
