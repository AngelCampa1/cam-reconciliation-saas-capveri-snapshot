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
  `prod-analysis-anomaly-${runId}`
)
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
  const propertyName = `[PROD-TEST] Analysis Anomaly Tower ${suffix}`
  const fileName = `analysis-anomaly-prod-stress-${suffix}.csv`
  const poolNames = {
    cleaning: `[PROD-TEST] Cleaning ${suffix}`,
    security: `[PROD-TEST] Security ${suffix}`,
    insurance: `[PROD-TEST] Insurance ${suffix}`,
    utilities: `[PROD-TEST] Utilities ${suffix}`,
  }
  const created = {
    propertyId: null,
    batchId: null,
    poolIds: [],
    mappingIds: [],
  }
  report.generated = {
    propertyName,
    fileName,
    poolNames,
    periodStart: '2025-01-01',
    periodEnd: '2026-12-31',
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '830 Prod Analysis Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78710',
        total_rentable_sqft: '16000.00',
        total_usable_sqft: '14400.00',
        common_area_sqft: '1600.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const pools = {}
    for (const [key, name] of Object.entries(poolNames)) {
      const pool = await expectJson(
        `/api/v1/properties/${property.id}/expense-pools`,
        {
          method: 'POST',
          status: 201,
          body: {
            name,
            pool_type: key === 'insurance' ? 'insurance' : 'operating',
            is_gross_up_applicable: false,
            gross_up_target: null,
            description: `Production E2E analysis anomaly ${key} pool`,
          },
        }
      )
      pools[key] = pool
      created.poolIds.push(pool.id)
      report.generated.poolIds = [...created.poolIds]
    }

    const mappingSpecs = [
      { key: 'cleaning', pattern: '61*' },
      { key: 'security', pattern: '62*' },
      { key: 'insurance', pattern: '63*' },
      { key: 'utilities', pattern: '64*' },
    ]
    for (const spec of mappingSpecs) {
      const mapping = await expectJson(
        `/api/v1/properties/${property.id}/pool-mappings`,
        {
          method: 'POST',
          status: 201,
          body: {
            expense_pool_id: pools[spec.key].id,
            gl_account_pattern: spec.pattern,
            allocation_percentage: '1',
            priority: 10,
          },
        }
      )
      created.mappingIds.push(mapping.id)
      report.generated.mappingIds = [...created.mappingIds]
      report.generated.mappingId = created.mappingIds[0]
    }

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Cleaning,01/15/2025,1000.00,CleanCo,Base year cleaning',
        '6200,Security,02/15/2025,1200.00,SecureCo,Base year security',
        '6400,Utilities,03/15/2025,1000.00,PowerCo,Base year utilities',
        '6100,Cleaning,01/15/2026,1800.00,CleanCo,Target cleaning spike',
        '6300,Insurance,02/15/2026,600.00,InsureCo,New insurance category',
        '6400,Utilities,03/15/2026,1030.00,PowerCo,Normal utilities',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'analysis gl upload creates two-year fixture rows',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 6,
        error_count: 0,
      }
    )

    const dateRange = await expectJson(
      `/api/v1/ingestion/gl-date-range/${property.id}`,
      { status: 200 }
    )
    check('analysis gl date range spans generated years', dateRange, {
      min_date: '2025-01-15',
      max_date: '2026-03-15',
      year: 2026,
    })

    const availableYears = await expectJson(
      `/api/v1/analysis/properties/${property.id}/available-years`,
      { status: 200 }
    )
    check(
      'available finalized analysis years are empty before snapshot finalization',
      availableYears,
      []
    )

    const yoyFailure = await expectJson('/api/v1/analysis/year-over-year', {
      method: 'POST',
      status: 400,
      body: {
        property_id: property.id,
        years: [2025, 2026],
        use_fuzzy_matching: false,
      },
    })
    check(
      'year over year analysis rejects generated gl without finalized snapshots',
      {
        code: yoyFailure.error?.code,
        detail_mentions_missing_years:
          typeof yoyFailure.detail === 'string' &&
          yoyFailure.detail.includes('No finalized snapshots found for years'),
      },
      {
        code: 'invalid_analysis_request',
        detail_mentions_missing_years: true,
      }
    )

    const anomalies = await expectJson('/api/v1/analysis/anomaly-detection', {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        target_year: 2026,
        comparison_years: [2025],
      },
    })
    check(
      'anomaly detection finds deterministic spike missing and new categories',
      normalizeAnomalyResponse(anomalies),
      {
        property_id: property.id,
        target_year: 2026,
        total_anomalies: 3,
        critical_count: 1,
        warning_count: 1,
        info_count: 1,
        anomalies: [
          {
            pool_name: poolNames.cleaning,
            anomaly_type: 'spike',
            severity: 'critical',
            current_value: '1800',
            expected_value: '1000',
            variance_percent: '80',
            years_affected: [2026],
          },
          {
            pool_name: poolNames.insurance,
            anomaly_type: 'new_category',
            severity: 'info',
            current_value: '600',
            expected_value: '0',
            variance_percent: '100',
            years_affected: [2026],
          },
          {
            pool_name: poolNames.security,
            anomaly_type: 'missing_category',
            severity: 'warning',
            current_value: '0',
            expected_value: '1200',
            variance_percent: '-100',
            years_affected: [2026],
          },
        ],
      }
    )
  } finally {
    await cleanup(created)
  }
}

function normalizeAnomalyResponse(response) {
  return {
    property_id: response.property_id,
    target_year: response.target_year,
    total_anomalies: response.total_anomalies,
    critical_count: response.critical_count,
    warning_count: response.warning_count,
    info_count: response.info_count,
    anomalies: response.anomalies
      .map((item) => ({
        pool_name: item.pool_name,
        anomaly_type: item.anomaly_type,
        severity: item.severity,
        current_value: item.current_value,
        expected_value: item.expected_value,
        variance_percent: item.variance_percent,
        years_affected: item.years_affected,
      }))
      .sort((a, b) => a.pool_name.localeCompare(b.pool_name)),
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

async function cleanup(created) {
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
  for (const mappingId of [...created.mappingIds].reverse()) {
    if (!created.propertyId) continue
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${mappingId}`
      )
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'verify pool mappings deleted', () =>
      expectNoPoolMappings(created.propertyId)
    )
  }
  for (const poolId of [...created.poolIds].reverse()) {
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
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
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
