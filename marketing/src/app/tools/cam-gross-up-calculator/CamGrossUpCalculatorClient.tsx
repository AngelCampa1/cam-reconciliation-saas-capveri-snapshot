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
    name: "CAM Gross-Up Scenario Calculator",
    description:
      "Model CAM gross-up expenses across 85%, 90%, 95%, and 100% occupancy thresholds. Separates fixed vs. variable expenses with per-tenant pro-rata allocation.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/cam-gross-up-calculator"),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Model CAM Gross-Up Scenarios",
    description:
      "Download and use the free CAM Gross-Up Scenario Calculator to model expenses across occupancy thresholds.",
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
        name: "Download the calculator",
        text: "Open the Excel file in Microsoft Excel 2016+ or Google Sheets.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Input your expense data",
        text: "Enter your fixed and variable CAM expenses in the designated worksheet cells.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review gross-up scenarios",
        text: "Compare gross-up amounts across 85%, 90%, 95%, and 100% occupancy thresholds and review per-tenant pro-rata allocations.",
      },
    ],
  },
];

const GROSS_UP_FAQS = [
  {
    question: "What is a CAM gross-up clause?",
    answer:
      "A CAM gross-up clause is a lease provision that allows landlords to adjust variable operating expenses as if the building were occupied to a specified threshold (usually 90-95%). This prevents tenants from subsidizing vacant space and ensures equitable cost distribution.",
  },
  {
    question: "How do you calculate gross-up to 95% occupancy?",
    answer:
      "Divide total variable expenses by actual occupancy (e.g., 75%), then multiply by the gross-up threshold (95%). For example, $100,000 in variable expenses at 75% occupancy grossed up to 95% = $100,000 / 0.75 \u00d7 0.95 = $126,667.",
  },
  {
    question: "What expenses are subject to gross-up?",
    answer:
      "Only variable operating expenses are grossed up (costs that change with occupancy, like utilities, janitorial, and common area maintenance). Fixed expenses like property taxes, insurance, and management fees remain unchanged regardless of occupancy.",
  },
  {
    question: "What is the difference between fixed and variable CAM expenses?",
    answer:
      "Fixed CAM expenses (taxes, insurance, management fees) stay constant regardless of occupancy. Variable expenses (utilities, janitorial, landscaping) scale with the number of occupied spaces. Only variable expenses are subject to gross-up calculations.",
  },
  {
    question: "Can a landlord gross up expenses above 100% occupancy?",
    answer:
      "No. Gross-up thresholds are capped at 100% occupancy. Most leases specify a threshold between 90-95%. Grossing up above actual occupancy would overstate expenses beyond what tenants could reasonably owe.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(GROSS_UP_FAQS);

const BENEFITS = [
  "Models gross-up across 85%, 90%, 95%, and 100% occupancy thresholds",
  "Separates fixed vs. variable expenses so you see which costs are subject to gross-up",
  "Per-tenant pro-rata allocation table for up to 10 tenants",
  "Works in Excel 2016+ and Google Sheets. No macros, no VBA.",
];

export function CamGrossUpCalculator() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/cam-gross-up-calculator/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free CAM Gross-Up Scenario Calculator | CapVeri"
      description="Model gross-up expenses across occupancy thresholds. Excel calculator for property controllers. Separates fixed vs. variable expenses with per-tenant allocation."
      canonical={buildSiteUrl("/tools/cam-gross-up-calculator")}
      toolName="CAM Gross-Up Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free CAM Gross-Up Scenario Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              See how gross-up changes your CAM at any occupancy. Download
              free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  A CAM gross-up adjusts variable operating expenses to reflect
                  a fully (or near-fully) occupied building, so tenants pay
                  their fair share even when vacancies exist.
                </strong>{" "}
                Most NNN leases require landlords to gross up variable CAM
                expenses to a defined threshold, typically 90% or 95% occupancy.
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
                    Used by property controllers
                  </strong>{" "}
                  at property management companies running portfolios of 10 to
                  200+ tenants.
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
                to automate this calculation entirely.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free calculator
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="cam-gross-up-calculator"
                ctaLabel="Download Free Calculator"
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
              {GROSS_UP_FAQS.map((faq) => (
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
