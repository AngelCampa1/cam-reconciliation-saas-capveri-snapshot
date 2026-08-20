import type { Metadata } from "next";
import { ResourceOrganizationHub } from "@/components/content/ResourceOrganizationHub";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog and Research Hub | CapVeri Resources",
  description:
    "CapVeri blog posts, research references, glossary terms, sources, and resource family indexes organized as one hub.",
  alternates: {
    canonical: buildSiteUrl("/resources/blog-research"),
  },
};

export default function BlogResearchHubPage() {
  return <ResourceOrganizationHub hubId="blog-research" />;
}
