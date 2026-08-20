/**
 * Trial billing banner state logic.
 *
 * Determines which banner variant to show based on the billing activation data
 * returned by /api/v1/billing/plan-selection.
 */

/**
 * Determines the display variant for the trial billing banner.
 *
 * - "paused"  → trial expired or subscription paused; non-dismissible
 * - "urgent"  → ≤3 days left on trial; prominent, non-dismissible
 * - "early"   → >3 days left on trial; light, dismissible
 * - null      → no banner needed
 */
export function getTrialBannerVariant(
  subscriptionStatus: string | null,
  trialDaysRemaining: number | null,
  hasPausedSubscription: boolean
): 'paused' | 'urgent' | 'early' | null {
  if (
    hasPausedSubscription ||
    subscriptionStatus === 'paused' ||
    subscriptionStatus === 'canceled'
  ) {
    return 'paused'
  }
  if (subscriptionStatus !== 'trialing') {
    return null
  }
  if (trialDaysRemaining === null) {
    return null
  }
  if (trialDaysRemaining <= 3) {
    return 'urgent'
  }
  return 'early'
}
