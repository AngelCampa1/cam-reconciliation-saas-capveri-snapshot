import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ResendContentDownloadEmailSender,
  ResendTeamInvitationEmailSender,
  ResendTeamWelcomeEmailSender,
  ResendTenantInvitationEmailSender,
  ResendWelcomeEmailSender,
  resendApiBaseUrl,
} from "../adapters/email/resend";
import {
  renderTrialEmail,
  renderTrialEmailText,
  trialEmailSubject,
} from "../http/stripe-webhook-routes";
import type { AppEnv } from "../env";

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_ADDRESS: "Angel Campa <angel.campa@capveri.com>",
    MARKETING_BASE_URL: "https://www.capveri.com",
    UNSUBSCRIBE_HMAC_SECRET: "unsubscribe-secret",
  } as unknown as AppEnv;
}

let capturedBody: Record<string, unknown> | null;

beforeEach(() => {
  capturedBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("styled content download email", () => {
  it("renders the branded card with a pill CTA and no 'free audit' copy", async () => {
    await new ResendContentDownloadEmailSender(env()).sendContentDownload({
      toEmail: "jane@example.com",
      firstName: "Jane",
      assetName: "CAM Reconciliation Review Checklist",
      downloadUrl: "https://app.capveri.com/api/v1/leads/download/tok",
      unsubscribeUrl: "https://www.capveri.com/unsubscribe?e=abc&t=def",
      registerUrl: "https://app.capveri.com/auth/register",
    });

    const html = String(capturedBody?.html);
    const text = String(capturedBody?.text);

    // Branded layout is applied (was previously bare unstyled HTML).
    expect(html).toContain("https://www.capveri.com/email-logo.png");
    expect(html).toContain("background-color: #304476"); // brand header + pill
    expect(html).toContain("border-radius: 9999px"); // pill CTA button
    expect(html).toContain("Download CAM Reconciliation Review Checklist");

    // Footer unsubscribe link is present.
    expect(html).toContain(
      "https://www.capveri.com/unsubscribe?e=abc&amp;t=def",
    );
    expect(html).toContain("Unsubscribe");

    // CTA copy uses the trial offer, never "audit".
    expect(html).toContain("Start a 30-day trial");
    expect(html.toLowerCase()).not.toContain("free audit");
    expect(text).toContain("Start a 30-day trial");
    expect(text.toLowerCase()).not.toContain("free audit");
  });

  it("escapes user-controlled asset names to prevent HTML injection", async () => {
    await new ResendContentDownloadEmailSender(env()).sendContentDownload({
      toEmail: "jane@example.com",
      firstName: "Jane",
      assetName: '<script>alert(1)</script>"><img src=x>',
      downloadUrl: "https://app.capveri.com/api/v1/leads/download/tok",
      unsubscribeUrl: "https://www.capveri.com/unsubscribe?e=abc&t=def",
      registerUrl: "https://app.capveri.com/auth/register",
    });

    const html = String(capturedBody?.html);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('"><img src=x>');
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("styled team invitation email", () => {
  it("renders the branded card with a pill accept button", async () => {
    await new ResendTeamInvitationEmailSender(env()).sendTeamInvitation({
      toEmail: "jane@example.com",
      invitationToken: "tok",
      organizationName: "Example Co",
      role: "member",
      inviterName: "Angel",
      expiresAt: "2026-07-01",
      signupUrl: "https://app.capveri.com/invite/tok",
    });

    const html = String(capturedBody?.html);
    const text = String(capturedBody?.text);
    expect(html).toContain("https://www.capveri.com/email-logo.png");
    expect(html).toContain("border-radius: 9999px");
    expect(html).toContain("Join the team");
    expect(text).toContain("Join the team:");
    expect(html).toContain("Angel invited you to CapVeri");
    expect(html).toContain("/unsubscribe?e=");
    expect(capturedBody?.headers).toMatchObject({
      "List-Unsubscribe": expect.stringContaining("/unsubscribe?e="),
    });
    expect(capturedBody?.headers).not.toHaveProperty("List-Unsubscribe-Post");
  });
});

describe("styled tenant invitation email", () => {
  it("frames the invite around the tenant's CAM statement, not a product sign-up", async () => {
    await new ResendTenantInvitationEmailSender(env()).sendTenantInvitation({
      toEmail: "tenant@example.com",
      invitationToken: "tok",
      expiresAt: "2026-07-01",
      signupUrl: "https://app.capveri.com/tenant/invite/tok",
    });

    const html = String(capturedBody?.html);
    const text = String(capturedBody?.text);
    expect(html).toContain("Your CAM statement is ready to view");
    expect(html).toContain("Your landlord shares your CAM statement");
    expect(html).toContain("View my statement");
    expect(text).toContain("View my statement:");
    // Must NOT read like a generic product sign-up (old phishing-like framing).
    expect(html).not.toContain("You have been invited to CapVeri");
    expect(html).not.toContain("Accept invitation");
  });
});

describe("styled team welcome email", () => {
  it("greets the member without a raw role label or a non-existent setup step", async () => {
    await new ResendTeamWelcomeEmailSender(env()).sendTeamWelcome({
      toEmail: "member@example.com",
      fullName: "Jane Doe",
      organizationName: "Example Co",
      role: "member",
      dashboardUrl: "https://app.capveri.com/dashboard",
    });

    const html = String(capturedBody?.html);
    const text = String(capturedBody?.text);
    expect(html).toContain("Hi Jane Doe, your account is ready.");
    expect(html).toContain("Open CapVeri to get started.");
    expect(text).toContain("Open CapVeri to get started.");
    // The awkward "your member account is ready" phrasing is gone.
    expect(html).not.toContain("member account is ready");
    // Members have no setup steps, so the old dashboard "setup step" copy is gone.
    expect(html).not.toContain("next setup step");
  });
});

describe("styled welcome email", () => {
  it("states the next funnel step and includes unsubscribe controls", async () => {
    await new ResendWelcomeEmailSender(env()).sendWelcomeEmail({
      toEmail: "owner@example.com",
      organizationName: "Example Co",
      dashboardUrl:
        "https://app.capveri.com/settings/billing?intent=select-plan&source=signup",
    });

    const html = String(capturedBody?.html);
    const text = String(capturedBody?.text);

    expect(html).toContain("Start your plan");
    expect(html).toContain("Then add one property");
    expect(html).toContain("border-radius: 9999px");
    expect(html).toContain("/unsubscribe?e=");
    expect(text).toContain("Start your plan:");
    expect(text).toContain("Unsubscribe:");
    expect(capturedBody?.headers).toMatchObject({
      "List-Unsubscribe": expect.stringContaining("/unsubscribe?e="),
    });
    expect(capturedBody?.headers).not.toHaveProperty("List-Unsubscribe-Post");
  });
});

describe("Resend API base URL", () => {
  it("allows a loopback override outside production only", () => {
    expect(
      resendApiBaseUrl({
        ENVIRONMENT: "development",
        RESEND_API_BASE_URL: "http://127.0.0.1:8799/resend/",
      } as unknown as AppEnv),
    ).toBe("http://127.0.0.1:8799/resend");
    expect(
      resendApiBaseUrl({
        ENVIRONMENT: "production",
        RESEND_API_BASE_URL: "http://127.0.0.1:8799/resend",
      } as unknown as AppEnv),
    ).toBe("https://api.resend.com");
    expect(
      resendApiBaseUrl({
        ENVIRONMENT: "development",
        RESEND_API_BASE_URL: "https://example.com/resend",
      } as unknown as AppEnv),
    ).toBe("https://api.resend.com");
  });
});

describe("trial lifecycle emails", () => {
  function trialPayload(
    overrides: Partial<Parameters<typeof renderTrialEmail>[1]> = {},
  ): Parameters<typeof renderTrialEmail>[1] {
    return {
      emailType: "trial_started",
      toEmail: "jane@example.com",
      organizationName: "Acme Properties",
      trialStart: new Date("2026-01-01T00:00:00Z"),
      chargeDate: new Date("2026-01-31T00:00:00Z"),
      chargeAmountFormatted: "$1,200.00/year",
      billingUrl: "https://app.capveri.com/settings/billing",
      unsubscribeUrl: "https://www.capveri.com/unsubscribe?e=abc&t=def",
      ...overrides,
    };
  }

  it("renders the started email with a pill 'Add payment method' CTA", () => {
    const html = renderTrialEmail(env(), trialPayload());
    const text = renderTrialEmailText(trialPayload());

    expect(trialEmailSubject("trial_started")).toBe(
      "Your CapVeri free trial has started",
    );
    expect(html).toContain("Your CapVeri free trial is live");
    expect(html).toContain("border-radius: 9999px"); // pill CTA button
    expect(html).toContain("Add payment method");
    expect(html).toContain("Your plan: <strong>$1,200.00/year</strong>.");
    expect(text).toContain("Add payment method:");
    // No stale "See billing" CTA or "trial ends in 3 days" claim.
    expect(html).not.toContain("See billing");
    expect(html).not.toContain("3 days");
  });

  it("keeps 'ends soon' framing for the ending-soon email, never a hardcoded day count", () => {
    expect(trialEmailSubject("trial_ending_soon")).toBe(
      "Your CapVeri free trial ends soon",
    );
    const html = renderTrialEmail(
      env(),
      trialPayload({ emailType: "trial_ending_soon" }),
    );
    expect(html).toContain("Your CapVeri free trial ends soon");
    expect(html).not.toContain("3 days");
  });

  it("uses plain 'account is now on hold' copy for the paused email, not jargon", () => {
    const html = renderTrialEmail(
      env(),
      trialPayload({ emailType: "trial_paused" }),
    );
    const text = renderTrialEmailText(
      trialPayload({ emailType: "trial_paused" }),
    );
    expect(html).toContain("Your account is now on hold.");
    expect(html).toContain("Add a payment method to turn it back on.");
    expect(html).not.toContain("workspace");
    expect(html).not.toContain("was on file");
    expect(text).toContain("Your account is now on hold.");
    expect(text).toContain("Add a payment method to turn it back on.");
    expect(text).toContain("Your plan: $1,200.00/year.");
  });

  it("renders 'Custom pricing' as a grammatical sentence, never 'will be Custom pricing once'", () => {
    const custom = trialPayload({ chargeAmountFormatted: "Custom pricing" });
    const startedHtml = renderTrialEmail(env(), custom);
    const pausedText = renderTrialEmailText({
      ...custom,
      emailType: "trial_paused",
    });

    // The "Your plan: X." shape reads correctly for a non-dollar amount.
    expect(startedHtml).toContain(
      "Your plan: <strong>Custom pricing</strong>.",
    );
    expect(pausedText).toContain("Your plan: Custom pricing.");
    // Old broken phrasings must not return.
    expect(startedHtml).not.toContain(
      "will be <strong>Custom pricing</strong>",
    );
    expect(pausedText).not.toContain("continues at Custom pricing");
  });
});
