import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  Search,
  FileText,
  Shield,
  Clock,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildSiteUrl } from "@/lib/site";

const CAM_AUDIT_DESC =
  "Upload a Yardi or MRI export. CapVeri checks gross-up, caps, and costs tenants should not pay.";

export const metadata: Metadata = {
  title: "CAM Audit Software for Commercial Landlords (2026)",
  description: CAM_AUDIT_DESC,
  alternates: {
    canonical: `${SITE_URL}/cam-audit`,
  },
  openGraph: {
    title: "CAM Audit Software for Commercial Landlords (2026) | CapVeri",
    description: CAM_AUDIT_DESC,
    url: `${SITE_URL}/cam-audit`,
    type: "article",
    publishedTime: "2025-02-15T00:00:00.000Z",
    modifiedTime: "2026-04-17T00:00:00.000Z",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CAM Audit Software")}&category=Software`,
        ),
        width: 1200,
        height: 630,
        alt: "CAM Audit Software for Commercial Landlords | CapVeri",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CAM Audit Software for Commercial Landlords (2026) | CapVeri",
    description: CAM_AUDIT_DESC,
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "CAM Audit Software: Catch Billing Errors Before Statements Go Out",
  url: `${SITE_URL}/cam-audit`,
  datePublished: "2025-02-15",
  dateModified: "2026-04-17",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: {
    "@type": "Organization",
    name: "CapVeri.com",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/logo.svg`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is a CAM audit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A CAM audit is a review of a landlord's common area maintenance charges to verify that the amounts billed to tenants match actual expenses and comply with lease terms. Auditors examine the general ledger, compare line items against lease exclusions, verify gross-up calculations, check pro-rata share denominators, and confirm that expense caps were properly enforced. CAM audits are typically initiated by tenants but can also be performed proactively by landlords.",
      },
    },
    {
      "@type": "Question",
      name: "How much does a CAM audit cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Traditional CAM audits by third-party firms can cost thousands of dollars per property. The price grows with portfolio size, lease complexity, and the years under review. Contingency-based auditors instead take a share of whatever savings they find. Software-assisted audits through CapVeri use annual self-serve pricing from ${publicKnowledge.pricing.display.tierAnnualPriceLabels.reconcile}, with results in minutes rather than weeks.`,
      },
    },
    {
      "@type": "Question",
      name: "What do CAM auditors look for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM auditors examine 12 key areas: (1) non-recoverable expenses in the CAM pool, (2) gross-up calculation errors, (3) expense cap enforcement failures, (4) pro-rata share denominator mismatches, (5) base year calculation errors, (6) management fee circularity, (7) capital expenditures coded as operating expenses, (8) above-market management fees, (9) missing or incorrect GL account mappings, (10) duplicate expense entries, (11) cross-property cost allocations, and (12) late charges or interest included in recoverable expenses.",
      },
    },
    {
      "@type": "Question",
      name: "How long does a tenant have to request a CAM audit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most commercial leases give tenants 12 to 36 months from receipt of the reconciliation statement to request an audit. The exact window depends on the lease language. California SB 1103 imposes an 18-month lookback cap for qualifying small business tenants. Once the audit window closes, the reconciliation statement is typically considered final and binding.",
      },
    },
    {
      "@type": "Question",
      name: "Can landlords perform their own CAM audit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Proactive self-audits before issuing reconciliation statements are the most cost-effective way to prevent tenant disputes. A self-audit catches the same errors a tenant auditor would find: non-recoverable expenses, gross-up mistakes, and cap failures. CapVeri automates this process by checking your GL export for those same problems before statements go out.",
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
      name: "CAM Audit",
      item: `${SITE_URL}/cam-audit`,
    },
  ],
};

const AUDIT_CHECKLIST = [
  {
    area: "Expense Pool Screening",
    description:
      "Verify that non-recoverable items (CapEx, depreciation, debt service, executive salaries) are excluded from the CAM pool.",
  },
  {
    area: "Gross-Up Validation",
    description:
      "Confirm gross-up is applied only to variable expenses, not fixed costs like taxes and insurance. Check the occupancy percentage used.",
  },
  {
    area: "Pro-Rata Share Verification",
    description:
      "Validate each tenant's RSF against the lease and confirm the building denominator matches the measurement standard (BOMA 2017 vs 2024).",
  },
  {
    area: "Cap Enforcement",
    description:
      "Check cumulative and non-cumulative cap calculations. Verify the cap bank ledger is maintained correctly for cumulative structures.",
  },
  {
    area: "Base Year Accuracy",
    description:
      "For base year leases, verify the base year amount was calculated correctly and that subsequent years compare against the right baseline.",
  },
  {
    area: "Management Fee Review",
    description:
      "Confirm management fees are within the lease-specified percentage and that fees are not calculated on top of themselves (circularity).",
  },
];

const AUDIT_TRIGGERS = [
  {
    trigger: "Year-over-year CAM increase exceeds 10%",
    risk: "High",
  },
  {
    trigger: "Building occupancy drops below 80%",
    risk: "High",
  },
  {
    trigger: "New tenant auditor requests GL documentation",
    risk: "Critical",
  },
  {
    trigger: "Reconciliation statements delivered more than 120 days late",
    risk: "Medium",
  },
  {
    trigger: "Multiple tenants dispute the same line item",
    risk: "High",
  },
  {
    trigger: "Property changes ownership or management company",
    risk: "Medium",
  },
];

export default function CamAuditPage() {
  return (
    <div className="pb-24">
      <JsonLd data={articleSchema} />
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
              Looking for CAM audit software? CapVeri runs your CAM
              reconciliation for landlords. It checks gross-up math, expense
              caps, and pro-rata shares. It flags costs tenants should not pay.
              Upload your Yardi or MRI export. Get a tenant-ready statement in
              minutes.
            </p>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-8 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                Definition
              </p>
              <p className="text-sm text-foreground">
                A CAM audit is a review of a landlord&apos;s CAM charges against
                the general ledger, lease exclusions, and calculation method. It
                verifies gross-up accuracy, cap enforcement, pro-rata
                denominators, and expense pool composition. Tenants can request
                one under lease audit rights. Landlords can also run one
                proactively before issuing statements.
              </p>
            </div>
            <p className="text-xs text-muted-foreground mb-8">
              By{" "}
              <Link
                href="/about/angel-campa"
                className="font-medium hover:underline"
              >
                Angel Campa
              </Link>
              , Founder, CapVeri · Last updated: March 2026
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                View Pricing
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
              <Link
                href="/cam-reconciliation-guide"
                className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
              >
                <FileText className="h-4 w-4 mr-2" />
                CAM Reconciliation Guide
              </Link>
            </div>
          </div>
        </section>

        {/* Table of Contents */}
        <nav className="border-b py-8 bg-muted/20">
          <div className="container mx-auto max-w-5xl px-4">
            <p className="text-sm font-semibold mb-3">In this guide</p>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { href: "#what-auditors-check", label: "What Auditors Check" },
                { href: "#audit-triggers", label: "When to Audit" },
                { href: "#self-audit", label: "Self-Audit Process" },
                { href: "#software", label: "CAM Audit Software" },
                { href: "#tenant-rights", label: "Tenant Audit Rights" },
                { href: "#faq", label: "FAQs" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm hover:bg-muted/50 transition-colors duration-200"
                >
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* What Auditors Check */}
        <section id="what-auditors-check" className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              What CAM Auditors Look For
            </h2>
            <p className="text-muted-foreground mb-8 max-w-3xl">
              Professional tenant auditors follow a systematic checklist. These
              are the six areas that produce the most findings.
            </p>
            <div className="space-y-4">
              {AUDIT_CHECKLIST.map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-background p-5 flex gap-4"
                >
                  <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {i + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{item.area}</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* When to Audit */}
        <section id="audit-triggers" className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-warning" />
              When Should You Audit Your CAM?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              These scenarios signal that a CAM audit should be a priority:
              either proactive (before tenants ask) or reactive (because they
              already have).
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">CAM audit triggers</caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Trigger
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold w-[100px]"
                    >
                      Risk Level
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT_TRIGGERS.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3">{row.trigger}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.risk === "Critical"
                              ? "bg-destructive/10 text-destructive-strong"
                              : row.risk === "High"
                                ? "bg-warning/10 text-warning-foreground"
                                : "bg-primary/10 text-primary"
                          }`}
                        >
                          {row.risk}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Self-Audit Process */}
        <section id="self-audit" className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              How to Self-Audit Before Tenants Do
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              The most effective CAM audit is the one you run before issuing
              reconciliation statements. Here&apos;s the process.
            </p>
            <div className="space-y-4">
              {[
                {
                  step: "Export your GL",
                  detail:
                    "Pull the full-year operating expense GL from Yardi, MRI, or your property management system as a CSV or Excel file.",
                },
                {
                  step: "Screen against lease exclusions",
                  detail:
                    "Compare every GL line item against each tenant's lease exclusion list. Flag capital expenditures, depreciation, executive salaries, and debt service.",
                },
                {
                  step: "Validate gross-up math",
                  detail:
                    "Verify the occupancy percentage used, confirm only variable expenses are grossed up, and check that the gross-up formula matches lease language.",
                },
                {
                  step: "Check pro-rata denominators",
                  detail:
                    "Confirm each tenant's RSF matches the lease and that the building total denominator hasn't drifted from the measurement standard.",
                },
                {
                  step: "Enforce caps and base years",
                  detail:
                    "Run the cap calculation for every tenant with a controllable expense cap. Verify cumulative cap banks are tracked correctly.",
                },
                {
                  step: "Compare to prior year",
                  detail:
                    "Flag any line item that changed more than 15% year-over-year. Large swings are the first thing tenant auditors investigate.",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-background p-5 flex gap-4"
                >
                  <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {i + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{item.step}</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CAM Audit Software */}
        <section id="software" className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              CAM Audit Software: Manual vs Automated
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              Traditional CAM audits can take weeks and cost thousands. Software
              reduces the statement check to minutes.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  CapVeri vs traditional CAM audit comparison
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold w-[200px]"
                    >
                      Factor
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Traditional Audit Firm
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold text-primary"
                    >
                      CapVeri (Automated)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      factor: "Cost per property",
                      traditional: "$3,000–$15,000",
                      automated:
                        publicKnowledge.pricing.display.tierPriceLabels
                          .reconcile,
                    },
                    {
                      factor: "Time to results",
                      traditional: "2–6 weeks",
                      automated: "minutes",
                    },
                    {
                      factor: "Validation rules",
                      traditional: "Depends on auditor",
                      automated: "Same defined checks every time",
                    },
                    {
                      factor: "Gross-up verification",
                      traditional: "Manual recalculation",
                      automated: "Automated per lease",
                    },
                    {
                      factor: "Cap bank tracking",
                      traditional: "Spreadsheet reconstruction",
                      automated: "Automated cumulative ledger",
                    },
                    {
                      factor: "Audit trail",
                      traditional: "PDF report",
                      automated: "Finalized traceable snapshot",
                    },
                  ].map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {row.factor}
                      </td>
                      <td className="px-4 py-3">{row.traditional}</td>
                      <td className="px-4 py-3 font-medium text-primary">
                        {row.automated}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Tenant Audit Rights */}
        <section id="tenant-rights" className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Tenant Audit Rights: What Landlords Need to Know
            </h2>
            <div className="rounded-lg border bg-background p-6 max-w-3xl space-y-3">
              <p className="text-sm text-muted-foreground">
                Most commercial leases grant tenants the right to audit CAM
                charges within a specified window after receiving the
                reconciliation statement.
              </p>
              <ul className="space-y-2">
                {[
                  "Typical audit window: 12–36 months from statement delivery",
                  "Landlord must provide GL documentation within 30 days of request (some leases and California SB 1103)",
                  "If the audit finds overcharges exceeding a threshold (often 3–5%), the landlord typically pays audit costs",
                  "Proactive self-audits catch most of the errors a tenant auditor would find",
                ].map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-16 border-b bg-muted/30">
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

        {/* Related Tools */}
        <section className="py-12 border-b bg-muted/20">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-xl font-bold mb-3">Related Tools</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Tenants who need to verify CAM charges can run a forensic audit at{" "}
              <a
                href="https://www.camaudit.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                CAMAudit.io
              </a>
              .
            </p>
            <p className="text-sm text-muted-foreground">
              If you need to extract the lease terms first,{" "}
              <a
                href="https://www.lextract.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Lextract.io
              </a>{" "}
              abstracts commercial leases into structured data.
            </p>
          </div>
        </section>

        {/* Related Resources */}
        <section className="py-16 border-b">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-6">
              Related CAM Audit Resources
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
              {[
                {
                  href: "/cam-reconciliation-guide",
                  title: "CAM Reconciliation Guide",
                  description: "Complete step-by-step reconciliation process",
                },
                {
                  href: "/blog/cam-exclusion-list-complete-guide",
                  title: "CAM Exclusion List",
                  description: "Non-recoverable expense reference",
                },
            {
              href: "/tools/audit-risk-scorecard",
              title: "Pre-Send Audit Exposure Scorecard",
              description: "Check your packet before tenants do",
            },
                {
                  href: "/blog/cam-audit-defense-landlord-guide",
                  title: "Audit Defense Guide",
                  description: "How to respond to tenant audit requests",
                },
                {
                  href: "/resources/cam-gross-up-calculation-guide",
                  title: "Gross-Up Calculation Guide",
                  description: "Verify your gross-up methodology",
                },
                {
                  href: "/resources/cam-expense-caps",
                  title: "CAM Expense Caps",
                  description: "Cumulative vs non-cumulative cap math",
                },
                {
                  href: "/cam-charges",
                  title: "What Are CAM Charges?",
                  description:
                    "Complete breakdown of CAM charges, recoverable expenses, and billing norms.",
                },
                {
                  href: "/lease-abstraction",
                  title: "Lease Abstraction",
                  description:
                    "Extract audit-critical lease fields from PDFs automatically.",
                },
                {
                  href: "/case-studies",
                  title: "Case Studies",
                  description:
                    "Real results from the multi-pass extraction and audit pipeline.",
                },
                {
                  href: "/glossary",
                  title: "CAM Glossary",
                  description:
                    "Definitions for gross-up, pro-rata share, base year, and other CAM audit terms.",
                },
              ].map(({ href, title, description }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <p className="font-semibold text-sm mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">
                Run Your First Reconciliation Free
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Upload your GL export from Yardi, MRI, or AppFolio. CapVeri runs
                the reconciliation, checks every charge, and hands you a
                tenant-ready statement in minutes. No integration. No
                consultant.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
                <Link
                  href="/sample-report"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Sample Report
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
