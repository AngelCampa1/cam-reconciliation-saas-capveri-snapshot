import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { SB1103CheckerClient } from "./SB1103CheckerClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "SB 1103 Compliance Checker",
  description:
    "Find SB 1103 compliance gaps before a California tenant does. Get a prioritized checklist of disclosure issues, deadline risks, and CAM audit exposure.",
  alternates: {
    canonical: buildSiteUrl("/tools/sb-1103-checker"),
  },
  openGraph: {
    title: "SB 1103 Compliance Checker",
    description:
      "Find SB 1103 compliance gaps before a California tenant does. Get a prioritized checklist of disclosure issues, deadline risks, and CAM audit exposure.",
    url: buildSiteUrl("/tools/sb-1103-checker"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SB 1103 Compliance Checker",
    description:
      "Find SB 1103 compliance gaps before a California tenant does. Get a prioritized checklist of disclosure issues, deadline risks, and CAM audit exposure.",
  },
};

export default function SB1103CheckerPage() {
  return (
    <>
      <TrackToolPageView slug="sb-1103-checker" />
      <SB1103CheckerClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent links={TOOL_RELATED_CONTENT["sb-1103-checker"] ?? []} />
      </div>
    </>
  );
}
