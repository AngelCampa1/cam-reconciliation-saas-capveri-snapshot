import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { CamBillingErrorEstimatorPage } from "./CamBillingErrorEstimatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

const TOOL_DESCRIPTION =
  "See the size of CAM billing errors in your portfolio. Enter your buildings, square footage, and CAM rate. Get a fast dollar estimate. Free.";

export const metadata: Metadata = {
  title: "Free CAM Billing Error Estimator",
  description: TOOL_DESCRIPTION,
  alternates: {
    canonical: buildSiteUrl("/tools/cam-billing-error-estimator"),
  },
  openGraph: {
    title: "Free CAM Billing Error Estimator",
    description: TOOL_DESCRIPTION,
    url: buildSiteUrl("/tools/cam-billing-error-estimator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free CAM Billing Error Estimator",
    description: TOOL_DESCRIPTION,
  },
};

export default function CamBillingErrorEstimatorToolPage() {
  return (
    <>
      <TrackToolPageView slug="cam-leakage-estimator" />
      <CamBillingErrorEstimatorPage />
      <div className="container mx-auto px-4 pb-4 sm:px-6 lg:px-8 max-w-5xl">
        <p className="text-sm text-muted-foreground leading-relaxed">
          This estimate uses benchmark rates. CapVeri checks your real CAM
          numbers both ways. It catches over-billing and under-billing before
          statements go out.{" "}
          <a
            href={buildSiteUrl("/")}
            className="text-primary hover:underline font-medium"
          >
            See how CapVeri checks your CAM
          </a>
          .
        </p>
      </div>
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["cam-leakage-estimator"] ?? []}
        />
      </div>
    </>
  );
}
