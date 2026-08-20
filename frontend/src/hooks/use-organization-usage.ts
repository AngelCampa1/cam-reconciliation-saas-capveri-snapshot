/**
 * Organization Usage Hook
 *
 * Provides usage statistics (properties, users) and plan limits
 * via direct Supabase queries with Row Level Security (RLS).
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { TIERS, type TierId } from '@/generated/plan-tiers'

/**
 * Organization usage data with current usage and plan limits
 */
export interface OrganizationUsage {
  propertiesUsed: number
  propertiesLimit: number
  unitsUsed: number
  unitsLimit: number
  usersUsed: number
  usersLimit: number
}

/**
 * Query keys for organization usage
 */
export const usageKeys = {
  all: ['organization-usage'] as const,
}

/**
 * Get plan limits based on subscription plan.
 *
 * All self-serve plans (basic, pro) support unlimited buildings and
 * unlimited team members.
 *
 * @param plan - Subscription plan name
 * @returns Object with properties and users limits (-1 = unlimited)
 */
function getPlanLimits(plan: string): {
  unitCount?: number | null
  properties: number
  units: number
  users: number
} {
  const canonicalTier = normalizePlanToTier(plan)
  if (!canonicalTier) {
    return { properties: 1, units: 1, users: 1 }
  }

  const tier = TIERS.find((item) => item.id === canonicalTier)
  return {
    properties: -1,
    units: tier?.maxUnits ?? -1,
    users: -1,
  }
}

function normalizePlanToTier(plan: string): TierId | null {
  if (
    [
      'reconcile',
      'essentials',
      'professional',
      'growth',
      'growth_v2',
      'portfolio',
      'starter',
      'pro',
      'business',
      'control',
      'defend',
    ].includes(plan)
  ) {
    return 'reconcile'
  }
  return null
}

/**
 * Fetch organization usage statistics and plan limits.
 *
 * Uses Supabase RLS to:
 * - Count properties (auto-filtered by organization_id)
 * - Count users (auto-filtered by organization_id)
 * - Get subscription plan for limit calculation
 *
 * @returns Query result with usage data
 */
export function useOrganizationUsage() {
  const { user } = useAuth()

  return useQuery<OrganizationUsage>({
    queryKey: usageKeys.all,
    queryFn: async (): Promise<OrganizationUsage> => {
      if (!user?.id) {
        throw new Error('User not authenticated')
      }

      // Count properties (RLS auto-filters by organization_id)
      const { count: propertiesCount, error: propError } = await supabase
        .from('properties')
        .select('*', { count: 'exact', head: true })

      if (propError) throw propError

      const { data: propertyRows, error: propertyRowsError } = await supabase
        .from('properties')
        .select('id')

      if (propertyRowsError) throw propertyRowsError

      const propertyIds = (propertyRows || [])
        .map((row) => row.id)
        .filter((id): id is string => typeof id === 'string')

      let unitsCount = 0
      if (propertyIds.length > 0) {
        const { count, error: unitsError } = await supabase
          .from('units')
          .select('*', { count: 'exact', head: true })
          .in('property_id', propertyIds)
          .neq('space_type', 'outdoor_amenity')
          .neq('space_type', 'equipment_shaft')

        if (unitsError) throw unitsError
        unitsCount = count || 0
      }

      // Count users (RLS auto-filters by organization_id)
      const { count: usersCount, error: usersError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      if (usersError) throw usersError

      // Get subscription for limits (RLS auto-filters by organization_id)
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .select('plan, tier, unit_count')
        .maybeSingle()

      if (subError) throw subError

      const limits = getPlanLimits(subData?.tier || subData?.plan || 'free')
      const unitsLimit =
        typeof subData?.unit_count === 'number' && subData.unit_count > 0
          ? subData.unit_count
          : limits.units

      return {
        propertiesUsed: propertiesCount || 0,
        propertiesLimit: limits.properties,
        unitsUsed: unitsCount,
        unitsLimit,
        usersUsed: usersCount || 0,
        usersLimit: limits.users,
      }
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000, // 1 minute
    // F-133: fail-open soft gate --- keep first-load failures inside query state
    // rather than escalating to the global ErrorBoundary and white-screening.
    throwOnError: false,
  })
}
