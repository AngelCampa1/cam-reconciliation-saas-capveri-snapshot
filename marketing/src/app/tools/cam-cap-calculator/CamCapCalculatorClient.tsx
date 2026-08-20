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
    name: "CAM Cap Calculator: Cumulative vs Non-Cumulative",
    description:
      "Model cumulative and non-cumulative CAM caps with carry-forward bank tracking. Compare cap impact over 5 years and visualize unused cap capacity.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    datePublished: "2026-03-18",
    url: buildSiteUrl("/tools/cam-cap-calculator"),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Model Cumulative vs Non-Cumulative CAM Caps",
    description:
      "Download and use the free CAM Cap Calculator to compare cumulative and non-cumulative cap structures over a multi-year lease term.",
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
        name: "Input base year expenses and cap percentage",
        text: "Enter your base year CAM expenses, the annual cap percentage, and whether the cap is cumulative or non-cumulative.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review 5-year cap impact",
        text: "Compare cumulative vs non-cumulative outcomes side by side, including carry-forward bank balance and unused cap capacity each year.",
      },
    ],
  },
];

const CAP_FAQS = [
  {
    question:
      "What is the difference between cumulative and non-cumulative CAM caps?",
    answer:
      "A non-cumulative cap limits the year-over-year increase to a fixed percentage (e.g., 5%) of the prior year's actual expenses. A cumulative cap limits the increase to a fixed percentage of the base year, compounded annually. The key difference: cumulative caps bank unused increases from low-expense years, allowing larger jumps later. Non-cumulative caps reset every year with no carry-forward.",
  },
  {
    question: "How does carry-forward work with cumulative caps?",
    answer:
      "When actual expenses in a given year come in below the cumulative cap ceiling, the difference between the ceiling and actual expenses is 'banked.' In future years when expenses spike, the landlord can recover above the simple annual percentage because the cumulative ceiling has been growing each year regardless of actual spend. This carry-forward bank can represent tens of thousands of dollars over a 5-year lease term.",
  },
  {
    question: "How do CAM caps interact with controllable expense clauses?",
    answer:
      "Many leases apply caps only to controllable expenses (costs the landlord can influence, like janitorial, landscaping, and repairs). Non-controllable expenses (property taxes, insurance, utilities) are typically excluded from cap calculations and passed through at actual cost. When modeling caps, separate controllable from non-controllable expenses first, then apply the cap only to the controllable pool.",
  },
  {
    question: "Which cap structure is better for landlords?",
    answer:
      "Cumulative caps generally favor landlords because unused cap capacity carries forward. In years with low expense growth, the bank builds up, giving the landlord room to recover higher costs in future years without hitting the cap. Non-cumulative caps are simpler but can create situations where legitimate cost increases exceed the allowed year-over-year limit with no recourse.",
  },
  {
    question:
      "How do I calculate the cap ceiling for year 3 of a cumulative cap?",
    answer:
      "For a cumulative cap, multiply the base year expenses by (1 + cap%)^n where n is the number of years since the base year. For example, with a $100,000 base year and a 5% cumulative cap, the year 3 ceiling is $100,000 x 1.05^3 = $115,763. The tenant pays the lesser of actual expenses or this ceiling.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(CAP_FAQS);

const BENEFITS = [
  "Models both cumulative and non-cumulative caps side by side",
  "Shows carry-forward bank balance year over year",
  "Compares cap impact over a 5-year lease term",
  "Visualizes unused cap capacity and landlord exposure",
];

export function CamCapCalculator() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/cam-cap-calculator/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free CAM Cap Calculator: Cumulative vs Non-Cumulative | CapVeri"
      description="Model cumulative and non-cumulative CAM caps with carry-forward bank tracking. Compare cap impact over 5 years and visualize unused cap capacity."
      canonical={buildSiteUrl("/tools/cam-cap-calculator")}
      toolName="CAM Cap Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free CAM Cap Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Model cumulative vs non-cumulative caps with carry-forward
              tracking. Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  CAM caps limit the annual increase in operating expenses a
                  landlord can pass through to tenants.
                </strong>{" "}
                Whether a cap is cumulative or non-cumulative dramatically
                changes the landlord&apos;s recovery over a multi-year lease.
                This calculator models both structures so you can see the
                financial impact before negotiating lease terms.
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
                    Built for property controllers and asset managers
                  </strong>{" "}
                  who need to model cap structures during lease negotiations or
                  reconciliation prep.
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
                assetSlug="cam-cap-calculator"
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
              {CAP_FAQS.map((faq) => (
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
