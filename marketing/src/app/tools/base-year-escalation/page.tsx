import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { BaseYearEscalationClient } from "./BaseYearEscalationClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Base Year Escalation Calculator",
  description:
    "Project base year excess expense obligations over your lease term. Model CPI escalation scenarios and see cumulative tenant obligations by expense category.",
  alternates: {
    canonical: buildSiteUrl("/tools/base-year-escalation"),
  },
  openGraph: {
    title: "Base Year Escalation Calculator",
    description:
      "Project base year excess expense obligations over your lease term. Model CPI escalation scenarios and see cumulative tenant obligations by expense category.",
    url: buildSiteUrl("/tools/base-year-escalation"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Base Year Escalation Calculator",
    description:
      "Project base year excess expense obligations over your lease term. Model CPI escalation scenarios and see cumulative tenant obligations by expense category.",
  },
};

export default function BaseYearEscalationPage() {
  return (
    <>
      <TrackToolPageView slug="base-year-escalation" />
      <BaseYearEscalationClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["base-year-escalation"] ?? []}
        />
      </div>
    </>
  );
}
