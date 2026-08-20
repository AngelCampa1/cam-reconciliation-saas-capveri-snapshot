import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ArrowRight, Download, Layout } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllTemplates } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildTrialLink } from "@/lib/auditLink";

export const metadata: Metadata = {
  title: "CAM Reconciliation Templates - Free Downloads",
  description:
    "Downloadable templates for CAM reconciliation statements, audit checklists, expense schedules, and demand letters.",
  alternates: { canonical: `${SITE_URL}/resources/templates` },
  openGraph: {
    title: "CAM Reconciliation Templates",
    description:
      "Downloadable templates for CAM reconciliation statements, audit checklists, expense schedules, and demand letters.",
    url: `${SITE_URL}/resources/templates`,
    type: "website",
  },
};

export default async function TemplatesHubPage() {
  const templates = await getAllTemplates();

  const itemListSchema = structuredDataSchemas.itemList({
    name: "CAM Reconciliation Templates",
    description:
      "Downloadable templates for CAM reconciliation statements, audit checklists, expense schedules, and demand letters.",
    items: templates.map((t) => ({
      name: t.name,
      url: `/resources/templates/${t.slug}`,
    })),
  });

  const faqSchema = structuredDataSchemas.faqPage([
    {
      question: "What templates do I need for CAM reconciliation?",
      answer:
        "The core templates for CAM reconciliation are: (1) a reconciliation statement template - the main document sent to tenants showing the true-up calculation; (2) an Excel workbook with formulas for pro-rata share, gross-up, and CAM cap calculations; (3) a checklist covering the full reconciliation process from GL export through tenant delivery; (4) a cover letter template for the annual CAM estimate; and (5) a dispute response template for when tenants challenge the reconciliation. Templates for specific states (California SB 1103, Texas HCAD) add jurisdiction-specific sections.",
    },
    {
      question: "Are CAM reconciliation templates available in Excel?",
      answer:
        "Yes. Several templates are available in Excel format with pre-built formulas for pro-rata share calculation, gross-up adjustment (variable expenses only), cumulative and non-cumulative CAM cap tracking, and true-up calculation. The Excel templates accept GL exports from Yardi, MRI, AppFolio, or any ERP system. For larger portfolios, CapVeri's automated reconciliation tool eliminates manual data entry entirely.",
    },
    {
      question:
        "Do I need a different CAM reconciliation template for California?",
      answer:
        "Yes, if your lease is subject to California's SB 1103. SB 1103 applies to commercial leases entered on or after January 1, 2025 with qualified small business tenants, and requires an itemized expense disclosure format with allocation-basis documentation that standard templates may not include. The California-specific template includes disclosure-support fields and tenant audit rights notice language for customer and counsel review.",
    },
    {
      question: "What should a CAM reconciliation statement include?",
      answer:
        "A complete CAM reconciliation statement should include: the property name, tenant name, lease reference, and reconciliation period; a recoverable expense summary with GL category breakdown; an exclusion schedule showing non-recoverable items removed; a gross-up calculation section (where applicable); the pro-rata share calculation with denominator definition; a CAM cap comparison (prior year vs. current); a summary of estimated payments received throughout the year; and the final true-up balance due or credit amount.",
    },
  ]);

  return (
    <ContentPageLayout pageName="Reconciliation Templates">
      <JsonLd data={itemListSchema} />
      <JsonLd data={faqSchema} />
      <div className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          CAM Reconciliation Templates
        </h1>
        <p className="text-lg text-muted-foreground mb-8 not-prose">
          Free, ready-to-use templates for every stage of CAM reconciliation -
          reconciliation statements, Excel workbooks with formulas, audit
          checklists, tenant letters, and dispute response templates. Each
          template includes state-specific variants where applicable and is
          compatible with Yardi, MRI, and any ERP GL export.
        </p>

        {/* Summary stats */}
        <div className="grid grid-cols-1 gap-4 mb-12 not-prose sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {templates.length}
            </div>
            <div className="font-medium text-sm mt-1">Templates</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Excel, PDF, and Word formats
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm mt-1">Free Download</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              No email required
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Layout className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm mt-1">State Variants</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              CA, TX, FL and more
            </div>
          </div>
        </div>

        {/* Template list */}
        <div className="grid gap-4 not-prose">
          {templates.map((template) => (
            <Link
              key={template.slug}
              href={`/resources/templates/${template.slug}`}
              className="flex items-start gap-4 rounded-lg border p-5 transition-colors duration-200 hover:bg-muted/50"
            >
              <div className="flex-shrink-0 mt-0.5">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{template.name}</span>
                  <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {template.description}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{template.format}</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>{template.sections.length} sections</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["templates"]}
        />

        {/* CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 mt-12 not-prose">
          <h2 className="text-lg font-bold mb-2">
            Skip the Template - Let CapVeri Do the Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Templates get you started, but CapVeri eliminates manual calculation
            entirely. Upload your GL export and CapVeri produces an audit-ready
            reconciliation statement with independent verification of every
            formula: gross-up, pro-rata, cap, and true-up. Start with a 30-day
            trial and no credit card.
          </p>
          <Link
            href={buildTrialLink({ content: "templates_hub_cta" })}
            className="inline-flex items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </ContentPageLayout>
  );
}
