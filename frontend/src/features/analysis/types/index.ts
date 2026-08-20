/**
 * Historical analysis types for year-over-year comparisons and trend analysis.
 */

import { VarianceLevel } from '../utils/variance'

export interface PoolComparison {
  pool_name: string
  amounts: Record<number, number | null>
  base_year_amount: number | null
  variance_amount: number | null
  variance_percent: number | null
  variance_level: VarianceLevel
  matched_from: string | null
}

export interface YearOverYearComparison {
  property_id: string
  property_name: string
  years: number[]
  base_year: number
  pool_comparisons: PoolComparison[]
  total_amounts: Record<number, number>
  total_variance_amount: number | null
  total_variance_percent: number | null
}

export interface YearOverYearRequest {
  property_id: string
  years: number[]
  use_fuzzy_matching: boolean
}

// Trend Analysis Types

export type AnomalySeverity = 'info' | 'warning' | 'critical'

export type AnomalyType =
  | 'spike'
  | 'drop'
  | 'new_category'
  | 'missing_category'
  | 'pattern_break'
  | 'outlier'

export interface DetectedAnomaly {
  pool_name: string
  anomaly_type: AnomalyType
  severity: AnomalySeverity
  current_value: number
  expected_value: number
  variance_percent: number
  explanation: string
  years_affected: number[]
}

export interface TrendDataPoint {
  year: number
  value: number
  pool_name?: string
}

export interface AnomalyDetectionRequest {
  property_id: string
  target_year: number
  comparison_years: number[]
}

export interface AnomalyDetectionResult {
  property_id: string
  target_year: number
  anomalies: DetectedAnomaly[]
  total_anomalies: number
  critical_count: number
  warning_count: number
  info_count: number
}

// Historical Analysis Report Types

export interface PropertySummary {
  id: string
  name: string
  address?: string
}

export interface ExecutiveSummary {
  total_expense_change: number
  significant_anomalies: number
  key_findings: string[]
}

export interface CategoryComparison {
  name: string
  years: number[]
  amounts: number[]
  variance_percent: number
}

export interface YearTotals {
  year: number
  total: number
}

export interface TrendAnalysisSummary {
  chart_image_url: string | null
  trend_direction: 'increasing' | 'decreasing' | 'stable'
  avg_annual_change: number
}

export interface HistoricalAnalysisReport {
  property: PropertySummary
  analysis_date: string
  years_compared: number[]
  executive_summary: ExecutiveSummary
  year_over_year_comparison: {
    categories: CategoryComparison[]
    totals: YearTotals[]
  }
  trend_analysis: TrendAnalysisSummary
  anomalies: DetectedAnomaly[]
  recommendations: string[]
}

export interface ReportRequest {
  property_id: string
  years: number[]
  include_charts: boolean
}

export interface ReportResponse {
  report_url: string
  expires_at: string
}
