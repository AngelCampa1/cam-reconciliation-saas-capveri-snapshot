"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import {
  captureMarketingException,
  isExpectedBrowserTransportError,
} from "@/lib/sentry";

/**
 * Mounts the worker-hosted CapVeri AI-SDR sales widget on high-intent marketing
 * pages. The widget runtime (chrome, launcher, CSS, mobile handling, founder
 * booking) is served by the AI-SDR worker as a versioned global script, so this
 * component only loads that script, hands it a same-origin signing function, and
 * tears the widget down when the visitor leaves a high-intent page.
 */

const DEFAULT_WORKER_URL =
  "https://ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev";

const WORKER_URL = (
  process.env.NEXT_PUBLIC_AI_SDR_WORKER_URL ?? DEFAULT_WORKER_URL
).replace(/\/+$/, "");

// Pin the client version so a worker-side rollout cannot silently change the
// widget our pages load. Bump deliberately after verifying the new client.
const CLIENT_VERSION = "v0.3.7";
const SCRIPT_SRC = `${WORKER_URL}/client/${CLIENT_VERSION}/ai-sdr.global.js`;
const SCRIPT_ID = "ventora-ai-sdr-client";

// Subresource Integrity pin for the AI-SDR client. The browser refuses to run the
// script unless its bytes match this hash, so a compromised or swapped worker build
// cannot execute on our pages. The worker returns CORS headers for www.capveri.com,
// so crossOrigin="anonymous" lets SRI verify.
// NOTE: the worker serves the SAME client bytes under every /client/<version>/ path
// (versioning is nominal; it is one embedded build, not a frozen per-version asset),
// so this hash tracks the worker's CURRENT client build. Recompute and bump it
// whenever the worker's bundled client changes, not just on a version-string bump:
//   curl -s "$WORKER/client/<version>/ai-sdr.global.js" | openssl dgst -sha384 -binary | openssl base64 -A
const CLIENT_INTEGRITY =
  "sha384-qHqz7vVH6wFxTARB7MmTreXpz5j531VZD8CE35v8MKtr3TmEuWEXjPyHWuTge0/j";

const PRODUCT_ID = "capveri";
const VISITOR_STORAGE_KEY = "capveri.ai-sdr.visitor-id";

// Pages where a buying question is most likely. Matched by path prefix so nested
// routes (e.g. /tools/cam-billing-error-estimator) are covered.
const HIGH_INTENT_PREFIXES = [
  "/pricing",
  "/sample-report",
  "/contact",
  "/roi",
  "/product-tour",
  "/tools",
];

type SignedAssertion = {
  timestamp: string;
  nonce: string;
  signature: string;
};

type SignRequestInput = {
  method: string;
  path: string;
  body: unknown;
  // The widget runtime also passes its own serialized body, but we intentionally
  // ignore it and let the BFF canonicalize from `body`. The worker re-parses and
  // re-canonicalizes the request body the same way, so signing from `body` keeps
  // the signature in lockstep with what the worker hashes.
  serializedBody: string;
};

type AiSdrInitConfig = {
  baseUrl: string;
  session: {
    productId: string;
    visitorId?: string;
    metadata?: Record<string, string>;
  };
  signRequest: (input: SignRequestInput) => Promise<SignedAssertion>;
  copy?: Record<string, unknown>;
  analytics?: {
    posthog?: {
      capture(event: string, properties?: Record<string, unknown>): void;
    };
  };
};

type AiSdrWidgetHandle = { destroy(): void };

type AiSdrGlobal = { init(config: AiSdrInitConfig): AiSdrWidgetHandle | null };

declare global {
  interface Window {
    AiSdr?: AiSdrGlobal;
  }
}

// CapVeri-specific, plain-language copy. Defaults from the widget cover the rest.
// Passed humanizer + third-grade gates (grade 2.0); placeholder/emptyHeading keep
// the widget defaults so {productName} resolves to "CapVeri" from the brand preset.
const CAPVERI_COPY: Record<string, unknown> = {
  subtitle: "Ask about pricing, setup, or if it's right for you.",
  emptySuggestions: [
    "Which plan fits my properties?",
    "How does setup work?",
    "Talk to the founder",
  ],
};

function reportAiSdrFailure(error: unknown, operation: string): void {
  if (isExpectedBrowserTransportError(error)) return;

  captureMarketingException(
    error instanceof Error ? error : new Error(String(error)),
    {
      operation,
      path: "/api/ai-sdr/sign",
    },
  );
}

function isHighIntentPath(pathname: string): boolean {
  return HIGH_INTENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function resolveVisitorId(): string {
  try {
    const distinctId = posthog.get_distinct_id?.();
    if (typeof distinctId === "string" && distinctId.length > 0) {
      return distinctId;
    }
  } catch {
    // PostHog may not be initialised yet; fall back to a stored id.
  }

  try {
    const stored = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (stored) {
      return stored;
    }
    const generated = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, generated);
    return generated;
  } catch {
    return crypto.randomUUID();
  }
}

async function signRequest(input: SignRequestInput): Promise<SignedAssertion> {
  let response: Response;
  try {
    response = await fetch("/api/ai-sdr/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: input.method,
        path: input.path,
        body: input.body,
      }),
    });
  } catch (err) {
    reportAiSdrFailure(err, "marketing.ai_sdr.sign");
    throw err;
  }
  if (!response.ok) {
    const error = new Error(`AI-SDR sign request failed: ${response.status}`);
    if (response.status >= 500) {
      reportAiSdrFailure(error, "marketing.ai_sdr.sign");
    }
    throw error;
  }
  return (await response.json()) as SignedAssertion;
}

function loadClientScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AiSdr) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      // The script tag is already in the DOM from an earlier mount. If its load
      // already finished (window.AiSdr is set) we resolve now; otherwise we wait
      // for its load/error. A timeout guards the case where the load event fired
      // before these listeners attached, so the promise still settles.
      if (window.AiSdr) {
        resolve();
        return;
      }
      const timeout = window.setTimeout(() => {
        if (window.AiSdr) {
          resolve();
        } else {
          reject(new Error("AI-SDR client load timed out"));
        }
      }, 10000);
      existing.addEventListener(
        "load",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      existing.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeout);
          reject(new Error("AI-SDR client failed to load"));
        },
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    // Reject the script unless its bytes match the pinned v0.3.7 hash.
    script.integrity = CLIENT_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("AI-SDR client failed to load")),
      { once: true },
    );
    document.head.append(script);
  });
}

export function AiSdrSalesWidget(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isHighIntentPath(pathname)) {
      return;
    }

    let cancelled = false;
    let widget: AiSdrWidgetHandle | null = null;

    void loadClientScript()
      .then(() => {
        if (cancelled || !window.AiSdr) {
          return;
        }
        widget = window.AiSdr.init({
          baseUrl: WORKER_URL,
          session: {
            productId: PRODUCT_ID,
            visitorId: resolveVisitorId(),
            metadata: { source: "marketing", entryPath: pathname },
          },
          signRequest,
          copy: CAPVERI_COPY,
          analytics: { posthog },
        });
      })
      .catch((err) => {
        if (!isExpectedBrowserTransportError(err)) {
          captureMarketingException(
            err instanceof Error ? err : new Error(String(err)),
            {
              operation: "marketing.ai_sdr.load",
              path: SCRIPT_SRC,
            },
          );
        }
        // A failed widget load must never break the page; the worker or network
        // can be unavailable and the marketing page still works without chat.
      });

    return () => {
      cancelled = true;
      widget?.destroy();
    };
  }, [pathname]);

  return null;
}
