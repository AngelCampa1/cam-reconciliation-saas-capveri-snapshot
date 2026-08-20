import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { LeaseAbstractMatrix } from "./LeaseAbstractMatrixClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Lease Abstract Discrepancy Matrix",
  description:
    "Track CAM caps, expense stops, base year provisions, and admin fee carve-outs. Portfolio matrix auto-flags missing lease protections before reconciliation.",
  alternates: {
    canonical: buildSiteUrl("/tools/lease-abstract-matrix"),
  },
  openGraph: {
    title: "Free Lease Abstract Discrepancy Matrix",
    description:
      "Track CAM caps, expense stops, base year provisions, and admin fee carve-outs. Portfolio matrix auto-flags missing lease protections before reconciliation.",
    url: buildSiteUrl("/tools/lease-abstract-matrix"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Lease Abstract Discrepancy Matrix",
    description:
      "Track CAM caps, expense stops, base year provisions, and admin fee carve-outs. Portfolio matrix auto-flags missing lease protections before reconciliation.",
  },
};

export default function LeaseAbstractMatrixPage() {
  return (
    <>
      <TrackToolPageView slug="lease-abstract-matrix" />
      <LeaseAbstractMatrix />
      <div className="container mx-auto px-4 pb-4 sm:px-6 lg:px-8 max-w-5xl">
        <p className="text-sm text-muted-foreground leading-relaxed">
          For automated extraction of all 126 commercial lease fields,{" "}
          <a
            href="https://www.lextract.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            Lextract.io
          </a>{" "}
          converts your lease PDF into structured data in seconds.
        </p>
      </div>
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["lease-abstract-matrix"] ?? []}
        />
      </div>
    </>
  );
}
