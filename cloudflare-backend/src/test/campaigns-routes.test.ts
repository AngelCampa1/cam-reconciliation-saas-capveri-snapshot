import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  CampaignRepository,
  CampaignRow,
  CampaignStatusUpdate,
  SnapshotRow,
} from "../domain/campaigns/repository";
import type { AppEnv } from "../env";
import { createCampaignsRoutes } from "../http/campaigns-routes";
import type { AuthVariables } from "../middleware/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_A = "33333333-3333-4333-8333-333333333333";
const CAMPAIGN_A = "44444444-4444-4444-8444-444444444444";
const CAMPAIGN_B = "55555555-5555-4555-8555-555555555555";

// ---------------------------------------------------------------------------
// Fake repository
// ---------------------------------------------------------------------------

class FakeCampaignRepository implements CampaignRepository {
  campaigns: CampaignRow[] = [];
  snapshots: SnapshotRow[] = [];
  updates: CampaignStatusUpdate[] = [];
  staleTransitionIds = new Set<string>();

  private readonly _campaignOrg = new Map<string, string>();

  setCampaign(id: string, status: string, orgId = ORG_ID): void {
    this.campaigns.push({
      id,
      property_id: PROPERTY_A,
      period_year: 2025,
      status,
      finalized_at: null,
      submitted_for_review_at: null,
      approved_at: null,
      sent_at: null,
      updated_at: "2025-06-01T00:00:00Z",
      property_name: "Metro Center",
    });
    this._campaignOrg.set(id, orgId);
  }

  async listCampaigns(
    _organizationId: string,
    year: number | undefined,
  ): Promise<{ campaigns: CampaignRow[]; snapshots: SnapshotRow[] }> {
    const filtered =
      year !== undefined
        ? this.campaigns.filter((c) => c.period_year === year)
        : this.campaigns;

    return { campaigns: filtered, snapshots: this.snapshots };
  }

  async findCampaign(
    id: string,
    organizationId: string,
  ): Promise<{ id: string; status: string } | undefined> {
    const campaign = this.campaigns.find(
      (c) => c.id === id && this._campaignOrg.get(c.id) === organizationId,
    );
    return campaign ? { id: campaign.id, status: campaign.status } : undefined;
  }

  async updateCampaignStatus(update: CampaignStatusUpdate): Promise<boolean> {
    this.updates.push(update);
    if (this.staleTransitionIds.has(update.id)) {
      return false;
    }
    const campaign = this.campaigns.find((c) => c.id === update.id);
    if (campaign && campaign.status === update.expectedStatus) {
      campaign.status = update.status;
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"],
  orgId = ORG_ID,
): AuthenticatedUserContext {
  const party = role === "tenant" ? "tenant" : "landlord";
  return {
    user: {
      id: USER_ID,
      organizationId: orgId,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-13T00:00:00Z",
      updatedAt: "2026-06-13T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: orgId,
      role,
      isServiceAdmin: false,
      party,
      bearerToken: "valid-token",
    },
  };
}

function createTestApp(options: {
  role?: AuthVariables["auth"]["actor"]["role"];
  orgId?: string;
  repository?: FakeCampaignRepository;
}) {
  const repo = options.repository ?? new FakeCampaignRepository();
  const context = createAuthContext(
    options.role ?? "member",
    options.orgId ?? ORG_ID,
  );
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const auth: AuthRepository = {
    async resolveUserContext() {
      return context;
    },
  };

  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createCampaignsRoutes({
      repository: repo,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repo };
}

function env(): AppEnv {
  return { ENVIRONMENT: "test", APP_VERSION: "test" } as unknown as AppEnv;
}

const authHeaders = { authorization: "Bearer valid-token" };

// ---------------------------------------------------------------------------
// GET /api/v1/campaigns — list
// ---------------------------------------------------------------------------

describe("GET /api/v1/campaigns — list", () => {
  it("returns empty array when no campaigns", async () => {
    const { app } = createTestApp({});
    const res = await app.request(
      "/api/v1/campaigns",
      { headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("accepts the generated client trailing slash URL", async () => {
    const { app } = createTestApp({});
    const res = await app.request(
      "/api/v1/campaigns/",
      { headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns campaign summaries with aggregated snapshot data", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "finalized");
    repo.snapshots = [
      {
        id: "sn-1",
        property_id: PROPERTY_A,
        period_start_date: "2025-01-01",
        status: "finalized",
        total_recovery: "1000.00",
      },
      {
        id: "sn-2",
        property_id: PROPERTY_A,
        period_start_date: "2025-06-01",
        status: "draft",
        total_recovery: "500.00",
      },
    ];

    const { app } = createTestApp({ repository: repo });
    const res = await app.request(
      "/api/v1/campaigns",
      { headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: CAMPAIGN_A,
      property_id: PROPERTY_A,
      property_name: "Metro Center",
      period_year: 2025,
      status: "finalized",
      tenant_count: 2,
      finalized_tenant_count: 1,
      total_recovery: "1500",
    });
  });

  it("filters by year query parameter", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "finalized");
    repo.campaigns[0]!.period_year = 2024;
    repo.setCampaign(CAMPAIGN_B, "draft");
    repo.campaigns[1]!.period_year = 2025;

    const { app } = createTestApp({ repository: repo });
    const res = await app.request(
      "/api/v1/campaigns?year=2024",
      { headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe(CAMPAIGN_A);
  });

  it("returns 401 when no auth header", async () => {
    const { app } = createTestApp({});
    const res = await app.request("/api/v1/campaigns", {}, env());
    expect(res.status).toBe(401);
  });

  it("returns 403 for tenant actors", async () => {
    const { app } = createTestApp({ role: "tenant" });
    const res = await app.request(
      "/api/v1/campaigns",
      { headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST submit-for-review (FINALIZED → IN_REVIEW)
// ---------------------------------------------------------------------------

describe("POST /api/v1/campaigns/:id/submit-for-review", () => {
  it("transitions finalized → in_review and returns transition response", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "finalized");

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/submit-for-review`,
      { method: "POST", headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      status: string;
      transitioned_by_user_id: string;
      transitioned_at: string;
    };
    expect(body.id).toBe(CAMPAIGN_A);
    expect(body.status).toBe("in_review");
    expect(body.transitioned_by_user_id).toBe(USER_ID);
    expect(typeof body.transitioned_at).toBe("string");

    // Audit fields should be set
    const update = repo.updates[0]!;
    expect(update.expectedStatus).toBe("finalized");
    expect(update.timestampField).toBe("submitted_for_review_at");
    expect(update.userIdField).toBe("submitted_for_review_by_user_id");
  });

  it("returns 409 when a concurrent transition changes the campaign status", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "finalized");
    repo.staleTransitionIds.add(CAMPAIGN_A);

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/submit-for-review`,
      { method: "POST", headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string; detail?: string };
    expect(body.code).toBe("campaign_status_conflict");
    expect(body.detail ?? "").toContain("changed status");
  });

  it("returns 409 for invalid transition (draft → in_review)", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "draft");

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/submit-for-review`,
      { method: "POST", headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toMatch(
      /Cannot transition campaign from 'draft' to 'in_review'/,
    );
  });

  it("returns 404 for campaign in a different org", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "finalized", OTHER_ORG_ID);

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/submit-for-review`,
      { method: "POST", headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "finalized");

    const { app } = createTestApp({ repository: repo });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/submit-for-review`,
      { method: "POST" },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role (below editor)", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "finalized");

    const { app } = createTestApp({ repository: repo, role: "viewer" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/submit-for-review`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST approve (IN_REVIEW → APPROVED)
// ---------------------------------------------------------------------------

describe("POST /api/v1/campaigns/:id/approve", () => {
  it("transitions in_review → approved", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "in_review");

    const { app } = createTestApp({ repository: repo, role: "admin" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/approve`,
      { method: "POST", headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("approved");

    const update = repo.updates[0]!;
    expect(update.timestampField).toBe("approved_at");
    expect(update.userIdField).toBe("approved_by_user_id");
  });

  it("returns 409 for invalid transition", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "draft");

    const { app } = createTestApp({ repository: repo, role: "admin" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/approve`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 for cross-org campaign", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "in_review", OTHER_ORG_ID);

    const { app } = createTestApp({ repository: repo, role: "admin" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/approve`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "in_review");

    const { app } = createTestApp({ repository: repo });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/approve`,
      { method: "POST" },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role (below admin)", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "in_review");

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/approve`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST reject (IN_REVIEW → FINALIZED)
// ---------------------------------------------------------------------------

describe("POST /api/v1/campaigns/:id/reject", () => {
  it("transitions in_review → finalized and clears submission audit fields", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "in_review");

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/reject`,
      { method: "POST", headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("finalized");

    // Rejection must clear submission fields (campaigns.py:79-83)
    const update = repo.updates[0]!;
    expect(update.clearSubmitFields).toBe(true);
    expect(update.timestampField).toBeUndefined();
  });

  it("returns 409 for invalid transition (approved → finalized is not a valid rejection path)", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "approved");

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/reject`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 for cross-org campaign", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "in_review", OTHER_ORG_ID);

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/reject`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const { app } = createTestApp({});
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/reject`,
      { method: "POST" },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "in_review");

    const { app } = createTestApp({ repository: repo, role: "viewer" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/reject`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST mark-sent (APPROVED → SENT)
// ---------------------------------------------------------------------------

describe("POST /api/v1/campaigns/:id/mark-sent", () => {
  it("transitions approved → sent", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "approved");

    const { app } = createTestApp({ repository: repo, role: "admin" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/mark-sent`,
      { method: "POST", headers: authHeaders },
      env(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("sent");

    const update = repo.updates[0]!;
    expect(update.timestampField).toBe("sent_at");
    expect(update.userIdField).toBe("sent_by_user_id");
  });

  it("returns 409 for invalid transition", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "in_review");

    const { app } = createTestApp({ repository: repo, role: "admin" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/mark-sent`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 for cross-org campaign", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "approved", OTHER_ORG_ID);

    const { app } = createTestApp({ repository: repo, role: "admin" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/mark-sent`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const { app } = createTestApp({});
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/mark-sent`,
      { method: "POST" },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role", async () => {
    const repo = new FakeCampaignRepository();
    repo.setCampaign(CAMPAIGN_A, "approved");

    const { app } = createTestApp({ repository: repo, role: "member" });
    const res = await app.request(
      `/api/v1/campaigns/${CAMPAIGN_A}/mark-sent`,
      { method: "POST", headers: authHeaders },
      env(),
    );
    expect(res.status).toBe(403);
  });
});
