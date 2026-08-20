import type { Metadata } from "next";
import { ResourceOrganizationHub } from "@/components/content/ResourceOrganizationHub";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Compliance and Leases Hub | CapVeri Resources",
  description:
    "State CAM compliance, BOMA, lease clauses, lease types, recoverable expenses, and market guides organized as one hub.",
  alternates: {
    canonical: buildSiteUrl("/resources/compliance-leases"),
  },
};

export default function ComplianceLeasesHubPage() {
  return <ResourceOrganizationHub hubId="compliance-leases" />;
}
