import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8855";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");

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
    fail(`local pool config E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const supabaseUrl = normalizedLocalSupabaseUrl(
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
    LOCAL_ANON_KEY;

  if (process.env.CI) {
    fail("Refusing to run local pool config E2E in CI.");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({
    baseUrl,
    supabaseUrl,
    databaseUrl,
  });
  let runError;
  let cleanupError;
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
          runs,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    runError = error;
  }
  try {
    await worker.close();
  } catch (error) {
    cleanupError = error;
  }
  if (runError) {
    if (cleanupError) {
      console.error(
        `Worker cleanup failed after scenario failure: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        }`,
      );
    }
    throw runError;
  }
  if (cleanupError) throw cleanupError;
}

async function runOnce(input) {
  const seedCleanup = emptyGeneratedRows();
  const account = await seedAccount(input, seedCleanup);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.ownerToken);
  const viewerHeaders = jsonAuthHeaders(account.viewerToken);
  const hiddenHeaders = jsonAuthHeaders(account.hiddenToken);
  const generated = {
    orgIds: [
      account.organizationId,
      account.viewerSignupOrganizationId,
      account.hiddenOrganizationId,
    ],
    userIds: [account.ownerUserId, account.viewerUserId, account.hiddenUserId],
    emails: [account.ownerEmail, account.viewerEmail, account.hiddenEmail],
    organizationNames: [
      account.organizationName,
      account.viewerSignupOrganizationName,
      account.hiddenOrganizationName,
    ],
    propertyIds: [
      account.sourcePropertyId,
      account.targetPropertyId,
      account.hiddenPropertyId,
    ],
    propertyNames: [
      account.sourcePropertyName,
      account.targetPropertyName,
      account.hiddenPropertyName,
    ],
    poolIds: seedCleanup.poolIds,
    mappingIds: seedCleanup.mappingIds,
    allocationIds: seedCleanup.allocationIds,
    templateIds: seedCleanup.templateIds,
    templateNames: seedCleanup.templateNames,
  };
  let runError;
  let cleanupError;
  let closeError;
  let result;

  try {
    const expense = await createPool(input.baseUrl, ownerHeaders, {
      propertyId: account.sourcePropertyId,
      name: account.poolNames.expenseParent,
      pool_type: "operating",
      is_gross_up_applicable: true,
      gross_up_target: "0.95",
      description: "Parent operating pool",
    });
    generated.poolIds.push(expense.id);
    assertDecimalString(expense.gross_up_target, "expense gross_up_target");

    const child = await createPool(input.baseUrl, ownerHeaders, {
      propertyId: account.sourcePropertyId,
      name: account.poolNames.expenseChild,
      pool_type: "operating",
      parent_pool_id: expense.id,
      is_gross_up_applicable: true,
      gross_up_target: "0.90",
    });
    generated.poolIds.push(child.id);
    assert(child.parent_pool_id === expense.id, "child parent mismatch");
    assertDecimalString(child.gross_up_target, "child gross_up_target");

    const tax = await createPool(input.baseUrl, ownerHeaders, {
      propertyId: account.sourcePropertyId,
      name: account.poolNames.tax,
      pool_type: "tax",
      is_gross_up_applicable: false,
    });
    const insurance = await createPool(input.baseUrl, ownerHeaders, {
      propertyId: account.sourcePropertyId,
      name: account.poolNames.insurance,
      pool_type: "insurance",
      is_gross_up_applicable: false,
    });
    const other = await createPool(input.baseUrl, ownerHeaders, {
      propertyId: account.sourcePropertyId,
      name: account.poolNames.other,
      pool_type: "other",
      is_gross_up_applicable: true,
      gross_up_target: null,
    });
    generated.poolIds.push(tax.id, insurance.id, other.id);
    assert(tax.gross_up_target === null, "tax gross_up_target should be null");
    assert(
      insurance.gross_up_target === null,
      "insurance gross_up_target should be null",
    );
    assert(
      other.gross_up_target === null,
      "other gross_up_target should be null",
    );

    const hiddenPool = await createPool(input.baseUrl, hiddenHeaders, {
      propertyId: account.hiddenPropertyId,
      name: account.poolNames.hidden,
      pool_type: "operating",
    });
    generated.poolIds.push(hiddenPool.id);

    const hierarchy = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/expense-pools?include_children=true`,
      { headers: ownerHeaders, status: 200 },
    );
    const parentFromList = findById(hierarchy.data, expense.id);
    assert(parentFromList, "parent pool missing from hierarchy");
    assert(
      Array.isArray(parentFromList.children) &&
        parentFromList.children.some((pool) => pool.id === child.id),
      "child pool missing from hierarchy",
    );
    const detail = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/expense-pools/${expense.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(detail.id === expense.id, "pool detail id mismatch");

    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/expense-pools`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 409,
        code: "expense_pool_conflict",
        body: JSON.stringify({
          name: account.poolNames.expenseParent,
          pool_type: "operating",
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 422,
        code: "invalid_gl_account_pattern",
        body: JSON.stringify({
          expense_pool_id: expense.id,
          gl_account_pattern: "61A",
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/expense-pools`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 400,
        code: "pool_hierarchy_too_deep",
        body: JSON.stringify({
          name: account.poolNames.grandchild,
          pool_type: "operating",
          parent_pool_id: child.id,
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.hiddenPropertyId}/expense-pools`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 404,
        code: "property_not_found",
        body: JSON.stringify({
          name: account.poolNames.crossOrgAttempt,
          pool_type: "operating",
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/expense-pools`,
      {
        method: "POST",
        headers: viewerHeaders,
        status: 403,
        code: "insufficient_permissions",
        body: JSON.stringify({
          name: account.poolNames.viewerAttempt,
          pool_type: "operating",
        }),
      },
    );

    const mapping = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 201,
        body: JSON.stringify({
          expense_pool_id: expense.id,
          gl_account_pattern: "61*",
          allocation_percentage: "0.5",
          priority: 10,
        }),
      },
    );
    generated.mappingIds.push(mapping.id);
    assert(
      mapping.allocation_percentage === "0.5000",
      "mapping decimal mismatch",
    );
    const secondaryMapping = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 201,
        body: JSON.stringify({
          expense_pool_id: expense.id,
          gl_account_pattern: "63*",
          allocation_percentage: "0.25",
          priority: 9,
        }),
      },
    );
    generated.mappingIds.push(secondaryMapping.id);
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 409,
        code: "pool_mapping_conflict",
        body: JSON.stringify({
          expense_pool_id: expense.id,
          gl_account_pattern: "61*",
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings/${secondaryMapping.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 409,
        code: "pool_mapping_conflict",
        body: JSON.stringify({
          gl_account_pattern: "61*",
        }),
      },
    );
    let mappings = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings?pool_id=${expense.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertPoolMappingsPage(mappings, {
      expected: [
        {
          id: mapping.id,
          expense_pool_id: expense.id,
          gl_account_pattern: "61*",
          allocation_percentage: "0.5000",
          priority: 10,
        },
        {
          id: secondaryMapping.id,
          expense_pool_id: expense.id,
          gl_account_pattern: "63*",
          allocation_percentage: "0.2500",
          priority: 9,
        },
      ],
      forbiddenMarkers: [
        account.hiddenPropertyId,
        account.hiddenPropertyName,
        hiddenPool.id,
        hiddenPool.name,
      ],
      label: "created pool mappings",
    });
    const updatedMapping = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings/${mapping.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          gl_account_pattern: "62*",
          allocation_percentage: "0.75",
          priority: 11,
        }),
      },
    );
    assertPoolMappingRecord(
      updatedMapping,
      {
        id: mapping.id,
        expense_pool_id: expense.id,
        gl_account_pattern: "62*",
        allocation_percentage: "0.7500",
        priority: 11,
      },
      "updated mapping",
    );
    await expectEmpty(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings/${mapping.id}`,
      { method: "DELETE", headers: ownerHeaders, status: 204 },
    );
    mappings = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings?pool_id=${expense.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(
      !mappings.data.some((candidate) => candidate.id === mapping.id),
      "deleted mapping still appears in list",
    );
    generated.mappingIds = generated.mappingIds.filter(
      (id) => id !== mapping.id,
    );
    await expectEmpty(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings/${secondaryMapping.id}`,
      { method: "DELETE", headers: ownerHeaders, status: 204 },
    );
    mappings = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-mappings?pool_id=${expense.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(
      !mappings.data.some((candidate) => candidate.id === secondaryMapping.id),
      "deleted secondary mapping still appears in list",
    );
    generated.mappingIds = generated.mappingIds.filter(
      (id) => id !== secondaryMapping.id,
    );

    const allocation = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 201,
        body: JSON.stringify({
          source_pool_id: expense.id,
          target_pool_id: tax.id,
          allocation_type: "percentage",
          allocation_value: "60",
        }),
      },
    );
    generated.allocationIds.push(allocation.id);
    const expectedAllocation = {
      id: allocation.id,
      source_pool_id: expense.id,
      target_pool_id: tax.id,
      allocation_type: "percentage",
      allocation_value: "60.0000",
    };
    assertPoolAllocationRecord(
      allocation,
      expectedAllocation,
      "created allocation",
    );
    await assertPoolAllocationDbRecord(
      sql,
      expectedAllocation,
      "created allocation DB row",
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 409,
        code: "pool_allocation_conflict",
        body: JSON.stringify({
          source_pool_id: expense.id,
          target_pool_id: tax.id,
          allocation_type: "percentage",
          allocation_value: "10",
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 422,
        code: "allocation_total_exceeded",
        body: JSON.stringify({
          source_pool_id: expense.id,
          target_pool_id: insurance.id,
          allocation_type: "percentage",
          allocation_value: "45",
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 422,
        code: "self_allocation",
        body: JSON.stringify({
          source_pool_id: expense.id,
          target_pool_id: expense.id,
          allocation_type: "percentage",
          allocation_value: "10",
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 422,
        code: "unsupported_allocation_type",
        body: JSON.stringify({
          source_pool_id: expense.id,
          target_pool_id: insurance.id,
          allocation_type: "fixed_amount",
          allocation_value: "25",
        }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 400,
        code: "invalid_pool_reference",
        body: JSON.stringify({
          source_pool_id: expense.id,
          target_pool_id: hiddenPool.id,
          allocation_type: "percentage",
          allocation_value: "10",
        }),
      },
    );
    const updatedAllocation = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations/${allocation.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({ allocation_value: "75" }),
      },
    );
    const expectedUpdatedAllocation = {
      ...expectedAllocation,
      allocation_value: "75.0000",
    };
    assertPoolAllocationRecord(
      updatedAllocation,
      expectedUpdatedAllocation,
      "updated allocation",
    );
    await assertPoolAllocationDbRecord(
      sql,
      expectedUpdatedAllocation,
      "updated allocation DB row",
    );
    let allocations = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations?source_pool_id=${expense.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertPoolAllocationsPage(allocations, {
      label: "updated allocation page",
      expected: [expectedUpdatedAllocation],
      forbiddenMarkers: [hiddenPool.id],
    });
    await expectEmpty(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations/${allocation.id}`,
      { method: "DELETE", headers: ownerHeaders, status: 204 },
    );
    await assertPoolAllocationDeleted(
      sql,
      allocation.id,
      "deleted allocation DB row",
    );
    allocations = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.sourcePropertyId}/pool-allocations?source_pool_id=${expense.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertPoolAllocationsPage(allocations, {
      label: "deleted allocation page",
      expected: [],
      forbiddenMarkers: [allocation.id, hiddenPool.id],
    });
    generated.allocationIds = generated.allocationIds.filter(
      (id) => id !== allocation.id,
    );

    const templates = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates`,
      {
        headers: ownerHeaders,
        status: 200,
      },
    );
    const systemTemplate = templates.find((template) => template.is_system);
    assert(systemTemplate, "system template missing");
    const customTemplateName = account.templateNames.custom;
    await expectError(`${input.baseUrl}/api/v1/pool-templates`, {
      method: "POST",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
      body: JSON.stringify({
        name: account.templateNames.viewerAttempt,
        structure: templateStructure({
          parent: `${account.templatePoolNames.parent} Viewer`,
          child: `${account.templatePoolNames.child} Viewer`,
        }),
      }),
    });
    const custom = await expectJson(`${input.baseUrl}/api/v1/pool-templates`, {
      method: "POST",
      headers: ownerHeaders,
      status: 201,
      body: JSON.stringify({
        name: customTemplateName,
        description: "Local template before update",
        property_type: "office",
        structure: templateStructure(account.templatePoolNames),
      }),
    });
    generated.templateIds.push(custom.id);
    generated.templateNames.push(custom.name);
    const templatesWithCustom = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(
      templatesWithCustom.some((template) => template.is_system) &&
        templatesWithCustom.some((template) => template.id === custom.id),
      "template list missing system or custom template",
    );
    const customDetail = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/${custom.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(customDetail.id === custom.id, "template detail mismatch");
    const updatedTemplate = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/${custom.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          description: "Local template after update",
          property_type: "retail",
        }),
      },
    );
    assert(
      updatedTemplate.description === "Local template after update" &&
        updatedTemplate.property_type === "retail",
      "template update mismatch",
    );
    await expectError(`${input.baseUrl}/api/v1/pool-templates/${custom.id}`, {
      method: "PUT",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
      body: JSON.stringify({ description: "viewer mutation attempt" }),
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates/${custom.id}`, {
      method: "DELETE",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
    });

    const duplicateTemplateResponse = await fetch(
      `${input.baseUrl}/api/v1/pool-templates`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          name: customTemplateName,
          description: "Duplicate name probe",
          property_type: "office",
          structure: templateStructure({
            parent: `${account.templatePoolNames.parent} Duplicate`,
            child: `${account.templatePoolNames.child} Duplicate`,
          }),
        }),
      },
    );
    const duplicateTemplate = await parseResponseJson(
      duplicateTemplateResponse,
    );
    assert(
      duplicateTemplateResponse.status === 201,
      `duplicate template returned unexpected status ${duplicateTemplateResponse.status}`,
    );
    assert(
      duplicateTemplate.id !== custom.id &&
        duplicateTemplate.organization_id === account.organizationId,
      "duplicate template coexistence did not return distinct org-owned row",
    );
    generated.templateIds.push(duplicateTemplate.id);
    generated.templateNames.push(duplicateTemplate.name);

    const hiddenTemplate = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates`,
      {
        method: "POST",
        headers: hiddenHeaders,
        status: 201,
        body: JSON.stringify({
          name: account.templateNames.hidden,
          description: "Hidden org template",
          structure: templateStructure({
            parent: `${account.templatePoolNames.parent} Hidden`,
            child: `${account.templatePoolNames.child} Hidden`,
          }),
        }),
      },
    );
    generated.templateIds.push(hiddenTemplate.id);
    generated.templateNames.push(hiddenTemplate.name);
    await expectError(
      `${input.baseUrl}/api/v1/pool-templates/${hiddenTemplate.id}`,
      {
        headers: ownerHeaders,
        status: 404,
        code: "pool_template_not_found",
      },
    );
    await expectError(`${input.baseUrl}/api/v1/pool-templates/apply`, {
      method: "POST",
      headers: ownerHeaders,
      status: 404,
      code: "pool_template_not_found",
      body: JSON.stringify({
        template_id: hiddenTemplate.id,
        property_id: account.targetPropertyId,
        delete_existing: false,
      }),
    });

    const invalidTemplate = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 422,
        body: JSON.stringify({
          name: account.templateNames.invalid,
          structure: {
            pools: [
              {
                name: "Parent",
                children: [
                  { name: "Child", children: [{ name: "Grandchild" }] },
                ],
              },
            ],
          },
        }),
      },
    );
    assert(
      errorCode(invalidTemplate) === "validation_error",
      "invalid template structure error code mismatch",
    );

    await expectError(`${input.baseUrl}/api/v1/pool-templates/apply`, {
      method: "POST",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
      body: JSON.stringify({
        template_id: custom.id,
        property_id: account.targetPropertyId,
        delete_existing: false,
      }),
    });
    const applied = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/apply`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          template_id: custom.id,
          property_id: account.targetPropertyId,
          delete_existing: true,
        }),
      },
    );
    assertAppliedTemplateResult(applied, {
      template_name: custom.name,
      property_id: account.targetPropertyId,
      parent: {
        name: account.templatePoolNames.parent,
        pool_type: "operating",
        is_gross_up_applicable: true,
        gross_up_target: null,
        description: null,
        parent_pool_id: null,
      },
      child: {
        name: account.templatePoolNames.child,
        pool_type: "operating",
        is_gross_up_applicable: true,
        gross_up_target: null,
        description: null,
      },
    });
    generated.poolIds.push(
      ...applied.parent_pools.map((pool) => pool.id),
      ...applied.child_pools.map((pool) => pool.id),
    );
    await assertExpensePoolDbRecord(
      sql,
      {
        id: applied.parent_pools[0].id,
        property_id: account.targetPropertyId,
        name: account.templatePoolNames.parent,
        pool_type: "operating",
        is_gross_up_applicable: true,
        gross_up_target: null,
        description: null,
        parent_pool_id: null,
      },
      "applied parent DB row",
    );
    await assertExpensePoolDbRecord(
      sql,
      {
        id: applied.child_pools[0].id,
        property_id: account.targetPropertyId,
        name: account.templatePoolNames.child,
        pool_type: "operating",
        is_gross_up_applicable: true,
        gross_up_target: null,
        description: null,
        parent_pool_id: applied.parent_pools[0].id,
      },
      "applied child DB row",
    );
    let targetPools = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.targetPropertyId}/expense-pools?include_children=true`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(
      poolNames(targetPools.data).includes(account.templatePoolNames.parent) &&
        poolNames(targetPools.data).includes(account.templatePoolNames.child),
      "applied template pools missing from target",
    );

    await expectError(`${input.baseUrl}/api/v1/pool-templates/copy`, {
      method: "POST",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
      body: JSON.stringify({
        source_property_id: account.sourcePropertyId,
        target_property_id: account.targetPropertyId,
        copy_mode: "merge",
      }),
    });
    const copied = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/copy`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          source_property_id: account.sourcePropertyId,
          target_property_id: account.targetPropertyId,
          copy_mode: "replace",
        }),
      },
    );
    assertCopiedPoolsResult(copied, {
      pools_copied: 5,
      parent_pools_copied: 4,
      child_pools_copied: 1,
      pools_deleted: 2,
      expected: [
        { name: account.poolNames.insurance, is_parent: true },
        { name: account.poolNames.expenseParent, is_parent: true },
        { name: account.poolNames.other, is_parent: true },
        { name: account.poolNames.tax, is_parent: true },
        { name: account.poolNames.expenseChild, is_parent: false },
      ],
    });
    generated.poolIds.push(...copied.copied_pools.map((pool) => pool.id));
    targetPools = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.targetPropertyId}/expense-pools?include_children=true`,
      { headers: ownerHeaders, status: 200 },
    );
    const copiedNames = poolNames(targetPools.data);
    assert(
      copiedNames.includes(account.poolNames.expenseParent) &&
        copiedNames.includes(account.poolNames.expenseChild),
      "copied source pools missing from target",
    );
    const copiedByName = Object.fromEntries(
      copied.copied_pools.map((pool) => [pool.name, pool]),
    );
    for (const expectedName of [
      account.poolNames.expenseParent,
      account.poolNames.expenseChild,
      account.poolNames.tax,
      account.poolNames.insurance,
      account.poolNames.other,
    ]) {
      assert(copiedByName[expectedName], `copied pool ${expectedName} missing`);
    }
    await assertExpensePoolDbRecord(
      sql,
      {
        id: copiedByName[account.poolNames.expenseParent].id,
        property_id: account.targetPropertyId,
        name: account.poolNames.expenseParent,
        pool_type: "operating",
        is_gross_up_applicable: true,
        gross_up_target: "0.9500",
        description: "Parent operating pool",
        parent_pool_id: null,
      },
      "copied parent DB row",
    );
    await assertExpensePoolDbRecord(
      sql,
      {
        id: copiedByName[account.poolNames.expenseChild].id,
        property_id: account.targetPropertyId,
        name: account.poolNames.expenseChild,
        pool_type: "operating",
        is_gross_up_applicable: true,
        gross_up_target: "0.9000",
        description: null,
        parent_pool_id: copiedByName[account.poolNames.expenseParent].id,
      },
      "copied child DB row",
    );
    await assertExpensePoolDbRecord(
      sql,
      {
        id: copiedByName[account.poolNames.tax].id,
        property_id: account.targetPropertyId,
        name: account.poolNames.tax,
        pool_type: "tax",
        is_gross_up_applicable: false,
        gross_up_target: null,
        description: null,
        parent_pool_id: null,
      },
      "copied tax DB row",
    );
    await assertExpensePoolDbRecord(
      sql,
      {
        id: copiedByName[account.poolNames.insurance].id,
        property_id: account.targetPropertyId,
        name: account.poolNames.insurance,
        pool_type: "insurance",
        is_gross_up_applicable: false,
        gross_up_target: null,
        description: null,
        parent_pool_id: null,
      },
      "copied insurance DB row",
    );
    await assertExpensePoolDbRecord(
      sql,
      {
        id: copiedByName[account.poolNames.other].id,
        property_id: account.targetPropertyId,
        name: account.poolNames.other,
        pool_type: "other",
        is_gross_up_applicable: true,
        gross_up_target: null,
        description: null,
        parent_pool_id: null,
      },
      "copied other DB row",
    );
    await expectError(`${input.baseUrl}/api/v1/pool-templates/copy`, {
      method: "POST",
      headers: ownerHeaders,
      status: 422,
      code: "validation_error",
      body: JSON.stringify({
        source_property_id: account.sourcePropertyId,
        target_property_id: account.sourcePropertyId,
      }),
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates/copy`, {
      method: "POST",
      headers: ownerHeaders,
      status: 404,
      code: "target_property_not_found",
      body: JSON.stringify({
        source_property_id: account.sourcePropertyId,
        target_property_id: account.hiddenPropertyId,
        copy_mode: "replace",
      }),
    });

    await expectEmpty(`${input.baseUrl}/api/v1/pool-templates/${custom.id}`, {
      method: "DELETE",
      headers: ownerHeaders,
      status: 204,
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates/${custom.id}`, {
      headers: ownerHeaders,
      status: 404,
      code: "pool_template_not_found",
    });
    generated.templateIds = generated.templateIds.filter(
      (id) => id !== custom.id,
    );

    await expectError(
      `${input.baseUrl}/api/v1/pool-templates/${systemTemplate.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 403,
        code: "system_template_immutable",
        body: JSON.stringify({ description: "mutated" }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/pool-templates/${systemTemplate.id}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
        status: 403,
        code: "system_template_immutable",
      },
    );

    result = {
      index: input.index,
      organization_id: account.organizationId,
      source_property_id: account.sourcePropertyId,
      target_property_id: account.targetPropertyId,
      system_template_checked: systemTemplate.id,
      copied_pools: copied.pools_copied,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupGeneratedRows(sql, generated);
      await assertCleanupComplete(sql, generated);
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch (error) {
        closeError = error;
      }
    }
  }
  const postRunError = cleanupError ?? closeError;
  if (postRunError) {
    if (runError) {
      console.error(
        `Pool config cleanup failed after scenario failure: ${
          postRunError instanceof Error
            ? postRunError.message
            : String(postRunError)
        }`,
      );
    } else {
      throw postRunError;
    }
  }
  if (runError) throw runError;
  return result;
}

async function seedAccount(input, cleanup) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ids = {
    sourcePropertyId: randomUUID(),
    targetPropertyId: randomUUID(),
    hiddenPropertyId: randomUUID(),
  };
  const ownerEmail = `pool-config-owner-${suffix}@capveri.local`;
  const viewerEmail = `pool-config-viewer-${suffix}@capveri.local`;
  const hiddenEmail = `pool-config-hidden-${suffix}@capveri.local`;
  const organizationName = `Local Pool Config Org ${suffix}`;
  const viewerSignupOrganizationName = `Local Pool Config Viewer Signup Org ${suffix}`;
  const hiddenOrganizationName = `Local Pool Config Hidden Org ${suffix}`;
  const sourcePropertyName = `Local Pool Source ${suffix}`;
  const targetPropertyName = `Local Pool Target ${suffix}`;
  const hiddenPropertyName = `Local Pool Hidden ${suffix}`;
  cleanup.emails.push(ownerEmail, viewerEmail, hiddenEmail);
  cleanup.organizationNames.push(
    organizationName,
    viewerSignupOrganizationName,
    hiddenOrganizationName,
  );
  cleanup.propertyIds.push(...Object.values(ids));
  cleanup.propertyNames.push(
    sourcePropertyName,
    targetPropertyName,
    hiddenPropertyName,
  );
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let owner;
  let viewer;
  let hidden;
  let seedError;
  let cleanupError;
  let closeError;

  try {
    owner = await createLocalAuthUser(input, {
      email: ownerEmail,
      password: `OwnerPass${input.index}A1!`,
      fullName: "Local Pool Owner",
      organizationName,
      cleanup,
    });
    viewer = await createLocalAuthUser(input, {
      email: viewerEmail,
      password: `ViewerPass${input.index}A1!`,
      fullName: "Local Pool Viewer",
      organizationName: viewerSignupOrganizationName,
      cleanup,
    });
    hidden = await createLocalAuthUser(input, {
      email: hiddenEmail,
      password: `HiddenPass${input.index}A1!`,
      fullName: "Local Pool Hidden Owner",
      organizationName: hiddenOrganizationName,
      cleanup,
    });

    await sql.begin(async (transaction) => {
      await transaction`
        update users
        set role = 'owner', full_name = 'Local Pool Owner', updated_at = now()
        where id = ${owner.userId}
      `;
      await transaction`
        update users
        set organization_id = ${owner.organizationId},
            role = 'viewer',
            full_name = 'Local Pool Viewer',
            updated_at = now()
        where id = ${viewer.userId}
      `;
      await transaction`
        update users
        set role = 'owner', full_name = 'Local Pool Hidden Owner', updated_at = now()
        where id = ${hidden.userId}
      `;
      await insertProperty(transaction, {
        id: ids.sourcePropertyId,
        orgId: owner.organizationId,
        name: sourcePropertyName,
        address: "101 Local Pool Way",
      });
      await insertProperty(transaction, {
        id: ids.targetPropertyId,
        orgId: owner.organizationId,
        name: targetPropertyName,
        address: "202 Local Pool Way",
      });
      await insertProperty(transaction, {
        id: ids.hiddenPropertyId,
        orgId: hidden.organizationId,
        name: hiddenPropertyName,
        address: "303 Hidden Pool Way",
      });
    });
  } catch (error) {
    seedError = error;
    try {
      await cleanupGeneratedRows(sql, cleanup);
      await assertCleanupComplete(sql, cleanup);
    } catch (cleanupFailure) {
      cleanupError = cleanupFailure;
    }
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      closeError = error;
    }
  }
  if (seedError) {
    const postSeedError = cleanupError ?? closeError;
    if (postSeedError) {
      console.error(
        `Pool config seed cleanup failed after seed failure: ${
          postSeedError instanceof Error
            ? postSeedError.message
            : String(postSeedError)
        }`,
      );
    }
    throw seedError;
  }
  if (cleanupError) throw cleanupError;
  if (closeError) throw closeError;
  dedupeGeneratedRows(cleanup);

  return {
    ...ids,
    ownerUserId: owner.userId,
    ownerToken: owner.accessToken,
    ownerEmail,
    organizationId: owner.organizationId,
    organizationName,
    viewerUserId: viewer.userId,
    viewerToken: viewer.accessToken,
    viewerEmail,
    viewerSignupOrganizationId: viewer.organizationId,
    viewerSignupOrganizationName,
    hiddenUserId: hidden.userId,
    hiddenToken: hidden.accessToken,
    hiddenEmail,
    hiddenOrganizationId: hidden.organizationId,
    hiddenOrganizationName,
    sourcePropertyName,
    targetPropertyName,
    hiddenPropertyName,
    poolNames: {
      expenseParent: `Operating Parent ${suffix}`,
      expenseChild: `Janitorial Child ${suffix}`,
      tax: `Tax Target ${suffix}`,
      insurance: `Insurance Target ${suffix}`,
      other: `Other Target ${suffix}`,
      hidden: `Hidden Pool ${suffix}`,
      grandchild: `Grandchild Probe ${suffix}`,
      crossOrgAttempt: `Cross Org Probe ${suffix}`,
      viewerAttempt: `Viewer Probe ${suffix}`,
    },
    templateNames: {
      custom: `Local Pool Template ${suffix}`,
      hidden: `Hidden Pool Template ${suffix}`,
      invalid: `Invalid Pool Template ${suffix}`,
      viewerAttempt: `Viewer Pool Template ${suffix}`,
    },
    templatePoolNames: {
      parent: `Template Parent ${suffix}`,
      child: `Template Child ${suffix}`,
    },
  };
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
          await new Promise((resolveClose) => {
            const timeout = setTimeout(resolveClose, 5000);
            child.once("exit", () => {
              clearTimeout(timeout);
              resolveClose();
            });
          });
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
    await handle.close();
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-pool-config-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-pool-config-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-pool-config-e2e-signing-secret",
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

async function createPool(baseUrl, headers, input) {
  const { propertyId, ...body } = input;
  return expectJson(
    `${baseUrl}/api/v1/properties/${propertyId}/expense-pools`,
    {
      method: "POST",
      headers,
      status: 201,
      body: JSON.stringify(body),
    },
  );
}

async function createLocalAuthUser(input, user) {
  const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      data: {
        full_name: user.fullName,
        organization_name: user.organizationName,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`);
  }
  const userId = body.user?.id;
  assert(typeof userId === "string", "signup did not return user id");
  user.cleanup.userIds.push(userId);

  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let organizationId;
  try {
    await sql`
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now())
      where id = ${userId}
    `;
    const rows = await sql`
      select organization_id
      from users
      where id = ${userId}
      limit 1
    `;
    organizationId = rows[0]?.organization_id;
    if (typeof organizationId === "string") {
      user.cleanup.orgIds.push(organizationId);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const accessToken =
    body.session?.access_token ??
    (await signInWithPassword({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: user.email,
      password: user.password,
    }));
  assert(typeof accessToken === "string", "signup did not return token");
  assert(typeof organizationId === "string", "signup org missing");

  return { ...user, userId, organizationId, accessToken };
}

async function insertProperty(sql, input) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy
    )
    values (
      ${input.id}, ${input.orgId}, ${input.name}, ${input.address},
      'Austin', 'TX', '78701', 100000, 90000, 10000, 0.9500
    )
  `;
}

function templateStructure(names) {
  return {
    pools: [
      {
        name: names.parent,
        gross_up_enabled: true,
        children: [{ name: names.child, gross_up_enabled: true }],
      },
    ],
  };
}

async function cleanupGeneratedRows(sql, rawInput) {
  const input = normalizeCleanupInput(rawInput);
  const auditRowIds = [
    ...input.orgIds,
    ...input.userIds,
    ...input.propertyIds,
    ...input.poolIds,
    ...input.mappingIds,
    ...input.allocationIds,
    ...input.templateIds,
  ];
  const generatedNames = [
    ...input.organizationNames,
    ...input.propertyNames,
    ...input.templateNames,
  ];

  await sql.begin(async (transaction) => {
    await transaction`
      delete from pool_allocations
      where id in ${transaction(input.allocationIds)}
         or source_pool_id in ${transaction(input.poolIds)}
         or target_pool_id in ${transaction(input.poolIds)}
    `;
    await transaction`
      delete from pool_mappings
      where id in ${transaction(input.mappingIds)}
         or expense_pool_id in ${transaction(input.poolIds)}
    `;
    await transaction`
      delete from expense_pools
      where id in ${transaction(input.poolIds)}
         or property_id in ${transaction(input.propertyIds)}
    `;
    await transaction`
      delete from pool_templates
      where id in ${transaction(input.templateIds)}
         or organization_id in ${transaction(input.orgIds)}
         or name in ${transaction(input.templateNames)}
    `;
    await transaction`
      delete from properties
      where id in ${transaction(input.propertyIds)}
         or organization_id in ${transaction(input.orgIds)}
         or name in ${transaction(input.propertyNames)}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(input.orgIds)}
         or user_id in ${transaction(input.userIds)}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from signup_email_events
      where user_id in ${transaction(input.userIds)}
         or organization_id in ${transaction(input.orgIds)}
         or email in ${transaction(input.emails)}
    `;
    await transaction`
      delete from audit_log
      where organization_id in ${transaction(input.orgIds)}
         or changed_by in ${transaction(input.userIds)}
         or row_id in ${transaction(auditRowIds)}
         or old_data::text like any(${generatedNames.map((name) => `%${name}%`)})
         or new_data::text like any(${generatedNames.map((name) => `%${name}%`)})
    `;
    await transaction`
      delete from users
      where id in ${transaction(input.userIds)}
         or email in ${transaction(input.emails)}
         or organization_id in ${transaction(input.orgIds)}
    `;
    await transaction`
      delete from auth.users
      where id in ${transaction(input.userIds)}
         or email in ${transaction(input.emails)}
    `;
    await transaction`
      delete from organizations
      where id in ${transaction(input.orgIds)}
         or name in ${transaction(input.organizationNames)}
    `;
  });
}

async function assertCleanupComplete(sql, rawInput) {
  const input = normalizeCleanupInput(rawInput);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(input.userIds)} or email in ${sql(input.emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(input.userIds)} or email in ${sql(input.emails)} or organization_id in ${sql(input.orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(input.orgIds)} or name in ${sql(input.organizationNames)}) as org_count,
      (select count(*)::int from properties where id in ${sql(input.propertyIds)} or organization_id in ${sql(input.orgIds)} or name in ${sql(input.propertyNames)}) as property_count,
      (select count(*)::int from expense_pools where id in ${sql(input.poolIds)} or property_id in ${sql(input.propertyIds)}) as pool_count,
      (select count(*)::int from pool_mappings where id in ${sql(input.mappingIds)} or expense_pool_id in ${sql(input.poolIds)}) as mapping_count,
      (select count(*)::int from pool_allocations where id in ${sql(input.allocationIds)} or source_pool_id in ${sql(input.poolIds)} or target_pool_id in ${sql(input.poolIds)}) as allocation_count,
      (select count(*)::int from pool_templates where id in ${sql(input.templateIds)} or organization_id in ${sql(input.orgIds)} or name in ${sql(input.templateNames)}) as template_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(input.orgIds)} or user_id in ${sql(input.userIds)}) as legal_acceptance_count,
      (select count(*)::int from signup_email_events where user_id in ${sql(input.userIds)} or organization_id in ${sql(input.orgIds)} or email in ${sql(input.emails)}) as signup_email_count,
      (select count(*)::int from audit_log where organization_id in ${sql(input.orgIds)} or changed_by in ${sql(input.userIds)}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.property_count === 0, "cleanup left properties");
  assert(row.pool_count === 0, "cleanup left expense pools");
  assert(row.mapping_count === 0, "cleanup left pool mappings");
  assert(row.allocation_count === 0, "cleanup left pool allocations");
  assert(row.template_count === 0, "cleanup left pool templates");
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.signup_email_count === 0, "cleanup left signup email events");
  assert(row.audit_log_count === 0, "cleanup left audit logs");
}

function emptyGeneratedRows() {
  return {
    orgIds: [],
    userIds: [],
    propertyIds: [],
    poolIds: [],
    mappingIds: [],
    allocationIds: [],
    templateIds: [],
    emails: [],
    organizationNames: [],
    propertyNames: [],
    templateNames: [],
  };
}

function dedupeGeneratedRows(input) {
  for (const key of Object.keys(input)) {
    input[key] = [...new Set(input[key])];
  }
}

function normalizeCleanupInput(input) {
  const uuidSentinel = "00000000-0000-4000-8000-000000000000";
  const textSentinel = "__pool_config_e2e_none__";
  return {
    orgIds: nonEmpty(input.orgIds, uuidSentinel),
    userIds: nonEmpty(input.userIds, uuidSentinel),
    propertyIds: nonEmpty(input.propertyIds, uuidSentinel),
    poolIds: nonEmpty(input.poolIds, uuidSentinel),
    mappingIds: nonEmpty(input.mappingIds, uuidSentinel),
    allocationIds: nonEmpty(input.allocationIds, uuidSentinel),
    templateIds: nonEmpty(input.templateIds, uuidSentinel),
    emails: nonEmpty(input.emails, textSentinel),
    organizationNames: nonEmpty(input.organizationNames, textSentinel),
    propertyNames: nonEmpty(input.propertyNames, textSentinel),
    templateNames: nonEmpty(input.templateNames, textSentinel),
  };
}

function nonEmpty(values, sentinel) {
  const clean = [...new Set((values ?? []).filter(Boolean))];
  return clean.length > 0 ? clean : [sentinel];
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

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  const body = await parseResponseJson(response);
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

async function expectError(url, options = {}) {
  const { code, ...rest } = options;
  const body = await expectJson(url, rest);
  assert(errorCode(body) === code, `expected error code ${code}`);
  return body;
}

async function expectEmpty(url, options = {}) {
  const { status = 204, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  if (response.status !== status) {
    const text = await response.text().catch(() => "");
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
}

async function parseResponseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON response, received: ${text.slice(0, 500)}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//i.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }
      fail(`Unexpected argument: ${arg}`);
    }
    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split("=", 2);
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
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().startsWith(`${name}=`));
    if (!line) continue;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
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
  if (url.username || url.password)
    fail(`${label} must not include credentials`);
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
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
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("database-url must be a valid Postgres URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must use postgres or postgresql");
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail("database-url must point at localhost or loopback");
  }
  if (url.port !== "54322") {
    fail("database-url must use the local Supabase Postgres port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must target the local Supabase postgres database");
  }
  return url.toString();
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
    await sleep(500);
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await sleep(250);
  }
  await killLoopbackPortOwner(Number(url.port));
  const retryDeadline = Date.now() + 3000;
  while (Date.now() < retryDeadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await sleep(250);
  }
  fail(`${baseUrl} still accepts TCP connections after close`);
}

async function killLoopbackPortOwner(port) {
  if (process.platform !== "win32") return;
  await new Promise((resolveKill) => {
    const killer = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$ErrorActionPreference='SilentlyContinue'; " +
          `$port=${port}; ` +
          "Get-NetTCPConnection -LocalPort $port -State Listen | " +
          "Select-Object -ExpandProperty OwningProcess -Unique | " +
          "Where-Object { $_ -and $_ -ne $PID } | " +
          "ForEach-Object { Stop-Process -Id $_ -Force }",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    killer.once("exit", resolveKill);
    killer.once("error", resolveKill);
  });
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function findById(values, id) {
  for (const value of values ?? []) {
    if (value.id === id) {
      return value;
    }
    const child = findById(value.children, id);
    if (child) {
      return child;
    }
  }
  return undefined;
}

function poolNames(values) {
  const names = [];
  for (const value of values ?? []) {
    names.push(value.name);
    names.push(...poolNames(value.children));
  }
  return names;
}

function errorCode(body) {
  return body?.error?.code;
}

function assertDecimalString(value, label) {
  assert(
    typeof value === "string",
    `${label} should be serialized as a string`,
  );
  assert(Number.isFinite(Number(value)), `${label} should be numeric`);
}

function assertPoolMappingsPage(page, input) {
  assert(Array.isArray(page?.data), `${input.label} data should be an array`);
  assert(
    page.data.length === input.expected.length,
    `${input.label} mapping count mismatch`,
  );
  assert(page.count === input.expected.length, `${input.label} count mismatch`);
  for (const [index, expected] of input.expected.entries()) {
    assertPoolMappingRecord(
      page.data[index],
      expected,
      `${input.label} ${index}`,
    );
  }
  const serialized = JSON.stringify(page);
  for (const marker of input.forbiddenMarkers) {
    assert(
      !serialized.includes(marker),
      `${input.label} leaked forbidden mapping marker ${marker}`,
    );
  }
}

function assertPoolAllocationsPage(page, input) {
  assertAllowedKeys(page, ["data", "count", "has_more"], input.label);
  assert(Array.isArray(page?.data), `${input.label} data should be an array`);
  assert(
    page.data.length === input.expected.length,
    `${input.label} allocation count mismatch`,
  );
  assert(page.count === input.expected.length, `${input.label} count mismatch`);
  assert(page.has_more === false, `${input.label} has_more mismatch`);
  for (const [index, expected] of input.expected.entries()) {
    assertPoolAllocationRecord(
      page.data[index],
      expected,
      `${input.label} ${index}`,
    );
  }
  const serialized = JSON.stringify(page);
  for (const marker of input.forbiddenMarkers) {
    assert(
      !serialized.includes(marker),
      `${input.label} leaked forbidden allocation marker ${marker}`,
    );
  }
}

function assertPoolAllocationRecord(actual, expected, label) {
  assertAllowedKeys(
    actual,
    [
      "id",
      "source_pool_id",
      "target_pool_id",
      "allocation_type",
      "allocation_value",
      "created_at",
      "updated_at",
    ],
    label,
  );
  assert(actual.id === expected.id, `${label} id mismatch`);
  assert(
    actual.source_pool_id === expected.source_pool_id,
    `${label} source_pool_id mismatch`,
  );
  assert(
    actual.target_pool_id === expected.target_pool_id,
    `${label} target_pool_id mismatch`,
  );
  assert(
    actual.allocation_type === expected.allocation_type,
    `${label} allocation_type mismatch`,
  );
  assert(
    actual.allocation_value === expected.allocation_value,
    `${label} allocation_value mismatch`,
  );
  assertIsoTimestamp(actual.created_at, `${label}.created_at`);
  assertIsoTimestamp(actual.updated_at, `${label}.updated_at`);
}

async function assertPoolAllocationDbRecord(sql, expected, label) {
  const rows = await sql`
    select
      id::text,
      source_pool_id::text,
      target_pool_id::text,
      allocation_type::text,
      allocation_value::text,
      created_at::text,
      updated_at::text
    from pool_allocations
    where id = ${expected.id}
    limit 1
  `;
  assert(rows.length === 1, `${label} missing`);
  assertPoolAllocationRecord(rows[0], expected, label);
}

async function assertPoolAllocationDeleted(sql, allocationId, label) {
  const rows = await sql`
    select count(*)::int as count
    from pool_allocations
    where id = ${allocationId}
  `;
  assert(rows[0]?.count === 0, `${label} still exists`);
}

function assertPoolMappingRecord(actual, expected, label) {
  assert(actual?.id === expected.id, `${label} id mismatch`);
  assert(
    actual.expense_pool_id === expected.expense_pool_id,
    `${label} expense_pool_id mismatch`,
  );
  assert(
    actual.gl_account_pattern === expected.gl_account_pattern,
    `${label} gl_account_pattern mismatch`,
  );
  assert(
    actual.allocation_percentage === expected.allocation_percentage,
    `${label} allocation_percentage mismatch`,
  );
  assert(actual.priority === expected.priority, `${label} priority mismatch`);
  const allowedKeys = [
    "id",
    "expense_pool_id",
    "gl_account_pattern",
    "allocation_percentage",
    "priority",
    "created_at",
    "updated_at",
  ];
  for (const key of Object.keys(actual)) {
    assert(allowedKeys.includes(key), `${label} unexpected field ${key}`);
  }
}

function assertAppliedTemplateResult(actual, expected) {
  assertAllowedKeys(
    actual,
    [
      "template_name",
      "property_id",
      "pools_created",
      "parent_pools",
      "child_pools",
    ],
    "applied template response",
  );
  assert(
    actual.template_name === expected.template_name,
    "applied template name mismatch",
  );
  assert(
    actual.property_id === expected.property_id,
    "applied template property mismatch",
  );
  assert(actual.pools_created === 2, "template apply count mismatch");
  assert(
    Array.isArray(actual.parent_pools) && actual.parent_pools.length === 1,
    "template apply parent count mismatch",
  );
  assert(
    Array.isArray(actual.child_pools) && actual.child_pools.length === 1,
    "template apply child count mismatch",
  );
  assertExpensePoolTemplateSource(
    actual.parent_pools[0],
    expected.parent,
    "applied parent pool",
  );
  assertExpensePoolTemplateSource(
    actual.child_pools[0],
    {
      ...expected.child,
      parent_pool_id: actual.parent_pools[0].id,
    },
    "applied child pool",
  );
}

function assertCopiedPoolsResult(actual, expected) {
  assertAllowedKeys(
    actual,
    [
      "pools_copied",
      "parent_pools_copied",
      "child_pools_copied",
      "pools_deleted",
      "copied_pools",
    ],
    "copied pools response",
  );
  assert(actual.pools_copied === expected.pools_copied, "copy count mismatch");
  assert(
    actual.parent_pools_copied === expected.parent_pools_copied,
    "copy parent count mismatch",
  );
  assert(
    actual.child_pools_copied === expected.child_pools_copied,
    "copy child count mismatch",
  );
  assert(
    actual.pools_deleted === expected.pools_deleted,
    "copy deleted count mismatch",
  );
  assert(
    Array.isArray(actual.copied_pools) &&
      actual.copied_pools.length === expected.expected.length,
    "copy copied_pools count mismatch",
  );
  for (const [index, expectedPool] of expected.expected.entries()) {
    assertCopiedPoolInfo(
      actual.copied_pools[index],
      expectedPool,
      `copied pool ${index}`,
    );
  }
}

function assertCopiedPoolInfo(actual, expected, label) {
  assertAllowedKeys(actual, ["id", "name", "is_parent"], label);
  assertUuid(actual.id, `${label}.id`);
  assert(actual.name === expected.name, `${label} name mismatch`);
  assert(
    actual.is_parent === expected.is_parent,
    `${label} is_parent mismatch`,
  );
}

function assertExpensePoolTemplateSource(actual, expected, label) {
  assertAllowedKeys(
    actual,
    [
      "id",
      "name",
      "pool_type",
      "is_gross_up_applicable",
      "gross_up_target",
      "description",
      "parent_pool_id",
    ],
    label,
  );
  assertUuid(actual.id, `${label}.id`);
  assert(actual.name === expected.name, `${label} name mismatch`);
  assert(
    actual.pool_type === expected.pool_type,
    `${label} pool_type mismatch`,
  );
  assert(
    actual.is_gross_up_applicable === expected.is_gross_up_applicable,
    `${label} is_gross_up_applicable mismatch`,
  );
  assert(
    actual.gross_up_target === expected.gross_up_target,
    `${label} gross_up_target mismatch`,
  );
  assert(
    actual.description === expected.description,
    `${label} description mismatch`,
  );
  assert(
    actual.parent_pool_id === expected.parent_pool_id,
    `${label} parent_pool_id mismatch`,
  );
}

async function assertExpensePoolDbRecord(sql, expected, label) {
  const rows = await sql`
    select
      id::text,
      property_id::text,
      name,
      pool_type::text,
      is_gross_up_applicable,
      gross_up_target::text,
      description,
      parent_pool_id::text,
      created_at::text,
      updated_at::text
    from expense_pools
    where id = ${expected.id}
    limit 1
  `;
  assert(rows.length === 1, `${label} missing`);
  assertExpensePoolRecord(rows[0], expected, label);
}

function assertExpensePoolRecord(actual, expected, label) {
  assertAllowedKeys(
    actual,
    [
      "id",
      "property_id",
      "name",
      "pool_type",
      "is_gross_up_applicable",
      "gross_up_target",
      "description",
      "parent_pool_id",
      "created_at",
      "updated_at",
    ],
    label,
  );
  assert(actual.id === expected.id, `${label} id mismatch`);
  assert(
    actual.property_id === expected.property_id,
    `${label} property_id mismatch`,
  );
  assert(actual.name === expected.name, `${label} name mismatch`);
  assert(
    actual.pool_type === expected.pool_type,
    `${label} pool_type mismatch`,
  );
  assert(
    actual.is_gross_up_applicable === expected.is_gross_up_applicable,
    `${label} is_gross_up_applicable mismatch`,
  );
  assert(
    actual.gross_up_target === expected.gross_up_target,
    `${label} gross_up_target mismatch`,
  );
  assert(
    actual.description === expected.description,
    `${label} description mismatch`,
  );
  assert(
    actual.parent_pool_id === expected.parent_pool_id,
    `${label} parent_pool_id mismatch`,
  );
  assertIsoTimestamp(actual.created_at, `${label}.created_at`);
  assertIsoTimestamp(actual.updated_at, `${label}.updated_at`);
}

function assertAllowedKeys(actual, expectedKeys, label) {
  assert(actual && typeof actual === "object", `${label} missing`);
  const actualKeys = Object.keys(actual).sort();
  const expected = [...expectedKeys].sort();
  assert(
    JSON.stringify(actualKeys) === JSON.stringify(expected),
    `${label} field shape mismatch: expected ${expected.join(",")}, got ${actualKeys.join(",")}`,
  );
}

function assertIsoTimestamp(value, label) {
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      Number.isFinite(Date.parse(value)),
    `${label} should be an ISO timestamp`,
  );
}

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    `${label} should be a UUID`,
  );
}

function assert(condition, message) {
  if (!condition) fail(message);
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
