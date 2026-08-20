/**
 * DemandLetterPanel -- slide-out sheet for tenant billing documents.
 *
 * 3-step workflow:
 *   Step 1: Select tenant
 *   Step 2: Letter details -- state (TX|CA), payment deadline, landlord info
 *   Step 3: Summary + Generate and Download
 */

import { useState } from 'react'
import { Loader2, Scale, Users } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { toast } from 'sonner'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

import { useGenerateDemandLetter } from '@/api/hooks'
import { getErrorMessage } from '@/api/errors'
import { trackEvent } from '@/lib/analytics'
import { formatMoney } from '@/lib/money'
import { pluralizeWithCount } from '@/lib/pluralize'

export interface DemandLetterPanelProps {
  open: boolean
  onClose: () => void
  propertyId: string
  year: number
  tenants: Array<{
    id: string
    name: string
    unit?: string
    total_recovery?: number
  }>
}

interface LandlordDetails {
  name: string
  title: string
  company: string
  address: string
  phone: string
  email: string
}

export function DemandLetterPanel({
  open,
  onClose,
  propertyId,
  year,
  tenants,
}: DemandLetterPanelProps) {
  const [step, setStep] = useState(1)
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [state, setState] = useState<'TX' | 'CA'>('TX')
  const [paymentDeadlineDays, setPaymentDeadlineDays] = useState(30)
  const [landlord, setLandlord] = useState<LandlordDetails>({
    name: '',
    title: '',
    company: '',
    address: '',
    phone: '',
    email: '',
  })

  const eligibleTenants = tenants
  const selectedTenant = eligibleTenants.find((t) => t.id === selectedTenantId)
  const selectedTenantRecovery = selectedTenant?.total_recovery ?? 0
  const isCollectionDemand = selectedTenantRecovery > 0
  const documentLabel = isCollectionDemand
    ? 'demand letter'
    : 'statement correction note'

  const generateMutation = useGenerateDemandLetter({
    onSuccess: () => {
      trackEvent('demand_letter_generated', {
        property_id: propertyId,
        year,
        tenant_count: selectedTenant ? 1 : 0,
        state,
        payment_deadline_days: paymentDeadlineDays,
      })
      toast.success(
        isCollectionDemand
          ? 'Demand letter downloaded successfully'
          : 'Statement correction note downloaded successfully'
      )
      onClose()
      resetForm()
    },
    onError: (err: Error) => {
      toast.error('Failed to generate demand letter', {
        description: getErrorMessage(err),
      })
    },
  })

  function resetForm() {
    setStep(1)
    setSelectedTenantId('')
    setState('TX')
    setPaymentDeadlineDays(30)
    setLandlord({
      name: '',
      title: '',
      company: '',
      address: '',
      phone: '',
      email: '',
    })
  }

  function handleClose() {
    onClose()
    resetForm()
  }

  function handleGenerate() {
    if (!selectedTenantId) return
    // Guard against a double-submit when the generate button is triggered twice
    // before its disabled state propagates.
    if (generateMutation.isPending) return

    generateMutation.mutate({
      snapshot_id: selectedTenantId,
      state,
      landlord_name: landlord.name,
      landlord_title: landlord.title,
      landlord_company: landlord.company,
      landlord_address: landlord.address,
      landlord_phone: landlord.phone,
      landlord_email: landlord.email,
      payment_deadline_days: paymentDeadlineDays,
    })
  }

  // Guard against losing a tenant selection or typed landlord details to an
  // accidental backdrop click or Escape. The untouched first step stays freely
  // dismissible.
  const isDirty =
    selectedTenantId !== '' ||
    landlord.name !== '' ||
    landlord.title !== '' ||
    landlord.company !== '' ||
    landlord.address !== '' ||
    landlord.phone !== '' ||
    landlord.email !== ''
  const preventAccidentalDismiss = (e: Event) => {
    if (isDirty && !generateMutation.isPending) {
      e.preventDefault()
    }
  }

  if (!open) return null

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <SheetContent
        data-testid="demand-letter-panel"
        className="w-full overflow-y-auto sm:max-w-lg"
        onInteractOutside={preventAccidentalDismiss}
        onEscapeKeyDown={preventAccidentalDismiss}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" aria-hidden="true" />
            Generate Billing Document
          </SheetTitle>
          <SheetDescription>
            Build a demand letter for an under-bill, or a correction note for an
            over-bill or clean result.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={step === 1 ? 'font-semibold text-foreground' : ''}>
              1. Tenant
            </span>
            <span>&rsaquo;</span>
            <span className={step === 2 ? 'font-semibold text-foreground' : ''}>
              2. Letter Details
            </span>
            <span>&rsaquo;</span>
            <span className={step === 3 ? 'font-semibold text-foreground' : ''}>
              3. Review &amp; Generate
            </span>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tenant-select">Select Tenant</Label>
                <select
                  id="tenant-select"
                  data-testid="tenant-select"
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a tenant...</option>
                  {eligibleTenants.map((tenant) => {
                    const unitLabel = tenant.unit ? ` - ${tenant.unit}` : ''
                    const recoveryLabel =
                      tenant.total_recovery != null
                        ? ` (${formatMoney(tenant.total_recovery)})`
                        : ''

                    return (
                      <option key={tenant.id} value={tenant.id}>
                        {`${tenant.name}${unitLabel}${recoveryLabel}`}
                      </option>
                    )
                  })}
                </select>
                {eligibleTenants.length === 0 && (
                  <EmptyState
                    icon={Users}
                    title="No tenants available"
                    description="Finalize a reconciliation before generating a billing document."
                    size="sm"
                  />
                )}
              </div>

              <Button
                data-testid="step-1-next"
                className="w-full"
                disabled={!selectedTenantId}
                onClick={() => setStep(2)}
              >
                Next
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label id="demand-letter-state-label">State</Label>
                <div
                  className="flex gap-4"
                  role="group"
                  aria-labelledby="demand-letter-state-label"
                >
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      data-testid="state-tx"
                      name="demand-letter-state"
                      value="TX"
                      checked={state === 'TX'}
                      onChange={() => setState('TX')}
                    />
                    Texas (TX)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      data-testid="state-ca"
                      name="demand-letter-state"
                      value="CA"
                      checked={state === 'CA'}
                      onChange={() => setState('CA')}
                    />
                    California (CA)
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline-days">
                  {isCollectionDemand
                    ? 'Payment Deadline (days)'
                    : 'Correction Window (days)'}
                </Label>
                <Input
                  id="deadline-days"
                  data-testid="deadline-days-input"
                  type="number"
                  min={1}
                  max={90}
                  value={paymentDeadlineDays}
                  onChange={(e) =>
                    setPaymentDeadlineDays(Number(e.target.value))
                  }
                />
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">Landlord Information</p>

                <div className="space-y-2">
                  <Label htmlFor="landlord-name">Name</Label>
                  <Input
                    id="landlord-name"
                    data-testid="landlord-name-input"
                    value={landlord.name}
                    onChange={(e) =>
                      setLandlord((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="John Smith"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="landlord-title">Title</Label>
                  <Input
                    id="landlord-title"
                    data-testid="landlord-title-input"
                    value={landlord.title}
                    onChange={(e) =>
                      setLandlord((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    placeholder="Property Manager"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="landlord-company">Company</Label>
                  <Input
                    id="landlord-company"
                    data-testid="landlord-company-input"
                    value={landlord.company}
                    onChange={(e) =>
                      setLandlord((prev) => ({
                        ...prev,
                        company: e.target.value,
                      }))
                    }
                    placeholder="Acme Properties LLC"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="landlord-address">Address</Label>
                  <Input
                    id="landlord-address"
                    data-testid="landlord-address-input"
                    value={landlord.address}
                    onChange={(e) =>
                      setLandlord((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                    placeholder="123 Main St, Dallas, TX 75201"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="landlord-phone">Phone</Label>
                  <Input
                    id="landlord-phone"
                    data-testid="landlord-phone-input"
                    value={landlord.phone}
                    onChange={(e) =>
                      setLandlord((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="(214) 555-0100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="landlord-email">Email</Label>
                  <Input
                    id="landlord-email"
                    data-testid="landlord-email-input"
                    type="email"
                    autoComplete="email"
                    value={landlord.email}
                    onChange={(e) =>
                      setLandlord((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="jsmith@acmeproperties.com"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  data-testid="step-2-back"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
                <Button
                  data-testid="step-2-next"
                  className="flex-1"
                  onClick={() => setStep(3)}
                >
                  Review
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border p-4 text-sm">
                <h3 className="font-medium">Document Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <span>Tenant:</span>
                  <span className="font-medium text-foreground">
                    {selectedTenant?.name ?? '-'}
                  </span>
                  <span>State:</span>
                  <span className="font-medium text-foreground">
                    {state === 'TX' ? 'Texas' : 'California'}
                  </span>
                  <span>
                    {isCollectionDemand
                      ? 'Payment deadline:'
                      : 'Review window:'}
                  </span>
                  <span className="font-medium text-foreground">
                    {pluralizeWithCount(paymentDeadlineDays, 'day')}
                  </span>
                  <span>Landlord:</span>
                  <span className="font-medium text-foreground">
                    {landlord.name || '-'}
                  </span>
                  <span>Company:</span>
                  <span className="font-medium text-foreground">
                    {landlord.company || '-'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Check the tenant details, lease terms, and reconciliation before
                you send this {documentLabel}. CapVeri is not responsible for
                errors in figures you did not verify. This is not legal advice.
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(2)}
                >
                  Back
                </Button>
                <Button
                  data-testid="generate-button"
                  className="flex-1"
                  disabled={generateMutation.isPending}
                  onClick={handleGenerate}
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Scale className="mr-2 h-4 w-4" aria-hidden="true" />
                      {isCollectionDemand
                        ? 'Generate Demand Letter'
                        : 'Generate Correction Note'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
