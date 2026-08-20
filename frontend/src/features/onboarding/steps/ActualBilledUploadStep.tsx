/**
 * Actual Billed Upload Step Component
 *
 * Step 4 of onboarding - upload what you actually billed tenants.
 * This data is compared against CapVeri calculations to show leakage.
 */
import { useState, useCallback, useEffect } from 'react'
import {
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOnboarding } from '../OnboardingContext'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { ExportGuide } from '@/components/onboarding/ExportGuide'
import { SecurityTrustPanel } from '../components/SecurityTrustPanel'
import { BeginnerFileGuide, GuideCallout } from '@/features/help/components'
import { logger } from '@/lib/logger'
import { getAmountBucket, trackEvent } from '@/lib/analytics'
import { authenticatedFetch } from '@/api/authFetch'

const ACCEPTED_TYPES = ['text/csv', 'application/csv']
const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const BILLING_UPLOAD_ACCEPT = `.csv,.xlsx,${ACCEPTED_TYPES.join(',')},${XLSX_TYPE}`
const BILLING_UPLOAD_ERROR = 'Use a CSV or XLSX file here.'

function isBillingUploadFile(file: File): boolean {
  const name = file.name.toLowerCase()

  return (
    ACCEPTED_TYPES.includes(file.type) ||
    file.type === XLSX_TYPE ||
    name.endsWith('.csv') ||
    name.endsWith('.xlsx')
  )
}

// Friendly labels for the detected source so the confirmation never shows a
// raw enum like "generic" to a first-time user.
const SOURCE_LABELS: Record<string, string> = {
  yardi: 'Yardi Voyager',
  yardi_recon: 'Yardi Voyager',
  mri: 'MRI Commercial',
  mri_recon: 'MRI Commercial',
  generic: 'your spreadsheet',
  csv_import: 'your spreadsheet',
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

type UploadedBillingItem = {
  id: string
  tenantName: string
  billedAmount: string
  suite: string | null
  leaseId: string | null
  matchStatus: 'matched' | 'needs_review'
}

type LeaseOption = {
  id: string
  tenantName: string
  startDate: string
  endDate: string
}

export function ActualBilledUploadStep() {
  const { nextStep, setStepData, state } = useOnboarding()
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isUploaded, setIsUploaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    sourceType: string
    rowCount: number
    totalBilled: number
    warnings: string[]
    items: UploadedBillingItem[]
  } | null>(null)
  const [uploadedBillingPeriod, setUploadedBillingPeriod] = useState<{
    propertyId: string
    periodStart: string
    periodEnd: string
    needsAcceptance: boolean
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'upload' | 'manual'>('upload')
  const [isContinuingWithUpload, setIsContinuingWithUpload] = useState(false)
  const [isCorrectingUploadedRows, setIsCorrectingUploadedRows] =
    useState(false)
  const [leaseOptions, setLeaseOptions] = useState<LeaseOption[]>([])
  const [isLoadingLeaseOptions, setIsLoadingLeaseOptions] = useState(false)
  const [matchSelections, setMatchSelections] = useState<
    Record<string, string>
  >({})
  const [isSavingMatches, setIsSavingMatches] = useState(false)

  // Manual entry state
  const [manualAmount, setManualAmount] = useState('')
  const [isSubmittingManual, setIsSubmittingManual] = useState(false)

  // Use GL data year from context (set by LeakageResultStep or fetched here)
  const [glDataYear, setGlDataYear] = useState<number | null>(
    state.data.glDataYear ?? null
  )

  useEffect(() => {
    trackEvent('onboard_step_viewed', {
      step: 4,
      step_label: 'Billed Amounts',
    })
  }, [])

  useEffect(() => {
    const propertyId = state.data.propertyId
    if (!propertyId || glDataYear !== null) return

    const fetchGlDateRange = async () => {
      try {
        const response = await authenticatedFetch(
          `/api/v1/ingestion/gl-date-range/${propertyId}`
        )
        if (response.ok) {
          const data = await response.json()
          setGlDataYear(data.year)
        }
      } catch {
        // Fallback to currentYear - 1
      }
    }

    void fetchGlDateRange()
  }, [state.data.propertyId, glDataYear])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (!droppedFile) return
    if (isBillingUploadFile(droppedFile)) {
      setFile(droppedFile)
      setError(null)
      return
    }
    setFile(null)
    setError(BILLING_UPLOAD_ERROR)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    if (isBillingUploadFile(selectedFile)) {
      setFile(selectedFile)
      setError(null)
      return
    }
    setFile(null)
    setError(BILLING_UPLOAD_ERROR)
  }

  const triggerReconciliation = async (
    propertyId: string,
    periodStart: string,
    periodEnd: string
  ) => {
    const response = await authenticatedFetch(
      '/api/v1/reconciliation/calculate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: propertyId,
          period_start: periodStart,
          period_end: periodEnd,
          force_recalculate: false,
        }),
      }
    )

    if (!response.ok) {
      let detail = 'Failed to start reconciliation'
      try {
        const errorData = await response.json()
        detail = String(errorData.detail || detail)
      } catch {
        // use default detail
      }
      if (detail === 'no_active_leases_for_period') {
        throw new Error(
          'We could not find any tenants for this year. Go back and add a tenant first.'
        )
      }
      throw new Error(detail)
    }

    const data = await response.json()
    if (data.job_id) {
      setStepData('reconciliationJobId', data.job_id)
    }
  }

  const deleteBilledRowsForPeriod = async (
    propertyId: string,
    periodStart: string,
    periodEnd: string
  ) => {
    const query = new URLSearchParams({
      period_start: periodStart,
      period_end: periodEnd,
    })
    const response = await authenticatedFetch(
      `/api/v1/actual-billed/${propertyId}?${query.toString()}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      let detail = 'Failed to replace billing data'
      try {
        const errorData = await response.json()
        detail = String(errorData.detail || detail)
      } catch {
        // use default detail
      }
      throw new Error(detail)
    }
  }

  const fetchActiveLeaseOptions = async (
    propertyId: string,
    periodStart: string,
    periodEnd: string
  ) => {
    setIsLoadingLeaseOptions(true)
    try {
      const leases: unknown[] = []
      const limit = 100
      let skip = 0
      let hasMore = true
      while (hasMore) {
        const query = new URLSearchParams({
          property_id: propertyId,
          status: 'active',
          skip: String(skip),
          limit: String(limit),
        })
        const response = await authenticatedFetch(
          `/api/v1/leases?${query.toString()}`
        )
        if (!response.ok) {
          throw new Error('Failed to load tenants')
        }
        const data = await response.json()
        const pageLeases: unknown[] = Array.isArray(data.data) ? data.data : []
        leases.push(...pageLeases)
        hasMore = data.has_more === true
        skip += limit
      }
      setLeaseOptions(
        leases
          .map((rawLease) => {
            const lease = rawLease as Record<string, unknown>

            return {
              id: String(lease.id),
              tenantName: String(lease.tenant_name),
              startDate: String(lease.start_date),
              endDate: String(lease.end_date),
            }
          })
          .filter(
            (lease) =>
              lease.startDate <= periodEnd && lease.endDate >= periodStart
          )
      )
    } catch (err) {
      logger.error('Failed to load lease match options during onboarding', {
        error: err,
      })
      setError(
        'We could not load your tenants. You can still type the right total.'
      )
    } finally {
      setIsLoadingLeaseOptions(false)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    const propertyId = state.data.propertyId
    if (!propertyId) {
      setError(
        'No property selected. Please go back and create a property first.'
      )
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const year = glDataYear ?? new Date().getFullYear() - 1
      const periodStart = `${year}-01-01`
      const periodEnd = `${year}-12-31`

      const formData = new FormData()
      formData.append('file', file)
      formData.append('property_id', propertyId)
      formData.append('period_start', periodStart)
      formData.append('period_end', periodEnd)

      const response = await authenticatedFetch(
        '/api/v1/actual-billed/upload',
        {
          method: 'POST',
          body: formData,
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(
          errorData.detail?.message || 'Failed to upload billing data'
        )
      }

      const data = await response.json()
      const warnings = Array.isArray(data.warnings) ? data.warnings : []
      const rawItems: unknown[] = Array.isArray(data.items) ? data.items : []
      const items = rawItems.length
        ? rawItems.map((rawItem): UploadedBillingItem => {
            const item = rawItem as Record<string, unknown>

            return {
              id: String(item.id ?? ''),
              tenantName: String(item.tenant_name ?? ''),
              billedAmount: String(item.billed_amount ?? ''),
              suite: item.suite === null ? null : String(item.suite ?? ''),
              leaseId:
                item.lease_id === null ? null : String(item.lease_id ?? ''),
              matchStatus:
                item.match_status === 'matched' ? 'matched' : 'needs_review',
            }
          })
        : []
      const unmatchedItems = items.filter(
        (item) => item.matchStatus === 'needs_review'
      )

      setUploadResult({
        sourceType: data.source_type,
        rowCount: data.row_count,
        totalBilled: data.total_billed,
        warnings,
        items,
      })
      setMatchSelections({})
      setUploadedBillingPeriod({
        propertyId,
        periodStart,
        periodEnd,
        needsAcceptance: warnings.length > 0 || unmatchedItems.length > 0,
      })
      setIsUploaded(true)

      trackEvent('actual_billed_uploaded', {
        property_id: propertyId,
        method: 'file',
        source_type: data.source_type,
        row_count: data.row_count,
        total_billed_bucket: getAmountBucket(data.total_billed),
        period_start: periodStart,
        period_end: periodEnd,
      })

      logger.info('Billing data uploaded during onboarding', {
        sourceType: data.source_type,
        rowCount: data.row_count,
        totalBilled: data.total_billed,
      })

      if (warnings.length === 0 && unmatchedItems.length === 0) {
        setStepData('billingDataUploaded', true)
        setStepData('totalBilled', data.total_billed)
        trackEvent('onboard_step_completed', {
          step: 4,
          step_label: 'Billed Amounts',
          method: 'file',
        })
        await triggerReconciliation(propertyId, periodStart, periodEnd)
      }
      if (unmatchedItems.length > 0) {
        await fetchActiveLeaseOptions(propertyId, periodStart, periodEnd)
      }
    } catch (err) {
      logger.error('Billing file upload failed during onboarding', {
        fileName: file.name,
        error: err,
      })
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to upload billing file. Please try again.'
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const propertyId = state.data.propertyId
    if (!propertyId) {
      setError(
        'No property selected. Please go back and create a property first.'
      )
      return
    }

    const amount = parseFloat(manualAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount greater than 0')
      return
    }

    setIsSubmittingManual(true)
    setError(null)

    try {
      const year = glDataYear ?? new Date().getFullYear() - 1
      const periodStart = `${year}-01-01`
      const periodEnd = `${year}-12-31`

      if (isCorrectingUploadedRows && uploadedBillingPeriod) {
        await deleteBilledRowsForPeriod(
          uploadedBillingPeriod.propertyId,
          uploadedBillingPeriod.periodStart,
          uploadedBillingPeriod.periodEnd
        )
      }

      const response = await authenticatedFetch(
        '/api/v1/actual-billed/manual',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            property_id: propertyId,
            period_start: periodStart,
            period_end: periodEnd,
            total_billed: amount,
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to save billing data')
      }

      setStepData('billingDataUploaded', true)
      setStepData('totalBilled', amount)
      setUploadedBillingPeriod(null)
      setIsCorrectingUploadedRows(false)
      setUploadResult({
        sourceType: 'manual',
        rowCount: 1,
        totalBilled: amount,
        warnings: [],
        items: [],
      })
      setIsUploaded(true)

      trackEvent('onboard_step_completed', {
        step: 4,
        step_label: 'Billed Amounts',
        method: 'manual',
      })
      trackEvent('actual_billed_uploaded', {
        property_id: propertyId,
        method: 'manual',
        row_count: 1,
        total_billed_bucket: getAmountBucket(amount),
        period_start: periodStart,
        period_end: periodEnd,
      })

      logger.info('Manual billing amount entered during onboarding', {
        totalBilled: amount,
      })

      await triggerReconciliation(propertyId, periodStart, periodEnd)
    } catch (err) {
      logger.error('Manual billing entry failed during onboarding', {
        error: err,
      })
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save billing data. Please try again.'
      )
    } finally {
      setIsSubmittingManual(false)
    }
  }

  const handleTypeCorrectedTotal = () => {
    if (!uploadResult) return

    setManualAmount(String(uploadResult.totalBilled))
    setIsUploaded(false)
    setUploadResult(null)
    setFile(null)
    setError(null)
    setIsCorrectingUploadedRows(true)
    setActiveTab('manual')
  }

  const handleContinueWithUpload = async () => {
    if (!uploadResult || !uploadedBillingPeriod) {
      nextStep()
      return
    }

    if (!uploadedBillingPeriod.needsAcceptance) {
      nextStep()
      return
    }

    setIsContinuingWithUpload(true)
    setError(null)

    try {
      const rowsNeedingMatches = uploadResult.items.filter(
        (item) => item.matchStatus === 'needs_review'
      )
      if (rowsNeedingMatches.length > 0) {
        const missingSelection = rowsNeedingMatches.some(
          (item) => !matchSelections[item.id]
        )
        if (missingSelection) {
          setError('Pick a tenant for each row before you continue.')
          return
        }
        setIsSavingMatches(true)
        const response = await authenticatedFetch(
          '/api/v1/actual-billed/matches',
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              property_id: uploadedBillingPeriod.propertyId,
              period_start: uploadedBillingPeriod.periodStart,
              period_end: uploadedBillingPeriod.periodEnd,
              matches: rowsNeedingMatches.map((item) => ({
                actual_billed_id: item.id,
                lease_id: matchSelections[item.id],
              })),
            }),
          }
        )
        if (!response.ok) {
          throw new Error('Failed to save tenant matches')
        }
      }
      setStepData('billingDataUploaded', true)
      setStepData('totalBilled', uploadResult.totalBilled)
      trackEvent('onboard_step_completed', {
        step: 4,
        step_label: 'Billed Amounts',
        method: 'file',
      })
      await triggerReconciliation(
        uploadedBillingPeriod.propertyId,
        uploadedBillingPeriod.periodStart,
        uploadedBillingPeriod.periodEnd
      )
      setUploadedBillingPeriod({
        ...uploadedBillingPeriod,
        needsAcceptance: false,
      })
      nextStep()
    } catch (err) {
      logger.error('Billing upload acceptance failed during onboarding', {
        error: err,
      })
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to start reconciliation. Please try again.'
      )
    } finally {
      setIsSavingMatches(false)
      setIsContinuingWithUpload(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Receipt className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          What you charged your tenants
        </h2>
        <p className="text-muted-foreground">
          Tell us what you charged tenants last year. We check it against your
          costs. Then we show over-bills and under-bills.
        </p>
      </div>

      <SecurityTrustPanel />

      {/* Success state */}
      {isUploaded && uploadResult ? (
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-success/20 bg-success/10 p-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-success" />
            <h3 className="mb-2 text-lg font-medium text-success">Got it</h3>
            {uploadResult.sourceType !== 'manual' && (
              <p className="text-sm text-success-strong mb-2">
                From:{' '}
                <span className="font-semibold">
                  {sourceLabel(uploadResult.sourceType)}
                </span>
              </p>
            )}
            <p className="text-sm text-success-strong">
              You charged:{' '}
              <span className="font-semibold font-mono tabular-nums">
                {formatMoney(uploadResult.totalBilled)}
              </span>
            </p>
          </div>
          {uploadResult.warnings.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="space-y-3">
                <p className="font-medium">Some rows need a look.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {uploadResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <p>If those rows change the total, type the right amount.</p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={handleTypeCorrectedTotal}
                >
                  Start with the right total
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {uploadResult.items.some(
            (item) => item.matchStatus === 'needs_review'
          ) && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold">
                  Match these rows to tenants
                </h4>
                <p className="text-sm text-muted-foreground">
                  Pick the tenant that belongs to each billed row.
                </p>
              </div>
              {isLoadingLeaseOptions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading tenants
                </div>
              ) : (
                <div className="space-y-3">
                  {uploadResult.items
                    .filter((item) => item.matchStatus === 'needs_review')
                    .map((item) => (
                      <div key={item.id} className="space-y-2">
                        <Label htmlFor={`match-${item.id}`}>
                          {item.suite
                            ? `${item.tenantName} / suite ${item.suite}`
                            : item.tenantName}
                        </Label>
                        <Select
                          value={matchSelections[item.id] ?? ''}
                          onValueChange={(leaseId) =>
                            setMatchSelections((current) => ({
                              ...current,
                              [item.id]: leaseId,
                            }))
                          }
                        >
                          <SelectTrigger id={`match-${item.id}`}>
                            <SelectValue placeholder="Choose a tenant" />
                          </SelectTrigger>
                          <SelectContent>
                            {leaseOptions.map((lease) => (
                              <SelectItem key={lease.id} value={lease.id}>
                                {lease.tenantName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
          <Button
            onClick={handleContinueWithUpload}
            disabled={
              isContinuingWithUpload ||
              isSavingMatches ||
              isLoadingLeaseOptions ||
              uploadResult.items
                .filter((item) => item.matchStatus === 'needs_review')
                .some((item) => !matchSelections[item.id])
            }
            className="w-full min-h-[44px]"
          >
            {isSavingMatches ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving matches
              </>
            ) : (
              'See my results'
            )}
          </Button>
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'upload' | 'manual')}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Add a file</TabsTrigger>
            <TabsTrigger value="manual">Type the total</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <ExportGuide type="cam-billed" />
            <div className="mb-4 space-y-3">
              <BeginnerFileGuide type="billing" />
              <GuideCallout title="What if I only know the total?">
                <p>
                  Pick &quot;Type the total&quot; if you do not have the full
                  report yet. The total lets us show you an early number. You
                  can add the full report later.
                </p>
              </GuideCallout>
            </div>
            {/* File upload area */}
            {file ? (
              <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-8">
                <div className="text-center">
                  <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 text-primary" />
                  <h3 className="mb-1 font-medium">{file.name}</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setFile(null)}
                      disabled={isUploading}
                      className="min-h-[44px]"
                    >
                      Pick a different file
                    </Button>
                    <Button
                      onClick={handleUpload}
                      disabled={isUploading}
                      className="min-h-[44px]"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding your file…
                        </>
                      ) : (
                        'Use this file'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-200',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="billing-file-upload"
                  className="sr-only"
                  accept={BILLING_UPLOAD_ACCEPT}
                  onChange={handleFileChange}
                />
                <label htmlFor="billing-file-upload" className="cursor-pointer">
                  <Receipt className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 font-medium">
                    Drop your billing report here
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Upload a CSV or XLSX with tenant names and amounts charged.
                  </p>
                </label>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <form
              onSubmit={handleManualSubmit}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="manualAmount">
                  How much did you charge last year?
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="manualAmount"
                    type="number"
                    placeholder="e.g., 125000"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="pl-9"
                    min="0"
                    step="0.01"
                    required
                    aria-describedby="manualAmount-help"
                  />
                </div>
                <p
                  id="manualAmount-help"
                  className="text-xs text-muted-foreground"
                >
                  Add up what you billed all your tenants for shared costs.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full min-h-[44px]"
                disabled={isSubmittingManual || !manualAmount}
              >
                {isSubmittingManual ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'See my results'
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      )}

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* No property warning */}
      {!state.data.propertyId && !isUploaded && (
        <Alert className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have not added a building yet. Go back and add your building
            first.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
