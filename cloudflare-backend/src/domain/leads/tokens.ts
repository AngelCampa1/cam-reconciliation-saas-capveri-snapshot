import { HttpError } from "../../http/errors";

export type DownloadTokenPayload = {
  email: string;
  assetSlug: string;
  storagePath: string;
  expiresAt: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function buildDownloadToken(
  payload: DownloadTokenPayload,
  secret: string,
): Promise<string> {
  const encodedPayload = base64UrlEncode(
    textEncoder.encode(JSON.stringify(payload)),
  );
  const signature = await hmacHex(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifyDownloadToken(
  token: string,
  secret: string,
): Promise<DownloadTokenPayload> {
  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra !== undefined) {
    throw new HttpError(
      400,
      "invalid_download_token",
      "Invalid download link.",
    );
  }

  const expected = await hmacHex(encodedPayload, secret);
  if (!timingSafeEqual(signature, expected)) {
    throw new HttpError(
      400,
      "invalid_download_token",
      "Invalid download link.",
    );
  }

  let payload: DownloadTokenPayload;
  try {
    payload = JSON.parse(
      textDecoder.decode(base64UrlDecode(encodedPayload)),
    ) as DownloadTokenPayload;
  } catch {
    throw new HttpError(
      400,
      "invalid_download_token",
      "Invalid download link.",
    );
  }

  if (
    typeof payload.email !== "string" ||
    typeof payload.assetSlug !== "string" ||
    typeof payload.storagePath !== "string" ||
    typeof payload.expiresAt !== "number"
  ) {
    throw new HttpError(
      400,
      "invalid_download_token",
      "Invalid download link.",
    );
  }

  if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new HttpError(
      410,
      "download_token_expired",
      "Download link expired.",
    );
  }

  return payload;
}

export async function buildUnsubscribeToken(
  email: string,
  secret: string,
): Promise<{ emailB64: string; token: string }> {
  return {
    emailB64: base64UrlEncode(textEncoder.encode(email)),
    token: await hmacHex(email, secret),
  };
}

export async function verifyUnsubscribeToken(
  emailB64: string,
  token: string,
  secret: string,
): Promise<string | null> {
  let email: string;
  try {
    email = textDecoder.decode(base64UrlDecode(emailB64));
  } catch {
    return null;
  }

  const expected = await hmacHex(email, secret);
  return timingSafeEqual(token, expected) ? email : null;
}

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
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
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

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
