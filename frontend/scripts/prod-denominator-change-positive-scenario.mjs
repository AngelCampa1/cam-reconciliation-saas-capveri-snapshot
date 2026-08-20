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
  `prod-denominator-change-positive-${runId}`
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
  const propertyName = `[PROD-TEST] Denominator Change Tower ${suffix}`
  const unitNumber = `Denom-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Denominator Tenant ${suffix}`
  const poolName = `[PROD-TEST] Denominator Operating ${suffix}`
  const fileName = `yardi-denominator-change-${suffix}.csv`
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
    periodStart: periods[0].periodStart,
    periodEnd: periods[1].periodEnd,
    jobIds: created.jobIds,
    snapshotIds: created.snapshotIds,
    periods,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '711 Prod Denominator Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78710',
        total_rentable_sqft: '12000.00',
        total_usable_sqft: '10800.00',
        common_area_sqft: '1200.00',
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
        rentable_sqft: '6000.00',
        usable_sqft: '5400.00',
        floor: 7,
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
          description: 'Production E2E disposable denominator-change pool',
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
        '6100,Common Area Maintenance,01/15/2025,2000.00,DenomCo,2025 recoverable costs',
        '6100,Common Area Maintenance,01/15/2026,3000.00,DenomCo,2026 recoverable costs',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'denominator fixture uploads two annual GL rows',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 2,
        error_count: 0,
      }
    )

    const expectedByYear = new Map([
      [
        2025,
        {
          total_operating_expenses: '2000.00',
          grossed_up_expenses: '2000.00',
          tenant_share_before_cap: '1000.00',
          tenant_share_after_cap: '1000.00',
          total_recovery: '1000.00',
        },
      ],
      [
        2026,
        {
          total_operating_expenses: '3000.00',
          grossed_up_expenses: '3000.00',
          tenant_share_before_cap: '1800.00',
          tenant_share_after_cap: '1800.00',
          total_recovery: '1800.00',
        },
      ],
    ])
    const snapshotIdsByYear = new Map()

    await calculateAndFinalizePeriod({
      property,
      lease,
      created,
      period: periods[0],
      expected: expectedByYear.get(2025),
      snapshotIdsByYear,
    })

    const updatedLease = await expectJson(
      `/api/v1/leases/${lease.id}/recovery-profile`,
      {
        method: 'PUT',
        status: 200,
        body: recoveryProfile('0.60'),
      }
    )
    check(
      'denominator fixture updates lease pro-rata share before current period',
      {
        id: updatedLease.id,
        pro_rata_share: updatedLease.recovery_profile?.pro_rata_share,
      },
      { id: lease.id, pro_rata_share: '0.60' }
    )

    await calculateAndFinalizePeriod({
      property,
      lease,
      created,
      period: periods[1],
      expected: expectedByYear.get(2026),
      snapshotIdsByYear,
    })

    const denominatorBody = {
      property_id: property.id,
      prior_period_start: periods[0].periodStart,
      prior_period_end: periods[0].periodEnd,
      current_period_start: periods[1].periodStart,
      current_period_end: periods[1].periodEnd,
      prior_total_rsf: '10000',
      current_total_rsf: '12000',
    }

    const reportJson = await expectJson('/api/v1/analysis/denominator-change', {
      method: 'POST',
      status: 200,
      body: denominatorBody,
    })
    const changeTypes = reportJson.changes.map((change) => change.change_type)
    const impact = reportJson.tenant_impacts.find(
      (tenantImpact) => tenantImpact.lease_id === lease.id
    )
    check(
      'denominator JSON reports RSF and share changes with tenant impact',
      {
        property_id: reportJson.property_id,
        comparison_available: reportJson.comparison_available,
        missing_period: reportJson.missing_period,
        prior_total_rsf: reportJson.prior_total_rsf,
        current_total_rsf: reportJson.current_total_rsf,
        rsf_delta: reportJson.rsf_delta,
        rsf_delta_percent: reportJson.rsf_delta_percent,
        change_types: changeTypes.sort(),
        tenant_impact_count: reportJson.tenant_impacts.length,
        impact: impact
          ? {
              tenant_name: impact.tenant_name,
              prior_pro_rata_share: impact.prior_pro_rata_share,
              current_pro_rata_share: impact.current_pro_rata_share,
              share_delta_pct_points: impact.share_delta_pct_points,
              prior_estimated_recovery: impact.prior_estimated_recovery,
              current_estimated_recovery: impact.current_estimated_recovery,
              recovery_delta: impact.recovery_delta,
              contributing_changes: [...impact.contributing_changes].sort(),
            }
          : null,
      },
      {
        property_id: property.id,
        comparison_available: true,
        missing_period: null,
        prior_total_rsf: '10000',
        current_total_rsf: '12000',
        rsf_delta: '2000',
        rsf_delta_percent: '20',
        change_types: ['rsf_remeasurement', 'share_recalculation'],
        tenant_impact_count: 1,
        impact: {
          tenant_name: tenantName,
          prior_pro_rata_share: '0.5',
          current_pro_rata_share: '0.6',
          share_delta_pct_points: '10',
          prior_estimated_recovery: '1000',
          current_estimated_recovery: '1800',
          recovery_delta: '800',
          contributing_changes: ['rsf_remeasurement', 'share_recalculation'],
        },
      }
    )
    check(
      'denominator JSON summary references total RSF and affected tenant',
      {
        has_rsf_change: reportJson.summary.includes(
          'Total RSF changed from 10,000 to 12,000'
        ),
        has_change_count: reportJson.summary.includes(
          '2 denominator changes detected'
        ),
        has_tenant_count: reportJson.summary.includes('1 tenant affected'),
      },
      {
        has_rsf_change: true,
        has_change_count: true,
        has_tenant_count: true,
      }
    )

    const pdf = await expectBinary('/api/v1/reports/denominator-change/pdf', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/pdf',
      body: denominatorBody,
    })
    const pdfText = await extractPdfText(pdf.bytes)
    const pdfTextCoverage = denominatorPdfTextCoverage(pdfText, {
      propertyName,
      tenantName,
      reportJson,
    })
    report.generated.pdfTextCoverage = pdfTextCoverage
    check(
      'denominator PDF streams non-persistent PDF bytes',
      {
        starts_with_pdf: pdf.starts_with_pdf,
        byte_length_gt_1000: pdf.byte_length > 1000,
        content_disposition_has_filename:
          pdf.content_disposition.includes('denominator_change_') &&
          pdf.content_disposition.includes(property.id) &&
          pdf.content_disposition.includes('2026-01-01_2026-12-31.pdf'),
      },
      {
        starts_with_pdf: true,
        byte_length_gt_1000: true,
        content_disposition_has_filename: true,
      }
    )
    check(
      'denominator PDF body contains generated denominator-change facts',
      pdfTextCoverage,
      {
        has_title: true,
        has_property_name: true,
        has_prior_period: true,
        has_current_period: true,
        has_summary_rsf_change: true,
        has_summary_change_count: true,
        has_summary_tenant_count: true,
        has_total_rsf_label: true,
        has_prior_total_rsf: true,
        has_current_total_rsf: true,
        has_rsf_delta_and_percent: true,
        has_rsf_remeasurement_change: true,
        has_share_recalculation_change: true,
        has_tenant_name: true,
        has_prior_share_percent: true,
        has_current_share_percent: true,
        has_share_delta_points: true,
        has_prior_recovery: true,
        has_current_recovery: true,
        has_recovery_delta: true,
        has_tenant_impact_row_ordered: true,
        has_footer: true,
      }
    )

    const history = await expectJson(
      `/api/v1/export/history?property_id=${property.id}&page=1&page_size=10`,
      { status: 200 }
    )
    const historyItems = history.items ?? history.data ?? []
    check(
      'denominator report routes do not create export history rows',
      {
        total: history.total,
        item_count: historyItems.length,
      },
      {
        total: 0,
        item_count: 0,
      }
    )
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
  report.generated.jobId = created.jobIds[0]
  report.generated.jobIds = created.jobIds
  check(
    `denominator ${period.year} reconciliation queues`,
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
    `denominator ${period.year} reconciliation completes one snapshot`,
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
    `denominator ${period.year} snapshot has exact deterministic recovery`,
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
    `denominator ${period.year} batch finalize promotes snapshot`,
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

async function cleanup(created) {
  const failures = []
  if (created.propertyId) {
    if (created.mappingId) {
      await attemptCleanup(failures, 'delete pool mapping', () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`
        )
      )
    }
    if (created.poolId) {
      await attemptCleanup(failures, 'verify pool mappings deleted', () =>
        expectNoPoolMappings({
          propertyId: created.propertyId,
          poolId: created.poolId,
        })
      )
      await attemptCleanup(failures, 'delete expense pool', () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
        )
      )
      await attemptCleanup(failures, 'verify expense pool deleted', () =>
        expectStatus(
          `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`,
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
    for (const period of created.periods) {
      await attemptCleanup(
        failures,
        `verify snapshots deleted by cascade ${period.periodStart} to ${period.periodEnd}`,
        () => expectNoSnapshots(created.propertyId, period)
      )
    }
    for (const jobId of created.jobIds) {
      await attemptCleanup(
        failures,
        `verify calculation job deleted by cascade ${jobId}`,
        () =>
          expectStatus(`/api/v1/reconciliation/jobs/${jobId}`, {
            status: 404,
          })
      )
    }
    if (created.batchId) {
      await attemptCleanup(
        failures,
        'verify ingestion batch and imported GL rows deleted by cascade',
        () =>
          expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
            status: 404,
          })
      )
    }
    if (created.leaseId) {
      await attemptCleanup(failures, 'verify lease deleted', () =>
        expectStatus(`/api/v1/leases/${created.leaseId}`, { status: 404 })
      )
    }
    if (created.unitId) {
      await attemptCleanup(failures, 'verify unit deleted', () =>
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
      `Snapshots still present after property delete: ${JSON.stringify(list).slice(0, 500)}`
    )
  }
}

async function expectNoPoolMappings({ propertyId, poolId }) {
  const list = await expectJson(
    `/api/v1/properties/${propertyId}/pool-mappings`,
    { status: 200 }
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
      `Pool mappings still present after delete: ${JSON.stringify(matching).slice(0, 500)}`
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
    starts_with_pdf: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
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

function denominatorPdfTextCoverage(
  text,
  { propertyName, tenantName, reportJson }
) {
  const normalized = normalizeReportText(text)
  const impact = reportJson.tenant_impacts.find(
    (tenantImpact) => tenantImpact.tenant_name === tenantName
  )
  const tenantImpactTokens = impact
    ? [
        tenantName,
        '50.00%',
        '60.00%',
        '+10.00',
        formatExactMoneyToken(impact.prior_estimated_recovery),
        formatExactMoneyToken(impact.current_estimated_recovery),
        formatExactMoneyToken(impact.recovery_delta, { signed: true }),
      ]
    : []
  return {
    has_title: normalized.includes('denominator change audit report'),
    has_property_name: normalized.includes(normalizeReportText(propertyName)),
    has_prior_period: normalized.includes(
      normalizeReportText(reportJson.prior_period)
    ),
    has_current_period: normalized.includes(
      normalizeReportText(reportJson.current_period)
    ),
    has_summary_rsf_change: normalized.includes(
      'total rsf changed from 10,000 to 12,000'
    ),
    has_summary_change_count: normalized.includes(
      '2 denominator changes detected'
    ),
    has_summary_tenant_count: normalized.includes('1 tenant affected'),
    has_total_rsf_label: normalized.includes('total rsf'),
    has_prior_total_rsf: normalized.includes('10,000'),
    has_current_total_rsf: normalized.includes('12,000'),
    has_rsf_delta_and_percent:
      normalized.includes('+2,000') && normalized.includes('+20.00%'),
    has_rsf_remeasurement_change: normalized.includes('rsf remeasurement'),
    has_share_recalculation_change: normalized.includes('share recalculation'),
    has_tenant_name: normalized.includes(normalizeReportText(tenantName)),
    has_prior_share_percent: normalized.includes('50.00%'),
    has_current_share_percent: normalized.includes('60.00%'),
    has_share_delta_points: normalized.includes('+10.00'),
    has_prior_recovery: impact
      ? hasMoneyToken(
          normalized,
          formatExactMoneyToken(impact.prior_estimated_recovery)
        )
      : false,
    has_current_recovery: impact
      ? hasMoneyToken(
          normalized,
          formatExactMoneyToken(impact.current_estimated_recovery)
        )
      : false,
    has_recovery_delta: impact
      ? hasMoneyToken(
          normalized,
          formatExactMoneyToken(impact.recovery_delta, {
            signed: true,
          })
        )
      : false,
    has_tenant_impact_row_ordered:
      tenantImpactTokens.length > 0 &&
      hasOrderedWindow(normalized, tenantImpactTokens, 450),
    has_footer:
      normalized.includes('generated by capveri') &&
      normalized.includes(
        'verify all numbers against your lease and source gl'
      ),
  }
}

function normalizeReportText(value) {
  return String(value).toLowerCase().replace(/\s+/gu, ' ').trim()
}

function hasMoneyToken(normalizedText, moneyToken) {
  return normalizedText.includes(normalizeReportText(moneyToken))
}

function hasOrderedWindow(normalizedText, tokens, maxWindowLength) {
  const normalizedTokens = tokens.map(normalizeReportText)
  const startIndex = normalizedText.indexOf(normalizedTokens[0])
  if (startIndex === -1) return false
  let cursor = startIndex
  for (const token of normalizedTokens) {
    const nextIndex = normalizedText.indexOf(token, cursor)
    if (nextIndex === -1) return false
    if (nextIndex - startIndex > maxWindowLength) return false
    cursor = nextIndex + token.length
  }
  return true
}

function formatExactMoneyToken(amount, options = {}) {
  const raw = String(amount).trim()
  const negative = raw.startsWith('-')
  const unsigned = raw.replace(/^[+-]/u, '')
  const centsTotal = roundDecimalStringToCents(unsigned)
  const dollars = String(centsTotal / 100n)
  const cents = String(centsTotal % 100n).padStart(2, '0')
  const withCommas = dollars.replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  if (negative) return `-$${withCommas}.${cents}`
  const prefix = options.signed ? '+$' : '$'
  return `${prefix}${withCommas}.${cents}`
}

function roundDecimalStringToCents(unsignedAmount) {
  const [dollarsRaw = '0', fractionRaw = ''] = unsignedAmount.split('.')
  const dollarsDigits = dollarsRaw.replace(/\D/gu, '') || '0'
  const fractionDigits = fractionRaw.replace(/\D/gu, '')
  const centDigits = `${fractionDigits}00`.slice(0, 2)
  const remainderDigits = fractionDigits.slice(2)
  let centsTotal = BigInt(dollarsDigits) * 100n + BigInt(centDigits)
  if (!remainderDigits) return centsTotal

  const remainder = BigInt(remainderDigits)
  const halfway = 5n * 10n ** BigInt(remainderDigits.length - 1)
  if (
    remainder > halfway ||
    (remainder === halfway && centsTotal % 2n === 1n)
  ) {
    centsTotal += 1n
  }
  return centsTotal
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
