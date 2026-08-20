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
const fixtureRunIds = {
  tenantA: `${runId}-tenant-a`,
  tenantB: `${runId}-tenant-b`,
}
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-tenant-attachment-rollback-boundary-${runId}`
)
await mkdir(outputDir, { recursive: true })

const attemptedFilename = `prod-tenant-attachment-rollback-${runId}.pdf`
const attemptedAttachmentBytes = new TextEncoder().encode(
  `%PDF-1.4\n% CapVeri prod wrong tenant attachment rollback ${runId}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`
)

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy:
      'creates two marked synthetic same-org tenant fixtures, attempts a wrong-tenant attachment upload against Tenant B as Tenant A, proves the route rejects before attachment metadata is recorded, then deletes both fixture sets',
    rollback_scope:
      'The fixed route verifies dispute ownership before generating a storage key or writing to R2. This scenario verifies the production denial response and both tenant/admin attachment metadata absence.',
    attemptedFilename,
    fixtureRunIds,
    propertyIds: [],
    leaseIds: [],
    statementIds: [],
    syntheticUserIds: [],
    tenantUserIds: [],
    tenantEmails: [],
    adminDisputeFixtureAuthUsers: [],
    disputeIds: [],
    disputeAttachmentStoragePaths: [],
    persistentIdsCreated: [],
    adminDisputeFixtureCleanupExpected: true,
  },
  auth: {},
  checks: [],
  cleanup: [],
}

let adminToken
const fixtures = {}
const tenantTokens = {}
let scenarioError

try {
  const adminSession = await signInWithPassword(
    env.E2E_PROD_EMAIL,
    env.E2E_PROD_PASSWORD
  )
  adminToken = adminSession.access_token
  report.auth.admin_user_id = adminSession.user?.id ?? null
  report.auth.admin_email = adminSession.user?.email ?? env.E2E_PROD_EMAIL

  fixtures.tenantA = await createFixture('tenantA')
  fixtures.tenantB = await createFixture('tenantB')
  assertExactlyTwoUniqueFixtures()

  tenantTokens.tenantA = (
    await signInWithPassword(
      fixtures.tenantA.tenant_email,
      syntheticAdminDisputePassword(fixtureRunIds.tenantA)
    )
  ).access_token
  tenantTokens.tenantB = (
    await signInWithPassword(
      fixtures.tenantB.tenant_email,
      syntheticAdminDisputePassword(fixtureRunIds.tenantB)
    )
  ).access_token

  report.auth.tenant_a_email = fixtures.tenantA.tenant_email
  report.auth.tenant_b_email = fixtures.tenantB.tenant_email

  await assertOwnTenantAccess('tenantA', fixtures.tenantA)
  await assertOwnTenantAccess('tenantB', fixtures.tenantB)
  await assertNoTenantBAttachments('before wrong-tenant upload')
  await assertTenantAAttachmentUploadRejectsBeforeStorage()
  await assertNoTenantBAttachments('after wrong-tenant upload')
} catch (error) {
  scenarioError = error
  report.fatal_error = errorMessage(error)
} finally {
  if (adminToken) {
    await attemptCleanup('tenantB fixture cleanup', () =>
      cleanupFixture('tenantB')
    )
    await attemptCleanup('tenantA fixture cleanup', () =>
      cleanupFixture('tenantA')
    )
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

async function createFixture(key) {
  const fixtureRunId = fixtureRunIds[key]
  const created = await expectJson(adminToken, '/api/v1/disputes/e2e-fixture', {
    method: 'POST',
    status: 201,
    fixtureSecret: true,
    body: {
      run_id: fixtureRunId,
      confirm: 'create-prod-e2e-admin-dispute',
    },
  })
  const description =
    `[PROD-TEST] Admin dispute lifecycle prod_e2e_run_id=${fixtureRunId}. ` +
    'Synthetic admin-visible dispute for production cleanup verification.'
  check(
    `${key} synthetic fixture is marked and linked`,
    {
      property_id: isUuid(created.property_id),
      lease_id: isUuid(created.lease_id),
      statement_id: isUuid(created.statement_id),
      synthetic_user_id: isUuid(created.synthetic_user_id),
      tenant_user_id: isUuid(created.tenant_user_id),
      dispute_id: isUuid(created.dispute_id),
      tenant_email: created.tenant_email,
      description: created.description,
    },
    {
      property_id: true,
      lease_id: true,
      statement_id: true,
      synthetic_user_id: true,
      tenant_user_id: true,
      dispute_id: true,
      tenant_email: `prodtest+admin-dispute-${fixtureRunId.toLowerCase()}@capveri.com`,
      description,
    }
  )

  report.generated.propertyIds.push(created.property_id)
  report.generated.leaseIds.push(created.lease_id)
  report.generated.statementIds.push(created.statement_id)
  report.generated.syntheticUserIds.push(created.synthetic_user_id)
  report.generated.tenantUserIds.push(created.tenant_user_id)
  report.generated.tenantEmails.push(created.tenant_email)
  report.generated.adminDisputeFixtureAuthUsers.push({
    key,
    run_id: fixtureRunId,
    email: created.tenant_email,
    synthetic_user_id: created.synthetic_user_id,
    tenant_user_id: created.tenant_user_id,
  })
  report.generated.disputeIds.push(created.dispute_id)
  report.generated.persistentIdsCreated.push(
    created.property_id,
    created.lease_id,
    created.statement_id,
    created.synthetic_user_id,
    created.tenant_user_id,
    created.dispute_id
  )
  return { ...created, fixtureRunId }
}

function assertExactlyTwoUniqueFixtures() {
  check(
    'attachment boundary harness created exactly two unique fixture tenants',
    {
      propertyIds: uniqueCount(report.generated.propertyIds),
      leaseIds: uniqueCount(report.generated.leaseIds),
      statementIds: uniqueCount(report.generated.statementIds),
      syntheticUserIds: uniqueCount(report.generated.syntheticUserIds),
      tenantUserIds: uniqueCount(report.generated.tenantUserIds),
      tenantEmails: uniqueCount(report.generated.tenantEmails),
      disputeIds: uniqueCount(report.generated.disputeIds),
      fixtureAuthUsers: report.generated.adminDisputeFixtureAuthUsers.length,
    },
    {
      propertyIds: 2,
      leaseIds: 2,
      statementIds: 2,
      syntheticUserIds: 2,
      tenantUserIds: 2,
      tenantEmails: 2,
      disputeIds: 2,
      fixtureAuthUsers: 2,
    }
  )
}

async function assertOwnTenantAccess(key, fixture) {
  const token = tenantTokens[key]
  const pdf = await request(
    token,
    `/api/v1/tenant/statements/${fixture.statement_id}/pdf`
  )
  await pdf.arrayBuffer()
  check(
    `${key} can download own statement pdf`,
    {
      status: pdf.status,
      content_type: pdf.headers.get('content-type'),
    },
    {
      status: 200,
      content_type: 'application/pdf',
    }
  )

  const detail = await expectJson(
    token,
    `/api/v1/tenant/disputes/${fixture.dispute_id}`,
    { status: 200 }
  )
  check(
    `${key} can read own dispute detail`,
    {
      id: detail.id,
      statement_id: detail.statement_id,
      tenant_comment_count: detail.comments.length,
    },
    {
      id: fixture.dispute_id,
      statement_id: fixture.statement_id,
      tenant_comment_count: 1,
    }
  )
}

async function assertNoTenantBAttachments(labelPrefix) {
  const tenantDetail = await expectJson(
    tenantTokens.tenantB,
    `/api/v1/tenant/disputes/${fixtures.tenantB.dispute_id}`,
    { status: 200 }
  )
  const adminDetail = await expectJson(
    adminToken,
    `/api/v1/disputes/${fixtures.tenantB.dispute_id}`,
    { status: 200, fixtureSecret: true }
  )
  check(
    `${labelPrefix}: tenant b dispute has no attachment metadata`,
    {
      tenant_attachment_count: tenantDetail.attachments.length,
      admin_attachment_count: adminDetail.attachments.length,
    },
    {
      tenant_attachment_count: 0,
      admin_attachment_count: 0,
    }
  )
}

async function assertTenantAAttachmentUploadRejectsBeforeStorage() {
  const form = new FormData()
  form.append(
    'file',
    new Blob([attemptedAttachmentBytes], { type: 'application/pdf' }),
    attemptedFilename
  )
  const response = await request(
    tenantTokens.tenantA,
    `/api/v1/tenant/disputes/${fixtures.tenantB.dispute_id}/attachments`,
    {
      method: 'POST',
      body: form,
    }
  )
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  check(
    'wrong-tenant attachment upload rejects before recording metadata',
    {
      status: response.status,
      error_code: body?.error?.code ?? null,
      message: body?.error?.message ?? body?.detail ?? null,
    },
    {
      status: 404,
      error_code: 'not_found',
      message: 'Dispute not found',
    }
  )
}

async function cleanupFixture(key) {
  const fixture = fixtures[key]
  if (!fixture?.dispute_id) return

  const response = await request(
    adminToken,
    `/api/v1/disputes/${fixture.dispute_id}/e2e-cleanup`,
    {
      method: 'DELETE',
      fixtureSecret: true,
      body: {
        run_id: fixture.fixtureRunId,
        confirm: 'delete-prod-e2e-dispute',
      },
    }
  )
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  const cleanupOk = response.status === 200
  report.cleanup.push({
    label: `${key} synthetic fixture cleanup endpoint returned 200`,
    ok: cleanupOk,
    status: response.status,
    body_preview: text.slice(0, 500),
  })
  if (!cleanupOk) return

  const storagePaths = body.attachment_storage_paths ?? []
  report.generated.disputeAttachmentStoragePaths.push(...storagePaths)
  report.generated.persistentIdsCreated =
    report.generated.persistentIdsCreated.filter(
      (id) =>
        ![
          fixture.property_id,
          fixture.lease_id,
          fixture.statement_id,
          fixture.synthetic_user_id,
          fixture.tenant_user_id,
          fixture.dispute_id,
        ].includes(id)
    )

  report.cleanup.push({
    label: `${key} synthetic fixture cleanup deleted owned rows`,
    ok:
      (body.deleted?.disputes === 0 || body.deleted?.disputes === 1) &&
      (body.deleted?.dispute_comments === 0 ||
        body.deleted?.dispute_comments === 1) &&
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
      dispute_comments: '0 or 1',
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
    `${key} deleted fixture dispute admin detail returns 404`
  )
  await cleanupStatus(
    `/api/v1/properties/${fixture.property_id}`,
    [404],
    `${key} deleted fixture property returns 404`
  )
  await cleanupStatus(
    `/api/v1/leases/${fixture.lease_id}`,
    [404],
    `${key} deleted fixture lease returns 404`
  )
  await cleanupSyntheticTenantAuth(key, fixture)
}

async function cleanupSyntheticTenantAuth(key, fixture) {
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
        password: syntheticAdminDisputePassword(fixture.fixtureRunId),
      }),
    }
  )
  await response.arrayBuffer().catch(() => new ArrayBuffer(0))
  report.cleanup.push({
    label: `${key} deleted synthetic tenant auth user cannot sign in`,
    ok: response.status === 400 || response.status === 401,
    status: response.status,
    expected: [400, 401],
  })
}

async function cleanupStatus(path, expected, label) {
  const response = await request(adminToken, path, { fixtureSecret: true })
  await response.arrayBuffer().catch(() => new ArrayBuffer(0))
  report.cleanup.push({
    label,
    ok: expected.includes(response.status),
    status: response.status,
    expected,
  })
}

async function attemptCleanup(label, operation) {
  try {
    await operation()
  } catch (error) {
    report.cleanup.push({
      label,
      ok: false,
      error: errorMessage(error),
    })
  }
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

async function request(token, path, options = {}) {
  const isFormData = options.body instanceof FormData
  return fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.fixtureSecret
        ? { 'x-capveri-e2e-secret': prodE2eFixtureSecret }
        : {}),
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

function syntheticAdminDisputePassword(id) {
  return `ProdE2E-${id}-Aa1`
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

function uniqueCount(values) {
  return new Set(values).size
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
