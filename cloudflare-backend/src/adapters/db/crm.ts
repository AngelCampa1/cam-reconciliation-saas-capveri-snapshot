import type {
  CrmEventInput,
  CrmRepository,
} from "../../domain/crm/repository";
import type { PostgresExecutor } from "./postgres";

type CrmContactRow = { id: string };

export class PostgresCrmRepository implements CrmRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async recordEvent(input: CrmEventInput): Promise<void> {
    const status = input.emailSubscriptionStatus ?? "subscribed";
    await this.executor.transaction(async (tx) => {
      const contact = await tx.query<CrmContactRow>(
        [
          "insert into crm_contacts",
          "(email, user_id, organization_id, content_lead_id, lifecycle_stage, next_step, email_subscription_status, last_event_at)",
          "values (lower($1), $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::timestamptz)",
          "on conflict (email) do update set",
          "user_id = coalesce(excluded.user_id, crm_contacts.user_id),",
          "organization_id = coalesce(excluded.organization_id, crm_contacts.organization_id),",
          "content_lead_id = coalesce(excluded.content_lead_id, crm_contacts.content_lead_id),",
          "lifecycle_stage = case",
          "when crm_contacts.email_subscription_status = 'unsubscribed'",
          "or excluded.email_subscription_status = 'unsubscribed'",
          "then crm_contacts.lifecycle_stage",
          "else excluded.lifecycle_stage end,",
          "next_step = case",
          "when crm_contacts.email_subscription_status = 'unsubscribed'",
          "and excluded.email_subscription_status <> 'unsubscribed'",
          "then crm_contacts.next_step",
          "else excluded.next_step end,",
          "email_subscription_status = case",
          "when crm_contacts.email_subscription_status = 'unsubscribed'",
          "and excluded.email_subscription_status <> 'unsubscribed'",
          "then crm_contacts.email_subscription_status",
          "else excluded.email_subscription_status end,",
          "last_event_at = excluded.last_event_at,",
          "updated_at = now()",
          "returning id",
        ].join(" "),
        [
          input.email,
          input.userId ?? null,
          input.organizationId ?? null,
          input.contentLeadId ?? null,
          input.lifecycleStage,
          input.nextStep,
          status,
          input.occurredAt,
        ],
      );
      const contactId = contact.rows[0]?.id;
      if (!contactId) {
        throw new Error("CRM contact upsert did not return an id");
      }

      await tx.query(
        [
          "insert into crm_events",
          "(contact_id, email, event_name, event_source, lifecycle_stage, next_step, metadata, occurred_at)",
          "values ($1::uuid, lower($2), $3, $4, $5, $6, $7::jsonb, $8::timestamptz)",
        ].join(" "),
        [
          contactId,
          input.email,
          input.eventName,
          input.eventSource,
          input.lifecycleStage,
          input.nextStep,
          JSON.stringify(input.metadata),
          input.occurredAt,
        ],
      );
    });
  }
}
