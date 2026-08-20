import type {
  FeedbackCreateInput,
  FeedbackDeleteInput,
  FeedbackListQuery,
  FeedbackRecord,
  FeedbackRepository,
  FeedbackStats,
  FeedbackStatus,
  FeedbackType,
  FeedbackUpdateInput,
} from "../../domain/feedback/repository";
import type { PostgresExecutor } from "./postgres";

type FeedbackRow = {
  id: string;
  userId: string;
  organizationId: string;
  type: FeedbackType;
  status: FeedbackStatus;
  message: string;
  pageUrl: string;
  screenshotUrl: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | string | null;
  createdAt: string;
  updatedAt: string;
};

type CountRow = {
  count: string | number;
};

type StatsRow = {
  type: FeedbackType;
  status: FeedbackStatus;
};

export class PostgresFeedbackRepository implements FeedbackRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async countRecentForUser(input: {
    userId: string;
    sinceIso: string;
  }): Promise<number> {
    const result = await this.executor.query<CountRow>(
      [
        "select count(*) as count",
        "from feedback",
        "where user_id = $1",
        "and created_at >= $2::timestamptz",
      ].join(" "),
      [input.userId, input.sinceIso],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async createFeedback(input: FeedbackCreateInput): Promise<FeedbackRecord> {
    const result = await this.executor.query<FeedbackRow>(
      [
        "insert into feedback (",
        "user_id, organization_id, type, status, message, page_url,",
        "screenshot_url, user_agent, metadata",
        ") values ($1, $2, $3, 'new', $4, $5, $6, $7, $8::jsonb)",
        feedbackReturningColumns(),
      ].join(" "),
      [
        input.userId,
        input.organizationId,
        input.type,
        input.message,
        input.pageUrl,
        input.screenshotUrl,
        input.userAgent,
        JSON.stringify(input.metadata),
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to create feedback");
    }

    return toFeedbackRecord(row);
  }

  async listFeedback(query: FeedbackListQuery): Promise<FeedbackRecord[]> {
    const offset = (query.page - 1) * query.perPage;
    const params: unknown[] = [query.organizationId, query.perPage, offset];
    const typeFilter = query.type ? `and type = $${params.length + 1}` : "";

    if (query.type) {
      params.push(query.type);
    }

    const statusFilter = query.status
      ? `and status = $${params.length + 1}`
      : "";

    if (query.status) {
      params.push(query.status);
    }

    const result = await this.executor.query<FeedbackRow>(
      [
        feedbackSelectColumns(),
        "from feedback",
        "where organization_id = $1",
        typeFilter,
        statusFilter,
        "order by created_at desc",
        "limit $2 offset $3",
      ]
        .filter(Boolean)
        .join(" "),
      params,
    );

    return result.rows.map(toFeedbackRecord);
  }

  async listMyFeedback(input: {
    userId: string;
    limit: number;
  }): Promise<FeedbackRecord[]> {
    const result = await this.executor.query<FeedbackRow>(
      [
        feedbackSelectColumns(),
        "from feedback",
        "where user_id = $1",
        "order by created_at desc",
        "limit $2",
      ].join(" "),
      [input.userId, input.limit],
    );

    return result.rows.map(toFeedbackRecord);
  }

  async getFeedback(input: {
    feedbackId: string;
    organizationId: string;
  }): Promise<FeedbackRecord | null> {
    const result = await this.executor.query<FeedbackRow>(
      [
        feedbackSelectColumns(),
        "from feedback",
        "where id = $1 and organization_id = $2",
      ].join(" "),
      [input.feedbackId, input.organizationId],
    );
    const row = result.rows[0];

    return row ? toFeedbackRecord(row) : null;
  }

  async updateFeedback(
    input: FeedbackUpdateInput,
  ): Promise<FeedbackRecord | null> {
    const assignments: string[] = [];
    const params: unknown[] = [input.feedbackId, input.organizationId];

    if (input.status) {
      params.push(input.status);
      assignments.push(`status = $${params.length}`);
    }

    if (input.metadata !== undefined) {
      params.push(JSON.stringify(input.metadata));
      assignments.push(`metadata = $${params.length}::jsonb`);
    }

    if (assignments.length === 0) {
      throw new Error("No updates provided");
    }

    const result = await this.executor.query<FeedbackRow>(
      [
        "update feedback",
        `set ${assignments.join(", ")}, updated_at = now()`,
        "where id = $1 and organization_id = $2",
        feedbackReturningColumns(),
      ].join(" "),
      params,
    );
    const row = result.rows[0];

    return row ? toFeedbackRecord(row) : null;
  }

  async deleteFeedback(
    input: FeedbackDeleteInput,
  ): Promise<FeedbackRecord | null> {
    const result = await this.executor.query<FeedbackRow>(
      [
        "delete from feedback",
        "where id = $1 and organization_id = $2",
        feedbackReturningColumns(),
      ].join(" "),
      [input.feedbackId, input.organizationId],
    );
    const row = result.rows[0];

    return row ? toFeedbackRecord(row) : null;
  }

  async getStats(organizationId: string): Promise<FeedbackStats> {
    const result = await this.executor.query<StatsRow>(
      "select type, status from feedback where organization_id = $1",
      [organizationId],
    );
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const row of result.rows) {
      byType[row.type] = (byType[row.type] ?? 0) + 1;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    }

    return {
      total: result.rows.length,
      byType,
      byStatus,
    };
  }
}

function feedbackSelectColumns(): string {
  return [
    'select id, user_id as "userId",',
    'organization_id as "organizationId", type, status, message,',
    'page_url as "pageUrl", screenshot_url as "screenshotUrl",',
    'user_agent as "userAgent", metadata,',
    'created_at as "createdAt", updated_at as "updatedAt"',
  ].join(" ");
}

function feedbackReturningColumns(): string {
  return [
    'returning id, user_id as "userId",',
    'organization_id as "organizationId", type, status, message,',
    'page_url as "pageUrl", screenshot_url as "screenshotUrl",',
    'user_agent as "userAgent", metadata,',
    'created_at as "createdAt", updated_at as "updatedAt"',
  ].join(" ");
}

function toFeedbackRecord(row: FeedbackRow): FeedbackRecord {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    type: row.type,
    status: row.status,
    message: row.message,
    pageUrl: row.pageUrl,
    screenshotUrl: row.screenshotUrl,
    userAgent: row.userAgent,
    metadata: parseMetadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseMetadata(
  metadata: Record<string, unknown> | string | null,
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === "string") {
    try {
      const parsed: unknown = JSON.parse(metadata);

      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return metadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
