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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-pool-mapping-${runId}`)
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
  const propertyName = `[PROD-TEST] Pool Tower ${suffix}`
  const poolName = `[PROD-TEST] Operating Pool ${suffix}`
  const created = { propertyId: null, poolId: null, mappingId: null }
  report.generated = { propertyName, poolName }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '400 Prod Stress Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78704',
        total_rentable_sqft: '15000.00',
        total_usable_sqft: '13000.00',
        common_area_sqft: '2000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const pool = await expectJson(
      `/api/v1/properties/${property.id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: poolName,
          pool_type: 'operating',
          is_gross_up_applicable: true,
          gross_up_target: '0.95',
          description: 'Production E2E disposable operating pool',
        },
      }
    )
    created.poolId = pool.id
    report.generated.poolId = pool.id
    check(
      'expense pool create normalizes decimal fields',
      {
        name: pool.name,
        pool_type: pool.pool_type,
        is_gross_up_applicable: pool.is_gross_up_applicable,
        gross_up_target: pool.gross_up_target,
        description: pool.description,
      },
      {
        name: poolName,
        pool_type: 'operating',
        is_gross_up_applicable: true,
        gross_up_target: '0.9500',
        description: 'Production E2E disposable operating pool',
      }
    )

    const mapping = await expectJson(
      `/api/v1/properties/${property.id}/pool-mappings`,
      {
        method: 'POST',
        status: 201,
        body: {
          expense_pool_id: pool.id,
          gl_account_pattern: '61*',
          allocation_percentage: '0.75',
          priority: 3,
        },
      }
    )
    created.mappingId = mapping.id
    report.generated.mappingId = mapping.id
    check(
      'pool mapping create persists pattern and allocation',
      {
        expense_pool_id: mapping.expense_pool_id,
        gl_account_pattern: mapping.gl_account_pattern,
        allocation_percentage: mapping.allocation_percentage,
        priority: mapping.priority,
      },
      {
        expense_pool_id: pool.id,
        gl_account_pattern: '61*',
        allocation_percentage: '0.7500',
        priority: 3,
      }
    )

    const invalid = await expectStatus(
      `/api/v1/properties/${property.id}/pool-mappings`,
      {
        method: 'POST',
        status: 422,
        recordCleanup: false,
        body: {
          expense_pool_id: pool.id,
          gl_account_pattern: 'bad/unsafe',
          allocation_percentage: '0.5',
          priority: 4,
        },
      }
    )
    check(
      'invalid gl pattern is rejected',
      {
        status: invalid.status,
        error_code: invalid.json?.error?.code,
      },
      {
        status: 422,
        error_code: 'invalid_gl_account_pattern',
      }
    )

    const listByPool = await expectJson(
      `/api/v1/properties/${property.id}/pool-mappings?pool_id=${pool.id}&skip=0&limit=10`,
      { status: 200 }
    )
    check(
      'pool mapping list filters to generated mapping',
      {
        count: listByPool.count,
        has_more: listByPool.has_more,
        ids: listByPool.data.map((item) => item.id),
      },
      {
        count: 1,
        has_more: false,
        ids: [mapping.id],
      }
    )

    const updated = await expectJson(
      `/api/v1/properties/${property.id}/pool-mappings/${mapping.id}`,
      {
        method: 'PUT',
        status: 200,
        body: {
          gl_account_pattern: '62*',
          allocation_percentage: '0.5',
          priority: 7,
        },
      }
    )
    check(
      'pool mapping update persists changed allocation',
      {
        gl_account_pattern: updated.gl_account_pattern,
        allocation_percentage: updated.allocation_percentage,
        priority: updated.priority,
      },
      {
        gl_account_pattern: '62*',
        allocation_percentage: '0.5000',
        priority: 7,
      }
    )
  } finally {
    await cleanup(created)
  }
}

async function cleanup(created) {
  const failures = []
  if (created.mappingId && created.propertyId) {
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`
      )
    )
    await attemptCleanup(failures, 'verify pool mapping deleted', () =>
      expectNoPoolMappings({
        propertyId: created.propertyId,
        poolId: created.poolId,
      })
    )
  }
  if (created.poolId && created.propertyId) {
    await attemptCleanup(failures, 'delete expense pool', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
      )
    )
  }
  if (created.poolId && created.propertyId) {
    await attemptCleanup(failures, 'verify expense pool deleted', () =>
      expectStatus(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function expectNoPoolMappings({ propertyId, poolId }) {
  const list = await expectJson(
    `/api/v1/properties/${propertyId}/pool-mappings?pool_id=${poolId}&skip=0&limit=10`,
    { status: 200 }
  )
  const ok =
    list.count === 0 && Array.isArray(list.data) && list.data.length === 0
  report.cleanup.push({
    path: `/api/v1/properties/${propertyId}/pool-mappings?pool_id=${poolId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      count: list.count,
      item_count: list.data?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Pool mappings still present after delete: ${JSON.stringify(list).slice(0, 500)}`
    )
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
