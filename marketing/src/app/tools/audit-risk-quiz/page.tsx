import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { AuditRiskQuizPage } from "./AuditRiskQuizClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "CAM Audit Risk Score",
  description:
    "Find out how exposed your CAM process is to a tenant audit. Answer 10 questions and get an instant risk score with fixes.",
  alternates: {
    canonical: buildSiteUrl("/tools/audit-risk-quiz"),
  },
  openGraph: {
    title: "CAM Audit Risk Score",
    description:
      "Find out how exposed your CAM process is to a tenant audit. Answer 10 questions and get an instant risk score with fixes.",
    url: buildSiteUrl("/tools/audit-risk-quiz"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CAM Audit Risk Score",
    description:
      "Find out how exposed your CAM process is to a tenant audit. Answer 10 questions and get an instant risk score with fixes.",
  },
};

export default function AuditRiskQuizToolPage() {
  return (
    <>
      <TrackToolPageView slug="audit-risk-quiz" />
      <AuditRiskQuizPage />
      <div className="container mx-auto px-4 pb-12 pt-4 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent links={TOOL_RELATED_CONTENT["audit-risk-quiz"] ?? []} />
      </div>
    </>
  );
}
