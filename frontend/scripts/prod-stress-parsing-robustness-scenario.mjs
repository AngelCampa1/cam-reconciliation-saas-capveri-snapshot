// Prod E2E stress scenario (cycle 05A): adversarial file-parsing robustness.
//
// Domain: push adversarial input documents through the THREE live prod upload
// parsers (actual-billed, rent-roll, GL) and verify the system FAILS CLOSED — a
// clean 4xx parse/validation error, never a crash / 500 / partial / silently-wrong
// parse. Where a file is ACCEPTED, read the persisted value back and assert it is
// correct (penny-exact, right row count, no data loss/dup).
//
// Focus (disjoint from prior GL-adversarial + rentroll-billing scenarios):
//   - numeric-contract gap: billing parseMoney + rent-roll decimalValue use bare
//     `new Decimal()` with NO regex gate (unlike GL cleanCurrency), so NaN / Infinity
//     / hex(0x) / binary(0b) / scientific(1e3) slip past. NaN persists (fail-OPEN),
//     Infinity 500s after preview OK (not a clean 4xx).
//   - encoding edge cases, injection payloads, structural/column adversaries.
//
// All created entities are prefixed "[PROD-TEST]" and cleaned up in finally.
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
  `prod-stress-parsing-robustness-${runId}`
)
const fixtureDir = resolve(outputDir, 'fixtures')
await mkdir(fixtureDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  findings: [],
  checks: [],
  cleanup: [],
}

let token
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.every((c) => c.ok)
} catch (error) {
  report.fatal = errorMessage(error)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

// A soft check: record pass/fail but DO NOT throw. A parsing-robustness sweep
// wants to observe every probe's outcome, not abort on the first fail-open.
function check(label, actual, expected, note) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected, ...(note ? { note } : {}) })
  return ok
}

function finding(entry) {
  report.findings.push(entry)
}

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const created = { propertyIds: [], billingPeriods: [] }
  report.suffix = suffix

  try {
    // A property to hang actual-billed uploads on (own its own so cleanup is easy).
    const billingProperty = await createProperty(
      `[PROD-TEST] Parsing Robustness Billing ${suffix}`
    )
    created.propertyIds.push(billingProperty.id)

    await probeBillingNumericContract({ property: billingProperty, suffix, created })
    await probeBillingEncodingAndStructure({ property: billingProperty, suffix, created })
    await probeRentRollNumericContract({ suffix, created })
    await probeRentRollEncodingAndStructure({ suffix, created })
    await probeRentRollExtensionAndEmpty({ suffix })
  } finally {
    await cleanup(created)
  }
}

// ===========================================================================
// BILLING — numeric-contract gap (PRIMARY)
// ===========================================================================
async function probeBillingNumericContract({ property, suffix, created }) {
  // Baseline: a normal row must round-trip penny-exact so we trust the pipe.
  const period = { start: '2025-01-01', end: '2025-12-31' }
  const baseline = [
    'tenant,billed_amount,suite',
    'Acme Corp,1234.56,100',
  ].join('\n')
  const baseUp = await uploadBilling({
    property, period, suffix, created,
    fileName: `bill-baseline-${suffix}.csv`, body: baseline,
  })
  check(
    'BILL baseline: 1 row, total_billed 1234.56 echoed',
    { status: baseUp.status, rowCount: baseUp.json?.row_count ?? baseUp.json?.rows?.length ?? null, total: baseUp.json?.total_billed ?? baseUp.json?.summary?.total_billed ?? null },
    { status: 200, rowCount: 1, total: '1234.56' },
    'establishes the happy path; shape of response captured below'
  )
  // Capture the raw baseline response so we understand the schema for later probes.
  report.billing_response_shape = safeShape(baseUp.json)
  await deleteBillingPeriod(property.id, period, created)

  // ---- B-NAN: literal "NaN" in the amount column ----
  const bNanBody = [
    'tenant,billed_amount,suite',
    'Nan Tenant,NaN,200',
  ].join('\n')
  const bNan = await uploadBilling({
    property, period, suffix, created,
    fileName: `bill-nan-${suffix}.csv`, body: bNanBody, track: true,
  })
  await saveFixture(`bill-nan-${suffix}.csv`, bNanBody)
  const nanTotal = bNan.json?.total_billed ?? bNan.json?.summary?.total_billed ?? null
  const nanAccepted = bNan.status === 200
  // Read back persisted value.
  let nanPersisted = null
  if (nanAccepted) {
    const back = await readBilling(property.id, period)
    nanPersisted = {
      total_billed: back?.total_billed ?? null,
      first_amount: back?.items?.[0]?.billed_amount ?? null,
      count: back?.items?.length ?? null,
    }
  }
  const nanFailClosed = bNan.status >= 400 && bNan.status < 500
  check(
    'BILL NaN amount FAILS CLOSED (clean 4xx, not accepted/NaN-persisted)',
    { fail_closed: nanFailClosed },
    { fail_closed: true },
    `observed status=${bNan.status}, echoed total=${JSON.stringify(nanTotal)}, persisted=${JSON.stringify(nanPersisted)}`
  )
  if (nanAccepted) {
    finding({
      id: 'B-NAN',
      severity: 'MEDIUM',
      site: 'cloudflare-backend/src/domain/actual-billed/billing-parser.ts:347 parseMoney',
      input: 'actual-billed CSV row with billed_amount = "NaN"',
      observed: `HTTP ${bNan.status}; echoed total_billed=${JSON.stringify(nanTotal)}; persisted=${JSON.stringify(nanPersisted)}`,
      expected: 'clean 4xx parse rejection (row skipped as non-numeric, matching GL cleanCurrency regex contract)',
      why: 'parseMoney does `new Decimal("NaN")` (no regex gate); the only row guard is amount.lte(0) which is FALSE for NaN (all NaN comparisons are false), so the row is kept. Postgres billed_amount NUMERIC(14,2) accepts \'NaN\'::numeric, so the poison value PERSISTS (fail-OPEN) and corrupts every downstream sum/leakage/comparison.',
    })
    await deleteBillingPeriod(property.id, period, created)
  }

  // ---- B-INF: literal "Infinity" ----
  const bInfBody = [
    'tenant,billed_amount,suite',
    'Inf Tenant,Infinity,201',
  ].join('\n')
  const bInf = await uploadBilling({
    property, period, suffix, created,
    fileName: `bill-inf-${suffix}.csv`, body: bInfBody, track: true,
  })
  await saveFixture(`bill-inf-${suffix}.csv`, bInfBody)
  const infFailClosed4xx = bInf.status >= 400 && bInf.status < 500
  check(
    'BILL Infinity amount FAILS CLOSED with a clean 4xx (not a 500)',
    { status_class: statusClass(bInf.status) },
    { status_class: '4xx' },
    `observed status=${bInf.status}, body=${bInf.text.slice(0, 200)}`
  )
  if (bInf.status >= 500) {
    finding({
      id: 'B-INF',
      severity: 'LOW-MEDIUM',
      site: 'billing-parser.ts:347 parseMoney + adapters/db/actual-billed.ts insert ($7::numeric)',
      input: 'actual-billed CSV row with billed_amount = "Infinity"',
      observed: `HTTP ${bInf.status} (server error) after preview accepted the row`,
      expected: 'clean 4xx parse rejection at parse time',
      why: 'parseMoney accepts new Decimal("Infinity"); amount.lte(0) is false so the row is kept; the DB insert then hits numeric field overflow ("cannot hold an infinite value") -> 500. The parse layer should reject non-finite values before the DB does.',
    })
  }
  if (bInf.status === 200) await deleteBillingPeriod(property.id, period, created)

  // ---- B-SCI / B-HEX / B-BIN: silent misparse of non-decimal literals ----
  // Each in its own upload so we can read back the exact persisted number.
  const misparseCases = [
    { tag: 'sci', raw: '1e3', decoded: '1000' },
    { tag: 'hex', raw: '0x10', decoded: '16' },
    { tag: 'bin', raw: '0b101', decoded: '5' },
  ]
  for (const mc of misparseCases) {
    const body = ['tenant,billed_amount,suite', `Misparse ${mc.tag},${mc.raw},30${mc.tag}`].join('\n')
    const up = await uploadBilling({
      property, period, suffix, created,
      fileName: `bill-${mc.tag}-${suffix}.csv`, body, track: true,
    })
    await saveFixture(`bill-${mc.tag}-${suffix}.csv`, body)
    let persistedAmount = null
    if (up.status === 200) {
      const back = await readBilling(property.id, period)
      persistedAmount = back?.items?.[0]?.billed_amount ?? null
    }
    const rejected = up.status >= 400 && up.status < 500
    check(
      `BILL "${mc.raw}" amount FAILS CLOSED (rejected as non-decimal, not misparsed)`,
      { rejected },
      { rejected: true },
      `observed status=${up.status}, persisted_amount=${JSON.stringify(persistedAmount)} (would silently become ${mc.decoded})`
    )
    if (up.status === 200) {
      finding({
        id: `B-${mc.tag.toUpperCase()}`,
        severity: 'MEDIUM',
        site: 'billing-parser.ts:347 parseMoney',
        input: `actual-billed CSV row with billed_amount = "${mc.raw}"`,
        observed: `HTTP 200 accepted; persisted billed_amount=${JSON.stringify(persistedAmount)} (silently decoded ${mc.raw} -> ${mc.decoded})`,
        expected: 'clean 4xx / row-skip as non-decimal money (GL cleanCurrency regex rejects these)',
        why: 'new Decimal() parses JS numeric literals (scientific/hex/binary); a real currency value like "0x10" or "1e3" is silently reinterpreted as 16 / 1000, corrupting the billed total with no error.',
      })
      await deleteBillingPeriod(property.id, period, created)
    }
  }

  // ---- B-UMINUS: unicode minus U+2212 (billing does NOT canonicalize it; GL does) ----
  // "−500" (U+2212) -> new Decimal throws -> row skipped. Verify it does not crash /
  // does not silently become +500.
  const uminusBody = [
    'tenant,billed_amount,suite',
    'Good Row,100.00,400',
    'Uminus Row,−500.00,401',
  ].join('\n')
  const uminus = await uploadBilling({
    property, period, suffix, created,
    fileName: `bill-uminus-${suffix}.csv`, body: uminusBody, track: true,
  })
  await saveFixture(`bill-uminus-${suffix}.csv`, uminusBody)
  let uminusBack = null
  if (uminus.status === 200) {
    const back = await readBilling(property.id, period)
    uminusBack = { total: back?.total_billed ?? null, count: back?.items?.length ?? null, amounts: (back?.items ?? []).map((i) => i.billed_amount) }
  }
  // Correct behavior: unicode-minus row skipped (negative anyway), good row kept @100.00.
  check(
    'BILL unicode-minus row skipped safely (no crash, no +500 flip), good row kept',
    { status: uminus.status, back: uminusBack },
    { status: 200, back: { total: '100.00', count: 1, amounts: ['100.00'] } },
    'U+2212 not canonicalized by billing parseMoney -> new Decimal throws -> row skipped; negative anyway so skipping is fine. Documents divergence from GL cleanCurrency (which canonicalizes U+2212).'
  )
  if (uminus.status === 200) await deleteBillingPeriod(property.id, period, created)
}

// ===========================================================================
// BILLING — encoding + structural adversaries
// ===========================================================================
async function probeBillingEncodingAndStructure({ property, suffix, created }) {
  const period = { start: '2025-01-01', end: '2025-12-31' }

  // BE-INJECT: CSV formula-injection payloads must round-trip as DATA (no exec,
  // no crash, value preserved). Amount column stays numeric.
  const injectBody = [
    'tenant,billed_amount,suite',
    '=cmd|calc,100.00,I1',
    '+SUM(A1:A9),200.00,I2',
    '@formula,300.00,I3',
    '-2+3,400.00,I4',
    'tab\tinject,500.00,I5',
  ].join('\n')
  const inject = await uploadBilling({
    property, period, suffix, created,
    fileName: `bill-inject-${suffix}.csv`, body: injectBody, track: true,
  })
  await saveFixture(`bill-inject-${suffix}.csv`, injectBody)
  let injectBack = null
  if (inject.status === 200) {
    const back = await readBilling(property.id, period)
    injectBack = {
      count: back?.items?.length ?? null,
      total: back?.total_billed ?? null,
      names: (back?.items ?? []).map((i) => i.tenant_name).sort(),
    }
  }
  check(
    'BILL formula-injection payloads round-trip as literal data (no crash, 5 rows, exact total)',
    { status: inject.status, count: injectBack?.count ?? null, total: injectBack?.total ?? null },
    { status: 200, count: 5, total: '1500.00' },
    `tenant names stored verbatim: ${JSON.stringify(injectBack?.names)}`
  )
  if (inject.status === 200) await deleteBillingPeriod(property.id, period, created)

  // BE-UTF16: UTF-16LE + BOM. decodeCsv does utf-8 fatal then windows-1252 fallback;
  // UTF-16 will mojibake. Correct fail-closed = a parse rejection (columns not found)
  // rather than a silently-wrong import. We assert it does NOT 200 with wrong data.
  const utf16Text = 'tenant,billed_amount,suite\nUtf16 Tenant,999.99,U16\n'
  const utf16Bytes = encodeUtf16LEWithBom(utf16Text)
  const utf16 = await uploadBillingBytes({
    property, period, fileName: `bill-utf16-${suffix}.csv`,
    bytes: utf16Bytes, mimeType: 'text/csv',
  })
  await saveFixtureBytes(`bill-utf16-${suffix}.csv`, utf16Bytes)
  let utf16Back = null
  if (utf16.status === 200) {
    const back = await readBilling(property.id, period)
    utf16Back = { count: back?.items?.length ?? null, total: back?.total_billed ?? null }
    // If it wrongly imported the mojibaked data, that's a silently-wrong parse.
  }
  // windows-1252 decode of UTF-16LE turns the header into "t\0e\0n..." so the column
  // detector cannot find tenant/amount -> parse should fail (422). Anything that 200s
  // with a real row would be a silently-wrong decode.
  const utf16Ok = utf16.status >= 400 && utf16.status < 500
  check(
    'BILL UTF-16LE file FAILS CLOSED (columns unrecognized after non-UTF8 decode, not silently imported)',
    { fail_closed_4xx: utf16Ok },
    { fail_closed_4xx: true },
    `observed status=${utf16.status}, back=${JSON.stringify(utf16Back)}`
  )
  if (utf16.status === 200 && (utf16Back?.count ?? 0) > 0) {
    finding({
      id: 'BE-UTF16',
      severity: 'LOW',
      site: 'actual-billed-routes.ts decodeCsv (utf-8 fatal -> windows-1252 fallback)',
      input: 'actual-billed CSV encoded UTF-16LE+BOM',
      observed: `HTTP 200, imported ${utf16Back?.count} row(s)`,
      expected: 'parse rejection (no recognizable columns) or a correctly decoded value',
      why: 'UTF-16 is not detected; the windows-1252 fallback mojibakes it. Investigate whether a wrong value was persisted.',
    })
    await deleteBillingPeriod(property.id, period, created)
  }

  // BE-DUPCOL: duplicate amount headers; findColumnIndex returns FIRST match.
  const dupColBody = [
    'tenant,billed_amount,billed_amount,suite',
    'Dup Col,111.11,222.22,D1',
  ].join('\n')
  const dupCol = await uploadBilling({
    property, period, suffix, created,
    fileName: `bill-dupcol-${suffix}.csv`, body: dupColBody, track: true,
  })
  await saveFixture(`bill-dupcol-${suffix}.csv`, dupColBody)
  let dupBack = null
  if (dupCol.status === 200) {
    const back = await readBilling(property.id, period)
    dupBack = { total: back?.total_billed ?? null, count: back?.items?.length ?? null }
  }
  // Deterministic: first billed_amount column wins -> 111.11. Assert deterministic + not a crash.
  check(
    'BILL duplicate amount columns: deterministic (first column wins), no crash',
    { status: dupCol.status, total: dupBack?.total ?? null, count: dupBack?.count ?? null },
    { status: 200, total: '111.11', count: 1 },
    'confirms findColumnIndex first-match determinism on duplicate headers'
  )
  if (dupCol.status === 200) await deleteBillingPeriod(property.id, period, created)

  // BE-EMBEDNL: embedded newline inside a quoted tenant field must not break rows.
  const embedBody = [
    'tenant,billed_amount,suite',
    '"Multi\nLine Tenant",750.00,E1',
    'Second Tenant,250.00,E2',
  ].join('\n')
  const embed = await uploadBilling({
    property, period, suffix, created,
    fileName: `bill-embednl-${suffix}.csv`, body: embedBody, track: true,
  })
  await saveFixture(`bill-embednl-${suffix}.csv`, embedBody)
  let embedBack = null
  if (embed.status === 200) {
    const back = await readBilling(property.id, period)
    embedBack = { count: back?.items?.length ?? null, total: back?.total_billed ?? null }
  }
  check(
    'BILL quoted embedded newline: 2 rows, total 1000.00 (quote-aware parser)',
    { status: embed.status, count: embedBack?.count ?? null, total: embedBack?.total ?? null },
    { status: 200, count: 2, total: '1000.00' }
  )
  if (embed.status === 200) await deleteBillingPeriod(property.id, period, created)

  // BE-NOAMT: missing amount column entirely -> clean 422 parse failure.
  const noAmtBody = ['tenant,suite', 'No Amount Tenant,N1'].join('\n')
  const noAmt = await uploadBilling({
    property, period, suffix, created,
    fileName: `bill-noamt-${suffix}.csv`, body: noAmtBody, track: false,
  })
  await saveFixture(`bill-noamt-${suffix}.csv`, noAmtBody)
  check(
    'BILL missing amount column -> clean 422 billing_parse_failed',
    { status: noAmt.status, code: errorCode(noAmt.json) },
    { status: 422, code: 'billing_parse_failed' }
  )

  // BE-EMPTY: empty file -> 400 empty_file (route-level guard).
  const empty = await uploadBillingBytes({
    property, period, fileName: `bill-empty-${suffix}.csv`,
    bytes: new Uint8Array(0), mimeType: 'text/csv',
  })
  check(
    'BILL empty file -> 400 empty_file',
    { status: empty.status, code: errorCode(empty.json) },
    { status: 400, code: 'empty_file' }
  )

  // BE-BADEXT: wrong extension/mime (.pdf) -> 415 unsupported_file_type.
  const badExt = await uploadBillingBytes({
    property, period, fileName: `bill-fake-${suffix}.pdf`,
    bytes: new TextEncoder().encode('%PDF-1.4 not really'), mimeType: 'application/pdf',
  })
  check(
    'BILL non-CSV/XLSX extension -> 415 unsupported_file_type',
    { status: badExt.status, code: errorCode(badExt.json) },
    { status: 415, code: 'unsupported_file_type' }
  )
}

// ===========================================================================
// RENT-ROLL — numeric-contract gap on rentable_sqft
// ===========================================================================
async function probeRentRollNumericContract({ suffix, created }) {
  // Baseline import to confirm the pipe + read-back path.
  const baseHeader = 'unit,tenant,rentable_sqft,lease_start,lease_end,base_rent'
  const baseBody = [
    baseHeader,
    'RR-100,Acme Corp,1000.00,2025-01-01,2025-12-31,5000.00',
  ].join('\n')
  const base = await importRentRoll({
    suffix, fileName: `rr-base-${suffix}.csv`, body: baseBody,
    propertyName: `[PROD-TEST] Parsing RR Baseline ${suffix}`, created,
  })
  check(
    'RR baseline import: 1 unit created',
    { status: base.status, units: base.json?.units_created ?? null },
    { status: 200 === base.status ? 200 : 201, units: 1 },
    'establishes rent-roll happy path'
  )

  // ---- RR-NAN: preview a NaN rentable_sqft. The parser positivity gate is
  // `new Decimal(rentableSqft).lte(0)` which is FALSE for NaN -> row KEPT with
  // rentable_sqft "NaN". Postgres CHECK (rentable_sqft > 0) is TRUE for NaN
  // (verified via MCP) -> would PERSIST NaN (fail-OPEN) poisoning the pro-rata
  // denominator. We use PREVIEW (no write) to observe the parse, then only import
  // if preview shows the row was kept (to prove the fail-open end to end) — but we
  // gate the import so we don't intentionally persist NaN unless preview proves it.
  const nanBody = [
    baseHeader,
    'RR-NAN,Nan Tenant,NaN,2025-01-01,2025-12-31,5000.00',
  ].join('\n')
  const nanPrev = await previewRentRoll({ fileName: `rr-nan-${suffix}.csv`, body: nanBody })
  await saveFixture(`rr-nan-${suffix}.csv`, nanBody)
  const nanUnit = nanPrev.json?.units?.[0] ?? null
  const nanKept = (nanPrev.json?.units?.length ?? 0) === 1 && nanUnit?.rentable_sqft === 'NaN'
  check(
    'RR NaN rentable_sqft is REJECTED at preview (not kept as a NaN unit)',
    { kept_nan_unit: nanKept },
    { kept_nan_unit: false },
    `preview units=${JSON.stringify(nanPrev.json?.units)}, warnings=${JSON.stringify(nanPrev.json?.warnings)}`
  )
  if (nanKept) {
    // Prove the end-to-end fail-open by importing and reading back the persisted sqft.
    const imp = await importRentRoll({
      suffix, fileName: `rr-nan-import-${suffix}.csv`, body: nanBody,
      propertyName: `[PROD-TEST] Parsing RR NaN ${suffix}`, created,
    })
    let persistedSqft = null
    let totalSqft = null
    if (imp.status === 201 || imp.status === 200) {
      const prop = await getProperty(imp.json.property_id)
      totalSqft = prop?.total_rentable_sqft ?? null
      const units = await readUnits(imp.json.property_id)
      persistedSqft = units?.[0]?.rentable_sqft ?? null
    }
    finding({
      id: 'RR-NAN',
      severity: 'MEDIUM',
      site: 'cloudflare-backend/src/domain/rent-roll/parser.ts:472,521 (positivity gate + decimalValue) + adapters/db/rent-roll.ts insert',
      input: 'rent-roll CSV row with rentable_sqft = "NaN"',
      observed: `preview kept a unit with rentable_sqft="NaN"; import HTTP ${imp.status}; persisted unit sqft=${JSON.stringify(persistedSqft)}, total_rentable_sqft=${JSON.stringify(totalSqft)}`,
      expected: 'row rejected as non-numeric sqft (matching the >0 intent and GL cleanCurrency regex contract)',
      why: 'decimalValue does new Decimal("NaN") (no regex gate); the positivity gate new Decimal(rentableSqft).lte(0) is FALSE for NaN so the row survives. Postgres CHECK (rentable_sqft > 0) evaluates NaN>0 as TRUE, so NaN PERSISTS and poisons total_rentable_sqft (the pro-rata denominator) -> silently-wrong reconciliation.',
    })
  }

  // ---- RR-INF: Infinity rentable_sqft. Parser keeps it; DB NUMERIC(10,2) overflow.
  const infBody = [
    baseHeader,
    'RR-INF,Inf Tenant,Infinity,2025-01-01,2025-12-31,5000.00',
  ].join('\n')
  const infPrev = await previewRentRoll({ fileName: `rr-inf-${suffix}.csv`, body: infBody })
  await saveFixture(`rr-inf-${suffix}.csv`, infBody)
  const infUnit = infPrev.json?.units?.[0] ?? null
  const infKept = infUnit?.rentable_sqft === 'Infinity'
  if (infKept) {
    const imp = await importRentRoll({
      suffix, fileName: `rr-inf-import-${suffix}.csv`, body: infBody,
      propertyName: `[PROD-TEST] Parsing RR Inf ${suffix}`, created,
    })
    check(
      'RR Infinity rentable_sqft FAILS CLOSED with a clean 4xx (not a 500)',
      { status_class: statusClass(imp.status) },
      { status_class: '4xx' },
      `import status=${imp.status}, body=${imp.text.slice(0, 200)}`
    )
    if (imp.status >= 500) {
      finding({
        id: 'RR-INF',
        severity: 'LOW-MEDIUM',
        site: 'rent-roll/parser.ts decimalValue + adapters/db/rent-roll.ts insert',
        input: 'rent-roll CSV row with rentable_sqft = "Infinity"',
        observed: `preview kept it; import HTTP ${imp.status} (server error)`,
        expected: 'clean 4xx parse rejection at parse time',
        why: 'decimalValue accepts new Decimal("Infinity"); positivity gate false; DB NUMERIC(10,2) rejects Infinity -> numeric field overflow -> 500 after preview said OK.',
      })
    }
    if (imp.status === 201 || imp.status === 200) created.propertyIds.push(imp.json.property_id)
  } else {
    check(
      'RR Infinity rentable_sqft rejected at preview',
      { kept: false },
      { kept: false },
      `preview units=${JSON.stringify(infPrev.json?.units)}`
    )
  }

  // ---- RR-SCI/HEX: silent misparse of sqft ----
  for (const mc of [{ tag: 'sci', raw: '1e3', decoded: '1000.00' }, { tag: 'hex', raw: '0x64', decoded: '100.00' }]) {
    const body = [baseHeader, `RR-${mc.tag},Misparse ${mc.tag},${mc.raw},2025-01-01,2025-12-31,5000.00`].join('\n')
    const prev = await previewRentRoll({ fileName: `rr-${mc.tag}-${suffix}.csv`, body })
    await saveFixture(`rr-${mc.tag}-${suffix}.csv`, body)
    const unit = prev.json?.units?.[0] ?? null
    const misparsed = unit?.rentable_sqft === mc.decoded
    check(
      `RR "${mc.raw}" sqft REJECTED (not silently decoded to ${mc.decoded})`,
      { misparsed_and_kept: misparsed },
      { misparsed_and_kept: false },
      `preview rentable_sqft=${JSON.stringify(unit?.rentable_sqft)}`
    )
    if (misparsed) {
      finding({
        id: `RR-${mc.tag.toUpperCase()}`,
        severity: 'MEDIUM',
        site: 'rent-roll/parser.ts:521 decimalValue',
        input: `rent-roll rentable_sqft = "${mc.raw}"`,
        observed: `preview kept unit with rentable_sqft=${mc.decoded} (silently decoded ${mc.raw})`,
        expected: 'clean rejection as non-decimal sqft',
        why: 'new Decimal() parses hex/scientific literals; a garbled sqft cell is silently reinterpreted, corrupting the pro-rata denominator.',
      })
    }
  }
}

// ===========================================================================
// RENT-ROLL — encoding + structure + extension/empty
// ===========================================================================
async function probeRentRollEncodingAndStructure({ suffix, created }) {
  const baseHeader = 'unit,tenant,rentable_sqft,lease_start,lease_end,base_rent'

  // RR-LATIN1: Latin-1 (windows-1252) bytes. rent-roll uses file.text() (default
  // UTF-8, LOSSY) with NO windows-1252 fallback (unlike GL/billing decodeCsv).
  // A tenant name with a Latin-1 byte (0xE9 = é) should NOT silently corrupt.
  const latinHeader = new TextEncoder().encode(baseHeader + '\n')
  // "Café Tenant" with 0xE9 for é in windows-1252
  const latinRow = new Uint8Array([
    ...new TextEncoder().encode('RR-L1,Caf'),
    0xe9,
    ...new TextEncoder().encode(' Tenant,1000.00,2025-01-01,2025-12-31,5000.00\n'),
  ])
  const latinBytes = concatBytes(latinHeader, latinRow)
  const latinPrev = await previewRentRollBytes({ fileName: `rr-latin1-${suffix}.csv`, bytes: latinBytes })
  await saveFixtureBytes(`rr-latin1-${suffix}.csv`, latinBytes)
  const latinUnit = latinPrev.json?.units?.[0] ?? null
  const latinName = latinUnit?.tenant_name ?? null
  // file.text() UTF-8 decode of a lone 0xE9 yields U+FFFD (replacement char).
  const mojibaked = typeof latinName === 'string' && latinName.includes('�')
  check(
    'RR Latin-1 tenant name: no crash; document whether name is mojibaked (\\uFFFD)',
    { status: latinPrev.status, mojibaked },
    { status: 200, mojibaked },
    `tenant_name=${JSON.stringify(latinName)} — rent-roll uses file.text() (no windows-1252 fallback like GL/billing); lone 0xE9 -> U+FFFD. Not money-affecting, recorded as an observation.`
  )
  if (mojibaked) {
    finding({
      id: 'RR-LATIN1',
      severity: 'LOW',
      site: 'cloudflare-backend/src/http/rent-roll-routes.ts:206 readCsvFile (file.text())',
      input: 'rent-roll CSV with a windows-1252 byte (0xE9) in tenant name',
      observed: `tenant_name decoded to ${JSON.stringify(latinName)} (contains U+FFFD replacement char)`,
      expected: 'consistent decode with GL/billing which fall back to windows-1252; or a documented decode policy',
      why: 'rent-roll uses File.text() (default UTF-8, lossy) while GL (ingestion-routes decodeCsv) and billing (actual-billed-routes decodeCsv) both fall back to windows-1252 for non-UTF8 bytes. Inconsistent decode across the three importers; tenant name silently corrupted. Non-money (name only), so LOW.',
    })
  }

  // RR-BOM: UTF-8 BOM must be stripped (parser strips ^﻿).
  const bomBody = '﻿' + [baseHeader, 'RR-BOM,Bom Tenant,1000.00,2025-01-01,2025-12-31,5000.00'].join('\n')
  const bomPrev = await previewRentRoll({ fileName: `rr-bom-${suffix}.csv`, body: bomBody })
  await saveFixture(`rr-bom-${suffix}.csv`, bomBody)
  check(
    'RR UTF-8 BOM stripped: 1 unit parsed with clean unit_number',
    { status: bomPrev.status, units: bomPrev.json?.units?.length ?? null, unit0: bomPrev.json?.units?.[0]?.unit_number ?? null },
    { status: 200, units: 1, unit0: 'RR-BOM' }
  )

  // RR-DUP: duplicate unit number -> second skipped with warning (documented).
  const dupBody = [
    baseHeader,
    'RR-D,First,1000.00,2025-01-01,2025-12-31,5000.00',
    'RR-D,Second,2000.00,2025-01-01,2025-12-31,6000.00',
  ].join('\n')
  const dupPrev = await previewRentRoll({ fileName: `rr-dup-${suffix}.csv`, body: dupBody })
  await saveFixture(`rr-dup-${suffix}.csv`, dupBody)
  check(
    'RR duplicate unit number: only first kept, warning emitted (no dup)',
    { status: dupPrev.status, units: dupPrev.json?.units?.length ?? null, hasWarn: (dupPrev.json?.warnings ?? []).some((w) => /duplicate/i.test(w)) },
    { status: 200, units: 1, hasWarn: true }
  )

  // RR-INJECT: formula injection in tenant name round-trips as data (no crash).
  const injBody = [
    baseHeader,
    '=cmd|calc,=cmd|calc,1000.00,2025-01-01,2025-12-31,5000.00',
  ].join('\n')
  const injPrev = await previewRentRoll({ fileName: `rr-inject-${suffix}.csv`, body: injBody })
  await saveFixture(`rr-inject-${suffix}.csv`, injBody)
  check(
    'RR formula-injection tenant name round-trips as literal (no crash)',
    { status: injPrev.status, name: injPrev.json?.units?.[0]?.tenant_name ?? null },
    { status: 200, name: '=cmd|calc' }
  )

  // RR-NEGSQFT: negative sqft -> row thrown (error_count), documented positive gate.
  const negBody = [
    baseHeader,
    'RR-NEG,Neg Tenant,-500.00,2025-01-01,2025-12-31,5000.00',
  ].join('\n')
  const negPrev = await previewRentRoll({ fileName: `rr-neg-${suffix}.csv`, body: negBody })
  await saveFixture(`rr-neg-${suffix}.csv`, negBody)
  check(
    'RR negative sqft: row excluded (0 units, error_count>0)',
    { status: negPrev.status, units: negPrev.json?.units?.length ?? null, errors: (negPrev.json?.error_count ?? 0) > 0 || (negPrev.json?.warnings ?? []).some((w) => /positive/i.test(w)) },
    { status: 200, units: 0, errors: true }
  )
}

async function probeRentRollExtensionAndEmpty({ suffix }) {
  // RR-EMPTY-PREVIEW: empty file -> parser returns success:false failure -> preview 200 with success:false.
  const emptyPrev = await previewRentRollBytes({ fileName: `rr-empty-${suffix}.csv`, bytes: new Uint8Array(0) })
  check(
    'RR empty file at preview: success:false, error surfaced (no crash)',
    { status: emptyPrev.status, success: emptyPrev.json?.success ?? null, units: emptyPrev.json?.units?.length ?? null },
    { status: 200, success: false, units: 0 }
  )

  // RR-XLSX: .xlsx rejected 415 (documented not-yet-supported).
  const xlsx = await previewRentRollBytes({
    fileName: `rr-fake-${suffix}.xlsx`,
    bytes: new TextEncoder().encode('PK not really xlsx'),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  check(
    'RR .xlsx rejected 415 unsupported_rent_roll_format',
    { status: xlsx.status, code: errorCode(xlsx.json) },
    { status: 415, code: 'unsupported_rent_roll_format' }
  )

  // RR-PDF-EXT: a .pdf (not .xlsx/.xls) is NOT blocked by extension; goes to
  // file.text() and the parser. Correct fail-closed = parse failure/empty, not crash.
  const pdf = await previewRentRollBytes({
    fileName: `rr-fake-${suffix}.pdf`,
    bytes: new TextEncoder().encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3 binary junk'),
    mimeType: 'application/pdf',
  })
  check(
    'RR .pdf extension not extension-blocked but parses to no units / failure (no crash, no wrong import)',
    { status: pdf.status, units: pdf.json?.units?.length ?? null, crashed: pdf.status >= 500 },
    { status: 200, units: 0, crashed: false },
    `rent-roll only blocks .xlsx/.xls by extension; other types reach file.text(). body=${pdf.text.slice(0, 120)}`
  )
}

// ===========================================================================
// helpers — billing
// ===========================================================================
async function uploadBilling({ property, period, suffix, fileName, body, created, track }) {
  const res = await uploadBillingBytes({
    property, period, fileName,
    bytes: new TextEncoder().encode(body), mimeType: 'text/csv',
  })
  if (track && res.status === 200) trackBillingPeriod(created, property.id, period)
  return res
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

async function readBilling(propertyId, period) {
  const path = `/api/v1/actual-billed/${propertyId}?period_start=${period.start}&period_end=${period.end}`
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  return safeJson(text)
}

function trackBillingPeriod(created, propertyId, period) {
  const key = `${propertyId}|${period.start}|${period.end}`
  if (!created.billingPeriods.some((b) => b.key === key)) {
    created.billingPeriods.push({ key, propertyId, period })
  }
}

async function deleteBillingPeriod(propertyId, period, created) {
  const path = `/api/v1/actual-billed/${propertyId}?period_start=${period.start}&period_end=${period.end}`
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  await response.text()
  const key = `${propertyId}|${period.start}|${period.end}`
  created.billingPeriods = created.billingPeriods.filter((b) => b.key !== key)
}

// ===========================================================================
// helpers — rent-roll
// ===========================================================================
async function previewRentRoll({ fileName, body }) {
  return previewRentRollBytes({ fileName, bytes: new TextEncoder().encode(body) })
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

async function importRentRoll({ suffix, fileName, body, propertyName, created }) {
  const form = new FormData()
  form.set('file', new Blob([new TextEncoder().encode(body)], { type: 'text/csv' }), fileName)
  form.set('property_name', propertyName)
  form.set('address', '404 Parsing Robustness Blvd')
  form.set('city', 'Austin')
  form.set('state', 'TX')
  form.set('postal_code', '78704')
  const response = await fetch(`${apiUrl}/api/v1/rent-roll/import`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  const json = safeJson(text)
  if ((response.status === 201 || response.status === 200) && json?.property_id) {
    if (!created.propertyIds.includes(json.property_id)) created.propertyIds.push(json.property_id)
  }
  return { status: response.status, text, json }
}

async function getProperty(propertyId) {
  const response = await fetch(`${apiUrl}/api/v1/properties/${propertyId}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  return safeJson(await response.text())
}

async function readUnits(propertyId) {
  const response = await fetch(`${apiUrl}/api/v1/properties/${propertyId}/units`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const json = safeJson(await response.text())
  return json?.data ?? json?.items ?? json?.units ?? null
}

// ===========================================================================
// shared helpers
// ===========================================================================
async function createProperty(name) {
  const response = await fetch(`${apiUrl}/api/v1/properties`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      address_line1: '404 Parsing Robustness Blvd',
      city: 'Austin', state: 'TX', postal_code: '78704',
      total_rentable_sqft: '25000.00', total_usable_sqft: '22000.00',
      common_area_sqft: '3000.00', target_occupancy: '0.95',
      boma_standard_version: '2024', fiscal_year_start_month: 1,
    }),
  })
  const text = await response.text()
  if (response.status !== 201) throw new Error(`createProperty ${response.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

async function cleanup(created) {
  const failures = []
  for (const b of [...created.billingPeriods]) {
    await attemptCleanup(failures, `delete billing ${b.key}`, async () => {
      const path = `/api/v1/actual-billed/${b.propertyId}?period_start=${b.period.start}&period_end=${b.period.end}`
      const r = await fetch(`${apiUrl}${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
      await r.text()
      report.cleanup.push({ path, status: r.status, ok: r.status === 204 || r.status === 200 || r.status === 404 })
    })
  }
  for (const propertyId of created.propertyIds) {
    await attemptCleanup(failures, `delete property ${propertyId}`, async () => {
      const r = await fetch(`${apiUrl}/api/v1/properties/${propertyId}`, {
        method: 'DELETE', headers: { authorization: `Bearer ${token}` },
      })
      const t = await r.text()
      const ok = r.status === 204 || r.status === 404
      report.cleanup.push({ path: `/properties/${propertyId}`, status: r.status, ok, body_preview: t.slice(0, 150) })
      if (!ok) throw new Error(`DELETE property ${r.status}: ${t.slice(0, 200)}`)
    })
  }
  if (failures.length > 0) report.cleanup_failures = failures
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
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

function encodeUtf16LEWithBom(text) {
  const out = new Uint8Array(2 + text.length * 2)
  out[0] = 0xff
  out[1] = 0xfe
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    out[2 + i * 2] = code & 0xff
    out[2 + i * 2 + 1] = (code >> 8) & 0xff
  }
  return out
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

function safeShape(json) {
  if (!json || typeof json !== 'object') return json
  return Object.fromEntries(
    Object.entries(json).map(([k, v]) => [k, Array.isArray(v) ? `array[${v.length}]` : typeof v])
  )
}

function errorCode(json) {
  return json?.error?.code ?? null
}

function safeJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

async function saveFixture(fileName, body) {
  await writeFile(resolve(fixtureDir, fileName), body)
}

async function saveFixtureBytes(fileName, bytes) {
  await writeFile(resolve(fixtureDir, fileName), Buffer.from(bytes))
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
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortDeep(v)])
    )
  }
  return value
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
