import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { QueryResult } from "../adapters/db/transaction";
import { PostgresIngestionRepository } from "../adapters/db/ingestion";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type {
  ApplyMappingResult,
  BatchDetailRecord,
  BatchListRecord,
  ColumnMappingListResult,
  ColumnMappingRecord,
  CreateColumnMappingResult,
  DateRangeRecord,
  DeleteBatchResult,
  GlEntryInsert,
  IngestionRepository,
  ApplyMappingPreflightResult,
  PreviewEntryRecord,
  RetryBatchResult,
  UploadImportResult,
  SourceSystem,
} from "../domain/ingestion/repository";
import type { AppEnv } from "../env";
import { createIngestionRoutes } from "../http/ingestion-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const BATCH_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_BATCH_ID = "44444444-4444-4444-8444-444444444445";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryIngestionRepository implements IngestionRepository {
  fullAccess = true;
  finalizedSnapshotExists = false;
  propertyExists = true;
  duplicateUpload: { batchId: string; importedAt: string | null } | null = null;
  nextApplyMappingResult: ApplyMappingResult | null = null;
  nextPreflightResult: ApplyMappingPreflightResult | null = null;
  lastListOrganizationId: string | null = null;
  lastMappingListInput: {
    organizationId: string;
    sourceSystem?: SourceSystem;
    skip: number;
    limit: number;
  } | null = null;
  lastCreateMappingInput: {
    organizationId: string;
    userId: string;
    name: string;
    description: string | null;
    sourceSystem: SourceSystem;
    mappingConfig: Record<string, string>;
  } | null = null;
  duplicateMapping = false;
  lastUploadInput: {
    organizationId: string;
    propertyId: string;
    fileName: string;
    fileHash: string;
    sourceSystem: "yardi" | "mri" | "generic";
    entries: GlEntryInsert[];
    errorCount: number;
  } | null = null;
  lastApplyMappingInput: {
    batchId: string;
    organizationId: string;
    fileHash: string;
    entries: GlEntryInsert[];
    errorCount: number;
  } | null = null;
  deletedGlEntryCount = 3;
  readonly batches = new Map<string, BatchDetailRecord>([
    [
      BATCH_ID,
      {
        id: BATCH_ID,
        organization_id: ORG_ID,
        property_id: PROPERTY_ID,
        file_name: "yardi.csv",
        source_system: "yardi",
        status: "failed",
        row_count: 10,
        error_count: 2,
        error_log: ["bad row"],
        created_at: "2026-06-12T00:00:00Z",
        updated_at: "2026-06-12T00:00:00Z",
      },
    ],
    [
      OTHER_BATCH_ID,
      {
        id: OTHER_BATCH_ID,
        organization_id: ORG_ID,
        property_id: PROPERTY_ID,
        file_name: "mri.csv",
        source_system: "mri",
        status: "completed",
        row_count: 8,
        error_count: 0,
        error_log: [],
        created_at: "2026-06-11T00:00:00Z",
        updated_at: "2026-06-11T00:00:00Z",
      },
    ],
  ]);
  previewEntries: PreviewEntryRecord[] = [
    {
      id: "55555555-5555-4555-8555-555555555555",
      transaction_date: "2026-01-15",
      account_code: "6000",
      account_description: "Repairs",
      description: "HVAC",
      amount: "125.50",
    },
    {
      id: "55555555-5555-4555-8555-555555555556",
      transaction_date: "2026-01-16",
      account_code: "6001",
      account_description: "Credits",
      description: "Refund",
      amount: "-25.00",
    },
    {
      id: "55555555-5555-4555-8555-555555555557",
      transaction_date: "2026-01-17",
      account_code: "6002",
      account_description: "Zero",
      description: "No balance",
      amount: "0",
    },
  ];
  dateRange: DateRangeRecord | null = {
    min_date: "2026-01-01",
    max_date: "2026-12-31",
  };
  readonly calls: string[] = [];
  readonly columnMappings: ColumnMappingRecord[] = [
    {
      id: "88888888-8888-4888-8888-888888888888",
      name: "Generic GL",
      description: "Reusable generic mapping",
      source_system: "generic",
      mapping_config: {
        account_code: "Acct",
        amount: "Net",
        transaction_date: "When",
      },
      created_by: USER_ID,
      created_at: "2026-06-13T00:00:00Z",
      updated_at: "2026-06-13T00:00:00Z",
    },
  ];

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async uploadImport(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
    fileHash: string;
    sourceSystem: "yardi" | "mri" | "generic";
    entries: GlEntryInsert[];
    errorCount: number;
  }): Promise<UploadImportResult> {
    this.calls.push("uploadImport");
    this.lastUploadInput = input;

    if (!this.propertyExists) {
      return { state: "property_not_found" };
    }

    if (this.duplicateUpload) {
      return {
        state: "duplicate",
        batchId: this.duplicateUpload.batchId,
        importedAt: this.duplicateUpload.importedAt,
      };
    }

    const batchId = "66666666-6666-4666-8666-666666666666";
    this.batches.set(batchId, {
      id: batchId,
      organization_id: input.organizationId,
      property_id: input.propertyId,
      file_name: input.fileName,
      source_system: input.sourceSystem,
      status: input.sourceSystem === "generic" ? "pending" : "completed",
      row_count: input.entries.length,
      error_count: input.errorCount,
      error_log: [],
      created_at: "2026-06-13T00:00:00Z",
      updated_at: "2026-06-13T00:00:00Z",
    });

    return {
      state: "uploaded",
      batchId,
      sourceSystem: input.sourceSystem,
      rowCount: input.entries.length,
      errorCount: input.errorCount,
    };
  }

  async applyMapping(input: {
    batchId: string;
    organizationId: string;
    fileHash: string;
    entries: GlEntryInsert[];
    errorCount: number;
  }): Promise<ApplyMappingResult> {
    this.calls.push("applyMapping");
    this.lastApplyMappingInput = input;

    if (this.nextApplyMappingResult) {
      return this.nextApplyMappingResult;
    }

    const batch = this.readBatch({
      batchId: input.batchId,
      organizationId: input.organizationId,
    });

    if (!batch) {
      return { state: "not_found" };
    }

    return {
      state: "completed",
      batchId: input.batchId,
      propertyId: batch.property_id,
      rowCount: input.entries.length,
      errorCount: input.errorCount,
    };
  }

  async preflightApplyMapping(input: {
    batchId: string;
    organizationId: string;
    fileHash: string;
  }): Promise<ApplyMappingPreflightResult> {
    this.calls.push("preflightApplyMapping");

    if (this.nextPreflightResult) {
      return this.nextPreflightResult;
    }

    const batch = this.readBatch({
      batchId: input.batchId,
      organizationId: input.organizationId,
    });

    if (!batch) {
      return { state: "not_found" };
    }

    return { state: "ready", propertyId: batch.property_id };
  }

  async listColumnMappings(input: {
    organizationId: string;
    sourceSystem?: SourceSystem;
    skip: number;
    limit: number;
  }): Promise<ColumnMappingListResult> {
    this.calls.push("listColumnMappings");
    this.lastMappingListInput = input;
    const filtered = this.columnMappings.filter(
      (mapping) =>
        input.organizationId === ORG_ID &&
        (!input.sourceSystem || mapping.source_system === input.sourceSystem),
    );

    return {
      mappings: filtered.slice(input.skip, input.skip + input.limit),
      total: filtered.length,
    };
  }

  async createColumnMapping(input: {
    organizationId: string;
    userId: string;
    name: string;
    description: string | null;
    sourceSystem: SourceSystem;
    mappingConfig: Record<string, string>;
  }): Promise<CreateColumnMappingResult> {
    this.calls.push("createColumnMapping");
    this.lastCreateMappingInput = input;

    if (this.duplicateMapping) {
      return { state: "duplicate" };
    }

    const mapping: ColumnMappingRecord = {
      id: "99999999-9999-4999-8999-999999999999",
      name: input.name,
      description: input.description,
      source_system: input.sourceSystem,
      mapping_config: input.mappingConfig,
      created_by: input.userId,
      created_at: "2026-06-13T01:00:00Z",
      updated_at: "2026-06-13T01:00:00Z",
    };
    this.columnMappings.unshift(mapping);

    return { state: "created", mapping };
  }

  async listBatches(organizationId: string): Promise<BatchListRecord[]> {
    this.lastListOrganizationId = organizationId;

    return [...this.batches.values()].map((batch) => ({
      id: batch.id,
      file_name: batch.file_name,
      source_system: batch.source_system,
      status: batch.status,
      row_count: batch.row_count,
      error_count: batch.error_count,
      created_at: batch.created_at,
    }));
  }

  async getBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<BatchDetailRecord | null> {
    this.calls.push("getBatch");
    return this.readBatch(input);
  }

  async listPreviewEntries(input: {
    batchId: string;
    propertyId: string;
    organizationId: string;
  }): Promise<PreviewEntryRecord[]> {
    const batch = await this.getBatch({
      batchId: input.batchId,
      organizationId: input.organizationId,
    });

    return batch?.property_id === input.propertyId ? this.previewEntries : [];
  }

  async retryBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<RetryBatchResult> {
    this.calls.push("retryBatch");
    const batch = this.readBatch({
      batchId: input.batchId,
      organizationId: input.organizationId,
    });

    if (!batch) {
      return { state: "not_found" };
    }

    if (batch.status !== "failed") {
      return { state: "invalid_status", status: batch.status };
    }

    if (this.finalizedSnapshotExists) {
      return { state: "finalized_reconciliation" };
    }

    this.batches.delete(input.batchId);

    return { state: "retried", deletedGlEntryCount: this.deletedGlEntryCount };
  }

  async deleteBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<DeleteBatchResult> {
    this.calls.push("deleteBatch");
    const batch = this.readBatch({
      batchId: input.batchId,
      organizationId: input.organizationId,
    });

    if (!batch) {
      return { state: "not_found" };
    }

    if (this.finalizedSnapshotExists) {
      return { state: "finalized_reconciliation" };
    }

    this.batches.delete(input.batchId);

    return { state: "deleted", deletedGlEntryCount: this.deletedGlEntryCount };
  }

  async getGlDateRange(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<DateRangeRecord | null> {
    return input.propertyId === PROPERTY_ID && input.organizationId === ORG_ID
      ? this.dateRange
      : null;
  }

  async listPropertyImports(): Promise<{
    imports: import("../domain/ingestion/repository").PropertyImportRecord[];
    total: number;
  }> {
    return { imports: [], total: 0 };
  }

  private readBatch(input: {
    batchId: string;
    organizationId: string;
  }): BatchDetailRecord | null {
    const batch = this.batches.get(input.batchId);

    return batch?.organization_id === input.organizationId ? batch : null;
  }
}

class FakePostgresExecutor implements PostgresExecutor {
  readonly statements: string[] = [];
  readonly params: unknown[][] = [];
  readonly transactionStates: boolean[] = [];
  transactionCount = 0;
  private inTransaction = false;

  constructor(private readonly responses: unknown[][]) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push(sql);
    this.params.push([...params]);
    this.transactionStates.push(this.inTransaction);
    const rows = this.responses.shift() ?? [];

    return { rows: rows as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    this.transactionCount += 1;
    this.inTransaction = true;

    try {
      return await operation(this);
    } finally {
      this.inTransaction = false;
    }
  }
}

class ThrowingPostgresExecutor implements PostgresExecutor {
  readonly statements: string[] = [];
  readonly params: unknown[][] = [];
  readonly transactionStates: boolean[] = [];
  transactionCount = 0;
  private inTransaction = false;
  private statementIndex = 0;

  constructor(
    private readonly responses: unknown[][],
    private readonly failure: { throwOnStatementIndex: number; error: unknown },
  ) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    const index = this.statementIndex++;
    this.statements.push(sql);
    this.params.push([...params]);
    this.transactionStates.push(this.inTransaction);

    if (index === this.failure.throwOnStatementIndex) {
      throw this.failure.error;
    }

    const rows = this.responses.shift() ?? [];

    return { rows: rows as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    this.transactionCount += 1;
    this.inTransaction = true;

    try {
      return await operation(this);
    } finally {
      this.inTransaction = false;
    }
  }
}

class MemoryAnalytics {
  captures: Array<{
    eventName: string;
    organizationId: string;
    properties: Record<string, unknown>;
  }> = [];

  async capture(
    _env: AppEnv,
    input: {
      eventName: string;
      organizationId: string;
      properties?: Record<string, unknown>;
    },
  ): Promise<void> {
    this.captures.push({
      eventName: input.eventName,
      organizationId: input.organizationId,
      properties: input.properties ?? {},
    });
  }
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"] = "member",
): AuthenticatedUserContext {
  const context: AuthenticatedUserContext = {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-12T00:00:00Z",
      updatedAt: "2026-06-12T00:00:00Z",
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

  if (role === "tenant") {
    context.tenantUser = {
      id: "77777777-7777-4777-8777-777777777777",
      userId: USER_ID,
      organizationId: ORG_ID,
      contactName: "Tenant User",
      contactEmail: "tenant@example.test",
      createdAt: "2026-06-12T00:00:00Z",
    };
  }

  return context;
}

function createTestApp(options: {
  repository?: MemoryIngestionRepository;
  analytics?: MemoryAnalytics;
  role?: AuthVariables["auth"]["actor"]["role"];
}) {
  const repository = options.repository ?? new MemoryIngestionRepository();
  const analytics = options.analytics ?? new MemoryAnalytics();
  const context = createAuthContext(options.role);
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
    createIngestionRoutes({
      repository,
      analytics,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository, analytics };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

function uploadHeaders(): HeadersInit {
  return {
    authorization: "Bearer valid-token",
    "content-length": "1000",
  };
}

describe("ingestion routes", () => {
  it("lists column mappings with source filter and pagination", async () => {
    const { app, repository } = createTestApp({ role: "member" });
    const response = await app.request(
      "/api/v1/ingestion/mappings?source_system=generic&skip=0&limit=10",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mappings: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          name: "Generic GL",
          description: "Reusable generic mapping",
          source_system: "generic",
          mapping_config: {
            account_code: "Acct",
            amount: "Net",
            transaction_date: "When",
          },
          created_by: USER_ID,
          created_at: "2026-06-13T00:00:00Z",
          updated_at: "2026-06-13T00:00:00Z",
        },
      ],
      total: 1,
    });
    expect(repository.lastMappingListInput).toEqual({
      organizationId: ORG_ID,
      sourceSystem: "generic",
      skip: 0,
      limit: 10,
    });
  });

  it("creates column mappings for admins with full access", async () => {
    const { app, repository } = createTestApp({ role: "admin" });
    const response = await app.request(
      "/api/v1/ingestion/mappings",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Custom GL",
          description: null,
          source_system: "generic",
          mapping_config: {
            account_code: "Acct",
            amount: "Net",
            transaction_date: "When",
          },
        }),
      },
      env(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "99999999-9999-4999-8999-999999999999",
      name: "Custom GL",
      source_system: "generic",
      mapping_config: {
        account_code: "Acct",
        amount: "Net",
        transaction_date: "When",
      },
      created_by: USER_ID,
    });
    expect(repository.lastCreateMappingInput).toEqual({
      organizationId: ORG_ID,
      userId: USER_ID,
      name: "Custom GL",
      description: null,
      sourceSystem: "generic",
      mappingConfig: {
        account_code: "Acct",
        amount: "Net",
        transaction_date: "When",
      },
    });
  });

  it("requires admin and full access to create mappings", async () => {
    const memberResponse = await createTestApp({ role: "member" }).app.request(
      "/api/v1/ingestion/mappings",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: "{}",
      },
      env(),
    );
    const repository = new MemoryIngestionRepository();
    repository.fullAccess = false;
    const noAccessResponse = await createTestApp({
      repository,
      role: "admin",
    }).app.request(
      "/api/v1/ingestion/mappings",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: "{}",
      },
      env(),
    );

    expect(memberResponse.status).toBe(403);
    expect(noAccessResponse.status).toBe(402);
  });

  it("validates required saved mapping keys and duplicate names", async () => {
    const missingResponse = await createTestApp({ role: "admin" }).app.request(
      "/api/v1/ingestion/mappings",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Broken",
          source_system: "generic",
          mapping_config: {
            account_code: "Acct",
            amount: "Net",
          },
        }),
      },
      env(),
    );
    const repository = new MemoryIngestionRepository();
    repository.duplicateMapping = true;
    const duplicateResponse = await createTestApp({
      repository,
      role: "admin",
    }).app.request(
      "/api/v1/ingestion/mappings",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Generic GL",
          source_system: "generic",
          mapping_config: {
            account_code: "Acct",
            amount: "Net",
            transaction_date: "When",
          },
        }),
      },
      env(),
    );

    expect(missingResponse.status).toBe(422);
    await expect(missingResponse.json()).resolves.toMatchObject({
      detail: "Missing required mapping keys: transaction_date",
    });
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      detail:
        "Mapping with name 'Generic GL' and source system 'generic' already exists",
    });
  });

  it("uploads Yardi CSV files and persists normalized GL entries", async () => {
    const { app, repository, analytics } = createTestApp({ role: "member" });
    const form = new FormData();
    form.set("property_id", PROPERTY_ID);
    form.set(
      "file",
      new File(
        [
          [
            "Yardi Voyager GL Detail",
            "Account Code,Account Description,Amount,Transaction Date,Vendor,Description,Accrual Date",
            '6000,Repairs,"$125.50",01/15/2026,ABC HVAC,January repair,01/10/2026',
          ].join("\n"),
        ],
        "yardi.csv",
        { type: "text/csv" },
      ),
    );

    const response = await app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      batch_id: "66666666-6666-4666-8666-666666666666",
      source_system: "yardi",
      row_count: 1,
      error_count: 0,
      detected_columns: [
        "Account Code",
        "Account Description",
        "Amount",
        "Transaction Date",
        "Vendor",
        "Description",
        "Accrual Date",
      ],
    });
    expect(repository.lastUploadInput).toMatchObject({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      fileName: "yardi.csv",
      sourceSystem: "yardi",
      errorCount: 0,
      entries: [
        {
          account_code: "6000",
          account_description: "Repairs",
          amount: "125.50",
          transaction_date: "2026-01-15",
          accrual_date: "2026-01-10",
          period_year: 2026,
          period_month: 1,
          vendor_name: "ABC HVAC",
        },
      ],
    });
    expect(repository.lastUploadInput?.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(analytics.captures).toEqual([
      {
        eventName: "gl_import_completed",
        organizationId: ORG_ID,
        properties: {
          batch_id: "66666666-6666-4666-8666-666666666666",
          property_id: PROPERTY_ID,
          source_system: "yardi",
          import_mode: "direct_upload",
          row_count: 1,
          error_count: 0,
        },
      },
    ]);
  });

  it("reports completed row count as persisted GL rows when invalid rows are skipped", async () => {
    const { app, repository } = createTestApp({ role: "member" });
    const form = new FormData();
    form.set("property_id", PROPERTY_ID);
    form.set(
      "file",
      new File(
        [
          [
            "Yardi Voyager GL Detail",
            "Account Code,Account Description,Amount,Transaction Date",
            "6000,Repairs,125.50,01/15/2026",
            ",Missing account,100.00,01/16/2026",
          ].join("\n"),
        ],
        "yardi.csv",
        { type: "text/csv" },
      ),
    );

    const response = await app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      row_count: 1,
      error_count: 1,
      warnings: ["Excluded 1 rows with missing required data"],
    });
    expect(repository.lastUploadInput?.entries).toHaveLength(1);
  });

  it("rejects GL amounts over the NUMERIC(14,2) ceiling with a 422 and no persist", async () => {
    const { app, repository } = createTestApp({ role: "member" });
    const form = new FormData();
    form.set("property_id", PROPERTY_ID);
    form.set(
      "file",
      new File(
        [
          [
            "Yardi Voyager GL Detail",
            "Account Code,Account Description,Amount,Transaction Date",
            "6000,Repairs,125.50,01/15/2026",
            "6001,Overflow,9999999999999.99,01/16/2026",
          ].join("\n"),
        ],
        "yardi.csv",
        { type: "text/csv" },
      ),
    );

    const response = await app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "gl_amount_out_of_range" },
    });
    expect(repository.lastUploadInput).toBeNull();
  });

  it("rejects GL text fields wider than their column with a 422 and no persist", async () => {
    const { app, repository } = createTestApp({ role: "member" });
    const overLongCode = "6".repeat(51); // account_code column is VARCHAR(50)
    const form = new FormData();
    form.set("property_id", PROPERTY_ID);
    form.set(
      "file",
      new File(
        [
          [
            "Yardi Voyager GL Detail",
            "Account Code,Account Description,Amount,Transaction Date",
            `${overLongCode},Repairs,125.50,01/15/2026`,
          ].join("\n"),
        ],
        "yardi.csv",
        { type: "text/csv" },
      ),
    );

    const response = await app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "gl_field_too_long" },
      detail: expect.stringContaining("account_code"),
    });
    expect(repository.lastUploadInput).toBeNull();
  });

  it("rejects a non-multipart upload body with a 400 and no persist", async () => {
    const { app, repository } = createTestApp({ role: "member" });
    const request = new Request(
      "https://example.test/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
          "content-length": "1000",
        },
        body: JSON.stringify({ property_id: PROPERTY_ID }),
      },
    );
    const response = await app.fetch(request, env());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_multipart_body" },
    });
    expect(repository.calls).toEqual([]);
  });

  it("rejects oversized multipart bodies before parsing form data", async () => {
    const { app, repository } = createTestApp({ role: "member" });
    const response = await app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-length": String(52 * 1024 * 1024),
        },
        body: new FormData(),
      },
      env(),
    );

    expect(response.status).toBe(413);
    expect(repository.calls).toEqual([]);
  });

  it("requires content length before parsing upload form data", async () => {
    const { app, repository } = createTestApp({ role: "member" });
    const request = new Request(
      "https://example.test/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "multipart/form-data; boundary=x",
        },
        body: "--x--",
      },
    );
    const response = await app.fetch(request, env());

    expect(response.status).toBe(411);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Content-Length is required for ingestion uploads",
    });
    expect(repository.calls).toEqual([]);
  });

  it.each(["abc", "-1", "0", "1junk"])(
    "rejects malformed content length %s before parsing upload form data",
    async (contentLength) => {
      const { app, repository } = createTestApp({ role: "member" });
      const request = new Request(
        "https://example.test/api/v1/ingestion/upload",
        {
          method: "POST",
          headers: {
            authorization: "Bearer valid-token",
            "content-type": "multipart/form-data; boundary=x",
            "content-length": contentLength,
          },
          body: "--x--",
        },
      );
      const response = await app.fetch(request, env());

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        detail:
          "Content-Length must be a positive integer for ingestion uploads",
      });
      expect(repository.calls).toEqual([]);
    },
  );

  it("rejects Excel uploads explicitly in the CSV migration slice", async () => {
    const { app, repository, analytics } = createTestApp({ role: "member" });
    const form = new FormData();
    form.set("property_id", PROPERTY_ID);
    form.set(
      "file",
      new File(["not a real workbook"], "gl.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    const response = await app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Cloudflare ingestion currently supports CSV files. Excel parsing is a separate migration slice.",
    });
    expect(repository.calls).toEqual([]);
    expect(analytics.captures).toEqual([]);
  });

  it("keeps generic CSV uploads pending for explicit mapping", async () => {
    const { app, repository, analytics } = createTestApp({ role: "member" });
    const form = new FormData();
    form.set("property_id", PROPERTY_ID);
    form.set(
      "file",
      new File(["Acct,Net,When\n6000,125.50,01/15/2026"], "generic.csv", {
        type: "text/csv",
      }),
    );

    const response = await app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source_system: "generic",
      row_count: 1,
      error_count: 0,
      warnings: ["No column mapping provided - raw data returned"],
      detected_columns: ["Acct", "Net", "When"],
    });
    expect(repository.lastUploadInput?.entries).toEqual([]);
    expect(repository.lastUploadInput?.sourceSystem).toBe("generic");
    expect(analytics.captures).toEqual([]);
  });

  it("returns duplicate import details from upload", async () => {
    const repository = new MemoryIngestionRepository();
    repository.duplicateUpload = {
      batchId: OTHER_BATCH_ID,
      importedAt: "2026-06-11T00:00:00Z",
    };
    const { app, analytics } = createTestApp({ repository, role: "member" });
    const form = new FormData();
    form.set("property_id", PROPERTY_ID);
    form.set(
      "file",
      new File(["Account,Amount,Date\n6000,125.50,01/15/2026"], "yardi.csv", {
        type: "text/csv",
      }),
    );

    const response = await app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      detail: {
        message: "File has already been imported",
        existing_batch_id: OTHER_BATCH_ID,
        imported_at: "2026-06-11T00:00:00Z",
      },
      error: {
        code: "duplicate_import",
        message: "File has already been imported",
      },
    });
    expect(analytics.captures).toEqual([]);
  });

  it("applies generic mappings and persists valid GL entries", async () => {
    const repository = new MemoryIngestionRepository();
    repository.batches.set(BATCH_ID, {
      ...repository.batches.get(BATCH_ID)!,
      source_system: "generic",
      status: "pending",
    });
    const { app, analytics } = createTestApp({ repository, role: "member" });
    const form = new FormData();
    form.set(
      "mapping_config",
      JSON.stringify({
        account_code: "Acct",
        amount: "Net",
        transaction_date: "When",
        account_description: "Name",
      }),
    );
    form.set(
      "file",
      new File(
        ["Acct,Name,Net,When\n6000,Repairs,125.50,01/15/2026"],
        "generic.csv",
        {
          type: "text/csv",
        },
      ),
    );

    const response = await app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}/apply-mapping`,
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      batch_id: BATCH_ID,
      source_system: "generic",
      source_confidence: 1,
      row_count: 1,
      error_count: 0,
    });
    expect(repository.calls).toEqual(["preflightApplyMapping", "applyMapping"]);
    expect(repository.lastApplyMappingInput).toMatchObject({
      batchId: BATCH_ID,
      organizationId: ORG_ID,
      entries: [
        {
          account_code: "6000",
          account_description: "Repairs",
          amount: "125.50",
          transaction_date: "2026-01-15",
        },
      ],
      errorCount: 0,
    });
    expect(analytics.captures).toEqual([
      {
        eventName: "gl_import_completed",
        organizationId: ORG_ID,
        properties: {
          batch_id: BATCH_ID,
          property_id: PROPERTY_ID,
          source_system: "generic",
          import_mode: "mapping_applied",
          row_count: 1,
          error_count: 0,
        },
      },
    ]);
  });

  it("returns mapping file mismatch before parsing invalid CSV rows", async () => {
    const repository = new MemoryIngestionRepository();
    repository.nextPreflightResult = { state: "file_mismatch" };
    const { app, analytics } = createTestApp({ repository, role: "member" });
    const form = new FormData();
    form.set(
      "mapping_config",
      JSON.stringify({
        account_code: "Acct",
        amount: "Net",
      }),
    );
    form.set(
      "file",
      new File(["Acct,Net\n,not-a-number"], "generic.csv", {
        type: "text/csv",
      }),
    );

    const response = await app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}/apply-mapping`,
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "File does not match the original import batch",
    });
    expect(repository.calls).toEqual(["preflightApplyMapping"]);
    expect(analytics.captures).toEqual([]);
  });

  it("rejects mapping configs missing required targets", async () => {
    const { app, repository, analytics } = createTestApp({ role: "member" });
    const form = new FormData();
    form.set("mapping_config", JSON.stringify({ account_code: "Acct" }));
    form.set(
      "file",
      new File(["Acct,Net\n6000,125.50"], "generic.csv", { type: "text/csv" }),
    );

    const response = await app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}/apply-mapping`,
      {
        method: "POST",
        headers: uploadHeaders(),
        body: form,
      },
      env(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Mapping must include account_code and amount",
    });
    expect(repository.calls).not.toContain("applyMapping");
    expect(analytics.captures).toEqual([]);
  });

  it("requires editor access and active entitlement for upload", async () => {
    const tenantResponse = await createTestApp({ role: "tenant" }).app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: new FormData(),
      },
      env(),
    );
    const repository = new MemoryIngestionRepository();
    repository.fullAccess = false;
    const noAccessResponse = await createTestApp({
      repository,
      role: "member",
    }).app.request(
      "/api/v1/ingestion/upload",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: new FormData(),
      },
      env(),
    );

    expect(tenantResponse.status).toBe(403);
    expect(noAccessResponse.status).toBe(402);
  });

  it("lists batches scoped to the authenticated organization", async () => {
    const { app, repository } = createTestApp({});
    const response = await app.request(
      "/api/v1/ingestion/batches",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      batches: [
        {
          id: BATCH_ID,
          file_name: "yardi.csv",
          source_system: "yardi",
          status: "failed",
          row_count: 10,
          error_count: 2,
          created_at: "2026-06-12T00:00:00Z",
        },
        expect.objectContaining({ id: OTHER_BATCH_ID }),
      ],
    });
    expect(repository.lastListOrganizationId).toBe(ORG_ID);
  });

  it("returns batch details with debit credit and balance preview strings", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: BATCH_ID,
      preview_entries: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          debit: "125.50",
          credit: null,
          balance: "125.50",
        },
        {
          id: "55555555-5555-4555-8555-555555555556",
          debit: null,
          credit: "25.00",
          balance: "-25.00",
        },
        {
          id: "55555555-5555-4555-8555-555555555557",
          debit: null,
          credit: null,
          balance: "0",
        },
      ],
    });
  });

  it("forbids tenant actors from read routes", async () => {
    const { app } = createTestApp({ role: "tenant" });
    const response = await app.request(
      "/api/v1/ingestion/batches",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(403);
  });

  it("requires admin or owner and full access to retry", async () => {
    const memberResponse = await createTestApp({ role: "member" }).app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const repository = new MemoryIngestionRepository();
    repository.fullAccess = false;
    const accessResponse = await createTestApp({
      repository,
      role: "admin",
    }).app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(memberResponse.status).toBe(403);
    expect(accessResponse.status).toBe(402);
  });

  it("rejects retry for non-failed batches", async () => {
    const { app, repository } = createTestApp({ role: "owner" });
    const response = await app.request(
      `/api/v1/ingestion/batches/${OTHER_BATCH_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Only failed batches can be retried. Current status: completed",
    });
    expect(repository.calls).toEqual(["retryBatch"]);
  });

  it("clears failed batches so the same file can be re-uploaded", async () => {
    const { app, repository } = createTestApp({ role: "admin" });
    const response = await app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      batch_id: BATCH_ID,
      status: "ready_for_upload",
      message:
        "Failed batch cleared. Upload the file again to retry. Deleted 3 GL entries.",
    });
    expect(repository.calls).toEqual(["retryBatch"]);
    expect(repository.batches.has(BATCH_ID)).toBe(false);
  });

  it("blocks retrying failed batches with finalized reconciliation GL", async () => {
    const repository = new MemoryIngestionRepository();
    repository.finalizedSnapshotExists = true;

    const response = await createTestApp({
      repository,
      role: "admin",
    }).app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "batch_in_finalized_reconciliation" },
      detail: expect.stringMatching(
        /^Cannot retry - GL entries may be used in finalized reconciliations/,
      ),
    });
    expect(repository.calls).toEqual(["retryBatch"]);
    expect(repository.batches.has(BATCH_ID)).toBe(true);
  });

  it("blocks deleting finalized reconciliation GL and deletes otherwise", async () => {
    const blockedRepository = new MemoryIngestionRepository();
    blockedRepository.finalizedSnapshotExists = true;
    const blockedResponse = await createTestApp({
      repository: blockedRepository,
      role: "owner",
    }).app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const { app, repository } = createTestApp({ role: "owner" });
    const successResponse = await app.request(
      `/api/v1/ingestion/batches/${BATCH_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(blockedResponse.status).toBe(409);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      detail: expect.stringMatching(
        /^Cannot delete - GL entries may be used in finalized reconciliations/,
      ),
    });
    expect(blockedRepository.calls).toEqual(["deleteBatch"]);
    expect(successResponse.status).toBe(204);
    expect(repository.batches.has(BATCH_ID)).toBe(false);
    expect(repository.calls).toEqual(["deleteBatch"]);
  });

  it("returns gl date range 404 and success shapes", async () => {
    const repository = new MemoryIngestionRepository();
    repository.dateRange = null;
    const missingResponse = await createTestApp({ repository }).app.request(
      `/api/v1/ingestion/gl-date-range/${PROPERTY_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    repository.dateRange = {
      min_date: "2025-01-15",
      max_date: "2026-03-20",
    };
    const successResponse = await createTestApp({ repository }).app.request(
      `/api/v1/ingestion/gl-date-range/${PROPERTY_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toMatchObject({
      detail: "No GL entries found for this property",
    });
    expect(successResponse.status).toBe(200);
    await expect(successResponse.json()).resolves.toEqual({
      min_date: "2025-01-15",
      max_date: "2026-03-20",
      year: 2026,
    });
  });
});

describe("postgres ingestion repository", () => {
  it("lists column mappings with org scope filters and total count", async () => {
    const executor = new FakePostgresExecutor([
      [{ total: 2 }],
      [
        {
          id: "88888888-8888-4888-8888-888888888888",
          name: "Generic GL",
          description: null,
          source_system: "generic",
          mapping_config: {
            account_code: "Acct",
            amount: "Net",
            transaction_date: "When",
          },
          created_by: USER_ID,
          created_at: "2026-06-13T00:00:00Z",
          updated_at: "2026-06-13T00:00:00Z",
        },
      ],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.listColumnMappings({
        organizationId: ORG_ID,
        sourceSystem: "generic",
        skip: 10,
        limit: 5,
      }),
    ).resolves.toEqual({
      mappings: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          name: "Generic GL",
          description: null,
          source_system: "generic",
          mapping_config: {
            account_code: "Acct",
            amount: "Net",
            transaction_date: "When",
          },
          created_by: USER_ID,
          created_at: "2026-06-13T00:00:00Z",
          updated_at: "2026-06-13T00:00:00Z",
        },
      ],
      total: 2,
    });
    expect(executor.statements[0]).toContain("from column_mappings");
    expect(executor.statements[0]).toContain("organization_id = $1");
    expect(executor.statements[0]).toContain("source_system = $2");
    expect(executor.statements[1]).toContain("order by created_at desc");
    expect(executor.statements[1]).toContain("limit $3");
    expect(executor.statements[1]).toContain("offset $4");
    expect(executor.params[1]).toEqual([ORG_ID, "generic", 5, 10]);
  });

  it("creates column mappings and maps unique conflicts to duplicates", async () => {
    const createdExecutor = new FakePostgresExecutor([
      [
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: "Custom GL",
          description: "Reusable",
          source_system: "generic",
          mapping_config: {
            account_code: "Acct",
            amount: "Net",
            transaction_date: "When",
          },
          created_by: USER_ID,
          created_at: "2026-06-13T00:00:00Z",
          updated_at: "2026-06-13T00:00:00Z",
        },
      ],
    ]);
    const duplicateExecutor = new FakePostgresExecutor([[]]);

    await expect(
      new PostgresIngestionRepository(createdExecutor).createColumnMapping({
        organizationId: ORG_ID,
        userId: USER_ID,
        name: "Custom GL",
        description: "Reusable",
        sourceSystem: "generic",
        mappingConfig: {
          account_code: "Acct",
          amount: "Net",
          transaction_date: "When",
        },
      }),
    ).resolves.toEqual({
      state: "created",
      mapping: {
        id: "99999999-9999-4999-8999-999999999999",
        name: "Custom GL",
        description: "Reusable",
        source_system: "generic",
        mapping_config: {
          account_code: "Acct",
          amount: "Net",
          transaction_date: "When",
        },
        created_by: USER_ID,
        created_at: "2026-06-13T00:00:00Z",
        updated_at: "2026-06-13T00:00:00Z",
      },
    });
    await expect(
      new PostgresIngestionRepository(duplicateExecutor).createColumnMapping({
        organizationId: ORG_ID,
        userId: USER_ID,
        name: "Custom GL",
        description: null,
        sourceSystem: "generic",
        mappingConfig: {
          account_code: "Acct",
          amount: "Net",
          transaction_date: "When",
        },
      }),
    ).resolves.toEqual({ state: "duplicate" });

    expect(createdExecutor.statements[0]).toContain(
      "on conflict (organization_id, source_system, name) do nothing",
    );
    expect(createdExecutor.params[0]).toEqual([
      ORG_ID,
      "Custom GL",
      "Reusable",
      "generic",
      JSON.stringify({
        account_code: "Acct",
        amount: "Net",
        transaction_date: "When",
      }),
      USER_ID,
    ]);
  });

  it("uploads non-generic imports in one scoped transaction", async () => {
    const executor = new FakePostgresExecutor([
      [{ exists: true }],
      [],
      [{ id: BATCH_ID }],
      [],
      [],
      [],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    const result = await repository.uploadImport({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      fileName: "yardi.csv",
      fileHash: "a".repeat(64),
      sourceSystem: "yardi",
      entries: [
        {
          account_code: "6000",
          account_description: "Repairs",
          amount: "125.50",
          transaction_date: "2026-01-15",
          accrual_date: "2026-01-10",
          period_year: 2026,
          period_month: 1,
          vendor_name: "ABC HVAC",
          description: "January repair",
          raw_row_data: { Account: "6000" },
        },
      ],
      errorCount: 0,
    });

    expect(result).toMatchObject({
      state: "uploaded",
      sourceSystem: "yardi",
      rowCount: 1,
      errorCount: 0,
    });
    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(executor.statements[0]).toContain("from properties");
    expect(executor.statements[0]).toContain("organization_id = $2");
    expect(executor.statements[1]).toContain("from import_batches");
    expect(executor.statements[1]).toContain("property_id = $2");
    expect(executor.params[1]).toEqual([
      ORG_ID,
      PROPERTY_ID,
      "a".repeat(64),
    ]);
    expect(executor.statements[2]).toContain("insert into import_batches");
    expect(executor.statements[2]).toContain(
      "on conflict (organization_id, property_id, file_hash) do nothing",
    );
    expect(executor.statements[3]).toContain("set status = 'processing'");
    expect(executor.statements[4]).toContain("insert into gl_entries");
    expect(executor.statements[4]).toContain("accrual_date");
    expect(executor.statements[5]).toContain("set status = 'completed'");
    expect(executor.params[4]?.slice(2)).toEqual([
      "6000",
      "Repairs",
      "125.50",
      "2026-01-15",
      2026,
      1,
      "ABC HVAC",
      "January repair",
      JSON.stringify({ Account: "6000" }),
      "2026-01-10",
    ]);
  });

  it("maps insert conflicts back to duplicate uploads", async () => {
    const executor = new FakePostgresExecutor([
      [{ exists: true }],
      [],
      [],
      [{ id: OTHER_BATCH_ID, created_at: "2026-06-10T00:00:00Z" }],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.uploadImport({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        fileName: "yardi.csv",
        fileHash: "a".repeat(64),
        sourceSystem: "yardi",
        entries: [],
        errorCount: 0,
      }),
    ).resolves.toEqual({
      state: "duplicate",
      batchId: OTHER_BATCH_ID,
      importedAt: "2026-06-10T00:00:00Z",
    });

    expect(executor.statements[1]).toContain("property_id = $2");
    expect(executor.params[1]).toEqual([
      ORG_ID,
      PROPERTY_ID,
      "a".repeat(64),
    ]);
    expect(executor.statements[2]).toContain(
      "on conflict (organization_id, property_id, file_hash) do nothing",
    );
    expect(executor.statements[3]).toContain("from import_batches");
    expect(executor.statements[3]).toContain("property_id = $2");
    expect(executor.params[3]).toEqual([
      ORG_ID,
      PROPERTY_ID,
      "a".repeat(64),
    ]);
  });

  it("maps a concurrent unique-violation on the file-hash constraint to a duplicate upload", async () => {
    // Simulate the race: propertyBelongsToOrganization (true), findDuplicateBatch
    // (empty), then the INSERT ... ON CONFLICT DO NOTHING RAISES 23505 because a
    // concurrent transaction committed the conflicting row first. The transaction
    // aborts; the fresh re-query outside it must surface the winning batch.
    const uniqueViolation = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "unique_file_per_property"',
      ),
      { code: "23505", constraint_name: "unique_file_per_property" },
    );
    const executor = new ThrowingPostgresExecutor(
      [
        [{ exists: true }], // propertyBelongsToOrganization
        [], // in-transaction findDuplicateBatch (no row yet)
        [{ id: OTHER_BATCH_ID, created_at: "2026-06-10T00:00:00Z" }], // fresh re-query
      ],
      { throwOnStatementIndex: 2, error: uniqueViolation },
    );
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.uploadImport({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        fileName: "yardi.csv",
        fileHash: "a".repeat(64),
        sourceSystem: "yardi",
        entries: [],
        errorCount: 0,
      }),
    ).resolves.toEqual({
      state: "duplicate",
      batchId: OTHER_BATCH_ID,
      importedAt: "2026-06-10T00:00:00Z",
    });

    // The failed INSERT was inside the transaction; the recovery re-query runs
    // outside it (fresh query on the top-level executor).
    expect(executor.statements[2]).toContain("insert into import_batches");
    expect(executor.transactionStates[2]).toBe(true);
    expect(executor.statements[3]).toContain("from import_batches");
    expect(executor.transactionStates[3]).toBe(false);
    expect(executor.params[3]).toEqual([ORG_ID, PROPERTY_ID, "a".repeat(64)]);
  });

  it("re-throws non-unique-violation errors from the upload transaction", async () => {
    const executor = new ThrowingPostgresExecutor(
      [[{ exists: true }], []],
      {
        throwOnStatementIndex: 2,
        error: Object.assign(new Error("connection reset"), { code: "08006" }),
      },
    );
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.uploadImport({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        fileName: "yardi.csv",
        fileHash: "a".repeat(64),
        sourceSystem: "yardi",
        entries: [],
        errorCount: 0,
      }),
    ).rejects.toThrow("connection reset");
  });

  it("chunks large GL inserts to stay below Postgres parameter limits", async () => {
    const entries = Array.from(
      { length: 1001 },
      (_, index): GlEntryInsert => ({
        account_code: String(6000 + index),
        account_description: "Repairs",
        amount: "125.50",
        transaction_date: "2026-01-15",
        accrual_date: null,
        period_year: 2026,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: { Account: String(6000 + index) },
      }),
    );
    const executor = new FakePostgresExecutor([
      [{ exists: true }],
      [],
      [{ id: BATCH_ID }],
      [],
      [],
      [],
      [],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await repository.uploadImport({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      fileName: "yardi.csv",
      fileHash: "a".repeat(64),
      sourceSystem: "yardi",
      entries,
      errorCount: 0,
    });

    const insertStatements = executor.statements.filter((statement) =>
      statement.includes("insert into gl_entries"),
    );
    const insertParams = executor.params.filter((_, index) =>
      executor.statements[index]?.includes("insert into gl_entries"),
    );

    expect(insertStatements).toHaveLength(2);
    expect(insertParams.map((params) => params.length)).toEqual([12000, 12]);
  });

  it("rejects duplicate uploads before creating a new batch", async () => {
    const executor = new FakePostgresExecutor([
      [{ exists: true }],
      [{ id: BATCH_ID, created_at: "2026-06-11T00:00:00Z" }],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.uploadImport({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        fileName: "yardi.csv",
        fileHash: "a".repeat(64),
        sourceSystem: "yardi",
        entries: [],
        errorCount: 0,
      }),
    ).resolves.toEqual({
      state: "duplicate",
      batchId: BATCH_ID,
      importedAt: "2026-06-11T00:00:00Z",
    });

    expect(executor.transactionCount).toBe(1);
    expect(executor.statements).toHaveLength(2);
    expect(executor.statements[1]).toContain("property_id = $2");
    expect(executor.params[1]).toEqual([
      ORG_ID,
      PROPERTY_ID,
      "a".repeat(64),
    ]);
  });

  it("applies generic mappings only after locking an org-scoped pending batch", async () => {
    const executor = new FakePostgresExecutor([
      [
        {
          property_id: PROPERTY_ID,
          status: "pending",
          source_system: "generic",
          file_hash: "b".repeat(64),
        },
      ],
      [],
      [],
      [],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.applyMapping({
        batchId: BATCH_ID,
        organizationId: ORG_ID,
        fileHash: "b".repeat(64),
        entries: [
          {
            account_code: "6000",
            account_description: "Repairs",
            amount: "125.50",
            transaction_date: "2026-01-15",
            accrual_date: null,
            period_year: 2026,
            period_month: 1,
            vendor_name: null,
            description: null,
            raw_row_data: { Acct: "6000" },
          },
        ],
        errorCount: 0,
      }),
    ).resolves.toEqual({
      state: "completed",
      batchId: BATCH_ID,
      propertyId: PROPERTY_ID,
      rowCount: 1,
      errorCount: 0,
    });

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([true, true, true, true]);
    expect(executor.statements[0]).toContain("for update");
    expect(executor.statements[0]).toContain("organization_id = $2");
    expect(executor.statements[1]).toContain("set status = 'processing'");
    expect(executor.statements[2]).toContain("insert into gl_entries");
    expect(executor.statements[3]).toContain("set status = 'completed'");
  });

  it("rejects mapping when the re-uploaded file hash differs", async () => {
    const executor = new FakePostgresExecutor([
      [
        {
          property_id: PROPERTY_ID,
          status: "pending",
          source_system: "generic",
          file_hash: "b".repeat(64),
        },
      ],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.applyMapping({
        batchId: BATCH_ID,
        organizationId: ORG_ID,
        fileHash: "c".repeat(64),
        entries: [],
        errorCount: 0,
      }),
    ).resolves.toEqual({ state: "file_mismatch" });

    expect(executor.transactionCount).toBe(1);
    expect(executor.statements).toHaveLength(1);
  });

  it("scopes preview entries by batch property and organization", async () => {
    const executor = new FakePostgresExecutor([[]]);
    const repository = new PostgresIngestionRepository(executor);

    await repository.listPreviewEntries({
      batchId: BATCH_ID,
      propertyId: PROPERTY_ID,
      organizationId: ORG_ID,
    });

    expect(executor.statements[0]).toContain("join import_batches");
    expect(executor.statements[0]).toContain(
      "import_batches.organization_id = $3",
    );
    expect(executor.statements[0]).toContain("gl_entries.property_id = $2");
    expect(executor.params[0]).toEqual([BATCH_ID, PROPERTY_ID, ORG_ID]);
  });

  it("clears failed batches in a transaction with org and property scoped GL deletion", async () => {
    const executor = new FakePostgresExecutor([
      [{ property_id: PROPERTY_ID, status: "failed" }],
      [{ exists: false }],
      [{ id: "gl-entry" }],
      [],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.retryBatch({
        batchId: BATCH_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual({ state: "retried", deletedGlEntryCount: 1 });

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([true, true, true, true]);
    expect(executor.statements[0]).toContain("for update");
    expect(executor.statements[1]).toContain(
      "import_batches.organization_id = $3",
    );
    expect(executor.statements[1]).toContain("reconciliation_snapshots");
    expect(executor.statements[2]).toContain("delete from gl_entries");
    expect(executor.statements[2]).toContain("using import_batches");
    expect(executor.statements[3]).toContain("delete from import_batches");
    expect(executor.statements[3]).toContain("organization_id = $3");
  });

  it("rejects retry status inside the transaction before deleting GL entries", async () => {
    const executor = new FakePostgresExecutor([
      [{ property_id: PROPERTY_ID, status: "completed" }],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.retryBatch({
        batchId: BATCH_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual({ state: "invalid_status", status: "completed" });

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([true]);
    expect(executor.statements[0]).toContain("for update");
    expect(executor.statements).toHaveLength(1);
  });

  it("checks finalized reconciliation during retry before deleting GL entries", async () => {
    const executor = new FakePostgresExecutor([
      [{ property_id: PROPERTY_ID, status: "failed" }],
      [{ exists: true }],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.retryBatch({
        batchId: BATCH_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual({ state: "finalized_reconciliation" });

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([true, true]);
    expect(executor.statements[0]).toContain("for update");
    expect(executor.statements[1]).toContain("reconciliation_snapshots");
    expect(executor.statements[1]).toContain(
      "import_batches.organization_id = $3",
    );
    expect(executor.statements).toHaveLength(2);
  });

  it("deletes batches in a transaction with org and property scoped GL deletion", async () => {
    const executor = new FakePostgresExecutor([
      [{ property_id: PROPERTY_ID, status: "failed" }],
      [{ exists: false }],
      [{ id: "gl-entry" }],
      [],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.deleteBatch({
        batchId: BATCH_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual({ state: "deleted", deletedGlEntryCount: 1 });

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([true, true, true, true]);
    expect(executor.statements[0]).toContain("for update");
    expect(executor.statements[1]).toContain("reconciliation_snapshots");
    expect(executor.statements[1]).toContain(
      "import_batches.organization_id = $3",
    );
    expect(executor.statements[2]).toContain("delete from gl_entries");
    expect(executor.statements[2]).toContain("using import_batches");
    expect(executor.statements[3]).toContain("delete from import_batches");
    expect(executor.statements[3]).toContain("organization_id = $3");
  });

  it("checks finalized reconciliation inside the transaction before deleting GL entries", async () => {
    const executor = new FakePostgresExecutor([
      [{ property_id: PROPERTY_ID, status: "failed" }],
      [{ exists: true }],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.deleteBatch({
        batchId: BATCH_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual({ state: "finalized_reconciliation" });

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([true, true]);
    expect(executor.statements[0]).toContain("for update");
    expect(executor.statements[1]).toContain("reconciliation_snapshots");
    expect(executor.statements[1]).toContain(
      "import_batches.organization_id = $3",
    );
    expect(executor.statements).toHaveLength(2);
  });

  it("verifies property ownership while reading GL date ranges", async () => {
    const executor = new FakePostgresExecutor([
      [{ min_date: "2026-01-01", max_date: "2026-12-31" }],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    await expect(
      repository.getGlDateRange({
        propertyId: PROPERTY_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual({
      min_date: "2026-01-01",
      max_date: "2026-12-31",
    });
    expect(executor.statements[0]).toContain("join properties");
    expect(executor.statements[0]).toContain("properties.organization_id = $2");
  });

  it("lists property imports scoped by property and organization without selecting nonexistent columns", async () => {
    const executor = new FakePostgresExecutor([
      [{ total: 2 }],
      [
        {
          id: BATCH_ID,
          filename: null,
          file_name: "yardi_export.csv",
          status: "completed",
          parser_type: null,
          source_system: "yardi",
          rows_processed: null,
          row_count: 80,
          rows_failed: null,
          error_count: 3,
          rows_imported: null,
          created_at: "2026-06-12T10:00:00Z",
          completed_at: null,
          error_message: null,
        },
      ],
    ]);
    const repository = new PostgresIngestionRepository(executor);

    const result = await repository.listPropertyImports({
      propertyId: PROPERTY_ID,
      organizationId: ORG_ID,
      page: 2,
      size: 10,
      status: "Completed",
    });

    expect(result.total).toBe(2);
    expect(result.imports).toHaveLength(1);

    // Count query: filtered, no pagination params.
    expect(executor.statements[0]).toContain("count(*)");
    expect(executor.statements[0]).toContain("property_id = $1");
    expect(executor.statements[0]).toContain("organization_id = $2");
    expect(executor.statements[0]).toContain("status = $3");
    expect(executor.params[0]).toEqual([PROPERTY_ID, ORG_ID, "completed"]);

    // Page query: same filters, lowercased status, offset = (2-1)*10 = 10.
    expect(executor.statements[1]).toContain("from import_batches");
    expect(executor.statements[1]).toContain("property_id = $1");
    expect(executor.statements[1]).toContain("organization_id = $2");
    expect(executor.statements[1]).toContain("status = $3");
    expect(executor.statements[1]).toContain("order by created_at desc");
    expect(executor.statements[1]).toContain("limit $4 offset $5");
    expect(executor.params[1]).toEqual([
      PROPERTY_ID,
      ORG_ID,
      "completed",
      10,
      10,
    ]);

    // The select list must reference only columns that exist on import_batches.
    // The canonical columns are aliased from NULL, never selected as bare names.
    const pageSql = executor.statements[1];
    expect(pageSql).not.toMatch(/\bselect\b[\s\S]*?,\s*filename\b/);
    expect(pageSql).toContain("null::text as filename");
    expect(pageSql).toContain("null::text as parser_type");
    expect(pageSql).toContain("null::int as rows_processed");
    expect(pageSql).toContain("null::int as rows_failed");
    expect(pageSql).toContain("null::int as rows_imported");
    expect(pageSql).toContain("null::timestamptz as completed_at");
    expect(pageSql).toContain("null::text as error_message");
    expect(pageSql).toContain("file_name");
    expect(pageSql).toContain("source_system");
    expect(pageSql).toContain("row_count");
    expect(pageSql).toContain("error_count");
  });

  it("omits the status filter when status is 'all'", async () => {
    const executor = new FakePostgresExecutor([[{ total: 0 }], []]);
    const repository = new PostgresIngestionRepository(executor);

    await repository.listPropertyImports({
      propertyId: PROPERTY_ID,
      organizationId: ORG_ID,
      page: 1,
      size: 20,
      status: "all",
    });

    expect(executor.statements[0]).not.toContain("status =");
    expect(executor.params[0]).toEqual([PROPERTY_ID, ORG_ID]);
    expect(executor.statements[1]).not.toContain("status =");
    // offset = (1-1)*20 = 0
    expect(executor.params[1]).toEqual([PROPERTY_ID, ORG_ID, 20, 0]);
  });

  it("treats an empty status string as no filter (Python falsy parity)", async () => {
    const executor = new FakePostgresExecutor([[{ total: 0 }], []]);
    const repository = new PostgresIngestionRepository(executor);

    await repository.listPropertyImports({
      propertyId: PROPERTY_ID,
      organizationId: ORG_ID,
      page: 1,
      size: 20,
      status: "",
    });

    expect(executor.statements[0]).not.toContain("status =");
    expect(executor.params[0]).toEqual([PROPERTY_ID, ORG_ID]);
    expect(executor.statements[1]).not.toContain("status =");
    expect(executor.params[1]).toEqual([PROPERTY_ID, ORG_ID, 20, 0]);
  });
});
