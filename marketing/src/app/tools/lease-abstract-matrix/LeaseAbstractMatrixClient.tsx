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
    applicationSubCategory: "Spreadsheet Tool",
    name: "Lease Abstract Discrepancy Matrix",
    description:
      "Track CAM caps, expense stops, and admin fee carve-outs across your portfolio. Excel tool that auto-flags missing caps and stale reconciliations.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/lease-abstract-matrix"),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Track Lease Abstract Discrepancies Across a Portfolio",
    description:
      "Download and use the free Lease Abstract Discrepancy Matrix to identify missing CAM caps, stale reconciliations, and inconsistent lease terms.",
    totalTime: "PT15M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Enter your email",
        text: "Submit your email address to receive the download link instantly.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Download the matrix",
        text: "Open the Excel file in Microsoft Excel 2016+ or Google Sheets.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Enter lease terms per tenant",
        text: "Fill in one row per tenant with lease structure (NNN, gross, modified gross), CAM cap terms, expense stops, and admin fee carve-outs.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review auto-flagged discrepancies",
        text: "The matrix auto-flags missing CAM caps, stale reconciliations (12+ months), and inconsistent data across your portfolio.",
      },
    ],
  },
];

const LEASE_ABSTRACT_FAQS = [
  {
    question: "What is a lease abstract matrix?",
    answer:
      "A lease abstract matrix is a spreadsheet that pulls and organizes the key financial terms from every lease in a property. For CAM reconciliation, it tracks caps, expense stops, admin fees, base year amounts, pro-rata shares, and excluded expense categories across all tenants.",
  },
  {
    question: "Why do missing lease abstracts cause CAM errors?",
    answer:
      "Without a central abstract, controllers must re-read each lease for every reconciliation cycle. This leads to missed cap escalators, forgotten exclusion clauses, wrong base year amounts, and admin fee errors. All of these are common sources of CAM billing mistakes.",
  },
  {
    question: "What CAM terms should a lease abstract track?",
    answer:
      "At minimum: tenant name, suite, leased SF, pro-rata share, lease start and end, CAM cap (fixed or CPI), cap escalator percentage, expense stop amount, base year, admin fee percentage, excluded expense categories, and any special terms like anchor exclusions or gross-up thresholds.",
  },
  {
    question: "How often should lease abstracts be updated?",
    answer:
      "Review and update abstracts at every lease execution, renewal, amendment, and expansion. Many portfolios also do an annual check of all abstracts before reconciliation season to catch stale data, especially cap escalators that grow each year.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(LEASE_ABSTRACT_FAQS);

const BENEFITS = [
  "One row per tenant: NNN, gross, and modified gross structures",
  "Auto-flags missing CAM caps, stale reconciliations (12+ months), and inconsistent data",
  "Works for inherited portfolios with no existing lease abstracts",
  "Excel-based and formula-driven. No proprietary software needed.",
];

export function LeaseAbstractMatrix() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/lease-abstract-matrix/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Lease Abstract Discrepancy Matrix | CapVeri"
      description="Track CAM caps, expense stops, and admin fee carve-outs across your portfolio. Excel tool that auto-flags missing caps and stale reconciliations."
      canonical={buildSiteUrl("/tools/lease-abstract-matrix")}
      toolName="Lease Abstract Matrix"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Lease Abstract Discrepancy Matrix
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Track CAM caps, expense stops, and admin fee carve-outs across
              your portfolio.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  A lease abstract matrix tracks the key CAM terms across every
                  lease: caps, escalators, expense stops, admin fee carve-outs,
                  and exclusion categories.
                </strong>{" "}
                Without one, property controllers rely on memory or scattered
                notes. That leads to missed caps and billing errors.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column layout */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 max-w-5xl">
            {/* Left: benefits */}
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
                    Built for inherited portfolios.
                  </strong>{" "}
                  Works even if you don&apos;t have existing lease abstracts -
                  just enter what you know and let the flags guide you.
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
                to automate CAM reconciliation across your portfolio.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free matrix
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="lease-abstract-matrix"
                ctaLabel="Download Free Matrix"
                onSuccess={handleSuccess}
                source="tools-page"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {LEASE_ABSTRACT_FAQS.map((faq) => (
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
