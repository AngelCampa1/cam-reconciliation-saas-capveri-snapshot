import { FEATURE_LABELS, FEATURE_TIERS } from "../../domain/billing/plan-tiers";
import { BillingTrialPausedError } from "../../domain/billing/repository";
import type {
  BillingRepository,
  BillingActivationState,
  BillingCustomer,
  CheckoutBillingState,
  CreditBalance,
  CreditPack,
  FeatureUsageResponse,
  FreeAuditStatusResponse,
  GuaranteeInvoice,
  Invoice,
  InvoiceListResponse,
  InvoiceSummaryResponse,
  OrganizationBillingProfile,
  PlanSelectionInput,
  PlanSelectionResponse,
  SaveOfferAttempt,
  SaveOfferType,
  StripeResumeSubscriptionInput,
  Subscription,
  TrialStartInput,
  UsedFeature,
} from "../../domain/billing/repository";
import type { PostgresExecutor } from "./postgres";

type OrganizationSettingsRow = { settings: unknown };
type BillingActivation = {
  plan_id?: unknown;
  billing_period?: unknown;
  unit_count?: unknown;
  building_count?: unknown;
  checkout_required?: unknown;
  selected_at?: unknown;
};
type SubscriptionRow = {
  id?: string;
  organization_id?: string;
  status: string;
  stripe_subscription_id: string | null;
  stripe_customer_id?: string | null;
  current_period_start?: string | Date | null;
  current_period_end: string | Date | null;
  plan: string | null;
  tier: string | null;
  pricing_model?: string | null;
  building_count?: string | number | null;
  unit_count?: string | number | null;
  included_units?: string | number | null;
  unit_overage_count?: string | number | null;
  billing_interval?: string | null;
  cancel_at_period_end?: boolean | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  money_back_claimed_at?: string | Date | null;
  money_back_refund_id?: string | null;
};
type CreditAggregateRow = {
  total_purchased: string | number | bigint | null;
  total_used: string | number | bigint | null;
  total_remaining: string | number | bigint | null;
  pack_count: string | number | bigint;
};
type CountRow = { count: string | number | bigint };
type FeatureUsageRow = {
  feature_key: string;
  first_used_at: string | Date | null;
  last_used_at: string | Date | null;
};
type CurrentTierRow = { tier: string | null };
type BillingCustomerRow = { stripe_customer_id: string | null };
type OrganizationBillingProfileRow = {
  name: string | null;
  billing_email: string | null;
};
type CheckoutBillingStateRow = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | Date | null;
};
type InvoiceRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  stripe_invoice_id: string | null;
  amount_due: string | number;
  amount_paid: string | number;
  currency: string;
  status: string;
  period_start: string | Date;
  period_end: string | Date;
  due_date: string | Date | null;
  paid_at: string | Date | null;
  pdf_url: string | null;
  created_at: string | Date;
};
type GuaranteeInvoiceRow = {
  id: string;
  stripe_invoice_id: string | null;
  amount_paid: string | number;
  currency: string | null;
  paid_at: string | Date | null;
};
type SaveOfferAttemptRow = {
  id: string;
  organization_id: string;
  cancel_reason: string;
  other_text: string | null;
  offer_shown: string;
  offer_accepted: boolean | null;
  stripe_coupon_id: string | null;
  created_at: string | Date;
};

const SELF_SERVE_PROPERTY_LIMIT = 50;

export class PostgresBillingRepository implements BillingRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getPlanSelection(
    organizationId: string,
  ): Promise<PlanSelectionResponse> {
    const [activation, subscription, creditAggregate] = await Promise.all([
      this.readBillingActivation(organizationId),
      this.getLatestSubscription(organizationId),
      this.getCreditAggregate(organizationId),
    ]);
    const effectiveStatus = subscription
      ? effectiveSubscriptionStatus(subscription)
      : null;
    const hasPurchasedCredits = creditAggregate.packCount > 0;
    const hasActiveAccess =
      effectiveStatus === "active" ||
      effectiveStatus === "trialing" ||
      hasPurchasedCredits;
    const hasPausedSubscription = effectiveStatus === "paused";

    return {
      plan_id:
        typeof activation?.plan_id === "string" ? activation.plan_id : null,
      billing_period: activation?.billing_period === "annual" ? "annual" : null,
      unit_count:
        typeof activation?.unit_count === "number"
          ? activation.unit_count
          : null,
      building_count:
        typeof activation?.building_count === "number"
          ? activation.building_count
          : null,
      selected_at:
        typeof activation?.selected_at === "string"
          ? activation.selected_at
          : null,
      checkout_required: !hasActiveAccess && !hasPausedSubscription,
      has_active_access: hasActiveAccess,
      has_paused_subscription: hasPausedSubscription,
      subscription_status: effectiveStatus,
      trial_days_remaining: trialDaysRemaining(subscription, effectiveStatus),
    };
  }

  async savePlanSelection(
    organizationId: string,
    input: PlanSelectionInput,
  ): Promise<PlanSelectionResponse> {
    const now = new Date().toISOString();
    const result = await this.executor.query<OrganizationSettingsRow>(
      [
        "update organizations",
        "set settings = jsonb_set(",
        "coalesce(settings, '{}'::jsonb),",
        "'{billing_activation}',",
        "jsonb_build_object(",
        "'plan_id', $2::text,",
        "'billing_period', $3::text,",
        "'unit_count', $4::int,",
        "'building_count', $5::int,",
        "'checkout_required', true,",
        "'selected_at', coalesce(settings->'billing_activation'->>'selected_at', $6::text),",
        "'updated_at', $6::text",
        "),",
        "true",
        ")",
        "where id = $1",
        "returning settings",
      ].join(" "),
      [
        organizationId,
        input.plan_id,
        input.billing_period,
        input.unit_count,
        input.building_count,
        now,
      ],
    );

    const activation = readBillingActivation(result.rows[0]?.settings);
    return this.getPlanSelectionFromActivation(organizationId, activation);
  }

  async startTrial(
    organizationId: string,
    input: TrialStartInput,
  ): Promise<PlanSelectionResponse> {
    const existingSubscription = (
      await this.executor.query<SubscriptionRow>(
        [
          "select status::text as status, stripe_subscription_id, current_period_end, plan::text as plan, tier",
          "from subscriptions",
          "where organization_id = $1",
          "order by created_at desc",
          "limit 1",
        ].join(" "),
        [organizationId],
      )
    ).rows[0];
    const existingStatus = existingSubscription
      ? effectiveSubscriptionStatusAt(existingSubscription, input.startedAt)
      : null;

    if (
      existingStatus === "paused" ||
      existingSubscription?.status === "paused"
    ) {
      throw new BillingTrialPausedError(
        "Your trial is paused because billing was not added before it ended. Add a payment method in billing settings to resume access.",
      );
    }

    const activation = await this.saveBillingActivation(organizationId, input, {
      checkoutRequired: false,
      now: input.startedAt,
    });

    const shouldUpsertLocalTrial =
      !existingSubscription ||
      (existingStatus !== "active" &&
        !(
          existingSubscription.status === "trialing" &&
          existingSubscription.stripe_subscription_id
        ));

    if (shouldUpsertLocalTrial) {
      const unitOverageCount = Math.max(
        input.unit_count - input.includedUnits,
        0,
      );
      await this.executor.query(
        [
          "insert into subscriptions",
          "(organization_id, stripe_subscription_id, stripe_customer_id, plan, tier, status,",
          "pricing_model, billing_interval, building_count, unit_count, included_units,",
          "unit_overage_count, current_period_start, current_period_end,",
          "cancel_at_period_end, created_at, updated_at)",
          "values ($1, null, null, 'growth_v2', $2, 'trialing',",
          "'per_unit', $3, $4, $5, $6, $7, $8, $9, false, $8, $8)",
          "on conflict (organization_id) do update set",
          "stripe_subscription_id = excluded.stripe_subscription_id,",
          "stripe_customer_id = excluded.stripe_customer_id,",
          "plan = excluded.plan,",
          "tier = excluded.tier,",
          "status = excluded.status,",
          "pricing_model = excluded.pricing_model,",
          "billing_interval = excluded.billing_interval,",
          "building_count = excluded.building_count,",
          "unit_count = excluded.unit_count,",
          "included_units = excluded.included_units,",
          "unit_overage_count = excluded.unit_overage_count,",
          "current_period_start = excluded.current_period_start,",
          "current_period_end = excluded.current_period_end,",
          "cancel_at_period_end = excluded.cancel_at_period_end,",
          "updated_at = excluded.updated_at",
        ].join(" "),
        [
          organizationId,
          input.plan_id,
          input.billing_period,
          input.building_count,
          input.unit_count,
          input.includedUnits,
          unitOverageCount,
          input.startedAt,
          input.periodEnd,
        ],
      );
    }

    return this.getPlanSelectionFromActivation(organizationId, activation);
  }

  async getFreeAuditStatus(
    organizationId: string,
  ): Promise<FreeAuditStatusResponse> {
    const [subscription, startedFreeAudit, creditAggregate, propertyCapacity] =
      await Promise.all([
        this.getLatestSubscription(organizationId),
        this.hasStartedFreeAudit(organizationId),
        this.getCreditAggregate(organizationId),
        this.hasPropertyCapacity(organizationId),
      ]);
    const effectiveStatus = subscription
      ? effectiveSubscriptionStatus(subscription)
      : null;
    const activeSubscription =
      effectiveStatus === "active" || effectiveStatus === "trialing";
    const pausedSubscription = effectiveStatus === "paused";
    const hasEverPurchased = creditAggregate.packCount > 0;
    const hasPaidAccess = activeSubscription || hasEverPurchased;

    return {
      has_subscription: activeSubscription,
      has_paused_subscription: pausedSubscription,
      has_ever_purchased: hasEverPurchased,
      credit_balance: creditAggregate.balance,
      free_audit_consumed: startedFreeAudit && !hasPaidAccess,
      can_add_property:
        (hasPaidAccess || !startedFreeAudit) && propertyCapacity,
      can_run_reconciliation: hasPaidAccess || !startedFreeAudit,
      can_view_draft_report: hasPaidAccess,
      can_download_reports: hasPaidAccess,
    };
  }

  async getCredits(organizationId: string): Promise<CreditBalance> {
    return (await this.getCreditAggregate(organizationId)).balance;
  }

  async getCreditHistory(organizationId: string): Promise<CreditPack[]> {
    const result = await this.executor.query<CreditPack>(
      [
        "select id::text as id, organization_id::text as organization_id,",
        "credits_purchased, credits_used, credits_remaining, unit_price_cents,",
        "stripe_payment_intent_id, stripe_checkout_session_id,",
        "purchased_at",
        "from audit_credits",
        "where organization_id = $1",
        "order by purchased_at desc",
      ].join(" "),
      [organizationId],
    );

    return result.rows.map((row) => ({
      ...row,
      purchased_at: toIsoTimestamp(row.purchased_at),
    }));
  }

  async getFeatureUsage(organizationId: string): Promise<FeatureUsageResponse> {
    const [featuresResult, currentTierResult] = await Promise.all([
      this.executor.query<FeatureUsageRow>(
        [
          "select feature_key, first_used_at, last_used_at",
          "from feature_usage_events",
          "where organization_id = $1",
          "order by first_used_at asc",
        ].join(" "),
        [organizationId],
      ),
      this.executor.query<CurrentTierRow>(
        [
          "select tier",
          "from subscriptions",
          "where organization_id = $1",
          "order by created_at desc",
          "limit 1",
        ].join(" "),
        [organizationId],
      ),
    ]);

    return {
      used_features: featuresResult.rows.flatMap(toUsedFeature),
      current_tier: currentTierResult.rows[0]?.tier ?? null,
    };
  }

  async getBillingCustomer(
    organizationId: string,
  ): Promise<BillingCustomer | null> {
    const result = await this.executor.query<BillingCustomerRow>(
      [
        "select stripe_customer_id",
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0] ?? null;
  }

  async getOrganizationBillingProfile(
    organizationId: string,
  ): Promise<OrganizationBillingProfile | null> {
    const result = await this.executor.query<OrganizationBillingProfileRow>(
      [
        "select name, billing_email",
        "from organizations",
        "where id = $1",
        "limit 1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      name: row.name ?? "",
      billing_email: row.billing_email,
    };
  }

  async getCheckoutBillingState(
    organizationId: string,
  ): Promise<CheckoutBillingState | null> {
    const result = await this.executor.query<CheckoutBillingStateRow>(
      [
        "select stripe_customer_id, stripe_subscription_id, status::text as status, current_period_end",
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      stripe_customer_id: row.stripe_customer_id,
      stripe_subscription_id: row.stripe_subscription_id,
      status: row.status,
      current_period_end: row.current_period_end
        ? toIsoTimestamp(row.current_period_end)
        : null,
    };
  }

  async getSubscription(organizationId: string): Promise<Subscription | null> {
    const result = await this.executor.query<SubscriptionRow>(
      [
        subscriptionSelect(),
        "from subscriptions",
        "where organization_id = $1",
        "limit 1",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0] ? subscriptionFromRow(result.rows[0]) : null;
  }

  async scheduleSubscriptionCancel(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null> {
    return this.updateSubscription(
      [
        "update subscriptions",
        "set cancel_at_period_end = true, updated_at = $2",
        "where organization_id = $1",
        "returning",
        subscriptionReturnFields(),
      ].join(" "),
      [organizationId, updatedAt],
    );
  }

  async cancelSubscriptionImmediately(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null> {
    return this.updateSubscription(
      [
        "update subscriptions",
        "set status = 'canceled', cancel_at_period_end = false, updated_at = $2",
        "where organization_id = $1",
        "returning",
        subscriptionReturnFields(),
      ].join(" "),
      [organizationId, updatedAt],
    );
  }

  async resumeScheduledSubscription(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null> {
    return this.updateSubscription(
      [
        "update subscriptions",
        "set cancel_at_period_end = false, updated_at = $2",
        "where organization_id = $1",
        "returning",
        subscriptionReturnFields(),
      ].join(" "),
      [organizationId, updatedAt],
    );
  }

  async resumePausedSubscription(
    organizationId: string,
    input: StripeResumeSubscriptionInput,
  ): Promise<Subscription | null> {
    const assignments = [
      "status = $2::subscription_status",
      "cancel_at_period_end = $3",
      "updated_at = $4",
    ];
    const params: unknown[] = [
      organizationId,
      input.status,
      input.cancel_at_period_end,
      input.updated_at,
    ];

    if (input.current_period_start) {
      params.push(input.current_period_start);
      assignments.push(`current_period_start = $${params.length}`);
    }
    if (input.current_period_end) {
      params.push(input.current_period_end);
      assignments.push(`current_period_end = $${params.length}`);
    }

    return this.updateSubscription(
      [
        "update subscriptions",
        `set ${assignments.join(", ")}`,
        "where organization_id = $1",
        "returning",
        subscriptionReturnFields(),
      ].join(" "),
      params,
    );
  }

  async createSaveOfferAttempt(input: {
    organizationId: string;
    reason: SaveOfferAttempt["cancel_reason"];
    otherText: string | null;
    offerType: SaveOfferType;
  }): Promise<SaveOfferAttempt> {
    const result = await this.executor.query<SaveOfferAttemptRow>(
      [
        "insert into cancel_attempts",
        "(organization_id, cancel_reason, other_text, offer_shown)",
        "values ($1, $2::cancel_reason, $3, $4::save_offer_type)",
        "returning",
        saveOfferAttemptReturnFields(),
      ].join(" "),
      [input.organizationId, input.reason, input.otherText, input.offerType],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to create cancel attempt");
    }

    return saveOfferAttemptFromRow(row);
  }

  async getSaveOfferAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SaveOfferAttempt | null> {
    const result = await this.executor.query<SaveOfferAttemptRow>(
      [
        "select",
        saveOfferAttemptReturnFields(),
        "from cancel_attempts",
        "where id = $1",
        "and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.attemptId, input.organizationId],
    );

    return result.rows[0] ? saveOfferAttemptFromRow(result.rows[0]) : null;
  }

  async markSaveOfferAccepted(input: {
    organizationId: string;
    attemptId: string;
    couponId: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "update cancel_attempts",
        "set offer_accepted = true, stripe_coupon_id = $3",
        "where id = $1",
        "and organization_id = $2",
      ].join(" "),
      [input.attemptId, input.organizationId, input.couponId],
    );
  }

  async markCancelAttemptDeclined(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "update cancel_attempts",
        "set offer_accepted = false",
        "where id = $1",
        "and organization_id = $2",
      ].join(" "),
      [input.attemptId, input.organizationId],
    );
  }

  async hasLocalSubscription(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<{ exists: boolean }>(
      [
        "select exists (",
        "select 1 from subscriptions where organization_id = $1",
        ") as exists",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0]?.exists === true;
  }

  async saveStripeCustomerId(
    organizationId: string,
    customerId: string,
  ): Promise<boolean> {
    const result = await this.executor.query<{ stripe_customer_id: string }>(
      [
        "update subscriptions",
        "set stripe_customer_id = $2, updated_at = now()",
        "where organization_id = $1",
        "returning stripe_customer_id",
      ].join(" "),
      [organizationId, customerId],
    );

    return result.rows.length > 0;
  }

  async getBillingActivation(
    organizationId: string,
  ): Promise<BillingActivationState | null> {
    const activation = await this.readBillingActivation(organizationId);

    if (!activation) {
      return null;
    }

    return normalizeBillingActivation(activation);
  }

  async saveCheckoutActivation(
    organizationId: string,
    input: PlanSelectionInput,
  ): Promise<void> {
    await this.saveBillingActivation(organizationId, input, {
      checkoutRequired: true,
      now: new Date().toISOString(),
    });
  }

  async hasRedeemedWinbackOffer(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<{
      redeemed_offer_tier: string | null;
    }>(
      [
        "select redeemed_offer_tier",
        "from free_audit_winback_offers",
        "where organization_id = $1",
        "limit 1",
      ].join(" "),
      [organizationId],
    );

    return Boolean(result.rows[0]?.redeemed_offer_tier);
  }

  async listInvoices(input: {
    organizationId: string;
    status: string | null;
    page: number;
    perPage: number;
  }): Promise<InvoiceListResponse> {
    const offset = (input.page - 1) * input.perPage;
    const statusClause = input.status ? "and status::text = $2" : "";
    const rowsParams = input.status
      ? [input.organizationId, input.status, offset, input.perPage]
      : [input.organizationId, offset, input.perPage];
    const countParams = input.status
      ? [input.organizationId, input.status]
      : [input.organizationId];
    const offsetPlaceholder = input.status ? "$3" : "$2";
    const limitPlaceholder = input.status ? "$4" : "$3";
    const [rowsResult, countResult] = await Promise.all([
      this.executor.query<InvoiceRow>(
        [
          invoiceSelect(),
          "from invoices",
          "where organization_id = $1",
          statusClause,
          "order by created_at desc, id desc",
          `offset ${offsetPlaceholder}`,
          `limit ${limitPlaceholder}`,
        ].join(" "),
        rowsParams,
      ),
      this.executor.query<{ count: string }>(
        [
          "select count(*)::text as count",
          "from invoices",
          "where organization_id = $1",
          statusClause,
        ].join(" "),
        countParams,
      ),
    ]);
    const total = toCount(countResult.rows[0]?.count ?? 0);

    return {
      invoices: rowsResult.rows.map(invoiceFromRow),
      total,
      page: input.page,
      per_page: input.perPage,
      has_more: offset + input.perPage < total,
    };
  }

  async getInvoice(input: {
    organizationId: string;
    invoiceId: string;
  }): Promise<Invoice | null> {
    const result = await this.executor.query<InvoiceRow>(
      [
        invoiceSelect(),
        "from invoices",
        "where id = $1",
        "and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.invoiceId, input.organizationId],
    );
    return result.rows[0] ? invoiceFromRow(result.rows[0]) : null;
  }

  async getInvoiceSummary(
    organizationId: string,
  ): Promise<InvoiceSummaryResponse> {
    const result = await this.executor.query<{
      total_invoices: string;
      paid_invoices: string;
      open_invoices: string;
      total_paid: string | number | null;
    }>(
      [
        "select",
        "count(*)::text as total_invoices,",
        "count(*) filter (where status = 'paid')::text as paid_invoices,",
        "count(*) filter (where status = 'open')::text as open_invoices,",
        "coalesce(sum(amount_paid) filter (where status = 'paid'), 0) as total_paid",
        "from invoices",
        "where organization_id = $1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    return {
      total_invoices: toCount(row?.total_invoices ?? 0),
      paid_invoices: toCount(row?.paid_invoices ?? 0),
      open_invoices: toCount(row?.open_invoices ?? 0),
      total_paid: toAmount(row?.total_paid ?? 0),
      currency: "usd",
    };
  }

  async getInvoicePdfUrl(input: {
    organizationId: string;
    invoiceId: string;
  }): Promise<string | null | undefined> {
    const result = await this.executor.query<{ pdf_url: string | null }>(
      [
        "select pdf_url",
        "from invoices",
        "where id = $1",
        "and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.invoiceId, input.organizationId],
    );
    return result.rows[0]?.pdf_url;
  }

  async getFirstPaidInvoiceForGuarantee(
    organizationId: string,
  ): Promise<GuaranteeInvoice | null> {
    const result = await this.executor.query<GuaranteeInvoiceRow>(
      [
        "select id::text as id, stripe_invoice_id, amount_paid, currency, paid_at",
        "from invoices",
        "where organization_id = $1",
        "and status::text = 'paid'",
        "order by paid_at asc nulls last, created_at asc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      stripe_invoice_id: row.stripe_invoice_id,
      amount_paid: toAmount(row.amount_paid),
      currency: row.currency ?? "usd",
      paid_at: row.paid_at ? toIsoTimestamp(row.paid_at) : null,
    };
  }

  async recordGuaranteeClaim(input: {
    organizationId: string;
    refundId: string;
    claimedAt: string;
  }): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      [
        "update subscriptions",
        "set money_back_claimed_at = $2, money_back_refund_id = $3",
        "where organization_id = $1",
        "and money_back_claimed_at is null",
        "returning id::text as id",
      ].join(" "),
      [input.organizationId, input.claimedAt, input.refundId],
    );

    return result.rows.length > 0;
  }

  async markSubscriptionCanceledForGuarantee(input: {
    organizationId: string;
    updatedAt: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "update subscriptions",
        "set status = 'canceled', cancel_at_period_end = false, updated_at = $2",
        "where organization_id = $1",
      ].join(" "),
      [input.organizationId, input.updatedAt],
    );
  }

  private async saveBillingActivation(
    organizationId: string,
    input: PlanSelectionInput,
    options: { checkoutRequired: boolean; now: string },
  ): Promise<BillingActivation | null> {
    const result = await this.executor.query<OrganizationSettingsRow>(
      [
        "update organizations",
        "set settings = jsonb_set(",
        "coalesce(settings, '{}'::jsonb),",
        "'{billing_activation}',",
        "jsonb_build_object(",
        "'plan_id', $2::text,",
        "'billing_period', $3::text,",
        "'unit_count', $4::int,",
        "'building_count', $5::int,",
        "'checkout_required', $6::boolean,",
        "'selected_at', coalesce(settings->'billing_activation'->>'selected_at', $7::text),",
        "'updated_at', $7::text",
        "),",
        "true",
        ")",
        "where id = $1",
        "returning settings",
      ].join(" "),
      [
        organizationId,
        input.plan_id,
        input.billing_period,
        input.unit_count,
        input.building_count,
        options.checkoutRequired,
        options.now,
      ],
    );

    return readBillingActivation(result.rows[0]?.settings);
  }

  private async getPlanSelectionFromActivation(
    organizationId: string,
    activation: BillingActivation | null,
  ): Promise<PlanSelectionResponse> {
    const [subscription, creditAggregate] = await Promise.all([
      this.getLatestSubscription(organizationId),
      this.getCreditAggregate(organizationId),
    ]);
    const effectiveStatus = subscription
      ? effectiveSubscriptionStatus(subscription)
      : null;
    const hasPurchasedCredits = creditAggregate.packCount > 0;
    const hasActiveAccess =
      effectiveStatus === "active" ||
      effectiveStatus === "trialing" ||
      hasPurchasedCredits;
    const hasPausedSubscription = effectiveStatus === "paused";

    return {
      plan_id:
        typeof activation?.plan_id === "string" ? activation.plan_id : null,
      billing_period: activation?.billing_period === "annual" ? "annual" : null,
      unit_count:
        typeof activation?.unit_count === "number"
          ? activation.unit_count
          : null,
      building_count:
        typeof activation?.building_count === "number"
          ? activation.building_count
          : null,
      selected_at:
        typeof activation?.selected_at === "string"
          ? activation.selected_at
          : null,
      checkout_required: !hasActiveAccess && !hasPausedSubscription,
      has_active_access: hasActiveAccess,
      has_paused_subscription: hasPausedSubscription,
      subscription_status: effectiveStatus,
      trial_days_remaining: trialDaysRemaining(subscription, effectiveStatus),
    };
  }

  private async readBillingActivation(
    organizationId: string,
  ): Promise<BillingActivation | null> {
    const result = await this.executor.query<OrganizationSettingsRow>(
      "select settings from organizations where id = $1",
      [organizationId],
    );

    return readBillingActivation(result.rows[0]?.settings);
  }

  private async getLatestSubscription(
    organizationId: string,
  ): Promise<SubscriptionRow | null> {
    const result = await this.executor.query<SubscriptionRow>(
      [
        "select status::text as status, stripe_subscription_id, current_period_end, plan::text as plan, tier",
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0] ?? null;
  }

  private async getCreditAggregate(organizationId: string): Promise<{
    balance: CreditBalance;
    packCount: number;
  }> {
    const result = await this.executor.query<CreditAggregateRow>(
      [
        "select",
        "coalesce(sum(credits_purchased), 0) as total_purchased,",
        "coalesce(sum(credits_used), 0) as total_used,",
        "coalesce(sum(credits_remaining), 0) as total_remaining,",
        "count(*) as pack_count",
        "from audit_credits",
        "where organization_id = $1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    return {
      balance: {
        total_purchased: toCount(row?.total_purchased ?? 0),
        total_used: toCount(row?.total_used ?? 0),
        total_remaining: toCount(row?.total_remaining ?? 0),
      },
      packCount: toCount(row?.pack_count ?? 0),
    };
  }

  private async hasStartedFreeAudit(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<{ exists: boolean }>(
      [
        "select exists (",
        "select 1 from calculation_jobs",
        "where organization_id = $1 and status = any(array['pending','running','completed']::text[])",
        ") or exists (",
        "select 1 from reconciliation_snapshots",
        "where organization_id = $1 and status = any(array['draft','finalized']::text[])",
        ") as exists",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0]?.exists === true;
  }

  private async hasPropertyCapacity(organizationId: string): Promise<boolean> {
    const subscription = await this.getLatestSubscription(organizationId);

    if (
      !subscription ||
      !["active", "trialing"].includes(subscription.status)
    ) {
      return true;
    }

    if (String(subscription.plan ?? "").toLowerCase() === "enterprise") {
      return true;
    }

    const result = await this.executor.query<CountRow>(
      "select count(*) as count from properties where organization_id = $1",
      [organizationId],
    );

    return toCount(result.rows[0]?.count ?? 0) < SELF_SERVE_PROPERTY_LIMIT;
  }

  private async updateSubscription(
    sql: string,
    params: readonly unknown[],
  ): Promise<Subscription | null> {
    const result = await this.executor.query<SubscriptionRow>(sql, params);

    return result.rows[0] ? subscriptionFromRow(result.rows[0]) : null;
  }
}

function readBillingActivation(settings: unknown): BillingActivation | null {
  if (!isRecord(settings)) {
    return null;
  }

  const activation = settings.billing_activation;
  return isRecord(activation) ? activation : null;
}

function normalizeBillingActivation(
  activation: BillingActivation,
): BillingActivationState {
  return {
    plan_id: typeof activation.plan_id === "string" ? activation.plan_id : null,
    billing_period: activation.billing_period === "annual" ? "annual" : null,
    unit_count:
      typeof activation.unit_count === "number" ? activation.unit_count : null,
    building_count:
      typeof activation.building_count === "number"
        ? activation.building_count
        : null,
    checkout_required: activation.checkout_required === true,
  };
}

function effectiveSubscriptionStatus(row: SubscriptionRow): string {
  return effectiveSubscriptionStatusAt(row, new Date().toISOString());
}

function effectiveSubscriptionStatusAt(
  row: SubscriptionRow,
  referenceTimestamp: string,
): string {
  if (
    row.status !== "trialing" ||
    row.stripe_subscription_id ||
    !row.current_period_end
  ) {
    return row.status;
  }

  const periodEnd = toDate(row.current_period_end);
  const referenceDate = toDate(referenceTimestamp);

  if (!periodEnd || !referenceDate) {
    return row.status;
  }

  return periodEnd.getTime() < referenceDate.getTime() ? "paused" : row.status;
}

function trialDaysRemaining(
  row: SubscriptionRow | null,
  effectiveStatus: string | null,
): number | null {
  if (
    !row ||
    effectiveStatus !== "trialing" ||
    row.status !== "trialing" ||
    row.stripe_subscription_id ||
    !row.current_period_end
  ) {
    return null;
  }

  const periodEnd = toDate(row.current_period_end);

  if (!periodEnd) {
    return 0;
  }

  const remainingMs = periodEnd.getTime() - Date.now();

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(remainingMs / 86_400_000));
}

function toUsedFeature(row: FeatureUsageRow): UsedFeature[] {
  if (!isFeatureKey(row.feature_key)) {
    return [];
  }

  return [
    {
      key: row.feature_key,
      label: FEATURE_LABELS[row.feature_key],
      required_tier: FEATURE_TIERS[row.feature_key],
      first_used_at: row.first_used_at
        ? toIsoTimestamp(row.first_used_at)
        : null,
      last_used_at: row.last_used_at ? toIsoTimestamp(row.last_used_at) : null,
    },
  ];
}

function isFeatureKey(value: string): value is keyof typeof FEATURE_LABELS {
  return Object.prototype.hasOwnProperty.call(FEATURE_LABELS, value);
}

function toCount(value: string | number | bigint): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  return Number.parseInt(value, 10);
}

function toAmount(value: string | number): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function subscriptionSelect(): string {
  return ["select", subscriptionReturnFields()].join(" ");
}

function subscriptionReturnFields(): string {
  return [
    "id::text as id, organization_id::text as organization_id,",
    "plan::text as plan, status::text as status, pricing_model,",
    "building_count, unit_count, included_units, unit_overage_count, tier,",
    "billing_interval, stripe_customer_id, stripe_subscription_id,",
    "current_period_start, current_period_end, cancel_at_period_end,",
    "created_at, updated_at, money_back_claimed_at, money_back_refund_id",
  ].join(" ");
}

function subscriptionFromRow(row: SubscriptionRow): Subscription {
  return {
    id: requireString(row.id, "subscription id"),
    organization_id: requireString(
      row.organization_id,
      "subscription organization",
    ),
    plan: row.plan ?? "growth_v2",
    status: row.status,
    pricing_model: row.pricing_model ?? "per_building",
    building_count: toCount(row.building_count ?? 1),
    unit_count: row.unit_count === null ? null : toCount(row.unit_count ?? 0),
    included_units:
      row.included_units === null ? null : toCount(row.included_units ?? 0),
    unit_overage_count:
      row.unit_overage_count === null
        ? null
        : toCount(row.unit_overage_count ?? 0),
    tier: row.tier,
    billing_interval:
      row.billing_interval === "monthly" || row.billing_interval === "annual"
        ? row.billing_interval
        : null,
    stripe_customer_id: row.stripe_customer_id ?? null,
    stripe_subscription_id: row.stripe_subscription_id,
    current_period_start: toIsoTimestamp(
      row.current_period_start ?? row.current_period_end ?? new Date(0),
    ),
    current_period_end: row.current_period_end
      ? toIsoTimestamp(row.current_period_end)
      : toIsoTimestamp(new Date(0)),
    cancel_at_period_end: row.cancel_at_period_end === true,
    created_at: toIsoTimestamp(row.created_at ?? new Date(0)),
    updated_at: toIsoTimestamp(row.updated_at ?? new Date(0)),
    money_back_claimed_at: row.money_back_claimed_at
      ? toIsoTimestamp(row.money_back_claimed_at)
      : null,
    money_back_refund_id: row.money_back_refund_id ?? null,
  };
}

function requireString(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing ${label}`);
  }

  return value;
}

function saveOfferAttemptReturnFields(): string {
  return [
    "id::text as id, organization_id::text as organization_id,",
    "cancel_reason::text as cancel_reason, other_text,",
    "offer_shown::text as offer_shown, offer_accepted, stripe_coupon_id,",
    "created_at",
  ].join(" ");
}

function saveOfferAttemptFromRow(row: SaveOfferAttemptRow): SaveOfferAttempt {
  if (!isCancelReason(row.cancel_reason)) {
    throw new Error(`Unknown cancel reason: ${row.cancel_reason}`);
  }
  if (!isSaveOfferType(row.offer_shown)) {
    throw new Error(`Unknown save offer type: ${row.offer_shown}`);
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    cancel_reason: row.cancel_reason,
    other_text: row.other_text,
    offer_shown: row.offer_shown,
    offer_accepted: row.offer_accepted,
    stripe_coupon_id: row.stripe_coupon_id,
    created_at: toIsoTimestamp(row.created_at),
  };
}

function isCancelReason(
  value: string,
): value is SaveOfferAttempt["cancel_reason"] {
  return [
    "too_expensive",
    "not_using_enough",
    "missing_feature",
    "switching_competitor",
    "business_closed",
    "other",
  ].includes(value);
}

function isSaveOfferType(value: string): value is SaveOfferType {
  return ["discount_20pct_1inv", "feature_roadmap", "none"].includes(value);
}

function invoiceSelect(): string {
  return [
    "select id::text as id, organization_id::text as organization_id, subscription_id::text as subscription_id,",
    "stripe_invoice_id, amount_due, amount_paid, currency, status::text as status,",
    "period_start, period_end, due_date, paid_at, pdf_url, created_at",
  ].join(" ");
}

function invoiceFromRow(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    organization_id: row.organization_id,
    subscription_id: row.subscription_id,
    stripe_invoice_id: row.stripe_invoice_id,
    amount_due: toAmount(row.amount_due),
    amount_paid: toAmount(row.amount_paid),
    currency: row.currency,
    status: row.status,
    period_start: toIsoTimestamp(row.period_start),
    period_end: toIsoTimestamp(row.period_end),
    due_date: row.due_date ? toIsoTimestamp(row.due_date) : null,
    paid_at: row.paid_at ? toIsoTimestamp(row.paid_at) : null,
    pdf_url: row.pdf_url,
    created_at: toIsoTimestamp(row.created_at),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
