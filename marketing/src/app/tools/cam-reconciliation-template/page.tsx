import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { TrackToolPageView } from "@/components/tracking/TrackToolPageView";
import {
  ArrowRight,
  CheckCircle,
  FileText,
  Table2,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation Template: Free Spreadsheet",
  description:
    "Free CAM reconciliation template with pre-built formulas for pro-rata share, gross-up, and cap calculations. Use the online generator or sign up to get the spreadsheet.",
  alternates: {
    canonical: `${SITE_URL}/tools/cam-reconciliation-template`,
  },
  openGraph: {
    title: "CAM Reconciliation Template: Free Spreadsheet",
    description:
      "Free CAM reconciliation template with pre-built formulas for pro-rata share, gross-up, and cap calculations. Use the online generator or sign up to get the spreadsheet.",
    url: `${SITE_URL}/tools/cam-reconciliation-template`,
    type: "website",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What should a CAM reconciliation template include?",
    answer:
      "A complete CAM reconciliation template should include: a recoverable expense summary with GL code mapping, gross-up calculation section (with variable/fixed expense split), pro-rata share calculation per tenant, CAM cap comparison (prior year vs. current year obligation), estimated payment summary, and a true-up amount per tenant. It should also track the reconciliation period dates and have space for supporting documentation references.",
  },
  {
    question: "Is this CAM reconciliation template free?",
    answer:
      "Yes. The reconciliation statement generator and downloadable Excel templates are free with no signup required. To run a full automated reconciliation from a GL export (with error detection, demand letters, and audit trail), you need a CapVeri account.",
  },
  {
    question:
      "What's the difference between a CAM reconciliation template and CAM reconciliation software?",
    answer:
      "A template (Excel or PDF) needs manual data entry and formula maintenance. CAM reconciliation software like CapVeri reads your GL export directly, runs all calculations automatically, finds billing errors, and builds the reconciliation statement. This cuts the manual work and reduces calculation risk.",
  },
  {
    question: "Can I use this template with Yardi or MRI data?",
    answer:
      "Yes. Export your GL report as a CSV or Excel from Yardi, MRI, AppFolio, or any ERP system, then use that data to populate the template. CapVeri's reconciliation generator also accepts these exports directly for fully automated calculation.",
  },
  {
    question: "Does this template comply with SB 1103 (California)?",
    answer:
      "The reconciliation statement generator includes California SB 1103 disclosure support for eligible commercial leases. It provides expense category and allocation-basis fields your team can review against the lease and counsel guidance.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Tools", url: `${SITE_URL}/tools` },
  {
    name: "CAM Reconciliation Template",
    url: `${SITE_URL}/tools/cam-reconciliation-template`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "Free CAM Reconciliation Template (Excel & PDF)",
  description:
    "Free CAM reconciliation template with pre-built formulas for pro-rata share, gross-up, and cap calculations. Use the online generator or sign up to get the spreadsheet.",
  url: `${SITE_URL}/tools/cam-reconciliation-template`,
  datePublished: "2026-03-21",
  dateModified: "2026-03-21",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE Tools",
});

const TEMPLATE_SECTIONS = [
  {
    icon: FileText,
    title: "Reconciliation Period Header",
    items: [
      "Property name and address",
      "Reconciliation year (Jan 1 – Dec 31 or fiscal year)",
      "Date prepared and landlord contact",
      "Tenant name and lease reference",
    ],
  },
  {
    icon: Table2,
    title: "Recoverable Expense Summary",
    items: [
      "Expense category (landscaping, cleaning, utilities, etc.)",
      "GL account code",
      "Total actual expenses",
      "Non-recoverable exclusions with lease reference",
      "Net recoverable amount",
    ],
  },
  {
    icon: CheckCircle,
    title: "Gross-Up Calculation Section",
    items: [
      "Fixed vs. variable expense split",
      "Actual occupancy % for the period",
      "Gross-up threshold (from lease)",
      "Grossed-up variable expense total",
      "Combined grossed-up pool",
    ],
  },
  {
    icon: Table2,
    title: "Pro-Rata Share Calculation",
    items: [
      "Tenant RSF",
      "Building denominator SF (as defined in lease)",
      "Pro-rata percentage",
      "Gross CAM obligation",
      "CAM cap comparison (if applicable)",
    ],
  },
  {
    icon: CheckCircle,
    title: "True-Up Calculation",
    items: [
      "Annual CAM obligation (after cap)",
      "Total estimated payments received",
      "True-up amount (balance due or credit)",
      "Payment due date",
    ],
  },
];

export default function CamReconciliationTemplatePage() {
  return (
    <div className="min-h-screen bg-background">
      <TrackToolPageView slug="cam-reconciliation-template" />
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      {/* Header */}
      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <nav className="text-sm text-muted-foreground mb-4">
            <Link
              href="/tools"
              className="hover:text-foreground transition-colors duration-200"
            >
              Tools
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">CAM Reconciliation Template</span>
          </nav>
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mt-1">
              <FileText className="h-3 w-3" />
              Free Template
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-3">
            Free CAM Reconciliation Template
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            Excel template and online generator for CAM reconciliation
            statements. Includes pre-built formulas for pro-rata share,
            gross-up, and cap calculations.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-3xl">
        {/* CTA box */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 mb-10">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Two ways to use this template
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-medium text-foreground mb-1">
                Online Generator (Free)
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Enter your data and get a formatted PDF reconciliation statement
                instantly. California SB 1103 disclosure support. No signup
                required.
              </p>
              <Button asChild size="sm" className="w-full">
                <Link href="/tools/reconciliation-statement-generator">
                  Use Online Generator
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-medium text-foreground mb-1">
                Spreadsheet Template (Free)
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Pre-formatted spreadsheet with gross-up formulas, pro-rata
                calculations, and cap tracking built in. Sign up free to
                get it.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <a href={buildTrialLink({ content: "cam_template_download" })}>
                  Get the free template
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* What's in the template */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            What&apos;s in the Template
          </h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            A complete CAM reconciliation template covers five sections. Most
            Excel templates found online only include the expense summary. The
            sections below are what make a reconciliation statement defensible
            when tenants review it.
          </p>
          <div className="space-y-5">
            {TEMPLATE_SECTIONS.map((section) => (
              <div
                key={section.title}
                className="rounded-lg border border-border p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <section.icon className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">
                    {section.title}
                  </h3>
                </div>
                <ul className="space-y-1.5">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-xs text-muted-foreground"
                    >
                      <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Template vs software */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Template vs. Software: Which Do You Need?
          </h2>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Feature
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-foreground">
                    Excel Template
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-foreground">
                    CapVeri Software
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  [
                    "Cost",
                    "Free",
                    publicKnowledge.pricing.display.tierPriceLabels.reconcile,
                  ],
                  ["Data entry", "Manual (from GL)", "Automated (CSV import)"],
                  [
                    "Gross-up calculations",
                    "Formula-based (manual setup)",
                    "Automated per lease terms",
                  ],
                  [
                    "Cap tracking",
                    "Manual formula",
                    "Automated cumulative/non-cumulative",
                  ],
                  [
                    "Error detection",
                    "None",
                    "Flags calculation errors vs. prior year",
                  ],
                  ["Demand letters", "Write manually", "Auto-generated"],
                  ["Audit trail", "None", "Full version history"],
                  [
                    "SB 1103 compliance (CA)",
                    "Formatted template",
                    "Validated layout + checks",
                  ],
                  [
                    "Works with Yardi/MRI",
                    "Paste from export",
                    "Direct CSV import",
                  ],
                ].map(([feature, template, software]) => (
                  <tr key={feature} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground text-sm">
                      {feature}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                      {template}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                      {software}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* State-specific variants */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            State-Specific Template Considerations
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                state: "California (SB 1103)",
                note: "Requires specific expense disclosure format for small business tenants. Template must show each expense line item and basis for allocation.",
                href: "/resources/commercial-tenant-cam-disclosure-by-state",
              },
              {
                state: "Texas",
                note: "No statutory reconciliation requirement, but HCAD tax protest outcomes affect CAM recovery. Use the HCAD Tax Normalizer for accurate calculations.",
                href: "/resources/commercial-tenant-cam-disclosure-by-state",
              },
              {
                state: "Florida",
                note: "Florida commercial leases commonly use non-cumulative caps. Ensure your template tracks prior-year CAM correctly for accurate cap application.",
                href: "/resources/commercial-tenant-cam-disclosure-by-state",
              },
              {
                state: "New York",
                note: "Class A office leases in NYC often use base year or expense stop structures. Standard pro-rata templates may not apply. Use the Base Year Escalation Calculator.",
                href: "/resources/commercial-tenant-cam-disclosure-by-state",
              },
            ].map((item) => (
              <Link
                key={item.state}
                href={item.href}
                className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors duration-200"
              >
                <div className="text-sm font-semibold text-foreground mb-1">
                  {item.state}
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {item.note}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Related tools */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Related Tools
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                title: "CAM Gross-Up Calculator",
                href: "/tools/cam-gross-up-calculator",
              },
              {
                title: "Pro-Rata Share Calculator",
                href: "/tools/pro-rata-calculator",
              },
              {
                title: "CAM Cap Calculator",
                href: "/tools/cam-cap-calculator",
              },
              {
                title: "Base Year Escalation Calculator",
                href: "/tools/base-year-escalation",
              },
              {
                title: "How to Calculate CAM Charges",
                href: "/resources/how-to-calculate-cam-charges",
              },
              {
                title: "CAM Reconciliation Guide",
                href: "/cam-reconciliation-guide",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors duration-200"
              >
                <ArrowRight className="h-4 w-4 flex-shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "What should a CAM reconciliation template include?",
                a: "A complete CAM reconciliation template should include: a recoverable expense summary with GL code mapping, gross-up calculation section (variable/fixed expense split), pro-rata share calculation per tenant, CAM cap comparison (prior year vs. current year obligation), estimated payment summary, and a true-up amount per tenant.",
              },
              {
                q: "Is this CAM reconciliation template free?",
                a: "Yes. The reconciliation statement generator and downloadable Excel templates are free with no signup required. Automated reconciliation from a GL export (with error detection, demand letters, and audit trail) requires a CapVeri account.",
              },
              {
                q: "What's the difference between a CAM reconciliation template and CAM reconciliation software?",
                a: "A template (Excel or PDF) needs manual data entry and formula maintenance. CAM reconciliation software reads your GL export directly, runs all calculations, finds billing errors, and builds the reconciliation statement. This cuts the manual work and reduces calculation risk.",
              },
              {
                q: "Can I use this template with Yardi or MRI data?",
                a: "Yes. Export your GL report as a CSV or Excel from Yardi, MRI, AppFolio, or any ERP system, then use that data to populate the template. CapVeri's reconciliation generator also accepts these exports directly for fully automated calculation.",
              },
              {
                q: "Does this template comply with SB 1103 (California)?",
                a: "The reconciliation statement generator includes California SB 1103 disclosure support for eligible commercial leases. It provides expense category and allocation-basis fields your team can review against the lease and counsel guidance.",
              },
            ].map((item) => (
              <div key={item.q}>
                <h3 className="font-semibold text-foreground mb-2 text-sm">
                  {item.q}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <div className="rounded-xl bg-foreground text-background p-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            Automate the Whole Reconciliation
          </h2>
          <p className="text-background/70 mb-6 text-sm max-w-md mx-auto">
            Import your GL export from Yardi or MRI. CapVeri calculates pro-rata
            share, gross-up, and caps automatically. It also flags errors your
            current process misses.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "template_page_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
