import type { AppEnv } from "../../env";

export type ServerAnalytics = {
  capture(env: AppEnv, input: ServerAnalyticsInput): Promise<void>;
};

export type ServerAnalyticsInput = {
  eventName: string;
  organizationId: string;
  properties?: Record<string, unknown>;
};

export class PostHogServerAnalytics implements ServerAnalytics {
  async capture(env: AppEnv, input: ServerAnalyticsInput): Promise<void> {
    const apiKey = env.POSTHOG_PROJECT_API_KEY?.trim();

    if (!apiKey) {
      return;
    }

    try {
      await fetch(
        `${(env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/+$/u, "")}/capture/`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            event: input.eventName,
            distinct_id: `org:${input.organizationId}`,
            properties: {
              source_app: "backend",
              organization_id: input.organizationId,
              $groups: { organization: input.organizationId },
              ...cleanAnalyticsProperties(input.properties ?? {}),
            },
          }),
        },
      );
    } catch {
      return;
    }
  }
}

export function cleanAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      const normalizedKey = key.toLowerCase();

      return (
        value !== null &&
        value !== undefined &&
        !normalizedKey.includes("email") &&
        !normalizedKey.includes("name") &&
        !normalizedKey.includes("token") &&
        !normalizedKey.includes("secret") &&
        !normalizedKey.includes("password") &&
        !normalizedKey.includes("phone") &&
        !normalizedKey.includes("address") &&
        !normalizedKey.includes("document") &&
        !normalizedKey.includes("storage") &&
        !normalizedKey.includes("text") &&
        !normalizedKey.includes("note") &&
        isSafeAnalyticsValue(value)
      );
    }),
  );
}

function isSafeAnalyticsValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return true;
  }

  const trimmed = value.trim();

  return (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed) &&
    !/^\+?[\d\s().-]{7,}$/u.test(trimmed) &&
    !/(\.pdf(\?|$)|\.csv(\?|$)|\.xlsx?(\?|$)|https?:\/\/|s3:\/\/|blob:)/iu.test(
      trimmed,
    )
  );
}
