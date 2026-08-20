import { Hono } from "hono";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  ActualBilledInsert,
  ActualBilledRecord,
  ActualBilledRepository,
  DeleteBillingResult,
  LeakageSummaryDataset,
  ManualBillingResult,
  ReconciliationRecoveryRecord,
  UploadBillingResult,
} from "../domain/actual-billed/repository";
import { PostgresActualBilledRepository } from "../adapters/db/actual-billed";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";
import {
  parseBillingCsv,
  parseBillingXlsx,
} from "../domain/actual-billed/billing-parser";
import type { AppEnv } from "../env";
import { createActualBilledRoutes } from "../http/actual-billed-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROPERTY_ID = "33333333-3333-4333-8333-333333333334";
const POOL_ID = "44444444-4444-4444-8444-444444444444";
const LEASE_ID = "55555555-5555-4555-8555-555555555555";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryActualBilledRepository implements ActualBilledRepository {
  propertyExists = true;
  poolExists = true;
  periodFinalized = false;
  rows: ActualBilledRecord[] = [
    billedRecord({
      tenant_name: "Acme Retail",
      billed_amount: "900.00",
    }),
  ];
  uploadCalls: Array<{
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    rows: ActualBilledInsert[];
  }> = [];
  manualCalls: Array<{
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    totalBilled: string;
    poolId: string | null;
  }> = [];
  deleteCalls: Array<{
    organizationId: string;
    propertyId: string;
    periodStart?: string;
    periodEnd?: string;
  }> = [];
  matchCalls: Array<{
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    matches: Array<{ billedRowId: string; leaseId: string }>;
  }> = [];
  matchResult: "updated" | "invalid_match" = "updated";
  snapshots: ReconciliationRecoveryRecord[] = [
    { lease_id: LEASE_ID, total_recovery: "1200.00" },
  ];
  hasImportBatches = true;
  leases = [{ id: LEASE_ID, tenant_name: "Acme Retail" }];
  summaryDataset: LeakageSummaryDataset = {
    propertyIds: [PROPERTY_ID, OTHER_PROPERTY_ID],
    finalizedSnapshots: [
      { property_id: PROPERTY_ID, total_recovery: "1200.00" },
      { property_id: OTHER_PROPERTY_ID, total_recovery: "500.00" },
    ],
    draftSnapshots: [
      { property_id: OTHER_PROPERTY_ID, total_recovery: "250.00" },
    ],
    billedRows: [
      { property_id: PROPERTY_ID, billed_amount: "900.00" },
      { property_id: OTHER_PROPERTY_ID, billed_amount: "700.00" },
      {
        property_id: "33333333-3333-4333-8333-333333333335",
        billed_amount: "1000.00",
      },
    ],
  };

  async createUploadRows(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    rows: ActualBilledInsert[];
  }): Promise<UploadBillingResult> {
    this.uploadCalls.push(input);
    if (!this.propertyExists) {
      return { state: "property_not_found" };
    }
    if (this.periodFinalized) {
      return { state: "period_finalized" };
    }

    return {
      state: "created",
      insertedCount: input.rows.length,
      rows: input.rows.map((row, index) => ({
        id: `66666666-6666-4666-8666-66666666666${index}`,
        tenantName: row.tenantName,
        billedAmount: row.billedAmount,
        suite: row.suite,
        leaseId:
          row.tenantName === "Unmatched Tenant"
            ? null
            : "55555555-5555-4555-8555-555555555555",
      })),
    };
  }

  async createManualEntry(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    totalBilled: string;
    poolId: string | null;
  }): Promise<ManualBillingResult> {
    this.manualCalls.push(input);
    if (!this.propertyExists) {
      return { state: "property_not_found" };
    }
    if (this.periodFinalized) {
      return { state: "period_finalized" };
    }
    if (!this.poolExists) {
      return { state: "pool_not_found" };
    }

    return {
      state: "created",
      record: billedRecord({
        billed_amount: input.totalBilled,
        pool_id: input.poolId,
      }),
    };
  }

  async listBilledAmounts(): Promise<ActualBilledRecord[] | null> {
    return this.propertyExists ? this.rows : null;
  }

  async deleteBilledAmounts(input: {
    organizationId: string;
    propertyId: string;
    periodStart?: string;
    periodEnd?: string;
  }): Promise<DeleteBillingResult> {
    this.deleteCalls.push(input);
    if (!this.propertyExists) {
      return { state: "property_not_found" };
    }
    if (this.periodFinalized) {
      return { state: "period_finalized" };
    }

    return { state: "deleted", deletedCount: 1 };
  }

  async updateBilledRowMatches(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    matches: Array<{ billedRowId: string; leaseId: string }>;
  }) {
    this.matchCalls.push(input);
    if (!this.propertyExists) {
      return { state: "property_not_found" } as const;
    }
    if (this.periodFinalized) {
      return { state: "period_finalized" } as const;
    }
    if (this.matchResult === "invalid_match") {
      return { state: "invalid_match" } as const;
    }

    return { state: "updated", updatedCount: input.matches.length } as const;
  }

  async loadLeakageDataset() {
    return {
      propertyExists: this.propertyExists,
      snapshots: this.snapshots,
      hasImportBatches: this.hasImportBatches,
      billedRows: this.rows.map((row) => ({
        tenant_name: row.tenant_name,
        billed_amount: row.billed_amount,
      })),
      leases: this.leases,
    };
  }

  async loadBillingExposureDataset() {
    return {
      propertyExists: this.propertyExists,
      snapshots: this.snapshots,
      billedRows: this.rows.map((row) => ({
        billed_amount: row.billed_amount,
      })),
    };
  }

  async loadLeakageSummaryDataset(): Promise<LeakageSummaryDataset> {
    return this.summaryDataset;
  }
}

function createTestApp(
  options: {
    repository?: MemoryActualBilledRepository;
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
) {
  const repository = options.repository ?? new MemoryActualBilledRepository();
  const context = createAuthContext(options.role ?? "member");
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
    createActualBilledRoutes({
      repository,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository };
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"],
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-13T00:00:00Z",
      updatedAt: "2026-06-13T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role,
      isServiceAdmin: false,
      party: role === "tenant" ? "tenant" : "landlord",
      bearerToken: "valid-token",
    },
  };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

function authHeaders(extra: Record<string, string> = {}) {
  return { authorization: "Bearer valid-token", ...extra };
}

function billedRecord(
  overrides: Partial<ActualBilledRecord> = {},
): ActualBilledRecord {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    organization_id: ORG_ID,
    property_id: PROPERTY_ID,
    period_start_date: "2026-01-01",
    period_end_date: "2026-12-31",
    tenant_name: "TOTAL (Manual Entry)",
    billed_amount: "1000.00",
    source_type: "manual",
    lease_id: null,
    pool_id: null,
    ...overrides,
  };
}

function csvFile(text: string): File {
  return new File([text], "billing.csv", { type: "text/csv" });
}

async function xlsxFile(rows: string[][]): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Billing");
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();

  return new File([buffer], "billing.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("billing parser", () => {
  it("parses tenant billing rows and skips totals and invalid amounts", () => {
    const parsed = parseBillingCsv({
      filename: "yardi-billing.csv",
      text: [
        "Tenant,Suite,Billed Amount",
        'Acme Retail,100,"$1,200.50"',
        "Grand Total,,1200.50",
        "Bad Amount,200,n/a",
      ].join("\n"),
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.sourceType).toBe("yardi_recon");
      expect(parsed.totalBilled).toBe("1200.5");
      expect(parsed.data).toEqual([
        { tenantName: "Acme Retail", suite: "100", billedAmount: "1200.5" },
      ]);
      expect(parsed.warnings).toEqual([
        "Skipped row 4: amount was not a number",
      ]);
    }
  });

  it("returns FastAPI-compatible parser failures for missing columns", () => {
    const parsed = parseBillingCsv({
      filename: "billing.csv",
      text: "Customer,Value\nAcme,100",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.errors).toEqual([
      "Could not find tenant column. Expected: tenant, lessee, occupant, or name",
      "Could not find amount column. Expected: billed, amount, total, charges, amount billed, or CAM billed",
    ]);
  });

  it("accepts common CAM billed amount export headings", () => {
    const parsed = parseBillingCsv({
      filename: "tenant-billings.csv",
      text: [
        "Tenant Name,Suite No,Lease Amount,Annual CAM",
        'Acme Retail,100,99999,"$1,200.00"',
        "Beta Foods,200,88888,800.25",
      ].join("\n"),
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.totalBilled).toBe("2000.25");
      expect(parsed.data).toEqual([
        { tenantName: "Acme Retail", suite: "100", billedAmount: "1200" },
        { tenantName: "Beta Foods", suite: "200", billedAmount: "800.25" },
      ]);
    }
  });

  it("warns when a row has an amount but no tenant", () => {
    const parsed = parseBillingCsv({
      filename: "billing.csv",
      text: ["Tenant,Billed Amount", ",100", "Acme Retail,200"].join("\n"),
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.totalBilled).toBe("200");
      expect(parsed.warnings).toEqual(["Skipped row 2: tenant was blank"]);
    }
  });

  it("parses XLSX billing rows with the CSV parser rules", async () => {
    const file = await xlsxFile([
      ["Tenant Name", "Suite No", "Amount Charged"],
      ["Acme Retail", "100", "$1,200.00"],
      ["Beta Foods", "200", "800.25"],
    ]);
    const parsed = await parseBillingXlsx({
      filename: file.name,
      bytes: await file.arrayBuffer(),
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.totalBilled).toBe("2000.25");
      expect(parsed.data).toEqual([
        { tenantName: "Acme Retail", suite: "100", billedAmount: "1200" },
        { tenantName: "Beta Foods", suite: "200", billedAmount: "800.25" },
      ]);
    }
  });
});

describe("actual billed routes", () => {
  it("uploads parsed billing CSV rows", async () => {
    const { app, repository } = createTestApp();
    const form = new FormData();
    form.set("file", csvFile("Tenant,Billed Amount\nAcme Retail,1200.50"));
    form.set("property_id", PROPERTY_ID);
    form.set("period_start", "2026-01-01");
    form.set("period_end", "2026-12-31");
    const response = await app.request(
      "/api/v1/actual-billed/upload",
      {
        method: "POST",
        headers: authHeaders({ "content-length": "500" }),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      source_type: "csv_import",
      total_billed: "1200.5",
      row_count: 1,
      matched_row_count: 1,
      unmatched_row_count: 0,
      items: [
        {
          tenant_name: "Acme Retail",
          billed_amount: "1200.5",
          lease_id: LEASE_ID,
          match_status: "matched",
        },
      ],
      warnings: [],
    });
    expect(repository.uploadCalls[0]).toMatchObject({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      rows: [
        {
          tenantName: "Acme Retail",
          billedAmount: "1200.5",
          sourceType: "csv_import",
          suite: null,
        },
      ],
    });
  });

  it("rejects billed amounts over the NUMERIC(14,2) ceiling with a 422 and no persist", async () => {
    const { app, repository } = createTestApp();
    const form = new FormData();
    form.set(
      "file",
      csvFile("Tenant,Billed Amount\nAcme Retail,9999999999999.99"),
    );
    form.set("property_id", PROPERTY_ID);
    form.set("period_start", "2026-01-01");
    form.set("period_end", "2026-12-31");
    const response = await app.request(
      "/api/v1/actual-billed/upload",
      {
        method: "POST",
        headers: authHeaders({ "content-length": "500" }),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "billed_amount_out_of_range" },
    });
    expect(repository.uploadCalls).toHaveLength(0);
  });

  it("returns review warnings for uploaded billed rows without a lease match", async () => {
    const { app } = createTestApp();
    const form = new FormData();
    form.set("file", csvFile("Tenant,Billed Amount\nUnmatched Tenant,1200.50"));
    form.set("property_id", PROPERTY_ID);
    form.set("period_start", "2026-01-01");
    form.set("period_end", "2026-12-31");
    const response = await app.request(
      "/api/v1/actual-billed/upload",
      {
        method: "POST",
        headers: authHeaders({ "content-length": "500" }),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      matched_row_count: 0,
      unmatched_row_count: 1,
      items: [
        {
          tenant_name: "Unmatched Tenant",
          billed_amount: "1200.5",
          lease_id: null,
          match_status: "needs_review",
        },
      ],
      warnings: [
        "Row 1 needs review. Unmatched Tenant did not match a lease.",
      ],
    });
  });

  it("uses original upload row numbers in lease-match warnings", async () => {
    const { app } = createTestApp();
    const form = new FormData();
    form.set(
      "file",
      csvFile(
        "Tenant,Billed Amount\nAcme Retail,900\nUnmatched Tenant,1200.50",
      ),
    );
    form.set("property_id", PROPERTY_ID);
    form.set("period_start", "2026-01-01");
    form.set("period_end", "2026-12-31");
    const response = await app.request(
      "/api/v1/actual-billed/upload",
      {
        method: "POST",
        headers: authHeaders({ "content-length": "500" }),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      matched_row_count: 1,
      unmatched_row_count: 1,
      warnings: [
        "Row 2 needs review. Unmatched Tenant did not match a lease.",
      ],
    });
  });

  it("blocks billing uploads for finalized reconciliation periods", async () => {
    const repository = new MemoryActualBilledRepository();
    repository.periodFinalized = true;
    const { app } = createTestApp({ repository });
    const form = new FormData();
    form.set("file", csvFile("Tenant,Billed Amount\nAcme Retail,1200.50"));
    form.set("property_id", PROPERTY_ID);
    form.set("period_start", "2026-01-01");
    form.set("period_end", "2026-12-31");

    const response = await app.request(
      "/api/v1/actual-billed/upload",
      {
        method: "POST",
        headers: authHeaders({ "content-length": "500" }),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "actual_billed_period_finalized" },
    });
    expect(repository.uploadCalls).toHaveLength(1);
  });

  it("saves selected lease matches for uploaded billed rows", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/api/v1/actual-billed/matches",
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          matches: [
            {
              actual_billed_id: "66666666-6666-4666-8666-666666666660",
              lease_id: LEASE_ID,
            },
          ],
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      updated_count: 1,
    });
    expect(repository.matchCalls).toEqual([
      {
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        matches: [
          {
            billedRowId: "66666666-6666-4666-8666-666666666660",
            leaseId: LEASE_ID,
          },
        ],
      },
    ]);
  });

  it("blocks billed-row match edits for finalized reconciliation periods", async () => {
    const repository = new MemoryActualBilledRepository();
    repository.periodFinalized = true;
    const { app } = createTestApp({ repository });

    const response = await app.request(
      "/api/v1/actual-billed/matches",
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          matches: [
            {
              actual_billed_id: "66666666-6666-4666-8666-666666666660",
              lease_id: LEASE_ID,
            },
          ],
        }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "actual_billed_period_finalized" },
    });
    expect(repository.matchCalls).toHaveLength(1);
  });

  it("rejects duplicate billed row match selections", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/api/v1/actual-billed/matches",
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          matches: [
            {
              actual_billed_id: "66666666-6666-4666-8666-666666666660",
              lease_id: LEASE_ID,
            },
            {
              actual_billed_id: "66666666-6666-4666-8666-666666666660",
              lease_id: "77777777-7777-4777-8777-777777777770",
            },
          ],
        }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Choose one tenant for each billed row",
    });
    expect(repository.matchCalls).toEqual([]);
  });

  it("rejects selected lease matches that do not belong to the billed row period", async () => {
    const repository = new MemoryActualBilledRepository();
    repository.matchResult = "invalid_match";
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/actual-billed/matches",
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          matches: [
            {
              actual_billed_id: "66666666-6666-4666-8666-666666666660",
              lease_id: LEASE_ID,
            },
          ],
        }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "One or more billed rows could not be matched to that lease",
    });
  });

  it("uploads parsed billing XLSX rows", async () => {
    const { app, repository } = createTestApp();
    const form = new FormData();
    form.set(
      "file",
      await xlsxFile([
        ["Tenant Name", "Annual CAM"],
        ["Acme Retail", "$1,200.50"],
      ]),
    );
    form.set("property_id", PROPERTY_ID);
    form.set("period_start", "2026-01-01");
    form.set("period_end", "2026-12-31");
    const response = await app.request(
      "/api/v1/actual-billed/upload",
      {
        method: "POST",
        headers: authHeaders({ "content-length": "5000" }),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      source_type: "csv_import",
      total_billed: "1200.5",
      row_count: 1,
      matched_row_count: 1,
      unmatched_row_count: 0,
      items: [
        {
          tenant_name: "Acme Retail",
          billed_amount: "1200.5",
          match_status: "matched",
        },
      ],
    });
    expect(repository.uploadCalls[0]?.rows).toEqual([
      {
        tenantName: "Acme Retail",
        billedAmount: "1200.5",
        sourceType: "csv_import",
        poolId: null,
        suite: null,
      },
    ]);
  });

  it("returns parser errors with the legacy detail shape", async () => {
    const { app } = createTestApp();
    const form = new FormData();
    form.set("file", csvFile("Customer,Value\nAcme,1200"));
    form.set("property_id", PROPERTY_ID);
    form.set("period_start", "2026-01-01");
    form.set("period_end", "2026-12-31");
    const response = await app.request(
      "/api/v1/actual-billed/upload",
      {
        method: "POST",
        headers: authHeaders({ "content-length": "500" }),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      detail: { message: "Failed to parse billing file" },
    });
  });

  it("creates manual billing entries and validates pool access", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/api/v1/actual-billed/manual",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          total_billed: 125000,
          pool_id: POOL_ID,
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      property_id: PROPERTY_ID,
      total_billed: "125000",
      pool_id: POOL_ID,
    });
    expect(repository.manualCalls[0]).toMatchObject({
      totalBilled: "125000",
      poolId: POOL_ID,
    });
  });

  it("rejects impossible calendar dates in the manual billing period", async () => {
    for (const badDate of ["2026-02-30", "2026-13-01", "2026-04-31"]) {
      const { app, repository } = createTestApp();
      const response = await app.request(
        "/api/v1/actual-billed/manual",
        {
          method: "POST",
          headers: authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            property_id: PROPERTY_ID,
            period_start: badDate,
            period_end: "2026-12-31",
            total_billed: 125000,
            pool_id: POOL_ID,
          }),
        },
        env(),
      );

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "validation_error" },
      });
      expect(repository.manualCalls).toHaveLength(0);
    }
  });

  it("blocks manual billing entries for finalized reconciliation periods", async () => {
    const repository = new MemoryActualBilledRepository();
    repository.periodFinalized = true;
    const { app } = createTestApp({ repository });

    const response = await app.request(
      "/api/v1/actual-billed/manual",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          total_billed: 125000,
          pool_id: POOL_ID,
        }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "actual_billed_period_finalized" },
    });
    expect(repository.manualCalls).toHaveLength(1);
  });

  it("lists and deletes billed rows for a scoped property", async () => {
    const { app, repository } = createTestApp();
    const listResponse = await app.request(
      `/api/v1/actual-billed/${PROPERTY_ID}?period_start=2026-01-01&period_end=2026-12-31`,
      { headers: authHeaders() },
      env(),
    );
    const deleteResponse = await app.request(
      `/api/v1/actual-billed/${PROPERTY_ID}?period_start=2026-01-01&period_end=2026-12-31`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      property_id: PROPERTY_ID,
      total_billed: "900",
      items: [{ tenant_name: "Acme Retail", billed_amount: "900.00" }],
    });
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({
      message: "Billing data deleted successfully",
    });
    expect(repository.deleteCalls[0]).toMatchObject({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
  });

  it("blocks billed-row deletes for finalized reconciliation periods", async () => {
    const repository = new MemoryActualBilledRepository();
    repository.periodFinalized = true;
    const { app } = createTestApp({ repository });

    const response = await app.request(
      `/api/v1/actual-billed/${PROPERTY_ID}?period_start=2026-01-01&period_end=2026-12-31`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "actual_billed_period_finalized" },
    });
    expect(repository.deleteCalls).toHaveLength(1);
  });

  it("calculates leakage with draft-aware reconciliation and billing data", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/leakage/${PROPERTY_ID}?period_start=2026-01-01&period_end=2026-12-31&include_drafts=true`,
      { headers: authHeaders() },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      property_id: PROPERTY_ID,
      capveri_calculated: "1200",
      actual_billed: "900",
      leakage: "300",
      leakage_pct: 25,
      has_reconciliation_data: true,
      has_gl_data: true,
      has_billing_data: true,
      breakdown: [
        {
          tenant_name: "Acme Retail",
          calculated_amount: 1200,
          billed_amount: 900,
          difference: 300,
          difference_pct: 25,
        },
      ],
    });
  });

  it("returns empty leakage for inaccessible properties instead of exposing existence", async () => {
    const repository = new MemoryActualBilledRepository();
    repository.propertyExists = false;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/leakage/${PROPERTY_ID}?period_start=2026-01-01&period_end=2026-12-31`,
      { headers: authHeaders() },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      capveri_calculated: "0",
      has_gl_data: false,
      has_billing_data: false,
    });
  });

  it("returns organization leakage summary metrics", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/api/v1/leakage/summary",
      { headers: authHeaders() },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      total_recovery_opportunity: "300",
      properties_with_leakage: 1,
      total_underbill_exposure: "300",
      total_overbill_exposure: "200",
      total_billing_exposure: "500",
      properties_with_underbill: 1,
      properties_with_overbill: 1,
      properties_with_billing_exposure: 2,
      has_billing_data: true,
      draft_recovery: "250",
      draft_property_count: 1,
    });
  });

  it("rejects invalid periods and tenant callers", async () => {
    const invalidPeriod = await createTestApp().app.request(
      `/api/v1/leakage/${PROPERTY_ID}?period_start=2026-12-31&period_end=2026-01-01`,
      { headers: authHeaders() },
      env(),
    );
    const tenantCaller = await createTestApp({ role: "tenant" }).app.request(
      `/api/v1/actual-billed/${PROPERTY_ID}?period_start=2026-01-01&period_end=2026-12-31`,
      { headers: authHeaders() },
      env(),
    );

    expect(invalidPeriod.status).toBe(400);
    expect(tenantCaller.status).toBe(403);
  });
});

describe("actual billed repository", () => {
  it("rejects upload rows before lease lookup or insert when the period is finalized", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql, true);
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.createUploadRows({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        rows: [
          {
            tenantName: "Acme Retail",
            billedAmount: "1200.00",
            sourceType: "csv_import",
            poolId: null,
            suite: "100",
          },
        ],
      }),
    ).resolves.toEqual({ state: "period_finalized" });

    expect(executor.statements).toHaveLength(3);
    expect(executor.statements[1]?.sql).toContain("pg_advisory_xact_lock");
    expect(executor.statements[2]?.sql).toContain("reconciliation_snapshots");
    expect(executor.statements[2]?.sql).toContain(
      "period_start_date <= $3::date",
    );
    expect(executor.statements[2]?.sql).toContain(
      "period_end_date >= $4::date",
    );
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("insert into actual_billed_amounts"),
      ),
    ).toBe(false);
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("from leases"),
      ),
    ).toBe(false);
  });

  it("rejects manual entries before pool validation or insert when the period is finalized", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql, true);
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.createManualEntry({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        totalBilled: "1200.00",
        poolId: POOL_ID,
      }),
    ).resolves.toEqual({ state: "period_finalized" });

    expect(executor.statements).toHaveLength(3);
    expect(executor.statements[1]?.sql).toContain("pg_advisory_xact_lock");
    expect(executor.statements[2]?.sql).toContain("reconciliation_snapshots");
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("from expense_pools"),
      ),
    ).toBe(false);
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("insert into actual_billed_amounts"),
      ),
    ).toBe(false);
  });

  it("rejects match updates before validation or update when the period is finalized", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql, true);
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.updateBilledRowMatches({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        matches: [
          {
            billedRowId: "66666666-6666-4666-8666-666666666660",
            leaseId: LEASE_ID,
          },
        ],
      }),
    ).resolves.toEqual({ state: "period_finalized" });

    expect(executor.statements).toHaveLength(3);
    expect(executor.statements[1]?.sql).toContain("pg_advisory_xact_lock");
    expect(executor.statements[2]?.sql).toContain("reconciliation_snapshots");
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("select count(*)::text as valid_count"),
      ),
    ).toBe(false);
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("update actual_billed_amounts"),
      ),
    ).toBe(false);
  });

  it("rejects broad deletes before deleting rows when any finalized snapshot exists", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql, true);
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.deleteBilledAmounts({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
      }),
    ).resolves.toEqual({ state: "period_finalized" });

    expect(executor.statements).toHaveLength(3);
    expect(executor.statements[1]?.sql).toContain("pg_advisory_xact_lock");
    expect(executor.statements[2]?.sql).toContain("reconciliation_snapshots");
    expect(executor.statements[2]?.sql).not.toContain("period_start_date <=");
    expect(executor.statements[2]?.sql).not.toContain("period_end_date >=");
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("delete from actual_billed_amounts"),
      ),
    ).toBe(false);
  });

  it("rejects deletes when targeted billed rows span into finalized snapshots outside the request window", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("actual_billed_amounts aba")) {
        return [{ exists: true }];
      }
      if (sql.includes("select exists")) {
        return existsRows(sql);
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.deleteBilledAmounts({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2025-07-01",
        periodEnd: "2025-12-31",
      }),
    ).resolves.toEqual({ state: "period_finalized" });

    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("delete from actual_billed_amounts"),
      ),
    ).toBe(false);
    expect(
      executor.statements.some(
        (statement) =>
          statement.sql.includes("actual_billed_amounts aba") &&
          statement.sql.includes(
            "finalized_snapshots.period_start_date <= aba.period_end_date",
          ) &&
          statement.sql.includes(
            "finalized_snapshots.period_end_date >= aba.period_start_date",
          ),
      ),
    ).toBe(true);
  });

  it("rejects match edits when targeted billed rows span into finalized snapshots outside the request window", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("actual_billed_amounts aba")) {
        return [{ exists: true }];
      }
      if (sql.includes("select exists")) {
        return existsRows(sql);
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.updateBilledRowMatches({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2025-07-01",
        periodEnd: "2025-12-31",
        matches: [
          {
            billedRowId: "66666666-6666-4666-8666-666666666660",
            leaseId: LEASE_ID,
          },
        ],
      }),
    ).resolves.toEqual({ state: "period_finalized" });

    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("select count(*)::text as valid_count"),
      ),
    ).toBe(false);
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("update actual_billed_amounts"),
      ),
    ).toBe(false);
    expect(
      executor.statements.some(
        (statement) =>
          statement.sql.includes("actual_billed_amounts aba") &&
          statement.sql.includes(
            "finalized_snapshots.period_start_date <= aba.period_end_date",
          ) &&
          statement.sql.includes(
            "finalized_snapshots.period_end_date >= aba.period_start_date",
          ),
      ),
    ).toBe(true);
  });

  it("uses inclusive overlap semantics when checking finalized billing mutation periods", async () => {
    const cases = [
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        expectedState: "period_finalized",
      },
      {
        periodStart: "2026-12-31",
        periodEnd: "2027-12-31",
        expectedState: "period_finalized",
      },
      {
        periodStart: "2025-01-01",
        periodEnd: "2026-01-01",
        expectedState: "period_finalized",
      },
      {
        periodStart: "2027-01-01",
        periodEnd: "2027-12-31",
        expectedState: "created",
      },
    ] as const;

    for (const testCase of cases) {
      const executor = new BillingExecutor((sql, params) => {
        if (sql.includes("select exists")) {
          if (sql.includes("reconciliation_snapshots")) {
            const requestEnd = params[2] as string;
            const requestStart = params[3] as string;
            return [
              {
                exists:
                  "2026-01-01" <= requestEnd &&
                  "2026-12-31" >= requestStart,
              },
            ];
          }

          return [{ exists: true }];
        }
        if (sql.includes("from leases")) {
          return [];
        }
        if (sql.includes("insert into actual_billed_amounts")) {
          return [{ id: "99999999-9999-4999-8999-999999999999" }];
        }

        return [];
      });
      const repository = new PostgresActualBilledRepository(executor);

      const result = await repository.createUploadRows({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: testCase.periodStart,
        periodEnd: testCase.periodEnd,
        rows: [
          {
            tenantName: "Acme Retail",
            billedAmount: "1200.00",
            sourceType: "csv_import",
            poolId: null,
            suite: null,
          },
        ],
      });

      expect(result.state).toBe(testCase.expectedState);
    }
  });

  it("populates lease_id for unambiguous upload name and suite matches", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql);
      }
      if (sql.includes("from leases")) {
        return [
          {
            id: LEASE_ID,
            tenantName: "Acme Retail LLC",
            unitNumber: "Suite 100",
          },
          {
            id: "77777777-7777-4777-8777-777777777777",
            tenantName: "Shared Tenant",
            unitNumber: "200",
          },
          {
            id: "88888888-8888-4888-8888-888888888888",
            tenantName: "Shared Tenant",
            unitNumber: "201",
          },
        ];
      }
      if (sql.includes("insert into actual_billed_amounts")) {
        return [
          { id: "99999999-9999-4999-8999-999999999999" },
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        ];
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.createUploadRows({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        rows: [
          {
            tenantName: "Acme Retail, LLC",
            billedAmount: "1200.00",
            sourceType: "csv_import",
            poolId: null,
            suite: "100",
          },
          {
            tenantName: "Shared Tenant",
            billedAmount: "800.00",
            sourceType: "csv_import",
            poolId: null,
            suite: null,
          },
          {
            tenantName: "Acme Retail",
            billedAmount: "400.00",
            sourceType: "csv_import",
            poolId: null,
            suite: null,
          },
        ],
      }),
    ).resolves.toEqual({
      state: "created",
      insertedCount: 3,
      rows: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          tenantName: "Acme Retail, LLC",
          billedAmount: "1200.00",
          suite: "100",
          leaseId: LEASE_ID,
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          tenantName: "Shared Tenant",
          billedAmount: "800.00",
          suite: null,
          leaseId: null,
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          tenantName: "Acme Retail",
          billedAmount: "400.00",
          suite: null,
          leaseId: LEASE_ID,
        },
      ],
    });

    const insert = executor.statements.find((statement) =>
      statement.sql.includes("insert into actual_billed_amounts"),
    );
    const leaseLookup = executor.statements.find((statement) =>
      statement.sql.includes("from leases"),
    );
    expect(leaseLookup?.sql).toContain("leases.status = 'active'");
    expect(leaseLookup?.sql).toContain("leases.start_date <= $3::date");
    expect(leaseLookup?.sql).toContain("leases.end_date >= $2::date");
    expect(leaseLookup?.params).toEqual([
      PROPERTY_ID,
      "2026-01-01",
      "2026-12-31",
    ]);
    expect(insert?.sql).toContain("lease_id, tenant_name");
    expect(insert?.params[5]).toBe(LEASE_ID);
    expect(insert?.params[15]).toBeNull();
    expect(insert?.params[25]).toBe(LEASE_ID);
  });

  it("rejects selected billed-row matches when the lease is outside the period", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql);
      }
      if (sql.includes("select count(*)::text as valid_count")) {
        return [{ valid_count: "0" }];
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.updateBilledRowMatches({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        matches: [
          {
            billedRowId: "66666666-6666-4666-8666-666666666660",
            leaseId: LEASE_ID,
          },
        ],
      }),
    ).resolves.toEqual({ state: "invalid_match" });

    const validation = executor.statements.find((statement) =>
      statement.sql.includes("select count(*)::text as valid_count"),
    );
    const update = executor.statements.find((statement) =>
      statement.sql.includes("update actual_billed_amounts"),
    );
    expect(validation?.sql).toContain("leases.start_date <= $4::date");
    expect(validation?.sql).toContain("leases.end_date >= $3::date");
    expect(update).toBeUndefined();
  });

  it("leaves conflicting tenant and suite matches unresolved", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql);
      }
      if (sql.includes("from leases")) {
        return [
          {
            id: LEASE_ID,
            tenantName: "Acme Retail",
            unitNumber: "100",
          },
          {
            id: "77777777-7777-4777-8777-777777777777",
            tenantName: "Beta Foods",
            unitNumber: "200",
          },
        ];
      }
      if (sql.includes("insert into actual_billed_amounts")) {
        return [{ id: "99999999-9999-4999-8999-999999999999" }];
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await repository.createUploadRows({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      rows: [
        {
          tenantName: "Acme Retail",
          billedAmount: "1200.00",
          sourceType: "csv_import",
          poolId: null,
          suite: "200",
        },
      ],
    });

    const insert = executor.statements.find((statement) =>
      statement.sql.includes("insert into actual_billed_amounts"),
    );
    expect(insert?.params[5]).toBeNull();
  });

  it("leaves suffix-collapsed duplicate tenant matches unresolved", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql);
      }
      if (sql.includes("from leases")) {
        return [
          {
            id: LEASE_ID,
            tenantName: "Acme Retail LLC",
            unitNumber: "100",
          },
          {
            id: "77777777-7777-4777-8777-777777777777",
            tenantName: "Acme Retail Inc",
            unitNumber: "200",
          },
        ];
      }
      if (sql.includes("insert into actual_billed_amounts")) {
        return [{ id: "99999999-9999-4999-8999-999999999999" }];
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await repository.createUploadRows({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      rows: [
        {
          tenantName: "Acme Retail",
          billedAmount: "1200.00",
          sourceType: "csv_import",
          poolId: null,
          suite: null,
        },
      ],
    });

    const insert = executor.statements.find((statement) =>
      statement.sql.includes("insert into actual_billed_amounts"),
    );
    expect(insert?.params[5]).toBeNull();
  });

  it("loads exposure comparison data using exact finalized and billed periods", async () => {
    const executor = new BillingExecutor((sql) => {
      if (sql.includes("select exists")) {
        return existsRows(sql);
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [{ lease_id: LEASE_ID, total_recovery: "1200.00" }];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [{ billed_amount: "1500.00" }];
      }

      return [];
    });
    const repository = new PostgresActualBilledRepository(executor);

    await expect(
      repository.loadBillingExposureDataset({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      }),
    ).resolves.toEqual({
      propertyExists: true,
      snapshots: [{ lease_id: LEASE_ID, total_recovery: "1200.00" }],
      billedRows: [{ billed_amount: "1500.00" }],
    });

    const snapshotLookup = executor.statements.find((statement) =>
      statement.sql.includes("from reconciliation_snapshots"),
    );
    const billedLookup = executor.statements.find((statement) =>
      statement.sql.includes("from actual_billed_amounts"),
    );
    expect(snapshotLookup?.sql).toContain("period_start_date = $3::date");
    expect(snapshotLookup?.sql).toContain("period_end_date = $4::date");
    expect(snapshotLookup?.sql).toContain("status = 'finalized'");
    expect(billedLookup?.sql).toContain("period_start_date = $3::date");
    expect(billedLookup?.sql).toContain("period_end_date = $4::date");
    expect(snapshotLookup?.sql).not.toContain("period_start_date <=");
    expect(billedLookup?.sql).not.toContain("period_end_date >=");
  });
});

class BillingExecutor implements PostgresExecutor {
  readonly statements: RecordedBillingStatement[] = [];

  constructor(
    private readonly handler: (
      sql: string,
      params: readonly unknown[],
    ) => unknown[],
  ) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push({ sql, params });

    return { rows: this.handler(sql, params) as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

type RecordedBillingStatement = {
  sql: string;
  params: readonly unknown[];
};

function existsRows(sql: string, finalized = false): Array<{ exists: boolean }> {
  return [{ exists: finalized || !sql.includes("reconciliation_snapshots") }];
}
