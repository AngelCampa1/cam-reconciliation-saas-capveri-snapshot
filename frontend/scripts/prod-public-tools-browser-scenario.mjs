import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')

const env = {
  ...(await readEnv(resolve(repoRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.production.local'))),
  ...process.env,
}

const required = ['E2E_PROD_MARKETING_URL', 'E2E_PROD_API_URL']
for (const key of required) {
  if (!env[key]?.trim()) {
    throw new Error(`Missing ${key} in ignored E2E env files.`)
  }
}

const marketingUrl = trimSlash(env.E2E_PROD_MARKETING_URL)
const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const requiredCalculatorPaths = [
  '/api/v1/tools/boma-2024-calculator',
  '/api/v1/tools/hcad-tax-normalizer/calculate',
  '/api/v1/tools/fixed-cam-modeler',
]
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-public-tools-browser-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { marketing_url: marketingUrl, api_url: apiUrl },
  generated: {
    write_policy:
      'browser-only public tool calculations; no lead submissions and no persistent IDs',
    readOnlyNoPersistentWrites: true,
    persistentIdsCreated: [],
  },
  tools: [],
  api_calls: [],
  checks: [],
  screenshots: [],
  browser_errors: [],
  failed_responses: [],
  mutating_requests: [],
  cleanup: [
    {
      label: 'public tools browser cleanup',
      ok: true,
      body_preview:
        'No production data was created. The scenario fills public calculators, pre-unlocks gated cards with localStorage, and never submits lead forms.',
    },
  ],
}

let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: false,
  })
  attachContextGuards(context)

  await runBomaScenario(context)
  await runHcadScenario(context)
  await runFixedCamScenario(context)
  verifyRequiredApiCalls()

  report.ok =
    report.tools.every((item) => item.ok) &&
    report.checks.every((item) => item.ok) &&
    report.browser_errors.length === 0 &&
    report.failed_responses.length === 0 &&
    report.mutating_requests.length === 0
} finally {
  if (browser) await browser.close()
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runBomaScenario(context) {
  const page = await context.newPage()
  attachPageErrors(page, 'boma-2024-calculator')
  try {
    await page.goto(`${marketingUrl}/tools/boma-2024-calculator`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await expectVisibleText(page, /BOMA 2024 Rentable Area Calculator/i)
    await preUnlock(page, 'capveri_calculator_unlocked:boma-2024-calculator')

    await page
      .getByRole('spinbutton', { name: /existing usable sf/i })
      .fill('10000')
    await page
      .getByRole('spinbutton', { name: /existing rentable sf/i })
      .fill('11200')
    await page.getByRole('spinbutton', { name: /balcony sf/i }).fill('1200')
    await page
      .getByRole('spinbutton', { name: /annual rent per sf/i })
      .fill('35')

    await expectVisibleText(page, /1,344\s*SF/)
    await expectVisibleText(page, /12\.00\s*%/)
    await expectSectionText(page, 'Annual Revenue Lift', /\$47,040/)
    await expectSectionText(page, /Asset Value Lift/, /\$723,692/)
    await screenshot(page, 'public-tools-boma')
    report.tools.push({
      label: 'boma-2024-browser-calculation',
      ok: true,
      path: '/tools/boma-2024-calculator',
      expected_visible_results: ['1,344 SF', '12.00%', '$47,040', '$723,692'],
    })
  } catch (error) {
    report.tools.push({
      label: 'boma-2024-browser-calculation',
      ok: false,
      path: '/tools/boma-2024-calculator',
      error: errorMessage(error),
    })
    throw error
  } finally {
    await page.close()
  }
}

async function runHcadScenario(context) {
  const page = await context.newPage()
  attachPageErrors(page, 'hcad-tax-normalizer')
  try {
    await page.goto(`${marketingUrl}/tools/hcad-tax-normalizer`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await expectVisibleText(page, /HCAD Tax Base Year Normalizer/i)

    await page
      .getByRole('spinbutton', { name: /original base year assessment/i })
      .fill('1000000')
    await page
      .getByRole('spinbutton', { name: /arb retroactive reduction/i })
      .fill('150000')
    await page
      .getByRole('spinbutton', { name: /current year property tax/i })
      .fill('1350000')
    await page
      .getByRole('spinbutton', { name: /tenant pro-rata share/i })
      .fill('5')
    await page
      .getByRole('button', { name: /calculate tax adjustment/i })
      .click()

    await expectSectionText(page, 'Recovery opportunity', /\$7,500/)

    await page.getByRole('spinbutton', { name: /expense cap rate/i }).fill('3')
    await page
      .getByRole('button', { name: /calculate tax adjustment/i })
      .click()

    await expectSectionText(page, 'Capped adjustment', /\$525/)
    await screenshot(page, 'public-tools-hcad')
    report.tools.push({
      label: 'hcad-tax-normalizer-browser-calculation',
      ok: true,
      path: '/tools/hcad-tax-normalizer',
      expected_visible_results: ['$7,500', '$525 capped adjustment'],
    })
  } catch (error) {
    report.tools.push({
      label: 'hcad-tax-normalizer-browser-calculation',
      ok: false,
      path: '/tools/hcad-tax-normalizer',
      error: errorMessage(error),
    })
    throw error
  } finally {
    await page.close()
  }
}

async function runFixedCamScenario(context) {
  const page = await context.newPage()
  attachPageErrors(page, 'fixed-cam-vs-traditional')
  try {
    await page.goto(`${marketingUrl}/tools/fixed-cam-vs-traditional`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await expectVisibleText(
      page,
      /Fixed CAM vs Traditional Reconciliation Modeler/i
    )
    await preUnlock(
      page,
      'capveri_calculator_unlocked:fixed-cam-vs-traditional'
    )

    const expenses = page.getByRole('spinbutton', { name: /total expenses/i })
    const rentable = page.getByRole('spinbutton', { name: /rentable sf/i })
    for (const [index, value] of [
      '1000000',
      '1100000',
      '1200000',
      '1300000',
      '1400000',
    ].entries()) {
      await expenses.nth(index).fill(value)
      await rentable.nth(index).fill('100000')
    }

    await page.getByRole('spinbutton', { name: /tenant sf/i }).fill('5000')
    await page.getByRole('spinbutton', { name: /pro-rata share/i }).fill('5')
    await page.getByRole('spinbutton', { name: /fixed cam rate/i }).fill('8.50')

    await expectVisibleText(page, /\$50,000\.00/)
    await expectVisibleText(page, /\$42,500\.00/)
    await expectSectionText(page, 'Total Traditional Recovery', /\$300,000/)
    await expectSectionText(page, 'Total Fixed CAM Revenue', /\$225,638/)
    await expectSectionText(page, 'Cumulative Delta Over Period', /\+\$74,362/)
    await screenshot(page, 'public-tools-fixed-cam')
    report.tools.push({
      label: 'fixed-cam-browser-calculation',
      ok: true,
      path: '/tools/fixed-cam-vs-traditional',
      expected_visible_results: [
        '$50,000.00',
        '$42,500.00',
        '$300,000',
        '$225,638',
        '+$74,362',
      ],
    })
  } catch (error) {
    report.tools.push({
      label: 'fixed-cam-browser-calculation',
      ok: false,
      path: '/tools/fixed-cam-vs-traditional',
      error: errorMessage(error),
    })
    throw error
  } finally {
    await page.close()
  }
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
    if (isAllowedCalculatorPost(url, method)) {
      report.api_calls.push({ method, url: redactQuery(url), allowed: true })
      return
    }
    if (isRelevantOrigin(url) && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      report.mutating_requests.push({ method, url: redactQuery(url) })
    }
  })

  context.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    if (status >= 400 && isRelevantFailure(url)) {
      report.failed_responses.push({ status, url: redactQuery(url) })
    }
  })
}

function attachPageErrors(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.browser_errors.push({
        label,
        type: 'console',
        text: message.text().slice(0, 500),
      })
    }
  })
  page.on('pageerror', (error) => {
    report.browser_errors.push({
      label,
      type: 'pageerror',
      text: error.message.slice(0, 500),
    })
  })
}

async function preUnlock(page, key) {
  await page.evaluate((storageKey) => {
    window.localStorage.setItem(storageKey, 'true')
  }, key)
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 })
}

async function expectVisibleText(page, pattern) {
  const locator = page.getByText(pattern).first()
  await locator.waitFor({ state: 'visible', timeout: 15_000 })
  report.checks.push({
    label: `visible text ${pattern}`,
    ok: true,
    actual: await locator.innerText(),
  })
}

async function expectSectionText(page, heading, pattern) {
  const section =
    heading instanceof RegExp
      ? page.getByText(heading).first().locator('..')
      : page.getByText(heading, { exact: true }).locator('..')
  await section.waitFor({ state: 'visible', timeout: 15_000 })
  const text = await waitForMatchingText(section, pattern, 15_000)
  const ok = pattern.test(text)
  report.checks.push({
    label: `section ${heading} contains ${pattern}`,
    ok,
    actual: text,
    expected: String(pattern),
  })
  if (!ok) {
    throw new Error(
      `Section ${JSON.stringify(heading)} did not match ${pattern}: ${text}`
    )
  }
}

async function waitForMatchingText(locator, pattern, timeoutMs) {
  const started = Date.now()
  let latest = ''
  while (Date.now() - started < timeoutMs) {
    latest = await locator.innerText()
    if (pattern.test(latest)) return latest
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return latest
}

async function screenshot(page, label) {
  const path = resolve(outputDir, `${label}.png`)
  await page.screenshot({ path, fullPage: true })
  report.screenshots.push({ label, path })
}

function isAllowedCalculatorPost(url, method) {
  if (method !== 'POST') return false
  return requiredCalculatorPaths.some((path) => url === `${apiUrl}${path}`)
}

function verifyRequiredApiCalls() {
  for (const path of requiredCalculatorPaths) {
    const count = report.api_calls.filter(
      (call) => call.method === 'POST' && call.url === `${apiUrl}${path}`
    ).length
    report.checks.push({
      label: `browser called ${path}`,
      ok: count > 0,
      actual: { count },
      expected: { min_count: 1 },
    })
  }
}

function isRelevantOrigin(url) {
  if (url.startsWith(`${marketingUrl}/cdn-cgi/rum`)) return false
  return url.startsWith(apiUrl) || url.startsWith(marketingUrl)
}

function isRelevantFailure(url) {
  if (url.includes('/cdn-cgi/rum')) return false
  if (url.includes('posthog.com')) return false
  if (url.includes('sentry.io')) return false
  if (url.includes('googletagmanager.com')) return false
  return isRelevantOrigin(url)
}

function redactQuery(url) {
  try {
    const parsed = new URL(url)
    parsed.search = parsed.search ? '?[redacted]' : ''
    return parsed.toString()
  } catch {
    return url
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
