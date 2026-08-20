import type { CampaignStatus } from "./transitions";

/** A row from reconciliation_campaigns joined with properties!inner(name). */
export type CampaignRow = {
  id: string;
  property_id: string;
  period_year: number;
  status: string;
  finalized_at: string | null;
  submitted_for_review_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  updated_at: string;
  property_name: string; // resolved from join
};

/** A row from reconciliation_snapshots used for aggregation. */
export type SnapshotRow = {
  id: string;
  property_id: string;
  period_start_date: string | null;
  status: string;
  total_recovery: string | null;
};

/** Payload for updating a campaign's status + audit fields. */
export type CampaignStatusUpdate = {
  id: string;
  organizationId: string;
  status: CampaignStatus;
  expectedStatus: CampaignStatus;
  /** Cleared on rejection (IN_REVIEW → FINALIZED). */
  clearSubmitFields?: boolean;
  /** Set when the transition has an audit timestamp. */
  timestampField?: string;
  /** Set when the transition has an audit user-id field. */
  userIdField?: string;
  userId?: string;
  now?: string;
};

export type CampaignRepository = {
  listCampaigns(
    organizationId: string,
    year: number | undefined,
  ): Promise<{ campaigns: CampaignRow[]; snapshots: SnapshotRow[] }>;

  /** Returns undefined when the campaign does not exist in the org. */
  findCampaign(
    id: string,
    organizationId: string,
  ): Promise<{ id: string; status: string } | undefined>;

  updateCampaignStatus(update: CampaignStatusUpdate): Promise<boolean>;
};
