/**
 * Shared subscription (Stripe billing) status badge variants and labels.
 * Used by the Settings pages (OrganizationPage + Billing) so the same
 * subscription status renders identically everywhere — same color and casing.
 *
 * Mirrors the lib/lease-status.ts SSOT pattern: one place maps a status string
 * to its Badge variant and its human label, instead of each page re-typing the
 * switch/Record.
 */
import type { SubscriptionStatus } from '@/hooks/use-subscription'

/** Badge variants used for subscription statuses. */
export type SubscriptionStatusVariant =
  | 'default'
  | 'success'
  | 'info'
  | 'warning'
  | 'destructive'

const SUBSCRIPTION_STATUS_VARIANTS: Record<
  SubscriptionStatus,
  SubscriptionStatusVariant
> = {
  active: 'success', // Green - paid and current
  trialing: 'info', // Blue - in trial
  past_due: 'warning', // Amber - payment needs attention
  canceled: 'destructive', // Red - subscription ended
  paused: 'destructive', // Red - subscription halted
}

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past Due',
  canceled: 'Canceled',
  paused: 'Paused',
}

/**
 * Resolve a subscription status to its Badge variant, falling back to the
 * neutral `default` variant for unknown or missing statuses.
 */
export function getSubscriptionStatusVariant(
  status: string | null | undefined
): SubscriptionStatusVariant {
  if (!status) {
    return 'default'
  }
  return SUBSCRIPTION_STATUS_VARIANTS[status as SubscriptionStatus] ?? 'default'
}

/**
 * Resolve a subscription status to its human-readable label. Unknown statuses
 * are shown verbatim (as-is) rather than guessed at — we don't know the correct
 * casing for a status we don't recognize.
 */
export function formatSubscriptionStatus(
  status: string | null | undefined
): string {
  if (!status) {
    return ''
  }
  return SUBSCRIPTION_STATUS_LABELS[status as SubscriptionStatus] ?? status
}
