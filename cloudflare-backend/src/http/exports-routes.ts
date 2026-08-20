/**
 * Exports routes — landlord-facing export endpoints.
 *
 * Endpoints (all under /api/v1):
 *   GET  /exports/reconciliation/snapshots/:snapshotId/export/erp
 *   GET  /exports/reconciliation/snapshots/export/erp/batch
 *   GET  /exports/audit-log                   (admin-only)
 *   GET  /export/history
 *   GET  /exports/reconciliation/snapshots/:snapshotId/export/pdf
 *   POST /export/pdf/preview                  (billing-gated)
 *   POST /export/pdf/download                 (billing-gated, persists to R2)
 *   DELETE /export/history/:exportId          (landlord auth, cleanup R2 + row)
 *   GET  /export/download/file                (PUBLIC — token auth, no bearer)
 *   GET  /export/download/:exportId           (landlord auth, mint re-download URL)
 *   POST /demand-letter/generate              (billing-gated)
 *
 * Auth note: /export/download/file must NOT be behind authMiddleware — the
 * token in the query string is the sole credential. window.open() cannot set
 * an Authorization header. All other routes require a bearer.
 */

import { Hono } from "hono";
import { z } from "zod";
import Decimal from "decimal.js";
import { zipSync } from "fflate";
import { PostgresExportsRepository } from "../adapters/db/exports";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type {
  ExportHistoryRow,
  ExportsRepository,
} from "../domain/exports/repository";
import {
  formatErpExport,
  type ErpFormat,
} from "../domain/exports/erp-formatters";
import { buildPropertyPdf } from "../domain/exports/property-pdf";
import { buildVariancePdf } from "../domain/exports/variance-pdf";
import { buildVarianceXlsx } from "../domain/exports/variance-xlsx";
import { buildBoardPdf } from "../domain/exports/board-pdf";
import {
  buildDemandLetterPdf,
  buildStatementCorrectionNotePdf,
} from "../domain/legal/demand-letter";
import {
  buildExportDownloadToken,
  verifyExportDownloadToken,
} from "../domain/exports/tokens";
import {
  createReportsStorage,
  encodeR2StoragePath,
  parseStoragePath,
  type ReportsStorage,
} from "../adapters/storage/reports";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { attachmentContentDisposition } from "./content-disposition";
import { requireRuntimeSecret } from "../platform/cloudflare";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type ExportsRouteDependencies = {
  repository?: ExportsRepository;
  auth?: AuthMiddlewareOptions;
  /** Override current-date for audit-log filename in tests. */
  clock?: () => Date;
  /** Override R2 reports storage — used in tests to inject an in-memory fake. */
  reportsStorage?: ReportsStorage;
  /**
   * Override the global fetch function — used in tests to intercept Supabase
   * signed-URL requests without real network calls.
   */
  fetch?: typeof fetch;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();
const erpFormatSchema = z.enum(["yardi", "mri", "csv"]).default("csv");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Must be a date string YYYY-MM-DD");

const batchQuerySchema = z.object({
  property_id: uuidSchema,
  period_start: dateSchema,
  period_end: dateSchema,
  format: erpFormatSchema,
});

const auditLogQuerySchema = z.object({
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  table_name: z.string().optional(),
  operation: z.string().optional(),
  row_id: uuidSchema.optional(),
  changed_by: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

const historyQuerySchema = z.object({
  property_id: uuidSchema,
  format: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

const snapshotPdfQuerySchema = z.object({
  allow_draft: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

const pdfPreviewBodySchema = z.object({
  property_id: uuidSchema,
  year: z.number().int().min(1900).max(2100),
  include_charts: z.boolean().default(false),
  include_notes: z.boolean().default(false),
  tenant_ids: z.array(uuidSchema).optional(),
});

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Must be a date string YYYY-MM-DD")
  .optional();

// Accept mode as string so we can give a 400 on unsupported values before Zod fails.
const batchPdfBodyWithModeSchema = z.object({
  property_id: uuidSchema,
  year: z.number().int().min(1900).max(2100),
  tenant_ids: z.array(uuidSchema).min(1, "tenant_ids must not be empty"),
  mode: z.string().default("zip"),
});

const variancePdfBodySchema = z.object({
  property_id: uuidSchema,
  current_year: z.number().int().min(1900).max(2100),
  prior_year: z.number().int().min(1900).max(2100),
  threshold_percent: z.number().default(10.0),
});

const boardBodySchema = z.object({
  property_id: uuidSchema,
  year: z.number().int().min(1900).max(2100),
  cap_rate: z.number().default(0.07),
});

const demandLetterBodySchema = z.object({
  snapshot_id: uuidSchema,
  state: z.enum(["TX", "CA"]),
  landlord_name: z.string().min(1).max(255),
  landlord_title: z.string().max(255).default(""),
  landlord_company: z.string().max(255).default(""),
  landlord_address: z.string().max(1000).default(""),
  landlord_phone: z.string().max(50).default(""),
  landlord_email: z.string().max(255).default(""),
  payment_deadline_days: z.number().int().min(1).max(365).default(30),
  dispute_id: uuidSchema.optional(),
  dispute_filed_date: isoDateSchema,
});

// ── Route factory ─────────────────────────────────────────────────────────────

export function createExportsRoutes(
  dependencies: ExportsRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  // Apply auth middleware to all exports routes.
  // NOTE: /export/download/file is intentionally NOT listed here — it is
  // authenticated solely by the HMAC token in the query string so that
  // window.open() can open it without an Authorization header.
  app.use("/exports/*", authMiddleware(dependencies.auth));
  app.use("/export/history", authMiddleware(dependencies.auth));
  app.use("/export/history/:exportId", authMiddleware(dependencies.auth));
  app.use("/export/pdf/preview", authMiddleware(dependencies.auth));
  app.use("/export/pdf/download", authMiddleware(dependencies.auth));
  // Apply auth middleware only when the path segment is NOT the literal "file"
  // (which is the public token-authenticated download route).
  app.use("/export/download/:exportId", async (c, next) => {
    const id = c.req.param("exportId");
    if (id === "file") {
      await next();
      return;
    }
    return authMiddleware(dependencies.auth)(c, next);
  });
  app.use("/demand-letter/generate", authMiddleware(dependencies.auth));
  app.use("/export/pdf/batch", authMiddleware(dependencies.auth));
  app.use("/export/variance/pdf", authMiddleware(dependencies.auth));
  app.use("/export/board/preview", authMiddleware(dependencies.auth));
  app.use("/export/board/download", authMiddleware(dependencies.auth));
  app.use("/export/variance/excel", authMiddleware(dependencies.auth));

  // ── GET /exports/reconciliation/snapshots/:snapshotId/export/erp ─────────

  app.get(
    "/exports/reconciliation/snapshots/:snapshotId/export/erp",
    async (c) => {
      const auth = c.get("auth");
      requireLandlord(auth.actor);

      const snapshotId = uuidSchema.parse(c.req.param("snapshotId"));
      const format = erpFormatSchema.parse(
        c.req.query("format") ?? "csv",
      ) as ErpFormat;

      const repo = resolveRepository(c.env, dependencies);
      const snapshot = await repo.getSnapshotForErp({
        snapshotId,
        organizationId: auth.actor.organizationId,
      });

      if (!snapshot) {
        throw new HttpError(404, "snapshot_not_found", "Snapshot not found");
      }

      if (snapshot.status !== "finalized") {
        throw new HttpError(
          400,
          "snapshot_not_finalized",
          "Cannot export draft snapshot. Snapshot must be finalized.",
        );
      }

      const { body, filename, mediaType } = formatErpExport([snapshot], format);

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": mediaType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
  );

  // ── GET /exports/reconciliation/snapshots/export/erp/batch ───────────────

  app.get("/exports/reconciliation/snapshots/export/erp/batch", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const query = batchQuerySchema.parse(c.req.query());
    const repo = resolveRepository(c.env, dependencies);

    // Verify property belongs to org (mirrors FastAPI property existence check)
    const propertyExists = await repo.propertyBelongsToOrg({
      propertyId: query.property_id,
      organizationId: auth.actor.organizationId,
    });

    if (!propertyExists) {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    const snapshots = await repo.listSnapshotsForErpBatch({
      organizationId: auth.actor.organizationId,
      propertyId: query.property_id,
      periodStart: query.period_start,
      periodEnd: query.period_end,
    });

    if (snapshots.length === 0) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given criteria",
      );
    }

    const { body, filename, mediaType } = formatErpExport(
      snapshots,
      query.format as ErpFormat,
    );

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": mediaType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  // ── GET /exports/audit-log (admin-only) ──────────────────────────────────

  app.get("/exports/audit-log", async (c) => {
    const auth = c.get("auth");
    requireAdmin(auth.actor);

    const raw = c.req.query();
    const query = auditLogQuerySchema.parse({
      start_date: raw["start_date"],
      end_date: raw["end_date"],
      table_name: raw["table_name"],
      operation: raw["operation"],
      row_id: raw["row_id"],
      changed_by: raw["changed_by"],
      limit: raw["limit"],
    });

    const repo = resolveRepository(c.env, dependencies);
    const auditInput: import("../domain/exports/repository").AuditLogQueryInput =
      {
        organizationId: auth.actor.organizationId,
        limit: query.limit,
      };
    if (query.start_date !== undefined) auditInput.startDate = query.start_date;
    if (query.end_date !== undefined) auditInput.endDate = query.end_date;
    if (query.table_name !== undefined) auditInput.tableName = query.table_name;
    if (query.operation !== undefined) auditInput.operation = query.operation;
    if (query.row_id !== undefined) auditInput.rowId = query.row_id;
    if (query.changed_by !== undefined) auditInput.changedBy = query.changed_by;
    const entries = await repo.queryAuditLog(auditInput);

    // Build CSV matching FastAPI's DictWriter output
    const FIELDS = [
      "id",
      "table_name",
      "operation",
      "row_id",
      "old_data",
      "new_data",
      "changed_by",
      "changed_at",
    ] as const;

    const headerRow = FIELDS.join(",");
    const dataRows = entries.map((entry) => {
      return FIELDS.map((field) => {
        const val = entry[field] ?? "";
        const str = String(val);
        // RFC-4180 quoting
        if (/[",\r\n]/u.test(str)) {
          return '"' + str.replace(/"/gu, '""') + '"';
        }
        return str;
      }).join(",");
    });

    const body = [headerRow, ...dataRows].join("\r\n") + "\r\n";
    const now = (dependencies.clock ?? (() => new Date()))();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/gu, "");
    const filename = `audit_log_${dateStamp}.csv`;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  // ── GET /export/history ──────────────────────────────────────────────────

  app.get("/export/history", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const raw = c.req.query();
    const query = historyQuerySchema.parse({
      property_id: raw["property_id"],
      format: raw["format"],
      page: raw["page"],
      page_size: raw["page_size"],
    });

    const repo = resolveRepository(c.env, dependencies);
    const historyInput: import("../domain/exports/repository").ExportHistoryListInput =
      {
        organizationId: auth.actor.organizationId,
        propertyId: query.property_id,
        page: query.page,
        pageSize: query.page_size,
      };
    if (query.format !== undefined) historyInput.format = query.format;
    const result = await repo.listExportHistory(historyInput);

    return c.json(result);
  });

  app.delete("/export/history/:exportId", async (c) => {
    const auth = c.get("auth");
    // Deleting an export history row also permanently removes the underlying R2
    // object, so gate this destructive DELETE at admin tier (owner|admin).
    // The prior requireLandlord admitted the read-only `viewer` role, which the
    // org-editor policy explicitly excludes from any mutation.
    requireAdmin(auth.actor);

    const exportId = uuidSchema.parse(c.req.param("exportId"));
    const repo = resolveRepository(c.env, dependencies);
    const storage = resolveReportsStorage(c.env, dependencies);

    const deleted = await repo.deleteExportHistory({
      exportId,
      organizationId: auth.actor.organizationId,
      beforeDeleteStorage: async (storagePath) => {
        const parsed = parseStoragePath(storagePath);
        if (parsed.provider !== "r2") {
          throw new HttpError(
            400,
            "legacy_export_cleanup_unsupported",
            "Legacy export storage cannot be safely deleted through this route",
          );
        }
        try {
          await storage.deleteReport(parsed.key);
        } catch {
          throw new HttpError(
            503,
            "export_storage_delete_failed",
            "Export storage cleanup failed; export history was not deleted",
          );
        }
      },
    });

    if (!deleted) {
      throw new HttpError(404, "export_not_found", "Export not found");
    }

    return c.body(null, 204);
  });

  // ── GET /exports/reconciliation/snapshots/:snapshotId/export/pdf ──────────

  app.get(
    "/exports/reconciliation/snapshots/:snapshotId/export/pdf",
    async (c) => {
      const auth = c.get("auth");
      requireLandlord(auth.actor);

      const snapshotId = uuidSchema.parse(c.req.param("snapshotId"));
      const { allow_draft } = snapshotPdfQuerySchema.parse(c.req.query());

      const repo = resolveRepository(c.env, dependencies);
      const ctx = await repo.getSnapshotForPdf({
        snapshotId,
        organizationId: auth.actor.organizationId,
      });

      if (!ctx) {
        throw new HttpError(404, "snapshot_not_found", "Snapshot not found");
      }

      if (ctx.snapshot.status !== "finalized" && !allow_draft) {
        throw new HttpError(
          400,
          "snapshot_not_finalized",
          "Cannot export draft snapshot. Set allow_draft=true to override.",
        );
      }

      const pdfBytes = await buildPropertyPdf(ctx);

      // Filename: Reconciliation_{PropertyName}_{Year}.pdf
      // spaces → underscores (mirrors FastAPI line 621)
      const year = ctx.snapshot.period_start_date.slice(0, 4);
      const safeName = (ctx.property.name || "Property").replace(/ /gu, "_");
      const filename = `Reconciliation_${safeName}_${year}.pdf`;

      return new Response(pdfBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": attachmentContentDisposition(filename),
        },
      });
    },
  );

  // ── POST /export/pdf/preview (billing-gated) ──────────────────────────────

  app.post("/export/pdf/preview", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const repo = resolveRepository(c.env, dependencies);
    await requireFullAccess(repo, auth.actor.organizationId);

    const body = pdfPreviewBodySchema.parse(await c.req.json());

    // Fetch ALL finalized snapshots for the property/year without a lease filter.
    // FastAPI calls _fetch_finalized_snapshots (no tenant filter in SQL) and then
    // passes the full list to _snapshots_for_pdf_request where include_charts /
    // include_notes / tenant_ids are validated and the tenant filter is applied
    // in-app.  Replicating that order keeps error-precedence identical.
    const yearStart = `${body.year}-01-01`;
    const yearEnd = `${body.year}-12-31`;

    const snapshots = await repo.listSnapshotsForPropertyPdf({
      organizationId: auth.actor.organizationId,
      propertyId: body.property_id,
      yearStart,
      yearEnd,
      // leaseId intentionally omitted — tenant filtering is done in-app below
    });

    if (snapshots.length === 0) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and year",
      );
    }

    // Replicate FastAPI _snapshots_for_pdf_request guards (run AFTER fetch,
    // matching FastAPI's validation order so error precedence is identical).
    if (body.include_charts) {
      throw new HttpError(
        400,
        "unsupported_option",
        "include_charts is not supported for PDF exports",
      );
    }
    if (body.include_notes) {
      throw new HttpError(
        400,
        "unsupported_option",
        "include_notes is not supported for PDF exports",
      );
    }
    if (body.tenant_ids && body.tenant_ids.length > 1) {
      throw new HttpError(
        400,
        "too_many_tenant_ids",
        "PDF preview/download supports one tenant_id",
      );
    }

    // Apply tenant_id filter in-app (mirrors FastAPI _snapshots_for_pdf_request).
    // tenant_ids[0] is compared against snapshot.lease_id, exactly as FastAPI
    // compares str(snapshot["lease_id"]) == str(request.tenant_ids[0]).
    let filteredSnapshots = snapshots;
    if (body.tenant_ids && body.tenant_ids.length === 1) {
      const requestedLeaseId = body.tenant_ids[0];
      filteredSnapshots = snapshots.filter(
        (s) => s.snapshot.lease_id === requestedLeaseId,
      );
      if (filteredSnapshots.length === 0) {
        // Mirror exact FastAPI BadRequestError message from _snapshots_for_pdf_request
        throw new HttpError(
          400,
          "tenant_not_found",
          "No finalized snapshot matches the requested tenant_id",
        );
      }
    }

    // Use first snapshot for context (mirrors FastAPI _generate_property_pdf)
    const ctx = filteredSnapshots[0];
    if (!ctx) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and year",
      );
    }

    const pdfBytes = await buildPropertyPdf(ctx);

    // Content-Disposition: inline (NOT attachment) — mirrors FastAPI preview_pdf
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  });

  // ── POST /export/pdf/download (billing-gated, persists to R2) ────────────
  //
  // EP-7 mirror. Generates the property PDF, uploads to REPORTS_BUCKET, inserts
  // an export_history row with storage_path = "r2:<key>", and streams the bytes
  // back as an attachment. If the DB insert fails after the R2 upload the R2
  // object is rolled back (deleted) before re-throwing.
  //
  // record_feature_use: FastAPI calls record_feature_use(admin, org, "pdf_exports")
  // after the DB insert. The Worker has no equivalent feature-usage recording
  // mechanism at this time. This call is DEFERRED — a follow-up slice should
  // implement PostHog or a dedicated table event here.

  app.post("/export/pdf/download", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const repo = resolveRepository(c.env, dependencies);
    await requireFullAccess(repo, auth.actor.organizationId);

    const body = pdfPreviewBodySchema.parse(await c.req.json());

    const yearStart = `${body.year}-01-01`;
    const yearEnd = `${body.year}-12-31`;

    const snapshots = await repo.listSnapshotsForPropertyPdf({
      organizationId: auth.actor.organizationId,
      propertyId: body.property_id,
      yearStart,
      yearEnd,
    });

    if (snapshots.length === 0) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and year",
      );
    }

    // Replicate FastAPI _snapshots_for_pdf_request guards
    if (body.include_charts) {
      throw new HttpError(
        400,
        "unsupported_option",
        "include_charts is not supported for PDF exports",
      );
    }
    if (body.include_notes) {
      throw new HttpError(
        400,
        "unsupported_option",
        "include_notes is not supported for PDF exports",
      );
    }
    if (body.tenant_ids && body.tenant_ids.length > 1) {
      throw new HttpError(
        400,
        "too_many_tenant_ids",
        "PDF preview/download supports one tenant_id",
      );
    }

    let filteredSnapshots = snapshots;
    if (body.tenant_ids && body.tenant_ids.length === 1) {
      const requestedLeaseId = body.tenant_ids[0];
      filteredSnapshots = snapshots.filter(
        (s) => s.snapshot.lease_id === requestedLeaseId,
      );
      if (filteredSnapshots.length === 0) {
        throw new HttpError(
          400,
          "tenant_not_found",
          "No finalized snapshot matches the requested tenant_id",
        );
      }
    }

    const ctx = filteredSnapshots[0];
    if (!ctx) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and year",
      );
    }

    const pdfBytes = await buildPropertyPdf(ctx);

    // Filename mirrors FastAPI download_pdf exactly
    const filename = `reconciliation-${body.year}-property.pdf`;

    const storage = resolveReportsStorage(c.env, dependencies);
    const r2Key = storage.generateKey({
      organizationId: auth.actor.organizationId,
      propertyId: body.property_id,
      fileName: filename,
    });

    await storage.putReport(r2Key, pdfBytes, "application/pdf");

    // created_by_name: mirror FastAPI `ctx.user.full_name or ctx.user.email`
    const createdByName = auth.user.fullName ?? auth.user.email;

    let exportId: string | null = null;
    let insertOk = false;
    try {
      exportId = await repo.insertExportHistory({
        organizationId: auth.actor.organizationId,
        propertyId: body.property_id,
        format: "pdf",
        fileName: filename,
        fileSize: pdfBytes.byteLength,
        createdByName,
        storagePath: encodeR2StoragePath(r2Key),
      });
      insertOk = true;
    } finally {
      if (!insertOk) {
        // Rollback the R2 upload so we don't leave orphaned objects
        try {
          await storage.deleteReport(r2Key);
        } catch {
          // best-effort rollback; a real deployment would log here
        }
      }
    }

    // NOTE: record_feature_use("pdf_exports") is DEFERRED — no Worker
    // feature-usage mechanism exists yet. See comment above.

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-CapVeri-Export-Id": exportId ?? "",
        "X-CapVeri-Export-Storage-Path": encodeR2StoragePath(r2Key),
      },
    });
  });

  // ── GET /export/download/file (PUBLIC — HMAC token auth, no bearer) ───────
  //
  // Route F. Fetches R2 bytes for a previously-persisted export report. The
  // token in the ?token= query parameter is verified with HMAC-SHA256 using
  // DOCUMENT_ACCESS_SIGNING_SECRET. No Authorization header is required so
  // that window.open() can open the URL directly.
  //
  // IMPORTANT: this route is intentionally registered BEFORE
  // /export/download/:exportId so that Hono resolves the literal path segment
  // "file" before the dynamic ":exportId" segment.

  app.get("/export/download/file", async (c) => {
    const tokenParam = c.req.query("token");
    if (!tokenParam) {
      throw new HttpError(
        400,
        "missing_token",
        "token query parameter is required",
      );
    }

    const signingSecret = requireRuntimeSecret(
      c.env,
      "DOCUMENT_ACCESS_SIGNING_SECRET",
    );
    const payload = await verifyExportDownloadToken(tokenParam, signingSecret);

    const storage = resolveReportsStorage(c.env, dependencies);
    const bytes = await storage.getReportBytes(payload.r2Key);
    if (!bytes) {
      throw new HttpError(404, "report_not_found", "Export file not found.");
    }

    const contentType = resolveExportDownloadContentType(
      payload.fileName,
      payload.contentType,
    );

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": attachmentContentDisposition(payload.fileName),
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=0, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  // ── GET /export/download/:exportId (landlord auth, mint re-download URL) ──
  //
  // EP-11 mirror. Looks up the export_history row, then:
  //   - "r2:<key>" storage_path → build a short-lived HMAC token, return an
  //     absolute URL to /export/download/file?token=...
  //   - legacy (no prefix) storage_path → call Supabase Storage sign REST to
  //     produce a signed URL (3600 s TTL).
  // 410 when storage_path is null/empty (pre-persist rows).

  app.get("/export/download/:exportId", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const exportId = uuidSchema.parse(c.req.param("exportId"));
    const repo = resolveRepository(c.env, dependencies);

    const row = await repo.getExportHistoryRow({
      exportId,
      organizationId: auth.actor.organizationId,
    });

    if (!row) {
      throw new HttpError(404, "export_not_found", "Export not found");
    }

    if (!row.storage_path) {
      throw new HttpError(
        410,
        "export_no_longer_available",
        "This export is no longer available for download. Please re-generate it.",
      );
    }

    const parsed = parseStoragePath(row.storage_path);
    const ttlSeconds = 3600;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    if (parsed.provider === "r2") {
      // Build an HMAC download token for the public file route
      const signingSecret = requireRuntimeSecret(
        c.env,
        "DOCUMENT_ACCESS_SIGNING_SECRET",
      );
      const token = await buildExportDownloadToken(
        {
          r2Key: parsed.key,
          fileName: row.file_name,
          contentType: exportHistoryContentType(row),
          expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
        },
        signingSecret,
      );

      // Absolute base URL from the incoming request so this works in dev/staging/prod
      const origin = new URL(c.req.url).origin;
      const downloadUrl = `${origin}/api/v1/export/download/file?token=${encodeURIComponent(token)}`;

      return c.json({
        download_url: downloadUrl,
        file_name: row.file_name,
        expires_at: expiresAt,
      });
    }

    // Legacy Supabase path: call Storage sign REST
    const supabaseUrl = c.env.SUPABASE_URL?.trim().replace(/\/+$/u, "");
    const serviceRoleKey = c.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError(
        500,
        "config_error",
        "Supabase configuration is missing for legacy export re-download",
      );
    }

    const resolveFetch = dependencies.fetch ?? fetch;
    const signResponse = await resolveFetch(
      `${supabaseUrl}/storage/v1/object/sign/reports/${encodeURIComponent(parsed.key)}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ expiresIn: ttlSeconds }),
      },
    );

    if (!signResponse.ok) {
      throw new HttpError(
        502,
        "supabase_sign_failed",
        "Failed to create a download URL. Please try again.",
      );
    }

    const signBody = (await signResponse.json()) as Record<string, unknown>;
    // The raw Storage REST API (POST /storage/v1/object/sign/{bucket}/{key})
    // returns { signedURL: "/object/sign/{bucket}/{key}?token=..." } — a path
    // relative to the storage API root (/storage/v1), WITHOUT that prefix.
    const relativeSignedUrl =
      typeof signBody["signedURL"] === "string"
        ? signBody["signedURL"]
        : typeof signBody["signedUrl"] === "string"
          ? signBody["signedUrl"]
          : null;

    if (!relativeSignedUrl) {
      throw new HttpError(
        502,
        "supabase_sign_failed",
        "Failed to create a download URL. Please try again.",
      );
    }

    // Build the absolute URL the frontend can window.open() directly. The
    // storage-js SDK constructs this as `${SUPABASE_URL}/storage/v1${signedURL}`,
    // so we mirror that exactly. Guard against either shape:
    //   - full URL (starts with "http")        → use as-is
    //   - already includes "/storage/v1"        → prepend base only
    //   - bare "/object/sign/..."               → prepend base + "/storage/v1"
    let downloadUrl: string;
    if (relativeSignedUrl.startsWith("http")) {
      downloadUrl = relativeSignedUrl;
    } else if (relativeSignedUrl.startsWith("/storage/v1")) {
      downloadUrl = `${supabaseUrl}${relativeSignedUrl}`;
    } else {
      const path = relativeSignedUrl.startsWith("/")
        ? relativeSignedUrl
        : `/${relativeSignedUrl}`;
      downloadUrl = `${supabaseUrl}/storage/v1${path}`;
    }

    return c.json({
      download_url: downloadUrl,
      file_name: row.file_name,
      expires_at: expiresAt,
    });
  });

  // ── POST /demand-letter/generate (billing-gated) ──────────────────────────

  app.post("/demand-letter/generate", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const repo = resolveRepository(c.env, dependencies);
    await requireFullAccess(repo, auth.actor.organizationId);

    const body = demandLetterBodySchema.parse(await c.req.json());

    // Load snapshot context (org-scoped)
    const dlCtx = await repo.getDemandLetterContext({
      snapshotId: body.snapshot_id,
      organizationId: auth.actor.organizationId,
    });

    if (!dlCtx) {
      throw new HttpError(
        404,
        "snapshot_not_found",
        `reconciliation_snapshot ${body.snapshot_id} not found`,
      );
    }

    // Guard: must be finalized
    if (dlCtx.snapshot.status !== "finalized") {
      throw new HttpError(
        400,
        "snapshot_not_finalized",
        `Demand letters can only be generated for finalized snapshots. Current status: ${JSON.stringify(dlCtx.snapshot.status)}.`,
      );
    }

    const totalRecovery = new Decimal(dlCtx.snapshot.total_recovery || "0");

    // Build payment deadline
    const today = isoToday(dependencies.clock);
    const deadlineDate = addDays(today, body.payment_deadline_days);

    const tenantName = stripHeaderControlCharacters(
      (dlCtx.lease.tenant_name || dlCtx.snapshot.lease_id).trim() || "Tenant",
    );

    const documentData = {
      tenant_name: tenantName,
      property_address: dlCtx.property.address ?? "",
      amount_owed: totalRecovery,
      period_start: dlCtx.snapshot.period_start_date,
      period_end: dlCtx.snapshot.period_end_date,
      lease_reference: dlCtx.snapshot.lease_id,
      landlord_name: body.landlord_name,
      landlord_title: body.landlord_title,
      landlord_company: body.landlord_company,
      landlord_phone: body.landlord_phone,
      landlord_email: body.landlord_email,
      landlord_address: body.landlord_address,
      payment_deadline_date: deadlineDate,
      letter_date: today,
      state: body.state,
      dispute_id: body.dispute_id ?? null,
      dispute_filed_date: body.dispute_filed_date ?? null,
    };

    const isCollectionDemand = totalRecovery.gt(0);
    const pdfBytes = isCollectionDemand
      ? await buildDemandLetterPdf(documentData)
      : await buildStatementCorrectionNotePdf(documentData);

    const safeTenant = tenantName.replace(/\//gu, "-").replace(/\\/gu, "-");
    const filename = isCollectionDemand
      ? `demand-letter-${safeTenant}.pdf`
      : `statement-correction-note-${safeTenant}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentContentDisposition(filename),
      },
    });
  });

  // ── POST /export/pdf/batch (EP-8, billing-gated) ─────────────────────────
  //
  // Builds one property PDF per lease_id in tenant_ids, zips them with fflate,
  // persists ZIP to R2, inserts export_history format="pdf_batch", streams bytes.
  //
  // record_feature_use: not implemented in this Worker yet. DEFERRED — same as EP-7.

  app.post("/export/pdf/batch", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const repo = resolveRepository(c.env, dependencies);
    await requireFullAccess(repo, auth.actor.organizationId);

    const rawBody = await c.req.json();
    const parsed = batchPdfBodyWithModeSchema.parse(rawBody);

    // mode != "zip" → 400 immediately, matching FastAPI
    if (parsed.mode !== "zip") {
      throw new HttpError(
        400,
        "unsupported_mode",
        "mode='individual' is not supported; use mode='zip'",
      );
    }

    if (parsed.tenant_ids.length === 0) {
      throw new HttpError(
        400,
        "invalid_request",
        "tenant_ids must not be empty",
      );
    }

    const yearStart = `${parsed.year}-01-01`;
    const yearEnd = `${parsed.year}-12-31`;

    const snapshots = await repo.listSnapshotsForPropertyPdf({
      organizationId: auth.actor.organizationId,
      propertyId: parsed.property_id,
      yearStart,
      yearEnd,
    });

    if (snapshots.length === 0) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and year",
      );
    }

    // Filter to requested tenant_ids (matched by lease_id), mirroring FastAPI
    const requestedIds = new Set(parsed.tenant_ids.map((id) => String(id)));
    const filtered = snapshots.filter((s) =>
      requestedIds.has(String(s.snapshot.lease_id)),
    );

    if (filtered.length === 0) {
      // FastAPI raises BadRequestError (400), not 404
      throw new HttpError(
        400,
        "no_matching_snapshots",
        "No finalized snapshots match the requested tenant_ids",
      );
    }

    // Build one PDF per matched snapshot and add to ZIP entries
    const zipFiles: Record<string, Uint8Array> = {};
    for (const ctx of filtered) {
      const pdfBytes = await buildPropertyPdf(ctx);
      const leaseIdShort = String(ctx.snapshot.lease_id).slice(0, 8);
      const entryName = `reconciliation-${parsed.year}-${leaseIdShort}.pdf`;
      zipFiles[entryName] = pdfBytes;
    }

    // Build ZIP synchronously with deflate (ZIP_DEFLATED equivalent)
    const zipBytes = zipSync(zipFiles, { level: 6 });

    const today = isoToday(dependencies.clock);
    const datestamp = today.replace(/-/gu, "");
    const zipFilename = `reconciliation-${parsed.year}-batch-${datestamp}.zip`;

    const storage = resolveReportsStorage(c.env, dependencies);
    const r2Key = storage.generateKey({
      organizationId: auth.actor.organizationId,
      propertyId: parsed.property_id,
      fileName: zipFilename,
    });

    await storage.putReport(r2Key, zipBytes, "application/zip");

    const createdByName = auth.user.fullName ?? auth.user.email;

    let insertOk = false;
    let exportId: string | null = null;
    try {
      exportId = await repo.insertExportHistory({
        organizationId: auth.actor.organizationId,
        propertyId: parsed.property_id,
        format: "pdf_batch",
        fileName: zipFilename,
        fileSize: zipBytes.byteLength,
        createdByName,
        storagePath: encodeR2StoragePath(r2Key),
      });
      insertOk = true;
    } finally {
      if (!insertOk) {
        try {
          await storage.deleteReport(r2Key);
        } catch {
          // best-effort rollback
        }
      }
    }

    // NOTE: record_feature_use is DEFERRED — no Worker feature-usage mechanism yet.

    return new Response(zipBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
        "X-CapVeri-Export-Id": exportId ?? "",
        "X-CapVeri-Export-Storage-Path": encodeR2StoragePath(r2Key),
      },
    });
  });

  // ── POST /export/variance/pdf (EP-12, billing-gated) ─────────────────────

  app.post("/export/variance/pdf", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const repo = resolveRepository(c.env, dependencies);
    await requireFullAccess(repo, auth.actor.organizationId);

    const body = variancePdfBodySchema.parse(await c.req.json());

    const yearStartCurrent = `${body.current_year}-01-01`;
    const yearEndCurrent = `${body.current_year}-12-31`;
    const yearStartPrior = `${body.prior_year}-01-01`;
    const yearEndPrior = `${body.prior_year}-12-31`;

    const [snapshotsCurrent, snapshotsPrior, propRow] = await Promise.all([
      repo.listSnapshotsForYear({
        organizationId: auth.actor.organizationId,
        propertyId: body.property_id,
        yearStart: yearStartCurrent,
        yearEnd: yearEndCurrent,
      }),
      repo.listSnapshotsForYear({
        organizationId: auth.actor.organizationId,
        propertyId: body.property_id,
        yearStart: yearStartPrior,
        yearEnd: yearEndPrior,
      }),
      repo.getPropertyName({
        propertyId: body.property_id,
        organizationId: auth.actor.organizationId,
      }),
    ]);

    // FastAPI: raises 404 only when BOTH years have no snapshots
    if (snapshotsCurrent.length === 0 && snapshotsPrior.length === 0) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and years",
      );
    }

    const propertyName = propRow?.name ?? "Property";

    const pdfBytes = await buildVariancePdf({
      snapshotsCurrent,
      snapshotsPrior,
      currentYear: body.current_year,
      priorYear: body.prior_year,
      thresholdPercent: body.threshold_percent,
      propertyName,
    });

    const filename = `statement-check-report-${body.current_year}-vs-${body.prior_year}.pdf`;

    const storage = resolveReportsStorage(c.env, dependencies);
    const r2Key = storage.generateKey({
      organizationId: auth.actor.organizationId,
      propertyId: body.property_id,
      fileName: filename,
    });

    await storage.putReport(r2Key, pdfBytes, "application/pdf");

    const createdByName = auth.user.fullName ?? auth.user.email;

    let insertOk = false;
    let exportId: string | null = null;
    try {
      exportId = await repo.insertExportHistory({
        organizationId: auth.actor.organizationId,
        propertyId: body.property_id,
        format: "variance_pdf",
        fileName: filename,
        fileSize: pdfBytes.byteLength,
        createdByName,
        storagePath: encodeR2StoragePath(r2Key),
      });
      insertOk = true;
    } finally {
      if (!insertOk) {
        try {
          await storage.deleteReport(r2Key);
        } catch {
          // best-effort rollback
        }
      }
    }

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-CapVeri-Export-Id": exportId ?? "",
        "X-CapVeri-Export-Storage-Path": encodeR2StoragePath(r2Key),
      },
    });
  });

  // ── POST /export/variance/excel (EP-13, billing-gated) ───────────────────
  //
  // Generates an XLSX workbook comparing current vs prior year CAM recovery.
  // Mirrors FastAPI _generate_variance_excel (export.py ~351-436).
  // Persists to R2 reports bucket + inserts export_history format="variance_excel".
  // R2 rolled back on insert failure (same finally pattern as EP-7/EP-12).

  app.post("/export/variance/excel", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const repo = resolveRepository(c.env, dependencies);
    await requireFullAccess(repo, auth.actor.organizationId);

    const body = variancePdfBodySchema.parse(await c.req.json());

    const yearStartCurrent = `${body.current_year}-01-01`;
    const yearEndCurrent = `${body.current_year}-12-31`;
    const yearStartPrior = `${body.prior_year}-01-01`;
    const yearEndPrior = `${body.prior_year}-12-31`;

    const [snapshotsCurrent, snapshotsPrior, propRow] = await Promise.all([
      repo.listSnapshotsForYear({
        organizationId: auth.actor.organizationId,
        propertyId: body.property_id,
        yearStart: yearStartCurrent,
        yearEnd: yearEndCurrent,
      }),
      repo.listSnapshotsForYear({
        organizationId: auth.actor.organizationId,
        propertyId: body.property_id,
        yearStart: yearStartPrior,
        yearEnd: yearEndPrior,
      }),
      repo.getPropertyName({
        propertyId: body.property_id,
        organizationId: auth.actor.organizationId,
      }),
    ]);

    // FastAPI: raises 404 only when BOTH years have no snapshots
    if (snapshotsCurrent.length === 0 && snapshotsPrior.length === 0) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and years",
      );
    }

    const propertyName = propRow?.name ?? "Property";

    const xlsxBytes = await buildVarianceXlsx({
      snapshotsCurrent,
      snapshotsPrior,
      currentYear: body.current_year,
      priorYear: body.prior_year,
      thresholdPercent: body.threshold_percent,
      propertyName,
    });

    const filename = `statement-check-report-${body.current_year}-vs-${body.prior_year}.xlsx`;

    const storage = resolveReportsStorage(c.env, dependencies);
    const r2Key = storage.generateKey({
      organizationId: auth.actor.organizationId,
      propertyId: body.property_id,
      fileName: filename,
    });

    await storage.putReport(
      r2Key,
      xlsxBytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const createdByName = auth.user.fullName ?? auth.user.email;

    let insertOk = false;
    let exportId: string | null = null;
    try {
      exportId = await repo.insertExportHistory({
        organizationId: auth.actor.organizationId,
        propertyId: body.property_id,
        format: "variance_excel",
        fileName: filename,
        fileSize: xlsxBytes.byteLength,
        createdByName,
        storagePath: encodeR2StoragePath(r2Key),
      });
      insertOk = true;
    } finally {
      if (!insertOk) {
        try {
          await storage.deleteReport(r2Key);
        } catch {
          // best-effort rollback
        }
      }
    }

    return new Response(xlsxBytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-CapVeri-Export-Id": exportId ?? "",
        "X-CapVeri-Export-Storage-Path": encodeR2StoragePath(r2Key),
      },
    });
  });

  // ── POST /export/board/preview (EP-14a) ───────────────────────────────────
  //
  // Billing gate: requireFullAccess (same mechanism as other gated routes).
  // FastAPI uses _require_professional_feature(ctx,"portfolio_board_reports",...)
  // which also calls has_full_access — we reuse the same requireFullAccess helper.
  //
  // record_feature_use("noi_impact_calculator"): DEFERRED — same as EP-7 / EP-8.
  // No Worker feature-usage mechanism exists yet.

  app.post("/export/board/preview", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const repo = resolveRepository(c.env, dependencies);
    await requireFullAccess(repo, auth.actor.organizationId);

    const rawBody = boardBodySchema.parse(await c.req.json());
    const capRate = new Decimal(rawBody.cap_rate);

    // Validate cap_rate range [0.01, 0.25] → 400 (mirrors noi_impact.py ValueError)
    if (capRate.lt("0.01") || capRate.gt("0.25")) {
      throw new HttpError(
        400,
        "invalid_cap_rate",
        "cap_rate must be between 1% and 25%",
      );
    }

    const yearStart = `${rawBody.year}-01-01`;
    const yearEnd = `${rawBody.year}-12-31`;

    const [snapshots, propRow] = await Promise.all([
      repo.listSnapshotsForYear({
        organizationId: auth.actor.organizationId,
        propertyId: rawBody.property_id,
        yearStart,
        yearEnd,
      }),
      repo.getPropertyName({
        propertyId: rawBody.property_id,
        organizationId: auth.actor.organizationId,
      }),
    ]);

    if (snapshots.length === 0) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and year",
      );
    }

    const year =
      snapshots[0]?.period_start_date.slice(0, 4) ?? String(rawBody.year);
    const pdfBytes = await buildBoardPdf({
      snapshots,
      propertyName: propRow?.name ?? "Property",
      orgName: propRow?.org_name ?? "",
      year,
      capRate,
    });

    // NOTE: record_feature_use("noi_impact_calculator") is DEFERRED.

    // preview → inline, NOT persisted
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  });

  // ── POST /export/board/download (EP-14b) ──────────────────────────────────

  app.post("/export/board/download", async (c) => {
    const auth = c.get("auth");
    requireLandlord(auth.actor);

    const repo = resolveRepository(c.env, dependencies);
    await requireFullAccess(repo, auth.actor.organizationId);

    const rawBody = boardBodySchema.parse(await c.req.json());
    const capRate = new Decimal(rawBody.cap_rate);

    if (capRate.lt("0.01") || capRate.gt("0.25")) {
      throw new HttpError(
        400,
        "invalid_cap_rate",
        "cap_rate must be between 1% and 25%",
      );
    }

    const yearStart = `${rawBody.year}-01-01`;
    const yearEnd = `${rawBody.year}-12-31`;

    const [snapshots, propRow] = await Promise.all([
      repo.listSnapshotsForYear({
        organizationId: auth.actor.organizationId,
        propertyId: rawBody.property_id,
        yearStart,
        yearEnd,
      }),
      repo.getPropertyName({
        propertyId: rawBody.property_id,
        organizationId: auth.actor.organizationId,
      }),
    ]);

    if (snapshots.length === 0) {
      throw new HttpError(
        404,
        "snapshots_not_found",
        "No finalized snapshots found for the given property and year",
      );
    }

    const year =
      snapshots[0]?.period_start_date.slice(0, 4) ?? String(rawBody.year);
    const pdfBytes = await buildBoardPdf({
      snapshots,
      propertyName: propRow?.name ?? "Property",
      orgName: propRow?.org_name ?? "",
      year,
      capRate,
    });

    const filename = `board-presentation-${rawBody.year}.pdf`;

    const storage = resolveReportsStorage(c.env, dependencies);
    const r2Key = storage.generateKey({
      organizationId: auth.actor.organizationId,
      propertyId: rawBody.property_id,
      fileName: filename,
    });

    await storage.putReport(r2Key, pdfBytes, "application/pdf");

    const createdByName = auth.user.fullName ?? auth.user.email;

    let insertOk = false;
    let exportId: string | null = null;
    try {
      exportId = await repo.insertExportHistory({
        organizationId: auth.actor.organizationId,
        propertyId: rawBody.property_id,
        format: "board_pdf",
        fileName: filename,
        fileSize: pdfBytes.byteLength,
        createdByName,
        storagePath: encodeR2StoragePath(r2Key),
      });
      insertOk = true;
    } finally {
      if (!insertOk) {
        try {
          await storage.deleteReport(r2Key);
        } catch {
          // best-effort rollback
        }
      }
    }

    // NOTE: record_feature_use("noi_impact_calculator") is DEFERRED.

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-CapVeri-Export-Id": exportId ?? "",
        "X-CapVeri-Export-Storage-Path": encodeR2StoragePath(r2Key),
      },
    });
  });

  return app;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: ExportsRouteDependencies,
): ExportsRepository {
  return (
    dependencies.repository ??
    new PostgresExportsRepository(createDirectPostgresExecutor(env))
  );
}

function requireLandlord(actor: AuthVariables["auth"]["actor"]): void {
  if (actor.party === "landlord") {
    return;
  }
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireAdmin(actor: AuthVariables["auth"]["actor"]): void {
  if (
    actor.party === "landlord" &&
    (actor.role === "owner" || actor.role === "admin")
  ) {
    return;
  }
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Admin privileges required",
  );
}

async function requireFullAccess(
  repo: ExportsRepository,
  organizationId: string,
): Promise<void> {
  if (await repo.hasFullAccess(organizationId)) {
    return;
  }
  throw new HttpError(
    402,
    "subscription_required",
    "subscription_required: Your free trial has ended. Choose a plan and add billing to keep using this feature.",
  );
}

function resolveReportsStorage(
  env: AppEnv,
  dependencies: ExportsRouteDependencies,
): ReportsStorage {
  return dependencies.reportsStorage ?? createReportsStorage(env);
}

function exportHistoryContentType(row: ExportHistoryRow): string {
  switch (row.format) {
    case "pdf_batch":
      return "application/zip";
    case "variance_excel":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "excel":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv";
    default:
      return resolveExportDownloadContentType(row.file_name);
  }
}

function resolveExportDownloadContentType(
  fileName: string,
  signedContentType?: string,
): string {
  if (isAllowedExportDownloadContentType(signedContentType)) {
    return signedContentType;
  }

  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".zip")) {
    return "application/zip";
  }
  if (normalized.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (normalized.endsWith(".csv")) {
    return "text/csv";
  }

  return "application/pdf";
}

function isAllowedExportDownloadContentType(
  contentType: string | undefined,
): contentType is string {
  return (
    contentType === "application/pdf" ||
    contentType === "application/zip" ||
    contentType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    contentType === "text/csv"
  );
}

function stripHeaderControlCharacters(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const codePoint = char.codePointAt(0);
      return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join("");
}

/** Return today's ISO date YYYY-MM-DD, overridable via the clock dep. */
function isoToday(clock?: () => Date): string {
  return (clock ?? (() => new Date()))().toISOString().slice(0, 10);
}

/** Add N calendar days to an ISO date string, return ISO date string. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
