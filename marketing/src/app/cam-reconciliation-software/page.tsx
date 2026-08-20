import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getVideoForPlacement } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";
import {
  ArrowRight,
  CheckCircle,
  XCircle,
  Minus,
  Calculator,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  FileSearch,
  Scale,
  Upload,
  HelpCircle,
  Building2,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";

export const metadata: Metadata = {
  title: "CAM Reconciliation Software | Verify Common Area Maintenance Billing",
  description:
    "CAM reconciliation software for landlords: verify gross-up calculations, cap enforcement, pro-rata validation, and CapEx treatment before statements go to tenants.",
  alternates: {
    canonical: `${SITE_URL}/cam-reconciliation-software`,
  },
  openGraph: {
    title: "CAM Reconciliation Software",
    description:
      "Verify CAM reconciliation for commercial real estate with deterministic financial math and full audit trails.",
    url: `${SITE_URL}/cam-reconciliation-software`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CAM Reconciliation Software",
    description:
      "Verify CAM reconciliation for commercial real estate with deterministic financial math and full audit trails.",
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CapVeri CAM Reconciliation Software",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "CAM reconciliation software that automates gross-up calculations, cap enforcement, pro-rata share validation, and CapEx detection for commercial real estate landlords and property managers. Deterministic financial math with full audit trails.",
  url: `${SITE_URL}/cam-reconciliation-software`,
  offers: publicKnowledge.structuredData.pricingOffers,
  featureList:
    "Gross-up automation; CAM cap enforcement (cumulative and non-cumulative); Pro-rata share validation; CapEx detection and reclassification; Complete audit trail with GL-to-lease traceability; BOMA 2024 aligned checks",
  publisher: {
    "@type": "Organization",
    name: "CapVeri",
    url: SITE_URL,
  },
};

const productSchema = structuredDataSchemas.product({
  name: "CapVeri CAM Reconciliation Software",
  description: softwareSchema.description,
  url: `${SITE_URL}/cam-reconciliation-software`,
});

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is CAM reconciliation software?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM reconciliation software automates the process of verifying Common Area Maintenance charges billed to commercial tenants against actual expenses, lease terms, and accounting records. It replaces manual spreadsheet work with deterministic calculations that enforce gross-up rules, expense caps, pro-rata share formulas, and exclusion clauses defined in each lease.",
      },
    },
    {
      "@type": "Question",
      name: "How does CapVeri find CAM billing errors?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri ingests your GL export (from Yardi, MRI, RealPage, or any CSV) and your lease terms, then runs deterministic financial calculations: gross-up normalization, cap enforcement, pro-rata share validation, CapEx reclassification, and expense exclusion checks. Every discrepancy is flagged with the exact GL line, lease clause, and dollar impact.",
      },
    },
    {
      "@type": "Question",
      name: "Does CapVeri integrate with Yardi and MRI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri needs no integration. Instead of expensive API connections, it reads standard CSV and Excel exports from Yardi Voyager, MRI Software, RealPage, AppFolio, and any other property management system. This works with every system version, including older on-premise setups, and avoids integration fees.",
      },
    },
    {
      "@type": "Question",
      name: "How much does CAM reconciliation software cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `${publicKnowledge.pricing.display.selfServeSummary}. ${publicKnowledge.pricing.display.trialCopy} ${publicKnowledge.pricing.enterpriseThreshold.summary}`,
      },
    },
    {
      "@type": "Question",
      name: "What is gross-up in CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Gross-up adjusts variable operating expenses to reflect what they would be at a specified occupancy level (typically 95%). When a building is partially vacant, landlords incur lower variable costs but are contractually entitled to recover expenses as if the building were occupied to the lease-defined threshold. Getting the gross-up threshold wrong is one of the most common sources of CAM billing errors.",
      },
    },
    {
      "@type": "Question",
      name: "Can CapVeri handle cumulative and non-cumulative CAM caps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. CapVeri enforces both cumulative caps (which compound year-over-year from a base year) and non-cumulative caps (which reset each year). It also correctly separates controllable from uncontrollable expenses before applying the cap, since caps typically apply only to controllable costs while taxes and insurance pass through uncapped.",
      },
    },
    {
      "@type": "Question",
      name: "How long does a CAM reconciliation take with CapVeri?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Timing depends on portfolio size, export quality, and how many lease terms need review. CapVeri keeps the process structured: upload the GL export, confirm lease terms, run deterministic checks, and focus review time on the exceptions that matter.",
      },
    },
    {
      "@type": "Question",
      name: "How does CapVeri support BOMA standards?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri supports BOMA 2024 aligned workflows for measurement standards and expense classification. The platform flags items for review and keeps lease terms as the source for billing rights.",
      },
    },
  ],
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    {
      "@type": "ListItem",
      position: 2,
      name: "CAM Reconciliation Software",
      item: `${SITE_URL}/cam-reconciliation-software`,
    },
  ],
};

const FEATURES = [
  {
    icon: Calculator,
    title: "Gross-Up Automation",
    description:
      "Automatically normalizes variable operating expenses to the lease-defined occupancy threshold. Handles 90%, 95%, and custom thresholds per tenant with deterministic math. No AI guesswork on financial calculations.",
  },
  {
    icon: ShieldCheck,
    title: "Cap Enforcement",
    description:
      "Enforces cumulative and non-cumulative CAM caps, separating controllable from uncontrollable expenses before applying the limit. Catches the most common overbilling error in commercial leases.",
  },
  {
    icon: Scale,
    title: "Pro-Rata Validation",
    description:
      "Validates pro-rata share calculations against the lease-defined denominator (total leasable RSF vs. building RSF). Flags share percentages that don't match the stated square footage.",
  },
  {
    icon: AlertTriangle,
    title: "CapEx Detection",
    description:
      "Identifies capital expenditures misclassified as operating expenses in the GL export. CapEx items like roof replacements and HVAC systems are typically excluded from recoverable CAM. Catching them prevents tenant disputes.",
  },
  {
    icon: FileSearch,
    title: "Audit Trail",
    description:
      "Every reconciled figure traces back to a specific GL line item and lease clause. When tenants exercise audit rights, you have a defensible record that shows exactly how each charge was calculated.",
  },
  {
    icon: Building2,
    title: "BOMA 2024 Alignment",
    description:
      "Validates expense classifications and area measurements against BOMA 2024 aligned workflows. Flags items for review before they become billing disputes or audit findings.",
  },
];

const COMPARISON_ROWS = [
  {
    feature: "Gross-up calculation",
    capveri: "check",
    excel: "Manual formula",
    erp: "Basic",
    outsourced: "check",
  },
  {
    feature: "Cumulative cap enforcement",
    capveri: "check",
    excel: "Error-prone",
    erp: "none",
    outsourced: "check",
  },
  {
    feature: "Pro-rata validation",
    capveri: "check",
    excel: "Manual",
    erp: "Basic",
    outsourced: "check",
  },
  {
    feature: "CapEx detection",
    capveri: "check",
    excel: "none",
    erp: "none",
    outsourced: "partial",
  },
  {
    feature: "GL-to-lease traceability",
    capveri: "check",
    excel: "none",
    erp: "partial",
    outsourced: "none",
  },
  {
    feature: "Time per building",
    capveri: "~15 min",
    excel: "4-8 hours",
    erp: "1-2 hours",
    outsourced: "2-4 weeks",
  },
  {
    feature: "Cost per building",
    capveri: `Annual self-serve pricing from ${publicKnowledge.pricing.display.tierAnnualPriceLabels.reconcile}`,
    excel: "$500+ labor",
    erp: "$5K-$25K/yr module",
    outsourced: "$2K-$5K each",
  },
  {
    feature: "Works with any PMS",
    capveri: "check",
    excel: "check",
    erp: "Same vendor only",
    outsourced: "check",
  },
];

function ComparisonCell({ value }: { value: string }) {
  if (value === "check") {
    return <CheckCircle className="h-5 w-5 text-success" />;
  }
  if (value === "none") {
    return <XCircle className="h-5 w-5 text-destructive" />;
  }
  if (value === "partial") {
    return <Minus className="h-5 w-5 text-warning" />;
  }
  return <span className="text-sm">{value}</span>;
}

export default async function CamReconciliationSoftwarePage() {
  const heroCtaLink = buildTrialLink({
    content: "cam-reconciliation-software-hero",
  });
  const bottomCtaLink = buildTrialLink({
    content: "cam-reconciliation-software-bottom",
  });
  const video = await getVideoForPlacement("cam-reconciliation-software");

  return (
    <div className="pb-24">
      <JsonLd data={softwareSchema} />
      <JsonLd data={productSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="flex flex-col">
        {/* Hero */}
        <section className="border-b bg-gradient-to-b from-primary/5 to-background py-16 md:py-24">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
                <Calculator className="h-3.5 w-3.5 mr-1.5" />
                CRE FinOps Platform
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              CAM Reconciliation Software for Pre-Statement Verification
            </h1>
            <p className="text-xl text-muted-foreground mb-3 max-w-3xl">
              CapVeri verifies the financial math behind Common Area Maintenance
              billing: gross-up calculations, cap enforcement, pro-rata
              validation, and CapEx treatment before statements go to tenants.
            </p>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              CapVeri verifies CAM output. It does not replace your ERP,
              tenant-side accounting, legal interpretation, or outsourced
              capacity.
            </p>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-8 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                What it does
              </p>
              <p className="text-sm text-foreground">
                CAM reconciliation software verifies that Common Area
                Maintenance charges billed to tenants match actual expenses,
                lease terms, and BOMA standards. CapVeri replaces manual
                spreadsheet reconciliation with deterministic calculations that
                trace every charge to a GL line item and lease clause.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href={heroCtaLink}
                className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start {TRIAL_COPY}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>

        {/* Problem Statement */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Why Manual CAM Reconciliation Fails
            </h2>
            <p className="text-muted-foreground mb-8">
              Spreadsheet-based reconciliation is slow, error-prone, and
              impossible to audit. Here is what goes wrong.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  title: "Gross-up errors compound silently",
                  body: "Applying 90% when the lease says 95% understates the normalized expense pool. At $500K of variable expenses and 78% occupancy, that single misread drives a $14,000 billing error. It repeats every year until someone catches it.",
                },
                {
                  title: "Cap calculations break in spreadsheets",
                  body: "Cumulative caps compound from a base year. Non-cumulative caps reset annually. Most spreadsheets use the same formula for both, silently overbilling or underbilling tenants for the life of the lease.",
                },
                {
                  title: "CapEx leaks into recoverable expenses",
                  body: "A $180K roof replacement coded to a maintenance GL account passes straight through to tenant bills. Without systematic CapEx detection, these misclassifications trigger disputes, refund requests, and audit findings.",
                },
                {
                  title: "No traceability when tenants audit",
                  body: "When a tenant exercises audit rights, you need to show exactly how every charge was calculated: which GL lines, which lease clause, which occupancy rate. Spreadsheets can't produce that trail without hours of reconstruction.",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="rounded-md border border-warning/30 bg-warning/10 p-4"
                >
                  <p className="font-semibold text-warning-foreground mb-1 text-sm">
                    {item.title}
                  </p>
                  <p className="text-sm text-warning-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Six Calculations That Replace Your Spreadsheet
            </h2>
            <p className="text-muted-foreground mb-8">
              Every calculation uses deterministic financial math. No AI
              approximation on the numbers that determine what tenants owe.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map(({ icon: Icon, title, description }, i) => (
                <div key={i} className="rounded-lg border bg-background p-6">
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 mb-4">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              CapVeri vs. the Alternatives
            </h2>
            <p className="text-muted-foreground mb-6">
              Compare CAM reconciliation approaches: purpose-built software vs.
              spreadsheets, ERP add-on modules, and outsourced services.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              For landlord-side verification, CapVeri combines CSV setup,
              deterministic gross-up/cap math, and an audit trail built for
              dispute readiness. ERPs are the right tool when you need full
              accounting, leasing, AP, or tenant operations.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  CAM reconciliation software comparison
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold w-[200px]"
                    >
                      Feature
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold text-primary"
                    >
                      CapVeri
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Excel
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      ERP Module
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Outsourced
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {row.feature}
                      </td>
                      <td className="px-4 py-3">
                        <ComparisonCell value={row.capveri} />
                      </td>
                      <td className="px-4 py-3">
                        <ComparisonCell value={row.excel} />
                      </td>
                      <td className="px-4 py-3">
                        <ComparisonCell value={row.erp} />
                      </td>
                      <td className="px-4 py-3">
                        <ComparisonCell value={row.outsourced} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ROI Callout */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-success/30 bg-success/10 p-8 text-center">
              <TrendingUp className="h-10 w-10 text-success mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-3">
                Modeled Recovery: $5.9K &ndash; $35.3K per Building
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
                Based on industry data showing 1&ndash;6% average overcharges on
                CAM billings, a 100,000 SF office building with $5.89/SF in
                operating expenses yields $5,890 to $35,340 in recoverable
                errors per reconciliation cycle. CapVeri finds these errors in
                minutes instead of weeks.
              </p>
              <p className="text-sm text-success-strong font-medium">
                With annual self-serve pricing from{" "}
                {
                  publicKnowledge.pricing.display.tierAnnualPriceLabels
                    .reconcile
                }
                , CapVeri can pay for itself when it catches one modest CAM
                billing error.
              </p>
            </div>
          </div>
        </section>

        {/* Integration Section */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Works With Every Property Management System
            </h2>
            <p className="text-muted-foreground mb-8">
              CapVeri needs no integration. Instead of expensive API connections
              that break with every software update, it reads the CSV and Excel
              exports you already produce.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  name: "Yardi Voyager",
                  detail: "GL export, rent roll, budget vs. actual",
                },
                {
                  name: "MRI Software",
                  detail: "GL detail, lease abstract, recovery schedule",
                },
                {
                  name: "RealPage",
                  detail: "Operating statement, GL transaction detail",
                },
                {
                  name: "Any CSV Export",
                  detail: "AppFolio, Buildium, Rent Manager, custom ERP",
                },
              ].map((system, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-4 flex items-start gap-3"
                >
                  <Upload className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{system.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {system.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              No API keys, no integration fees, no vendor lock-in. Export from
              your PMS, upload to CapVeri, reconcile.
            </p>
          </div>
        </section>

        {/* Watch video band */}
        {video && (
          <section className="py-16 border-b">
            <div className="container mx-auto max-w-3xl px-4">
              <h2 className="text-xl font-bold mb-6 text-center">
                See It In Action
              </h2>
              <JsonLd
                data={structuredDataSchemas.videoObject({
                  name: video.title,
                  description: video.description,
                  youtubeId: video.youtubeId,
                  uploadDate: video.uploadDate,
                  durationSeconds: video.durationSeconds,
                  thumbnailUrl: video.thumbnailUrl,
                })}
              />
              <VideoEmbed
                youtubeId={video.youtubeId}
                title={video.title}
                thumbnailUrl={video.thumbnailUrl}
              />
              <p className="text-sm text-muted-foreground text-center mt-3">
                {video.description}
              </p>
            </div>
          </section>
        )}

        {/* FAQ Section */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <HelpCircle className="h-6 w-6 text-primary" />
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {faqSchema.mainEntity.map((item, i) => (
                <div key={i} className="rounded-lg border bg-background p-5">
                  <p className="font-semibold mb-2">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.acceptedAnswer.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-16">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">
                Verify CAM Statements Before They Go Out
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Start your {TRIAL_COPY}. Upload a GL export, enter lease terms,
                and review exceptions with the source GL line and lease rule
                attached.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href={bottomCtaLink}
                  className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Start {TRIAL_COPY}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
                <Link
                  href="/cam-reconciliation-guide"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  Read the Reconciliation Guide
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                {publicKnowledge.pricing.display.selfServeSummary}.{" "}
                {publicKnowledge.pricing.display.trialCopy}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
