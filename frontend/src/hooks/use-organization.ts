/**
 * Organization Data Hooks
 *
 * Provides React Query hooks for fetching and updating organization data
 * via direct Supabase queries with Row Level Security (RLS).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// Query keys for organization data
export const organizationKeys = {
  all: ['organization'] as const,
  detail: () => [...organizationKeys.all, 'detail'] as const,
}

/**
 * Organization data structure
 */
export interface Organization {
  id: string
  name: string
  subscription_status: string
  settings: {
    timezone: string
    default_currency: string
    fiscal_year_end_month: number
  }
  created_at: string
  updated_at: string
}

/**
 * Organization update payload
 */
export interface OrganizationUpdate {
  name: string
}

/**
 * Fetch the current user's organization.
 *
 * Uses Supabase RLS to automatically filter by the user's organization_id.
 * Returns null if no organization exists.
 *
 * @returns Query result with organization data or null
 */
export function useOrganization() {
  const { user } = useAuth()

  return useQuery({
    queryKey: organizationKeys.detail(),
    queryFn: async (): Promise<Organization | null> => {
      if (!user?.id) return null

      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .single()

      if (error) {
        // PGRST116: No rows returned - organization doesn't exist
        if (error.code === 'PGRST116') return null
        throw error
      }

      return data as Organization
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // F-133: fail-open soft gate --- keep first-load failures inside query state
    // rather than escalating to the global ErrorBoundary and white-screening.
    throwOnError: false,
  })
}

/**
 * Update the current user's organization.
 *
 * Uses Supabase RLS to automatically update only the user's organization.
 * Invalidates the organization cache on success.
 *
 * @returns Mutation for updating organization
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (update: OrganizationUpdate): Promise<Organization> => {
      const { data, error } = await supabase
        .from('organizations')
        .update(update)
        .select()
        .single()

      if (error) throw error

      return data as Organization
    },
    onSuccess: (data) => {
      // Update the cache with the new organization data
      queryClient.setQueryData(organizationKeys.detail(), data)
    },
  })
}
