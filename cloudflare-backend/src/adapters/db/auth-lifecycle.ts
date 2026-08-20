import {
  TERMS_DOCUMENT_TYPE,
  TERMS_HASH,
  TERMS_VERSION,
} from "../../domain/legal/terms";
import {
  ACCOUNT_DELETION_BLOCKERS,
  SIGNUP_NURTURE_SCHEDULE,
} from "../../domain/auth-lifecycle/service";
import type {
  AuthLifecycleRepository,
  SignupNurtureEvent,
} from "../../domain/auth-lifecycle/repository";
import type { PostgresExecutor } from "./postgres";

const allowedBlockers = new Set(
  ACCOUNT_DELETION_BLOCKERS.map(
    (blocker) => `${blocker.tableName}.${blocker.columnName}`,
  ),
);
const allowedSignupEmailTypes = new Set(
  SIGNUP_NURTURE_SCHEDULE.map(([emailType]) => emailType),
);

export class PostgresAuthLifecycleRepository implements AuthLifecycleRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getOrganizationName(organizationId: string): Promise<string | null> {
    const result = await this.executor.query<{ name: string }>(
      "select name from organizations where id = $1 limit 1",
      [organizationId],
    );
    return result.rows[0]?.name ?? null;
  }

  async recordLegalAcceptance(input: {
    userId: string;
    organizationId: string;
    acceptedAt: string;
    source: "owner_signup" | "authenticated_legal_gate";
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await this.executor.query(
      [
        "insert into legal_acceptances",
        "(user_id, organization_id, document_type, document_version, document_hash,",
        "accepted_at, ip_address, user_agent, source, metadata)",
        "values ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9, '{}'::jsonb)",
      ].join(" "),
      [
        input.userId,
        input.organizationId,
        TERMS_DOCUMENT_TYPE,
        TERMS_VERSION,
        TERMS_HASH,
        input.acceptedAt,
        input.ipAddress,
        input.userAgent,
        input.source,
      ],
    );
  }

  async upsertSignupNurtureEvents(events: SignupNurtureEvent[]): Promise<void> {
    const safeEvents = events.map(assertSafeSignupEvent);
    if (safeEvents.length === 0) {
      return;
    }
    const placeholders = safeEvents
      .map(
        (_, index) =>
          `($${index * 7 + 1}, $${index * 7 + 2}, $${index * 7 + 3}, $${index * 7 + 4}, $${index * 7 + 5}, $${index * 7 + 6}, $${index * 7 + 7})`,
      )
      .join(", ");
    await this.executor.query(
      [
        "insert into signup_email_events",
        "(organization_id, user_id, email, organization_name, email_type, status, scheduled_at)",
        `values ${placeholders}`,
        "on conflict (user_id, email_type) do nothing",
      ].join(" "),
      safeEvents.flatMap((event) => [
        event.organizationId,
        event.userId,
        event.email,
        event.organizationName,
        event.emailType,
        event.status,
        event.scheduledAt,
      ]),
    );
  }

  async countOrganizationUsers(organizationId: string): Promise<number> {
    const result = await this.executor.query<{ count: string }>(
      "select count(*)::text as count from users where organization_id = $1",
      [organizationId],
    );
    return countFromResult(result.rows[0]?.count);
  }

  async countOtherOrganizationAdmins(input: {
    organizationId: string;
    userId: string;
  }): Promise<number> {
    const result = await this.executor.query<{ count: string }>(
      [
        "select count(*)::text as count",
        "from users",
        "where organization_id = $1",
        "and role = any($2::text[])",
        "and id <> $3",
      ].join(" "),
      [input.organizationId, ["owner", "admin"], input.userId],
    );
    return countFromResult(result.rows[0]?.count);
  }

  async countRows(input: {
    tableName: string;
    columnName: string;
    value: string;
  }): Promise<number> {
    const identifier = `${input.tableName}.${input.columnName}`;
    if (!allowedBlockers.has(identifier)) {
      throw new Error(`Unsupported account deletion blocker: ${identifier}`);
    }

    const result = await this.executor.query<{ count: string }>(
      `select count(*)::text as count from ${input.tableName} where ${input.columnName} = $1 limit 1`,
      [input.value],
    );
    return countFromResult(result.rows[0]?.count);
  }
}

function assertSafeSignupEvent(event: SignupNurtureEvent): SignupNurtureEvent {
  if (!allowedSignupEmailTypes.has(event.emailType)) {
    throw new Error(`Unsupported signup email type: ${event.emailType}`);
  }
  if (event.status !== "pending") {
    throw new Error(`Unsupported signup email status: ${event.status}`);
  }
  return event;
}

function countFromResult(value: string | undefined): number {
  return Number.parseInt(value ?? "0", 10);
}
