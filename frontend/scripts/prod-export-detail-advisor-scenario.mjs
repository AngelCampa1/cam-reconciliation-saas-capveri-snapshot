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
  `prod-export-detail-advisor-${runId}`
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
  const propertyName = `[PROD-TEST] Detail Advisor ${suffix}`
  const poolName = `[PROD-TEST] Detail Pool ${suffix}`
  const fileName = `yardi-detail-advisor-prod-stress-${suffix}.csv`
  const created = {
    propertyId: null,
    poolId: null,
    mappingId: null,
    batchId: null,
  }
  report.generated = { propertyName, poolName, fileName }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '900 Prod Stress Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '50000.00',
        total_usable_sqft: '45000.00',
        common_area_sqft: '5000.00',
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
          is_gross_up_applicable: false,
          description: 'Production E2E disposable detail advisor pool',
        },
      }
    )
    created.poolId = pool.id
    report.generated.poolId = pool.id

    const mapping = await expectJson(
      `/api/v1/properties/${property.id}/pool-mappings`,
      {
        method: 'POST',
        status: 201,
        body: {
          expense_pool_id: pool.id,
          gl_account_pattern: '63%',
          allocation_percentage: '1',
          priority: 10,
        },
      }
    )
    created.mappingId = mapping.id
    report.generated.mappingId = mapping.id

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName,
      sourceOverride: 'yardi',
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6301,Janitorial Labor,01/05/2026,4000.00,CleanCo,Labor',
        '6302,Janitorial Supplies,02/05/2026,3000.00,CleanCo,Supplies',
        '6303,Window Washing,03/05/2026,1500.00,GlassCo,Windows',
        '6304,Day Porter,04/05/2026,1000.00,PorterCo,Day porter',
        '6305,Trash Removal,05/05/2026,500.00,TrashCo,Trash',
        '6306,Minor Keys,06/05/2026,25.00,LockCo,Keys',
      ].join('\n'),
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'detail advisor gl fixture uploads six clean rows',
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

    const advisory = await expectJson('/api/v1/export/detail-advisor', {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        year: 2026,
      },
    })
    check(
      'detail advisor returns deterministic grouping and materiality advice',
      {
        total_line_items: advisory.total_line_items,
        total_categories: advisory.total_categories,
        overall_severity: advisory.overall_severity,
        suggested_total_lines: advisory.suggested_total_lines,
        summary: advisory.summary,
        grouping_suggestions: advisory.grouping_suggestions,
        immaterial_items: advisory.immaterial_items,
      },
      {
        total_line_items: 6,
        total_categories: 1,
        overall_severity: 'suggestion',
        suggested_total_lines: 1,
        summary:
          'Statement has 6 line items across 1 categories. The ideal range is 15–25 lines. Consider grouping to reduce dispute risk.',
        grouping_suggestions: [
          {
            category_name: poolName,
            current_line_count: 6,
            suggested_label: poolName,
            severity: 'suggestion',
            explanation: `You have 6 individual line items in ${poolName}. Consider presenting them as a single '${poolName}' line.`,
          },
        ],
        immaterial_items: [
          {
            account_code: '6306',
            account_description: 'Minor Keys',
            amount: '25',
            percent_of_total: '0.2493765586034912718204488778',
            pool_name: poolName,
          },
        ],
      }
    )

    const emptyYear = await expectJson('/api/v1/export/detail-advisor', {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        year: 2027,
      },
    })
    check('detail advisor empty year returns no-line suggestion', emptyYear, {
      total_line_items: 0,
      total_categories: 0,
      overall_severity: 'suggestion',
      summary:
        'No detail line items found for this statement. Check that GL entries are mapped to expense pools before exporting.',
      grouping_suggestions: [],
      immaterial_items: [],
      suggested_total_lines: 0,
    })

    const invalid = await expectStatus('/api/v1/export/detail-advisor', {
      method: 'POST',
      status: 400,
      body: '{',
      contentType: 'application/json',
      recordCleanup: false,
    })
    check(
      'detail advisor malformed JSON is rejected',
      {
        status: invalid.status,
        error_code: invalid.json?.error?.code,
      },
      {
        status: 400,
        error_code: 'invalid_json',
      }
    )
  } finally {
    await cleanup(created)
  }
}

async function cleanup(created) {
  const failures = []
  if (created.batchId) {
    await attemptCleanup(
      failures,
      'delete detail advisor ingestion batch',
      () => deleteEmpty(`/api/v1/ingestion/batches/${created.batchId}`)
    )
    await attemptCleanup(failures, 'verify detail advisor batch deleted', () =>
      expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
        status: 404,
      })
    )
  }
  if (created.mappingId && created.propertyId) {
    await attemptCleanup(failures, 'delete detail advisor mapping', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`
      )
    )
    await attemptCleanup(
      failures,
      'verify detail advisor mapping deleted',
      () =>
        expectNoPoolMappings({
          propertyId: created.propertyId,
          poolId: created.poolId,
        })
    )
  }
  if (created.poolId && created.propertyId) {
    await attemptCleanup(failures, 'delete detail advisor pool', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
      )
    )
    await attemptCleanup(failures, 'verify detail advisor pool deleted', () =>
      expectStatus(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete detail advisor property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(
      failures,
      'verify detail advisor property deleted',
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
      ...(options.contentType ? { 'content-type': options.contentType } : {}),
    },
    body: typeof options.body === 'string' ? options.body : undefined,
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
