/**
 * TypeScript interfaces for denominator change analysis.
 *
 * Mirrors backend models in app/models/denominator_change.py.
 */

export type DenominatorChangeType =
  | 'rsf_remeasurement'
  | 'tenant_added'
  | 'tenant_removed'
  | 'self_maintenance_start'
  | 'self_maintenance_stop'
  | 'exclusion_change'
  | 'boma_standard_change'
  | 'share_recalculation'

export interface DenominatorChange {
  change_type: DenominatorChangeType
  description: string
  prior_value: string
  current_value: string
  impact_description: string
}

export interface TenantShareImpact {
  lease_id: string
  tenant_name: string
  prior_pro_rata_share: number
  current_pro_rata_share: number
  share_delta_pct_points: number
  prior_estimated_recovery: number
  current_estimated_recovery: number
  recovery_delta: number
  contributing_changes: DenominatorChangeType[]
}

export interface DenominatorChangeReport {
  property_id: string
  property_name: string
  prior_period: string
  current_period: string
  prior_total_rsf: number
  current_total_rsf: number
  rsf_delta: number
  rsf_delta_percent: number
  changes: DenominatorChange[]
  tenant_impacts: TenantShareImpact[]
  summary: string
  generated_at: string
  /**
   * False when there is no finalized snapshot to compare against (a normal,
   * expected state --- not a failure). The backend returns HTTP 200 with an
   * otherwise-empty report so the panel can guide the user instead of relying
   * on a 4xx. Defaults to true for a real comparison.
   */
  comparison_available: boolean
  /**
   * Which period is missing its finalized snapshot when
   * `comparison_available` is false: 'current' (this year not finalized) or
   * 'prior' (last year not finalized). Null/absent for a real comparison.
   */
  missing_period?: 'current' | 'prior' | null
}

export interface DenominatorChangeRequest {
  property_id: string
  current_period_start: string
  current_period_end: string
  prior_period_start?: string
  prior_period_end?: string
  prior_total_rsf?: number
  current_total_rsf?: number
}

export interface DenominatorChangePdfRequest {
  property_id: string
  current_period_start: string
  current_period_end: string
  prior_period_start?: string
  prior_period_end?: string
  prior_total_rsf?: number
  current_total_rsf?: number
}
