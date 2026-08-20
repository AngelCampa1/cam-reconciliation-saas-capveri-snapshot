import { describe, expect, it } from "vitest";
import { PostgresFeedbackRepository } from "../adapters/db/feedback";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const feedbackId = "33333333-3333-4333-8333-333333333333";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

type ExecutorHandler = (
  sql: string,
  params: readonly unknown[],
) => QueryResult<unknown>;

function createExecutor(handler: ExecutorHandler): {
  executor: PostgresExecutor;
  statements: RecordedStatement[];
} {
  const statements: RecordedStatement[] = [];
  const executor: PostgresExecutor = {
    async query<Row>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
      statements.push({ sql, params });

      return handler(sql, params) as QueryResult<Row>;
    },
    async transaction<Result>(
      operation: (transactionExecutor: PostgresExecutor) => Promise<Result>,
    ): Promise<Result> {
      statements.push({ sql: "begin", params: [] });

      try {
        const result = await operation(executor);
        statements.push({ sql: "commit", params: [] });

        return result;
      } catch (error) {
        statements.push({ sql: "rollback", params: [] });
        throw error;
      }
    },
  };

  return { executor, statements };
}

describe("PostgresFeedbackRepository", () => {
  it("counts recent feedback submissions by user", async () => {
    const { executor, statements } = createExecutor(() => ({
      rows: [{ count: "3" }],
    }));
    const repository = new PostgresFeedbackRepository(executor);

    await expect(
      repository.countRecentForUser({
        userId,
        sinceIso: "2026-06-13T00:00:00.000Z",
      }),
    ).resolves.toBe(3);

    expect(statements[0]).toEqual({
      sql: [
        "select count(*) as count",
        "from feedback",
        "where user_id = $1",
        "and created_at >= $2::timestamptz",
      ].join(" "),
      params: [userId, "2026-06-13T00:00:00.000Z"],
    });
  });

  it("creates feedback with jsonb metadata and returns camel-case domain fields", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("insert into feedback")) {
        return { rows: [feedbackRow({ metadata: { browser: "chromium" } })] };
      }

      return { rows: [] };
    });
    const repository = new PostgresFeedbackRepository(executor);

    await expect(
      repository.createFeedback({
        userId,
        organizationId: orgId,
        type: "bug",
        message: "This is a useful bug report",
        pageUrl: "/dashboard",
        screenshotUrl: `feedback/${orgId}/screenshot.jpeg`,
        userAgent: "Vitest",
        metadata: { browser: "chromium" },
      }),
    ).resolves.toMatchObject({
      id: feedbackId,
      userId,
      organizationId: orgId,
      metadata: { browser: "chromium" },
    });

    expect(statements[0]?.sql).toContain("$8::jsonb");
    expect(statements[0]?.params[7]).toBe(
      JSON.stringify({ browser: "chromium" }),
    );
  });

  it("normalizes jsonb metadata returned as a string", async () => {
    const { executor } = createExecutor((sql) => {
      if (sql.includes("insert into feedback")) {
        return {
          rows: [
            feedbackRow({
              metadata: JSON.stringify({ browser: "chromium" }),
            }),
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresFeedbackRepository(executor);

    await expect(
      repository.createFeedback({
        userId,
        organizationId: orgId,
        type: "bug",
        message: "This is a useful bug report",
        pageUrl: "/dashboard",
        screenshotUrl: `feedback/${orgId}/screenshot.jpeg`,
        userAgent: "Vitest",
        metadata: { browser: "chromium" },
      }),
    ).resolves.toMatchObject({
      metadata: { browser: "chromium" },
    });
  });

  it("lists admin feedback with organization, type, status, and pagination filters", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from feedback")) {
        return { rows: [feedbackRow()] };
      }

      return { rows: [] };
    });
    const repository = new PostgresFeedbackRepository(executor);

    await expect(
      repository.listFeedback({
        organizationId: orgId,
        type: "bug",
        status: "new",
        page: 2,
        perPage: 10,
      }),
    ).resolves.toHaveLength(1);

    expect(statements[0]?.sql).toContain("where organization_id = $1");
    expect(statements[0]?.sql).toContain("and type = $4");
    expect(statements[0]?.sql).toContain("and status = $5");
    expect(statements[0]?.sql).toContain("order by created_at desc");
    expect(statements[0]?.sql).toContain("limit $2 offset $3");
    expect(statements[0]?.params).toEqual([orgId, 10, 10, "bug", "new"]);
  });

  it("loads one org-scoped feedback item and updates status", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from feedback") || sql.startsWith("update feedback")) {
        return { rows: [feedbackRow({ status: "reviewed" })] };
      }

      return { rows: [] };
    });
    const repository = new PostgresFeedbackRepository(executor);

    await expect(
      repository.getFeedback({ feedbackId, organizationId: orgId }),
    ).resolves.toMatchObject({ id: feedbackId, organizationId: orgId });
    await expect(
      repository.updateFeedback({
        feedbackId,
        organizationId: orgId,
        status: "reviewed",
      }),
    ).resolves.toMatchObject({ status: "reviewed" });

    expect(statements[0]?.sql).toContain(
      "where id = $1 and organization_id = $2",
    );
    expect(statements[0]?.params).toEqual([feedbackId, orgId]);
    expect(statements[1]?.sql).toContain("set status = $3, updated_at = now()");
    expect(statements[1]?.params).toEqual([feedbackId, orgId, "reviewed"]);
  });

  it("deletes one org-scoped feedback item and returns the deleted row", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.startsWith("delete from feedback")) {
        return { rows: [feedbackRow()] };
      }

      return { rows: [] };
    });
    const repository = new PostgresFeedbackRepository(executor);

    await expect(
      repository.deleteFeedback({ feedbackId, organizationId: orgId }),
    ).resolves.toMatchObject({ id: feedbackId, organizationId: orgId });

    expect(statements[0]?.sql).toContain(
      "where id = $1 and organization_id = $2",
    );
    expect(statements[0]?.sql).toContain("returning id");
    expect(statements[0]?.params).toEqual([feedbackId, orgId]);
  });

  it("updates metadata through jsonb and rejects empty update inputs", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.startsWith("update feedback")) {
        return { rows: [feedbackRow({ metadata: { triage: "done" } })] };
      }

      return { rows: [] };
    });
    const repository = new PostgresFeedbackRepository(executor);

    await expect(
      repository.updateFeedback({
        feedbackId,
        organizationId: orgId,
        metadata: { triage: "done" },
      }),
    ).resolves.toMatchObject({ metadata: { triage: "done" } });
    await expect(
      repository.updateFeedback({ feedbackId, organizationId: orgId }),
    ).rejects.toThrow("No updates provided");

    expect(statements[0]?.sql).toContain("metadata = $3::jsonb");
    expect(statements[0]?.params).toEqual([
      feedbackId,
      orgId,
      JSON.stringify({ triage: "done" }),
    ]);
  });

  it("aggregates stats by type and status", async () => {
    const { executor } = createExecutor(() => ({
      rows: [
        { type: "bug", status: "new" },
        { type: "bug", status: "resolved" },
        { type: "general", status: "new" },
      ],
    }));
    const repository = new PostgresFeedbackRepository(executor);

    await expect(repository.getStats(orgId)).resolves.toEqual({
      total: 3,
      byType: { bug: 2, general: 1 },
      byStatus: { new: 2, resolved: 1 },
    });
  });
});

function feedbackRow(
  overrides: Partial<{
    status: string;
    metadata: Record<string, unknown> | string | null;
  }> = {},
) {
  return {
    id: feedbackId,
    userId,
    organizationId: orgId,
    type: "bug",
    status: overrides.status ?? "new",
    message: "This is a useful bug report",
    pageUrl: "/dashboard",
    screenshotUrl: `feedback/${orgId}/screenshot.jpeg`,
    userAgent: "Vitest",
    metadata: overrides.metadata ?? { browser: "chromium" },
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T00:00:01Z",
  };
}
