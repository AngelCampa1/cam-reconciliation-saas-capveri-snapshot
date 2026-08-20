/**
 * Shared campaign status labels, badge variants, and display config.
 * Used by PortfolioPipelinePage and ReconciliationPage.
 */
import { CampaignStatus } from '@/types/enums'

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  [CampaignStatus.DRAFT]: 'Draft',
  [CampaignStatus.FINALIZED]: 'Finalized',
  [CampaignStatus.IN_REVIEW]: 'In Review',
  [CampaignStatus.APPROVED]: 'Approved',
  [CampaignStatus.SENT]: 'Sent',
}

export const CAMPAIGN_STATUS_VARIANTS: Record<
  CampaignStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  [CampaignStatus.DRAFT]: 'secondary',
  [CampaignStatus.FINALIZED]: 'outline',
  [CampaignStatus.IN_REVIEW]: 'default',
  [CampaignStatus.APPROVED]: 'default',
  [CampaignStatus.SENT]: 'default',
}

/**
 * Order of statuses for display (left to right in pipeline view).
 */
export const CAMPAIGN_STATUS_ORDER: CampaignStatus[] = [
  CampaignStatus.DRAFT,
  CampaignStatus.FINALIZED,
  CampaignStatus.IN_REVIEW,
  CampaignStatus.APPROVED,
  CampaignStatus.SENT,
]
