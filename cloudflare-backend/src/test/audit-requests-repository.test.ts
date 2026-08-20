import { describe, expect, it } from "vitest";
import { PostgresAuditRequestsRepository } from "../adapters/db/audit-requests";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

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

const ROW = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Alice Owner",
  email: "alice@example.com",
  company: "Acme Properties",
  building_count: 4,
  phone: null,
  portfolio_sqft: null,
  current_system: null,
  message: null,
  source: "local",
  status: "pending",
  notes: null,
  estimated_recovery: null,
  assigned_to: null,
  organization_id: null,
  contacted_at: null,
  scheduled_at: null,
  completed_at: null,
  converted_at: null,
  created_at: "2026-06-19T00:00:00.000Z",
  updated_at: "2026-06-19T00:00:00.000Z",
};

describe("PostgresAuditRequestsRepository", () => {
  it("creates pending audit requests with referral code and parameterized insert", async () => {
    const executor = new QueueExecutor([[ROW]]);
    const repository = new PostgresAuditRequestsRepository(executor);

    const created = await repository.createAuditRequest({
      name: "Alice Owner",
      email: "alice@example.com",
      company: "Acme Properties",
      building_count: 4,
      phone: null,
      portfolio_sqft: null,
      current_system: null,
      message: null,
      source: "local",
      referral_code: "LOCAL-E2E",
      status: "pending",
    });

    expect(created?.email).toBe("alice@example.com");
    expect(executor.statements[0]?.sql).toContain("INSERT INTO audit_requests");
    expect(executor.statements[0]?.sql).toContain("referral_code");
    expect(executor.statements[0]?.params).toEqual([
      "Alice Owner",
      "alice@example.com",
      "Acme Properties",
      4,
      null,
      null,
      null,
      null,
      "local",
      "LOCAL-E2E",
      "pending",
    ]);
  });

  it("counts recent rows for route-level rate limiting", async () => {
    const executor = new QueueExecutor([[{ count: "3" }]]);
    const repository = new PostgresAuditRequestsRepository(executor);

    await expect(
      repository.countRecentByEmail(
        "alice@example.com",
        "2026-06-18T00:00:00.000Z",
      ),
    ).resolves.toBe(3);
    expect(executor.statements[0]?.sql).toContain("created_at >= $2");
    expect(executor.statements[0]?.params).toEqual([
      "alice@example.com",
      "2026-06-18T00:00:00.000Z",
    ]);
  });

  it("applies status filters and pagination to list queries", async () => {
    const executor = new QueueExecutor([[ROW]]);
    const repository = new PostgresAuditRequestsRepository(executor);

    await repository.listAuditRequests({
      statusFilter: "scheduled",
      limit: 10,
      offset: 20,
    });

    expect(executor.statements[0]?.sql).toContain("WHERE status = $1");
    expect(executor.statements[0]?.sql).toContain("LIMIT $2 OFFSET $3");
    expect(executor.statements[0]?.params).toEqual(["scheduled", 10, 20]);
  });

  it("sets status timestamps and assigned user through typed update fields", async () => {
    const assignedTo = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const executor = new QueueExecutor([
      [
        {
          ...ROW,
          status: "scheduled",
          scheduled_at: "2026-06-19T01:00:00.000Z",
          assigned_to: assignedTo,
        },
      ],
    ]);
    const repository = new PostgresAuditRequestsRepository(executor);

    const updated = await repository.updateAuditRequest(ROW.id, {
      status: "scheduled",
      scheduled_at: "2026-06-19T01:00:00.000Z",
      notes: "Booked",
      estimated_recovery: 12345,
      assigned_to: assignedTo,
    });

    expect(updated?.status).toBe("scheduled");
    expect(executor.statements[0]?.sql).toContain("scheduled_at = $2");
    expect(executor.statements[0]?.sql).toContain("assigned_to = $5::uuid");
    expect(executor.statements[0]?.params).toEqual([
      "scheduled",
      "2026-06-19T01:00:00.000Z",
      "Booked",
      12345,
      assignedTo,
      ROW.id,
    ]);
  });
});
