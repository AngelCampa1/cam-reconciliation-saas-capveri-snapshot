import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { Scale, ArrowRight, AlertTriangle, FileSearch } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllDisputeTypes } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildTrialLink } from "@/lib/auditLink";

export const metadata: Metadata = {
  title: "CAM Dispute Resolution Guides - Identify, Document & Resolve",
  description:
    "How to identify, document, and resolve common CAM billing disputes. Covers over-billing, exclusion violations, gross-up errors, and more.",
  alternates: { canonical: `${SITE_URL}/resources/cam-dispute` },
  openGraph: {
    title: "CAM Dispute Resolution Guides",
    description:
      "How to identify, document, and resolve common CAM billing disputes. Covers over-billing, exclusion violations, gross-up errors, and more.",
    url: `${SITE_URL}/resources/cam-dispute`,
    type: "website",
  },
};

export default async function CamDisputeHubPage() {
  const disputeTypes = await getAllDisputeTypes();

  const itemListSchema = structuredDataSchemas.itemList({
    name: "CAM Dispute Resolution Guides",
    description:
      "Guides for identifying, documenting, and resolving CAM billing disputes.",
    items: disputeTypes.map((d) => ({
      name: d.name,
      url: `/resources/cam-dispute/${d.slug}`,
    })),
  });

  const faqSchema = structuredDataSchemas.faqPage([
    {
      question: "What are the most common types of CAM billing disputes?",
      answer:
        "The most common CAM billing disputes involve: (1) excluded expenses being included in the recoverable pool (capital expenditures, management fee overages, or landlord-specific costs); (2) gross-up calculation errors (applying gross-up to fixed expenses or using the wrong occupancy figure); (3) CAM cap failures (not applying or mis-calculating cumulative caps); (4) pro-rata denominator errors (using a different denominator than the lease specifies); (5) base year expense misstatements (using estimated rather than actual base year figures).",
    },
    {
      question: "How do I dispute CAM charges as a tenant?",
      answer:
        "To dispute CAM charges: (1) review your lease's audit rights clause for the deadline (commonly 12–24 months after the reconciliation statement is delivered); (2) send a written audit request before the deadline via certified mail to the notice address in the lease; (3) request the full GL detail, invoices, gross-up workpaper, cap calculation, and pro-rata share documentation; (4) identify specific line-item discrepancies with lease provision references; (5) send a formal dispute letter itemizing each overcharge and the applicable lease section. Never rely on verbal communications. Everything must be in writing.",
    },
    {
      question: "What percentage of CAM reconciliations contain errors?",
      answer:
        "Industry sources commonly cite that around 40% of CAM reconciliations contain material errors, though the figure is widely repeated rather than tied to a single verified study. The dollar impact depends on your CAM pool size, lease mix, and controls. The most frequent errors are gross-up miscalculations, excluded expenses included in the pool, and CAM cap failures.",
    },
    {
      question: "How long do tenants have to audit CAM charges?",
      answer:
        "Most commercial leases grant tenants an audit window of 12–36 months from the date the annual reconciliation statement is delivered. This deadline is typically a hard cutoff. Missing it permanently waives the right to challenge that year's statement, regardless of how significant the overcharges may be. Some states have statutory audit rights that apply even if the lease is silent, but these vary by jurisdiction. Always track the delivery date of every reconciliation statement and set a calendar reminder for the audit deadline.",
    },
  ]);

  return (
    <ContentPageLayout pageName="CAM Dispute Resolution">
      <JsonLd data={itemListSchema} />
      <JsonLd data={faqSchema} />
      <div className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          CAM Dispute Resolution Guides
        </h1>
        <p className="text-lg text-muted-foreground mb-8 not-prose">
          CAM reconciliations often contain billing errors, from excluded
          expenses to gross-up mistakes. Whether you&apos;re a tenant spotting
          overcharges or a landlord building a defensible reconciliation, these
          guides cover every step: recognizing the signs of overbilling,
          exercising audit rights, documenting findings, and reaching
          resolution.
        </p>

        {/* Summary stats */}
        <div className="grid grid-cols-1 gap-4 mb-12 not-prose sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {disputeTypes.length}
            </div>
            <div className="font-medium text-sm mt-1">Dispute Guides</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Tenant and landlord perspectives
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm mt-1">Overbilling Patterns</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Most common errors and how to spot them
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FileSearch className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm mt-1">Audit Rights</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              How to exercise them before the window closes
            </div>
          </div>
        </div>

        {/* Dispute type list */}
        <div className="grid gap-4 not-prose">
          {disputeTypes.map((dispute) => (
            <Link
              key={dispute.slug}
              href={`/resources/cam-dispute/${dispute.slug}`}
              className="flex items-start gap-4 rounded-lg border p-5 transition-colors duration-200 hover:bg-muted/50"
            >
              <div className="flex-shrink-0 mt-0.5">
                <Scale className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{dispute.name}</span>
                  <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {dispute.subheadline}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{dispute.steps.length} steps documented</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>{dispute.commonMistakes.length} common mistakes</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["cam-dispute"]}
        />

        {/* CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 mt-12 not-prose">
          <h2 className="text-lg font-bold mb-2">
            Reconcile it right before tenants see it
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri runs your reconciliation against the lease. It checks
            excluded expenses, gross-up math, caps, and denominators, so every
            charge is right before the statement goes out. Your first
            reconciliation is free.
          </p>
          <Link
            href={buildTrialLink({ content: "cam_dispute_hub_cta" })}
            className="inline-flex items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </ContentPageLayout>
  );
}
