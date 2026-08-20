import type { Metadata } from "next";

const TOOLS_TITLE = "CRE FinOps Tools for Commercial Real Estate";
const TOOLS_DESC =
  "Free CRE FinOps calculators, templates, and checklists for landlords: gross-up, CAM caps, BOMA 2024 rentable area, Yardi and MRI export QA, and more. Most need no signup.";

export const metadata: Metadata = {
  title: TOOLS_TITLE,
  description: TOOLS_DESC,
  alternates: { canonical: buildSiteUrl("/tools") },
  openGraph: {
    title: TOOLS_TITLE,
    description: TOOLS_DESC,
    url: buildSiteUrl("/tools"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("Free CRE FinOps Calculators for Landlords")}&category=Tool`,
        ),
        width: 1200,
        height: 630,
        alt: TOOLS_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TOOLS_TITLE,
    description: TOOLS_DESC,
  },
};

import Link from "next/link";
import { ArrowRight, Calculator, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

const toolsBreadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: buildSiteUrl("/") },
  { name: "Tools", url: buildSiteUrl("/tools") },
]);

const toolsFaqSchema = structuredDataSchemas.faqPage([
  {
    question: "Are CapVeri's tools free to use?",
    answer:
      "Yes. Every tool is free. Most work right away with no account or credit card. A few ask for your email to unlock the full financial breakdown.",
  },
  {
    question: "Do I need to sign up to use the CAM calculators?",
    answer:
      "Most tools need no signup. Enter your data and get results right away. A few ask for your email to show the full financial breakdown. You can also make a free account to save results or run a full reconciliation.",
  },
  {
    question: "What is a CAM gross-up calculator?",
    answer:
      "A CAM gross-up calculator models how variable operating expenses scale when occupancy is below 100%. Most NNN leases require landlords to gross-up variable expenses to a defined occupancy threshold (typically 90-95%) so tenants pay their proportionate share of a fully-occupied building's operating costs.",
  },
  {
    question: "How accurate is the CAM billing error estimator?",
    answer:
      "The estimator uses the same calculation engine as the paid CapVeri product. It estimates under-billing from your expense totals, occupancy, and area. CapVeri then checks both over-billing and under-billing in a full reconciliation.",
  },
  {
    question: "Can I use these tools with Yardi or MRI data?",
    answer:
      "Yes - export your GL as a CSV from any ERP (Yardi, MRI, AppFolio, RealPage, or any system with GL export functionality) and use that data as input for any of the calculators. No integration required.",
  },
]);

interface Tool {
  slug: string;
  title: string;
  description: string;
  tag: string;
  href: string;
  isDownload: boolean;
  buttonText: string;
  icon?: "calculator";
}

const TOOLS: Tool[] = [
  {
    slug: "hcad-tax-normalizer",
    title: "HCAD Tax Base Year Normalizer",
    description:
      "Texas landlords: won an ARB protest? See the tax adjustment and lease-cap effect before you bill.",
    tag: "Texas - Calculator",
    href: "/tools/hcad-tax-normalizer",
    isDownload: false,
    buttonText: "Calculate Tax Adjustment",
    icon: "calculator",
  },
  {
    slug: "boma-2024-calculator",
    title: "BOMA 2024 Rentable Area Calculator",
    description:
      "See how much hidden billable square footage BOMA 2024 unlocks for your building. Enter your existing measurements and outdoor tenant spaces - get SF impact instantly, financial projections with email.",
    tag: "BOMA 2024",
    href: "/tools/boma-2024-calculator",
    isDownload: false,
    buttonText: "Calculate My BOMA Impact",
    icon: "calculator",
  },
  {
    slug: "noi-impact-calculator",
    title: "NOI Impact Calculator",
    description:
      "See how CAM billing errors change your NOI and asset value. Enter portfolio size, CAM rate, and cap rate. See the dollar impact fast.",
    tag: "Calculator",
    href: "/tools/noi-impact-calculator",
    isDownload: false,
    buttonText: "Calculate My NOI Impact",
    icon: "calculator",
  },
  {
    slug: "cam-gross-up-calculator",
    title: "CAM Gross-Up Scenario Calculator",
    description:
      "Model gross-up expenses across 85%, 90%, 95%, and 100% occupancy thresholds. Separates fixed vs. variable expenses with per-tenant pro-rata allocation for up to 10 tenants.",
    tag: "Excel Download",
    href: "/tools/cam-gross-up-calculator",
    isDownload: true,
    buttonText: "Download the Template",
  },
  {
    slug: "lease-abstract-matrix",
    title: "Lease Abstract Discrepancy Matrix",
    description:
      "Track CAM caps, expense stops, and admin fee carve-outs across your portfolio. Auto-flags missing caps, stale reconciliations, and inconsistent data.",
    tag: "Excel Download",
    href: "/tools/lease-abstract-matrix",
    isDownload: true,
    buttonText: "Download the Matrix",
  },
  {
    slug: "cam-leakage-estimator",
    title: "CAM Billing Error Estimator",
    description:
      "Estimate likely CAM billing variance from building area, expense totals, and occupancy assumptions before you run a full reconciliation.",
    tag: "Calculator",
    href: "/tools/cam-billing-error-estimator",
    isDownload: false,
    buttonText: "Get your CAM estimate",
    icon: "calculator",
  },
  {
    slug: "cam-overcharge-calculator",
    title: "Tenant Challenge Exposure Calculator",
    description:
      "See which CAM packets are most likely to draw tenant objections before they go out. Check by lease size, CAM amount, cap terms, and error type.",
    tag: "Calculator",
    href: "/tools/cam-overcharge-calculator",
    isDownload: false,
    buttonText: "Check Challenge Risk",
    icon: "calculator",
  },
  {
    slug: "fixed-cam-vs-traditional",
    title: "Fixed CAM vs Traditional Reconciliation Modeler",
    description:
      "Compare tenant billing outcomes under traditional CAM reconciliation vs. a Fixed CAM structure (flat $/SF + annual escalator) over 3-5 years.",
    tag: "Calculator",
    href: "/tools/fixed-cam-vs-traditional",
    isDownload: false,
    buttonText: "Compare Billing Models",
    icon: "calculator",
  },
  {
    slug: "audit-risk-quiz",
    title: "Pre-Send Audit Exposure Quiz",
    description:
      "Answer a short set of operational questions and get a practical CAM audit risk score with recommended next actions.",
    tag: "Assessment",
    href: "/tools/audit-risk-quiz",
    isDownload: false,
    buttonText: "Get Risk Score",
    icon: "calculator",
  },
  {
    slug: "cam-cap-calculator",
    title: "CAM Cap Calculator",
    description:
      "Compare cumulative vs. non-cumulative caps with carry-forward tracking over a 5-year lease term. See how unused cap capacity banks and compounds.",
    tag: "Excel Download",
    href: "/tools/cam-cap-calculator",
    isDownload: true,
    buttonText: "Download Cap Calculator",
  },
  {
    slug: "pro-rata-calculator",
    title: "Pro-Rata Share Calculator",
    description:
      "Model pro-rata allocations across different denominator definitions - with and without anchor exclusions, gross-up adjustments, and vacancy handling.",
    tag: "Excel Download",
    href: "/tools/pro-rata-calculator",
    isDownload: true,
    buttonText: "Download Pro-Rata Calculator",
  },
  {
    slug: "cam-reconciliation-template",
    title: "CAM Reconciliation Template",
    description:
      "Pre-built reconciliation worksheet with gross-up, cap tracking, and pro-rata allocation tabs. Designed for Yardi and MRI GL exports.",
    tag: "Excel Download",
    href: "/tools/cam-reconciliation-template",
    isDownload: true,
    buttonText: "Download Reconciliation Template",
  },
  {
    slug: "reconciliation-statement-generator",
    title: "Reconciliation Statement Template",
    description:
      "Pre-formatted reconciliation statement template with California SB 1103 disclosure support, customizable expense categories, and professional presentation.",
    tag: "Excel Download",
    href: "/tools/reconciliation-statement-generator",
    isDownload: true,
    buttonText: "Download Statement Template",
  },
  {
    slug: "cam-estimate-forecaster",
    title: "CAM Estimate Forecaster",
    description:
      "Project next-year CAM estimates by expense category using CPI escalation, historical trends, and known mid-year changes.",
    tag: "Excel Download",
    href: "/tools/cam-estimate-forecaster",
    isDownload: true,
    buttonText: "Download Estimate Forecaster",
  },
  {
    slug: "recovery-gap-analyzer",
    title: "Billing Gap Analyzer",
    description:
      "Measure CAM billing variance in dollars and see the NOI and property value impact via cap rate multiplier.",
    tag: "Excel Download",
    href: "/tools/recovery-gap-analyzer",
    isDownload: true,
    buttonText: "Analyze Billing Gap",
  },
  {
    slug: "admin-fee-calculator",
    title: "Admin Fee Calculator",
    description:
      "Compare gross, net, and capped admin fee calculation methods side-by-side. See the dollar impact per tenant and identify optimization opportunities.",
    tag: "Excel Download",
    href: "/tools/admin-fee-calculator",
    isDownload: true,
    buttonText: "Download Admin Fee Calculator",
  },
  {
    slug: "base-year-escalation",
    title: "Base Year Escalation Calculator",
    description:
      "Project excess expense obligations over a lease term with CPI escalation scenarios. Compare base year vs. expense stop structures.",
    tag: "Excel Download",
    href: "/tools/base-year-escalation",
    isDownload: true,
    buttonText: "Download Escalation Calculator",
  },
  {
    slug: "sb-1103-checker",
    title: "SB 1103 Compliance Checker",
    description:
      "Answer 10 questions about your California commercial leases and get a compliance risk assessment with a prioritized action checklist.",
    tag: "Assessment",
    href: "/tools/sb-1103-checker",
    isDownload: true,
    buttonText: "Check SB 1103 Compliance",
  },
  {
    slug: "boma-remeasurement-impact",
    title: "BOMA Remeasurement Impact Calculator",
    description:
      "Project the NOI impact of remeasuring your building from BOMA 2017 to BOMA 2024 standards. See per-tenant share changes and revenue implications.",
    tag: "Excel Download",
    href: "/tools/boma-remeasurement-impact",
    isDownload: true,
    buttonText: "Calculate Remeasurement Impact",
  },
  {
    slug: "audit-risk-scorecard",
    title: "Pre-Send Audit Exposure Scorecard",
    description:
      "Score each tenant's audit vulnerability based on lease terms, billing complexity, and error risk patterns. Prioritize self-audit reviews.",
    tag: "Excel Download",
    href: "/tools/audit-risk-scorecard",
    isDownload: true,
    buttonText: "Download Risk Scorecard",
  },
  {
    slug: "cumulative-cap-bank-calculator",
    title: "Cumulative CAM Cap Bank Calculator",
    description:
      "Track cumulative CAM cap balances across lease years. See how unused cap capacity carries forward and limits future billing.",
    tag: "Excel Download",
    href: "/tools/cumulative-cap-bank-calculator",
    isDownload: true,
    buttonText: "Download Cap Bank Calculator",
  },
  {
    slug: "cam-recovery-ratio-worksheet",
    title: "CAM Billing Ratio Worksheet",
    description:
      "Find your CAM billing ratio. Compare it to property benchmarks. Spot lease terms that change the bill.",
    tag: "Excel Download",
    href: "/tools/cam-recovery-ratio-worksheet",
    isDownload: true,
    buttonText: "Download Billing Ratio Worksheet",
  },
  {
    slug: "lease-clause-extraction-matrix",
    title: "Lease Clause Extraction Matrix",
    description:
      "Abstract the 15 CAM-relevant lease clauses across your portfolio: denominators, gross-up thresholds, cap types, exclusions, and audit windows.",
    tag: "Excel Download",
    href: "/tools/lease-clause-extraction-matrix",
    isDownload: true,
    buttonText: "Download Lease Clause Matrix",
  },
  {
    slug: "property-tax-appeal-recovery-calculator",
    title: "Property Tax Appeal Impact Calculator",
    description:
      "Won a tax appeal? Model tenant credits, net benefit, and the 3-year lookback under state rules.",
    tag: "Excel Download",
    href: "/tools/property-tax-appeal-recovery-calculator",
    isDownload: true,
    buttonText: "Download Tax Appeal Calculator",
  },
  {
    slug: "yardi-export-qa-checklist",
    title: "Yardi Export Error Checklist",
    description:
      "Check your Yardi GL export before you reconcile. Catches CapEx miscoding, date range mismatches, and management fee errors.",
    tag: "Checklist",
    href: "/tools/yardi-export-qa-checklist",
    isDownload: true,
    buttonText: "Download Yardi QA Checklist",
  },
  {
    slug: "mri-recovery-billing-qa-checklist",
    title: "MRI CAM Billing QA Checklist",
    description:
      "Verify MRI CAM billing before statements go out. Covers REMS outputs, pool setup, and gross-up checks.",
    tag: "Checklist",
    href: "/tools/mri-recovery-billing-qa-checklist",
    isDownload: true,
    buttonText: "Download MRI QA Checklist",
  },
  {
    slug: "cam-pre-send-packet-checklist-download",
    title: "CAM Pre-Send Packet Checklist",
    description:
      "A 20-item check for CAM reconciliation statements. Catch the errors most likely to start a tenant dispute before you send.",
    tag: "Checklist",
    href: "/tools/cam-pre-send-packet-checklist-download",
    isDownload: true,
    buttonText: "Download Pre-Send Checklist",
  },
  {
    slug: "audit-defense-packet-builder",
    title: "CAM Audit Defense Packet Builder",
    description:
      "Assemble your CAM audit defense packet with a document index and per-item checklist for your GL, invoices, and workbooks.",
    tag: "Template",
    href: "/tools/audit-defense-packet-builder",
    isDownload: true,
    buttonText: "Download Audit Defense Template",
  },
  {
    slug: "tenant-dispute-response-letter-template",
    title: "Tenant CAM Dispute Response Letter",
    description:
      "A landlord response letter for tenant CAM disputes. Includes the calculation walkthrough, lease citations, and a counter-position framework.",
    tag: "Template",
    href: "/tools/tenant-dispute-response-letter-template",
    isDownload: true,
    buttonText: "Download Response Letter Template",
  },
  {
    slug: "multi-state-cam-disclosure-matrix",
    title: "Multi-State CAM Packet Review Checklist",
    description:
      "A state-by-state reference for CAM disclosure rules, statement deadlines, and tenant audit windows across the 15 largest CRE markets.",
    tag: "Compliance",
    href: "/tools/multi-state-cam-disclosure-matrix",
    isDownload: true,
    buttonText: "Download Disclosure Matrix",
  },
];

function ToolsHub() {
  return (
    <ToolPageLayout
      title="CRE FinOps Tools for Commercial Real Estate"
      description="Free tools for property controllers and CRE FinOps teams. Built for gross-up calculations, lease abstract tracking, and portfolio compliance."
      canonical={buildSiteUrl("/tools")}
      toolName="Tools"
      isHub
      structuredData={[
        toolsBreadcrumbSchema,
        toolsFaqSchema,
        structuredDataSchemas.webPage({
          name: TOOLS_TITLE,
          url: buildSiteUrl("/tools"),
          description: TOOLS_DESC,
          pageType: "CollectionPage",
          dateModified: "2026-06-20",
        }),
      ]}
    >
      {/* Hero */}
      <section className="bg-background pt-16 pb-8 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Free CRE FinOps Tools for Commercial Landlords
          </h1>
          <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            Built for CAM reconciliation teams. Most tools need no signup.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            <time dateTime="2026-06-20">Updated June 2026</time>
          </p>
        </div>
      </section>

      {/* Tool cards */}
      <section className="pt-6 pb-12 md:py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 max-w-4xl mx-auto">
            {TOOLS.map((tool) => (
              <div
                key={tool.slug}
                className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {tool.icon === "calculator" ? (
                      <Calculator className="h-3 w-3" />
                    ) : (
                      tool.isDownload && <Download className="h-3 w-3" />
                    )}
                    {tool.tag}
                  </span>
                </div>
                <h2 className="text-xl font-semibold mb-2">{tool.title}</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  {tool.description}
                </p>
                <Button asChild className="w-full">
                  <Link href={tool.href}>
                    {tool.buttonText}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-foreground text-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-lg text-background/80 mb-4">
            Still reconciling manually?
          </p>
          <Button asChild size="lg" variant="secondary">
            <Link href={`${buildTrialLink({ content: "u_cta" })}`}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </ToolPageLayout>
  );
}

export default ToolsHub;
