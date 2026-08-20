/**
 * Lease Detail Page Component
 *
 * Displays lease details with tabs for related data.
 * Features:
 * - Lease header with tenant name and property context
 * - Stats cards showing key lease metrics
 * - Tabs for Overview, Recovery Profile, Document
 * - Edit/Delete actions
 * - Breadcrumb navigation
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  CalendarDays,
  Copy,
  FileText,
  Loader2,
  Pencil,
  Percent,
  RefreshCw,
  Trash2,
} from 'lucide-react'

import { useLease, useDeleteLease, useProperty } from '@/api/hooks'
import { formatCalendarDate } from '@/lib/utils'
import { getLeaseStatusVariant } from '@/lib/lease-status'
import { useSubscription } from '@/hooks/use-subscription'
import { TermVersionTimeline } from '@/components/leases/TermVersionTimeline'
import { CapBankLedger } from '@/features/reconciliation/components/CapBankLedger'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Tabs,
  TabsContent,
  ScrollableTabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createLeaseDocumentSignedUrl } from '@/lib/lease-documents'
import { toast } from 'sonner'
import { ErrorState } from '@/components/ErrorState'

function CompactCopyId({ label, value }: { label: string; value: string }) {
  const compactValue =
    value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <button
        type="button"
        // min-h-10 gives the copy button a 40px-tall hit area (the text+icon
        // alone is ~20px), meeting the touch floor for this clipboard action.
        className="mt-1 flex min-h-10 max-w-full items-center gap-2 rounded-full text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => toast.success(`${label} copied`))
            .catch(() => toast.error('Failed to copy to clipboard'))
        }}
        title={value}
        aria-label={`Copy ${label}: ${value}`}
      >
        <span className="min-w-0 truncate">{compactValue}</span>
        <Copy
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

export function LeaseDetailPage() {
  const { propertyId, leaseId } = useParams<{
    propertyId: string
    leaseId: string
  }>()
  const navigate = useNavigate()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [signedDocumentUrl, setSignedDocumentUrl] = useState<string | null>(
    null
  )
  // Status of the signed-URL fetch so the document link can show a loading
  // spinner and a real error+retry instead of rendering a dead href.
  const [signedUrlStatus, setSignedUrlStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [signedUrlReloadKey, setSignedUrlReloadKey] = useState(0)

  // Fetch lease data
  const {
    data: lease,
    isLoading,
    error,
    isPaused,
    refetch: refetchLease,
  } = useLease(leaseId!)
  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves error null and lease undefined, so without this guard the page would
  // render "Lease not found" and imply the lease was removed when the backend is
  // simply unreachable. Route it into the error (retryable) branch instead.
  const isOffline = isPaused && !lease

  const documentUrl = lease?.document_url

  useEffect(() => {
    let cancelled = false

    async function refreshSignedUrl() {
      if (!documentUrl) {
        setSignedDocumentUrl(null)
        setSignedUrlStatus('idle')
        return
      }

      setSignedUrlStatus('loading')
      try {
        const signedUrl = await createLeaseDocumentSignedUrl(documentUrl)
        if (!cancelled) {
          setSignedDocumentUrl(signedUrl)
          setSignedUrlStatus('ready')
        }
      } catch {
        if (!cancelled) {
          setSignedDocumentUrl(null)
          setSignedUrlStatus('error')
        }
      }
    }

    void refreshSignedUrl()

    return () => {
      cancelled = true
    }
  }, [documentUrl, signedUrlReloadKey])

  // Fetch property for breadcrumbs
  const { data: property } = useProperty(propertyId!, {
    enabled: !!propertyId,
  })

  // Subscription for entitlement gating
  const { data: subscription } = useSubscription()
  const hasCapBankAccess =
    subscription?.status === 'active' || subscription?.status === 'trialing'

  // Delete mutation
  const deleteMutation = useDeleteLease({
    onSuccess: () => {
      toast.success('Lease deleted successfully')
      navigate(`/properties/${propertyId}#leases`)
    },
    onError: (error) => {
      console.error(error)
      toast.error(
        "We couldn't delete this lease. Nothing was removed. Try again."
      )
    },
  })

  const handleDelete = () => {
    if (leaseId) {
      deleteMutation.mutate(leaseId)
    }
  }

  // Error state - Check FIRST before loading state
  if (error || isOffline || (!isLoading && !lease)) {
    const showError = error || isOffline
    return (
      <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
        <PageHeader
          title={showError ? "Couldn't load lease" : 'Lease not found'}
        />
        <div className="flex-1">
          {showError ? (
            <ErrorState
              title="Couldn't load this lease"
              description="Your data is safe. Try again."
              offline={isOffline}
              action={{ onClick: () => void refetchLease() }}
            />
          ) : (
            <ErrorState
              title="Lease not found"
              description="This lease doesn't exist or was removed."
            />
          )}
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8"
        data-testid="lease-detail-skeleton"
      >
        <PageHeader
          title={<Skeleton className="h-8 w-64" />}
          description="Loading lease details…"
        />
        <div className="flex-1 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Status"
              value=""
              icon={FileText}
              isLoading
              titleAs="h2"
            />
            <StatCard
              title="Pro-Rata Share"
              value=""
              icon={Percent}
              isLoading
              titleAs="h2"
            />
            <StatCard
              title="Start Date"
              value=""
              icon={CalendarDays}
              isLoading
              titleAs="h2"
            />
            <StatCard
              title="End Date"
              value=""
              icon={CalendarDays}
              isLoading
              titleAs="h2"
            />
          </div>
          <Skeleton className="h-10 w-full" />
          <SkeletonCard bodyLines={5} />
        </div>
      </div>
    )
  }

  // TypeScript guard: lease is guaranteed to be defined after error/loading checks
  if (!lease) {
    return null
  }

  const hasCumulativeCap =
    lease.recovery_profile.cap_type === 'cumulative' ||
    lease.recovery_profile.cap_type === 'cumulative_compounding'

  // Calculate stats
  const proRataSharePercent = (
    parseFloat(lease.recovery_profile.pro_rata_share) * 100
  ).toFixed(2)
  const stats = {
    status:
      (lease.status ?? 'draft').charAt(0).toUpperCase() +
      (lease.status ?? 'draft').slice(1),
    proRataShare: `${proRataSharePercent}%`,
    startDate: formatCalendarDate(lease.start_date),
    endDate: formatCalendarDate(lease.end_date),
  }

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title={lease.tenant_name}
        description={`Lease for ${property?.name || 'property'}`}
        showBackButton={true}
        backButtonTo={`/properties/${propertyId}#leases`}
        breadcrumbs={[
          { label: 'Properties', href: '/properties' },
          {
            label: property?.name || 'Loading...',
            href: `/properties/${propertyId}`,
          },
          { label: 'Leases', href: `/properties/${propertyId}#leases` },
          { label: lease.tenant_name },
        ]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                navigate(`/properties/${propertyId}/leases/${leaseId}/edit`)
              }
              className="w-full sm:w-auto"
            >
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <StatCard
            title="Status"
            value={stats.status}
            icon={FileText}
            titleAs="h2"
          />
          <StatCard
            title="Pro-Rata Share"
            value={stats.proRataShare}
            icon={Percent}
            titleAs="h2"
          />
          <StatCard
            title="Start Date"
            value={stats.startDate}
            icon={CalendarDays}
            titleAs="h2"
          />
          <StatCard
            title="End Date"
            value={stats.endDate}
            icon={CalendarDays}
            titleAs="h2"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          {/* ScrollableTabsList gives a soft fade affordance when the tab
              strip overflows on narrow viewports, so mobile users can tell
              there are more tabs to scroll to. */}
          <ScrollableTabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="recovery">Recovery Profile</TabsTrigger>
            {hasCumulativeCap && hasCapBankAccess && (
              <TabsTrigger value="cap-bank">Cap Bank</TabsTrigger>
            )}
            <TabsTrigger value="amendments">Amendment History</TabsTrigger>
            {lease.document_url && (
              <TabsTrigger value="document">Lease Document</TabsTrigger>
            )}
          </ScrollableTabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Lease Information */}
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Lease Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Tenant Name
                      </p>
                      <p className="font-medium">{lease.tenant_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={getLeaseStatusVariant(lease.status)}>
                        {stats.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Start Date
                      </p>
                      <p className="font-medium">{stats.startDate}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">End Date</p>
                      <p className="font-medium">{stats.endDate}</p>
                    </div>
                    <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <CompactCopyId label="Lease ID" value={lease.id} />
                      {lease.unit_id && (
                        <CompactCopyId label="Unit ID" value={lease.unit_id} />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recovery Profile Summary */}
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Recovery Profile Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Pro-Rata Share
                      </p>
                      <p className="font-medium">{stats.proRataShare}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Admin Fee</p>
                      <p className="font-medium">
                        {(
                          parseFloat(
                            lease.recovery_profile.admin_fee_percentage ??
                              '0.15'
                          ) * 100
                        ).toFixed(2)}
                        %
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Cap Type</p>
                      <p className="font-medium capitalize">
                        {lease.recovery_profile.cap_type == null ||
                        lease.recovery_profile.cap_type === 'none'
                          ? 'No Cap'
                          : lease.recovery_profile.cap_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    {lease.recovery_profile.base_year && (
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Base Year
                        </p>
                        <p className="font-medium">
                          {lease.recovery_profile.base_year}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="recovery">
            <Card>
              <CardHeader>
                <CardTitle as="h2">Recovery Profile Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Pro-Rata Share
                    </p>
                    <p className="font-medium">{stats.proRataShare}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Admin Fee</p>
                    <p className="font-medium">
                      {(
                        parseFloat(
                          lease.recovery_profile.admin_fee_percentage ?? '0.15'
                        ) * 100
                      ).toFixed(2)}
                      %
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Base Year</p>
                    <p className="font-medium">
                      {lease.recovery_profile.base_year || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Base Year Amount
                    </p>
                    <p className="font-medium">
                      {lease.recovery_profile.base_year_amount || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Gross-Up Base Year
                    </p>
                    <p className="font-medium">
                      {lease.recovery_profile.gross_up_base_year ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cap Type</p>
                    <p className="font-medium capitalize">
                      {lease.recovery_profile.cap_type == null ||
                      lease.recovery_profile.cap_type === 'none'
                        ? 'No Cap'
                        : lease.recovery_profile.cap_type.replace(/_/g, ' ')}
                    </p>
                  </div>
                  {lease.recovery_profile.cap_rate && (
                    <div>
                      <p className="text-sm text-muted-foreground">Cap Rate</p>
                      <p className="font-medium">
                        {(
                          parseFloat(lease.recovery_profile.cap_rate ?? '0') *
                          100
                        ).toFixed(2)}
                        %
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {hasCumulativeCap && hasCapBankAccess && (
            <TabsContent value="cap-bank">
              <CapBankLedger leaseId={leaseId!} />
            </TabsContent>
          )}

          <TabsContent value="amendments">
            <TermVersionTimeline leaseId={leaseId!} />
          </TabsContent>

          {lease.document_url && (
            <TabsContent value="document">
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Lease Document</CardTitle>
                </CardHeader>
                <CardContent>
                  {signedUrlStatus === 'ready' && signedDocumentUrl ? (
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <a
                        href={signedDocumentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        View Lease Document
                      </a>
                    </div>
                  ) : signedUrlStatus === 'error' ? (
                    <div
                      className="flex flex-col gap-2 text-sm"
                      role="alert"
                      data-testid="lease-document-error"
                    >
                      <span className="flex items-center gap-2 text-destructive-strong">
                        <AlertCircle className="h-4 w-4" />
                        Couldn't prepare the document link.
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-fit gap-2"
                        onClick={() => setSignedUrlReloadKey((key) => key + 1)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                      data-testid="lease-document-loading"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Preparing document link…
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lease</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the lease for "{lease.tenant_name}
              "? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className={buttonVariants({ variant: 'destructive' })}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
