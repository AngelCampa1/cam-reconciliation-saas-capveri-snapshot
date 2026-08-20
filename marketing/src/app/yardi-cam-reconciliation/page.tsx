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
  title: "Yardi CAM Reconciliation Without New Integrations",
  description:
    "Improve your Yardi CAM reconciliation accuracy without a new integration project. CapVeri reads your Yardi GL export and verifies gross-up, cap enforcement, and pro-rata calculations in minutes.",
  alternates: {
    canonical: `${SITE_URL}/yardi-cam-reconciliation`,
  },
  openGraph: {
    title: "Yardi CAM Reconciliation: Add Independent Verification",
    description:
      "Improve your Yardi CAM reconciliation accuracy without a new integration project. CapVeri reads your Yardi GL export and verifies gross-up, cap enforcement, and pro-rata calculations in minutes.",
    url: `${SITE_URL}/yardi-cam-reconciliation`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Yardi CAM Reconciliation: Add Independent Verification",
    description:
      "CapVeri reads your Yardi GL export and verifies gross-up, cap enforcement, and pro-rata calculations. No integration required.",
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CapVeri for Yardi CAM Reconciliation",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Independent verification layer for Yardi CAM reconciliation. Reads Yardi Voyager and Breeze Premier GL exports via CSV and verifies BOMA 2024 gross-up, cumulative cap enforcement, and pro-rata calculations without API integration.",
  url: `${SITE_URL}/yardi-cam-reconciliation`,
  offers: publicKnowledge.structuredData.pricingOffers,
  publisher: {
    "@type": "Organization",
    name: "CapVeri",
    url: SITE_URL,
  },
};

const productSchema = structuredDataSchemas.product({
  name: "CapVeri for Yardi CAM Reconciliation",
  description: softwareSchema.description,
  url: `${SITE_URL}/yardi-cam-reconciliation`,
});

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Does CapVeri integrate with Yardi?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. CapVeri does not connect to Yardi. Instead, it reads the standard CSV export your Yardi system already makes. No Yardi login, no integration project, no IT work. Export your CAM expense report from Yardi Voyager (via SSRS) or Yardi Breeze Premier (via Reports), upload the CSV to CapVeri, and results are ready in minutes.",
      },
    },
    {
      "@type": "Question",
      name: "How do I export my Yardi data for CapVeri?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yardi Voyager users: open SSRS, run the CAM Expense Report for the reconciliation period, and export to CSV. Yardi Breeze Premier users: go to Reports, run a CAM or GL summary report, and export to CSV or Excel. Either file uploads directly to CapVeri with no reformatting required.",
      },
    },
    {
      "@type": "Question",
      name: "What does CapVeri catch that Yardi misses?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yardi calculates correctly against its own configuration. Configurations drift when leases are amended and system parameters are not updated. CapVeri catches the delta between what Yardi calculated and what the current lease terms actually require: wrong gross-up thresholds, outdated cap percentages, misconfigured pro-rata denominators, and CapEx charges that made it into recoverable pools.",
      },
    },
    {
      "@type": "Question",
      name: "Does CapVeri work with Yardi Breeze vs. Yardi Voyager?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri works with both. Yardi Voyager (enterprise) and Yardi Breeze Premier (mid-market commercial) both produce CSV exports that CapVeri can ingest. Note: base Yardi Breeze (not Premier) only supports flat-rate CAM (not pro-rata by tenant SF), which makes it unsuitable for most multi-tenant commercial NNN leases.",
      },
    },
    {
      "@type": "Question",
      name: "What is configuration drift in Yardi CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Configuration drift happens when a lease is amended (a new cap percentage, an updated gross-up threshold, a renegotiated exclusion list) but the corresponding Yardi fields are not updated. Yardi continues calculating correctly against the old parameters. The output looks right. The numbers are wrong. CapVeri catches this by recalculating from first principles against the actual current lease terms.",
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
      name: "Yardi CAM Reconciliation",
      item: `${SITE_URL}/yardi-cam-reconciliation`,
    },
  ],
};

const WHAT_YARDI_DOES_WELL = [
  "Centralized data management: lease records, GL, rent roll in one database",
  "Pro-rata allocation by tenant SF (Voyager and Breeze Premier)",
  "Native recovery module with expense pool configuration (Voyager)",
  "SSRS reporting for GL expense detail export",
  "Established consultant ecosystem for complex configuration (Assetsoft, Meissner CRES, BC Solutions)",
];

const WHERE_YARDI_CREATES_PROBLEMS = [
  {
    title: "Configuration drift",
    desc: "When a lease is amended and Yardi fields are not updated, the system calculates correctly against the old parameters. Errors are mathematically exact and contractually wrong. There is no alert that the configuration no longer matches the lease.",
  },
  {
    title: "Black-box calculations",
    desc: "Yardi's CAM engine runs stored procedures against a relational database. When results look wrong, tracing the source requires database access or a consultant. Property accountants routinely encounter discrepancies they cannot independently verify.",
  },
  {
    title: "No cross-lease consistency check",
    desc: "Yardi verifies each reconciliation against its own configuration. It does not flag inconsistencies in methodology across leases. For example, the same expense category could be treated differently for two tenants in the same building.",
  },
];

const WHAT_CAPVERI_VERIFIES = [
  "BOMA 2024 gross-up: fixed/variable bifurcation, occupancy threshold per lease",
  "Pro-rata denominator: RSF method, total vs. occupied, partial-year proration",
  "CAM cap enforcement: cumulative (year-over-year bank ledger) and non-cumulative",
  "Capital item detection: flags CapEx before it enters recoverable pools",
  "Management fee cap compliance",
  "Base year expense stop adjustments for new services",
];

export default function YardiCamReconciliationPage() {
  const ctaLink = buildTrialLink({
    content: "yardi_cam_reconciliation_cta",
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
                For Yardi Users
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Yardi CAM Reconciliation: Add Independent Verification Without a
              New Integration
            </h1>
            <p className="text-xl text-muted-foreground mb-3 max-w-3xl">
              Yardi is good at recording. CapVeri is good at verifying. You
              don&apos;t need to choose. You don&apos;t need a new integration
              project either. Export your Yardi CAM expense report as a CSV,
              upload it to CapVeri, and get a second calculation in minutes.
            </p>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-8 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                The key distinction
              </p>
              <p className="text-sm text-foreground">
                CapVeri is not a Yardi replacement. It is an independent audit
                of Yardi&apos;s output. It catches configuration drift, gross-up
                errors, and cap violations before tenants do.
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
                href="/vs/yardi"
                className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
              >
                Full Yardi Comparison
              </Link>
            </div>
          </div>
        </section>

        {/* What Yardi does well */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              What Yardi Does for CAM Reconciliation
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              Yardi Voyager is genuinely capable for CAM reconciliation when
              correctly configured. That&apos;s worth saying upfront.
            </p>
            <div className="space-y-3">
              {WHAT_YARDI_DOES_WELL.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{item}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              The phrase &ldquo;when correctly configured&rdquo; hides the real
              problem that CapVeri addresses.
            </p>
          </div>
        </section>

        {/* Where Yardi creates problems */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Where Yardi Users Run Into Trouble
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              These are the documented failure modes. They are not hypothetical
              edge cases.
            </p>
            <div className="space-y-4">
              {WHERE_YARDI_CREATES_PROBLEMS.map(({ title, desc }, i) => (
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

        {/* How CapVeri works with Yardi */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              How CapVeri Works With Yardi
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              No API, no credentials, no integration project. Works from
              standard exports from supported Yardi systems.
            </p>
            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              <div className="rounded-lg border bg-background p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Upload className="h-5 w-5 text-primary" />
                  <p className="font-semibold">Yardi Voyager export steps</p>
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Open SSRS (SQL Server Reporting Services)</li>
                  <li>Navigate to CAM Expense Report</li>
                  <li>Select the reconciliation period and property</li>
                  <li>Export to CSV</li>
                  <li>Upload CSV to CapVeri</li>
                </ol>
              </div>
              <div className="rounded-lg border bg-background p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Upload className="h-5 w-5 text-primary" />
                  <p className="font-semibold">
                    Yardi Breeze Premier export steps
                  </p>
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Go to Reports in Yardi Breeze Premier</li>
                  <li>Run a CAM or GL summary report</li>
                  <li>Select the reconciliation period and property</li>
                  <li>Export to CSV or Excel</li>
                  <li>Upload file to CapVeri</li>
                </ol>
              </div>
            </div>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
              <p className="text-sm font-semibold text-primary mb-1">
                Works from standard exports from supported systems
              </p>
              <p className="text-sm text-foreground">
                CapVeri needs no integration. It reads the file exports your
                Yardi system already produces. No API credentials, no Yardi
                access required for CapVeri to run. Your Yardi workflow stays
                exactly as it is.
              </p>
            </div>
          </div>
        </section>

        {/* What CapVeri verifies */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              What CapVeri Verifies Against Your Yardi Output
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              Every check runs independently of Yardi&apos;s internal
              calculations. Each check catches the delta between what Yardi
              calculated and what the lease requires.
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
                  href: "/vs/yardi",
                  title: "CapVeri vs Yardi: Full Comparison",
                  desc: "Detailed feature and cost comparison for Yardi Voyager and Breeze",
                },
                {
                  href: "/resources/why-erps-still-leak-cam-revenue",
                  title: "Why ERPs Still Leak CAM Revenue",
                  desc: "Configuration drift and the limits of ERP-native CAM modules",
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
                Already on Yardi? Export Your CAM Report. Upload It.
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                CapVeri recalculates your Yardi output from first principles -
                BOMA 2024 gross-up, cumulative cap enforcement, pro-rata
                validation. It flags discrepancies before they reach tenants. No
                integration project. No Yardi credentials required.
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
                  href="/vs/yardi"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  Read the Full Yardi Comparison
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
