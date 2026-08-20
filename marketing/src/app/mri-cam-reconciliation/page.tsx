import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Upload,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "MRI Recovery Billing QA for CAM Reconciliation",
  description:
    "Verify your MRI Software recovery billing calculations before they reach tenants. CapVeri reads MRI GL exports and checks gross-up, pro-rata, and cap enforcement. No API integration required.",
  alternates: {
    canonical: `${SITE_URL}/mri-cam-reconciliation`,
  },
  openGraph: {
    title:
      "MRI Recovery Billing QA: Independent CAM Reconciliation Verification",
    description:
      "CapVeri reads MRI GL exports and checks gross-up, pro-rata, and cap enforcement. No API integration required.",
    url: `${SITE_URL}/mri-cam-reconciliation`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "MRI Recovery Billing QA: Independent CAM Reconciliation Verification",
    description:
      "CapVeri reads MRI GL exports and checks gross-up, pro-rata, and cap enforcement. No API integration required.",
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CapVeri for MRI Recovery Billing QA",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Independent verification layer for MRI Software recovery billing and CAM reconciliation. Reads MRI Rapid Reports GL exports via CSV and verifies BOMA 2024 gross-up, cumulative cap enforcement, and pro-rata calculations without API integration.",
  url: `${SITE_URL}/mri-cam-reconciliation`,
  offers: publicKnowledge.structuredData.pricingOffers,
  publisher: {
    "@type": "Organization",
    name: "CapVeri",
    url: SITE_URL,
  },
};

const productSchema = structuredDataSchemas.product({
  name: "CapVeri for MRI Recovery Billing QA",
  description: softwareSchema.description,
  url: `${SITE_URL}/mri-cam-reconciliation`,
});

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Does CapVeri integrate with MRI Software?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri needs no integration. Instead of API access, it reads the standard CSV export from MRI's Rapid Reports module. No MRI credentials, no integration project, no IT involvement. Export your CAM expense report from MRI Rapid Reports, upload the CSV to CapVeri, and results are ready in minutes.",
      },
    },
    {
      "@type": "Question",
      name: "How do I export MRI data for CapVeri?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In MRI Software, open Rapid Reports and run the Recovery Billing report or GL detail export for the reconciliation period. Export to CSV or XLS. Upload the file directly to CapVeri. No reformatting required. CapVeri works from standard exports from supported MRI versions.",
      },
    },
    {
      "@type": "Question",
      name: "What does CapVeri catch that MRI recovery billing misses?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MRI's recovery module calculates correctly against its own configuration. Configurations drift when leases are amended and system parameters are not updated. CapVeri catches the delta: wrong gross-up thresholds, outdated cap percentages, misconfigured pro-rata denominators, and CapEx charges that entered recoverable pools. It recalculates from first principles against the current lease terms.",
      },
    },
    {
      "@type": "Question",
      name: "What is MRI's recovery billing module?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MRI Software's recovery billing module (within MRI Commercial Management and REMS) handles CAM expense allocation, gross-up calculations, pro-rata proration, and recovery billing for commercial tenants. It runs within MRI's database using the lease parameters and expense pool configurations your team has set up. CapVeri provides an independent second calculation of the same inputs.",
      },
    },
    {
      "@type": "Question",
      name: "Why does MRI recovery billing produce errors?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MRI recovery billing calculates against what it is configured to do, not against what the lease says. If a lease is amended (new cap percentage, changed gross-up threshold, updated exclusion list) and the MRI configuration is not updated accordingly, the system produces mathematically correct but contractually wrong reconciliations. This configuration drift is the most documented source of recovery billing errors in MRI portfolios.",
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
      name: "MRI CAM Reconciliation",
      item: `${SITE_URL}/mri-cam-reconciliation`,
    },
  ],
};

const WHAT_MRI_DOES_WELL = [
  "REMS Recovery module with expense pool configuration and gross-up",
  "Rapid Reports for flexible GL reporting and CSV/XLS export",
  "Commercial Management suite with lease administration and recovery billing",
  "MRI Managed Services: optional outsourced reconciliation processing",
  "Strong retail CAM pool support for complex multi-anchor portfolios",
];

const WHERE_MRI_CREATES_PROBLEMS = [
  {
    title: "Configuration drift after lease amendments",
    desc: "When a lease is amended (new cap percentage, updated gross-up threshold, renegotiated exclusion list), someone must update the corresponding MRI recovery billing configuration. If that update is missed, MRI calculates correctly against the old parameters. The output looks right. The billings are wrong.",
  },
  {
    title: "Recovery module requires professional services",
    desc: "Complex MRI recovery configurations (tiered gross-up thresholds, non-standard cap structures, multi-pool denominators) typically require MRI Professional Services or a qualified consultant to set up correctly. G2 reviewers consistently note that initial configuration is not self-serve.",
  },
  {
    title: "Self-verification is not independent verification",
    desc: "MRI verifies recovery billings against its own configuration. It cannot detect errors in that configuration. CapVeri provides the independent second calculation by running the same inputs through a separate BOMA 2024 engine and flagging any delta between MRI's output and what the lease requires.",
  },
];

const WHAT_CAPVERI_VERIFIES = [
  "BOMA 2024 gross-up: fixed/variable bifurcation, occupancy threshold per lease",
  "Pro-rata denominator accuracy: RSF method, total vs. occupied, partial-year proration",
  "CAM cap enforcement: cumulative (year-over-year bank ledger) and non-cumulative",
  "Capital item detection: flags CapEx before it enters recoverable pools",
  "Management fee cap compliance",
  "Base year expense stop adjustments for new services added mid-lease",
];

export default function MriCamReconciliationPage() {
  const ctaLink = buildTrialLink({
    content: "mri_cam_reconciliation_cta",
  });

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
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                For MRI Software Users
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              MRI Recovery Billing QA: Independent CAM Reconciliation
              Verification
            </h1>
            <p className="text-xl text-muted-foreground mb-3 max-w-3xl">
              MRI Software&apos;s recovery billing module has a strong
              calculation engine. It calculates against what you&apos;ve
              configured, not against what the lease says. CapVeri provides the
              independent QA layer: export your MRI GL, upload it, and verify
              the math before it reaches tenants.
            </p>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-8 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                The key distinction
              </p>
              <p className="text-sm text-foreground">
                CapVeri is not an MRI replacement. It is an independent audit of
                MRI&apos;s recovery billing output. It catches the delta between
                what MRI calculated and what the lease requires. No API
                integration, no MRI credentials.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href={ctaLink}
                className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start {TRIAL_COPY}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
              <Link
                href="/vs/mri"
                className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
              >
                Full MRI Comparison
              </Link>
            </div>
          </div>
        </section>

        {/* What MRI does well */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              What MRI Does for Recovery Billing
            </h2>
            <p className="text-muted-foreground mb-6">
              MRI&apos;s commercial management suite has genuine depth for CAM
              recovery. That&apos;s worth acknowledging.
            </p>
            <div className="space-y-3">
              {WHAT_MRI_DOES_WELL.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{item}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              The limitation is that MRI validates against its own
              configuration. It cannot detect errors in that configuration.
            </p>
          </div>
        </section>

        {/* Where MRI creates problems */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Where MRI Recovery Billing Creates Problems
            </h2>
            <p className="text-muted-foreground mb-6">
              These are the documented failure modes. They are not edge cases.
            </p>
            <div className="space-y-4">
              {WHERE_MRI_CREATES_PROBLEMS.map(({ title, desc }, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-warning/30 bg-warning/10 p-5"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-warning-foreground mb-1">{title}</p>
                      <p className="text-sm text-warning-foreground">{desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How CapVeri works with MRI */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              How CapVeri Works With MRI
            </h2>
            <p className="text-muted-foreground mb-6">
              No API, no credentials, no integration project. Works from
              standard exports from supported MRI systems.
            </p>
            <div className="rounded-lg border bg-background p-6 max-w-xl mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Upload className="h-5 w-5 text-primary" />
                <p className="font-semibold">MRI export steps</p>
              </div>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>Open MRI Software and navigate to Rapid Reports</li>
                <li>
                  Run the Recovery Billing report or GL detail export for your
                  reconciliation period
                </li>
                <li>Select the property and expense period</li>
                <li>Export to CSV or XLS format</li>
                <li>Upload the file directly to CapVeri</li>
              </ol>
            </div>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
              <p className="text-sm font-semibold text-primary mb-1">
                Works from standard exports from supported systems
              </p>
              <p className="text-sm text-foreground">
                CapVeri needs no integration. It reads the file exports your MRI
                system already produces via Rapid Reports. No API credentials or
                MRI system access required. Your MRI workflow stays exactly as
                it is.
              </p>
            </div>
          </div>
        </section>

        {/* What CapVeri verifies */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              What CapVeri Verifies Against Your MRI Output
            </h2>
            <p className="text-muted-foreground mb-6">
              Every check runs independently of MRI&apos;s internal calculations
              Each check catches the delta between what MRI calculated and what
              the lease requires.
            </p>
            <div className="space-y-3">
              {WHAT_CAPVERI_VERIFIES.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 border-b">
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

        {/* Related */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6">Related Resources</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  href: "/vs/mri",
                  title: "CapVeri vs MRI Software: Full Comparison",
                  desc: "Detailed feature and cost comparison for MRI Commercial Management users",
                },
                {
                  href: "/resources/why-erps-still-leak-cam-revenue",
                  title: "Why ERPs Still Leak CAM Revenue",
                  desc: "Configuration drift and the limits of ERP-native recovery billing modules",
                },
                {
                  href: "/resources/export-based-verification-layer",
                  title: "The Export-Based Verification Layer",
                  desc: "Architecture overview: why CSV-based verification beats API integration",
                },
              ].map(({ href, title, desc }, i) => (
                <Link
                  key={i}
                  href={href}
                  className="rounded-lg border bg-background p-4 hover:bg-muted/30 transition-colors"
                >
                  <p className="font-semibold text-sm mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-16">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">
                Already on MRI? Export Your Recovery Billing Report. Upload It.
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                CapVeri recalculates your MRI recovery billing output from first
                principles: BOMA 2024 gross-up, cumulative cap enforcement,
                pro-rata validation. It flags discrepancies before they reach
                tenants. No integration project. No MRI credentials required.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href={ctaLink}
                  className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Start {TRIAL_COPY}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
                <Link
                  href="/vs/mri"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  Read the Full MRI Comparison
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
