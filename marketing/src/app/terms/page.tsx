import type { Metadata } from "next";
import { publicKnowledge } from "@/generated/public-knowledge";

const TERMS_VERSION = "2026-06-03";
const TERMS_EFFECTIVE_DATE = "June 3, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "CapVeri terms of service: user duties, output review, disclaimers, liability, and Wyoming venue.",
  alternates: {
    canonical: `${publicKnowledge.company.siteUrl}/terms`,
  },
};

const sections = [
  [
    "1. Acceptance",
    "By accessing or using CapVeri.com, you agree to these Terms. If you do not agree, do not use the Service.",
  ],
  [
    "2. Service",
    "CapVeri.com provides B2B software for commercial real estate CAM reconciliation. The Service processes files, drafts reports, calculators, templates, demand letters, exports, and other outputs for customer review.",
  ],
  [
    "3. Customer Duties",
    "You must provide accurate account information, protect your login, use the Service lawfully, upload only files you have rights to use, and verify every output before relying on it.",
  ],
  [
    "4. Data",
    "You keep ownership of data you upload. You represent that your uploads do not violate law, contracts, privacy rights, or third-party rights.",
  ],
  [
    "5. No Professional Advice",
    "CapVeri.com does not provide legal, accounting, tax, insurance, audit, or other professional advice. Outputs are informational drafts. You must review them with qualified professionals before you rely on them.",
  ],
  [
    "6. Output Review",
    "Automated calculations and AI-assisted extraction may contain errors, omissions, or inaccuracies. You are solely responsible for checking CAM results, recovery figures, lease terms, anomaly flags, letters, reports, exports, and emailed content before billing a tenant or making a decision.",
  ],
  [
    "7. No Outcome Guarantee",
    "CapVeri.com does not guarantee recoveries, savings, refunds, tenant dispute outcomes, legal outcomes, accounting treatment, or audit results.",
  ],
  [
    "8. Payment",
    "Subscriptions are billed annually. Pricing, trials, offers, and refunds are described on our pricing page or order form. We may change future pricing with 30 days notice.",
  ],
  [
    "8a. Limited Offer",
    `${publicKnowledge.pricing.launchOffer.code} gives ${publicKnowledge.pricing.launchOffer.label} once on the first annual subscription invoice. It applies only to subscriptions. The offer ends at 11:59pm Pacific on July 3, 2026.`,
  ],
  [
    "9. Prohibited Use",
    "You may not break the law, infringe rights, upload harmful code, bypass security, overload the Service, or misuse third-party services. Third-party services are governed by their own terms.",
  ],
  [
    "10. Suspension",
    "We may suspend or terminate access for nonpayment, security risk, prohibited use, legal risk, or breach of these Terms.",
  ],
  [
    "11. Disclaimers and Liability",
    'The Service is provided "as is" and without warranties. CapVeri.com is not liable for indirect, incidental, special, punitive, exemplary, or consequential damages. Our total liability is limited to fees paid in the 12 months before the claim. Claims must be brought within one year after they arise.',
  ],
  [
    "12. Indemnity",
    "You will defend and indemnify CapVeri.com from claims tied to your data, your outputs, your use of the Service, your breach of these Terms, or your violation of law or third-party rights.",
  ],
  [
    "13. Wyoming Law",
    "Wyoming law governs these Terms. The state and federal courts in Wyoming are the exclusive venue for disputes, unless a signed order form says otherwise.",
  ],
  [
    "14. Changes and Order",
    "We may update these Terms. Continued use after a change means acceptance. A signed order form controls over these Terms only for the conflicting business term.",
  ],
];

function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="border-b bg-muted pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Terms of Service
          </h1>
          <p className="mt-2 text-muted-foreground">
            Effective: {TERMS_EFFECTIVE_DATE} | Version {TERMS_VERSION}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-6">
          {sections.map(([title, body]) => (
            <section
              key={title}
              id={title === "8a. Limited Offer" ? "limited-offer" : undefined}
            >
              <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
                {title}
              </h2>
              <p className="text-muted-foreground">{body}</p>
            </section>
          ))}

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              15. Contact
            </h2>
            <p className="text-muted-foreground">
              For questions about these terms, contact us at{" "}
              <a
                href={publicKnowledge.contacts.byId.legal.mailto}
                className="text-primary hover:underline font-medium"
              >
                {publicKnowledge.contacts.byId.legal.email}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default TermsOfServicePage;
