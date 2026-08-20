import type { Metadata } from "next";
import { ResourceOrganizationHub } from "@/components/content/ResourceOrganizationHub";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Solutions Hub | CapVeri Resources",
  description:
    "CapVeri solutions, roles, software comparisons, alternatives, switching guides, ROI, and product evaluation resources.",
  alternates: { canonical: buildSiteUrl("/resources/solutions") },
};

export default function SolutionsResourceHubPage() {
  return <ResourceOrganizationHub hubId="solutions" />;
}
