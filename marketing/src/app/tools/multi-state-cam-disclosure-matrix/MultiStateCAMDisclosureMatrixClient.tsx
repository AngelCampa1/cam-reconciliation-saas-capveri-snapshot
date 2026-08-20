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
    name: "Multi-State CAM Packet Review Checklist",
    description:
      "A state-by-state reference matrix covering CAM disclosure requirements, reconciliation statement deadlines, and tenant audit rights windows for the 15 largest commercial real estate markets.",
    operatingSystem: "Windows, macOS (Adobe Acrobat, any PDF viewer)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/multi-state-cam-disclosure-matrix"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "Which states have CAM disclosure requirements?",
    answer:
      "Most states do not have specific statutory CAM disclosure requirements. Commercial lease terms are generally governed by the lease agreement itself. The notable exception is California, which enacted SB 1103 to establish disclosure rights for qualified commercial tenants. Several other states have market-standard practices for reconciliation statement timing (typically 90 to 180 days after year-end) that are widely used in institutional leases even without statutory backing. The matrix covers the 15 largest CRE markets with notes on both statutory requirements and market-standard practices.",
  },
  {
    question: "What is the reconciliation statement deadline in California?",
    answer:
      "California market practice for CAM reconciliation statement delivery varies, and SB 1103 sets its own statutory timeframe for leases with qualifying tenants. The exact deadline under SB 1103 is defined in the statute and may differ from general market norms. For SB 1103 qualifying tenants, reconciliation must be delivered on time to preserve the landlord's right to collect any balance due. Late delivery can forfeit the landlord's recovery rights for that year. Always verify the current statutory deadline against the statute itself and consult your attorney.",
  },
  {
    question: "How does California SB 1103 affect CAM disclosures?",
    answer:
      "California SB 1103 establishes specific protections for qualifying commercial tenants, which the statute defines based on criteria including business size and other factors. For leases with qualifying commercial tenants, landlords generally must provide itemized CAM estimates before the lease year, deliver itemized reconciliation statements within the required timeframe, and allow tenants to review CAM charges. The matrix includes a dedicated row for SB 1103 requirements alongside general California market standards. Verify qualifying criteria and deadlines against the current statute and consult your attorney - the law may have changed since this page was last updated.",
  },
  {
    question: "Are there federal CAM disclosure requirements?",
    answer:
      "No. There are no federal statutes governing CAM disclosure in commercial leases. Commercial real estate is regulated at the state level, and most states leave CAM terms entirely to the lease agreement. The federal Truth in Lending Act (TILA) and Real Estate Settlement Procedures Act (RESPA) apply to residential and certain mixed-use transactions but do not govern commercial CAM. The matrix is a state-level reference only.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "CAM disclosure requirements for 15 major CRE markets",
  "Reconciliation statement delivery deadlines by state and market standard",
  "Tenant audit rights windows (where statutory requirements exist)",
  "California SB 1103 qualified commercial tenant rules included",
];

export function MultiStateCAMDisclosureMatrixClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/multi-state-cam-disclosure-matrix/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Multi-State CAM Packet Review Checklist (PDF) | CapVeri"
      description="A state-by-state reference matrix covering CAM disclosure requirements, reconciliation statement deadlines, and tenant audit rights windows for the 15 largest commercial real estate markets."
      canonical={buildSiteUrl("/tools/multi-state-cam-disclosure-matrix")}
      toolName="Multi-State CAM Packet Review Checklist"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Multi-State CAM Packet Review Checklist
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              State-by-state CAM disclosure requirements, reconciliation
              deadlines, and audit rights windows for the 15 largest U.S. CRE
              markets.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Multi-state portfolios face different disclosure obligations
                  in every market they operate in.
                </strong>{" "}
                Missing a reconciliation delivery deadline in California or
                failing to honor a tenant audit right in a jurisdiction where it
                applies can void your recovery for that year. This matrix gives
                you a single reference for the rules in every market you operate
                in.
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
                    Built for landlords and property managers
                  </strong>{" "}
                  with multi-state commercial portfolios.
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
                Get the free matrix
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="multi-state-cam-disclosure-matrix"
                ctaLabel="Download Free Disclosure Matrix"
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
            <div className="mt-8 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">General information only - not legal advice.</strong>{" "}
                This page and the matrix it describes provide general background on state CAM disclosure
                practices for informational purposes. They are not legal advice and do not create an
                attorney-client relationship. Laws change, and the information here may not reflect
                the most current requirements in any given state. Always verify requirements against
                the current statutes and consult a qualified attorney before making compliance decisions.
              </p>
            </div>
          </div>
        </div>
      </section>
    </ToolPageLayout>
  );
}
