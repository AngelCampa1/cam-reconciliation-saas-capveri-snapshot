import type { Metadata } from "next";
import { publicKnowledge } from "@/generated/public-knowledge";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "CapVeri privacy policy: how we collect, use, and protect customer data.",
  alternates: {
    canonical: `${publicKnowledge.company.siteUrl}/privacy`,
  },
};

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="border-b bg-muted pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-2 text-muted-foreground">
            Last updated: May 28, 2026
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-6">
          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              1. Information We Collect
            </h2>
            <p className="text-muted-foreground mb-3">
              CapVeri.com collects information you provide directly, including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
              <li>Account information (name, email, company name)</li>
              <li>
                Property and financial data you upload for reconciliation,
                including lease PDFs and general-ledger entries
              </li>
              <li>Communication preferences and support inquiries</li>
              <li>
                Usage and analytics data, including automatically captured
                product-analytics events, session recordings (with inputs
                masked), and error logs
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              2. How We Use Your Information
            </h2>
            <p className="text-muted-foreground mb-3">
              We use collected information to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
              <li>Provide and improve our CRE FinOps services</li>
              <li>Process your uploaded financial data for analysis</li>
              <li>Send service updates and respond to inquiries</li>
              <li>Ensure security and prevent fraud</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              3. Data Security
            </h2>
            <p className="text-muted-foreground mb-3">
              We implement security measures including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
              <li>Encryption in transit and at rest</li>
              <li>Organization-scoped access controls</li>
              <li>
                Append-only audit logging for all financial record changes
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              4. Data Retention
            </h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
              <li>
                <strong>Financial records</strong> (ledger entries,
                reconciliations, invoices): retained for{" "}
                <strong>10 years</strong> per IRS § 6001 and Rev. Proc. 98-25.
              </li>
              <li>
                <strong>Operational records</strong> (tenant data, invitations,
                feedback): retained for <strong>2-3 years</strong> for business
                and legal compliance.
              </li>
              <li>
                <strong>Transient records</strong> (job logs, notifications,
                webhook events): automatically purged on a weekly schedule (48
                hours to 365 days depending on type).
              </li>
              <li>
                Upon account deletion, personal data is anonymized within 30
                days; financial records are retained for the full statutory
                period.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              5. Third-Party Services
            </h2>
            <p className="text-muted-foreground mb-3">
              We share data only with service providers that process it on our
              behalf. We do not sell your data.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>
                <strong>Supabase</strong> - database, authentication, and file
                storage (US-hosted PostgreSQL)
              </li>
              <li>
                <strong>Cloudflare</strong> - R2 document storage
              </li>
              <li>
                <strong>OpenRouter</strong> - AI model gateway for document and
                general-ledger processing. We send lease PDFs and extracted
                document text for structured lease extraction, and aggregated
                general-ledger data for anomaly analysis, to downstream models
                (Google Gemini, Moonshot Kimi, OpenAI GPT, and Z.ai GLM) routed
                through OpenRouter under product data-handling controls. These
                AI processing practices are described in our AI Transparency
                Statement.
              </li>
              <li>
                <strong>Stripe</strong> - payment processing (PCI-DSS compliant)
              </li>
              <li>
                <strong>Resend</strong> - transactional email delivery
              </li>
              <li>
                <strong>PostHog</strong> - product analytics, session replay,
                heatmaps, and error monitoring (US-hosted; recording inputs are
                masked)
              </li>
              <li>
                <strong>Sentry</strong> - error tracking (when enabled)
              </li>
              <li>
                <strong>Google Tag Manager / Google Analytics</strong> - tag
                management and web analytics (when enabled)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              6. California Resident Rights (CCPA / CPRA)
            </h2>
            <p className="text-muted-foreground mb-3">
              If you are a California resident, the California Consumer Privacy
              Act gives you the following rights:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>
                <strong>Right to Know</strong> - request the categories and
                specific pieces of personal information we have collected about
                you
              </li>
              <li>
                <strong>Right to Delete</strong> - request deletion of your
                personal information (financial records subject to IRS § 6001
                retention requirements cannot be deleted during the statutory
                window); submit requests to{" "}
                <a
                  href={publicKnowledge.contacts.byId.privacy.mailto}
                  className="text-primary hover:underline font-medium"
                >
                  {publicKnowledge.contacts.byId.privacy.email}
                </a>
              </li>
              <li>
                <strong>Right to Correct</strong> - request correction of
                inaccurate personal information
              </li>
              <li>
                <strong>Right to Opt-Out of Sale or Sharing</strong> - we do not
                sell or share (including for cross-context behavioral
                advertising) personal information with third parties for their
                own commercial purposes
              </li>
              <li>
                <strong>Right to Limit Use of Sensitive Information</strong> -
                we do not use sensitive personal information beyond providing
                the service
              </li>
              <li>
                <strong>Non-Discrimination</strong> - we will not discriminate
                against you for exercising any of these rights; your pricing and
                service level remain the same
              </li>
              <li>
                <strong>Authorized Agent</strong> - you may designate an
                authorized agent to submit requests on your behalf with written
                authorization
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              7. Your Rights
            </h2>
            <p className="text-muted-foreground mb-3">You have the right to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request data deletion</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of marketing communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              8. EU/UK Data-Subject Rights (GDPR)
            </h2>
            <p className="text-muted-foreground mb-3">
              If you are located in the European Economic Area or the United
              Kingdom, you have the rights of access, rectification, erasure,
              restriction, data portability, and objection to processing, and
              the right to lodge a complaint with a supervisory authority. Where
              we transfer EU/UK personal data to the United States or to our
              sub-processors, we rely on appropriate safeguards such as Standard
              Contractual Clauses. Because some processing (such as product
              analytics and session replay) involves monitoring of behavior,
              EU/UK users may have additional consent rights. Submit requests to{" "}
              <a
                href={publicKnowledge.contacts.byId.privacy.mailto}
                className="text-primary hover:underline font-medium"
              >
                {publicKnowledge.contacts.byId.privacy.email}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              9. Contact Us
            </h2>
            <p className="text-muted-foreground">
              For privacy inquiries, contact us at{" "}
              <a
                href={publicKnowledge.contacts.byId.privacy.mailto}
                className="text-primary hover:underline font-medium"
              >
                {publicKnowledge.contacts.byId.privacy.email}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;
