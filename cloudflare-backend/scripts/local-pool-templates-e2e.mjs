import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8830";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_LOCAL_ANON_KEY =
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
    fail(`local pool templates E2E always owns ${DEFAULT_BASE_URL}`);
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
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ])) ??
    SUPABASE_LOCAL_ANON_KEY;

  if (process.env.CI) fail("Refusing to run local pool templates E2E in CI.");
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
      `Local pool templates Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let seeded;
  let runError;
  let cleanupError;
  let result;

  try {
    seeded = await seedScenario({ ...input, sql });
    const ownerHeaders = jsonAuthHeaders(seeded.owner.accessToken);
    const viewerHeaders = jsonAuthHeaders(seeded.viewer.accessToken);

    const templates = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates`,
      {
        headers: ownerHeaders,
      },
    );
    const systemTemplate = templates.find(
      (template) =>
        template.is_system === true && template.id === seeded.systemTemplateId,
    );
    assert(systemTemplate, "system template missing from list");
    assertTemplateListRecord(systemTemplate, {
      id: seeded.systemTemplateId,
      name: seeded.systemTemplateName,
      description: "Local system template",
      propertyType: "office",
      structure: seeded.systemTemplateStructure,
      isSystem: true,
    });
    assert(
      !templates.some((template) => template.id === seeded.hiddenTemplateId),
      "owner list leaked hidden org template",
    );

    const officeTemplates = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates?property_type=office`,
      { headers: ownerHeaders },
    );
    assert(
      officeTemplates.every((template) => template.property_type === "office"),
      "property_type filter returned a non-office template",
    );
    assert(
      officeTemplates.some(
        (template) => template.id === seeded.systemTemplateId,
      ),
      "property_type filter omitted seeded office system template",
    );
    for (const template of officeTemplates) {
      assertTemplateListRecord(template, {
        propertyType: "office",
      });
    }

    const custom = await expectJson(`${input.baseUrl}/api/v1/pool-templates`, {
      method: "POST",
      headers: ownerHeaders,
      status: 201,
      body: JSON.stringify({
        name: `  ${seeded.customTemplateName}  `,
        description: "Local template before update",
        property_type: "office",
        structure: templateStructure(seeded.templatePoolNames),
      }),
    });
    seeded.generated.templateIds.push(custom.id);
    seeded.generated.templateNames.push(custom.name);
    assertTemplateRecord(custom, {
      id: custom.id,
      name: seeded.customTemplateName,
      description: "Local template before update",
      propertyType: "office",
      structure: templateStructure(seeded.templatePoolNames),
      isSystem: false,
      organizationId: seeded.owner.organizationId,
      version: 1,
    });
    const templatesAfterCreate = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates`,
      { headers: ownerHeaders },
    );
    assert(
      templatesAfterCreate.some((template) => template.id === custom.id),
      "owner list missing created org template",
    );
    const createdListTemplate = templatesAfterCreate.find(
      (template) => template.id === custom.id,
    );
    assertTemplateListRecord(createdListTemplate, {
      id: custom.id,
      name: seeded.customTemplateName,
      description: "Local template before update",
      propertyType: "office",
      structure: templateStructure(seeded.templatePoolNames),
      isSystem: false,
    });
    await assertTemplateStored(sql, custom.id, {
      name: seeded.customTemplateName,
      description: "Local template before update",
      organizationId: seeded.owner.organizationId,
      propertyType: "office",
      structure: templateStructure(seeded.templatePoolNames),
      version: 1,
      isSystem: false,
    });

    await expectError(`${input.baseUrl}/api/v1/pool-templates`, {
      method: "POST",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
      message: "Insufficient permissions",
      body: JSON.stringify({
        name: seeded.viewerAttemptTemplateName,
        structure: templateStructure({
          parent: `${seeded.templatePoolNames.parent} Viewer`,
          child: `${seeded.templatePoolNames.child} Viewer`,
        }),
      }),
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates`, {
      method: "POST",
      headers: ownerHeaders,
      status: 422,
      code: "validation_error",
      message:
        "structure.pools.0.children.0.name: Pool template names must be unique within a template; structure.pools.0.children.1.children: Pool hierarchy cannot exceed 2 levels (parent -> child only)",
      body: JSON.stringify({
        name: seeded.invalidTemplateName,
        structure: {
          pools: [
            {
              name: "Duplicate",
              children: [
                { name: "duplicate" },
                { name: "Grandchild", children: [{ name: "Too Deep" }] },
              ],
            },
          ],
        },
      }),
    });

    const customDetail = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/${custom.id}`,
      { headers: ownerHeaders },
    );
    assertTemplateRecord(customDetail, {
      id: custom.id,
      name: seeded.customTemplateName,
      description: "Local template before update",
      propertyType: "office",
      structure: templateStructure(seeded.templatePoolNames),
      isSystem: false,
      organizationId: seeded.owner.organizationId,
      version: 1,
    });

    const updatedTemplate = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/${custom.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        body: JSON.stringify({
          description: "Local template after update",
          property_type: "retail",
          structure: templateStructure(seeded.updatedTemplatePoolNames),
        }),
      },
    );
    assertTemplateRecord(updatedTemplate, {
      id: custom.id,
      name: seeded.customTemplateName,
      description: "Local template after update",
      propertyType: "retail",
      structure: templateStructure(seeded.updatedTemplatePoolNames),
      isSystem: false,
      organizationId: seeded.owner.organizationId,
      version: 2,
    });
    await assertTemplateStored(sql, custom.id, {
      name: seeded.customTemplateName,
      description: "Local template after update",
      organizationId: seeded.owner.organizationId,
      propertyType: "retail",
      structure: templateStructure(seeded.updatedTemplatePoolNames),
      version: 2,
      isSystem: false,
    });

    await expectError(
      `${input.baseUrl}/api/v1/pool-templates/${systemTemplate.id}`,
      {
        method: "PUT",
        headers: ownerHeaders,
        status: 403,
        code: "system_template_immutable",
        message: "Cannot update system templates",
        body: JSON.stringify({ description: "Mutation attempt" }),
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/pool-templates/${systemTemplate.id}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
        status: 403,
        code: "system_template_immutable",
        message: "Cannot delete system templates",
      },
    );
    await expectError(
      `${input.baseUrl}/api/v1/pool-templates/${seeded.hiddenTemplateId}`,
      {
        headers: ownerHeaders,
        status: 404,
        code: "pool_template_not_found",
        message: "Template not found",
      },
    );

    await expectError(`${input.baseUrl}/api/v1/pool-templates/apply`, {
      method: "POST",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
      message: "Insufficient permissions",
      body: JSON.stringify({
        template_id: custom.id,
        property_id: seeded.targetPropertyId,
        delete_existing: false,
      }),
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates/apply`, {
      method: "POST",
      headers: ownerHeaders,
      status: 404,
      code: "pool_template_not_found",
      message: "Template not found",
      body: JSON.stringify({
        template_id: seeded.hiddenTemplateId,
        property_id: seeded.targetPropertyId,
        delete_existing: false,
      }),
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates/apply`, {
      method: "POST",
      headers: ownerHeaders,
      status: 404,
      code: "property_not_found",
      message: "Property not found",
      body: JSON.stringify({
        template_id: custom.id,
        property_id: seeded.hiddenPropertyId,
        delete_existing: false,
      }),
    });

    const applied = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/apply`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          template_id: custom.id,
          property_id: seeded.targetPropertyId,
          delete_existing: true,
        }),
      },
    );
    seeded.generated.poolIds.push(
      ...applied.parent_pools.map((pool) => pool.id),
      ...applied.child_pools.map((pool) => pool.id),
    );
    assertApplyResponse(applied, {
      templateName: seeded.customTemplateName,
      propertyId: seeded.targetPropertyId,
      parentPools: [
        appliedPoolContract(seeded.updatedTemplatePoolNames.parent, {
          poolType: "capital",
          isGrossUpApplicable: true,
        }),
      ],
      childPools: [
        appliedPoolContract(seeded.updatedTemplatePoolNames.child, {
          poolType: "insurance",
          isGrossUpApplicable: false,
          parentName: seeded.updatedTemplatePoolNames.parent,
        }),
      ],
    });
    await assertTargetPools(sql, seeded.targetPropertyId, {
      expected: [
        appliedPoolContract(seeded.updatedTemplatePoolNames.parent, {
          poolType: "capital",
          isGrossUpApplicable: true,
        }),
        appliedPoolContract(seeded.updatedTemplatePoolNames.child, {
          poolType: "insurance",
          isGrossUpApplicable: false,
          parentName: seeded.updatedTemplatePoolNames.parent,
        }),
      ],
      exclude: [seeded.initialTargetPoolName],
      responsePools: [...applied.parent_pools, ...applied.child_pools],
    });

    await expectError(`${input.baseUrl}/api/v1/pool-templates/copy`, {
      method: "POST",
      headers: viewerHeaders,
      status: 403,
      code: "insufficient_permissions",
      message: "Insufficient permissions",
      body: JSON.stringify({
        source_property_id: seeded.sourcePropertyId,
        target_property_id: seeded.targetPropertyId,
        copy_mode: "replace",
      }),
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates/copy`, {
      method: "POST",
      headers: ownerHeaders,
      status: 422,
      code: "validation_error",
      message:
        "target_property_id: Cannot copy pools to the same property. Source and target must be different.",
      body: JSON.stringify({
        source_property_id: seeded.sourcePropertyId,
        target_property_id: seeded.sourcePropertyId,
        copy_mode: "merge",
      }),
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates/copy`, {
      method: "POST",
      headers: ownerHeaders,
      status: 404,
      code: "target_property_not_found",
      message: `Target property ${seeded.hiddenPropertyId} not found or access denied`,
      body: JSON.stringify({
        source_property_id: seeded.sourcePropertyId,
        target_property_id: seeded.hiddenPropertyId,
        copy_mode: "replace",
      }),
    });

    const merged = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/copy`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          source_property_id: seeded.sourcePropertyId,
          target_property_id: seeded.mergeTargetPropertyId,
          copy_mode: "merge",
        }),
      },
    );
    seeded.generated.poolIds.push(
      ...merged.copied_pools.map((pool) => pool.id),
    );
    assertCopyResponse(merged, {
      poolsCopied: 3,
      parentPoolsCopied: 2,
      childPoolsCopied: 1,
      poolsDeleted: 0,
      copiedPools: [
        { name: seeded.sourcePoolNames.parent, isParent: true },
        { name: seeded.sourcePoolNames.child, isParent: false },
        { name: seeded.sourcePoolNames.tax, isParent: true },
      ],
    });
    await assertTargetPools(sql, seeded.mergeTargetPropertyId, {
      expected: [
        existingPoolContract(seeded.initialMergeTargetPoolName, {
          description: "pool preserved by merge copy",
        }),
        copiedPoolContract(seeded.sourcePoolNames.parent, {
          description: "parent pool for copy",
          isParent: true,
        }),
        copiedPoolContract(seeded.sourcePoolNames.child, {
          description: "child pool for copy",
          parentName: seeded.sourcePoolNames.parent,
          isParent: false,
        }),
        copiedPoolContract(seeded.sourcePoolNames.tax, {
          poolType: "tax",
          isGrossUpApplicable: false,
          description: "tax pool for copy",
          isParent: true,
        }),
      ],
      exclude: [],
      responsePools: merged.copied_pools,
    });

    const copied = await expectJson(
      `${input.baseUrl}/api/v1/pool-templates/copy`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          source_property_id: seeded.sourcePropertyId,
          target_property_id: seeded.targetPropertyId,
          copy_mode: "replace",
        }),
      },
    );
    seeded.generated.poolIds.push(
      ...copied.copied_pools.map((pool) => pool.id),
    );
    assertCopyResponse(copied, {
      poolsCopied: 3,
      parentPoolsCopied: 2,
      childPoolsCopied: 1,
      poolsDeleted: 2,
      copiedPools: [
        { name: seeded.sourcePoolNames.parent, isParent: true },
        { name: seeded.sourcePoolNames.child, isParent: false },
        { name: seeded.sourcePoolNames.tax, isParent: true },
      ],
    });
    await assertTargetPools(sql, seeded.targetPropertyId, {
      expected: [
        copiedPoolContract(seeded.sourcePoolNames.parent, {
          description: "parent pool for copy",
          isParent: true,
        }),
        copiedPoolContract(seeded.sourcePoolNames.child, {
          description: "child pool for copy",
          parentName: seeded.sourcePoolNames.parent,
          isParent: false,
        }),
        copiedPoolContract(seeded.sourcePoolNames.tax, {
          poolType: "tax",
          isGrossUpApplicable: false,
          description: "tax pool for copy",
          isParent: true,
        }),
      ],
      exclude: [seeded.updatedTemplatePoolNames.parent],
      responsePools: copied.copied_pools,
    });

    await expectError(`${input.baseUrl}/api/v1/pool-templates/copy`, {
      method: "POST",
      headers: ownerHeaders,
      status: 409,
      code: "pool_name_conflict",
      message: "A pool with this name already exists on the target property",
      body: JSON.stringify({
        source_property_id: seeded.sourcePropertyId,
        target_property_id: seeded.targetPropertyId,
        copy_mode: "merge",
      }),
    });

    await expectEmpty(`${input.baseUrl}/api/v1/pool-templates/${custom.id}`, {
      method: "DELETE",
      headers: ownerHeaders,
    });
    await expectError(`${input.baseUrl}/api/v1/pool-templates/${custom.id}`, {
      headers: ownerHeaders,
      status: 404,
      code: "pool_template_not_found",
      message: "Template not found",
    });
    seeded.generated.templateIds = seeded.generated.templateIds.filter(
      (id) => id !== custom.id,
    );

    result = {
      index: input.index,
      organization_id: seeded.owner.organizationId,
      source_property_id: seeded.sourcePropertyId,
      target_property_id: seeded.targetPropertyId,
      custom_template_deleted: custom.id,
      system_template_checked: systemTemplate.id,
      copied_pools: copied.pools_copied,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      if (seeded) {
        await cleanupGeneratedRows(sql, seeded.generated);
        await assertCleanupComplete(sql, seeded.generated);
      }
    } catch (error) {
      cleanupError ??= error;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  if (runError && cleanupError) {
    console.error(
      `Local pool templates row cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function seedScenario(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ids = {
    sourcePropertyId: randomUUID(),
    targetPropertyId: randomUUID(),
    mergeTargetPropertyId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    sourceParentPoolId: randomUUID(),
    sourceChildPoolId: randomUUID(),
    sourceTaxPoolId: randomUUID(),
    initialTargetPoolId: randomUUID(),
    initialMergeTargetPoolId: randomUUID(),
    systemTemplateId: randomUUID(),
    hiddenTemplateId: randomUUID(),
  };
  let owner;
  let viewer;
  let hidden;
  let generated;
  const sourcePoolNames = {
    parent: `Template Copy Parent ${suffix}`,
    child: `Template Copy Child ${suffix}`,
    tax: `Template Copy Tax ${suffix}`,
  };
  const initialTargetPoolName = `Template Apply Old Pool ${suffix}`;
  const initialMergeTargetPoolName = `Template Merge Existing Pool ${suffix}`;
  const systemTemplateName = `Local System Pool Template ${suffix}`;
  const systemTemplateStructure = templateStructure({
    parent: `System Parent ${suffix}`,
    child: `System Child ${suffix}`,
  });
  const hiddenTemplateName = `Hidden Pool Template ${suffix}`;
  const hiddenTemplateStructure = templateStructure({
    parent: `Hidden Parent ${suffix}`,
    child: `Hidden Child ${suffix}`,
  });

  try {
    owner = await createLocalAuthUser(input, {
      email: `pool-template-owner-${suffix}@capveri.local`,
      password: `OwnerPass${input.index}Aa1!`,
      fullName: `Local Pool Template Owner ${suffix}`,
      organizationName: `Local Pool Template Org ${suffix}`,
      role: "owner",
    });
    viewer = await createLocalAuthUser(input, {
      email: `pool-template-viewer-${suffix}@capveri.local`,
      password: `ViewerPass${input.index}Aa1!`,
      fullName: `Local Pool Template Viewer ${suffix}`,
      organizationName: `Local Pool Template Viewer Org ${suffix}`,
      role: "viewer",
    });
    hidden = await createLocalAuthUser(input, {
      email: `pool-template-hidden-${suffix}@capveri.local`,
      password: `HiddenPass${input.index}Aa1!`,
      fullName: `Local Pool Template Hidden ${suffix}`,
      organizationName: `Local Pool Template Hidden Org ${suffix}`,
      role: "owner",
    });
    generated = generatedRows({ owner, viewer, hidden }, ids);
    await input.sql.begin(async (transaction) => {
      await transaction`
        update users
        set organization_id = ${owner.organizationId}, role = 'viewer', updated_at = now()
        where id = ${viewer.userId}
      `;
      viewer.organizationId = owner.organizationId;
      await insertProperty(transaction, {
        id: ids.sourcePropertyId,
        orgId: owner.organizationId,
        name: `Pool Template Source ${suffix}`,
        address: "100 Pool Template Way",
      });
      await insertProperty(transaction, {
        id: ids.targetPropertyId,
        orgId: owner.organizationId,
        name: `Pool Template Target ${suffix}`,
        address: "200 Pool Template Way",
      });
      await insertProperty(transaction, {
        id: ids.mergeTargetPropertyId,
        orgId: owner.organizationId,
        name: `Pool Template Merge Target ${suffix}`,
        address: "250 Pool Template Way",
      });
      await insertProperty(transaction, {
        id: ids.hiddenPropertyId,
        orgId: hidden.organizationId,
        name: `Pool Template Hidden ${suffix}`,
        address: "300 Pool Template Way",
      });
      await transaction`
        insert into expense_pools (
          id, property_id, name, pool_type, is_gross_up_applicable,
          gross_up_target, description, parent_pool_id
        )
        values
          (${ids.sourceParentPoolId}, ${ids.sourcePropertyId}, ${sourcePoolNames.parent}, 'operating', true, null, 'parent pool for copy', null),
          (${ids.sourceChildPoolId}, ${ids.sourcePropertyId}, ${sourcePoolNames.child}, 'operating', true, null, 'child pool for copy', ${ids.sourceParentPoolId}),
          (${ids.sourceTaxPoolId}, ${ids.sourcePropertyId}, ${sourcePoolNames.tax}, 'tax', false, null, 'tax pool for copy', null),
          (${ids.initialTargetPoolId}, ${ids.targetPropertyId}, ${initialTargetPoolName}, 'operating', true, null, 'pool deleted by template apply', null),
          (${ids.initialMergeTargetPoolId}, ${ids.mergeTargetPropertyId}, ${initialMergeTargetPoolName}, 'operating', true, null, 'pool preserved by merge copy', null)
      `;
      await transaction`
        insert into pool_templates (
          id, name, description, property_type, structure, is_system,
          organization_id, version
        )
        values
          (
            ${ids.systemTemplateId}, ${systemTemplateName}, 'Local system template',
            'office', ${transaction.json(systemTemplateStructure)}, true, null, 1
          ),
          (
            ${ids.hiddenTemplateId}, ${hiddenTemplateName}, 'Hidden org template',
            'office', ${transaction.json(hiddenTemplateStructure)}, false, ${hidden.organizationId}, 1
          )
      `;
    });
  } catch (error) {
    await cleanupGeneratedRows(
      input.sql,
      generated ??
        partialGeneratedRows({
          accounts: [owner, viewer, hidden],
          ids,
        }),
    );
    throw error;
  }

  return {
    owner,
    viewer,
    hidden,
    ...ids,
    sourcePoolNames,
    initialTargetPoolName,
    initialMergeTargetPoolName,
    systemTemplateName,
    systemTemplateStructure,
    customTemplateName: `Local Pool Template ${suffix}`,
    invalidTemplateName: `Invalid Pool Template ${suffix}`,
    viewerAttemptTemplateName: `Viewer Pool Template ${suffix}`,
    templatePoolNames: {
      parent: `Template Parent ${suffix}`,
      child: `Template Child ${suffix}`,
    },
    updatedTemplatePoolNames: {
      parent: `Updated Capital Parent ${suffix}`,
      child: `Updated Insurance Child ${suffix}`,
    },
    generated,
  };
}

function generatedRows(accounts, ids) {
  return {
    orgIds: [
      accounts.owner.signupOrganizationId,
      accounts.viewer.signupOrganizationId,
      accounts.hidden.signupOrganizationId,
      accounts.owner.organizationId,
      accounts.hidden.organizationId,
    ],
    userIds: [
      accounts.owner.userId,
      accounts.viewer.userId,
      accounts.hidden.userId,
    ],
    emails: [
      accounts.owner.email,
      accounts.viewer.email,
      accounts.hidden.email,
    ],
    orgNames: [
      accounts.owner.organizationName,
      accounts.viewer.organizationName,
      accounts.hidden.organizationName,
    ],
    propertyIds: [
      ids.sourcePropertyId,
      ids.targetPropertyId,
      ids.mergeTargetPropertyId,
      ids.hiddenPropertyId,
    ],
    poolIds: [
      ids.sourceParentPoolId,
      ids.sourceChildPoolId,
      ids.sourceTaxPoolId,
      ids.initialTargetPoolId,
      ids.initialMergeTargetPoolId,
    ],
    templateIds: [ids.systemTemplateId, ids.hiddenTemplateId],
    templateNames: [],
  };
}

function partialGeneratedRows(input) {
  const accounts = input.accounts.filter(Boolean);
  return {
    orgIds: [
      ...accounts.map((account) => account.signupOrganizationId),
      ...accounts.map((account) => account.organizationId),
    ],
    userIds: accounts.map((account) => account.userId),
    emails: accounts.map((account) => account.email),
    orgNames: accounts.map((account) => account.organizationName),
    propertyIds: Object.values(input.ids).filter(
      (id) => typeof id === "string",
    ),
    poolIds: Object.values(input.ids).filter((id) => typeof id === "string"),
    templateIds: Object.values(input.ids).filter(
      (id) => typeof id === "string",
    ),
    templateNames: [],
  };
}

async function createLocalAuthUser(input, user) {
  const partial = {
    ...user,
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
          email: user.email,
          password: user.password,
          data: {
            full_name: user.fullName,
            organization_name: user.organizationName,
          },
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      fail(`Supabase signup failed: ${JSON.stringify(redactSensitive(body))}`);
    const userId = body.user?.id;
    assert(
      typeof userId === "string" && userId !== "",
      "signup user id missing",
    );
    partial.userId = userId;
    await input.sql`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = ${userId}`;
    await input.sql`update users set role = ${user.role}, full_name = ${user.fullName}, updated_at = now() where id = ${userId}`;
    const rows =
      await input.sql`select organization_id from users where id = ${userId} limit 1`;
    const organizationId = rows[0]?.organization_id;
    assert(
      typeof organizationId === "string" && organizationId !== "",
      "signup organization id missing",
    );
    partial.signupOrganizationId = organizationId;
    partial.organizationId = organizationId;
    const accessToken =
      body.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: user.email,
        password: user.password,
      }));
    assert(
      typeof accessToken === "string" && accessToken !== "",
      "access token missing",
    );
    partial.accessToken = accessToken;
    return partial;
  } catch (error) {
    await cleanupGeneratedRows(input.sql, {
      orgIds: [partial.signupOrganizationId],
      userIds: [partial.userId],
      emails: [partial.email],
      orgNames: [partial.organizationName],
      propertyIds: [],
      poolIds: [],
      templateIds: [],
      templateNames: [],
    });
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

function assertTemplateListRecord(record, expected) {
  assert(record, "template list record missing");
  assertAllowedKeys(record, [
    "created_at",
    "description",
    "id",
    "is_system",
    "name",
    "pool_count",
    "property_type",
  ]);
  assertUuid(record.id, "template list id");
  assertIsoTimestamp(record.created_at, "template list created_at");
  if (expected.id) {
    assert(record.id === expected.id, "template list id mismatch");
  }
  if (expected.name) {
    assert(record.name === expected.name, "template list name mismatch");
  }
  if (Object.hasOwn(expected, "description")) {
    assert(
      record.description === expected.description,
      "template list description mismatch",
    );
  }
  if (expected.propertyType) {
    assert(
      record.property_type === expected.propertyType,
      "template list property_type mismatch",
    );
  }
  if (Object.hasOwn(expected, "isSystem")) {
    assert(
      record.is_system === expected.isSystem,
      "template list system flag mismatch",
    );
  }
  if (expected.structure) {
    assert(
      record.pool_count === poolCountFromStructure(expected.structure),
      "template list pool_count mismatch",
    );
  }
}

function assertTemplateRecord(record, expected) {
  assert(record, "template record missing");
  assertAllowedKeys(record, [
    "created_at",
    "description",
    "id",
    "is_system",
    "name",
    "organization_id",
    "property_type",
    "structure",
    "updated_at",
    "version",
  ]);
  assertUuid(record.id, "template id");
  assertIsoTimestamp(record.created_at, "template created_at");
  assertIsoTimestamp(record.updated_at, "template updated_at");
  assert(record.id === expected.id, "template id mismatch");
  assert(record.name === expected.name, "template name mismatch");
  assert(
    record.description === expected.description,
    "template description mismatch",
  );
  assert(
    record.property_type === expected.propertyType,
    "template property_type mismatch",
  );
  assertDeepEqual(record.structure, expected.structure, "template structure");
  assert(
    record.is_system === expected.isSystem,
    "template system flag mismatch",
  );
  assert(
    record.organization_id === expected.organizationId,
    "template organization mismatch",
  );
  assert(record.version === expected.version, "template version mismatch");
}

function assertApplyResponse(actual, expected) {
  assertAllowedKeys(actual, [
    "child_pools",
    "parent_pools",
    "pools_created",
    "property_id",
    "template_name",
  ]);
  assert(
    actual.template_name === expected.templateName,
    "apply template_name mismatch",
  );
  assert(
    actual.property_id === expected.propertyId,
    "apply property_id mismatch",
  );
  assert(
    actual.pools_created ===
      expected.parentPools.length + expected.childPools.length,
    "apply pools_created mismatch",
  );
  assert(
    actual.parent_pools.length === expected.parentPools.length,
    "apply parent_pools length mismatch",
  );
  assert(
    actual.child_pools.length === expected.childPools.length,
    "apply child_pools length mismatch",
  );
  for (const expectedPool of expected.parentPools) {
    const actualPool = actual.parent_pools.find(
      (pool) => pool.name === expectedPool.name,
    );
    assertPoolSourceRecord(actualPool, { ...expectedPool, parentPoolId: null });
  }
  for (const expectedPool of expected.childPools) {
    const parentPool = actual.parent_pools.find(
      (pool) => pool.name === expectedPool.parentName,
    );
    assert(parentPool, `apply parent pool missing ${expectedPool.parentName}`);
    const actualPool = actual.child_pools.find(
      (pool) => pool.name === expectedPool.name,
    );
    assertPoolSourceRecord(actualPool, {
      ...expectedPool,
      parentPoolId: parentPool.id,
    });
  }
}

function assertPoolSourceRecord(record, expected) {
  assert(record, `pool response missing ${expected.name}`);
  assertAllowedKeys(record, [
    "description",
    "gross_up_target",
    "id",
    "is_gross_up_applicable",
    "name",
    "parent_pool_id",
    "pool_type",
  ]);
  assertUuid(record.id, `${expected.name} response id`);
  assert(
    record.name === expected.name,
    `${expected.name} response name mismatch`,
  );
  assert(
    record.pool_type === expected.poolType,
    `${expected.name} response pool_type mismatch`,
  );
  assert(
    record.is_gross_up_applicable === expected.isGrossUpApplicable,
    `${expected.name} response gross-up flag mismatch`,
  );
  assert(
    (record.gross_up_target ?? null) === expected.grossUpTarget,
    `${expected.name} response gross-up target mismatch`,
  );
  assert(
    (record.description ?? null) === expected.description,
    `${expected.name} response description mismatch`,
  );
  assert(
    (record.parent_pool_id ?? null) === expected.parentPoolId,
    `${expected.name} response parent_pool_id mismatch`,
  );
}

function assertCopyResponse(actual, expected) {
  assertAllowedKeys(actual, [
    "child_pools_copied",
    "copied_pools",
    "parent_pools_copied",
    "pools_copied",
    "pools_deleted",
  ]);
  assert(actual.pools_copied === expected.poolsCopied, "copy count mismatch");
  assert(
    actual.parent_pools_copied === expected.parentPoolsCopied,
    "copy parent count mismatch",
  );
  assert(
    actual.child_pools_copied === expected.childPoolsCopied,
    "copy child count mismatch",
  );
  assert(
    actual.pools_deleted === expected.poolsDeleted,
    "copy deleted count mismatch",
  );
  const actualNames = actual.copied_pools.map((pool) => pool.name).sort();
  assertDeepEqual(
    actualNames,
    expected.copiedPools.map((pool) => pool.name).sort(),
    "copied pool name set",
  );
  for (const expectedPool of expected.copiedPools) {
    assertCopiedPoolSummary(
      actual.copied_pools.find((pool) => pool.name === expectedPool.name),
      expectedPool,
    );
  }
}

function assertCopiedPoolSummary(record, expected) {
  assert(record, `copied pool summary missing ${expected.name}`);
  assertAllowedKeys(record, ["id", "is_parent", "name"]);
  assertUuid(record.id, `${expected.name} copied pool id`);
  assert(
    record.name === expected.name,
    `${expected.name} copied name mismatch`,
  );
  assert(
    record.is_parent === expected.isParent,
    `${expected.name} copied is_parent mismatch`,
  );
}

async function assertTargetPools(sql, propertyId, input) {
  const rows = await sql`
    select
      id,
      name,
      pool_type,
      is_gross_up_applicable,
      gross_up_target::text,
      description,
      parent_pool_id
    from expense_pools
    where property_id = ${propertyId}
    order by name asc
  `;
  const names = rows.map((pool) => pool.name);
  const expectedNames = input.expected.map((pool) => pool.name).sort();
  assertDeepEqual(
    [...names].sort(),
    expectedNames,
    "target pool exact name set",
  );
  for (const unexpected of input.exclude) {
    assert(
      !names.includes(unexpected),
      `target pool should not include ${unexpected}`,
    );
  }

  const byName = new Map(rows.map((pool) => [pool.name, pool]));
  for (const expected of input.expected) {
    const row = byName.get(expected.name);
    assert(row, `target pool missing ${expected.name}`);
    assert(
      row.pool_type === expected.poolType,
      `${expected.name} type mismatch`,
    );
    assert(
      row.is_gross_up_applicable === expected.isGrossUpApplicable,
      `${expected.name} gross-up flag mismatch`,
    );
    assert(
      (row.gross_up_target ?? null) === expected.grossUpTarget,
      `${expected.name} gross-up target mismatch`,
    );
    assert(
      (row.description ?? null) === expected.description,
      `${expected.name} description mismatch`,
    );
    const expectedParentId = expected.parentName
      ? byName.get(expected.parentName)?.id
      : null;
    assert(
      (row.parent_pool_id ?? null) === (expectedParentId ?? null),
      `${expected.name} parent mismatch`,
    );
  }

  if (input.responsePools) {
    for (const responsePool of input.responsePools) {
      const row = byName.get(responsePool.name);
      assert(row, `response pool missing in DB ${responsePool.name}`);
      assert(
        row.id === responsePool.id,
        `${responsePool.name} response id mismatch`,
      );
      if (typeof responsePool.is_parent === "boolean") {
        assert(
          responsePool.is_parent === (row.parent_pool_id === null),
          `${responsePool.name} response is_parent mismatch`,
        );
      }
    }
  }
}

function appliedPoolContract(name, overrides = {}) {
  return poolContract({
    name,
    poolType: "operating",
    isGrossUpApplicable: true,
    grossUpTarget: null,
    description: null,
    ...overrides,
  });
}

function copiedPoolContract(name, overrides = {}) {
  return poolContract({
    name,
    poolType: "operating",
    isGrossUpApplicable: true,
    grossUpTarget: null,
    description: null,
    ...overrides,
  });
}

function existingPoolContract(name, overrides = {}) {
  return poolContract({
    name,
    poolType: "operating",
    isGrossUpApplicable: true,
    grossUpTarget: null,
    description: null,
    ...overrides,
  });
}

function poolContract(input) {
  return {
    name: input.name,
    poolType: input.poolType,
    isGrossUpApplicable: input.isGrossUpApplicable,
    grossUpTarget: input.grossUpTarget,
    description: input.description,
    parentName: input.parentName ?? null,
    isParent: input.isParent,
  };
}

async function assertTemplateStored(sql, templateId, expected) {
  const rows = await sql`
    select
      name,
      description,
      organization_id,
      property_type,
      structure,
      version,
      is_system,
      created_at,
      updated_at
    from pool_templates
    where id = ${templateId}
    limit 1
  `;
  const row = rows[0];
  assert(row, `template row missing ${templateId}`);
  assert(row.name === expected.name, "stored template name mismatch");
  assert(
    row.description === expected.description,
    "stored template description mismatch",
  );
  assert(
    row.organization_id === expected.organizationId,
    "stored template organization mismatch",
  );
  assert(
    row.property_type === expected.propertyType,
    "stored template property_type mismatch",
  );
  assertDeepEqual(
    row.structure,
    expected.structure,
    "stored template structure",
  );
  assert(
    poolCountFromStructure(row.structure) ===
      poolCountFromStructure(expected.structure),
    "stored template pool count mismatch",
  );
  assert(row.version === expected.version, "stored template version mismatch");
  assert(
    row.is_system === expected.isSystem,
    "stored template system mismatch",
  );
  assertIsoTimestamp(row.created_at, "stored template created_at");
  assertIsoTimestamp(row.updated_at, "stored template updated_at");
}

function templateStructure(names) {
  return {
    pools: [
      {
        name: names.parent,
        gross_up_enabled: true,
        children: [
          { name: names.child, gross_up_enabled: false, children: [] },
        ],
      },
    ],
  };
}

function poolCountFromStructure(structure) {
  return Array.isArray(structure.pools) ? structure.pools.length : 0;
}

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_pool_templates_e2e_none__");
  const orgNames = nonEmpty(
    input.orgNames,
    "__local_pool_templates_e2e_none__",
  );
  const propertyIds = nonEmpty(input.propertyIds);
  const poolIds = nonEmpty(input.poolIds);
  const templateIds = nonEmpty(input.templateIds);
  const templateNames = nonEmpty(
    input.templateNames,
    "__local_pool_templates_e2e_none__",
  );
  await sql.begin(async (transaction) => {
    await transaction`delete from pool_mappings where expense_pool_id in ${transaction(poolIds)}`;
    await transaction`delete from pool_allocations where source_pool_id in ${transaction(poolIds)} or target_pool_id in ${transaction(poolIds)}`;
    await transaction`delete from expense_pools where id in ${transaction(poolIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from pool_templates where id in ${transaction(templateIds)} or organization_id in ${transaction(orgIds)} or name in ${transaction(templateNames)}`;
    await transaction`delete from properties where id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from signup_email_events where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`delete from legal_acceptances where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)}`;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`delete from audit_log where organization_id in ${transaction(orgIds)} or changed_by in ${transaction(userIds)} or row_id in ${transaction([...orgIds, ...userIds, ...propertyIds, ...poolIds, ...templateIds])}`;
    await transaction`delete from users where id in ${transaction(userIds)} or email in ${transaction(emails)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from auth.users where id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`delete from organizations where id in ${transaction(orgIds)} or name in ${transaction(orgNames)}`;
  });
}

async function assertCleanupComplete(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_pool_templates_e2e_none__");
  const orgNames = nonEmpty(
    input.orgNames,
    "__local_pool_templates_e2e_none__",
  );
  const propertyIds = nonEmpty(input.propertyIds);
  const poolIds = nonEmpty(input.poolIds);
  const templateIds = nonEmpty(input.templateIds);
  const templateNames = nonEmpty(
    input.templateNames,
    "__local_pool_templates_e2e_none__",
  );
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_users,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as orgs,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as properties,
      (select count(*)::int from expense_pools where id in ${sql(poolIds)} or property_id in ${sql(propertyIds)}) as pools,
      (select count(*)::int from pool_templates where id in ${sql(templateIds)} or organization_id in ${sql(orgIds)} or name in ${sql(templateNames)}) as templates,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptances,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_events,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)}) as audit_log
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
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
    `expected error code ${options.code}, got ${JSON.stringify(body)}`,
  );
  if (options.message) {
    assertDeepEqual(
      body,
      {
        detail: options.message,
        error: { code: options.code, message: options.message },
      },
      "error response body",
    );
  }
  return body;
}

async function expectEmpty(url, options = {}) {
  const { status = 204, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`);
    },
  );
  if (response.status !== status) {
    const text = await response.text().catch(() => "");
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
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
    if (code !== null && code !== 0)
      output += `\nwrangler dev exited with ${code}`;
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
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-pool-templates-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-pool-templates-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=",
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
  let response;
  try {
    response = await fetch(`${baseUrl}/health`);
  } catch {
    return;
  }
  if (response.ok) fail(`${baseUrl} is already serving /health`);
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

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = "true";
    else {
      parsed[key] = next;
      index += 1;
    }
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

function normalizedLocalUrl(rawUrl, label) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:") fail(`${label} must use http`);
  if (!isLoopbackHost(url.hostname)) fail(`${label} must point at loopback`);
  if (!url.port) fail(`${label} must include a port`);
  if (
    label === "supabase-url" &&
    (url.port !== "54321" || (url.pathname !== "" && url.pathname !== "/"))
  ) {
    fail(
      "supabase-url must be the local Supabase API at http://127.0.0.1:54321",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function normalizedLocalDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must be Postgres");
  }
  if (!isLoopbackHost(url.hostname))
    fail("database-url must point at loopback");
  if (url.port !== "54322") {
    fail("database-url must use the local Supabase Postgres port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must target the local Supabase postgres database");
  }
  return url.toString();
}

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(
      (values ?? []).filter((value) => typeof value === "string" && value),
    ),
  ];
  return unique.length > 0 ? unique : [sentinel];
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function redactSensitive(value) {
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

function assertDeepEqual(actual, expected, label) {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function stableJson(value) {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    );
  }
  return value;
}

function assertAllowedKeys(record, expectedKeys) {
  assertDeepEqual(
    Object.keys(record).sort(),
    [...expectedKeys].sort(),
    "response key set",
  );
}

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      ),
    `${label} is not a uuid: ${value}`,
  );
}

function assertIsoTimestamp(value, label) {
  const timestamp =
    value instanceof Date ? value.toISOString() : String(value ?? "");
  assert(
    Number.isFinite(Date.parse(timestamp)),
    `${label} is not a timestamp: ${String(value)}`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
