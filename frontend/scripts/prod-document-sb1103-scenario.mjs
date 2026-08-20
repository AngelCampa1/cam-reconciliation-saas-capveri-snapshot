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
  `prod-document-sb1103-${runId}`
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
  const propertyName = `[PROD-TEST] Docs Compliance Tower ${suffix}`
  const unitNumber = `Suite-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Compliance Tenant ${suffix}`
  const documentName = `prod-test-lease-${suffix}.pdf`
  const glFileName = `sb1103-gl-prod-stress-${suffix}.csv`
  const requestEmail = `tenant-${suffix}@example.com`
  const requestDate = '2026-06-26'
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    documentId: null,
    documentStorageKey: null,
    sb1103RequestId: null,
    batchId: null,
    documentName,
    requestEmail,
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    documentName,
    glFileName,
    requestEmail,
    requestDate,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '600 Prod Stress Way',
        city: 'Los Angeles',
        state: 'CA',
        postal_code: '90017',
        total_rentable_sqft: '12000.00',
        total_usable_sqft: '10800.00',
        common_area_sqft: '1200.00',
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
        rentable_sqft: '3000.00',
        usable_sqft: '2700.00',
        floor: 6,
        status: 'occupied',
        space_type: 'retail',
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
        start_date: '2025-01-01',
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: {
          base_year: 2025,
          base_year_amount: '2500.00',
          gross_up_base_year: false,
          pro_rata_share: '0.25',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.05',
          management_fee_percentage: '0',
          excluded_pools: [],
          base_year_adjustments: [],
        },
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const uploadedDocument = await uploadDocument({
      propertyId: property.id,
      leaseId: lease.id,
      fileName: documentName,
      pdfBytes: minimalPdfBytes({
        title: 'CapVeri production E2E lease fixture',
        tenantName,
      }),
    })
    created.documentId = uploadedDocument.document_id
    report.generated.documentId = uploadedDocument.document_id
    check(
      'document upload creates pending lease document',
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

    const document = await expectJson(
      `/api/v1/documents/${uploadedDocument.document_id}`,
      { status: 200 }
    )
    check(
      'document detail exposes uploaded metadata',
      {
        id: document.id,
        property_id: document.property_id,
        filename: document.filename,
        content_type: document.content_type,
        document_type: document.document_type,
        status: document.status,
        file_size_gt_100: document.file_size_bytes > 100,
      },
      {
        id: uploadedDocument.document_id,
        property_id: property.id,
        filename: documentName,
        content_type: 'application/pdf',
        document_type: 'lease',
        status: 'pending',
        file_size_gt_100: true,
      }
    )

    const documents = await expectJson(
      `/api/v1/documents?property_id=${property.id}&status=pending&skip=0&limit=10`,
      { status: 200 }
    )
    check(
      'document list filters to uploaded fixture',
      {
        count: documents.length,
        ids: documents.map((item) => item.id),
        filenames: documents.map((item) => item.filename),
      },
      {
        count: 1,
        ids: [uploadedDocument.document_id],
        filenames: [documentName],
      }
    )

    const extraction = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}`,
      { status: 200 }
    )
    created.documentStorageKey = extraction.storage_key
    report.generated.documentStorageKey = extraction.storage_key
    check(
      'extraction detail provides redacted signed document access',
      {
        id: extraction.id,
        status: extraction.status,
        storage_bucket: extraction.storage_bucket,
        storage_key_matches_property:
          typeof extraction.storage_key === 'string' &&
          extraction.storage_key.includes(`/${property.id}/`),
        property_id: extraction.property_id,
        lease_id: extraction.lease_id,
        content_type: extraction.content_type,
        has_document_url:
          typeof extraction.document_url === 'string' &&
          extraction.document_url.includes('/api/v1/document-files/'),
      },
      {
        id: uploadedDocument.document_id,
        status: 'pending',
        storage_bucket: 'DOCUMENTS_BUCKET',
        storage_key_matches_property: true,
        property_id: property.id,
        lease_id: lease.id,
        content_type: 'application/pdf',
        has_document_url: true,
      }
    )

    const documentFile = await expectAbsoluteBinary(extraction.document_url, {
      status: 200,
      contentTypePrefix: 'application/pdf',
      recordPath: `/api/v1/document-files/${uploadedDocument.document_id}?signature=[redacted]`,
    })
    check(
      'signed document URL streams uploaded PDF bytes',
      {
        status: documentFile.status,
        content_type: documentFile.content_type,
        starts_with_pdf: documentFile.starts_with_pdf,
        byte_length_gt_100: documentFile.byte_length > 100,
      },
      {
        status: 200,
        content_type: 'application/pdf',
        starts_with_pdf: true,
        byte_length_gt_100: true,
      }
    )

    const glUpload = await uploadCsv({
      propertyId: property.id,
      fileName: glFileName,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Janitorial,02/10/2026,1000.02,CleanCo,SB1103 janitorial',
        '6200,Security,03/15/2026,499.99,SecureCo,SB1103 security',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = glUpload.batch_id
    report.generated.batchId = glUpload.batch_id
    check(
      'sb1103 gl upload creates export source rows',
      {
        source_system: glUpload.source_system,
        row_count: glUpload.row_count,
        error_count: glUpload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 2,
        error_count: 0,
      }
    )

    const request = await expectJson('/api/v1/compliance/sb1103', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        lease_id: lease.id,
        requested_by_name: `[PROD-TEST] Requestor ${suffix}`,
        requested_by_email: requestEmail,
        request_date: requestDate,
        notes: 'Production E2E disposable SB1103 request',
      },
    })
    created.sb1103RequestId = request.id
    report.generated.sb1103RequestId = request.id
    check(
      'sb1103 request creates expected compliance window',
      {
        property_id: request.property_id,
        lease_id: request.lease_id,
        requested_by_email: request.requested_by_email,
        request_date: request.request_date,
        response_deadline: request.response_deadline,
        window_start_date: request.window_start_date,
        window_end_date: request.window_end_date,
        status: request.status,
      },
      {
        property_id: property.id,
        lease_id: lease.id,
        requested_by_email: requestEmail,
        request_date: requestDate,
        response_deadline: '2026-07-26',
        window_start_date: '2024-12-26',
        window_end_date: requestDate,
        status: 'pending',
      }
    )

    const updated = await expectJson(
      `/api/v1/compliance/sb1103/${request.id}`,
      {
        method: 'PATCH',
        status: 200,
        body: { notes: 'Production E2E updated SB1103 note' },
      }
    )
    check(
      'sb1103 patch updates notes without changing status',
      {
        id: updated.id,
        status: updated.status,
        notes: updated.notes,
      },
      {
        id: request.id,
        status: 'pending',
        notes: 'Production E2E updated SB1103 note',
      }
    )

    const list = await expectJson(
      `/api/v1/compliance/sb1103?property_id=${property.id}&status=pending`,
      { status: 200 }
    )
    check(
      'sb1103 list filters to generated request',
      {
        count: list.count,
        ids: list.data.map((item) => item.id),
      },
      {
        count: 1,
        ids: [request.id],
      }
    )

    const exportPacket = await expectBinary(
      `/api/v1/compliance/sb1103/${request.id}/export?format=both`,
      {
        method: 'POST',
        status: 200,
        contentTypePrefix: 'application/zip',
      }
    )
    check(
      'sb1103 both export streams zip without R2 storage',
      {
        status: exportPacket.status,
        content_type: exportPacket.content_type,
        content_disposition_has_zip:
          exportPacket.content_disposition.includes('.zip"'),
        starts_with_zip: exportPacket.starts_with_zip,
        byte_length_gt_1000: exportPacket.byte_length > 1000,
      },
      {
        status: 200,
        content_type: 'application/zip',
        content_disposition_has_zip: true,
        starts_with_zip: true,
        byte_length_gt_1000: true,
      }
    )

    const exported = await expectJson(
      `/api/v1/compliance/sb1103/${request.id}`,
      { status: 200 }
    )
    check(
      'sb1103 export marks request exported',
      {
        id: exported.id,
        status: exported.status,
        export_format: exported.export_format,
        has_exported_at:
          typeof exported.exported_at === 'string' &&
          exported.exported_at.length > 0,
      },
      {
        id: request.id,
        status: 'exported',
        export_format: 'both',
        has_exported_at: true,
      }
    )
  } finally {
    await cleanup(created)
  }
}

async function uploadDocument({ propertyId, leaseId, fileName, pdfBytes }) {
  const form = new FormData()
  form.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName)
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
  if (response.status !== 201) {
    throw new Error(
      `POST /api/v1/documents/upload returned ${response.status}, expected 201: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function uploadCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)

  const response = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
    body: form,
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(
      `POST /api/v1/ingestion/upload returned ${response.status}, expected 200: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function cleanup(created) {
  const failures = []
  if (created.propertyId) {
    await attemptCleanup(
      failures,
      'delete property-scoped sb1103 requests',
      () => deleteMatchingSb1103Requests(created)
    )
    await attemptCleanup(failures, 'verify sb1103 requests deleted', () =>
      expectNoSb1103Requests(created.propertyId)
    )
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
  if (created.batchId) {
    await attemptCleanup(failures, 'delete ingestion batch', () =>
      deleteEmpty(`/api/v1/ingestion/batches/${created.batchId}`)
    )
    await attemptCleanup(failures, 'verify ingestion batch deleted', () =>
      expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
        status: 404,
      })
    )
  }
  if (created.leaseId) {
    await attemptCleanup(failures, 'delete lease', () =>
      deleteEmpty(`/api/v1/leases/${created.leaseId}`)
    )
  }
  if (created.unitId && created.propertyId) {
    await attemptCleanup(failures, 'delete unit', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`
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

async function deleteMatchingSb1103Requests(created) {
  const list = await expectJson(
    `/api/v1/compliance/sb1103?property_id=${created.propertyId}`,
    { status: 200 }
  )
  const candidates = list.data.filter(
    (item) =>
      item.id === created.sb1103RequestId ||
      item.requested_by_email === created.requestEmail
  )
  for (const item of candidates) {
    await deleteEmpty(`/api/v1/compliance/sb1103/${item.id}`)
  }
}

async function expectNoSb1103Requests(propertyId) {
  const list = await expectJson(
    `/api/v1/compliance/sb1103?property_id=${propertyId}`,
    {
      status: 200,
    }
  )
  const ok =
    list.count === 0 && Array.isArray(list.data) && list.data.length === 0
  report.cleanup.push({
    path: `/api/v1/compliance/sb1103?property_id=${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      count: list.count,
      item_count: list.data?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `SB1103 requests still present after delete: ${JSON.stringify(list).slice(0, 500)}`
    )
  }
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

async function expectBinary(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: options.contentTypePrefix,
    },
  })
  return binaryResult({
    response,
    path,
    options,
  })
}

async function expectAbsoluteBinary(url, options) {
  const response = await fetch(url, {
    headers: { accept: options.contentTypePrefix },
  })
  return binaryResult({
    response,
    path: options.recordPath,
    options,
  })
}

async function binaryResult({ response, path, options }) {
  const bytes = new Uint8Array(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${new TextDecoder().decode(bytes.slice(0, 500))}`
    )
  }
  if (!contentType.startsWith(options.contentTypePrefix)) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned content-type ${contentType}, expected ${options.contentTypePrefix}`
    )
  }
  return {
    status: response.status,
    content_type: contentType,
    content_disposition: response.headers.get('content-disposition') ?? '',
    byte_length: bytes.byteLength,
    starts_with_pdf: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
    starts_with_zip: bytes[0] === 0x50 && bytes[1] === 0x4b,
  }
}

async function expectStatus(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
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
