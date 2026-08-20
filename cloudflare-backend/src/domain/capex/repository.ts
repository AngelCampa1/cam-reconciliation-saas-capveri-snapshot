/**
 * CapEx repository interface — DB operations for capex_flags and gl_entries.
 */
import type { Disposition } from "./classifier";

export type CapExFlagRow = {
  id: string;
  organization_id: string;
  gl_entry_id: string;
  property_id: string;
  period_year: number;
  flag_reason: string;
  rule_name: string;
  confidence_score: string; // decimal string
  matched_pattern: string | null;
  disposition: Disposition;
  reviewed_at: string | null; // ISO string
  reviewed_by_user_id: string | null;
  review_note: string | null;
  classifier_version: string;
  created_at: string; // ISO string
  // joined fields (present on "with entry" variant)
  account_code?: string;
  account_description?: string | null;
  vendor_name?: string | null;
  amount?: string;
  description?: string | null;
  transaction_date?: string;
};

export type UpsertFlagInput = {
  organization_id: string;
  gl_entry_id: string;
  property_id: string;
  period_year: number;
  flag_reason: string;
  rule_name: string;
  confidence_score: string;
  matched_pattern: string | null;
  disposition: "pending";
  classifier_version: string;
};

export type ReviewFlagInput = {
  flagId: string;
  organizationId: string;
  disposition: "confirmed_capex" | "dismissed";
  reviewedAt: string;
  reviewedByUserId: string;
  reviewNote: string | null;
};

export type ReviewFlagsInput = Omit<ReviewFlagInput, "flagId"> & {
  flagIds: string[];
};

export type ReviewFlagsResult =
  | { status: "reviewed"; flags: CapExFlagRow[] }
  | { status: "not_found"; missingFlagIds: string[] };

export type GlEntryAmountRow = {
  id: string;
  amount: string;
};

export type CapExRepository = {
  /** Fetch all GL entries for a property/year (scoped to org via join). */
  listGlEntries(input: {
    propertyId: string;
    periodYear: number;
    organizationId: string;
  }): Promise<
    Array<{
      id: string;
      amount: string;
      account_code: string | null;
      account_description: string | null;
      vendor_name: string | null;
      description: string | null;
      transaction_date: string;
    }>
  >;

  /** Upsert CapEx flags (on_conflict gl_entry_id, rule_name). */
  upsertFlags(flags: UpsertFlagInput[]): Promise<void>;

  /** List flags for property/year, optionally filtered by disposition. */
  listFlags(input: {
    propertyId: string;
    periodYear: number;
    organizationId: string;
    disposition?: Disposition | null;
  }): Promise<CapExFlagRow[]>;

  /** Update a single flag's disposition. Returns null if not found / wrong org. */
  reviewFlag(input: ReviewFlagInput): Promise<CapExFlagRow | null>;

  /** Atomically update several flags' disposition. Returns not_found without changes if any flag is missing. */
  reviewFlags(input: ReviewFlagsInput): Promise<ReviewFlagsResult>;

  /** Check if a set of flag IDs all belong to the org. Returns IDs that exist. */
  findFlagIds(input: {
    flagIds: string[];
    organizationId: string;
  }): Promise<string[]>;

  /** Fetch GL entry amounts by IDs (for summary total). */
  listGlEntryAmounts(input: {
    entryIds: string[];
    organizationId: string;
  }): Promise<GlEntryAmountRow[]>;

  /** Full-access billing check. */
  hasFullAccess(organizationId: string): Promise<boolean>;
};
