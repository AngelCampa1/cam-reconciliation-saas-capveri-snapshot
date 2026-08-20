import { describe, expect, it } from "vitest";
import {
  buildHmacPayload,
  signPayload,
  stableJson,
  verifySignature,
  type StableJsonValue,
} from "../ai-sdr-hmac";

/**
 * These vectors lock the canonicalisation to the worker's
 * `@ventora/ai-assistant-contracts` `stableJson`, which uses the default
 * UTF-16 code-unit key sort and drops undefined-valued keys. If this lib ever
 * drifts (e.g. back to a locale-aware sort or hand-built strings), the signed
 * payload would stop matching the worker and every /v1/* call would 401.
 */
describe("stableJson canonicalisation", () => {
  it("sorts object keys by UTF-16 code unit, not locale order", () => {
    // Default .sort() orders by code unit: 'A'(65) < '_'(95) < 'a'(97) < 'b'(98).
    // A locale-aware sort would interleave case differently, so this vector
    // catches that specific regression.
    const value: StableJsonValue = { b: 1, a: 2, A: 3, _: 4 };
    expect(stableJson(value)).toBe('{"A":3,"_":4,"a":2,"b":1}');
  });

  it("sorts nested object keys recursively", () => {
    const value: StableJsonValue = {
      outer: { z: 1, a: 2 },
      first: [{ y: 1, x: 2 }],
    };
    expect(stableJson(value)).toBe(
      '{"first":[{"x":2,"y":1}],"outer":{"a":2,"z":1}}',
    );
  });

  it("preserves array order while sorting element keys", () => {
    const value: StableJsonValue = [
      { b: 1, a: 2 },
      { d: 3, c: 4 },
    ];
    expect(stableJson(value)).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
  });

  it("drops undefined-valued keys to match the worker", () => {
    // The widget can pass optional fields that resolve to undefined. The worker
    // drops them before hashing, so this lib must drop them too.
    const value = { a: 1, b: undefined, c: 3 } as unknown as StableJsonValue;
    expect(stableJson(value)).toBe('{"a":1,"c":3}');
  });

  it("serialises primitives exactly like JSON.stringify", () => {
    expect(stableJson("hi")).toBe('"hi"');
    expect(stableJson(42)).toBe("42");
    expect(stableJson(true)).toBe("true");
    expect(stableJson(null)).toBe("null");
  });
});

describe("HMAC envelope round-trip", () => {
  const secret = "test-secret-value";
  const timestamp = "2026-06-20T00:00:00.000Z";
  const nowMs = Date.parse(timestamp);

  it("builds the canonical dotted payload and uppercases the method", () => {
    const payload = buildHmacPayload({
      timestamp,
      nonce: "nonce-1",
      method: "post",
      path: "/v1/chat",
      body: { message: "hi" },
    });
    // timestamp.nonce.METHOD.path.sha256Hex(stableJson(body))
    expect(payload.startsWith(`${timestamp}.nonce-1.POST./v1/chat.`)).toBe(true);
    // The body hash is the sha256 of the canonical body string, hex-encoded.
    expect(payload.split(".").at(-1)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a signature produced from the same payload and secret", () => {
    const payload = buildHmacPayload({
      timestamp,
      nonce: "nonce-2",
      method: "POST",
      path: "/v1/sessions",
      body: { productId: "capveri" },
    });
    const signature = signPayload(payload, secret);
    expect(
      verifySignature({ payload, signature, secret, timestamp, nowMs }),
    ).toBe(true);
  });

  it("rejects a signature signed with a different secret", () => {
    const payload = buildHmacPayload({
      timestamp,
      nonce: "nonce-3",
      method: "POST",
      path: "/v1/chat",
      body: { message: "hi" },
    });
    const signature = signPayload(payload, "other-secret");
    expect(
      verifySignature({ payload, signature, secret, timestamp, nowMs }),
    ).toBe(false);
  });

  it("rejects a signature outside the replay/skew window", () => {
    const payload = buildHmacPayload({
      timestamp,
      nonce: "nonce-4",
      method: "POST",
      path: "/v1/chat",
      body: { message: "hi" },
    });
    const signature = signPayload(payload, secret);
    // Six minutes later is outside the 5-minute window.
    const laterMs = nowMs + 6 * 60 * 1000;
    expect(
      verifySignature({ payload, signature, secret, timestamp, nowMs: laterMs }),
    ).toBe(false);
  });
});
