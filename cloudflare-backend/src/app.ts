import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateDatabaseEnvironment } from "./adapters/db/client";
import type { AppEnv } from "./env";
import { createActualBilledRoutes } from "./http/actual-billed-routes";
import { createAnalysisRoutes } from "./http/analysis-routes";
import { createAuthLifecycleRoutes } from "./http/auth-lifecycle-routes";
import { createAiCsRoutes } from "./http/ai-cs-routes";
import { createAiSdrRoutes } from "./http/ai-sdr-routes";
import { createBillingRoutes } from "./http/billing-routes";
import { createBootstrapRoutes } from "./http/bootstrap-routes";
import { createComparisonRoutes } from "./http/comparison-routes";
import { createContactRequestRoutes } from "./http/contact-request-routes";
import { createCoreDataRoutes } from "./http/core-data-routes";
import { createDocumentExtractionRoutes } from "./http/document-extraction-routes";
import { errorResponse } from "./http/errors";
import { createFeedbackRoutes } from "./http/feedback-routes";
import { createIngestionRoutes } from "./http/ingestion-routes";
import { createLeadRoutes } from "./http/leads-routes";
import { createOnboardRoutes } from "./http/onboard-routes";
import { createOrganizationRoutes } from "./http/organization-routes";
import { createPoolConfigRoutes } from "./http/pool-config-routes";
import { createPoolTemplateRoutes } from "./http/pool-template-routes";
import { createPortfolioRoutes } from "./http/portfolio-routes";
import { createReconciliationRoutes } from "./http/reconciliation-routes";
import { createRentRollRoutes } from "./http/rent-roll-routes";
import { createStripeWebhookRoutes } from "./http/stripe-webhook-routes";
import { createResendWebhookRoutes } from "./http/resend-webhook-routes";
import { createTeamRoutes } from "./http/team-routes";
import { createTenantAuthRoutes } from "./http/tenant-auth-routes";
import { createTenantDisputesRoutes } from "./http/tenant-disputes-routes";
import { createTenantPortalRoutes } from "./http/tenant-portal-routes";
import { createExportsRoutes } from "./http/exports-routes";
import { createDetailAdvisorRoutes } from "./http/export-detail-advisor-routes";
import { createHistoricalXlsxRoutes } from "./http/historical-xlsx-routes";
import { createHistoricalPdfRoutes } from "./http/historical-pdf-routes";
import { createDenominatorChangePdfRoutes } from "./http/denominator-change-pdf-routes";
import { createDenominatorChangeRoutes } from "./http/denominator-change-routes";
import { createAuditTrailRoutes } from "./http/audit-trail-routes";
import { createAuditRequestRoutes } from "./http/audit-request-routes";
import { createSb1103Routes } from "./http/sb1103-routes";
import { createCampaignsRoutes } from "./http/campaigns-routes";
import { createGlNarrativeRoutes } from "./http/gl-narrative-routes";
import { createDisputesAdminRoutes } from "./http/disputes-admin-routes";
import { createCrossDocAnalysisRoutes } from "./http/cross-doc-analysis-routes";
import { createCapExRoutes } from "./http/capex-routes";
import { createTaxProtestRoutes } from "./http/tax-protest-routes";
import { createToolsRoutes } from "./http/tools-routes";
import { healthResponseSchema } from "./http/validation";
import type { AuthVariables } from "./middleware/auth";
import { validateRuntimeEnvironment } from "./platform/cloudflare";

// Production browser origins permitted to call this API cross-origin.
// Mirrors backend/app/config.py _PRODUCTION_ORIGINS (apex, www, app).
const ALLOWED_CORS_ORIGINS = [
  "https://capveri.com",
  "https://www.capveri.com",
  "https://app.capveri.com",
];
const DEVELOPMENT_CORS_ORIGIN_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function allowedCorsOrigin(
  origin: string,
  environment: string,
): string | undefined {
  if (ALLOWED_CORS_ORIGINS.includes(origin)) {
    return origin;
  }

  if (
    environment === "development" &&
    DEVELOPMENT_CORS_ORIGIN_PATTERN.test(origin)
  ) {
    return origin;
  }

  return undefined;
}

export function createApp(): Hono<{
  Bindings: AppEnv;
  Variables: AuthVariables;
}> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.onError((error, c) => errorResponse(c, error));

  // CORS must run before env validation and route auth so cross-origin
  // browser preflights (OPTIONS) short-circuit cleanly. The app frontend
  // (app.capveri.com) and marketing site (capveri.com / www.capveri.com)
  // call this Worker directly cross-origin, so they require explicit
  // CORS headers. Mirrors the prior FastAPI CORSMiddleware whitelist
  // (allow_credentials, expose Content-Disposition for file downloads).
  app.use(
    "*",
    cors({
      origin: (origin, c) => allowedCorsOrigin(origin, c.env.ENVIRONMENT),
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      // Reflect whatever request headers the browser asks for (mirrors the
      // prior FastAPI allow_headers=["*"]). The frontend sends non-simple
      // headers beyond Content-Type/Authorization (e.g. X-Correlation-ID
      // from src/api/client.ts); pinning an explicit list would block them
      // at preflight. Origin is already whitelisted above, so reflecting
      // requested headers does not widen cross-origin exposure.
      exposeHeaders: ["Content-Disposition"],
      maxAge: 86400,
    }),
  );

  app.use("*", async (c, next) => {
    validateRuntimeEnvironment(c.env);
    validateDatabaseEnvironment(c.env);
    await next();
  });

  app.get("/health", (c) => {
    const body = healthResponseSchema.parse({
      status: "healthy",
      version: c.env.APP_VERSION,
      environment: c.env.ENVIRONMENT,
      runtime: "cloudflare-workers",
      capabilities: {
        terminal_document_delete: true,
      },
    });

    return c.json(body);
  });

  app.route("/", createStripeWebhookRoutes());
  app.route("/", createResendWebhookRoutes());
  app.route("/api/v1", createActualBilledRoutes());
  app.route("/api/v1", createAnalysisRoutes());
  app.route("/api/v1", createGlNarrativeRoutes());
  app.route("/api/v1", createAuthLifecycleRoutes());
  app.route("/api/v1", createAiSdrRoutes());
  app.route("/api/v1", createAiCsRoutes());
  app.route("/api/v1", createDocumentExtractionRoutes());
  app.route("/api/v1", createContactRequestRoutes());
  app.route("/api/v1", createCoreDataRoutes());
  app.route("/api/v1", createBillingRoutes());
  app.route("/api/v1", createBootstrapRoutes());
  app.route("/api/v1", createComparisonRoutes());
  app.route("/api/v1", createFeedbackRoutes());
  app.route("/api/v1", createIngestionRoutes());
  app.route("/api/v1", createOrganizationRoutes());
  app.route("/api/v1", createOnboardRoutes());
  app.route("/api/v1", createPoolConfigRoutes());
  app.route("/api/v1", createPoolTemplateRoutes());
  app.route("/api/v1", createPortfolioRoutes());
  app.route("/api/v1", createReconciliationRoutes());
  app.route("/api/v1", createRentRollRoutes());
  app.route("/api/v1", createTeamRoutes());
  app.route("/api/v1", createTenantAuthRoutes());
  app.route("/api/v1", createTenantDisputesRoutes());
  app.route("/api/v1", createTenantPortalRoutes());
  app.route("/api/v1", createExportsRoutes());
  app.route("/api/v1", createDetailAdvisorRoutes());
  app.route("/api/v1", createHistoricalXlsxRoutes());
  app.route("/api/v1", createHistoricalPdfRoutes());
  app.route("/api/v1", createDenominatorChangePdfRoutes());
  app.route("/api/v1", createDenominatorChangeRoutes());
  app.route("/api/v1", createAuditTrailRoutes());
  app.route("/api/v1", createToolsRoutes());
  app.route("/api/v1", createLeadRoutes());
  app.route("/api/v1", createAuditRequestRoutes());
  app.route("/api/v1", createSb1103Routes());
  app.route("/api/v1", createTaxProtestRoutes());
  app.route("/api/v1", createCampaignsRoutes());
  app.route("/api/v1", createDisputesAdminRoutes());
  app.route("/api/v1", createCrossDocAnalysisRoutes());
  app.route("/api/v1", createCapExRoutes());

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: "not_found",
          message: "Route not found",
        },
      },
      404,
    ),
  );

  return app;
}
