/**
 * Term Version Timeline Component
 *
 * Displays a vertical timeline of lease term amendments.
 * Each node shows the effective date, version number, key term changes,
 * and amendment reason. The latest version gets a "Current" badge.
 */
import { Trash2, Plus, Loader2, Clock } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'

import { useLeaseTermVersions, useDeleteTermVersion } from '@/api/hooks'
import { formatCalendarDate } from '@/lib/utils'
import { snakeToTitleCase } from '@/lib/title-case'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/errors'
import { useState } from 'react'
import type { LeaseTermVersionSummary } from '@/types/lease-term-version'

/**
 * Format an effective/start/end date-only field (YYYY-MM-DD) for display,
 * avoiding UTC-shift off-by-one.
 */
function formatDate(dateString: string): string {
  return formatCalendarDate(dateString) || '-'
}

function formatPercent(decimalString: string): string {
  return (parseFloat(decimalString) * 100).toFixed(2) + '%'
}

interface TermVersionTimelineProps {
  leaseId: string
  onCreateAmendment?: () => void
}

export function TermVersionTimeline({
  leaseId,
  onCreateAmendment,
}: TermVersionTimelineProps) {
  const {
    data: versions,
    isLoading,
    error,
    isPaused,
    refetch,
  } = useLeaseTermVersions(leaseId)
  const isOffline = isPaused && !versions
  const deleteMutation = useDeleteTermVersion(leaseId, {
    onSuccess: () => {
      toast.success('Term version deleted')
      setDeleteTarget(null)
    },
    onError: (error) => {
      toast.error('Failed to delete the amendment', {
        description: getErrorMessage(error),
      })
      setDeleteTarget(null)
    },
  })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Amendment History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || isOffline) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Amendment History</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState
            size="sm"
            title="Couldn't load lease versions"
            offline={isOffline}
            action={{ onClick: () => refetch() }}
          />
        </CardContent>
      </Card>
    )
  }

  const versionList = versions ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle as="h2">Amendment History</CardTitle>
        {onCreateAmendment && (
          <Button
            size="sm"
            onClick={onCreateAmendment}
            data-testid="new-amendment-btn"
          >
            <Plus className="mr-1 h-4 w-4" />
            New Amendment
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!isOffline && versionList.length === 0 ? (
          <EmptyState
            data-testid="no-versions"
            icon={Clock}
            title="No versions yet"
            description="Lease term changes show up here."
            size="sm"
          />
        ) : (
          <div className="relative space-y-0" data-testid="version-timeline">
            {/* Timeline line */}
            {versionList.length > 1 && (
              <div className="absolute left-4 top-6 bottom-6 w-px bg-border" />
            )}

            {versionList.map((version, index) => (
              <VersionNode
                key={version.id}
                version={version}
                isCurrent={index === 0}
                onDelete={() => setDeleteTarget(version.id)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Term Version</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This removes the amendment record. This cannot be
              undone if no finalized snapshots reference it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget)
              }
              className={buttonVariants({ variant: 'destructive' })}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

interface VersionNodeProps {
  version: LeaseTermVersionSummary
  isCurrent: boolean
  onDelete: () => void
}

function VersionNode({ version, isCurrent, onDelete }: VersionNodeProps) {
  return (
    <div
      className="relative flex gap-4 pb-6 last:pb-0"
      data-testid="version-node"
    >
      {/* Timeline dot */}
      <div
        className={`relative z-sticky mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 ${
          isCurrent
            ? 'border-primary bg-primary'
            : 'border-muted-foreground/40 bg-background'
        }`}
      />

      {/* Content */}
      <div className="flex-1 rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">v{version.version_number}</span>
              {isCurrent && (
                <Badge variant="default" data-testid="current-badge">
                  Current
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Effective {formatDate(version.effective_date)}
              </span>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Share: {formatPercent(version.pro_rata_share)}</span>
              <span>Cap: {snakeToTitleCase(version.cap_type)}</span>
            </div>
            {version.amendment_reason && (
              <p className="text-sm italic text-muted-foreground">
                {version.amendment_reason}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete version v${version.version_number} (effective ${formatDate(version.effective_date)})`}
            onClick={onDelete}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            data-testid="delete-version-btn"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
