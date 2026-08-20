import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { CamEstimateForecaster } from "./CamEstimateForecasterClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free CAM Estimate Forecaster",
  description:
    "Project next-year CAM estimates by expense category. Apply CPI escalation, historical trends, and mid-year adjustments to generate accurate estimate letters.",
  alternates: {
    canonical: buildSiteUrl("/tools/cam-estimate-forecaster"),
  },
  openGraph: {
    title: "Free CAM Estimate Forecaster",
    description:
      "Project next-year CAM estimates by expense category. Apply CPI escalation, historical trends, and mid-year adjustments to generate accurate estimate letters.",
    url: buildSiteUrl("/tools/cam-estimate-forecaster"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free CAM Estimate Forecaster",
    description:
      "Project next-year CAM estimates by expense category. Apply CPI escalation, historical trends, and mid-year adjustments to generate accurate estimate letters.",
  },
};

export default function CamEstimateForecasterPage() {
  return (
    <>
      <TrackToolPageView slug="cam-estimate-forecaster" />
      <CamEstimateForecaster />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["cam-estimate-forecaster"] ?? []}
        />
      </div>
    </>
  );
}
