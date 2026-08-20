import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Users } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { getAllPersonas } from "@/lib/content/pseo-data";
import { buildTrialLink } from "@/lib/auditLink";

const FOR_TITLE = "CAM Reconciliation Built for Your Role | CapVeri";
const FOR_DESC =
  "See how CapVeri fits the work you actually do. Pages for property controllers, CFOs, lease administrators, property accountants, asset managers, and directors of property management.";

export const metadata: Metadata = {
  title: { absolute: FOR_TITLE },
  description: FOR_DESC,
  alternates: { canonical: `${SITE_URL}/for` },
  openGraph: {
    title: FOR_TITLE,
    description: FOR_DESC,
    url: `${SITE_URL}/for`,
    type: "website",
    images: [
      {
        url: `${SITE_URL}/api/og?title=${encodeURIComponent("CAM Reconciliation for Your Role")}&category=For%20Your%20Role`,
        width: 1200,
        height: 630,
        alt: FOR_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: FOR_TITLE,
    description: FOR_DESC,
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
      item: `${SITE_URL}/`,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "For Your Role",
    },
  ],
};

export default async function ForIndexPage() {
  const personas = await getAllPersonas();

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CAM Reconciliation by Role",
    description:
      "Role-specific pages showing how CapVeri helps each member of a commercial real estate finance and property management team.",
    itemListElement: personas.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: `${SITE_URL}/for/${p.slug}`,
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

          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              For Your Role
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            CAM Reconciliation for Your Role
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            Your part of CAM season looks nothing like the person down the hall.
            Pick your role. See how CapVeri catches the errors you get blamed
            for. See the hours it saves you every Q1. Every number is verified
            before a statement goes out.
          </p>

          <div className="grid sm:grid-cols-2 gap-6">
            {personas.map((item) => (
              <Link
                key={item.slug}
                href={`/for/${item.slug}`}
                className="block border rounded-lg p-6 hover:border-primary/50 transition-colors duration-200 no-underline group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold group-hover:text-primary transition-colors duration-200">
                    {item.role}
                  </h2>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-200 flex-shrink-0 ml-2" />
                </div>
                <p className="text-base text-muted-foreground">
                  {item.subheadline}
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
              <a href={buildTrialLink({ content: "for-index" })}>
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
