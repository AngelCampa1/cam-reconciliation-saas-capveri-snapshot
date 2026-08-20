import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { getAllSolutions } from "@/lib/content/pseo-data";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";

const SOLUTIONS_TITLE =
  "CAM Reconciliation Solutions for Every Workflow | CapVeri";
const SOLUTIONS_DESC =
  "CAM reconciliation workflows for commercial landlords and property teams. Verify year-end statements, portfolio controls, acquisition review, and tenant audit defense from ERP exports.";

export const metadata: Metadata = {
  title: { absolute: SOLUTIONS_TITLE },
  description: SOLUTIONS_DESC,
  alternates: { canonical: buildSiteUrl("/solutions") },
  openGraph: {
    title: SOLUTIONS_TITLE,
    description: SOLUTIONS_DESC,
    url: buildSiteUrl("/solutions"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CAM Reconciliation Solutions")}&category=Solutions`,
        ),
        width: 1200,
        height: 630,
        alt: SOLUTIONS_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SOLUTIONS_TITLE,
    description: SOLUTIONS_DESC,
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
      name: "Solutions",
    },
  ],
};

export default async function SolutionsIndexPage() {
  const solutions = await getAllSolutions();

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CAM Reconciliation Solutions",
    description:
      "Purpose-built solutions for common CAM reconciliation workflows in commercial real estate.",
    itemListElement: solutions.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.name,
      url: buildSiteUrl(`/solutions/${s.slug}`),
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
            className="mb-8 inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            CAM Reconciliation Workflows CapVeri Verifies
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            CapVeri checks the work your team already does. Upload an export
            from your ERP and verify year-end CAM statements, portfolio reviews,
            acquisition diligence, tenant audit defense, and ERP configuration.
          </p>
          <Link
            href={buildTrialLink({ content: "solutions_index_cta" })}
            className="mb-10 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors duration-200 hover:bg-primary/90"
          >
            Start free trial
          </Link>

          <div className="grid sm:grid-cols-2 gap-6">
            {solutions.map((item) => (
              <Link
                key={item.slug}
                href={`/solutions/${item.slug}`}
                className="block border rounded-lg p-6 hover:border-primary/50 transition-colors duration-200 no-underline group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold group-hover:text-primary transition-colors duration-200">
                    {item.name}
                  </h2>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-200 flex-shrink-0 ml-2" />
                </div>
                <p className="text-base text-muted-foreground">
                  {item.subheadline}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
