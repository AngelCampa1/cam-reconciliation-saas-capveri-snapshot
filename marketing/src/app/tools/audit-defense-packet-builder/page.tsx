import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { AuditDefensePacketBuilderClient } from "./AuditDefensePacketBuilderClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free CAM Audit Defense Packet Builder (PDF)",
  description:
    "A structured template for assembling your CAM audit defense packet. Includes the document index, checklist for each required item, and how-to notes for organizing your GL, invoices, and calculation workbooks.",
  alternates: {
    canonical: buildSiteUrl("/tools/audit-defense-packet-builder"),
  },
  openGraph: {
    title: "Free CAM Audit Defense Packet Builder (PDF)",
    description:
      "A structured template for assembling your CAM audit defense packet. Includes the document index, checklist for each required item, and how-to notes for organizing your GL, invoices, and calculation workbooks.",
    url: buildSiteUrl("/tools/audit-defense-packet-builder"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free CAM Audit Defense Packet Builder (PDF)",
    description:
      "A structured template for assembling your CAM audit defense packet. Includes the document index, checklist for each required item, and how-to notes for organizing your GL, invoices, and calculation workbooks.",
  },
};

export default function AuditDefensePacketBuilderPage() {
  return (
    <>
      <TrackToolPageView slug="audit-defense-packet-builder" />
      <AuditDefensePacketBuilderClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["audit-defense-packet-builder"] ?? []}
        />
      </div>
    </>
  );
}
