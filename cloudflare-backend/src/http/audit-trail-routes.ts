/**
 * Audit-trail query routes — JSON API for browsing the organization's audit log.
 *
 * When mounted under /api/v1 in app.ts the full path becomes:
 *   GET /api/v1/audit-trail
 *
 * Mirrors backend/app/api/v1/audit_trail.py (FastAPI). Admin only.
 */

import { Hono } from "hono";
import { z } from "zod";
import { PostgresAuditTrailRepository } from "../adapters/db/audit-trail";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { AuditTrailRepository } from "../domain/audit-trail/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";
import { createPaginatedResponse } from "./pagination";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type AuditTrailRouteDependencies = {
  repository?: AuditTrailRepository;
  auth?: AuthMiddlewareOptions;
};

// ── Query param schema ────────────────────────────────────────────────────────

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format");

const uuidSchema = z.string().uuid("Invalid UUID");

const auditTrailQuerySchema = z.object({
  start_date: isoDateSchema.optional(),
  end_date: isoDateSchema.optional(),
  table_name: z.string().optional(),
  operation: z.string().optional(),
  row_id: uuidSchema.optional(),
  changed_by: uuidSchema.optional(),
  // Ceiling at MAX_SAFE_INTEGER: past it, `page` stringifies in exponent notation
  // and Postgres rejects the OFFSET (22P02 -> opaque 500); this fails closed 422.
  page: z.coerce
    .number()
    .int()
    .min(1, "page must be >= 1")
    .max(Number.MAX_SAFE_INTEGER, "page is too large")
    .optional()
    .default(1),
  page_size: z.coerce
    .number()
    .int()
    .min(1, "page_size must be >= 1")
    .max(100, "page_size must be <= 100")
    .optional()
    .default(50),
});

// ── Route factory ─────────────────────────────────────────────────────────────

export function createAuditTrailRoutes(
  dependencies: AuditTrailRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/audit-trail", authMiddleware(dependencies.auth));
  app.use("/audit-trail/*", authMiddleware(dependencies.auth));

  // ── GET /audit-trail ───────────────────────────────────────────────────────

  app.get("/audit-trail", async (c) => {
    const auth = c.get("auth");
    const actor = auth.actor;

    // Admin gate: landlord party + owner or admin role
    if (
      actor.party !== "landlord" ||
      (actor.role !== "owner" && actor.role !== "admin")
    ) {
      throw new HttpError(
        403,
        "insufficient_permissions",
        "insufficient_permissions",
      );
    }

    // Parse and validate query params
    const rawQuery = c.req.query();
    let params: z.infer<typeof auditTrailQuerySchema>;
    try {
      params = auditTrailQuerySchema.parse(rawQuery);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid query parameter",
        );
      }
      throw err;
    }

    const repository = resolveRepository(c.env, dependencies);

    const listInput: import("../domain/audit-trail/repository").ListAuditLogInput =
      {
        organizationId: actor.organizationId,
        page: params.page,
        pageSize: params.page_size,
      };
    if (params.start_date !== undefined)
      listInput.startDate = params.start_date;
    if (params.end_date !== undefined) listInput.endDate = params.end_date;
    if (params.table_name !== undefined)
      listInput.tableName = params.table_name;
    if (params.operation !== undefined)
      listInput.operation = params.operation.toUpperCase();
    if (params.row_id !== undefined) listInput.rowId = params.row_id;
    if (params.changed_by !== undefined)
      listInput.changedBy = params.changed_by;

    const result = await repository.listAuditLog(listInput);

    return c.json(
      createPaginatedResponse({
        items: result.rows,
        total: result.total,
        page: params.page,
        pageSize: params.page_size,
      }),
    );
  });

  return app;
}

// ── DI helper ─────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: AuditTrailRouteDependencies,
): AuditTrailRepository {
  return (
    dependencies.repository ??
    new PostgresAuditTrailRepository(createDirectPostgresExecutor(env))
  );
}
