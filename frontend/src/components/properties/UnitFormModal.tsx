/**
 * Unit Form Modal Component
 *
 * Modal dialog for creating and editing units with:
 * - React Hook Form with Zod validation
 * - Create and edit modes
 * - Loading states during submission
 * - Success/error toast notifications
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'

import { useCreateUnit, useUpdateUnit } from '@/api/hooks'
import type { Unit, ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { unitFormSchema, type UnitFormData } from './UnitFormSchema'

interface UnitFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
  unit?: Unit
}

export function UnitFormModal({
  open,
  onOpenChange,
  propertyId,
  unit,
}: UnitFormModalProps) {
  const isEditMode = !!unit

  // Mutations
  const createMutation = useCreateUnit(propertyId, {
    onSuccess: () => {
      toast.success('Unit created successfully')
      onOpenChange(false)
    },
    onError: (error: ApiError) => {
      toast.error('Failed to create unit', {
        description: getErrorMessage(error),
      })
    },
  })

  // Update mutation - called at top level even if in create mode
  const updateMutation = useUpdateUnit(
    propertyId,
    unit?.id || '', // Empty string if creating, won't be used
    {
      onSuccess: () => {
        toast.success('Unit updated successfully')
        onOpenChange(false)
      },
      onError: (error: ApiError) => {
        toast.error('Failed to update unit', {
          description: getErrorMessage(error),
        })
      },
    }
  )

  // Form setup
  const form = useForm<UnitFormData>({
    resolver: zodResolver(unitFormSchema),
    mode: 'onBlur',
    defaultValues: {
      unit_number: '',
      rentable_sqft: '',
      usable_sqft: '',
      space_type: 'office',
    },
  })

  // Populate form in edit mode
  useEffect(() => {
    if (unit && isEditMode) {
      form.reset({
        unit_number: unit.unit_number,
        rentable_sqft: unit.rentable_sqft,
        usable_sqft: unit.usable_sqft || '',
        space_type: (unit.space_type as UnitFormData['space_type']) ?? 'office',
      })
    } else if (!open) {
      // Reset form when modal closes
      form.reset({
        unit_number: '',
        rentable_sqft: '',
        usable_sqft: '',
        space_type: 'office',
      })
    }
  }, [unit, isEditMode, open, form])

  // Form submission
  const onSubmit = (data: UnitFormData) => {
    // Guard against a double-submit when Enter is pressed while a save is already
    // in flight. The disabled button blocks clicks, but not a keyboard submit that
    // fires before the disabled state has propagated. Mirrors `isSubmitting`.
    if (createMutation.isPending || updateMutation.isPending) {
      return
    }

    const payload = {
      unit_number: data.unit_number,
      rentable_sqft: data.rentable_sqft,
      usable_sqft: data.usable_sqft || data.rentable_sqft,
      space_type: data.space_type,
    }

    if (isEditMode && unit) {
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
          <DialogTitle>{isEditMode ? 'Edit Unit' : 'Add Unit'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the unit information below.'
              : 'Enter the details for the new unit.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {/* Unit Number */}
            <FormField
              control={form.control}
              name="unit_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Unit Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 101, Suite A"
                      {...field}
                      data-testid="unit-number-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Rentable Sqft */}
            <FormField
              control={form.control}
              name="rentable_sqft"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Rentable Sqft</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g., 1000"
                      {...field}
                      data-testid="rentable-sqft-input"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Space tenants pay rent on. Use the number from your rent
                    roll.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Usable Sqft */}
            <FormField
              control={form.control}
              name="usable_sqft"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usable Sqft (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g., 900"
                      {...field}
                      data-testid="usable-sqft-input"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Just the space inside tenant suites. It is smaller than
                    rentable.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Space Type */}
            <FormField
              control={form.control}
              name="space_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Space Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    key={field.value}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="space-type-select">
                        <SelectValue placeholder="Select space type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Standard Space</SelectLabel>
                        <SelectItem value="office">Office</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="laboratory">Laboratory</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>
                          NATA Space (zero load factor per BOMA 2024)
                        </SelectLabel>
                        <SelectItem value="storage">Tenant Storage</SelectItem>
                        <SelectItem value="outdoor_amenity">
                          Outdoor Amenity / Patio
                        </SelectItem>
                        <SelectItem value="equipment_shaft">
                          Single-Tenant Equipment Shaft
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    BOMA 2024 Non-Allocated Tenant Areas (storage, outdoor,
                    shaft) must have zero load factor
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
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
                    ? 'Update Unit'
                    : 'Add Unit'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
