/**
 * Tax protest domain types and repository interface.
 *
 * Supports:
 *   GET  /api/v1/tax-protest/deadlines — per-property deadline list
 *   POST /api/v1/tax-protest/generate  — 4-file ZIP data package
 */

import type { GlPool } from "./gl-category-csv";

// ── Row shape (mirrors properties table columns used for deadline lookup) ──────

export type TaxProtestPropertyRow = {
  /** Property UUID as text */
  id: string;
  name: string;
  state: string | null;
  taxProtestCounty: string | null;
  /** YYYY-MM-DD override date, or null */
  taxProtestDeadlineOverride: string | null;
};

// ── County deadline entry (mirrors tax_protest_deadlines.json schema) ─────────

export type CountyDeadlineEntry = {
  state: string;
  county: string;
  deadline_month: number;
  deadline_day: number;
  notes: string;
};

// ── Generate-route types ──────────────────────────────────────────────────────

export type TaxProtestSnapshotRow = {
  id: string;
  organization_id: string;
  property_id: string;
  lease_id: string | null;
  status: string;
  total_recovery: string;
  total_operating_expenses: string;
  grossed_up_expenses: string;
  base_year_amount: string;
  tenant_share_before_cap: string;
  tenant_share_after_cap: string;
  admin_fee: string;
  period_start_date: string;
  period_end_date: string;
  calculation_trace: Array<{
    step_name: string;
    operation: string | null;
    output_value: unknown;
    output_unit: string | null;
    note: string | null;
  }>;
};

export type TaxProtestPropertyContext = {
  id: string;
  name: string;
  address: string;
  state: string | null;
  taxProtestCounty: string | null;
  taxProtestDeadlineOverride: string | null;
};

export type TaxProtestLeaseContext = {
  tenant_name: string;
};

export type TaxProtestOrgContext = {
  name: string;
};

export type TaxProtestPriorSnapshotRow = {
  id: string;
  total_recovery: string;
  period_start_date: string;
  period_end_date: string;
};

// ── Repository interface ──────────────────────────────────────────────────────

export interface TaxProtestRepository {
  /** Return all properties for the given org with tax protest columns. */
  listPropertiesForDeadlines(
    organizationId: string,
  ): Promise<TaxProtestPropertyRow[]>;

  /** Fetch a snapshot by id, scoped to org. Returns null if not found. */
  getSnapshotForGenerate(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<TaxProtestSnapshotRow | null>;

  /** Load lease, property, org context for a snapshot export. */
  loadExportContext(input: {
    leaseId: string | null;
    propertyId: string;
    organizationId: string;
  }): Promise<{
    lease: TaxProtestLeaseContext;
    property: TaxProtestPropertyContext;
    org: TaxProtestOrgContext;
  }>;

  /**
   * Fetch expense pools + GL entries for a property/year.
   * Returns pool detail dicts matching _fetch_pool_details() in FastAPI.
   */
  fetchPoolDetails(input: {
    propertyId: string;
    organizationId: string;
    year: number;
  }): Promise<GlPool[]>;

  /**
   * Fetch finalized snapshots for prior year (for variance comparison).
   * Mirrors _fetch_prior_snapshots() in FastAPI.
   */
  fetchPriorSnapshots(input: {
    propertyId: string;
    organizationId: string;
    year: number;
  }): Promise<TaxProtestPriorSnapshotRow[]>;

  /**
   * Check if org has tax_protest feature access.
   * Mirrors has_tax_protest_access(): active/trialing subscription required.
   */
  hasTaxProtestAccess(organizationId: string): Promise<boolean>;
}
