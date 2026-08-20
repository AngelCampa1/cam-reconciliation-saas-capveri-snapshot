import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import type {
  InvoiceSnapshot,
  StripeEventClaim,
  StripeWebhookRepository,
  SubscriptionSnapshot,
  SubscriptionUpdateSnapshot,
  TrialEmailClaim,
  TrialEmailType,
} from "../domain/billing/webhook-repository";
import type {
  CrmEventInput,
  CrmRepository,
} from "../domain/crm/repository";
import type { AppEnv } from "../env";
import { createStripeWebhookRoutes } from "../http/stripe-webhook-routes";
import type { AuthVariables } from "../middleware/auth";

const NOW = new Date("2026-06-12T12:00:00.000Z");
const ORG_ID = "11111111-1111-4111-8111-111111111111";

class MemoryStripeWebhookRepository implements StripeWebhookRepository {
  claimedEvents = new Set<string>();
  completedEvents: string[] = [];
  releasedEvents: string[] = [];
  duplicateEvents = new Set<string>();
  organizationByCustomer = new Map<string, string>([["cus_123", ORG_ID]]);
  subscriptionIdByStripeId = new Map<string, string>([
    ["sub_123", "33333333-3333-4333-8333-333333333333"],
  ]);
  subscriptions: SubscriptionSnapshot[] = [];
  subscriptionUpdates: Array<{
    stripeSubscriptionId: string;
    snapshot: SubscriptionUpdateSnapshot;
  }> = [];
  canceledSubscriptions: string[] = [];
  pastDueSubscriptions: string[] = [];
  canceledEventTimestamps: Array<string | null> = [];
  pastDueEventTimestamps: Array<string | null> = [];
  checkoutCompleteOrganizations: string[] = [];
  invoices: InvoiceSnapshot[] = [];
  existingInvoices = new Set<string>();
  paidInvoices: Array<{
    stripeInvoiceId: string;
    amountPaid: number;
    pdfUrl: string | null;
    hostedInvoiceUrl: string | null;
  }> = [];
  openInvoices: string[] = [];
  auditCredits: Array<{
    organizationId: string;
    creditsPurchased: number;
    unitPriceCents: number;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string | null;
  }> = [];
  duplicateCheckoutSessions = new Set<string>();
  redeemedOffers: Array<{ organizationId: string; offerTier: string }> = [];
  trialEmailClaims: Array<{
    organizationId: string;
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
    stripeEventId: string | null;
  }> = [];
  completedTrialEmails: Array<{
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
    providerMessageId: string;
  }> = [];
  releasedTrialEmails: Array<{
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
  }> = [];
  failCompleteTrialEmail = false;
  missingTrialEmailRecipient = false;
  failUpsertSubscription = false;
  failCompleteWebhookEvent = false;

  async claimWebhookEvent(
    stripeEventId: string,
    eventType: string,
  ): Promise<StripeEventClaim | null> {
    if (this.duplicateEvents.has(stripeEventId)) {
      return null;
    }

    this.claimedEvents.add(`${stripeEventId}:${eventType}`);
    return { id: "claim-id" };
  }

  async completeWebhookEvent(stripeEventId: string): Promise<void> {
    if (this.failCompleteWebhookEvent) {
      throw new Error("completion unavailable");
    }

    this.completedEvents.push(stripeEventId);
  }

  async releaseWebhookEvent(stripeEventId: string): Promise<void> {
    this.releasedEvents.push(stripeEventId);
  }

  async findOrganizationIdByStripeCustomer(
    stripeCustomerId: string,
  ): Promise<string | null> {
    return this.organizationByCustomer.get(stripeCustomerId) ?? null;
  }

  async findSubscriptionIdByStripeSubscription(
    stripeSubscriptionId: string,
  ): Promise<string | null> {
    return this.subscriptionIdByStripeId.get(stripeSubscriptionId) ?? null;
  }

  async upsertSubscription(snapshot: SubscriptionSnapshot): Promise<void> {
    if (this.failUpsertSubscription) {
      throw new Error("database unavailable");
    }

    this.subscriptions.push(snapshot);
  }

  async updateSubscriptionByStripeId(
    stripeSubscriptionId: string,
    snapshot: SubscriptionUpdateSnapshot,
  ): Promise<void> {
    this.subscriptionUpdates.push({ stripeSubscriptionId, snapshot });
  }

  async markSubscriptionCanceled(
    stripeSubscriptionId: string,
    eventTs: string | null,
  ): Promise<void> {
    this.canceledSubscriptions.push(stripeSubscriptionId);
    this.canceledEventTimestamps.push(eventTs);
  }

  async markSubscriptionPastDue(
    stripeSubscriptionId: string,
    eventTs: string | null,
  ): Promise<void> {
    this.pastDueSubscriptions.push(stripeSubscriptionId);
    this.pastDueEventTimestamps.push(eventTs);
  }

  async markCheckoutComplete(organizationId: string): Promise<void> {
    this.checkoutCompleteOrganizations.push(organizationId);
  }

  async upsertInvoice(snapshot: InvoiceSnapshot): Promise<void> {
    this.invoices.push(snapshot);
    this.existingInvoices.add(snapshot.stripeInvoiceId);
  }

  async invoiceExists(stripeInvoiceId: string): Promise<boolean> {
    return this.existingInvoices.has(stripeInvoiceId);
  }

  async markInvoicePaid(input: {
    stripeInvoiceId: string;
    amountPaid: number;
    pdfUrl: string | null;
    hostedInvoiceUrl: string | null;
  }): Promise<void> {
    this.paidInvoices.push(input);
  }

  async markInvoiceOpen(stripeInvoiceId: string): Promise<void> {
    this.openInvoices.push(stripeInvoiceId);
  }

  async insertAuditCredits(input: {
    organizationId: string;
    creditsPurchased: number;
    unitPriceCents: number;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string | null;
  }): Promise<"inserted" | "duplicate"> {
    if (this.duplicateCheckoutSessions.has(input.stripeCheckoutSessionId)) {
      return "duplicate";
    }

    this.auditCredits.push(input);
    return "inserted";
  }

  async redeemWinbackOffer(input: {
    organizationId: string;
    offerTier: string;
  }): Promise<void> {
    this.redeemedOffers.push(input);
  }

  async claimTrialEmail(input: {
    organizationId: string;
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
    stripeEventId: string | null;
  }): Promise<TrialEmailClaim | null> {
    if (this.missingTrialEmailRecipient) {
      throw new Error(
        `No billing contact found for org ${input.organizationId}`,
      );
    }

    this.trialEmailClaims.push(input);
    return {
      messageId: "44444444-4444-4444-8444-444444444444",
      recipient: "billing@example.test",
      organizationName: "Test Org",
    };
  }

  async completeTrialEmail(input: {
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
    providerMessageId: string;
  }): Promise<void> {
    if (this.failCompleteTrialEmail) {
      throw new Error("email completion unavailable");
    }

    this.completedTrialEmails.push(input);
  }

  async releaseTrialEmail(input: {
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
  }): Promise<void> {
    this.releasedTrialEmails.push(input);
  }
}

class MemoryTrialEmailSender {
  sends: Array<{ emailType: TrialEmailType; toEmail: string }> = [];
  fail = false;

  async send(
    _env: AppEnv,
    input: { emailType: TrialEmailType; toEmail: string },
  ): Promise<{ providerMessageId: string }> {
    if (this.fail) {
      throw new Error("resend unavailable");
    }

    this.sends.push(input);
    return { providerMessageId: "email_123" };
  }
}

class MemoryBillingAnalytics {
  captures: Array<{
    eventName: string;
    organizationId: string;
    properties: Record<string, unknown>;
  }> = [];

  async capture(
    _env: AppEnv,
    eventName: string,
    organizationId: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    this.captures.push({ eventName, organizationId, properties });
  }
}

class MemoryCrmRepository implements CrmRepository {
  readonly events: CrmEventInput[] = [];
  fail = false;

  async recordEvent(input: CrmEventInput): Promise<void> {
    if (this.fail) {
      throw new Error("crm unavailable");
    }
    this.events.push(input);
  }
}

function createTestApp(
  options: {
    repository?: MemoryStripeWebhookRepository;
    emailSender?: MemoryTrialEmailSender;
    analytics?: MemoryBillingAnalytics;
    crm?: MemoryCrmRepository;
  } = {},
) {
  const repository = options.repository ?? new MemoryStripeWebhookRepository();
  const emailSender = options.emailSender ?? new MemoryTrialEmailSender();
  const analytics = options.analytics ?? new MemoryBillingAnalytics();
  const crm = options.crm ?? new MemoryCrmRepository();
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route(
    "/",
    createStripeWebhookRoutes({
      repository,
      emailSender,
      analytics,
      crm,
      now: () => NOW,
    }),
  );

  return { app, repository, emailSender, analytics, crm };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    DATABASE_URL: "postgres://example",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  } as unknown as AppEnv;
}

function envWithSentry(): AppEnv {
  return {
    ...env(),
    SENTRY_DSN: "https://public@example.com/123",
  } as AppEnv;
}

async function signedRequest(
  event: object,
  init: { timestamp?: number; secret?: string; extraV1?: string } = {},
): Promise<RequestInit> {
  const body = JSON.stringify(event);
  const timestamp = init.timestamp ?? Math.floor(NOW.getTime() / 1000);
  const signature = await hmacSha256Hex(
    init.secret ?? "whsec_test",
    `${timestamp}.${body}`,
  );
  const v1Parts = init.extraV1
    ? `v1=${init.extraV1},v1=${signature}`
    : `v1=${signature}`;

  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},${v1Parts}`,
    },
    body,
  };
}

function stripeEvent(
  type: string,
  object: Record<string, unknown>,
  previousAttributes: Record<string, unknown> = {},
  created = 1_780_000_000,
) {
  return {
    id: `evt_${type.replace(/[^a-z]/giu, "_")}`,
    type,
    created,
    data: {
      object,
      previous_attributes: previousAttributes,
    },
  };
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "trialing",
    current_period_start: 1_780_000_000,
    current_period_end: 1_782_592_000,
    cancel_at_period_end: false,
    metadata: {
      app: "capveri",
      organization_id: ORG_ID,
      plan_id: "reconcile",
      pricing_model: "per_unit",
      building_count: "2",
      unit_count: "50",
      included_units: "50",
      unit_overage_count: "0",
    },
    items: {
      data: [{ quantity: 1, price: { id: "price_reconcile" } }],
    },
    ...overrides,
  };
}

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_123",
    customer: "cus_123",
    subscription: "sub_123",
    amount_due: 12345,
    amount_paid: 12345,
    currency: "usd",
    status: "paid",
    period_start: 1_780_000_000,
    period_end: 1_782_592_000,
    due_date: 1_782_000_000,
    invoice_pdf: "https://stripe.test/invoice.pdf",
    hosted_invoice_url: "https://stripe.test/invoice",
    ...overrides,
  };
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("stripe webhook routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects missing, stale, bad, and malformed signatures before claiming", async () => {
    const { app, repository } = createTestApp();
    const missing = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        body: JSON.stringify(stripeEvent("unknown", {})),
      },
      env(),
    );
    const stale = await app.request(
      "/webhooks/stripe",
      await signedRequest(stripeEvent("unknown", {}), {
        timestamp: Math.floor(NOW.getTime() / 1000) - 301,
      }),
      env(),
    );
    const malformed = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: { "stripe-signature": "v1=abc" },
        body: JSON.stringify(stripeEvent("unknown", {})),
      },
      env(),
    );
    const bad = await app.request(
      "/webhooks/stripe",
      await signedRequest(stripeEvent("unknown", {}), { secret: "wrong" }),
      env(),
    );

    expect(missing.status).toBe(400);
    expect(stale.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(bad.status).toBe(400);
    expect(repository.claimedEvents.size).toBe(0);
  });

  it("accepts multiple v1 signatures and rejects invalid JSON after verification", async () => {
    const { app, repository } = createTestApp();
    const accepted = await app.request(
      "/webhooks/stripe",
      await signedRequest(stripeEvent("unhandled.event", {}), {
        extraV1: "0".repeat(64),
      }),
      env(),
    );
    const rawBody = "{";
    const timestamp = Math.floor(NOW.getTime() / 1000);
    const signature = await hmacSha256Hex(
      "whsec_test",
      `${timestamp}.${rawBody}`,
    );
    const invalidJson = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
        body: rawBody,
      },
      env(),
    );

    expect(accepted.status).toBe(200);
    expect(repository.completedEvents).toContain("evt_unhandled_event");
    expect(invalidJson.status).toBe(400);
  });

  it("skips duplicate claims with success and no side effects", async () => {
    const repository = new MemoryStripeWebhookRepository();
    repository.duplicateEvents.add("evt_duplicate");
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest({
        id: "evt_duplicate",
        type: "customer.subscription.created",
        data: { object: subscription() },
      }),
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(repository.subscriptions).toHaveLength(0);
    expect(repository.completedEvents).toHaveLength(0);
  });

  it("completes unknown events and foreign-app non-invoice events", async () => {
    const { app, repository } = createTestApp();
    const unknown = await app.request(
      "/webhooks/stripe",
      await signedRequest(stripeEvent("unknown.event", {})),
      env(),
    );
    const foreign = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.created", {
          ...subscription(),
          metadata: { app: "other", organization_id: ORG_ID },
        }),
      ),
      env(),
    );

    expect(unknown.status).toBe(200);
    expect(foreign.status).toBe(200);
    expect(repository.completedEvents).toEqual([
      "evt_unknown_event",
      "evt_customer_subscription_created",
    ]);
    expect(repository.subscriptions).toHaveLength(0);
  });

  it("does not app-filter invoice events", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("invoice.created", {
          ...invoice(),
          metadata: { app: "other" },
        }),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.invoices).toHaveLength(1);
    expect(repository.invoices[0]).toMatchObject({
      organizationId: ORG_ID,
      amountDue: 123.45,
      hostedInvoiceUrl: "https://stripe.test/invoice",
    });
  });

  it("upserts created subscriptions, completes checkout, sends trial email, and captures analytics", async () => {
    const { app, repository, emailSender, analytics } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.created", subscription()),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.subscriptions[0]).toMatchObject({
      organizationId: ORG_ID,
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      plan: "growth_v2",
      tier: "reconcile",
      status: "trialing",
      pricingModel: "per_unit",
      buildingCount: 2,
      unitCount: 50,
      includedUnits: 50,
      unitOverageCount: 0,
    });
    expect(repository.checkoutCompleteOrganizations).toEqual([ORG_ID]);
    expect(repository.trialEmailClaims[0]).toMatchObject({
      emailType: "trial_started",
      stripeEventId: "evt_customer_subscription_created",
    });
    expect(emailSender.sends[0]).toMatchObject({
      emailType: "trial_started",
      toEmail: "billing@example.test",
    });
    expect(repository.completedTrialEmails[0]).toEqual({
      stripeSubscriptionId: "sub_123",
      emailType: "trial_started",
      providerMessageId: "email_123",
    });
    expect(analytics.captures).toHaveLength(2);
    expect(analytics.captures[0]).toMatchObject({
      eventName: "subscription_started",
      organizationId: ORG_ID,
    });
    expect(analytics.captures[1]).toMatchObject({
      eventName: "trial_started",
      organizationId: ORG_ID,
      properties: {
        stripe_subscription_id: "sub_123",
        subscription_status: "trialing",
      },
    });
  });

  it("maps an incomplete Stripe subscription to past_due, not active", async () => {
    // Stripe creates a subscription with status="incomplete" when the first
    // payment has not settled yet (e.g. SCA/3DS pending). It must NOT grant
    // premium access — the entitlement gate grants on active|trialing only —
    // so it folds to the recoverable non-access state past_due. When payment
    // succeeds Stripe fires subscription.updated→active and overwrites it.
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "customer.subscription.created",
          subscription({ status: "incomplete" }),
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.subscriptions[0]?.status).toBe("past_due");
  });

  it("maps an incomplete_expired Stripe subscription to canceled", async () => {
    // incomplete_expired = the first invoice was never paid within Stripe's
    // window; the subscription is dead. Fold to canceled (no access).
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "customer.subscription.created",
          subscription({ status: "incomplete_expired" }),
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.subscriptions[0]?.status).toBe("canceled");
  });

  it("fails closed on an unrecognized Stripe status (no access grant)", async () => {
    // An unknown/future Stripe status must never silently grant premium
    // access. Fail closed to the recoverable non-access state past_due so a
    // later recognized status can still restore the correct entitlement.
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "customer.subscription.created",
          subscription({ status: "some_future_status" }),
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.subscriptions[0]?.status).toBe("past_due");
  });

  it("releases trial email and webhook claims when email send fails", async () => {
    const emailSender = new MemoryTrialEmailSender();
    emailSender.fail = true;
    const { app, repository } = createTestApp({ emailSender });
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.created", subscription()),
      ),
      env(),
    );

    expect(response.status).toBe(500);
    expect(repository.releasedTrialEmails).toEqual([
      { stripeSubscriptionId: "sub_123", emailType: "trial_started" },
    ]);
    expect(repository.releasedEvents).toEqual([
      "evt_customer_subscription_created",
    ]);
  });

  it("keeps the trial email claim when completion after provider send fails", async () => {
    const repository = new MemoryStripeWebhookRepository();
    repository.failCompleteTrialEmail = true;
    const { app, emailSender } = createTestApp({ repository });
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.created", subscription()),
      ),
      env(),
    );

    expect(response.status).toBe(500);
    expect(emailSender.sends).toHaveLength(1);
    expect(repository.releasedTrialEmails).toHaveLength(0);
    expect(repository.releasedEvents).toHaveLength(0);
  });

  it("does not retry Stripe side effects when CRM recording fails after trial email completion", async () => {
    const crm = new MemoryCrmRepository();
    crm.fail = true;
    const { app, repository, emailSender } = createTestApp({ crm });
    const sentryFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.created", subscription()),
      ),
      envWithSentry(),
    );

    expect(response.status).toBe(200);
    expect(emailSender.sends).toHaveLength(1);
    expect(repository.completedTrialEmails).toEqual([
      {
        stripeSubscriptionId: "sub_123",
        emailType: "trial_started",
        providerMessageId: "email_123",
      },
    ]);
    expect(repository.releasedTrialEmails).toHaveLength(0);
    expect(repository.releasedEvents).toHaveLength(0);
    expect(sentryFetch).toHaveBeenCalledTimes(1);
    const [, initArg] = sentryFetch.mock.calls[0]!;
    expect(String(initArg?.body)).toContain(
      "worker.stripe_webhook.crm_trial_email_event",
    );
  });

  it("updates subscriptions without overwriting omitted period fields", async () => {
    const { app, repository, analytics } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "customer.subscription.updated",
          subscription({
            status: "active",
            current_period_start: undefined,
            current_period_end: undefined,
            start_date: undefined,
            billing_cycle_anchor: undefined,
            cancel_at_period_end: true,
          }),
          { cancel_at_period_end: false },
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.subscriptionUpdates[0]).toMatchObject({
      stripeSubscriptionId: "sub_123",
      snapshot: {
        status: "active",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: true,
      },
    });
    expect(repository.checkoutCompleteOrganizations).toEqual([ORG_ID]);
    expect(analytics.captures[0]).toMatchObject({
      eventName: "subscription_cancel_scheduled",
      organizationId: ORG_ID,
    });
  });

  it("marks deleted subscriptions canceled and captures analytics", async () => {
    const { app, repository, analytics } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "customer.subscription.deleted",
          subscription({ status: "canceled" }),
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.canceledSubscriptions).toEqual(["sub_123"]);
    expect(analytics.captures[0]).toMatchObject({
      eventName: "subscription_cancelled",
      organizationId: ORG_ID,
    });
  });

  it("threads the event.created timestamp into a subscription cancellation", async () => {
    const { app, repository } = createTestApp();
    const created = 1_790_000_000;
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "customer.subscription.deleted",
          subscription({ status: "canceled" }),
          {},
          created,
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    // The Stripe event.created high-water mark must reach the repository so a
    // stale, redelivered cancel cannot clobber a newer active subscription.
    expect(repository.canceledEventTimestamps).toEqual([
      new Date(created * 1000).toISOString(),
    ]);
  });

  it("sends trial ending emails for trial_will_end events", async () => {
    const { app, repository, emailSender } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.trial_will_end", subscription()),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.trialEmailClaims[0]).toMatchObject({
      emailType: "trial_ending_soon",
      stripeEventId: "evt_customer_subscription_trial_will_end",
    });
    expect(emailSender.sends[0]).toMatchObject({
      emailType: "trial_ending_soon",
      toEmail: "billing@example.test",
    });
  });

  it("treats a missing trial email recipient as retryable failure", async () => {
    const repository = new MemoryStripeWebhookRepository();
    repository.missingTrialEmailRecipient = true;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.created", subscription()),
      ),
      env(),
    );

    expect(response.status).toBe(500);
    expect(repository.completedEvents).toHaveLength(0);
    expect(repository.releasedEvents).toEqual([
      "evt_customer_subscription_created",
    ]);
  });

  it("releases the event claim and returns 500 when a handler fails", async () => {
    const repository = new MemoryStripeWebhookRepository();
    repository.failUpsertSubscription = true;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.created", subscription()),
      ),
      env(),
    );

    expect(response.status).toBe(500);
    expect(repository.releasedEvents).toEqual([
      "evt_customer_subscription_created",
    ]);
    expect(repository.completedEvents).toHaveLength(0);
  });

  it("does not release processed events when completion marking fails", async () => {
    const repository = new MemoryStripeWebhookRepository();
    repository.failCompleteWebhookEvent = true;
    const { app } = createTestApp({ repository });
    const sentryFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("customer.subscription.created", subscription()),
      ),
      envWithSentry(),
    );

    expect(response.status).toBe(200);
    expect(repository.subscriptions).toHaveLength(1);
    expect(repository.releasedEvents).toHaveLength(0);
    expect(sentryFetch).toHaveBeenCalledTimes(1);
    const [, initArg] = sentryFetch.mock.calls[0]!;
    expect(String(initArg?.body)).toContain(
      "worker.stripe_webhook.complete_event",
    );
  });

  it("uses invoice line period fallback when invoice period is invalid", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "invoice.created",
          invoice({
            period_start: 2_000,
            period_end: 1_000,
            lines: {
              data: [
                {
                  period: {
                    start: 1_780_000_000,
                    end: 1_782_592_000,
                  },
                },
              ],
            },
          }),
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.invoices[0]).toMatchObject({
      periodStart: "2026-05-28T20:26:40.000Z",
      periodEnd: "2026-06-27T20:26:40.000Z",
    });
  });

  it("creates missing paid invoices, marks them paid, and captures analytics", async () => {
    const { app, repository, analytics } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(stripeEvent("invoice.paid", invoice())),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.invoices).toHaveLength(1);
    expect(repository.paidInvoices[0]).toMatchObject({
      stripeInvoiceId: "in_123",
      amountPaid: 123.45,
    });
    expect(analytics.captures[0]).toMatchObject({
      eventName: "invoice_paid",
      organizationId: ORG_ID,
    });
  });

  it("creates missing failed invoices, marks them open, marks subscription past due, and captures analytics", async () => {
    const { app, repository, analytics } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "invoice.payment_failed",
          invoice({
            amount_paid: 0,
            status: "open",
          }),
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.invoices).toHaveLength(1);
    expect(repository.openInvoices).toEqual(["in_123"]);
    expect(repository.pastDueSubscriptions).toEqual(["sub_123"]);
    expect(analytics.captures[0]).toMatchObject({
      eventName: "invoice_payment_failed",
      organizationId: ORG_ID,
    });
  });

  it("threads the event.created timestamp into a past-due transition", async () => {
    const { app, repository } = createTestApp();
    const created = 1_790_000_000;
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent(
          "invoice.payment_failed",
          invoice({ amount_paid: 0, status: "open" }),
          {},
          created,
        ),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.pastDueEventTimestamps).toEqual([
      new Date(created * 1000).toISOString(),
    ]);
  });

  it("treats duplicate checkout credit insertion as success", async () => {
    const repository = new MemoryStripeWebhookRepository();
    repository.duplicateCheckoutSessions.add("cs_123");
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("checkout.session.completed", {
          id: "cs_123",
          mode: "payment",
          amount_total: 10_000,
          payment_intent: "pi_123",
          metadata: {
            app: "capveri",
            organization_id: ORG_ID,
            quantity: "2",
          },
        }),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.auditCredits).toHaveLength(0);
    expect(repository.completedEvents).toEqual([
      "evt_checkout_session_completed",
    ]);
  });

  it("inserts checkout payment credits with per-credit cents", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/webhooks/stripe",
      await signedRequest(
        stripeEvent("checkout.session.completed", {
          id: "cs_123",
          mode: "payment",
          amount_total: 10_001,
          payment_intent: "pi_123",
          metadata: {
            app: "capveri",
            organization_id: ORG_ID,
            quantity: "2",
          },
        }),
      ),
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.auditCredits[0]).toEqual({
      organizationId: ORG_ID,
      creditsPurchased: 2,
      unitPriceCents: 5000,
      stripeCheckoutSessionId: "cs_123",
      stripePaymentIntentId: "pi_123",
    });
  });

  it("mounts /webhooks/stripe publicly outside /api/v1", async () => {
    const response = await createApp().request(
      "/webhooks/stripe",
      {
        method: "POST",
        body: "{}",
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "missing_signature" },
    });
  });
});
