import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { CamCapCalculator } from "./CamCapCalculatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free CAM Cap Calculator",
  description:
    "Model cumulative and non-cumulative CAM caps with carry-forward bank tracking. Compare cap impact over 5 years and visualize unused cap capacity.",
  alternates: {
    canonical: buildSiteUrl("/tools/cam-cap-calculator"),
  },
  openGraph: {
    title: "Free CAM Cap Calculator",
    description:
      "Model cumulative and non-cumulative CAM caps with carry-forward bank tracking. Compare cap impact over 5 years and visualize unused cap capacity.",
    url: buildSiteUrl("/tools/cam-cap-calculator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free CAM Cap Calculator",
    description:
      "Model cumulative and non-cumulative CAM caps with carry-forward bank tracking. Compare cap impact over 5 years and visualize unused cap capacity.",
  },
};

export default function CamCapCalculatorPage() {
  return (
    <>
      <TrackToolPageView slug="cam-cap-calculator" />
      <CamCapCalculator />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["cam-cap-calculator"] ?? []}
        />
      </div>
    </>
  );
}
