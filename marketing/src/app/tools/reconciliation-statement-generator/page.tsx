import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { ReconciliationStatementGenerator } from "./ReconciliationStatementGeneratorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Tenant CAM Statement Outline",
  description:
    "Free CAM reconciliation statement template with California SB 1103 disclosure support and customizable expense categories. Enter your email and we send the download link.",
  alternates: {
    canonical: buildSiteUrl("/tools/reconciliation-statement-generator"),
  },
  openGraph: {
    title: "Free Tenant CAM Statement Outline",
    description:
      "Free CAM reconciliation statement template with California SB 1103 disclosure support and customizable expense categories. Enter your email and we send the download link.",
    url: buildSiteUrl("/tools/reconciliation-statement-generator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Tenant CAM Statement Outline",
    description:
      "Free CAM reconciliation statement template with California SB 1103 disclosure support and customizable expense categories. Enter your email and we send the download link.",
  },
};

export default function ReconciliationStatementGeneratorPage() {
  return (
    <>
      <TrackToolPageView slug="reconciliation-statement-generator" />
      <ReconciliationStatementGenerator />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={
            TOOL_RELATED_CONTENT["reconciliation-statement-generator"] ?? []
          }
        />
      </div>
    </>
  );
}
