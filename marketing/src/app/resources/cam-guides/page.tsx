import type { Metadata } from "next";
import { ResourceOrganizationHub } from "@/components/content/ResourceOrganizationHub";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "CAM Guides Hub | CapVeri Resources",
  description:
    "CAM reconciliation, charges, audit, dispute, workflow, and calculation resources organized as one hub.",
  alternates: { canonical: buildSiteUrl("/resources/cam-guides") },
};

export default function CamGuidesHubPage() {
  return <ResourceOrganizationHub hubId="cam-guides" />;
}
