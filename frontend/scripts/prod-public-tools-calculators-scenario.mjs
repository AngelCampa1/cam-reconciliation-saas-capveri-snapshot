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

if (!env.E2E_PROD_API_URL?.trim()) {
  throw new Error('Missing E2E_PROD_API_URL.')
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-public-tools-calculators-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    publicToolPureComputeExpected: true,
    persistentIdsCreated: [],
    allowedToolPaths: [
      '/api/v1/tools/boma-2024-calculator',
      '/api/v1/tools/hcad-tax-normalizer/calculate',
      '/api/v1/tools/fixed-cam-modeler',
    ],
  },
  api_calls: [],
  cleanup: [
    {
      label: 'public tools calculators cleanup',
      ok: true,
      body_preview:
        'No production data was created. These public routes are pure compute endpoints and return no persistent IDs.',
    },
  ],
  checks: [],
}

try {
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
  await expectJson({
    label: 'BOMA fractional SF with financial projection',
    path: '/api/v1/tools/boma-2024-calculator',
    body: {
      usable_sf: '12345.67',
      rentable_sf: '15432.10',
      balcony_sf: '321.45',
      terrace_sf: '210.55',
      outdoor_amenity_sf: '98.76',
      annual_rent_per_sf: '37.25',
      cap_rate: '0.0725',
    },
    expectedStatus: 200,
    expectedBody: {
      load_factor: '1.2500',
      new_usable_sf: '12976.43',
      new_rentable_sf: '16220.54',
      hidden_sf: '788.44',
      pct_increase: '5.1091',
      revenue_lift: '29369.39',
      asset_value_lift: '405095',
    },
  })

  await expectJson({
    label: 'BOMA geometry-only omits financial projection',
    path: '/api/v1/tools/boma-2024-calculator',
    body: {
      usable_sf: '98765.43',
      rentable_sf: '120987.65',
      balcony_sf: '111.11',
      terrace_sf: '222.22',
      outdoor_amenity_sf: '333.33',
    },
    expectedStatus: 200,
    expectedBody: {
      load_factor: '1.2250',
      new_usable_sf: '99432.09',
      new_rentable_sf: '121804.31',
      hidden_sf: '816.66',
      pct_increase: '0.6750',
      revenue_lift: null,
      asset_value_lift: null,
    },
  })

  await expectJson({
    label: 'HCAD tax normalizer applies cap',
    path: '/api/v1/tools/hcad-tax-normalizer/calculate',
    body: {
      original_base_year_assessment: '1250000.25',
      retroactive_adjustment: '175000.10',
      current_year_tax: '1512345.67',
      pro_rata_pct: '0.0375',
      cap_rate: '0.04',
    },
    expectedStatus: 200,
    expectedBody: {
      adjusted_base_year: '1075000.15',
      original_passthrough: '9837.95',
      corrected_passthrough: '16400.46',
      recovery_delta: '6562.51',
      capped_corrected_passthrough: '10231.47',
      capped_recovery: '393.52',
      cap_was_applied: true,
    },
  })

  await expectJson({
    label: 'HCAD tax normalizer omits cap fields',
    path: '/api/v1/tools/hcad-tax-normalizer/calculate',
    body: {
      original_base_year_assessment: '900000.00',
      retroactive_adjustment: '123456.78',
      current_year_tax: '1123456.78',
      pro_rata_pct: '0.08425',
    },
    expectedStatus: 200,
    expectedBody: {
      adjusted_base_year: '776543.22',
      original_passthrough: '18826.23',
      corrected_passthrough: '29227.47',
      recovery_delta: '10401.24',
      capped_corrected_passthrough: null,
      capped_recovery: null,
      cap_was_applied: null,
    },
  })

  await expectJson({
    label: 'Fixed CAM modeler sorts unsorted five-year input',
    path: '/api/v1/tools/fixed-cam-modeler',
    body: {
      years: [
        {
          year: 2027,
          total_operating_expenses: '1350000.75',
          rentable_sf: '98000.5',
        },
        {
          year: 2024,
          total_operating_expenses: '1010000.10',
          rentable_sf: '97500.25',
        },
        {
          year: 2026,
          total_operating_expenses: '1250000.55',
          rentable_sf: '99000.75',
        },
        {
          year: 2025,
          total_operating_expenses: '1111111.11',
          rentable_sf: '98000.5',
        },
        {
          year: 2028,
          total_operating_expenses: '1475000.25',
          rentable_sf: '100250.25',
        },
      ],
      fixed_cam_rate_per_sf: '9.75',
      annual_escalation_pct: '2.75',
      tenant_sqft: '12345.67',
      pro_rata_share: '12.5',
    },
    expectedStatus: 200,
    expectedBody: {
      years: [
        {
          year: 2024,
          total_operating_expenses: '1010000.10',
          expense_per_sf: '10.36',
          traditional_recovery: '126250.01',
          fixed_cam_revenue: '120370.28',
          delta: '5879.73',
          cumulative_delta: '5879.73',
          escalated_rate_per_sf: '9.75',
        },
        {
          year: 2025,
          total_operating_expenses: '1111111.11',
          expense_per_sf: '11.34',
          traditional_recovery: '138888.89',
          fixed_cam_revenue: '123680.47',
          delta: '15208.42',
          cumulative_delta: '21088.15',
          escalated_rate_per_sf: '10.02',
        },
        {
          year: 2026,
          total_operating_expenses: '1250000.55',
          expense_per_sf: '12.63',
          traditional_recovery: '156250.07',
          fixed_cam_revenue: '127081.68',
          delta: '29168.39',
          cumulative_delta: '50256.54',
          escalated_rate_per_sf: '10.29',
        },
        {
          year: 2027,
          total_operating_expenses: '1350000.75',
          expense_per_sf: '13.78',
          traditional_recovery: '168750.09',
          fixed_cam_revenue: '130576.42',
          delta: '38173.67',
          cumulative_delta: '88430.21',
          escalated_rate_per_sf: '10.58',
        },
        {
          year: 2028,
          total_operating_expenses: '1475000.25',
          expense_per_sf: '14.71',
          traditional_recovery: '184375.03',
          fixed_cam_revenue: '134167.28',
          delta: '50207.75',
          cumulative_delta: '138637.96',
          escalated_rate_per_sf: '10.87',
        },
      ],
      total_traditional_recovery: '774514.09',
      total_fixed_cam_revenue: '635876.13',
      total_delta: '138637.96',
      avg_annual_delta: '27727.59',
    },
  })

  await expectJson({
    label: 'Invalid BOMA rentable less than usable returns invalid_tool_input',
    path: '/api/v1/tools/boma-2024-calculator',
    body: {
      usable_sf: '100000',
      rentable_sf: '99999.99',
      annual_rent_per_sf: '35',
    },
    expectedStatus: 422,
    expectedBody: {
      detail: 'rentable_sf must be >= usable_sf (load factor < 1 is invalid)',
      error: {
        code: 'invalid_tool_input',
        message:
          'rentable_sf must be >= usable_sf (load factor < 1 is invalid)',
      },
    },
  })

  await expectJson({
    label: 'Invalid decimal input returns invalid_tool_input',
    path: '/api/v1/tools/boma-2024-calculator',
    body: {
      usable_sf: 'not-a-number',
      rentable_sf: '100000',
    },
    expectedStatus: 422,
    expectedBody: {
      detail: 'Input must be a finite decimal value',
      error: {
        code: 'invalid_tool_input',
        message: 'Input must be a finite decimal value',
      },
    },
  })

  await expectJson({
    label: 'HCAD adjustment above base year returns validation_error',
    path: '/api/v1/tools/hcad-tax-normalizer/calculate',
    body: {
      original_base_year_assessment: '100',
      retroactive_adjustment: '101',
      current_year_tax: '200',
      pro_rata_pct: '0.5',
    },
    expectedStatus: 422,
    expectedBody: {
      detail:
        'retroactive_adjustment cannot exceed original_base_year_assessment',
      error: {
        code: 'validation_error',
        message:
          'retroactive_adjustment cannot exceed original_base_year_assessment',
      },
    },
  })

  await expectJson({
    label: 'Fixed CAM too few years returns validation_error',
    path: '/api/v1/tools/fixed-cam-modeler',
    body: {
      years: [
        {
          year: 2026,
          total_operating_expenses: '1000',
          rentable_sf: '100',
        },
      ],
      fixed_cam_rate_per_sf: '10',
      annual_escalation_pct: '3',
      tenant_sqft: '50',
      pro_rata_share: '5',
    },
    expectedStatus: 422,
    expectedBody: {
      detail: 'Array must contain at least 3 element(s)',
      error: {
        code: 'validation_error',
        message: 'Array must contain at least 3 element(s)',
      },
    },
  })

  for (const path of [
    '/api/v1/tools/boma-2024-calculator',
    '/api/v1/tools/hcad-tax-normalizer/calculate',
    '/api/v1/tools/fixed-cam-modeler',
  ]) {
    await expectRawJson({
      label: `Malformed JSON returns invalid_json for ${path}`,
      path,
      rawBody: '{ not valid json',
      expectedStatus: 400,
      expectedBody: {
        detail: 'Request body must be valid JSON',
        error: {
          code: 'invalid_json',
          message: 'Request body must be valid JSON',
        },
      },
    })
  }
}

async function expectJson({ label, path, body, expectedStatus, expectedBody }) {
  return expectRawJson({
    label,
    path,
    rawBody: JSON.stringify(body),
    expectedStatus,
    expectedBody,
  })
}

async function expectRawJson({
  label,
  path,
  rawBody,
  expectedStatus,
  expectedBody,
}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: rawBody,
  })
  const text = await response.text()
  const actualBody = text ? parseJson(text) : null
  report.api_calls.push({
    method: 'POST',
    path,
    status: response.status,
  })
  const actual = { status: response.status, body: actualBody }
  const expected = { status: expectedStatus, body: expectedBody }
  const ok = stableJson(actual) === stableJson(expected)
  const item = { label, path, ok, actual, expected }
  report.checks.push(item)
  if (!ok) {
    throw new Error(
      `${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`
    )
  }
  return actualBody
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(
      `Expected JSON response, got ${text.slice(0, 500)}: ${errorMessage(error)}`
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
        .sort(([left], [right]) => left.localeCompare(right))
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
