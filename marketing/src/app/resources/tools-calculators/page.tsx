import type { Metadata } from "next";
import { ResourceOrganizationHub } from "@/components/content/ResourceOrganizationHub";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tools and Calculators Hub | CapVeri Resources",
  description:
    "Every CapVeri CAM calculator, worksheet, checklist, and related calculation guide in one hub.",
  alternates: {
    canonical: buildSiteUrl("/resources/tools-calculators"),
  },
};

export default function ToolsCalculatorsHubPage() {
  return <ResourceOrganizationHub hubId="tools-calculators" />;
}
