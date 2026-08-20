import { chromium } from '@playwright/test'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

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
  'E2E_PROD_APP_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`)
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const appUrl = trimSlash(env.E2E_PROD_APP_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const supabaseRef = new URL(supabaseUrl).hostname.split('.')[0]
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-reconciliation-browser-review-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl, app_url: appUrl },
  generated: {},
  auth: {},
  checks: [],
  browser: {
    requests: [],
    browser_errors: [],
    failed_responses: [],
    mutating_requests: [],
    unexpected_mutating_requests: [],
    blocked_external_requests: [],
    launched_processes: [],
    closed_processes: [],
    screenshots: [],
  },
  expected_persistent_side_effects: [
    {
      store: 'audit_log',
      reason:
        'Production DML is append-audited by database triggers; business rows are disposable and verified deleted, audit rows are retained by design.',
    },
    {
      store: 'Supabase auth access JWT',
      reason:
        'Password sign-in creates an access JWT that may remain accepted until its expires_at timestamp even after logout; the script revokes and verifies refresh-token reuse fails.',
    },
  ],
  cleanup: [],
}

let token
let session
try {
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }
  await runScenario()
  const browserMutationOk = browserMutationsMatchExpected()
  report.ok =
    browserMutationOk &&
    report.checks.every((check) => check.ok) &&
    report.browser.browser_errors.length === 0 &&
    report.browser.failed_responses.length === 0 &&
    report.browser.unexpected_mutating_requests.length === 0 &&
    report.cleanup.every((item) => item.ok)
} finally {
  if (session?.access_token) {
    await attemptTopLevelCleanup('revoke Supabase password session', () =>
      revokeSession(session)
    )
  }
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

    await runBrowserScenario({
      property,
      tenantName,
      snapshotId,
      manualAdminFee: '456.78',
    })

    const updatedSnapshot = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotId}?include_trace=false`,
      { status: 200 }
    )
    check(
      'browser manual override persists on draft snapshot',
      {
        snapshot_id: updatedSnapshot.id,
        status: updatedSnapshot.status,
        admin_fee: updatedSnapshot.admin_fee,
        property_id: updatedSnapshot.property_id,
        lease_id: updatedSnapshot.lease_id,
      },
      {
        snapshot_id: snapshotId,
        status: 'draft',
        admin_fee: '456.78',
        property_id: property.id,
        lease_id: lease.id,
      }
    )

    const history = await expectJson(
      `/api/v1/export/history?property_id=${property.id}&format=pdf&page=1&page_size=10`,
      { status: 200, retries: 2, timeoutMs: 20_000 }
    )
    check(
      'browser review flow creates no export history',
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

async function runBrowserScenario({
  property,
  tenantName,
  snapshotId,
  manualAdminFee,
}) {
  const chromiumPidsBefore = await getChromiumPids()
  const browser = await chromium.launch({ headless: true })
  const browserPids = difference(await getChromiumPids(), chromiumPidsBefore)
  report.browser.launched_processes.push({
    label: 'chromium',
    pids: browserPids,
    ok: browserPids.length > 0,
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    await blockExternalTelemetry(context)
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'reconciliation-browser-review')
    try {
      const response = await page.goto(
        `${appUrl}/properties/${property.id}/reconciliations?year=2026`,
        { waitUntil: 'networkidle', timeout: 60_000 }
      )
      check(
        'browser opens generated reconciliation page',
        {
          status: response?.status() ?? null,
          url_includes_property: page.url().includes(property.id),
        },
        {
          status: 200,
          url_includes_property: true,
        }
      )

      await page.getByTestId('reconciliation-grid').waitFor({
        state: 'visible',
        timeout: 30_000,
      })
      await page.getByText(property.name, { exact: false }).first().waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await page.getByText(tenantName, { exact: true }).first().waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      check(
        'browser renders generated draft grid',
        {
          grid_visible: await page
            .getByTestId('reconciliation-grid')
            .isVisible(),
          tenant_visible: await page
            .getByText(tenantName, { exact: true })
            .first()
            .isVisible(),
          export_button_visible: await page
            .getByTestId('export-button')
            .isVisible(),
        },
        {
          grid_visible: true,
          tenant_visible: true,
          export_button_visible: true,
        }
      )

      const row = page
        .getByTestId('grid-row')
        .filter({ has: page.getByText(tenantName, { exact: true }) })
        .first()
      await row.waitFor({ state: 'visible', timeout: 10_000 })
      check(
        'browser selects generated tenant summary row',
        {
          contains_tenant: (await row.textContent())?.includes(tenantName),
          row_type: await row.getAttribute('data-row-type'),
          row_id: await row.getAttribute('data-row-id'),
          editable_cell_count: await row.getByTestId('editable-cell').count(),
        },
        {
          contains_tenant: true,
          row_type: 'tenant_summary',
          row_id: snapshotId,
          editable_cell_count: 2,
        }
      )

      const adminFeeCell = row.getByTestId('editable-cell').nth(1)
      await adminFeeCell.dblclick()
      const input = page.getByLabel('Edit admin_fee')
      await input.waitFor({ state: 'visible', timeout: 5000 })
      await input.fill(manualAdminFee)
      check(
        'browser fills manual admin fee input',
        {
          value: await input.inputValue(),
        },
        {
          value: manualAdminFee,
        }
      )
      await page.waitForTimeout(250)

      const patchResponse = page.waitForResponse(
        (candidate) =>
          candidate.request().method() === 'PATCH' &&
          candidate.url().includes('/api/v1/reconciliation/cells/'),
        { timeout: 15_000 }
      )
      await page
        .getByLabel('Save admin_fee')
        .evaluate((button) => button.click())
      const responseAfterEdit = await patchResponse
      const cellUpdate = await responseAfterEdit.json()
      report.generated.browserCellPatch = {
        snapshotId: cellUpdate.snapshot_id ?? null,
        fieldName: cellUpdate.field_name ?? null,
        value: cellUpdate.value ?? null,
        isManualOverride: cellUpdate.is_manual_override ?? null,
      }
      check(
        'browser inline edit PATCH records manual override',
        {
          status: responseAfterEdit.status(),
          snapshot_id: cellUpdate.snapshot_id,
          field_name: cellUpdate.field_name,
          value: cellUpdate.value,
          is_manual_override: cellUpdate.is_manual_override,
        },
        {
          status: 200,
          snapshot_id: snapshotId,
          field_name: 'admin_fee',
          value: manualAdminFee,
          is_manual_override: true,
        }
      )

      await page
        .getByText(`$${Number(manualAdminFee).toFixed(2)}`, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
      await page.getByTestId('trace-button').first().click()
      await page.screenshot({
        path: resolve(outputDir, 'reconciliation-browser-review.png'),
        fullPage: true,
      })
      report.browser.screenshots.push('reconciliation-browser-review.png')
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
    await verifyProcessesExited(browserPids, 'chromium')
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

async function verifyProcessesExited(pids, label) {
  if (pids.length === 0) {
    throw new Error(`No ${label} process was observed after browser launch`)
  }
  const started = Date.now()
  while (Date.now() - started < 10_000) {
    const livePids = intersection(await getChromiumPids(), pids)
    if (livePids.length === 0) {
      report.browser.closed_processes.push({ label, pids, ok: true })
      return
    }
    await sleep(250)
  }
  const livePids = intersection(await getChromiumPids(), pids)
  report.browser.closed_processes.push({
    label,
    pids,
    live_pids: livePids,
    ok: false,
  })
  throw new Error(
    `${label} processes still running after close: ${livePids.join(', ')}`
  )
}

async function getChromiumPids() {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process | Where-Object { ($_.Name -match '^chrome-headless-shell(\\.exe)?$') -or ($_.CommandLine -match 'ms-playwright') -or ($_.CommandLine -match 'playwright_chromiumdev_profile') } | Select-Object -ExpandProperty ProcessId",
    ])
    return stdout
      .split(/\r?\n/u)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  }

  try {
    const { stdout } = await execFileAsync('pgrep', ['-f', 'chrom(e|ium)'])
    return stdout
      .split(/\r?\n/u)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  } catch {
    return []
  }
}

function difference(values, exclude) {
  const excluded = new Set(exclude)
  return values.filter((value) => !excluded.has(value)).sort((a, b) => a - b)
}

function intersection(values, include) {
  const included = new Set(include)
  return values.filter((value) => included.has(value)).sort((a, b) => a - b)
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
    if (created.unitId) {
      await attemptCleanup(failures, 'verify unit deleted by cascade', () =>
        expectStatus(
          `/api/v1/properties/${created.propertyId}/units/${created.unitId}`,
          { status: 404 }
        )
      )
    }
    if (created.leaseId) {
      await attemptCleanup(failures, 'verify lease deleted by cascade', () =>
        expectStatus(`/api/v1/leases/${created.leaseId}`, { status: 404 })
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
    if (created.mappingId) {
      await attemptCleanup(failures, 'verify pool mapping deleted', () =>
        expectStatus(
          `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`,
          { status: 404 }
        )
      )
    }
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
  const response = await fetchWithRetries(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    retries: options.retries,
    timeoutMs: options.timeoutMs,
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function fetchWithRetries(url, options = {}) {
  const retries = options.retries ?? 0
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 30_000
    )
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        retries: undefined,
        timeoutMs: undefined,
      })
    } catch (error) {
      lastError = error
      if (attempt === retries) break
      await sleep(1_000 * (attempt + 1))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
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
        apikey: supabaseAnonKey,
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
  return json
}

async function revokeSession(authSession) {
  const response = await fetch(`${supabaseUrl}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authSession.access_token}`,
      apikey: supabaseAnonKey,
    },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({
    label: 'Supabase password session revoked',
    path: '/auth/v1/logout',
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `POST /auth/v1/logout returned ${response.status}, expected 204: ${text.slice(0, 500)}`
    )
  }

  if (authSession.refresh_token) {
    const refreshResponse = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ refresh_token: authSession.refresh_token }),
      }
    )
    const refreshText = await refreshResponse.text()
    const refreshRevoked =
      refreshResponse.status === 400 || refreshResponse.status === 401
    report.cleanup.push({
      label: 'Supabase refresh token rejected after logout',
      path: '/auth/v1/token?grant_type=refresh_token',
      status: refreshResponse.status,
      ok: refreshRevoked,
      access_token_expires_at: authSession.expires_at ?? null,
      body_preview: refreshText.slice(0, 200),
    })
    if (!refreshRevoked) {
      throw new Error(
        `Refresh token was accepted after logout: ${refreshResponse.status} ${refreshText.slice(0, 500)}`
      )
    }
  }
}

async function blockExternalTelemetry(context) {
  await context.route(
    (url) => isExternalTelemetryUrl(url.toString()),
    async (route) => {
      const request = route.request()
      report.browser.blocked_external_requests.push({
        method: request.method(),
        url: redactQuery(request.url()),
      })
      await route.abort('blockedbyclient')
    }
  )
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const method = request.method()
    const url = request.url()
    report.browser.requests.push({ method, url: redactQuery(url) })
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const record = { method, url: redactQuery(url) }
      if (isCapVeriOrigin(url)) {
        report.browser.mutating_requests.push(record)
      } else if (!isExternalTelemetryUrl(url)) {
        report.browser.unexpected_mutating_requests.push(record)
      }
    }
  })
  context.on('response', (response) => {
    const status = response.status()
    const url = response.url()
    if (status >= 400 && isRelevantFailure(url)) {
      report.browser.failed_responses.push({
        status,
        url: redactQuery(url),
        method: response.request().method(),
      })
    }
  })
}

async function attemptTopLevelCleanup(label, operation) {
  try {
    await operation()
  } catch (error) {
    report.ok = false
    report.cleanup.push({
      label,
      ok: false,
      error: errorMessage(error),
    })
  }
}

async function newTrackedPage(context, label) {
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (isExpectedBlockedTelemetryConsole(message.text())) return
      report.browser.browser_errors.push({
        label,
        type: 'console',
        text: message.text().slice(0, 500),
      })
    }
  })
  page.on('pageerror', (error) => {
    report.browser.browser_errors.push({
      label,
      type: 'pageerror',
      text: error.message.slice(0, 500),
    })
  })
  return page
}

function isExpectedBlockedTelemetryConsole(text) {
  return text.includes('net::ERR_BLOCKED_BY_CLIENT')
}

async function injectSupabaseSession(context, authSession) {
  const storageKey = `sb-${supabaseRef}-auth-token`
  const storageValue = JSON.stringify({
    access_token: authSession.access_token,
    refresh_token: authSession.refresh_token,
    token_type: authSession.token_type ?? 'bearer',
    expires_at: authSession.expires_at,
    expires_in: authSession.expires_in,
    user: authSession.user,
  })
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    { key: storageKey, value: storageValue }
  )
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

function browserMutationsMatchExpected() {
  const expected = [
    {
      method: 'PATCH',
      fragment: '/api/v1/reconciliation/cells/',
    },
  ]
  const ok =
    report.browser.mutating_requests.length === expected.length &&
    expected.every((item, index) => {
      const actual = report.browser.mutating_requests[index]
      return (
        actual?.method === item.method &&
        typeof actual.url === 'string' &&
        actual.url.includes(item.fragment)
      )
    })
  report.checks.push({
    label: 'browser performs exactly one expected app mutation',
    ok,
    actual: report.browser.mutating_requests,
    expected,
  })
  return ok
}

function isRelevantFailure(url) {
  if (isExternalTelemetryUrl(url)) return false
  if (url.includes('posthog.com')) return false
  if (url.includes('sentry.io')) return false
  if (url.includes('cdn.')) return false
  return isCapVeriOrigin(url) || url.includes('supabase.co')
}

function isExternalTelemetryUrl(url) {
  if (isCloudflareRum(url)) return true
  try {
    const hostname = new URL(url).hostname
    return (
      hostname === 'posthog.com' ||
      hostname.endsWith('.posthog.com') ||
      hostname === 'sentry.io' ||
      hostname.endsWith('.sentry.io')
    )
  } catch {
    return false
  }
}

function isCapVeriOrigin(url) {
  if (isCloudflareRum(url)) return false
  return sameOrigin(url, appUrl) || sameOrigin(url, apiUrl)
}

function isCloudflareRum(url) {
  try {
    return new URL(url).pathname.startsWith('/cdn-cgi/rum')
  } catch {
    return false
  }
}

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === new URL(origin).origin
  } catch {
    return false
  }
}

function redactQuery(url) {
  try {
    const parsed = new URL(url)
    parsed.search = parsed.search ? '?[redacted]' : ''
    return parsed.toString()
  } catch {
    return url
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
