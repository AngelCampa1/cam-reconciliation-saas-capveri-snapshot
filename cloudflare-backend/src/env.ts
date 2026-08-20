import type {
  AnalyticsQueueMessage,
  EmailQueueMessage,
  ExportQueueMessage,
  ExtractionQueueMessage,
  ReconciliationQueueMessage,
} from "./queues/messages";

export type RuntimeSecrets = {
  OPENROUTER_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  CHECKOUT_OFFER_TOKEN_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_WEBHOOK_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  DOCUMENT_ACCESS_SIGNING_SECRET: string;
  UNSUBSCRIBE_HMAC_SECRET: string;
  AI_SDR_PRODUCT_CONTEXT_SECRET?: string;
  AI_SDR_CONTEXT_SECRET?: string;
  AI_CS_CONTEXT_SECRET?: string;
  PROD_E2E_FIXTURE_SECRET?: string;
  SENTRY_DSN?: string;
  /**
   * Shared HMAC secret used to mint short-lived client assertions for the
   * browser AI-CS widget. The browser never holds this secret: it calls the
   * authenticated `POST /api/v1/ai-cs/sign` BFF, which signs each request with
   * this secret. The ai-cs-worker verifies those signatures with the same
   * secret (its `AI_CS_CLIENT_ASSERTION_SECRET`). Set via `wrangler secret put`.
   */
  AI_CS_CLIENT_ASSERTION_SECRET?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AUTH_JWKS_URL?: string;
  AUTH_JWT_AUDIENCE?: string;
  AUTH_JWT_ISSUER?: string;
};

export type RuntimeBindings = {
  DB_ACCESS_MODE?: "direct-postgres" | "postgrest-compat";
  DB_PRODUCTION_BOUNDARY?: "direct-postgres" | "postgrest-compat";
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_APP_URL?: string;
  APP_BASE_URL?: string;
  MARKETING_BASE_URL?: string;
  ADMIN_NOTIFICATION_EMAIL?: string;
  RESEND_FROM_ADDRESS?: string;
  RESEND_API_BASE_URL?: string;
  POSTHOG_PROJECT_API_KEY?: string;
  POSTHOG_HOST?: string;
  STRIPE_80OFF_COUPON_ID?: string;
  STRIPE_FREE_AUDIT_COUPON_OFFER_50?: string;
  STRIPE_FREE_AUDIT_COUPON_OFFER_FREE?: string;
  STRIPE_SAVE_OFFER_COUPON_ID_ANNUAL?: string;
  STRIPE_PRICE_ID_RECONCILE_ANNUAL?: string;
  STRIPE_PRODUCT_ID_RECONCILE?: string;
  EXTRACTION_PRIMARY_MODEL?: string;
  EXTRACTION_PRIMARY_FALLBACK?: string;
  EXTRACTION_PRIMARY_FALLBACK_2?: string;
  EXTRACTION_SIBLING_MODEL?: string;
  EXTRACTION_SIBLING_FALLBACK?: string;
  EXTRACTION_SIBLING_FALLBACK_2?: string;
  EXTRACTION_JUDGE_MODEL?: string;
  EXTRACTION_JUDGE_FALLBACK?: string;
  EXTRACTION_JUDGE_FALLBACK_2?: string;
  GAP_FILLER_MODEL?: string;
  GAP_FILLER_FALLBACK?: string;
  GAP_FILLER_FALLBACK_2?: string;
  VALIDATION_REPROMPT_MODEL?: string;
  VALIDATION_REPROMPT_FALLBACK?: string;
  VALIDATION_REPROMPT_FALLBACK_2?: string;
  CROSS_DOC_MODEL?: string;
  CROSS_DOC_FALLBACK?: string;
  CROSS_DOC_FALLBACK_2?: string;
  GL_ANALYSIS_MODEL?: string;
  GL_ANALYSIS_FALLBACK?: string;
  GL_ANALYSIS_FALLBACK_2?: string;
  POOL_MATCHING_MODEL?: string;
  POOL_MATCHING_FALLBACK?: string;
  POOL_MATCHING_FALLBACK_2?: string;
  EXTRACTION_MAX_DOCUMENT_CHARS?: string;
  DATABASE_URL?: string;
  TURNSTILE_SITEVERIFY_URL?: string;
  SEQUENCER_BASE_URL?: string;
  SEQUENCER_CF_ACCESS_CLIENT_ID?: string;
  SEQUENCER_CF_ACCESS_CLIENT_SECRET?: string;
  POSTGREST_URL?: string;
  SUPABASE_URL?: string;
  LOCAL_E2E_INLINE_EXTRACTION_QUEUE?: string;
  LOCAL_E2E_INLINE_RECONCILIATION_QUEUE?: string;
  HYPERDRIVE?: Hyperdrive;
  DOCUMENTS_BUCKET: R2Bucket;
  LEAD_MAGNETS_BUCKET: R2Bucket;
  REPORTS_BUCKET?: R2Bucket;
  EXTRACTION_QUEUE: Queue<ExtractionQueueMessage>;
  RECONCILIATION_QUEUE: Queue<ReconciliationQueueMessage>;
  EXPORT_QUEUE: Queue<ExportQueueMessage>;
  EMAIL_QUEUE: Queue<EmailQueueMessage>;
  ANALYTICS_QUEUE: Queue<AnalyticsQueueMessage>;
  RATE_LIMITER: DurableObjectNamespace;
  AI_CONTEXT_NONCES: DurableObjectNamespace;
};

export type Bindings = Cloudflare.Env & RuntimeBindings & RuntimeSecrets;

export type AppEnv = Bindings;
