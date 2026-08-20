import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresBillingRepository } from "../adapters/db/billing";
import { BillingTrialPausedError } from "../domain/billing/repository";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: ORG_ID,
    plan: "growth_v2",
    status: "active",
    pricing_model: "per_unit",
    building_count: 2,
    unit_count: 50,
    included_units: 25,
    unit_overage_count: 25,
    tier: "reconcile",
    billing_interval: "annual",
    stripe_customer_id: "cus_123",
    stripe_subscription_id: "sub_123",
    current_period_start: "2026-06-01T00:00:00.000Z",
    current_period_end: "2027-06-01T00:00:00.000Z",
    cancel_at_period_end: false,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    money_back_claimed_at: null,
    money_back_refund_id: null,
    ...overrides,
  };
}

function saveOfferAttemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    organization_id: ORG_ID,
    cancel_reason: "too_expensive",
    other_text: "budget changed",
    offer_shown: "discount_20pct_1inv",
    offer_accepted: null,
    stripe_coupon_id: null,
    created_at: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

class QueueExecutor implements PostgresExecutor {
  readonly statements: RecordedStatement[] = [];

  constructor(private readonly responses: unknown[][]) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push({ sql, params });
    const rows = this.responses.shift() ?? [];

    return { rows: rows as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

describe("postgres billing repository", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Trial fixtures below use a fixed window (2026-06-13 → 2026-07-13).
  // effectiveSubscriptionStatus() compares current_period_end against wall-clock
  // time, so once that window is in the past a card-less trial correctly reads as
  // expired and has_active_access flips to false. Pin the clock inside the window
  // so these tests keep asserting the live-trial path rather than the expiry path
  // (which has its own dedicated coverage).
  const withinTrialWindow = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T00:00:00Z"));
  };

  it("updates billing activation settings with org scope and preserves selected_at", async () => {
    const executor = new QueueExecutor([
      [
        {
          settings: {
            theme: "dark",
            billing_activation: {
              plan_id: "reconcile",
              billing_period: "annual",
              unit_count: 50,
              building_count: 2,
              selected_at: "2026-06-01T00:00:00Z",
              updated_at: "2026-06-12T00:00:00.000Z",
            },
          },
        },
      ],
      [],
      [
        {
          total_purchased: "0",
          total_used: "0",
          total_remaining: "0",
          pack_count: "0",
        },
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    const response = await repository.savePlanSelection(ORG_ID, {
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 50,
      building_count: 2,
    });

    expect(response).toMatchObject({
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 50,
      building_count: 2,
      selected_at: "2026-06-01T00:00:00Z",
    });
    expect(executor.statements[0]?.sql).toContain("jsonb_set");
    expect(executor.statements[0]?.sql).toContain("where id = $1");
    expect(executor.statements[0]?.params.slice(0, 5)).toEqual([
      ORG_ID,
      "reconcile",
      "annual",
      50,
      2,
    ]);
  });

  it("computes plan selection access from active trial and credit purchases", async () => {
    const periodEnd = new Date(Date.now() + 2.5 * 86_400_000).toISOString();
    const executor = new QueueExecutor([
      [
        {
          settings: {
            billing_activation: {
              plan_id: "reconcile",
              billing_period: "annual",
              unit_count: 25,
              building_count: 1,
              selected_at: "2026-06-12T00:00:00Z",
            },
          },
        },
      ],
      [
        {
          status: "trialing",
          stripe_subscription_id: null,
          current_period_end: periodEnd,
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [
        {
          total_purchased: "0",
          total_used: "0",
          total_remaining: "0",
          pack_count: "0",
        },
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    const result = await repository.getPlanSelection(ORG_ID);

    expect(result).toMatchObject({
      plan_id: "reconcile",
      has_active_access: true,
      has_paused_subscription: false,
      checkout_required: false,
      subscription_status: "trialing",
    });
    expect(result.trial_days_remaining).toBeGreaterThanOrEqual(2);
  });

  it("treats expired no-card trials as paused", async () => {
    const executor = new QueueExecutor([
      [{ settings: {} }],
      [
        {
          status: "trialing",
          stripe_subscription_id: null,
          current_period_end: "2026-01-01T00:00:00Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [
        {
          total_purchased: "0",
          total_used: "0",
          total_remaining: "0",
          pack_count: "0",
        },
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(repository.getPlanSelection(ORG_ID)).resolves.toMatchObject({
      has_active_access: false,
      has_paused_subscription: true,
      checkout_required: false,
      subscription_status: "paused",
    });
  });

  it("builds free audit status for subscribed organizations", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "active",
          stripe_subscription_id: "sub_123",
          current_period_end: "2026-07-01T00:00:00Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [{ exists: true }],
      [
        {
          total_purchased: "0",
          total_used: "0",
          total_remaining: "0",
          pack_count: "0",
        },
      ],
      [
        {
          status: "active",
          stripe_subscription_id: "sub_123",
          current_period_end: "2026-07-01T00:00:00Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [{ count: "1" }],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(repository.getFreeAuditStatus(ORG_ID)).resolves.toMatchObject({
      has_subscription: true,
      has_paused_subscription: false,
      free_audit_consumed: false,
      can_run_reconciliation: true,
      can_view_draft_report: true,
    });
    expect(
      executor.statements.map((statement) => statement.sql).join(" "),
    ).toContain("organization_id = $1");
  });

  it("builds free audit status for paused, credit, and no-access organizations", async () => {
    const paused = new PostgresBillingRepository(
      new QueueExecutor([
        [
          {
            status: "paused",
            stripe_subscription_id: null,
            current_period_end: null,
            plan: "growth_v2",
            tier: "reconcile",
          },
        ],
        [{ exists: true }],
        [
          {
            total_purchased: "0",
            total_used: "0",
            total_remaining: "0",
            pack_count: "0",
          },
        ],
        [],
      ]),
    );
    const credits = new PostgresBillingRepository(
      new QueueExecutor([
        [],
        [{ exists: true }],
        [
          {
            total_purchased: "5",
            total_used: "2",
            total_remaining: "3",
            pack_count: "1",
          },
        ],
        [],
      ]),
    );
    const none = new PostgresBillingRepository(
      new QueueExecutor([
        [],
        [{ exists: true }],
        [
          {
            total_purchased: "0",
            total_used: "0",
            total_remaining: "0",
            pack_count: "0",
          },
        ],
        [],
      ]),
    );

    await expect(paused.getFreeAuditStatus(ORG_ID)).resolves.toMatchObject({
      has_paused_subscription: true,
      free_audit_consumed: true,
      can_run_reconciliation: false,
    });
    await expect(credits.getFreeAuditStatus(ORG_ID)).resolves.toMatchObject({
      has_ever_purchased: true,
      credit_balance: {
        total_purchased: 5,
        total_used: 2,
        total_remaining: 3,
      },
      can_download_reports: true,
    });
    await expect(none.getFreeAuditStatus(ORG_ID)).resolves.toMatchObject({
      has_subscription: false,
      free_audit_consumed: true,
      can_add_property: false,
    });
  });

  it("does not grant free audit access for expired no-card trials", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "trialing",
          stripe_subscription_id: null,
          current_period_end: "2026-01-01T00:00:00Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [{ exists: true }],
      [
        {
          total_purchased: "0",
          total_used: "0",
          total_remaining: "0",
          pack_count: "0",
        },
      ],
      [
        {
          status: "trialing",
          stripe_subscription_id: null,
          current_period_end: "2026-01-01T00:00:00Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [{ count: "1" }],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(repository.getFreeAuditStatus(ORG_ID)).resolves.toMatchObject({
      has_subscription: false,
      has_paused_subscription: true,
      free_audit_consumed: true,
      can_run_reconciliation: false,
      can_view_draft_report: false,
      can_download_reports: false,
    });
  });

  it("aggregates credits and orders history by purchase date descending", async () => {
    const aggregateExecutor = new QueueExecutor([
      [
        {
          total_purchased: "7",
          total_used: "3",
          total_remaining: "4",
          pack_count: "2",
        },
      ],
    ]);
    const historyExecutor = new QueueExecutor([
      [
        {
          id: "credit-new",
          organization_id: ORG_ID,
          credits_purchased: 2,
          credits_used: 0,
          credits_remaining: 2,
          unit_price_cents: 10000,
          stripe_payment_intent_id: null,
          stripe_checkout_session_id: "cs_new",
          purchased_at: "2026-06-12T00:00:00Z",
        },
        {
          id: "credit-old",
          organization_id: ORG_ID,
          credits_purchased: 5,
          credits_used: 3,
          credits_remaining: 2,
          unit_price_cents: 10000,
          stripe_payment_intent_id: "pi_old",
          stripe_checkout_session_id: null,
          purchased_at: "2026-06-01T00:00:00Z",
        },
      ],
    ]);

    await expect(
      new PostgresBillingRepository(aggregateExecutor).getCredits(ORG_ID),
    ).resolves.toEqual({
      total_purchased: 7,
      total_used: 3,
      total_remaining: 4,
    });
    const history = await new PostgresBillingRepository(
      historyExecutor,
    ).getCreditHistory(ORG_ID);

    expect(history.map((pack) => pack.id)).toEqual([
      "credit-new",
      "credit-old",
    ]);
    expect(historyExecutor.statements[0]?.sql).toContain(
      "order by purchased_at desc",
    );
  });

  it("lists known used features with current tier", async () => {
    const executor = new QueueExecutor([
      [
        {
          feature_key: "cam_reconciliation",
          first_used_at: "2026-06-10T00:00:00Z",
          last_used_at: "2026-06-12T00:00:00Z",
        },
        {
          feature_key: "support_access",
          first_used_at: "2026-06-10T00:00:00Z",
          last_used_at: "2026-06-12T00:00:00Z",
        },
        {
          feature_key: "published_unit_pricing",
          first_used_at: "2026-06-10T00:00:00Z",
          last_used_at: "2026-06-12T00:00:00Z",
        },
        {
          feature_key: "unknown_feature",
          first_used_at: "2026-06-10T00:00:00Z",
          last_used_at: "2026-06-12T00:00:00Z",
        },
      ],
      [{ tier: "reconcile" }],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(repository.getFeatureUsage(ORG_ID)).resolves.toEqual({
      current_tier: "reconcile",
      used_features: [
        {
          key: "cam_reconciliation",
          label: "CAM reconciliation",
          required_tier: "reconcile",
          first_used_at: "2026-06-10T00:00:00.000Z",
          last_used_at: "2026-06-12T00:00:00.000Z",
        },
        {
          key: "support_access",
          label: "Support access",
          required_tier: "reconcile",
          first_used_at: "2026-06-10T00:00:00.000Z",
          last_used_at: "2026-06-12T00:00:00.000Z",
        },
        {
          key: "published_unit_pricing",
          label: "Published pricing for every unit count",
          required_tier: "reconcile",
          first_used_at: "2026-06-10T00:00:00.000Z",
          last_used_at: "2026-06-12T00:00:00.000Z",
        },
      ],
    });
    expect(executor.statements[0]?.sql).toContain("from feature_usage_events");
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
  });

  it("reads billing customer and checkout state with organization scope", async () => {
    const executor = new QueueExecutor([
      [{ stripe_customer_id: "cus_123" }],
      [
        {
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123",
          status: "active",
          current_period_end: "2026-07-01T00:00:00Z",
        },
      ],
      [{ exists: true }],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(repository.getBillingCustomer(ORG_ID)).resolves.toEqual({
      stripe_customer_id: "cus_123",
    });
    await expect(repository.getCheckoutBillingState(ORG_ID)).resolves.toEqual({
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      status: "active",
      current_period_end: "2026-07-01T00:00:00.000Z",
    });
    await expect(repository.hasLocalSubscription(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[1]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[2]?.sql).toContain("select exists");
    expect(executor.statements[2]?.sql).toContain("from subscriptions");
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
    expect(executor.statements[1]?.params).toEqual([ORG_ID]);
    expect(executor.statements[2]?.params).toEqual([ORG_ID]);
  });

  it("reads current subscription with organization scope", async () => {
    const executor = new QueueExecutor([[subscriptionRow()]]);
    const repository = new PostgresBillingRepository(executor);

    await expect(repository.getSubscription(ORG_ID)).resolves.toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization_id: ORG_ID,
      plan: "growth_v2",
      status: "active",
      pricing_model: "per_unit",
      building_count: 2,
      unit_count: 50,
      billing_interval: "annual",
      stripe_subscription_id: "sub_123",
      current_period_end: "2027-06-01T00:00:00.000Z",
      cancel_at_period_end: false,
    });
    expect(executor.statements[0]?.sql).toContain("from subscriptions");
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
  });

  it("updates subscription cancellation lifecycle with organization scope", async () => {
    const executor = new QueueExecutor([
      [subscriptionRow({ cancel_at_period_end: true })],
      [subscriptionRow({ status: "canceled" })],
      [subscriptionRow({ cancel_at_period_end: false })],
      [
        subscriptionRow({
          status: "active",
          current_period_start: "2026-06-13T00:00:00.000Z",
          current_period_end: "2027-06-13T00:00:00.000Z",
        }),
      ],
      [],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.scheduleSubscriptionCancel(ORG_ID, "2026-06-13T00:00:00.000Z"),
    ).resolves.toMatchObject({ cancel_at_period_end: true });
    await expect(
      repository.cancelSubscriptionImmediately(
        ORG_ID,
        "2026-06-13T00:00:00.000Z",
      ),
    ).resolves.toMatchObject({ status: "canceled" });
    await expect(
      repository.resumeScheduledSubscription(
        ORG_ID,
        "2026-06-13T00:00:00.000Z",
      ),
    ).resolves.toMatchObject({ cancel_at_period_end: false });
    await expect(
      repository.resumePausedSubscription(ORG_ID, {
        status: "active",
        cancel_at_period_end: false,
        current_period_start: "2026-06-13T00:00:00.000Z",
        current_period_end: "2027-06-13T00:00:00.000Z",
        updated_at: "2026-06-13T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      status: "active",
      current_period_start: "2026-06-13T00:00:00.000Z",
      current_period_end: "2027-06-13T00:00:00.000Z",
    });
    await repository.markCancelAttemptDeclined({
      organizationId: ORG_ID,
      attemptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    expect(executor.statements[0]?.sql).toContain(
      "set cancel_at_period_end = true",
    );
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[0]?.params).toEqual([
      ORG_ID,
      "2026-06-13T00:00:00.000Z",
    ]);
    expect(executor.statements[1]?.sql).toContain("status = 'canceled'");
    expect(executor.statements[2]?.sql).toContain(
      "set cancel_at_period_end = false",
    );
    expect(executor.statements[3]?.sql).toContain(
      "status = $2::subscription_status",
    );
    expect(executor.statements[3]?.sql).toContain("current_period_start = $5");
    expect(executor.statements[3]?.sql).toContain("current_period_end = $6");
    expect(executor.statements[4]?.sql).toContain("update cancel_attempts");
    expect(executor.statements[4]?.sql).toContain("and organization_id = $2");
    expect(executor.statements[4]?.params).toEqual([
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ORG_ID,
    ]);
  });

  it("creates and reads save-offer attempts with organization scope", async () => {
    const executor = new QueueExecutor([
      [saveOfferAttemptRow()],
      [
        saveOfferAttemptRow({
          offer_accepted: true,
          stripe_coupon_id: "coupon",
        }),
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.createSaveOfferAttempt({
        organizationId: ORG_ID,
        reason: "too_expensive",
        otherText: "budget changed",
        offerType: "discount_20pct_1inv",
      }),
    ).resolves.toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      organization_id: ORG_ID,
      cancel_reason: "too_expensive",
      other_text: "budget changed",
      offer_shown: "discount_20pct_1inv",
    });
    await expect(
      repository.getSaveOfferAttempt({
        organizationId: ORG_ID,
        attemptId: "44444444-4444-4444-8444-444444444444",
      }),
    ).resolves.toMatchObject({
      offer_accepted: true,
      stripe_coupon_id: "coupon",
    });
    expect(executor.statements[0]?.sql).toContain(
      "insert into cancel_attempts",
    );
    expect(executor.statements[0]?.sql).toContain("$2::cancel_reason");
    expect(executor.statements[0]?.sql).toContain("$4::save_offer_type");
    expect(executor.statements[0]?.params).toEqual([
      ORG_ID,
      "too_expensive",
      "budget changed",
      "discount_20pct_1inv",
    ]);
    expect(executor.statements[1]?.sql).toContain("from cancel_attempts");
    expect(executor.statements[1]?.sql).toContain("and organization_id = $2");
    expect(executor.statements[1]?.params).toEqual([
      "44444444-4444-4444-8444-444444444444",
      ORG_ID,
    ]);
  });

  it("marks save offers accepted and declined with organization scope", async () => {
    const executor = new QueueExecutor([[], []]);
    const repository = new PostgresBillingRepository(executor);

    await repository.markSaveOfferAccepted({
      organizationId: ORG_ID,
      attemptId: "44444444-4444-4444-8444-444444444444",
      couponId: "coupon_save_20",
    });
    await repository.markCancelAttemptDeclined({
      organizationId: ORG_ID,
      attemptId: "55555555-5555-4555-8555-555555555555",
    });

    expect(executor.statements[0]?.sql).toContain("set offer_accepted = true");
    expect(executor.statements[0]?.sql).toContain("stripe_coupon_id = $3");
    expect(executor.statements[0]?.sql).toContain("and organization_id = $2");
    expect(executor.statements[0]?.params).toEqual([
      "44444444-4444-4444-8444-444444444444",
      ORG_ID,
      "coupon_save_20",
    ]);
    expect(executor.statements[1]?.sql).toContain("set offer_accepted = false");
    expect(executor.statements[1]?.sql).toContain("and organization_id = $2");
    expect(executor.statements[1]?.params).toEqual([
      "55555555-5555-4555-8555-555555555555",
      ORG_ID,
    ]);
  });

  it("reads organization billing profile with id scope", async () => {
    const executor = new QueueExecutor([
      [{ name: "Test Org", billing_email: "billing@example.test" }],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.getOrganizationBillingProfile(ORG_ID),
    ).resolves.toEqual({
      name: "Test Org",
      billing_email: "billing@example.test",
    });
    expect(executor.statements[0]?.sql).toContain("where id = $1");
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
  });

  it("updates Stripe customer id with organization scope", async () => {
    const executor = new QueueExecutor([
      [{ stripe_customer_id: "cus_123" }],
      [],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.saveStripeCustomerId(ORG_ID, "cus_123"),
    ).resolves.toBe(true);

    expect(executor.statements[0]?.sql).toContain("update subscriptions");
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[0]?.sql).toContain(
      "returning stripe_customer_id",
    );
    expect(executor.statements[0]?.params).toEqual([ORG_ID, "cus_123"]);
    await expect(
      repository.saveStripeCustomerId(ORG_ID, "cus_missing"),
    ).resolves.toBe(false);
  });

  it("preserves organization settings when checkout activation is persisted", async () => {
    const executor = new QueueExecutor([[]]);
    const repository = new PostgresBillingRepository(executor);

    await repository.saveCheckoutActivation(ORG_ID, {
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 75,
      building_count: 3,
    });

    expect(executor.statements[0]?.sql).toContain("jsonb_set");
    expect(executor.statements[0]?.sql).toContain(
      "coalesce(settings, '{}'::jsonb)",
    );
    expect(executor.statements[0]?.sql).toContain("where id = $1");
    expect(executor.statements[0]?.params.slice(0, 5)).toEqual([
      ORG_ID,
      "reconcile",
      "annual",
      75,
      3,
    ]);
  });

  it("starts a no-card trial with activation settings and a local subscription", async () => {
    withinTrialWindow();
    const executor = new QueueExecutor([
      [],
      [
        {
          settings: {
            billing_activation: {
              plan_id: "reconcile",
              billing_period: "annual",
              unit_count: 75,
              building_count: 3,
              checkout_required: false,
              selected_at: "2026-06-13T00:00:00.000Z",
            },
          },
        },
      ],
      [],
      [
        {
          status: "trialing",
          stripe_subscription_id: null,
          current_period_end: "2026-07-13T00:00:00.000Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [
        {
          total_purchased: "0",
          total_used: "0",
          total_remaining: "0",
          pack_count: "0",
        },
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    const result = await repository.startTrial(ORG_ID, {
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 75,
      building_count: 3,
      startedAt: "2026-06-13T00:00:00.000Z",
      periodEnd: "2026-07-13T00:00:00.000Z",
      includedUnits: 25,
    });

    expect(result).toMatchObject({
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 75,
      building_count: 3,
      checkout_required: false,
      has_active_access: true,
      subscription_status: "trialing",
    });
    expect(executor.statements[0]?.sql).toContain("from subscriptions");
    expect(executor.statements[1]?.sql).toContain(
      "'checkout_required', $6::boolean",
    );
    expect(executor.statements[1]?.params.slice(0, 7)).toEqual([
      ORG_ID,
      "reconcile",
      "annual",
      75,
      3,
      false,
      "2026-06-13T00:00:00.000Z",
    ]);
    expect(executor.statements[2]?.sql).toContain("insert into subscriptions");
    expect(executor.statements[2]?.sql).toContain(
      "on conflict (organization_id) do update set",
    );
    expect(executor.statements[2]?.params).toEqual([
      ORG_ID,
      "reconcile",
      "annual",
      3,
      75,
      25,
      50,
      "2026-06-13T00:00:00.000Z",
      "2026-07-13T00:00:00.000Z",
    ]);
  });

  it("does not restart paused local trials", async () => {
    const executor = new QueueExecutor([[{ status: "paused" }]]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.startTrial(ORG_ID, {
        plan_id: "reconcile",
        billing_period: "annual",
        unit_count: 25,
        building_count: 1,
        startedAt: "2026-06-13T00:00:00.000Z",
        periodEnd: "2026-07-13T00:00:00.000Z",
        includedUnits: 25,
      }),
    ).rejects.toBeInstanceOf(BillingTrialPausedError);
    expect(executor.statements).toHaveLength(1);
  });

  it("treats expired cardless trial rows as paused during trial start", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "trialing",
          stripe_subscription_id: null,
          current_period_end: "2026-06-01T00:00:00.000Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.startTrial(ORG_ID, {
        plan_id: "reconcile",
        billing_period: "annual",
        unit_count: 25,
        building_count: 1,
        startedAt: "2026-06-13T00:00:00.000Z",
        periodEnd: "2026-07-13T00:00:00.000Z",
        includedUnits: 25,
      }),
    ).rejects.toBeInstanceOf(BillingTrialPausedError);
    expect(executor.statements).toHaveLength(1);
  });

  it("updates existing local trial rows when trial selection changes", async () => {
    withinTrialWindow();
    const executor = new QueueExecutor([
      [
        {
          status: "trialing",
          stripe_subscription_id: null,
          current_period_end: "2026-07-01T00:00:00.000Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [
        {
          settings: {
            billing_activation: {
              plan_id: "reconcile",
              billing_period: "annual",
              unit_count: 50,
              building_count: 2,
              checkout_required: false,
              selected_at: "2026-06-13T00:00:00.000Z",
            },
          },
        },
      ],
      [],
      [
        {
          status: "trialing",
          stripe_subscription_id: null,
          current_period_end: "2026-07-13T00:00:00.000Z",
          plan: "growth_v2",
          tier: "reconcile",
        },
      ],
      [
        {
          total_purchased: "0",
          total_used: "0",
          total_remaining: "0",
          pack_count: "0",
        },
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.startTrial(ORG_ID, {
        plan_id: "reconcile",
        billing_period: "annual",
        unit_count: 50,
        building_count: 2,
        startedAt: "2026-06-13T00:00:00.000Z",
        periodEnd: "2026-07-13T00:00:00.000Z",
        includedUnits: 25,
      }),
    ).resolves.toMatchObject({
      unit_count: 50,
      building_count: 2,
      subscription_status: "trialing",
    });
    expect(executor.statements[2]?.sql).toContain("insert into subscriptions");
    expect(executor.statements[2]?.params).toEqual([
      ORG_ID,
      "reconcile",
      "annual",
      2,
      50,
      25,
      25,
      "2026-06-13T00:00:00.000Z",
      "2026-07-13T00:00:00.000Z",
    ]);
  });

  it("lists invoices with organization scope, status filtering, and pagination metadata", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: "invoice-paid",
          organization_id: ORG_ID,
          subscription_id: "subscription-1",
          stripe_invoice_id: "in_123",
          amount_due: "10000",
          amount_paid: "10000",
          currency: "usd",
          status: "paid",
          period_start: "2026-06-01T00:00:00.000Z",
          period_end: "2026-06-30T00:00:00.000Z",
          due_date: null,
          paid_at: "2026-06-02T00:00:00.000Z",
          pdf_url: "https://stripe.test/invoice.pdf",
          created_at: "2026-06-02T00:00:00.000Z",
        },
      ],
      [{ count: "3" }],
    ]);
    const repository = new PostgresBillingRepository(executor);

    const result = await repository.listInvoices({
      organizationId: ORG_ID,
      status: "paid",
      page: 2,
      perPage: 1,
    });

    expect(result).toMatchObject({
      total: 3,
      page: 2,
      per_page: 1,
      has_more: true,
      invoices: [
        {
          id: "invoice-paid",
          status: "paid",
          amount_due: 10000,
          amount_paid: 10000,
          pdf_url: "https://stripe.test/invoice.pdf",
        },
      ],
    });
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[0]?.sql).toContain("and status::text = $2");
    expect(executor.statements[0]?.sql).toContain("offset $3");
    expect(executor.statements[0]?.sql).toContain("limit $4");
    expect(executor.statements[0]?.params).toEqual([ORG_ID, "paid", 1, 1]);
    expect(executor.statements[1]?.params).toEqual([ORG_ID, "paid"]);
  });

  it("reads invoice detail and PDF URLs only inside the organization", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: "invoice-open",
          organization_id: ORG_ID,
          subscription_id: null,
          stripe_invoice_id: null,
          amount_due: 5000,
          amount_paid: 0,
          currency: "usd",
          status: "open",
          period_start: "2026-06-01T00:00:00.000Z",
          period_end: "2026-06-30T00:00:00.000Z",
          due_date: "2026-06-15T00:00:00.000Z",
          paid_at: null,
          pdf_url: null,
          created_at: "2026-06-02T00:00:00.000Z",
        },
      ],
      [{ pdf_url: "https://stripe.test/open.pdf" }],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.getInvoice({
        organizationId: ORG_ID,
        invoiceId: "invoice-open",
      }),
    ).resolves.toMatchObject({
      id: "invoice-open",
      organization_id: ORG_ID,
      amount_due: 5000,
      amount_paid: 0,
      due_date: "2026-06-15T00:00:00.000Z",
      paid_at: null,
    });
    await expect(
      repository.getInvoicePdfUrl({
        organizationId: ORG_ID,
        invoiceId: "invoice-open",
      }),
    ).resolves.toBe("https://stripe.test/open.pdf");
    expect(executor.statements[0]?.sql).toContain("where id = $1");
    expect(executor.statements[0]?.sql).toContain("and organization_id = $2");
    expect(executor.statements[0]?.params).toEqual(["invoice-open", ORG_ID]);
    expect(executor.statements[1]?.sql).toContain("where id = $1");
    expect(executor.statements[1]?.sql).toContain("and organization_id = $2");
    expect(executor.statements[1]?.params).toEqual(["invoice-open", ORG_ID]);
  });

  it("summarizes invoices for an organization", async () => {
    const executor = new QueueExecutor([
      [
        {
          total_invoices: "4",
          paid_invoices: "2",
          open_invoices: "1",
          total_paid: "25000",
        },
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(repository.getInvoiceSummary(ORG_ID)).resolves.toEqual({
      total_invoices: 4,
      paid_invoices: 2,
      open_invoices: 1,
      total_paid: 25000,
      currency: "usd",
    });
    expect(executor.statements[0]?.sql).toContain(
      "count(*) filter (where status = 'paid')",
    );
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
  });

  it("reads the first paid invoice for guarantee eligibility", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: "invoice-paid",
          stripe_invoice_id: "in_paid",
          amount_paid: "1200",
          currency: "usd",
          paid_at: "2026-06-02T00:00:00.000Z",
        },
      ],
    ]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.getFirstPaidInvoiceForGuarantee(ORG_ID),
    ).resolves.toEqual({
      id: "invoice-paid",
      stripe_invoice_id: "in_paid",
      amount_paid: 1200,
      currency: "usd",
      paid_at: "2026-06-02T00:00:00.000Z",
    });
    expect(executor.statements[0]?.sql).toContain("from invoices");
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[0]?.sql).toContain("and status::text = 'paid'");
    expect(executor.statements[0]?.sql).toContain(
      "order by paid_at asc nulls last",
    );
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
  });

  it("records guarantee claims and cancellation with organization scope", async () => {
    const executor = new QueueExecutor([[{ id: "subscription-1" }], [], []]);
    const repository = new PostgresBillingRepository(executor);

    await expect(
      repository.recordGuaranteeClaim({
        organizationId: ORG_ID,
        refundId: "re_123",
        claimedAt: "2026-06-13T00:00:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      repository.recordGuaranteeClaim({
        organizationId: ORG_ID,
        refundId: "re_456",
        claimedAt: "2026-06-13T00:00:00.000Z",
      }),
    ).resolves.toBe(false);
    await repository.markSubscriptionCanceledForGuarantee({
      organizationId: ORG_ID,
      updatedAt: "2026-06-13T00:00:00.000Z",
    });

    expect(executor.statements[0]?.sql).toContain(
      "set money_back_claimed_at = $2, money_back_refund_id = $3",
    );
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[0]?.sql).toContain(
      "and money_back_claimed_at is null",
    );
    expect(executor.statements[0]?.sql).toContain("returning id::text as id");
    expect(executor.statements[0]?.params).toEqual([
      ORG_ID,
      "2026-06-13T00:00:00.000Z",
      "re_123",
    ]);
    expect(executor.statements[2]?.sql).toContain("status = 'canceled'");
    expect(executor.statements[2]?.sql).toContain(
      "cancel_at_period_end = false",
    );
    expect(executor.statements[2]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[2]?.params).toEqual([
      ORG_ID,
      "2026-06-13T00:00:00.000Z",
    ]);
  });

  it("checks redeemed winback offers with organization scope", async () => {
    const redeemedExecutor = new QueueExecutor([
      [{ redeemed_offer_tier: "offer_50" }],
    ]);
    const emptyExecutor = new QueueExecutor([[{ redeemed_offer_tier: null }]]);

    await expect(
      new PostgresBillingRepository(redeemedExecutor).hasRedeemedWinbackOffer(
        ORG_ID,
      ),
    ).resolves.toBe(true);
    await expect(
      new PostgresBillingRepository(emptyExecutor).hasRedeemedWinbackOffer(
        ORG_ID,
      ),
    ).resolves.toBe(false);
    expect(redeemedExecutor.statements[0]?.sql).toContain(
      "from free_audit_winback_offers",
    );
    expect(redeemedExecutor.statements[0]?.sql).toContain(
      "where organization_id = $1",
    );
    expect(redeemedExecutor.statements[0]?.params).toEqual([ORG_ID]);
  });
});
