import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Calculator,
  AlertTriangle,
  Gavel,
  Server,
  BookOpen,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { JsonLd } from "@/components/JsonLd";
import { getAllLeaseClauses, getLeaseClause } from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ clause: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const clauses = await getAllLeaseClauses();
  return clauses.map((clause) => ({ clause: clause.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clause: clauseSlug } = await params;
  const clause = await getLeaseClause(clauseSlug);
  if (!clause) notFound();

  const title = `${clause.title} - Lease Language, Calculation & Billing Guide | CapVeri`;
  const description = `${clause.description} Model lease language variations, calculation methodology, common drafting errors, and Yardi/MRI billing system configuration.`;
  const url = `${SITE_URL}/resources/lease-clauses/${clause.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
    },
  };
}

export default async function LeaseClausePage({ params }: Props) {
  const { clause: clauseSlug } = await params;
  const clause = await getLeaseClause(clauseSlug);
  if (!clause) notFound();

  const url = `${SITE_URL}/resources/lease-clauses/${clause.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${clause.title} - Lease Language, Calculation & Billing Guide`,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    datePublished: "2026-03-17",
    dateModified: "2026-05-08",
    url,
    about: { "@type": "Thing", name: clause.title },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Resources",
        item: `${SITE_URL}/resources`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Lease Clauses",
        item: `${SITE_URL}/resources/lease-clauses`,
      },
      { "@type": "ListItem", position: 4, name: clause.title, item: url },
    ],
  };

  const variationColors: Record<string, string> = {
    "Landlord-Favorable": "border-destructive/30 bg-destructive/10",
    Balanced: "border-warning/30 bg-warning/10",
    "Tenant-Favorable": "border-success/30 bg-success/10",
  };

  const variationBadgeColors: Record<string, string> = {
    "Landlord-Favorable": "bg-destructive/20 text-destructive-strong",
    Balanced: "bg-warning/20 text-warning-foreground",
    "Tenant-Favorable": "bg-success/20 text-success-strong",
  };

  return (
    <ContentPageLayout
      pageName={clause.title}
      backHref="/resources/lease-clauses"
      backLabel="Lease Clauses"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {clause.title}
          </h1>
          <p className="text-lg text-muted-foreground">{clause.description}</p>
        </div>

        {/* Clause Variations */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Model Lease Language Variations
          </h2>
          <div className="space-y-4">
            {clause.variations.map((variation) => (
              <div
                key={variation.label}
                className={`rounded-lg border p-5 ${variationColors[variation.label] ?? "border-border"}`}
              >
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium mb-3 ${variationBadgeColors[variation.label] ?? "bg-muted text-muted-foreground"}`}
                >
                  {variation.label}
                </span>
                <div className="rounded-md border bg-background/80 p-4 mb-3">
                  <p className="text-sm italic leading-relaxed">
                    &ldquo;{variation.language}&rdquo;
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    {variation.interpretation}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Calculation Methodology */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <div className="flex items-start gap-3">
            <Calculator className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Calculation Methodology</h2>
              <p className="text-foreground whitespace-pre-line">
                {clause.calculationMethodology}
              </p>
            </div>
          </div>
        </div>

        {/* Drafting Errors */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Common Drafting Errors
          </h2>
          <div className="space-y-3">
            {clause.draftingErrors.map((error, i) => (
              <div key={i} className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-destructive/20 text-destructive-strong text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Relevant Cases */}
        {clause.relevantCases.length > 0 && (
          <div className="not-prose mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              Relevant Case Law
            </h2>
            <div className="space-y-4">
              {clause.relevantCases.map((c) => (
                <div key={c.citation} className="rounded-lg border p-4">
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-sm text-muted-foreground mb-2">
                    {c.citation} ({c.year})
                  </div>
                  <p className="text-sm">{c.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Billing System Implications */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <div className="flex items-start gap-3">
            <Server className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">
                Billing System Implications (Yardi / MRI)
              </h2>
              <p className="text-foreground">
                {clause.billingSystemImplications}
              </p>
            </div>
          </div>
        </div>

        {/* Reconciliation Controls */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <h2 className="text-xl font-bold mb-3">
            Reconciliation Controls for This Clause
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Treat the clause as a calculation control, not just legal text.
            Before issuing statements, translate it into fields your billing
            system can test consistently.
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              Capture the effective dates, tenant scope, and expense categories
              governed by the clause.
            </li>
            <li>
              Document whether the clause applies before or after gross-up,
              caps, and exclusions.
            </li>
            <li>
              Map the clause to the recovery pool, charge code, or manual
              adjustment field used in the ERP.
            </li>
            <li>
              Store the source lease section with the reconciliation support
              package.
            </li>
            <li>
              Test one tenant statement by hand when the clause changes during
              the year.
            </li>
          </ul>
        </div>

        {/* Notes */}
        {clause.notes && (
          <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-10">
            <h2 className="font-semibold mb-2">CapVeri Analysis</h2>
            <p className="text-muted-foreground">{clause.notes}</p>
          </div>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          links={
            clause.relatedResources && clause.relatedResources.length > 0
              ? [
                  ...clause.relatedResources.map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                  ...(clause.relatedTools ?? []).map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                ]
              : [
                  {
                    href: "/glossary/cam-reconciliation",
                    label: "What is CAM Reconciliation?",
                  },
                  {
                    href: "/resources/expenses/administrative-overhead",
                    label: "Administrative Expenses",
                  },
                  {
                    href: "/blog/cam-reconciliation-errors",
                    label: "Common CAM Reconciliation Errors",
                  },
                  {
                    href: "/tools/cam-cap-calculator",
                    label: "CAM Cap Calculator",
                  },
                ]
          }
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Validate Your Lease Compliance
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri catches gross-up errors, cap violations, and billing
            mistakes before tenants or auditors find them. Works from your Yardi
            or MRI exports.
          </p>
          <Link
            href="/pricing"
            className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </article>
    </ContentPageLayout>
  );
}
