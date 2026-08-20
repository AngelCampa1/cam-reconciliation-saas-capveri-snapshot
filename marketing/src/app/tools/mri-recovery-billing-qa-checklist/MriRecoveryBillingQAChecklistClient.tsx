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
    name: "MRI Recovery Billing Error Checklist",
    description:
      "A checklist for verifying MRI Software recovery billing calculations before tenant statements go out. Covers REMS Recovery module outputs, pool configuration, and gross-up verification.",
    operatingSystem: "Windows, macOS (Adobe Acrobat, any PDF viewer)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/mri-recovery-billing-qa-checklist"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "What is REMS in MRI Software?",
    answer:
      "REMS (Recovery and Expense Management System) is the MRI Software module that calculates and processes CAM, insurance, and real estate tax recoveries for commercial leases. REMS allows property managers to define expense pools, assign leases to pools, configure gross-up rules and cap provisions, and generate recovery billing statements. It is the primary module for CAM reconciliation in both MRI Commercial and MRI Property Management.",
  },
  {
    question: "How do I export recovery billing data from MRI?",
    answer:
      "In MRI Commercial, recovery billing data is exported from the REMS module using the Recovery Billing Report or the Recovery Calculation Detail report. From the main menu, navigate to Recovery > Reports and select the appropriate report for your reconciliation type. For QA purposes, the Calculation Detail report is the most useful. It shows the expense pool totals, tenant allocations, gross-up adjustments, and cap applications in a single output. The checklist identifies the exact report parameters to use for each QA step.",
  },
  {
    question: "What are the most common MRI recovery billing errors?",
    answer:
      "The most common errors in MRI REMS recovery billing include: pool assignment mismatches (tenants assigned to the wrong pool or excluded from the pool incorrectly), gross-up configuration using the wrong occupancy threshold or percentage, cap provisions set to non-cumulative when the lease requires cumulative treatment, denominator overrides that were not updated after lease amendments, and management fee bases calculated on gross expenses rather than the recoverable pool. The checklist covers a verification step for each of these error types.",
  },
  {
    question: "Does this work with MRI Commercial and MRI Property Management?",
    answer:
      "Yes. The checklist covers the REMS Recovery module as implemented in both MRI Commercial Management and MRI Property Management (formerly known as MRI Residential). While the navigation paths differ slightly between versions, the underlying recovery billing logic and the QA steps are the same. The checklist notes where MRI Commercial and MRI Property Management differ in report naming or menu location.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "15-step QA checklist for MRI Software REMS Recovery module",
  "Covers pool assignment verification, gross-up configuration, and cap enforcement",
  "Includes specific MRI report names for each verification step",
  "Works with MRI Commercial and MRI Property Management",
];

export function MriRecoveryBillingQAChecklistClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/mri-recovery-billing-qa-checklist/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free MRI Recovery Billing Error Checklist (PDF) | CapVeri"
      description="A checklist for verifying MRI Software recovery billing calculations before tenant statements go out. Covers REMS Recovery module outputs, pool configuration, and gross-up verification."
      canonical={buildSiteUrl("/tools/mri-recovery-billing-qa-checklist")}
      toolName="MRI Recovery Billing Error Checklist"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free MRI Recovery Billing Error Checklist
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Verify MRI REMS recovery billing outputs before statements go out.
              Covers pool configuration, gross-up, cap enforcement, and
              denominator accuracy.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  MRI REMS misconfiguration is common. The errors it produces
                  are silent.
                </strong>{" "}
                Tenants assigned to the wrong pool, gross-up thresholds set
                incorrectly, and cap provisions configured as non-cumulative
                when the lease requires cumulative treatment are all errors that
                MRI will calculate without warning. This checklist gives you a
                15-step verification process to catch them before billing goes
                out.
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
                    Built for property accountants and controllers
                  </strong>{" "}
                  using MRI Software for commercial lease recovery billing.
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
                Get the free checklist
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="mri-recovery-billing-qa-checklist"
                ctaLabel="Download Free MRI QA Checklist"
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
