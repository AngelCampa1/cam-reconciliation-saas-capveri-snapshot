import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import {
  getAllIntegrations,
  getVideoForPlacement,
} from "@/lib/content/pseo-data";
import { VideoEmbed } from "@/components/VideoEmbed";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";

const INTEGRATIONS_TITLE = "Supported ERP Exports | CapVeri CAM Reconciliation";
const INTEGRATIONS_DESC =
  "CapVeri works from standard CAM and GL exports from Yardi, MRI, RealPage, AppFolio, and other property management systems. Export files, upload them, and verify reconciliation math without an API integration.";

export const metadata: Metadata = {
  title: { absolute: INTEGRATIONS_TITLE },
  description: INTEGRATIONS_DESC,
  alternates: { canonical: buildSiteUrl("/integrations") },
  openGraph: {
    title: INTEGRATIONS_TITLE,
    description: INTEGRATIONS_DESC,
    url: buildSiteUrl("/integrations"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("Supported ERP Exports")}&category=Integrations`,
        ),
        width: 1200,
        height: 630,
        alt: INTEGRATIONS_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: INTEGRATIONS_TITLE,
    description: INTEGRATIONS_DESC,
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
      name: "Integrations",
    },
  ],
};

export default async function IntegrationsIndexPage() {
  const integrations = await getAllIntegrations();
  const video = await getVideoForPlacement("integrations");

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CapVeri Supported ERP Exports",
    description:
      "Property management platforms that work with CapVeri for independent CAM reconciliation verification.",
    itemListElement: integrations.map((i, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: `CapVeri + ${i.softwareName}`,
      url: buildSiteUrl(`/integrations/${i.slug}`),
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
            className="mb-8 inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Supported ERP Exports
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            No API connection needed. Export CAM, GL, or operating expense
            reports from your property management system. Upload the file and
            check the reconciliation math with CapVeri.
          </p>
          <Link
            href={buildTrialLink({ content: "integrations_index_cta" })}
            className="mb-10 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors duration-200 hover:bg-primary/90"
          >
            Start free trial
          </Link>

          <div className="grid sm:grid-cols-2 gap-6">
            {integrations.map((item) => (
              <Link
                key={item.slug}
                href={`/integrations/${item.slug}`}
                className="block border rounded-lg p-6 hover:border-primary/50 transition-colors duration-200 no-underline group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold group-hover:text-primary transition-colors duration-200">
                    {item.softwareName} export guide
                  </h2>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-200 flex-shrink-0 ml-2" />
                </div>
                <p className="text-base text-muted-foreground">
                  {item.subheadline}
                </p>
              </Link>
            ))}
          </div>

          {video && (
            <div className="mt-16">
              <h2 className="text-xl font-bold mb-6 text-center">
                Watch: No Integration Needed
              </h2>
              <JsonLd
                data={structuredDataSchemas.videoObject({
                  name: video.title,
                  description: video.description,
                  youtubeId: video.youtubeId,
                  uploadDate: video.uploadDate,
                  durationSeconds: video.durationSeconds,
                  thumbnailUrl: video.thumbnailUrl,
                })}
              />
              <div className="max-w-2xl mx-auto">
                <VideoEmbed
                  youtubeId={video.youtubeId}
                  title={video.title}
                  thumbnailUrl={video.thumbnailUrl}
                />
                <p className="text-sm text-muted-foreground text-center mt-3">
                  {video.description}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
