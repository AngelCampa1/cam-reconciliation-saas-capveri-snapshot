/**
 * ReconciliationsListPage Component
 *
 * Global view of all reconciliations across all properties.
 * Features:
 * - Group by property (building)
 * - Filter by year, status, and property
 * - Summary statistics per property
 * - Quick actions to navigate to specific property reconciliation
 */
import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Calculator,
  Building2,
  AlertCircle,
  RefreshCw,
  Users,
  FileEdit,
  CheckCircle2,
  Plus,
} from 'lucide-react'

import { FreeAuditUpgradeModal } from '@/components/billing/FreeAuditUpgradeModal'
import { ReconciliationKickoffModal } from '@/features/reconciliation/components/ReconciliationKickoffModal'
import { VideoCard } from '@/components/video'
import { getVideoForPlacement } from '@/generated/videos'

import {
  apiClient,
  listSnapshotsApiV1ReconciliationSnapshotsGet,
  listPropertiesApiV1PropertiesGet,
} from '@/api/client'
import { PageHeader, PageContainer } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { DataTableSkeleton } from '@/components/ui/data-table/DataTableSkeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney, sumMoney } from '@/lib/money'
import { useViewport } from '@/hooks/useViewport'
import { toast } from 'sonner'

/**
 * Property reconciliation summary (grouped data)
 */
interface PropertyReconciliationSummary {
  propertyId: string
  propertyName: string
  tenantCount: number
  draftCount: number
  finalizedCount: number
  /** Exact decimal string (sum of tenant recoveries). Never a float. */
  totalRecovery: string
  status: 'all_finalized' | 'all_draft' | 'mixed'
}

/**
 * Format currency value exactly (Decimal strings parsed without float coercion).
 */
function formatCurrency(value: string | number): string {
  const formatted = formatMoney(value)
  // formatMoney returns non-numeric input unchanged; map that to a zero display.
  return formatted.startsWith('$') || formatted.startsWith('-$')
    ? formatted
    : '$0.00'
}

/**
 * Get current year and previous years for filter
 */
function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear()
  return [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]
}

/**
 * Loading skeleton component
 */
function LoadingSkeleton() {
  return (
    <div data-testid="reconciliations-loading" className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTableSkeleton columnCount={5} rowCount={5} />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Status badge for property-level status
 * Shows "Finalized" only when ALL tenant snapshots are finalized
 * Shows "Draft" otherwise (consistent with detail page)
 */
function PropertyStatusBadge({
  status,
}: {
  status: 'all_finalized' | 'all_draft' | 'mixed'
}) {
  if (status === 'all_finalized') {
    return (
      <Badge
        variant="default"
        className="bg-success/10 text-success-strong border-success/20"
      >
        <CheckCircle2 aria-hidden="true" className="mr-1 h-3 w-3" />
        Finalized
      </Badge>
    )
  }
  // Both "all_draft" and "mixed" show as Draft (consistent with detail page)
  // The progress bar shows the actual finalization progress
  return (
    <Badge
      variant="secondary"
      className="bg-warning/10 text-warning-foreground border-warning/20"
    >
      <FileEdit aria-hidden="true" className="mr-1 h-3 w-3" />
      Draft
    </Badge>
  )
}

export function ReconciliationsListPage() {
  const navigate = useNavigate()
  const { isMobile } = useViewport()
  const currentYear = new Date().getFullYear()
  // Free audit upgrade modal state
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [kickoffModalOpen, setKickoffModalOpen] = useState(false)

  // Track whether user has manually changed the year filter
  const [userChangedYear, setUserChangedYear] = useState(false)

  // Filter state
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [propertyFilter, setPropertyFilter] = useState<string>('all')

  // Fetch properties
  const {
    data: propertiesData,
    isLoading: propertiesLoading,
    error: propertiesError,
    isPaused: propertiesPaused,
    refetch: refetchProperties,
  } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await listPropertiesApiV1PropertiesGet({
        client: apiClient,
      })
      if (error) throw new Error('Failed to load properties')
      return data
    },
  })

  // Probe for most recent snapshot to auto-detect year (no year filter)
  const { data: firstRunProbe } = useQuery({
    queryKey: ['reconciliation-snapshots-first-run-probe'],
    queryFn: async () => {
      const { data, error } =
        await listSnapshotsApiV1ReconciliationSnapshotsGet({
          client: apiClient,
          query: {
            page: 1,
            size: 1,
          },
        })
      if (error) throw new Error('Failed to load reconciliation status')
      return data
    },
  })

  // Derive the effective year: use snapshot data when user hasn't manually changed the filter
  const detectedYear = useMemo(() => {
    const firstSnapshot = firstRunProbe?.items?.[0]
    const periodStart = firstSnapshot?.period_start_date
    if (periodStart && typeof periodStart === 'string') {
      const year = parseInt(periodStart.substring(0, 4), 10)
      if (!isNaN(year)) return year
    }
    return null
  }, [firstRunProbe])

  const effectiveYear =
    userChangedYear || detectedYear === null ? selectedYear : detectedYear

  // Build query params for snapshots
  const snapshotQueryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      period_start: `${effectiveYear}-01-01`,
      period_end: `${effectiveYear}-12-31`,
    }

    if (statusFilter === 'draft') {
      params.is_finalized = false
    } else if (statusFilter === 'finalized') {
      params.is_finalized = true
    }

    if (propertyFilter !== 'all') {
      params.property_id = propertyFilter
    }

    return params
  }, [effectiveYear, statusFilter, propertyFilter])

  // Fetch reconciliation snapshots
  const {
    data: snapshotsData,
    isLoading: snapshotsLoading,
    error: snapshotsError,
    isPaused: snapshotsPaused,
    refetch: refetchSnapshots,
  } = useQuery({
    queryKey: ['reconciliation-snapshots', snapshotQueryParams],
    queryFn: async () => {
      const { data, error } =
        await listSnapshotsApiV1ReconciliationSnapshotsGet({
          client: apiClient,
          query: snapshotQueryParams,
        })
      if (error) throw new Error('Failed to load reconciliations')
      return data
    },
  })

  const isLoading = propertiesLoading || snapshotsLoading
  const hasError = propertiesError || snapshotsError
  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves both errors null and both datasets undefined, so without this the
  // page would render the "No reconciliations yet" guided empty state and tell
  // the user they have nothing when the backend is simply unreachable. The data
  // guards keep any already-loaded list rendered instead of an offline screen.
  const isOffline =
    (propertiesPaused || snapshotsPaused) && !propertiesData && !snapshotsData

  // Group snapshots by property
  const propertyGroups = useMemo((): PropertyReconciliationSummary[] => {
    const snapshots = snapshotsData?.items ?? []
    const groupMap = new Map<string, PropertyReconciliationSummary>()

    for (const snapshot of snapshots) {
      const existing = groupMap.get(snapshot.property_id)
      const isFinalized =
        snapshot.is_finalized || snapshot.status === 'finalized'
      const recovery = snapshot.total_recovery || '0'

      if (existing) {
        existing.tenantCount++
        // Exact decimal accumulation (no float drift). See lib/money.ts.
        existing.totalRecovery = sumMoney([existing.totalRecovery, recovery])
        if (isFinalized) {
          existing.finalizedCount++
        } else {
          existing.draftCount++
        }
      } else {
        groupMap.set(snapshot.property_id, {
          propertyId: snapshot.property_id,
          propertyName: snapshot.property_name || 'Unknown Property',
          tenantCount: 1,
          draftCount: isFinalized ? 0 : 1,
          finalizedCount: isFinalized ? 1 : 0,
          totalRecovery: sumMoney([recovery]),
          status: 'mixed', // Will be calculated below
        })
      }
    }

    // Calculate status for each property
    for (const group of groupMap.values()) {
      if (group.finalizedCount === group.tenantCount) {
        group.status = 'all_finalized'
      } else if (group.draftCount === group.tenantCount) {
        group.status = 'all_draft'
      } else {
        group.status = 'mixed'
      }
    }

    // Sort by property name
    return Array.from(groupMap.values()).sort((a, b) =>
      a.propertyName.localeCompare(b.propertyName)
    )
  }, [snapshotsData])

  // Calculate summary statistics
  const stats = useMemo(() => {
    const snapshots = snapshotsData?.items ?? []
    const totalTenants = snapshots.length
    // Exact decimal accumulation across all snapshots (no float drift).
    const totalRecovery = sumMoney(
      snapshots.map((s) => s.total_recovery || '0')
    )
    const propertyCount = propertyGroups.length
    // Count properties by status (property-level, not tenant-level)
    const finalizedProperties = propertyGroups.filter(
      (g) => g.status === 'all_finalized'
    ).length
    const draftProperties = propertyCount - finalizedProperties

    return {
      totalTenants,
      totalRecovery,
      propertyCount,
      finalizedProperties,
      draftProperties,
    }
  }, [snapshotsData, propertyGroups])

  // Handle retry
  const handleRetry = () => {
    refetchProperties()
    refetchSnapshots()
  }

  // Handle navigation to property reconciliation
  const handleNavigateToReconciliation = (propertyId: string) => {
    navigate(`/properties/${propertyId}/reconciliations?year=${effectiveYear}`)
  }

  // No properties state
  const hasNoProperties = (propertiesData?.data?.length ?? 0) === 0
  const hasNoSnapshots = (snapshotsData?.items?.length ?? 0) === 0
  const isFirstReconciliation = (firstRunProbe?.items?.length ?? 0) === 0

  const handleStartReconciliation = () => {
    if (isFirstReconciliation) {
      setKickoffModalOpen(true)
      return
    }
    toast.info('Pick a property to start a new reconciliation')
    navigate('/properties')
  }

  return (
    <PageContainer>
      <PageHeader
        title="Reconciliations"
        description="View and manage CAM reconciliations across all properties"
        actions={
          !isLoading && !hasError && !isOffline && !hasNoSnapshots ? (
            <Button
              onClick={handleStartReconciliation}
              className="min-h-[44px] w-full sm:w-auto"
              data-testid="start-reconciliation-header-button"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Start Reconciliation
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex items-center gap-2 w-full sm:w-auto [&>div]:w-full sm:[&>div]:w-auto">
          <label htmlFor="year-filter" className="text-sm font-medium sr-only">
            Year
          </label>
          <Select
            value={effectiveYear.toString()}
            onValueChange={(v) => {
              setUserChangedYear(true)
              setSelectedYear(parseInt(v))
            }}
          >
            <SelectTrigger
              id="year-filter"
              className="w-full sm:w-32"
              aria-label="Year"
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {getYearOptions().map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto [&>div]:w-full sm:[&>div]:w-auto">
          <label
            htmlFor="property-filter"
            className="text-sm font-medium sr-only"
          >
            Property
          </label>
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger
              id="property-filter"
              className="w-full sm:w-48"
              aria-label="Property"
            >
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {propertiesData?.data?.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto [&>div]:w-full sm:[&>div]:w-auto">
          <label
            htmlFor="status-filter"
            className="text-sm font-medium sr-only"
          >
            Status
          </label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              id="status-filter"
              className="w-full sm:w-40"
              aria-label="Status"
            >
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Free Audit Upgrade Modal */}
      <FreeAuditUpgradeModal
        open={upgradeModalOpen}
        potentialRecovery={null}
        onClose={() => setUpgradeModalOpen(false)}
        onSubscribe={() => {
          setUpgradeModalOpen(false)
          navigate('/settings/billing')
        }}
      />
      <ReconciliationKickoffModal
        open={kickoffModalOpen}
        onOpenChange={setKickoffModalOpen}
        year={effectiveYear}
      />

      {/* Loading state */}
      {isLoading && <LoadingSkeleton />}

      {/* Error state */}
      {(hasError || isOffline) && !isLoading && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>
            {isOffline
              ? "Can't reach the server"
              : "Couldn't load reconciliations"}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {isOffline
                ? 'Check your connection and try again. Your data is safe.'
                : 'We had trouble loading your reconciliations. Your data is safe. Use Retry to try again.'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="min-h-[44px]"
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {!isLoading && !hasError && !isOffline && (
        <>
          {/* Guided empty state: no properties AND no snapshots (brand-new user) */}
          {hasNoProperties && hasNoSnapshots && (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Calculator
                    className="h-8 w-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">
                    No reconciliations yet
                  </h2>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    To run your first reconciliation, you need a property with
                    leases and an uploaded expense report.
                  </p>
                </div>
                {(() => {
                  const v = getVideoForPlacement('app-reconciliations-empty')
                  return v ? (
                    <div className="w-full max-w-xs">
                      <p className="mb-2 text-xs text-muted-foreground">
                        Watch how it works
                      </p>
                      <VideoCard video={v} />
                    </div>
                  ) : null
                })()}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild variant="default">
                    <Link to="/ingestion">Upload expense report →</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/properties">View properties →</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* No properties state (properties deleted but some snapshots remain) */}
          {hasNoProperties && !hasNoSnapshots && (
            <Card className="text-center py-12">
              <CardContent>
                <Building2
                  className="mx-auto h-12 w-12 text-muted-foreground mb-4"
                  aria-hidden="true"
                />
                <h2 className="text-lg font-medium mb-2">
                  No properties found
                </h2>
                <p className="text-muted-foreground mb-4">
                  Add a property to start tracking reconciliations.
                </p>
                <Button
                  onClick={() => navigate('/properties/new')}
                  className="min-h-[44px]"
                >
                  Add Property
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Has properties but no snapshots */}
          {!hasNoProperties && hasNoSnapshots && (
            <Card className="text-center py-12">
              <CardContent>
                <Calculator
                  className="mx-auto h-12 w-12 text-muted-foreground mb-4"
                  aria-hidden="true"
                />
                <h2 className="text-lg font-medium mb-2">
                  No reconciliations found
                </h2>
                <p className="text-muted-foreground mb-4">
                  {propertyFilter !== 'all'
                    ? 'No reconciliations found for the selected property and filters.'
                    : 'Run your first reconciliation to see results here.'}
                </p>
                <Button
                  onClick={handleStartReconciliation}
                  className="min-h-[44px]"
                  data-testid="start-reconciliation-empty-button"
                >
                  Start Reconciliation
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Has data */}
          {!hasNoProperties && !hasNoSnapshots && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Properties</CardDescription>
                    <CardTitle as="p" className="text-2xl">
                      {stats.propertyCount}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Tenants</CardDescription>
                    <CardTitle as="p" className="text-2xl">
                      {stats.totalTenants}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Draft</CardDescription>
                    <CardTitle
                      as="p"
                      className="text-2xl text-warning-foreground"
                    >
                      {stats.draftProperties}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>
                      {effectiveYear} Tenant Billable
                    </CardDescription>
                    <CardTitle
                      as="p"
                      className="text-2xl font-mono tabular-nums text-success-strong"
                    >
                      {formatCurrency(stats.totalRecovery)}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Table grouped by property */}
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Reconciliations by Property</CardTitle>
                  <CardDescription>
                    {effectiveYear} reconciliations
                    {propertyFilter !== 'all'
                      ? ' for selected property'
                      : ' across all properties'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isMobile ? (
                    /* Mobile: stacked cards so the action button never scrolls off-screen */
                    <div className="space-y-3">
                      {propertyGroups.map((group) => (
                        <div
                          key={group.propertyId}
                          className="rounded-lg border p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Building2
                                className="h-4 w-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span className="font-medium">
                                {group.propertyName}
                              </span>
                            </div>
                            <PropertyStatusBadge status={group.status} />
                          </div>
                          <div className="mt-3 flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Users className="h-4 w-4" aria-hidden="true" />
                              <span>
                                {group.tenantCount}{' '}
                                {group.tenantCount === 1 ? 'tenant' : 'tenants'}
                              </span>
                            </div>
                            <span className="font-mono tabular-nums font-medium text-foreground">
                              {formatCurrency(group.totalRecovery)}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 min-h-[44px] w-full"
                            aria-label={
                              group.status === 'all_finalized'
                                ? `View ${group.propertyName} reconciliation`
                                : `Review ${group.propertyName} reconciliation`
                            }
                            onClick={() =>
                              handleNavigateToReconciliation(group.propertyId)
                            }
                          >
                            {group.status === 'all_finalized'
                              ? 'View'
                              : 'Review'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableCaption className="sr-only">
                          {effectiveYear} reconciliations by property
                        </TableCaption>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Property</TableHead>
                            <TableHead>Tenants</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">
                              Tenant Billable
                            </TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {propertyGroups.map((group) => (
                            <TableRow key={group.propertyId}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Building2
                                    className="h-4 w-4 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                  <span className="font-medium">
                                    {group.propertyName}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Users
                                    className="h-4 w-4 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                  <span>{group.tenantCount}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <PropertyStatusBadge status={group.status} />
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums font-medium">
                                {formatCurrency(group.totalRecovery)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="min-h-[44px]"
                                    aria-label={
                                      group.status === 'all_finalized'
                                        ? `View ${group.propertyName} reconciliation`
                                        : `Review ${group.propertyName} reconciliation`
                                    }
                                    onClick={() =>
                                      handleNavigateToReconciliation(
                                        group.propertyId
                                      )
                                    }
                                  >
                                    {group.status === 'all_finalized'
                                      ? 'View'
                                      : 'Review'}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </PageContainer>
  )
}
