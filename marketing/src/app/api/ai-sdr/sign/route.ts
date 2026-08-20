import { randomUUID } from "node:crypto";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  buildHmacPayload,
  signPayload,
  type StableJsonValue,
} from "@/lib/ai-sdr-hmac";

export const dynamic = "force-dynamic";

const PRODUCT_ID = "capveri";

/**
 * The only AI-SDR worker paths the public marketing widget is allowed to have
 * signed. Scoping the BFF to these stops it from being turned into a
 * general-purpose signing oracle for arbitrary worker requests.
 */
const SIGNABLE_WORKER_PATHS: ReadonlySet<string> = new Set([
  "/v1/sessions",
  "/v1/chat",
  "/v1/handoff",
]);

type SignRequestBody = {
  method: string;
  path: string;
  body: StableJsonValue;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

async function getClientAssertionSecret(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const cloudflareEnv = env as { AI_SDR_CLIENT_ASSERTION_SECRET?: string };
    const secret = cloudflareEnv.AI_SDR_CLIENT_ASSERTION_SECRET;
    if (secret?.trim()) {
      return secret.trim();
    }
  } catch {
    // Local tests and non-Cloudflare execution fall back to process.env.
  }

  const runtimeEnv = process.env as Record<string, string | undefined>;
  return (runtimeEnv["AI_SDR_CLIENT_ASSERTION_SECRET"] ?? "").trim();
}

async function readSignRequest(
  request: Request,
): Promise<SignRequestBody | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const { method, path, body } = parsed;
  if (typeof method !== "string" || typeof path !== "string") {
    return null;
  }
  if (body === undefined) {
    return null;
  }

  return { method, path, body: body as StableJsonValue };
}

/**
 * Browser-facing BFF: mint a short-lived HMAC assertion so the public AI-SDR
 * widget can authenticate to the AI-SDR worker without ever shipping the secret
 * to the browser. The widget is anonymous by design, so there is no user to
 * bind to. Abuse is bounded by restricting the method, the worker paths, and
 * the product id, leaving the worker's own origin allow-list and rate controls
 * as the outer guard.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = await getClientAssertionSecret();
  if (!secret) {
    return json({ error: "Sign service unavailable" }, { status: 503 });
  }

  const signRequest = await readSignRequest(request);
  if (signRequest === null) {
    return json({ error: "Invalid sign request" }, { status: 400 });
  }

  if (signRequest.method.toUpperCase() !== "POST") {
    return json({ error: "Unsupported method" }, { status: 400 });
  }

  if (!SIGNABLE_WORKER_PATHS.has(signRequest.path)) {
    return json({ error: "Path not allowed" }, { status: 403 });
  }

  const payloadBody = signRequest.body;
  // Every signable worker path takes a JSON object body; reject anything else so
  // the product-id binding below cannot be sidestepped with a primitive body.
  if (!isRecord(payloadBody)) {
    return json({ error: "Invalid sign request body" }, { status: 400 });
  }

  // /v1/sessions establishes the session, so the assertion it mints must be
  // bound to CapVeri. /v1/chat and /v1/handoff carry a sessionId the worker
  // validates for ownership, so they only need the defensive check that any
  // productId present still matches.
  if (signRequest.path === "/v1/sessions") {
    if (payloadBody.productId !== PRODUCT_ID) {
      return json({ error: "Product mismatch" }, { status: 403 });
    }
  } else if (
    "productId" in payloadBody &&
    payloadBody.productId !== PRODUCT_ID
  ) {
    return json({ error: "Product mismatch" }, { status: 403 });
  }

  const timestamp = new Date().toISOString();
  const nonce = randomUUID().replaceAll("-", "");
  const payload = buildHmacPayload({
    timestamp,
    nonce,
    method: "POST",
    path: signRequest.path,
    body: payloadBody as StableJsonValue,
  });
  const signature = signPayload(payload, secret);

  return json({ timestamp, nonce, signature });
}
