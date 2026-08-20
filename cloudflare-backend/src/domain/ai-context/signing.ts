import { HttpError } from "../../http/errors";

export type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | StableJsonValue[]
  | { [key: string]: StableJsonValue };

const textEncoder = new TextEncoder();
const signaturePattern = /^[a-f0-9]{64}$/u;
export const maxSignatureSkewMs = 5 * 60 * 1000;

/**
 * Canonical JSON used as the HMAC body hash on both sides of the AI-CS
 * handshake. This MUST stay byte-identical to `stableJson` in
 * `@ventora/ai-assistant-contracts` (the algorithm the ai-cs-worker verifies
 * against): recursively sort object keys with the default code-unit ordering
 * (NOT locale-aware — `localeCompare` reorders uppercase/underscore/digit keys
 * and would silently break signature verification the moment a signed body
 * gains such a key), drop `undefined`, then a single `JSON.stringify`.
 */
export function stableJson(value: StableJsonValue): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: StableJsonValue): StableJsonValue {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }

  if (value && typeof value === "object") {
    const sorted: { [key: string]: StableJsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) {
        sorted[key] = sortStable(child);
      }
    }
    return sorted;
  }

  return value;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );

  return bytesToHex(new Uint8Array(digest));
}

export async function buildHmacPayload(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: StableJsonValue;
}): Promise<string> {
  const bodyHash = await sha256Hex(stableJson(input.body));

  return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${
    input.path
  }.${bodyHash}`;
}

export async function signHmacPayload(
  payload: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(payload),
  );

  return bytesToHex(new Uint8Array(signature));
}

export async function verifyHmacSignature(input: {
  payload: string;
  signature: string;
  secret: string;
  timestamp: string;
  nowMs?: number;
}): Promise<boolean> {
  if (!signaturePattern.test(input.signature)) {
    return false;
  }

  const timestampMs = Date.parse(input.timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  if (
    Math.abs((input.nowMs ?? Date.now()) - timestampMs) > maxSignatureSkewMs
  ) {
    return false;
  }

  const expected = await signHmacPayload(input.payload, input.secret);

  return timingSafeEqual(input.signature, expected);
}

export function requireSignedHeaders(headers: Headers): {
  timestamp: string;
  nonce: string;
  signature: string;
} {
  const timestamp = headers.get("x-ventora-timestamp");
  const nonce = headers.get("x-ventora-nonce");
  const signature = headers.get("x-ventora-signature");

  if (!timestamp || !nonce || !signature) {
    throw new HttpError(401, "missing_signature", "Missing signature");
  }

  return { timestamp, nonce, signature };
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
