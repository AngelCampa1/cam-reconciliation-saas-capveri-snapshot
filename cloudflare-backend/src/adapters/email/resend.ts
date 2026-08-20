import type { AppEnv } from "../../env";
import { buildUnsubscribeToken } from "../../domain/leads/tokens";
import { ConfigError, requireRuntimeSecret } from "../../platform/cloudflare";
import {
  dataTable,
  divider,
  escapeAttr,
  escapeHtml,
  heading,
  paragraph,
  pillButton,
  renderEmailShell,
} from "./layout";

const DEFAULT_MARKETING_BASE_URL = "https://www.capveri.com";
const DEFAULT_RESEND_API_BASE_URL = "https://api.resend.com";

function marketingBaseUrl(env: AppEnv): string {
  const value = env.MARKETING_BASE_URL;
  return typeof value === "string" && value.trim() !== ""
    ? value
    : DEFAULT_MARKETING_BASE_URL;
}

export type ContactNotification = {
  adminEmail: string;
  name: string;
  email: string;
  inquiryType: string;
  company: string | null;
  phone: string | null;
  message: string | null;
};

export type ContactNotificationSender = {
  sendContactNotification(input: ContactNotification): Promise<void>;
};

export type ContentDownloadEmail = {
  toEmail: string;
  firstName: string;
  assetName: string;
  downloadUrl: string;
  unsubscribeUrl: string;
  registerUrl: string;
};

export type ContentDownloadEmailSender = {
  sendContentDownload(input: ContentDownloadEmail): Promise<void>;
};

export type WelcomeEmail = {
  toEmail: string;
  organizationName: string;
  dashboardUrl: string;
  unsubscribeUrl?: string;
};

export type WelcomeEmailSender = {
  sendWelcomeEmail(input: WelcomeEmail): Promise<void>;
};

export type FeedbackNotification = {
  adminEmail: string;
  feedbackType: string;
  message: string;
  pageUrl: string;
  userEmail: string;
  userId: string;
  organizationId: string;
  screenshotUrl?: string | null;
};

export type FeedbackNotificationSender = {
  sendFeedbackNotification(input: FeedbackNotification): Promise<void>;
};

export type TeamInvitationEmail = {
  toEmail: string;
  invitationToken: string;
  organizationName: string;
  role: string;
  inviterName: string | null;
  expiresAt: string;
  signupUrl: string;
  unsubscribeUrl?: string;
};

export type TeamInvitationEmailSender = {
  sendTeamInvitation(input: TeamInvitationEmail): Promise<void>;
};

export type TeamWelcomeEmail = {
  toEmail: string;
  fullName: string;
  organizationName: string;
  role: string;
  dashboardUrl: string;
  unsubscribeUrl?: string;
};

export type TeamWelcomeEmailSender = {
  sendTeamWelcome(input: TeamWelcomeEmail): Promise<void>;
};

export type TenantInvitationEmail = {
  toEmail: string;
  invitationToken: string;
  expiresAt: string;
  signupUrl: string;
  unsubscribeUrl?: string;
};

export type TenantInvitationEmailSender = {
  sendTenantInvitation(input: TenantInvitationEmail): Promise<void>;
};

export class ResendContactNotificationSender implements ContactNotificationSender {
  constructor(private readonly env: AppEnv) {}

  async sendContactNotification(input: ContactNotification): Promise<void> {
    const response = await fetch(`${resendApiBaseUrl(this.env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireRuntimeSecret(this.env, "RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: requireBinding(
          this.env.RESEND_FROM_ADDRESS,
          "RESEND_FROM_ADDRESS",
        ),
        to: [input.adminEmail],
        reply_to: [input.email],
        subject: `New CapVeri contact request: ${input.inquiryType}`,
        html: renderContactNotification(input, marketingBaseUrl(this.env)),
        text: renderContactNotificationText(input),
      }),
    });

    if (!response.ok) {
      throw new Error("Resend contact notification failed");
    }
  }
}

export class ResendContentDownloadEmailSender implements ContentDownloadEmailSender {
  constructor(private readonly env: AppEnv) {}

  async sendContentDownload(input: ContentDownloadEmail): Promise<void> {
    const response = await fetch(`${resendApiBaseUrl(this.env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireRuntimeSecret(this.env, "RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: requireBinding(
          this.env.RESEND_FROM_ADDRESS,
          "RESEND_FROM_ADDRESS",
        ),
        to: [input.toEmail],
        subject: `Your ${input.assetName} is ready`,
        html: renderContentDownload(input, marketingBaseUrl(this.env)),
        text: renderContentDownloadText(input),
        headers: {
          "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Resend content download email failed");
    }
  }
}

export class ResendWelcomeEmailSender implements WelcomeEmailSender {
  constructor(private readonly env: AppEnv) {}

  async sendWelcomeEmail(input: WelcomeEmail): Promise<void> {
    const unsubscribeUrl = await unsubscribeUrlForEmail(
      this.env,
      input.toEmail,
    );
    const response = await fetch(`${resendApiBaseUrl(this.env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireRuntimeSecret(this.env, "RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: requireBinding(
          this.env.RESEND_FROM_ADDRESS,
          "RESEND_FROM_ADDRESS",
        ),
        to: [input.toEmail],
        subject: `Welcome to ${input.organizationName} on CapVeri`,
        html: renderWelcomeEmail(
          { ...input, unsubscribeUrl },
          marketingBaseUrl(this.env),
        ),
        text: renderWelcomeEmailText({ ...input, unsubscribeUrl }),
        headers: marketingUnsubscribeHeaders(unsubscribeUrl),
      }),
    });

    if (!response.ok) {
      throw new Error("Resend welcome email failed");
    }
  }
}

export class ResendFeedbackNotificationSender implements FeedbackNotificationSender {
  constructor(private readonly env: AppEnv) {}

  async sendFeedbackNotification(input: FeedbackNotification): Promise<void> {
    const response = await fetch(`${resendApiBaseUrl(this.env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireRuntimeSecret(this.env, "RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: requireBinding(
          this.env.RESEND_FROM_ADDRESS,
          "RESEND_FROM_ADDRESS",
        ),
        to: [input.adminEmail],
        reply_to: [input.userEmail],
        subject: `New CapVeri feedback: ${input.feedbackType}`,
        html: renderFeedbackNotification(input, marketingBaseUrl(this.env)),
        text: renderFeedbackNotificationText(input),
      }),
    });

    if (!response.ok) {
      throw new Error("Resend feedback notification failed");
    }
  }
}

export class ResendTeamInvitationEmailSender implements TeamInvitationEmailSender {
  constructor(private readonly env: AppEnv) {}

  async sendTeamInvitation(input: TeamInvitationEmail): Promise<void> {
    const unsubscribeUrl = await unsubscribeUrlForEmail(
      this.env,
      input.toEmail,
    );
    const response = await fetch(`${resendApiBaseUrl(this.env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireRuntimeSecret(this.env, "RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: requireBinding(
          this.env.RESEND_FROM_ADDRESS,
          "RESEND_FROM_ADDRESS",
        ),
        to: [input.toEmail],
        subject: `You're invited to ${input.organizationName} on CapVeri`,
        html: renderTeamInvitation(
          { ...input, unsubscribeUrl },
          marketingBaseUrl(this.env),
        ),
        text: renderTeamInvitationText({ ...input, unsubscribeUrl }),
        headers: marketingUnsubscribeHeaders(unsubscribeUrl),
      }),
    });

    if (!response.ok) {
      throw new Error("Resend team invitation email failed");
    }
  }
}

export class ResendTeamWelcomeEmailSender implements TeamWelcomeEmailSender {
  constructor(private readonly env: AppEnv) {}

  async sendTeamWelcome(input: TeamWelcomeEmail): Promise<void> {
    const unsubscribeUrl = await unsubscribeUrlForEmail(
      this.env,
      input.toEmail,
    );
    const response = await fetch(`${resendApiBaseUrl(this.env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireRuntimeSecret(this.env, "RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: requireBinding(
          this.env.RESEND_FROM_ADDRESS,
          "RESEND_FROM_ADDRESS",
        ),
        to: [input.toEmail],
        subject: `Welcome to ${input.organizationName} on CapVeri`,
        html: renderTeamWelcome(
          { ...input, unsubscribeUrl },
          marketingBaseUrl(this.env),
        ),
        text: renderTeamWelcomeText({ ...input, unsubscribeUrl }),
        headers: marketingUnsubscribeHeaders(unsubscribeUrl),
      }),
    });

    if (!response.ok) {
      throw new Error("Resend team welcome email failed");
    }
  }
}

export class ResendTenantInvitationEmailSender implements TenantInvitationEmailSender {
  constructor(private readonly env: AppEnv) {}

  async sendTenantInvitation(input: TenantInvitationEmail): Promise<void> {
    const unsubscribeUrl = await unsubscribeUrlForEmail(
      this.env,
      input.toEmail,
    );
    const response = await fetch(`${resendApiBaseUrl(this.env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireRuntimeSecret(this.env, "RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: requireBinding(
          this.env.RESEND_FROM_ADDRESS,
          "RESEND_FROM_ADDRESS",
        ),
        to: [input.toEmail],
        subject: "You're invited to view your CAM statement",
        html: renderTenantInvitation(
          { ...input, unsubscribeUrl },
          marketingBaseUrl(this.env),
        ),
        text: renderTenantInvitationText({ ...input, unsubscribeUrl }),
        headers: marketingUnsubscribeHeaders(unsubscribeUrl),
      }),
    });

    if (!response.ok) {
      throw new Error("Resend tenant invitation email failed");
    }
  }
}

function renderContactNotification(
  input: ContactNotification,
  marketing: string,
): string {
  const content = [
    heading("New CapVeri contact request"),
    dataTable([
      ["Name", input.name],
      ["Email", input.email],
      ["Inquiry type", input.inquiryType],
      ["Company", input.company],
      ["Phone", input.phone],
      ["Message", input.message],
    ]),
  ].join("");

  return renderEmailShell({ content, marketingBaseUrl: marketing });
}

export function resendApiBaseUrl(env: AppEnv): string {
  if (String(env.ENVIRONMENT) === "production") {
    return DEFAULT_RESEND_API_BASE_URL;
  }
  const value = env.RESEND_API_BASE_URL;
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_RESEND_API_BASE_URL;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:") {
      return DEFAULT_RESEND_API_BASE_URL;
    }
    if (url.username || url.password) {
      return DEFAULT_RESEND_API_BASE_URL;
    }
    if (!isLoopbackHost(url.hostname)) {
      return DEFAULT_RESEND_API_BASE_URL;
    }
    url.pathname = url.pathname.replace(/\/+$/u, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return DEFAULT_RESEND_API_BASE_URL;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function renderFeedbackNotification(
  input: FeedbackNotification,
  marketing: string,
): string {
  const content = [
    heading("New CapVeri feedback"),
    dataTable([
      ["Type", input.feedbackType],
      ["Message", input.message],
      ["Page", input.pageUrl],
      ["User email", input.userEmail],
      ["User ID", input.userId],
      ["Organization ID", input.organizationId],
      ["Screenshot", input.screenshotUrl ?? ""],
    ]),
  ].join("");

  return renderEmailShell({ content, marketingBaseUrl: marketing });
}

function renderFeedbackNotificationText(input: FeedbackNotification): string {
  return [
    "New CapVeri feedback",
    `Type: ${input.feedbackType}`,
    `Message: ${input.message}`,
    `Page: ${input.pageUrl}`,
    `User email: ${input.userEmail}`,
    `User ID: ${input.userId}`,
    `Organization ID: ${input.organizationId}`,
    `Screenshot: ${input.screenshotUrl ?? ""}`,
  ].join("\n");
}

function renderTeamInvitation(
  input: TeamInvitationEmail,
  marketing: string,
): string {
  const inviter = input.inviterName || "A team administrator";
  const content = [
    heading(`${inviter} invited you to CapVeri`),
    paragraph(
      `You have been invited to join <strong>${escapeHtml(input.organizationName)}</strong> as ${escapeHtml(input.role)}.`,
      { html: true },
    ),
    pillButton(input.signupUrl, "Join the team"),
    paragraph(`This invitation expires ${input.expiresAt}.`, {
      secondary: true,
    }),
  ].join("");

  return renderEmailShell({
    content,
    marketingBaseUrl: marketing,
    unsubscribeUrl: input.unsubscribeUrl ?? null,
  });
}

function renderTeamInvitationText(input: TeamInvitationEmail): string {
  const inviter = input.inviterName || "A team administrator";
  return [
    `${inviter} invited you to CapVeri`,
    `Organization: ${input.organizationName}`,
    `Role: ${input.role}`,
    `Join the team: ${input.signupUrl}`,
    `Expires: ${input.expiresAt}`,
    `Unsubscribe: ${input.unsubscribeUrl ?? ""}`,
  ].join("\n");
}

function renderWelcomeEmail(input: WelcomeEmail, marketing: string): string {
  const content = [
    heading(`Welcome to ${input.organizationName} on CapVeri`),
    paragraph("Your account is ready."),
    paragraph("First, choose your plan. Then add one property."),
    pillButton(input.dashboardUrl, "Start your plan"),
  ].join("");

  return renderEmailShell({
    content,
    marketingBaseUrl: marketing,
    unsubscribeUrl: input.unsubscribeUrl ?? null,
  });
}

function renderWelcomeEmailText(input: WelcomeEmail): string {
  return [
    `Welcome to ${input.organizationName} on CapVeri`,
    "Your account is ready.",
    "First, choose your plan. Then add one property.",
    `Start your plan: ${input.dashboardUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl ?? ""}`,
  ].join("\n");
}

function renderTeamWelcome(input: TeamWelcomeEmail, marketing: string): string {
  const content = [
    heading(`Welcome to ${input.organizationName} on CapVeri`),
    paragraph(`Hi ${input.fullName}, your account is ready.`),
    paragraph("Open CapVeri to get started."),
    pillButton(input.dashboardUrl, "Open CapVeri"),
  ].join("");

  return renderEmailShell({
    content,
    marketingBaseUrl: marketing,
    unsubscribeUrl: input.unsubscribeUrl ?? null,
  });
}

function renderTeamWelcomeText(input: TeamWelcomeEmail): string {
  return [
    `Welcome to ${input.organizationName} on CapVeri`,
    `Hi ${input.fullName}, your account is ready.`,
    "Open CapVeri to get started.",
    `Open CapVeri: ${input.dashboardUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl ?? ""}`,
  ].join("\n");
}

function renderTenantInvitation(
  input: TenantInvitationEmail,
  marketing: string,
): string {
  const content = [
    heading("Your CAM statement is ready to view"),
    paragraph(
      "Your landlord shares your CAM statement through CapVeri. Set up your account to see it.",
    ),
    pillButton(input.signupUrl, "View my statement"),
    paragraph(`This invitation expires ${input.expiresAt}.`, {
      secondary: true,
    }),
  ].join("");

  return renderEmailShell({
    content,
    marketingBaseUrl: marketing,
    unsubscribeUrl: input.unsubscribeUrl ?? null,
  });
}

function renderTenantInvitationText(input: TenantInvitationEmail): string {
  return [
    "Your CAM statement is ready to view",
    "Your landlord shares your CAM statement through CapVeri. Set up your account to see it.",
    `View my statement: ${input.signupUrl}`,
    `Expires: ${input.expiresAt}`,
    `Unsubscribe: ${input.unsubscribeUrl ?? ""}`,
  ].join("\n");
}

function renderContentDownload(
  input: ContentDownloadEmail,
  marketing: string,
): string {
  const firstName = input.firstName.trim() || "there";

  const content = [
    heading(`Your ${input.assetName} is ready`),
    paragraph(`Hi ${firstName}, here is your download.`),
    pillButton(input.downloadUrl, `Download ${input.assetName}`),
    paragraph("This link expires in 7 days.", { secondary: true }),
    divider(),
    paragraph(
      `Want this check on all your properties? <a href="${escapeAttr(input.registerUrl)}" style="color: #304476;">Start a 30-day trial</a>. CapVeri checks every CAM charge, line by line. It uses your own export files.`,
      { secondary: true, html: true },
    ),
  ].join("");

  return renderEmailShell({
    content,
    marketingBaseUrl: marketing,
    unsubscribeUrl: input.unsubscribeUrl,
  });
}

function renderContentDownloadText(input: ContentDownloadEmail): string {
  const firstName = input.firstName.trim() || "there";

  return [
    `Your ${input.assetName} is ready`,
    "",
    `Hi ${firstName}, here is your download.`,
    `Download: ${input.downloadUrl}`,
    "",
    "This link expires in 7 days.",
    "",
    "Want this check on all your properties? CapVeri checks every CAM charge, line by line. It uses your own export files.",
    `Start a 30-day trial: ${input.registerUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");
}

function renderContactNotificationText(input: ContactNotification): string {
  return [
    "New CapVeri contact request",
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Inquiry type: ${input.inquiryType}`,
    `Company: ${input.company ?? ""}`,
    `Phone: ${input.phone ?? ""}`,
    `Message: ${input.message ?? ""}`,
  ].join("\n");
}

function requireBinding(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Missing required runtime binding: ${name}`);
  }

  return value;
}

async function unsubscribeUrlForEmail(
  env: AppEnv,
  email: string,
): Promise<string> {
  const marketing = marketingBaseUrl(env).replace(/\/+$/u, "");
  const unsubscribe = await buildUnsubscribeToken(
    email,
    requireRuntimeSecret(env, "UNSUBSCRIBE_HMAC_SECRET"),
  );
  return `${marketing}/unsubscribe?e=${encodeURIComponent(unsubscribe.emailB64)}&t=${encodeURIComponent(unsubscribe.token)}`;
}

function marketingUnsubscribeHeaders(
  unsubscribeUrl: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
  };
}
