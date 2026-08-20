import { describe, expect, it } from "vitest";
import { PostgresSb1103Repository } from "../adapters/db/sb1103";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";
import { Sb1103StatusConflictError } from "../domain/sb1103/repository";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const LEASE_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";

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

describe("PostgresSb1103Repository", () => {
  it("grants full access for active subscriptions without database helper functions", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "active",
          billingModel: "subscription",
          stripeSubscriptionId: "sub_123",
          currentPeriodEnd: null,
        },
      ],
    ]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[0]?.sql).toContain("from subscriptions");
    expect(executor.statements[0]?.sql).not.toContain("has_full_access");
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
  });

  it("falls back to purchased credits when subscription access is credit-pack based", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "active",
          billingModel: "credit_pack",
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
        },
      ],
      [{ exists: true }],
    ]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[1]?.sql).toContain("from audit_credits");
    expect(executor.statements[1]?.params).toEqual([ORG_ID]);
  });

  it("rejects expired local trials", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "trialing",
          billingModel: "subscription",
          stripeSubscriptionId: null,
          currentPeriodEnd: "2000-01-01T00:00:00.000Z",
        },
      ],
    ]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(false);
  });

  it("loads leases through property organization ownership", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: LEASE_ID,
          property_id: PROPERTY_ID,
          tenant_name: "Test Tenant 101",
        },
      ],
    ]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(repository.getLeaseById(ORG_ID, LEASE_ID)).resolves.toEqual({
      id: LEASE_ID,
      property_id: PROPERTY_ID,
      tenant_name: "Test Tenant 101",
    });
    expect(executor.statements[0]?.sql).toContain(
      "join properties on properties.id = leases.property_id",
    );
    expect(executor.statements[0]?.sql).toContain(
      "and properties.organization_id = $2",
    );
    expect(executor.statements[0]?.params).toEqual([LEASE_ID, ORG_ID]);
  });

  it("loads tenant names through property organization ownership", async () => {
    const executor = new QueueExecutor([
      [{ id: LEASE_ID, tenant_name: "Test Tenant 101" }],
    ]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(
      repository.getTenantNamesByLease(ORG_ID, [LEASE_ID]),
    ).resolves.toEqual(new Map([[LEASE_ID, "Test Tenant 101"]]));
    expect(executor.statements[0]?.sql).toContain(
      "join properties on properties.id = leases.property_id",
    );
    expect(executor.statements[0]?.sql).toContain(
      "where properties.organization_id = $1",
    );
    expect(executor.statements[0]?.params).toEqual([ORG_ID, LEASE_ID]);
  });

  it("loads export lease data through property organization ownership", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: LEASE_ID,
          property_id: PROPERTY_ID,
          tenant_name: "Test Tenant 101",
          recovery_profile: { pro_rata_share: "0.0485" },
        },
      ],
    ]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(repository.getLeaseForExport(ORG_ID, LEASE_ID)).resolves.toEqual(
      {
        id: LEASE_ID,
        property_id: PROPERTY_ID,
        tenant_name: "Test Tenant 101",
        recovery_profile: { pro_rata_share: "0.0485" },
      },
    );
    expect(executor.statements[0]?.sql).toContain(
      "join properties on properties.id = leases.property_id",
    );
    expect(executor.statements[0]?.sql).toContain(
      "and properties.organization_id = $2",
    );
    expect(executor.statements[0]?.params).toEqual([LEASE_ID, ORG_ID]);
  });

  it("loads GL export rows through property organization ownership", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: "55555555-5555-4555-8555-555555555555",
          account_code: "5100.10",
          account_description: "Repairs",
          amount: "125.00",
          transaction_date: "2025-01-15",
          vendor_name: "Vendor",
          description: "Repair invoice",
          import_batch_id: "66666666-6666-4666-8666-666666666666",
        },
      ],
    ]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(
      repository.getGlEntriesForWindow(
        ORG_ID,
        PROPERTY_ID,
        "2025-01-01",
        "2025-01-31",
      ),
    ).resolves.toHaveLength(1);
    expect(executor.statements[0]?.sql).toContain(
      "join properties on properties.id = gl_entries.property_id",
    );
    expect(executor.statements[0]?.sql).toContain(
      "and properties.organization_id = $2",
    );
    expect(executor.statements[0]?.params).toEqual([
      PROPERTY_ID,
      ORG_ID,
      "2025-01-01",
      "2025-01-31",
    ]);
  });

  it("marks requests exported without regressing delivered requests", async () => {
    const executor = new QueueExecutor([[{ id: REQUEST_ID }]]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(
      repository.markExported({
        orgId: ORG_ID,
        id: REQUEST_ID,
        format: "pdf",
        exportedAt: "2026-06-30T00:00:00.000Z",
      }),
    ).resolves.toBe(true);

    expect(executor.statements[0]?.sql).toContain("set status = 'exported'");
    expect(executor.statements[0]?.sql).toContain("and organization_id = $4");
    expect(executor.statements[0]?.sql).toContain("and status != 'delivered'");
    expect(executor.statements[0]?.sql).toContain("returning id");
    expect(executor.statements[0]?.params).toEqual([
      "pdf",
      "2026-06-30T00:00:00.000Z",
      REQUEST_ID,
      ORG_ID,
    ]);
  });

  it("reports no export mark when the delivered-status guard does not match", async () => {
    const executor = new QueueExecutor([[]]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(
      repository.markExported({
        orgId: ORG_ID,
        id: REQUEST_ID,
        format: "excel",
        exportedAt: "2026-06-30T00:00:00.000Z",
      }),
    ).resolves.toBe(false);
  });

  it("does not report conflict when a guarded manual update misses a non-delivered request", async () => {
    const executor = new QueueExecutor([[], [{ status: "pending" }]]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(
      repository.updateRequest(ORG_ID, REQUEST_ID, { status: "pending" }),
    ).resolves.toBeNull();

    expect(executor.statements[0]?.sql).toContain("status = $1::text");
    expect(executor.statements[0]?.sql).toContain("status != 'delivered'");
    expect(executor.statements[0]?.sql).toContain("returning *");
    expect(executor.statements[0]?.params).toEqual([
      "pending",
      REQUEST_ID,
      ORG_ID,
    ]);
    expect(executor.statements[1]?.sql).toContain(
      "select status from sb1103_requests",
    );
    expect(executor.statements[1]?.params).toEqual([REQUEST_ID, ORG_ID]);
  });

  it("reports status conflict when a guarded manual update finds a delivered request", async () => {
    const executor = new QueueExecutor([[], [{ status: "delivered" }]]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(
      repository.updateRequest(ORG_ID, REQUEST_ID, { status: "overdue" }),
    ).rejects.toBeInstanceOf(Sb1103StatusConflictError);
  });

  it("normalizes Postgres date columns to date-only API strings", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: REQUEST_ID,
          organization_id: ORG_ID,
          property_id: PROPERTY_ID,
          lease_id: LEASE_ID,
          requested_by_name: "Jane Smith",
          requested_by_email: "jane.smith@example.com",
          request_date: new Date("2025-01-15T00:00:00.000Z"),
          response_deadline: new Date("2025-02-14T00:00:00.000Z"),
          window_start_date: new Date("2023-07-15T00:00:00.000Z"),
          window_end_date: new Date("2025-01-15T00:00:00.000Z"),
          status: "pending",
          export_format: null,
          exported_at: null,
          notes: null,
          created_at: new Date("2025-01-15T12:00:00.000Z"),
          updated_at: new Date("2025-01-15T12:00:00.000Z"),
        },
      ],
    ]);
    const repository = new PostgresSb1103Repository(executor);

    await expect(repository.getRequestById(ORG_ID, REQUEST_ID)).resolves.toMatchObject({
      request_date: "2025-01-15",
      response_deadline: "2025-02-14",
      window_start_date: "2023-07-15",
      window_end_date: "2025-01-15",
      created_at: "2025-01-15T12:00:00.000Z",
      updated_at: "2025-01-15T12:00:00.000Z",
    });
  });
});
