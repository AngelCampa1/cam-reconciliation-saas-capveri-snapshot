import type { AppEnv } from "../../env";
import { requireRuntimeSecret } from "../../platform/cloudflare";

const DEFAULT_TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerificationInput = {
  token: string | null;
  remoteIp: string | null;
};

export type TurnstileVerifier = {
  verify(input: TurnstileVerificationInput): Promise<boolean>;
};

type TurnstileResponse = {
  success?: boolean;
};

export class CloudflareTurnstileVerifier implements TurnstileVerifier {
  constructor(private readonly env: AppEnv) {}

  async verify(input: TurnstileVerificationInput): Promise<boolean> {
    if (!input.token) {
      return false;
    }

    const body = new URLSearchParams({
      secret: requireRuntimeSecret(this.env, "TURNSTILE_SECRET_KEY"),
      response: input.token,
    });

    if (input.remoteIp) {
      body.set("remoteip", input.remoteIp);
    }

    let response: Response;

    try {
      response = await fetch(resolveTurnstileSiteverifyUrl(this.env), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch {
      return false;
    }

    if (!response.ok) {
      return false;
    }

    let payload: TurnstileResponse;

    try {
      payload = (await response.json()) as TurnstileResponse;
    } catch {
      return false;
    }

    return payload.success === true;
  }
}

export function resolveTurnstileSiteverifyUrl(env: AppEnv): string {
  return resolveLoopbackOverride({
    env,
    value: env.TURNSTILE_SITEVERIFY_URL,
    fallback: DEFAULT_TURNSTILE_SITEVERIFY_URL,
  });
}

function resolveLoopbackOverride(input: {
  env: AppEnv;
  value: string | undefined;
  fallback: string;
}): string {
  if (String(input.env.ENVIRONMENT) === "production") {
    return input.fallback;
  }
  if (typeof input.value !== "string" || input.value.trim() === "") {
    return input.fallback;
  }

  try {
    const url = new URL(input.value);
    if (url.protocol !== "http:") {
      return input.fallback;
    }
    if (url.username || url.password) {
      return input.fallback;
    }
    if (!isLoopbackHost(url.hostname)) {
      return input.fallback;
    }
    return url.toString();
  } catch {
    return input.fallback;
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
