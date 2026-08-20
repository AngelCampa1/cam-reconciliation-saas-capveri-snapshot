import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { getAllGlossaryTerms, getGlossaryTerm } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";
import { GLOSSARY_ICP_CTAS } from "@/lib/content/content-map";
import {
  filterByRetainedSlugs,
  RETAINED_GLOSSARY_TERM_SLUGS,
} from "@/lib/seo/content-governance";

const TERM_ALIASES: Record<string, string> = {
  "gross-up": "gross-up-clause",
};

function resolveTermSlug(slug: string) {
  return TERM_ALIASES[slug] ?? slug;
}

interface Props {
  params: Promise<{ term: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const terms = filterByRetainedSlugs(
    await getAllGlossaryTerms(),
    RETAINED_GLOSSARY_TERM_SLUGS,
  );
  return [
    ...terms.map((t) => ({ term: t.slug })),
    ...Object.keys(TERM_ALIASES).map((term) => ({ term })),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { term: termSlug } = await params;
  const term = await getGlossaryTerm(resolveTermSlug(termSlug));
  if (!term) notFound();

  const title = `What is ${term.term}? | CAM Glossary | CapVeri`;
  const url = `${SITE_URL}/glossary/${term.slug}`;

  return {
    title,
    description: term.shortDefinition,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: term.shortDefinition,
      url,
      type: "article",
    },
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  "core-concepts": "Core Concepts",
  "lease-structures": "Lease Structures",
  calculations: "Calculations",
  compliance: "Compliance",
  "property-management": "Property Management",
  "financial-analysis": "Financial Analysis",
};

export default async function GlossaryTermPage({ params }: Props) {
  const { term: termSlug } = await params;
  const canonicalSlug = resolveTermSlug(termSlug);
  if (canonicalSlug !== termSlug) {
    permanentRedirect(`/glossary/${canonicalSlug}`);
  }

  const term = await getGlossaryTerm(canonicalSlug);
  if (!term) notFound();

  const allTerms = filterByRetainedSlugs(
    await getAllGlossaryTerms(),
    RETAINED_GLOSSARY_TERM_SLUGS,
  );
  const relatedTermObjects = term.relatedTerms
    .map((slug) => allTerms.find((t) => t.slug === slug))
    .filter(Boolean);

  const url = `${SITE_URL}/glossary/${term.slug}`;

  const definedTermSchema = structuredDataSchemas.definedTerm({
    name: term.term,
    description: term.definition,
    url,
  });

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Glossary",
        item: `${SITE_URL}/glossary`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: term.term,
        item: url,
      },
    ],
  };

  const auditLink = buildTrialLink({
    content: `glossary_${term.slug}`,
    campaign: "free_audit",
  });

  const icpCta = GLOSSARY_ICP_CTAS[termSlug];

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={definedTermSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="pt-16">
        <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="mb-8 text-sm text-muted-foreground"
          >
            <ol className="flex items-center gap-1.5">
              <li>
                <Link
                  href="/"
                  className="hover:text-foreground transition-colors duration-200"
                >
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href="/glossary"
                  className="hover:text-foreground transition-colors duration-200"
                >
                  Glossary
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-foreground font-medium">{term.term}</li>
            </ol>
          </nav>

          <article>
            {/* Category badge */}
            <div className="mb-4">
              <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                <BookOpen className="mr-1.5 h-3 w-3" aria-hidden="true" />
                {CATEGORY_LABELS[term.category] ?? term.category}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              What is {term.term}?
            </h1>

            {/* Short definition */}
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              {term.shortDefinition}
            </p>

            {/* Full definition */}
            <div className="mt-8 rounded-lg border border-border bg-muted/30 p-6">
              <h2 className="mb-3 text-lg font-semibold">Definition</h2>
              <p className="leading-relaxed text-foreground">
                {term.definition}
              </p>
            </div>

            {/* ICP-specific CTA */}
            {icpCta && (
              <div className="mt-8 rounded-lg border border-primary/20 bg-primary/5 p-5">
                <p className="text-sm text-muted-foreground mb-2">
                  {icpCta.context}
                </p>
                <Link
                  href={icpCta.href}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  {icpCta.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {/* Related terms */}
            {relatedTermObjects.length > 0 && (
              <div className="mt-10">
                <h2 className="mb-4 text-lg font-semibold">Related Terms</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {relatedTermObjects.map((related) => (
                    <Link
                      key={related!.slug}
                      href={`/glossary/${related!.slug}`}
                      className="flex items-center gap-2 rounded-full border border-border bg-background p-3 text-sm font-medium hover:bg-muted/50 transition-colors duration-200"
                    >
                      {related!.term}
                      <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Related resources */}
            {term.relatedResources.length > 0 && (
              <div className="mt-10">
                <RelatedContent
                  links={term.relatedResources.map((href) => ({
                    href,
                    label: slugToTitle(href),
                  }))}
                />
              </div>
            )}

            {/* Cross-site callout */}
            <div className="mt-10">
              <CrossSiteCallout />
            </div>

            {/* CTA - skip generic when ICP-specific CTA is shown */}
            {!icpCta && (
              <div className="mt-8 rounded-lg border border-primary/20 bg-primary/5 p-6">
                <h2 className="text-lg font-bold">
                  Validate Your CAM Reconciliations
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  CapVeri catches gross-up errors, cap violations, and billing
                  mistakes before tenants or auditors find them. Works from your
                  Yardi or MRI exports.
                </p>
                <Button asChild className="mt-4 w-full sm:w-auto">
                  <a href={auditLink}>Start free trial</a>
                </Button>
              </div>
            )}

            {/* Back to glossary */}
            <div className="mt-10 border-t border-border pt-6">
              <Link
                href="/glossary"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to CAM Glossary
              </Link>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
