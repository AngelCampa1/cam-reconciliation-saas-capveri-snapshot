import posthog from "posthog-js";

export type MarketingEvent =
  | "cta_clicked"
  | "form_submitted"
  | "pricing_viewed"
  | "demo_requested"
  | "generate_lead"
  | "tool_page_view"
  | "tool_interaction"
  | "tool_result_viewed"
  | "tool_lead_gate_opened"
  | "lead_form_view"
  | "lead_form_result_seen"
  | "lead_form_submit"
  | "form_started"
  | "form_submit_attempted"
  | "form_submit_failed"
  | "turnstile_required_missing"
  | "exit_intent_popup_view"
  | "exit_intent_popup_dismiss"
  | "exit_intent_popup_resource_select";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ve_product",
  "ve_icp",
  "ve_campaign_id",
  "ve_variant",
  "ve_step",
  "ve_offer",
  "ve_instantly_campaign_id",
  "ve_lead_list_id",
  "ve_sender_pool",
  "ve_sequence_day",
  "ve_branding",
] as const;

const FIRST_TOUCH_STORAGE_KEY = "capveri_first_touch_attribution";
const SENSITIVE_EVENT_PROPERTY_KEY =
  /(^|_)(email|customer_email|billing_email|receipt_email|phone|phone_number|password|token|secret|name|full_name)($|_)/i;
const EMAIL_VALUE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_VALUE_PATTERN = /^\+?[\d\s().-]{7,}$/;
const EMAIL_DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const PRODUCT_FEATURE_ROUTES = new Set([
  "cam-reconciliation-software",
  "cam-audit-software",
  "commercial-lease-audit-software",
  "yardi-cam-reconciliation",
  "mri-cam-reconciliation",
  "cam-charges",
  "cam-audit",
]);

type UtmKey = (typeof UTM_KEYS)[number];

type FirstTouchAttribution = {
  first_touch_landing_page: string;
  first_touch_referrer_domain?: string;
} & Partial<Record<`first_touch_${UtmKey}`, string>>;

function normalizePropertyKey(key: string): string {
  return key.replace(/(?<!^)([A-Z])/g, "_$1").toLowerCase();
}

function isSensitivePropertyKey(key: string): boolean {
  const normalizedKey = normalizePropertyKey(key);
  if (normalizedKey.endsWith("email_domain")) return false;
  return SENSITIVE_EVENT_PROPERTY_KEY.test(normalizedKey);
}

function sanitizeEventValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const sanitized = value
      .map((item) => sanitizeEventValue(item))
      .filter((item) => item !== undefined);
    return sanitized.length > 0 ? sanitized : undefined;
  }

  if (value && typeof value === "object") {
    return sanitizeEventParams(value as Record<string, unknown>);
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    if (EMAIL_VALUE_PATTERN.test(trimmedValue)) return undefined;
    if (PHONE_VALUE_PATTERN.test(trimmedValue)) return undefined;
  }

  return value;
}

function sanitizeEventParams(
  params?: Record<string, unknown>,
): Record<string, unknown> {
  if (!params) return {};

  const safeParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (isSensitivePropertyKey(key)) continue;
    if (
      normalizePropertyKey(key).endsWith("email_domain") &&
      (typeof value !== "string" || !EMAIL_DOMAIN_PATTERN.test(value))
    ) {
      continue;
    }
    const sanitizedValue = sanitizeEventValue(value);
    if (sanitizedValue !== undefined) safeParams[key] = sanitizedValue;
  }

  return safeParams;
}

function getReferrerDomain(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    return new URL(document.referrer).hostname;
  } catch {
    return undefined;
  }
}

function getCurrentUtmParams(): Partial<Record<UtmKey, string>> {
  const searchParams = new URLSearchParams(window.location.search);
  return UTM_KEYS.reduce<Partial<Record<UtmKey, string>>>((acc, key) => {
    const value = searchParams.get(key);
    if (value) acc[key] = value;
    return acc;
  }, {});
}

function getFirstTouchAttribution(): FirstTouchAttribution {
  const referrerDomain = getReferrerDomain();
  const fallback: FirstTouchAttribution = {
    first_touch_landing_page: window.location.pathname,
    ...Object.fromEntries(
      Object.entries(getCurrentUtmParams()).map(([key, value]) => [
        `first_touch_${key}`,
        value,
      ]),
    ),
    ...(referrerDomain ? { first_touch_referrer_domain: referrerDomain } : {}),
  };

  try {
    const stored = window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as FirstTouchAttribution;
    window.localStorage.setItem(
      FIRST_TOUCH_STORAGE_KEY,
      JSON.stringify(fallback),
    );
  } catch {
    return fallback;
  }

  return fallback;
}

export function getEmailDomain(email: string): string | undefined {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return undefined;
  const domain = parts[1];
  return EMAIL_DOMAIN_PATTERN.test(domain) ? domain : undefined;
}

export function getStatusBucket(status: number | undefined): string {
  if (status === undefined || Number.isNaN(status)) return "unknown";
  if (status < 200) return "informational";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status === 400) return "400";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "404";
  if (status === 408) return "timeout";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limit";
  if (status < 500) return "4xx";
  return "5xx";
}

export function getCountBucket(value: number | string | undefined): string {
  const numericValue =
    typeof value === "string" ? Number.parseInt(value, 10) : value;
  if (
    typeof numericValue !== "number" ||
    Number.isNaN(numericValue) ||
    numericValue < 1
  ) {
    return "unknown";
  }
  if (numericValue === 1) return "1";
  if (numericValue <= 5) return "2-5";
  if (numericValue <= 10) return "6-10";
  if (numericValue <= 50) return "11-50";
  if (numericValue <= 100) return "51-100";
  return "100+";
}

async function getLeadDistinctId(email: string): Promise<string | undefined> {
  const normalizedEmail = email.trim().toLowerCase();
  const domain = getEmailDomain(normalizedEmail);
  if (!normalizedEmail || !domain) return undefined;
  if (!globalThis.crypto?.subtle) return undefined;

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`capveri-lead:${normalizedEmail}`),
  );
  const digestHex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `lead:${domain}:${digestHex.slice(0, 16)}`;
}

export function getPageTaxonomy(pathname = window.location.pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const [first, second, third] = segments;

  if (first === "tools") {
    return {
      page_type: "tool",
      tool_slug: second,
      content_cluster: "free_tools",
      funnel_stage: "activation",
    };
  }

  if (first === "resources" || first === "blog") {
    return {
      page_type: "content",
      content_cluster: second ?? first,
      funnel_stage: "education",
    };
  }

  if (first === "pricing") {
    return { page_type: "pricing", funnel_stage: "decision" };
  }

  if (first === "contact") {
    return { page_type: "contact", funnel_stage: "conversion" };
  }

  if (first === "product" && second === "features") {
    return {
      page_type: "product_feature",
      feature_slug: third,
      funnel_stage: "consideration",
    };
  }

  if (first === "vs") {
    return {
      page_type: "comparison",
      comparison_slug: second,
      competitor_slug: second,
      funnel_stage: "decision",
    };
  }

  if (first === "alternatives") {
    return {
      page_type: "alternative",
      alternative_slug: second,
      competitor_slug: second,
      funnel_stage: "decision",
    };
  }

  if (first === "switch") {
    return {
      page_type: "switch_guide",
      switch_slug: second,
      competitor_slug: second,
      funnel_stage: "decision",
    };
  }

  if (first === "solutions") {
    return {
      page_type: "solution",
      solution_slug: second,
      funnel_stage: "consideration",
    };
  }

  if (first === "integrations") {
    return {
      page_type: "integration",
      integration_slug: second,
      funnel_stage: "consideration",
    };
  }

  if (first === "best") {
    return {
      page_type: "best_page",
      best_slug: second,
      funnel_stage: "decision",
    };
  }

  if (first && PRODUCT_FEATURE_ROUTES.has(first)) {
    return {
      page_type: "product_feature",
      feature_slug: first,
      funnel_stage: "consideration",
    };
  }

  if (!first) {
    return { page_type: "home", funnel_stage: "awareness" };
  }

  return { page_type: first, funnel_stage: "awareness" };
}

export function getMarketingContext(): Record<string, unknown> {
  if (typeof window === "undefined") return { source_app: "marketing" };

  const latestUtmParams = getCurrentUtmParams();
  const latestTouchParams = Object.fromEntries(
    Object.entries(latestUtmParams).map(([key, value]) => [
      `latest_${key}`,
      value,
    ]),
  );

  return sanitizeEventParams({
    source_app: "marketing",
    page_path: window.location.pathname,
    ...getPageTaxonomy(window.location.pathname),
    ...latestUtmParams,
    ...latestTouchParams,
    ...getFirstTouchAttribution(),
  });
}

export function getSafeMarketingPageSearch(search: string): string {
  if (!search) return "";

  const safeSearchParams = new URLSearchParams();
  const sourceSearchParams = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );

  for (const [key, value] of sourceSearchParams.entries()) {
    const sanitized = sanitizeEventParams({ [key]: value });
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      safeSearchParams.append(key, String(sanitized[key]));
    }
  }

  const safeSearch = safeSearchParams.toString();
  return safeSearch ? `?${safeSearch}` : "";
}

export function identifyMarketingLead(
  email: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!posthog.__loaded) return;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;
  const leadEmailDomain = getEmailDomain(normalizedEmail);
  void getLeadDistinctId(normalizedEmail)
    .then((leadDistinctId) => {
      if (!leadDistinctId) return;

      const identifyProperties = {
        ...(leadEmailDomain ? { lead_email_domain: leadEmailDomain } : {}),
        ...getMarketingContext(),
        ...sanitizeEventParams(properties),
      };

      posthog.identify(leadDistinctId, sanitizeEventParams(identifyProperties));
    })
    .catch(() => undefined);
}

/**
 * Track a marketing event in PostHog.
 *
 * No-op when PostHog is not initialized (e.g. in dev without a key).
 *
 * @example
 * trackMarketingEvent('cta_clicked', { button_text: 'Start Free Trial', location: 'hero' })
 */
export function trackMarketingEvent(
  event: MarketingEvent,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!posthog.__loaded) return;
  posthog.capture(
    event,
    sanitizeEventParams({
      ...sanitizeEventParams(properties),
      ...getMarketingContext(),
    }),
  );
}
