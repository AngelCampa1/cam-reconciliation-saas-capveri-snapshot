/**
 * Property Form Page Component
 *
 * Form for creating and editing properties.
 * Features:
 * - Create and edit modes
 * - Rent roll upload option (create mode only)
 * - React Hook Form with Zod validation
 * - Property Information section
 * - BOMA Area Information section
 * - Loading states
 * - Success/error toast notifications
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Upload, PenLine } from 'lucide-react'

import { useProperty, useCreateProperty, useUpdateProperty } from '@/api/hooks'
import type { Property, ApiError } from '@/api/client'
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RentRollUpload } from '@/components/rent-roll'
import { GuideCallout } from '@/features/help/components'
import { trackEvent } from '@/lib/analytics'
import { percentToDecimalString } from '@/lib/percent'
import { toast } from 'sonner'
import { propertyFormSchema, type PropertyFormData } from './PropertyFormSchema'

const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
  ['DC', 'District of Columbia'],
] as const

export function PropertyFormPage() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isEditMode = propertyId && propertyId !== 'new'

  // Fetch property data for edit mode
  const {
    data: property,
    isLoading: isLoadingProperty,
    isError: isPropertyError,
    refetch: refetchProperty,
  } = useProperty(propertyId!, {
    enabled: Boolean(isEditMode),
  })

  // Form setup
  const form = useForm<PropertyFormData>({
    resolver: zodResolver(propertyFormSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      postal_code: '',
      total_rentable_sqft: '',
      total_usable_sqft: '',
      common_area_sqft: '',
      target_occupancy: '95',
      boma_standard_version: '2024' as const,
      rsf_measurement_date: '',
      tax_protest_county: '',
      tax_protest_deadline_override: '',
    },
  })

  // Create/Update mutations
  const createMutation = useCreateProperty({
    onSuccess: (data: Property) => {
      const values = form.getValues()
      trackEvent('property_create_succeeded', {
        property_id: data.id,
        entry_method: 'manual',
        boma_standard_version: values.boma_standard_version,
        has_tax_protest_county: Boolean(values.tax_protest_county?.trim()),
        has_tax_protest_deadline_override: Boolean(
          values.tax_protest_deadline_override?.trim()
        ),
      })
      toast.success('Property created successfully')
      navigate(`/properties/${data.id}`)
    },
    onError: (error: ApiError) => {
      console.error(error)
      toast.error(
        "We couldn't save this property. Check your entries and try again."
      )
    },
  })

  const updateMutation = useUpdateProperty(propertyId || '', {
    onSuccess: (data: Property) => {
      const values = form.getValues()
      trackEvent('property_update_succeeded', {
        property_id: data.id,
        boma_standard_version: values.boma_standard_version,
        has_tax_protest_county: Boolean(values.tax_protest_county?.trim()),
        has_tax_protest_deadline_override: Boolean(
          values.tax_protest_deadline_override?.trim()
        ),
      })
      toast.success('Property updated successfully')
      navigate(`/properties/${data.id}`)
    },
    onError: (error: ApiError) => {
      console.error(error)
      toast.error(
        "We couldn't update this property. Try again. Your old settings did not change."
      )
    },
  })

  // Populate form in edit mode
  useEffect(() => {
    if (property && isEditMode) {
      form.reset({
        name: property.name,
        address_line1: property.address_line1,
        address_line2: property.address_line2 || '',
        city: property.city,
        state: property.state,
        postal_code: property.postal_code,
        total_rentable_sqft: property.total_rentable_sqft,
        total_usable_sqft: property.total_usable_sqft,
        common_area_sqft: property.common_area_sqft,
        target_occupancy: property.target_occupancy
          ? // Convert the stored decimal fraction (e.g. "0.955") back to a
            // percentage string, preserving up to 2 decimals (the schema's
            // limit) instead of rounding to a whole number. Rounding to 2dp
            // also clears float artifacts (0.955 * 100 === 95.49999999999999).
            String(
              Math.round(parseFloat(property.target_occupancy) * 10000) / 100
            )
          : '95',
        boma_standard_version:
          (property.boma_standard_version as PropertyFormData['boma_standard_version']) ??
          '2024',
        rsf_measurement_date: property.rsf_measurement_date ?? '',
        tax_protest_county: property.tax_protest_county ?? '',
        tax_protest_deadline_override:
          property.tax_protest_deadline_override ?? '',
      })
    }
  }, [property, isEditMode, form])

  // When arriving from the Tax Protest page's "Configure" link
  // (/properties/:id/edit#tax-protest), scroll that section into view so the
  // user lands on the fields they came to set instead of the top of a long
  // form. Wait for the property data so the section is mounted first.
  useEffect(() => {
    if (location.hash !== '#tax-protest') return
    if (isEditMode && !property) return
    const section = document.getElementById('tax-protest')
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash, property, isEditMode])

  // Form submission
  const onSubmit = (data: PropertyFormData) => {
    // Guard against a double-submit when Enter is pressed while a save is
    // already in flight. The disabled button blocks clicks, but not a keyboard
    // submit that fires before the disabled state has propagated.
    if (createMutation.isPending || updateMutation.isPending) return

    const payload = {
      ...data,
      // Convert percentage (e.g. "95") back to decimal (e.g. "0.95") for the API.
      // String-based shift avoids IEEE-754 drift (e.g. 95.5 / 100 would persist
      // a drifted decimal); the API accepts decimal strings (anyOf number/string).
      target_occupancy: percentToDecimalString(data.target_occupancy),
      address_line2: data.address_line2 || null,
      rsf_measurement_date: data.rsf_measurement_date || null,
      tax_protest_county: data.tax_protest_county || null,
      tax_protest_deadline_override: data.tax_protest_deadline_override || null,
    }

    if (isEditMode && propertyId) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  // Loading state for edit mode
  if (isEditMode && isLoadingProperty) {
    return (
      <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
        <PageHeader
          title="Loading Property..."
          breadcrumbs={[
            { label: 'Properties', href: '/properties' },
            { label: 'Loading...' },
            { label: 'Edit' },
          ]}
        />
        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // A failed property load must NOT fall through to a blank "Edit Property"
  // form — submitting it would overwrite the real property with empty fields.
  if (isEditMode && isPropertyError) {
    return (
      <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
        <PageHeader
          title="Edit Property"
          breadcrumbs={[
            { label: 'Properties', href: '/properties' },
            { label: 'Error' },
          ]}
        />
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive-strong"
          role="alert"
        >
          <p className="font-medium">We couldn't load this property.</p>
          <p className="mt-1 text-sm">
            This is a loading problem, not a deleted property — your data is
            safe. Editing is disabled until it loads so you don't overwrite it
            with blank values.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchProperty()}
            >
              Try again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/properties')}
            >
              Back to properties
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Handle rent roll import success
  const handleRentRollSuccess = (propertyId: string) => {
    trackEvent('property_rent_roll_import_succeeded', {
      property_id: propertyId,
    })
    toast.success('Property imported successfully')
    navigate(`/properties/${propertyId}`)
  }

  // Manual form content (extracted to avoid duplication)
  const manualFormContent = (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        {/* Property Information */}
        <Card className="shadow-sm">
          <CardHeader variant="muted">
            <CardTitle as="h2">Property Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Property Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Sunset Plaza"
                      {...field}
                      data-testid="property-name-input"
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address_line1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Address Line 1</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 123 Main Street"
                      {...field}
                      data-testid="address-line1-input"
                      autoComplete="street-address"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address_line2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Line 2</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Suite 100 (optional)"
                      {...field}
                      value={field.value || ''}
                      data-testid="address-line2-input"
                      autoComplete="address-line2"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>City</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Los Angeles"
                        {...field}
                        data-testid="city-input"
                        autoComplete="address-level2"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>State</FormLabel>
                    {/*
                      key={field.value} forces the Radix Select to remount when
                      the value is populated asynchronously (e.g. form.reset in
                      edit mode). Without this, Radix caches its selection on
                      mount and never reflects a controlled value that arrives
                      after the initial empty render, leaving the trigger on the
                      placeholder and submitting an empty/invalid state.
                    */}
                    <Select
                      key={field.value}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="state-input">
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {US_STATES.map(([code, name]) => (
                          <SelectItem key={code} value={code}>
                            {code} - {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Postal Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 90001"
                        {...field}
                        data-testid="postal-code-input"
                        autoComplete="postal-code"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      5 or 5+4 digits
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* BOMA Area Information */}
        <Card className="shadow-sm">
          <CardHeader variant="muted">
            <CardTitle as="h2">BOMA Area Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GuideCallout title="Use the numbers from your rent roll or certified area summary">
              <p>
                These square-footage fields tell CapVeri how tenant shares are
                calculated. If you are not sure which number is official, start
                with the value your team already uses for CAM billing.
              </p>
            </GuideCallout>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="total_rentable_sqft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Total Rentable Sqft</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g., 50000"
                        {...field}
                        data-testid="total-rentable-sqft-input"
                        autoComplete="off"
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

              <FormField
                control={form.control}
                name="total_usable_sqft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Total Usable Sqft</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g., 45000"
                        {...field}
                        data-testid="total-usable-sqft-input"
                        autoComplete="off"
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
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="common_area_sqft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Common Area Sqft</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g., 5000"
                        {...field}
                        data-testid="common-area-sqft-input"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Shared space like lobbies and halls. Enter 0 if there is
                      none.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_occupancy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Target Occupancy</FormLabel>
                    {/* The relative wrapper must sit OUTSIDE FormControl: the
                        Radix Slot forwards the generated id/aria-* to its
                        immediate child, so an intervening <div> would steal the
                        id from the <input> and break the FormLabel association. */}
                    <div className="relative">
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="e.g., 95"
                          {...field}
                          data-testid="target-occupancy-input"
                          autoComplete="off"
                          className="pr-8"
                        />
                      </FormControl>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                    <FormDescription className="text-xs">
                      Percentage (e.g., 95 for 95%)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="boma_standard_version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>BOMA Standard Version</FormLabel>
                    {/*
                      key={field.value} remounts the Radix Select when the value
                      is populated asynchronously (form.reset in edit mode). Same
                      reason as the State select above — without it Radix can keep
                      the trigger on its mount-time selection instead of the
                      stored value that arrives after the property fetch.
                    */}
                    <Select
                      key={field.value}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="boma-standard-version-select">
                          <SelectValue placeholder="Select BOMA version" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="2024">BOMA 2024</SelectItem>
                        <SelectItem value="2017">BOMA 2017</SelectItem>
                        <SelectItem value="2010">BOMA 2010</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Which BOMA Office Standard was used to measure this
                      building&apos;s rentable area?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rsf_measurement_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RSF Measurement Date (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ?? ''}
                        data-testid="rsf-measurement-date-input"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Date someone last measured the rentable space (RSF).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tax Protest Configuration */}
        <Card id="tax-protest" className="scroll-mt-24">
          <CardHeader variant="muted">
            <CardTitle as="h2">Tax Protest</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="tax_protest_county"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>County (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        placeholder="e.g., Harris"
                        data-testid="tax-protest-county-input"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      County for tax protest deadline lookup
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tax_protest_deadline_override"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline Override (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ?? ''}
                        data-testid="tax-protest-deadline-override-input"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Override the county default deadline
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex flex-col sm:flex-row justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate(
                isEditMode && propertyId
                  ? `/properties/${propertyId}`
                  : '/properties'
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
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {isSubmitting
              ? isEditMode
                ? 'Updating...'
                : 'Creating...'
              : isEditMode
                ? 'Update Property'
                : 'Create Property'}
          </Button>
        </div>
      </form>
    </Form>
  )

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title={isEditMode ? 'Edit Property' : 'Create Property'}
        breadcrumbs={
          isEditMode
            ? [
                { label: 'Properties', href: '/properties' },
                {
                  label: property?.name || 'Loading...',
                  href: `/properties/${propertyId}`,
                },
                { label: 'Edit' },
              ]
            : [
                { label: 'Properties', href: '/properties' },
                { label: 'New Property' },
              ]
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          {/* In CREATE mode, show tabs for Upload/Manual options */}
          {!isEditMode ? (
            <Tabs defaultValue="upload" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Upload Rent Roll
                </TabsTrigger>
                <TabsTrigger value="manual" className="gap-2">
                  <PenLine className="h-4 w-4" aria-hidden="true" />
                  Enter Manually
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload">
                <RentRollUpload
                  onSuccess={handleRentRollSuccess}
                  onCancel={() => navigate('/properties')}
                />
              </TabsContent>

              <TabsContent value="manual">{manualFormContent}</TabsContent>
            </Tabs>
          ) : (
            // In EDIT mode, show form directly (no tabs)
            manualFormContent
          )}
        </div>
      </div>
    </div>
  )
}
