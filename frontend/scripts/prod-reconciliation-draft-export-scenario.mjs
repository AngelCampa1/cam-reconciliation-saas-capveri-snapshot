import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

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
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-reconciliation-draft-export-${runId}`
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
  const propertyName = `[PROD-TEST] Reconcile Tower ${suffix}`
  const unitNumber = `Suite-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Reconcile Tenant ${suffix}`
  const poolName = `[PROD-TEST] Operating Pool ${suffix}`
  const fileName = `yardi-reconcile-prod-stress-${suffix}.csv`
  const periodStart = '2026-01-01'
  const periodEnd = '2026-12-31'
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    poolId: null,
    mappingId: null,
    batchId: null,
    jobId: null,
    snapshotIds: [],
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    poolName,
    fileName,
    periodStart,
    periodEnd,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '500 Prod Stress Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78705',
        total_rentable_sqft: '10000.00',
        total_usable_sqft: '9000.00',
        common_area_sqft: '1000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: unitNumber,
        rentable_sqft: '2000.00',
        usable_sqft: '1800.00',
        floor: 5,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitId = unit.id
    report.generated.unitId = unit.id

    const lease = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: tenantName,
        start_date: periodStart,
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: {
          base_year: 2025,
          base_year_amount: '1000.00',
          gross_up_base_year: false,
          pro_rata_share: '0.20',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.10',
          management_fee_percentage: '0',
          excluded_pools: [],
          base_year_adjustments: [],
        },
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

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
          description: 'Production E2E disposable reconciliation pool',
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
          gl_account_pattern: '61*',
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
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Janitorial,01/15/2026,5000.00,CleanCo,Annual janitorial',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'gl upload creates one clean row for reconciliation',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 1,
        error_count: 0,
      }
    )

    const job = await expectJson('/api/v1/reconciliation/calculate', {
      method: 'POST',
      status: 202,
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        force_recalculate: true,
      },
    })
    created.jobId = job.job_id
    report.generated.jobId = job.job_id
    check(
      'reconciliation calculate queues a job',
      {
        status: job.status,
        has_job_id: typeof job.job_id === 'string' && job.job_id.length > 0,
      },
      {
        status: 'pending',
        has_job_id: true,
      }
    )

    const completedJob = await waitForJob(job.job_id)
    created.snapshotIds = completedJob.snapshot_ids
    report.generated.snapshotIds = completedJob.snapshot_ids
    check(
      'reconciliation job completes one snapshot',
      {
        status: completedJob.status,
        processed_leases: completedJob.processed_leases,
        total_leases: completedJob.total_leases,
        progress_percentage: completedJob.progress_percentage,
        snapshot_count: completedJob.snapshot_ids.length,
        potential_recovery_total: completedJob.potential_recovery_total,
      },
      {
        status: 'completed',
        processed_leases: 1,
        total_leases: 1,
        progress_percentage: 100,
        snapshot_count: 1,
        potential_recovery_total: '5005.00',
      }
    )

    const snapshotId = completedJob.snapshot_ids[0]
    const snapshot = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotId}?include_trace=false`,
      { status: 200 }
    )
    check(
      'draft snapshot has deterministic recovery math',
      {
        property_id: snapshot.property_id,
        lease_id: snapshot.lease_id,
        period_start_date: dateOnly(snapshot.period_start_date),
        period_end_date: dateOnly(snapshot.period_end_date),
        status: snapshot.status,
        total_operating_expenses: snapshot.total_operating_expenses,
        grossed_up_expenses: snapshot.grossed_up_expenses,
        base_year_amount: snapshot.base_year_amount,
        tenant_share_before_cap: snapshot.tenant_share_before_cap,
        tenant_share_after_cap: snapshot.tenant_share_after_cap,
        admin_fee: snapshot.admin_fee,
        total_recovery: snapshot.total_recovery,
        calculation_trace_length: snapshot.calculation_trace?.length ?? null,
      },
      {
        property_id: property.id,
        lease_id: lease.id,
        period_start_date: periodStart,
        period_end_date: periodEnd,
        status: 'draft',
        total_operating_expenses: '5000.00',
        grossed_up_expenses: '23750.00',
        base_year_amount: '1000.00',
        tenant_share_before_cap: '4550.00',
        tenant_share_after_cap: '4550.00',
        admin_fee: '455.00',
        total_recovery: '5005.00',
        calculation_trace_length: 0,
      }
    )

    const list = await expectJson(
      `/api/v1/reconciliation/snapshots?property_id=${property.id}&period_start=${periodStart}&period_end=${periodEnd}&is_finalized=false&page=1&size=10`,
      { status: 200 }
    )
    check(
      'snapshot list filters to generated draft',
      {
        total: list.total,
        page: list.page,
        page_size: list.page_size,
        ids: list.items.map((item) => item.id),
        statuses: list.items.map((item) => item.status),
      },
      {
        total: 1,
        page: 1,
        page_size: 10,
        ids: [snapshotId],
        statuses: ['draft'],
      }
    )

    const cellId = encodeCellId(snapshotId, 'admin_fee')
    const updatedCell = await expectJson(
      `/api/v1/reconciliation/cells/${cellId}`,
      {
        method: 'PATCH',
        status: 200,
        body: { value: '456.78' },
      }
    )
    check(
      'draft snapshot cell update records manual override',
      {
        snapshot_id: updatedCell.snapshot_id,
        field_name: updatedCell.field_name,
        value: updatedCell.value,
        is_manual_override: updatedCell.is_manual_override,
      },
      {
        snapshot_id: snapshotId,
        field_name: 'admin_fee',
        value: '456.78',
        is_manual_override: true,
      }
    )

    const pdf = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snapshotId}/export/pdf?allow_draft=true`,
      {
        status: 200,
        contentTypePrefix: 'application/pdf',
      }
    )
    check(
      'draft pdf export streams without persisting export history',
      {
        status: pdf.status,
        content_type: pdf.content_type,
        content_disposition: pdf.content_disposition,
        starts_with_pdf: pdf.starts_with_pdf,
        byte_length_gt_1000: pdf.byte_length > 1000,
      },
      {
        status: 200,
        content_type: 'application/pdf',
        content_disposition: `attachment; filename="Reconciliation_${propertyName.replaceAll(' ', '_')}_2026.pdf"`,
        starts_with_pdf: true,
        byte_length_gt_1000: true,
      }
    )
    const pdfText = await extractPdfText(pdf.bytes)
    const pdfTextCoverage = draftPdfTextCoverage(pdfText, {
      propertyName,
      tenantName,
      periodStart,
      periodEnd,
      expected: {
        totalOperatingExpenses: '5000.00',
        grossedUpExpenses: '23750.00',
        baseYearAmount: '1000.00',
        tenantShareBeforeCap: '4550.00',
        tenantShareAfterCap: '4550.00',
        adminFee: '456.78',
        totalRecovery: '5006.78',
      },
    })
    report.generated.pdfTextCoverage = pdfTextCoverage
    check(
      'draft pdf body contains generated draft and override facts',
      pdfTextCoverage,
      {
        has_title: true,
        has_property_name: true,
        has_tenant_name: true,
        has_period: true,
        has_expense_summary: true,
        has_total_operating_expenses: true,
        has_grossed_up_expenses: true,
        has_base_year_amount: true,
        has_tenant_share_before_cap: true,
        has_tenant_share_after_cap: true,
        has_admin_fee_override: true,
        has_no_stale_admin_fee_row: true,
        has_total_amount_due_override: true,
        has_no_stale_total_amount_due: true,
        has_generated_footer: true,
      }
    )

    const history = await expectJson(
      `/api/v1/export/history?property_id=${property.id}&format=pdf&page=1&page_size=10`,
      { status: 200 }
    )
    check(
      'draft snapshot pdf endpoint does not create export history',
      {
        total: history.total,
        item_count: history.items?.length ?? history.data?.length ?? null,
      },
      {
        total: 0,
        item_count: 0,
      }
    )
  } finally {
    await cleanup(created, { periodStart, periodEnd })
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

async function waitForJob(jobId) {
  const started = Date.now()
  let lastJob = null
  while (Date.now() - started < 90_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, {
      status: 200,
    })
    lastJob = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(
        `Reconciliation job failed: ${JSON.stringify(job).slice(0, 500)}`
      )
    }
    await sleep(2_000)
  }
  throw new Error(
    `Timed out waiting for reconciliation job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`
  )
}

async function cleanup(created, period) {
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
  if (created.mappingId && created.propertyId) {
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`
      )
    )
  }
  if (created.poolId && created.propertyId) {
    await attemptCleanup(failures, 'delete expense pool', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
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
    await attemptCleanup(failures, 'verify snapshots deleted by cascade', () =>
      expectNoSnapshots(created.propertyId, period)
    )
    if (created.jobId) {
      await attemptCleanup(
        failures,
        'verify calculation job deleted by cascade',
        () =>
          expectStatus(`/api/v1/reconciliation/jobs/${created.jobId}`, {
            status: 404,
          })
      )
    }
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function expectNoSnapshots(propertyId, period) {
  const list = await expectJson(
    `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${period.periodStart}&period_end=${period.periodEnd}&page=1&size=10`,
    { status: 200 }
  )
  const ok =
    list.total === 0 && Array.isArray(list.items) && list.items.length === 0
  report.cleanup.push({
    path: `/api/v1/reconciliation/snapshots?property_id=${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      total: list.total,
      item_count: list.items?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Snapshots still present after property delete: ${JSON.stringify(list).slice(0, 500)}`
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

async function expectBinary(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: options.contentTypePrefix,
    },
  })
  const bytes = new Uint8Array(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${new TextDecoder().decode(bytes.slice(0, 500))}`
    )
  }
  if (!contentType.startsWith(options.contentTypePrefix)) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned content-type ${contentType}, expected ${options.contentTypePrefix}`
    )
  }
  return {
    status: response.status,
    content_type: contentType,
    content_disposition: response.headers.get('content-disposition') ?? '',
    byte_length: bytes.byteLength,
    starts_with_pdf: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
    bytes,
  }
}

async function extractPdfText(bytes) {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const pageTexts = []
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pageTexts.push(content.items.map((item) => item.str ?? '').join(' '))
    }
  } finally {
    await pdf.destroy()
  }
  return pageTexts.join('\n')
}

function draftPdfTextCoverage(
  text,
  { propertyName, tenantName, periodStart, periodEnd, expected }
) {
  const normalized = normalizeReportText(text)
  return {
    has_title: normalized.includes('tenant reconciliation statement'),
    has_property_name: normalized.includes(normalizeReportText(propertyName)),
    has_tenant_name: normalized.includes(normalizeReportText(tenantName)),
    has_period: normalized.includes(
      normalizeReportText(
        `Period: ${formatStatementDate(periodStart)} - ${formatStatementDate(periodEnd)}`
      )
    ),
    has_expense_summary: normalized.includes('expense summary'),
    has_total_operating_expenses: hasLabelAmountToken(
      normalized,
      'total operating expenses',
      formatExactMoneyToken(expected.totalOperatingExpenses)
    ),
    has_grossed_up_expenses: hasLabelAmountToken(
      normalized,
      'grossed-up expenses',
      formatExactMoneyToken(expected.grossedUpExpenses)
    ),
    has_base_year_amount: hasLabelAmountToken(
      normalized,
      'base year amount',
      formatExactMoneyToken(expected.baseYearAmount)
    ),
    has_tenant_share_before_cap: hasLabelAmountToken(
      normalized,
      'tenant share (before cap)',
      formatExactMoneyToken(expected.tenantShareBeforeCap)
    ),
    has_tenant_share_after_cap: hasLabelAmountToken(
      normalized,
      'tenant share (after cap)',
      formatExactMoneyToken(expected.tenantShareAfterCap)
    ),
    has_admin_fee_override: hasLabelAmountToken(
      normalized,
      'administrative fee',
      formatExactMoneyToken(expected.adminFee)
    ),
    has_no_stale_admin_fee_row: !hasLabelAmountToken(
      normalized,
      'administrative fee',
      formatExactMoneyToken('455.00')
    ),
    has_total_amount_due_override: hasLabelAmountToken(
      normalized,
      'total amount due',
      formatExactMoneyToken(expected.totalRecovery)
    ),
    has_no_stale_total_amount_due: !hasLabelAmountToken(
      normalized,
      'total amount due',
      formatExactMoneyToken('5005.00')
    ),
    has_generated_footer: normalized.includes('generated:'),
  }
}

function normalizeReportText(value) {
  return String(value).toLowerCase().replace(/\s+/gu, ' ').trim()
}

function hasLabelAmountToken(text, label, amountToken) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const escapedAmount = amountToken.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(
    `${escapedLabel}.{0,120}(?<![\\d,.])\\$?${escapedAmount}(?![\\d,.])`,
    'u'
  ).test(text)
}

function formatExactMoneyToken(amount) {
  const match = String(amount).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/u)
  if (!match) {
    throw new Error(`Unexpected money string: ${amount}`)
  }
  const [, sign, intPart, centsPart = ''] = match
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  return `${sign ?? ''}${withCommas}.${centsPart.padEnd(2, '0')}`
}

function formatStatementDate(iso) {
  const [year, month, day] = iso.slice(0, 10).split('-')
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

async function expectStatus(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
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

function encodeCellId(snapshotId, fieldName) {
  return Buffer.from(`${snapshotId}:${fieldName}`, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
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

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}

function dateOnly(value) {
  return String(value).slice(0, 10)
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
