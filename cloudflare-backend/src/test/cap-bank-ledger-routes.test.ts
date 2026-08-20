/**
 * Cap bank ledger routes tests.
 *
 * Tests the GET /reconciliation/leases/:leaseId/cap-bank-ledger endpoint
 * using a fake repository injected via dependencies.
 *
 * Compounding power hand-check (precision=28, ROUND_HALF_UP):
 *   base=10000, rate=0.05, year1: 10000*(1.05)^1 = 10500.00
 *   year2: 10000*(1.05)^2 = 10000*1.1025 = 11025.00
 *   With bank=300 from year1, effective_max year2 = 11325.00
 *   actual=11500 > 11325 => excess=175.00, bank=0
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  LeaseCapProfile,
  FinalizedSnapshotRow as CapBankSnapshotRow,
} from "../domain/reconciliation/cap-bank-ledger";
import type {
  BatchFinalizeResult,
  CalculationJobStatusRecord,
  CreateCalculationJobResult,
  EditableReconciliationField,
  FinalizeSnapshotResult,
  ReconciliationRepository,
  ReconciliationSnapshotRecord,
  SnapshotListFilters,
  SnapshotListResult,
  UpdateCellResult,
} from "../domain/reconciliation/repository";
import type { AppEnv } from "../env";
import { createReconciliationRoutes } from "../http/reconciliation-routes";
import type { AuthVariables } from "../middleware/auth";
import type {
  CalculationDataset,
  CalculationJobRecord,
  SnapshotDraft,
} from "../domain/reconciliation/calculator";
import type { DbAdapter } from "../adapters/db/client";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const SNAPSHOT_ID_1 = "55555555-5555-4555-8555-555555555551";
const SNAPSHOT_ID_2 = "55555555-5555-4555-8555-555555555552";

// ---------------------------------------------------------------------------
// Fake repository
// ---------------------------------------------------------------------------

class FakeReconciliationRepository implements ReconciliationRepository {
  leaseProfile: LeaseCapProfile | null = null;
  snapshots: CapBankSnapshotRow[] = [];
  recordedFeatureKeys: string[] = [];

  async hasFullAccess(): Promise<boolean> {
    return true;
  }
  async createCalculationJob(): Promise<CreateCalculationJobResult> {
    return { state: "property_not_found" };
  }
  async markCalculationEnqueueFailed(): Promise<void> {
    return;
  }
  async getCalculationJob(): Promise<CalculationJobRecord | null> {
    return null;
  }
  async markCalculationRunning(): Promise<boolean> {
    return false;
  }
  async loadCalculationDataset(input: {
    job: CalculationJobRecord;
  }): Promise<CalculationDataset> {
    throw new Error(`Unexpected: ${input.job.id}`);
  }
  async countDraftSnapshots(): Promise<number> {
    return 0;
  }
  async countFinalizedSnapshots(): Promise<number> {
    return 0;
  }
  async deleteDraftSnapshots(): Promise<void> {
    return;
  }
  async insertCalculationSnapshots(input: {
    snapshots: SnapshotDraft[];
  }): Promise<string[]> {
    return input.snapshots.map((s) => s.lease_id);
  }
  async completeCalculationJob(): Promise<void> {
    return;
  }
  async persistCalculationResults(input: {
    snapshots: SnapshotDraft[];
  }): Promise<string[]> {
    return input.snapshots.map((s) => s.lease_id);
  }
  async markCalculationFailed(): Promise<void> {
    return;
  }
  async markRunningCalculationFailed(): Promise<boolean> {
    return false;
  }
  async getJobStatus(): Promise<CalculationJobStatusRecord | null> {
    return null;
  }
  async getSnapshot(): Promise<ReconciliationSnapshotRecord | null> {
    return null;
  }
  async listSnapshots(input: SnapshotListFilters): Promise<SnapshotListResult> {
    return { items: [], total: 0, page: input.page, page_size: input.size };
  }
  async finalizeSnapshot(): Promise<FinalizeSnapshotResult> {
    return { state: "not_found" };
  }
  async finalizeBatch(): Promise<BatchFinalizeResult> {
    return { state: "not_found" };
  }
  async updateCell(input: {
    cellId: string;
    snapshotId: string;
    organizationId: string;
    fieldName: EditableReconciliationField;
    value: string;
    userId: string;
    updatedAt: string;
  }): Promise<UpdateCellResult> {
    return {
      state: "updated",
      cell: {
        id: input.cellId,
        snapshot_id: input.snapshotId,
        field_name: input.fieldName,
        value: input.value,
        is_manual_override: true,
        updated_at: input.updatedAt,
        updated_by: input.userId,
      },
    };
  }
  async getLeaseCapProfile(): Promise<LeaseCapProfile | null> {
    return this.leaseProfile;
  }
  async listFinalizedSnapshotsForLease(): Promise<CapBankSnapshotRow[]> {
    return this.snapshots;
  }
  async recordFeatureUse(input: {
    organizationId: string;
    featureKey: string;
  }): Promise<void> {
    this.recordedFeatureKeys.push(input.featureKey);
  }
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

function makeAuthContext(
  party: "landlord" | "tenant" = "landlord",
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "landlord@example.test",
      fullName: "Test User",
      role: "owner",
      isPlatformAdmin: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role: "owner",
      isServiceAdmin: false,
      party,
      bearerToken: "valid-token",
    },
    ...(party === "tenant"
      ? {
          tenantUser: {
            id: "33333333-3333-4333-8333-333333333333",
            userId: USER_ID,
            organizationId: ORG_ID,
            contactName: "Test Tenant",
            contactEmail: "tenant@example.test",
            createdAt: "2026-01-01T00:00:00Z",
          },
        }
      : {}),
  };
}

function makeApp(
  repository: FakeReconciliationRepository,
  party: "landlord" | "tenant" = "landlord",
) {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const authRepo: AuthRepository = {
    async resolveUserContext() {
      return makeAuthContext(party);
    },
  };
  const db: DbAdapter = {
    mode: "postgrest-compat",
    auth: authRepo,
    protectedRecords,
  };
  app.route(
    "/api/v1",
    createReconciliationRoutes({
      repository,
      auth: { verifier, db },
    }),
  );
  return app;
}

function env(): AppEnv {
  return { ENVIRONMENT: "test", APP_VERSION: "test" } as unknown as AppEnv;
}

function get(
  app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>,
  leaseId: string,
) {
  return app.request(
    `/api/v1/reconciliation/leases/${leaseId}/cap-bank-ledger`,
    {
      method: "GET",
      headers: { authorization: "Bearer valid-token" },
    },
    env(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /reconciliation/leases/:leaseId/cap-bank-ledger", () => {
  it("returns 401 without auth token", async () => {
    const repository = new FakeReconciliationRepository();
    const app = makeApp(repository);
    const res = await app.request(
      `/api/v1/reconciliation/leases/${LEASE_ID}/cap-bank-ledger`,
      { method: "GET" },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a tenant party (landlord-only reconciliation route)", async () => {
    // The cap-bank ledger scopes only by organization id. A tenant JWT carries
    // the landlord org id, so without the party guard it could read any lease's
    // ledger in the org. The auth party guard must deny tenants here.
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Tenant Party Corp",
      capType: "cumulative",
      capRate: "0.05",
      capFixedAmount: null,
      baseYearAmount: "10000",
    };
    const app = makeApp(repository, "tenant");
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 when lease not found", async () => {
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = null;
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    const bodyText = await res.text();
    expect(res.status, `Expected 404 but got ${res.status}: ${bodyText}`).toBe(
      404,
    );
    const body = JSON.parse(bodyText) as { detail: string };
    expect(body.detail).toContain(LEASE_ID);
  });

  it("returns empty ledger for non-cumulative cap type", async () => {
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Acme Corp",
      capType: "percentage",
      capRate: "0.05",
      capFixedAmount: null,
      baseYearAmount: "10000",
    };
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.entries).toEqual([]);
    expect(body.cap_rate).toBe("0");
    expect(body.current_bank_balance).toBe("0.00");
    expect(body.total_landlord_absorbed).toBe("0.00");
  });

  it("returns empty ledger when no finalized snapshots", async () => {
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Test Tenant",
      capType: "cumulative",
      capRate: "0.05",
      capFixedAmount: null,
      baseYearAmount: "10000",
    };
    repository.snapshots = [];
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.entries).toEqual([]);
    // cap_rate preserved even without snapshots
    expect(body.cap_rate).toBe("0.05");
  });

  it("cumulative linear: basic banking and drawdown", async () => {
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Linear Tenant",
      capType: "cumulative",
      capRate: "0.05",
      capFixedAmount: null,
      baseYearAmount: "10000",
    };
    // Year 1: actual=9800 < threshold=10500 → bank 700
    // Year 2: reference=9800, threshold=10290 (9800*1.05=10290), effective_max=10990 (10290+700)
    //         actual=10500 <= 10990 → bank=490
    repository.snapshots = [
      {
        id: SNAPSHOT_ID_1,
        tenant_share_before_cap: "9800",
        period_start_date: "2024-01-01",
        period_end_date: "2024-12-31",
        finalized_at: "2025-01-15T10:00:00Z",
      },
      {
        id: SNAPSHOT_ID_2,
        tenant_share_before_cap: "10500",
        period_start_date: "2025-01-01",
        period_end_date: "2025-12-31",
        finalized_at: "2026-01-15T10:00:00Z",
      },
    ];
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lease_id: string;
      tenant_name: string;
      cap_type: string;
      cap_rate: string;
      entries: Array<Record<string, unknown>>;
      current_bank_balance: string;
      total_landlord_absorbed: string;
    };

    expect(body.lease_id).toBe(LEASE_ID);
    expect(body.tenant_name).toBe("Linear Tenant");
    expect(body.cap_type).toBe("cumulative");
    expect(body.entries).toHaveLength(2);

    const e1 = body.entries[0]!;
    expect(e1["period_start"]).toBe("2024-01-01");
    expect(e1["period_end"]).toBe("2024-12-31");
    expect(e1["snapshot_id"]).toBe(SNAPSHOT_ID_1);
    expect(e1["cap_threshold"]).toBe("10500.00"); // 10000*1.05=10500
    expect(e1["actual_expense"]).toBe("9800.00");
    expect(e1["amount_applied"]).toBe("9800.00");
    expect(e1["excess_absorbed_by_landlord"]).toBe("0.00");
    expect(e1["bank_opening"]).toBe("0.00");
    expect(e1["bank_closing"]).toBe("700.00"); // 10500-9800
    expect(e1["bank_change"]).toBe("700.00");

    const e2 = body.entries[1]!;
    expect(e2["snapshot_id"]).toBe(SNAPSHOT_ID_2);
    // cumulative linear: annual_increase_limit = q(base*rate) = q(10000*0.05) = 500 (fixed, not from running_reference)
    // cap_threshold = running_reference (actual year1=9800) + 500 = 10300
    expect(e2["cap_threshold"]).toBe("10300.00");
    expect(e2["bank_opening"]).toBe("700.00");
    // effective_max = 10300 + 700 = 11000
    expect(e2["actual_expense"]).toBe("10500.00");
    expect(e2["amount_applied"]).toBe("10500.00");
    expect(e2["excess_absorbed_by_landlord"]).toBe("0.00");
    expect(e2["bank_closing"]).toBe("500.00"); // 11000-10500
    expect(body.current_bank_balance).toBe("500.00");
    expect(body.total_landlord_absorbed).toBe("0.00");
  });

  it("cumulative linear: excess absorbed by landlord when actual > effective_max", async () => {
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Over Cap Tenant",
      capType: "cumulative",
      capRate: "0.05",
      capFixedAmount: null,
      baseYearAmount: "10000",
    };
    // threshold=10500, actual=11000 > 10500 → excess=500, bank=0
    repository.snapshots = [
      {
        id: SNAPSHOT_ID_1,
        tenant_share_before_cap: "11000",
        period_start_date: "2024-01-01",
        period_end_date: "2024-12-31",
        finalized_at: "2025-01-15T10:00:00Z",
      },
    ];
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<Record<string, unknown>>;
      total_landlord_absorbed: string;
    };
    const e = body.entries[0]!;
    expect(e["amount_applied"]).toBe("10500.00");
    expect(e["excess_absorbed_by_landlord"]).toBe("500.00");
    expect(e["bank_closing"]).toBe("0.00");
    expect(body.total_landlord_absorbed).toBe("500.00");
  });

  it("cumulative linear: cap_fixed_amount path", async () => {
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Fixed Increase Tenant",
      capType: "cumulative",
      capRate: null,
      capFixedAmount: "500",
      baseYearAmount: "10000",
    };
    // threshold = 10000+500=10500; actual=10300 → bank=200
    repository.snapshots = [
      {
        id: SNAPSHOT_ID_1,
        tenant_share_before_cap: "10300",
        period_start_date: "2024-01-01",
        period_end_date: "2024-12-31",
        finalized_at: null,
      },
    ];
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<Record<string, unknown>>;
    };
    const e = body.entries[0]!;
    expect(e["cap_threshold"]).toBe("10500.00");
    expect(e["bank_closing"]).toBe("200.00");
    expect(e["excess_absorbed_by_landlord"]).toBe("0.00");
  });

  it("compounding multi-year: threshold matches Python quantize-once", async () => {
    // Hand-computed expected values:
    // base=10000, rate=0.05, precision=28 ROUND_HALF_UP
    //
    // Year 1: cap_threshold = q(10000 * 1.05^1) = q(10500.00) = 10500.00
    //   actual=10200 <= 10500 → bank=300.00, excess=0
    //
    // Year 2: cap_threshold = q(10000 * 1.05^2) = q(10000*1.1025) = q(11025.00) = 11025.00
    //   effective_max = q(11025.00 + 300.00) = 11325.00
    //   actual=11500 > 11325 → excess=175.00, bank=0
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Compounding Tenant",
      capType: "cumulative_compounding",
      capRate: "0.05",
      capFixedAmount: null,
      baseYearAmount: "10000",
    };
    repository.snapshots = [
      {
        id: SNAPSHOT_ID_1,
        tenant_share_before_cap: "10200",
        period_start_date: "2024-01-01",
        period_end_date: "2024-12-31",
        finalized_at: "2025-01-15T10:00:00Z",
      },
      {
        id: SNAPSHOT_ID_2,
        tenant_share_before_cap: "11500",
        period_start_date: "2025-01-01",
        period_end_date: "2025-12-31",
        finalized_at: "2026-01-15T10:00:00Z",
      },
    ];
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<Record<string, unknown>>;
      current_bank_balance: string;
      total_landlord_absorbed: string;
    };
    expect(body.entries).toHaveLength(2);

    const e1 = body.entries[0]!;
    expect(e1["cap_threshold"]).toBe("10500.00");
    expect(e1["bank_closing"]).toBe("300.00");
    expect(e1["excess_absorbed_by_landlord"]).toBe("0.00");

    const e2 = body.entries[1]!;
    expect(e2["cap_threshold"]).toBe("11025.00"); // 10000 * 1.05^2 quantized once
    expect(e2["bank_opening"]).toBe("300.00");
    // effective_max = 11025 + 300 = 11325
    expect(e2["amount_applied"]).toBe("11325.00");
    expect(e2["excess_absorbed_by_landlord"]).toBe("175.00");
    expect(e2["bank_closing"]).toBe("0.00");

    expect(body.current_bank_balance).toBe("0.00");
    expect(body.total_landlord_absorbed).toBe("175.00");
  });

  it("compounding: cap_fixed_amount path (fixed annual $ increase)", async () => {
    // base=10000, fixed=600, year1: threshold=10600, actual=10400 → bank=200
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Compounding Fixed Tenant",
      capType: "cumulative_compounding",
      capRate: null,
      capFixedAmount: "600",
      baseYearAmount: "10000",
    };
    repository.snapshots = [
      {
        id: SNAPSHOT_ID_1,
        tenant_share_before_cap: "10400",
        period_start_date: "2024-01-01",
        period_end_date: "2024-12-31",
        finalized_at: null,
      },
    ];
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<Record<string, unknown>>;
    };
    const e = body.entries[0]!;
    expect(e["cap_threshold"]).toBe("10600.00"); // 10000 + 600*1
    expect(e["bank_closing"]).toBe("200.00");
  });

  it("records feature use cap_bank_tracking", async () => {
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Feature Tenant",
      capType: "cumulative",
      capRate: "0.05",
      capFixedAmount: null,
      baseYearAmount: "10000",
    };
    const app = makeApp(repository);
    await get(app, LEASE_ID);
    expect(repository.recordedFeatureKeys).toContain("cap_bank_tracking");
  });

  it("response includes pool_name null and correct top-level fields", async () => {
    const repository = new FakeReconciliationRepository();
    repository.leaseProfile = {
      leaseId: LEASE_ID,
      tenantName: "Full Response Tenant",
      capType: "cumulative",
      capRate: "0.05",
      capFixedAmount: null,
      baseYearAmount: "10000",
    };
    repository.snapshots = [
      {
        id: SNAPSHOT_ID_1,
        tenant_share_before_cap: "10000",
        period_start_date: "2024-01-01",
        period_end_date: "2024-12-31",
        finalized_at: null,
      },
    ];
    const app = makeApp(repository);
    const res = await get(app, LEASE_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["lease_id"]).toBe(LEASE_ID);
    expect(body["pool_name"]).toBeNull();
    expect(typeof body["cap_rate"]).toBe("string");
    expect(typeof body["current_bank_balance"]).toBe("string");
    expect(typeof body["total_landlord_absorbed"]).toBe("string");
  });
});
