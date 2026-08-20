import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { NOICalculatorClient } from "./NOICalculatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

const TOOL_DESCRIPTION =
  "See how CAM billing errors change your NOI. Enter buildings, CAM rate, and cap rate. Get the full portfolio impact. Free.";

export const metadata: Metadata = {
  title: "NOI Impact Calculator",
  description: TOOL_DESCRIPTION,
  alternates: {
    canonical: buildSiteUrl("/tools/noi-impact-calculator"),
  },
  openGraph: {
    title: "NOI Impact Calculator",
    description: TOOL_DESCRIPTION,
    url: buildSiteUrl("/tools/noi-impact-calculator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NOI Impact Calculator",
    description: TOOL_DESCRIPTION,
  },
};

export default function NOIImpactCalculatorPage() {
  return (
    <>
      <TrackToolPageView slug="noi-impact-calculator" />
      <NOICalculatorClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["noi-impact-calculator"] ?? []}
        />
      </div>
    </>
  );
}
