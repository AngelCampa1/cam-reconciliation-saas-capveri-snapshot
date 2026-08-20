import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { getAllSwitchGuides } from "@/lib/content/pseo-data";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";

const PAGE_TITLE = "Switch to CapVeri: Migration Guides | CAM Reconciliation";
const PAGE_DESC =
  "Migration guides for switching to CapVeri from Excel, outsourced firms, or manual CAM processes. Your ERP stays. CapVeri handles the math.";

export const metadata: Metadata = {
  title: { absolute: PAGE_TITLE },
  description: PAGE_DESC,
  alternates: { canonical: buildSiteUrl("/switch") },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: buildSiteUrl("/switch"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("Switch to CapVeri: Migration Guides")}&category=Migration`,
        ),
        width: 1200,
        height: 630,
        alt: PAGE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESC,
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
      name: "Switch to CapVeri",
    },
  ],
};

export default async function SwitchIndexPage() {
  const guides = await getAllSwitchGuides();

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CapVeri Migration Guides",
    description:
      "Step-by-step guides for switching to CapVeri from various CAM reconciliation tools and processes.",
    itemListElement: guides.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `Switch from ${g.fromName}`,
      url: buildSiteUrl(`/switch/${g.slug}`),
    })),
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={itemListSchema} />
      <JsonLd data={breadcrumbSchema} />
      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Switch to CapVeri: Migration Guides
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            Already reconciling CAM charges with spreadsheets, outsourced firms,
            or manual processes? These guides show you how to switch to CapVeri.
            Your ERP stays. Your existing workflows stay.
          </p>
          <div className="mb-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href={buildTrialLink({ content: "switch_index_primary" })}>
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {guides.map((guide) => (
              <Link
                key={guide.slug}
                href={`/switch/${guide.slug}`}
                className="block border rounded-lg p-6 hover:border-primary/50 transition-colors duration-200 no-underline group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold group-hover:text-primary transition-colors duration-200">
                    Switch from {guide.fromName}
                  </h2>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-200 flex-shrink-0 ml-2" />
                </div>
                <p className="text-base text-muted-foreground mb-3">
                  {guide.subheadline}
                </p>
                <span className="text-xs font-medium text-primary">
                  {guide.totalTime} migration
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
