import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { getAllAlternatives } from "@/lib/content/pseo-data";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";

const ALT_TITLE = "CAM Reconciliation Software Alternatives | CapVeri";
const ALT_DESC =
  "Compare alternatives to Yardi, MRI, AppFolio, Excel, and outsourced firms for CAM reconciliation. Find the right tool for your commercial real estate portfolio.";

export const metadata: Metadata = {
  title: { absolute: ALT_TITLE },
  description: ALT_DESC,
  alternates: { canonical: buildSiteUrl("/alternatives") },
  openGraph: {
    title: ALT_TITLE,
    description: ALT_DESC,
    url: buildSiteUrl("/alternatives"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CAM Reconciliation Software Alternatives")}&category=Alternatives`,
        ),
        width: 1200,
        height: 630,
        alt: ALT_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: ALT_TITLE,
    description: ALT_DESC,
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
      item: buildSiteUrl("/"),
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Alternatives",
    },
  ],
};

export default async function AlternativesIndexPage() {
  const alternatives = await getAllAlternatives();

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CAM Reconciliation Software Alternatives",
    description:
      "Alternatives to popular CAM reconciliation tools and approaches for commercial real estate landlords and property managers.",
    itemListElement: alternatives.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${a.competitorName} Alternatives`,
      url: buildSiteUrl(`/alternatives/${a.slug}`),
    })),
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={itemListSchema} />
      <JsonLd data={breadcrumbSchema} />
      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            CAM Reconciliation Software Alternatives
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            Need a different approach to CAM reconciliation? Compare
            purpose-built software, enterprise ERPs, and manual approaches. Find
            the right fit for your commercial real estate portfolio.
          </p>

          <div className="grid sm:grid-cols-2 gap-6">
            {alternatives.map((item) => (
              <Link
                key={item.slug}
                href={`/alternatives/${item.slug}`}
                className="block border rounded-lg p-6 hover:border-primary/50 transition-colors duration-200 no-underline group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold group-hover:text-primary transition-colors duration-200">
                    {item.competitorName} Alternatives
                  </h2>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-200 flex-shrink-0 ml-2" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.metaDescription}
                </p>
              </Link>
            ))}
          </div>

          <section className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center mt-12">
            <h2 className="text-2xl font-bold mb-3">
              See it on your own numbers
            </h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Upload one building&apos;s GL export. See what CapVeri finds in
              minutes.
            </p>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href={buildTrialLink({ content: "alternatives-index" })}>
                Start free trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
