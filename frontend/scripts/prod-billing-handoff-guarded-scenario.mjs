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
const allowStripePortalSession =
  env.E2E_PROD_ALLOW_STRIPE_PORTAL_SESSION === 'true'
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-billing-handoff-guarded-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy:
      'guarded production billing handoff; never follows Stripe URLs; skips checkout and skips Stripe portal session creation unless explicitly enabled',
    allowStripePortalSession,
    negativeNoPersistentIdsExpected: true,
    persistentIdsCreated: [],
    stripeUrlsCreated: [],
    skipped: [],
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
    (allowStripePortalSession ||
      report.generated.stripeUrlsCreated.length === 0) &&
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

  check(
    'production e2e account starts with stable active billing access',
    {
      plan_id: initial.plan_selection.plan_id,
      billing_period: initial.plan_selection.billing_period,
      has_active_access: initial.plan_selection.has_active_access,
      checkout_required: initial.plan_selection.checkout_required,
      subscription_status: initial.subscription.status,
    },
    {
      plan_id: 'reconcile',
      billing_period: 'annual',
      has_active_access: true,
      checkout_required: false,
      subscription_status: 'trialing',
    }
  )

  const customerResult = await expectJson('/api/v1/billing/customer', {
    status: [200, 404],
  })

  if (customerResult.status === 404) {
    check(
      'billing customer lookup fails safely without creating a customer',
      {
        detail: customerResult.json?.detail,
        error_code: customerResult.json?.error?.code,
      },
      {
        detail: 'No billing customer found for this organization',
        error_code: 'billing_customer_not_found',
      }
    )
    report.generated.skipped.push({
      label: 'stripe portal session',
      reason:
        'No existing Stripe customer is attached to the production e2e organization.',
    })
  } else {
    const customer = customerResult.json
    check(
      'billing customer lookup reaches Stripe and returns safe customer shape',
      {
        id_prefix:
          typeof customer.id === 'string' ? customer.id.slice(0, 4) : '',
        email_is_string: typeof customer.email === 'string',
        name_is_string: typeof customer.name === 'string',
        created_is_number: typeof customer.created === 'number',
      },
      {
        id_prefix: 'cus_',
        email_is_string: true,
        name_is_string: true,
        created_is_number: true,
      }
    )

    if (allowStripePortalSession) {
      const portalResult = await expectJson(
        '/api/v1/billing/portal?return_url=https%3A%2F%2Fapp.capveri.com%2Fsettings%2Fbilling',
        { method: 'POST', status: 200 }
      )
      const portalUrl = new URL(portalResult.json.url)
      check(
        'billing portal handoff returns a Stripe-hosted URL without browser navigation',
        {
          protocol: portalUrl.protocol,
          hostname: portalUrl.hostname,
          path_prefix: portalUrl.pathname.slice(0, 3),
        },
        {
          protocol: 'https:',
          hostname: 'billing.stripe.com',
          path_prefix: '/p/',
        }
      )
      report.generated.stripeUrlsCreated.push({
        label: 'billing portal session url',
        host: portalUrl.hostname,
        path_prefix: portalUrl.pathname.slice(0, 3),
        productionStripeSessionCreated: true,
      })
    } else {
      report.generated.skipped.push({
        label: 'stripe portal session',
        reason:
          'An existing Stripe customer is attached, but creating a real Stripe portal session is disabled unless E2E_PROD_ALLOW_STRIPE_PORTAL_SESSION=true.',
      })
    }
  }

  report.generated.skipped.push({
    label: 'valid checkout session',
    reason:
      'POST /api/v1/billing/checkout can persist checkout activation and can create a Stripe customer; this scenario does not create durable billing data in production.',
  })

  const final = await snapshotBillingState()
  report.generated.finalBillingSnapshot = summarizeSnapshot(final)
  check(
    'guarded billing handoff leaves plan selection unchanged',
    final.plan_selection,
    initial.plan_selection
  )
  check(
    'guarded billing handoff leaves subscription unchanged',
    final.subscription,
    initial.subscription
  )
  check(
    'guarded billing handoff leaves organization settings unchanged',
    final.organization_settings,
    initial.organization_settings
  )

  report.cleanup.push({
    label: 'guarded billing handoff created no durable production ids',
    ok:
      report.generated.persistentIdsCreated.length === 0 &&
      (allowStripePortalSession ||
        report.generated.stripeUrlsCreated.length === 0),
    actual: {
      persistent_ids: report.generated.persistentIdsCreated,
      stripe_urls_created: report.generated.stripeUrlsCreated,
    },
    expected: {
      persistent_ids: [],
      stripe_urls_created: allowStripePortalSession
        ? report.generated.stripeUrlsCreated
        : [],
    },
    body_preview:
      'The scenario did not call checkout, did not follow Stripe URLs, and final billing/organization snapshots deep-equal initial snapshots.',
  })
}

async function snapshotBillingState() {
  return {
    plan_selection: await expectJson('/api/v1/billing/plan-selection', {
      status: 200,
    }).then((result) => result.json),
    subscription: await expectJson('/api/v1/billing/subscription', {
      status: 200,
    }).then((result) => result.json),
    organization_settings: await expectJson('/api/v1/organization/settings', {
      status: 200,
    }).then((result) => result.json),
  }
}

function summarizeSnapshot(snapshot) {
  return {
    plan_id: snapshot.plan_selection?.plan_id ?? null,
    billing_period: snapshot.plan_selection?.billing_period ?? null,
    unit_count: snapshot.plan_selection?.unit_count ?? null,
    building_count: snapshot.plan_selection?.building_count ?? null,
    has_active_access: snapshot.plan_selection?.has_active_access ?? null,
    checkout_required: snapshot.plan_selection?.checkout_required ?? null,
    subscription_status: snapshot.subscription?.status ?? null,
    subscription_id: snapshot.subscription?.id ?? null,
    subscription_stripe_id_present: Boolean(
      snapshot.subscription?.stripe_subscription_id
    ),
    organization_id: snapshot.organization_settings?.organization_id ?? null,
  }
}

async function expectJson(path, options) {
  const expectedStatuses = Array.isArray(options.status)
    ? options.status
    : [options.status]
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
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${expectedStatuses.join(' or ')}: ${text.slice(0, 500)}`
    )
  }
  return {
    status: response.status,
    json: text ? JSON.parse(text) : null,
  }
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
