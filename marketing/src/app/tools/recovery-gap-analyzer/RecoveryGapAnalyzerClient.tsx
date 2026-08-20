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
    applicationSubCategory: "Calculator",
    name: "CAM Billing Gap Analyzer - NOI & Property Value Impact",
    description:
      "Measure CAM billing variance in dollars, estimate NOI impact, and model property value impact with a cap rate multiplier.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    datePublished: "2026-03-18",
    url: buildSiteUrl("/tools/recovery-gap-analyzer"),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Measure CAM Billing Variance and Property Value Impact",
    description:
      "Download and use the free Billing Gap Analyzer to measure CAM billing variance and estimate its effect on NOI and property value.",
    totalTime: "PT10M",
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
        name: "Download the analyzer",
        text: "Open the Excel file in Microsoft Excel 2016+ or Google Sheets.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Input expense and billing data",
        text: "Enter allowed operating expenses, tenant CAM billings, and your property's market cap rate.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review the billing gap and value impact",
        text: "See billing variance in dollars, the NOI impact, and the property value impact calculated through the cap rate multiplier.",
      },
    ],
  },
];

const RECOVERY_FAQS = [
  {
    question: "What is a CAM billing ratio and what is a good benchmark?",
    answer:
      "The billing ratio compares tenant CAM billings to allowed operating expenses. A ratio near 100% means the billing matches lease math before credits and true-ups. What counts as normal shifts with property type and lease terms. Compare your ratio to your own past years.",
  },
  {
    question:
      "How does the cap rate multiplier affect a CAM billing gap?",
    answer:
      "Every dollar of CAM billing variance can change NOI. Property value is often estimated by dividing NOI by cap rate. At a 6% cap rate, $1 of NOI variance translates to $16.67 of property value impact (1 / 0.06).",
  },
  {
    question: "What are the most common sources of a CAM billing gap?",
    answer:
      "The top sources are excluded costs, incorrect pro-rata share denominators, missing gross-up on variable costs, capital costs coded to the wrong bucket, admin fee errors, and vacant space rules. These sources often stack, so even careful billing can drift from lease math.",
  },
  {
    question: "How often should I review my billing ratio?",
    answer:
      "At minimum, review your billing ratio during every annual reconciliation. Quarterly review is better for large portfolios. Compare year-to-date billings against year-to-date expenses so you can spot a billing gap early.",
  },
  {
    question:
      "How do institutional investors evaluate CAM billing variance during acquisitions?",
    answer:
      "Institutional buyers and their advisors review CAM billing variance as part of due diligence. Large unexplained variance can point to lease limits, coding issues, or weak billing support. Clear math helps buyers trust the NOI they are underwriting.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(RECOVERY_FAQS);

const BENEFITS = [
  "Measures CAM billing variance in dollars",
  "Shows NOI impact from billing variance",
  "Calculates property value impact via cap rate multiplier",
  "Compares your billing ratio against your own baseline",
];

export function RecoveryGapAnalyzer() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/recovery-gap-analyzer/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free CAM Billing Gap Analyzer - NOI & Value Impact | CapVeri"
      description="Measure CAM billing variance in dollars, estimate NOI impact, and see property value impact via cap rate multiplier."
      canonical={buildSiteUrl("/tools/recovery-gap-analyzer")}
      toolName="Billing Gap Analyzer"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free CAM Billing Gap Analyzer
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              See CAM billing variance and its impact on property value.
              Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  CAM billing variance can change NOI and asset value. The cap
                  rate multiplier shows the effect.
                </strong>{" "}
                Take a $50,000 annual billing variance at a 6% cap rate. That
                means $833,000 in modeled property value impact. This analyzer
                measures the gap and shows the NOI effect. CapVeri then checks
                both over-billing and under-billing in a full reconciliation.
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
                    Critical for asset managers and controllers
                  </strong>{" "}
                  preparing for dispositions, investor reporting, or annual
                  budget reviews where billing support affects valuation.
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
                to run reconciliations and track billing across your portfolio.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free analyzer
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="recovery-gap-analyzer"
                ctaLabel="Download Free Analyzer"
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
              {RECOVERY_FAQS.map((faq) => (
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
