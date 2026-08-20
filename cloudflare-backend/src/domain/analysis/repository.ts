export type VarianceLevel = "normal" | "warning" | "critical";

export type PoolComparison = {
  pool_name: string;
  amounts: Record<string, string | null>;
  base_year_amount: string | null;
  variance_amount: string | null;
  variance_percent: string | null;
  variance_level: VarianceLevel;
  matched_from: string | null;
};

export type YearOverYearComparison = {
  property_id: string;
  property_name: string;
  years: number[];
  base_year: number;
  pool_comparisons: PoolComparison[];
  total_amounts: Record<string, string>;
  total_variance_amount: string | null;
  total_variance_percent: string | null;
};

export type YearOverYearRequest = {
  property_id: string;
  years: number[];
  use_fuzzy_matching: boolean;
};

export type AnomalySeverity = "info" | "warning" | "critical";

export type AnomalyType =
  | "spike"
  | "drop"
  | "new_category"
  | "missing_category"
  | "pattern_break"
  | "outlier";

export type DetectedAnomaly = {
  pool_name: string;
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  current_value: string;
  expected_value: string;
  variance_percent: string;
  explanation: string;
  years_affected: number[];
};

export type AnomalyDetectionRequest = {
  property_id: string;
  target_year: number;
  comparison_years: number[];
};

export type AnomalyDetectionResponse = {
  property_id: string;
  target_year: number;
  anomalies: DetectedAnomaly[];
  total_anomalies: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
};

export type ExpensePool = {
  id: string;
  name: string;
};

export type PoolMapping = {
  expense_pool_id: string;
  gl_account_pattern: string;
  allocation_percentage: string;
};

export type GlEntry = {
  account_code: string;
  account_description: string | null;
  amount: string;
  vendor_name: string | null;
  description: string | null;
  transaction_date: string | null;
};

export type GlAnalysisResult = {
  id: string;
  organization_id: string;
  property_id: string;
  period_year: number;
  analysis_markdown: string;
  token_input: number;
  token_output: number;
  ran_at: string;
  ran_by_user_id: string;
  dismissed_at: string | null;
  dismissed_by_user_id: string | null;
  created_at: string;
};

export type AnalysisRepository = {
  hasFullAccess(organizationId: string): Promise<boolean>;
  getPropertyName(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<string | null>;
  listAvailableYears(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<number[]>;
  listFinalizedSnapshotYears(input: {
    propertyId: string;
    years: number[];
    organizationId: string;
  }): Promise<number[]>;
  listExpensePools(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<ExpensePool[]>;
  listPoolMappings(input: {
    poolIds: string[];
    organizationId: string;
  }): Promise<PoolMapping[]>;
  listGlEntries(input: {
    propertyId: string;
    year: number;
    organizationId: string;
  }): Promise<GlEntry[]>;
  recordFeatureUse(input: {
    organizationId: string;
    featureKey: string;
  }): Promise<void>;
  listExpensePoolsWithType(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<Array<{ name: string; type: string }>>;
  insertGlAnalysisResult(input: {
    organizationId: string;
    propertyId: string;
    periodYear: number;
    analysisMarkdown: string;
    tokenInput: number;
    tokenOutput: number;
    ranAt: string;
    ranByUserId: string;
  }): Promise<GlAnalysisResult>;
  getLatestGlAnalysis(input: {
    organizationId: string;
    propertyId: string;
    periodYear: number;
  }): Promise<GlAnalysisResult | null>;
  dismissGlAnalysis(input: {
    organizationId: string;
    analysisId: string;
    dismissedAt: string;
    dismissedByUserId: string;
  }): Promise<GlAnalysisResult>;
};
