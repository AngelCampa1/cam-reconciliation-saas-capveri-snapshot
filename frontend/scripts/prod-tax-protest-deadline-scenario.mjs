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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-tax-protest-${runId}`)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  cleanup: [],
  auth: {},
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
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Tax Protest Tower ${suffix}`
  const created = { propertyId: null }
  report.generated = { propertyName }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '415 Protest Plaza',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '1000.00',
        total_usable_sqft: '900.00',
        common_area_sqft: '100.00',
        target_occupancy: '0.95',
        tax_protest_county: 'Travis',
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    check(
      'tax protest property create persists county fields',
      pick(property, ['name', 'state', 'tax_protest_county']),
      {
        name: propertyName,
        state: 'TX',
        tax_protest_county: 'Travis',
      }
    )

    const deadlines = await expectJson(
      '/api/v1/tax-protest/deadlines?year=2026',
      {
        status: 200,
      }
    )
    const item = deadlines.items.find(
      (entry) => entry.property_id === property.id
    )
    check(
      'tax protest deadlines include generated Travis property',
      normalizeDeadline(item),
      {
        property_id: property.id,
        property_name: propertyName,
        county: 'Travis',
        state: 'TX',
        effective_deadline: '2026-05-15',
        days_remaining: daysRemaining('2026-05-15'),
        is_past: true,
        is_configured: true,
      }
    )
    check(
      'tax protest deadlines response uses requested year',
      deadlines.year,
      2026
    )
  } finally {
    await cleanup(created)
  }
}

async function cleanup(created) {
  const failures = []

  if (created.propertyId) {
    await attemptCleanup(failures, 'delete tax protest property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify tax protest property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
    await attemptCleanup(
      failures,
      'verify tax protest deadline removed',
      async () => {
        const deadlines = await expectJson(
          '/api/v1/tax-protest/deadlines?year=2026',
          { status: 200 }
        )
        const found = deadlines.items.some(
          (entry) => entry.property_id === created.propertyId
        )
        const ok = !found
        report.cleanup.push({
          path: '/api/v1/tax-protest/deadlines?year=2026',
          status: 200,
          ok,
          body_preview: JSON.stringify({ property_absent: !found }),
        })
        if (!ok) {
          throw new Error('Generated property still present in deadline list')
        }
      }
    )
  }

  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
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

async function expectStatus(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  const ok = response.status === options.status
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
}

async function deleteEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({
      label,
      ok: false,
      error: errorMessage(error),
    })
  }
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

function normalizeDeadline(item) {
  if (!item) return null
  return pick(item, [
    'property_id',
    'property_name',
    'county',
    'state',
    'effective_deadline',
    'days_remaining',
    'is_past',
    'is_configured',
  ])
}

function daysRemaining(deadline) {
  const [year, month, day] = deadline.split('-').map(Number)
  const today = new Date()
  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  )
  const deadlineMs = Date.UTC(year, month - 1, day)
  return Math.trunc((deadlineMs - todayMs) / 86_400_000)
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
