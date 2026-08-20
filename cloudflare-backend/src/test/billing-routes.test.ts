import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
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
} from "../domain/billing/repository";
import { BillingTrialPausedError } from "../domain/billing/repository";
import type { AppEnv } from "../env";
import { createBillingRoutes } from "../http/billing-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryBillingRepository implements BillingRepository {
  planSelection: PlanSelectionResponse = {
    plan_id: null,
    billing_period: null,
    unit_count: null,
    building_count: null,
    selected_at: null,
    checkout_required: true,
    has_active_access: false,
    has_paused_subscription: false,
    subscription_status: null,
    trial_days_remaining: null,
  };
  freeAuditStatus: FreeAuditStatusResponse = {
    has_subscription: false,
    has_paused_subscription: false,
    has_ever_purchased: false,
    credit_balance: {
      total_purchased: 0,
      total_used: 0,
      total_remaining: 0,
    },
    free_audit_consumed: false,
    can_add_property: true,
    can_run_reconciliation: true,
    can_view_draft_report: false,
    can_download_reports: false,
  };
  credits: CreditBalance = {
    total_purchased: 3,
    total_used: 1,
    total_remaining: 2,
  };
  creditHistory: CreditPack[] = [
    {
      id: "credit-b",
      organization_id: ORG_ID,
      credits_purchased: 2,
      credits_used: 0,
      credits_remaining: 2,
      unit_price_cents: 10000,
      stripe_payment_intent_id: null,
      stripe_checkout_session_id: "cs_b",
      purchased_at: "2026-06-12T00:00:00.000Z",
    },
  ];
  guaranteeInvoice: GuaranteeInvoice | null = {
    id: "invoice-paid",
    stripe_invoice_id: "in_paid",
    amount_paid: 1200,
    currency: "usd",
    paid_at: "2026-06-02T00:00:00.000Z",
  };
  featureUsage: FeatureUsageResponse = {
    used_features: [
      {
        key: "cam_reconciliation",
        label: "CAM reconciliation",
        required_tier: "reconcile",
        first_used_at: "2026-06-10T00:00:00.000Z",
        last_used_at: "2026-06-12T00:00:00.000Z",
      },
    ],
    current_tier: "reconcile",
  };
  savedInput: PlanSelectionInput | null = null;
  startedTrialInput: TrialStartInput | null = null;
  savedCheckoutInput: PlanSelectionInput | null = null;
  savedStripeCustomerId: string | null = null;
  saveStripeCustomerSucceeds = true;
  localSubscriptionExists = true;
  redeemedWinbackOffer = false;
  billingCustomer: BillingCustomer | null = null;
  organizationBillingProfile: OrganizationBillingProfile | null = {
    name: "Test Org",
    billing_email: "billing@example.test",
  };
  checkoutBillingState: CheckoutBillingState | null = null;
  billingActivation: BillingActivationState | null = null;
  subscription: Subscription | null = {
    id: "subscription-1",
    organization_id: ORG_ID,
    plan: "growth_v2",
    status: "active",
    pricing_model: "per_unit",
    building_count: 1,
    unit_count: 25,
    included_units: 25,
    unit_overage_count: 0,
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
  };
  saveOfferAttempts: SaveOfferAttempt[] = [];
  seenOrganizationIds: string[] = [];
  declinedAttemptIds: string[] = [];
  declineAttemptFails = false;
  acceptedOffer: { attemptId: string; couponId: string } | null = null;
  recordedGuaranteeClaim: { refundId: string; claimedAt: string } | null = null;
  guaranteeCanceledAt: string | null = null;
  guaranteeClaimSucceeds = true;
  trialPaused = false;
  invoices: Invoice[] = [
    {
      id: "invoice-paid",
      organization_id: ORG_ID,
      subscription_id: "subscription-1",
      stripe_invoice_id: "in_paid",
      amount_due: 1200,
      amount_paid: 1200,
      currency: "usd",
      status: "paid",
      period_start: "2026-06-01T00:00:00.000Z",
      period_end: "2026-07-01T00:00:00.000Z",
      due_date: null,
      paid_at: "2026-06-02T00:00:00.000Z",
      pdf_url: "https://stripe.example/invoice-paid.pdf",
      created_at: "2026-06-02T00:00:00.000Z",
    },
    {
      id: "invoice-open",
      organization_id: ORG_ID,
      subscription_id: "subscription-1",
      stripe_invoice_id: "in_open",
      amount_due: 2400,
      amount_paid: 0,
      currency: "usd",
      status: "open",
      period_start: "2026-07-01T00:00:00.000Z",
      period_end: "2026-08-01T00:00:00.000Z",
      due_date: "2026-07-15T00:00:00.000Z",
      paid_at: null,
      pdf_url: null,
      created_at: "2026-07-02T00:00:00.000Z",
    },
    {
      id: "invoice-foreign",
      organization_id: "33333333-3333-4333-8333-333333333333",
      subscription_id: "subscription-foreign",
      stripe_invoice_id: "in_foreign",
      amount_due: 3600,
      amount_paid: 3600,
      currency: "usd",
      status: "paid",
      period_start: "2026-06-01T00:00:00.000Z",
      period_end: "2026-07-01T00:00:00.000Z",
      due_date: null,
      paid_at: "2026-06-02T00:00:00.000Z",
      pdf_url: "https://stripe.example/invoice-foreign.pdf",
      created_at: "2026-06-02T00:00:00.000Z",
    },
  ];

  async getPlanSelection(
    organizationId: string,
  ): Promise<PlanSelectionResponse> {
    this.seenOrganizationIds.push(organizationId);
    return this.planSelection;
  }

  async savePlanSelection(
    organizationId: string,
    input: PlanSelectionInput,
  ): Promise<PlanSelectionResponse> {
    this.seenOrganizationIds.push(organizationId);
    this.savedInput = input;
    this.planSelection = {
      plan_id: input.plan_id,
      billing_period: input.billing_period,
      unit_count: input.unit_count,
      building_count: input.building_count,
      selected_at: "2026-06-12T00:00:00.000Z",
      checkout_required: true,
      has_active_access: false,
      has_paused_subscription: false,
      subscription_status: null,
      trial_days_remaining: null,
    };
    return this.planSelection;
  }

  async startTrial(
    organizationId: string,
    input: TrialStartInput,
  ): Promise<PlanSelectionResponse> {
    this.seenOrganizationIds.push(organizationId);
    if (this.trialPaused) {
      throw new BillingTrialPausedError("paused trial");
    }
    this.startedTrialInput = input;
    this.planSelection = {
      plan_id: input.plan_id,
      billing_period: input.billing_period,
      unit_count: input.unit_count,
      building_count: input.building_count,
      selected_at: input.startedAt,
      checkout_required: false,
      has_active_access: true,
      has_paused_subscription: false,
      subscription_status: "trialing",
      trial_days_remaining: 30,
    };
    return this.planSelection;
  }

  async getFreeAuditStatus(
    organizationId: string,
  ): Promise<FreeAuditStatusResponse> {
    this.seenOrganizationIds.push(organizationId);
    return this.freeAuditStatus;
  }

  async getCredits(organizationId: string): Promise<CreditBalance> {
    this.seenOrganizationIds.push(organizationId);
    return this.credits;
  }

  async getCreditHistory(organizationId: string): Promise<CreditPack[]> {
    this.seenOrganizationIds.push(organizationId);
    return this.creditHistory;
  }

  async getFeatureUsage(organizationId: string): Promise<FeatureUsageResponse> {
    this.seenOrganizationIds.push(organizationId);
    return this.featureUsage;
  }

  async getBillingCustomer(
    organizationId: string,
  ): Promise<BillingCustomer | null> {
    this.seenOrganizationIds.push(organizationId);
    return this.billingCustomer;
  }

  async getOrganizationBillingProfile(
    organizationId: string,
  ): Promise<OrganizationBillingProfile | null> {
    this.seenOrganizationIds.push(organizationId);
    return this.organizationBillingProfile;
  }

  async getCheckoutBillingState(
    organizationId: string,
  ): Promise<CheckoutBillingState | null> {
    this.seenOrganizationIds.push(organizationId);
    return this.checkoutBillingState;
  }

  async getSubscription(organizationId: string): Promise<Subscription | null> {
    this.seenOrganizationIds.push(organizationId);
    return this.subscription;
  }

  async scheduleSubscriptionCancel(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null> {
    this.seenOrganizationIds.push(organizationId);
    if (!this.subscription) {
      return null;
    }
    this.subscription = {
      ...this.subscription,
      cancel_at_period_end: true,
      updated_at: updatedAt,
    };
    return this.subscription;
  }

  async cancelSubscriptionImmediately(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null> {
    this.seenOrganizationIds.push(organizationId);
    if (!this.subscription) {
      return null;
    }
    this.subscription = {
      ...this.subscription,
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: updatedAt,
    };
    return this.subscription;
  }

  async resumeScheduledSubscription(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null> {
    this.seenOrganizationIds.push(organizationId);
    if (!this.subscription) {
      return null;
    }
    this.subscription = {
      ...this.subscription,
      cancel_at_period_end: false,
      updated_at: updatedAt,
    };
    return this.subscription;
  }

  async resumePausedSubscription(
    organizationId: string,
    input: StripeResumeSubscriptionInput,
  ): Promise<Subscription | null> {
    this.seenOrganizationIds.push(organizationId);
    if (!this.subscription) {
      return null;
    }
    this.subscription = {
      ...this.subscription,
      status: input.status,
      cancel_at_period_end: input.cancel_at_period_end,
      current_period_start:
        input.current_period_start ?? this.subscription.current_period_start,
      current_period_end:
        input.current_period_end ?? this.subscription.current_period_end,
      updated_at: input.updated_at,
    };
    return this.subscription;
  }

  async createSaveOfferAttempt(input: {
    organizationId: string;
    reason: SaveOfferAttempt["cancel_reason"];
    otherText: string | null;
    offerType: SaveOfferType;
  }): Promise<SaveOfferAttempt> {
    this.seenOrganizationIds.push(input.organizationId);
    const attempt: SaveOfferAttempt = {
      id: "44444444-4444-4444-8444-444444444444",
      organization_id: input.organizationId,
      cancel_reason: input.reason,
      other_text: input.otherText,
      offer_shown: input.offerType,
      offer_accepted: null,
      stripe_coupon_id: null,
      created_at: "2026-06-13T00:00:00.000Z",
    };
    this.saveOfferAttempts.push(attempt);
    return attempt;
  }

  async getSaveOfferAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SaveOfferAttempt | null> {
    this.seenOrganizationIds.push(input.organizationId);
    return (
      this.saveOfferAttempts.find(
        (attempt) =>
          attempt.id === input.attemptId &&
          attempt.organization_id === input.organizationId,
      ) ?? null
    );
  }

  async markSaveOfferAccepted(input: {
    organizationId: string;
    attemptId: string;
    couponId: string;
  }): Promise<void> {
    this.seenOrganizationIds.push(input.organizationId);
    this.acceptedOffer = {
      attemptId: input.attemptId,
      couponId: input.couponId,
    };
    this.saveOfferAttempts = this.saveOfferAttempts.map((attempt) =>
      attempt.id === input.attemptId &&
      attempt.organization_id === input.organizationId
        ? {
            ...attempt,
            offer_accepted: true,
            stripe_coupon_id: input.couponId,
          }
        : attempt,
    );
  }

  async markCancelAttemptDeclined(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<void> {
    this.seenOrganizationIds.push(input.organizationId);
    if (this.declineAttemptFails) {
      throw new Error("decline failed");
    }
    this.declinedAttemptIds.push(input.attemptId);
  }

  async hasLocalSubscription(organizationId: string): Promise<boolean> {
    this.seenOrganizationIds.push(organizationId);
    return this.localSubscriptionExists;
  }

  async saveStripeCustomerId(
    organizationId: string,
    customerId: string,
  ): Promise<boolean> {
    this.seenOrganizationIds.push(organizationId);
    this.savedStripeCustomerId = customerId;
    this.billingCustomer = { stripe_customer_id: customerId };
    return this.saveStripeCustomerSucceeds;
  }

  async getBillingActivation(
    organizationId: string,
  ): Promise<BillingActivationState | null> {
    this.seenOrganizationIds.push(organizationId);
    return this.billingActivation;
  }

  async saveCheckoutActivation(
    organizationId: string,
    input: PlanSelectionInput,
  ): Promise<void> {
    this.seenOrganizationIds.push(organizationId);
    this.savedCheckoutInput = input;
    this.billingActivation = {
      ...input,
      checkout_required: true,
    };
  }

  async hasRedeemedWinbackOffer(organizationId: string): Promise<boolean> {
    this.seenOrganizationIds.push(organizationId);
    return this.redeemedWinbackOffer;
  }

  async listInvoices(input: {
    organizationId: string;
    status: string | null;
    page: number;
    perPage: number;
  }): Promise<InvoiceListResponse> {
    this.seenOrganizationIds.push(input.organizationId);
    const organizationInvoices = this.invoices.filter(
      (invoice) => invoice.organization_id === input.organizationId,
    );
    const filtered = input.status
      ? organizationInvoices.filter(
          (invoice) => invoice.status === input.status,
        )
      : organizationInvoices;
    const start = (input.page - 1) * input.perPage;
    return {
      invoices: filtered.slice(start, start + input.perPage),
      total: filtered.length,
      page: input.page,
      per_page: input.perPage,
      has_more: start + input.perPage < filtered.length,
    };
  }

  async getInvoice(input: {
    organizationId: string;
    invoiceId: string;
  }): Promise<Invoice | null> {
    this.seenOrganizationIds.push(input.organizationId);
    return (
      this.invoices.find(
        (invoice) =>
          invoice.id === input.invoiceId &&
          invoice.organization_id === input.organizationId,
      ) ?? null
    );
  }

  async getInvoiceSummary(
    organizationId: string,
  ): Promise<InvoiceSummaryResponse> {
    this.seenOrganizationIds.push(organizationId);
    const organizationInvoices = this.invoices.filter(
      (invoice) => invoice.organization_id === organizationId,
    );
    return {
      total_invoices: organizationInvoices.length,
      paid_invoices: organizationInvoices.filter(
        (invoice) => invoice.status === "paid",
      ).length,
      open_invoices: organizationInvoices.filter(
        (invoice) => invoice.status === "open",
      ).length,
      total_paid: organizationInvoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + invoice.amount_paid, 0),
      currency: "usd",
    };
  }

  async getInvoicePdfUrl(input: {
    organizationId: string;
    invoiceId: string;
  }): Promise<string | null | undefined> {
    this.seenOrganizationIds.push(input.organizationId);
    return this.invoices.find(
      (invoice) =>
        invoice.id === input.invoiceId &&
        invoice.organization_id === input.organizationId,
    )?.pdf_url;
  }

  async getFirstPaidInvoiceForGuarantee(
    organizationId: string,
  ): Promise<GuaranteeInvoice | null> {
    this.seenOrganizationIds.push(organizationId);
    return this.guaranteeInvoice;
  }

  async recordGuaranteeClaim(input: {
    organizationId: string;
    refundId: string;
    claimedAt: string;
  }): Promise<boolean> {
    this.seenOrganizationIds.push(input.organizationId);
    if (!this.guaranteeClaimSucceeds) {
      return false;
    }
    this.recordedGuaranteeClaim = {
      refundId: input.refundId,
      claimedAt: input.claimedAt,
    };
    if (this.subscription) {
      this.subscription = {
        ...this.subscription,
        money_back_claimed_at: input.claimedAt,
        money_back_refund_id: input.refundId,
      };
    }
    return true;
  }

  async markSubscriptionCanceledForGuarantee(input: {
    organizationId: string;
    updatedAt: string;
  }): Promise<void> {
    this.seenOrganizationIds.push(input.organizationId);
    this.guaranteeCanceledAt = input.updatedAt;
    if (this.subscription) {
      this.subscription = {
        ...this.subscription,
        status: "canceled",
        cancel_at_period_end: false,
        updated_at: input.updatedAt,
      };
    }
  }
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"] = "member",
): AuthenticatedUserContext {
  const context: AuthenticatedUserContext = {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-12T00:00:00Z",
      updatedAt: "2026-06-12T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role,
      isServiceAdmin: false,
      party: role === "tenant" ? "tenant" : "landlord",
      bearerToken: "valid-token",
    },
  };

  if (role === "tenant") {
    context.tenantUser = {
      id: "77777777-7777-4777-8777-777777777777",
      userId: USER_ID,
      organizationId: ORG_ID,
      contactName: "Tenant User",
      contactEmail: "tenant@example.test",
      createdAt: "2026-06-12T00:00:00Z",
    };
  }

  return context;
}

function createTestApp(options: {
  repository?: MemoryBillingRepository;
  role?: AuthVariables["auth"]["actor"]["role"];
  clock?: () => Date;
}) {
  const repository = options.repository ?? new MemoryBillingRepository();
  const context = createAuthContext(options.role);
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const auth: AuthRepository = {
    async resolveUserContext() {
      return context;
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route(
    "/api/v1",
    createBillingRoutes({
      repository,
      clock: options.clock ?? (() => new Date("2026-06-13T00:00:00.000Z")),
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    STRIPE_SECRET_KEY: "sk_test",
    CHECKOUT_OFFER_TOKEN_SECRET: "test-checkout-offer-token-secret",
    STRIPE_80OFF_COUPON_ID: "coupon_80off",
    STRIPE_FREE_AUDIT_COUPON_OFFER_50: "coupon_offer_50",
    STRIPE_FREE_AUDIT_COUPON_OFFER_FREE: "coupon_offer_free",
    STRIPE_SAVE_OFFER_COUPON_ID_ANNUAL: "coupon_save_20",
    STRIPE_PRICE_ID_RECONCILE_ANNUAL: "price_reconcile_annual",
  } as unknown as AppEnv;
}

function mockStripeJson(payload: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(payload), { status }));
}

function mockStripeJsonSequence(
  responses: Array<{ payload: unknown; status?: number }>,
) {
  const fetchMock = vi.spyOn(globalThis, "fetch");

  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(response.payload), {
        status: response.status ?? 200,
      }),
    );
  }

  return fetchMock;
}

function lastStripeForm(fetchMock: ReturnType<typeof mockStripeJson>) {
  const init = fetchMock.mock.calls.at(-1)?.[1];
  const body = init && "body" in init ? init.body : undefined;

  expect(body).toBeInstanceOf(URLSearchParams);

  return body as URLSearchParams;
}

async function createOfferToken(
  input: {
    organizationId?: string;
    offerTier?: string;
    expiresAtUnix?: number;
    secret?: string;
  } = {},
) {
  const organizationId = input.organizationId ?? ORG_ID;
  const offerTier = input.offerTier ?? "offer_50";
  const expiresAtUnix =
    input.expiresAtUnix ?? Math.floor(Date.now() / 1000) + 86_400;
  const secret = input.secret ?? "test-checkout-offer-token-secret";
  const payload = `${organizationId}:${offerTier}:${expiresAtUnix}`;
  const signature = await hmacSha256Hex(secret, payload);
  const encodedPayload = btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");

  return `${encodedPayload}.${signature}`;
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

describe("billing routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns public launch offer shape without auth", async () => {
    // Pin the clock inside the offer window. Without this the assertion flips to
    // the expired shape once the real date passes 2026-07-04, and this test stops
    // covering the live-offer path — the sibling test below covers the expiry.
    const { app } = createTestApp({
      clock: () => new Date("2026-06-15T00:00:00.000Z"),
    });
    const response = await app.request(
      "/api/v1/billing/launch-offer/active",
      {},
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: "80OFF",
      label: "80% off the first year",
      discount_percent: 80,
      times_redeemed: 0,
      max_redemptions: 300,
      phase_index: 1,
      all_exhausted: false,
      ends_at: "2026-07-04T07:00:00Z",
      ends_at_display: "Friday, July 3",
    });
  });

  it("marks the launch offer exhausted after the July 3 deadline", async () => {
    const { app } = createTestApp({
      clock: () => new Date("2026-07-04T07:00:01.000Z"),
    });
    const response = await app.request(
      "/api/v1/billing/launch-offer/active",
      {},
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: null,
      label: null,
      discount_percent: null,
      times_redeemed: 0,
      max_redemptions: 300,
      phase_index: 1,
      all_exhausted: true,
      ends_at: "2026-07-04T07:00:00Z",
      ends_at_display: "Friday, July 3",
    });
  });

  it("returns exhausted launch offer state from Stripe coupon redemption", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          times_redeemed: 300,
          max_redemptions: 300,
        }),
        { status: 200 },
      ),
    );
    const { app } = createTestApp({});
    const response = await app.request(
      "/api/v1/billing/launch-offer/active",
      {},
      {
        ...env(),
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_80OFF_COUPON_ID: "coupon_80off",
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: null,
      label: null,
      discount_percent: null,
      times_redeemed: 300,
      max_redemptions: 300,
      phase_index: 1,
      all_exhausted: true,
      ends_at: "2026-07-04T07:00:00Z",
      ends_at_display: "Friday, July 3",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/coupons/coupon_80off",
      {
        headers: {
          authorization: "Bearer sk_test",
        },
      },
    );
  });

  it("allows landlord reads and forbids tenant reads", async () => {
    const landlordResponse = await createTestApp({}).app.request(
      "/api/v1/billing/free-audit-status",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const tenantResponse = await createTestApp({ role: "tenant" }).app.request(
      "/api/v1/billing/free-audit-status",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(landlordResponse.status).toBe(200);
    expect(tenantResponse.status).toBe(403);
  });

  it("returns guarantee eligibility for recent first paid invoices", async () => {
    const { app } = createTestApp({});

    const response = await app.request(
      "/api/v1/billing/guarantee/eligibility",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      eligible: true,
      days_remaining: 19,
      first_invoice_amount: 1200,
      first_invoice_currency: "usd",
    });
  });

  it("returns ineligible guarantee states for missing, old, or already claimed invoices", async () => {
    const missingRepo = new MemoryBillingRepository();
    missingRepo.guaranteeInvoice = null;
    const missing = await createTestApp({
      repository: missingRepo,
    }).app.request(
      "/api/v1/billing/guarantee/eligibility",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    const oldRepo = new MemoryBillingRepository();
    oldRepo.guaranteeInvoice = {
      ...oldRepo.guaranteeInvoice!,
      paid_at: "2026-05-01T00:00:00.000Z",
    };
    const old = await createTestApp({ repository: oldRepo }).app.request(
      "/api/v1/billing/guarantee/eligibility",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    const claimedRepo = new MemoryBillingRepository();
    claimedRepo.subscription = {
      ...claimedRepo.subscription!,
      money_back_claimed_at: "2026-06-10T00:00:00.000Z",
      money_back_refund_id: "re_123",
    };
    const claimed = await createTestApp({
      repository: claimedRepo,
    }).app.request(
      "/api/v1/billing/guarantee/eligibility",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    await expect(missing.json()).resolves.toMatchObject({
      eligible: false,
      days_remaining: 0,
      first_invoice_amount: null,
    });
    await expect(old.json()).resolves.toMatchObject({
      eligible: false,
      days_remaining: 0,
      first_invoice_amount: null,
    });
    await expect(claimed.json()).resolves.toMatchObject({
      eligible: false,
      days_remaining: 0,
      first_invoice_amount: null,
    });
  });

  it("claims the money-back guarantee by refunding then canceling without proration", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJsonSequence([
      { payload: { id: "in_paid", payment_intent: "pi_paid" } },
      { payload: { id: "re_123", amount: 1200, currency: "usd" } },
      { payload: { id: "sub_123", status: "canceled" } },
    ]);

    const response = await app.request(
      "/api/v1/billing/guarantee/claim",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      refund_id: "re_123",
      amount_refunded: 12,
      currency: "usd",
    });
    expect(repository.recordedGuaranteeClaim).toEqual({
      refundId: "re_123",
      claimedAt: "2026-06-13T00:00:00.000Z",
    });
    expect(repository.guaranteeCanceledAt).toBe("2026-06-13T00:00:00.000Z");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.stripe.com/v1/invoices/in_paid",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.stripe.com/v1/refunds",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "idempotency-key": `guarantee-refund:${ORG_ID}:invoice-paid`,
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://api.stripe.com/v1/subscriptions/sub_123",
    );
    const refundForm = fetchMock.mock.calls[1]?.[1]?.body as URLSearchParams;
    expect(refundForm.get("payment_intent")).toBe("pi_paid");
    const cancelForm = fetchMock.mock.calls[2]?.[1]?.body as URLSearchParams;
    expect(cancelForm.get("prorate")).toBe("false");
    expect(cancelForm.get("invoice_now")).toBe("false");
  });

  it("rejects guarantee claims for non-owners and ineligible organizations", async () => {
    const member = await createTestApp({ role: "member" }).app.request(
      "/api/v1/billing/guarantee/claim",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const repository = new MemoryBillingRepository();
    repository.guaranteeInvoice = null;
    const ineligible = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/guarantee/claim",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(member.status).toBe(403);
    expect(ineligible.status).toBe(409);
  });

  it("rejects guarantee claims before refunding when subscription cannot be canceled", async () => {
    const repository = new MemoryBillingRepository();
    repository.subscription = {
      ...repository.subscription!,
      stripe_subscription_id: null,
    };
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({
      id: "in_paid",
      payment_intent: "pi_paid",
    });

    const response = await app.request(
      "/api/v1/billing/guarantee/claim",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.stripe.com/v1/invoices/in_paid",
    );
  });

  it("rejects guarantee claims when the guarded claim marker does not update", async () => {
    const repository = new MemoryBillingRepository();
    repository.guaranteeClaimSucceeds = false;
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJsonSequence([
      { payload: { id: "in_paid", payment_intent: "pi_paid" } },
      { payload: { id: "re_123", amount: 1200, currency: "usd" } },
    ]);

    const response = await app.request(
      "/api/v1/billing/guarantee/claim",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(repository.guaranteeCanceledAt).toBeNull();
  });

  it("rejects guarantee claims when Stripe invoice data cannot refund", async () => {
    const missingStripeRefRepo = new MemoryBillingRepository();
    missingStripeRefRepo.guaranteeInvoice = {
      ...missingStripeRefRepo.guaranteeInvoice!,
      stripe_invoice_id: null,
    };
    const missingStripeRef = await createTestApp({
      repository: missingStripeRefRepo,
      role: "owner",
    }).app.request(
      "/api/v1/billing/guarantee/claim",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    const { app } = createTestApp({
      repository: new MemoryBillingRepository(),
      role: "owner",
    });
    mockStripeJson({ id: "in_paid", payment_intent: null });
    const missingPaymentIntent = await app.request(
      "/api/v1/billing/guarantee/claim",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(missingStripeRef.status).toBe(422);
    expect(missingPaymentIntent.status).toBe(422);
  });

  it("applies customer auth gates for landlord, owner, and tenant actors", async () => {
    mockStripeJson({
      id: "cus_123",
      email: "billing@example.test",
      name: "Test Org",
      created: 123,
    });

    const landlordRepo = new MemoryBillingRepository();
    landlordRepo.billingCustomer = { stripe_customer_id: "cus_123" };
    const landlordResponse = await createTestApp({
      repository: landlordRepo,
    }).app.request(
      "/api/v1/billing/customer",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const memberPost = await createTestApp({}).app.request(
      "/api/v1/billing/customer",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const tenantGet = await createTestApp({ role: "tenant" }).app.request(
      "/api/v1/billing/customer",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(landlordResponse.status).toBe(200);
    expect(memberPost.status).toBe(403);
    expect(tenantGet.status).toBe(403);
  });

  it("requires owner role for plan selection writes and feature usage", async () => {
    const memberPut = await createTestApp({}).app.request(
      "/api/v1/billing/plan-selection",
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ plan_id: "reconcile" }),
      },
      env(),
    );
    const memberFeature = await createTestApp({}).app.request(
      "/api/v1/billing/feature-usage",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const ownerFeature = await createTestApp({ role: "owner" }).app.request(
      "/api/v1/billing/feature-usage",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(memberPut.status).toBe(403);
    expect(memberFeature.status).toBe(403);
    expect(ownerFeature.status).toBe(200);
  });

  it("persists valid annual reconcile plan selection", async () => {
    const { app, repository } = createTestApp({ role: "owner" });
    const response = await app.request(
      "/api/v1/billing/plan-selection",
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 50,
          building_count: 2,
          launch_offer_code: "80OFF",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.savedInput).toEqual({
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 50,
      building_count: 2,
    });
    await expect(response.json()).resolves.toMatchObject({
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 50,
      building_count: 2,
    });
  });

  it("rejects the launch offer code after the July 3 deadline", async () => {
    const { app } = createTestApp({
      role: "owner",
      clock: () => new Date("2026-07-04T07:00:01.000Z"),
    });
    const response = await app.request(
      "/api/v1/billing/plan-selection",
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 50,
          building_count: 2,
          launch_offer_code: "80OFF",
        }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "offer_expired" },
    });
  });

  it("rejects invalid plan selection payloads", async () => {
    const { app, repository } = createTestApp({ role: "owner" });
    const request = (body: object) =>
      app.request(
        "/api/v1/billing/plan-selection",
        {
          method: "PUT",
          headers: {
            authorization: "Bearer valid-token",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
        env(),
      );

    await expect(
      (await request({ plan_id: "pro" })).json(),
    ).resolves.toMatchObject({
      detail: "Invalid plan: pro. Valid plans: reconcile",
      error: { code: "invalid_plan" },
    });
    expect(
      await request({ plan_id: "reconcile", billing_period: "monthly" }),
    ).toHaveProperty("status", 422);
    expect(
      await request({ plan_id: "reconcile", unit_count: 0 }),
    ).toHaveProperty("status", 422);
    expect(await request({ plan_id: "reconcile", extra: true })).toHaveProperty(
      "status",
      422,
    );
    await expect(
      (
        await request({
          plan_id: "reconcile",
          launch_offer_code: "BAD",
        })
      ).json(),
    ).resolves.toMatchObject({ error: { code: "invalid_offer_code" } });
    const largePortfolioResponse = await request({
      plan_id: "reconcile",
      unit_count: 100_001,
    });
    expect(largePortfolioResponse.status).toBe(200);
    expect(repository.savedInput).toMatchObject({
      plan_id: "reconcile",
      unit_count: 100_001,
    });
  });

  it("starts a default no-card trial for owners", async () => {
    const { app, repository } = createTestApp({ role: "owner" });

    const response = await app.request(
      "/api/v1/billing/trial/start-default",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 25,
      building_count: 1,
      checkout_required: false,
      subscription_status: "trialing",
      trial_days_remaining: 30,
    });
    expect(repository.startedTrialInput).toMatchObject({
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 25,
      building_count: 1,
      startedAt: "2026-06-13T00:00:00.000Z",
      periodEnd: "2026-07-13T00:00:00.000Z",
    });
  });

  it("starts a selected no-card trial and validates launch offers", async () => {
    const { app, repository } = createTestApp({ role: "owner" });

    const response = await app.request(
      "/api/v1/billing/trial/start",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 50,
          building_count: 2,
          launch_offer_code: "80OFF",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.startedTrialInput).toMatchObject({
      unit_count: 50,
      building_count: 2,
      includedUnits: 25,
    });
  });

  it("rejects the launch offer on selected no-card trial start after the July 3 deadline", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({
      role: "owner",
      repository,
      clock: () => new Date("2026-07-04T07:00:01.000Z"),
    });

    const response = await app.request(
      "/api/v1/billing/trial/start",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 50,
          building_count: 2,
          launch_offer_code: "80OFF",
        }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(repository.startedTrialInput).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "offer_expired" },
    });
  });

  it("rejects paused local trial starts", async () => {
    const repository = new MemoryBillingRepository();
    repository.trialPaused = true;
    const { app } = createTestApp({ role: "owner", repository });

    const response = await app.request(
      "/api/v1/billing/trial/start-default",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "paused_trial" },
    });
  });

  it("requires owners to start trials", async () => {
    const { app } = createTestApp({});

    const response = await app.request(
      "/api/v1/billing/trial/start-default",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(403);
  });

  it("returns credits, history, and feature usage shapes", async () => {
    const { app } = createTestApp({ role: "owner" });
    const credits = await app.request(
      "/api/v1/billing/credits",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const history = await app.request(
      "/api/v1/billing/credits/history",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const featureUsage = await app.request(
      "/api/v1/billing/feature-usage",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(credits.status).toBe(200);
    await expect(credits.json()).resolves.toEqual({
      total_purchased: 3,
      total_used: 1,
      total_remaining: 2,
    });
    await expect(history.json()).resolves.toEqual([
      expect.objectContaining({ id: "credit-b" }),
    ]);
    await expect(featureUsage.json()).resolves.toMatchObject({
      current_tier: "reconcile",
      used_features: [expect.objectContaining({ key: "cam_reconciliation" })],
    });
  });

  it("lists invoices with pagination and status filters", async () => {
    const { app } = createTestApp({});

    const response = await app.request(
      "/api/v1/billing/invoices?page=1&per_page=1&status=paid",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      invoices: [
        expect.objectContaining({ id: "invoice-paid", status: "paid" }),
      ],
      total: 1,
      page: 1,
      per_page: 1,
      has_more: false,
    });
  });

  it("rejects invalid invoice status filters before repository access", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({ repository });

    const response = await app.request(
      "/api/v1/billing/invoices?status=bogus",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.seenOrganizationIds).toEqual([]);
  });

  it("requires landlord access for invoice reads", async () => {
    const { app } = createTestApp({ role: "tenant" });

    const response = await app.request(
      "/api/v1/billing/invoices",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(403);
  });

  it("returns invoice summary before invoice-id route matching", async () => {
    const { app } = createTestApp({});

    const response = await app.request(
      "/api/v1/billing/invoices/summary",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      total_invoices: 2,
      paid_invoices: 1,
      open_invoices: 1,
      total_paid: 1200,
      currency: "usd",
    });
  });

  it("returns invoice detail scoped to the organization", async () => {
    const { app } = createTestApp({});

    const response = await app.request(
      "/api/v1/billing/invoices/invoice-open",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "invoice-open",
      stripe_invoice_id: "in_open",
      amount_due: 2400,
      amount_paid: 0,
    });

    const foreign = await app.request(
      "/api/v1/billing/invoices/invoice-foreign",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    expect(foreign.status).toBe(404);
  });

  it("redirects invoice PDFs and reports missing PDFs", async () => {
    const { app } = createTestApp({});

    const redirect = await app.request(
      "/api/v1/billing/invoices/invoice-paid/pdf",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const missingPdf = await app.request(
      "/api/v1/billing/invoices/invoice-open/pdf",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const missingInvoice = await app.request(
      "/api/v1/billing/invoices/missing/pdf",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(
      "https://stripe.example/invoice-paid.pdf",
    );
    expect(missingPdf.status).toBe(404);
    await expect(missingPdf.json()).resolves.toMatchObject({
      detail: "PDF not available",
    });
    expect(missingInvoice.status).toBe(404);
    await expect(missingInvoice.json()).resolves.toMatchObject({
      detail: "Invoice not found",
    });
  });

  it("returns current subscription details for landlords", async () => {
    const { app } = createTestApp({});

    const response = await app.request(
      "/api/v1/billing/subscription",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "subscription-1",
      organization_id: ORG_ID,
      status: "active",
      stripe_subscription_id: "sub_123",
      billing_interval: "annual",
    });
  });

  it("returns 404 when subscription is missing", async () => {
    const repository = new MemoryBillingRepository();
    repository.subscription = null;
    const { app } = createTestApp({ repository });

    const response = await app.request(
      "/api/v1/billing/subscription",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "No subscription found for this organization",
    });
  });

  it("creates save-offer attempts from cancellation reasons", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({ repository, role: "owner" });

    const discount = await app.request(
      "/api/v1/billing/save-offer",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reason: "too_expensive",
          other_text: "annual budget changed",
        }),
      },
      env(),
    );
    const roadmap = await app.request(
      "/api/v1/billing/save-offer",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "missing_feature" }),
      },
      env(),
    );
    const none = await app.request(
      "/api/v1/billing/save-offer",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "business_closed" }),
      },
      env(),
    );

    expect(discount.status).toBe(200);
    await expect(discount.json()).resolves.toEqual({
      attempt_id: "44444444-4444-4444-8444-444444444444",
      offer_type: "discount_20pct_1inv",
      discount_percent: 20,
    });
    await expect(roadmap.json()).resolves.toMatchObject({
      offer_type: "feature_roadmap",
      discount_percent: null,
    });
    await expect(none.json()).resolves.toMatchObject({
      offer_type: "none",
      discount_percent: null,
    });
    expect(repository.saveOfferAttempts[0]).toMatchObject({
      cancel_reason: "too_expensive",
      other_text: "annual budget changed",
      offer_shown: "discount_20pct_1inv",
    });
  });

  it("requires owners and valid save-offer reasons", async () => {
    const memberApp = createTestApp({ role: "member" }).app;
    const forbidden = await memberApp.request(
      "/api/v1/billing/save-offer",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "too_expensive" }),
      },
      env(),
    );
    const ownerApp = createTestApp({ role: "owner" }).app;
    const invalid = await ownerApp.request(
      "/api/v1/billing/save-offer",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "unknown" }),
      },
      env(),
    );

    expect(forbidden.status).toBe(403);
    expect(invalid.status).toBe(422);
  });

  it("accepts discount save offers by applying the configured Stripe coupon", async () => {
    const repository = new MemoryBillingRepository();
    repository.saveOfferAttempts = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        organization_id: ORG_ID,
        cancel_reason: "too_expensive",
        other_text: null,
        offer_shown: "discount_20pct_1inv",
        offer_accepted: null,
        stripe_coupon_id: null,
        created_at: "2026-06-13T00:00:00.000Z",
      },
    ];
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({
      id: "sub_123",
      status: "active",
    });

    const response = await app.request(
      "/api/v1/billing/save-offer/44444444-4444-4444-8444-444444444444/accept",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "subscription-1",
      status: "active",
    });
    expect(repository.acceptedOffer).toEqual({
      attemptId: "44444444-4444-4444-8444-444444444444",
      couponId: "coupon_save_20",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/subscriptions/sub_123",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key":
            "save-offer-accept:11111111-1111-4111-8111-111111111111:44444444-4444-4444-8444-444444444444:sub_123",
        }),
      }),
    );
    expect(lastStripeForm(fetchMock).get("coupon")).toBe("coupon_save_20");
    expect(lastStripeForm(fetchMock).get("metadata[app]")).toBe("capveri");
  });

  it("rejects unavailable save-offer acceptance states", async () => {
    const repository = new MemoryBillingRepository();
    repository.saveOfferAttempts = [
      {
        id: "55555555-5555-4555-8555-555555555555",
        organization_id: ORG_ID,
        cancel_reason: "missing_feature",
        other_text: null,
        offer_shown: "feature_roadmap",
        offer_accepted: null,
        stripe_coupon_id: null,
        created_at: "2026-06-13T00:00:00.000Z",
      },
    ];
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({ id: "sub_123" });

    const missing = await app.request(
      "/api/v1/billing/save-offer/missing/accept",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const unsupported = await app.request(
      "/api/v1/billing/save-offer/55555555-5555-4555-8555-555555555555/accept",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(missing.status).toBe(404);
    expect(unsupported.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects re-accepting an already-accepted save offer without re-applying the coupon", async () => {
    const repository = new MemoryBillingRepository();
    repository.saveOfferAttempts = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        organization_id: ORG_ID,
        cancel_reason: "too_expensive",
        other_text: null,
        offer_shown: "discount_20pct_1inv",
        offer_accepted: true,
        stripe_coupon_id: "coupon_save_20",
        created_at: "2026-06-13T00:00:00.000Z",
      },
    ];
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({ id: "sub_123", status: "active" });

    const response = await app.request(
      "/api/v1/billing/save-offer/44444444-4444-4444-8444-444444444444/accept",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "save_offer_already_accepted" },
    });
    // The live subscription must not be touched on a replayed accept.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.acceptedOffer).toBeNull();
  });

  it("rejects malformed save-offer accept ids before repository access", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({ id: "sub_123" });

    const response = await app.request(
      "/api/v1/billing/save-offer/not-a-uuid/accept",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(404);
    expect(repository.seenOrganizationIds).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires owner access for save-offer accept and decline", async () => {
    const { app } = createTestApp({ role: "member" });

    const accept = await app.request(
      "/api/v1/billing/save-offer/44444444-4444-4444-8444-444444444444/accept",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const decline = await app.request(
      "/api/v1/billing/save-offer/44444444-4444-4444-8444-444444444444/decline",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(accept.status).toBe(403);
    expect(decline.status).toBe(403);
  });

  it("rejects save-offer accept when coupon config or Stripe subscription is missing", async () => {
    const repository = new MemoryBillingRepository();
    repository.saveOfferAttempts = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        organization_id: ORG_ID,
        cancel_reason: "too_expensive",
        other_text: null,
        offer_shown: "discount_20pct_1inv",
        offer_accepted: null,
        stripe_coupon_id: null,
        created_at: "2026-06-13T00:00:00.000Z",
      },
    ];
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({ id: "sub_123" });
    const envWithoutCoupon = {
      ...env(),
      STRIPE_SAVE_OFFER_COUPON_ID_ANNUAL: undefined,
    };

    const missingCoupon = await app.request(
      "/api/v1/billing/save-offer/44444444-4444-4444-8444-444444444444/accept",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      envWithoutCoupon,
    );
    repository.subscription = {
      ...repository.subscription!,
      stripe_subscription_id: null,
    };
    const noStripeSubscription = await app.request(
      "/api/v1/billing/save-offer/44444444-4444-4444-8444-444444444444/accept",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(missingCoupon.status).toBe(500);
    expect(noStripeSubscription.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("declines save offers without blocking the cancellation flow", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({ repository, role: "owner" });

    const response = await app.request(
      "/api/v1/billing/save-offer/legacy-attempt-id/decline",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(204);
    expect(repository.declinedAttemptIds).toEqual(["legacy-attempt-id"]);
  });

  it("schedules subscription cancellation and marks save offer declined", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({
      id: "sub_123",
      status: "active",
      cancel_at_period_end: true,
    });

    const response = await app.request(
      "/api/v1/billing/subscription/cancel",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          immediate: false,
          attempt_id: "44444444-4444-4444-8444-444444444444",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cancel_at_period_end: true,
      updated_at: "2026-06-13T00:00:00.000Z",
    });
    expect(repository.declinedAttemptIds).toEqual([
      "44444444-4444-4444-8444-444444444444",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/subscriptions/sub_123",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastStripeForm(fetchMock).get("cancel_at_period_end")).toBe("true");
  });

  it("uses a local Stripe API base URL override when provided", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({
      id: "sub_123",
      status: "active",
      cancel_at_period_end: true,
    });

    const response = await app.request(
      "/api/v1/billing/subscription/cancel",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ immediate: false }),
      },
      {
        ...env(),
        STRIPE_API_BASE_URL: "http://127.0.0.1:7777/",
      } as unknown as AppEnv,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:7777/v1/subscriptions/sub_123",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("ignores Stripe API base URL overrides outside local environments", async () => {
    const repository = new MemoryBillingRepository();
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({
      id: "sub_123",
      status: "active",
      cancel_at_period_end: true,
    });

    const response = await app.request(
      "/api/v1/billing/subscription/cancel",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ immediate: false }),
      },
      {
        ...env(),
        ENVIRONMENT: "production",
        STRIPE_API_BASE_URL: "https://attacker.example",
      } as unknown as AppEnv,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/subscriptions/sub_123",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps cancellation best-effort when save-offer decline tracking fails", async () => {
    const repository = new MemoryBillingRepository();
    repository.declineAttemptFails = true;
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({
      id: "sub_123",
      status: "active",
      cancel_at_period_end: true,
    });

    const response = await app.request(
      "/api/v1/billing/subscription/cancel",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ attempt_id: "legacy-attempt-id" }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cancel_at_period_end: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/subscriptions/sub_123",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("cancels subscriptions immediately through Stripe delete", async () => {
    const { app } = createTestApp({ role: "owner" });
    const fetchMock = mockStripeJson({
      id: "sub_123",
      status: "canceled",
    });

    const response = await app.request(
      "/api/v1/billing/subscription/cancel",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ immediate: true }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "canceled",
      cancel_at_period_end: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/subscriptions/sub_123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("resumes scheduled subscription cancellations", async () => {
    const repository = new MemoryBillingRepository();
    repository.subscription = {
      ...repository.subscription!,
      cancel_at_period_end: true,
    };
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({
      id: "sub_123",
      status: "active",
      cancel_at_period_end: false,
    });

    const response = await app.request(
      "/api/v1/billing/subscription/resume",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cancel_at_period_end: false,
      updated_at: "2026-06-13T00:00:00.000Z",
    });
    expect(lastStripeForm(fetchMock).get("cancel_at_period_end")).toBe("false");
  });

  it("resumes paused subscriptions with Stripe period timestamps", async () => {
    const repository = new MemoryBillingRepository();
    repository.subscription = {
      ...repository.subscription!,
      status: "paused",
      cancel_at_period_end: false,
    };
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({
      id: "sub_123",
      status: "active",
      cancel_at_period_end: false,
      current_period_start: 1781308800,
      current_period_end: 1812844800,
    });

    const response = await app.request(
      "/api/v1/billing/subscription/resume",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "active",
      current_period_start: "2026-06-13T00:00:00.000Z",
      current_period_end: "2027-06-13T00:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/subscriptions/sub_123/resume",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastStripeForm(fetchMock).get("billing_cycle_anchor")).toBe("now");
  });

  it("maps paused subscription resume payment failures to actionable errors", async () => {
    const repository = new MemoryBillingRepository();
    repository.subscription = {
      ...repository.subscription!,
      status: "paused",
      cancel_at_period_end: false,
    };
    const { app } = createTestApp({ repository, role: "owner" });
    mockStripeJson({ error: { message: "missing payment method" } }, 400);

    const response = await app.request(
      "/api/v1/billing/subscription/resume",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Add a valid payment method before resuming access",
    });
  });

  it("rejects resume for active subscriptions that are not canceling", async () => {
    const { app } = createTestApp({ role: "owner" });
    const fetchMock = mockStripeJson({ id: "sub_123" });

    const response = await app.request(
      "/api/v1/billing/subscription/resume",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      detail: "Subscription is not paused or scheduled for cancellation",
    });
  });

  it("rejects subscription lifecycle writes without owner role or Stripe subscription", async () => {
    const memberApp = createTestApp({ role: "member" }).app;
    const memberResponse = await memberApp.request(
      "/api/v1/billing/subscription/cancel",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: JSON.stringify({ immediate: false }),
      },
      env(),
    );
    expect(memberResponse.status).toBe(403);

    const repository = new MemoryBillingRepository();
    repository.subscription = {
      ...repository.subscription!,
      stripe_subscription_id: null,
    };
    const { app } = createTestApp({ repository, role: "owner" });
    const fetchMock = mockStripeJson({ id: "sub_123" });
    const missingStripeResponse = await app.request(
      "/api/v1/billing/subscription/cancel",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: JSON.stringify({ immediate: false }),
      },
      env(),
    );

    expect(missingStripeResponse.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when no billing customer exists", async () => {
    const response = await createTestApp({}).app.request(
      "/api/v1/billing/customer",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "No billing customer found for this organization",
    });
  });

  it("retrieves an existing Stripe billing customer", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_existing" };
    const fetchMock = mockStripeJson({
      id: "cus_existing",
      email: null,
      name: null,
      created: 456,
    });
    const response = await createTestApp({ repository }).app.request(
      "/api/v1/billing/customer",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "cus_existing",
      email: "",
      name: "",
      created: 456,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/customers/cus_existing",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          authorization: "Bearer sk_test",
          "stripe-version": "2023-10-16",
        }),
      }),
    );
  });

  it("creates and persists a Stripe billing customer", async () => {
    const repository = new MemoryBillingRepository();
    const fetchMock = mockStripeJson({
      id: "cus_new",
      email: "billing@example.test",
      name: "Test Org",
      created: 789,
    });
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/customer",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const form = lastStripeForm(fetchMock);

    expect(response.status).toBe(201);
    expect(repository.savedStripeCustomerId).toBe("cus_new");
    expect(form.get("email")).toBe("billing@example.test");
    expect(form.get("name")).toBe("Test Org");
    expect(form.get("metadata[organization_id]")).toBe(ORG_ID);
    expect(form.get("metadata[source]")).toBe("capveri");
    await expect(response.json()).resolves.toMatchObject({ id: "cus_new" });
  });

  it("fails customer creation before Stripe when the local subscription is missing", async () => {
    const repository = new MemoryBillingRepository();
    repository.localSubscriptionExists = false;
    const fetchMock = mockStripeJson({
      id: "cus_orphaned",
      email: "billing@example.test",
      name: "Test Org",
      created: 789,
    });
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/customer",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      detail: "Cannot create Stripe customer without a local subscription",
    });
  });

  it("lists Stripe card payment methods with the default marker", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_cards" };
    const fetchMock = mockStripeJsonSequence([
      {
        payload: {
          data: [
            {
              id: "pm_default",
              customer: "cus_cards",
              card: {
                brand: "visa",
                last4: "4242",
                exp_month: 6,
                exp_year: 2030,
              },
            },
            {
              id: "pm_backup",
              customer: "cus_cards",
              card: {
                brand: "mastercard",
                last4: "4444",
                exp_month: 7,
                exp_year: 2031,
              },
            },
          ],
        },
      },
      {
        payload: {
          id: "cus_cards",
          email: null,
          name: null,
          created: 456,
          invoice_settings: { default_payment_method: "pm_default" },
        },
      },
    ]);

    const response = await createTestApp({ repository }).app.request(
      "/api/v1/billing/payment-methods",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.stripe.com/v1/payment_methods?customer=cus_cards&type=card",
      expect.objectContaining({ method: "GET" }),
    );
    await expect(response.json()).resolves.toEqual([
      {
        id: "pm_default",
        brand: "visa",
        last4: "4242",
        exp_month: 6,
        exp_year: 2030,
        is_default: true,
      },
      {
        id: "pm_backup",
        brand: "mastercard",
        last4: "4444",
        exp_month: 7,
        exp_year: 2031,
        is_default: false,
      },
    ]);
  });

  it("returns 404 for payment methods without a Stripe customer", async () => {
    const fetchMock = mockStripeJson({ data: [] });
    const response = await createTestApp({}).app.request(
      "/api/v1/billing/payment-methods",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      detail: "No billing customer found",
    });
  });

  it("creates a Stripe setup intent for adding a payment method", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_setup" };
    const fetchMock = mockStripeJson({
      client_secret: "seti_secret_123",
    });

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/payment-methods/setup",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const form = lastStripeForm(fetchMock);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/setup_intents",
      expect.objectContaining({ method: "POST" }),
    );
    expect(form.get("customer")).toBe("cus_setup");
    expect(form.get("payment_method_types[0]")).toBe("card");
    await expect(response.json()).resolves.toEqual({
      client_secret: "seti_secret_123",
    });
  });

  it("rejects setup intents without a client secret", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_setup" };
    mockStripeJson({ client_secret: null });

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/payment-methods/setup",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Failed to create setup intent",
    });
  });

  it("sets a customer-owned payment method as default", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_default" };
    const fetchMock = mockStripeJsonSequence([
      {
        payload: {
          id: "pm_default",
          customer: { id: "cus_default" },
          card: { brand: "visa", last4: "4242", exp_month: 6, exp_year: 2030 },
        },
      },
      {
        payload: {
          id: "cus_default",
          email: null,
          name: null,
          created: 456,
        },
      },
    ]);

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/payment-methods/pm_default/default",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const form = lastStripeForm(fetchMock);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.stripe.com/v1/payment_methods/pm_default",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.stripe.com/v1/customers/cus_default",
      expect.objectContaining({ method: "POST" }),
    );
    expect(form.get("invoice_settings[default_payment_method]")).toBe(
      "pm_default",
    );
    await expect(response.json()).resolves.toEqual({ status: "success" });
  });

  it("rejects default payment method updates for another Stripe customer", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_current" };
    const fetchMock = mockStripeJson({
      id: "pm_foreign",
      customer: "cus_other",
      card: { brand: "visa", last4: "4242", exp_month: 6, exp_year: 2030 },
    });

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/payment-methods/pm_foreign/default",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Payment method not found for customer",
    });
  });

  it("maps missing Stripe payment methods to not found", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_current" };
    const fetchMock = mockStripeJson(
      { error: { message: "No such PaymentMethod" } },
      404,
    );

    const defaultResponse = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/payment-methods/pm_missing/default",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(defaultResponse.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(defaultResponse.json()).resolves.toMatchObject({
      detail: "Payment method not found for customer",
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "No such PM" } }), {
        status: 404,
      }),
    );

    const deleteResponse = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/payment-methods/pm_missing",
      { method: "DELETE", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(deleteResponse.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      detail: "Payment method not found for customer",
    });
  });

  it("removes a customer-owned payment method when another card remains", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_remove" };
    const fetchMock = mockStripeJsonSequence([
      {
        payload: {
          id: "pm_remove",
          customer: "cus_remove",
          card: { brand: "visa", last4: "4242", exp_month: 6, exp_year: 2030 },
        },
      },
      {
        payload: {
          data: [
            {
              id: "pm_remove",
              customer: "cus_remove",
              card: {
                brand: "visa",
                last4: "4242",
                exp_month: 6,
                exp_year: 2030,
              },
            },
            {
              id: "pm_keep",
              customer: "cus_remove",
              card: {
                brand: "mastercard",
                last4: "4444",
                exp_month: 7,
                exp_year: 2031,
              },
            },
          ],
        },
      },
      {
        payload: {
          id: "pm_remove",
          customer: null,
        },
      },
    ]);

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/payment-methods/pm_remove",
      { method: "DELETE", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.stripe.com/v1/payment_methods/pm_remove/detach",
      expect.objectContaining({ method: "POST" }),
    );
    await expect(response.json()).resolves.toEqual({ status: "success" });
  });

  it("rejects removing the only payment method", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_only" };
    const fetchMock = mockStripeJsonSequence([
      {
        payload: {
          id: "pm_only",
          customer: "cus_only",
          card: { brand: "visa", last4: "4242", exp_month: 6, exp_year: 2030 },
        },
      },
      {
        payload: {
          data: [
            {
              id: "pm_only",
              customer: "cus_only",
              card: {
                brand: "visa",
                last4: "4242",
                exp_month: 6,
                exp_year: 2030,
              },
            },
          ],
        },
      },
    ]);

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/payment-methods/pm_only",
      { method: "DELETE", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Cannot remove the only payment method",
    });
  });

  it("enforces payment-method auth boundaries", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_auth" };
    const fetchMock = mockStripeJsonSequence([
      { payload: { data: [] } },
      {
        payload: {
          id: "cus_auth",
          email: null,
          name: null,
          created: 456,
        },
      },
    ]);
    const memberList = await createTestApp({
      repository,
      role: "member",
    }).app.request(
      "/api/v1/billing/payment-methods",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const memberSetup = await createTestApp({
      repository,
      role: "member",
    }).app.request(
      "/api/v1/billing/payment-methods/setup",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const memberDefault = await createTestApp({
      repository,
      role: "member",
    }).app.request(
      "/api/v1/billing/payment-methods/pm_auth/default",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const memberDelete = await createTestApp({
      repository,
      role: "member",
    }).app.request(
      "/api/v1/billing/payment-methods/pm_auth",
      { method: "DELETE", headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const tenantList = await createTestApp({
      repository,
      role: "tenant",
    }).app.request(
      "/api/v1/billing/payment-methods",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(memberList.status).toBe(200);
    expect(memberSetup.status).toBe(403);
    expect(memberDefault.status).toBe(403);
    expect(memberDelete.status).toBe(403);
    expect(tenantList.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid checkout payloads and offer combinations", async () => {
    const request = (body: object) =>
      createTestApp({ role: "owner" }).app.request(
        "/api/v1/billing/checkout",
        {
          method: "POST",
          headers: {
            authorization: "Bearer valid-token",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
        env(),
      );

    await expect(
      (
        await request({
          plan_id: "reconcile",
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
          offer_token: "token",
          launch_offer_code: "80OFF",
        })
      ).json(),
    ).resolves.toMatchObject({
      detail:
        "Choose either a limited offer code or winback offer token, not both",
    });
    await expect(
      (
        await request({
          plan_id: "reconcile",
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
          launch_offer_code: "BAD",
        })
      ).json(),
    ).resolves.toMatchObject({ detail: "Invalid limited offer code" });
    expect(
      await request({
        plan_id: "reconcile",
        billing_period: "monthly",
        success_url: "https://app.example.test/success",
        cancel_url: "https://app.example.test/cancel",
      }),
    ).toHaveProperty("status", 422);
  });

  it("rejects checkout when saved activation mismatches the request", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    };
    repository.billingActivation = {
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 50,
      building_count: 1,
      checkout_required: true,
    };
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Saved checkout selection does not match this request",
    });
  });

  it("rejects checkout for paused local rows with a Stripe subscription", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: "sub_paused",
      status: "paused",
      current_period_end: null,
    };
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(409);
  });

  it("rejects re-checkout for an org with a live Stripe subscription (no double-billing)", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: "sub_active",
      status: "active",
      current_period_end: null,
    };
    const fetchMock = mockStripeJson({
      id: "cs_should_not_create",
      url: "https://checkout.stripe.test/cs_should_not_create",
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("already_subscribed");
    // The guard must fire BEFORE any Stripe checkout-session creation, so the
    // customer can never end up with a second live subscription.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows re-checkout for a canceled org so it can resubscribe", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: "sub_canceled",
      status: "canceled",
      current_period_end: null,
    };
    const fetchMock = mockStripeJson({
      id: "cs_resub",
      url: "https://checkout.stripe.test/cs_resub",
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("creates a Stripe checkout session with metadata, trial, and discount", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    };
    const fetchMock = mockStripeJson({
      id: "cs_123",
      url: "https://checkout.stripe.test/cs_123",
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 50,
          building_count: 2,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
          launch_offer_code: "80OFF",
        }),
      },
      env(),
    );
    const form = lastStripeForm(fetchMock);

    expect(response.status).toBe(200);
    expect(repository.savedCheckoutInput).toEqual({
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 50,
      building_count: 2,
    });
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("customer")).toBe("cus_existing");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("946500");
    expect(form.get("line_items[0][price_data][product_data][name]")).toBe(
      "CapVeri Reconcile",
    );
    expect(form.get("metadata[organization_id]")).toBe(ORG_ID);
    expect(form.get("metadata[annual_total_cents]")).toBe("946500");
    expect(form.get("metadata[app]")).toBe("capveri");
    expect(form.get("subscription_data[metadata][organization_id]")).toBe(
      ORG_ID,
    );
    expect(form.get("subscription_data[trial_period_days]")).toBe("2");
    expect(form.get("discounts[0][coupon]")).toBe("coupon_80off");
    await expect(response.json()).resolves.toEqual({
      checkout_url: "https://checkout.stripe.test/cs_123",
      session_id: "cs_123",
    });
  });

  it("rejects the launch offer on Stripe checkout after the July 3 deadline", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    };
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await createTestApp({
      repository,
      role: "owner",
      clock: () => new Date("2026-07-04T07:00:01.000Z"),
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 50,
          building_count: 2,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
          launch_offer_code: "80OFF",
        }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.savedCheckoutInput).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "offer_expired" },
    });
  });

  it("creates checkout with a valid winback offer token", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const fetchMock = mockStripeJson({
      id: "cs_offer",
      url: "https://checkout.stripe.test/cs_offer",
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 50,
          building_count: 2,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
          offer_token: await createOfferToken(),
        }),
      },
      env(),
    );
    const form = lastStripeForm(fetchMock);

    expect(response.status).toBe(200);
    expect(form.get("discounts[0][coupon]")).toBe("coupon_offer_50");
    expect(form.get("metadata[offer_tier]")).toBe("offer_50");
    expect(form.get("subscription_data[metadata][offer_tier]")).toBe(
      "offer_50",
    );
  });

  it("rejects invalid and already-redeemed winback offer tokens", async () => {
    const expiredRepository = new MemoryBillingRepository();
    expiredRepository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const expiredResponse = await createTestApp({
      repository: expiredRepository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
          offer_token: await createOfferToken({ expiresAtUnix: 1 }),
        }),
      },
      env(),
    );
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    };
    repository.redeemedWinbackOffer = true;
    const redeemedResponse = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan_id: "reconcile",
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
          offer_token: await createOfferToken(),
        }),
      },
      env(),
    );

    expect(expiredResponse.status).toBe(400);
    await expect(expiredResponse.json()).resolves.toMatchObject({
      detail: "Invalid offer token: token expired",
    });
    expect(redeemedResponse.status).toBe(409);
    await expect(redeemedResponse.json()).resolves.toMatchObject({
      detail: "A winback offer has already been redeemed for this organization",
    });
  });

  it("verifies checkout success ownership and returns session identifiers", async () => {
    const mismatchFetch = mockStripeJson({
      id: "cs_123",
      url: null,
      metadata: { organization_id: "other-org" },
      subscription: "sub_123",
      customer: "cus_123",
    });
    const mismatch = await createTestApp({}).app.request(
      "/api/v1/billing/checkout/success?session_id=cs_123",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(mismatch.status).toBe(403);
    mismatchFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "cs_123",
          url: null,
          metadata: { organization_id: ORG_ID },
          subscription: "sub_123",
          customer: "cus_123",
        }),
        { status: 200 },
      ),
    );

    const success = await createTestApp({}).app.request(
      "/api/v1/billing/checkout/success?session_id=cs_123",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toEqual({
      status: "success",
      subscription_id: "sub_123",
      customer_id: "cus_123",
    });
  });

  it("maps malformed Stripe checkout session ids to invalid session", async () => {
    mockStripeJson({ error: { message: "No such checkout.session" } }, 400);
    const response = await createTestApp({}).app.request(
      "/api/v1/billing/checkout/success?session_id=bad_session",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Invalid session",
      error: { code: "invalid_session" },
    });
  });

  it("creates portal session when a customer exists", async () => {
    const repository = new MemoryBillingRepository();
    repository.billingCustomer = { stripe_customer_id: "cus_portal" };
    const fetchMock = mockStripeJson({
      url: "https://billing.stripe.test/session",
    });
    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/portal?return_url=https%3A%2F%2Fapp.example.test%2Fbilling",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const form = lastStripeForm(fetchMock);

    expect(response.status).toBe(200);
    expect(form.get("customer")).toBe("cus_portal");
    expect(form.get("return_url")).toBe("https://app.example.test/billing");
    await expect(response.json()).resolves.toEqual({
      url: "https://billing.stripe.test/session",
    });
  });

  it("returns 404 for portal without a customer", async () => {
    const response = await createTestApp({ role: "owner" }).app.request(
      "/api/v1/billing/portal?return_url=https%3A%2F%2Fapp.example.test%2Fbilling",
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "No billing customer found",
    });
  });

  it("rejects upgrade by non-owner with 403", async () => {
    const response = await createTestApp({ role: "member" }).app.request(
      "/api/v1/billing/subscription/upgrade",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ new_plan: "reconcile" }),
      },
      env(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Insufficient permissions",
    });
  });

  it("returns 400 disabled stub for upgrade by owner", async () => {
    const response = await createTestApp({ role: "owner" }).app.request(
      "/api/v1/billing/subscription/upgrade",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ new_plan: "reconcile" }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Plan changes are no longer supported. Reconcile is the only active subscription; use checkout to update rentable unit count.",
    });
  });

  it("rejects downgrade by non-owner with 403", async () => {
    const response = await createTestApp({ role: "member" }).app.request(
      "/api/v1/billing/subscription/downgrade",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ new_plan: "reconcile" }),
      },
      env(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Insufficient permissions",
    });
  });

  it("returns 400 disabled stub for downgrade by owner", async () => {
    const response = await createTestApp({ role: "owner" }).app.request(
      "/api/v1/billing/subscription/downgrade",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ new_plan: "reconcile" }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Plan changes are no longer supported. Reconcile is the only active subscription; use checkout to update rentable unit count.",
    });
  });

  it("rejects subscribe by non-owner with 403", async () => {
    const response = await createTestApp({ role: "member" }).app.request(
      "/api/v1/billing/subscribe",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: "reconcile",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Insufficient permissions",
    });
  });

  it("returns subscribe checkout url with tier and pricing for owner happy path", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    };
    const fetchMock = mockStripeJson({
      id: "cs_sub",
      url: "https://checkout.stripe.test/cs_sub",
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/subscribe",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: "reconcile",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    const form = lastStripeForm(fetchMock);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      checkout_url: "https://checkout.stripe.test/cs_sub",
      tier: "reconcile",
    });
    expect(typeof (body as Record<string, unknown>).price_annual_cents).toBe(
      "number",
    );
    expect(typeof (body as Record<string, unknown>).trial_days).toBe("number");
    expect(form.get("metadata[billing_model]")).toBe("subscription");
    expect(form.get("metadata[organization_id]")).toBe(ORG_ID);
    expect(form.get("metadata[tier]")).toBe("reconcile");
    expect(form.get("metadata[plan_id]")).toBe("reconcile");
    expect(form.get("metadata[pricing_model]")).toBe("per_unit");
    expect(form.get("metadata[building_count]")).toBe("1");
    expect(form.get("metadata[unit_count]")).toBe("25");
    expect(form.get("metadata[included_units]")).not.toBeNull();
    expect(form.get("metadata[unit_overage_count]")).toBe("0");
    expect(form.get("metadata[annual_total_cents]")).not.toBeNull();
    expect(form.get("subscription_data[trial_period_days]")).toBe("2");
  });

  it("rejects subscribe for an org with a live Stripe subscription before creating a session", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: "sub_active",
      status: "active",
      current_period_end: null,
    };
    const fetchMock = mockStripeJson({
      id: "cs_should_not_create",
      url: "https://checkout.stripe.test/cs_should_not_create",
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/subscribe",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: "reconcile",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("already_subscribed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows subscribe for a canceled org so it can resubscribe", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: "sub_canceled",
      status: "canceled",
      current_period_end: null,
    };
    const fetchMock = mockStripeJson({
      id: "cs_resubscribe",
      url: "https://checkout.stripe.test/cs_resubscribe",
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/subscribe",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: "reconcile",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkout_url: "https://checkout.stripe.test/cs_resubscribe",
      tier: "reconcile",
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("rejects subscribe with invalid tier via validation error", async () => {
    const response = await createTestApp({ role: "owner" }).app.request(
      "/api/v1/billing/subscribe",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: "growth",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(422);
  });

  it("returns 404 when organization not found during subscribe", async () => {
    const repository = new MemoryBillingRepository();
    repository.organizationBillingProfile = null;
    repository.checkoutBillingState = null;

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/subscribe",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: "reconcile",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Organization not found",
    });
  });

  it("returns 500 when Stripe checkout session url is missing during subscribe", async () => {
    const repository = new MemoryBillingRepository();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: null,
    };
    mockStripeJson({
      id: "cs_null_url",
      url: null,
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/subscribe",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: "reconcile",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Failed to create checkout session",
    });
  });

  it("uses remaining trial days for local trialing subscriptions without Stripe", async () => {
    const repository = new MemoryBillingRepository();
    const futureEnd = new Date(Date.now() + 5 * 86_400_000).toISOString();
    repository.checkoutBillingState = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      status: "trialing",
      current_period_end: futureEnd,
    };
    mockStripeJson({
      id: "cs_trial",
      url: "https://checkout.stripe.test/cs_trial",
      metadata: {},
      subscription: null,
      customer: "cus_existing",
    });

    const response = await createTestApp({
      repository,
      role: "owner",
    }).app.request(
      "/api/v1/billing/subscribe",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: "reconcile",
          unit_count: 25,
          building_count: 1,
          success_url: "https://app.example.test/success",
          cancel_url: "https://app.example.test/cancel",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { trial_days: number };
    expect(body.trial_days).toBeGreaterThan(0);
    expect(body.trial_days).toBeLessThan(30);
  });
});
