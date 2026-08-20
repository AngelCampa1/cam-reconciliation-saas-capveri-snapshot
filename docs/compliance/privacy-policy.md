# Privacy policy

**Effective date:** 2026-05-28
**Governing entity:** CapVeri, operated by Ventora Labs, a Wyoming corporation, Sheridan, Wyoming
**Contact:** angel.campa@capveri.com

---

## Data we collect

**Account information**: name, email address, company name, and role when you create an account.

**Property and lease data**: building addresses, tenant names, and financial terms extracted from lease documents you upload, including the uploaded lease PDFs themselves.

**Financial records**: general ledger entries, CAM charges, and reconciliation outputs you generate using the platform.

**Usage, analytics, and log data**: request logs, feature usage events, and error events. On our public marketing site and in the application we use product analytics, which includes automatic event capture, session replay/recording, and heatmaps (see *Analytics and cookies* below). We do not use behavioral tracking for advertising purposes.

---

## How we use your data

- Providing the CAM reconciliation service
- AI-assisted extraction of lease terms and AI-assisted review of general-ledger data (see *Third-party service providers* and the [AI Transparency Statement](./ai-transparency-statement.md))
- Processing payments via Stripe
- Sending transactional emails via Resend (reconciliation reports, account notifications)
- Product analytics and error monitoring to operate and improve the service
- Fraud prevention, bot mitigation, and security monitoring

---

## Third-party service providers

We share data only with providers that process it on our behalf. We do not sell, rent, or share personal information with third parties for their own marketing or commercial purposes.

| Provider | Role | Notes |
|----------|------|-------|
| Supabase | Database, authentication | US-hosted PostgreSQL (on AWS) |
| Cloudflare | R2 object storage (lease/document PDFs); Turnstile bot protection on public forms | US/edge region |
| OpenRouter | AI model routing/gateway for document and GL processing | Routes prompts to the configured downstream model providers below |
| Downstream AI model providers (via OpenRouter) | Lease extraction, dual-extraction arbitration, gap-fill, cross-document checks, GL anomaly analysis | Includes Google (Gemini), Moonshot AI (Kimi), OpenAI (GPT), and Z.ai (GLM) models; see [AI Transparency Statement](./ai-transparency-statement.md) |
| Stripe | Payment processing | PCI-DSS compliant |
| Resend | Transactional email delivery | — |
| PostHog | Product analytics, session replay, heatmaps, error monitoring | US-hosted (`us.i.posthog.com`); inputs are masked in session recordings |
| Sentry | Error tracking (when enabled) | — |
| Google Tag Manager / Google Analytics | Marketing-site tag management and web analytics (when enabled) | — |
| Cloudflare | Backend API, marketing-site, application frontend, edge security, queues/workflows, and object storage | — |

**AI processing note**: We send the uploaded lease document (as a PDF and/or its extracted text) to AI models via OpenRouter for structured data extraction. We also send aggregated general-ledger data to an AI model via OpenRouter for anomaly analysis. We do not send Stripe payment details or other tenants' account credentials to AI providers. Document text sent to OpenRouter is governed by OpenRouter's and the downstream providers' own terms and privacy policies; see openrouter.ai for current terms.

---

## Data retention

| Category | Period | Basis |
|----------|--------|-------|
| Financial records (GL entries, reconciliations, invoices, audit log) | 10 years | IRS § 6001, Rev. Proc. 98-25 |
| Operational records (tenant accounts, invitations, feedback, raw OCR output) | 2–3 years | Business and legal necessity |
| Transient records (job logs, read notifications, webhook events, auth events) | 48 hours to 365 days | Automated weekly purge via `pg_cron` |

These retention periods are implemented in the database via a scheduled `run_retention_purge()` function for transient data; financial-record retention is enforced by policy (these tables are never automatically deleted). See [Data Retention Policy](./data-retention-policy.md).

Upon account deletion, personal data is anonymized within 30 days. Financial records are retained for the remainder of the statutory period — this is not optional under IRS § 6001.

---

## Security measures

- Encryption in transit (HTTPS), with the `Strict-Transport-Security` header (`max-age=31536000; includeSubDomains`) enforcing HTTPS in browsers
- Encryption at rest via Supabase managed PostgreSQL (AWS) and Cloudflare R2 storage, using the encryption those providers offer by default
- Row-level multi-tenant isolation enforced at the database layer (PostgreSQL Row-Level Security)
- Append-only audit logging on financial records (`gl_entries`, `reconciliation_snapshots`, and lease financial-term changes)

We do not hold a SOC 2 audit report; our controls are designed to SOC 2 principles but have not been third-party audited. For technical detail, see the [Security Overview](./security-overview.md).

---

## Analytics and cookies

Our marketing site and application use cookies and similar technologies for authentication, security, and product analytics. Product analytics (PostHog) includes automatic event capture, session replay/recording, and heatmaps; session recordings are configured to mask form inputs and text fields. We also use Cloudflare Turnstile on public forms for bot mitigation, and may use Google Tag Manager and Google Analytics for marketing measurement. We do not use cookies for third-party advertising. See the Cookie Policy for details and how to control cookies.

---

## California resident rights (CCPA / CPRA)

If you are a California resident (including individuals whose personal information is processed in a business-to-business context):

**Right to Know** — You may request the categories and specific pieces of personal information we have collected about you.

**Right to Delete** — You may request deletion of your personal information. Financial records subject to IRS § 6001 retention requirements cannot be deleted during the statutory window. Submit requests to angel.campa@capveri.com.

**Right to Correct** — You may request correction of inaccurate personal information we hold about you.

**Right to Opt-Out of Sale or Sharing** — We do not sell or share (including for cross-context behavioral advertising) personal information with third parties for their own commercial purposes. There is nothing to opt out of.

**Right to Limit Use of Sensitive Personal Information** — We do not use sensitive personal information for purposes beyond providing the service.

**Non-Discrimination** — Exercising any of these rights will not affect your pricing or service level.

**Authorized Agent** — You may designate an authorized agent to submit requests on your behalf with written authorization.

We will respond to verifiable requests within 45 days.

---

## EU/UK data-subject rights (GDPR / UK GDPR)

If you are located in the European Economic Area or the United Kingdom, you have the rights of access, rectification, erasure, restriction of processing, data portability, and objection to processing, and the right to lodge a complaint with a supervisory authority. To the extent we transfer EU/UK personal data to the United States or to our sub-processors, we rely on appropriate safeguards (such as Standard Contractual Clauses). Because some processing (e.g., product analytics and session replay) involves monitoring of behavior, EU/UK users may have additional consent rights. Submit data-subject requests to angel.campa@capveri.com.

---

## Children's privacy

This service is not directed to individuals under 18. We do not knowingly collect personal information from minors.

---

## Policy updates

We will provide 30 days' notice before material changes take effect. Notice will be sent by email to account holders.

---

## Contact

angel.campa@capveri.com

We will reply with specifics, not boilerplate.
