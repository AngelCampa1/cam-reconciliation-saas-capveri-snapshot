import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  PostHogServerAnalytics,
  type ServerAnalytics,
} from "../adapters/analytics/posthog";
import { PostgresIngestionRepository } from "../adapters/db/ingestion";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { decodeCsv } from "./decode-csv";
import type {
  BatchDetailRecord,
  ColumnMappingRecord,
  GlEntryInsert,
  IngestionRepository,
  PreviewEntryRecord,
  SourceSystem,
} from "../domain/ingestion/repository";
import {
  parseGlCsv,
  type CsvParseResult,
} from "../domain/ingestion/csv-parser";
import {
  findFirstAmountOutOfRange,
  NUMERIC_14_2_MAX_LABEL,
} from "../domain/core-data/numeric-14-2";
import { findFirstTextFieldTooLong } from "../domain/ingestion/gl-text-limits";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";
import { readMultipartForm } from "./multipart";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type IngestionRouteDependencies = {
  repository?: IngestionRepository;
  analytics?: ServerAnalytics;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
const maxUploadBytes = 50 * 1024 * 1024;
const maxMultipartBodyBytes = maxUploadBytes + 1024 * 1024;
const sourceOverrideSchema = z.enum(["yardi", "mri", "generic"]).optional();
const sourceSystemSchema = z.enum(["yardi", "mri", "generic"]);
const createColumnMappingSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
  source_system: sourceSystemSchema,
  mapping_config: z.record(z.string()),
});

export function createIngestionRoutes(
  dependencies: IngestionRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/ingestion/*", authMiddleware(dependencies.auth));

  app.post("/ingestion/upload", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    rejectOversizeMultipartBody(c);
    const form = await readMultipartForm(c);
    const file = requiredFile(form, "file");
    const propertyId = uuidSchema.parse(
      requiredFormString(form, "property_id"),
    );
    const sourceOverride = sourceOverrideSchema.parse(
      optionalFormString(form, "source_override"),
    );
    const prepared = await prepareCsvUpload(file);
    const parsed = parseGlCsv({
      text: prepared.text,
      filename: file.name,
      propertyId,
      ...(sourceOverride ? { sourceOverride } : {}),
    });

    if (parsed.sourceSystem !== "generic") {
      ensureHasValidEntries(parsed);
    }
    ensureAmountsWithinRange(parsed);
    ensureTextFieldsWithinLimits(parsed);

    const result = await resolveRepository(c.env, dependencies).uploadImport({
      organizationId: c.get("auth").actor.organizationId,
      propertyId,
      fileName: file.name,
      fileHash: prepared.fileHash,
      sourceSystem: parsed.sourceSystem,
      entries: parsed.entries.map(toGlEntryInsert),
      errorCount: parsed.errorCount,
    });

    if (result.state === "property_not_found") {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    if (result.state === "duplicate") {
      return duplicateImportResponse(c, result.batchId, result.importedAt);
    }

    if (result.sourceSystem !== "generic") {
      await captureIngestionEvent(c.env, dependencies, {
        eventName: "gl_import_completed",
        organizationId: c.get("auth").actor.organizationId,
        properties: {
          batch_id: result.batchId,
          property_id: propertyId,
          source_system: result.sourceSystem,
          import_mode: "direct_upload",
          row_count: result.rowCount,
          error_count: result.errorCount,
        },
      });
    }

    return c.json(uploadResponse(result.batchId, parsed));
  });

  app.post("/ingestion/batches/:batchId/apply-mapping", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    rejectOversizeMultipartBody(c);
    const batchId = uuidSchema.parse(c.req.param("batchId"));
    const form = await readMultipartForm(c);
    const file = requiredFile(form, "file");
    const mappingConfig = parseMappingConfig(
      requiredFormString(form, "mapping_config"),
    );
    const prepared = await prepareCsvUpload(file);
    const repository = resolveRepository(c.env, dependencies);
    const preflight = await repository.preflightApplyMapping({
      batchId,
      organizationId: c.get("auth").actor.organizationId,
      fileHash: prepared.fileHash,
    });

    if (preflight.state !== "ready") {
      handleApplyMappingFailure(preflight);
    }

    const parsed = parseGlCsv({
      text: prepared.text,
      filename: file.name,
      propertyId: "",
      sourceOverride: "generic",
      columnMapping: mappingConfig,
    });

    ensureHasValidEntries(parsed);
    ensureAmountsWithinRange(parsed);
    ensureTextFieldsWithinLimits(parsed);

    const result = await repository.applyMapping({
      batchId,
      organizationId: c.get("auth").actor.organizationId,
      fileHash: prepared.fileHash,
      entries: parsed.entries.map(toGlEntryInsert),
      errorCount: parsed.errorCount,
    });

    if (result.state !== "completed") {
      handleApplyMappingFailure(result);
    }

    await captureIngestionEvent(c.env, dependencies, {
      eventName: "gl_import_completed",
      organizationId: c.get("auth").actor.organizationId,
      properties: {
        batch_id: result.batchId,
        property_id: result.propertyId,
        source_system: "generic",
        import_mode: "mapping_applied",
        row_count: result.rowCount,
        error_count: result.errorCount,
      },
    });

    return c.json(uploadResponse(result.batchId, parsed, result.rowCount));
  });

  app.get("/ingestion/mappings", async (c) => {
    requireLandlord(c);
    const sourceSystem = optionalSourceSystem(c.req.query("source_system"));
    const skip = nonNegativeIntQuery(c.req.query("skip"), 0);
    const limit = boundedLimitQuery(c.req.query("limit"), 50);
    const result = await resolveRepository(
      c.env,
      dependencies,
    ).listColumnMappings({
      organizationId: c.get("auth").actor.organizationId,
      ...(sourceSystem ? { sourceSystem } : {}),
      skip,
      limit,
    });

    return c.json(result);
  });

  app.post("/ingestion/mappings", async (c) => {
    await requireAdminAndFullAccess(c, dependencies);
    const body = createColumnMappingSchema.parse(await c.req.json());
    validateSavedMappingConfig(body.mapping_config);
    const result = await resolveRepository(
      c.env,
      dependencies,
    ).createColumnMapping({
      organizationId: c.get("auth").actor.organizationId,
      userId: c.get("auth").actor.userId,
      name: body.name,
      description: body.description ?? null,
      sourceSystem: body.source_system,
      mappingConfig: body.mapping_config,
    });

    if (result.state === "duplicate") {
      throw new HttpError(
        409,
        "duplicate_column_mapping",
        `Mapping with name '${body.name}' and source system '${body.source_system}' already exists`,
      );
    }

    return c.json(serializeColumnMapping(result.mapping), 201);
  });

  app.get("/ingestion/batches", async (c) => {
    requireLandlord(c);
    const organizationId = c.get("auth").actor.organizationId;
    const batches = await resolveRepository(c.env, dependencies).listBatches(
      organizationId,
    );

    return c.json({ batches });
  });

  app.get("/ingestion/batches/:batchId", async (c) => {
    requireLandlord(c);
    const batchId = uuidSchema.parse(c.req.param("batchId"));
    const batch = await getOrgBatch(c, dependencies, batchId);
    const previewEntries = await resolveRepository(
      c.env,
      dependencies,
    ).listPreviewEntries({
      batchId,
      propertyId: batch.property_id,
      organizationId: c.get("auth").actor.organizationId,
    });

    return c.json({
      ...batch,
      preview_entries: previewEntries.map(serializePreviewEntry),
    });
  });

  app.post("/ingestion/batches/:batchId/retry", async (c) => {
    await requireAdminAndFullAccess(c, dependencies);
    const batchId = uuidSchema.parse(c.req.param("batchId"));
    const result = await resolveRepository(c.env, dependencies).retryBatch({
      batchId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (result.state === "not_found") {
      throw new HttpError(404, "batch_not_found", "Batch not found");
    }

    if (result.state === "invalid_status") {
      throw new HttpError(
        400,
        "invalid_batch_status",
        `Only failed batches can be retried. Current status: ${result.status}`,
      );
    }

    if (result.state === "finalized_reconciliation") {
      throw new HttpError(
        409,
        "batch_in_finalized_reconciliation",
        [
          "Cannot retry - GL entries may be used in finalized reconciliations",
          "for this property. Please verify no finalized reconciliations",
          "depend on this batch.",
        ].join(" "),
      );
    }

    return c.json({
      success: true,
      batch_id: batchId,
      status: "ready_for_upload",
      message: `Failed batch cleared. Upload the file again to retry. Deleted ${result.deletedGlEntryCount} GL entries.`,
    });
  });

  app.delete("/ingestion/batches/:batchId", async (c) => {
    await requireAdminAndFullAccess(c, dependencies);
    const batchId = uuidSchema.parse(c.req.param("batchId"));
    const repository = resolveRepository(c.env, dependencies);
    const result = await repository.deleteBatch({
      batchId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (result.state === "not_found") {
      throw new HttpError(404, "batch_not_found", "Batch not found");
    }

    if (result.state === "finalized_reconciliation") {
      throw new HttpError(
        409,
        "batch_in_finalized_reconciliation",
        [
          "Cannot delete - GL entries may be used in finalized reconciliations",
          "for this property. Please verify no finalized reconciliations",
          "depend on this batch.",
        ].join(" "),
      );
    }

    return c.body(null, 204);
  });

  app.get("/ingestion/gl-date-range/:propertyId", async (c) => {
    requireLandlord(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const dateRange = await resolveRepository(
      c.env,
      dependencies,
    ).getGlDateRange({
      propertyId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (!dateRange) {
      throw new HttpError(
        404,
        "gl_entries_not_found",
        "No GL entries found for this property",
      );
    }

    return c.json({
      ...dateRange,
      year: Number.parseInt(dateRange.max_date.slice(0, 4), 10),
    });
  });

  return app;
}

async function getOrgBatch(
  c: RouteContext,
  dependencies: IngestionRouteDependencies,
  batchId: string,
): Promise<BatchDetailRecord> {
  const batch = await resolveRepository(c.env, dependencies).getBatch({
    batchId,
    organizationId: c.get("auth").actor.organizationId,
  });

  if (!batch) {
    throw new HttpError(404, "batch_not_found", "Batch not found");
  }

  return batch;
}

function serializePreviewEntry(entry: PreviewEntryRecord) {
  const amount = String(entry.amount);
  const numericAmount = Number(amount);

  return {
    id: entry.id,
    transaction_date: entry.transaction_date,
    account_code: entry.account_code,
    account_description: entry.account_description,
    description: entry.description,
    debit: numericAmount > 0 ? amount : null,
    credit: numericAmount < 0 ? amount.replace(/^-/, "") : null,
    balance: amount,
  };
}

function serializeColumnMapping(mapping: ColumnMappingRecord) {
  return {
    id: mapping.id,
    name: mapping.name,
    description: mapping.description,
    source_system: mapping.source_system,
    mapping_config: mapping.mapping_config,
    created_by: mapping.created_by,
    created_at: mapping.created_at,
    updated_at: mapping.updated_at,
  };
}

function optionalSourceSystem(
  value: string | undefined,
): SourceSystem | undefined {
  return value === undefined ? undefined : sourceSystemSchema.parse(value);
}

function nonNegativeIntQuery(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(
      422,
      "invalid_query_parameter",
      "skip must be a non-negative integer",
    );
  }

  return parsed;
}

function boundedLimitQuery(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new HttpError(
      422,
      "invalid_query_parameter",
      "limit must be an integer between 1 and 100",
    );
  }

  return parsed;
}

function validateSavedMappingConfig(mapping: Record<string, string>): void {
  const requiredKeys = ["account_code", "amount", "transaction_date"];
  const missing = requiredKeys.filter((key) => !mapping[key]);

  if (missing.length > 0) {
    throw new HttpError(
      422,
      "missing_required_mapping",
      `Missing required mapping keys: ${missing.join(", ")}`,
    );
  }
}

function uploadResponse(
  batchId: string,
  parsed: CsvParseResult,
  rowCount = parsed.sourceSystem === "generic" && parsed.entries.length === 0
    ? parsed.rowCount
    : parsed.entries.length,
) {
  return {
    batch_id: batchId,
    source_system: parsed.sourceSystem,
    source_confidence: parsed.sourceConfidence,
    row_count: rowCount,
    error_count: parsed.errorCount,
    warnings: parsed.warnings,
    detected_columns: parsed.detectedColumns,
  };
}

function rejectOversizeMultipartBody(c: RouteContext): void {
  const contentLength = c.req.header("content-length");
  if (!contentLength) {
    throw new HttpError(
      411,
      "content_length_required",
      "Content-Length is required for ingestion uploads",
    );
  }

  if (!/^[1-9]\d*$/.test(contentLength)) {
    throw new HttpError(
      400,
      "invalid_content_length",
      "Content-Length must be a positive integer for ingestion uploads",
    );
  }

  const parsed = Number(contentLength);
  if (parsed <= maxMultipartBodyBytes) {
    return;
  }

  throw new HttpError(
    413,
    "file_too_large",
    "Multipart upload body exceeds the 51MB Worker ingestion limit",
  );
}

function handleApplyMappingFailure(
  result: Exclude<
    Awaited<ReturnType<IngestionRepository["applyMapping"]>>,
    { state: "completed" }
  >,
): never {
  if (result.state === "not_found") {
    throw new HttpError(404, "batch_not_found", "Batch not found");
  }

  if (result.state === "invalid_source") {
    throw new HttpError(
      400,
      "invalid_source_system",
      "Only generic import batches can have mappings applied",
    );
  }

  if (result.state === "invalid_status") {
    throw new HttpError(
      400,
      "invalid_batch_status",
      `Only pending batches can have mappings applied. Current status: ${result.status}`,
    );
  }

  throw new HttpError(
    400,
    "file_mismatch",
    "File does not match the original import batch",
  );
}

function duplicateImportResponse(
  c: RouteContext,
  batchId: string,
  importedAt: string | null,
): Response {
  const message = "File has already been imported";

  return c.json(
    {
      detail: {
        message,
        existing_batch_id: batchId,
        imported_at: importedAt,
      },
      error: { code: "duplicate_import", message },
    },
    409,
  );
}

function requiredFile(form: FormData, field: string): File {
  const value = form.get(field);
  if (!(value instanceof File)) {
    throw new HttpError(422, "missing_upload_file", `${field} is required`);
  }

  return value;
}

function requiredFormString(form: FormData, field: string): string {
  const value = optionalFormString(form, field);
  if (value === undefined || value.trim().length === 0) {
    throw new HttpError(422, "missing_form_field", `${field} is required`);
  }

  return value;
}

function optionalFormString(form: FormData, field: string): string | undefined {
  const value = form.get(field);
  if (value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(422, "invalid_form_field", `${field} must be a string`);
  }

  return value;
}

async function prepareCsvUpload(file: File): Promise<{
  text: string;
  fileHash: string;
}> {
  if (file.size === 0) {
    throw new HttpError(400, "empty_file", "Uploaded file is empty");
  }

  if (file.size > maxUploadBytes) {
    throw new HttpError(
      413,
      "file_too_large",
      `File size exceeds 50MB limit. Actual size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
    );
  }

  if (!isCsvFile(file)) {
    throw new HttpError(
      415,
      "unsupported_file_type",
      "Cloudflare ingestion currently supports CSV files. Excel parsing is a separate migration slice.",
    );
  }

  const bytes = await file.arrayBuffer();
  const text = decodeCsv(bytes);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return {
    text,
    fileHash: [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  };
}

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return (
    name.endsWith(".csv") || type === "text/csv" || type === "application/csv"
  );
}

function parseMappingConfig(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(
      422,
      "invalid_mapping_config",
      "mapping_config must be valid JSON",
    );
  }

  if (!isStringRecord(parsed) || Object.keys(parsed).length === 0) {
    throw new HttpError(
      422,
      "invalid_mapping_config",
      "mapping_config must be a non-empty object with string keys and values",
    );
  }

  if (!parsed.account_code || !parsed.amount) {
    throw new HttpError(
      422,
      "missing_required_mapping",
      "Mapping must include account_code and amount",
    );
  }

  return parsed;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, entry]) => key.length > 0 && typeof entry === "string",
    )
  );
}

function ensureHasValidEntries(parsed: CsvParseResult): void {
  if (parsed.entries.length > 0) {
    return;
  }

  throw new HttpError(422, "no_valid_gl_entries", "No valid GL entries found");
}

function ensureAmountsWithinRange(parsed: CsvParseResult): void {
  const badIndex = findFirstAmountOutOfRange(
    parsed.entries.map((entry) => entry.amount),
  );
  if (badIndex === -1) {
    return;
  }

  throw new HttpError(
    422,
    "gl_amount_out_of_range",
    `One or more GL amounts exceed the maximum supported value of ${NUMERIC_14_2_MAX_LABEL}.`,
  );
}

// A CSV cell wider than its target gl_entries column raises Postgres 22001 at
// insert time (opaque 500 on the whole import). Reject it at parse time with a
// specific message naming the row and field so the caller can fix the source.
function ensureTextFieldsWithinLimits(parsed: CsvParseResult): void {
  const violation = findFirstTextFieldTooLong(parsed.entries);
  if (violation === null) {
    return;
  }

  throw new HttpError(
    422,
    "gl_field_too_long",
    `GL entry ${violation.index + 1} has a "${violation.field}" value longer than the maximum of ${violation.limit} characters.`,
  );
}

function toGlEntryInsert(entry: GlEntryInsert): GlEntryInsert {
  return entry;
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

function requireAdminOrOwner(
  role: AuthVariables["auth"]["actor"]["role"],
): void {
  if (role === "owner" || role === "admin") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireEditor(role: AuthVariables["auth"]["actor"]["role"]): void {
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
  dependencies: IngestionRouteDependencies,
): Promise<void> {
  requireLandlord(c);
  requireEditor(c.get("auth").actor.role);

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
    "subscription_required: An active subscription or trial is required.",
  );
}

async function requireAdminAndFullAccess(
  c: RouteContext,
  dependencies: IngestionRouteDependencies,
): Promise<void> {
  requireLandlord(c);
  requireAdminOrOwner(c.get("auth").actor.role);

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
    "subscription_required: An active subscription or trial is required.",
  );
}

function resolveRepository(
  env: AppEnv,
  dependencies: IngestionRouteDependencies,
): IngestionRepository {
  return (
    dependencies.repository ??
    new PostgresIngestionRepository(createDirectPostgresExecutor(env))
  );
}

function resolveAnalytics(
  dependencies: IngestionRouteDependencies,
): ServerAnalytics {
  return dependencies.analytics ?? new PostHogServerAnalytics();
}

async function captureIngestionEvent(
  env: AppEnv,
  dependencies: IngestionRouteDependencies,
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
