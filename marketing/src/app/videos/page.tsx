import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { VideoEmbed } from "@/components/VideoEmbed";
import { structuredDataSchemas } from "@/lib/structured-data";
import { getAllVideos } from "@/lib/content/pseo-data";
import { buildSiteUrl } from "@/lib/site";

const TITLE = "CAM Reconciliation Videos | CapVeri";
const DESC =
  "Short videos that show how CAM reconciliation works, what errors look like, and how to fix them fast.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: buildSiteUrl("/videos") },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: buildSiteUrl("/videos"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
  },
};

export default async function VideosPage() {
  const videos = await getAllVideos();

  return (
    <div className="min-h-screen pb-24">
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: buildSiteUrl("/") },
          { name: "Videos", url: buildSiteUrl("/videos") },
        ])}
      />
      {videos.map((v) => (
        <JsonLd
          key={v.slug}
          data={structuredDataSchemas.videoObject({
            name: v.title,
            description: v.description,
            youtubeId: v.youtubeId,
            uploadDate: v.uploadDate,
            durationSeconds: v.durationSeconds,
            thumbnailUrl: v.thumbnailUrl,
          })}
        />
      ))}

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary/80 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-primary-foreground mb-4">
              Watch How CAM Reconciliation Works
            </h1>
            <p className="text-lg text-primary-foreground/90">
              Short videos. Real errors. See how to catch them before your
              tenant does.
            </p>
          </div>
        </div>
      </section>

      {/* Video grid */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 max-w-5xl mx-auto">
            {videos.map((v) => (
              <div key={v.slug} className="flex flex-col gap-3">
                <VideoEmbed
                  youtubeId={v.youtubeId}
                  title={v.title}
                  thumbnailUrl={v.thumbnailUrl}
                />
                <h2 className="text-base font-semibold leading-snug">
                  {v.title}
                </h2>
                <p className="text-sm text-muted-foreground">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
