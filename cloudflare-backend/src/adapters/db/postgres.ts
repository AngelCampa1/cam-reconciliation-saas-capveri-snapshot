import postgres from "postgres";
import { ConfigError } from "../../platform/cloudflare";
import { PoolExhaustionError } from "./pool-exhaustion-error";
import { NumericOverflowError } from "./numeric-overflow-error";
import { StringTooLongError } from "./string-truncation-error";
import {
  assertActorContext,
  type ActorContext,
  type AuthenticatedUserContext,
  type AuthRepository,
  type DbAdapter,
  type ProtectedRecord,
  type ProtectedRecordRepository,
  type QueryResult,
  type UpdateProtectedRecord,
} from "./transaction";

export type PostgresExecutor = {
  query<Row>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result>;
};

export type DirectPostgresEnv = {
  ENVIRONMENT?: string;
  DATABASE_URL?: string;
  HYPERDRIVE?: Hyperdrive;
};

export type PostgresExecutorFactory = (
  connectionString: string,
) => PostgresExecutor;

// The Supabase pooler that Hyperdrive fronts (host aws-1-*.pooler.supabase.com,
// port 5432) runs in SESSION mode: it holds one upstream server connection per
// client for the whole session and caps concurrent clients at pool_size (15).
// Under bursty concurrency the cap is hit and the pooler rejects new clients
// with SQLSTATE XX000 / "(EMAXCONNSESSION) max clients reached in session mode".
// Those rejections are transient — a slot frees as soon as an in-flight
// per-request client closes — so retry them with jittered backoff instead of
// surfacing a 500. The durable fix is pointing Hyperdrive at the transaction-
// mode pooler (port 6543), which requires re-supplying the DB credential.
const poolExhaustionMarker = "EMAXCONNSESSION";
const maxPoolRetries = 8;
const basePoolRetryDelayMs = 40;
const maxPoolRetryDelayMs = 750;

function isPoolExhaustionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const message =
    typeof candidate.message === "string" ? candidate.message : "";

  return candidate.code === "XX000" && message.includes(poolExhaustionMarker);
}

// SQLSTATE 22003 = numeric_value_out_of_range: a value does not fit the target
// NUMERIC(precision, scale). On every current write path this is value-driven —
// an oversized / mis-keyed amount or measurement in a plain parameterized column
// write — so the HTTP layer maps it to a 422 rather than an opaque 500, and no
// statement commits (a clean fail-closed). Caveat for future paths: 22003 can
// also come from in-SQL arithmetic (SUM / * / a cast overflowing an intermediate
// numeric), where the bad magnitude is ours, not the caller's; if such a path is
// added, that overflow would be a server bug wrongly downgraded to 422 and it
// would skip Sentry — revisit this mapping before introducing computed-numeric
// writes.
function isNumericOverflowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return (error as { code?: unknown }).code === "22003";
}

// SQLSTATE 22001 = string_data_right_truncation: a text value is longer than its
// target column's character-varying(N) width. On every current write path this
// is value-driven — an over-length field supplied by the caller — so the HTTP
// layer maps it to a 422 rather than an opaque 500, and no statement commits.
// Same caveat as 22003: a future in-SQL narrowing cast (::varchar(n) on a value
// we build) could raise 22001 as a server bug that this would wrongly downgrade
// to 422 and skip Sentry — revisit before adding computed/narrowing string
// writes.
function isStringTooLongError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return (error as { code?: unknown }).code === "22001";
}

async function withPoolExhaustionRetry<Result>(
  run: () => Promise<Result>,
): Promise<Result> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isPoolExhaustionError(error)) {
        if (isNumericOverflowError(error)) {
          throw new NumericOverflowError(error);
        }
        if (isStringTooLongError(error)) {
          throw new StringTooLongError(error);
        }
        throw error;
      }

      if (attempt >= maxPoolRetries) {
        throw new PoolExhaustionError(error);
      }

      const backoff = Math.min(
        basePoolRetryDelayMs * 2 ** attempt,
        maxPoolRetryDelayMs,
      );
      const jitter = Math.floor(Math.random() * basePoolRetryDelayMs);
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }
}

export function createPostgresExecutor(
  connectionString: string,
): PostgresExecutor {
  const sql = postgres(connectionString, {
    // Cap this client's own connection pool at 2. This bounds THIS executor,
    // not the whole request: a handler may build several executors (each its
    // own postgres() client with its own max), so per-request connection use is
    // ultimately governed by the Hyperdrive-fronted pooler, not this number. We
    // keep it low because repositories issue their queries sequentially and the
    // Supabase session-mode pooler's slots (pool_size 15) are the scarce
    // resource; 2 leaves room for the occasional parallel sibling read without
    // any single client hoarding slots.
    max: 2,
    // The pooler does not support named prepared statements, so disable
    // statement preparation. (sql.unsafe() — which every repository uses —
    // already sets this per query, but make it explicit at the client level.)
    prepare: false,
    // NOTE: fetch_types must stay enabled (default). Several repositories pass
    // array parameters (e.g. `role = any($1::text[])`); postgres.js needs the
    // array type OIDs to encode them, so disabling fetch_types breaks those
    // queries. The one extra introspection round-trip per connection is cheap.
  });

  return {
    query<Row>(
      statement: string,
      params: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
      return withPoolExhaustionRetry(async () => {
        const postgresParams = [...params] as postgres.ParameterOrJSON<never>[];
        const rows = await sql.unsafe<Row[]>(statement, postgresParams);

        return { rows };
      });
    },
    transaction<Result>(
      operation: (executor: PostgresExecutor) => Promise<Result>,
    ): Promise<Result> {
      return withPoolExhaustionRetry(() =>
        sql
          .begin(async (transactionSql) => {
            const transactionExecutor: PostgresExecutor = {
              async query<Row>(
                statement: string,
                params: readonly unknown[] = [],
              ): Promise<QueryResult<Row>> {
                const postgresParams = [
                  ...params,
                ] as postgres.ParameterOrJSON<never>[];
                const rows = await transactionSql.unsafe<Row[]>(
                  statement,
                  postgresParams,
                );

                return { rows };
              },
              transaction: (nestedOperation) =>
                nestedOperation(transactionExecutor),
            };

            return { value: await operation(transactionExecutor) };
          })
          .then((wrapped) => wrapped.value),
      );
    },
  };
}

export function createDirectPostgresExecutor(
  env: DirectPostgresEnv,
  factory: PostgresExecutorFactory = createPostgresExecutor,
): PostgresExecutor {
  if (env.HYPERDRIVE) {
    return factory(env.HYPERDRIVE.connectionString);
  }

  if (env.ENVIRONMENT === "production") {
    throw new ConfigError(
      "HYPERDRIVE binding is required for direct-postgres in production",
    );
  }

  if (!env.DATABASE_URL) {
    throw new ConfigError(
      "DATABASE_URL is required for local direct-postgres without Hyperdrive",
    );
  }

  return factory(env.DATABASE_URL);
}

type DirectPostgresSession = {
  readonly actor: ActorContext;
  query<Row>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
};

class DirectPostgresTransactionSession implements DirectPostgresSession {
  constructor(
    readonly actor: ActorContext,
    private readonly executor: PostgresExecutor,
  ) {}

  query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    assertActorContext(this.actor);

    return this.executor.query<Row>(sql, params);
  }
}

class DirectPostgresProtectedRecordRepository implements ProtectedRecordRepository {
  constructor(private readonly adapter: DirectPostgresAdapter) {}

  list(actor: ActorContext): Promise<ProtectedRecord[]> {
    return this.adapter.withActorTransaction(actor, async (session) => {
      const result = await session.query<ProtectedRecord>(
        [
          'select id, organization_id as "organizationId",',
          'landlord_only as "landlordOnly", value',
          "from protected_records",
          "order by id",
        ].join(" "),
      );

      return result.rows;
    });
  }

  update(
    actor: ActorContext,
    id: string,
    patch: UpdateProtectedRecord,
  ): Promise<ProtectedRecord | undefined> {
    return this.adapter.withActorTransaction(actor, async (session) => {
      const result = await session.query<ProtectedRecord>(
        [
          "update protected_records",
          "set value = $2",
          "where id = $1",
          'returning id, organization_id as "organizationId",',
          'landlord_only as "landlordOnly", value',
        ].join(" "),
        [id, patch.value],
      );

      return result.rows[0];
    });
  }
}

class DirectPostgresAuthRepository implements AuthRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  resolveUserContext(
    authUserId: string,
    bearerToken: string,
  ): Promise<AuthenticatedUserContext | undefined> {
    return this.executor.transaction(async (transactionExecutor) => {
      await this.setAuthSession(transactionExecutor, authUserId);
      const userResult = await transactionExecutor.query<
        AuthenticatedUserContext["user"]
      >(
        [
          'select id, organization_id as "organizationId", email,',
          'full_name as "fullName", role,',
          'coalesce(is_platform_admin, false) as "isPlatformAdmin",',
          'created_at as "createdAt", updated_at as "updatedAt"',
          "from users",
          "where id = $1",
        ].join(" "),
        [authUserId],
      );
      const user = userResult.rows[0];

      if (!user) {
        return undefined;
      }

      const tenantUser =
        user.role === "tenant"
          ? (
              await transactionExecutor.query<
                NonNullable<AuthenticatedUserContext["tenantUser"]>
              >(
                [
                  'select id, user_id as "userId", organization_id as "organizationId",',
                  'contact_name as "contactName", contact_email as "contactEmail",',
                  'created_at as "createdAt"',
                  "from tenant_users",
                  "where user_id = $1",
                ].join(" "),
                [authUserId],
              )
            ).rows[0]
          : undefined;

      const actor = assertActorContext({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        isServiceAdmin: user.isPlatformAdmin,
        party: user.role === "tenant" ? "tenant" : "landlord",
        bearerToken,
      });

      return tenantUser ? { actor, user, tenantUser } : { actor, user };
    });
  }

  private async setAuthSession(
    executor: PostgresExecutor,
    authUserId: string,
  ): Promise<void> {
    await executor.query(
      ["select", "set_config($1, $2, true),", "set_config($3, $4, true)"].join(
        " ",
      ),
      ["request.jwt.claim.sub", authUserId, "app.user_id", authUserId],
    );
  }
}

export class DirectPostgresAdapter implements DbAdapter {
  readonly mode = "direct-postgres" as const;
  readonly auth: AuthRepository;
  readonly protectedRecords: ProtectedRecordRepository;

  constructor(private readonly executor: PostgresExecutor) {
    this.auth = new DirectPostgresAuthRepository(executor);
    this.protectedRecords = new DirectPostgresProtectedRecordRepository(this);
  }

  async withActorTransaction<Result>(
    actor: ActorContext,
    operation: (session: DirectPostgresSession) => Promise<Result>,
  ): Promise<Result> {
    const checkedActor = assertActorContext(actor);

    return this.executor.transaction(async (transactionExecutor) => {
      await this.setActorSession(transactionExecutor, checkedActor);

      return operation(
        new DirectPostgresTransactionSession(checkedActor, transactionExecutor),
      );
    });
  }

  private async setActorSession(
    executor: PostgresExecutor,
    actor: ActorContext,
  ): Promise<void> {
    await executor.query(
      [
        "select",
        "set_config($1, $2, true),",
        "set_config($3, $4, true),",
        "set_config($5, $6, true),",
        "set_config($7, $8, true),",
        "set_config($9, $10, true)",
      ].join(" "),
      [
        "app.user_id",
        actor.userId,
        "app.organization_id",
        actor.organizationId,
        "app.role",
        actor.role,
        "app.is_service_admin",
        String(actor.isServiceAdmin),
        "app.party",
        actor.party,
      ],
    );
  }
}
