import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
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
  `prod-tax-protest-generate-${runId}`
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
  const propertyName = `[PROD-TEST] Tax Protest Package Tower ${suffix}`
  const unitNumber = `TaxPkg-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Tax Protest Tenant ${suffix}`
  const poolName = `[PROD-TEST] Tax Protest Operating ${suffix}`
  const fileName = `tax-protest-package-${suffix}.csv`
  const periods = [
    { year: 2025, periodStart: '2025-01-01', periodEnd: '2025-12-31' },
    { year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31' },
  ]
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    poolId: null,
    mappingId: null,
    batchId: null,
    jobIds: [],
    snapshotIds: [],
    periods,
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    poolName,
    fileName,
    periods,
    jobIds: created.jobIds,
    snapshotIds: created.snapshotIds,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '812 Evidence Packet Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78704',
        total_rentable_sqft: '12000.00',
        total_usable_sqft: '10800.00',
        common_area_sqft: '1200.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
        tax_protest_county: 'Travis',
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: unitNumber,
        rentable_sqft: '6000.00',
        usable_sqft: '5400.00',
        floor: 8,
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
        start_date: '2025-01-01',
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: recoveryProfile('0.50'),
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
          is_gross_up_applicable: false,
          gross_up_target: null,
          description: 'Production E2E disposable tax-protest package pool',
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
        '6100,Repairs and Maintenance,01/15/2025,1400.00,PriorCo,2025 protest baseline',
        '6100,Repairs and Maintenance,01/15/2026,1234.56,Vendor A,2026 protest repairs',
        '6150,Utilities,03/20/2026,765.44,Vendor B,2026 protest utilities',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'tax protest fixture uploads prior and current GL rows',
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

    const snapshotIdsByYear = new Map()
    await calculateAndFinalizePeriod({
      property,
      lease,
      created,
      period: periods[0],
      expected: {
        total_operating_expenses: '1400.00',
        grossed_up_expenses: '1400.00',
        tenant_share_before_cap: '700.00',
        tenant_share_after_cap: '700.00',
        total_recovery: '700.00',
      },
      snapshotIdsByYear,
    })

    await calculateAndFinalizePeriod({
      property,
      lease,
      created,
      period: periods[1],
      expected: {
        total_operating_expenses: '2000.00',
        grossed_up_expenses: '2000.00',
        tenant_share_before_cap: '1000.00',
        tenant_share_after_cap: '1000.00',
        total_recovery: '1000.00',
      },
      snapshotIdsByYear,
    })

    const currentSnapshotId = snapshotIdsByYear.get(2026)?.[0]
    report.generated.currentSnapshotId = currentSnapshotId
    const zip = await expectBinary('/api/v1/tax-protest/generate', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/zip',
      body: {
        snapshot_id: currentSnapshotId,
        tax_year: 2026,
        county: 'Travis',
        state: 'TX',
      },
    })
    const entries = parseZipEntries(zip.bytes)
    const entryNames = Object.keys(entries).sort()
    report.generated.zipSummary = {
      content_type: zip.content_type,
      content_disposition: zip.content_disposition,
      byte_length: zip.byte_length,
      entry_names: entryNames,
    }
    check(
      'tax protest generate streams expected ZIP response and entries',
      {
        content_type_zip: zip.content_type.startsWith('application/zip'),
        content_disposition_has_filename:
          zip.content_disposition.includes('tax-protest-') &&
          zip.content_disposition.includes(propertyName) &&
          zip.content_disposition.includes('-2026.zip'),
        starts_with_zip: zip.starts_with_zip,
        byte_length_gt_1000: zip.byte_length > 1000,
        entry_names: entryNames,
      },
      {
        content_type_zip: true,
        content_disposition_has_filename: true,
        starts_with_zip: true,
        byte_length_gt_1000: true,
        entry_names: [
          '01_Expense_Summary.pdf',
          '02_GL_by_Category.csv',
          '03_Year_Over_Year_Comparison.pdf',
          '04_County_Cover_Sheet.pdf',
        ],
      }
    )

    const csvText = new TextDecoder().decode(entries['02_GL_by_Category.csv'])
    const csvCoverage = glCsvCoverage(csvText, { poolName })
    report.generated.glCsvCoverage = csvCoverage
    check('tax protest GL CSV contains exact category rows', csvCoverage, {
      has_header: true,
      has_repairs_row: true,
      has_utilities_row: true,
      has_prior_year_absent: true,
      has_pool_total_2000: true,
    })

    const expenseText = await extractPdfText(entries['01_Expense_Summary.pdf'])
    const varianceText = await extractPdfText(
      entries['03_Year_Over_Year_Comparison.pdf']
    )
    const coverText = await extractPdfText(entries['04_County_Cover_Sheet.pdf'])
    const pdfCoverage = {
      expense: expenseSummaryPdfCoverage(expenseText, {
        propertyName,
        tenantName,
      }),
      variance: variancePdfCoverage(varianceText, { propertyName }),
      cover: coverSheetPdfCoverage(coverText, { propertyName }),
    }
    report.generated.pdfCoverage = pdfCoverage
    check('tax protest ZIP PDFs contain generated package facts', pdfCoverage, {
      expense: {
        has_title: true,
        has_property_name: true,
        has_tenant_name: true,
        has_period: true,
        has_total_operating_expenses: true,
        has_tenant_share_after_cap: true,
        has_total_amount_due: true,
      },
      variance: {
        has_title: true,
        has_property_name: true,
        has_years: true,
        has_current_recovery: true,
        has_prior_recovery: true,
        has_variance_percent: true,
      },
      cover: {
        has_title: true,
        has_tax_year_county_state: true,
        has_property_name: true,
        has_address: true,
        has_deadline_date: true,
        has_deadline_status: true,
        has_file_list: true,
        has_disclaimer: true,
      },
    })
  } finally {
    await cleanup(created)
  }
}

async function calculateAndFinalizePeriod({
  property,
  lease,
  created,
  period,
  expected,
  snapshotIdsByYear,
}) {
  const job = await expectJson('/api/v1/reconciliation/calculate', {
    method: 'POST',
    status: 202,
    body: {
      property_id: property.id,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      force_recalculate: true,
    },
  })
  created.jobIds.push(job.job_id)
  report.generated.jobIds = created.jobIds
  check(
    `tax protest ${period.year} reconciliation queues`,
    {
      status: job.status,
      has_job_id: typeof job.job_id === 'string' && job.job_id.length > 0,
    },
    {
      status: 'pending',
      has_job_id: true,
    }
  )

  const completed = await waitForJob(job.job_id)
  created.snapshotIds.push(...completed.snapshot_ids)
  report.generated.snapshotIds = created.snapshotIds
  snapshotIdsByYear.set(period.year, completed.snapshot_ids)
  check(
    `tax protest ${period.year} reconciliation completes one snapshot`,
    {
      status: completed.status,
      processed_leases: completed.processed_leases,
      total_leases: completed.total_leases,
      snapshot_count: completed.snapshot_ids.length,
      potential_recovery_total: completed.potential_recovery_total,
    },
    {
      status: 'completed',
      processed_leases: 1,
      total_leases: 1,
      snapshot_count: 1,
      potential_recovery_total: expected.total_recovery,
    }
  )

  const snapshot = await expectJson(
    `/api/v1/reconciliation/snapshots/${completed.snapshot_ids[0]}?include_trace=false`,
    { status: 200 }
  )
  check(
    `tax protest ${period.year} snapshot has exact deterministic recovery`,
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
    },
    {
      property_id: property.id,
      lease_id: lease.id,
      period_start_date: period.periodStart,
      period_end_date: period.periodEnd,
      status: 'draft',
      base_year_amount: '0.00',
      admin_fee: '0.00',
      ...expected,
    }
  )

  const finalize = await expectJson(
    '/api/v1/reconciliation/snapshots/finalize-batch',
    {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        period_start: period.periodStart,
        period_end: period.periodEnd,
      },
    }
  )
  const finalizedSnapshotIds = finalize.results
    .filter((result) => result.success)
    .map((result) => result.snapshot_id)
  check(
    `tax protest ${period.year} batch finalize promotes snapshot`,
    {
      total_attempted: finalize.total_attempted,
      total_succeeded: finalize.total_succeeded,
      total_failed: finalize.total_failed,
      snapshot_ids: finalizedSnapshotIds,
    },
    {
      total_attempted: 1,
      total_succeeded: 1,
      total_failed: 0,
      snapshot_ids: snapshotIdsByYear.get(period.year),
    }
  )
}

async function cleanup(created) {
  const failures = []
  if (created.propertyId) {
    if (created.mappingId) {
      await attemptCleanup(failures, 'delete tax protest pool mapping', () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`
        )
      )
    }
    if (created.poolId) {
      await attemptCleanup(
        failures,
        'verify tax protest pool mappings deleted',
        () =>
          expectNoPoolMappings({
            propertyId: created.propertyId,
            poolId: created.poolId,
          })
      )
      await attemptCleanup(failures, 'delete tax protest expense pool', () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
        )
      )
      await attemptCleanup(
        failures,
        'verify tax protest expense pool deleted',
        () =>
          expectStatus(
            `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`,
            { status: 404 }
          )
      )
    }
    await attemptCleanup(failures, 'delete tax protest property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify tax protest property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
    for (const period of created.periods) {
      await attemptCleanup(
        failures,
        `verify tax protest snapshots deleted by cascade ${period.periodStart} to ${period.periodEnd}`,
        () => expectNoSnapshots(created.propertyId, period)
      )
    }
    for (const jobId of created.jobIds) {
      await attemptCleanup(
        failures,
        `verify tax protest calculation job deleted by cascade ${jobId}`,
        () =>
          expectStatus(`/api/v1/reconciliation/jobs/${jobId}`, { status: 404 })
      )
    }
    if (created.batchId) {
      await attemptCleanup(
        failures,
        'verify tax protest ingestion batch and GL rows deleted by cascade',
        () =>
          expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
            status: 404,
          })
      )
    }
    if (created.leaseId) {
      await attemptCleanup(failures, 'verify tax protest lease deleted', () =>
        expectStatus(`/api/v1/leases/${created.leaseId}`, { status: 404 })
      )
    }
    if (created.unitId) {
      await attemptCleanup(failures, 'verify tax protest unit deleted', () =>
        expectStatus(
          `/api/v1/properties/${created.propertyId}/units/${created.unitId}`,
          { status: 404 }
        )
      )
    }
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

async function expectNoSnapshots(propertyId, period) {
  const list = await expectJson(
    `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${period.periodStart}&period_end=${period.periodEnd}&page=1&size=10`,
    { status: 200 }
  )
  const items = list.items ?? list.data ?? []
  const ok = list.total === 0 && Array.isArray(items) && items.length === 0
  report.cleanup.push({
    path: `/api/v1/reconciliation/snapshots?property_id=${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      total: list.total,
      item_count: items.length,
    }),
  })
  if (!ok) {
    throw new Error(
      `Tax protest snapshots still present after property delete: ${JSON.stringify(list).slice(0, 500)}`
    )
  }
}

async function expectNoPoolMappings({ propertyId, poolId }) {
  const list = await expectJson(
    `/api/v1/properties/${propertyId}/pool-mappings`,
    {
      status: 200,
    }
  )
  const items = list.items ?? list.data ?? []
  const matching = items.filter((item) => item.expense_pool_id === poolId)
  const ok = matching.length === 0
  report.cleanup.push({
    path: `/api/v1/properties/${propertyId}/pool-mappings?expense_pool_id=${poolId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      matching_count: matching.length,
    }),
  })
  if (!ok) {
    throw new Error(
      `Tax protest pool mappings still present after delete: ${JSON.stringify(matching).slice(0, 500)}`
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

async function expectBinary(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: options.contentTypePrefix,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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
    bytes,
    byte_length: bytes.byteLength,
    starts_with_zip:
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04,
  }
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

function glCsvCoverage(csvText, { poolName }) {
  const rows = csvText.trim().split(/\r?\n/u)
  return {
    has_header:
      rows[0] ===
      'Tax Year,Pool Name,Pool Type,Account Code,Account Description,Amount,Pool Total',
    has_repairs_row: rows.includes(
      `2026,${poolName},operating,6100,Repairs and Maintenance,1234.56,2000.00`
    ),
    has_utilities_row: rows.includes(
      `2026,${poolName},operating,6150,Utilities,765.44,2000.00`
    ),
    has_prior_year_absent: !csvText.includes('2025,'),
    has_pool_total_2000: rows.slice(1).every((row) => row.endsWith(',2000.00')),
  }
}

function expenseSummaryPdfCoverage(text, { propertyName, tenantName }) {
  const normalized = normalizeReportText(text)
  return {
    has_title: normalized.includes('tenant reconciliation statement'),
    has_property_name: normalized.includes(normalizeReportText(propertyName)),
    has_tenant_name: normalized.includes(normalizeReportText(tenantName)),
    has_period: normalized.includes(
      'period: january 1, 2026 - december 31, 2026'
    ),
    has_total_operating_expenses:
      normalized.includes('total operating expenses') &&
      normalized.includes('$2,000.00'),
    has_tenant_share_after_cap:
      normalized.includes('tenant share (after cap)') &&
      normalized.includes('$1,000.00'),
    has_total_amount_due:
      normalized.includes('total amount due') &&
      normalized.includes('$1,000.00'),
  }
}

function variancePdfCoverage(text, { propertyName }) {
  const normalized = normalizeReportText(text)
  return {
    has_title: normalized.includes('statement check report'),
    has_property_name: normalized.includes(normalizeReportText(propertyName)),
    has_years: normalized.includes('2026 vs 2025'),
    has_current_recovery: normalized.includes('$1,000.00'),
    has_prior_recovery: normalized.includes('$700.00'),
    has_variance_percent: normalized.includes('42.86%'),
  }
}

function coverSheetPdfCoverage(text, { propertyName }) {
  const normalized = normalizeReportText(text)
  return {
    has_title: normalized.includes('tax protest data package'),
    has_tax_year_county_state:
      normalized.includes('tax year 2026') &&
      normalized.includes('travis county') &&
      normalized.includes('tx'),
    has_property_name: normalized.includes(normalizeReportText(propertyName)),
    has_address: normalized.includes(
      '812 evidence packet way, austin, tx 78704'
    ),
    has_deadline_date: normalized.includes('filing deadline: may 15, 2026'),
    has_deadline_status:
      normalized.includes('deadline passed') ||
      normalized.includes('deadline is today') ||
      normalized.includes('days remaining'),
    has_file_list:
      normalized.includes('01_expense_summary.pdf') &&
      normalized.includes('02_gl_by_category.csv') &&
      normalized.includes('03_year_over_year_comparison.pdf') &&
      normalized.includes('04_county_cover_sheet.pdf'),
    has_disclaimer:
      normalized.includes('accuracy disclaimer') &&
      normalized.includes(
        'does not constitute legal, tax, or appraisal advice'
      ),
  }
}

function parseZipEntries(bytes) {
  const eocdOffset = findEndOfCentralDirectory(bytes)
  const entryCount = readUInt16LE(bytes, eocdOffset + 10)
  let offset = readUInt32LE(bytes, eocdOffset + 16)
  const entries = {}
  const decoder = new TextDecoder()
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32LE(bytes, offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry at ${offset}`)
    }
    const compressionMethod = readUInt16LE(bytes, offset + 10)
    const compressedSize = readUInt32LE(bytes, offset + 20)
    const nameLength = readUInt16LE(bytes, offset + 28)
    const extraLength = readUInt16LE(bytes, offset + 30)
    const commentLength = readUInt16LE(bytes, offset + 32)
    const localHeaderOffset = readUInt32LE(bytes, offset + 42)
    const nameStart = offset + 46
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength))
    if (readUInt32LE(bytes, localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local file header for ${name}`)
    }
    const localNameLength = readUInt16LE(bytes, localHeaderOffset + 26)
    const localExtraLength = readUInt16LE(bytes, localHeaderOffset + 28)
    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)
    if (compressionMethod === 0) {
      entries[name] = Buffer.from(compressed)
    } else if (compressionMethod === 8) {
      entries[name] = inflateRawSync(Buffer.from(compressed))
    } else {
      throw new Error(
        `Unsupported ZIP compression method ${compressionMethod} for ${name}`
      )
    }
    offset = nameStart + nameLength + extraLength + commentLength
  }
  return entries
}

function findEndOfCentralDirectory(bytes) {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readUInt32LE(bytes, offset) === 0x06054b50) return offset
  }
  throw new Error('ZIP end of central directory not found')
}

function readUInt16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUInt32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  )
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

function recoveryProfile(proRataShare) {
  return {
    base_year: null,
    base_year_amount: '0.00',
    gross_up_base_year: false,
    pro_rata_share: proRataShare,
    cap_type: 'none',
    cap_rate: null,
    admin_fee_percentage: '0',
    management_fee_percentage: '0',
    excluded_pools: [],
    base_year_adjustments: [],
  }
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

function stableJson(value) {
  return JSON.stringify(sortForJson(value))
}

function sortForJson(value) {
  if (Array.isArray(value)) return value.map(sortForJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, inner]) => [key, sortForJson(inner)])
  )
}

function normalizeReportText(value) {
  return String(value).toLowerCase().replace(/\s+/gu, ' ').trim()
}

function dateOnly(value) {
  return String(value).slice(0, 10)
}

function trimSlash(value) {
  return value.trim().replace(/\/+$/u, '')
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function readEnv(path) {
  try {
    const text = await readFile(path, 'utf8')
    return Object.fromEntries(
      text
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const idx = line.indexOf('=')
          const key = line.slice(0, idx).trim()
          const value = line
            .slice(idx + 1)
            .trim()
            .replace(/^['"]|['"]$/gu, '')
          return [key, value]
        })
    )
  } catch {
    return {}
  }
}
