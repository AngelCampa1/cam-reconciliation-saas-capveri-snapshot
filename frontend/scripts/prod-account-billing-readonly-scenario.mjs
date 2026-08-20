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
  `prod-account-billing-readonly-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {
    probe_id: randomUUID(),
    write_policy: 'read-only plus invalid no-op validation probes',
    invalidNoopProbeCleanupExpected: true,
    persistentIdsCreated: [],
    cleanupProofLabels: [
      'invalid probes leave organization settings unchanged',
      'invalid probes leave billing plan unchanged',
    ],
  },
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
  const initialSettings = await expectJson('/api/v1/organization/settings', {
    status: 200,
  })
  const initialPlan = await expectJson('/api/v1/billing/plan-selection', {
    status: 200,
  })

  check(
    'organization settings exposes normalized safe fields',
    pick(initialSettings, [
      'organization_id',
      'timezone',
      'default_currency',
      'fiscal_year_end_month',
      'contact_name',
      'contact_title',
      'contact_company',
      'contact_phone',
      'contact_email',
      'contact_address',
    ]),
    {
      organization_id: initialSettings.organization_id,
      timezone: initialSettings.timezone,
      default_currency: initialSettings.default_currency,
      fiscal_year_end_month: initialSettings.fiscal_year_end_month,
      contact_name: initialSettings.contact_name,
      contact_title: initialSettings.contact_title,
      contact_company: initialSettings.contact_company,
      contact_phone: initialSettings.contact_phone,
      contact_email: initialSettings.contact_email,
      contact_address: initialSettings.contact_address,
    }
  )

  const usage = await expectJson('/api/v1/organization/usage', { status: 200 })
  check(
    'organization usage returns nonnegative counts',
    {
      properties_is_number: Number.isInteger(usage.properties),
      users_is_number: Number.isInteger(usage.users),
      properties_nonnegative: usage.properties >= 0,
      users_nonnegative: usage.users >= 1,
    },
    {
      properties_is_number: true,
      users_is_number: true,
      properties_nonnegative: true,
      users_nonnegative: true,
    }
  )

  const billingReads = {
    launch_offer: await expectJson('/api/v1/billing/launch-offer/active', {
      status: 200,
    }),
    free_audit_status: await expectJson('/api/v1/billing/free-audit-status', {
      status: 200,
    }),
    guarantee_eligibility: await expectJson(
      '/api/v1/billing/guarantee/eligibility',
      { status: 200 }
    ),
    feature_usage: await expectJson('/api/v1/billing/feature-usage', {
      status: 200,
    }),
    credits: await expectJson('/api/v1/billing/credits', { status: 200 }),
    credit_history: await expectJson('/api/v1/billing/credits/history', {
      status: 200,
    }),
    invoices: await expectJson('/api/v1/billing/invoices?page=1&per_page=5', {
      status: 200,
    }),
    invoice_summary: await expectJson('/api/v1/billing/invoices/summary', {
      status: 200,
    }),
    subscription: await expectJson('/api/v1/billing/subscription', {
      status: 200,
    }),
  }

  check(
    'billing read endpoints expose expected safe shapes',
    {
      launch_offer_has_offer_shape:
        typeof billingReads.launch_offer.code === 'string' &&
        typeof billingReads.launch_offer.discount_percent === 'number' &&
        typeof billingReads.launch_offer.all_exhausted === 'boolean',
      free_audit_has_access_flags:
        typeof billingReads.free_audit_status.can_run_reconciliation ===
          'boolean' &&
        typeof billingReads.free_audit_status.can_download_reports ===
          'boolean',
      guarantee_has_eligible:
        typeof billingReads.guarantee_eligibility.eligible === 'boolean',
      feature_usage_has_array: Array.isArray(
        billingReads.feature_usage.used_features
      ),
      credits_has_numbers:
        typeof billingReads.credits.total_purchased === 'number' &&
        typeof billingReads.credits.total_used === 'number' &&
        typeof billingReads.credits.total_remaining === 'number',
      credit_history_is_array: Array.isArray(billingReads.credit_history),
      invoices_has_items: Array.isArray(billingReads.invoices.invoices),
      invoice_summary_has_totals:
        'total_paid_amount' in billingReads.invoice_summary ||
        'paid_total' in billingReads.invoice_summary ||
        'total_paid' in billingReads.invoice_summary,
      subscription_has_status:
        typeof billingReads.subscription.status === 'string',
    },
    {
      launch_offer_has_offer_shape: true,
      free_audit_has_access_flags: true,
      guarantee_has_eligible: true,
      feature_usage_has_array: true,
      credits_has_numbers: true,
      credit_history_is_array: true,
      invoices_has_items: true,
      invoice_summary_has_totals: true,
      subscription_has_status: true,
    }
  )

  check(
    'plan selection confirms active prod e2e access',
    {
      plan_id: initialPlan.plan_id,
      billing_period: initialPlan.billing_period,
      unit_count_positive: initialPlan.unit_count >= 1,
      building_count_positive: initialPlan.building_count >= 1,
      has_active_access: initialPlan.has_active_access,
      checkout_required: initialPlan.checkout_required,
      subscription_status: initialPlan.subscription_status,
    },
    {
      plan_id: 'reconcile',
      billing_period: 'annual',
      unit_count_positive: true,
      building_count_positive: true,
      has_active_access: true,
      checkout_required: false,
      subscription_status: 'trialing',
    }
  )

  const teamMembers = await expectJson('/api/v1/team/members', { status: 200 })
  const invitations = await expectJson(
    '/api/v1/team/invitations?include_used=true',
    { status: 200 }
  )
  check(
    'team read endpoints are org scoped and non-mutating',
    {
      members_is_array: Array.isArray(teamMembers),
      has_current_owner: teamMembers.some(
        (member) =>
          member.email === report.auth.email &&
          (member.role === 'owner' || member.role === 'admin')
      ),
      invitations_is_array: Array.isArray(invitations),
    },
    {
      members_is_array: true,
      has_current_owner: true,
      invitations_is_array: true,
    }
  )

  const invalidSettings = await expectJson('/api/v1/organization/settings', {
    method: 'PATCH',
    status: 422,
    body: { fiscal_year_end_month: 13 },
  })
  check(
    'invalid organization settings patch is rejected before persistence',
    {
      has_error:
        typeof invalidSettings.detail === 'string' ||
        typeof invalidSettings.error?.code === 'string',
    },
    { has_error: true }
  )

  const invalidPlan = await expectJson('/api/v1/billing/plan-selection', {
    method: 'PUT',
    status: 400,
    body: {
      plan_id: 'not-a-real-plan',
      billing_period: 'annual',
      unit_count: 1,
      building_count: 1,
    },
  })
  check(
    'invalid billing plan selection is rejected before persistence',
    {
      has_error:
        typeof invalidPlan.detail === 'string' ||
        typeof invalidPlan.error?.code === 'string',
    },
    { has_error: true }
  )

  const finalSettings = await expectJson('/api/v1/organization/settings', {
    status: 200,
  })
  const finalPlan = await expectJson('/api/v1/billing/plan-selection', {
    status: 200,
  })

  check(
    'invalid probes leave organization settings unchanged',
    finalSettings,
    initialSettings
  )
  check('invalid probes leave billing plan unchanged', finalPlan, initialPlan)
  report.cleanup.push({
    label: 'read-only scenario cleanup',
    ok: true,
    body_preview:
      'No durable writes were issued except invalid validation probes; final settings and plan deep-equal initial snapshots.',
  })
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

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]))
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
