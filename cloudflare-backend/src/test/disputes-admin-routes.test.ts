/**
 * Admin disputes route tests.
 *
 * Uses an in-memory repository and fake auth to avoid real I/O.
 *
 * Coverage:
 *   GET /disputes
 *     - 200 list with status filter, pagination, order, empty result
 *     - 401 unauthenticated
 *     - 403 non-landlord (tenant party)
 *     - invalid status → 400 validation_error
 *   GET /disputes/:disputeId
 *     - 200 with internal comments visible + attachments with presigned URL
 *     - presign fallback: raw storage_path returned when presign throws
 *     - 404 cross-org (dispute not in caller's org)
 *     - 401 unauthenticated
 *   PUT /disputes/:disputeId/status
 *     - 200 for each valid transition: open→under_review, open→rejected,
 *       under_review→resolved, under_review→rejected, resolved→closed, rejected→closed
 *     - 400 invalid transition (exact detail string)
 *     - 400 resolved without resolution_summary
 *     - 400 rejected without resolution_summary
 *     - sets resolved_at/resolved_by on resolved
 *     - sets resolved_at/resolved_by on rejected
 *     - 402 no full-access (subscription_required before admin check)
 *     - 403 non-admin role (member)
 *     - 404 cross-org
 *     - 401 unauthenticated
 *   POST /disputes/:disputeId/comments
 *     - 201 is_internal=true allowed for admins
 *     - 201 is_internal=false (default)
 *     - 201 sets author_id = actor.userId, author_name = user.fullName
 *     - 201 author_name falls back to email when fullName is null
 *     - 400 empty content (min length)
 *     - 400 content exceeds 5000 chars (max length)
 *     - 402 no full-access
 *     - 403 non-admin role
 *     - 404 cross-org
 *     - 401 unauthenticated
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { ActorRole } from "../adapters/db/transaction";
import type {
  AddAdminCommentInput,
  AdminDisputeAttachment,
  AdminDisputeComment,
  AdminDisputeDetail,
  AdminDisputeSummary,
  AdminDisputesRepository,
  CreateSyntheticAdminDisputeFixtureInput,
  DeleteSyntheticAdminDisputeFixtureResidueResult,
  DeleteSyntheticDisputeInput,
  DeleteSyntheticAdminDisputeFixtureResult,
  DeleteSyntheticDisputeResult,
  ListDisputesForOrgInput,
  SyntheticAdminDisputeFixture,
  SyntheticAdminDisputeFixtureCleanupTarget,
  UpdateDisputeStatusInput,
} from "../domain/tenant-disputes/repository";
import type { DisputeAttachmentStorage } from "../adapters/storage/dispute-attachments";
import type { AppEnv } from "../env";
import { createDisputesAdminRoutes } from "../http/disputes-admin-routes";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DISPUTE_ID = "55555555-5555-4555-8555-555555555555";
const STATEMENT_ID = "44444444-4444-4444-8444-444444444444";
const COMMENT_ID = "cc000000-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "aa000000-0000-4000-8000-000000000001";
const PROPERTY_ID = "77000000-0000-4000-8000-000000000001";
const LEASE_ID = "88000000-0000-4000-8000-000000000001";
const TENANT_USER_ID = "99000000-0000-4000-8000-000000000001";
const SYNTHETIC_AUTH_USER_ID = "aa100000-0000-4000-8000-000000000001";

const FIXED_NOW = "2026-06-13T00:00:00.000Z";
const SYNTHETIC_DESCRIPTION =
  "[PROD-TEST] Tenant dispute lifecycle prod_e2e_run_id=run-12345678. " +
  "Synthetic dispute for production cleanup verification.";
const SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION =
  "[PROD-TEST] Tenant statement dispute handoff prod_e2e_run_id=run-12345678. " +
  "Synthetic dispute created after downloading its tenant statement PDF.";
const LEGACY_SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION =
  "[PROD-TEST] Tenant statement dispute handoff prod_e2e_run_id=run-12345678. " +
  `Synthetic dispute created from statement ${STATEMENT_ID} after downloading its tenant PDF.`;
const SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION =
  "[PROD-TEST] Admin dispute lifecycle prod_e2e_run_id=run-12345678. " +
  "Synthetic admin-visible dispute for production cleanup verification.";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSummary(
  overrides: Partial<AdminDisputeSummary> = {},
): AdminDisputeSummary {
  return {
    id: DISPUTE_ID,
    statement_id: STATEMENT_ID,
    category: "calculation_error",
    status: "open",
    description: "Test dispute",
    created_at: FIXED_NOW,
    ...overrides,
  };
}

function makeDetail(
  overrides: Partial<AdminDisputeDetail> = {},
): AdminDisputeDetail {
  return {
    id: DISPUTE_ID,
    tenant_user_id: "tu000000-0000-4000-8000-000000000001",
    statement_id: STATEMENT_ID,
    organization_id: ORG_ID,
    category: "calculation_error",
    status: "open",
    description: "Test dispute",
    assigned_to: null,
    resolution_summary: null,
    resolved_at: null,
    resolved_by: null,
    created_at: FIXED_NOW,
    updated_at: FIXED_NOW,
    comments: [],
    attachments: [],
    ...overrides,
  };
}

// ── In-memory repository ──────────────────────────────────────────────────────

class MemoryAdminDisputesRepository implements AdminDisputesRepository {
  hasFullAccessResult = true;
  summaries: AdminDisputeSummary[] = [makeSummary()];
  detail: AdminDisputeDetail | null = makeDetail();
  updatedSummary: AdminDisputeSummary | null = null;
  // When true, updateDisputeStatus returns null even for a matching dispute,
  // simulating the optimistic-concurrency WHERE status = expectedStatus guard
  // matching no row (a concurrent admin already transitioned it).
  simulateStatusConflict = false;
  addedComment: AdminDisputeComment | null = null;

  lastListInput: ListDisputesForOrgInput | null = null;
  lastUpdateInput: UpdateDisputeStatusInput | null = null;
  lastCommentInput: AddAdminCommentInput | null = null;
  lastCreateFixtureInput: CreateSyntheticAdminDisputeFixtureInput | null = null;
  lastDeleteFixtureResidueInput: {
    organizationId: string;
    runId: string;
  } | null = null;
  lastDeleteInput: DeleteSyntheticDisputeInput | null = null;
  lastDeleteFixtureInput: {
    disputeId: string;
    organizationId: string;
    runId: string;
    expectedDescription: string;
  } | null = null;
  deleteResult: DeleteSyntheticDisputeResult | null = {
    dispute_attachments: 1,
    dispute_comments: 2,
    disputes: 1,
  };
  deleteFixtureResult: DeleteSyntheticAdminDisputeFixtureResult | null = {
    synthetic_user_id: SYNTHETIC_AUTH_USER_ID,
    dispute_attachments: 0,
    dispute_comments: 3,
    disputes: 1,
    tenant_lease_links: 1,
    tenant_users: 1,
    users: 1,
    reconciliation_snapshots: 1,
    leases: 1,
    properties: 1,
  };

  async hasFullAccess(): Promise<boolean> {
    return this.hasFullAccessResult;
  }

  async listDisputesForOrg(
    input: ListDisputesForOrgInput,
  ): Promise<AdminDisputeSummary[]> {
    this.lastListInput = input;
    return this.summaries
      .filter((d) => !input.status || d.status === input.status)
      .slice(input.skip, input.skip + input.limit);
  }

  async getDisputeForAdmin(input: {
    disputeId: string;
    organizationId: string;
  }): Promise<AdminDisputeDetail | null> {
    if (input.disputeId !== DISPUTE_ID || input.organizationId !== ORG_ID) {
      return null;
    }
    return this.detail;
  }

  async updateDisputeStatus(
    input: UpdateDisputeStatusInput,
  ): Promise<AdminDisputeSummary | null> {
    this.lastUpdateInput = input;
    if (input.disputeId !== DISPUTE_ID || input.organizationId !== ORG_ID) {
      return null;
    }
    if (this.simulateStatusConflict) {
      return null;
    }
    return this.updatedSummary ?? makeSummary({ status: input.newStatus });
  }

  async addAdminComment(
    input: AddAdminCommentInput,
  ): Promise<AdminDisputeComment | null> {
    this.lastCommentInput = input;
    if (input.disputeId !== DISPUTE_ID || input.organizationId !== ORG_ID) {
      return null;
    }
    return (
      this.addedComment ?? {
        id: COMMENT_ID,
        dispute_id: input.disputeId,
        author_id: input.authorId,
        author_name: input.authorName,
        content: input.content,
        is_internal: input.isInternal,
        created_at: input.now,
      }
    );
  }

  attachmentMeta: {
    storagePath: string;
    filename: string;
    mimeType: string;
  } | null = {
    storagePath: "orgs/disputes/uuid/invoice.pdf",
    filename: "invoice.pdf",
    mimeType: "application/pdf",
  };

  async getAttachmentForOrgDownload(input: {
    disputeId: string;
    attachmentId: string;
    organizationId: string;
  }): Promise<{
    storagePath: string;
    filename: string;
    mimeType: string;
  } | null> {
    if (input.organizationId !== ORG_ID) {
      return null;
    }
    return this.attachmentMeta;
  }

  async createSyntheticAdminDisputeFixture(
    input: CreateSyntheticAdminDisputeFixtureInput,
  ): Promise<SyntheticAdminDisputeFixture> {
    this.lastCreateFixtureInput = input;
    return {
      property_id: PROPERTY_ID,
      lease_id: LEASE_ID,
      statement_id: STATEMENT_ID,
      synthetic_user_id: input.syntheticUserId,
      tenant_user_id: TENANT_USER_ID,
      dispute_id: DISPUTE_ID,
      description: input.description,
      tenant_email: `prodtest+admin-dispute-${input.runId}@capveri.com`,
    };
  }

  async deleteSyntheticDispute(
    input: DeleteSyntheticDisputeInput,
  ): Promise<DeleteSyntheticDisputeResult | null> {
    this.lastDeleteInput = input;
    if (
      input.disputeId !== DISPUTE_ID ||
      input.organizationId !== ORG_ID ||
      input.expectedDescription !== this.detail?.description
    ) {
      return null;
    }
    return this.deleteResult;
  }

  async getSyntheticAdminDisputeFixtureCleanupTarget(input: {
    disputeId: string;
    organizationId: string;
    runId: string;
    expectedDescription: string;
  }): Promise<SyntheticAdminDisputeFixtureCleanupTarget | null> {
    if (
      input.disputeId !== DISPUTE_ID ||
      input.organizationId !== ORG_ID ||
      input.expectedDescription !== this.detail?.description
    ) {
      return null;
    }
    return { synthetic_user_id: SYNTHETIC_AUTH_USER_ID };
  }

  async deleteSyntheticAdminDisputeFixture(input: {
    disputeId: string;
    organizationId: string;
    runId: string;
    expectedDescription: string;
  }): Promise<DeleteSyntheticAdminDisputeFixtureResult | null> {
    this.lastDeleteFixtureInput = input;
    if (
      input.disputeId !== DISPUTE_ID ||
      input.organizationId !== ORG_ID ||
      input.expectedDescription !== this.detail?.description
    ) {
      return null;
    }
    return this.deleteFixtureResult;
  }

  async deleteSyntheticAdminDisputeFixtureResidue(input: {
    organizationId: string;
    runId: string;
  }): Promise<DeleteSyntheticAdminDisputeFixtureResidueResult | null> {
    this.lastDeleteFixtureResidueInput = input;
    if (input.organizationId !== ORG_ID) {
      return null;
    }
    return {
      dispute_attachments: 0,
      dispute_comments: 0,
      disputes: 0,
      tenant_lease_links: 1,
      tenant_users: 1,
      users: 0,
      reconciliation_snapshots: 1,
      leases: 1,
      properties: 1,
      auth_signup_users: 0,
      auth_signup_organizations: 1,
    };
  }

  async deleteSyntheticAdminAuthSignupResidue(): Promise<{
    users: number;
    organizations: number;
  }> {
    return { users: 1, organizations: 1 };
  }
}

// ── In-memory storage fake ────────────────────────────────────────────────────

class MemoryAdminStorage implements DisputeAttachmentStorage {
  bytesByPath = new Map<string, Uint8Array>();
  deletedKeys: string[] = [];

  generateKey(input: {
    organizationId: string;
    disputeId: string;
    filename: string;
  }): string {
    return `${input.organizationId}/disputes/${input.disputeId}/${input.filename}`;
  }

  validateContentType(contentType: string): boolean {
    return ["application/pdf", "image/jpeg", "image/png"].includes(contentType);
  }

  validateFileSize(size: number): boolean {
    return size <= 10 * 1024 * 1024;
  }

  async putAttachment(): Promise<void> {
    // not needed for admin tests
  }

  async getAttachmentBytes(key: string): Promise<Uint8Array | undefined> {
    return this.bytesByPath.get(key);
  }

  async deleteAttachment(key: string): Promise<void> {
    this.deletedKeys.push(key);
  }
}

// ── Shared infrastructure ─────────────────────────────────────────────────────

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

function makeAttachment(storagePath: string): AdminDisputeAttachment {
  return {
    id: ATTACHMENT_ID,
    filename: "invoice.pdf",
    file_url: storagePath,
    file_size_bytes: 1024,
    content_type: "application/pdf",
    created_at: FIXED_NOW,
  };
}

function createTestApp(
  options: {
    role?: ActorRole;
    party?: "landlord" | "tenant";
    fullName?: string | null;
    hasFullAccess?: boolean;
    storage?: DisputeAttachmentStorage;
    repository?: MemoryAdminDisputesRepository;
    failAuthDelete?: boolean;
    authDeleteErrorMessage?: string;
  } = {},
): {
  app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>;
  repository: MemoryAdminDisputesRepository;
  storage: MemoryAdminStorage;
} {
  const repository = options.repository ?? new MemoryAdminDisputesRepository();
  if (options.hasFullAccess !== undefined) {
    repository.hasFullAccessResult = options.hasFullAccess;
  }
  const storage =
    (options.storage as MemoryAdminStorage | undefined) ??
    new MemoryAdminStorage();
  const deletedAuthUsers: string[] = [];

  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createDisputesAdminRoutes({
      repository,
      storage,
      authClient: {
        async createUser(input) {
          return { id: SYNTHETIC_AUTH_USER_ID, email: input.email };
        },
        async deleteUser(userId) {
          if (options.failAuthDelete) {
            throw new Error(
              options.authDeleteErrorMessage ?? "synthetic auth delete failed",
            );
          }
          deletedAuthUsers.push(userId);
        },
      },
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository({
            role: options.role ?? "admin",
            party: options.party ?? "landlord",
            fullName:
              options.fullName !== undefined ? options.fullName : "Admin User",
          }),
          protectedRecords,
        },
      },
    }),
  );
  (repository as MemoryAdminDisputesRepository & {
    deletedAuthUsers?: string[];
  }).deletedAuthUsers = deletedAuthUsers;
  return { app, repository, storage };
}

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer valid-token" };
}

function jsonAuthHeaders(): Record<string, string> {
  return {
    ...authHeaders(),
    "Content-Type": "application/json",
    "x-capveri-e2e-secret": "test-e2e-fixture-secret",
  };
}

function jwtVerifier(): JwtVerifier {
  return {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
}

function authRepository(opts: {
  role: ActorRole;
  party: "landlord" | "tenant";
  fullName: string | null;
}): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role: opts.role,
          isServiceAdmin: false,
          party: opts.party,
          bearerToken: "valid-token",
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "admin@example.com",
          fullName: opts.fullName,
          role: opts.role,
          isPlatformAdmin: false,
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
        },
      };
    },
  };
}

function testEnv(): AppEnv {
  return {
    ENVIRONMENT: "development",
    APP_VERSION: "0.1.0",
    DATABASE_URL: "postgres://example",
    PROD_E2E_FIXTURE_SECRET: "test-e2e-fixture-secret",
    PROTECTED_RECORDS: protectedRecords,
  } as unknown as AppEnv;
}

// ── GET /disputes ─────────────────────────────────────────────────────────────

describe("GET /api/v1/disputes", () => {
  it("returns the list of disputes for the org", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/disputes",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect((body as unknown[])[0]).toMatchObject({
      id: DISPUTE_ID,
      status: "open",
    });
  });

  it("returns empty array when no disputes match", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/disputes?status=closed",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("forwards status filter to repository", async () => {
    const { app, repository } = createTestApp();
    repository.summaries = [makeSummary({ status: "under_review" })];

    const response = await app.request(
      "/api/v1/disputes?status=under_review",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(repository.lastListInput?.status).toBe("under_review");
    const body = (await response.json()) as unknown[];
    expect(body).toHaveLength(1);
  });

  it("forwards skip and limit for pagination", async () => {
    const { app, repository } = createTestApp();
    repository.summaries = Array.from({ length: 10 }, (_, i) =>
      makeSummary({ id: `${DISPUTE_ID.slice(0, -1)}${i}` }),
    );

    const response = await app.request(
      "/api/v1/disputes?skip=5&limit=3",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(repository.lastListInput?.skip).toBe(5);
    expect(repository.lastListInput?.limit).toBe(3);
    const body = (await response.json()) as unknown[];
    expect(body).toHaveLength(3);
  });

  it("returns 400 for invalid status value", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/disputes?status=bogus",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(400);
  });

  it("returns 401 when no Authorization header", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/v1/disputes", {}, testEnv());

    expect(response.status).toBe(401);
  });

  it("returns 403 for tenant party", async () => {
    const { app } = createTestApp({ party: "tenant", role: "tenant" });

    const response = await app.request(
      "/api/v1/disputes",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 200 for owner role (any landlord is allowed)", async () => {
    const { app } = createTestApp({ role: "owner" });

    const response = await app.request(
      "/api/v1/disputes",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
  });
});

// ── GET /disputes/:disputeId ───────────────────────────────────────────────────

describe("GET /api/v1/disputes/:disputeId", () => {
  it("returns 200 with detail including internal comments visible", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({
      comments: [
        {
          id: COMMENT_ID,
          dispute_id: DISPUTE_ID,
          author_id: USER_ID,
          author_name: "Admin User",
          content: "Internal note",
          is_internal: true,
          created_at: FIXED_NOW,
        },
      ],
    });

    const response = await app.request(
      `/api/v1/disputes/${DISPUTE_ID}`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      comments: { is_internal: boolean }[];
    };
    // Admin sees is_internal=true comments
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0]?.is_internal).toBe(true);
  });

  it("returns attachments with a Worker-served download route URL (never raw storage_path)", async () => {
    const { app, repository } = createTestApp();
    // Repository emits the streaming route URL (mirrors the real adapter); the
    // route must surface it verbatim and never leak the raw R2 storage_path.
    const routeUrl = `/api/v1/disputes/${DISPUTE_ID}/attachments/${ATTACHMENT_ID}`;
    repository.detail = makeDetail({
      attachments: [makeAttachment(routeUrl)],
    });

    const response = await app.request(
      `/api/v1/disputes/${DISPUTE_ID}`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      attachments: { file_url: string }[];
    };
    expect(body.attachments[0]?.file_url).toBe(routeUrl);
    expect(body.attachments[0]?.file_url).not.toContain("orgs/");
  });

  it("returns 404 when dispute is in a different org", async () => {
    // The dispute exists but the calling org is different — repo returns null for
    // a cross-org lookup.
    const { app, repository } = createTestApp();
    repository.detail = null;

    const response = await app.request(
      `/api/v1/disputes/${DISPUTE_ID}`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toBe("Dispute not found");
  });

  it("returns 401 when unauthenticated", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      `/api/v1/disputes/${DISPUTE_ID}`,
      {},
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});

// ── GET /disputes/:disputeId/attachments/:attachmentId ─────────────────────────

describe("GET /api/v1/disputes/:disputeId/attachments/:attachmentId", () => {
  const url = `/api/v1/disputes/${DISPUTE_ID}/attachments/${ATTACHMENT_ID}`;

  it("streams the attachment bytes with download headers", async () => {
    const storage = new MemoryAdminStorage();
    storage.bytesByPath.set(
      "orgs/disputes/uuid/invoice.pdf",
      new Uint8Array([1, 2, 3, 4]),
    );
    const { app } = createTestApp({ storage });

    const response = await app.request(
      url,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(
      "invoice.pdf",
    );
    const buf = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(buf)).toEqual([1, 2, 3, 4]);
  });

  it("returns 404 when the attachment is in a different org", async () => {
    const repo = new MemoryAdminDisputesRepository();
    repo.attachmentMeta = null; // repo returns null for cross-org / not found
    const { app } = createTestApp({ repository: repo });

    const response = await app.request(
      url,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the R2 object is missing", async () => {
    // Repo finds the row but storage has no bytes for that key.
    const { app } = createTestApp({ storage: new MemoryAdminStorage() });

    const response = await app.request(
      url,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 for tenant party", async () => {
    const { app } = createTestApp({ party: "tenant", role: "tenant" });

    const response = await app.request(
      url,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const { app } = createTestApp();

    const response = await app.request(url, {}, testEnv());

    expect(response.status).toBe(401);
  });
});

// ── PUT /disputes/:disputeId/status ───────────────────────────────────────────

describe("POST /api/v1/disputes/e2e-fixture", () => {
  async function createE2eFixture(
    app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return app.request(
      "/api/v1/disputes/e2e-fixture",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(body),
      },
      testEnv(),
    );
  }

  it("creates a marked synthetic admin dispute fixture for admins", async () => {
    const repo = new MemoryAdminDisputesRepository();
    const { app } = createTestApp({ repository: repo });

    const response = await createE2eFixture(app, {
      run_id: "run-12345678",
      confirm: "create-prod-e2e-admin-dispute",
    });

    expect(response.status).toBe(201);
    expect(repo.lastCreateFixtureInput).toMatchObject({
      organizationId: ORG_ID,
      actorUserId: USER_ID,
      syntheticUserId: SYNTHETIC_AUTH_USER_ID,
      tenantEmail: "prodtest+admin-dispute-run-12345678@capveri.com",
      authSignupOrganizationName:
        "[PROD-TEST] Admin dispute auth signup run-12345678",
      runId: "run-12345678",
      description: SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION,
    });
    const body = (await response.json()) as SyntheticAdminDisputeFixture;
    expect(body).toMatchObject({
      property_id: PROPERTY_ID,
      lease_id: LEASE_ID,
      statement_id: STATEMENT_ID,
      synthetic_user_id: SYNTHETIC_AUTH_USER_ID,
      tenant_user_id: TENANT_USER_ID,
      dispute_id: DISPUTE_ID,
      description: SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION,
    });
  });

  it("returns 404 when the E2E fixture secret header is missing", async () => {
    const repo = new MemoryAdminDisputesRepository();
    const { app } = createTestApp({ repository: repo });

    const response = await app.request(
      "/api/v1/disputes/e2e-fixture",
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_id: "run-12345678",
          confirm: "create-prod-e2e-admin-dispute",
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
    expect(repo.lastCreateFixtureInput).toBeNull();
  });

  it("returns 403 for non-admin users with full access", async () => {
    const { app } = createTestApp({ role: "member" });

    const response = await createE2eFixture(app, {
      run_id: "run-12345678",
      confirm: "create-prod-e2e-admin-dispute",
    });

    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid fixture creation confirmation", async () => {
    const repo = new MemoryAdminDisputesRepository();
    const { app } = createTestApp({ repository: repo });

    const response = await createE2eFixture(app, {
      run_id: "run-12345678",
      confirm: "create-prod-e2e-admin",
    });

    expect(response.status).toBe(400);
    expect(repo.lastCreateFixtureInput).toBeNull();
  });

  it("returns 402 before admin role checks when the org has no full access", async () => {
    const { app } = createTestApp({
      hasFullAccess: false,
      role: "member",
    });

    const response = await createE2eFixture(app, {
      run_id: "run-12345678",
      confirm: "create-prod-e2e-admin-dispute",
    });

    expect(response.status).toBe(402);
  });
});

describe("DELETE /api/v1/disputes/:disputeId/e2e-cleanup", () => {
  async function deleteE2eDispute(
    app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>,
    disputeId: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return app.request(
      `/api/v1/disputes/${disputeId}/e2e-cleanup`,
      {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(body),
      },
      testEnv(),
    );
  }

  it("deletes a matching synthetic dispute after removing attachment objects", async () => {
    const storage = new MemoryAdminStorage();
    const repo = new MemoryAdminDisputesRepository();
    repo.detail = makeDetail({
      description: SYNTHETIC_DESCRIPTION,
      attachments: [
        makeAttachment(
          `/api/v1/disputes/${DISPUTE_ID}/attachments/${ATTACHMENT_ID}`,
        ),
      ],
    });
    repo.attachmentMeta = {
      storagePath: "orgs/disputes/uuid/invoice.pdf",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
    };
    const { app } = createTestApp({ repository: repo, storage });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(200);
    expect(storage.deletedKeys).toEqual(["orgs/disputes/uuid/invoice.pdf"]);
    expect(repo.lastDeleteInput).toEqual({
      disputeId: DISPUTE_ID,
      organizationId: ORG_ID,
      expectedDescription: SYNTHETIC_DESCRIPTION,
    });
    const body = (await response.json()) as {
      attachment_storage_paths: string[];
      deleted: {
        r2_objects: number;
        dispute_attachments: number;
        dispute_comments: number;
        disputes: number;
      };
    };
    expect(body.attachment_storage_paths).toEqual([
      "orgs/disputes/uuid/invoice.pdf",
    ]);
    expect(body.deleted).toMatchObject({
      r2_objects: 1,
      dispute_attachments: 1,
      dispute_comments: 2,
      disputes: 1,
    });
  });

  it("deletes a matching synthetic statement handoff dispute", async () => {
    const storage = new MemoryAdminStorage();
    const repo = new MemoryAdminDisputesRepository();
    repo.detail = makeDetail({
      description: SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION,
    });
    const { app } = createTestApp({ repository: repo, storage });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(200);
    expect(repo.lastDeleteInput).toEqual({
      disputeId: DISPUTE_ID,
      organizationId: ORG_ID,
      expectedDescription: SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION,
    });
  });

  it("deletes the legacy statement-id handoff marker from the failed prod run", async () => {
    const storage = new MemoryAdminStorage();
    const repo = new MemoryAdminDisputesRepository();
    repo.detail = makeDetail({
      description: LEGACY_SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION,
    });
    const { app } = createTestApp({ repository: repo, storage });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(200);
    expect(repo.lastDeleteInput).toEqual({
      disputeId: DISPUTE_ID,
      organizationId: ORG_ID,
      expectedDescription: LEGACY_SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION,
    });
  });

  it("deletes a matching synthetic admin dispute fixture and owned fixture rows", async () => {
    const storage = new MemoryAdminStorage();
    const repo = new MemoryAdminDisputesRepository();
    repo.detail = makeDetail({
      description: SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION,
      comments: [
        {
          id: COMMENT_ID,
          dispute_id: DISPUTE_ID,
          author_id: USER_ID,
          author_name: "Tenant",
          content: SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION,
          is_internal: false,
          created_at: FIXED_NOW,
        },
      ],
      attachments: [],
    });
    const { app } = createTestApp({ repository: repo, storage });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(200);
    expect(storage.deletedKeys).toEqual([]);
    expect(repo.lastDeleteInput).toBeNull();
    expect(repo.lastDeleteFixtureInput).toEqual({
      disputeId: DISPUTE_ID,
      organizationId: ORG_ID,
      runId: "run-12345678",
      expectedDescription: SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION,
    });
    const body = (await response.json()) as {
      deleted: Omit<
        DeleteSyntheticAdminDisputeFixtureResult,
        "synthetic_user_id"
      > & {
        r2_objects: number;
        auth_users: number;
      };
    };
    expect("synthetic_user_id" in body.deleted).toBe(false);
    expect(body.deleted).toMatchObject({
      r2_objects: 0,
      auth_users: 1,
      dispute_attachments: 0,
      dispute_comments: 3,
      disputes: 1,
      tenant_lease_links: 1,
      tenant_users: 1,
      users: 1,
      reconciliation_snapshots: 1,
      leases: 1,
      properties: 1,
    });
  });

  it("does not delete DB fixture rows when synthetic auth deletion fails", async () => {
    const storage = new MemoryAdminStorage();
    const repo = new MemoryAdminDisputesRepository();
    repo.detail = makeDetail({
      description: SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION,
      attachments: [],
    });
    const { app } = createTestApp({
      repository: repo,
      storage,
      failAuthDelete: true,
    });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(500);
    expect(repo.lastDeleteFixtureInput).toBeNull();
  });

  it("continues DB cleanup when synthetic auth user is already deleted", async () => {
    const storage = new MemoryAdminStorage();
    const repo = new MemoryAdminDisputesRepository();
    repo.detail = makeDetail({
      description: SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION,
      attachments: [],
    });
    const { app } = createTestApp({
      repository: repo,
      storage,
      failAuthDelete: true,
      authDeleteErrorMessage: "Supabase Auth user deletion failed: User not found",
    });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(200);
    expect(repo.lastDeleteFixtureInput).toEqual({
      disputeId: DISPUTE_ID,
      organizationId: ORG_ID,
      runId: "run-12345678",
      expectedDescription: SYNTHETIC_ADMIN_DISPUTE_DESCRIPTION,
    });
    const body = (await response.json()) as {
      deleted: { auth_users: number };
    };
    expect(body.deleted.auth_users).toBe(0);
  });

  it("rejects non-synthetic disputes", async () => {
    const storage = new MemoryAdminStorage();
    const repo = new MemoryAdminDisputesRepository();
    const { app } = createTestApp({ repository: repo, storage });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(403);
    expect(storage.deletedKeys).toEqual([]);
    expect(repo.lastDeleteInput).toBeNull();
  });

  it("rejects synthetic disputes when the run id does not match", async () => {
    const repo = new MemoryAdminDisputesRepository();
    repo.detail = makeDetail({
      description: SYNTHETIC_DESCRIPTION,
    });
    const storage = new MemoryAdminStorage();
    const { app } = createTestApp({ repository: repo, storage });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-87654321",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(403);
    expect(storage.deletedKeys).toEqual([]);
    expect(repo.lastDeleteInput).toBeNull();
  });

  it("returns 402 before admin role checks when the org has no full access", async () => {
    const { app } = createTestApp({
      hasFullAccess: false,
      role: "member",
    });

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(402);
  });
});

describe("DELETE /api/v1/disputes/e2e-fixture-residue", () => {
  it("deletes orphaned synthetic admin fixture residue by run id", async () => {
    const repo = new MemoryAdminDisputesRepository();
    const { app } = createTestApp({ repository: repo });

    const response = await app.request(
      "/api/v1/disputes/e2e-fixture-residue",
      {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          run_id: "run-12345678",
          confirm: "delete-prod-e2e-admin-dispute-residue",
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(repo.lastDeleteFixtureResidueInput).toEqual({
      organizationId: ORG_ID,
      runId: "run-12345678",
    });
    const body = (await response.json()) as {
      deleted: DeleteSyntheticAdminDisputeFixtureResidueResult;
    };
    expect(body.deleted).toMatchObject({
      tenant_lease_links: 1,
      tenant_users: 1,
      reconciliation_snapshots: 1,
      leases: 1,
      properties: 1,
    });
  });

  it("returns 404 without the E2E fixture secret header", async () => {
    const repo = new MemoryAdminDisputesRepository();
    const { app } = createTestApp({ repository: repo });

    const response = await app.request(
      "/api/v1/disputes/e2e-fixture-residue",
      {
        method: "DELETE",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_id: "run-12345678",
          confirm: "delete-prod-e2e-admin-dispute-residue",
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
    expect(repo.lastDeleteFixtureResidueInput).toBeNull();
  });
});

describe("PUT /api/v1/disputes/:disputeId/status", () => {
  async function putStatus(
    app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>,
    disputeId: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return app.request(
      `/api/v1/disputes/${disputeId}/status`,
      {
        method: "PUT",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(body),
      },
      testEnv(),
    );
  }

  // Valid transitions — all six edges from the state map
  const happyTransitions: Array<{
    from: string;
    to: string;
    needsSummary: boolean;
  }> = [
    { from: "open", to: "under_review", needsSummary: false },
    { from: "open", to: "rejected", needsSummary: true },
    { from: "under_review", to: "resolved", needsSummary: true },
    { from: "under_review", to: "rejected", needsSummary: true },
    { from: "resolved", to: "closed", needsSummary: false },
    { from: "rejected", to: "closed", needsSummary: false },
  ];

  for (const { from, to, needsSummary } of happyTransitions) {
    it(`transitions ${from} → ${to} and returns 200`, async () => {
      const repo = new MemoryAdminDisputesRepository();
      repo.detail = makeDetail({
        status: from as AdminDisputeSummary["status"],
      });
      repo.summaries = [
        makeSummary({ status: from as AdminDisputeSummary["status"] }),
      ];
      const { app } = createTestApp({ repository: repo });

      const requestBody: Record<string, unknown> = { status: to };
      if (needsSummary)
        requestBody["resolution_summary"] = "Reviewed and resolved.";

      const response = await putStatus(app, DISPUTE_ID, requestBody);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe(to);
    });
  }

  it("returns 400 with exact error string for invalid transition (open→closed)", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "open" });

    const response = await putStatus(app, DISPUTE_ID, { status: "closed" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string };
    // Exact string from dispute_service.py line 382-383
    expect(body.detail).toBe("Cannot transition from open to closed");
  });

  it("returns 400 with exact error string for invalid transition (resolved→open)", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "resolved" });

    const response = await putStatus(app, DISPUTE_ID, {
      status: "open",
      resolution_summary: "Trying to reopen",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toBe("Cannot transition from resolved to open");
  });

  it("returns 400 with exact error string when resolved without summary", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "under_review" });

    const response = await putStatus(app, DISPUTE_ID, {
      status: "resolved",
      resolution_summary: null,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string };
    // Exact string from dispute_service.py line 388
    expect(body.detail).toBe("Resolution summary is required");
  });

  it("returns 400 when rejected without summary (whitespace-only counts as empty)", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "open" });

    const response = await putStatus(app, DISPUTE_ID, {
      status: "rejected",
      resolution_summary: "   ",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toBe("Resolution summary is required");
  });

  it("sets resolved_by and resolved_at when transitioning to resolved", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "under_review" });

    const response = await putStatus(app, DISPUTE_ID, {
      status: "resolved",
      resolution_summary: "Verified and closed out.",
    });

    expect(response.status).toBe(200);
    expect(repository.lastUpdateInput?.resolvedBy).toBe(USER_ID);
    expect(repository.lastUpdateInput?.resolvedAt).not.toBeNull();
    expect(repository.lastUpdateInput?.resolutionSummary).toBe(
      "Verified and closed out.",
    );
  });

  it("sets resolved_by and resolved_at when transitioning to rejected", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "open" });

    const response = await putStatus(app, DISPUTE_ID, {
      status: "rejected",
      resolution_summary: "Not a valid dispute.",
    });

    expect(response.status).toBe(200);
    expect(repository.lastUpdateInput?.resolvedBy).toBe(USER_ID);
    expect(repository.lastUpdateInput?.resolvedAt).not.toBeNull();
  });

  it("does not set resolved_by/resolved_at for non-terminal transitions (open→under_review)", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "open" });

    await putStatus(app, DISPUTE_ID, { status: "under_review" });

    expect(repository.lastUpdateInput?.resolvedBy).toBeNull();
    expect(repository.lastUpdateInput?.resolvedAt).toBeNull();
    expect(repository.lastUpdateInput?.resolutionSummary).toBeNull();
  });

  it("passes the validated current status as expectedStatus (optimistic concurrency)", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "open" });

    await putStatus(app, DISPUTE_ID, { status: "under_review" });

    expect(repository.lastUpdateInput?.expectedStatus).toBe("open");
  });

  it("returns 409 when the dispute status changed between read and write", async () => {
    const { app, repository } = createTestApp();
    repository.detail = makeDetail({ status: "open" });
    // The transition validates against "open", but the guarded UPDATE matches no
    // row because a concurrent admin already moved it — mock that miss.
    repository.simulateStatusConflict = true;

    const response = await putStatus(app, DISPUTE_ID, {
      status: "under_review",
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toBe(
      "Dispute status changed since it was loaded. Reload and try again.",
    );
  });

  it("returns 402 when organization has no full access (before admin check)", async () => {
    // 402 fires before 403 — verified by order: requireFullAccess then requireAdmin
    const { app } = createTestApp({
      hasFullAccess: false,
      role: "member", // member would get 403 if admin check ran first
    });

    const response = await putStatus(app, DISPUTE_ID, {
      status: "under_review",
    });

    // Must be 402 (subscription gate fires before admin role check)
    expect(response.status).toBe(402);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toContain("subscription_required");
  });

  it("returns 403 for member role (non-admin landlord) with full access", async () => {
    const { app, repository } = createTestApp({ role: "member" });
    repository.detail = makeDetail({ status: "open" });

    const response = await putStatus(app, DISPUTE_ID, {
      status: "under_review",
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 when dispute is in a different org", async () => {
    const { app, repository } = createTestApp();
    // Simulate dispute belonging to a different org by returning null from get + update
    repository.detail = null;

    const response = await putStatus(app, DISPUTE_ID, {
      status: "under_review",
    });

    expect(response.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      `/api/v1/disputes/${DISPUTE_ID}/status`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});

// ── POST /disputes/:disputeId/comments ────────────────────────────────────────

describe("POST /api/v1/disputes/:disputeId/comments", () => {
  async function postComment(
    app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>,
    disputeId: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return app.request(
      `/api/v1/disputes/${disputeId}/comments`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(body),
      },
      testEnv(),
    );
  }

  it("returns 201 with is_internal=true when admin sets it", async () => {
    const { app } = createTestApp();

    const response = await postComment(app, DISPUTE_ID, {
      content: "This is an internal admin note.",
      is_internal: true,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { is_internal: boolean };
    expect(body.is_internal).toBe(true);
  });

  it("returns 201 with is_internal=false by default", async () => {
    const { app } = createTestApp();

    const response = await postComment(app, DISPUTE_ID, {
      content: "Public comment for tenant.",
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { is_internal: boolean };
    expect(body.is_internal).toBe(false);
  });

  it("sets author_id to actor.userId and author_name to user.fullName", async () => {
    const { app, repository } = createTestApp({ fullName: "Jane Admin" });

    await postComment(app, DISPUTE_ID, { content: "Test comment" });

    expect(repository.lastCommentInput?.authorId).toBe(USER_ID);
    expect(repository.lastCommentInput?.authorName).toBe("Jane Admin");
  });

  it("falls back to email when fullName is null", async () => {
    const { app, repository } = createTestApp({ fullName: null });

    await postComment(app, DISPUTE_ID, { content: "Test comment" });

    expect(repository.lastCommentInput?.authorName).toBe("admin@example.com");
  });

  it("returns 400 when content is empty (min length 1)", async () => {
    const { app } = createTestApp();

    const response = await postComment(app, DISPUTE_ID, { content: "" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when content exceeds 5000 characters", async () => {
    const { app } = createTestApp();

    const response = await postComment(app, DISPUTE_ID, {
      content: "x".repeat(5001),
    });

    expect(response.status).toBe(400);
  });

  it("accepts content exactly at max length (5000 chars)", async () => {
    const { app } = createTestApp();

    const response = await postComment(app, DISPUTE_ID, {
      content: "x".repeat(5000),
    });

    expect(response.status).toBe(201);
  });

  it("returns 402 when organization has no full access", async () => {
    const { app } = createTestApp({ hasFullAccess: false, role: "member" });

    const response = await postComment(app, DISPUTE_ID, { content: "Hi" });

    expect(response.status).toBe(402);
  });

  it("returns 403 for member role with full access", async () => {
    const { app } = createTestApp({ role: "member" });

    const response = await postComment(app, DISPUTE_ID, { content: "Hi" });

    expect(response.status).toBe(403);
  });

  it("returns 404 when dispute belongs to a different org", async () => {
    const { app, repository } = createTestApp();
    // Simulate by overriding addAdminComment to return null for any org
    repository.addedComment = null;
    // Force the dispute to be "not found" in the repo
    // We override the implementation to always return null
    repository.addAdminComment = async () => null;

    const response = await postComment(app, DISPUTE_ID, {
      content: "Some note",
    });

    expect(response.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      `/api/v1/disputes/${DISPUTE_ID}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});
