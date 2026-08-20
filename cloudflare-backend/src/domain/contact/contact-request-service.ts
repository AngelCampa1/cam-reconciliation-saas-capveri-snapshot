import type { ContactNotificationSender } from "../../adapters/email/resend";
import type { TurnstileVerifier } from "../../adapters/security/turnstile";
import { HttpError } from "../../http/errors";

export type ContactRequestInput = {
  name: string;
  email: string;
  inquiryType: string;
  company: string | null;
  phone: string | null;
  message: string | null;
  turnstileToken: string | null;
  companyWebsite: string | null;
  remoteIp: string | null;
};

export type ContactRateLimiter = {
  check(input: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean>;
};

export type ContactRequestServiceDependencies = {
  turnstile: TurnstileVerifier;
  rateLimiter: ContactRateLimiter;
  emailSender: ContactNotificationSender;
  adminEmail: string;
  logger?: Pick<Console, "error">;
  reportNotificationFailure?: (error: unknown) => Promise<void> | void;
};

export const CONTACT_REQUEST_SUCCESS_MESSAGE =
  "Your message has been received. We'll be in touch within 24 hours.";

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;

export class ContactRequestService {
  constructor(
    private readonly dependencies: ContactRequestServiceDependencies,
  ) {}

  async submit(input: ContactRequestInput): Promise<void> {
    if (input.companyWebsite) {
      return;
    }

    const verified = await this.dependencies.turnstile.verify({
      token: input.turnstileToken,
      remoteIp: input.remoteIp,
    });

    if (!verified) {
      throw new HttpError(
        403,
        "forbidden",
        "Verification failed. Please try again.",
      );
    }

    const email = input.email.toLowerCase();
    const allowed = await this.dependencies.rateLimiter.check({
      key: `contact:${email}`,
      limit: RATE_LIMIT_MAX,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    });

    if (!allowed) {
      throw new HttpError(
        429,
        "rate_limit_exceeded",
        `Rate limit exceeded: maximum ${RATE_LIMIT_MAX} contact requests per email per day`,
      );
    }

    try {
      await this.dependencies.emailSender.sendContactNotification({
        adminEmail: this.dependencies.adminEmail,
        name: input.name,
        email: input.email,
        inquiryType: input.inquiryType,
        company: input.company,
        phone: input.phone,
        message: input.message,
      });
    } catch (error) {
      this.dependencies.logger?.error("Failed to send contact notification", {
        inquiryType: input.inquiryType,
        error: redactContactEmail(
          error instanceof Error ? error.message : String(error),
          input.email,
          email,
        ),
      });
      void Promise.resolve(this.dependencies.reportNotificationFailure?.(error)).catch(
        () => undefined,
      );
      return;
    }
  }
}

function redactContactEmail(
  value: string,
  originalEmail: string,
  normalizedEmail: string,
): string {
  return [originalEmail, normalizedEmail].reduce(
    (redacted, candidate) =>
      candidate ? redacted.split(candidate).join("[redacted-email]") : redacted,
    value,
  );
}
