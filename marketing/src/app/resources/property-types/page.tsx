import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllPropertyTypes } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation by Property Type: Portfolio Context Overview",
  description:
    "Overview of property-type-specific CAM mechanics, benchmark ranges, and common billing errors for landlords.",
  alternates: { canonical: `${SITE_URL}/resources/property-types` },
  openGraph: {
    title: "CAM Reconciliation by Property Type",
    description:
      "Overview of property-type-specific CAM mechanics, benchmark ranges, and common billing errors.",
    url: `${SITE_URL}/resources/property-types`,
    type: "website",
  },
};

const typeCategories: Record<string, string[]> = {
  Office: [
    "class-a-office",
    "class-b-office",
    "suburban-office",
    "medical-office",
  ],
  Retail: [
    "neighborhood-retail",
    "power-center",
    "lifestyle-center",
    "strip-mall",
  ],
  Industrial: ["warehouse-distribution", "manufacturing", "flex-industrial"],
  "Mixed-Use": ["mixed-use-vertical", "mixed-use-horizontal"],
  Specialty: [
    "life-sciences",
    "data-center",
    "self-storage",
    "hospital-campus",
    "ground-lease",
  ],
};

export default async function PropertyTypesHubPage() {
  const types = await getAllPropertyTypes();
  const typeMap = new Map(types.map((type) => [type.slug, type]));

  const overviewSchema = structuredDataSchemas.webPage({
    name: "CAM Reconciliation by Property Type",
    url: `${SITE_URL}/resources/property-types`,
    description:
      "Overview of property-type-specific CAM mechanics, benchmark ranges, and common billing errors.",
    pageType: "CollectionPage",
    dateModified: "2026-04-17",
  });

  return (
    <ContentPageLayout pageName="Property Type CAM Guides">
      <JsonLd data={overviewSchema} />
      <div className="prose prose-gray max-w-none">
        <h1 className="mb-4 text-3xl font-bold not-prose md:text-4xl">
          CAM Reconciliation by Property Type
        </h1>
        <p className="mb-8 text-lg text-muted-foreground not-prose">
          Every property type has distinct CAM pools, lease structures, and
          billing nuances. This hub keeps the benchmark and risk context while
          the retained guides handle the actual calculation and recoverability
          decisions.
        </p>

        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5 not-prose">
          <p className="text-sm text-muted-foreground">
            The old property-type child pages were consolidated. Use the
            retained guides for recoverability, clauses, and software QA instead
            of navigating to redirect-only type pages.
          </p>
          <Link
            href="/resources/expenses"
            className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Open the expense classification playbook
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="mb-12 grid grid-cols-2 gap-4 not-prose sm:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {types.length}
            </div>
            <div className="mt-1 text-sm font-medium">Property Types</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Covered in benchmark context
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {Object.keys(typeCategories).length}
            </div>
            <div className="mt-1 text-sm font-medium">Categories</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Office, retail, industrial, mixed-use, specialty
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {types.reduce(
                (count, type) => count + type.commonBillingErrors.length,
                0,
              )}
            </div>
            <div className="mt-1 text-sm font-medium">Billing Errors</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Documented across all types
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {
                types.filter((type) =>
                  type.grossUpApplicability.toLowerCase().startsWith("highly"),
                ).length
              }
            </div>
            <div className="mt-1 text-sm font-medium">High Gross-Up</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Property types where occupancy math matters most
            </div>
          </div>
        </div>

        {Object.entries(typeCategories).map(([category, slugs]) => (
          <section key={category} className="mb-10 not-prose">
            <h2 className="mb-4 text-xl font-bold">{category}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {slugs
                .map((slug) => typeMap.get(slug))
                .filter(Boolean)
                .map((type) => (
                  <div
                    key={type!.slug}
                    className="flex items-start gap-3 rounded-lg border p-4"
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{type!.name}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        ${type!.benchmarkCamPerSF.low.toFixed(2)}-$
                        {type!.benchmarkCamPerSF.high.toFixed(2)}
                        /SF · {type!.commonLeaseStructures[0]}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["property-types"]}
        />

        <div className="mt-12 rounded-lg border border-primary/20 bg-primary/5 p-6 not-prose">
          <h2 className="mb-2 text-lg font-bold">
            Validate CAM for any property type
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            CapVeri applies the retained recoverability and clause logic to your
            export so teams can catch type-specific leakage without maintaining
            a page for every subtype.
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
