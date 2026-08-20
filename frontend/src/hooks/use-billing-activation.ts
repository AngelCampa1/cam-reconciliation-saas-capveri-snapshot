import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { resolveApiUrl } from '@/api/url'
import { UserRole } from '@/types/enums'

export interface BillingActivation {
  plan_id: string | null
  billing_period: 'annual' | null
  unit_count: number | null
  building_count: number | null
  selected_at: string | null
  checkout_required: boolean
  has_active_access: boolean
  has_paused_subscription: boolean
  subscription_status: string | null
  /**
   * Whole days remaining on a no-card trial.
   * Sourced from /api/v1/billing/plan-selection (backend field trial_days_remaining).
   * Null when the user is not on a trial (active paid sub, canceled, etc.).
   */
  trial_days_remaining: number | null
}

export const billingActivationKeys = {
  all: ['billing-activation'] as const,
  byUser: (userId: string | null | undefined) =>
    [...billingActivationKeys.all, userId ?? 'anonymous'] as const,
}

export function useBillingActivation(enabled = true) {
  const { user, userRole } = useAuth()

  // Tenants have no billing access; the endpoint 403s for them. Only query once
  // the role is known AND is not a tenant. Waiting for the role (rather than
  // just checking `!== TENANT`) also covers the brief null-role window right
  // after a reload, so a tenant who lands on a landlord route never fires a
  // single 403. Backstops the route-based gating in ProtectedRoute / app shell;
  // for landlords the role resolves from a cached query, so this is a no-op.
  const roleKnownNonTenant = userRole != null && userRole !== UserRole.TENANT

  return useQuery<BillingActivation>({
    queryKey: billingActivationKeys.byUser(user?.id),
    enabled: enabled && roleKnownNonTenant,
    staleTime: 0,
    gcTime: 60 * 1000,
    // ProtectedRoute calls this on every non-tenant authenticated route. The
    // global QueryClient default escalates first-load errors (no cached data)
    // to the ErrorBoundary, so a single transient failure here --- an expired
    // token, a clock-skew 401, or any billing API blip --- would white-screen the
    // entire app. The billing gate is a soft redirect (paused subscriptions -��
    // /settings/billing); failing open on error is correct. Consumers already
    // guard with optional chaining on the (possibly undefined) result.
    throwOnError: false,
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        return {
          plan_id: null,
          billing_period: null,
          unit_count: null,
          building_count: null,
          selected_at: null,
          checkout_required: true,
          has_active_access: false,
          has_paused_subscription: false,
          subscription_status: null,
          trial_days_remaining: null,
        } satisfies BillingActivation
      }

      const response = await fetch(
        resolveApiUrl('/api/v1/billing/plan-selection'),
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error('Failed to load billing activation')
      }

      return (await response.json()) as BillingActivation
    },
  })
}
