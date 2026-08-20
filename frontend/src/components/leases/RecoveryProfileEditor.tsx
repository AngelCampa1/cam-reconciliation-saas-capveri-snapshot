/**
 * Recovery Profile Editor Component
 *
 * Allows editing of lease recovery profile settings including:
 * - Pro-rata share
 * - Base year settings (conditional)
 * - Expense cap configuration (conditional)
 * - Gross-up settings (conditional)
 * - Admin fee percentage
 *
 * Integrated with React Hook Form for validation and state management
 */
import { useFormContext, useWatch } from 'react-hook-form'
import { HelpCircle } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BaseYearAdjustmentsEditor } from './BaseYearAdjustmentsEditor'

const rsfMeasurementStandardLabels = {
  '2010': 'BOMA 2010',
  '2017': 'BOMA 2017',
  '2024': 'BOMA 2024',
  custom: 'Custom',
} as const

const accountingBasisLabels = {
  cash: 'Cash Basis',
  accrual: 'Accrual Basis',
} as const

type RecoveryProfileInitialValues = {
  rsf_measurement_standard?:
    | keyof typeof rsfMeasurementStandardLabels
    | null
    | undefined
  accounting_basis?: keyof typeof accountingBasisLabels | null | undefined
}

/**
 * Tooltip label with help icon
 */
function TooltipLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Help: ${label}`}
              // Invisible 40px hit area centered on the 16px icon so the tap
              // target meets the touch floor without enlarging the visible icon
              // (recovery profiles render many help icons inline beside labels).
              className="relative inline-flex items-center rounded-full text-muted-foreground cursor-help before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

/**
 * Recovery Profile Editor Component
 *
 * Must be used within a React Hook Form context
 */
export function RecoveryProfileEditor({
  initialValues,
}: {
  initialValues?: RecoveryProfileInitialValues | undefined
} = {}) {
  const form = useFormContext()

  // Watch values for conditional rendering
  const capType = form.watch('recovery_profile.cap_type')
  const baseYear = form.watch('recovery_profile.base_year')
  const rsfMeasurementStandard = useWatch({
    control: form.control,
    name: 'recovery_profile.rsf_measurement_standard',
    defaultValue: form.getValues('recovery_profile.rsf_measurement_standard'),
  })
  const accountingBasis = useWatch({
    control: form.control,
    name: 'recovery_profile.accounting_basis',
    defaultValue: form.getValues('recovery_profile.accounting_basis'),
  })
  const displayRsfMeasurementStandard =
    rsfMeasurementStandard ?? initialValues?.rsf_measurement_standard
  const displayAccountingBasis =
    accountingBasis ?? initialValues?.accounting_basis

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Recovery Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pro-Rata Share */}
        <FormField
          control={form.control}
          name="recovery_profile.pro_rata_share"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <TooltipLabel
                  label="Pro-Rata Share (%)"
                  tooltip="The tenant's percentage share of building expenses. For example, if the tenant occupies 5% of the building's rentable area, enter 5."
                />
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="e.g., 5.25"
                  {...field}
                  data-testid="pro-rata-share-input"
                />
              </FormControl>
              <FormDescription>
                Percentage of building expenses allocated to this tenant
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Base Year Settings */}
        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Base Year Stop</h3>

          <FormField
            control={form.control}
            name="recovery_profile.base_year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <TooltipLabel
                    label="Base Year (Optional)"
                    tooltip="The year from which expense increases are calculated. Tenant only pays for increases above the base year amount. Leave blank if no base year stop applies."
                  />
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1900"
                    max="2100"
                    placeholder="e.g., 2024"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    data-testid="base-year-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Base Year Amount - only show when base year is set */}
          {baseYear && (
            <FormField
              control={form.control}
              name="recovery_profile.base_year_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <TooltipLabel
                      label="Base Year Amount (Optional)"
                      tooltip="The frozen expense amount for the base year. If specified, this exact amount will be used instead of calculating from actual expenses."
                    />
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g., 50000.00"
                      {...field}
                      value={field.value ?? ''}
                      data-testid="base-year-amount-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Gross-Up Base Year - only show when base year is set */}
          {baseYear && (
            <FormField
              control={form.control}
              name="recovery_profile.gross_up_base_year"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      <TooltipLabel
                        label="Gross-Up Base Year"
                        tooltip="When enabled, the base year expenses will be grossed up to 95% occupancy if the actual occupancy was lower. This prevents artificially low base years."
                      />
                    </FormLabel>
                    <FormDescription>
                      Adjust base year for occupancy
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      aria-label="Gross-Up Base Year"
                      data-testid="gross-up-base-year-switch"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          {/* New-service adjustments - only show when base year is set */}
          {baseYear && (
            <BaseYearAdjustmentsEditor fieldPrefix="recovery_profile" />
          )}
        </div>

        {/* Expense Cap Settings */}
        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Expense Cap</h3>

          <FormField
            control={form.control}
            name="recovery_profile.cap_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <TooltipLabel
                    label="Cap Type"
                    tooltip="Limits how much expenses can increase year-over-year. None = no limit. Non-cumulative = cap resets yearly. Cumulative = unused capacity carries forward. Cumulative Compounding = cap compounds like interest."
                  />
                </FormLabel>
                {/* key={field.value} forces the Radix Select to remount when the
                    cap_type is hydrated asynchronously (form.reset in edit mode);
                    without it Radix caches its empty on-mount selection and never
                    adopts the controlled value, leaving the wrong label displayed. */}
                <Select
                  key={field.value}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="cap-type-select">
                      <SelectValue placeholder="Select cap type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No Cap</SelectItem>
                    <SelectItem value="non_cumulative">
                      Non-Cumulative
                    </SelectItem>
                    <SelectItem value="cumulative">Cumulative</SelectItem>
                    <SelectItem value="cumulative_compounding">
                      Cumulative Compounding
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Maximum allowable expense increase
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Cap Rate - only show when cap type != 'none' */}
          {capType && capType !== 'none' && (
            <FormField
              control={form.control}
              name="recovery_profile.cap_rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <TooltipLabel
                      label="Cap Rate (%)"
                      tooltip="The maximum percentage increase allowed per year. For example, a 5% cap means expenses can only increase by 5% from the prior year."
                    />
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="e.g., 5.0"
                      {...field}
                      value={field.value ?? ''}
                      data-testid="cap-rate-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {/* Admin Fee */}
        <FormField
          control={form.control}
          name="recovery_profile.admin_fee_percentage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <TooltipLabel
                  label="Admin Fee (%) (Optional)"
                  tooltip="The landlord's admin fee added on top of recoverable expenses. Typically 15%."
                />
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="e.g., 15.0"
                  {...field}
                  value={field.value ?? ''}
                  data-testid="admin-fee-input"
                />
              </FormControl>
              <FormDescription>
                Administrative fee on recoverable expenses
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* BOMA 2024 Compliance */}
        <FormField
          control={form.control}
          name="recovery_profile.rsf_measurement_standard"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <TooltipLabel
                  label="RSF Certified Under (Optional)"
                  tooltip="Which BOMA standard was used when this tenant's square footage was certified? Mixed vintages in the same building can cause systematic pro-rata errors."
                />
              </FormLabel>
              <Select
                onValueChange={(val) =>
                  field.onChange(val === 'none' ? null : val)
                }
                value={field.value ?? 'none'}
              >
                <FormControl>
                  <SelectTrigger data-testid="rsf-measurement-standard-select">
                    <span>
                      {displayRsfMeasurementStandard
                        ? rsfMeasurementStandardLabels[
                            displayRsfMeasurementStandard as keyof typeof rsfMeasurementStandardLabels
                          ]
                        : 'Not specified'}
                    </span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="2024">BOMA 2024</SelectItem>
                  <SelectItem value="2017">BOMA 2017</SelectItem>
                  <SelectItem value="2010">BOMA 2010</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                BOMA standard used to certify this tenant&apos;s square footage
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Accounting Basis */}
        <FormField
          control={form.control}
          name="recovery_profile.accounting_basis"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <TooltipLabel
                  label="Accounting Basis (Optional)"
                  tooltip="Cash basis recognizes expenses when paid. Accrual basis recognizes expenses when incurred. Using the wrong basis may conflict with the lease terms."
                />
              </FormLabel>
              <Select
                onValueChange={(val) =>
                  field.onChange(val === 'none' ? null : val)
                }
                value={field.value ?? 'none'}
              >
                <FormControl>
                  <SelectTrigger data-testid="accounting-basis-select">
                    <span>
                      {displayAccountingBasis
                        ? accountingBasisLabels[
                            displayAccountingBasis as keyof typeof accountingBasisLabels
                          ]
                        : 'Not specified'}
                    </span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="cash">Cash Basis</SelectItem>
                  <SelectItem value="accrual">Accrual Basis</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Accounting method for expense recovery calculation
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}
