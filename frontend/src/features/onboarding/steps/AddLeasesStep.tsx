/**
 * Add Leases Step Component
 *
 * Step 2 of onboarding: ensure at least one lease exists before
 * reconciliation can run.
 *
 * Three states:
 *  - Loading: spinner while useLeases query is pending
 *  - No leases: inline form shown directly, Continue disabled
 *  - Has leases: list of existing leases, optional "Add another" toggle,
 *    Continue enabled
 */
import { useState, useEffect } from 'react'
import { Building2, CheckCircle2, FileSpreadsheet, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useOnboarding } from '../OnboardingContext'
import { useLeases, useUnits } from '@/api/hooks'
import { InlineLeaseForm } from '../components/InlineLeaseForm'
import { trackEvent } from '@/lib/analytics'

export function AddLeasesStep() {
  const [showAddForm, setShowAddForm] = useState(false)
  const { nextStep, setStepData, state } = useOnboarding()
  const propertyId = state.data.propertyId

  useEffect(() => {
    trackEvent('onboard_step_viewed', {
      step: 2,
      step_label: 'Tenant Leases',
    })
  }, [])

  const {
    data,
    isLoading,
    error,
    isPaused,
    refetch: refetchLeases,
  } = useLeases(propertyId ? { property_id: propertyId, limit: 50 } : {}, {
    enabled: Boolean(propertyId),
  })

  const isOffline = isPaused && !data

  const {
    data: unitsData,
    isError: isUnitsError,
    refetch: refetchUnits,
  } = useUnits(propertyId ?? '', {}, { enabled: Boolean(propertyId) })

  const leases = data?.data ?? []
  const leaseCount = data?.count ?? leases.length
  const hasLeases = leaseCount > 0
  const units = unitsData?.data ?? []

  const unitsErrorNote = isUnitsError ? (
    <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-strong">
      <p>
        We could not load the spaces for this building. The list may be empty.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 rounded-full"
        onClick={() => refetchUnits()}
      >
        Try again
      </Button>
    </div>
  ) : null

  const handleContinue = () => {
    trackEvent('onboard_step_completed', {
      step: 2,
      step_label: 'Tenant Leases',
      lease_count: leaseCount,
    })
    setStepData('hasLeases', true)
    nextStep()
  }

  if (!propertyId) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Building2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Add your tenants
        </h2>
        <p className="mb-8 text-muted-foreground">
          Add your building first. Then you can add tenants.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Add your tenants
        </h2>
        <p className="text-muted-foreground">
          A lease is one tenant&apos;s space in your building. We need at least
          one. We check each tenant&apos;s fair share.
        </p>
      </div>

      {!isOffline && error && (
        <div className="mb-4">
          <ErrorState
            size="sm"
            title="We could not load your tenants"
            action={{ onClick: () => refetchLeases() }}
          />
        </div>
      )}

      {isOffline ? (
        <ErrorState
          size="sm"
          title="Couldn't load your tenants"
          offline
          action={{ onClick: () => refetchLeases() }}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : hasLeases ? (
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-success/20 bg-success/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="font-medium text-success-strong">
                {leaseCount} tenant{leaseCount === 1 ? '' : 's'} added
              </p>
            </div>
            <ul className="space-y-1">
              {leases.map((lease) => (
                <li key={lease.id} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {lease.tenant_name}
                  </span>
                  {' · '}
                  {lease.start_date} to {lease.end_date}
                </li>
              ))}
            </ul>
          </div>

          {showAddForm ? (
            <div className="rounded-lg border p-4">
              {unitsErrorNote}
              <InlineLeaseForm
                propertyId={propertyId}
                units={units}
                onSuccess={() => setShowAddForm(false)}
              />
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowAddForm(true)}
              className="w-full min-h-[44px]"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add another tenant
            </Button>
          )}

          <Button onClick={handleContinue} className="w-full min-h-[44px]">
            Next
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            {unitsErrorNote}
            <InlineLeaseForm propertyId={propertyId} units={units} />
          </div>

          <Button
            onClick={handleContinue}
            disabled
            className="w-full min-h-[44px]"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
