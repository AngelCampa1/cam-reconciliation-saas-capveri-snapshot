import { randomUUID } from "node:crypto";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { publicKnowledge } from "@/generated/public-knowledge";
import {
  buildHmacPayload,
  MAX_SIGNATURE_SKEW_MS,
  signPayload,
  type StableJsonValue,
  verifySignature,
} from "@/lib/ai-sdr-hmac";
import { buildTrialLink } from "@/lib/auditLink";
import { captureMarketingException } from "@/lib/sentry";

export const dynamic = "force-dynamic";

const PRODUCT_ID = "capveri";
const consumedNonces = new Map<string, number>();

type NonceDatabase = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ success: boolean; meta: { changes?: number } }>;
    };
  };
};

type ProductPlan = {
  id: string;
  name: string;
  price: string;
  annualPrice: string;
  discount: string;
  defaultCadence: "month" | "year";
  trialDays: number;
  ctaUrl: string;
  features: string[];
};

type MeetingLink = {
  id: string;
  label: string;
  url: string;
  description: string;
};

type ProductContext = {
  productId: string;
  name: string;
  description: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    excerpt: string;
  }>;
  plans: ProductPlan[];
  meetingLinks: MeetingLink[];
};

async function consumeNonce(
  nonce: string,
  timestamp: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const parsedTimestamp = Date.parse(timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }

  const expiresAt = parsedTimestamp + MAX_SIGNATURE_SKEW_MS;
  const database = await getNonceDatabase();
  if (!database) {
    if (process.env.NODE_ENV === "production") {
      // Fail closed, but make the cause visible: a missing AI_SDR_NONCE_DB
      // binding in production turns every signed request into a 401, which is
      // otherwise indistinguishable from a genuine replay rejection.
      captureMarketingException(
        new Error("AI_SDR_NONCE_DB unavailable in production"),
        {
          operation: "marketing.ai_sdr.product_context.nonce_db_unavailable",
          path: "/api/ai-sdr/product-context",
        },
      );
      return false;
    }
    return consumeLocalNonce(nonce, expiresAt, nowMs);
  }

  await database
    .prepare("DELETE FROM ai_sdr_nonces WHERE expires_at <= ?")
    .bind(nowMs)
    .run();
  const result = await database
    .prepare(
      "INSERT OR IGNORE INTO ai_sdr_nonces (nonce, expires_at) VALUES (?, ?)",
    )
    .bind(nonce, expiresAt)
    .run();
  return result.success && result.meta.changes === 1;
}

async function getNonceDatabase(): Promise<NonceDatabase | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as { AI_SDR_NONCE_DB?: NonceDatabase }).AI_SDR_NONCE_DB ?? null;
  } catch {
    return null;
  }
}

async function getContextSecret(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const cloudflareEnv = env as {
      AI_SDR_CONTEXT_SECRET?: string;
      AI_SDR_PRODUCT_CONTEXT_SECRET?: string;
    };
    const secret =
      cloudflareEnv.AI_SDR_CONTEXT_SECRET ??
      cloudflareEnv.AI_SDR_PRODUCT_CONTEXT_SECRET;
    if (secret?.trim()) {
      return secret.trim();
    }
  } catch {
    // Local tests and non-Cloudflare execution can still use process.env.
  }

  const runtimeEnv = process.env as Record<string, string | undefined>;
  return (
    runtimeEnv["AI_SDR_CONTEXT_SECRET"] ??
    runtimeEnv["AI_SDR_PRODUCT_CONTEXT_SECRET"] ??
    ""
  ).trim();
}

function consumeLocalNonce(
  nonce: string,
  nonceExpiresAt: number,
  now: number,
): boolean {
  for (const [candidate, expiresAt] of consumedNonces.entries()) {
    if (expiresAt <= now) {
      consumedNonces.delete(candidate);
    }
  }

  if (consumedNonces.has(nonce)) {
    return false;
  }

  consumedNonces.set(nonce, nonceExpiresAt);
  return true;
}

function absoluteCtaUrl(planId: string): string {
  return buildTrialLink({
    content: `ai_sdr_${planId}`,
    plan: planId,
    offer: publicKnowledge.pricing.launchOffer.code,
  });
}

function buildMeetingLinks(): MeetingLink[] {
  return [];
}

function buildContext(): ProductContext {
  const launchOfferLabel = `${publicKnowledge.pricing.launchOffer.code}: ${publicKnowledge.pricing.display.launchOfferTerms}`;
  const trialDays = publicKnowledge.pricing.trialDays;
  const plans = publicKnowledge.pricing.tiers.map(
    (tier): ProductPlan => ({
      id: tier.id,
      name: tier.name,
      price: tier.display.annualLabel,
      annualPrice: tier.display.annualLabel,
      discount: launchOfferLabel,
      defaultCadence: "year",
      trialDays: tier.includedInTrial ? trialDays : 0,
      ctaUrl:
        tier.primaryCta.href === "/auth/register"
          ? absoluteCtaUrl(tier.id)
          : `${publicKnowledge.company.siteUrl}${tier.primaryCta.href}`,
      // Converged with the cloudflare-backend SDR endpoint: capability labels
      // first, then prospect-fit positioning, so the sales chat gets identical
      // context regardless of which endpoint it fetches. Keep this list in
      // lockstep with public-knowledge.ts buildPublicPricingPlans().
      features: [
        ...publicKnowledge.pricing.features
          .filter((feature) => feature.tier === tier.id)
          .map((feature) => feature.label),
        tier.tagline,
        tier.display.limit,
        `Audience: ${tier.audience.who}`,
        `Portfolio: ${tier.audience.portfolio}`,
      ],
    }),
  );

  return {
    productId: PRODUCT_ID,
    name: publicKnowledge.productName,
    description: publicKnowledge.company.publicDescription,
    sources: [
      {
        id: "plan-tiers",
        title: "Canonical plan tiers",
        url: `${publicKnowledge.company.siteUrl}/pricing`,
        excerpt: `${publicKnowledge.pricing.display.selfServeSummary} ${publicKnowledge.pricing.display.annualSummary}.`,
      },
      {
        id: "marketing-help-center",
        title: "Public help center",
        url: `${publicKnowledge.company.siteUrl}/help`,
        excerpt:
          "Approved public help and FAQ copy for CapVeri workflows, pricing boundaries, and support escalation.",
      },
      {
        id: "public-compliance",
        title: "Public compliance guardrails",
        url: `${publicKnowledge.company.siteUrl}/sources`,
        excerpt:
          "Use public-safe claims only and do not invent legal, compliance, security, or roadmap commitments.",
      },
    ],
    plans,
    meetingLinks: buildMeetingLinks(),
  };
}

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const productId =
    url.searchParams.get("productId") ?? url.searchParams.get("product_id");
  if (productId !== PRODUCT_ID) {
    return json({ error: "Unknown product" }, { status: 404 });
  }

  const secret = await getContextSecret();
  if (!secret) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  const timestamp = request.headers.get("X-Ventora-Timestamp");
  const nonce = request.headers.get("X-Ventora-Nonce");
  const signature = request.headers.get("X-Ventora-Signature");
  if (!timestamp || !nonce || !signature) {
    return json({ error: "Missing signature" }, { status: 401 });
  }

  const path = `${url.pathname}${url.search}`;
  const requestPayload = buildHmacPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body: { productId },
  });
  if (
    !verifySignature({ payload: requestPayload, signature, secret, timestamp })
  ) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }
  if (!(await consumeNonce(nonce, timestamp))) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = buildContext();
  const responseTimestamp = new Date().toISOString();
  const responseNonce = randomUUID().replaceAll("-", "");
  const responsePayload = buildHmacPayload({
    timestamp: responseTimestamp,
    nonce: responseNonce,
    method: "GET",
    path,
    body: body as unknown as StableJsonValue,
  });
  const response = json(body);
  response.headers.set("Cache-Control", "private, max-age=300");
  response.headers.set("X-Ventora-Timestamp", responseTimestamp);
  response.headers.set("X-Ventora-Nonce", responseNonce);
  response.headers.set(
    "X-Ventora-Signature",
    signPayload(responsePayload, secret),
  );
  response.headers.set("X-Ventora-Product", PRODUCT_ID);
  return response;
}
