import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { TextDecoder } from "node:util";
import { inflateSync } from "node:zlib";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8848";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const SUPABASE_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const UUID_SENTINEL = "00000000-0000-4000-8000-000000000000";
const TEXT_SENTINEL = "__local_denominator_change_e2e_none__";
const REPORT_KEYS = [
  "property_id",
  "property_name",
  "prior_period",
  "current_period",
  "prior_total_rsf",
  "current_total_rsf",
  "rsf_delta",
  "rsf_delta_percent",
  "changes",
  "tenant_impacts",
  "summary",
  "generated_at",
  "comparison_available",
  "missing_period",
];
const CHANGE_KEYS = [
  "change_type",
  "description",
  "prior_value",
  "current_value",
  "impact_description",
];
const TENANT_IMPACT_KEYS = [
  "lease_id",
  "tenant_name",
  "prior_pro_rata_share",
  "current_pro_rata_share",
  "share_delta_pct_points",
  "prior_estimated_recovery",
  "current_estimated_recovery",
  "recovery_delta",
  "contributing_changes",
];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (process.env.CI) {
    fail("Refusing to run local denominator change E2E in CI.");
  }

  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local denominator change E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const supabaseUrl = normalizedLocalUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
    "supabase-url",
  );
  const databaseUrl = normalizedLocalDatabaseUrl(
    args["database-url"] ??
      process.env.npm_config_database_url ??
      process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      DEFAULT_DATABASE_URL,
  );
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ])) ??
    SUPABASE_LOCAL_ANON_KEY;

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  let runError;
  let closeError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
          supabaseUrl,
          anonKey,
          databaseUrl,
          index,
        }),
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          supabase_url: supabaseUrl,
          repeat,
          tenant_token:
            "omitted: route middleware behavior is already covered by unit tests; this harness focuses on landlord/full-access local DB behavior",
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
      `Local denominator change Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.owner.accessToken);
  const hiddenHeaders = jsonAuthHeaders(account.hidden.accessToken);
  const noAccessHeaders = jsonAuthHeaders(account.noAccess.accessToken);
  const visibleBody = denominatorBody(account.visiblePropertyId);
  const currentOnlyBody = denominatorBody(account.currentOnlyPropertyId);
  let runError;
  let cleanupError;
  let result;

  try {
    const report = await expectJson(
      `${input.baseUrl}/api/v1/analysis/denominator-change`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify(visibleBody),
      },
    );
    assertFullReport(report, account);

    const pdf = await expectBytes(
      `${input.baseUrl}/api/v1/reports/denominator-change/pdf`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify(visibleBody),
      },
    );
    assertPdf(pdf, account);

    const hiddenJson = await expectJson(
      `${input.baseUrl}/api/v1/analysis/denominator-change`,
      {
        method: "POST",
        headers: hiddenHeaders,
        status: 200,
        body: JSON.stringify(visibleBody),
      },
    );
    assertUnavailableReport(
      hiddenJson,
      account,
      "hidden JSON visible property",
    );
    const hiddenPdfError = await expectJson(
      `${input.baseUrl}/api/v1/reports/denominator-change/pdf`,
      {
        method: "POST",
        headers: hiddenHeaders,
        status: 400,
        body: JSON.stringify(visibleBody),
      },
    );
    assertErrorBody(hiddenPdfError, {
      code: "no_comparable_snapshots",
      message:
        "No finalized snapshots found for current period 2026-01-01 to 2026-12-31",
      label: "hidden PDF visible property",
    });

    const ownerHiddenJson = await expectJson(
      `${input.baseUrl}/api/v1/analysis/denominator-change`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify(denominatorBody(account.hiddenPropertyId)),
      },
    );
    assertUnavailableReport(
      ownerHiddenJson,
      account,
      "owner JSON hidden property",
    );

    const noAccessJsonError = await expectJson(
      `${input.baseUrl}/api/v1/analysis/denominator-change`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify(denominatorBody(account.noAccessPropertyId)),
      },
    );
    assertErrorBody(noAccessJsonError, {
      code: "subscription_required",
      message:
        "subscription_required: An active subscription or trial is required.",
      label: "no-access JSON",
    });
    const noAccessPdfError = await expectJson(
      `${input.baseUrl}/api/v1/reports/denominator-change/pdf`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify(denominatorBody(account.noAccessPropertyId)),
      },
    );
    assertErrorBody(noAccessPdfError, {
      code: "subscription_required",
      message:
        "subscription_required: An active subscription or trial is required.",
      label: "no-access PDF",
    });

    const invalidUuidError = await expectJson(
      `${input.baseUrl}/api/v1/analysis/denominator-change`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 400,
        body: JSON.stringify(denominatorBody("not-a-uuid")),
      },
    );
    assertErrorBody(invalidUuidError, {
      code: "validation_error",
      message: "Invalid UUID",
      label: "invalid UUID JSON",
    });
    const invalidPdfUuidError = await expectJson(
      `${input.baseUrl}/api/v1/reports/denominator-change/pdf`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 400,
        body: JSON.stringify(denominatorBody("not-a-uuid")),
      },
    );
    assertErrorBody(invalidPdfUuidError, {
      code: "validation_error",
      message: "Invalid UUID",
      label: "invalid UUID PDF",
    });

    const currentOnly = await expectJson(
      `${input.baseUrl}/api/v1/analysis/denominator-change`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify(currentOnlyBody),
      },
    );
    assertEmptyReport(currentOnly, currentOnlyBody, {
      label: "current-only JSON",
      missingPeriod: "prior",
      summary: "No finalized snapshots found for prior period",
      priorPeriod: "2025-01-01 to 2025-12-31",
      currentPeriod: "2026-01-01 to 2026-12-31",
    });
    const currentOnlyPdfError = await expectJson(
      `${input.baseUrl}/api/v1/reports/denominator-change/pdf`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 400,
        body: JSON.stringify(currentOnlyBody),
      },
    );
    assertErrorBody(currentOnlyPdfError, {
      code: "no_comparable_snapshots",
      message: "No finalized snapshots found for prior period",
      label: "current-only PDF",
    });

    result = {
      index: input.index,
      organization_id: account.owner.organizationId,
      property_id: account.visiblePropertyId,
      current_only_property_id: account.currentOnlyPropertyId,
      change_types: report.changes.map((change) => change.change_type).sort(),
      tenant_impacts: report.tenant_impacts.map((impact) => impact.tenant_name),
      pdf_bytes: pdf.bytes.byteLength,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      try {
        await cleanupGeneratedRows(sql, account);
        await assertCleanupComplete(sql, account);
      } catch (error) {
        cleanupError = error;
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  if (runError && cleanupError) {
    console.error(
      `Local denominator change cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

function denominatorBody(propertyId) {
  return {
    property_id: propertyId,
    prior_period_start: "2025-01-01",
    prior_period_end: "2025-12-31",
    current_period_start: "2026-01-01",
    current_period_end: "2026-12-31",
    prior_total_rsf: "10000",
    current_total_rsf: "12000",
  };
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ids = {
    visiblePropertyId: randomUUID(),
    currentOnlyPropertyId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    noAccessPropertyId: randomUUID(),
    alphaUnitId: randomUUID(),
    removedUnitId: randomUUID(),
    addedUnitId: randomUUID(),
    currentOnlyUnitId: randomUUID(),
    hiddenUnitId: randomUUID(),
    noAccessUnitId: randomUUID(),
    alphaLeaseId: randomUUID(),
    removedLeaseId: randomUUID(),
    addedLeaseId: randomUUID(),
    currentOnlyLeaseId: randomUUID(),
    hiddenLeaseId: randomUUID(),
    noAccessLeaseId: randomUUID(),
    snapshots: {
      alphaPrior: randomUUID(),
      removedPrior: randomUUID(),
      alphaCurrent: randomUUID(),
      addedCurrent: randomUUID(),
      currentOnly: randomUUID(),
      hiddenCurrent: randomUUID(),
    },
  };
  const names = {
    visibleProperty: `Local Denominator Tower ${suffix}`,
    currentOnlyProperty: `Local Denominator Current Only ${suffix}`,
    hiddenProperty: `HIDDEN-DENOM-PROPERTY-${suffix}`,
    noAccessProperty: `Local Denominator No Access ${suffix}`,
    alphaTenant: `Alpha Denom Tenant ${suffix}`,
    removedTenant: `Removed Denom Tenant ${suffix}`,
    addedTenant: `Added Denom Tenant ${suffix}`,
    currentOnlyTenant: `Current Only Denom Tenant ${suffix}`,
    hiddenTenant: `HIDDEN-DENOM-TENANT-${suffix}`,
    noAccessTenant: `No Access Denom Tenant ${suffix}`,
  };
  const ownerEmail = `denom-e2e-owner-${suffix}@capveri.local`;
  const hiddenEmail = `denom-e2e-hidden-${suffix}@capveri.local`;
  const noAccessEmail = `denom-e2e-no-access-${suffix}@capveri.local`;
  const ownerOrganizationName = `Local Denominator Org ${suffix}`;
  const hiddenOrganizationName = `Local Denominator Hidden Org ${suffix}`;
  const noAccessOrganizationName = `Local Denominator No Access Org ${suffix}`;
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const created = [];

  try {
    const owner = await createLocalAuthUser(input, {
      email: ownerEmail,
      password: `OwnerPass${input.index}A1!`,
      fullName: `Local Denominator Owner ${suffix}`,
      organizationName: ownerOrganizationName,
      role: "owner",
      created,
    });
    const hidden = await createLocalAuthUser(input, {
      email: hiddenEmail,
      password: `HiddenPass${input.index}A1!`,
      fullName: `Local Denominator Hidden Owner ${suffix}`,
      organizationName: hiddenOrganizationName,
      role: "owner",
      created,
    });
    const noAccess = await createLocalAuthUser(input, {
      email: noAccessEmail,
      password: `NoAccessPass${input.index}A1!`,
      fullName: `Local Denominator No Access Owner ${suffix}`,
      organizationName: noAccessOrganizationName,
      role: "owner",
      created,
    });

    await sql.begin(async (transaction) => {
      await transaction`
        insert into subscriptions (organization_id, plan, status, current_period_start, current_period_end)
        values
          (${owner.organizationId}, 'professional', 'active', now(), now() + interval '30 days'),
          (${hidden.organizationId}, 'professional', 'active', now(), now() + interval '30 days')
      `;
      await insertProperty(transaction, {
        id: ids.visiblePropertyId,
        organizationId: owner.organizationId,
        name: names.visibleProperty,
        totalRsf: "12000",
      });
      await insertProperty(transaction, {
        id: ids.currentOnlyPropertyId,
        organizationId: owner.organizationId,
        name: names.currentOnlyProperty,
        totalRsf: "8000",
      });
      await insertProperty(transaction, {
        id: ids.hiddenPropertyId,
        organizationId: hidden.organizationId,
        name: names.hiddenProperty,
        totalRsf: "99999",
      });
      await insertProperty(transaction, {
        id: ids.noAccessPropertyId,
        organizationId: noAccess.organizationId,
        name: names.noAccessProperty,
        totalRsf: "5000",
      });
      await insertUnit(transaction, {
        id: ids.alphaUnitId,
        propertyId: ids.visiblePropertyId,
        unitNumber: "100",
        rentableSqft: "3000",
      });
      await insertUnit(transaction, {
        id: ids.removedUnitId,
        propertyId: ids.visiblePropertyId,
        unitNumber: "200",
        rentableSqft: "1500",
      });
      await insertUnit(transaction, {
        id: ids.addedUnitId,
        propertyId: ids.visiblePropertyId,
        unitNumber: "300",
        rentableSqft: "2000",
      });
      await insertUnit(transaction, {
        id: ids.currentOnlyUnitId,
        propertyId: ids.currentOnlyPropertyId,
        unitNumber: "400",
        rentableSqft: "1000",
      });
      await insertUnit(transaction, {
        id: ids.hiddenUnitId,
        propertyId: ids.hiddenPropertyId,
        unitNumber: "900",
        rentableSqft: "9999",
      });
      await insertUnit(transaction, {
        id: ids.noAccessUnitId,
        propertyId: ids.noAccessPropertyId,
        unitNumber: "500",
        rentableSqft: "1000",
      });
      await insertLease(transaction, {
        id: ids.alphaLeaseId,
        propertyId: ids.visiblePropertyId,
        unitId: ids.alphaUnitId,
        tenantName: names.alphaTenant,
        proRataShare: "0.25",
      });
      await insertLease(transaction, {
        id: ids.removedLeaseId,
        propertyId: ids.visiblePropertyId,
        unitId: ids.removedUnitId,
        tenantName: names.removedTenant,
        proRataShare: "0.15",
      });
      await insertLease(transaction, {
        id: ids.addedLeaseId,
        propertyId: ids.visiblePropertyId,
        unitId: ids.addedUnitId,
        tenantName: names.addedTenant,
        proRataShare: "0.20",
      });
      await insertLease(transaction, {
        id: ids.currentOnlyLeaseId,
        propertyId: ids.currentOnlyPropertyId,
        unitId: ids.currentOnlyUnitId,
        tenantName: names.currentOnlyTenant,
        proRataShare: "0.10",
      });
      await insertLease(transaction, {
        id: ids.hiddenLeaseId,
        propertyId: ids.hiddenPropertyId,
        unitId: ids.hiddenUnitId,
        tenantName: names.hiddenTenant,
        proRataShare: "0.99",
      });
      await insertLease(transaction, {
        id: ids.noAccessLeaseId,
        propertyId: ids.noAccessPropertyId,
        unitId: ids.noAccessUnitId,
        tenantName: names.noAccessTenant,
        proRataShare: "0.10",
      });
      await insertSnapshot(transaction, {
        id: ids.snapshots.alphaPrior,
        organizationId: owner.organizationId,
        propertyId: ids.visiblePropertyId,
        leaseId: ids.alphaLeaseId,
        userId: owner.userId,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        totalRecovery: "1000.00",
        terms: {
          tenant_name: names.alphaTenant,
          pro_rata_share: "0.25",
          rentable_square_feet: "2500",
          excluded_pools: ["Parking"],
          rsf_measurement_standard: "BOMA 1996",
        },
      });
      await insertSnapshot(transaction, {
        id: ids.snapshots.removedPrior,
        organizationId: owner.organizationId,
        propertyId: ids.visiblePropertyId,
        leaseId: ids.removedLeaseId,
        userId: owner.userId,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        totalRecovery: "600.00",
        terms: {
          tenant_name: names.removedTenant,
          pro_rata_share: "0.15",
          rentable_square_feet: "1500",
          excluded_pools: [],
          rsf_measurement_standard: "BOMA 1996",
        },
      });
      await insertSnapshot(transaction, {
        id: ids.snapshots.alphaCurrent,
        organizationId: owner.organizationId,
        propertyId: ids.visiblePropertyId,
        leaseId: ids.alphaLeaseId,
        userId: owner.userId,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        totalRecovery: "1600.00",
        terms: {
          tenant_name: names.alphaTenant,
          pro_rata_share: "0.30",
          rentable_square_feet: "3000",
          excluded_pools: ["Security", "Utilities"],
          rsf_measurement_standard: "BOMA 2017",
        },
      });
      await insertSnapshot(transaction, {
        id: ids.snapshots.addedCurrent,
        organizationId: owner.organizationId,
        propertyId: ids.visiblePropertyId,
        leaseId: ids.addedLeaseId,
        userId: owner.userId,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        totalRecovery: "750.00",
        terms: {
          tenant_name: names.addedTenant,
          pro_rata_share: "0.20",
          rentable_square_feet: "2000",
          excluded_pools: [],
          rsf_measurement_standard: "BOMA 2017",
        },
      });
      await insertSnapshot(transaction, {
        id: ids.snapshots.currentOnly,
        organizationId: owner.organizationId,
        propertyId: ids.currentOnlyPropertyId,
        leaseId: ids.currentOnlyLeaseId,
        userId: owner.userId,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        totalRecovery: "444.00",
        terms: {
          tenant_name: names.currentOnlyTenant,
          pro_rata_share: "0.10",
          rentable_square_feet: "1000",
          excluded_pools: [],
          rsf_measurement_standard: "BOMA 2017",
        },
      });
      await insertSnapshot(transaction, {
        id: ids.snapshots.hiddenCurrent,
        organizationId: hidden.organizationId,
        propertyId: ids.hiddenPropertyId,
        leaseId: ids.hiddenLeaseId,
        userId: hidden.userId,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        totalRecovery: "99999.99",
        terms: {
          tenant_name: names.hiddenTenant,
          pro_rata_share: "0.99",
          rentable_square_feet: "9999",
          excluded_pools: ["Hidden Pool"],
          rsf_measurement_standard: "HIDDEN-BOMA",
        },
      });
    });

    return {
      ...ids,
      snapshotIds: Object.values(ids.snapshots),
      suffix,
      names,
      owner,
      hidden,
      noAccess,
      cleanupOrganizationIds: uniqueStrings([
        owner.organizationId,
        hidden.organizationId,
        noAccess.organizationId,
      ]),
      cleanupUserIds: [owner.userId, hidden.userId, noAccess.userId],
      cleanupEmails: [owner.email, hidden.email, noAccess.email],
      cleanupOrganizationNames: [
        owner.organizationName,
        hidden.organizationName,
        noAccess.organizationName,
      ],
    };
  } catch (error) {
    await cleanupGeneratedRows(
      sql,
      partialAccount(ids, names, created, {
        emails: [ownerEmail, hiddenEmail, noAccessEmail],
        organizationNames: [
          ownerOrganizationName,
          hiddenOrganizationName,
          noAccessOrganizationName,
        ],
      }),
    );
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function partialAccount(ids, names, created, expected) {
  return {
    ...ids,
    snapshotIds: Object.values(ids.snapshots),
    names,
    cleanupOrganizationIds: uniqueStrings(
      created.map((account) => account.organizationId),
    ),
    cleanupUserIds: created.map((account) => account.userId),
    cleanupEmails: uniqueStrings([
      ...created.map((account) => account.email),
      ...(expected?.emails ?? []),
    ]),
    cleanupOrganizationNames: uniqueStrings([
      ...created.map((account) => account.organizationName),
      ...(expected?.organizationNames ?? []),
    ]),
  };
}

async function createLocalAuthUser(input, user) {
  const { created, ...userInput } = user;
  const partial = {
    ...userInput,
    userId: "",
    organizationId: "",
    accessToken: "",
  };
  try {
    const response = await fetch(
      new URL("/auth/v1/signup", input.supabaseUrl),
      {
        method: "POST",
        headers: {
          apikey: input.anonKey,
          "content-type": "application/json",
        },
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
    if (!response.ok) {
      fail(`Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`);
    }
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
      await sql`
        update auth.users
        set email_confirmed_at = coalesce(email_confirmed_at, now())
        where id = ${userId}
      `;
      await sql`
        update users
        set role = ${userInput.role},
            full_name = ${userInput.fullName},
            updated_at = now()
        where id = ${userId}
      `;
      const rows = await sql`
        select organization_id
        from users
        where id = ${userId}
        limit 1
      `;
      organizationId = rows[0]?.organization_id;
    } finally {
      await sql.end({ timeout: 5 });
    }
    if (typeof organizationId === "string") {
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
      "token missing",
    );
    assert(
      typeof organizationId === "string" && organizationId !== "",
      "organization id missing",
    );
    partial.accessToken = accessToken;

    return { ...partial, organizationId, accessToken };
  } catch (error) {
    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await cleanupGeneratedRows(
        sql,
        partialAccount(
          {
            visiblePropertyId: UUID_SENTINEL,
            currentOnlyPropertyId: UUID_SENTINEL,
            hiddenPropertyId: UUID_SENTINEL,
            noAccessPropertyId: UUID_SENTINEL,
            alphaUnitId: UUID_SENTINEL,
            removedUnitId: UUID_SENTINEL,
            addedUnitId: UUID_SENTINEL,
            currentOnlyUnitId: UUID_SENTINEL,
            hiddenUnitId: UUID_SENTINEL,
            noAccessUnitId: UUID_SENTINEL,
            alphaLeaseId: UUID_SENTINEL,
            removedLeaseId: UUID_SENTINEL,
            addedLeaseId: UUID_SENTINEL,
            currentOnlyLeaseId: UUID_SENTINEL,
            hiddenLeaseId: UUID_SENTINEL,
            noAccessLeaseId: UUID_SENTINEL,
            snapshots: {},
          },
          {},
          [partial],
        ),
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
    throw error;
  }
}

async function insertProperty(sql, input) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy
    )
    values (
      ${input.id}, ${input.organizationId}, ${input.name}, '100 Local Denominator Way',
      'Houston', 'TX', '77002', ${input.totalRsf}, ${input.totalRsf}, 0, 0.9500
    )
  `;
}

async function insertUnit(sql, input) {
  await sql`
    insert into units (
      id, property_id, unit_number, floor, rentable_sqft, usable_sqft, status
    )
    values (
      ${input.id}, ${input.propertyId}, ${input.unitNumber}, '1',
      ${input.rentableSqft}, ${input.rentableSqft}, 'occupied'
    )
  `;
}

async function insertLease(sql, input) {
  await sql`
    insert into leases (
      id, property_id, unit_id, tenant_name, status, start_date, end_date,
      recovery_profile
    )
    values (
      ${input.id}, ${input.propertyId}, ${input.unitId}, ${input.tenantName},
      'active', '2025-01-01', '2029-12-31',
      ${sql.json({
        pro_rata_share: input.proRataShare,
        admin_fee_percentage: "0.10",
        cap_type: "none",
        excluded_pools: [],
      })}
    )
  `;
}

async function insertSnapshot(sql, input) {
  await sql`
    insert into reconciliation_snapshots (
      id, organization_id, property_id, lease_id, period_start_date,
      period_end_date, status, total_operating_expenses, grossed_up_expenses,
      base_year_amount, tenant_share_before_cap, tenant_share_after_cap,
      admin_fee, total_recovery, calculation_trace, lease_terms_snapshot,
      finalized_at, finalized_by_user_id
    )
    values (
      ${input.id}, ${input.organizationId}, ${input.propertyId}, ${input.leaseId},
      ${input.periodStart}, ${input.periodEnd}, 'finalized', 10000.00, 10500.00,
      0.00, ${input.totalRecovery}, ${input.totalRecovery}, 100.00,
      ${input.totalRecovery},
      ${sql.json([
        {
          step_name: "Local denominator change E2E",
          operation: "seeded deterministic recovery",
          output_value: input.totalRecovery,
          output_unit: "USD",
        },
      ])},
      ${sql.json(input.terms)},
      now(),
      ${input.userId}
    )
  `;
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
    try {
      await handle.close();
    } catch (closeError) {
      console.error(
        `Worker cleanup failed after startup failure: ${errorMessage(closeError)}`,
      );
    }
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-denom-e2e-"));
  const path = resolve(directory, ".dev.vars.local-denominator-change-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-denominator-change-e2e-signing-secret",
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

async function cleanupGeneratedRows(sql, account) {
  const orgIds = nonEmpty(account.cleanupOrganizationIds, UUID_SENTINEL);
  const userIds = nonEmpty(account.cleanupUserIds, UUID_SENTINEL);
  const emails = nonEmpty(account.cleanupEmails, TEXT_SENTINEL);
  const orgNames = nonEmpty(account.cleanupOrganizationNames, TEXT_SENTINEL);
  const propertyIds = nonEmpty(
    [
      account.visiblePropertyId,
      account.currentOnlyPropertyId,
      account.hiddenPropertyId,
      account.noAccessPropertyId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const unitIds = nonEmpty(
    [
      account.alphaUnitId,
      account.removedUnitId,
      account.addedUnitId,
      account.currentOnlyUnitId,
      account.hiddenUnitId,
      account.noAccessUnitId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const leaseIds = nonEmpty(
    [
      account.alphaLeaseId,
      account.removedLeaseId,
      account.addedLeaseId,
      account.currentOnlyLeaseId,
      account.hiddenLeaseId,
      account.noAccessLeaseId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const snapshotIds = nonEmpty(account.snapshotIds, UUID_SENTINEL);
  const propertyNames = nonEmpty(
    [
      account.names?.visibleProperty,
      account.names?.currentOnlyProperty,
      account.names?.hiddenProperty,
      account.names?.noAccessProperty,
    ].filter(Boolean),
    TEXT_SENTINEL,
  );
  const tenantNames = nonEmpty(
    [
      account.names?.alphaTenant,
      account.names?.removedTenant,
      account.names?.addedTenant,
      account.names?.currentOnlyTenant,
      account.names?.hiddenTenant,
      account.names?.noAccessTenant,
    ].filter(Boolean),
    TEXT_SENTINEL,
  );
  const rowIds = uniqueStrings([
    ...propertyIds,
    ...unitIds,
    ...leaseIds,
    ...snapshotIds,
  ]);

  await sql.begin(async (transaction) => {
    await transaction`
      delete from credit_consumption_log
      where organization_id in ${transaction(orgIds)}
         or reconciliation_snapshot_id in ${transaction(snapshotIds)}
    `;
    await transaction`
      delete from reconciliation_snapshots
      where id in ${transaction(snapshotIds)}
         or organization_id in ${transaction(orgIds)}
         or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from tenant_lease_links
      where lease_id in ${transaction(leaseIds)}
         or tenant_user_id in (
           select id from tenant_users where user_id in ${transaction(userIds)}
         )
    `;
    await transaction`
      delete from tenant_users
      where user_id in ${transaction(userIds)}
         or organization_id in ${transaction(orgIds)}
         or contact_email in ${transaction(emails)}
    `;
    await transaction`
      delete from leases
      where id in ${transaction(leaseIds)}
         or property_id in ${transaction(propertyIds)}
         or tenant_name in ${transaction(tenantNames)}
    `;
    await transaction`
      delete from units
      where id in ${transaction(unitIds)}
         or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from properties
      where id in ${transaction(propertyIds)}
         or organization_id in ${transaction(orgIds)}
         or name in ${transaction(propertyNames)}
    `;
    await transaction`
      delete from subscriptions
      where organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from audit_credits
      where organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from signup_email_events
      where organization_id in ${transaction(orgIds)}
         or user_id in ${transaction(userIds)}
         or email in ${transaction(emails)}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(orgIds)}
         or user_id in ${transaction(userIds)}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from audit_log
      where organization_id in ${transaction(orgIds)}
         or changed_by in ${transaction(userIds)}
         or row_id in ${transaction(rowIds)}
    `;
    await transaction`
      delete from users
      where id in ${transaction(userIds)}
         or email in ${transaction(emails)}
         or organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from auth.users
      where id in ${transaction(userIds)}
         or email in ${transaction(emails)}
    `;
    await transaction`
      delete from organizations
      where id in ${transaction(orgIds)}
         or name in ${transaction(orgNames)}
    `;
  });
}

async function assertCleanupComplete(sql, account) {
  const orgIds = nonEmpty(account.cleanupOrganizationIds, UUID_SENTINEL);
  const userIds = nonEmpty(account.cleanupUserIds, UUID_SENTINEL);
  const emails = nonEmpty(account.cleanupEmails, TEXT_SENTINEL);
  const orgNames = nonEmpty(account.cleanupOrganizationNames, TEXT_SENTINEL);
  const propertyIds = nonEmpty(
    [
      account.visiblePropertyId,
      account.currentOnlyPropertyId,
      account.hiddenPropertyId,
      account.noAccessPropertyId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const unitIds = nonEmpty(
    [
      account.alphaUnitId,
      account.removedUnitId,
      account.addedUnitId,
      account.currentOnlyUnitId,
      account.hiddenUnitId,
      account.noAccessUnitId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const leaseIds = nonEmpty(
    [
      account.alphaLeaseId,
      account.removedLeaseId,
      account.addedLeaseId,
      account.currentOnlyLeaseId,
      account.hiddenLeaseId,
      account.noAccessLeaseId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const snapshotIds = nonEmpty(account.snapshotIds, UUID_SENTINEL);

  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as org_count,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as property_count,
      (select count(*)::int from units where id in ${sql(unitIds)} or property_id in ${sql(propertyIds)}) as unit_count,
      (select count(*)::int from leases where id in ${sql(leaseIds)} or property_id in ${sql(propertyIds)}) as lease_count,
      (select count(*)::int from reconciliation_snapshots where id in ${sql(snapshotIds)} or organization_id in ${sql(orgIds)} or property_id in ${sql(propertyIds)}) as snapshot_count,
      (select count(*)::int from credit_consumption_log where organization_id in ${sql(orgIds)} or reconciliation_snapshot_id in ${sql(snapshotIds)}) as credit_consumption_count,
      (select count(*)::int from tenant_users where user_id in ${sql(userIds)} or organization_id in ${sql(orgIds)} or contact_email in ${sql(emails)}) as tenant_user_count,
      (select count(*)::int from tenant_lease_links where lease_id in ${sql(leaseIds)} or tenant_user_id in (select id from tenant_users where user_id in ${sql(userIds)} or organization_id in ${sql(orgIds)} or contact_email in ${sql(emails)})) as tenant_lease_link_count,
      (select count(*)::int from subscriptions where organization_id in ${sql(orgIds)}) as subscription_count,
      (select count(*)::int from audit_credits where organization_id in ${sql(orgIds)}) as audit_credit_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_event_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptance_count,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)} or row_id in ${sql([...propertyIds, ...unitIds, ...leaseIds, ...snapshotIds])}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.property_count === 0, "cleanup left properties");
  assert(row.unit_count === 0, "cleanup left units");
  assert(row.lease_count === 0, "cleanup left leases");
  assert(row.snapshot_count === 0, "cleanup left reconciliation snapshots");
  assert(
    row.credit_consumption_count === 0,
    "cleanup left credit consumption log rows",
  );
  assert(row.tenant_user_count === 0, "cleanup left tenant users");
  assert(row.tenant_lease_link_count === 0, "cleanup left tenant lease links");
  assert(row.subscription_count === 0, "cleanup left subscriptions");
  assert(row.audit_credit_count === 0, "cleanup left audit credits");
  assert(
    row.signup_email_event_count === 0,
    "cleanup left signup email events",
  );
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.audit_log_count === 0, "cleanup left audit logs");
}

function assertFullReport(report, account) {
  assertExactKeys(report, REPORT_KEYS, "denominator report");
  assertJsonEqual(
    {
      property_id: report.property_id,
      property_name: report.property_name,
      prior_period: report.prior_period,
      current_period: report.current_period,
      prior_total_rsf: report.prior_total_rsf,
      current_total_rsf: report.current_total_rsf,
      rsf_delta: report.rsf_delta,
      rsf_delta_percent: report.rsf_delta_percent,
      summary: report.summary,
      comparison_available: report.comparison_available,
      missing_period: report.missing_period,
    },
    {
      property_id: account.visiblePropertyId,
      property_name: account.names.visibleProperty,
      prior_period: "2025-01-01 to 2025-12-31",
      current_period: "2026-01-01 to 2026-12-31",
      prior_total_rsf: "10000",
      current_total_rsf: "12000",
      rsf_delta: "2000",
      rsf_delta_percent: "20",
      summary:
        "Total RSF changed from 10,000 to 12,000 (20.00% increase). 6 denominator changes detected. 1 tenant affected.",
      comparison_available: true,
      missing_period: null,
    },
    "denominator report summary",
  );
  assertParseableIso(report.generated_at, "denominator report generated_at");
  assertChangeRows(report.changes, account);
  assertTenantImpactRows(report.tenant_impacts, account);
  assertNoLeakage(report, account);
}

function assertUnavailableReport(report, account, label) {
  assertEmptyReport(report, denominatorBody(report.property_id), {
    label,
    missingPeriod: "current",
    summary:
      "No finalized snapshots found for current period 2026-01-01 to 2026-12-31",
    priorPeriod: "2025-01-01 to 2025-12-31",
    currentPeriod: "2026-01-01 to 2026-12-31",
  });
  assertNoLeakage(report, account);
}

function assertEmptyReport(report, body, expected) {
  assertExactKeys(report, REPORT_KEYS, expected.label);
  assertJsonEqual(
    {
      property_id: report.property_id,
      property_name: report.property_name,
      prior_period: report.prior_period,
      current_period: report.current_period,
      prior_total_rsf: report.prior_total_rsf,
      current_total_rsf: report.current_total_rsf,
      rsf_delta: report.rsf_delta,
      rsf_delta_percent: report.rsf_delta_percent,
      changes: report.changes,
      tenant_impacts: report.tenant_impacts,
      summary: report.summary,
      comparison_available: report.comparison_available,
      missing_period: report.missing_period,
    },
    {
      property_id: body.property_id,
      property_name: "",
      prior_period: expected.priorPeriod,
      current_period: expected.currentPeriod,
      prior_total_rsf: "0",
      current_total_rsf: "0",
      rsf_delta: "0",
      rsf_delta_percent: "0",
      changes: [],
      tenant_impacts: [],
      summary: expected.summary,
      comparison_available: false,
      missing_period: expected.missingPeriod,
    },
    expected.label,
  );
  assertParseableIso(report.generated_at, `${expected.label} generated_at`);
}

function assertChangeRows(changes, account) {
  assert(changes.length === 6, "change row count mismatch");
  for (let index = 0; index < changes.length; index += 1) {
    assertExactKeys(changes[index], CHANGE_KEYS, `change row ${index}`);
  }
  assertJsonEqual(
    changes,
    [
      {
        change_type: "rsf_remeasurement",
        description: "Total rentable square footage increased by 2,000 RSF",
        prior_value: "10,000 RSF",
        current_value: "12,000 RSF",
        impact_description:
          "Total RSF increased by 20.00%, affecting all tenant pro-rata share calculations",
      },
      {
        change_type: "tenant_added",
        description: `${account.names.addedTenant} added to property (2,000 RSF, 20.00% share)`,
        prior_value: "Not present",
        current_value: `${account.names.addedTenant} - 2,000 RSF`,
        impact_description: "New tenant dilutes existing tenants' shares",
      },
      {
        change_type: "tenant_removed",
        description: `${account.names.removedTenant} removed from property (1,500 RSF, 15.00% share)`,
        prior_value: `${account.names.removedTenant} - 1,500 RSF`,
        current_value: "Not present",
        impact_description: "Remaining tenants may see share concentration",
      },
      {
        change_type: "exclusion_change",
        description: `${account.names.alphaTenant} pool exclusions changed: now excludes Security, Utilities; no longer excludes Parking`,
        prior_value: "Parking",
        current_value: "Security, Utilities",
        impact_description: `Changes which expense pools ${account.names.alphaTenant} participates in`,
      },
      {
        change_type: "boma_standard_change",
        description:
          "BOMA measurement standard changed from BOMA 1996 to BOMA 2017",
        prior_value: "BOMA 1996",
        current_value: "BOMA 2017",
        impact_description:
          "BOMA re-measurement may affect rentable area calculations and pro-rata shares",
      },
      {
        change_type: "share_recalculation",
        description: `${account.names.alphaTenant} pro-rata share changed from 25.00% to 30.00% (+5.00 pct points)`,
        prior_value: "25.00%",
        current_value: "30.00%",
        impact_description: `${account.names.alphaTenant}'s share of recoverable expenses increased`,
      },
    ],
    "change rows",
  );
}

function assertTenantImpactRows(tenantImpacts, account) {
  assert(tenantImpacts.length === 1, "tenant impact row count mismatch");
  assertExactKeys(tenantImpacts[0], TENANT_IMPACT_KEYS, "tenant impact 0");
  assertJsonEqual(
    tenantImpacts,
    [
      {
        lease_id: account.alphaLeaseId,
        tenant_name: account.names.alphaTenant,
        prior_pro_rata_share: "0.25",
        current_pro_rata_share: "0.3",
        share_delta_pct_points: "5",
        prior_estimated_recovery: "1000",
        current_estimated_recovery: "1600",
        recovery_delta: "600",
        contributing_changes: [
          "rsf_remeasurement",
          "tenant_added",
          "tenant_removed",
          "exclusion_change",
          "boma_standard_change",
          "share_recalculation",
        ],
      },
    ],
    "tenant impact rows",
  );
}

function assertErrorBody(actual, expected) {
  assertJsonEqual(
    actual,
    {
      detail: expected.message,
      error: {
        code: expected.code,
        message: expected.message,
      },
    },
    expected.label,
  );
}

function assertPdf(result, account) {
  assert(
    result.contentType.includes("application/pdf"),
    "PDF content-type mismatch",
  );
  assert(
    result.contentDisposition.includes("attachment"),
    "PDF attachment missing",
  );
  assert(
    result.contentDisposition.includes(
      `denominator_change_${account.visiblePropertyId}_2026-01-01_2026-12-31.pdf`,
    ),
    "PDF filename mismatch",
  );
  assert(startsWithAscii(result.bytes, "%PDF-"), "PDF header missing");
  assert(endsWithMarker(result.bytes, "%%EOF"), "PDF EOF marker missing");
  assert(result.bytes.byteLength > 1000, "PDF bytes too small");
  assertPdfText(result.bytes, account);
}

function assertNoLeakage(value, account) {
  const text = safeJson(value);
  for (const hidden of [
    account.names.hiddenTenant,
    account.names.hiddenProperty,
    account.hiddenUnitId,
    account.hiddenLeaseId,
    account.names.noAccessTenant,
    account.names.noAccessProperty,
    account.noAccessUnitId,
    account.noAccessLeaseId,
    "99999.99",
  ]) {
    assert(!text.includes(hidden), `response leaked hidden marker ${hidden}`);
  }
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  assertJsonEqual(
    Object.keys(actual).sort(),
    [...expectedKeys].sort(),
    `${label} keys`,
  );
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertParseableIso(value, label) {
  assert(typeof value === "string", `${label} should be a string`);
  assert(!Number.isNaN(Date.parse(value)), `${label} should be parseable ISO`);
}

function assertPdfText(bytes, account) {
  const text = normalizePdfText(extractPdfText(bytes));
  const expected = [
    "Denominator Change Audit Report",
    `Property: ${account.names.visibleProperty}`,
    "Prior Period: 2025-01-01 to 2025-12-31",
    "Current Period: 2026-01-01 to 2026-12-31",
    "Total RSF",
    "10,000",
    "12,000",
    "+2,000 (+20.00%)",
    "Rsf Remeasurement",
    "Tenant Added",
    "Tenant Removed",
    "Exclusion Change",
    "Boma Standard Change",
    "Share Recalculation",
    "Per-Tenant Impact",
    account.names.alphaTenant,
    "25.00%",
    "30.00%",
    "+5.00",
    "$1,000.00",
    "$1,600.00",
    "+$600.00",
  ];
  for (const value of expected) {
    assert(
      text.includes(value),
      `PDF missing ${value}; extracted=${text.slice(0, 1000)}`,
    );
  }
  assertNoLeakage(text, account);
}

function normalizePdfText(text) {
  return text.replace(/\s+/gu, " ").trim();
}

function extractPdfText(bytes) {
  const buffer = Buffer.from(bytes);
  const streamMarker = Buffer.from("stream", "latin1");
  const endStreamMarker = Buffer.from("endstream", "latin1");
  let offset = 0;
  let output = "";
  while (offset < buffer.length) {
    const streamIndex = buffer.indexOf(streamMarker, offset);
    if (streamIndex === -1) break;
    let dataStart = streamIndex + streamMarker.length;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (buffer[dataStart] === 0x0a) {
      dataStart += 1;
    }
    const endIndex = buffer.indexOf(endStreamMarker, dataStart);
    if (endIndex === -1) break;
    const streamBytes = buffer.subarray(
      dataStart,
      trimPdfStreamEnd(buffer, dataStart, endIndex),
    );
    const dict = pdfStreamDictionary(buffer, streamIndex);
    const decoded = dict.includes("/FlateDecode")
      ? inflateSync(streamBytes)
      : streamBytes;
    output += ` ${extractPdfStrings(decoded.toString("latin1"))}`;
    offset = endIndex + endStreamMarker.length;
  }
  return output;
}

function trimPdfStreamEnd(buffer, start, end) {
  let dataEnd = end;
  while (
    dataEnd > start &&
    (buffer[dataEnd - 1] === 0x0a || buffer[dataEnd - 1] === 0x0d)
  ) {
    dataEnd -= 1;
  }
  return dataEnd;
}

function pdfStreamDictionary(buffer, streamIndex) {
  const dictStart = buffer.lastIndexOf(
    Buffer.from("<<", "latin1"),
    streamIndex,
  );
  const dictEnd = buffer.lastIndexOf(Buffer.from(">>", "latin1"), streamIndex);
  if (dictStart === -1 || dictEnd === -1 || dictEnd < dictStart) return "";
  return buffer.subarray(dictStart, dictEnd + 2).toString("latin1");
}

function extractPdfStrings(content) {
  const values = [];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "(") {
      const parsed = readPdfLiteralString(content, index);
      values.push(parsed.value);
      index = parsed.end;
    } else if (
      content[index] === "<" &&
      content[index + 1] !== "<" &&
      /[0-9a-fA-F]/u.test(content[index + 1] ?? "")
    ) {
      const end = content.indexOf(">", index + 1);
      if (end !== -1) {
        values.push(decodePdfHexString(content.slice(index + 1, end)));
        index = end;
      }
    }
  }
  return values.join(" ");
}

function readPdfLiteralString(content, start) {
  let depth = 1;
  let value = "";
  for (let index = start + 1; index < content.length; index += 1) {
    const char = content[index];
    if (char === "\\") {
      value += content[index + 1] ?? "";
      index += 1;
    } else if (char === "(") {
      depth += 1;
      value += char;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return { value, end: index };
      value += char;
    } else {
      value += char;
    }
  }
  return { value, end: content.length - 1 };
}

function decodePdfHexString(hex) {
  const normalized = hex.replace(/\s+/gu, "");
  const evenHex =
    normalized.length % 2 === 0 ? normalized : `${normalized.slice(0, -1)}0`;
  const bytes = [];
  for (let index = 0; index < evenHex.length; index += 2) {
    bytes.push(Number.parseInt(evenHex.slice(index, index + 2), 16));
  }
  return Buffer.from(bytes).toString("latin1");
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  const text = await response.text();
  const body = text ? parseJsonResponse(text, url) : null;
  if (response.status !== status) {
    maybeReportHasFullAccessBug(
      response,
      body,
      fetchOptions.method ?? "GET",
      url,
    );
    fail(
      `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

async function expectBytes(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  if (response.status !== status) {
    const text = await response.text().catch(() => "");
    const body = text ? tryParseJson(text) : null;
    maybeReportHasFullAccessBug(
      response,
      body ?? text,
      fetchOptions.method ?? "GET",
      url,
    );
    fail(
      `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "",
    contentDisposition: response.headers.get("content-disposition") ?? "",
  };
}

function maybeReportHasFullAccessBug(response, body, method, url) {
  const text = safeJson(body);
  if (
    response.status === 500 &&
    /has_full_access|function .* does not exist|report_generation_failed/iu.test(
      text,
    )
  ) {
    fail(
      `PRODUCTION BUG: ${method} ${redactSensitiveUrl(url)} returned 500 while checking public.has_full_access($1). Local DB may lack public.has_full_access and the denominator-change repository depends on it. Response: ${text}`,
    );
  }
}

function parseJsonResponse(text, url) {
  try {
    return JSON.parse(text);
  } catch {
    fail(
      `Expected JSON from ${redactSensitiveUrl(url)}, received: ${text.slice(0, 500)}`,
    );
  }
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function signInWithPassword(input) {
  const url = new URL("/auth/v1/token", input.supabaseUrl);
  url.searchParams.set("grant_type", "password");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return undefined;
  return body.access_token;
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
    if (!key) fail(`Invalid argument: ${arg}`);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive integer`);
  }
  return value;
}

async function readEnvValue(path, names) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  for (const name of names) {
    const line = content
      .split(/\r?\n/u)
      .find((candidate) => candidate.trim().startsWith(`${name}=`));
    if (!line) continue;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, "");
  }
  return undefined;
}

function normalizedLocalUrl(rawUrl, label) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:") fail(`${label} must use http`);
  if (url.username || url.password) {
    fail(`${label} must not include credentials`);
  }
  if (!isLoopbackHost(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  if (!url.port) fail(`${label} must include an explicit loopback port`);
  if (label === "supabase-url" && url.port !== "54321") {
    fail("supabase-url must point at local Supabase API on port 54321");
  }
  if (label === "supabase-url" && url.pathname !== "/") {
    fail("supabase-url must not include a path");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function normalizedLocalDatabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("database-url must be a valid Postgres URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must use postgres or postgresql");
  }
  if (!isLoopbackHost(url.hostname)) {
    fail("database-url must point at localhost or loopback");
  }
  if (url.port !== "54322") {
    fail("database-url must point at local Supabase Postgres on port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must use the local Supabase /postgres database");
  }
  return url.toString();
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value !== ""),
    ),
  ];
}

function nonEmpty(values, sentinel) {
  const unique = uniqueStrings(values);
  return unique.length > 0 ? unique : [sentinel];
}

function startsWithAscii(bytes, prefix) {
  return decode(bytes.slice(0, prefix.length)) === prefix;
}

function endsWithMarker(bytes, marker) {
  return decode(bytes.slice(-2048)).includes(marker);
}

function decode(bytes) {
  return new TextDecoder().decode(bytes);
}

function redactSensitiveUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  return url.toString();
}

function redactSensitiveJson(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /token|password|refresh|authorization|apikey|api_key|secret/iu.test(key)
          ? "[REDACTED]"
          : redactSensitiveJson(entry),
      ]),
    );
  }
  return value;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
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
