/**
 * Property List Page Component
 *
 * Displays a paginated, searchable, sortable table of properties.
 * Features:
 * - Search by property name or address
 * - Column sorting
 * - Pagination with configurable page size
 * - Loading skeleton
 * - Empty state with CTA
 * - Row click navigation
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ColumnDef } from '@tanstack/react-table'
import { Plus, Search, AlertCircle } from 'lucide-react'

import { useProperties } from '@/api/hooks'
import { FreeAuditUpgradeModal } from '@/components/billing/FreeAuditUpgradeModal'
import type { Property } from '@/api/client'
import { ErrorState } from '@/components/ErrorState'
import { DataTable } from '@/components/ui/data-table/DataTable'
import { DataTableColumnHeader } from '@/components/ui/data-table/DataTableColumnHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { useFreeAuditStatus } from '@/hooks/use-free-audit-status'
import { useDebounce } from '@/hooks/useDebounce'
import { getCountBucket, trackEvent } from '@/lib/analytics'
import { formatTimestampDate } from '@/lib/utils'
import { formatWholeNumber } from '@/lib/number'
import { PropertyCard } from './PropertyCard'

/**
 * Format full address on one line
 */
function formatAddress(property: Property): string {
  const parts = [
    property.address_line1,
    property.address_line2,
    property.city,
    property.state,
    property.postal_code,
  ].filter(Boolean)
  return parts.join(', ')
}

export function PropertyListPage() {
  const navigate = useNavigate()
  const { data: freeAuditStatus } = useFreeAuditStatus()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 300)

  // Fetch properties. Request the API maximum (100) so the client-side search
  // below covers as many properties as possible in one page; `has_more` tells
  // us when even that ceiling is exceeded so the truncation isn't silent.
  const { data, isLoading, error, isPaused, refetch } = useProperties({
    limit: 100,
  })
  // A paused fetch (unreachable backend) leaves error null + data undefined,
  // so without this the empty state below would lie ("No properties yet").
  const isOffline = isPaused && !data

  // Filter data by search term (client-side for now)
  const filteredData = useMemo(() => {
    if (!data?.data) return []
    if (!debouncedSearch) return data.data

    const searchLower = debouncedSearch.toLowerCase()
    return data.data.filter(
      (property) =>
        property.name.toLowerCase().includes(searchLower) ||
        (property.address_line1 ?? '').toLowerCase().includes(searchLower) ||
        (property.city ?? '').toLowerCase().includes(searchLower) ||
        (property.state ?? '').toLowerCase().includes(searchLower) ||
        (property.postal_code ?? '').toLowerCase().includes(searchLower)
    )
  }, [data, debouncedSearch])

  useEffect(() => {
    if (isLoading || error || !data) return

    trackEvent('properties_viewed', {
      property_count: data.count,
      property_count_bucket: getCountBucket(data.count),
      has_more: data.has_more ?? false,
    })
  }, [data, error, isLoading])

  useEffect(() => {
    if (!debouncedSearch || isLoading || error || !data) return

    trackEvent('property_search_used', {
      result_count: filteredData.length,
      result_count_bucket: getCountBucket(filteredData.length),
      total_count: data.count,
      total_count_bucket: getCountBucket(data.count),
      has_results: filteredData.length > 0,
    })
  }, [data, debouncedSearch, error, filteredData.length, isLoading])

  // Table columns
  const columns = useMemo<ColumnDef<Property>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Property Name" />
        ),
        cell: ({ row }) => {
          const property = row.original
          return <span className="font-medium">{property.name}</span>
        },
      },
      {
        accessorKey: 'address',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Address" />
        ),
        cell: ({ row }) => (
          <div
            className="max-w-xs truncate"
            title={formatAddress(row.original)}
          >
            {formatAddress(row.original)}
          </div>
        ),
        enableSorting: false, // Can't sort by computed field
      },
      {
        accessorKey: 'total_rentable_sqft',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Total Rentable Sqft" />
        ),
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatWholeNumber(row.original.total_rentable_sqft)}
          </div>
        ),
      },
      {
        accessorKey: 'total_usable_sqft',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Total Usable Sqft" />
        ),
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatWholeNumber(row.original.total_usable_sqft)}
          </div>
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {formatTimestampDate(row.original.created_at)}
          </div>
        ),
      },
    ],
    []
  )

  // Handle row click
  const handleRowClick = (property: Property) => {
    trackEvent('property_detail_opened', { property_id: property.id })
    navigate(`/properties/${property.id}`)
  }

  const handleAddProperty = () => {
    trackEvent('property_add_clicked', {
      can_add_property: freeAuditStatus?.can_add_property ?? true,
      has_subscription: freeAuditStatus?.has_subscription ?? false,
      free_audit_consumed: freeAuditStatus?.free_audit_consumed ?? false,
    })
    if (freeAuditStatus && !freeAuditStatus.can_add_property) {
      trackEvent('property_add_blocked', {
        block_reason: 'free_audit_limit',
        has_subscription: freeAuditStatus.has_subscription,
        free_audit_consumed: freeAuditStatus.free_audit_consumed,
      })
      setUpgradeModalOpen(true)
      return
    }
    navigate('/properties/new')
  }

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title="Properties"
        description="Manage your commercial real estate properties"
        actions={
          <Button
            data-testid="add-property-button"
            onClick={handleAddProperty}
            className="min-h-[44px] w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add Property
          </Button>
        }
      />

      <div className="flex-1 space-y-4">
        {/* Search Bar */}
        <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-background/50 p-3 shadow-sm">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search properties"
              placeholder="Search by property name or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="property-search-input"
            />
          </div>
        </div>

        {/* Truncation notice - search only covers the loaded page */}
        {!isLoading && !error && data?.has_more && (
          <div
            className="flex items-start gap-2 rounded-lg border border-border-subtle bg-muted/40 p-3 text-sm text-muted-foreground"
            role="status"
            data-testid="property-truncation-notice"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              aria-hidden="true"
            />
            <span>
              Showing the first {data.data.length} of {data.count} properties.
              Search covers only the properties shown here. Open a property to
              reach the rest.
            </span>
          </div>
        )}

        {/* Error / Offline State */}
        {(error || isOffline) &&
          (() => {
            const friendlyMessage = error
              ? error.message.includes('Network') ||
                error.message.includes('fetch')
                ? 'Connection failed. Please check your internet connection and try again.'
                : error.message.includes('401') || error.message.includes('403')
                  ? 'Authentication error. Please log out and log back in.'
                  : error.message.includes('500')
                    ? 'Server error. Our team has been notified. Please try again later.'
                    : error.message
              : undefined
            return (
              <ErrorState
                title="Couldn't load properties"
                titleAs="h2"
                description={friendlyMessage}
                offline={isOffline}
                action={{ onClick: () => refetch() }}
              />
            )
          })()}

        {/* Empty State */}
        {!isLoading && filteredData.length === 0 && !error && !isOffline && (
          <EmptyState
            titleAs="h2"
            title={
              debouncedSearch ? 'No properties found' : 'No properties yet'
            }
            description={
              debouncedSearch
                ? 'Try adjusting your search criteria.'
                : 'Get started by adding your first property.'
            }
            action={
              debouncedSearch
                ? undefined
                : {
                    label: 'Add Property',
                    onClick: handleAddProperty,
                  }
            }
          />
        )}

        {/* Screen reader announcement for filtered results */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {!isLoading &&
            (debouncedSearch
              ? `${filteredData.length} ${filteredData.length === 1 ? 'property' : 'properties'} found`
              : '')}
        </div>

        {/* Data Table with Mobile Cards */}
        {(isLoading || filteredData.length > 0) && (
          <DataTable
            columns={columns}
            data={filteredData}
            isLoading={isLoading}
            enablePagination={true}
            pageSize={10}
            pageSizeOptions={[10, 25, 50, 100]}
            onRowClick={handleRowClick}
            emptyMessage="No properties found"
            getRowId={(row) => row.id}
            caption="Properties"
            getRowLabel={(property) => `View ${property.name}`}
            mobileCardRenderer={(property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onClick={handleRowClick}
              />
            )}
          />
        )}
      </div>

      <FreeAuditUpgradeModal
        open={upgradeModalOpen}
        potentialRecovery={null}
        onClose={() => setUpgradeModalOpen(false)}
        onSubscribe={() => {
          setUpgradeModalOpen(false)
          navigate('/settings/billing')
        }}
      />
    </div>
  )
}
