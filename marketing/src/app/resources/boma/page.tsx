import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { Ruler, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllBomaTopics } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "BOMA Measurement Standards Deep Dives - Landlord Guides",
  description:
    "In-depth guides to BOMA 2024 measurement standards for commercial real estate. Covers Method A vs B, load factor calculation, rentable vs usable area, common area factor, and adoption roadmap.",
  alternates: { canonical: `${SITE_URL}/resources/boma` },
  openGraph: {
    title: "BOMA Measurement Standards",
    description:
      "BOMA 2024 measurement deep dives for commercial landlords and property managers.",
    url: `${SITE_URL}/resources/boma`,
    type: "website",
  },
};

export default async function BomaHubPage() {
  const topics = await getAllBomaTopics();

  const itemListSchema = structuredDataSchemas.itemList({
    name: "BOMA 2024 Standard Deep Dives",
    description:
      "Detailed guides on BOMA 2024 measurement standards and their impact on CAM reconciliation.",
    items: topics.map((t) => ({
      name: t.title,
      url: `/resources/boma/${t.slug}`,
    })),
  });

  return (
    <ContentPageLayout pageName="BOMA Standards">
      <JsonLd data={itemListSchema} />
      <div className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          BOMA Measurement Standards Deep Dives
        </h1>
        <p className="text-lg text-muted-foreground mb-8 not-prose">
          BOMA measurement standards determine how rentable area is calculated.
          That calculation is the foundation for both base rent and CAM pro-rata
          share allocations. These guides cover the 2024 standard updates,
          worked examples, common errors, and financial impact analysis for each
          topic.
        </p>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12 not-prose">
          {[
            { count: topics.length, label: "Topics", desc: "BOMA deep dives" },
            {
              count: topics.reduce((acc, t) => acc + t.commonErrors.length, 0),
              label: "Common Errors",
              desc: "Documented across all topics",
            },
            {
              count: topics.filter((t) => t.comparison2017vs2024.length > 0)
                .length,
              label: "2017 vs 2024",
              desc: "Standard comparisons included",
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border bg-muted/30 p-4">
              <div className="text-3xl font-bold text-primary">
                {item.count}
              </div>
              <div className="font-medium text-sm mt-1">{item.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Topic list */}
        <section className="mb-10 not-prose">
          <h2 className="text-xl font-bold mb-4">All BOMA Topics</h2>
          <div className="grid gap-3">
            {topics.map((topic) => (
              <Link
                key={topic.slug}
                href={`/resources/boma/${topic.slug}`}
                className="flex items-start gap-3 rounded-lg border p-4 transition-colors duration-200 hover:bg-muted/50"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Ruler className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{topic.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-auto flex-shrink-0 text-muted-foreground" />
                  </div>
                  <p
                    className="text-sm text-muted-foreground mt-1 line-clamp-2"
                    title={topic.description}
                  >
                    {topic.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["boma"]}
        />

        {/* CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 mt-12 not-prose">
          <h2 className="text-lg font-bold mb-2">
            Catch billing errors before tenants do
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri checks your CAM reconciliation against BOMA standards. It
            flags load factor and pro-rata share errors. It catches them before
            tenants dispute them.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            See plans
          </Link>
        </div>
      </div>
    </ContentPageLayout>
  );
}
