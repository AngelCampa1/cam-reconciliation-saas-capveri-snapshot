import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { DetailLevelAdvisoryResponse } from '../types'

export interface UseDetailAdvisorParams {
  propertyId: string
  year: number
  enabled?: boolean
}

export function useDetailAdvisor({
  propertyId,
  year,
  enabled = true,
}: UseDetailAdvisorParams) {
  return useQuery<DetailLevelAdvisoryResponse>({
    queryKey: ['detail-advisor', propertyId, year],
    queryFn: async () => {
      const { data, error } = await apiClient.post({
        url: '/api/v1/export/detail-advisor' as never,
        body: {
          property_id: propertyId,
          year,
        } as never,
      })
      if (error) {
        throw new Error('Failed to fetch detail advisor')
      }
      return data as DetailLevelAdvisoryResponse
    },
    enabled: enabled && !!propertyId && year > 0,
  })
}
