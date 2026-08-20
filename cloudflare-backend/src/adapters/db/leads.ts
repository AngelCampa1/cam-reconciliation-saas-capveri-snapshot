import type {
  LeadRepository,
  ContentLeadInsert,
} from "../../domain/leads/repository";
import type { PostgresExecutor } from "./postgres";

type ExistsRow = { exists: boolean };
type IdRow = { id: string };

export class PostgresLeadRepository implements LeadRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async isSuppressed(email: string): Promise<boolean> {
    const result = await this.executor.query<ExistsRow>(
      [
        "select exists(",
        "select 1 from email_suppressions where email = lower($1)",
        ") as exists",
      ].join(" "),
      [email],
    );

    return result.rows[0]?.exists === true;
  }

  async hasRecentLead(input: {
    email: string;
    assetSlug: string;
    createdSinceIso: string;
  }): Promise<boolean> {
    const result = await this.executor.query<ExistsRow>(
      [
        "select exists(",
        "select 1 from content_leads",
        "where email = lower($1) and asset_slug = $2 and created_at >= $3::timestamptz",
        ") as exists",
      ].join(" "),
      [input.email, input.assetSlug, input.createdSinceIso],
    );

    return result.rows[0]?.exists === true;
  }

  async insertContentLead(input: ContentLeadInsert): Promise<string> {
    const result = await this.executor.query<IdRow>(
      [
        "insert into content_leads",
        "(first_name, email, company, asset_slug, source, utm_source, utm_medium, utm_campaign)",
        "values ($1, lower($2), $3, $4, $5, $6, $7, $8)",
        "returning id",
      ].join(" "),
      [
        input.firstName,
        input.email,
        input.company,
        input.assetSlug,
        input.source,
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
      ],
    );

    return result.rows[0]?.id ?? "unknown";
  }

  async suppressEmail(input: {
    email: string;
    reason: "user_unsubscribe";
  }): Promise<void> {
    await this.executor.query(
      [
        "insert into email_suppressions (email, reason)",
        "values (lower($1), $2)",
        "on conflict (email) do update",
        "set reason = excluded.reason, suppressed_at = now()",
      ].join(" "),
      [input.email, input.reason],
    );
  }

  async markContentLeadsUnsubscribed(input: {
    email: string;
    unsubscribedAtIso: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "update content_leads",
        "set unsubscribed_at = $2::timestamptz",
        "where email = lower($1) and unsubscribed_at is null",
      ].join(" "),
      [input.email, input.unsubscribedAtIso],
    );
  }
}
