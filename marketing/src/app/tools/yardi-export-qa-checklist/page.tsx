import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { YardiExportQAChecklistClient } from "./YardiExportQAChecklistClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Yardi Export Error Checklist for CAM Reconciliation (PDF)",
  description:
    "A step-by-step checklist for verifying Yardi GL exports before running CAM reconciliation. Catches CapEx miscoding, date range mismatches, and management fee errors.",
  alternates: {
    canonical: buildSiteUrl("/tools/yardi-export-qa-checklist"),
  },
  openGraph: {
    title: "Free Yardi Export Error Checklist for CAM Reconciliation (PDF)",
    description:
      "A step-by-step checklist for verifying Yardi GL exports before running CAM reconciliation. Catches CapEx miscoding, date range mismatches, and management fee errors.",
    url: buildSiteUrl("/tools/yardi-export-qa-checklist"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Yardi Export Error Checklist for CAM Reconciliation (PDF)",
    description:
      "A step-by-step checklist for verifying Yardi GL exports before running CAM reconciliation. Catches CapEx miscoding, date range mismatches, and management fee errors.",
  },
};

export default function YardiExportQAChecklistPage() {
  return (
    <>
      <TrackToolPageView slug="yardi-export-qa-checklist" />
      <YardiExportQAChecklistClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["yardi-export-qa-checklist"] ?? []}
        />
      </div>
    </>
  );
}
