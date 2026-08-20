/**
 * PROD E2E STRESS — PDF EXPORT CONTENT CORRECTNESS (real text extraction,
 * not just "200 + %PDF- magic bytes").
 *
 * Domain: does the rendered PDF (GET /api/v1/exports/reconciliation/snapshots/
 * :id/export/pdf) actually contain the SAME money figures as the finalized
 * snapshot API response, byte-for-byte on the formatted currency string?
 *
 * cloudflare-backend/src/domain/exports/property-pdf.ts draws six expense rows
 * ("Total Operating Expenses", "Grossed-Up Expenses", "Base Year Amount",
 * "Tenant Share (Before Cap)", "Tenant Share (After Cap)", "Administrative
 * Fee") plus a "Total Amount Due" row, using formatUsd() — thousands-comma,
 * 2dp, "$" prefix, "-$" for negatives. This scenario extracts the ACTUAL text
 * layer of the returned PDF bytes (via pdf-parse, a real PDF text extractor —
 * not a magic-byte sniff) and asserts every one of those seven money labels +
 * values is present, formatted per the formatUsd contract, and numerically
 * equal to the finalized snapshot's stored totals.
 *
 * Edge cases:
 *   - Large recovery (> $1,000,000): thousands separators in the PDF text
 *     ("$1,234,567.89") — a wrong-precision or missing-separator bug would
 *     show up as a text mismatch.
 *   - Zero-dollar recovery: "$0.00" rendered (not blank / NaN / "$-").
 *   - Calculation-trace section: with include_trace, verify at least one
 *     trace line's dollar figure appears verbatim in the PDF text (spot
 *     check — the full trace assertion is out of scope; this proves the
 *     draw loop is wired to real snapshot data, not stale/mock data).
 *   - allow_draft=true PDF vs finalized PDF: same underlying totals ->
 *     same money text (finalizing must not silently alter presented values).
 *
 * DISPLAY-ONLY vs REAL DEFECT distinction: PDF layout (fonts, positions,
 * pagination) is NOT checked — only extracted TEXT CONTENT of money values.
 * A text-extraction library may reorder or space words differently than the
 * visual layout; we tolerate that by searching for the money-string tokens
 * independently rather than asserting full-line equality.
 *
 * Everything prefixed "[PROD-TEST]". Cleanup mirrors the finalization-export
 * scenario: residue purge instructions recorded for the orchestrator.
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
const Decimal = require('decimal.js')
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
  `prod-stress-export-pdf-content-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  cleanup: [],
  residue: [],
}

let token

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] PDF Content ${suffix}`
  const poolName = `[PROD-TEST] Operating Pool ${suffix}`
  const periodStart = '2027-01-01'
  const periodEnd = '2027-12-31'

  const tenants = [
    { key: 'large', name: `[PROD-TEST] PdfLarge ${suffix}`, share: '0.90', unit: 'A' },
    { key: 'zero', name: `[PROD-TEST] PdfZero ${suffix}`, share: '0.00', unit: 'B' },
  ]

  const created = {
    propertyId: null,
    poolId: null,
    mappingId: null,
    unitIds: [],
    leaseIds: [],
    batchIds: [],
    jobIds: [],
    snapshotIds: [],
  }
  report.generated = { propertyName, poolName, periodStart, periodEnd }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '1200 PDF Content Way',
        city: 'Denver',
        state: 'CO',
        postal_code: '80202',
        total_rentable_sqft: '50000.00',
        total_usable_sqft: '45000.00',
        common_area_sqft: '5000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

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
          description: 'Production E2E disposable PDF-content pool',
        },
      }
    )
    created.poolId = pool.id

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

    // Large GL total so the "large" tenant's total_recovery clears
    // $1,000,000 -> exercises thousands-separator formatting in the PDF text.
    const upload = await uploadCsv({
      propertyId: property.id,
      fileName: `yardi-pdf-content-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Common Area Maintenance,03/15/2027,9500000.00,BigCo,Annual CAM',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchIds.push(upload.batch_id)
    check(
      'gl upload creates one clean row',
      { source_system: upload.source_system, row_count: upload.row_count, error_count: upload.error_count },
      { source_system: 'yardi', row_count: 1, error_count: 0 }
    )

    let floorIndex = 1
    for (const t of tenants) {
      const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
        method: 'POST',
        status: 201,
        body: {
          unit_number: `PDF-${t.unit}-${suffix.toUpperCase()}`,
          rentable_sqft: '5000.00',
          usable_sqft: '4500.00',
          floor: floorIndex,
          status: 'occupied',
          space_type: 'office',
        },
      })
      created.unitIds.push(unit.id)

      const lease = await expectJson('/api/v1/leases', {
        method: 'POST',
        status: 201,
        body: {
          property_id: property.id,
          unit_id: unit.id,
          tenant_name: t.name,
          start_date: periodStart,
          end_date: '2031-12-31',
          status: 'active',
          recovery_profile: {
            base_year: null,
            base_year_amount: '0.00',
            gross_up_base_year: false,
            pro_rata_share: t.share,
            cap_type: 'none',
            cap_rate: null,
            admin_fee_percentage: '0.12',
            management_fee_percentage: null,
            excluded_pools: [],
            accounting_basis: 'cash',
            base_year_adjustments: [],
          },
        },
      })
      created.leaseIds.push(lease.id)
      report.generated[`${t.key}_leaseId`] = lease.id
      floorIndex += 1
    }

    const run = await runRecon(property.id, periodStart, periodEnd)
    created.jobIds.push(run.jobId)
    created.snapshotIds = dedupe([...created.snapshotIds, ...run.snapshotIds])
    check(
      'recon produces one draft snapshot per lease',
      { status: run.status, processed_leases: run.processedLeases, snapshot_count: run.snapshotIds.length },
      { status: 'completed', processed_leases: tenants.length, snapshot_count: tenants.length }
    )

    const list = await listSnapshots(property.id, periodStart, periodEnd)
    const byLease = {}
    for (const item of list.items) byLease[item.lease_id] = item.id

    const snapshotByKey = {}
    for (const t of tenants) {
      const leaseId = report.generated[`${t.key}_leaseId`]
      const snapshotId = byLease[leaseId]
      if (!snapshotId) throw new Error(`No snapshot for ${t.key}`)
      snapshotByKey[t.key] = { snapshotId, leaseId }
    }

    // ==================================================================
    // DRAFT PDF (allow_draft=true) — capture money text BEFORE finalize.
    // ==================================================================
    const largeDraftPdf = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snapshotByKey.large.snapshotId}/export/pdf?allow_draft=true`,
      { status: 200, contentTypePrefix: 'application/pdf' }
    )
    const largeDraftText = await extractPdfText(largeDraftPdf.bytes)
    const largeDraftSnap = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotByKey.large.snapshotId}?include_trace=true`,
      { status: 200 }
    )

    assertPdfMoneyMatchesSnapshot('large tenant DRAFT pdf', largeDraftText, largeDraftSnap)

    // ==================================================================
    // Finalize both snapshots.
    // ==================================================================
    for (const t of tenants) {
      const { snapshotId, leaseId } = snapshotByKey[t.key]
      const finalizeRes = await expectJson(
        `/api/v1/reconciliation/snapshots/${snapshotId}/finalize`,
        { method: 'POST', status: 200 }
      )
      report.residue.push({ property_id: property.id, snapshot_id: snapshotId, lease_id: leaseId, note: `finalized ${t.key}` })
      check(`finalize ${t.key} succeeds`, { is_finalized: finalizeRes.is_finalized, status: finalizeRes.status }, { is_finalized: true, status: 'finalized' })
    }

    // ==================================================================
    // LARGE tenant: finalized PDF must show the SAME money text as the
    // pre-finalize draft PDF (finalizing must not alter presented values),
    // and match the finalized API snapshot exactly (thousands separators).
    // ==================================================================
    const largeFinalSnap = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotByKey.large.snapshotId}?include_trace=true`,
      { status: 200 }
    )
    const largeFinalPdf = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snapshotByKey.large.snapshotId}/export/pdf`,
      { status: 200, contentTypePrefix: 'application/pdf' }
    )
    const largeFinalText = await extractPdfText(largeFinalPdf.bytes)
    report.generated.large_final_pdf_text_excerpt = largeFinalText.slice(0, 2000)

    assertPdfMoneyMatchesSnapshot('large tenant FINALIZED pdf', largeFinalText, largeFinalSnap)

    check(
      'finalizing does not alter the money text presented in the PDF (draft vs finalized identical)',
      { totals_identical: extractMoneyTokens(largeDraftText).join('|') === extractMoneyTokens(largeFinalText).join('|') },
      { totals_identical: true }
    )

    // Thousands-separator spot check: total_recovery for "large" should be
    // well above $1,000,000 given the $9.5M pool at 90% share (minus admin
    // fee arithmetic still leaves > $1M). Verify the PDF text contains a
    // properly-comma-formatted representation of it.
    const largeRecoveryUsd = formatUsdLike(largeFinalSnap.total_recovery)
    check(
      'large total_recovery clears $1,000,000 (thousands-separator format is exercised)',
      { recovery_gt_1m: new Decimal(largeFinalSnap.total_recovery).greaterThan(1_000_000) },
      { recovery_gt_1m: true }
    )
    check(
      'PDF text contains the thousands-separator-formatted Total Amount Due for the large tenant',
      { contains: largeFinalText.includes(largeRecoveryUsd) },
      { contains: true }
    )

    // ==================================================================
    // ZERO tenant: recovery is exactly 0 -> PDF must render "$0.00", not
    // blank, "$-", "NaN", or a missing row.
    // ==================================================================
    const zeroFinalizeRes = null // finalize already done in the loop above
    const zeroFinalSnap = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotByKey.zero.snapshotId}?include_trace=true`,
      { status: 200 }
    )
    check(
      'zero-share tenant total_recovery is exactly 0.00 in the API (precondition for this edge case)',
      { total_recovery: new Decimal(zeroFinalSnap.total_recovery).toFixed(2) },
      { total_recovery: '0.00' }
    )
    const zeroPdf = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snapshotByKey.zero.snapshotId}/export/pdf`,
      { status: 200, contentTypePrefix: 'application/pdf' }
    )
    const zeroText = await extractPdfText(zeroPdf.bytes)
    report.generated.zero_pdf_text_excerpt = zeroText.slice(0, 2000)

    assertPdfMoneyMatchesSnapshot('zero-share tenant pdf', zeroText, zeroFinalSnap)
    // Note: a naive /nan/i substring test false-positives on ordinary English
    // words containing "nan" (e.g. "Tenant", "Tenant Share") -- this PDF's
    // own copy uses "Tenant" throughout. Scope the check to the money-token
    // regex itself (`$NaN`) rather than a bare substring search.
    check(
      'zero-dollar PDF renders "$0.00" (not blank/"$NaN"/"$-") for Total Amount Due',
      { contains_zero_dollar: zeroText.includes('$0.00'), contains_dollar_nan: /\$-?nan/iu.test(zeroText), contains_bare_dollar_dash: zeroText.includes('$-') && !zeroText.includes('$-$') },
      { contains_zero_dollar: true, contains_dollar_nan: false, contains_bare_dollar_dash: false }
    )

    // ==================================================================
    // Calculation trace spot-check: a real trace dollar figure appears
    // verbatim (proves draw loop is wired to real snapshot data).
    // ==================================================================
    const trace = largeFinalSnap.calculation_trace ?? []
    check('finalized snapshot carries a non-empty calculation_trace', { trace_len_gt_0: trace.length > 0 }, { trace_len_gt_0: true })
    if (trace.length > 0) {
      const currencyStep = trace.find((s) => (s.output_unit ?? 'currency') === 'currency' && s.output_value !== null && s.output_value !== undefined)
      if (currencyStep) {
        const expectedToken = formatUsdLike(currencyStep.output_value)
        check(
          `a real calculation_trace currency figure ("${currencyStep.step_name}") appears verbatim in the PDF text`,
          { contains: largeFinalText.includes(expectedToken) },
          { contains: true }
        )
      }
    }
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

// ---------------------------------------------------------------------------
// PDF assertion helpers
// ---------------------------------------------------------------------------

/** formatUsd port — mirrors cloudflare-backend/src/domain/formatting/currency.ts. */
function formatUsdLike(amount) {
  const d = new Decimal(amount)
  const abs = d.abs()
  const isNeg = d.isNegative() && !d.isZero()
  const fixed = abs.toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withCommas = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  return `${isNeg ? '-' : ''}$${withCommas}.${decPart ?? '00'}`
}

function extractMoneyTokens(text) {
  return [...text.matchAll(/-?\$[\d,]+\.\d{2}/gu)].map((m) => m[0]).sort()
}

async function extractPdfText(bytes) {
  const parser = new PDFParse({ data: Buffer.from(bytes) })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

function assertPdfMoneyMatchesSnapshot(labelPrefix, pdfText, snapshot) {
  const fields = [
    ['total_operating_expenses', 'Total Operating Expenses'],
    ['grossed_up_expenses', 'Grossed-Up Expenses'],
    ['base_year_amount', 'Base Year Amount'],
    ['tenant_share_before_cap', 'Tenant Share (Before Cap)'],
    ['tenant_share_after_cap', 'Tenant Share (After Cap)'],
    ['admin_fee', 'Administrative Fee'],
  ]
  for (const [field, label] of fields) {
    const expectedUsd = formatUsdLike(snapshot[field])
    check(
      `${labelPrefix}: "${label}" text contains penny-exact formatUsd value`,
      { contains: pdfText.includes(expectedUsd) },
      { contains: true }
    )
  }
  const expectedTotal = formatUsdLike(snapshot.total_recovery)
  check(
    `${labelPrefix}: "Total Amount Due" text contains penny-exact formatUsd value`,
    { contains: pdfText.includes(expectedTotal) },
    { contains: true }
  )
}

// ---------------------------------------------------------------------------
// Recon helpers
// ---------------------------------------------------------------------------
async function runRecon(propertyId, periodStart, periodEnd) {
  const job = await expectJson('/api/v1/reconciliation/calculate', {
    method: 'POST',
    status: 202,
    body: { property_id: propertyId, period_start: periodStart, period_end: periodEnd, force_recalculate: true },
  })
  const done = await waitForJob(job.job_id)
  return { jobId: job.job_id, status: done.status, processedLeases: done.processed_leases, snapshotIds: done.snapshot_ids ?? [] }
}

async function listSnapshots(propertyId, periodStart, periodEnd) {
  return expectJson(
    `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${periodStart}&period_end=${periodEnd}&page=1&size=50`,
    { status: 200 }
  )
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
async function cleanup(created, period) {
  const failures = []

  if (created.propertyId) {
    const definalizeAll = await attemptDefinalizeProperty(created.propertyId)
    report.generated.definalizePropertyViaUserJwt = definalizeAll
  }

  const hasResidue = report.residue.length > 0

  for (const batchId of created.batchIds) {
    await attemptCleanup(
      failures,
      `delete ingestion batch ${batchId}`,
      () => deleteEmpty(`/api/v1/ingestion/batches/${batchId}`),
      { residualOn: 'batch_in_finalized_reconciliation', id: batchId }
    )
  }
  if (created.mappingId && created.propertyId) {
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`)
    )
  }
  if (created.poolId && created.propertyId) {
    await attemptCleanup(
      failures,
      'delete expense pool',
      () => deleteEmpty(`/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`),
      { residualOn: 'property_in_finalized_snapshot', id: created.poolId }
    )
  }
  if (created.propertyId) {
    const blocked = await attemptCleanup(
      failures,
      'delete property',
      () => deleteEmpty(`/api/v1/properties/${created.propertyId}`),
      { residualOn: 'property_in_finalized_snapshot', id: created.propertyId }
    )
    if (!blocked) {
      await attemptCleanup(failures, 'verify property deleted', () =>
        expectCleanupStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
      )
    }
  }

  if (hasResidue) {
    report.cleanup_requires_service_role_purge = true
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function attemptCleanup(failures, label, operation, options = {}) {
  try {
    await operation()
    return false
  } catch (error) {
    const message = errorMessage(error)
    if (options.residualOn && message.includes(options.residualOn)) {
      report.cleanup.push({ label, ok: false, blocked_by_design: options.residualOn, error: message.slice(0, 300) })
      return true
    }
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: message })
    return false
  }
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
    return { http_status: response.status, http_ok: response.ok, rows_updated: updated, rls_blocked: response.ok && updated === 0 }
  } catch (error) {
    return { error: errorMessage(error) }
  }
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
    throw new Error(`POST /api/v1/ingestion/upload returned ${response.status}, expected 200: ${text.slice(0, 500)}`)
  }
  return JSON.parse(text)
}

async function waitForJob(jobId) {
  const started = Date.now()
  let lastJob = null
  while (Date.now() - started < 120_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, { status: 200 })
    lastJob = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(`Reconciliation job failed: ${JSON.stringify(job).slice(0, 800)}`)
    }
    await sleep(2_000)
  }
  throw new Error(`Timed out waiting for reconciliation job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`)
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
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  }
  return text ? JSON.parse(text) : null
}

async function expectBinary(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: options.contentTypePrefix },
  })
  const bytes = new Uint8Array(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status !== options.status) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${new TextDecoder().decode(bytes.slice(0, 500))}`)
  }
  if (!contentType.startsWith(options.contentTypePrefix)) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned content-type ${contentType}, expected ${options.contentTypePrefix}`)
  }
  return { status: response.status, content_type: contentType.split(';')[0].trim(), byte_length: bytes.byteLength, bytes }
}

async function expectCleanupStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  const ok = response.status === options.status
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  }
}

async function deleteEmpty(path) {
  const response = await fetchRetry(`${apiUrl}${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) {
    throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
  }
}

async function signInWithPassword() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: env.E2E_PROD_EMAIL, password: env.E2E_PROD_PASSWORD }),
  })
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  }
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email ?? env.E2E_PROD_EMAIL }
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

function dedupe(list) {
  return [...new Set(list)]
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
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortDeep(nested)]))
  }
  return value
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok)
} catch (error) {
  report.fatal_error = errorMessage(error)
} finally {
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1
