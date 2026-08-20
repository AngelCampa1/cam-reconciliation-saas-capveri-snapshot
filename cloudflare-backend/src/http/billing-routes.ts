import { Hono } from "hono";
import { z } from "zod";
import { PostgresBillingRepository } from "../adapters/db/billing";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  getAnnualTotalCents,
  getTierDetails,
  LAUNCH_OFFER,
} from "../domain/billing/plan-tiers";
import { BillingTrialPausedError } from "../domain/billing/repository";
import type {
  BillingRepository,
  ActiveLaunchPhase,
  CancelReason,
  SaveOfferType,
} from "../domain/billing/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { requireRuntimeSecret } from "../platform/cloudflare";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type BillingRouteDependencies = {
  repository?: BillingRepository;
  auth?: AuthMiddlewareOptions;
  clock?: () => Date;
};

const planSelectionSchema = z
  .object({
    plan_id: z.string(),
    billing_period: z.literal("annual").default("annual"),
    unit_count: z.number().int().min(1).default(1),
    building_count: z.number().int().min(1).default(1),
    launch_offer_code: z.string().nullable().optional(),
  })
  .strict();

const checkoutSchema = z.object({
  plan_id: z.string(),
  billing_period: z.literal("annual").default("annual"),
  unit_count: z.number().int().min(1).default(1),
  building_count: z.number().int().min(1).default(1),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
  offer_token: z.string().nullable().optional(),
  launch_offer_code: z.string().nullable().optional(),
});
const cancelSubscriptionSchema = z
  .object({
    immediate: z.boolean().default(false),
    attempt_id: z.string().nullable().optional(),
  })
  .strict();
const planChangeSchema = z.object({ new_plan: z.string() });
const subscribeSchema = z.object({
  tier: z.string().regex(/^reconcile$/),
  unit_count: z.number().int().min(1).default(25),
  building_count: z.number().int().min(1).default(1),
  success_url: z.string(),
  cancel_url: z.string(),
});
const cancelReasonSchema = z.enum([
  "too_expensive",
  "not_using_enough",
  "missing_feature",
  "switching_competitor",
  "business_closed",
  "other",
]);
const saveOfferSchema = z
  .object({
    reason: cancelReasonSchema,
    other_text: z.string().nullable().optional(),
  })
  .strict();
const trialStartSchema = planSelectionSchema;
const invoiceStatusSchema = z.enum([
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
]);
const invoiceQuerySchema = z.object({
  status: invoiceStatusSchema.nullable().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
});

type StripeCustomer = {
  id: string;
  email: string | null;
  name: string | null;
  created: number;
  invoice_settings?: {
    default_payment_method?: string | { id?: string } | null;
  } | null;
};

type StripeCheckoutSession = {
  id: string;
  url: string | null;
  metadata: Record<string, string> | null;
  subscription: string | null;
  customer: string | null;
};

type StripePortalSession = {
  url: string | null;
};

type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
};

type StripeInvoice = {
  id: string;
  payment_intent: string | { id?: string } | null;
};

type StripeRefund = {
  id: string;
  amount: number;
  currency: string;
};

type StripePaymentMethod = {
  id: string;
  customer: string | { id?: string } | null;
  card?: {
    brand?: string;
    last4?: string;
    exp_month?: number;
    exp_year?: number;
  } | null;
};

type StripePaymentMethodList = {
  data: StripePaymentMethod[];
};

type StripeSetupIntent = {
  client_secret: string | null;
};

type StripePriceData = {
  currency: "usd";
  unit_amount: number;
  recurring: { interval: "year" };
  product?: string;
  product_data?: { name: string; description: string };
};

type CheckoutLineItem =
  | { price: string; quantity: number }
  | {
      price_data: StripePriceData;
      quantity: number;
    };

const STRIPE_API_VERSION = "2023-10-16";
const TRIAL_DAYS = 30;
const GUARANTEE_WINDOW_DAYS = 30;
const APP_IDENTIFIER = "capveri";
const WINBACK_OFFER_COUPONS = {
  offer_50: "STRIPE_FREE_AUDIT_COUPON_OFFER_50",
  offer_free: "STRIPE_FREE_AUDIT_COUPON_OFFER_FREE",
} as const;
const PAUSED_STRIPE_SUBSCRIPTION_MESSAGE =
  "Your trial is paused because billing was not added before it ended. Add a payment method in billing settings to resume access.";

export function createBillingRoutes(
  dependencies: BillingRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/billing/free-audit-status", authMiddleware(dependencies.auth));
  app.use("/billing/guarantee/eligibility", authMiddleware(dependencies.auth));
  app.use("/billing/guarantee/claim", authMiddleware(dependencies.auth));
  app.use("/billing/plan-selection", authMiddleware(dependencies.auth));
  app.use("/billing/feature-usage", authMiddleware(dependencies.auth));
  app.use("/billing/credits", authMiddleware(dependencies.auth));
  app.use("/billing/credits/history", authMiddleware(dependencies.auth));
  app.use("/billing/customer", authMiddleware(dependencies.auth));
  app.use("/billing/payment-methods", authMiddleware(dependencies.auth));
  app.use("/billing/payment-methods/*", authMiddleware(dependencies.auth));
  app.use("/billing/save-offer", authMiddleware(dependencies.auth));
  app.use("/billing/save-offer/*", authMiddleware(dependencies.auth));
  app.use("/billing/subscribe", authMiddleware(dependencies.auth));
  app.use("/billing/subscription", authMiddleware(dependencies.auth));
  app.use("/billing/subscription/*", authMiddleware(dependencies.auth));
  app.use("/billing/checkout", authMiddleware(dependencies.auth));
  app.use("/billing/checkout/success", authMiddleware(dependencies.auth));
  app.use("/billing/trial/start", authMiddleware(dependencies.auth));
  app.use("/billing/trial/start-default", authMiddleware(dependencies.auth));
  app.use("/billing/invoices", authMiddleware(dependencies.auth));
  app.use("/billing/invoices/*", authMiddleware(dependencies.auth));
  app.use("/billing/portal", authMiddleware(dependencies.auth));

  app.get("/billing/launch-offer/active", async (c) =>
    c.json(await getActiveLaunchPhase(c.env, now(dependencies))),
  );

  app.get("/billing/free-audit-status", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    return c.json(
      await resolveRepository(c.env, dependencies).getFreeAuditStatus(
        auth.actor.organizationId,
      ),
    );
  });

  app.get("/billing/guarantee/eligibility", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    return c.json(
      await getGuaranteeEligibility(
        resolveRepository(c.env, dependencies),
        auth.actor.organizationId,
        now(dependencies),
      ),
    );
  });

  app.post("/billing/guarantee/claim", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const repository = resolveRepository(c.env, dependencies);
    const eligibility = await getGuaranteeEligibility(
      repository,
      auth.actor.organizationId,
      now(dependencies),
    );

    if (!eligibility.eligible) {
      throw new HttpError(
        409,
        "guarantee_not_eligible",
        "Not eligible for money-back guarantee",
      );
    }

    const invoice = await repository.getFirstPaidInvoiceForGuarantee(
      auth.actor.organizationId,
    );

    if (!invoice) {
      throw new HttpError(
        422,
        "paid_invoice_not_found",
        "No paid invoice found - cannot process refund",
      );
    }
    if (!invoice.stripe_invoice_id) {
      throw new HttpError(
        422,
        "invoice_missing_stripe_reference",
        "Invoice has no Stripe reference - cannot process refund",
      );
    }

    const stripeInvoice = await stripeRetrieveInvoice(
      c.env,
      invoice.stripe_invoice_id,
    );
    const paymentIntentId = readStripePaymentIntentId(stripeInvoice);

    if (!paymentIntentId) {
      throw new HttpError(
        422,
        "invoice_missing_payment_intent",
        "Stripe invoice has no payment intent - cannot process refund",
      );
    }

    const subscription = await repository.getSubscription(
      auth.actor.organizationId,
    );

    if (!subscription?.stripe_subscription_id) {
      throw new HttpError(
        422,
        "subscription_missing_stripe_reference",
        "Subscription has no Stripe reference - cannot process refund",
      );
    }

    const refund = await stripeCreateRefund(
      c.env,
      paymentIntentId,
      `guarantee-refund:${auth.actor.organizationId}:${invoice.id}`,
    );
    const claimedAt = now(dependencies).toISOString();

    const claimed = await repository.recordGuaranteeClaim({
      organizationId: auth.actor.organizationId,
      refundId: refund.id,
      claimedAt,
    });

    if (!claimed) {
      throw new HttpError(
        409,
        "guarantee_already_claimed",
        "Not eligible for money-back guarantee",
      );
    }

    await stripeCancelSubscriptionWithoutProration(
      c.env,
      subscription.stripe_subscription_id,
    );
    await repository.markSubscriptionCanceledForGuarantee({
      organizationId: auth.actor.organizationId,
      updatedAt: claimedAt,
    });

    return c.json({
      refund_id: refund.id,
      amount_refunded: refund.amount / 100,
      currency: refund.currency,
    });
  });

  app.get("/billing/plan-selection", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    return c.json(
      await resolveRepository(c.env, dependencies).getPlanSelection(
        auth.actor.organizationId,
      ),
    );
  });

  app.post("/billing/trial/start", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const payload = trialStartSchema.parse(await parseJsonBody(c));
    validateLaunchOfferCode(payload.launch_offer_code, now(dependencies));
    validatePlanSelection(payload);

    return c.json(
      await startTrialOrThrow(c.env, dependencies, auth.actor.organizationId, {
        plan_id: payload.plan_id,
        billing_period: payload.billing_period,
        unit_count: payload.unit_count,
        building_count: payload.building_count,
      }),
    );
  });

  app.post("/billing/trial/start-default", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    return c.json(
      await startTrialOrThrow(c.env, dependencies, auth.actor.organizationId, {
        plan_id: "reconcile",
        billing_period: "annual",
        unit_count: 25,
        building_count: 1,
      }),
    );
  });

  app.put("/billing/plan-selection", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const payload = planSelectionSchema.parse(await parseJsonBody(c));
    validateLaunchOfferCode(payload.launch_offer_code, now(dependencies));
    validatePlanSelection(payload);

    return c.json(
      await resolveRepository(c.env, dependencies).savePlanSelection(
        auth.actor.organizationId,
        {
          plan_id: payload.plan_id,
          billing_period: payload.billing_period,
          unit_count: payload.unit_count,
          building_count: payload.building_count,
        },
      ),
    );
  });

  app.get("/billing/feature-usage", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    return c.json(
      await resolveRepository(c.env, dependencies).getFeatureUsage(
        auth.actor.organizationId,
      ),
    );
  });

  app.get("/billing/credits", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    return c.json(
      await resolveRepository(c.env, dependencies).getCredits(
        auth.actor.organizationId,
      ),
    );
  });

  app.get("/billing/credits/history", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    return c.json(
      await resolveRepository(c.env, dependencies).getCreditHistory(
        auth.actor.organizationId,
      ),
    );
  });

  app.get("/billing/invoices", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    const query = invoiceQuerySchema.parse({
      ...c.req.query(),
      status: c.req.query("status") ?? null,
    });

    return c.json(
      await resolveRepository(c.env, dependencies).listInvoices({
        organizationId: auth.actor.organizationId,
        status: query.status ?? null,
        page: query.page,
        perPage: query.per_page,
      }),
    );
  });

  app.get("/billing/invoices/summary", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    return c.json(
      await resolveRepository(c.env, dependencies).getInvoiceSummary(
        auth.actor.organizationId,
      ),
    );
  });

  app.get("/billing/invoices/:invoiceId", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    const invoice = await resolveRepository(c.env, dependencies).getInvoice({
      organizationId: auth.actor.organizationId,
      invoiceId: c.req.param("invoiceId"),
    });

    if (!invoice) {
      throw new HttpError(404, "invoice_not_found", "Invoice not found");
    }

    return c.json(invoice);
  });

  app.get("/billing/invoices/:invoiceId/pdf", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    const pdfUrl = await resolveRepository(
      c.env,
      dependencies,
    ).getInvoicePdfUrl({
      organizationId: auth.actor.organizationId,
      invoiceId: c.req.param("invoiceId"),
    });

    if (pdfUrl === undefined) {
      throw new HttpError(404, "invoice_not_found", "Invoice not found");
    }
    if (!pdfUrl) {
      throw new HttpError(
        404,
        "invoice_pdf_not_available",
        "PDF not available",
      );
    }

    return c.redirect(pdfUrl);
  });

  app.get("/billing/subscription", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    const subscription = await resolveRepository(
      c.env,
      dependencies,
    ).getSubscription(auth.actor.organizationId);

    if (!subscription) {
      throw new HttpError(
        404,
        "subscription_not_found",
        "No subscription found for this organization",
      );
    }

    return c.json(subscription);
  });

  app.post("/billing/save-offer", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const payload = saveOfferSchema.parse(await parseJsonBody(c));
    const offerType = saveOfferTypeForReason(payload.reason);
    const attempt = await resolveRepository(
      c.env,
      dependencies,
    ).createSaveOfferAttempt({
      organizationId: auth.actor.organizationId,
      reason: payload.reason,
      otherText: payload.other_text ?? null,
      offerType,
    });

    return c.json({
      attempt_id: attempt.id,
      offer_type: attempt.offer_shown,
      discount_percent:
        attempt.offer_shown === "discount_20pct_1inv" ? 20 : null,
    });
  });

  app.post("/billing/save-offer/:attemptId/accept", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const repository = resolveRepository(c.env, dependencies);
    const attemptId = c.req.param("attemptId");

    if (!isUuid(attemptId)) {
      throw new HttpError(
        404,
        "cancel_attempt_not_found",
        "Cancel attempt not found",
      );
    }

    const attempt = await repository.getSaveOfferAttempt({
      organizationId: auth.actor.organizationId,
      attemptId,
    });

    if (!attempt) {
      throw new HttpError(
        404,
        "cancel_attempt_not_found",
        "Cancel attempt not found",
      );
    }

    // Idempotency: a save offer (e.g. "20% off one invoice") must be redeemable
    // at most once per attempt. Without this guard, re-POSTing accept re-applies
    // the coupon to the live subscription each call — for a once-duration coupon
    // that re-grants the discount on the next invoice, a repeatable revenue leak.
    if (attempt.offer_accepted === true) {
      throw new HttpError(
        409,
        "save_offer_already_accepted",
        "Save offer already accepted",
      );
    }

    const couponId = resolveSaveOfferCoupon(c.env, attempt.offer_shown);
    const subscription = await getStripeBackedSubscriptionOrThrow(
      repository,
      auth.actor.organizationId,
      "No active subscription found",
    );

    await stripeApplySubscriptionCoupon(
      c.env,
      subscription.stripe_subscription_id,
      couponId,
      `save-offer-accept:${auth.actor.organizationId}:${attemptId}:${subscription.stripe_subscription_id}`,
    );
    await repository.markSaveOfferAccepted({
      organizationId: auth.actor.organizationId,
      attemptId,
      couponId,
    });

    return c.json(
      await updateSubscriptionOrThrow(
        await repository.getSubscription(auth.actor.organizationId),
      ),
    );
  });

  app.post("/billing/save-offer/:attemptId/decline", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    await markCancelAttemptDeclinedBestEffort(
      resolveRepository(c.env, dependencies),
      {
        organizationId: auth.actor.organizationId,
        attemptId: c.req.param("attemptId"),
      },
    );

    return c.body(null, 204);
  });

  app.post("/billing/subscription/cancel", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const payload = cancelSubscriptionSchema.parse(await parseJsonBody(c));
    const repository = resolveRepository(c.env, dependencies);

    if (payload.attempt_id) {
      await markCancelAttemptDeclinedBestEffort(repository, {
        organizationId: auth.actor.organizationId,
        attemptId: payload.attempt_id,
      });
    }

    const subscription = await getStripeBackedSubscriptionOrThrow(
      repository,
      auth.actor.organizationId,
      "No active subscription found",
    );

    if (payload.immediate) {
      await stripeDeleteSubscription(
        c.env,
        subscription.stripe_subscription_id,
      );
      return c.json(
        await updateSubscriptionOrThrow(
          await repository.cancelSubscriptionImmediately(
            auth.actor.organizationId,
            now(dependencies).toISOString(),
          ),
        ),
      );
    }

    await stripeModifySubscription(c.env, subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    return c.json(
      await updateSubscriptionOrThrow(
        await repository.scheduleSubscriptionCancel(
          auth.actor.organizationId,
          now(dependencies).toISOString(),
        ),
      ),
    );
  });

  app.post("/billing/subscription/resume", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const repository = resolveRepository(c.env, dependencies);
    const subscription = await getStripeBackedSubscriptionOrThrow(
      repository,
      auth.actor.organizationId,
      "No subscription found",
    );

    if (subscription.status === "paused") {
      const resumed = await stripeResumePausedSubscriptionOrThrow(
        c.env,
        subscription.stripe_subscription_id,
      );
      return c.json(
        await updateSubscriptionOrThrow(
          await repository.resumePausedSubscription(auth.actor.organizationId, {
            status: resumed.status,
            cancel_at_period_end: resumed.cancel_at_period_end === true,
            current_period_start: unixSecondsToIso(
              resumed.current_period_start,
            ),
            current_period_end: unixSecondsToIso(resumed.current_period_end),
            updated_at: now(dependencies).toISOString(),
          }),
        ),
      );
    }

    if (!subscription.cancel_at_period_end) {
      throw new HttpError(
        400,
        "subscription_not_paused_or_canceling",
        "Subscription is not paused or scheduled for cancellation",
      );
    }

    await stripeModifySubscription(c.env, subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
    return c.json(
      await updateSubscriptionOrThrow(
        await repository.resumeScheduledSubscription(
          auth.actor.organizationId,
          now(dependencies).toISOString(),
        ),
      ),
    );
  });

  app.post("/billing/subscription/upgrade", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    planChangeSchema.parse(await parseJsonBody(c));

    throw new HttpError(
      400,
      "plan_change_disabled",
      "Plan changes are no longer supported. Reconcile is the only active subscription; use checkout to update rentable unit count.",
    );
  });

  app.post("/billing/subscription/downgrade", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    planChangeSchema.parse(await parseJsonBody(c));

    throw new HttpError(
      400,
      "plan_change_disabled",
      "Plan changes are no longer supported. Reconcile is the only active subscription; use checkout to update rentable unit count.",
    );
  });

  app.post("/billing/subscribe", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const payload = subscribeSchema.parse(await parseJsonBody(c));
    const tier = payload.tier;

    validatePlanSelection({
      plan_id: tier,
      billing_period: "annual",
      unit_count: payload.unit_count,
      building_count: payload.building_count,
    });

    const annualTotalCents = getAnnualTotalCents(tier, payload.unit_count);

    if (annualTotalCents === null) {
      throw new HttpError(
        422,
        "annual_price_not_configured",
        `No annual price configured for tier: ${tier}`,
      );
    }

    const tierDetails = getTierDetails(tier);

    if (!tierDetails) {
      throw new HttpError(
        422,
        "annual_price_not_configured",
        `No annual price configured for tier: ${tier}`,
      );
    }

    const includedUnits = tierDetails.included_units;
    const unitOverageCount = Math.max(payload.unit_count - includedUnits, 0);

    const repository = resolveRepository(c.env, dependencies);

    const organization = await repository.getOrganizationBillingProfile(
      auth.actor.organizationId,
    );

    if (!organization) {
      throw new HttpError(
        404,
        "organization_not_found",
        "Organization not found",
      );
    }

    const checkoutState = await repository.getCheckoutBillingState(
      auth.actor.organizationId,
    );

    if (
      checkoutState?.stripe_subscription_id &&
      checkoutState.status !== "canceled"
    ) {
      throw new HttpError(
        409,
        "already_subscribed",
        "This organization already has an active subscription. Manage it from the billing portal.",
      );
    }

    const customerId =
      checkoutState?.stripe_customer_id ??
      (await createAndPersistStripeCustomer(c.env, repository, {
        organizationId: auth.actor.organizationId,
        userEmail: auth.user.email,
      }));

    await repository.saveCheckoutActivation(auth.actor.organizationId, {
      plan_id: tier,
      billing_period: "annual",
      unit_count: payload.unit_count,
      building_count: payload.building_count,
    });

    const trialDays = resolveTrialDays(checkoutState);

    const metadata: Record<string, string> = {
      billing_model: "subscription",
      organization_id: auth.actor.organizationId,
      tier,
      plan_id: tier,
      pricing_model: "per_unit",
      building_count: String(payload.building_count),
      unit_count: String(payload.unit_count),
      included_units: String(includedUnits),
      unit_overage_count: String(unitOverageCount),
      annual_total_cents: String(annualTotalCents),
    };

    const session = await stripeCreateCheckoutSession(c.env, {
      customerId,
      lineItems: buildReconcileCheckoutLineItems(c.env, {
        unitCount: payload.unit_count,
        annualTotalCents,
      }),
      successUrl: payload.success_url,
      cancelUrl: payload.cancel_url,
      metadata,
      trialDays,
      couponId: null,
    });

    if (!session.url) {
      throw new HttpError(
        500,
        "checkout_session_url_missing",
        "Failed to create checkout session",
      );
    }

    return c.json({
      checkout_url: session.url,
      tier,
      price_annual_cents: annualTotalCents,
      trial_days: trialDays,
    });
  });

  app.get("/billing/customer", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    const repository = resolveRepository(c.env, dependencies);
    const customer = await repository.getBillingCustomer(
      auth.actor.organizationId,
    );
    const customerId = customer?.stripe_customer_id;

    if (!customerId) {
      throw new HttpError(
        404,
        "billing_customer_not_found",
        "No billing customer found for this organization",
      );
    }

    return c.json(
      formatStripeCustomer(await stripeRetrieveCustomer(c.env, customerId)),
    );
  });

  app.post("/billing/customer", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const repository = resolveRepository(c.env, dependencies);
    const organization = await repository.getOrganizationBillingProfile(
      auth.actor.organizationId,
    );

    if (!organization) {
      throw new HttpError(
        404,
        "organization_not_found",
        "Organization not found",
      );
    }

    const existingCustomer = await repository.getBillingCustomer(
      auth.actor.organizationId,
    );
    const existingCustomerId = existingCustomer?.stripe_customer_id;

    if (existingCustomerId) {
      return c.json(
        formatStripeCustomer(
          await stripeRetrieveCustomer(c.env, existingCustomerId),
        ),
        201,
      );
    }

    await requireLocalSubscription(repository, auth.actor.organizationId);

    const customer = await stripeCreateCustomer(c.env, {
      email: organization.billing_email ?? auth.user.email,
      name: organization.name,
      metadata: {
        organization_id: auth.actor.organizationId,
        source: "capveri",
      },
    });

    await saveStripeCustomerIdOrFail(
      repository,
      auth.actor.organizationId,
      customer.id,
    );

    return c.json(formatStripeCustomer(customer), 201);
  });

  app.get("/billing/payment-methods", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    const customerId = await getStripeCustomerIdOrThrow(
      resolveRepository(c.env, dependencies),
      auth.actor.organizationId,
      "No billing customer found",
    );
    const [methods, customer] = await Promise.all([
      stripeListCardPaymentMethods(c.env, customerId),
      stripeRetrieveCustomer(c.env, customerId),
    ]);
    const defaultPaymentMethodId = readStripeDefaultPaymentMethodId(customer);

    return c.json(
      methods.data.flatMap((method) => {
        if (!method.card) {
          return [];
        }

        return [
          {
            id: method.id,
            brand: method.card.brand ?? "",
            last4: method.card.last4 ?? "",
            exp_month: method.card.exp_month ?? 0,
            exp_year: method.card.exp_year ?? 0,
            is_default: method.id === defaultPaymentMethodId,
          },
        ];
      }),
    );
  });

  app.post("/billing/payment-methods/setup", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const customerId = await getStripeCustomerIdOrThrow(
      resolveRepository(c.env, dependencies),
      auth.actor.organizationId,
      "No billing customer found",
    );
    const setupIntent = await stripeCreateSetupIntent(c.env, customerId);

    if (!setupIntent.client_secret) {
      throw new HttpError(
        400,
        "setup_intent_failed",
        "Failed to create setup intent",
      );
    }

    return c.json({ client_secret: setupIntent.client_secret });
  });

  app.post("/billing/payment-methods/:paymentMethodId/default", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const customerId = await getStripeCustomerIdOrThrow(
      resolveRepository(c.env, dependencies),
      auth.actor.organizationId,
      "No billing customer found",
    );
    const paymentMethodId = c.req.param("paymentMethodId");
    const paymentMethod = await stripeRetrievePaymentMethod(
      c.env,
      paymentMethodId,
    );

    ensureStripePaymentMethodBelongsToCustomer(paymentMethod, customerId);
    await stripeSetDefaultPaymentMethod(c.env, customerId, paymentMethodId);

    return c.json({ status: "success" });
  });

  app.delete("/billing/payment-methods/:paymentMethodId", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const customerId = await getStripeCustomerIdOrThrow(
      resolveRepository(c.env, dependencies),
      auth.actor.organizationId,
      "No billing customer found",
    );
    const paymentMethodId = c.req.param("paymentMethodId");
    const paymentMethod = await stripeRetrievePaymentMethod(
      c.env,
      paymentMethodId,
    );

    ensureStripePaymentMethodBelongsToCustomer(paymentMethod, customerId);

    const methods = await stripeListCardPaymentMethods(c.env, customerId);

    if (methods.data.filter((method) => method.card).length <= 1) {
      throw new HttpError(
        400,
        "only_payment_method",
        "Cannot remove the only payment method",
      );
    }

    await stripeDetachPaymentMethod(c.env, paymentMethodId);

    return c.json({ status: "success" });
  });

  app.post("/billing/checkout", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const payload = checkoutSchema.parse(await parseJsonBody(c));

    if (payload.offer_token && payload.launch_offer_code) {
      throw new HttpError(
        400,
        "mutually_exclusive_offer",
        "Choose either a limited offer code or winback offer token, not both",
      );
    }

    let couponId = resolveLaunchOfferCoupon(
      c.env,
      payload.launch_offer_code,
      now(dependencies),
    );

    validatePlanSelection(payload);

    const repository = resolveRepository(c.env, dependencies);
    const checkoutState = await repository.getCheckoutBillingState(
      auth.actor.organizationId,
    );

    if (
      checkoutState?.status === "paused" &&
      checkoutState.stripe_subscription_id
    ) {
      throw new HttpError(
        409,
        "paused_stripe_subscription",
        PAUSED_STRIPE_SUBSCRIPTION_MESSAGE,
      );
    }

    // A live Stripe subscription already exists for this org. A new Checkout
    // Session (subscription mode) always creates a SECOND Stripe subscription;
    // on completion `upsertSubscription`'s `on conflict (organization_id)`
    // overwrites the row's stripe_subscription_id with the new one — orphaning
    // the old sub, which keeps billing the customer with no in-app way to
    // cancel it (silent double-billing), and `resolveTrialDays` would even
    // re-grant a fresh trial. Plan changes are disabled (see upgrade/downgrade),
    // so changes/cancellation go through the Stripe billing portal, not a
    // re-checkout. `canceled` is allowed through so a lapsed org can resubscribe;
    // rows with a null stripe_subscription_id (local trial) are also allowed so
    // a trialing org can convert to paid.
    if (
      checkoutState?.stripe_subscription_id &&
      checkoutState.status !== "canceled"
    ) {
      throw new HttpError(
        409,
        "already_subscribed",
        "This organization already has an active subscription. Manage it from the billing portal.",
      );
    }

    const customerId =
      checkoutState?.stripe_customer_id ??
      (await createAndPersistStripeCustomer(c.env, repository, {
        organizationId: auth.actor.organizationId,
        userEmail: auth.user.email,
      }));

    await ensureCheckoutActivationMatches(
      repository,
      auth.actor.organizationId,
      {
        plan_id: payload.plan_id,
        billing_period: payload.billing_period,
        unit_count: payload.unit_count,
        building_count: payload.building_count,
      },
    );

    const tier = getTierDetails(payload.plan_id);
    const annualTotalCents = getAnnualTotalCents(
      payload.plan_id,
      payload.unit_count,
    );

    if (!tier || annualTotalCents === null) {
      throw new HttpError(
        422,
        "annual_price_not_configured",
        `No annual price configured for tier: ${payload.plan_id}`,
      );
    }

    const includedUnits = tier.included_units;
    const unitOverageCount = Math.max(payload.unit_count - includedUnits, 0);
    const metadata = {
      organization_id: auth.actor.organizationId,
      plan_id: payload.plan_id,
      pricing_model: "per_unit",
      building_count: String(payload.building_count),
      unit_count: String(payload.unit_count),
      included_units: String(includedUnits),
      unit_overage_count: String(unitOverageCount),
      annual_total_cents: String(annualTotalCents),
    };
    const extraMetadata: Record<string, string> = {};

    if (payload.offer_token) {
      const offer = await resolveCouponAndTierFromOfferToken(
        c.env,
        repository,
        payload.offer_token,
        auth.actor.organizationId,
      );
      couponId = offer.couponId;
      extraMetadata.offer_tier = offer.offerTier;
    }

    const session = await stripeCreateCheckoutSession(c.env, {
      customerId,
      lineItems: buildReconcileCheckoutLineItems(c.env, {
        unitCount: payload.unit_count,
        annualTotalCents,
      }),
      successUrl: payload.success_url,
      cancelUrl: payload.cancel_url,
      metadata: { ...metadata, ...extraMetadata },
      trialDays: resolveTrialDays(checkoutState),
      couponId,
    });

    if (!session.url) {
      throw new HttpError(
        500,
        "checkout_session_url_missing",
        "Failed to create checkout session",
      );
    }

    return c.json({ checkout_url: session.url, session_id: session.id });
  });

  app.get("/billing/checkout/success", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);

    const sessionId = c.req.query("session_id");

    if (!sessionId) {
      throw new HttpError(422, "validation_error", "session_id: Required");
    }

    const session = await stripeRetrieveCheckoutSession(c.env, sessionId);

    if (session.metadata?.organization_id !== auth.actor.organizationId) {
      throw new HttpError(
        403,
        "checkout_session_org_mismatch",
        "Session does not belong to this organization",
      );
    }

    return c.json({
      status: "success",
      subscription_id: session.subscription ?? "",
      customer_id: session.customer ?? "",
    });
  });

  app.post("/billing/portal", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);

    const returnUrl = c.req.query("return_url");

    if (!returnUrl) {
      throw new HttpError(422, "validation_error", "return_url: Required");
    }

    const customer = await resolveRepository(
      c.env,
      dependencies,
    ).getBillingCustomer(auth.actor.organizationId);
    const customerId = customer?.stripe_customer_id;

    if (!customerId) {
      throw new HttpError(
        404,
        "billing_customer_not_found",
        "No billing customer found",
      );
    }

    const session = await stripeCreatePortalSession(c.env, {
      customerId,
      returnUrl,
    });

    if (!session.url) {
      throw new HttpError(
        500,
        "portal_session_url_missing",
        "Failed to create billing portal session",
      );
    }

    return c.json({ url: session.url });
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: BillingRouteDependencies,
): BillingRepository {
  return (
    dependencies.repository ??
    new PostgresBillingRepository(createDirectPostgresExecutor(env))
  );
}

async function startTrialOrThrow(
  env: AppEnv,
  dependencies: BillingRouteDependencies,
  organizationId: string,
  input: {
    plan_id: string;
    billing_period: "annual";
    unit_count: number;
    building_count: number;
  },
) {
  const tier = getTierDetails(input.plan_id);
  if (!tier) {
    throw new HttpError(
      400,
      "invalid_plan",
      `Invalid plan: ${input.plan_id}. Valid plans: reconcile`,
    );
  }
  const startedAt = now(dependencies);

  try {
    return await resolveRepository(env, dependencies).startTrial(
      organizationId,
      {
        ...input,
        startedAt: startedAt.toISOString(),
        periodEnd: new Date(
          startedAt.getTime() + TRIAL_DAYS * 86_400_000,
        ).toISOString(),
        includedUnits: tier.included_units,
      },
    );
  } catch (error) {
    if (error instanceof BillingTrialPausedError) {
      throw new HttpError(409, "paused_trial", error.message);
    }
    throw error;
  }
}

function now(dependencies: BillingRouteDependencies): Date {
  return (dependencies.clock ?? (() => new Date()))();
}

function fallbackLaunchPhase(): ActiveLaunchPhase {
  const phase = LAUNCH_OFFER.phases[0];

  return {
    code: phase.code,
    label: phase.label,
    discount_percent: phase.discount_percent,
    times_redeemed: 0,
    max_redemptions: phase.max_redemptions,
    phase_index: phase.phase_index,
    all_exhausted: false,
    ends_at: LAUNCH_OFFER.ends_at,
    ends_at_display: LAUNCH_OFFER.ends_at_display,
  };
}

function expiredLaunchPhase(timesRedeemed = 0): ActiveLaunchPhase {
  const phase = LAUNCH_OFFER.phases[0];

  return {
    code: null,
    label: null,
    discount_percent: null,
    times_redeemed: timesRedeemed,
    max_redemptions: phase.max_redemptions,
    phase_index: phase.phase_index,
    all_exhausted: true,
    ends_at: LAUNCH_OFFER.ends_at,
    ends_at_display: LAUNCH_OFFER.ends_at_display,
  };
}

function isPastDeadline(now: Date): boolean {
  return now.getTime() >= new Date(LAUNCH_OFFER.ends_at).getTime();
}

async function getActiveLaunchPhase(
  env: AppEnv,
  now: Date,
): Promise<ActiveLaunchPhase> {
  if (isPastDeadline(now)) {
    return expiredLaunchPhase();
  }

  const fallback = fallbackLaunchPhase();
  const secretKey = env.STRIPE_SECRET_KEY;
  const couponId = env.STRIPE_80OFF_COUPON_ID ?? LAUNCH_OFFER.code;

  if (!secretKey || !couponId) {
    return fallback;
  }

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/coupons/${encodeURIComponent(couponId)}`,
      {
        headers: {
          authorization: `Bearer ${secretKey}`,
        },
      },
    );

    if (!response.ok) {
      return fallback;
    }

    const coupon = await response.json();
    const couponRecord = isRecord(coupon) ? coupon : {};
    const timesRedeemed = toNumber(couponRecord.times_redeemed, 0);
    const maxRedemptions = toNumber(
      couponRecord.max_redemptions,
      LAUNCH_OFFER.max_redemptions,
    );
    if (timesRedeemed >= maxRedemptions) {
      return {
        ...expiredLaunchPhase(timesRedeemed),
        max_redemptions: maxRedemptions,
      };
    }

    return {
      ...fallback,
      times_redeemed: timesRedeemed,
      max_redemptions: maxRedemptions,
    };
  } catch {
    return fallback;
  }
}

function validatePlanSelection(
  payload: z.infer<typeof planSelectionSchema>,
): void {
  if (payload.plan_id !== "reconcile") {
    throw new HttpError(
      400,
      "invalid_plan",
      `Invalid plan: ${payload.plan_id}. Valid plans: reconcile`,
    );
  }

  const tier = getTierDetails(payload.plan_id);
  if (tier && tier.max_units !== null && payload.unit_count > tier.max_units) {
    throw new HttpError(
      400,
      "plan_unit_limit_exceeded",
      `Plan ${payload.plan_id} supports up to ${tier.max_units} rentable units`,
    );
  }
}

function validateLaunchOfferCode(
  code: string | null | undefined,
  now: Date,
): void {
  if (code === null || code === undefined) {
    return;
  }

  if (code !== LAUNCH_OFFER.code) {
    throw new HttpError(
      400,
      "invalid_offer_code",
      "Invalid limited offer code",
    );
  }

  if (isPastDeadline(now)) {
    throw new HttpError(400, "offer_expired", "This limited offer has ended");
  }
}

function resolveLaunchOfferCoupon(
  env: AppEnv,
  code: string | null | undefined,
  now: Date,
): string | null {
  validateLaunchOfferCode(code, now);

  if (code === null || code === undefined) {
    return null;
  }

  const couponId = env.STRIPE_80OFF_COUPON_ID;

  if (!couponId) {
    throw new HttpError(
      500,
      "limited_offer_coupon_not_configured",
      "Limited offer coupon is not configured",
    );
  }

  return couponId;
}

function saveOfferTypeForReason(reason: CancelReason): SaveOfferType {
  if (reason === "missing_feature") {
    return "feature_roadmap";
  }

  if (reason === "business_closed") {
    return "none";
  }

  return "discount_20pct_1inv";
}

function resolveSaveOfferCoupon(env: AppEnv, offerType: SaveOfferType): string {
  if (offerType !== "discount_20pct_1inv") {
    throw new HttpError(
      400,
      "save_offer_not_discount",
      `Offer type ${offerType} does not support coupons`,
    );
  }

  const couponId = env.STRIPE_SAVE_OFFER_COUPON_ID_ANNUAL;

  if (!couponId) {
    throw new HttpError(
      500,
      "save_offer_coupon_not_configured",
      "Save offer coupon is not configured",
    );
  }

  return couponId;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function requireLandlord(actor: AuthVariables["auth"]["actor"]): void {
  if (actor.party === "landlord" && actor.role !== "tenant") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireOwner(actor: AuthVariables["auth"]["actor"]): void {
  requireLandlord(actor);

  if (actor.role === "owner") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function getGuaranteeEligibility(
  repository: BillingRepository,
  organizationId: string,
  referenceDate: Date,
) {
  const firstInvoice =
    await repository.getFirstPaidInvoiceForGuarantee(organizationId);

  if (!firstInvoice?.paid_at) {
    return {
      eligible: false,
      days_remaining: 0,
      first_invoice_amount: null,
      first_invoice_currency: "usd",
    };
  }

  const paidAt = new Date(firstInvoice.paid_at);

  if (Number.isNaN(paidAt.getTime())) {
    return {
      eligible: false,
      days_remaining: 0,
      first_invoice_amount: null,
      first_invoice_currency: "usd",
    };
  }

  const daysSince = Math.floor(
    (referenceDate.getTime() - paidAt.getTime()) / 86_400_000,
  );

  if (daysSince < 0 || daysSince >= GUARANTEE_WINDOW_DAYS) {
    return {
      eligible: false,
      days_remaining: 0,
      first_invoice_amount: null,
      first_invoice_currency: "usd",
    };
  }

  const subscription = await repository.getSubscription(organizationId);

  if (subscription?.money_back_claimed_at) {
    return {
      eligible: false,
      days_remaining: 0,
      first_invoice_amount: null,
      first_invoice_currency: "usd",
    };
  }

  return {
    eligible: true,
    days_remaining: GUARANTEE_WINDOW_DAYS - daysSince,
    first_invoice_amount: firstInvoice.amount_paid,
    first_invoice_currency: firstInvoice.currency || "usd",
  };
}

function readStripePaymentIntentId(invoice: StripeInvoice): string | null {
  if (typeof invoice.payment_intent === "string") {
    return invoice.payment_intent;
  }

  return invoice.payment_intent?.id ?? null;
}

function formatStripeCustomer(customer: StripeCustomer) {
  return {
    id: customer.id,
    email: customer.email ?? "",
    name: customer.name ?? "",
    created: customer.created,
  };
}

function readStripeDefaultPaymentMethodId(customer: StripeCustomer) {
  const defaultPaymentMethod =
    customer.invoice_settings?.default_payment_method ?? null;

  if (typeof defaultPaymentMethod === "string") {
    return defaultPaymentMethod;
  }

  return defaultPaymentMethod?.id ?? null;
}

function readStripePaymentMethodCustomerId(paymentMethod: StripePaymentMethod) {
  if (typeof paymentMethod.customer === "string") {
    return paymentMethod.customer;
  }

  return paymentMethod.customer?.id ?? null;
}

function ensureStripePaymentMethodBelongsToCustomer(
  paymentMethod: StripePaymentMethod,
  customerId: string,
): void {
  if (readStripePaymentMethodCustomerId(paymentMethod) === customerId) {
    return;
  }

  throw new HttpError(
    404,
    "payment_method_not_found",
    "Payment method not found for customer",
  );
}

async function getStripeCustomerIdOrThrow(
  repository: BillingRepository,
  organizationId: string,
  detail: string,
): Promise<string> {
  const customer = await repository.getBillingCustomer(organizationId);
  const customerId = customer?.stripe_customer_id;

  if (!customerId) {
    throw new HttpError(404, "billing_customer_not_found", detail);
  }

  return customerId;
}

async function createAndPersistStripeCustomer(
  env: AppEnv,
  repository: BillingRepository,
  input: { organizationId: string; userEmail: string },
): Promise<string> {
  await requireLocalSubscription(repository, input.organizationId);

  const organization = await repository.getOrganizationBillingProfile(
    input.organizationId,
  );

  if (!organization) {
    throw new HttpError(
      404,
      "organization_not_found",
      "Organization not found",
    );
  }

  const customer = await stripeCreateCustomer(env, {
    email: organization.billing_email ?? input.userEmail,
    name: organization.name,
    metadata: {
      organization_id: input.organizationId,
      source: "capveri",
    },
  });

  await saveStripeCustomerIdOrFail(
    repository,
    input.organizationId,
    customer.id,
  );

  return customer.id;
}

async function requireLocalSubscription(
  repository: BillingRepository,
  organizationId: string,
): Promise<void> {
  if (await repository.hasLocalSubscription(organizationId)) {
    return;
  }

  throw new HttpError(
    409,
    "subscription_row_not_found",
    "Cannot create Stripe customer without a local subscription",
  );
}

async function saveStripeCustomerIdOrFail(
  repository: BillingRepository,
  organizationId: string,
  customerId: string,
): Promise<void> {
  const persisted = await repository.saveStripeCustomerId(
    organizationId,
    customerId,
  );

  if (!persisted) {
    throw new HttpError(
      409,
      "subscription_row_not_found",
      "Cannot persist Stripe customer without a local subscription",
    );
  }
}

async function getStripeBackedSubscriptionOrThrow(
  repository: BillingRepository,
  organizationId: string,
  detail: string,
) {
  const subscription = await repository.getSubscription(organizationId);

  if (!subscription || !subscription.stripe_subscription_id) {
    throw new HttpError(400, "subscription_not_found", detail);
  }

  return {
    ...subscription,
    stripe_subscription_id: subscription.stripe_subscription_id,
  };
}

async function updateSubscriptionOrThrow<Result>(
  subscription: Result | null,
): Promise<Result> {
  if (!subscription) {
    throw new HttpError(
      409,
      "subscription_update_failed",
      "Failed to retrieve updated subscription",
    );
  }

  return subscription;
}

async function markCancelAttemptDeclinedBestEffort(
  repository: BillingRepository,
  input: { organizationId: string; attemptId: string },
): Promise<void> {
  try {
    await repository.markCancelAttemptDeclined(input);
  } catch {
    return;
  }
}

async function stripeResumePausedSubscriptionOrThrow(
  env: AppEnv,
  subscriptionId: string,
): Promise<StripeSubscription> {
  try {
    return await stripeResumeSubscription(env, subscriptionId);
  } catch (error) {
    if (error instanceof StripeHttpError && error.stripeStatus === 400) {
      throw new HttpError(
        400,
        "payment_method_required",
        "Add a valid payment method before resuming access",
      );
    }

    throw error;
  }
}

function unixSecondsToIso(value: number | undefined): string | null {
  if (!value) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

async function ensureCheckoutActivationMatches(
  repository: BillingRepository,
  organizationId: string,
  input: {
    plan_id: string;
    billing_period: "annual";
    unit_count: number;
    building_count: number;
  },
): Promise<void> {
  const activation = await repository.getBillingActivation(organizationId);
  const activationCheckoutRequired = activation?.checkout_required === true;

  if (activationCheckoutRequired) {
    const savedPayload = {
      plan_id: activation.plan_id,
      billing_period: activation.billing_period,
      unit_count: activation.unit_count,
      building_count: activation.building_count,
    };

    if (JSON.stringify(savedPayload) !== JSON.stringify(input)) {
      throw new HttpError(
        409,
        "saved_checkout_selection_mismatch",
        "Saved checkout selection does not match this request",
      );
    }

    return;
  }

  await repository.saveCheckoutActivation(organizationId, input);
}

function buildReconcileCheckoutLineItems(
  env: AppEnv,
  input: { unitCount: number; annualTotalCents: number },
): CheckoutLineItem[] {
  const baseAnnualCents = getAnnualTotalCents("reconcile", 1);
  const priceId = resolveConfiguredStripePriceId(
    env.STRIPE_PRICE_ID_RECONCILE_ANNUAL,
  );

  if (input.annualTotalCents === baseAnnualCents && priceId) {
    return [{ price: priceId, quantity: 1 }];
  }

  const priceData: StripePriceData = {
    currency: "usd",
    unit_amount: input.annualTotalCents,
    recurring: { interval: "year" },
  };

  if (env.STRIPE_PRODUCT_ID_RECONCILE) {
    priceData.product = env.STRIPE_PRODUCT_ID_RECONCILE;
  } else {
    priceData.product_data = {
      name: "CapVeri Reconcile",
      description: `Annual Reconcile subscription for ${input.unitCount} rentable units`,
    };
  }

  return [{ price_data: priceData, quantity: 1 }];
}

function resolveConfiguredStripePriceId(
  priceId: string | undefined,
): string | null {
  if (!priceId || priceId === "price_reconcile_annual") {
    return null;
  }

  return priceId;
}

async function resolveCouponAndTierFromOfferToken(
  env: AppEnv,
  repository: BillingRepository,
  offerToken: string,
  organizationId: string,
): Promise<{ couponId: string; offerTier: string }> {
  let offerTier: string;

  try {
    offerTier = await extractOfferTierFromToken(
      env,
      offerToken,
      organizationId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid token";
    throw new HttpError(
      400,
      "invalid_offer_token",
      `Invalid offer token: ${message}`,
    );
  }

  const couponEnvKey =
    WINBACK_OFFER_COUPONS[offerTier as keyof typeof WINBACK_OFFER_COUPONS];

  if (!couponEnvKey) {
    throw new HttpError(
      400,
      "invalid_offer_token",
      "Invalid offer token: invalid offer tier",
    );
  }

  const couponId = env[couponEnvKey];

  if (!couponId) {
    throw new HttpError(
      500,
      "winback_coupon_not_configured",
      "Winback offer coupon is not configured",
    );
  }

  if (await repository.hasRedeemedWinbackOffer(organizationId)) {
    throw new HttpError(
      409,
      "winback_offer_already_redeemed",
      "A winback offer has already been redeemed for this organization",
    );
  }

  return { couponId, offerTier };
}

async function extractOfferTierFromToken(
  env: AppEnv,
  offerToken: string,
  organizationId: string,
): Promise<string> {
  const [encodedPayload, signature] = offerToken.split(".", 2);

  if (!encodedPayload || !signature) {
    throw new Error("not enough values to unpack");
  }

  const payload = decodeBase64Url(encodedPayload);
  const expectedSignature = await hmacSha256Hex(
    requireRuntimeSecret(env, "CHECKOUT_OFFER_TOKEN_SECRET"),
    payload,
  );

  if (!constantTimeEqual(expectedSignature, signature)) {
    throw new Error("invalid signature");
  }

  const parts = payload.split(":");

  if (parts.length !== 3) {
    throw new Error("invalid payload");
  }

  const [tokenOrganizationId, offerTier, expiresAt] = parts;

  if (!tokenOrganizationId || !offerTier || !expiresAt) {
    throw new Error("invalid payload");
  }

  if (tokenOrganizationId !== organizationId) {
    throw new Error("organization mismatch");
  }

  const expiresAtUnix = Number(expiresAt);

  if (!Number.isInteger(expiresAtUnix)) {
    throw new Error("invalid expiry");
  }

  if (Date.now() / 1000 > expiresAtUnix) {
    throw new Error("token expired");
  }

  return offerTier;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
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

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

function resolveTrialDays(
  state: Awaited<ReturnType<BillingRepository["getCheckoutBillingState"]>>,
): number {
  if (
    state &&
    (state.status === "trialing" || state.status === "paused") &&
    !state.stripe_subscription_id
  ) {
    return remainingTrialDays(state.current_period_end);
  }

  return TRIAL_DAYS;
}

function remainingTrialDays(periodEnd: string | null): number {
  if (!periodEnd) {
    return 0;
  }

  const parsedPeriodEnd = new Date(periodEnd);

  if (Number.isNaN(parsedPeriodEnd.getTime())) {
    return 0;
  }

  const remainingMs = parsedPeriodEnd.getTime() - Date.now();

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(remainingMs / 86_400_000));
}

async function stripeRetrieveCustomer(
  env: AppEnv,
  customerId: string,
): Promise<StripeCustomer> {
  return stripeRequest(env, `/v1/customers/${encodeURIComponent(customerId)}`, {
    method: "GET",
  });
}

async function stripeCreateCustomer(
  env: AppEnv,
  input: {
    email: string;
    name: string;
    metadata: Record<string, string>;
  },
): Promise<StripeCustomer> {
  return stripeRequest(env, "/v1/customers", {
    method: "POST",
    body: stripeForm({
      email: input.email,
      name: input.name,
      metadata: input.metadata,
    }),
  });
}

async function stripeCreateCheckoutSession(
  env: AppEnv,
  input: {
    customerId: string;
    lineItems: CheckoutLineItem[];
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    trialDays: number;
    couponId: string | null;
  },
): Promise<StripeCheckoutSession> {
  const subscriptionData: Record<string, unknown> = {
    metadata: { ...input.metadata, app: APP_IDENTIFIER },
  };

  if (input.trialDays > 0) {
    subscriptionData.trial_period_days = input.trialDays;
    subscriptionData.trial_settings = {
      end_behavior: {
        missing_payment_method: "pause",
      },
    };
  }

  return stripeRequest(env, "/v1/checkout/sessions", {
    method: "POST",
    body: stripeForm({
      customer: input.customerId,
      payment_method_types: ["card"],
      payment_method_collection: "if_required",
      line_items: input.lineItems,
      mode: "subscription",
      success_url: `${input.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: input.cancelUrl,
      metadata: { ...input.metadata, app: APP_IDENTIFIER },
      subscription_data: subscriptionData,
      ...(input.couponId
        ? { discounts: [{ coupon: input.couponId }] }
        : { allow_promotion_codes: "true" }),
    }),
  });
}

async function stripeRetrieveCheckoutSession(
  env: AppEnv,
  sessionId: string,
): Promise<StripeCheckoutSession> {
  try {
    return await stripeRequest(
      env,
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { method: "GET" },
    );
  } catch (error) {
    if (
      error instanceof StripeHttpError &&
      (error.stripeStatus === 400 || error.stripeStatus === 404)
    ) {
      throw new HttpError(400, "invalid_session", "Invalid session");
    }

    throw error;
  }
}

async function stripeRetrieveInvoice(
  env: AppEnv,
  invoiceId: string,
): Promise<StripeInvoice> {
  return stripeRequest(env, `/v1/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "GET",
  });
}

async function stripeCreateRefund(
  env: AppEnv,
  paymentIntentId: string,
  idempotencyKey: string,
): Promise<StripeRefund> {
  return stripeRequest(env, "/v1/refunds", {
    method: "POST",
    idempotencyKey,
    body: stripeForm({
      payment_intent: paymentIntentId,
    }),
  });
}

async function stripeCreatePortalSession(
  env: AppEnv,
  input: { customerId: string; returnUrl: string },
): Promise<StripePortalSession> {
  return stripeRequest(env, "/v1/billing_portal/sessions", {
    method: "POST",
    body: stripeForm({
      customer: input.customerId,
      return_url: input.returnUrl,
    }),
  });
}

async function stripeListCardPaymentMethods(
  env: AppEnv,
  customerId: string,
): Promise<StripePaymentMethodList> {
  return stripeRequest(
    env,
    `/v1/payment_methods?customer=${encodeURIComponent(customerId)}&type=card`,
    { method: "GET" },
  );
}

async function stripeCreateSetupIntent(
  env: AppEnv,
  customerId: string,
): Promise<StripeSetupIntent> {
  return stripeRequest(env, "/v1/setup_intents", {
    method: "POST",
    body: stripeForm({
      customer: customerId,
      payment_method_types: ["card"],
    }),
  });
}

async function stripeRetrievePaymentMethod(
  env: AppEnv,
  paymentMethodId: string,
): Promise<StripePaymentMethod> {
  try {
    return await stripeRequest(
      env,
      `/v1/payment_methods/${encodeURIComponent(paymentMethodId)}`,
      { method: "GET" },
    );
  } catch (error) {
    if (
      error instanceof StripeHttpError &&
      (error.stripeStatus === 400 || error.stripeStatus === 404)
    ) {
      throw new HttpError(
        404,
        "payment_method_not_found",
        "Payment method not found for customer",
      );
    }

    throw error;
  }
}

async function stripeSetDefaultPaymentMethod(
  env: AppEnv,
  customerId: string,
  paymentMethodId: string,
): Promise<StripeCustomer> {
  return stripeRequest(env, `/v1/customers/${encodeURIComponent(customerId)}`, {
    method: "POST",
    body: stripeForm({
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    }),
  });
}

async function stripeDetachPaymentMethod(
  env: AppEnv,
  paymentMethodId: string,
): Promise<StripePaymentMethod> {
  return stripeRequest(
    env,
    `/v1/payment_methods/${encodeURIComponent(paymentMethodId)}/detach`,
    { method: "POST" },
  );
}

async function stripeModifySubscription(
  env: AppEnv,
  subscriptionId: string,
  input: { cancel_at_period_end: boolean },
): Promise<StripeSubscription> {
  return stripeRequest(
    env,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "POST",
      body: stripeForm({
        cancel_at_period_end: input.cancel_at_period_end,
        metadata: { app: APP_IDENTIFIER },
      }),
    },
  );
}

async function stripeDeleteSubscription(
  env: AppEnv,
  subscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest(
    env,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "DELETE" },
  );
}

async function stripeCancelSubscriptionWithoutProration(
  env: AppEnv,
  subscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest(
    env,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "DELETE",
      body: stripeForm({
        prorate: false,
        invoice_now: false,
      }),
    },
  );
}

async function stripeResumeSubscription(
  env: AppEnv,
  subscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest(
    env,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/resume`,
    {
      method: "POST",
      body: stripeForm({ billing_cycle_anchor: "now" }),
    },
  );
}

async function stripeApplySubscriptionCoupon(
  env: AppEnv,
  subscriptionId: string,
  couponId: string,
  idempotencyKey: string,
): Promise<StripeSubscription> {
  return stripeRequest(
    env,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "POST",
      idempotencyKey,
      body: stripeForm({
        coupon: couponId,
        metadata: { app: APP_IDENTIFIER },
      }),
    },
  );
}

class StripeHttpError extends HttpError {
  readonly stripeStatus: number;

  constructor(stripeStatus: number) {
    super(
      mapStripeStatus(stripeStatus),
      "stripe_request_failed",
      "Stripe request failed",
    );
    this.stripeStatus = stripeStatus;
  }
}

function mapStripeStatus(status: number): 400 | 502 | 503 {
  if (status === 400) {
    return 400;
  }

  if (status === 429 || status >= 500) {
    return 503;
  }

  return 502;
}

async function stripeRequest<Result>(
  env: AppEnv,
  path: string,
  init: {
    method: "DELETE" | "GET" | "POST";
    body?: URLSearchParams;
    idempotencyKey?: string;
  },
): Promise<Result> {
  const requestInit: RequestInit = {
    method: init.method,
    headers: {
      authorization: `Bearer ${requireRuntimeSecret(env, "STRIPE_SECRET_KEY")}`,
      "stripe-version": STRIPE_API_VERSION,
      ...(init.idempotencyKey
        ? { "idempotency-key": init.idempotencyKey }
        : {}),
      ...(init.body
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {}),
    },
  };

  if (init.body) {
    requestInit.body = init.body;
  }

  const response = await fetch(`${stripeApiBaseUrl(env)}${path}`, {
    ...requestInit,
  });

  if (!response.ok) {
    throw new StripeHttpError(response.status);
  }

  return (await response.json()) as Result;
}

function stripeApiBaseUrl(env: AppEnv): string {
  const configured = (env as { STRIPE_API_BASE_URL?: string })
    .STRIPE_API_BASE_URL;
  if (typeof configured !== "string" || configured.trim() === "") {
    return "https://api.stripe.com";
  }
  const environment = String(env.ENVIRONMENT ?? "");
  if (environment !== "development" && environment !== "test") {
    return "https://api.stripe.com";
  }
  const trimmed = configured.trim().replace(/\/+$/u, "");
  try {
    const url = new URL(trimmed);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      loopbackHosts.has(url.hostname)
    ) {
      return url.toString().replace(/\/$/u, "");
    }
  } catch {
    // Fall through to the production default on invalid local override.
  }
  return "https://api.stripe.com";
}

function stripeForm(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  appendStripeFormValue(params, "", input);

  return params;
}

function appendStripeFormValue(
  params: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendStripeFormValue(params, `${key}[${index}]`, item);
    });
    return;
  }

  if (isRecord(value)) {
    Object.entries(value).forEach(([childKey, childValue]) => {
      const nestedKey = key ? `${key}[${childKey}]` : childKey;
      appendStripeFormValue(params, nestedKey, childValue);
    });
    return;
  }

  params.append(key, String(value));
}
