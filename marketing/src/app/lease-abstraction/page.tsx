import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Upload,
  Cpu,
  ShieldCheck,
  AlertTriangle,
  Clock,
  FileText,
  HelpCircle,
  Zap,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

const entryPlan = publicKnowledge.pricing.tiers.find(
  (tier) => tier.id === "reconcile",
);

export const metadata: Metadata = {
  title: "Lease Abstraction Software for CAM Reconciliation",
  description:
    "CapVeri extracts CAM-critical lease fields (base year, gross-up threshold, pro-rata share, expense caps) from PDFs in minutes. Purpose-built for CAM reconciliation, with clause-level citations for every extracted field.",
  alternates: {
    canonical: `${SITE_URL}/lease-abstraction`,
  },
  openGraph: {
    title: "Lease Abstraction Software for CAM Reconciliation",
    description:
      "Lease abstraction software that extracts CAM-critical fields from PDFs in minutes. Audit-defensible output linked to exact lease clauses.",
    url: `${SITE_URL}/lease-abstraction`,
    type: "website",
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CapVeri Lease Abstraction",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Multi-pass AI lease abstraction software that extracts CAM-critical fields from commercial lease PDFs - including base year, gross-up threshold, pro-rata share, expense caps, and exclusions - with citations to exact lease clause numbers.",
  url: `${SITE_URL}/lease-abstraction`,
  offers: publicKnowledge.structuredData.pricingOffers,
  featureList:
    "Extracts base year, gross-up threshold, pro-rata share, CAM caps, and exclusions; Cites exact lease clause numbers for every extracted field; Processes PDF and scanned lease documents; Works with CSV or Excel exports from Yardi, MRI, and AppFolio; Produces audit-defensible reconciliation output",
  publisher: {
    "@type": "Organization",
    name: "CapVeri",
    url: SITE_URL,
  },
};

const productSchema = structuredDataSchemas.product({
  name: "CapVeri Lease Abstraction",
  description: softwareSchema.description,
  url: `${SITE_URL}/lease-abstraction`,
});

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Abstract a Commercial Lease for CAM Reconciliation",
  description:
    "Upload your lease PDF, let CapVeri's multi-pass AI extract CAM-critical fields, then verify and reconcile against your GL export.",
  totalTime: "PT10M",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Upload Lease PDF",
      text: "Upload your commercial lease PDF (including scanned or low-quality documents). CapVeri accepts standard PDFs and image-based files processed through OCR.",
      url: `${SITE_URL}/lease-abstraction#step-1`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "AI Extracts CAM-Critical Fields",
      text: "CapVeri's multi-pass AI pipeline extracts base year, gross-up threshold, pro-rata share denominator, CAM caps, expense exclusions, and audit rights. Each field is linked to the exact clause number in the lease.",
      url: `${SITE_URL}/lease-abstraction#step-2`,
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Verify and Reconcile",
      text: "Review flagged fields, approve or correct the extraction, then run the full CAM reconciliation against your GL export. Every figure traces back to a GL line and a lease clause.",
      url: `${SITE_URL}/lease-abstraction#step-3`,
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is lease abstraction software?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Lease abstraction software extracts key terms from commercial lease documents (including base year, pro-rata share, gross-up threshold, CAM caps, expense exclusions, and audit rights) and converts them into structured, machine-readable data. Purpose-built tools for CAM reconciliation also link each extracted field to the exact clause number in the lease.",
      },
    },
    {
      "@type": "Question",
      name: "Which lease fields does CapVeri extract for CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri extracts the nine fields most critical to CAM billing accuracy: lease type, base year and base year amount, gross-up threshold (e.g., 95%), pro-rata share and denominator definition, controllable/uncontrollable expense split, CAM cap structure (cumulative vs. non-cumulative), expense exclusions, management fee cap, and tenant audit rights window.",
      },
    },
    {
      "@type": "Question",
      name: "How is CapVeri different from general lease abstraction tools like Leasecake or LeasePilot?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "General lease abstraction tools capture broad lease terms for portfolio visibility. CapVeri's extraction is built for CAM reconciliation math: every extracted field feeds directly into the reconciliation calculation, is cited to its exact lease clause, and flags conflicts that would cause billing errors. It is not a lease management system. It is a financial accuracy tool.",
      },
    },
    {
      "@type": "Question",
      name: "Can CapVeri process scanned or image-based lease PDFs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. CapVeri processes image-based and low-quality scanned PDFs through a document-reader pipeline before running the multi-pass extraction workflow. The extraction quality is flagged by confidence score so you can prioritize manual review for low-confidence fields.",
      },
    },
    {
      "@type": "Question",
      name: "Does CapVeri integrate with Yardi or MRI for lease data?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CapVeri needs no API connection. You export a CSV or Excel file from Yardi Voyager, MRI Software, AppFolio, or another property system, then upload that file. There are no integration fees, and it works with any version of those systems, including old on-premise installs.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best AI lease abstraction software for commercial real estate?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The best AI lease abstraction software depends on your use case. For CAM reconciliation specifically, CapVeri is purpose-built: its multi-pass AI extracts the nine fields that drive billing accuracy (base year, gross-up threshold, pro-rata share, caps, exclusions) and cites the exact clause number for each. General-purpose tools like Visual Lease and LeaseQuery focus on portfolio management and ASC 842 compliance respectively, but lack CAM-specific extraction and integrated reconciliation workflows.",
      },
    },
    {
      "@type": "Question",
      name: "How does lease abstraction automation reduce CAM billing errors?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Lease abstraction automation eliminates the manual re-keying errors that cause CAM billing disputes. When a paralegal misreads a gross-up threshold (e.g., 90% instead of 95%) or uses the wrong pro-rata denominator, the error compounds across every tenant for the life of the lease. Automated extraction with clause-level citations lets property managers verify each field against the source document in seconds, catching errors before they reach the reconciliation calculation.",
      },
    },
    {
      "@type": "Question",
      name: "How much does lease abstraction software cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Enterprise lease abstraction platforms like Visual Lease and LeaseQuery require custom quotes and multi-week implementations. Manual outsourcing costs $200-$800 per lease in labor. CapVeri Reconcile starts with ${entryPlan?.display.annualLabel ?? publicKnowledge.pricing.display.launchOfferLabel}. ${publicKnowledge.pricing.display.launchOfferTerms} There is no implementation timeline. Upload a lease PDF and get extracted fields in minutes.`,
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
      name: "Lease Abstraction",
      item: `${SITE_URL}/lease-abstraction`,
    },
  ],
};

const COMPARISON_ROWS = [
  {
    criterion: "AI-assisted extraction",
    manual: "None",
    visualLease: "Template-based",
    leaseQuery: "Accounting-focused",
    capveri: "AI-assisted extraction with confidence scores",
  },
  {
    criterion: "Accuracy transparency",
    manual: "Depends on analyst",
    visualLease: "No public guarantee",
    leaseQuery: "No public guarantee",
    capveri: "Clause-level citations for every field",
  },
  {
    criterion: "Setup time",
    manual: "N/A (ongoing labor)",
    visualLease: "Weeks to months",
    leaseQuery: "Weeks to months",
    capveri: "Upload and go. No implementation.",
  },
  {
    criterion: "Cost",
    manual: "$200–$800/lease in labor",
    visualLease: "Enterprise pricing (custom quote)",
    leaseQuery: "Enterprise pricing (custom quote)",
    capveri: `Starts at $${entryPlan?.launchAnnual ?? 998}/year. ${publicKnowledge.pricing.display.launchOfferTerms}`,
  },
  {
    criterion: "CAM reconciliation integration",
    manual: "Separate spreadsheet process",
    visualLease: "Lease admin only",
    leaseQuery: "ASC 842 accounting focus",
    capveri: "Integrated - same workflow",
  },
  {
    criterion: "BOMA 2024 aligned workflows",
    manual: "Manual interpretation",
    visualLease: "Not specialized",
    leaseQuery: "Not specialized",
    capveri: "Built-in BOMA 2024 field mapping",
  },
  {
    criterion: "Scanned PDF support",
    manual: "Yes (manual reading)",
    visualLease: "Limited",
    leaseQuery: "Limited",
    capveri: "Yes - document-reader OCR fallback",
  },
];

const CAM_FIELDS = [
  { field: "Lease Type", example: "NNN, Modified Gross, Full Service" },
  { field: "Base Year / Expense Stop", example: "2022, $8.50/SF" },
  { field: "Gross-Up Threshold", example: "95% occupancy" },
  { field: "Pro-Rata Share & Denominator", example: "63.54% of 87,200 RSF" },
  {
    field: "Controllable / Uncontrollable Split",
    example: "Taxes + insurance excluded from cap",
  },
  {
    field: "CAM Cap Structure",
    example: "5% cumulative on controllables",
  },
  {
    field: "Expense Exclusions",
    example: "CapEx, debt service, above-market mgmt fee",
  },
  { field: "Management Fee Cap", example: "3% of gross revenues" },
  {
    field: "Audit Rights Window",
    example: "12 months after statement delivery",
  },
];

export default function LeaseAbstractionPage() {
  return (
    <div className="pb-24">
      <JsonLd data={softwareSchema} />
      <JsonLd data={productSchema} />
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="flex flex-col">
        {/* Hero */}
        <section className="border-b bg-gradient-to-b from-primary/5 to-background py-16 md:py-24">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
                <Cpu className="h-3.5 w-3.5 mr-1.5" />
                AI Lease Extraction
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Lease Abstraction Software Built for CAM Reconciliation
            </h1>
            <p className="text-xl text-muted-foreground mb-3 max-w-3xl">
              CapVeri&apos;s AI pulls the nine lease fields that drive CAM
              billing accuracy. That means base year, gross-up threshold,
              pro-rata share, caps, and exclusions. It reads them from any PDF.
              Each field links to its exact clause number.
            </p>
            {/* Answer primitive - definition in top 150 words for AI citation */}
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-8 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                Definition
              </p>
              <p className="text-sm text-foreground">
                Lease abstraction software extracts key contractual terms from
                commercial lease PDFs (including base year, pro-rata share,
                gross-up threshold, CAM caps, and expense exclusions) and
                converts them into structured data. CAM-specific tools link each
                extracted field to the exact lease clause so that downstream
                reconciliation math is audit-defensible.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={buildTrialLink({ content: "lease_abstraction_hero" })}
                className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start free trial
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
              <Link
                href="/tools/lease-abstract-matrix"
                className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
              >
                <FileText className="h-4 w-4 mr-2" />
                Lease Abstract Matrix
              </Link>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 border-b" id="how-it-works">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              How CapVeri Abstracts a Lease
            </h2>
            <p className="text-muted-foreground mb-10">
              Three steps from PDF upload to audit-ready reconciliation.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="rounded-lg border p-6 relative" id="step-1">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 mb-4">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <div className="text-xs font-mono text-muted-foreground mb-1">
                  Step 1
                </div>
                <h3 className="font-semibold mb-2">Upload Lease PDF</h3>
                <p className="text-sm text-muted-foreground">
                  Upload any commercial lease: native PDF or scanned document.
                  The document-reader pipeline handles image-based files. No
                  template required.
                </p>
              </div>
              <div className="rounded-lg border p-6 relative" id="step-2">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 mb-4">
                  <Cpu className="h-5 w-5 text-primary" />
                </div>
                <div className="text-xs font-mono text-muted-foreground mb-1">
                  Step 2
                </div>
                <h3 className="font-semibold mb-2">AI Extracts CAM Fields</h3>
                <p className="text-sm text-muted-foreground">
                  A multi-pass pipeline extracts the nine CAM-critical fields,
                  assigning a confidence score to each and citing the exact
                  clause number so you can verify in seconds.
                </p>
              </div>
              <div className="rounded-lg border p-6 relative" id="step-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 mb-4">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div className="text-xs font-mono text-muted-foreground mb-1">
                  Step 3
                </div>
                <h3 className="font-semibold mb-2">Verify and Reconcile</h3>
                <p className="text-sm text-muted-foreground">
                  Review flagged fields, approve the extraction, then run the
                  full CAM reconciliation against your GL export. Every figure
                  traces to a GL entry and a lease clause.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What Gets Extracted */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              The 9 CAM-Critical Fields CapVeri Extracts
            </h2>
            <p className="text-muted-foreground mb-6">
              General lease abstraction tools capture broad portfolio terms.
              CapVeri extracts specifically the fields that determine whether
              your CAM bill is correct.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  CAM-critical lease abstraction fields
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Field
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Example Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CAM_FIELDS.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 font-medium">{row.field}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {row.example}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Each field is linked to the exact section number in the lease.
              Confidence scores below 80% are flagged for human review.
            </p>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              Lease Abstraction Software Comparison: CapVeri vs. Visual Lease
              vs. LeaseQuery
            </h2>
            <p className="text-muted-foreground mb-6">
              Most lease abstraction tools were built for portfolio management
              or lease accounting, not CAM reconciliation math.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Lease abstraction software comparison
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold w-[180px]"
                    >
                      Criterion
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Manual
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Visual Lease
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      LeaseQuery
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
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {row.criterion}
                      </td>
                      <td className="px-4 py-3">{row.manual}</td>
                      <td className="px-4 py-3">{row.visualLease}</td>
                      <td className="px-4 py-3">{row.leaseQuery}</td>
                      <td className="px-4 py-3 font-medium text-primary">
                        {row.capveri}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Why Bad Abstraction Causes Billing Errors */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-warning" />
              Why Inaccurate Lease Abstraction Causes CAM Errors
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  title: "Wrong gross-up threshold",
                  body: "Applying 90% when the lease says 95% understates the normalized expense pool. At $500K of variable expenses and 78% occupancy, that single field drives a $14,000 billing error.",
                },
                {
                  title: "Misread pro-rata denominator",
                  body: "Many leases define the denominator as total leasable RSF, not total building RSF. Using the wrong number inflates every tenant's pro-rata share for the life of the lease.",
                },
                {
                  title: "Missing expense exclusions",
                  body: "If CapEx, depreciation, or above-market management fees are left in the recoverable pool, tenants are paying for costs they have no lease obligation to cover. This is a common dispute trigger.",
                },
                {
                  title: "CAM cap applied to wrong pool",
                  body: "Caps apply only to controllable expenses. Applying a 5% cap to total CAM (including taxes and insurance) understates recoveries. Ignoring the cap entirely overbills tenants.",
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

        {/* Key Benefits */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-8">
              What Landlords Get from CapVeri Extraction
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: Clock,
                  title: "10-minute turnaround",
                  body: "Vs. 4-8 hours of manual abstraction per lease. No paralegal, no outsourcing queue.",
                },
                {
                  icon: FileText,
                  title: "Clause-level citations",
                  body: "Every extracted field links to the section number in the lease. One click to verify in the original document.",
                },
                {
                  icon: ShieldCheck,
                  title: "Audit-defensible output",
                  body: "Each CAM figure in the reconciliation traces back to a GL line item and a specific lease clause. Ready for tenant audit requests.",
                },
                {
                  icon: Zap,
                  title: "Integrated reconciliation",
                  body: "Extracted fields feed directly into the CAM calculation engine. No re-keying, no spreadsheet hand-off.",
                },
                {
                  icon: CheckCircle,
                  title: "Conflict detection",
                  body: "CapVeri flags fields that conflict with each other (e.g., a cumulative cap applied to a non-cumulative base) before the reconciliation runs.",
                },
                {
                  icon: Cpu,
                  title: "Scanned PDF support",
                  body: "The document-reader pipeline handles image-based leases and low-quality scans. Confidence scores identify which fields need human review.",
                },
              ].map(({ icon: Icon, title, body }, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">{title}</p>
                    <p className="text-sm text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQs */}
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

        {/* Related Tools */}
        <section className="py-12 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
              <p className="text-sm font-semibold text-primary/90 mb-2">
                Need full-scope lease abstraction beyond CAM-specific terms?
              </p>
              <p className="text-sm text-primary">
                <a
                  href="https://www.lextract.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline underline-offset-2 hover:no-underline"
                >
                  lextract.io
                </a>{" "}
                extracts 126 structured fields from any commercial lease PDF -
                covering the complete lease data set for tenant reps, lease
                admins, and CRE law firms. CapVeri focuses on the nine
                CAM-critical fields; lextract.io covers the full lease from
                commencement date to renewal options to assignment rights.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold mb-6">Related Resources</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    href: "/cam-audit",
                    title: "CAM Audit Software",
                    description:
                      "Run your CAM numbers right. They hold up to any tenant audit.",
                  },
                  {
                    href: "/cam-reconciliation-guide",
                    title: "CAM Reconciliation Guide",
                    description:
                      "Step-by-step reconciliation process from GL export to demand letter.",
                  },
                  {
                    href: "/cam-charges",
                    title: "What Are CAM Charges?",
                    description:
                      "Complete breakdown of CAM charges and recoverable expense categories.",
                  },
                  {
                    href: "/case-studies",
                    title: "Extraction Case Studies",
                    description:
                      "Real results from the multi-pass lease extraction pipeline.",
                  },
                  {
                    href: "/tools/lease-abstract-matrix",
                    title: "Lease Abstract Matrix",
                    description:
                      "Free tool to organize and compare extracted lease terms.",
                  },
                  {
                    href: "/glossary",
                    title: "CAM Glossary",
                    description:
                      "Lease abstraction terms: expense stop, CAM cap, base year, and more.",
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
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">
                Abstract Your First Lease Free
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Upload a lease PDF and see every CAM-critical field extracted,
                cited to its clause number, and ready to feed into the
                reconciliation in minutes. Volume-based package details are
                maintained on the pricing page.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href={buildTrialLink({
                    content: "lease_abstraction_bottom_cta",
                  })}
                  className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4 ml-2" />
                </a>
                <Link
                  href="/tools/lease-abstract-matrix"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Lease Abstract Matrix Tool
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
