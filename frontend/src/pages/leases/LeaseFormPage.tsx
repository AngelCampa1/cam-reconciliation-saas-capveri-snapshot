/**
 * Lease Form Page Component
 *
 * Form for creating and editing basic lease information.
 * Features:
 * - Create and edit modes
 * - React Hook Form with Zod validation
 * - Unit dropdown from property units
 * - Date pickers for lease dates
 * - Status dropdown
 * - Validation: end date must be after start date
 */
import { useEffect } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import {
  useLease,
  useCreateLease,
  useUpdateLease,
  useUpdateRecoveryProfile,
  useUnits,
  useProperty,
} from '@/api/hooks'
import type { Lease, ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { percentToDecimalString, decimalToPercentString } from '@/lib/percent'
import { leaseFormSchema, type LeaseFormData } from './LeaseFormSchema'
import { LeaseDocumentUpload } from '@/components/leases/LeaseDocumentUpload'
import { RecoveryProfileEditor } from '@/components/leases/RecoveryProfileEditor'

export function LeaseFormPage() {
  const { propertyId, leaseId } = useParams<{
    propertyId: string
    leaseId: string
  }>()
  const navigate = useNavigate()
  const isEditMode = leaseId && leaseId !== 'new'

  // Fetch property for breadcrumbs
  const { data: property } = useProperty(propertyId!, {
    enabled: !!propertyId,
  })

  // Fetch lease data for edit mode
  const {
    data: lease,
    isLoading: isLoadingLease,
    isError: isLeaseError,
    refetch: refetchLease,
  } = useLease(leaseId!, {
    enabled: Boolean(isEditMode),
  })

  // Fetch units for the property
  const {
    data: unitsData,
    isError: isUnitsError,
    refetch: refetchUnits,
  } = useUnits(
    propertyId!,
    {},
    {
      enabled: !!propertyId,
    }
  )

  const units = unitsData?.data || []

  // Create/Update mutations
  const createMutation = useCreateLease({
    onSuccess: (data: Lease) => {
      toast.success('Lease created successfully')
      navigate(`/properties/${propertyId}/leases/${data.id}`)
    },
    onError: (error: ApiError) => {
      console.error(error)
      toast.error(
        "We couldn't save this lease. Check your entries and try again."
      )
    },
  })

  // The basic-lease PUT endpoint deliberately ignores recovery_profile, so
  // edit mode persists the recovery profile through its dedicated endpoint
  // (see onSubmit). Navigation/toast happen there once BOTH writes succeed.
  const updateMutation = useUpdateLease(leaseId || '', {
    onError: (error: ApiError) => {
      console.error(error)
      toast.error(
        "We couldn't update this lease. Try again. Your old data did not change."
      )
    },
  })

  const updateRecoveryProfileMutation = useUpdateRecoveryProfile(
    leaseId || '',
    {
      onError: (error: ApiError) => {
        console.error(error)
        toast.error("We couldn't save the recovery profile. Try again.")
      },
    }
  )

  // Form setup
  const form = useForm<LeaseFormData>({
    // FIX F-013: the schema's `.refine()` makes zodResolver's input/output
    // generics diverge, so the inferred resolver type no longer matches
    // useForm's `Resolver<LeaseFormData>`. Asserting the precise resolver type
    // (instead of the previous `as any`) keeps full field-level type safety on
    // the form while satisfying the resolver signature.
    resolver: zodResolver(leaseFormSchema) as Resolver<LeaseFormData>,
    mode: 'onBlur',
    // `defaultValues` hydrate the form synchronously when the lease is already
    // in the query cache (e.g. navigating from the detail page). When the lease
    // loads asynchronously these are blank and the effect below rehydrates via
    // `form.reset(...)`. The two mechanisms together cover both render paths.
    // The `lease?...` reads are intentional fallbacks, not dead code.
    defaultValues: {
      tenant_name: lease?.tenant_name ?? '',
      unit_id: lease?.unit_id ?? '',
      start_date: lease?.start_date ?? '',
      end_date: lease?.end_date ?? '',
      status: lease?.status ?? 'draft',
      recovery_profile: {
        // FIX F-010: convert the backend decimal string to a percentage string
        // without coercing through a float (e.g. 0.029 * 100 === 2.9000000000000004).
        pro_rata_share: lease?.recovery_profile.pro_rata_share
          ? decimalToPercentString(lease.recovery_profile.pro_rata_share)
          : '',
        base_year: lease?.recovery_profile.base_year ?? null,
        base_year_amount: lease?.recovery_profile.base_year_amount ?? '',
        gross_up_base_year: lease?.recovery_profile.gross_up_base_year ?? false,
        base_year_adjustments: (
          lease?.recovery_profile.base_year_adjustments ?? []
        ).map((adj) => ({
          service_name: adj.service_name,
          imputed_amount: String(adj.imputed_amount),
          justification: adj.justification,
        })),
        cap_type: lease?.recovery_profile.cap_type ?? 'none',
        cap_rate: lease?.recovery_profile.cap_rate
          ? decimalToPercentString(lease.recovery_profile.cap_rate)
          : '',
        admin_fee_percentage: lease?.recovery_profile.admin_fee_percentage
          ? decimalToPercentString(lease.recovery_profile.admin_fee_percentage)
          : '15',
        rsf_measurement_standard:
          lease?.recovery_profile.rsf_measurement_standard ?? null,
        accounting_basis: lease?.recovery_profile.accounting_basis ?? null,
      },
    },
  })

  // Populate form in edit mode
  useEffect(() => {
    if (lease && isEditMode) {
      form.reset({
        tenant_name: lease.tenant_name,
        unit_id: lease.unit_id || '',
        start_date: lease.start_date,
        end_date: lease.end_date,
        status: lease.status || 'draft',
        recovery_profile: {
          // FIX F-010: decimal (0.25) -> percentage string ("25") without float
          // coercion. decimalToPercentString shifts the point two places exactly.
          pro_rata_share: decimalToPercentString(
            lease.recovery_profile.pro_rata_share
          ),
          base_year: lease.recovery_profile.base_year ?? null,
          base_year_amount: lease.recovery_profile.base_year_amount ?? '',
          gross_up_base_year:
            lease.recovery_profile.gross_up_base_year ?? false,
          base_year_adjustments: (
            lease.recovery_profile.base_year_adjustments ?? []
          ).map((adj) => ({
            service_name: adj.service_name,
            imputed_amount: String(adj.imputed_amount),
            justification: adj.justification,
          })),
          cap_type: lease.recovery_profile.cap_type ?? 'none',
          // Convert decimal (0.05) to percentage string ("5")
          cap_rate: lease.recovery_profile.cap_rate
            ? decimalToPercentString(lease.recovery_profile.cap_rate)
            : '',
          // Convert decimal (0.15) to percentage string ("15")
          admin_fee_percentage: lease.recovery_profile.admin_fee_percentage
            ? decimalToPercentString(
                lease.recovery_profile.admin_fee_percentage
              )
            : '15',
          rsf_measurement_standard:
            lease.recovery_profile.rsf_measurement_standard ?? null,
          accounting_basis: lease.recovery_profile.accounting_basis ?? null,
        },
      })
    }
  }, [lease, isEditMode, form])

  // Form submission
  const onSubmit = async (data: LeaseFormData) => {
    // Guard against a double-submit when Enter is pressed while a save is already
    // in flight. The disabled button blocks clicks, but not a keyboard submit that
    // fires before the disabled state has propagated. Mirrors `isSubmitting`.
    if (
      createMutation.isPending ||
      updateMutation.isPending ||
      updateRecoveryProfileMutation.isPending
    ) {
      return
    }

    // Convert form data to API format.
    // FIX F-010: the backend stores these rates as Decimal and accepts decimal
    // STRINGS (anyOf: [number, string]). Submitting exact decimal strings avoids
    // the precision loss of `parseFloat(value) / 100` (e.g. 2.9 / 100 yields
    // 0.028999999999999998 as a JS float, which would be persisted verbatim).
    // Convert pro_rata_share from percentage (25) to decimal ("0.25").
    const proRataShare = percentToDecimalString(
      data.recovery_profile.pro_rata_share
    )

    // Convert admin_fee_percentage from percentage (15) to decimal ("0.15").
    const adminFeePercentage =
      data.recovery_profile.admin_fee_percentage !== undefined
        ? percentToDecimalString(data.recovery_profile.admin_fee_percentage)
        : '0'

    const recoveryProfile = {
      ...(data.recovery_profile.base_year !== undefined && {
        base_year: data.recovery_profile.base_year,
      }),
      ...(data.recovery_profile.base_year_amount && {
        base_year_amount: data.recovery_profile.base_year_amount,
      }),
      ...(data.recovery_profile.gross_up_base_year !== undefined && {
        gross_up_base_year: data.recovery_profile.gross_up_base_year,
      }),
      base_year_adjustments: data.recovery_profile.base_year_adjustments ?? [],
      pro_rata_share: proRataShare,
      cap_type: data.recovery_profile.cap_type,
      ...(data.recovery_profile.cap_rate && {
        cap_rate: percentToDecimalString(data.recovery_profile.cap_rate),
      }),
      admin_fee_percentage: adminFeePercentage,
      rsf_measurement_standard:
        data.recovery_profile.rsf_measurement_standard ?? null,
      accounting_basis: data.recovery_profile.accounting_basis ?? null,
    }

    if (isEditMode && leaseId) {
      // The basic-lease PUT endpoint ignores recovery_profile, so the recovery
      // profile is persisted through its dedicated endpoint. Run both writes and
      // only confirm/navigate once both succeed (errors surface via hook toasts).
      try {
        await Promise.all([
          updateMutation.mutateAsync({
            tenant_name: data.tenant_name,
            unit_id: data.unit_id || null,
            start_date: data.start_date,
            end_date: data.end_date,
            status: data.status,
          }),
          updateRecoveryProfileMutation.mutateAsync(recoveryProfile),
        ])
        toast.success('Lease updated successfully')
        navigate(`/properties/${propertyId}/leases/${leaseId}`)
      } catch {
        // Field-level error toasts are emitted by each mutation's onError.
      }
    } else {
      const payload = {
        property_id: propertyId!,
        tenant_name: data.tenant_name,
        // Convert undefined to null for unit_id (API expects string | null)
        unit_id: data.unit_id || null,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status,
        recovery_profile: recoveryProfile,
      }
      createMutation.mutate(payload)
    }
  }

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    updateRecoveryProfileMutation.isPending

  // Loading state for edit mode
  if (isEditMode && isLoadingLease) {
    return (
      <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
        <PageHeader
          title="Loading..."
          breadcrumbs={[
            { label: 'Properties', href: '/properties' },
            {
              label: property?.name || 'Loading...',
              href: `/properties/${propertyId}`,
            },
            { label: 'Leases', href: `/properties/${propertyId}#leases` },
            { label: 'Edit' },
          ]}
        />
        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Error state for edit mode: never render an empty form against a lease that
  // failed to load — that would let the user "save" over real data with blanks.
  if (isEditMode && isLeaseError) {
    return (
      <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
        <PageHeader
          title="Edit Lease"
          breadcrumbs={[
            { label: 'Properties', href: '/properties' },
            {
              label: property?.name || 'Property',
              href: `/properties/${propertyId}`,
            },
            { label: 'Leases', href: `/properties/${propertyId}#leases` },
            { label: 'Edit' },
          ]}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium text-destructive-strong">
            We could not load this lease
          </p>
          <p className="text-sm text-muted-foreground">
            Something went wrong. Try again.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchLease()}>
              Try again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/properties/${propertyId}`)}
            >
              Back to property
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title={isEditMode ? 'Edit Lease' : 'Create Lease'}
        breadcrumbs={
          isEditMode
            ? [
                { label: 'Properties', href: '/properties' },
                {
                  label: property?.name || 'Loading...',
                  href: `/properties/${propertyId}`,
                },
                { label: 'Leases', href: `/properties/${propertyId}#leases` },
                { label: lease?.tenant_name || 'Loading...' },
                { label: 'Edit' },
              ]
            : [
                { label: 'Properties', href: '/properties' },
                {
                  label: property?.name || 'Loading...',
                  href: `/properties/${propertyId}`,
                },
                { label: 'Leases', href: `/properties/${propertyId}#leases` },
                { label: 'New Lease' },
              ]
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
              {/* Basic Lease Information */}
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Lease Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Tenant Name */}
                  <FormField
                    control={form.control}
                    name="tenant_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>Tenant Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Acme Corporation"
                            {...field}
                            data-testid="tenant-name-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Unit Selection */}
                  <FormField
                    control={form.control}
                    name="unit_id"
                    render={({ field }) => {
                      const displayUnitId =
                        field.value || (isEditMode ? lease?.unit_id : '')
                      const displayUnit = units.find(
                        (unit) => unit.id === displayUnitId
                      )

                      return (
                        <FormItem>
                          <FormLabel>Unit</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value ?? ''}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="unit-select">
                                {displayUnit ? (
                                  <span>
                                    {displayUnit.unit_number} (
                                    {displayUnit.rentable_sqft} sq ft)
                                  </span>
                                ) : (
                                  <SelectValue placeholder="Select a unit" />
                                )}
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {units.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.unit_number} ({unit.rentable_sqft} sq
                                  ft)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Leave blank if the lease covers the entire property
                          </FormDescription>
                          {isUnitsError && (
                            <p className="flex flex-wrap items-center gap-2 text-sm text-destructive-strong">
                              <span>
                                We couldn't load this property's units.
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => refetchUnits()}
                              >
                                Try again
                              </Button>
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )
                    }}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Start Date */}
                    <FormField
                      control={form.control}
                      name="start_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Start Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="start-date-input"
                            />
                          </FormControl>
                          <FormDescription>
                            The day the signed lease begins.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* End Date */}
                    <FormField
                      control={form.control}
                      name="end_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>End Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="end-date-input"
                            />
                          </FormControl>
                          <FormDescription>
                            The day the lease ends. It must come after the start
                            date.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Status */}
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => {
                      return (
                        <FormItem>
                          <FormLabel required>Status</FormLabel>
                          {/*
                            key={field.value} forces the Radix Select to remount
                            when the status is hydrated asynchronously (form.reset
                            in edit mode). Without this, Radix caches its empty
                            on-mount selection and never adopts the controlled
                            value that arrives after the first render, so the form
                            submits an empty status and fails enum validation.
                          */}
                          <Select
                            key={field.value}
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="status-select">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                              <SelectItem value="terminated">
                                Terminated
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Current status of the lease
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )
                    }}
                  />
                </CardContent>
              </Card>

              {/* Recovery Profile */}
              <RecoveryProfileEditor initialValues={lease?.recovery_profile} />

              {/* Lease Document Upload (Edit Mode Only) */}
              {isEditMode && leaseId && lease && (
                <LeaseDocumentUpload
                  leaseId={leaseId}
                  currentDocumentUrl={lease.document_url ?? null}
                />
              )}

              {/* Form Actions */}
              <div className="flex flex-col sm:flex-row justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    navigate(
                      isEditMode && leaseId
                        ? `/properties/${propertyId}/leases/${leaseId}`
                        : `/properties/${propertyId}`
                    )
                  }
                  disabled={isSubmitting}
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isSubmitting
                    ? isEditMode
                      ? 'Updating...'
                      : 'Creating...'
                    : isEditMode
                      ? 'Update Lease'
                      : 'Create Lease'}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}
