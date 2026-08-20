import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { CumulativeCapBankCalculatorClient } from "./CumulativeCapBankCalculatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Cumulative CAM Cap Bank Calculator (XLSX)",
  description:
    "Track cumulative CAM cap bank balances across multiple lease years. See how unused capacity carries forward and how it affects future billing limits.",
  alternates: {
    canonical: buildSiteUrl("/tools/cumulative-cap-bank-calculator"),
  },
  openGraph: {
    title: "Free Cumulative CAM Cap Bank Calculator (XLSX)",
    description:
      "Track cumulative CAM cap bank balances across multiple lease years. See how unused capacity carries forward and how it affects future billing limits.",
    url: buildSiteUrl("/tools/cumulative-cap-bank-calculator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Cumulative CAM Cap Bank Calculator (XLSX)",
    description:
      "Track cumulative CAM cap bank balances across multiple lease years. See how unused capacity carries forward and how it affects future billing limits.",
  },
};

export default function CumulativeCapBankCalculatorPage() {
  return (
    <>
      <TrackToolPageView slug="cumulative-cap-bank-calculator" />
      <CumulativeCapBankCalculatorClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["cumulative-cap-bank-calculator"] ?? []}
        />
      </div>
    </>
  );
}
