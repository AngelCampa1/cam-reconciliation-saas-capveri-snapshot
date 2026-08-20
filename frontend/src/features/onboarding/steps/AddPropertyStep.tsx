/**
 * Add Property Step Component
 *
 * Second step of onboarding - simplified property creation form.
 * Features:
 * - Upload rent roll option (recommended for faster setup)
 * - Manual entry option
 * Creates a real property via the API for use in reconciliation calculations.
 */
import { useState, useEffect } from 'react'
import { Building2, AlertCircle, Upload, PenLine, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RentRollUpload } from '@/components/rent-roll'
import { ExportGuide } from '@/components/onboarding/ExportGuide'
import { useOnboarding } from '../OnboardingContext'
import { logger } from '@/lib/logger'
import { trackEvent } from '@/lib/analytics'
import { apiClient } from '@/api/client'
import {
  createPropertyApiV1PropertiesPost,
  getPropertyApiV1PropertiesPropertyIdGet,
  type BomaStandardVersion,
} from '@/api/generated'

interface FormData {
  name: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
  totalRentableSqft: string
  bomaStandardVersion: string
}

export function AddPropertyStep() {
  const { nextStep, setStepData } = useOnboarding()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    totalRentableSqft: '',
    bomaStandardVersion: '2024',
  })

  useEffect(() => {
    trackEvent('onboard_step_viewed', {
      step: 1,
      step_label: 'Your Property',
    })
  }, [])

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null) // Clear error on change
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const rentableSqft = parseFloat(formData.totalRentableSqft) || 10000
      // Default usable to 90% of rentable, common area to the difference
      const usableSqft = Math.round(rentableSqft * 0.9)
      const commonAreaSqft = rentableSqft - usableSqft

      const response = await createPropertyApiV1PropertiesPost({
        client: apiClient,
        body: {
          name: formData.name.trim(),
          address_line1: formData.addressLine1.trim(),
          city: formData.city.trim() || 'Unknown',
          state: formData.state.trim().toUpperCase() || 'TX',
          postal_code: formData.postalCode.trim() || '00000',
          total_rentable_sqft: rentableSqft,
          total_usable_sqft: usableSqft,
          common_area_sqft: commonAreaSqft,
          boma_standard_version:
            formData.bomaStandardVersion as BomaStandardVersion,
        },
      })

      if (response.error) {
        const errorDetail =
          response.error.detail ||
          (Array.isArray(response.error) ? response.error[0]?.msg : null) ||
          'Failed to create property'
        setError(String(errorDetail))
        return
      }

      if (response.data) {
        // Store the real property data
        setStepData('propertyId', response.data.id)
        setStepData('propertyName', response.data.name)

        logger.info('Property created during onboarding', {
          propertyId: response.data.id,
          propertyName: response.data.name,
        })

        // Move to next step
        trackEvent('onboard_step_completed', {
          step: 1,
          step_label: 'Your Property',
          method: 'manual',
        })
        trackEvent('property_created', {
          property_id: response.data.id,
          method: 'manual',
          source: 'onboarding',
          state: response.data.state,
          boma_standard_version: response.data.boma_standard_version,
        })
        nextStep()
      }
    } catch (err) {
      logger.error('Failed to create property during onboarding', {
        propertyName: formData.name,
        error: err,
      })
      setError('Failed to create property. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = () => {
    trackEvent('onboard_step_completed', {
      step: 1,
      step_label: 'Your Property',
      method: 'skipped',
    })
    nextStep()
  }

  // Handle rent roll import success - fetch property details and proceed
  const handleRentRollSuccess = async (propertyId: string) => {
    try {
      // Fetch the created property to get its name
      const response = await getPropertyApiV1PropertiesPropertyIdGet({
        client: apiClient,
        path: { property_id: propertyId },
      })

      if (response.data) {
        setStepData('propertyId', response.data.id)
        setStepData('propertyName', response.data.name)
        setStepData('hasLeases', true)

        logger.info('Property created via rent roll during onboarding', {
          propertyId: response.data.id,
          propertyName: response.data.name,
        })

        trackEvent('onboard_step_completed', {
          step: 1,
          step_label: 'Your Property',
          method: 'rent_roll',
        })
        trackEvent('property_created', {
          property_id: response.data.id,
          method: 'rent_roll',
          source: 'onboarding',
          state: response.data.state,
          boma_standard_version: response.data.boma_standard_version,
        })
        trackEvent('onboard_step_completed', {
          step: 2,
          step_label: 'Tenant Leases',
          method: 'rent_roll_import',
        })
        nextStep()
        nextStep()
      }
    } catch (err) {
      logger.error('Failed to fetch property after rent roll import', {
        propertyId,
        error: err,
      })
      // Still proceed - the property was created
      setStepData('propertyId', propertyId)
      setStepData('hasLeases', true)
      trackEvent('onboard_step_completed', {
        step: 1,
        step_label: 'Your Property',
        method: 'rent_roll',
      })
      trackEvent('property_created', {
        property_id: propertyId,
        method: 'rent_roll',
        source: 'onboarding',
      })
      trackEvent('onboard_step_completed', {
        step: 2,
        step_label: 'Tenant Leases',
        method: 'rent_roll_import',
      })
      nextStep()
      nextStep()
    }
  }

  const nameError =
    formData.name.trim().length > 200
      ? 'Property name must be less than 200 characters'
      : null

  const isValid =
    formData.name.trim() !== '' &&
    formData.name.trim().length <= 200 &&
    formData.addressLine1.trim() !== '' &&
    formData.totalRentableSqft.trim() !== '' &&
    parseFloat(formData.totalRentableSqft) > 0

  return (
    <div className="mx-auto max-w-lg" data-testid="property-step">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Tell us about your building
        </h2>
        <p className="text-muted-foreground">
          Just the basics. You can add more later.
        </p>
      </div>

      {/* Tabs for Upload/Manual Entry */}
      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload a tenant list
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <PenLine className="h-4 w-4" />
            Enter Manually
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload">
          <ExportGuide type="rent-roll" />
          <RentRollUpload
            onSuccess={handleRentRollSuccess}
            onCancel={handleSkip}
          />
        </TabsContent>

        {/* Manual Entry Tab */}
        <TabsContent value="manual">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="name">Property Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Downtown Office Tower"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                maxLength={200}
              />
              {nameError && (
                <p className="text-sm text-destructive-strong">{nameError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="addressLine1">Street Address *</Label>
              <Input
                id="addressLine1"
                placeholder="e.g., 123 Main Street"
                value={formData.addressLine1}
                onChange={(e) => handleChange('addressLine1', e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="City"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  placeholder="State"
                  value={formData.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  maxLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Zip Code</Label>
                <Input
                  id="postalCode"
                  placeholder="Zip"
                  value={formData.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalRentableSqft">
                How big is the building? *
              </Label>
              <Input
                id="totalRentableSqft"
                type="number"
                placeholder="e.g., 50000"
                value={formData.totalRentableSqft}
                onChange={(e) =>
                  handleChange('totalRentableSqft', e.target.value)
                }
                min="1"
                required
                aria-describedby="totalRentableSqft-help"
              />
              <p
                id="totalRentableSqft-help"
                className="text-xs text-muted-foreground"
              >
                Add up the square feet you rent out. Count every floor.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bomaStandardVersion">
                Measuring rule{' '}
                <span className="font-normal text-muted-foreground">
                  (not sure? leave it on 2024)
                </span>
              </Label>
              <Select
                value={formData.bomaStandardVersion}
                onValueChange={(val) =>
                  handleChange('bomaStandardVersion', val)
                }
              >
                <SelectTrigger
                  id="bomaStandardVersion"
                  aria-describedby="bomaStandardVersion-help"
                >
                  <SelectValue placeholder="Select a measuring rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">BOMA 2024</SelectItem>
                  <SelectItem value="2017">BOMA 2017</SelectItem>
                  <SelectItem value="2010">BOMA 2010</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              <p
                id="bomaStandardVersion-help"
                className="text-xs text-muted-foreground"
              >
                This is a rulebook for measuring a building. Not sure? Leave it
                on 2024.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={handleSkip}
                className="order-2 sm:order-1 min-h-[44px]"
              >
                Skip for now
              </Button>
              <Button
                type="submit"
                disabled={!isValid || isSubmitting}
                className="order-1 sm:order-2 min-h-[44px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save my building'
                )}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  )
}
