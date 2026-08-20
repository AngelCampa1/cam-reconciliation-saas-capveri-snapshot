import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CreditBalance } from '@/types/subscription'
import { resolveApiUrl } from '@/api/url'

export const creditBalanceKeys = {
  all: ['credit-balance'] as const,
}

export function useCreditBalance() {
  return useQuery<CreditBalance>({
    queryKey: creditBalanceKeys.all,
    throwOnError: false,
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch(resolveApiUrl('/api/v1/billing/credits'), {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      })

      if (!response.ok) {
        throw new Error('Failed to load credit balance')
      }

      return response.json()
    },
  })
}
