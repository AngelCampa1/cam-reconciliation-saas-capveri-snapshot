import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { Boma2024CalculatorPage } from "./Boma2024CalculatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "BOMA 2024 Rentable Area Calculator",
  description:
    "See how many extra billable square feet your building gains under BOMA 2024. Model outdoor spaces and CAM recovery impact. Free.",
  alternates: {
    canonical: buildSiteUrl("/tools/boma-2024-calculator"),
  },
  openGraph: {
    title: "BOMA 2024 Rentable Area Calculator",
    description:
      "See how many extra billable square feet your building gains under BOMA 2024. Model outdoor spaces and CAM recovery impact. Free.",
    url: buildSiteUrl("/tools/boma-2024-calculator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BOMA 2024 Rentable Area Calculator",
    description:
      "See how many extra billable square feet your building gains under BOMA 2024. Model outdoor spaces and CAM recovery impact. Free.",
  },
};

export default function Boma2024CalculatorToolPage() {
  return (
    <>
      <TrackToolPageView slug="boma-2024-calculator" />
      <Boma2024CalculatorPage />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["boma-2024-calculator"] ?? []}
        />
      </div>
    </>
  );
}
