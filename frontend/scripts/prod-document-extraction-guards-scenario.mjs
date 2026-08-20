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
const documentsR2Bucket =
  env.E2E_PROD_DOCUMENTS_R2_BUCKET?.trim() || 'capveri-documents'
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-document-extraction-guards-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
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
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Extraction Guard Tower ${suffix}`
  const unitNumber = `Guard-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Extraction Guard Tenant ${suffix}`
  const documentName = `prod-test-extraction-guards-${suffix}.pdf`
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    documentId: null,
    documentName,
    documentStorageKey: null,
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    documentName,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '820 Prod Extraction Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78709',
        total_rentable_sqft: '9000.00',
        total_usable_sqft: '8100.00',
        common_area_sqft: '900.00',
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
        rentable_sqft: '1800.00',
        usable_sqft: '1600.00',
        floor: 8,
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
        recovery_profile: recoveryProfile('0.2000'),
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const wrongType = await uploadDocumentStatus({
      propertyId: property.id,
      leaseId: lease.id,
      fileName: `not-a-pdf-${suffix}.txt`,
      bytes: new TextEncoder().encode('not a pdf'),
      contentType: 'text/plain',
      expectedStatus: 400,
    })
    check(
      'document upload rejects non-pdf content type before persistence',
      {
        status: wrongType.status,
        code: wrongType.json?.error?.code,
        detail_has_type: wrongType.json?.detail?.includes('Only PDF files'),
      },
      {
        status: 400,
        code: 'invalid_file_type',
        detail_has_type: true,
      }
    )

    const badPdf = await uploadDocumentStatus({
      propertyId: property.id,
      leaseId: lease.id,
      fileName: `bad-pdf-${suffix}.pdf`,
      bytes: new TextEncoder().encode('not actually a pdf'),
      contentType: 'application/pdf',
      expectedStatus: 400,
    })
    check(
      'document upload rejects invalid pdf bytes before persistence',
      {
        status: badPdf.status,
        code: badPdf.json?.error?.code,
        detail_has_invalid_pdf: badPdf.json?.detail?.includes(
          'invalid magic bytes'
        ),
      },
      {
        status: 400,
        code: 'invalid_pdf',
        detail_has_invalid_pdf: true,
      }
    )

    const uploadedDocument = await uploadDocument({
      propertyId: property.id,
      leaseId: lease.id,
      fileName: documentName,
      pdfBytes: minimalPdfBytes({
        title: 'CapVeri extraction guard fixture',
        tenantName,
      }),
    })
    created.documentId = uploadedDocument.document_id
    report.generated.documentId = uploadedDocument.document_id
    check(
      'document upload creates pending extraction fixture',
      {
        status: uploadedDocument.status,
        has_document_id:
          typeof uploadedDocument.document_id === 'string' &&
          uploadedDocument.document_id.length > 0,
      },
      {
        status: 'pending',
        has_document_id: true,
      }
    )

    const extraction = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}`,
      { status: 200 }
    )
    created.documentStorageKey = extraction.storage_key
    report.generated.documentStorageKey = extraction.storage_key
    check(
      'pending extraction detail exposes signed file URL and storage key',
      {
        id: extraction.id,
        status: extraction.status,
        property_id: extraction.property_id,
        lease_id: extraction.lease_id,
        storage_bucket: extraction.storage_bucket,
        storage_key_matches_property:
          typeof extraction.storage_key === 'string' &&
          extraction.storage_key.includes(`/${property.id}/`),
        has_document_url:
          typeof extraction.document_url === 'string' &&
          extraction.document_url.includes('/api/v1/document-files/'),
      },
      {
        id: uploadedDocument.document_id,
        status: 'pending',
        property_id: property.id,
        lease_id: lease.id,
        storage_bucket: 'DOCUMENTS_BUCKET',
        storage_key_matches_property: true,
        has_document_url: true,
      }
    )

    const invalidSignature = await expectAbsoluteStatus(
      withQueryParam(extraction.document_url, 'signature', '0'.repeat(64)),
      {
        status: 403,
      }
    )
    check(
      'signed document URL rejects invalid signature',
      {
        status: invalidSignature.status,
        code: invalidSignature.json?.error?.code,
      },
      {
        status: 403,
        code: 'invalid_document_signature',
      }
    )

    const expired = await expectAbsoluteStatus(
      withQueryParam(extraction.document_url, 'expires', '1'),
      {
        status: 403,
      }
    )
    check(
      'signed document URL rejects expired links before storage access',
      {
        status: expired.status,
        code: expired.json?.error?.code,
      },
      {
        status: 403,
        code: 'document_url_expired',
      }
    )

    const draftGuard = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}/draft`,
      {
        method: 'PUT',
        status: 400,
        body: {
          profile: {
            tenant_name: tenantName,
            base_year_amount: '7000.00',
          },
        },
      }
    )
    const approveGuard = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}/approve`,
      {
        method: 'PUT',
        status: 400,
        body: {
          profile: recoveryProfile('0.2100'),
          edit_history: [
            {
              field: 'pro_rata_share',
              old_value: '0.2000',
              new_value: '0.2100',
              timestamp: new Date().toISOString(),
            },
          ],
          lease_id: lease.id,
        },
      }
    )
    const rejectGuard = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}/reject`,
      {
        method: 'PUT',
        status: 400,
        body: {
          reason: 'production_e2e_pending_state_guard',
          notes: 'Pending documents should not be rejectable before review.',
          requeue: false,
        },
      }
    )
    check(
      'pending extraction rejects draft approve and reject transitions',
      {
        draft_code: draftGuard.error?.code,
        approve_code: approveGuard.error?.code,
        reject_code: rejectGuard.error?.code,
        draft_detail: draftGuard.detail,
        approve_detail: approveGuard.detail,
        reject_detail: rejectGuard.detail,
      },
      {
        draft_code: 'invalid_document_state',
        approve_code: 'invalid_document_state',
        reject_code: 'invalid_document_state',
        draft_detail:
          'Document must be READY_FOR_REVIEW. Current status: pending',
        approve_detail:
          'Document must be READY_FOR_REVIEW. Current status: pending',
        reject_detail:
          'Document must be READY_FOR_REVIEW. Current status: pending',
      }
    )

    const afterGuards = await expectJson(
      `/api/v1/documents/${uploadedDocument.document_id}`,
      { status: 200 }
    )
    check(
      'failed extraction transitions leave document pending',
      {
        id: afterGuards.id,
        status: afterGuards.status,
        filename: afterGuards.filename,
      },
      {
        id: uploadedDocument.document_id,
        status: 'pending',
        filename: documentName,
      }
    )
  } finally {
    await cleanup(created)
  }
}

function recoveryProfile(proRataShare) {
  return {
    base_year: 2025,
    base_year_amount: '6500.00',
    gross_up_base_year: false,
    pro_rata_share: proRataShare,
    cap_type: 'none',
    cap_rate: null,
    admin_fee_percentage: '0.015',
    management_fee_percentage: '0.010',
    excluded_pools: [],
    base_year_adjustments: [],
  }
}

async function uploadDocument({ propertyId, leaseId, fileName, pdfBytes }) {
  const response = await uploadDocumentStatus({
    propertyId,
    leaseId,
    fileName,
    bytes: pdfBytes,
    contentType: 'application/pdf',
    expectedStatus: 201,
  })
  return response.json
}

async function uploadDocumentStatus({
  propertyId,
  leaseId,
  fileName,
  bytes,
  contentType,
  expectedStatus,
}) {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: contentType }), fileName)
  const response = await fetch(
    `${apiUrl}/api/v1/documents/upload?property_id=${propertyId}&document_type=lease&lease_id=${leaseId}`,
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
  if (response.status !== expectedStatus) {
    throw new Error(
      `POST /api/v1/documents/upload returned ${response.status}, expected ${expectedStatus}: ${text.slice(0, 500)}`
    )
  }
  return {
    status: response.status,
    json: parseJsonOrNull(text),
    text,
  }
}

async function cleanup(created) {
  const failures = []
  if (created.propertyId) {
    if (created.documentId && !created.documentStorageKey) {
      await attemptCleanup(
        failures,
        'capture document R2 key for cleanup',
        () => captureDocumentStorageKey(created)
      )
    }
    await attemptCleanup(failures, 'delete property-scoped documents', () =>
      deleteMatchingDocuments(created)
    )
    await attemptCleanup(failures, 'verify documents deleted', () =>
      expectNoDocuments(created.propertyId)
    )
    if (created.documentStorageKey) {
      await attemptCleanup(failures, 'verify document R2 object deleted', () =>
        expectR2ObjectMissing(created.documentStorageKey)
      )
    }
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

async function captureDocumentStorageKey(created) {
  const extraction = await expectJson(
    `/api/v1/extractions/${created.documentId}`,
    { status: 200 }
  )
  if (typeof extraction.storage_key !== 'string' || !extraction.storage_key) {
    throw new Error('Extraction detail did not include a storage key')
  }
  created.documentStorageKey = extraction.storage_key
  report.generated.documentStorageKey = extraction.storage_key
  report.cleanup.push({
    path: `/api/v1/extractions/${created.documentId}`,
    status: 200,
    ok: true,
    body_preview: JSON.stringify({ storage_key_present: true }),
  })
}

async function deleteMatchingDocuments(created) {
  const documents = await expectJson(
    `/api/v1/documents?property_id=${created.propertyId}&skip=0&limit=100`,
    { status: 200 }
  )
  const candidates = documents.filter(
    (item) =>
      item.id === created.documentId || item.filename === created.documentName
  )
  for (const document of candidates) {
    await deleteEmpty(`/api/v1/documents/${document.id}`)
    await expectStatus(`/api/v1/documents/${document.id}`, { status: 404 })
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

async function expectR2ObjectMissing(storageKey) {
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
    }
  )
  report.cleanup.push({
    path: `r2://${objectPath}`,
    status: 204,
    ok: true,
    body_preview: 'deleted directly after product-route cleanup miss',
  })
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

async function expectAbsoluteStatus(url, options) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `GET ${redactDocumentUrl(url)} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return {
    status: response.status,
    json: parseJsonOrNull(text),
    text,
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

function minimalPdfBytes({ title, tenantName }) {
  const body = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj',
    `4 0 obj << /Length 92 >> stream\nBT /F1 12 Tf 72 720 Td (${title}) Tj 0 -20 Td (${tenantName}) Tj ET\nendstream endobj`,
    'xref',
    '0 5',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000204 00000 n ',
    'trailer << /Size 5 /Root 1 0 R >>',
    'startxref',
    '347',
    '%%EOF',
  ].join('\n')
  return new TextEncoder().encode(body)
}

function withQueryParam(url, name, value) {
  const parsed = new URL(url)
  parsed.searchParams.set(name, value)
  return parsed.toString()
}

function redactDocumentUrl(url) {
  const parsed = new URL(url)
  if (parsed.searchParams.has('signature')) {
    parsed.searchParams.set('signature', '[redacted]')
  }
  return parsed.toString()
}

function parseJsonOrNull(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
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
  return 'npx'
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
