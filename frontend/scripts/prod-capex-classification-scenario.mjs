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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-capex-${runId}`)
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
  const propertyName = `[PROD-TEST] CapEx ${suffix}`
  const fileName = `yardi-capex-prod-stress-${suffix}.csv`
  const periodYear = 2026
  const created = { propertyId: null, batchId: null }
  report.generated = {
    propertyName,
    fileName,
    periodYear,
    capexPeriodYear: periodYear,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '910 Prod Stress Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '85000.00',
        total_usable_sqft: '79000.00',
        common_area_sqft: '6000.00',
        target_occupancy: '0.94',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName,
      sourceOverride: 'yardi',
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '1500,Capital Improvement Roof,01/10/2026,125000.00,Apex Construction,Roof replacement installation',
        '6300,Repair and Maintenance,02/10/2026,30000.00,Prime General Contractor,Lobby renovation',
        '6200,Janitorial Supplies,03/10/2026,500.00,CleanCo,Paper towels',
      ].join('\n'),
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'capex gl fixture uploads three clean rows',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 3,
        error_count: 0,
      }
    )

    const batch = await expectJson(
      `/api/v1/ingestion/batches/${upload.batch_id}`,
      {
        status: 200,
      }
    )
    check(
      'capex batch detail exposes persisted source rows',
      {
        file_name: batch.file_name,
        source_system: batch.source_system,
        status: batch.status,
        row_count: batch.row_count,
        error_count: batch.error_count,
        preview_entries: batch.preview_entries
          .map((entry) => ({
            account_code: entry.account_code,
            account_description: entry.account_description,
            transaction_date: dateOnly(entry.transaction_date),
            debit: entry.debit,
            credit: entry.credit,
            balance: entry.balance,
          }))
          .sort((a, b) => a.account_code.localeCompare(b.account_code)),
      },
      {
        file_name: fileName,
        source_system: 'yardi',
        status: 'completed',
        row_count: 3,
        error_count: 0,
        preview_entries: [
          {
            account_code: '1500',
            account_description: 'Capital Improvement Roof',
            transaction_date: '2026-01-10',
            debit: '125000.00',
            credit: null,
            balance: '125000.00',
          },
          {
            account_code: '6200',
            account_description: 'Janitorial Supplies',
            transaction_date: '2026-03-10',
            debit: '500.00',
            credit: null,
            balance: '500.00',
          },
          {
            account_code: '6300',
            account_description: 'Repair and Maintenance',
            transaction_date: '2026-02-10',
            debit: '30000.00',
            credit: null,
            balance: '30000.00',
          },
        ],
      }
    )

    const classify = await expectJson('/api/v1/analysis/capex-classify', {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        period_year: periodYear,
      },
    })
    check(
      'capex classifier scans real gl rows and creates expected flags',
      classify,
      {
        flags_created: 9,
        gl_entries_scanned: 3,
        property_id: property.id,
        period_year: periodYear,
      }
    )

    const flags = await expectJson(
      `/api/v1/analysis/capex-flags/${property.id}/${periodYear}`,
      { status: 200 }
    )
    check(
      'capex flags contain deterministic rule hits',
      normalizeFlags(flags),
      [
        {
          classifier_version: '1.0',
          confidence_score: '0.75',
          disposition: 'pending',
          matched_pattern: '15*',
          reason: 'Account code 1500 in standard CapEx range (15xx)',
          rule_name: 'account_code_prefix',
        },
        {
          classifier_version: '1.0',
          confidence_score: '0.90',
          disposition: 'pending',
          matched_pattern: 'capital improvement',
          reason: "High-confidence CapEx keyword: 'capital improvement'",
          rule_name: 'account_keyword',
        },
        {
          classifier_version: '1.0',
          confidence_score: '0.65',
          disposition: 'pending',
          matched_pattern: 'renovation',
          reason: "Medium-confidence CapEx keyword: 'renovation'",
          rule_name: 'account_keyword',
        },
        {
          classifier_version: '1.0',
          confidence_score: '0.80',
          disposition: 'pending',
          matched_pattern: 'capital improvement',
          reason:
            "Amount $125,000.00 > $10K with CapEx keyword 'capital improvement'",
          rule_name: 'amount_keyword_combo',
        },
        {
          classifier_version: '1.0',
          confidence_score: '0.80',
          disposition: 'pending',
          matched_pattern: 'renovation',
          reason: "Amount $30,000.00 > $10K with CapEx keyword 'renovation'",
          rule_name: 'amount_keyword_combo',
        },
        {
          classifier_version: '1.0',
          confidence_score: '0.85',
          disposition: 'pending',
          matched_pattern: null,
          reason: 'Amount $125,000.00 exceeds $100,000 threshold',
          rule_name: 'amount_threshold',
        },
        {
          classifier_version: '1.0',
          confidence_score: '0.60',
          disposition: 'pending',
          matched_pattern: null,
          reason: 'Amount $30,000.00 exceeds $25,000 threshold',
          rule_name: 'amount_threshold',
        },
        {
          classifier_version: '1.0',
          confidence_score: '0.55',
          disposition: 'pending',
          matched_pattern: 'construction',
          reason: "Vendor 'Apex Construction' matches CapEx vendor pattern",
          rule_name: 'vendor_pattern',
        },
        {
          classifier_version: '1.0',
          confidence_score: '0.55',
          disposition: 'pending',
          matched_pattern: 'general contractor',
          reason:
            "Vendor 'Prime General Contractor' matches CapEx vendor pattern",
          rule_name: 'vendor_pattern',
        },
      ]
    )

    const summaryBefore = await expectJson(
      `/api/v1/analysis/capex-summary/${property.id}/${periodYear}`,
      { status: 200 }
    )
    check(
      'capex summary before review counts unique flagged gl amounts',
      summaryBefore,
      {
        total: 9,
        pending: 9,
        confirmed_capex: 0,
        dismissed: 0,
        total_flagged_amount: '155000.00',
      }
    )

    const sortedFlags = [...flags].sort(compareFlag)
    const dismissedFlag = sortedFlags.find(
      (flag) =>
        flag.rule_name === 'amount_threshold' &&
        flag.flag_reason === 'Amount $125,000.00 exceeds $100,000 threshold'
    )
    if (!dismissedFlag)
      throw new Error('Missing expected dismissed flag target.')
    const remainingFlagIds = sortedFlags
      .filter((flag) => flag.id !== dismissedFlag.id)
      .map((flag) => flag.id)

    const mixedMissing = await expectStatus(
      '/api/v1/analysis/capex-flags/bulk-review',
      {
        method: 'POST',
        status: 404,
        body: {
          flag_ids: [dismissedFlag.id, randomUUID()],
          disposition: 'dismissed',
          review_note: 'Should not partially update',
        },
        recordCleanup: false,
      }
    )
    check(
      'capex bulk review rejects mixed valid and missing ids before update',
      {
        status: mixedMissing.status,
        error_code: mixedMissing.json?.error?.code,
      },
      {
        status: 404,
        error_code: 'capex_flag_not_found',
      }
    )
    const pendingAfterRejectedBulk = await expectJson(
      `/api/v1/analysis/capex-flags/${property.id}/${periodYear}?disposition=pending`,
      { status: 200 }
    )
    check(
      'capex rejected bulk review leaves all flags pending',
      pendingAfterRejectedBulk.map((flag) => flag.id).sort(),
      sortedFlags.map((flag) => flag.id).sort()
    )

    const dismissed = await expectJson(
      `/api/v1/analysis/capex-flags/${dismissedFlag.id}/review`,
      {
        method: 'POST',
        status: 200,
        body: {
          disposition: 'dismissed',
          review_note: 'Production E2E dismiss one threshold duplicate',
        },
      }
    )
    check(
      'capex single review dismisses one flag',
      {
        id: dismissed.id,
        disposition: dismissed.disposition,
        review_note: dismissed.review_note,
        reviewed_by_user_id_type: typeof dismissed.reviewed_by_user_id,
        reviewed_at_type: typeof dismissed.reviewed_at,
      },
      {
        id: dismissedFlag.id,
        disposition: 'dismissed',
        review_note: 'Production E2E dismiss one threshold duplicate',
        reviewed_by_user_id_type: 'string',
        reviewed_at_type: 'string',
      }
    )

    const confirmed = await expectJson(
      '/api/v1/analysis/capex-flags/bulk-review',
      {
        method: 'POST',
        status: 200,
        body: {
          flag_ids: remainingFlagIds,
          disposition: 'confirmed_capex',
          review_note: 'Production E2E confirms remaining deterministic flags',
        },
      }
    )
    check(
      'capex bulk review confirms remaining flags',
      normalizeReviewResults(confirmed),
      remainingFlagIds
        .map((id) => ({
          id,
          disposition: 'confirmed_capex',
          review_note: 'Production E2E confirms remaining deterministic flags',
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    )

    const summaryAfter = await expectJson(
      `/api/v1/analysis/capex-summary/${property.id}/${periodYear}`,
      { status: 200 }
    )
    check(
      'capex summary after review reflects final dispositions',
      summaryAfter,
      {
        total: 9,
        pending: 0,
        confirmed_capex: 8,
        dismissed: 1,
        total_flagged_amount: '155000.00',
      }
    )

    const missingBulk = await expectStatus(
      '/api/v1/analysis/capex-flags/bulk-review',
      {
        method: 'POST',
        status: 404,
        body: {
          flag_ids: [randomUUID()],
          disposition: 'dismissed',
          review_note: 'Should not partially update',
        },
        recordCleanup: false,
      }
    )
    check(
      'capex bulk review rejects missing flag ids before update',
      {
        status: missingBulk.status,
        error_code: missingBulk.json?.error?.code,
      },
      {
        status: 404,
        error_code: 'capex_flag_not_found',
      }
    )
  } finally {
    await cleanup(created, periodYear)
  }
}

async function cleanup(created, periodYear) {
  const failures = []
  if (created.batchId) {
    await attemptCleanup(failures, 'delete capex ingestion batch', () =>
      deleteEmpty(`/api/v1/ingestion/batches/${created.batchId}`)
    )
    await attemptCleanup(failures, 'verify capex batch deleted', () =>
      expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
        status: 404,
      })
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete capex property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify capex property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
    await attemptCleanup(failures, 'verify capex flags absent', () =>
      expectEmptyList(
        `/api/v1/analysis/capex-flags/${created.propertyId}/${periodYear}`,
        'capex flags absent after property delete'
      )
    )
    await attemptCleanup(failures, 'verify capex summary reset', () =>
      expectJson(
        `/api/v1/analysis/capex-summary/${created.propertyId}/${periodYear}`,
        {
          status: 200,
          expect: {
            total: 0,
            pending: 0,
            confirmed_capex: 0,
            dismissed: 0,
            total_flagged_amount: '0.00',
          },
        }
      )
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
  const parsed = text ? JSON.parse(text) : null
  if (options.expect !== undefined) {
    const ok = stableJson(parsed) === stableJson(options.expect)
    report.cleanup.push({
      path,
      status: response.status,
      ok,
      body_preview: text.slice(0, 200),
    })
    if (!ok) {
      throw new Error(
        `${path} mismatch: expected ${stableJson(options.expect)}, got ${stableJson(parsed)}`
      )
    }
  }
  return parsed
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

async function expectEmptyList(path, label) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  const parsed = text ? JSON.parse(text) : null
  const ok =
    response.status === 200 && Array.isArray(parsed) && parsed.length === 0
  report.cleanup.push({
    label,
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(`${label} failed: ${text.slice(0, 500)}`)
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

function normalizeFlags(flags) {
  return flags
    .map((flag) => ({
      classifier_version: flag.classifier_version,
      confidence_score: flag.confidence_score,
      disposition: flag.disposition,
      matched_pattern: flag.matched_pattern,
      reason: flag.flag_reason,
      rule_name: flag.rule_name,
    }))
    .sort(compareNormalizedFlag)
}

function normalizeReviewResults(flags) {
  return flags
    .map((flag) => ({
      id: flag.id,
      disposition: flag.disposition,
      review_note: flag.review_note,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function compareFlag(a, b) {
  return (
    String(a.rule_name).localeCompare(String(b.rule_name)) ||
    String(a.flag_reason).localeCompare(String(b.flag_reason)) ||
    String(a.id).localeCompare(String(b.id))
  )
}

function compareNormalizedFlag(a, b) {
  return (
    a.rule_name.localeCompare(b.rule_name) ||
    a.reason.localeCompare(b.reason) ||
    String(a.matched_pattern).localeCompare(String(b.matched_pattern))
  )
}

function dateOnly(value) {
  return String(value).slice(0, 10)
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
