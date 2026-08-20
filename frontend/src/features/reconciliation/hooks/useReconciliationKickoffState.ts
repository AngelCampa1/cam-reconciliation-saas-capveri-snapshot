import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/api/client'
import { useLeases } from '@/api/hooks'
import { getLeakageApiV1LeakagePropertyIdGet } from '@/api/generated/sdk.gen'
import { useReconciliationValidation } from './useReconciliationValidation'

interface UseReconciliationKickoffStateParams {
  propertyId?: string
  year: number
}

export function useReconciliationKickoffState({
  propertyId,
  year,
}: UseReconciliationKickoffStateParams) {
  const periodStart = `${year}-01-01`
  const periodEnd = `${year}-12-31`

  const {
    data: leasesData,
    isLoading: leasesLoading,
    isPaused: leasesPaused,
    refetch: refetchLeases,
  } = useLeases(
    { ...(propertyId ? { property_id: propertyId } : {}), limit: 1 },
    { enabled: !!propertyId }
  )

  const {
    data: leakageData,
    isLoading: leakageLoading,
    isPaused: leakagePaused,
    refetch: refetchLeakage,
  } = useQuery({
    queryKey: ['kickoff-leakage', propertyId, periodStart, periodEnd],
    queryFn: async () => {
      const response = await getLeakageApiV1LeakagePropertyIdGet({
        client: apiClient,
        path: { property_id: propertyId! },
        query: {
          period_start: periodStart,
          period_end: periodEnd,
        },
      })
      if (response.error) {
        throw response.error
      }
      return response.data
    },
    enabled: !!propertyId,
    retry: false,
  })

  const validation = useReconciliationValidation(propertyId ?? '')

  const leaseCount =
    (
      leasesData as
        | { total?: number; leases?: unknown[]; items?: unknown[] }
        | undefined
    )?.total ??
    (
      leasesData as
        | { count?: number; leases?: unknown[]; items?: unknown[] }
        | undefined
    )?.count ??
    (leasesData as { leases?: unknown[]; items?: unknown[] } | undefined)
      ?.leases?.length ??
    (leasesData as { items?: unknown[] } | undefined)?.items?.length ??
    0

  const hasLeases = leaseCount > 0
  const hasGlData = leakageData?.has_gl_data ?? false
  const isReady = hasLeases && hasGlData

  const isPaused =
    (leasesPaused && !leasesData) || (leakagePaused && !leakageData)
  const refetch = () => {
    void refetchLeases()
    void refetchLeakage()
  }

  return {
    isLoading: leasesLoading || leakageLoading || validation.isLoading,
    isPaused,
    refetch,
    hasLeases,
    hasGlData,
    isReady,
    unmappedPools: validation.unmappedPools,
  }
}
