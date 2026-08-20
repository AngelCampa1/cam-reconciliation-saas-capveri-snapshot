/**
 * TypeScript types mirroring the Python cross_doc_models.py schema.
 * Financial values are kept as strings for Decimal.js round-trip fidelity.
 */

export type FindingSeverity = "info" | "warning" | "critical";

export type FindingCategory =
  | "lease_nuance"
  | "cross_doc_mismatch"
  | "billing_anomaly"
  | "term_override";

export type TermOverrideSuggestion = {
  field_name: string;
  lease_id: string;
  current_value: string;
  suggested_value: string;
  reasoning: string;
  confidence: number;
  finding_id: string | null;
};

export type CrossDocFinding = {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  detail: string;
  affected_leases: string[];
  affected_pools: string[];
  /** Decimal string or null */
  financial_impact_estimate: string | null;
  source_documents: string[];
  override_suggestion: TermOverrideSuggestion | null;
};

export type CrossDocAnalysisResult = {
  property_id: string;
  period_year: number;
  findings: CrossDocFinding[];
  lease_term_overrides: TermOverrideSuggestion[];
  overall_risk_score: number;
  analysis_summary: string;
  documents_analyzed: Record<string, number>;
  token_usage: number;
};

export type AuditorContext = {
  market: string | null;
  typical_management_fee_pct: string | null;
  known_vendor_patterns: string[];
  custom_rules: string[];
};

export type PropertyAuditorOverrides = {
  known_exceptions: string[];
  special_instructions: string[];
  suppressed_finding_categories: FindingCategory[];
};

/** Row returned by GET /properties/:id/cross-doc-analysis/:year */
export type CrossDocAnalysisRow = {
  id: string;
  property_id: string;
  period_year: number;
  status: string;
  findings: Record<string, unknown>;
  finding_decisions: Record<string, Record<string, unknown>>;
  token_usage: number;
};

/** Persisted decision record written to finding_decisions JSONB */
export type FindingDecisionRecord = {
  decision: "accepted" | "dismissed" | "deferred";
  reason: string;
  user_id: string;
  decided_at: string;
};

export type LeaseContext = {
  lease_id: string;
  tenant_name: string;
  recovery_profile: Record<string, unknown>;
  pro_rata_share: string | null;
  base_year: number | null;
  term_start: string | null;
  term_end: string | null;
  verified_at: string | null;
};

export type GLPoolContext = {
  pool_name: string;
  pool_type: string;
  total_amount: string;
  account_count: number;
  top_vendors: string[];
  is_gross_up_applicable: boolean;
  sample_entries?: GLAccountSample[];
};

export type GLAccountSample = {
  account_code: string;
  account_description: string | null;
  amount: string;
  vendor_name: string | null;
  description: string | null;
};

export type CamStatementContext = {
  lease_id: string | null;
  tenant_name: string | null;
  pool_id: string | null;
  period_start: string;
  period_end: string;
  billed_amount: string;
};

export type DataAvailability = {
  has_verified_leases: boolean;
  has_gl_data: boolean;
  has_cam_statements: boolean;
  has_prior_year_data: boolean;
  lease_count: number;
  gl_account_count: number;
};

export type CrossDocAnalysisInput = {
  property_id: string;
  property_name: string;
  period_year: number;
  lease_contexts: LeaseContext[];
  gl_pool_contexts: GLPoolContext[];
  cam_statement_contexts?: CamStatementContext[];
  auditor_context: AuditorContext;
  property_overrides: PropertyAuditorOverrides;
  prior_year_totals: Record<string, string>;
  data_availability: DataAvailability;
  estimated_tokens: number;
};
