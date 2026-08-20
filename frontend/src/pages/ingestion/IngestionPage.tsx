/**
 * Data Ingestion Page
 *
 * Single-step GL file upload flow:
 * 1. idle - property selector + file drop zone
 * 2. uploading - POST /api/v1/ingestion/upload (detect + parse + persist in one shot)
 * 3. confirmed - Yardi/MRI detected, show Continue
 * 4. mapping - Generic detected, show column mapping wizard
 * 5. success | partial_errors - show row count / error list
 * History tab - GET /api/v1/ingestion/batches
 */
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileUploader } from '@/components/ingestion/FileUploader'
import { GLEntryPreview } from '@/components/ingestion/GLEntryPreview'
import type { GLEntry } from '@/components/ingestion/GLEntryPreview'
import { ImportErrorDisplay } from '@/components/ingestion/ImportErrorDisplay'
import type { ImportErrorSummary } from '@/components/ingestion/ImportErrorDisplay'
import { ImportHistoryList } from '@/components/ingestion/ImportHistoryList'
import type { ImportRecord } from '@/components/ingestion/ImportHistoryList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, PageContainer } from '@/components/layout'
import { Loader2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react'
import {
  BeginnerFileGuide,
  FieldHelpLabel,
  FriendlyError,
  GuideCallout,
  HelpTip,
} from '@/features/help/components'
import { listPropertiesApiV1PropertiesGet } from '@/api/generated/sdk.gen'
import type { Property } from '@/api/generated/types.gen'
import { apiClient } from '@/api/client'
import { resolveApiUrl } from '@/api/url'
import { ApiError } from '@/api/errors'
import { pluralizeWithCount } from '@/lib/pluralize'
import { captureUnexpectedError } from '@/lib/sentry'
import { supabase } from '@/lib/supabase'
import {
  getConfidenceBucket,
  getCountBucket,
  getFileSizeBucket,
  getFileType,
  getStatusBucket,
  trackEvent,
} from '@/lib/analytics'
import { toast } from 'sonner'
import { useEffect } from 'react'

// -- Types --

type MappingKey = 'account' | 'description' | 'date' | 'debit'

// Translate the wizard's friendly field keys to the backend's standard GL
// column names expected by the generic parser's column mapping.
const STANDARD_FIELD_BY_KEY: Record<MappingKey, string> = {
  account: 'account_code',
  description: 'account_description',
  date: 'transaction_date',
  debit: 'amount',
}

const MAPPING_FIELDS: Array<{
  key: MappingKey
  label: string
  placeholder: string
  help: string
}> = [
  {
    key: 'account',
    label: 'Account',
    placeholder: 'Select column for Account...',
    help: 'The GL account code or number, such as 5400 or Repairs-Utilities.',
  },
  {
    key: 'description',
    label: 'Description',
    placeholder: 'Select column for Description...',
    help: 'The plain-language row description from the accounting export.',
  },
  {
    key: 'date',
    label: 'Date',
    placeholder: 'Select column for Date...',
    help: 'The transaction date. Use the date column from your GL export.',
  },
  {
    key: 'debit',
    label: 'Debit',
    placeholder: 'Select column for Debit...',
    help: 'The expense amount. If your export has Amount instead, map that here.',
  },
]

type IngestionStep =
  | { type: 'idle' }
  | { type: 'uploading' }
  | {
      type: 'confirmed'
      source: string
      confidence: number
      batchId: string
      rowCount: number
      errorCount: number
      detectedColumns: string[]
    }
  | {
      type: 'mapping'
      batchId: string
      detectedColumns: string[]
      rowCount: number
      errorCount: number
    }
  | {
      type: 'success'
      rowCount: number
      entries: GLEntry[]
      previewError?: string
    }
  | {
      type: 'partial_errors'
      summary: ImportErrorSummary
      entries: GLEntry[]
      previewError?: string
    }
  | { type: 'error'; message: string }

interface UploadResult {
  batch_id: string
  source_system: string
  source_confidence: number
  row_count: number
  error_count: number
  warnings: string[]
  detected_columns: string[]
}

interface PreviewEntryResponse {
  id: string
  transaction_date: string
  account_code: string
  account_description: string
  description?: string | null
  debit?: string | null
  credit?: string | null
  balance: string
}

interface BatchDetailsResponse {
  preview_entries?: PreviewEntryResponse[]
}

// Preserve the exact decimal STRING for money fields; only normalize empty
// values to null. GLEntryPreview formats these exactly (no float coercion).
function normalizeMoney(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  return value
}

function parsePreviewDate(value: string): Date {
  return new Date(value.includes('T') ? value : `${value}T00:00:00`)
}

function mapPreviewEntry(entry: PreviewEntryResponse): GLEntry {
  return {
    id: entry.id,
    date: parsePreviewDate(entry.transaction_date),
    account: entry.account_code,
    description:
      entry.description || entry.account_description || entry.account_code,
    debit: normalizeMoney(entry.debit),
    credit: normalizeMoney(entry.credit),
    balance: entry.balance,
  }
}

function getFileTrackingProperties(file: File | null) {
  return {
    file_type: getFileType(file?.type || file?.name),
    file_size_bucket: getFileSizeBucket(file?.size),
  }
}

function getImportResultTrackingProperties(data: UploadResult) {
  return {
    batch_id: data.batch_id,
    source_system: data.source_system,
    source_confidence_bucket: getConfidenceBucket(data.source_confidence),
    row_count_bucket: getCountBucket(data.row_count),
    error_count_bucket: getCountBucket(data.error_count),
  }
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return fetch(resolveApiUrl(url), {
    ...init,
    headers: {
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      ...(init?.headers ?? {}),
    },
  })
}

function reportIngestionResponseFailure(
  response: Response,
  context: { operation: string; path: string }
): void {
  if (response.status < 500) return

  captureUnexpectedError(
    new ApiError(
      `Ingestion request failed with status ${response.status}`,
      response.status
    ),
    {
      operation: context.operation,
      statusCode: response.status,
      path: context.path,
    }
  )
}

function reportIngestionUnexpectedFailure(
  error: unknown,
  context: { operation: string; path: string }
): void {
  captureUnexpectedError(ApiError.fromUnknown(error), {
    operation: context.operation,
    path: context.path,
  })
}

export function IngestionPage() {
  const [step, setStep] = useState<IngestionStep>({ type: 'idle' })
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')
  const [properties, setProperties] = useState<Property[]>([])
  const [propertiesLoading, setPropertiesLoading] = useState(true)
  const [propertiesError, setPropertiesError] = useState(false)
  const [columnMappings, setColumnMappings] = useState<
    Partial<Record<MappingKey, string>>
  >({})
  const [mappingError, setMappingError] = useState<string>('')
  const [historyRecords, setHistoryRecords] = useState<ImportRecord[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  // F-278: drive the active tab from the `?tab=` URL param so the History tab
  // is deep-linkable and the browser back/forward buttons restore it. Anything
  // other than `history` resolves to the default Upload tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'history' ? 'history' : 'upload'
  const setActiveTab = (tab: string) => {
    // Push (not replace) so each tab switch is its own history entry and the
    // browser back/forward buttons walk between Upload and History.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tab === 'history') {
        next.set('tab', 'history')
      } else {
        next.delete('tab')
      }
      return next
    })
  }
  // F-238: open a past import's GL preview from the History tab.
  const [detailsBatch, setDetailsBatch] = useState<{
    id: string
    fileName: string
    entries: GLEntry[]
  } | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const fetchProperties = useCallback(async () => {
    try {
      setPropertiesError(false)
      setPropertiesLoading(true)
      const response = await listPropertiesApiV1PropertiesGet({
        client: apiClient,
        query: { limit: 100 },
      })
      if (response.data) setProperties(response.data.data || [])
    } catch {
      setPropertiesError(true)
    } finally {
      setPropertiesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  const handleFilesSelected = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    if (!selectedPropertyId) {
      trackEvent('gl_import_failed', {
        ...getFileTrackingProperties(file),
        failure_stage: 'property_required',
        status_bucket: 'client',
      })
      setStep({
        type: 'error',
        message: 'Please select a property before uploading.',
      })
      return
    }
    setStep({ type: 'uploading' })
    setMappingError('')
    setColumnMappings({})
    setUploadedFile(file)
    trackEvent('gl_import_started', {
      property_id: selectedPropertyId,
      ...getFileTrackingProperties(file),
    })
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('property_id', selectedPropertyId)
      const uploadRes = await authedFetch('/api/v1/ingestion/upload', {
        method: 'POST',
        body: formData,
      })
      if (uploadRes.status === 413) {
        trackEvent('gl_import_failed', {
          property_id: selectedPropertyId,
          ...getFileTrackingProperties(file),
          failure_stage: 'upload',
          status_bucket: getStatusBucket(uploadRes.status),
        })
        setStep({ type: 'error', message: 'File size exceeds maximum limit' })
        return
      }
      if (uploadRes.status === 409) {
        trackEvent('gl_import_failed', {
          property_id: selectedPropertyId,
          ...getFileTrackingProperties(file),
          failure_stage: 'upload',
          status_bucket: getStatusBucket(uploadRes.status),
        })
        setStep({
          type: 'error',
          message: 'This file has already been imported.',
        })
        return
      }
      if (!uploadRes.ok) {
        reportIngestionResponseFailure(uploadRes, {
          operation: 'ingestion.upload',
          path: '/api/v1/ingestion/upload',
        })
        const err = (await uploadRes.json().catch(() => ({}))) as {
          detail?: unknown
        }
        const message =
          typeof err.detail === 'string' ? err.detail : 'Upload failed'
        trackEvent('gl_import_failed', {
          property_id: selectedPropertyId,
          ...getFileTrackingProperties(file),
          failure_stage: 'upload',
          status_bucket: getStatusBucket(uploadRes.status),
        })
        setStep({ type: 'error', message })
        return
      }
      const data = (await uploadRes.json()) as UploadResult
      trackEvent('gl_import_source_detected', {
        property_id: selectedPropertyId,
        ...getFileTrackingProperties(file),
        ...getImportResultTrackingProperties(data),
      })
      if (data.source_system === 'generic') {
        trackEvent('gl_import_mapping_required', {
          property_id: selectedPropertyId,
          ...getFileTrackingProperties(file),
          ...getImportResultTrackingProperties(data),
        })
        setStep({
          type: 'mapping',
          batchId: data.batch_id,
          detectedColumns: data.detected_columns ?? [],
          rowCount: data.row_count,
          errorCount: data.error_count,
        })
      } else {
        setStep({
          type: 'confirmed',
          source: data.source_system,
          confidence: data.source_confidence,
          batchId: data.batch_id,
          rowCount: data.row_count,
          errorCount: data.error_count,
          detectedColumns: data.detected_columns ?? [],
        })
      }
    } catch (error) {
      reportIngestionUnexpectedFailure(error, {
        operation: 'ingestion.upload',
        path: '/api/v1/ingestion/upload',
      })
      trackEvent('gl_import_failed', {
        property_id: selectedPropertyId,
        ...getFileTrackingProperties(file),
        failure_stage: 'upload',
        status_bucket: 'network',
      })
      setStep({ type: 'error', message: 'Upload failed' })
    }
  }

  const handleContinue = async () => {
    if (step.type !== 'confirmed' && step.type !== 'mapping') return
    const batchId = step.batchId
    let rowCount = step.rowCount
    let errorCount = step.errorCount

    if (step.type === 'mapping') {
      const required: MappingKey[] = ['account', 'description', 'date', 'debit']
      const missing = required.filter((k) => !columnMappings[k])
      if (missing.length > 0) {
        // Name the exact unmapped fields (in on-screen order) so the user knows
        // which dropdowns to fill instead of re-scanning the whole form.
        const missingLabels = missing.map(
          (k) => MAPPING_FIELDS.find((f) => f.key === k)?.label ?? k
        )
        const fieldList =
          missingLabels.length <= 2
            ? missingLabels.join(' and ')
            : `${missingLabels.slice(0, -1).join(', ')}, and ${
                missingLabels[missingLabels.length - 1]
              }`
        const fieldWord = missing.length === 1 ? 'this field' : 'these fields'
        setMappingError(`Map ${fieldWord} to continue: ${fieldList}`)
        trackEvent('gl_import_failed', {
          property_id: selectedPropertyId,
          batch_id: batchId,
          ...getFileTrackingProperties(uploadedFile),
          failure_stage: 'mapping_validation',
          status_bucket: 'client',
        })
        return
      }
      if (!uploadedFile) {
        trackEvent('gl_import_failed', {
          property_id: selectedPropertyId,
          batch_id: batchId,
          failure_stage: 'mapping_file_missing',
          status_bucket: 'client',
        })
        setStep({
          type: 'error',
          message:
            'The uploaded file is no longer available. Please upload it again.',
        })
        return
      }

      trackEvent('gl_import_mapping_submitted', {
        property_id: selectedPropertyId,
        batch_id: batchId,
        ...getFileTrackingProperties(uploadedFile),
      })

      // FIX F-040: POST the column mapping with the original file so the
      // backend re-parses and persists the GL entries. Without this the
      // mapping was silently discarded and the generic file was never imported.
      const mappingConfig: Record<string, string> = {}
      for (const field of MAPPING_FIELDS) {
        const col = columnMappings[field.key]
        if (col) mappingConfig[STANDARD_FIELD_BY_KEY[field.key]] = col
      }

      setMappingError('')
      setIsLoadingPreview(true)
      try {
        const applyForm = new FormData()
        applyForm.append('file', uploadedFile)
        applyForm.append('mapping_config', JSON.stringify(mappingConfig))
        const applyRes = await authedFetch(
          `/api/v1/ingestion/batches/${batchId}/apply-mapping`,
          { method: 'POST', body: applyForm }
        )
        if (!applyRes.ok) {
          reportIngestionResponseFailure(applyRes, {
            operation: 'ingestion.apply_mapping',
            path: '/api/v1/ingestion/batches/:batchId/apply-mapping',
          })
          const err = (await applyRes.json().catch(() => ({}))) as {
            detail?: unknown
          }
          const message =
            typeof err.detail === 'string'
              ? err.detail
              : 'Could not apply the column mapping. Check your selections and try again.'
          setIsLoadingPreview(false)
          setMappingError(message)
          trackEvent('gl_import_failed', {
            property_id: selectedPropertyId,
            batch_id: batchId,
            ...getFileTrackingProperties(uploadedFile),
            failure_stage: 'apply_mapping',
            status_bucket: getStatusBucket(applyRes.status),
          })
          return
        }
        const applyData = (await applyRes.json()) as UploadResult
        rowCount = applyData.row_count
        errorCount = applyData.error_count
      } catch (error) {
        reportIngestionUnexpectedFailure(error, {
          operation: 'ingestion.apply_mapping',
          path: '/api/v1/ingestion/batches/:batchId/apply-mapping',
        })
        setIsLoadingPreview(false)
        setMappingError('Could not apply the column mapping. Please try again.')
        trackEvent('gl_import_failed', {
          property_id: selectedPropertyId,
          batch_id: batchId,
          ...getFileTrackingProperties(uploadedFile),
          failure_stage: 'apply_mapping',
          status_bucket: 'network',
        })
        return
      }
    }

    setMappingError('')
    let entries: GLEntry[] = []
    let previewError: string | undefined

    setIsLoadingPreview(true)
    try {
      const previewRes = await authedFetch(
        `/api/v1/ingestion/batches/${batchId}`
      )
      if (!previewRes.ok) {
        reportIngestionResponseFailure(previewRes, {
          operation: 'ingestion.preview',
          path: '/api/v1/ingestion/batches/:batchId',
        })
        previewError =
          'Import completed, but the GL preview could not be loaded. Try opening the batch from History or retry the upload.'
        trackEvent('gl_import_preview_failed', {
          property_id: selectedPropertyId,
          batch_id: batchId,
          row_count_bucket: getCountBucket(rowCount),
          error_count_bucket: getCountBucket(errorCount),
          status_bucket: getStatusBucket(previewRes.status),
        })
      } else {
        const previewData = (await previewRes.json()) as BatchDetailsResponse
        entries = (previewData.preview_entries ?? []).map(mapPreviewEntry)
      }
    } catch (error) {
      reportIngestionUnexpectedFailure(error, {
        operation: 'ingestion.preview',
        path: '/api/v1/ingestion/batches/:batchId',
      })
      previewError =
        'Import completed, but the GL preview could not be loaded. Try opening the batch from History or retry the upload.'
      trackEvent('gl_import_preview_failed', {
        property_id: selectedPropertyId,
        batch_id: batchId,
        row_count_bucket: getCountBucket(rowCount),
        error_count_bucket: getCountBucket(errorCount),
        status_bucket: 'network',
      })
    } finally {
      setIsLoadingPreview(false)
    }

    // FIX F-104: a new batch was just persisted. Reset the History tab's
    // loaded guard so it refetches on next activation instead of showing
    // stale data that omits this import.
    setHistoryLoaded(false)
    trackEvent('gl_import_completed', {
      property_id: selectedPropertyId,
      batch_id: batchId,
      row_count_bucket: getCountBucket(rowCount),
      error_count_bucket: getCountBucket(errorCount),
      has_preview: entries.length > 0,
      result_status: errorCount === 0 ? 'success' : 'partial_errors',
    })

    if (errorCount === 0) {
      setStep({
        type: 'success',
        rowCount,
        entries,
        ...(previewError ? { previewError } : {}),
      })
    } else {
      setStep({
        type: 'partial_errors',
        summary: {
          totalRows: rowCount,
          successfulRows: rowCount - errorCount,
          failedRows: errorCount,
          errors: [],
          fileName: uploadedFile?.name ?? '',
        },
        entries,
        ...(previewError ? { previewError } : {}),
      })
    }
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    setHistoryError(false)
    try {
      const response = await authedFetch('/api/v1/ingestion/batches')
      if (!response.ok) {
        reportIngestionResponseFailure(response, {
          operation: 'ingestion.history',
          path: '/api/v1/ingestion/batches',
        })
        setHistoryError(true)
        trackEvent('gl_import_history_failed', {
          status_bucket: getStatusBucket(response.status),
        })
        return
      }
      const data = (await response.json()) as {
        batches?: Array<{
          id: string
          file_name?: string
          filename?: string
          created_at: string
          source_system?: string
          parser_type?: string
          row_count?: number
          rows_processed?: number
          status: string
        }>
        imports?: Array<{
          id: string
          file_name?: string
          filename?: string
          created_at: string
          source_system?: string
          parser_type?: string
          row_count?: number
          rows_processed?: number
          status: string
        }>
      }
      const historyItems = data.imports ?? data.batches ?? []
      const records: ImportRecord[] = historyItems.map((b) => ({
        id: b.id,
        fileName: b.filename ?? b.file_name ?? 'Import file',
        uploadedAt: new Date(b.created_at),
        source:
          ((b.parser_type ?? b.source_system) as ImportRecord['source']) ||
          'generic',
        rowCount: b.rows_processed ?? b.row_count ?? 0,
        status:
          b.status === 'completed'
            ? 'success'
            : b.status === 'failed'
              ? 'failed'
              : 'processing',
      }))
      setHistoryRecords(records)
      setHistoryLoaded(true)
      trackEvent('gl_import_history_loaded', {
        import_count_bucket: getCountBucket(records.length),
      })
    } catch (error) {
      reportIngestionUnexpectedFailure(error, {
        operation: 'ingestion.history',
        path: '/api/v1/ingestion/batches',
      })
      setHistoryError(true)
      trackEvent('gl_import_history_failed', {
        status_bucket: 'network',
      })
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleHistoryTabActivated = () => {
    if (historyLoaded) return
    void loadHistory()
  }

  // F-278: a direct deep link / refresh on `?tab=history` renders the History
  // tab without firing the Tabs onValueChange handler, so trigger the one-time
  // load on mount. User-driven tab clicks load via onValueChange instead; the
  // historyLoaded guard inside handleHistoryTabActivated keeps both idempotent.
  useEffect(() => {
    if (activeTab === 'history') handleHistoryTabActivated()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only deep-link load; clicks are handled by onValueChange and refetch is guarded by historyLoaded
  }, [])

  const handleReset = () => {
    setStep({ type: 'idle' })
    setUploadedFile(null)
    setColumnMappings({})
    setMappingError('')
    setHistoryLoaded(false)
    setIsLoadingPreview(false)
  }

  // FIX F-118: wire the Import History row actions. The ImportHistoryList
  // component renders Re-upload (failed rows) and Delete buttons gated behind
  // optional callbacks, but IngestionPage previously passed none, so the
  // actions were dead UI even though the backend retry/delete endpoints exist.
  const handleReupload = async (importId: string) => {
    const historyRecord = historyRecords.find(
      (record) => record.id === importId
    )
    trackEvent('gl_import_retry_clicked', {
      batch_id: importId,
      source_system: historyRecord?.source ?? 'unknown',
      row_count_bucket: getCountBucket(historyRecord?.rowCount),
      previous_status: historyRecord?.status ?? 'unknown',
    })
    try {
      const res = await authedFetch(
        `/api/v1/ingestion/batches/${importId}/retry`,
        { method: 'POST' }
      )
      if (!res.ok) {
        reportIngestionResponseFailure(res, {
          operation: 'ingestion.retry',
          path: '/api/v1/ingestion/batches/:batchId/retry',
        })
        toast.error('Could not retry this import. Please try again.')
        return
      }
      const body = (await res.json().catch(() => ({}))) as {
        message?: unknown
      }
      toast.success(
        typeof body.message === 'string'
          ? body.message
          : 'Upload the file again to retry.'
      )
      handleReset()
      setActiveTab('upload')
    } catch (error) {
      reportIngestionUnexpectedFailure(error, {
        operation: 'ingestion.retry',
        path: '/api/v1/ingestion/batches/:batchId/retry',
      })
      toast.error('Could not retry this import. Please try again.')
    }
  }

  const handleDeleteImport = async (importId: string) => {
    try {
      const res = await authedFetch(`/api/v1/ingestion/batches/${importId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        reportIngestionResponseFailure(res, {
          operation: 'ingestion.delete',
          path: '/api/v1/ingestion/batches/:batchId',
        })
        toast.error('Could not delete this import. Please try again.')
        return
      }
      toast.success('Import deleted')
      await loadHistory()
    } catch (error) {
      reportIngestionUnexpectedFailure(error, {
        operation: 'ingestion.delete',
        path: '/api/v1/ingestion/batches/:batchId',
      })
      toast.error('Could not delete this import. Please try again.')
    }
  }

  const handleNewImport = () => {
    handleReset()
    setActiveTab('upload')
  }

  // F-238: load and show the GL entries for a past import so a History row is
  // re-viewable, not just deletable. Reuses the existing batch-details endpoint
  // and preview mapper.
  const handleViewDetails = async (importId: string) => {
    const record = historyRecords.find((r) => r.id === importId)
    const fileName = record?.fileName ?? 'Import'
    setDetailsBatch({ id: importId, fileName, entries: [] })
    setDetailsError(null)
    setDetailsLoading(true)
    try {
      const res = await authedFetch(`/api/v1/ingestion/batches/${importId}`)
      if (!res.ok) {
        reportIngestionResponseFailure(res, {
          operation: 'ingestion.details',
          path: '/api/v1/ingestion/batches/:batchId',
        })
        setDetailsError('We could not open this import. Please try again.')
        return
      }
      const data = (await res.json()) as BatchDetailsResponse
      const entries = (data.preview_entries ?? []).map(mapPreviewEntry)
      setDetailsBatch({ id: importId, fileName, entries })
    } catch (error) {
      reportIngestionUnexpectedFailure(error, {
        operation: 'ingestion.details',
        path: '/api/v1/ingestion/batches/:batchId',
      })
      setDetailsError('We could not open this import. Please try again.')
    } finally {
      setDetailsLoading(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Upload General Ledger"
        description="Upload a General Ledger (GL) export file to start reconciliation"
      />
      <div className="max-w-4xl">
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val)
            if (val === 'history') handleHistoryTabActivated()
          }}
        >
          <TabsList className="rounded-full">
            <TabsTrigger value="upload" className="rounded-full">
              Upload
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-full">
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle as="h2">Select your file</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label
                    htmlFor="property-select"
                    className="flex items-center gap-2"
                  >
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    <FieldHelpLabel fieldId="glProperty">
                      Select Property
                    </FieldHelpLabel>
                  </Label>
                  {propertiesLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Loading properties...
                    </div>
                  ) : propertiesError ? (
                    <div className="space-y-3">
                      <FriendlyError
                        title="We could not load your properties"
                        message="Something went wrong while loading your properties."
                        recovery="Try again. If it keeps happening, refresh the page."
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchProperties()}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={selectedPropertyId}
                      onValueChange={setSelectedPropertyId}
                      disabled={step.type !== 'idle' && step.type !== 'error'}
                    >
                      <SelectTrigger id="property-select" className="w-full">
                        <SelectValue placeholder="Choose a property..." />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {(step.type === 'idle' || step.type === 'error') && (
                  <div className="space-y-3">
                    <BeginnerFileGuide type="spreadsheet" />
                    {!selectedPropertyId && (
                      <p
                        className="text-sm text-muted-foreground"
                        data-testid="property-required-hint"
                      >
                        First choose a property above. Then you can add your
                        file here.
                      </p>
                    )}
                    <FileUploader
                      onFilesSelected={handleFilesSelected}
                      isDisabled={!selectedPropertyId}
                      accept={{
                        'text/csv': ['.csv'],
                        'application/vnd.ms-excel': ['.xls'],
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                          ['.xlsx'],
                      }}
                      maxFiles={1}
                      maxSize={50 * 1024 * 1024}
                    />
                  </div>
                )}
                {step.type === 'uploading' && (
                  <div className="flex items-center gap-2">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      data-testid="loading-spinner"
                      aria-hidden="true"
                    />
                    <span>Uploading</span>
                  </div>
                )}
                {step.type === 'confirmed' && (
                  <div className="space-y-4">
                    {(() => {
                      const sourceLabel =
                        step.source === 'yardi'
                          ? 'Yardi Voyager'
                          : step.source === 'mri'
                            ? 'MRI Commercial'
                            : step.source
                      const isLowConfidence =
                        step.confidence > 0 && step.confidence < 0.5
                      return (
                        <Alert
                          className={
                            isLowConfidence
                              ? 'border-warning/30 bg-warning/10'
                              : 'border-success/20 bg-success/10'
                          }
                        >
                          {isLowConfidence ? (
                            <AlertCircle
                              className="h-4 w-4 text-warning-foreground"
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckCircle2
                              className="h-4 w-4 text-success-strong"
                              aria-hidden="true"
                            />
                          )}
                          <AlertDescription
                            className={
                              isLowConfidence
                                ? 'text-warning-foreground space-y-1'
                                : 'text-success-strong space-y-1'
                            }
                          >
                            <div className="font-medium">
                              {isLowConfidence ? (
                                <>
                                  Our best guess:{' '}
                                  <span className="capitalize">
                                    {sourceLabel}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="capitalize">
                                    {sourceLabel}
                                  </span>{' '}
                                  detected
                                </>
                              )}
                            </div>
                            {step.confidence > 0 && (
                              <div className="text-sm">
                                Confidence: {Math.round(step.confidence * 100)}%
                              </div>
                            )}
                            {isLowConfidence && (
                              <div className="text-sm">
                                A low score means we weren't sure. Open your
                                file and check it matches before you go on.
                              </div>
                            )}
                          </AlertDescription>
                        </Alert>
                      )
                    })()}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleContinue}
                        disabled={isLoadingPreview}
                      >
                        {isLoadingPreview ? (
                          <>
                            <Loader2
                              className="mr-2 h-4 w-4 animate-spin"
                              aria-hidden="true"
                            />
                            Loading Preview...
                          </>
                        ) : (
                          'Continue'
                        )}
                      </Button>
                      <Button variant="outline" onClick={handleReset}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {step.type === 'mapping' && (
                  <div className="space-y-4">
                    <Alert>
                      <AlertCircle className="h-4 w-4" aria-hidden="true" />
                      <AlertDescription>
                        Generic format detected. Match each CapVeri field to the
                        column in your spreadsheet. This does not change the
                        file; it just tells CapVeri how to read it.
                      </AlertDescription>
                    </Alert>
                    <GuideCallout title="Not sure which column to choose?">
                      <p>
                        Pick the column that best matches the everyday meaning.
                        Account is the GL code, Description is the row label,
                        Date is when the transaction posted, and Debit is the
                        expense amount.
                      </p>
                    </GuideCallout>
                    <div className="space-y-2">
                      <p className="font-medium text-sm">Map Columns</p>
                      {MAPPING_FIELDS.map((field) => (
                        <div
                          key={field.key}
                          className="grid gap-2 sm:grid-cols-[8rem_1fr]"
                        >
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`map-${field.key}`}
                              className="text-sm"
                            >
                              {field.label}
                            </Label>
                            <HelpTip label={field.label}>{field.help}</HelpTip>
                          </div>
                          <Select
                            value={columnMappings[field.key] ?? ''}
                            onValueChange={(value) =>
                              setColumnMappings((prev) => ({
                                ...prev,
                                [field.key]: value,
                              }))
                            }
                          >
                            <SelectTrigger
                              id={`map-${field.key}`}
                              className="w-full"
                            >
                              <SelectValue placeholder={field.placeholder} />
                            </SelectTrigger>
                            <SelectContent>
                              {step.detectedColumns.map((col) => (
                                <SelectItem key={col} value={col}>
                                  {col}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                    {mappingError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <AlertDescription>{mappingError}</AlertDescription>
                      </Alert>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleContinue}
                        disabled={isLoadingPreview}
                      >
                        {isLoadingPreview ? (
                          <>
                            <Loader2
                              className="mr-2 h-4 w-4 animate-spin"
                              aria-hidden="true"
                            />
                            Loading Preview...
                          </>
                        ) : (
                          'Continue'
                        )}
                      </Button>
                      <Button variant="outline" onClick={handleReset}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {step.type === 'success' && (
                  <div className="space-y-4">
                    <Alert className="border-success/20 bg-success/10">
                      <CheckCircle2
                        className="h-4 w-4 text-success"
                        aria-hidden="true"
                      />
                      <AlertDescription className="text-success-strong">
                        {pluralizeWithCount(
                          step.rowCount,
                          'GL entry',
                          'GL entries'
                        )}{' '}
                        imported successfully
                      </AlertDescription>
                    </Alert>
                    {step.previewError ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <AlertDescription>{step.previewError}</AlertDescription>
                      </Alert>
                    ) : (
                      <GLEntryPreview entries={step.entries} />
                    )}
                    <Button variant="outline" onClick={handleReset}>
                      Start Another Upload
                    </Button>
                  </div>
                )}
                {step.type === 'partial_errors' && (
                  <div className="space-y-4">
                    <ImportErrorDisplay summary={step.summary} />
                    {step.previewError ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <AlertDescription>{step.previewError}</AlertDescription>
                      </Alert>
                    ) : (
                      <GLEntryPreview entries={step.entries} />
                    )}
                    <Button variant="outline" onClick={handleReset}>
                      Start Another Upload
                    </Button>
                  </div>
                )}
                {step.type === 'error' && (
                  <FriendlyError
                    title="Upload did not finish"
                    message={step.message}
                    recovery="Check that you selected the correct property and uploaded a CSV, XLS, or XLSX file under 50MB."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="history">
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                {historyLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Loading import history...
                  </div>
                ) : historyError ? (
                  <Alert variant="destructive" data-testid="history-error">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription className="flex flex-col items-start gap-3">
                      <span>
                        We couldn&apos;t load your import history. Please try
                        again.
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadHistory()}
                      >
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <ImportHistoryList
                    imports={historyRecords}
                    onViewDetails={handleViewDetails}
                    onReupload={handleReupload}
                    onDelete={handleDeleteImport}
                    onNewImport={handleNewImport}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={detailsBatch !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsBatch(null)
            setDetailsError(null)
            setDetailsLoading(false)
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">
              {detailsBatch?.fileName ?? 'Import'}
            </DialogTitle>
            <DialogDescription>
              General Ledger entries from this import.
            </DialogDescription>
          </DialogHeader>
          {detailsLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading entries...
            </div>
          ) : detailsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{detailsError}</AlertDescription>
            </Alert>
          ) : detailsBatch && detailsBatch.entries.length > 0 ? (
            <GLEntryPreview entries={detailsBatch.entries} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No preview entries are saved for this import.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
