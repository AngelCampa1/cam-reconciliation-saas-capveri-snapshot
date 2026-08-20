// Prod E2E stress scenario (Cycle 11A): STRUCTURAL parse robustness of the
// GL / rent-roll / actual-billed CSV ingestion parsers on the LIVE prod API.
//
// Domain: does a structurally-malformed-but-parseable CSV make a parser silently
// MIS-MAP columns, DROP rows, MIS-COUNT, or MIS-ALIGN a dollar value (a VALUE
// bug) — OR crash with an opaque 500? A wrong NUMBER reaching the engine with
// error_count:0 and no warning is the highest-value find; an opaque 500 is next.
//
// Prior cycles already stressed money-CELL parsing (scientific/hex/NaN/Infinity,
// currency glyphs, U+2212), numeric overflow (22003), string truncation (22001).
// This cycle targets structure: encoding (BOM, UTF-16, latin-1 high bytes), line
// endings (CRLF/LF/CR), RFC-4180 quoting (embedded delimiters/newlines/quotes,
// unbalanced quotes), row shape (ragged rows, header-only, empty, duplicate
// headers, header-row misdetection, extra columns), and column-order collisions.
//
// The cleanest OUTPUT-verifiable target is POST /api/v1/rent-roll/preview: it is
// authed but NOT gated by editor role or full-access, is pure (no writes), and
// returns units[], row_count, error_count, warnings, occupied_units — so we can
// assert penny/row-exact parse output for every fixture. GL upload and billing
// upload are exercised for status-code robustness (they DO write, so we clean up
// every created batch/property/billing row in finally).
//
// check() records failures instead of throwing so one regression does not mask
// the rest of the surface.
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
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-stress-cycle11a-structural-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  auth: {},
  generated: {},
  checks: [],
  observations: [],
  cleanup: [],
}

let token = null
const created = { propertyIds: [], batchIds: [] }
try {
  token = await signIn(env.E2E_PROD_EMAIL, env.E2E_PROD_PASSWORD)
  await runScenario()
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok)
} catch (error) {
  report.fatal = errorMessage(error)
} finally {
  await cleanup()
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

// ---------------------------------------------------------------------------

async function runScenario() {
  // Sanity: token reaches an authed route.
  const ident = await probe('GET', '/api/v1/properties', { token })
  check(
    'IDENT token accepted on authed route',
    { status: ident.status },
    { status: 200 }
  )

  await rentRollStructuralChecks()
  await glUploadStructuralChecks()
  await billingUploadStructuralChecks()
}

// ===========================================================================
// RENT ROLL PREVIEW — pure, output-verifiable. This is the correctness oracle
// surface: we assert exact units/row_count/occupied_units/warnings per fixture.
// ===========================================================================

async function rentRollStructuralChecks() {
  // Baseline: a clean 3-unit rent roll. Establishes the expected exact output
  // that the malformed variants below are compared against.
  const baseHeader = 'Unit,Rentable SF,Tenant,Base Rent,Lease Start,Lease End'
  const baseRows = [
    '101,1000,Acme Corp,5000,2024-01-01,2026-12-31',
    '102,2000,Beta LLC,8000,2024-06-01,2027-05-31',
    '103,1500,Gamma Inc,6000,2024-03-15,2026-03-14',
  ]
  const baseline = `${baseHeader}\n${baseRows.join('\n')}\n`
  const basePreview = await previewRentRoll(baseline, 'baseline.csv')
  check(
    'RR baseline: 3 units, 3 occupied, 0 errors',
    {
      success: basePreview.json?.success,
      units: basePreview.json?.units?.length,
      occupied: basePreview.json?.occupied_units,
      errors: basePreview.json?.error_count,
    },
    { success: true, units: 3, occupied: 3, errors: 0 }
  )
  const baseTotalSqft = sumUnitField(basePreview.json, 'rentable_sqft')
  report.generated.baselineSqft = baseTotalSqft

  // --- Encoding: UTF-8 BOM prefix. Parser strips ^﻿; must be identical. ---
  {
    const withBom = `﻿${baseline}`
    const p = await previewRentRoll(withBom, 'bom.csv')
    check(
      'RR UTF-8 BOM prefix: identical parse (3 units, same total sqft)',
      { units: p.json?.units?.length, sqft: sumUnitField(p.json, 'rentable_sqft') },
      { units: 3, sqft: baseTotalSqft }
    )
  }

  // --- Encoding: UTF-16LE. decodeCsv only does UTF-8 (fatal) then windows-1252;
  // a UTF-16LE payload has interleaved NUL bytes and will decode to garbage. The
  // CONTRACT under test is that this NEVER produces a wrong-but-accepted unit set
  // and NEVER 500s — it must fail-safe (0 units / parse error), not silently
  // corrupt. We send the bytes with a .csv name so it reaches the parser. ---
  {
    const u16 = utf16leBytes(`﻿${baseline}`)
    const p = await previewRentRollBytes(u16, 'utf16le.csv', 'text/csv')
    // Fail-safe: no 500, and it must NOT claim the same 3 real units as if it
    // decoded cleanly (that would be luck, not correctness). Either 0 units or a
    // clean parse error is acceptable; a partial wrong-value unit set is NOT.
    const units = p.json?.units ?? []
    const decodedCleanly =
      units.length === 3 &&
      sumUnitField(p.json, 'rentable_sqft') === baseTotalSqft
    check(
      'RR UTF-16LE: no 500, not silently mis-decoded to wrong units',
      { is500: p.status >= 500, wrongDecode: units.length > 0 && !decodedCleanly },
      { is500: false, wrongDecode: false }
    )
    report.observations.push({
      case: 'RR UTF-16LE',
      status: p.status,
      success: p.json?.success,
      units: units.length,
      errors: p.json?.error_count,
      note: 'decodeCsv has no UTF-16 branch (windows-1252 fallback); documents behavior',
    })
  }

  // --- Line endings: pure CR (old-Mac). Tokenizer treats \r as row end. ---
  {
    const cr = `${baseHeader}\r${baseRows.join('\r')}\r`
    const p = await previewRentRoll(cr, 'cr.csv')
    check(
      'RR old-Mac CR line endings: 3 units, same total sqft',
      { units: p.json?.units?.length, sqft: sumUnitField(p.json, 'rentable_sqft') },
      { units: 3, sqft: baseTotalSqft }
    )
  }

  // --- Line endings: mixed CRLF + LF + CR in one file. ---
  {
    const mixed = `${baseHeader}\r\n${baseRows[0]}\n${baseRows[1]}\r${baseRows[2]}\r\n`
    const p = await previewRentRoll(mixed, 'mixed-eol.csv')
    check(
      'RR mixed CRLF/LF/CR: 3 units, same total sqft',
      { units: p.json?.units?.length, sqft: sumUnitField(p.json, 'rentable_sqft') },
      { units: 3, sqft: baseTotalSqft }
    )
  }

  // --- Quoting: RFC-4180 embedded comma + embedded newline + escaped quote in a
  // quoted tenant field. Must NOT shift columns; sqft/rent must stay aligned. ---
  {
    const csv =
      `${baseHeader}\n` +
      '101,1000,"Acme, Corp\nSuite ""A""",5000,2024-01-01,2026-12-31\n' +
      '102,2000,Beta LLC,8000,2024-06-01,2027-05-31\n'
    const p = await previewRentRoll(csv, 'rfc4180.csv')
    const unit101 = (p.json?.units ?? []).find((u) => u.unit_number === '101')
    check(
      'RR RFC-4180 embedded comma/newline/quote: no column shift, tenant intact',
      {
        units: p.json?.units?.length,
        sqft101: unit101?.rentable_sqft,
        rent101: unit101?.base_rent,
        tenantHasComma: unit101?.tenant_name?.includes(','),
      },
      { units: 2, sqft101: '1000.00', rent101: '5000.00', tenantHasComma: true }
    )
  }

  // --- Quoting: UNBALANCED quote. An opening quote with no close swallows the
  // rest of the file into one field. Contract: must NOT 500 and must NOT invent
  // wrong-valued units — it may legitimately drop the swallowed rows. ---
  {
    const csv =
      `${baseHeader}\n` +
      '101,1000,"Acme Corp,5000,2024-01-01,2026-12-31\n' +
      '102,2000,Beta LLC,8000,2024-06-01,2027-05-31\n'
    const p = await previewRentRoll(csv, 'unbalanced-quote.csv')
    const units = p.json?.units ?? []
    // Any unit that IS returned must have a correct, aligned sqft (a plain number),
    // never a value smeared with the swallowed tail.
    const anyCorrupt = units.some(
      (u) => !/^\d+\.\d{2}$/u.test(String(u.rentable_sqft ?? ''))
    )
    check(
      'RR unbalanced quote: no 500, no corrupt-valued unit',
      { is500: p.status >= 500, anyCorrupt },
      { is500: false, anyCorrupt: false }
    )
    report.observations.push({
      case: 'RR unbalanced quote',
      status: p.status,
      units: units.length,
      errors: p.json?.error_count,
    })
  }

  // --- Row shape: RAGGED — a data row with FEWER columns than the header. The
  // missing trailing cells become "" -> lease dates null. Unit/sqft still align
  // (leading columns present), so the unit must still parse with correct sqft. ---
  {
    const csv =
      `${baseHeader}\n` +
      '101,1000,Acme Corp\n' + // missing rent + both dates
      '102,2000,Beta LLC,8000,2024-06-01,2027-05-31\n'
    const p = await previewRentRoll(csv, 'ragged-fewer.csv')
    const u101 = (p.json?.units ?? []).find((u) => u.unit_number === '101')
    check(
      'RR ragged (fewer cols): leading columns stay aligned, sqft correct',
      { units: p.json?.units?.length, sqft101: u101?.rentable_sqft, start101: u101?.lease_start },
      { units: 2, sqft101: '1000.00', start101: null }
    )
  }

  // --- Row shape: RAGGED — a data row with MORE columns than the header. Extra
  // trailing cells are silently dropped by the header.forEach zip. The mapped
  // columns must stay correct (no shift). This is the classic silent-drop risk;
  // we assert the KEPT values are still right (extra data is genuinely extra). ---
  {
    const csv =
      `${baseHeader}\n` +
      '101,1000,Acme Corp,5000,2024-01-01,2026-12-31,EXTRA1,EXTRA2\n' +
      '102,2000,Beta LLC,8000,2024-06-01,2027-05-31\n'
    const p = await previewRentRoll(csv, 'ragged-more.csv')
    const u101 = (p.json?.units ?? []).find((u) => u.unit_number === '101')
    check(
      'RR ragged (more cols): mapped columns unshifted, values correct',
      { units: p.json?.units?.length, sqft101: u101?.rentable_sqft, rent101: u101?.base_rent },
      { units: 2, sqft101: '1000.00', rent101: '5000.00' }
    )
  }

  // --- Row shape: DUPLICATE header name. Two "Rentable SF" columns. The record
  // object is keyed by header text, so the LAST duplicate silently wins. This is
  // the sharpest silent-value-selection candidate. We send gross(1000) then
  // net(1) under the same name and observe which reaches the unit. ---
  {
    const dupHeader = 'Unit,Rentable SF,Tenant,Rentable SF'
    const csv = `${dupHeader}\n101,1000,Acme Corp,1\n`
    const p = await previewRentRoll(csv, 'dup-header.csv')
    const u101 = (p.json?.units ?? []).find((u) => u.unit_number === '101')
    report.observations.push({
      case: 'RR duplicate header (Rentable SF x2, values 1000 then 1)',
      resulting_rentable_sqft: u101?.rentable_sqft ?? null,
      note:
        'record is keyed by header text -> last duplicate wins silently, ' +
        'error_count stays 0. Documents the last-wins ambiguity.',
    })
    // Contract: whatever it picks, it must not 500 and must be ONE of the two
    // supplied values (not a merge/garbage), and error_count must be honest.
    check(
      'RR duplicate header: no 500, picked value is one of the supplied cells',
      {
        is500: p.status >= 500,
        pickedValid: ['1000.00', '1.00', undefined].includes(u101?.rentable_sqft),
      },
      { is500: false, pickedValid: true }
    )
  }

  // --- Row shape: header-only file (no data rows). Must be success:true, 0 units. ---
  {
    const p = await previewRentRoll(`${baseHeader}\n`, 'header-only.csv')
    check(
      'RR header-only: success, 0 units, 0 errors',
      { success: p.json?.success, units: p.json?.units?.length, errors: p.json?.error_count },
      { success: true, units: 0, errors: 0 }
    )
  }

  // --- Row shape: whitespace-only rows interspersed between data rows. Blank
  // rows are filtered; real rows must all survive with correct count. ---
  {
    const csv =
      `${baseHeader}\n` +
      `${baseRows[0]}\n` +
      '   ,  ,  ,  ,  ,  \n' +
      '\n' +
      `${baseRows[1]}\n` +
      `${baseRows[2]}\n`
    const p = await previewRentRoll(csv, 'blank-interspersed.csv')
    check(
      'RR blank rows interspersed: 3 units, same total sqft',
      { units: p.json?.units?.length, sqft: sumUnitField(p.json, 'rentable_sqft') },
      { units: 3, sqft: baseTotalSqft }
    )
  }

  // --- Encoding: latin-1 / windows-1252 high byte (0xE9 = "é") in a tenant name.
  // decodeCsv falls back to windows-1252 for non-UTF-8 bytes; the tenant name
  // must decode to a real "é", not mojibake, and sqft must stay aligned. ---
  {
    const prefix = `${baseHeader}\n101,1000,Caf`
    const suffix = ` Corp,5000,2024-01-01,2026-12-31\n`
    const bytes = concatBytes(latin1Bytes(prefix), Uint8Array.from([0xe9]), latin1Bytes(suffix))
    const p = await previewRentRollBytes(bytes, 'latin1.csv', 'text/csv')
    const u101 = (p.json?.units ?? []).find((u) => u.unit_number === '101')
    check(
      'RR windows-1252 high byte: decodes to é, sqft aligned, no 500',
      {
        is500: p.status >= 500,
        sqft101: u101?.rentable_sqft,
        tenantOk: (u101?.tenant_name ?? '').includes('é'),
      },
      { is500: false, sqft101: '1000.00', tenantOk: true }
    )
  }

  // --- Duplicate unit numbers: second occurrence must be skipped with a warning
  // (not double-counted). Verifies MIS-COUNT resistance. ---
  {
    const csv =
      `${baseHeader}\n` +
      '101,1000,Acme Corp,5000,2024-01-01,2026-12-31\n' +
      '101,9999,Dupe Corp,1,2024-01-01,2026-12-31\n'
    const p = await previewRentRoll(csv, 'dup-unit.csv')
    check(
      'RR duplicate unit number: 1 unit, second skipped, sqft is the FIRST',
      {
        units: p.json?.units?.length,
        sqft: (p.json?.units ?? [])[0]?.rentable_sqft,
      },
      { units: 1, sqft: '1000.00' }
    )
  }
}

// ===========================================================================
// GL UPLOAD — writes a batch; verify status-code robustness + row_count honesty,
// then delete the batch. Gated by editor role + full access; if the E2E account
// lacks either, we record the gate response and skip (still a valid observation).
// ===========================================================================

async function glUploadStructuralChecks() {
  const suffix = randomUUID().slice(0, 8)
  const property = await tryCreateProperty(`[PROD-TEST] C11A GL ${suffix}`)
  if (!property) {
    report.observations.push({ case: 'GL upload', note: 'could not create property; skipped' })
    return
  }
  created.propertyIds.push(property.id)

  // A valid Yardi-shaped GL with a duplicate amount-target: both "Amount" and
  // "Net Amount" map to `amount`. Column-order last-wins selects one silently.
  // We upload it and record which value the batch reports, plus verify no 500.
  const header = 'Account,Amount,Date,Net Amount'
  const csv = `Yardi GL Detail\n${header}\n5000,100.00,2024-01-15,90.00\n5001,200.00,2024-02-15,180.00\n`
  const up = await uploadGl(property.id, csv, 'gl-dup-amount.csv')
  if (up.status === 402 || up.status === 403) {
    report.observations.push({
      case: 'GL dual-amount upload',
      status: up.status,
      note: 'E2E account not entitled (editor+full-access gate); status-only',
    })
  } else {
    if (up.json?.batch_id) created.batchIds.push(up.json.batch_id)
    check(
      'GL dual-amount column: no 500, row_count honest (2), error_count 0',
      {
        is500: up.status >= 500,
        rows: up.json?.row_count,
        errors: up.json?.error_count,
      },
      { is500: false, rows: 2, errors: 0 }
    )
    report.observations.push({
      case: 'GL dual-amount (Amount vs Net Amount, both -> amount)',
      status: up.status,
      row_count: up.json?.row_count,
      warnings: up.json?.warnings,
      note: 'last-column-wins selects the value silently; see rent-roll dup-header',
    })
  }

  // Header-only GL (source detected but no data rows) is accepted as an empty
  // completed import batch with one parse error. Contract under test: honest
  // zero row_count, error_count 1, and never a 500.
  const hdrOnly = `Yardi GL Detail\n${header}\n`
  const up2 = await uploadGl(property.id, hdrOnly, 'gl-header-only.csv')
  if (![402, 403].includes(up2.status)) {
    if (up2.json?.batch_id) created.batchIds.push(up2.json.batch_id)
    check(
      'GL header-only: accepted empty batch, honest 0 rows, never 500',
      {
        is500: up2.status >= 500,
        status: up2.status,
        rows: up2.json?.row_count,
        errors: up2.json?.error_count,
      },
      { is500: false, status: 200, rows: 0, errors: 1 }
    )
    report.observations.push({
      case: 'GL header-only',
      status: up2.status,
      row_count: up2.json?.row_count,
      error_count: up2.json?.error_count,
      note: 'Current contract accepts an empty completed batch instead of rejecting the file.',
    })
  }

  // Non-multipart body to a multipart route -> clean 400 invalid_multipart_body.
  const bad = await probe('POST', '/api/v1/ingestion/upload', {
    token,
    body: { not: 'multipart' },
    contentLength: true,
  })
  check(
    'GL upload with JSON body: clean 4xx (no 500)',
    { is500: bad.status >= 500 },
    { is500: false }
  )
}

// ===========================================================================
// BILLING UPLOAD — the billing CSV parser uses records[0] as header
// UNCONDITIONALLY (no findHeaderRow scan). A leading title/preamble row would
// become the header. Verify that this fails SAFE (clean 4xx), never 500 and
// never a wrong-valued accepted set. Requires period_start/period_end + property.
// ===========================================================================

async function billingUploadStructuralChecks() {
  const suffix = randomUUID().slice(0, 8)
  const property = await tryCreateProperty(`[PROD-TEST] C11A Billing ${suffix}`)
  if (!property) {
    report.observations.push({ case: 'Billing upload', note: 'no property; skipped' })
    return
  }
  created.propertyIds.push(property.id)
  const period = { start: '2024-01-01', end: '2024-12-31' }

  // Clean billing baseline: Tenant,Amount.
  const clean = 'Tenant,Amount\nAcme Corp,5000.00\nBeta LLC,8000.00\n'
  const b1 = await uploadBilling(property.id, clean, 'billing-clean.csv', period)
  if ([402, 403].includes(b1.status)) {
    report.observations.push({
      case: 'Billing upload',
      status: b1.status,
      note: 'E2E account not entitled (editor gate); status-only',
    })
  } else {
    check(
      'Billing clean: 2 rows, total 13000, no 500',
      {
        is500: b1.status >= 500,
        rows: b1.json?.row_count,
        total: b1.json?.total_billed,
      },
      { is500: false, rows: 2, total: '13000' }
    )
    // Clean up billing rows for this period.
    await deleteBilling(property.id, period)
  }

  // Leading TITLE row -> billing uses records[0] as header, so the real header
  // "Tenant,Amount" becomes a data row. findColumnIndex on the title tokens must
  // NOT find tenant+amount -> clean 422 billing_parse_failed, never 500, never a
  // wrong-valued accepted set.
  const withTitle =
    'ACME Property CAM Reconciliation FY2024\nTenant,Amount\nAcme Corp,5000.00\n'
  const b2 = await uploadBilling(property.id, withTitle, 'billing-title.csv', period)
  if (![402, 403].includes(b2.status)) {
    check(
      'Billing leading title row: clean 4xx (no 500, no bogus accept)',
      {
        is500: b2.status >= 500,
        status4xx: b2.status >= 400 && b2.status < 500,
      },
      { is500: false, status4xx: true }
    )
    report.observations.push({
      case: 'Billing leading-title row (records[0]-as-header)',
      status: b2.status,
      row_count: b2.json?.row_count ?? null,
    })
    if (b2.status === 200) await deleteBilling(property.id, period)
  }

  // Title row that ACCIDENTALLY contains an amount-ish token ("Total") AND a
  // tenant-ish token ("Name"): "Monthly Total Report by Name". standardizeColumn
  // makes it a single header cell "monthly_total_report_by_name" which .includes
  // both "total" and "name" -> tenantIndex=amountIndex=0 (SAME column). Then EACH
  // data row's tenant and amount are read from the SAME cell. This is the sharpest
  // billing mis-map candidate: a NUMBER could be read as a tenant name and vice
  // versa, or a row silently skipped. Verify no 500 and no wrong-valued accept.
  const collide = 'Monthly Total Report by Name\nAcme Corp\n5000.00\n'
  const b3 = await uploadBilling(property.id, collide, 'billing-collide.csv', period)
  if (![402, 403].includes(b3.status)) {
    check(
      'Billing tenant/amount single-column collision: no 500, no bogus positive accept',
      {
        is500: b3.status >= 500,
        // If it "succeeds", it must not have invented a positive billed total
        // from a column that is simultaneously tenant AND amount.
        bogusAccept:
          b3.status === 200 &&
          Number(b3.json?.total_billed ?? 0) > 0 &&
          (b3.json?.items ?? []).some(
            (it) => it.tenant_name === String(it.billed_amount)
          ),
      },
      { is500: false, bogusAccept: false }
    )
    report.observations.push({
      case: 'Billing tenant/amount same-column collision',
      status: b3.status,
      total_billed: b3.json?.total_billed ?? null,
      row_count: b3.json?.row_count ?? null,
    })
    if (b3.status === 200) await deleteBilling(property.id, period)
  }
}

// ---------------------------------------------------------------------------
// upload / preview helpers
// ---------------------------------------------------------------------------

async function previewRentRoll(text, filename) {
  return previewRentRollBytes(latin1SafeBytes(text), filename, 'text/csv')
}

async function previewRentRollBytes(bytes, filename, type) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), filename)
  return multipart('POST', '/api/v1/rent-roll/preview', form)
}

async function uploadGl(propertyId, text, filename) {
  const form = new FormData()
  form.append('file', new Blob([latin1SafeBytes(text)], { type: 'text/csv' }), filename)
  form.append('property_id', propertyId)
  return multipart('POST', '/api/v1/ingestion/upload', form)
}

async function uploadBilling(propertyId, text, filename, period) {
  const form = new FormData()
  form.append('file', new Blob([latin1SafeBytes(text)], { type: 'text/csv' }), filename)
  form.append('property_id', propertyId)
  form.append('period_start', period.start)
  form.append('period_end', period.end)
  return multipart('POST', '/api/v1/actual-billed/upload', form)
}

async function deleteBilling(propertyId, period) {
  const qs = `period_start=${period.start}&period_end=${period.end}`
  const r = await probe('DELETE', `/api/v1/actual-billed/${propertyId}?${qs}`, { token })
  report.cleanup.push({
    path: `DELETE /api/v1/actual-billed/${propertyId}`,
    status: r.status,
    ok: r.status === 200,
  })
}

async function tryCreateProperty(name) {
  const r = await probe('POST', '/api/v1/properties', { token, body: propertyBody(name) })
  if (r.status === 201 && r.json?.id) return r.json
  report.observations.push({
    case: 'create property',
    status: r.status,
    body: r.text?.slice(0, 300),
  })
  return null
}

function propertyBody(name) {
  return {
    name,
    address_line1: '11 Structural Fuzz Way',
    city: 'Austin',
    state: 'TX',
    postal_code: '78704',
    total_rentable_sqft: '25000.00',
    total_usable_sqft: '22000.00',
    common_area_sqft: '3000.00',
    target_occupancy: '0.95',
    boma_standard_version: '2024',
    fiscal_year_start_month: 1,
  }
}

// ---------------------------------------------------------------------------
// low-level fetch helpers
// ---------------------------------------------------------------------------

async function multipart(method, path, form) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, json: safeJson(text) }
}

async function probe(method, path, { token: t, body, contentLength } = {}) {
  const headers = { accept: 'application/json' }
  if (t) headers.authorization = `Bearer ${t}`
  let payload
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
    if (contentLength) headers['content-length'] = String(Buffer.byteLength(payload))
  }
  const response = await fetch(`${apiUrl}${path}`, { method, headers, body: payload })
  const text = await response.text()
  return { status: response.status, text, json: safeJson(text) }
}

async function cleanup() {
  for (const batchId of created.batchIds) {
    try {
      const r = await fetch(`${apiUrl}/api/v1/ingestion/batches/${batchId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      report.cleanup.push({ path: `DELETE batch ${batchId}`, status: r.status, ok: r.status === 204 })
    } catch (error) {
      report.cleanup.push({ path: `DELETE batch ${batchId}`, ok: false, error: errorMessage(error) })
    }
  }
  for (const propertyId of created.propertyIds) {
    try {
      const r = await fetch(`${apiUrl}/api/v1/properties/${propertyId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      report.cleanup.push({ path: `DELETE property ${propertyId}`, status: r.status, ok: r.status === 204 })
    } catch (error) {
      report.cleanup.push({ path: `DELETE property ${propertyId}`, ok: false, error: errorMessage(error) })
    }
  }
}

// ---------------------------------------------------------------------------
// data helpers
// ---------------------------------------------------------------------------

function sumUnitField(json, field) {
  const units = json?.units ?? []
  let sum = 0
  for (const u of units) sum += Number(u[field] ?? 0)
  return sum.toFixed(2)
}

function utf16leBytes(str) {
  const buf = new Uint8Array(str.length * 2)
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i)
    buf[i * 2] = code & 0xff
    buf[i * 2 + 1] = (code >> 8) & 0xff
  }
  return buf
}

function latin1Bytes(str) {
  const buf = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i += 1) buf[i] = str.charCodeAt(i) & 0xff
  return buf
}

// UTF-8 encode for normal (ASCII) fixtures; the parser expects UTF-8 by default.
function latin1SafeBytes(str) {
  return new TextEncoder().encode(str)
}

function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
}

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase auth failed: ${JSON.stringify(json)}`)
  }
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email ?? email }
  return json.access_token
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
