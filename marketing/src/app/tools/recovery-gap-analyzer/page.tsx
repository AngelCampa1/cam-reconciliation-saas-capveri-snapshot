import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { RecoveryGapAnalyzer } from "./RecoveryGapAnalyzerClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

const TOOL_DESCRIPTION =
  "See CAM billing variance in real dollars. Model NOI and property value impact through the cap rate multiplier.";

export const metadata: Metadata = {
  title: "Free CAM Billing Gap Analyzer",
  description: TOOL_DESCRIPTION,
  alternates: {
    canonical: buildSiteUrl("/tools/recovery-gap-analyzer"),
  },
  openGraph: {
    title: "Free CAM Billing Gap Analyzer",
    description: TOOL_DESCRIPTION,
    url: buildSiteUrl("/tools/recovery-gap-analyzer"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free CAM Billing Gap Analyzer",
    description: TOOL_DESCRIPTION,
  },
};

export default function RecoveryGapAnalyzerPage() {
  return (
    <>
      <TrackToolPageView slug="recovery-gap-analyzer" />
      <RecoveryGapAnalyzer />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["recovery-gap-analyzer"] ?? []}
        />
      </div>
    </>
  );
}
