import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  CoreDataRepository,
  DeleteLeaseTermVersionResult,
  LeaseRecord,
  LeaseTermVersionRecord,
  LeaseTermVersionSummaryRecord,
  PropertyRecord,
  UnitRecord,
} from "../domain/core-data/repository";
import type { AppEnv } from "../env";
import { createCoreDataRoutes } from "../http/core-data-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROPERTY_ID = "33333333-3333-4333-8333-333333333334";
const UNIT_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_UNIT_ID = "44444444-4444-4444-8444-444444444445";
const LEASE_ID = "55555555-5555-4555-8555-555555555555";
const TERM_VERSION_ID = "66666666-6666-4666-8666-666666666666";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryCoreDataRepository implements CoreDataRepository {
  fullAccess = true;
  duplicateUnit = false;
  listPropertiesCalls = 0;
  finalizedPropertyReferenceCount = 0;
  finalizedDeletedLeaseReferenceCount = 0;
  finalizedLeaseReferenceCount = 0;
  readonly properties = new Map<string, PropertyRecord>([
    [
      PROPERTY_ID,
      {
        id: PROPERTY_ID,
        organization_id: ORG_ID,
        name: "Metro Center",
        address_line1: "100 Main St",
        address_line2: null,
        city: "Austin",
        state: "TX",
        postal_code: "78701",
        total_rentable_sqft: "10000",
        total_usable_sqft: "9000",
        common_area_sqft: "1000",
        target_occupancy: "0.95",
        boma_standard_version: "2024",
        rsf_measurement_date: null,
        fiscal_year_start_month: 1,
        tax_protest_county: null,
        tax_protest_deadline_override: null,
        created_at: "2026-06-12T00:00:00Z",
        updated_at: "2026-06-12T00:00:00Z",
      },
    ],
    [
      OTHER_PROPERTY_ID,
      {
        id: OTHER_PROPERTY_ID,
        organization_id: OTHER_ORG_ID,
        name: "Other Org Plaza",
        address_line1: "200 Main St",
        address_line2: null,
        city: "Dallas",
        state: "TX",
        postal_code: "75201",
        total_rentable_sqft: "20000",
        total_usable_sqft: "18000",
        common_area_sqft: "2000",
        target_occupancy: "0.95",
        boma_standard_version: "2024",
        rsf_measurement_date: null,
        fiscal_year_start_month: 1,
        tax_protest_county: null,
        tax_protest_deadline_override: null,
        created_at: "2026-06-13T00:00:00Z",
        updated_at: "2026-06-13T00:00:00Z",
      },
    ],
  ]);
  readonly units = new Map<string, UnitRecord>([
    [
      UNIT_ID,
      {
        id: UNIT_ID,
        property_id: PROPERTY_ID,
        unit_number: "100",
        rentable_sqft: "1000",
        usable_sqft: "900",
        floor: 1,
        status: "vacant",
        space_type: "office",
        created_at: "2026-06-12T00:00:00Z",
        updated_at: "2026-06-12T00:00:00Z",
      },
    ],
    [
      OTHER_UNIT_ID,
      {
        id: OTHER_UNIT_ID,
        property_id: OTHER_PROPERTY_ID,
        unit_number: "200",
        rentable_sqft: "1000",
        usable_sqft: "900",
        floor: 2,
        status: "vacant",
        space_type: "office",
        created_at: "2026-06-12T00:00:00Z",
        updated_at: "2026-06-12T00:00:00Z",
      },
    ],
  ]);
  readonly leases = new Map<string, LeaseRecord>([
    [
      LEASE_ID,
      {
        id: LEASE_ID,
        property_id: PROPERTY_ID,
        unit_id: UNIT_ID,
        tenant_name: "Tenant A",
        start_date: "2026-01-01",
        end_date: "2027-01-01",
        status: "active",
        recovery_profile: {
          pro_rata_share: "0.1",
          cap_type: "none",
          gross_up_base_year: false,
          admin_fee_percentage: "0",
          excluded_pools: [],
          base_year_adjustments: [],
        },
        document_url: null,
        created_at: "2026-06-12T00:00:00Z",
        updated_at: "2026-06-12T00:00:00Z",
      },
    ],
  ]);
  readonly termVersions = new Map<string, LeaseTermVersionRecord>([
    [
      TERM_VERSION_ID,
      {
        id: TERM_VERSION_ID,
        lease_id: LEASE_ID,
        version_number: 1,
        effective_date: "2026-01-01",
        base_year: null,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: "0.1",
        cap_type: "none",
        cap_rate: null,
        admin_fee_percentage: "0",
        management_fee_percentage: null,
        excluded_pools: [],
        rsf_measurement_standard: null,
        rsf_measurement_date: null,
        amendment_reason: "Initial terms",
        amendment_document_url: null,
        created_by: USER_ID,
        created_at: "2026-06-12T00:00:00Z",
      },
    ],
  ]);
  finalizedTermReferenceCount = 0;

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async listProperties(input: {
    organizationId: string;
    skip: number;
    limit: number;
  }) {
    this.listPropertiesCalls += 1;
    const rows = [...this.properties.values()]
      .filter((property) => property.organization_id === input.organizationId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));

    return {
      data: rows.slice(input.skip, input.skip + input.limit),
      count: rows.length,
    };
  }

  async getProperty(input: { propertyId: string; organizationId: string }) {
    const property = this.properties.get(input.propertyId);

    return property?.organization_id === input.organizationId ? property : null;
  }

  async createProperty(input: {
    organizationId: string;
    data: Record<string, unknown>;
  }) {
    const property = {
      ...input.data,
      id: "33333333-3333-4333-8333-333333333335",
      organization_id: input.organizationId,
      created_at: "2026-06-14T00:00:00Z",
      updated_at: "2026-06-14T00:00:00Z",
    } as PropertyRecord;
    this.properties.set(property.id, property);

    return property;
  }

  async updateProperty(input: {
    propertyId: string;
    organizationId: string;
    patch: Record<string, unknown>;
  }) {
    const existing = await this.getProperty(input);

    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...input.patch } as PropertyRecord;
    this.properties.set(input.propertyId, updated);

    return updated;
  }

  async deleteProperty(input: { propertyId: string; organizationId: string }) {
    if (this.finalizedPropertyReferenceCount > 0) {
      return {
        state: "finalized_reference" as const,
        finalizedSnapshotCount: this.finalizedPropertyReferenceCount,
      };
    }

    const existing = await this.getProperty(input);

    if (!existing) {
      return { state: "not_found" as const };
    }

    this.properties.delete(input.propertyId);

    return { state: "deleted" as const };
  }

  async listUnits(input: {
    propertyId: string;
    organizationId: string;
    skip: number;
    limit: number;
  }) {
    if (!(await this.getProperty(input))) {
      return null;
    }

    const rows = [...this.units.values()]
      .filter((unit) => unit.property_id === input.propertyId)
      .sort((left, right) => left.unit_number.localeCompare(right.unit_number));

    return {
      data: rows.slice(input.skip, input.skip + input.limit),
      count: rows.length,
    };
  }

  async getUnit(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }) {
    if (!(await this.getProperty(input))) {
      return null;
    }

    const unit = this.units.get(input.unitId);

    return unit?.property_id === input.propertyId ? unit : null;
  }

  async createUnit(input: {
    propertyId: string;
    data: Record<string, unknown>;
  }) {
    if (this.duplicateUnit) {
      throw new Error("duplicate key value violates unique constraint");
    }

    const unit = {
      ...input.data,
      id: "44444444-4444-4444-8444-444444444446",
      property_id: input.propertyId,
      created_at: "2026-06-14T00:00:00Z",
      updated_at: "2026-06-14T00:00:00Z",
    } as UnitRecord;
    this.units.set(unit.id, unit);

    return unit;
  }

  async updateUnit(input: {
    propertyId: string;
    unitId: string;
    patch: Record<string, unknown>;
  }) {
    if (this.duplicateUnit) {
      throw new Error("unique constraint violation");
    }

    const existing = await this.getUnit({
      propertyId: input.propertyId,
      unitId: input.unitId,
      organizationId: ORG_ID,
    });

    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...input.patch } as UnitRecord;
    this.units.set(input.unitId, updated);

    return updated;
  }

  async deleteUnit(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }) {
    const existing = await this.getUnit(input);

    if (!existing) {
      return false;
    }

    this.units.delete(input.unitId);

    return true;
  }

  async listLeases(input: {
    organizationId: string;
    propertyId?: string;
    status?: string;
    skip: number;
    limit: number;
  }) {
    const visiblePropertyIds = new Set(
      [...this.properties.values()]
        .filter((property) => property.organization_id === input.organizationId)
        .map((property) => property.id),
    );
    const rows = [...this.leases.values()]
      .filter((lease) => visiblePropertyIds.has(lease.property_id))
      .filter(
        (lease) => !input.propertyId || lease.property_id === input.propertyId,
      )
      .filter((lease) => !input.status || lease.status === input.status)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));

    return {
      data: rows.slice(input.skip, input.skip + input.limit),
      count: rows.length,
    };
  }

  async getLease(input: { leaseId: string; organizationId: string }) {
    const lease = this.leases.get(input.leaseId);

    if (!lease) {
      return null;
    }

    const property = this.properties.get(lease.property_id);

    return property?.organization_id === input.organizationId ? lease : null;
  }

  async createLease(input: { data: Record<string, unknown> }) {
    const lease = {
      ...input.data,
      id: "55555555-5555-4555-8555-555555555556",
      created_at: "2026-06-14T00:00:00Z",
      updated_at: "2026-06-14T00:00:00Z",
    } as unknown as LeaseRecord;
    this.leases.set(lease.id, lease);

    return lease;
  }

  async updateLease(input: {
    leaseId: string;
    organizationId: string;
    patch: Record<string, unknown>;
  }) {
    if (!(await this.getLease(input))) {
      return null;
    }

    const lease = this.leases.get(input.leaseId);

    if (!lease) {
      return null;
    }

    const updated = { ...lease, ...input.patch } as LeaseRecord;
    this.leases.set(input.leaseId, updated);

    return updated;
  }

  async updateLeaseRecoveryProfile(input: {
    leaseId: string;
    organizationId: string;
    recoveryProfile: Record<string, unknown>;
  }) {
    if (this.finalizedLeaseReferenceCount > 0) {
      return {
        state: "finalized_reference" as const,
        finalizedSnapshotCount: this.finalizedLeaseReferenceCount,
      };
    }

    const lease = await this.updateLease({
      leaseId: input.leaseId,
      organizationId: input.organizationId,
      patch: { recovery_profile: input.recoveryProfile },
    });
    return lease
      ? { state: "updated" as const, lease }
      : { state: "not_found" as const };
  }

  async deleteLease(input: { leaseId: string; organizationId: string }) {
    if (this.finalizedDeletedLeaseReferenceCount > 0) {
      return {
        state: "finalized_reference" as const,
        finalizedSnapshotCount: this.finalizedDeletedLeaseReferenceCount,
      };
    }

    const lease = await this.getLease(input);

    if (!lease) {
      return { state: "not_found" as const };
    }

    this.leases.delete(input.leaseId);

    return { state: "deleted" as const };
  }

  async listLeaseTermVersions(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<LeaseTermVersionSummaryRecord[] | null> {
    if (!(await this.getLease(input))) {
      return null;
    }

    return [...this.termVersions.values()]
      .filter((version) => version.lease_id === input.leaseId)
      .sort((left, right) =>
        right.effective_date.localeCompare(left.effective_date),
      )
      .map((version) => ({
        id: version.id,
        version_number: version.version_number,
        effective_date: version.effective_date,
        pro_rata_share: version.pro_rata_share,
        cap_type: version.cap_type,
        amendment_reason: version.amendment_reason,
        created_at: version.created_at,
      }));
  }

  async getEffectiveLeaseTermVersion(input: {
    leaseId: string;
    organizationId: string;
    asOf: string;
  }): Promise<LeaseTermVersionRecord | null> {
    if (!(await this.getLease(input))) {
      return null;
    }

    return (
      [...this.termVersions.values()]
        .filter((version) => version.lease_id === input.leaseId)
        .filter((version) => version.effective_date <= input.asOf)
        .sort((left, right) =>
          right.effective_date.localeCompare(left.effective_date),
        )[0] ?? null
    );
  }

  async getLeaseTermVersion(input: {
    leaseId: string;
    versionId: string;
    organizationId: string;
  }): Promise<LeaseTermVersionRecord | null> {
    if (!(await this.getLease(input))) {
      return null;
    }

    const version = this.termVersions.get(input.versionId);

    return version?.lease_id === input.leaseId ? version : null;
  }

  async createLeaseTermVersion(input: {
    leaseId: string;
    organizationId: string;
    userId: string;
    data: Record<string, unknown>;
  }): Promise<LeaseTermVersionRecord | null> {
    if (!(await this.getLease(input))) {
      return null;
    }

    const versionNumber =
      Math.max(
        0,
        ...[...this.termVersions.values()]
          .filter((version) => version.lease_id === input.leaseId)
          .map((version) => version.version_number),
      ) + 1;
    const version = {
      id: "66666666-6666-4666-8666-666666666667",
      lease_id: input.leaseId,
      version_number: versionNumber,
      effective_date: String(input.data.effective_date),
      base_year:
        typeof input.data.base_year === "number" ? input.data.base_year : null,
      base_year_amount:
        typeof input.data.base_year_amount === "string"
          ? input.data.base_year_amount
          : null,
      gross_up_base_year: input.data.gross_up_base_year === true,
      pro_rata_share: String(input.data.pro_rata_share),
      cap_type:
        typeof input.data.cap_type === "string" ? input.data.cap_type : "none",
      cap_rate:
        typeof input.data.cap_rate === "string" ? input.data.cap_rate : null,
      admin_fee_percentage: String(input.data.admin_fee_percentage ?? "0"),
      management_fee_percentage:
        typeof input.data.management_fee_percentage === "string"
          ? input.data.management_fee_percentage
          : null,
      excluded_pools: Array.isArray(input.data.excluded_pools)
        ? input.data.excluded_pools.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      rsf_measurement_standard:
        typeof input.data.rsf_measurement_standard === "string"
          ? input.data.rsf_measurement_standard
          : null,
      rsf_measurement_date:
        typeof input.data.rsf_measurement_date === "string"
          ? input.data.rsf_measurement_date
          : null,
      amendment_reason:
        typeof input.data.amendment_reason === "string"
          ? input.data.amendment_reason
          : null,
      amendment_document_url:
        typeof input.data.amendment_document_url === "string"
          ? input.data.amendment_document_url
          : null,
      created_by: input.userId,
      created_at: "2026-06-14T00:00:00Z",
    } satisfies LeaseTermVersionRecord;
    this.termVersions.set(version.id, version);

    return version;
  }

  async deleteLeaseTermVersion(input: {
    leaseId: string;
    versionId: string;
    organizationId: string;
  }): Promise<DeleteLeaseTermVersionResult> {
    const version = await this.getLeaseTermVersion(input);

    if (!version) {
      return { state: "not_found" };
    }
    if (this.finalizedTermReferenceCount > 0) {
      return {
        state: "finalized_reference",
        finalizedSnapshotCount: this.finalizedTermReferenceCount,
      };
    }

    this.termVersions.delete(input.versionId);

    return { state: "deleted" };
  }

  async propertyExists(input: { propertyId: string; organizationId: string }) {
    return Boolean(await this.getProperty(input));
  }

  async unitBelongsToProperty(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }) {
    return Boolean(await this.getUnit(input));
  }
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"] = "member",
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-12T00:00:00Z",
      updatedAt: "2026-06-12T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role,
      isServiceAdmin: false,
      party: role === "tenant" ? "tenant" : "landlord",
      bearerToken: "valid-token",
    },
  };
}

function createTestApp(options: {
  repository?: MemoryCoreDataRepository;
  role?: AuthVariables["auth"]["actor"]["role"];
}) {
  const repository = options.repository ?? new MemoryCoreDataRepository();
  const context = createAuthContext(options.role);
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const auth: AuthRepository = {
    async resolveUserContext() {
      return context;
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route(
    "/api/v1",
    createCoreDataRoutes({
      repository,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

describe("core data routes", () => {
  it("lists properties scoped to the authenticated organization", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      "/api/v1/properties?skip=0&limit=20",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        expect.objectContaining({ id: PROPERTY_ID, organization_id: ORG_ID }),
      ],
      count: 1,
      has_more: false,
    });
  });

  it("rejects a skip beyond MAX_SAFE_INTEGER with 422 instead of reaching the DB", async () => {
    // Guard against the numeric-overflow class: values >= 1e21 stringify in
    // exponent notation ("1e+21"), which Postgres cannot parse as int8 and would
    // otherwise surface as an opaque 500 from OFFSET. The Zod ceiling fails it
    // closed at parse time.
    const { app, repository } = createTestApp({});
    const response = await app.request(
      "/api/v1/properties?skip=999999999999999999999",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.listPropertiesCalls).toBe(0);
  });

  it("requires editor role and full access for property writes", async () => {
    const viewerResponse = await createTestApp({ role: "viewer" }).app.request(
      "/api/v1/properties",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(validPropertyCreate()),
      },
      env(),
    );
    const repository = new MemoryCoreDataRepository();
    repository.fullAccess = false;
    const accessResponse = await createTestApp({ repository }).app.request(
      "/api/v1/properties",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(validPropertyCreate()),
      },
      env(),
    );

    expect(viewerResponse.status).toBe(403);
    expect(accessResponse.status).toBe(402);
  });

  it("rejects empty property patches with FastAPI-compatible detail", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: "No fields to update",
    });
  });

  it("maps duplicate unit writes to 409", async () => {
    const repository = new MemoryCoreDataRepository();
    repository.duplicateUnit = true;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/units`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          unit_number: "100",
          rentable_sqft: "1000",
          usable_sqft: "900",
        }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unit_conflict" },
    });
  });

  it("requires full access for unit writes", async () => {
    const repository = new MemoryCoreDataRepository();
    repository.fullAccess = false;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/units`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          unit_number: "101",
          rentable_sqft: "1000",
          usable_sqft: "900",
        }),
      },
      env(),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "subscription_required" },
    });
  });

  it("rejects property deletes when finalized snapshots reference the property", async () => {
    const repository = new MemoryCoreDataRepository();
    repository.finalizedPropertyReferenceCount = 3;
    const { app } = createTestApp({ repository, role: "admin" });

    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "property_in_finalized_snapshot" },
    });
    expect(repository.properties.has(PROPERTY_ID)).toBe(true);
  });

  it("verifies lease property access and supplied unit ownership", async () => {
    const { app } = createTestApp({});
    const otherPropertyResponse = await app.request(
      "/api/v1/leases",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          validLeaseCreate({ property_id: OTHER_PROPERTY_ID }),
        ),
      },
      env(),
    );
    const otherUnitResponse = await app.request(
      "/api/v1/leases",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(validLeaseCreate({ unit_id: OTHER_UNIT_ID })),
      },
      env(),
    );

    expect(otherPropertyResponse.status).toBe(404);
    await expect(otherPropertyResponse.json()).resolves.toMatchObject({
      detail: "Property not found",
    });
    expect(otherUnitResponse.status).toBe(404);
    await expect(otherUnitResponse.json()).resolves.toMatchObject({
      detail: "Unit not found",
    });
  });

  it("validates merged lease recovery profiles before updating", async () => {
    const { app, repository } = createTestApp({});
    const response = await app.request(
      `/api/v1/leases/${LEASE_ID}/recovery-profile`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ cap_type: "cumulative", cap_rate: null }),
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.leases.get(LEASE_ID)?.recovery_profile).toMatchObject({
      cap_type: "none",
    });
  });

  it("rejects recovery profile updates when the lease has finalized snapshots", async () => {
    const { app, repository } = createTestApp({});
    repository.finalizedLeaseReferenceCount = 2;

    const response = await app.request(
      `/api/v1/leases/${LEASE_ID}/recovery-profile`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ cap_type: "non_cumulative", cap_rate: "0.05" }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "lease_in_finalized_snapshot" },
    });
    expect(repository.leases.get(LEASE_ID)?.recovery_profile).toMatchObject({
      cap_type: "none",
    });
  });

  it("returns not found before finalized conflict for missing recovery profile leases", async () => {
    const { app, repository } = createTestApp({});
    repository.finalizedLeaseReferenceCount = 2;
    const missingLeaseId = "55555555-5555-4555-8555-555555555557";

    const response = await app.request(
      `/api/v1/leases/${missingLeaseId}/recovery-profile`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ cap_type: "none" }),
      },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "lease_not_found" },
    });
  });

  it("normalizes numeric recovery profile decimals to FastAPI response strings", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      "/api/v1/leases",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          validLeaseCreate({
            recovery_profile: {
              pro_rata_share: 0.125,
              base_year_amount: 10000,
              cap_type: "non_cumulative",
              cap_rate: 0.05,
              admin_fee_percentage: 0.1,
              base_year_adjustments: [
                {
                  service_name: "Security",
                  imputed_amount: 250,
                  justification: "Introduced after base year",
                },
              ],
            },
          }),
        ),
      },
      env(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      recovery_profile: {
        pro_rata_share: "0.125",
        base_year_amount: "10000",
        cap_rate: "0.05",
        admin_fee_percentage: "0.1",
        base_year_adjustments: [
          expect.objectContaining({ imputed_amount: "250" }),
        ],
      },
    });
  });

  it("requires editor role for lease writes and recovery profile updates", async () => {
    const { app } = createTestApp({ role: "viewer" });
    const createResponse = await app.request(
      "/api/v1/leases",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(validLeaseCreate()),
      },
      env(),
    );
    const updateResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenant_name: "Blocked Tenant" }),
      },
      env(),
    );
    const recoveryResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}/recovery-profile`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ pro_rata_share: "0.2" }),
      },
      env(),
    );

    expect(createResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
    expect(recoveryResponse.status).toBe(403);
  });

  it("requires full access for lease mutations", async () => {
    const repository = new MemoryCoreDataRepository();
    repository.fullAccess = false;
    const { app } = createTestApp({ repository });
    const createResponse = await app.request(
      "/api/v1/leases",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(validLeaseCreate()),
      },
      env(),
    );
    const updateResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenant_name: "Blocked Tenant" }),
      },
      env(),
    );
    const recoveryResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}/recovery-profile`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ pro_rata_share: "0.2" }),
      },
      env(),
    );

    expect(createResponse.status).toBe(402);
    expect(updateResponse.status).toBe(402);
    expect(recoveryResponse.status).toBe(402);
  });

  it("validates partial updates against existing cross-field constraints", async () => {
    const { app } = createTestApp({});
    const propertyResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ total_usable_sqft: "20000" }),
      },
      env(),
    );
    const unitResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/units/${UNIT_ID}`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ usable_sqft: "2000" }),
      },
      env(),
    );
    const leaseResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ end_date: "2025-01-01" }),
      },
      env(),
    );

    expect(propertyResponse.status).toBe(422);
    expect(unitResponse.status).toBe(422);
    expect(leaseResponse.status).toBe(422);
  });

  it("rejects non-decimal JavaScript numeric strings", async () => {
    const { app } = createTestApp({});
    const propertyResponse = await app.request(
      "/api/v1/properties",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...validPropertyCreate(),
          total_rentable_sqft: "0x2710",
        }),
      },
      env(),
    );
    const recoveryResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}/recovery-profile`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ pro_rata_share: "0x1" }),
      },
      env(),
    );

    expect(propertyResponse.status).toBe(422);
    expect(recoveryResponse.status).toBe(422);
  });

  it("requires admin or owner role for lease deletes", async () => {
    const memberResponse = await createTestApp({ role: "member" }).app.request(
      `/api/v1/leases/${LEASE_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const ownerResponse = await createTestApp({ role: "owner" }).app.request(
      `/api/v1/leases/${LEASE_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(memberResponse.status).toBe(403);
    expect(ownerResponse.status).toBe(204);
  });

  it("rejects lease deletes when finalized snapshots reference the lease", async () => {
    const repository = new MemoryCoreDataRepository();
    repository.finalizedDeletedLeaseReferenceCount = 2;
    const { app } = createTestApp({ repository, role: "owner" });

    const response = await app.request(
      `/api/v1/leases/${LEASE_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "lease_in_finalized_snapshot" },
    });
    expect(repository.leases.has(LEASE_ID)).toBe(true);
  });

  it("lists, fetches, and resolves effective lease term versions", async () => {
    const { app } = createTestApp({});
    const listResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const effectiveResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions/effective?as_of=2026-06-01`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const getResponse = await app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions/${TERM_VERSION_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      {
        id: TERM_VERSION_ID,
        version_number: 1,
        effective_date: "2026-01-01",
        pro_rata_share: "0.1",
        cap_type: "none",
        amendment_reason: "Initial terms",
        created_at: "2026-06-12T00:00:00Z",
      },
    ]);
    expect(effectiveResponse.status).toBe(200);
    await expect(effectiveResponse.json()).resolves.toMatchObject({
      id: TERM_VERSION_ID,
      lease_id: LEASE_ID,
      effective_date: "2026-01-01",
    });
    expect(getResponse.status).toBe(200);
  });

  it("creates lease term versions with incremented version numbers", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          effective_date: "2026-07-01",
          pro_rata_share: 0.125,
          cap_type: "non_cumulative",
          cap_rate: "0.05",
          admin_fee_percentage: 0.1,
          amendment_reason: "Expansion",
        }),
      },
      env(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      lease_id: LEASE_ID,
      version_number: 2,
      effective_date: "2026-07-01",
      pro_rata_share: "0.125",
      cap_type: "non_cumulative",
      cap_rate: "0.05",
      admin_fee_percentage: "0.1",
      amendment_reason: "Expansion",
      created_by: USER_ID,
    });
  });

  it("validates cap rate requirements before creating term versions", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          effective_date: "2026-07-01",
          pro_rata_share: "0.125",
          cap_type: "cumulative",
        }),
      },
      env(),
    );

    expect(response.status).toBe(422);
  });

  it("requires editor access for term version creates", async () => {
    const viewerResponse = await createTestApp({ role: "viewer" }).app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          effective_date: "2026-07-01",
          pro_rata_share: "0.125",
        }),
      },
      env(),
    );
    const repository = new MemoryCoreDataRepository();
    repository.fullAccess = false;
    const accessResponse = await createTestApp({ repository }).app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          effective_date: "2026-07-01",
          pro_rata_share: "0.125",
        }),
      },
      env(),
    );

    expect(viewerResponse.status).toBe(403);
    expect(accessResponse.status).toBe(402);
  });

  it("requires admin role and blocks finalized term version deletes", async () => {
    const memberResponse = await createTestApp({ role: "member" }).app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions/${TERM_VERSION_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const repository = new MemoryCoreDataRepository();
    repository.finalizedTermReferenceCount = 2;
    const conflictResponse = await createTestApp({
      repository,
      role: "admin",
    }).app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions/${TERM_VERSION_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const ownerResponse = await createTestApp({ role: "owner" }).app.request(
      `/api/v1/leases/${LEASE_ID}/term-versions/${TERM_VERSION_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(memberResponse.status).toBe(403);
    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toMatchObject({
      detail: `Cannot delete term version ${TERM_VERSION_ID}: referenced by 2 finalized snapshot(s)`,
    });
    expect(ownerResponse.status).toBe(204);
  });
});

function validPropertyCreate(): Record<string, unknown> {
  return {
    name: "New Tower",
    address_line1: "300 Main St",
    city: "Austin",
    state: "TX",
    postal_code: "78702",
    total_rentable_sqft: "10000",
    total_usable_sqft: "9000",
    common_area_sqft: "1000",
  };
}

function validLeaseCreate(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    property_id: PROPERTY_ID,
    unit_id: UNIT_ID,
    tenant_name: "Tenant B",
    start_date: "2026-01-01",
    end_date: "2027-01-01",
    recovery_profile: {
      pro_rata_share: "0.1",
    },
    ...overrides,
  };
}
