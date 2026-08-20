import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BackButton } from '@/components/layout/BackButton'
import { PDFViewer, type PdfLoadState } from '@/components/hitl/PDFViewer'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useViewport } from '@/hooks/useViewport'
import {
  BoundingBoxOverlay,
  type SourceHighlight,
} from '@/components/hitl/BoundingBoxOverlay'
import { VerificationLayout } from '@/components/hitl/VerificationLayout'
import {
  EditInterface,
  VERIFIABLE_FIELD_KEYS,
} from '@/features/verification/components/EditInterface'
import { VerificationSummary } from '@/features/verification/components/VerificationSummary'
import { ApprovalDialog } from '@/features/verification/components/ApprovalDialog'
import { RejectDialog } from '@/features/verification/components/RejectDialog'
import { useAutoSave } from '@/features/verification/hooks/useAutoSave'
import type { LeaseRecoveryProfile } from '@/types/lease-recovery-profile'
import type {
  FieldSourceReference,
  EditableFieldValue,
} from '@/features/verification/components/EditableField'
import {
  apiClient,
  getExtractionDetailApiV1ExtractionsDocumentIdGet,
  approveExtractionApiV1ExtractionsDocumentIdApprovePut,
  rejectExtractionApiV1ExtractionsDocumentIdRejectPut,
  listLeasesApiV1LeasesGet,
  createLeaseApiV1LeasesPost,
  type ApproveExtractionRequest,
  type RejectExtractionRequest,
  type EditAction,
  type Lease,
  type LeaseCreate,
} from '@/api/client'
import {
  getConfidenceBucket,
  getCountBucket,
  getFileSizeBucket,
  trackEvent,
} from '@/lib/analytics'

/**
 * Extraction detail response from API.
 */
interface ExtractionDetail {
  id: string
  filename: string
  status: string
  storage_bucket: string
  storage_key: string
  document_url: string
  content_type: string
  file_size_bytes: number
  extraction_result: {
    profile?: LeaseRecoveryProfile
    confidence_scores?: Record<string, number>
    source_references?: FieldSourceReference[]
  } | null
  created_at: string
  processed_at: string | null
  verified_at: string | null
  verified_by: string | null
  lease_id: string | null
  property_id: string | null
  edit_history: Array<{
    [key: string]: unknown
  }>
}

/**
 * Undo/Redo history state.
 */
interface HistoryState {
  past: LeaseRecoveryProfile[]
  present: LeaseRecoveryProfile
  future: LeaseRecoveryProfile[]
}

function getLeaseExtractionFieldGroup(field: string) {
  if (field.includes('date') || field.includes('year') || field === 'term') {
    return 'dates'
  }
  if (
    field.includes('amount') ||
    field.includes('percent') ||
    field.includes('share') ||
    field.includes('rate') ||
    field.includes('fee')
  ) {
    return 'economics'
  }
  if (field.includes('cap')) return 'caps'
  if (field.includes('expense') || field.includes('recovery')) {
    return 'recovery'
  }
  return 'other'
}

function getExtractionDetailTrackingProperties(extraction: ExtractionDetail) {
  const confidenceValues = Object.values(
    extraction.extraction_result?.confidence_scores ?? {}
  )
  const averageConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((total, value) => total + value, 0) /
        confidenceValues.length
      : null

  return {
    document_id: extraction.id,
    document_status: extraction.status,
    property_id: extraction.property_id ?? 'none',
    has_linked_lease: Boolean(extraction.lease_id),
    file_size_bucket: getFileSizeBucket(extraction.file_size_bytes),
    extracted_field_count_bucket: getCountBucket(
      Object.keys(extraction.extraction_result?.profile ?? {}).length
    ),
    source_reference_count_bucket: getCountBucket(
      extraction.extraction_result?.source_references?.length ?? 0
    ),
    confidence_bucket: getConfidenceBucket(averageConfidence),
  }
}

/**
 * Verification page for HITL review of AI-extracted lease data.
 *
 * Features:
 * - Split view: PDF viewer (left) + Edit interface (right)
 * - Real-time field editing with undo/redo
 * - Auto-save draft functionality
 * - Approval and rejection workflows
 * - Change tracking and audit trail
 */
export function VerificationPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const viewport = useViewport()

  // Calculate responsive PDF width
  const pdfWidth = useMemo(() => {
    if (viewport.isMobile) return viewport.width - 32 // Full width - padding
    if (viewport.isTablet) return 600
    return 800 // Desktop
  }, [viewport])

  // Track if we've initialized history to avoid re-initialization
  const hasInitialized = useRef(false)
  const hasTrackedView = useRef(false)
  const trackedEditedFieldGroups = useRef(new Set<string>())

  const [history, setHistory] = useState<HistoryState | null>(null)
  const [editHistory, setEditHistory] = useState<EditAction[]>([])
  // Fields the reviewer marked correct without editing (F-176). Lets an
  // accurate AI extraction reach full verification progress without forcing
  // the reviewer to make pointless edits.
  const [confirmedFields, setConfirmedFields] = useState<string[]>([])
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'low'>('all')
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  // Track whether the source PDF is visible. A reviewer must not approve
  // AI-extracted values without seeing the source document (F-231).
  const [pdfLoadState, setPdfLoadState] = useState<PdfLoadState>('loading')
  const [activeField, setActiveField] = useState<string | undefined>()
  const [selectedLeaseId, setSelectedLeaseId] = useState<string>('')
  const [showCreateLeaseDialog, setShowCreateLeaseDialog] = useState(false)
  const [newLeaseTenantName, setNewLeaseTenantName] = useState('')
  const [newLeaseStartDate, setNewLeaseStartDate] = useState('')
  const [newLeaseEndDate, setNewLeaseEndDate] = useState('')

  // Fetch extraction details
  const {
    data: extraction,
    isLoading,
    error,
    isPaused,
    refetch: refetchExtraction,
  } = useQuery<ExtractionDetail>({
    queryKey: ['extraction', documentId],
    queryFn: async () => {
      const { data, error } =
        await getExtractionDetailApiV1ExtractionsDocumentIdGet({
          client: apiClient,
          path: {
            document_id: documentId!,
          },
        })

      if (error) {
        throw new Error('Failed to fetch extraction')
      }

      return data as ExtractionDetail
    },
    enabled: !!documentId,
  })

  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves error null and extraction undefined, so without this guard the page
  // would render "Extraction Not Found" and imply the extraction was deleted
  // when the backend is simply unreachable.
  const isOffline = isPaused && !extraction

  // Fetch leases for the extraction's property when no lease is linked to the document
  const needsLeaseSelection = !!extraction && !extraction.lease_id
  // Gate approval. A reviewer must link a lease (when required) AND be able to
  // see the source PDF before approving AI-extracted values (F-231). If the
  // source failed to load, block approval so nobody rubber-stamps an
  // extraction they could not verify against the document.
  const pdfFailedToLoad = pdfLoadState === 'error'
  const approveDisabled =
    (needsLeaseSelection && !selectedLeaseId) || pdfFailedToLoad
  const approveDisabledReason = pdfFailedToLoad
    ? 'Load the source PDF before you approve.'
    : needsLeaseSelection && !selectedLeaseId
      ? 'Link a lease before you approve.'
      : null
  const propertyId = needsLeaseSelection
    ? (extraction?.property_id ?? null)
    : null
  const {
    data: availableLeasesData,
    isLoading: leasesLoading,
    isError: leasesError,
    refetch: refetchLeases,
  } = useQuery<{
    data?: Lease[]
  }>({
    queryKey: ['leases', propertyId],
    queryFn: async () => {
      const result = await listLeasesApiV1LeasesGet({
        client: apiClient,
        query: { property_id: propertyId!, limit: 100 },
      })
      return result.data ?? { data: [] }
    },
    enabled: !!propertyId,
  })
  const availableLeases: Lease[] = availableLeasesData?.data ?? []

  // Initialize undo/redo state when data loads
  useEffect(() => {
    if (extraction?.extraction_result?.profile && !hasInitialized.current) {
      const initialProfile = extraction.extraction_result.profile
      // Safe: ref guard ensures this only runs once on initial data load
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory({
        past: [],
        present: initialProfile,
        future: [],
      })
      hasInitialized.current = true
    }
  }, [extraction])

  useEffect(() => {
    if (
      extraction?.extraction_result?.profile &&
      history &&
      !hasTrackedView.current
    ) {
      trackEvent('lease_extraction_review_opened', {
        ...getExtractionDetailTrackingProperties(extraction),
        entry_point: 'verification_page',
      })
      hasTrackedView.current = true
    }
  }, [extraction, history])

  // Auto-save hook
  const isDirty = editHistory.length > 0
  const { isSaving, lastSaved, saveError, manualSave } = useAutoSave(
    documentId || '',
    history?.present || ({} as LeaseRecoveryProfile),
    isDirty,
    {
      enabled: !!history && !!documentId && isDirty,
    }
  )

  // Approval mutation
  const approveMutation = useMutation({
    mutationFn: async (data: ApproveExtractionRequest) => {
      const { data: result, error } =
        await approveExtractionApiV1ExtractionsDocumentIdApprovePut({
          client: apiClient,
          path: {
            document_id: documentId!,
          },
          body: data,
        })

      if (error) {
        throw new Error('Failed to approve extraction')
      }

      return result
    },
    onSuccess: () => {
      if (extraction) {
        trackEvent('lease_extraction_approved', {
          ...getExtractionDetailTrackingProperties(extraction),
          edit_count_bucket: getCountBucket(editHistory.length),
          linked_lease_selected: Boolean(
            selectedLeaseId || extraction.lease_id
          ),
        })
      }
      toast.success('Extraction approved successfully')
      queryClient.invalidateQueries({ queryKey: ['extractions'] })
      navigate('/extractions')
    },
    onError: () => {
      if (extraction) {
        trackEvent('lease_extraction_approval_failed', {
          ...getExtractionDetailTrackingProperties(extraction),
          edit_count_bucket: getCountBucket(editHistory.length),
          failure_stage: 'approve_request',
        })
      }
      toast.error('Failed to approve extraction')
    },
  })

  // Rejection mutation
  const rejectMutation = useMutation({
    mutationFn: async (data: RejectExtractionRequest) => {
      const { data: result, error } =
        await rejectExtractionApiV1ExtractionsDocumentIdRejectPut({
          client: apiClient,
          path: {
            document_id: documentId!,
          },
          body: data,
        })

      if (error) {
        throw new Error('Failed to reject extraction')
      }

      return result
    },
    onSuccess: () => {
      if (extraction) {
        trackEvent('lease_extraction_rejected', {
          ...getExtractionDetailTrackingProperties(extraction),
          edit_count_bucket: getCountBucket(editHistory.length),
        })
      }
      toast.success('Extraction rejected')
      queryClient.invalidateQueries({ queryKey: ['extractions'] })
      navigate('/extractions')
    },
    onError: () => {
      if (extraction) {
        trackEvent('lease_extraction_rejection_failed', {
          ...getExtractionDetailTrackingProperties(extraction),
          edit_count_bucket: getCountBucket(editHistory.length),
          failure_stage: 'reject_request',
        })
      }
      toast.error('Failed to reject extraction')
    },
  })

  // Quick-create lease mutation (used when a document's property has no leases yet)
  const createLeaseMutation = useMutation({
    mutationFn: async (data: LeaseCreate) => {
      const { data: result, error } = await createLeaseApiV1LeasesPost({
        client: apiClient,
        body: data,
      })

      if (error || !result) {
        throw new Error('Failed to create lease')
      }

      return result as Lease
    },
    onSuccess: (lease) => {
      if (extraction) {
        trackEvent('lease_extraction_field_edited', {
          ...getExtractionDetailTrackingProperties(extraction),
          field_group: 'lease_link',
        })
      }
      toast.success(`Lease created for ${lease.tenant_name}`)
      setSelectedLeaseId(lease.id)
      setShowCreateLeaseDialog(false)
      setNewLeaseTenantName('')
      setNewLeaseStartDate('')
      setNewLeaseEndDate('')
      queryClient.invalidateQueries({ queryKey: ['leases', propertyId] })
    },
    onError: () => {
      toast.error('Failed to create lease. Check the details and try again.')
    },
  })

  const handleCreateLease = () => {
    if (!extraction?.property_id || !history) return
    const recoveryProfile = {
      ...history.present,
      base_year: history.present.base_year ?? null,
      base_year_amount: history.present.base_year_amount ?? null,
      cap_rate: history.present.cap_rate ?? null,
    }
    createLeaseMutation.mutate({
      property_id: extraction.property_id,
      tenant_name: newLeaseTenantName.trim(),
      start_date: newLeaseStartDate,
      end_date: newLeaseEndDate,
      recovery_profile: recoveryProfile,
    })
  }

  const isNewLeaseValid =
    newLeaseTenantName.trim().length > 0 &&
    newLeaseStartDate.length > 0 &&
    newLeaseEndDate.length > 0 &&
    newLeaseEndDate >= newLeaseStartDate

  // Field change handler with undo/redo support
  const handleFieldChange = (field: string, value: EditableFieldValue) => {
    if (!history) return
    const fieldGroup = getLeaseExtractionFieldGroup(field)
    if (extraction) {
      const trackingKey = `${extraction.id}:${fieldGroup}`
      if (!trackedEditedFieldGroups.current.has(trackingKey)) {
        trackedEditedFieldGroups.current.add(trackingKey)
        trackEvent('lease_extraction_field_edited', {
          ...getExtractionDetailTrackingProperties(extraction),
          field_group: fieldGroup,
          edit_count_bucket: getCountBucket(editHistory.length + 1),
        })
      }
    }

    const newProfile = { ...history.present, [field]: value }

    // Record change in edit history
    const change = {
      field,
      old_value: String(
        history.present[field as keyof LeaseRecoveryProfile] ?? ''
      ),
      new_value: String(value ?? ''),
      timestamp: new Date().toISOString(),
    }

    setEditHistory((prev) => [...prev, change])

    // Update undo/redo state
    setHistory({
      past: [...history.past, history.present],
      present: newProfile,
      future: [], // Clear future on new change
    })
  }

  // Undo handler
  const handleUndo = useCallback(() => {
    if (!history || history.past.length === 0) return

    const previous = history.past[history.past.length - 1]
    const newPast = history.past.slice(0, -1)

    setHistory({
      past: newPast,
      present: previous as LeaseRecoveryProfile,
      future: [history.present, ...history.future],
    })
  }, [history])

  // Redo handler
  const handleRedo = useCallback(() => {
    if (!history || history.future.length === 0) return

    const next = history.future[0]
    const newFuture = history.future.slice(1)

    setHistory({
      past: [...history.past, history.present],
      present: next as LeaseRecoveryProfile,
      future: newFuture,
    })
  }, [history])

  // Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo), Ctrl+Enter (approve)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The quick-create lease dialog owns its own text inputs; don't let
      // profile undo/redo or approve shortcuts fire while it is open.
      if (showCreateLeaseDialog) return
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          handleUndo()
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault()
          handleRedo()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (
            history &&
            extraction &&
            !showApprovalDialog &&
            !showRejectDialog &&
            !approveDisabled
          ) {
            trackEvent('lease_extraction_approval_opened', {
              ...getExtractionDetailTrackingProperties(extraction),
              edit_count_bucket: getCountBucket(editHistory.length),
              entry_point: 'keyboard',
              linked_lease_selected: Boolean(
                selectedLeaseId || extraction.lease_id
              ),
            })
            setShowApprovalDialog(true)
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    handleUndo,
    handleRedo,
    history,
    extraction,
    editHistory.length,
    selectedLeaseId,
    showApprovalDialog,
    showRejectDialog,
    showCreateLeaseDialog,
    approveDisabled,
  ])

  // Approval handler
  const handleApprove = async () => {
    if (!history) return

    // Convert undefined to null for optional fields to satisfy exactOptionalPropertyTypes
    const profile = {
      ...history.present,
      base_year: history.present.base_year ?? null,
      base_year_amount: history.present.base_year_amount ?? null,
      cap_rate: history.present.cap_rate ?? null,
    }

    const approveBody: ApproveExtractionRequest = {
      profile,
      edit_history: editHistory,
      ...(needsLeaseSelection && selectedLeaseId
        ? { lease_id: selectedLeaseId }
        : {}),
    }

    return new Promise<void>((resolve, reject) => {
      approveMutation.mutate(approveBody, {
        onSuccess: () => resolve(),
        onError: (error) => reject(error),
      })
    })
  }

  // Rejection handler
  const handleReject = async (
    reason: string,
    notes: string | null,
    requeue: boolean
  ) => {
    return new Promise<void>((resolve, reject) => {
      rejectMutation.mutate(
        { reason, notes, requeue },
        {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        }
      )
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" variant="muted" />
      </div>
    )
  }

  if (error || isOffline || !extraction) {
    return (
      <div className="container py-16">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">
            {isOffline ? "Can't reach the server" : 'Extraction Not Found'}
          </h1>
          <p className="text-muted-foreground mb-6">
            {isOffline
              ? 'Check your connection and try again. Your work is safe.'
              : "The extraction you're looking for could not be found."}
          </p>
          {isOffline ? (
            <Button variant="outline" onClick={() => void refetchExtraction()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          ) : (
            <BackButton
              to="/extractions"
              label="Back to Extractions"
              variant="default"
            />
          )}
        </div>
      </div>
    )
  }

  if (!extraction.extraction_result?.profile || !history) {
    return (
      <div className="container py-16">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">No Extraction Data</h1>
          <p className="text-muted-foreground mb-6">
            This document has not been processed yet.
          </p>
          <BackButton
            to="/extractions"
            label="Back to Extractions"
            variant="default"
          />
        </div>
      </div>
    )
  }

  const originalProfile = extraction.extraction_result.profile
  const sourceReferences = (
    extraction.extraction_result.source_references || []
  ).map((ref) => ({
    ...ref,
    // Verified if the reviewer edited it OR explicitly marked it correct (F-176).
    verified:
      editHistory.some((edit) => edit.field === ref.field) ||
      confirmedFields.includes(ref.field),
  }))

  // Progress meter is keyed off the canonical confirmable field set, not the
  // AI's source_references. Some extractions return no source references at all,
  // which would otherwise leave the meter stuck at 0/0 even as the reviewer
  // marks fields correct (F2). Confidence falls back to 1 when the AI gave no
  // score, so an unscored field is not wrongly flagged "needs review".
  const confidenceScores = extraction.extraction_result.confidence_scores ?? {}
  const progressReferences = VERIFIABLE_FIELD_KEYS.map((field) => ({
    field,
    confidence: confidenceScores[field] ?? 1,
    verified:
      editHistory.some((edit) => edit.field === field) ||
      confirmedFields.includes(field),
  }))

  // Convert source references to SourceHighlight format for BoundingBoxOverlay
  const sourceHighlights: SourceHighlight[] = (
    extraction.extraction_result.source_references || []
  )
    .filter((ref) => ref.boundingBox !== null)
    .map((ref) => {
      const confidence =
        extraction.extraction_result?.confidence_scores?.[ref.field] || 0
      return {
        field: ref.field,
        text: ref.text,
        boundingBox: ref.boundingBox!,
        confidence:
          confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low',
        page: ref.page,
      }
    })

  // Use presigned URL from API response
  const pdfUrl = extraction.document_url

  // Handler for when a bounding box is clicked
  const handleBoxClick = (field: string) => {
    trackEvent('lease_extraction_source_highlight_clicked', {
      ...getExtractionDetailTrackingProperties(extraction),
      field_group: getLeaseExtractionFieldGroup(field),
    })
    setActiveField(field)
    // Scroll the field into view in the edit interface
    const element = document.querySelector(`[data-field="${field}"]`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Handler for field focus from edit interface
  const handleFieldFocus = (field: string) => {
    setActiveField(field)
    // Navigate to the page where this field's source is located
    const source = sourceHighlights.find((s) => s.field === field)
    if (source && source.page !== currentPage) {
      setCurrentPage(source.page)
    }
  }

  // Toggle the "looks right" confirmation for an unedited field (F-176).
  // A field key may linger here after the reviewer later edits that field;
  // that is harmless since `verified` is OR'd (an edit verifies on its own and
  // the toggle is hidden while edited), and resetting the edit restores the
  // confirmed state.
  const handleConfirmField = (field: string) => {
    setConfirmedFields((prev) => {
      const alreadyConfirmed = prev.includes(field)
      if (!alreadyConfirmed && extraction) {
        trackEvent('lease_extraction_field_confirmed', {
          ...getExtractionDetailTrackingProperties(extraction),
          field_group: getLeaseExtractionFieldGroup(field),
        })
      }
      return alreadyConfirmed
        ? prev.filter((f) => f !== field)
        : [...prev, field]
    })
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b bg-background shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-y-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <BackButton to="/extractions" variant="ghost" size="sm" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">
                {extraction.filename}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isSaving ? (
                  <span data-testid="draft-saving-indicator">Saving...</span>
                ) : saveError ? (
                  <span
                    data-testid="draft-save-error"
                    className="text-destructive-strong"
                  >
                    Couldn't save draft.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent('lease_extraction_draft_save_retried', {
                          ...getExtractionDetailTrackingProperties(extraction),
                          edit_count_bucket: getCountBucket(editHistory.length),
                        })
                        void manualSave()
                      }}
                      className="rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      Retry
                    </button>
                  </span>
                ) : lastSaved ? (
                  <span data-testid="draft-saved-indicator">
                    Draft saved at {lastSaved.toLocaleTimeString('en-US')}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {needsLeaseSelection && (
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="lease-selector"
                  className="text-sm whitespace-nowrap"
                >
                  Link to Lease
                </Label>
                {leasesLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : leasesError ? (
                  <div
                    data-testid="lease-load-error"
                    role="alert"
                    className="flex items-center gap-2"
                  >
                    <AlertCircle className="h-4 w-4 text-destructive-strong" />
                    <span className="text-sm text-destructive-strong">
                      Couldn&apos;t load existing leases.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refetchLeases()}
                    >
                      Try again
                    </Button>
                  </div>
                ) : availableLeases.length === 0 ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateLeaseDialog(true)}
                    data-testid="create-lease-button"
                  >
                    New lease
                  </Button>
                ) : (
                  <>
                    <Select
                      value={selectedLeaseId}
                      onValueChange={(value) => {
                        trackEvent('lease_extraction_field_edited', {
                          ...getExtractionDetailTrackingProperties(extraction),
                          field_group: 'lease_link',
                        })
                        setSelectedLeaseId(value)
                      }}
                    >
                      <SelectTrigger
                        id="lease-selector"
                        className="w-48"
                        data-testid="lease-selector"
                      >
                        <SelectValue placeholder="Select lease..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLeases.map((lease) => (
                          <SelectItem key={lease.id} value={lease.id}>
                            {lease.tenant_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateLeaseDialog(true)}
                      data-testid="create-lease-button"
                    >
                      New lease
                    </Button>
                  </>
                )}
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => {
                trackEvent('lease_extraction_rejection_opened', {
                  ...getExtractionDetailTrackingProperties(extraction),
                  edit_count_bucket: getCountBucket(editHistory.length),
                })
                setShowRejectDialog(true)
              }}
              data-testid="reject-button"
            >
              Reject
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Wrapper span keeps the tooltip reachable while the button
                      is disabled (disabled buttons don't fire pointer events).
                      When disabled it is focusable and announces the action +
                      why it's unavailable, so screen-reader users learn the
                      reason instead of hitting a silent dead control. */}
                  <span
                    tabIndex={approveDisabled ? 0 : -1}
                    {...(approveDisabled && {
                      'aria-disabled': true,
                      'aria-label': approveDisabledReason
                        ? `Approve & Commit. ${approveDisabledReason}`
                        : 'Approve & Commit',
                    })}
                  >
                    <Button
                      onClick={() => {
                        trackEvent('lease_extraction_approval_opened', {
                          ...getExtractionDetailTrackingProperties(extraction),
                          edit_count_bucket: getCountBucket(editHistory.length),
                          linked_lease_selected: Boolean(
                            selectedLeaseId || extraction.lease_id
                          ),
                        })
                        setShowApprovalDialog(true)
                      }}
                      disabled={approveDisabled}
                      data-testid="approve-button"
                    >
                      Approve & Commit
                    </Button>
                  </span>
                </TooltipTrigger>
                {approveDisabledReason && (
                  <TooltipContent>{approveDisabledReason}</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {/* A visible reason next to the greyed button, not just a hover
                tooltip — touch users and anyone not hovering still learn why
                Approve is unavailable instead of facing a silent dead control. */}
            {approveDisabledReason && (
              <p
                className="w-full text-sm text-muted-foreground"
                data-testid="approve-disabled-reason"
              >
                {approveDisabledReason}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main content - Split view with VerificationLayout */}
      <div className="flex-1 overflow-hidden">
        <VerificationLayout
          pdfPanel={
            <div className="relative h-full" data-testid="pdf-viewer">
              <PDFViewer
                url={pdfUrl}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onLoadStateChange={setPdfLoadState}
                width={pdfWidth}
                className="h-full"
                overlay={({ width, height }) => (
                  <BoundingBoxOverlay
                    sources={sourceHighlights}
                    currentPage={currentPage}
                    pageWidth={width}
                    pageHeight={height}
                    onBoxClick={handleBoxClick}
                    {...(activeField && { activeField })}
                  />
                )}
              />
            </div>
          }
          formPanel={
            <div className="flex flex-col h-full">
              <VerificationSummary
                sourceReferences={progressReferences}
                onFilterChange={(filter) => {
                  if (filter === 'low') {
                    trackEvent('lease_extraction_low_confidence_filter_used', {
                      ...getExtractionDetailTrackingProperties(extraction),
                    })
                  }
                  setConfidenceFilter(filter)
                }}
                currentFilter={confidenceFilter}
              />
              <div className="flex-1 overflow-hidden">
                <EditInterface
                  profile={history.present}
                  originalProfile={originalProfile}
                  sourceReferences={sourceReferences}
                  onFieldChange={handleFieldChange}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={history.past.length > 0}
                  canRedo={history.future.length > 0}
                  onFieldFocus={handleFieldFocus}
                  confidenceFilter={confidenceFilter}
                  confirmedFields={confirmedFields}
                  onConfirmField={handleConfirmField}
                />
              </div>

              {/* Fine-print verification disclaimer */}
              <p className="mt-3 text-xs text-muted-foreground px-4 pb-3">
                These values were pulled by AI and may be wrong. Check each one
                against your source document before you approve it.
              </p>
            </div>
          }
        />
      </div>

      {/* Dialogs */}
      <ApprovalDialog
        open={showApprovalDialog}
        onOpenChange={setShowApprovalDialog}
        profile={history.present}
        originalProfile={originalProfile}
        editHistory={editHistory}
        onConfirm={handleApprove}
        isSubmitting={approveMutation.isPending}
      />

      <RejectDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        onConfirm={handleReject}
        isSubmitting={rejectMutation.isPending}
      />

      <Dialog
        open={showCreateLeaseDialog}
        onOpenChange={setShowCreateLeaseDialog}
      >
        <DialogContent data-testid="create-lease-dialog">
          <DialogHeader>
            <DialogTitle>Create a lease</DialogTitle>
            <DialogDescription>
              This property has no lease yet. Add one so you can link and commit
              this extraction. We will use the extracted recovery terms.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-lease-tenant">Tenant name</Label>
              <Input
                id="new-lease-tenant"
                data-testid="new-lease-tenant"
                value={newLeaseTenantName}
                onChange={(event) => setNewLeaseTenantName(event.target.value)}
                placeholder="Acme Coffee Co."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-lease-start">Start date</Label>
                <Input
                  id="new-lease-start"
                  data-testid="new-lease-start"
                  type="date"
                  value={newLeaseStartDate}
                  onChange={(event) => setNewLeaseStartDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-lease-end">End date</Label>
                <Input
                  id="new-lease-end"
                  data-testid="new-lease-end"
                  type="date"
                  value={newLeaseEndDate}
                  onChange={(event) => setNewLeaseEndDate(event.target.value)}
                />
              </div>
            </div>
            {newLeaseStartDate &&
              newLeaseEndDate &&
              newLeaseEndDate < newLeaseStartDate && (
                <p className="text-sm text-destructive-strong">
                  The end date must be on or after the start date.
                </p>
              )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateLeaseDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateLease}
              disabled={!isNewLeaseValid || createLeaseMutation.isPending}
              data-testid="create-lease-submit"
            >
              {createLeaseMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create lease'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
