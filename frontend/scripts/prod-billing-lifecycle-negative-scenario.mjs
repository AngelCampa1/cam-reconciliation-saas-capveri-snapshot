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
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-billing-lifecycle-negative-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy:
      'negative/no-persistence billing lifecycle routes; no valid Stripe checkout or portal calls',
    negativeNoPersistentIdsExpected: true,
    persistentIdsCreated: [],
    stripeCallsAvoided: [
      'POST /api/v1/billing/checkout with valid offer selection',
      'GET /api/v1/billing/checkout/success with session_id',
      'POST /api/v1/billing/portal with return_url',
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
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
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
  const initial = await snapshotBillingState()
  report.generated.initialBillingSnapshot = summarizeSnapshot(initial)

  await expectError({
    label: 'checkout rejects mutually exclusive offers before persistence',
    path: '/api/v1/billing/checkout',
    method: 'POST',
    status: 400,
    code: 'mutually_exclusive_offer',
    detail:
      'Choose either a limited offer code or winback offer token, not both',
    body: {
      plan_id: 'reconcile',
      billing_period: 'annual',
      unit_count: initial.plan_selection.unit_count,
      building_count: initial.plan_selection.building_count,
      success_url: 'https://app.capveri.com/settings/billing/success',
      cancel_url: 'https://app.capveri.com/settings/billing',
      offer_token: `prod-e2e-${runId}`,
      launch_offer_code: '80OFF',
    },
  })

  await expectError({
    label: 'checkout success requires session id before Stripe lookup',
    path: '/api/v1/billing/checkout/success',
    method: 'GET',
    status: 422,
    code: 'validation_error',
    detail: 'session_id: Required',
  })

  await expectError({
    label: 'billing portal requires return_url before customer lookup',
    path: '/api/v1/billing/portal',
    method: 'POST',
    status: 422,
    code: 'validation_error',
    detail: 'return_url: Required',
  })

  await expectError({
    label: 'subscription upgrade route is disabled before plan mutation',
    path: '/api/v1/billing/subscription/upgrade',
    method: 'POST',
    status: 400,
    code: 'plan_change_disabled',
    detail:
      'Plan changes are no longer supported. Reconcile is the only active subscription; use checkout to update rentable unit count.',
    body: { new_plan: 'reconcile' },
  })

  await expectError({
    label: 'subscription downgrade route is disabled before plan mutation',
    path: '/api/v1/billing/subscription/downgrade',
    method: 'POST',
    status: 400,
    code: 'plan_change_disabled',
    detail:
      'Plan changes are no longer supported. Reconcile is the only active subscription; use checkout to update rentable unit count.',
    body: { new_plan: 'reconcile' },
  })

  const final = await snapshotBillingState()
  report.generated.finalBillingSnapshot = summarizeSnapshot(final)
  check(
    'negative billing lifecycle probes leave plan selection unchanged',
    final.plan_selection,
    initial.plan_selection
  )
  check(
    'negative billing lifecycle probes leave subscription unchanged',
    final.subscription,
    initial.subscription
  )
  check(
    'negative billing lifecycle probes leave organization settings unchanged',
    final.organization_settings,
    initial.organization_settings
  )

  report.cleanup.push({
    label: 'billing lifecycle negative scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
    body_preview:
      'Only validation/disabled billing branches were called; final billing and organization snapshots deep-equal initial snapshots.',
  })
}

async function snapshotBillingState() {
  return {
    plan_selection: await expectJson('/api/v1/billing/plan-selection', {
      status: 200,
    }),
    subscription: await expectJson('/api/v1/billing/subscription', {
      status: 200,
    }),
    organization_settings: await expectJson('/api/v1/organization/settings', {
      status: 200,
    }),
  }
}

function summarizeSnapshot(snapshot) {
  return {
    plan_id: snapshot.plan_selection?.plan_id ?? null,
    billing_period: snapshot.plan_selection?.billing_period ?? null,
    unit_count: snapshot.plan_selection?.unit_count ?? null,
    building_count: snapshot.plan_selection?.building_count ?? null,
    checkout_required: snapshot.plan_selection?.checkout_required ?? null,
    subscription_status: snapshot.plan_selection?.subscription_status ?? null,
    subscription_id: snapshot.subscription?.id ?? null,
    subscription_stripe_id_present: Boolean(
      snapshot.subscription?.stripe_subscription_id
    ),
    organization_id: snapshot.organization_settings?.organization_id ?? null,
  }
}

async function expectError({
  label,
  path,
  method,
  status,
  code,
  detail,
  body,
}) {
  const json = await expectJson(path, { method, status, body })
  check(
    label,
    {
      detail: json?.detail,
      error_code: json?.error?.code,
    },
    {
      detail,
      error_code: code,
    }
  )
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
