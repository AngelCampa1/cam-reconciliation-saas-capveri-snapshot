/**
 * SB 1103 Compliance routes — JSON API for managing compliance requests.
 *
 * When mounted under /api/v1 in app.ts the full paths become:
 *   GET    /api/v1/compliance/sb1103
 *   GET    /api/v1/compliance/sb1103/alerts
 *   POST   /api/v1/compliance/sb1103
 *   GET    /api/v1/compliance/sb1103/:id
 *   PATCH  /api/v1/compliance/sb1103/:id
 *   DELETE /api/v1/compliance/sb1103/:id
 *
 * Mirrors backend/app/api/v1/compliance.py (FastAPI).
 * Export endpoint (POST /:id/export) is deferred.
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresSb1103Repository } from "../adapters/db/sb1103";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  Sb1103StatusConflictError,
  type Sb1103Repository,
} from "../domain/sb1103/repository";
import {
  buildSb1103ExportData,
  generateSb1103Pdf,
  generateSb1103Xlsx,
  tenantSlug,
  zipSb1103Packet,
  Sb1103NotFoundError,
  Sb1103ValidationError,
} from "../domain/sb1103/export";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type Sb1103RouteDependencies = {
  repository?: Sb1103Repository;
  auth?: AuthMiddlewareOptions;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("Invalid UUID");

const createBodySchema = z.object({
  property_id: z.string().uuid("property_id must be a valid UUID"),
  lease_id: z.string().uuid("lease_id must be a valid UUID"),
  requested_by_name: z.string().min(1).max(255),
  requested_by_email: z.string().email().max(255),
  request_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "request_date must be YYYY-MM-DD"),
  notes: z.string().nullable().optional(),
});

const patchBodySchema = z.object({
  status: z
    .string()
    .regex(/^(pending|exported|delivered|overdue)$/, "Invalid status value")
    .optional(),
  notes: z.string().nullable().optional(),
});

// ── Date math helpers ─────────────────────────────────────────────────────────

/**
 * Compute response_deadline = request_date + 30 calendar days.
 * Uses UTC Date objects to avoid timezone drift.
 */
function computeResponseDeadline(requestDate: string): string {
  const [year, month, day] = requestDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const d = new Date(Date.UTC(year, month - 1, day + 30));
  return d.toISOString().slice(0, 10);
}

/**
 * Compute window_start_date = request_date - 18 calendar months.
 *
 * Uses Python dateutil.relativedelta(months=18) semantics:
 *   - Subtract 18 from the month, carrying over into year.
 *   - Clamp the day to the last valid day of the target month (e.g.,
 *     2026-08-31 - 18 months → 2025-02 → clamp day 31 to 28 → 2025-02-28).
 */
function computeWindowStart(requestDate: string): string {
  const [year, month, day] = requestDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];

  let targetYear = year;
  let targetMonth = month - 18;
  while (targetMonth <= 0) {
    targetMonth += 12;
    targetYear -= 1;
  }

  // Clamp day to last valid day of targetMonth in targetYear.
  // Setting day=0 of the next month gives the last day of targetMonth.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);

  const d = new Date(Date.UTC(targetYear, targetMonth - 1, clampedDay));
  return d.toISOString().slice(0, 10);
}

/** Current UTC date as YYYY-MM-DD. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Auth guard helpers ────────────────────────────────────────────────────────

function requireLandlord(c: RouteContext): void {
  if (c.get("auth").actor.party === "landlord") return;
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireEditor(c: RouteContext): void {
  requireLandlord(c);
  const { role } = c.get("auth").actor;
  if (role === "owner" || role === "admin" || role === "member") return;
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireAdmin(c: RouteContext): void {
  requireLandlord(c);
  const { role } = c.get("auth").actor;
  if (role === "owner" || role === "admin") return;
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createSb1103Routes(
  dependencies: Sb1103RouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/compliance/sb1103", authMiddleware(dependencies.auth));
  app.use("/compliance/sb1103/*", authMiddleware(dependencies.auth));

  // ── GET /compliance/sb1103 — list ──────────────────────────────────────────

  app.get("/compliance/sb1103", async (c) => {
    requireLandlord(c);

    const rawQuery = c.req.query();

    let propertyId: string | undefined;
    if (rawQuery["property_id"] !== undefined) {
      try {
        propertyId = uuidSchema.parse(rawQuery["property_id"]);
      } catch {
        throw new HttpError(
          400,
          "validation_error",
          "property_id must be a valid UUID",
        );
      }
    }

    const status: string | undefined = rawQuery["status"];
    const orgId = c.get("auth").actor.organizationId;
    const repository = resolveRepository(c.env, dependencies);

    const listInput: import("../domain/sb1103/repository").ListSb1103Input = {
      organizationId: orgId,
    };
    if (propertyId !== undefined) listInput.propertyId = propertyId;
    if (status !== undefined) listInput.status = status;

    const rows = await repository.listRequests(listInput);
    return c.json({ data: rows, count: rows.length, has_more: false });
  });

  // ── GET /compliance/sb1103/alerts — BEFORE /:id ────────────────────────────

  app.get("/compliance/sb1103/alerts", async (c) => {
    requireLandlord(c);

    const rawDays = c.req.query("days_warning");
    let daysWarning = 7;
    if (rawDays !== undefined) {
      const parsed = parseInt(rawDays, 10);
      if (
        !Number.isInteger(parsed) ||
        parsed < 0 ||
        String(parsed) !== rawDays
      ) {
        throw new HttpError(
          400,
          "validation_error",
          "days_warning must be a non-negative integer",
        );
      }
      daysWarning = parsed;
    }

    const orgId = c.get("auth").actor.organizationId;
    const repository = resolveRepository(c.env, dependencies);

    const today = todayUtc();
    const cutoff = addDays(today, daysWarning);

    const requests = await repository.listDeadlineAlertRequests(orgId, cutoff);
    if (requests.length === 0) return c.json([]);

    const propertyIds = [...new Set(requests.map((r) => r.property_id))];
    const leaseIds = [...new Set(requests.map((r) => r.lease_id))];

    const [propMap, leaseMap] = await Promise.all([
      repository.getPropertyNames(orgId, propertyIds),
      repository.getTenantNamesByLease(orgId, leaseIds),
    ]);

    const alerts = requests.map((r) => {
      const deadline = r.response_deadline;
      const daysRemaining = diffDays(today, deadline);
      return {
        request_id: r.id,
        property_id: r.property_id,
        property_name: propMap.get(r.property_id) ?? "Unknown Property",
        tenant_name: leaseMap.get(r.lease_id) ?? "Unknown Tenant",
        response_deadline: deadline,
        days_remaining: daysRemaining,
        status: r.status,
      };
    });

    return c.json(alerts);
  });

  // ── POST /compliance/sb1103 — create ──────────────────────────────────────

  app.post("/compliance/sb1103", async (c) => {
    // Gating: auth → editor (403) → full-access (402) → logic
    // Mirrors FastAPI dependency order [require_org_editor, require_full_access].
    const actor = c.get("auth").actor;
    const repository = resolveRepository(c.env, dependencies);

    requireEditor(c);
    if (!(await repository.hasFullAccess(actor.organizationId))) {
      throw new HttpError(
        402,
        "subscription_required",
        "subscription_required: An active subscription or trial is required.",
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(
        400,
        "invalid_json",
        "Request body must be valid JSON",
      );
    }

    let body: z.infer<typeof createBodySchema>;
    try {
      body = createBodySchema.parse(rawBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid request body",
        );
      }
      throw err;
    }

    const orgId = actor.organizationId;

    // Validate property belongs to org
    const property = await repository.getPropertyById(orgId, body.property_id);
    if (!property) {
      throw new HttpError(404, "not_found", "Property not found");
    }

    // Validate lease belongs to org
    const lease = await repository.getLeaseById(orgId, body.lease_id);
    if (!lease) {
      throw new HttpError(404, "not_found", "Lease not found");
    }

    // Validate lease belongs to the requested property
    if (lease.property_id !== body.property_id) {
      throw new HttpError(
        400,
        "lease_property_mismatch",
        "Lease does not belong to the requested property",
      );
    }

    const created = await repository.createRequest({
      organization_id: orgId,
      property_id: body.property_id,
      lease_id: body.lease_id,
      requested_by_name: body.requested_by_name,
      requested_by_email: body.requested_by_email,
      request_date: body.request_date,
      response_deadline: computeResponseDeadline(body.request_date),
      window_start_date: computeWindowStart(body.request_date),
      window_end_date: body.request_date,
      status: "pending",
      notes: body.notes ?? null,
    });

    return c.json(created, 201);
  });

  // ── GET /compliance/sb1103/:id — get single ───────────────────────────────

  app.get("/compliance/sb1103/:id", async (c) => {
    requireLandlord(c);

    let id: string;
    try {
      id = uuidSchema.parse(c.req.param("id"));
    } catch {
      throw new HttpError(400, "validation_error", "id must be a valid UUID");
    }

    const orgId = c.get("auth").actor.organizationId;
    const repository = resolveRepository(c.env, dependencies);
    const row = await repository.getRequestById(orgId, id);
    if (!row) {
      throw new HttpError(404, "not_found", "SB1103Request not found");
    }
    return c.json(row);
  });

  // ── PATCH /compliance/sb1103/:id — update ────────────────────────────────

  app.patch("/compliance/sb1103/:id", async (c) => {
    const actor = c.get("auth").actor;
    const repository = resolveRepository(c.env, dependencies);

    // Gating: auth → editor (403) → full-access (402)
    // Mirrors FastAPI dependency order [require_org_editor, require_full_access].
    requireEditor(c);
    if (!(await repository.hasFullAccess(actor.organizationId))) {
      throw new HttpError(
        402,
        "subscription_required",
        "subscription_required: An active subscription or trial is required.",
      );
    }

    let id: string;
    try {
      id = uuidSchema.parse(c.req.param("id"));
    } catch {
      throw new HttpError(400, "validation_error", "id must be a valid UUID");
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(
        400,
        "invalid_json",
        "Request body must be valid JSON",
      );
    }

    let body: z.infer<typeof patchBodySchema>;
    try {
      body = patchBodySchema.parse(rawBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid request body",
        );
      }
      throw err;
    }

    const orgId = actor.organizationId;
    const fields: import("../domain/sb1103/repository").UpdateSb1103Fields = {};
    if (body.status !== undefined) fields.status = body.status;
    if (body.notes !== undefined) fields.notes = body.notes;

    let updated: Awaited<ReturnType<Sb1103Repository["updateRequest"]>>;
    try {
      updated = await repository.updateRequest(orgId, id, fields);
    } catch (err) {
      if (err instanceof Sb1103StatusConflictError) {
        throw new HttpError(
          409,
          "sb1103_status_conflict",
          "SB 1103 request status changed before update could be recorded.",
        );
      }
      throw err;
    }
    if (!updated) {
      throw new HttpError(404, "not_found", "SB1103Request not found");
    }
    return c.json(updated);
  });

  // ── POST /compliance/sb1103/:id/export — generate export ─────────────────
  //
  // Auth: editor (403) → full-access (402) — mirrors FastAPI dependency order
  // [require_org_editor, require_full_access].
  //
  // Query param: format = "pdf" | "excel" | "both"
  // Response: streams file bytes directly (no R2 storage), matching FastAPI
  // StreamingResponse contract exactly.
  //
  // On success, marks the request as status='exported' in the DB.

  app.post("/compliance/sb1103/:id/export", async (c) => {
    const actor = c.get("auth").actor;
    const repository = resolveRepository(c.env, dependencies);

    // Editor gate (403)
    requireEditor(c);
    // Full-access gate (402)
    if (!(await repository.hasFullAccess(actor.organizationId))) {
      throw new HttpError(
        402,
        "subscription_required",
        "subscription_required: An active subscription or trial is required.",
      );
    }

    // Parse and validate :id
    let id: string;
    try {
      id = uuidSchema.parse(c.req.param("id"));
    } catch {
      throw new HttpError(400, "validation_error", "id must be a valid UUID");
    }

    // Validate format query param
    const format = c.req.query("format");
    if (format !== "pdf" && format !== "excel" && format !== "both") {
      throw new HttpError(
        400,
        "validation_error",
        `Invalid export format '${format ?? ""}'. Must be pdf, excel, or both.`,
      );
    }

    const orgId = actor.organizationId;

    // Assemble export data (builds GL entries + tenant share amounts)
    let exportData: Awaited<ReturnType<typeof buildSb1103ExportData>>;
    try {
      exportData = await buildSb1103ExportData(repository, orgId, id);
    } catch (err) {
      if (err instanceof Sb1103NotFoundError) {
        throw new HttpError(404, "not_found", err.message);
      }
      if (err instanceof Sb1103ValidationError) {
        throw new HttpError(400, "validation_error", err.message);
      }
      if (err instanceof Error) {
        throw new HttpError(
          500,
          "export_failed",
          `Failed to build export data: ${err.message}`,
        );
      }
      throw new HttpError(500, "export_failed", "Failed to build export data");
    }

    const slug = tenantSlug(exportData.tenant_name);
    const startStr = exportData.request.window_start_date.replace(/-/g, "");
    const endStr = exportData.request.window_end_date.replace(/-/g, "");
    const baseName = `SB1103_${slug}_${startStr}_${endStr}`;

    // Generate file bytes BEFORE updating DB (mirrors FastAPI: don't mark
    // exported if generation fails).
    let fileBytes: Uint8Array;
    let mediaType: string;
    let filename: string;

    try {
      if (format === "pdf") {
        fileBytes = await generateSb1103Pdf(exportData);
        mediaType = "application/pdf";
        filename = `${baseName}.pdf`;
      } else if (format === "excel") {
        fileBytes = await generateSb1103Xlsx(exportData);
        mediaType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = `${baseName}.xlsx`;
      } else {
        // "both" → ZIP
        const pdfBytes = await generateSb1103Pdf(exportData);
        const xlsxBytes = await generateSb1103Xlsx(exportData);
        fileBytes = zipSb1103Packet(baseName, pdfBytes, xlsxBytes);
        mediaType = "application/zip";
        filename = `${baseName}.zip`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpError(
        500,
        "export_generation_failed",
        `Export generation failed: ${msg}`,
      );
    }

    // Mark request as exported (only after successful generation)
    const exportedAt = new Date().toISOString();
    const markedExported = await repository.markExported({
      orgId,
      id,
      format,
      exportedAt,
    });
    if (!markedExported) {
      throw new HttpError(
        409,
        "sb1103_status_conflict",
        "SB 1103 request status changed before export could be recorded.",
      );
    }

    return new Response(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": mediaType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  // ── DELETE /compliance/sb1103/:id — delete (admin only) ──────────────────

  app.delete("/compliance/sb1103/:id", async (c) => {
    const actor = c.get("auth").actor;
    const repository = resolveRepository(c.env, dependencies);

    // Gating: auth → admin (403) → full-access (402). Role is checked before
    // billing so a non-admin fails fast with 403 and never learns the org's
    // subscription state — matching the POST/PATCH/export siblings, which all
    // gate role before hasFullAccess.
    requireAdmin(c);
    if (!(await repository.hasFullAccess(actor.organizationId))) {
      throw new HttpError(
        402,
        "subscription_required",
        "subscription_required: An active subscription or trial is required.",
      );
    }

    let id: string;
    try {
      id = uuidSchema.parse(c.req.param("id"));
    } catch {
      throw new HttpError(400, "validation_error", "id must be a valid UUID");
    }

    const orgId = actor.organizationId;
    const deleted = await repository.deleteRequest(orgId, id);
    if (!deleted) {
      throw new HttpError(404, "not_found", "SB1103Request not found");
    }
    return new Response(null, { status: 204 });
  });

  return app;
}

// ── Date utilities ────────────────────────────────────────────────────────────

/** Add n days to a YYYY-MM-DD string, returning YYYY-MM-DD in UTC. */
function addDays(date: string, n: number): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return d.toISOString().slice(0, 10);
}

/**
 * Compute whole days from today to deadline (negative means overdue).
 * Both strings are YYYY-MM-DD.
 */
function diffDays(today: string, deadline: string): number {
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const [dy, dm, dd] = deadline.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const t = Date.UTC(ty, tm - 1, td);
  const d = Date.UTC(dy, dm - 1, dd);
  return Math.trunc((d - t) / 86_400_000);
}

// ── DI helper ─────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: Sb1103RouteDependencies,
): Sb1103Repository {
  return (
    dependencies.repository ??
    new PostgresSb1103Repository(createDirectPostgresExecutor(env))
  );
}
