import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { AdminFeeCalculatorClient } from "./AdminFeeCalculatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Admin Fee Calculator: Compare Gross, Net and Capped Methods",
  description:
    "Compare gross, net, and capped admin fee calculation methods side by side. See the dollar impact per tenant and spot gaps between your billings and your lease language.",
  alternates: {
    canonical: buildSiteUrl("/tools/admin-fee-calculator"),
  },
  openGraph: {
    title: "Admin Fee Calculator: Compare Gross, Net and Capped Methods",
    description:
      "Compare gross, net, and capped admin fee calculation methods side by side. See the dollar impact per tenant and spot gaps between your billings and your lease language.",
    url: buildSiteUrl("/tools/admin-fee-calculator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Admin Fee Calculator: Compare Gross, Net and Capped Methods",
    description:
      "Compare gross, net, and capped admin fee calculation methods side by side. See the dollar impact per tenant and spot gaps between your billings and your lease language.",
  },
};

export default function AdminFeeCalculatorPage() {
  return (
    <>
      <TrackToolPageView slug="admin-fee-calculator" />
      <AdminFeeCalculatorClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={TOOL_RELATED_CONTENT["admin-fee-calculator"] ?? []}
        />
      </div>
    </>
  );
}
