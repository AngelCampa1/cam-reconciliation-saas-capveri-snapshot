import { describe, expect, it } from "vitest";
import { PostgresTenantPortalRepository } from "../adapters/db/tenant-portal";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_USER_ID = "22222222-2222-4222-8222-222222222222";
const LEASE_ID = "33333333-3333-4333-8333-333333333333";
const SNAPSHOT_ID = "44444444-4444-4444-8444-444444444444";
const NOTIFICATION_ID = "55555555-5555-4555-8555-555555555555";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

class QueueExecutor implements PostgresExecutor {
  readonly statements: RecordedStatement[] = [];

  constructor(private readonly responses: unknown[][]) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push({ sql, params });
    const rows = this.responses.shift() ?? [];
    return { rows: rows as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

describe("PostgresTenantPortalRepository", () => {
  it("builds tenant dashboard from linked leases, finalized statements, and unread count", async () => {
    const executor = new QueueExecutor([
      [{ lease_id: LEASE_ID }],
      [
        {
          id: LEASE_ID,
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          recovery_profile: { pro_rata_share: "0.125", base_year: 2025 },
          property_id: "66666666-6666-4666-8666-666666666666",
          property_name: "Market Plaza",
          address_line1: "100 Main St",
          city: "Dallas",
          state: "TX",
          postal_code: "75201",
          unit_id: "77777777-7777-4777-8777-777777777777",
          unit_number: "101",
          rentable_sqft: "2500",
        },
      ],
      [
        {
          id: SNAPSHOT_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          tenant_share: "1234.56",
          snapshot_status: "finalized",
          created_at: "2026-06-13T00:00:00Z",
          property_id: "66666666-6666-4666-8666-666666666666",
          property_name: "Market Plaza",
        },
      ],
      [{ count: "2" }],
      [{ statement_id: SNAPSHOT_ID }],
    ]);
    const repository = new PostgresTenantPortalRepository(executor);

    await expect(
      repository.getDashboard({
        tenantUserId: TENANT_USER_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toMatchObject({
      leases: [
        {
          pro_rata_share: "0.125",
          property: { address: "100 Main St, Dallas, TX 75201" },
        },
      ],
      statements: [{ id: SNAPSHOT_ID, status: "disputed" }],
      unread_notifications: 2,
    });
    expect(executor.statements[1]?.sql).toContain(
      "and properties.organization_id = $2",
    );
    expect(executor.statements[2]?.sql).toContain("status = 'finalized'");
    expect(executor.statements[2]?.sql).toContain(
      "and reconciliation_snapshots.organization_id = $2",
    );
    expect(executor.statements[2]?.params).toEqual([[LEASE_ID], ORG_ID]);
    expect(executor.statements[4]?.sql).toContain(
      "status::text = any($2::text[])",
    );
  });

  it("lists and marks tenant-scoped notifications", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: NOTIFICATION_ID,
          tenant_user_id: TENANT_USER_ID,
          notification_type: "new_statement",
          title: "Statement ready",
          message: "Your statement is ready.",
          link_url: "/tenant/dashboard",
          related_entity_id: null,
          read_at: null,
          created_at: "2026-06-13T00:00:00Z",
        },
      ],
      [{ id: NOTIFICATION_ID }],
      [{ id: NOTIFICATION_ID }],
    ]);
    const repository = new PostgresTenantPortalRepository(executor);

    await repository.listNotifications({
      tenantUserId: TENANT_USER_ID,
      unreadOnly: true,
      skip: 0,
      limit: 20,
    });
    await repository.markNotificationRead({
      tenantUserId: TENANT_USER_ID,
      notificationId: NOTIFICATION_ID,
      readAt: "2026-06-13T00:00:00Z",
    });
    await expect(
      repository.markAllNotificationsRead({
        tenantUserId: TENANT_USER_ID,
        readAt: "2026-06-13T00:00:00Z",
      }),
    ).resolves.toBe(1);

    expect(executor.statements[0]?.sql).toContain("read_at is null");
    expect(executor.statements[1]?.sql).toContain("and tenant_user_id = $2");
    expect(executor.statements[1]?.sql).toContain("and read_at is null");
    expect(executor.statements[2]?.sql).toContain("and read_at is null");
  });

  it("returns default preferences and upserts preference updates", async () => {
    const executor = new QueueExecutor([
      [],
      [],
      [
        {
          tenant_user_id: TENANT_USER_ID,
          new_statement_emails: true,
          dispute_update_emails: true,
          reminder_emails: true,
          marketing_emails: true,
          updated_at: "2026-06-13T00:00:00Z",
        },
      ],
    ]);
    const repository = new PostgresTenantPortalRepository(executor);

    await expect(
      repository.getEmailPreferences({
        tenantUserId: TENANT_USER_ID,
        timestamp: "2026-06-13T00:00:00Z",
      }),
    ).resolves.toMatchObject({
      new_statement_emails: true,
      marketing_emails: false,
    });
    await expect(
      repository.updateEmailPreferences({
        tenantUserId: TENANT_USER_ID,
        patch: { marketing_emails: true },
        updatedAt: "2026-06-13T00:00:00Z",
      }),
    ).resolves.toMatchObject({ marketing_emails: true });

    expect(executor.statements[2]?.sql).toContain(
      "on conflict (tenant_user_id) do update",
    );
  });
});
