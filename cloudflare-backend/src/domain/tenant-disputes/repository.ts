export type DisputeCategory =
  | "calculation_error"
  | "missing_credit"
  | "incorrect_area"
  | "base_year_issue"
  | "billing_question"
  | "other";

export type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved"
  | "rejected"
  | "closed";

export type DisputeSummary = {
  id: string;
  statement_id: string;
  category: DisputeCategory;
  status: DisputeStatus;
  description: string;
  created_at: string;
};

export type DisputeComment = {
  id: string;
  dispute_id: string;
  author_id: string;
  author_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
};

export type DisputeAttachment = {
  id: string;
  filename: string;
  file_url: string;
  file_size_bytes: number;
  content_type: string;
  created_at: string;
};

export type DisputeDetail = {
  id: string;
  statement_id: string;
  category: DisputeCategory;
  status: DisputeStatus;
  description: string;
  created_at: string;
  comments: DisputeComment[];
  attachments: DisputeAttachment[];
};

export type CreateDisputeInput = {
  tenantUserId: string;
  /** FK to users(id) — written to dispute_comments.author_id for the initial comment. */
  authorUserId: string;
  organizationId: string;
  statementId: string;
  category: DisputeCategory;
  description: string;
  now: string;
};

export type ListDisputesInput = {
  tenantUserId: string;
  status?: DisputeStatus;
  skip: number;
  limit: number;
};

export type AddCommentInput = {
  disputeId: string;
  tenantUserId: string;
  authorId: string;
  authorName: string;
  content: string;
  now: string;
};

export type AddAttachmentInput = {
  disputeId: string;
  tenantUserId: string;
  /** FK to users(id) — the authenticated user who uploaded the file. */
  uploadedBy: string;
  filename: string;
  storagePath: string;
  fileSize: number;
  mimeType: string;
  now: string;
};

export type StatementPdfContext = {
  snapshot: {
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
    calculation_trace: CalculationTraceStep[];
  };
  lease: {
    tenant_name: string;
  };
  property: {
    name: string;
    address: string;
  };
  organization: {
    name: string;
  };
};

export type CalculationTraceStep = {
  step_name: string;
  operation: string | null;
  output_value: unknown;
  output_unit: string | null;
  note: string | null;
};

// ── Admin-side types ──────────────────────────────────────────────────────────

export type AdminDisputeSummary = {
  id: string;
  statement_id: string;
  category: DisputeCategory;
  status: DisputeStatus;
  description: string;
  created_at: string;
};

export type AdminDisputeDetail = {
  id: string;
  tenant_user_id: string;
  statement_id: string;
  organization_id: string;
  category: DisputeCategory;
  status: DisputeStatus;
  description: string;
  assigned_to: string | null;
  resolution_summary: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  comments: AdminDisputeComment[];
  attachments: AdminDisputeAttachment[];
};

export type AdminDisputeComment = {
  id: string;
  dispute_id: string;
  author_id: string;
  author_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
};

export type AdminDisputeAttachment = {
  id: string;
  filename: string;
  file_url: string;
  file_size_bytes: number;
  content_type: string;
  created_at: string;
};

export type ListDisputesForOrgInput = {
  organizationId: string;
  status?: DisputeStatus;
  skip: number;
  limit: number;
};

export type UpdateDisputeStatusInput = {
  disputeId: string;
  organizationId: string;
  newStatus: DisputeStatus;
  // The status the caller validated the transition against. The UPDATE is
  // guarded on it (optimistic concurrency) so two admins transitioning the same
  // dispute concurrently can't both win and last-writer-clobber the resolution
  // metadata — the loser's UPDATE matches no row and returns null.
  expectedStatus: DisputeStatus;
  resolutionSummary: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

export type AddAdminCommentInput = {
  disputeId: string;
  organizationId: string;
  authorId: string;
  authorName: string;
  content: string;
  isInternal: boolean;
  now: string;
};

export type DeleteSyntheticDisputeInput = {
  disputeId: string;
  organizationId: string;
  expectedDescription: string;
};

export type DeleteSyntheticDisputeResult = {
  dispute_attachments: number;
  dispute_comments: number;
  disputes: number;
};

export type CreateSyntheticAdminDisputeFixtureInput = {
  organizationId: string;
  actorUserId: string;
  syntheticUserId: string;
  tenantEmail: string;
  authSignupOrganizationName: string;
  runId: string;
  description: string;
  now: string;
};

export type SyntheticAdminDisputeFixture = {
  property_id: string;
  lease_id: string;
  statement_id: string;
  synthetic_user_id: string;
  tenant_user_id: string;
  dispute_id: string;
  description: string;
  tenant_email: string;
};

export type DeleteSyntheticAdminDisputeFixtureResult =
  DeleteSyntheticDisputeResult & {
    synthetic_user_id: string;
    tenant_lease_links: number;
    tenant_users: number;
    users: number;
    reconciliation_snapshots: number;
    leases: number;
    properties: number;
  };

export type SyntheticAdminDisputeFixtureCleanupTarget = {
  synthetic_user_id: string;
};

export type DeleteSyntheticAdminDisputeFixtureResidueResult = {
  dispute_attachments: number;
  dispute_comments: number;
  disputes: number;
  tenant_lease_links: number;
  tenant_users: number;
  users: number;
  reconciliation_snapshots: number;
  leases: number;
  properties: number;
  auth_signup_users: number;
  auth_signup_organizations: number;
};

export type DeleteSyntheticTenantDisputeInput = {
  disputeId: string;
  tenantUserId: string;
  expectedDescription: string;
};

export type AdminDisputesRepository = {
  /**
   * Check whether the organization has an active subscription or trial.
   * Used to gate write endpoints behind 402 (mirrors require_full_access in FastAPI).
   */
  hasFullAccess(organizationId: string): Promise<boolean>;

  /**
   * List all disputes for an organization (admin view), ordered newest first.
   */
  listDisputesForOrg(
    input: ListDisputesForOrgInput,
  ): Promise<AdminDisputeSummary[]>;

  /**
   * Get full dispute detail for an admin. Includes ALL comments (internal + public).
   * Returns null if dispute does not belong to the organization.
   */
  getDisputeForAdmin(input: {
    disputeId: string;
    organizationId: string;
  }): Promise<AdminDisputeDetail | null>;

  /**
   * Update dispute status (org-scoped). Returns the updated summary row, or null
   * if the dispute is not found within the organization.
   */
  updateDisputeStatus(
    input: UpdateDisputeStatusInput,
  ): Promise<AdminDisputeSummary | null>;

  /**
   * Add a comment to a dispute (admin can set is_internal). Returns null if
   * the dispute does not belong to the organization.
   */
  addAdminComment(
    input: AddAdminCommentInput,
  ): Promise<AdminDisputeComment | null>;

  /**
   * Verify an attachment belongs to a dispute owned by this organization and
   * return the R2 storage path + metadata needed to stream it. Returns null if
   * not found / cross-org.
   */
  getAttachmentForOrgDownload(input: {
    disputeId: string;
    attachmentId: string;
    organizationId: string;
  }): Promise<{
    storagePath: string;
    filename: string;
    mimeType: string;
  } | null>;

  /**
   * Delete a verified synthetic E2E dispute after attachment objects have been
   * removed from R2. The route must validate the synthetic marker first.
   */
  deleteSyntheticDispute(
    input: DeleteSyntheticDisputeInput,
  ): Promise<DeleteSyntheticDisputeResult | null>;

  /**
   * Create a marked, fully synthetic admin-visible dispute fixture for prod E2E.
   * This is admin/full-access route only and must be paired with cleanup.
   */
  createSyntheticAdminDisputeFixture(
    input: CreateSyntheticAdminDisputeFixtureInput,
  ): Promise<SyntheticAdminDisputeFixture>;

  getSyntheticAdminDisputeFixtureCleanupTarget(input: {
    disputeId: string;
    organizationId: string;
    runId: string;
    expectedDescription: string;
  }): Promise<SyntheticAdminDisputeFixtureCleanupTarget | null>;

  /**
   * Delete a marked synthetic admin dispute fixture and every row it created.
   */
  deleteSyntheticAdminDisputeFixture(input: {
    disputeId: string;
    organizationId: string;
    runId: string;
    expectedDescription: string;
  }): Promise<DeleteSyntheticAdminDisputeFixtureResult | null>;

  deleteSyntheticAdminDisputeFixtureResidue(input: {
    organizationId: string;
    runId: string;
  }): Promise<DeleteSyntheticAdminDisputeFixtureResidueResult | null>;

  deleteSyntheticAdminAuthSignupResidue(input: {
    tenantEmail: string;
    authSignupOrganizationName: string;
  }): Promise<{ users: number; organizations: number }>;
};

export type TenantDisputesRepository = {
  /**
   * Count disputes created by this tenant in the last 24 hours (rate-limit check).
   */
  countRecentDisputesForTenant(input: {
    tenantUserId: string;
    since: string;
  }): Promise<number>;

  /**
   * Verify that a statement exists, is finalized, and belongs to a lease linked
   * to this tenant. Returns "ok", "not_found", or "not_linked".
   */
  verifyStatementForTenant(input: {
    statementId: string;
    tenantUserId: string;
    organizationId: string;
  }): Promise<"ok" | "not_found" | "not_linked">;

  /**
   * Create a new dispute + initial comment in a single transaction.
   */
  createDispute(input: CreateDisputeInput): Promise<DisputeSummary>;

  /**
   * List disputes for a tenant with optional status filter.
   */
  listDisputes(input: ListDisputesInput): Promise<DisputeSummary[]>;

  /**
   * Get full dispute detail (comments + attachments). Returns null if not found
   * or not owned by this tenant.
   */
  getDispute(input: {
    disputeId: string;
    tenantUserId: string;
  }): Promise<DisputeDetail | null>;

  /**
   * Add a comment to a dispute owned by this tenant. Returns null if dispute
   * not found/not owned.
   */
  addComment(input: AddCommentInput): Promise<DisputeComment | null>;

  /**
   * Record an attachment row after R2 upload. Returns null if dispute not found/not owned.
   */
  addAttachment(input: AddAttachmentInput): Promise<DisputeAttachment | null>;

  /**
   * Verify an attachment belongs to a dispute owned by this tenant, and return
   * the R2 storage path + metadata needed to stream it. Returns null if not found.
   */
  getAttachmentForDownload(input: {
    disputeId: string;
    attachmentId: string;
    tenantUserId: string;
  }): Promise<{
    storagePath: string;
    filename: string;
    mimeType: string;
  } | null>;

  /**
   * Delete a verified synthetic E2E dispute owned by this tenant after
   * attachment objects have been removed from R2.
   */
  deleteSyntheticTenantDispute(
    input: DeleteSyntheticTenantDisputeInput,
  ): Promise<DeleteSyntheticDisputeResult | null>;

  /**
   * Load the full context needed to generate a statement PDF. Returns null if not
   * found, not finalized, or not linked to this tenant.
   */
  getStatementPdfContext(input: {
    statementId: string;
    tenantUserId: string;
    organizationId: string;
  }): Promise<StatementPdfContext | null>;
};
