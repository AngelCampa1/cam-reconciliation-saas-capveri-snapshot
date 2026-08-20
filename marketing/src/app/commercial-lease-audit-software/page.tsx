import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  XCircle,
  Minus,
  Clock,
  HelpCircle,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Commercial Lease Audit Software: CapVeri vs Manual Review",
  description:
    "Manual CAM review takes 9 to 18 hours per property. CapVeri checks the same items in minutes, from GL export to tenant-ready reconciliation statement.",
  alternates: {
    canonical: `${SITE_URL}/commercial-lease-audit-software`,
  },
  openGraph: {
    title: "Commercial Lease Audit Software vs. Manual Review",
    description:
      "Manual CAM review takes 9 to 18 hours per property. CapVeri checks the same items in minutes, from GL export to tenant-ready reconciliation statement.",
    url: `${SITE_URL}/commercial-lease-audit-software`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Commercial Lease Audit Software vs. Manual Review",
    description:
      "Manual CAM review takes 9 to 18 hours per property. CapVeri checks the same items in minutes, from GL export to tenant-ready reconciliation statement.",
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CapVeri Commercial Lease Audit Software",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Commercial lease CAM check software that runs your CAM reconciliation. CapVeri handles gross-up, cap enforcement, and CapEx checks in minutes instead of hours, so your statement is ready before tenants see it.",
  url: `${SITE_URL}/commercial-lease-audit-software`,
  offers: publicKnowledge.structuredData.pricingOffers,
  publisher: {
    "@type": "Organization",
    name: "CapVeri",
    url: SITE_URL,
  },
};

const productSchema = structuredDataSchemas.product({
  name: "CapVeri Commercial Lease Audit Software",
  description: softwareSchema.description,
  url: `${SITE_URL}/commercial-lease-audit-software`,
});

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How long does manual commercial lease CAM audit take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Manual CAM audit for a single commercial property typically takes 9-18 hours: 4-8 hours for GL export review and expense categorization, 2-4 hours for lease abstract comparison, 2-4 hours for calculation rebuild, and 1-2 hours for documentation. For a 20-property portfolio, a property controller can spend 180-360 hours annually on CAM audit work.",
      },
    },
    {
      "@type": "Question",
      name: "What does commercial lease audit software automate?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri automates GL expense categorization, BOMA 2024 gross-up checks, pro-rata denominator checks, cumulative and non-cumulative cap enforcement, CapEx detection, and reconciliation statement assembly. The same check that takes 9-18 hours manually takes minutes with CapVeri. It produces a traceable record for tenant questions.",
      },
    },
    {
      "@type": "Question",
      name: "What can't software replace in a CAM audit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Software automates the deterministic math (gross-up, pro-rata, cap enforcement). Human judgment is still required for gray areas: interpreting ambiguous lease clauses, negotiating disputed charges with tenants, deciding how to classify borderline CapEx items, and maintaining tenant relationships. CapVeri handles the calculation verification. Your team handles the judgment calls.",
      },
    },
    {
      "@type": "Question",
      name: "How much does commercial lease audit software cost vs. manual review?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `${publicKnowledge.pricing.display.selfServeSummary}. Manual CAM check labor cost depends on your property controller's fully-loaded rate. A controller at $75/hour spending 300 hours annually on CAM review for a 20-property portfolio costs $22,500 in labor before correction costs. CapVeri does not promise any specific time savings, but the operational comparison is straightforward.`,
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
      name: "Commercial Lease Audit Software",
      item: `${SITE_URL}/commercial-lease-audit-software`,
    },
  ],
};

type ComparisonValue = "check" | "x" | "partial" | string;

const COMPARISON_ROWS: {
  feature: string;
  manual: ComparisonValue;
  capveri: ComparisonValue;
}[] = [
  {
    feature: "GL export review and categorization",
    manual: "4-8 hours",
    capveri: "Automated (minutes)",
  },
  {
    feature: "Lease abstract comparison",
    manual: "2-4 hours",
    capveri: "Parameters entered once, persisted",
  },
  {
    feature: "BOMA 2024 gross-up calculation",
    manual: "Manual (formula errors common)",
    capveri: "check",
  },
  {
    feature: "Cumulative cap bank tracking",
    manual: "Manual cross-workbook (error-prone)",
    capveri: "check",
  },
  {
    feature: "CapEx detection",
    manual: "Depends on analyst knowledge",
    capveri: "check",
  },
  {
    feature: "Traceable audit record",
    manual: "x",
    capveri: "check",
  },
  {
    feature: "Dispute defense documentation",
    manual: "Manual reconstruction required",
    capveri: "check",
  },
  {
    feature: "Tenant gray area judgment",
    manual: "check",
    capveri: "x",
  },
];

function Cell({ value }: { value: ComparisonValue }) {
  if (value === "check")
    return <CheckCircle className="h-5 w-5 text-success" />;
  if (value === "x") return <XCircle className="h-5 w-5 text-destructive" />;
  if (value === "partial") return <Minus className="h-5 w-5 text-warning" />;
  return <span className="text-sm">{value}</span>;
}

export default function CommercialLeaseAuditSoftwarePage() {
  const heroCtaLink = buildTrialLink({
    content: "commercial_lease_audit_hero",
  });
  const bottomCtaLink = buildTrialLink({
    content: "commercial_lease_audit_bottom",
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
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Commercial Lease Audit Software
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Commercial Lease Audit Software vs.&nbsp;Manual Review
            </h1>
            <p className="text-xl text-muted-foreground mb-3 max-w-3xl">
              A manual CAM review is careful work. It takes 9 to 18 hours per
              property each year. CapVeri runs the CAM check for you. It checks
              gross-up, caps, and CapEx. Your team keeps the judgment calls that
              need a person.
            </p>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-8 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                The honest framing
              </p>
              <p className="text-sm text-foreground">
                CapVeri automates the math. It does not replace lease
                negotiation, tenant relationships, or interpretation of
                ambiguous clauses. Both matter. Software handles one. Your team
                handles the other.
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

        {/* The problem with manual */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Manual CAM Check: What It Takes
            </h2>
            <p className="text-muted-foreground mb-8">
              This is the realistic time breakdown for a single commercial
              property. Not a worst case.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  step: "Step 1",
                  title: "GL export review",
                  hours: "4–8 hours",
                  desc: "Pull the GL expense report, categorize expenses into recoverable and non-recoverable pools, flag potential CapEx items, verify that excluded expenses (tenant improvements, interest, depreciation) are not in the pool.",
                },
                {
                  step: "Step 2",
                  title: "Lease abstract comparison",
                  hours: "2–4 hours",
                  desc: "Pull each lease, verify the gross-up threshold, confirm the cap percentage and type (cumulative or non-cumulative), review the exclusion list, confirm the pro-rata denominator definition.",
                },
                {
                  step: "Step 3",
                  title: "Calculation rebuild",
                  hours: "2–4 hours",
                  desc: "Rebuild the gross-up calculation from occupancy data, apply the cap per tenant, calculate pro-rata shares, compare to ERP output, and investigate each issue.",
                },
                {
                  step: "Step 4",
                  title: "Documentation",
                  hours: "1–2 hours",
                  desc: "Assemble the reconciliation package: expense pool breakdowns, gross-up methodology, cap bank history, pro-rata denominators. This is what tenants request when they exercise audit rights.",
                },
              ].map(({ step, title, hours, desc }, i) => (
                <div key={i} className="rounded-lg border bg-background p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {step}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-warning/10 text-warning-foreground px-2.5 py-0.5 text-xs font-medium">
                      {hours}
                    </span>
                  </div>
                  <p className="font-semibold mb-2">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-lg border border-warning/30 bg-warning/10 p-4">
              <p className="text-sm font-semibold text-warning-foreground mb-1">
                For a 20-property portfolio
              </p>
              <p className="text-sm text-warning-foreground">
                9-18 hours per property &times; 20 properties = 180-360 hours
                per year on CAM check work. This is the calculation math. It
                does not include tenant communication, dispute resolution, or
                amended statement preparation.
              </p>
            </div>
          </div>
        </section>

        {/* What CapVeri automates */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">What CapVeri Automates</h2>
            <p className="text-muted-foreground mb-8">
              The same four steps, now taking minutes instead of hours. You also
              get cleaner support files than manual review usually creates.
            </p>
            <div className="space-y-4">
              {[
                {
                  step: "Step 1 automated",
                  title: "GL expense categorization and CapEx screening",
                  body: "Upload your GL export as a CSV. CapVeri categorizes expenses into recoverable and non-recoverable pools and runs rules-based CapEx detection, flagging charges that appear to be capital in nature before they enter the reconciliation.",
                },
                {
                  step: "Step 2 automated",
                  title: "Lease parameter persistence",
                  body: "Lease parameters (gross-up threshold, cap type and percentage, exclusions, pro-rata denominator) are entered once and persisted. For recurring reconciliations, CapVeri pre-populates from the prior year.",
                },
                {
                  step: "Step 3 automated",
                  title: "Deterministic calculation verification",
                  body: "CapVeri runs BOMA 2024 gross-up, cumulative cap enforcement with year-by-year bank ledger, and pro-rata allocation from first principles, independent of what your ERP calculated. Discrepancies surface as flags.",
                },
                {
                  step: "Step 4 automated",
                  title: "Traceable support file generation",
                  body: "Every reconciliation produces a timestamped record: expense pool composition, gross-up calculation trace, cap bank history, and pro-rata denominator. It is ready for tenant audit requests without manual reconstruction.",
                },
              ].map(({ step, title, body }, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-background p-5 flex gap-4"
                >
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {step}
                    </p>
                    <p className="font-semibold mb-1">{title}</p>
                    <p className="text-sm text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What software can't replace */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              What Software Cannot Replace
            </h2>
            <p className="text-muted-foreground mb-6">
              Honest about the limits. CapVeri handles deterministic math. These
              things require human judgment.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  title: "Gray-area clause interpretation",
                  body: "When a lease clause is ambiguous (an expense category that could be interpreted as recoverable or not), software applies the configured rule. Human judgment is required to decide how to configure that rule and defend it to a tenant.",
                },
                {
                  title: "Lease negotiation and renegotiation",
                  body: "CAM caps, gross-up thresholds, and exclusion lists are negotiated at lease execution and amendment. CapVeri enforces what the lease says. It does not help you negotiate better terms.",
                },
                {
                  title: "Tenant relationship management",
                  body: "When a tenant disputes a CAM charge, the resolution often involves negotiation and relationship management beyond the calculation. CapVeri produces the documentation. Your team handles the conversation.",
                },
              ].map(({ title, body }, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-muted-foreground/20 p-5"
                >
                  <AlertTriangle className="h-5 w-5 text-warning mb-3" />
                  <p className="font-semibold mb-2">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Manual Review vs. CapVeri
            </h2>
            <p className="text-muted-foreground mb-6">
              Eight dimensions of comparison, including where manual review
              wins.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Manual CAM check vs. CapVeri commercial lease CAM check
                  software
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold w-[240px]"
                    >
                      Dimension
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Manual Review
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold text-primary"
                    >
                      CapVeri
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {row.feature}
                      </td>
                      <td className="px-4 py-3">
                        <Cell value={row.manual} />
                      </td>
                      <td className="px-4 py-3">
                        <Cell value={row.capveri} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ROI scenario */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-success/30 bg-success/10 p-8">
              <TrendingUp className="h-10 w-10 text-success mb-4" />
              <h2 className="text-2xl font-bold mb-3">
                Scenario: 20-Property Portfolio
              </h2>
              <p className="text-muted-foreground mb-4 max-w-2xl">
                A property controller managing 20 commercial properties who
                currently spends 300 hours annually on CAM audit preparation
                would, in a scenario where CapVeri reduces that to 30 hours,
                have 270 hours to reallocate to tenant relations, lease
                administration, or other work.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Important:</strong> This is a scenario illustration, not
                a typical outcome promise. Actual time reduction depends on
                portfolio complexity, existing workflows, and team proficiency
                with the software. CapVeri automates the deterministic
                calculation steps. Fitting it into your existing process takes
                time to develop.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
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

        {/* Related links */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6">Related Resources</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  href: "/resources/export-based-verification-layer",
                  title: "The Export-Based Verification Layer",
                  desc: "Architecture overview: why CSV-based verification beats ERP-native calculations",
                },
                {
                  href: "/cam-audit-software",
                  title: "CAM Check Software Overview",
                  desc: "What CapVeri verifies and which ERP exports it supports",
                },
                {
                  href: "/vs/yardi",
                  title: "CapVeri vs Yardi",
                  desc: "Detailed comparison for Yardi users",
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
                Reconcile Your First Property Free
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Export your GL from any ERP and upload it. CapVeri runs the
                reconciliation in minutes. It checks BOMA 2024 gross-up, caps,
                and CapEx before the statement goes out.
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
                  href="/cam-audit-software"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  See What CapVeri Verifies
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
