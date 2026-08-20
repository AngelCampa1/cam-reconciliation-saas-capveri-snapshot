import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { AuditRiskScorecardClient } from "./AuditRiskScorecardClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pre-Send Audit Exposure Scorecard",
  description:
    "Score each tenant's audit risk. Find high-risk billing patterns, prioritize self-audit reviews, and flag common error patterns.",
  alternates: {
    canonical: buildSiteUrl("/tools/audit-risk-scorecard"),
  },
  openGraph: {
    title: "Pre-Send Audit Exposure Scorecard",
    description:
      "Score each tenant's audit risk. Find high-risk billing patterns, prioritize self-audit reviews, and flag common error patterns.",
    url: buildSiteUrl("/tools/audit-risk-scorecard"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pre-Send Audit Exposure Scorecard",
    description:
      "Score each tenant's audit risk. Find high-risk billing patterns, prioritize self-audit reviews, and flag common error patterns.",
  },
};

export default function AuditRiskScorecardPage() {
  return (
    <>
      <TrackToolPageView slug="audit-risk-scorecard" />
      <AuditRiskScorecardClient />
      <div className="container mx-auto px-4 pb-4 sm:px-6 lg:px-8 max-w-5xl">
        <p className="text-sm text-muted-foreground leading-relaxed">
          If you score high risk, tenants can run a full 14-rule CAM audit at{" "}
          <a
            href="https://www.camaudit.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            CAMAudit.io
          </a>
          .
        </p>
      </div>
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["audit-risk-scorecard"] ?? []}
        />
      </div>
    </>
  );
}
