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
  `prod-tenant-dispute-lifecycle-${runId}`
)
await mkdir(outputDir, { recursive: true })

const attachmentBytes = new TextEncoder().encode(
  `%PDF-1.4\n% CapVeri prod tenant dispute lifecycle ${runId}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`
)

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy:
      'creates one marked synthetic tenant dispute, one tenant comment, one attachment, verifies tenant download and landlord cross-org isolation, then deletes the synthetic dispute and R2 object',
    disputeIds: [],
    disputeAttachmentIds: [],
    disputeAttachmentStoragePaths: [],
    tenantDisputeCleanupExpected: true,
    persistentIdsCreated: [],
  },
  auth: {},
  checks: [],
  cleanup: [],
}

let adminToken
let tenantToken
let disputeId
let attachmentId
let scenarioError

try {
  const [adminSession, tenantSession] = await Promise.all([
    signInWithPassword(env.E2E_PROD_EMAIL, env.E2E_PROD_PASSWORD),
    signInWithPassword(
      env.E2E_PROD_TENANT_EMAIL,
      env.E2E_PROD_TENANT_PASSWORD
    ),
  ])
  adminToken = adminSession.access_token
  tenantToken = tenantSession.access_token
  report.auth = {
    admin_user_id: adminSession.user?.id ?? null,
    admin_email: adminSession.user?.email ?? env.E2E_PROD_EMAIL,
    tenant_user_id: tenantSession.user?.id ?? null,
    tenant_email: tenantSession.user?.email ?? env.E2E_PROD_TENANT_EMAIL,
  }

  const dashboard = await expectJson(tenantToken, '/api/v1/tenant/dashboard', {
    status: 200,
  })
  check(
    'tenant dashboard has a statement for dispute creation',
    { statement_count: dashboard.statements?.length ?? 0 },
    { statement_count: (dashboard.statements?.length ?? 0) > 0 ? 1 : 0 }
  )
  const statement = [...dashboard.statements].sort((a, b) =>
    a.id.localeCompare(b.id)
  )[0]
  report.generated.statementId = statement.id

  const description =
    `[PROD-TEST] Tenant dispute lifecycle prod_e2e_run_id=${runId}. ` +
    'Synthetic dispute for production cleanup verification.'
  const created = await expectJson(tenantToken, '/api/v1/tenant/disputes', {
    method: 'POST',
    status: 201,
    body: {
      statement_id: statement.id,
      category: 'calculation_error',
      description,
    },
  })
  disputeId = created.id
  report.generated.disputeId = disputeId
  report.generated.disputeIds.push(disputeId)
  report.generated.persistentIdsCreated.push(disputeId)
  check('tenant dispute create response is marked synthetic', {
    id: isUuid(created.id),
    statement_id: created.statement_id,
    category: created.category,
    status: created.status,
    description: created.description,
  }, {
    id: true,
    statement_id: statement.id,
    category: 'calculation_error',
    status: 'open',
    description,
  })

  const tenantDetail = await expectJson(
    tenantToken,
    `/api/v1/tenant/disputes/${disputeId}`,
    { status: 200 }
  )
  check('tenant detail includes initial public comment', {
    id: tenantDetail.id,
    comments: tenantDetail.comments.length,
    initial_comment: tenantDetail.comments[0]?.content,
  }, {
    id: disputeId,
    comments: 1,
    initial_comment: description,
  })

  const tenantComment = await expectJson(
    tenantToken,
    `/api/v1/tenant/disputes/${disputeId}/comments`,
    {
      method: 'POST',
      status: 201,
      body: {
        content:
          'Synthetic tenant follow-up comment for production cleanup verification.',
      },
    }
  )
  report.generated.tenantCommentId = tenantComment.id
  check('tenant comment is public', {
    dispute_id: tenantComment.dispute_id,
    is_internal: tenantComment.is_internal,
  }, {
    dispute_id: disputeId,
    is_internal: false,
  })

  const form = new FormData()
  form.append(
    'file',
    new Blob([attachmentBytes], { type: 'application/pdf' }),
    `prod-tenant-dispute-${runId}.pdf`
  )
  const attachment = await expectJson(
    tenantToken,
    `/api/v1/tenant/disputes/${disputeId}/attachments`,
    {
      method: 'POST',
      status: 201,
      body: form,
    }
  )
  attachmentId = attachment.id
  report.generated.disputeAttachmentId = attachmentId
  report.generated.disputeAttachmentIds.push(attachmentId)
  check('tenant attachment upload returns download route', {
    id: isUuid(attachment.id),
    content_type: attachment.content_type,
    file_size_bytes: attachment.file_size_bytes,
    file_url: attachment.file_url,
  }, {
    id: true,
    content_type: 'application/pdf',
    file_size_bytes: attachmentBytes.byteLength,
    file_url: `/api/v1/tenant/disputes/${disputeId}/attachments/${attachmentId}`,
  })

  await expectAttachmentBytes(
    tenantToken,
    `/api/v1/tenant/disputes/${disputeId}/attachments/${attachmentId}`,
    'tenant attachment download matches uploaded bytes'
  )

  const adminBoundary = await expectStatus(
    adminToken,
    `/api/v1/disputes/${disputeId}`,
    { expected: [404] }
  )
  check(
    'landlord fixture cannot access tenant fixture dispute across org boundary',
    adminBoundary.status,
    404
  )
} catch (error) {
  scenarioError = error
  report.fatal_error = errorMessage(error)
} finally {
  if (tenantToken && disputeId) {
    await cleanupDispute()
  }

  report.ok =
    !scenarioError &&
    report.checks.length > 0 &&
    report.checks.every((check) => check.ok) &&
    report.cleanup.length > 0 &&
    report.cleanup.every((item) => item.ok) &&
    report.generated.persistentIdsCreated.length === 0

  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1
if (scenarioError) throw scenarioError

async function cleanupDispute() {
  const response = await request(
    tenantToken,
    `/api/v1/tenant/disputes/${disputeId}/e2e-cleanup`,
    {
      method: 'DELETE',
      body: {
        run_id: runId,
        confirm: 'delete-prod-e2e-dispute',
      },
    }
  )
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  const cleanupOk = response.status === 200
  report.cleanup.push({
    label: 'synthetic dispute cleanup endpoint returned 200',
    ok: cleanupOk,
    status: response.status,
    body_preview: text.slice(0, 500),
  })
  if (!cleanupOk) return

  report.generated.disputeAttachmentStoragePaths =
    body.attachment_storage_paths ?? []
  report.generated.persistentIdsCreated =
    report.generated.persistentIdsCreated.filter((id) => id !== disputeId)
  report.cleanup.push({
    label: 'synthetic dispute cleanup deleted rows and R2 object',
    ok:
      body.deleted?.disputes === 1 &&
      body.deleted?.dispute_attachments === 1 &&
      body.deleted?.r2_objects === 1,
    actual: body.deleted,
    expected: {
      disputes: 1,
      dispute_attachments: 1,
      r2_objects: 1,
    },
  })

  await cleanupStatus(
    tenantToken,
    `/api/v1/tenant/disputes/${disputeId}`,
    [404],
    'deleted dispute tenant detail returns 404'
  )
  if (attachmentId) {
    await cleanupStatus(
      tenantToken,
      `/api/v1/tenant/disputes/${disputeId}/attachments/${attachmentId}`,
      [404],
      'deleted dispute attachment tenant download returns 404'
    )
  }
}

async function cleanupStatus(token, path, expected, label) {
  const response = await request(token, path, {})
  await response.arrayBuffer().catch(() => new ArrayBuffer(0))
  report.cleanup.push({
    label,
    ok: expected.includes(response.status),
    status: response.status,
    expected,
  })
}

async function expectAttachmentBytes(token, path, label) {
  const response = await request(token, path, {})
  const bytes = new Uint8Array(await response.arrayBuffer())
  check(
    label,
    {
      status: response.status,
      content_type: response.headers.get('content-type'),
      bytes_hex: Buffer.from(bytes).toString('hex'),
    },
    {
      status: 200,
      content_type: 'application/pdf',
      bytes_hex: Buffer.from(attachmentBytes).toString('hex'),
    }
  )
}

async function expectJson(token, path, options) {
  const response = await request(token, path, options)
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function expectStatus(token, path, options = {}) {
  const response = await request(token, path, options)
  const text = await response.text()
  if (!options.expected.includes(response.status)) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.expected.join(' or ')}: ${text.slice(0, 500)}`
    )
  }
  return { status: response.status, text }
}

async function request(token, path, options = {}) {
  const isFormData = options.body instanceof FormData
  return fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(!isFormData && options.body
        ? { 'content-type': 'application/json' }
        : {}),
    },
    body: isFormData
      ? options.body
      : options.body
        ? JSON.stringify(options.body)
        : undefined,
  })
}

async function signInWithPassword(email, password) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ email, password }),
    }
  )
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  }
  return json
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

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    throw new Error(
      `${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`
    )
  }
}

function stableJson(value) {
  return JSON.stringify(sortJson(value))
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortJson(entry)])
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
