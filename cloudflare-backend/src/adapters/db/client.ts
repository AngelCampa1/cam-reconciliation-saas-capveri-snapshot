import { ConfigError } from "../../platform/cloudflare";
import {
  createDirectPostgresExecutor,
  DirectPostgresAdapter,
  type PostgresExecutor,
  type PostgresExecutorFactory,
} from "./postgres";
import {
  PostgrestCompatAdapter,
  type PostgrestFetcher,
} from "./supabase-compat";
import type { ActorContext, DbAdapter, DbAccessMode } from "./transaction";

export type { ActorContext, DbAdapter, DbAccessMode };
export type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
  TenantUserProfile,
  UserProfile,
} from "./transaction";

export type DbClientEnv = {
  ENVIRONMENT?: string;
  DB_ACCESS_MODE?: DbAccessMode;
  DB_PRODUCTION_BOUNDARY?: DbAccessMode;
  DATABASE_URL?: string;
  HYPERDRIVE?: Hyperdrive;
  POSTGREST_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type DbClientBackend = Partial<
  | {
      mode: "direct-postgres";
      executor: PostgresExecutor;
      executorFactory?: PostgresExecutorFactory;
    }
  | {
      mode: "postgrest-compat";
      fetcher: PostgrestFetcher;
      baseUrl: string;
    }
>;

export function resolveDbAccessMode(env: DbClientEnv): DbAccessMode {
  if (env.DB_ACCESS_MODE === "direct-postgres") {
    return "direct-postgres";
  }

  if (env.DB_ACCESS_MODE === "postgrest-compat") {
    return "postgrest-compat";
  }

  if (env.ENVIRONMENT === "production") {
    throw new ConfigError("Missing required runtime binding: DB_ACCESS_MODE");
  }

  return "postgrest-compat";
}

export function validateDatabaseEnvironment(env: DbClientEnv): void {
  const mode = resolveDbAccessMode(env);

  if (env.ENVIRONMENT === "production" && env.DB_PRODUCTION_BOUNDARY !== mode) {
    throw new ConfigError(
      `DB_PRODUCTION_BOUNDARY must confirm ${mode} before production database access`,
    );
  }

  if (env.ENVIRONMENT !== "production") {
    return;
  }

  if (mode === "direct-postgres" && !env.HYPERDRIVE) {
    throw new ConfigError(
      "HYPERDRIVE binding is required for direct-postgres in production",
    );
  }

  if (mode === "postgrest-compat") {
    if (!env.POSTGREST_URL) {
      throw new ConfigError(
        "POSTGREST_URL is required for postgrest-compat in production",
      );
    }

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ConfigError(
        "SUPABASE_SERVICE_ROLE_KEY is required for postgrest-compat in production",
      );
    }
  }
}

export function createDbAdapter(
  env: DbClientEnv,
  backend: DbClientBackend = {},
): DbAdapter {
  const mode = resolveDbAccessMode(env);
  validateDatabaseEnvironment(env);

  if (backend.mode && mode !== backend.mode) {
    throw new ConfigError(
      `DB_ACCESS_MODE ${mode} does not match configured backend ${backend.mode}`,
    );
  }

  if (mode === "direct-postgres") {
    const executor =
      backend.mode === "direct-postgres" && backend.executor
        ? backend.executor
        : createDirectPostgresExecutor(
            env,
            backend.mode === "direct-postgres"
              ? backend.executorFactory
              : undefined,
          );

    return new DirectPostgresAdapter(executor);
  }

  const fetcher =
    backend.mode === "postgrest-compat" && backend.fetcher
      ? backend.fetcher
      : async (request: { url: string; init: RequestInit }) =>
          fetch(request.url, request.init);
  const baseUrl =
    backend.mode === "postgrest-compat" && backend.baseUrl
      ? backend.baseUrl
      : env.POSTGREST_URL;

  if (!baseUrl) {
    throw new ConfigError(
      "POSTGREST_URL is required for postgrest-compat mode",
    );
  }

  return new PostgrestCompatAdapter(
    baseUrl,
    fetcher,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
