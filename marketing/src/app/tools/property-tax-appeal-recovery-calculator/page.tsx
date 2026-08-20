import type { Metadata } from "next";
import { RelatedContent } from "@/components/content/RelatedContent";
import { TOOL_RELATED_CONTENT } from "@/lib/content/content-map";
import { PropertyTaxAppealRecoveryCalculatorClient } from "./PropertyTaxAppealRecoveryCalculatorClient";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Property Tax Appeal Impact Calculator (XLSX)",
  description:
    "Model the landlord-side impact of a successful property tax appeal: tenant credits required, net benefit after credits, and the 3-year lookback under applicable state rules.",
  alternates: {
    canonical: buildSiteUrl("/tools/property-tax-appeal-recovery-calculator"),
  },
  openGraph: {
    title: "Free Property Tax Appeal Impact Calculator (XLSX)",
    description:
      "Model the landlord-side impact of a successful property tax appeal: tenant credits required, net benefit after credits, and the 3-year lookback under applicable state rules.",
    url: buildSiteUrl("/tools/property-tax-appeal-recovery-calculator"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Property Tax Appeal Impact Calculator (XLSX)",
    description:
      "Model the landlord-side impact of a successful property tax appeal: tenant credits required, net benefit after credits, and the 3-year lookback under applicable state rules.",
  },
};

export default function PropertyTaxAppealRecoveryCalculatorPage() {
  return (
    <>
      <TrackToolPageView slug="property-tax-appeal-recovery-calculator" />
      <PropertyTaxAppealRecoveryCalculatorClient />
      <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8 max-w-5xl">
        <RelatedContent
          links={
            TOOL_RELATED_CONTENT["property-tax-appeal-recovery-calculator"] ??
            []
          }
        />
      </div>
    </>
  );
}
