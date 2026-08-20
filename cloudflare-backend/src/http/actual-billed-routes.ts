import Decimal from "decimal.js";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresActualBilledRepository } from "../adapters/db/actual-billed";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { decodeCsv } from "./decode-csv";
import {
  parseBillingCsv,
  parseBillingXlsx,
  type BillingParseResult,
} from "../domain/actual-billed/billing-parser";
import type {
  ActualBilledRepository,
  LeakageSummaryDataset,
  ReconciliationRecoveryRecord,
} from "../domain/actual-billed/repository";
import {
  findFirstAmountOutOfRange,
  NUMERIC_14_2_MAX_LABEL,
} from "../domain/core-data/numeric-14-2";
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

export type ActualBilledRouteDependencies = {
  repository?: ActualBilledRepository;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
// Reject impossible calendar dates (2025-02-30 etc.) at the boundary. A
// shape-only regex would pass them, and the postgres driver rolls them forward
// (2025-02-30 -> 2025-03-02), shifting the billing period the money math runs on.
const dateSchema = z.string().date();
const manualBillingSchema = z.object({
  property_id: uuidSchema,
  period_start: dateSchema,
  period_end: dateSchema,
  total_billed: z
    .union([z.string(), z.number()])
    .transform((value) => String(value)),
  pool_id: uuidSchema.nullable().optional(),
});
const matchBillingRowsSchema = z.object({
  property_id: uuidSchema,
  period_start: dateSchema,
  period_end: dateSchema,
  matches: z
    .array(
      z.object({
        actual_billed_id: uuidSchema,
        lease_id: uuidSchema,
      }),
    )
    .min(1),
});
const maxUploadBytes = 25 * 1024 * 1024;
const maxMultipartBodyBytes = maxUploadBytes + 1024 * 1024;

export function createActualBilledRoutes(
  dependencies: ActualBilledRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/actual-billed/*", authMiddleware(dependencies.auth));
  app.use("/leakage/*", authMiddleware(dependencies.auth));

  app.post("/actual-billed/upload", async (c) => {
    requireEditor(c);
    rejectOversizeMultipartBody(c);
    const form = await readMultipartForm(c);
    const propertyId = uuidSchema.parse(
      requiredFormString(form, "property_id"),
    );
    const periodStart = dateSchema.parse(
      requiredFormString(form, "period_start"),
    );
    const periodEnd = dateSchema.parse(requiredFormString(form, "period_end"));
    validatePeriod(periodStart, periodEnd);
    const file = requiredFile(form, "file");
    const parsed = await parseBillingUpload(file);

    if (!parsed.success) {
      return parseFailureResponse(c, parsed);
    }
    ensureBilledAmountsWithinRange(parsed.data.map((row) => row.billedAmount));

    const result = await resolveRepository(
      c.env,
      dependencies,
    ).createUploadRows({
      organizationId: c.get("auth").actor.organizationId,
      propertyId,
      periodStart,
      periodEnd,
      rows: parsed.data.map((row) => ({
        tenantName: row.tenantName,
        billedAmount: row.billedAmount,
        sourceType: parsed.sourceType,
        poolId: null,
        suite: row.suite,
      })),
    });

    if (result.state === "property_not_found") {
      throw new HttpError(404, "property_not_found", "Property not found");
    }
    if (result.state === "period_finalized") {
      throwActualBilledPeriodFinalized();
    }
    if (result.insertedCount !== parsed.data.length) {
      throw new HttpError(
        500,
        "billing_insert_incomplete",
        "Failed to create all billing records",
      );
    }
    const unmatchedRows = result.rows.filter((row) => row.leaseId === null);
    const matchWarnings = result.rows.flatMap((row, index) => {
      if (row.leaseId !== null) {
        return [];
      }
      const rowLabel =
        row.suite && row.suite.trim().length > 0
          ? `${row.tenantName} / suite ${row.suite}`
          : row.tenantName;

      return [
        `Row ${index + 1} needs review. ${rowLabel} did not match a lease.`,
      ];
    });

    return c.json({
      success: true,
      source_type: parsed.sourceType,
      items: result.rows.map((row) => ({
        id: row.id,
        tenant_name: row.tenantName,
        billed_amount: row.billedAmount,
        suite: row.suite,
        lease_id: row.leaseId,
        match_status: row.leaseId ? "matched" : "needs_review",
      })),
      total_billed: parsed.totalBilled,
      row_count: parsed.rowCount,
      matched_row_count: result.rows.length - unmatchedRows.length,
      unmatched_row_count: unmatchedRows.length,
      warnings: [...parsed.warnings, ...matchWarnings],
    });
  });

  app.put("/actual-billed/matches", async (c) => {
    requireEditor(c);
    const body = matchBillingRowsSchema.parse(await parseJsonBody(c));
    validatePeriod(body.period_start, body.period_end);
    const billedRowIds = new Set(
      body.matches.map((match) => match.actual_billed_id),
    );
    if (billedRowIds.size !== body.matches.length) {
      throw new HttpError(
        400,
        "duplicate_billing_match",
        "Choose one tenant for each billed row",
      );
    }
    const result = await resolveRepository(
      c.env,
      dependencies,
    ).updateBilledRowMatches({
      organizationId: c.get("auth").actor.organizationId,
      propertyId: body.property_id,
      periodStart: body.period_start,
      periodEnd: body.period_end,
      matches: body.matches.map((match) => ({
        billedRowId: match.actual_billed_id,
        leaseId: match.lease_id,
      })),
    });

    if (result.state === "property_not_found") {
      throw new HttpError(404, "property_not_found", "Property not found");
    }
    if (result.state === "period_finalized") {
      throwActualBilledPeriodFinalized();
    }
    if (result.state === "invalid_match") {
      throw new HttpError(
        400,
        "invalid_billing_match",
        "One or more billed rows could not be matched to that lease",
      );
    }

    return c.json({ success: true, updated_count: result.updatedCount });
  });

  app.post("/actual-billed/manual", async (c) => {
    requireEditor(c);
    const body = manualBillingSchema.parse(await parseJsonBody(c));
    validatePeriod(body.period_start, body.period_end);
    validateNonNegativeMoney(body.total_billed);
    ensureBilledAmountsWithinRange([body.total_billed]);
    const result = await resolveRepository(
      c.env,
      dependencies,
    ).createManualEntry({
      organizationId: c.get("auth").actor.organizationId,
      propertyId: body.property_id,
      periodStart: body.period_start,
      periodEnd: body.period_end,
      totalBilled: normalizedMoney(body.total_billed),
      poolId: body.pool_id ?? null,
    });

    if (result.state === "property_not_found") {
      throw new HttpError(404, "property_not_found", "Property not found");
    }
    if (result.state === "period_finalized") {
      throwActualBilledPeriodFinalized();
    }
    if (result.state === "pool_not_found") {
      throw new HttpError(404, "pool_not_found", "Expense pool not found");
    }

    return c.json({
      id: result.record.id,
      property_id: body.property_id,
      period_start: body.period_start,
      period_end: body.period_end,
      total_billed: normalizedMoney(body.total_billed),
      pool_id: body.pool_id ?? null,
    });
  });

  app.get("/actual-billed/:propertyId", async (c) => {
    requireLandlord(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const periodStart = dateSchema.parse(requiredQuery(c, "period_start"));
    const periodEnd = dateSchema.parse(requiredQuery(c, "period_end"));
    validatePeriod(periodStart, periodEnd);
    const items = await resolveRepository(
      c.env,
      dependencies,
    ).listBilledAmounts({
      organizationId: c.get("auth").actor.organizationId,
      propertyId,
      periodStart,
      periodEnd,
    });

    if (!items) {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    return c.json({
      property_id: propertyId,
      period_start: periodStart,
      period_end: periodEnd,
      total_billed: sumMoney(items.map((item) => item.billed_amount)).toFixed(),
      items,
    });
  });

  app.delete("/actual-billed/:propertyId", async (c) => {
    requireEditor(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const periodStart = optionalQuery(c, "period_start");
    const periodEnd = optionalQuery(c, "period_end");
    if (periodStart) {
      dateSchema.parse(periodStart);
    }
    if (periodEnd) {
      dateSchema.parse(periodEnd);
    }
    if (periodStart && periodEnd) {
      validatePeriod(periodStart, periodEnd);
    }
    const result = await resolveRepository(
      c.env,
      dependencies,
    ).deleteBilledAmounts({
      organizationId: c.get("auth").actor.organizationId,
      propertyId,
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
    });

    if (result.state === "property_not_found") {
      throw new HttpError(404, "property_not_found", "Property not found");
    }
    if (result.state === "period_finalized") {
      throwActualBilledPeriodFinalized();
    }

    return c.json({ message: "Billing data deleted successfully" });
  });

  app.get("/leakage/summary", async (c) => {
    requireLandlord(c);
    const dataset = await resolveRepository(
      c.env,
      dependencies,
    ).loadLeakageSummaryDataset(c.get("auth").actor.organizationId);

    return c.json(calculateLeakageSummary(dataset));
  });

  app.get("/leakage/:propertyId", async (c) => {
    requireLandlord(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const periodStart = dateSchema.parse(requiredQuery(c, "period_start"));
    const periodEnd = dateSchema.parse(requiredQuery(c, "period_end"));
    const includeDrafts = parseBooleanQuery(c.req.query("include_drafts"));
    validatePeriod(periodStart, periodEnd);
    const dataset = await resolveRepository(
      c.env,
      dependencies,
    ).loadLeakageDataset({
      organizationId: c.get("auth").actor.organizationId,
      propertyId,
      periodStart,
      periodEnd,
      includeDrafts,
    });

    return c.json(
      calculateLeakage({
        propertyId,
        periodStart,
        periodEnd,
        propertyExists: dataset.propertyExists,
        snapshots: dataset.snapshots,
        hasImportBatches: dataset.hasImportBatches,
        billedRows: dataset.billedRows,
        leases: dataset.leases,
      }),
    );
  });

  return app;
}

function calculateLeakage(input: {
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  propertyExists: boolean;
  snapshots: ReconciliationRecoveryRecord[];
  hasImportBatches: boolean;
  billedRows: Array<{ tenant_name: string | null; billed_amount: string }>;
  leases: Array<{ id: string; tenant_name: string | null }>;
}) {
  if (!input.propertyExists) {
    return emptyLeakage(input);
  }

  const leaseTenantMap = new Map(
    input.leases.map((lease) => [lease.id, lease.tenant_name ?? "Unknown"]),
  );
  const calculatedByTenant = new Map<string, Decimal>();
  let capveriCalculated = new Decimal(0);
  for (const snapshot of input.snapshots) {
    const amount = moneyOrZero(snapshot.total_recovery);
    capveriCalculated = capveriCalculated.plus(amount);
    const tenantName = snapshot.lease_id
      ? (leaseTenantMap.get(snapshot.lease_id) ?? "Unknown")
      : "Unknown";
    calculatedByTenant.set(
      tenantName,
      (calculatedByTenant.get(tenantName) ?? new Decimal(0)).plus(amount),
    );
  }

  const billedByTenant = new Map<string, Decimal>();
  let actualBilled = new Decimal(0);
  for (const row of input.billedRows) {
    const amount = moneyOrZero(row.billed_amount);
    actualBilled = actualBilled.plus(amount);
    const tenantName = row.tenant_name || "Unknown";
    billedByTenant.set(
      tenantName,
      (billedByTenant.get(tenantName) ?? new Decimal(0)).plus(amount),
    );
  }

  const leakage = capveriCalculated.minus(actualBilled);
  const breakdown = [
    ...new Set([...calculatedByTenant.keys(), ...billedByTenant.keys()]),
  ]
    .sort()
    .map((tenantName) => {
      const calculated = calculatedByTenant.get(tenantName) ?? new Decimal(0);
      const billed = billedByTenant.get(tenantName) ?? new Decimal(0);
      const difference = calculated.minus(billed);

      return {
        tenant_name: tenantName,
        calculated_amount: calculated.toNumber(),
        billed_amount: billed.toNumber(),
        difference: difference.toNumber(),
        difference_pct: calculated.gt(0)
          ? difference.div(calculated).times(100).toNumber()
          : 0,
      };
    })
    .filter((row) => row.difference !== 0)
    .sort(
      (left, right) => Math.abs(right.difference) - Math.abs(left.difference),
    );

  return {
    property_id: input.propertyId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    capveri_calculated: capveriCalculated.toFixed(),
    actual_billed: actualBilled.toFixed(),
    leakage: leakage.toFixed(),
    leakage_pct: capveriCalculated.gt(0)
      ? leakage.div(capveriCalculated).times(100).toNumber()
      : 0,
    has_reconciliation_data: input.snapshots.length > 0,
    has_gl_data: input.hasImportBatches || input.snapshots.length > 0,
    has_billing_data: input.billedRows.length > 0,
    breakdown,
  };
}

function emptyLeakage(input: {
  propertyId: string;
  periodStart: string;
  periodEnd: string;
}) {
  return {
    property_id: input.propertyId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    capveri_calculated: "0",
    actual_billed: "0",
    leakage: "0",
    leakage_pct: 0,
    has_reconciliation_data: false,
    has_gl_data: false,
    has_billing_data: false,
    breakdown: [],
  };
}

function calculateLeakageSummary(dataset: LeakageSummaryDataset) {
  const finalizedByProperty = aggregateByProperty(
    dataset.finalizedSnapshots,
    "total_recovery",
  );
  const draftByProperty = aggregateByProperty(
    dataset.draftSnapshots,
    "total_recovery",
  );
  const billedByProperty = aggregateByProperty(
    dataset.billedRows,
    "billed_amount",
  );
  let totalUnderbillExposure = new Decimal(0);
  let totalOverbillExposure = new Decimal(0);
  let totalBillingExposure = new Decimal(0);
  let propertiesWithUnderbill = 0;
  let propertiesWithOverbill = 0;
  let propertiesWithBillingExposure = 0;

  for (const propertyId of dataset.propertyIds) {
    const calculated = finalizedByProperty.get(propertyId) ?? new Decimal(0);
    const billed = billedByProperty.get(propertyId) ?? new Decimal(0);
    const leakage = calculated.minus(billed);
    if (leakage.gt(0)) {
      totalUnderbillExposure = totalUnderbillExposure.plus(leakage);
      totalBillingExposure = totalBillingExposure.plus(leakage);
      propertiesWithUnderbill += 1;
      propertiesWithBillingExposure += 1;
    } else if (leakage.lt(0)) {
      const overbill = leakage.abs();
      totalOverbillExposure = totalOverbillExposure.plus(overbill);
      totalBillingExposure = totalBillingExposure.plus(overbill);
      propertiesWithOverbill += 1;
      propertiesWithBillingExposure += 1;
    }
  }

  const draftRecovery = [...draftByProperty.values()].reduce(
    (total, amount) => total.plus(amount),
    new Decimal(0),
  );

  return {
    total_recovery_opportunity: totalUnderbillExposure.toFixed(),
    properties_with_leakage: propertiesWithUnderbill,
    total_underbill_exposure: totalUnderbillExposure.toFixed(),
    total_overbill_exposure: totalOverbillExposure.toFixed(),
    total_billing_exposure: totalBillingExposure.toFixed(),
    properties_with_underbill: propertiesWithUnderbill,
    properties_with_overbill: propertiesWithOverbill,
    properties_with_billing_exposure: propertiesWithBillingExposure,
    has_billing_data: dataset.billedRows.length > 0,
    draft_recovery: draftRecovery.toFixed(),
    draft_property_count: draftByProperty.size,
  };
}

function aggregateByProperty<Row extends { property_id: string }>(
  rows: Row[],
  amountField: keyof Row,
): Map<string, Decimal> {
  const totals = new Map<string, Decimal>();
  for (const row of rows) {
    const rawAmount = row[amountField];
    const amount = moneyOrZero(typeof rawAmount === "string" ? rawAmount : "0");
    totals.set(
      row.property_id,
      (totals.get(row.property_id) ?? new Decimal(0)).plus(amount),
    );
  }

  return totals;
}

async function parseBillingUpload(file: File): Promise<BillingParseResult> {
  if (file.size === 0) {
    throw new HttpError(400, "empty_file", "Uploaded file is empty");
  }
  if (file.size > maxUploadBytes) {
    throw new HttpError(
      413,
      "file_too_large",
      `File size exceeds 25MB limit. Actual size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
    );
  }
  if (isCsvFile(file)) {
    return parseBillingCsv({
      text: decodeCsv(await file.arrayBuffer()),
      filename: file.name || "unknown",
    });
  }
  if (isXlsxFile(file)) {
    return parseBillingXlsx({
      bytes: await file.arrayBuffer(),
      filename: file.name || "unknown",
    });
  }

  throw new HttpError(
    415,
    "unsupported_file_type",
    "Use a CSV or XLSX file for actual billed amounts.",
  );
}

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return (
    name.endsWith(".csv") || type === "text/csv" || type === "application/csv"
  );
}

function isXlsxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return (
    name.endsWith(".xlsx") ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function parseFailureResponse(
  c: RouteContext,
  parsed: BillingParseResult,
): Response {
  return c.json(
    {
      detail: {
        message: "Failed to parse billing file",
        errors: parsed.errors,
      },
      error: {
        code: "billing_parse_failed",
        message: "Failed to parse billing file",
      },
    },
    422,
  );
}

function validatePeriod(periodStart: string, periodEnd: string): void {
  if (periodStart < periodEnd) {
    return;
  }

  throw new HttpError(
    400,
    "invalid_period",
    "period_start must be before period_end",
  );
}

function validateNonNegativeMoney(value: string): void {
  const amount = decimalOrNull(value);
  if (amount && amount.gte(0)) {
    return;
  }

  throw new HttpError(
    422,
    "invalid_money_amount",
    "total_billed must be greater than or equal to 0",
  );
}

function ensureBilledAmountsWithinRange(amounts: readonly string[]): void {
  if (findFirstAmountOutOfRange(amounts) === -1) {
    return;
  }

  throw new HttpError(
    422,
    "billed_amount_out_of_range",
    `Billed amount exceeds the maximum supported value of ${NUMERIC_14_2_MAX_LABEL}.`,
  );
}

function normalizedMoney(value: string): string {
  const amount = decimalOrNull(value);
  if (!amount) {
    throw new HttpError(
      422,
      "invalid_money_amount",
      "total_billed must be numeric",
    );
  }

  return amount.toFixed();
}

function moneyOrZero(value: string): Decimal {
  return decimalOrNull(value) ?? new Decimal(0);
}

function decimalOrNull(value: string): Decimal | null {
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

function sumMoney(values: string[]): Decimal {
  return values.reduce(
    (total, value) => total.plus(moneyOrZero(value)),
    new Decimal(0),
  );
}

function rejectOversizeMultipartBody(c: RouteContext): void {
  const contentLength = c.req.header("content-length");
  if (!contentLength) {
    throw new HttpError(
      411,
      "content_length_required",
      "Content-Length is required for actual-billed uploads",
    );
  }
  if (!/^[1-9]\d*$/u.test(contentLength)) {
    throw new HttpError(
      400,
      "invalid_content_length",
      "Content-Length must be a positive integer for actual-billed uploads",
    );
  }
  if (Number(contentLength) <= maxMultipartBodyBytes) {
    return;
  }

  throw new HttpError(
    413,
    "file_too_large",
    "Multipart upload body exceeds the 26MB Worker actual-billed limit",
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
  const value = form.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(422, "missing_form_field", `${field} is required`);
  }

  return value;
}

function requiredQuery(c: RouteContext, key: string): string {
  const value = c.req.query(key);
  if (!value) {
    throw new HttpError(422, "missing_query_parameter", `${key} is required`);
  }

  return value;
}

function optionalQuery(c: RouteContext, key: string): string | undefined {
  const value = c.req.query(key);

  return value && value.trim() ? value : undefined;
}

function parseBooleanQuery(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
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

function throwActualBilledPeriodFinalized(): never {
  throw new HttpError(
    409,
    "actual_billed_period_finalized",
    "Actual billed rows cannot be changed after the reconciliation period is finalized",
  );
}

function resolveRepository(
  env: AppEnv,
  dependencies: ActualBilledRouteDependencies,
): ActualBilledRepository {
  return (
    dependencies.repository ??
    new PostgresActualBilledRepository(createDirectPostgresExecutor(env))
  );
}
