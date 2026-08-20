/**
 * GL Narrative Analysis routes — three endpoints ported from FastAPI.
 *
 * FastAPI source: backend/app/api/v1/analysis.py lines 315-456
 *
 * Route 1: POST /analysis/gl-narrative          (run/generate, LLM)
 * Route 2: GET  /analysis/gl-narrative/:pid/:yr  (fetch latest)
 * Route 3: POST /analysis/gl-narrative/:id/dismiss
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresAnalysisRepository } from "../adapters/db/analysis";
import {
  createOpenRouterClient,
  DEFAULT_OPENROUTER_PROVIDER_CONFIG,
  OpenRouterApiError,
  type OpenRouterChatMessage,
  type OpenRouterChatResponse,
  type OpenRouterClient,
} from "../adapters/ai/openrouter";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type {
  AnalysisRepository,
  GlAnalysisResult,
} from "../domain/analysis/repository";
import {
  aggregateAccounts,
  buildGlAnalysisUserMessage,
  detectAnomalies,
  GL_ANALYSIS_SYSTEM_PROMPT,
  type GlNarrativeEntry,
} from "../domain/analysis/gl-narrative-prompt";
import { createExtractionModelConfig } from "../domain/extraction/model-config";
import type { AppEnv } from "../env";
import { scheduleBestEffort } from "../platform/best-effort";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type GlNarrativeRouteDependencies = {
  repository?: AnalysisRepository;
  auth?: AuthMiddlewareOptions;
  openRouter?: OpenRouterClient | undefined;
};

const uuidSchema = z.string().uuid();
const yearSchema = z.coerce.number().int().min(1990).max(2100);

const glNarrativeRequestSchema = z.object({
  property_id: uuidSchema,
  period_year: z.number().int().min(1990).max(2100),
});

export function createGlNarrativeRoutes(
  dependencies: GlNarrativeRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/analysis/*", authMiddleware(dependencies.auth));

  // -------------------------------------------------------------------------
  // Route 1: POST /analysis/gl-narrative
  // Auth: requireEditor (403) then requireFullAccess (402)
  // FastAPI: analysis.py:315-370
  // -------------------------------------------------------------------------
  app.post("/analysis/gl-narrative", async (c) => {
    requireEditor(c);
    await requireFullAccess(c, dependencies);

    const body = glNarrativeRequestSchema.parse(await c.req.json());
    const auth = c.get("auth").actor;
    const repository = resolveRepository(c.env, dependencies);

    try {
      // 1. Verify property exists and belongs to this org (404 if not)
      const propertyName = await repository.getPropertyName({
        propertyId: body.property_id,
        organizationId: auth.organizationId,
      });
      if (propertyName === null) {
        throw new HttpError(
          404,
          "property_not_found",
          `Property ${body.property_id} not found`,
        );
      }

      // 2. Fetch GL entries (widened: includes vendor_name, description, transaction_date)
      const glEntries = await repository.listGlEntries({
        propertyId: body.property_id,
        year: body.period_year,
        organizationId: auth.organizationId,
      });

      // 3. Fetch expense pools with pool_type for context
      const expensePools = await repository.listExpensePoolsWithType({
        propertyId: body.property_id,
        organizationId: auth.organizationId,
      });

      // 4. Anomaly detection BEFORE aggregation (order matters —
      //    aggregation caps descriptions to 3, which buries cross-property entries)
      const anomalies = detectAnomalies(glEntries as GlNarrativeEntry[], null);

      // 5. Aggregate accounts
      const accounts = aggregateAccounts(glEntries as GlNarrativeEntry[]);

      // 6. Build user message (anomalies omitted when empty)
      const userMessage = buildGlAnalysisUserMessage({
        property_name: propertyName,
        period_year: body.period_year,
        total_gl_entries: glEntries.length,
        expense_pools: expensePools,
        accounts,
        anomalies: anomalies.length > 0 ? anomalies : null,
      });

      // 7. Call OpenRouter via raw chat() — NO responseFormat (markdown output,
      //    not JSON). extractText/requestJson both force json_object which would
      //    corrupt the markdown contract. See openrouter.ts:169,207.
      const modelConfig = createExtractionModelConfig(c.env);
      const glAnalysisRoute = modelConfig.glAnalysis;
      const client = resolveOpenRouterClient(c.env, dependencies);
      const messages: OpenRouterChatMessage[] = [
        { role: "system", content: GL_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ];

      const chatResponse = await runGlNarrativeChat({
        client,
        model: glAnalysisRoute.model,
        fallbackModels: glAnalysisRoute.fallbackModels,
        messages,
        // NO responseFormat — markdown output
      });

      const analysisMarkdown = chatResponse.content;
      // Token accounting: client total → token_input; token_output = 0
      const tokenInput = chatResponse.tokensUsed;
      const tokenOutput = 0;

      // 8. Persist result
      const now = new Date().toISOString();
      const row = await repository.insertGlAnalysisResult({
        organizationId: auth.organizationId,
        propertyId: body.property_id,
        periodYear: body.period_year,
        analysisMarkdown,
        tokenInput,
        tokenOutput,
        ranAt: now,
        ranByUserId: auth.userId,
      });

      // 9. Record feature use (errors swallowed — matches FastAPI behavior)
      schedule(
        c,
        repository.recordFeatureUse({
          organizationId: auth.organizationId,
          featureKey: "ai_gl_narrative_analysis",
        }),
      );

      const result: GlAnalysisResult = row;
      return c.json({ result, gl_entry_count: glEntries.length }, 200);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes("not found")) {
          throw new HttpError(404, "property_not_found", msg);
        }
        if (error.constructor.name === "ZodError") {
          throw new HttpError(400, "invalid_request", msg);
        }
        throw new HttpError(
          500,
          "gl_analysis_failed",
          `Failed to run GL analysis: ${msg}`,
        );
      }
      throw new HttpError(
        500,
        "gl_analysis_failed",
        "Failed to run GL analysis: unknown error",
      );
    }
  });

  // -------------------------------------------------------------------------
  // Route 2: GET /analysis/gl-narrative/:property_id/:period_year
  // Auth: authMiddleware only (no editor, no full-access gate)
  // Returns 200 with null body when no narrative exists (NOT 404)
  // FastAPI: analysis.py:373-413
  // -------------------------------------------------------------------------
  app.get("/analysis/gl-narrative/:property_id/:period_year", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("property_id"));
    const periodYear = yearSchema.parse(c.req.param("period_year"));
    const auth = c.get("auth").actor;
    const repository = resolveRepository(c.env, dependencies);

    try {
      const row = await repository.getLatestGlAnalysis({
        organizationId: auth.organizationId,
        propertyId,
        periodYear,
      });
      // Return 200 with null when no analysis exists — absence is normal, not a 404
      return c.json(row ?? null, 200);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new HttpError(
        500,
        "gl_analysis_failed",
        `Failed to retrieve GL analysis: ${msg}`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // Route 3: POST /analysis/gl-narrative/:analysis_id/dismiss
  // Auth: requireEditor (403) then requireFullAccess (402)
  // FastAPI: analysis.py:416-456
  // -------------------------------------------------------------------------
  app.post("/analysis/gl-narrative/:analysis_id/dismiss", async (c) => {
    requireEditor(c);
    await requireFullAccess(c, dependencies);

    const analysisId = uuidSchema.parse(c.req.param("analysis_id"));
    const auth = c.get("auth").actor;
    const repository = resolveRepository(c.env, dependencies);

    try {
      const now = new Date().toISOString();
      const row = await repository.dismissGlAnalysis({
        organizationId: auth.organizationId,
        analysisId,
        dismissedAt: now,
        dismissedByUserId: auth.userId,
      });
      return c.json(row, 200);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes("not found")) {
          throw new HttpError(
            404,
            "gl_analysis_not_found",
            `GL analysis ${analysisId} not found`,
          );
        }
        throw new HttpError(
          500,
          "gl_analysis_failed",
          `Failed to dismiss GL analysis: ${msg}`,
        );
      }
      throw new HttpError(
        500,
        "gl_analysis_failed",
        `Failed to dismiss GL analysis: unknown error`,
      );
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRepository(
  env: AppEnv,
  dependencies: GlNarrativeRouteDependencies,
): AnalysisRepository {
  return (
    dependencies.repository ??
    new PostgresAnalysisRepository(createDirectPostgresExecutor(env))
  );
}

function resolveOpenRouterClient(
  env: AppEnv,
  dependencies: GlNarrativeRouteDependencies,
): OpenRouterClient {
  return dependencies.openRouter ?? createOpenRouterClient(env);
}

async function runGlNarrativeChat(input: {
  client: OpenRouterClient;
  model: string;
  fallbackModels: string[];
  messages: OpenRouterChatMessage[];
}): Promise<OpenRouterChatResponse> {
  try {
    return await input.client.chat({
      model: input.model,
      temperature: 0,
      fallbackModels: input.fallbackModels,
      provider: DEFAULT_OPENROUTER_PROVIDER_CONFIG,
      messages: input.messages,
      // NO responseFormat - markdown output
    });
  } catch (error) {
    if (!shouldRetryGlNarrativeChat(error) || input.fallbackModels.length < 1) {
      throw error;
    }

    return input.client.chat({
      model: input.fallbackModels[0]!,
      temperature: 0,
      fallbackModels: input.fallbackModels.slice(1),
      provider: DEFAULT_OPENROUTER_PROVIDER_CONFIG,
      messages: input.messages,
      // NO responseFormat - markdown output
    });
  }
}

function shouldRetryGlNarrativeChat(error: unknown): boolean {
  if (error instanceof OpenRouterApiError) {
    return (
      error.status === 408 ||
      error.status === 429 ||
      error.status === 500 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504
    );
  }

  return false;
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

async function requireFullAccess(
  c: RouteContext,
  dependencies: GlNarrativeRouteDependencies,
): Promise<void> {
  const hasAccess = await resolveRepository(c.env, dependencies).hasFullAccess(
    c.get("auth").actor.organizationId,
  );
  if (hasAccess) {
    return;
  }
  throw new HttpError(
    402,
    "subscription_required",
    "subscription_required: An active subscription or trial is required.",
  );
}

function schedule(c: RouteContext, promise: Promise<void>): void {
  scheduleBestEffort(c, promise, {
    operation: "worker.best_effort.gl_narrative",
  });
}
