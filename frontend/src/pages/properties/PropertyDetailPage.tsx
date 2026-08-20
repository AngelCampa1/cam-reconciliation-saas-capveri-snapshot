/**
 * Property Detail Page Component
 *
 * Displays property details with tabs for related data.
 * Features:
 * - Property header with name, address, and actions
 * - Stats cards showing key metrics
 * - Tabs for Overview, Units, Leases, Imports, Reconciliations
 * - Edit/Delete actions
 * - Breadcrumb navigation
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Pencil,
  Trash2,
  Building2,
  LayoutGrid,
  FileText,
  Percent,
  ArrowRight,
} from 'lucide-react'

import {
  useProperty,
  useDeleteProperty,
  useUnits,
  useLeases,
} from '@/api/hooks'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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
import { PropertyOverviewTab } from './PropertyOverviewTab'
import { UnitsTab } from '@/components/properties/UnitsTab'
import { LeasesTab } from '@/components/properties/LeasesTab'
import { ImportsTab } from '@/components/properties/ImportsTab'
import { ReconciliationsTab } from '@/components/properties/ReconciliationsTab'
import { ExpensePoolsTab } from '@/components/properties/ExpensePoolsTab'
import { SB1103RequestsTab } from '@/components/properties/SB1103RequestsTab'
import { getCountBucket, trackEvent } from '@/lib/analytics'
import { toast } from 'sonner'
import { ErrorState } from '@/components/ErrorState'
import { formatWholeNumber } from '@/lib/number'

function tabFromHash(hash: string, isCaliforniaProperty: boolean): string {
  const tab = hash.replace(/^#/, '')
  const validTabs = new Set([
    'overview',
    'reconciliations',
    'pools',
    'units',
    'leases',
    'imports',
    ...(isCaliforniaProperty ? ['compliance'] : []),
  ])

  return validTabs.has(tab) ? tab : 'overview'
}

function getOccupancyBucket(value: number): string {
  if (value <= 0) return '0'
  if (value < 50) return '1-49'
  if (value < 80) return '50-79'
  if (value < 95) return '80-94'
  return '95-100'
}

export function PropertyDetailPage() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTab, setSelectedTab] = useState<string | null>(null)
  const trackedViewKeyRef = useRef<string | null>(null)

  // Fetch property data
  const {
    data: property,
    isLoading,
    error,
    isPaused,
    refetch: refetchProperty,
  } = useProperty(propertyId!)
  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves error null and property undefined, so without this guard the page
  // would render "Property not found" and imply the property was removed when
  // the backend is simply unreachable. Route it into the retryable error branch.
  const isOffline = isPaused && !property

  // Fetch unit and lease counts (only need counts, so limit to 1)
  const {
    data: unitsData,
    isLoading: unitsLoading,
    isError: unitsError,
    refetch: refetchUnits,
  } = useUnits(propertyId!, { limit: 1 }, { enabled: !!propertyId })
  const {
    data: leasesData,
    isLoading: leasesLoading,
    isError: leasesError,
    refetch: refetchLeases,
  } = useLeases(
    propertyId
      ? { property_id: propertyId, status: 'active', limit: 1 }
      : undefined,
    { enabled: !!propertyId }
  )
  const isCaliforniaProperty = (property?.state ?? '').toUpperCase() === 'CA'
  const activeTab =
    selectedTab ?? tabFromHash(location.hash, isCaliforniaProperty)
  const statsLoading = unitsLoading || leasesLoading
  // When the count queries fail we must not show a confident "0" / "0%" or
  // recommend "Add your first unit" off a false zero. Surface the failure and
  // let the user retry instead.
  const statsError = unitsError || leasesError
  const unitCount = unitsData?.count ?? 0
  const activeLeaseCount = leasesData?.count ?? 0
  // Occupancy is the share of units that are leased, so it cannot exceed 100%.
  // Clamp it: stale or historical lease records can leave more active leases
  // than units (e.g. a unit re-let mid-term), and an uncapped "300% occupied"
  // reads as a broken number to anyone evaluating the product.
  const occupancyRate =
    unitCount > 0
      ? Math.min(100, Math.round((activeLeaseCount / unitCount) * 100))
      : 0

  const handleTabChange = (
    tab: string,
    source: 'tab_click' | 'setup_next_action' = 'tab_click'
  ) => {
    setSelectedTab(tab)
    if (propertyId) {
      trackEvent('property_detail_tab_changed', {
        property_id: propertyId,
        tab,
        source,
      })
    }
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: tab,
      },
      { replace: true }
    )
  }

  // Delete mutation
  const deleteMutation = useDeleteProperty({
    onSuccess: () => {
      if (propertyId) {
        trackEvent('property_delete_succeeded', { property_id: propertyId })
      }
      toast.success('Property deleted successfully')
      navigate('/properties')
    },
    onError: (error) => {
      console.error(error)
      toast.error(
        "We couldn't delete this property. Nothing was removed. Try again."
      )
    },
  })

  useEffect(() => {
    if (statsLoading || statsError || !propertyId || !property) return

    const viewKey = `${propertyId}:${unitCount}:${activeLeaseCount}`
    if (trackedViewKeyRef.current === viewKey) return
    trackedViewKeyRef.current = viewKey

    trackEvent('property_detail_viewed', {
      property_id: propertyId,
      state: property.state,
      unit_count: unitCount,
      unit_count_bucket: getCountBucket(unitCount),
      active_lease_count: activeLeaseCount,
      active_lease_count_bucket: getCountBucket(activeLeaseCount),
      occupancy_bucket: getOccupancyBucket(occupancyRate),
      initial_tab: activeTab,
      has_compliance_tab: isCaliforniaProperty,
    })
  }, [
    activeLeaseCount,
    activeTab,
    isCaliforniaProperty,
    occupancyRate,
    property,
    propertyId,
    statsLoading,
    statsError,
    unitCount,
  ])

  const handleDelete = () => {
    if (propertyId) {
      deleteMutation.mutate(propertyId)
    }
  }

  // Error state - Check FIRST before loading state
  // This ensures errors are displayed immediately, even if child queries are still loading
  if (error || isOffline || (!isLoading && !property)) {
    const showError = error || isOffline
    return (
      <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
        <PageHeader
          title={showError ? "Couldn't load property" : 'Property not found'}
        />
        <div className="flex-1">
          {showError ? (
            <ErrorState
              title="Couldn't load this property"
              description="Your data is safe. Try again, or go back to your property list."
              offline={isOffline}
              action={{ onClick: () => void refetchProperty() }}
              secondaryAction={{
                label: 'Back to properties',
                onClick: () => navigate('/properties'),
              }}
            />
          ) : (
            <ErrorState
              title="Property not found"
              description="This property doesn't exist or was removed."
              secondaryAction={{
                label: 'Back to properties',
                onClick: () => navigate('/properties'),
              }}
            />
          )}
        </div>
      </div>
    )
  }

  // Loading state - only the core property query blocks the whole page. The
  // unit/lease queries feed individual stat cards (and the setup card) that
  // show their own loading state, so we don't hold the entire page (header,
  // breadcrumbs, actions, rentable sqft) hostage to them.
  if (isLoading) {
    return (
      <div
        className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8"
        data-testid="property-detail-skeleton"
      >
        <PageHeader
          title={<Skeleton className="h-8 w-64" />}
          description="Loading property details…"
        />
        <div className="flex-1 space-y-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Rentable Sqft"
              value=""
              icon={Building2}
              iconColor="chart-3"
              titleAs="h2"
              isLoading
            />
            <StatCard
              title="Unit Count"
              value=""
              icon={LayoutGrid}
              iconColor="chart-4"
              titleAs="h2"
              isLoading
            />
            <StatCard
              title="Active Lease Count"
              value=""
              icon={FileText}
              iconColor="chart-1"
              titleAs="h2"
              isLoading
            />
            <StatCard
              title="Unit Occupancy"
              value=""
              icon={Percent}
              iconColor="chart-2"
              titleAs="h2"
              isLoading
            />
          </div>
        </div>
      </div>
    )
  }

  // TypeScript guard: property is guaranteed to be defined after error/loading checks above
  if (!property) {
    return null
  }

  // Format address for subtitle
  const addressParts = [
    property.address_line1,
    property.address_line2,
    property.city,
    property.state,
    property.postal_code,
  ].filter(Boolean)
  const fullAddress = addressParts.join(', ')

  // Unit-based occupancy (leased units / total units) - NOT BOMA square-footage
  const stats = {
    rentableSqft: formatWholeNumber(property.total_rentable_sqft),
    unitCount: unitCount.toString(),
    leaseCount: activeLeaseCount.toString(),
    occupancyRate: `${occupancyRate}%`,
  }
  const nextAction =
    unitCount === 0
      ? { label: 'Add your first unit', to: 'units' }
      : activeLeaseCount === 0
        ? { label: 'Add active leases', to: 'leases' }
        : { label: 'Upload GL data', to: 'imports' }

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title={property.name}
        description={fullAddress}
        showBackButton={true}
        backButtonTo="/properties"
        breadcrumbs={[
          { label: 'Properties', href: '/properties' },
          { label: property.name },
        ]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/properties/${propertyId}/edit`)}
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

      <div className="flex-1 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Rentable Sqft"
            value={stats.rentableSqft}
            icon={Building2}
            iconColor="chart-3"
            titleAs="h2"
          />
          <StatCard
            title="Unit Count"
            value={stats.unitCount}
            icon={LayoutGrid}
            iconColor="chart-4"
            titleAs="h2"
            isLoading={statsLoading}
            isError={unitsError}
          />
          <StatCard
            title="Active Lease Count"
            value={stats.leaseCount}
            icon={FileText}
            iconColor="chart-1"
            titleAs="h2"
            isLoading={statsLoading}
            isError={leasesError}
          />
          <StatCard
            title="Unit Occupancy"
            value={stats.occupancyRate}
            icon={Percent}
            iconColor="chart-2"
            titleAs="h2"
            isLoading={statsLoading}
            isError={statsError}
          />
        </div>

        <Card className="border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            {statsLoading ? (
              // Don't render the counts or a next-action recommendation until
              // the unit/lease queries resolve - otherwise we'd briefly suggest
              // "Add your first unit" before the real counts arrive.
              <>
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-6 w-56" />
                </div>
                <Skeleton className="h-9 w-full sm:w-40" />
              </>
            ) : statsError ? (
              // A failed count query must not drive a misleading next-action
              // (e.g. "Add your first unit" off a false zero). Show the failure
              // and let the user retry both count queries.
              <>
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">Property setup</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    We couldn't load this property's unit and lease counts.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    refetchUnits()
                    refetchLeases()
                  }}
                >
                  Try again
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">Property setup</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-md border bg-background px-2 py-1">
                      Units: {unitCount}
                    </span>
                    <span className="rounded-md border bg-background px-2 py-1">
                      Leases: {activeLeaseCount}
                    </span>
                    <span className="rounded-md border bg-background px-2 py-1">
                      Ready for imports
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full justify-between sm:w-auto sm:justify-center"
                  onClick={() => {
                    handleTabChange(nextAction.to, 'setup_next_action')
                  }}
                >
                  {nextAction.label}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="space-y-6"
        >
          <ScrollableTabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reconciliations">Reconciliations</TabsTrigger>
            <TabsTrigger value="pools">Pools</TabsTrigger>
            <TabsTrigger value="units">Units</TabsTrigger>
            <TabsTrigger value="leases">Leases</TabsTrigger>
            <TabsTrigger value="imports">Imports</TabsTrigger>
            {isCaliforniaProperty ? (
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
            ) : null}
          </ScrollableTabsList>

          <TabsContent value="overview">
            <PropertyOverviewTab property={property} />
          </TabsContent>

          <TabsContent value="reconciliations">
            <ReconciliationsTab propertyId={propertyId!} />
          </TabsContent>

          <TabsContent value="pools">
            <ExpensePoolsTab propertyId={propertyId!} />
          </TabsContent>

          <TabsContent value="units">
            <UnitsTab propertyId={propertyId!} />
          </TabsContent>

          <TabsContent value="leases">
            <LeasesTab propertyId={propertyId!} />
          </TabsContent>

          <TabsContent value="imports">
            <ImportsTab propertyId={propertyId!} />
          </TabsContent>

          {isCaliforniaProperty ? (
            <TabsContent value="compliance">
              <SB1103RequestsTab
                propertyId={propertyId!}
                propertyState={property.state ?? ''}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{property.name}"? This action
              cannot be undone and will also delete all associated units,
              leases, and reconciliations.
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
