import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { TenantDisputeResponseLetterClient } from "./TenantDisputeResponseLetterClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Tenant CAM Dispute Response Letter (PDF)",
  description:
    "A professionally formatted landlord response letter for tenant CAM disputes. Includes the calculation walkthrough, lease language citations, and a counter-position framework.",
  alternates: {
    canonical: buildSiteUrl("/tools/tenant-dispute-response-letter-template"),
  },
  openGraph: {
    title: "Free Tenant CAM Dispute Response Letter (PDF)",
    description:
      "A professionally formatted landlord response letter for tenant CAM disputes. Includes the calculation walkthrough, lease language citations, and a counter-position framework.",
    url: buildSiteUrl("/tools/tenant-dispute-response-letter-template"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Tenant CAM Dispute Response Letter (PDF)",
    description:
      "A professionally formatted landlord response letter for tenant CAM disputes. Includes the calculation walkthrough, lease language citations, and a counter-position framework.",
  },
};

export default function TenantDisputeResponseLetterPage() {
  return (
    <>
      <TrackToolPageView slug="tenant-dispute-response-letter-template" />
      <TenantDisputeResponseLetterClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={
            TOOL_RELATED_CONTENT["tenant-dispute-response-letter-template"] ??
            []
          }
        />
      </div>
    </>
  );
}
