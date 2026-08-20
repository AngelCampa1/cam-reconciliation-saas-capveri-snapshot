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
    name: "Tenant CAM Dispute Response Letter",
    description:
      "A professionally formatted landlord response letter for tenant CAM disputes. Includes the calculation walkthrough, lease language citations, and a counter-position framework.",
    operatingSystem: "Windows, macOS (Adobe Acrobat, any PDF viewer)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/tenant-dispute-response-letter-template"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "What should a CAM dispute response letter include?",
    answer:
      "A complete CAM dispute response letter should include: (1) a clear acknowledgment of the dispute and the specific items contested, (2) a reference to the controlling lease sections, (3) a step-by-step walkthrough of the disputed calculation showing how each input was derived, (4) documentation citations for key inputs (e.g., the GL summary for expense totals, the lease for the denominator), (5) the landlord's position on each disputed point, and (6) a clear statement of next steps. The template provides a framework for all six components with placeholder text that can be customized for your specific situation.",
  },
  {
    question: "How quickly should I respond to a tenant CAM dispute?",
    answer:
      "Most commercial leases specify a response window for dispute letters, commonly 30 to 60 days. Check your lease first and calendar the deadline before drafting. Even if the lease is silent on timing, responding within 30 days is considered good practice and helps avoid the dispute escalating to audit. Delays in responding can be interpreted as acknowledgment of the disputed amount or, in some jurisdictions, waiver of the landlord's right to maintain the original charge. A prompt, well-documented response is almost always better than a slow one.",
  },
  {
    question: "What happens if I don't respond to a tenant dispute?",
    answer:
      "Failing to respond to a tenant CAM dispute creates significant risk for the landlord. In many jurisdictions and under many lease structures, a tenant who disputes and receives no response has a stronger argument for withholding the disputed amount or crediting it against future obligations. In California, SB 1103 creates specific obligations for landlords to respond to qualified commercial tenant disputes. Even outside California, courts have found in favor of tenants who disputed charges and were ignored, particularly when the tenant followed the dispute process set out in the lease.",
  },
  {
    question: "Can I use this template for any state?",
    answer:
      "The template provides a general framework that applies across U.S. commercial real estate markets. It does not constitute legal advice and should be reviewed by your legal counsel before use, particularly for disputes in California (SB 1103 qualified tenants), New York City (Local Law considerations), or any jurisdiction where your counsel has advised that specific statutory language is required. The template includes placeholder language noting where state-specific provisions may need to be inserted.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "Ready-to-customize response letter with calculation walkthrough",
  "Lease clause citation framework (where to reference the lease)",
  "Position documentation section for preserving your rights",
  'Includes both "error acknowledged" and "dispute rejected" variants',
];

export function TenantDisputeResponseLetterClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/tenant-dispute-response-letter-template/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Tenant CAM Dispute Response Letter (PDF) | CapVeri"
      description="A professionally formatted landlord response letter for tenant CAM disputes. Includes the calculation walkthrough, lease language citations, and a counter-position framework."
      canonical={buildSiteUrl("/tools/tenant-dispute-response-letter-template")}
      toolName="Tenant CAM Dispute Response Letter"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Tenant CAM Dispute Response Letter
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              A professionally formatted response letter for tenant CAM
              disputes. Includes a calculation walkthrough, lease citations, and
              both acknowledged-error and dispute-rejected variants.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  How you respond to a tenant CAM dispute shapes the entire
                  negotiation that follows.
                </strong>{" "}
                A well-structured response letter that cites the lease,
                documents the calculation, and clearly states your position
                signals that you have done the work. Escalation is much less
                likely. This template gives your team a professional starting
                point for every dispute response.
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
                    Built for property managers and property controllers
                  </strong>{" "}
                  responding to tenant CAM audit findings or dispute letters.
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
                Get the free template
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="tenant-dispute-response-letter-template"
                ctaLabel="Download Free Response Letter Template"
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
