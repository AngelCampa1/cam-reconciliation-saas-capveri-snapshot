/**
 * Expense Pool Form Modal Component
 *
 * Modal dialog for creating and editing expense pools with:
 * - React Hook Form with Zod validation
 * - Create and edit modes
 * - Pool type selection
 * - Gross-up configuration with conditional validation
 * - Parent pool selection for hierarchy
 * - Loading states during submission
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'

import {
  useCreateExpensePool,
  useUpdateExpensePool,
  useExpensePools,
} from '@/api/hooks'
import type { ExpensePoolWithChildren, ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/errors'
import {
  expensePoolFormSchema,
  POOL_TYPES,
  type ExpensePoolFormData,
} from './ExpensePoolFormSchema'
import { decimalToPercentString, percentToDecimalString } from '@/lib/percent'

interface ExpensePoolFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
  pool?: ExpensePoolWithChildren | undefined
}

export function ExpensePoolFormModal({
  open,
  onOpenChange,
  propertyId,
  pool,
}: ExpensePoolFormModalProps) {
  const isEditMode = !!pool

  // Fetch existing pools for parent selection (only top-level pools)
  const { data: poolsData, isError: isPoolsError } = useExpensePools(
    propertyId,
    {
      includeChildren: true,
    }
  )
  const parentPools =
    poolsData?.data?.filter((p) => !p.parent_pool_id && p.id !== pool?.id) || []

  // Mutations
  const createMutation = useCreateExpensePool(propertyId, {
    onSuccess: () => {
      toast.success('Expense pool created successfully')
      onOpenChange(false)
    },
    onError: (error: ApiError) => {
      toast.error('Failed to create expense pool', {
        description: getErrorMessage(error),
      })
    },
  })

  const updateMutation = useUpdateExpensePool(propertyId, pool?.id || '', {
    onSuccess: () => {
      toast.success('Expense pool updated successfully')
      onOpenChange(false)
    },
    onError: (error: ApiError) => {
      toast.error('Failed to update expense pool', {
        description: getErrorMessage(error),
      })
    },
  })

  // Form setup
  const form = useForm<ExpensePoolFormData>({
    resolver: zodResolver(expensePoolFormSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      pool_type: 'operating',
      is_gross_up_applicable: false,
      gross_up_target: '',
      description: '',
      parent_pool_id: '',
    },
  })

  const isGrossUpApplicable = form.watch('is_gross_up_applicable')

  // Populate form in edit mode
  useEffect(() => {
    if (pool && isEditMode) {
      form.reset({
        name: pool.name,
        pool_type: pool.pool_type as ExpensePoolFormData['pool_type'],
        is_gross_up_applicable: pool.is_gross_up_applicable ?? false,
        gross_up_target: pool.gross_up_target
          ? decimalToPercentString(pool.gross_up_target)
          : '',
        description: pool.description || '',
        parent_pool_id: pool.parent_pool_id || '',
      })
    } else if (!open) {
      form.reset({
        name: '',
        pool_type: 'operating',
        is_gross_up_applicable: false,
        gross_up_target: '',
        description: '',
        parent_pool_id: '',
      })
    }
  }, [pool, isEditMode, open, form])

  // Form submission
  const onSubmit = (data: ExpensePoolFormData) => {
    // Guard against a double-submit when Enter is pressed while a save is already
    // in flight. The disabled button blocks clicks, but not a keyboard submit that
    // fires before the disabled state has propagated. Mirrors `isSubmitting`.
    if (createMutation.isPending || updateMutation.isPending) {
      return
    }

    const payload = {
      name: data.name,
      pool_type: data.pool_type,
      is_gross_up_applicable: data.is_gross_up_applicable,
      gross_up_target:
        data.is_gross_up_applicable && data.gross_up_target
          ? percentToDecimalString(data.gross_up_target)
          : null,
      description: data.description || null,
      parent_pool_id: data.parent_pool_id || null,
    }

    if (isEditMode && pool) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Edit Expense Pool' : 'Add Expense Pool'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update this expense pool.'
              : 'Add a pool to categorize expenses.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {/* Pool Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Pool Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Utilities, Janitorial"
                      {...field}
                      data-testid="pool-name-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pool Type */}
            <FormField
              control={form.control}
              name="pool_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Pool Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    key={field.value}
                    data-testid="pool-type-select"
                  >
                    <FormControl>
                      <SelectTrigger data-testid="pool-type-trigger">
                        <SelectValue placeholder="Select pool type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {POOL_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Parent Pool (optional) */}
            <FormField
              control={form.control}
              name="parent_pool_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Pool (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) =>
                      field.onChange(value === '__none__' ? '' : value)
                    }
                    value={field.value || '__none__'}
                    key={field.value || '__none__'}
                    data-testid="parent-pool-select"
                  >
                    <FormControl>
                      <SelectTrigger data-testid="parent-pool-trigger">
                        <SelectValue placeholder="None (top-level pool)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">
                        None (top-level pool)
                      </SelectItem>
                      {parentPools.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select a parent pool to create a sub-pool (max 2 levels)
                  </FormDescription>
                  {isPoolsError && (
                    <p className="text-sm text-warning-foreground">
                      We couldn't load existing pools, so parent options may be
                      missing.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Gross-up Applicable */}
            <FormField
              control={form.control}
              name="is_gross_up_applicable"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Gross-up Applicable</FormLabel>
                    <FormDescription>
                      Apply gross-up calculation for variable expenses
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Gross-up Applicable"
                      data-testid="gross-up-switch"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Gross-up Target (conditional) */}
            {isGrossUpApplicable && (
              <FormField
                control={form.control}
                name="gross_up_target"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gross-up Target (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g., 95"
                        {...field}
                        data-testid="gross-up-target-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Target occupancy percentage for gross-up (e.g., 95 for
                      95%)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional description for this expense pool..."
                      className="resize-none"
                      {...field}
                      data-testid="description-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* pb-[...] clears the fixed bottom nav (56px + safe-area) on mobile;
                resets to 0 on md+ where the nav is hidden */}
            <DialogFooter className="pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:pb-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSubmitting
                  ? isEditMode
                    ? 'Updating…'
                    : 'Creating…'
                  : isEditMode
                    ? 'Update Pool'
                    : 'Add Pool'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
