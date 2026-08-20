import type {
  PortfolioBilledRecord,
  PortfolioDataset,
  PortfolioPropertyRecord,
  PortfolioRepository,
  PortfolioSnapshotRecord,
} from "../../domain/portfolio/repository";
import type { PostgresExecutor } from "./postgres";

export class PostgresPortfolioRepository implements PortfolioRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async loadPortfolioDataset(
    organizationId: string,
  ): Promise<PortfolioDataset> {
    const propertiesResult = await this.executor.query<PortfolioPropertyRecord>(
      [
        "select id, name",
        "from properties",
        "where organization_id = $1",
        "order by name, id",
      ].join(" "),
      [organizationId],
    );
    const propertyIds = propertiesResult.rows.map((property) => property.id);

    if (propertyIds.length === 0) {
      return { properties: [], finalizedSnapshots: [], billedRows: [] };
    }

    const [snapshotsResult, billedResult] = await Promise.all([
      this.executor.query<PortfolioSnapshotRecord>(
        [
          "select property_id, total_recovery::text as total_recovery,",
          "period_start_date::text as period_start_date",
          "from reconciliation_snapshots",
          "where organization_id = $1",
          "and property_id = any($2::uuid[])",
          "and status = 'finalized'",
        ].join(" "),
        [organizationId, propertyIds],
      ),
      this.executor.query<PortfolioBilledRecord>(
        [
          "select property_id, billed_amount::text as billed_amount,",
          "period_start_date::text as period_start_date",
          "from actual_billed_amounts",
          "where organization_id = $1",
          "and property_id = any($2::uuid[])",
        ].join(" "),
        [organizationId, propertyIds],
      ),
    ]);

    return {
      properties: propertiesResult.rows,
      finalizedSnapshots: snapshotsResult.rows,
      billedRows: billedResult.rows,
    };
  }
}
