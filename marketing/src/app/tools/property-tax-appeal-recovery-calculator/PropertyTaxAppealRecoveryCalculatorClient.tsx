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
    name: "Property Tax Appeal Impact Calculator",
    description:
      "Model the landlord-side impact of a successful property tax appeal: tenant credits required, net benefit after credits, and the 3-year lookback under applicable state rules.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/property-tax-appeal-recovery-calculator"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "If I win a property tax appeal, do I have to credit tenants?",
    answer:
      "Yes, in almost all cases. When property taxes are passed through to NNN or modified gross tenants as part of CAM or real estate tax billing, a successful appeal can reduce the billed tax amount. Tenants are entitled to a credit for their proportionate share of the tax reduction for any years that fall within the open reconciliation window. The calculator models the required credits alongside the landlord's net benefit so you can evaluate whether to pursue the appeal.",
  },
  {
    question: "How is the credit calculated for NNN tenants?",
    answer:
      "The credit for each NNN tenant equals the total property tax reduction (for the appealed year) multiplied by the tenant's pro-rata share as defined in the lease. If the appeal covers multiple years, each year is calculated separately using the tenant's pro-rata share for that specific year, since occupancy and denominator changes can affect the allocation. The calculator handles single-year and multi-year appeals and outputs a per-tenant credit schedule.",
  },
  {
    question: "How does the Texas HCAD lookback work?",
    answer:
      "In Texas, successful Harris County Appraisal District (HCAD) property tax appeals can result in refunds covering the current year and up to two prior years if the appeal is filed within the statutory deadline. This creates a multi-year credit obligation for any NNN tenants whose leases were active during the lookback period. The calculator includes a Texas HCAD scenario tab that models the 2-year lookback, calculates per-tenant credits for each year, and projects the landlord's net benefit after crediting back the tenant shares.",
  },
  {
    question: "Can a property tax reduction affect my future CAM estimates?",
    answer:
      "Yes. If property taxes represent a significant component of your real estate tax passthrough and you achieve a meaningful reduction through an appeal, your annual CAM estimates for future years should be revised downward to reflect the lower tax basis. Continuing to estimate at the pre-appeal tax level and reconciling the difference at year-end is technically acceptable under most lease structures, but it creates tenant relations issues when large credits appear at reconciliation. The calculator includes a forward-projection tab to help you set appropriate estimates after a successful appeal.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "Calculate net landlord benefit from a successful property tax appeal",
  "Account for required tenant credits on their proportionate share",
  "Model partial vs. full assessment reductions",
  "Includes 2-year HCAD lookback scenario (Texas)",
];

export function PropertyTaxAppealRecoveryCalculatorClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/property-tax-appeal-recovery-calculator/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Property Tax Appeal Impact Calculator (XLSX) | CapVeri"
      description="Model the landlord-side impact of a successful property tax appeal: tenant credits required, net benefit after credits, and the 3-year lookback under applicable state rules."
      canonical={buildSiteUrl("/tools/property-tax-appeal-recovery-calculator")}
      toolName="Property Tax Appeal Impact Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Property Tax Appeal Impact Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Model the net landlord economics of a property tax appeal:
              required tenant credits, lookback obligations, and your true net
              benefit.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  A successful property tax appeal doesn&apos;t mean the
                  landlord keeps the full refund.
                </strong>{" "}
                NNN tenants are entitled to credits for their share of the tax
                reduction for any open reconciliation years. Before you spend on
                an appeal, calculate your true net benefit: the refund minus the
                tenant credits you&apos;ll owe. This calculator does that math
                for you.
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
                    Built for property owners and managers
                  </strong>{" "}
                  evaluating property tax appeal economics.
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
                Get the free calculator
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="property-tax-appeal-recovery-calculator"
                ctaLabel="Download Free Tax Appeal Calculator"
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
