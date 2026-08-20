import type { Metadata } from "next";
import { PricingContent } from "@/components/PricingContent";
import { PRICING_FAQS } from "@/data/pricing-faqs";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import { publicKnowledge } from "@/generated/public-knowledge";

const PRICING_TITLE = `CAM Reconciliation Software Pricing: ${publicKnowledge.pricing.display.trialTitleLabel}`;
const PRICING_DESC = `Limited offer pricing: ${publicKnowledge.pricing.display.tierPriceLabels.reconcile}. List price: $4,990/year for up to 25 rentable units. Start a ${publicKnowledge.pricing.display.trialLabel}. No credit card required.`;
const PRICING_URL = `${publicKnowledge.company.siteUrl}/pricing`;
const PRICING_LAST_UPDATED = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${publicKnowledge.pricing.lastUpdated}T00:00:00.000Z`));

export const metadata: Metadata = {
  title: PRICING_TITLE,
  description: PRICING_DESC,
  alternates: { canonical: PRICING_URL },
  openGraph: {
    title: PRICING_TITLE,
    description: PRICING_DESC,
    url: PRICING_URL,
    type: "website",
    images: [
      {
        url: `${publicKnowledge.company.siteUrl}/api/og?title=${encodeURIComponent(PRICING_TITLE)}&category=Pricing`,
        width: 1200,
        height: 630,
        alt: PRICING_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PRICING_TITLE,
    description: PRICING_DESC,
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: `${publicKnowledge.company.siteUrl}/`,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Pricing",
    },
  ],
};

export default function PricingPage() {
  const pricingSchema = structuredDataSchemas.pricingPage(PRICING_FAQS);

  return (
    <div className="min-h-screen pb-24">
      <JsonLd data={pricingSchema} />
      <JsonLd data={breadcrumbSchema} />
      <PricingContent />
      <p className="sr-only">
        <time dateTime={publicKnowledge.pricing.lastUpdated}>
          Last updated: {PRICING_LAST_UPDATED}
        </time>
      </p>
    </div>
  );
}
