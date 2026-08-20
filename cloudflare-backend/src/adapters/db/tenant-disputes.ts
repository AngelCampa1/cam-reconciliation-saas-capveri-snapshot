import type {
  AddAttachmentInput,
  AddAdminCommentInput,
  AddCommentInput,
  AdminDisputeAttachment,
  AdminDisputeComment,
  AdminDisputeDetail,
  AdminDisputeSummary,
  AdminDisputesRepository,
  CalculationTraceStep,
  CreateDisputeInput,
  CreateSyntheticAdminDisputeFixtureInput,
  DeleteSyntheticAdminDisputeFixtureResidueResult,
  DeleteSyntheticDisputeInput,
  DeleteSyntheticAdminDisputeFixtureResult,
  DeleteSyntheticDisputeResult,
  DeleteSyntheticTenantDisputeInput,
  DisputeAttachment,
  DisputeComment,
  DisputeDetail,
  DisputeSummary,
  ListDisputesForOrgInput,
  ListDisputesInput,
  StatementPdfContext,
  SyntheticAdminDisputeFixture,
  SyntheticAdminDisputeFixtureCleanupTarget,
  TenantDisputesRepository,
  UpdateDisputeStatusInput,
} from "../../domain/tenant-disputes/repository";
import { normalizeCalculationTrace } from "./calculation-trace";
import type { PostgresExecutor } from "./postgres";

type DisputeRow = {
  id: string;
  statement_id: string;
  category: string;
  status: string;
  description: string;
  created_at: string;
};

type AdminDisputeRow = {
  id: string;
  tenant_user_id: string;
  statement_id: string;
  organization_id: string;
  category: string;
  status: string;
  description: string;
  assigned_to: string | null;
  resolution_summary: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

type AdminCommentRow = {
  id: string;
  dispute_id: string;
  author_id: string;
  author_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
};

type CommentRow = {
  id: string;
  dispute_id: string;
  author_id: string;
  author_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  dispute_id: string;
  filename: string;
  storage_path: string;
  file_size: string;
  mime_type: string;
  created_at: string;
};

type ExistsRow = { exists: boolean };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

type SnapshotRow = {
  id: string;
  period_start_date: string;
  period_end_date: string;
  total_operating_expenses: string;
  grossed_up_expenses: string;
  base_year_amount: string;
  tenant_share_before_cap: string;
  tenant_share_after_cap: string;
  admin_fee: string;
  total_recovery: string;
  calculation_trace: unknown;
  tenant_name: string;
  property_name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  org_name: string;
};

function disputeSummaryFromRow(row: DisputeRow): DisputeSummary {
  return {
    id: row.id,
    statement_id: row.statement_id,
    category: row.category as DisputeSummary["category"],
    status: row.status as DisputeSummary["status"],
    description: row.description,
    created_at: row.created_at,
  };
}

function commentFromRow(row: CommentRow): DisputeComment {
  return {
    id: row.id,
    dispute_id: row.dispute_id,
    author_id: row.author_id,
    author_name: row.author_name,
    content: row.content,
    is_internal: row.is_internal,
    created_at: row.created_at,
  };
}

function attachmentFromRow(
  row: AttachmentRow,
  disputeId: string,
): DisputeAttachment {
  return {
    id: row.id,
    filename: row.filename,
    file_url: `/api/v1/tenant/disputes/${disputeId}/attachments/${row.id}`,
    file_size_bytes: Number.parseInt(row.file_size, 10),
    content_type: row.mime_type,
    created_at: row.created_at,
  };
}

function buildPropertyAddress(row: {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}): string {
  const cityState =
    row.city && row.state
      ? `${row.city}, ${row.state}${row.postal_code ? ` ${row.postal_code}` : ""}`
      : null;
  return [row.address_line1, cityState].filter(Boolean).join(", ");
}

function safeTrace(raw: unknown): CalculationTraceStep[] {
  // Shares the reconciliation/tax-protest export normalizer: the engine
  // persists steps as { name, operation, output } (calculator.ts) and the
  // JSONB column may decode as a JSON string. Reading step_name/output_value
  // off the raw shape (and skipping the string-decode branch) blanked the
  // tenant statement PDF's Calculation Summary on a non-empty trace.
  return normalizeCalculationTrace(raw);
}

export class PostgresTenantDisputesRepository implements TenantDisputesRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async countRecentDisputesForTenant(input: {
    tenantUserId: string;
    since: string;
  }): Promise<number> {
    const result = await this.executor.query<{ count: string }>(
      [
        "select count(*)::text as count",
        "from disputes",
        "where tenant_user_id = $1",
        "and created_at >= $2",
      ].join(" "),
      [input.tenantUserId, input.since],
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async verifyStatementForTenant(input: {
    statementId: string;
    tenantUserId: string;
    organizationId: string;
  }): Promise<"ok" | "not_found" | "not_linked"> {
    // Does a finalized snapshot exist in the org?
    const snapshotResult = await this.executor.query<{
      lease_id: string;
      status: string;
    }>(
      [
        "select lease_id, status",
        "from reconciliation_snapshots",
        "where id = $1",
        "and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.statementId, input.organizationId],
    );
    const snapshot = snapshotResult.rows[0];
    if (!snapshot || snapshot.status !== "finalized") {
      return "not_found";
    }
    // Is the lease linked to this tenant?
    const linkResult = await this.executor.query<{ lease_id: string }>(
      [
        "select lease_id",
        "from tenant_lease_links",
        "where tenant_user_id = $1",
        "and lease_id = $2",
        "limit 1",
      ].join(" "),
      [input.tenantUserId, snapshot.lease_id],
    );
    if (linkResult.rows.length === 0) {
      return "not_linked";
    }
    return "ok";
  }

  async createDispute(input: CreateDisputeInput): Promise<DisputeSummary> {
    return this.executor.transaction(async (tx) => {
      const disputeResult = await tx.query<DisputeRow>(
        [
          "insert into disputes",
          "(statement_id, organization_id, tenant_user_id, category, status, description, created_at, updated_at)",
          "values ($1, $2, $3, $4, 'open', $5, $6, $6)",
          "returning id, statement_id, category, status, description, created_at::text as created_at",
        ].join(" "),
        [
          input.statementId,
          input.organizationId,
          input.tenantUserId,
          input.category,
          input.description,
          input.now,
        ],
      );
      const dispute = disputeResult.rows[0];
      if (!dispute) {
        throw new Error("Failed to insert dispute row");
      }
      // Insert the initial comment (the description).
      // author_id is FK to users(id), NOT tenant_users(id).
      await tx.query(
        [
          "insert into dispute_comments",
          "(dispute_id, author_id, content, is_internal, created_at)",
          "values ($1, $2, $3, false, $4)",
        ].join(" "),
        [dispute.id, input.authorUserId, input.description, input.now],
      );
      return disputeSummaryFromRow(dispute);
    });
  }

  async listDisputes(input: ListDisputesInput): Promise<DisputeSummary[]> {
    const clauses = ["d.tenant_user_id = $1"];
    const params: unknown[] = [input.tenantUserId];
    let paramIdx = 2;

    if (input.status) {
      clauses.push(`d.status = $${paramIdx}`);
      params.push(input.status);
      paramIdx++;
    }

    params.push(input.skip);
    const skipIdx = paramIdx++;
    params.push(input.limit);
    const limitIdx = paramIdx;

    const result = await this.executor.query<DisputeRow>(
      [
        "select d.id, d.statement_id, d.category, d.status, d.description,",
        "d.created_at::text as created_at",
        "from disputes d",
        `where ${clauses.join(" and ")}`,
        "order by d.created_at desc, d.id desc",
        `offset $${skipIdx}`,
        `limit $${limitIdx}`,
      ].join(" "),
      params,
    );
    return result.rows.map(disputeSummaryFromRow);
  }

  async getDispute(input: {
    disputeId: string;
    tenantUserId: string;
  }): Promise<DisputeDetail | null> {
    const disputeResult = await this.executor.query<DisputeRow>(
      [
        "select id, statement_id, category, status, description,",
        "created_at::text as created_at",
        "from disputes",
        "where id = $1",
        "and tenant_user_id = $2",
        "limit 1",
      ].join(" "),
      [input.disputeId, input.tenantUserId],
    );
    const dispute = disputeResult.rows[0];
    if (!dispute) {
      return null;
    }

    const [commentsResult, attachmentsResult] = await Promise.all([
      this.executor.query<CommentRow>(
        [
          "select dc.id, dc.dispute_id, dc.author_id,",
          "coalesce(u.full_name, 'Unknown') as author_name,",
          "dc.content, dc.is_internal,",
          "dc.created_at::text as created_at",
          "from dispute_comments dc",
          "left join users u on u.id = dc.author_id",
          "where dc.dispute_id = $1",
          "and dc.is_internal = false",
          "order by dc.created_at asc, dc.id asc",
        ].join(" "),
        [input.disputeId],
      ),
      this.executor.query<AttachmentRow>(
        [
          "select id, dispute_id, filename, storage_path,",
          "file_size::text as file_size, mime_type,",
          "created_at::text as created_at",
          "from dispute_attachments",
          "where dispute_id = $1",
          "order by created_at asc, id asc",
        ].join(" "),
        [input.disputeId],
      ),
    ]);

    return {
      id: dispute.id,
      statement_id: dispute.statement_id,
      category: dispute.category as DisputeDetail["category"],
      status: dispute.status as DisputeDetail["status"],
      description: dispute.description,
      created_at: dispute.created_at,
      comments: commentsResult.rows.map(commentFromRow),
      attachments: attachmentsResult.rows.map((row) =>
        attachmentFromRow(row, input.disputeId),
      ),
    };
  }

  async addComment(input: AddCommentInput): Promise<DisputeComment | null> {
    // Verify ownership
    const check = await this.executor.query<{ id: string }>(
      "select id from disputes where id = $1 and tenant_user_id = $2 limit 1",
      [input.disputeId, input.tenantUserId],
    );
    if (check.rows.length === 0) {
      return null;
    }

    const result = await this.executor.query<CommentRow>(
      [
        "insert into dispute_comments",
        "(dispute_id, author_id, content, is_internal, created_at)",
        "values ($1, $2, $3, false, $4)",
        "returning id, dispute_id, author_id,",
        "$5::text as author_name,",
        "content, is_internal, created_at::text as created_at",
      ].join(" "),
      [
        input.disputeId,
        input.authorId,
        input.content,
        input.now,
        input.authorName,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return commentFromRow(row);
  }

  async addAttachment(
    input: AddAttachmentInput,
  ): Promise<DisputeAttachment | null> {
    // Verify ownership
    const check = await this.executor.query<{ id: string }>(
      "select id from disputes where id = $1 and tenant_user_id = $2 limit 1",
      [input.disputeId, input.tenantUserId],
    );
    if (check.rows.length === 0) {
      return null;
    }

    const result = await this.executor.query<AttachmentRow>(
      [
        "insert into dispute_attachments",
        "(dispute_id, uploaded_by, filename, storage_path, file_size, mime_type, created_at)",
        "values ($1, $2, $3, $4, $5, $6, $7)",
        "returning id, dispute_id, filename, storage_path,",
        "file_size::text as file_size, mime_type, created_at::text as created_at",
      ].join(" "),
      [
        input.disputeId,
        input.uploadedBy,
        input.filename,
        input.storagePath,
        input.fileSize,
        input.mimeType,
        input.now,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return attachmentFromRow(row, input.disputeId);
  }

  async getAttachmentForDownload(input: {
    disputeId: string;
    attachmentId: string;
    tenantUserId: string;
  }): Promise<{
    storagePath: string;
    filename: string;
    mimeType: string;
  } | null> {
    const result = await this.executor.query<{
      storage_path: string;
      filename: string;
      mime_type: string;
    }>(
      [
        "select da.storage_path, da.filename, da.mime_type",
        "from dispute_attachments da",
        "join disputes d on d.id = da.dispute_id",
        "where da.id = $1",
        "and da.dispute_id = $2",
        "and d.tenant_user_id = $3",
        "limit 1",
      ].join(" "),
      [input.attachmentId, input.disputeId, input.tenantUserId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      storagePath: row.storage_path,
      filename: row.filename,
      mimeType: row.mime_type,
    };
  }

  async deleteSyntheticTenantDispute(
    input: DeleteSyntheticTenantDisputeInput,
  ): Promise<DeleteSyntheticDisputeResult | null> {
    const exists = await this.executor.query<{ id: string }>(
      [
        "select id from disputes",
        "where id = $1",
        "and tenant_user_id = $2",
        "and description = $3",
        "limit 1",
      ].join(" "),
      [input.disputeId, input.tenantUserId, input.expectedDescription],
    );
    if (exists.rows.length === 0) {
      return null;
    }

    return this.executor.transaction(async (tx) => {
      const attachments = await tx.query<{ id: string }>(
        "delete from dispute_attachments where dispute_id = $1 returning id",
        [input.disputeId],
      );
      const comments = await tx.query<{ id: string }>(
        "delete from dispute_comments where dispute_id = $1 returning id",
        [input.disputeId],
      );
      const disputes = await tx.query<{ id: string }>(
        [
          "delete from disputes",
          "where id = $1",
          "and tenant_user_id = $2",
          "and description = $3",
          "returning id",
        ].join(" "),
        [input.disputeId, input.tenantUserId, input.expectedDescription],
      );

      if (disputes.rows.length === 0) {
        return null;
      }

      return {
        dispute_attachments: attachments.rows.length,
        dispute_comments: comments.rows.length,
        disputes: disputes.rows.length,
      };
    });
  }

  async getStatementPdfContext(input: {
    statementId: string;
    tenantUserId: string;
    organizationId: string;
  }): Promise<StatementPdfContext | null> {
    // Get tenant lease IDs
    const leaseLinks = await this.executor.query<{ lease_id: string }>(
      "select lease_id from tenant_lease_links where tenant_user_id = $1",
      [input.tenantUserId],
    );
    if (leaseLinks.rows.length === 0) {
      return null;
    }
    const leaseIds = leaseLinks.rows.map((r) => r.lease_id);

    const snapshotResult = await this.executor.query<SnapshotRow>(
      [
        "select",
        "rs.id, rs.period_start_date::text as period_start_date,",
        "rs.period_end_date::text as period_end_date,",
        "coalesce(rs.total_operating_expenses, 0)::text as total_operating_expenses,",
        "coalesce(rs.grossed_up_expenses, 0)::text as grossed_up_expenses,",
        "coalesce(rs.base_year_amount, 0)::text as base_year_amount,",
        "coalesce(rs.tenant_share_before_cap, 0)::text as tenant_share_before_cap,",
        "coalesce(rs.tenant_share_after_cap, 0)::text as tenant_share_after_cap,",
        "coalesce(rs.admin_fee, 0)::text as admin_fee,",
        "coalesce(rs.total_recovery, 0)::text as total_recovery,",
        "rs.calculation_trace,",
        "coalesce(l.tenant_name, '') as tenant_name,",
        "coalesce(p.name, '') as property_name,",
        "p.address_line1, p.city, p.state, p.postal_code,",
        "coalesce(o.name, '') as org_name",
        "from reconciliation_snapshots rs",
        "join leases l on l.id = rs.lease_id",
        "join properties p on p.id = rs.property_id",
        "join organizations o on o.id = rs.organization_id",
        "where rs.id = $1",
        "and rs.organization_id = $2",
        "and rs.status = 'finalized'",
        "and rs.lease_id = any($3::uuid[])",
        "limit 1",
      ].join(" "),
      [input.statementId, input.organizationId, leaseIds],
    );

    const row = snapshotResult.rows[0];
    if (!row) {
      return null;
    }

    return {
      snapshot: {
        id: row.id,
        period_start_date: row.period_start_date,
        period_end_date: row.period_end_date,
        total_operating_expenses: row.total_operating_expenses,
        grossed_up_expenses: row.grossed_up_expenses,
        base_year_amount: row.base_year_amount,
        tenant_share_before_cap: row.tenant_share_before_cap,
        tenant_share_after_cap: row.tenant_share_after_cap,
        admin_fee: row.admin_fee,
        total_recovery: row.total_recovery,
        calculation_trace: safeTrace(row.calculation_trace),
      },
      lease: { tenant_name: row.tenant_name },
      property: {
        name: row.property_name,
        address: buildPropertyAddress(row),
      },
      organization: { name: row.org_name },
    };
  }
}

// ── Admin disputes repository ─────────────────────────────────────────────────

function adminSummaryFromRow(row: AdminDisputeRow): AdminDisputeSummary {
  return {
    id: row.id,
    statement_id: row.statement_id,
    category: row.category as AdminDisputeSummary["category"],
    status: row.status as AdminDisputeSummary["status"],
    description: row.description,
    created_at: row.created_at,
  };
}

function adminCommentFromRow(row: AdminCommentRow): AdminDisputeComment {
  return {
    id: row.id,
    dispute_id: row.dispute_id,
    author_id: row.author_id,
    author_name: row.author_name,
    content: row.content,
    is_internal: row.is_internal,
    created_at: row.created_at,
  };
}

export class PostgresAdminDisputesRepository implements AdminDisputesRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async hasFullAccess(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<SubscriptionEntitlementRow>(
      [
        'select status, billing_model as "billingModel",',
        'stripe_subscription_id as "stripeSubscriptionId",',
        'current_period_end as "currentPeriodEnd"',
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    if (!row) {
      return this.hasPurchasedCredits(organizationId);
    }

    if (row.billingModel === "credit_pack") {
      return this.hasPurchasedCredits(organizationId);
    }

    const status = effectiveSubscriptionStatus(row);
    return status === "active" || status === "trialing";
  }

  async listDisputesForOrg(
    input: ListDisputesForOrgInput,
  ): Promise<AdminDisputeSummary[]> {
    const clauses = ["d.organization_id = $1"];
    const params: unknown[] = [input.organizationId];
    let paramIdx = 2;

    if (input.status) {
      clauses.push(`d.status = $${paramIdx}`);
      params.push(input.status);
      paramIdx++;
    }

    params.push(input.skip);
    const skipIdx = paramIdx++;
    params.push(input.limit);
    const limitIdx = paramIdx;

    const result = await this.executor.query<AdminDisputeRow>(
      [
        "select d.id, d.tenant_user_id, d.statement_id, d.organization_id,",
        "d.category, d.status, d.description, d.assigned_to,",
        "d.resolution_summary, d.resolved_at::text as resolved_at,",
        "d.resolved_by, d.created_at::text as created_at, d.updated_at::text as updated_at",
        "from disputes d",
        `where ${clauses.join(" and ")}`,
        "order by d.created_at desc, d.id desc",
        `offset $${skipIdx}`,
        `limit $${limitIdx}`,
      ].join(" "),
      params,
    );
    return result.rows.map(adminSummaryFromRow);
  }

  async getDisputeForAdmin(input: {
    disputeId: string;
    organizationId: string;
  }): Promise<AdminDisputeDetail | null> {
    const disputeResult = await this.executor.query<AdminDisputeRow>(
      [
        "select id, tenant_user_id, statement_id, organization_id,",
        "category, status, description, assigned_to, resolution_summary,",
        "resolved_at::text as resolved_at, resolved_by,",
        "created_at::text as created_at, updated_at::text as updated_at",
        "from disputes",
        "where id = $1",
        "and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.disputeId, input.organizationId],
    );
    const dispute = disputeResult.rows[0];
    if (!dispute) {
      return null;
    }

    const [commentsResult, attachmentsResult] = await Promise.all([
      this.executor.query<AdminCommentRow>(
        [
          "select dc.id, dc.dispute_id, dc.author_id,",
          "coalesce(u.full_name, 'Unknown') as author_name,",
          "dc.content, dc.is_internal,",
          "dc.created_at::text as created_at",
          "from dispute_comments dc",
          "left join users u on u.id = dc.author_id",
          "where dc.dispute_id = $1",
          // Admin sees ALL comments — no is_internal filter
          "order by dc.created_at asc, dc.id asc",
        ].join(" "),
        [input.disputeId],
      ),
      this.executor.query<AttachmentRow>(
        [
          "select id, dispute_id, filename, storage_path,",
          "file_size::text as file_size, mime_type,",
          "created_at::text as created_at",
          "from dispute_attachments",
          "where dispute_id = $1",
          "order by created_at asc, id asc",
        ].join(" "),
        [input.disputeId],
      ),
    ]);

    // Attachments for admin view: file_url is a streaming download route served
    // by the Worker, mirroring the tenant slice's attachmentFromRow convention.
    // The raw R2 storage_path is never exposed to the client (it is an internal
    // key that would leak bucket layout and is not directly fetchable). The
    // route is auth-gated and org-scoped (see GET .../attachments/:attachmentId).
    const attachments: AdminDisputeAttachment[] = attachmentsResult.rows.map(
      (row) => ({
        id: row.id,
        filename: row.filename,
        file_url: `/api/v1/disputes/${input.disputeId}/attachments/${row.id}`,
        file_size_bytes: Number.parseInt(row.file_size, 10),
        content_type: row.mime_type,
        created_at: row.created_at,
      }),
    );

    return {
      id: dispute.id,
      tenant_user_id: dispute.tenant_user_id,
      statement_id: dispute.statement_id,
      organization_id: dispute.organization_id,
      category: dispute.category as AdminDisputeDetail["category"],
      status: dispute.status as AdminDisputeDetail["status"],
      description: dispute.description,
      assigned_to: dispute.assigned_to,
      resolution_summary: dispute.resolution_summary,
      resolved_at: dispute.resolved_at,
      resolved_by: dispute.resolved_by,
      created_at: dispute.created_at,
      updated_at: dispute.updated_at,
      comments: commentsResult.rows.map(adminCommentFromRow),
      attachments,
    };
  }

  async updateDisputeStatus(
    input: UpdateDisputeStatusInput,
  ): Promise<AdminDisputeSummary | null> {
    // Build the SET clause. Only resolved_at / resolved_by / resolution_summary
    // are conditionally added (when transitioning to resolved/rejected).
    const setClauses: string[] = ["status = $3", "updated_at = now()"];
    const params: unknown[] = [
      input.disputeId,
      input.organizationId,
      input.newStatus,
    ];
    let paramIdx = 4;

    if (input.resolvedAt !== null) {
      setClauses.push(`resolved_at = $${paramIdx}`);
      params.push(input.resolvedAt);
      paramIdx++;
    }

    if (input.resolvedBy !== null) {
      setClauses.push(`resolved_by = $${paramIdx}`);
      params.push(input.resolvedBy);
      paramIdx++;
    }

    if (input.resolutionSummary !== null) {
      setClauses.push(`resolution_summary = $${paramIdx}`);
      params.push(input.resolutionSummary);
      paramIdx++;
    }

    // Optimistic-concurrency guard: only transition if the row is still in the
    // status the caller validated against. Two concurrent transitions then
    // serialize — the loser matches no row and returns null (→ 409), instead of
    // last-writer-clobbering the resolution metadata.
    const expectedStatusParam = paramIdx;
    params.push(input.expectedStatus);

    const result = await this.executor.query<AdminDisputeRow>(
      [
        "update disputes set",
        setClauses.join(", "),
        "where id = $1",
        "and organization_id = $2",
        `and status = $${expectedStatusParam}`,
        "returning id, tenant_user_id, statement_id, organization_id,",
        "category, status, description, assigned_to, resolution_summary,",
        "resolved_at::text as resolved_at, resolved_by,",
        "created_at::text as created_at, updated_at::text as updated_at",
      ].join(" "),
      params,
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return adminSummaryFromRow(row);
  }

  async addAdminComment(
    input: AddAdminCommentInput,
  ): Promise<AdminDisputeComment | null> {
    // Verify the dispute belongs to the organization before inserting.
    const check = await this.executor.query<{ id: string }>(
      "select id from disputes where id = $1 and organization_id = $2 limit 1",
      [input.disputeId, input.organizationId],
    );
    if (check.rows.length === 0) {
      return null;
    }

    const result = await this.executor.query<AdminCommentRow>(
      [
        "insert into dispute_comments",
        "(dispute_id, author_id, content, is_internal, created_at)",
        "values ($1, $2, $3, $4, $5)",
        "returning id, dispute_id, author_id,",
        "$6::text as author_name,",
        "content, is_internal, created_at::text as created_at",
      ].join(" "),
      [
        input.disputeId,
        input.authorId,
        input.content,
        input.isInternal,
        input.now,
        input.authorName,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return adminCommentFromRow(row);
  }

  async getAttachmentForOrgDownload(input: {
    disputeId: string;
    attachmentId: string;
    organizationId: string;
  }): Promise<{
    storagePath: string;
    filename: string;
    mimeType: string;
  } | null> {
    const result = await this.executor.query<{
      storage_path: string;
      filename: string;
      mime_type: string;
    }>(
      [
        "select da.storage_path, da.filename, da.mime_type",
        "from dispute_attachments da",
        "join disputes d on d.id = da.dispute_id",
        "where da.id = $1",
        "and da.dispute_id = $2",
        "and d.organization_id = $3",
        "limit 1",
      ].join(" "),
      [input.attachmentId, input.disputeId, input.organizationId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      storagePath: row.storage_path,
      filename: row.filename,
      mimeType: row.mime_type,
    };
  }

  async createSyntheticAdminDisputeFixture(
    input: CreateSyntheticAdminDisputeFixtureInput,
  ): Promise<SyntheticAdminDisputeFixture> {
    const tenantEmail = input.tenantEmail;
    const propertyName = syntheticAdminDisputePropertyName(input.runId);
    return this.executor.transaction(async (tx) => {
      const property = await tx.query<{ id: string }>(
        [
          "insert into properties",
          "(organization_id, name, address_line1, city, state, postal_code,",
          "total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy)",
          "values ($1, $2, '1 Prod E2E Way', 'Austin', 'TX', '78701',",
          "10000, 9000, 1000, 0.9500)",
          "returning id",
        ].join(" "),
        [input.organizationId, propertyName],
      );
      const propertyId = requireReturnedId(property.rows[0], "property");

      const lease = await tx.query<{ id: string }>(
        [
          "insert into leases",
          "(property_id, tenant_name, start_date, end_date, status, recovery_profile)",
          "values ($1, $2, '2026-01-01', '2026-12-31', 'active',",
          "$3::jsonb)",
          "returning id",
        ].join(" "),
        [
          propertyId,
          `PROD TEST Admin Dispute Tenant ${input.runId}`,
          JSON.stringify({
            base_year: 2025,
            base_year_amount: "10000.00",
            gross_up_base_year: false,
            pro_rata_share: "0.1000",
            cap_type: "none",
            cap_rate: null,
            admin_fee_percentage: "0.0500",
            excluded_pools: [],
          }),
        ],
      );
      const leaseId = requireReturnedId(lease.rows[0], "lease");

      const statement = await tx.query<{ id: string }>(
        [
          "insert into reconciliation_snapshots",
          "(property_id, lease_id, period_start_date, period_end_date, status,",
          "total_operating_expenses, grossed_up_expenses, base_year_amount,",
          "tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,",
          "calculation_trace, finalized_at, finalized_by_user_id)",
          "values ($1, $2, '2026-01-01', '2026-12-31', 'finalized',",
          "150000, 150000, 10000, 15000, 15000, 750, 15750,",
          "$3::jsonb, $4, $5)",
          "returning id",
        ].join(" "),
        [
          propertyId,
          leaseId,
          JSON.stringify([
            {
              label: "Prod E2E synthetic admin dispute fixture",
              amount: "15750.00",
              formula: "150000 * 0.10 + 750",
            },
          ]),
          input.now,
          input.actorUserId,
        ],
      );
      const statementId = requireReturnedId(statement.rows[0], "statement");

      const user = await tx.query<{
        id: string;
        previous_organization_id: string | null;
      }>(
        [
          "with existing as (",
          "select organization_id from users where id = $1",
          "), updated as (",
          "update users",
          "set organization_id = $2, email = $3, full_name = $4, role = 'tenant', updated_at = $5",
          "where id = $1",
          "returning id",
          ")",
          "select updated.id, existing.organization_id as previous_organization_id",
          "from updated left join existing on true",
        ].join(" "),
        [
          input.syntheticUserId,
          input.organizationId,
          tenantEmail,
          `PROD TEST Admin Dispute Tenant ${input.runId}`,
          input.now,
        ],
      );
      const syntheticUserId = requireReturnedId(user.rows[0], "user");
      const previousOrganizationId = user.rows[0]?.previous_organization_id;
      if (
        previousOrganizationId &&
        previousOrganizationId !== input.organizationId
      ) {
        await tx.query(
          [
            "delete from organizations",
            "where id = $1",
            "and name = $2",
            "and not exists (select 1 from users where organization_id = $1)",
          ].join(" "),
          [previousOrganizationId, input.authSignupOrganizationName],
        );
      }

      const tenantUser = await tx.query<{ id: string }>(
        [
          "insert into tenant_users",
          "(user_id, organization_id, contact_name, contact_email, created_at)",
          "values ($1, $2, $3, $4, $5)",
          "returning id",
        ].join(" "),
        [
          syntheticUserId,
          input.organizationId,
          `PROD TEST Admin Dispute Tenant ${input.runId}`,
          tenantEmail,
          input.now,
        ],
      );
      const tenantUserId = requireReturnedId(tenantUser.rows[0], "tenant user");

      await tx.query(
        [
          "insert into tenant_lease_links",
          "(tenant_user_id, lease_id, created_at)",
          "values ($1, $2, $3)",
        ].join(" "),
        [tenantUserId, leaseId, input.now],
      );

      const dispute = await tx.query<{ id: string }>(
        [
          "insert into disputes",
          "(tenant_user_id, statement_id, organization_id, category, status, description, created_at, updated_at)",
          "values ($1, $2, $3, 'calculation_error', 'open', $4, $5, $5)",
          "returning id",
        ].join(" "),
        [
          tenantUserId,
          statementId,
          input.organizationId,
          input.description,
          input.now,
        ],
      );
      const disputeId = requireReturnedId(dispute.rows[0], "dispute");

      await tx.query(
        [
          "insert into dispute_comments",
          "(dispute_id, author_id, content, is_internal, created_at)",
          "values ($1, $2, $3, false, $4)",
        ].join(" "),
        [disputeId, syntheticUserId, input.description, input.now],
      );

      return {
        property_id: propertyId,
        lease_id: leaseId,
        statement_id: statementId,
        synthetic_user_id: input.syntheticUserId,
        tenant_user_id: tenantUserId,
        dispute_id: disputeId,
        description: input.description,
        tenant_email: tenantEmail,
      };
    });
  }

  async deleteSyntheticDispute(
    input: DeleteSyntheticDisputeInput,
  ): Promise<DeleteSyntheticDisputeResult | null> {
    const exists = await this.executor.query<{ id: string }>(
      [
        "select id from disputes",
        "where id = $1",
        "and organization_id = $2",
        "and description = $3",
        "limit 1",
      ].join(" "),
      [input.disputeId, input.organizationId, input.expectedDescription],
    );
    if (exists.rows.length === 0) {
      return null;
    }

    return this.executor.transaction(async (tx) => {
      const attachments = await tx.query<{ id: string }>(
        "delete from dispute_attachments where dispute_id = $1 returning id",
        [input.disputeId],
      );
      const comments = await tx.query<{ id: string }>(
        "delete from dispute_comments where dispute_id = $1 returning id",
        [input.disputeId],
      );
      const disputes = await tx.query<{ id: string }>(
        [
          "delete from disputes",
          "where id = $1",
          "and organization_id = $2",
          "and description = $3",
          "returning id",
        ].join(" "),
        [input.disputeId, input.organizationId, input.expectedDescription],
      );

      if (disputes.rows.length === 0) {
        return null;
      }

      return {
        dispute_attachments: attachments.rows.length,
        dispute_comments: comments.rows.length,
        disputes: disputes.rows.length,
      };
    });
  }

  async getSyntheticAdminDisputeFixtureCleanupTarget(input: {
    disputeId: string;
    organizationId: string;
    runId: string;
    expectedDescription: string;
  }): Promise<SyntheticAdminDisputeFixtureCleanupTarget | null> {
    const tenantEmail = syntheticAdminDisputeTenantEmail(input.runId);
    const propertyName = syntheticAdminDisputePropertyName(input.runId);
    const rows = await this.executor.query<{ synthetic_user_id: string }>(
      [
        "select tu.user_id as synthetic_user_id",
        "from disputes d",
        "join tenant_users tu on tu.id = d.tenant_user_id",
        "left join users u on u.id = tu.user_id",
        "join reconciliation_snapshots rs on rs.id = d.statement_id",
        "join leases l on l.id = rs.lease_id",
        "join properties p on p.id = rs.property_id",
        "where d.id = $1",
        "and d.organization_id = $2",
        "and d.description = $3",
        "and tu.organization_id = $2",
        "and tu.contact_email = $4",
        "and (u.id is null or (u.organization_id = $2 and u.email = $4 and u.role = 'tenant'))",
        "and p.organization_id = $2",
        "and p.name = $5",
        "and l.property_id = p.id",
        "limit 1",
      ].join(" "),
      [
        input.disputeId,
        input.organizationId,
        input.expectedDescription,
        tenantEmail,
        propertyName,
      ],
    );
    return rows.rows[0] ?? null;
  }

  async deleteSyntheticAdminDisputeFixture(input: {
    disputeId: string;
    organizationId: string;
    runId: string;
    expectedDescription: string;
  }): Promise<DeleteSyntheticAdminDisputeFixtureResult | null> {
    const tenantEmail = syntheticAdminDisputeTenantEmail(input.runId);
    const propertyName = syntheticAdminDisputePropertyName(input.runId);
    const rows = await this.executor.query<{
      dispute_id: string;
      tenant_user_id: string;
      synthetic_user_id: string;
      statement_id: string;
      lease_id: string;
      property_id: string;
    }>(
      [
        "select d.id as dispute_id, d.tenant_user_id, tu.user_id as synthetic_user_id,",
        "d.statement_id, rs.lease_id, rs.property_id",
        "from disputes d",
        "join tenant_users tu on tu.id = d.tenant_user_id",
        "left join users u on u.id = tu.user_id",
        "join reconciliation_snapshots rs on rs.id = d.statement_id",
        "join leases l on l.id = rs.lease_id",
        "join properties p on p.id = rs.property_id",
        "where d.id = $1",
        "and d.organization_id = $2",
        "and d.description = $3",
        "and tu.organization_id = $2",
        "and tu.contact_email = $4",
        "and (u.id is null or (u.organization_id = $2 and u.email = $4 and u.role = 'tenant'))",
        "and p.organization_id = $2",
        "and p.name = $5",
        "and l.property_id = p.id",
        "limit 1",
      ].join(" "),
      [
        input.disputeId,
        input.organizationId,
        input.expectedDescription,
        tenantEmail,
        propertyName,
      ],
    );
    const fixture = rows.rows[0];
    if (!fixture) {
      return null;
    }

    return this.executor.transaction(async (tx) => {
      const attachments = await tx.query<{ id: string }>(
        "delete from dispute_attachments where dispute_id = $1 returning id",
        [fixture.dispute_id],
      );
      const comments = await tx.query<{ id: string }>(
        "delete from dispute_comments where dispute_id = $1 returning id",
        [fixture.dispute_id],
      );
      const disputes = await tx.query<{ id: string }>(
        [
          "delete from disputes",
          "where id = $1",
          "and organization_id = $2",
          "and description = $3",
          "returning id",
        ].join(" "),
        [
          fixture.dispute_id,
          input.organizationId,
          input.expectedDescription,
        ],
      );
      const tenantLeaseLinks = await tx.query<{ tenant_user_id: string }>(
        [
          "delete from tenant_lease_links",
          "where tenant_user_id = $1",
          "and lease_id = $2",
          "returning tenant_user_id",
        ].join(" "),
        [fixture.tenant_user_id, fixture.lease_id],
      );
      const tenantUsers = await tx.query<{ id: string }>(
        [
          "delete from tenant_users",
          "where id = $1",
          "and user_id = $2",
          "and organization_id = $3",
          "and contact_email = $4",
          "returning id",
        ].join(" "),
        [
          fixture.tenant_user_id,
          fixture.synthetic_user_id,
          input.organizationId,
          tenantEmail,
        ],
      );
      const users = await tx.query<{ id: string }>(
        [
          "delete from users",
          "where id = $1",
          "and organization_id = $2",
          "and email = $3",
          "and role = 'tenant'",
          "returning id",
        ].join(" "),
        [fixture.synthetic_user_id, input.organizationId, tenantEmail],
      );
      const snapshots = await tx.query<{ id: string }>(
        [
          "delete from reconciliation_snapshots",
          "where id = $1",
          "and property_id = $2",
          "and lease_id = $3",
          "returning id",
        ].join(" "),
        [fixture.statement_id, fixture.property_id, fixture.lease_id],
      );
      const leases = await tx.query<{ id: string }>(
        [
          "delete from leases",
          "where id = $1",
          "and property_id = $2",
          "returning id",
        ].join(" "),
        [fixture.lease_id, fixture.property_id],
      );
      const properties = await tx.query<{ id: string }>(
        [
          "delete from properties",
          "where id = $1",
          "and organization_id = $2",
          "and name = $3",
          "returning id",
        ].join(" "),
        [fixture.property_id, input.organizationId, propertyName],
      );

      if (
        disputes.rows.length === 0 ||
        tenantUsers.rows.length === 0 ||
        snapshots.rows.length === 0 ||
        leases.rows.length === 0 ||
        properties.rows.length === 0
      ) {
        return null;
      }

      return {
        synthetic_user_id: fixture.synthetic_user_id,
        dispute_attachments: attachments.rows.length,
        dispute_comments: comments.rows.length,
        disputes: disputes.rows.length,
        tenant_lease_links: tenantLeaseLinks.rows.length,
        tenant_users: tenantUsers.rows.length,
        users: users.rows.length,
        reconciliation_snapshots: snapshots.rows.length,
        leases: leases.rows.length,
        properties: properties.rows.length,
      };
    });
  }

  async deleteSyntheticAdminDisputeFixtureResidue(input: {
    organizationId: string;
    runId: string;
  }): Promise<DeleteSyntheticAdminDisputeFixtureResidueResult | null> {
    const tenantEmail = syntheticAdminDisputeTenantEmail(input.runId);
    const propertyName = syntheticAdminDisputePropertyName(input.runId);
    const authSignupOrganizationName =
      `[PROD-TEST] Admin dispute auth signup ${input.runId}`;
    const rows = await this.executor.query<{
      property_id: string;
      lease_id: string;
      statement_id: string | null;
      tenant_user_id: string | null;
      synthetic_user_id: string | null;
      dispute_id: string | null;
    }>(
      [
        "select p.id as property_id, l.id as lease_id, rs.id as statement_id,",
        "tu.id as tenant_user_id, tu.user_id as synthetic_user_id, d.id as dispute_id",
        "from properties p",
        "join leases l on l.property_id = p.id",
        "left join reconciliation_snapshots rs on rs.property_id = p.id and rs.lease_id = l.id",
        "left join disputes d on d.statement_id = rs.id and d.organization_id = p.organization_id",
        "and d.description = $3",
        "left join tenant_users tu on tu.id = d.tenant_user_id or",
        "(tu.organization_id = p.organization_id and tu.contact_email = $4)",
        "where p.organization_id = $1",
        "and p.name = $2",
        "and l.property_id = p.id",
        "limit 1",
      ].join(" "),
      [
        input.organizationId,
        propertyName,
        syntheticAdminDisputeDescription(input.runId),
        tenantEmail,
      ],
    );
    const fixture = rows.rows[0];
    if (!fixture) {
      return null;
    }

    return this.executor.transaction(async (tx) => {
      const attachments = fixture.dispute_id
        ? await tx.query<{ id: string }>(
            "delete from dispute_attachments where dispute_id = $1 returning id",
            [fixture.dispute_id],
          )
        : { rows: [] };
      const comments = fixture.dispute_id
        ? await tx.query<{ id: string }>(
            "delete from dispute_comments where dispute_id = $1 returning id",
            [fixture.dispute_id],
          )
        : { rows: [] };
      const disputes = await tx.query<{ id: string }>(
        [
          "delete from disputes",
          "where organization_id = $1",
          "and description = $2",
          "returning id",
        ].join(" "),
        [input.organizationId, syntheticAdminDisputeDescription(input.runId)],
      );
      const tenantLeaseLinks = fixture.tenant_user_id
        ? await tx.query<{ tenant_user_id: string }>(
            [
              "delete from tenant_lease_links",
              "where tenant_user_id = $1",
              "and lease_id = $2",
              "returning tenant_user_id",
            ].join(" "),
            [fixture.tenant_user_id, fixture.lease_id],
          )
        : { rows: [] };
      const tenantUsers = await tx.query<{ id: string }>(
        [
          "delete from tenant_users",
          "where organization_id = $1",
          "and contact_email = $2",
          "returning id",
        ].join(" "),
        [input.organizationId, tenantEmail],
      );
      const users = await tx.query<{ id: string }>(
        [
          "delete from users",
          "where organization_id = $1",
          "and email = $2",
          "and role = 'tenant'",
          "returning id",
        ].join(" "),
        [input.organizationId, tenantEmail],
      );
      const snapshots = await tx.query<{ id: string }>(
        [
          "delete from reconciliation_snapshots",
          "where property_id = $1",
          "and lease_id = $2",
          "returning id",
        ].join(" "),
        [fixture.property_id, fixture.lease_id],
      );
      const leases = await tx.query<{ id: string }>(
        [
          "delete from leases",
          "where id = $1",
          "and property_id = $2",
          "returning id",
        ].join(" "),
        [fixture.lease_id, fixture.property_id],
      );
      const properties = await tx.query<{ id: string }>(
        [
          "delete from properties",
          "where id = $1",
          "and organization_id = $2",
          "and name = $3",
          "returning id",
        ].join(" "),
        [fixture.property_id, input.organizationId, propertyName],
      );
      const authOrgs = await tx.query<{ id: string }>(
        [
          "select o.id",
          "from organizations o",
          "left join users u on u.organization_id = o.id",
          "where o.name = $1",
          "and (u.email = $2 or u.id is null)",
        ].join(" "),
        [authSignupOrganizationName, tenantEmail],
      );
      const authOrganizationIds = authOrgs.rows.map((row) => row.id);
      const authUsers =
        authOrganizationIds.length > 0
          ? await tx.query<{ id: string }>(
              [
                "delete from users",
                "where email = $1",
                "and organization_id = any($2::uuid[])",
                "returning id",
              ].join(" "),
              [tenantEmail, authOrganizationIds],
            )
          : { rows: [] };
      const authOrganizations =
        authOrganizationIds.length > 0
          ? await tx.query<{ id: string }>(
              [
                "delete from organizations",
                "where id = any($1::uuid[])",
                "and name = $2",
                "and not exists (select 1 from users where organization_id = organizations.id)",
                "returning id",
              ].join(" "),
              [authOrganizationIds, authSignupOrganizationName],
            )
          : { rows: [] };

      if (leases.rows.length === 0 || properties.rows.length === 0) {
        return null;
      }

      return {
        dispute_attachments: attachments.rows.length,
        dispute_comments: comments.rows.length,
        disputes: disputes.rows.length,
        tenant_lease_links: tenantLeaseLinks.rows.length,
        tenant_users: tenantUsers.rows.length,
        users: users.rows.length,
        reconciliation_snapshots: snapshots.rows.length,
        leases: leases.rows.length,
        properties: properties.rows.length,
        auth_signup_users: authUsers.rows.length,
        auth_signup_organizations: authOrganizations.rows.length,
      };
    });
  }

  async deleteSyntheticAdminAuthSignupResidue(input: {
    tenantEmail: string;
    authSignupOrganizationName: string;
  }): Promise<{ users: number; organizations: number }> {
    return this.executor.transaction(async (tx) => {
      const orgs = await tx.query<{ id: string }>(
        [
          "select o.id",
          "from organizations o",
          "left join users u on u.organization_id = o.id",
          "where o.name = $1",
          "and (u.email = $2 or u.id is null)",
        ].join(" "),
        [input.authSignupOrganizationName, input.tenantEmail],
      );
      const organizationIds = orgs.rows.map((row) => row.id);
      if (organizationIds.length === 0) {
        return { users: 0, organizations: 0 };
      }
      const users = await tx.query<{ id: string }>(
        [
          "delete from users",
          "where email = $1",
          "and organization_id = any($2::uuid[])",
          "returning id",
        ].join(" "),
        [input.tenantEmail, organizationIds],
      );
      const organizations = await tx.query<{ id: string }>(
        [
          "delete from organizations",
          "where id = any($1::uuid[])",
          "and name = $2",
          "and not exists (select 1 from users where organization_id = organizations.id)",
          "returning id",
        ].join(" "),
        [organizationIds, input.authSignupOrganizationName],
      );
      return {
        users: users.rows.length,
        organizations: organizations.rows.length,
      };
    });
  }

  private async hasPurchasedCredits(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<ExistsRow>(
      [
        "select exists (",
        "select 1 from audit_credits",
        "where organization_id = $1",
        "and credits_purchased > 0",
        ")",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0]?.exists === true;
  }
}

function effectiveSubscriptionStatus(row: SubscriptionEntitlementRow): string {
  if (
    row.status !== "trialing" ||
    row.stripeSubscriptionId ||
    !row.currentPeriodEnd
  ) {
    return row.status;
  }

  const periodEnd =
    row.currentPeriodEnd instanceof Date
      ? row.currentPeriodEnd
      : new Date(row.currentPeriodEnd);

  if (Number.isNaN(periodEnd.getTime())) {
    return row.status;
  }

  return periodEnd.getTime() < Date.now() ? "paused" : row.status;
}

function syntheticAdminDisputeTenantEmail(runId: string): string {
  return `prodtest+admin-dispute-${runId.toLowerCase()}@capveri.com`;
}

function syntheticAdminDisputeDescription(runId: string): string {
  return (
    `[PROD-TEST] Admin dispute lifecycle prod_e2e_run_id=${runId}. ` +
    "Synthetic admin-visible dispute for production cleanup verification."
  );
}

function syntheticAdminDisputePropertyName(runId: string): string {
  return `[PROD-TEST] Admin dispute lifecycle ${runId}`;
}

function requireReturnedId(row: { id: string } | undefined, label: string): string {
  if (!row) {
    throw new Error(`Failed to create synthetic admin dispute ${label}`);
  }
  return row.id;
}
