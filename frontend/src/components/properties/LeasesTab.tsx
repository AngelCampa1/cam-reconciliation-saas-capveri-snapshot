/**
 * LeasesTab Component
 *
 * Displays a list of leases for a property with:
 * - DataTable with lease information
 * - Add lease button
 * - Edit/Delete actions
 * - Empty, loading, and error states
 */
import { useState } from 'react'
import { useViewport } from '@/hooks/useViewport'
import { useNavigate } from 'react-router-dom'
import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Plus } from 'lucide-react'
import { EmptyStateNoLeases } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'

import { useLeases, useDeleteLease } from '@/api/hooks'
import { formatCalendarDate } from '@/lib/utils'
import { getLeaseStatusVariant } from '@/lib/lease-status'
import { type Lease, type ApiError } from '@/api/client'
import { DataTable } from '@/components/ui/data-table'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

interface LeasesTabProps {
  propertyId: string
}

/**
 * Format a date-only field (YYYY-MM-DD) for display, avoiding UTC-shift off-by-one.
 */
function formatDate(dateString: string): string {
  return formatCalendarDate(dateString) || '-'
}

/**
 * Format pro-rata share as percentage
 */
function formatProRataShare(value: number | string | null | undefined): string {
  if (value == null) return '-'
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '-'
  return `${(numValue * 100).toFixed(2)}%`
}

export function LeasesTab({ propertyId }: LeasesTabProps) {
  const navigate = useNavigate()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [leaseToDelete, setLeaseToDelete] = useState<Lease | null>(null)
  const { isMobile } = useViewport()

  // Fetch leases for this property
  const { data, isLoading, isPaused, error, refetch } = useLeases({
    property_id: propertyId,
    limit: 100,
  })
  const leases = data?.data || []
  const isOffline = isPaused && !data

  const deleteMutation = useDeleteLease({
    onSuccess: () => {
      toast.success('Lease deleted successfully')
      setDeleteDialogOpen(false)
      setLeaseToDelete(null)
    },
    onError: (error: ApiError) => {
      toast.error('Failed to delete lease', {
        description: getErrorMessage(error),
      })
    },
  })

  // Handle delete click
  const handleDeleteClick = (lease: Lease) => {
    setLeaseToDelete(lease)
    setDeleteDialogOpen(true)
  }

  // Handle delete confirm
  const handleDeleteConfirm = () => {
    if (leaseToDelete) {
      deleteMutation.mutate(leaseToDelete.id)
    }
  }

  // Handle add lease click
  const handleAddLease = () => {
    navigate(`/properties/${propertyId}/leases/new`)
  }

  // Show the pre-run sample so a first-time user is never stuck on an empty
  // tab. `?demo=1` reaches the sample result for a signed-in user; a bare
  // /onboard bounces logged-in users to checkout.
  const handleSeeSample = () => {
    navigate('/onboard?demo=1')
  }

  // Handle edit lease click
  const handleEditLease = (lease: Lease) => {
    navigate(`/properties/${propertyId}/leases/${lease.id}/edit`)
  }

  // Table columns
  const columns: ColumnDef<Lease>[] = [
    {
      accessorKey: 'tenant_name',
      header: 'Tenant',
      cell: ({ row }) => row.original.tenant_name || '-',
    },
    {
      accessorKey: 'start_date',
      header: 'Start Date',
      cell: ({ row }) => formatDate(row.original.start_date),
    },
    {
      accessorKey: 'end_date',
      header: 'End Date',
      cell: ({ row }) => formatDate(row.original.end_date),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status
        if (!status) {
          return <Badge variant="neutral">Unknown</Badge>
        }
        return (
          <Badge variant={getLeaseStatusVariant(status)}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        )
      },
    },
    {
      id: 'pro_rata_share',
      header: 'Pro-Rata Share',
      cell: ({ row }) => {
        const proRataShare = row.original.recovery_profile?.pro_rata_share
        return formatProRataShare(proRataShare)
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Open menu for ${row.original.tenant_name}`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditLease(row.original)}>
              Edit<span className="sr-only"> {row.original.tenant_name}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDeleteClick(row.original)}
              className="text-destructive-strong"
            >
              Delete<span className="sr-only"> {row.original.tenant_name}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  // Error state (also handles offline/paused-fetch)
  if (error || isOffline) {
    return (
      <ErrorState
        title="Couldn't load leases"
        size="sm"
        offline={isOffline}
        action={{ onClick: () => refetch() }}
      />
    )
  }

  // Empty state with Add button
  if (!isLoading && !isOffline && leases.length === 0) {
    return (
      <EmptyStateNoLeases
        onAction={handleAddLease}
        onSeeSample={handleSeeSample}
      />
    )
  }

  return (
    <div className="space-y-lg">
      {/* Header with Add button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Leases</h2>
        <Button onClick={handleAddLease} className="w-full sm:w-auto">
          <Plus className="mr-sm h-icon w-icon" aria-hidden="true" />
          Add Lease
        </Button>
      </div>

      {/* Leases table */}
      {isMobile ? (
        <div className="space-y-3 md:hidden">
          {leases.map((lease) => (
            <div key={lease.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium">
                  {lease.tenant_name || 'Unnamed tenant'}
                </p>
                <Badge
                  variant={getLeaseStatusVariant(lease.status)}
                  className="shrink-0"
                >
                  {lease.status
                    ? lease.status.charAt(0).toUpperCase() +
                      lease.status.slice(1)
                    : 'Unknown'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(lease.start_date)} - {formatDate(lease.end_date)}
              </p>
              <div className="mt-3 text-sm">
                <p className="text-xs text-muted-foreground">Pro-Rata Share</p>
                <p className="font-medium">
                  {formatProRataShare(lease.recovery_profile?.pro_rata_share)}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEditLease(lease)}
                  aria-label={`Edit lease for ${lease.tenant_name}`}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-destructive-strong"
                  onClick={() => handleDeleteClick(lease)}
                  aria-label={`Delete lease for ${lease.tenant_name}`}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className={isMobile ? 'hidden md:block' : ''}>
        <DataTable
          columns={columns}
          data={leases}
          isLoading={isLoading}
          emptyMessage="No leases found."
          enablePagination={false}
          caption="Leases for this property"
        />
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lease</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the lease for{' '}
              {leaseToDelete?.tenant_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
