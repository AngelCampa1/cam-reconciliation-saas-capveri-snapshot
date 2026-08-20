import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')
const execFileAsync = promisify(execFile)

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
const documentsR2Bucket =
  env.E2E_PROD_DOCUMENTS_R2_BUCKET?.trim() || 'capveri-documents'
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-document-multitype-lifecycle-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {},
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
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Document Multitype Tower ${suffix}`
  const unitNumber = `Docs-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Document Multitype Tenant ${suffix}`
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    documents: [],
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    documentIds: [],
    documentNames: [],
    documentStorageKeys: [],
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '1430 Prod Document Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78712',
        total_rentable_sqft: '14000.00',
        total_usable_sqft: '12600.00',
        common_area_sqft: '1400.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: unitNumber,
        rentable_sqft: '2800.00',
        usable_sqft: '2520.00',
        floor: 14,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitId = unit.id
    report.generated.unitId = unit.id

    const lease = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: tenantName,
        start_date: '2026-01-01',
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: recoveryProfile(),
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const documentInputs = [
      {
        type: 'lease',
        fileName: `prod-test-lease-${suffix}.pdf`,
        title: 'Commercial Lease Agreement',
        includeLeaseId: true,
      },
      {
        type: 'amendment',
        fileName: `prod-test-amendment-${suffix}.pdf`,
        title: 'First Amendment to Lease',
        includeLeaseId: true,
      },
      {
        type: 'other',
        fileName: `prod-test-supporting-memo-${suffix}.pdf`,
        title: 'Supporting CAM Memo',
        includeLeaseId: false,
      },
    ]

    for (const input of documentInputs) {
      const uploaded = await uploadDocument({
        propertyId: property.id,
        leaseId: input.includeLeaseId ? lease.id : null,
        documentType: input.type,
        fileName: input.fileName,
        pdfBytes: minimalPdfBytes({
          title: input.title,
          propertyName,
          tenantName,
        }),
      })
      const createdDocument = {
        id: uploaded.document_id,
        filename: input.fileName,
        documentType: input.type,
        storageKey: null,
      }
      created.documents.push(createdDocument)
      report.generated.documentIds.push(uploaded.document_id)
      report.generated.documentNames.push(input.fileName)
      if (!report.generated.documentId) {
        report.generated.documentId = uploaded.document_id
      }

      const detail = await getDocumentDetail(uploaded.document_id, input.type)
      createdDocument.storageKey = detail.storage_key ?? null
      if (detail.storage_key) {
        report.generated.documentStorageKeys.push(detail.storage_key)
      }
      check(
        `document upload creates pending ${input.type} fixture`,
        {
          status: uploaded.status,
          detail_status: detail.status,
          filename: detail.filename,
          property_id: detail.property_id,
          lease_id: detail.lease_id ?? (input.includeLeaseId ? lease.id : null),
          storage_key_scoped:
            detail.storage_key === null ||
            storageKeyMatchesProperty(detail.storage_key, property.id),
        },
        {
          status: 'pending',
          detail_status: 'pending',
          filename: input.fileName,
          property_id: property.id,
          lease_id: input.includeLeaseId ? lease.id : null,
          storage_key_scoped: true,
        }
      )
    }

    await verifyDocumentList({
      propertyId: property.id,
      documents: created.documents,
    })
    await verifyExtractionList(created.documents)
    await verifyUnsupportedExtractionDetail(created.documents)
  } finally {
    await cleanup(created)
  }
}

async function getDocumentDetail(documentId, documentType) {
  if (['lease', 'amendment'].includes(documentType)) {
    return expectJson(`/api/v1/extractions/${documentId}`, { status: 200 })
  }
  const document = await expectJson(`/api/v1/documents/${documentId}`, {
    status: 200,
  })
  return {
    id: document.id,
    filename: document.filename,
    status: document.status,
    property_id: document.property_id,
    lease_id: null,
    storage_key: null,
  }
}

async function verifyDocumentList({ propertyId, documents }) {
  const listed = await expectJson(
    `/api/v1/documents?property_id=${propertyId}&skip=0&limit=100`,
    { status: 200 }
  )
  const rows = listed
    .filter((row) => documents.some((document) => document.id === row.id))
    .map((row) => ({
      id: row.id,
      filename: row.filename,
      document_type: row.document_type,
      status: row.status,
      property_id: row.property_id,
      content_type: row.content_type,
      file_size_positive: row.file_size_bytes > 0,
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  const expected = documents
    .map((document) => ({
      id: document.id,
      filename: document.filename,
      document_type: document.documentType,
      status: 'pending',
      property_id: propertyId,
      content_type: 'application/pdf',
      file_size_positive: true,
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  check('document list returns all generated document types', rows, expected)
}

async function verifyExtractionList(documents) {
  const extractionPage = await expectJson(
    '/api/v1/extractions?page=1&page_size=50&status=pending',
    { status: 200 }
  )
  const generatedRows = extractionPage.items
    .filter((row) => documents.some((document) => document.id === row.id))
    .map((row) => ({
      id: row.id,
      filename: row.filename,
      status: row.status,
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  const expectedRows = documents
    .filter((document) =>
      ['lease', 'amendment'].includes(document.documentType)
    )
    .map((document) => ({
      id: document.id,
      filename: document.filename,
      status: 'pending',
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  check(
    'extraction pending list excludes generated non-extraction documents',
    generatedRows,
    expectedRows
  )
}

async function verifyUnsupportedExtractionDetail(documents) {
  const unsupported = documents.find(
    (document) => document.documentType === 'other'
  )
  if (!unsupported) throw new Error('Missing generated non-extraction document')
  const response = await expectJson(`/api/v1/extractions/${unsupported.id}`, {
    status: 400,
  })
  check(
    'non-extraction document type is rejected by extraction detail route',
    {
      error_code: response.error?.code,
      detail: response.detail,
    },
    {
      error_code: 'invalid_document_state',
      detail:
        'Extraction workflow is only available for lease or amendment documents',
    }
  )
}

async function uploadDocument({
  propertyId,
  leaseId,
  documentType,
  fileName,
  pdfBytes,
}) {
  const form = new FormData()
  form.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName)
  const query = new URLSearchParams({
    property_id: propertyId,
    document_type: documentType,
  })
  if (leaseId) query.set('lease_id', leaseId)
  const response = await fetch(
    `${apiUrl}/api/v1/documents/upload?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      body: form,
    }
  )
  const text = await response.text()
  if (response.status !== 201) {
    throw new Error(
      `POST /api/v1/documents/upload returned ${response.status}, expected 201: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function cleanup(created) {
  const failures = []
  for (const document of [...created.documents].reverse()) {
    const deleteOk = await attemptCleanup(
      failures,
      `delete document ${document.filename}`,
      () => deleteEmpty(`/api/v1/documents/${document.id}`)
    )
    const verifyDeletedOk = await attemptCleanup(
      failures,
      `verify document deleted ${document.filename}`,
      () => expectStatus(`/api/v1/documents/${document.id}`, { status: 404 })
    )
    if (document.storageKey && deleteOk && verifyDeletedOk) {
      await attemptCleanup(
        failures,
        `verify document R2 object deleted ${document.filename}`,
        () =>
          expectR2ObjectMissing({
            storageKey: document.storageKey,
            propertyId: created.propertyId,
          })
      )
    }
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'verify property documents absent', () =>
      expectNoDocuments(created.propertyId)
    )
  }
  if (created.leaseId) {
    await attemptCleanup(failures, 'delete lease', () =>
      deleteEmpty(`/api/v1/leases/${created.leaseId}`)
    )
    await attemptCleanup(failures, 'verify lease deleted', () =>
      expectStatus(`/api/v1/leases/${created.leaseId}`, { status: 404 })
    )
  }
  if (created.unitId && created.propertyId) {
    await attemptCleanup(failures, 'delete unit', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`
      )
    )
    await attemptCleanup(failures, 'verify unit deleted', () =>
      expectStatus(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function expectNoDocuments(propertyId) {
  const documents = await expectJson(
    `/api/v1/documents?property_id=${propertyId}&skip=0&limit=100`,
    { status: 200 }
  )
  const ok = Array.isArray(documents) && documents.length === 0
  report.cleanup.push({
    path: `/api/v1/documents?property_id=${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({ item_count: documents.length }),
  })
  if (!ok) {
    throw new Error(
      `Documents still present after delete: ${JSON.stringify(documents).slice(0, 500)}`
    )
  }
}

async function expectR2ObjectMissing({ storageKey, propertyId }) {
  assertStorageKeyScopedToProperty(storageKey, propertyId)
  const objectPath = `${documentsR2Bucket}/${storageKey}`
  const result = await getR2Object(objectPath)
  if (result.missing) {
    report.cleanup.push({
      path: `r2://${objectPath}`,
      status: 404,
      ok: true,
      body_preview: 'object missing',
    })
    return
  }
  report.cleanup.push({
    path: `r2://${objectPath}`,
    status: 200,
    ok: false,
    body_preview: `object still present (${result.byteLength} bytes)`,
  })
  await deleteR2Object(objectPath)
  throw new Error(
    `R2 object still existed after document delete: ${objectPath}`
  )
}

async function getR2Object(objectPath) {
  try {
    const { stdout } = await execFileAsync(
      npxBinary(),
      ['wrangler', 'r2', 'object', 'get', objectPath, '--remote', '--pipe'],
      {
        cwd: frontendRoot,
        encoding: null,
        maxBuffer: 1024 * 1024,
        shell: process.platform === 'win32',
        timeout: 60_000,
      }
    )
    return { missing: false, byteLength: stdout.byteLength }
  } catch (error) {
    const stderr = bufferToString(error.stderr)
    if (stderr.includes('The specified key does not exist')) {
      return { missing: true, byteLength: 0 }
    }
    throw new Error(
      `R2 get failed for ${objectPath}: ${stderr || errorMessage(error)}`
    )
  }
}

async function deleteR2Object(objectPath) {
  await execFileAsync(
    npxBinary(),
    ['wrangler', 'r2', 'object', 'delete', objectPath, '--remote', '--force'],
    {
      cwd: frontendRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      shell: process.platform === 'win32',
      timeout: 60_000,
    }
  )
  report.cleanup.push({
    path: `r2://${objectPath}`,
    status: 204,
    ok: true,
    body_preview: 'deleted directly after product-route cleanup miss',
  })
}

function assertStorageKeyScopedToProperty(storageKey, propertyId) {
  if (!storageKeyMatchesProperty(storageKey, propertyId)) {
    throw new Error(
      `Refusing direct R2 cleanup for storage key outside generated property scope: ${storageKey}`
    )
  }
}

function storageKeyMatchesProperty(storageKey, propertyId) {
  return (
    typeof storageKey === 'string' &&
    /^[0-9a-f-]+\/[0-9a-f-]+\//iu.test(storageKey) &&
    storageKey.includes(`/${propertyId}/`) &&
    !storageKey.includes('..')
  )
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
    return true
  } catch (error) {
    failures.push(`${label}: ${errorMessage(error)}`)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
    return false
  }
}

async function deleteEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  const text = await response.text()
  const ok = response.status === 204 || response.status === 404
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(`DELETE ${path} returned ${response.status}: ${text}`)
  }
}

async function expectStatus(path, options) {
  const response = await fetch(`${apiUrl}${path}`, { headers: authHeaders() })
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
      `GET ${path} returned ${response.status}, expected ${options.status}: ${text}`
    )
  }
}

async function expectJson(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...authHeaders(),
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

function recoveryProfile() {
  return {
    base_year: 2025,
    base_year_amount: '7100.00',
    gross_up_base_year: false,
    pro_rata_share: '0.2000',
    cap_type: 'none',
    cap_rate: null,
    admin_fee_percentage: '0.015',
    management_fee_percentage: '0.010',
    excluded_pools: [],
    base_year_adjustments: [],
  }
}

function minimalPdfBytes({ title, propertyName, tenantName }) {
  const lines = [
    title,
    `Property: ${propertyName}`,
    `Tenant: ${tenantName}`,
    'Base year: 2025.',
    'Base year amount: $7,100.00.',
    'Tenant pro-rata share: 20.00%.',
  ]
  const text = lines.join(' | ').replace(/[()\\]/gu, '')
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const body = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    'xref',
    '0 5',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000204 00000 n ',
    'trailer << /Size 5 /Root 1 0 R >>',
    'startxref',
    String(260 + stream.length),
    '%%EOF',
  ].join('\n')
  return new TextEncoder().encode(body)
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

function authHeaders() {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function bufferToString(value) {
  if (!value) return ''
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
}

function npxBinary() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
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
