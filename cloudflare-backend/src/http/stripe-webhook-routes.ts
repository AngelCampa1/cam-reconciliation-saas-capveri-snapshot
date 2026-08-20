import { Hono } from "hono";
import { PostHogServerAnalytics } from "../adapters/analytics/posthog";
import { PostgresCrmRepository } from "../adapters/db/crm";
import { PostgresStripeWebhookRepository } from "../adapters/db/stripe-webhooks";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  heading,
  paragraph,
  pillButton,
  renderEmailShell,
} from "../adapters/email/layout";
import { resendApiBaseUrl } from "../adapters/email/resend";
import type {
  InvoiceSnapshot,
  StripeWebhookRepository,
  SubscriptionSnapshot,
  SubscriptionUpdateSnapshot,
  TrialEmailType,
} from "../domain/billing/webhook-repository";
import type {
  CrmLifecycleStage,
  CrmRepository,
} from "../domain/crm/repository";
import { buildUnsubscribeToken } from "../domain/leads/tokens";
import type { AppEnv } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { requireRuntimeSecret } from "../platform/cloudflare";
import { captureWorkerException } from "../platform/sentry";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type StripeWebhookRouteDependencies = {
  repository?: StripeWebhookRepository;
  emailSender?: TrialEmailSender;
  analytics?: BillingAnalytics;
  crm?: CrmRepository;
  now?: () => Date;
};

type JsonRecord = Record<string, unknown>;
type TrialEmailInput = {
  repository: StripeWebhookRepository;
  emailSender: TrialEmailSender;
  crm: CrmRepository;
  env: AppEnv;
  sub: JsonRecord;
  organizationId?: string;
  emailType: TrialEmailType;
};
type TrialEmailPayload = {
  emailType: TrialEmailType;
  toEmail: string;
  organizationName: string;
  trialStart: Date;
  chargeDate: Date;
  chargeAmountFormatted: string;
  billingUrl: string;
  unsubscribeUrl?: string;
};
type TrialEmailSender = {
  send(
    env: AppEnv,
    input: TrialEmailPayload,
  ): Promise<{ providerMessageId: string }>;
};
type BillingAnalytics = {
  capture(
    env: AppEnv,
    eventName: string,
    organizationId: string,
    properties: JsonRecord,
  ): Promise<void>;
};

type StripeWebhookEvent = {
  id: string;
  type: string;
  // Unix seconds when Stripe created the event. Used as an ordering
  // high-water mark so redelivered/out-of-order events cannot clobber a
  // newer subscription state. Null when the payload omits a numeric value.
  created: number | null;
  data: {
    object: JsonRecord;
    previous_attributes?: JsonRecord;
  };
};

const APP_IDENTIFIER = "capveri";
const SIGNATURE_TOLERANCE_SECONDS = 300;
const NON_FILTERABLE_EVENT_TYPES = new Set([
  "invoice.created",
  "invoice.paid",
  "invoice.payment_failed",
]);
const CHECKOUT_PLAN_TO_SUBSCRIPTION_PLAN: Record<string, string> = {
  reconcile: "growth_v2",
  control: "growth_v2",
  defend: "growth_v2",
  growth: "growth_v2",
  enterprise: "enterprise",
};

class PreserveWebhookClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreserveWebhookClaimError";
  }
}

export function createStripeWebhookRoutes(
  dependencies: StripeWebhookRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.post("/webhooks/stripe", async (c) => {
    const rawBody = await c.req.text();
    const event = await verifyAndParseStripeEvent({
      rawBody,
      signatureHeader: c.req.header("stripe-signature") ?? null,
      secret: requireRuntimeSecret(c.env, "STRIPE_WEBHOOK_SECRET"),
      now: dependencies.now ?? (() => new Date()),
    });
    const repository = resolveRepository(c.env, dependencies);
    const claim = await repository.claimWebhookEvent(event.id, event.type);

    if (!claim) {
      return c.json({ received: true });
    }

    try {
      await dispatchStripeEvent({
        event,
        repository,
        env: c.env,
        emailSender: dependencies.emailSender ?? new ResendTrialEmailSender(),
        analytics: dependencies.analytics ?? new PostHogBillingAnalytics(),
        crm: dependencies.crm ?? resolveCrm(c.env),
      });
    } catch (error) {
      if (!(error instanceof PreserveWebhookClaimError)) {
        await repository.releaseWebhookEvent(event.id);
      }
      throw error;
    }

    try {
      await repository.completeWebhookEvent(event.id);
    } catch (error) {
      // Keep the claim when completion marking fails so Stripe retries do not
      // replay already-applied billing side effects.
      await captureWorkerException(c.env, error, {
        operation: "worker.stripe_webhook.complete_event",
        method: "POST",
        path: "/webhooks/stripe",
      });
    }

    return c.json({ received: true });
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: StripeWebhookRouteDependencies,
): StripeWebhookRepository {
  return (
    dependencies.repository ??
    new PostgresStripeWebhookRepository(createDirectPostgresExecutor(env))
  );
}

function resolveCrm(env: AppEnv): CrmRepository {
  return new PostgresCrmRepository(createDirectPostgresExecutor(env));
}

async function verifyAndParseStripeEvent(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  now: () => Date;
}): Promise<StripeWebhookEvent> {
  const parsedSignature = parseStripeSignature(input.signatureHeader);
  const currentTimestamp = Math.floor(input.now().getTime() / 1000);

  if (
    Math.abs(currentTimestamp - parsedSignature.timestamp) >
    SIGNATURE_TOLERANCE_SECONDS
  ) {
    throw new HttpError(400, "stale_signature", "Stripe signature is stale");
  }

  const expectedSignature = await hmacSha256Hex(
    input.secret,
    `${parsedSignature.timestamp}.${input.rawBody}`,
  );

  if (
    !parsedSignature.signatures.some((signature) =>
      constantTimeEqualHex(expectedSignature, signature),
    )
  ) {
    throw new HttpError(400, "invalid_signature", "Invalid Stripe signature");
  }

  let payload: unknown;

  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }

  return parseStripeWebhookEvent(payload);
}

function parseStripeSignature(signatureHeader: string | null): {
  timestamp: number;
  signatures: string[];
} {
  if (!signatureHeader) {
    throw new HttpError(
      400,
      "missing_signature",
      "Missing stripe-signature header",
    );
  }

  const parts = signatureHeader.split(",");
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    const trimmedKey = key?.trim();
    const trimmedValue = value?.trim();

    if (trimmedKey === "t" && trimmedValue) {
      const parsed = Number(trimmedValue);
      if (Number.isInteger(parsed)) {
        timestamp = parsed;
      }
    }

    if (trimmedKey === "v1" && trimmedValue) {
      signatures.push(trimmedValue);
    }
  }

  if (timestamp === null || signatures.length === 0) {
    throw new HttpError(
      400,
      "malformed_signature",
      "Malformed Stripe signature header",
    );
  }

  return { timestamp, signatures };
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

function constantTimeEqualHex(left: string, right: string): boolean {
  if (!isHex(left) || !isHex(right) || left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

function isHex(value: string): boolean {
  return /^[0-9a-f]+$/iu.test(value);
}

function parseStripeWebhookEvent(payload: unknown): StripeWebhookEvent {
  if (!isRecord(payload)) {
    throw new HttpError(400, "invalid_json", "Stripe event must be an object");
  }

  const data = payload.data;

  if (
    typeof payload.id !== "string" ||
    typeof payload.type !== "string" ||
    !isRecord(data) ||
    !isRecord(data.object)
  ) {
    throw new HttpError(400, "invalid_json", "Invalid Stripe event payload");
  }

  const event: StripeWebhookEvent = {
    id: payload.id,
    type: payload.type,
    created:
      typeof payload.created === "number" && Number.isFinite(payload.created)
        ? payload.created
        : null,
    data: {
      object: data.object,
    },
  };

  if (isRecord(data.previous_attributes)) {
    event.data.previous_attributes = data.previous_attributes;
  }

  return event;
}

async function dispatchStripeEvent(input: {
  event: StripeWebhookEvent;
  repository: StripeWebhookRepository;
  env: AppEnv;
  emailSender: TrialEmailSender;
  crm: CrmRepository;
  analytics: BillingAnalytics;
}): Promise<void> {
  const object = {
    ...input.event.data.object,
    __event_id: input.event.id,
    __event_created: input.event.created,
    __previous_attributes: input.event.data.previous_attributes ?? {},
  };

  if (!NON_FILTERABLE_EVENT_TYPES.has(input.event.type)) {
    const app = readMetadata(object).app;
    if (app && app !== APP_IDENTIFIER) {
      return;
    }
  }

  switch (input.event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(
        object,
        input.repository,
        input.emailSender,
        input.crm,
        input.analytics,
        input.env,
      );
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        object,
        input.repository,
        input.emailSender,
        input.crm,
        input.analytics,
        input.env,
      );
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        object,
        input.repository,
        input.analytics,
        input.env,
      );
      break;
    case "customer.subscription.trial_will_end":
      await handleSubscriptionTrialWillEnd(
        object,
        input.repository,
        input.emailSender,
        input.crm,
        input.env,
      );
      break;
    case "invoice.created":
      await handleInvoiceCreated(object, input.repository);
      break;
    case "invoice.paid":
      await handleInvoicePaid(
        object,
        input.repository,
        input.analytics,
        input.env,
      );
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(
        object,
        input.repository,
        input.analytics,
        input.env,
      );
      break;
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(object, input.repository);
      break;
  }
}

async function handleSubscriptionCreated(
  sub: JsonRecord,
  repository: StripeWebhookRepository,
  emailSender: TrialEmailSender,
  crm: CrmRepository,
  analytics: BillingAnalytics,
  env: AppEnv,
): Promise<void> {
  const organizationId = await resolveOrganizationId(sub, repository);

  if (!organizationId) {
    return;
  }

  const snapshot = subscriptionSnapshot(sub, organizationId);
  await repository.upsertSubscription(snapshot);
  await repository.markCheckoutComplete(organizationId);
  await analytics.capture(env, "subscription_started", organizationId, {
    stripe_subscription_id: snapshot.stripeSubscriptionId,
    stripe_customer_id: snapshot.stripeCustomerId,
    plan: snapshot.plan,
    tier: snapshot.tier,
    subscription_status: snapshot.status,
    pricing_model: snapshot.pricingModel,
    building_count: snapshot.buildingCount,
    unit_count: snapshot.unitCount,
    included_units: snapshot.includedUnits,
    unit_overage_count: snapshot.unitOverageCount,
    cancel_at_period_end: snapshot.cancelAtPeriodEnd,
  });

  if (snapshot.status === "trialing") {
    await claimAndSendTrialEmail({
      repository,
      emailSender,
      crm,
      env,
      sub,
      organizationId,
      emailType: "trial_started",
    });
    await analytics.capture(env, "trial_started", organizationId, {
      ...subscriptionAnalyticsProperties(snapshot),
      trial_start: trialStartDate(sub).toISOString(),
      trial_end: trialChargeDate(sub).toISOString(),
    });
  }
}

async function handleSubscriptionUpdated(
  sub: JsonRecord,
  repository: StripeWebhookRepository,
  emailSender: TrialEmailSender,
  crm: CrmRepository,
  analytics: BillingAnalytics,
  env: AppEnv,
): Promise<void> {
  const stripeSubscriptionId = readString(sub.id);

  if (!stripeSubscriptionId) {
    return;
  }

  const organizationId = await resolveOrganizationId(sub, repository);
  const snapshot = subscriptionUpdateSnapshot(sub);
  await repository.updateSubscriptionByStripeId(stripeSubscriptionId, snapshot);

  if (organizationId) {
    await repository.markCheckoutComplete(organizationId);
    const previous = readRecord(sub.__previous_attributes);

    if (snapshot.cancelAtPeriodEnd && previous.cancel_at_period_end === false) {
      await analytics.capture(
        env,
        "subscription_cancel_scheduled",
        organizationId,
        subscriptionAnalyticsProperties(snapshot),
      );
    }

    if (!snapshot.cancelAtPeriodEnd && previous.cancel_at_period_end === true) {
      await analytics.capture(
        env,
        "subscription_reactivated",
        organizationId,
        subscriptionAnalyticsProperties(snapshot),
      );
    }
  }

  if (snapshot.status === "paused") {
    const emailInput: TrialEmailInput = {
      repository,
      emailSender,
      crm,
      env,
      sub,
      emailType: "trial_paused",
    };

    if (organizationId) {
      emailInput.organizationId = organizationId;
    }

    await claimAndSendTrialEmail(emailInput);
  }
}

async function handleSubscriptionDeleted(
  sub: JsonRecord,
  repository: StripeWebhookRepository,
  analytics: BillingAnalytics,
  env: AppEnv,
): Promise<void> {
  const stripeSubscriptionId = readString(sub.id);

  if (!stripeSubscriptionId) {
    return;
  }

  await repository.markSubscriptionCanceled(
    stripeSubscriptionId,
    readEventTs(sub),
  );
  const organizationId = await resolveOrganizationId(sub, repository);

  if (organizationId) {
    await analytics.capture(env, "subscription_cancelled", organizationId, {
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: readString(sub.customer),
      subscription_status: "canceled",
      cancel_at_period_end: sub.cancel_at_period_end === true,
    });
  }
}

async function handleSubscriptionTrialWillEnd(
  sub: JsonRecord,
  repository: StripeWebhookRepository,
  emailSender: TrialEmailSender,
  crm: CrmRepository,
  env: AppEnv,
): Promise<void> {
  const organizationId = await resolveOrganizationId(sub, repository);
  const emailInput: TrialEmailInput = {
    repository,
    emailSender,
    crm,
    env,
    sub,
    emailType: "trial_ending_soon",
  };

  if (organizationId) {
    emailInput.organizationId = organizationId;
  }

  await claimAndSendTrialEmail(emailInput);
}

async function handleInvoiceCreated(
  invoice: JsonRecord,
  repository: StripeWebhookRepository,
): Promise<boolean> {
  const snapshot = await invoiceSnapshot(invoice, repository);

  if (!snapshot) {
    return false;
  }

  await repository.upsertInvoice(snapshot);
  return true;
}

async function handleInvoicePaid(
  invoice: JsonRecord,
  repository: StripeWebhookRepository,
  analytics: BillingAnalytics,
  env: AppEnv,
): Promise<void> {
  const stripeInvoiceId = readString(invoice.id);

  if (!stripeInvoiceId) {
    return;
  }

  if (!(await repository.invoiceExists(stripeInvoiceId))) {
    await handleInvoiceCreated(invoice, repository);
  }

  await repository.markInvoicePaid({
    stripeInvoiceId,
    amountPaid: centsToDollars(readInteger(invoice.amount_paid, 0)),
    pdfUrl: readString(invoice.invoice_pdf),
    hostedInvoiceUrl: readString(invoice.hosted_invoice_url),
  });

  const organizationId = await resolveInvoiceOrganizationId(
    invoice,
    repository,
  );

  if (organizationId) {
    await analytics.capture(env, "invoice_paid", organizationId, {
      stripe_invoice_id: stripeInvoiceId,
      stripe_subscription_id: readString(invoice.subscription),
      stripe_customer_id: readString(invoice.customer),
      amount_paid_cents: readInteger(invoice.amount_paid, 0),
      currency: readString(invoice.currency) ?? "usd",
    });
  }
}

async function handleInvoicePaymentFailed(
  invoice: JsonRecord,
  repository: StripeWebhookRepository,
  analytics: BillingAnalytics,
  env: AppEnv,
): Promise<void> {
  const stripeInvoiceId = readString(invoice.id);

  if (!stripeInvoiceId) {
    return;
  }

  if (!(await repository.invoiceExists(stripeInvoiceId))) {
    await handleInvoiceCreated(invoice, repository);
  }

  await repository.markInvoiceOpen(stripeInvoiceId);
  const stripeSubscriptionId = readString(invoice.subscription);

  if (stripeSubscriptionId) {
    await repository.markSubscriptionPastDue(
      stripeSubscriptionId,
      readEventTs(invoice),
    );
  }

  const organizationId = await resolveInvoiceOrganizationId(
    invoice,
    repository,
  );

  if (organizationId) {
    await analytics.capture(env, "invoice_payment_failed", organizationId, {
      stripe_invoice_id: stripeInvoiceId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: readString(invoice.customer),
      amount_due_cents: readInteger(invoice.amount_due, 0),
      currency: readString(invoice.currency) ?? "usd",
    });
  }
}

async function handleCheckoutSessionCompleted(
  session: JsonRecord,
  repository: StripeWebhookRepository,
): Promise<void> {
  const metadata = readMetadata(session);

  if (readString(session.mode) === "payment") {
    const organizationId = metadata.organization_id;
    const quantity = metadata.quantity ? Number(metadata.quantity) : 0;
    const checkoutSessionId = readString(session.id);

    if (
      !organizationId ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !checkoutSessionId
    ) {
      return;
    }

    await repository.insertAuditCredits({
      organizationId,
      creditsPurchased: quantity,
      unitPriceCents: Math.floor(
        readInteger(session.amount_total, 0) / quantity,
      ),
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentIntentId: readString(session.payment_intent),
    });
    return;
  }

  if (metadata.organization_id && metadata.offer_tier) {
    await repository.redeemWinbackOffer({
      organizationId: metadata.organization_id,
      offerTier: metadata.offer_tier,
    });
  }
}

async function claimAndSendTrialEmail(input: TrialEmailInput): Promise<void> {
  const organizationId =
    input.organizationId ??
    (await resolveOrganizationId(input.sub, input.repository));
  const stripeSubscriptionId = readString(input.sub.id);

  if (!organizationId || !stripeSubscriptionId) {
    return;
  }

  const claim = await input.repository.claimTrialEmail({
    organizationId,
    stripeSubscriptionId,
    emailType: input.emailType,
    stripeEventId: readString(input.sub.__event_id),
  });

  if (!claim) {
    return;
  }

  let response: { providerMessageId: string };

  try {
    response = await input.emailSender.send(input.env, {
      emailType: input.emailType,
      toEmail: claim.recipient,
      organizationName: claim.organizationName,
      trialStart: trialStartDate(input.sub),
      chargeDate: trialChargeDate(input.sub),
      chargeAmountFormatted: trialChargeAmount(input.sub),
      billingUrl: `${(input.env.APP_BASE_URL ?? "https://app.capveri.com").replace(/\/+$/u, "")}/settings/billing`,
    });
  } catch (error) {
    await input.repository.releaseTrialEmail({
      stripeSubscriptionId,
      emailType: input.emailType,
    });
    throw error;
  }

  await input.repository
    .completeTrialEmail({
      stripeSubscriptionId,
      emailType: input.emailType,
      providerMessageId: response.providerMessageId,
    })
    .catch((error: unknown) => {
      throw new PreserveWebhookClaimError(
        error instanceof Error
          ? error.message
          : "Trial email completion failed after provider send",
      );
    });
  await input.crm
    .recordEvent({
      email: claim.recipient,
      eventName: input.emailType,
      eventSource: "stripe_webhook",
      lifecycleStage: crmStageForTrialEmail(input.emailType),
      nextStep: nextStepForTrialEmail(input.emailType),
      organizationId,
      occurredAt: new Date().toISOString(),
      metadata: {
        stripeSubscriptionId,
        providerMessageId: response.providerMessageId,
      },
    })
    .catch(async (error: unknown) => {
      await captureWorkerException(input.env, error, {
        operation: "worker.stripe_webhook.crm_trial_email_event",
        method: "POST",
        path: "/webhooks/stripe",
      });
    });
}

function crmStageForTrialEmail(emailType: TrialEmailType): CrmLifecycleStage {
  switch (emailType) {
    case "trial_started":
    case "trial_ending_soon":
      return "trial_active";
    case "trial_paused":
      return "trial_paused";
  }
}

function nextStepForTrialEmail(emailType: TrialEmailType): string {
  switch (emailType) {
    case "trial_started":
      return "add_billing_before_trial_end";
    case "trial_ending_soon":
      return "add_billing_now";
    case "trial_paused":
      return "add_billing_to_resume";
  }
}

class ResendTrialEmailSender implements TrialEmailSender {
  async send(
    env: AppEnv,
    input: TrialEmailPayload,
  ): Promise<{ providerMessageId: string }> {
    const unsubscribeUrl = await buildMarketingUnsubscribeUrl(
      env,
      input.toEmail,
    );
    const payload = { ...input, unsubscribeUrl };
    const response = await fetch(`${resendApiBaseUrl(env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireRuntimeSecret(env, "RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from:
          env.RESEND_FROM_ADDRESS ?? "Angel Campa <angel.campa@capveri.com>",
        to: input.toEmail,
        subject: trialEmailSubject(input.emailType),
        html: renderTrialEmail(env, payload),
        text: renderTrialEmailText(payload),
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
        },
      }),
    });

    return { providerMessageId: await readResendMessageId(response) };
  }
}

class PostHogBillingAnalytics implements BillingAnalytics {
  private readonly analytics = new PostHogServerAnalytics();

  async capture(
    env: AppEnv,
    eventName: string,
    organizationId: string,
    properties: JsonRecord,
  ): Promise<void> {
    await this.analytics.capture(env, {
      eventName,
      organizationId,
      properties,
    });
  }
}

async function readResendMessageId(response: Response): Promise<string> {
  if (!response.ok) {
    throw new Error("Resend email send failed");
  }

  const payload = await response.json();

  if (isRecord(payload) && typeof payload.id === "string") {
    return payload.id;
  }

  throw new Error("Resend response missing message id");
}

export function trialEmailSubject(emailType: TrialEmailType): string {
  switch (emailType) {
    case "trial_started":
      return "Your CapVeri free trial has started";
    case "trial_ending_soon":
      return "Your CapVeri free trial ends soon";
    case "trial_paused":
      return "Your CapVeri free trial has ended";
  }
}

export function renderTrialEmail(
  env: AppEnv,
  input: TrialEmailPayload,
): string {
  const actionLabel = "Add payment method";
  const title = trialEmailHeading(input.emailType);
  const body = trialEmailBody(input);

  return renderEmailShell({
    marketingBaseUrl: env.MARKETING_BASE_URL ?? "https://www.capveri.com",
    unsubscribeUrl: input.unsubscribeUrl ?? null,
    content: [
      heading(title),
      paragraph(`Hi ${input.organizationName},`),
      body,
      pillButton(input.billingUrl, actionLabel),
    ].join(""),
  });
}

function trialEmailHeading(emailType: TrialEmailType): string {
  switch (emailType) {
    case "trial_started":
      return "Your CapVeri free trial is live";
    case "trial_ending_soon":
      return "Your CapVeri free trial ends soon";
    case "trial_paused":
      return "Your CapVeri free trial has ended";
  }
}

function trialEmailBody(input: TrialEmailPayload): string {
  const start = formatEmailDate(input.trialStart);
  const charge = formatEmailDate(input.chargeDate);
  const amount = escapeHtml(input.chargeAmountFormatted);

  switch (input.emailType) {
    case "trial_started":
      return [
        `<p>Your 30-day free trial started on <strong>${start}</strong>.</p>`,
        `<p>Add a payment method before <strong>${charge}</strong> to keep access. Your plan: <strong>${amount}</strong>.</p>`,
      ].join("");
    case "trial_ending_soon":
      return [
        `<p>Your trial started on <strong>${start}</strong> and ends on <strong>${charge}</strong>.</p>`,
        `<p>Add a payment method before <strong>${charge}</strong> to keep access. Your plan: <strong>${amount}</strong>.</p>`,
      ].join("");
    case "trial_paused":
      return [
        `<p>Your 30-day free trial ended on <strong>${charge}</strong>. Your account is now on hold.</p>`,
        `<p>Add a payment method to turn it back on. Your plan: <strong>${amount}</strong>.</p>`,
      ].join("");
  }
}

export function renderTrialEmailText(input: TrialEmailPayload): string {
  const actionLabel = "Add payment method";
  return [
    trialEmailHeading(input.emailType),
    `Hi ${input.organizationName},`,
    ...trialEmailTextLines(input),
    `${actionLabel}: ${input.billingUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl ?? ""}`,
  ].join("\n");
}

function trialEmailTextLines(input: TrialEmailPayload): string[] {
  const start = formatEmailDate(input.trialStart);
  const charge = formatEmailDate(input.chargeDate);
  const amount = input.chargeAmountFormatted;

  switch (input.emailType) {
    case "trial_started":
      return [
        `Your 30-day free trial started on ${start}.`,
        `Add a payment method before ${charge} to keep access. Your plan: ${amount}.`,
      ];
    case "trial_ending_soon":
      return [
        `Your trial started on ${start} and ends on ${charge}.`,
        `Add a payment method before ${charge} to keep access. Your plan: ${amount}.`,
      ];
    case "trial_paused":
      return [
        `Your 30-day free trial ended on ${charge}. Your account is now on hold.`,
        `Add a payment method to turn it back on. Your plan: ${amount}.`,
      ];
  }
}

async function buildMarketingUnsubscribeUrl(
  env: AppEnv,
  email: string,
): Promise<string> {
  const marketingBaseUrl = (env.MARKETING_BASE_URL ?? "https://www.capveri.com")
    .trim()
    .replace(/\/+$/u, "");
  const unsubscribe = await buildUnsubscribeToken(
    email,
    requireRuntimeSecret(env, "UNSUBSCRIBE_HMAC_SECRET"),
  );
  return `${marketingBaseUrl}/unsubscribe?e=${encodeURIComponent(unsubscribe.emailB64)}&t=${encodeURIComponent(unsubscribe.token)}`;
}

function trialStartDate(sub: JsonRecord): Date {
  return (
    readTimestamp(sub.trial_start) ??
    readTimestamp(sub.current_period_start) ??
    readTimestamp(sub.created) ??
    new Date()
  );
}

function trialChargeDate(sub: JsonRecord): Date {
  return (
    readTimestamp(sub.trial_end) ??
    readTimestamp(sub.current_period_end) ??
    readTimestamp(sub.billing_cycle_anchor) ??
    new Date()
  );
}

function trialChargeAmount(sub: JsonRecord): string {
  const metadata = readMetadata(sub);
  const cents = readOptionalInteger(metadata.annual_total_cents);

  if (cents !== null && cents >= 0) {
    return `$${(cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}/year`;
  }

  const item = firstSubscriptionItem(sub);
  const price = readRecord(item?.price);
  const amountCents = readOptionalInteger(price.unit_amount);

  if (amountCents !== null && amountCents > 0) {
    return `$${(amountCents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}/year`;
  }

  return "Custom pricing";
}

function formatEmailDate(date: Date): string {
  return escapeHtml(
    date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
}

function subscriptionAnalyticsProperties(
  snapshot: Pick<
    SubscriptionSnapshot,
    | "stripeSubscriptionId"
    | "stripeCustomerId"
    | "plan"
    | "tier"
    | "status"
    | "pricingModel"
    | "buildingCount"
    | "unitCount"
    | "includedUnits"
    | "unitOverageCount"
    | "cancelAtPeriodEnd"
  >,
): JsonRecord {
  return {
    stripe_subscription_id: snapshot.stripeSubscriptionId,
    stripe_customer_id: snapshot.stripeCustomerId,
    plan: snapshot.plan,
    tier: snapshot.tier,
    subscription_status: snapshot.status,
    pricing_model: snapshot.pricingModel,
    building_count: snapshot.buildingCount,
    unit_count: snapshot.unitCount,
    included_units: snapshot.includedUnits,
    unit_overage_count: snapshot.unitOverageCount,
    cancel_at_period_end: snapshot.cancelAtPeriodEnd,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

async function resolveOrganizationId(
  object: JsonRecord,
  repository: StripeWebhookRepository,
): Promise<string | null> {
  const metadataOrgId = readMetadata(object).organization_id;

  if (metadataOrgId) {
    return metadataOrgId;
  }

  const customerId = readString(object.customer);

  return customerId
    ? repository.findOrganizationIdByStripeCustomer(customerId)
    : null;
}

async function resolveInvoiceOrganizationId(
  invoice: JsonRecord,
  repository: StripeWebhookRepository,
): Promise<string | null> {
  const customerId = readString(invoice.customer);

  return customerId
    ? repository.findOrganizationIdByStripeCustomer(customerId)
    : null;
}

function subscriptionSnapshot(
  sub: JsonRecord,
  organizationId: string,
): SubscriptionSnapshot {
  const metadata = readMetadata(sub);
  const item = firstSubscriptionItem(sub);
  const price = readRecord(item?.price);
  const priceId = readString(price.id);
  const pricingModel = metadata.pricing_model ?? "per_building";
  const buildingCount =
    pricingModel === "per_unit"
      ? readInteger(metadata.building_count, readInteger(item?.quantity, 1))
      : readInteger(item?.quantity, 1);
  const periodStart =
    readTimestamp(sub.current_period_start) ??
    readTimestamp(sub.start_date) ??
    readTimestamp(sub.created) ??
    new Date();
  const periodEnd =
    readTimestamp(sub.current_period_end) ??
    readTimestamp(sub.billing_cycle_anchor) ??
    new Date();

  return {
    organizationId,
    stripeSubscriptionId: readString(sub.id) ?? "",
    stripeCustomerId: readString(sub.customer),
    plan:
      CHECKOUT_PLAN_TO_SUBSCRIPTION_PLAN[metadata.plan_id ?? ""] ??
      mapPriceToPlan(priceId),
    tier: metadata.plan_id ?? "defend",
    status: mapSubscriptionStatus(readString(sub.status)),
    pricingModel,
    buildingCount,
    unitCount: readOptionalInteger(metadata.unit_count),
    includedUnits: readOptionalInteger(metadata.included_units),
    unitOverageCount: readOptionalInteger(metadata.unit_overage_count),
    currentPeriodStart: periodStart.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    eventTs: readEventTs(sub),
  };
}

function subscriptionUpdateSnapshot(
  sub: JsonRecord,
): SubscriptionUpdateSnapshot {
  const snapshot = subscriptionSnapshot(
    sub,
    "00000000-0000-4000-8000-000000000000",
  );

  return {
    ...snapshot,
    currentPeriodStart: readUpdatePeriodStart(sub)?.toISOString() ?? null,
    currentPeriodEnd: readUpdatePeriodEnd(sub)?.toISOString() ?? null,
  };
}

function readUpdatePeriodStart(sub: JsonRecord): Date | null {
  return (
    readTimestamp(sub.current_period_start) ?? readTimestamp(sub.start_date)
  );
}

function readUpdatePeriodEnd(sub: JsonRecord): Date | null {
  return (
    readTimestamp(sub.current_period_end) ??
    readTimestamp(sub.billing_cycle_anchor)
  );
}

async function invoiceSnapshot(
  invoice: JsonRecord,
  repository: StripeWebhookRepository,
): Promise<InvoiceSnapshot | null> {
  const organizationId = await resolveInvoiceOrganizationId(
    invoice,
    repository,
  );
  const stripeInvoiceId = readString(invoice.id);

  if (!organizationId || !stripeInvoiceId) {
    return null;
  }

  const period = resolveInvoicePeriod(invoice);

  if (!period) {
    return null;
  }

  const stripeSubscriptionId = readString(invoice.subscription);
  const subscriptionId = stripeSubscriptionId
    ? await repository.findSubscriptionIdByStripeSubscription(
        stripeSubscriptionId,
      )
    : null;
  const dueDate = readTimestamp(invoice.due_date);

  return {
    organizationId,
    subscriptionId,
    stripeInvoiceId,
    amountDue: centsToDollars(readInteger(invoice.amount_due, 0)),
    amountPaid: centsToDollars(readInteger(invoice.amount_paid, 0)),
    currency: readString(invoice.currency) ?? "usd",
    status: readString(invoice.status) ?? "draft",
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    dueDate: dueDate ? dueDate.toISOString() : null,
    pdfUrl: readString(invoice.invoice_pdf),
    hostedInvoiceUrl: readString(invoice.hosted_invoice_url),
  };
}

function resolveInvoicePeriod(
  invoice: JsonRecord,
): { start: Date; end: Date } | null {
  let start = readTimestamp(invoice.period_start);
  let end = readTimestamp(invoice.period_end);

  if (start && end && start.getTime() >= end.getTime()) {
    const firstLine = firstInvoiceLine(invoice);
    const period = readRecord(firstLine?.period);
    start = readTimestamp(period.start);
    end = readTimestamp(period.end);
  }

  if (!start || !end || start.getTime() >= end.getTime()) {
    return null;
  }

  return { start, end };
}

function firstSubscriptionItem(sub: JsonRecord): JsonRecord | null {
  const items = readRecord(sub.items);
  const data = items.data;

  return Array.isArray(data) && isRecord(data[0]) ? data[0] : null;
}

function firstInvoiceLine(invoice: JsonRecord): JsonRecord | null {
  const lines = readRecord(invoice.lines);
  const data = lines.data;

  return Array.isArray(data) && isRecord(data[0]) ? data[0] : null;
}

function readMetadata(object: JsonRecord): Record<string, string> {
  const metadata = readRecord(object.metadata);
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }

  return normalized;
}

function readRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return fallback;
}

function readOptionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readInteger(value, 0);
}

function readTimestamp(value: unknown): Date | null {
  const timestamp = readInteger(value, Number.NaN);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const date = new Date(timestamp * 1000);

  return Number.isNaN(date.getTime()) ? null : date;
}

// Reads the Stripe event.created high-water mark that dispatchStripeEvent
// injected onto the event object as `__event_created` (unix seconds) and
// returns it as an ISO 8601 string, or null when absent/unparseable.
function readEventTs(object: JsonRecord): string | null {
  return readTimestamp(object.__event_created)?.toISOString() ?? null;
}

function centsToDollars(cents: number): number {
  return cents / 100;
}

function mapPriceToPlan(priceId: string | null): string {
  return priceId ? "growth_v2" : "growth_v2";
}

function mapSubscriptionStatus(status: string | null): string {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "paused":
      return status;
    case "unpaid":
      return "past_due";
    case "incomplete":
      // First payment has not settled yet (e.g. SCA/3DS pending). The
      // subscription must NOT grant premium access — the entitlement gate
      // grants on active|trialing only — so fold to the recoverable non-access
      // state past_due. Stripe fires subscription.updated→active on success.
      return "past_due";
    case "incomplete_expired":
      // The first invoice was never paid within Stripe's window; the
      // subscription is dead. Fold to canceled (no access).
      return "canceled";
    default:
      // Fail closed: an unrecognized/future Stripe status must never silently
      // grant premium access. past_due denies access while staying recoverable
      // if a later recognized status restores the correct entitlement.
      return "past_due";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
