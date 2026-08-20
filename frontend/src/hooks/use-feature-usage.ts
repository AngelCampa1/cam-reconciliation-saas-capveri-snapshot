import { useQuery } from '@tanstack/react-query'
import { authenticatedFetch } from '@/api/authFetch'
import { useAuth } from '@/hooks/useAuth'

export interface UsedFeature {
  key: string
  label: string
  required_tier: string
  first_used_at: string
  last_used_at: string
}

export interface FeatureUsageData {
  used_features: UsedFeature[]
  current_tier: string | null
}

export const featureUsageKeys = {
  all: (userId: string) => ['feature-usage', userId] as const,
}

export function useFeatureUsage() {
  const { user } = useAuth()

  return useQuery<FeatureUsageData>({
    queryKey: featureUsageKeys.all(user?.id ?? ''),
    queryFn: async (): Promise<FeatureUsageData> => {
      const res = await authenticatedFetch('/api/v1/billing/feature-usage')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Failed to fetch feature usage')
      }
      return res.json() as Promise<FeatureUsageData>
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    // F-133: fail-open soft gate --- keep first-load failures inside query state
    // rather than escalating to the global ErrorBoundary and white-screening.
    throwOnError: false,
  })
}
