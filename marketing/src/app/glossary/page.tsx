import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { getAllGlossaryTerms } from "@/lib/content/pseo-data";
import type { GlossaryTermData } from "@/lib/content/pseo-types";
import { LAST_MODIFIED_BY_ROUTE } from "@/lib/seo/sitemap-dates";
import {
  filterByRetainedSlugs,
  RETAINED_GLOSSARY_TERM_SLUGS,
} from "@/lib/seo/content-governance";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";

const GLOSSARY_TITLE = "CAM Reconciliation Glossary: CRE FinOps Terms";
const GLOSSARY_DESC =
  "Plain-English definitions for the CAM and lease terms operators actually use: gross-up, pro-rata share, charge codes, recovery ratio, admin fees, and true-ups.";

export const metadata: Metadata = {
  title: GLOSSARY_TITLE,
  description: GLOSSARY_DESC,
  alternates: { canonical: buildSiteUrl("/glossary") },
  openGraph: {
    title: GLOSSARY_TITLE,
    description: GLOSSARY_DESC,
    url: buildSiteUrl("/glossary"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CAM Reconciliation Glossary")}&category=Glossary`,
        ),
        width: 1200,
        height: 630,
        alt: GLOSSARY_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: GLOSSARY_TITLE,
    description: GLOSSARY_DESC,
  },
};

const CATEGORY_LABELS: Record<GlossaryTermData["category"], string> = {
  "core-concepts": "Core Concepts",
  "lease-structures": "Lease Structures",
  calculations: "Calculations",
  compliance: "Compliance",
  "property-management": "Property Management",
  "financial-analysis": "Financial Analysis",
};

const CATEGORY_ORDER: GlossaryTermData["category"][] = [
  "core-concepts",
  "lease-structures",
  "calculations",
  "compliance",
  "property-management",
  "financial-analysis",
];

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
      name: "CAM Reconciliation Glossary",
    },
  ],
};

export default async function GlossaryPage() {
  const terms = filterByRetainedSlugs(
    await getAllGlossaryTerms(),
    RETAINED_GLOSSARY_TERM_SLUGS,
  );

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    author: { "@type": "Organization", name: "CapVeri" },
    datePublished: "2026-02-27",
    dateModified: LAST_MODIFIED_BY_ROUTE["/glossary"],
    mainEntity: terms.map((term) => ({
      "@type": "Question",
      name: `What is ${term.term}?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: term.definition,
      },
    })),
  };

  const itemListSchema = structuredDataSchemas.itemList({
    name: "CAM Reconciliation Glossary",
    description:
      "Curated glossary of CAM reconciliation, commercial lease, and CRE FinOps terminology.",
    items: terms.map((term) => ({
      name: term.term,
      url: `/glossary/${term.slug}`,
    })),
  });

  const definedTermSchema = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "CAM Reconciliation Glossary",
    url: buildSiteUrl("/glossary"),
    hasDefinedTerm: terms.map((term) => ({
      "@type": "DefinedTerm",
      name: term.term,
      description: term.definition,
      url: buildSiteUrl(`/glossary/${term.slug}`),
    })),
  };

  const grouped = new Map<GlossaryTermData["category"], GlossaryTermData[]>();
  for (const term of terms) {
    const existing = grouped.get(term.category) ?? [];
    existing.push(term);
    grouped.set(term.category, existing);
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={itemListSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={definedTermSchema} />
      <JsonLd data={breadcrumbSchema} />
      <div className="pt-16">
        <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>

          <article className="mt-8">
            <h1 className="text-3xl font-bold md:text-4xl">
              CAM Reconciliation Glossary
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              A curated glossary for the CAM terms property controllers, lease
              administrators, and asset managers use in live reconciliation
              work.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <time dateTime="2026-03-18">Updated March 2026</time>
            </p>
            <Link
              href={buildTrialLink({ content: "glossary_index_cta" })}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors duration-200 hover:bg-primary/90"
            >
              Start free trial
            </Link>

            <div className="mt-12 space-y-16">
              {CATEGORY_ORDER.map((category) => {
                const categoryTerms = grouped.get(category);
                if (!categoryTerms || categoryTerms.length === 0) {
                  return null;
                }

                return (
                  <section key={category}>
                    <h2 className="border-b border-border pb-2 text-2xl font-bold">
                      {CATEGORY_LABELS[category]}
                    </h2>
                    <div className="mt-8 space-y-10">
                      {categoryTerms.map((term) => (
                        <section key={term.slug} id={term.slug}>
                          <h3 className="text-xl font-semibold">
                            <Link
                              href={`/glossary/${term.slug}`}
                              className="transition-colors duration-200 hover:text-primary"
                            >
                              {term.term}
                            </Link>
                          </h3>
                          <p className="mt-3 leading-relaxed text-muted-foreground">
                            {term.definition}
                          </p>
                        </section>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="mt-16 border-t border-border pt-8">
              <h2 className="text-lg font-semibold">Related resources</h2>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="/resources/common-area-maintenance-reconciliation-explained"
                    className="text-sm text-primary hover:underline"
                  >
                    What is CAM Reconciliation? Full guide
                  </Link>
                </li>
                <li>
                  <Link
                    href="/resources/cam-gross-up-calculation-guide"
                    className="text-sm text-primary hover:underline"
                  >
                    CAM Gross-Up Calculation Guide
                  </Link>
                </li>
                <li>
                  <Link
                    href="/resources/cam-leakage-guide"
                    className="text-sm text-primary hover:underline"
                  >
                    CAM Leakage: The Hidden Revenue Drain
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog/cam-reconciliation-errors"
                    className="text-sm text-primary hover:underline"
                  >
                    Common CAM Reconciliation Errors
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog/boma-2024-changes"
                    className="text-sm text-primary hover:underline"
                  >
                    What changed in BOMA 2024
                  </Link>
                </li>
                <li>
                  <Link
                    href="/tools"
                    className="text-sm text-primary hover:underline"
                  >
                    Free CAM reconciliation calculators
                  </Link>
                </li>
                <li>
                  <Link
                    href="/resources/what-is-cre-finops"
                    className="text-sm text-primary hover:underline"
                  >
                    What is CRE FinOps?
                  </Link>
                </li>
              </ul>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
