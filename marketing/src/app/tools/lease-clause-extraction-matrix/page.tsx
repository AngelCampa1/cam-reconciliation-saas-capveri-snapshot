import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { LeaseClauseExtractionMatrixClient } from "./LeaseClauseExtractionMatrixClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Lease Clause Extraction Matrix (XLSX)",
  description:
    "A structured spreadsheet for abstracting the 15 CAM-relevant lease clauses across your portfolio. Covers denominators, gross-up thresholds, cap types, exclusions, and audit rights windows.",
  alternates: {
    canonical: buildSiteUrl("/tools/lease-clause-extraction-matrix"),
  },
  openGraph: {
    title: "Free Lease Clause Extraction Matrix (XLSX)",
    description:
      "A structured spreadsheet for abstracting the 15 CAM-relevant lease clauses across your portfolio. Covers denominators, gross-up thresholds, cap types, exclusions, and audit rights windows.",
    url: buildSiteUrl("/tools/lease-clause-extraction-matrix"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Lease Clause Extraction Matrix (XLSX)",
    description:
      "A structured spreadsheet for abstracting the 15 CAM-relevant lease clauses across your portfolio. Covers denominators, gross-up thresholds, cap types, exclusions, and audit rights windows.",
  },
};

export default function LeaseClauseExtractionMatrixPage() {
  return (
    <>
      <TrackToolPageView slug="lease-clause-extraction-matrix" />
      <LeaseClauseExtractionMatrixClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["lease-clause-extraction-matrix"] ?? []}
        />
      </div>
    </>
  );
}
