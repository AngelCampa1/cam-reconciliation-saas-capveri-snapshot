/**
 * ExpensePoolsTab Component
 *
 * Displays expense pools for a property with:
 * - DataTable with pool hierarchy (parent/child indentation)
 * - Pool type badges
 * - Gross-up status
 * - Mapping count with click to manage
 * - Add/Edit/Delete actions
 * - Template application and pool copying
 */
import { useState, useMemo } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { PoolMappingTourSheet } from '@/components/help/PoolMappingTourSheet'
import { ColumnDef } from '@tanstack/react-table'
import {
  AlertCircle,
  GitBranch,
  Layers,
  MoreHorizontal,
  Plus,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { decimalToPercentString } from '@/lib/percent'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'

import {
  useExpensePools,
  useDeleteExpensePool,
  usePoolMappings,
  usePoolAllocations,
} from '@/api/hooks'
import type { ExpensePoolWithChildren, ApiError } from '@/api/client'
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
import { ExpensePoolFormModal } from './ExpensePoolFormModal'
import { PoolMappingsDialog } from './PoolMappingsDialog'
import { PoolAllocationsDialog } from './PoolAllocationsDialog'

interface ExpensePoolsTabProps {
  propertyId: string
}

// Pool type badge colors
const POOL_TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> =
  {
    operating: 'default',
    tax: 'secondary',
    insurance: 'secondary',
    capital: 'outline',
    other: 'outline',
  }

// Flatten hierarchy for table display while preserving hierarchy info
interface FlattenedPool extends ExpensePoolWithChildren {
  depth: number
}

function flattenPools(pools: ExpensePoolWithChildren[]): FlattenedPool[] {
  const result: FlattenedPool[] = []

  pools.forEach((pool) => {
    result.push({ ...pool, depth: 0 })
    if (pool.children && pool.children.length > 0) {
      pool.children.forEach((child) => {
        result.push({ ...child, depth: 1 })
      })
    }
  })

  return result
}

export function ExpensePoolsTab({ propertyId }: ExpensePoolsTabProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [poolToDelete, setPoolToDelete] =
    useState<ExpensePoolWithChildren | null>(null)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [poolToEdit, setPoolToEdit] = useState<
    ExpensePoolWithChildren | undefined
  >(undefined)
  const [mappingsDialogOpen, setMappingsDialogOpen] = useState(false)
  const [poolForMappings, setPoolForMappings] =
    useState<ExpensePoolWithChildren | null>(null)
  const [allocationsDialogOpen, setAllocationsDialogOpen] = useState(false)
  const [poolForAllocations, setPoolForAllocations] =
    useState<ExpensePoolWithChildren | null>(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  // Fetch pools for this property
  const {
    data: poolsData,
    isLoading,
    error,
    refetch,
    isPaused,
  } = useExpensePools(propertyId, {
    includeChildren: true,
  })

  // Memoize pools array to avoid recreating on every render
  const pools = useMemo(() => poolsData?.data || [], [poolsData?.data])

  const isOffline = isPaused && !poolsData

  // Flatten for table display
  const flattenedPools = useMemo(() => flattenPools(pools), [pools])

  // Fetch all mappings to show count per pool
  const { data: mappingsData, isError: isMappingsError } =
    usePoolMappings(propertyId)
  const { data: allocationsData, isError: isAllocationsError } =
    usePoolAllocations(propertyId)
  // When the count queries fail the columns fall back to 0, which would
  // misleadingly render the "no mappings" warning on every pool. Surface the
  // failure instead so the counts aren't trusted as real.
  const countsFailed = isMappingsError || isAllocationsError

  // Memoize mappings array to avoid recreating on every render
  const mappings = useMemo(() => mappingsData?.data || [], [mappingsData?.data])

  // Count mappings per pool
  const mappingCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    mappings.forEach((m) => {
      counts[m.expense_pool_id] = (counts[m.expense_pool_id] || 0) + 1
    })
    return counts
  }, [mappings])

  const allocationCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    ;(allocationsData?.data || []).forEach((allocation) => {
      counts[allocation.source_pool_id] =
        (counts[allocation.source_pool_id] || 0) + 1
    })
    return counts
  }, [allocationsData?.data])

  // Delete mutation
  const deleteMutation = useDeleteExpensePool(propertyId, {
    onSuccess: () => {
      toast.success('Expense pool deleted successfully')
      setDeleteDialogOpen(false)
      setPoolToDelete(null)
    },
    onError: (error: ApiError) => {
      toast.error('Failed to delete pool', {
        description: getErrorMessage(error),
      })
    },
  })

  // Handle delete click
  const handleDeleteClick = (pool: ExpensePoolWithChildren) => {
    setPoolToDelete(pool)
    setDeleteDialogOpen(true)
  }

  // Handle delete confirm
  const handleDeleteConfirm = () => {
    if (poolToDelete) {
      deleteMutation.mutate(poolToDelete.id)
    }
  }

  // Handle add pool click
  const handleAddPool = () => {
    setPoolToEdit(undefined)
    setFormModalOpen(true)
  }

  // Handle edit pool click
  const handleEditPool = (pool: ExpensePoolWithChildren) => {
    setPoolToEdit(pool)
    setFormModalOpen(true)
  }

  // Handle mappings click
  const handleMappingsClick = (pool: ExpensePoolWithChildren) => {
    setPoolForMappings(pool)
    setMappingsDialogOpen(true)
  }

  const handleAllocationsClick = (pool: ExpensePoolWithChildren) => {
    setPoolForAllocations(pool)
    setAllocationsDialogOpen(true)
  }

  // Table columns
  const columns: ColumnDef<FlattenedPool>[] = [
    {
      accessorKey: 'name',
      header: 'Pool Name',
      cell: ({ row }) => (
        <span style={{ paddingLeft: `${row.original.depth * 24}px` }}>
          {row.original.depth > 0 && (
            <span className="text-muted-foreground mr-2">└</span>
          )}
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'pool_type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge
          variant={POOL_TYPE_VARIANTS[row.original.pool_type] || 'outline'}
        >
          {row.original.pool_type.charAt(0).toUpperCase() +
            row.original.pool_type.slice(1)}
        </Badge>
      ),
    },
    {
      id: 'gross_up',
      header: 'Gross-up',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.is_gross_up_applicable ? 'default' : 'secondary'
          }
        >
          {row.original.is_gross_up_applicable ? 'Enabled' : 'Fixed'}
        </Badge>
      ),
    },
    {
      id: 'gross_up_target',
      header: 'Target',
      cell: ({ row }) =>
        row.original.is_gross_up_applicable && row.original.gross_up_target
          ? `${decimalToPercentString(row.original.gross_up_target)}%`
          : '-',
    },
    {
      id: 'mappings',
      header: 'Mappings',
      cell: ({ row }) => {
        const count = mappingCounts[row.original.id] || 0
        const hasWarning = count === 0
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleMappingsClick(row.original)}
            className={cn(
              // h-auto keeps the row compact; the before: pseudo-element gives a
              // full 40px touch target without changing the visual size.
              'relative h-auto p-1 before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
              hasWarning && 'text-warning-foreground'
            )}
            aria-label={`${count} mapping${count !== 1 ? 's' : ''} for ${row.original.name}`}
            data-testid={`mappings-button-${row.original.id}`}
          >
            {hasWarning ? (
              <AlertCircle className="mr-1 h-4 w-4" aria-hidden="true" />
            ) : (
              <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            {count}
          </Button>
        )
      },
    },
    {
      id: 'allocations',
      header: 'Splits',
      cell: ({ row }) => {
        const count = allocationCounts[row.original.id] || 0
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAllocationsClick(row.original)}
            className='relative h-auto p-1 before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]'
            aria-label={`${count} split${count !== 1 ? 's' : ''} for ${row.original.name}`}
            data-testid={`allocations-button-${row.original.id}`}
          >
            <GitBranch className="mr-1 h-4 w-4" aria-hidden="true" />
            {count}
          </Button>
        )
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
              data-testid={`pool-actions-${row.original.id}`}
              aria-label={`Open menu for ${row.original.name}`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => handleEditPool(row.original)}
              data-testid={`edit-pool-${row.original.id}`}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDeleteClick(row.original)}
              className="text-destructive-strong"
              data-testid={`delete-pool-${row.original.id}`}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  // Error state
  if (error || isOffline) {
    return (
      <ErrorState
        title="Couldn't load expense pools"
        size="sm"
        offline={isOffline}
        action={{ onClick: () => refetch() }}
      />
    )
  }

  // Empty state with Add button
  if (!isLoading && !isOffline && pools.length === 0) {
    return (
      <>
        <EmptyState
          icon={Layers}
          title="No expense pools yet"
          description="Pools group costs like insurance and repairs to split each tenant share. Add a pool to get started."
          action={{ label: 'Add Pool', onClick: handleAddPool }}
          data-testid="add-pool-empty-state"
        />

        <ExpensePoolFormModal
          propertyId={propertyId}
          pool={poolToEdit}
          open={formModalOpen}
          onOpenChange={setFormModalOpen}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with action buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Expense Pools</h2>
        <div className="flex items-center gap-2">
          <HelpButton onClick={() => setIsHelpOpen(true)} />
          <Button onClick={handleAddPool} data-testid="add-pool-button">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add Pool
          </Button>
        </div>
      </div>

      {/* Counts failed to load — warn so the 0s aren't read as real */}
      {countsFailed && (
        <p className="flex items-center gap-2 text-sm text-warning-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            We couldn't load mapping and split counts, so they may show as 0.
            Open a pool to see its real mappings.
          </span>
        </p>
      )}

      {/* Pools table — overflow-x-auto lets narrow screens scroll horizontally */}
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          data={flattenedPools}
          isLoading={isLoading}
          emptyMessage="No expense pools found."
          enablePagination={false}
          caption="Expense pools for this property"
        />
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense Pool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{poolToDelete?.name}"?{' '}
              {poolToDelete?.children && poolToDelete.children.length > 0 && (
                <span className="text-destructive-strong font-medium">
                  This will also delete {poolToDelete.children.length} child
                  pool(s).
                </span>
              )}{' '}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className={buttonVariants({ variant: 'destructive' })}
              data-testid="confirm-delete-pool-button"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pool form modal */}
      <ExpensePoolFormModal
        propertyId={propertyId}
        pool={poolToEdit}
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
      />

      {/* Pool mappings dialog */}
      {poolForMappings && (
        <PoolMappingsDialog
          propertyId={propertyId}
          pool={poolForMappings}
          open={mappingsDialogOpen}
          onOpenChange={setMappingsDialogOpen}
        />
      )}

      {/* Pool allocations dialog */}
      {poolForAllocations && (
        <PoolAllocationsDialog
          propertyId={propertyId}
          sourcePool={poolForAllocations}
          pools={pools}
          open={allocationsDialogOpen}
          onOpenChange={setAllocationsDialogOpen}
        />
      )}

      {/* Pool mapping tour */}
      <PoolMappingTourSheet open={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </div>
  )
}
