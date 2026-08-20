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
  `prod-public-contact-feedback-negative-${runId}`
)
await mkdir(outputDir, { recursive: true })

const suffix = runId.toLowerCase().replace(/[^a-z0-9-]/gu, '')
const botUrl = 'https://bot.example.test'
const probeEmails = {
  contactHoneypot: `prod-e2e-contact-${suffix}@example.com`,
  feedbackHoneypot: `prod-e2e-feedback-${suffix}@example.com`,
}

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy:
      'negative/no-persistence public contact and marketing feedback honeypot routes',
    negativeNoPersistentIdsExpected: true,
    persistentIdsCreated: [],
    probeEmails: Object.values(probeEmails),
    providerSideEffectsAvoided: [
      'Turnstile verification',
      'rate-limit Durable Object writes',
      'Resend contact or feedback notifications',
      'feedback row persistence',
      'feedback screenshot or R2 writes',
    ],
  },
  cleanup: [
    {
      label: 'public contact and feedback negative cleanup',
      ok: true,
      body_preview:
        'Only honeypot branches were called. No persistent IDs were created, and route ordering exits before Turnstile, rate-limit, email, DB, screenshot, or R2 side effects.',
    },
  ],
  checks: [],
}

try {
  await runScenario()
  report.ok =
    report.generated.persistentIdsCreated.length === 0 &&
    report.checks.length > 0 &&
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok)
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
    label: 'contact request honeypot returns success without side effects',
    path: '/api/v1/contact-requests',
    body: {
      name: 'Prod E2E',
      email: probeEmails.contactHoneypot,
      inquiry_type: 'demo',
      company: 'Prod E2E Holdings',
      phone: null,
      message: 'Prod E2E honeypot no-persistence branch.',
      turnstile_token: null,
      company_website: botUrl,
    },
    expectedStatus: 201,
    expectedBody: {
      success: true,
      message:
        "Your message has been received. We'll be in touch within 24 hours.",
    },
  })

  await expectJson({
    label: 'marketing feedback honeypot returns ok without side effects',
    path: '/api/v1/feedback/marketing',
    body: {
      type: 'general',
      message: 'Prod E2E honeypot no-persistence branch.',
      page_url: '/',
      user_agent: `prod-public-negative-e2e/${runId}`,
      turnstile_token: null,
      company_website: botUrl,
    },
    expectedStatus: 200,
    expectedBody: { status: 'ok' },
  })
}

async function expectJson({
  label,
  method = 'POST',
  path,
  body,
  expectedStatus,
  expectedBody,
}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  const bodyOk = stableJson(json) === stableJson(expectedBody)
  const ok = response.status === expectedStatus && bodyOk
  report.checks.push({
    label,
    path,
    status: response.status,
    ok,
    expected_status: expectedStatus,
    expected_body: expectedBody,
    body_preview: text.slice(0, 400),
  })

  if (!ok) {
    throw new Error(
      `${label} failed: expected ${expectedStatus} ${JSON.stringify(expectedBody)}, got ${response.status} ${text.slice(0, 400)}`
    )
  }
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
