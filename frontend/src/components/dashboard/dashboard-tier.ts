import type { Subscription } from '@/hooks/use-subscription'

export type DashboardTier = 'free' | 'paid'

export interface DashboardHeroContent {
  title: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
}

export function resolveDashboardTier(
  subscription: Subscription | null | undefined
): DashboardTier {
  if (!subscription) {
    return 'free'
  }

  return 'paid'
}

export function getDashboardHeroContent(
  tier: DashboardTier
): DashboardHeroContent {
  switch (tier) {
    case 'free':
      return {
        title: 'Welcome to CapVeri',
        subtitle:
          'Try it free for 30 days. Run your first reconciliation today.',
        ctaLabel: 'Start free trial',
        ctaHref: '/pricing',
      }
    case 'paid':
      return {
        title: 'Your reconciliation workflow',
        subtitle:
          'Upload GL data, run reconciliations, and export tenant statements.',
        ctaLabel: 'Run reconciliation',
        ctaHref: '/reconciliations',
      }
  }
}
