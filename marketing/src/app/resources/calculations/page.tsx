import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, ArrowRight, FlaskConical, BookOpen } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllCalculations } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildTrialLink } from "@/lib/auditLink";

export const metadata: Metadata = {
  title: "CAM Calculation Scenarios - Worked Examples & Formulas",
  description:
    "Worked examples for gross-up, pro-rata, caps, and base year calculations. Covers common and edge-case scenarios for commercial landlords.",
  alternates: { canonical: `${SITE_URL}/resources/calculations` },
  openGraph: {
    title: "CAM Calculation Scenarios",
    description:
      "Worked examples for gross-up, pro-rata, caps, and base year calculations. Covers common and edge-case scenarios for commercial landlords.",
    url: `${SITE_URL}/resources/calculations`,
    type: "website",
  },
};

export default async function CalculationsHubPage() {
  const calculations = await getAllCalculations();

  const itemListSchema = structuredDataSchemas.itemList({
    name: "CAM Calculation Scenarios",
    description:
      "Worked examples for gross-up, pro-rata, caps, and base year calculations.",
    items: calculations.map((c) => ({
      name: c.name,
      url: `/resources/calculations/${c.slug}`,
    })),
  });

  const faqSchema = structuredDataSchemas.faqPage([
    {
      question: "How do you calculate a tenant's CAM pro-rata share?",
      answer:
        "A tenant's CAM pro-rata share is calculated by dividing the tenant's rentable square footage by the denominator square footage defined in the lease (typically total building RSF or leasable RSF), then multiplying that percentage by the total recoverable CAM expenses for the year. For example, a 5,000 SF tenant in a 50,000 SF building has a 10% pro-rata share and would owe 10% of the CAM pool.",
    },
    {
      question: "What is a CAM gross-up and how is it calculated?",
      answer:
        "A CAM gross-up normalizes variable operating expenses to a stabilized occupancy level - typically 90–95% of the building. Variable expenses (those that fluctuate with occupancy, like janitorial and utilities) are divided by actual weighted average occupancy and multiplied by the gross-up threshold. This prevents under-recovery when the building is partially vacant and ensures each tenant pays their fair share based on a full building scenario.",
    },
    {
      question:
        "What is the difference between a cumulative and non-cumulative CAM cap?",
      answer:
        "A cumulative CAM cap compounds from the base year - each year's ceiling is recalculated as base year expenses × (1 + cap %)^years, allowing unused cap room to carry forward. A non-cumulative CAM cap simply limits the increase from the prior year - if expenses fall in one year, the tenant gets no benefit in future years. Cumulative caps are more favorable to tenants; non-cumulative caps are more common in retail NNN leases.",
    },
    {
      question: "How does a base year CAM calculation work?",
      answer:
        "In a base year lease structure, the tenant only pays their pro-rata share of expenses that exceed the expenses incurred in a designated base year. The formula is: Tenant Share = (Current Year Expenses − Base Year Expenses) × (Tenant SF / Denominator SF). If current year expenses equal or fall below the base year, the tenant owes nothing in variable CAM for that year.",
    },
  ]);

  return (
    <ContentPageLayout pageName="CAM Calculation Scenarios">
      <JsonLd data={itemListSchema} />
      <JsonLd data={faqSchema} />
      <div className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          CAM Calculation Scenarios
        </h1>
        <p className="text-lg text-muted-foreground mb-8 not-prose">
          CAM reconciliation math is straightforward in concept but error-prone
          in practice. Each calculation type (gross-up, pro-rata, caps, base
          year, true-up) has its own formula, edge cases, and common mistakes.
          These worked examples walk through each one with exact formulas,
          variable definitions, and realistic scenarios.
        </p>

        {/* Summary stats */}
        <div className="grid grid-cols-1 gap-4 mb-12 not-prose sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {calculations.length}
            </div>
            <div className="font-medium text-sm mt-1">Calculation Guides</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              With formulas and worked examples
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm mt-1">Worked Examples</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Real numbers, step by step
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm mt-1">Common Mistakes</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Error patterns and how to avoid them
            </div>
          </div>
        </div>

        {/* Calculation list */}
        <div className="grid gap-4 not-prose">
          {calculations.map((calc) => (
            <Link
              key={calc.slug}
              href={`/resources/calculations/${calc.slug}`}
              className="flex items-start gap-4 rounded-lg border p-5 transition-colors duration-200 hover:bg-muted/50"
            >
              <div className="flex-shrink-0 mt-0.5">
                <Calculator className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{calc.name}</span>
                  <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {calc.subheadline}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{calc.steps.length} steps</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>{calc.commonMistakes.length} common mistakes</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["calculations"]}
        />

        {/* CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 mt-12 not-prose">
          <h2 className="text-lg font-bold mb-2">
            Let CapVeri Run the Numbers for You
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Every calculation scenario on this page is one CapVeri checks
            automatically: gross-up errors, cap failures, denominator
            mismatches, and base year deviations. Upload your GL export and get
            an audit-ready report in minutes. {TRIAL_COPY}, no credit card
            required.
          </p>
          <Link
            href={buildTrialLink({ content: "calculations_hub_cta" })}
            className="inline-flex items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </ContentPageLayout>
  );
}
