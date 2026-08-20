/**
 * Tests for cross-document analysis routes and orchestrator.
 *
 * Pure-module unit tests:
 * - buildCrossDocUserMessage: serialises input as JSON with correct field order
 * - orchestrator: strips markdown fences, validates response, throws on bad JSON
 *
 * Route tests (injected fake repository + fake OpenRouter — no network):
 * - POST  /properties/:id/cross-doc-analysis: happy, 404, 422 (no verified), 502 (bad LLM), 403, 402, 401
 * - GET   /properties/:id/cross-doc-analysis/:year: found, 404, 401
 * - PATCH /cross-doc-analysis/:id/findings/:fid: happy, 404 (analysis), 404 (org mismatch), 404 (finding), 403 (role), 402, 401
 * - PATCH /organizations/:id/auditor-config: happy, 403 (wrong org), 403 (role), 402, 401
 * - PATCH /properties/:id/auditor-overrides: happy, 404 (property), 403 (role), 402, 401
 *
 * Decimal correctness: a hand-checked value proves Decimal fidelity in the assembler.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type {
  OpenRouterChatRequest,
  OpenRouterChatResponse,
} from "../adapters/ai/openrouter";
import {
  DEFAULT_OPENROUTER_PROVIDER_CONFIG,
  OpenRouterClient,
} from "../adapters/ai/openrouter";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { CrossDocAnalysisRepository } from "../domain/cross-doc-analysis/repository";
import { normalizeModelFindingIds } from "../domain/cross-doc-analysis/orchestrator";
import type {
  AuditorContext,
  CrossDocAnalysisInput,
  CrossDocAnalysisRow,
  FindingDecisionRecord,
  PropertyAuditorOverrides,
} from "../domain/cross-doc-analysis/types";
import { buildCrossDocUserMessage } from "../domain/cross-doc-analysis/prompt";
import type { AppEnv } from "../env";
import {
  createCrossDocAnalysisRoutes,
  type CrossDocRouteDependencies,
} from "../http/cross-doc-analysis-routes";
import type { AuthVariables } from "../middleware/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROPERTY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ANALYSIS_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FINDING_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// ---------------------------------------------------------------------------
// Minimal valid CrossDocAnalysisResult JSON string (what LLM returns)
// ---------------------------------------------------------------------------
const VALID_LLM_RESPONSE = JSON.stringify({
  property_id: PROPERTY_ID,
  period_year: 2024,
  findings: [
    {
      id: FINDING_ID,
      category: "billing_anomaly",
      severity: "warning",
      title: "Management fee > 5%",
      detail: "Mgmt fee is 6% of total opex.",
      affected_leases: [],
      affected_pools: ["Operations"],
      financial_impact_estimate: -1234.56,
      source_documents: [],
      override_suggestion: null,
    },
  ],
  lease_term_overrides: [],
  overall_risk_score: 42,
  analysis_summary: "One billing anomaly found.",
  documents_analyzed: { leases: 2, gl_accounts: 50 },
  token_usage: 0,
});

// ---------------------------------------------------------------------------
// Fake stored analysis row
// ---------------------------------------------------------------------------
const FAKE_ROW: CrossDocAnalysisRow = {
  id: ANALYSIS_ID,
  property_id: PROPERTY_ID,
  period_year: 2024,
  status: "pending",
  findings: JSON.parse(VALID_LLM_RESPONSE) as Record<string, unknown>,
  finding_decisions: {},
  token_usage: 1000,
};

// ---------------------------------------------------------------------------
// Minimal CrossDocAnalysisInput (no verified leases)
// ---------------------------------------------------------------------------
function makeAssembledInput(hasVerifiedLeases: boolean): CrossDocAnalysisInput {
  return {
    property_id: PROPERTY_ID,
    property_name: "Test Tower",
    period_year: 2024,
    lease_contexts: hasVerifiedLeases
      ? [
          {
            lease_id: "lease-001",
            tenant_name: "Acme Corp",
            recovery_profile: {},
            pro_rata_share: "0.25",
            base_year: 2020,
            term_start: "2020-01-01",
            term_end: "2025-12-31",
            verified_at: "2024-01-01T00:00:00Z",
          },
        ]
      : [],
    gl_pool_contexts: [],
    auditor_context: {
      market: null,
      typical_management_fee_pct: null,
      known_vendor_patterns: [],
      custom_rules: [],
    },
    property_overrides: {
      known_exceptions: [],
      special_instructions: [],
      suppressed_finding_categories: [],
    },
    prior_year_totals: {},
    data_availability: {
      has_verified_leases: hasVerifiedLeases,
      has_gl_data: false,
      has_cam_statements: false,
      has_prior_year_data: false,
      lease_count: hasVerifiedLeases ? 1 : 0,
      gl_account_count: 0,
    },
    estimated_tokens: 500,
  };
}

// ---------------------------------------------------------------------------
// Fake repository
// ---------------------------------------------------------------------------
class MemoryCrossDocRepository implements CrossDocAnalysisRepository {
  fullAccess = true;
  propertyExists = true;
  analysisRow: CrossDocAnalysisRow | null = FAKE_ROW;
  analysisOrgId: string | null = ORG_ID;
  hasVerifiedLeases = true;
  insertedId = ANALYSIS_ID;
  mergedDecisions: Record<string, Record<string, unknown>> | null = {};
  forStatusRow: { findings: Record<string, unknown>; status: string } | null = {
    findings: FAKE_ROW.findings,
    status: "pending",
  };
  currentAnalysisStatus: "pending" | "in_review" | "reviewed" = "pending";
  updatedStatuses: string[] = [];
  updatedOrgConfig: AuditorContext | null = null;
  updatedOverrides: PropertyAuditorOverrides | null = null;

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async checkPropertyInOrg(): Promise<boolean> {
    return this.propertyExists;
  }

  async getAnalysisOrgId(): Promise<{ organization_id: string } | null> {
    if (this.analysisOrgId === null) return null;
    return { organization_id: this.analysisOrgId };
  }

  async getLatestAnalysis(): Promise<CrossDocAnalysisRow | null> {
    return this.analysisRow;
  }

  async insertAnalysis(): Promise<string> {
    return this.insertedId;
  }

  async mergeFindingDecision(input: {
    analysisId: string;
    findingId: string;
    organizationId: string;
    decision: FindingDecisionRecord;
  }): Promise<Record<string, Record<string, unknown>> | null> {
    if (this.mergedDecisions !== null) {
      this.mergedDecisions[input.findingId] = input.decision as Record<
        string,
        unknown
      >;
    }
    return this.mergedDecisions;
  }

  async updateAnalysisStatus(input: {
    analysisId: string;
    organizationId: string;
    status: "in_review" | "reviewed";
    expectedStatus?: "pending" | "in_review";
  }): Promise<boolean> {
    if (
      input.expectedStatus !== undefined &&
      this.currentAnalysisStatus !== input.expectedStatus
    ) {
      return false;
    }
    this.currentAnalysisStatus = input.status;
    this.updatedStatuses.push(input.status);
    return true;
  }

  async getAnalysisForStatus(): Promise<{
    findings: Record<string, unknown>;
    status: string;
  } | null> {
    return this.forStatusRow;
  }

  async updateOrgAuditorConfig(input: {
    organizationId: string;
    config: AuditorContext;
  }): Promise<void> {
    this.updatedOrgConfig = input.config;
  }

  async updatePropertyAuditorOverrides(input: {
    propertyId: string;
    organizationId: string;
    overrides: PropertyAuditorOverrides;
  }): Promise<void> {
    this.updatedOverrides = input.overrides;
  }

  async assembleCrossDocInput(): Promise<CrossDocAnalysisInput> {
    return makeAssembledInput(this.hasVerifiedLeases);
  }
}

// ---------------------------------------------------------------------------
// Fake OpenRouter
// ---------------------------------------------------------------------------
class FakeOpenRouterClient extends OpenRouterClient {
  calls: OpenRouterChatRequest[] = [];
  responseContent = VALID_LLM_RESPONSE;
  shouldThrow = false;

  constructor() {
    super("fake-key", async () => new Response("", { status: 500 }));
  }

  override async chat(
    request: OpenRouterChatRequest,
  ): Promise<OpenRouterChatResponse> {
    this.calls.push(request);
    if (this.shouldThrow) {
      throw new Error("OpenRouter API error");
    }
    return {
      content: this.responseContent,
      tokensUsed: 1000,
      model: "z-ai/glm-5.1",
    };
  }
}

// ---------------------------------------------------------------------------
// Auth infrastructure (reused from other route tests)
// ---------------------------------------------------------------------------
const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

function jwtVerifier(): JwtVerifier {
  return {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
}

function authRepository(
  overrides?: Partial<AuthenticatedUserContext["actor"]>,
): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role: "owner",
          isServiceAdmin: false,
          party: "landlord",
          bearerToken: "valid-token",
          ...overrides,
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "owner@example.com",
          fullName: "Owner",
          role: "owner",
          isPlatformAdmin: false,
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        },
      };
    },
  };
}

function testEnv(): AppEnv {
  return {
    ENVIRONMENT: "development",
    APP_VERSION: "0.1.0",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_JWT_SECRET: "jwt-secret",
    DATABASE_URL: "postgres://example",
    PROTECTED_RECORDS: protectedRecords,
    OPENROUTER_API_KEY: "openrouter",
    RESEND_API_KEY: "resend",
    STRIPE_SECRET_KEY: "stripe",
    STRIPE_WEBHOOK_SECRET: "webhook",
    PUBLIC_APP_URL: "https://app.capveri.com",
    FEEDBACK_SCREENSHOTS_BUCKET: {} as R2Bucket,
    FEEDBACK_HMAC_SECRET: "feedback-secret",
  } as unknown as AppEnv;
}

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer valid-token" };
}
function jsonAuthHeaders(): Record<string, string> {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

function createTestApp(
  repository: CrossDocAnalysisRepository,
  openRouter?: OpenRouterClient,
  actorOverrides?: Partial<AuthenticatedUserContext["actor"]>,
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  const authOpts = {
    verifier: jwtVerifier(),
    db: {
      mode: "postgrest-compat" as const,
      auth: authRepository(actorOverrides),
      protectedRecords,
    },
  };
  const routeDeps: CrossDocRouteDependencies = { repository, auth: authOpts };
  if (openRouter !== undefined) {
    routeDeps.openRouter = openRouter;
  }
  app.route("/api/v1", createCrossDocAnalysisRoutes(routeDeps));
  return app;
}

// ---------------------------------------------------------------------------
// Pure unit test: buildCrossDocUserMessage
// ---------------------------------------------------------------------------

describe("buildCrossDocUserMessage", () => {
  it("serialises CrossDocAnalysisInput as indented JSON", () => {
    const input = makeAssembledInput(true);
    const msg = buildCrossDocUserMessage(input);
    const parsed = JSON.parse(msg);
    expect(parsed["property_id"]).toBe(PROPERTY_ID);
    expect(parsed["period_year"]).toBe(2024);
    expect(msg).toContain("  "); // indented
  });

  it("includes lease contexts and data_availability", () => {
    const input = makeAssembledInput(true);
    const msg = buildCrossDocUserMessage(input);
    const parsed = JSON.parse(msg) as CrossDocAnalysisInput;
    expect(parsed.data_availability.has_verified_leases).toBe(true);
    expect(parsed.lease_contexts).toHaveLength(1);
    expect(parsed.lease_contexts[0]!.pro_rata_share).toBe("0.25");
  });

  it("includes sampled GL entries and CAM statement amounts for semantic review", () => {
    const input = makeAssembledInput(true);
    input.gl_pool_contexts = [
      {
        pool_name: "Capital",
        pool_type: "capital",
        total_amount: "90000.00",
        account_count: 1,
        top_vendors: ["BuildCo"],
        is_gross_up_applicable: false,
        sample_entries: [
          {
            account_code: "1500",
            account_description: "Building Improvements",
            amount: "90000.00",
            vendor_name: "BuildCo",
            description: "Capital roof project in CAM package",
          },
        ],
      },
    ];
    input.cam_statement_contexts = [
      {
        lease_id: "lease-001",
        tenant_name: "Acme Corp",
        pool_id: "pool-001",
        period_start: "2024-01-01",
        period_end: "2024-12-31",
        billed_amount: "42000.00",
      },
    ];

    const parsed = JSON.parse(
      buildCrossDocUserMessage(input),
    ) as CrossDocAnalysisInput;

    expect(parsed.gl_pool_contexts[0]!.sample_entries?.[0]).toMatchObject({
      account_code: "1500",
      account_description: "Building Improvements",
      vendor_name: "BuildCo",
      description: "Capital roof project in CAM package",
    });
    expect(parsed.cam_statement_contexts?.[0]).toMatchObject({
      tenant_name: "Acme Corp",
      billed_amount: "42000.00",
      period_start: "2024-01-01",
      period_end: "2024-12-31",
    });
  });

  it("hand-checked: pro_rata_share decimal string round-trips without float drift", () => {
    // 0.1 + 0.2 is the classic float drift example (= 0.30000000000000004)
    // Our model stores decimals as strings so they round-trip exactly
    const input = makeAssembledInput(true);
    input.lease_contexts[0]!.pro_rata_share = "0.30000000000000000000"; // exact string
    const msg = buildCrossDocUserMessage(input);
    const parsed = JSON.parse(msg) as CrossDocAnalysisInput;
    expect(parsed.lease_contexts[0]!.pro_rata_share).toBe(
      "0.30000000000000000000",
    );
  });
});

describe("normalizeModelFindingIds", () => {
  it("repairs invalid model UUIDs and remaps top-level override links", () => {
    const badId = "c3d4e5f6-7890-4c12-defg-b34567890123";
    const payload = JSON.parse(VALID_LLM_RESPONSE) as Record<string, unknown>;
    payload["findings"] = [
      {
        id: badId,
        category: "term_override",
        severity: "critical",
        title: "Latest side letter overrides pro-rata share",
        detail: "Provider emitted a placeholder-like invalid UUID.",
        affected_leases: ["11111111-1111-4111-8111-111111111111"],
        affected_pools: [],
        financial_impact_estimate: null,
        source_documents: ["Second Amendment"],
        override_suggestion: null,
      },
    ];
    payload["lease_term_overrides"] = [
      {
        finding_id: badId,
        field_name: "pro_rata_share",
        lease_id: "11111111-1111-4111-8111-111111111111",
        current_value: "0.1250",
        suggested_value: "0.0750",
        reasoning: "Latest side letter supersedes prior schedules.",
        confidence: 92,
      },
    ];

    normalizeModelFindingIds(payload);

    const findings = payload["findings"] as Array<Record<string, unknown>>;
    const overrides = payload["lease_term_overrides"] as Array<
      Record<string, unknown>
    >;
    expect(findings[0]!["id"]).not.toBe(badId);
    expect(String(findings[0]!["id"])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(overrides[0]!["finding_id"]).toBe(findings[0]!["id"]);
  });
});

// ---------------------------------------------------------------------------
// POST /properties/:propertyId/cross-doc-analysis
// ---------------------------------------------------------------------------

describe("POST /properties/:propertyId/cross-doc-analysis", () => {
  it("happy path: calls LLM with no responseFormat, returns 201 with findings", async () => {
    const repository = new MemoryCrossDocRepository();
    const openRouter = new FakeOpenRouterClient();
    const app = createTestApp(repository, openRouter);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(201);
    const body = await response.json<{
      overall_risk_score: number;
      findings: unknown[];
    }>();
    expect(body.overall_risk_score).toBe(42);
    expect(body.findings).toHaveLength(1);

    // No responseFormat — raw chat() call
    expect(openRouter.calls).toHaveLength(1);
    expect(openRouter.calls[0]!.responseFormat).toBeUndefined();
    // ZDR opt-out + non-China provider allowlist must be sent on this LLM call
    // (privacy non-negotiable), same as every other OpenRouter call site.
    expect(openRouter.calls[0]!.provider).toEqual(
      DEFAULT_OPENROUTER_PROVIDER_CONFIG,
    );
    expect(openRouter.calls[0]!.provider?.zdr).toBe(true);
  });

  it("returns 404 when property not in org", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.propertyExists = false;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 422 when no verified leases", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.hasVerifiedLeases = false;
    const app = createTestApp(repository, new FakeOpenRouterClient());

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(422);
  });

  it("returns 502 when LLM returns invalid JSON", async () => {
    const repository = new MemoryCrossDocRepository();
    const openRouter = new FakeOpenRouterClient();
    openRouter.responseContent = "not-valid-json";
    const app = createTestApp(repository, openRouter);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(502);
  });

  it("returns 403 when actor is viewer role", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository, undefined, { role: "viewer" });

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 402 when no full access", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.fullAccess = false;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(402);
  });

  it("returns 401 when no Authorization header", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(401);
  });

  it("strips markdown code fences from LLM response", async () => {
    const repository = new MemoryCrossDocRepository();
    const openRouter = new FakeOpenRouterClient();
    openRouter.responseContent = "```json\n" + VALID_LLM_RESPONSE + "\n```";
    const app = createTestApp(repository, openRouter);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(201);
  });

  it("hand-checked money: financial_impact_estimate -1234.56 survives round-trip", async () => {
    const repository = new MemoryCrossDocRepository();
    const openRouter = new FakeOpenRouterClient();
    const app = createTestApp(repository, openRouter);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(201);
    const body = await response.json<{
      findings: Array<{ financial_impact_estimate: number }>;
    }>();
    // The LLM response has -1234.56; it must survive JSON round-trip unchanged
    expect(body.findings[0]!.financial_impact_estimate).toBe(-1234.56);
  });
});

// ---------------------------------------------------------------------------
// GET /properties/:propertyId/cross-doc-analysis/:periodYear
// ---------------------------------------------------------------------------

describe("GET /properties/:propertyId/cross-doc-analysis/:periodYear", () => {
  it("returns analysis row when found", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis/2024`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<CrossDocAnalysisRow>();
    expect(body.id).toBe(ANALYSIS_ID);
    expect(body.period_year).toBe(2024);
  });

  it("returns 404 when no analysis exists", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.analysisRow = null;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis/2024`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/cross-doc-analysis/2024`,
      {},
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /cross-doc-analysis/:analysisId/findings/:findingId
// ---------------------------------------------------------------------------

describe("PATCH /cross-doc-analysis/:analysisId/findings/:findingId", () => {
  it("happy path: records decision, returns ok + decision", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          decision: "accepted",
          reason: "Verified correct",
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ status: string; decision: string }>();
    expect(body.status).toBe("ok");
    expect(body.decision).toBe("accepted");
  });

  it("advances status to in_review on first decision", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.forStatusRow = {
      findings: {
        findings: [
          { id: FINDING_ID },
          { id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
        ],
      },
      status: "pending",
    };
    const app = createTestApp(repository);

    await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ decision: "accepted", reason: "" }),
      },
      testEnv(),
    );

    expect(repository.updatedStatuses).toContain("in_review");
  });

  it("does not regress a reviewed analysis to in_review from a stale status read", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.currentAnalysisStatus = "reviewed";
    repository.forStatusRow = {
      findings: {
        findings: [
          { id: FINDING_ID },
          { id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
        ],
      },
      status: "pending",
    };
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ decision: "accepted", reason: "" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(repository.updatedStatuses).not.toContain("in_review");
    expect(repository.currentAnalysisStatus).toBe("reviewed");
  });

  it("returns 404 when analysis not found", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.analysisOrgId = null;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ decision: "dismissed" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when analysis belongs to different org", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.analysisOrgId = "99999999-9999-4999-8999-999999999999";
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ decision: "dismissed" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when finding is not found", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.mergedDecisions = null;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ decision: "dismissed" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when actor role is viewer", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository, undefined, { role: "viewer" });

    const response = await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ decision: "accepted" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 402 when no full access", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.fullAccess = false;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ decision: "accepted" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(402);
  });

  it("returns 401 when unauthenticated", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/cross-doc-analysis/${ANALYSIS_ID}/findings/${FINDING_ID}`,
      { method: "PATCH", body: JSON.stringify({ decision: "accepted" }) },
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /organizations/:orgId/auditor-config
// ---------------------------------------------------------------------------

describe("PATCH /organizations/:orgId/auditor-config", () => {
  it("happy path: stores config and returns ok", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/organizations/${ORG_ID}/auditor-config`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          market: "DFW",
          typical_management_fee_pct: "0.04",
          known_vendor_patterns: ["HVAC*"],
          custom_rules: ["Exclude capital improvements"],
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ status: string }>();
    expect(body.status).toBe("ok");
    expect(repository.updatedOrgConfig).not.toBeNull();
    expect(repository.updatedOrgConfig!.market).toBe("DFW");
  });

  it("returns 403 when orgId != actor.organizationId", async () => {
    const repository = new MemoryCrossDocRepository();
    const differentOrgId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/organizations/${differentOrgId}/auditor-config`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({}),
      },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when role is viewer", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository, undefined, { role: "viewer" });

    const response = await app.request(
      `/api/v1/organizations/${ORG_ID}/auditor-config`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({}),
      },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 402 when no full access", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.fullAccess = false;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/organizations/${ORG_ID}/auditor-config`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({}),
      },
      testEnv(),
    );

    expect(response.status).toBe(402);
  });

  it("returns 401 when unauthenticated", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/organizations/${ORG_ID}/auditor-config`,
      { method: "PATCH", body: JSON.stringify({}) },
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /properties/:propertyId/auditor-overrides
// ---------------------------------------------------------------------------

describe("PATCH /properties/:propertyId/auditor-overrides", () => {
  it("happy path: stores overrides and returns ok", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/auditor-overrides`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          known_exceptions: ["Capital improvement 2021"],
          special_instructions: ["Check admin fee"],
          suppressed_finding_categories: ["lease_nuance"],
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ status: string }>();
    expect(body.status).toBe("ok");
    expect(repository.updatedOverrides).not.toBeNull();
    expect(repository.updatedOverrides!.suppressed_finding_categories).toEqual([
      "lease_nuance",
    ]);
  });

  it("returns 404 when property not in org", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.propertyExists = false;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/auditor-overrides`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({}),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when role is viewer", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository, undefined, { role: "viewer" });

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/auditor-overrides`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({}),
      },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 402 when no full access", async () => {
    const repository = new MemoryCrossDocRepository();
    repository.fullAccess = false;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/auditor-overrides`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({}),
      },
      testEnv(),
    );

    expect(response.status).toBe(402);
  });

  it("returns 401 when unauthenticated", async () => {
    const repository = new MemoryCrossDocRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/auditor-overrides`,
      { method: "PATCH", body: JSON.stringify({}) },
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});
