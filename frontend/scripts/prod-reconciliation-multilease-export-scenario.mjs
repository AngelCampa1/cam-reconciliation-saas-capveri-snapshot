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
  `prod-reconciliation-multilease-export-${runId}`
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
  const propertyName = `[PROD-TEST] Multilease Reconcile Tower ${suffix}`
  const fileName = `yardi-multilease-reconcile-${suffix}.csv`
  const periodStart = '2026-01-01'
  const periodEnd = '2026-12-31'
  const expected = expectedSnapshotValues()
  const created = {
    propertyId: null,
    unitIds: [],
    leaseIds: [],
    poolIds: [],
    mappingIds: [],
    batchId: null,
    jobId: null,
    snapshotIds: [],
    exportHistoryIds: [],
    exportStoragePaths: [],
  }
  report.generated = {
    propertyName,
    fileName,
    periodStart,
    periodEnd,
    propertyId: null,
    unitIds: created.unitIds,
    leaseIds: created.leaseIds,
    poolIds: created.poolIds,
    mappingIds: created.mappingIds,
    snapshotIds: created.snapshotIds,
    exportHistoryIds: created.exportHistoryIds,
    exportStoragePaths: created.exportStoragePaths,
    batchId: null,
    jobId: null,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '700 Prod Multilease Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78707',
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

    const units = []
    for (const unitInput of [
      {
        unit_number: `Full-${suffix.toUpperCase()}`,
        rentable_sqft: '9000.00',
        usable_sqft: '8100.00',
        floor: 7,
      },
      {
        unit_number: `Partial-${suffix.toUpperCase()}`,
        rentable_sqft: '1000.00',
        usable_sqft: '900.00',
        floor: 8,
      },
    ]) {
      const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
        method: 'POST',
        status: 201,
        body: {
          ...unitInput,
          status: 'occupied',
          space_type: 'office',
        },
      })
      units.push(unit)
      created.unitIds.push(unit.id)
    }
    report.generated.unitIds = created.unitIds

    const leaseInputs = [
      {
        unit_id: units[0].id,
        tenant_name: `[PROD-TEST] Full Year Tenant ${suffix}`,
        start_date: periodStart,
        base_year_amount: '1000.00',
        pro_rata_share: '0.20',
        admin_fee_percentage: '0.10',
      },
      {
        unit_id: units[1].id,
        tenant_name: `[PROD-TEST] Partial Year Tenant ${suffix}`,
        start_date: '2026-07-01',
        base_year_amount: '250.00',
        pro_rata_share: '0.10',
        admin_fee_percentage: '0.05',
      },
    ]
    for (const leaseInput of leaseInputs) {
      const lease = await expectJson('/api/v1/leases', {
        method: 'POST',
        status: 201,
        body: {
          property_id: property.id,
          unit_id: leaseInput.unit_id,
          tenant_name: leaseInput.tenant_name,
          start_date: leaseInput.start_date,
          end_date: '2031-12-31',
          status: 'active',
          recovery_profile: {
            base_year: 2025,
            base_year_amount: leaseInput.base_year_amount,
            gross_up_base_year: false,
            pro_rata_share: leaseInput.pro_rata_share,
            cap_type: 'none',
            cap_rate: null,
            admin_fee_percentage: leaseInput.admin_fee_percentage,
            management_fee_percentage: '0',
            excluded_pools: [],
            base_year_adjustments: [],
          },
        },
      })
      created.leaseIds.push(lease.id)
    }
    report.generated.leaseIds = created.leaseIds

    const poolInputs = [
      {
        name: `[PROD-TEST] Operating Pool ${suffix}`,
        pool_type: 'operating',
        pattern: '61*',
        priority: 20,
      },
      {
        name: `[PROD-TEST] Insurance Pool ${suffix}`,
        pool_type: 'insurance',
        pattern: '62*',
        priority: 10,
      },
    ]
    for (const poolInput of poolInputs) {
      const pool = await expectJson(
        `/api/v1/properties/${property.id}/expense-pools`,
        {
          method: 'POST',
          status: 201,
          body: {
            name: poolInput.name,
            pool_type: poolInput.pool_type,
            is_gross_up_applicable: true,
            gross_up_target: '0.95',
            description: 'Production E2E disposable multilease pool',
          },
        }
      )
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
        '6100,Operating Repairs,01/15/2026,2000.00,OpsCo,January repairs',
        '6100,Operating Repairs,04/15/2026,3000.00,OpsCo,Spring repairs',
        '6200,Insurance,02/01/2026,1200.00,InsureCo,Premium installment',
        '6200,Insurance,08/01/2026,1800.00,InsureCo,Premium installment',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'one Yardi GL batch creates four clean rows for deterministic expenses',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 4,
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
      'reconciliation calculate queues multilease job',
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
      'reconciliation job completes both lease snapshots',
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
        processed_leases: 2,
        total_leases: 2,
        progress_percentage: 100,
        snapshot_count: 2,
        potential_recovery_total: expected.totalRecovery,
      }
    )

    const snapshotsByLease = new Map()
    for (const snapshotId of completedJob.snapshot_ids) {
      const snapshot = await expectJson(
        `/api/v1/reconciliation/snapshots/${snapshotId}?include_trace=false`,
        { status: 200 }
      )
      snapshotsByLease.set(snapshot.lease_id, snapshot)
    }

    check(
      'draft snapshots exist for both generated leases',
      {
        lease_ids: [...snapshotsByLease.keys()].sort(),
        snapshot_ids: completedJob.snapshot_ids.slice().sort(),
      },
      {
        lease_ids: created.leaseIds.slice().sort(),
        snapshot_ids: created.snapshotIds.slice().sort(),
      }
    )

    checkSnapshot(
      'full-year lease snapshot has exact BigInt-derived recovery math',
      snapshotsByLease.get(created.leaseIds[0]),
      {
        propertyId: property.id,
        leaseId: created.leaseIds[0],
        periodStart,
        periodEnd,
        ...expected.fullYear,
      }
    )
    checkSnapshot(
      'partial-year lease snapshot has exact 184/365 proration math',
      snapshotsByLease.get(created.leaseIds[1]),
      {
        propertyId: property.id,
        leaseId: created.leaseIds[1],
        periodStart,
        periodEnd,
        ...expected.partialYear,
      }
    )

    const draftList = await expectJson(
      `/api/v1/reconciliation/snapshots?property_id=${property.id}&period_start=${periodStart}&period_end=${periodEnd}&is_finalized=false&page=1&size=10`,
      { status: 200 }
    )
    check(
      'snapshot list returns both generated drafts',
      {
        total: draftList.total,
        page: draftList.page,
        page_size: draftList.page_size,
        ids: draftList.items.map((item) => item.id).sort(),
        statuses: draftList.items.map((item) => item.status).sort(),
      },
      {
        total: 2,
        page: 1,
        page_size: 10,
        ids: created.snapshotIds.slice().sort(),
        statuses: ['draft', 'draft'],
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
      'batch finalize promotes both generated snapshots',
      {
        total_attempted: finalize.total_attempted,
        total_succeeded: finalize.total_succeeded,
        total_failed: finalize.total_failed,
        result_ids: finalize.results.map((item) => item.snapshot_id).sort(),
      },
      {
        total_attempted: 2,
        total_succeeded: 2,
        total_failed: 0,
        result_ids: created.snapshotIds.slice().sort(),
      }
    )

    const finalized = []
    for (const snapshotId of created.snapshotIds) {
      finalized.push(
        await expectJson(
          `/api/v1/reconciliation/snapshots/${snapshotId}?include_trace=false`,
          { status: 200 }
        )
      )
    }
    check(
      'both generated snapshots are finalized before persisted exports',
      {
        ids: finalized.map((item) => item.id).sort(),
        statuses: finalized.map((item) => item.status).sort(),
      },
      {
        ids: created.snapshotIds.slice().sort(),
        statuses: ['finalized', 'finalized'],
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
    rememberExport(created, pdf)
    check(
      'persisted single PDF streams bytes and records export headers',
      {
        status: pdf.status,
        content_type: pdf.content_type,
        content_disposition:
          pdf.content_disposition ===
          'attachment; filename="reconciliation-2026-property.pdf"',
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
        content_disposition: true,
        starts_with_pdf: true,
        byte_length_gt_1000: true,
        has_export_id: true,
        storage_path_is_r2: true,
      }
    )
    const singlePdfText = await extractPdfText(pdf.bytes)
    check(
      'single PDF body contains one generated tenant reconciliation',
      singleTenantPdfTextCoverage(singlePdfText, [
        {
          propertyName,
          tenantName: leaseInputs[0].tenant_name,
          expected: expected.fullYear,
        },
        {
          propertyName,
          tenantName: leaseInputs[1].tenant_name,
          expected: expected.partialYear,
        },
      ]),
      {
        has_property_name: true,
        matches_exact_generated_tenant: true,
        matched_tenant_count: 1,
      }
    )

    const redownload = await expectJson(
      `/api/v1/export/download/${pdf.export_id}`,
      { status: 200 }
    )
    check(
      'single PDF redownload mints a token URL',
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
      'single PDF token download returns persisted PDF bytes',
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

    const partialPdf = await expectBinary('/api/v1/export/pdf/download', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/pdf',
      body: {
        property_id: property.id,
        year: 2026,
        include_charts: false,
        include_notes: false,
        tenant_ids: [created.leaseIds[1]],
      },
    })
    rememberExport(created, partialPdf)
    const partialPdfText = await extractPdfText(partialPdf.bytes)
    check(
      'tenant-filtered single PDF body contains partial-year reconciliation facts',
      tenantPdfTextCoverage(partialPdfText, {
        propertyName,
        tenantName: leaseInputs[1].tenant_name,
        expected: expected.partialYear,
      }),
      {
        has_property_name: true,
        has_tenant_name: true,
        has_tenant_total: true,
        has_admin_fee: true,
      }
    )

    const batchZip = await expectBinary('/api/v1/export/pdf/batch', {
      method: 'POST',
      status: 200,
      contentTypePrefix: 'application/zip',
      body: {
        property_id: property.id,
        year: 2026,
        tenant_ids: created.leaseIds,
        mode: 'zip',
      },
    })
    rememberExport(created, batchZip)
    const batchZipEntries = parseZipEntries(batchZip.bytes)
    const batchZipEntryNames = Object.keys(batchZipEntries)
    check(
      'persisted batch PDF ZIP streams bytes for both leases',
      {
        status: batchZip.status,
        content_type: batchZip.content_type,
        content_disposition_has_filename:
          batchZip.content_disposition.includes('reconciliation-2026-batch-') &&
          batchZip.content_disposition.includes('.zip'),
        starts_with_zip: batchZip.starts_with_zip,
        byte_length_gt_1000: batchZip.byte_length > 1000,
        entry_names: batchZipEntryNames.sort(),
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
        entry_names: created.leaseIds
          .map((leaseId) => `reconciliation-2026-${leaseId.slice(0, 8)}.pdf`)
          .sort(),
        has_export_id: true,
        storage_path_is_r2: true,
      }
    )
    check(
      'batch ZIP PDF bodies contain tenant-specific generated facts',
      await batchZipTenantPdfCoverage(batchZipEntries, [
        {
          entryName: `reconciliation-2026-${created.leaseIds[0].slice(0, 8)}.pdf`,
          propertyName,
          tenantName: leaseInputs[0].tenant_name,
          expected: expected.fullYear,
        },
        {
          entryName: `reconciliation-2026-${created.leaseIds[1].slice(0, 8)}.pdf`,
          propertyName,
          tenantName: leaseInputs[1].tenant_name,
          expected: expected.partialYear,
        },
      ]),
      {
        full_has_property_name: true,
        full_has_tenant_name: true,
        full_has_tenant_total: true,
        full_has_admin_fee: true,
        partial_has_property_name: true,
        partial_has_tenant_name: true,
        partial_has_tenant_total: true,
        partial_has_admin_fee: true,
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
      'board download persists PDF and records export headers',
      {
        status: boardDownload.status,
        content_type: boardDownload.content_type,
        content_disposition:
          boardDownload.content_disposition ===
          'attachment; filename="board-presentation-2026.pdf"',
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
        content_disposition: true,
        starts_with_pdf: true,
        byte_length_gt_1000: true,
        has_export_id: true,
        storage_path_is_r2: true,
      }
    )
    const boardText = await extractPdfText(boardDownload.bytes)
    check(
      'board PDF body contains combined NOI facts for both leases',
      boardPdfTextCoverage(boardText, {
        propertyName,
        year: '2026',
        totalRecovery: expected.totalRecovery,
        assetValue: divideMoneyByRate(
          Money.parse(expected.totalRecovery),
          Rate.parse('0.07')
        ).toString(),
      }),
      {
        has_property_name: true,
        has_2026: true,
        has_combined_recovery: true,
        has_asset_value: true,
      }
    )

    const history = await expectJson(
      `/api/v1/export/history?property_id=${property.id}&page=1&page_size=20`,
      { status: 200 }
    )
    const historyItems = history.items ?? history.data ?? []
    check(
      'persisted export history lists single PDF batch ZIP and board PDF',
      {
        total: history.total,
        formats: historyItems.map((item) => item.format).sort(),
        ids: historyItems
          .map((item) => item.id)
          .filter((id) => typeof id === 'string')
          .sort(),
      },
      {
        total: 4,
        formats: ['board_pdf', 'pdf', 'pdf', 'pdf_batch'],
        ids: created.exportHistoryIds.slice().sort(),
      }
    )
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

function checkSnapshot(label, snapshot, expected) {
  if (!snapshot) {
    throw new Error(`${label} missing snapshot`)
  }
  check(
    label,
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
      property_id: expected.propertyId,
      lease_id: expected.leaseId,
      period_start_date: expected.periodStart,
      period_end_date: expected.periodEnd,
      status: 'draft',
      total_operating_expenses: expected.totalOperatingExpenses,
      grossed_up_expenses: expected.grossedUpExpenses,
      base_year_amount: expected.baseYearAmount,
      tenant_share_before_cap: expected.tenantShareBeforeCap,
      tenant_share_after_cap: expected.tenantShareAfterCap,
      admin_fee: expected.adminFee,
      total_recovery: expected.totalRecovery,
      calculation_trace_length: 0,
    }
  )
}

function expectedSnapshotValues() {
  const totalExpenses = Money.parse('8000.00')
  const fullIncrease = totalExpenses.subtract(Money.parse('1000.00'))
  const fullShare = fullIncrease.multiplyRate(Rate.parse('0.20'))
  const fullAdmin = fullShare.multiplyRate(Rate.parse('0.10'))

  const partialProration = Rate.parse('184').divide(Rate.parse('365'))
  const partialIncrease = totalExpenses.subtract(Money.parse('250.00'))
  const partialFullPeriodShare = partialIncrease.multiplyRate(
    Rate.parse('0.10')
  )
  const partialShare = partialFullPeriodShare.multiplyRate(partialProration)
  const partialAdmin = partialShare.multiplyRate(Rate.parse('0.05'))

  return {
    totalRecovery: fullShare
      .add(fullAdmin)
      .add(partialShare)
      .add(partialAdmin)
      .toString(),
    fullYear: {
      totalOperatingExpenses: totalExpenses.toString(),
      grossedUpExpenses: totalExpenses.toString(),
      baseYearAmount: '1000.00',
      tenantShareBeforeCap: fullShare.toString(),
      tenantShareAfterCap: fullShare.toString(),
      adminFee: fullAdmin.toString(),
      totalRecovery: fullShare.add(fullAdmin).toString(),
    },
    partialYear: {
      totalOperatingExpenses: totalExpenses.toString(),
      grossedUpExpenses: totalExpenses.toString(),
      baseYearAmount: '250.00',
      tenantShareBeforeCap: partialShare.toString(),
      tenantShareAfterCap: partialShare.toString(),
      adminFee: partialAdmin.toString(),
      totalRecovery: partialShare.add(partialAdmin).toString(),
    },
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
    if (!created.exportHistoryIds.includes(item.id)) {
      created.exportHistoryIds.push(item.id)
    }
    const storagePath =
      typeof item.storage_path === 'string' ? item.storage_path : null
    if (storagePath && !created.exportStoragePaths.includes(storagePath)) {
      created.exportStoragePaths.push(storagePath)
    }
    await deleteEmpty(`/api/v1/export/history/${item.id}`)
    await expectStatus(`/api/v1/export/download/${item.id}`, { status: 404 })
    if (storagePath) {
      await expectReportR2ObjectMissing(storagePath)
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

function tenantPdfTextCoverage(text, expected) {
  const normalized = normalizeReportText(text)
  return {
    has_property_name: normalized.includes(
      normalizeReportText(expected.propertyName)
    ),
    has_tenant_name: normalized.includes(
      normalizeReportText(expected.tenantName)
    ),
    has_tenant_total: hasMoneyToken(
      normalized,
      expected.expected.totalRecovery
    ),
    has_admin_fee: hasMoneyToken(normalized, expected.expected.adminFee),
  }
}

function singleTenantPdfTextCoverage(text, expectedTenants) {
  const coverages = expectedTenants.map((expected) =>
    tenantPdfTextCoverage(text, expected)
  )
  const matchedTenantCount = coverages.filter(
    (coverage) =>
      coverage.has_property_name &&
      coverage.has_tenant_name &&
      coverage.has_tenant_total &&
      coverage.has_admin_fee
  ).length
  return {
    has_property_name: coverages.some((coverage) => coverage.has_property_name),
    matches_exact_generated_tenant: matchedTenantCount === 1,
    matched_tenant_count: matchedTenantCount,
  }
}

async function batchZipTenantPdfCoverage(entries, expectedEntries) {
  const result = {}
  for (const [index, expected] of expectedEntries.entries()) {
    const prefix = index === 0 ? 'full' : 'partial'
    const bytes = entries[expected.entryName]
    const text = bytes ? await extractPdfText(bytes) : ''
    const normalized = normalizeReportText(text)
    result[`${prefix}_has_property_name`] = normalized.includes(
      normalizeReportText(expected.propertyName)
    )
    result[`${prefix}_has_tenant_name`] = normalized.includes(
      normalizeReportText(expected.tenantName)
    )
    result[`${prefix}_has_tenant_total`] = hasMoneyToken(
      normalized,
      expected.expected.totalRecovery
    )
    result[`${prefix}_has_admin_fee`] = hasMoneyToken(
      normalized,
      expected.expected.adminFee
    )
  }
  return result
}

function boardPdfTextCoverage(text, expected) {
  const normalized = normalizeReportText(text)
  return {
    has_property_name: normalized.includes(
      normalizeReportText(expected.propertyName)
    ),
    has_2026: normalized.includes(expected.year),
    has_combined_recovery: hasMoneyToken(normalized, expected.totalRecovery),
    has_asset_value: hasMoneyToken(normalized, expected.assetValue),
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

function normalizeReportText(value) {
  return String(value).toLowerCase().replace(/\s+/gu, ' ').trim()
}

function hasMoneyToken(text, amount) {
  const numeric = Number(amount)
  const exactCents = numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const escaped = exactCents.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`(?<![\\d,.])\\$?${escaped}(?![\\d,.])`, 'u').test(text)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
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

function divideMoneyByRate(money, rate) {
  return new Money(roundDivide(money.cents * 100_000_000n, rate.scaledValue))
}

class Money {
  constructor(cents) {
    this.cents = cents
  }

  static parse(value) {
    const text = String(value).trim()
    if (!/^\d+(\.\d+)?$/u.test(text)) {
      throw new Error(`Invalid money value: ${text}`)
    }
    const [whole = '0', fraction = ''] = text.split('.')
    const padded = `${fraction}000`
    const cents =
      BigInt(whole) * 100n +
      BigInt(padded.slice(0, 2)) +
      (Number(padded[2]) >= 5 ? 1n : 0n)
    return new Money(cents)
  }

  add(other) {
    return new Money(this.cents + other.cents)
  }

  subtract(other) {
    return new Money(this.cents - other.cents)
  }

  multiplyRate(rate) {
    return new Money(roundDivide(this.cents * rate.scaledValue, 100_000_000n))
  }

  toString() {
    const whole = this.cents / 100n
    const cents = this.cents % 100n
    return `${whole}.${cents.toString().padStart(2, '0')}`
  }
}

class Rate {
  constructor(scaledValue) {
    this.scaledValue = scaledValue
  }

  static parse(value) {
    const text = String(value).trim()
    if (!/^\d+(\.\d+)?$/u.test(text)) {
      throw new Error(`Invalid rate value: ${text}`)
    }
    const [whole = '0', fraction = ''] = text.split('.')
    const padded = `${fraction}${'0'.repeat(9)}`
    const scaled =
      BigInt(whole) * 100_000_000n +
      BigInt(padded.slice(0, 8)) +
      (Number(padded[8]) >= 5 ? 1n : 0n)
    return new Rate(scaled)
  }

  divide(other) {
    if (other.scaledValue === 0n) throw new Error('Cannot divide by zero rate')
    return new Rate(
      roundDivide(this.scaledValue * 100_000_000n, other.scaledValue)
    )
  }

  toString() {
    const whole = this.scaledValue / 100_000_000n
    const fraction = (this.scaledValue % 100_000_000n)
      .toString()
      .padStart(8, '0')
    return `${whole}.${fraction}`.replace(/0+$/u, '').replace(/\.$/u, '')
  }
}

function roundDivide(numerator, denominator) {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  return remainder * 2n >= denominator ? quotient + 1n : quotient
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
