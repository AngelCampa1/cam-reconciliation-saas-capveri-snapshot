import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { CamGrossUpCalculator } from "./CamGrossUpCalculatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free CAM Gross-Up Scenario Calculator",
  description:
    "Calculate CAM gross-up expenses across any occupancy scenario. Model how adjustments affect tenant shares and recoverable pools. Free, no login required.",
  alternates: {
    canonical: buildSiteUrl("/tools/cam-gross-up-calculator"),
  },
  openGraph: {
    title: "Free CAM Gross-Up Scenario Calculator",
    description:
      "Calculate CAM gross-up expenses across any occupancy scenario. Model how adjustments affect tenant shares and recoverable pools. Free, no login required.",
    url: buildSiteUrl("/tools/cam-gross-up-calculator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free CAM Gross-Up Scenario Calculator",
    description:
      "Calculate CAM gross-up expenses across any occupancy scenario. Model how adjustments affect tenant shares and recoverable pools. Free, no login required.",
  },
};

export default function CamGrossUpCalculatorPage() {
  return (
    <>
      <TrackToolPageView slug="cam-gross-up-calculator" />
      <CamGrossUpCalculator />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["cam-gross-up-calculator"] ?? []}
        />
      </div>
    </>
  );
}
