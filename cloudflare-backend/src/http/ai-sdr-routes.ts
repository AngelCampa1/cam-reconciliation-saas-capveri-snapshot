import { Hono } from "hono";
import {
  DurableObjectAiContextNonceConsumer,
  type AiContextNonceConsumer,
} from "../adapters/ai-context/nonce";
import {
  buildAiSdrProductContext,
  productContextAsStableJson,
} from "../domain/ai-context/public-knowledge";
import {
  buildHmacPayload,
  requireSignedHeaders,
  signHmacPayload,
  verifyHmacSignature,
} from "../domain/ai-context/signing";
import type { AppEnv } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type AiSdrRouteDependencies = {
  nonceConsumer?: AiContextNonceConsumer;
};

const productId = "capveri";

export function createAiSdrRoutes(
  dependencies: AiSdrRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.get("/ai-sdr/product-context", async (c) => {
    const url = new URL(c.req.raw.url);
    const requestedProductId =
      url.searchParams.get("productId") ?? url.searchParams.get("product_id");

    if (requestedProductId !== productId) {
      throw new HttpError(404, "unknown_product", "Unknown product");
    }

    const secret = contextSecret(c.env);
    if (!secret) {
      throw new HttpError(
        503,
        "product_context_unavailable",
        "Product context unavailable",
      );
    }

    const signedHeaders = requireSignedHeaders(c.req.raw.headers);
    const requestPath = `${url.pathname}${url.search}`;
    const requestBody = { productId: requestedProductId };
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

    const body = buildAiSdrProductContext();
    const responseTimestamp = new Date().toISOString();
    const responseNonce = crypto.randomUUID().replace(/-/gu, "");
    const responsePayload = await buildHmacPayload({
      timestamp: responseTimestamp,
      nonce: responseNonce,
      method: "GET",
      path: requestPath,
      body: productContextAsStableJson(body),
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

  return app;
}

function resolveNonceConsumer(
  env: AppEnv,
  dependencies: AiSdrRouteDependencies,
): AiContextNonceConsumer {
  return (
    dependencies.nonceConsumer ?? new DurableObjectAiContextNonceConsumer(env)
  );
}

function contextSecret(env: AppEnv): string {
  return (
    env.AI_SDR_PRODUCT_CONTEXT_SECRET?.trim() ||
    env.AI_SDR_CONTEXT_SECRET?.trim() ||
    ""
  );
}
