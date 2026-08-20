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
  `prod-analysis-empty-property-${runId}`
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
  const propertyName = `[PROD-TEST] Analysis Empty Tower ${suffix}`
  const created = { propertyId: null }
  report.generated = { propertyName }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '700 Analysis Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '2500.00',
        total_usable_sqft: '2250.00',
        common_area_sqft: '250.00',
        target_occupancy: '0.95',
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id
    check('analysis fixture property created', pick(property, ['id', 'name']), {
      id: property.id,
      name: propertyName,
    })

    const denominator = await expectJson(
      '/api/v1/analysis/denominator-change',
      {
        method: 'POST',
        status: 200,
        body: denominatorBody(property.id),
      }
    )
    check(
      'denominator JSON returns no-comparable report without persistence',
      {
        property_id: denominator.property_id,
        property_name: denominator.property_name,
        comparison_available: denominator.comparison_available,
        missing_period: denominator.missing_period,
        prior_total_rsf: denominator.prior_total_rsf,
        current_total_rsf: denominator.current_total_rsf,
        rsf_delta: denominator.rsf_delta,
        rsf_delta_percent: denominator.rsf_delta_percent,
        changes_is_empty:
          Array.isArray(denominator.changes) &&
          denominator.changes.length === 0,
        tenant_impacts_is_empty:
          Array.isArray(denominator.tenant_impacts) &&
          denominator.tenant_impacts.length === 0,
        summary_present:
          typeof denominator.summary === 'string' &&
          denominator.summary.length > 0,
      },
      {
        property_id: property.id,
        property_name: '',
        comparison_available: false,
        missing_period: 'current',
        prior_total_rsf: '0',
        current_total_rsf: '0',
        rsf_delta: '0',
        rsf_delta_percent: '0',
        changes_is_empty: true,
        tenant_impacts_is_empty: true,
        summary_present: true,
      }
    )

    const pdfFailure = await expectJson(
      '/api/v1/reports/denominator-change/pdf',
      {
        method: 'POST',
        status: 400,
        body: denominatorBody(property.id),
      }
    )
    check(
      'denominator PDF maps no-comparable snapshots to 400',
      {
        has_error_code: typeof pdfFailure.error?.code === 'string',
        code: pdfFailure.error?.code,
        detail_present:
          typeof pdfFailure.detail === 'string' && pdfFailure.detail.length > 0,
      },
      {
        has_error_code: true,
        code: 'no_comparable_snapshots',
        detail_present: true,
      }
    )

    const capexClassify = await expectJson('/api/v1/analysis/capex-classify', {
      method: 'POST',
      status: 200,
      body: { property_id: property.id, period_year: 2026 },
    })
    check(
      'capex classify scans empty property without upserts',
      capexClassify,
      {
        flags_created: 0,
        gl_entries_scanned: 0,
        property_id: property.id,
        period_year: 2026,
      }
    )

    const flags = await expectJson(
      `/api/v1/analysis/capex-flags/${property.id}/2026`,
      { status: 200 }
    )
    check('capex flags list is empty for fixture property', flags, [])

    const summary = await expectJson(
      `/api/v1/analysis/capex-summary/${property.id}/2026`,
      { status: 200 }
    )
    check('capex summary is zero for fixture property', summary, {
      total: 0,
      pending: 0,
      confirmed_capex: 0,
      dismissed: 0,
      total_flagged_amount: '0.00',
    })
  } finally {
    await cleanup(created)
  }
}

async function cleanup(created) {
  const failures = []

  if (created.propertyId) {
    await attemptCleanup(failures, 'delete analysis fixture property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(
      failures,
      'verify analysis fixture property deleted',
      () =>
        expectStatus(`/api/v1/properties/${created.propertyId}`, {
          status: 404,
        })
    )
    await attemptCleanup(
      failures,
      'verify analysis fixture leases absent',
      () => expectListEmpty(`/api/v1/leases?property_id=${created.propertyId}`)
    )
    await attemptCleanup(
      failures,
      'verify analysis fixture capex flags empty',
      async () => {
        const flags = await expectJson(
          `/api/v1/analysis/capex-flags/${created.propertyId}/2026`,
          { status: 200 }
        )
        const ok = Array.isArray(flags) && flags.length === 0
        report.cleanup.push({
          path: `/api/v1/analysis/capex-flags/${created.propertyId}/2026`,
          status: 200,
          ok,
          body_preview: JSON.stringify({ item_count: flags.length }),
        })
        if (!ok) {
          throw new Error(
            `CapEx flags still present: ${JSON.stringify(flags).slice(0, 500)}`
          )
        }
      }
    )
  }

  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

function denominatorBody(propertyId) {
  return {
    property_id: propertyId,
    current_period_start: '2026-01-01',
    current_period_end: '2026-12-31',
    prior_period_start: '2025-01-01',
    prior_period_end: '2025-12-31',
    prior_total_rsf: '2000.00',
    current_total_rsf: '2500.00',
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

async function expectListEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(
      `GET ${path} returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
  const body = text ? JSON.parse(text) : null
  const ok =
    body?.count === 0 && Array.isArray(body?.data) && body.data.length === 0
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: JSON.stringify({
      count: body?.count,
      item_count: body?.data?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `List still contains rows after cleanup: ${text.slice(0, 500)}`
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

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]))
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
