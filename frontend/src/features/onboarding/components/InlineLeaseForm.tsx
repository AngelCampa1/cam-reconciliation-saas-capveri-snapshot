/**
 * Inline Lease Form
 *
 * Minimal form for creating a lease directly inside the onboarding wizard.
 * Collects only the fields required for CAM calculation. Advanced recovery
 * profile settings can be configured later via the full LeaseFormPage.
 */
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateLease } from '@/api/hooks'
import type { Unit } from '@/api/generated/types.gen'
import { trackEvent } from '@/lib/analytics'
import { percentToDecimalString } from '@/lib/percent'

const inlineLeaseSchema = z
  .object({
    tenant_name: z
      .string()
      .min(2, 'Tenant name must be at least 2 characters')
      .max(255),
    start_date: z.string().min(1, 'Required'),
    end_date: z.string().min(1, 'Required'),
    pro_rata_share: z.coerce
      .number()
      .gt(0, 'Must be greater than 0')
      .lte(100, 'Must be 100 or less'),
    unit_id: z.string().optional(),
  })
  .refine((data) => new Date(data.end_date) > new Date(data.start_date), {
    message: 'End date must be after start date',
    path: ['end_date'],
  })

type InlineLeaseFormValues = z.infer<typeof inlineLeaseSchema>

interface InlineLeaseFormProps {
  propertyId: string
  units: Unit[]
  onSuccess?: () => void
}

export function InlineLeaseForm({
  propertyId,
  units,
  onSuccess,
}: InlineLeaseFormProps) {
  const { mutate, isPending } = useCreateLease()

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<InlineLeaseFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver's .refine() makes its output type diverge from useForm's Resolver generic; `as any` is the narrowest safe escape
    resolver: zodResolver(inlineLeaseSchema) as any,
    defaultValues: {
      tenant_name: '',
      start_date: '',
      end_date: '',
      unit_id: '',
    },
  })

  const onSubmit = (data: InlineLeaseFormValues) => {
    mutate(
      {
        property_id: propertyId,
        tenant_name: data.tenant_name,
        start_date: data.start_date,
        end_date: data.end_date,
        unit_id: data.unit_id || null,
        status: 'active',
        recovery_profile: {
          // String-based shift avoids IEEE-754 drift (e.g. 2.9 / 100 ===
          // 0.028999999999999998 would be persisted verbatim).
          pro_rata_share: percentToDecimalString(String(data.pro_rata_share)),
          cap_type: 'none',
          admin_fee_percentage: '0',
          excluded_pools: [],
        },
      },
      {
        onSuccess: (lease) => {
          trackEvent('lease_created', {
            property_id: propertyId,
            lease_id: lease?.id,
            source: 'onboarding',
            has_unit: Boolean(data.unit_id),
          })
          reset()
          onSuccess?.()
        },
      }
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="inline-tenant-name">
          Tenant Name
          <span className="ml-1 text-destructive-strong" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="inline-tenant-name"
          placeholder="e.g. Acme Corporation"
          aria-label="Tenant Name"
          {...register('tenant_name')}
        />
        {errors.tenant_name && (
          <p className="mt-1 text-sm text-destructive-strong" role="alert">
            {errors.tenant_name.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="inline-start-date">
            Lease Start
            <span className="ml-1 text-destructive-strong" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="inline-start-date"
            type="date"
            aria-label="Lease Start"
            {...register('start_date')}
          />
          {errors.start_date && (
            <p className="mt-1 text-sm text-destructive-strong" role="alert">
              {errors.start_date.message}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="inline-end-date">
            Lease End
            <span className="ml-1 text-destructive-strong" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="inline-end-date"
            type="date"
            aria-label="Lease End"
            {...register('end_date')}
          />
          {errors.end_date && (
            <p className="mt-1 text-sm text-destructive-strong" role="alert">
              {errors.end_date.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="inline-pro-rata">
          Pro-Rata Share (%)
          <span className="ml-1 text-destructive-strong" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="inline-pro-rata"
          type="number"
          step="0.01"
          min="0"
          max="100"
          placeholder="e.g. 15"
          aria-label="Pro-Rata Share (%)"
          {...register('pro_rata_share')}
        />
        {errors.pro_rata_share && (
          <p className="mt-1 text-sm text-destructive-strong" role="alert">
            {errors.pro_rata_share.message}
          </p>
        )}
      </div>

      {units.length > 0 && (
        <div>
          <Label htmlFor="inline-unit-select">Unit</Label>
          <Controller
            control={control}
            name="unit_id"
            render={({ field }) => (
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value ?? ''}
              >
                <SelectTrigger id="inline-unit-select" aria-label="Unit">
                  <SelectValue placeholder="Select unit (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.unit_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.unit_id && (
            <p className="mt-1 text-sm text-destructive-strong" role="alert">
              {errors.unit_id.message}
            </p>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="w-full min-h-[44px]"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          'Add Lease'
        )}
      </Button>
    </form>
  )
}
