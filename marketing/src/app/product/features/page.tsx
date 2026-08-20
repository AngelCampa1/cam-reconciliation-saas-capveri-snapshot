import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers3, SearchCheck } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import {
  FEATURE_LAST_MODIFIED,
  FEATURE_SITE_URL,
  featurePath,
  productFeatureDomains,
  productFeatures,
} from "@/lib/product-features";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CapVeri Features for CAM Reconciliation",
  description:
    "Explore CapVeri features for ERP export ingestion, lease review, deterministic CAM calculations, tenant disputes, audit packets, and reporting.",
  alternates: {
    canonical: `${FEATURE_SITE_URL}/product/features`,
  },
  openGraph: {
    title: "CapVeri CAM Reconciliation Features",
    description:
      "A feature-by-feature guide to the CapVeri CAM reconciliation platform for commercial landlords and property teams.",
    url: `${FEATURE_SITE_URL}/product/features`,
    type: "website",
  },
};

const collectionSchema = structuredDataSchemas.webPage({
  name: "CapVeri CAM Reconciliation Features",
  url: `${FEATURE_SITE_URL}/product/features`,
  description:
    "Feature hub for CapVeri CAM reconciliation software, including ERP export ingestion, deterministic calculations, lease review, tenant dispute workflows, and reporting.",
  pageType: "CollectionPage",
  dateModified: FEATURE_LAST_MODIFIED,
});

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
  ],
};

export default function FeaturesPage() {
  return (
    <main className="bg-background">
      <JsonLd data={collectionSchema} />
      <JsonLd data={breadcrumbSchema} />

      <section className="border-b bg-muted/30">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Product features
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Every CapVeri feature solves a CAM close problem
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Commercial landlords do not need another system to replace the
              ERP. They need a verification layer that checks exported data,
              lease terms, calculations, statements, and tenant support before
              statements go out.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/product-tour">
                  See the workflow
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">Compare plans</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <SearchCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Built for fast answers
                </p>
                <p className="text-sm text-muted-foreground">
                  Each detail page covers the problem, the solution, an FAQ, and
                  links to related CAM resources.
                </p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Features
                </dt>
                <dd className="mt-1 text-3xl font-bold">
                  {productFeatures.length}
                </dd>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Domains
                </dt>
                <dd className="mt-1 text-3xl font-bold">
                  {productFeatureDomains.length}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight">
            Browse every feature page
          </h2>
          <p className="mt-3 text-muted-foreground">
            Each link opens a focused page with the operational problem, the
            CapVeri solution, related tools, and follow-up questions.
          </p>
        </div>

        <div className="mt-10 space-y-10">
          {productFeatureDomains.map((domain) => {
            const features = productFeatures.filter(
              (feature) => feature.domain === domain.id,
            );

            return (
              <section key={domain.id} aria-labelledby={`${domain.id}-heading`}>
                <div className="mb-4 flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Layers3 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3
                      id={`${domain.id}-heading`}
                      className="text-xl font-semibold"
                    >
                      {domain.label}
                    </h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {domain.summary}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {features.map((feature) => (
                    <Link
                      key={feature.key}
                      href={featurePath(feature)}
                      className="group flex min-h-44 flex-col rounded-lg border bg-card p-5 text-card-foreground no-underline transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {feature.tier}
                      </span>
                      <span className="mt-3 text-lg font-semibold leading-6">
                        {feature.name}
                      </span>
                      <span className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                        {feature.description}
                      </span>
                      <span
                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                        aria-label={`Read the ${feature.name} feature page`}
                      >
                        Read the feature page
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}
