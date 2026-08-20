import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllLeaseClauses } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "Commercial Lease Clause Interpretation Guide - CAM & Operating Expenses",
  description:
    "Detailed interpretation of 20 commercial lease clause types covering CAM reconciliation, operating expenses, gross-up, caps, audit rights, and billing system configuration for Yardi and MRI.",
  alternates: { canonical: `${SITE_URL}/resources/lease-clauses` },
  openGraph: {
    title: "Commercial Lease Clause Interpretation Guide",
    description:
      "Model lease language, calculation methodology, and billing system implications for 20 critical commercial lease clause types.",
    url: `${SITE_URL}/resources/lease-clauses`,
    type: "website",
  },
};

export default async function LeaseClausesHubPage() {
  const clauses = await getAllLeaseClauses();

  const itemListSchema = structuredDataSchemas.itemList({
    name: "CAM Lease Clause Interpretation Guides",
    description:
      "Interpretation guides for common CAM-related lease clauses in commercial leases.",
    items: clauses.map((c) => ({
      name: c.title,
      url: `/resources/lease-clauses/${c.slug}`,
    })),
  });

  return (
    <ContentPageLayout pageName="Lease Clauses">
      <JsonLd data={itemListSchema} />
      <div className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          Commercial Lease Clause Interpretation Guide
        </h1>
        <p className="text-lg text-muted-foreground mb-8 not-prose">
          Model lease language, calculation methodology, drafting pitfalls, and
          billing system implications for the 20 most critical commercial lease
          clause types. Each guide includes landlord-favorable, balanced, and
          tenant-favorable variations with practical interpretation for property
          controllers and CFOs.
        </p>

        {/* Summary stats */}
        <div className="grid grid-cols-1 gap-4 mb-12 not-prose sm:grid-cols-3">
          <div className="rounded-lg border bg-primary/5 border-primary/20 p-4">
            <div className="text-3xl font-bold text-primary">
              {clauses.length}
            </div>
            <div className="font-medium text-sm mt-1">Clause Types</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              With model lease language
            </div>
          </div>
          <div className="rounded-lg border bg-warning/10 border-warning/30 p-4">
            <div className="text-3xl font-bold text-warning-foreground">3</div>
            <div className="font-medium text-sm mt-1">
              Variations Per Clause
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Landlord / Balanced / Tenant
            </div>
          </div>
          <div className="rounded-lg border bg-success/10 border-success/30 p-4">
            <div className="text-3xl font-bold text-success-strong">2</div>
            <div className="font-medium text-sm mt-1">ERP Systems</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Yardi &amp; MRI configuration notes
            </div>
          </div>
        </div>

        {/* Clause list */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 not-prose">
          {clauses.map((clause) => (
            <Link
              key={clause.slug}
              href={`/resources/lease-clauses/${clause.slug}`}
              className="flex items-start gap-3 rounded-lg border p-4 transition-colors duration-200 hover:bg-muted/50"
            >
              <div className="flex-shrink-0 mt-0.5">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{clause.title}</span>
                  <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
                <p
                  className="text-sm text-muted-foreground mt-1 line-clamp-2"
                  title={clause.description}
                >
                  {clause.description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["lease-clauses"]}
        />

        {/* CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 mt-12 not-prose">
          <h2 className="text-lg font-bold mb-2">
            Validate Lease Compliance Automatically
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri checks your CAM reconciliation against lease clause
            requirements, catching gross-up errors, cap violations, and
            exclusion mistakes before tenants or auditors find them.
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
