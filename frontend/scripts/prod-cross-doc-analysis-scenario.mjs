import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'

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
const documentsR2Bucket =
  env.E2E_PROD_DOCUMENTS_R2_BUCKET?.trim() || 'capveri-documents'
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-cross-doc-analysis-${runId}`
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
  await assertBackendSupportsTerminalDocumentDelete()
  await runScenario()
  report.ok =
    report.checks.every((checkItem) => checkItem.ok) &&
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
  const periodYear = 2026
  const periodStart = `${periodYear}-01-01`
  const periodEnd = `${periodYear}-12-31`
  const propertyName = `[PROD-TEST] Cross Doc Tower ${suffix}`
  const unitNumber = `CrossDoc-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Cross Doc Tenant ${suffix}`
  const documentName = `prod-cross-doc-lease-${suffix}.pdf`
  const glFileName = `cross-doc-gl-${suffix}.csv`
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    documentId: null,
    documentStorageKey: null,
    batchId: null,
    poolIds: [],
    mappingIds: [],
    crossDocAnalysisId: null,
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    documentName,
    glFileName,
    periodYear,
    periodStart,
    periodEnd,
    poolIds: created.poolIds,
    mappingIds: created.mappingIds,
    crossDocAnalysisAbsenceExpected: { periodYear },
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '980 Prod Cross Doc Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78712',
        total_rentable_sqft: '20000.00',
        total_usable_sqft: '18000.00',
        common_area_sqft: '2000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id
    report.generated.crossDocAnalysisAbsenceExpected.propertyId = property.id

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: unitNumber,
        rentable_sqft: '4000.00',
        usable_sqft: '3600.00',
        floor: 9,
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
        recovery_profile: recoveryProfile('12500.00'),
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const uploadedDocument = await uploadDocument({
      propertyId: property.id,
      leaseId: lease.id,
      fileName: documentName,
      pdfBytes: await leasePdfBytes({
        propertyName,
        unitNumber,
        tenantName,
      }),
    })
    created.documentId = uploadedDocument.document_id
    report.generated.documentId = uploadedDocument.document_id
    check(
      'cross-doc fixture uploads lease document',
      {
        status: uploadedDocument.status,
        has_document_id:
          typeof uploadedDocument.document_id === 'string' &&
          uploadedDocument.document_id.length > 0,
      },
      { status: 'pending', has_document_id: true }
    )

    const initialDetail = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}`,
      { status: 200 }
    )
    created.documentStorageKey = initialDetail.storage_key
    report.generated.documentStorageKey = initialDetail.storage_key
    check(
      'cross-doc fixture document starts pending with storage key',
      {
        id: initialDetail.id,
        status: initialDetail.status,
        property_id: initialDetail.property_id,
        lease_id: initialDetail.lease_id,
        storage_key_contains_property:
          typeof initialDetail.storage_key === 'string' &&
          initialDetail.storage_key.includes(`/${property.id}/`),
      },
      {
        id: uploadedDocument.document_id,
        status: 'pending',
        property_id: property.id,
        lease_id: lease.id,
        storage_key_contains_property: true,
      }
    )

    const processResponse = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}/process`,
      { method: 'POST', status: 202, body: {} }
    )
    report.generated.extractionJobId = processResponse.job_id
    check(
      'cross-doc fixture queues lease extraction',
      {
        success: processResponse.success,
        document_id: processResponse.document_id,
        status: processResponse.status,
        has_job_id:
          typeof processResponse.job_id === 'string' &&
          processResponse.job_id.length > 0,
      },
      {
        success: true,
        document_id: uploadedDocument.document_id,
        status: 'processing',
        has_job_id: true,
      }
    )

    const readyDetail = await waitForReadyForReview(
      uploadedDocument.document_id
    )
    check(
      'cross-doc fixture reaches ready_for_review',
      {
        id: readyDetail.id,
        status: readyDetail.status,
        has_profile: Boolean(readyDetail.extraction_result?.profile),
      },
      {
        id: uploadedDocument.document_id,
        status: 'ready_for_review',
        has_profile: true,
      }
    )

    const approved = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}/approve`,
      {
        method: 'PUT',
        status: 200,
        body: {
          profile: recoveryProfile('12500.00'),
          lease_id: lease.id,
          edit_history: [
            {
              field: 'base_year_amount',
              old_value: String(
                readyDetail.extraction_result?.profile?.base_year_amount ?? ''
              ),
              new_value: '12500.00',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }
    )
    check('cross-doc fixture approves lease extraction', approved, {
      success: true,
      lease_id: lease.id,
    })

    const verifiedDetail = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}`,
      { status: 200 }
    )
    check(
      'cross-doc fixture document is verified for assembler',
      {
        id: verifiedDetail.id,
        status: verifiedDetail.status,
        lease_id: verifiedDetail.lease_id,
        verified_at_present:
          typeof verifiedDetail.verified_at === 'string' &&
          verifiedDetail.verified_at.length > 0,
      },
      {
        id: uploadedDocument.document_id,
        status: 'verified',
        lease_id: lease.id,
        verified_at_present: true,
      }
    )

    const poolsByKey = new Map()
    for (const poolInput of [
      {
        key: 'repairs',
        name: `[PROD-TEST] CrossDoc Repairs ${suffix}`,
        pool_type: 'operating',
        pattern: '61*',
        grossUp: false,
      },
      {
        key: 'management',
        name: `[PROD-TEST] CrossDoc Management ${suffix}`,
        pool_type: 'operating',
        pattern: '62*',
        grossUp: false,
      },
      {
        key: 'capital',
        name: `[PROD-TEST] CrossDoc Capital ${suffix}`,
        pool_type: 'capital',
        pattern: '15*',
        grossUp: false,
      },
    ]) {
      const pool = await expectJson(
        `/api/v1/properties/${property.id}/expense-pools`,
        {
          method: 'POST',
          status: 201,
          body: {
            name: poolInput.name,
            pool_type: poolInput.pool_type,
            is_gross_up_applicable: poolInput.grossUp,
            gross_up_target: null,
            description: `Production E2E cross-doc ${poolInput.key} pool`,
          },
        }
      )
      poolsByKey.set(poolInput.key, pool)
      created.poolIds.push(pool.id)

      const mapping = await expectJson(
        `/api/v1/properties/${property.id}/pool-mappings`,
        {
          method: 'POST',
          status: 201,
          body: {
            expense_pool_id: pool.id,
            gl_account_pattern: poolInput.pattern,
            allocation_percentage: '1',
            priority: 10,
          },
        }
      )
      created.mappingIds.push(mapping.id)
    }

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName: glFileName,
      sourceOverride: 'yardi',
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Repairs,01/10/2025,10000.00,FixCo,Prior year repairs',
        '6200,Management Fees,02/10/2025,5000.00,ManagerCo,Prior management fee',
        '6100,Repairs,01/10/2026,15000.00,FixCo,Current repairs',
        '6200,Management Fees,02/10/2026,25000.00,ManagerCo,Management fee exceeds normal threshold',
        '1500,Building Improvements,03/10/2026,90000.00,BuildCo,Capital roof project in CAM package',
      ].join('\n'),
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'cross-doc fixture uploads prior and current GL rows',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 5,
        error_count: 0,
      }
    )

    const manualBilled = await expectJson('/api/v1/actual-billed/manual', {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        total_billed: '42000.00',
        lease_id: lease.id,
        tenant_name: tenantName,
        pool_id: poolsByKey.get('management').id,
      },
    })
    report.generated.actualBilledIds = [manualBilled.id]
    check(
      'cross-doc fixture creates CAM statement data',
      {
        property_id: manualBilled.property_id,
        total_billed: String(manualBilled.total_billed),
        total_billed_number: Number(manualBilled.total_billed),
        pool_id: manualBilled.pool_id,
      },
      {
        property_id: property.id,
        total_billed: '42000',
        total_billed_number: 42000,
        pool_id: poolsByKey.get('management').id,
      }
    )

    const noAnalysis = await expectStatus(
      `/api/v1/properties/${property.id}/cross-doc-analysis/${periodYear}`,
      { status: 404, recordCleanup: false }
    )
    check(
      'cross-doc latest returns 404 before generation',
      {
        status: noAnalysis.status,
        error_code: noAnalysis.json?.error?.code,
      },
      { status: 404, error_code: 'not_found' }
    )

    const override = await expectJson(
      `/api/v1/properties/${property.id}/auditor-overrides`,
      {
        method: 'PATCH',
        status: 200,
        body: {
          known_exceptions: [],
          special_instructions: [
            'This production E2E fixture intentionally includes a high management fee, a capital account, and billed CAM statement data that should be reviewed together.',
          ],
          suppressed_finding_categories: [],
        },
      }
    )
    check(
      'cross-doc property auditor override accepts fixture context',
      override,
      {
        status: 'ok',
      }
    )

    const analysis = await expectJson(
      `/api/v1/properties/${property.id}/cross-doc-analysis`,
      {
        method: 'POST',
        status: 201,
        body: { period_year: periodYear },
      }
    )
    check(
      'cross-doc analysis returns model result with findings',
      normalizeAnalysisResult(analysis, {
        periodYear,
      }),
      {
        property_id: property.id,
        period_year: periodYear,
        findings_nonempty: true,
        risk_score_valid: true,
        summary_present: true,
        documents_analyzed_has_lease: true,
        documents_analyzed_has_gl: true,
        token_usage_positive: true,
        semantic_mentions_management_fee: true,
        semantic_mentions_capital_roof_project: true,
        semantic_mentions_cam_statement: true,
        semantic_mentions_lease_terms: true,
        semantic_mentions_generated_period: true,
      }
    )

    const latest = await expectJson(
      `/api/v1/properties/${property.id}/cross-doc-analysis/${periodYear}`,
      { status: 200 }
    )
    created.crossDocAnalysisId = latest.id
    report.generated.crossDocAnalysisId = latest.id
    const firstFindingId = latest.findings?.findings?.[0]?.id
    check(
      'cross-doc latest persists the generated analysis',
      {
        property_id: latest.property_id,
        period_year: latest.period_year,
        status: latest.status,
        token_usage_positive: Number(latest.token_usage) > 0,
        finding_count: latest.findings?.findings?.length ?? 0,
        first_finding_has_uuid:
          typeof firstFindingId === 'string' && firstFindingId.length > 0,
      },
      {
        property_id: property.id,
        period_year: periodYear,
        status: 'pending',
        token_usage_positive: true,
        finding_count: analysis.findings.length,
        first_finding_has_uuid: true,
      }
    )

    const decision = await expectJson(
      `/api/v1/cross-doc-analysis/${latest.id}/findings/${firstFindingId}`,
      {
        method: 'PATCH',
        status: 200,
        body: {
          decision: 'accepted',
          reason: 'Production E2E accepted the first generated finding.',
        },
      }
    )
    check('cross-doc finding decision persists', decision, {
      status: 'ok',
      decision: 'accepted',
    })

    const afterDecision = await expectJson(
      `/api/v1/properties/${property.id}/cross-doc-analysis/${periodYear}`,
      { status: 200 }
    )
    check(
      'cross-doc latest records finding decision and advances status',
      {
        status: afterDecision.status,
        decision_recorded:
          afterDecision.finding_decisions?.[firstFindingId]?.decision ?? null,
      },
      {
        status: analysis.findings.length === 1 ? 'reviewed' : 'in_review',
        decision_recorded: 'accepted',
      }
    )
  } finally {
    await cleanup(created, { periodStart, periodEnd, periodYear })
  }
}

function normalizeAnalysisResult(result, context) {
  const semanticCoverage = semanticAnalysisCoverage(result, context)
  return {
    property_id: result.property_id,
    period_year: result.period_year,
    findings_nonempty:
      Array.isArray(result.findings) && result.findings.length > 0,
    risk_score_valid:
      Number.isFinite(result.overall_risk_score) &&
      result.overall_risk_score >= 0 &&
      result.overall_risk_score <= 100,
    summary_present:
      typeof result.analysis_summary === 'string' &&
      result.analysis_summary.length > 0,
    documents_analyzed_has_lease:
      Number(result.documents_analyzed?.leases) >= 1,
    documents_analyzed_has_gl:
      Number(result.documents_analyzed?.gl_accounts) >= 1,
    token_usage_positive: Number(result.token_usage) > 0,
    ...semanticCoverage,
  }
}

function semanticAnalysisCoverage(result, context) {
  const findingsText = normalizeSearchText(result.findings)
  const fullText = normalizeSearchText({
    summary: result.analysis_summary,
    findings: result.findings,
  })
  return {
    semantic_mentions_management_fee:
      hasAll(findingsText, ['management', 'fee']) &&
      hasAny(findingsText, ['25000', '25,000', 'threshold', 'high', 'exceeds']),
    semantic_mentions_capital_roof_project:
      hasAny(findingsText, ['capital', 'capex', 'non-operating']) &&
      hasAny(findingsText, ['roof', 'building improvements', '1500', '90000']),
    semantic_mentions_cam_statement:
      hasAny(fullText, ['statement', 'billed', 'billing', 'actual billed']) &&
      hasAny(fullText, ['42000', '42,000', 'actual billed']),
    semantic_mentions_lease_terms:
      hasAny(fullText, ['base year', 'base_year', '12500', '12,500']) &&
      hasAny(fullText, ['pro-rata', 'pro rata', '20.00', '20%']),
    semantic_mentions_generated_period: fullText.includes(
      String(context.periodYear)
    ),
  }
}

function normalizeSearchText(value) {
  return JSON.stringify(value ?? '')
    .toLowerCase()
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
}

function hasAll(text, needles) {
  return needles.every((needle) => text.includes(needle))
}

function hasAny(text, needles) {
  return needles.some((needle) => text.includes(needle))
}

async function cleanup(created, period) {
  const failures = []
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete actual billed rows', () =>
      deleteActualBilledRows(created.propertyId, period)
    )
    await attemptCleanup(failures, 'verify actual billed rows deleted', () =>
      expectDeletedBillingRows(created.propertyId, period)
    )
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
  if (created.documentId) {
    await attemptCleanup(failures, 'delete verified lease document', () =>
      deleteEmpty(`/api/v1/documents/${created.documentId}`)
    )
    await attemptCleanup(failures, 'verify document deleted', () =>
      expectStatus(`/api/v1/documents/${created.documentId}`, { status: 404 })
    )
  }
  if (created.documentStorageKey) {
    await attemptCleanup(failures, 'verify document R2 object deleted', () =>
      expectDocumentR2ObjectMissing(created.documentStorageKey)
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
    for (const mappingId of [...created.mappingIds].reverse()) {
      await attemptCleanup(failures, `delete pool mapping ${mappingId}`, () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/pool-mappings/${mappingId}`
        )
      )
    }
    await attemptCleanup(failures, 'verify pool mappings deleted', () =>
      expectNoPoolMappings(created.propertyId)
    )
    for (const poolId of [...created.poolIds].reverse()) {
      await attemptCleanup(failures, `delete expense pool ${poolId}`, () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`
        )
      )
      await attemptCleanup(
        failures,
        `verify expense pool deleted ${poolId}`,
        () =>
          expectStatus(
            `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`,
            { status: 404 }
          )
      )
    }
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
    await attemptCleanup(
      failures,
      'verify cross-doc analysis absent after property delete',
      () => expectCrossDocAnalysisMissing(created.propertyId, period.periodYear)
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function assertBackendSupportsTerminalDocumentDelete() {
  const response = await fetch(`${apiUrl}/health`, {
    headers: { accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(`GET /health returned ${response.status}: ${text}`)
  }
  const body = text ? JSON.parse(text) : null
  check(
    'backend supports terminal document delete capability',
    {
      status: body?.status ?? null,
      environment: body?.environment ?? null,
      terminal_document_delete:
        body?.capabilities?.terminal_document_delete ?? null,
    },
    {
      status: 'healthy',
      environment: 'production',
      terminal_document_delete: true,
    }
  )
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

async function uploadDocument({ propertyId, leaseId, fileName, pdfBytes }) {
  const form = new FormData()
  form.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName)
  const response = await fetch(
    `${apiUrl}/api/v1/documents/upload?property_id=${encodeURIComponent(propertyId)}&document_type=lease&lease_id=${encodeURIComponent(leaseId)}`,
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

async function waitForReadyForReview(documentId) {
  const started = Date.now()
  let lastDetail = null
  while (Date.now() - started < 180_000) {
    const detail = await expectJson(`/api/v1/extractions/${documentId}`, {
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

async function deleteActualBilledRows(propertyId, period) {
  const response = await fetch(
    `${apiUrl}/api/v1/actual-billed/${propertyId}?period_start=${period.periodStart}&period_end=${period.periodEnd}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    }
  )
  const text = await response.text()
  const ok = response.status === 200
  report.cleanup.push({
    path: `/api/v1/actual-billed/${propertyId}`,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `DELETE /api/v1/actual-billed/${propertyId} returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
}

async function expectDeletedBillingRows(propertyId, period) {
  const list = await expectJson(
    `/api/v1/actual-billed/${propertyId}?period_start=${period.periodStart}&period_end=${period.periodEnd}`,
    { status: 200 }
  )
  const ok =
    list.total_billed === '0' &&
    Array.isArray(list.items) &&
    list.items.length === 0
  report.cleanup.push({
    path: `/api/v1/actual-billed/${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      total_billed: list.total_billed,
      item_count: list.items?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Actual billed rows still present after delete: ${JSON.stringify(list).slice(0, 500)}`
    )
  }
}

async function expectNoPoolMappings(propertyId) {
  const response = await expectJson(
    `/api/v1/properties/${propertyId}/pool-mappings?skip=0&limit=100`,
    { status: 200 }
  )
  const ok =
    response.count === 0 &&
    Array.isArray(response.data) &&
    response.data.length === 0
  report.cleanup.push({
    path: `/api/v1/properties/${propertyId}/pool-mappings`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      count: response.count,
      item_count: response.data?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Pool mappings still present after delete: ${JSON.stringify(response).slice(0, 500)}`
    )
  }
}

async function expectCrossDocAnalysisMissing(propertyId, periodYear) {
  const result = await expectStatus(
    `/api/v1/properties/${propertyId}/cross-doc-analysis/${periodYear}`,
    { status: 404 }
  )
  const ok = result.json?.error?.code === 'not_found'
  report.cleanup.push({
    path: `/api/v1/properties/${propertyId}/cross-doc-analysis/${periodYear}`,
    status: result.status,
    ok,
    body_preview: JSON.stringify(result.json).slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `Cross-doc analysis still present after property delete: ${JSON.stringify(result.json).slice(0, 500)}`
    )
  }
}

async function expectDocumentR2ObjectMissing(storageKey) {
  const objectPath = `${documentsR2Bucket}/${storageKey}`
  const result = await getR2Object(objectPath)
  const ok = result.missing === true
  report.cleanup.push({
    path: `r2://${objectPath}`,
    status: ok ? 404 : 200,
    ok,
    body_preview: ok
      ? 'object missing'
      : `object still present (${result.byteLength} bytes)`,
  })
  if (!ok) {
    throw new Error(
      `Document R2 object still existed after delete: ${objectPath}`
    )
  }
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
  if (options.recordCleanup !== false) {
    report.cleanup.push({
      path,
      status: response.status,
      ok,
      expected_status: options.status,
      body_preview: text.slice(0, 200),
    })
  }
  if (!ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return {
    status: response.status,
    text,
    json: text ? JSON.parse(text) : null,
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

function recoveryProfile(baseYearAmount) {
  return {
    base_year: 2025,
    base_year_amount: baseYearAmount,
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

async function leasePdfBytes({ propertyName, unitNumber, tenantName }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 72 })
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const finished = new Promise((resolveFinished, reject) => {
    doc.on('end', resolveFinished)
    doc.on('error', reject)
  })
  doc.fontSize(16).text('Commercial Lease Agreement')
  doc.moveDown()
  doc.fontSize(11).text(`Property: ${propertyName}`)
  doc.text(`Premises: Suite ${unitNumber}`)
  doc.text(`Tenant: ${tenantName}`)
  doc.text('Lease term: January 1, 2026 through December 31, 2031.')
  doc.text('Base year: calendar year 2025.')
  doc.text('Base year amount: $12,500.00.')
  doc.text('Tenant pro-rata share: 20.00%.')
  doc.text('Administrative fee: 1.50% of recoverable operating expenses.')
  doc.text('Management fee: 1.00% of recoverable operating expenses.')
  doc.text('Expense cap: no cap applies to operating expense recoveries.')
  doc.text('Gross-up base year: no gross-up applies.')
  doc.text('Excluded pools: none.')
  doc.end()
  await finished
  return Buffer.concat(chunks)
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

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}

function npxBinary() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function bufferToString(value) {
  if (!value) return ''
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
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
