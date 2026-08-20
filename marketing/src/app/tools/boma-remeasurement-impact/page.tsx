import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { BOMARemeasurementImpactClient } from "./BOMARemeasurementImpactClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "BOMA Remeasurement Impact Calculator",
  description:
    "Calculate the NOI impact of remeasuring from BOMA 2017 to BOMA 2024. Project rentable area changes, model timing, and see per-tenant share impact.",
  alternates: {
    canonical: buildSiteUrl("/tools/boma-remeasurement-impact"),
  },
  openGraph: {
    title: "BOMA Remeasurement Impact Calculator",
    description:
      "Calculate the NOI impact of remeasuring from BOMA 2017 to BOMA 2024. Project rentable area changes, model timing, and see per-tenant share impact.",
    url: buildSiteUrl("/tools/boma-remeasurement-impact"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BOMA Remeasurement Impact Calculator",
    description:
      "Calculate the NOI impact of remeasuring from BOMA 2017 to BOMA 2024. Project rentable area changes, model timing, and see per-tenant share impact.",
  },
};

export default function BomaRemeasurementImpactPage() {
  return (
    <>
      <TrackToolPageView slug="boma-remeasurement-impact" />
      <BOMARemeasurementImpactClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["boma-remeasurement-impact"] ?? []}
        />
      </div>
    </>
  );
}
