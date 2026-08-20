/**
 * LandlordDisputeDetailPage
 *
 * Landlord/admin page to view and manage a single dispute.
 * Includes status updates, comments, and attachments.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileText, Download, RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import {
  useDispute,
  useUpdateDisputeStatus,
  useAddDisputeComment,
} from '@/api/hooks'
import type { DisputeAttachmentDTO } from '@/api/client'
import { DisputeStatusBadge } from '../components/DisputeStatusBadge'
import { StatusUpdateForm } from '../components/StatusUpdateForm'
import { CommentThread } from '../components/CommentThread'
import { AddCommentForm } from '../components/AddCommentForm'
import { cn, formatDateTime, formatTimestampDate } from '@/lib/utils'
import { Scale } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGenerateDemandLetter, type DemandLetterRequest } from '@/api/hooks'
import { categoryLabel } from '../constants'
import { getErrorMessage } from '@/api/errors'
import { useAuth } from '@/contexts/AuthContext'
import { getCountBucket, trackEvent } from '@/lib/analytics'
import { formatFileSize } from '@/lib/format-bytes'

// ============================================================
// DemandLetterFromDisputeDialog
// ============================================================

interface DemandLetterFromDisputeDialogProps {
  open: boolean
  onClose: () => void
  snapshotId: string
  disputeId: string
  disputeFiledDate: string
}

function DemandLetterFromDisputeDialog({
  open,
  onClose,
  snapshotId,
  disputeId,
  disputeFiledDate,
}: DemandLetterFromDisputeDialogProps) {
  const [state, setState] = useState<'TX' | 'CA'>('TX')
  const [landlordName, setLandlordName] = useState('')
  const [landlordNameTouched, setLandlordNameTouched] = useState(false)
  const [landlordTitle, setLandlordTitle] = useState('')
  const [landlordCompany, setLandlordCompany] = useState('')
  const [landlordAddress, setLandlordAddress] = useState('')
  const [landlordPhone, setLandlordPhone] = useState('')
  const [landlordEmail, setLandlordEmail] = useState('')
  const [deadlineDays, setDeadlineDays] = useState(30)

  const generateMutation = useGenerateDemandLetter({
    onSuccess: () => {
      toast.success('Demand letter downloaded')
      onClose()
    },
    onError: (err: Error) => {
      toast.error('Something went wrong', { description: getErrorMessage(err) })
    },
  })

  function handleGenerate() {
    if (landlordName.trim() === '') {
      setLandlordNameTouched(true)
      return
    }
    const request: DemandLetterRequest = {
      snapshot_id: snapshotId,
      state,
      landlord_name: landlordName,
      landlord_title: landlordTitle,
      landlord_company: landlordCompany,
      landlord_address: landlordAddress,
      landlord_phone: landlordPhone,
      landlord_email: landlordEmail,
      payment_deadline_days: deadlineDays,
      dispute_id: disputeId,
      dispute_filed_date: disputeFiledDate,
    }
    generateMutation.mutate(request)
  }

  // Guard against losing typed landlord details to an accidental backdrop
  // click or Escape. An untouched form stays freely dismissible.
  const isDirty =
    landlordName !== '' ||
    landlordTitle !== '' ||
    landlordCompany !== '' ||
    landlordAddress !== '' ||
    landlordPhone !== '' ||
    landlordEmail !== ''
  const preventAccidentalDismiss = (e: Event) => {
    if (isDirty && !generateMutation.isPending) {
      e.preventDefault()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onInteractOutside={preventAccidentalDismiss}
        onEscapeKeyDown={preventAccidentalDismiss}
      >
        <DialogHeader>
          <DialogTitle>Generate Demand Letter</DialogTitle>
          <DialogDescription>
            Add the landlord contact details and payment deadline. We use them
            to build a legal demand letter for this dispute.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label id="dispute-state-label">State</Label>
            <div
              className="flex gap-4"
              role="group"
              aria-labelledby="dispute-state-label"
            >
              <label className="flex min-h-10 items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="dispute-state"
                  value="TX"
                  checked={state === 'TX'}
                  onChange={() => setState('TX')}
                />
                Texas (TX)
              </label>
              <label className="flex min-h-10 items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="dispute-state"
                  value="CA"
                  checked={state === 'CA'}
                  onChange={() => setState('CA')}
                />
                California (CA)
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispute-landlord-name">Landlord Name</Label>
            <Input
              id="dispute-landlord-name"
              value={landlordName}
              onChange={(e) => setLandlordName(e.target.value)}
              onBlur={() => setLandlordNameTouched(true)}
              placeholder="John Smith"
            />
            {landlordNameTouched && landlordName.trim() === '' && (
              <p role="alert" className="text-xs text-destructive-strong">
                Landlord name is required.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispute-landlord-title">Title</Label>
            <Input
              id="dispute-landlord-title"
              value={landlordTitle}
              onChange={(e) => setLandlordTitle(e.target.value)}
              placeholder="Property Manager"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispute-landlord-company">Company</Label>
            <Input
              id="dispute-landlord-company"
              value={landlordCompany}
              onChange={(e) => setLandlordCompany(e.target.value)}
              placeholder="Acme Properties LLC"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispute-landlord-address">Address</Label>
            <Input
              id="dispute-landlord-address"
              value={landlordAddress}
              onChange={(e) => setLandlordAddress(e.target.value)}
              placeholder="123 Main St, Dallas, TX 75201"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispute-landlord-phone">Phone</Label>
            <Input
              id="dispute-landlord-phone"
              value={landlordPhone}
              onChange={(e) => setLandlordPhone(e.target.value)}
              placeholder="(214) 555-0100"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispute-landlord-email">Email</Label>
            <Input
              id="dispute-landlord-email"
              type="email"
              autoComplete="email"
              value={landlordEmail}
              onChange={(e) => setLandlordEmail(e.target.value)}
              placeholder="jsmith@acmeproperties.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispute-deadline-days">
              Payment Deadline (days)
            </Label>
            <Input
              id="dispute-deadline-days"
              type="number"
              min={1}
              max={90}
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(Number(e.target.value))}
            />
          </div>
          <Button
            className="w-full"
            disabled={generateMutation.isPending || landlordName.trim() === ''}
            onClick={handleGenerate}
          >
            {generateMutation.isPending
              ? 'Generating...'
              : 'Generate & Download'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export function LandlordDisputeDetailPage() {
  const [showDemandLetterDialog, setShowDemandLetterDialog] = useState(false)
  const trackedDetailDisputeIdRef = useRef<string | null>(null)
  const { disputeId } = useParams<{ disputeId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const {
    data: dispute,
    isLoading,
    error,
    isPaused,
    refetch,
  } = useDispute(disputeId || '')
  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves error null and dispute undefined, so without this guard the page
  // would render "Dispute not found" and imply the dispute was deleted when the
  // backend is simply unreachable.
  const isOffline = isPaused && !dispute

  const updateStatusMutation = useUpdateDisputeStatus(disputeId || '', {
    onSuccess: (updatedDispute, variables) => {
      trackEvent('landlord_dispute_status_update_succeeded', {
        dispute_id: updatedDispute.id,
        statement_id: updatedDispute.statement_id,
        category: updatedDispute.category,
        new_status: variables.status,
        ...(dispute ? { previous_status: dispute.status } : {}),
      })
      toast.success('Status updated successfully')
    },
    onError: (err) => {
      toast.error('Failed to update status', {
        description: getErrorMessage(err),
      })
    },
  })

  const addCommentMutation = useAddDisputeComment(disputeId || '', {
    onSuccess: (comment, variables) => {
      if (dispute) {
        const nextCommentCount = (dispute.comments?.length ?? 0) + 1
        trackEvent('landlord_dispute_comment_submit_succeeded', {
          dispute_id: dispute.id,
          statement_id: dispute.statement_id,
          category: dispute.category,
          status: dispute.status,
          is_internal: Boolean(variables.is_internal),
          comment_count: nextCommentCount,
          comment_count_bucket: getCountBucket(nextCommentCount),
        })
      } else {
        trackEvent('landlord_dispute_comment_submit_succeeded', {
          dispute_id: comment.dispute_id,
          is_internal: Boolean(variables.is_internal),
        })
      }
      toast.success('Comment added successfully')
    },
    onError: (err) => {
      toast.error('Failed to add comment', {
        description: getErrorMessage(err),
      })
    },
  })

  useEffect(() => {
    if (!dispute) return
    if (trackedDetailDisputeIdRef.current === dispute.id) return
    trackedDetailDisputeIdRef.current = dispute.id

    const commentCount = dispute.comments?.length ?? 0
    const attachmentCount = dispute.attachments?.length ?? 0
    trackEvent('landlord_dispute_detail_viewed', {
      dispute_id: dispute.id,
      statement_id: dispute.statement_id,
      category: dispute.category,
      status: dispute.status,
      comment_count: commentCount,
      comment_count_bucket: getCountBucket(commentCount),
      attachment_count: attachmentCount,
      attachment_count_bucket: getCountBucket(attachmentCount),
    })
  }, [dispute])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" variant="muted" />
      </div>
    )
  }

  if (error || isOffline || !dispute) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p role="alert" className="text-destructive-strong mb-4">
          {isOffline
            ? "Can't reach the server. Check your connection and try again."
            : error?.message || 'Dispute not found'}
        </p>
        {isOffline ? (
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        ) : (
          <Button variant="outline" onClick={() => navigate('/disputes')}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to Disputes
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title={categoryLabel(dispute.category)}
        description={`Filed ${formatTimestampDate(dispute.created_at)}`}
        showBackButton
        backButtonTo="/disputes"
      />

      <div className="flex justify-end mb-4">
        <Button
          data-testid="demand-letter-from-dispute-button"
          variant="outline"
          className="gap-2"
          onClick={() => setShowDemandLetterDialog(true)}
        >
          <Scale className="h-4 w-4" />
          Generate Demand Letter
        </Button>
      </div>

      <DemandLetterFromDisputeDialog
        open={showDemandLetterDialog}
        onClose={() => setShowDemandLetterDialog(false)}
        snapshotId={dispute.statement_id}
        disputeId={dispute.id}
        disputeFiledDate={dispute.created_at}
      />
      <div className="flex-1 max-w-4xl mx-auto w-full space-y-6">
        {/* Dispute Info Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle as="h2" className="text-lg">
                Dispute Details
              </CardTitle>
              <DisputeStatusBadge status={dispute.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                Description
              </h3>
              <p className="text-sm">{dispute.description}</p>
            </div>

            {/* No "Statement ID" row: it was a truncated raw UUID that links
               nowhere, can't be fully copied, and means nothing to a landlord —
               internal plumbing leaking into a customer-facing screen. The id is
               still used for the demand letter and status updates, just not shown. */}
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Created:</span>
                <span className="ml-2">
                  {formatDateTime(dispute.created_at)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Last Updated:</span>
                <span className="ml-2">
                  {formatDateTime(dispute.updated_at)}
                </span>
              </div>
              {dispute.resolved_at && (
                <div>
                  <span className="text-muted-foreground">Resolved:</span>
                  <span className="ml-2">
                    {formatDateTime(dispute.resolved_at)}
                  </span>
                </div>
              )}
            </div>

            {dispute.resolution_summary && (
              <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-1 text-success-strong">
                  Resolution Summary
                </h3>
                <p className="text-sm">{dispute.resolution_summary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Update Card */}
        {dispute.status !== 'closed' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle as="h2" className="text-lg">
                Update Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatusUpdateForm
                currentStatus={dispute.status}
                onSubmit={(data) => updateStatusMutation.mutate(data)}
                isLoading={updateStatusMutation.isPending}
              />
            </CardContent>
          </Card>
        )}

        {/* Attachments Card */}
        {dispute.attachments && dispute.attachments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle as="h2" className="text-lg">
                Attachments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dispute.attachments.map((attachment) => (
                  <AttachmentRow key={attachment.id} attachment={attachment} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Comments Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-lg">
              Comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CommentThread
              comments={dispute.comments || []}
              currentUserId={user?.id}
            />

            {dispute.status !== 'closed' && (
              <>
                <div className="border-t my-4" />
                <AddCommentForm
                  onSubmit={(data) => addCommentMutation.mutateAsync(data)}
                  isLoading={addCommentMutation.isPending}
                  showInternalToggle
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface AttachmentRowProps {
  attachment: DisputeAttachmentDTO
}

function AttachmentRow({ attachment }: AttachmentRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg',
        'border border-border hover:bg-muted/30 transition-colors duration-200'
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0">
          <p
            className="font-medium text-sm truncate"
            title={attachment.filename}
          >
            {attachment.filename}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(attachment.file_size_bytes)}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" asChild>
        <a
          href={attachment.file_url}
          target="_blank"
          rel="noopener noreferrer"
          download
          aria-label={`Download ${attachment.filename}`}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </a>
      </Button>
    </div>
  )
}
