import { describe, expect, it } from "vitest";
import { PostgresReconciliationRepository } from "../adapters/db/reconciliation";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const SNAPSHOT_ID = "55555555-5555-4555-8555-555555555555";
const JOB_ID = "66666666-6666-4666-8666-666666666666";

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
    if (sql.includes("pg_advisory_xact_lock")) {
      return { rows: [] };
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

function jobRow() {
  return {
    id: JOB_ID,
    status: "completed",
    property_id: PROPERTY_ID,
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    total_leases: 2,
    processed_leases: 2,
    snapshot_ids: JSON.stringify([SNAPSHOT_ID]),
    error_message: null,
    created_at: "2026-06-12T00:00:00Z",
    started_at: "2026-06-12T00:01:00Z",
    completed_at: "2026-06-12T00:02:00Z",
  };
}

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SNAPSHOT_ID,
    organization_id: ORG_ID,
    property_id: PROPERTY_ID,
    lease_id: LEASE_ID,
    period_start_date: "2026-01-01",
    period_end_date: "2026-12-31",
    status: "draft",
    total_recovery: "1200.50",
    tenant_share_after_cap: "1100.50",
    admin_fee: "100.00",
    calculation_trace: [{ step: "tenant_share" }],
    manual_overrides: {},
    finalized_at: null,
    created_at: "2026-06-12T00:00:00Z",
    ...overrides,
  };
}

function snapshotDraft() {
  return {
    organization_id: ORG_ID,
    property_id: PROPERTY_ID,
    lease_id: LEASE_ID,
    period_start_date: "2026-01-01",
    period_end_date: "2026-12-31",
    status: "draft" as const,
    total_operating_expenses: "1000.00",
    grossed_up_expenses: "1000.00",
    base_year_amount: "0.00",
    tenant_share_before_cap: "1100.00",
    total_recovery: "1200.00",
    tenant_share_after_cap: "1100.00",
    admin_fee: "100.00",
    calculation_trace: [],
    engine_version: "test",
    trace_checksum: "checksum",
    pool_breakdowns: null,
    lease_terms_snapshot: {},
    term_version_id: null,
  };
}

describe("PostgresReconciliationRepository", () => {
  it("creates calculation jobs after property and active lease checks", async () => {
    const executor = new FakePostgresExecutor([
      [{ exists: true }],
      [{ exists: true }],
      [{ exists: false }],
      [{ id: JOB_ID, organization_id: ORG_ID }],
      [],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.createCalculationJob({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        forceRecalculate: true,
      }),
    ).resolves.toEqual({
      state: "created",
      jobId: JOB_ID,
      organizationId: ORG_ID,
    });

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([true, true, true, true, true]);
    expect(executor.statements[0]).toContain("from properties");
    expect(executor.statements[1]).toContain("from leases");
    expect(executor.statements[1]).toContain("leases.start_date <= $4::date");
    expect(executor.statements[2]).toContain("from reconciliation_snapshots");
    expect(executor.statements[2]).toContain("status = 'finalized'");
    expect(executor.statements[3]).toContain("insert into calculation_jobs");
    expect(executor.params[3]).toEqual([
      ORG_ID,
      PROPERTY_ID,
      "2026-01-01",
      "2026-12-31",
      true,
    ]);
    expect(executor.statements[4]).toContain(
      "insert into reconciliation_campaigns",
    );
    expect(executor.statements[4]).toContain(
      "on conflict (property_id, period_year) do nothing",
    );
  });

  it("rejects calculation jobs when the period is already finalized", async () => {
    const executor = new FakePostgresExecutor([
      [{ exists: true }],
      [{ exists: true }],
      [{ exists: true }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.createCalculationJob({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        // force_recalculate must NOT bypass the immutable finalized guard.
        forceRecalculate: true,
      }),
    ).resolves.toEqual({ state: "period_finalized" });

    // No job insert, no campaign upsert once the period is finalized.
    expect(executor.statements).toHaveLength(3);
    expect(executor.statements[2]).toContain("from reconciliation_snapshots");
    expect(executor.statements[2]).toContain("status = 'finalized'");
  });

  it("rejects calculation jobs without a scoped property or active lease", async () => {
    const missingProperty = new FakePostgresExecutor([[{ exists: false }]]);
    const noLease = new FakePostgresExecutor([
      [{ exists: true }],
      [{ exists: false }],
    ]);

    await expect(
      new PostgresReconciliationRepository(
        missingProperty,
      ).createCalculationJob({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        forceRecalculate: false,
      }),
    ).resolves.toEqual({ state: "property_not_found" });
    await expect(
      new PostgresReconciliationRepository(noLease).createCalculationJob({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        forceRecalculate: false,
      }),
    ).resolves.toEqual({ state: "no_active_leases" });

    expect(missingProperty.statements).toHaveLength(1);
    expect(noLease.statements).toHaveLength(2);
  });

  it("marks pending calculation jobs failed when enqueue fails", async () => {
    const executor = new FakePostgresExecutor([[]]);
    const repository = new PostgresReconciliationRepository(executor);

    await repository.markCalculationEnqueueFailed({
      jobId: JOB_ID,
      organizationId: ORG_ID,
      errorMessage: "x".repeat(2500),
    });

    expect(executor.statements[0]).toContain("set status = 'failed'");
    expect(executor.statements[0]).toContain("and status = 'pending'");
    expect(String(executor.params[0]?.[2])).toHaveLength(2000);
  });

  it("locks and rechecks finalized periods before persisting calculation results", async () => {
    const executor = new FakePostgresExecutor([
      [{ id: JOB_ID }],
      [{ exists: false }],
      [],
      [{ id: SNAPSHOT_ID }],
      [{ id: JOB_ID }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.persistCalculationResults({
        jobId: JOB_ID,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        forceRecalculate: true,
        snapshots: [
          {
            organization_id: ORG_ID,
            property_id: PROPERTY_ID,
            lease_id: LEASE_ID,
            period_start_date: "2026-01-01",
            period_end_date: "2026-12-31",
            status: "draft",
            total_operating_expenses: "1000.00",
            grossed_up_expenses: "1000.00",
            base_year_amount: "0.00",
            tenant_share_before_cap: "1100.00",
            total_recovery: "1200.00",
            tenant_share_after_cap: "1100.00",
            admin_fee: "100.00",
            calculation_trace: [],
            engine_version: "test",
            trace_checksum: "checksum",
            pool_breakdowns: null,
            lease_terms_snapshot: {},
            term_version_id: null,
          },
        ],
      }),
    ).resolves.toEqual([SNAPSHOT_ID]);

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(executor.statements[0]).toContain("from calculation_jobs");
    expect(executor.statements[0]).toContain("and status = 'running'");
    expect(executor.statements[0]).toContain("for update");
    expect(executor.params[0]).toEqual([JOB_ID, ORG_ID]);
    expect(executor.statements[1]).toContain("pg_advisory_xact_lock");
    expect(executor.params[1]).toEqual([
      "capveri:financial-evidence",
      `${ORG_ID}:${PROPERTY_ID}`,
    ]);
    expect(executor.statements[2]).toContain("from reconciliation_snapshots");
    expect(executor.statements[2]).toContain("status = 'finalized'");
    expect(executor.params[2]).toEqual([
      PROPERTY_ID,
      ORG_ID,
      "2026-01-01",
      "2026-12-31",
    ]);
    expect(executor.statements[3]).toContain(
      "delete from reconciliation_snapshots",
    );
    expect(executor.statements[4]).toContain(
      "insert into reconciliation_snapshots",
    );
    expect(executor.statements[5]).toContain("set status = 'completed'");
    expect(executor.statements[5]).toContain("and status = 'running'");
    expect(executor.statements[5]).toContain("returning id");
  });

  it("rejects calculation result persistence when a finalized period appears before the write", async () => {
    const executor = new FakePostgresExecutor([
      [{ id: JOB_ID }],
      [{ exists: true }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.persistCalculationResults({
        jobId: JOB_ID,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        forceRecalculate: true,
        snapshots: [],
      }),
    ).rejects.toThrow("finalized reconciliation snapshot already exists");

    expect(executor.transactionCount).toBe(1);
    expect(executor.statements[0]).toContain("from calculation_jobs");
    expect(executor.statements[0]).toContain("and status = 'running'");
    expect(executor.params[0]).toEqual([JOB_ID, ORG_ID]);
    expect(executor.statements[1]).toContain("pg_advisory_xact_lock");
    expect(executor.params[1]).toEqual([
      "capveri:financial-evidence",
      `${ORG_ID}:${PROPERTY_ID}`,
    ]);
    expect(executor.statements[2]).toContain("status = 'finalized'");
    expect(executor.params[2]).toEqual([
      PROPERTY_ID,
      ORG_ID,
      "2026-01-01",
      "2026-12-31",
    ]);
    expect(executor.statements).toHaveLength(3);
  });

  it("rejects non-force calculation result persistence when a draft appears before the write", async () => {
    const executor = new FakePostgresExecutor([
      [{ id: JOB_ID }],
      [{ exists: false }],
      [{ count: "1" }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.persistCalculationResults({
        jobId: JOB_ID,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        forceRecalculate: false,
        snapshots: [snapshotDraft()],
      }),
    ).rejects.toThrow("Draft reconciliation snapshots already exist");

    expect(executor.transactionCount).toBe(1);
    expect(executor.statements[0]).toContain("from calculation_jobs");
    expect(executor.statements[0]).toContain("and status = 'running'");
    expect(executor.statements[1]).toContain("pg_advisory_xact_lock");
    expect(executor.statements[2]).toContain("status = 'finalized'");
    expect(executor.statements[3]).toContain("from reconciliation_snapshots");
    expect(executor.statements[3]).toContain("status = 'draft'");
    expect(executor.params[3]).toEqual([
      PROPERTY_ID,
      ORG_ID,
      "2026-01-01",
      "2026-12-31",
    ]);
    expect(executor.statements.join("\n")).not.toContain(
      "insert into reconciliation_snapshots",
    );
    expect(executor.statements.join("\n")).not.toContain(
      "set status = 'completed'",
    );
    expect(executor.statements).toHaveLength(4);
  });

  it("does not persist calculation results when the job is no longer running", async () => {
    const executor = new FakePostgresExecutor([[]]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.persistCalculationResults({
        jobId: JOB_ID,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        forceRecalculate: true,
        snapshots: [
          {
            organization_id: ORG_ID,
            property_id: PROPERTY_ID,
            lease_id: LEASE_ID,
            period_start_date: "2026-01-01",
            period_end_date: "2026-12-31",
            status: "draft",
            total_operating_expenses: "1000.00",
            grossed_up_expenses: "1000.00",
            base_year_amount: "0.00",
            tenant_share_before_cap: "1100.00",
            total_recovery: "1200.00",
            tenant_share_after_cap: "1100.00",
            admin_fee: "100.00",
            calculation_trace: [],
            engine_version: "test",
            trace_checksum: "checksum",
            pool_breakdowns: null,
            lease_terms_snapshot: {},
            term_version_id: null,
          },
        ],
      }),
    ).rejects.toThrow("no longer running");

    expect(executor.transactionCount).toBe(1);
    expect(executor.statements).toHaveLength(1);
    expect(executor.statements[0]).toContain("from calculation_jobs");
    expect(executor.statements[0]).toContain("and status = 'running'");
    expect(executor.statements[0]).toContain("for update");
    expect(executor.params[0]).toEqual([JOB_ID, ORG_ID]);
  });

  it("marks only running calculation jobs failed for redelivery recovery", async () => {
    const executor = new FakePostgresExecutor([[{ id: JOB_ID }]]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.markRunningCalculationFailed({
        jobId: JOB_ID,
        organizationId: ORG_ID,
        errorMessage: "x".repeat(2500),
        errorDetails: { type: "QueueRedelivery", attempts: 2 },
      }),
    ).resolves.toBe(true);

    expect(executor.statements[0]).toContain("set status = 'failed'");
    expect(executor.statements[0]).toContain("and status = 'running'");
    expect(executor.statements[0]).toContain("returning id");
    expect(executor.params[0]?.[0]).toBe(JOB_ID);
    expect(executor.params[0]?.[1]).toBe(ORG_ID);
    expect(String(executor.params[0]?.[2])).toHaveLength(2000);
    expect(JSON.parse(String(executor.params[0]?.[3]))).toEqual({
      type: "QueueRedelivery",
      attempts: 2,
    });
  });

  it("reports no redelivery recovery when the running guard does not match", async () => {
    const executor = new FakePostgresExecutor([[]]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.markRunningCalculationFailed({
        jobId: JOB_ID,
        organizationId: ORG_ID,
        errorMessage: "redelivered",
        errorDetails: { type: "QueueRedelivery" },
      }),
    ).resolves.toBe(false);
  });

  it("loads calculation job status and sums completed recovery totals by org", async () => {
    const executor = new FakePostgresExecutor([
      [jobRow()],
      [{ total: "1200.50" }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.getJobStatus({ jobId: JOB_ID, organizationId: ORG_ID }),
    ).resolves.toMatchObject({
      job_id: JOB_ID,
      status: "completed",
      progress_percentage: 100,
      snapshot_ids: [SNAPSHOT_ID],
      potential_recovery_total: "1200.50",
    });

    expect(executor.statements[0]).toContain("from calculation_jobs");
    expect(executor.statements[0]).toContain(
      "coalesce(snapshot_ids, '[]'::jsonb) as snapshot_ids",
    );
    expect(executor.statements[0]).not.toContain("uuid[]");
    expect(executor.statements[0]).toContain("and organization_id = $2");
    expect(executor.params[0]).toEqual([JOB_ID, ORG_ID]);
    expect(executor.statements[1]).toContain("from reconciliation_snapshots");
    expect(executor.statements[1]).toContain("and organization_id = $2");
    expect(executor.params[1]).toEqual([[SNAPSHOT_ID], ORG_ID]);
  });

  it("loads snapshots by id with explicit organization scope and optional trace stripping", async () => {
    const executor = new FakePostgresExecutor([[snapshotRow()]]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.getSnapshot({
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        includeTrace: false,
      }),
    ).resolves.toMatchObject({
      id: SNAPSHOT_ID,
      calculation_trace: [],
    });

    expect(executor.statements[0]).toContain("where id = $1");
    expect(executor.statements[0]).toContain("and organization_id = $2");
    expect(executor.params[0]).toEqual([SNAPSHOT_ID, ORG_ID]);
  });

  it("coerces porsager Date-decoded date/timestamp columns to strings (getSnapshot select *)", async () => {
    // porsager/postgres.js decodes bare `date`/`timestamptz` columns to JS Date
    // objects. getSnapshot uses `select *` (no ::text cast), so the driver hands
    // back Date for period_start_date / period_end_date / finalized_at /
    // created_at. The record type declares these as strings and downstream code
    // calls string ops on them: reconciliationUrl does
    // `period_start_date.slice(0, 4)` to build the finalize-results email URL —
    // a Date there throws TypeError, which the finalize handler's swallow()
    // discards, so the notification email is silently never sent. The snapshot
    // detail endpoint (c.json) would also serialize a Date as a full ISO
    // timestamp ("2026-01-01T00:00:00.000Z") instead of "2026-01-01",
    // off-by-one for users west of UTC.
    const executor = new FakePostgresExecutor([
      [
        snapshotRow({
          period_start_date: new Date("2026-01-01T00:00:00.000Z"),
          period_end_date: new Date("2026-12-31T00:00:00.000Z"),
          finalized_at: new Date("2026-06-12T15:30:00.000Z"),
          created_at: new Date("2026-06-12T00:00:00.000Z"),
        }),
      ],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    const snapshot = await repository.getSnapshot({
      snapshotId: SNAPSHOT_ID,
      organizationId: ORG_ID,
      includeTrace: true,
    });

    expect(snapshot?.period_start_date).toBe("2026-01-01");
    expect(snapshot?.period_end_date).toBe("2026-12-31");
    expect(snapshot?.finalized_at).toBe("2026-06-12T15:30:00.000Z");
    expect(snapshot?.created_at).toBe("2026-06-12T00:00:00.000Z");
    expect(typeof snapshot?.period_start_date).toBe("string");
  });

  it("normalizes pool_breakdowns to an array/null on read regardless of driver decode (getSnapshot)", async () => {
    // pool_breakdowns is a JSONB array. Depending on the driver decode path the
    // column can come back as a JSON *string* rather than a parsed array. Without
    // read-normalization getSnapshot returns a string while its JSONB siblings
    // (calculation_trace / manual_overrides) return parsed values, and a consumer
    // that does `pool_breakdowns.map(...)` would throw. The coercion must be
    // idempotent (parsed array passes through) and preserve the meaningful NULL
    // (aggregate-only snapshot) as null, distinct from an empty array.
    const stringDecoded = new FakePostgresExecutor([
      [
        snapshotRow({
          pool_breakdowns: JSON.stringify([
            { pool_name: "Taxes", total_recovery: "500.00" },
          ]),
        }),
      ],
    ]);
    const fromString = await new PostgresReconciliationRepository(
      stringDecoded,
    ).getSnapshot({
      snapshotId: SNAPSHOT_ID,
      organizationId: ORG_ID,
      includeTrace: true,
    });
    expect(Array.isArray(fromString?.pool_breakdowns)).toBe(true);
    expect(fromString?.pool_breakdowns).toEqual([
      { pool_name: "Taxes", total_recovery: "500.00" },
    ]);

    const arrayDecoded = new FakePostgresExecutor([
      [
        snapshotRow({
          pool_breakdowns: [{ pool_name: "Insurance", total_recovery: "10.00" }],
        }),
      ],
    ]);
    const fromArray = await new PostgresReconciliationRepository(
      arrayDecoded,
    ).getSnapshot({
      snapshotId: SNAPSHOT_ID,
      organizationId: ORG_ID,
      includeTrace: true,
    });
    expect(fromArray?.pool_breakdowns).toEqual([
      { pool_name: "Insurance", total_recovery: "10.00" },
    ]);

    const nullDecoded = new FakePostgresExecutor([
      [snapshotRow({ pool_breakdowns: null })],
    ]);
    const fromNull = await new PostgresReconciliationRepository(
      nullDecoded,
    ).getSnapshot({
      snapshotId: SNAPSHOT_ID,
      organizationId: ORG_ID,
      includeTrace: true,
    });
    expect(fromNull?.pool_breakdowns).toBeNull();
  });

  it("lists snapshots with filters, sorting, count, limit, and offset", async () => {
    const executor = new FakePostgresExecutor([
      [{ count: "3" }],
      [
        {
          ...snapshotRow(),
          is_finalized: false,
          tenant_name: "Acme Retail",
          property_name: "Main Plaza",
        },
      ],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.listSnapshots({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        leaseId: LEASE_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        isFinalized: false,
        sortBy: "tenant_name",
        sortOrder: "asc",
        page: 2,
        size: 10,
      }),
    ).resolves.toMatchObject({
      total: 3,
      page: 2,
      page_size: 10,
      items: [{ tenant_name: "Acme Retail" }],
    });

    expect(executor.statements[0]).toContain("select count(*) as count");
    expect(executor.statements[1]).toContain("order by leases.tenant_name asc");
    expect(executor.statements[1]).toContain("limit $7 offset $8");
    expect(executor.params[1]).toEqual([
      ORG_ID,
      PROPERTY_ID,
      LEASE_ID,
      "2026-01-01",
      "2026-12-31",
      "draft",
      10,
      10,
    ]);
  });

  it("finalizes one draft snapshot in a transaction", async () => {
    const executor = new FakePostgresExecutor([
      [{ property_id: PROPERTY_ID }],
      [snapshotRow()],
      [
        {
          id: SNAPSHOT_ID,
          status: "finalized",
          finalized_at: "2026-06-12T12:00:00.000Z",
          finalized_by_user_id: USER_ID,
        },
      ],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.finalizeSnapshot({
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
        finalizedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      state: "finalized",
      snapshot: { id: SNAPSHOT_ID, status: "finalized" },
    });

    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates).toEqual([true, true, true, true]);
    expect(executor.statements[0]).not.toContain("for update");
    expect(executor.statements[1]).toContain("pg_advisory_xact_lock");
    expect(executor.statements[2]).toContain("for update");
    expect(executor.statements[3]).toContain("and status = 'draft'");
  });

  it("rejects finalizing snapshots without calculation trace", async () => {
    const executor = new FakePostgresExecutor([
      [{ property_id: PROPERTY_ID }],
      [snapshotRow({ calculation_trace: [] })],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.finalizeSnapshot({
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
        finalizedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toEqual({ state: "missing_trace" });

    expect(executor.statements).toHaveLength(3);
    expect(executor.statements[1]).toContain("pg_advisory_xact_lock");
    expect(executor.statements[2]).toContain("for update");
  });

  it("batch finalizes valid snapshots and records invalid trace failures", async () => {
    const otherSnapshotId = "55555555-5555-4555-8555-555555555556";
    const executor = new FakePostgresExecutor([
      [
        snapshotRow(),
        snapshotRow({ id: otherSnapshotId, calculation_trace: [] }),
      ],
      [
        {
          id: SNAPSHOT_ID,
          status: "finalized",
          finalized_at: "2026-06-12T12:00:00.000Z",
          finalized_by_user_id: USER_ID,
        },
      ],
      [],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.finalizeBatch({
        propertyId: PROPERTY_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        finalizedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      state: "completed",
      total_attempted: 2,
      total_succeeded: 1,
      total_failed: 1,
    });

    expect(executor.statements[0]).toContain("pg_advisory_xact_lock");
    expect(executor.statements[1]).toContain("for update");
    expect(executor.statements[3]).toContain(
      "insert into reconciliation_campaigns",
    );
    expect(executor.statements[3]).toContain("period_year");
    expect(executor.statements[3]).toContain(
      "on conflict (property_id, period_year)",
    );
    expect(executor.statements[3]).not.toContain(" year,");
    // The campaign flip must run INSIDE the finalize transaction. Running it
    // after the commit (the old behavior) left a crash window that could
    // permanently desync finalized snapshots from a still-'draft' campaign.
    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionStates[3]).toBe(true);
  });

  it("rolls back the whole finalize when the campaign flip fails (atomicity)", async () => {
    // A throwing campaign upsert must abort the entire finalization, not leave
    // snapshots finalized while the error is swallowed as a warning. This fake
    // throws on the reconciliation_campaigns insert; finalizeBatch must reject.
    class ThrowingCampaignExecutor extends FakePostgresExecutor {
      override async query<Row>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<QueryResult<Row>> {
        if (sql.includes("insert into reconciliation_campaigns")) {
          throw new Error("campaign upsert failed");
        }
        return super.query<Row>(sql, params);
      }
    }

    const executor = new ThrowingCampaignExecutor([
      [snapshotRow()],
      [
        {
          id: SNAPSHOT_ID,
          status: "finalized",
          finalized_at: "2026-06-12T12:00:00.000Z",
          finalized_by_user_id: USER_ID,
        },
      ],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.finalizeBatch({
        propertyId: PROPERTY_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        finalizedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).rejects.toThrow("campaign upsert failed");
  });

  it("updates editable cells with manual override metadata in a transaction", async () => {
    const executor = new FakePostgresExecutor([
      [snapshotRow({ manual_overrides: { admin_fee: { value: "100.00" } } })],
      [{ id: SNAPSHOT_ID }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.updateCell({
        cellId: "encoded-cell",
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        fieldName: "total_recovery",
        value: "1250.00",
        userId: USER_ID,
        updatedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      state: "updated",
      cell: {
        snapshot_id: SNAPSHOT_ID,
        field_name: "total_recovery",
        value: "1250.00",
      },
    });

    expect(executor.statements[1]).toContain("set total_recovery = $3");
    expect(executor.params[1]?.[3]).toBe(
      JSON.stringify({
        admin_fee: { value: "100.00" },
        total_recovery: {
          value: "1250.00",
          user_id: USER_ID,
          timestamp: "2026-06-12T12:00:00.000Z",
        },
      }),
    );
  });

  it("recomputes total recovery when admin fee changes without total recovery override", async () => {
    const executor = new FakePostgresExecutor([
      [
        snapshotRow({
          tenant_share_after_cap: "4550.00",
          admin_fee: "455.00",
          total_recovery: "5005.00",
        }),
      ],
      [{ id: SNAPSHOT_ID }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.updateCell({
        cellId: "encoded-cell",
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        fieldName: "admin_fee",
        value: "456.78",
        userId: USER_ID,
        updatedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      state: "updated",
      cell: {
        snapshot_id: SNAPSHOT_ID,
        field_name: "admin_fee",
        value: "456.78",
      },
    });

    expect(executor.statements[1]).toContain("set admin_fee = $3");
    expect(executor.statements[1]).toContain("total_recovery = $5");
    expect(executor.params[1]?.[4]).toBe("5006.78");
  });

  it("rounds the recomputed total recovery half-up (engine parity), not half-even", async () => {
    // A manual cell override may carry sub-cent precision (the route schema
    // /^\d+(\.\d+)?$/ accepts any decimals), so the dependent total_recovery
    // recompute can land exactly on a half-cent. The whole calculation/billing
    // layer rounds ROUND_HALF_UP (Money.roundDivide, cap engine, occupancy);
    // this recompute previously used ROUND_HALF_EVEN, under-billing by a cent
    // versus the engine that produces the non-override total_recovery.
    // 1000.00 + 0.125 = 1000.125 -> HALF_UP 1000.13 (NOT half-even 1000.12).
    const executor = new FakePostgresExecutor([
      [
        snapshotRow({
          tenant_share_after_cap: "1000.00",
          admin_fee: "0.00",
          total_recovery: "1000.00",
        }),
      ],
      [{ id: SNAPSHOT_ID }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.updateCell({
        cellId: "encoded-cell",
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        fieldName: "admin_fee",
        value: "0.125",
        userId: USER_ID,
        updatedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({ state: "updated" });

    expect(executor.statements[1]).toContain("total_recovery = $5");
    expect(executor.params[1]?.[4]).toBe("1000.13");
  });

  it("preserves an explicit total recovery override when admin fee changes", async () => {
    const executor = new FakePostgresExecutor([
      [
        snapshotRow({
          tenant_share_after_cap: "4550.00",
          admin_fee: "455.00",
          total_recovery: "5100.00",
          manual_overrides: {
            total_recovery: {
              value: "5100.00",
              user_id: USER_ID,
              timestamp: "2026-06-12T11:00:00.000Z",
            },
          },
        }),
      ],
      [{ id: SNAPSHOT_ID }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.updateCell({
        cellId: "encoded-cell",
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        fieldName: "admin_fee",
        value: "456.78",
        userId: USER_ID,
        updatedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({ state: "updated" });

    expect(executor.statements[1]).toContain("set admin_fee = $3");
    expect(executor.statements[1]).not.toContain("total_recovery = $5");
    expect(executor.params[1]).toHaveLength(4);
  });

  it("recomputes total recovery when tenant share after cap changes without total recovery override", async () => {
    const executor = new FakePostgresExecutor([
      [
        snapshotRow({
          tenant_share_after_cap: "4550.00",
          admin_fee: "456.78",
          total_recovery: "5006.78",
        }),
      ],
      [{ id: SNAPSHOT_ID }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.updateCell({
        cellId: "encoded-cell",
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        fieldName: "tenant_share_after_cap",
        value: "4600.25",
        userId: USER_ID,
        updatedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      state: "updated",
      cell: {
        snapshot_id: SNAPSHOT_ID,
        field_name: "tenant_share_after_cap",
        value: "4600.25",
      },
    });

    expect(executor.statements[1]).toContain("set tenant_share_after_cap = $3");
    expect(executor.statements[1]).toContain("total_recovery = $5");
    expect(executor.params[1]?.[4]).toBe("5057.03");
  });

  it("preserves an explicit total recovery override when tenant share after cap changes", async () => {
    const executor = new FakePostgresExecutor([
      [
        snapshotRow({
          tenant_share_after_cap: "4550.00",
          admin_fee: "456.78",
          total_recovery: "5100.00",
          manual_overrides: {
            total_recovery: {
              value: "5100.00",
              user_id: USER_ID,
              timestamp: "2026-06-12T11:00:00.000Z",
            },
          },
        }),
      ],
      [{ id: SNAPSHOT_ID }],
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await expect(
      repository.updateCell({
        cellId: "encoded-cell",
        snapshotId: SNAPSHOT_ID,
        organizationId: ORG_ID,
        fieldName: "tenant_share_after_cap",
        value: "4600.25",
        userId: USER_ID,
        updatedAt: "2026-06-12T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({ state: "updated" });

    expect(executor.statements[1]).toContain("set tenant_share_after_cap = $3");
    expect(executor.statements[1]).not.toContain("total_recovery = $5");
    expect(executor.params[1]).toHaveLength(4);
  });

  it("scopes every calculation-dataset query to the job organization (RLS-bypass defense-in-depth)", async () => {
    // The reconciliation queue path runs on a raw executor with no RLS session,
    // so the org filter below is the SOLE tenant-isolation guard for these reads.
    // Pin that all seven sub-queries carry an explicit organization scope so a
    // property-only query can never regress back in.
    const executor = new FakePostgresExecutor([
      [
        {
          id: PROPERTY_ID,
          totalRentableSqft: "10000",
          targetOccupancy: "0.95",
        },
      ],
      [], // leases
      [], // gl entries
      [], // expense pools
      [], // pool mappings
      [], // pool allocations
      [], // cap histories
    ]);
    const repository = new PostgresReconciliationRepository(executor);

    await repository.loadCalculationDataset({
      job: {
        id: JOB_ID,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        status: "running",
        forceRecalculate: false,
      },
    });

    // Promise.all preserves call order: property, leases, gl, pools, mappings,
    // pool allocations, caps.
    const [property, leases, gl, pools, mappings, allocations, caps] =
      executor.statements;

    expect(property).toContain("from properties");
    expect(property).toContain("and organization_id = $2");

    expect(leases).toContain("from leases");
    expect(leases).toContain("properties.organization_id = $4");
    expect(gl).toContain("from gl_entries");
    expect(gl).toContain("properties.organization_id = $4");
    expect(pools).toContain("from expense_pools");
    expect(pools).toContain("properties.organization_id = $2");
    expect(mappings).toContain("from pool_mappings");
    expect(mappings).toContain("properties.organization_id = $2");
    // pool_allocations joins through expense_pools and re-asserts the org via an
    // EXISTS sub-select, so a malicious source pool in another org cannot leak.
    expect(allocations).toContain("from pool_allocations");
    expect(allocations).toContain("properties.organization_id = $2");
    expect(caps).toContain("from reconciliation_snapshots");
    expect(caps).toContain("and organization_id = $2");

    // The org id must actually be bound for each scoped query.
    expect(executor.params[0]).toEqual([PROPERTY_ID, ORG_ID]);
    expect(executor.params[1]).toEqual([
      PROPERTY_ID,
      "2026-01-01",
      "2026-12-31",
      ORG_ID,
    ]);
    expect(executor.params[2]).toEqual([
      PROPERTY_ID,
      "2026-01-01",
      "2026-12-31",
      ORG_ID,
    ]);
    expect(executor.params[3]).toEqual([PROPERTY_ID, ORG_ID]);
    expect(executor.params[4]).toEqual([PROPERTY_ID, ORG_ID]);
    expect(executor.params[5]).toEqual([PROPERTY_ID, ORG_ID]);
    expect(executor.params[6]).toEqual([PROPERTY_ID, ORG_ID, "2026-01-01"]);
  });
});
