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
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-pool-allocation-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  cleanup: [],
  auth: {},
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
  const propertyName = `[PROD-TEST] Pool Allocation ${suffix}`
  const created = {
    propertyId: null,
    poolIds: [],
    allocationIds: [],
    sourcePoolId: null,
  }
  report.generated = {
    propertyName,
    poolIds: [],
    poolAllocationIds: [],
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '920 Prod Stress Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '64000.00',
        total_usable_sqft: '60000.00',
        common_area_sqft: '4000.00',
        target_occupancy: '0.93',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const sourcePool = await createPool(property.id, {
      name: `[PROD-TEST] Source Pool ${suffix}`,
      pool_type: 'operating',
      is_gross_up_applicable: true,
      gross_up_target: '0.95',
      description: 'Production E2E disposable source pool',
    })
    const taxPool = await createPool(property.id, {
      name: `[PROD-TEST] Tax Target ${suffix}`,
      pool_type: 'tax',
      is_gross_up_applicable: false,
      description: 'Production E2E disposable tax target',
    })
    const insurancePool = await createPool(property.id, {
      name: `[PROD-TEST] Insurance Target ${suffix}`,
      pool_type: 'insurance',
      is_gross_up_applicable: false,
      description: 'Production E2E disposable insurance target',
    })
    const otherPool = await createPool(property.id, {
      name: `[PROD-TEST] Other Target ${suffix}`,
      pool_type: 'other',
      is_gross_up_applicable: false,
      description: 'Production E2E disposable overflow target',
    })
    created.sourcePoolId = sourcePool.id

    const fixedAmount = await expectStatus(
      `/api/v1/properties/${property.id}/pool-allocations`,
      {
        method: 'POST',
        status: 422,
        body: {
          source_pool_id: sourcePool.id,
          target_pool_id: taxPool.id,
          allocation_type: 'fixed_amount',
          allocation_value: '250.00',
        },
        recordCleanup: false,
      }
    )
    check(
      'pool allocations reject unsupported fixed amount allocations',
      {
        status: fixedAmount.status,
        error_code: fixedAmount.json?.error?.code,
      },
      {
        status: 422,
        error_code: 'unsupported_allocation_type',
      }
    )

    const selfAllocation = await expectStatus(
      `/api/v1/properties/${property.id}/pool-allocations`,
      {
        method: 'POST',
        status: 422,
        body: {
          source_pool_id: sourcePool.id,
          target_pool_id: sourcePool.id,
          allocation_type: 'percentage',
          allocation_value: '10',
        },
        recordCleanup: false,
      }
    )
    check(
      'pool allocations reject self allocation',
      {
        status: selfAllocation.status,
        error_code: selfAllocation.json?.error?.code,
      },
      {
        status: 422,
        error_code: 'self_allocation',
      }
    )

    const taxAllocation = await createAllocation(property.id, {
      source_pool_id: sourcePool.id,
      target_pool_id: taxPool.id,
      allocation_type: 'percentage',
      allocation_value: '60',
    })
    const insuranceAllocation = await createAllocation(property.id, {
      source_pool_id: sourcePool.id,
      target_pool_id: insurancePool.id,
      allocation_type: 'percentage',
      allocation_value: '30',
    })

    check(
      'pool allocations create normalized percentage rows',
      normalizeAllocations([taxAllocation, insuranceAllocation]),
      normalizeAllocations([
        {
          source_pool_id: sourcePool.id,
          target_pool_id: insurancePool.id,
          allocation_type: 'percentage',
          allocation_value: '30.0000',
        },
        {
          source_pool_id: sourcePool.id,
          target_pool_id: taxPool.id,
          allocation_type: 'percentage',
          allocation_value: '60.0000',
        },
      ])
    )

    const duplicate = await expectStatus(
      `/api/v1/properties/${property.id}/pool-allocations`,
      {
        method: 'POST',
        status: 409,
        body: {
          source_pool_id: sourcePool.id,
          target_pool_id: taxPool.id,
          allocation_type: 'percentage',
          allocation_value: '5',
        },
        recordCleanup: false,
      }
    )
    check(
      'pool allocations reject duplicate source target pairs',
      {
        status: duplicate.status,
        error_code: duplicate.json?.error?.code,
      },
      {
        status: 409,
        error_code: 'pool_allocation_conflict',
      }
    )

    const exceeded = await expectStatus(
      `/api/v1/properties/${property.id}/pool-allocations`,
      {
        method: 'POST',
        status: 422,
        body: {
          source_pool_id: sourcePool.id,
          target_pool_id: otherPool.id,
          allocation_type: 'percentage',
          allocation_value: '20',
        },
        recordCleanup: false,
      }
    )
    check(
      'pool allocations reject percentage totals above 100',
      {
        status: exceeded.status,
        error_code: exceeded.json?.error?.code,
      },
      {
        status: 422,
        error_code: 'allocation_total_exceeded',
      }
    )

    const updatedInsurance = await expectJson(
      `/api/v1/properties/${property.id}/pool-allocations/${insuranceAllocation.id}`,
      {
        method: 'PUT',
        status: 200,
        body: {
          allocation_value: '40',
        },
      }
    )
    check(
      'pool allocation update reaches exact 100 total',
      {
        id: updatedInsurance.id,
        source_pool_id: updatedInsurance.source_pool_id,
        target_pool_id: updatedInsurance.target_pool_id,
        allocation_type: updatedInsurance.allocation_type,
        allocation_value: updatedInsurance.allocation_value,
      },
      {
        id: insuranceAllocation.id,
        source_pool_id: sourcePool.id,
        target_pool_id: insurancePool.id,
        allocation_type: 'percentage',
        allocation_value: '40.0000',
      }
    )

    const list = await expectJson(
      `/api/v1/properties/${property.id}/pool-allocations?source_pool_id=${sourcePool.id}&skip=0&limit=10`,
      { status: 200 }
    )
    check(
      'pool allocation list filters by source pool',
      {
        count: list.count,
        has_more: list.has_more,
        data: normalizeAllocations(list.data),
      },
      {
        count: 2,
        has_more: false,
        data: normalizeAllocations([
          {
            source_pool_id: sourcePool.id,
            target_pool_id: insurancePool.id,
            allocation_type: 'percentage',
            allocation_value: '40.0000',
          },
          {
            source_pool_id: sourcePool.id,
            target_pool_id: taxPool.id,
            allocation_type: 'percentage',
            allocation_value: '60.0000',
          },
        ]),
      }
    )
  } finally {
    await cleanup(created)
  }
}

async function createPool(propertyId, body) {
  const pool = await expectJson(
    `/api/v1/properties/${propertyId}/expense-pools`,
    {
      method: 'POST',
      status: 201,
      body,
    }
  )
  report.generated.poolIds.push(pool.id)
  report.generated.poolIdsByProperty = {
    ...(report.generated.poolIdsByProperty ?? {}),
    [propertyId]: report.generated.poolIds,
  }
  return pool
}

async function createAllocation(propertyId, body) {
  const allocation = await expectJson(
    `/api/v1/properties/${propertyId}/pool-allocations`,
    {
      method: 'POST',
      status: 201,
      body,
    }
  )
  report.generated.poolAllocationIds.push(allocation.id)
  return allocation
}

async function cleanup(created) {
  const failures = []
  if (created.propertyId && created.sourcePoolId) {
    await attemptCleanup(
      failures,
      'verify pool allocations before delete',
      () =>
        expectPoolAllocations({
          propertyId: created.propertyId,
          sourcePoolId: created.sourcePoolId,
          expectedCount: 2,
        })
    )
  }
  for (const allocationId of [
    ...report.generated.poolAllocationIds,
  ].reverse()) {
    if (!created.propertyId) continue
    await attemptCleanup(failures, 'delete pool allocation', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/pool-allocations/${allocationId}`
      )
    )
  }
  if (created.propertyId && created.sourcePoolId) {
    await attemptCleanup(failures, 'verify pool allocations deleted', () =>
      expectPoolAllocations({
        propertyId: created.propertyId,
        sourcePoolId: created.sourcePoolId,
        expectedCount: 0,
      })
    )
  }
  for (const poolId of [...report.generated.poolIds].reverse()) {
    if (!created.propertyId) continue
    await attemptCleanup(failures, 'delete expense pool', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`
      )
    )
    await attemptCleanup(failures, 'verify expense pool deleted', () =>
      expectStatus(
        `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete pool allocation property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(
      failures,
      'verify pool allocation property deleted',
      () =>
        expectStatus(`/api/v1/properties/${created.propertyId}`, {
          status: 404,
        })
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function expectPoolAllocations({
  propertyId,
  sourcePoolId,
  expectedCount,
}) {
  const list = await expectJson(
    `/api/v1/properties/${propertyId}/pool-allocations?source_pool_id=${sourcePoolId}&skip=0&limit=10`,
    { status: 200 }
  )
  const ok =
    list.count === expectedCount &&
    Array.isArray(list.data) &&
    list.data.length === expectedCount
  report.cleanup.push({
    path: `/api/v1/properties/${propertyId}/pool-allocations?source_pool_id=${sourcePoolId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      count: list.count,
      item_count: list.data?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Unexpected pool allocation count: ${JSON.stringify(list).slice(0, 500)}`
    )
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
  const ok = response.status === options.status
  const json = parseJsonOrNull(text)
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

function normalizeAllocations(allocations) {
  return allocations
    .map((allocation) => ({
      source_pool_id: allocation.source_pool_id,
      target_pool_id: allocation.target_pool_id,
      allocation_type: allocation.allocation_type,
      allocation_value: allocation.allocation_value,
    }))
    .sort(
      (left, right) =>
        left.target_pool_id.localeCompare(right.target_pool_id) ||
        left.allocation_value.localeCompare(right.allocation_value)
    )
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

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
