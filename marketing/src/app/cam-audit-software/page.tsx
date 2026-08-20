import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Upload,
  Search,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Calculator,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Audit Software for Commercial Landlords",
  description:
    "CapVeri checks CAM statements before tenants see them. Verify gross-up, enforce lease caps, flag CapEx in GL exports, and keep a dispute-ready trail without a new ERP integration.",
  alternates: {
    canonical: `${SITE_URL}/cam-audit-software`,
  },
  openGraph: {
    title: "CAM Audit Software for Commercial Landlords",
    description:
      "Verify gross-up calculations, enforce lease caps, detect CapEx in GL exports, and produce dispute-ready audit trails without a new ERP integration.",
    url: `${SITE_URL}/cam-audit-software`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CAM Audit Software for Commercial Landlords",
    description:
      "Verify gross-up calculations, enforce lease caps, detect CapEx in GL exports, and produce dispute-ready audit trails without a new ERP integration.",
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CapVeri CAM Audit Software",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "CAM reconciliation check software for commercial landlords. Verifies gross-up calculations, enforces lease caps, detects CapEx in GL exports, and produces dispute-ready audit trails. Works from CSV exports from Yardi, MRI, RealPage, AppFolio, and Sage Intacct.",
  url: `${SITE_URL}/cam-audit-software`,
  offers: publicKnowledge.structuredData.pricingOffers,
  featureList:
    "BOMA 2024 gross-up verification; CAM cap enforcement (cumulative and non-cumulative); Pro-rata denominator validation; CapEx detection and GL screening; Management fee cap compliance; Dispute-ready audit trail",
  publisher: {
    "@type": "Organization",
    name: "CapVeri",
    url: SITE_URL,
  },
};

const productSchema = structuredDataSchemas.product({
  name: "CapVeri CAM Audit Software",
  description: softwareSchema.description,
  url: `${SITE_URL}/cam-audit-software`,
});

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is CAM audit software?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM audit software checks Common Area Maintenance charges before they go to tenants. It reviews gross-up calculations, pro-rata denominators, expense caps, capital item exclusions, and management fees against the lease terms. CapVeri runs this check from GL exports produced by your existing ERP without a new integration.",
      },
    },
    {
      "@type": "Question",
      name: "How does CapVeri work as CAM audit software?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Export your GL expense report from your ERP (Yardi, MRI, RealPage, AppFolio, Sage Intacct, or any CSV-capable system), upload it to CapVeri, and review flagged issues. CapVeri checks BOMA 2024 gross-up, pro-rata denominators, caps, CapEx, and management fees in minutes. It also keeps a traceable record.",
      },
    },
    {
      "@type": "Question",
      name: "Does CapVeri replace my ERP?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. CapVeri is an independent check layer, not a property management system. You keep running your existing ERP (Yardi, MRI, etc.) exactly as you do today. CapVeri checks the output and flags gross-up errors, cap violations, and CapEx issues before they reach tenants.",
      },
    },
    {
      "@type": "Question",
      name: "What ERP systems does CapVeri support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri works from standard CSV exports from Yardi Voyager, Yardi Breeze Premier, MRI Software, RealPage, AppFolio, and Sage Intacct. If your ERP can export a GL expense report to CSV or Excel, CapVeri can ingest it.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between CAM audit software and CAM reconciliation software?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The terms are often used interchangeably in commercial real estate. CAM reconciliation is the annual process of comparing actual expenses to estimates and issuing true-up invoices. CAM audit is the check that confirms the reconciliation math is correct. CapVeri handles both: it runs the reconciliation and checks it for gross-up accuracy, cap compliance, and CapEx exclusions.",
      },
    },
    {
      "@type": "Question",
      name: "How much does CapVeri cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `${publicKnowledge.pricing.display.selfServeSummary}. ${publicKnowledge.pricing.display.trialCopy} ${publicKnowledge.pricing.enterpriseThreshold.summary}`,
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
      name: "CAM Reconciliation Check",
      item: `${SITE_URL}/cam-audit-software`,
    },
  ],
};

const USE_CASES = [
  {
    icon: Search,
    title: "Pre-statement self-audit",
    description:
      "Before reconciliation statements go to tenants, run your GL export through CapVeri. Catch gross-up errors, cap violations, and CapEx issues while you can still issue a corrected statement.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant audit defense",
    description:
      "When a tenant exercises audit rights, CapVeri produces the documentation they request: expense pool breakdowns, gross-up calculations with BOMA 2024 methodology, cap bank history, and pro-rata denominators. All in a timestamped record.",
  },
  {
    icon: Calculator,
    title: "Portfolio-wide consistency check",
    description:
      "Reconciliation methodology should be consistent across every building in your portfolio. CapVeri applies the same BOMA 2024 gross-up engine and cap enforcement logic to every CSV you upload. It flags buildings where the methodology diverges from the standard.",
  },
  {
    icon: AlertTriangle,
    title: "ERP configuration drift detection",
    description:
      "ERPs calculate correctly against their own configuration. But configurations drift when leases are amended without updating system parameters. CapVeri catches the delta between what your ERP calculated and what the lease actually requires.",
  },
];

const WHAT_WE_VERIFY = [
  "Gross-up calculation (BOMA 2024 fixed/variable bifurcation, occupancy threshold per lease)",
  "Pro-rata denominator accuracy (RSF method, total vs. occupied denominator)",
  "CAM cap enforcement: both cumulative (year-over-year bank ledger) and non-cumulative",
  "Capital item detection: flags CapEx charges before they enter recoverable pools",
  "Management fee cap compliance (percentage of controllable expenses)",
  "Base year expense stop adjustments for new services added mid-lease",
];

const SUPPORTED_SYSTEMS = [
  { name: "Yardi Voyager", detail: "SSRS CAM expense report → CSV" },
  { name: "Yardi Breeze Premier", detail: "Reports → CAM/GL summary → CSV" },
  { name: "MRI Software", detail: "Rapid Reports → CAM detail → CSV" },
  { name: "RealPage", detail: "Operating statement → GL transaction detail" },
  { name: "AppFolio", detail: "Reports → expense export → CSV" },
  { name: "Sage Intacct", detail: "GL expense detail report → CSV" },
];

export default function CamAuditSoftwarePage() {
  const heroCtaLink = buildTrialLink({ content: "cam_audit_software_hero" });
  const bottomCtaLink = buildTrialLink({
    content: "cam_audit_software_bottom",
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
                <Search className="h-3.5 w-3.5 mr-1.5" />
                CAM Audit Software
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              CAM Audit Software for Commercial Landlords
            </h1>
            <p className="text-xl text-muted-foreground mb-3 max-w-3xl">
              Searching for CAM audit software? CapVeri is CAM reconciliation
              software for landlords. Export your GL from your ERP. Upload it.
              Check gross-up, caps, and CapEx. Review the statement before it
              goes out.
            </p>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-8 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                What it does
              </p>
              <p className="text-sm text-foreground">
                CapVeri runs your CAM reconciliation and checks the math your
                ERP produced. No integration project, no consultant, no system
                replacement. Export a CSV, upload it, review the flags, then
                send the statement.
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

        {/* Why landlords use CapVeri */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Why Landlords Check CAM With CapVeri
            </h2>
            <p className="text-muted-foreground mb-8">
              Four use cases where an independent check catches ERP math issues.
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              {USE_CASES.map(({ icon: Icon, title, description }, i) => (
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

        {/* How it works */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">How It Works</h2>
            <p className="text-muted-foreground mb-8">
              Three steps from GL export to checked reconciliation.
            </p>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  step: "1",
                  title: "Export GL from your ERP",
                  body: "Run your standard CAM expense report from Yardi, MRI, RealPage, AppFolio, or any ERP. Export to CSV or Excel. No special report format required. CapVeri works from standard exports.",
                },
                {
                  step: "2",
                  title: "Upload to CapVeri",
                  body: "Upload the CSV to CapVeri and confirm the lease parameters for each tenant: cap percentage, gross-up threshold, exclusions. CapVeri pre-populates from prior reconciliations. Setup takes minutes.",
                },
                {
                  step: "3",
                  title: "Review flagged issues",
                  body: "CapVeri checks BOMA 2024 gross-up, caps, pro-rata shares, and CapEx. Review the flags, fix issues, and send a checked reconciliation with a traceable record.",
                },
              ].map(({ step, title, body }, i) => (
                <div key={i} className="rounded-lg border bg-background p-6">
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4">
                    {step}
                  </div>
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What CapVeri verifies */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">What CapVeri Verifies</h2>
            <p className="text-muted-foreground mb-6">
              Every check uses deterministic financial math. AI does not do the
              calculations that determine tenant liability.
            </p>
            <div className="space-y-3">
              {WHAT_WE_VERIFY.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Supported ERP exports */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">Supported ERP Exports</h2>
            <p className="text-muted-foreground mb-6">
              CapVeri works from standard exports from supported property
              management systems. No API integration, no IT involvement, no
              vendor lock-in.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SUPPORTED_SYSTEMS.map(({ name, detail }, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-background p-4 flex items-start gap-3"
                >
                  <Upload className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Any system that exports GL expense data to CSV or Excel is
              compatible. If your ERP is not listed above, contact us.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">Pricing</h2>
            <p className="text-muted-foreground mb-6">
              Current packages are{" "}
              {publicKnowledge.pricing.tiers.map((t) => t.name).join(", ")}. See
              the pricing page for current unit limits, monthly and annual
              options, and trial terms.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              View Current Pricing
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </div>
        </section>

        {/* Related links */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6">Related Resources</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  href: "/resources/export-based-verification-layer",
                  title: "The Export-Based Verification Layer",
                  desc: "Why file exports work better than API integrations for CAM checks",
                },
                {
                  href: "/resources/why-erps-still-leak-cam-revenue",
                  title: "Why ERPs Miss CAM Errors",
                  desc: "Configuration drift and the limits of ERP-native CAM modules",
                },
                {
                  href: "/vs/yardi",
                  title: "CapVeri vs Yardi",
                  desc: "Detailed comparison for Yardi Voyager and Breeze users",
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

        {/* Bottom CTA */}
        <section className="py-16">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">
                Run Your First Reconciliation in Minutes
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Export your GL expense report from your ERP. Upload it to
                CapVeri. CapVeri runs the reconciliation with BOMA 2024 gross-up
                and cap enforcement. You get a tenant-ready statement with a
                traceable support file before statements go out.
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
                  href="/cam-reconciliation-software"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  See All Features
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
