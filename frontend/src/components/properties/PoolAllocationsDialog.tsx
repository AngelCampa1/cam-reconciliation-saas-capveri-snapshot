import { useMemo, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/errors'

import {
  useCreatePoolAllocation,
  useDeletePoolAllocation,
  usePoolAllocations,
} from '@/api/hooks'
import type { ExpensePoolWithChildren, ApiError } from '@/api/client'
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
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface PoolAllocationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
  sourcePool: ExpensePoolWithChildren
  pools: ExpensePoolWithChildren[]
}

function flattenPools(
  pools: ExpensePoolWithChildren[]
): ExpensePoolWithChildren[] {
  return pools.flatMap((pool) => [pool, ...(pool.children ?? [])])
}

export function PoolAllocationsDialog({
  open,
  onOpenChange,
  propertyId,
  sourcePool,
  pools,
}: PoolAllocationsDialogProps) {
  const [targetPoolId, setTargetPoolId] = useState('')
  const [allocationValue, setAllocationValue] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const availableTargets = useMemo(
    () => flattenPools(pools).filter((pool) => pool.id !== sourcePool.id),
    [pools, sourcePool.id]
  )

  const poolNames = useMemo(() => {
    const names: Record<string, string> = {}
    flattenPools(pools).forEach((pool) => {
      names[pool.id] = pool.name
    })
    return names
  }, [pools])

  const {
    data: allocationsData,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = usePoolAllocations(
    propertyId,
    { sourcePoolId: sourcePool.id },
    { enabled: open }
  )
  const allocations = allocationsData?.data ?? []
  const isOffline = isPaused && !allocationsData
  const totalPercentage = allocations.reduce(
    (sum, allocation) => sum + Number(allocation.allocation_value),
    0
  )

  const createMutation = useCreatePoolAllocation(propertyId, {
    onSuccess: () => {
      toast.success('Split allocation added')
      setTargetPoolId('')
      setAllocationValue('')
    },
    onError: (error: ApiError) => {
      toast.error('Failed to add allocation', {
        description: getErrorMessage(error),
      })
    },
  })

  const deleteMutation = useDeletePoolAllocation(propertyId, {
    onSuccess: () => {
      toast.success('Split allocation removed')
      setDeleteId(null)
    },
    onError: (error: ApiError) => {
      toast.error('Failed to remove allocation', {
        description: getErrorMessage(error),
      })
    },
  })

  const handleAdd = () => {
    const value = Number(allocationValue)
    if (!targetPoolId || !Number.isFinite(value) || value <= 0 || value > 100) {
      toast.error('Enter a target pool and a percentage from 1 to 100')
      return
    }

    createMutation.mutate({
      source_pool_id: sourcePool.id,
      target_pool_id: targetPoolId,
      allocation_type: 'percentage',
      allocation_value: allocationValue,
    })
  }

  const handleDelete = () => {
    // Guard against a repeated confirm-click firing a second delete before the
    // first resolves and clears deleteId.
    if (deleteMutation.isPending) {
      return
    }

    if (deleteId) {
      deleteMutation.mutate(deleteId)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Split Allocations</DialogTitle>
            <DialogDescription>
              Route portions of "{sourcePool.name}" into other expense pools.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border p-3">
              <Select value={targetPoolId} onValueChange={setTargetPoolId}>
                <SelectTrigger
                  className="min-w-0 flex-1"
                  aria-label="Target pool"
                >
                  <SelectValue placeholder="Target pool" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map((pool) => (
                    <SelectItem key={pool.id} value={pool.id}>
                      {pool.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-28"
                inputMode="decimal"
                placeholder="%"
                aria-label="Allocation percentage"
                value={allocationValue}
                onChange={(event) => setAllocationValue(event.target.value)}
                data-testid="new-allocation-value-input"
              />
              <Button
                type="button"
                size="icon"
                onClick={handleAdd}
                disabled={createMutation.isPending}
                aria-label="Add allocation"
                data-testid="add-allocation-button"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target Pool</TableHead>
                    <TableHead className="w-28">Percentage</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : isOffline || isError ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <p className="text-sm text-destructive-strong">
                            {isOffline
                              ? "Can't reach the server. Check your connection and try again."
                              : 'We could not load the split allocations.'}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                          >
                            Try again
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : allocations.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No split allocations configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    allocations.map((allocation) => (
                      <TableRow
                        key={allocation.id}
                        data-testid={`allocation-row-${allocation.id}`}
                      >
                        <TableCell>
                          {poolNames[allocation.target_pool_id] ??
                            allocation.target_pool_id}
                        </TableCell>
                        <TableCell>{allocation.allocation_value}%</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(allocation.id)}
                            aria-label={`Delete split to ${
                              poolNames[allocation.target_pool_id] ??
                              allocation.target_pool_id
                            }`}
                            data-testid={`delete-allocation-${allocation.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="text-sm text-muted-foreground">
              Allocated: {totalPercentage.toFixed(2)}%
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(isOpen) => !isOpen && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Split Allocation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this split allocation? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
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
    </>
  )
}
