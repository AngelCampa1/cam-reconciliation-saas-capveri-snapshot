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
  'PROD_E2E_FIXTURE_SECRET',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`)
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const prodE2eFixtureSecret = env.PROD_E2E_FIXTURE_SECRET
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-admin-dispute-lifecycle-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy:
      'creates a marked synthetic admin-visible dispute fixture, exercises real admin status and comment routes, then deletes the dispute plus synthetic property, lease, statement, tenant link, tenant user, and user rows',
    propertyIds: [],
    leaseIds: [],
    statementIds: [],
    disputeIds: [],
    disputeAttachmentIds: [],
    disputeAttachmentStoragePaths: [],
    persistentIdsCreated: [],
    adminDisputeFixtureCleanupExpected: true,
  },
  auth: {},
  checks: [],
  cleanup: [],
}

let token
let fixture
let scenarioError

try {
  const session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }

  await runScenario()
} catch (error) {
  scenarioError = error
  report.fatal_error = errorMessage(error)
} finally {
  if (token && fixture?.dispute_id) {
    await cleanupFixture()
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

async function runScenario() {
  const created = await expectJson('/api/v1/disputes/e2e-fixture', {
    method: 'POST',
    status: 201,
    body: {
      run_id: runId,
      confirm: 'create-prod-e2e-admin-dispute',
    },
  })
  fixture = created
  report.generated.propertyId = created.property_id
  report.generated.propertyIds.push(created.property_id)
  report.generated.leaseId = created.lease_id
  report.generated.leaseIds.push(created.lease_id)
  report.generated.statementId = created.statement_id
  report.generated.statementIds.push(created.statement_id)
  report.generated.syntheticUserId = created.synthetic_user_id
  report.generated.tenantUserId = created.tenant_user_id
  report.generated.disputeId = created.dispute_id
  report.generated.disputeIds.push(created.dispute_id)
  report.generated.tenantEmail = created.tenant_email
  report.generated.persistentIdsCreated.push(
    created.property_id,
    created.lease_id,
    created.statement_id,
    created.synthetic_user_id,
    created.tenant_user_id,
    created.dispute_id
  )

  const description =
    `[PROD-TEST] Admin dispute lifecycle prod_e2e_run_id=${runId}. ` +
    'Synthetic admin-visible dispute for production cleanup verification.'
  check('synthetic admin dispute fixture is marked and linked', {
    property_id: isUuid(created.property_id),
    lease_id: isUuid(created.lease_id),
    statement_id: isUuid(created.statement_id),
    synthetic_user_id: isUuid(created.synthetic_user_id),
    tenant_user_id: isUuid(created.tenant_user_id),
    dispute_id: isUuid(created.dispute_id),
    description: created.description,
    tenant_email: created.tenant_email,
  }, {
    property_id: true,
    lease_id: true,
    statement_id: true,
    synthetic_user_id: true,
    tenant_user_id: true,
    dispute_id: true,
    description,
    tenant_email: `prodtest+admin-dispute-${runId.toLowerCase()}@capveri.com`,
  })

  const initialDetail = await expectJson(
    `/api/v1/disputes/${created.dispute_id}`,
    { status: 200 }
  )
  check('admin detail sees initial synthetic dispute', {
    id: initialDetail.id,
    statement_id: initialDetail.statement_id,
    status: initialDetail.status,
    description: initialDetail.description,
    comment_count: initialDetail.comments.length,
    initial_comment: initialDetail.comments[0]?.content,
  }, {
    id: created.dispute_id,
    statement_id: created.statement_id,
    status: 'open',
    description,
    comment_count: 1,
    initial_comment: description,
  })

  const underReview = await expectJson(
    `/api/v1/disputes/${created.dispute_id}/status`,
    {
      method: 'PUT',
      status: 200,
      body: { status: 'under_review' },
    }
  )
  check('admin status transition open to under_review persists', {
    id: underReview.id,
    status: underReview.status,
    resolution_summary: underReview.resolution_summary ?? null,
  }, {
    id: created.dispute_id,
    status: 'under_review',
    resolution_summary: null,
  })

  const internalComment = await expectJson(
    `/api/v1/disputes/${created.dispute_id}/comments`,
    {
      method: 'POST',
      status: 201,
      body: {
        content:
          'Synthetic internal admin note for production cleanup verification.',
        is_internal: true,
      },
    }
  )
  check('admin can add an internal dispute comment', {
    dispute_id: internalComment.dispute_id,
    is_internal: internalComment.is_internal,
    content: internalComment.content,
  }, {
    dispute_id: created.dispute_id,
    is_internal: true,
    content:
      'Synthetic internal admin note for production cleanup verification.',
  })

  const publicComment = await expectJson(
    `/api/v1/disputes/${created.dispute_id}/comments`,
    {
      method: 'POST',
      status: 201,
      body: {
        content:
          'Synthetic public admin response for production cleanup verification.',
        is_internal: false,
      },
    }
  )
  check('admin can add a public dispute comment', {
    dispute_id: publicComment.dispute_id,
    is_internal: publicComment.is_internal,
    content: publicComment.content,
  }, {
    dispute_id: created.dispute_id,
    is_internal: false,
    content:
      'Synthetic public admin response for production cleanup verification.',
  })

  const resolutionSummary =
    'Synthetic admin resolution summary for production cleanup verification.'
  const resolved = await expectJson(
    `/api/v1/disputes/${created.dispute_id}/status`,
    {
      method: 'PUT',
      status: 200,
      body: {
        status: 'resolved',
        resolution_summary: resolutionSummary,
      },
    }
  )
  check('admin status transition under_review to resolved persists', {
    id: resolved.id,
    status: resolved.status,
  }, {
    id: created.dispute_id,
    status: 'resolved',
  })

  const finalDetail = await expectJson(
    `/api/v1/disputes/${created.dispute_id}`,
    { status: 200 }
  )
  const comments = finalDetail.comments.map((comment) => ({
    content: comment.content,
    is_internal: comment.is_internal,
  }))
  check('admin detail sees all public and internal comments after mutation', {
    id: finalDetail.id,
    status: finalDetail.status,
    resolution_summary: finalDetail.resolution_summary,
    resolved_by: isUuid(finalDetail.resolved_by),
    resolved_at: isNonEmptyString(finalDetail.resolved_at),
    comments,
  }, {
    id: created.dispute_id,
    status: 'resolved',
    resolution_summary: resolutionSummary,
    resolved_by: true,
    resolved_at: true,
    comments: [
      { content: description, is_internal: false },
      {
        content:
          'Synthetic internal admin note for production cleanup verification.',
        is_internal: true,
      },
      {
        content:
          'Synthetic public admin response for production cleanup verification.',
        is_internal: false,
      },
    ],
  })
}

async function cleanupFixture() {
  const response = await request(
    `/api/v1/disputes/${fixture.dispute_id}/e2e-cleanup`,
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
    label: 'synthetic admin dispute fixture cleanup endpoint returned 200',
    ok: cleanupOk,
    status: response.status,
    body_preview: text.slice(0, 500),
  })
  if (!cleanupOk) return

  report.generated.disputeAttachmentStoragePaths =
    body.attachment_storage_paths ?? []
  report.generated.persistentIdsCreated = []
  report.cleanup.push({
    label: 'synthetic admin dispute fixture cleanup deleted all owned rows',
    ok:
      (body.deleted?.disputes === 0 || body.deleted?.disputes === 1) &&
      (body.deleted?.dispute_comments === 0 ||
        body.deleted?.dispute_comments === 3) &&
      body.deleted?.dispute_attachments === 0 &&
      body.deleted?.r2_objects === 0 &&
      (body.deleted?.auth_users === 0 || body.deleted?.auth_users === 1) &&
      (body.deleted?.tenant_lease_links === 0 ||
        body.deleted?.tenant_lease_links === 1) &&
      (body.deleted?.tenant_users === 0 || body.deleted?.tenant_users === 1) &&
      (body.deleted?.users === 0 || body.deleted?.users === 1) &&
      body.deleted?.reconciliation_snapshots === 1 &&
      body.deleted?.leases === 1 &&
      body.deleted?.properties === 1,
    actual: body.deleted,
    expected: {
      disputes: '0 or 1',
      dispute_comments: '0 or 3',
      dispute_attachments: 0,
      r2_objects: 0,
      auth_users: '0 or 1',
      tenant_lease_links: '0 or 1',
      tenant_users: '0 or 1',
      users: '0 or 1',
      reconciliation_snapshots: 1,
      leases: 1,
      properties: 1,
    },
  })

  await cleanupStatus(
    `/api/v1/disputes/${fixture.dispute_id}`,
    [404],
    'deleted admin fixture dispute detail returns 404'
  )
  await cleanupStatus(
    `/api/v1/properties/${fixture.property_id}`,
    [404],
    'deleted admin fixture property returns 404'
  )
  await cleanupStatus(
    `/api/v1/leases/${fixture.lease_id}`,
    [404],
    'deleted admin fixture lease returns 404'
  )
  await cleanupSyntheticTenantAuth()
}

async function cleanupSyntheticTenantAuth() {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        email: fixture.tenant_email,
        password: syntheticAdminDisputePassword(runId),
      }),
    }
  )
  await response.arrayBuffer().catch(() => new ArrayBuffer(0))
  report.cleanup.push({
    label: 'deleted synthetic tenant auth user cannot sign in',
    ok: response.status === 400 || response.status === 401,
    status: response.status,
    expected: [400, 401],
  })
}

async function cleanupStatus(path, expected, label) {
  const response = await request(path, {})
  await response.arrayBuffer().catch(() => new ArrayBuffer(0))
  report.cleanup.push({
    label,
    ok: expected.includes(response.status),
    status: response.status,
    expected,
  })
}

async function expectJson(path, options) {
  const response = await request(path, options)
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function request(path, options = {}) {
  return fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'x-capveri-e2e-secret': prodE2eFixtureSecret,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
}

function syntheticAdminDisputePassword(id) {
  return `ProdE2E-${id}-Aa1`
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
        email: env.E2E_PROD_EMAIL,
        password: env.E2E_PROD_PASSWORD,
      }),
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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
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
