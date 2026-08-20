/**
 * Tests for GL Narrative Analysis routes and pure-logic modules.
 *
 * Pure-module unit tests:
 * - aggregateAccounts: Decimal-safe summation, unparseable-skip, sorted output
 * - detectAnomalies: cross-property code regex, miscoding keyword, clean→none
 * - buildGlAnalysisUserMessage: anomalies omitted when empty, included when present
 *
 * Route tests (injected fake repository + fake OpenRouter — no real network calls):
 * - Route 1 POST /analysis/gl-narrative: happy path, 404, 400, 403, 402, 401
 * - Route 2 GET  /analysis/gl-narrative/:pid/:yr: row, null, 401
 * - Route 3 POST /analysis/gl-narrative/:id/dismiss: success, 404, 403, 402, 401
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type {
  OpenRouterChatRequest,
  OpenRouterChatResponse,
} from "../adapters/ai/openrouter";
import {
  DEFAULT_OPENROUTER_PROVIDER_CONFIG,
  OpenRouterApiError,
  OpenRouterClient,
} from "../adapters/ai/openrouter";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  AnalysisRepository,
  ExpensePool,
  GlAnalysisResult,
  GlEntry,
  PoolMapping,
} from "../domain/analysis/repository";
import {
  aggregateAccounts,
  buildGlAnalysisUserMessage,
  detectAnomalies,
  GL_ANALYSIS_SYSTEM_PROMPT,
  type GlNarrativeEntry,
} from "../domain/analysis/gl-narrative-prompt";
import type { AppEnv } from "../env";
import { createGlNarrativeRoutes } from "../http/gl-narrative-routes";
import type { AuthVariables } from "../middleware/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const ANALYSIS_ID = "44444444-4444-4444-8444-444444444444";

// ---------------------------------------------------------------------------
// Fake analysis row
// ---------------------------------------------------------------------------
const FAKE_ROW: GlAnalysisResult = {
  id: ANALYSIS_ID,
  organization_id: ORG_ID,
  property_id: PROPERTY_ID,
  period_year: 2024,
  analysis_markdown: "## CAM GL Analysis — Test Property, 2024\n\nNo issues.",
  token_input: 500,
  token_output: 0,
  ran_at: "2026-06-13T00:00:00.000Z",
  ran_by_user_id: USER_ID,
  dismissed_at: null,
  dismissed_by_user_id: null,
  created_at: "2026-06-13T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Helper: make GL entry with all fields
// ---------------------------------------------------------------------------
function glEntry(overrides: Partial<GlNarrativeEntry> = {}): GlNarrativeEntry {
  return {
    account_code: "6000",
    account_description: "Utilities",
    amount: "100.00",
    vendor_name: null,
    description: null,
    transaction_date: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure-module unit tests
// ---------------------------------------------------------------------------

describe("aggregateAccounts", () => {
  it("sums amounts using Decimal precision (no float drift)", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({ account_code: "6000", amount: "1000.10" }),
      glEntry({ account_code: "6000", amount: "0.20" }),
    ];
    const result = aggregateAccounts(entries);
    expect(result).toHaveLength(1);
    expect(result[0]!.account_code).toBe("6000");
    // Exact Decimal sum, not float 1000.3000000000001
    expect(result[0]!.total_amount).toBe("1000.3");
    expect(result[0]!.entry_count).toBe(2);
  });

  it("skips unparseable amounts and continues", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({ account_code: "7000", amount: "500.00" }),
      glEntry({ account_code: "7000", amount: "NOT_A_NUMBER" }),
      glEntry({ account_code: "7000", amount: "200.00" }),
    ];
    const result = aggregateAccounts(entries);
    expect(result).toHaveLength(1);
    // Only the two parseable amounts are summed
    expect(result[0]!.total_amount).toBe("700");
    expect(result[0]!.entry_count).toBe(3); // all 3 counted (skip only affects sum)
  });

  it("collects vendors (deduped, max 5) and caps descriptions at 3", () => {
    const entries: GlNarrativeEntry[] = Array.from({ length: 5 }, (_, i) =>
      glEntry({
        account_code: "8000",
        vendor_name: `Vendor-${i}`,
        description: `Desc-${i}`,
        amount: "10.00",
      }),
    );
    const result = aggregateAccounts(entries);
    expect(result[0]!.top_vendors).toHaveLength(5);
    expect(result[0]!.sample_descriptions).toHaveLength(3);
  });

  it("sorts output by account code ascending", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({ account_code: "9000", amount: "1.00" }),
      glEntry({ account_code: "6000", amount: "2.00" }),
      glEntry({ account_code: "7000", amount: "3.00" }),
    ];
    const result = aggregateAccounts(entries);
    expect(result.map((r) => r.account_code)).toEqual(["6000", "7000", "9000"]);
  });

  it("hand-checked total: three entries 1.11 + 2.22 + 3.33 = 6.66", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({ amount: "1.11" }),
      glEntry({ amount: "2.22" }),
      glEntry({ amount: "3.33" }),
    ];
    const result = aggregateAccounts(entries);
    expect(result[0]!.total_amount).toBe("6.66");
  });
});

describe("detectAnomalies", () => {
  it("flags cross-property code pattern (e.g. HOU-02 in description)", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({
        description: "Invoice for HOU-02 repair",
        account_code: "6001",
      }),
      glEntry({ description: "Normal cleaning", account_code: "6002" }),
    ];
    const result = detectAnomalies(entries, null);
    expect(result).toHaveLength(1);
    expect(result[0]!.account_code).toBe("6001");
    expect(result[0]!.detected_codes).toContain("HOU-02");
  });

  it("flags cross-property code in vendor_name", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({ vendor_name: "ELD-01 Corp", account_code: "7000" }),
    ];
    const result = detectAnomalies(entries, null);
    expect(result).toHaveLength(1);
    expect(result[0]!.detected_codes).toContain("ELD-01");
  });

  it("flags miscoding keyword 'mis-coded' in description", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({
        description: "This was mis-coded to wrong pool",
        account_code: "8000",
      }),
    ];
    const result = detectAnomalies(entries, null);
    expect(result).toHaveLength(1);
    expect(result[0]!.detected_codes).toHaveLength(0); // no property code, just keyword
  });

  it("flags 'wrong property' keyword", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({ description: "wrong property charge", account_code: "5000" }),
    ];
    const result = detectAnomalies(entries, null);
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no anomalies", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({ description: "routine maintenance", vendor_name: "ACME Inc" }),
    ];
    const result = detectAnomalies(entries, null);
    expect(result).toHaveLength(0);
  });

  it("serializes amount and transaction_date as strings in anomaly dict", () => {
    const entries: GlNarrativeEntry[] = [
      glEntry({
        description: "HOU-03 ref",
        amount: "999.99",
        transaction_date: "2024-03-15",
      }),
    ];
    const result = detectAnomalies(entries, null);
    expect(result[0]!.amount).toBe("999.99");
    expect(result[0]!.transaction_date).toBe("2024-03-15");
  });
});

describe("buildGlAnalysisUserMessage", () => {
  const BASE_INPUT = {
    property_name: "Downtown Tower",
    period_year: 2024,
    total_gl_entries: 100,
    expense_pools: [{ name: "Cleaning", type: "cam" }],
    accounts: [
      {
        account_code: "6000",
        account_description: "Utilities",
        total_amount: "5000",
        entry_count: 10,
        top_vendors: ["ACME"],
        sample_descriptions: ["Electric bill"],
      },
    ],
  };

  it("omits anomalies key entirely when anomalies is empty", () => {
    const msg = buildGlAnalysisUserMessage({ ...BASE_INPUT, anomalies: [] });
    const parsed = JSON.parse(msg);
    expect(Object.keys(parsed)).not.toContain("anomalies");
  });

  it("omits anomalies key when anomalies is null/undefined", () => {
    const msg = buildGlAnalysisUserMessage({ ...BASE_INPUT, anomalies: null });
    const parsed = JSON.parse(msg);
    expect(Object.keys(parsed)).not.toContain("anomalies");
  });

  it("includes anomalies key when anomalies array is non-empty", () => {
    const anomaly = {
      account_code: "6000",
      vendor_name: "HOU-02 Corp",
      description: "cross-property",
      amount: "100.00",
      transaction_date: "2024-01-01",
      detected_codes: ["HOU-02"],
    };
    const msg = buildGlAnalysisUserMessage({
      ...BASE_INPUT,
      anomalies: [anomaly],
    });
    const parsed = JSON.parse(msg);
    expect(parsed).toHaveProperty("anomalies");
    expect(parsed.anomalies).toHaveLength(1);
    expect(parsed.anomalies[0].account_code).toBe("6000");
  });

  it("preserves correct field order and JSON indentation", () => {
    const msg = buildGlAnalysisUserMessage(BASE_INPUT);
    const parsed = JSON.parse(msg);
    const keys = Object.keys(parsed);
    expect(keys[0]).toBe("property_name");
    expect(keys[1]).toBe("period_year");
    expect(keys[2]).toBe("total_gl_entries");
    expect(keys[3]).toBe("expense_pools");
    expect(keys[4]).toBe("accounts");
    // Should be indented (2 spaces)
    expect(msg).toContain('  "property_name"');
  });
});

// ---------------------------------------------------------------------------
// Route test infrastructure
// ---------------------------------------------------------------------------

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryAnalysisRepository implements AnalysisRepository {
  fullAccess = true;
  propertyName: string | null = "Test Property";
  glEntriesData: GlEntry[] = [
    {
      account_code: "6000",
      account_description: "Utilities",
      amount: "1000.00",
      vendor_name: "ACME",
      description: "Electric",
      transaction_date: "2024-01-15",
    },
  ];
  expensePoolsWithType: Array<{ name: string; type: string }> = [
    { name: "Cleaning", type: "cam" },
  ];
  insertedRow: GlAnalysisResult | null = FAKE_ROW;
  latestRow: GlAnalysisResult | null = FAKE_ROW;
  dismissedRow: GlAnalysisResult | null = {
    ...FAKE_ROW,
    dismissed_at: "2026-06-13T01:00:00.000Z",
    dismissed_by_user_id: USER_ID,
  };
  inserted: GlAnalysisResult[] = [];
  featureUses: Array<{ organizationId: string; featureKey: string }> = [];

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async getPropertyName(): Promise<string | null> {
    return this.propertyName;
  }

  async listAvailableYears(): Promise<number[]> {
    return [2024];
  }

  async listFinalizedSnapshotYears(): Promise<number[]> {
    return [2024];
  }

  async listExpensePools(): Promise<ExpensePool[]> {
    return [];
  }

  async listPoolMappings(): Promise<PoolMapping[]> {
    return [];
  }

  async listGlEntries(): Promise<GlEntry[]> {
    return this.glEntriesData;
  }

  async recordFeatureUse(input: {
    organizationId: string;
    featureKey: string;
  }): Promise<void> {
    this.featureUses.push(input);
  }

  async listExpensePoolsWithType(): Promise<
    Array<{ name: string; type: string }>
  > {
    return this.expensePoolsWithType;
  }

  async insertGlAnalysisResult(): Promise<GlAnalysisResult> {
    this.inserted.push(this.insertedRow!);
    return this.insertedRow!;
  }

  async getLatestGlAnalysis(): Promise<GlAnalysisResult | null> {
    return this.latestRow;
  }

  async dismissGlAnalysis(): Promise<GlAnalysisResult> {
    if (!this.dismissedRow) {
      throw new Error("Analysis not found");
    }
    return this.dismissedRow;
  }
}

// ---------------------------------------------------------------------------
// Fake OpenRouter — captures calls, returns markdown, no network
// ---------------------------------------------------------------------------
class FakeOpenRouterClient extends OpenRouterClient {
  calls: OpenRouterChatRequest[] = [];
  responseMarkdown = "## CAM GL Analysis — Test Property, 2024\n\nNo issues.";
  failures: Error[] = [];

  constructor() {
    // apiKey is required by parent; pass a dummy — we override chat()
    super("fake-key", async () => new Response("", { status: 500 }));
  }

  override async chat(
    request: OpenRouterChatRequest,
  ): Promise<OpenRouterChatResponse> {
    this.calls.push(request);
    const failure = this.failures.shift();
    if (failure) {
      throw failure;
    }

    return {
      content: this.responseMarkdown,
      tokensUsed: 500,
      model: request.model,
    };
  }
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function createTestApp(
  repository: AnalysisRepository,
  openRouter?: OpenRouterClient,
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createGlNarrativeRoutes({
      repository,
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(),
          protectedRecords,
        },
      },
      openRouter,
    }),
  );
  return app;
}

// Auth header helpers
function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer valid-token" };
}

function jsonAuthHeaders(): Record<string, string> {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

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
          role: overrides?.role ?? "owner",
          isServiceAdmin: false,
          party: overrides?.party ?? "landlord",
          bearerToken: "valid-token",
          ...overrides,
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "owner@example.com",
          fullName: "Owner",
          role: overrides?.role ?? "owner",
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

// ---------------------------------------------------------------------------
// Route 1: POST /analysis/gl-narrative
// ---------------------------------------------------------------------------

describe("POST /analysis/gl-narrative", () => {
  it("happy path: persists row, returns result + gl_entry_count, records feature use, calls chat() with no responseFormat and verbatim system prompt", async () => {
    const repository = new MemoryAnalysisRepository();
    const openRouter = new FakeOpenRouterClient();
    const app = createTestApp(repository, openRouter);

    const response = await app.request(
      "/api/v1/analysis/gl-narrative",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      result: GlAnalysisResult;
      gl_entry_count: number;
    }>();
    expect(body.gl_entry_count).toBe(1); // one GL entry in memory repo
    expect(body.result.id).toBe(ANALYSIS_ID);
    expect(body.result.analysis_markdown).toContain("CAM GL Analysis");

    // Feature use recorded
    expect(repository.featureUses).toContainEqual({
      organizationId: ORG_ID,
      featureKey: "ai_gl_narrative_analysis",
    });

    // chat() called with correct shape
    expect(openRouter.calls).toHaveLength(1);
    const call = openRouter.calls[0]!;
    // NO responseFormat — this is the critical parity check
    expect(call.responseFormat).toBeUndefined();
    expect(call.provider).toEqual(DEFAULT_OPENROUTER_PROVIDER_CONFIG);
    // Verbatim system prompt
    expect(call.messages[0]).toMatchObject({
      role: "system",
      content: GL_ANALYSIS_SYSTEM_PROMPT,
    });
    // temperature = 0
    expect(call.temperature).toBe(0);
  });

  it("retries GL narrative generation once with a fallback model after OpenRouter timeout", async () => {
    const repository = new MemoryAnalysisRepository();
    const openRouter = new FakeOpenRouterClient();
    openRouter.failures.push(
      new OpenRouterApiError("OpenRouter request timed out", 408),
    );
    const app = createTestApp(repository, openRouter);

    const response = await app.request(
      "/api/v1/analysis/gl-narrative",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { id: ANALYSIS_ID },
      gl_entry_count: 1,
    });
    expect(openRouter.calls).toHaveLength(2);
    expect(openRouter.calls[0]).toMatchObject({
      model: "z-ai/glm-5.1",
      fallbackModels: ["openai/gpt-5.4-mini", "moonshotai/kimi-k2.6"],
      provider: DEFAULT_OPENROUTER_PROVIDER_CONFIG,
    });
    expect(openRouter.calls[1]).toMatchObject({
      model: "openai/gpt-5.4-mini",
      fallbackModels: ["moonshotai/kimi-k2.6"],
      provider: DEFAULT_OPENROUTER_PROVIDER_CONFIG,
    });
    expect(repository.inserted).toHaveLength(1);
  });

  it("schedules feature-use recording on the Worker execution context", async () => {
    const repository = new MemoryAnalysisRepository();
    const openRouter = new FakeOpenRouterClient();
    const app = createTestApp(repository, openRouter);
    const waitUntilPromises: Promise<unknown>[] = [];

    const response = await app.request(
      "/api/v1/analysis/gl-narrative",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
      {
        props: {},
        waitUntil(promise: Promise<unknown>) {
          waitUntilPromises.push(promise);
        },
        passThroughOnException() {
          // Not used by this route.
        },
      },
    );

    expect(response.status).toBe(200);
    expect(waitUntilPromises).toHaveLength(1);
    await Promise.all(waitUntilPromises);
    expect(repository.featureUses).toContainEqual({
      organizationId: ORG_ID,
      featureKey: "ai_gl_narrative_analysis",
    });
  });

  it("returns 404 when property not found", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.propertyName = null;
    const openRouter = new FakeOpenRouterClient();
    const app = createTestApp(repository, openRouter);

    const response = await app.request(
      "/api/v1/analysis/gl-narrative",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when user is not an editor (viewer role)", async () => {
    // Create app with viewer role
    const repository = new MemoryAnalysisRepository();
    const openRouter = new FakeOpenRouterClient();

    const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
    app.route(
      "/api/v1",
      createGlNarrativeRoutes({
        repository,
        auth: {
          verifier: jwtVerifier(),
          db: {
            mode: "postgrest-compat",
            auth: authRepository({ role: "viewer" }),
            protectedRecords,
          },
        },
        openRouter,
      }),
    );

    const response = await app.request(
      "/api/v1/analysis/gl-narrative",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 402 when organization lacks full access", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.fullAccess = false;
    const openRouter = new FakeOpenRouterClient();
    const app = createTestApp(repository, openRouter);

    const response = await app.request(
      "/api/v1/analysis/gl-narrative",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(402);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = createTestApp(
      new MemoryAnalysisRepository(),
      new FakeOpenRouterClient(),
    );

    const response = await app.request(
      "/api/v1/analysis/gl-narrative",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Route 2: GET /analysis/gl-narrative/:property_id/:period_year
// ---------------------------------------------------------------------------

describe("GET /analysis/gl-narrative/:property_id/:period_year", () => {
  it("returns 200 with the latest analysis row when one exists", async () => {
    const repository = new MemoryAnalysisRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/analysis/gl-narrative/${PROPERTY_ID}/2024`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<GlAnalysisResult>();
    expect(body.id).toBe(ANALYSIS_ID);
  });

  it("returns 200 with null body when no analysis exists (NOT 404)", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.latestRow = null;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/analysis/gl-narrative/${PROPERTY_ID}/2024`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toBeNull();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = createTestApp(new MemoryAnalysisRepository());

    const response = await app.request(
      `/api/v1/analysis/gl-narrative/${PROPERTY_ID}/2024`,
      {},
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Route 3: POST /analysis/gl-narrative/:analysis_id/dismiss
// ---------------------------------------------------------------------------

describe("POST /analysis/gl-narrative/:analysis_id/dismiss", () => {
  it("success: sets dismissed_at and dismissed_by_user_id, returns updated row", async () => {
    const repository = new MemoryAnalysisRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/analysis/gl-narrative/${ANALYSIS_ID}/dismiss`,
      { method: "POST", headers: jsonAuthHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<GlAnalysisResult>();
    expect(body.dismissed_at).toBeTruthy();
    expect(body.dismissed_by_user_id).toBe(USER_ID);
  });

  it("returns 404 when analysis not found", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.dismissedRow = null;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/analysis/gl-narrative/${ANALYSIS_ID}/dismiss`,
      { method: "POST", headers: jsonAuthHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when user is not an editor", async () => {
    const repository = new MemoryAnalysisRepository();
    const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
    app.route(
      "/api/v1",
      createGlNarrativeRoutes({
        repository,
        auth: {
          verifier: jwtVerifier(),
          db: {
            mode: "postgrest-compat",
            auth: authRepository({ role: "viewer" }),
            protectedRecords,
          },
        },
      }),
    );

    const response = await app.request(
      `/api/v1/analysis/gl-narrative/${ANALYSIS_ID}/dismiss`,
      { method: "POST", headers: jsonAuthHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 402 when organization lacks full access", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.fullAccess = false;
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/analysis/gl-narrative/${ANALYSIS_ID}/dismiss`,
      { method: "POST", headers: jsonAuthHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(402);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = createTestApp(new MemoryAnalysisRepository());

    const response = await app.request(
      `/api/v1/analysis/gl-narrative/${ANALYSIS_ID}/dismiss`,
      { method: "POST" },
      testEnv(),
    );

    expect(response.status).toBe(401);
  });
});
