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

if (!env.E2E_PROD_API_URL?.trim()) {
  throw new Error('Missing E2E_PROD_API_URL.')
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-public-acquisition-negative-${runId}`
)
await mkdir(outputDir, { recursive: true })

const suffix = runId.toLowerCase().replace(/[^a-z0-9-]/gu, '')
const botUrl = 'https://bot.example.test'
const probeEmails = {
  contentHoneypot: `prod-e2e-content-${suffix}@example.com`,
  calculatorHoneypot: `prod-e2e-calculator-${suffix}@example.com`,
  plgHoneypot: `prod-e2e-plg-${suffix}@example.com`,
  auditHoneypot: `prod-e2e-audit-honeypot-${suffix}@example.com`,
  contentInvalid: `prod-e2e-content-invalid-${suffix}@example.com`,
  calculatorInvalid: `prod-e2e-calculator-invalid-${suffix}@example.com`,
  plgInvalid: `prod-e2e-plg-invalid-${suffix}@example.com`,
  auditInvalid: `prod-e2e-audit-invalid-${suffix}@example.com`,
  unsubscribeInvalid: 'prod-e2e@example.com',
}

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy: 'negative/no-persistence public acquisition routes',
    negativeNoPersistentIdsExpected: true,
    persistentIdsCreated: [],
    probeEmails: Object.values(probeEmails),
  },
  cleanup: [
    {
      label: 'public acquisition negative cleanup',
      ok: true,
      body_preview:
        'No persistent IDs were created. The run used honeypot, invalid-token, invalid-Turnstile, and malformed JSON branches only.',
    },
  ],
  checks: [],
}

try {
  await runScenario()
  report.ok =
    report.generated.persistentIdsCreated.length === 0 &&
    report.checks.length > 0 &&
    report.checks.every((check) => check.ok)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario() {
  await expectJson({
    label: 'content download honeypot returns success without lead write',
    path: '/api/v1/leads/content-download',
    body: {
      first_name: 'Prod',
      email: probeEmails.contentHoneypot,
      company: 'Prod E2E Holdings',
      asset_slug: 'cam-reconciliation-checklist',
      source: 'prod-e2e-negative',
      company_website: botUrl,
    },
    expectedStatus: 200,
    expectedBody: {
      success: true,
      message: 'Check your email for the download link',
    },
  })

  await expectJson({
    label: 'calculator unlock honeypot returns unlocked without lead write',
    path: '/api/v1/leads/calculator-unlock',
    body: {
      first_name: 'Prod',
      email: probeEmails.calculatorHoneypot,
      slug: 'boma-2024-calculator',
      source: 'prod-e2e-negative',
      company_website: botUrl,
    },
    expectedStatus: 200,
    expectedBody: {
      unlocked: true,
      message: 'Results unlocked.',
    },
  })

  await expectJson({
    label: 'plg signup honeypot returns success without lead write',
    path: '/api/v1/leads/plg-signup',
    body: {
      first_name: 'Prod',
      email: probeEmails.plgHoneypot,
      organization_name: 'Prod E2E',
      leakage_amount: '12345.67',
      property_name: 'Prod E2E Tower',
      utm_source: 'prod-e2e',
      utm_campaign: 'negative',
      company_website: botUrl,
    },
    expectedStatus: 200,
    expectedBody: {
      success: true,
      message: 'Your reconciliation results are saved - check your email.',
    },
  })

  await expectJson({
    label: 'audit request honeypot returns synthetic pending row only',
    path: '/api/v1/audit-requests',
    body: auditRequestBody({
      email: probeEmails.auditHoneypot,
      company_website: botUrl,
    }),
    expectedStatus: 201,
    expectedBody: {
      email: probeEmails.auditHoneypot,
      status: 'pending',
      organization_id: null,
    },
    customAssert: (json) =>
      json !== null &&
      typeof json.id === 'string' &&
      json.id.length > 0 &&
      json.company === 'Prod E2E Holdings',
  })

  await expectJson({
    label: 'content download invalid Turnstile blocks before lead write',
    path: '/api/v1/leads/content-download',
    body: {
      first_name: 'Prod',
      email: probeEmails.contentInvalid,
      company: 'Prod E2E Holdings',
      asset_slug: 'cam-reconciliation-checklist',
      source: 'prod-e2e-negative',
      turnstile_token: 'invalid-prod-e2e-token',
    },
    expectedStatus: 403,
    expectedErrorCode: 'forbidden',
  })

  await expectJson({
    label: 'calculator unlock invalid Turnstile blocks before lead write',
    path: '/api/v1/leads/calculator-unlock',
    body: {
      first_name: 'Prod',
      email: probeEmails.calculatorInvalid,
      slug: 'boma-2024-calculator',
      source: 'prod-e2e-negative',
      turnstile_token: 'invalid-prod-e2e-token',
    },
    expectedStatus: 403,
    expectedErrorCode: 'forbidden',
  })

  await expectJson({
    label: 'plg signup invalid Turnstile blocks before lead write',
    path: '/api/v1/leads/plg-signup',
    body: {
      first_name: 'Prod',
      email: probeEmails.plgInvalid,
      organization_name: 'Prod E2E',
      leakage_amount: '12345.67',
      property_name: 'Prod E2E Tower',
      utm_source: 'prod-e2e',
      utm_campaign: 'negative',
      turnstile_token: 'invalid-prod-e2e-token',
    },
    expectedStatus: 403,
    expectedErrorCode: 'forbidden',
  })

  await expectJson({
    label: 'audit request invalid Turnstile blocks before insert',
    path: '/api/v1/audit-requests',
    body: auditRequestBody({
      email: probeEmails.auditInvalid,
      turnstile_token: 'invalid-prod-e2e-token',
    }),
    expectedStatus: 403,
    expectedErrorCode: 'verification_failed',
  })

  await expectJson({
    label: 'unsubscribe missing token rejects without suppression write',
    path: '/api/v1/leads/unsubscribe',
    expectedStatus: 422,
    expectedErrorCode: 'validation_error',
  })

  await expectJson({
    label: 'unsubscribe invalid token rejects without suppression write',
    path: '/api/v1/leads/unsubscribe?e=cHJvZC1lMmVAZXhhbXBsZS5jb20&t=bad-token',
    expectedStatus: 400,
    expectedErrorCode: 'invalid_unsubscribe_token',
  })

  await expectJson({
    label: 'download invalid token rejects without R2 access',
    method: 'GET',
    path: '/api/v1/leads/download/invalidtoken.badsig',
    expectedStatus: 400,
    expectedErrorCode: 'invalid_download_token',
  })

  await expectMalformedJson({
    label: 'content download malformed JSON rejects before validation',
    path: '/api/v1/leads/content-download',
  })

  await expectMalformedJson({
    label: 'audit request malformed JSON rejects before validation',
    path: '/api/v1/audit-requests',
  })
}

function auditRequestBody(overrides = {}) {
  return {
    name: 'Prod E2E',
    email: `prod-e2e-audit-${suffix}@example.com`,
    company: 'Prod E2E Holdings',
    building_count: 7,
    phone: null,
    portfolio_sqft: 250000,
    current_system: 'Spreadsheet',
    message: 'Prod E2E negative route validation.',
    source: 'prod-e2e-negative',
    ...overrides,
  }
}

async function expectMalformedJson({ label, path }) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"email":',
  })
  await recordJsonCheck({
    label,
    path,
    response,
    expectedStatus: 400,
    expectedErrorCode: 'invalid_json',
  })
}

async function expectJson({
  label,
  method = 'POST',
  path,
  body = undefined,
  expectedStatus,
  expectedBody = undefined,
  expectedErrorCode = undefined,
  customAssert = undefined,
}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers:
      body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  await recordJsonCheck({
    label,
    path,
    response,
    expectedStatus,
    expectedBody,
    expectedErrorCode,
    customAssert,
  })
}

async function recordJsonCheck({
  label,
  path,
  response,
  expectedStatus,
  expectedBody = undefined,
  expectedErrorCode = undefined,
  customAssert = undefined,
}) {
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  const bodyOk =
    expectedBody === undefined ||
    Object.entries(expectedBody).every(([key, value]) => json?.[key] === value)
  const errorOk =
    expectedErrorCode === undefined || json?.error?.code === expectedErrorCode
  const customOk = customAssert === undefined || customAssert(json)
  const ok = response.status === expectedStatus && bodyOk && errorOk && customOk

  report.checks.push({
    label,
    path,
    status: response.status,
    ok,
    expected_status: expectedStatus,
    expected_body: expectedBody ?? null,
    expected_error_code: expectedErrorCode ?? null,
    body_preview: text.slice(0, 400),
  })
}

async function readEnv(path) {
  try {
    const contents = await readFile(path, 'utf8')
    return Object.fromEntries(
      contents
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const index = line.indexOf('=')
          if (index === -1) return [line, '']
          const key = line.slice(0, index).trim()
          const value = line
            .slice(index + 1)
            .trim()
            .replace(/^["']|["']$/gu, '')
          return [key, value]
        })
    )
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

function trimSlash(value) {
  return value.trim().replace(/\/+$/u, '')
}
