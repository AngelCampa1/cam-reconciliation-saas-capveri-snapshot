import type {
  InvoiceSnapshot,
  StripeEventClaim,
  StripeWebhookRepository,
  SubscriptionSnapshot,
  SubscriptionUpdateSnapshot,
  TrialEmailClaim,
  TrialEmailType,
} from "../../domain/billing/webhook-repository";
import type { PostgresExecutor } from "./postgres";

type IdRow = { id: string };
type OrganizationRow = { organization_id: string | null };
type EmailRecipientRow = {
  organization_id: string;
  organization_name: string | null;
  billing_email: string | null;
  user_email: string | null;
};

export class PostgresStripeWebhookRepository implements StripeWebhookRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async claimWebhookEvent(
    stripeEventId: string,
    eventType: string,
  ): Promise<StripeEventClaim | null> {
    const result = await this.executor.query<IdRow>(
      [
        "insert into stripe_webhook_events (stripe_event_id, event_type, status, created_at)",
        "values ($1, $2, 'processing', now())",
        "on conflict (stripe_event_id) do nothing",
        "returning id::text as id",
      ].join(" "),
      [stripeEventId, eventType],
    );

    return result.rows[0] ?? null;
  }

  async completeWebhookEvent(stripeEventId: string): Promise<void> {
    await this.executor.query(
      [
        "update stripe_webhook_events",
        "set status = 'succeeded', processed_at = now()",
        "where stripe_event_id = $1",
      ].join(" "),
      [stripeEventId],
    );
  }

  async releaseWebhookEvent(stripeEventId: string): Promise<void> {
    await this.executor.query(
      "delete from stripe_webhook_events where stripe_event_id = $1",
      [stripeEventId],
    );
  }

  async findOrganizationIdByStripeCustomer(
    stripeCustomerId: string,
  ): Promise<string | null> {
    const result = await this.executor.query<OrganizationRow>(
      [
        "select organization_id::text as organization_id",
        "from subscriptions",
        "where stripe_customer_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [stripeCustomerId],
    );

    return result.rows[0]?.organization_id ?? null;
  }

  async findSubscriptionIdByStripeSubscription(
    stripeSubscriptionId: string,
  ): Promise<string | null> {
    const result = await this.executor.query<IdRow>(
      [
        "select id::text as id",
        "from subscriptions",
        "where stripe_subscription_id = $1",
        "limit 1",
      ].join(" "),
      [stripeSubscriptionId],
    );

    return result.rows[0]?.id ?? null;
  }

  async upsertSubscription(snapshot: SubscriptionSnapshot): Promise<void> {
    await this.executor.query(
      [
        "insert into subscriptions (",
        "organization_id, stripe_subscription_id, stripe_customer_id, plan, tier,",
        "status, pricing_model, building_count, unit_count, included_units,",
        "unit_overage_count, current_period_start, current_period_end,",
        "cancel_at_period_end, stripe_event_ts, updated_at",
        ") values (",
        "$1, $2, $3, $4::subscription_plan, $5, $6::subscription_status,",
        "$7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz, $14,",
        "$15::timestamptz, now()",
        ") on conflict (organization_id) do update set",
        "stripe_subscription_id = excluded.stripe_subscription_id,",
        "stripe_customer_id = excluded.stripe_customer_id,",
        "plan = excluded.plan, tier = excluded.tier, status = excluded.status,",
        "pricing_model = excluded.pricing_model,",
        "building_count = excluded.building_count,",
        "unit_count = excluded.unit_count,",
        "included_units = excluded.included_units,",
        "unit_overage_count = excluded.unit_overage_count,",
        "current_period_start = excluded.current_period_start,",
        "current_period_end = excluded.current_period_end,",
        "cancel_at_period_end = excluded.cancel_at_period_end,",
        "stripe_event_ts = coalesce(excluded.stripe_event_ts, subscriptions.stripe_event_ts),",
        "updated_at = now()",
        // Ignore a redelivered/out-of-order event that is strictly older than
        // the last one applied. Equal timestamps (true redelivery) and any
        // null timestamp still apply, so this can never freeze a live sub.
        "where subscriptions.stripe_event_ts is null",
        "or excluded.stripe_event_ts is null",
        "or excluded.stripe_event_ts >= subscriptions.stripe_event_ts",
      ].join(" "),
      subscriptionParams(snapshot),
    );
  }

  async updateSubscriptionByStripeId(
    stripeSubscriptionId: string,
    snapshot: SubscriptionUpdateSnapshot,
  ): Promise<void> {
    await this.executor.query(
      [
        "update subscriptions set",
        "stripe_customer_id = $2, plan = $3::subscription_plan, tier = $4,",
        "status = $5::subscription_status, pricing_model = $6,",
        "building_count = $7, unit_count = $8, included_units = $9,",
        "unit_overage_count = $10,",
        "current_period_start = coalesce($11::timestamptz, current_period_start),",
        "current_period_end = coalesce($12::timestamptz, current_period_end),",
        "cancel_at_period_end = $13,",
        "stripe_event_ts = coalesce($14::timestamptz, stripe_event_ts),",
        "updated_at = now()",
        "where stripe_subscription_id = $1",
        // Skip events strictly older than the last applied one. Equal/null
        // timestamps still apply, so a live subscription can never freeze.
        "and (stripe_event_ts is null or $14::timestamptz is null",
        "or $14::timestamptz >= stripe_event_ts)",
      ].join(" "),
      [
        stripeSubscriptionId,
        snapshot.stripeCustomerId,
        snapshot.plan,
        snapshot.tier,
        snapshot.status,
        snapshot.pricingModel,
        snapshot.buildingCount,
        snapshot.unitCount,
        snapshot.includedUnits,
        snapshot.unitOverageCount,
        snapshot.currentPeriodStart,
        snapshot.currentPeriodEnd,
        snapshot.cancelAtPeriodEnd,
        snapshot.eventTs,
      ],
    );
  }

  async markSubscriptionCanceled(
    stripeSubscriptionId: string,
    eventTs: string | null,
  ): Promise<void> {
    await this.executor.query(
      [
        "update subscriptions",
        "set status = 'canceled',",
        "stripe_event_ts = coalesce($2::timestamptz, stripe_event_ts),",
        "updated_at = now()",
        "where stripe_subscription_id = $1",
        "and (stripe_event_ts is null or $2::timestamptz is null",
        "or $2::timestamptz >= stripe_event_ts)",
      ].join(" "),
      [stripeSubscriptionId, eventTs],
    );
  }

  async markSubscriptionPastDue(
    stripeSubscriptionId: string,
    eventTs: string | null,
  ): Promise<void> {
    await this.executor.query(
      [
        "update subscriptions",
        "set status = 'past_due',",
        "stripe_event_ts = coalesce($2::timestamptz, stripe_event_ts),",
        "updated_at = now()",
        "where stripe_subscription_id = $1",
        "and (stripe_event_ts is null or $2::timestamptz is null",
        "or $2::timestamptz >= stripe_event_ts)",
      ].join(" "),
      [stripeSubscriptionId, eventTs],
    );
  }

  async markCheckoutComplete(organizationId: string): Promise<void> {
    await this.executor.query(
      [
        "update organizations",
        "set settings = jsonb_set(",
        "coalesce(settings, '{}'::jsonb),",
        "'{billing_activation}',",
        "coalesce(settings->'billing_activation', '{}'::jsonb)",
        "|| jsonb_build_object(",
        "'checkout_required', false,",
        "'activated_at', coalesce(settings->'billing_activation'->>'activated_at', now()::text),",
        "'updated_at', now()::text",
        "),",
        "true",
        ")",
        "where id = $1",
      ].join(" "),
      [organizationId],
    );
  }

  async upsertInvoice(snapshot: InvoiceSnapshot): Promise<void> {
    await this.executor.query(
      [
        "insert into invoices (",
        "organization_id, subscription_id, stripe_invoice_id, amount_due, amount_paid,",
        "currency, status, period_start, period_end, due_date, pdf_url,",
        "hosted_invoice_url, updated_at",
        ") values (",
        "$1, $2, $3, $4, $5, $6, $7::invoice_status, $8::timestamptz,",
        "$9::timestamptz, $10::timestamptz, $11, $12, now()",
        ") on conflict (stripe_invoice_id) where stripe_invoice_id is not null",
        "do update set organization_id = excluded.organization_id,",
        "subscription_id = excluded.subscription_id, amount_due = excluded.amount_due,",
        "amount_paid = excluded.amount_paid, currency = excluded.currency,",
        "status = excluded.status, period_start = excluded.period_start,",
        "period_end = excluded.period_end, due_date = excluded.due_date,",
        "pdf_url = excluded.pdf_url, hosted_invoice_url = excluded.hosted_invoice_url,",
        "updated_at = now()",
        "where invoices.status != 'paid'",
      ].join(" "),
      [
        snapshot.organizationId,
        snapshot.subscriptionId,
        snapshot.stripeInvoiceId,
        snapshot.amountDue,
        snapshot.amountPaid,
        snapshot.currency,
        snapshot.status,
        snapshot.periodStart,
        snapshot.periodEnd,
        snapshot.dueDate,
        snapshot.pdfUrl,
        snapshot.hostedInvoiceUrl,
      ],
    );
  }

  async invoiceExists(stripeInvoiceId: string): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      "select id::text as id from invoices where stripe_invoice_id = $1 limit 1",
      [stripeInvoiceId],
    );

    return result.rows.length > 0;
  }

  async markInvoicePaid(input: {
    stripeInvoiceId: string;
    amountPaid: number;
    pdfUrl: string | null;
    hostedInvoiceUrl: string | null;
  }): Promise<void> {
    await this.executor.query(
      [
        "update invoices set status = 'paid', amount_paid = $2, paid_at = now(),",
        "pdf_url = $3, hosted_invoice_url = $4, updated_at = now()",
        "where stripe_invoice_id = $1",
      ].join(" "),
      [
        input.stripeInvoiceId,
        input.amountPaid,
        input.pdfUrl,
        input.hostedInvoiceUrl,
      ],
    );
  }

  async markInvoiceOpen(stripeInvoiceId: string): Promise<void> {
    await this.executor.query(
      [
        "update invoices",
        "set status = 'open', updated_at = now()",
        "where stripe_invoice_id = $1",
        "and status != 'paid'",
      ].join(" "),
      [stripeInvoiceId],
    );
  }

  async insertAuditCredits(input: {
    organizationId: string;
    creditsPurchased: number;
    unitPriceCents: number;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string | null;
  }): Promise<"inserted" | "duplicate"> {
    const result = await this.executor.query<IdRow>(
      [
        "insert into audit_credits (",
        "organization_id, credits_purchased, credits_used, unit_price_cents,",
        "stripe_checkout_session_id, stripe_payment_intent_id",
        ") values ($1, $2, 0, $3, $4, $5)",
        "on conflict (stripe_checkout_session_id) where stripe_checkout_session_id is not null",
        "do nothing",
        "returning id::text as id",
      ].join(" "),
      [
        input.organizationId,
        input.creditsPurchased,
        input.unitPriceCents,
        input.stripeCheckoutSessionId,
        input.stripePaymentIntentId,
      ],
    );

    return result.rows.length > 0 ? "inserted" : "duplicate";
  }

  async redeemWinbackOffer(input: {
    organizationId: string;
    offerTier: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "update free_audit_winback_offers",
        "set redeemed_offer_tier = $2, redeemed_at = now()",
        "where organization_id = $1 and redeemed_offer_tier is null",
      ].join(" "),
      [input.organizationId, input.offerTier],
    );
  }

  async claimTrialEmail(input: {
    organizationId: string;
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
    stripeEventId: string | null;
  }): Promise<TrialEmailClaim | null> {
    const recipient = await this.findTrialEmailRecipient(input.organizationId);

    if (!recipient) {
      throw new Error(
        `No billing contact found for org ${input.organizationId}`,
      );
    }

    const messageId = crypto.randomUUID();
    const result = await this.executor.query<IdRow>(
      [
        "insert into subscription_email_events (",
        "organization_id, stripe_subscription_id, email_type, status,",
        "stripe_event_id, created_at",
        ") values ($1, $2, $3, 'processing', $4, now())",
        "on conflict (stripe_subscription_id, email_type) do nothing",
        "returning id::text as id",
      ].join(" "),
      [
        input.organizationId,
        input.stripeSubscriptionId,
        input.emailType,
        input.stripeEventId,
      ],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return { messageId, ...recipient };
  }

  async completeTrialEmail(input: {
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
    providerMessageId: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "update subscription_email_events",
        "set status = 'sent', provider_message_id = $3, sent_at = now()",
        "where stripe_subscription_id = $1 and email_type = $2",
      ].join(" "),
      [input.stripeSubscriptionId, input.emailType, input.providerMessageId],
    );
  }

  async releaseTrialEmail(input: {
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
  }): Promise<void> {
    await this.executor.query(
      [
        "delete from subscription_email_events",
        "where stripe_subscription_id = $1 and email_type = $2",
      ].join(" "),
      [input.stripeSubscriptionId, input.emailType],
    );
  }

  private async findTrialEmailRecipient(
    organizationId: string,
  ): Promise<{ recipient: string; organizationName: string } | null> {
    const result = await this.executor.query<EmailRecipientRow>(
      [
        "select o.id::text as organization_id, o.name as organization_name,",
        "o.billing_email,",
        "(",
        "select u.email from users u",
        "where u.organization_id = o.id and u.role = any(array['owner','admin']::text[])",
        "order by case when u.role = 'owner' then 0 else 1 end, u.created_at asc",
        "limit 1",
        ") as user_email",
        "from organizations o",
        "where o.id = $1",
        "limit 1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];
    const recipient = row?.billing_email ?? row?.user_email;

    if (!row || !recipient) {
      return null;
    }

    return {
      recipient,
      organizationName: row.organization_name ?? "CapVeri customer",
    };
  }
}

function subscriptionParams(
  snapshot: SubscriptionSnapshot,
): readonly unknown[] {
  return [
    snapshot.organizationId,
    snapshot.stripeSubscriptionId,
    snapshot.stripeCustomerId,
    snapshot.plan,
    snapshot.tier,
    snapshot.status,
    snapshot.pricingModel,
    snapshot.buildingCount,
    snapshot.unitCount,
    snapshot.includedUnits,
    snapshot.unitOverageCount,
    snapshot.currentPeriodStart,
    snapshot.currentPeriodEnd,
    snapshot.cancelAtPeriodEnd,
    snapshot.eventTs,
  ];
}
