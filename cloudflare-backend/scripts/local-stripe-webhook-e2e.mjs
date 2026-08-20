import { Buffer } from "node:buffer";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { connect } from "node:net";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { tmpdir } from "node:os";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8824";
const DEFAULT_RESEND_STUB_URL = "http://127.0.0.1:8825";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_RESEND_API_KEY = "local-resend-key";
const STRIPE_WEBHOOK_SECRET = "whsec_local_stripe_webhook_e2e";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local Stripe webhook E2E always owns ${DEFAULT_BASE_URL}`);
  }
  if (args["resend-stub-url"] || process.env.npm_config_resend_stub_url) {
    fail(`local Stripe webhook E2E always owns ${DEFAULT_RESEND_STUB_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const resendStubUrl = DEFAULT_RESEND_STUB_URL;
  const supabaseUrl = normalizedLocalUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
    "supabase-url",
  );
  const databaseUrl = normalizedLocalDatabaseUrl(
    args["database-url"] ??
      process.env.npm_config_database_url ??
      process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );

  if (process.env.CI) fail("Refusing to run local Stripe webhook E2E in CI.");
  await assertPortAvailable(baseUrl);
  await assertPortAvailable(resendStubUrl);
  const resend = await startResendStub(resendStubUrl);
  let worker;
  let runError;
  let closeError;

  try {
    worker = await startWorkerServer({
      baseUrl,
      supabaseUrl,
      databaseUrl,
      resendStubUrl,
    });
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(await runOnce({ baseUrl, databaseUrl, index, resend }));
    }
    console.log(
      JSON.stringify({ ok: true, base_url: baseUrl, repeat, runs }, null, 2),
    );
  } catch (error) {
    runError = error;
  } finally {
    try {
      if (worker) await worker.close();
      await resend.close();
    } catch (error) {
      closeError = error;
    }
  }
  if (runError && closeError) {
    console.error(
      `Local Stripe webhook Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const generated = {
    orgIds: [],
    stripeEventIds: [],
    stripeSubscriptionIds: [],
    stripeInvoiceIds: [],
    stripeCheckoutSessionIds: [],
  };
  let runError;
  let cleanupError;
  let result;

  try {
    const org = await seedOrganization(sql, suffix);
    generated.orgIds.push(org.id);
    await assertInvalidSignaturesDoNotClaim(input.baseUrl, sql, suffix);
    const resendStart = input.resend.requests.length;

    const subscriptionEvent = stripeEvent(
      `evt_stripe_webhook_sub_${suffix}`,
      "customer.subscription.created",
      subscription({
        id: `sub_stripe_webhook_${suffix}`,
        customer: `cus_stripe_webhook_${suffix}`,
        status: "trialing",
        trial_start: 1_780_000_000,
        trial_end: 1_782_592_000,
        metadata: {
          app: "capveri",
          organization_id: org.id,
          plan_id: "reconcile",
          pricing_model: "per_unit",
          building_count: "2",
          unit_count: "50",
          included_units: "25",
          unit_overage_count: "25",
          annual_total_cents: "2289000",
        },
      }),
    );
    generated.stripeEventIds.push(subscriptionEvent.id);
    generated.stripeSubscriptionIds.push(subscriptionEvent.data.object.id);

    await postSignedEvent(input.baseUrl, subscriptionEvent);
    await assertSubscriptionCreated(sql, {
      organizationId: org.id,
      stripeSubscriptionId: subscriptionEvent.data.object.id,
      stripeCustomerId: subscriptionEvent.data.object.customer,
      status: "trialing",
    });
    await assertWebhookStatus(sql, subscriptionEvent.id, "succeeded");
    assertTrialStartedEmailContract({
      requests: input.resend.requests.slice(resendStart),
      baseUrl: input.baseUrl,
      organizationName: org.name,
      billingEmail: org.billingEmail,
    });
    await assertSubscriptionEmailEvent(sql, {
      organizationId: org.id,
      stripeSubscriptionId: subscriptionEvent.data.object.id,
      stripeEventId: subscriptionEvent.id,
      providerMessageId: "local-resend-message-1",
    });

    const beforeDuplicate = await readWebhookEvent(sql, subscriptionEvent.id);
    await postSignedEvent(input.baseUrl, subscriptionEvent);
    const afterDuplicate = await readWebhookEvent(sql, subscriptionEvent.id);
    assertTrialStartedEmailContract({
      requests: input.resend.requests.slice(resendStart),
      baseUrl: input.baseUrl,
      organizationName: org.name,
      billingEmail: org.billingEmail,
    });
    await assertSubscriptionEmailEvent(sql, {
      organizationId: org.id,
      stripeSubscriptionId: subscriptionEvent.data.object.id,
      stripeEventId: subscriptionEvent.id,
      providerMessageId: "local-resend-message-1",
    });
    await assertOneRow(
      sql,
      "subscriptions",
      "stripe_subscription_id",
      subscriptionEvent.data.object.id,
    );
    assert(
      afterDuplicate.count === 1,
      "duplicate event changed webhook claim count",
    );
    assert(
      afterDuplicate.processedAt === beforeDuplicate.processedAt,
      "duplicate event updated processed_at",
    );

    const foreignEvent = stripeEvent(
      `evt_stripe_webhook_foreign_${suffix}`,
      "customer.subscription.created",
      subscription({
        id: `sub_foreign_${suffix}`,
        customer: `cus_foreign_${suffix}`,
        metadata: {
          app: "other",
          organization_id: org.id,
        },
      }),
    );
    generated.stripeEventIds.push(foreignEvent.id);
    await postSignedEvent(input.baseUrl, foreignEvent);
    await assertNoSubscription(sql, foreignEvent.data.object.id);
    await assertWebhookStatus(sql, foreignEvent.id, "succeeded");

    const invoiceCreated = stripeEvent(
      `evt_stripe_webhook_invoice_created_${suffix}`,
      "invoice.created",
      invoice({
        id: `in_stripe_webhook_${suffix}`,
        customer: subscriptionEvent.data.object.customer,
        subscription: subscriptionEvent.data.object.id,
        amount_due: 12345,
        amount_paid: 0,
        status: "open",
      }),
    );
    generated.stripeEventIds.push(invoiceCreated.id);
    generated.stripeInvoiceIds.push(invoiceCreated.data.object.id);
    await postSignedEvent(input.baseUrl, invoiceCreated);
    await assertInvoice(sql, {
      organizationId: org.id,
      stripeInvoiceId: invoiceCreated.data.object.id,
      status: "open",
      amountDue: "123.45",
      amountPaid: "0.00",
    });

    const invoicePaid = stripeEvent(
      `evt_stripe_webhook_invoice_paid_${suffix}`,
      "invoice.paid",
      invoice({
        id: invoiceCreated.data.object.id,
        customer: subscriptionEvent.data.object.customer,
        subscription: subscriptionEvent.data.object.id,
        amount_due: 12345,
        amount_paid: 12345,
        status: "paid",
        invoice_pdf: "https://stripe.example.test/invoice.pdf",
        hosted_invoice_url: "https://stripe.example.test/invoice",
      }),
    );
    generated.stripeEventIds.push(invoicePaid.id);
    await postSignedEvent(input.baseUrl, invoicePaid);
    await assertInvoice(sql, {
      organizationId: org.id,
      stripeInvoiceId: invoiceCreated.data.object.id,
      status: "paid",
      amountDue: "123.45",
      amountPaid: "123.45",
    });

    const checkoutEvent = stripeEvent(
      `evt_stripe_webhook_checkout_${suffix}`,
      "checkout.session.completed",
      {
        id: `cs_stripe_webhook_${suffix}`,
        mode: "payment",
        amount_total: 10001,
        payment_intent: `pi_stripe_webhook_${suffix}`,
        metadata: {
          app: "capveri",
          organization_id: org.id,
          quantity: "2",
        },
      },
    );
    generated.stripeEventIds.push(checkoutEvent.id);
    generated.stripeCheckoutSessionIds.push(checkoutEvent.data.object.id);
    await postSignedEvent(input.baseUrl, checkoutEvent);
    await assertAuditCredit(sql, {
      organizationId: org.id,
      stripeCheckoutSessionId: checkoutEvent.data.object.id,
      creditsPurchased: 2,
      unitPriceCents: 5000,
    });

    const deletedEvent = stripeEvent(
      `evt_stripe_webhook_deleted_${suffix}`,
      "customer.subscription.deleted",
      subscription({
        id: subscriptionEvent.data.object.id,
        customer: subscriptionEvent.data.object.customer,
        status: "canceled",
        cancel_at_period_end: true,
        metadata: { app: "capveri", organization_id: org.id },
      }),
    );
    generated.stripeEventIds.push(deletedEvent.id);
    await postSignedEvent(input.baseUrl, deletedEvent);
    await assertSubscriptionStatus(sql, subscriptionEvent.data.object.id, {
      status: "canceled",
      cancelAtPeriodEnd: false,
    });

    result = {
      index: input.index,
      organization_id: org.id,
      stripe_subscription_id: subscriptionEvent.data.object.id,
      stripe_invoice_id: invoiceCreated.data.object.id,
      stripe_checkout_session_id: checkoutEvent.data.object.id,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupGeneratedRows(sql, generated);
      await assertCleanupComplete(sql, generated);
    } catch (error) {
      cleanupError ??= error;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  if (runError && cleanupError) {
    console.error(
      `Local Stripe webhook row cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function seedOrganization(sql, suffix) {
  const billingEmail = `stripe-webhook-billing-${suffix}@capveri.local`;
  const rows = await sql`
    insert into organizations (name, billing_email, settings)
    values (
      ${`Local Stripe Webhook Org ${suffix}`},
      ${billingEmail},
      ${sql.json({ billing_activation: { checkout_required: true } })}
    )
    returning id::text, name, billing_email
  `;
  return {
    id: rows[0].id,
    name: rows[0].name,
    billingEmail: rows[0].billing_email,
  };
}

async function assertInvalidSignaturesDoNotClaim(baseUrl, sql, suffix) {
  const missing = await fetch(`${baseUrl}/webhooks/stripe`, {
    method: "POST",
    body: JSON.stringify(stripeEvent(`evt_missing_${suffix}`, "unknown", {})),
  });
  await assertErrorEnvelope(missing, {
    status: 400,
    code: "missing_signature",
    message: "Missing stripe-signature header",
    label: "missing Stripe signature",
  });

  const malformedEvent = stripeEvent(`evt_malformed_${suffix}`, "unknown", {});
  const malformed = await fetch(`${baseUrl}/webhooks/stripe`, {
    method: "POST",
    headers: { "stripe-signature": "v1=abc" },
    body: JSON.stringify(malformedEvent),
  });
  await assertErrorEnvelope(malformed, {
    status: 400,
    code: "malformed_signature",
    message: "Malformed Stripe signature header",
    label: "malformed Stripe signature",
  });

  const staleEvent = stripeEvent(`evt_stale_${suffix}`, "unknown", {});
  const stale = await fetch(`${baseUrl}/webhooks/stripe`, {
    method: "POST",
    headers: stripeSignatureHeaders(JSON.stringify(staleEvent), {
      timestamp: Math.floor(Date.now() / 1000) - 301,
    }),
    body: JSON.stringify(staleEvent),
  });
  await assertErrorEnvelope(stale, {
    status: 400,
    code: "stale_signature",
    message: "Stripe signature is stale",
    label: "stale Stripe signature",
  });

  const badEvent = stripeEvent(`evt_bad_sig_${suffix}`, "unknown", {});
  const badBody = JSON.stringify(badEvent);
  const bad = await fetch(`${baseUrl}/webhooks/stripe`, {
    method: "POST",
    headers: stripeSignatureHeaders(badBody, { secret: "wrong-secret" }),
    body: badBody,
  });
  await assertErrorEnvelope(bad, {
    status: 400,
    code: "invalid_signature",
    message: "Invalid Stripe signature",
    label: "invalid Stripe signature",
  });

  const rows = await sql`
    select count(*)::int as count
    from stripe_webhook_events
    where stripe_event_id in (${`evt_missing_${suffix}`}, ${malformedEvent.id}, ${staleEvent.id}, ${badEvent.id})
  `;
  assert(rows[0]?.count === 0, "invalid signatures created webhook claims");
}

async function assertErrorEnvelope(response, input) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    fail(`${input.label} returned non-JSON body: ${text}`);
  }
  assert(
    response.status === input.status,
    `${input.label} status mismatch: ${response.status}`,
  );
  assertDeepEqual(
    body,
    {
      detail: input.message,
      error: { code: input.code, message: input.message },
    },
    `${input.label} error envelope`,
  );
}

async function postSignedEvent(baseUrl, event) {
  const body = JSON.stringify(event);
  const response = await fetch(`${baseUrl}/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...stripeSignatureHeaders(body),
    },
    body,
  });
  const text = await response.text();
  if (response.status !== 200) {
    fail(`Stripe event ${event.id} returned ${response.status}: ${text}`);
  }
  const payload = text ? JSON.parse(text) : {};
  assert(payload.received === true, `Stripe event ${event.id} not received`);
}

async function assertSubscriptionCreated(sql, input) {
  const rows = await sql`
    select
      stripe_subscription_id,
      stripe_customer_id,
      plan::text,
      tier,
      status::text,
      pricing_model,
      building_count,
      unit_count,
      included_units,
      unit_overage_count,
      cancel_at_period_end,
      settings->'billing_activation'->>'checkout_required' as checkout_required
    from subscriptions s
    join organizations o on o.id = s.organization_id
    where s.organization_id = ${input.organizationId}
  `;
  assert(rows.length === 1, "email event row count mismatch");
  const row = rows[0];
  assert(
    row?.stripe_subscription_id === input.stripeSubscriptionId,
    "subscription id mismatch",
  );
  assert(
    row.stripe_customer_id === input.stripeCustomerId,
    "customer id mismatch",
  );
  assert(row.plan === "growth_v2", "plan mismatch");
  assert(row.tier === "reconcile", "tier mismatch");
  assert(
    row.status === (input.status ?? "active"),
    "subscription status mismatch",
  );
  assert(row.pricing_model === "per_unit", "pricing model mismatch");
  assert(row.building_count === 2, "building count mismatch");
  assert(row.unit_count === 50, "unit count mismatch");
  assert(row.included_units === 25, "included units mismatch");
  assert(row.unit_overage_count === 25, "unit overage mismatch");
  assert(row.cancel_at_period_end === false, "cancel flag mismatch");
  assert(row.checkout_required === "false", "checkout activation mismatch");
}

function assertTrialStartedEmailContract(input) {
  const emailRequests = input.requests.filter(
    (request) => request.path === "/emails",
  );
  assert(emailRequests.length === 1, "trial email send count mismatch");
  const request = emailRequests[0];
  assert(request.method === "POST", "trial email method mismatch");
  assert(
    request.headers.authorization === `Bearer ${LOCAL_RESEND_API_KEY}`,
    "trial email authorization mismatch",
  );
  const payload = request.json;
  assert(
    payload.from === "CapVeri <local@capveri.local>",
    "trial email from mismatch",
  );
  assert(payload.to === input.billingEmail, "trial email recipient mismatch");
  assert(
    payload.subject === "Your CapVeri free trial has started",
    "trial email subject mismatch",
  );
  const requiredHtml = [
    "Your CapVeri trial is live",
    `Hi ${input.organizationName},`,
    "May 28, 2026",
    "June 27, 2026",
    "$22,890.00/year",
    `${input.baseUrl}/settings/billing`,
    "border-radius:9999px",
  ];
  for (const marker of requiredHtml) {
    assert(payload.html.includes(marker), `trial email HTML missing ${marker}`);
  }
}

async function assertSubscriptionEmailEvent(sql, input) {
  const rows = await sql`
    select
      organization_id::text,
      stripe_subscription_id,
      email_type,
      status,
      stripe_event_id,
      provider_message_id,
      sent_at is not null as sent
    from subscription_email_events
    where stripe_subscription_id = ${input.stripeSubscriptionId}
      and email_type = 'trial_started'
  `;
  const row = rows[0];
  assert(
    row?.organization_id === input.organizationId,
    "email event org mismatch",
  );
  assert(
    row.stripe_subscription_id === input.stripeSubscriptionId,
    "email event subscription mismatch",
  );
  assert(row.email_type === "trial_started", "email event type mismatch");
  assert(row.status === "sent", "email event status mismatch");
  assert(
    row.stripe_event_id === input.stripeEventId,
    "email event Stripe id mismatch",
  );
  assert(
    row.provider_message_id === input.providerMessageId,
    "email event provider id mismatch",
  );
  assert(row.sent === true, "email event sent_at missing");
}

async function assertSubscriptionStatus(sql, stripeSubscriptionId, input) {
  const rows = await sql`
    select status::text, cancel_at_period_end
    from subscriptions
    where stripe_subscription_id = ${stripeSubscriptionId}
  `;
  assert(rows[0]?.status === input.status, "subscription status mismatch");
  assert(
    rows[0]?.cancel_at_period_end === input.cancelAtPeriodEnd,
    "subscription cancel flag mismatch",
  );
}

async function assertNoSubscription(sql, stripeSubscriptionId) {
  const rows = await sql`
    select count(*)::int as count
    from subscriptions
    where stripe_subscription_id = ${stripeSubscriptionId}
  `;
  assert(rows[0]?.count === 0, "foreign subscription was inserted");
}

async function assertWebhookStatus(sql, stripeEventId, status) {
  const rows = await sql`
    select status, processed_at is not null as processed
    from stripe_webhook_events
    where stripe_event_id = ${stripeEventId}
  `;
  assert(
    rows[0]?.status === status,
    `webhook ${stripeEventId} status mismatch`,
  );
  assert(rows[0]?.processed === true, `webhook ${stripeEventId} not processed`);
}

async function readWebhookEvent(sql, stripeEventId) {
  const rows = await sql`
    select count(*)::int as count, max(processed_at)::text as processed_at
    from stripe_webhook_events
    where stripe_event_id = ${stripeEventId}
  `;
  return {
    count: rows[0]?.count ?? 0,
    processedAt: rows[0]?.processed_at ?? null,
  };
}

async function assertOneRow(sql, table, column, value) {
  const rows = await sql`
    select count(*)::int as count
    from ${sql(table)}
    where ${sql(column)} = ${value}
  `;
  assert(rows[0]?.count === 1, `${table}.${column} duplicate mismatch`);
}

async function assertInvoice(sql, input) {
  const rows = await sql`
    select
      organization_id::text,
      stripe_invoice_id,
      amount_due::text,
      amount_paid::text,
      status::text,
      pdf_url,
      hosted_invoice_url,
      paid_at is not null as paid
    from invoices
    where stripe_invoice_id = ${input.stripeInvoiceId}
  `;
  const row = rows[0];
  assert(row?.organization_id === input.organizationId, "invoice org mismatch");
  assert(
    row.stripe_invoice_id === input.stripeInvoiceId,
    "invoice id mismatch",
  );
  assert(row.amount_due === input.amountDue, "invoice amount_due mismatch");
  assert(row.amount_paid === input.amountPaid, "invoice amount_paid mismatch");
  assert(row.status === input.status, "invoice status mismatch");
  if (input.status === "paid") {
    assert(row.paid === true, "invoice paid_at missing");
    assert(
      row.pdf_url === "https://stripe.example.test/invoice.pdf",
      "invoice pdf mismatch",
    );
    assert(
      row.hosted_invoice_url === "https://stripe.example.test/invoice",
      "hosted invoice url mismatch",
    );
  }
}

async function assertAuditCredit(sql, input) {
  const rows = await sql`
    select
      organization_id::text,
      credits_purchased,
      credits_used,
      unit_price_cents,
      stripe_checkout_session_id
    from audit_credits
    where stripe_checkout_session_id = ${input.stripeCheckoutSessionId}
  `;
  const row = rows[0];
  assert(
    row?.organization_id === input.organizationId,
    "audit credit org mismatch",
  );
  assert(
    row.credits_purchased === input.creditsPurchased,
    "credits purchased mismatch",
  );
  assert(row.credits_used === 0, "credits used mismatch");
  assert(row.unit_price_cents === input.unitPriceCents, "unit price mismatch");
}

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const eventIds = nonEmpty(
    input.stripeEventIds,
    "__local_stripe_event_none__",
  );
  const subscriptionIds = nonEmpty(
    input.stripeSubscriptionIds,
    "__local_stripe_subscription_none__",
  );
  const invoiceIds = nonEmpty(
    input.stripeInvoiceIds,
    "__local_stripe_invoice_none__",
  );
  const checkoutSessionIds = nonEmpty(
    input.stripeCheckoutSessionIds,
    "__local_stripe_checkout_none__",
  );

  await sql.begin(async (transaction) => {
    await transaction`delete from stripe_webhook_events where stripe_event_id in ${transaction(eventIds)}`;
    await transaction`delete from subscription_email_events where organization_id in ${transaction(orgIds)} or stripe_subscription_id in ${transaction(subscriptionIds)}`;
    await transaction`delete from invoices where organization_id in ${transaction(orgIds)} or stripe_invoice_id in ${transaction(invoiceIds)}`;
    await transaction`delete from audit_credits where organization_id in ${transaction(orgIds)} or stripe_checkout_session_id in ${transaction(checkoutSessionIds)}`;
    await transaction`delete from subscriptions where organization_id in ${transaction(orgIds)} or stripe_subscription_id in ${transaction(subscriptionIds)}`;
    await transaction`delete from organizations where id in ${transaction(orgIds)}`;
  });
}

async function assertCleanupComplete(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const eventIds = nonEmpty(
    input.stripeEventIds,
    "__local_stripe_event_none__",
  );
  const subscriptionIds = nonEmpty(
    input.stripeSubscriptionIds,
    "__local_stripe_subscription_none__",
  );
  const invoiceIds = nonEmpty(
    input.stripeInvoiceIds,
    "__local_stripe_invoice_none__",
  );
  const checkoutSessionIds = nonEmpty(
    input.stripeCheckoutSessionIds,
    "__local_stripe_checkout_none__",
  );
  const rows = await sql`
    select
      (select count(*)::int from stripe_webhook_events where stripe_event_id in ${sql(eventIds)}) as stripe_webhook_events,
      (select count(*)::int from subscription_email_events where organization_id in ${sql(orgIds)} or stripe_subscription_id in ${sql(subscriptionIds)}) as subscription_email_events,
      (select count(*)::int from invoices where organization_id in ${sql(orgIds)} or stripe_invoice_id in ${sql(invoiceIds)}) as invoices,
      (select count(*)::int from audit_credits where organization_id in ${sql(orgIds)} or stripe_checkout_session_id in ${sql(checkoutSessionIds)}) as audit_credits,
      (select count(*)::int from subscriptions where organization_id in ${sql(orgIds)} or stripe_subscription_id in ${sql(subscriptionIds)}) as subscriptions,
      (select count(*)::int from organizations where id in ${sql(orgIds)}) as organizations
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

function stripeEvent(id, type, object, previousAttributes = {}) {
  return {
    id,
    type,
    data: {
      object,
      previous_attributes: previousAttributes,
    },
  };
}

function subscription(overrides = {}) {
  return {
    id: "sub_unused",
    customer: "cus_unused",
    status: "active",
    current_period_start: 1_780_000_000,
    current_period_end: 1_782_592_000,
    cancel_at_period_end: false,
    metadata: {
      app: "capveri",
      plan_id: "reconcile",
      pricing_model: "per_unit",
      building_count: "1",
      unit_count: "25",
      included_units: "25",
      unit_overage_count: "0",
    },
    items: {
      data: [{ quantity: 1, price: { id: "price_reconcile" } }],
    },
    ...overrides,
  };
}

function invoice(overrides = {}) {
  return {
    id: "in_unused",
    customer: "cus_unused",
    subscription: "sub_unused",
    amount_due: 12345,
    amount_paid: 0,
    currency: "usd",
    status: "open",
    period_start: 1_780_000_000,
    period_end: 1_782_592_000,
    due_date: 1_782_000_000,
    invoice_pdf: null,
    hosted_invoice_url: null,
    ...overrides,
  };
}

function stripeSignatureHeaders(body, options = {}) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const secret = options.secret ?? STRIPE_WEBHOOK_SECRET;
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { "stripe-signature": `t=${timestamp},v1=${signature}` };
}

async function startResendStub(baseUrl) {
  const url = new URL(baseUrl);
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const requestUrl = new URL(request.url ?? "/", baseUrl);
    let json = null;
    if (body) {
      try {
        json = JSON.parse(body);
      } catch {
        json = null;
      }
    }
    requests.push({
      method: request.method ?? "GET",
      path: requestUrl.pathname,
      headers: request.headers,
      body,
      json,
    });

    response.setHeader("content-type", "application/json");
    if (requestUrl.pathname === "/emails") {
      response.statusCode = 200;
      response.end(
        JSON.stringify({ id: `local-resend-message-${requests.length}` }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "unhandled local Resend path" }));
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(Number(url.port), url.hostname, resolveListen);
  });
  return {
    requests,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      }),
  };
}

async function startWorkerServer(input) {
  const port = new URL(input.baseUrl).port;
  const envFile = await createWorkerEnvFile(input);
  const child = spawn(
    process.execPath,
    [
      WRANGLER_BIN,
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      port,
      "--local",
      "--show-interactive-dev-session",
      "false",
      "--env-file",
      envFile.path,
      "--var",
      `STRIPE_WEBHOOK_SECRET:${STRIPE_WEBHOOK_SECRET}`,
      "--var",
      "DB_ACCESS_MODE:direct-postgres",
      "--var",
      "DB_PRODUCTION_BOUNDARY:direct-postgres",
      "--var",
      `DATABASE_URL:${input.databaseUrl}`,
      "--var",
      `SUPABASE_URL:${input.supabaseUrl}`,
      "--var",
      `AUTH_JWKS_URL:${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      "--var",
      "POSTHOG_PROJECT_API_KEY:",
      "--var",
      "POSTHOG_HOST:http://127.0.0.1:9",
      "--var",
      `RESEND_API_KEY:${LOCAL_RESEND_API_KEY}`,
      "--var",
      `RESEND_API_BASE_URL:${input.resendStubUrl}`,
      "--var",
      "RESEND_FROM_ADDRESS:CapVeri <local@capveri.local>",
      "--var",
      `APP_BASE_URL:${input.baseUrl}`,
    ],
    {
      cwd: process.cwd(),
      env: workerEnv(input),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  let childError;
  child.once("error", (error) => {
    childError = error;
    output += `\nwrangler dev spawn error: ${errorMessage(error)}`;
  });
  child.once("exit", (code) => {
    if (code !== null && code !== 0)
      output += `\nwrangler dev exited with ${code}`;
  });
  const handle = {
    close: async () => {
      try {
        if (child.exitCode === null) {
          if (child.pid) await killProcessTree(child.pid);
        } else if (child.pid) {
          await killProcessTree(child.pid);
        }
      } finally {
        try {
          await waitForPortClosed(input.baseUrl);
        } finally {
          await envFile.close();
        }
      }
    },
  };
  try {
    await waitForHealth(input.baseUrl, () => output);
    if (childError) {
      fail(`wrangler dev failed to spawn\n${output.slice(-2000)}`);
    }
    if (child.exitCode !== null) {
      fail(`wrangler dev exited before health\n${output.slice(-2000)}`);
    }
    return handle;
  } catch (error) {
    try {
      await handle.close();
    } catch (closeError) {
      console.error(
        `Worker cleanup failed after startup failure: ${errorMessage(closeError)}`,
      );
    }
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-stripe-e2e-"));
  const path = resolve(directory, ".dev.vars.local-stripe-webhook-e2e");
  await writeFile(
    path,
    [
      "ENVIRONMENT=development",
      "NODE_ENV=development",
      `STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}`,
      "DB_ACCESS_MODE=direct-postgres",
      "DB_PRODUCTION_BOUNDARY=direct-postgres",
      `DATABASE_URL=${input.databaseUrl}`,
      `SUPABASE_URL=${input.supabaseUrl}`,
      `AUTH_JWKS_URL=${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      `RESEND_API_KEY=${LOCAL_RESEND_API_KEY}`,
      `RESEND_API_BASE_URL=${input.resendStubUrl}`,
      "RESEND_FROM_ADDRESS=CapVeri <local@capveri.local>",
      `APP_BASE_URL=${input.baseUrl}`,
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=",
      "UNSUBSCRIBE_HMAC_SECRET=",
      "CHECKOUT_OFFER_TOKEN_SECRET=",
    ].join("\n"),
    "utf8",
  );
  return {
    path,
    close: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function killProcessTree(pid) {
  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return;
    }
    return;
  }

  await new Promise((resolveKill) => {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("exit", resolveKill);
    killer.once("error", resolveKill);
  });
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) {
      return;
    }
    await sleep(250);
  }
  fail(`${baseUrl} still accepts TCP connections after Worker close`);
}

async function canConnect(host, port) {
  return new Promise((resolveConnect) => {
    const socket = connect({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolveConnect(false);
    }, 500);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolveConnect(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolveConnect(false);
    });
  });
}

function workerEnv(input) {
  const env = {};
  for (const key of [
    "PATH",
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
  ]) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  env.ENVIRONMENT = "development";
  env.NODE_ENV = "development";
  env.STRIPE_WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET;
  env.DB_ACCESS_MODE = "direct-postgres";
  env.DB_PRODUCTION_BOUNDARY = "direct-postgres";
  env.DATABASE_URL = input.databaseUrl;
  env.SUPABASE_URL = input.supabaseUrl;
  env.AUTH_JWKS_URL = `${input.supabaseUrl}/auth/v1/.well-known/jwks.json`;
  env.RESEND_API_KEY = LOCAL_RESEND_API_KEY;
  env.RESEND_API_BASE_URL = input.resendStubUrl;
  env.RESEND_FROM_ADDRESS = "CapVeri <local@capveri.local>";
  env.APP_BASE_URL = input.baseUrl;
  return env;
}

async function assertPortAvailable(baseUrl) {
  let response;
  try {
    response = await fetch(`${baseUrl}/health`);
  } catch {
    return;
  }
  if (response.ok) fail(`${baseUrl} is already serving /health`);
}

async function waitForHealth(baseUrl, output = () => "") {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//iu.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }
      fail(`Unexpected argument: ${arg}`);
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) parsed[key] = inlineValue;
    else {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) parsed[key] = "true";
      else {
        parsed[key] = next;
        index += 1;
      }
    }
  }
  return parsed;
}

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isSafeInteger(value) || value < 1)
    fail(`${label} must be a positive integer`);
  return value;
}

function normalizedLocalUrl(rawUrl, label) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:") fail(`${label} must use http`);
  if (!isLoopbackHost(url.hostname)) fail(`${label} must point at loopback`);
  if (!url.port) fail(`${label} must include a port`);
  if (
    label === "supabase-url" &&
    (url.port !== "54321" || (url.pathname !== "" && url.pathname !== "/"))
  ) {
    fail(
      "supabase-url must be the local Supabase API at http://127.0.0.1:54321",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function normalizedLocalDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    fail("database-url must be Postgres");
  if (!isLoopbackHost(url.hostname))
    fail("database-url must point at loopback");
  if (url.port !== "54322")
    fail("database-url must use the local Supabase Postgres port 54322");
  if (url.pathname !== "/postgres")
    fail("database-url must target the local Supabase postgres database");
  return url.toString();
}

async function readEnvValue(filePath, keys) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    if (!keys.includes(key)) continue;
    return trimmed
      .slice(equals + 1)
      .trim()
      .replace(/^["']|["']$/gu, "");
  }
  return undefined;
}

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(values.filter((value) => typeof value === "string" && value)),
  ];
  return unique.length > 0 ? unique : [sentinel];
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(stableJson(actual));
  const expectedJson = JSON.stringify(stableJson(expected));
  if (actualJson !== expectedJson) {
    fail(
      `${label} mismatch:\nexpected ${JSON.stringify(expected, null, 2)}\nactual ${JSON.stringify(actual, null, 2)}`,
    );
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJson(value[key])]),
    );
  }
  return value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
