/**
 * Raised when the Supabase session-mode pooler rejects new clients because its
 * pool_size cap is reached, and retries with backoff did not clear it. The HTTP
 * layer maps this to a 503 (retryable) rather than a generic 500: no statement
 * ran, so there is no partial work and the caller can safely retry.
 *
 * This lives in a dependency-free leaf module so that both the postgres adapter
 * (which throws it) and the HTTP error mapper in `http/errors.ts` (which catches
 * it) can import it without forming an import cycle. Importing it from
 * `postgres.ts` into `errors.ts` created the cycle
 *   errors.ts -> postgres.ts -> platform/cloudflare.ts -> http/errors.ts
 * which, at module-evaluation time, left `HttpError` undefined when
 * `ConfigError extends HttpError` ran ("Class extends value undefined").
 */
export class PoolExhaustionError extends Error {
  constructor(cause: unknown) {
    super("Database connection pool is temporarily exhausted");
    this.name = "PoolExhaustionError";
    this.cause = cause;
  }
}
