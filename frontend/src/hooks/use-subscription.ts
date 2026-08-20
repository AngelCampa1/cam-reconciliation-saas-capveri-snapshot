/**
 * Subscription Hook
 *
 * Provides subscription data via direct Supabase queries
 * with Row Level Security (RLS).
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Subscription status values
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'paused'

/**
 * Subscription data structure
 */
export interface Subscription {
  id: string
  organization_id: string
  plan: string
  status: SubscriptionStatus
  pricing_model?: 'per_building' | 'per_unit' | 'credit_pack' | null
  building_count: number
  unit_count?: number | null
  included_units?: number | null
  unit_overage_count?: number | null
  tier?: string | null
  billing_interval?: 'annual' | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

/**
 * Query keys for subscription data
 */
export const subscriptionKeys = {
  all: ['subscription'] as const,
}

/**
 * Fetch the current user's organization subscription.
 *
 * Uses Supabase RLS to automatically filter by the user's organization_id.
 * Returns null if no subscription exists (free tier).
 *
 * @returns Query result with subscription data or null
 */
export function useSubscription() {
  const { user } = useAuth()

  return useQuery<Subscription | null>({
    queryKey: subscriptionKeys.all,
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .maybeSingle()

      if (error) {
        throw error
      }

      if (!data) {
        return null
      }

      return {
        ...(data as Subscription),
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // F-133: fail-open soft gate --- keep first-load failures inside query state
    // rather than escalating to the global ErrorBoundary and white-screening.
    throwOnError: false,
  })
}
