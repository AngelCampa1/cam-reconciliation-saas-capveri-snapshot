import { describe, expect, it } from "vitest";
import {
  AUDIT_EVENT_ERROR_MAX_LENGTH,
  PostgresAuditPipelineEventRepository,
  truncateAuditEventError,
} from "../adapters/db/audit-pipeline-events";
import type { PostgresExecutor } from "../adapters/db/postgres";
import {
  forensicSnapshotKey,
  R2ForensicJsonStore,
} from "../adapters/storage/forensic-store";
import type { QueryResult } from "../adapters/db/transaction";

const documentId = "33333333-3333-4333-8333-333333333333";
const organizationId = "11111111-1111-4111-8111-111111111111";

type RecordedPut = {
  key: string;
  value: string | ReadableStream | ArrayBuffer | ArrayBufferView | Blob;
  contentType?: string;
};

class FakeR2Bucket {
  readonly puts: RecordedPut[] = [];

  constructor(private readonly putError?: Error) {}

  async put(
    key: string,
    value: string | ReadableStream | ArrayBuffer | ArrayBufferView | Blob,
    options?: R2PutOptions,
  ): Promise<R2Object> {
    const recorded: RecordedPut = { key, value };
    if (
      options?.httpMetadata &&
      !(options.httpMetadata instanceof Headers) &&
      options.httpMetadata.contentType
    ) {
      recorded.contentType = options.httpMetadata.contentType;
    }
    this.puts.push(recorded);
    if (this.putError) {
      throw this.putError;
    }

    return {
      key,
      version: "v1",
      size: typeof value === "string" ? value.length : 0,
      etag: "etag",
      httpEtag: "etag",
      uploaded: new Date("2026-06-12T00:00:00.000Z"),
      checksums: {},
      storageClass: "Standard",
      writeHttpMetadata() {},
    } as unknown as R2Object;
  }
}

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

function createExecutor(error?: Error): {
  executor: PostgresExecutor;
  statements: RecordedStatement[];
} {
  const statements: RecordedStatement[] = [];

  return {
    statements,
    executor: {
      async query<Row>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<QueryResult<Row>> {
        statements.push({ sql, params });
        if (error) {
          throw error;
        }

        return { rows: [] };
      },
      async transaction<Result>(
        operation: (executor: PostgresExecutor) => Promise<Result>,
      ): Promise<Result> {
        return operation(this);
      },
    },
  };
}

describe("R2ForensicJsonStore", () => {
  it("writes JSON snapshots under the Python forensic key pattern", async () => {
    const bucket = new FakeR2Bucket();
    const store = new R2ForensicJsonStore(bucket as unknown as R2Bucket);

    await expect(
      store.writeJson(documentId, "extract_primary", {
        tenant_name: "Acme",
      }),
    ).resolves.toEqual({
      ok: true,
      key: `extractions/raw/${documentId}/extract_primary.json`,
    });

    expect(bucket.puts).toHaveLength(1);
    expect(bucket.puts[0]?.key).toBe(
      `extractions/raw/${documentId}/extract_primary.json`,
    );
    expect(bucket.puts[0]?.value).toBe('{"tenant_name":"Acme"}');
    expect(bucket.puts[0]?.contentType).toBe("application/json");
  });

  it("returns write failures instead of throwing", async () => {
    const bucket = new FakeR2Bucket(new Error("R2 unavailable"));
    const store = new R2ForensicJsonStore(bucket as unknown as R2Bucket);

    await expect(
      store.writeJson(documentId, "merged", { ok: true }),
    ).resolves.toMatchObject({
      ok: false,
      key: `extractions/raw/${documentId}/merged.json`,
      error: new Error("R2 unavailable"),
    });
  });

  it("returns key validation failures instead of throwing", async () => {
    const bucket = new FakeR2Bucket();
    const store = new R2ForensicJsonStore(bucket as unknown as R2Bucket);

    await expect(
      store.writeJson("../bad", "merged", { ok: true }),
    ).resolves.toMatchObject({
      ok: false,
      key: "",
      error: new TypeError("documentId must be a UUID path segment"),
    });
    expect(bucket.puts).toHaveLength(0);
  });

  it("validates forensic snapshot keys as relative object paths", () => {
    expect(forensicSnapshotKey(documentId, "merged")).toBe(
      `extractions/raw/${documentId}/merged.json`,
    );
    expect(() => forensicSnapshotKey("../bad", "merged")).toThrow(
      "documentId must be a UUID path segment",
    );
    expect(() => forensicSnapshotKey("not-a-uuid", "merged")).toThrow(
      "documentId must be a UUID path segment",
    );
  });
});

describe("PostgresAuditPipelineEventRepository", () => {
  it("inserts audit pipeline events with default attempt number", async () => {
    const { executor, statements } = createExecutor();
    const repository = new PostgresAuditPipelineEventRepository(executor);

    await expect(
      repository.emit({
        documentId,
        organizationId,
        stage: "judge",
        model: "z-ai/glm-5.1",
        tokensUsed: 17,
        durationMs: 250,
        outcome: "success",
      }),
    ).resolves.toEqual({ ok: true });

    expect(statements[0]?.sql).toContain("insert into audit_pipeline_events");
    expect(statements[0]?.params).toEqual([
      documentId,
      organizationId,
      "judge",
      "z-ai/glm-5.1",
      17,
      250,
      "success",
      1,
      null,
    ]);
  });

  it("truncates long audit errors before insert", async () => {
    const { executor, statements } = createExecutor();
    const repository = new PostgresAuditPipelineEventRepository(executor);
    const longError = "x".repeat(AUDIT_EVENT_ERROR_MAX_LENGTH + 20);

    await repository.emit({
      documentId,
      organizationId,
      stage: "extract_primary",
      model: "google/gemini-3.1-flash-lite",
      tokensUsed: 0,
      durationMs: 10,
      outcome: "failed",
      attemptNumber: 2,
      error: longError,
    });

    expect(String(statements[0]?.params[8])).toHaveLength(
      AUDIT_EVENT_ERROR_MAX_LENGTH,
    );
  });

  it("returns insert failures instead of throwing", async () => {
    const { executor } = createExecutor(new Error("database unavailable"));
    const repository = new PostgresAuditPipelineEventRepository(executor);

    await expect(
      repository.emit({
        documentId,
        organizationId,
        stage: "merge",
        model: "",
        tokensUsed: 0,
        durationMs: 1,
        outcome: "success",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: new Error("database unavailable"),
    });
  });
});

describe("truncateAuditEventError", () => {
  it("preserves short errors and truncates oversized provider errors", () => {
    expect(truncateAuditEventError("short")).toBe("short");
    expect(
      truncateAuditEventError("x".repeat(AUDIT_EVENT_ERROR_MAX_LENGTH + 1)),
    ).toHaveLength(AUDIT_EVENT_ERROR_MAX_LENGTH);
  });
});
