import type {
  CampaignRepository,
  CampaignRow,
  CampaignStatusUpdate,
  SnapshotRow,
} from "../../domain/campaigns/repository";
import type { PostgresExecutor } from "./postgres";

/**
 * PostgreSQL implementation of CampaignRepository.
 *
 * All queries include an explicit organization_id WHERE clause for defence
 * in depth (RLS is the primary guard; the explicit filter prevents cross-org
 * data leakage in the event of a policy misconfiguration).
 */
export class PostgresCampaignRepository implements CampaignRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async listCampaigns(
    organizationId: string,
    year: number | undefined,
  ): Promise<{ campaigns: CampaignRow[]; snapshots: SnapshotRow[] }> {
    // Query 1 — campaigns with joined property name (mirrors campaigns.py:119-129)
    const campaignSql = [
      "select rc.id, rc.property_id, rc.period_year, rc.status,",
      "  rc.finalized_at::text as finalized_at,",
      "  rc.submitted_for_review_at::text as submitted_for_review_at,",
      "  rc.approved_at::text as approved_at,",
      "  rc.sent_at::text as sent_at,",
      "  rc.updated_at::text as updated_at,",
      "  p.name as property_name",
      "from reconciliation_campaigns rc",
      "inner join properties p on p.id = rc.property_id",
      "where rc.organization_id = $1",
      year !== undefined ? "and rc.period_year = $2" : "",
      "order by rc.updated_at desc",
    ]
      .filter(Boolean)
      .join(" ");

    const campaignParams: unknown[] =
      year !== undefined ? [organizationId, year] : [organizationId];

    const campaignResult = await this.executor.query<
      Omit<CampaignRow, "property_name"> & { property_name: string }
    >(campaignSql, campaignParams);

    const campaigns: CampaignRow[] = campaignResult.rows;

    if (campaigns.length === 0) {
      return { campaigns: [], snapshots: [] };
    }

    // Collect distinct property IDs for snapshot batch-fetch (campaigns.py:136-137)
    const propertyIds = [...new Set(campaigns.map((r) => r.property_id))];

    // Query 2 — reconciliation_snapshots for those properties (campaigns.py:138-143)
    const snapshotResult = await this.executor.query<SnapshotRow>(
      [
        "select id, property_id,",
        "  period_start_date::text as period_start_date,",
        "  status,",
        "  total_recovery::text as total_recovery",
        "from reconciliation_snapshots",
        "where organization_id = $1",
        "and property_id = any($2::uuid[])",
      ].join(" "),
      [organizationId, propertyIds],
    );

    return { campaigns, snapshots: snapshotResult.rows };
  }

  async findCampaign(
    id: string,
    organizationId: string,
  ): Promise<{ id: string; status: string } | undefined> {
    const result = await this.executor.query<{ id: string; status: string }>(
      [
        "select id, status",
        "from reconciliation_campaigns",
        "where id = $1 and organization_id = $2",
      ].join(" "),
      [id, organizationId],
    );

    return result.rows[0];
  }

  async updateCampaignStatus(update: CampaignStatusUpdate): Promise<boolean> {
    // Build SET clause dynamically (mirrors _apply_transition in campaigns.py:74-92)
    const sets: string[] = ["status = $3"];
    const params: unknown[] = [update.id, update.organizationId, update.status];

    let paramIdx = 4;

    if (update.clearSubmitFields) {
      // Rejection: IN_REVIEW → FINALIZED clears submission audit fields (campaigns.py:79-83)
      sets.push(
        `submitted_for_review_at = null`,
        `submitted_for_review_by_user_id = null`,
      );
    } else if (update.timestampField && update.userIdField) {
      sets.push(
        `${update.timestampField} = $${paramIdx}`,
        `${update.userIdField} = $${paramIdx + 1}`,
      );
      params.push(update.now, update.userId);
      paramIdx += 2;
    }

    const result = await this.executor.query<{ id: string }>(
      [
        `update reconciliation_campaigns`,
        `set ${sets.join(", ")}`,
        `where id = $1 and organization_id = $2 and status = $${paramIdx}`,
        `returning id::text as id`,
      ].join(" "),
      [...params, update.expectedStatus],
    );
    return result.rows.length > 0;
  }
}
