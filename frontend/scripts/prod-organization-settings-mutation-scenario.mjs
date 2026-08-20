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
  `prod-organization-settings-mutation-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {
    mutation_id: randomUUID(),
    global_cleanup_contract: 'organization settings restored to initial values',
  },
  checks: [],
  cleanup: [],
  auth: {},
}

let token
let initialSettings = null
let restoreAttempted = false
let scenarioCompleted = false
try {
  token = await signInWithPassword()
  initialSettings = await expectJson('/api/v1/organization/settings', {
    status: 200,
  })
  report.generated.organizationSettingsExpected =
    comparableSettings(initialSettings)
  await runScenario(initialSettings)
  scenarioCompleted = true
} catch (error) {
  report.error = errorMessage(error)
  throw error
} finally {
  if (token && initialSettings) {
    try {
      await restoreSettings(initialSettings)
    } catch (error) {
      report.cleanup.push({
        label: 'restore organization settings failed',
        ok: false,
        error: errorMessage(error),
      })
    }
  }
  report.ok =
    scenarioCompleted &&
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((check) => check.ok) &&
    restoreAttempted
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario(before) {
  const suffix = report.generated.mutation_id.slice(0, 8)
  const mutation = {
    timezone:
      before.timezone === 'America/Chicago'
        ? 'America/Denver'
        : 'America/Chicago',
    default_currency: 'USD',
    fiscal_year_end_month: before.fiscal_year_end_month === 12 ? 11 : 12,
    contact_name: `Prod E2E Contact ${suffix}`,
    contact_title: 'Controller',
    contact_company: `Prod E2E Holdings ${suffix}`,
    contact_phone: '+1-555-0100',
    contact_email: `prod-e2e-settings-${suffix}@example.com`,
    contact_address: `Suite ${suffix}, 101 Restore Way, Austin, TX 78701`,
  }

  const updated = await expectJson('/api/v1/organization/settings', {
    method: 'PATCH',
    status: 200,
    body: mutation,
  })
  check(
    'organization settings patch response reflects valid mutation',
    pick(updated, Object.keys(mutation)),
    mutation
  )

  const afterPatch = await expectJson('/api/v1/organization/settings', {
    status: 200,
  })
  check(
    'organization settings readback persists valid mutation',
    pick(afterPatch, Object.keys(mutation)),
    mutation
  )

  const invalidMonth = await expectJson('/api/v1/organization/settings', {
    method: 'PATCH',
    status: 422,
    body: { fiscal_year_end_month: 13 },
  })
  check(
    'organization settings rejects invalid fiscal year month',
    {
      code: invalidMonth.error?.code,
      detail_mentions_month:
        typeof invalidMonth.detail === 'string' &&
        (invalidMonth.detail.includes('12') ||
          invalidMonth.detail.includes('month')),
    },
    {
      code: 'validation_error',
      detail_mentions_month: true,
    }
  )

  const invalidLength = await expectJson('/api/v1/organization/settings', {
    method: 'PATCH',
    status: 422,
    body: { contact_phone: '1'.repeat(51) },
  })
  check(
    'organization settings rejects overlong contact phone',
    {
      code: invalidLength.error?.code,
      detail_mentions_limit:
        typeof invalidLength.detail === 'string' &&
        (invalidLength.detail.includes('50') ||
          invalidLength.detail.includes('String')),
    },
    {
      code: 'validation_error',
      detail_mentions_limit: true,
    }
  )

  const afterInvalid = await expectJson('/api/v1/organization/settings', {
    status: 200,
  })
  check(
    'invalid organization settings patches do not change persisted mutation',
    pick(afterInvalid, Object.keys(mutation)),
    mutation
  )

  check(
    'organization settings response keeps stable organization id',
    {
      initial: before.organization_id,
      mutated: afterPatch.organization_id,
      after_invalid: afterInvalid.organization_id,
    },
    {
      initial: before.organization_id,
      mutated: before.organization_id,
      after_invalid: before.organization_id,
    }
  )
}

async function restoreSettings(before) {
  restoreAttempted = true
  const restoreBody = comparableSettings(before)
  const restored = await expectJson('/api/v1/organization/settings', {
    method: 'PATCH',
    status: 200,
    body: restoreBody,
  })
  const responseOk =
    stableJson(comparableSettings(restored)) === stableJson(restoreBody)
  report.cleanup.push({
    label: 'restore organization settings patch response',
    path: '/api/v1/organization/settings',
    status: 200,
    ok: responseOk,
    body_preview: JSON.stringify(comparableSettings(restored)),
  })
  if (!responseOk) {
    throw new Error(
      'Organization settings restore response did not match initial settings'
    )
  }

  const finalSettings = await expectJson('/api/v1/organization/settings', {
    status: 200,
  })
  const finalOk =
    stableJson(comparableSettings(finalSettings)) === stableJson(restoreBody)
  report.cleanup.push({
    label: 'verify organization settings restored',
    path: '/api/v1/organization/settings',
    status: 200,
    ok: finalOk,
    body_preview: JSON.stringify(comparableSettings(finalSettings)),
  })
  if (!finalOk) {
    throw new Error('Organization settings were not restored to initial values')
  }
}

function comparableSettings(settings) {
  return pick(settings, [
    'timezone',
    'default_currency',
    'fiscal_year_end_month',
    'contact_name',
    'contact_title',
    'contact_company',
    'contact_phone',
    'contact_email',
    'contact_address',
  ])
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

function pick(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object?.[key] ?? null]))
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
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
