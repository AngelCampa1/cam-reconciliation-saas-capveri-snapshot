import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { HcadTaxNormalizerPage } from "./HcadTaxNormalizerClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "HCAD Tax Base Year Normalizer",
  description:
    "Won an HCAD appraisal board protest? Calculate the tax adjustment and lease-cap effect after a successful ARB reduction. Free CAM tax tool.",
  alternates: {
    canonical: buildSiteUrl("/tools/hcad-tax-normalizer"),
  },
  openGraph: {
    title: "HCAD Tax Base Year Normalizer",
    description:
      "Won an HCAD appraisal board protest? Calculate the tax adjustment and lease-cap effect after a successful ARB reduction. Free CAM tax tool.",
    url: buildSiteUrl("/tools/hcad-tax-normalizer"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HCAD Tax Base Year Normalizer",
    description:
      "Won an HCAD appraisal board protest? Calculate the tax adjustment and lease-cap effect after a successful ARB reduction. Free CAM tax tool.",
  },
};

export default function HcadTaxNormalizerToolPage() {
  return (
    <>
      <TrackToolPageView slug="hcad-tax-normalizer" />
      <HcadTaxNormalizerPage />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["hcad-tax-normalizer"] ?? []}
        />
      </div>
    </>
  );
}
