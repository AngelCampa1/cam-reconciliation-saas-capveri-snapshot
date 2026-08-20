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
    name: "CAM Estimate Forecaster: Category-Level Projections",
    description:
      "Project next-year CAM estimates by expense category. Apply CPI escalation, historical trends, and mid-year adjustments to generate accurate estimate letters.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    datePublished: "2026-03-18",
    url: buildSiteUrl("/tools/cam-estimate-forecaster"),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Forecast Next-Year CAM Estimates by Category",
    description:
      "Download and use the free CAM Estimate Forecaster to project next-year operating expenses with CPI escalation and historical trend analysis.",
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
        name: "Download the forecaster",
        text: "Open the Excel file in Microsoft Excel 2016+ or Google Sheets.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Input current year actuals by category",
        text: "Enter actual expenses for each CAM category (utilities, janitorial, landscaping, R&M, taxes, insurance, etc.) along with any known mid-year changes for next year.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review projected estimates",
        text: "The forecaster applies CPI escalation and historical growth rates to produce category-level projections. Use the output to draft tenant estimate letters with defensible numbers.",
      },
    ],
  },
];

const ESTIMATE_FAQS = [
  {
    question: "How should I set accurate CAM estimates for the upcoming year?",
    answer:
      "Start with current year actuals as the baseline, then adjust each expense category individually. Apply known increases (contracted service rate changes, approved tax assessments, insurance renewal quotes) first. For categories without known changes, use a CPI-based escalation or the 3-year average growth rate for that category. Avoid applying a single flat percentage across all categories. A flat rate overstates some and understates others.",
  },
  {
    question: "How does CPI escalation apply to CAM estimates?",
    answer:
      "CPI (Consumer Price Index) escalation is commonly used as a default growth rate for expense categories without known upcoming changes. Apply the local CPI rate (typically CPI-U for the metropolitan area) to variable expenses. Fixed contractual costs (insurance premiums, service contracts with set rates) should use the actual contracted amount instead of CPI. Most property controllers use a 2.5-4% CPI escalation depending on the market.",
  },
  {
    question: "What are mid-year adjustments and how do I account for them?",
    answer:
      "Mid-year adjustments are known changes that will take effect partway through the estimate year. Examples: a new landscaping contract starting in April, a property tax reassessment effective July 1, or a utility rate increase in October. Annualize these by calculating the blended rate: use the old rate for months before the change and the new rate for months after. This avoids under-estimating when a significant cost increase hits mid-year.",
  },
  {
    question: "What happens if my estimates are too far off from actuals?",
    answer:
      "Under-estimating creates large year-end true-up bills that surprise tenants and strain relationships. Over-estimating means returning credits, which improves tenant goodwill but ties up their cash flow unnecessarily and can trigger audit requests. The target is within 5-10% of actuals. If your estimates consistently miss by more than 10%, you likely need category-level forecasting rather than a single blanket escalation.",
  },
  {
    question: "Should I include an estimate letter with the new CAM charges?",
    answer:
      "Yes. Most commercial leases require landlords to provide written notice of estimated CAM charges before or at the start of each calendar year. The letter should include: the new monthly estimate amount, the prior year estimate for comparison, a category-level summary showing how the estimate was derived, and the effective date. A transparent estimate letter reduces tenant inquiries and sets expectations for the upcoming reconciliation.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(ESTIMATE_FAQS);

const BENEFITS = [
  "Projects next-year estimates by individual expense category",
  "Applies CPI escalation and historical trend rates automatically",
  "Accounts for known mid-year changes with blended annualization",
  "Generates estimate letter draft with category-level detail",
];

export function CamEstimateForecaster() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/cam-estimate-forecaster/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free CAM Estimate Forecaster: Category-Level Projections | CapVeri"
      description="Project next-year CAM estimates by expense category. Apply CPI escalation, historical trends, and mid-year adjustments to generate accurate estimate letters."
      canonical={buildSiteUrl("/tools/cam-estimate-forecaster")}
      toolName="CAM Estimate Forecaster"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free CAM Estimate Forecaster
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Project next-year estimates by expense category. Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Accurate CAM estimates prevent year-end surprises for both
                  landlords and tenants.
                </strong>{" "}
                Instead of applying a flat escalation across all categories,
                this forecaster lets you model each expense line individually.
                Use CPI, historical trends, and known contract changes to
                produce defensible estimates that hold up at reconciliation
                time.
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
                    Designed for property controllers
                  </strong>{" "}
                  preparing annual estimate letters for portfolios of 10-200+
                  tenants across multiple properties.
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
                to automate estimate forecasting from your actual expense data.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free forecaster
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="cam-estimate-forecaster"
                ctaLabel="Download Free Forecaster"
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
              {ESTIMATE_FAQS.map((faq) => (
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
