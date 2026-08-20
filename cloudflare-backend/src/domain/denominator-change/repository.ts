/**
 * Repository interface for denominator change analysis.
 *
 * All methods are org-scoped (explicit organization_id WHERE clause — no RLS
 * session). Mirrors the Supabase-SDK queries in
 * backend/app/services/analysis/denominator_change.py.
 */

export type SnapshotRow = {
  lease_id: string;
  total_recovery: string;
  period_start_date: string;
  period_end_date: string;
  lease_terms_snapshot: Record<string, unknown> | null;
};

export type PropertyRow = {
  id: string;
  name: string | null;
  total_rentable_sqft: string | null;
};

export type DenominatorChangeRepository = {
  /** Check whether the org has an active subscription/trial. */
  hasFullAccess(organizationId: string): Promise<boolean>;

  /**
   * Load finalized snapshots where period_start_date >= periodStart AND
   * period_end_date <= periodEnd (matches Python _load_period_snapshots).
   */
  listFinalizedSnapshotsInPeriod(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string; // ISO YYYY-MM-DD
    periodEnd: string;
  }): Promise<SnapshotRow[]>;

  /**
   * Load finalized snapshots with period_end_date < currentStart; the caller
   * selects the subset sharing the latest period_end_date (auto-detect prior).
   * Mirrors Python _auto_detect_prior_snapshots.
   */
  listFinalizedSnapshotsBefore(input: {
    propertyId: string;
    organizationId: string;
    beforeDate: string; // ISO YYYY-MM-DD — strict less-than
  }): Promise<SnapshotRow[]>;

  /**
   * Load property id, name, total_rentable_sqft — org-scoped.
   * Mirrors Python _load_property.
   */
  getProperty(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<PropertyRow | null>;
};
