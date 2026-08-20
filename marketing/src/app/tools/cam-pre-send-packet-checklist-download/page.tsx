import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { CamPreSendPacketChecklistClient } from "./CamPreSendPacketChecklistClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free CAM Pre-Send Packet Checklist (PDF)",
  description:
    "A 20-item pre-send quality check for CAM reconciliation statements. Catches the errors most likely to trigger tenant disputes before statements leave your office.",
  alternates: {
    canonical: buildSiteUrl("/tools/cam-pre-send-packet-checklist-download"),
  },
  openGraph: {
    title: "Free CAM Pre-Send Packet Checklist (PDF)",
    description:
      "A 20-item pre-send quality check for CAM reconciliation statements. Catches the errors most likely to trigger tenant disputes before statements leave your office.",
    url: buildSiteUrl("/tools/cam-pre-send-packet-checklist-download"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free CAM Pre-Send Packet Checklist (PDF)",
    description:
      "A 20-item pre-send quality check for CAM reconciliation statements. Catches the errors most likely to trigger tenant disputes before statements leave your office.",
  },
};

export default function CamPreSendPacketChecklistPage() {
  return (
    <>
      <TrackToolPageView slug="cam-pre-send-packet-checklist-download" />
      <CamPreSendPacketChecklistClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={
            TOOL_RELATED_CONTENT["cam-pre-send-packet-checklist-download"] ?? []
          }
        />
      </div>
    </>
  );
}
