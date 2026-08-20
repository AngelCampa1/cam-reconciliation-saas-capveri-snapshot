import type { Metadata } from "next";
import { HelpCenterPage } from "./HelpCenterClient";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import { getAllFAQs, getFAQCount } from "@/data/faq-data";

const faqCount = getFAQCount();

export const metadata: Metadata = {
  title: "Help Center",
  description: `${faqCount} answers about CAM reconciliation, pricing, security, file uploads, and getting started with CapVeri.`,
  robots: {
    index: false,
    follow: true,
  },
};

export default function HelpPage() {
  const allFaqs = getAllFAQs();

  return (
    <>
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: "/" },
          { name: "Help Center", url: "/help" },
        ])}
      />
      <JsonLd data={structuredDataSchemas.faqPage(allFaqs)} />
      <HelpCenterPage />
    </>
  );
}
