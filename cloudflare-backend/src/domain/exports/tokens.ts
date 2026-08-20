/**
 * HMAC self-authenticating tokens for export re-download links (EP-11 / F).
 *
 * Token format: base64url(JSON payload) . hmac-sha256-hex
 *
 * The download URL carrying this token is public (no Authorization header
 * required) because window.open() cannot set headers. The HMAC and expiry
 * enforce authenticity and time-bound access.
 */

import { HttpError } from "../../http/errors";

export type ExportDownloadTokenPayload = {
  /** R2 object key (without the "r2:" prefix) */
  r2Key: string;
  /** Suggested filename for Content-Disposition. */
  fileName: string;
  /** Trusted response MIME type for the signed object. */
  contentType?: string;
  /** Unix timestamp (seconds) when this token expires. */
  expiresAt: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function buildExportDownloadToken(
  payload: ExportDownloadTokenPayload,
  secret: string,
): Promise<string> {
  const encodedPayload = base64UrlEncode(
    textEncoder.encode(JSON.stringify(payload)),
  );
  const signature = await hmacHex(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyExportDownloadToken(
  token: string,
  secret: string,
): Promise<ExportDownloadTokenPayload> {
  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra !== undefined) {
    throw new HttpError(400, "invalid_export_token", "Invalid download link.");
  }

  const expected = await hmacHex(encodedPayload, secret);
  if (!timingSafeEqual(signature, expected)) {
    throw new HttpError(400, "invalid_export_token", "Invalid download link.");
  }

  let payload: ExportDownloadTokenPayload;
  try {
    payload = JSON.parse(
      textDecoder.decode(base64UrlDecode(encodedPayload)),
    ) as ExportDownloadTokenPayload;
  } catch {
    throw new HttpError(400, "invalid_export_token", "Invalid download link.");
  }

  if (
    typeof payload.r2Key !== "string" ||
    typeof payload.fileName !== "string" ||
    (payload.contentType !== undefined &&
      typeof payload.contentType !== "string") ||
    typeof payload.expiresAt !== "number"
  ) {
    throw new HttpError(400, "invalid_export_token", "Invalid download link.");
  }

  if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new HttpError(410, "export_token_expired", "Download link expired.");
  }

  return payload;
}

// ── crypto helpers (mirrors leads/tokens.ts) ─────────────────────────────────

async function hmacHex(value: string, secret: string): Promise<string> {
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
    textEncoder.encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
