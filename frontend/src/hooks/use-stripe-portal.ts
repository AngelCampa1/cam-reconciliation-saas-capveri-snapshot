/**
 * Hook to open Stripe Customer Portal
 *
 * Creates a Stripe Customer Portal session and redirects the user to manage
 * their subscription, payment methods, and billing history.
 */
import { useMutation } from '@tanstack/react-query'
import {
  apiClient,
  createPortalSessionApiV1BillingPortalPost,
} from '../api/client'
import { trackEvent } from '@/lib/analytics'

export function useStripePortal() {
  return useMutation({
    mutationFn: async (returnUrl: string) => {
      const result = await createPortalSessionApiV1BillingPortalPost({
        client: apiClient,
        query: { return_url: returnUrl },
      })

      if (result.error) {
        const errorMessage =
          typeof result.error.detail === 'string'
            ? result.error.detail
            : 'Failed to create portal session'
        throw new Error(errorMessage)
      }

      return result.data
    },
    onSuccess: (data) => {
      // Redirect to Stripe Customer Portal
      if (data?.url) {
        trackEvent('billing_portal_opened')
        window.location.href = data.url
      }
    },
  })
}
