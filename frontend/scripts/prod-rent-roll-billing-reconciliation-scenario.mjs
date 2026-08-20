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
const expectedCalculated = '4275'
const expectedActualBilled = '4000'
const expectedLeakage = '275'
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-rent-roll-billing-reconciliation-${runId}`
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
  const propertyName = `[PROD-TEST] Imported Billing Tower ${suffix}`
  const rentRollFileName = `rent-roll-billing-reconcile-${suffix}.csv`
  const glFileName = `gl-billing-reconcile-${suffix}.csv`
  const billingFileName = `actual-billed-imported-reconcile-${suffix}.csv`
  const periodStart = '2026-01-01'
  const periodEnd = '2026-12-31'
  const created = {
    propertyId: null,
    unitIds: [],
    leaseIds: [],
    poolIds: [],
    mappingIds: [],
    batchId: null,
    jobId: null,
    snapshotIds: [],
  }
  report.generated = {
    propertyName,
    rentRollFileName,
    glFileName,
    billingFileName,
    periodStart,
    periodEnd,
    propertyId: null,
    unitIds: created.unitIds,
    leaseIds: created.leaseIds,
    poolIds: created.poolIds,
    mappingIds: created.mappingIds,
    batchId: null,
    jobId: null,
    snapshotIds: created.snapshotIds,
    actualBilledIds: [],
  }

  try {
    const imported = await uploadRentRoll({
      fileName: rentRollFileName,
      csv: rentRollCsv(propertyName),
      fields: {
        property_name: propertyName,
        address: '901 Imported Billing Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
      },
    })
    created.propertyId = imported.property_id
    report.generated.propertyId = imported.property_id
    check(
      'rent roll import creates imported property, units, and leases',
      {
        success: imported.success,
        property_id_present:
          typeof imported.property_id === 'string' &&
          imported.property_id.length > 0,
        property_name: imported.property_name,
        units_created: imported.units_created,
        leases_created: imported.leases_created,
        warnings: imported.warnings,
      },
      {
        success: true,
        property_id_present: true,
        property_name: propertyName,
        units_created: 3,
        leases_created: 2,
        warnings: [],
      }
    )

    const property = await expectJson(
      `/api/v1/properties/${imported.property_id}`,
      { status: 200 }
    )
    check(
      'imported property keeps deterministic square-foot totals',
      pick(property, [
        'name',
        'address_line1',
        'city',
        'state',
        'postal_code',
        'total_rentable_sqft',
        'total_usable_sqft',
        'common_area_sqft',
      ]),
      {
        name: propertyName,
        address_line1: '901 Imported Billing Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '10000.00',
        total_usable_sqft: '9000.00',
        common_area_sqft: '1000.00',
      }
    )

    const units = await expectJson(
      `/api/v1/properties/${imported.property_id}/units?skip=0&limit=20`,
      { status: 200 }
    )
    created.unitIds.push(...units.data.map((unit) => unit.id))
    report.generated.unitIds = created.unitIds
    check(
      'imported units preserve suite, sqft, floor, and status',
      units.data
        .map((unit) =>
          pick(unit, [
            'unit_number',
            'rentable_sqft',
            'usable_sqft',
            'floor',
            'status',
          ])
        )
        .sort((a, b) => a.unit_number.localeCompare(b.unit_number)),
      [
        {
          unit_number: '100',
          rentable_sqft: '5000.00',
          usable_sqft: '4500.00',
          floor: 1,
          status: 'occupied',
        },
        {
          unit_number: '200',
          rentable_sqft: '3000.00',
          usable_sqft: '2700.00',
          floor: 2,
          status: 'occupied',
        },
        {
          unit_number: '300',
          rentable_sqft: '2000.00',
          usable_sqft: '1800.00',
          floor: 3,
          status: 'vacant',
        },
      ]
    )

    const leases = await expectJson(
      `/api/v1/leases?property_id=${imported.property_id}&skip=0&limit=20`,
      { status: 200 }
    )
    const leasesByTenant = new Map(
      leases.data.map((lease) => [lease.tenant_name, lease])
    )
    const alphaName = `[PROD-TEST] Imported Alpha ${suffix}`
    const betaName = `[PROD-TEST] Imported Beta ${suffix}`
    const alphaLease = leasesByTenant.get(alphaName)
    const betaLease = leasesByTenant.get(betaName)
    if (!alphaLease || !betaLease) {
      throw new Error(
        `Imported leases missing expected tenants: ${JSON.stringify(leases.data).slice(0, 500)}`
      )
    }
    created.leaseIds.push(alphaLease.id, betaLease.id)
    report.generated.leaseIds = created.leaseIds
    check(
      'imported leases expose tenant identities used by billing rematch',
      leases.data
        .map((lease) => ({
          id_present: typeof lease.id === 'string' && lease.id.length > 0,
          tenant_name: lease.tenant_name,
          status: lease.status,
          pro_rata_share: lease.recovery_profile?.pro_rata_share,
        }))
        .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
      [
        {
          id_present: true,
          tenant_name: alphaName,
          status: 'active',
          pro_rata_share: '0.2000',
        },
        {
          id_present: true,
          tenant_name: betaName,
          status: 'active',
          pro_rata_share: '0.1000',
        },
      ]
    )

    const pool = await expectJson(
      `/api/v1/properties/${imported.property_id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: `[PROD-TEST] Imported Billing Pool ${suffix}`,
          pool_type: 'operating',
          is_gross_up_applicable: true,
          gross_up_target: '0.95',
          description: 'Production E2E disposable imported billing pool',
        },
      }
    )
    created.poolIds.push(pool.id)
    report.generated.poolIds = created.poolIds

    const mapping = await expectJson(
      `/api/v1/properties/${imported.property_id}/pool-mappings`,
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
    created.mappingIds.push(mapping.id)
    report.generated.mappingIds = created.mappingIds

    const upload = await uploadGlCsv({
      propertyId: imported.property_id,
      fileName: glFileName,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Operating Repairs,01/15/2026,8000.00,OpsCo,Imported lease repairs',
        '6100,Operating Repairs,07/15/2026,4000.00,OpsCo,Imported lease services',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'gl upload creates clean rows for imported-lease reconciliation',
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

    const job = await expectJson('/api/v1/reconciliation/calculate', {
      method: 'POST',
      status: 202,
      body: {
        property_id: imported.property_id,
        period_start: periodStart,
        period_end: periodEnd,
        force_recalculate: true,
      },
    })
    created.jobId = job.job_id
    report.generated.jobId = job.job_id
    check(
      'reconciliation calculate queues imported-lease job',
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
    created.snapshotIds.push(...completedJob.snapshot_ids)
    report.generated.snapshotIds = created.snapshotIds
    check(
      'reconciliation job completes both imported leases',
      {
        status: completedJob.status,
        processed_leases: completedJob.processed_leases,
        total_leases: completedJob.total_leases,
        snapshot_count: completedJob.snapshot_ids.length,
        potential_recovery_total: completedJob.potential_recovery_total,
      },
      {
        status: 'completed',
        processed_leases: 2,
        total_leases: 2,
        snapshot_count: 2,
        potential_recovery_total: '4275.00',
      }
    )

    const snapshots = []
    for (const snapshotId of completedJob.snapshot_ids) {
      snapshots.push(
        await expectJson(
          `/api/v1/reconciliation/snapshots/${snapshotId}?include_trace=false`,
          { status: 200 }
        )
      )
    }
    const snapshotsByLease = new Map(
      snapshots.map((snapshot) => [snapshot.lease_id, snapshot])
    )
    const alphaSnapshot = snapshotsByLease.get(alphaLease.id)
    const betaSnapshot = snapshotsByLease.get(betaLease.id)
    if (!alphaSnapshot || !betaSnapshot) {
      throw new Error(
        `Snapshots missing imported leases: ${JSON.stringify(snapshots).slice(0, 500)}`
      )
    }
    check(
      'draft snapshots have deterministic imported-lease recovery math',
      {
        lease_ids: [...snapshotsByLease.keys()].sort(),
        status_values: snapshots.map((snapshot) => snapshot.status).sort(),
        alpha: pickSnapshotMath(alphaSnapshot),
        beta: pickSnapshotMath(betaSnapshot),
      },
      {
        lease_ids: created.leaseIds.slice().sort(),
        status_values: ['draft', 'draft'],
        alpha: {
          lease_id: alphaLease.id,
          total_operating_expenses: '12000.00',
          grossed_up_expenses: '14250.00',
          tenant_share_after_cap: '2850.00',
          total_recovery: '2850.00',
        },
        beta: {
          lease_id: betaLease.id,
          total_operating_expenses: '12000.00',
          grossed_up_expenses: '14250.00',
          tenant_share_after_cap: '1425.00',
          total_recovery: '1425.00',
        },
      }
    )

    const finalize = await expectJson(
      '/api/v1/reconciliation/snapshots/finalize-batch',
      {
        method: 'POST',
        status: 200,
        body: {
          property_id: imported.property_id,
          period_start: periodStart,
          period_end: periodEnd,
        },
      }
    )
    check(
      'batch finalize promotes imported-lease snapshots',
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

    const rematchName = `[PROD-TEST] Imported Rematch ${suffix}`
    const billingUpload = await uploadBillingCsv({
      propertyId: imported.property_id,
      periodStart,
      periodEnd,
      fileName: billingFileName,
      csv: [
        'Tenant,Suite,Billed Amount',
        csvRow([alphaName, '100', '2600.00']),
        csvRow([rematchName, 'Suite-REVIEW', '1400.00']),
      ].join('\n'),
    })
    const reviewRow = billingUpload.items.find(
      (item) => item.match_status === 'needs_review'
    )
    if (!reviewRow) {
      throw new Error(
        `Expected one needs_review billing row: ${JSON.stringify(billingUpload).slice(0, 500)}`
      )
    }
    report.generated.actualBilledIds = billingUpload.items.map(
      (item) => item.id
    )
    check(
      'actual billed upload matches imported suite and flags rematch row',
      {
        source_type: billingUpload.source_type,
        total_billed: normalizeDecimal(billingUpload.total_billed),
        row_count: billingUpload.row_count,
        matched_row_count: billingUpload.matched_row_count,
        unmatched_row_count: billingUpload.unmatched_row_count,
        items: normalizeBillingItems(billingUpload.items),
        warning_count: billingUpload.warnings.length,
      },
      {
        source_type: 'csv_import',
        total_billed: '4000.00',
        row_count: 2,
        matched_row_count: 1,
        unmatched_row_count: 1,
        items: normalizeBillingItems([
          {
            tenant_name: alphaName,
            billed_amount: '2600',
            suite: '100',
            lease_id: alphaLease.id,
            match_status: 'matched',
          },
          {
            tenant_name: rematchName,
            billed_amount: '1400',
            suite: 'Suite-REVIEW',
            lease_id: null,
            match_status: 'needs_review',
          },
        ]),
        warning_count: 1,
      }
    )

    const rematch = await expectJson('/api/v1/actual-billed/matches', {
      method: 'PUT',
      status: 200,
      body: {
        property_id: imported.property_id,
        period_start: periodStart,
        period_end: periodEnd,
        matches: [{ actual_billed_id: reviewRow.id, lease_id: betaLease.id }],
      },
    })
    check('actual billed rematch binds review row to imported beta lease', rematch, {
      success: true,
      updated_count: 1,
    })

    const billedList = await expectJson(
      `/api/v1/actual-billed/${imported.property_id}?period_start=${periodStart}&period_end=${periodEnd}`,
      { status: 200 }
    )
    check(
      'actual billed list reflects imported-lease match and rematch',
      {
        property_id: billedList.property_id,
        period_start: billedList.period_start,
        period_end: billedList.period_end,
        total_billed: normalizeDecimal(billedList.total_billed),
        items: normalizeBilledList(billedList.items),
      },
      {
        property_id: imported.property_id,
        period_start: periodStart,
        period_end: periodEnd,
        total_billed: '4000.00',
        items: normalizeBilledList([
          {
            lease_id: alphaLease.id,
            tenant_name: alphaName,
            billed_amount: '2600.00',
            source_type: 'csv_import',
          },
          {
            lease_id: betaLease.id,
            tenant_name: rematchName,
            billed_amount: '1400.00',
            source_type: 'csv_import',
          },
        ]),
      }
    )

    const leakage = await expectJson(
      `/api/v1/leakage/${imported.property_id}?period_start=${periodStart}&period_end=${periodEnd}&include_drafts=false`,
      { status: 200 }
    )
    check(
      'leakage joins finalized reconciliation with imported actual billed',
      {
        property_id: leakage.property_id,
        capveri_calculated: leakage.capveri_calculated,
        actual_billed: leakage.actual_billed,
        leakage: leakage.leakage,
        has_reconciliation_data: leakage.has_reconciliation_data,
        has_gl_data: leakage.has_gl_data,
        has_billing_data: leakage.has_billing_data,
        breakdown_names: leakage.breakdown
          .map((row) => row.tenant_name)
          .sort(),
      },
      {
        property_id: imported.property_id,
        capveri_calculated: expectedCalculated,
        actual_billed: expectedActualBilled,
        leakage: expectedLeakage,
        has_reconciliation_data: true,
        has_gl_data: true,
        has_billing_data: true,
        breakdown_names: [alphaName, betaName, rematchName].sort(),
      }
    )

    const comparison = await expectJson(
      `/api/v1/comparison/${imported.property_id}?period_start=${periodStart}&period_end=${periodEnd}&include_drafts=false&tolerance=0.01`,
      { status: 200 }
    )
    check(
      'comparison read uses imported billed rows without persisting a run',
      {
        property_id: comparison.property_id,
        period_start: comparison.period_start,
        period_end: comparison.period_end,
        total_capveri_correct: comparison.total_capveri_correct,
        total_actual_charged: comparison.total_actual_charged,
        tenant_count: comparison.tenants.length,
        tenant_names: comparison.tenants
          .map((tenant) => tenant.tenant_name)
          .sort(),
      },
      {
        property_id: imported.property_id,
        period_start: periodStart,
        period_end: periodEnd,
        total_capveri_correct: expectedCalculated,
        total_actual_charged: expectedActualBilled,
        tenant_count: 2,
        tenant_names: [alphaName, rematchName].sort(),
      }
    )

    const storedRuns = await expectJson(
      `/api/v1/comparison/${imported.property_id}/runs?limit=10&offset=0`,
      { status: 200 }
    )
    check('comparison read route leaves no stored runs', storedRuns, [])
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

async function uploadRentRoll({ fileName, csv, fields }) {
  const form = new FormData()
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value)
  }
  const response = await fetch(`${apiUrl}/api/v1/rent-roll/import`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  if (response.status !== 201) {
    throw new Error(
      `POST /api/v1/rent-roll/import returned ${response.status}, expected 201: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function uploadGlCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const response = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
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

async function uploadBillingCsv({
  propertyId,
  periodStart,
  periodEnd,
  fileName,
  csv,
}) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('period_start', periodStart)
  form.set('period_end', periodEnd)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const response = await fetch(`${apiUrl}/api/v1/actual-billed/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(
      `POST /api/v1/actual-billed/upload returned ${response.status}, expected 200: ${text.slice(0, 500)}`
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
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete actual billed rows', () =>
      deleteActualBilledRows(created.propertyId, period)
    )
    await attemptCleanup(failures, 'verify actual billed rows deleted', () =>
      expectDeletedBillingRows(created.propertyId, period)
    )
    for (const mappingId of created.mappingIds) {
      await attemptCleanup(failures, `delete pool mapping ${mappingId}`, () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/pool-mappings/${mappingId}`
        )
      )
    }
    for (const poolId of created.poolIds) {
      await attemptCleanup(failures, `delete expense pool ${poolId}`, () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`
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
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function deleteActualBilledRows(propertyId, period) {
  const path = `/api/v1/actual-billed/${propertyId}?period_start=${period.periodStart}&period_end=${period.periodEnd}`
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  const ok = response.status === 200
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `DELETE ${path} returned ${response.status}, expected 200: ${text.slice(0, 500)}`
    )
  }
}

async function expectDeletedBillingRows(propertyId, period) {
  const path = `/api/v1/actual-billed/${propertyId}?period_start=${period.periodStart}&period_end=${period.periodEnd}`
  const list = await expectJson(path, { status: 200 })
  const ok =
    list.total_billed === '0' &&
    Array.isArray(list.items) &&
    list.items.length === 0
  report.cleanup.push({
    path,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      total_billed: list.total_billed,
      item_count: list.items?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Actual billed rows still present after delete: ${JSON.stringify(list).slice(0, 500)}`
    )
  }
}

async function expectNoSnapshots(propertyId, period) {
  const path = `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${period.periodStart}&period_end=${period.periodEnd}&page=1&size=10`
  const list = await expectJson(path, { status: 200 })
  const ok =
    list.total === 0 && Array.isArray(list.items) && list.items.length === 0
  report.cleanup.push({
    path,
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

function rentRollCsv(propertyName) {
  const suffix = propertyName.slice(-8)
  return [
    'Yardi Voyager Rent Roll',
    `Property: ${propertyName}`,
    'Address: 901 Imported Billing Way, Austin, TX 78701',
    '',
    'Unit Number,Rentable SF,Usable SF,Floor,Tenant,Lease Start,Lease End,Monthly Rent,CAM %',
    `100,5000,4500,1,[PROD-TEST] Imported Alpha ${suffix},01/01/2026,12/31/2030,10000,20%`,
    `200,3000,2700,2,[PROD-TEST] Imported Beta ${suffix},01/01/2026,12/31/2030,8000,10%`,
    '300,2000,1800,3,,,,0,',
    'Total,10000,9000,,,,,,',
  ].join('\n')
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

function normalizeBillingItems(items) {
  return items
    .map((item) => ({
      tenant_name: item.tenant_name,
      billed_amount: normalizeDecimal(item.billed_amount),
      suite: item.suite,
      lease_id: item.lease_id,
      match_status: item.match_status,
    }))
    .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name))
}

function normalizeBilledList(items) {
  return items
    .map((item) => ({
      lease_id: item.lease_id,
      tenant_name: item.tenant_name,
      billed_amount: normalizeDecimal(item.billed_amount),
      source_type: item.source_type,
    }))
    .sort(
      (left, right) =>
        left.tenant_name.localeCompare(right.tenant_name) ||
        left.billed_amount.localeCompare(right.billed_amount)
    )
}

function pickSnapshotMath(snapshot) {
  return pick(snapshot, [
    'lease_id',
    'total_operating_expenses',
    'grossed_up_expenses',
    'tenant_share_after_cap',
    'total_recovery',
  ])
}

function normalizeDecimal(value) {
  return centsToDecimal(parseCents(value))
}

function parseCents(value) {
  const text = String(value).trim()
  const match = /^(?<sign>-)?(?<whole>\d+)(?:\.(?<fraction>\d{1,2}))?$/u.exec(
    text
  )
  if (!match?.groups) {
    throw new Error(`Invalid decimal money value: ${text}`)
  }
  const whole = BigInt(match.groups.whole)
  const fraction = BigInt((match.groups.fraction ?? '').padEnd(2, '0'))
  const cents = whole * 100n + fraction
  return match.groups.sign ? -cents : cents
}

function centsToDecimal(cents) {
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const whole = absolute / 100n
  const fraction = String(absolute % 100n).padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

function csvRow(values) {
  return values
    .map((value) => {
      const text = String(value)
      return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    })
    .join(',')
}

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]))
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
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
