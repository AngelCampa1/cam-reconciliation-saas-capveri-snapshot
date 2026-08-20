import http from "node:http";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { URLSearchParams } from "node:url";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8843";
const DEFAULT_STRIPE_API_BASE_URL = "http://127.0.0.1:8844";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const EMPTY_UUID = "00000000-0000-4000-8000-000000000000";
const EMPTY_EMAIL = "__capveri_no_email__";
const EMPTY_ORG_NAME = "__capveri_no_org_name__";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";

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
    fail(`local billing E2E always owns ${DEFAULT_BASE_URL}`);
  }
  if (
    args["stripe-api-base-url"] ||
    process.env.npm_config_stripe_api_base_url
  ) {
    fail(`local billing E2E always owns ${DEFAULT_STRIPE_API_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const supabaseUrl = normalizedLocalSupabaseUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
  );
  const databaseUrl = normalizedLocalDatabaseUrl(
    args["database-url"] ??
      process.env.npm_config_database_url ??
      process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ])) ??
    LOCAL_ANON_KEY;
  const stripeApiBaseUrl = DEFAULT_STRIPE_API_BASE_URL;

  if (process.env.CI) {
    fail("Refusing to run local billing E2E in CI.");
  }

  await assertPortAvailable(baseUrl);
  await assertPortAvailable(stripeApiBaseUrl);
  const stripeStub = await startStripeStub(stripeApiBaseUrl);
  let worker;
  let runError;
  let closeError;
  try {
    worker = await startWorkerServer({
      baseUrl,
      supabaseUrl,
      databaseUrl,
      stripeApiBaseUrl,
    });
    await expectJson(`${stripeApiBaseUrl}/__local-stripe-stub/health`, {
      status: 200,
    });

    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
          supabaseUrl,
          anonKey,
          databaseUrl,
          stripeApiBaseUrl,
          stripeRequests: stripeStub.requests,
          index,
        }),
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          supabase_url: supabaseUrl,
          stripe_api_base_url: stripeApiBaseUrl,
          repeat,
          runs,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    runError = error;
  } finally {
    const failures = [];
    if (worker) {
      try {
        await worker.close();
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    try {
      await stripeStub.close();
      await waitForPortClosed(stripeApiBaseUrl);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
    if (failures.length > 0) {
      closeError = new Error(`cleanup failed: ${failures.join("; ")}`);
      if (runError) {
        closeError.cause = runError;
      }
    }
  }

  if (runError && closeError) {
    console.error(
      `Local billing cleanup failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedBillingAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.ownerToken);
  const hiddenHeaders = jsonAuthHeaders(account.hiddenOwnerToken);
  const noAccessHeaders = jsonAuthHeaders(account.noAccessOwnerToken);
  const userIds = [
    account.ownerUserId,
    account.hiddenOwnerId,
    account.noAccessOwnerId,
  ];
  const orgIds = [
    account.organizationId,
    account.hiddenOrganizationId,
    account.noAccessOrganizationId,
  ];
  const emails = [
    account.ownerEmail,
    account.hiddenOwnerEmail,
    account.noAccessOwnerEmail,
  ];
  const orgNames = [
    account.organizationName,
    account.hiddenOrganizationName,
    account.noAccessOrganizationName,
  ];
  const stripeRequestStart = input.stripeRequests.length;

  try {
    const customer = await expectJson(
      `${input.baseUrl}/api/v1/billing/customer`,
      { headers: ownerHeaders, status: 200 },
    );
    assertBillingCustomer(customer, {
      id: account.stripeCustomerId,
      email: "billing-e2e@capveri.local",
      name: "Local Billing E2E Org",
    });
    const preflightStripeCalls = input.stripeRequests.slice(stripeRequestStart);
    assert(
      preflightStripeCalls.some(
        (request) =>
          request.method === "GET" &&
          request.path === `/v1/customers/${account.stripeCustomerId}`,
      ),
      "Worker is not using the local Stripe stub; restart it with STRIPE_API_BASE_URL pointing at the loopback stub before running billing E2E.",
    );

    const subscription = await expectJson(
      `${input.baseUrl}/api/v1/billing/subscription`,
      { headers: ownerHeaders, status: 200 },
    );
    assertSubscriptionContract(subscription, {
      id: account.subscriptionId,
      organization_id: account.organizationId,
      stripe_customer_id: account.stripeCustomerId,
      stripe_subscription_id: account.stripeSubscriptionId,
      status: "active",
      cancel_at_period_end: false,
      money_back_claimed_at: null,
      money_back_refund_id: null,
    });

    const invoices = await expectJson(
      `${input.baseUrl}/api/v1/billing/invoices?status=paid&page=1&per_page=5`,
      { headers: ownerHeaders, status: 200 },
    );
    assertInvoiceList(invoices, {
      total: 1,
      page: 1,
      per_page: 5,
      expectedInvoiceIds: [account.invoiceId],
    });

    const invoice = await expectJson(
      `${input.baseUrl}/api/v1/billing/invoices/${account.invoiceId}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertInvoiceContract(invoice, {
      id: account.invoiceId,
      organization_id: account.organizationId,
      subscription_id: account.subscriptionId,
      stripe_invoice_id: account.stripeInvoiceId,
      pdf_url: account.invoicePdfUrl,
    });

    const summary = await expectJson(
      `${input.baseUrl}/api/v1/billing/invoices/summary`,
      { headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(
      summary,
      {
        total_invoices: 1,
        paid_invoices: 1,
        open_invoices: 0,
        total_paid: 120000,
        currency: "usd",
      },
      "invoice summary response",
    );

    await expectRedirect(
      `${input.baseUrl}/api/v1/billing/invoices/${account.invoiceId}/pdf`,
      {
        headers: { authorization: `Bearer ${account.ownerToken}` },
        status: 302,
        location: account.invoicePdfUrl,
      },
    );
    const hiddenInvoice = await expectJson(
      `${input.baseUrl}/api/v1/billing/invoices/${account.hiddenInvoiceId}`,
      { headers: ownerHeaders, status: 404 },
    );
    assertErrorBody(
      hiddenInvoice,
      "invoice_not_found",
      "Invoice not found",
      "hidden invoice response",
    );
    const crossOrgInvoice = await expectJson(
      `${input.baseUrl}/api/v1/billing/invoices/${account.invoiceId}`,
      { headers: hiddenHeaders, status: 404 },
    );
    assertErrorBody(
      crossOrgInvoice,
      "invoice_not_found",
      "Invoice not found",
      "cross-org invoice response",
    );

    const offer = await expectJson(
      `${input.baseUrl}/api/v1/billing/save-offer`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          reason: "too_expensive",
          other_text: "local E2E",
        }),
      },
    );
    assertSaveOfferResponse(offer, {
      offer_type: "discount_20pct_1inv",
      discount_percent: 20,
    });

    const acceptedOffer = await expectJson(
      `${input.baseUrl}/api/v1/billing/save-offer`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          reason: "too_expensive",
          other_text: "local E2E accept path",
        }),
      },
    );
    assertSaveOfferResponse(acceptedOffer, {
      offer_type: "discount_20pct_1inv",
      discount_percent: 20,
    });
    const acceptedSubscription = await expectJson(
      `${input.baseUrl}/api/v1/billing/save-offer/${acceptedOffer.attempt_id}/accept`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assertSubscriptionContract(acceptedSubscription, {
      id: account.subscriptionId,
      organization_id: account.organizationId,
      stripe_customer_id: account.stripeCustomerId,
      stripe_subscription_id: account.stripeSubscriptionId,
      status: "active",
      cancel_at_period_end: false,
      money_back_claimed_at: null,
      money_back_refund_id: null,
    });
    await assertCancelAttempt(sql, {
      attemptId: acceptedOffer.attempt_id,
      organizationId: account.organizationId,
      offerAccepted: true,
    });

    await expectNoContent(
      `${input.baseUrl}/api/v1/billing/save-offer/${offer.attempt_id}/decline`,
      { method: "POST", headers: ownerHeaders, status: 204 },
    );
    await assertCancelAttempt(sql, {
      attemptId: offer.attempt_id,
      organizationId: account.organizationId,
      offerAccepted: false,
    });

    const cancel = await expectJson(
      `${input.baseUrl}/api/v1/billing/subscription/cancel`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          immediate: false,
          attempt_id: offer.attempt_id,
        }),
      },
    );
    assertSubscriptionContract(cancel, {
      id: account.subscriptionId,
      organization_id: account.organizationId,
      stripe_customer_id: account.stripeCustomerId,
      stripe_subscription_id: account.stripeSubscriptionId,
      status: "active",
      cancel_at_period_end: true,
      money_back_claimed_at: null,
      money_back_refund_id: null,
    });
    await assertSubscriptionCancelFlag(sql, {
      organizationId: account.organizationId,
      cancelAtPeriodEnd: true,
    });

    const resume = await expectJson(
      `${input.baseUrl}/api/v1/billing/subscription/resume`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assertSubscriptionContract(resume, {
      id: account.subscriptionId,
      organization_id: account.organizationId,
      stripe_customer_id: account.stripeCustomerId,
      stripe_subscription_id: account.stripeSubscriptionId,
      status: "active",
      cancel_at_period_end: false,
      money_back_claimed_at: null,
      money_back_refund_id: null,
    });
    await assertSubscriptionCancelFlag(sql, {
      organizationId: account.organizationId,
      cancelAtPeriodEnd: false,
    });

    const resumeNotCanceling = await expectJson(
      `${input.baseUrl}/api/v1/billing/subscription/resume`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 400,
      },
    );
    assertErrorBody(
      resumeNotCanceling,
      "subscription_not_paused_or_canceling",
      "Subscription is not paused or scheduled for cancellation",
      "resume non-canceling response",
    );
    const noAccessCancel = await expectJson(
      `${input.baseUrl}/api/v1/billing/subscription/cancel`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 400,
        body: JSON.stringify({ immediate: false }),
      },
    );
    assertErrorBody(
      noAccessCancel,
      "subscription_not_found",
      "No active subscription found",
      "no-access cancel response",
    );

    const createdCustomer = await expectJson(
      `${input.baseUrl}/api/v1/billing/customer`,
      { method: "POST", headers: noAccessHeaders, status: 201 },
    );
    assertBillingCustomer(createdCustomer, {
      idPrefix: "cus_stub_",
      email: account.noAccessOwnerEmail,
      name: account.noAccessOrganizationName,
    });
    await assertStripeCustomerId(sql, {
      organizationId: account.noAccessOrganizationId,
      customerId: createdCustomer.id,
    });

    const paymentMethods = await expectJson(
      `${input.baseUrl}/api/v1/billing/payment-methods`,
      { headers: ownerHeaders, status: 200 },
    );
    assertPaymentMethodsContract(paymentMethods);

    const setupIntent = await expectJson(
      `${input.baseUrl}/api/v1/billing/payment-methods/setup`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(
      setupIntent,
      { client_secret: "seti_local_secret" },
      "setup intent response",
    );

    const defaultMethod = await expectJson(
      `${input.baseUrl}/api/v1/billing/payment-methods/pm_local_backup/default`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(
      defaultMethod,
      { status: "success" },
      "default method response",
    );
    const foreignMethod = await expectJson(
      `${input.baseUrl}/api/v1/billing/payment-methods/pm_foreign/default`,
      { method: "POST", headers: ownerHeaders, status: 404 },
    );
    assertErrorBody(
      foreignMethod,
      "payment_method_not_found",
      "Payment method not found for customer",
      "foreign default method response",
    );
    const removedPaymentMethod = await expectJson(
      `${input.baseUrl}/api/v1/billing/payment-methods/pm_local_primary`,
      { method: "DELETE", headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(
      removedPaymentMethod,
      { status: "success" },
      "remove payment method response",
    );

    await expectJson(`${input.baseUrl}/api/v1/billing/plan-selection`, {
      method: "PUT",
      headers: ownerHeaders,
      status: 200,
      body: JSON.stringify({
        plan_id: "reconcile",
        billing_period: "annual",
        unit_count: 125,
        building_count: 2,
      }),
    });
    const checkout = await expectJson(
      `${input.baseUrl}/api/v1/billing/checkout`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          plan_id: "reconcile",
          billing_period: "annual",
          unit_count: 125,
          building_count: 2,
          success_url: "http://127.0.0.1:3000/billing/success",
          cancel_url: "http://127.0.0.1:3000/billing",
        }),
      },
    );
    assertCheckoutResponse(checkout, input.stripeApiBaseUrl);

    const checkoutSuccess = await expectJson(
      `${input.baseUrl}/api/v1/billing/checkout/success?session_id=${encodeURIComponent(checkout.session_id)}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(
      checkoutSuccess,
      {
        status: "success",
        subscription_id: "sub_checkout_1",
        customer_id: account.stripeCustomerId,
      },
      "checkout success response",
    );
    const checkoutMismatch = await expectJson(
      `${input.baseUrl}/api/v1/billing/checkout/success?session_id=cs_mismatch`,
      { headers: ownerHeaders, status: 403 },
    );
    assertErrorBody(
      checkoutMismatch,
      "checkout_session_org_mismatch",
      "Session does not belong to this organization",
      "checkout mismatch response",
    );

    const portal = await expectJson(
      `${input.baseUrl}/api/v1/billing/portal?return_url=${encodeURIComponent("http://127.0.0.1:3000/billing")}`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(
      portal,
      { url: `${input.stripeApiBaseUrl}/portal/session` },
      "portal response",
    );

    const guarantee = await expectJson(
      `${input.baseUrl}/api/v1/billing/guarantee/eligibility`,
      { headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(
      guarantee,
      {
        eligible: true,
        days_remaining: 29,
        first_invoice_amount: 120000,
        first_invoice_currency: "usd",
      },
      "guarantee eligibility response",
    );

    const refund = await expectJson(
      `${input.baseUrl}/api/v1/billing/guarantee/claim`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(
      refund,
      { refund_id: "re_local", amount_refunded: 1200, currency: "usd" },
      "guarantee refund response",
    );
    await assertGuaranteeClaim(sql, {
      organizationId: account.organizationId,
      refundId: "re_local",
    });

    const stripeCalls = input.stripeRequests.slice(stripeRequestStart);
    const cancelCall = findStripeCall(stripeCalls, {
      method: "POST",
      path: `/v1/subscriptions/${account.stripeSubscriptionId}`,
      params: { cancel_at_period_end: "true" },
    });
    const resumeCall = findStripeCall(stripeCalls, {
      method: "POST",
      path: `/v1/subscriptions/${account.stripeSubscriptionId}`,
      params: { cancel_at_period_end: "false" },
    });
    const guaranteeCancelCall = findStripeCall(stripeCalls, {
      method: "DELETE",
      path: `/v1/subscriptions/${account.stripeSubscriptionId}`,
      params: { prorate: "false", invoice_now: "false" },
    });
    const defaultPaymentMethodCall = findStripeCall(stripeCalls, {
      method: "POST",
      path: `/v1/customers/${account.stripeCustomerId}`,
      params: {
        "invoice_settings[default_payment_method]": "pm_local_backup",
      },
    });
    const detachPaymentMethodCall = stripeCalls.find(
      (request) =>
        request.method === "POST" &&
        request.path === "/v1/payment_methods/pm_local_primary/detach",
    );
    const checkoutCall = stripeCalls.find(
      (request) =>
        request.method === "POST" && request.path === "/v1/checkout/sessions",
    );
    const paymentMethodsListCall = findStripeQueryCall(stripeCalls, {
      method: "GET",
      path: "/v1/payment_methods",
      query: {
        customer: account.stripeCustomerId,
        type: "card",
      },
    });
    const setupIntentCall = findStripeCall(stripeCalls, {
      method: "POST",
      path: "/v1/setup_intents",
      params: {
        customer: account.stripeCustomerId,
        "payment_method_types[0]": "card",
      },
    });
    assert(cancelCall, "Stripe stub did not receive cancel request");
    assert(resumeCall, "Stripe stub did not receive resume request");
    assert(
      guaranteeCancelCall,
      "Stripe stub did not receive guarantee subscription deletion request",
    );
    assert(
      defaultPaymentMethodCall,
      "Stripe stub did not receive default payment method update",
    );
    assert(
      detachPaymentMethodCall,
      "Stripe stub did not receive payment method detach request",
    );
    assert(
      paymentMethodsListCall,
      "Stripe stub did not receive card payment method list request",
    );
    assert(setupIntentCall, "Stripe stub did not receive setup intent request");
    assert(
      findStripeCall(stripeCalls, {
        method: "POST",
        path: `/v1/subscriptions/${account.stripeSubscriptionId}`,
        params: { coupon: "coupon_local_save_20" },
      }),
      "Stripe stub did not receive save offer coupon request",
    );
    assert(checkoutCall, "Stripe stub did not receive checkout request");
    assertStripeParams(checkoutCall, {
      customer: account.stripeCustomerId,
      mode: "subscription",
      payment_method_collection: "if_required",
      "payment_method_types[0]": "card",
      success_url:
        "http://127.0.0.1:3000/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://127.0.0.1:3000/billing",
      "metadata[organization_id]": account.organizationId,
      "metadata[plan_id]": "reconcile",
      "metadata[pricing_model]": "per_unit",
      "metadata[building_count]": "2",
      "metadata[unit_count]": "125",
      "metadata[included_units]": "25",
      "metadata[unit_overage_count]": "100",
      "metadata[annual_total_cents]": "2289000",
      "metadata[app]": "capveri",
      "subscription_data[metadata][organization_id]": account.organizationId,
      "subscription_data[metadata][plan_id]": "reconcile",
      "subscription_data[metadata][annual_total_cents]": "2289000",
      "subscription_data[metadata][app]": "capveri",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": "2289000",
      "line_items[0][price_data][recurring][interval]": "year",
      "line_items[0][price_data][product_data][name]": "CapVeri Reconcile",
      "line_items[0][price_data][product_data][description]":
        "Annual Reconcile subscription for 125 rentable units",
      "line_items[0][quantity]": "1",
      allow_promotion_codes: "true",
    });
    assertStripeParams(portalStripeCall(stripeCalls), {
      customer: account.stripeCustomerId,
      return_url: "http://127.0.0.1:3000/billing",
    });
    assertStripeParams(refundStripeCall(stripeCalls), {
      payment_intent: "pi_local_guarantee",
    });
    assertStripeParamsAbsent(refundStripeCall(stripeCalls), ["amount"]);
    assert(
      refundStripeCall(stripeCalls),
      "Stripe stub did not receive refund request",
    );

    return {
      index: input.index,
      organization_id: account.organizationId,
      subscription_id: account.subscriptionId,
      invoice_id: account.invoiceId,
      stripe_calls: stripeCalls.length,
    };
  } finally {
    try {
      await cleanupBillingAccount(sql, {
        orgIds,
        userIds,
        emails,
        orgNames,
      });
      await assertCleanupComplete(sql, { orgIds, userIds, emails, orgNames });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

async function seedBillingAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ownerEmail = `billing-e2e-owner-${suffix}@capveri.local`;
  const hiddenOwnerEmail = `billing-e2e-hidden-${suffix}@capveri.local`;
  const noAccessOwnerEmail = `billing-e2e-no-access-${suffix}@capveri.local`;
  const organizationName = `Local Billing E2E Org ${suffix}`;
  const hiddenOrganizationName = `Local Billing Hidden Org ${suffix}`;
  const noAccessOrganizationName = `Local Billing No Access Org ${suffix}`;
  const createdAccounts = [];
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  try {
    const owner = await createLocalAuthUser({
      databaseUrl: input.databaseUrl,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: ownerEmail,
      password: `OwnerPass${input.index}A1!`,
      fullName: "Local Billing Owner",
      organizationName,
    });
    createdAccounts.push({ ...owner, email: ownerEmail, organizationName });
    const hiddenOwner = await createLocalAuthUser({
      databaseUrl: input.databaseUrl,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: hiddenOwnerEmail,
      password: `HiddenPass${input.index}A1!`,
      fullName: "Local Billing Hidden",
      organizationName: hiddenOrganizationName,
    });
    createdAccounts.push({
      ...hiddenOwner,
      email: hiddenOwnerEmail,
      organizationName: hiddenOrganizationName,
    });
    const noAccessOwner = await createLocalAuthUser({
      databaseUrl: input.databaseUrl,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: noAccessOwnerEmail,
      password: `NoAccessPass${input.index}A1!`,
      fullName: "Local Billing No Access",
      organizationName: noAccessOrganizationName,
    });
    createdAccounts.push({
      ...noAccessOwner,
      email: noAccessOwnerEmail,
      organizationName: noAccessOrganizationName,
    });

    const primary = await seedOrgBilling(sql, {
      organizationId: owner.signupOrganizationId,
      userId: owner.userId,
      organizationName,
      suffix,
      active: true,
    });
    const hidden = await seedOrgBilling(sql, {
      organizationId: hiddenOwner.signupOrganizationId,
      userId: hiddenOwner.userId,
      organizationName: hiddenOrganizationName,
      suffix: `hidden-${suffix}`,
      active: true,
    });
    const noAccess = await seedOrgBilling(sql, {
      organizationId: noAccessOwner.signupOrganizationId,
      userId: noAccessOwner.userId,
      organizationName: noAccessOrganizationName,
      suffix: `no-access-${suffix}`,
      active: false,
    });

    return {
      ownerEmail,
      ownerUserId: owner.userId,
      ownerToken: owner.accessToken,
      organizationId: owner.signupOrganizationId,
      organizationName,
      hiddenOwnerEmail,
      hiddenOwnerId: hiddenOwner.userId,
      hiddenOwnerToken: hiddenOwner.accessToken,
      hiddenOrganizationId: hiddenOwner.signupOrganizationId,
      hiddenOrganizationName,
      noAccessOwnerEmail,
      noAccessOwnerId: noAccessOwner.userId,
      noAccessOwnerToken: noAccessOwner.accessToken,
      noAccessOrganizationId: noAccessOwner.signupOrganizationId,
      noAccessOrganizationName,
      ...primary,
      hiddenInvoiceId: hidden.invoiceId,
      noAccessSubscriptionId: noAccess.subscriptionId,
    };
  } catch (error) {
    const cleanupInput = {
      orgIds: createdAccounts.map((account) => account.signupOrganizationId),
      userIds: createdAccounts.map((account) => account.userId),
      emails: [
        ownerEmail,
        hiddenOwnerEmail,
        noAccessOwnerEmail,
        ...createdAccounts.map((account) => account.email),
      ],
      orgNames: [
        organizationName,
        hiddenOrganizationName,
        noAccessOrganizationName,
        ...createdAccounts.map((account) => account.organizationName),
      ],
    };
    await cleanupBillingAccount(sql, cleanupInput);
    await assertCleanupComplete(sql, cleanupInput);
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedOrgBilling(sql, input) {
  await sql`
    update users
    set role = 'owner',
        full_name = 'Local Billing Owner',
        updated_at = now()
    where id = ${input.userId}
  `;
  await sql`
    update organizations
    set name = ${input.organizationName},
        subscription_status = ${input.active ? "active" : "trial"},
        updated_at = now()
    where id = ${input.organizationId}
  `;
  const subscriptionId = randomUUID();
  const invoiceId = randomUUID();
  const stripeSubscriptionId = `sub_local_${input.suffix.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const stripeCustomerId = `cus_local_${input.suffix.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const stripeInvoiceId = `in_local_${input.suffix.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const invoicePdfUrl = `https://billing.local/invoices/${invoiceId}.pdf`;

  await sql`
    insert into subscriptions (
      id, organization_id, stripe_subscription_id, stripe_customer_id, plan,
      tier, status, pricing_model, building_count, unit_count, included_units,
      unit_overage_count, billing_interval, current_period_start,
      current_period_end, cancel_at_period_end
    )
    values (
      ${subscriptionId},
      ${input.organizationId},
      ${input.active ? stripeSubscriptionId : null},
      ${input.active ? stripeCustomerId : null},
      'professional',
      'reconcile',
      ${input.active ? "active" : "trialing"},
      'per_unit',
      2,
      125,
      25,
      100,
      'annual',
      now() - interval '1 day',
      now() + interval '30 days',
      false
    )
  `;
  await sql`
    insert into invoices (
      id, organization_id, subscription_id, stripe_invoice_id, amount_due,
      amount_paid, currency, status, period_start, period_end, due_date,
      paid_at, pdf_url
    )
    values (
      ${invoiceId},
      ${input.organizationId},
      ${subscriptionId},
      ${stripeInvoiceId},
      120000,
      120000,
      'usd',
      'paid',
      now() - interval '30 days',
      now(),
      now(),
      now() - interval '1 day',
      ${invoicePdfUrl}
    )
  `;

  return {
    subscriptionId,
    invoiceId,
    stripeSubscriptionId,
    stripeCustomerId,
    stripeInvoiceId,
    invoicePdfUrl,
  };
}

async function createLocalAuthUser(input) {
  const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: {
        full_name: input.fullName,
        organization_name: input.organizationName,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(
      `Supabase signup failed for generated local user: ${safeJson(
        redactSensitiveJson(body),
      )}`,
    );
  }
  const userId = body.user?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    fail("Supabase signup response did not include user id.");
  }

  let signupOrganizationId;
  try {
    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        update auth.users
        set email_confirmed_at = coalesce(email_confirmed_at, now())
        where id = ${userId}
      `;
      const rows = await sql`
        select organization_id
        from users
        where id = ${userId}
        limit 1
      `;
      signupOrganizationId = rows[0]?.organization_id;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const accessToken =
      body.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: input.email,
        password: input.password,
      }));
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      fail("Supabase signup/sign-in did not return an access token.");
    }
    if (
      typeof signupOrganizationId !== "string" ||
      signupOrganizationId === ""
    ) {
      fail("Signup trigger did not create a public user organization.");
    }

    return { userId, accessToken, signupOrganizationId };
  } catch (error) {
    try {
      await cleanupPartialLocalAuthUser({
        databaseUrl: input.databaseUrl,
        userId,
        email: input.email,
        organizationName: input.organizationName,
        signupOrganizationId,
      });
    } catch (cleanupError) {
      console.error(
        `Partial signup cleanup failed: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        }`,
      );
    }
    throw error;
  }
}

async function cleanupBillingAccount(sql, input) {
  const cleanup = normalizedCleanupInput(input);
  await sql`
    delete from cancel_attempts
    where organization_id in ${sql(cleanup.orgIds)}
  `;
  await sql`
    delete from invoices
    where organization_id in ${sql(cleanup.orgIds)}
  `;
  await sql`
    delete from subscriptions
    where organization_id in ${sql(cleanup.orgIds)}
  `;
  await sql`
    delete from signup_email_events
    where organization_id in ${sql(cleanup.orgIds)}
       or user_id in ${sql(cleanup.userIds)}
       or email in ${sql(cleanup.emails)}
  `;
  await sql.begin(async (transaction) => {
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(cleanup.orgIds)}
         or user_id in ${transaction(cleanup.userIds)}
         or user_id in (
           select id
           from auth.users
           where email in ${transaction(cleanup.emails)}
         )
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
  });
  await sql`
    delete from audit_log
    where organization_id in ${sql(cleanup.orgIds)}
       or changed_by in ${sql(cleanup.userIds)}
  `;
  await sql`
    delete from users
    where id in ${sql(cleanup.userIds)}
       or email in ${sql(cleanup.emails)}
       or organization_id in ${sql(cleanup.orgIds)}
  `;
  await sql`
    delete from auth.users
    where id in ${sql(cleanup.userIds)}
       or email in ${sql(cleanup.emails)}
  `;
  await sql`
    delete from organizations
    where id in ${sql(cleanup.orgIds)}
       or name in ${sql(cleanup.orgNames)}
  `;
}

async function assertCleanupComplete(sql, input) {
  const cleanup = normalizedCleanupInput(input);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(cleanup.userIds)} or email in ${sql(cleanup.emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(cleanup.userIds)} or email in ${sql(cleanup.emails)} or organization_id in ${sql(cleanup.orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(cleanup.orgIds)} or name in ${sql(cleanup.orgNames)}) as org_count,
      (select count(*)::int from subscriptions where organization_id in ${sql(cleanup.orgIds)}) as subscription_count,
      (select count(*)::int from invoices where organization_id in ${sql(cleanup.orgIds)}) as invoice_count,
      (select count(*)::int from cancel_attempts where organization_id in ${sql(cleanup.orgIds)}) as cancel_attempt_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(cleanup.orgIds)} or user_id in ${sql(cleanup.userIds)} or email in ${sql(cleanup.emails)}) as signup_email_event_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(cleanup.orgIds)} or user_id in ${sql(cleanup.userIds)}) as legal_acceptance_count,
      (select count(*)::int from audit_log where organization_id in ${sql(cleanup.orgIds)} or changed_by in ${sql(cleanup.userIds)}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.subscription_count === 0, "cleanup left subscriptions");
  assert(row.invoice_count === 0, "cleanup left invoices");
  assert(row.cancel_attempt_count === 0, "cleanup left cancel attempts");
  assert(
    row.signup_email_event_count === 0,
    "cleanup left signup email events",
  );
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.audit_log_count === 0, "cleanup left audit log rows");
}

async function cleanupPartialLocalAuthUser(input) {
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  try {
    const publicRows = await sql`
      select id, organization_id
      from users
      where id = ${input.userId}
         or email = ${input.email}
    `;
    const authRows = await sql`
      select id
      from auth.users
      where id = ${input.userId}
         or email = ${input.email}
    `;
    const orgIds = [
      input.signupOrganizationId,
      ...publicRows.map((row) => row.organization_id),
    ].filter((id) => typeof id === "string" && id.length > 0);
    const userIds = [
      input.userId,
      ...publicRows.map((row) => row.id),
      ...authRows.map((row) => row.id),
    ].filter((id) => typeof id === "string" && id.length > 0);

    await cleanupBillingAccount(sql, {
      orgIds: [...new Set(orgIds)],
      userIds: [...new Set(userIds)],
      emails: [input.email],
      orgNames: [input.organizationName].filter(
        (name) => typeof name === "string" && name.length > 0,
      ),
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function normalizedCleanupInput(input) {
  return {
    orgIds: nonEmpty(input.orgIds, EMPTY_UUID),
    userIds: nonEmpty(input.userIds, EMPTY_UUID),
    emails: nonEmpty(input.emails, EMPTY_EMAIL),
    orgNames: nonEmpty(input.orgNames, EMPTY_ORG_NAME),
  };
}

function nonEmpty(values, fallback) {
  const normalized = [...new Set((values ?? []).filter(Boolean))];
  return normalized.length > 0 ? normalized : [fallback];
}

async function assertCancelAttempt(sql, input) {
  const rows = await sql`
    select offer_accepted
    from cancel_attempts
    where id = ${input.attemptId}
      and organization_id = ${input.organizationId}
    limit 1
  `;
  assert(rows.length === 1, "cancel attempt not persisted");
  assert(
    rows[0].offer_accepted === input.offerAccepted,
    "cancel attempt accepted flag mismatch",
  );
}

async function assertSubscriptionCancelFlag(sql, input) {
  const rows = await sql`
    select cancel_at_period_end
    from subscriptions
    where organization_id = ${input.organizationId}
    limit 1
  `;
  assert(
    rows[0]?.cancel_at_period_end === input.cancelAtPeriodEnd,
    "subscription cancel flag DB mismatch",
  );
}

async function assertStripeCustomerId(sql, input) {
  const rows = await sql`
    select stripe_customer_id
    from subscriptions
    where organization_id = ${input.organizationId}
    limit 1
  `;
  assert(
    rows[0]?.stripe_customer_id === input.customerId,
    "persisted Stripe customer id mismatch",
  );
}

async function assertGuaranteeClaim(sql, input) {
  const rows = await sql`
    select status, money_back_claimed_at, money_back_refund_id
    from subscriptions
    where organization_id = ${input.organizationId}
    limit 1
  `;
  assert(
    rows[0]?.status === "canceled",
    "guarantee did not cancel subscription",
  );
  assert(rows[0]?.money_back_claimed_at, "guarantee claim timestamp missing");
  assert(
    rows[0]?.money_back_refund_id === input.refundId,
    "guarantee refund id mismatch",
  );
}

async function signInWithPassword(input) {
  const url = new URL("/auth/v1/token", input.supabaseUrl);
  url.searchParams.set("grant_type", "password");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return undefined;
  }
  return body.access_token;
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
      "STRIPE_SECRET_KEY:sk_test_local_billing_e2e",
      "--var",
      `STRIPE_API_BASE_URL:${input.stripeApiBaseUrl}`,
      "--var",
      "STRIPE_SAVE_OFFER_COUPON_ID_ANNUAL:coupon_local_save_20",
      "--var",
      "POSTHOG_PROJECT_API_KEY:",
      "--var",
      "POSTHOG_HOST:http://127.0.0.1:9",
      "--var",
      "RESEND_API_KEY:",
    ],
    {
      cwd: process.cwd(),
      env: workerEnv(input),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  let childError;
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.once("error", (error) => {
    childError = error;
    output += `\nwrangler dev spawn error: ${errorMessage(error)}`;
  });
  child.once("exit", (code) => {
    if (code !== null && code !== 0) {
      output += `\nwrangler dev exited with ${code}`;
    }
  });
  const handle = {
    close: async () => {
      try {
        if (child.exitCode === null) {
          if (child.pid) await killProcessTree(child.pid);
          await new Promise((resolveClose) => {
            const timeout = setTimeout(resolveClose, 5000);
            child.once("exit", () => {
              clearTimeout(timeout);
              resolveClose();
            });
          });
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
    let closeError;
    try {
      await handle.close();
    } catch (cleanupError) {
      closeError = cleanupError;
    }
    if (closeError) {
      console.error(
        `Worker cleanup failed after startup failure: ${errorMessage(closeError)}`,
      );
    }
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-billing-e2e-"));
  const path = resolve(directory, ".dev.vars.local-billing-e2e");
  await writeFile(
    path,
    [
      "ENVIRONMENT=development",
      "NODE_ENV=development",
      "DB_ACCESS_MODE=direct-postgres",
      "DB_PRODUCTION_BOUNDARY=direct-postgres",
      `DATABASE_URL=${input.databaseUrl}`,
      `SUPABASE_URL=${input.supabaseUrl}`,
      `AUTH_JWKS_URL=${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      "STRIPE_SECRET_KEY=sk_test_local_billing_e2e",
      `STRIPE_API_BASE_URL=${input.stripeApiBaseUrl}`,
      "STRIPE_80OFF_COUPON_ID=coupon_local_80off",
      "STRIPE_FREE_AUDIT_COUPON_OFFER_50=coupon_local_audit_50",
      "STRIPE_FREE_AUDIT_COUPON_OFFER_FREE=coupon_local_audit_free",
      "STRIPE_SAVE_OFFER_COUPON_ID_ANNUAL=coupon_local_save_20",
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      "RESEND_API_KEY=",
      "OPENROUTER_API_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-billing-e2e-signing-secret",
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
    if (process.env[key]) env[key] = process.env[key];
  }
  env.ENVIRONMENT = "development";
  env.NODE_ENV = "development";
  env.DB_ACCESS_MODE = "direct-postgres";
  env.DB_PRODUCTION_BOUNDARY = "direct-postgres";
  env.DATABASE_URL = input.databaseUrl;
  env.SUPABASE_URL = input.supabaseUrl;
  env.AUTH_JWKS_URL = `${input.supabaseUrl}/auth/v1/.well-known/jwks.json`;
  env.STRIPE_SECRET_KEY = "sk_test_local_billing_e2e";
  env.STRIPE_API_BASE_URL = input.stripeApiBaseUrl;
  env.STRIPE_SAVE_OFFER_COUPON_ID_ANNUAL = "coupon_local_save_20";
  return env;
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

async function assertPortAvailable(baseUrl) {
  const url = new URL(baseUrl);
  if (await canConnect(url.hostname, Number(url.port))) {
    fail(`${baseUrl} already accepts TCP connections`);
  }
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
    await delay(500);
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await delay(250);
  }
  fail(`${baseUrl} still accepts TCP connections after close`);
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

async function startStripeStub(baseUrl) {
  const url = new URL(baseUrl);
  const requests = [];
  const checkoutSessions = new Map();
  const paymentMethodCustomers = new Map();
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/__local-stripe-stub/health") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    requests.push({
      method: request.method ?? "GET",
      path: requestUrl.pathname,
      search: requestUrl.search,
      body,
    });
    response.setHeader("content-type", "application/json");
    const method = request.method ?? "GET";
    const params = new URLSearchParams(body);
    if (method === "POST" && requestUrl.pathname === "/v1/customers") {
      response.end(
        JSON.stringify({
          id: `cus_stub_${requests.length}`,
          email: params.get("email") ?? "",
          name: params.get("name") ?? "",
          created: 1_786_000_000,
          invoice_settings: { default_payment_method: "pm_local_primary" },
        }),
      );
      return;
    }
    if (requestUrl.pathname.startsWith("/v1/customers/")) {
      const customerId = decodeURIComponent(
        requestUrl.pathname.split("/").at(-1) ?? "cus",
      );
      response.end(
        JSON.stringify({
          id: customerId,
          email: "billing-e2e@capveri.local",
          name: customerId.startsWith("cus_local_")
            ? "Local Billing E2E Org"
            : "Local Billing Created Org",
          created: 1_786_000_000,
          invoice_settings: {
            default_payment_method:
              params.get("invoice_settings[default_payment_method]") ??
              "pm_local_primary",
          },
        }),
      );
      return;
    }
    if (
      method === "GET" &&
      requestUrl.pathname === "/v1/payment_methods" &&
      requestUrl.searchParams.get("type") === "card"
    ) {
      const customerId = requestUrl.searchParams.get("customer") ?? "cus";
      paymentMethodCustomers.set("pm_local_primary", customerId);
      paymentMethodCustomers.set("pm_local_backup", customerId);
      response.end(
        JSON.stringify({
          data: [
            cardPaymentMethod("pm_local_primary", customerId, "visa", "4242"),
            cardPaymentMethod(
              "pm_local_backup",
              customerId,
              "mastercard",
              "4444",
            ),
          ],
        }),
      );
      return;
    }
    if (requestUrl.pathname.startsWith("/v1/payment_methods/")) {
      const parts = requestUrl.pathname.split("/");
      const paymentMethodId = decodeURIComponent(parts[3] ?? "pm");
      if (parts.at(-1) === "detach") {
        response.end(
          JSON.stringify({
            ...cardPaymentMethod(paymentMethodId, null, "visa", "4242"),
            customer: null,
          }),
        );
        return;
      }
      response.end(
        JSON.stringify(
          cardPaymentMethod(
            paymentMethodId,
            paymentMethodId === "pm_foreign"
              ? "cus_foreign"
              : (paymentMethodCustomers.get(paymentMethodId) ??
                  "cus_local_owner"),
            "visa",
            "4242",
          ),
        ),
      );
      return;
    }
    if (method === "POST" && requestUrl.pathname === "/v1/setup_intents") {
      response.end(
        JSON.stringify({
          id: "seti_local",
          client_secret: "seti_local_secret",
        }),
      );
      return;
    }
    if (method === "POST" && requestUrl.pathname === "/v1/checkout/sessions") {
      const sessionId = `cs_local_${checkoutSessions.size + 1}`;
      const session = {
        id: sessionId,
        url: `${baseUrl}/checkout/${sessionId}`,
        customer: params.get("customer") ?? "",
        subscription: `sub_checkout_${checkoutSessions.size + 1}`,
        metadata: {
          organization_id: params.get("metadata[organization_id]") ?? "",
        },
      };
      checkoutSessions.set(sessionId, session);
      response.end(JSON.stringify(session));
      return;
    }
    if (
      method === "GET" &&
      requestUrl.pathname.startsWith("/v1/checkout/sessions/")
    ) {
      const sessionId = decodeURIComponent(
        requestUrl.pathname.split("/").at(-1) ?? "",
      );
      if (sessionId === "cs_mismatch") {
        response.end(
          JSON.stringify({
            id: sessionId,
            customer: "cus_mismatch",
            subscription: "sub_mismatch",
            metadata: {
              organization_id: "00000000-0000-4000-8000-000000000000",
            },
          }),
        );
        return;
      }
      response.end(
        JSON.stringify(
          checkoutSessions.get(sessionId) ?? {
            id: sessionId,
            customer: "",
            subscription: "",
            metadata: {},
          },
        ),
      );
      return;
    }
    if (
      method === "POST" &&
      requestUrl.pathname === "/v1/billing_portal/sessions"
    ) {
      response.end(
        JSON.stringify({
          id: "bps_local",
          url: `${baseUrl}/portal/session`,
        }),
      );
      return;
    }
    if (method === "GET" && requestUrl.pathname.startsWith("/v1/invoices/")) {
      response.end(
        JSON.stringify({
          id: decodeURIComponent(requestUrl.pathname.split("/").at(-1) ?? "in"),
          payment_intent: "pi_local_guarantee",
        }),
      );
      return;
    }
    if (method === "POST" && requestUrl.pathname === "/v1/refunds") {
      response.end(
        JSON.stringify({
          id: "re_local",
          amount: 120000,
          currency: "usd",
        }),
      );
      return;
    }
    if (requestUrl.pathname.startsWith("/v1/subscriptions/")) {
      response.end(
        JSON.stringify({
          id: decodeURIComponent(
            requestUrl.pathname.split("/").at(-1) ?? "sub",
          ),
          status: "active",
          cancel_at_period_end: body.includes("cancel_at_period_end=true"),
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "unhandled local Stripe stub path" }));
  });
  await new Promise((resolveListen) => {
    server.listen(Number(url.port), url.hostname, resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Stripe stub did not listen");
  return {
    requests,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }
          resolveClose();
        });
      }),
  };
}

function cardPaymentMethod(id, customerId, brand, last4) {
  return {
    id,
    customer: customerId,
    card: {
      brand,
      last4,
      exp_month: 12,
      exp_year: 2031,
    },
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//i.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }
      fail(`Unexpected argument: ${arg}`);
    }
    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split("=", 2);
    if (!key) {
      fail(`Invalid argument: ${arg}`);
    }
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive integer`);
  }
  return value;
}

async function readEnvValue(path, names) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  for (const name of names) {
    const line = content
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().startsWith(`${name}=`));
    if (!line) {
      continue;
    }
    const value = line.slice(line.indexOf("=") + 1).trim();
    return value.replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

function normalizedLocalUrl(rawUrl, label) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:") {
    fail(`${label} must use http for local-only E2E`);
  }
  if (url.username || url.password) {
    fail(`${label} must not include credentials`);
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  if (label === "stripe-api-base-url" && !url.port) {
    fail(`${label} must include an explicit loopback port`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizedLocalSupabaseUrl(rawUrl) {
  const value = normalizedLocalUrl(rawUrl, "supabase-url");
  const url = new URL(value);
  if (url.port !== "54321") {
    fail("supabase-url must use the local Supabase API port 54321");
  }
  if (url.pathname !== "/") {
    fail("supabase-url must not include a path");
  }
  return value;
}

function normalizedLocalDatabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("database-url must be a valid Postgres URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must use postgres or postgresql");
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail("database-url must point at localhost or loopback");
  }
  if (url.port !== "54322") {
    fail("database-url must point at local Supabase Postgres on port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must use the local Supabase /postgres database");
  }
  return url.toString();
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  const text = await response.text();
  const body = parseJsonResponse(text, url);
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

async function expectNoContent(url, options = {}) {
  const { status = 204, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  if (response.status !== status) {
    const text = await response.text();
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
}

async function expectRedirect(url, options = {}) {
  const { status, location, headers = {} } = options;
  const response = await fetch(url, { headers, redirect: "manual" }).catch(
    (error) => {
      fail(
        `GET ${url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  if (response.status !== status) {
    fail(`GET ${url} returned ${response.status}, expected ${status}`);
  }
  assert(response.headers.get("location") === location, "redirect mismatch");
}

function parseJsonResponse(text, url) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON from ${url}, received: ${text.slice(0, 500)}`);
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function findStripeCall(calls, expected) {
  return calls.find((request) => {
    if (request.method !== expected.method || request.path !== expected.path) {
      return false;
    }
    const form = new URLSearchParams(request.body);
    return Object.entries(expected.params ?? {}).every(
      ([key, value]) => form.get(key) === value,
    );
  });
}

function findStripeQueryCall(calls, expected) {
  return calls.find((request) => {
    if (request.method !== expected.method || request.path !== expected.path) {
      return false;
    }
    const query = new URLSearchParams(request.search);
    return Object.entries(expected.query ?? {}).every(
      ([key, value]) => query.get(key) === value,
    );
  });
}

function assertBillingCustomer(actual, expected) {
  assertAllowedKeys(
    actual,
    ["id", "email", "name", "created"],
    "billing customer",
  );
  if (expected.id) {
    assert(actual.id === expected.id, "billing customer id mismatch");
  }
  if (expected.idPrefix) {
    assert(
      actual.id.startsWith(expected.idPrefix),
      "billing customer id prefix mismatch",
    );
  }
  assert(actual.email === expected.email, "billing customer email mismatch");
  assert(actual.name === expected.name, "billing customer name mismatch");
  assert(
    typeof actual.created === "number",
    "billing customer created mismatch",
  );
}

function assertSubscriptionContract(actual, expected) {
  assertAllowedKeys(
    actual,
    [
      "id",
      "organization_id",
      "plan",
      "status",
      "pricing_model",
      "building_count",
      "unit_count",
      "included_units",
      "unit_overage_count",
      "tier",
      "billing_interval",
      "stripe_customer_id",
      "stripe_subscription_id",
      "current_period_start",
      "current_period_end",
      "cancel_at_period_end",
      "created_at",
      "updated_at",
      "money_back_claimed_at",
      "money_back_refund_id",
    ],
    "subscription response",
  );
  assert(actual.id === expected.id, "subscription id mismatch");
  assert(
    actual.organization_id === expected.organization_id,
    "subscription organization mismatch",
  );
  assert(actual.plan === "professional", "subscription plan mismatch");
  assert(actual.status === expected.status, "subscription status mismatch");
  assert(actual.pricing_model === "per_unit", "subscription pricing mismatch");
  assert(actual.building_count === 2, "subscription building count mismatch");
  assert(actual.unit_count === 125, "subscription unit count mismatch");
  assert(actual.included_units === 25, "subscription included units mismatch");
  assert(actual.unit_overage_count === 100, "subscription overage mismatch");
  assert(actual.tier === "reconcile", "subscription tier mismatch");
  assert(
    actual.billing_interval === "annual",
    "subscription interval mismatch",
  );
  assert(
    actual.stripe_customer_id === expected.stripe_customer_id,
    "subscription customer mismatch",
  );
  assert(
    actual.stripe_subscription_id === expected.stripe_subscription_id,
    "subscription Stripe id mismatch",
  );
  assertIsoTimestamp(actual.current_period_start, "subscription period start");
  assertIsoTimestamp(actual.current_period_end, "subscription period end");
  assert(
    actual.cancel_at_period_end === expected.cancel_at_period_end,
    "subscription cancel flag mismatch",
  );
  assertIsoTimestamp(actual.created_at, "subscription created_at");
  assertIsoTimestamp(actual.updated_at, "subscription updated_at");
  if (expected.money_back_claimed_at === null) {
    assert(
      actual.money_back_claimed_at === null,
      "subscription money_back_claimed_at mismatch",
    );
  } else {
    assertIsoTimestamp(
      actual.money_back_claimed_at,
      "subscription money_back_claimed_at",
    );
  }
  assert(
    actual.money_back_refund_id === expected.money_back_refund_id,
    "subscription money_back_refund_id mismatch",
  );
}

function assertInvoiceList(actual, expected) {
  assertAllowedKeys(
    actual,
    ["invoices", "total", "page", "per_page", "has_more"],
    "invoice list response",
  );
  assert(
    Array.isArray(actual.invoices),
    "invoice list should contain invoices",
  );
  assert(actual.total === expected.total, "invoice total mismatch");
  assert(actual.page === expected.page, "invoice page mismatch");
  assert(actual.per_page === expected.per_page, "invoice per_page mismatch");
  assert(actual.has_more === false, "invoice has_more mismatch");
  assert(
    actual.invoices.length === expected.expectedInvoiceIds.length,
    "invoice list length mismatch",
  );
  for (const [index, invoiceId] of expected.expectedInvoiceIds.entries()) {
    assert(
      actual.invoices[index]?.id === invoiceId,
      `invoice list id mismatch at ${index}`,
    );
  }
}

function assertInvoiceContract(actual, expected) {
  assertAllowedKeys(
    actual,
    [
      "id",
      "organization_id",
      "subscription_id",
      "stripe_invoice_id",
      "amount_due",
      "amount_paid",
      "currency",
      "status",
      "period_start",
      "period_end",
      "due_date",
      "paid_at",
      "pdf_url",
      "created_at",
    ],
    "invoice response",
  );
  assert(actual.id === expected.id, "invoice id mismatch");
  assert(
    actual.organization_id === expected.organization_id,
    "invoice org mismatch",
  );
  assert(
    actual.subscription_id === expected.subscription_id,
    "invoice subscription mismatch",
  );
  assert(
    actual.stripe_invoice_id === expected.stripe_invoice_id,
    "invoice Stripe id mismatch",
  );
  assert(actual.amount_due === 120000, "invoice amount_due mismatch");
  assert(actual.amount_paid === 120000, "invoice amount_paid mismatch");
  assert(actual.currency === "usd", "invoice currency mismatch");
  assert(actual.status === "paid", "invoice status mismatch");
  assertIsoTimestamp(actual.period_start, "invoice period_start");
  assertIsoTimestamp(actual.period_end, "invoice period_end");
  assertIsoTimestamp(actual.due_date, "invoice due_date");
  assertIsoTimestamp(actual.paid_at, "invoice paid_at");
  assert(actual.pdf_url === expected.pdf_url, "invoice pdf_url mismatch");
  assertIsoTimestamp(actual.created_at, "invoice created_at");
}

function assertSaveOfferResponse(actual, expected) {
  assertAllowedKeys(
    actual,
    ["attempt_id", "offer_type", "discount_percent"],
    "save offer response",
  );
  assert(isUuid(actual.attempt_id), "save offer attempt id missing");
  assert(actual.offer_type === expected.offer_type, "save offer type mismatch");
  assert(
    actual.discount_percent === expected.discount_percent,
    "save offer discount mismatch",
  );
}

function assertCheckoutResponse(actual, stripeApiBaseUrl) {
  assertAllowedKeys(
    actual,
    ["checkout_url", "session_id"],
    "checkout response",
  );
  assert(
    actual.checkout_url.startsWith(`${stripeApiBaseUrl}/checkout/`),
    "checkout URL mismatch",
  );
  assert(
    typeof actual.session_id === "string" && actual.session_id !== "",
    "checkout session id missing",
  );
}

function assertErrorBody(body, code, message, label) {
  assertJsonEqual(body, { detail: message, error: { code, message } }, label);
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertAllowedKeys(actual, expectedKeys, label) {
  assert(actual && typeof actual === "object", `${label} missing`);
  const actualKeys = Object.keys(actual).sort();
  const expected = [...expectedKeys].sort();
  assert(
    JSON.stringify(actualKeys) === JSON.stringify(expected),
    `${label} keys mismatch: expected ${expected.join(",")}, got ${actualKeys.join(",")}`,
  );
}

function assertIsoTimestamp(value, label) {
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      Number.isFinite(Date.parse(value)),
    `${label} should be an ISO timestamp`,
  );
}

function assertPaymentMethodsContract(actual) {
  assert(Array.isArray(actual), "payment methods response should be an array");
  const expected = [
    {
      id: "pm_local_primary",
      brand: "visa",
      last4: "4242",
      exp_month: 12,
      exp_year: 2031,
      is_default: true,
    },
    {
      id: "pm_local_backup",
      brand: "mastercard",
      last4: "4444",
      exp_month: 12,
      exp_year: 2031,
      is_default: false,
    },
  ];
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `payment methods response mismatch: ${JSON.stringify(actual)}`,
  );
}

function portalStripeCall(calls) {
  const call = findStripeCall(calls, {
    method: "POST",
    path: "/v1/billing_portal/sessions",
    params: {},
  });
  assert(call, "Stripe stub did not receive portal session request");
  return call;
}

function refundStripeCall(calls) {
  return findStripeCall(calls, {
    method: "POST",
    path: "/v1/refunds",
    params: {},
  });
}

function assertStripeParams(request, expected) {
  assert(request, "Stripe request missing");
  const form = new URLSearchParams(request.body);
  for (const [key, value] of Object.entries(expected)) {
    assert(
      form.get(key) === value,
      `Stripe ${request.path} param ${key} mismatch: expected ${value}, got ${form.get(key)}`,
    );
  }
}

function assertStripeParamsAbsent(request, keys) {
  assert(request, "Stripe request missing");
  const form = new URLSearchParams(request.body);
  for (const key of keys) {
    assert(
      !form.has(key),
      `Stripe ${request.path} unexpectedly sent ${key}=${form.get(key)}`,
    );
  }
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}

function redactSensitiveJson(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (
          /token|password|refresh|authorization|apikey|api_key|secret/iu.test(
            key,
          )
        ) {
          return [key, "[REDACTED]"];
        }
        return [key, redactSensitiveJson(entry)];
      }),
    );
  }
  return value;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
