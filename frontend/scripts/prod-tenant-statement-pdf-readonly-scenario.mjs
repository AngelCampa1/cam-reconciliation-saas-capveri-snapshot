import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')

const env = {
  ...(await readEnv(resolve(repoRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.production.local'))),
  ...process.env,
}

const required = [
  'E2E_PROD_TENANT_EMAIL',
  'E2E_PROD_TENANT_PASSWORD',
  'E2E_PROD_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`)
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-tenant-statement-pdf-readonly-${runId}`
)
await mkdir(outputDir, { recursive: true })

const randomStatementId = crypto.randomUUID()

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    readOnlyNoPersistentWrites: true,
    persistentIdsCreated: [],
    randomStatementId,
    write_policy:
      'tenant statement PDF read-only route only; no dispute creation, status mutation, uploads, or storage writes',
  },
  auth: {},
  checks: [],
  cleanup: [],
  guarded_endpoint_requests: [],
  mutating_requests: [],
  failed_responses: [],
  browser_errors: [],
}

let token

try {
  const session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_TENANT_EMAIL,
  }

  await runScenario()
  report.ok =
    report.checks.length > 0 &&
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok) &&
    report.generated.persistentIdsCreated.length === 0 &&
    report.guarded_endpoint_requests.length === 0 &&
    report.mutating_requests.length === 0 &&
    report.failed_responses.length === 0 &&
    report.browser_errors.length === 0
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario() {
  const initialDashboard = await expectJson('/api/v1/tenant/dashboard', {
    status: 200,
  })
  const initialPreferences = pickPreferences(await getPreferences())
  report.generated.initialDashboardSummary =
    summarizeDashboard(initialDashboard)
  report.generated.initialPreferences = initialPreferences

  check(
    'tenant statement PDF scenario has at least one statement',
    initialDashboard.statements.length > 0,
    true
  )

  const statement = initialDashboard.statements.find(
    (candidate) => typeof candidate?.pdf_url === 'string'
  )
  if (!statement) {
    throw new Error('Tenant dashboard did not expose any statement pdf_url')
  }

  check(
    'tenant statement pdf_url is the scoped tenant statement route',
    pdfUrlShape(statement.pdf_url, statement.id),
    true
  )

  report.generated.statement = {
    id: statement.id,
    property_name: statement.property_name,
    period_start: statement.period_start,
    period_end: statement.period_end,
    status: statement.status,
    pdf_url: statement.pdf_url,
  }

  const pdf = await expectPdf(statement.pdf_url)
  report.generated.pdfSummary = pdf.summary
  const statementLease = initialDashboard.leases.find(
    (lease) => lease?.property?.name === statement.property_name
  )
  const pdfText = await extractPdfText(pdf.bytes)
  const pdfTextCoverage = tenantStatementPdfTextCoverage(pdfText, {
    statement,
    lease: statementLease,
  })
  report.generated.pdfTextCoverage = pdfTextCoverage
  check(
    'tenant statement PDF response has stable download headers and bytes',
    pdf.summary,
    {
      status: 200,
      content_type_pdf: true,
      content_disposition_shape: true,
      content_length_matches: true,
      starts_with_pdf_magic: true,
      byte_length_gt_1000: true,
    }
  )
  check(
    'tenant statement PDF body contains tenant-facing statement facts',
    pdfTextCoverage,
    {
      has_title: true,
      has_property_name: true,
      has_property_address: true,
      has_period: true,
      has_expense_summary: true,
      has_total_amount_due_label: true,
      has_tenant_share_after_cap_row_amount: true,
      has_total_amount_due_money: true,
      has_no_malformed_null_trace: true,
      has_generated_footer: true,
    }
  )

  await expectError({
    label: 'tenant statement PDF rejects unknown statement read-only',
    path: `/api/v1/tenant/statements/${randomStatementId}/pdf`,
    method: 'GET',
    status: 404,
    code: 'not_found',
  })

  const finalDashboard = await expectJson('/api/v1/tenant/dashboard', {
    status: 200,
  })
  const finalPreferences = pickPreferences(await getPreferences())
  report.generated.finalDashboardSummary = summarizeDashboard(finalDashboard)
  report.generated.finalPreferences = finalPreferences

  check(
    'tenant statement PDF read-only probes leave dashboard summary unchanged',
    report.generated.finalDashboardSummary,
    report.generated.initialDashboardSummary
  )
  check(
    'tenant statement PDF read-only probes leave preferences unchanged',
    finalPreferences,
    initialPreferences
  )

  report.cleanup.push({
    label: 'tenant statement PDF read-only scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
    body_preview:
      'Only tenant dashboard, preferences, statement PDF, and unknown-statement PDF GET routes were called.',
  })
}

async function expectPdf(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/pdf',
    },
  })
  const bytes = new Uint8Array(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') ?? ''
  const contentDisposition = response.headers.get('content-disposition') ?? ''
  const contentLength = response.headers.get('content-length')
  if (response.status !== 200) {
    throw new Error(
      `GET ${path} returned ${response.status}, expected 200: ${new TextDecoder().decode(bytes.slice(0, 500))}`
    )
  }
  const parsedLength = contentLength ? Number(contentLength) : null
  return {
    bytes,
    summary: {
      status: response.status,
      content_type_pdf: contentType.startsWith('application/pdf'),
      content_disposition_shape:
        contentDisposition.startsWith(
          'attachment; filename="Reconciliation_'
        ) && contentDisposition.endsWith('.pdf"'),
      content_length_matches:
        parsedLength === null ? false : parsedLength === bytes.byteLength,
      starts_with_pdf_magic:
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46,
      byte_length_gt_1000: bytes.byteLength > 1000,
    },
  }
}

async function extractPdfText(bytes) {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const pageTexts = []
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pageTexts.push(content.items.map((item) => item.str ?? '').join(' '))
    }
  } finally {
    await pdf.destroy()
  }
  return pageTexts.join('\n')
}

function tenantStatementPdfTextCoverage(text, { statement, lease }) {
  const normalized = normalizeReportText(text)
  const propertyAddress = lease?.property?.address?.trim() ?? ''
  const tenantShareAmount = formatExactMoneyToken(statement.tenant_share)
  return {
    has_title: normalized.includes('tenant reconciliation statement'),
    has_property_name: normalized.includes(
      normalizeReportText(statement.property_name)
    ),
    has_property_address:
      propertyAddress.length > 0 &&
      normalized.includes(normalizeReportText(propertyAddress)),
    has_period: normalized.includes(
      normalizeReportText(
        `Period: ${formatStatementDate(statement.period_start)} - ${formatStatementDate(statement.period_end)}`
      )
    ),
    has_expense_summary: normalized.includes('expense summary'),
    has_total_amount_due_label: normalized.includes('total amount due'),
    has_tenant_share_after_cap_row_amount: hasLabelAmountToken(
      normalized,
      'tenant share (after cap)',
      tenantShareAmount
    ),
    has_total_amount_due_money: hasLabelMoneyToken(
      normalized,
      'total amount due'
    ),
    has_no_malformed_null_trace: !normalized.includes(': null'),
    has_generated_footer: normalized.includes('generated:'),
  }
}

function normalizeReportText(value) {
  return String(value).toLowerCase().replace(/\s+/gu, ' ').trim()
}

function hasLabelAmountToken(text, label, amountToken) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const escapedAmount = amountToken.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(
    `${escapedLabel}.{0,80}(?<![\\d,.])\\$?${escapedAmount}(?![\\d,.])`,
    'u'
  ).test(text)
}

function hasLabelMoneyToken(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(
    `${escapedLabel}.{0,120}(?<![\\d,.])\\$[0-9][0-9,]*\\.\\d{2}(?![\\d,.])`,
    'u'
  ).test(text)
}

function formatExactMoneyToken(amount) {
  const match = String(amount).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/u)
  if (!match) {
    throw new Error(`Unexpected money string from tenant statement: ${amount}`)
  }
  const [, sign, intPart, centsPart = ''] = match
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  return `${sign ?? ''}${withCommas}.${centsPart.padEnd(2, '0')}`
}

function formatStatementDate(iso) {
  const [year, month, day] = iso.slice(0, 10).split('-')
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

async function expectError({ label, path, method, status, code }) {
  const json = await expectJson(path, { method, status })
  check(label, { error_code: json?.error?.code }, { error_code: code })
}

async function expectJson(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function getPreferences() {
  return expectJson('/api/v1/tenant/notifications/preferences', {
    status: 200,
  })
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
        email: env.E2E_PROD_TENANT_EMAIL,
        password: env.E2E_PROD_TENANT_PASSWORD,
      }),
    }
  )
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(
      `Supabase tenant password auth failed: ${JSON.stringify(json)}`
    )
  }
  return json
}

function summarizeDashboard(dashboard) {
  return {
    lease_count: dashboard.leases.length,
    statement_count: dashboard.statements.length,
    unread_notifications: dashboard.unread_notifications,
    statement_ids: dashboard.statements
      .map((statement) => statement.id)
      .sort((a, b) => a.localeCompare(b)),
    statement_statuses: dashboard.statements.reduce((counts, statement) => {
      counts[statement.status] = (counts[statement.status] ?? 0) + 1
      return counts
    }, {}),
  }
}

function pickPreferences(prefs) {
  return Object.fromEntries(
    [
      'new_statement_emails',
      'dispute_update_emails',
      'reminder_emails',
      'marketing_emails',
    ].map((key) => [key, Boolean(prefs?.[key])])
  )
}

function pdfUrlShape(pdfUrl, statementId) {
  return (
    typeof pdfUrl === 'string' &&
    pdfUrl === `/api/v1/tenant/statements/${statementId}/pdf` &&
    isUuid(statementId)
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

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  )
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
