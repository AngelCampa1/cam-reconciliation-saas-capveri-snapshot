import { describe, expect, it } from "vitest";
import { PostgresAuthLifecycleRepository } from "../adapters/db/auth-lifecycle";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";
import { TERMS_HASH, TERMS_VERSION } from "../domain/legal/terms";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

class QueueExecutor implements PostgresExecutor {
  readonly statements: RecordedStatement[] = [];

  constructor(private readonly responses: unknown[][] = []) {}

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

describe("PostgresAuthLifecycleRepository", () => {
  it("records legal acceptance with current terms constants", async () => {
    const executor = new QueueExecutor();
    const repository = new PostgresAuthLifecycleRepository(executor);

    await repository.recordLegalAcceptance({
      userId: USER_ID,
      organizationId: ORG_ID,
      acceptedAt: "2026-06-13T00:00:00.000Z",
      source: "authenticated_legal_gate",
      ipAddress: "203.0.113.10",
      userAgent: "vitest",
    });

    expect(executor.statements[0]?.sql).toContain(
      "insert into legal_acceptances",
    );
    expect(executor.statements[0]?.params).toEqual([
      USER_ID,
      ORG_ID,
      "terms_of_service",
      TERMS_VERSION,
      TERMS_HASH,
      "2026-06-13T00:00:00.000Z",
      "203.0.113.10",
      "vitest",
      "authenticated_legal_gate",
    ]);
  });

  it("upserts signup nurture rows idempotently", async () => {
    const executor = new QueueExecutor();
    const repository = new PostgresAuthLifecycleRepository(executor);

    await repository.upsertSignupNurtureEvents([
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        email: "owner@example.com",
        organizationName: "Ventora Labs",
        emailType: "day_1_confirm_plan",
        status: "pending",
        scheduledAt: "2026-06-14T00:00:00.000Z",
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        email: "owner@example.com",
        organizationName: "Ventora Labs",
        emailType: "day_3_upload_gl",
        status: "pending",
        scheduledAt: "2026-06-16T00:00:00.000Z",
      },
    ]);

    expect(executor.statements[0]?.sql).toContain(
      "insert into signup_email_events",
    );
    expect(executor.statements[0]?.sql).toContain(
      "on conflict (user_id, email_type) do nothing",
    );
    expect(executor.statements[0]?.params).toHaveLength(14);
  });

  it("counts deletion blockers only for the static allowlist", async () => {
    const executor = new QueueExecutor([[{ count: "2" }]]);
    const repository = new PostgresAuthLifecycleRepository(executor);

    await expect(
      repository.countRows({
        tableName: "documents",
        columnName: "verified_by",
        value: USER_ID,
      }),
    ).resolves.toBe(2);
    expect(executor.statements[0]?.sql).toBe(
      "select count(*)::text as count from documents where verified_by = $1 limit 1",
    );

    await expect(
      repository.countRows({
        tableName: "users; drop table users",
        columnName: "id",
        value: USER_ID,
      }),
    ).rejects.toThrow("Unsupported account deletion blocker");
  });

  it("counts organization users and other admins", async () => {
    const executor = new QueueExecutor([[{ count: "3" }], [{ count: "1" }]]);
    const repository = new PostgresAuthLifecycleRepository(executor);

    await expect(repository.countOrganizationUsers(ORG_ID)).resolves.toBe(3);
    await expect(
      repository.countOtherOrganizationAdmins({
        organizationId: ORG_ID,
        userId: USER_ID,
      }),
    ).resolves.toBe(1);

    expect(executor.statements[0]?.sql).toContain(
      "from users where organization_id = $1",
    );
    expect(executor.statements[1]?.params).toEqual([
      ORG_ID,
      ["owner", "admin"],
      USER_ID,
    ]);
  });
});
