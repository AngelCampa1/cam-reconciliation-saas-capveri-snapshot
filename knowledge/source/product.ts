import type {
  AssistantGuardrail,
  CompanyProfile,
  CompetitorPositioning,
  ContactEscalation,
  FeatureDomainFact,
  KnowledgeSource,
  MarketingFaq,
  ProductFeatureFact,
  PublicClaim,
  PublicContact,
  PublicCta,
  PublicMessaging,
  ProductFact,
  ResourceFact,
} from "./schema";

export const knowledgeSources = [
  {
    id: "plan-tiers",
    title: "plan-tiers.json",
    owner: "product",
    publicSafe: true,
    notes: "Canonical pricing, tier, and feature matrix.",
  },
  {
    id: "app-help",
    title: "Authenticated app help",
    owner: "app",
    publicSafe: true,
    notes: "Plain-language guidance for in-app workflows.",
  },
  {
    id: "marketing-help-center",
    title: "Marketing help center FAQ",
    owner: "marketing",
    publicSafe: true,
    notes: "Approved public help and FAQ copy migrated into the KB.",
  },
  {
    id: "public-compliance",
    title: "Public compliance and AI guardrails",
    owner: "compliance",
    publicSafe: true,
    notes:
      "Public-safe claims only; use approved public product, pricing, support, and help facts.",
  },
] satisfies KnowledgeSource[];

export const companyProfile = {
  name: "CapVeri",
  legalName: "CapVeri.com",
  siteUrl: "https://www.capveri.com",
  appUrl: "https://app.capveri.com",
  apiUrl: "https://api.capveri.com",
  foundingDate: "2024",
  description:
    "CRE FinOps software for commercial landlords. It checks CAM work from ERP exports, lease terms, and tenant billing data.",
  publicDescription:
    "CapVeri is a CRE FinOps platform for commercial landlords. It works from CSV, Excel, and lease PDF exports to verify CAM reconciliation workflows without replacing the ERP.",
  logoPath: "/icons/logo.svg",
  sameAs: ["https://www.linkedin.com/company/capveri/"],
} satisfies CompanyProfile;

export const publicContacts = [
  {
    id: "founder",
    label: "Founder",
    email: "angel.campa@capveri.com",
    mailto: "mailto:angel.campa@capveri.com",
    useCases: [
      "security review",
      "implementation questions",
      "unsupported app issue",
      "commercial or legal question",
    ],
    escalationBoundary:
      "Escalate rather than inventing commercial commitments, discounts, legal advice, security guarantees, or roadmap dates.",
  },
  {
    id: "sales",
    label: "Sales",
    email: "angel.campa@capveri.com",
    mailto: "mailto:angel.campa@capveri.com",
    useCases: ["pricing", "unit count selection", "billing questions"],
    escalationBoundary:
      "Use for commercial inquiries; do not invent pricing, discounts, or contract commitments.",
  },
  {
    id: "support",
    label: "Support",
    email: "angel.campa@capveri.com",
    mailto: "mailto:angel.campa@capveri.com",
    useCases: ["product support", "account access", "billing questions"],
    escalationBoundary:
      "Use for routine support; escalate security, legal, or privacy questions to the matching channel.",
  },
  {
    id: "privacy",
    label: "Privacy",
    email: "angel.campa@capveri.com",
    mailto: "mailto:angel.campa@capveri.com",
    useCases: ["privacy requests", "data rights", "cookie questions"],
    escalationBoundary:
      "Use for privacy inquiries only; do not make legal determinations in product copy.",
  },
  {
    id: "legal",
    label: "Legal",
    email: "angel.campa@capveri.com",
    mailto: "mailto:angel.campa@capveri.com",
    useCases: ["terms", "contracts", "legal notices"],
    escalationBoundary:
      "Use for legal notices and contract questions; public copy must not provide legal advice.",
  },
  {
    id: "security",
    label: "Security",
    email: "angel.campa@capveri.com",
    mailto: "mailto:angel.campa@capveri.com",
    useCases: ["vulnerability reports", "security reviews"],
    escalationBoundary:
      "Use for coordinated security contact; do not publish unverified security guarantees.",
  },
  {
    id: "unsubscribe",
    label: "Unsubscribe",
    email: "angel.campa@capveri.com",
    mailto: "mailto:angel.campa@capveri.com",
    useCases: ["marketing unsubscribe", "communication preferences"],
    escalationBoundary: "Use for email preference requests only.",
  },
  {
    id: "source-feedback",
    label: "Source feedback",
    email: "angel.campa@capveri.com",
    mailto: "mailto:angel.campa@capveri.com",
    useCases: ["source corrections", "content feedback", "citation questions"],
    escalationBoundary:
      "Use for public content corrections; do not expose private research or prospect data.",
  },
] satisfies PublicContact[];

export const publicCtas = [
  {
    id: "startTrial",
    label: "Start Free Trial",
    href: "/auth/register",
    intent: "Begin a self-serve trial.",
  },
  {
    id: "viewPricing",
    label: "View Pricing",
    href: "/pricing",
    intent: "Review current Reconcile pricing and first-year offer terms.",
  },
  {
    id: "contactSupport",
    label: "Contact Support",
    href: "/contact",
    intent: "Ask billing, product, or account questions.",
  },
  {
    id: "contactFounder",
    label: "Contact Founder",
    href: "mailto:angel.campa@capveri.com",
    intent:
      "Escalate sensitive commercial, legal, security, or product questions.",
  },
  {
    id: "learnMore",
    label: "Learn More",
    href: "/resources",
    intent: "Read educational resources.",
  },
  {
    id: "downloadTool",
    label: "Download Tool",
    href: "/resources",
    intent: "Access public tools and templates.",
  },
] satisfies PublicCta[];

export const productFacts = [
  {
    id: "what-capveri-does",
    title: "CapVeri automates CAM reconciliation for commercial landlords",
    summary:
      "CapVeri uses ERP exports, rent rolls, lease terms, and billing details. It turns them into CAM support your team can check.",
    details: [
      "The workflow starts from files customers already control: CSV, Excel, and lease PDF exports.",
      "The calculation layer is deterministic and auditable. AI-assisted extraction is used only to help identify lease terms for human review.",
      "The app supports property setup, GL ingestion, lease review, expense pool mapping, reconciliation review, exports, and tenant-facing support workflows.",
    ],
    sourceIds: ["app-help", "marketing-help-center"],
    tags: ["product", "cam", "reconciliation"],
  },
  {
    id: "anti-integration",
    title: "CapVeri works without replacing the ERP",
    summary:
      "CapVeri is an export-based verification layer, not a Yardi, MRI, RealPage, or AppFolio replacement.",
    details: [
      "Users export GL, rent roll, recovery, and lease files from the system of record and upload those files into CapVeri.",
      "No API integration, implementation project, or ERP migration is required for the core workflow.",
      "The ERP remains the system of record while CapVeri checks CAM logic and prepares support packets.",
    ],
    sourceIds: ["marketing-help-center"],
    tags: ["erp", "integration", "positioning"],
  },
  {
    id: "deterministic-math",
    title: "Financial math is deterministic",
    summary:
      "CapVeri does not use an LLM to calculate tenant shares, gross-up adjustments, caps, variances, or billed amounts.",
    details: [
      "AI-assisted extraction can help identify lease terms from documents.",
      "Users review extracted terms before they affect reconciliation outputs.",
      "Calculation traces explain how CapVeri reached tenant-level amounts.",
    ],
    sourceIds: ["public-compliance", "app-help"],
    tags: ["ai", "calculation", "compliance"],
  },
  {
    id: "public-safe-boma-language",
    title: "Use BOMA 2024 aligned language",
    summary:
      "Public surfaces may describe CapVeri's calculation approach as BOMA 2024 aligned, but must not claim BOMA certification or legal compliance.",
    details: [
      "Use wording such as BOMA 2024 aligned calculation workflows or supports BOMA 2024 workflows.",
      "Do not imply third-party BOMA certification.",
      "Encourage lease and counsel review where measurement changes affect billing rights.",
    ],
    sourceIds: ["public-compliance"],
    tags: ["boma", "claims"],
  },
] satisfies ProductFact[];

export const publicClaims = [
  {
    id: "security-encryption-rls",
    category: "security",
    wording:
      "Data is encrypted in transit and at rest, and organization boundaries are enforced with row-level security.",
    sourceIds: ["public-compliance"],
    tags: ["security", "rls"],
  },
  {
    id: "ai-human-reviewed",
    category: "ai",
    wording:
      "AI-assisted extraction can suggest lease terms, but users review extracted values before they affect reconciliation outputs.",
    sourceIds: ["public-compliance", "app-help"],
    tags: ["ai", "human-review"],
  },
  {
    id: "deterministic-financial-math",
    category: "ai",
    wording:
      "Financial calculations are deterministic and traceable. CapVeri does not use an LLM to calculate tenant shares, gross-up adjustments, caps, variances, or billed amounts.",
    sourceIds: ["public-compliance", "app-help"],
    tags: ["ai", "calculation"],
  },
  {
    id: "boma-aligned-not-certified",
    category: "boma",
    wording:
      "CapVeri supports BOMA 2024 aligned calculation workflows, but does not claim third-party BOMA certification.",
    sourceIds: ["public-compliance"],
    tags: ["boma", "claims"],
  },
  {
    id: "erp-export-workflow",
    category: "erp",
    wording:
      "CapVeri works from ERP exports and does not require Yardi, MRI, RealPage, or AppFolio API integrations for the core workflow.",
    sourceIds: ["marketing-help-center"],
    tags: ["erp", "anti-integration"],
  },
  {
    id: "trial-no-card",
    category: "trial",
    wording:
      "Reconcile includes a {{pricing.trialLabel}} with no credit card required to start.",
    sourceIds: ["plan-tiers"],
    tags: ["trial", "pricing"],
  },
  {
    id: "money-back-guarantee",
    category: "pricing",
    wording:
      "Reconcile has a 30-day money-back guarantee. Not happy after your first paid invoice? Request a refund from billing within 30 days. We refund that invoice and cancel the subscription.",
    sourceIds: ["public-compliance"],
    tags: ["pricing", "guarantee", "refund"],
  },
  {
    id: "support-escalation",
    category: "support",
    wording:
      "Sensitive commercial, security, legal, privacy, and unsupported product questions should be routed to the appropriate public contact instead of inventing commitments.",
    sourceIds: ["public-compliance"],
    tags: ["support", "escalation"],
  },
] satisfies PublicClaim[];

export const publicMessaging = {
  landingHero: {
    eyebrow: "Export-based CAM reconciliation",
    headline: "CAM reconciliation software for commercial landlords",
    subhead:
      "Upload ERP exports and lease files. Verify CAM math with deterministic calculations. Produce tenant-ready support packets without replacing your accounting system.",
  },
  valueProps: [
    "Verify gross-up, cap, base-year, expense-pool, and pro-rata logic against lease terms.",
    "Keep the ERP as the system of record while CapVeri handles reconciliation review.",
    "Use AI-assisted lease extraction only as a reviewed input to deterministic financial math.",
  ],
  stats: [
    {
      label: "Trial",
      value: "30 days",
      context: "No credit card required for Reconcile.",
    },
    {
      label: "Pricing model",
      value: "Unit-based",
      context:
        "Reconcile pricing scales from the selected rentable unit count.",
    },
  ],
  workflowSteps: [
    {
      title: "Upload exports",
      body: "Start from GL and rent roll files. Add billing detail and lease PDF exports your team already controls.",
    },
    {
      title: "Review lease terms",
      body: "Confirm extracted and entered terms before they affect reconciliation outputs.",
    },
    {
      title: "Run deterministic checks",
      body: "Trace gross-up, caps, pro-rata shares, and expense classifications with repeatable calculations.",
    },
    {
      title: "Export support packets",
      body: "Prepare tenant-ready summaries, exception details, and support documentation.",
    },
  ],
  trustIndicators: [
    "No ERP replacement required.",
    "No LLM financial math.",
    "Human review before extracted lease terms affect calculations.",
  ],
  auth: {
    trialCopy:
      "Start a 30-day self-serve trial with no credit card required. Add billing before the trial ends to keep access.",
    trustCopy:
      "Financial math is deterministic, and AI-assisted extraction remains human-reviewed.",
  },
  onboarding: {
    trialCta: "Start Free Trial (30 days free)",
    paywallCopy:
      "Choose your Reconcile unit count to keep using CapVeri after the trial window.",
  },
  inquiryTypes: [
    { id: "sales", label: "Pricing or plan fit", contactId: "sales" },
    { id: "support", label: "Product support", contactId: "support" },
    { id: "security", label: "Security review", contactId: "security" },
    { id: "privacy", label: "Privacy request", contactId: "privacy" },
  ],
  feedbackTaxonomy: [
    {
      id: "source-correction",
      label: "Source correction",
      contactId: "source-feedback",
    },
    {
      id: "content-feedback",
      label: "Content feedback",
      contactId: "source-feedback",
    },
    {
      id: "unsubscribe",
      label: "Unsubscribe request",
      contactId: "unsubscribe",
    },
  ],
} satisfies PublicMessaging;

export const resourceFacts = [
  {
    id: "pricing",
    title: "Pricing",
    description:
      "Current CapVeri Reconcile pricing, limited offer, and trial details.",
    dateModified: "2026-03-27",
    faqIds: ["landing-pricing", "landing-trial"],
    ctaId: "startTrial",
    claimIds: ["trial-no-card"],
  },
  {
    id: "public-llms",
    title: "Public AI knowledge files",
    description:
      "Published llms.txt and pricing artifacts generated from canonical public knowledge.",
    dateModified: "2026-03-27",
    ctaId: "learnMore",
    claimIds: ["erp-export-workflow", "deterministic-financial-math"],
  },
] satisfies ResourceFact[];

export const landingFaqs = [
  {
    id: "landing-what-is-capveri",
    question: "What is CapVeri?",
    answer:
      "CapVeri helps commercial landlords check CAM work. It is for property managers, controllers, and CRE finance teams. It uses ERP exports, rent rolls, billing details, and lease terms. It creates CAM support your team can check.",
    tags: ["landing", "product"],
    sourceIds: ["marketing-help-center"],
  },
  {
    id: "landing-no-erp-replacement",
    question: "How does CapVeri work without replacing our ERP?",
    answer:
      "CapVeri starts from the files your team already uses. Export GL, rent roll, billing, and lease data. It can come from Yardi, MRI, RealPage, AppFolio, or another system. Upload those files into CapVeri. The app maps lease terms and runs CAM math. It flags items to check and exports support packets. You do not need to replace your ERP.",
    tags: ["landing", "erp"],
    sourceIds: ["marketing-help-center"],
  },
  {
    id: "landing-ai-calculations",
    question: "Are CAM calculations handled by AI?",
    answer:
      "No. Financial calculations remain deterministic and traceable. AI-assisted extraction can help identify lease terms from documents. Your team reviews extracted values before they are applied. CAM math runs through auditable calculation logic.",
    tags: ["landing", "ai"],
    sourceIds: ["public-compliance"],
  },
  {
    id: "landing-trial",
    question: "What does the free trial include?",
    answer:
      "Generated from plan-tiers.json by scripts/generate-public-knowledge.mjs.",
    tags: ["landing", "pricing"],
    sourceIds: ["plan-tiers"],
  },
  {
    id: "landing-pricing",
    question: "How much does CapVeri cost?",
    answer:
      "Generated from plan-tiers.json by scripts/generate-public-knowledge.mjs.",
    tags: ["landing", "pricing"],
    sourceIds: ["plan-tiers"],
  },
  {
    id: "landing-lease-structures",
    question: "What lease structures and cap types does CapVeri handle?",
    answer:
      "CapVeri supports common CAM recovery structures: base-year leases, expense stops, gross leases with CAM pass-throughs, and modified gross structures. Cap types include non-cumulative, cumulative, and cumulative compounding. Exclusions, admin fees, and pro-rata share rules are also supported.",
    tags: ["landing", "leases"],
    sourceIds: ["marketing-help-center"],
  },
  {
    id: "landing-lease-pdfs",
    question: "Can CapVeri read lease terms from PDF documents?",
    answer:
      "Yes. Upload a lease PDF and CapVeri can help extract key terms: base year, pro-rata share, cap rate, admin fee, and exclusions. Your team reviews every extracted value before it is applied to a reconciliation.",
    tags: ["landing", "lease-extraction"],
    sourceIds: ["public-compliance"],
  },
  {
    id: "landing-tenant-disputes",
    question: "How does CapVeri support tenant disputes or questions?",
    answer:
      "CapVeri provides a line-by-line calculation trace, source-file references, and an audit trail for inputs, mappings, exceptions, and adjustments. Teams use that record to answer tenant questions and prepare documentation for review.",
    tags: ["landing", "tenant"],
    sourceIds: ["app-help"],
  },
  {
    id: "landing-data-safety",
    question: "Is my financial data safe?",
    answer:
      "Data is protected with encryption and organization-scoped access controls. GL calculations are deterministic, and AI-assisted extraction remains advisory and human-reviewed.",
    tags: ["landing", "security"],
    sourceIds: ["public-compliance"],
  },
] satisfies MarketingFaq[];

export const competitorPositioning = [
  {
    id: "yardi",
    name: "Yardi",
    category: "ERP",
    positioning:
      "Yardi is a property management system. CapVeri is an export-based CAM verification and support layer.",
    safeComparison:
      "CapVeri complements Yardi by checking exported GL, rent roll, and lease data without replacing the ERP.",
    objectionResponse:
      "If Yardi remains your system of record, use CapVeri as an independent workflow for lease-term verification, deterministic CAM checks, and tenant-ready support packets.",
    sourceIds: ["marketing-help-center"],
  },
  {
    id: "mri",
    name: "MRI Software",
    category: "ERP",
    positioning:
      "MRI is a property management platform. CapVeri focuses on CAM reconciliation verification from exported files.",
    safeComparison:
      "CapVeri avoids custom integrations by working with spreadsheet exports from MRI and other systems.",
    objectionResponse:
      "You do not need to migrate from MRI to use CapVeri. Export the files your team already reviews and run the reconciliation workflow from those sources.",
    sourceIds: ["marketing-help-center"],
  },
  {
    id: "spreadsheets",
    name: "Spreadsheets",
    category: "Manual workflow",
    positioning:
      "Spreadsheets are flexible but hard to audit consistently across lease terms, cap structures, and tenant packets.",
    safeComparison:
      "CapVeri keeps the workflow file-based while moving the calculation trace, warnings, and exports into a controlled application.",
    objectionResponse:
      "Teams can still export to CSV or Excel, but CapVeri gives them repeatable checks and review workflows before numbers go to tenants.",
    sourceIds: ["app-help", "marketing-help-center"],
  },
] satisfies CompetitorPositioning[];

export const contactEscalations = [
  ...publicContacts.map((contact) => ({
    id: contact.id,
    label: contact.label,
    email: contact.email,
    useFor: contact.useCases,
    boundary: contact.escalationBoundary,
  })),
] satisfies ContactEscalation[];

export const featureDomains = [
  {
    id: "data-ingestion",
    label: "Data ingestion",
    summary:
      "Import GL, rent roll, and billing files from Yardi, MRI, AppFolio, RealPage, or generic CSV/Excel exports.",
  },
  {
    id: "calculation-engine",
    label: "Calculation engine",
    summary:
      "Run deterministic BOMA 2024 gross-up, caps, base year, occupancy, and tenant share logic with full traceability.",
  },
  {
    id: "lease-management",
    label: "Lease management",
    summary:
      "Maintain lease terms with version history and AI-assisted extraction that always requires human verification.",
  },
  {
    id: "reconciliation-workflow",
    label: "Reconciliation workflow",
    summary:
      "Manage calculation jobs, snapshots, campaign lifecycle, and reconciliation views from draft through finalization.",
  },
  {
    id: "tenant-portal",
    label: "Tenant portal",
    summary:
      "Invite tenants to view statements, file disputes, comment, upload attachments, and track resolution status.",
  },
  {
    id: "compliance-legal",
    label: "Compliance and legal",
    summary:
      "Generate SB 1103 support exports, tenant billing documents, and locked audit records for review-ready CRE compliance workflows.",
  },
  {
    id: "exports-reporting",
    label: "Exports and reporting",
    summary:
      "Deliver tenant packets and property reports in PDF, Excel, and CSV with export history and audit support.",
  },
  {
    id: "billing-subscriptions",
    label: "Billing and subscriptions",
    summary:
      "Reconcile subscription pricing with a {{pricing.trialLabel}}, no card required at signup, Stripe checkout, and invoices.",
  },
  {
    id: "platform-infrastructure",
    label: "Platform and security",
    summary:
      "Enforce RBAC, RLS-backed multi-tenancy, onboarding, and organization controls across every tenant workspace.",
  },
] satisfies FeatureDomainFact[];

export const productFeatures = [
  {
    key: "ingestion-csv-excel",
    name: "ERP export ingestion",
    description:
      "Upload CSV or Excel exports from Yardi, MRI, AppFolio, RealPage, or generic templates without API integrations.",
    domain: "data-ingestion",
    tier: "reconcile",
  },
  {
    key: "deterministic-calc-engine",
    name: "Deterministic calculation engine",
    description:
      "Apply BOMA 2024 gross-up, caps, base year, occupancy, and tenant share math with reproducible outputs.",
    domain: "calculation-engine",
    tier: "reconcile",
  },
  {
    key: "leakage-detection",
    name: "Reconciliation accuracy checks",
    description:
      "Get every charge right before statements go to tenants, with under-billed and over-billed positions surfaced inside the reconciliation.",
    domain: "calculation-engine",
    tier: "reconcile",
  },
  {
    key: "ai-gl-analysis",
    name: "GL Narrative Review Queue",
    description:
      "CapVeri flags GL descriptions that may need review for CapEx/OpEx miscoding, non-recoverable expenses, and audit risk patterns before statements are sent.",
    domain: "calculation-engine",
    tier: "reconcile",
  },
  {
    key: "historical-analysis",
    name: "Historical analysis",
    description:
      "Compare multi-year results, detect anomalies, and benchmark variance across periods and pools.",
    domain: "calculation-engine",
    tier: "reconcile",
  },
  {
    key: "lease-ai-with-review",
    name: "Lease extraction with required human review",
    description:
      "Extract lease terms from PDF documents, including accounting basis (cash vs. accrual), cap type, gross-up settings, and admin fees, and require explicit user verification before calculations use any value.",
    domain: "lease-management",
    tier: "reconcile",
  },
  {
    key: "snapshot-and-campaign",
    name: "Snapshot and campaign workflow",
    description:
      "Track calculation jobs, draft/finalized snapshots, and reconciliation campaign stages in one workflow.",
    domain: "reconciliation-workflow",
    tier: "reconcile",
  },
  {
    key: "tenant-portal",
    name: "Tenant portal",
    description:
      "Invite tenants to view reconciliation statements, track balances, and access their documents in a secure portal.",
    domain: "tenant-portal",
    tier: "reconcile",
  },
  {
    key: "dispute-management",
    name: "Dispute management",
    description:
      "Support dispute filing, threaded comments, attachments, and resolution tracking for tenant challenges.",
    domain: "tenant-portal",
    tier: "reconcile",
  },
  {
    key: "tenant-communications",
    name: "Tenant communications",
    description:
      "Send reconciliation notifications, statement delivery emails, and dispute updates to tenants.",
    domain: "tenant-portal",
    tier: "reconcile",
  },
  {
    key: "sb1103-and-demand-letters",
    name: "SB 1103 and billing document workflows",
    description:
      "Produce California SB 1103 exports, demand-letter drafts for under-billed balances, and correction notes for clean or over-billed statements.",
    domain: "compliance-legal",
    tier: "reconcile",
  },
  {
    key: "append-only-audit-trail",
    name: "Append-only audit trail",
    description:
      "Record reconciliation changes and finalized states in append-only audit records for defensible reporting.",
    domain: "compliance-legal",
    tier: "reconcile",
  },
  {
    key: "audit-defense-package",
    name: "One-click audit defense package",
    description:
      "Bundle reconciliation statement, calculation trace, GL extract, and NDA into a single ZIP for tenant auditors.",
    domain: "compliance-legal",
    tier: "reconcile",
  },
  {
    key: "multi-format-exports",
    name: "Multi-format exports",
    description:
      "Export tenant packets and supporting schedules in PDF, Excel, and CSV for downstream review and delivery.",
    domain: "exports-reporting",
    tier: "reconcile",
  },
  {
    key: "statement-detail-advisor",
    name: "Statement detail level advisor",
    description:
      "Pre-export analysis flags overly granular line items and suggests strategic grouping to reduce tenant dispute risk.",
    domain: "exports-reporting",
    tier: "reconcile",
  },
  {
    key: "pricing-and-checkout",
    name: "Subscription pricing and checkout",
    description:
      "The annual Reconcile plan includes a {{pricing.trialLabel}}. Checkout is self-serve. Access pauses if billing is missing.",
    domain: "billing-subscriptions",
    tier: "reconcile",
  },
  {
    key: "denominator-audit-trail",
    name: "Denominator change audit trail",
    description:
      "Automatically detect and document when the denominator shifts, including RSF re-measurement, anchor tenant departure, and BOMA 2024 re-measurement, and show exactly how each tenant's pro-rata share moved and by how much.",
    domain: "calculation-engine",
    tier: "reconcile",
  },
  {
    key: "cap-bank-tracking",
    name: "Cumulative cap bank tracking",
    description:
      "Track multi-year cap carryovers so excess operating expenses roll forward correctly across reconciliation periods.",
    domain: "calculation-engine",
    tier: "reconcile",
  },
  {
    key: "importable-adjustment-exports",
    name: "Importable adjustment exports",
    description:
      "Export reviewed CAM adjustments as CSV and Excel files. Your team can check them before ERP import.",
    domain: "exports-reporting",
    tier: "reconcile",
  },
  {
    key: "anomaly-alerts",
    name: "Anomaly alerts",
    description:
      "Flag unusual expense variances, outlier GL entries, and year-over-year deviations that may indicate errors.",
    domain: "calculation-engine",
    tier: "reconcile",
  },
  {
    key: "noi-impact-calculator",
    name: "NOI impact calculator",
    description:
      "Model how reconciliation adjustments flow through to net operating income at the property and portfolio level.",
    domain: "calculation-engine",
    tier: "reconcile",
  },
  {
    key: "portfolio-board-reports",
    name: "Portfolio and board-ready reports",
    description:
      "Generate executive-level summaries and board presentation materials across all properties in the portfolio.",
    domain: "exports-reporting",
    tier: "reconcile",
  },
  {
    key: "tax-protest-package",
    name: "Tax protest data package",
    description:
      "Bundle CAM reconciliation data, expense histories, and supporting schedules for property tax protest filings.",
    domain: "compliance-legal",
    tier: "reconcile",
  },
  {
    key: "rbac-and-rls",
    name: "RBAC and row-level isolation",
    description:
      "Protect organization data with role-based access and RLS-backed multi-tenant separation.",
    domain: "platform-infrastructure",
    tier: "reconcile",
  },
] satisfies ProductFeatureFact[];

export const seoFeatureList: string[] = productFeatures.map((f) => f.name);

export const assistantGuardrails = [
  {
    id: "public-safe-only",
    rule: "Use only approved public product, help, pricing, and support facts from this KB.",
    allowed: [
      "Explain CapVeri workflows from generated KB facts.",
      "Discuss public package names, limited offer prices, trial length, and feature tiers.",
      "Escalate to the founder contact for custom or sensitive requests.",
    ],
    disallowed: [
      "Expose private operational details, credentials, customer data, or non-public research.",
      "Use non-public planning, testing, or operations material as public facts.",
    ],
  },
  {
    id: "ai-claims",
    rule: "Describe AI as assistive extraction only, with human review before financial use.",
    allowed: [
      "AI-assisted lease extraction can suggest terms for review.",
      "Financial calculations are deterministic and traceable.",
    ],
    disallowed: [
      "Standalone AI positioning without deterministic-math and human-review guardrails.",
      "Claims that AI calculates CAM charges or changes financial outputs without review.",
      "Unverified data-retention guarantees.",
    ],
  },
  {
    id: "pricing-claims",
    rule: "Use current Reconcile unit-based subscription language from approved pricing facts.",
    allowed: [
      "Start Free Trial.",
      "Reconcile.",
      "Active limited offer prices when present in approved pricing facts.",
    ],
    disallowed: [
      "Old Growth or Portfolio package names.",
      "Retired credit-based audit packaging.",
      "Retired free-audit CTA language as the primary CTA.",
    ],
  },
  {
    id: "compliance-claims",
    rule: "Keep compliance language precise and non-certifying.",
    allowed: [
      "BOMA 2024 aligned calculation workflows.",
      "Lease review and counsel review for ambiguous billing rights.",
    ],
    disallowed: [
      "Third-party BOMA certification claims.",
      "Legal, accounting, or audit opinions.",
    ],
  },
] satisfies AssistantGuardrail[];
