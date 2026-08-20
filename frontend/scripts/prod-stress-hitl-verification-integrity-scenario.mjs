// Prod E2E stress scenario: LEASE-EXTRACTION -> HUMAN-VERIFICATION (HITL) ->
// COMMIT integrity, on LIVE prod (api.capveri.com).
//
// Scope (disjoint from prod-document-extraction-guards / prod-cross-doc-analysis):
//   H. Tampered/impossible field-value rejection on the approve (HITL commit)
//      endpoint -- negative pro_rata_share, out-of-range cap_rate/admin fee,
//      negative base_year_amount, cap_type requiring cap_rate with cap_rate
//      omitted, garbage base_year. All must be REJECTED (422/400), never
//      silently committed to leases.recovery_profile.
//   I. Idempotency -- double-approve of the SAME extraction. First call must
//      succeed (200, verified); the second call (submitted only after the
//      first response is observed) must be rejected with
//      invalid_document_state, never silently re-applied.
//   R. Concurrency -- true concurrent approve of the SAME ready_for_review
//      extraction (two in-flight requests, no wait between them). At most one
//      may succeed; if both succeed, that is a race defect (lost audit trail /
//      duplicate lease mutation). We also inspect verified_by/verified_at
//      after the dust settles to see which write "won".
//   G. Cross-party IDOR -- a tenant JWT (party=tenant, same org as the
//      landlord fixture) must NOT be able to read or approve a REAL landlord
//      extraction id via /api/v1/extractions/:id or PUT .../approve. Expect
//      403 (party guard fires before org-scope / document-state checks), not
//      404 or 200.
//   D. Draft-then-approve -- saving a draft with partial/off-schema profile
//      data must NOT bypass approve-time validation, and must NOT leak into
//      leases.recovery_profile (only /approve writes the canonical lease).
//
// COST NOTE: getting a document to `ready_for_review` requires one real
// extraction run (queues the actual dual-extract + judge LLM pipeline). This
// scenario runs that pipeline exactly ONCE (one small synthetic lease PDF) and
// reuses the resulting ready_for_review document for every check in H/I/R/G/D
// that needs a real extraction id, to keep LLM spend minimal.
//
// All created entities are prefixed "[PROD-TEST]" and cleaned up in `finally`.
// Run from frontend/:  node scripts/prod-stress-hitl-verification-integrity-scenario.mjs
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'

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
  'E2E_PROD_TENANT_EMAIL',
  'E2E_PROD_TENANT_PASSWORD',
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
  `prod-stress-hitl-verification-integrity-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  observations: [],
  cleanup: [],
}

let landlordToken
let tenantToken
try {
  landlordToken = await signIn('landlord', env.E2E_PROD_EMAIL, env.E2E_PROD_PASSWORD)
  tenantToken = await signIn('tenant', env.E2E_PROD_TENANT_EMAIL, env.E2E_PROD_TENANT_PASSWORD)
  await runScenario()
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok)
} catch (error) {
  report.fatal = errorMessage(error)
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
  const propertyName = `[PROD-TEST] HITL Integrity ${suffix}`
  const tenantName = `[PROD-TEST] HITL Integrity Tenant ${suffix}`
  const documentName = `prod-test-hitl-integrity-${suffix}.pdf`
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    documentId: null,
    documentName,
    documentStorageKey: null,
  }
  report.generated = { suffix, propertyName, tenantName, documentName }

  try {
    const property = await expectJson(landlordToken, '/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: propertyBody(propertyName),
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const unit = await expectJson(
      landlordToken,
      `/api/v1/properties/${property.id}/units`,
      {
        method: 'POST',
        status: 201,
        body: {
          unit_number: `HITL-${suffix.toUpperCase()}`,
          rentable_sqft: '2200.00',
          usable_sqft: '2000.00',
          floor: 3,
          status: 'occupied',
          space_type: 'office',
        },
      }
    )
    created.unitId = unit.id
    report.generated.unitId = unit.id

    const lease = await expectJson(landlordToken, '/api/v1/leases', {
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

    // ------------------------------------------------------------------
    // Drive ONE real extraction to ready_for_review (single LLM run reused
    // by every H/I/R/G/D check below).
    // ------------------------------------------------------------------
    const uploaded = await uploadDocument(landlordToken, {
      propertyId: property.id,
      leaseId: lease.id,
      fileName: documentName,
      pdfBytes: await leasePdfBytes({ propertyName, tenantName }),
    })
    created.documentId = uploaded.document_id
    report.generated.documentId = uploaded.document_id

    const initialDetail = await expectJson(
      landlordToken,
      `/api/v1/extractions/${uploaded.document_id}`,
      { status: 200 }
    )
    created.documentStorageKey = initialDetail.storage_key

    await expectJson(
      landlordToken,
      `/api/v1/extractions/${uploaded.document_id}/process`,
      { method: 'POST', status: 202, body: {} }
    )

    const readyDetail = await waitForReadyForReview(
      landlordToken,
      uploaded.document_id
    )
    check(
      'fixture extraction reaches ready_for_review',
      { status: readyDetail.status },
      { status: 'ready_for_review' }
    )

    await partH_tamperedValues(uploaded.document_id, lease.id)
    await partD_draftDoesNotLeak(uploaded.document_id, property.id)
    await partG_crossPartyIdor(uploaded.document_id)
    await partR_concurrentApprove(uploaded.document_id, lease.id, readyDetail)
    await partI_doubleApproveAfterCommit(uploaded.document_id, lease.id)
  } finally {
    await cleanup(created)
  }
}

// ---------------------------------------------------------------------------
// H: tampered / impossible field values on approve -- must be rejected
// ---------------------------------------------------------------------------
async function partH_tamperedValues(documentId, leaseId) {
  const cases = [
    {
      label: 'H1 negative pro_rata_share -> rejected',
      profile: recoveryProfile('-0.05'),
    },
    {
      label: 'H2 pro_rata_share > 1 (150%) -> rejected',
      profile: recoveryProfile('1.5'),
    },
    {
      label: 'H3 negative base_year_amount -> rejected',
      profile: { ...recoveryProfile('0.2000'), base_year_amount: '-1000.00' },
    },
    {
      label: 'H4 cap_type non_cumulative with cap_rate omitted -> rejected',
      profile: {
        ...recoveryProfile('0.2000'),
        cap_type: 'non_cumulative',
        cap_rate: null,
      },
    },
    {
      label: 'H5 cap_rate > 1 (250%) -> rejected',
      profile: {
        ...recoveryProfile('0.2000'),
        cap_type: 'cumulative',
        cap_rate: '2.5',
      },
    },
    {
      label: 'H6 admin_fee_percentage absurd (500%) -> rejected',
      profile: { ...recoveryProfile('0.2000'), admin_fee_percentage: '5.00' },
    },
    {
      label: 'H7 base_year out of sane range (year 3000) -> rejected',
      profile: { ...recoveryProfile('0.2000'), base_year: 3000 },
    },
    {
      label: 'H8 base_year_amount non-numeric garbage -> rejected',
      profile: { ...recoveryProfile('0.2000'), base_year_amount: 'not-a-number' },
    },
    {
      label: 'H9 pro_rata_share missing entirely -> rejected',
      profile: (() => {
        const p = recoveryProfile('0.2000')
        delete p.pro_rata_share
        return p
      })(),
    },
  ]

  for (const testCase of cases) {
    const response = await probe(landlordToken, 'PUT', `/api/v1/extractions/${documentId}/approve`, {
      body: { profile: testCase.profile, edit_history: [], lease_id: leaseId },
    })
    check(
      testCase.label,
      { status: response.status, code: errorCode(response.json), is_2xx: response.status >= 200 && response.status < 300 },
      { status: response.status >= 400 && response.status < 500 ? response.status : 'EXPECTED_4xx', code: errorCode(response.json), is_2xx: false }
    )
  }

  // Read-back: none of the tampered payloads above should have reached the
  // canonical lease. Verify recovery_profile is still the original.
  const leaseAfter = await expectJson(landlordToken, `/api/v1/leases/${leaseId}`, {
    status: 200,
  })
  check(
    'H10 read-back: tampered-value attempts did not mutate lease.recovery_profile',
    { pro_rata_share: leaseAfter.recovery_profile?.pro_rata_share },
    { pro_rata_share: '0.2000' }
  )

  // Document must still be ready_for_review (no partial commit / state churn
  // from the rejected attempts).
  const docAfter = await expectJson(landlordToken, `/api/v1/extractions/${documentId}`, {
    status: 200,
  })
  check(
    'H11 read-back: document still ready_for_review after all rejected approve attempts',
    { status: docAfter.status },
    { status: 'ready_for_review' }
  )
}

// ---------------------------------------------------------------------------
// D: draft save must not leak into canonical lease.recovery_profile
// ---------------------------------------------------------------------------
async function partD_draftDoesNotLeak(documentId, propertyId) {
  const draftResponse = await probe(landlordToken, 'PUT', `/api/v1/extractions/${documentId}/draft`, {
    body: {
      profile: {
        pro_rata_share: '0.9999',
        base_year_amount: '-99999.00',
        garbage_field: { nested: true },
      },
    },
  })
  check(
    'D1 draft save with off-schema/tampered values accepted (draft has no strict schema)',
    { status: draftResponse.status },
    { status: 200 }
  )

  const detail = await expectJson(landlordToken, `/api/v1/extractions/${documentId}`, {
    status: 200,
  })
  check(
    'D2 draft save does not flip document status away from ready_for_review',
    { status: detail.status },
    { status: 'ready_for_review' }
  )
  check(
    'D3 draft save does not set lease_id / verified_at (no canonical commit)',
    { verified_at: detail.verified_at, verified_by: detail.verified_by },
    { verified_at: null, verified_by: null }
  )
}

// ---------------------------------------------------------------------------
// G: cross-party IDOR on a REAL extraction id -- tenant must not read/approve
// ---------------------------------------------------------------------------
async function partG_crossPartyIdor(documentId) {
  const readAttempt = await probe(tenantToken, 'GET', `/api/v1/extractions/${documentId}`)
  check(
    'G1 tenant GET on real landlord extraction id -> 403 forbidden (party guard), not 404/200',
    { status: readAttempt.status, code: errorCode(readAttempt.json) },
    { status: 403, code: 'forbidden' }
  )

  const approveAttempt = await probe(tenantToken, 'PUT', `/api/v1/extractions/${documentId}/approve`, {
    body: {
      profile: recoveryProfile('0.9000'),
      edit_history: [],
    },
  })
  check(
    'G2 tenant PUT approve on real landlord extraction id -> 403 forbidden, no phantom commit',
    { status: approveAttempt.status, code: errorCode(approveAttempt.json) },
    { status: 403, code: 'forbidden' }
  )

  const listAttempt = await probe(tenantToken, 'GET', '/api/v1/extractions')
  check(
    'G3 tenant GET extractions list -> 403 forbidden (party guard on whole surface)',
    { status: listAttempt.status, code: errorCode(listAttempt.json) },
    { status: 403, code: 'forbidden' }
  )
}

// ---------------------------------------------------------------------------
// R: true concurrency -- two simultaneous approve calls on the same
//    ready_for_review extraction. At most one may win.
// ---------------------------------------------------------------------------
async function partR_concurrentApprove(documentId, leaseId, readyDetail) {
  const editHistoryFor = (newValue) => [
    {
      field: 'pro_rata_share',
      old_value: String(readyDetail.extraction_result?.profile?.pro_rata_share ?? ''),
      new_value: newValue,
      timestamp: new Date().toISOString(),
    },
  ]

  // Fire both requests without awaiting between them so they race at the DB.
  const [responseA, responseB] = await Promise.all([
    probe(landlordToken, 'PUT', `/api/v1/extractions/${documentId}/approve`, {
      body: {
        profile: recoveryProfile('0.2100'),
        lease_id: leaseId,
        edit_history: editHistoryFor('0.2100'),
      },
    }),
    probe(landlordToken, 'PUT', `/api/v1/extractions/${documentId}/approve`, {
      body: {
        profile: recoveryProfile('0.2200'),
        lease_id: leaseId,
        edit_history: editHistoryFor('0.2200'),
      },
    }),
  ])

  const successCount = [responseA, responseB].filter((r) => r.status === 200).length
  const rejectCount = [responseA, responseB].filter((r) => r.status === 400 || r.status === 409).length

  report.observations.push({
    label: 'R concurrent approve race outcome',
    responseA: { status: responseA.status, code: errorCode(responseA.json) },
    responseB: { status: responseB.status, code: errorCode(responseB.json) },
  })

  check(
    'R1 concurrent double-approve: exactly ONE of two simultaneous requests succeeds (200), the other is rejected (state guard wins the race)',
    { successCount, rejectCount },
    { successCount: 1, rejectCount: 1 }
  )

  const docAfterRace = await expectJson(landlordToken, `/api/v1/extractions/${documentId}`, {
    status: 200,
  })
  check(
    'R2 after race: document status is verified exactly once (not still ready_for_review, not corrupted)',
    { status: docAfterRace.status, has_verified_by: typeof docAfterRace.verified_by === 'string' },
    { status: 'verified', has_verified_by: true }
  )

  const leaseAfterRace = await expectJson(landlordToken, `/api/v1/leases/${leaseId}`, {
    status: 200,
  })
  const winningValue = responseA.status === 200 ? '0.2100' : responseB.status === 200 ? '0.2200' : null
  check(
    'R3 lease.recovery_profile reflects exactly the winning approve call\'s value (no interleaved/corrupted write)',
    { pro_rata_share: leaseAfterRace.recovery_profile?.pro_rata_share, matches_a_winner: leaseAfterRace.recovery_profile?.pro_rata_share === winningValue },
    { pro_rata_share: leaseAfterRace.recovery_profile?.pro_rata_share, matches_a_winner: true }
  )

  report.generated.raceWinner = winningValue
}

// ---------------------------------------------------------------------------
// I: idempotency -- approve AGAIN after the document is already verified
//    (sequential, post-race state from partR).
// ---------------------------------------------------------------------------
async function partI_doubleApproveAfterCommit(documentId, leaseId) {
  const secondApprove = await probe(landlordToken, 'PUT', `/api/v1/extractions/${documentId}/approve`, {
    body: {
      profile: recoveryProfile('0.9999'),
      lease_id: leaseId,
      edit_history: [],
    },
  })
  check(
    'I1 approve on an ALREADY-verified document -> invalid_document_state (400), never re-applies',
    { status: secondApprove.status, code: errorCode(secondApprove.json) },
    { status: 400, code: 'invalid_document_state' }
  )

  const leaseAfter = await expectJson(landlordToken, `/api/v1/leases/${leaseId}`, {
    status: 200,
  })
  check(
    'I2 read-back: post-verified re-approve attempt (0.9999) did not overwrite lease.recovery_profile',
    { pro_rata_share: leaseAfter.recovery_profile?.pro_rata_share },
    { pro_rata_share: report.generated.raceWinner }
  )

  const rejectAfterVerified = await probe(landlordToken, 'PUT', `/api/v1/extractions/${documentId}/reject`, {
    body: { reason: 'production_e2e_verified_state_guard', requeue: false },
  })
  check(
    'I3 reject on an ALREADY-verified document -> invalid_document_state, not a silent no-op success',
    { status: rejectAfterVerified.status, code: errorCode(rejectAfterVerified.json) },
    { status: 400, code: 'invalid_document_state' }
  )
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function propertyBody(name) {
  return {
    name,
    address_line1: '1103 Prod HITL Integrity Way',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    total_rentable_sqft: '20000.00',
    total_usable_sqft: '18000.00',
    common_area_sqft: '2000.00',
    target_occupancy: '0.95',
    boma_standard_version: '2024',
    fiscal_year_start_month: 1,
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

async function leasePdfBytes({ propertyName, tenantName }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 72 })
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const finished = new Promise((resolveFinished, reject) => {
    doc.on('end', () => resolveFinished(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  doc.fontSize(16).text('COMMERCIAL LEASE AGREEMENT', { align: 'center' })
  doc.moveDown()
  doc.fontSize(11)
  doc.text(`Property: ${propertyName}`)
  doc.text(`Tenant: ${tenantName}`)
  doc.text('Lease Term: January 1, 2026 through December 31, 2031')
  doc.moveDown()
  doc.text('ARTICLE 4 - COMMON AREA MAINTENANCE (CAM)')
  doc.text(
    "Tenant's Pro Rata Share of Operating Expenses shall be twenty percent (20.00%)."
  )
  doc.text('Base Year: 2025. Base Year Amount: $6,500.00.')
  doc.text('Administrative Fee: 1.5% of Operating Expenses.')
  doc.text('Management Fee Cap: 1.0% of Operating Expenses.')
  doc.text('No cap on annual increases applies to this lease (Cap Type: None).')
  doc.moveDown()
  doc.text('ARTICLE 7 - RENT')
  doc.text('Base Rent: $18.50 per rentable square foot per annum.')
  doc.end()
  return finished
}

async function uploadDocument(token, { propertyId, leaseId, fileName, pdfBytes }) {
  const form = new FormData()
  form.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName)
  const response = await fetch(
    `${apiUrl}/api/v1/documents/upload?property_id=${propertyId}&document_type=lease&lease_id=${leaseId}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      body: form,
    }
  )
  const text = await response.text()
  if (response.status !== 201) {
    throw new Error(
      `POST /api/v1/documents/upload returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function waitForReadyForReview(token, documentId) {
  const started = Date.now()
  let lastDetail = null
  while (Date.now() - started < 180_000) {
    const detail = await expectJson(token, `/api/v1/extractions/${documentId}`, {
      status: 200,
    })
    lastDetail = detail
    if (detail.status === 'ready_for_review') return detail
    if (['failed', 'rejected', 'verified'].includes(detail.status)) {
      throw new Error(
        `Extraction reached unexpected terminal status: ${JSON.stringify(detail).slice(0, 500)}`
      )
    }
    await sleep(3_000)
  }
  throw new Error(
    `Timed out waiting for extraction ${documentId}: ${JSON.stringify(lastDetail).slice(0, 500)}`
  )
}

async function cleanup(created) {
  const failures = []
  if (created.propertyId) {
    if (created.documentId && !created.documentStorageKey) {
      await attemptCleanup(failures, 'capture document storage key', async () => {
        const extraction = await expectJson(landlordToken, `/api/v1/extractions/${created.documentId}`, {
          status: 200,
        })
        created.documentStorageKey = extraction.storage_key
      })
    }
    await attemptCleanup(failures, 'delete property-scoped documents', async () => {
      const documents = await expectJson(
        landlordToken,
        `/api/v1/documents?property_id=${created.propertyId}&skip=0&limit=100`,
        { status: 200 }
      )
      const candidates = documents.filter(
        (item) => item.id === created.documentId || item.filename === created.documentName
      )
      for (const document of candidates) {
        await deleteEmpty(landlordToken, `/api/v1/documents/${document.id}`)
      }
    })
    await attemptCleanup(failures, 'verify no residual documents', async () => {
      const documents = await expectJson(
        landlordToken,
        `/api/v1/documents?property_id=${created.propertyId}&skip=0&limit=100`,
        { status: 200 }
      )
      const ok = Array.isArray(documents) && documents.length === 0
      report.cleanup.push({
        path: `/api/v1/documents?property_id=${created.propertyId}`,
        ok,
        body_preview: JSON.stringify({ item_count: documents.length }),
      })
      if (!ok) throw new Error('Documents still present after delete')
    })
  }
  if (created.leaseId) {
    await attemptCleanup(failures, 'delete lease', () =>
      deleteEmpty(landlordToken, `/api/v1/leases/${created.leaseId}`)
    )
  }
  if (created.unitId && created.propertyId) {
    await attemptCleanup(failures, 'delete unit', () =>
      deleteEmpty(landlordToken, `/api/v1/properties/${created.propertyId}/units/${created.unitId}`)
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(landlordToken, `/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify property deleted', async () => {
      const response = await probe(landlordToken, 'GET', `/api/v1/properties/${created.propertyId}`)
      const ok = response.status === 404
      report.cleanup.push({ path: `/api/v1/properties/${created.propertyId}`, ok, status: response.status })
      if (!ok) throw new Error(`Expected 404 after property delete, got ${response.status}`)
    })
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

async function probe(token, method, path, { body } = {}) {
  const headers = { accept: 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, json: parseJsonOrNull(text), text }
}

async function expectJson(token, path, options) {
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

async function deleteEmpty(token, path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) {
    throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
  }
}

async function signIn(party, email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed for ${party}: ${JSON.stringify(json)}`)
  }
  report.generated[`${party}UserId`] = json.user?.id ?? null
  return json.access_token
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
}

function errorCode(json) {
  return json?.error?.code ?? null
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

function parseJsonOrNull(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
