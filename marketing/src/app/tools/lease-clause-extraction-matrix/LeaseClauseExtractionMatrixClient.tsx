"use client";

import { APP_URL } from "@/lib/site";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { LeadCaptureForm } from "@/components/lead-capture/LeadCaptureForm";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    applicationCategory: "FinanceApplication",
    name: "Lease Clause Extraction Matrix",
    description:
      "A structured spreadsheet for abstracting the 15 CAM-relevant lease clauses across your portfolio. Covers denominators, gross-up thresholds, cap types, exclusions, and audit rights windows.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/lease-clause-extraction-matrix"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "What lease clauses matter most for CAM?",
    answer:
      "The 15 CAM-critical lease fields captured in the matrix are: (1) denominator definition (fixed, floating, or gross-up), (2) gross-up occupancy threshold, (3) gross-up percentage, (4) cap type (cumulative, non-cumulative, or none), (5) cap percentage, (6) base year definition and amount, (7) controllable vs. non-controllable expense split, (8) management fee cap or definition, (9) CAM exclusion list (e.g., capital expenditures, structural repairs), (10) estimated CAM obligation, (11) reconciliation delivery deadline, (12) tenant audit rights window, (13) dispute resolution procedure, (14) audit cost allocation, and (15) lease year definition (calendar vs. fiscal). Missing or incorrect data in any of these fields will produce calculation errors.",
  },
  {
    question: "How long does it take to abstract a lease for CAM purposes?",
    answer:
      "Abstracting the 15 CAM fields from a well-organized commercial lease typically takes 20 to 45 minutes per lease for an experienced lease administrator. Complex leases with multiple amendments, side letters, or unusual CAM structures can take longer. The matrix is designed to minimize abstraction time by providing exact field definitions, the typical location in a commercial lease where each clause appears, and guidance on how to interpret ambiguous language. For portfolios with more than 20 to 30 leases, consider abstracting in batches during the pre-reconciliation period.",
  },
  {
    question: "Can I use this for all commercial lease types?",
    answer:
      "Yes. The matrix works for office, retail, industrial, flex, and mixed-use commercial leases. NNN leases, modified gross leases, and full gross leases all have CAM implications. The specific fields that apply will vary (a full gross lease may not have a separate CAM reconciliation provision, for example), and the matrix includes guidance on how to handle each lease type. The built-in validation flags fields that are required for the lease type you select and marks as not-applicable the fields that do not apply.",
  },
  {
    question: "How often should I update my lease abstract matrix?",
    answer:
      "The matrix should be updated whenever a lease is amended, renewed, or assigned. At minimum, review all abstracts annually at the start of the reconciliation preparation period to confirm that any amendments executed during the year have been captured. The most common source of reconciliation errors at large portfolios is stale abstract data. A gross-up threshold changed in a lease amendment but never updated in the system is a common example. The matrix includes a last-reviewed date field and a flag column for leases that are due for re-review.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "15 CAM-critical lease fields with definitions and where-to-find-it guidance",
  "Portfolio-level view of all tenant CAM terms in one spreadsheet",
  "Built-in validation to flag inconsistencies and missing data",
  "Calculates expected pro-rata share for each tenant automatically",
];

export function LeaseClauseExtractionMatrixClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/lease-clause-extraction-matrix/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Lease Clause Extraction Matrix (XLSX) | CapVeri"
      description="A structured spreadsheet for abstracting the 15 CAM-relevant lease clauses across your portfolio. Covers denominators, gross-up thresholds, cap types, exclusions, and audit rights windows."
      canonical={buildSiteUrl("/tools/lease-clause-extraction-matrix")}
      toolName="Lease Clause Extraction Matrix"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Lease Clause Extraction Matrix
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Abstract the 15 CAM-relevant lease clauses across your portfolio
              in one structured spreadsheet. Covers every field that drives
              reconciliation accuracy.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  More CAM reconciliation errors come from stale or missing
                  lease abstracts than from calculation mistakes.
                </strong>{" "}
                When the denominator, gross-up threshold, or cap type in your
                system does not match the executed lease, every reconciliation
                you run for that tenant is wrong. This matrix gives your team a
                structured way to capture and maintain the 15 lease fields that
                drive every CAM calculation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 max-w-5xl">
            {/* Benefits */}
            <div>
              <h2 className="text-xl font-semibold mb-6">What&apos;s inside</h2>
              <ul className="space-y-4">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">
                    Built for lease administrators and property controllers
                  </strong>{" "}
                  building a CAM-focused lease abstract for their portfolio.
                </p>
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href={`${APP_URL}/auth/login`}
                  className="underline hover:text-foreground"
                >
                  Log in
                </Link>{" "}
                to access this and all other tools.
              </p>
            </div>
            {/* Lead capture */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free matrix
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="lease-clause-extraction-matrix"
                ctaLabel="Download Free Lease Clause Matrix"
                onSuccess={handleSuccess}
                source="tools-page"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {TOOL_FAQS.map((faq) => (
                <details key={faq.question} className="group border rounded-lg">
                  <summary className="flex cursor-pointer select-none items-center justify-between p-4 font-medium">
                    {faq.question}
                    <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 text-muted-foreground text-sm leading-relaxed">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </ToolPageLayout>
  );
}
