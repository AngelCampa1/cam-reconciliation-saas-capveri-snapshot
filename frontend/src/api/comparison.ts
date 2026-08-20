/**
 * System Comparison API client (Module B).
 *
 * Hand-authored client for the bidirectional comparison endpoints
 * (`/api/v1/comparison/*`). These endpoints post-date the last generated
 * client snapshot, and regenerating the whole client would migrate every
 * existing hook from the legacy external-client output to the modern bundled
 * output (a separate, repo-wide change). Until that migration happens, this
 * module mirrors the legacy generated SDK call convention exactly: each
 * function calls `(options.client ?? apiClient).get/post(...)` and returns the
 * `@hey-api/client-fetch` `{ data, error }` result.
 *
 * Money is exchanged as exact decimal STRINGS (the backend serializes Python
 * `Decimal` as a string to preserve full precision (never a float). The
 * frontend only DISPLAYS these values; it performs no money math. `variance_pct`
 * is a string or `null` (null when `capveri_correct` is zero).
 *
 * Signed convention (backend source of truth):
 *
 *     variance = actual_charged - capveri_correct
 *
 * - `variance > 0`, `abs(variance) > tolerance` => OVERCHARGE (billed too much).
 * - `variance < 0`, `abs(variance) > tolerance` => UNDERCHARGE (billed too little).
 * - `abs(variance) <= tolerance`                => MATCH (confirmed correct).
 */
import type { Client } from '@hey-api/client-fetch'
import { apiClient } from './client'

/** Direction of a deviation from CapVeri's correct amount. */
export type VarianceDirection = 'overcharge' | 'undercharge' | 'match'
export type MatchStatus = 'matched' | 'needs_review'

/** Where a stored comparison run's charged side came from. */
export type ComparisonSource = 'actual_billed' | 'explicit'

/** A single expense pool's signed deviation within one tenant. */
export interface PoolVariance {
  pool_id: string
  pool_name: string | null
  capveri_correct: string
  actual_charged: string
  variance: string
  direction: VarianceDirection
  abs_variance: string
  variance_pct: string | null
}

/** A single tenant's deviation between CapVeri-correct and actual-charged. */
export interface TenantVariance {
  lease_id: string
  tenant_name: string | null
  match_status: MatchStatus
  match_note: string | null
  capveri_correct: string
  actual_charged: string
  variance: string
  direction: VarianceDirection
  abs_variance: string
  variance_pct: string | null
  /**
   * Signed per-pool variances. `null` when the comparison ran without pool maps
   * (pool mode off); a list (possibly empty) when pool mode is on. Empty means
   * pool mode is on but this lease had no per-pool data.
   */
  pool_breakdowns: PoolVariance[] | null
}

/** Full bidirectional comparison for a property + period. */
export interface ComparisonResult {
  property_id: string
  period_start: string
  period_end: string
  tolerance: string
  tenants: TenantVariance[]
  total_capveri_correct: string
  total_actual_charged: string
  total_net_variance: string
  total_overcharge: string
  total_undercharge: string
  overcharge_count: number
  undercharge_count: number
  match_count: number
}

/** One charged amount supplied directly by the caller. */
export interface ExplicitCharge {
  /** Optional lease identifier used before tenant-name matching. */
  lease_id?: string | null
  /** Tenant display name used to match against a lease. */
  tenant_name?: string | null
  /** Optional expense pool id this charge is attributed to (enables per-pool). */
  pool_id?: string | null
  /** The charged amount, as an exact decimal string. Negatives are allowed. */
  amount: string
}

/** Request body for comparing against a caller-supplied charged set. */
export interface ExplicitChargesRequest {
  period_start: string
  period_end: string
  charges: ExplicitCharge[]
  /** Inclusive absolute MATCH threshold (decimal string). Defaults to "0.01". */
  tolerance?: string
  include_drafts?: boolean
  /** Index signature required by the hey-api client's body constraint. */
  [key: string]: unknown
}

/** Request body for persisting a comparison run. */
export interface PersistRunRequest {
  period_start: string
  period_end: string
  tolerance?: string
  include_drafts?: boolean
  /** Explicit charged set; omit to use the default actual_billed source. */
  charges?: ExplicitCharge[] | null
  /** Index signature required by the hey-api client's body constraint. */
  [key: string]: unknown
}

/** Header of a persisted comparison run, without per-tenant findings. */
export interface StoredComparisonRunSummary {
  id: string
  property_id: string
  period_start: string
  period_end: string
  tolerance: string
  source: ComparisonSource
  total_capveri_correct: string
  total_actual_charged: string
  total_net_variance: string
  total_overcharge: string
  total_undercharge: string
  overcharge_count: number
  undercharge_count: number
  match_count: number
  created_by: string | null
  created_at: string
}

/** A persisted comparison run plus its per-tenant findings. */
export interface StoredComparisonRun extends StoredComparisonRunSummary {
  findings: TenantVariance[]
}

/** Query params for the live (derive-on-read) comparison endpoints. */
export interface ComparisonQuery {
  period_start: string
  period_end: string
  tolerance?: string
  include_drafts?: boolean
  /** Index signature required by the hey-api client's query constraint. */
  [key: string]: unknown
}

interface BaseOptions {
  /** Override the client (defaults to the shared configured `apiClient`). */
  client?: Client
}

/**
 * Compare CapVeri-correct recovery against the DEFAULT charged source
 * (`actual_billed_amounts`) for a property + period.
 */
export function getComparison(
  options: BaseOptions & { propertyId: string; query: ComparisonQuery }
) {
  return (options.client ?? apiClient).get<ComparisonResult, unknown>({
    url: '/api/v1/comparison/{property_id}',
    path: { property_id: options.propertyId },
    query: options.query,
  })
}

/**
 * Compare CapVeri-correct recovery against an EXPLICIT caller-supplied charged
 * set (a manual entry or a parsed legacy reconciliation).
 */
export function compareExplicitCharges(
  options: BaseOptions & { propertyId: string; body: ExplicitChargesRequest }
) {
  return (options.client ?? apiClient).post<ComparisonResult, unknown>({
    url: '/api/v1/comparison/{property_id}',
    path: { property_id: options.propertyId },
    body: options.body,
  })
}

/**
 * Compute a comparison and PERSIST it as a point-in-time audit run.
 */
export function createComparisonRun(
  options: BaseOptions & { propertyId: string; body: PersistRunRequest }
) {
  return (options.client ?? apiClient).post<StoredComparisonRun, unknown>({
    url: '/api/v1/comparison/{property_id}/runs',
    path: { property_id: options.propertyId },
    body: options.body,
  })
}

/**
 * List persisted comparison runs for a property, newest first.
 */
export function listComparisonRuns(
  options: BaseOptions & {
    propertyId: string
    query?: { limit?: number; offset?: number }
  }
) {
  return (options.client ?? apiClient).get<
    StoredComparisonRunSummary[],
    unknown
  >({
    url: '/api/v1/comparison/{property_id}/runs',
    path: { property_id: options.propertyId },
    ...(options.query ? { query: options.query } : {}),
  })
}

/**
 * Fetch one persisted comparison run plus its findings.
 */
export function getComparisonRun(options: BaseOptions & { runId: string }) {
  return (options.client ?? apiClient).get<StoredComparisonRun, unknown>({
    url: '/api/v1/comparison/runs/{run_id}',
    path: { run_id: options.runId },
  })
}
