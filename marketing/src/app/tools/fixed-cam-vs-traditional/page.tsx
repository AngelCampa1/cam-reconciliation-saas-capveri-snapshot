import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { FixedCamModelerPage } from "./FixedCamClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Fixed CAM vs Traditional Reconciliation Modeler",
  description:
    "Compare Fixed CAM vs traditional CAM recovery over 3-5 years. Model expense escalation, occupancy changes, and annual true-up variance. Free calculator.",
  alternates: {
    canonical: buildSiteUrl("/tools/fixed-cam-vs-traditional"),
  },
  openGraph: {
    title: "Fixed CAM vs Traditional Reconciliation Modeler",
    description:
      "Compare Fixed CAM vs traditional CAM recovery over 3-5 years. Model expense escalation, occupancy changes, and annual true-up variance. Free calculator.",
    url: buildSiteUrl("/tools/fixed-cam-vs-traditional"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fixed CAM vs Traditional Reconciliation Modeler",
    description:
      "Compare Fixed CAM vs traditional CAM recovery over 3-5 years. Model expense escalation, occupancy changes, and annual true-up variance. Free calculator.",
  },
};

export default function FixedCamVsTraditionalPage() {
  return (
    <>
      <TrackToolPageView slug="fixed-cam-vs-traditional" />
      <FixedCamModelerPage />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["fixed-cam-vs-traditional"] ?? []}
        />
      </div>
    </>
  );
}
