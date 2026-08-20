import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8846";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local core data E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const supabaseUrl = normalizedLocalSupabaseUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
  );
  const databaseUrl = normalizedLocalDatabaseUrl(
    args["database-url"] ??
      process.env.npm_config_database_url ??
      process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ])) ??
    LOCAL_ANON_KEY;

  if (process.env.CI) fail("Refusing to run local core data E2E in CI.");
  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  let runError;
  let closeError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({ baseUrl, supabaseUrl, anonKey, databaseUrl, index }),
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          supabase_url: supabaseUrl,
          repeat,
          runs,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    runError = error;
  } finally {
    try {
      await worker.close();
    } catch (error) {
      closeError = error;
    }
  }

  if (runError && closeError) {
    console.error(
      `Local core data Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.owner.accessToken);
  const viewerHeaders = jsonAuthHeaders(account.viewer.accessToken);
  const hiddenHeaders = jsonAuthHeaders(account.hidden.accessToken);
  const noAccessHeaders = jsonAuthHeaders(account.noAccess.accessToken);
  const generated = {
    ...account.generated,
    propertyIds: [],
    unitIds: [],
    leaseIds: [],
    termVersionIds: [],
    snapshotIds: [],
  };
  let runError;
  let cleanupError;
  let result;

  try {
    const property = await createProperty(input.baseUrl, ownerHeaders, {
      name: account.propertyName,
      address_line1: "100 Core Data Way",
      city: "Austin",
      state: "TX",
      postal_code: "78701",
      total_rentable_sqft: "12345.67",
      total_usable_sqft: "11111.11",
      common_area_sqft: "1234.56",
      target_occupancy: "0.975",
      boma_standard_version: "2024",
      fiscal_year_start_month: 4,
      tax_protest_county: "Travis",
    });
    generated.propertyIds.push(property.id);
    assertPropertyRecord(property, {
      id: property.id,
      organization_id: account.owner.organizationId,
      name: account.propertyName,
      address_line1: "100 Core Data Way",
      address_line2: null,
      city: "Austin",
      state: "TX",
      postal_code: "78701",
      total_rentable_sqft: "12345.67",
      total_usable_sqft: "11111.11",
      common_area_sqft: "1234.56",
      target_occupancy: "0.9750",
      boma_standard_version: "2024",
      rsf_measurement_date: null,
      fiscal_year_start_month: 4,
      tax_protest_county: "Travis",
      tax_protest_deadline_override: null,
    });

    const viewerProperty = await expectJson(
      `${input.baseUrl}/api/v1/properties/${property.id}`,
      { headers: viewerHeaders, status: 200 },
    );
    assertPropertyRecord(viewerProperty, {
      ...property,
      created_at: undefined,
      updated_at: undefined,
    });
    await expectError(`${input.baseUrl}/api/v1/properties`, {
      method: "POST",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
      body: JSON.stringify(
        validProperty({ name: `Viewer Block ${account.suffix}` }),
      ),
    });
    await expectError(`${input.baseUrl}/api/v1/properties`, {
      method: "POST",
      headers: noAccessHeaders,
      status: 402,
      code: "subscription_required",
      body: JSON.stringify(
        validProperty({ name: `No Access Block ${account.suffix}` }),
      ),
    });
    await expectJson(`${input.baseUrl}/api/v1/properties`, {
      method: "POST",
      headers: ownerHeaders,
      status: 422,
      body: JSON.stringify(
        validProperty({
          name: `Invalid Area ${account.suffix}`,
          total_rentable_sqft: "100",
          total_usable_sqft: "101",
        }),
      ),
    });

    const updatedProperty = await expectJson(
      `${input.baseUrl}/api/v1/properties/${property.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          total_rentable_sqft: "13000.00",
          total_usable_sqft: "11200.00",
          tax_protest_deadline_override: "2026-05-15",
        }),
      },
    );
    assertPropertyRecord(updatedProperty, {
      ...property,
      total_rentable_sqft: "13000.00",
      total_usable_sqft: "11200.00",
      tax_protest_deadline_override: "2026-05-15",
      created_at: undefined,
      updated_at: undefined,
    });
    await expectError(`${input.baseUrl}/api/v1/properties/${property.id}`, {
      method: "PUT",
      headers: ownerHeaders,
      status: 400,
      code: "empty_patch",
      body: JSON.stringify({}),
    });
    await expectError(`${input.baseUrl}/api/v1/properties/${property.id}`, {
      headers: hiddenHeaders,
      status: 404,
      code: "property_not_found",
    });

    const properties = await expectJson(
      `${input.baseUrl}/api/v1/properties?skip=0&limit=10`,
      {
        headers: ownerHeaders,
        status: 200,
      },
    );
    assertPropertyPage(properties, updatedProperty, account);
    await assertPropertyDbParity(sql, updatedProperty);

    const unit = await createUnit(input.baseUrl, ownerHeaders, property.id, {
      unit_number: account.unitNumber,
      rentable_sqft: "2500.50",
      usable_sqft: "2300.25",
      floor: 7,
      status: "vacant",
      space_type: "office",
    });
    generated.unitIds.push(unit.id);
    assertUnitRecord(unit, {
      id: unit.id,
      property_id: property.id,
      unit_number: account.unitNumber,
      rentable_sqft: "2500.50",
      usable_sqft: "2300.25",
      floor: 7,
      status: "vacant",
      space_type: "office",
    });
    await assertUnitDbParity(sql, unit);
    await expectExactError(
      `${input.baseUrl}/api/v1/properties/${property.id}/units`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 409,
        expected: {
          detail: "Unit already exists in this property",
          error: {
            code: "unit_conflict",
            message: "Unit already exists in this property",
          },
        },
        body: JSON.stringify({
          unit_number: account.unitNumber,
          rentable_sqft: "2500.50",
          usable_sqft: "2300.25",
        }),
      },
    );
    const updatedUnit = await expectJson(
      `${input.baseUrl}/api/v1/properties/${property.id}/units/${unit.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({ status: "occupied", usable_sqft: "2310.25" }),
      },
    );
    assertUnitRecord(updatedUnit, {
      ...unit,
      status: "occupied",
      usable_sqft: "2310.25",
      created_at: undefined,
      updated_at: undefined,
    });
    await assertUnitDbParity(sql, updatedUnit);
    await expectExactError(
      `${input.baseUrl}/api/v1/properties/${property.id}/units/${unit.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 422,
        expected: {
          detail: "Usable sqft cannot exceed rentable sqft",
          error: {
            code: "validation_error",
            message: "Usable sqft cannot exceed rentable sqft",
          },
        },
        body: JSON.stringify({ usable_sqft: "3000" }),
      },
    );

    const initialRecoveryProfile = {
      base_year: 2026,
      base_year_amount: "10000",
      gross_up_base_year: true,
      pro_rata_share: "0.125",
      cap_type: "non_cumulative",
      cap_rate: "0.05",
      admin_fee_percentage: "0.02",
      management_fee_percentage: undefined,
      excluded_pools: ["tax"],
      rsf_measurement_standard: undefined,
      rsf_measurement_date: undefined,
      accounting_basis: undefined,
      base_year_adjustments: [
        {
          service_name: "Security",
          imputed_amount: "250",
          justification: "Introduced after base year",
        },
      ],
    };
    const lease = await createLease(input.baseUrl, ownerHeaders, {
      property_id: property.id,
      unit_id: unit.id,
      tenant_name: account.tenantName,
      start_date: "2026-01-01",
      end_date: "2031-12-31",
      status: "active",
      recovery_profile: {
        base_year: 2026,
        base_year_amount: 10000,
        gross_up_base_year: true,
        pro_rata_share: 0.125,
        cap_type: "non_cumulative",
        cap_rate: 0.05,
        admin_fee_percentage: 0.02,
        excluded_pools: ["tax"],
        base_year_adjustments: [
          {
            service_name: "Security",
            imputed_amount: 250,
            justification: "Introduced after base year",
          },
        ],
      },
    });
    generated.leaseIds.push(lease.id);
    assertLeaseRecord(lease, {
      id: lease.id,
      property_id: property.id,
      unit_id: unit.id,
      tenant_name: account.tenantName,
      start_date: "2026-01-01",
      end_date: "2031-12-31",
      status: "active",
      recovery_profile: initialRecoveryProfile,
      document_url: null,
    });
    await assertLeaseDbParity(sql, lease);
    await expectExactError(`${input.baseUrl}/api/v1/leases`, {
      method: "POST",
      headers: ownerHeaders,
      status: 404,
      expected: {
        detail: "Unit not found",
        error: { code: "unit_not_found", message: "Unit not found" },
      },
      body: JSON.stringify({
        property_id: property.id,
        unit_id: account.hiddenUnitId,
        tenant_name: `Bad Unit ${account.suffix}`,
        start_date: "2026-01-01",
        end_date: "2027-01-01",
        recovery_profile: { pro_rata_share: "0.1" },
      }),
    });
    await expectExactError(`${input.baseUrl}/api/v1/leases`, {
      method: "POST",
      headers: viewerHeaders,
      status: 403,
      expected: {
        detail: "Insufficient permissions",
        error: {
          code: "insufficient_permissions",
          message: "Insufficient permissions",
        },
      },
      body: JSON.stringify({
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: `Viewer Lease ${account.suffix}`,
        start_date: "2026-01-01",
        end_date: "2027-01-01",
        recovery_profile: { pro_rata_share: "0.1" },
      }),
    });

    const leaseList = await expectJson(
      `${input.baseUrl}/api/v1/leases?property_id=${property.id}&status=active&skip=0&limit=10`,
      { headers: ownerHeaders, status: 200 },
    );
    assertLeasePage(leaseList, lease, account);

    const recoveryProfile = await expectJson(
      `${input.baseUrl}/api/v1/leases/${lease.id}/recovery-profile`,
      { headers: ownerHeaders, status: 200 },
    );
    assertRecoveryProfile(recoveryProfile, initialRecoveryProfile);
    const patchedRecoveryProfile = {
      ...initialRecoveryProfile,
      cap_type: "cumulative",
      cap_rate: "0.045",
      admin_fee_percentage: "0.025",
    };
    const patchedLease = await expectJson(
      `${input.baseUrl}/api/v1/leases/${lease.id}/recovery-profile`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          cap_type: "cumulative",
          cap_rate: "0.045",
          admin_fee_percentage: "0.025",
        }),
      },
    );
    assertLeaseRecord(patchedLease, {
      ...lease,
      recovery_profile: patchedRecoveryProfile,
      created_at: undefined,
      updated_at: undefined,
    });
    await assertLeaseDbParity(sql, patchedLease);
    await expectExactError(
      `${input.baseUrl}/api/v1/leases/${lease.id}/recovery-profile`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 422,
        expected: {
          detail: "pro_rata_share: Expected decimal between 0 and 1",
          error: {
            code: "validation_error",
            message: "pro_rata_share: Expected decimal between 0 and 1",
          },
        },
        body: JSON.stringify({ pro_rata_share: "0x1" }),
      },
    );

    const version1 = await createTermVersion(
      input.baseUrl,
      ownerHeaders,
      lease.id,
      {
        effective_date: "2026-01-01",
        base_year: 2026,
        base_year_amount: "10000.00",
        gross_up_base_year: true,
        pro_rata_share: 0.125,
        cap_type: "non_cumulative",
        cap_rate: "0.05",
        admin_fee_percentage: 0.02,
        excluded_pools: ["tax"],
        amendment_reason: "Initial local core data terms",
      },
    );
    generated.termVersionIds.push(version1.id);
    const version2 = await createTermVersion(
      input.baseUrl,
      ownerHeaders,
      lease.id,
      {
        effective_date: "2027-01-01",
        pro_rata_share: "0.15000000",
        cap_type: "cumulative",
        cap_rate: "0.04000000",
        admin_fee_percentage: "0.03000000",
        amendment_reason: "Expansion",
      },
    );
    generated.termVersionIds.push(version2.id);
    assertTermVersionRecord(version1, {
      id: version1.id,
      lease_id: lease.id,
      version_number: 1,
      effective_date: "2026-01-01",
      base_year: 2026,
      base_year_amount: "10000.00",
      gross_up_base_year: true,
      pro_rata_share: "0.12500000",
      cap_type: "non_cumulative",
      cap_rate: "0.05000000",
      admin_fee_percentage: "0.02000000",
      management_fee_percentage: null,
      excluded_pools: ["tax"],
      rsf_measurement_standard: null,
      rsf_measurement_date: null,
      amendment_reason: "Initial local core data terms",
      amendment_document_url: null,
      created_by: account.owner.userId,
    });
    assertTermVersionRecord(version2, {
      id: version2.id,
      lease_id: lease.id,
      version_number: 2,
      effective_date: "2027-01-01",
      base_year: null,
      base_year_amount: null,
      gross_up_base_year: false,
      pro_rata_share: "0.15000000",
      cap_type: "cumulative",
      cap_rate: "0.04000000",
      admin_fee_percentage: "0.03000000",
      management_fee_percentage: null,
      excluded_pools: [],
      rsf_measurement_standard: null,
      rsf_measurement_date: null,
      amendment_reason: "Expansion",
      amendment_document_url: null,
      created_by: account.owner.userId,
    });
    await assertTermVersionDbParity(sql, version1);
    await assertTermVersionDbParity(sql, version2);
    await expectExactError(
      `${input.baseUrl}/api/v1/leases/${lease.id}/term-versions`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 422,
        expected: {
          detail: "cap_rate: cap_rate is required when cap_type is not none",
          error: {
            code: "validation_error",
            message: "cap_rate: cap_rate is required when cap_type is not none",
          },
        },
        body: JSON.stringify({
          effective_date: "2028-01-01",
          pro_rata_share: "0.1",
          cap_type: "cumulative",
        }),
      },
    );
    const effective2026 = await expectJson(
      `${input.baseUrl}/api/v1/leases/${lease.id}/term-versions/effective?as_of=2026-06-01`,
      { headers: ownerHeaders, status: 200 },
    );
    const effective2027 = await expectJson(
      `${input.baseUrl}/api/v1/leases/${lease.id}/term-versions/effective?as_of=2027-06-01`,
      { headers: ownerHeaders, status: 200 },
    );
    assertTermVersionRecord(effective2026, {
      ...version1,
      created_at: undefined,
    });
    assertTermVersionRecord(effective2027, {
      ...version2,
      created_at: undefined,
    });
    const termList = await expectJson(
      `${input.baseUrl}/api/v1/leases/${lease.id}/term-versions`,
      {
        headers: ownerHeaders,
        status: 200,
      },
    );
    assertTermVersionSummaryList(termList, [version2, version1]);

    const snapshotId = await insertFinalizedSnapshot(sql, {
      propertyId: property.id,
      leaseId: lease.id,
      termVersionId: version1.id,
      userId: account.owner.userId,
      organizationId: account.owner.organizationId,
    });
    generated.snapshotIds.push(snapshotId);
    await expectError(
      `${input.baseUrl}/api/v1/leases/${lease.id}/term-versions/${version1.id}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
        status: 409,
        code: "term_version_in_finalized_snapshot",
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/leases/${lease.id}/term-versions/${version2.id}`,
      {
        method: "DELETE",
        headers: viewerHeaders,
        status: 403,
        code: "insufficient_permissions",
      },
    );
    await expectEmpty(
      `${input.baseUrl}/api/v1/leases/${lease.id}/term-versions/${version2.id}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
        status: 204,
      },
    );
    generated.termVersionIds = generated.termVersionIds.filter(
      (id) => id !== version2.id,
    );
    await assertCoreRows(sql, {
      propertyId: property.id,
      unitId: unit.id,
      leaseId: lease.id,
      termVersionId: version1.id,
      organizationId: account.owner.organizationId,
    });

    result = {
      index: input.index,
      property_id: property.id,
      unit_id: unit.id,
      lease_id: lease.id,
      finalized_term_version_id: version1.id,
      blocked_snapshot_id: snapshotId,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupGeneratedRows(sql, generated);
      await assertCleanupComplete(sql, generated);
    } catch (error) {
      cleanupError ??= error;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  if (runError && cleanupError) {
    console.error(
      `Local core data cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const created = [];
  try {
    const owner = await createLocalAuthUser(input, {
      email: `core-data-owner-${suffix}@capveri.local`,
      password: `OwnerPass${input.index}Aa1!`,
      fullName: `Local Core Data Owner ${suffix}`,
      organizationName: `Local Core Data Owner Org ${suffix}`,
      role: "owner",
      created,
    });
    const viewer = await createLocalAuthUser(input, {
      email: `core-data-viewer-${suffix}@capveri.local`,
      password: `ViewerPass${input.index}Aa1!`,
      fullName: `Local Core Data Viewer ${suffix}`,
      organizationName: `Local Core Data Viewer Org ${suffix}`,
      role: "viewer",
      created,
    });
    const hidden = await createLocalAuthUser(input, {
      email: `core-data-hidden-${suffix}@capveri.local`,
      password: `HiddenPass${input.index}Aa1!`,
      fullName: `Local Core Data Hidden ${suffix}`,
      organizationName: `Local Core Data Hidden Org ${suffix}`,
      role: "owner",
      created,
    });
    const noAccess = await createLocalAuthUser(input, {
      email: `core-data-no-access-${suffix}@capveri.local`,
      password: `NoAccessPass${input.index}Aa1!`,
      fullName: `Local Core Data No Access ${suffix}`,
      organizationName: `Local Core Data No Access Org ${suffix}`,
      role: "owner",
      created,
    });

    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    const hiddenPropertyId = randomUUID();
    const hiddenUnitId = randomUUID();
    try {
      await sql.begin(async (transaction) => {
        await transaction`
          update users
          set organization_id = ${owner.organizationId}, role = 'viewer', updated_at = now()
          where id = ${viewer.userId}
        `;
        viewer.organizationId = owner.organizationId;
        await transaction`
          insert into subscriptions (organization_id, plan, status, current_period_start, current_period_end)
          values
            (${owner.organizationId}, 'professional', 'active', now(), now() + interval '30 days'),
            (${hidden.organizationId}, 'professional', 'active', now(), now() + interval '30 days')
        `;
        await transaction`
          insert into properties (
            id, organization_id, name, address_line1, city, state, postal_code,
            total_rentable_sqft, total_usable_sqft, common_area_sqft
          )
          values (
            ${hiddenPropertyId}, ${hidden.organizationId}, ${`HIDDEN Core Property ${suffix}`},
            '900 Hidden Way', 'Dallas', 'TX', '75201', 10000, 9000, 1000
          )
        `;
        await transaction`
          insert into units (
            id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status, space_type
          )
          values (${hiddenUnitId}, ${hiddenPropertyId}, 'HIDDEN-1', 1000, 900, 1, 'vacant', 'office')
        `;
      });
    } finally {
      await sql.end({ timeout: 5 });
    }

    return {
      suffix,
      owner,
      viewer,
      hidden,
      noAccess,
      propertyName: `Local Core Property ${suffix}`,
      tenantName: `Local Core Tenant ${suffix}`,
      unitNumber: `LC-${input.index}-${suffix.slice(-4)}`,
      hiddenMarker: `HIDDEN Core Property ${suffix}`,
      hiddenUnitId,
      generated: {
        orgIds: [
          owner.signupOrganizationId,
          viewer.signupOrganizationId,
          hidden.signupOrganizationId,
          noAccess.signupOrganizationId,
        ],
        userIds: [owner.userId, viewer.userId, hidden.userId, noAccess.userId],
        emails: [owner.email, viewer.email, hidden.email, noAccess.email],
        orgNames: [
          owner.organizationName,
          viewer.organizationName,
          hidden.organizationName,
          noAccess.organizationName,
        ],
        propertyIds: [hiddenPropertyId],
        unitIds: [hiddenUnitId],
        leaseIds: [],
        termVersionIds: [],
        snapshotIds: [],
      },
    };
  } catch (error) {
    await cleanupSeededAccounts(input.databaseUrl, created);
    throw error;
  }
}

async function createLocalAuthUser(input, user) {
  const { created, ...userInput } = user;
  const partial = {
    ...userInput,
    userId: "",
    signupOrganizationId: "",
    organizationId: "",
    accessToken: "",
  };
  try {
    const response = await fetch(
      new URL("/auth/v1/signup", input.supabaseUrl),
      {
        method: "POST",
        headers: { apikey: input.anonKey, "content-type": "application/json" },
        body: JSON.stringify({
          email: userInput.email,
          password: userInput.password,
          data: {
            full_name: userInput.fullName,
            organization_name: userInput.organizationName,
          },
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      fail(`Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`);
    const userId = body.user?.id;
    assert(
      typeof userId === "string" && userId !== "",
      "signup user id missing",
    );
    partial.userId = userId;
    created?.push(partial);
    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    let organizationId;
    try {
      await sql`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = ${userId}`;
      await sql`update users set role = ${userInput.role}, full_name = ${userInput.fullName}, updated_at = now() where id = ${userId}`;
      const rows =
        await sql`select organization_id from users where id = ${userId} limit 1`;
      organizationId = rows[0]?.organization_id;
    } finally {
      await sql.end({ timeout: 5 });
    }
    if (typeof organizationId === "string") {
      partial.signupOrganizationId = organizationId;
      partial.organizationId = organizationId;
    }
    const accessToken =
      body.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: userInput.email,
        password: userInput.password,
      }));
    assert(
      typeof accessToken === "string" && accessToken !== "",
      "access token missing",
    );
    assert(
      typeof organizationId === "string" && organizationId !== "",
      "organization id missing",
    );
    partial.accessToken = accessToken;
    return {
      ...partial,
      signupOrganizationId: organizationId,
      organizationId,
    };
  } catch (error) {
    await cleanupSeededAccounts(input.databaseUrl, [partial]);
    throw error;
  }
}

async function signInWithPassword(input) {
  const url = new URL("/auth/v1/token", input.supabaseUrl);
  url.searchParams.set("grant_type", "password");
  const response = await fetch(url, {
    method: "POST",
    headers: { apikey: input.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return undefined;
  return body.access_token;
}

async function createProperty(baseUrl, headers, body) {
  return expectJson(`${baseUrl}/api/v1/properties`, {
    method: "POST",
    headers,
    status: 201,
    body: JSON.stringify(body),
  });
}

async function createUnit(baseUrl, headers, propertyId, body) {
  return expectJson(`${baseUrl}/api/v1/properties/${propertyId}/units`, {
    method: "POST",
    headers,
    status: 201,
    body: JSON.stringify(body),
  });
}

async function createLease(baseUrl, headers, body) {
  return expectJson(`${baseUrl}/api/v1/leases`, {
    method: "POST",
    headers,
    status: 201,
    body: JSON.stringify(body),
  });
}

async function createTermVersion(baseUrl, headers, leaseId, body) {
  return expectJson(`${baseUrl}/api/v1/leases/${leaseId}/term-versions`, {
    method: "POST",
    headers,
    status: 201,
    body: JSON.stringify(body),
  });
}

async function insertFinalizedSnapshot(sql, input) {
  const snapshotId = randomUUID();
  await sql`
    insert into reconciliation_snapshots (
      id, organization_id, property_id, lease_id, term_version_id,
      period_start_date, period_end_date, status,
      total_operating_expenses, grossed_up_expenses, base_year_amount,
      tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
      calculation_trace, finalized_at, finalized_by_user_id
    )
    values (
      ${snapshotId}, ${input.organizationId}, ${input.propertyId}, ${input.leaseId}, ${input.termVersionId},
      '2026-01-01', '2026-12-31', 'finalized',
      '10000.00', '10000.00', '0.00', '1250.00', '1250.00', '25.00', '1275.00',
      '[]'::jsonb, now(), ${input.userId}
    )
  `;
  return snapshotId;
}

async function assertCoreRows(sql, input) {
  const rows = await sql`
    select
      (select organization_id from properties where id = ${input.propertyId}) as property_org,
      (select property_id from units where id = ${input.unitId}) as unit_property,
      (select property_id from leases where id = ${input.leaseId}) as lease_property,
      (select lease_id from lease_term_versions where id = ${input.termVersionId}) as term_lease,
      (select count(*)::int from subscriptions where organization_id = ${input.organizationId} and status = 'active') as active_subscriptions
  `;
  const row = rows[0];
  assert(row.property_org === input.organizationId, "DB property org mismatch");
  assert(row.unit_property === input.propertyId, "DB unit property mismatch");
  assert(row.lease_property === input.propertyId, "DB lease property mismatch");
  assert(row.term_lease === input.leaseId, "DB term lease mismatch");
  assert(row.active_subscriptions === 1, "DB active subscription missing");
}

async function startWorkerServer(input) {
  const port = new URL(input.baseUrl).port;
  const envFile = await createWorkerEnvFile(input);
  const child = spawn(
    process.execPath,
    [
      WRANGLER_BIN,
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      port,
      "--local",
      "--show-interactive-dev-session",
      "false",
      "--env-file",
      envFile.path,
      "--var",
      "DB_ACCESS_MODE:direct-postgres",
      "--var",
      "DB_PRODUCTION_BOUNDARY:direct-postgres",
      "--var",
      `DATABASE_URL:${input.databaseUrl}`,
      "--var",
      `SUPABASE_URL:${input.supabaseUrl}`,
      "--var",
      `AUTH_JWKS_URL:${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      "--var",
      "POSTHOG_PROJECT_API_KEY:",
      "--var",
      "POSTHOG_HOST:http://127.0.0.1:9",
      "--var",
      "RESEND_API_KEY:",
    ],
    {
      cwd: process.cwd(),
      env: workerEnv(input),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  let childError;
  child.once("error", (error) => {
    childError = error;
    output += `\nwrangler dev spawn error: ${errorMessage(error)}`;
  });
  child.once("exit", (code) => {
    if (code !== null && code !== 0) {
      output += `\nwrangler dev exited with ${code}`;
    }
  });
  const handle = {
    close: async () => {
      try {
        if (child.exitCode === null) {
          if (child.pid) await killProcessTree(child.pid);
        } else if (child.pid) {
          await killProcessTree(child.pid);
        }
      } finally {
        try {
          await waitForPortClosed(input.baseUrl);
        } finally {
          await envFile.close();
        }
      }
    },
  };
  try {
    await waitForHealth(input.baseUrl, () => output);
    if (childError) {
      fail(`wrangler dev failed to spawn\n${output.slice(-2000)}`);
    }
    if (child.exitCode !== null) {
      fail(`wrangler dev exited before health\n${output.slice(-2000)}`);
    }
    return handle;
  } catch (error) {
    let closeError;
    try {
      await handle.close();
    } catch (cleanupError) {
      closeError = cleanupError;
    }
    if (closeError) {
      console.error(
        `Worker cleanup failed after startup failure: ${errorMessage(closeError)}`,
      );
    }
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-core-data-e2e-"));
  const path = resolve(directory, ".dev.vars.local-core-data-e2e");
  await writeFile(
    path,
    [
      "ENVIRONMENT=development",
      "NODE_ENV=development",
      "DB_ACCESS_MODE=direct-postgres",
      "DB_PRODUCTION_BOUNDARY=direct-postgres",
      `DATABASE_URL=${input.databaseUrl}`,
      `SUPABASE_URL=${input.supabaseUrl}`,
      `AUTH_JWKS_URL=${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      "RESEND_API_KEY=",
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-core-data-e2e-signing-secret",
      "UNSUBSCRIBE_HMAC_SECRET=",
      "CHECKOUT_OFFER_TOKEN_SECRET=",
    ].join("\n"),
    "utf8",
  );
  return {
    path,
    close: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function workerEnv(input) {
  const env = {};
  for (const key of [
    "PATH",
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.ENVIRONMENT = "development";
  env.NODE_ENV = "development";
  env.DB_ACCESS_MODE = "direct-postgres";
  env.DB_PRODUCTION_BOUNDARY = "direct-postgres";
  env.DATABASE_URL = input.databaseUrl;
  env.SUPABASE_URL = input.supabaseUrl;
  env.AUTH_JWKS_URL = `${input.supabaseUrl}/auth/v1/.well-known/jwks.json`;
  return env;
}

async function killProcessTree(pid) {
  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return;
    }
    return;
  }
  await new Promise((resolveKill) => {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("exit", resolveKill);
    killer.once("error", resolveKill);
  });
}

async function assertPortAvailable(baseUrl) {
  const url = new URL(baseUrl);
  if (await canConnect(url.hostname, Number(url.port))) {
    fail(`${baseUrl} already accepts TCP connections`);
  }
}

async function waitForHealth(baseUrl, output = () => "") {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await delay(250);
  }
  fail(`${baseUrl} still accepts TCP connections after close`);
}

async function canConnect(host, port) {
  return new Promise((resolveConnect) => {
    const socket = connect({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolveConnect(false);
    }, 500);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolveConnect(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolveConnect(false);
    });
  });
}

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_core_data_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_core_data_e2e_none__");
  const propertyIds = nonEmpty(input.propertyIds);
  const unitIds = nonEmpty(input.unitIds);
  const leaseIds = nonEmpty(input.leaseIds);
  const termVersionIds = nonEmpty(input.termVersionIds);
  const snapshotIds = nonEmpty(input.snapshotIds);
  await sql.begin(async (transaction) => {
    await transaction`delete from reconciliation_snapshots where id in ${transaction(snapshotIds)} or property_id in ${transaction(propertyIds)} or lease_id in ${transaction(leaseIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from lease_term_versions where id in ${transaction(termVersionIds)} or lease_id in ${transaction(leaseIds)}`;
    await transaction`delete from leases where id in ${transaction(leaseIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from units where id in ${transaction(unitIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from properties where id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from subscriptions where organization_id in ${transaction(orgIds)}`;
    await transaction`delete from audit_credits where organization_id in ${transaction(orgIds)}`;
    await transaction`delete from signup_email_events where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`delete from legal_acceptances where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)}`;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`delete from audit_log where organization_id in ${transaction(orgIds)} or changed_by in ${transaction(userIds)}`;
    await transaction`delete from users where id in ${transaction(userIds)} or email in ${transaction(emails)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from auth.users where id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`delete from organizations where id in ${transaction(orgIds)} or name in ${transaction(orgNames)}`;
  });
}

async function assertCleanupComplete(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_core_data_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_core_data_e2e_none__");
  const propertyIds = nonEmpty(input.propertyIds);
  const unitIds = nonEmpty(input.unitIds);
  const leaseIds = nonEmpty(input.leaseIds);
  const termVersionIds = nonEmpty(input.termVersionIds);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_users,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as orgs,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as properties,
      (select count(*)::int from units where id in ${sql(unitIds)} or property_id in ${sql(propertyIds)}) as units,
      (select count(*)::int from leases where id in ${sql(leaseIds)} or property_id in ${sql(propertyIds)}) as leases,
      (select count(*)::int from lease_term_versions where id in ${sql(termVersionIds)} or lease_id in ${sql(leaseIds)}) as term_versions,
      (select count(*)::int from reconciliation_snapshots where lease_id in ${sql(leaseIds)} or property_id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as snapshots,
      (select count(*)::int from subscriptions where organization_id in ${sql(orgIds)}) as subscriptions,
      (select count(*)::int from audit_credits where organization_id in ${sql(orgIds)}) as audit_credits,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_events,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptances,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)}) as audit_log
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function cleanupSeededAccounts(databaseUrl, accounts) {
  if (accounts.length === 0) return;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await cleanupGeneratedRows(sql, {
      orgIds: accounts.map((item) => item.signupOrganizationId),
      userIds: accounts.map((item) => item.userId),
      emails: accounts.map((item) => item.email),
      orgNames: accounts.map((item) => item.organizationName),
      propertyIds: [],
      unitIds: [],
      leaseIds: [],
      termVersionIds: [],
      snapshotIds: [],
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`);
    },
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return body;
}

async function expectError(url, options) {
  const body = await expectJson(url, options);
  assert(
    body?.error?.code === options.code,
    `expected error code ${options.code}, got ${stableJson(body)}`,
  );
  return body;
}

async function expectExactError(url, options) {
  const body = await expectJson(url, options);
  assertExactKeys(
    body,
    ["detail", "error"],
    `${options.expected.error.code} response`,
  );
  assertExactKeys(
    body.error,
    ["code", "message"],
    `${options.expected.error.code} error`,
  );
  assert(
    stableJson(body) === stableJson(options.expected),
    `expected error ${stableJson(options.expected)}, got ${stableJson(body)}`,
  );
  return body;
}

async function expectEmpty(url, options = {}) {
  const { status = 204, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`);
    },
  );
  const text = await response.text();
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  assert(text === "", "expected empty response body");
}

function validProperty(overrides = {}) {
  return {
    name: "Local Core Valid Property",
    address_line1: "100 Valid Way",
    city: "Austin",
    state: "TX",
    postal_code: "78701",
    total_rentable_sqft: "10000",
    total_usable_sqft: "9000",
    common_area_sqft: "1000",
    ...overrides,
  };
}

function assertPropertyPage(page, expectedProperty, account) {
  assertExactKeys(page, ["data", "count", "has_more"], "property page");
  assert(Array.isArray(page.data), "property page data is not an array");
  assert(page.count === 1, "property page count mismatch");
  assert(page.has_more === false, "property page has_more mismatch");
  assert(page.data.length === 1, "property page data length mismatch");
  assertNoHiddenMarkers(page, account);
  assertPropertyRecord(page.data[0], {
    ...expectedProperty,
    created_at: undefined,
    updated_at: undefined,
  });
}

function assertPropertyRecord(actual, expected) {
  assertExactKeys(
    actual,
    [
      "id",
      "organization_id",
      "name",
      "address_line1",
      "address_line2",
      "city",
      "state",
      "postal_code",
      "total_rentable_sqft",
      "total_usable_sqft",
      "common_area_sqft",
      "target_occupancy",
      "boma_standard_version",
      "rsf_measurement_date",
      "fiscal_year_start_month",
      "tax_protest_county",
      "tax_protest_deadline_override",
      "created_at",
      "updated_at",
    ],
    "property record",
  );
  for (const key of [
    "id",
    "organization_id",
    "name",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "postal_code",
    "total_rentable_sqft",
    "total_usable_sqft",
    "common_area_sqft",
    "target_occupancy",
    "boma_standard_version",
    "rsf_measurement_date",
    "fiscal_year_start_month",
    "tax_protest_county",
  ]) {
    if (expected[key] === undefined) continue;
    assert(
      actual[key] === expected[key],
      `property ${key} mismatch: expected ${expected[key]}, got ${actual[key]}`,
    );
  }
  if (expected.tax_protest_deadline_override === undefined) {
    // Caller only wants to prove the stable shape, not a particular date.
  } else if (expected.tax_protest_deadline_override === null) {
    assert(
      actual.tax_protest_deadline_override === null,
      "property tax deadline should be null",
    );
  } else {
    assertDateValue(
      actual.tax_protest_deadline_override,
      expected.tax_protest_deadline_override,
      "property tax deadline",
    );
  }
  assertTimestampString(actual.created_at, "property created_at");
  assertTimestampString(actual.updated_at, "property updated_at");
}

async function assertPropertyDbParity(sql, property) {
  const rows = await sql`
    select
      id,
      organization_id,
      name,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      total_rentable_sqft::text as total_rentable_sqft,
      total_usable_sqft::text as total_usable_sqft,
      common_area_sqft::text as common_area_sqft,
      target_occupancy::text as target_occupancy,
      boma_standard_version,
      rsf_measurement_date::text as rsf_measurement_date,
      fiscal_year_start_month,
      tax_protest_county,
      tax_protest_deadline_override::text as tax_protest_deadline_override,
      created_at::text as created_at,
      updated_at::text as updated_at
    from properties
    where id = ${property.id}
      and organization_id = ${property.organization_id}
  `;
  assert(rows.length === 1, "property DB row count mismatch");
  const row = rows[0];
  for (const key of [
    "id",
    "organization_id",
    "name",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "postal_code",
    "total_rentable_sqft",
    "total_usable_sqft",
    "common_area_sqft",
    "target_occupancy",
    "boma_standard_version",
    "rsf_measurement_date",
    "fiscal_year_start_month",
    "tax_protest_county",
  ]) {
    assert(
      row[key] === property[key],
      `property DB/API ${key} mismatch: expected ${property[key]}, got ${row[key]}`,
    );
  }
  if (property.tax_protest_deadline_override === null) {
    assert(
      row.tax_protest_deadline_override === null,
      "property DB/API tax deadline should be null",
    );
  } else {
    assertDateValue(
      row.tax_protest_deadline_override,
      property.tax_protest_deadline_override,
      "property DB/API tax deadline",
    );
  }
  assertSameInstant(row.created_at, property.created_at, "property created_at");
  assertSameInstant(row.updated_at, property.updated_at, "property updated_at");
}

function assertUnitRecord(actual, expected) {
  assertExactKeys(
    actual,
    [
      "id",
      "property_id",
      "unit_number",
      "rentable_sqft",
      "usable_sqft",
      "floor",
      "status",
      "space_type",
      "created_at",
      "updated_at",
    ],
    "unit record",
  );
  for (const key of [
    "id",
    "property_id",
    "unit_number",
    "rentable_sqft",
    "usable_sqft",
    "floor",
    "status",
    "space_type",
  ]) {
    if (expected[key] === undefined) continue;
    assert(
      actual[key] === expected[key],
      `unit ${key} mismatch: expected ${expected[key]}, got ${actual[key]}`,
    );
  }
  assertTimestampString(actual.created_at, "unit created_at");
  assertTimestampString(actual.updated_at, "unit updated_at");
}

async function assertUnitDbParity(sql, unit) {
  const rows = await sql`
    select
      id,
      property_id,
      unit_number,
      rentable_sqft::text as rentable_sqft,
      usable_sqft::text as usable_sqft,
      floor,
      status,
      space_type,
      created_at::text as created_at,
      updated_at::text as updated_at
    from units
    where id = ${unit.id}
      and property_id = ${unit.property_id}
  `;
  assert(rows.length === 1, "unit DB row count mismatch");
  const row = rows[0];
  for (const key of [
    "id",
    "property_id",
    "unit_number",
    "rentable_sqft",
    "usable_sqft",
    "floor",
    "status",
    "space_type",
  ]) {
    assert(
      row[key] === unit[key],
      `unit DB/API ${key} mismatch: expected ${unit[key]}, got ${row[key]}`,
    );
  }
  assertSameInstant(row.created_at, unit.created_at, "unit created_at");
  assertSameInstant(row.updated_at, unit.updated_at, "unit updated_at");
}

function assertLeasePage(page, expectedLease, account) {
  assertExactKeys(page, ["data", "count", "has_more"], "lease page");
  assert(Array.isArray(page.data), "lease page data is not an array");
  assert(page.count === 1, "lease page count mismatch");
  assert(page.has_more === false, "lease page has_more mismatch");
  assert(page.data.length === 1, "lease page data length mismatch");
  assertNoHiddenMarkers(page, account);
  assertLeaseRecord(page.data[0], {
    ...expectedLease,
    created_at: undefined,
    updated_at: undefined,
  });
}

function assertLeaseRecord(actual, expected) {
  assertExactKeys(
    actual,
    [
      "id",
      "property_id",
      "unit_id",
      "tenant_name",
      "start_date",
      "end_date",
      "status",
      "recovery_profile",
      "document_url",
      "created_at",
      "updated_at",
    ],
    "lease record",
  );
  for (const key of [
    "id",
    "property_id",
    "unit_id",
    "tenant_name",
    "status",
    "document_url",
  ]) {
    if (expected[key] === undefined) continue;
    assert(
      actual[key] === expected[key],
      `lease ${key} mismatch: expected ${expected[key]}, got ${actual[key]}`,
    );
  }
  if (expected.start_date !== undefined) {
    assertDateValue(actual.start_date, expected.start_date, "lease start_date");
  }
  if (expected.end_date !== undefined) {
    assertDateValue(actual.end_date, expected.end_date, "lease end_date");
  }
  assertRecoveryProfile(actual.recovery_profile, expected.recovery_profile);
  assertTimestampString(actual.created_at, "lease created_at");
  assertTimestampString(actual.updated_at, "lease updated_at");
}

async function assertLeaseDbParity(sql, lease) {
  const rows = await sql`
    select
      id,
      property_id,
      unit_id,
      tenant_name,
      start_date::text as start_date,
      end_date::text as end_date,
      status,
      recovery_profile,
      document_url,
      created_at::text as created_at,
      updated_at::text as updated_at
    from leases
    where id = ${lease.id}
      and property_id = ${lease.property_id}
  `;
  assert(rows.length === 1, "lease DB row count mismatch");
  const row = rows[0];
  for (const key of [
    "id",
    "property_id",
    "unit_id",
    "tenant_name",
    "status",
    "document_url",
  ]) {
    assert(
      row[key] === lease[key],
      `lease DB/API ${key} mismatch: expected ${lease[key]}, got ${row[key]}`,
    );
  }
  assertDateValue(row.start_date, lease.start_date, "lease DB/API start_date");
  assertDateValue(row.end_date, lease.end_date, "lease DB/API end_date");
  assertRecoveryProfile(row.recovery_profile, lease.recovery_profile);
  assertSameInstant(row.created_at, lease.created_at, "lease created_at");
  assertSameInstant(row.updated_at, lease.updated_at, "lease updated_at");
}

function assertRecoveryProfile(actual, expected) {
  const normalizedActual = stripUndefined(actual);
  const normalizedExpected = stripUndefined(expected);
  assert(
    stableJson(normalizedActual) === stableJson(normalizedExpected),
    `recovery profile mismatch: expected ${stableJson(normalizedExpected)}, got ${stableJson(normalizedActual)}`,
  );
}

function assertTermVersionRecord(actual, expected) {
  assertExactKeys(
    actual,
    [
      "id",
      "lease_id",
      "version_number",
      "effective_date",
      "base_year",
      "base_year_amount",
      "gross_up_base_year",
      "pro_rata_share",
      "cap_type",
      "cap_rate",
      "admin_fee_percentage",
      "management_fee_percentage",
      "excluded_pools",
      "rsf_measurement_standard",
      "rsf_measurement_date",
      "amendment_reason",
      "amendment_document_url",
      "created_by",
      "created_at",
    ],
    "term version record",
  );
  for (const key of [
    "id",
    "lease_id",
    "version_number",
    "effective_date",
    "base_year",
    "base_year_amount",
    "gross_up_base_year",
    "pro_rata_share",
    "cap_type",
    "cap_rate",
    "admin_fee_percentage",
    "management_fee_percentage",
    "rsf_measurement_standard",
    "rsf_measurement_date",
    "amendment_reason",
    "amendment_document_url",
    "created_by",
  ]) {
    if (expected[key] === undefined) continue;
    assert(
      actual[key] === expected[key],
      `term version ${key} mismatch: expected ${expected[key]}, got ${actual[key]}`,
    );
  }
  if (expected.excluded_pools !== undefined) {
    assert(
      stableJson(actual.excluded_pools) === stableJson(expected.excluded_pools),
      `term version excluded_pools mismatch: expected ${stableJson(expected.excluded_pools)}, got ${stableJson(actual.excluded_pools)}`,
    );
  }
  assertTimestampString(actual.created_at, "term version created_at");
}

function assertTermVersionSummaryList(actual, expectedVersions) {
  assert(Array.isArray(actual), "term version list should be an array");
  assert(
    actual.length === expectedVersions.length,
    `term version list length mismatch: expected ${expectedVersions.length}, got ${actual.length}`,
  );
  for (let index = 0; index < expectedVersions.length; index += 1) {
    const summary = actual[index];
    const expected = expectedVersions[index];
    assertExactKeys(
      summary,
      [
        "id",
        "version_number",
        "effective_date",
        "pro_rata_share",
        "cap_type",
        "amendment_reason",
        "created_at",
      ],
      `term version summary ${index}`,
    );
    assert(
      stableJson(summary) ===
        stableJson({
          id: expected.id,
          version_number: expected.version_number,
          effective_date: expected.effective_date,
          pro_rata_share: expected.pro_rata_share,
          cap_type: expected.cap_type,
          amendment_reason: expected.amendment_reason,
          created_at: expected.created_at,
        }),
      `term version summary ${index} mismatch: expected ${stableJson(expected)}, got ${stableJson(summary)}`,
    );
  }
}

async function assertTermVersionDbParity(sql, version) {
  const rows = await sql`
    select
      id,
      lease_id,
      version_number,
      effective_date::text as effective_date,
      base_year,
      base_year_amount::text as base_year_amount,
      gross_up_base_year,
      pro_rata_share::text as pro_rata_share,
      cap_type,
      cap_rate::text as cap_rate,
      admin_fee_percentage::text as admin_fee_percentage,
      management_fee_percentage::text as management_fee_percentage,
      excluded_pools,
      rsf_measurement_standard,
      rsf_measurement_date::text as rsf_measurement_date,
      amendment_reason,
      amendment_document_url,
      created_by,
      created_at::text as created_at
    from lease_term_versions
    where id = ${version.id}
      and lease_id = ${version.lease_id}
  `;
  assert(rows.length === 1, "term version DB row count mismatch");
  const row = rows[0];
  for (const key of [
    "id",
    "lease_id",
    "version_number",
    "effective_date",
    "base_year",
    "base_year_amount",
    "gross_up_base_year",
    "pro_rata_share",
    "cap_type",
    "cap_rate",
    "admin_fee_percentage",
    "management_fee_percentage",
    "rsf_measurement_standard",
    "rsf_measurement_date",
    "amendment_reason",
    "amendment_document_url",
    "created_by",
  ]) {
    assert(
      row[key] === version[key],
      `term version DB/API ${key} mismatch: expected ${version[key]}, got ${row[key]}`,
    );
  }
  assert(
    stableJson(row.excluded_pools) === stableJson(version.excluded_pools),
    "term version DB/API excluded_pools mismatch",
  );
  assertSameInstant(
    row.created_at,
    version.created_at,
    "term version created_at",
  );
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  const actualKeys = Object.keys(actual).sort();
  const sortedExpected = [...expectedKeys].sort();
  assert(
    stableJson(actualKeys) === stableJson(sortedExpected),
    `${label} keys mismatch: expected ${sortedExpected.join(",")}, got ${actualKeys.join(",")}`,
  );
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry) => entry[1] !== undefined)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)]),
    );
  }
  return value;
}

function assertNoHiddenMarkers(value, account) {
  const serialized = stableJson(value);
  for (const marker of [
    account.hidden.organizationId,
    account.hidden.userId,
    account.hiddenMarker,
    account.hiddenUnitId,
    `HIDDEN Core Property ${account.suffix}`,
    "HIDDEN-1",
  ]) {
    assert(!serialized.includes(marker), `hidden marker leaked: ${marker}`);
  }
}

function assertDateValue(actual, expected, label) {
  const expectedDate = String(expected).slice(0, 10);
  assert(
    typeof actual === "string" && actual.startsWith(expectedDate),
    `${label} mismatch: expected ${expectedDate}, got ${actual}`,
  );
}

function assertTimestampString(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} missing`);
  assert(Number.isFinite(Date.parse(value)), `${label} is not a timestamp`);
}

function assertSameInstant(actual, expected, label) {
  assertTimestampString(actual, `${label} actual`);
  assertTimestampString(expected, `${label} expected`);
  assert(
    Date.parse(actual) === Date.parse(expected),
    `${label} mismatch: expected ${expected}, got ${actual}`,
  );
}

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(values.filter((value) => typeof value === "string" && value)),
  ];
  return unique.length > 0 ? unique : [sentinel];
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//iu.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }
      fail(`Unexpected argument: ${arg}`);
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) parsed[key] = inlineValue;
    else {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) parsed[key] = "true";
      else {
        parsed[key] = next;
        index += 1;
      }
    }
  }
  return parsed;
}

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isSafeInteger(value) || value < 1)
    fail(`${label} must be a positive integer`);
  return value;
}

function normalizedLocalUrl(rawUrl, label) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:") fail(`${label} must use http`);
  if (!isLoopbackHost(url.hostname)) fail(`${label} must point at loopback`);
  if (!url.port) fail(`${label} must include a port`);
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function normalizedLocalSupabaseUrl(rawUrl) {
  const value = normalizedLocalUrl(rawUrl, "supabase-url");
  const url = new URL(value);
  if (url.port !== "54321") {
    fail("supabase-url must use the local Supabase API port 54321");
  }
  if (url.pathname !== "/") {
    fail("supabase-url must not include a path");
  }
  return value;
}

function normalizedLocalDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    fail("database-url must be Postgres");
  if (!isLoopbackHost(url.hostname))
    fail("database-url must point at loopback");
  if (url.port !== "54322")
    fail("database-url must use the local Supabase Postgres port 54322");
  if (url.pathname !== "/postgres")
    fail("database-url must target the local Supabase postgres database");
  return url.toString();
}

async function readEnvValue(filePath, keys) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    if (!keys.includes(key)) continue;
    return trimmed
      .slice(equals + 1)
      .trim()
      .replace(/^["']|["']$/gu, "");
  }
  return undefined;
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function stableJson(value) {
  return JSON.stringify(sortJsonKeys(value));
}

function safeJson(value) {
  return JSON.stringify(value);
}

function sortJsonKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonKeys(entryValue)]),
    );
  }
  return value;
}

function redactSensitiveJson(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(
    JSON.stringify(value, (key, nestedValue) =>
      /token|password|secret|apikey|authorization/iu.test(key)
        ? "[redacted]"
        : nestedValue,
    ),
  );
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
