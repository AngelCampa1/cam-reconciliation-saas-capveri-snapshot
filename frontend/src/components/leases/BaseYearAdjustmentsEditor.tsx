/**
 * BaseYearAdjustmentsEditor Component
 *
 * Dynamic list editor for new-service base year adjustment items.
 * Renders inside the Base Year Stop section when a base year is set.
 *
 * Must be used within a React Hook Form context.
 */
import { useFieldArray, useFormContext } from 'react-hook-form'
import { PlusCircle, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface BaseYearAdjustmentsEditorProps {
  /** Field path prefix, e.g. "recovery_profile" */
  fieldPrefix: string
}

/**
 * Renders an add/remove list of base year adjustment items.
 *
 * Each item captures a service name, the imputed base year cost,
 * and a justification. Multiple items are summed and added to the
 * raw base year amount before computing the expense increase.
 */
export function BaseYearAdjustmentsEditor({
  fieldPrefix,
}: BaseYearAdjustmentsEditorProps) {
  const form = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `${fieldPrefix}.base_year_adjustments`,
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          New-service base year adjustments
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({ service_name: '', imputed_amount: '', justification: '' })
          }
          data-testid="add-adjustment-button"
        >
          <PlusCircle className="mr-1 h-4 w-4" />
          Add adjustment
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No adjustments. Add one if a new service started after the base year.
        </p>
      )}

      {fields.map((field, index) => (
        <div key={field.id} className="rounded-md border p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <FormField
                control={form.control}
                name={`${fieldPrefix}.base_year_adjustments.${index}.service_name`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Service name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 24/7 Security"
                        {...field}
                        data-testid={`adjustment-${index}-service-name`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${fieldPrefix}.base_year_adjustments.${index}.imputed_amount`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      Imputed base year cost ($)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="18000.00"
                        {...field}
                        data-testid={`adjustment-${index}-imputed-amount`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${fieldPrefix}.base_year_adjustments.${index}.justification`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Justification</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Service added July 2023; annualized cost as if in 2021 base year"
                        {...field}
                        data-testid={`adjustment-${index}-justification`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              className="mt-5 shrink-0 text-destructive-strong hover:text-destructive-strong"
              data-testid={`adjustment-${index}-remove`}
              aria-label="Remove adjustment"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
