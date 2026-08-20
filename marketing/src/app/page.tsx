import type { Metadata } from "next";
import { LandingPageClient } from "@/components/landing";
import { LANDING_FAQS } from "@/data/landing-faqs";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getVideosForPlacement } from "@/lib/content/pseo-data";

const HOMEPAGE_TITLE =
  "CAM Reconciliation Software for Commercial Landlords | CapVeri";
const HOMEPAGE_DESC =
  "Upload Yardi or MRI exports. CapVeri checks CAM math, lease terms, and rent rolls before statements go out.";

export const metadata: Metadata = {
  title: { absolute: HOMEPAGE_TITLE },
  description: HOMEPAGE_DESC,
  alternates: { canonical: buildSiteUrl("/") },
  openGraph: {
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESC,
    url: buildSiteUrl("/"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CAM Reconciliation Software for Commercial Landlords")}`,
        ),
        width: 1200,
        height: 630,
        alt: "CapVeri CAM reconciliation software for commercial landlords",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESC,
  },
};

export default async function LandingPage() {
  const videos = await getVideosForPlacement("home");
  return (
    <>
      <JsonLd data={structuredDataSchemas.softwareApplication} />
      <JsonLd data={structuredDataSchemas.service} />
      <JsonLd data={structuredDataSchemas.faqPage(LANDING_FAQS)} />
      <JsonLd
        data={structuredDataSchemas.webPage({
          name: HOMEPAGE_TITLE,
          url: buildSiteUrl("/"),
          description: HOMEPAGE_DESC,
          dateModified: "2026-05-01",
        })}
      />
      <LandingPageClient />
      {videos.length > 0 && (
        <section className="py-16 border-t">
          <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-8 text-center">
              Watch CAM reconciliation in action
            </h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {videos.map((v) => (
                <div key={v.slug} className="flex flex-col gap-3">
                  <JsonLd
                    data={structuredDataSchemas.videoObject({
                      name: v.title,
                      description: v.description,
                      youtubeId: v.youtubeId,
                      uploadDate: v.uploadDate,
                      durationSeconds: v.durationSeconds,
                      thumbnailUrl: v.thumbnailUrl,
                    })}
                  />
                  <VideoEmbed
                    youtubeId={v.youtubeId}
                    title={v.title}
                    thumbnailUrl={v.thumbnailUrl}
                  />
                  <p className="text-sm font-medium">{v.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {v.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <p className="sr-only">
        <time dateTime="2026-05-01">Last updated: May 1, 2026</time>
      </p>
    </>
  );
}
