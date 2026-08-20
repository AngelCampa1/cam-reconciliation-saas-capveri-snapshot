import { Hono } from "hono";
import { ZodError } from "zod";
import type { AppEnv } from "../env";
import {
  bomaCalculationSchema,
  calculateBoma2024,
  calculateFixedCam,
  calculateHcad,
  fixedCamCalculationSchema,
  hcadCalculationSchema,
  ToolCalculationError,
} from "../domain/tools/calculators";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv };

export function createToolsRoutes(): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, toolsRouteError(error)));

  app.post("/tools/boma-2024-calculator", async (c) => {
    const body = bomaCalculationSchema.parse(await parseJsonBody(c));

    return c.json(calculateBoma2024(body));
  });

  app.post("/tools/hcad-tax-normalizer/calculate", async (c) => {
    const body = hcadCalculationSchema.parse(await parseJsonBody(c));

    return c.json(calculateHcad(body));
  });

  app.post("/tools/fixed-cam-modeler", async (c) => {
    const body = fixedCamCalculationSchema.parse(await parseJsonBody(c));

    return c.json(calculateFixedCam(body));
  });

  return app;
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export function toolsRouteError(error: unknown): HttpError | unknown {
  if (error instanceof ToolCalculationError) {
    return new HttpError(error.status, "invalid_tool_input", error.detail);
  }

  if (error instanceof ZodError) {
    return new HttpError(
      422,
      "validation_error",
      error.issues[0]?.message ?? "Invalid input",
    );
  }

  return error;
}
