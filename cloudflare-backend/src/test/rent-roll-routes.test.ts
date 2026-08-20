import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  RentRollImportInput,
  RentRollImportResult,
  RentRollRepository,
} from "../domain/rent-roll/repository";
import type { AppEnv } from "../env";
import { createRentRollRoutes } from "../http/rent-roll-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryRentRollRepository implements RentRollRepository {
  fullAccess = true;
  imports: RentRollImportInput[] = [];
  result: RentRollImportResult = {
    state: "created",
    propertyId: PROPERTY_ID,
    propertyName: "Imported Property",
    unitsCreated: 2,
    leasesCreated: 1,
  };

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async importRentRoll(
    input: RentRollImportInput,
  ): Promise<RentRollImportResult> {
    this.imports.push(input);

    return this.result;
  }
}

function createTestApp(
  options: {
    repository?: MemoryRentRollRepository;
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
) {
  const repository = options.repository ?? new MemoryRentRollRepository();
  const context = createAuthContext(options.role ?? "admin");
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
    createRentRollRoutes({
      repository,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository };
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"],
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-13T00:00:00Z",
      updatedAt: "2026-06-13T00:00:00Z",
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

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

function authHeaders() {
  return { authorization: "Bearer valid-token" };
}

async function jsonObject(
  response: Response,
): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected JSON object response");
  }

  return body as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected array value");
  }

  return value;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object value");
  }

  return value as Record<string, unknown>;
}

function errorCode(body: Record<string, unknown>): unknown {
  return objectValue(body.error).code;
}

describe("rent roll routes", () => {
  it("previews a CSV rent roll with duplicate and invalid row warnings", async () => {
    const { app } = createTestApp();
    const form = new FormData();
    form.set(
      "file",
      new File([rentRollCsv()], "rent-roll.csv", { type: "text/csv" }),
    );
    const response = await app.request(
      "/api/v1/rent-roll/preview",
      {
        method: "POST",
        headers: authHeaders(),
        body: form,
      },
      env(),
    );
    const body = await jsonObject(response);
    const units = arrayValue(body.units);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.source_system).toBe("yardi_rent_roll");
    expect(body.property_metadata).toEqual({
      name: "Downtown Tower",
      address_line1: "123 Main Street",
      city: "Austin",
      state: "TX",
      postal_code: "78701",
    });
    expect(body.row_count).toBe(2);
    expect(body.total_units).toBe(2);
    expect(body.occupied_units).toBe(1);
    expect(units[0]).toEqual(
      expect.objectContaining({
        unit_number: "100",
        rentable_sqft: "1000.00",
        usable_sqft: "900.00",
        tenant_name: "Acme Retail",
        lease_start: "2026-01-01",
        lease_end: "2026-12-31",
        base_rent: "1200.00",
        cam_share: "0.0525",
      }),
    );
    expect(arrayValue(body.warnings).join("\n")).toContain(
      "Duplicate unit number",
    );
    expect(arrayValue(body.warnings).join("\n")).toContain(
      "Missing or invalid rentable_sqft",
    );
  });

  it("imports a rent roll with overrides and creates property/unit/lease counts", async () => {
    const { app, repository } = createTestApp();
    const form = new FormData();
    form.set(
      "file",
      new File([rentRollCsv()], "rent-roll.csv", { type: "text/csv" }),
    );
    form.set("property_name", "Override Plaza");
    form.set("address", "123 Main");
    form.set("city", "Austin");
    form.set("state", "TX");
    form.set("postal_code", "78701");

    const response = await app.request(
      "/api/v1/rent-roll/import",
      {
        method: "POST",
        headers: authHeaders(),
        body: form,
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        property_id: PROPERTY_ID,
        property_name: "Imported Property",
        units_created: 2,
        leases_created: 1,
      }),
    );
    expect(repository.imports).toHaveLength(1);
    expect(repository.imports[0]).toEqual(
      expect.objectContaining({
        organizationId: ORG_ID,
        propertyName: "Override Plaza",
        addressLine1: "123 Main",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
      }),
    );
    expect(repository.imports[0]?.units).toHaveLength(2);
  });

  it("requires admin or owner and full access for import", async () => {
    const viewer = createTestApp({ role: "viewer" });
    const viewerForm = new FormData();
    viewerForm.set("file", new File([rentRollCsv()], "rent-roll.csv"));
    const viewerResponse = await viewer.app.request(
      "/api/v1/rent-roll/import",
      { method: "POST", headers: authHeaders(), body: viewerForm },
      env(),
    );

    const repository = new MemoryRentRollRepository();
    repository.fullAccess = false;
    const noAccess = createTestApp({ repository });
    const noAccessForm = new FormData();
    noAccessForm.set("file", new File([rentRollCsv()], "rent-roll.csv"));
    const noAccessResponse = await noAccess.app.request(
      "/api/v1/rent-roll/import",
      { method: "POST", headers: authHeaders(), body: noAccessForm },
      env(),
    );
    const viewerBody = await jsonObject(viewerResponse);
    const noAccessBody = await jsonObject(noAccessResponse);

    expect(viewerResponse.status).toBe(403);
    expect(errorCode(viewerBody)).toBe("insufficient_permissions");
    expect(noAccessResponse.status).toBe(402);
    expect(errorCode(noAccessBody)).toBe("subscription_required");
  });

  it("rejects empty and Excel uploads with explicit errors", async () => {
    const { app } = createTestApp();
    const emptyForm = new FormData();
    emptyForm.set("file", new File([""], "empty.csv"));
    const emptyResponse = await app.request(
      "/api/v1/rent-roll/import",
      { method: "POST", headers: authHeaders(), body: emptyForm },
      env(),
    );
    const excelForm = new FormData();
    excelForm.set("file", new File(["not-xlsx"], "rent-roll.xlsx"));
    const excelResponse = await app.request(
      "/api/v1/rent-roll/preview",
      { method: "POST", headers: authHeaders(), body: excelForm },
      env(),
    );
    const emptyBody = await jsonObject(emptyResponse);
    const excelBody = await jsonObject(excelResponse);

    expect(emptyResponse.status).toBe(400);
    expect(errorCode(emptyBody)).toBe("rent_roll_parse_failed");
    expect(excelResponse.status).toBe(415);
    expect(errorCode(excelBody)).toBe("unsupported_rent_roll_format");
  });

  it("decodes a windows-1252 tenant name instead of mojibake (CY5A-3 parity)", async () => {
    // Byte 0xE9 is "é" in windows-1252 but is not valid UTF-8 on its own.
    // file.text() (the old readCsvFile body) always assumes UTF-8 and would
    // replace it with U+FFFD ("�"), silently corrupting the tenant name. The
    // shared decode-csv fallback must recover "é" here, matching the
    // actual-billed/ingestion routes' decode behavior.
    const header = "Unit,Rentable Sqft,Tenant Name\n";
    const row = "100,1000,Caf\xe9 Retail\n";
    const bytes = new Uint8Array(
      [...header].map((char) => char.charCodeAt(0)).concat(
        [...row].map((char) => char.charCodeAt(0)),
      ),
    );

    const { app } = createTestApp();
    const form = new FormData();
    form.set("file", new File([bytes], "rent-roll.csv", { type: "text/csv" }));
    const response = await app.request(
      "/api/v1/rent-roll/preview",
      { method: "POST", headers: authHeaders(), body: form },
      env(),
    );
    const body = await jsonObject(response);
    const units = arrayValue(body.units);

    expect(response.status).toBe(200);
    expect(units[0]).toEqual(
      expect.objectContaining({ tenant_name: "Café Retail" }),
    );
  });
});

function rentRollCsv(): string {
  return [
    "Yardi Voyager Rent Roll Report",
    "Property: Downtown Tower",
    "Address: 123 Main Street, Austin, TX 78701",
    "",
    "Unit,Rentable Sqft,Usable Sqft,Floor,Tenant Name,Lease Start,Lease End,Monthly Rent,Pro Rata Share",
    "100,1000,900,1,Acme Retail,01/01/2026,12/31/2026,$1200.00,5.25%",
    "101,800,720,1,,,,0,",
    "100,1000,900,1,Duplicate Tenant,01/01/2026,12/31/2026,$1000,5%",
    "102,,700,1,Missing RSF,01/01/2026,12/31/2026,$900,4%",
  ].join("\n");
}
