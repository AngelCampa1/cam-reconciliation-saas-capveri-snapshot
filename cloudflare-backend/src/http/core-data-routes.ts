import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresCoreDataRepository } from "../adapters/db/core-data";
import { PostgresIngestionRepository } from "../adapters/db/ingestion";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  isUniqueConstraintError,
  type CoreDataRepository,
  type JsonObject,
} from "../domain/core-data/repository";
import type { IngestionRepository } from "../domain/ingestion/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";
import {
  leaseRecoveryProfilePatchSchema,
  leaseRecoveryProfileSchema,
  normalizeLeaseRecoveryProfile,
} from "./recovery-profile-schema";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type CoreDataRouteDependencies = {
  repository?: CoreDataRepository;
  ingestionRepository?: IngestionRepository;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
const paginationQuerySchema = z.object({
  // Cap offset-style params at MAX_SAFE_INTEGER. Beyond it, .int() precision is
  // already lost and JS renders the number in exponent notation (e.g. 1e+21),
  // which Postgres cannot parse as int8 (SQLSTATE 22P02) — that surfaced as an
  // opaque 500 on absurd `skip` values. This ceiling keeps the value plain-digit
  // and well within int8, so out-of-range input fails closed as a 422.
  skip: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const leaseListQuerySchema = paginationQuerySchema.extend({
  property_id: uuidSchema.optional(),
  status: z.string().trim().min(1).optional(),
});
const decimalInputSchema = z.union([z.number(), z.string()]).refine(
  (value) => {
    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    return isPlainDecimalString(value);
  },
  { message: "Expected decimal string or number" },
);
const positiveDecimalSchema = decimalInputSchema.refine(
  (value) => Number(value) > 0,
  { message: "Expected value greater than 0" },
);
const nonNegativeDecimalSchema = decimalInputSchema.refine(
  (value) => Number(value) >= 0,
  { message: "Expected non-negative value" },
);
const boundedDecimalSchema = (minimum: number, maximum: number) =>
  decimalInputSchema.refine(
    (value) => {
      const numeric = Number(value);

      return numeric >= minimum && numeric <= maximum;
    },
    { message: `Expected decimal between ${minimum} and ${maximum}` },
  );
const stateSchema = z.string().trim().length(2);
const dateSchema = z.string().date();
const propertyBaseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  address_line1: z.string().trim().min(1).max(255),
  address_line2: z.string().max(255).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  state: stateSchema,
  postal_code: z.string().trim().min(1).max(20),
  total_rentable_sqft: positiveDecimalSchema,
  total_usable_sqft: positiveDecimalSchema,
  common_area_sqft: nonNegativeDecimalSchema,
  target_occupancy: boundedDecimalSchema(0, 1).default("0.95"),
  boma_standard_version: z
    .enum(["2010", "2017", "2024", "custom"])
    .default("2024"),
  rsf_measurement_date: dateSchema.nullable().optional(),
  fiscal_year_start_month: z.number().int().min(1).max(12).default(1),
  tax_protest_county: z.string().max(255).nullable().optional(),
  tax_protest_deadline_override: dateSchema.nullable().optional(),
});
const propertyCreateSchema = propertyBaseSchema.refine(
  (property) =>
    Number(property.total_usable_sqft) <= Number(property.total_rentable_sqft),
  {
    path: ["total_usable_sqft"],
    message: "Usable sqft cannot exceed rentable sqft",
  },
);
const propertyUpdateSchema = propertyBaseSchema
  .partial()
  .refine(
    (property) =>
      property.total_usable_sqft === undefined ||
      property.total_rentable_sqft === undefined ||
      Number(property.total_usable_sqft) <=
        Number(property.total_rentable_sqft),
    {
      path: ["total_usable_sqft"],
      message: "Usable sqft cannot exceed rentable sqft",
    },
  );
const unitBaseSchema = z.object({
  unit_number: z.string().trim().min(1).max(50),
  rentable_sqft: positiveDecimalSchema,
  usable_sqft: positiveDecimalSchema,
  floor: z.number().int().min(0).nullable().optional(),
  status: z.enum(["vacant", "occupied", "under_renovation"]).default("vacant"),
  space_type: z
    .enum([
      "office",
      "retail",
      "laboratory",
      "storage",
      "outdoor_amenity",
      "equipment_shaft",
      "other",
    ])
    .default("office"),
});
const unitCreateSchema = unitBaseSchema.refine(
  (unit) => Number(unit.usable_sqft) <= Number(unit.rentable_sqft),
  {
    path: ["usable_sqft"],
    message: "Usable sqft cannot exceed rentable sqft",
  },
);
const unitUpdateSchema = unitBaseSchema
  .partial()
  .refine(
    (unit) =>
      unit.usable_sqft === undefined ||
      unit.rentable_sqft === undefined ||
      Number(unit.usable_sqft) <= Number(unit.rentable_sqft),
    {
      path: ["usable_sqft"],
      message: "Usable sqft cannot exceed rentable sqft",
    },
  );
const leaseStatusSchema = z.enum(["draft", "active", "expired", "terminated"]);
const leaseCreateSchema = z
  .object({
    property_id: uuidSchema,
    unit_id: uuidSchema.nullable().optional(),
    tenant_name: z.string().trim().min(1).max(255),
    start_date: dateSchema,
    end_date: dateSchema,
    status: leaseStatusSchema.default("draft"),
    recovery_profile: leaseRecoveryProfileSchema,
    document_url: z.string().max(2048).nullable().optional(),
  })
  .refine((lease) => lease.end_date > lease.start_date, {
    path: ["end_date"],
    message: "End date must be after start date",
  });
const leaseUpdateSchema = z
  .object({
    unit_id: uuidSchema.nullable().optional(),
    tenant_name: z.string().trim().min(1).max(255).optional(),
    start_date: dateSchema.optional(),
    end_date: dateSchema.optional(),
    status: leaseStatusSchema.optional(),
    recovery_profile: z.unknown().optional(),
    document_url: z.string().max(2048).nullable().optional(),
  })
  .refine(
    (lease) =>
      lease.start_date === undefined ||
      lease.end_date === undefined ||
      lease.end_date > lease.start_date,
    {
      path: ["end_date"],
      message: "End date must be after start date",
    },
  );
const leaseTermVersionCreateSchema = z
  .object({
    effective_date: dateSchema,
    base_year: z.number().int().min(1990).max(2100).nullable().optional(),
    base_year_amount: nonNegativeDecimalSchema.nullable().optional(),
    gross_up_base_year: z.boolean().default(false),
    pro_rata_share: boundedDecimalSchema(0, 1),
    cap_type: z
      .enum(["none", "non_cumulative", "cumulative", "cumulative_compounding"])
      .default("none"),
    cap_rate: boundedDecimalSchema(0, 1).nullable().optional(),
    admin_fee_percentage: boundedDecimalSchema(0, 0.2).default("0"),
    management_fee_percentage: boundedDecimalSchema(0, 0.2)
      .nullable()
      .optional(),
    excluded_pools: z.array(z.string()).default([]),
    rsf_measurement_standard: z.string().max(10).nullable().optional(),
    rsf_measurement_date: dateSchema.nullable().optional(),
    amendment_reason: z.string().nullable().optional(),
    amendment_document_url: z.string().max(2048).nullable().optional(),
  })
  .refine(
    (version) => version.cap_type === "none" || version.cap_rate != null,
    {
      path: ["cap_rate"],
      message: "cap_rate is required when cap_type is not none",
    },
  );

const propertyImportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().optional(),
});

export function createCoreDataRoutes(
  dependencies: CoreDataRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/properties/*", authMiddleware(dependencies.auth));
  app.use("/properties", authMiddleware(dependencies.auth));
  app.use("/leases/*", authMiddleware(dependencies.auth));
  app.use("/leases", authMiddleware(dependencies.auth));

  app.get("/properties", async (c) => {
    const query = paginationQuerySchema.parse(c.req.query());
    const auth = c.get("auth");
    const page = await resolveRepository(c.env, dependencies).listProperties({
      organizationId: auth.actor.organizationId,
      skip: query.skip,
      limit: query.limit,
    });

    return c.json(toPageResponse(page, query.skip, query.limit));
  });

  app.get("/properties/:propertyId", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const property = await getOrgProperty(c, dependencies, propertyId);

    return c.json(property);
  });

  app.post("/properties", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const auth = c.get("auth");
    const body = propertyCreateSchema.parse(await c.req.json());
    const property = await resolveRepository(
      c.env,
      dependencies,
    ).createProperty({
      organizationId: auth.actor.organizationId,
      data: body,
    });

    return c.json(property, 201);
  });

  app.put("/properties/:propertyId", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const patch = removeUndefined(
      propertyUpdateSchema.parse(await c.req.json()),
    );

    rejectEmptyPatch(patch);
    const existing = await getOrgProperty(c, dependencies, propertyId);
    validatePropertyAreaPatch(existing, patch);
    const auth = c.get("auth");
    const property = await resolveRepository(
      c.env,
      dependencies,
    ).updateProperty({
      propertyId,
      organizationId: auth.actor.organizationId,
      patch,
    });

    if (!property) {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    return c.json(property);
  });

  app.delete("/properties/:propertyId", async (c) => {
    await requireAdminAndFullAccess(c, dependencies);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const auth = c.get("auth");
    const result = await resolveRepository(c.env, dependencies).deleteProperty({
      propertyId,
      organizationId: auth.actor.organizationId,
    });

    if (result.state === "not_found") {
      throw new HttpError(404, "property_not_found", "Property not found");
    }
    if (result.state === "finalized_reference") {
      throw new HttpError(
        409,
        "property_in_finalized_snapshot",
        `Cannot delete property ${propertyId}: referenced by ${result.finalizedSnapshotCount} finalized snapshot(s)`,
      );
    }

    return c.body(null, 204);
  });

  app.get("/properties/:propertyId/imports", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const query = propertyImportsQuerySchema.parse(c.req.query());
    const auth = c.get("auth");
    const organizationId = auth.actor.organizationId;

    // Verify the property exists and belongs to this organization.
    const property = await resolveRepository(c.env, dependencies).getProperty({
      propertyId,
      organizationId,
    });
    if (!property) {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    const result = await resolveIngestionRepository(
      c.env,
      dependencies,
    ).listPropertyImports({
      propertyId,
      organizationId,
      page: query.page,
      size: query.size,
      ...(query.status !== undefined ? { status: query.status } : {}),
    });

    const imports = result.imports.map(mapImportBatchSummary);
    return c.json({ imports, total: result.total });
  });

  app.get("/properties/:propertyId/units", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const query = paginationQuerySchema.parse(c.req.query());
    const auth = c.get("auth");
    const page = await resolveRepository(c.env, dependencies).listUnits({
      propertyId,
      organizationId: auth.actor.organizationId,
      skip: query.skip,
      limit: query.limit,
    });

    if (!page) {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    return c.json(toPageResponse(page, query.skip, query.limit));
  });

  app.get("/properties/:propertyId/units/:unitId", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const unitId = uuidSchema.parse(c.req.param("unitId"));
    const unit = await getOrgUnit(c, dependencies, propertyId, unitId);

    return c.json(unit);
  });

  app.post("/properties/:propertyId/units", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    await requirePropertyAccess(c, dependencies, propertyId);
    const body = unitCreateSchema.parse(await c.req.json());

    try {
      const unit = await resolveRepository(c.env, dependencies).createUnit({
        propertyId,
        data: body,
      });

      return c.json(unit, 201);
    } catch (error) {
      throw mapUnitWriteError(error);
    }
  });

  app.put("/properties/:propertyId/units/:unitId", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const unitId = uuidSchema.parse(c.req.param("unitId"));
    await requirePropertyAccess(c, dependencies, propertyId);
    const patch = removeUndefined(unitUpdateSchema.parse(await c.req.json()));

    rejectEmptyPatch(patch);
    const existing = await getOrgUnit(c, dependencies, propertyId, unitId);
    validateUnitAreaPatch(existing, patch);

    try {
      const unit = await resolveRepository(c.env, dependencies).updateUnit({
        propertyId,
        unitId,
        patch,
      });

      if (!unit) {
        throw new HttpError(404, "unit_not_found", "Unit not found");
      }

      return c.json(unit);
    } catch (error) {
      throw mapUnitWriteError(error);
    }
  });

  app.delete("/properties/:propertyId/units/:unitId", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const unitId = uuidSchema.parse(c.req.param("unitId"));
    const auth = c.get("auth");
    const deleted = await resolveRepository(c.env, dependencies).deleteUnit({
      propertyId,
      unitId,
      organizationId: auth.actor.organizationId,
    });

    if (!deleted) {
      throw new HttpError(404, "unit_not_found", "Unit not found");
    }

    return c.body(null, 204);
  });

  app.get("/leases", async (c) => {
    const query = leaseListQuerySchema.parse(c.req.query());
    const auth = c.get("auth");
    const page = await resolveRepository(c.env, dependencies).listLeases({
      organizationId: auth.actor.organizationId,
      ...(query.property_id ? { propertyId: query.property_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      skip: query.skip,
      limit: query.limit,
    });

    return c.json(
      toPageResponse(
        {
          ...page,
          data: page.data.map(normalizeLeaseRecord),
        },
        query.skip,
        query.limit,
      ),
    );
  });

  app.get("/leases/:leaseId", async (c) => {
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const lease = await getOrgLease(c, dependencies, leaseId);

    return c.json(normalizeLeaseRecord(lease));
  });

  app.get("/leases/:leaseId/term-versions", async (c) => {
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const versions = await resolveRepository(
      c.env,
      dependencies,
    ).listLeaseTermVersions({
      leaseId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (!versions) {
      throw new HttpError(404, "lease_not_found", "Lease not found");
    }

    return c.json(versions);
  });

  app.get("/leases/:leaseId/term-versions/effective", async (c) => {
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const asOf = dateSchema.parse(requiredQuery(c, "as_of"));
    const version = await resolveRepository(
      c.env,
      dependencies,
    ).getEffectiveLeaseTermVersion({
      leaseId,
      organizationId: c.get("auth").actor.organizationId,
      asOf,
    });

    if (!version) {
      throw new HttpError(
        404,
        "effective_term_version_not_found",
        `No term version effective on ${asOf} for lease ${leaseId}`,
      );
    }

    return c.json(version);
  });

  app.get("/leases/:leaseId/term-versions/:versionId", async (c) => {
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const versionId = uuidSchema.parse(c.req.param("versionId"));
    const version = await resolveRepository(
      c.env,
      dependencies,
    ).getLeaseTermVersion({
      leaseId,
      versionId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (!version) {
      throw new HttpError(
        404,
        "term_version_not_found",
        `Term version ${versionId} not found`,
      );
    }

    return c.json(version);
  });

  app.post("/leases/:leaseId/term-versions", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const body = leaseTermVersionCreateSchema.parse(await c.req.json());
    const version = await resolveRepository(
      c.env,
      dependencies,
    ).createLeaseTermVersion({
      leaseId,
      organizationId: c.get("auth").actor.organizationId,
      userId: c.get("auth").actor.userId,
      data: serializeLeaseTermVersionCreate(body),
    });

    if (!version) {
      throw new HttpError(404, "lease_not_found", "Lease not found");
    }

    return c.json(version, 201);
  });

  app.delete("/leases/:leaseId/term-versions/:versionId", async (c) => {
    requireAdminOrOwner(c.get("auth").actor.role);
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const versionId = uuidSchema.parse(c.req.param("versionId"));
    const result = await resolveRepository(
      c.env,
      dependencies,
    ).deleteLeaseTermVersion({
      leaseId,
      versionId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (result.state === "not_found") {
      throw new HttpError(
        404,
        "term_version_not_found",
        `Term version ${versionId} not found`,
      );
    }
    if (result.state === "finalized_reference") {
      throw new HttpError(
        409,
        "term_version_in_finalized_snapshot",
        `Cannot delete term version ${versionId}: referenced by ${result.finalizedSnapshotCount} finalized snapshot(s)`,
      );
    }

    return c.body(null, 204);
  });

  app.post("/leases", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const body = leaseCreateSchema.parse(await c.req.json());

    await requirePropertyAccess(c, dependencies, body.property_id);
    if (body.unit_id) {
      await requireUnitAccess(c, dependencies, body.property_id, body.unit_id);
    }

    const lease = await resolveRepository(c.env, dependencies).createLease({
      data: {
        ...body,
        recovery_profile: normalizeLeaseRecoveryProfile(body.recovery_profile),
      },
    });

    return c.json(normalizeLeaseRecord(lease), 201);
  });

  app.put("/leases/:leaseId", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const existing = await getOrgLease(c, dependencies, leaseId);
    const parsed = leaseUpdateSchema.parse(await c.req.json());
    delete parsed.recovery_profile;
    const patch = removeUndefined(parsed);

    rejectEmptyPatch(patch);
    validateLeaseDatePatch(existing, patch);
    if (patch.unit_id) {
      await requireUnitAccess(
        c,
        dependencies,
        existing.property_id,
        String(patch.unit_id),
      );
    }

    const lease = await resolveRepository(c.env, dependencies).updateLease({
      leaseId,
      organizationId: c.get("auth").actor.organizationId,
      patch,
    });

    if (!lease) {
      throw new HttpError(404, "lease_not_found", "Lease not found");
    }

    return c.json(normalizeLeaseRecord(lease));
  });

  app.get("/leases/:leaseId/recovery-profile", async (c) => {
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const lease = await getOrgLease(c, dependencies, leaseId);

    return c.json(normalizeLeaseRecoveryProfile(lease.recovery_profile));
  });

  app.put("/leases/:leaseId/recovery-profile", async (c) => {
    await requireEditorAndFullAccess(c, dependencies);
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const existing = await getOrgLease(c, dependencies, leaseId);
    const patch = leaseRecoveryProfilePatchSchema.parse(await c.req.json());
    const merged = normalizeLeaseRecoveryProfile({
      ...existing.recovery_profile,
      ...patch,
    });
    const result = await resolveRepository(
      c.env,
      dependencies,
    ).updateLeaseRecoveryProfile({
      leaseId,
      organizationId: c.get("auth").actor.organizationId,
      recoveryProfile: merged,
    });

    if (result.state === "not_found") {
      throw new HttpError(404, "lease_not_found", "Lease not found");
    }
    if (result.state === "finalized_reference") {
      throw new HttpError(
        409,
        "lease_in_finalized_snapshot",
        `Cannot update lease ${leaseId}: referenced by ${result.finalizedSnapshotCount} finalized snapshot(s)`,
      );
    }

    return c.json(normalizeLeaseRecord(result.lease));
  });

  app.delete("/leases/:leaseId", async (c) => {
    await requireAdminAndFullAccess(c, dependencies);
    const leaseId = uuidSchema.parse(c.req.param("leaseId"));
    const auth = c.get("auth");
    const result = await resolveRepository(c.env, dependencies).deleteLease({
      leaseId,
      organizationId: auth.actor.organizationId,
    });

    if (result.state === "not_found") {
      throw new HttpError(404, "lease_not_found", "Lease not found");
    }
    if (result.state === "finalized_reference") {
      throw new HttpError(
        409,
        "lease_in_finalized_snapshot",
        `Cannot delete lease ${leaseId}: referenced by ${result.finalizedSnapshotCount} finalized snapshot(s)`,
      );
    }

    return c.body(null, 204);
  });

  return app;
}

function normalizeLeaseRecord<Row extends { recovery_profile: JsonObject }>(
  lease: Row,
): Row {
  return {
    ...lease,
    recovery_profile: normalizeLeaseRecoveryProfile(lease.recovery_profile),
  };
}

function toPageResponse<Row>(
  page: { data: Row[]; count: number },
  skip: number,
  limit: number,
): { data: Row[]; count: number; has_more: boolean } {
  return {
    data: page.data,
    count: page.count,
    has_more: page.count > skip + limit,
  };
}

async function getOrgProperty(
  c: RouteContext,
  dependencies: CoreDataRouteDependencies,
  propertyId: string,
) {
  const auth = c.get("auth");
  const property = await resolveRepository(c.env, dependencies).getProperty({
    propertyId,
    organizationId: auth.actor.organizationId,
  });

  if (!property) {
    throw new HttpError(404, "property_not_found", "Property not found");
  }

  return property;
}

async function getOrgUnit(
  c: RouteContext,
  dependencies: CoreDataRouteDependencies,
  propertyId: string,
  unitId: string,
) {
  const auth = c.get("auth");
  const unit = await resolveRepository(c.env, dependencies).getUnit({
    propertyId,
    unitId,
    organizationId: auth.actor.organizationId,
  });

  if (!unit) {
    throw new HttpError(404, "unit_not_found", "Unit not found");
  }

  return unit;
}

async function getOrgLease(
  c: RouteContext,
  dependencies: CoreDataRouteDependencies,
  leaseId: string,
) {
  const auth = c.get("auth");
  const lease = await resolveRepository(c.env, dependencies).getLease({
    leaseId,
    organizationId: auth.actor.organizationId,
  });

  if (!lease) {
    throw new HttpError(404, "lease_not_found", "Lease not found");
  }

  return lease;
}

async function requirePropertyAccess(
  c: RouteContext,
  dependencies: CoreDataRouteDependencies,
  propertyId: string,
): Promise<void> {
  const auth = c.get("auth");
  const exists = await resolveRepository(c.env, dependencies).propertyExists({
    propertyId,
    organizationId: auth.actor.organizationId,
  });

  if (!exists) {
    throw new HttpError(404, "property_not_found", "Property not found");
  }
}

async function requireUnitAccess(
  c: RouteContext,
  dependencies: CoreDataRouteDependencies,
  propertyId: string,
  unitId: string,
): Promise<void> {
  const auth = c.get("auth");
  const exists = await resolveRepository(
    c.env,
    dependencies,
  ).unitBelongsToProperty({
    propertyId,
    unitId,
    organizationId: auth.actor.organizationId,
  });

  if (!exists) {
    throw new HttpError(404, "unit_not_found", "Unit not found");
  }
}

function requireLandlordEditor(
  role: AuthVariables["auth"]["actor"]["role"],
): void {
  if (role === "owner" || role === "admin" || role === "member") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireAdminOrOwner(
  role: AuthVariables["auth"]["actor"]["role"],
): void {
  if (role === "owner" || role === "admin") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

async function requireEditorAndFullAccess(
  c: RouteContext,
  dependencies: CoreDataRouteDependencies,
): Promise<void> {
  requireLandlordEditor(c.get("auth").actor.role);
  await requireFullAccess(c, dependencies);
}

async function requireAdminAndFullAccess(
  c: RouteContext,
  dependencies: CoreDataRouteDependencies,
): Promise<void> {
  requireAdminOrOwner(c.get("auth").actor.role);
  await requireFullAccess(c, dependencies);
}

async function requireFullAccess(
  c: RouteContext,
  dependencies: CoreDataRouteDependencies,
): Promise<void> {
  const auth = c.get("auth");

  if (
    await resolveRepository(c.env, dependencies).hasFullAccess(
      auth.actor.organizationId,
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

function rejectEmptyPatch(patch: JsonObject): void {
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "empty_patch", "No fields to update");
  }
}

function removeUndefined(record: Record<string, unknown>): JsonObject {
  return Object.fromEntries(
    Object.entries(record).filter((entry) => entry[1] !== undefined),
  );
}

function requiredQuery(c: RouteContext, key: string): string {
  const value = c.req.query(key);
  if (!value) {
    throw new HttpError(422, "missing_query_parameter", `${key} is required`);
  }

  return value;
}

function serializeLeaseTermVersionCreate(
  body: z.infer<typeof leaseTermVersionCreateSchema>,
): JsonObject {
  return removeUndefined({
    effective_date: body.effective_date,
    base_year: body.base_year,
    base_year_amount: serializeOptionalDecimal(body.base_year_amount),
    gross_up_base_year: body.gross_up_base_year,
    pro_rata_share: serializeDecimal(body.pro_rata_share),
    cap_type: body.cap_type,
    cap_rate: serializeOptionalDecimal(body.cap_rate),
    admin_fee_percentage: serializeDecimal(body.admin_fee_percentage),
    management_fee_percentage: serializeOptionalDecimal(
      body.management_fee_percentage,
    ),
    excluded_pools: body.excluded_pools,
    rsf_measurement_standard: body.rsf_measurement_standard,
    rsf_measurement_date: body.rsf_measurement_date,
    amendment_reason: body.amendment_reason,
    amendment_document_url: body.amendment_document_url,
  });
}

function serializeDecimal(value: string | number): string {
  return String(value);
}

function serializeOptionalDecimal(
  value: string | number | null | undefined,
): string | null | undefined {
  return value === undefined || value === null ? value : String(value);
}

function mapUnitWriteError(error: unknown): Error {
  if (error instanceof HttpError) {
    return error;
  }

  if (isUniqueConstraintError(error)) {
    return new HttpError(
      409,
      "unit_conflict",
      "Unit already exists in this property",
    );
  }

  return error instanceof Error
    ? error
    : new Error("Unexpected unit write error");
}

function isPlainDecimalString(value: string): boolean {
  const trimmed = value.trim();

  return /^-?(?:\d+|\d+\.\d+|\.\d+)$/.test(trimmed);
}

function validatePropertyAreaPatch(
  existing: JsonObject,
  patch: JsonObject,
): void {
  const rentable = Number(
    patch.total_rentable_sqft ?? existing.total_rentable_sqft,
  );
  const usable = Number(patch.total_usable_sqft ?? existing.total_usable_sqft);

  if (usable > rentable) {
    throw new HttpError(
      422,
      "validation_error",
      "Usable sqft cannot exceed rentable sqft",
    );
  }
}

function validateUnitAreaPatch(existing: JsonObject, patch: JsonObject): void {
  const rentable = Number(patch.rentable_sqft ?? existing.rentable_sqft);
  const usable = Number(patch.usable_sqft ?? existing.usable_sqft);

  if (usable > rentable) {
    throw new HttpError(
      422,
      "validation_error",
      "Usable sqft cannot exceed rentable sqft",
    );
  }
}

function validateLeaseDatePatch(
  existing: { start_date: string; end_date: string },
  patch: JsonObject,
): void {
  const startDate = String(patch.start_date ?? existing.start_date);
  const endDate = String(patch.end_date ?? existing.end_date);

  if (endDate <= startDate) {
    throw new HttpError(
      422,
      "validation_error",
      "End date must be after start date",
    );
  }
}

function resolveRepository(
  env: AppEnv,
  dependencies: CoreDataRouteDependencies,
): CoreDataRepository {
  return (
    dependencies.repository ??
    new PostgresCoreDataRepository(createDirectPostgresExecutor(env))
  );
}

function resolveIngestionRepository(
  env: AppEnv,
  dependencies: CoreDataRouteDependencies,
): IngestionRepository {
  return (
    dependencies.ingestionRepository ??
    new PostgresIngestionRepository(createDirectPostgresExecutor(env))
  );
}

/**
 * Map a raw import_batches DB row to the ImportBatchSummary shape,
 * replicating Python's field fallback logic exactly:
 *   rows_processed = int(batch.get("rows_processed", batch.get("row_count", 0)) or 0)
 *   rows_failed    = int(batch.get("rows_failed",    batch.get("error_count", 0)) or 0)
 *   rows_imported  = int(batch.get("rows_imported",  max(rows_processed-rows_failed,0)) or 0)
 *   filename       = batch.get("filename",   batch.get("file_name", ""))
 *   parser_type    = batch.get("parser_type",batch.get("source_system", ""))
 */
function mapImportBatchSummary(batch: {
  id: string;
  filename: string | null;
  file_name: string | null;
  status: string;
  parser_type: string | null;
  source_system: string | null;
  rows_processed: number | null;
  row_count: number | null;
  rows_failed: number | null;
  error_count: number | null;
  rows_imported: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}): {
  id: string;
  filename: string;
  status: string;
  parser_type: string;
  rows_processed: number;
  rows_imported: number;
  rows_failed: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
} {
  const rows_processed = Math.trunc(
    Number(batch.rows_processed ?? batch.row_count ?? 0) || 0,
  );
  const rows_failed = Math.trunc(
    Number(batch.rows_failed ?? batch.error_count ?? 0) || 0,
  );
  const rows_imported = Math.trunc(
    Number(batch.rows_imported ?? Math.max(rows_processed - rows_failed, 0)) ||
      0,
  );
  return {
    id: batch.id,
    filename: batch.filename ?? batch.file_name ?? "",
    status: batch.status,
    parser_type: batch.parser_type ?? batch.source_system ?? "",
    rows_processed,
    rows_imported,
    rows_failed,
    created_at: batch.created_at,
    completed_at: batch.completed_at ?? null,
    error_message: batch.error_message ?? null,
  };
}
