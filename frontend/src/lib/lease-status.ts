/**
 * Shared lease status badge variants.
 * Used by LeasesTab (desktop table + mobile card) and LeaseDetailPage so the
 * same lease status renders identically everywhere.
 *
 * Semantic tokens: active leases read as verified (green), drafts as draft
 * (gray), and expired/terminated as archived (muted) — a historical status is
 * not an error, so it must never render in the destructive/red variant.
 */
export type LeaseStatusVariant =
  | 'verified'
  | 'pending'
  | 'draft'
  | 'archived'
  | 'neutral'

export const LEASE_STATUS_VARIANTS: Record<string, LeaseStatusVariant> = {
  active: 'verified', // Green - active lease
  draft: 'draft', // Gray - not finalized
  expired: 'archived', // Muted - historical
  terminated: 'archived', // Muted - ended
}

/**
 * Resolve a lease status to its badge variant, falling back to a neutral
 * variant for unknown or missing statuses.
 */
export function getLeaseStatusVariant(
  status: string | null | undefined
): LeaseStatusVariant {
  if (!status) {
    return 'neutral'
  }
  return LEASE_STATUS_VARIANTS[status] ?? 'neutral'
}
