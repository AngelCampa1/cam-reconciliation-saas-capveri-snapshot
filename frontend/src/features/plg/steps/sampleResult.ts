/**
 * Single source of truth for the onboarding sample reconciliation.
 *
 * Consumed by WelcomeSampleStep (the sample-first front door) so the property
 * name, the headline number, and the 3 plain-English findings always agree.
 * Display-only strings (no math), per the onboarding design spec.
 */

export const SAMPLE_PROPERTY_NAME = 'Westview Retail Center'

/** $9,600 + $4,200 + $1,020 = $14,820 (matches SAMPLE_FINDINGS below). */
export const SAMPLE_TOTAL_FOUND_DISPLAY = '$14,820'
export const SAMPLE_TOTAL_LABEL = 'Billing mistakes caught'
export const SAMPLE_RESULT_SEEN_STORAGE_KEY =
  'capveri_onboarding_sample_result_seen'

export function getSampleResultSeenStorageKey(userId?: string | null): string {
  return userId
    ? `${SAMPLE_RESULT_SEEN_STORAGE_KEY}:${userId}`
    : SAMPLE_RESULT_SEEN_STORAGE_KEY
}

export interface SampleFinding {
  id: string
  direction: 'overbill' | 'underbill'
  /** Plain-English headline, no jargon. */
  title: string
  /** Dollar amount for this single finding, display-only. */
  amountDisplay: string
  /** One sentence on why, in the user's words. */
  explanation: string
}

export const SAMPLE_FINDINGS: readonly SampleFinding[] = [
  {
    id: 'roof-repair',
    direction: 'overbill',
    title: 'Roof repair over-billed',
    amountDisplay: '$9,600',
    explanation:
      'The lease spreads this repair over time. One-year billing would overcharge tenants.',
  },
  {
    id: 'empty-space',
    direction: 'underbill',
    title: 'Missed empty space',
    amountDisplay: '$4,200',
    explanation:
      'Vacant space changed each tenant share. The first draft would underbill the building.',
  },
  {
    id: 'late-tax',
    direction: 'underbill',
    title: 'Late tax bill missed',
    amountDisplay: '$1,020',
    explanation: 'The tax bill was missing from the first draft.',
  },
] as const
