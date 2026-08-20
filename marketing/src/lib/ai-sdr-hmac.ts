import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shared HMAC helpers for the signed envelope used by every CapVeri AI-SDR
 * boundary:
 *   - the worker fetching product context from `/api/ai-sdr/product-context`
 *   - the browser widget authenticating to the AI-SDR worker via `/api/ai-sdr/sign`
 *
 * The envelope and `stableJson` canonicalisation must stay byte-identical to the
 * worker's `@ventora/ai-assistant-contracts` implementation, otherwise signatures
 * will not verify across services.
 */

export type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | StableJsonValue[]
  | { [key: string]: StableJsonValue };

export const MAX_SIGNATURE_SKEW_MS = 5 * 60 * 1000;

// Mirror the worker's `@ventora/ai-assistant-contracts` canonicalisation exactly:
// recursively sort object keys with the default (UTF-16 code-unit) sort, drop
// undefined-valued keys, then serialise once with JSON.stringify. Any drift here
// (locale-aware sort, kept undefined keys, hand-built strings) would make the
// signed payload differ from the worker's and every signature would fail to verify.
function sortStable(value: StableJsonValue): StableJsonValue {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const sorted: { [key: string]: StableJsonValue } = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) {
      sorted[key] = sortStable(child);
    }
  }
  return sorted;
}

export function stableJson(value: StableJsonValue): string {
  return JSON.stringify(sortStable(value));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildHmacPayload(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: StableJsonValue;
}): string {
  return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${
    input.path
  }.${sha256Hex(stableJson(input.body))}`;
}

export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function verifySignature(input: {
  payload: string;
  signature: string;
  secret: string;
  timestamp: string;
  nowMs?: number;
}): boolean {
  const parsedTimestamp = Date.parse(input.timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }
  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - parsedTimestamp) > MAX_SIGNATURE_SKEW_MS) {
    return false;
  }
  return timingSafeEqualHex(
    signPayload(input.payload, input.secret),
    input.signature,
  );
}
