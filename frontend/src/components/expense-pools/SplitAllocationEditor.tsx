/**
 * Split Allocation Editor Component
 *
 * Allows configuring split allocations for expense pools,
 * dividing expenses from a source pool to multiple target pools.
 *
 * Features:
 * - Add/edit/delete allocations
 * - Support percentage and fixed amount allocation types
 * - Validate percentage allocations sum to 100%
 * - Precision handling for last allocation (gets remainder)
 */

import { GitFork, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useFieldArray, useFormContext } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AllocationType, type ExpensePool } from '@/types'

interface SplitAllocationEditorProps {
  availablePools: ExpensePool[]
  fieldName?: string
}

/**
 * Split Allocation Editor Component
 *
 * Must be used within a React Hook Form context.
 * Expects allocations to be at `fieldName` in the form (default: 'allocations').
 */
export function SplitAllocationEditor({
  availablePools,
  fieldName = 'allocations',
}: SplitAllocationEditorProps) {
  const form = useFormContext()

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: fieldName,
  })

  // Watch all allocations to calculate totals
  const allocations = form.watch(fieldName) || []

  // Calculate total percentage for validation
  interface AllocationFormValue {
    allocation_type?: string
    allocation_value?: string
  }

  const totalPercentage = (allocations as AllocationFormValue[])
    .filter((a) => a.allocation_type === AllocationType.PERCENTAGE)
    .reduce((sum: number, a) => sum + parseFloat(a.allocation_value || '0'), 0)

  const hasPercentageAllocations = (allocations as AllocationFormValue[]).some(
    (a) => a.allocation_type === AllocationType.PERCENTAGE
  )

  const isPercentageValid =
    !hasPercentageAllocations || Math.abs(totalPercentage - 100) <= 0.01

  const handleAddAllocation = () => {
    append({
      target_pool_id: '',
      allocation_type: AllocationType.PERCENTAGE,
      allocation_value: '0',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Split Allocations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Validation Alert */}
        {hasPercentageAllocations && !isPercentageValid && (
          <Alert variant="destructive">
            <AlertDescription>
              Percentage allocations must sum to 100%. Current total:{' '}
              {totalPercentage.toFixed(2)}%
            </AlertDescription>
          </Alert>
        )}

        {/* No Allocations Message */}
        {fields.length === 0 && (
          <EmptyState
            icon={GitFork}
            title="No splits yet"
            description="Add allocations to split expenses across pools."
            size="sm"
          />
        )}

        {/* Allocation List */}
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="flex items-start gap-4 p-4 border rounded-lg shadow-sm transition-all duration-fast hover:shadow-elevation-1"
            >
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Target Pool */}
                <FormField
                  control={form.control}
                  name={`${fieldName}.${index}.target_pool_id`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Pool</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select pool" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availablePools.map((pool) => (
                            <SelectItem key={pool.id} value={pool.id}>
                              {pool.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Allocation Type */}
                <FormField
                  control={form.control}
                  name={`${fieldName}.${index}.allocation_type`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={AllocationType.PERCENTAGE}>
                            Percentage
                          </SelectItem>
                          <SelectItem value={AllocationType.FIXED_AMOUNT}>
                            Fixed Amount
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Allocation Value */}
                <FormField
                  control={form.control}
                  name={`${fieldName}.${index}.allocation_value`}
                  render={({ field }) => {
                    const allocationType = form.watch(
                      `${fieldName}.${index}.allocation_type`
                    )
                    return (
                      <FormItem>
                        <FormLabel>
                          {allocationType === AllocationType.PERCENTAGE
                            ? 'Percentage (%)'
                            : 'Amount ($)'}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step={
                              allocationType === AllocationType.PERCENTAGE
                                ? '0.01'
                                : '0.01'
                            }
                            min="0"
                            max={
                              allocationType === AllocationType.PERCENTAGE
                                ? '100'
                                : undefined
                            }
                            {...field}
                            placeholder={
                              allocationType === AllocationType.PERCENTAGE
                                ? '0.00'
                                : '0.00'
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />
              </div>

              {/* Delete Button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                className="mt-8"
                aria-label={`Remove allocation ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add Allocation Button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleAddAllocation}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Allocation
        </Button>

        {/* Help Text */}
        {hasPercentageAllocations && (
          <FormDescription>
            Percentage allocations must sum to exactly 100%. The last allocation
            will automatically receive any remainder to ensure precision.
          </FormDescription>
        )}
      </CardContent>
    </Card>
  )
}
