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
  `prod-tenant-disputes-negative-${runId}`
)
await mkdir(outputDir, { recursive: true })

const randomStatementId = crypto.randomUUID()
const randomDisputeId = crypto.randomUUID()
const randomAttachmentId = crypto.randomUUID()

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy:
      'tenant dispute negative/no-persistence branches only; valid dispute creation and valid attachment upload are intentionally avoided',
    negativeNoPersistentIdsExpected: true,
    persistentIdsCreated: [],
    randomStatementId,
    randomDisputeId,
    randomAttachmentId,
    unsafeProdProbesAvoided: [
      'POST /api/v1/tenant/disputes with a statement_id linked to the tenant',
      'POST /api/v1/tenant/disputes/:id/attachments with a non-empty allowed pdf/image against a random dispute id',
    ],
  },
  auth: {},
  checks: [],
  cleanup: [],
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
  const initialDisputes = await expectJson('/api/v1/tenant/disputes', {
    status: 200,
  })
  assertDisputeList('initial tenant disputes list is an array', initialDisputes)
  report.generated.initialDisputeSummary = summarizeDisputes(initialDisputes)

  await expectError({
    label:
      'tenant dispute creation rejects invalid category before repository write',
    path: '/api/v1/tenant/disputes',
    method: 'POST',
    status: 422,
    code: 'validation_error',
    body: {
      statement_id: randomStatementId,
      category: 'invalid_category',
      description:
        'This valid-length body should fail on category schema validation.',
    },
  })

  await expectError({
    label: 'tenant dispute creation rejects unknown statement before insert',
    path: '/api/v1/tenant/disputes',
    method: 'POST',
    status: 404,
    code: 'not_found',
    body: {
      statement_id: randomStatementId,
      category: 'billing_question',
      description:
        'This charge needs review, but the random statement id should not exist.',
    },
  })

  await expectError({
    label:
      'tenant dispute detail rejects unknown dispute with read-only lookup',
    path: `/api/v1/tenant/disputes/${randomDisputeId}`,
    method: 'GET',
    status: 404,
    code: 'not_found',
  })

  await expectError({
    label: 'tenant dispute comment rejects unknown dispute before insert',
    path: `/api/v1/tenant/disputes/${randomDisputeId}/comments`,
    method: 'POST',
    status: 404,
    code: 'not_found',
    body: {
      content: 'This comment should not persist for an unknown dispute.',
    },
  })

  await expectError({
    label:
      'tenant dispute attachment rejects missing file before storage write',
    path: `/api/v1/tenant/disputes/${randomDisputeId}/attachments`,
    method: 'POST',
    status: 400,
    code: 'bad_request',
    formData: new FormData(),
  })

  const emptyFileForm = new FormData()
  emptyFileForm.append(
    'file',
    new File([], `empty-${runId}.pdf`, { type: 'application/pdf' })
  )
  await expectError({
    label: 'tenant dispute attachment rejects empty file before storage write',
    path: `/api/v1/tenant/disputes/${randomDisputeId}/attachments`,
    method: 'POST',
    status: 400,
    code: 'bad_request',
    formData: emptyFileForm,
  })

  const invalidTypeForm = new FormData()
  invalidTypeForm.append(
    'file',
    new File(['no upload'], `payload-${runId}.txt`, { type: 'text/plain' })
  )
  await expectError({
    label:
      'tenant dispute attachment rejects invalid content type before storage write',
    path: `/api/v1/tenant/disputes/${randomDisputeId}/attachments`,
    method: 'POST',
    status: 400,
    code: 'invalid_content_type',
    formData: invalidTypeForm,
  })

  await expectError({
    label:
      'tenant dispute attachment download rejects unknown metadata read-only',
    path: `/api/v1/tenant/disputes/${randomDisputeId}/attachments/${randomAttachmentId}`,
    method: 'GET',
    status: 404,
    code: 'not_found',
  })

  const finalDisputes = await expectJson('/api/v1/tenant/disputes', {
    status: 200,
  })
  assertDisputeList('final tenant disputes list is an array', finalDisputes)
  report.generated.finalDisputeSummary = summarizeDisputes(finalDisputes)
  check(
    'tenant dispute negative probes leave dispute list unchanged',
    finalDisputes,
    initialDisputes
  )

  report.cleanup.push({
    label: 'tenant dispute negative scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
    body_preview:
      'Only validation, unknown-record, missing-file, empty-file, and invalid-content-type branches were called; valid dispute and valid attachment upload paths were avoided.',
  })
}

async function expectError({
  label,
  path,
  method,
  status,
  code,
  body,
  formData,
}) {
  const json = await expectJson(path, { method, status, body, formData })
  check(
    label,
    {
      error_code: json?.error?.code,
    },
    {
      error_code: code,
    }
  )
}

async function expectJson(path, options) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
  }
  let body
  if (options.formData) {
    body = options.formData
  } else if (options.body) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
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

function assertDisputeList(label, disputes) {
  check(label, Array.isArray(disputes), true)
  for (const dispute of disputes) {
    check(
      `tenant dispute row shape ${dispute?.id ?? 'unknown'}`,
      {
        id: isUuid(dispute?.id),
        statement_id: isUuid(dispute?.statement_id),
        category: isNonEmptyString(dispute?.category),
        status: isNonEmptyString(dispute?.status),
        created_at: isNonEmptyString(dispute?.created_at),
      },
      {
        id: true,
        statement_id: true,
        category: true,
        status: true,
        created_at: true,
      }
    )
  }
}

function summarizeDisputes(disputes) {
  return {
    count: disputes.length,
    ids: disputes.map((dispute) => dispute.id).sort(),
    statuses: disputes.reduce((counts, dispute) => {
      counts[dispute.status] = (counts[dispute.status] ?? 0) + 1
      return counts
    }, {}),
  }
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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
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
