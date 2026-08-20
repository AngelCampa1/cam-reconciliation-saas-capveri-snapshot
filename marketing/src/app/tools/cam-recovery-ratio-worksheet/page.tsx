import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { CamRecoveryRatioWorksheetClient } from "./CamRecoveryRatioWorksheetClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free CAM Recovery Ratio Benchmark Worksheet (XLSX)",
  description:
    "Calculate your CAM recovery ratio and compare it to industry benchmarks by property type. Identify structural lease issues that are reducing your operating expense recovery.",
  alternates: {
    canonical: buildSiteUrl("/tools/cam-recovery-ratio-worksheet"),
  },
  openGraph: {
    title: "Free CAM Recovery Ratio Benchmark Worksheet (XLSX)",
    description:
      "Calculate your CAM recovery ratio and compare it to industry benchmarks by property type. Identify structural lease issues that are reducing your operating expense recovery.",
    url: buildSiteUrl("/tools/cam-recovery-ratio-worksheet"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free CAM Recovery Ratio Benchmark Worksheet (XLSX)",
    description:
      "Calculate your CAM recovery ratio and compare it to industry benchmarks by property type. Identify structural lease issues that are reducing your operating expense recovery.",
  },
};

export default function CamRecoveryRatioWorksheetPage() {
  return (
    <>
      <TrackToolPageView slug="cam-recovery-ratio-worksheet" />
      <CamRecoveryRatioWorksheetClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["cam-recovery-ratio-worksheet"] ?? []}
        />
      </div>
    </>
  );
}
