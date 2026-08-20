import { describe, expect, it } from "vitest";
import { PostgresStripeWebhookRepository } from "../adapters/db/stripe-webhooks";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type {
  InvoiceSnapshot,
  SubscriptionSnapshot,
  SubscriptionUpdateSnapshot,
} from "../domain/billing/webhook-repository";

type CapturedQuery = { sql: string; params: readonly unknown[] };

function captureExecutor(): {
  executor: PostgresExecutor;
  queries: CapturedQuery[];
} {
  const queries: CapturedQuery[] = [];
  const executor: PostgresExecutor = {
    async query<Row>(sql: string, params: readonly unknown[] = []) {
      queries.push({ sql, params });
      return { rows: [] as Row[] };
    },
    async transaction<Result>(
      operation: (executor: PostgresExecutor) => Promise<Result>,
    ) {
      return operation(executor);
    },
  };
  return { executor, queries };
}

const baseSnapshot: SubscriptionSnapshot = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  stripeSubscriptionId: "sub_123",
  stripeCustomerId: "cus_123",
  plan: "growth_v2",
  tier: "reconcile",
  status: "active",
  pricingModel: "per_unit",
  buildingCount: 2,
  unitCount: 50,
  includedUnits: 50,
  unitOverageCount: 0,
  currentPeriodStart: "2026-01-01T00:00:00.000Z",
  currentPeriodEnd: "2026-02-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  eventTs: "2026-06-29T12:00:00.000Z",
};

const updateSnapshot: SubscriptionUpdateSnapshot = {
  stripeSubscriptionId: baseSnapshot.stripeSubscriptionId,
  stripeCustomerId: baseSnapshot.stripeCustomerId,
  plan: baseSnapshot.plan,
  tier: baseSnapshot.tier,
  status: baseSnapshot.status,
  pricingModel: baseSnapshot.pricingModel,
  buildingCount: baseSnapshot.buildingCount,
  unitCount: baseSnapshot.unitCount,
  includedUnits: baseSnapshot.includedUnits,
  unitOverageCount: baseSnapshot.unitOverageCount,
  currentPeriodStart: baseSnapshot.currentPeriodStart,
  currentPeriodEnd: baseSnapshot.currentPeriodEnd,
  cancelAtPeriodEnd: baseSnapshot.cancelAtPeriodEnd,
  eventTs: "2026-06-29T12:00:00.000Z",
};

const invoiceSnapshot: InvoiceSnapshot = {
  organizationId: baseSnapshot.organizationId,
  subscriptionId: "22222222-2222-4222-8222-222222222222",
  stripeInvoiceId: "in_123",
  amountDue: 199,
  amountPaid: 0,
  currency: "usd",
  status: "open",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-02-01T00:00:00.000Z",
  dueDate: null,
  pdfUrl: null,
  hostedInvoiceUrl: "https://pay.stripe.test/in_123",
};

describe("Stripe webhook out-of-order ordering guard", () => {
  it("guards updateSubscriptionByStripeId on the event high-water mark", async () => {
    const { executor, queries } = captureExecutor();
    const repository = new PostgresStripeWebhookRepository(executor);

    await repository.updateSubscriptionByStripeId("sub_123", updateSnapshot);

    const { sql, params } = queries[0]!;
    // The update must refuse a strictly-older redelivered event.
    expect(sql).toContain("stripe_event_ts is null");
    expect(sql).toContain(">= stripe_event_ts");
    expect(sql).toContain(
      "stripe_event_ts = coalesce($14::timestamptz, stripe_event_ts)",
    );
    expect(params).toContain(updateSnapshot.eventTs);
  });

  it("guards markSubscriptionCanceled on the event high-water mark", async () => {
    const { executor, queries } = captureExecutor();
    const repository = new PostgresStripeWebhookRepository(executor);

    await repository.markSubscriptionCanceled(
      "sub_123",
      "2026-06-29T12:00:00.000Z",
    );

    const { sql, params } = queries[0]!;
    expect(sql).toContain("set status = 'canceled'");
    expect(sql).toContain(">= stripe_event_ts");
    expect(sql).toContain(
      "stripe_event_ts = coalesce($2::timestamptz, stripe_event_ts)",
    );
    expect(params).toEqual(["sub_123", "2026-06-29T12:00:00.000Z"]);
  });

  it("guards markSubscriptionPastDue on the event high-water mark", async () => {
    const { executor, queries } = captureExecutor();
    const repository = new PostgresStripeWebhookRepository(executor);

    await repository.markSubscriptionPastDue(
      "sub_123",
      "2026-06-29T12:00:00.000Z",
    );

    const { sql, params } = queries[0]!;
    expect(sql).toContain("set status = 'past_due'");
    expect(sql).toContain(">= stripe_event_ts");
    expect(sql).toContain(
      "stripe_event_ts = coalesce($2::timestamptz, stripe_event_ts)",
    );
    expect(params).toEqual(["sub_123", "2026-06-29T12:00:00.000Z"]);
  });

  it("guards the upsertSubscription conflict path on the high-water mark", async () => {
    const { executor, queries } = captureExecutor();
    const repository = new PostgresStripeWebhookRepository(executor);

    await repository.upsertSubscription(baseSnapshot);

    const { sql, params } = queries[0]!;
    // On conflict, only apply when the incoming event is not strictly older.
    expect(sql).toContain(
      "excluded.stripe_event_ts >= subscriptions.stripe_event_ts",
    );
    expect(sql).toContain(
      "stripe_event_ts = coalesce(excluded.stripe_event_ts, subscriptions.stripe_event_ts)",
    );
    expect(params).toContain(baseSnapshot.eventTs);
  });

  it("passes a null high-water mark through untouched (fail-open to apply)", async () => {
    const { executor, queries } = captureExecutor();
    const repository = new PostgresStripeWebhookRepository(executor);

    await repository.markSubscriptionPastDue("sub_123", null);

    const { params } = queries[0]!;
    expect(params).toEqual(["sub_123", null]);
  });

  it("does not let a delayed invoice.created overwrite an already-paid invoice", async () => {
    const { executor, queries } = captureExecutor();
    const repository = new PostgresStripeWebhookRepository(executor);

    await repository.upsertInvoice(invoiceSnapshot);

    const { sql, params } = queries[0]!;
    expect(sql).toContain("on conflict (stripe_invoice_id)");
    expect(sql).toContain("where invoices.status != 'paid'");
    expect(params).toContain(invoiceSnapshot.stripeInvoiceId);
    expect(params).toContain(invoiceSnapshot.status);
  });

  it("does not let a delayed invoice.payment_failed reopen an already-paid invoice", async () => {
    const { executor, queries } = captureExecutor();
    const repository = new PostgresStripeWebhookRepository(executor);

    await repository.markInvoiceOpen("in_123");

    const { sql, params } = queries[0]!;
    expect(sql).toContain("set status = 'open'");
    expect(sql).toContain("and status != 'paid'");
    expect(params).toEqual(["in_123"]);
  });
});
