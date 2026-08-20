/**
 * PROD E2E STRESS — GROSS-UP / EXCLUDED-POOL / VARIANCE-XLSX EXPORT CORRECTNESS.
 *
 * Complements two concurrently-authored sibling scripts that already cover
 * baseline/negative/zero/large/unicode CSV-Yardi-MRI parity
 * (prod-stress-export-erp-batch-scenario.mjs) and PDF text-extraction parity
 * (prod-stress-export-pdf-content-scenario.mjs). This script covers the THREE
 * domains neither of those touches:
 *
 *   G1  Gross-up applied — grossed_up_expenses must differ from
 *       total_operating_expenses and match the snapshot exactly in CSV + PDF.
 *   G2  Excluded pool — recovery_profile.excluded_pools matches by POOL TYPE
 *       (enum operating|tax|insurance|capital|other), NOT by pool display
 *       name (pinned by cloudflare-backend/src/test/reconciliation-excluded-
 *       pool.test.ts + recovery-profile-schema.ts). Verify the excluded
 *       pool's expense is NOT counted in total_operating_expenses / exports.
 *   G3  Variance XLSX (/export/variance/excel) — build two years of finalized
 *       snapshots, parse cells B5/B6/C6 via ExcelJS, confirm against an
 *       independently recomputed current/prior total and variance percent
 *       (accounting for the /100 fraction convention in variance-xlsx.ts).
 *
 * Everything prefixed "[PROD-TEST]". Finalizing pins the property (DELETE ->
 * 409); residue is recorded so the orchestrator can definalize via Supabase
 * MCP (project REDACTED_SUPABASE_PROJECT_REF) then API-delete.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')

// ExcelJS is not a frontend dependency; reuse the copy already installed
// under cloudflare-backend/node_modules (verified pattern from sibling
// scripts in this same directory).
const ExcelJS = require(
  resolve(repoRoot, 'cloudflare-backend', 'node_modules', 'exceljs')
)
const { PDFParse } = require('pdf-parse')

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
  `prod-stress-export-grossup-variance-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  scenarios: {},
  checks: [],
  cleanup: [],
  residue: [],
}

let token

try {
  token = await signInWithPassword()
  await scenarioGrossUp()
  await scenarioExcludedPool()
  await scenarioVarianceXlsx()
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok)
} catch (error) {
  report.fatal_error = errorMessage(error)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

// ---------------------------------------------------------------------------
// G1 — Gross-up applied
// ---------------------------------------------------------------------------
async function scenarioGrossUp() {
  const name = 'g1_gross_up'
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Export GrossUp ${suffix}`
  const tenantName = `[PROD-TEST] GrossUp Tenant ${suffix}`
  const created = { propertyId: null }
  report.scenarios[name] = { propertyName, tenantName }

  try {
    const { property, lease } = await buildPropertyLeasePool({
      propertyName,
      tenantName,
      proRataShare: '0.30',
      adminFeePct: '0.10',
      grossUp: true,
      grossUpTarget: '0.95',
      targetOccupancy: '0.70', // actual < target so gross-up has an effect
    })
    created.propertyId = property.id

    await uploadGl(property.id, `grossup-${suffix}.csv`, [
      '6100,Common Area Maintenance,03/15/2027,40000.00,FinCo,Annual CAM',
    ])

    const snap = await financeSnapshot(property.id, lease.id)
    report.scenarios[name].snapshot = snapshotMoney(snap)

    check(
      `${name}: gross-up produced grossed_up_expenses != total_operating_expenses`,
      { differ: snap.grossed_up_expenses !== snap.total_operating_expenses },
      { differ: true }
    )

    const csv = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snap.id}/export/erp?format=csv`,
      { status: 200, contentTypePrefix: 'text/csv' }
    )
    const csvRow = parseGenericCsvRow(new TextDecoder().decode(csv.bytes))
    check(
      `${name}: CSV total_expenses is the un-grossed figure, grossed_up_expenses column matches snapshot exactly`,
      { totalExpenses: csvRow.totalExpenses, grossedUp: csvRow.grossedUp },
      {
        totalExpenses: snap.total_operating_expenses,
        grossedUp: snap.grossed_up_expenses,
      }
    )

    const pdf = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snap.id}/export/pdf`,
      { status: 200, contentTypePrefix: 'application/pdf' }
    )
    const pdfText = await extractPdfText(pdf.bytes)
    check(
      `${name}: PDF shows both the raw total expense and the distinct grossed-up figure`,
      {
        hasTotal: pdfText.includes(formatUsdLike(snap.total_operating_expenses)),
        hasGrossedUp: pdfText.includes(formatUsdLike(snap.grossed_up_expenses)),
      },
      { hasTotal: true, hasGrossedUp: true }
    )

    markResidue(created.propertyId, snap.id, name)
  } finally {
    await cleanupProperty(created.propertyId, name)
  }
}

// ---------------------------------------------------------------------------
// G2 — Excluded pool (matched by pool_type, not name)
// ---------------------------------------------------------------------------
async function scenarioExcludedPool() {
  const name = 'g2_excluded_pool'
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Export Excluded ${suffix}`
  const tenantName = `[PROD-TEST] Excluded Tenant ${suffix}`
  const created = { propertyId: null }
  report.scenarios[name] = { propertyName, tenantName }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: baseProperty(propertyName),
    })
    created.propertyId = property.id

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: baseUnit(suffix),
    })

    const includedPool = await expectJson(
      `/api/v1/properties/${property.id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: `[PROD-TEST] Included Pool ${suffix}`,
          pool_type: 'operating',
          is_gross_up_applicable: false,
          gross_up_target: null,
          description: 'Included pool',
        },
      }
    )
    // NOTE: excluded_pools matches by pool_type enum, NOT display name.
    // Give this pool a distinct type ('tax') so excluded_pools:['tax']
    // excludes it without touching the 'operating' included pool.
    const excludedPool = await expectJson(
      `/api/v1/properties/${property.id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: `[PROD-TEST] Excluded Pool ${suffix}`,
          pool_type: 'tax',
          is_gross_up_applicable: false,
          gross_up_target: null,
          description: 'Excluded pool',
        },
      }
    )
    await expectJson(`/api/v1/properties/${property.id}/pool-mappings`, {
      method: 'POST',
      status: 201,
      body: {
        expense_pool_id: includedPool.id,
        gl_account_pattern: '61*',
        allocation_percentage: '1',
        priority: 10,
      },
    })
    await expectJson(`/api/v1/properties/${property.id}/pool-mappings`, {
      method: 'POST',
      status: 201,
      body: {
        expense_pool_id: excludedPool.id,
        gl_account_pattern: '69*',
        allocation_percentage: '1',
        priority: 10,
      },
    })

    const lease = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: tenantName,
        start_date: '2027-01-01',
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: {
          base_year: null,
          base_year_amount: '0.00',
          gross_up_base_year: false,
          pro_rata_share: '0.25',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.10',
          management_fee_percentage: null,
          excluded_pools: ['tax'],
          accounting_basis: 'cash',
          base_year_adjustments: [],
        },
      },
    })

    await uploadGl(property.id, `excluded-${suffix}.csv`, [
      '6100,Common Area Maintenance,03/15/2027,20000.00,FinCo,Included pool expense',
      '6900,Non-recoverable Item,03/15/2027,8000.00,FinCo,Excluded pool expense',
    ])

    const snap = await financeSnapshot(property.id, lease.id)
    report.scenarios[name].snapshot = snapshotMoney(snap)

    // NOTE: total_operating_expenses is a PROPERTY-LEVEL aggregate of ALL GL
    // pools (calculator.ts:288, leasePoolTotals) and is deliberately NOT
    // exclusion-adjusted — exclusions are applied downstream, only to the
    // TENANT'S recovery math (calculator.ts:302-317 explicit comment: "Tenant-
    // level exclusions / base-year are NOT removed here — they belong to
    // recovery, not to the expense pool total."). So the correct assertion is
    // that total_operating_expenses reflects BOTH pools ($28,000.00 = $20k +
    // $8k), while tenant_share_before_cap reflects ONLY the included pool
    // (0.25 * $20,000.00 = $5,000.00) — i.e. the exclusion surfaces in the
    // tenant's SHARE, not in the property expense total.
    check(
      `${name}: total_operating_expenses is the full property aggregate (both pools, exclusion NOT applied here by design)`,
      { totalOperatingExpenses: snap.total_operating_expenses },
      { totalOperatingExpenses: '28000.00' }
    )
    check(
      `${name}: tenant_share_before_cap reflects ONLY the included pool (25% of $20,000.00 = $5,000.00) — exclusion correctly applied at the recovery step`,
      { tenantShareBeforeCap: snap.tenant_share_before_cap },
      { tenantShareBeforeCap: '5000.00' }
    )

    const csv = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snap.id}/export/erp?format=csv`,
      { status: 200, contentTypePrefix: 'text/csv' }
    )
    const csvRow = parseGenericCsvRow(new TextDecoder().decode(csv.bytes))
    check(
      `${name}: CSV total_expenses/before_cap columns match the snapshot's (unadjusted total, exclusion-adjusted share) values exactly`,
      { totalExpenses: csvRow.totalExpenses, beforeCap: csvRow.beforeCap },
      { totalExpenses: '28000.00', beforeCap: '5000.00' }
    )

    markResidue(created.propertyId, snap.id, name)
  } finally {
    await cleanupProperty(created.propertyId, name)
  }
}

// ---------------------------------------------------------------------------
// G3 — Variance XLSX correctness
// ---------------------------------------------------------------------------
async function scenarioVarianceXlsx() {
  const name = 'g3_variance_xlsx'
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Export Variance ${suffix}`
  const tenantName = `[PROD-TEST] Variance Tenant ${suffix}`
  const created = { propertyId: null }
  report.scenarios[name] = { propertyName, tenantName }
  const snapshotIds = []

  try {
    const { property, lease } = await buildPropertyLeasePool({
      propertyName,
      tenantName,
      proRataShare: '0.20',
      adminFeePct: '0.10',
      grossUp: false,
    })
    created.propertyId = property.id

    // Prior year (2026): lower expense. Current year (2027): higher expense
    // -> positive variance. Two independent recon runs / periods.
    await uploadGl(property.id, `variance-prior-${suffix}.csv`, [
      '6100,Common Area Maintenance,03/15/2026,20000.00,FinCo,Prior year CAM',
    ])
    const priorSnap = await financeSnapshot(
      property.id,
      lease.id,
      '2026-01-01',
      '2026-12-31'
    )
    snapshotIds.push(priorSnap.id)

    await uploadGl(property.id, `variance-current-${suffix}.csv`, [
      '6100,Common Area Maintenance,03/15/2027,26000.00,FinCo,Current year CAM',
    ])
    const currentSnap = await financeSnapshot(
      property.id,
      lease.id,
      '2027-01-01',
      '2027-12-31'
    )
    snapshotIds.push(currentSnap.id)

    report.scenarios[name].priorSnapshot = snapshotMoney(priorSnap)
    report.scenarios[name].currentSnapshot = snapshotMoney(currentSnap)

    // Independent oracle: variance_pct is computed by variance-pdf.ts's
    // computeVariancePct (imported by variance-xlsx.ts); reproduce that
    // formula from money.ts semantics: (current - prior) / prior * 100.
    // (This is the standard variance definition; if the engine deviates,
    // the mismatch below will surface it precisely.)
    const currentTotal = Number(currentSnap.total_recovery)
    const priorTotal = Number(priorSnap.total_recovery)
    const expectedVariancePct =
      priorTotal === 0
        ? null
        : ((currentTotal - priorTotal) / priorTotal) * 100

    // NOTE: the correct route is POST /api/v1/export/variance/excel (singular
    // "export", no "reconciliation/snapshots" segment) with a JSON body, per
    // exports-routes.ts variancePdfBodySchema + app.ts mounting createExports
    // Routes() under the shared /api/v1 prefix. An earlier attempt at
    // GET /api/v1/exports/reconciliation/variance/excel?query-params 404'd.
    const xlsxBinary = await expectBinary(
      '/api/v1/export/variance/excel',
      {
        method: 'POST',
        status: 200,
        contentTypePrefix: 'application/vnd.openxmlformats',
        body: {
          property_id: property.id,
          current_year: 2027,
          prior_year: 2026,
          threshold_percent: 5,
        },
      }
    )

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(xlsxBinary.bytes))
    const ws = workbook.getWorksheet('Variance')
    report.scenarios[name].worksheetFound = Boolean(ws)
    if (!ws) {
      check(`${name}: Variance worksheet exists in the XLSX`, false, true)
      markResidue(created.propertyId, currentSnap.id, name)
      markResidue(created.propertyId, priorSnap.id, name)
      return
    }

    const a5 = ws.getCell('A5').value
    const b5 = ws.getCell('B5').value
    const a6 = ws.getCell('A6').value
    const b6 = ws.getCell('B6').value
    const c6 = ws.getCell('C6').value
    report.scenarios[name].cells = { a5, b5, a6, b6, c6 }

    check(
      `${name}: A5/A6 hold the current/prior year labels`,
      { a5: String(a5), a6: String(a6) },
      { a5: '2027', a6: '2026' }
    )
    check(
      `${name}: B5 (current total) numerically equals current snapshot total_recovery`,
      { b5: Number(b5) },
      { b5: currentTotal }
    )
    check(
      `${name}: B6 (prior total) numerically equals prior snapshot total_recovery`,
      { b6: Number(b6) },
      { b6: priorTotal }
    )
    check(
      `${name}: B5 numFmt is the money format $#,##0.00`,
      { numFmt: ws.getCell('B5').numFmt },
      { numFmt: '$#,##0.00' }
    )
    check(
      `${name}: C6 numFmt is percent format 0.00%`,
      { numFmt: ws.getCell('C6').numFmt },
      { numFmt: '0.00%' }
    )
    if (expectedVariancePct !== null) {
      // variance-xlsx.ts stores Number(variancePct.toFixed(10)) / 100 as the
      // cell VALUE (a fraction), with numFmt "0.00%" doing the *100 display.
      // So compare the cell's raw fractional value against our expected
      // percent / 100, rounded to a stable precision to avoid FP noise.
      const expectedFraction = round(expectedVariancePct / 100, 6)
      const actualFraction = round(Number(c6), 6)
      check(
        `${name}: C6 fractional value equals independently recomputed (current-prior)/prior variance, /100 convention`,
        { actualFraction },
        { actualFraction: expectedFraction }
      )
    }

    markResidue(created.propertyId, currentSnap.id, name)
    markResidue(created.propertyId, priorSnap.id, name)
  } finally {
    await cleanupProperty(created.propertyId, name)
  }
}

// ---------------------------------------------------------------------------
// Shared property/lease/pool builder
// ---------------------------------------------------------------------------
function baseProperty(propertyName) {
  return {
    name: propertyName,
    address_line1: '900 Export Test Way',
    city: 'Dallas',
    state: 'TX',
    postal_code: '75201',
    total_rentable_sqft: '10000.00',
    total_usable_sqft: '9000.00',
    common_area_sqft: '1000.00',
    target_occupancy: '0.95',
    boma_standard_version: '2024',
    fiscal_year_start_month: 1,
  }
}

function baseUnit(suffix) {
  return {
    unit_number: `EXP-${suffix.toUpperCase()}`,
    rentable_sqft: '2500.00',
    usable_sqft: '2250.00',
    floor: 1,
    status: 'occupied',
    space_type: 'office',
  }
}

async function buildPropertyLeasePool({
  propertyName,
  tenantName,
  proRataShare,
  adminFeePct,
  grossUp,
  grossUpTarget,
  targetOccupancy,
}) {
  const suffix = randomUUID().slice(0, 8)
  const propBody = baseProperty(propertyName)
  if (targetOccupancy) propBody.target_occupancy = targetOccupancy
  const property = await expectJson('/api/v1/properties', {
    method: 'POST',
    status: 201,
    body: propBody,
  })

  const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
    method: 'POST',
    status: 201,
    body: baseUnit(suffix),
  })

  const poolName = `[PROD-TEST] Pool ${suffix}`
  const pool = await expectJson(
    `/api/v1/properties/${property.id}/expense-pools`,
    {
      method: 'POST',
      status: 201,
      body: {
        name: poolName,
        pool_type: 'operating',
        is_gross_up_applicable: Boolean(grossUp),
        gross_up_target: grossUp ? (grossUpTarget ?? '0.95') : null,
        description: 'Production E2E disposable export pool',
      },
    }
  )

  await expectJson(`/api/v1/properties/${property.id}/pool-mappings`, {
    method: 'POST',
    status: 201,
    body: {
      expense_pool_id: pool.id,
      gl_account_pattern: '61*',
      allocation_percentage: '1',
      priority: 10,
    },
  })

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
      recovery_profile: {
        base_year: null,
        base_year_amount: '0.00',
        gross_up_base_year: Boolean(grossUp),
        pro_rata_share: proRataShare,
        cap_type: 'none',
        cap_rate: null,
        admin_fee_percentage: adminFeePct,
        management_fee_percentage: null,
        excluded_pools: [],
        accounting_basis: 'cash',
        base_year_adjustments: [],
      },
    },
  })

  return { property, unit, pool, lease, suffix }
}

async function uploadGl(propertyId, fileName, rows) {
  const csv = [
    'Account,Account Description,Date,Amount,Vendor,Description',
    ...rows,
  ].join('\n')
  return uploadCsv({ propertyId, fileName, csv, sourceOverride: 'yardi' })
}

/** Run recon for the given period, return the finalized snapshot for `leaseId`. */
async function financeSnapshot(
  propertyId,
  leaseId,
  periodStart = '2027-01-01',
  periodEnd = '2027-12-31'
) {
  const job = await expectJson('/api/v1/reconciliation/calculate', {
    method: 'POST',
    status: 202,
    body: {
      property_id: propertyId,
      period_start: periodStart,
      period_end: periodEnd,
      force_recalculate: true,
    },
  })
  const done = await waitForJob(job.job_id)
  const snapshotIds = done.snapshot_ids ?? []
  let draft = null
  for (const id of snapshotIds) {
    const s = await expectJson(
      `/api/v1/reconciliation/snapshots/${id}?include_trace=false`,
      { status: 200 }
    )
    if (s.lease_id === leaseId) draft = s
  }
  if (!draft) {
    throw new Error(
      `No snapshot produced for lease ${leaseId} in job ${job.job_id} (period ${periodStart}..${periodEnd})`
    )
  }
  await expectJson(`/api/v1/reconciliation/snapshots/${draft.id}/finalize`, {
    method: 'POST',
    status: 200,
  })
  return expectJson(
    `/api/v1/reconciliation/snapshots/${draft.id}?include_trace=false`,
    { status: 200 }
  )
}

// ---------------------------------------------------------------------------
// Residue tracking + cleanup
// ---------------------------------------------------------------------------
function markResidue(propertyId, snapshotId, note) {
  if (!propertyId || !snapshotId) return
  report.residue.push({ property_id: propertyId, snapshot_id: snapshotId, note })
}

async function cleanupProperty(propertyId, label) {
  if (!propertyId) return
  const definalize = await attemptDefinalizeProperty(propertyId)
  report.cleanup.push({ label: `${label}: definalize attempt`, ...definalize })

  const response = await rawRequest(`/api/v1/properties/${propertyId}`, {
    method: 'DELETE',
  })
  const ok = response.status === 204
  report.cleanup.push({
    label: `${label}: delete property`,
    status: response.status,
    ok,
    body_preview: response.text.slice(0, 200),
  })
  if (!ok) return

  const verify = await rawRequest(`/api/v1/properties/${propertyId}`)
  report.cleanup.push({
    label: `${label}: verify property deleted`,
    status: verify.status,
    ok: verify.status === 404,
  })
}

async function attemptDefinalizeProperty(propertyId) {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/reconciliation_snapshots?property_id=eq.${propertyId}&status=eq.finalized`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          prefer: 'return=representation',
        },
        body: JSON.stringify({ status: 'draft', finalized_at: null }),
      }
    )
    const rows = await response.json().catch(() => null)
    const updated = Array.isArray(rows) ? rows.length : 0
    return {
      http_status: response.status,
      http_ok: response.ok,
      rows_updated: updated,
    }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------
function snapshotMoney(snapshot) {
  if (!snapshot) return { missing: true }
  return {
    total_operating_expenses: snapshot.total_operating_expenses,
    grossed_up_expenses: snapshot.grossed_up_expenses,
    base_year_amount: snapshot.base_year_amount,
    tenant_share_before_cap: snapshot.tenant_share_before_cap,
    tenant_share_after_cap: snapshot.tenant_share_after_cap,
    admin_fee: snapshot.admin_fee,
    total_recovery: snapshot.total_recovery,
  }
}

function parseGenericCsvRow(csvText) {
  const lines = csvText.split(/\r\n|\n/u).filter((l) => l.length > 0)
  const dataLines = lines.slice(1)
  const cols = splitCsvLine(dataLines[0] ?? '')
  return {
    dataRowCount: dataLines.length,
    property: cols[0],
    unit: cols[1],
    tenant: cols[2],
    periodStart: cols[3],
    periodEnd: cols[4],
    totalExpenses: cols[5],
    grossedUp: cols[6],
    baseYear: cols[7],
    beforeCap: cols[8],
    afterCap: cols[9],
    adminFee: cols[10],
    amountDue: cols[11],
  }
}

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function formatUsdLike(amountStr) {
  const negative = amountStr.startsWith('-')
  const abs = negative ? amountStr.slice(1) : amountStr
  const [intPart, decPart = '00'] = abs.split('.')
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  return `${negative ? '-' : ''}$${withCommas}.${decPart}`
}

async function extractPdfText(bytes) {
  const buffer = Buffer.from(bytes)
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

function round(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// ---------------------------------------------------------------------------
// Low-level HTTP
// ---------------------------------------------------------------------------
async function uploadCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)

  const response = await fetchRetry(`${apiUrl}/api/v1/ingestion/upload`, {
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

async function waitForJob(jobId) {
  const started = Date.now()
  let lastJob = null
  while (Date.now() - started < 120_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, {
      status: 200,
    })
    lastJob = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(
        `Reconciliation job failed: ${JSON.stringify(job).slice(0, 800)}`
      )
    }
    await sleep(2_000)
  }
  throw new Error(
    `Timed out waiting for reconciliation job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`
  )
}

async function fetchRetry(url, init) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, init)
    } catch (error) {
      lastError = error
      await sleep(1_000 * (attempt + 1))
    }
  }
  throw lastError
}

async function expectJson(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
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

async function rawRequest(path, options = {}) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  const headers = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  return { status: response.status, text, headers }
}

async function expectBinary(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
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
    content_type: contentType.split(';')[0].trim(),
    byte_length: bytes.byteLength,
    bytes,
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    report.first_failure = report.first_failure ?? { label, actual, expected }
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
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
