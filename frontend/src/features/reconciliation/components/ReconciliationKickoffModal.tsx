import { useMemo, useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/api/client'
import { listPropertiesApiV1PropertiesGet } from '@/api/generated/sdk.gen'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ErrorState'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

import { useReconciliationKickoffState } from '@/features/reconciliation/hooks'
import { CalculateButton } from './CalculateButton'
import { SharedGlUpload } from './SharedGlUpload'

interface ReconciliationKickoffModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPropertyId?: string
  year: number
  onComplete?: (propertyId: string, year: number) => void
}

export function ReconciliationKickoffModal({
  open,
  onOpenChange,
  initialPropertyId,
  year,
  onComplete,
}: ReconciliationKickoffModalProps) {
  const navigate = useNavigate()
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    initialPropertyId ?? ''
  )
  const [glUploaded, setGlUploaded] = useState(false)

  const {
    data: propertiesData,
    isPaused: propertiesPaused,
    refetch: refetchProperties,
  } = useQuery({
    queryKey: ['kickoff-properties'],
    queryFn: async () => {
      const response = await listPropertiesApiV1PropertiesGet({
        client: apiClient,
      })
      if (response.error) {
        throw response.error
      }
      return response.data?.data ?? []
    },
    enabled: open && !initialPropertyId,
  })

  // A paused fetch (unreachable backend) leaves the property list undefined
  // without an error — show an offline notice instead of an empty dropdown
  // that reads as "you have no properties".
  const isPropertiesOffline = propertiesPaused && !propertiesData

  const selectedProperty = useMemo(
    () =>
      propertiesData?.find((property) => property.id === selectedPropertyId),
    [propertiesData, selectedPropertyId]
  )

  const kickoffState = useReconciliationKickoffState(
    selectedPropertyId ? { propertyId: selectedPropertyId, year } : { year }
  )

  const hasLeases = kickoffState.hasLeases
  const hasGlData = kickoffState.hasGlData || glUploaded
  const isReady = hasLeases && hasGlData && !!selectedPropertyId
  const isOffline = kickoffState.isPaused

  const periodStart = `${year}-01-01`
  const periodEnd = `${year}-12-31`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Start first reconciliation</DialogTitle>
          <DialogDescription>
            We will show what is still missing before the first run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!initialPropertyId && isPropertiesOffline && (
            <ErrorState
              size="sm"
              title="Can't reach the server"
              offline
              action={{ onClick: () => void refetchProperties() }}
            />
          )}

          {!initialPropertyId && !isPropertiesOffline && (
            <div className="space-y-2">
              <label htmlFor="kickoff-property" className="text-sm font-medium">
                Property
              </label>
              <Select
                value={selectedPropertyId}
                onValueChange={setSelectedPropertyId}
              >
                <SelectTrigger id="kickoff-property" aria-label="Property">
                  {selectedProperty?.name || 'Select property'}
                </SelectTrigger>
                <SelectContent>
                  {(propertiesData ?? []).map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedPropertyId && (
                <p className="text-sm text-muted-foreground">
                  Select a property to continue.
                </p>
              )}
            </div>
          )}

          {selectedPropertyId && !isOffline && (
            <div className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">What we need</h3>
              <p className="text-sm text-muted-foreground">
                You can add lease PDFs later. For now, add tenant terms and GL
                data.
              </p>
              <p
                className={`flex items-center gap-1.5 ${hasLeases ? 'text-success-strong' : 'text-muted-foreground'}`}
              >
                {hasLeases ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0" />
                )}
                {hasLeases ? 'Tenant terms found' : 'Add tenant terms'}
              </p>
              {!hasLeases && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    navigate(`/properties/${selectedPropertyId}?tab=leases`)
                  }
                >
                  Add terms
                </Button>
              )}

              <p
                className={`flex items-center gap-1.5 ${hasGlData ? 'text-success-strong' : 'text-muted-foreground'}`}
              >
                {hasGlData ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0" />
                )}
                {hasGlData ? 'GL uploaded' : 'Upload GL data'}
              </p>
              {!hasGlData && (
                <SharedGlUpload
                  propertyId={selectedPropertyId}
                  onUploaded={() => {
                    setGlUploaded(true)
                  }}
                />
              )}
            </div>
          )}

          {selectedPropertyId && isOffline && (
            <ErrorState
              size="sm"
              title="Can't reach the server"
              offline
              action={{ onClick: kickoffState.refetch }}
            />
          )}

          {selectedPropertyId && !isOffline && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <h3 className="font-medium">Run reconciliation</h3>
                <p className="text-sm text-muted-foreground">
                  {isReady
                    ? 'Ready to calculate.'
                    : 'Add tenant terms and GL data first.'}
                </p>
              </div>
              <CalculateButton
                propertyId={selectedPropertyId}
                periodStart={periodStart}
                periodEnd={periodEnd}
                disabled={!isReady || kickoffState.isLoading}
                hasDraftData={false}
                unmappedPools={kickoffState.unmappedPools}
                onCalculateSuccess={() => {
                  onOpenChange(false)
                  onComplete?.(selectedPropertyId, year)
                  navigate(
                    `/properties/${selectedPropertyId}/reconciliations?year=${year}`
                  )
                }}
                onFixMappings={() =>
                  navigate(`/properties/${selectedPropertyId}?tab=pools`)
                }
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
