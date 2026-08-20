import { Hono, type Context } from "hono";
import { PostgresRentRollRepository } from "../adapters/db/rent-roll";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { parseRentRollCsv } from "../domain/rent-roll/parser";
import type { RentRollRepository } from "../domain/rent-roll/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { decodeCsv } from "./decode-csv";
import { errorResponse, HttpError } from "./errors";
import { readMultipartForm } from "./multipart";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type RentRollRouteDependencies = {
  repository?: RentRollRepository;
  auth?: AuthMiddlewareOptions;
};

const maxUploadBytes = 10 * 1024 * 1024;
const maxMultipartBodyBytes = maxUploadBytes + 1024 * 1024;

export function createRentRollRoutes(
  dependencies: RentRollRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/rent-roll/*", authMiddleware(dependencies.auth));

  app.post("/rent-roll/preview", async (c) => {
    rejectOversizeMultipartBody(c);
    const form = await readMultipartForm(c);
    const file = requiredFile(form, "file");
    const text = await readCsvFile(file);

    return c.json(
      parseRentRollCsv({ text, filename: file.name || "unknown.csv" }),
    );
  });

  app.post("/rent-roll/import", async (c) => {
    requireAdminOrOwner(c);
    await requireFullAccess(c, dependencies);
    rejectOversizeMultipartBody(c);
    const form = await readMultipartForm(c);
    const file = requiredFile(form, "file");
    const text = await readCsvFile(file);
    const preview = parseRentRollCsv({
      text,
      filename: file.name || "unknown.csv",
    });
    if (!preview.success) {
      throw new HttpError(
        400,
        "rent_roll_parse_failed",
        preview.errors[0] ?? "Import failed",
      );
    }
    if (preview.units.length === 0) {
      throw new HttpError(
        400,
        "rent_roll_empty",
        "No units found in rent roll file",
      );
    }

    const propertyName =
      optionalFormString(form, "property_name") ??
      preview.property_metadata.name ??
      "Imported Property";
    const result = await resolveRepository(c.env, dependencies).importRentRoll({
      organizationId: c.get("auth").actor.organizationId,
      propertyName,
      addressLine1:
        optionalFormString(form, "address") ??
        preview.property_metadata.address_line1 ??
        "Unknown Address",
      city:
        optionalFormString(form, "city") ??
        preview.property_metadata.city ??
        "Unknown",
      state:
        optionalFormString(form, "state") ??
        preview.property_metadata.state ??
        "TX",
      postalCode:
        optionalFormString(form, "postal_code") ??
        preview.property_metadata.postal_code ??
        "00000",
      units: preview.units,
    });

    if (result.state === "failed") {
      throw new HttpError(400, "rent_roll_import_failed", result.message);
    }

    return c.json(
      {
        success: true,
        property_id: result.propertyId,
        property_name: result.propertyName,
        units_created: result.unitsCreated,
        leases_created: result.leasesCreated,
        errors: [],
        warnings: preview.warnings,
      },
      201,
    );
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: RentRollRouteDependencies,
): RentRollRepository {
  return (
    dependencies.repository ??
    new PostgresRentRollRepository(createDirectPostgresExecutor(env))
  );
}

function requireAdminOrOwner(c: RouteContext): void {
  const role = c.get("auth").actor.role;
  if (role === "owner" || role === "admin") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

async function requireFullAccess(
  c: RouteContext,
  dependencies: RentRollRouteDependencies,
): Promise<void> {
  if (
    await resolveRepository(c.env, dependencies).hasFullAccess(
      c.get("auth").actor.organizationId,
    )
  ) {
    return;
  }

  throw new HttpError(
    402,
    "subscription_required",
    "subscription_required: An active subscription or trial is required.",
  );
}

function rejectOversizeMultipartBody(c: RouteContext): void {
  const length = c.req.header("content-length");
  if (length && Number(length) > maxMultipartBodyBytes) {
    throw new HttpError(
      413,
      "upload_too_large",
      "File too large. Maximum size is 10MB.",
    );
  }
}

function requiredFile(form: FormData, field: string): File {
  const value = form.get(field);
  if (!(value instanceof File)) {
    throw new HttpError(422, "missing_file", `${field} is required`);
  }

  return value;
}

function optionalFormString(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

async function readCsvFile(file: File): Promise<string> {
  if (file.size > maxUploadBytes) {
    throw new HttpError(
      413,
      "upload_too_large",
      "File too large. Maximum size is 10MB.",
    );
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    throw new HttpError(
      415,
      "unsupported_rent_roll_format",
      "Excel rent roll imports are not supported by the Cloudflare backend yet. Upload CSV.",
    );
  }

  return decodeCsv(await file.arrayBuffer());
}
