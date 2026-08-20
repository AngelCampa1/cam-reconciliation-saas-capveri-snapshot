import Decimal from "decimal.js";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import { classifyEntries } from "../domain/capex/classifier";
import type {
  CapExFlagRow,
  CapExRepository,
  GlEntryAmountRow,
  ReviewFlagInput,
  ReviewFlagsInput,
  ReviewFlagsResult,
  UpsertFlagInput,
} from "../domain/capex/repository";
import type { Disposition } from "../domain/capex/classifier";
import type { AppEnv } from "../env";
import { createCapExRoutes } from "../http/capex-routes";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const FLAG_ID_1 = "44444444-4444-4444-8444-444444444441";
const FLAG_ID_2 = "44444444-4444-4444-8444-444444444442";
const GL_ID_1 = "55555555-5555-4555-8555-555555555551";
const GL_ID_2 = "55555555-5555-4555-8555-555555555552";

// ── In-memory repository ─────────────────────────────────────────────────────

class MemoryCapExRepository implements CapExRepository {
  fullAccess = true;

  glEntries: Array<{
    id: string;
    amount: string;
    account_code: string | null;
    account_description: string | null;
    vendor_name: string | null;
    description: string | null;
    transaction_date: string;
  }> = [];

  flags: CapExFlagRow[] = [];
  upserted: UpsertFlagInput[] = [];

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async listGlEntries(): Promise<
    Array<{
      id: string;
      amount: string;
      account_code: string | null;
      account_description: string | null;
      vendor_name: string | null;
      description: string | null;
      transaction_date: string;
    }>
  > {
    return this.glEntries;
  }

  async upsertFlags(flags: UpsertFlagInput[]): Promise<void> {
    this.upserted.push(...flags);
    for (const f of flags) {
      this.flags.push({
        id: FLAG_ID_1,
        organization_id: f.organization_id,
        gl_entry_id: f.gl_entry_id,
        property_id: f.property_id,
        period_year: f.period_year,
        flag_reason: f.flag_reason,
        rule_name: f.rule_name,
        confidence_score: f.confidence_score,
        matched_pattern: f.matched_pattern,
        disposition: f.disposition,
        reviewed_at: null,
        reviewed_by_user_id: null,
        review_note: null,
        classifier_version: f.classifier_version,
        created_at: "2026-01-01T00:00:00Z",
      });
    }
  }

  async listFlags(input: {
    disposition?: Disposition | null;
  }): Promise<CapExFlagRow[]> {
    if (input.disposition != null) {
      return this.flags.filter((f) => f.disposition === input.disposition);
    }
    return this.flags;
  }

  async reviewFlag(input: ReviewFlagInput): Promise<CapExFlagRow | null> {
    const idx = this.flags.findIndex(
      (f) =>
        f.id === input.flagId && f.organization_id === input.organizationId,
    );
    if (idx === -1) return null;
    const flag = this.flags[idx];
    if (flag === undefined) return null;
    const updated: CapExFlagRow = {
      ...flag,
      disposition: input.disposition,
      reviewed_at: input.reviewedAt,
      reviewed_by_user_id: input.reviewedByUserId,
      review_note: input.reviewNote,
    };
    this.flags[idx] = updated;
    return updated;
  }

  async reviewFlags(input: ReviewFlagsInput): Promise<ReviewFlagsResult> {
    const foundIds = new Set(
      this.flags
        .filter(
          (f) =>
            input.flagIds.includes(f.id) &&
            f.organization_id === input.organizationId,
        )
        .map((f) => f.id),
    );
    const missingFlagIds = input.flagIds.filter((id) => !foundIds.has(id));

    if (missingFlagIds.length > 0) {
      return { status: "not_found", missingFlagIds };
    }

    const updatedById = new Map<string, CapExFlagRow>();
    this.flags = this.flags.map((flag) => {
      if (!foundIds.has(flag.id)) return flag;
      const updated: CapExFlagRow = {
        ...flag,
        disposition: input.disposition,
        reviewed_at: input.reviewedAt,
        reviewed_by_user_id: input.reviewedByUserId,
        review_note: input.reviewNote,
      };
      updatedById.set(flag.id, updated);
      return updated;
    });

    return {
      status: "reviewed",
      flags: input.flagIds.map((id) => updatedById.get(id)!),
    };
  }

  async findFlagIds(input: { flagIds: string[] }): Promise<string[]> {
    return this.flags
      .filter((f) => input.flagIds.includes(f.id))
      .map((f) => f.id);
  }

  async listGlEntryAmounts(input: {
    entryIds: string[];
  }): Promise<GlEntryAmountRow[]> {
    return this.glEntries
      .filter((e) => input.entryIds.includes(e.id))
      .map((e) => ({ id: e.id, amount: e.amount }));
  }
}

// ── Classifier unit tests ────────────────────────────────────────────────────

describe("classifyEntries (pure function)", () => {
  it("returns no matches for an empty entry list", () => {
    expect(classifyEntries([])).toEqual([]);
  });

  it("amount_threshold fires at 25000 with confidence 0.60", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "25000.00",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
      },
    ]);
    const rule = matches.find((m) => m.rule_name === "amount_threshold");
    expect(rule).toBeDefined();
    expect(rule?.confidence).toBe("0.60");
  });

  it("amount_threshold fires at 100000 with confidence 0.85", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "150000.00",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
      },
    ]);
    const rule = matches.find((m) => m.rule_name === "amount_threshold");
    expect(rule?.confidence).toBe("0.85");
  });

  it("account_keyword fires on high-confidence keyword with 0.90", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "100.00",
        account_code: null,
        account_description: "Tenant improvement work",
        vendor_name: null,
        description: null,
      },
    ]);
    const rule = matches.find((m) => m.rule_name === "account_keyword");
    expect(rule?.confidence).toBe("0.90");
    expect(rule?.matched_pattern).toBe("tenant improvement");
  });

  it("account_keyword fires on medium-confidence keyword with 0.65", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "100.00",
        account_code: null,
        account_description: "Renovation project",
        vendor_name: null,
        description: null,
      },
    ]);
    const rule = matches.find((m) => m.rule_name === "account_keyword");
    expect(rule?.confidence).toBe("0.65");
  });

  it("account_code_prefix fires for 15xx account codes with 0.75", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "500.00",
        account_code: "1510",
        account_description: null,
        vendor_name: null,
        description: null,
      },
    ]);
    const rule = matches.find((m) => m.rule_name === "account_code_prefix");
    expect(rule?.confidence).toBe("0.75");
    expect(rule?.matched_pattern).toBe("15*");
  });

  it("vendor_pattern fires for roofing vendor with 0.55", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "500.00",
        account_code: null,
        account_description: null,
        vendor_name: "ABC Roofing LLC",
        description: null,
      },
    ]);
    const rule = matches.find((m) => m.rule_name === "vendor_pattern");
    expect(rule?.confidence).toBe("0.55");
  });

  it("amount_keyword_combo fires for amount > 10K + keyword with 0.80", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "15000.00",
        account_code: null,
        account_description: "Construction work",
        vendor_name: null,
        description: null,
      },
    ]);
    const rule = matches.find((m) => m.rule_name === "amount_keyword_combo");
    expect(rule?.confidence).toBe("0.80");
  });

  it("deduplicates matches with same (gl_entry_id, rule_name)", () => {
    // Two entries with same ID — should only produce one match per rule
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "50000.00",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
      },
      {
        id: GL_ID_1,
        amount: "50000.00",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
      },
    ]);
    const amountMatches = matches.filter(
      (m) => m.rule_name === "amount_threshold",
    );
    expect(amountMatches).toHaveLength(1);
  });

  it("hand-checked multi-entry classification: $150K entry gets 0.85, $30K gets 0.60", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "150000.00",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
      },
      {
        id: GL_ID_2,
        amount: "30000.00",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
      },
    ]);

    const big = matches.find(
      (m) => m.gl_entry_id === GL_ID_1 && m.rule_name === "amount_threshold",
    );
    const medium = matches.find(
      (m) => m.gl_entry_id === GL_ID_2 && m.rule_name === "amount_threshold",
    );

    expect(big?.confidence).toBe("0.85");
    expect(medium?.confidence).toBe("0.60");

    // Hand-checked: Decimal("150000").abs() >= 100000 → 0.85; 30000 >= 25000 → 0.60
    expect(new Decimal(big?.confidence ?? "0").toFixed(2)).toBe("0.85");
    expect(new Decimal(medium?.confidence ?? "0").toFixed(2)).toBe("0.60");
  });

  it("does not fire amount_keyword_combo for amount <= 10000", () => {
    const matches = classifyEntries([
      {
        id: GL_ID_1,
        amount: "9999.99",
        account_code: null,
        account_description: "Capital improvement",
        vendor_name: null,
        description: null,
      },
    ]);
    const combo = matches.find((m) => m.rule_name === "amount_keyword_combo");
    expect(combo).toBeUndefined();
    // But account_keyword still fires
    const kw = matches.find((m) => m.rule_name === "account_keyword");
    expect(kw).toBeDefined();
  });
});

// ── Route integration tests ──────────────────────────────────────────────────

describe("capex routes — POST /analysis/capex-classify", () => {
  it("returns flags_created=0 when no GL entries exist", async () => {
    const repo = new MemoryCapExRepository();
    const app = buildApp(repo);
    const res = await app.request(
      "/api/v1/analysis/capex-classify",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      flags_created: 0,
      gl_entries_scanned: 0,
      property_id: PROPERTY_ID,
      period_year: 2024,
    });
  });

  it("classifies GL entries and upserts flags", async () => {
    const repo = new MemoryCapExRepository();
    repo.glEntries = [
      {
        id: GL_ID_1,
        amount: "150000.00",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
        transaction_date: "2024-03-01",
      },
    ];
    const app = buildApp(repo);
    const res = await app.request(
      "/api/v1/analysis/capex-classify",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      flags_created: number;
      gl_entries_scanned: number;
    };
    expect(body.gl_entries_scanned).toBe(1);
    expect(body.flags_created).toBeGreaterThanOrEqual(1);
    expect(repo.upserted.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 402 when org has no full access", async () => {
    const repo = new MemoryCapExRepository();
    repo.fullAccess = false;
    const app = buildApp(repo);
    const res = await app.request(
      "/api/v1/analysis/capex-classify",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "subscription_required" },
    });
  });

  it("returns 403 when caller is a viewer (not editor)", async () => {
    const repo = new MemoryCapExRepository();
    const app = buildApp(repo, "viewer");
    const res = await app.request(
      "/api/v1/analysis/capex-classify",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, period_year: 2024 }),
      },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when no auth header", async () => {
    const repo = new MemoryCapExRepository();
    const app = buildApp(repo);
    const res = await app.request(
      "/api/v1/analysis/capex-classify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
      testEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe("capex routes — GET /analysis/capex-flags/:propertyId/:periodYear", () => {
  it("returns empty array when no flags exist", async () => {
    const repo = new MemoryCapExRepository();
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${PROPERTY_ID}/2024`,
      { headers: authHeaders() },
      testEnv(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns flags for a property/year", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [makeFlag(FLAG_ID_1, "pending")];
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${PROPERTY_ID}/2024`,
      { headers: authHeaders() },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
  });

  it("filters by disposition query param", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [
      makeFlag(FLAG_ID_1, "pending"),
      makeFlag(FLAG_ID_2, "dismissed"),
    ];
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${PROPERTY_ID}/2024?disposition=pending`,
      { headers: authHeaders() },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ disposition: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.disposition).toBe("pending");
  });

  it("returns 401 when unauthenticated", async () => {
    const repo = new MemoryCapExRepository();
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${PROPERTY_ID}/2024`,
      {},
      testEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe("capex routes — GET /analysis/capex-summary/:propertyId/:periodYear", () => {
  it("returns zero summary when no flags exist", async () => {
    const repo = new MemoryCapExRepository();
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-summary/${PROPERTY_ID}/2024`,
      { headers: authHeaders() },
      testEnv(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      total: 0,
      pending: 0,
      confirmed_capex: 0,
      dismissed: 0,
      total_flagged_amount: "0.00",
    });
  });

  it("sums flagged GL entry amounts correctly — hand-checked Decimal value", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [
      makeFlag(FLAG_ID_1, "pending"),
      makeFlag(FLAG_ID_2, "confirmed_capex"),
    ];
    // Two GL entries: 12345.67 and 999.33 → total = 13345.00
    repo.glEntries = [
      {
        id: GL_ID_1,
        amount: "12345.67",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
        transaction_date: "2024-01-01",
      },
      {
        id: GL_ID_2,
        amount: "999.33",
        account_code: null,
        account_description: null,
        vendor_name: null,
        description: null,
        transaction_date: "2024-01-01",
      },
    ];
    // Flags reference those GL entries
    repo.flags[0]!.gl_entry_id = GL_ID_1;
    repo.flags[1]!.gl_entry_id = GL_ID_2;

    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-summary/${PROPERTY_ID}/2024`,
      { headers: authHeaders() },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      pending: number;
      confirmed_capex: number;
      dismissed: number;
      total_flagged_amount: string;
    };
    expect(body.total).toBe(2);
    expect(body.pending).toBe(1);
    expect(body.confirmed_capex).toBe(1);
    expect(body.dismissed).toBe(0);
    // Hand-checked: 12345.67 + 999.33 = 13345.00
    expect(body.total_flagged_amount).toBe("13345.00");
    // Verify via Decimal: abs("12345.67") + abs("999.33") = 13345.00
    const expected = new Decimal("12345.67").plus(new Decimal("999.33"));
    expect(expected.toFixed(2)).toBe("13345.00");
  });

  it("returns 401 when unauthenticated", async () => {
    const repo = new MemoryCapExRepository();
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-summary/${PROPERTY_ID}/2024`,
      {},
      testEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe("capex routes — POST /analysis/capex-flags/:flagId/review", () => {
  it("reviews a flag and returns updated record", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [makeFlag(FLAG_ID_1, "pending")];
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${FLAG_ID_1}/review`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          disposition: "confirmed_capex",
          review_note: "Verified",
        }),
      },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      disposition: string;
      review_note: string;
    };
    expect(body.disposition).toBe("confirmed_capex");
    expect(body.review_note).toBe("Verified");
  });

  it("returns 404 when flag not found", async () => {
    const repo = new MemoryCapExRepository();
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${FLAG_ID_1}/review`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ disposition: "dismissed" }),
      },
      testEnv(),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "capex_flag_not_found" },
    });
  });

  it("returns 402 when org has no full access", async () => {
    const repo = new MemoryCapExRepository();
    repo.fullAccess = false;
    repo.flags = [makeFlag(FLAG_ID_1, "pending")];
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${FLAG_ID_1}/review`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ disposition: "dismissed" }),
      },
      testEnv(),
    );
    expect(res.status).toBe(402);
  });

  it("returns 403 for viewer role", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [makeFlag(FLAG_ID_1, "pending")];
    const app = buildApp(repo, "viewer");
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${FLAG_ID_1}/review`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ disposition: "dismissed" }),
      },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [makeFlag(FLAG_ID_1, "pending")];
    const app = buildApp(repo);
    const res = await app.request(
      `/api/v1/analysis/capex-flags/${FLAG_ID_1}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"disposition":"dismissed"}',
      },
      testEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe("capex routes — POST /analysis/capex-flags/bulk-review", () => {
  it("bulk-reviews multiple flags", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [
      makeFlag(FLAG_ID_1, "pending"),
      makeFlag(FLAG_ID_2, "pending"),
    ];
    const app = buildApp(repo);
    const res = await app.request(
      "/api/v1/analysis/capex-flags/bulk-review",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          flag_ids: [FLAG_ID_1, FLAG_ID_2],
          disposition: "dismissed",
          review_note: "Batch dismissed",
        }),
      },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ disposition: string }>;
    expect(body).toHaveLength(2);
    expect(body.every((f) => f.disposition === "dismissed")).toBe(true);
  });

  it("preserves duplicate flag IDs in bulk-review responses", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [
      makeFlag(FLAG_ID_1, "pending"),
      makeFlag(FLAG_ID_2, "pending"),
    ];
    const app = buildApp(repo);
    const res = await app.request(
      "/api/v1/analysis/capex-flags/bulk-review",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          flag_ids: [FLAG_ID_1, FLAG_ID_2, FLAG_ID_1],
          disposition: "dismissed",
        }),
      },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body.map((flag) => flag.id)).toEqual([
      FLAG_ID_1,
      FLAG_ID_2,
      FLAG_ID_1,
    ]);
  });

  it("returns 404 when any flag ID is not found", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [makeFlag(FLAG_ID_1, "pending")];
    const app = buildApp(repo);
    const res = await app.request(
      "/api/v1/analysis/capex-flags/bulk-review",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          flag_ids: [FLAG_ID_1, FLAG_ID_2],
          disposition: "dismissed",
        }),
      },
      testEnv(),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "capex_flag_not_found" },
    });
    expect(repo.flags[0]?.disposition).toBe("pending");
    expect(repo.flags[0]?.reviewed_at).toBeNull();
  });

  it("returns 402 when org has no full access", async () => {
    const repo = new MemoryCapExRepository();
    repo.fullAccess = false;
    const app = buildApp(repo);
    const res = await app.request(
      "/api/v1/analysis/capex-flags/bulk-review",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          flag_ids: [FLAG_ID_1],
          disposition: "dismissed",
        }),
      },
      testEnv(),
    );
    expect(res.status).toBe(402);
  });

  it("returns 403 for viewer role", async () => {
    const repo = new MemoryCapExRepository();
    repo.flags = [makeFlag(FLAG_ID_1, "pending")];
    const app = buildApp(repo, "viewer");
    const res = await app.request(
      "/api/v1/analysis/capex-flags/bulk-review",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          flag_ids: [FLAG_ID_1],
          disposition: "dismissed",
        }),
      },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

type Role = "owner" | "admin" | "member" | "viewer";

function buildApp(
  repository: CapExRepository,
  role: Role = "owner",
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createCapExRoutes({
      repository,
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(role),
          protectedRecords: fakeProtectedRecords(),
        },
      },
    }),
  );
  return app;
}

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

function authRepository(role: Role = "owner"): DbAdapter["auth"] {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role,
          isServiceAdmin: false,
          party: "landlord",
          bearerToken: "valid-token",
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "owner@example.com",
          fullName: "Owner",
          role,
          isPlatformAdmin: false,
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        },
      };
    },
  };
}

function fakeProtectedRecords(): ProtectedRecordRepository {
  return {
    async list() {
      return [];
    },
    async update() {
      return undefined;
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
    PROTECTED_RECORDS: fakeProtectedRecords(),
    OPENROUTER_API_KEY: "openrouter",
    RESEND_API_KEY: "resend",
    STRIPE_SECRET_KEY: "stripe",
    STRIPE_WEBHOOK_SECRET: "webhook",
    PUBLIC_APP_URL: "https://app.capveri.com",
    FEEDBACK_SCREENSHOTS_BUCKET: {} as R2Bucket,
    FEEDBACK_HMAC_SECRET: "feedback-secret",
  } as unknown as AppEnv;
}

function makeFlag(id: string, disposition: Disposition): CapExFlagRow {
  return {
    id,
    organization_id: ORG_ID,
    gl_entry_id: GL_ID_1,
    property_id: PROPERTY_ID,
    period_year: 2024,
    flag_reason: "Amount exceeds threshold",
    rule_name: "amount_threshold",
    confidence_score: "0.85",
    matched_pattern: null,
    disposition,
    reviewed_at: null,
    reviewed_by_user_id: null,
    review_note: null,
    classifier_version: "1.0",
    created_at: "2026-01-01T00:00:00Z",
  };
}
