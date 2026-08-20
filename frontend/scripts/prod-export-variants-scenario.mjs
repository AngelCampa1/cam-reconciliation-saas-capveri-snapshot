import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
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
  `prod-export-variants-${runId}`
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
    report.checks.every((check) => check.ok) &&
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
    exportHistoryId: null,
    exportStoragePath: null,
    exportHistoryIds: [],
    exportStoragePaths: [],
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
    check(
      'batch finalize promotes generated snapshot',
      {
        total_attempted: finalize.total_attempted,
        total_succeeded: finalize.total_succeeded,
        total_failed: finalize.total_failed,
        result_ids: finalize.results.map((item) => item.snapshot_id),
      },
      {
        total_attempted: 1,
        total_succeeded: 1,
        total_failed: 0,
        result_ids: [snapshotId],
      }
    )

    const finalizedSnapshot = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotId}?include_trace=false`,
      { status: 200 }
    )
    check(
      'generated snapshot is finalized before persisted export',
      {
        id: finalizedSnapshot.id,
        status: finalizedSnapshot.status,
      },
      {
        id: snapshotId,
        status: 'finalized',
      }
    )

    const pdf = await expectBinary('/api/v1/export/pdf/download', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/pdf',
      body: {
        property_id: property.id,
        year: 2026,
        include_charts: false,
        include_notes: false,
      },
    })
    created.exportHistoryId = pdf.export_id
    created.exportStoragePath = pdf.export_storage_path
    rememberExport(created, pdf)
    report.generated.exportHistoryId = created.exportHistoryId
    report.generated.exportStoragePath = created.exportStoragePath
    check(
      'persisted pdf export streams bytes',
      {
        status: pdf.status,
        content_type: pdf.content_type,
        content_disposition: pdf.content_disposition,
        starts_with_pdf: pdf.starts_with_pdf,
        byte_length_gt_1000: pdf.byte_length > 1000,
        has_export_id:
          typeof pdf.export_id === 'string' && pdf.export_id.length > 0,
        storage_path_is_r2:
          typeof pdf.export_storage_path === 'string' &&
          pdf.export_storage_path.startsWith('r2:reports/'),
      },
      {
        status: 200,
        content_type: 'application/pdf',
        content_disposition:
          'attachment; filename="reconciliation-2026-property.pdf"',
        starts_with_pdf: true,
        byte_length_gt_1000: true,
        has_export_id: true,
        storage_path_is_r2: true,
      }
    )
    const pdfText = await extractPdfText(pdf.bytes)
    check(
      'persisted pdf body contains generated reconciliation facts',
      reconciliationPdfTextCoverage(pdfText, {
        propertyName,
        tenantName,
        periodYears: ['2026'],
        amounts: ['5000', '23750', '1000', '4550', '455', '5005'],
      }),
      {
        has_property_name: true,
        has_tenant_name: true,
        has_2026: true,
        has_5000_operating_expenses: true,
        has_23750_grossed_up_expenses: true,
        has_1000_base_year: true,
        has_4550_tenant_share: true,
        has_455_admin_fee: true,
        has_5005_total_recovery: true,
      }
    )

    const history = await expectJson(
      `/api/v1/export/history?property_id=${property.id}&format=pdf&page=1&page_size=10`,
      { status: 200 }
    )
    const historyItems = history.items ?? history.data ?? []
    const generatedExport = historyItems.find(
      (item) => item.file_name === 'reconciliation-2026-property.pdf'
    )
    check(
      'persisted pdf export creates one R2-backed history row',
      {
        total: history.total,
        item_count: historyItems.length,
        id: generatedExport?.id ?? null,
        format: generatedExport?.format ?? null,
        status: generatedExport?.status ?? null,
        file_name: generatedExport?.file_name ?? null,
        storage_path_is_r2:
          typeof generatedExport?.storage_path === 'string' &&
          generatedExport.storage_path.startsWith('r2:reports/'),
      },
      {
        total: 1,
        item_count: 1,
        id: created.exportHistoryId,
        format: 'pdf',
        status: 'completed',
        file_name: 'reconciliation-2026-property.pdf',
        storage_path_is_r2: true,
      }
    )

    const redownload = await expectJson(
      `/api/v1/export/download/${created.exportHistoryId}`,
      { status: 200 }
    )
    check(
      'export redownload mints public file URL',
      {
        file_name: redownload.file_name,
        has_download_url:
          typeof redownload.download_url === 'string' &&
          redownload.download_url.includes(
            '/api/v1/export/download/file?token='
          ),
        has_expires_at:
          typeof redownload.expires_at === 'string' &&
          redownload.expires_at.length > 0,
      },
      {
        file_name: 'reconciliation-2026-property.pdf',
        has_download_url: true,
        has_expires_at: true,
      }
    )

    const publicFile = await expectAbsoluteBinary(redownload.download_url, {
      status: 200,
      contentTypePrefix: 'application/pdf',
    })
    check(
      'public token download returns persisted PDF bytes',
      {
        status: publicFile.status,
        content_type: publicFile.content_type,
        starts_with_pdf: publicFile.starts_with_pdf,
        same_byte_length: publicFile.byte_length === pdf.byte_length,
        same_sha256: sha256(publicFile.bytes) === sha256(pdf.bytes),
      },
      {
        status: 200,
        content_type: 'application/pdf',
        starts_with_pdf: true,
        same_byte_length: true,
        same_sha256: true,
      }
    )

    const batchZip = await expectBinary('/api/v1/export/pdf/batch', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/zip',
      body: {
        property_id: property.id,
        year: 2026,
        tenant_ids: [lease.id],
        mode: 'zip',
      },
    })
    rememberExport(created, batchZip)
    check(
      'batch pdf export streams ZIP bytes and exposes cleanup headers',
      {
        status: batchZip.status,
        content_type: batchZip.content_type,
        content_disposition_has_filename:
          batchZip.content_disposition.includes('reconciliation-2026-batch-') &&
          batchZip.content_disposition.includes('.zip'),
        starts_with_zip: batchZip.starts_with_zip,
        byte_length_gt_1000: batchZip.byte_length > 1000,
        has_export_id:
          typeof batchZip.export_id === 'string' &&
          batchZip.export_id.length > 0,
        storage_path_is_r2:
          typeof batchZip.export_storage_path === 'string' &&
          batchZip.export_storage_path.startsWith('r2:reports/'),
      },
      {
        status: 200,
        content_type: 'application/zip',
        content_disposition_has_filename: true,
        starts_with_zip: true,
        byte_length_gt_1000: true,
        has_export_id: true,
        storage_path_is_r2: true,
      }
    )
    const batchZipEntries = parseZipEntries(batchZip.bytes)
    const batchPdfEntries = Object.entries(batchZipEntries).filter(([name]) =>
      name.endsWith('.pdf')
    )
    check(
      'batch pdf ZIP contains one tenant PDF body with generated facts',
      {
        pdf_entry_count: batchPdfEntries.length,
        pdf_entry_names: batchPdfEntries.map(([name]) => name).sort(),
        ...(await reconciliationZipPdfCoverage(batchPdfEntries, {
          propertyName,
          tenantName,
          periodYears: ['2026'],
          amounts: ['5000', '23750', '1000', '4550', '455', '5005'],
        })),
      },
      {
        pdf_entry_count: 1,
        pdf_entry_names: batchPdfEntries.map(([name]) => name).sort(),
        has_property_name: true,
        has_tenant_name: true,
        has_2026: true,
        has_5000_operating_expenses: true,
        has_23750_grossed_up_expenses: true,
        has_1000_base_year: true,
        has_4550_tenant_share: true,
        has_455_admin_fee: true,
        has_5005_total_recovery: true,
      }
    )

    const variancePdf = await expectBinary('/api/v1/export/variance/pdf', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/pdf',
      body: {
        property_id: property.id,
        current_year: 2026,
        prior_year: 2025,
        threshold_percent: 10,
      },
    })
    rememberExport(created, variancePdf)
    check(
      'variance pdf export streams current-year statement check',
      {
        status: variancePdf.status,
        content_type: variancePdf.content_type,
        content_disposition: variancePdf.content_disposition,
        starts_with_pdf: variancePdf.starts_with_pdf,
        byte_length_gt_1000: variancePdf.byte_length > 1000,
        has_export_id:
          typeof variancePdf.export_id === 'string' &&
          variancePdf.export_id.length > 0,
        storage_path_is_r2:
          typeof variancePdf.export_storage_path === 'string' &&
          variancePdf.export_storage_path.startsWith('r2:reports/'),
      },
      {
        status: 200,
        content_type: 'application/pdf',
        content_disposition:
          'attachment; filename="statement-check-report-2026-vs-2025.pdf"',
        starts_with_pdf: true,
        byte_length_gt_1000: true,
        has_export_id: true,
        storage_path_is_r2: true,
      }
    )
    const variancePdfText = await extractPdfText(variancePdf.bytes)
    check(
      'variance pdf body contains generated statement check facts',
      varianceReportTextCoverage(variancePdfText, {
        propertyName,
        years: ['2026', '2025'],
        amounts: ['5005', '0'],
        variancePercent: '0',
      }),
      {
        has_property_name: true,
        has_2026: true,
        has_2025: true,
        has_5005_current_total: true,
        has_zero_prior_total: true,
        has_zero_variance_percent: true,
      }
    )

    const varianceExcel = await expectBinary('/api/v1/export/variance/excel', {
      method: 'POST',
      status: 200,
      contentTypePrefix:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: {
        property_id: property.id,
        current_year: 2026,
        prior_year: 2025,
        threshold_percent: 10,
      },
    })
    rememberExport(created, varianceExcel)
    check(
      'variance excel export streams XLSX bytes',
      {
        status: varianceExcel.status,
        content_type: varianceExcel.content_type,
        content_disposition: varianceExcel.content_disposition,
        starts_with_zip: varianceExcel.starts_with_zip,
        byte_length_gt_1000: varianceExcel.byte_length > 1000,
        has_export_id:
          typeof varianceExcel.export_id === 'string' &&
          varianceExcel.export_id.length > 0,
        storage_path_is_r2:
          typeof varianceExcel.export_storage_path === 'string' &&
          varianceExcel.export_storage_path.startsWith('r2:reports/'),
      },
      {
        status: 200,
        content_type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content_disposition:
          'attachment; filename="statement-check-report-2026-vs-2025.xlsx"',
        starts_with_zip: true,
        byte_length_gt_1000: true,
        has_export_id: true,
        storage_path_is_r2: true,
      }
    )
    check(
      'variance excel body contains generated statement check facts',
      varianceXlsxCoverage(varianceExcel.bytes, {
        propertyName,
        years: ['2026', '2025'],
        amounts: ['5005', '0'],
        variancePercent: '0',
      }),
      {
        has_property_name: true,
        has_2026: true,
        has_2025: true,
        has_5005_current_total: true,
        has_zero_prior_total: true,
        has_zero_variance_percent: true,
      }
    )

    const boardPreview = await expectBinary('/api/v1/export/board/preview', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/pdf',
      body: {
        property_id: property.id,
        year: 2026,
        cap_rate: 0.07,
      },
    })
    check(
      'board preview streams inline PDF without persistence headers',
      {
        status: boardPreview.status,
        content_type: boardPreview.content_type,
        content_disposition: boardPreview.content_disposition,
        starts_with_pdf: boardPreview.starts_with_pdf,
        byte_length_gt_1000: boardPreview.byte_length > 1000,
        export_id: boardPreview.export_id,
        export_storage_path: boardPreview.export_storage_path,
      },
      {
        status: 200,
        content_type: 'application/pdf',
        content_disposition: 'inline',
        starts_with_pdf: true,
        byte_length_gt_1000: true,
        export_id: null,
        export_storage_path: null,
      }
    )
    const boardPreviewText = await extractPdfText(boardPreview.bytes)
    check(
      'board preview body contains generated NOI facts',
      boardPdfTextCoverage(boardPreviewText, {
        propertyName,
        year: '2026',
        amounts: ['5005', '71500'],
        capRate: '7.0',
      }),
      {
        has_property_name: true,
        has_2026: true,
        has_5005_recovery: true,
        has_71500_asset_value: true,
        has_7_percent_cap_rate: true,
      }
    )

    const boardDownload = await expectBinary('/api/v1/export/board/download', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/pdf',
      body: {
        property_id: property.id,
        year: 2026,
        cap_rate: 0.07,
      },
    })
    rememberExport(created, boardDownload)
    check(
      'board download persists PDF and exposes cleanup headers',
      {
        status: boardDownload.status,
        content_type: boardDownload.content_type,
        content_disposition: boardDownload.content_disposition,
        starts_with_pdf: boardDownload.starts_with_pdf,
        byte_length_gt_1000: boardDownload.byte_length > 1000,
        has_export_id:
          typeof boardDownload.export_id === 'string' &&
          boardDownload.export_id.length > 0,
        storage_path_is_r2:
          typeof boardDownload.export_storage_path === 'string' &&
          boardDownload.export_storage_path.startsWith('r2:reports/'),
      },
      {
        status: 200,
        content_type: 'application/pdf',
        content_disposition:
          'attachment; filename="board-presentation-2026.pdf"',
        starts_with_pdf: true,
        byte_length_gt_1000: true,
        has_export_id: true,
        storage_path_is_r2: true,
      }
    )
    const boardDownloadText = await extractPdfText(boardDownload.bytes)
    check(
      'board download body contains generated NOI facts',
      boardPdfTextCoverage(boardDownloadText, {
        propertyName,
        year: '2026',
        amounts: ['5005', '71500'],
        capRate: '7.0',
      }),
      {
        has_property_name: true,
        has_2026: true,
        has_5005_recovery: true,
        has_71500_asset_value: true,
        has_7_percent_cap_rate: true,
      }
    )

    report.generated.exportHistoryIds = created.exportHistoryIds
    report.generated.exportStoragePaths = created.exportStoragePaths
    const variantHistory = await expectJson(
      `/api/v1/export/history?property_id=${property.id}&page=1&page_size=20`,
      { status: 200 }
    )
    const variantHistoryItems =
      variantHistory.items ?? variantHistory.data ?? []
    check(
      'all persisted export variants are listed in export history',
      {
        total: variantHistory.total,
        formats: variantHistoryItems.map((item) => item.format).sort(),
        ids: variantHistoryItems
          .map((item) => item.id)
          .filter((id) => typeof id === 'string')
          .sort(),
      },
      {
        total: 5,
        formats: [
          'board_pdf',
          'pdf',
          'pdf_batch',
          'variance_excel',
          'variance_pdf',
        ],
        ids: [...created.exportHistoryIds].sort(),
      }
    )
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

function rememberExport(created, binaryResult) {
  if (typeof binaryResult.export_id === 'string' && binaryResult.export_id) {
    created.exportHistoryIds.push(binaryResult.export_id)
  }
  if (
    typeof binaryResult.export_storage_path === 'string' &&
    binaryResult.export_storage_path
  ) {
    created.exportStoragePaths.push(binaryResult.export_storage_path)
  }
  report.generated.exportHistoryIds = created.exportHistoryIds
  report.generated.exportStoragePaths = created.exportStoragePaths
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
  const exportFailures = []
  if (created.exportHistoryIds.length > 0) {
    for (const exportHistoryId of created.exportHistoryIds) {
      await attemptCleanup(
        exportFailures,
        `delete export history and R2 report ${exportHistoryId}`,
        () => deleteEmpty(`/api/v1/export/history/${exportHistoryId}`)
      )
      await attemptCleanup(
        exportFailures,
        `verify export history deleted ${exportHistoryId}`,
        () =>
          expectStatus(`/api/v1/export/download/${exportHistoryId}`, {
            status: 404,
          })
      )
    }
    if (created.propertyId) {
      await attemptCleanup(
        exportFailures,
        'discover and delete any remaining property export history',
        () => deletePropertyExportHistory(created)
      )
    }
    for (const exportStoragePath of created.exportStoragePaths) {
      await attemptCleanup(
        exportFailures,
        `verify export R2 object deleted ${exportStoragePath}`,
        () => expectReportR2ObjectMissing(exportStoragePath)
      )
    }
  } else if (created.propertyId) {
    await attemptCleanup(
      exportFailures,
      'discover and delete property export history',
      () => deletePropertyExportHistory(created)
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
    if (created.batchId) {
      await attemptCleanup(
        failures,
        'verify ingestion batch and imported GL rows deleted',
        () =>
          expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
            status: 404,
          })
      )
    }
    if (created.mappingId) {
      await attemptCleanup(failures, 'verify pool mapping deleted', () =>
        expectStatus(
          `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`,
          { status: 404 }
        )
      )
    }
    if (created.poolId) {
      await attemptCleanup(failures, 'verify expense pool deleted', () =>
        expectStatus(
          `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`,
          { status: 404 }
        )
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
  if (exportFailures.length > 0 || failures.length > 0) {
    throw new Error(
      `Cleanup failed: ${[...exportFailures, ...failures].join(', ')}`
    )
  }
}

async function deletePropertyExportHistory(created) {
  const history = await expectJson(
    `/api/v1/export/history?property_id=${created.propertyId}&page=1&page_size=100`,
    { status: 200 }
  )
  const items = history.items ?? history.data ?? []
  for (const item of items) {
    if (typeof item.id !== 'string') continue
    created.exportHistoryId = item.id
    if (!created.exportHistoryIds.includes(item.id)) {
      created.exportHistoryIds.push(item.id)
    }
    created.exportStoragePath =
      typeof item.storage_path === 'string' ? item.storage_path : null
    if (
      created.exportStoragePath &&
      !created.exportStoragePaths.includes(created.exportStoragePath)
    ) {
      created.exportStoragePaths.push(created.exportStoragePath)
    }
    await deleteEmpty(`/api/v1/export/history/${item.id}`)
    await expectStatus(`/api/v1/export/download/${item.id}`, { status: 404 })
    if (created.exportStoragePath) {
      await expectReportR2ObjectMissing(created.exportStoragePath)
    }
  }
  report.generated.exportHistoryIds = created.exportHistoryIds
  report.generated.exportStoragePaths = created.exportStoragePaths
  await expectNoExportHistory(created.propertyId)
}

async function expectNoExportHistory(propertyId) {
  const history = await expectJson(
    `/api/v1/export/history?property_id=${propertyId}&page=1&page_size=10`,
    { status: 200 }
  )
  const items = history.items ?? history.data ?? []
  const ok = history.total === 0 && Array.isArray(items) && items.length === 0
  report.cleanup.push({
    path: `/api/v1/export/history?property_id=${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      total: history.total,
      item_count: items.length,
    }),
  })
  if (!ok) {
    throw new Error(
      `Export history still present after delete: ${JSON.stringify(history).slice(0, 500)}`
    )
  }
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
    throw new Error(
      `R2 object still existed after export delete: ${objectPath}`
    )
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

async function reconciliationZipPdfCoverage(pdfEntries, expected) {
  const texts = []
  for (const [, bytes] of pdfEntries) {
    texts.push(await extractPdfText(bytes))
  }
  return reconciliationPdfTextCoverage(texts.join('\n'), expected)
}

function reconciliationPdfTextCoverage(text, expected) {
  const normalized = normalizeReportText(text)
  return {
    has_property_name: normalized.includes(
      normalizeReportText(expected.propertyName)
    ),
    has_tenant_name: normalized.includes(
      normalizeReportText(expected.tenantName)
    ),
    has_2026: normalized.includes(expected.periodYears[0]),
    has_5000_operating_expenses: hasMoneyToken(normalized, expected.amounts[0]),
    has_23750_grossed_up_expenses: hasMoneyToken(
      normalized,
      expected.amounts[1]
    ),
    has_1000_base_year: hasMoneyToken(normalized, expected.amounts[2]),
    has_4550_tenant_share: hasMoneyToken(normalized, expected.amounts[3]),
    has_455_admin_fee: hasMoneyToken(normalized, expected.amounts[4]),
    has_5005_total_recovery: hasMoneyToken(normalized, expected.amounts[5]),
  }
}

function varianceReportTextCoverage(text, expected) {
  const normalized = normalizeReportText(text)
  return {
    has_property_name: normalized.includes(
      normalizeReportText(expected.propertyName)
    ),
    has_2026: normalized.includes(expected.years[0]),
    has_2025: normalized.includes(expected.years[1]),
    has_5005_current_total: hasMoneyToken(normalized, expected.amounts[0]),
    has_zero_prior_total: hasMoneyToken(normalized, expected.amounts[1]),
    has_zero_variance_percent: hasPercentToken(
      normalized,
      expected.variancePercent
    ),
  }
}

function varianceXlsxCoverage(bytes, expected) {
  const entries = parseZipEntries(bytes)
  const workbookText = extractXlsxText(bytes)
  const normalized = normalizeReportText(workbookText)
  const sheet = new TextDecoder().decode(
    entries['xl/worksheets/sheet1.xml'] ?? Buffer.from('')
  )
  return {
    has_property_name: normalized.includes(
      normalizeReportText(expected.propertyName)
    ),
    has_2026: normalized.includes(expected.years[0]),
    has_2025: normalized.includes(expected.years[1]),
    has_5005_current_total:
      hasMoneyToken(normalized, expected.amounts[0]) ||
      sheetCellHasValue(sheet, 'B5', expected.amounts[0]),
    has_zero_prior_total: sheetCellHasValue(sheet, 'B6', expected.amounts[1]),
    has_zero_variance_percent: sheetCellHasValue(
      sheet,
      'C6',
      expected.variancePercent
    ),
  }
}

function boardPdfTextCoverage(text, expected) {
  const normalized = normalizeReportText(text)
  return {
    has_property_name: normalized.includes(
      normalizeReportText(expected.propertyName)
    ),
    has_2026: normalized.includes(expected.year),
    has_5005_recovery: hasMoneyToken(normalized, expected.amounts[0]),
    has_71500_asset_value: hasMoneyToken(normalized, expected.amounts[1]),
    has_7_percent_cap_rate: hasPercentToken(normalized, expected.capRate),
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
    if (new RegExp(`(?<![\\d,.])\\$?${escaped}(?![\\d,.])`, 'u').test(text)) {
      return true
    }
  }
  return false
}

function hasPercentToken(text, percent) {
  const numeric = Number(percent)
  const variants = new Set([
    percent,
    numeric.toFixed(0),
    numeric.toFixed(1),
    numeric.toFixed(2),
  ])
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    if (new RegExp(`(?<![\\d.])${escaped}%(?![\\d.])`, 'u').test(text)) {
      return true
    }
  }
  return false
}

function sheetCellHasValue(sheetXml, cellRef, expectedValue) {
  const escapedCell = cellRef.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const cellPattern = new RegExp(
    `<c\\b[^>]*\\br="${escapedCell}"[^>]*>[\\s\\S]*?<v>([\\s\\S]*?)<\\/v>[\\s\\S]*?<\\/c>`,
    'u'
  )
  const match = sheetXml.match(cellPattern)
  if (!match) return false
  return Number(match[1]) === Number(expectedValue)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
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
    export_id: response.headers.get('x-capveri-export-id'),
    export_storage_path: response.headers.get('x-capveri-export-storage-path'),
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
      if (/token|code|key|secret|password|session|signature/i.test(key)) {
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
