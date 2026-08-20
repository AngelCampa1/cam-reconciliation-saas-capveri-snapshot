import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  PostHogServerAnalytics,
  type ServerAnalytics,
} from "../adapters/analytics/posthog";
import { PostgresActualBilledRepository } from "../adapters/db/actual-billed";
import { PostgresReconciliationRepository } from "../adapters/db/reconciliation";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { ActualBilledRepository } from "../domain/actual-billed/repository";
import { calculateBillingExposure } from "../domain/actual-billed/billing-exposure";
import {
  editableReconciliationFields,
  type EditableReconciliationField,
  type ReconciliationRepository,
  type SnapshotListFilters,
} from "../domain/reconciliation/repository";
import { buildCapBankLedger } from "../domain/reconciliation/cap-bank-ledger";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import type {
  QueueConsumerMessage,
  QueueHandlerContext,
} from "../queues/consumers";
import { createQueueProducer, type QueueProducer } from "../queues/producers";
import { createReconciliationQueueHandlers } from "../workflows/reconciliation";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type ReconciliationRouteDependencies = {
  repository?: ReconciliationRepository;
  actualBilledRepository?: Pick<
    ActualBilledRepository,
    "loadBillingExposureDataset"
  >;
  queueProducer?: QueueProducer;
  analytics?: ServerAnalytics;
  resultsEmailSender?: ReconciliationResultsEmailSender;
  auth?: AuthMiddlewareOptions;
  clock?: () => Date;
};

export type ReconciliationResultsEmailSender = {
  send(input: ReconciliationResultsEmailInput): Promise<boolean>;
};

export type ReconciliationResultsEmailInput = {
  toEmail: string;
  firstName: string | null;
  idempotencyKey: string;
  propertyName: string | null;
  statementUrl: string;
  clean: true;
  billingExposure?: {
    totalUnderbillExposure: string;
    totalOverbillExposure: string;
    totalBillingExposure: string;
  };
  metadata: Record<string, string>;
};

const uuidSchema = z.string().uuid();
const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");
// Reconciliation period endpoints must be real calendar dates. A shape-only
// regex (`^\d{4}-\d{2}-\d{2}$`) accepts impossible dates like 2025-02-30, which
// the porsager driver's `new Date(...)` silently rolls forward (2025-02-30 ->
// 2025-03-02) before the `::date` bind — shifting the period denominator and
// every proration/day-count. `.date()` validates calendar validity (matches the
// lease + recovery-profile schemas) and rejects 2025-02-30 / 2025-13-01 / etc.
const isoCalendarDateSchema = z.string().date();
const snapshotListQuerySchema = z.object({
  property_id: z.string().uuid().optional(),
  lease_id: z.string().uuid().optional(),
  period_start: isoCalendarDateSchema.optional(),
  period_end: isoCalendarDateSchema.optional(),
  is_finalized: booleanQuerySchema.optional(),
  sort_by: z
    .enum(["created_at", "tenant_name", "total_recovery"])
    .default("created_at"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
  // Ceiling at MAX_SAFE_INTEGER: past it, a `page` value stringifies in exponent
  // notation and Postgres rejects the resulting OFFSET (22P02 -> opaque 500).
  // (page-1)*size stays < 1e21 and within int8, so out-of-range fails closed 422.
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});
const batchFinalizeSchema = z.object({
  property_id: z.string().uuid(),
  period_start: isoCalendarDateSchema,
  period_end: isoCalendarDateSchema,
});
const calculateSchema = z
  .object({
    property_id: z.string().uuid(),
    period_start: isoCalendarDateSchema,
    period_end: isoCalendarDateSchema,
    force_recalculate: z.boolean().default(false),
  })
  .refine((value) => value.period_end > value.period_start, {
    message: "period_end must be after period_start",
    path: ["period_end"],
  });
const cellUpdateSchema = z.object({
  value: z.union([z.string(), z.number()]).transform((value, context) => {
    const text = String(value);
    // The seven editable reconciliation columns are NUMERIC(14,2); accepting
    // more than two decimal places lets Postgres silently round the input
    // (e.g. "100.125" -> "100.13"), so the stored/echoed value would not match
    // what the client submitted. Reject sub-cent precision at the boundary.
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
      context.addIssue({
        code: "custom",
        message:
          "Cell value must be a non-negative number with at most 2 decimal places",
      });
      return z.NEVER;
    }

    return text;
  }),
});

export function createReconciliationRoutes(
  dependencies: ReconciliationRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/reconciliation/*", authMiddleware(dependencies.auth));

  app.post("/reconciliation/calculate", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const body = calculateSchema.parse(await c.req.json());
    const repository = resolveRepository(c.env, dependencies);
    const result = await repository.createCalculationJob({
      organizationId: c.get("auth").actor.organizationId,
      propertyId: body.property_id,
      periodStart: body.period_start,
      periodEnd: body.period_end,
      forceRecalculate: body.force_recalculate,
    });

    if (result.state === "property_not_found") {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    if (result.state === "no_active_leases") {
      throw new HttpError(
        422,
        "no_active_leases_for_period",
        "no_active_leases_for_period",
      );
    }

    if (result.state === "period_finalized") {
      throw new HttpError(
        409,
        "period_already_finalized",
        "This period already has a finalized reconciliation. Finalized snapshots are immutable, so it cannot be recalculated.",
      );
    }

    const queueMessage = {
      version: 1,
      jobId: result.jobId,
      organizationId: result.organizationId,
    } as const;

    try {
      await resolveQueueProducer(c.env, dependencies).enqueueReconciliation({
        ...queueMessage,
      });
      if (shouldRunInlineReconciliationQueue(c.env)) {
        const handler = createReconciliationQueueHandlers({
          repository,
          analytics: resolveAnalytics(dependencies),
          env: c.env,
        }).reconciliation;
        if (!handler) {
          throw new Error("Local reconciliation queue handler is unavailable.");
        }
        await handler(queueMessage, createInlineQueueMessage(queueMessage), {
          env: c.env,
          executionContext: {} as ExecutionContext,
          queue: "capveri-reconciliation-local-e2e",
          metadata: {} as MessageBatchMetadata,
        } satisfies QueueHandlerContext);
      }
    } catch (error) {
      await repository.markCalculationEnqueueFailed({
        jobId: result.jobId,
        organizationId: result.organizationId,
        errorMessage: errorMessage(error),
      });
      throw error;
    }

    return c.json(
      {
        job_id: result.jobId,
        status: "pending",
        message: [
          "Reconciliation calculation started.",
          `Use job_id ${result.jobId} to check status.`,
        ].join(" "),
      },
      202,
    );
  });

  app.get("/reconciliation/jobs/:jobId", async (c) => {
    requireLandlord(c);
    const jobId = uuidSchema.parse(c.req.param("jobId"));
    const job = await resolveRepository(c.env, dependencies).getJobStatus({
      jobId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (!job) {
      throw new HttpError(
        404,
        "calculation_job_not_found",
        "Calculation job not found",
      );
    }

    return c.json(job);
  });

  app.get("/reconciliation/snapshots", async (c) => {
    requireLandlord(c);
    const query = snapshotListQuerySchema.parse({
      property_id: c.req.query("property_id"),
      lease_id: c.req.query("lease_id"),
      period_start: c.req.query("period_start"),
      period_end: c.req.query("period_end"),
      is_finalized: c.req.query("is_finalized"),
      sort_by: c.req.query("sort_by"),
      sort_order: c.req.query("sort_order"),
      page: c.req.query("page"),
      size: c.req.query("size"),
    });
    const filters: SnapshotListFilters = {
      organizationId: c.get("auth").actor.organizationId,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      page: query.page,
      size: query.size,
    };
    if (query.property_id !== undefined) {
      filters.propertyId = query.property_id;
    }
    if (query.lease_id !== undefined) {
      filters.leaseId = query.lease_id;
    }
    if (query.period_start !== undefined) {
      filters.periodStart = query.period_start;
    }
    if (query.period_end !== undefined) {
      filters.periodEnd = query.period_end;
    }
    if (query.is_finalized !== undefined) {
      filters.isFinalized = query.is_finalized;
    }
    const snapshots = await resolveRepository(
      c.env,
      dependencies,
    ).listSnapshots(filters);

    return c.json(snapshots);
  });

  app.get("/reconciliation/snapshots/:snapshotId", async (c) => {
    requireLandlord(c);
    const snapshotId = uuidSchema.parse(c.req.param("snapshotId"));
    const includeTraceParam = c.req.query("include_trace");
    const includeTrace =
      includeTraceParam === undefined
        ? true
        : booleanQuerySchema.parse(includeTraceParam);
    const snapshot = await resolveRepository(c.env, dependencies).getSnapshot({
      snapshotId,
      organizationId: c.get("auth").actor.organizationId,
      includeTrace,
    });

    if (!snapshot) {
      throw new HttpError(
        404,
        "reconciliation_snapshot_not_found",
        "Reconciliation snapshot not found",
      );
    }

    return c.json(snapshot);
  });

  app.post("/reconciliation/snapshots/:snapshotId/finalize", async (c) => {
    requireAdmin(c);
    const snapshotId = uuidSchema.parse(c.req.param("snapshotId"));
    const repository = resolveRepository(c.env, dependencies);
    const result = await repository.finalizeSnapshot({
      snapshotId,
      organizationId: c.get("auth").actor.organizationId,
      userId: c.get("auth").actor.userId,
      finalizedAt: nowIso(dependencies),
    });

    if (result.state === "not_found") {
      throw new HttpError(
        404,
        "reconciliation_snapshot_not_found",
        "Reconciliation snapshot not found",
      );
    }

    if (result.state === "already_finalized") {
      throw new HttpError(
        409,
        "snapshot_already_finalized",
        `Snapshot ${snapshotId} is already finalized and cannot be modified`,
      );
    }

    if (result.state === "missing_trace") {
      throw new HttpError(
        409,
        "missing_calculation_trace",
        `Snapshot ${snapshotId} cannot be finalized: calculation_trace is missing or empty`,
      );
    }

    if (result.state === "conflict") {
      throw new HttpError(
        409,
        "snapshot_finalize_conflict",
        "Snapshot could not be finalized. It may have been finalized by another request.",
      );
    }

    await captureReconciliationEvent(c.env, dependencies, {
      eventName: "reconciliation_finalized",
      organizationId: c.get("auth").actor.organizationId,
      properties: {
        snapshot_id: result.snapshot.id,
        finalized_by_role: c.get("auth").actor.role,
        finalize_mode: "single",
      },
    });

    await swallow(
      (async () => {
        const snapshotForEmail = await repository.getSnapshot({
          snapshotId,
          organizationId: c.get("auth").actor.organizationId,
          includeTrace: false,
        });
        if (snapshotForEmail) {
          const summary = await loadFinalizedSnapshotSummary(repository, {
            organizationId: c.get("auth").actor.organizationId,
            propertyId: snapshotForEmail.property_id,
            leaseId: snapshotForEmail.lease_id,
            periodStart: snapshotForEmail.period_start_date,
            periodEnd: snapshotForEmail.period_end_date,
          });
          const billingExposure = await swallow(
            loadFinalizationBillingExposure(c.env, dependencies, {
              organizationId: c.get("auth").actor.organizationId,
              propertyId: snapshotForEmail.property_id,
              periodStart: snapshotForEmail.period_start_date,
              periodEnd: snapshotForEmail.period_end_date,
            }),
          );
          await resolveResultsEmailSender(c.env, dependencies).send({
            toEmail: c.get("auth").user.email,
            firstName: firstName(c.get("auth").user.fullName),
            idempotencyKey: `reconciliation-finalized:snapshot:${snapshotId}`,
            propertyName: summary?.property_name ?? null,
            statementUrl: reconciliationUrl(c.env, {
              propertyId: snapshotForEmail.property_id,
              periodStart: snapshotForEmail.period_start_date,
            }),
            clean: true,
            ...(billingExposure ? { billingExposure } : {}),
            metadata: {
              source: "capveri-reconciliation-finalize",
              mode: "single",
              snapshotId,
              organizationId: c.get("auth").actor.organizationId,
              userId: c.get("auth").actor.userId,
            },
          });
        }
      })(),
    );

    return c.json({
      ...result.snapshot,
      is_finalized: true,
      message: "Snapshot finalized successfully",
    });
  });

  app.post("/reconciliation/snapshots/finalize-batch", async (c) => {
    requireAdmin(c);
    const body = batchFinalizeSchema.parse(await c.req.json());
    const repository = resolveRepository(c.env, dependencies);
    const result = await repository.finalizeBatch({
      propertyId: body.property_id,
      organizationId: c.get("auth").actor.organizationId,
      userId: c.get("auth").actor.userId,
      periodStart: body.period_start,
      periodEnd: body.period_end,
      finalizedAt: nowIso(dependencies),
    });

    if (result.state === "not_found") {
      throw new HttpError(
        404,
        "draft_snapshots_not_found",
        [
          `No draft snapshots found for property ${body.property_id}`,
          `and period ${body.period_start} to ${body.period_end}`,
        ].join(" "),
      );
    }

    await captureReconciliationEvent(c.env, dependencies, {
      eventName: "reconciliation_finalized",
      organizationId: c.get("auth").actor.organizationId,
      properties: {
        property_id: body.property_id,
        period_start: body.period_start,
        period_end: body.period_end,
        finalize_mode: "batch",
        total_attempted: result.total_attempted,
        total_succeeded: result.total_succeeded,
        total_failed: result.total_failed,
      },
    });

    if (result.total_succeeded > 0) {
      await swallow(
        (async () => {
          const summaries = await repository.listSnapshots({
            organizationId: c.get("auth").actor.organizationId,
            propertyId: body.property_id,
            periodStart: body.period_start,
            periodEnd: body.period_end,
            isFinalized: true,
            sortBy: "tenant_name",
            sortOrder: "asc",
            page: 1,
            size: 100,
          });
          await resolveResultsEmailSender(c.env, dependencies).send({
            toEmail: c.get("auth").user.email,
            firstName: firstName(c.get("auth").user.fullName),
            idempotencyKey: [
              "reconciliation-finalized",
              "batch",
              body.property_id,
              body.period_start,
              body.period_end,
            ].join(":"),
            propertyName: summaries.items[0]?.property_name ?? null,
            statementUrl: reconciliationUrl(c.env, {
              propertyId: body.property_id,
              periodStart: body.period_start,
            }),
            clean: true,
            ...spreadBillingExposure(
              await swallow(
                loadFinalizationBillingExposure(c.env, dependencies, {
                  organizationId: c.get("auth").actor.organizationId,
                  propertyId: body.property_id,
                  periodStart: body.period_start,
                  periodEnd: body.period_end,
                }),
              ),
            ),
            metadata: {
              source: "capveri-reconciliation-finalize",
              mode: "batch",
              propertyId: body.property_id,
              periodStart: body.period_start,
              periodEnd: body.period_end,
              organizationId: c.get("auth").actor.organizationId,
              userId: c.get("auth").actor.userId,
              totalSucceeded: String(result.total_succeeded),
            },
          });
        })(),
      );
    }

    return c.json({
      total_attempted: result.total_attempted,
      total_succeeded: result.total_succeeded,
      total_failed: result.total_failed,
      results: result.results,
      message: result.message,
    });
  });

  app.get("/reconciliation/leases/:leaseId/cap-bank-ledger", async (c) => {
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const organizationId = c.get("auth").actor.organizationId;
    const repository = resolveRepository(c.env, dependencies);

    const profile = await repository.getLeaseCapProfile({
      leaseId,
      organizationId,
    });

    if (!profile) {
      throw new HttpError(404, "lease_not_found", `Lease ${leaseId} not found`);
    }

    const snapshots = await repository.listFinalizedSnapshotsForLease({
      leaseId,
      organizationId,
    });

    const ledger = buildCapBankLedger(profile, snapshots);

    await repository.recordFeatureUse({
      organizationId,
      featureKey: "cap_bank_tracking",
    });

    return c.json(ledger);
  });

  app.patch("/reconciliation/cells/:cellId", async (c) => {
    requireEditor(c);
    const cellId = c.req.param("cellId");
    const { snapshotId, fieldName } = decodeCellId(cellId);
    const body = cellUpdateSchema.parse(await c.req.json());
    const result = await resolveRepository(c.env, dependencies).updateCell({
      cellId,
      snapshotId,
      organizationId: c.get("auth").actor.organizationId,
      fieldName,
      value: body.value,
      userId: c.get("auth").actor.userId,
      updatedAt: nowIso(dependencies),
    });

    if (result.state === "not_found") {
      throw new HttpError(
        404,
        "reconciliation_snapshot_not_found",
        "Reconciliation snapshot not found",
      );
    }

    if (result.state === "finalized") {
      throw new HttpError(
        403,
        "snapshot_finalized",
        "Cannot edit finalized reconciliation snapshot. Snapshot is immutable.",
      );
    }

    if (result.state === "conflict") {
      throw new HttpError(
        409,
        "snapshot_update_conflict",
        "Snapshot was concurrently modified or finalized. Please refresh and retry.",
      );
    }

    return c.json(result.cell);
  });

  return app;
}

function decodeCellId(cellId: string): {
  snapshotId: string;
  fieldName: EditableReconciliationField;
} {
  let decoded: string;
  try {
    const normalized = cellId.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    decoded = globalThis.atob(padded);
  } catch (error) {
    throw new HttpError(
      400,
      "invalid_cell_id",
      `Invalid cell_id encoding: ${errorMessage(error)}`,
    );
  }

  const [snapshotId, fieldName, extra] = decoded.split(":");
  if (!snapshotId || !fieldName || extra !== undefined) {
    throw new HttpError(
      400,
      "invalid_cell_id",
      "Invalid cell_id: cell_id must contain snapshot_id:field_name",
    );
  }

  uuidSchema.parse(snapshotId);

  if (!isEditableField(fieldName)) {
    throw new HttpError(
      400,
      "invalid_cell_field",
      `Field '${fieldName}' is not editable`,
    );
  }

  return { snapshotId, fieldName };
}

function isEditableField(value: string): value is EditableReconciliationField {
  return editableReconciliationFields.includes(
    value as EditableReconciliationField,
  );
}

function requireLandlord(c: RouteContext): void {
  if (c.get("auth").actor.party === "landlord") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireAdmin(c: RouteContext): void {
  requireLandlord(c);
  const role = c.get("auth").actor.role;
  if (role === "owner" || role === "admin") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireEditor(c: RouteContext): void {
  requireLandlord(c);
  const role = c.get("auth").actor.role;
  if (role === "owner" || role === "admin" || role === "member") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

async function requireEditorAndFullAccess(
  c: RouteContext,
  dependencies: ReconciliationRouteDependencies,
): Promise<void> {
  requireEditor(c);

  if (
    await resolveRepository(c.env, dependencies).hasFullAccess(
      c.get("auth").actor.organizationId,
    )
  ) {
    return;
  }

  throw new HttpError(
    402,
    "subscription_required",
    "subscription_required: Your free trial has ended. Choose a plan and add billing to keep running reconciliations.",
  );
}

function nowIso(dependencies: ReconciliationRouteDependencies): string {
  return (dependencies.clock ?? (() => new Date()))().toISOString();
}

function resolveRepository(
  env: AppEnv,
  dependencies: ReconciliationRouteDependencies,
): ReconciliationRepository {
  return (
    dependencies.repository ??
    new PostgresReconciliationRepository(createDirectPostgresExecutor(env))
  );
}

function resolveQueueProducer(
  env: AppEnv,
  dependencies: ReconciliationRouteDependencies,
): QueueProducer {
  return dependencies.queueProducer ?? createQueueProducer(env);
}

function resolveAnalytics(
  dependencies: ReconciliationRouteDependencies,
): ServerAnalytics {
  return dependencies.analytics ?? new PostHogServerAnalytics();
}

function resolveResultsEmailSender(
  env: AppEnv,
  dependencies: ReconciliationRouteDependencies,
): ReconciliationResultsEmailSender {
  return (
    dependencies.resultsEmailSender ?? new HttpSequencerResultsEmailSender(env)
  );
}

function spreadBillingExposure(
  billingExposure: ReconciliationResultsEmailInput["billingExposure"] | null,
): Pick<ReconciliationResultsEmailInput, "billingExposure"> | Record<string, never> {
  return billingExposure ? { billingExposure } : {};
}

function resolveActualBilledRepository(
  env: AppEnv,
  dependencies: ReconciliationRouteDependencies,
): Pick<ActualBilledRepository, "loadBillingExposureDataset"> {
  return (
    dependencies.actualBilledRepository ??
    new PostgresActualBilledRepository(createDirectPostgresExecutor(env))
  );
}

class HttpSequencerResultsEmailSender implements ReconciliationResultsEmailSender {
  constructor(private readonly env: AppEnv) {}

  async send(input: ReconciliationResultsEmailInput): Promise<boolean> {
    const baseUrl = this.env.SEQUENCER_BASE_URL?.trim().replace(/\/+$/u, "");
    const clientId = this.env.SEQUENCER_CF_ACCESS_CLIENT_ID?.trim();
    const clientSecret = this.env.SEQUENCER_CF_ACCESS_CLIENT_SECRET?.trim();
    if (!baseUrl || !clientId || !clientSecret) {
      return false;
    }

    const response = await fetch(`${baseUrl}/api/v1/transactional`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "CF-Access-Client-Id": clientId,
        "CF-Access-Client-Secret": clientSecret,
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        email: input.toEmail,
        product: "capveri",
        template_slug: "transactional/capveri-statement-results",
        subject: "Your CAM statement holds up",
        idempotency_key: input.idempotencyKey,
        first_name: input.firstName ?? undefined,
        properties: input.metadata,
        data: {
          clean: input.clean,
          propertyName: input.propertyName ?? undefined,
          statementUrl: input.statementUrl,
          ...(input.billingExposure
            ? { billingExposure: input.billingExposure }
            : {}),
        },
      }),
    });
    if (!response.ok) {
      throw new Error("Sequencer transactional email request failed");
    }

    return true;
  }
}

async function loadFinalizedSnapshotSummary(
  repository: ReconciliationRepository,
  input: {
    organizationId: string;
    propertyId: string;
    leaseId: string;
    periodStart: string;
    periodEnd: string;
  },
) {
  const result = await repository.listSnapshots({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    leaseId: input.leaseId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    isFinalized: true,
    sortBy: "tenant_name",
    sortOrder: "asc",
    page: 1,
    size: 1,
  });

  return result.items[0] ?? null;
}

async function loadFinalizationBillingExposure(
  env: AppEnv,
  dependencies: ReconciliationRouteDependencies,
  input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
  },
): Promise<ReconciliationResultsEmailInput["billingExposure"] | null> {
  const dataset = await resolveActualBilledRepository(
    env,
    dependencies,
  ).loadBillingExposureDataset({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  if (!dataset.propertyExists) {
    return null;
  }

  const exposure = calculateBillingExposure({
    snapshots: dataset.snapshots,
    billedRows: dataset.billedRows,
  });
  if (!exposure) {
    return null;
  }

  return {
    totalUnderbillExposure: exposure.total_underbill_exposure,
    totalOverbillExposure: exposure.total_overbill_exposure,
    totalBillingExposure: exposure.total_billing_exposure,
  };
}

function reconciliationUrl(
  env: AppEnv,
  input: { propertyId: string; periodStart: string },
): string {
  const baseUrl = (env.APP_BASE_URL ?? "https://app.capveri.com").replace(
    /\/+$/u,
    "",
  );
  const year = input.periodStart.slice(0, 4);

  return `${baseUrl}/properties/${input.propertyId}/reconciliations?year=${year}`;
}

function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/u)[0] ?? null;
}

async function captureReconciliationEvent(
  env: AppEnv,
  dependencies: ReconciliationRouteDependencies,
  input: {
    eventName: string;
    organizationId: string;
    properties: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await resolveAnalytics(dependencies).capture(env, input);
  } catch {
    return;
  }
}

async function swallow<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function shouldRunInlineReconciliationQueue(env: AppEnv): boolean {
  return (
    env.LOCAL_E2E_INLINE_RECONCILIATION_QUEUE === "1" &&
    String(env.ENVIRONMENT ?? "") !== "production"
  );
}

function createInlineQueueMessage<Message>(
  body: Message,
): QueueConsumerMessage {
  return {
    body,
    attempts: 1,
    ack() {},
    retry() {},
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
