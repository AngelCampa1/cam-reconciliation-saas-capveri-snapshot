import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { MriRecoveryBillingQAChecklistClient } from "./MriRecoveryBillingQAChecklistClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free MRI Recovery Billing Error Checklist (PDF)",
  description:
    "A checklist for verifying MRI Software recovery billing calculations before tenant statements go out. Covers REMS Recovery module outputs, pool configuration, and gross-up verification.",
  alternates: {
    canonical: buildSiteUrl("/tools/mri-recovery-billing-qa-checklist"),
  },
  openGraph: {
    title: "Free MRI Recovery Billing Error Checklist (PDF)",
    description:
      "A checklist for verifying MRI Software recovery billing calculations before tenant statements go out. Covers REMS Recovery module outputs, pool configuration, and gross-up verification.",
    url: buildSiteUrl("/tools/mri-recovery-billing-qa-checklist"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free MRI Recovery Billing Error Checklist (PDF)",
    description:
      "A checklist for verifying MRI Software recovery billing calculations before tenant statements go out. Covers REMS Recovery module outputs, pool configuration, and gross-up verification.",
  },
};

export default function MriRecoveryBillingQAChecklistPage() {
  return (
    <>
      <TrackToolPageView slug="mri-recovery-billing-qa-checklist" />
      <MriRecoveryBillingQAChecklistClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={
            TOOL_RELATED_CONTENT["mri-recovery-billing-qa-checklist"] ?? []
          }
        />
      </div>
    </>
  );
}
