import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Scale,
  Clock,
  FileSearch,
  FileText,
  AlertTriangle,
  Gavel,
  Building2,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { JsonLd } from "@/components/JsonLd";
import { getAllStates, getState } from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ state: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const states = await getAllStates();
  return states.map((state) => ({ state: state.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug } = await params;
  const state = await getState(stateSlug);
  if (!state) notFound();

  const title = `${state.name} CAM Reconciliation Compliance Guide for Landlords | CapVeri`;
  const description = `${state.name} commercial lease CAM compliance: statutory requirements, tenant audit rights, reconciliation deadlines, and penalty provisions. Landlord obligations guide.`;
  const url = `${SITE_URL}/resources/states/${state.slug}/cam-compliance`;

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

export default async function StateCompliancePage({ params }: Props) {
  const { state: stateSlug } = await params;
  const state = await getState(stateSlug);
  if (!state) notFound();

  const url = `${SITE_URL}/resources/states/${state.slug}/cam-compliance`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${state.name} CAM Reconciliation Compliance Guide for Landlords`,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    datePublished: "2026-03-17",
    dateModified: "2026-03-17",
    url,
    about: {
      "@type": "State",
      name: state.name,
      sameAs: `https://en.wikipedia.org/wiki/${state.name.replace(/ /g, "_")}`,
    },
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
        name: "State Compliance",
        item: `${SITE_URL}/resources/states`,
      },
      { "@type": "ListItem", position: 4, name: `${state.name}`, item: url },
    ],
  };

  const complexityColors = {
    high: "bg-destructive/10 text-destructive-strong",
    medium: "bg-warning/10 text-warning-foreground",
    low: "bg-success/10 text-success-strong",
  };

  const sections = [
    {
      icon: Clock,
      title: "Reconciliation Timing Requirements",
      content: state.reconciliationTiming,
      empty: "No statutory deadline",
    },
    {
      icon: FileSearch,
      title: "Tenant Audit Rights",
      content: state.tenantAuditRights,
      empty: "No statutory audit rights",
    },
    {
      icon: FileText,
      title: "Required Disclosures",
      content: state.requiredDisclosures,
      empty: "No statutory disclosure requirements",
    },
    {
      icon: AlertTriangle,
      title: "Penalty Provisions",
      content: state.penalties,
      empty: "No CAM-specific penalties",
    },
  ];

  return (
    <ContentPageLayout
      pageName={`${state.name} CAM Compliance`}
      backHref="/resources/states"
      backLabel="State Compliance"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${complexityColors[state.complianceComplexity]}`}
            >
              {state.complianceComplexity.charAt(0).toUpperCase() +
                state.complianceComplexity.slice(1)}
              {""}
              Compliance Complexity
            </span>
            <span className="text-sm text-muted-foreground">
              {state.abbreviation}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {state.name} CAM Reconciliation Compliance Guide for Landlords
          </h1>
          <p className="text-lg text-muted-foreground">
            Statutory requirements, tenant audit rights, and landlord
            obligations for commercial CAM reconciliation in {state.name}.
          </p>
        </div>

        {/* Primary Statute */}
        <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
          <div className="flex items-start gap-3">
            <Scale className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-1">
                Primary Statute
              </h2>
              <p className="font-medium">
                {state.primaryStatute ??
                  "No CAM-specific statute - governed by lease terms and general contract law"}
              </p>
            </div>
          </div>
        </div>

        {/* Key Takeaway */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-8">
          <h2 className="font-semibold mb-2">Key Takeaway for Landlords</h2>
          <p className="text-muted-foreground">
            {state.keyTakeawayForLandlords}
          </p>
        </div>

        {/* Compliance Sections */}
        <div className="not-prose space-y-6 mb-10">
          {sections.map((section) => {
            const Icon = section.icon;
            const hasContent =
              section.content &&
              section.content !==
                "No statutory audit rights for commercial tenants." &&
              section.content !==
                "No statutory disclosure requirements for commercial CAM reconciliation." &&
              section.content !== "No CAM-specific penalties.";
            return (
              <div key={section.title} className="rounded-lg border p-5">
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <h2 className="font-semibold mb-2">{section.title}</h2>
                    <p
                      className={
                        hasContent
                          ? "text-foreground"
                          : "text-muted-foreground italic"
                      }
                    >
                      {section.content ?? section.empty}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Case Law */}
        {state.caseLaw.length > 0 && (
          <div className="not-prose mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              Notable Case Law
            </h2>
            <div className="space-y-4">
              {state.caseLaw.map((c) => (
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

        {/* Regulatory Body */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-1">
                Regulatory Body
              </h2>
              <p className="font-medium">{state.regulatoryBody}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {state.notes && (
          <div className="not-prose mb-10">
            <h2 className="text-xl font-bold mb-3">{state.name} CAM Context</h2>
            <p className="text-muted-foreground">{state.notes}</p>
          </div>
        )}

        {/* Qualified Tenant Definition & Statute Effective Date */}
        {state.qualifiedTenantDefinition && (
          <div className="not-prose mt-6 rounded-lg border border-primary/20 bg-primary/5 p-5 mb-6">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              Qualified Tenant Definition
            </h3>
            <p className="text-sm text-muted-foreground">
              {state.qualifiedTenantDefinition}
            </p>
          </div>
        )}
        {state.statuteEffectiveDate && (
          <p className="not-prose text-xs text-muted-foreground mt-3 mb-10">
            Statute effective: {state.statuteEffectiveDate}
          </p>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          links={
            state.relatedResources && state.relatedResources.length > 0
              ? [
                  ...state.relatedResources.map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                  ...(state.relatedTools ?? []).map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                ]
              : [
                  {
                    href: "/resources/lease-clauses/cumulative-cam-cap",
                    label: "CAM Cap Lease Clause Guide",
                  },
                  {
                    href: "/resources/lease-clauses/expense-stop",
                    label: "Base Year Expense Stop",
                  },
                  {
                    href: "/blog/cam-reconciliation-deadlines",
                    label: "CAM Reconciliation Deadlines",
                  },
                  {
                    href: "/tools/sb-1103-checker",
                    label: "SB-1103 Compliance Checker",
                  },
                  {
                    href: "/tools/audit-risk-quiz",
                    label: "CAM Audit Risk Assessment",
                  },
                ]
          }
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Validate Your {state.name} Reconciliations
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
