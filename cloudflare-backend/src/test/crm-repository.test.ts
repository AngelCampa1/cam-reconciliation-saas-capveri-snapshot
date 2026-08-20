import { describe, expect, it } from "vitest";
import { PostgresCrmRepository } from "../adapters/db/crm";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

class RecordingExecutor implements PostgresExecutor {
  readonly statements: RecordedStatement[] = [];

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push({ sql, params });
    return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

describe("PostgresCrmRepository", () => {
  it("upserts contact state and records an event in one transaction", async () => {
    const executor = new RecordingExecutor();
    const repository = new PostgresCrmRepository(executor);

    await repository.recordEvent({
      email: "Owner@Example.com",
      eventName: "email_unsubscribed",
      eventSource: "capveri-worker",
      lifecycleStage: "lead",
      nextStep: "do_not_email",
      emailSubscriptionStatus: "unsubscribed",
      occurredAt: "2026-06-25T00:00:00.000Z",
      metadata: { source: "capveri-unsubscribe-link" },
    });

    expect(executor.statements[0]?.sql).toContain(
      "insert into crm_contacts",
    );
    expect(executor.statements[0]?.sql).toContain(
      "when crm_contacts.email_subscription_status = 'unsubscribed'",
    );
    expect(executor.statements[0]?.sql).toContain(
      "then crm_contacts.email_subscription_status",
    );
    expect(executor.statements[1]?.sql).toContain("insert into crm_events");
    expect(executor.statements[1]?.params[6]).toBe(
      JSON.stringify({ source: "capveri-unsubscribe-link" }),
    );
  });
});
