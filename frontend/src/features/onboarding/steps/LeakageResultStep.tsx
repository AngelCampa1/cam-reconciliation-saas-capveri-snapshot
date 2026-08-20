/**
 * Leakage Result Step Component
 *
 * Step 5 of onboarding - shows the statement comparison result.
 * If data is missing, allows inline upload to complete the flow.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  AlertCircle,
  FileCheck,
  Loader2,
  DollarSign,
  CheckCircle2,
  Upload,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOnboarding } from '../OnboardingContext'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { logger } from '@/lib/logger'
import { apiClient, getSession } from '@/api/client'
import { uploadFileApiV1IngestionUploadPost } from '@/api/generated'
import { resolveApiUrl } from '@/api/url'
import { trackEvent } from '@/lib/analytics'
import { useFreeAuditStatus } from '@/hooks/use-free-audit-status'
import { OnboardingResultsPaywall } from '../components/OnboardingResultsPaywall'
import { GLAnalysisTeaserCard } from '../../plg/components/GLAnalysisTeaserCard'

interface LeakageData {
  capveri_calculated: number
  actual_billed: number
  leakage: number
  leakage_pct: number
  has_reconciliation_data: boolean
  has_gl_data: boolean
  has_billing_data: boolean
}

interface GlDateRange {
  min_date: string
  max_date: string
  year: number
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

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 90000

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export function LeakageResultStep() {
  const navigate = useNavigate()
  const { completeOnboarding, setStepData, state } = useOnboarding()
  const { data: freeAuditStatus } = useFreeAuditStatus()
  const hasSubscription = Boolean(freeAuditStatus?.has_subscription)
  const [isLoading, setIsLoading] = useState(true)
  const [timedOut, setTimedOut] = useState(false)
  const [leakageData, setLeakageData] = useState<LeakageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // GL Upload state
  const [glFile, setGlFile] = useState<File | null>(null)
  const [isGlDragging, setIsGlDragging] = useState(false)
  const [isGlUploading, setIsGlUploading] = useState(false)
  const [glUploaded, setGlUploaded] = useState(false)

  // Billing Upload state
  const [billingFile, setBillingFile] = useState<File | null>(null)
  const [isBillingDragging, setIsBillingDragging] = useState(false)
  const [isBillingUploading, setIsBillingUploading] = useState(false)
  const [billingUploaded, setBillingUploaded] = useState(false)
  const [billingWarnings, setBillingWarnings] = useState<string[]>([])
  const [uploadedBillingItems, setUploadedBillingItems] = useState<
    UploadedBillingItem[]
  >([])
  const [uploadedBillingTotal, setUploadedBillingTotal] = useState<
    number | null
  >(null)
  const [leaseOptions, setLeaseOptions] = useState<LeaseOption[]>([])
  const [isLoadingLeaseOptions, setIsLoadingLeaseOptions] = useState(false)
  const [matchSelections, setMatchSelections] = useState<
    Record<string, string>
  >({})
  const [isSavingMatches, setIsSavingMatches] = useState(false)
  const [manualAmount, setManualAmount] = useState('')
  const [isManualSubmitting, setIsManualSubmitting] = useState(false)

  const [glDataYear, setGlDataYear] = useState<number | null>(null)
  const hasFiredAuditEvent = useRef(false)

  // Fetch GL data year range to determine the correct period
  useEffect(() => {
    const propertyId = state.data.propertyId
    if (!propertyId) return

    const fetchGlDateRange = async () => {
      try {
        const session = await getSession()
        const response = await fetch(
          resolveApiUrl(`/api/v1/ingestion/gl-date-range/${propertyId}`),
          {
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {},
          }
        )
        if (response.ok) {
          const data: GlDateRange = await response.json()
          setGlDataYear(data.year)
          setStepData('glDataYear', data.year)
        }
      } catch {
        // Fallback to currentYear - 1 handled in fetchLeakage
      }
    }

    void fetchGlDateRange()
  }, [state.data.propertyId, setStepData])

  // Fire analytics + post-audit email once when results first appear
  useEffect(() => {
    if (
      leakageData?.has_reconciliation_data &&
      !hasFiredAuditEvent.current &&
      state.data.propertyId
    ) {
      hasFiredAuditEvent.current = true

      trackEvent('free_audit_completed', {
        recovery_amount: leakageData.leakage,
        property_id: state.data.propertyId,
      })
    }
  }, [leakageData, state.data.propertyId])

  const fetchLeakage = useCallback(async (): Promise<LeakageData | null> => {
    const propertyId = state.data.propertyId
    if (!propertyId) {
      setError('No property selected')
      setIsLoading(false)
      return null
    }

    try {
      const year = glDataYear ?? new Date().getFullYear() - 1
      const periodStart = `${year}-01-01`
      const periodEnd = `${year}-12-31`

      const session = await getSession()
      const response = await fetch(
        resolveApiUrl(
          `/api/v1/leakage/${propertyId}?period_start=${periodStart}&period_end=${periodEnd}&include_drafts=true`
        ),
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        }
      )

      if (!response.ok) {
        throw new Error('Failed to calculate leakage')
      }

      const data = await response.json()
      setLeakageData(data)
      setError(null)

      // Store in context
      setStepData('leakageCalculated', true)
      setStepData('capveriCalculated', data.capveri_calculated)
      setStepData('actualBilled', data.actual_billed)
      setStepData('leakage', data.leakage)
      setStepData('leakagePct', data.leakage_pct)

      logger.info('Leakage calculated during onboarding', {
        propertyId,
        leakage: data.leakage,
        leakagePct: data.leakage_pct,
      })

      if (data.has_reconciliation_data) {
        setIsLoading(false)
      }

      return data
    } catch (err) {
      logger.error('Failed to calculate leakage', { error: err })
      // Don't show error - we'll show upload UI instead
      setLeakageData(null)
      setIsLoading(false)
      return null
    }
  }, [state.data.propertyId, setStepData, glDataYear])

  useEffect(() => {
    if (!state.data.propertyId) return

    let isActive = true
    let elapsed = 0
    let timerId: ReturnType<typeof setTimeout> | undefined

    setIsLoading(true)
    setTimedOut(false)

    const poll = async () => {
      const result = await fetchLeakage()
      if (!isActive) return

      // Stop polling on API failure and let existing upload fallback UI render.
      if (!result) {
        setIsLoading(false)
        return
      }

      if (result.has_reconciliation_data) {
        return
      }

      // If required inputs are missing, stop polling and render upload UI immediately.
      if (!result.has_gl_data || !result.has_billing_data) {
        setIsLoading(false)
        return
      }

      elapsed += POLL_INTERVAL_MS
      if (elapsed >= POLL_TIMEOUT_MS) {
        setTimedOut(true)
        setIsLoading(false)
        return
      }

      timerId = setTimeout(poll, POLL_INTERVAL_MS)
    }

    void poll()

    return () => {
      isActive = false
      if (timerId) {
        clearTimeout(timerId)
      }
    }
  }, [fetchLeakage, state.data.propertyId])

  // GL file handlers
  const handleGlDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsGlDragging(true)
  }, [])

  const handleGlDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsGlDragging(false)
  }, [])

  const handleGlDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsGlDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && ACCEPTED_TYPES.includes(droppedFile.type)) {
      setGlFile(droppedFile)
    }
  }, [])

  const handleGlUpload = async () => {
    if (!glFile || !state.data.propertyId) return

    setIsGlUploading(true)
    setError(null)

    try {
      const response = await uploadFileApiV1IngestionUploadPost({
        client: apiClient,
        body: {
          file: glFile,
          property_id: state.data.propertyId,
        },
      })

      if (response.error) {
        throw new Error(String(response.error.detail || 'Failed to upload GL'))
      }

      if (response.data) {
        setStepData('importBatchId', response.data.batch_id)
        setGlUploaded(true)
        logger.info('GL uploaded on leakage step', {
          batchId: response.data.batch_id,
        })

        // Refetch leakage after upload
        setIsLoading(true)
        await fetchLeakage()
      }
    } catch (err) {
      logger.error('GL upload failed on leakage step', { error: err })
      setError(err instanceof Error ? err.message : 'Failed to upload GL file')
    } finally {
      setIsGlUploading(false)
    }
  }

  // Billing file handlers
  const handleBillingDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsBillingDragging(true)
  }, [])

  const handleBillingDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsBillingDragging(false)
  }, [])

  const handleBillingDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsBillingDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && ACCEPTED_TYPES.includes(droppedFile.type)) {
      setBillingFile(droppedFile)
    }
  }, [])

  const getBillingPeriod = () => {
    const year = glDataYear ?? new Date().getFullYear() - 1
    return {
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
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
      const session = await getSession()
      while (hasMore) {
        const query = new URLSearchParams({
          property_id: propertyId,
          status: 'active',
          skip: String(skip),
          limit: String(limit),
        })
        const response = await fetch(
          resolveApiUrl(`/api/v1/leases?${query.toString()}`),
          {
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {},
          }
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
      logger.error('Failed to load lease match options on leakage step', {
        error: err,
      })
      setError(
        'We could not load your tenants. You can still type the right total.'
      )
    } finally {
      setIsLoadingLeaseOptions(false)
    }
  }

  const handleBillingUpload = async () => {
    if (!billingFile || !state.data.propertyId) return

    setIsBillingUploading(true)
    setError(null)

    try {
      const { periodStart, periodEnd } = getBillingPeriod()
      const formData = new FormData()
      formData.append('file', billingFile)
      formData.append('property_id', state.data.propertyId)
      formData.append('period_start', periodStart)
      formData.append('period_end', periodEnd)

      const session = await getSession()
      const response = await fetch(
        resolveApiUrl('/api/v1/actual-billed/upload'),
        {
          method: 'POST',
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
          body: formData,
        }
      )

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail?.message || 'Failed to upload billing')
      }

      const data = await response.json()
      const warnings = Array.isArray(data.warnings) ? data.warnings : []
      const items: UploadedBillingItem[] = Array.isArray(data.items)
        ? data.items.map((item: unknown) => {
            const row = item as Record<string, unknown>
            return {
              id: String(row.id),
              tenantName: String(row.tenant_name),
              billedAmount: String(row.billed_amount),
              suite: typeof row.suite === 'string' ? row.suite : null,
              leaseId: typeof row.lease_id === 'string' ? row.lease_id : null,
              matchStatus:
                row.match_status === 'needs_review'
                  ? 'needs_review'
                  : 'matched',
            }
          })
        : []
      const unmatchedItems = items.filter(
        (item) => item.matchStatus === 'needs_review'
      )
      setBillingWarnings(warnings)
      setUploadedBillingItems(items)
      setUploadedBillingTotal(Number(data.total_billed))
      setMatchSelections({})
      if (warnings.length > 0 || unmatchedItems.length > 0) {
        setManualAmount(String(data.total_billed))
        setBillingUploaded(false)
        if (unmatchedItems.length > 0) {
          await fetchActiveLeaseOptions(
            state.data.propertyId,
            periodStart,
            periodEnd
          )
        }
        return
      }

      setStepData('billingDataUploaded', true)
      setStepData('totalBilled', data.total_billed)
      setBillingUploaded(true)
      logger.info('Billing uploaded on leakage step', {
        total: data.total_billed,
      })

      // Refetch leakage
      setIsLoading(true)
      await fetchLeakage()
    } catch (err) {
      logger.error('Billing upload failed on leakage step', { error: err })
      setError(err instanceof Error ? err.message : 'Failed to upload billing')
    } finally {
      setIsBillingUploading(false)
    }
  }

  const handleSaveBillingMatches = async () => {
    if (!state.data.propertyId) return
    const rowsNeedingMatches = uploadedBillingItems.filter(
      (item) => item.matchStatus === 'needs_review'
    )
    if (rowsNeedingMatches.length === 0) return

    const missingSelection = rowsNeedingMatches.some(
      (item) => !matchSelections[item.id]
    )
    if (missingSelection) {
      setError('Pick a tenant for each row before you run it.')
      return
    }

    setIsSavingMatches(true)
    setError(null)
    try {
      const { periodStart, periodEnd } = getBillingPeriod()
      const session = await getSession()
      const response = await fetch(
        resolveApiUrl('/api/v1/actual-billed/matches'),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && {
              Authorization: `Bearer ${session.access_token}`,
            }),
          },
          body: JSON.stringify({
            property_id: state.data.propertyId,
            period_start: periodStart,
            period_end: periodEnd,
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

      setStepData('billingDataUploaded', true)
      setStepData('totalBilled', uploadedBillingTotal ?? 0)
      setBillingUploaded(true)
      setBillingWarnings([])
      setUploadedBillingItems([])
      logger.info('Billing row matches saved on leakage step', {
        count: rowsNeedingMatches.length,
      })

      setIsLoading(true)
      await fetchLeakage()
    } catch (err) {
      logger.error('Billing match save failed on leakage step', { error: err })
      setError(
        err instanceof Error ? err.message : 'Failed to save tenant matches'
      )
    } finally {
      setIsSavingMatches(false)
    }
  }

  const handleManualBillingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!state.data.propertyId) return

    const amount = parseFloat(manualAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount greater than 0')
      return
    }

    setIsManualSubmitting(true)
    setError(null)

    try {
      const year = glDataYear ?? new Date().getFullYear() - 1
      const session = await getSession()
      const response = await fetch(
        resolveApiUrl('/api/v1/actual-billed/manual'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && {
              Authorization: `Bearer ${session.access_token}`,
            }),
          },
          body: JSON.stringify({
            property_id: state.data.propertyId,
            period_start: `${year}-01-01`,
            period_end: `${year}-12-31`,
            total_billed: amount,
          }),
        }
      )

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || 'Failed to save billing')
      }

      setStepData('billingDataUploaded', true)
      setStepData('totalBilled', amount)
      setBillingUploaded(true)
      setBillingWarnings([])
      logger.info('Manual billing entered on leakage step', { amount })

      // Refetch leakage
      setIsLoading(true)
      await fetchLeakage()
    } catch (err) {
      logger.error('Manual billing failed on leakage step', { error: err })
      setError(err instanceof Error ? err.message : 'Failed to save billing')
    } finally {
      setIsManualSubmitting(false)
    }
  }

  const handleSkip = () => {
    completeOnboarding()
  }

  const handleReviewReconciliation = () => {
    const propertyId = state.data.propertyId
    const year = glDataYear ?? new Date().getFullYear() - 1
    completeOnboarding()
    if (propertyId) {
      navigate(`/properties/${propertyId}/reconciliations?year=${year}`)
    } else {
      navigate('/dashboard')
    }
  }

  const billingRowsNeedingMatches = uploadedBillingItems.filter(
    (item) => item.matchStatus === 'needs_review'
  )
  const canSaveBillingMatches =
    billingRowsNeedingMatches.length > 0 &&
    billingRowsNeedingMatches.every((item) => Boolean(matchSelections[item.id]))

  const renderBillingMatchSelector = () => {
    if (billingRowsNeedingMatches.length === 0) return null

    return (
      <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4">
        <div>
          <p className="text-sm font-medium">Match these rows to tenants</p>
          <p className="text-xs text-muted-foreground">
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
            {billingRowsNeedingMatches.map((item) => (
              <div key={item.id} className="space-y-2">
                <Label>
                  {item.tenantName} - {formatMoney(Number(item.billedAmount))}
                  {item.suite ? ` - Suite ${item.suite}` : ''}
                </Label>
                <Select
                  value={matchSelections[item.id] ?? ''}
                  onValueChange={(value) =>
                    setMatchSelections((current) => ({
                      ...current,
                      [item.id]: value,
                    }))
                  }
                >
                  <SelectTrigger>
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
        <Button
          type="button"
          className="w-full min-h-[44px]"
          onClick={handleSaveBillingMatches}
          disabled={
            isSavingMatches || isLoadingLeaseOptions || !canSaveBillingMatches
          }
        >
          {isSavingMatches ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving matches
            </>
          ) : (
            'Run Reconciliation'
          )}
        </Button>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Spinner size="lg" />
          </div>
          <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
            Analyzing your CAM data...
          </h2>
          <p className="text-muted-foreground">Usually takes a few seconds.</p>
        </div>
      </div>
    )
  }

  if (timedOut && leakageData && !leakageData.has_reconciliation_data) {
    const year = glDataYear ?? new Date().getFullYear() - 1
    const propertyId = state.data.propertyId

    return (
      <div className="mx-auto max-w-lg text-center">
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
            Your reconciliation draft is ready for review
          </h2>
          <p className="text-muted-foreground mb-6">
            Your data has been processed. Review your reconciliation results in
            the dashboard.
          </p>
        </div>
        <div className="space-y-3">
          {hasSubscription && (
            <Button
              variant="outline"
              className="w-full min-h-[44px]"
              onClick={() => {
                window.location.href = `/properties/${propertyId}/reconciliations?year=${year}`
              }}
            >
              Review Reconciliation
            </Button>
          )}
          <Button className="w-full min-h-[44px]" onClick={handleSkip}>
            Continue
          </Button>
        </div>
      </div>
    )
  }

  // Missing data state - show inline upload UI
  if (error || !leakageData) {
    // When leakageData is null (API failed), fall back to frontend state
    const needsGl = !glUploaded
    const needsBilling = !billingUploaded

    // If files were uploaded in this session but API still failed
    const hasDataButApiFailed = glUploaded && billingUploaded

    if (hasDataButApiFailed) {
      return (
        <div className="mx-auto max-w-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
              Reconciliation In Progress
            </h2>
            <p className="text-muted-foreground mb-6">
              Your data has been uploaded. We're still running your
              reconciliation. Check your dashboard later to see your draft
              reconciliation.
            </p>
            <Button onClick={handleSkip}>Continue</Button>
          </div>
        </div>
      )
    }

    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
            Almost There!
          </h2>
          <p className="text-muted-foreground">
            Upload your data below to run your reconciliation.
          </p>
        </div>

        <div className="space-y-6">
          {/* GL Upload Section */}
          {needsGl && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Upload className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">1. Upload GL Data</h3>
                </div>
                {glFile ? (
                  <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">
                          {glFile.name}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGlFile(null)}
                          disabled={isGlUploading}
                        >
                          Change
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleGlUpload}
                          disabled={isGlUploading}
                        >
                          {isGlUploading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Uploading…
                            </>
                          ) : (
                            'Upload'
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors duration-200',
                      isGlDragging
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/25 hover:border-primary/50'
                    )}
                    onDragOver={handleGlDragOver}
                    onDragLeave={handleGlDragLeave}
                    onDrop={handleGlDrop}
                  >
                    <input
                      type="file"
                      id="gl-file-upload"
                      className="sr-only"
                      accept=".csv,.xls,.xlsx"
                      onChange={(e) => setGlFile(e.target.files?.[0] || null)}
                    />
                    <label htmlFor="gl-file-upload" className="cursor-pointer">
                      <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Drop GL export here</p>
                      <p className="text-xs text-muted-foreground">
                        CSV or Excel from Yardi/MRI
                      </p>
                    </label>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Billing Upload Section */}
          {needsBilling && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Receipt className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">
                    {needsGl ? '2. ' : ''}What Did You Bill Tenants?
                  </h3>
                </div>
                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload">Upload File</TabsTrigger>
                    <TabsTrigger value="manual">Enter Amount</TabsTrigger>
                  </TabsList>

                  <TabsContent value="upload" className="mt-4">
                    {billingWarnings.length > 0 && (
                      <Alert className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="space-y-3">
                          <p className="font-medium">Some rows need a look.</p>
                          <ul className="list-disc space-y-1 pl-5">
                            {billingWarnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                          <p>Pick tenants below, or type the right total.</p>
                        </AlertDescription>
                      </Alert>
                    )}
                    {renderBillingMatchSelector()}
                    {billingFile ? (
                      <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-5 w-5 text-primary" />
                            <span className="text-sm font-medium">
                              {billingFile.name}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setBillingFile(null)}
                              disabled={isBillingUploading}
                            >
                              Change
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleBillingUpload}
                              disabled={isBillingUploading}
                            >
                              {isBillingUploading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Uploading…
                                </>
                              ) : (
                                'Upload'
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors duration-200',
                          isBillingDragging
                            ? 'border-primary bg-primary/5'
                            : 'border-muted-foreground/25 hover:border-primary/50'
                        )}
                        onDragOver={handleBillingDragOver}
                        onDragLeave={handleBillingDragLeave}
                        onDrop={handleBillingDrop}
                      >
                        <input
                          type="file"
                          id="billing-file-upload-inline"
                          className="sr-only"
                          accept=".csv,.xls,.xlsx"
                          onChange={(e) =>
                            setBillingFile(e.target.files?.[0] || null)
                          }
                        />
                        <label
                          htmlFor="billing-file-upload-inline"
                          className="cursor-pointer"
                        >
                          <Receipt className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium">
                            Drop CAM recon report here
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Showing what you billed tenants
                          </p>
                        </label>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="manual" className="mt-4">
                    <form
                      onSubmit={handleManualBillingSubmit}
                      className="space-y-3"
                      noValidate
                    >
                      <div className="space-y-2">
                        <Label htmlFor="manualAmountInline">
                          Total CAM Billed Last Year
                        </Label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="manualAmountInline"
                            type="number"
                            placeholder="e.g., 125000"
                            value={manualAmount}
                            onChange={(e) => setManualAmount(e.target.value)}
                            className="pl-9"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="w-full min-h-[44px]"
                        disabled={isManualSubmitting || !manualAmount}
                      >
                        {isManualSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          'Run Reconciliation'
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Success indicators */}
          {glUploaded && (
            <div className="flex items-center gap-2 text-sm text-success-strong">
              <CheckCircle2 className="h-4 w-4" />
              GL data uploaded successfully
            </div>
          )}
          {billingUploaded && (
            <div className="flex items-center gap-2 text-sm text-success-strong">
              <CheckCircle2 className="h-4 w-4" />
              Billing data saved successfully
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Skip option */}
        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    )
  }

  // Check if we have data to compare - show inline upload for missing pieces
  // has_gl_data checks for import batches OR reconciliation snapshots on the backend
  const hasGlData = leakageData.has_gl_data || glUploaded
  const hasBillingData = leakageData.has_billing_data || billingUploaded

  // If both data sources are uploaded but no reconciliation exists yet, show processing message
  if (hasGlData && hasBillingData && !leakageData.has_reconciliation_data) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
            Data Uploaded Successfully!
          </h2>
          <p className="text-muted-foreground mb-6">
            Your GL and billing data have been uploaded. Run a reconciliation
            from your dashboard to see your draft reconciliation.
          </p>
          <Button onClick={handleSkip}>Continue</Button>
        </div>
      </div>
    )
  }

  if (!hasGlData || !hasBillingData) {
    const needsGl = !hasGlData
    const needsBilling = !hasBillingData

    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
            One More Step!
          </h2>
          <p className="text-muted-foreground">
            {needsGl && needsBilling
              ? 'Upload both files below to run your reconciliation.'
              : needsGl
                ? 'Upload your GL data to run your reconciliation.'
                : 'Tell us what you billed tenants to run your reconciliation.'}
          </p>
        </div>

        <div className="space-y-6">
          {/* GL Upload Section */}
          {needsGl && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Upload className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Upload GL Data</h3>
                </div>
                {glFile ? (
                  <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">
                          {glFile.name}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGlFile(null)}
                          disabled={isGlUploading}
                        >
                          Change
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleGlUpload}
                          disabled={isGlUploading}
                        >
                          {isGlUploading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Uploading…
                            </>
                          ) : (
                            'Upload'
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors duration-200',
                      isGlDragging
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/25 hover:border-primary/50'
                    )}
                    onDragOver={handleGlDragOver}
                    onDragLeave={handleGlDragLeave}
                    onDrop={handleGlDrop}
                  >
                    <input
                      type="file"
                      id="gl-file-upload-partial"
                      className="sr-only"
                      accept=".csv,.xls,.xlsx"
                      onChange={(e) => setGlFile(e.target.files?.[0] || null)}
                    />
                    <label
                      htmlFor="gl-file-upload-partial"
                      className="cursor-pointer"
                    >
                      <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Drop GL export here</p>
                      <p className="text-xs text-muted-foreground">
                        CSV or Excel from Yardi/MRI
                      </p>
                    </label>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Billing Upload Section */}
          {needsBilling && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Receipt className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">What Did You Bill Tenants?</h3>
                </div>
                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload">Upload File</TabsTrigger>
                    <TabsTrigger value="manual">Enter Amount</TabsTrigger>
                  </TabsList>

                  <TabsContent value="upload" className="mt-4">
                    {billingWarnings.length > 0 && (
                      <Alert className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="space-y-3">
                          <p className="font-medium">Some rows need a look.</p>
                          <ul className="list-disc space-y-1 pl-5">
                            {billingWarnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                          <p>Pick tenants below, or type the right total.</p>
                        </AlertDescription>
                      </Alert>
                    )}
                    {renderBillingMatchSelector()}
                    {billingFile ? (
                      <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-5 w-5 text-primary" />
                            <span className="text-sm font-medium">
                              {billingFile.name}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setBillingFile(null)}
                              disabled={isBillingUploading}
                            >
                              Change
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleBillingUpload}
                              disabled={isBillingUploading}
                            >
                              {isBillingUploading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Uploading…
                                </>
                              ) : (
                                'Upload'
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors duration-200',
                          isBillingDragging
                            ? 'border-primary bg-primary/5'
                            : 'border-muted-foreground/25 hover:border-primary/50'
                        )}
                        onDragOver={handleBillingDragOver}
                        onDragLeave={handleBillingDragLeave}
                        onDrop={handleBillingDrop}
                      >
                        <input
                          type="file"
                          id="billing-file-upload-partial"
                          className="sr-only"
                          accept=".csv,.xls,.xlsx"
                          onChange={(e) =>
                            setBillingFile(e.target.files?.[0] || null)
                          }
                        />
                        <label
                          htmlFor="billing-file-upload-partial"
                          className="cursor-pointer"
                        >
                          <Receipt className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium">
                            Drop CAM recon report here
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Showing what you billed tenants
                          </p>
                        </label>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="manual" className="mt-4">
                    <form
                      onSubmit={handleManualBillingSubmit}
                      className="space-y-3"
                      noValidate
                    >
                      <div className="space-y-2">
                        <Label htmlFor="manualAmountPartial">
                          Total CAM Billed Last Year
                        </Label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="manualAmountPartial"
                            type="number"
                            placeholder="e.g., 125000"
                            value={manualAmount}
                            onChange={(e) => setManualAmount(e.target.value)}
                            className="pl-9"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="w-full min-h-[44px]"
                        disabled={isManualSubmitting || !manualAmount}
                      >
                        {isManualSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          'Run Reconciliation'
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Success indicators */}
          {glUploaded && (
            <div className="flex items-center gap-2 text-sm text-success-strong">
              <CheckCircle2 className="h-4 w-4" />
              GL data uploaded successfully
            </div>
          )}
          {billingUploaded && (
            <div className="flex items-center gap-2 text-sm text-success-strong">
              <CheckCircle2 className="h-4 w-4" />
              Billing data saved successfully
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Skip option */}
        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    )
  }

  // Claimed state
  const hasLeakage = leakageData.leakage > 0
  const hasOverbilling = leakageData.leakage < 0

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-8 text-center">
        <div
          className={cn(
            'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full',
            hasLeakage || hasOverbilling ? 'bg-primary/10' : 'bg-muted'
          )}
        >
          <FileCheck className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Your draft reconciliation is ready
        </h2>
        <p className="text-muted-foreground">
          {hasLeakage
            ? 'This check caught under-bills before you send. Review the details below.'
            : hasOverbilling
              ? 'This check caught over-bills before you send. Review the details below.'
              : 'This check shows your CAM charges line up. Review the details below.'}
        </p>
      </div>

      {/* Results Card */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {hasSubscription && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    CapVeri Calculated:
                  </span>
                  <span className="font-semibold font-mono tabular-nums">
                    {formatMoney(leakageData.capveri_calculated)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    What You Billed:
                  </span>
                  <span className="font-semibold font-mono tabular-nums">
                    {formatMoney(leakageData.actual_billed)}
                  </span>
                </div>
                <hr />
              </>
            )}
            <div className="flex justify-between items-center text-lg">
              <span className="font-medium">
                {hasLeakage
                  ? 'Under-bills in this reconciliation:'
                  : hasOverbilling
                    ? 'Over-bills in this reconciliation:'
                    : 'Difference:'}
              </span>
              <span
                className={`font-bold font-mono tabular-nums ${hasLeakage || hasOverbilling ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {formatMoney(Math.abs(leakageData.leakage))}
                {(hasLeakage || hasOverbilling) &&
                  ` (${Math.abs(leakageData.leakage_pct).toFixed(1)}%)`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fine-print verification disclaimer */}
      <p className="mb-6 text-center text-xs text-muted-foreground">
        This is a draft from your files. Numbers may be off. Check your lease,
        GL, and billing before you act on them.
      </p>

      {!hasSubscription && (
        <>
          <GLAnalysisTeaserCard />
          <OnboardingResultsPaywall
            hasLeakage={hasLeakage}
            hasOverbilling={hasOverbilling}
            absoluteVariance={Math.abs(leakageData.leakage)}
          />
        </>
      )}

      {/* Continue button */}
      <div className="text-center mt-4">
        {hasSubscription && (
          <Button className="w-full mb-3" onClick={handleReviewReconciliation}>
            Review Draft Reconciliation
          </Button>
        )}
        <Button className="w-full mb-4" variant="outline" onClick={handleSkip}>
          Continue to Dashboard
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
