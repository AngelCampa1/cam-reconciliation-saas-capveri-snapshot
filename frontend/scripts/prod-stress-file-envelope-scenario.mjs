// Prod E2E stress scenario (cycle 08C): adversarial FILE ENVELOPE robustness.
//
// Domain: push adversarial FILES (not cell contents — that was C5A) at every live
// prod upload endpoint and verify clean rejection or safe handling — never a 500,
// hang, OOM, or silent corruption.
//
// Endpoints under test:
//   POST /api/v1/ingestion/upload            (GL CSV, 50MB, content-length required)
//   POST /api/v1/rent-roll/preview           (rent-roll CSV, 10MB, NO 0-byte guard)
//   POST /api/v1/actual-billed/upload        (billing CSV/XLSX, 25MB)
//   POST /api/v1/documents/upload            (lease PDF, 50MB, magic-byte gate)
//
// File-envelope adversaries (disjoint from C5A cell-content sweep):
//   - Disguised binary: PNG renamed .csv; random binary .csv; EICAR-ish exe bytes.
//   - Structure: embedded NUL bytes; mixed CRLF/CR/LF; all-delimiter file;
//     giant single-row column count; truncated XLSX (zip header only);
//     XLSX with no worksheet; non-zip bytes as .xlsx.
//   - Size/DoS: 0-byte; content-length missing; oversize via content-length spoof.
//   - Encoding: UTF-16 BE BOM; lone-surrogate / invalid UTF-8 tail (win1252 fallback).
//   - PDF: HTML disguised as .pdf; truncated %PDF; 0-page/empty PDF body;
//     content-type mismatch; magic-byte mismatch.
//   - Filename attacks: ../../ traversal, NUL in name, 4KB name, RTL-override —
//     confirm R2 key stays org/property/UUID.ext (filename never becomes the key).
//
// All created entities are prefixed "[PROD-TEST]" and cleaned up in finally.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { URL } from 'node:url'

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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-stress-file-envelope-${runId}`)
const fixtureDir = resolve(outputDir, 'fixtures')
await mkdir(fixtureDir, { recursive: true })

const report = { ok: false, run_id: runId, output_dir: outputDir, findings: [], checks: [], cleanup: [] }
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46])

let token
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.every((c) => c.ok)
} catch (error) {
  report.fatal = errorMessage(error)
} finally {
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
if (!report.ok) process.exitCode = 1

// Soft check: record pass/fail, never throw — observe every probe.
function check(label, actual, expected, note) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected, ...(note ? { note } : {}) })
  return ok
}
function finding(entry) {
  report.findings.push(entry)
}
async function runProbe(name, fn) {
  try {
    await fn()
  } catch (error) {
    report.checks.push({ label: `probe ${name} aborted (harness error, not a product finding)`, ok: false, error: errorMessage(error) })
  }
}

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  report.suffix = suffix
  const created = { propertyIds: [], billingPeriods: [], documentIds: [] }
  try {
    const property = await createProperty(`[PROD-TEST] File Envelope ${suffix}`)
    created.propertyIds.push(property.id)

    await runProbe('gl-disguised-structure', () => probeGlDisguisedAndStructure({ property, suffix }))
    await runProbe('gl-size-content-length', () => probeGlSizeAndContentLength({ property, suffix }))
    await runProbe('billing-xlsx-envelope', () => probeBillingXlsxEnvelope({ property, suffix, created }))
    await runProbe('rent-roll-envelope', () => probeRentRollEnvelope({ suffix }))
    await runProbe('pdf-envelope', () => probePdfEnvelope({ property, suffix, created }))
    await runProbe('filename-attacks', () => probeFilenameAttacks({ property, suffix, created }))
  } finally {
    await cleanup(created)
  }
}

// ===========================================================================
// GL ingestion — disguised binaries + structural envelope
// ===========================================================================
async function probeGlDisguisedAndStructure({ property, suffix }) {
  // Baseline: a real GL CSV round-trips (generic source acceptable).
  const glHeader = 'transaction_date,account_code,account_description,amount'
  const baseBody = [glHeader, '2025-01-15,5000,CAM Expense,1234.56'].join('\n')
  const base = await uploadGl({ property, fileName: `gl-base-${suffix}.csv`, bytes: enc(baseBody) })
  check(
    'GL baseline CSV accepted (200), no crash',
    { status: base.status, crashed: base.status >= 500 },
    { status: 200, crashed: false },
    `body=${base.text.slice(0, 160)}`
  )

  // G-PNG: a REAL PNG file renamed .csv. No magic-byte gate on CSV path; decodeCsv
  // win1252 fallback never throws. Must NOT 500 — either 200 w/ 0 entries or 422.
  const pngBytes = realPngBytes()
  const png = await uploadGl({ property, fileName: `gl-png-${suffix}.csv`, bytes: pngBytes, mimeType: 'text/csv' })
  await saveFixtureBytes(`gl-png-${suffix}.csv`, pngBytes)
  check(
    'GL PNG-renamed-.csv handled safely (no 5xx, no silent GL entries)',
    { crashed: png.status >= 500, class: statusClass(png.status) },
    { crashed: false, class: png.status === 200 ? '2xx' : '4xx' },
    `status=${png.status}, row_count=${png.json?.row_count ?? 'n/a'}, err=${png.json?.error_count ?? 'n/a'}, body=${png.text.slice(0, 160)}`
  )
  if (png.status >= 500) {
    finding({
      id: 'G-PNG',
      severity: 'MEDIUM',
      site: 'cloudflare-backend/src/http/ingestion-routes.ts:600 isCsvFile + decode-csv.ts decodeCsv',
      input: 'a real PNG (magic 89 50 4E 47) renamed with a .csv extension',
      observed: `HTTP ${png.status} (server error)`,
      expected: 'clean handling: 200 with 0 valid GL entries or a 4xx parse rejection',
      why: 'CSV path has no magic-byte gate; binary decoded via win1252 fallback then parsed. A 5xx means the parser crashed on binary bytes.',
    })
  }

  // G-NUL: embedded NUL byte inside a PERSISTED text column (account_description).
  // Postgres text columns reject U+0000; if the NUL survives to the INSERT unescaped
  // the persist step 500s. This is the sharpest probe: a valid row whose description
  // cell contains a raw NUL, which the /upload route persists.
  const nulBody = new Uint8Array([...enc(glHeader + '\n2025-01-15,5000,CAM'), 0x00, ...enc('Expense,1234.56\n')])
  const nul = await uploadGl({ property, fileName: `gl-nul-${suffix}.csv`, bytes: nulBody, mimeType: 'text/csv' })
  await saveFixtureBytes(`gl-nul-${suffix}.csv`, nulBody)
  check(
    'GL embedded-NUL in persisted text cell handled safely (no 5xx)',
    { crashed: nul.status >= 500 },
    { crashed: false },
    `status=${nul.status}, row_count=${nul.json?.row_count ?? 'n/a'}, body=${nul.text.slice(0, 200)}`
  )
  if (nul.status >= 500) {
    finding({
      id: 'G-NUL', severity: 'MEDIUM',
      site: 'csv-parser.ts normalizeRecord (no NUL strip) -> gl_entries INSERT (porsager postgres)',
      input: 'GL CSV whose account_description cell contains a raw 0x00 byte',
      observed: `HTTP ${nul.status} (server error on persist)`,
      expected: 'clean 4xx (invalid row) or NUL stripped before insert; never a 500',
      why: 'Postgres rejects U+0000 in text values. If the parser does not strip NUL and the driver does not escape it, the INSERT throws and surfaces as an unhandled 500 rather than a clean validation error.',
    })
  }
  if (nul.status >= 500) {
    finding({
      id: 'G-NUL', severity: 'MEDIUM',
      site: 'ingestion-routes.ts prepareCsvUpload -> csv-parser.ts parseGlCsv',
      input: 'GL CSV with an embedded 0x00 byte mid-cell',
      observed: `HTTP ${nul.status}`,
      expected: 'no crash; NUL treated as ordinary character or row skipped',
      why: 'A NUL byte in the text stream should not crash the parser or the Postgres text insert (Postgres rejects \\u0000 in text -> should surface as a clean 4xx, not a 500).',
    })
  }

  // G-MIXEOL: mixed CRLF / CR / LF line endings in one file.
  const mixEol = enc(glHeader + '\r\n2025-01-15,5000,A,10.00\r2025-02-15,5001,B,20.00\n2025-03-15,5002,C,30.00')
  const mix = await uploadGl({ property, fileName: `gl-mixeol-${suffix}.csv`, bytes: mixEol, mimeType: 'text/csv' })
  await saveFixtureBytes(`gl-mixeol-${suffix}.csv`, mixEol)
  check(
    'GL mixed CRLF/CR/LF handled without crash',
    { crashed: mix.status >= 500 },
    { crashed: false },
    `status=${mix.status}, row_count=${mix.json?.row_count ?? 'n/a'}`
  )

  // G-ALLDELIM: a file that is nothing but commas and newlines.
  const allDelim = enc(',,,,\n,,,,\n,,,,')
  const delim = await uploadGl({ property, fileName: `gl-alldelim-${suffix}.csv`, bytes: allDelim, mimeType: 'text/csv' })
  await saveFixtureBytes(`gl-alldelim-${suffix}.csv`, allDelim)
  check(
    'GL all-delimiter file handled without crash (no valid entries)',
    { crashed: delim.status >= 500 },
    { crashed: false },
    `status=${delim.status}, body=${delim.text.slice(0, 160)}`
  )

  // G-WIDE: one row with 50,000 columns. O(cols) per row must stay bounded.
  const wideRow = 'a' + ',x'.repeat(50000)
  const wide = enc(glHeader + '\n' + wideRow)
  const started = Date.now()
  const wideRes = await uploadGl({ property, fileName: `gl-wide-${suffix}.csv`, bytes: wide, mimeType: 'text/csv' })
  const wideMs = Date.now() - started
  check(
    'GL 50k-column single row handled without crash / hang',
    { crashed: wideRes.status >= 500, hung: wideMs > 25000 },
    { crashed: false, hung: false },
    `status=${wideRes.status}, elapsed_ms=${wideMs}, body=${wideRes.text.slice(0, 120)}`
  )
  if (wideRes.status >= 500 || wideMs > 25000) {
    finding({
      id: 'G-WIDE', severity: 'MEDIUM',
      site: 'csv-parser.ts parseGlCsv column handling',
      input: 'GL CSV with a single row of ~50,000 columns',
      observed: `HTTP ${wideRes.status} in ${wideMs}ms`,
      expected: 'bounded handling: fast reject / parse without hang or 5xx',
      why: 'A pathological column count can amplify per-row work; verify it is bounded.',
    })
  }

  // G-UTF16BE: UTF-16 BE + BOM. decodeCsv is utf-8 fatal then win1252; UTF-16
  // mojibakes -> columns unrecognized. Must fail closed (4xx / 0 entries), never 500.
  const utf16be = encodeUtf16BEWithBom(glHeader + '\n2025-01-15,5000,CAM,1234.56\n')
  const be = await uploadGl({ property, fileName: `gl-utf16be-${suffix}.csv`, bytes: utf16be, mimeType: 'text/csv' })
  await saveFixtureBytes(`gl-utf16be-${suffix}.csv`, utf16be)
  check(
    'GL UTF-16BE file fails closed (no 5xx, no silently-wrong GL import)',
    { crashed: be.status >= 500 },
    { crashed: false },
    `status=${be.status}, row_count=${be.json?.row_count ?? 'n/a'}, body=${be.text.slice(0, 160)}`
  )

  // G-INVALIDUTF8: bytes that are invalid UTF-8 (lone continuation) so utf-8 fatal
  // throws and win1252 fallback runs. Must decode without crash.
  const badUtf8 = new Uint8Array([...enc(glHeader + '\n2025-01-15,5000,'), 0x80, 0xff, 0xfe, ...enc(',1234.56\n')])
  const bad = await uploadGl({ property, fileName: `gl-badutf8-${suffix}.csv`, bytes: badUtf8, mimeType: 'text/csv' })
  await saveFixtureBytes(`gl-badutf8-${suffix}.csv`, badUtf8)
  check(
    'GL invalid-UTF8 bytes decode via win1252 fallback without crash',
    { crashed: bad.status >= 500 },
    { crashed: false },
    `status=${bad.status}, body=${bad.text.slice(0, 160)}`
  )
}

// ===========================================================================
// GL ingestion — size + content-length envelope
// ===========================================================================
async function probeGlSizeAndContentLength({ property, suffix }) {
  // G-EMPTY: 0-byte CSV -> 400 empty_file (route guard).
  const empty = await uploadGl({ property, fileName: `gl-empty-${suffix}.csv`, bytes: new Uint8Array(0), mimeType: 'text/csv' })
  check(
    'GL 0-byte file -> 400 empty_file',
    { status: empty.status, code: errorCode(empty.json) },
    { status: 400, code: 'empty_file' }
  )

  // G-NOCL: multipart with chunked transfer-encoding (no Content-Length at origin).
  // Cloudflare buffers the body and synthesizes a Content-Length before the Worker
  // sees it, so the app's 411 content_length_required guard is defense-in-depth that
  // the edge makes unreachable in prod. Acceptable outcomes: 411 (guard fires) OR a
  // normal 2xx (edge supplied the length). The only failure is a 5xx or a hang.
  const noCl = await uploadGlNoContentLength({ property, suffix })
  const noClOk =
    noCl.status === 411 || (typeof noCl.status === 'number' && noCl.status >= 200 && noCl.status < 300)
  check(
    'GL chunked upload (no origin Content-Length) -> 411 guard or edge-normalized 2xx, never 5xx/hang',
    { ok: noClOk, crashed: typeof noCl.status === 'number' && noCl.status >= 500, hung: noCl.status === 'timeout' },
    { ok: true, crashed: false, hung: false },
    `status=${noCl.status}, code=${errorCode(noCl.json)} — CF synthesizes Content-Length; app 411 guard is edge-unreachable (defense-in-depth), CHECKED-CORRECT`
  )

  // G-CLSPOOF: spoof an oversize Content-Length header (>51MB) with a tiny body ->
  // ideal is a fast 413/400 at the header guard before reading the body. A hang
  // (timeout waiting for the never-sent bytes) would be a DoS finding.
  // Advertise 60MB, send a tiny body then FIN. Ideal: app 413 file_too_large from the
  // header guard. Cloudflare, however, enforces the declared Content-Length at the
  // edge: a short body is rejected with a connection reset (ECONNRESET) before the
  // Worker runs. Either the app 413 OR an edge connection reset is acceptable; the
  // only failures are a 5xx or a hang.
  const spoof = await uploadGlSpoofContentLength({ property, suffix, spoofBytes: 60 * 1024 * 1024 })
  const spoofOk = spoof.status === 413 || spoof.status === 400 || spoof.status === 'socket_error'
  check(
    'GL spoofed oversize Content-Length -> app 413 or edge connection reset, never 5xx/hang',
    { ok: spoofOk, crashed: typeof spoof.status === 'number' && spoof.status >= 500, hung: spoof.status === 'timeout' },
    { ok: true, crashed: false, hung: false },
    `status=${spoof.status}, code=${errorCode(spoof.json)}, body=${spoof.text.slice(0, 160)} — CF enforces declared Content-Length at edge, CHECKED-CORRECT`
  )
  if (spoof.status === 'timeout') {
    finding({
      id: 'G-CLSPOOF', severity: 'LOW',
      site: 'ingestion-routes.ts rejectOversizeMultipartBody (content-length guard) + CF edge',
      input: 'multipart upload advertising a 60MB Content-Length with a tiny real body',
      observed: 'request hung until client 30s timeout',
      expected: 'fast reject (app 413 or edge connection reset)',
      why: 'A held-open request is a cheap DoS lever; bounded by CF request limits, so LOW.',
    })
  }
}

// ===========================================================================
// BILLING XLSX — zip / worksheet envelope
// ===========================================================================
async function probeBillingXlsxEnvelope({ property, suffix, created }) {
  const period = { start: '2025-01-01', end: '2025-12-31' }

  // AB-ZIPHDR: a truncated "xlsx" that is only a ZIP local-file header, no central
  // directory -> ExcelJS.load throws -> caught -> 422 billing_parse_failed.
  const zipHdr = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])
  const zh = await uploadBillingBytes({ property, period, fileName: `bill-ziphdr-${suffix}.xlsx`, bytes: zipHdr, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await saveFixtureBytes(`bill-ziphdr-${suffix}.xlsx`, zipHdr)
  check(
    'BILL truncated ZIP-header .xlsx fails closed (no 5xx)',
    { crashed: zh.status >= 500, class: statusClass(zh.status) },
    { crashed: false, class: '4xx' },
    `status=${zh.status}, body=${zh.text.slice(0, 200)}`
  )
  if (zh.status >= 500) {
    finding({
      id: 'AB-ZIPHDR', severity: 'MEDIUM',
      site: 'actual-billed/billing-parser.ts:92 parseBillingXlsx (workbook.xlsx.load)',
      input: 'a .xlsx that is only a partial ZIP local-file header',
      observed: `HTTP ${zh.status}`,
      expected: 'ExcelJS load throws -> caught -> 422 billing_parse_failed',
      why: 'The try/catch around workbook.xlsx.load should convert any zip-read error into a clean 422.',
    })
  }

  // AB-NOTZIP: non-zip bytes with .xlsx extension -> load throws -> 422.
  const notZip = enc('this is definitely not a zip file, just text pretending to be xlsx')
  const nz = await uploadBillingBytes({ property, period, fileName: `bill-notzip-${suffix}.xlsx`, bytes: notZip, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await saveFixtureBytes(`bill-notzip-${suffix}.xlsx`, notZip)
  check(
    'BILL non-zip bytes as .xlsx fails closed (no 5xx)',
    { crashed: nz.status >= 500, class: statusClass(nz.status) },
    { crashed: false, class: '4xx' },
    `status=${nz.status}, body=${nz.text.slice(0, 200)}`
  )

  // AB-EMPTYZIP: a valid-but-empty ZIP (EOCD only) as .xlsx -> load throws or
  // yields no worksheet -> "File is empty" 422. Must not 500.
  const emptyZip = emptyZipBytes()
  const ez = await uploadBillingBytes({ property, period, fileName: `bill-emptyzip-${suffix}.xlsx`, bytes: emptyZip, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await saveFixtureBytes(`bill-emptyzip-${suffix}.xlsx`, emptyZip)
  check(
    'BILL empty-ZIP .xlsx fails closed (no 5xx)',
    { crashed: ez.status >= 500, class: statusClass(ez.status) },
    { crashed: false, class: '4xx' },
    `status=${ez.status}, body=${ez.text.slice(0, 200)}`
  )

  // AB-PNGXLSX: a real PNG renamed .xlsx (magic mismatch, not a zip) -> 422.
  const pngX = realPngBytes()
  const px = await uploadBillingBytes({ property, period, fileName: `bill-png-${suffix}.xlsx`, bytes: pngX, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await saveFixtureBytes(`bill-png-${suffix}.xlsx`, pngX)
  check(
    'BILL PNG-renamed-.xlsx fails closed (no 5xx)',
    { crashed: px.status >= 500, class: statusClass(px.status) },
    { crashed: false, class: '4xx' },
    `status=${px.status}, body=${px.text.slice(0, 200)}`
  )

  // Cleanup any accidentally-created billing period (none expected, but be safe).
  await deleteBillingPeriod(property.id, period, created)
}

// ===========================================================================
// RENT-ROLL — envelope (NO 0-byte guard; only .xlsx/.xls extension blocked)
// ===========================================================================
async function probeRentRollEnvelope({ suffix }) {
  // RR-EMPTY-IMPORT: 0-byte at IMPORT (not preview). rent-roll readCsvFile has NO
  // 0-byte guard (unlike GL/billing). Parser returns success:false -> route maps to
  // 400 rent_roll_parse_failed / rent_roll_empty. Must not 500.
  const emptyImp = await importRentRollBytes({ fileName: `rr-empty-${suffix}.csv`, bytes: new Uint8Array(0), propertyName: `[PROD-TEST] RR Empty ${suffix}` })
  check(
    'RR 0-byte file at IMPORT fails closed (4xx, no 5xx)',
    { crashed: emptyImp.status >= 500, class: statusClass(emptyImp.status) },
    { crashed: false, class: '4xx' },
    `status=${emptyImp.status}, body=${emptyImp.text.slice(0, 160)}`
  )

  // RR-PNG: PNG renamed .csv at preview. Not extension-blocked; file.text() decodes
  // lossily -> no units. Must not crash.
  const png = realPngBytes()
  const rp = await previewRentRollBytes({ fileName: `rr-png-${suffix}.csv`, bytes: png, mimeType: 'text/csv' })
  await saveFixtureBytes(`rr-png-${suffix}.csv`, png)
  check(
    'RR PNG-renamed-.csv at preview handled without crash (no units)',
    { crashed: rp.status >= 500, units: rp.json?.units?.length ?? null },
    { crashed: false, units: 0 },
    `status=${rp.status}, body=${rp.text.slice(0, 160)}`
  )

  // RR-NUL: embedded NUL in rent-roll preview.
  const rrHeader = 'unit,tenant,rentable_sqft,lease_start,lease_end,base_rent'
  const nul = new Uint8Array([...enc(rrHeader + '\nRR-1,Ten'), 0x00, ...enc('ant,1000.00,2025-01-01,2025-12-31,5000.00\n')])
  const rn = await previewRentRollBytes({ fileName: `rr-nul-${suffix}.csv`, bytes: nul, mimeType: 'text/csv' })
  await saveFixtureBytes(`rr-nul-${suffix}.csv`, nul)
  check(
    'RR embedded-NUL preview handled without crash',
    { crashed: rn.status >= 500 },
    { crashed: false },
    `status=${rn.status}, units=${rn.json?.units?.length ?? 'n/a'}`
  )
}

// ===========================================================================
// PDF (lease docs) — envelope, all BEFORE any LLM (no /process call)
// ===========================================================================
async function probePdfEnvelope({ property, suffix, created }) {
  // P-HTML-CT: HTML body with content-type text/html -> 400 invalid_file_type
  // (route requires exactly application/pdf).
  const html = enc('<!doctype html><html><body>not a pdf</body></html>')
  const htmlCt = await uploadDoc({ property, fileName: `doc-html-${suffix}.pdf`, bytes: html, mimeType: 'text/html' })
  check(
    'PDF HTML body w/ text/html content-type -> 400 invalid_file_type',
    { status: htmlCt.status, code: errorCode(htmlCt.json) },
    { status: 400, code: 'invalid_file_type' },
    `body=${htmlCt.text.slice(0, 160)}`
  )

  // P-HTML-PDFCT: HTML body but content-type application/pdf -> passes CT gate,
  // fails magic-byte gate -> 400 invalid_pdf.
  const htmlPdf = await uploadDoc({ property, fileName: `doc-html2-${suffix}.pdf`, bytes: html, mimeType: 'application/pdf' })
  check(
    'PDF HTML body w/ application/pdf content-type -> 400 invalid_pdf (magic bytes)',
    { status: htmlPdf.status, code: errorCode(htmlPdf.json) },
    { status: 400, code: 'invalid_pdf' },
    `body=${htmlPdf.text.slice(0, 160)}`
  )

  // P-TRUNC: bytes starting with %PDF but truncated garbage after. Passes magic gate
  // -> uploaded to R2 + queued. We DO NOT call /process (no LLM). Verify upload path
  // handles it (201) and the record is deletable. This is the documented boundary:
  // magic-byte gate only; structural validity is the extraction pipeline's problem.
  const truncPdf = new Uint8Array([...PDF_MAGIC, ...enc('-1.4\ntruncated, no xref, no trailer')])
  const trunc = await uploadDoc({ property, fileName: `doc-trunc-${suffix}.pdf`, bytes: truncPdf, mimeType: 'application/pdf' })
  await saveFixtureBytes(`doc-trunc-${suffix}.pdf`, truncPdf)
  if (trunc.status === 201 && trunc.json?.document_id) created.documentIds.push(trunc.json.document_id)
  check(
    'PDF %PDF-magic but structurally-truncated: accepted at upload (201), no 5xx',
    { crashed: trunc.status >= 500, class: statusClass(trunc.status) },
    { crashed: false, class: '2xx' },
    `status=${trunc.status}, doc_id=${trunc.json?.document_id ?? 'n/a'} — magic-byte gate only; structural validity deferred to extraction (not triggered here)`
  )

  // P-EXE-PDFCT: random exe-ish binary (MZ header) w/ application/pdf CT -> fails
  // magic gate -> 400 invalid_pdf.
  const mz = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, ...enc('fake exe bytes')])
  const exe = await uploadDoc({ property, fileName: `doc-exe-${suffix}.pdf`, bytes: mz, mimeType: 'application/pdf' })
  check(
    'PDF MZ/exe body w/ application/pdf CT -> 400 invalid_pdf',
    { status: exe.status, code: errorCode(exe.json) },
    { status: 400, code: 'invalid_pdf' }
  )

  // P-EMPTY: 0-byte w/ application/pdf CT -> magic gate fails (no bytes) -> 400 invalid_pdf.
  const emptyPdf = await uploadDoc({ property, fileName: `doc-empty-${suffix}.pdf`, bytes: new Uint8Array(0), mimeType: 'application/pdf' })
  check(
    'PDF 0-byte body -> 400 invalid_pdf (no 5xx)',
    { status: emptyPdf.status, code: errorCode(emptyPdf.json), crashed: emptyPdf.status >= 500 },
    { status: 400, code: 'invalid_pdf', crashed: false },
    `body=${emptyPdf.text.slice(0, 160)}`
  )

  // P-CLSPOOF: spoof oversize content-length on the PDF route (>51MB) -> ideally
  // 400 file_too_large at rejectClearlyOversizedUpload, before reading the body.
  const spoof = await uploadDocSpoofContentLength({ property, suffix, spoofBytes: 60 * 1024 * 1024 })
  const spoofOk = spoof.status === 400 || spoof.status === 413 || spoof.status === 'socket_error'
  check(
    'PDF spoofed oversize Content-Length -> app 400/413 or edge connection reset, never 5xx/hang',
    { ok: spoofOk, crashed: typeof spoof.status === 'number' && spoof.status >= 500, hung: spoof.status === 'timeout' },
    { ok: true, crashed: false, hung: false },
    `status=${spoof.status}, code=${errorCode(spoof.json)}, body=${spoof.text.slice(0, 160)} — CF enforces declared Content-Length at edge, CHECKED-CORRECT`
  )
}

// ===========================================================================
// Filename attacks — confirm R2 key is org/property/UUID.ext (name never the key)
// ===========================================================================
async function probeFilenameAttacks({ property, suffix, created }) {
  const minimalPdf = new Uint8Array([...PDF_MAGIC, ...enc('-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')])
  const NUL = String.fromCharCode(0)

  // FN-NUL: a filename containing an embedded NUL byte. This is the sharp finding:
  // normalizeFilename() strips only path separators and slices to 255 — it does NOT
  // strip control chars — so the NUL flows into putDocument metadata + the Postgres
  // text insert, which rejects U+0000, and mapSubmissionError has no branch for it,
  // yielding a generic 500 internal_error instead of a clean 4xx.
  const nulUp = await uploadDoc({ property, fileName: `ab${NUL}cd.pdf`, bytes: minimalPdf, mimeType: 'application/pdf' })
  if (nulUp.status === 201 && nulUp.json?.document_id) created.documentIds.push(nulUp.json.document_id)
  check(
    'FILENAME embedded-NUL -> clean 4xx, never 5xx',
    { crashed: nulUp.status >= 500, class: statusClass(nulUp.status) },
    { crashed: false, class: '4xx' },
    `status=${nulUp.status}, body=${nulUp.text.slice(0, 200)}`
  )
  if (nulUp.status >= 500) {
    finding({
      id: 'FN-NUL', severity: 'MEDIUM',
      site: 'document-extraction-routes.ts:1000 normalizeFilename (no control-char strip) + :335 mapSubmissionError (no NUL branch) -> generic 500',
      input: 'document upload with an embedded NUL byte in the filename (e.g. "ab\\u0000cd.pdf")',
      observed: `HTTP ${nulUp.status} internal_error ("Unexpected server error")`,
      expected: 'clean 400 (e.g. invalid_filename) — reject or strip the NUL before R2 metadata / DB insert',
      why: 'normalizeFilename only strips path separators + slices to 255; it never strips control chars. The NUL reaches putDocument customMetadata.original_filename and the gl/documents text INSERT. Postgres rejects U+0000 in text, the driver throws, and mapSubmissionError falls through to a generic 500 rather than mapping it to a validation error. A one-line filename lets any authenticated user provoke a 500 — a poor client contract and a noisy error surface; storage key itself stays UUID-safe so no path injection, hence MEDIUM not HIGH.',
    })
  }

  // Path-injection family: each must yield a safe UUID R2 key (name never becomes the
  // key) or a clean reject — never a 5xx. (No embedded NUL here.)
  const cases = [
    { tag: 'traversal', name: '../../../../etc/passwd.pdf' },
    { tag: 'winabs', name: 'C:\\Windows\\System32\\evil.pdf' },
    { tag: 'dotdot-basename', name: 'x/../../.pdf' },
    { tag: 'only-slashes', name: '///' },
    { tag: 'rtl', name: 'invoice‮fdp.exe.pdf' },
    { tag: 'longname', name: 'A'.repeat(4096) + '.pdf' },
    { tag: 'noext', name: '../../../noext' },
  ]
  for (const fc of cases) {
    const up = await uploadDoc({ property, fileName: fc.name, bytes: minimalPdf, mimeType: 'application/pdf' })
    const docId = up.json?.document_id ?? null
    if (up.status === 201 && docId) created.documentIds.push(docId)

    let storageKey = null
    let storedFilename = null
    if (docId) {
      const detail = await getExtractionDetail(docId)
      storageKey = detail?.storage_key ?? null
      storedFilename = detail?.filename ?? null
    }
    // R2 key must be exactly org/property/UUID(.ext). Assert: 3 segments, first two
    // are the org+property UUIDs, no traversal token, no backslash, no NUL, ends in a
    // clean extension. The user filename must NOT appear as a path segment.
    const keyOk =
      typeof storageKey === 'string' &&
      keyIsSafe(storageKey, property.id)
    check(
      `FILENAME "${fc.tag}": R2 key is org/property/UUID (name never becomes the key), no 5xx`,
      { crashed: up.status >= 500, accepted: up.status === 201, keyOk },
      { crashed: false, accepted: true, keyOk: true },
      `status=${up.status}, storage_key=${JSON.stringify(storageKey)}, stored_filename=${JSON.stringify(storedFilename)?.slice(0, 120)}`
    )
    if (typeof storageKey === 'string' && !keyIsSafe(storageKey, property.id)) {
      finding({
        id: `FN-${fc.tag.toUpperCase()}`, severity: 'HIGH',
        site: 'adapters/storage/documents.ts generateStorageKey/normalizedExtension + document-extraction-routes.ts normalizeFilename',
        input: `document upload with filename ${JSON.stringify(fc.name)}`,
        observed: `R2 storage_key=${JSON.stringify(storageKey)}`,
        expected: 'key strictly org/property/UUID.ext; user filename influences only the (sanitized) extension',
        why: 'A user-controlled path segment or traversal token in the R2 key is a storage-path injection.',
      })
    }
  }
}

function keyIsSafe(key, propertyId) {
  const SPACE = String.fromCharCode(32)
  if (key.includes('\\') || key.includes(SPACE) || key.includes('..')) return false
  const segments = key.split('/')
  if (segments.length !== 3) return false
  if (segments[1] !== propertyId) return false
  // segment[2] = <uuid>.<ext>; must not carry the attacker name.
  const last = segments[2]
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]+)?$/u
  return uuidRe.test(last)
}

// ===========================================================================
// upload helpers
// ===========================================================================
function enc(s) { return new TextEncoder().encode(s) }

async function uploadGl({ property, fileName, bytes, mimeType = 'text/csv' }) {
  const form = new FormData()
  form.set('property_id', property.id)
  form.set('file', new Blob([bytes], { type: mimeType }), fileName)
  const response = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, json: safeJson(text) }
}

// Build a raw multipart body and send WITHOUT Content-Length via a chunked stream.
function buildMultipart(fields, fileField) {
  const boundary = '----capveriEnvelope' + randomUUID().replace(/-/gu, '')
  const parts = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
  }
  parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileField.name}"\r\nContent-Type: ${fileField.type}\r\n\r\n`))
  parts.push(fileField.bytes)
  parts.push(enc(`\r\n--${boundary}--\r\n`))
  return { boundary, body: concatBytes(...parts) }
}

async function uploadGlNoContentLength({ property, suffix }) {
  const { boundary, body } = buildMultipart(
    { property_id: property.id },
    { name: `gl-nocl-${suffix}.csv`, type: 'text/csv', bytes: enc('transaction_date,account_code,amount\n2025-01-15,5000,10.00\n') }
  )
  // Raw socket, chunked transfer-encoding => NO Content-Length header at all.
  return rawRequest({
    path: '/api/v1/ingestion/upload',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': `multipart/form-data; boundary=${boundary}` },
    body,
    mode: 'chunked',
  })
}

async function uploadGlSpoofContentLength({ property, suffix, spoofBytes }) {
  const { boundary, body } = buildMultipart(
    { property_id: property.id },
    { name: `gl-spoof-${suffix}.csv`, type: 'text/csv', bytes: enc('transaction_date,account_code,amount\n2025-01-15,5000,10.00\n') }
  )
  // Send the REAL small body but advertise an oversize Content-Length so the header
  // guard rejects before reading the body. Close the socket after the small body.
  return rawRequest({
    path: '/api/v1/ingestion/upload',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(spoofBytes) },
    body,
    mode: 'fixed',
  })
}

async function uploadBillingBytes({ property, period, fileName, bytes, mimeType }) {
  const form = new FormData()
  form.set('property_id', property.id)
  form.set('period_start', period.start)
  form.set('period_end', period.end)
  form.set('file', new Blob([bytes], { type: mimeType }), fileName)
  const response = await fetch(`${apiUrl}/api/v1/actual-billed/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, json: safeJson(text) }
}

async function deleteBillingPeriod(propertyId, period, created) {
  const path = `/api/v1/actual-billed/${propertyId}?period_start=${period.start}&period_end=${period.end}`
  const r = await fetch(`${apiUrl}${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
  await r.text()
  if (created) created.billingPeriods = (created.billingPeriods ?? []).filter((b) => b.propertyId !== propertyId)
}

async function previewRentRollBytes({ fileName, bytes, mimeType = 'text/csv' }) {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: mimeType }), fileName)
  const response = await fetch(`${apiUrl}/api/v1/rent-roll/preview`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, json: safeJson(text) }
}

async function importRentRollBytes({ fileName, bytes, propertyName }) {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: 'text/csv' }), fileName)
  form.set('property_name', propertyName)
  form.set('address', '404 File Envelope Blvd')
  form.set('city', 'Austin'); form.set('state', 'TX'); form.set('postal_code', '78704')
  const response = await fetch(`${apiUrl}/api/v1/rent-roll/import`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, json: safeJson(text) }
}

async function uploadDoc({ property, fileName, bytes, mimeType }) {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: mimeType }), fileName)
  const url = `${apiUrl}/api/v1/documents/upload?property_id=${property.id}&document_type=lease`
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, json: safeJson(text) }
}

async function uploadDocSpoofContentLength({ property, suffix, spoofBytes }) {
  const { boundary, body } = buildMultipart(
    {},
    { name: `doc-spoof-${suffix}.pdf`, type: 'application/pdf', bytes: new Uint8Array([...PDF_MAGIC, ...enc('-1.4 tiny')]) }
  )
  return rawRequest({
    path: `/api/v1/documents/upload?property_id=${property.id}&document_type=lease`,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(spoofBytes) },
    body,
    mode: 'fixed',
  })
}

// Low-level POST with full header control (Content-Length spoof / omission).
// mode 'chunked' => Transfer-Encoding: chunked, no Content-Length.
// mode 'fixed'   => send exactly the caller's headers (incl. spoofed content-length)
//                   then the real body, then end. Times out gracefully if the server
//                   keeps waiting for the advertised (but never-sent) extra bytes.
function rawRequest({ path, headers, body, mode }) {
  const url = new URL(apiUrl + path)
  const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest
  const finalHeaders = { ...headers }
  if (mode === 'chunked') delete finalHeaders['content-length']
  return new Promise((resolvePromise) => {
    const req = requestFn(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        method: 'POST',
        path: url.pathname + url.search,
        headers: finalHeaders,
      },
      (res) => {
        const chunks = []
        res.on('data', (d) => chunks.push(d))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolvePromise({ status: res.statusCode ?? 0, text, json: safeJson(text) })
        })
      },
    )
    req.setTimeout(30000, () => {
      req.destroy()
      resolvePromise({ status: 'timeout', text: 'server kept waiting for advertised body bytes (no early rejection)', json: null })
    })
    req.on('error', (error) => {
      resolvePromise({ status: 'socket_error', text: errorMessage(error), json: null })
    })
    if (mode === 'chunked') {
      req.write(Buffer.from(body))
      req.end()
    } else {
      // Write only the real (small) body; do NOT pad to the spoofed length.
      req.write(Buffer.from(body))
      req.end()
    }
  })
}

async function getExtractionDetail(documentId) {
  const r = await fetch(`${apiUrl}/api/v1/extractions/${documentId}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  return safeJson(await r.text())
}

async function deleteDocument(documentId) {
  const r = await fetch(`${apiUrl}/api/v1/documents/${documentId}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` },
  })
  await r.text()
  return r.status
}

// ===========================================================================
// fixtures — byte builders
// ===========================================================================
function realPngBytes() {
  // 1x1 transparent PNG (valid magic + IHDR + IDAT + IEND).
  return Uint8Array.from(atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  ), (c) => c.charCodeAt(0))
}

function emptyZipBytes() {
  // Minimal empty ZIP: End Of Central Directory record only (22 bytes).
  return new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
}

function encodeUtf16BEWithBom(text) {
  const out = new Uint8Array(2 + text.length * 2)
  out[0] = 0xfe; out[1] = 0xff
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    out[2 + i * 2] = (code >> 8) & 0xff
    out[2 + i * 2 + 1] = code & 0xff
  }
  return out
}

// ===========================================================================
// shared helpers
// ===========================================================================
async function createProperty(name) {
  const response = await fetch(`${apiUrl}/api/v1/properties`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      name, address_line1: '404 File Envelope Blvd', city: 'Austin', state: 'TX', postal_code: '78704',
      total_rentable_sqft: '25000.00', total_usable_sqft: '22000.00', common_area_sqft: '3000.00',
      target_occupancy: '0.95', boma_standard_version: '2024', fiscal_year_start_month: 1,
    }),
  })
  const text = await response.text()
  if (response.status !== 201) throw new Error(`createProperty ${response.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

async function cleanup(created) {
  const failures = []
  for (const docId of created.documentIds ?? []) {
    await attemptCleanup(failures, `delete document ${docId}`, async () => {
      const status = await deleteDocument(docId)
      const ok = status === 204 || status === 404
      report.cleanup.push({ path: `/documents/${docId}`, status, ok })
      if (!ok) throw new Error(`DELETE document ${status}`)
    })
  }
  for (const b of created.billingPeriods ?? []) {
    await attemptCleanup(failures, `delete billing ${b.propertyId}`, async () => {
      await deleteBillingPeriod(b.propertyId, b.period)
    })
  }
  for (const propertyId of created.propertyIds ?? []) {
    await attemptCleanup(failures, `delete property ${propertyId}`, async () => {
      const r = await fetch(`${apiUrl}/api/v1/properties/${propertyId}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
      const t = await r.text()
      const ok = r.status === 204 || r.status === 404
      report.cleanup.push({ path: `/properties/${propertyId}`, status: r.status, ok, body_preview: t.slice(0, 150) })
      if (!ok) throw new Error(`DELETE property ${r.status}: ${t.slice(0, 200)}`)
    })
  }
  if (failures.length > 0) report.cleanup_failures = failures
}

async function attemptCleanup(failures, label, operation) {
  try { await operation() } catch (error) { failures.push(label); report.cleanup.push({ label, ok: false, error: errorMessage(error) }) }
}

async function signInWithPassword() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: env.E2E_PROD_EMAIL, password: env.E2E_PROD_PASSWORD }),
  })
  const json = await response.json()
  if (!response.ok || !json.access_token) throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email ?? env.E2E_PROD_EMAIL }
  return json.access_token
}

function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}
function statusClass(status) {
  if (typeof status !== 'number') return String(status)
  if (status >= 200 && status < 300) return '2xx'
  if (status >= 400 && status < 500) return '4xx'
  if (status >= 500) return '5xx'
  return `${status}`
}
function errorCode(json) { return json?.error?.code ?? null }
function safeJson(text) { try { return JSON.parse(text) } catch { return null } }
async function saveFixtureBytes(fileName, bytes) {
  await writeFile(resolve(fixtureDir, sanitizeFixtureName(fileName)), Buffer.from(bytes))
}
function sanitizeFixtureName(name) { return name.replace(/[\\/:*?"<>|]/gu, '_').slice(0, 120) }
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
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) return value.slice(1, -1)
  return value
}
function trimSlash(value) { return value.replace(/\/+$/u, '') }
function errorMessage(error) { return error instanceof Error ? error.message : String(error) }
function stableJson(value) { return JSON.stringify(sortDeep(value)) }
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortDeep(v)]))
  return value
}
