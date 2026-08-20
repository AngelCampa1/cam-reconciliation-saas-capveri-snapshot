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
  ...process.env,
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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-gl-narrative-${runId}`)
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
  report.ok =
    report.checks.every((checkItem) => checkItem.ok) &&
    report.cleanup.every((item) => item.ok)
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
  const propertyName = `[PROD-TEST] GL Narrative Tower ${suffix}`
  const fileName = `gl-narrative-prod-stress-${suffix}.csv`
  const periodYear = 2026
  const created = {
    propertyId: null,
    batchId: null,
    poolIds: [],
    mappingIds: [],
    analysisIds: [],
  }
  report.generated = {
    propertyName,
    fileName,
    periodYear,
    propertyId: null,
    batchId: null,
    poolIds: created.poolIds,
    mappingIds: created.mappingIds,
    glAnalysisIds: created.analysisIds,
    glNarrativeAbsenceExpected: { periodYear },
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '940 Prod GL Narrative Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78711',
        total_rentable_sqft: '18000.00',
        total_usable_sqft: '16200.00',
        common_area_sqft: '1800.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id
    report.generated.glNarrativeAbsenceExpected.propertyId = property.id

    const poolsByKey = new Map()
    for (const poolInput of [
      {
        key: 'repairs',
        name: `[PROD-TEST] Narrative Repairs ${suffix}`,
        pool_type: 'operating',
        pattern: '61*',
      },
      {
        key: 'management',
        name: `[PROD-TEST] Narrative Management ${suffix}`,
        pool_type: 'operating',
        pattern: '62*',
      },
      {
        key: 'capital',
        name: `[PROD-TEST] Narrative Capital ${suffix}`,
        pool_type: 'capital',
        pattern: '15*',
      },
    ]) {
      const pool = await expectJson(
        `/api/v1/properties/${property.id}/expense-pools`,
        {
          method: 'POST',
          status: 201,
          body: {
            name: poolInput.name,
            pool_type: poolInput.pool_type,
            is_gross_up_applicable: false,
            gross_up_target: null,
            description: `Production E2E GL narrative ${poolInput.key} pool`,
          },
        }
      )
      poolsByKey.set(poolInput.key, pool)
      created.poolIds.push(pool.id)

      const mapping = await expectJson(
        `/api/v1/properties/${property.id}/pool-mappings`,
        {
          method: 'POST',
          status: 201,
          body: {
            expense_pool_id: pool.id,
            gl_account_pattern: poolInput.pattern,
            allocation_percentage: '1',
            priority: 10,
          },
        }
      )
      created.mappingIds.push(mapping.id)
    }

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName,
      sourceOverride: 'yardi',
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Repairs and Maintenance,01/10/2026,950.00,FixCo,Monthly HVAC service',
        '6100,Repairs and Maintenance,02/18/2026,42500.00,BuildCo,Roof membrane replacement capital-like project',
        '6200,Management Fees,03/15/2026,7800.00,ManagerCo,Admin fee and management fee allocation review',
        '1500,Building Improvements,04/20/2026,118000.00,BuildCo,Capital lobby renovation booked in CAM ledger',
        '6100,Repairs and Maintenance,05/09/2026,2400.00,HOU-02 Vendor,wrong property miscoded invoice for HOU-02 garage',
      ].join('\n'),
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'gl narrative fixture uploads risk-heavy GL rows',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 5,
        error_count: 0,
      }
    )

    const missing = await expectJson(
      `/api/v1/analysis/gl-narrative/${property.id}/${periodYear}`,
      { status: 200 }
    )
    check('gl narrative latest is null before generation', missing, null)

    const firstRun = await expectJson('/api/v1/analysis/gl-narrative', {
      method: 'POST',
      status: 200,
      body: { property_id: property.id, period_year: periodYear },
    })
    created.analysisIds.push(firstRun.result.id)
    report.generated.glAnalysisIds = created.analysisIds
    check(
      'gl narrative creates persisted OpenRouter-backed analysis',
      normalizeGlRun(firstRun, property.id, periodYear),
      {
        gl_entry_count: 5,
        property_id: property.id,
        period_year: periodYear,
        dismissed: false,
        token_input_positive: true,
        token_output: 0,
        markdown_has_title: true,
        markdown_has_risks: true,
        markdown_has_recommendations: true,
      }
    )

    const latest = await expectJson(
      `/api/v1/analysis/gl-narrative/${property.id}/${periodYear}`,
      { status: 200 }
    )
    check(
      'gl narrative latest returns the generated row',
      {
        id: latest.id,
        property_id: latest.property_id,
        period_year: latest.period_year,
        dismissed_at: latest.dismissed_at,
      },
      {
        id: firstRun.result.id,
        property_id: property.id,
        period_year: periodYear,
        dismissed_at: null,
      }
    )

    const dismissed = await expectJson(
      `/api/v1/analysis/gl-narrative/${firstRun.result.id}/dismiss`,
      { method: 'POST', status: 200 }
    )
    check(
      'gl narrative dismiss marks the generated row',
      {
        id: dismissed.id,
        property_id: dismissed.property_id,
        period_year: dismissed.period_year,
        dismissed_at_present:
          typeof dismissed.dismissed_at === 'string' &&
          dismissed.dismissed_at.length > 0,
        dismissed_by_user_id_present:
          typeof dismissed.dismissed_by_user_id === 'string' &&
          dismissed.dismissed_by_user_id.length > 0,
      },
      {
        id: firstRun.result.id,
        property_id: property.id,
        period_year: periodYear,
        dismissed_at_present: true,
        dismissed_by_user_id_present: true,
      }
    )

    const afterDismiss = await expectJson(
      `/api/v1/analysis/gl-narrative/${property.id}/${periodYear}`,
      { status: 200 }
    )
    check('gl narrative latest excludes dismissed rows', afterDismiss, null)

    const secondRun = await expectJson('/api/v1/analysis/gl-narrative', {
      method: 'POST',
      status: 200,
      body: { property_id: property.id, period_year: periodYear },
    })
    created.analysisIds.push(secondRun.result.id)
    report.generated.glAnalysisIds = created.analysisIds
    check(
      'gl narrative can regenerate after dismissal',
      {
        gl_entry_count: secondRun.gl_entry_count,
        property_id: secondRun.result.property_id,
        period_year: secondRun.result.period_year,
        id_differs_from_first: secondRun.result.id !== firstRun.result.id,
        dismissed_at: secondRun.result.dismissed_at,
      },
      {
        gl_entry_count: 5,
        property_id: property.id,
        period_year: periodYear,
        id_differs_from_first: true,
        dismissed_at: null,
      }
    )
  } finally {
    await cleanup(created, periodYear)
  }
}

function normalizeGlRun(response, propertyId, periodYear) {
  const markdown = String(response.result?.analysis_markdown ?? '')
  return {
    gl_entry_count: response.gl_entry_count,
    property_id: response.result?.property_id,
    period_year: response.result?.period_year,
    dismissed: response.result?.dismissed_at !== null,
    token_input_positive: Number(response.result?.token_input ?? 0) > 0,
    token_output: response.result?.token_output,
    markdown_has_title: markdown.includes('CAM GL Analysis'),
    markdown_has_risks: markdown.includes('CAM Audit Risks'),
    markdown_has_recommendations: markdown.includes('Recommendations'),
  }
}

async function cleanup(created, periodYear) {
  const failures = []
  if (created.batchId) {
    await attemptCleanup(failures, 'delete ingestion batch', () =>
      deleteEmpty(`/api/v1/ingestion/batches/${created.batchId}`)
    )
    await attemptCleanup(failures, 'verify ingestion batch deleted', () =>
      expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
        status: 404,
      })
    )
  }
  if (created.propertyId) {
    for (const mappingId of [...created.mappingIds].reverse()) {
      await attemptCleanup(failures, `delete pool mapping ${mappingId}`, () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/pool-mappings/${mappingId}`
        )
      )
    }
    await attemptCleanup(failures, 'verify pool mappings deleted', () =>
      expectNoPoolMappings(created.propertyId)
    )
    for (const poolId of [...created.poolIds].reverse()) {
      await attemptCleanup(failures, `delete expense pool ${poolId}`, () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`
        )
      )
      await attemptCleanup(
        failures,
        `verify expense pool deleted ${poolId}`,
        () =>
          expectStatus(
            `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`,
            { status: 404 }
          )
      )
    }
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
    await attemptCleanup(
      failures,
      'verify generated GL narrative absent after property delete',
      () => expectNoGlNarrative(created.propertyId, periodYear)
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function uploadCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)

  const response = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
    body: form,
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(
      `POST /api/v1/ingestion/upload returned ${response.status}, expected 200: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function expectNoPoolMappings(propertyId) {
  const response = await expectJson(
    `/api/v1/properties/${propertyId}/pool-mappings?skip=0&limit=100`,
    { status: 200 }
  )
  const ok =
    response.count === 0 &&
    Array.isArray(response.data) &&
    response.data.length === 0
  report.cleanup.push({
    path: `/api/v1/properties/${propertyId}/pool-mappings`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      count: response.count,
      item_count: response.data?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Pool mappings still present after delete: ${JSON.stringify(response).slice(0, 500)}`
    )
  }
}

async function expectNoGlNarrative(propertyId, periodYear) {
  const body = await expectJson(
    `/api/v1/analysis/gl-narrative/${propertyId}/${periodYear}`,
    { status: 200 }
  )
  const ok = body === null
  report.cleanup.push({
    path: `/api/v1/analysis/gl-narrative/${propertyId}/${periodYear}`,
    status: 200,
    ok,
    body_preview: JSON.stringify(body),
  })
  if (!ok) {
    throw new Error(
      `GL narrative still present after property delete: ${JSON.stringify(body).slice(0, 500)}`
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
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  const ok = response.status === options.status
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
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
