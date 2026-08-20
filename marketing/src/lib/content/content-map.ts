import type { FunnelStage } from "./types";

// Funnel stage for pSEO content types
export const PSEO_FUNNEL_STAGES: Record<string, FunnelStage> = {
  glossary: "tofu",
  metros: "tofu",
  "property-types": "tofu",
  states: "mofu",
  boma: "tofu",
  "lease-clauses": "mofu",
  expenses: "mofu",
  software: "mofu",
  roles: "mofu",
  workflows: "mofu",
  calendar: "mofu",
  comparisons: "bofu",
};

// Funnel stage per tool slug
export const TOOL_FUNNEL_STAGES: Record<string, FunnelStage> = {
  "cam-gross-up-calculator": "mofu",
  "pro-rata-calculator": "mofu",
  "cam-cap-calculator": "mofu",
  "base-year-escalation": "mofu",
  "boma-2024-calculator": "mofu",
  "boma-remeasurement-impact": "mofu",
  "noi-impact-calculator": "mofu",
  "cam-estimate-forecaster": "mofu",
  "cam-leakage-estimator": "mofu",
  "cam-overcharge-calculator": "mofu",
  "fixed-cam-vs-traditional": "mofu",
  "recovery-gap-analyzer": "mofu",
  "reconciliation-statement-generator": "mofu",
  "hcad-tax-normalizer": "mofu",
  "lease-abstract-matrix": "mofu",
  "admin-fee-calculator": "mofu",
  "audit-risk-quiz": "bofu",
  "audit-risk-scorecard": "bofu",
  "sb-1103-checker": "bofu",
};

// Blog category → default funnel stage
export const BLOG_CATEGORY_FUNNEL_DEFAULTS: Record<string, FunnelStage> = {
  "market-trends": "tofu",
  "cre-finops": "tofu",
  "cam-errors": "mofu",
  compliance: "mofu",
  "how-to": "mofu",
  operations: "mofu",
  technology: "mofu",
};

// Cross-links between pSEO resource hub pages
export const RESOURCE_HUB_CROSS_LINKS: Record<
  string,
  { href: string; label: string }[]
> = {
  boma: [
    { href: "/resources/property-types", label: "CAM by Property Type" },
    { href: "/resources/calculations", label: "CAM Calculation Scenarios" },
    { href: "/resources/lease-clauses", label: "Lease Clause Guides" },
  ],
  states: [
    { href: "/resources/markets", label: "CAM by Metro Market" },
    { href: "/resources/lease-clauses", label: "Lease Clause Guides" },
    { href: "/resources/cam-dispute", label: "CAM Dispute Guides" },
    {
      href: "/resources/florida-cam-compliance",
      label: "Florida CAM Compliance",
    },
    { href: "/resources/texas-cam-compliance", label: "Texas CAM Compliance" },
  ],
  markets: [
    { href: "/resources/states", label: "CAM Compliance by State" },
    { href: "/resources/property-types", label: "CAM by Property Type" },
    { href: "/resources/expenses", label: "Recoverable Expenses" },
  ],
  "property-types": [
    { href: "/resources/boma", label: "BOMA Measurement Standards" },
    { href: "/resources/markets", label: "CAM by Metro Market" },
    { href: "/resources/expenses", label: "Recoverable Expenses" },
    {
      href: "/resources/cam-reconciliation-life-sciences",
      label: "CAM for Life Sciences",
    },
  ],
  expenses: [
    { href: "/resources/calculations", label: "CAM Calculation Scenarios" },
    { href: "/resources/lease-clauses", label: "Lease Clause Guides" },
    { href: "/resources/workflows", label: "CAM Workflows" },
    {
      href: "/resources/environmental-compliance-cam",
      label: "Environmental Compliance Costs",
    },
  ],
  "lease-clauses": [
    { href: "/resources/lease-types", label: "Commercial Lease Types" },
    { href: "/resources/expenses", label: "Recoverable Expenses" },
    { href: "/resources/cam-dispute", label: "CAM Dispute Guides" },
  ],
  workflows: [
    { href: "/resources/calendar", label: "CAM Calendar" },
    { href: "/resources/software", label: "Property Software" },
    { href: "/resources/templates", label: "CAM Templates" },
    {
      href: "/resources/cam-reconciliation-new-acquisitions",
      label: "CAM for New Acquisitions",
    },
    {
      href: "/resources/lease-amendment-cam-impact",
      label: "Lease Amendment CAM Impact",
    },
  ],
  calendar: [
    { href: "/resources/workflows", label: "CAM Workflows" },
    { href: "/resources/states", label: "State Compliance Deadlines" },
    { href: "/resources/templates", label: "CAM Templates" },
    { href: "/resources/cam-season-2026", label: "2026 CAM Season Guide" },
    {
      href: "/resources/late-invoices-after-reconciliation",
      label: "Handling Late Invoices",
    },
  ],
  software: [
    { href: "/resources/workflows", label: "CAM Workflows" },
    { href: "/resources/roles", label: "CRE Roles" },
    { href: "/resources/expenses", label: "Recoverable Expenses" },
    {
      href: "/resources/export-cam-realpage",
      label: "Exporting CAM from RealPage",
    },
    {
      href: "/resources/mri-cam-recovery-errors",
      label: "MRI CAM Recovery Errors",
    },
    {
      href: "/resources/ai-cam-reconciliation-limits",
      label: "AI Limits in CAM",
    },
    {
      href: "/resources/cam-reconciliation-cost",
      label: "CAM Reconciliation Costs",
    },
  ],
  roles: [
    { href: "/resources/workflows", label: "CAM Workflows" },
    { href: "/resources/software", label: "Property Software" },
    { href: "/resources/lease-clauses", label: "Lease Clause Guides" },
    {
      href: "/resources/cam-reconciliation-for-property-managers",
      label: "CAM Reconciliation for Property Managers",
    },
    {
      href: "/resources/cam-results-ownership-reporting",
      label: "CAM Results & Ownership Reporting",
    },
    {
      href: "/resources/training-property-accountants-cam",
      label: "Training Property Accountants on CAM",
    },
  ],
  calculations: [
    { href: "/resources/boma", label: "BOMA Measurement Standards" },
    { href: "/resources/expenses", label: "Recoverable Expenses" },
    { href: "/resources/templates", label: "CAM Templates" },
  ],
  "cam-dispute": [
    { href: "/resources/states", label: "State Compliance" },
    { href: "/resources/lease-clauses", label: "Lease Clause Guides" },
    { href: "/resources/workflows", label: "CAM Workflows" },
  ],
  templates: [
    { href: "/resources/workflows", label: "CAM Workflows" },
    { href: "/resources/calculations", label: "CAM Calculations" },
    { href: "/resources/calendar", label: "CAM Calendar" },
    { href: "/resources/cam-statement", label: "CAM Statement Guide" },
  ],
  "lease-types": [
    { href: "/resources/lease-clauses", label: "Lease Clause Guides" },
    { href: "/resources/property-types", label: "CAM by Property Type" },
    { href: "/resources/expenses", label: "Recoverable Expenses" },
    {
      href: "/resources/nnn-lease-cam-reconciliation",
      label: "NNN Lease CAM Reconciliation Guide",
    },
    {
      href: "/resources/cam-billing-ground-leases",
      label: "CAM Billing in Ground Leases",
    },
  ],
  "process-operations": [
    {
      href: "/resources/cam-reconciliation-process",
      label: "CAM Reconciliation Process",
    },
    {
      href: "/resources/cam-reconciliation-checklist",
      label: "CAM Reconciliation Checklist",
    },
    {
      href: "/resources/cam-close-checklist",
      label: "CAM Close Checklist",
    },
    {
      href: "/resources/cam-pre-send-packet-checklist",
      label: "Pre-Send Packet Checklist",
    },
    {
      href: "/resources/month-end-cam-controls",
      label: "Month-End Controls",
    },
    { href: "/resources/cam-close-calendar", label: "CAM Close Calendar" },
  ],
  "dispute-prevention": [
    {
      href: "/resources/cam-dispute-response",
      label: "CAM Dispute Response Playbook",
    },
    {
      href: "/resources/audit-defense-packet",
      label: "Audit Defense Packet",
    },
    {
      href: "/resources/tenant-cam-audit-landlord-side",
      label: "Tenant Audit Requests",
    },
    {
      href: "/resources/cam-overbilling-landlord-liability",
      label: "CAM Overbilling Liability",
    },
    {
      href: "/resources/cam-dispute-trends-2026",
      label: "CAM Dispute Trends 2026",
    },
  ],
  "lease-clause-mechanics": [
    {
      href: "/resources/lease-clauses-that-change-cam-outcomes",
      label: "Lease Clauses That Change CAM",
    },
    { href: "/resources/cam-gross-up-guide", label: "CAM Gross-Up Guide" },
    {
      href: "/resources/cam-cap-enforcement",
      label: "CAM Cap Enforcement",
    },
    {
      href: "/resources/cumulative-cam-cap-bank",
      label: "Cumulative Cap Bank",
    },
    {
      href: "/resources/pro-rata-denominator-explained",
      label: "Pro-Rata Denominator",
    },
    {
      href: "/resources/anchor-exclusion-denominator-risk",
      label: "Anchor Exclusion Risk",
    },
  ],
  "expense-recoverability": [
    {
      href: "/resources/recoverable-vs-nonrecoverable-cam",
      label: "Recoverable vs Non-Recoverable",
    },
    {
      href: "/resources/management-fee-recoverability-cam",
      label: "Management Fee Recoverability",
    },
    {
      href: "/resources/property-tax-pass-through-cam",
      label: "Property Tax Pass-Throughs",
    },
    {
      href: "/resources/insurance-pass-through-cam",
      label: "Insurance Pass-Throughs",
    },
    {
      href: "/resources/capital-expenditures-recoverable-in-cam",
      label: "Recoverable CapEx",
    },
    { href: "/resources/capex-vs-opex-cam", label: "CapEx vs OpEx for CAM" },
  ],
  "gl-erp-qa": [
    {
      href: "/resources/gl-export-qa-cam",
      label: "GL Export QA Checklist",
    },
    {
      href: "/resources/detect-capex-in-gl-export",
      label: "Detect CapEx in GL Export",
    },
    {
      href: "/resources/why-erps-still-leak-cam-revenue",
      label: "Why ERPs Leak CAM Revenue",
    },
    {
      href: "/resources/export-based-verification-layer",
      label: "Export-Based Verification",
    },
  ],
  "market-data": [
    {
      href: "/resources/cam-benchmarks-by-property-type",
      label: "CAM Benchmarks by Property Type",
    },
    {
      href: "/resources/q1-2026-office-vacancy-cam-gross-up",
      label: "Q1 2026 Office Vacancy",
    },
    {
      href: "/resources/q1-2026-industrial-vacancy-cam-estimates",
      label: "Q1 2026 Industrial Vacancy",
    },
    {
      href: "/resources/cam-benchmark-methodology",
      label: "CAM Benchmark Methodology",
    },
  ],
  "property-type-guides": [
    {
      href: "/resources/office-cam-reconciliation",
      label: "Office CAM Reconciliation",
    },
    {
      href: "/resources/retail-cam-reconciliation",
      label: "Retail CAM Reconciliation",
    },
    {
      href: "/resources/industrial-cam-reconciliation",
      label: "Industrial CAM Reconciliation",
    },
    {
      href: "/resources/mixed-use-cam-reconciliation",
      label: "Mixed-Use CAM Reconciliation",
    },
  ],
};

// Curated related content per tool
export const TOOL_RELATED_CONTENT: Record<
  string,
  { href: string; label: string }[]
> = {
  "cam-gross-up-calculator": [
    {
      href: "/resources/cam-gross-up-calculation-guide",
      label: "CAM Gross-Up Calculation Guide",
    },
    {
      href: "/blog/boma-2024-changes",
      label: "BOMA 2024 Standard Changes",
    },
    {
      href: "/resources/lease-clauses/gross-up-clause",
      label: "BOMA Gross-Up Methodology",
    },
    { href: "/tools/boma-2024-calculator", label: "BOMA 2024 Calculator" },
    {
      href: "/tools/cam-cap-calculator",
      label: "CAM Cap Calculator",
    },
    { href: "/cam-charges", label: "What Are CAM Charges?" },
  ],
  "pro-rata-calculator": [
    {
      href: "/resources/pro-rata-share-calculation",
      label: "Pro Rata Share Calculation Guide",
    },
    {
      href: "/resources/lease-clauses/proportionate-share-definition",
      label: "Pro Rata Share Lease Clause Guide",
    },
    {
      href: "/resources/boma/rentable-vs-usable",
      label: "BOMA: Usable vs Rentable Area",
    },
    {
      href: "/tools/boma-2024-calculator",
      label: "BOMA 2024 Area Calculator",
    },
    { href: "/cam-charges", label: "What Are CAM Charges?" },
  ],
  "cam-cap-calculator": [
    {
      href: "/resources/cam-expense-caps",
      label: "CAM Expense Cap Strategies",
    },
    {
      href: "/resources/lease-clauses/cumulative-cam-cap",
      label: "CAM Cap Lease Clause Guide",
    },
    {
      href: "/resources/expenses/administrative-overhead",
      label: "Admin Fee Benchmarks",
    },
    {
      href: "/tools/cam-gross-up-calculator",
      label: "CAM Gross-Up Calculator",
    },
  ],
  "base-year-escalation": [
    {
      href: "/resources/base-year-expense-stop",
      label: "Base Year & Expense Stop Guide",
    },
    {
      href: "/resources/lease-clauses/expense-stop",
      label: "Base Year Expense Stop Guide",
    },
    {
      href: "/glossary/base-year",
      label: "What is a Base Year?",
    },
    {
      href: "/tools/cam-cap-calculator",
      label: "CAM Cap Calculator",
    },
  ],
  "boma-2024-calculator": [
    {
      href: "/blog/boma-2024-changes",
      label: "BOMA 2024 Standard Changes",
    },
    {
      href: "/resources/boma/boma-2024-adoption-roadmap",
      label: "BOMA 2024 Office Standard Deep Dive",
    },
    {
      href: "/tools/boma-remeasurement-impact",
      label: "Remeasurement Impact Estimator",
    },
    {
      href: "/tools/cam-gross-up-calculator",
      label: "CAM Gross-Up Calculator",
    },
    {
      href: "/blog/cam-reconciliation-best-practices-boma",
      label: "BOMA CAM Best Practices",
    },
  ],
  "boma-remeasurement-impact": [
    {
      href: "/blog/boma-2024-changes",
      label: "BOMA 2024 Standard Changes",
    },
    {
      href: "/resources/boma/boma-2024-adoption-roadmap",
      label: "BOMA 2024 Office Standard",
    },
    {
      href: "/tools/boma-2024-calculator",
      label: "BOMA 2024 Area Calculator",
    },
    {
      href: "/tools/pro-rata-calculator",
      label: "Pro Rata Share Calculator",
    },
  ],
  "noi-impact-calculator": [
    {
      href: "/blog/cam-reconciliation-errors",
      label: "Common CAM Reconciliation Errors",
    },
    {
      href: "/resources/expenses/administrative-overhead",
      label: "Administrative Expenses Guide",
    },
    {
      href: "/resources/benchmarking-operating-expenses",
      label: "Operating Expense Benchmarks",
    },
    {
      href: "/resources/capital-replacement-reserve-vs-cam",
      label: "CapEx Reserve vs CAM Pool",
    },
    {
      href: "/tools/cam-billing-error-estimator",
      label: "CAM Billing Error Estimator",
    },
    {
      href: "/tools/recovery-gap-analyzer",
      label: "Billing Gap Analyzer",
    },
    {
      href: "/blog/capital-expenditure-cam-pool-rules",
      label: "CapEx in CAM Pool Rules",
    },
  ],
  "cam-estimate-forecaster": [
    {
      href: "/blog/cam-reconciliation-errors",
      label: "Common CAM Reconciliation Errors",
    },
    {
      href: "/cam-reconciliation-guide",
      label: "Annual CAM Reconciliation Workflow",
    },
    {
      href: "/tools/cam-cap-calculator",
      label: "CAM Cap Calculator",
    },
    {
      href: "/tools/cam-gross-up-calculator",
      label: "Gross-Up Calculator",
    },
    {
      href: "/blog/cam-reconciliation-questions-property-managers-ask",
      label: "Top 20 CAM Questions PMs Ask",
    },
  ],
  "cam-leakage-estimator": [
    {
      href: "/blog/cam-numbers-not-matching-yardi",
      label: "Why CAM Numbers Don't Match Yardi",
    },
    {
      href: "/cam-reconciliation-guide",
      label: "CAM Variance Investigation Workflow",
    },
    {
      href: "/tools/recovery-gap-analyzer",
      label: "Billing Gap Analyzer",
    },
    {
      href: "/tools/noi-impact-calculator",
      label: "NOI Impact Calculator",
    },
  ],
  "cam-overcharge-calculator": [
    {
      href: "/resources/capex-vs-opex-cam",
      label: "CapEx vs OpEx for CAM",
    },
    {
      href: "/resources/pro-rata-share-validation",
      label: "Pro-Rata Share Validation",
    },
    {
      href: "/tools/cam-cap-calculator",
      label: "CAM Cap Calculator",
    },
    {
      href: "/cam-audit",
      label: "CAM Audit Guide",
    },
  ],
  "fixed-cam-vs-traditional": [
    {
      href: "/resources/cam-reconciliation-vs-estimate",
      label: "CAM Estimate vs Reconciliation",
    },
    {
      href: "/resources/lease-clauses/opex-exclusions",
      label: "Fixed CAM Lease Clause Guide",
    },
    {
      href: "/tools/cam-estimate-forecaster",
      label: "CAM Estimate Forecaster",
    },
  ],
  "recovery-gap-analyzer": [
    {
      href: "/blog/cam-reconciliation-errors",
      label: "Common CAM Reconciliation Errors",
    },
    {
      href: "/cam-reconciliation-guide",
      label: "CAM Variance Investigation",
    },
    {
      href: "/tools/cam-billing-error-estimator",
      label: "CAM Billing Error Estimator",
    },
    {
      href: "/tools/noi-impact-calculator",
      label: "NOI Impact Calculator",
    },
  ],
  "reconciliation-statement-generator": [
    {
      href: "/cam-reconciliation-guide",
      label: "Annual CAM Reconciliation Workflow",
    },
    {
      href: "/blog/cam-reconciliation-audit-trail",
      label: "CAM Reconciliation Audit Trail",
    },
    {
      href: "/tools/cam-estimate-forecaster",
      label: "CAM Estimate Forecaster",
    },
    {
      href: "/blog/cam-true-up-vs-cam-reconciliation",
      label: "True-Up vs Reconciliation",
    },
    { href: "/resources/cam-statement", label: "CAM Statement Guide" },
  ],
  "hcad-tax-normalizer": [
    {
      href: "/resources",
      label: "Houston CAM Market Guide",
    },
    {
      href: "/resources/commercial-tenant-cam-disclosure-by-state",
      label: "Texas CAM Compliance Guide",
    },
    {
      href: "/resources/expenses/property-taxes",
      label: "Real Estate Taxes: What's Recoverable",
    },
    {
      href: "/tools/noi-impact-calculator",
      label: "NOI Impact Calculator",
    },
  ],
  "lease-abstract-matrix": [
    {
      href: "/lease-abstraction",
      label: "Lease Abstraction Workflow",
    },
    {
      href: "/resources/lease-clauses/expense-stop",
      label: "Base Year Expense Stop Guide",
    },
    {
      href: "/tools/cam-cap-calculator",
      label: "CAM Cap Calculator",
    },
    { href: "/cam-audit", label: "CAM Audit Guide" },
    { href: "/case-studies", label: "Extraction Case Studies" },
  ],
  "admin-fee-calculator": [
    {
      href: "/blog/management-fee-cam-charges-rules",
      label: "Management Fee Rules in CAM",
    },
    {
      href: "/resources/expenses/administrative-overhead",
      label: "Administrative Expenses Guide",
    },
    {
      href: "/tools/cam-cap-calculator",
      label: "CAM Cap Calculator",
    },
    {
      href: "/tools/cam-gross-up-calculator",
      label: "CAM Gross-Up Calculator",
    },
  ],
  "audit-risk-quiz": [
    {
      href: "/blog/cam-reconciliation-errors",
      label: "Common CAM Reconciliation Errors",
    },
  {
    href: "/tools/audit-risk-scorecard",
    label: "Pre-Send Audit Exposure Scorecard",
  },
    {
      href: "/resources/tenant-audit-rights-landlord",
      label: "Tenant Audit Rights: Landlord Perspective",
    },
    {
      href: "/resources/commercial-lease-audit-clause-drafting",
      label: "Drafting Audit Clauses in Commercial Leases",
    },
    {
      href: "/vs/excel",
      label: "CapVeri vs Excel for CAM",
    },
    {
      href: "/pricing",
      label: "CapVeri Pricing",
    },
    { href: "/cam-audit", label: "CAM Audit Guide" },
    {
      href: "/blog/commercial-lease-audit-procedures",
      label: "How Commercial Lease Audits Work",
    },
  ],
  "audit-risk-scorecard": [
    {
      href: "/blog/cam-reconciliation-errors",
      label: "Common CAM Reconciliation Errors",
    },
  {
    href: "/tools/audit-risk-quiz",
    label: "Pre-Send Audit Exposure Quiz",
  },
    {
      href: "/resources/tenant-audit-rights-landlord",
      label: "Tenant Audit Rights: Landlord Perspective",
    },
    {
      href: "/resources/cam-audit",
      label: "CAM Audit Resource Guide",
    },
    {
      href: "/vs/excel",
      label: "CapVeri vs Excel for CAM",
    },
    {
      href: "/pricing",
      label: "CapVeri Pricing",
    },
    { href: "/cam-audit", label: "CAM Audit Guide" },
    {
      href: "/blog/cpa-guide-cam-reconciliation-audit",
      label: "CPA Guide to CAM Audits",
    },
  ],
  "sb-1103-checker": [
    {
      href: "/resources/commercial-tenant-cam-disclosure-by-state",
      label: "California CAM Compliance Guide",
    },
    {
      href: "/blog/sb-1103-one-year-later",
      label: "SB 1103: What Landlords Learned",
    },
    {
      href: "/resources/sb-1103-compliance",
      label: "Qualified Small Tenant Clause Guide",
    },
    {
      href: "/vs/excel",
      label: "CapVeri vs Excel for CAM",
    },
  ],
  "cam-reconciliation-template": [
    { href: "/cam-reconciliation-guide", label: "CAM Reconciliation Guide" },
    { href: "/cam-audit", label: "CAM Audit Guide" },
    {
      href: "/resources/cam-reconciliation-template",
      label: "CAM Reconciliation Template Guide",
    },
    {
      href: "/tools/cam-estimate-forecaster",
      label: "CAM Estimate Forecaster",
    },
    {
      href: "/tools/reconciliation-statement-generator",
      label: "Reconciliation Statement Generator",
    },
  ],
  "cumulative-cap-bank-calculator": [
    {
      href: "/resources/cumulative-cam-cap-bank",
      label: "Cumulative CAM Cap Bank Explained",
    },
    {
      href: "/resources/cam-cap-enforcement",
      label: "CAM Cap Enforcement Guide",
    },
    {
      href: "/resources/lease-clauses-that-change-cam-outcomes",
      label: "Lease Clauses That Change CAM Outcomes",
    },
    { href: "/tools/cam-cap-calculator", label: "CAM Cap Calculator" },
  ],
  "cam-pre-send-packet-checklist-download": [
    {
      href: "/resources/cam-pre-send-packet-checklist",
      label: "CAM Pre-Send Packet Checklist Guide",
    },
    {
      href: "/resources/cam-reconciliation-checklist",
      label: "CAM Reconciliation Checklist",
    },
    {
      href: "/resources/cam-close-checklist",
      label: "CAM Close Checklist",
    },
    {
      href: "/resources/cam-reconciliation-process",
      label: "CAM Reconciliation Process",
    },
  ],
  "yardi-export-qa-checklist": [
    {
      href: "/resources/gl-export-qa-cam",
      label: "GL Export QA for CAM Reconciliation",
    },
    {
      href: "/resources/why-erps-still-leak-cam-revenue",
      label: "Why ERPs Still Leak CAM Revenue",
    },
    {
      href: "/yardi-cam-reconciliation",
      label: "Yardi CAM Reconciliation Guide",
    },
    { href: "/vs/yardi", label: "CapVeri vs Yardi" },
  ],
  "mri-recovery-billing-qa-checklist": [
    {
      href: "/resources/gl-export-qa-cam",
      label: "GL Export QA for CAM Reconciliation",
    },
    {
      href: "/resources/why-erps-still-leak-cam-revenue",
      label: "Why ERPs Still Leak CAM Revenue",
    },
    {
      href: "/mri-cam-reconciliation",
      label: "MRI CAM Reconciliation Guide",
    },
    { href: "/vs/mri", label: "CapVeri vs MRI" },
  ],
  "multi-state-cam-disclosure-matrix": [
    {
      href: "/resources/commercial-tenant-cam-disclosure-by-state",
      label: "CAM Disclosure by State",
    },
    {
      href: "/resources/california-sb-1103-cam-guide",
      label: "SB 1103 Guide",
    },
    {
      href: "/resources/cam-reconciliation-deadlines",
      label: "CAM Reconciliation Deadlines",
    },
    { href: "/resources/states", label: "State Compliance Hub" },
  ],
  "cam-recovery-ratio-worksheet": [
    {
      href: "/resources/cam-recovery-ratio",
      label: "CAM Recovery Ratio Guide",
    },
    {
      href: "/resources/cam-benchmarks-by-property-type",
      label: "CAM Benchmarks by Property Type",
    },
    {
      href: "/resources/recoverable-vs-nonrecoverable-cam",
      label: "Recoverable vs Non-Recoverable CAM",
    },
  ],
  "property-tax-appeal-recovery-calculator": [
    {
      href: "/resources/property-tax-pass-through-cam",
      label: "Property Tax Pass-Through Guide",
    },
    {
      href: "/resources/recoverable-vs-nonrecoverable-cam",
      label: "Recoverable vs Non-Recoverable CAM",
    },
    {
      href: "/resources/operating-expense-reconciliation-commercial-lease",
      label: "OE Reconciliation Handbook",
    },
  ],
  "tenant-dispute-response-letter-template": [
    {
      href: "/resources/cam-dispute-response",
      label: "CAM Dispute Response Playbook",
    },
    {
      href: "/resources/audit-defense-packet",
      label: "Audit Defense Packet Guide",
    },
    {
      href: "/resources/cam-demand-letter-workflow",
      label: "CAM Demand Letter Workflow",
    },
  ],
  "audit-defense-packet-builder": [
    {
      href: "/resources/audit-defense-packet",
      label: "Audit Defense Packet Guide",
    },
    {
      href: "/resources/landlord-audit-rights-cam-recordkeeping",
      label: "Landlord Audit Rights",
    },
    {
      href: "/resources/what-is-a-cam-audit-landlord",
      label: "What Is a CAM Audit",
    },
    {
      href: "/resources/tenant-cam-audit-landlord-side",
      label: "Tenant CAM Audit Guide",
    },
  ],
  "lease-clause-extraction-matrix": [
    {
      href: "/resources/lease-abstraction-fields-for-cam",
      label: "Lease Abstraction Fields for CAM",
    },
    {
      href: "/resources/lease-clauses-that-change-cam-outcomes",
      label: "Lease Clauses That Change CAM",
    },
    {
      href: "/resources/pro-rata-denominator-explained",
      label: "Pro-Rata Denominator Explained",
    },
  ],
};

// Pillar page → cluster page mapping for internal linking
export const PILLAR_CLUSTERS: Record<
  string,
  { label: string; product: string; cluster: string[] }
> = {
  "/cam-reconciliation-guide": {
    label: "CAM Reconciliation Guide",
    product: "/cam-reconciliation-software",
    cluster: [
      "/resources/cam-gross-up-calculation-guide",
      "/resources/cam-expense-caps",
      "/blog/cam-reconciliation-deadlines",
      "/blog/cam-reconciliation-season-2026-guide",
      "/blog/cam-numbers-not-matching-yardi",
      "/blog/yardi-cam-recovery-pool-setup",
      "/tools/reconciliation-statement-generator",
      "/tools/cam-estimate-forecaster",
      "/glossary/cam-reconciliation",
      "/cam-reconciliation-guide",
    ],
  },
};

// Maps high-traffic glossary terms to ICP-relevant CTAs
export const GLOSSARY_ICP_CTAS: Record<
  string,
  { href: string; label: string; context: string }
> = {
  "cam-reconciliation": {
    href: "/cam-reconciliation-software",
    label: "Automate CAM Reconciliation",
    context:
      "Property managers spend 40+ hours per property on manual reconciliation.",
  },
  "gross-up-clause": {
    href: "/tools/cam-gross-up-calculator",
    label: "Calculate Gross-Up",
    context:
      "Use our free calculator to verify your gross-up calculations instantly.",
  },
  "administrative-fee": {
    href: "/tools/admin-fee-calculator",
    label: "Check Your Admin Fees",
    context: "Admin fees are one of the most common CAM overcharge categories.",
  },
  "cam-cap": {
    href: "/tools/cam-cap-calculator",
    label: "Model Your CAM Caps",
    context:
      "See how compounding vs. non-compounding caps affect your costs over time.",
  },
  "base-year": {
    href: "/tools/base-year-escalation",
    label: "Calculate Base Year Impact",
    context:
      "Base year selection directly impacts every future reconciliation.",
  },
  "rent-abatement": {
    href: "/cam-reconciliation-guide",
    label: "CAM During Abatement Periods",
    context:
      "Tenants on rent abatement may still owe CAM - verify your lease terms.",
  },
  "operating-expense-pass-through": {
    href: "/cam-reconciliation-software",
    label: "Automate Pass-Through Tracking",
    context:
      "Track every pass-through expense category against lease terms automatically.",
  },
};
