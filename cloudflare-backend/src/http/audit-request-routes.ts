/**
 * Audit-request routes.
 *
 * When mounted under /api/v1 in app.ts the full paths become:
 *   POST   /api/v1/audit-requests         — public lead capture
 *   GET    /api/v1/audit-requests         — platform-admin list
 *   GET    /api/v1/audit-requests/:id     — platform-admin get by id
 *   PATCH  /api/v1/audit-requests/:id     — platform-admin update
 *
 * Mirrors backend/app/api/v1/audit_requests.py (FastAPI).
 */

import { Hono } from "hono";
import { z } from "zod";
import { PostgresAuditRequestsRepository } from "../adapters/db/audit-requests";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { CloudflareTurnstileVerifier } from "../adapters/security/turnstile";
import type {
  AuditRequestsRepository,
  ListAuditRequestsInput,
} from "../domain/audit-requests/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { HttpError, errorResponse } from "./errors";

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type TurnstileVerifier = {
  verify(input: {
    token: string | null;
    remoteIp: string | null;
  }): Promise<boolean>;
};

export type AuditRequestRouteDependencies = {
  repository?: AuditRequestsRepository;
  turnstile?: TurnstileVerifier;
  auth?: AuthMiddlewareOptions;
};

// ── Schemas ───────────────────────────────────────────────────────────────────

const auditRequestStatusEnum = z.enum([
  "pending",
  "contacted",
  "scheduled",
  "in_progress",
  "completed",
  "converted",
  "rejected",
]);

const createAuditRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  company: z.string().trim().min(1).max(200),
  building_count: z.number().int().gt(0).lte(1000),
  phone: z.string().max(50).nullable().optional(),
  portfolio_sqft: z.number().int().gt(0).nullable().optional(),
  current_system: z.string().max(100).nullable().optional(),
  message: z.string().nullable().optional(),
  source: z.string().max(100).nullable().optional(),
  referral_code: z.string().max(50).nullable().optional(),
  turnstile_token: z.string().max(2048).nullable().optional(),
  company_website: z.string().max(200).nullable().optional(),
});

const listAuditRequestsQuerySchema = z.object({
  status: auditRequestStatusEnum.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const updateAuditRequestSchema = z.object({
  status: auditRequestStatusEnum.optional(),
  notes: z.string().nullable().optional(),
  estimated_recovery: z.number().int().gt(0).optional(),
  assigned_to: z.string().uuid().optional(),
});

const uuidSchema = z.string().uuid("Invalid UUID");

// ── Helpers ───────────────────────────────────────────────────────────────────

function clientIp(headers: Headers): string | null {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function parseJsonBody(c: {
  req: { json: () => Promise<unknown> };
}): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

// ── Timestamp map for status transitions ──────────────────────────────────────

function statusTimestampField(
  status: z.infer<typeof auditRequestStatusEnum>,
): "contacted_at" | "scheduled_at" | "completed_at" | "converted_at" | null {
  switch (status) {
    case "contacted":
      return "contacted_at";
    case "scheduled":
      return "scheduled_at";
    case "completed":
      return "completed_at";
    case "converted":
      return "converted_at";
    default:
      return null;
  }
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createAuditRequestRoutes(
  dependencies: AuditRequestRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  // ── POST /audit-requests (public) ─────────────────────────────────────────

  app.post("/audit-requests", async (c) => {
    const raw = await parseJsonBody(c);
    let payload: z.infer<typeof createAuditRequestSchema>;
    try {
      payload = createAuditRequestSchema.parse(raw);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Validation error",
        );
      }
      throw err;
    }

    const email = payload.email.toLowerCase();

    // Honeypot: company_website filled → synthetic 201, no DB write
    if (payload.company_website) {
      const now = new Date().toISOString();
      return c.json(
        {
          id: crypto.randomUUID(),
          name: payload.name,
          email,
          company: payload.company,
          building_count: payload.building_count,
          phone: payload.phone ?? null,
          portfolio_sqft: payload.portfolio_sqft ?? null,
          current_system: payload.current_system ?? null,
          message: payload.message ?? null,
          source: payload.source ?? null,
          status: "pending",
          notes: null,
          estimated_recovery: null,
          assigned_to: null,
          organization_id: null,
          contacted_at: null,
          scheduled_at: null,
          completed_at: null,
          converted_at: null,
          created_at: now,
          updated_at: now,
        },
        201,
      );
    }

    // Turnstile verification
    const turnstile =
      dependencies.turnstile ?? new CloudflareTurnstileVerifier(c.env);
    const ok = await turnstile.verify({
      token: payload.turnstile_token ?? null,
      remoteIp: clientIp(c.req.raw.headers),
    });
    if (!ok) {
      throw new HttpError(
        403,
        "verification_failed",
        "Verification failed. Please try again.",
      );
    }

    // Rate limit: max 3 per email per 24h
    const windowStartIso = new Date(
      Date.now() - 24 * 3600 * 1000,
    ).toISOString();
    const repository = resolveRepository(c.env, dependencies);
    const count = await repository.countRecentByEmail(email, windowStartIso);
    if (count >= 3) {
      throw new HttpError(
        429,
        "rate_limit_exceeded",
        "Rate limit exceeded: maximum 3 audit requests per email per day",
      );
    }

    // Insert
    const created = await repository.createAuditRequest({
      name: payload.name,
      email,
      company: payload.company,
      building_count: payload.building_count,
      phone: payload.phone ?? null,
      portfolio_sqft: payload.portfolio_sqft ?? null,
      current_system: payload.current_system ?? null,
      message: payload.message ?? null,
      source: payload.source ?? null,
      referral_code: payload.referral_code ?? null,
      status: "pending",
    });

    if (!created) {
      throw new HttpError(
        500,
        "create_failed",
        "Failed to create audit request",
      );
    }

    return c.json(created, 201);
  });

  // ── GET /audit-requests (platform admin) ─────────────────────────────────

  app.get("/audit-requests", authMiddleware(dependencies.auth), async (c) => {
    const actor = c.get("auth").actor;
    if (!actor.isServiceAdmin) {
      throw new HttpError(
        403,
        "platform_admin_required",
        "platform_admin_required",
      );
    }

    const rawQuery = c.req.query();
    let params: z.infer<typeof listAuditRequestsQuerySchema>;
    try {
      params = listAuditRequestsQuerySchema.parse(rawQuery);
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

    const offset = (params.page - 1) * params.per_page;
    const repository = resolveRepository(c.env, dependencies);
    const listInput: ListAuditRequestsInput = {
      offset,
      limit: params.per_page,
    };
    if (params.status !== undefined) listInput.statusFilter = params.status;
    const rows = await repository.listAuditRequests(listInput);

    return c.json(rows);
  });

  // ── GET /audit-requests/:id (platform admin) ──────────────────────────────

  app.get(
    "/audit-requests/:id",
    authMiddleware(dependencies.auth),
    async (c) => {
      const actor = c.get("auth").actor;
      if (!actor.isServiceAdmin) {
        throw new HttpError(
          403,
          "platform_admin_required",
          "platform_admin_required",
        );
      }

      const idParam = c.req.param("id");
      let id: string;
      try {
        id = uuidSchema.parse(idParam);
      } catch {
        throw new HttpError(400, "validation_error", "Invalid UUID");
      }

      const repository = resolveRepository(c.env, dependencies);
      const row = await repository.getAuditRequestById(id);
      if (!row) {
        throw new HttpError(404, "not_found", "Audit request not found");
      }

      return c.json(row);
    },
  );

  // ── PATCH /audit-requests/:id (platform admin) ────────────────────────────

  app.patch(
    "/audit-requests/:id",
    authMiddleware(dependencies.auth),
    async (c) => {
      const actor = c.get("auth").actor;
      if (!actor.isServiceAdmin) {
        throw new HttpError(
          403,
          "platform_admin_required",
          "platform_admin_required",
        );
      }

      const idParam = c.req.param("id");
      let id: string;
      try {
        id = uuidSchema.parse(idParam);
      } catch {
        throw new HttpError(400, "validation_error", "Invalid UUID");
      }

      const raw = await parseJsonBody(c);
      let body: z.infer<typeof updateAuditRequestSchema>;
      try {
        body = updateAuditRequestSchema.parse(raw);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const firstIssue = err.issues[0];
          throw new HttpError(
            400,
            "validation_error",
            firstIssue?.message ?? "Validation error",
          );
        }
        throw err;
      }

      // Build update fields
      const fields: import("../domain/audit-requests/repository").UpdateAuditRequestFields =
        {};
      let hasUpdates = false;

      if (body.status !== undefined) {
        fields.status = body.status;
        const tsField = statusTimestampField(body.status);
        if (tsField !== null) {
          fields[tsField] = new Date().toISOString();
        }
        hasUpdates = true;
      }

      if (body.notes !== undefined) {
        fields.notes = body.notes;
        hasUpdates = true;
      }

      if (body.estimated_recovery !== undefined) {
        fields.estimated_recovery = body.estimated_recovery;
        hasUpdates = true;
      }

      if (body.assigned_to !== undefined) {
        fields.assigned_to = body.assigned_to;
        hasUpdates = true;
      }

      if (!hasUpdates) {
        throw new HttpError(400, "no_updates", "No updates provided");
      }

      const repository = resolveRepository(c.env, dependencies);
      const updated = await repository.updateAuditRequest(id, fields);
      if (!updated) {
        throw new HttpError(404, "not_found", "Audit request not found");
      }

      return c.json(updated);
    },
  );

  return app;
}

// ── DI helper ─────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: AuditRequestRouteDependencies,
): AuditRequestsRepository {
  return (
    dependencies.repository ??
    new PostgresAuditRequestsRepository(createDirectPostgresExecutor(env))
  );
}
