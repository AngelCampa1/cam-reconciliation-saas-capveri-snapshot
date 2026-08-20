import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { MultiStateCAMDisclosureMatrixClient } from "./MultiStateCAMDisclosureMatrixClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Multi-State CAM Packet Review Checklist (PDF)",
  description:
    "A state-by-state reference matrix covering CAM disclosure requirements, reconciliation statement deadlines, and tenant audit rights windows for the 15 largest commercial real estate markets.",
  alternates: {
    canonical: buildSiteUrl("/tools/multi-state-cam-disclosure-matrix"),
  },
  openGraph: {
    title: "Free Multi-State CAM Packet Review Checklist (PDF)",
    description:
      "A state-by-state reference matrix covering CAM disclosure requirements, reconciliation statement deadlines, and tenant audit rights windows for the 15 largest commercial real estate markets.",
    url: buildSiteUrl("/tools/multi-state-cam-disclosure-matrix"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Multi-State CAM Packet Review Checklist (PDF)",
    description:
      "A state-by-state reference matrix covering CAM disclosure requirements, reconciliation statement deadlines, and tenant audit rights windows for the 15 largest commercial real estate markets.",
  },
};

export default function MultiStateCAMDisclosureMatrixPage() {
  return (
    <>
      <TrackToolPageView slug="multi-state-cam-disclosure-matrix" />
      <MultiStateCAMDisclosureMatrixClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={
            TOOL_RELATED_CONTENT["multi-state-cam-disclosure-matrix"] ?? []
          }
        />
      </div>
    </>
  );
}
