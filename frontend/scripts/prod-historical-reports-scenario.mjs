import { execFile } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')
const execFileAsync = promisify(execFile)

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
const reportsR2Bucket =
  env.E2E_PROD_REPORTS_R2_BUCKET?.trim() || 'capveri-reports'
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-historical-reports-${runId}`
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

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Historical Report Tower ${suffix}`
  const fileName = `yardi-historical-report-${suffix}.csv`
  const created = {
    propertyId: null,
    unitIds: [],
    leaseIds: [],
    poolIds: [],
    mappingIds: [],
    batchId: null,
    jobIds: [],
    snapshotIds: [],
    exportStoragePaths: [],
    periods: [
      { periodStart: '2025-01-01', periodEnd: '2025-12-31' },
      { periodStart: '2026-01-01', periodEnd: '2026-12-31' },
    ],
  }
  report.generated = {
    propertyName,
    fileName,
    periodStart: '2025-01-01',
    periodEnd: '2026-12-31',
    propertyId: null,
    unitIds: created.unitIds,
    leaseIds: created.leaseIds,
    poolIds: created.poolIds,
    mappingIds: created.mappingIds,
    batchId: null,
    jobId: null,
    jobIds: created.jobIds,
    snapshotIds: created.snapshotIds,
    exportStoragePaths: created.exportStoragePaths,
    periods: created.periods,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '910 Prod Historical Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78709',
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
        unit_number: `Hist-${suffix.toUpperCase()}`,
        rentable_sqft: '12000.00',
        usable_sqft: '10800.00',
        floor: 9,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitIds.push(unit.id)
    report.generated.unitIds = created.unitIds

    const lease = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: `[PROD-TEST] Historical Tenant ${suffix}`,
        start_date: '2025-01-01',
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: {
          base_year: 2024,
          base_year_amount: '0.00',
          gross_up_base_year: false,
          pro_rata_share: '1.00',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0',
          management_fee_percentage: '0',
          excluded_pools: [],
          base_year_adjustments: [],
        },
      },
    })
    created.leaseIds.push(lease.id)
    report.generated.leaseIds = created.leaseIds

    const poolInputs = [
      {
        key: 'cleaning',
        name: `[PROD-TEST] Historical Cleaning ${suffix}`,
        pool_type: 'operating',
        pattern: '61*',
        priority: 30,
      },
      {
        key: 'security',
        name: `[PROD-TEST] Historical Security ${suffix}`,
        pool_type: 'operating',
        pattern: '62*',
        priority: 20,
      },
      {
        key: 'insurance',
        name: `[PROD-TEST] Historical Insurance ${suffix}`,
        pool_type: 'insurance',
        pattern: '63*',
        priority: 10,
      },
    ]
    const poolsByKey = new Map()
    for (const poolInput of poolInputs) {
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
            description: `Production E2E historical ${poolInput.key} pool`,
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
            priority: poolInput.priority,
          },
        }
      )
      created.mappingIds.push(mapping.id)
    }
    report.generated.poolIds = created.poolIds
    report.generated.mappingIds = created.mappingIds

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Cleaning,01/15/2025,1000.00,CleanCo,2025 cleaning',
        '6200,Security,02/15/2025,2000.00,SecureCo,2025 security',
        '6100,Cleaning,01/15/2026,1500.00,CleanCo,2026 cleaning',
        '6200,Security,02/15/2026,2400.00,SecureCo,2026 security',
        '6300,Insurance,03/15/2026,600.00,InsureCo,2026 insurance',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'historical Yardi GL batch creates deterministic two-year rows',
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

    const expectedByYear = new Map([
      [
        2025,
        {
          total_operating_expenses: '3000.00',
          grossed_up_expenses: '3000.00',
          tenant_share_before_cap: '3000.00',
          tenant_share_after_cap: '3000.00',
          total_recovery: '3000.00',
        },
      ],
      [
        2026,
        {
          total_operating_expenses: '4500.00',
          grossed_up_expenses: '4500.00',
          tenant_share_before_cap: '4500.00',
          tenant_share_after_cap: '4500.00',
          total_recovery: '4500.00',
        },
      ],
    ])
    const snapshotIdsByYear = new Map()

    for (const year of [2025, 2026]) {
      const periodStart = `${year}-01-01`
      const periodEnd = `${year}-12-31`
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
      created.jobIds.push(job.job_id)
      report.generated.jobId = created.jobIds[0]
      report.generated.jobIds = created.jobIds
      check(
        `historical ${year} reconciliation queues`,
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
      snapshotIdsByYear.set(year, completed.snapshot_ids)
      report.generated.snapshotIds = created.snapshotIds
      check(
        `historical ${year} reconciliation completes one snapshot`,
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
          potential_recovery_total: expectedByYear.get(year).total_recovery,
        }
      )

      const snapshot = await expectJson(
        `/api/v1/reconciliation/snapshots/${completed.snapshot_ids[0]}?include_trace=false`,
        { status: 200 }
      )
      check(
        `historical ${year} snapshot has exact deterministic recovery`,
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
          period_start_date: periodStart,
          period_end_date: periodEnd,
          status: 'draft',
          base_year_amount: '0.00',
          admin_fee: '0.00',
          ...expectedByYear.get(year),
        }
      )
    }

    for (const year of [2025, 2026]) {
      const periodStart = `${year}-01-01`
      const periodEnd = `${year}-12-31`
      const finalize = await expectJson(
        '/api/v1/reconciliation/snapshots/finalize-batch',
        {
          method: 'POST',
          status: 200,
          body: {
            property_id: property.id,
            period_start: periodStart,
            period_end: periodEnd,
          },
        }
      )
      const finalizedSnapshotIds = finalize.results
        .filter((result) => result.success)
        .map((result) => result.snapshot_id)
      check(
        `historical ${year} batch finalize promotes the annual snapshot`,
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
          snapshot_ids: snapshotIdsByYear.get(year),
        }
      )
    }

    const availableYears = await expectJson(
      `/api/v1/analysis/properties/${property.id}/available-years`,
      { status: 200 }
    )
    check('historical finalized years are listed', availableYears, [2025, 2026])

    const yoy = await expectJson('/api/v1/analysis/year-over-year', {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        years: [2025, 2026],
        use_fuzzy_matching: true,
      },
    })
    check(
      'historical year over year comparison returns deterministic totals',
      {
        property_id: yoy.property_id,
        years: yoy.years,
        total_amounts: yoy.total_amounts,
        total_variance_amount: yoy.total_variance_amount,
        total_variance_percent: yoy.total_variance_percent,
      },
      {
        property_id: property.id,
        years: [2025, 2026],
        total_amounts: { 2025: '3000', 2026: '4500' },
        total_variance_amount: '1500',
        total_variance_percent: '50',
      }
    )

    const pdfResponse = await expectJson('/api/v1/reports/historical/pdf', {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        years: [2026, 2025],
        include_charts: true,
      },
    })
    const pdfTokenPayload = decodeExportTokenPayload(pdfResponse.report_url)
    const pdfStoragePath = `r2:${pdfTokenPayload.r2Key}`
    created.exportStoragePaths.push(pdfStoragePath)
    report.generated.exportStoragePath = pdfStoragePath
    report.generated.exportStoragePaths = created.exportStoragePaths
    check(
      'historical PDF report returns signed token URL without export history',
      {
        format: pdfResponse.format,
        has_expires_at:
          typeof pdfResponse.expires_at === 'string' &&
          pdfResponse.expires_at.length > 0,
        token_file_name: pdfTokenPayload.fileName,
        token_key_prefix: pdfTokenPayload.r2Key.startsWith('reports/'),
        token_key_contains_property: pdfTokenPayload.r2Key.includes(
          `/${property.id}/`
        ),
      },
      {
        format: 'pdf',
        has_expires_at: true,
        token_file_name: `historical_analysis_${property.id}.pdf`,
        token_key_prefix: true,
        token_key_contains_property: true,
      }
    )

    const downloadedPdf = await expectAbsoluteBinary(pdfResponse.report_url, {
      status: 200,
      contentTypePrefix: 'application/pdf',
    })
    check(
      'historical PDF token downloads generated PDF bytes',
      {
        starts_with_pdf: downloadedPdf.starts_with_pdf,
        byte_length_gt_1000: downloadedPdf.byte_length > 1000,
        content_disposition_has_filename:
          downloadedPdf.content_disposition.includes(
            `historical_analysis_${property.id}.pdf`
          ),
      },
      {
        starts_with_pdf: true,
        byte_length_gt_1000: true,
        content_disposition_has_filename: true,
      }
    )
    const pdfText = await extractPdfText(downloadedPdf.bytes)
    check(
      'historical PDF body contains generated report facts',
      historicalReportTextCoverage(pdfText, {
        propertyName,
        years: ['2025', '2026'],
        amounts: ['3000', '4500', '1500', '50'],
        pools: ['Cleaning', 'Security', 'Insurance'],
      }),
      {
        has_property_name: true,
        has_cleaning: true,
        has_security: true,
        has_insurance: true,
        has_2025: true,
        has_2026: true,
        has_3000_total: true,
        has_4500_total: true,
        has_1500_variance: true,
        has_50_percent_variance: true,
      }
    )

    const xlsx = await expectBinary('/api/v1/reports/historical/excel', {
      method: 'POST',
      status: 200,
      contentTypePrefix:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: {
        property_id: property.id,
        years: [2026, 2025],
        include_charts: false,
      },
    })
    const xlsxEntries = parseZipEntryNames(xlsx.bytes)
    check(
      'historical XLSX export streams workbook ZIP bytes',
      {
        starts_with_zip: xlsx.starts_with_zip,
        byte_length_gt_1000: xlsx.byte_length > 1000,
        has_workbook: xlsxEntries.includes('xl/workbook.xml'),
        has_worksheets: xlsxEntries.some((entry) =>
          entry.startsWith('xl/worksheets/')
        ),
        content_disposition_has_year_range:
          xlsx.content_disposition.includes(property.id) &&
          xlsx.content_disposition.includes('2025-2026.xlsx'),
      },
      {
        starts_with_zip: true,
        byte_length_gt_1000: true,
        has_workbook: true,
        has_worksheets: true,
        content_disposition_has_year_range: true,
      }
    )
    const xlsxText = extractXlsxText(xlsx.bytes)
    check(
      'historical XLSX workbook body contains generated report facts',
      historicalReportTextCoverage(xlsxText, {
        propertyName,
        years: ['2025', '2026'],
        amounts: ['3000', '4500', '1500', '50'],
        pools: ['Cleaning', 'Security', 'Insurance'],
      }),
      {
        has_property_name: true,
        has_cleaning: true,
        has_security: true,
        has_insurance: true,
        has_2025: true,
        has_2026: true,
        has_3000_total: true,
        has_4500_total: true,
        has_1500_variance: true,
        has_50_percent_variance: true,
      }
    )

    const history = await expectJson(
      `/api/v1/export/history?property_id=${property.id}&page=1&page_size=10`,
      { status: 200 }
    )
    const historyItems = history.items ?? history.data ?? []
    check(
      'historical report routes do not create export history rows',
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
  for (const exportStoragePath of created.exportStoragePaths) {
    await attemptCleanup(
      failures,
      `delete historical PDF R2 object ${exportStoragePath}`,
      () => deleteReportR2Object(exportStoragePath)
    )
    await attemptCleanup(
      failures,
      `verify historical PDF R2 object deleted ${exportStoragePath}`,
      () => expectReportR2ObjectMissing(exportStoragePath)
    )
  }
  if (created.propertyId) {
    for (const mappingId of created.mappingIds) {
      await attemptCleanup(failures, `delete pool mapping ${mappingId}`, () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/pool-mappings/${mappingId}`
        )
      )
    }
    for (const poolId of created.poolIds) {
      await attemptCleanup(
        failures,
        `verify pool mappings deleted for pool ${poolId}`,
        () =>
          expectNoPoolMappings({
            propertyId: created.propertyId,
            poolId,
          })
      )
    }
    for (const poolId of created.poolIds) {
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
    for (const leaseId of created.leaseIds) {
      await attemptCleanup(failures, `verify lease deleted ${leaseId}`, () =>
        expectStatus(`/api/v1/leases/${leaseId}`, { status: 404 })
      )
    }
    for (const unitId of created.unitIds) {
      await attemptCleanup(failures, `verify unit deleted ${unitId}`, () =>
        expectStatus(
          `/api/v1/properties/${created.propertyId}/units/${unitId}`,
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

async function deleteReportR2Object(storagePath) {
  if (!storagePath.startsWith('r2:')) {
    throw new Error(`Expected R2 storage path, got ${storagePath}`)
  }
  const objectPath = `${reportsR2Bucket}/${storagePath.slice(3)}`
  await execFileAsync(
    npxBinary(),
    ['wrangler', 'r2', 'object', 'delete', objectPath, '--remote', '--force'],
    {
      cwd: frontendRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      shell: process.platform === 'win32',
      timeout: 60_000,
    }
  )
  report.cleanup.push({
    path: `r2://${objectPath}`,
    status: 204,
    ok: true,
    body_preview: 'deleted historical token-only report object',
  })
}

async function expectReportR2ObjectMissing(storagePath) {
  if (!storagePath.startsWith('r2:')) {
    throw new Error(`Expected R2 storage path, got ${storagePath}`)
  }
  const objectPath = `${reportsR2Bucket}/${storagePath.slice(3)}`
  const result = await getR2Object(objectPath)
  const ok = result.missing === true
  report.cleanup.push({
    path: `r2://${objectPath}`,
    status: ok ? 404 : 200,
    ok,
    body_preview: ok
      ? 'object missing'
      : `object still present (${result.byteLength} bytes)`,
  })
  if (!ok) {
    throw new Error(`R2 object still existed after delete: ${objectPath}`)
  }
}

async function getR2Object(objectPath) {
  try {
    const { stdout } = await execFileAsync(
      npxBinary(),
      ['wrangler', 'r2', 'object', 'get', objectPath, '--remote', '--pipe'],
      {
        cwd: frontendRoot,
        encoding: null,
        maxBuffer: 1024 * 1024,
        shell: process.platform === 'win32',
        timeout: 60_000,
      }
    )
    return { missing: false, byteLength: stdout.byteLength }
  } catch (error) {
    const stderr = bufferToString(error.stderr)
    if (stderr.includes('The specified key does not exist')) {
      return { missing: true, byteLength: 0 }
    }
    throw new Error(
      `R2 get failed for ${objectPath}: ${stderr || errorMessage(error)}`
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
    byte_length: bytes.byteLength,
    starts_with_pdf: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
    starts_with_zip: bytes[0] === 0x50 && bytes[1] === 0x4b,
    bytes,
  }
}

async function expectAbsoluteBinary(url, options) {
  const response = await fetch(url, {
    headers: { accept: options.contentTypePrefix },
  })
  const bytes = new Uint8Array(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status !== options.status) {
    throw new Error(
      `GET ${redactSensitiveUrl(url)} returned ${response.status}, expected ${options.status}: ${new TextDecoder().decode(bytes.slice(0, 500))}`
    )
  }
  if (!contentType.startsWith(options.contentTypePrefix)) {
    throw new Error(
      `GET ${redactSensitiveUrl(url)} returned content-type ${contentType}, expected ${options.contentTypePrefix}`
    )
  }
  return {
    status: response.status,
    content_type: contentType,
    content_disposition: response.headers.get('content-disposition') ?? '',
    byte_length: bytes.byteLength,
    starts_with_pdf: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
    starts_with_zip: bytes[0] === 0x50 && bytes[1] === 0x4b,
    bytes,
  }
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
    organization_id: json.user?.user_metadata?.organization_id ?? null,
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

function decodeExportTokenPayload(reportUrl) {
  const url = new URL(reportUrl)
  const tokenParam = url.searchParams.get('token')
  if (!tokenParam)
    throw new Error('Historical report URL did not include token')
  const [encodedPayload] = tokenParam.split('.')
  if (!encodedPayload) throw new Error('Historical report token was malformed')
  const payload = JSON.parse(
    Buffer.from(base64UrlToBase64(encodedPayload), 'base64').toString('utf8')
  )
  if (
    typeof payload.r2Key !== 'string' ||
    typeof payload.fileName !== 'string' ||
    typeof payload.expiresAt !== 'number'
  ) {
    throw new Error(`Historical report token payload malformed: ${payload}`)
  }
  return payload
}

function base64UrlToBase64(value) {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/')
  return `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`
}

function parseZipEntryNames(bytes) {
  return Object.keys(parseZipEntries(bytes))
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
  const minimumOffset = Math.max(0, bytes.length - 65_557)
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUInt32LE(bytes, offset) === 0x06054b50) return offset
  }
  throw new Error('ZIP end of central directory not found')
}

function readUInt16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUInt32LE(bytes, offset) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

async function extractPdfText(bytes) {
  const loadingTask = getDocument({
    data: bytes,
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

function extractXlsxText(bytes) {
  const entries = parseZipEntries(bytes)
  const texts = []
  for (const [name, content] of Object.entries(entries)) {
    if (!name.endsWith('.xml')) continue
    const xml = new TextDecoder().decode(content)
    texts.push(xmlTextContent(xml))
  }
  return texts.join('\n')
}

function xmlTextContent(xml) {
  const values = []
  for (const match of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)) {
    values.push(decodeXmlEntities(match[1]))
  }
  for (const match of xml.matchAll(/<v[^>]*>([\s\S]*?)<\/v>/gu)) {
    values.push(decodeXmlEntities(match[1]))
  }
  return values.join(' ')
}

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&')
}

function historicalReportTextCoverage(text, expected) {
  const normalized = normalizeReportText(text)
  return {
    has_property_name: normalized.includes(
      normalizeReportText(expected.propertyName)
    ),
    has_cleaning: normalized.includes(normalizeReportText(expected.pools[0])),
    has_security: normalized.includes(normalizeReportText(expected.pools[1])),
    has_insurance: normalized.includes(normalizeReportText(expected.pools[2])),
    has_2025: normalized.includes(expected.years[0]),
    has_2026: normalized.includes(expected.years[1]),
    has_3000_total: hasMoneyToken(normalized, expected.amounts[0]),
    has_4500_total: hasMoneyToken(normalized, expected.amounts[1]),
    has_1500_variance: hasMoneyToken(normalized, expected.amounts[2]),
    has_50_percent_variance:
      normalized.includes('50%') || normalized.includes('50.0%'),
  }
}

function normalizeReportText(value) {
  return String(value).toLowerCase().replace(/\s+/gu, ' ').trim()
}

function hasMoneyToken(text, amount) {
  const numeric = Number(amount)
  const variants = new Set([
    amount,
    numeric.toLocaleString('en-US', { maximumFractionDigits: 0 }),
    numeric.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  ])
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    if (new RegExp(`\\$?${escaped}\\b`, 'u').test(text)) return true
  }
  return false
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

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}

function dateOnly(value) {
  return String(value).slice(0, 10)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function bufferToString(value) {
  if (!value) return ''
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
}

function npxBinary() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function redactSensitiveUrl(value) {
  try {
    const parsed = new URL(value)
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|code|key|secret|password|session|signature/iu.test(key)) {
        parsed.searchParams.set(key, '[redacted]')
      }
    }
    return parsed.toString()
  } catch {
    return value
  }
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
