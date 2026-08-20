import { describe, expect, it } from "vitest";
import {
  buildHmacPayload,
  signHmacPayload,
  type StableJsonValue,
  stableJson,
} from "../domain/ai-context/signing";

/**
 * Canonical reference algorithm, copied verbatim from `stableJson` in
 * `@ventora/ai-assistant-contracts` — the implementation the ai-cs-worker uses
 * to verify the HMAC. CapVeri's own `stableJson` MUST produce byte-identical
 * output for every body shape, or the cross-worker handshake silently breaks
 * (the BFF signs over the parsed body; the worker re-canonicalizes the wire
 * body, so any divergence in key ordering or serialization fails verification).
 */
function canonicalReference(value: StableJsonValue): string {
  return JSON.stringify(sortReference(value));
}

function sortReference(value: StableJsonValue): StableJsonValue {
  if (Array.isArray(value)) {
    return value.map(sortReference);
  }
  if (value && typeof value === "object") {
    const sorted: { [key: string]: StableJsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) {
        sorted[key] = sortReference(child);
      }
    }
    return sorted;
  }
  return value;
}

describe("ai-context signing canonicalization parity", () => {
  // The real AI-CS request bodies the BFF signs and the worker verifies.
  const realBodies: Array<{ name: string; body: StableJsonValue }> = [
    {
      name: "/v1/sessions body",
      body: {
        appId: "capveri",
        userId: "user-123",
        currentPath: "/dashboard",
        metadata: { plan: "pro", role: "landlord" },
      },
    },
    {
      name: "/v1/chat body",
      body: {
        sessionId: "session-abc",
        message: "how do I upload a rent roll?",
        history: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      },
    },
    {
      name: "/v1/escalations body",
      body: {
        sessionId: "session-abc",
        reason: "needs a human",
        message: "I am stuck on the import step",
        contact: { email: "owner@example.com" },
      },
    },
  ];

  for (const { name, body } of realBodies) {
    it(`matches the canonical contract for ${name}`, () => {
      expect(stableJson(body)).toBe(canonicalReference(body));
    });
  }

  // Keys with uppercase letters, underscores, or digits sort differently under
  // a locale-aware comparator than under the default code-unit `.sort()` the
  // worker uses. These lock CapVeri to the code-unit ordering so a future body
  // gaining such a key can never silently desync the handshake.
  const adversarialKeyBodies: Array<{ name: string; body: StableJsonValue }> = [
    { name: "uppercase vs lowercase", body: { Zeta: 1, apple: 2 } },
    { name: "underscore-prefixed", body: { _x: 1, ax: 2, Bx: 3 } },
    { name: "mixed case + underscore", body: { appId: 1, AppName: 2, app_id: 3 } },
    { name: "digit-leading keys", body: { "1k": 1, ak: 2, "0k": 3 } },
  ];

  for (const { name, body } of adversarialKeyBodies) {
    it(`uses code-unit key ordering for ${name}`, () => {
      expect(stableJson(body)).toBe(canonicalReference(body));
    });
  }

  it("orders uppercase before lowercase (code-unit, not locale)", () => {
    // Locale-aware sorting would put "apple" first; code-unit puts "Zeta" first.
    expect(stableJson({ Zeta: 1, apple: 2 })).toBe('{"Zeta":1,"apple":2}');
  });

  it("drops undefined object values like the canonical contract", () => {
    const body = { a: 1, b: undefined, c: 3 } as unknown as StableJsonValue;
    expect(stableJson(body)).toBe('{"a":1,"c":3}');
  });

  it("produces an identical HMAC signature to the canonical body hash", async () => {
    const secret = "shared-assertion-secret";
    const timestamp = "2026-06-20T00:00:00.000Z";
    const nonce = "nonce123";
    const body: StableJsonValue = {
      sessionId: "session-abc",
      message: "how do I upload a rent roll?",
      history: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    };

    const payload = await buildHmacPayload({
      timestamp,
      nonce,
      method: "post",
      path: "/v1/chat",
      body,
    });

    // The worker rebuilds the same payload string from the canonical reference.
    const bodyHash = await sha256HexReference(canonicalReference(body));
    const expectedPayload = `${timestamp}.${nonce}.POST./v1/chat.${bodyHash}`;
    expect(payload).toBe(expectedPayload);

    const signature = await signHmacPayload(payload, secret);
    const expectedSignature = await signHmacPayload(expectedPayload, secret);
    expect(signature).toBe(expectedSignature);
  });
});

async function sha256HexReference(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
