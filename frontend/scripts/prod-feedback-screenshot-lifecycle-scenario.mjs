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
  `prod-feedback-screenshot-lifecycle-${runId}`
)
await mkdir(outputDir, { recursive: true })

const pngBytes = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64'
  )
)

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {
    probe_id: randomUUID(),
    feedback_id: null,
    screenshot_storage_path: null,
    created_message:
      '[PROD-TEST] Feedback screenshot lifecycle disposable report',
  },
  checks: [],
  cleanup: [],
}

let token
let feedbackId = null
let screenshotStoragePath = null
let screenshotUrl = null

try {
  token = await signInWithPassword()
  await runScenario()
} finally {
  await cleanupCreatedData()
  report.ok =
    report.checks.every((checkItem) => checkItem.ok) &&
    report.cleanup.every((item) => item.ok)
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario() {
  const upload = await uploadScreenshot()
  screenshotStoragePath = upload.storage_path
  screenshotUrl = upload.url
  report.generated.screenshot_storage_path = screenshotStoragePath

  await expectScreenshotBytes(
    screenshotUrl,
    'uploaded screenshot signed URL returns exact PNG bytes'
  )

  const feedback = await expectJson('/api/v1/feedback', {
    method: 'POST',
    status: 201,
    body: {
      type: 'bug',
      message: `${report.generated.created_message} ${report.generated.probe_id}`,
      page_url: '/dashboard?prod_feedback_lifecycle=1',
      screenshot_url: screenshotUrl,
      user_agent: `prod-feedback-e2e/${runId}`,
      metadata: {
        prod_e2e: true,
        run_id: runId,
        probe_id: report.generated.probe_id,
      },
    },
  })
  feedbackId = feedback.id
  report.generated.feedback_id = feedbackId

  check(
    'created feedback has expected org-scoped screenshot response',
    {
      id_is_uuid: isUuid(feedback.id),
      status: feedback.status,
      type: feedback.type,
      has_signed_screenshot_url:
        typeof feedback.screenshot_url === 'string' &&
        feedback.screenshot_url.includes('/api/v1/feedback/screenshot-file'),
      metadata_probe_id: feedback.metadata?.probe_id,
    },
    {
      id_is_uuid: true,
      status: 'new',
      type: 'bug',
      has_signed_screenshot_url: true,
      metadata_probe_id: report.generated.probe_id,
    }
  )

  await expectScreenshotBytes(
    feedback.screenshot_url,
    'created feedback signed screenshot URL returns exact PNG bytes'
  )

  const detail = await expectJson(`/api/v1/feedback/${feedbackId}`, {
    status: 200,
  })
  check(
    'admin detail returns created feedback',
    {
      id: detail.id,
      message: detail.message,
      metadata_probe_id: detail.metadata?.probe_id,
      has_signed_screenshot_url:
        typeof detail.screenshot_url === 'string' &&
        detail.screenshot_url.includes('/api/v1/feedback/screenshot-file'),
    },
    {
      id: feedbackId,
      message: `${report.generated.created_message} ${report.generated.probe_id}`,
      metadata_probe_id: report.generated.probe_id,
      has_signed_screenshot_url: true,
    }
  )

  const listed = await expectJson('/api/v1/feedback?status=new&per_page=100', {
    status: 200,
  })
  check(
    'admin list includes created feedback before cleanup',
    {
      found: listed.some((item) => item.id === feedbackId),
      list_is_array: Array.isArray(listed),
    },
    { found: true, list_is_array: true }
  )

  const mine = await expectJson('/api/v1/feedback/my', { status: 200 })
  check(
    'my feedback includes created feedback before cleanup',
    {
      found: mine.some((item) => item.id === feedbackId),
      list_is_array: Array.isArray(mine),
    },
    { found: true, list_is_array: true }
  )

  const stats = await expectJson('/api/v1/feedback/stats/summary', {
    status: 200,
  })
  check(
    'feedback stats include at least one new bug after create',
    {
      total_positive: Number.isInteger(stats.total) && stats.total >= 1,
      new_positive:
        Number.isInteger(stats.by_status?.new) && stats.by_status.new >= 1,
      bug_positive:
        Number.isInteger(stats.by_type?.bug) && stats.by_type.bug >= 1,
    },
    { total_positive: true, new_positive: true, bug_positive: true }
  )

  const updated = await expectJson(`/api/v1/feedback/${feedbackId}`, {
    method: 'PATCH',
    status: 200,
    body: {
      status: 'reviewed',
      metadata: {
        prod_e2e: true,
        run_id: runId,
        probe_id: report.generated.probe_id,
        reviewed_by_e2e: true,
      },
    },
  })
  check(
    'admin can update feedback status and metadata',
    {
      id: updated.id,
      status: updated.status,
      reviewed_by_e2e: updated.metadata?.reviewed_by_e2e,
    },
    { id: feedbackId, status: 'reviewed', reviewed_by_e2e: true }
  )
}

async function cleanupCreatedData() {
  if (!token) {
    report.cleanup.push({
      label: 'auth unavailable before writes',
      ok: feedbackId === null && screenshotStoragePath === null,
      detail: { feedbackId, screenshotStoragePath },
    })
    return
  }

  if (feedbackId) {
    const deleted = await expectStatus(`/api/v1/feedback/${feedbackId}`, {
      method: 'DELETE',
      expected: [204, 404],
    })
    report.cleanup.push({
      label: 'feedback row delete returned terminal cleanup status',
      ok: [204, 404].includes(deleted.status),
      status: deleted.status,
    })
  } else if (screenshotStoragePath) {
    const deletedScreenshot = await expectStatus(
      '/api/v1/feedback/screenshot',
      {
        method: 'DELETE',
        expected: [204, 404],
        body: { storage_path: screenshotStoragePath },
      }
    )
    report.cleanup.push({
      label: 'orphan screenshot delete returned terminal cleanup status',
      ok: [204, 404].includes(deletedScreenshot.status),
      status: deletedScreenshot.status,
    })
  }

  if (feedbackId) {
    const detail = await expectStatus(`/api/v1/feedback/${feedbackId}`, {
      expected: [404],
    })
    report.cleanup.push({
      label: 'deleted feedback detail returns 404',
      ok: detail.status === 404,
      status: detail.status,
    })

    const listed = await expectJson('/api/v1/feedback?per_page=100', {
      status: 200,
    })
    report.cleanup.push({
      label: 'deleted feedback absent from admin list',
      ok: !listed.some((item) => item.id === feedbackId),
    })

    const mine = await expectJson('/api/v1/feedback/my', { status: 200 })
    report.cleanup.push({
      label: 'deleted feedback absent from my feedback list',
      ok: !mine.some((item) => item.id === feedbackId),
    })
  }

  if (screenshotUrl) {
    const screenshot = await fetch(screenshotUrl)
    await screenshot.arrayBuffer().catch(() => new ArrayBuffer(0))
    report.cleanup.push({
      label: 'deleted screenshot signed URL returns 404',
      ok: screenshot.status === 404,
      status: screenshot.status,
    })
  }
}

async function uploadScreenshot() {
  const form = new FormData()
  form.append(
    'file',
    new Blob([pngBytes], { type: 'image/png' }),
    `prod-feedback-${runId}.png`
  )
  return expectJson('/api/v1/feedback/screenshot', {
    method: 'POST',
    status: 201,
    body: form,
  })
}

async function expectScreenshotBytes(url, label) {
  const response = await fetch(url)
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
      content_type: 'image/png',
      bytes_hex: Buffer.from(pngBytes).toString('hex'),
    }
  )
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

async function expectStatus(path, options = {}) {
  const response = await request(path, options)
  const text = await response.text()
  if (!options.expected.includes(response.status)) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.expected.join(' or ')}: ${text.slice(0, 500)}`
    )
  }
  return { status: response.status, text }
}

async function request(path, options = {}) {
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value
  )
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
