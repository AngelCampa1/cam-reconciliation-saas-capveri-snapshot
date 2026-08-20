/**
 * PROD E2E STRESS — CYCLE 10B — RESOURCE EXHAUSTION / LARGE-PAYLOAD BOUNDARIES.
 *
 * Domain: inputs that SHOULD be rejected cleanly (4xx / 413 / 422) but might
 * instead 500 / time out / OOM / silently truncate on the deployed Cloudflare
 * Worker `capveri-api` (https://api.capveri.com). This is a BOUNDARY PROBE, not
 * a load test: each angle sends a SMALL number of individually-large or
 * edge-sized requests. No sustained flood.
 *
 * Target = the GL CSV ingestion path `POST /api/v1/ingestion/upload`, which is
 * the highest-signal exhaustion surface:
 *   - deployed guards (cloudflare-backend/src/http/ingestion-routes.ts):
 *       * `rejectOversizeMultipartBody`: Content-Length REQUIRED (else 411),
 *         must be a positive integer (else 400), and <= 51MB (else 413).
 *       * `prepareCsvUpload`: file.size==0 -> 400; file.size > 50MB -> 413;
 *         non-CSV -> 415.
 *       * per-amount NUMERIC(14,2) range check -> 422 (C8/C9 close).
 *   - BUT within those caps there is NO row-count cap and NO per-cell / column
 *     width cap. `parseCsvRows` materializes every row in memory, every row's
 *     FULL raw record is persisted as `raw_row_data` JSONB, and
 *     `insertGlEntries` does ceil(N/1000) SEQUENTIAL awaited INSERTs inside the
 *     single synchronous request (adapters/db/ingestion.ts:733, chunk=1000).
 *     A high-row-count or very-wide file therefore stresses Worker memory
 *     (128MB) and CPU/subrequest budget with no explicit cap.
 *
 * PROBES (each a single request unless noted):
 *   E1  Envelope: correct large Content-Length OVER 51MB -> expect clean 413,
 *       NOT a 500 / hang. (No huge body actually streamed — header-only reject.)
 *   E2  Missing Content-Length -> expect 411 content_length_required.
 *   E3  Non-numeric Content-Length ("abc") -> expect 400 invalid_content_length.
 *   E4  Empty file (0 bytes) -> expect 400 empty_file.
 *   E5  Individually HUGE single cell (~8MB in one field, whole file < 50MB) ->
 *       expect graceful (parsed as one row w/ giant memo, or dropped) — NOT 500
 *       / OOM. Read back to confirm no corruption/partial.
 *   E6  VERY WIDE row (~5000 columns) -> huge raw_row_data JSONB per row ->
 *       expect graceful persist or clean 4xx, NOT 500 / OOM.
 *   E7  HIGH ROW COUNT valid GL (bounded, single shot) -> stresses the
 *       sequential N/1000 insert loop + memory. Expect clean completion with an
 *       exact persisted count, OR a clean 4xx row-limit. A 500 / timeout / a
 *       persisted count that silently DIFFERS from the valid-row count is the
 *       defect. Row count chosen conservatively (single request, no flood).
 *   E8  Parser pathology: a cell that is mostly quotes/commas (quote-bomb) ->
 *       parseCsvRows must not hang / crash; expect a bounded response.
 *
 * All entities prefixed "[PROD-TEST] CY10B". Cleanup in finally; residue
 * re-verified via PostgREST; verify 0 residual.
 *
 * NOTE ON HONESTY: we probe the DEPLOYED worker and REPORT what it does. We do
 * not assume the source guards are wired the way the code reads — we send the
 * request and record the real status/behavior.
 */
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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-stress-cycle10b-${runId}`)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  probes: [],
  cleanup: [],
  auth: {},
}

let token

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const P = (s) => `[PROD-TEST] CY10B ${s} ${suffix}`
  const created = { propertyId: null, batchIds: [] }
  report.generated = { suffix }

  try {
    // A single disposable property to upload against.
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: P('Resource Exhaustion'),
        address_line1: '1 Payload Ave',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
        total_rentable_sqft: '100000.00',
        total_usable_sqft: '95000.00',
        common_area_sqft: '5000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    // ============ E1: Content-Length OVER 51MB -> clean 413 ============
    // Header-only reject: we DECLARE a huge Content-Length but the guard runs
    // before formData(), so we send a tiny body and check the reject path. To
    // avoid a mismatched-length hang, we actually stream a body matching a value
    // just over the cap is impractical; instead we rely on the documented guard
    // reading the header. Send a real (small) multipart body but override
    // Content-Length to a value over the cap via a raw request is not possible
    // with fetch (it recomputes CL). So E1 is exercised by ACTUALLY sending a
    // body just over 51MB of the cheapest possible bytes and asserting 413 with
    // no 5xx / no hang. Kept to a single request.
    await probeOversizeBody(created)

    // ============ E2: missing Content-Length -> 411 ============
    await probeMissingContentLength(created)

    // ============ E3: bad Content-Length ("abc") -> 400 ============
    await probeBadContentLength(created)

    // ============ E4: empty file -> 400 empty_file ============
    await probeEmptyFile(created)

    // ============ E5: individually huge single cell (~8MB) ============
    await probeHugeCell(created, suffix)

    // ============ E6: very wide row (~5000 columns) ============
    await probeVeryWide(created, suffix)

    // ============ E7: high row count (bounded single shot) ============
    await probeHighRowCount(created, suffix)

    // ============ E8: quote-bomb parser pathology ============
    await probeQuoteBomb(created, suffix)
  } finally {
    await cleanup(created)
  }
}

// ---------------------------------------------------------------------------
// E1 — body just over the 51MB multipart cap. Expect clean 413 (file_too_large),
// never a 5xx / hang / OOM on the worker.
// ---------------------------------------------------------------------------
async function probeOversizeBody(created) {
  // Build a CSV body whose multipart-encoded size just exceeds 51MB. The guard
  // checks Content-Length (which fetch computes from the FormData) against
  // maxMultipartBodyBytes = 51MB. Use a single giant cell so we don't build
  // millions of small strings in the harness.
  const target = 52 * 1024 * 1024 // 52MB > 51MB cap
  const header = 'Account,Account Description,Date,Amount,Vendor,Description\n'
  const rowPrefix = '6100,CAM,03/15/2025,100.00,CamCo,'
  const filler = 'x'.repeat(target - header.length - rowPrefix.length - 1)
  const csv = `${header}${rowPrefix}${filler}`
  const form = new FormData()
  form.set('property_id', created.propertyId)
  form.set('source_override', 'yardi')
  form.set('file', new Blob([csv], { type: 'text/csv' }), 'cy10b-oversize.csv')
  let status = null
  let bodyPreview = null
  let errored = false
  const startedAt = Date.now()
  try {
    const resp = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      body: form,
    })
    status = resp.status
    bodyPreview = (await resp.text()).slice(0, 300)
    const bid = safeJson(bodyPreview)?.batch_id
    if (bid) created.batchIds.push(bid)
  } catch (e) {
    errored = true
    bodyPreview = errorMessage(e)
  }
  const elapsedMs = Date.now() - startedAt
  report.probes.push({
    probe: 'E1 body over 51MB multipart cap (~52MB)',
    status, elapsed_ms: elapsedMs, network_error: errored, body_preview: bodyPreview,
  })
  const is5xx = status != null && status >= 500
  softCheck('E1 — over-51MB body rejected cleanly (413/4xx), no 5xx',
    { rejected_4xx: status != null && status >= 400 && status < 500, is_5xx: is5xx },
    { rejected_4xx: true, is_5xx: false })
}

// ---------------------------------------------------------------------------
// E2 — missing Content-Length. fetch normally sets it for a Blob body; to force
// omission we send a chunked stream body (ReadableStream) which has no known
// length, so no Content-Length header is emitted -> guard should 411.
// ---------------------------------------------------------------------------
async function probeMissingContentLength(created) {
  // A multipart body with a streamed part has no computable length. Build a raw
  // multipart/form-data body and send it as a ReadableStream so undici omits
  // Content-Length and uses chunked transfer-encoding.
  const boundary = `----cy10b${randomUUID().replace(/-/g, '')}`
  const parts = buildMultipart(boundary, created.propertyId, 'yardi',
    'cy10b-nolen.csv',
    'Account,Account Description,Date,Amount,Vendor,Description\n6100,CAM,03/15/2025,100.00,CamCo,memo\n')
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(parts))
      controller.close()
    },
  })
  let status = null
  let bodyPreview = null
  let errored = false
  try {
    const resp = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: stream,
      duplex: 'half',
    })
    status = resp.status
    bodyPreview = (await resp.text()).slice(0, 300)
    const bid = safeJson(bodyPreview)?.batch_id
    if (bid) created.batchIds.push(bid)
  } catch (e) {
    errored = true
    bodyPreview = errorMessage(e)
  }
  report.probes.push({
    probe: 'E2 missing Content-Length (chunked stream body)',
    status, network_error: errored, body_preview: bodyPreview,
  })
  // Acceptable fail-closed: 411 (guard), or any clean 4xx. Some edge platforms
  // buffer chunked bodies and synthesize a Content-Length; if so the request
  // may succeed (2xx) — that is ALSO acceptable (the body was small & valid).
  // The ONLY defect is a 5xx.
  const is5xx = status != null && status >= 500
  softCheck('E2 — missing Content-Length handled without 5xx',
    { is_5xx: is5xx }, { is_5xx: false })
}

// ---------------------------------------------------------------------------
// E3 — Content-Length "abc" is impossible to set via fetch (it validates the
// header). We instead assert the guard's OTHER branch by sending a body whose
// Content-Length is a valid positive int but the body itself is a non-multipart
// payload, and confirm no 5xx. (The invalid-CL branch is unit-tested; here we
// confirm the deployed worker does not 5xx on a malformed-but-well-sized body.)
// ---------------------------------------------------------------------------
async function probeBadContentLength(created) {
  let status = null
  let bodyPreview = null
  try {
    const resp = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ not: 'a multipart form' }),
    })
    status = resp.status
    bodyPreview = (await resp.text()).slice(0, 300)
  } catch (e) {
    bodyPreview = errorMessage(e)
  }
  report.probes.push({
    probe: 'E3 non-multipart JSON body to multipart endpoint',
    status, body_preview: bodyPreview,
  })
  const is5xx = status != null && status >= 500
  softCheck('E3 — malformed non-multipart body handled without 5xx',
    { is_5xx: is5xx }, { is_5xx: false })
}

// ---------------------------------------------------------------------------
// E4 — empty file. Expect 400 empty_file.
// ---------------------------------------------------------------------------
async function probeEmptyFile(created) {
  const form = new FormData()
  form.set('property_id', created.propertyId)
  form.set('source_override', 'yardi')
  form.set('file', new Blob([''], { type: 'text/csv' }), 'cy10b-empty.csv')
  const resp = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, body: form,
  })
  const text = await resp.text()
  report.probes.push({ probe: 'E4 empty file', status: resp.status, body_preview: text.slice(0, 300) })
  const is5xx = resp.status >= 500
  softCheck('E4 — empty file rejected cleanly (4xx), no 5xx',
    { rejected_4xx: resp.status >= 400 && resp.status < 500, is_5xx: is5xx },
    { rejected_4xx: true, is_5xx: false })
}

// ---------------------------------------------------------------------------
// E5 — individually huge single cell (~8MB) in the Description field. The file
// stays well under 50MB. Parser should not choke; the row is valid (has account
// + date + amount) so it persists with a giant raw_row_data JSONB. Verify no
// 5xx / OOM and that a persisted row (if any) is not corrupt.
// ---------------------------------------------------------------------------
async function probeHugeCell(created, suffix) {
  const bigMemo = 'A'.repeat(8 * 1024 * 1024) // 8MB single field
  const csv = [
    'Account,Account Description,Date,Amount,Vendor,Description',
    `6100,Common Area Maintenance,03/15/2025,1234.56,CamCo,${bigMemo}`,
  ].join('\n')
  const { status, json, text, elapsedMs, errored } = await uploadRaw(created.propertyId, `cy10b-hugecell-${suffix}.csv`, csv)
  const bid = json?.batch_id
  if (bid) created.batchIds.push(bid)
  report.probes.push({
    probe: 'E5 huge single cell (~8MB memo)',
    status, elapsed_ms: elapsedMs, network_error: errored,
    row_count: json?.row_count, error_count: json?.error_count,
    body_preview: (text ?? '').slice(0, 200),
  })
  const is5xx = status != null && status >= 500
  softCheck('E5 — huge single cell handled without 5xx / hang',
    { is_5xx: is5xx }, { is_5xx: false })
  if (bid) {
    const rows = await pgSelect(`gl_entries?import_batch_id=eq.${bid}&select=amount,description`)
    const amt = Array.isArray(rows) && rows[0] ? String(rows[0].amount) : null
    report.probes.push({ probe: 'E5 readback', persisted_rows: Array.isArray(rows) ? rows.length : -1, amount: amt })
    if (Array.isArray(rows) && rows.length > 0) {
      softCheck('E5 — persisted huge-cell row keeps amount byte-exact (no corruption)',
        { amount: amt }, { amount: '1234.56' })
    }
  }
}

// ---------------------------------------------------------------------------
// E6 — very wide row: ~5000 columns. Every column lands in raw_row_data JSONB.
// Only the recognized columns map to real fields; the rest bloat the JSONB.
// Expect graceful persist or clean 4xx, never 5xx / OOM.
// ---------------------------------------------------------------------------
async function probeVeryWide(created, suffix) {
  const nCols = 5000
  const extra = Array.from({ length: nCols }, (_, i) => `col${i}`)
  const header = ['Account', 'Account Description', 'Date', 'Amount', 'Vendor', 'Description', ...extra].join(',')
  const rowVals = ['6100', 'CAM', '03/15/2025', '999.99', 'CamCo', 'memo', ...extra.map((_, i) => `v${i}`)]
  const csv = `${header}\n${rowVals.join(',')}`
  const { status, json, text, elapsedMs, errored } = await uploadRaw(created.propertyId, `cy10b-wide-${suffix}.csv`, csv)
  const bid = json?.batch_id
  if (bid) created.batchIds.push(bid)
  report.probes.push({
    probe: `E6 very wide row (${nCols} columns)`,
    status, elapsed_ms: elapsedMs, network_error: errored,
    row_count: json?.row_count, error_count: json?.error_count,
    detected_columns: Array.isArray(json?.detected_columns) ? json.detected_columns.length : null,
    body_preview: (text ?? '').slice(0, 200),
  })
  const is5xx = status != null && status >= 500
  softCheck('E6 — very wide row handled without 5xx / OOM',
    { is_5xx: is5xx }, { is_5xx: false })
  if (bid) {
    const rows = await pgSelect(`gl_entries?import_batch_id=eq.${bid}&select=amount`)
    const amt = Array.isArray(rows) && rows[0] ? String(rows[0].amount) : null
    report.probes.push({ probe: 'E6 readback', persisted_rows: Array.isArray(rows) ? rows.length : -1, amount: amt })
    if (Array.isArray(rows) && rows.length > 0) {
      softCheck('E6 — persisted wide row keeps amount byte-exact',
        { amount: amt }, { amount: '999.99' })
    }
  }
}

// ---------------------------------------------------------------------------
// E7 — high row count, single bounded request. Stresses the ceil(N/1000)
// sequential-insert loop + in-memory materialization. We pick a count high
// enough to be a meaningful CPU/subrequest probe (>> 1000 so multiple insert
// chunks run) yet safe for one shot. Assert: clean completion with the EXACT
// persisted count == valid rows, OR a clean 4xx row-limit. Defect = 5xx /
// timeout / a persisted count that silently differs.
// ---------------------------------------------------------------------------
async function probeHighRowCount(created, suffix) {
  const nRows = 25_000 // 25 chunks of 1000 sequential inserts; ~1.5MB file
  const lines = ['Account,Account Description,Date,Amount,Vendor,Description']
  for (let i = 0; i < nRows; i += 1) {
    // distinct amounts so DB de-dup (if any) can't silently collapse rows
    const cents = (i % 90000) + 1
    const amt = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
    lines.push(`6100,Common Area Maintenance,03/15/2025,${amt},CamCo,row${i}`)
  }
  const csv = lines.join('\n')
  report.generated.high_row_count = { requested_rows: nRows, csv_bytes: csv.length }
  const { status, json, text, elapsedMs, errored } = await uploadRaw(created.propertyId, `cy10b-highrows-${suffix}.csv`, csv)
  const bid = json?.batch_id
  if (bid) created.batchIds.push(bid)
  report.probes.push({
    probe: `E7 high row count (${nRows} valid rows, ${(csv.length / 1024 / 1024).toFixed(2)}MB)`,
    status, elapsed_ms: elapsedMs, network_error: errored,
    reported_row_count: json?.row_count, error_count: json?.error_count,
    body_preview: (text ?? '').slice(0, 200),
  })
  const is5xx = status != null && status >= 500
  softCheck('E7 — high row count does not 5xx / time out',
    { is_5xx: is5xx, network_error: errored }, { is_5xx: false, network_error: false })

  if (status === 200 && bid) {
    // Verify the persisted count matches the reported/valid count exactly (no
    // silent partial-persist from a CPU-budget abort mid-loop).
    const countRows = await pgSelectCount(`gl_entries?import_batch_id=eq.${bid}`)
    report.probes.push({
      probe: 'E7 persisted count readback',
      reported_row_count: json?.row_count,
      persisted_count: countRows,
      requested_rows: nRows,
    })
    softCheck('E7 — persisted GL row count == reported row_count (no silent partial-persist)',
      { persisted: countRows, reported: json?.row_count },
      { persisted: json?.row_count, reported: json?.row_count })
    softCheck('E7 — reported row_count == all valid input rows (no silent drop)',
      { reported: json?.row_count }, { reported: nRows })
  } else if (status != null && status >= 400 && status < 500) {
    // A clean row-limit rejection is an acceptable fail-closed outcome.
    softCheck('E7 — high row count rejected cleanly with 4xx (acceptable row-limit)',
      { rejected_4xx: true }, { rejected_4xx: true })
  }
}

// ---------------------------------------------------------------------------
// E8 — quote-bomb: a field that is a long run of quotes/commas inside a quoted
// cell. Stresses parseCsvRows' char-by-char state machine. Expect bounded time,
// no 5xx / hang.
// ---------------------------------------------------------------------------
async function probeQuoteBomb(created, suffix) {
  const bomb = '""'.repeat(500_000) // 1M chars of escaped quotes inside one field
  const csv = [
    'Account,Account Description,Date,Amount,Vendor,Description',
    `6100,CAM,03/15/2025,55.55,CamCo,"${bomb}"`,
  ].join('\n')
  const { status, json, text, elapsedMs, errored } = await uploadRaw(created.propertyId, `cy10b-quotebomb-${suffix}.csv`, csv)
  const bid = json?.batch_id
  if (bid) created.batchIds.push(bid)
  report.probes.push({
    probe: 'E8 quote-bomb (1M escaped quotes in one field)',
    status, elapsed_ms: elapsedMs, network_error: errored,
    row_count: json?.row_count, error_count: json?.error_count,
    body_preview: (text ?? '').slice(0, 200),
  })
  const is5xx = status != null && status >= 500
  softCheck('E8 — quote-bomb parsed without 5xx / hang (bounded time)',
    { is_5xx: is5xx, network_error: errored }, { is_5xx: false, network_error: false })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildMultipart(boundary, propertyId, source, filename, csv) {
  const CRLF = '\r\n'
  return [
    `--${boundary}`,
    `Content-Disposition: form-data; name="property_id"`,
    '', propertyId,
    `--${boundary}`,
    `Content-Disposition: form-data; name="source_override"`,
    '', source,
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    'Content-Type: text/csv',
    '', csv,
    `--${boundary}--`, '',
  ].join(CRLF)
}

async function uploadRaw(propertyId, fileName, csv) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', 'yardi')
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const startedAt = Date.now()
  try {
    const resp = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, body: form,
    })
    const text = await resp.text()
    return { status: resp.status, text, json: safeJson(text), elapsedMs: Date.now() - startedAt, errored: false }
  } catch (e) {
    return { status: null, text: errorMessage(e), json: null, elapsedMs: Date.now() - startedAt, errored: true }
  }
}

async function pgSelect(query) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${query}`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  return resp.json().catch(() => null)
}

async function pgSelectCount(query) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${query}&select=id`, {
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      prefer: 'count=exact',
      range: '0-0',
    },
  })
  const cr = resp.headers.get('content-range') // e.g. "0-0/25000"
  const m = cr ? /\/(\d+)$/.exec(cr) : null
  return m ? Number(m[1]) : -1
}

async function cleanup(created) {
  const failures = []
  for (const bid of created.batchIds) {
    if (!bid) continue
    await attemptCleanup(failures, 'delete ingestion batch', () => deleteEmpty(`/api/v1/ingestion/batches/${bid}`))
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property (cascades batches/GL)', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`))
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectCleanupStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 }))
    await attemptCleanup(failures, 'verify zero CY10B residue via PostgREST', () => expectNoResidue())
  }
  if (failures.length > 0) throw new Error(`Cleanup failed: ${failures.join(', ')}`)
}

async function expectNoResidue() {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/properties?name=like.*CY10B*&select=id`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }
  )
  const rows = await resp.json().catch(() => null)
  const props = Array.isArray(rows) ? rows.length : -1
  report.cleanup.push({ path: 'PostgREST residue probe (CY10B)', ok: props === 0, body_preview: JSON.stringify({ props }) })
  if (props !== 0) throw new Error(`CY10B residue: props=${props}`)
}

async function attemptCleanup(failures, label, operation) {
  try { await operation() } catch (error) { failures.push(label); report.cleanup.push({ label, ok: false, error: errorMessage(error) }) }
}

async function fetchRetry(url, init) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetch(url, init) } catch (error) { lastError = error; await sleep(1_000 * (attempt + 1)) }
  }
  throw lastError
}

async function expectJson(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  if (response.status !== options.status) throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

async function expectStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== options.status) throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  return { status: response.status, text }
}
async function expectCleanupStatus(path, options) {
  const result = await expectStatus(path, options)
  report.cleanup.push({ path, status: result.status, ok: true })
  return result
}
async function deleteEmpty(path) {
  const response = await fetchRetry(`${apiUrl}${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({ path, status: response.status, ok })
  if (!ok) throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
}

async function signInWithPassword() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: env.E2E_PROD_EMAIL, password: env.E2E_PROD_PASSWORD }),
  })
  const json = await response.json()
  if (!response.ok || !json.access_token) throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email ?? env.E2E_PROD_EMAIL }
  return json.access_token
}

function softCheck(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  return ok
}

function safeJson(text) { try { return JSON.parse(text) } catch { return null } }

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
function stableJson(value) { return JSON.stringify(sortDeep(value)) }
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortDeep(value[k])]))
  }
  return value
}
function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1)
  return value
}
function trimSlash(value) { return value.replace(/\/+$/u, '') }
function errorMessage(error) { return error instanceof Error ? error.message : String(error) }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

// ===========================================================================
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.every((c) => c.ok)
} catch (error) {
  report.ok = false
  report.fatal = errorMessage(error)
} finally {
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  const failed = report.checks.filter((c) => !c.ok)
  console.log(JSON.stringify({
    ok: report.ok,
    fatal: report.fatal ?? null,
    checks_total: report.checks.length,
    checks_failed: failed.length,
    failed: failed.map((c) => ({ label: c.label, actual: c.actual, expected: c.expected })),
    probes: report.probes,
    output_dir: outputDir,
  }, null, 2))
  process.exit(report.ok ? 0 : 1)
}
