import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { getGlDateRangeApiV1IngestionGlDateRangePropertyIdGet } from '@/api/generated/sdk.gen'

/**
 * Hook to fetch the latest GL period year for a property.
 *
 * Calls `GET /api/v1/ingestion/gl-date-range/{property_id}`, which returns the
 * min/max GL transaction dates and the primary year (derived from the most
 * recent GL entry). The reconciliation page uses this to default the period to
 * the year the data actually covers instead of assuming the current calendar
 * year.
 *
 * Resilient by design: the endpoint returns 404 when a property has no GL
 * entries yet, and may be unavailable (401/403/network) in edge cases. In all
 * of those situations the hook resolves to `null` so the caller falls back to
 * the current year. It never throws, so it cannot block the page render.
 *
 * @param propertyId - The property ID to look up the GL date range for
 * @returns Query result whose `data` is the primary GL year, or null
 */
export function useLatestGLPeriod(propertyId: string) {
  return useQuery<number | null>({
    queryKey: ['gl-period', propertyId],
    queryFn: async (): Promise<number | null> => {
      try {
        const response =
          await getGlDateRangeApiV1IngestionGlDateRangePropertyIdGet({
            client: apiClient,
            path: { property_id: propertyId },
          })
        // Any non-success (404 no GL entries, 401/403, etc.) → fall back.
        if (response.error || !response.data) {
          return null
        }
        const year = response.data.year
        return typeof year === 'number' && Number.isFinite(year) ? year : null
      } catch {
        // Network/unexpected failure must not break the reconciliation page.
        return null
      }
    },
    enabled: !!propertyId,
    // Period rarely changes within a session; cache for 5 minutes.
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
