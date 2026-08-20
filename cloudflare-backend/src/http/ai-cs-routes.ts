import { Hono } from "hono";
import {
  DurableObjectAiContextNonceConsumer,
  type AiContextNonceConsumer,
} from "../adapters/ai-context/nonce";
import {
  appContextAsStableJson,
  buildAiCsAppContext,
  sanitizeCurrentPath,
} from "../domain/ai-context/public-knowledge";
import {
  buildHmacPayload,
  requireSignedHeaders,
  signHmacPayload,
  type StableJsonValue,
  verifyHmacSignature,
} from "../domain/ai-context/signing";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type AiCsRouteDependencies = {
  nonceConsumer?: AiContextNonceConsumer;
  auth?: AuthMiddlewareOptions;
};

const productId = "capveri";

/**
 * The only ai-cs-worker paths the browser widget is allowed to have signed.
 * Signing is scoped to these so an authenticated user cannot turn the BFF into
 * a general-purpose oracle for arbitrary worker requests.
 */
const SIGNABLE_WORKER_PATHS: ReadonlySet<string> = new Set([
  "/v1/sessions",
  "/v1/chat",
  "/v1/escalations",
]);

export function createAiCsRoutes(
  dependencies: AiCsRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/ai-cs/*", authMiddleware(dependencies.auth));

  app.get("/ai-cs/app-context", async (c) => {
    const url = new URL(c.req.raw.url);
    const appId = url.searchParams.get("appId");
    const userId = url.searchParams.get("userId");
    const currentPath = url.searchParams.get("currentPath");

    if (appId !== productId) {
      throw new HttpError(404, "unknown_app", "Unknown app");
    }

    if (userId !== c.get("auth").actor.userId) {
      throw new HttpError(
        403,
        "user_context_mismatch",
        "User context mismatch",
      );
    }

    const secret = c.env.AI_CS_CONTEXT_SECRET?.trim() ?? "";
    if (!secret) {
      throw new HttpError(
        503,
        "app_context_unavailable",
        "App context unavailable",
      );
    }

    const signedHeaders = requireSignedHeaders(c.req.raw.headers);
    const requestPath = `${url.pathname}${url.search}`;
    // The ai-cs-worker signs the request body as {appId, userId} ONLY; the
    // current page rides in the URL query (covered by the signed path), never
    // in the body. Folding currentPath into the body here would make every real
    // chat's context fetch fail signature verification (401 -> chat 502). See
    // fetchSignedAppContext in @ventora/ai-cs-worker.
    const requestBody: Record<string, string> = {
      appId,
      userId,
    };

    const requestPayload = await buildHmacPayload({
      timestamp: signedHeaders.timestamp,
      nonce: signedHeaders.nonce,
      method: "GET",
      path: requestPath,
      body: requestBody,
    });
    const verified = await verifyHmacSignature({
      payload: requestPayload,
      signature: signedHeaders.signature,
      secret,
      timestamp: signedHeaders.timestamp,
    });

    if (!verified) {
      throw new HttpError(401, "invalid_signature", "Invalid signature");
    }

    const nonceAccepted = await resolveNonceConsumer(
      c.env,
      dependencies,
    ).consume({
      nonce: signedHeaders.nonce,
      timestamp: signedHeaders.timestamp,
    });

    if (!nonceAccepted) {
      throw new HttpError(401, "invalid_signature", "Invalid signature");
    }

    const body = buildAiCsAppContext({
      currentPath: sanitizeCurrentPath(currentPath),
    });
    const responseTimestamp = new Date().toISOString();
    const responseNonce = crypto.randomUUID().replace(/-/gu, "");
    const responsePayload = await buildHmacPayload({
      timestamp: responseTimestamp,
      nonce: responseNonce,
      method: "GET",
      path: requestPath,
      body: appContextAsStableJson(body),
    });
    const response = c.json(body);

    response.headers.set("Cache-Control", "private, max-age=300");
    response.headers.set("X-Ventora-Timestamp", responseTimestamp);
    response.headers.set("X-Ventora-Nonce", responseNonce);
    response.headers.set(
      "X-Ventora-Signature",
      await signHmacPayload(responsePayload, secret),
    );

    return response;
  });

  // Browser-facing BFF: mint a short-lived HMAC assertion so the AI-CS widget
  // can authenticate to the ai-cs-worker without ever holding the secret. The
  // user's normal session (authMiddleware) gates this route; we bind the signed
  // request to that user so it cannot be replayed for another tenant.
  app.post("/ai-cs/sign", async (c) => {
    const secret = c.env.AI_CS_CLIENT_ASSERTION_SECRET?.trim() ?? "";
    if (!secret) {
      throw new HttpError(
        503,
        "app_context_unavailable",
        "App context unavailable",
      );
    }

    const requestBody = await readSignRequest(c.req.raw);
    if (requestBody === null) {
      throw new HttpError(400, "invalid_request", "Invalid sign request");
    }

    if (requestBody.method.toUpperCase() !== "POST") {
      throw new HttpError(400, "invalid_request", "Unsupported method");
    }

    if (!SIGNABLE_WORKER_PATHS.has(requestBody.path)) {
      throw new HttpError(403, "path_not_allowed", "Path not allowed");
    }

    const actorUserId = c.get("auth").actor.userId;
    const payloadBody = requestBody.body;
    // Every signable worker path takes a JSON object body; reject anything else
    // so the actor-binding checks below cannot be sidestepped with a primitive.
    if (!isRecord(payloadBody)) {
      throw new HttpError(400, "invalid_request", "Invalid sign request body");
    }
    // /v1/sessions is the actor-binding boundary: the assertion it mints is what
    // establishes the session, so the body MUST positively identify this actor.
    // Presence-requiring (not presence-permissive) — a body omitting appId/userId
    // must not yield an unbound session assertion. /v1/chat and /v1/escalations
    // carry a sessionId the worker validates for ownership, so they only need the
    // defensive check that any appId/userId present still matches the actor.
    if (requestBody.path === "/v1/sessions") {
      if (payloadBody.appId !== productId) {
        throw new HttpError(403, "app_mismatch", "App mismatch");
      }
      if (payloadBody.userId !== actorUserId) {
        throw new HttpError(
          403,
          "user_context_mismatch",
          "User context mismatch",
        );
      }
    } else {
      if ("appId" in payloadBody && payloadBody.appId !== productId) {
        throw new HttpError(403, "app_mismatch", "App mismatch");
      }
      if ("userId" in payloadBody && payloadBody.userId !== actorUserId) {
        throw new HttpError(
          403,
          "user_context_mismatch",
          "User context mismatch",
        );
      }
    }

    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID().replace(/-/gu, "");
    const payload = await buildHmacPayload({
      timestamp,
      nonce,
      method: "POST",
      path: requestBody.path,
      body: payloadBody,
    });
    const signature = await signHmacPayload(payload, secret);

    return c.json({ timestamp, nonce, signature });
  });

  return app;
}

type SignRequestBody = {
  method: string;
  path: string;
  body: StableJsonValue;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function resolveNonceConsumer(
  env: AppEnv,
  dependencies: AiCsRouteDependencies,
): AiContextNonceConsumer {
  return (
    dependencies.nonceConsumer ?? new DurableObjectAiContextNonceConsumer(env)
  );
}
