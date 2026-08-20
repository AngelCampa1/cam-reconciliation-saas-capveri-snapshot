import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
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
const reportsR2Bucket =
  env.E2E_PROD_REPORTS_R2_BUCKET?.trim() || 'capveri-reports'
const documentsR2Bucket =
  env.E2E_PROD_DOCUMENTS_R2_BUCKET?.trim() || 'capveri-documents'
const outputRunId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-cleanup-audit-${outputRunId}`
)
await mkdir(outputDir, { recursive: true })

const reportRoots = reportRootInputs().map((root) => resolve(root))
const report = {
  ok: false,
  run_id: outputRunId,
  output_dir: outputDir,
  report_roots: reportRoots,
  source_reports: [],
  source_failures: [],
  source_check_counts: {},
  checks: [],
  auth: {},
}

let token
let tenantToken
try {
  const session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }

  const reportFiles = await findReportFiles(reportRoots)
  for (const file of reportFiles) {
    if (file.includes('prod-cleanup-audit-')) continue
    await auditSourceReport(file)
  }

  report.ok =
    report.source_reports.length > 0 &&
    report.source_failures.length === 0 &&
    report.checks.length > 0 &&
    report.checks.every((check) => check.ok)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(summarizeReport(report), null, 2))
}

if (!report.ok) process.exitCode = 1

function reportRootInputs() {
  const raw = env.PROD_CLEANUP_AUDIT_REPORT_ROOTS?.trim()
  if (!raw) return [resolve(repoRoot, 'e2e-adhoc')]
  return raw
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function auditSourceReport(file) {
  const source = JSON.parse(await readFile(file, 'utf8'))
  const generated = source.generated ?? {}
  const sourceLabel = dirname(file).split(/[\\/]/u).at(-1) ?? file
  const initialCheckCount = report.checks.length
  const propertyIds = generatedIds(generated.propertyId, generated.propertyIds)
  const primaryPropertyId = propertyIds[0]
  report.source_reports.push(sourceLabel)
  if (source.ok !== true) {
    report.source_failures.push({
      source: sourceLabel,
      path: file,
      ok: source.ok ?? null,
      failed_checks: Array.isArray(source.checks)
        ? source.checks
            .filter((check) => check?.ok === false)
            .map((check) => check.label ?? null)
        : null,
      failure_reason: source.failure_reason ?? source.error ?? null,
    })
  }
  if (generated.negativeNoPersistentIdsExpected === true) {
    const persistentIds = generatedIds(
      generated.persistentId,
      generated.persistentIdsCreated
    )
    report.checks.push({
      source: sourceLabel,
      label: 'negative scenario created no persistent ids',
      ok: persistentIds.length === 0,
      actual: persistentIds,
      expected: [],
    })
  }

  for (const propertyId of propertyIds) {
    await expectStatus(
      sourceLabel,
      'property deleted',
      `/api/v1/properties/${propertyId}`,
      [404]
    )
  }
  if (generated.templateId) {
    await expectStatus(
      sourceLabel,
      'pool template deleted',
      `/api/v1/pool-templates/${generated.templateId}`,
      [404]
    )
  }
  for (const leaseId of generatedIds(generated.leaseId, generated.leaseIds)) {
    await expectStatus(
      sourceLabel,
      'lease deleted',
      `/api/v1/leases/${leaseId}`,
      [404]
    )
    for (const termVersionId of generatedIds(
      generated.termVersionId,
      generated.termVersionIds
    )) {
      await expectStatus(
        sourceLabel,
        'lease term version deleted',
        `/api/v1/leases/${leaseId}/term-versions/${termVersionId}`,
        [404]
      )
    }
  }
  for (const unitId of generatedIds(generated.unitId, generated.unitIds)) {
    if (!primaryPropertyId) continue
    await expectStatus(
      sourceLabel,
      'unit deleted',
      `/api/v1/properties/${primaryPropertyId}/units/${unitId}`,
      [404]
    )
  }
  if (generated.batchId) {
    await expectStatus(
      sourceLabel,
      'ingestion batch deleted',
      `/api/v1/ingestion/batches/${generated.batchId}`,
      [404]
    )
  }
  if (generated.poolId && generated.propertyId) {
    await expectStatus(
      sourceLabel,
      'expense pool deleted',
      `/api/v1/properties/${generated.propertyId}/expense-pools/${generated.poolId}`,
      [404]
    )
  }
  if (Array.isArray(generated.poolIds) && generated.propertyId) {
    for (const poolId of generated.poolIds) {
      if (typeof poolId !== 'string') continue
      await expectStatus(
        sourceLabel,
        'expense pool deleted',
        `/api/v1/properties/${generated.propertyId}/expense-pools/${poolId}`,
        [404]
      )
    }
  }
  for (const [propertyId, poolIds] of Object.entries(
    generated.poolIdsByProperty ?? {}
  )) {
    if (!Array.isArray(poolIds)) continue
    for (const poolId of poolIds) {
      if (typeof poolId !== 'string') continue
      await expectStatus(
        sourceLabel,
        'expense pool deleted',
        `/api/v1/properties/${propertyId}/expense-pools/${poolId}`,
        [404]
      )
    }
  }
  const poolAllocationIds = generatedIds(
    generated.poolAllocationId,
    generated.poolAllocationIds
  )
  for (const allocationId of poolAllocationIds) {
    if (!primaryPropertyId) continue
    await expectStatus(
      sourceLabel,
      'pool allocation deleted',
      `/api/v1/properties/${primaryPropertyId}/pool-allocations/${allocationId}`,
      [404]
    )
  }
  const sourcePoolId = firstGeneratedId(generated.poolId, generated.poolIds)
  if (primaryPropertyId && sourcePoolId && poolAllocationIds.length > 0) {
    await expectListEmptyOrNotFound(
      sourceLabel,
      'pool allocations absent by source pool',
      `/api/v1/properties/${primaryPropertyId}/pool-allocations?source_pool_id=${sourcePoolId}&skip=0&limit=100`
    )
  }
  if (generated.mappingId && generated.propertyId) {
    await expectPoolMappingsAbsent(
      sourceLabel,
      generated.propertyId,
      firstGeneratedId(generated.poolId, generated.poolIds)
    )
  }
  if (Array.isArray(generated.mappingIds) && generated.propertyId) {
    const poolIds = generatedIds(generated.poolId, generated.poolIds)
    for (const poolId of poolIds) {
      await expectPoolMappingsAbsent(sourceLabel, generated.propertyId, poolId)
    }
    if (poolIds.length === 0) {
      await expectPoolMappingsAbsent(sourceLabel, generated.propertyId, null)
    }
  }
  for (const documentId of generatedIds(
    generated.documentId,
    generated.documentIds
  )) {
    await expectStatus(
      sourceLabel,
      'document deleted',
      `/api/v1/documents/${documentId}`,
      [404]
    )
  }
  for (const documentStorageKey of generatedIds(
    generated.documentStorageKey,
    generated.documentStorageKeys
  )) {
    await expectDocumentR2ObjectMissing(sourceLabel, documentStorageKey)
  }
  if (generated.sb1103RequestId) {
    await expectStatus(
      sourceLabel,
      'sb1103 request deleted',
      `/api/v1/compliance/sb1103/${generated.sb1103RequestId}`,
      [404]
    )
  }
  for (const jobId of generatedIds(generated.jobId, generated.jobIds)) {
    await expectStatus(
      sourceLabel,
      'calculation job deleted',
      `/api/v1/reconciliation/jobs/${jobId}`,
      [404]
    )
  }
  for (const snapshotId of generatedIds(
    generated.currentSnapshotId,
    generated.snapshotIds
  )) {
    await expectStatus(
      sourceLabel,
      'reconciliation snapshot deleted',
      `/api/v1/reconciliation/snapshots/${snapshotId}?include_trace=false`,
      [404]
    )
  }
  if (generated.extractionJobId) {
    await expectStatus(
      sourceLabel,
      'extraction job deleted',
      `/api/v1/extractions/jobs/${generated.extractionJobId}`,
      [404]
    )
  }
  for (const exportHistoryId of generatedIds(
    generated.exportHistoryId,
    generated.exportHistoryIds
  )) {
    await expectStatus(
      sourceLabel,
      'export history deleted',
      `/api/v1/export/download/${exportHistoryId}`,
      [404]
    )
  }
  for (const exportStoragePath of generatedIds(
    generated.exportStoragePath,
    generated.exportStoragePaths
  )) {
    await expectReportR2ObjectMissing(sourceLabel, exportStoragePath)
  }
  if (generated.propertyId && generated.periodStart && generated.periodEnd) {
    await expectListEmptyOrNotFound(
      sourceLabel,
      'snapshots absent',
      `/api/v1/reconciliation/snapshots?property_id=${generated.propertyId}&period_start=${generated.periodStart}&period_end=${generated.periodEnd}&page=1&size=10`
    )
    await expectListEmptyOrNotFound(
      sourceLabel,
      'actual billed absent',
      `/api/v1/actual-billed/${generated.propertyId}?period_start=${generated.periodStart}&period_end=${generated.periodEnd}`
    )
  }
  const actualBilledIds = generatedIds(
    generated.manualActualBilledId,
    generated.actualBilledIds
  )
  if (actualBilledIds.length > 0) {
    await expectActualBilledRowsAbsent(sourceLabel, generated, actualBilledIds)
  }
  if (generated.organizationSettingsExpected) {
    await expectOrganizationSettingsRestored(
      sourceLabel,
      generated.organizationSettingsExpected
    )
  }
  if (generated.readOnlyNoPersistentWrites) {
    expectReadOnlyReportHasNoPersistentWrites(sourceLabel, source)
  }
  if (generated.invalidNoopProbeCleanupExpected) {
    expectInvalidNoopProbeCleanup(sourceLabel, source)
  }
  if (generated.publicToolPureComputeExpected) {
    expectPublicToolPureComputeCleanup(sourceLabel, source)
  }
  if (generated.tenantPreferencesRestoredExpected) {
    expectTenantPreferencesRestored(sourceLabel, source)
  }
  if (generated.negativeNoPersistentIdsExpected) {
    expectNegativeReportHasNoPersistentIds(sourceLabel, source)
  }
  if (generated.teamInvitationCleanupExpected) {
    await expectTeamInvitationRevoked(sourceLabel, generated)
  }
  if (generated.adminDisputeFixtureCleanupExpected) {
    await expectAdminDisputeFixtureAuthUsersDeleted(
      sourceLabel,
      source,
      generated
    )
  }
  if (generated.feedback_id || generated.screenshot_storage_path) {
    await expectFeedbackCleanup(sourceLabel, generated)
  }
  for (const disputeId of generatedIds(
    generated.disputeId,
    generated.disputeIds
  )) {
    if (generated.tenantDisputeCleanupExpected) {
      await expectTenantStatus(
        sourceLabel,
        'tenant dispute deleted',
        `/api/v1/tenant/disputes/${disputeId}`,
        [404]
      )
    }
    await expectStatus(
      sourceLabel,
      'dispute deleted',
      `/api/v1/disputes/${disputeId}`,
      [404]
    )
    for (const attachmentId of generatedIds(
      generated.disputeAttachmentId,
      generated.disputeAttachmentIds
    )) {
      await expectStatus(
        sourceLabel,
        'dispute attachment deleted',
        `/api/v1/disputes/${disputeId}/attachments/${attachmentId}`,
        [404]
      )
    }
  }
  for (const disputeAttachmentStoragePath of generatedIds(
    generated.disputeAttachmentStoragePath,
    generated.disputeAttachmentStoragePaths
  )) {
    await expectDocumentR2ObjectMissing(
      sourceLabel,
      disputeAttachmentStoragePath
    )
  }
  if (generated.glNarrativeAbsenceExpected) {
    await expectGlNarrativeAbsent(sourceLabel, generated)
  }
  if (generated.crossDocAnalysisAbsenceExpected) {
    await expectCrossDocAnalysisAbsent(sourceLabel, generated)
  }
  for (const propertyId of propertyIds) {
    await expectListEmptyOrNotFound(
      sourceLabel,
      'documents absent by property',
      `/api/v1/documents?property_id=${propertyId}&skip=0&limit=100`
    )
    await expectListEmptyOrNotFound(
      sourceLabel,
      'sb1103 absent by property',
      `/api/v1/compliance/sb1103?property_id=${propertyId}`
    )
    if (generated.capexPeriodYear) {
      await expectListEmptyOrNotFound(
        sourceLabel,
        'capex flags absent by property',
        `/api/v1/analysis/capex-flags/${propertyId}/${generated.capexPeriodYear}`
      )
      await expectCapexSummaryEmpty(
        sourceLabel,
        'capex summary reset by property',
        `/api/v1/analysis/capex-summary/${propertyId}/${generated.capexPeriodYear}`
      )
    }
  }

  const sourceCheckCount = report.checks.length - initialCheckCount
  report.source_check_counts[sourceLabel] = sourceCheckCount
  if (sourceCheckCount === 0 && hasCleanupMetadata(source, generated)) {
    report.source_failures.push({
      source: sourceLabel,
      path: file,
      ok: source.ok ?? null,
      reason: 'unsupported_cleanup_contract',
      message:
        'Source report includes cleanup metadata but produced no independent cleanup audit checks.',
      cleanup_labels: Array.isArray(source.cleanup)
        ? source.cleanup.map((item) => item?.label ?? null)
        : [],
      generated_keys: Object.keys(generated),
    })
  }
}

async function expectGlNarrativeAbsent(source, generated) {
  const expected = generated.glNarrativeAbsenceExpected
  const propertyId = expected?.propertyId ?? generated.propertyId
  const periodYear = expected?.periodYear ?? generated.periodYear
  if (!propertyId || !periodYear) {
    report.checks.push({
      source,
      label: 'gl narrative absence metadata complete',
      path: 'report.json',
      status: null,
      ok: false,
      summary: {
        property_id: propertyId ?? null,
        period_year: periodYear ?? null,
      },
    })
    return
  }

  const path = `/api/v1/analysis/gl-narrative/${propertyId}/${periodYear}`
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  report.checks.push({
    source,
    label: 'gl narrative latest absent',
    path,
    status: response.status,
    ok: response.status === 200 && body === null,
    body_preview: text.slice(0, 200),
  })
}

async function expectCrossDocAnalysisAbsent(source, generated) {
  const expected = generated.crossDocAnalysisAbsenceExpected
  const propertyId = expected?.propertyId ?? generated.propertyId
  const periodYear = expected?.periodYear ?? generated.periodYear
  if (!propertyId || !periodYear) {
    report.checks.push({
      source,
      label: 'cross-doc analysis absence metadata complete',
      path: 'report.json',
      status: null,
      ok: false,
      summary: {
        property_id: propertyId ?? null,
        period_year: periodYear ?? null,
      },
    })
    return
  }

  const path = `/api/v1/properties/${propertyId}/cross-doc-analysis/${periodYear}`
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  report.checks.push({
    source,
    label: 'cross-doc analysis latest absent',
    path,
    status: response.status,
    ok: response.status === 404 && body?.error?.code === 'not_found',
    summary: body?.error ? { error_code: body.error.code } : null,
    body_preview: text.slice(0, 200),
  })
}

function expectReadOnlyReportHasNoPersistentWrites(source, sourceReport) {
  const persistentIds = sourceReport.generated?.persistentIdsCreated
  const guardedEndpointRequests = sourceReport.guarded_endpoint_requests
  const guardedEndpointRequestsOk =
    !Array.isArray(guardedEndpointRequests) ||
    guardedEndpointRequests.length === 0
  report.checks.push({
    source,
    label: 'browser read-only report has no persistent app writes',
    path: 'report.json',
    status: null,
    ok:
      Array.isArray(persistentIds) &&
      persistentIds.length === 0 &&
      Array.isArray(sourceReport.mutating_requests) &&
      sourceReport.mutating_requests.length === 0 &&
      Array.isArray(sourceReport.failed_responses) &&
      sourceReport.failed_responses.length === 0 &&
      Array.isArray(sourceReport.browser_errors) &&
      sourceReport.browser_errors.length === 0 &&
      guardedEndpointRequestsOk,
    summary: {
      persistent_ids: Array.isArray(persistentIds)
        ? persistentIds.length
        : null,
      mutating_requests: Array.isArray(sourceReport.mutating_requests)
        ? sourceReport.mutating_requests.length
        : null,
      failed_responses: Array.isArray(sourceReport.failed_responses)
        ? sourceReport.failed_responses.length
        : null,
      browser_errors: Array.isArray(sourceReport.browser_errors)
        ? sourceReport.browser_errors.length
        : null,
      guarded_endpoint_requests: Array.isArray(guardedEndpointRequests)
        ? guardedEndpointRequests.length
        : null,
    },
  })
}

function expectInvalidNoopProbeCleanup(source, sourceReport) {
  const labels = Array.isArray(sourceReport.generated?.cleanupProofLabels)
    ? sourceReport.generated.cleanupProofLabels
    : []
  const checks = Array.isArray(sourceReport.checks) ? sourceReport.checks : []
  const missingOrFailedLabels = labels.filter(
    (label) =>
      !checks.some((check) => check?.label === label && check.ok === true)
  )
  const persistentIds = sourceReport.generated?.persistentIdsCreated
  report.checks.push({
    source,
    label: 'invalid no-op probes left durable state unchanged',
    path: 'report.json',
    status: null,
    ok:
      labels.length > 0 &&
      missingOrFailedLabels.length === 0 &&
      Array.isArray(persistentIds) &&
      persistentIds.length === 0,
    summary: {
      required_labels: labels,
      missing_or_failed_labels: missingOrFailedLabels,
      persistent_ids: Array.isArray(persistentIds)
        ? persistentIds.length
        : null,
    },
  })
}

function expectPublicToolPureComputeCleanup(source, sourceReport) {
  const allowedPaths = Array.isArray(sourceReport.generated?.allowedToolPaths)
    ? sourceReport.generated.allowedToolPaths
    : []
  const apiCalls = Array.isArray(sourceReport.api_calls)
    ? sourceReport.api_calls
    : []
  const disallowedCalls = apiCalls.filter(
    (call) =>
      call?.method !== 'POST' ||
      typeof call?.path !== 'string' ||
      !allowedPaths.includes(call.path)
  )
  const persistentIds = sourceReport.generated?.persistentIdsCreated
  const failedChecks = Array.isArray(sourceReport.checks)
    ? sourceReport.checks.filter((check) => check?.ok !== true)
    : null
  report.checks.push({
    source,
    label: 'public tool pure compute report has no persistent app writes',
    path: 'report.json',
    status: null,
    ok:
      allowedPaths.length > 0 &&
      apiCalls.length > 0 &&
      disallowedCalls.length === 0 &&
      Array.isArray(persistentIds) &&
      persistentIds.length === 0 &&
      Array.isArray(failedChecks) &&
      failedChecks.length === 0,
    summary: {
      api_calls: apiCalls.length,
      disallowed_calls: disallowedCalls,
      persistent_ids: Array.isArray(persistentIds)
        ? persistentIds.length
        : null,
      failed_checks: Array.isArray(failedChecks) ? failedChecks.length : null,
    },
  })
}

function expectTenantPreferencesRestored(source, sourceReport) {
  const generated = sourceReport.generated ?? {}
  const initial = generated.initialPreferences
  const final = generated.finalPreferences
  const persistentIds = generated.persistentIdsCreated
  const failedChecks = Array.isArray(sourceReport.checks)
    ? sourceReport.checks.filter((check) => check?.ok !== true)
    : []
  const failedCleanup = Array.isArray(sourceReport.cleanup)
    ? sourceReport.cleanup.filter((item) => item?.ok !== true)
    : []
  report.checks.push({
    source,
    label: 'tenant preferences restored to original state',
    path: 'report.json',
    status: null,
    ok:
      sourceReport.ok === true &&
      stableJson(initial) === stableJson(final) &&
      Array.isArray(persistentIds) &&
      persistentIds.length === 0 &&
      failedChecks.length === 0 &&
      failedCleanup.length === 0,
    summary: {
      initial,
      final,
      persistent_ids: Array.isArray(persistentIds)
        ? persistentIds.length
        : null,
      failed_checks: failedChecks.map((check) => check?.label ?? null),
      failed_cleanup: failedCleanup.map((item) => item?.label ?? null),
    },
  })
}

function expectNegativeReportHasNoPersistentIds(source, sourceReport) {
  const persistentIds = sourceReport.generated?.persistentIdsCreated
  const failedChecks = Array.isArray(sourceReport.checks)
    ? sourceReport.checks.filter((check) => check?.ok !== true)
    : []
  report.checks.push({
    source,
    label: 'negative report has no persistent IDs',
    path: 'report.json',
    status: null,
    ok:
      sourceReport.ok === true &&
      Array.isArray(persistentIds) &&
      persistentIds.length === 0 &&
      Array.isArray(sourceReport.checks) &&
      sourceReport.checks.length > 0 &&
      failedChecks.length === 0,
    summary: {
      persistent_ids: Array.isArray(persistentIds)
        ? persistentIds.length
        : null,
      checks: Array.isArray(sourceReport.checks)
        ? sourceReport.checks.length
        : null,
      failed_checks: failedChecks.map((check) => check?.label ?? null),
    },
  })
}

async function expectActualBilledRowsAbsent(
  source,
  generated,
  actualBilledIds
) {
  const propertyId = generated.propertyId
  const periodStart = generated.periodStart
  const periodEnd = generated.periodEnd
  if (
    typeof propertyId !== 'string' ||
    typeof periodStart !== 'string' ||
    typeof periodEnd !== 'string'
  ) {
    report.checks.push({
      source,
      label: 'actual billed absence metadata complete',
      path: 'report.json',
      status: null,
      ok: false,
      summary: {
        property_id_present: typeof propertyId === 'string',
        period_start_present: typeof periodStart === 'string',
        period_end_present: typeof periodEnd === 'string',
        actual_billed_ids: actualBilledIds.length,
      },
    })
    return
  }

  const path = `/api/v1/actual-billed/${propertyId}?period_start=${periodStart}&period_end=${periodEnd}`
  const response = await fetch(`${apiUrl}${path}`, {
    headers: authHeaders(),
  })
  const text = await response.text()
  let ok = response.status === 404
  let summary = null

  if (response.status === 200) {
    const body = text ? JSON.parse(text) : null
    const shape = listShape(body)
    const items = shape.items ?? []
    const presentIds = items
      .map((item) => item?.id)
      .filter((id) => actualBilledIds.includes(id))
    const total = body?.total_billed
    ok =
      shape.recognized &&
      presentIds.length === 0 &&
      items.length === 0 &&
      (total === undefined || ['0', '0.00'].includes(String(total)))
    summary = {
      present_ids: presentIds,
      item_count: shape.itemCount,
      total_billed: total,
      recognized_shape: shape.recognized,
    }
  }

  report.checks.push({
    source,
    label: 'actual billed row ids absent',
    path,
    status: response.status,
    ok,
    summary,
    body_preview: ok ? undefined : text.slice(0, 200),
  })
}

async function expectFeedbackCleanup(source, generated) {
  const feedbackId = generated.feedback_id
  const probeId = generated.probe_id
  const screenshotStoragePath = generated.screenshot_storage_path

  if (typeof feedbackId === 'string') {
    await expectStatus(
      source,
      'feedback row deleted',
      `/api/v1/feedback/${feedbackId}`,
      [404]
    )
    await expectFeedbackAbsentFromList({
      source,
      label: 'feedback absent from admin list',
      path: '/api/v1/feedback?per_page=100',
      feedbackId,
      probeId,
    })
    await expectFeedbackAbsentFromList({
      source,
      label: 'feedback absent from my feedback list',
      path: '/api/v1/feedback/my',
      feedbackId,
      probeId,
    })
  }

  if (typeof screenshotStoragePath === 'string') {
    await expectDocumentR2ObjectMissing(source, screenshotStoragePath)
  }
}

async function expectFeedbackAbsentFromList({
  source,
  label,
  path,
  feedbackId,
  probeId,
}) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: authHeaders(),
  })
  const text = await response.text()
  let ok = false
  let summary = null

  if (response.status === 200) {
    const body = text ? JSON.parse(text) : null
    const shape = listShape(body)
    const items = shape.items ?? []
    const matches = items.filter(
      (item) =>
        item?.id === feedbackId ||
        (typeof probeId === 'string' && item?.metadata?.probe_id === probeId)
    )
    ok = shape.recognized && matches.length === 0
    summary = {
      matching_count: matches.length,
      item_count: shape.itemCount,
      recognized_shape: shape.recognized,
    }
  }

  report.checks.push({
    source,
    label,
    path,
    status: response.status,
    ok,
    summary,
    body_preview: ok ? undefined : text.slice(0, 200),
  })
}

async function expectTeamInvitationRevoked(source, generated) {
  const invitationId = generated.teamInvitationId
  const email = generated.teamInvitationEmail
  const token = generated.teamInvitationToken
  if (
    typeof invitationId !== 'string' ||
    typeof email !== 'string' ||
    typeof token !== 'string'
  ) {
    report.checks.push({
      source,
      label: 'team invitation cleanup report fields present',
      path: 'report.json',
      status: null,
      ok: false,
      summary: {
        invitation_id_present: typeof invitationId === 'string',
        email_present: typeof email === 'string',
        token_present: typeof token === 'string',
      },
    })
    return
  }

  const activeResponse = await fetch(`${apiUrl}/api/v1/team/invitations`, {
    headers: authHeaders(),
  })
  const activeText = await activeResponse.text()
  let activeOk = false
  let activeSummary = null
  if (activeResponse.status === 200) {
    const activeShape = listShape(JSON.parse(activeText))
    const activeMatches = (activeShape.items ?? []).filter(
      (invitation) =>
        invitation?.id === invitationId || invitation?.email === email
    )
    activeSummary = {
      active_matches: activeMatches.length,
      recognized_shape: activeShape.recognized,
    }
    activeOk = activeShape.recognized && activeMatches.length === 0
  }
  report.checks.push({
    source,
    label: 'team invitation absent from active list',
    path: '/api/v1/team/invitations',
    status: activeResponse.status,
    ok: activeOk,
    summary: activeSummary,
    body_preview: activeOk ? undefined : activeText.slice(0, 200),
  })

  const allResponse = await fetch(
    `${apiUrl}/api/v1/team/invitations?include_used=true`,
    { headers: authHeaders() }
  )
  const allText = await allResponse.text()
  let storedOk = false
  let storedSummary = null
  if (allResponse.status === 200) {
    const allShape = listShape(JSON.parse(allText))
    const stored = (allShape.items ?? []).find(
      (invitation) => invitation?.id === invitationId
    )
    storedSummary = {
      recognized_shape: allShape.recognized,
      found: Boolean(stored),
      email: stored?.email ?? null,
      revoked_at: stored?.revoked_at ?? null,
      used_at: stored?.used_at ?? null,
    }
    storedOk =
      allShape.recognized &&
      Boolean(stored) &&
      stored.email === email &&
      typeof stored.revoked_at === 'string' &&
      stored.revoked_at.length > 0 &&
      stored.used_at === null
  }
  report.checks.push({
    source,
    label: 'team invitation stored as revoked',
    path: '/api/v1/team/invitations?include_used=true',
    status: allResponse.status,
    ok: storedOk,
    summary: storedSummary,
    body_preview: storedOk ? undefined : allText.slice(0, 200),
  })

  const validationResponse = await fetch(
    `${apiUrl}/api/v1/team/invitations/${encodeURIComponent(token)}/validate`,
    { headers: { accept: 'application/json' } }
  )
  const validationText = await validationResponse.text()
  let validationOk = false
  let validationSummary = null
  if (validationResponse.status === 200) {
    const validation = JSON.parse(validationText)
    validationSummary = {
      valid: validation?.valid ?? null,
      error_reason: validation?.error_reason ?? null,
    }
    validationOk =
      validation?.valid === false && validation?.error_reason === 'revoked'
  }
  report.checks.push({
    source,
    label: 'team invitation token rejected after revoke',
    path: '/api/v1/team/invitations/:token/validate',
    status: validationResponse.status,
    ok: validationOk,
    summary: validationSummary,
    body_preview: validationOk ? undefined : validationText.slice(0, 200),
  })
}

async function expectAdminDisputeFixtureAuthUsersDeleted(
  source,
  sourceReport,
  generated
) {
  const authUsers = adminFixtureAuthUsers(sourceReport, generated)
  if (authUsers.length === 0) {
    report.checks.push({
      source,
      label: 'admin fixture auth cleanup report fields present',
      path: 'report.json',
      status: null,
      ok: false,
      summary: {
        auth_user_count: 0,
      },
    })
    return
  }

  for (const authUser of authUsers) {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: authUser.email,
          password: syntheticAdminDisputePassword(authUser.run_id),
        }),
      }
    )
    await response.arrayBuffer().catch(() => new ArrayBuffer(0))
    report.checks.push({
      source,
      label: 'admin fixture auth user deleted',
      path: 'supabase auth password grant',
      status: response.status,
      ok: response.status === 400 || response.status === 401,
      expected_statuses: [400, 401],
      summary: {
        key: authUser.key ?? null,
        email: authUser.email,
        synthetic_user_id: authUser.synthetic_user_id ?? null,
        tenant_user_id: authUser.tenant_user_id ?? null,
      },
    })
  }
}

function adminFixtureAuthUsers(sourceReport, generated) {
  if (Array.isArray(generated.adminDisputeFixtureAuthUsers)) {
    return generated.adminDisputeFixtureAuthUsers.filter(
      (entry) =>
        typeof entry?.email === 'string' && typeof entry?.run_id === 'string'
    )
  }
  if (
    typeof generated.tenantEmail === 'string' &&
    typeof sourceReport.run_id === 'string'
  ) {
    return [
      {
        key: 'tenant',
        email: generated.tenantEmail,
        run_id: sourceReport.run_id,
        synthetic_user_id: generated.syntheticUserId ?? null,
        tenant_user_id: generated.tenantUserId ?? null,
      },
    ]
  }
  return []
}

function syntheticAdminDisputePassword(id) {
  return `ProdE2E-${id}-Aa1`
}

async function expectStatus(source, label, path, expectedStatuses) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: authHeaders(),
  })
  const text = await response.text()
  const ok = expectedStatuses.includes(response.status)
  report.checks.push({
    source,
    label,
    path,
    status: response.status,
    ok,
    expected_statuses: expectedStatuses,
    body_preview: text.slice(0, 200),
  })
}

async function expectTenantStatus(source, label, path, expectedStatuses) {
  const tokenForTenant = await getTenantToken()
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      authorization: `Bearer ${tokenForTenant}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  report.checks.push({
    source,
    label,
    path,
    status: response.status,
    ok: expectedStatuses.includes(response.status),
    expected_statuses: expectedStatuses,
    body_preview: text.slice(0, 200),
  })
}

async function getTenantToken() {
  if (tenantToken) return tenantToken
  const email = env.E2E_PROD_TENANT_EMAIL?.trim()
  const password = env.E2E_PROD_TENANT_PASSWORD?.trim()
  if (!email || !password) {
    throw new Error(
      'Missing E2E_PROD_TENANT_EMAIL or E2E_PROD_TENANT_PASSWORD for tenant cleanup audit.'
    )
  }
  const session = await signInWithPassword({ email, password })
  tenantToken = session.access_token
  return tenantToken
}

async function expectListEmptyOrNotFound(source, label, path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: authHeaders(),
  })
  const text = await response.text()
  let ok = response.status === 404
  let summary = null

  if (response.status === 200) {
    const body = text ? JSON.parse(text) : null
    const shape = listShape(body)
    const billedTotal = body?.total_billed
    ok =
      shape.recognized &&
      (shape.items ? shape.itemCount === 0 : true) &&
      shape.total === 0 &&
      (billedTotal === undefined || String(billedTotal) === '0')
    summary = {
      total: shape.total,
      item_count: shape.itemCount,
      total_billed: billedTotal,
      recognized_shape: shape.recognized,
    }
  }

  report.checks.push({
    source,
    label,
    path,
    status: response.status,
    ok,
    summary,
    body_preview: ok ? undefined : text.slice(0, 200),
  })
}

async function expectPoolMappingsAbsent(source, propertyId, poolId) {
  const query = poolId
    ? `?pool_id=${encodeURIComponent(poolId)}&skip=0&limit=100`
    : '?skip=0&limit=100'
  const path = `/api/v1/properties/${propertyId}/pool-mappings${query}`
  const response = await fetch(`${apiUrl}${path}`, {
    headers: authHeaders(),
  })
  const text = await response.text()
  let ok = false
  let summary = null

  if (response.status === 200) {
    const body = text ? JSON.parse(text) : null
    const shape = listShape(body, ['matching_count', 'total', 'count'])
    ok =
      shape.recognized &&
      (shape.items ? shape.itemCount === 0 : true) &&
      shape.total === 0
    summary = {
      total: shape.total,
      item_count: shape.itemCount,
      recognized_shape: shape.recognized,
    }
  } else if (response.status === 404) {
    const body = parseJsonOrNull(text)
    const errorCode = body?.error?.code ?? null
    ok =
      errorCode === 'property_not_found' ||
      errorCode === 'expense_pool_not_found'
    summary = { error_code: errorCode }
  }

  report.checks.push({
    source,
    label: poolId
      ? 'pool mappings absent by expense pool'
      : 'pool mappings absent by property',
    path,
    status: response.status,
    ok,
    summary,
    body_preview: ok ? undefined : text.slice(0, 200),
  })
}

function parseJsonOrNull(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function expectCapexSummaryEmpty(source, label, path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: authHeaders(),
  })
  const text = await response.text()
  let ok = response.status === 404
  let summary = null

  if (response.status === 200) {
    const body = text ? JSON.parse(text) : null
    summary = {
      total: Number(body?.total ?? 0),
      pending: Number(body?.pending ?? 0),
      confirmed_capex: Number(body?.confirmed_capex ?? 0),
      dismissed: Number(body?.dismissed ?? 0),
      total_flagged_amount: body?.total_flagged_amount,
    }
    ok =
      summary.total === 0 &&
      summary.pending === 0 &&
      summary.confirmed_capex === 0 &&
      summary.dismissed === 0 &&
      String(summary.total_flagged_amount) === '0.00'
  }

  report.checks.push({
    source,
    label,
    path,
    status: response.status,
    ok,
    summary,
    body_preview: ok ? undefined : text.slice(0, 200),
  })
}

async function expectOrganizationSettingsRestored(source, expected) {
  const response = await fetch(`${apiUrl}/api/v1/organization/settings`, {
    headers: authHeaders(),
  })
  const text = await response.text()
  let actual = null
  let ok = false

  if (response.status === 200) {
    const body = text ? JSON.parse(text) : null
    actual = pick(body, Object.keys(expected))
    ok = stableJson(actual) === stableJson(expected)
  }

  report.checks.push({
    source,
    label: 'organization settings restored',
    path: '/api/v1/organization/settings',
    status: response.status,
    ok,
    actual,
    expected,
    body_preview: ok ? undefined : text.slice(0, 200),
  })
}

async function expectReportR2ObjectMissing(source, storagePath) {
  if (!storagePath.startsWith('r2:')) {
    report.checks.push({
      source,
      label: 'export R2 object deleted',
      path: storagePath,
      status: 400,
      ok: false,
      body_preview: 'expected r2: storage path',
    })
    return
  }
  const objectPath = `${reportsR2Bucket}/${storagePath.slice(3)}`
  const result = await getR2Object(objectPath)
  const ok = result.missing === true
  report.checks.push({
    source,
    label: 'export R2 object deleted',
    path: `r2://${objectPath}`,
    status: ok ? 404 : 200,
    ok,
    body_preview: ok
      ? 'object missing'
      : `object still present (${result.byteLength} bytes)`,
  })
}

async function expectDocumentR2ObjectMissing(source, storageKey) {
  const normalizedKey = validDocumentStorageKey(storageKey)
  if (!normalizedKey) {
    report.checks.push({
      source,
      label: 'document R2 object deleted',
      path: storageKey,
      status: 400,
      ok: false,
      body_preview: 'expected scoped document storage key',
    })
    return
  }
  const objectPath = `${documentsR2Bucket}/${normalizedKey}`
  const result = await getR2Object(objectPath)
  const ok = result.missing === true
  report.checks.push({
    source,
    label: 'document R2 object deleted',
    path: `r2://${objectPath}`,
    status: ok ? 404 : 200,
    ok,
    body_preview: ok
      ? 'object missing'
      : `object still present (${result.byteLength} bytes)`,
  })
}

function validDocumentStorageKey(storageKey) {
  if (typeof storageKey !== 'string') return null
  const trimmed = storageKey.trim()
  const segments = trimmed.split('/')
  if (
    trimmed === '' ||
    trimmed.startsWith('/') ||
    trimmed.endsWith('/') ||
    trimmed.includes('\\') ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..'
    )
  ) {
    return null
  }
  return trimmed
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

function extractItems(body) {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.items)) return body.items
  if (Array.isArray(body?.documents)) return body.documents
  if (Array.isArray(body?.requests)) return body.requests
  if (Array.isArray(body?.invitations)) return body.invitations
  return null
}

function listShape(body, totalKeys = ['total', 'count']) {
  const items = extractItems(body)
  const totalKey = totalKeys.find((key) => finiteNumber(body?.[key]))
  const itemCount = Array.isArray(items) ? items.length : null
  return {
    items: Array.isArray(items) ? items : null,
    itemCount,
    total: totalKey ? Number(body[totalKey]) : itemCount,
    recognized: Array.isArray(items) || Boolean(totalKey),
  }
}

function hasCleanupMetadata(source, generated) {
  if (Array.isArray(source.cleanup) && source.cleanup.length > 0) return true
  return Object.keys(generated).some((key) =>
    /(?:CleanupExpected|AbsenceExpected|RevocationExpected|RestoredExpected|NoPersistentIdsExpected|readOnlyNoPersistentWrites|persistentIdsCreated|storagePath|storagePaths|r2|R2)$/u.test(
      key
    )
  )
}

function finiteNumber(value) {
  return value !== undefined && value !== null && Number.isFinite(Number(value))
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

function generatedIds(single, many) {
  return [
    ...new Set([
      ...(typeof single === 'string' ? [single] : []),
      ...(Array.isArray(many)
        ? many.filter((id) => typeof id === 'string')
        : []),
    ]),
  ]
}

function firstGeneratedId(single, many) {
  return generatedIds(single, many)[0] ?? null
}

function authHeaders() {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
  }
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

async function findReportFiles(roots) {
  const found = []
  for (const root of roots) {
    await walk(root, found)
  }
  return [...new Set(found)].sort()
}

async function walk(dir, found) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const child = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(child, found)
    } else if (entry.name === 'report.json') {
      found.push(child)
    }
  }
}

async function signInWithPassword(credentials = null) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: credentials?.email ?? env.E2E_PROD_EMAIL,
        password: credentials?.password ?? env.E2E_PROD_PASSWORD,
      }),
    }
  )
  const body = await response.json()
  if (!response.ok || !body.access_token) {
    throw new Error(`Supabase sign-in failed: ${response.status}`)
  }
  return body
}

async function readEnv(path) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return {}
  }
  const values = {}
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const equals = trimmed.indexOf('=')
    if (equals === -1) continue
    const key = trimmed.slice(0, equals).trim()
    let value = trimmed.slice(equals + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function summarizeReport(report) {
  return {
    ok: report.ok,
    output_dir: report.output_dir,
    source_reports: report.source_reports.length,
    source_failures: report.source_failures,
    checks: report.checks.length,
    failures: report.checks.filter((check) => !check.ok),
  }
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
