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
    applicationSubCategory: "ComplianceTool",
    name: "SB 1103 Compliance Checker",
    description:
      "Assess your SB 1103 compliance risk with a guided questionnaire. Find disclosure gaps, get a prioritized action checklist, and see your deadline timeline for California commercial lease transparency requirements.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/sb-1103-checker"),
    datePublished: "2026-03-18",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Assess SB 1103 Compliance Risk",
    description:
      "Download the free SB 1103 Compliance Checker to find gaps in your CAM disclosure process and build a prioritized action checklist.",
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
        name: "Download the compliance checker",
        text: "Open the Excel file and navigate to the questionnaire tab.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Complete the risk questionnaire",
        text: "Answer questions about your current CAM disclosure practices, documentation standards, and tenant communication processes.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review your risk assessment",
        text: "See your overall compliance risk level, gap analysis, action item checklist, and deadline timeline.",
      },
    ],
  },
];

const SB1103_FAQS = [
  {
    question: "What is SB 1103 and who does it affect?",
    answer:
      "SB 1103 is a California statute that requires landlords of commercial properties to provide detailed operating expense disclosures to certain qualifying tenants. In general, it affects landlords with NNN or modified gross leases in California who pass through operating expenses to tenants who may qualify under the statute. Qualifying criteria include factors related to both lease structure and tenant characteristics such as business size. Check the current statute and consult your attorney to confirm whether your specific leases and tenants are covered.",
  },
  {
    question: "What are the disclosure requirements under SB 1103?",
    answer:
      "SB 1103 generally requires landlords to provide itemized statements of operating expenses, including the methodology used for allocating shared costs, the basis for pro-rata share calculations, and documentation supporting each expense category. Landlords must respond to tenant requests within a timeframe set by the statute and maintain records for a defined retention period. Verify the current requirements with the statute and legal counsel, as details may change.",
  },
  {
    question: "What are the deadlines for SB 1103 compliance?",
    answer:
      "SB 1103 sets specific timeframes for delivering annual operating expense statements and for responding to tenant documentation requests. The exact deadlines are defined in the statute and may differ from general market-practice timelines used in other states or in leases not covered by SB 1103. Failure to meet these deadlines can expose landlords to penalties and give tenants grounds to dispute billings. Review the current statute and consult your attorney for the deadlines that apply to your leases.",
  },
  {
    question: "Which tenants qualify for SB 1103 protections?",
    answer:
      "SB 1103 protections generally apply to commercial tenants in California who meet qualifying criteria defined in the statute, which may include factors related to both the lease structure and the tenant's business size or revenue. The statute covers tenants in office, retail, and industrial properties, but not all tenants in those property types automatically qualify. Consult the current statute and your attorney to determine which of your tenants meet the qualifying definition.",
  },
  {
    question: "What happens if a landlord fails to comply with SB 1103?",
    answer:
      "Non-compliance can result in tenants withholding operating expense payments until proper disclosures are provided, monetary penalties, and increased audit exposure. Courts may also award attorney fees to tenants who prevail in SB 1103 disputes. Getting compliant early costs less than defending a dispute later.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(SB1103_FAQS);

const BENEFITS = [
  "Identifies compliance gaps in your current CAM disclosure process",
  "Generates a prioritized action item checklist with clear next steps",
  "Assesses overall risk level based on your disclosure practices",
  "Shows a deadline timeline for each compliance window",
];

export function SB1103CheckerClient() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/sb-1103-checker/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free SB 1103 Compliance Checker | CapVeri"
      description="Assess your SB 1103 compliance risk with a guided questionnaire. Find gaps, get a prioritized action checklist, and see your deadline timeline."
      canonical={buildSiteUrl("/tools/sb-1103-checker")}
      toolName="SB 1103 Compliance Checker"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free SB 1103 Compliance Checker
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Assess your compliance risk and get an action item checklist.
              Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  California&apos;s SB 1103 requires landlords to give
                  commercial tenants detailed operating expense disclosures.
                  Non-compliance can mean withheld payments, penalties, and
                  audit exposure.
                </strong>{" "}
                This checker walks you through a risk questionnaire. It outputs
                a gap analysis with prioritized action items so you can get
                compliant before your next reconciliation cycle.
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
                    Essential for California landlords
                  </strong>{" "}
                  managing commercial portfolios with NNN or modified gross
                  leases where operating expenses are passed through to tenants.
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
                to automate compliance tracking and disclosure generation.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free compliance checker
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="sb-1103-checker"
                ctaLabel="Download Free Checker"
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
              {SB1103_FAQS.map((faq) => (
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
            <div className="mt-8 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">General information only - not legal advice.</strong>{" "}
                This page provides general background on California SB 1103 for informational purposes.
                It is not legal advice and does not create an attorney-client relationship.
                Statutes change, and the information here may not reflect the most current version of the law.
                Always verify requirements against the current statute and consult a qualified attorney
                before making compliance decisions.
              </p>
            </div>
          </div>
        </div>
      </section>
    </ToolPageLayout>
  );
}
