import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { ProRataCalculator } from "./ProRataCalculatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Pro-Rata Share Calculator",
  description:
    "Compare pro-rata share allocations under different denominator definitions. Model gross-up impact, anchor exclusions, and per-tenant variance.",
  alternates: {
    canonical: buildSiteUrl("/tools/pro-rata-calculator"),
  },
  openGraph: {
    title: "Free Pro-Rata Share Calculator",
    description:
      "Compare pro-rata share allocations under different denominator definitions. Model gross-up impact, anchor exclusions, and per-tenant variance.",
    url: buildSiteUrl("/tools/pro-rata-calculator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Pro-Rata Share Calculator",
    description:
      "Compare pro-rata share allocations under different denominator definitions. Model gross-up impact, anchor exclusions, and per-tenant variance.",
  },
};

export default function ProRataCalculatorPage() {
  return (
    <>
      <TrackToolPageView slug="pro-rata-calculator" />
      <ProRataCalculator />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["pro-rata-calculator"] ?? []}
        />
      </div>
    </>
  );
}
