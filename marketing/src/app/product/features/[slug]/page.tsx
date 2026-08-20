import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Link2,
  SearchCheck,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import {
  FEATURE_LAST_MODIFIED,
  FEATURE_SITE_URL,
  featurePath,
  featureProblem,
  featureQueries,
  featureReviewChecklist,
  featureSolution,
  featureCloseFit,
  getFeatureByKey,
  getFeatureDomain,
  getRelatedFeatures,
  productFeatures,
} from "@/lib/product-features";
import { structuredDataSchemas } from "@/lib/structured-data";

type FeaturePageProps = {
  params: Promise<{ slug: string }>;
};

const RESOURCE_LINKS = [
  {
    href: "/cam-reconciliation-guide",
    label: "CAM reconciliation guide",
  },
  {
    href: "/product-tour",
    label: "Product tour",
  },
  {
    href: "/sample-report",
    label: "Sample report",
  },
  {
    href: "/pricing",
    label: "Pricing",
  },
] as const;

export function generateStaticParams() {
  return productFeatures.map((feature) => ({ slug: feature.key }));
}

export async function generateMetadata({
  params,
}: FeaturePageProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureByKey(slug);
  if (!feature) return {};

  return {
    title: `${feature.name} for CAM Reconciliation`,
    description: `${feature.name} in CapVeri for commercial landlords. ${feature.description}`,
    alternates: {
      canonical: `${FEATURE_SITE_URL}${featurePath(feature)}`,
    },
    openGraph: {
      title: `${feature.name} for CAM Reconciliation`,
      description: feature.description,
      url: `${FEATURE_SITE_URL}${featurePath(feature)}`,
      type: "website",
    },
  };
}

export default async function FeatureDetailPage({ params }: FeaturePageProps) {
  const { slug } = await params;
  const feature = getFeatureByKey(slug);
  if (!feature) notFound();

  const domain = getFeatureDomain(feature.domain);
  const relatedFeatures = getRelatedFeatures(feature);
  const problem = featureProblem(feature);
  const solution = featureSolution(feature);
  const queries = featureQueries(feature);
  const checklist = featureReviewChecklist(feature);
  const closeFit = featureCloseFit(feature);

  const pageSchema = structuredDataSchemas.webPage({
    name: `${feature.name} for CAM Reconciliation`,
    url: `${FEATURE_SITE_URL}${featurePath(feature)}`,
    description: feature.description,
    pageType: "WebPage",
    dateModified: FEATURE_LAST_MODIFIED,
  });

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What problem does ${feature.name} solve?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: problem,
        },
      },
      {
        "@type": "Question",
        name: `How does CapVeri handle ${feature.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: solution,
        },
      },
      {
        "@type": "Question",
        name: `Who uses ${feature.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: "Commercial landlords, property accountants, asset managers, and CRE operations teams use this feature. They need traceable CAM reconciliation support built from exported data and lease terms.",
        },
      },
    ],
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: FEATURE_SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Product features",
        item: `${FEATURE_SITE_URL}/product/features`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: feature.name,
        item: `${FEATURE_SITE_URL}${featurePath(feature)}`,
      },
    ],
  };

  return (
    <main className="bg-background">
      <JsonLd data={pageSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />

      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <Link
            href="/product/features"
            className="inline-flex min-h-11 items-center rounded-button px-0 text-sm font-semibold text-primary no-underline hover:underline"
          >
            Back to all features
          </Link>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                {domain.label}
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
                {feature.name} for CAM reconciliation
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                {feature.description}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/product-tour">
                    See it in the workflow
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/sample-report">View sample output</Link>
                </Button>
              </div>
            </div>

            <aside className="rounded-lg border bg-background p-5 shadow-sm">
              <p className="text-base font-semibold">What this feature does</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                CapVeri includes {feature.name.toLowerCase()} so property teams
                can review CAM charges from exported data, verified lease terms,
                and reproducible calculations before statements or audit support
                are sent.
              </p>
              <div className="mt-5 rounded-lg bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Plan tier
                </p>
                <p className="mt-1 text-lg font-bold capitalize">
                  {feature.tier}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-2xl font-bold tracking-tight">Problem</h2>
            </div>
            <p className="mt-4 leading-7 text-muted-foreground">{problem}</p>
          </article>

          <article className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2
                className="h-5 w-5 text-primary"
                aria-hidden="true"
              />
              <h2 className="text-2xl font-bold tracking-tight">Solution</h2>
            </div>
            <p className="mt-4 leading-7 text-muted-foreground">{solution}</p>
          </article>
        </div>

        <section className="mt-12 grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              How it fits the CAM close
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">{closeFit}</p>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              What it helps review
            </h2>
            <ul className="mt-4 space-y-3">
              {checklist.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm leading-6"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <section>
            <h2 className="text-2xl font-bold tracking-tight">
              Queries this page answers
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Common questions this feature page is built to answer.
            </p>
            <ul className="mt-5 space-y-3">
              {queries.map((query) => (
                <li
                  key={query}
                  className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm"
                >
                  <SearchCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{query}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">
              Where to go next
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {RESOURCE_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-lg border bg-card p-4 text-sm font-semibold text-card-foreground no-underline transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  {link.label}
                  <Link2 className="h-4 w-4 shrink-0 text-primary" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        {relatedFeatures.length > 0 ? (
          <section className="mt-14 border-t pt-10">
            <h2 className="text-2xl font-bold tracking-tight">
              Related CapVeri features
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedFeatures.map((related) => (
                <Link
                  key={related.key}
                  href={featurePath(related)}
                  className="group rounded-lg border bg-card p-5 text-card-foreground no-underline transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  <span className="text-base font-semibold">
                    {related.name}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                    {related.description}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Open feature
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
