import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../env";

export type JsonBody = Record<string, unknown> | readonly unknown[];

export function json(
  c: Context<{ Bindings: AppEnv }>,
  body: JsonBody,
  status: ContentfulStatusCode = 200,
): Response {
  return c.json(body, status);
}
