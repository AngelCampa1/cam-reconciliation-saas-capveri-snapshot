/**
 * UnitsTab Component
 *
 * Displays a list of units for a property with:
 * - DataTable with unit information
 * - Status toggle for active/inactive units
 * - Add unit button
 * - Edit/Delete actions
 * - Empty, loading, and error states
 */
import { useState } from 'react'
import { useViewport } from '@/hooks/useViewport'
import { ColumnDef } from '@tanstack/react-table'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Plus, Building2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'

import { useUnits, useDeleteUnit, queryKeys } from '@/api/hooks'
import {
  apiClient,
  updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut,
  type Unit,
  type ApiError,
  type UnitStatus,
} from '@/api/client'
import { DataTable } from '@/components/ui/data-table'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
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
import { UnitFormModal } from './UnitFormModal'

interface UnitsTabProps {
  propertyId: string
}

/**
 * Format number with thousand separators
 */
function formatNumber(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(num)
}

export function UnitsTab({ propertyId }: UnitsTabProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [unitToEdit, setUnitToEdit] = useState<Unit | null>(null)
  const { isMobile } = useViewport()
  const queryClient = useQueryClient()

  // Fetch units for this property
  const { data, isLoading, isPaused, error, refetch } = useUnits(propertyId)
  const units = data?.data || []
  const isOffline = isPaused && !data

  // Update mutation using direct API call (allows dynamic unit ID)
  const updateMutation = useMutation({
    mutationFn: async ({
      unitId,
      ...body
    }: {
      unitId: string
      status?: UnitStatus
    }) => {
      const { data, error } =
        await updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut({
          client: apiClient,
          path: { property_id: propertyId, unit_id: unitId },
          body,
        })
      if (error) throw error
      return data
    },
    // Optimistic update: immediately update UI before server responds
    onMutate: async ({ unitId, status: newStatus }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.units.byProperty(propertyId),
      })

      // Get all queries for this property's units
      const queriesData = queryClient.getQueriesData({
        queryKey: queryKeys.units.byProperty(propertyId),
      })

      // Optimistically update all matching queries
      if (newStatus && queriesData.length > 0) {
        queriesData.forEach(([queryKey]) => {
          queryClient.setQueryData(queryKey, (old: unknown) => {
            if (!old || typeof old !== 'object' || !('data' in old)) return old
            const typedOld = old as { data: Unit[] }
            return {
              ...typedOld,
              data: typedOld.data.map((unit: Unit) =>
                unit.id === unitId ? { ...unit, status: newStatus } : unit
              ),
            }
          })
        })
      }

      // Return a context object with the snapshotted value
      return { queriesData }
    },
    // On success, invalidate to refetch with fresh server data
    onSuccess: () => {
      toast.success('Unit updated successfully')
      // Invalidate all unit queries for this property to refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.units.byProperty(propertyId),
      })
    },
    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (error: ApiError, _variables, context) => {
      // Restore all previous query states
      if (context?.queriesData) {
        context.queriesData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      toast.error('Failed to update unit', {
        description: getErrorMessage(error),
      })
    },
  })

  const deleteMutation = useDeleteUnit(propertyId, {
    onSuccess: () => {
      toast.success('Unit deleted successfully')
      setDeleteDialogOpen(false)
      setUnitToDelete(null)
    },
    onError: (error: ApiError) => {
      toast.error('Failed to delete unit', {
        description: getErrorMessage(error),
      })
    },
  })

  // Handle status toggle (toggles between 'occupied' and 'vacant')
  const handleStatusToggle = (unit: Unit) => {
    const currentStatus = unit.status || 'vacant' // Default to vacant if undefined
    const newStatus: UnitStatus =
      currentStatus === 'occupied' ? 'vacant' : 'occupied'

    updateMutation.mutate({
      unitId: unit.id,
      status: newStatus,
    })
  }

  // Handle delete click
  const handleDeleteClick = (unit: Unit) => {
    setUnitToDelete(unit)
    setDeleteDialogOpen(true)
  }

  // Handle delete confirm
  const handleDeleteConfirm = () => {
    if (unitToDelete) {
      deleteMutation.mutate(unitToDelete.id)
    }
  }

  // Handle add unit click
  const handleAddUnit = () => {
    setUnitToEdit(null)
    setFormModalOpen(true)
  }

  // Handle edit unit click
  const handleEditUnit = (unit: Unit) => {
    setUnitToEdit(unit)
    setFormModalOpen(true)
  }

  // Table columns
  const columns: ColumnDef<Unit>[] = [
    {
      accessorKey: 'unit_number',
      header: 'Unit Number',
      cell: ({ row }) => row.original.unit_number,
    },
    {
      accessorKey: 'rentable_sqft',
      header: 'Rentable Sqft',
      cell: ({ row }) => formatNumber(row.original.rentable_sqft),
    },
    {
      accessorKey: 'usable_sqft',
      header: 'Usable Sqft',
      cell: ({ row }) => formatNumber(row.original.usable_sqft),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Switch
          checked={row.original.status === 'occupied'}
          onCheckedChange={() => handleStatusToggle(row.original)}
          aria-label={`Toggle status for unit ${row.original.unit_number}`}
        />
      ),
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
              aria-label={`Open menu for unit ${row.original.unit_number}`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditUnit(row.original)}>
              Edit
              <span className="sr-only"> unit {row.original.unit_number}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDeleteClick(row.original)}
              className="text-destructive-strong"
            >
              Delete
              <span className="sr-only"> unit {row.original.unit_number}</span>
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
        title="Couldn't load units"
        size="sm"
        offline={isOffline}
        action={{ onClick: () => refetch() }}
      />
    )
  }

  // Empty state with Add button
  if (!isLoading && !isOffline && units.length === 0) {
    return (
      <>
        <EmptyState
          icon={Building2}
          title="No units yet"
          description="Units set the square feet used to split each tenant CAM share. Add a unit to get started."
          action={{ label: 'Add Unit', onClick: handleAddUnit }}
        />

        {/* Unit form modal - MUST be rendered even when list is empty */}
        <UnitFormModal
          propertyId={propertyId}
          {...(unitToEdit !== null && { unit: unitToEdit })}
          open={formModalOpen}
          onOpenChange={setFormModalOpen}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Units</h2>
        <Button onClick={handleAddUnit} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add Unit
        </Button>
      </div>

      {/* Units table */}
      {isMobile ? (
        <div className="space-y-3 md:hidden">
          {units.map((unit) => (
            <div key={unit.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    Unit {unit.unit_number}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatNumber(unit.rentable_sqft)} RSF
                  </p>
                </div>
                <Switch
                  checked={unit.status === 'occupied'}
                  onCheckedChange={() => handleStatusToggle(unit)}
                  aria-label={`Toggle status for unit ${unit.unit_number}`}
                />
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEditUnit(unit)}
                  aria-label={`Edit unit ${unit.unit_number}`}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-destructive-strong"
                  onClick={() => handleDeleteClick(unit)}
                  aria-label={`Delete unit ${unit.unit_number}`}
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
          data={units}
          isLoading={isLoading}
          emptyMessage="No units found."
          enablePagination={false}
        />
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete unit {unitToDelete?.unit_number}?
              This action cannot be undone.
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

      {/* Unit form modal */}
      <UnitFormModal
        propertyId={propertyId}
        {...(unitToEdit !== null && { unit: unitToEdit })}
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
      />
    </div>
  )
}
