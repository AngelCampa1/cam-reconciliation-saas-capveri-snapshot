import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')

const env = {
  ...(await readEnv(resolve(repoRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.production.local'))),
}

const required = [
  'E2E_PROD_EMAIL',
  'E2E_PROD_PASSWORD',
  'E2E_PROD_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`)
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-pool-template-${runId}`)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  cleanup: [],
}

let token
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.every((check) => check.ok)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const names = {
    template: `[PROD-TEST] Pool Template ${suffix}`,
    templateUpdated: `[PROD-TEST] Updated Pool Template ${suffix}`,
    sourceProperty: `[PROD-TEST] Template Source ${suffix}`,
    targetProperty: `[PROD-TEST] Template Target ${suffix}`,
    parent: `[PROD-TEST] Operating ${suffix}`,
    child: `[PROD-TEST] Janitorial ${suffix}`,
    tax: `[PROD-TEST] Tax ${suffix}`,
  }
  const created = {
    templateId: null,
    sourcePropertyId: null,
    targetPropertyId: null,
  }
  report.generated = {
    templateName: names.template,
    sourcePropertyName: names.sourceProperty,
    targetPropertyName: names.targetProperty,
  }

  try {
    const invalid = await expectStatus('/api/v1/pool-templates', {
      method: 'POST',
      status: 422,
      body: {
        name: `[PROD-TEST] Invalid Template ${suffix}`,
        structure: {
          pools: [
            {
              name: 'Duplicate',
              children: [{ name: 'Duplicate' }],
            },
          ],
        },
      },
    })
    check(
      'duplicate template pool names are rejected before persistence',
      {
        status: invalid.status,
        error_code: invalid.json?.error?.code,
      },
      {
        status: 422,
        error_code: 'validation_error',
      }
    )

    const template = await expectJson('/api/v1/pool-templates', {
      method: 'POST',
      status: 201,
      body: {
        name: names.template,
        description: 'Disposable production E2E pool template',
        property_type: 'office',
        structure: {
          pools: [
            {
              name: names.parent,
              gross_up_enabled: true,
              children: [
                {
                  name: names.child,
                  gross_up_enabled: true,
                },
              ],
            },
          ],
        },
      },
    })
    created.templateId = template.id
    report.generated.templateId = template.id
    check(
      'template create persists org template fields',
      {
        name: template.name,
        description: template.description,
        property_type: template.property_type,
        is_system: template.is_system,
        version: template.version,
      },
      {
        name: names.template,
        description: 'Disposable production E2E pool template',
        property_type: 'office',
        is_system: false,
        version: 1,
      }
    )

    const listed = await expectJson(
      '/api/v1/pool-templates?property_type=office',
      {
        status: 200,
      }
    )
    check(
      'template list includes generated template',
      true,
      listed.some((item) => item.id === template.id)
    )

    const fetched = await expectJson(`/api/v1/pool-templates/${template.id}`, {
      status: 200,
    })
    check(
      'template detail returns created structure',
      {
        id: fetched.id,
        pool_names: fetched.structure.pools
          .flatMap((pool) => [
            pool.name,
            ...pool.children.map((child) => child.name),
          ])
          .sort(),
      },
      {
        id: template.id,
        pool_names: [names.child, names.parent].sort(),
      }
    )

    const updated = await expectJson(`/api/v1/pool-templates/${template.id}`, {
      method: 'PUT',
      status: 200,
      body: {
        name: names.templateUpdated,
        structure: {
          pools: [
            {
              name: names.parent,
              gross_up_enabled: true,
              children: [
                {
                  name: names.child,
                  gross_up_enabled: false,
                },
              ],
            },
            {
              name: names.tax,
              gross_up_enabled: false,
              children: [],
            },
          ],
        },
      },
    })
    check(
      'template update increments version and structure',
      {
        name: updated.name,
        version: updated.version,
        pool_names: updated.structure.pools
          .flatMap((pool) => [
            pool.name,
            ...pool.children.map((child) => child.name),
          ])
          .sort(),
      },
      {
        name: names.templateUpdated,
        version: 2,
        pool_names: [names.child, names.parent, names.tax].sort(),
      }
    )

    const sourceProperty = await createProperty(names.sourceProperty, suffix)
    created.sourcePropertyId = sourceProperty.id
    report.generated.propertyIds = [sourceProperty.id]
    const targetProperty = await createProperty(names.targetProperty, suffix)
    created.targetPropertyId = targetProperty.id
    report.generated.propertyIds = [sourceProperty.id, targetProperty.id]

    const applied = await expectJson('/api/v1/pool-templates/apply', {
      method: 'POST',
      status: 200,
      body: {
        template_id: template.id,
        property_id: sourceProperty.id,
        delete_existing: true,
      },
    })
    const appliedPoolIds = [
      ...applied.parent_pools.map((pool) => pool.id),
      ...applied.child_pools.map((pool) => pool.id),
    ]
    report.generated.poolIdsByProperty = {
      ...(report.generated.poolIdsByProperty ?? {}),
      [sourceProperty.id]: appliedPoolIds,
    }
    check(
      'template apply creates parent and child pools',
      {
        template_name: applied.template_name,
        property_id: applied.property_id,
        pools_created: applied.pools_created,
        parent_count: applied.parent_pools.length,
        child_count: applied.child_pools.length,
        names: applied.parent_pools
          .concat(applied.child_pools)
          .map((pool) => pool.name)
          .sort(),
      },
      {
        template_name: names.templateUpdated,
        property_id: sourceProperty.id,
        pools_created: 3,
        parent_count: 2,
        child_count: 1,
        names: [names.child, names.parent, names.tax].sort(),
      }
    )

    const copied = await expectJson('/api/v1/pool-templates/copy', {
      method: 'POST',
      status: 200,
      body: {
        source_property_id: sourceProperty.id,
        target_property_id: targetProperty.id,
        copy_mode: 'replace',
      },
    })
    const copiedPoolIds = copied.copied_pools.map((pool) => pool.id)
    report.generated.poolIdsByProperty = {
      ...(report.generated.poolIdsByProperty ?? {}),
      [targetProperty.id]: copiedPoolIds,
    }
    check(
      'template copy replaces target with copied hierarchy',
      {
        pools_copied: copied.pools_copied,
        parent_pools_copied: copied.parent_pools_copied,
        child_pools_copied: copied.child_pools_copied,
        pools_deleted: Number(copied.pools_deleted),
        copied_names: copied.copied_pools.map((pool) => pool.name).sort(),
      },
      {
        pools_copied: 3,
        parent_pools_copied: 2,
        child_pools_copied: 1,
        pools_deleted: 0,
        copied_names: [names.child, names.parent, names.tax].sort(),
      }
    )

    const samePropertyCopy = await expectStatus('/api/v1/pool-templates/copy', {
      method: 'POST',
      status: 422,
      body: {
        source_property_id: sourceProperty.id,
        target_property_id: sourceProperty.id,
      },
    })
    check(
      'same-property pool copy is rejected',
      {
        status: samePropertyCopy.status,
        error_code: samePropertyCopy.json?.error?.code,
      },
      {
        status: 422,
        error_code: 'validation_error',
      }
    )
  } finally {
    await cleanup(created)
  }
}

async function createProperty(name, suffix) {
  return expectJson('/api/v1/properties', {
    method: 'POST',
    status: 201,
    body: {
      name,
      address_line1: '700 Prod Stress Way',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      total_rentable_sqft: '24000.00',
      total_usable_sqft: '21000.00',
      common_area_sqft: '3000.00',
      target_occupancy: '0.94',
      boma_standard_version: '2024',
      fiscal_year_start_month: 1,
      external_id: `prod-template-${suffix}-${name.includes('Source') ? 'source' : 'target'}`,
    },
  })
}

async function cleanup(created) {
  const failures = []
  if (created.templateId) {
    await attemptCleanup(failures, 'delete pool template', () =>
      deleteEmpty(`/api/v1/pool-templates/${created.templateId}`)
    )
    await attemptCleanup(failures, 'verify pool template deleted', () =>
      expectStatus(`/api/v1/pool-templates/${created.templateId}`, {
        status: 404,
      })
    )
  }
  for (const propertyId of [
    created.sourcePropertyId,
    created.targetPropertyId,
  ].filter(Boolean)) {
    await attemptCleanup(failures, `delete property ${propertyId}`, () =>
      deleteEmpty(`/api/v1/properties/${propertyId}`)
    )
    await attemptCleanup(
      failures,
      `verify property ${propertyId} deleted`,
      () => expectStatus(`/api/v1/properties/${propertyId}`, { status: 404 })
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({
      label,
      ok: false,
      error: errorMessage(error),
    })
  }
}

async function expectJson(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function expectStatus(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  const json = parseJsonOrNull(text)
  const ok = response.status === options.status
  if (options.recordCleanup !== false) {
    report.cleanup.push({
      path,
      status: response.status,
      ok,
      body_preview: text.slice(0, 200),
    })
  }
  if (!ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return { status: response.status, json, text }
}

async function deleteEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
}

async function signInWithPassword() {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: env.E2E_PROD_EMAIL,
        password: env.E2E_PROD_PASSWORD,
      }),
    }
  )
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  }
  report.auth = {
    user_id: json.user?.id ?? null,
    email: json.user?.email ?? env.E2E_PROD_EMAIL,
  }
  return json.access_token
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    throw new Error(
      `${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`
    )
  }
}

async function readEnv(path) {
  try {
    const text = await readFile(path, 'utf8')
    const parsed = {}
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index < 1) continue
      parsed[trimmed.slice(0, index)] = unquote(trimmed.slice(index + 1).trim())
    }
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function parseJsonOrNull(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function stableJson(value) {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortDeep(nested)])
    )
  }
  return value
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
