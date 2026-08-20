// Prod E2E stress scenario: GL ingestion with adversarial CSV formats.
// Verifies parse-exactness (penny-exact vs known fixture totals) and
// fail-safe rejection of malformed input on the LIVE prod API.
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
  `prod-stress-gl-adversarial-formats-${runId}`
)
const fixtureDir = resolve(outputDir, 'fixtures')
await mkdir(fixtureDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  cleanup: [],
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
  const created = { propertyIds: [], batchIds: [] }
  report.generated = {
    suffix,
    propertyIds: created.propertyIds,
    batchIds: created.batchIds,
  }

  try {
    const propertyA = await createProperty(
      `[PROD-TEST] GL Adversarial Formats A ${suffix}`
    )
    created.propertyIds.push(propertyA.id)
    const propertyB = await createProperty(
      `[PROD-TEST] GL Adversarial Dates B ${suffix}`
    )
    created.propertyIds.push(propertyB.id)

    // ---------------- F1: amount format zoo (yardi) ----------------
    const f1Csv = [
      'Account,Account Description,Date,Amount,Vendor,Description',
      '6100,Janitorial,06/01/2026,"1,234.56",CleanCo,thousands separator',
      '6101,Security,06/02/2026,(500.00),SecureCo,parentheses negative',
      '6102,Utilities,06/03/2026,$2000.10,PowerCo,leading dollar',
      '6103,Repairs,06/04/2026,750.25-,FixIt,trailing minus',
      '6104,Landscaping,06/05/2026,300 CR,GreenCo,CR suffix',
      '6105,Elevator,06/06/2026,125 DR,LiftCo,DR suffix',
      '6106,Insurance,06/07/2026,"$-1,234.56",InsCo,symbol then minus',
    ].join('\n')
    const f1 = await uploadFixture({
      label: 'F1 amount formats',
      propertyId: propertyA.id,
      fileName: `gl-f1-amount-formats-${suffix}.csv`,
      body: f1Csv,
      sourceOverride: 'yardi',
      created,
    })
    check(
      'F1 upload response: 7 rows, 0 errors',
      pickUpload(f1),
      { source_system: 'yardi', row_count: 7, error_count: 0, warnings: [] }
    )
    await verifyBatchEntries('F1', f1.batch_id, {
      status: 'completed',
      rowCount: 7,
      errorCount: 0,
      totalCents: 123456 - 50000 + 200010 - 75025 - 30000 + 12500 - 123456,
      entries: [
        e('6100', '2026-06-01', '1234.56'),
        e('6101', '2026-06-02', '-500.00'),
        e('6102', '2026-06-03', '2000.10'),
        e('6103', '2026-06-04', '-750.25'),
        e('6104', '2026-06-05', '-300.00'),
        e('6105', '2026-06-06', '125.00'),
        e('6106', '2026-06-07', '-1234.56'),
      ],
    })

    // ------- F2: BOM + CRLF + quoted commas/quotes/newline (yardi) -------
    const f2Csv =
      '﻿' +
      [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6201,Cleaning,01/10/2026,100.00,CleanCo,"Contract, monthly"',
        '6202,Repairs,02/10/2026,200.50,FixIt,"He said ""ok"", done"',
        '6203,Security,03/10/2026,(50.25),SecureCo,"line1\nline2"',
      ].join('\r\n')
    const f2 = await uploadFixture({
      label: 'F2 BOM/CRLF/quoting',
      propertyId: propertyA.id,
      fileName: `gl-f2-bom-crlf-quotes-${suffix}.csv`,
      body: f2Csv,
      sourceOverride: 'yardi',
      created,
    })
    check(
      'F2 upload response: 3 rows, 0 errors',
      pickUpload(f2),
      { source_system: 'yardi', row_count: 3, error_count: 0, warnings: [] }
    )
    await verifyBatchEntries('F2', f2.batch_id, {
      status: 'completed',
      rowCount: 3,
      errorCount: 0,
      totalCents: 10000 + 20050 - 5025,
      entries: [
        e('6201', '2026-01-10', '100.00', {
          description: 'Contract, monthly',
        }),
        e('6202', '2026-02-10', '200.50', {
          description: 'He said "ok", done',
        }),
        e('6203', '2026-03-10', '-50.25', { description: 'line1\nline2' }),
      ],
    })

    // ---------------- F3: sub-cent amounts (yardi) ----------------
    // Deployed parser rounds to 2dp with ROUND_HALF_UP (csv-parser.ts
    // cleanCurrency toFixed(2, Decimal.ROUND_HALF_UP)).
    const f3Csv = [
      'Account,Account Description,Date,Amount',
      '6301,SubCentUp,04/01/2026,10.005',
      '6302,SubCentDown,04/02/2026,10.004',
      '6303,SubCentUp2,04/03/2026,10.015',
    ].join('\n')
    const f3 = await uploadFixture({
      label: 'F3 sub-cent rounding',
      propertyId: propertyA.id,
      fileName: `gl-f3-subcent-${suffix}.csv`,
      body: f3Csv,
      sourceOverride: 'yardi',
      created,
    })
    check(
      'F3 upload response: 3 rows, 0 errors',
      pickUpload(f3),
      { source_system: 'yardi', row_count: 3, error_count: 0, warnings: [] }
    )
    await verifyBatchEntries('F3', f3.batch_id, {
      status: 'completed',
      rowCount: 3,
      errorCount: 0,
      totalCents: 1001 + 1000 + 1002,
      entries: [
        e('6301', '2026-04-01', '10.01'),
        e('6302', '2026-04-02', '10.00'),
        e('6303', '2026-04-03', '10.02'),
      ],
    })

    // ---------------- F4: duplicate rows preserved (yardi) ----------------
    const f4Csv = [
      'Account,Account Description,Date,Amount',
      '6400,Janitorial,01/15/2026,250.00',
      '6400,Janitorial,01/15/2026,250.00',
      '6400,Janitorial,01/15/2026,250.00',
      '6401,Security,01/16/2026,100.00',
    ].join('\n')
    const f4 = await uploadFixture({
      label: 'F4 duplicate rows',
      propertyId: propertyA.id,
      fileName: `gl-f4-duplicate-rows-${suffix}.csv`,
      body: f4Csv,
      sourceOverride: 'yardi',
      created,
    })
    check(
      'F4 upload response: 4 rows (identical rows preserved), 0 errors',
      pickUpload(f4),
      { source_system: 'yardi', row_count: 4, error_count: 0, warnings: [] }
    )
    await verifyBatchEntries('F4', f4.batch_id, {
      status: 'completed',
      rowCount: 4,
      errorCount: 0,
      totalCents: 25000 * 3 + 10000,
      entries: [
        e('6400', '2026-01-15', '250.00'),
        e('6400', '2026-01-15', '250.00'),
        e('6400', '2026-01-15', '250.00'),
        e('6401', '2026-01-16', '100.00'),
      ],
    })

    // ---------------- F5: zero and large boundary amounts ----------------
    const f5Csv = [
      'Account,Account Description,Date,Amount',
      '6500,ZeroLine,05/01/2026,0.00',
      '6501,HugeLine,05/02/2026,"99,999,999.99"',
    ].join('\n')
    const f5 = await uploadFixture({
      label: 'F5 boundary amounts',
      propertyId: propertyA.id,
      fileName: `gl-f5-boundary-${suffix}.csv`,
      body: f5Csv,
      sourceOverride: 'yardi',
      created,
    })
    check(
      'F5 upload response: 2 rows, 0 errors',
      pickUpload(f5),
      { source_system: 'yardi', row_count: 2, error_count: 0, warnings: [] }
    )
    await verifyBatchEntries('F5', f5.batch_id, {
      status: 'completed',
      rowCount: 2,
      errorCount: 0,
      totalCents: 0 + 9999999999,
      entries: [
        // Zero amount: serializePreviewEntry emits debit=null AND credit=null.
        e('6500', '2026-05-01', '0.00'),
        e('6501', '2026-05-02', '99999999.99'),
      ],
    })

    // ---------------- F7: MRI debit/credit netting ----------------
    const f7Csv = [
      'Account,Description,Date,Debit,Credit',
      '7100,NormalDebit,06/01/2026,500.00,',
      '7101,ZeroDebitRealCredit,06/02/2026,0.00,500.00',
      '7102,PreSignedCredit,06/03/2026,,(250.00)',
      '7103,NettedRow,06/04/2026,"1,000.00",250.00',
    ].join('\n')
    const f7 = await uploadFixture({
      label: 'F7 MRI debit/credit netting',
      propertyId: propertyA.id,
      fileName: `gl-f7-mri-debit-credit-${suffix}.csv`,
      body: f7Csv,
      sourceOverride: 'mri',
      created,
    })
    check(
      'F7 upload response: 4 rows, 0 errors',
      pickUpload(f7),
      { source_system: 'mri', row_count: 4, error_count: 0, warnings: [] }
    )
    // Bare "Description" column with no "Account Description" is promoted to
    // account_description by the deployed parser (csv-parser.ts mapRecord).
    await verifyBatchEntries('F7', f7.batch_id, {
      status: 'completed',
      rowCount: 4,
      errorCount: 0,
      totalCents: 50000 - 50000 + 25000 + 75000,
      entries: [
        e('7100', '2026-06-01', '500.00', {
          account_description: 'NormalDebit',
        }),
        e('7101', '2026-06-02', '-500.00', {
          account_description: 'ZeroDebitRealCredit',
        }),
        e('7102', '2026-06-03', '250.00', {
          account_description: 'PreSignedCredit',
        }),
        e('7103', '2026-06-04', '750.00', {
          account_description: 'NettedRow',
        }),
      ],
    })

    // -------- F6: date format variants + invalid dates (property B) --------
    const f6Csv = [
      'Account,Account Description,Date,Amount',
      '6100,MdyFull,01/15/2026,10.00',
      '6110,IsoDate,2026-04-20,20.00',
      '6120,TwoDigitYear,1/5/26,30.00',
      '6130,DayFirst,13/02/2026,40.00',
      '6140,MonthYear,03/2026,50.00',
      '6150,AncientYear,1899-05-01,60.00',
      '6160,ImpossibleDay,02/30/2026,70.00',
    ].join('\n')
    const f6 = await uploadFixture({
      label: 'F6 date variants',
      propertyId: propertyB.id,
      fileName: `gl-f6-date-variants-${suffix}.csv`,
      body: f6Csv,
      sourceOverride: 'yardi',
      created,
    })
    check(
      'F6 upload response: 5 valid rows, 2 excluded invalid-date rows',
      pickUpload(f6),
      {
        source_system: 'yardi',
        row_count: 5,
        error_count: 2,
        warnings: ['Excluded 2 rows with missing required data'],
      }
    )
    await verifyBatchEntries('F6', f6.batch_id, {
      status: 'completed',
      rowCount: 5,
      errorCount: 2,
      totalCents: 1000 + 2000 + 3000 + 4000 + 5000,
      entries: [
        e('6100', '2026-01-15', '10.00'),
        e('6110', '2026-04-20', '20.00'),
        e('6120', '2026-01-05', '30.00'),
        e('6130', '2026-02-13', '40.00'),
        e('6140', '2026-03-01', '50.00'),
      ],
    })
    const dateRange = await expectJson(
      `/api/v1/ingestion/gl-date-range/${propertyB.id}`,
      { status: 200 }
    )
    check('F6 gl date range spans only valid parsed dates', dateRange, {
      min_date: '2026-01-05',
      max_date: '2026-04-20',
      year: 2026,
    })

    // ---------------- Malformed / fail-safe fixtures ----------------

    // M1: empty file -> 400 empty_file
    const m1 = await uploadRaw({
      propertyId: propertyA.id,
      fileName: `gl-m1-empty-${suffix}.csv`,
      body: '',
      sourceOverride: 'yardi',
    })
    check(
      'M1 empty file rejected with 400 empty_file',
      { status: m1.status, code: errorCode(m1.json) },
      { status: 400, code: 'empty_file' }
    )
    await saveFixture(`gl-m1-empty-${suffix}.csv`, '')

    // M2: header-only file -> 422 no_valid_gl_entries
    const m2Body = 'Account,Account Description,Date,Amount\n'
    const m2 = await uploadRaw({
      propertyId: propertyA.id,
      fileName: `gl-m2-header-only-${suffix}.csv`,
      body: m2Body,
      sourceOverride: 'yardi',
    })
    check(
      'M2 header-only file rejected with 422 no_valid_gl_entries',
      { status: m2.status, code: errorCode(m2.json) },
      { status: 422, code: 'no_valid_gl_entries' }
    )
    await saveFixture(`gl-m2-header-only-${suffix}.csv`, m2Body)

    // M3: every row has a non-numeric amount -> 422 no_valid_gl_entries
    const m3Body = [
      'Account,Account Description,Date,Amount',
      '6100,BadAmount,01/15/2026,not-a-number',
      '6101,BadAmount2,01/16/2026,12.34.56',
      '6102,BadAmount3,01/17/2026,1e3',
    ].join('\n')
    const m3 = await uploadRaw({
      propertyId: propertyA.id,
      fileName: `gl-m3-non-numeric-${suffix}.csv`,
      body: m3Body,
      sourceOverride: 'yardi',
    })
    check(
      'M3 all-rows-invalid file rejected with 422 no_valid_gl_entries',
      { status: m3.status, code: errorCode(m3.json) },
      { status: 422, code: 'no_valid_gl_entries' }
    )
    await saveFixture(`gl-m3-non-numeric-${suffix}.csv`, m3Body)

    // M4: wrong column counts + truncation mid-row. Valid rows ingest,
    // broken rows are excluded and REPORTED via error_count + warning
    // (documented parser behavior, not silent partial ingestion).
    const m4Csv = [
      'Account,Account Description,Date,Amount,Vendor,Description',
      '6100,Janitorial,01/15/2026,100.00,V,ok row',
      '6110,ExtraCols,01/16/2026,50.00,V,memo,SPURIOUS,MORE',
      '6120,Short',
      '6130,TruncatedMidRow,01/1',
    ].join('\n')
    const m4 = await uploadFixture({
      label: 'M4 ragged/truncated rows',
      propertyId: propertyA.id,
      fileName: `gl-m4-ragged-truncated-${suffix}.csv`,
      body: m4Csv,
      sourceOverride: 'yardi',
      created,
    })
    check(
      'M4 ragged/truncated rows: valid rows kept, broken rows counted as errors',
      pickUpload(m4),
      {
        source_system: 'yardi',
        row_count: 2,
        error_count: 2,
        warnings: ['Excluded 2 rows with missing required data'],
      }
    )
    await verifyBatchEntries('M4', m4.batch_id, {
      status: 'completed',
      rowCount: 2,
      errorCount: 2,
      totalCents: 10000 + 5000,
      entries: [
        e('6100', '2026-01-15', '100.00', { description: 'ok row' }),
        e('6110', '2026-01-16', '50.00', { description: 'memo' }),
      ],
    })

    // M5: wrong file type -> 415 unsupported_file_type
    const m5 = await uploadRaw({
      propertyId: propertyA.id,
      fileName: `gl-m5-notes-${suffix}.txt`,
      body: 'Account,Account Description,Date,Amount\n6100,X,01/15/2026,10.00',
      sourceOverride: 'yardi',
      mimeType: 'text/plain',
    })
    check(
      'M5 non-CSV file rejected with 415 unsupported_file_type',
      { status: m5.status, code: errorCode(m5.json) },
      { status: 415, code: 'unsupported_file_type' }
    )

    // M6a: exact same file re-uploaded to the SAME property -> 409 duplicate
    const m6a = await uploadRaw({
      propertyId: propertyA.id,
      fileName: `gl-f1-amount-formats-${suffix}.csv`,
      body: f1Csv,
      sourceOverride: 'yardi',
    })
    check(
      'M6a same-file re-upload to same property rejected 409 with original batch id',
      {
        status: m6a.status,
        code: errorCode(m6a.json),
        existing_batch_id: m6a.json?.detail?.existing_batch_id ?? null,
      },
      {
        status: 409,
        code: 'duplicate_import',
        existing_batch_id: f1.batch_id,
      }
    )

    // M6b: same file bytes to a DIFFERENT property -> allowed (hash is
    // scoped per (org, property, hash)).
    const m6b = await uploadRaw({
      propertyId: propertyB.id,
      fileName: `gl-f1-amount-formats-${suffix}.csv`,
      body: f1Csv,
      sourceOverride: 'yardi',
    })
    if (m6b.json?.batch_id) created.batchIds.push(m6b.json.batch_id)
    check(
      'M6b same file bytes on a different property is a fresh import',
      {
        status: m6b.status,
        row_count: m6b.json?.row_count ?? null,
        error_count: m6b.json?.error_count ?? null,
        new_batch: Boolean(
          m6b.json?.batch_id && m6b.json.batch_id !== f1.batch_id
        ),
      },
      { status: 200, row_count: 7, error_count: 0, new_batch: true }
    )

    // M7: oversize multipart body (> 51MiB) -> 413 file_too_large.
    // Built as a raw multipart buffer so Content-Length is deterministic.
    const m7 = await uploadOversize({
      propertyId: propertyA.id,
      fileName: `gl-m7-oversize-${suffix}.csv`,
    })
    check(
      'M7 oversize upload (>51MiB body) rejected with 413 file_too_large',
      m7,
      { status: 413, code: 'file_too_large' }
    )
  } finally {
    await cleanup(created)
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function e(accountCode, date, balance, extra = {}) {
  const cents = toCents(balance)
  return {
    account_code: accountCode,
    transaction_date: date,
    debit: cents > 0 ? canonicalMoney(balance) : null,
    credit: cents < 0 ? canonicalMoney(balance).slice(1) : null,
    balance: canonicalMoney(balance),
    ...extra,
  }
}

async function createProperty(name) {
  return expectJson('/api/v1/properties', {
    method: 'POST',
    status: 201,
    body: {
      name,
      address_line1: '404 Adversarial Format Blvd',
      city: 'Austin',
      state: 'TX',
      postal_code: '78704',
      total_rentable_sqft: '25000.00',
      total_usable_sqft: '22000.00',
      common_area_sqft: '3000.00',
      target_occupancy: '0.95',
      boma_standard_version: '2024',
      fiscal_year_start_month: 1,
    },
  })
}

async function uploadFixture({
  label,
  propertyId,
  fileName,
  body,
  sourceOverride,
  created,
}) {
  await saveFixture(fileName, body)
  const result = await uploadRaw({ propertyId, fileName, body, sourceOverride })
  if (result.status !== 200) {
    throw new Error(
      `${label}: POST /api/v1/ingestion/upload returned ${result.status}, expected 200: ${result.text.slice(0, 500)}`
    )
  }
  if (result.json?.batch_id) created.batchIds.push(result.json.batch_id)
  return result.json
}

async function uploadRaw({
  propertyId,
  fileName,
  body,
  sourceOverride,
  mimeType = 'text/csv',
}) {
  const form = new FormData()
  form.set('property_id', propertyId)
  if (sourceOverride) form.set('source_override', sourceOverride)
  form.set('file', new Blob([body], { type: mimeType }), fileName)

  const response = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
    body: form,
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: response.status, text, json }
}

async function uploadOversize({ propertyId, fileName }) {
  const boundary = `----capveri-e2e-${randomUUID()}`
  const header = 'Account,Account Description,Date,Amount\n'
  const line = '6100,Oversize Filler Expense Row,01/15/2026,1.00\n'
  const targetBytes = 55 * 1024 * 1024 // 55MiB > 51MiB multipart cap
  const repeats = Math.ceil((targetBytes - header.length) / line.length)
  const csv = header + line.repeat(repeats)

  const pre =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="property_id"\r\n\r\n` +
    `${propertyId}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="source_override"\r\n\r\n` +
    `yardi\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: text/csv\r\n\r\n`
  const post = `\r\n--${boundary}--\r\n`
  const buffer = Buffer.concat([
    Buffer.from(pre, 'utf8'),
    Buffer.from(csv, 'utf8'),
    Buffer.from(post, 'utf8'),
  ])

  try {
    const response = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: buffer,
      signal: AbortSignal.timeout(180_000),
    })
    const text = await response.text()
    let code = null
    try {
      code = errorCode(JSON.parse(text))
    } catch {
      code = null
    }
    return { status: response.status, code }
  } catch (error) {
    return { status: 'fetch_error', code: errorMessage(error).slice(0, 200) }
  }
}

async function verifyBatchEntries(
  label,
  batchId,
  { status, rowCount, errorCount, totalCents, entries }
) {
  const detail = await expectJson(`/api/v1/ingestion/batches/${batchId}`, {
    status: 200,
  })
  const actualEntries = detail.preview_entries.map((entry) => ({
    account_code: entry.account_code,
    transaction_date: dateOnly(entry.transaction_date),
    debit: entry.debit === null ? null : canonicalMoney(entry.debit),
    credit: entry.credit === null ? null : canonicalMoney(entry.credit),
    balance: canonicalMoney(entry.balance),
  }))
  const actualExtras = detail.preview_entries.map((entry) => ({
    account_code: entry.account_code,
    account_description: entry.account_description,
    description: entry.description,
  }))
  const actualTotalCents = detail.preview_entries.reduce(
    (sum, entry) => sum + toCents(entry.balance),
    0
  )

  const expectedEntries = entries.map((entry) => ({
    account_code: entry.account_code,
    transaction_date: entry.transaction_date,
    debit: entry.debit,
    credit: entry.credit,
    balance: entry.balance,
  }))

  check(
    `${label} batch detail: status/counts and penny-exact stored entries`,
    {
      status: detail.status,
      row_count: detail.row_count,
      error_count: detail.error_count,
      total_cents: actualTotalCents,
      entries: sortRows(actualEntries),
    },
    {
      status,
      row_count: rowCount,
      error_count: errorCount,
      total_cents: totalCents,
      entries: sortRows(expectedEntries),
    }
  )

  const expectedExtras = entries
    .filter(
      (entry) =>
        entry.description !== undefined ||
        entry.account_description !== undefined
    )
    .map((entry) => ({
      account_code: entry.account_code,
      ...(entry.account_description !== undefined
        ? { account_description: entry.account_description }
        : {}),
      ...(entry.description !== undefined
        ? { description: entry.description }
        : {}),
    }))
  if (expectedExtras.length > 0) {
    const actualByAccount = new Map(
      actualExtras.map((entry) => [entry.account_code, entry])
    )
    check(
      `${label} batch detail: description fields round-trip exactly`,
      expectedExtras.map((expected) => {
        const actual = actualByAccount.get(expected.account_code) ?? {}
        return {
          account_code: expected.account_code,
          ...(expected.account_description !== undefined
            ? { account_description: actual.account_description }
            : {}),
          ...(expected.description !== undefined
            ? { description: actual.description }
            : {}),
        }
      }),
      expectedExtras
    )
  }
}

async function cleanup(created) {
  const failures = []
  for (const batchId of created.batchIds) {
    await attemptCleanup(failures, `delete ingestion batch ${batchId}`, () =>
      deleteEmpty(`/api/v1/ingestion/batches/${batchId}`)
    )
    await attemptCleanup(failures, `verify batch ${batchId} deleted`, () =>
      expectStatus(`/api/v1/ingestion/batches/${batchId}`, 404)
    )
  }
  for (const propertyId of created.propertyIds) {
    await attemptCleanup(failures, `verify gl entries gone ${propertyId}`, () =>
      expectStatus(`/api/v1/ingestion/gl-date-range/${propertyId}`, 404)
    )
    await attemptCleanup(failures, `delete property ${propertyId}`, () =>
      deleteEmpty(`/api/v1/properties/${propertyId}`)
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
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

async function expectStatus(path, status) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  const ok = response.status === status
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `GET ${path} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`
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

function pickUpload(upload) {
  return {
    source_system: upload.source_system,
    row_count: upload.row_count,
    error_count: upload.error_count,
    warnings: upload.warnings,
  }
}

function errorCode(json) {
  return json?.error?.code ?? null
}

async function saveFixture(fileName, body) {
  await writeFile(resolve(fixtureDir, fileName), body)
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

function sortRows(rows) {
  return [...rows].sort((left, right) =>
    stableJson(left).localeCompare(stableJson(right))
  )
}

function canonicalMoney(value) {
  const text = String(value).trim()
  const sign = text.startsWith('-') ? '-' : ''
  const unsigned = sign ? text.slice(1) : text
  const [wholeRaw, centsRaw = ''] = unsigned.split('.')
  const whole = wholeRaw.replace(/^0+(?=\d)/u, '') || '0'
  const cents = `${centsRaw}00`.slice(0, 2)
  const canonical = `${sign}${whole}.${cents}`
  return canonical === '-0.00' ? '0.00' : canonical
}

function toCents(value) {
  const canonical = canonicalMoney(value)
  const negative = canonical.startsWith('-')
  const [whole, cents] = (negative ? canonical.slice(1) : canonical).split('.')
  const magnitude = Number(whole) * 100 + Number(cents)
  return negative ? -magnitude : magnitude
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

function dateOnly(value) {
  return String(value).slice(0, 10)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
