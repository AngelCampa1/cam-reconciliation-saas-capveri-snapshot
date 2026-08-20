/**
 * MSW handlers for GL ingestion and reconciliation endpoints
 *
 * Mirrors the REAL backend routes that the frontend SDK/hooks call:
 *   POST /api/v1/ingestion/upload                       (UploadResponse)
 *   GET  /api/v1/ingestion/gl-date-range/{property_id}  (GlDateRangeResponse)
 *   GET  /api/v1/ingestion/batches                      (BatchListResponse)
 *   POST /api/v1/reconciliation/calculate               (CalculationJobResponse)
 *   GET  /api/v1/reconciliation/jobs/{job_id}           (CalculationJobStatusResponse)
 *
 * Simulates the GL file upload → reconciliation calculation → job polling workflow.
 */
import { http, HttpResponse } from 'msw'

// In-memory store for GL ingestion state
interface ImportBatch {
  batch_id: string
  property_id: string
  file_name: string
  source_system: string
  status: 'processing' | 'completed' | 'failed'
  row_count: number
  created_at: string
}

interface GLPeriod {
  year: number
  property_id: string
  min_date: string
  max_date: string
}

interface ReconciliationJob {
  job_id: string
  property_id: string
  period_start: string
  period_end: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress_percentage: number
  total_leases: number | null
  processed_leases: number
  snapshot_ids: string[]
  created_at: string
}

let importBatchesStore: ImportBatch[] = []
let glPeriodsStore: GLPeriod[] = []
const reconciliationJobsStore: Map<string, ReconciliationJob> = new Map()
let uploadAttemptCount = 999 // For 401 retry testing - start high so uploads succeed by default

/**
 * Reset GL ingestion store - call between tests
 */
export function resetGLIngestionStore(): void {
  importBatchesStore = []
  glPeriodsStore = []
  reconciliationJobsStore.clear()
  uploadAttemptCount = 999 // Reset to success state
}

/**
 * Seed GL periods for a property.
 *
 * Stores min/max dates (Jan 1 to Dec 31 of the year) so the gl-date-range
 * endpoint can return a realistic GlDateRangeResponse.
 */
export function seedGLPeriods(propertyId: string, years: number[]): void {
  glPeriodsStore = years.map((year) => ({
    year,
    property_id: propertyId,
    min_date: `${year}-01-01`,
    max_date: `${year}-12-31`,
  }))
}

/**
 * Configure upload to fail with 401 on first attempt (for retry testing)
 */
export function setUploadAuthFailure(shouldFail: boolean): void {
  if (shouldFail) {
    uploadAttemptCount = 0
  } else {
    uploadAttemptCount = 999 // Disable failure
  }
}

// Initialize with empty store
resetGLIngestionStore()

export const glIngestionHandlers = [
  // POST /api/v1/ingestion/upload - Upload GL file (multipart: file + property_id)
  http.post('*/api/v1/ingestion/upload', async ({ request }) => {
    // Simulate 401 on first attempt for retry testing
    if (uploadAttemptCount === 0) {
      uploadAttemptCount++
      return HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const propertyId = (formData.get('property_id') as string | null) ?? ''

    if (!file) {
      return HttpResponse.json({ detail: 'No file provided' }, { status: 400 })
    }

    const rowCount = 1247 // Mock count
    const batch: ImportBatch = {
      batch_id: crypto.randomUUID(),
      property_id: propertyId,
      file_name: file.name,
      source_system: 'generic',
      status: 'completed',
      row_count: rowCount,
      created_at: new Date().toISOString(),
    }

    importBatchesStore.push(batch)

    // Record a GL period for the uploaded year if not already present
    const year = 2024
    if (
      !glPeriodsStore.some(
        (p) => p.year === year && p.property_id === propertyId
      )
    ) {
      glPeriodsStore.push({
        year,
        property_id: propertyId,
        min_date: `${year}-01-01`,
        max_date: `${year}-12-31`,
      })
    }

    // UploadResponse shape
    return HttpResponse.json(
      {
        batch_id: batch.batch_id,
        source_system: batch.source_system,
        source_confidence: 0.95,
        row_count: rowCount,
        error_count: 0,
        warnings: [],
        detected_columns: ['account', 'amount'],
      },
      { status: 201 }
    )
  }),

  // GET /api/v1/ingestion/gl-date-range/:propertyId - Latest GL date range
  http.get('*/api/v1/ingestion/gl-date-range/:propertyId', ({ params }) => {
    const propertyId = params.propertyId as string

    const periods = glPeriodsStore.filter((p) => p.property_id === propertyId)

    if (periods.length === 0) {
      return HttpResponse.json(
        { detail: 'No GL entries found for this property' },
        { status: 404 }
      )
    }

    // Latest period = highest year
    const latest = periods.reduce((acc, p) => (p.year > acc.year ? p : acc))

    // GlDateRangeResponse shape
    return HttpResponse.json({
      min_date: latest.min_date,
      max_date: latest.max_date,
      year: latest.year,
    })
  }),

  // GET /api/v1/ingestion/batches - Org-scoped import batch list
  http.get('*/api/v1/ingestion/batches', () => {
    // BatchListResponse shape: { batches: [...] }
    return HttpResponse.json({
      batches: importBatchesStore.map((b) => ({
        id: b.batch_id,
        batch_id: b.batch_id,
        property_id: b.property_id,
        file_name: b.file_name,
        source_system: b.source_system,
        status: b.status,
        row_count: b.row_count,
        created_at: b.created_at,
      })),
    })
  }),

  // POST /api/v1/reconciliation/calculate - Trigger reconciliation calculation
  http.post('*/api/v1/reconciliation/calculate', async ({ request }) => {
    const body = (await request.json()) as {
      property_id: string
      period_start: string
      period_end: string
    }
    const { property_id, period_start, period_end } = body

    // Require a seeded GL period for the property (any year)
    const hasPeriods = glPeriodsStore.some((p) => p.property_id === property_id)

    if (!hasPeriods) {
      return HttpResponse.json(
        { detail: 'No GL entries found for this property' },
        { status: 404 }
      )
    }

    const jobId = crypto.randomUUID()
    const job: ReconciliationJob = {
      job_id: jobId,
      property_id,
      period_start,
      period_end,
      status: 'pending',
      progress_percentage: 0,
      total_leases: 5,
      processed_leases: 0,
      snapshot_ids: [],
      created_at: new Date().toISOString(),
    }

    reconciliationJobsStore.set(jobId, job)

    // CalculationJobResponse shape
    return HttpResponse.json(
      {
        job_id: jobId,
        status: 'pending',
        message: 'Calculation queued',
      },
      { status: 202 }
    )
  }),

  // GET /api/v1/reconciliation/jobs/:jobId - Poll job status
  http.get('*/api/v1/reconciliation/jobs/:jobId', ({ params }) => {
    const jobId = params.jobId as string
    const job = reconciliationJobsStore.get(jobId)

    if (!job) {
      return HttpResponse.json({ detail: 'Job not found' }, { status: 404 })
    }

    // Advance progress on each poll: pending → running → completed
    if (job.status !== 'completed' && job.status !== 'failed') {
      job.status = 'running'
      job.progress_percentage = Math.min(job.progress_percentage + 50, 100)
      job.processed_leases = Math.min(
        job.processed_leases + Math.ceil((job.total_leases ?? 0) / 2),
        job.total_leases ?? 0
      )

      if (job.progress_percentage >= 100) {
        job.status = 'completed'
        job.processed_leases = job.total_leases ?? 0
        job.snapshot_ids = [`snap-${crypto.randomUUID()}`]
      }
    }

    // CalculationJobStatusResponse shape
    return HttpResponse.json({
      job_id: job.job_id,
      status: job.status,
      property_id: job.property_id,
      period_start: job.period_start,
      period_end: job.period_end,
      total_leases: job.total_leases,
      processed_leases: job.processed_leases,
      progress_percentage: job.progress_percentage,
      snapshot_ids: job.snapshot_ids,
      error_message: null,
      potential_recovery_total: job.status === 'completed' ? '1234.56' : null,
      created_at: job.created_at,
      started_at: job.created_at,
      completed_at:
        job.status === 'completed' ? new Date().toISOString() : null,
    })
  }),
]
