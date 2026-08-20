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
    name: "BOMA Remeasurement Impact Calculator",
    description:
      "Calculate the NOI impact of remeasuring from BOMA 2017 to BOMA 2024. Project rentable area changes, model re-measurement timing, and see per-tenant share impact on your portfolio.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/boma-remeasurement-impact"),
    datePublished: "2026-03-18",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Calculate BOMA Remeasurement NOI Impact",
    description:
      "Download and use the free BOMA Remeasurement Impact Calculator to model the financial impact of transitioning from BOMA 2017 to BOMA 2024 measurement standards.",
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
        name: "Download the calculator",
        text: "Open the Excel file in Microsoft Excel 2016+ or Google Sheets.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Input your building measurements",
        text: "Enter current BOMA 2017 rentable area, expected percentage change under BOMA 2024, current rent per SF, and operating expense rates.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review NOI impact projections",
        text: "See projected rentable area changes, rent revenue impact, operating expense recovery changes, and net NOI effect across your portfolio.",
      },
    ],
  },
];

const BOMA_FAQS = [
  {
    question: "What changed from BOMA 2017 to BOMA 2024?",
    answer:
      "BOMA 2024 introduced updated definitions for outdoor areas, covered galleries, and semi-enclosed spaces. It also refined how vertical penetrations and interstitial spaces are measured. For many office buildings, the net effect is a change in rentable area that can increase or decrease depending on building design and the treatment of previously unmeasured spaces.",
  },
  {
    question: "How does remeasurement affect NOI?",
    answer:
      "When rentable area changes, it directly impacts revenue (rent per SF multiplied by new rentable area) and expense recovery (pro-rata shares recalculated on updated denominators). If rentable area increases, landlords may recover more rent and expenses. If it decreases, the opposite occurs. The NOI impact compounds across every tenant and every expense category.",
  },
  {
    question: "When should a landlord remeasure under BOMA 2024?",
    answer:
      "The optimal timing depends on lease rollover schedules, capital improvement plans, and market conditions. Many landlords remeasure during major renovations, tenant turnover, or refinancing events when updated measurements can be incorporated into new lease terms. Remeasuring mid-lease typically requires tenant consent unless the lease specifies a remeasurement clause.",
  },
  {
    question: "How does remeasurement affect existing tenant pro-rata shares?",
    answer:
      "Existing leases define pro-rata shares based on the rentable area at lease execution. Remeasurement changes the building denominator, which shifts pro-rata shares for all tenants. Most leases lock the tenant's numerator (their suite area) but allow the denominator to change with remeasurement. This means per-tenant expense obligations can shift even without a lease amendment.",
  },
  {
    question:
      "What is the typical rentable area change from BOMA 2017 to 2024?",
    answer:
      "The change varies significantly by building type and design. Office buildings with large lobbies, covered walkways, or outdoor amenity spaces may see increases of 1-5% in rentable area. Buildings with simple floor plates and minimal common areas may see minimal change. The only way to know your specific impact is to have a certified measurer apply the 2024 standard to your building.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(BOMA_FAQS);

const BENEFITS = [
  "Projects rentable area changes from BOMA 2017 to BOMA 2024 standards",
  "Calculates NOI impact across rent revenue and expense recovery",
  "Models re-measurement timing against lease rollover schedules",
  "Shows per-tenant pro-rata share impact for your entire roster",
];

export function BOMARemeasurementImpactClient() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/boma-remeasurement-impact/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free BOMA Remeasurement Impact Calculator | CapVeri"
      description="Calculate the NOI impact of remeasuring from BOMA 2017 to BOMA 2024. Project rentable area changes and see per-tenant share impact."
      canonical={buildSiteUrl("/tools/boma-remeasurement-impact")}
      toolName="BOMA Remeasurement Impact Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free BOMA Remeasurement Impact Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Model the NOI impact of moving from BOMA 2017 to BOMA 2024.
              Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  BOMA 2024 changes how buildings measure rentable area. That
                  directly impacts your rent revenue, expense recovery, and NOI.
                </strong>{" "}
                This calculator models the financial impact of remeasurement so
                you can decide when (and whether) to transition. See the effect
                on every tenant in your building.
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
                    Built for asset managers and property controllers
                  </strong>{" "}
                  evaluating whether to remeasure their office or mixed-use
                  buildings under the new BOMA 2024 standard.
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
                to automate remeasurement impact analysis across your portfolio.
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
                assetSlug="boma-remeasurement-impact"
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
              {BOMA_FAQS.map((faq) => (
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
