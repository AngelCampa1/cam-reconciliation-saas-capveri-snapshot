/**
 * Dialog for copying expense pools between properties.
 *
 * Allows users to select source property, target property, and copy mode
 * (merge or replace).
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AlertTriangle } from 'lucide-react'
import { usePoolCopy } from '../hooks/usePoolCopy'
import type { CopyMode } from '@/types'

interface PoolCopyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: Array<{ id: string; name: string }>
  currentPropertyId?: string
}

export function PoolCopyDialog({
  open,
  onOpenChange,
  properties,
  currentPropertyId,
}: PoolCopyDialogProps) {
  const [sourcePropertyId, setSourcePropertyId] = useState<string>(
    currentPropertyId || ''
  )
  const [targetPropertyId, setTargetPropertyId] = useState<string>('')
  const [copyMode, setCopyMode] = useState<CopyMode>('merge')
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false)

  const copyMutation = usePoolCopy()

  const targetPropertyName =
    properties.find((p) => p.id === targetPropertyId)?.name ??
    'the target property'

  // Reset mutation state and form fields when the dialog opens so stale
  // success/error alerts and previous selections don't reappear on reopen.
  useEffect(() => {
    if (open) {
      copyMutation.reset()
      setSourcePropertyId(currentPropertyId || '')
      setTargetPropertyId('')
      setCopyMode('merge')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleCopy = () => {
    if (!sourcePropertyId || !targetPropertyId) {
      return
    }

    // Replace mode permanently deletes the target's existing pools, so require
    // an explicit confirmation step before running the mutation.
    if (copyMode === 'replace') {
      setConfirmReplaceOpen(true)
      return
    }

    runCopy()
  }

  const runCopy = () => {
    copyMutation.mutate(
      {
        source_property_id: sourcePropertyId,
        target_property_id: targetPropertyId,
        copy_mode: copyMode,
      },
      {
        onSuccess: (data) => {
          toast.success(
            `Copied ${data.pools_copied} pool${data.pools_copied !== 1 ? 's' : ''} successfully`
          )
          onOpenChange(false)
          // Reset form
          setSourcePropertyId(currentPropertyId || '')
          setTargetPropertyId('')
          setCopyMode('merge')
        },
      }
    )
  }

  const isSameProperty = sourcePropertyId === targetPropertyId
  const canSubmit =
    sourcePropertyId &&
    targetPropertyId &&
    !isSameProperty &&
    !copyMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Copy Expense Pools</DialogTitle>
          <DialogDescription>
            Copy expense pool structure from one property to another.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Source Property */}
          <div className="space-y-2">
            <Label htmlFor="source-property">Source Property</Label>
            <Select
              value={sourcePropertyId}
              onValueChange={setSourcePropertyId}
            >
              <SelectTrigger
                id="source-property"
                data-testid="source-property-select-trigger"
              >
                <SelectValue placeholder="Select source property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem
                    key={property.id}
                    value={property.id}
                    data-testid={`select-item-${property.id}`}
                  >
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Property */}
          <div className="space-y-2">
            <Label htmlFor="target-property">Target Property</Label>
            <Select
              value={targetPropertyId}
              onValueChange={setTargetPropertyId}
            >
              <SelectTrigger
                id="target-property"
                data-testid="target-property-select-trigger"
              >
                <SelectValue placeholder="Select target property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem
                    key={property.id}
                    value={property.id}
                    data-testid={`select-item-${property.id}`}
                    disabled={property.id === sourcePropertyId}
                  >
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Copy Mode */}
          <div className="space-y-2">
            <Label id="copy-mode-label">Copy Mode</Label>
            <RadioGroup
              value={copyMode}
              onValueChange={(v) => setCopyMode(v as CopyMode)}
              aria-labelledby="copy-mode-label"
            >
              <div className="flex items-center space-x-2 p-2 rounded-md transition-colors duration-fast hover:bg-muted/30">
                <RadioGroupItem value="merge" id="merge" />
                <Label htmlFor="merge" className="font-normal cursor-pointer">
                  Merge (keep existing pools in target)
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-2 rounded-md transition-colors duration-fast hover:bg-muted/30">
                <RadioGroupItem value="replace" id="replace" />
                <Label
                  htmlFor="replace"
                  className="flex items-center gap-1.5 font-normal cursor-pointer"
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-warning"
                  />
                  <span
                    className={copyMode === 'replace' ? 'text-warning' : ''}
                  >
                    Replace (delete existing pools in target)
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Validation Messages */}
          {isSameProperty && sourcePropertyId && targetPropertyId && (
            <Alert variant="destructive">
              <AlertDescription>
                Source and target properties must be different.
              </AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {copyMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {copyMutation.error?.message ||
                  'Failed to copy pools. Please try again.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {copyMutation.isSuccess && (
            <Alert>
              <AlertDescription>
                Successfully copied {copyMutation.data.pools_copied} pool
                {copyMutation.data.pools_copied !== 1 ? 's' : ''}.
                {copyMutation.data.pools_deleted > 0 &&
                  ` Deleted ${copyMutation.data.pools_deleted} existing pool${
                    copyMutation.data.pools_deleted !== 1 ? 's' : ''
                  }.`}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={copyMutation.isPending}
          >
            Cancel
          </Button>
          {!canSubmit && !copyMutation.isPending ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block" tabIndex={0}>
                  <Button disabled className="pointer-events-none">
                    Copy Pools
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!sourcePropertyId
                  ? 'Select a source property first.'
                  : !targetPropertyId
                    ? 'Select a target property.'
                    : 'Source and target properties must be different.'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button onClick={handleCopy} disabled={!canSubmit}>
              {copyMutation.isPending ? 'Copying...' : 'Copy Pools'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={confirmReplaceOpen}
        onOpenChange={setConfirmReplaceOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all pools?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every existing pool at {targetPropertyName}. Then it
              copies the pools from the source property. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                setConfirmReplaceOpen(false)
                runCopy()
              }}
            >
              Replace pools
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
